ALTER TABLE billing_subscriptions
    ADD COLUMN IF NOT EXISTS archive_only_enabled BOOLEAN NOT NULL DEFAULT FALSE;
