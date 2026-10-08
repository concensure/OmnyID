CREATE TABLE IF NOT EXISTS vendor_subscriptions (
    vendor_id TEXT PRIMARY KEY REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL DEFAULT 'starter' CHECK (tier IN ('starter', 'founding', 'pro')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
    founding_number INTEGER UNIQUE CHECK (founding_number IS NULL OR founding_number > 0),
    locked_price_id TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendor_subscriptions_user ON vendor_subscriptions (user_id);

-- Ciphertext-only relay store. The application must reject plaintext AFP content;
-- no enquiry body, couple contact detail, or quote column exists in this table.
CREATE TABLE IF NOT EXISTS wedding_enquiry_envelopes (
    message_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('to_vendor', 'to_couple')),
    afp_type TEXT NOT NULL CHECK (afp_type IN ('wedding_enquiry', 'wedding_enquiry_response')),
    envelope BYTEA NOT NULL,
    envelope_bytes INTEGER NOT NULL CHECK (envelope_bytes > 0 AND envelope_bytes <= 65536),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    acked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wee_inbox
    ON wedding_enquiry_envelopes (to_agent_id, received_at DESC) WHERE acked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wee_thread ON wedding_enquiry_envelopes (thread_id);
CREATE INDEX IF NOT EXISTS idx_wee_expiry ON wedding_enquiry_envelopes (expires_at);

CREATE TABLE IF NOT EXISTS wedding_vendor_listing_stats (
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    day DATE NOT NULL,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    search_impressions INTEGER NOT NULL DEFAULT 0 CHECK (search_impressions >= 0),
    cta_clicks INTEGER NOT NULL DEFAULT 0 CHECK (cta_clicks >= 0),
    enquiries_received INTEGER NOT NULL DEFAULT 0 CHECK (enquiries_received >= 0),
    responses_sent INTEGER NOT NULL DEFAULT 0 CHECK (responses_sent >= 0),
    median_response_minutes INTEGER CHECK (median_response_minutes IS NULL OR median_response_minutes >= 0),
    PRIMARY KEY (vendor_id, day)
);
