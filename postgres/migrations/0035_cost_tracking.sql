-- ─────────────────────────────────────────────────────────────────────────────
-- 0035_cost_tracking.sql
-- Cost-aware orchestration foundation
--
-- Tables:
--   budget_configs          — per-user and global budget limits
--   cost_records            — immutable audit ledger per cost event
--   execution_contexts      — live budget state for active workflow runs
--   cache_entries           — global (L1) cache: popular queries / routes
--   user_cache_entries      — per-user (L2) cache: recent searches / prefs
--   api_tier_registry       — catalogue of API tiers with cost metadata
--   retrieval_stage_log     — which retrieval stage each card reached
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Budget configs ─────────────────────────────────────────────────────────────
-- Stores per-user overrides and the global default row (user_id IS NULL).
CREATE TABLE IF NOT EXISTS budget_configs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          TEXT        UNIQUE,          -- NULL = global default
    max_cost_usd     NUMERIC(10,6) NOT NULL DEFAULT 0.10,
    max_api_calls    INT           NOT NULL DEFAULT 20,
    max_llm_tokens   INT           NOT NULL DEFAULT 50000,
    -- soft-limit thresholds (fraction of hard limit, 0–1)
    soft_limit_ratio NUMERIC(4,3)  NOT NULL DEFAULT 0.80,
    -- strategy applied once soft limit is hit
    degradation_policy TEXT NOT NULL DEFAULT 'downgrade'
        CHECK (degradation_policy IN ('downgrade', 'cache_only', 'halt')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed global default
INSERT INTO budget_configs (user_id, max_cost_usd, max_api_calls, max_llm_tokens)
VALUES (NULL, 0.10, 20, 50000)
ON CONFLICT (user_id) DO NOTHING;

-- ── Cost records ───────────────────────────────────────────────────────────────
-- Append-only ledger. Never updated, only inserted.
CREATE TABLE IF NOT EXISTS cost_records (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT        NOT NULL,
    workflow_id  TEXT,
    run_id       TEXT,
    node_id      TEXT,
    card_type    TEXT,
    cost_usd     NUMERIC(10,6) NOT NULL DEFAULT 0,
    cost_type    TEXT NOT NULL CHECK (cost_type IN ('llm', 'api', 'cache_miss', 'embedding')),
    api_tier     SMALLINT    NOT NULL DEFAULT 1 CHECK (api_tier BETWEEN 1 AND 3),
    tokens_used  INT,
    -- human-readable note (API name, model, endpoint)
    source       TEXT,
    stage        SMALLINT    CHECK (stage BETWEEN 1 AND 3),
    metadata     JSONB       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cost_records_user_id_idx      ON cost_records(user_id);
CREATE INDEX IF NOT EXISTS cost_records_workflow_id_idx  ON cost_records(workflow_id);
CREATE INDEX IF NOT EXISTS cost_records_run_id_idx       ON cost_records(run_id);
CREATE INDEX IF NOT EXISTS cost_records_created_at_idx   ON cost_records(created_at DESC);

-- ── Execution contexts ────────────────────────────────────────────────────────
-- One row per active (or recently completed) workflow execution.
-- Tracks the live budget state so the orchestrator can do pre-flight checks.
CREATE TABLE IF NOT EXISTS execution_contexts (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id           TEXT        NOT NULL UNIQUE,
    user_id          TEXT        NOT NULL,
    workflow_id      TEXT,
    budget_usd       NUMERIC(10,6) NOT NULL,
    budget_api_calls INT           NOT NULL,
    budget_tokens    INT           NOT NULL,
    spent_usd        NUMERIC(10,6) NOT NULL DEFAULT 0,
    spent_api_calls  INT           NOT NULL DEFAULT 0,
    spent_tokens     INT           NOT NULL DEFAULT 0,
    current_stage    SMALLINT      NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 3),
    -- 'active' | 'degraded' | 'halted' | 'completed'
    status           TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'degraded', 'halted', 'completed')),
    degradation_reason TEXT,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS exec_ctx_user_id_idx  ON execution_contexts(user_id);
CREATE INDEX IF NOT EXISTS exec_ctx_run_id_idx   ON execution_contexts(run_id);
CREATE INDEX IF NOT EXISTS exec_ctx_status_idx   ON execution_contexts(status);

-- ── API tier registry ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_tier_registry (
    id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT    NOT NULL UNIQUE,    -- e.g. 'duckduckgo', 'openweather', 'amadeus'
    tier         SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 3),
    task_types   TEXT[]  NOT NULL DEFAULT '{}',  -- e.g. '{search,weather}'
    cost_usd_per_call  NUMERIC(10,6) NOT NULL DEFAULT 0,
    rate_limit_rpm     INT,
    requires_key       BOOLEAN NOT NULL DEFAULT FALSE,
    is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    notes              TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial tier catalogue
