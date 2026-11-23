CREATE TABLE IF NOT EXISTS waitlist_submissions (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    delivery_status TEXT NOT NULL,
    delivery_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_submissions_email_created_at
    ON waitlist_submissions (email, created_at DESC);
