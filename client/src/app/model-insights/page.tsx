"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { ApiError, apiRequest } from "@/lib/api";

type ThresholdMetrics = {
    threshold: number;
    true_positives: number;
    false_positives: number;
    true_negatives: number;
    false_negatives: number;
    precision: number;
    recall: number;
    f1: number;
};

type ModelReport = {
    name: string;
    sample_count: number;
    fraud_count: number;
    pr_auc: number;
    roc_auc: number;
    best_f1_threshold: number;
    thresholds: ThresholdMetrics[];
};

type InsightsReport = {
    split: string;
    models: ModelReport[];
};

export default function ModelInsightsPage() {
    const router = useRouter();

    const [report, setReport] = useState<InsightsReport | null>(null);
    const [selectedModel, setSelectedModel] = useState("");
    const [threshold, setThreshold] = useState(0.5);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;

        async function load() {
            try {
                const result = await apiRequest<InsightsReport>("/api/v1/insights");

                if (!active) return;

                setReport(result);
                setSelectedModel(result.models[0]?.name ?? "");
            } catch (caught) {
                if (!active) return;

                if (caught instanceof ApiError && caught.status === 401) {
                    router.push("/");
                    return;
                }

                setError(
                    caught instanceof Error
                        ? caught.message
                        : "Could not load model insights."
                );
            } finally {
                if (active) setLoading(false);
            }
        }

        void load();

        return () => {
            active = false;
        };
    }, [router]);

    const model = useMemo(
        () => report?.models.find((item) => item.name === selectedModel),
        [report, selectedModel]
    );

    const metrics = useMemo(
        () =>
            model?.thresholds.find(
                (item) => Math.abs(item.threshold - threshold) < 0.001
            ),
        [model, threshold]
    );

    function selectModel(name: string) {
        setSelectedModel(name);
        setThreshold(0.5);
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
                    <span className="eyebrow">MODEL LAB</span>
                    <h1>Model insights</h1>
                    <p>
                        Compare models and explore how the review threshold changes
                        outcomes on the validation set.
                    </p>
                </section>

                {loading && <section className="panel detail-card">Loading metrics…</section>}
                {error && <p className="error" role="alert">{error}</p>}

                {report && (
                    <>
                        <section className="panel detail-card" style={{ marginBottom: 20 }}>
                            <span className="eyebrow">VALIDATION COMPARISON</span>
                            <div className="table" style={{ overflowX: "auto" }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Model</th>
                                            <th>PR-AUC</th>
                                            <th>ROC-AUC</th>
                                            <th>Samples</th>
                                            <th>Fraud cases</th>
                                            <th>Best F1 threshold</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.models.map((item) => (
                                            <tr key={item.name}>
                                                <td>{item.name}</td>
                                                <td>{item.pr_auc.toFixed(3)}</td>
                                                <td>{item.roc_auc.toFixed(3)}</td>
                                                <td>{item.sample_count.toLocaleString()}</td>
                                                <td>{item.fraud_count.toLocaleString()}</td>
                                                <td>
                                                    {(item.best_f1_threshold * 100).toFixed(0)}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <div className="detail-grid">
                            <section className="panel detail-card">
                                <span className="eyebrow">THRESHOLD SIMULATOR</span>
                                <h2>Explore the tradeoff</h2>

                                <label className="form-field">
                                    <span>Model</span>
                                    <select
                                        value={selectedModel}
                                        onChange={(event) => selectModel(event.target.value)}
                                    >
                                        {report.models.map((item) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label
                                    className="form-field"
                                    style={{ marginTop: 26 }}
                                >
                                    <span>
                                        Review threshold: {(threshold * 100).toFixed(0)}%
                                    </span>
                                    <input
                                        type="range"
                                        min="5"
                                        max="95"
                                        step="5"
                                        value={threshold * 100}
                                        onChange={(event) =>
                                            setThreshold(Number(event.target.value) / 100)
                                        }
                                    />
                                </label>

                                <p className="muted">
                                    Transactions scoring at or above this threshold are
                                    flagged for review. These counts come from saved
                                    validation predictions; changing this slider does not
                                    change the live gateway threshold.
                                </p>
                            </section>

                            <section className="panel detail-card">
                                <span className="eyebrow">VALIDATION OUTCOMES</span>
                                <h2>At this threshold</h2>

                                {metrics && (
                                    <dl className="detail-list">
                                        <div>
                                            <dt>True positives</dt>
                                            <dd>{metrics.true_positives}</dd>
                                        </div>
                                        <div>
                                            <dt>False positives</dt>
                                            <dd>{metrics.false_positives}</dd>
                                        </div>
                                        <div>
                                            <dt>True negatives</dt>
                                            <dd>{metrics.true_negatives}</dd>
                                        </div>
                                        <div>
                                            <dt>False negatives</dt>
                                            <dd>{metrics.false_negatives}</dd>
                                        </div>
                                        <div>
                                            <dt>Precision</dt>
                                            <dd>{(metrics.precision * 100).toFixed(1)}%</dd>
                                        </div>
                                        <div>
                                            <dt>Recall</dt>
                                            <dd>{(metrics.recall * 100).toFixed(1)}%</dd>
                                        </div>
                                        <div>
                                            <dt>F1 score</dt>
                                            <dd>{metrics.f1.toFixed(3)}</dd>
                                        </div>
                                    </dl>
                                )}
                            </section>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}