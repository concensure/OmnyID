-- Verified vendors may choose a connected mailbox identity or a stable
-- OmnyID-owned mask for responses created in OmnyID Cloud. The couple relay
-- identity in 0108 remains separate and continues to use mail.omnyid.com.
CREATE TABLE IF NOT EXISTS wedding_vendor_sender_identities (
    identity_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mask_local_part TEXT NOT NULL,
    mask_domain TEXT NOT NULL DEFAULT 'omnyid.com'
        CHECK (mask_domain = 'omnyid.com'),
    selected_kind TEXT CHECK (selected_kind IN ('connected_email', 'omnyid_mask')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived', 'disabled')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    CHECK (mask_local_part ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
    CHECK (char_length(mask_local_part) BETWEEN 3 AND 64),
    CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_sender_identity_address
    ON wedding_vendor_sender_identities (lower(mask_local_part), lower(mask_domain));
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_sender_identity_active_vendor
    ON wedding_vendor_sender_identities (vendor_id)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_sender_identity_owner
    ON wedding_vendor_sender_identities (owner_user_id, vendor_id, status);

ALTER TABLE quotation_vendor_response_transports
    ADD COLUMN IF NOT EXISTS sender_identity_id TEXT
        REFERENCES wedding_vendor_sender_identities(identity_id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS sender_identity_kind TEXT
        CHECK (sender_identity_kind IN ('connected_email', 'omnyid_mask'));

ALTER TABLE quotation_vendor_response_transports
    DROP CONSTRAINT IF EXISTS quotation_vendor_response_sender_identity_pair;
ALTER TABLE quotation_vendor_response_transports
    ADD CONSTRAINT quotation_vendor_response_sender_identity_pair CHECK (
        (sender_identity_id IS NULL AND sender_identity_kind IS NULL)
        OR (sender_identity_id IS NOT NULL AND sender_identity_kind IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_qvrt_sender_identity
    ON quotation_vendor_response_transports (sender_identity_id, created_at DESC)
    WHERE sender_identity_id IS NOT NULL;

-- Existing ciphertext transports predate sender choice and remain valid with
-- NULL sender identity. New claimed-vendor responses bind the selected active
-- identity in the application route.
