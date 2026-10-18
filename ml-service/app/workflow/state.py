from typing import Literal, TypedDict


class InvestigationState(TypedDict, total=False):
    case_id: str
    transaction_id: str
    transaction: dict
    previous_transactions: list[dict]
    risk_score: float
    threshold: float

    evidence: dict
    signals: list[str]
    priority: Literal["low", "medium", "high"]

    status: Literal["pending_review", "resolved"]
    decision: Literal["fraud", "legitimate"]
    decision_id: str
    analyst_id: str
    notes: str
    summary: str