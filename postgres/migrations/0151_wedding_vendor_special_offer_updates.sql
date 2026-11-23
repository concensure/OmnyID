-- Allow an owned draft/paused Limited Special to record an auditable edit.
-- Existing event rows and authority remain unchanged.

ALTER TABLE wedding_vendor_special_offer_events
    DROP CONSTRAINT IF EXISTS wedding_vendor_special_offer_events_event_kind_check;

ALTER TABLE wedding_vendor_special_offer_events
    ADD CONSTRAINT wedding_vendor_special_offer_events_event_kind_check CHECK (event_kind IN (
        'created', 'updated', 'approved', 'published', 'reconfirmed', 'paused', 'withdrawn',
        'viewed', 'enquiry_received', 'hold_created', 'hold_expired', 'booked',
        'stale', 'delivery_failed'
    ));

-- Keep the conversation join private and content-light. Downstream quote,
-- tour and booking projections can reconcile to the exact enquiry without
-- copying message bodies or relying on vendor-name matching.
ALTER TABLE wedding_vendor_special_offer_enquiries
    ADD COLUMN IF NOT EXISTS conversation_thread_id TEXT;

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_special_offer_enquiries_thread
    ON wedding_vendor_special_offer_enquiries (owner_user_id, conversation_thread_id)
    WHERE conversation_thread_id IS NOT NULL;

CREATE OR REPLACE VIEW wedding_vendor_special_offer_outcome_projection AS
SELECT enquiry.link_id,
       enquiry.offer_id,
       enquiry.slot_id,
       enquiry.owner_user_id,
       enquiry.wedding_plan_id,
       CASE
         WHEN slot.state = 'booked' OR EXISTS (
           SELECT 1 FROM afp_messages message
            WHERE message.owner_user_id = enquiry.owner_user_id
              AND message.thread_id = enquiry.conversation_thread_id
              AND COALESCE(message.subtype, '') IN ('wedding_vendor_booking_confirmed','wedding_vendor_quote_accepted')
         ) THEN 'booking'
         WHEN slot.state = 'provisional_hold' THEN 'hold'
         WHEN EXISTS (
           SELECT 1 FROM afp_messages message
            WHERE message.owner_user_id = enquiry.owner_user_id
              AND message.thread_id = enquiry.conversation_thread_id
              AND COALESCE(message.subtype, '') = 'wedding_vendor_tour_scheduled'
         ) THEN 'tour'
         WHEN EXISTS (
           SELECT 1 FROM afp_messages message
            WHERE message.owner_user_id = enquiry.owner_user_id
              AND message.thread_id = enquiry.conversation_thread_id
              AND COALESCE(message.subtype, '') IN ('wedding_vendor_booking_cancelled','wedding_vendor_declined','wedding_vendor_lost')
         ) THEN 'lost'
         WHEN EXISTS (
           SELECT 1 FROM afp_messages message
            WHERE message.owner_user_id = enquiry.owner_user_id
              AND message.thread_id = enquiry.conversation_thread_id
              AND COALESCE(message.subtype, '') IN ('wedding_vendor_quote_received','wedding_vendor_quote_attached')
         ) THEN 'quote'
         WHEN enquiry.conversation_thread_id IS NULL THEN 'unknown'
         ELSE 'enquiry'
       END AS outcome,
       enquiry.created_at
  FROM wedding_vendor_special_offer_enquiries enquiry
  JOIN wedding_vendor_special_offer_slots slot ON slot.slot_id = enquiry.slot_id;
