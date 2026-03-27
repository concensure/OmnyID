CREATE TABLE IF NOT EXISTS runtime_update_events (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    runtime_deployment_id TEXT REFERENCES runtime_deployments(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    from_version TEXT,
    to_version TEXT,
    status TEXT NOT NULL,
    notes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (action IN ('check', 'apply')),
    CHECK (status IN ('checked', 'applied', 'noop', 'failed'))
);
