import { Router } from "express";
import { z } from "zod";

import { db } from "../config/db";
import {
    decideCase,
    startCaseWorkflow,
} from "../controllers/case.controller";
import { HttpError } from "../middleware/errorHandler";

export const caseRouter = Router();

const caseIdSchema = z.string().uuid();

const decisionSchema = z.object({
    decision_id: z.string().uuid(),
    decision: z.enum(["fraud", "legitimate"]),
    notes: z.string().max(2000).default(""),
});

caseRouter.get("/", async (_req, res) => {
    const result = await db.query(
        `SELECT
       c.id AS case_id,
       c.status,
       c.priority,
       c.created_at,
       c.assigned_to,
       t.id AS transaction_id,
       t.amount,
       t.occurred_at,
       p.risk_score
     FROM cases c
     JOIN transactions t ON t.id = c.transaction_id
     JOIN predictions p ON p.transaction_id = t.id
     ORDER BY c.created_at DESC
     LIMIT 100`
    );

    res.json({ cases: result.rows });
});

caseRouter.get("/:caseId", async (req, res) => {
    const caseId = caseIdSchema.parse(req.params.caseId);

    const result = await db.query(
        `SELECT
       c.*,
       t.card_id,
       t.amount,
       t.occurred_at,
       t.merchant_category,
       t.country,
       t.home_country,
       p.risk_score,
       p.threshold,
       p.model_name
     FROM cases c
     JOIN transactions t ON t.id = c.transaction_id
     JOIN predictions p ON p.transaction_id = t.id
     WHERE c.id = $1`,
        [caseId]
    );

    if (!result.rows[0]) {
        throw new HttpError(404, "Case not found");
    }

    const notes = await db.query(
        `SELECT id, author_id, note, created_at
     FROM case_notes
     WHERE case_id = $1
     ORDER BY created_at`,
        [caseId]
    );

    const investigation = await db.query(
        `SELECT details
     FROM audit_log
     WHERE entity_type = 'case'
       AND entity_id = $1
       AND action = 'case.started'
     ORDER BY created_at DESC
     LIMIT 1`,
        [caseId]
    );

    res.json({
        case: result.rows[0],
        notes: notes.rows,
        investigation: investigation.rows[0]?.details ?? null,
    });
});

caseRouter.post("/:caseId/start", async (req, res) => {
    const caseId = caseIdSchema.parse(req.params.caseId);
    const result = await startCaseWorkflow(caseId);
    res.json(result);
});

caseRouter.post("/:caseId/decision", async (req, res) => {
    const caseId = caseIdSchema.parse(req.params.caseId);
    const input = decisionSchema.parse(req.body);

    const result = await decideCase(
        caseId,
        req.auth!.id,
        {
            decisionId: input.decision_id,
            decision: input.decision,
            notes: input.notes,
        }
    );

    res.json(result);
});