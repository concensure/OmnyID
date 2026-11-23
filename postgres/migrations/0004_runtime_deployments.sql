CREATE TABLE IF NOT EXISTS runtime_deployments (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    framework TEXT NOT NULL,
    gui TEXT,
    status TEXT NOT NULL,
    python_version TEXT NOT NULL,
    image_ref TEXT NOT NULL,
    runtime_token TEXT NOT NULL,
    workspace_path TEXT NOT NULL,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_deployments_owner_framework
    ON runtime_deployments (owner_user_id, framework);
