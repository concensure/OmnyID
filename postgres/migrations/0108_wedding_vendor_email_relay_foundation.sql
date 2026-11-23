-- Disabled wedding vendor-email relay foundation. These sidecars never store
-- correspondence plaintext: AFP remains canonical and content is encrypted
-- before it enters the message ledger.

CREATE TABLE IF NOT EXISTS wedding_agent_identity_masks (
    mask_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    underlying_agent_id TEXT NOT NULL,
    partner_member_id TEXT,
    partner_agent_id TEXT,
    email_local_part TEXT NOT NULL,
    email_domain TEXT NOT NULL DEFAULT 'mail.omnyid.com'
        CHECK (email_domain = 'mail.omnyid.com'),
    year_source TEXT NOT NULL CHECK (year_source IN ('wedding_date', 'provisioned_plus_one_year')),
    status TEXT NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'active', 'archived', 'disabled')),
    first_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    CHECK (email_local_part ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CHECK ((first_sent_at IS NULL) OR status IN ('active', 'archived', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_agent_identity_masks_address
    ON wedding_agent_identity_masks (lower(email_local_part), lower(email_domain));
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_agent_identity_masks_current_plan
    ON wedding_agent_identity_masks (owner_user_id, wedding_plan_id)
    WHERE status IN ('reserved', 'active');
CREATE INDEX IF NOT EXISTS idx_wedding_agent_identity_masks_owner_plan
    ON wedding_agent_identity_masks (owner_user_id, wedding_plan_id, status);

CREATE TABLE IF NOT EXISTS wedding_vendor_email_threads (
    relay_thread_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE RESTRICT,
    contact_id TEXT REFERENCES wedding_vendor_user_contacts(contact_id) ON DELETE SET NULL,
    afp_thread_id TEXT NOT NULL,
    mask_id TEXT NOT NULL REFERENCES wedding_agent_identity_masks(mask_id) ON DELETE RESTRICT,
    -- Address data stays encrypted; equality/routing use keyed opaque digests.
    vendor_email_ciphertext BYTEA NOT NULL,
    vendor_email_digest TEXT NOT NULL,
    inbound_route_digest TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived', 'deactivating', 'deleted', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,
    UNIQUE (owner_user_id, wedding_plan_id, vendor_id),
    UNIQUE (afp_thread_id),
    UNIQUE (inbound_route_digest)
);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_email_threads_owner_plan_status
    ON wedding_vendor_email_threads (owner_user_id, wedding_plan_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_email_threads_mask
    ON wedding_vendor_email_threads (mask_id, status);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_email_threads_vendor_digest
    ON wedding_vendor_email_threads (vendor_id, vendor_email_digest);

CREATE TABLE IF NOT EXISTS wedding_vendor_email_provider_events (
    provider TEXT NOT NULL,
    provider_event_id TEXT NOT NULL,
    event_kind TEXT NOT NULL CHECK (event_kind IN (
        'inbound', 'accepted', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed'
    )),
    payload_digest TEXT NOT NULL,
    signature_verified_at TIMESTAMPTZ,
    relay_thread_id TEXT REFERENCES wedding_vendor_email_threads(relay_thread_id) ON DELETE SET NULL,
    afp_message_id TEXT,
    processing_status TEXT NOT NULL DEFAULT 'received'
        CHECK (processing_status IN ('received', 'accepted', 'quarantined', 'rejected', 'completed', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    PRIMARY KEY (provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_email_provider_events_thread
    ON wedding_vendor_email_provider_events (relay_thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_email_provider_events_status
    ON wedding_vendor_email_provider_events (processing_status, created_at);

CREATE TABLE IF NOT EXISTS wedding_vendor_email_read_projection (
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_message_id TEXT NOT NULL,
    read_event_message_id TEXT NOT NULL,
    read_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (owner_user_id, source_message_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_email_read_projection_event
    ON wedding_vendor_email_read_projection (read_event_message_id);

-- Intentionally no legacy Gmail-thread backfill here. Existing contact
-- vendor_email values are plaintext legacy data and must not be copied into
-- this relay sidecar without the later, reviewed encryption/backfill service.
