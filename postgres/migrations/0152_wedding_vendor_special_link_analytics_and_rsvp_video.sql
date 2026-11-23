-- Content-light adoption evidence for vendor availability links, plus an
-- optional host-provided Loom greeting on a household RSVP capability.
-- Bearer tokens, message bodies and guest answers are deliberately excluded.

ALTER TABLE wedding_vendor_special_offer_slots
    ADD COLUMN IF NOT EXISTS availability_scope TEXT NOT NULL DEFAULT 'calendar_open'
        CHECK (availability_scope IN ('calendar_open', 'vendor_confirmed')),
    ADD COLUMN IF NOT EXISTS availability_scope_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE wedding_vendor_special_offer_events
    DROP CONSTRAINT IF EXISTS wedding_vendor_special_offer_events_event_kind_check;
ALTER TABLE wedding_vendor_special_offer_events
    ADD CONSTRAINT wedding_vendor_special_offer_events_event_kind_check CHECK (event_kind IN (
        'created', 'approved', 'published', 'reconfirmed', 'paused', 'withdrawn',
        'viewed', 'enquiry_received', 'hold_created', 'hold_expired', 'booked',
        'stale', 'delivery_failed', 'calendar_opened', 'availability_confirmed',
        'cancelled_booking_reopened'
    ));

CREATE TABLE IF NOT EXISTS wedding_vendor_special_offer_grant_attributions (
    grant_id TEXT NOT NULL REFERENCES wedding_vendor_special_offer_grants(grant_id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claim_id TEXT NOT NULL REFERENCES wedding_vendor_claims(claim_id) ON DELETE CASCADE,
    attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (grant_id, user_id),
    UNIQUE (claim_id)
);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_special_grant_attribution_vendor
    ON wedding_vendor_special_offer_grant_attributions (vendor_id, attributed_at DESC);

ALTER TABLE wedding_rsvp_capability_grants
    ADD COLUMN IF NOT EXISTS loom_video_url TEXT
        CHECK (
            loom_video_url IS NULL OR (
                char_length(loom_video_url) BETWEEN 24 AND 500
                AND loom_video_url ~ '^https://(www\.)?loom\.com/(share|embed)/[A-Za-z0-9_-]+'
            )
        );
