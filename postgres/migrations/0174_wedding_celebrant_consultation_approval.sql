-- Join ranked-celebrant consultation requests to the authenticated couple that
-- created them.  The request remains vendor scoped and the capability-link
-- projection remains aggregate-only; claimed vendor access is still required
-- to see request detail or approve it.

ALTER TABLE wedding_celebrant_callback_requests
    ADD COLUMN IF NOT EXISTS requester_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS requester_wedding_plan_id TEXT,
    ADD COLUMN IF NOT EXISTS requester_calendar_event_id TEXT,
    ADD COLUMN IF NOT EXISTS vendor_calendar_event_id TEXT,
    ADD COLUMN IF NOT EXISTS confirmation_email_status TEXT NOT NULL DEFAULT 'not_applicable'
        CHECK (confirmation_email_status IN ('not_applicable','pending','sent','failed')),
    ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_celebrant_requests_requester
    ON wedding_celebrant_callback_requests (requester_user_id, created_at DESC)
    WHERE requester_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_celebrant_requester_calendar_event
    ON wedding_celebrant_callback_requests (requester_calendar_event_id)
    WHERE requester_calendar_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_celebrant_vendor_calendar_event
    ON wedding_celebrant_callback_requests (vendor_calendar_event_id)
    WHERE vendor_calendar_event_id IS NOT NULL;
