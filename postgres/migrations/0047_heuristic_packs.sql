-- 0047: User heuristic pack preferences + autonomy tier overrides + audit log

-- Which packs each user has enabled (meeting, email, deadline, finance, transport, weather)
CREATE TABLE IF NOT EXISTS user_heuristic_packs (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    owner_user_id   TEXT NOT NULL,
    pack_id         TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    enabled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, pack_id)
);

CREATE INDEX IF NOT EXISTS idx_user_heuristic_packs_user
    ON user_heuristic_packs (owner_user_id);

-- Per-heuristic autonomy tier overrides (user can override the confidence-derived tier)
CREATE TABLE IF NOT EXISTS heuristic_autonomy_overrides (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    owner_user_id   TEXT NOT NULL,
    heuristic_id    TEXT NOT NULL,
    -- 'ask_always' | 'notify_then_act' | 'auto_execute'
    autonomy_tier   TEXT NOT NULL DEFAULT 'ask_always',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, heuristic_id)
);

-- Audit log for every autonomous proactive action (P7.2)
CREATE TABLE IF NOT EXISTS proactive_action_audit (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    owner_user_id       TEXT NOT NULL,
    heuristic_id        TEXT NOT NULL,
    suggestion_id       TEXT NOT NULL,
    action_afp_type     TEXT NOT NULL,
    -- serialised inputs/outputs as JSON
    inputs_snapshot     JSONB NOT NULL DEFAULT '{}',
    output_afp_id       TEXT,
    autonomy_tier       TEXT NOT NULL,
    token_cost          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proactive_action_audit_user
    ON proactive_action_audit (owner_user_id, created_at DESC);
