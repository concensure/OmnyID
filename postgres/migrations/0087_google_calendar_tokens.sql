-- 0087_google_calendar_tokens: per-user Google Calendar OAuth token storage,
-- plus sync bookkeeping columns on the existing local calendar_events table.

CREATE TABLE IF NOT EXISTS user_google_calendar_tokens (
    user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token  TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL DEFAULT '',
    token_expiry  TIMESTAMPTZ,
    google_email  TEXT NOT NULL DEFAULT '',
    connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track which local events mirror a Google Calendar event so sync stays
-- idempotent (re-pulling the same Google event updates the same row instead
-- of duplicating it) and so locally-created events can be pushed once.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'local'
    CHECK (source IN ('local', 'google'));
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS google_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_owner_google_event
    ON calendar_events (owner_user_id, google_event_id)
    WHERE google_event_id IS NOT NULL;
