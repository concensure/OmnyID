CREATE TABLE IF NOT EXISTS wedding_waitlist_signups (
    signup_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    expected_wedding_date DATE,
    source TEXT NOT NULL DEFAULT 'wedding_site',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wedding_waitlist_signups_created_at
    ON wedding_waitlist_signups (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wedding_waitlist_signups_email
    ON wedding_waitlist_signups (lower(email));
