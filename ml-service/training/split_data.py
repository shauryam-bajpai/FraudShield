from pathlib import Path

import pandas as pd

from features import build_features


ROOT = Path(__file__).resolve().parents[2]

INPUT_FILE = ROOT / "data" / "raw" / "demo_transactions.csv"
OUTPUT_DIR = ROOT / "data" / "processed"


def split_chronologically(frame: pd.DataFrame):
    prepared = build_features(frame)

    total = len(prepared)

    if total < 20:
        raise ValueError("At least 20 transactions are required")

    train_end = int(total * 0.70)
    validation_end = int(total * 0.85)

    # Keep all transactions with the same timestamp in one split.
    while (
        train_end < total
        and prepared.loc[train_end - 1, "timestamp"]
        == prepared.loc[train_end, "timestamp"]
    ):
        train_end += 1

    while (
        validation_end < total
        and prepared.loc[validation_end - 1, "timestamp"]
        == prepared.loc[validation_end, "timestamp"]
    ):
        validation_end += 1

    if not 0 < train_end < validation_end < total:
        raise ValueError("Not enough distinct timestamps for three splits")

    return {
        "train": prepared.iloc[:train_end].copy(),
        "val": prepared.iloc[train_end:validation_end].copy(),
        "test": prepared.iloc[validation_end:].copy(),
    }


def main():
    frame = pd.read_csv(INPUT_FILE)

    if "is_fraud" not in frame.columns:
        raise ValueError("Training data needs an is_fraud label")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for name, split in split_chronologically(frame).items():
        output = OUTPUT_DIR / f"{name}.csv"
        split.to_csv(output, index=False)

        print(
            f"{name}: {len(split)} rows, "
            f"fraud rate {split['is_fraud'].mean():.2%}"
        )


if __name__ == "__main__":
    main()