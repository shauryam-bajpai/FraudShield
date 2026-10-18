import sys
import unittest
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

ML_SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_SERVICE_DIR))

from app.main import app  # noqa: E402


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.case_id = str(uuid.uuid4())
        self.analyst_id = str(uuid.uuid4())
        self.decision_id = str(uuid.uuid4())

        self.transaction = {
            "transaction_id": "tx_wf_1",
            "card_id": "card_wf_1",
            "timestamp": "2024-01-02T10:00:00Z",
            "amount": 500.0,
            "merchant_category": "electronics",
            "country": "US",
            "home_country": "IN",
        }
        self.previous_transaction = {
            "transaction_id": "tx_wf_0",
            "card_id": "card_wf_1",
            "timestamp": "2024-01-01T10:00:00Z",
            "amount": 50.0,
            "merchant_category": "groceries",
            "country": "IN",
            "home_country": "IN",
        }

    def test_workflow_start_interrupt_and_resume(self):
        # 1. Start investigation -> should pause at human_review
        start_res = self.client.post(
            "/api/ml/workflow/start",
            json={
                "case_id": self.case_id,
                "transaction": self.transaction,
                "previous_transactions": [self.previous_transaction],
                "risk_score": 0.88,
                "threshold": 0.70,
            },
        )
        self.assertEqual(start_res.status_code, 200)
        start_data = start_res.json()
        self.assertEqual(start_data["status"], "pending_review")
        self.assertEqual(start_data["priority"], "high")
        self.assertIn("Transaction occurred outside the home country", start_data["signals"])

        # 2. Resume investigation with analyst verdict
        resume_res = self.client.post(
            "/api/ml/workflow/resume",
            json={
                "case_id": self.case_id,
                "decision_id": self.decision_id,
                "decision": "fraud",
                "analyst_id": self.analyst_id,
                "notes": "Confirmed foreign transaction spike",
            },
        )
        self.assertEqual(resume_res.status_code, 200)
        resume_data = resume_res.json()
        self.assertEqual(resume_data["status"], "resolved")
        self.assertEqual(resume_data["decision"], "fraud")
        self.assertEqual(resume_data["decision_id"], self.decision_id)
        self.assertIn("fraudulent", resume_data["summary"])

        # 3. Idempotent resume: calling resume again with the same decision_id returns existing resolved state
        retry_res = self.client.post(
            "/api/ml/workflow/resume",
            json={
                "case_id": self.case_id,
                "decision_id": self.decision_id,
                "decision": "fraud",
                "analyst_id": self.analyst_id,
                "notes": "Confirmed foreign transaction spike",
            },
        )
        self.assertEqual(retry_res.status_code, 200)
        self.assertEqual(retry_res.json()["status"], "resolved")

        # 4. Mismatched decision_id on resolved case -> returns 409 Conflict
        conflict_res = self.client.post(
            "/api/ml/workflow/resume",
            json={
                "case_id": self.case_id,
                "decision_id": str(uuid.uuid4()),
                "decision": "legitimate",
                "analyst_id": self.analyst_id,
                "notes": "Trying to overwrite",
            },
        )
        self.assertEqual(conflict_res.status_code, 409)


if __name__ == "__main__":
    unittest.main()
