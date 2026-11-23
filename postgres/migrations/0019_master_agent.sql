-- Migration 0019: Master Agent Orchestration
-- Adds soul.md / memory.md, ephemeral agents, LoRA takeover tracking,
-- Aware system (focus items + triggers), sub-agent delegation, anon sessions.

-- ── Extend agent_instances ──────────────────────────────────────────────────
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS soul_md TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS memory_md TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS is_master BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS max_sub_agents INT NOT NULL DEFAULT 3;
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS ephemeral BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS lora_confidence_score FLOAT NOT NULL DEFAULT 0.0;
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS lora_genome_active BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Anon session tracking (max 3 per IP+UA fingerprint) ────────────────────
CREATE TABLE IF NOT EXISTS anon_dashboard_sessions (
    fingerprint   TEXT PRIMARY KEY,
    session_count INT NOT NULL DEFAULT 0,
    first_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Aware system: focus items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_focus_items (
    id                 TEXT PRIMARY KEY,
    agent_instance_id  TEXT NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
    owner_user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title              TEXT NOT NULL,
    description        TEXT,
    status             TEXT NOT NULL DEFAULT 'pending',   -- pending|in_progress|completed|cancelled
    priority           TEXT NOT NULL DEFAULT 'normal',    -- low|normal|high|critical
    due_at             TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Aware system: triggers (6 types) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_triggers (
    id                 TEXT PRIMARY KEY,
    agent_instance_id  TEXT NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
    owner_user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger_type       TEXT NOT NULL,  -- scheduled|interval|http_polling|message|webhook|one_time
    config_json        JSONB NOT NULL DEFAULT '{}',
    last_fired_at      TIMESTAMPTZ,
    next_fire_at       TIMESTAMPTZ,
    enabled            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sub-agent short-lived delegations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_delegations (
    id                  TEXT PRIMARY KEY,
    master_instance_id  TEXT NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
    owner_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope               TEXT NOT NULL,
    mask                TEXT NOT NULL DEFAULT 'private',
    delegated_key_hex   TEXT NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    task_id             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Index for public feed (Plaza equivalent) ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_public
    ON messages(created_at DESC)
    WHERE type = 'public_article';

-- ── Row-level security on new tables ────────────────────────────────────────
ALTER TABLE agent_focus_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_focus_items FORCE ROW LEVEL SECURITY;
CREATE POLICY focus_owner ON agent_focus_items
    USING (owner_user_id = current_setting('app.current_user_id', TRUE));

ALTER TABLE agent_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_triggers FORCE ROW LEVEL SECURITY;
CREATE POLICY trigger_owner ON agent_triggers
    USING (owner_user_id = current_setting('app.current_user_id', TRUE));

ALTER TABLE agent_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_delegations FORCE ROW LEVEL SECURITY;
CREATE POLICY delegation_owner ON agent_delegations
    USING (owner_user_id = current_setting('app.current_user_id', TRUE));
