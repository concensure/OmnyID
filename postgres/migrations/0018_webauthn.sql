-- 0018_webauthn.sql
-- WebAuthn / Passkey credential storage and ephemeral challenge tracking.
--
-- passkey_credentials: long-lived public keys registered per user per device.
-- passkey_challenges:  ephemeral 5-minute challenges used during reg/auth flows.
-- auth_sessions:       session tokens issued after successful passkey auth
--                      (the table likely already exists from earlier migrations;
--                       use CREATE TABLE IF NOT EXISTS to be idempotent).

CREATE TABLE IF NOT EXISTS passkey_credentials (
    credential_id       TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key_cbor     TEXT NOT NULL,          -- base64url CBOR-encoded COSE key
    sign_count          BIGINT NOT NULL DEFAULT 0,
    aaguid              TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    device_type         TEXT NOT NULL DEFAULT 'platform',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user_id
    ON passkey_credentials (user_id);

CREATE TABLE IF NOT EXISTS passkey_challenges (
    user_id             TEXT NOT NULL,
    kind                TEXT NOT NULL,          -- 'register' | 'authenticate'
    challenge           TEXT NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, kind)
);

-- Delete expired challenges automatically (requires pg_cron or application-level cleanup;
-- the WHERE expires_at > NOW() guard in the application is the primary protection).

-- Ensure auth_sessions has the auth_method column (idempotent ADD COLUMN).
ALTER TABLE auth_sessions
    ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'password';
