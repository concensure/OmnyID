CREATE TABLE IF NOT EXISTS platform_funded_ai_usage (
    id TEXT PRIMARY KEY,
    feature TEXT NOT NULL,
    user_id TEXT,
    wedding_plan_id TEXT,
    request_fingerprint TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'completed', 'failed')),
    reserved_cost_usd NUMERIC(12, 6) NOT NULL CHECK (reserved_cost_usd >= 0),
    actual_cost_usd NUMERIC(12, 6),
    provider_request_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_platform_funded_ai_usage_week
    ON platform_funded_ai_usage (created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_platform_funded_ai_usage_user_feature
    ON platform_funded_ai_usage (user_id, feature, created_at DESC);
REVOKE ALL ON TABLE platform_funded_ai_usage FROM PUBLIC;

CREATE TABLE IF NOT EXISTS wedding_decision_research_cache (
    user_id TEXT NOT NULL,
    wedding_plan_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    report_markdown TEXT NOT NULL,
    model TEXT NOT NULL,
    usage_id TEXT NOT NULL REFERENCES platform_funded_ai_usage(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, wedding_plan_id, task_id, input_hash)
);
REVOKE ALL ON TABLE wedding_decision_research_cache FROM PUBLIC;
