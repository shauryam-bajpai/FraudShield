"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { ApiError, apiRequest } from "@/lib/api";

type TransactionResult = {
    transaction_id: string;
    risk_score: number;
    threshold: number;
    flagged: boolean;
    case_id?: string | null;
    case_status?: string | null;
    model_name?: string;
};

export default function NewTransactionPage() {
    const router = useRouter();

    const [cardId, setCardId] = useState("demo_card_1042");
    const [amount, setAmount] = useState("249.99");
    const [merchantCategory, setMerchantCategory] = useState("electronics");
    const [country, setCountry] = useState("US");
    const [homeCountry, setHomeCountry] = useState("US");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState<TransactionResult | null>(null);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setResult(null);
        setSubmitting(true);

        try {
            const body = {
                transaction_id: `demo_tx_${crypto.randomUUID()}`,
                card_id: cardId.trim(),
                occurred_at: new Date().toISOString(),
                amount: Number(amount),
                merchant_category: merchantCategory,
                country: country.trim().toUpperCase(),
                home_country: homeCountry.trim().toUpperCase(),
            };

            const response = await apiRequest<TransactionResult>(
                "/api/v1/transactions",
                {
                    method: "POST",
                    body: JSON.stringify(body),
                }
            );

            setResult(response);
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 401) {
                router.push("/");
                return;
            }

            setError(
                caught instanceof Error ? caught.message : "Could not score transaction."
            );
        } finally {
            setSubmitting(false);
        }
    }

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
                    <span className="eyebrow">TRANSACTION SIMULATOR</span>
                    <h1>Test a transaction</h1>
                    <p>
                        Enter a synthetic transaction to see its risk score and, if
                        flagged, open an investigation case.
                    </p>
                </section>

                <div className="detail-grid">
                    <section className="panel detail-card">
                        <h2>Transaction details</h2>

                        <form className="form-grid" onSubmit={handleSubmit}>
                            <label className="form-field">
                                <span>Demo card ID</span>
                                <input
                                    required
                                    value={cardId}
                                    onChange={(event) => setCardId(event.target.value)}
                                    placeholder="demo_card_1042"
                                />
                            </label>

                            <label className="form-field">
                                <span>Amount</span>
                                <input
                                    required
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={amount}
                                    onChange={(event) => setAmount(event.target.value)}
                                />
                            </label>

                            <label className="form-field">
                                <span>Merchant category</span>
                                <select
                                    value={merchantCategory}
                                    onChange={(event) => setMerchantCategory(event.target.value)}
                                >
                                    <option value="electronics">Electronics</option>
                                    <option value="grocery">Grocery</option>
                                    <option value="travel">Travel</option>
                                    <option value="restaurant">Restaurant</option>
                                    <option value="gas">Gas</option>
                                    <option value="other">Other</option>
                                </select>
                            </label>

                            <label className="form-field">
                                <span>Transaction country</span>
                                <input
                                    required
                                    maxLength={2}
                                    value={country}
                                    onChange={(event) => setCountry(event.target.value)}
                                />
                            </label>

                            <label className="form-field">
                                <span>Card home country</span>
                                <input
                                    required
                                    maxLength={2}
                                    value={homeCountry}
                                    onChange={(event) => setHomeCountry(event.target.value)}
                                />
                            </label>

                            <button
                                className="button button-primary"
                                type="submit"
                                disabled={submitting}
                            >
                                {submitting ? "Scoring…" : "Score transaction"}
                            </button>
                        </form>

                        {error && <p className="error" role="alert">{error}</p>}
                    </section>

                    <aside className="panel detail-card">
                        <h2>Scoring result</h2>

                        {!result ? (
                            <p className="muted">
                                Submit the form to see the model’s assessment.
                            </p>
                        ) : (
                            <div className="result-card">
                                <span className="eyebrow">RISK SCORE</span>
                                <strong className="result-score">
                                    {(result.risk_score * 100).toFixed(1)}%
                                </strong>
                                <p>
                                    Decision threshold:{" "}
                                    {(result.threshold * 100).toFixed(1)}%
                                </p>
                                <p>
                                    Outcome:{" "}
                                    <strong>
                                        {result.flagged ? "Flagged for review" : "Not flagged"}
                                    </strong>
                                </p>
                                {result.model_name && <p>Model: {result.model_name}</p>}

                                {result.case_id && (
                                    <Link
                                        className="button button-primary"
                                        href={`/cases/${result.case_id}`}
                                    >
                                        Open investigation
                                    </Link>
                                )}

                                <small>Transaction ID: {result.transaction_id}</small>
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </main>
    );
}