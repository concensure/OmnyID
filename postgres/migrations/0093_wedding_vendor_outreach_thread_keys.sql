-- Adds the columns needed to match an inbound Gmail reply back to the
-- wedding_vendor_user_contacts row it belongs to: the outbound message id
-- the app sent (matched against In-Reply-To / References) and the vendor's
-- own email address (matched against the reply's From header when threading
-- headers are absent). Additive only; existing rows keep working unchanged.

ALTER TABLE wedding_vendor_user_contacts
  ADD COLUMN IF NOT EXISTS outbound_message_id TEXT,
  ADD COLUMN IF NOT EXISTS vendor_email TEXT;

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_user_contacts_outbound_message_id
  ON wedding_vendor_user_contacts (outbound_message_id)
  WHERE outbound_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_user_contacts_vendor_email
  ON wedding_vendor_user_contacts (lower(vendor_email))
  WHERE vendor_email IS NOT NULL;
