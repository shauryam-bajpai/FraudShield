from fastapi import FastAPI

from app.api import health, insights, score


app = FastAPI(
    title="FraudShield ML Service",
    version="0.1.0",
    description="Internal API for transaction scoring and model insights.",
)

app.include_router(
    health.router,
    prefix="/api/ml",
)

app.include_router(
    score.router,
    prefix="/api/ml",
)

app.include_router(
    insights.router,
    prefix="/api/ml",
)