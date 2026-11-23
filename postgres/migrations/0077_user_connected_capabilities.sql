-- 0077_user_connected_capabilities:
-- Canonical per-user connected capability registry spanning provider-specific integrations.

CREATE TABLE IF NOT EXISTS user_connected_capabilities (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    account_ref TEXT NOT NULL DEFAULT '',
    capability_family TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    transport TEXT NOT NULL,
    granted_scopes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    approval_mode TEXT NOT NULL DEFAULT 'autonomous'
        CHECK (approval_mode IN ('autonomous', 'suggest_only', 'human_approval_required')),
    secret_ref TEXT,
    health_state TEXT NOT NULL DEFAULT 'healthy'
        CHECK (health_state IN ('healthy', 'degraded', 'revoked', 'unknown')),
    last_checked_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (user_id, provider, capability_id, account_ref)
);

CREATE INDEX IF NOT EXISTS idx_user_connected_capabilities_user
    ON user_connected_capabilities (user_id, provider, health_state);

CREATE INDEX IF NOT EXISTS idx_user_connected_capabilities_capability
    ON user_connected_capabilities (user_id, capability_family, capability_id);
