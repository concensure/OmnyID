-- Server-authoritative Family Boundaries helper grants and idempotency receipts.
-- AFP tenant messages remain the durable domain history; these global rows are
-- content-light enforcement indexes and replay guards only.
CREATE TABLE IF NOT EXISTS wedding_boundary_helper_grants (
    grant_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    response_workspace_id TEXT NOT NULL,
    principal_label TEXT NOT NULL,
    household_ids JSONB NOT NULL,
    allowed_actions JSONB NOT NULL,
    token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_opened_at TIMESTAMPTZ,
    open_count BIGINT NOT NULL DEFAULT 0 CHECK (open_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (jsonb_typeof(household_ids) = 'array'),
    CHECK (jsonb_array_length(household_ids) BETWEEN 1 AND 50),
    CHECK (jsonb_typeof(allowed_actions) = 'array'),
    CHECK (jsonb_array_length(allowed_actions) BETWEEN 1 AND 4),
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_wedding_boundary_helper_grants_owner
    ON wedding_boundary_helper_grants
    (owner_user_id, response_workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wedding_boundary_helper_grants_expiry
    ON wedding_boundary_helper_grants (expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS wedding_boundary_command_receipts (
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    command_kind TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_wedding_boundary_command_receipts_created
    ON wedding_boundary_command_receipts (created_at);
