from uuid import UUID

import pandas as pd
from fastapi import APIRouter, HTTPException, Request
from langgraph.types import Command
from pydantic import BaseModel, Field

from app.api.models import TransactionInput
from app.workflow.graph import build_investigation_graph


router = APIRouter(tags=["investigations"])


class StartInvestigation(BaseModel):
    case_id: UUID
    transaction: TransactionInput
    previous_transactions: list[TransactionInput] = Field(
        default_factory=list,
        max_length=1000,
    )
    risk_score: float = Field(ge=0, le=1)
    threshold: float = Field(ge=0, le=1)


class ResumeInvestigation(BaseModel):
    case_id: UUID
    decision_id: UUID
    decision: str = Field(pattern="^(fraud|legitimate)$")
    analyst_id: UUID
    notes: str = Field(default="", max_length=2000)


def get_investigation_graph(app):
    graph = getattr(app.state, "investigation_graph", None)
    if graph is None:
        from langgraph.checkpoint.memory import MemorySaver
        graph = build_investigation_graph(MemorySaver())
        app.state.investigation_graph = graph
    return graph


def thread_config(case_id: UUID) -> dict:
    return {
        "configurable": {
            "thread_id": f"case_{case_id}",
        }
    }


def result_from_state(state: dict) -> dict:
    return {
        "case_id": state["case_id"],
        "transaction_id": state["transaction_id"],
        "status": state["status"],
        "priority": state["priority"],
        "signals": state["signals"],
        "evidence": state["evidence"],
        "decision": state.get("decision"),
        "decision_id": state.get("decision_id"),
        "analyst_id": state.get("analyst_id"),
        "notes": state.get("notes"),
        "summary": state.get("summary"),
    }


@router.post("/workflow/start")
def start_investigation(
    body: StartInvestigation,
    request: Request,
):
    graph = get_investigation_graph(request.app)
    config = thread_config(body.case_id)

    existing = graph.get_state(config)

    if existing.values:
        if (
            existing.values.get("transaction_id")
            != body.transaction.transaction_id
        ):
            raise HTTPException(
                status_code=409,
                detail="Case ID belongs to another transaction",
            )

        return result_from_state(existing.values)

    current = body.transaction.model_dump(mode="json")
    history = [
        item.model_dump(mode="json")
        for item in body.previous_transactions
    ]

    current_time = pd.to_datetime(
        current["timestamp"],
        utc=True,
    )

    for item in history:
        if item["card_id"] != current["card_id"]:
            raise HTTPException(
                status_code=422,
                detail="History contains a different card",
            )

        if pd.to_datetime(
            item["timestamp"],
            utc=True,
        ) >= current_time:
            raise HTTPException(
                status_code=422,
                detail="History must precede the transaction",
            )

    graph.invoke(
        {
            "case_id": str(body.case_id),
            "transaction_id": current["transaction_id"],
            "transaction": current,
            "previous_transactions": history,
            "risk_score": body.risk_score,
            "threshold": body.threshold,
        },
        config,
    )

    snapshot = graph.get_state(config)

    if "human_review" not in snapshot.next:
        raise HTTPException(
            status_code=500,
            detail="Investigation did not pause for review",
        )

    return result_from_state(snapshot.values)


@router.post("/workflow/resume")
def resume_investigation(
    body: ResumeInvestigation,
    request: Request,
):
    graph = get_investigation_graph(request.app)
    config = thread_config(body.case_id)
    snapshot = graph.get_state(config)

    if not snapshot.values:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found",
        )

    if snapshot.values.get("status") == "resolved":
        if snapshot.values.get("decision_id") != str(body.decision_id):
            raise HTTPException(
                status_code=409,
                detail="Case was resolved with another decision ID",
            )

        return result_from_state(snapshot.values)

    if "human_review" not in snapshot.next:
        raise HTTPException(
            status_code=409,
            detail="Investigation is not awaiting review",
        )

    graph.invoke(
        Command(
            resume={
                "decision": body.decision,
                "decision_id": str(body.decision_id),
                "analyst_id": str(body.analyst_id),
                "notes": body.notes,
            }
        ),
        config,
    )

    completed = graph.get_state(config)

    if completed.values.get("status") != "resolved":
        raise HTTPException(
            status_code=500,
            detail="Investigation did not complete",
        )

    return result_from_state(completed.values)
