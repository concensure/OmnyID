CREATE TABLE IF NOT EXISTS support_access_grants (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    access_scope TEXT NOT NULL DEFAULT 'runtime_metadata_only',
    reason TEXT,
    notes JSONB NOT NULL DEFAULT '{}'::jsonb,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_access_grants_owner_granted_at
    ON support_access_grants (owner_user_id, granted_at DESC);
