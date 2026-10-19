from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PATH = ROOT / "artifacts" / "validation_predictions.csv"


def save_validation_predictions(
    *,
    model_name: str,
    transaction_ids,
    labels,
    scores,
    path: Path = DEFAULT_PATH,
) -> None:
    """Save one model's predictions on the chronological validation split."""

    ids = np.asarray(transaction_ids).reshape(-1)
    y = np.asarray(labels).reshape(-1)
    probabilities = np.asarray(scores).reshape(-1)

    if not (len(ids) == len(y) == len(probabilities)):
        raise ValueError("IDs, labels, and scores must have the same length")

    if len(ids) == 0 or len(np.unique(ids)) != len(ids):
        raise ValueError("Validation transaction IDs must be present and unique")

    if not np.isin(y, [0, 1]).all():
        raise ValueError("Labels must be 0 or 1")

    if not np.isfinite(probabilities).all():
        raise ValueError("Scores must be finite")

    if ((probabilities < 0) | (probabilities > 1)).any():
        raise ValueError("Scores must be probabilities between 0 and 1")

    current = pd.DataFrame(
        {
            "model_name": model_name,
            "split": "validation",
            "transaction_id": ids.astype(str),
            "label": y.astype(int),
            "score": probabilities.astype(float),
        }
    )

    path.parent.mkdir(parents=True, exist_ok=True)

    if path.exists():
        previous = pd.read_csv(path, dtype={"transaction_id": str})

        required = set(current.columns)
        if not required.issubset(previous.columns):
            raise ValueError(
                "Existing prediction CSV has an older format. "
                "Remove it and regenerate predictions for all models."
            )

        previous = previous.loc[
            previous["model_name"] != model_name,
            list(current.columns),
        ]

        if not previous.empty:
            expected = (
                previous.loc[
                    previous["model_name"] == previous["model_name"].iloc[0],
                    ["transaction_id", "label"],
                ]
                .set_index("transaction_id")["label"]
                .sort_index()
            )
            actual = current.set_index("transaction_id")["label"].sort_index()

            if not expected.equals(actual):
                raise ValueError(
                    "Models must use the same validation transactions "
                    "with the same labels. Regenerate all predictions "
                    "from one chronological split."
                )

        current = pd.concat([previous, current], ignore_index=True)

    temporary = path.with_suffix(".tmp")
    current.to_csv(temporary, index=False)
    temporary.replace(path)

    print(f"Saved {len(ids)} validation predictions for {model_name}")
