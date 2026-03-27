-- 0017_agent_template.sql
-- Agent template: per-user agent instances, task queue, LLM config, usage log.
-- All tables use PostgreSQL RLS with FORCE ROW LEVEL SECURITY so the app DB
-- role cannot read another user's rows even if application code has a bug.
-- The app sets "app.current_user_id" as a local session variable before
-- executing any query on these tables.

-- ── agent_instances ──────────────────────────────────────────────────────────
-- One row per user account; provisioned automatically at signup.

CREATE TABLE IF NOT EXISTS agent_instances (
    id                  TEXT        NOT NULL PRIMARY KEY,
    owner_user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id            TEXT        NOT NULL UNIQUE,
    name                TEXT        NOT NULL DEFAULT 'My Agent',
    status              TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('provisioning','active','paused','error')),
    system_prompt       TEXT        NOT NULL DEFAULT '',
    priority_rules_json JSONB       NOT NULL DEFAULT '{"rules":[]}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_instances_owner_idx
    ON agent_instances (owner_user_id);

ALTER TABLE agent_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_instances FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_agent_instances ON agent_instances
    FOR ALL
    USING (owner_user_id = current_setting('app.current_user_id', true));

-- ── agent_task_queue ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_task_queue (
    id                  TEXT        NOT NULL PRIMARY KEY,
    owner_user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_instance_id   TEXT        NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
    thread_id           TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                                'pending','planning','executing',
                                'awaiting_approval','completed','failed','cancelled'
                            )),
    intent              TEXT        NOT NULL,
    plan_json           JSONB       NOT NULL DEFAULT '{"steps":[]}'::jsonb,
    result_json         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    error               TEXT,
    priority            TEXT        NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('high','normal','low')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_task_queue_owner_idx
    ON agent_task_queue (owner_user_id, status);

CREATE INDEX IF NOT EXISTS agent_task_queue_agent_idx
    ON agent_task_queue (agent_instance_id);

ALTER TABLE agent_task_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_task_queue FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_agent_task_queue ON agent_task_queue
    FOR ALL
    USING (owner_user_id = current_setting('app.current_user_id', true));

-- ── user_llm_config ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_llm_config (
    id                          TEXT        NOT NULL PRIMARY KEY,
    owner_user_id               TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    backend                     TEXT        NOT NULL DEFAULT 'hosted'
                                    CHECK (backend IN ('hosted','byok','ollama')),
    provider                    TEXT        NOT NULL DEFAULT 'anthropic',
    model                       TEXT        NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    encrypted_api_key           TEXT,
    ollama_url                  TEXT,
    monthly_budget_cents        INT         NOT NULL DEFAULT 0,
    usage_cents_current_month   INT         NOT NULL DEFAULT 0,
    usage_reset_at              DATE        NOT NULL DEFAULT DATE_TRUNC('month', NOW()),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id)
);

ALTER TABLE user_llm_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_llm_config FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_user_llm_config ON user_llm_config
    FOR ALL
    USING (owner_user_id = current_setting('app.current_user_id', true));

-- ── llm_usage_log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_usage_log (
    id              TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    owner_user_id   TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_task_id   TEXT,
    model           TEXT        NOT NULL,
    tokens_input    INT         NOT NULL DEFAULT 0,
    tokens_output   INT         NOT NULL DEFAULT 0,
    cost_cents      INT         NOT NULL DEFAULT 0,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS llm_usage_log_owner_month_idx
    ON llm_usage_log (owner_user_id, recorded_at);

ALTER TABLE llm_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_usage_log FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_llm_usage_log ON llm_usage_log
    FOR ALL
    USING (owner_user_id = current_setting('app.current_user_id', true));
