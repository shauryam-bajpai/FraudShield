BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'analyst')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
    ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    merchant_category TEXT NOT NULL,
    country TEXT NOT NULL,
    home_country TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_card_time
    ON transactions (card_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_time
    ON transactions (occurred_at DESC);

CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id TEXT NOT NULL UNIQUE
        REFERENCES transactions(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    risk_score DOUBLE PRECISION NOT NULL
        CHECK (risk_score >= 0 AND risk_score <= 1),
    threshold DOUBLE PRECISION NOT NULL
        CHECK (threshold >= 0 AND threshold <= 1),
    flagged_for_review BOOLEAN NOT NULL,
    scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_flagged
    ON predictions (flagged_for_review, scored_at DESC);

CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id TEXT NOT NULL UNIQUE
        REFERENCES transactions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'pending_review', 'resolved')),
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high')),
    decision TEXT
        CHECK (decision IN ('fraud', 'legitimate')),
    decision_id UUID UNIQUE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT resolved_case_has_decision CHECK (
        status <> 'resolved'
        OR (decision IS NOT NULL AND resolved_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_cases_queue
    ON cases (status, priority, created_at DESC);

CREATE TABLE IF NOT EXISTS case_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    note TEXT NOT NULL CHECK (LENGTH(TRIM(note)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_notes_case
    ON case_notes (case_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    decision_id UUID,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_decision_id
    ON audit_log (decision_id)
    WHERE decision_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
    ON audit_log (entity_type, entity_id, created_at DESC);

COMMIT;
