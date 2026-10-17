import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException


router = APIRouter(tags=["model-insights"])

ARTIFACT_DIR = Path(__file__).resolve().parents[2] / "artifacts"


@router.get("/insights")
def get_model_insights():
    comparison_file = ARTIFACT_DIR / "comparison.json"

    if not comparison_file.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                "Model comparison is unavailable. Run "
                "training/evaluate_models.py first."
            ),
        )

    comparison = json.loads(
        comparison_file.read_text(encoding="utf-8")
    )

    return {
        "active_model": os.getenv(
            "ACTIVE_MODEL",
            "logistic_regression",
        ),
        "recommended_model": comparison["recommended_model"],
        "selection_metric": comparison["selection_metric"],
        "data_source": comparison["data_source"],
        "models": comparison["models"],
    }