import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["model-insights"])

REPORT_PATH = Path(__file__).resolve().parents[2] / "artifacts" / "threshold_report.json"


@router.get("/insights")
def get_model_insights():
    if not REPORT_PATH.is_file():
        raise HTTPException(
            status_code=503,
            detail=(
                "Validation report is unavailable. Export validation "
                "predictions and run training/build_threshold_report.py."
            ),
        )

    try:
        return json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500,
            detail="Validation report could not be read.",
        ) from exc
