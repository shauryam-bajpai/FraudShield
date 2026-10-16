import { z } from "zod";

import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";

export type TransactionForScoring = {
    transaction_id: string;
    card_id: string;
    timestamp: string;
    amount: number;
    merchant_category: string;
    country: string;
    home_country: string;
};

const scoreResponseSchema = z.object({
    transaction_id: z.string(),
    model: z.string(),
    risk_score: z.number().min(0).max(1),
    threshold: z.number().min(0).max(1),
    flagged_for_review: z.boolean(),
});

export async function scoreWithMlService(
    transaction: TransactionForScoring,
    previousTransactions: TransactionForScoring[]
) {
    let response: Response;

    try {
        response = await fetch(
            `${env.ML_SERVICE_URL}/api/ml/score`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-API-Key": env.ML_INTERNAL_API_KEY,
                },
                body: JSON.stringify({
                    transaction,
                    previous_transactions: previousTransactions,
                }),
                signal: AbortSignal.timeout(5_000),
            }
        );
    } catch {
        throw new HttpError(503, "ML service is unavailable");
    }

    if (!response.ok) {
        throw new HttpError(
            502,
            `ML service could not score the transaction (${response.status})`
        );
    }

    let body: unknown;

    try {
        body = await response.json();
    } catch {
        throw new HttpError(502, "ML service returned invalid JSON");
    }

    const parsed = scoreResponseSchema.safeParse(body);

    if (!parsed.success) {
        throw new HttpError(502, "ML service returned an invalid score");
    }

    if (parsed.data.transaction_id !== transaction.transaction_id) {
        throw new HttpError(502, "ML service returned the wrong transaction ID");
    }

    return parsed.data;
}