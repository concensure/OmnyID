-- Content-light capability grants for hosted Wedding run-sheet views.
-- The public token is never stored; only its SHA-256 digest is retained.
-- Run-sheet rows remain in the owner's AFP ledger and are projected at read time.
CREATE TABLE IF NOT EXISTS wedding_runsheet_share_grants (
    grant_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    database_id TEXT NOT NULL,
    wedding_plan_id TEXT NOT NULL,
    view_id TEXT NOT NULL,
    view_revision BIGINT NOT NULL CHECK (view_revision > 0),
    token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
    recipient_role TEXT NOT NULL CHECK (recipient_role IN ('vendor', 'photo_video', 'vip', 'guest')),
    recipient_label TEXT NOT NULL CHECK (char_length(recipient_label) BETWEEN 1 AND 120),
    record_ids JSONB NOT NULL CHECK (jsonb_typeof(record_ids) = 'array'),
    signoff_required BOOLEAN NOT NULL DEFAULT FALSE,
    signoff_due_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    expired_event_at TIMESTAMPTZ,
    last_viewed_at TIMESTAMPTZ,
    view_count BIGINT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at),
    CHECK (signoff_due_at IS NULL OR signoff_due_at <= expires_at),
    CHECK (signoff_required = FALSE OR recipient_role = 'vendor')
);

CREATE INDEX IF NOT EXISTS idx_wedding_runsheet_share_grants_owner
    ON wedding_runsheet_share_grants (owner_user_id, database_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_runsheet_share_grants_expiry
    ON wedding_runsheet_share_grants (expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS wedding_runsheet_share_acknowledgements (
    acknowledgement_id TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL REFERENCES wedding_runsheet_share_grants(grant_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('acknowledged', 'changes_requested')),
    actor_label TEXT NOT NULL CHECK (char_length(actor_label) BETWEEN 1 AND 120),
    note TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (grant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_wedding_runsheet_share_ack_grant
    ON wedding_runsheet_share_acknowledgements (grant_id, created_at DESC);
