-- Migration: 0068_para_archive
-- Purpose: PARA classification overlay — immutable, never mutates original AFP messages.
--          Original messages stay untouched; a para_classification AFP references them.
-- Rules: additive only — no DROP, no ALTER TYPE removal, no column removal
--        new columns must have defaults or be nullable

-- One classification row per (user, target_message). Upserted on re-classify.
-- para_tags format: ["project:wellness_routine", "area:health"]  (namespaced strings)
CREATE TABLE IF NOT EXISTS afp_para_classifications (
    id           TEXT        PRIMARY KEY,
    user_id      UUID        NOT NULL,
    target_id    TEXT        NOT NULL,     -- original AFP message id (never modified)
    para_tags    TEXT[]      NOT NULL DEFAULT '{}',
    status       TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'archived'
    archived_at  TIMESTAMPTZ,
    reason       TEXT,
    context      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One classification per (user, target) — upsert on conflict
CREATE UNIQUE INDEX IF NOT EXISTS idx_para_class_user_target
    ON afp_para_classifications (user_id, target_id);

CREATE INDEX IF NOT EXISTS idx_para_class_user_status
    ON afp_para_classifications (user_id, status);

-- GIN index for fast tag-prefix search
CREATE INDEX IF NOT EXISTS idx_para_class_tags
    ON afp_para_classifications USING gin (para_tags);

CREATE INDEX IF NOT EXISTS idx_para_class_updated
    ON afp_para_classifications (user_id, updated_at DESC);
