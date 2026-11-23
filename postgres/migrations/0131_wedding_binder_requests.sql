-- Privacy-minimised Wedding Day Binder delivery and double opt-in receipts.
CREATE TABLE IF NOT EXISTS wedding_binder_requests (
    request_id TEXT PRIMARY KEY,
    email TEXT NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    consent_text_version TEXT NOT NULL CHECK (length(consent_text_version) BETWEEN 1 AND 80),
    delivery_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (delivery_status IN ('pending', 'sent', 'failed')),
    delivered_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
    confirmation_token_hash TEXT UNIQUE,
    confirmed_at TIMESTAMPTZ,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    intent TEXT,
    referrer_class TEXT,
    device_class TEXT,
    CHECK ((marketing_opt_in AND confirmation_token_hash IS NOT NULL)
        OR (NOT marketing_opt_in AND confirmation_token_hash IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_wedding_binder_requests_email_requested
    ON wedding_binder_requests (email, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_binder_requests_requested
    ON wedding_binder_requests (requested_at DESC);

REVOKE ALL ON wedding_binder_requests FROM PUBLIC;

