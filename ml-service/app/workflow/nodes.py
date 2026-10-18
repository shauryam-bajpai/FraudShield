import pandas as pd
from langgraph.types import interrupt

from training.features import build_features

from app.workflow.state import InvestigationState


def gather_evidence(state: InvestigationState) -> dict:
    rows = state["previous_transactions"] + [
        state["transaction"]
    ]

    prepared = build_features(pd.DataFrame(rows))

    current = prepared.loc[
        prepared["transaction_id"] == state["transaction_id"]
    ]

    if len(current) != 1:
        raise ValueError("Investigation transaction was not found")

    row = current.iloc[0]

    return {
        "evidence": {
            "amount": float(row["amount"]),
            "hour": int(row["hour"]),
            "is_foreign": bool(row["is_foreign"]),
            "card_count_24h": int(row["card_count_24h"]),
            "card_mean_amount_7d": float(
                row["card_mean_amount_7d"]
            ),
            "amount_to_mean_7d": float(
                row["amount_to_mean_7d"]
            ),
            "minutes_since_last": float(
                row["minutes_since_last"]
            ),
        }
    }


def apply_rules(state: InvestigationState) -> dict:
    evidence = state["evidence"]
    signals = []

    if evidence["is_foreign"]:
        signals.append("Transaction occurred outside the home country")

    if evidence["card_count_24h"] >= 5:
        signals.append("At least five earlier card transactions in 24 hours")

    if (
        evidence["card_mean_amount_7d"] > 0
        and evidence["amount_to_mean_7d"] >= 5
    ):
        signals.append("Amount is at least five times the recent card mean")

    if evidence["hour"] < 5:
        signals.append("Transaction occurred between midnight and 5 a.m. UTC")

    return {"signals": signals}


def prepare_case(state: InvestigationState) -> dict:
    high_priority = (
        state["risk_score"] >= 0.85
        or len(state["signals"]) >= 2
    )

    return {
        "priority": "high" if high_priority else "medium",
        "status": "pending_review",
    }


def human_review(state: InvestigationState) -> dict:
    # No database writes before interrupt: this node runs again on resume.
    response = interrupt(
        {
            "case_id": state["case_id"],
            "transaction_id": state["transaction_id"],
            "risk_score": state["risk_score"],
            "priority": state["priority"],
            "signals": state["signals"],
            "evidence": state["evidence"],
        }
    )

    return {
        "decision": response["decision"],
        "decision_id": response["decision_id"],
        "analyst_id": response["analyst_id"],
        "notes": response["notes"],
    }


def finalize(state: InvestigationState) -> dict:
    decision_text = (
        "fraudulent"
        if state["decision"] == "fraud"
        else "legitimate"
    )

    summary = (
        f"Analyst marked transaction {state['transaction_id']} "
        f"as {decision_text}. "
        f"Investigation recorded {len(state['signals'])} "
        "rule signal(s)."
    )

    return {
        "status": "resolved",
        "summary": summary,
    }
