CREATE TABLE IF NOT EXISTS user_external_tool_usage_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_slug TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    provider_key TEXT NOT NULL,
    provider_category TEXT NOT NULL,
    billing_category TEXT NOT NULL,
    usage_unit TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
    estimated_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    source TEXT NOT NULL DEFAULT 'manual',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_external_tool_usage_events_user_time
    ON user_external_tool_usage_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_external_tool_usage_events_user_tool
    ON user_external_tool_usage_events (user_id, tool_slug, provider_key, occurred_at DESC);
