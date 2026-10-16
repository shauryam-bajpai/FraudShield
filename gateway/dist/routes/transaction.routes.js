"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../config/db");
const errorHandler_1 = require("../middleware/errorHandler");
const mlClient_service_1 = require("../services/mlClient.service");
exports.transactionRouter = (0, express_1.Router)();
const transactionSchema = zod_1.z.object({
    transaction_id: zod_1.z.string().min(1).max(128),
    card_id: zod_1.z.string().min(1).max(128),
    timestamp: zod_1.z.string().refine((value) => !Number.isNaN(Date.parse(value)) &&
        /(Z|[+-]\d{2}:\d{2})$/i.test(value), "Supply an ISO timestamp with a timezone"),
    amount: zod_1.z.number().finite().min(0).max(9_999_999_999.99),
    merchant_category: zod_1.z.string().min(1).max(80),
    country: zod_1.z.string().length(2),
    home_country: zod_1.z.string().length(2),
});
exports.transactionRouter.post("/", async (req, res) => {
    const input = transactionSchema.parse(req.body);
    const timestamp = new Date(input.timestamp).toISOString();
    const transaction = {
        ...input,
        timestamp,
    };
    const client = await db_1.db.connect();
    try {
        await client.query("BEGIN");
        // Serializes concurrent ingestion for the same card.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text)::bigint)", [input.card_id]);
        const existing = await client.query("SELECT id FROM transactions WHERE id = $1", [input.transaction_id]);
        if (existing.rowCount) {
            throw new errorHandler_1.HttpError(409, "Transaction ID already exists");
        }
        const latest = await client.query(`SELECT occurred_at
       FROM transactions
       WHERE card_id = $1
       ORDER BY occurred_at DESC
       LIMIT 1`, [input.card_id]);
        if (latest.rows[0] &&
            latest.rows[0].occurred_at.getTime() >= new Date(timestamp).getTime()) {
            throw new errorHandler_1.HttpError(409, "Live transactions for a card must arrive in timestamp order");
        }
        const history = await client.query(`SELECT id, card_id, occurred_at, amount,
              merchant_category, country, home_country
       FROM transactions
       WHERE card_id = $1
         AND occurred_at >= $2::timestamptz - INTERVAL '7 days'
         AND occurred_at < $2::timestamptz
       ORDER BY occurred_at DESC, id DESC
       LIMIT 1001`, [input.card_id, timestamp]);
        if (history.rows.length > 1000) {
            throw new errorHandler_1.HttpError(422, "This card has more history than the current scoring limit");
        }
        const previousTransactions = history.rows.map((row) => ({
            transaction_id: row.id,
            card_id: row.card_id,
            timestamp: row.occurred_at.toISOString(),
            amount: Number(row.amount),
            merchant_category: row.merchant_category,
            country: row.country,
            home_country: row.home_country,
        }));
        const score = await (0, mlClient_service_1.scoreWithMlService)(transaction, previousTransactions);
        await client.query(`INSERT INTO transactions (
         id, card_id, occurred_at, amount,
         merchant_category, country, home_country
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            input.transaction_id,
            input.card_id,
            timestamp,
            input.amount,
            input.merchant_category,
            input.country,
            input.home_country,
        ]);
        await client.query(`INSERT INTO predictions (
         transaction_id, model_name, risk_score,
         threshold, flagged_for_review
       )
       VALUES ($1, $2, $3, $4, $5)`, [
            input.transaction_id,
            score.model,
            score.risk_score,
            score.threshold,
            score.flagged_for_review,
        ]);
        let caseId = null;
        if (score.flagged_for_review) {
            const createdCase = await client.query(`INSERT INTO cases (transaction_id, status, priority)
         VALUES ($1, 'open', 'medium')
         RETURNING id`, [input.transaction_id]);
            caseId = createdCase.rows[0].id;
        }
        await client.query("COMMIT");
        res.status(201).json({
            transaction_id: input.transaction_id,
            risk_score: score.risk_score,
            threshold: score.threshold,
            model: score.model,
            flagged_for_review: score.flagged_for_review,
            case_id: caseId,
        });
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
});
exports.transactionRouter.get("/", async (_req, res) => {
    const result = await db_1.db.query(`SELECT
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
     LIMIT 100`);
    res.json({ transactions: result.rows });
});
