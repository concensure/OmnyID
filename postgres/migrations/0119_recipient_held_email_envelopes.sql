-- Bind quarantined email ciphertext to the verified vendor AgentCard key that
-- can open it. Private key material is never stored by the homeserver.
ALTER TABLE wedding_vendor_email_ingress_quarantine
    ADD COLUMN IF NOT EXISTS recipient_agent_id TEXT,
    ADD COLUMN IF NOT EXISTS recipient_key_id TEXT;

ALTER TABLE wedding_vendor_email_ingress_quarantine
    DROP CONSTRAINT IF EXISTS wedding_vendor_email_recipient_envelope_binding;
ALTER TABLE wedding_vendor_email_ingress_quarantine
    ADD CONSTRAINT wedding_vendor_email_recipient_envelope_binding CHECK (
        COALESCE(ciphertext_envelope->>'mode', '') <> 'recipient-x25519-v1'
        OR (
            recipient_agent_id IS NOT NULL
            AND recipient_key_id IS NOT NULL
            AND char_length(recipient_agent_id) BETWEEN 1 AND 180
            AND char_length(recipient_key_id) BETWEEN 1 AND 180
        )
    );

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_email_ingress_recipient_key
    ON wedding_vendor_email_ingress_quarantine
       (owner_user_id, recipient_agent_id, recipient_key_id, received_at DESC);

COMMENT ON COLUMN wedding_vendor_email_ingress_quarantine.recipient_agent_id IS
    'Verified recipient AgentCard identity; private key remains on recipient device.';
COMMENT ON COLUMN wedding_vendor_email_ingress_quarantine.recipient_key_id IS
    'AgentCard key version used by the recipient-x25519-v1 envelope.';
