CREATE TABLE IF NOT EXISTS wedding_admin_data_consent_events (
    consent_event_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    notice_version TEXT NOT NULL CHECK (notice_version = 'wedding-admin-product-statistics-v2'),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wedding_admin_data_consent_events_subject
    ON wedding_admin_data_consent_events (user_id, wedding_plan_id, changed_at DESC);

REVOKE ALL ON wedding_admin_data_consent_events FROM PUBLIC;

COMMENT ON TABLE wedding_admin_data_consent_events IS
    'Content-free audit of a couple changing the optional administrator product-statistics choice.';
