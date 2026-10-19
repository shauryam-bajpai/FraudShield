import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score


THRESHOLDS = np.round(np.arange(0.05, 1.00, 0.05), 2)


def metrics_at_threshold(labels, scores, threshold):
    predicted = scores >= threshold

    tp = int(np.sum(predicted & (labels == 1)))
    fp = int(np.sum(predicted & (labels == 0)))
    tn = int(np.sum(~predicted & (labels == 0)))
    fn = int(np.sum(~predicted & (labels == 1)))

    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision + recall
        else 0.0
    )

    return {
        "threshold": float(threshold),
        "true_positives": tp,
        "false_positives": fp,
        "true_negatives": tn,
        "false_negatives": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


def build_report(input_path: Path) -> dict:
    frame = pd.read_csv(input_path, dtype={"transaction_id": str})

    required = {
        "model_name",
        "split",
        "transaction_id",
        "label",
        "score",
    }
    missing = required - set(frame.columns)

    if missing:
        raise ValueError(f"Missing CSV columns: {sorted(missing)}")

    frame = frame.loc[frame["split"] == "validation"].copy()

    if frame.empty or frame[list(required)].isna().any().any():
        raise ValueError("Validation predictions are missing or incomplete")

    if not frame["label"].isin([0, 1]).all():
        raise ValueError("Labels must be 0 or 1")

    if not frame["score"].between(0, 1).all():
        raise ValueError("Scores must be between 0 and 1")

    models = []
    reference_labels = None

    for name, group in frame.groupby("model_name", sort=True):
        if group["transaction_id"].duplicated().any():
            raise ValueError(f"{name}: duplicate transaction IDs")

        ordered = group.sort_values("transaction_id")
        labeled_ids = ordered.set_index("transaction_id")["label"]

        if reference_labels is None:
            reference_labels = labeled_ids
        elif not reference_labels.equals(labeled_ids):
            raise ValueError(
                f"{name}: models were evaluated on different "
                "validation rows or labels"
            )

        labels = ordered["label"].to_numpy(dtype=int)
        scores = ordered["score"].to_numpy(dtype=float)

        if len(np.unique(labels)) != 2:
            raise ValueError(
                f"{name}: validation set must contain both classes"
            )

        rows = [
            metrics_at_threshold(labels, scores, threshold)
            for threshold in THRESHOLDS
        ]
        best = max(rows, key=lambda row: row["f1"])

        models.append(
            {
                "name": str(name),
                "sample_count": len(labels),
                "fraud_count": int(labels.sum()),
                "pr_auc": round(
                    float(average_precision_score(labels, scores)), 4
                ),
                "roc_auc": round(
                    float(roc_auc_score(labels, scores)), 4
                ),
                "best_f1_threshold": best["threshold"],
                "thresholds": rows,
            }
        )

    return {"split": "validation", "models": models}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "predictions_csv",
        nargs="?",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "artifacts" / "validation_predictions.csv",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "artifacts" / "threshold_report.json",
    )
    args = parser.parse_args()

    report = build_report(args.predictions_csv)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )

    print(
        f"Saved validation report for "
        f"{len(report['models'])} model(s): {args.output}"
    )


if __name__ == "__main__":
    main()
