-- Preserve provenance alongside the existing stable (vendor_id, slot) photo identity.
-- Nullable fields keep prior admin and provider writes backward compatible.
ALTER TABLE wedding_vendor_photos
    ADD COLUMN IF NOT EXISTS source_url TEXT,
    ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS licence_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE wedding_vendor_photos
    ADD CONSTRAINT wedding_vendor_photos_source_url_http_check
    CHECK (source_url IS NULL OR source_url ~* '^https?://') NOT VALID;
