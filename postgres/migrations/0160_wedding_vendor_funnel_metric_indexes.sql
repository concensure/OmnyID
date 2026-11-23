-- Content-free indexes for operator Wedding commercial-funnel reporting.
-- The report remains a projection over canonical records; this migration adds
-- no visitor identifier, message content, phone number or analytics cookie.

CREATE INDEX IF NOT EXISTS idx_growth_wedding_activations_time
    ON growth_wedding_activations (activated_at, owner_user_id, wedding_plan_id);

CREATE INDEX IF NOT EXISTS idx_wedding_enquiry_completed_outbound_time
    ON wedding_enquiry_envelopes (
        COALESCE(acked_at, delivered_at, received_at), vendor_id, message_id
    )
    WHERE direction='to_vendor'
      AND (delivered_at IS NOT NULL OR acked_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_email_delivered_time
    ON wedding_vendor_email_provider_events (
        COALESCE(processed_at, created_at), relay_thread_id, afp_message_id
    )
    WHERE event_kind='delivered' AND processing_status='completed';

CREATE INDEX IF NOT EXISTS idx_wedding_special_availability_metric_time
    ON wedding_vendor_special_offer_events (occurred_at, vendor_id)
    WHERE event_kind IN (
        'created','approved','published','reconfirmed','paused','withdrawn',
        'hold_created','hold_expired','booked','stale',
        'availability_confirmed','cancelled_booking_reopened'
    );

CREATE INDEX IF NOT EXISTS idx_celebrant_consultation_availability_metric_time
    ON wedding_celebrant_consultation_events (occurred_at, vendor_id)
    WHERE event_kind IN ('settings_updated','live_started','live_paused');
