import argparse
from pathlib import Path

import numpy as np
import pandas as pd


CATEGORIES = ["groceries", "electronics", "travel", "fuel", "dining"]
COUNTRIES = ["IN", "US", "GB", "SG"]


def generate_transactions(rows: int, cards: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    card_numbers = rng.integers(0, cards, size=rows)
    home_countries = rng.choice(COUNTRIES, size=cards)
    categories = rng.choice(CATEGORIES, size=rows)

    timestamps = (
        pd.Timestamp("2024-01-01", tz="UTC")
        + pd.to_timedelta(rng.uniform(0, 180 * 24 * 60, rows), unit="m")
    )

    amounts = rng.lognormal(mean=3.4, sigma=1.05, size=rows).round(2)
    transaction_countries = []

    for card_number in card_numbers:
        if rng.random() < 0.1:
            transaction_countries.append(rng.choice(COUNTRIES))
        else:
            transaction_countries.append(home_countries[card_number])

    frame = pd.DataFrame(
        {
            "transaction_id": [f"demo_tx_{i:07d}" for i in range(rows)],
            "card_id": [f"demo_card_{i:05d}" for i in card_numbers],
            "timestamp": timestamps,
            "amount": amounts,
            "merchant_category": categories,
            "country": transaction_countries,
            "home_country": home_countries[card_numbers],
        }
    )

    # Synthetic labels make the application testable. They are not real fraud data.
    foreign = frame["country"] != frame["home_country"]
    unusual_hour = frame["timestamp"].dt.hour < 5

    logit = (
        -4.7
        + 1.2 * (frame["amount"] > 120)
        + 1.3 * foreign
        + 0.6 * unusual_hour
        + 0.7 * (frame["merchant_category"] == "electronics")
    )

    fraud_probability = 1 / (1 + np.exp(-logit))
    frame["is_fraud"] = (rng.random(rows) < fraud_probability).astype(int)

    return frame.sort_values("timestamp").reset_index(drop=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=30_000)
    parser.add_argument("--cards", type=int, default=250)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/raw/demo_transactions.csv"),
    )
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    data = generate_transactions(args.rows, args.cards, seed=42)
    data.to_csv(args.output, index=False)

    print(f"Created {len(data)} transactions")
    print(f"Fraud rate: {data['is_fraud'].mean():.2%}")
    print(f"Saved to: {args.output}")