-- Billing hooks — Phase 12 cloud deploy
-- Tracks Stripe subscription state and webhook event history for hosted cloud tier.

CREATE TABLE IF NOT EXISTS billing_subscriptions (
    account_id          TEXT        NOT NULL PRIMARY KEY,
    stripe_customer_id  TEXT,
    stripe_subscription_id TEXT,
    plan                TEXT        NOT NULL DEFAULT 'free',   -- 'free' | 'pro' | 'team'
    status              TEXT        NOT NULL DEFAULT 'inactive', -- 'active' | 'inactive' | 'past_due' | 'canceled'
    current_period_end  TIMESTAMPTZ,
    cancel_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_stripe_customer
    ON billing_subscriptions (stripe_customer_id);

CREATE TABLE IF NOT EXISTS billing_events (
    id                  TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    account_id          TEXT,
    stripe_event_id     TEXT        NOT NULL UNIQUE,
    event_type          TEXT        NOT NULL,   -- e.g. 'customer.subscription.updated'
    payload             JSONB       NOT NULL DEFAULT '{}'::jsonb,
    processed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_account ON billing_events (account_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events (event_type);
