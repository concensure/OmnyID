CREATE TABLE IF NOT EXISTS runtime_backup_policies (
    owner_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    retention_days INTEGER NOT NULL DEFAULT 14,
    storage_mode TEXT NOT NULL DEFAULT 'metadata_only_hosted',
    last_snapshot_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS runtime_backups (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    runtime_deployment_id TEXT REFERENCES runtime_deployments(id) ON DELETE SET NULL,
    snapshot_type TEXT NOT NULL,
    storage_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    file_count INTEGER NOT NULL DEFAULT 0,
    total_workspace_bytes BIGINT NOT NULL DEFAULT 0,
    artifact_size_bytes BIGINT NOT NULL DEFAULT 0,
    artifact_path TEXT,
    manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_backups_owner_created_at
    ON runtime_backups (owner_user_id, created_at DESC);
