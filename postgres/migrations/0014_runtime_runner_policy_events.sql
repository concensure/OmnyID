CREATE TABLE IF NOT EXISTS runtime_runner_policy_events (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    runtime_deployment_id TEXT REFERENCES runtime_deployments(id) ON DELETE SET NULL,
    event_kind TEXT NOT NULL,
    summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runtime_runner_policy_events_owner_user_id
    ON runtime_runner_policy_events(owner_user_id, created_at DESC);
