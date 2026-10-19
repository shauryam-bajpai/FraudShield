import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from features import (
    CATEGORICAL_FEATURES,
    FEATURE_COLUMNS,
    NUMERIC_FEATURES,
)
try:
    from validation import save_validation_predictions
except ImportError:
    from training.validation import save_validation_predictions


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "processed"
ARTIFACT_DIR = ROOT / "ml-service" / "artifacts"


def create_model():
    numeric_pipeline = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )

    preprocessor = ColumnTransformer(
        [
            ("numeric", numeric_pipeline, NUMERIC_FEATURES),
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore"),
                CATEGORICAL_FEATURES,
            ),
        ]
    )

    return Pipeline(
        [
            ("preprocessor", preprocessor),
            (
                "classifier",
                LogisticRegression(
                    max_iter=1000,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ]
    )


def evaluate(labels, probabilities, threshold):
    predictions = (probabilities >= threshold).astype(int)

    tn, fp, fn, tp = confusion_matrix(
        labels,
        predictions,
        labels=[0, 1],
    ).ravel()

    return {
        "pr_auc": float(
            average_precision_score(labels, probabilities)
        ),
        "roc_auc": float(roc_auc_score(labels, probabilities)),
        "precision": float(
            precision_score(labels, predictions, zero_division=0)
        ),
        "recall": float(
            recall_score(labels, predictions, zero_division=0)
        ),
        "f1": float(
            f1_score(labels, predictions, zero_division=0)
        ),
        "threshold": float(threshold),
        "confusion_matrix": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
    }


def main():
    train = pd.read_csv(DATA_DIR / "train.csv")
    validation = pd.read_csv(DATA_DIR / "val.csv")
    test = pd.read_csv(DATA_DIR / "test.csv")

    model = create_model()
    model.fit(train[FEATURE_COLUMNS], train["is_fraud"])

    validation_probabilities = model.predict_proba(
        validation[FEATURE_COLUMNS]
    )[:, 1]

    # Choose the threshold using validation data, never test data.
    candidate_thresholds = np.linspace(0.05, 0.95, 91)

    threshold = max(
        candidate_thresholds,
        key=lambda value: f1_score(
            validation["is_fraud"],
            validation_probabilities >= value,
            zero_division=0,
        ),
    )

    test_probabilities = model.predict_proba(
        test[FEATURE_COLUMNS]
    )[:, 1]

    report = {
        "model": "logistic_regression",
        "data_source": "synthetic_demo",
        "note": "Synthetic results do not measure real-world fraud performance.",
        "validation": evaluate(
            validation["is_fraud"],
            validation_probabilities,
            threshold,
        ),
        "test": evaluate(
            test["is_fraud"],
            test_probabilities,
            threshold,
        ),
    }
    save_validation_predictions(
        model_name="logistic_regression",
        transaction_ids=validation["transaction_id"],
        labels=validation["is_fraud"],
        scores=validation_probabilities,
        path=ARTIFACT_DIR / "validation_predictions.csv",
    )

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump(
        model,
        ARTIFACT_DIR / "logistic_regression.joblib",
    )

    (ARTIFACT_DIR / "logistic_regression_metrics.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )

    print(
        "Validation PR-AUC:",
        round(report["validation"]["pr_auc"], 4),
    )
    print(
        "Test PR-AUC:",
        round(report["test"]["pr_auc"], 4),
    )
    print("Selected threshold:", round(float(threshold), 2))


if __name__ == "__main__":
    main()
