import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = ROOT / "ml-service" / "artifacts"

MODEL_NAMES = ["logistic_regression", "xgboost"]


def main():
    reports = []

    for name in MODEL_NAMES:
        path = ARTIFACT_DIR / f"{name}_metrics.json"

        if path.exists():
            reports.append(
                json.loads(path.read_text(encoding="utf-8"))
            )

    if not reports:
        raise FileNotFoundError(
            "Train at least one model before comparing results"
        )

    winner = max(
        reports,
        key=lambda report: report["validation"]["pr_auc"],
    )

    comparison = {
        "selection_metric": "validation_pr_auc",
        "recommended_model": winner["model"],
        "data_source": winner["data_source"],
        "models": {
            report["model"]: {
                "validation": report["validation"],
                "test": report["test"],
            }
            for report in reports
        },
    }

    output = ARTIFACT_DIR / "comparison.json"
    output.write_text(
        json.dumps(comparison, indent=2),
        encoding="utf-8",
    )

    for report in reports:
        print(
            f"{report['model']}: "
            f"validation PR-AUC={report['validation']['pr_auc']:.4f}, "
            f"test PR-AUC={report['test']['pr_auc']:.4f}"
        )

    print("Recommended model:", winner["model"])


if __name__ == "__main__":
    main()