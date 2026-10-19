"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { ApiError, apiRequest } from "@/lib/api";

type CaseRecord = {
    id: string;
    status: string;
    priority: string;
    transaction_id: string;
    card_id: string;
    amount: number;
    occurred_at: string;
    merchant_category: string;
    country: string;
    home_country: string;
    risk_score: number;
    threshold: number;
    model_name: string;
    decision: string | null;
};

type CaseNote = {
    id: string;
    note: string;
    created_at: string;
};

type CaseDetails = {
    case: CaseRecord;
    notes: CaseNote[];
    investigation: {
        signals: string[];
        evidence: Record<string, unknown>;
        priority: string;
    } | null;
};

type PendingDecision = {
    decision_id: string;
    decision: "fraud" | "legitimate";
    notes: string;
};

export default function CasePage() {
    const { caseId } = useParams<{ caseId: string }>();
    const router = useRouter();

    const [details, setDetails] = useState<CaseDetails | null>(null);
    const [notes, setNotes] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const pendingKey = `fraudshield:decision:${caseId}`;

    const loadCase = useCallback(async () => {
        try {
            const response = await apiRequest<CaseDetails>(
                `/api/v1/cases/${caseId}`
            );
            setDetails(response);
            setError("");

            if (response.case.status === "resolved") {
                sessionStorage.removeItem(`fraudshield:decision:${caseId}`);
            }
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 401) {
                router.push("/");
                return;
            }

            setError(caught instanceof Error ? caught.message : "Could not load case.");
        }
    }, [caseId, router]);

    useEffect(() => {
        void loadCase();

        try {
            const saved = sessionStorage.getItem(pendingKey);
            if (saved) {
                const pending = JSON.parse(saved) as PendingDecision;
                setNotes(pending.notes);
            }
        } catch {
            sessionStorage.removeItem(pendingKey);
        }
    }, [loadCase, pendingKey]);

    async function startInvestigation() {
        setBusy(true);
        setError("");

        try {
            await apiRequest(`/api/v1/cases/${caseId}/start`, {
                method: "POST",
            });
            await loadCase();
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : "Could not start the investigation."
            );
        } finally {
            setBusy(false);
        }
    }

    async function submitDecision(decision: "fraud" | "legitimate") {
        setBusy(true);
        setError("");

        try {
            const saved = sessionStorage.getItem(pendingKey);
            const pending = saved
                ? (JSON.parse(saved) as PendingDecision)
                : {
                    decision_id: crypto.randomUUID(),
                    decision,
                    notes: notes.trim(),
                };

            if (pending.decision !== decision || pending.notes !== notes.trim()) {
                setError(
                    "A previous submission may still be processing. Retry it with the same decision and notes."
                );
                return;
            }

            sessionStorage.setItem(pendingKey, JSON.stringify(pending));

            await apiRequest(`/api/v1/cases/${caseId}/decision`, {
                method: "POST",
                body: JSON.stringify(pending),
            });

            sessionStorage.removeItem(pendingKey);
            await loadCase();
        } catch (caught) {
            setError(
                caught instanceof Error ? caught.message : "Could not save decision."
            );
        } finally {
            setBusy(false);
        }
    }

    const reviewCase = details?.case;

    return (
        <main className="shell">
            <div className="container">
                <header className="topbar">
                    <BrandMark />
                    <Link className="button" href="/">
                        Back to dashboard
                    </Link>
                </header>

                <section className="page-header">
                    <span className="eyebrow">INVESTIGATION</span>
                    <h1>Case {caseId.slice(0, 8)}</h1>
                    <p>Inspect the transaction and record an analyst decision.</p>
                </section>

                {error && <p className="error" role="alert">{error}</p>}

                {!reviewCase ? (
                    <section className="panel detail-card">Loading case…</section>
                ) : (
                    <div className="detail-grid">
                        <section className="panel detail-card">
                            <span className="eyebrow">TRANSACTION</span>
                            <h2>{reviewCase.transaction_id}</h2>

                            <dl className="detail-list">
                                <div><dt>Status</dt><dd>{reviewCase.status}</dd></div>
                                <div><dt>Priority</dt><dd>{reviewCase.priority}</dd></div>
                                <div>
                                    <dt>Risk score</dt>
                                    <dd>{(reviewCase.risk_score * 100).toFixed(1)}%</dd>
                                </div>
                                <div>
                                    <dt>Threshold</dt>
                                    <dd>{(reviewCase.threshold * 100).toFixed(1)}%</dd>
                                </div>
                                <div><dt>Amount</dt><dd>{reviewCase.amount}</dd></div>
                                <div><dt>Card ID</dt><dd>{reviewCase.card_id}</dd></div>
                                <div>
                                    <dt>Location</dt>
                                    <dd>
                                        {reviewCase.country} · home {reviewCase.home_country}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Category</dt>
                                    <dd>{reviewCase.merchant_category}</dd>
                                </div>
                                <div><dt>Model</dt><dd>{reviewCase.model_name}</dd></div>
                            </dl>
                        </section>

                        <section className="panel detail-card">
                            <span className="eyebrow">ANALYST WORKSPACE</span>
                            <h2>Review and decision</h2>

                            {reviewCase.status === "open" && (
                                <>
                                    <p className="muted">
                                        Start the investigation to gather signals and open the
                                        review step.
                                    </p>
                                    <button
                                        className="button button-primary"
                                        disabled={busy}
                                        onClick={startInvestigation}
                                    >
                                        {busy ? "Starting…" : "Start investigation"}
                                    </button>
                                </>
                            )}

                            {details.investigation && (
                                <>
                                    <h3>Signals</h3>
                                    {details.investigation.signals.length ? (
                                        <ul className="signal-list">
                                            {details.investigation.signals.map((signal, index) => (
                                                <li key={`${signal}-${index}`}>{signal}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="muted">No additional rule signals.</p>
                                    )}

                                    <h3>Evidence</h3>
                                    <dl className="detail-list">
                                        {Object.entries(details.investigation.evidence).map(
                                            ([name, value]) => (
                                                <div key={name}>
                                                    <dt>{name.replaceAll("_", " ")}</dt>
                                                    <dd>
                                                        {typeof value === "object"
                                                            ? JSON.stringify(value)
                                                            : String(value)}
                                                    </dd>
                                                </div>
                                            )
                                        )}
                                    </dl>
                                </>
                            )}

                            {reviewCase.status === "pending_review" && (
                                <div className="review-form">
                                    <label className="form-field">
                                        <span>Analyst notes</span>
                                        <textarea
                                            rows={4}
                                            value={notes}
                                            onChange={(event) => setNotes(event.target.value)}
                                            placeholder="Explain the evidence behind your decision."
                                        />
                                    </label>

                                    <div className="case-actions">
                                        <button
                                            className="button button-primary"
                                            disabled={busy}
                                            onClick={() => submitDecision("fraud")}
                                        >
                                            Mark fraud
                                        </button>
                                        <button
                                            className="button"
                                            disabled={busy}
                                            onClick={() => submitDecision("legitimate")}
                                        >
                                            Mark legitimate
                                        </button>
                                    </div>
                                </div>
                            )}

                            {reviewCase.status === "resolved" && (
                                <p className="resolved-message">
                                    Final decision: <strong>{reviewCase.decision}</strong>
                                </p>
                            )}

                            {details.notes.length > 0 && (
                                <>
                                    <h3>Case notes</h3>
                                    <ul className="signal-list">
                                        {details.notes.map((entry) => (
                                            <li key={entry.id}>{entry.note}</li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </main>
    );
}