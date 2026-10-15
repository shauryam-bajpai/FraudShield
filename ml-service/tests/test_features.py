import sys
import unittest
from pathlib import Path

import pandas as pd


ML_SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_SERVICE_DIR))

from training.features import build_features  # noqa: E402


class FeatureTests(unittest.TestCase):
    def test_only_earlier_transactions_are_visible(self):
        transactions = pd.DataFrame(
            [
                {
                    "transaction_id": "tx_1",
                    "card_id": "card_1",
                    "timestamp": "2024-01-01T10:00:00Z",
                    "amount": 10,
                    "merchant_category": "groceries",
                    "country": "IN",
                    "home_country": "IN",
                },
                {
                    "transaction_id": "tx_2",
                    "card_id": "card_1",
                    "timestamp": "2024-01-01T11:00:00Z",
                    "amount": 20,
                    "merchant_category": "fuel",
                    "country": "IN",
                    "home_country": "IN",
                },
                {
                    "transaction_id": "tx_3",
                    "card_id": "card_1",
                    "timestamp": "2024-01-01T11:00:00Z",
                    "amount": 40,
                    "merchant_category": "travel",
                    "country": "SG",
                    "home_country": "IN",
                },
            ]
        )

        result = build_features(transactions).set_index(
            "transaction_id"
        )

        self.assertEqual(result.loc["tx_1", "card_count_24h"], 0)
        self.assertEqual(result.loc["tx_2", "card_count_24h"], 1)
        self.assertEqual(result.loc["tx_3", "card_count_24h"], 1)

        self.assertEqual(
            result.loc["tx_2", "card_mean_amount_7d"],
            10,
        )
        self.assertEqual(
            result.loc["tx_3", "card_mean_amount_7d"],
            10,
        )

    def test_future_transaction_does_not_change_past_features(self):
        base = pd.DataFrame(
            [
                {
                    "transaction_id": "old",
                    "card_id": "card_1",
                    "timestamp": "2024-01-01T10:00:00Z",
                    "amount": 25,
                    "merchant_category": "fuel",
                    "country": "IN",
                    "home_country": "IN",
                }
            ]
        )

        future = base.copy()
        future.loc[1] = {
            "transaction_id": "future",
            "card_id": "card_1",
            "timestamp": "2024-01-03T10:00:00Z",
            "amount": 1000,
            "merchant_category": "travel",
            "country": "US",
            "home_country": "IN",
        }

        original = build_features(base).iloc[0]
        after_adding_future = build_features(future).iloc[0]

        self.assertEqual(
            original["card_count_24h"],
            after_adding_future["card_count_24h"],
        )
        self.assertEqual(
            original["card_mean_amount_7d"],
            after_adding_future["card_mean_amount_7d"],
        )


if __name__ == "__main__":
    unittest.main()