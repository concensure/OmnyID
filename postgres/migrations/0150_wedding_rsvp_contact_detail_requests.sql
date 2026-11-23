-- Extend an existing household RSVP capability with an explicit request for
-- the guest's essential contact details. The raw capability token remains
-- fragment-only and digest-only at rest.
ALTER TABLE wedding_rsvp_capability_grants
    ADD COLUMN IF NOT EXISTS request_contact_details BOOLEAN NOT NULL DEFAULT FALSE;
