from collections import defaultdict, deque

import numpy as np
import pandas as pd


NUMERIC_FEATURES = [
    "amount",
    "hour",
    "is_foreign",
    "card_count_24h",
    "card_mean_amount_7d",
    "amount_to_mean_7d",
    "minutes_since_last",
]

CATEGORICAL_FEATURES = [
    "merchant_category",
    "country",
]

FEATURE_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES

REQUIRED_COLUMNS = {
    "transaction_id",
    "card_id",
    "timestamp",
    "amount",
    "merchant_category",
    "country",
    "home_country",
}


def build_features(transactions: pd.DataFrame) -> pd.DataFrame:
    missing = REQUIRED_COLUMNS - set(transactions.columns)

    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")

    if transactions.empty:
        raise ValueError("At least one transaction is required")

    columns_with_missing_values = sorted(
        column
        for column in REQUIRED_COLUMNS
        if transactions[column].isna().any()
    )

    if columns_with_missing_values:
        raise ValueError(
            "Required columns contain missing values: "
            f"{columns_with_missing_values}"
        )

    if transactions["transaction_id"].duplicated().any():
        raise ValueError("transaction_id values must be unique")

    frame = transactions.copy()

    frame["timestamp"] = pd.to_datetime(
        frame["timestamp"],
        utc=True,
        errors="raise",
    )

    frame["amount"] = pd.to_numeric(
        frame["amount"],
        errors="raise",
    )

    if not np.isfinite(frame["amount"]).all() or (frame["amount"] < 0).any():
        raise ValueError("amount must be a finite nonnegative number")

    frame = frame.sort_values(
        ["timestamp", "transaction_id"],
        kind="stable",
    ).reset_index(drop=True)

    one_day = pd.Timedelta(days=1)
    seven_days = pd.Timedelta(days=7)

    # For each card, store (timestamp, amount) from past transactions.
    history = defaultdict(deque)
    last_transaction_time = {}

    feature_rows = []

    for timestamp, group in frame.groupby("timestamp", sort=False):
        pending_updates = []

        for transaction in group.itertuples(index=False):
            card_id = transaction.card_id
            previous = history[card_id]

            # Remove transactions outside the seven-day window.
            while previous and timestamp - previous[0][0] >= seven_days:
                previous.popleft()

            amounts_7d = [amount for _, amount in previous]

            count_24h = sum(
                timestamp - previous_timestamp < one_day
                for previous_timestamp, _ in previous
            )

            mean_7d = (
                sum(amounts_7d) / len(amounts_7d)
                if amounts_7d
                else 0.0
            )

            last_seen = last_transaction_time.get(card_id)

            minutes_since_last = (
                (timestamp - last_seen).total_seconds() / 60
                if last_seen is not None
                else 10_080.0
            )

            feature_rows.append(
                {
                    "amount": float(transaction.amount),
                    "hour": timestamp.hour,
                    "is_foreign": int(
                        transaction.country != transaction.home_country
                    ),
                    "card_count_24h": count_24h,
                    "card_mean_amount_7d": mean_7d,
                    "amount_to_mean_7d": (
                        float(transaction.amount) / mean_7d
                        if mean_7d > 0
                        else 1.0
                    ),
                    "minutes_since_last": min(
                        minutes_since_last,
                        10_080.0,
                    ),
                    "merchant_category": transaction.merchant_category,
                    "country": transaction.country,
                }
            )

            pending_updates.append(
                (card_id, float(transaction.amount))
            )

        # Update history only after every transaction at this timestamp
        # has received its features.
        for card_id, amount in pending_updates:
            history[card_id].append((timestamp, amount))
            last_transaction_time[card_id] = timestamp

    features = pd.DataFrame(feature_rows)

    for column in FEATURE_COLUMNS:
        frame[column] = features[column]

    return frame
