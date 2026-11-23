-- 0036: daemon runtime support and storage defaults

ALTER TABLE user_agent_preferences
    ADD COLUMN IF NOT EXISTS default_store_in_history BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS afp_relational_projections (
    message_id       TEXT PRIMARY KEY,
    owner_user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
    thread_id        TEXT NOT NULL,
    message_type     TEXT NOT NULL,
    subtype          TEXT,
    projection_kind  TEXT NOT NULL DEFAULT 'generic',
    workspace_id     TEXT,
    projection_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_timestamp TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS afp_rel_proj_owner_synced_idx
    ON afp_relational_projections(owner_user_id, synced_at DESC);

CREATE INDEX IF NOT EXISTS afp_rel_proj_thread_idx
    ON afp_relational_projections(thread_id);

CREATE INDEX IF NOT EXISTS afp_rel_proj_kind_idx
    ON afp_relational_projections(projection_kind);
