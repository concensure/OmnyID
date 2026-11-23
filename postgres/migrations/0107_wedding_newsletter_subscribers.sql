CREATE TABLE IF NOT EXISTS wedding_newsletter_subscribers (
    subscriber_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    unsubscribe_token TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL DEFAULT 'wedding_site',
    subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unsubscribed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wedding_newsletter_subscribers_active
    ON wedding_newsletter_subscribers (subscribed_at DESC)
    WHERE unsubscribed_at IS NULL;
