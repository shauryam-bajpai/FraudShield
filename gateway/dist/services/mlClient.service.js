"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreWithMlService = scoreWithMlService;
const zod_1 = require("zod");
const env_1 = require("../config/env");
const errorHandler_1 = require("../middleware/errorHandler");
const scoreResponseSchema = zod_1.z.object({
    transaction_id: zod_1.z.string(),
    model: zod_1.z.string(),
    risk_score: zod_1.z.number().min(0).max(1),
    threshold: zod_1.z.number().min(0).max(1),
    flagged_for_review: zod_1.z.boolean(),
});
async function scoreWithMlService(transaction, previousTransactions) {
    let response;
    try {
        response = await fetch(`${env_1.env.ML_SERVICE_URL}/api/ml/score`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Internal-API-Key": env_1.env.ML_INTERNAL_API_KEY,
            },
            body: JSON.stringify({
                transaction,
                previous_transactions: previousTransactions,
            }),
            signal: AbortSignal.timeout(5_000),
        });
    }
    catch {
        throw new errorHandler_1.HttpError(503, "ML service is unavailable");
    }
    if (!response.ok) {
        throw new errorHandler_1.HttpError(502, `ML service could not score the transaction (${response.status})`);
    }
    let body;
    try {
        body = await response.json();
    }
    catch {
        throw new errorHandler_1.HttpError(502, "ML service returned invalid JSON");
    }
    const parsed = scoreResponseSchema.safeParse(body);
    if (!parsed.success) {
        throw new errorHandler_1.HttpError(502, "ML service returned an invalid score");
    }
    if (parsed.data.transaction_id !== transaction.transaction_id) {
        throw new errorHandler_1.HttpError(502, "ML service returned the wrong transaction ID");
    }
    return parsed.data;
}
