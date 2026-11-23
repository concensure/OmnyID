-- Migration 0030: Email Trigger Queue
-- Global queue written by the IMAP/Gmail/Graph sync loop after each successfully
-- ingested email. The email_trigger_dispatcher background task dequeues entries
-- and fires workflow runs for all users with registered email-family trigger
-- registrations, then marks each entry as dispatched.
--
-- Separate from AFP message storage so the dispatcher can work without
-- scanning per-tenant thread tables.

CREATE TABLE IF NOT EXISTS public.email_trigger_queue (
    -- Stable unique event ID (ULID string).
    event_id TEXT PRIMARY KEY,

    -- Mail provider that ingested the email (gmail_api, ms_graph, custom_imap, etc.).
    provider TEXT NOT NULL,

    -- The monitored account / inbox address.
    account TEXT NOT NULL,

    -- Extracted email metadata for payload_summary in trigger observations.
    email_subject TEXT,
    email_from    TEXT,

    -- Provider-specific message identifier (IMAP UID or Gmail/Graph message ID).
    message_uid TEXT,

    -- When the email was ingested by the sync loop.
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- NULL until the dispatcher has fired runs for this event.
    dispatched_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_trigger_queue_pending
    ON public.email_trigger_queue(processed_at ASC)
    WHERE dispatched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_trigger_queue_provider_account
    ON public.email_trigger_queue(provider, account, processed_at DESC);
