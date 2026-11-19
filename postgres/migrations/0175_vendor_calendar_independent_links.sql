-- Preserve all existing grants and sessions; digests stay unique.
DROP INDEX IF EXISTS uq_celebrant_active_management_grant;
CREATE INDEX IF NOT EXISTS idx_vendor_calendar_live_grants
    ON wedding_celebrant_management_grants(vendor_id, expires_at DESC)
    WHERE status IN ('active','exchanged');
