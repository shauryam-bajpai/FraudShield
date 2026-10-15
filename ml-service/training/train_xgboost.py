import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import f1_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

from features import (
    CATEGORICAL_FEATURES,
    FEATURE_COLUMNS,
    NUMERIC_FEATURES,
)
from train_baseline import evaluate


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "processed"
ARTIFACT_DIR = ROOT / "ml-service" / "artifacts"


def create_model(positive_weight: float):
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
                XGBClassifier(
                    n_estimators=160,
                    max_depth=4,
                    learning_rate=0.07,
                    subsample=0.85,
                    colsample_bytree=0.85,
                    scale_pos_weight=positive_weight,
                    tree_method="hist",
                    eval_metric="logloss",
                    random_state=42,
                ),
            ),
        ]
    )


def main():
    train = pd.read_csv(DATA_DIR / "train.csv")
    validation = pd.read_csv(DATA_DIR / "val.csv")
    test = pd.read_csv(DATA_DIR / "test.csv")

    positive_count = int(train["is_fraud"].sum())
    negative_count = len(train) - positive_count

    if positive_count == 0 or negative_count == 0:
        raise ValueError("Training data must contain both classes")

    positive_weight = negative_count / positive_count

    model = create_model(positive_weight)
    model.fit(train[FEATURE_COLUMNS], train["is_fraud"])

    validation_probabilities = model.predict_proba(
        validation[FEATURE_COLUMNS]
    )[:, 1]

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
        "model": "xgboost",
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

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump(model, ARTIFACT_DIR / "xgboost.joblib")

    (ARTIFACT_DIR / "xgboost_metrics.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )

    print("Validation PR-AUC:", round(report["validation"]["pr_auc"], 4))
    print("Test PR-AUC:", round(report["test"]["pr_auc"], 4))
    print("Selected threshold:", round(float(threshold), 2))


if __name__ == "__main__":
    main()