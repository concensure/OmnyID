-- Migration: 0063_outbound_email_receipts_unique
-- Purpose: Add (message_id, provider) unique constraint so delivery retries
--          upsert rather than insert duplicate rows (GAP-134).
--          Also adds updated_at for the ON CONFLICT DO UPDATE path.
-- Rules: additive only

-- Add updated_at if it doesn't exist yet (the column may be absent on older schemas).
ALTER TABLE outbound_email_receipts
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- The unique constraint enables ON CONFLICT (message_id, provider).
-- If duplicate rows already exist, keep the most-recent one per pair.
DELETE FROM outbound_email_receipts a
    USING outbound_email_receipts b
    WHERE a.id < b.id
      AND a.message_id = b.message_id
      AND a.provider   = b.provider;

CREATE UNIQUE INDEX IF NOT EXISTS outbound_email_receipts_message_provider_uidx
    ON outbound_email_receipts(message_id, provider);
