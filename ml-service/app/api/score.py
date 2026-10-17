from fastapi import APIRouter, HTTPException

from app.api.models import ScoreRequest, ScoreResponse
from app.ml.model_loader import ModelConfigurationError
from app.ml.predictor import predict_transaction


router = APIRouter(tags=["scoring"])


@router.post("/score", response_model=ScoreResponse)
def score_transaction(request: ScoreRequest):
    transaction = request.transaction.model_dump(mode="json")

    previous_transactions = [
        item.model_dump(mode="json")
        for item in request.previous_transactions
    ]

    try:
        return predict_transaction(
            transaction,
            previous_transactions,
        )
    except (FileNotFoundError, ModelConfigurationError) as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc
