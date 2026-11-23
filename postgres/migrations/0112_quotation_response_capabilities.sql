-- Transaction-scoped quotation response links. Authentication magic links remain in
-- auth_magic_links and MUST NOT be accepted by this capability boundary.
CREATE TABLE IF NOT EXISTS quotation_response_capabilities (
    capability_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grant_message_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    response_recipient_id TEXT NOT NULL,
    quotation_id TEXT NOT NULL,
    quotation_version_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    projection_fingerprint TEXT NOT NULL CHECK (projection_fingerprint ~ '^[0-9a-fA-F]{64}$'),
    token_prefix TEXT NOT NULL,
    token_mac TEXT NOT NULL UNIQUE CHECK (token_mac ~ '^[0-9a-f]{64}$'),
    status TEXT NOT NULL CHECK (status IN ('active', 'exchanged', 'consumed', 'revoked', 'rotated')),
    generation INTEGER NOT NULL CHECK (generation > 0),
    rotated_from_capability_id TEXT REFERENCES quotation_response_capabilities(capability_id),
    record_json JSONB NOT NULL,
    not_before TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    exchanged_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (not_before < expires_at)
);

CREATE INDEX IF NOT EXISTS idx_quotation_response_capability_lookup
    ON quotation_response_capabilities (token_prefix, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_quotation_response_capability_owner
    ON quotation_response_capabilities (owner_user_id, thread_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotation_response_capability_active_grant
    ON quotation_response_capabilities (owner_user_id, grant_message_id, vendor_id)
    WHERE status IN ('active', 'exchanged');

-- Session rows contain only keyed MACs. They are transaction sessions, not account sessions.
CREATE TABLE IF NOT EXISTS quotation_response_sessions (
    session_id TEXT PRIMARY KEY,
    capability_id TEXT NOT NULL REFERENCES quotation_response_capabilities(capability_id) ON DELETE CASCADE,
    session_token_mac TEXT NOT NULL UNIQUE CHECK (session_token_mac ~ '^[0-9a-f]{64}$'),
    csrf_token_mac TEXT NOT NULL CHECK (csrf_token_mac ~ '^[0-9a-f]{64}$'),
    submission_nonce_mac TEXT NOT NULL CHECK (submission_nonce_mac ~ '^[0-9a-f]{64}$'),
    record_json JSONB NOT NULL,
    account_access BOOLEAN NOT NULL DEFAULT FALSE CHECK (account_access = FALSE),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quotation_response_session_capability
    ON quotation_response_sessions (capability_id, expires_at);

-- Content-free lifecycle audit. Projection fields, raw tokens, CSRF values, nonces, email,
-- and network addresses are deliberately absent.
CREATE TABLE IF NOT EXISTS quotation_response_capability_audit (
    event_id TEXT PRIMARY KEY,
    capability_id TEXT NOT NULL REFERENCES quotation_response_capabilities(capability_id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_kind TEXT NOT NULL CHECK (event_kind IN ('issued', 'exchanged', 'consumed', 'revoked', 'rotated')),
    occurred_at TIMESTAMPTZ NOT NULL
);

-- Rate-limit keys are independently keyed hashes supplied by the service. Raw token, IP,
-- vendor contact, and thread values are never retained here.
CREATE TABLE IF NOT EXISTS quotation_response_rate_attempts (
    dimension TEXT NOT NULL CHECK (dimension IN ('token_prefix', 'ip_hash', 'vendor', 'thread')),
    key_mac TEXT NOT NULL CHECK (key_mac ~ '^[0-9a-f]{64}$'),
    window_started_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (dimension, key_mac, window_started_at)
);
