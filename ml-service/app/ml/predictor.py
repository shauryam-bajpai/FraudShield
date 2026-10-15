import pandas as pd

from training.features import FEATURE_COLUMNS, build_features

from .model_loader import load_active_model


def predict_transaction(
    transaction: dict,
    previous_transactions: list[dict],
) -> dict:
    transaction_id = transaction["transaction_id"]
    card_id = transaction["card_id"]

    current_time = pd.to_datetime(
        transaction["timestamp"],
        utc=True,
    )

    for previous in previous_transactions:
        if previous["card_id"] != card_id:
            raise ValueError(
                "History must contain only this card's transactions"
            )

        previous_time = pd.to_datetime(
            previous["timestamp"],
            utc=True,
        )

        if previous_time >= current_time:
            raise ValueError(
                "History must contain only earlier transactions"
            )

    rows = previous_transactions + [transaction]
    prepared = build_features(pd.DataFrame(rows))

    current_row = prepared.loc[
        prepared["transaction_id"] == transaction_id,
        FEATURE_COLUMNS,
    ]

    if len(current_row) != 1:
        raise ValueError("Could not uniquely identify the new transaction")

    active = load_active_model()

    risk_score = float(
        active["model"].predict_proba(current_row)[0, 1]
    )

    return {
        "transaction_id": transaction_id,
        "model": active["name"],
        "risk_score": risk_score,
        "threshold": active["threshold"],
        "flagged_for_review": risk_score >= active["threshold"],
    }