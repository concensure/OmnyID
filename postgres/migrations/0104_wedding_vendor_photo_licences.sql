-- A durable receipt is required before a vendor-owned image can be made live.
-- The agreement text is versioned and hashed by the server; clients cannot
-- select a prior or altered version when accepting it.
CREATE TABLE IF NOT EXISTS wedding_vendor_photo_licences (
    photo_licence_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agreement_version TEXT NOT NULL,
    agreement_sha256 TEXT NOT NULL CHECK (agreement_sha256 ~ '^[0-9a-f]{64}$'),
    consent_copy TEXT NOT NULL CHECK (char_length(consent_copy) <= 2000),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_ip_hash TEXT,
    accepted_user_agent TEXT CHECK (char_length(accepted_user_agent) <= 512)
);
CREATE INDEX IF NOT EXISTS idx_wvpl_vendor_user
    ON wedding_vendor_photo_licences (vendor_id, user_id, accepted_at DESC);

ALTER TABLE wedding_vendor_owner_assets
    ADD COLUMN IF NOT EXISTS photo_licence_id TEXT
        REFERENCES wedding_vendor_photo_licences(photo_licence_id) ON DELETE RESTRICT;

-- NOT VALID preserves migration safety for any early/private asset rows while
-- still enforcing a receipt for every new live publication.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'wedding_vendor_owner_assets_live_licence_required'
    ) THEN
        ALTER TABLE wedding_vendor_owner_assets
            ADD CONSTRAINT wedding_vendor_owner_assets_live_licence_required
            CHECK (status <> 'live' OR photo_licence_id IS NOT NULL) NOT VALID;
    END IF;
END $$;
