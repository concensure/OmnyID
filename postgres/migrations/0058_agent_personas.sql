-- Agent personas: each user can have multiple named personas, each with its own
-- soul.md, writing style, skill set, and LoRA genome state. Only one may be
-- active at a time (enforced by the partial unique index below).

CREATE TABLE IF NOT EXISTS agent_personas (
    id                      TEXT        NOT NULL PRIMARY KEY,
    owner_user_id           TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                    TEXT        NOT NULL,
    soul_md                 TEXT        NOT NULL DEFAULT '',
    writing_style           TEXT        NOT NULL DEFAULT 'balanced',
    skills_json             JSONB       NOT NULL DEFAULT '[]'::jsonb,
    lora_confidence_score   FLOAT       NOT NULL DEFAULT 0.0,
    lora_genome_active      BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active               BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one active persona per user
CREATE UNIQUE INDEX IF NOT EXISTS agent_personas_one_active_per_user
    ON agent_personas(owner_user_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS agent_personas_by_owner
    ON agent_personas(owner_user_id, created_at DESC);
