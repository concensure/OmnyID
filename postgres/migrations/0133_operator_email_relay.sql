-- False-default, content-minimising operator alias relay.
-- Message bodies remain in transit only. Recipient addresses are encrypted;
-- equality and correlation use SHA-256 digests and provider message IDs.

CREATE TABLE IF NOT EXISTS operator_email_relay_threads (
    relay_thread_id TEXT PRIMARY KEY,
    alias_address TEXT NOT NULL,
    operator_address_digest TEXT NOT NULL CHECK (operator_address_digest ~ '^[a-f0-9]{64}$'),
    operator_ciphertext JSONB NOT NULL,
    recipient_address_digest TEXT NOT NULL CHECK (recipient_address_digest ~ '^[a-f0-9]{64}$'),
    recipient_ciphertext JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'bounced', 'closed', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    CHECK (lower(alias_address) = alias_address),
    CHECK (alias_address ~ '^[a-z0-9][a-z0-9._-]{0,62}@omnyid[.]com$'),
    CHECK (jsonb_typeof(operator_ciphertext) = 'object'),
    CHECK (jsonb_typeof(recipient_ciphertext) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_operator_email_relay_threads_alias_status
    ON operator_email_relay_threads (alias_address, status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_operator_email_relay_threads_retention
    ON operator_email_relay_threads (status, last_activity_at);

CREATE TABLE IF NOT EXISTS operator_email_relay_events (
    provider_event_id TEXT PRIMARY KEY,
    relay_thread_id TEXT NOT NULL REFERENCES operator_email_relay_threads(relay_thread_id) ON DELETE RESTRICT,
    direction TEXT NOT NULL CHECK (direction IN (
        'operator_to_external', 'external_to_operator'
    )),
    payload_digest TEXT NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
    source_message_id TEXT,
    outbound_message_id TEXT,
    processing_status TEXT NOT NULL DEFAULT 'reserved'
        CHECK (processing_status IN (
            'reserved', 'accepted', 'delivered', 'bounced', 'suppressed', 'rejected', 'failed'
        )),
    attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CHECK (source_message_id IS NULL OR length(source_message_id) <= 998),
    CHECK (outbound_message_id IS NULL OR length(outbound_message_id) <= 998),
    CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_operator_email_relay_outbound_message
    ON operator_email_relay_events (outbound_message_id)
    WHERE outbound_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operator_email_relay_event_thread
    ON operator_email_relay_events (relay_thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operator_email_relay_event_source_message
    ON operator_email_relay_events (source_message_id)
    WHERE source_message_id IS NOT NULL;

COMMENT ON TABLE operator_email_relay_threads IS
    'Private operational alias relay bindings; no subject or message body is retained.';
COMMENT ON TABLE operator_email_relay_events IS
    'Idempotency, correlation, and provider outcome receipts for the operator relay.';
