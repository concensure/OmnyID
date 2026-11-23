-- Owner-requested image removals disappear from the public directory at once.
-- Storage is retained for fourteen days, then the cleanup worker purges it.
ALTER TABLE wedding_vendor_owner_assets
  ADD COLUMN IF NOT EXISTS removal_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_owner_assets_purge_after
  ON wedding_vendor_owner_assets (purge_after)
  WHERE status = 'hidden' AND purge_after IS NOT NULL;
