-- Durable peer key cache (Phase 2: key lifecycle)
-- Stores discovered AgentCard public keys so peer key wrapping survives server restarts.

CREATE TABLE IF NOT EXISTS peer_keys (
    agent_id           TEXT        NOT NULL,
    key_id             TEXT        NOT NULL,
    public_key_hex     TEXT        NOT NULL,
    homeserver_url     TEXT        NOT NULL,
    previous_key_ids   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    discovered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at         TIMESTAMPTZ,
    revoked_at         TIMESTAMPTZ,
    PRIMARY KEY (agent_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_peer_keys_agent ON peer_keys (agent_id);

-- Key rotation audit log: every server-side rotation creates one record
CREATE TABLE IF NOT EXISTS key_rotation_events (
    id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    agent_id        TEXT        NOT NULL,
    old_key_id      TEXT        NOT NULL,
    new_key_id      TEXT        NOT NULL,
    new_public_key  TEXT        NOT NULL,
    rotated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason          TEXT
);
