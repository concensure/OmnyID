CREATE TABLE IF NOT EXISTS sync_device_tokens (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES sync_device_policies(device_id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    token_preview TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    notes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_device_tokens_owner_user_id
    ON sync_device_tokens(owner_user_id, issued_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_device_tokens_token_hash
    ON sync_device_tokens(token_hash);
