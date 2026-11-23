-- Routing sidecar for the ciphertext-only enquiry envelope store introduced in 0103.
-- Commercial projection and response bodies remain inside wedding_enquiry_envelopes.envelope.
CREATE TABLE IF NOT EXISTS quotation_vendor_response_transports (
    message_id TEXT PRIMARY KEY REFERENCES wedding_enquiry_envelopes(message_id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grant_message_id TEXT NOT NULL,
    grant_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    quotation_id TEXT NOT NULL,
    quotation_version_id TEXT NOT NULL,
    projection_fingerprint TEXT NOT NULL CHECK (projection_fingerprint ~ '^[0-9a-fA-F]{64}$'),
    response_id TEXT,
    response_fingerprint TEXT CHECK (response_fingerprint IS NULL OR response_fingerprint ~ '^[0-9a-fA-F]{64}$'),
    transport_nonce TEXT NOT NULL,
    agent_card_key_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    request_digest TEXT NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    direction TEXT NOT NULL CHECK (direction IN ('to_vendor', 'to_couple')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vendor_id, direction, transport_nonce),
    UNIQUE (vendor_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_qvrt_vendor_inbox
    ON quotation_vendor_response_transports (vendor_id, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qvrt_owner_thread
    ON quotation_vendor_response_transports (owner_user_id, quotation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qvrt_grant
    ON quotation_vendor_response_transports (grant_message_id, direction, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_qvrt_response_material
    ON quotation_vendor_response_transports (vendor_id, grant_id, response_fingerprint)
    WHERE direction = 'to_couple' AND response_fingerprint IS NOT NULL;

-- Receipts contain request hashes and outcome codes only. Rejected commercial payloads are never stored.
CREATE TABLE IF NOT EXISTS quotation_vendor_response_transport_receipts (
    receipt_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    request_digest TEXT NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
    failure_code TEXT,
    message_id TEXT REFERENCES wedding_enquiry_envelopes(message_id) ON DELETE SET NULL,
    received_at TIMESTAMPTZ NOT NULL,
    UNIQUE (vendor_id, request_id),
    CHECK ((status = 'accepted' AND message_id IS NOT NULL AND failure_code IS NULL)
        OR (status = 'rejected' AND message_id IS NULL AND failure_code IS NOT NULL))
);
