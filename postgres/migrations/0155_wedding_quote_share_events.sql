-- Content-free delivery receipts for the public Wedding venue quote PDF tool.
-- Quote text, calculations and recipient addresses are deliberately excluded.
CREATE TABLE IF NOT EXISTS wedding_quote_share_events (
    event_id TEXT PRIMARY KEY,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    delivery_status TEXT NOT NULL CHECK (delivery_status IN ('pending', 'sent', 'failed')),
    provider_error_class TEXT
);

CREATE INDEX IF NOT EXISTS idx_wedding_quote_share_events_status_time
    ON wedding_quote_share_events (delivery_status, requested_at DESC);

REVOKE ALL ON wedding_quote_share_events FROM PUBLIC;
