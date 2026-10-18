import { db } from "../config/db";
import { HttpError } from "../middleware/errorHandler";
import type { TransactionForScoring } from "../services/mlClient.service";
import {
    resumeWorkflow,
    startWorkflow,
} from "../services/workflowClient.service";

type CaseRow = {
    id: string;
    transaction_id: string;
    status: "open" | "pending_review" | "resolved";
    priority: "low" | "medium" | "high";
    decision_id: string | null;
    assigned_to: string | null;
    card_id: string;
    occurred_at: Date;
    amount: string;
    merchant_category: string;
    country: string;
    home_country: string;
    risk_score: number;
    threshold: number;
};

type HistoryRow = {
    id: string;
    card_id: string;
    occurred_at: Date;
    amount: string;
    merchant_category: string;
    country: string;
    home_country: string;
};

function asMlTransaction(row: HistoryRow): TransactionForScoring {
    return {
        transaction_id: row.id,
        card_id: row.card_id,
        timestamp: row.occurred_at.toISOString(),
        amount: Number(row.amount),
        merchant_category: row.merchant_category,
        country: row.country,
        home_country: row.home_country,
    };
}

export async function startCaseWorkflow(caseId: string) {
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query<CaseRow>(
            `SELECT
         c.id, c.transaction_id, c.status, c.priority,
         c.decision_id, c.assigned_to,
         t.card_id, t.occurred_at, t.amount,
         t.merchant_category, t.country, t.home_country,
         p.risk_score, p.threshold
       FROM cases c
       JOIN transactions t ON t.id = c.transaction_id
       JOIN predictions p ON p.transaction_id = t.id
       WHERE c.id = $1
       FOR UPDATE OF c`,
            [caseId]
        );

        const caseRecord = result.rows[0];

        if (!caseRecord) {
            throw new HttpError(404, "Case not found");
        }

        if (caseRecord.status === "resolved") {
            throw new HttpError(409, "Case is already resolved");
        }

        if (caseRecord.status === "pending_review") {
            await client.query("COMMIT");

            return {
                case_id: caseId,
                status: "pending_review" as const,
                priority: caseRecord.priority,
            };
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
            [caseRecord.card_id, caseRecord.occurred_at]
        );

        if (history.rows.length > 1000) {
            throw new HttpError(
                422,
                "Too many past transactions for this investigation"
            );
        }

        const workflow = await startWorkflow({
            case_id: caseId,
            transaction: asMlTransaction({
                id: caseRecord.transaction_id,
                card_id: caseRecord.card_id,
                occurred_at: caseRecord.occurred_at,
                amount: caseRecord.amount,
                merchant_category: caseRecord.merchant_category,
                country: caseRecord.country,
                home_country: caseRecord.home_country,
            }),
            previous_transactions: history.rows.map(asMlTransaction),
            risk_score: Number(caseRecord.risk_score),
            threshold: Number(caseRecord.threshold),
        });

        if (workflow.status !== "pending_review") {
            throw new HttpError(
                409,
                "Workflow was not awaiting analyst review"
            );
        }

        await client.query(
            `UPDATE cases
       SET status = 'pending_review', priority = $2
       WHERE id = $1`,
            [caseId, workflow.priority]
        );

        await client.query(
            `INSERT INTO audit_log (
         action, entity_type, entity_id, details
       )
       VALUES (
         'case.started', 'case', $1, $2::jsonb
       )`,
            [
                caseId,
                JSON.stringify({
                    priority: workflow.priority,
                    signals: workflow.signals,
                    evidence: workflow.evidence,
                }),
            ]
        );

        await client.query("COMMIT");

        return workflow;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function decideCase(
    caseId: string,
    actorId: string,
    input: {
        decisionId: string;
        decision: "fraud" | "legitimate";
        notes: string;
    }
) {
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query<{
            id: string;
            status: string;
            decision_id: string | null;
            assigned_to: string | null;
        }>(
            `SELECT id, status, decision_id, assigned_to
       FROM cases
       WHERE id = $1
       FOR UPDATE`,
            [caseId]
        );

        const caseRecord = result.rows[0];

        if (!caseRecord) {
            throw new HttpError(404, "Case not found");
        }

        if (caseRecord.status === "resolved") {
            if (caseRecord.decision_id !== input.decisionId) {
                throw new HttpError(
                    409,
                    "Case was resolved with another decision"
                );
            }

            const audit = await client.query<{ details: unknown }>(
                `SELECT details
         FROM audit_log
         WHERE decision_id = $1`,
                [input.decisionId]
            );

            await client.query("COMMIT");

            return {
                case_id: caseId,
                status: "resolved",
                decision_id: input.decisionId,
                details: audit.rows[0]?.details ?? null,
            };
        }

        if (caseRecord.status !== "pending_review") {
            throw new HttpError(
                409,
                "Start the investigation before reviewing this case"
            );
        }

        if (
            caseRecord.assigned_to &&
            caseRecord.assigned_to !== actorId
        ) {
            throw new HttpError(
                403,
                "Case is assigned to another analyst"
            );
        }

        const workflow = await resumeWorkflow({
            case_id: caseId,
            decision_id: input.decisionId,
            decision: input.decision,
            analyst_id: actorId,
            notes: input.notes,
        });

        await client.query(
            `UPDATE cases
       SET status = 'resolved',
           priority = $2,
           decision = $3,
           decision_id = $4,
           resolved_by = $5,
           resolved_at = NOW()
       WHERE id = $1`,
            [
                caseId,
                workflow.priority,
                input.decision,
                input.decisionId,
                actorId,
            ]
        );

        if (input.notes.trim()) {
            await client.query(
                `INSERT INTO case_notes (
           case_id, author_id, note
         )
         VALUES ($1, $2, $3)`,
                [caseId, actorId, input.notes.trim()]
            );
        }

        await client.query(
            `INSERT INTO audit_log (
         actor_id, action, entity_type, entity_id,
         decision_id, details
       )
       VALUES (
         $1, 'case.resolved', 'case', $2, $3, $4::jsonb
       )`,
            [
                actorId,
                caseId,
                input.decisionId,
                JSON.stringify({
                    decision: workflow.decision,
                    priority: workflow.priority,
                    signals: workflow.signals,
                    evidence: workflow.evidence,
                    summary: workflow.summary,
                }),
            ]
        );

        await client.query("COMMIT");

        return workflow;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}