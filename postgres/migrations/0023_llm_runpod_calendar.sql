-- Migration 0023: Add runpod backend to LLM config + calendar_events table

-- 1. Widen the backend CHECK constraint to include 'runpod'
ALTER TABLE user_llm_config
    DROP CONSTRAINT IF EXISTS user_llm_config_backend_check;

ALTER TABLE user_llm_config
    ADD CONSTRAINT user_llm_config_backend_check
    CHECK (backend IN ('hosted', 'byok', 'ollama', 'runpod'));

-- 2. Calendar events table (lightweight, user-owned, agent-readable)
CREATE TABLE IF NOT EXISTS calendar_events (
    id              TEXT        NOT NULL PRIMARY KEY,
    owner_user_id   TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT        NOT NULL,
    description     TEXT,
    start_at        TIMESTAMPTZ NOT NULL,
    end_at          TIMESTAMPTZ,
    all_day         BOOLEAN     NOT NULL DEFAULT FALSE,
    location        TEXT,
    status          TEXT        NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_calendar_events ON calendar_events
    FOR ALL
    USING (owner_user_id = current_setting('app.current_user_id', true));

-- Index for range queries (agent reads upcoming events)
CREATE INDEX IF NOT EXISTS idx_calendar_events_owner_start
    ON calendar_events (owner_user_id, start_at);
