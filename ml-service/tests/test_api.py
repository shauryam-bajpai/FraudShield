import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient
from pydantic import ValidationError


ML_SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_SERVICE_DIR))

from app.api.models import TransactionInput  # noqa: E402
from app.main import app  # noqa: E402
from app.ml.model_loader import ModelConfigurationError  # noqa: E402


class PredictableModel:
    def predict_proba(self, rows):
        return np.array([[0.2, 0.8] for _ in range(len(rows))])


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.transaction = {
            "transaction_id": "tx_new",
            "card_id": "card_1",
            "timestamp": "2024-01-02T10:00:00Z",
            "amount": 125.0,
            "merchant_category": "electronics",
            "country": "US",
            "home_country": "IN",
        }

    def test_health_endpoint(self):
        response = self.client.get("/api/ml/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    @patch("app.ml.predictor.load_active_model")
    def test_score_endpoint_uses_previous_transactions(self, load_model):
        load_model.return_value = {
            "name": "test_model",
            "model": PredictableModel(),
            "threshold": 0.7,
        }
        previous = {
            **self.transaction,
            "transaction_id": "tx_old",
            "timestamp": "2024-01-01T10:00:00Z",
            "amount": 25.0,
        }

        response = self.client.post(
            "/api/ml/score",
            json={
                "transaction": self.transaction,
                "previous_transactions": [previous],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "transaction_id": "tx_new",
                "model": "test_model",
                "risk_score": 0.8,
                "threshold": 0.7,
                "flagged_for_review": True,
            },
        )

    def test_empty_card_id_is_rejected(self):
        with self.assertRaises(ValidationError):
            TransactionInput.model_validate(
                {**self.transaction, "card_id": ""}
            )

    def test_naive_timestamp_is_rejected(self):
        response = self.client.post(
            "/api/ml/score",
            json={
                "transaction": {
                    **self.transaction,
                    "timestamp": "2024-01-02T10:00:00",
                }
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_unknown_request_fields_are_rejected(self):
        response = self.client.post(
            "/api/ml/score",
            json={
                "transaction": self.transaction,
                "previous_transaction": [],
            },
        )

        self.assertEqual(response.status_code, 422)

    @patch("app.ml.predictor.load_active_model")
    def test_invalid_server_model_configuration_returns_503(
        self,
        load_model,
    ):
        load_model.side_effect = ModelConfigurationError(
            "Unsupported model: missing_model"
        )

        response = self.client.post(
            "/api/ml/score",
            json={"transaction": self.transaction},
        )

        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
