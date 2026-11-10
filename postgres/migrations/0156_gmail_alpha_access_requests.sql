-- Gmail is an alpha integration. Requests are account scoped and an OAuth URL
-- is issued only after an operator has explicitly approved that account.
CREATE TABLE IF NOT EXISTS gmail_alpha_access_requests (
    owner_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    requester_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'revoked')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_gmail_alpha_access_requests_status_time
    ON gmail_alpha_access_requests (status, requested_at DESC);

REVOKE ALL ON gmail_alpha_access_requests FROM PUBLIC;