INSERT INTO api_tier_registry (name, tier, task_types, cost_usd_per_call, requires_key, notes) VALUES
  ('duckduckgo',         1, '{search}',             0.000000, FALSE, 'Free web search'),
  ('llm_cache_lookup',   1, '{llm,reasoning}',      0.000100, FALSE, 'Cached LLM responses (pgvector similarity)'),
  ('static_knowledge',   1, '{facts,definitions}',  0.000000, FALSE, 'In-process static datasets'),
  ('openweather_free',   2, '{weather}',             0.000100, TRUE,  'OpenWeather free tier, 60rpm'),
  ('skyscanner_basic',   2, '{flights}',             0.001000, TRUE,  'Limited flight search'),
  ('openweather_pro',    2, '{weather}',             0.000500, TRUE,  'OpenWeather pro, higher resolution'),
  ('amadeus_search',     3, '{flights,booking}',     0.005000, TRUE,  'Amadeus full flight comparison'),
  ('booking_com',        3, '{accommodation}',       0.003000, TRUE,  'Booking.com full availability'),
  ('google_maps',        3, '{map,activities}',      0.002000, TRUE,  'Google Maps Places API')
ON CONFLICT (name) DO NOTHING;

-- ── Global cache (L1) ─────────────────────────────────────────────────────────
-- Shared across all users. Popular/common queries stored here.
CREATE TABLE IF NOT EXISTS cache_entries (
    cache_key    TEXT        PRIMARY KEY,
    data         JSONB       NOT NULL,
    data_type    TEXT        NOT NULL,   -- e.g. 'weather', 'flights', 'summary'
    stage        SMALLINT    NOT NULL DEFAULT 1,
    hit_count    INT         NOT NULL DEFAULT 0,
    cost_usd_saved NUMERIC(10,6) NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    last_hit_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cache_entries_expires_at_idx  ON cache_entries(expires_at);
CREATE INDEX IF NOT EXISTS cache_entries_data_type_idx   ON cache_entries(data_type);

-- ── User cache (L2) ───────────────────────────────────────────────────────────
-- Per-user: recent searches, preferences, partial results.
CREATE TABLE IF NOT EXISTS user_cache_entries (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT        NOT NULL,
    cache_key    TEXT        NOT NULL,
    data         JSONB       NOT NULL,
    data_type    TEXT        NOT NULL,
    stage        SMALLINT    NOT NULL DEFAULT 1,
    hit_count    INT         NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, cache_key)
);

CREATE INDEX IF NOT EXISTS user_cache_user_id_idx    ON user_cache_entries(user_id);
CREATE INDEX IF NOT EXISTS user_cache_expires_at_idx ON user_cache_entries(expires_at);

-- ── Retrieval stage log ────────────────────────────────────────────────────────
-- Tracks which retrieval stage each card type reached per run.
-- Used for cost analysis and progressive enhancement auditing.
CREATE TABLE IF NOT EXISTS retrieval_stage_log (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id       TEXT        NOT NULL,
    user_id      TEXT        NOT NULL,
    card_type    TEXT        NOT NULL,
    stage_reached SMALLINT   NOT NULL CHECK (stage_reached BETWEEN 1 AND 3),
    trigger      TEXT NOT NULL DEFAULT 'auto'
        CHECK (trigger IN ('auto', 'interaction', 'budget_force', 'prefetch')),
    cost_usd     NUMERIC(10,6) NOT NULL DEFAULT 0,
    latency_ms   INT,
    served_from  TEXT NOT NULL DEFAULT 'live'
        CHECK (served_from IN ('live', 'l1_cache', 'l2_cache', 'session_cache', 'degraded')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stage_log_run_id_idx    ON retrieval_stage_log(run_id);
CREATE INDEX IF NOT EXISTS stage_log_user_id_idx   ON retrieval_stage_log(user_id);

-- ── Aggregated views ──────────────────────────────────────────────────────────

-- Cost per user per day
CREATE OR REPLACE VIEW cost_per_user_day AS
SELECT
    user_id,
    date_trunc('day', created_at) AS day,
    SUM(cost_usd)        AS total_usd,
    SUM(tokens_used)     AS total_tokens,
    COUNT(*)             AS event_count,
    COUNT(DISTINCT run_id) AS run_count
FROM cost_records
GROUP BY user_id, date_trunc('day', created_at);

-- Cost per card type (global)
CREATE OR REPLACE VIEW cost_per_card_type AS
SELECT
    card_type,
    COUNT(*)             AS events,
    SUM(cost_usd)        AS total_usd,
    AVG(cost_usd)        AS avg_usd,
    SUM(tokens_used)     AS total_tokens
FROM cost_records
WHERE card_type IS NOT NULL
GROUP BY card_type
ORDER BY total_usd DESC;

-- Cost per workflow
CREATE OR REPLACE VIEW cost_per_workflow AS
SELECT
    workflow_id,
    COUNT(DISTINCT run_id)  AS run_count,
    SUM(cost_usd)           AS total_usd,
    AVG(cost_usd)           AS avg_usd_per_event,
    MAX(created_at)         AS last_run_at
FROM cost_records
WHERE workflow_id IS NOT NULL
GROUP BY workflow_id
ORDER BY total_usd DESC;

-- Cache effectiveness
CREATE OR REPLACE VIEW cache_effectiveness AS
SELECT
    data_type,
    SUM(hit_count)          AS total_hits,
    SUM(cost_usd_saved)     AS total_usd_saved,
    COUNT(*)                AS cached_entries,
    AVG(hit_count)          AS avg_hits_per_entry
FROM cache_entries
GROUP BY data_type
ORDER BY total_usd_saved DESC;
