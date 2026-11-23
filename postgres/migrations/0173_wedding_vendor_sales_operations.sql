-- Vendor sales operations remain a projection over canonical enquiry, quote,
-- resource and Limited Specials authorities. This migration stores only the
-- vendor's content-light journey stage and due-date decisions.

CREATE TABLE IF NOT EXISTS wedding_vendor_sales_journeys (
    journey_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    enquiry_thread_id TEXT NOT NULL,
    current_stage TEXT NOT NULL DEFAULT 'enquiry_received' CHECK (current_stage IN (
        'enquiry_received', 'qualification', 'availability_check',
        'tailored_quote', 'tour_booking', 'tour_completed', 'follow_up', 'hold', 'contract',
        'deposit', 'booked', 'declined', 'lost'
    )),
    next_action_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vendor_id, enquiry_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_sales_journeys_due
    ON wedding_vendor_sales_journeys (vendor_id, next_action_at)
    WHERE next_action_at IS NOT NULL
      AND current_stage NOT IN ('booked', 'declined', 'lost');

CREATE TABLE IF NOT EXISTS wedding_vendor_sales_journey_events (
    event_id TEXT PRIMARY KEY,
    journey_id TEXT NOT NULL REFERENCES wedding_vendor_sales_journeys(journey_id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    event_kind TEXT NOT NULL CHECK (event_kind IN ('stage_recorded', 'next_action_changed')),
    stage TEXT NOT NULL CHECK (stage IN (
        'enquiry_received', 'qualification', 'availability_check',
        'tailored_quote', 'tour_booking', 'tour_completed', 'follow_up', 'hold', 'contract',
        'deposit', 'booked', 'declined', 'lost'
    )),
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    next_action_at TIMESTAMPTZ,
    dedupe_key TEXT NOT NULL CHECK (char_length(dedupe_key) BETWEEN 8 AND 180),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vendor_id, event_kind, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_sales_journey_events_history
    ON wedding_vendor_sales_journey_events (vendor_id, journey_id, occurred_at DESC);

ALTER TABLE wedding_vendor_portal_events
    DROP CONSTRAINT IF EXISTS wedding_vendor_portal_events_event_kind_check;
ALTER TABLE wedding_vendor_portal_events
    ADD CONSTRAINT wedding_vendor_portal_events_event_kind_check CHECK (event_kind IN (
        'publication_submitted', 'publication_published', 'publication_rejected',
        'resource_created', 'resource_updated', 'resource_archived',
        'calendar_bulk_updated', 'member_invited', 'member_role_changed',
        'member_revoked', 'notification_preferences_updated',
        'sales_stage_recorded'
    ));

-- A price-review date is intentionally withheld from couple discovery while
-- the vendor decides whether demand or package pricing should change.
ALTER TABLE wedding_vendor_special_offer_slots
    DROP CONSTRAINT IF EXISTS wedding_vendor_special_offer_slots_state_check;
ALTER TABLE wedding_vendor_special_offer_slots
    ADD CONSTRAINT wedding_vendor_special_offer_slots_state_check CHECK (state IN (
        'available', 'enquiry_received', 'provisional_hold', 'booked',
        'price_review', 'paused', 'withdrawn', 'stale'
    ));
