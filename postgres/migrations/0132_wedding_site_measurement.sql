-- Cookie-free, non-identifying first-party Wedding site measurement.
CREATE TABLE IF NOT EXISTS wedding_site_sessions (
    visit_id TEXT PRIMARY KEY CHECK (length(visit_id) = 12),
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    intent TEXT,
    ad_click_present BOOLEAN NOT NULL DEFAULT FALSE,
    referrer_class TEXT,
    referrer_host TEXT,
    device_class TEXT,
    language TEXT,
    landing_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wedding_site_events (
    event_id TEXT PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    visit_id TEXT NOT NULL REFERENCES wedding_site_sessions(visit_id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    page TEXT NOT NULL,
    props JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wedding_site_sessions_first_seen
    ON wedding_site_sessions (first_seen);
CREATE INDEX IF NOT EXISTS idx_wedding_site_events_occurred
    ON wedding_site_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_wedding_site_events_event_occurred
    ON wedding_site_events (event, occurred_at);

REVOKE ALL ON wedding_site_sessions FROM PUBLIC;
REVOKE ALL ON wedding_site_events FROM PUBLIC;

