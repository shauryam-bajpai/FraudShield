"use client";

import {
    type FormEvent,
    useEffect,
    useState,
} from "react";

import { BrandMark } from "../components/BrandMark";
import { MetricCard } from "../components/MetricCard";
import { StatusBadge } from "../components/StatusBadge";

const API =
    process.env.NEXT_PUBLIC_GATEWAY_URL ??
    "http://127.0.0.1:3001";

type Transaction = {
    transaction_id: string;
    occurred_at: string;
    amount: string;
    merchant_category: string;
    risk_score: number;
    flagged_for_review: boolean;
};

type ReviewCase = {
    case_id: string;
    status: string;
    priority: string;
    transaction_id: string;
    risk_score: number;
};

type TokenResponse = {
    access_token: string;
};

let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
    if (!refreshPromise) {
        refreshPromise = fetch(`${API}/api/v1/auth/refresh`, {
            method: "POST",
            credentials: "include",
        })
            .then(async (response) => {
                if (!response.ok) return null;

                const result =
                    (await response.json()) as TokenResponse;

                return result.access_token;
            })
            .catch(() => null)
            .finally(() => {
                refreshPromise = null;
            });
    }

    return refreshPromise;
}

async function fetchProtected(
    path: string,
    token: string,
    onRefresh: (token: string | null) => void
): Promise<Response> {
    const send = (accessToken: string) =>
        fetch(`${API}${path}`, {
            credentials: "include",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

    let response = await send(token);

    if (response.status === 401) {
        const newToken = await refreshAccessToken();
        onRefresh(newToken);

        if (!newToken) {
            throw new Error(
                "Your session expired. Please sign in again."
            );
        }

        response = await send(newToken);
    }

    if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
    }

    return response;
}

function formatRisk(score: number) {
    return `${(score * 100).toFixed(1)}%`;
}

export default function HomePage() {
    const [accessToken, setAccessToken] =
        useState<string | null>(null);

    const [checkingSession, setCheckingSession] =
        useState(true);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loggingIn, setLoggingIn] = useState(false);
    const [error, setError] = useState("");

    const [transactions, setTransactions] =
        useState<Transaction[]>([]);

    const [cases, setCases] =
        useState<ReviewCase[]>([]);

    useEffect(() => {
        let active = true;

        void refreshAccessToken().then((token) => {
            if (active) {
                setAccessToken(token);
                setCheckingSession(false);
            }
        });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!accessToken) {
            setTransactions([]);
            setCases([]);
            return;
        }

        let active = true;

        async function loadDashboard() {
            try {
                const [transactionResponse, caseResponse] =
                    await Promise.all([
                        fetchProtected(
                            "/api/v1/transactions",
                            accessToken!,
                            setAccessToken
                        ),
                        fetchProtected(
                            "/api/v1/cases",
                            accessToken!,
                            setAccessToken
                        ),
                    ]);

                const transactionData =
                    (await transactionResponse.json()) as {
                        transactions: Transaction[];
                    };

                const caseData =
                    (await caseResponse.json()) as {
                        cases: ReviewCase[];
                    };

                if (active) {
                    setTransactions(transactionData.transactions);
                    setCases(caseData.cases);
                    setError("");
                }
            } catch (cause) {
                if (active) {
                    setError(
                        cause instanceof Error
                            ? cause.message
                            : "Could not load the dashboard"
                    );
                }
            }
        }

        void loadDashboard();

        return () => {
            active = false;
        };
    }, [accessToken]);

    async function handleLogin(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();
        setLoggingIn(true);
        setError("");

        try {
            const response = await fetch(
                `${API}/api/v1/auth/login`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ email, password }),
                }
            );

            if (!response.ok) {
                throw new Error("Invalid email or password");
            }

            const result =
                (await response.json()) as TokenResponse;

            setAccessToken(result.access_token);
            setPassword("");
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "Sign in failed"
            );
        } finally {
            setLoggingIn(false);
        }
    }

    async function handleLogout() {
        try {
            await fetch(`${API}/api/v1/auth/logout`, {
                method: "POST",
                credentials: "include",
            });
        } finally {
            setAccessToken(null);
            setTransactions([]);
            setCases([]);
        }
    }

    const flaggedCount = transactions.filter(
        (transaction) => transaction.flagged_for_review
    ).length;

    const pendingCount = cases.filter(
        (reviewCase) => reviewCase.status !== "resolved"
    ).length;

    return (
        <main className="shell">
            <header className="container topbar">
                <BrandMark />

                <div className="topbar-right">
                    <span className="environment-label">
                        Demo workspace
                    </span>

                    {accessToken && (
                        <button
                            className="button"
                            onClick={() => void handleLogout()}
                        >
                            Sign out
                        </button>
                    )}
                </div>
            </header>

            {checkingSession ? (
                <div className="container dashboard">
                    <p className="muted">Checking your session...</p>
                </div>
            ) : !accessToken ? (
                <div className="container login-layout">
                    <section className="login-story">
                        <p className="eyebrow">
                            Transaction intelligence platform
                        </p>

                        <h1>
                            Every signal deserves a{" "}
                            <span>clear decision.</span>
                        </h1>

                        <p className="story-copy">
                            Score transactions, inspect the evidence,
                            and move suspicious activity through a
                            structured analyst review.
                        </p>

                        <div className="workflow-preview">
                            <p className="preview-title">
                                Investigation workflow preview
                            </p>

                            <div className="preview-steps">
                                <span className="preview-step">
                                    Score
                                </span>
                                <span
                                    className="preview-arrow"
                                    aria-hidden="true"
                                >
                                    →
                                </span>
                                <span className="preview-step preview-step-active">
                                    Review
                                </span>
                                <span
                                    className="preview-arrow"
                                    aria-hidden="true"
                                >
                                    →
                                </span>
                                <span className="preview-step">
                                    Resolve
                                </span>
                            </div>
                        </div>
                    </section>

                    <form
                        className="login-card"
                        onSubmit={(event) =>
                            void handleLogin(event)
                        }
                    >
                        <p className="eyebrow">Analyst access</p>
                        <h2>Sign in</h2>

                        <p className="login-description">
                            Enter your credentials to open the
                            FraudShield workspace.
                        </p>

                        <label className="field">
                            <span className="field-label">
                                Email address
                            </span>
                            <input
                                type="email"
                                autoComplete="username"
                                placeholder="analyst@example.com"
                                value={email}
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
                                required
                            />
                        </label>

                        <label className="field">
                            <span className="field-label">
                                Password
                            </span>
                            <input
                                type="password"
                                autoComplete="current-password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(event) =>
                                    setPassword(event.target.value)
                                }
                                required
                            />
                        </label>

                        {error && (
                            <p className="error" role="alert">
                                {error}
                            </p>
                        )}

                        <button
                            className="button button-primary button-full"
                            type="submit"
                            disabled={loggingIn}
                        >
                            {loggingIn
                                ? "Signing in..."
                                : "Open workspace"}
                        </button>

                        <p className="login-footnote">
                            Access is limited to registered analysts.
                        </p>
                    </form>
                </div>
            ) : (
                <div className="container dashboard">
                    <div className="dashboard-heading">
                        <div>
                            <p className="eyebrow">
                                Analyst overview
                            </p>
                            <h1>Transaction monitoring</h1>
                            <p className="muted">
                                Review recent risk scores and investigation cases.
                            </p>
                        </div>
                    </div>

                    <div className="metrics">
                        <MetricCard
                            label="Recent transactions"
                            value={transactions.length}
                            detail="Shown in the latest feed"
                        />

                        <MetricCard
                            label="Flagged transactions"
                            value={flaggedCount}
                            detail="Within the latest feed"
                            tone="warning"
                        />

                        <MetricCard
                            label="Cases awaiting review"
                            value={pendingCount}
                            detail="Within the latest 100 cases"
                            tone="success"
                        />
                    </div>

                    {error && (
                        <p className="error" role="alert">
                            {error}
                        </p>
                    )}

                    <section className="panel">
                        <div className="panel-heading">
                            <div>
                                <h2>Recent transactions</h2>
                                <p>Latest 100 scored transactions</p>
                            </div>
                        </div>

                        {transactions.length === 0 ? (
                            <p className="empty">
                                No transactions yet. Add one through the
                                gateway API to populate this view.
                            </p>
                        ) : (
                            <div className="table-wrap">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Transaction</th>
                                            <th>Category</th>
                                            <th>Amount</th>
                                            <th>Risk score</th>
                                            <th>Result</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {transactions.map((transaction) => (
                                            <tr
                                                key={transaction.transaction_id}
                                            >
                                                <td className="mono">
                                                    {transaction.transaction_id}
                                                </td>
                                                <td>
                                                    {transaction.merchant_category}
                                                </td>
                                                <td>
                                                    {Number(
                                                        transaction.amount
                                                    ).toFixed(2)}
                                                </td>
                                                <td>
                                                    {formatRisk(
                                                        transaction.risk_score
                                                    )}
                                                </td>
                                                <td>
                                                    <StatusBadge
                                                        status={
                                                            transaction.flagged_for_review
                                                                ? "flagged"
                                                                : "clear"
                                                        }
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <section className="panel">
                        <div className="panel-heading">
                            <div>
                                <h2>Review queue</h2>
                                <p>Cases requiring analyst attention</p>
                            </div>
                        </div>

                        {cases.length === 0 ? (
                            <p className="empty">
                                No cases in the review queue yet.
                            </p>
                        ) : (
                            <div className="table-wrap">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Transaction</th>
                                            <th>Risk score</th>
                                            <th>Priority</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {cases.map((reviewCase) => (
                                            <tr key={reviewCase.case_id}>
                                                <td className="mono">
                                                    {reviewCase.transaction_id}
                                                </td>
                                                <td>
                                                    {formatRisk(
                                                        reviewCase.risk_score
                                                    )}
                                                </td>
                                                <td>
                                                    <StatusBadge
                                                        status={reviewCase.priority}
                                                    />
                                                </td>
                                                <td>
                                                    <StatusBadge
                                                        status={reviewCase.status}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </main>
    );
}