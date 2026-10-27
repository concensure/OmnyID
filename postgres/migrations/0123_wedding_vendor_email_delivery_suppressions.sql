-- Provider delivery failures are operational state. Keep only recipient and
-- provider identifiers as one-way digests so this table cannot become a
-- plaintext address directory.
CREATE TABLE IF NOT EXISTS wedding_vendor_email_delivery_suppressions (
    provider TEXT NOT NULL,
    recipient_digest TEXT NOT NULL CHECK (recipient_digest ~ '^[a-f0-9]{64}$'),
    reason TEXT NOT NULL CHECK (reason IN (
        'complaint', 'hard_bounce', 'soft_bounce', 'manual', 'policy',
        'provider_suppressed'
    )),
    provider_record_digest TEXT NOT NULL CHECK (provider_record_digest ~ '^[a-f0-9]{64}$'),
    suppress_until TIMESTAMPTZ,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, recipient_digest)
);

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_email_suppression_expiry
    ON wedding_vendor_email_delivery_suppressions (suppress_until)
    WHERE suppress_until IS NOT NULL;
