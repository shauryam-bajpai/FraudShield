import { Router } from "express";
import { z } from "zod";

import { db } from "../config/db";
import { HttpError } from "../middleware/errorHandler";
import {
    scoreWithMlService,
    type TransactionForScoring,
} from "../services/mlClient.service";
import { startCaseWorkflow } from "../controllers/case.controller";

export const transactionRouter = Router();

const transactionSchema = z.object({
    transaction_id: z.string().min(1).max(128),
    card_id: z.string().min(1).max(128),
    timestamp: z.string().refine(
        (value) =>
            !Number.isNaN(Date.parse(value)) &&
            /(Z|[+-]\d{2}:\d{2})$/i.test(value),
        "Supply an ISO timestamp with a timezone"
    ),
    amount: z.number().finite().min(0).max(9_999_999_999.99),
    merchant_category: z.string().min(1).max(80),
    country: z.string().length(2),
    home_country: z.string().length(2),
});

type HistoryRow = {
    id: string;
    card_id: string;
    occurred_at: Date;
    amount: string;
    merchant_category: string;
    country: string;
    home_country: string;
};

transactionRouter.post("/", async (req, res) => {
    const input = transactionSchema.parse(req.body);
    const timestamp = new Date(input.timestamp).toISOString();

    const transaction: TransactionForScoring = {
        ...input,
        timestamp,
    };

    const client = await db.connect();

    try {
        await client.query("BEGIN");

        // Serializes concurrent ingestion for the same card.
        await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1::text)::bigint)",
            [input.card_id]
        );

        const existing = await client.query(
            "SELECT id FROM transactions WHERE id = $1",
            [input.transaction_id]
        );

        if (existing.rowCount) {
            throw new HttpError(409, "Transaction ID already exists");
        }

        const latest = await client.query<{ occurred_at: Date }>(
            `SELECT occurred_at
       FROM transactions
       WHERE card_id = $1
       ORDER BY occurred_at DESC
       LIMIT 1`,
            [input.card_id]
        );

        if (
            latest.rows[0] &&
            latest.rows[0].occurred_at.getTime() >= new Date(timestamp).getTime()
        ) {
            throw new HttpError(
                409,
                "Live transactions for a card must arrive in timestamp order"
            );
        }

        const history = await client.query<HistoryRow>(
            `SELECT id, card_id, occurred_at, amount,
              merchant_category, country, home_country
       FROM transactions
       WHERE card_id = $1
         AND occurred_at >= $2::timestamptz - INTERVAL '7 days'
         AND occurred_at < $2::timestamptz
       ORDER BY occurred_at DESC, id DESC
       LIMIT 1001`,
            [input.card_id, timestamp]
        );

        if (history.rows.length > 1000) {
            throw new HttpError(
                422,
                "This card has more history than the current scoring limit"
            );
        }

        const previousTransactions: TransactionForScoring[] =
            history.rows.map((row) => ({
                transaction_id: row.id,
                card_id: row.card_id,
                timestamp: row.occurred_at.toISOString(),
                amount: Number(row.amount),
                merchant_category: row.merchant_category,
                country: row.country,
                home_country: row.home_country,
            }));

        const score = await scoreWithMlService(
            transaction,
            previousTransactions
        );

        await client.query(
            `INSERT INTO transactions (
         id, card_id, occurred_at, amount,
         merchant_category, country, home_country
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                input.transaction_id,
                input.card_id,
                timestamp,
                input.amount,
                input.merchant_category,
                input.country,
                input.home_country,
            ]
        );

        await client.query(
            `INSERT INTO predictions (
         transaction_id, model_name, risk_score,
         threshold, flagged_for_review
       )
       VALUES ($1, $2, $3, $4, $5)`,
            [
                input.transaction_id,
                score.model,
                score.risk_score,
                score.threshold,
                score.flagged_for_review,
            ]
        );

        let caseId: string | null = null;

        if (score.flagged_for_review) {
            const createdCase = await client.query<{ id: string }>(
                `INSERT INTO cases (transaction_id, status, priority)
         VALUES ($1, 'open', 'medium')
         RETURNING id`,
                [input.transaction_id]
            );

            caseId = createdCase.rows[0].id;
        }

        await client.query("COMMIT");

        let caseStatus: "open" | "pending_review" | "resolved" | null = null;

        if (caseId) {
            try {
                const started = await startCaseWorkflow(caseId);
                caseStatus = started.status;
            } catch (error) {
                // The transaction and case were committed successfully.
                // POST /cases/:caseId/start can retry this workflow start.
                console.error("Case workflow start failed:", error);
                caseStatus = "open";
            }
        }

        res.status(201).json({
            transaction_id: input.transaction_id,
            risk_score: score.risk_score,
            threshold: score.threshold,
            model: score.model,
            flagged_for_review: score.flagged_for_review,
            case_id: caseId,
            case_status: caseStatus,
        });
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
});

transactionRouter.get("/", async (_req, res) => {
    const result = await db.query(
        `SELECT
       t.id AS transaction_id,
       t.card_id,
       t.occurred_at,
       t.amount,
       t.merchant_category,
       p.risk_score,
       p.flagged_for_review,
       c.id AS case_id,
       c.status AS case_status
     FROM transactions t
     JOIN predictions p ON p.transaction_id = t.id
     LEFT JOIN cases c ON c.transaction_id = t.id
     ORDER BY t.occurred_at DESC
     LIMIT 100`
    );

    res.json({ transactions: result.rows });
});
