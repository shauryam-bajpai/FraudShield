import { z } from "zod";

import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";
import type { TransactionForScoring } from "./mlClient.service";

const workflowResultSchema = z.object({
    case_id: z.string().uuid(),
    transaction_id: z.string(),
    status: z.enum(["pending_review", "resolved"]),
    priority: z.enum(["low", "medium", "high"]),
    signals: z.array(z.string()),
    evidence: z.record(z.unknown()),
    decision: z.enum(["fraud", "legitimate"]).nullable().optional(),
    decision_id: z.string().uuid().nullable().optional(),
    analyst_id: z.string().uuid().nullable().optional(),
    notes: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
});

export type WorkflowResult = z.infer<typeof workflowResultSchema>;

type StartPayload = {
    case_id: string;
    transaction: TransactionForScoring;
    previous_transactions: TransactionForScoring[];
    risk_score: number;
    threshold: number;
};

type ResumePayload = {
    case_id: string;
    decision_id: string;
    decision: "fraud" | "legitimate";
    analyst_id: string;
    notes: string;
};

async function callWorkflow(
    endpoint: "start" | "resume",
    payload: StartPayload | ResumePayload
): Promise<WorkflowResult> {
    let response: Response;

    try {
        response = await fetch(
            `${env.ML_SERVICE_URL}/api/ml/workflow/${endpoint}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Internal-API-Key": env.ML_INTERNAL_API_KEY,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10_000),
            }
        );
    } catch {
        throw new HttpError(503, "Investigation workflow is unavailable");
    }

    if (response.status === 409) {
        throw new HttpError(409, "Investigation workflow conflict");
    }

    if (!response.ok) {
        throw new HttpError(
            502,
            `Investigation workflow failed (${response.status})`
        );
    }

    let body: unknown;

    try {
        body = await response.json();
    } catch {
        throw new HttpError(502, "Workflow returned invalid JSON");
    }

    const parsed = workflowResultSchema.safeParse(body);

    if (!parsed.success || parsed.data.case_id !== payload.case_id) {
        throw new HttpError(502, "Workflow returned an invalid result");
    }

    return parsed.data;
}

export function startWorkflow(payload: StartPayload) {
    return callWorkflow("start", payload);
}

export async function resumeWorkflow(
    payload: ResumePayload
): Promise<WorkflowResult> {
    const result = await callWorkflow("resume", payload);

    // A retry with the same decision ID must not silently change its contents.
    if (
        result.status !== "resolved" ||
        result.decision_id !== payload.decision_id ||
        result.decision !== payload.decision ||
        result.analyst_id !== payload.analyst_id ||
        result.notes !== payload.notes
    ) {
        throw new HttpError(
            409,
            "Workflow result does not match this decision"
        );
    }

    return result;
}