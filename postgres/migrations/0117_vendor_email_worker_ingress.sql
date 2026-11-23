-- Authenticated Cloudflare Email Worker quarantine. Raw correspondence is
-- encrypted before insertion; routing and operational columns are content-free.
CREATE TABLE IF NOT EXISTS wedding_vendor_email_ingress_quarantine (
    quarantine_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'cloudflare_email_worker'
        CHECK (provider = 'cloudflare_email_worker'),
    provider_event_id TEXT NOT NULL,
    recipient_identity_id TEXT NOT NULL
        REFERENCES wedding_vendor_sender_identities(identity_id) ON DELETE RESTRICT,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE RESTRICT,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payload_digest TEXT NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
    raw_size_bytes INTEGER NOT NULL CHECK (raw_size_bytes BETWEEN 1 AND 10485760),
    ciphertext_envelope JSONB NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'awaiting_scan'
        CHECK (processing_status IN (
            'awaiting_scan', 'processing', 'accepted', 'quarantined',
            'rejected', 'failed', 'expired'
        )),
    error_code TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    processed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    UNIQUE (provider, provider_event_id),
    FOREIGN KEY (provider, provider_event_id)
        REFERENCES wedding_vendor_email_provider_events(provider, provider_event_id)
        ON DELETE RESTRICT,
    CHECK (jsonb_typeof(ciphertext_envelope) = 'object'),
    CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$')
);

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_email_ingress_pending
    ON wedding_vendor_email_ingress_quarantine (processing_status, received_at)
    WHERE processing_status IN ('awaiting_scan', 'processing');
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_email_ingress_owner
    ON wedding_vendor_email_ingress_quarantine (owner_user_id, vendor_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_email_ingress_expiry
    ON wedding_vendor_email_ingress_quarantine (expires_at)
    WHERE deleted_at IS NULL;
