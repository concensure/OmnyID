-- Migration: 0059_auth_tokens_email_verify
-- Purpose: Add email_verified flag to users and shared auth_token table for email verification and password reset
-- Rules: additive only — no DROP, no ALTER TYPE removal, no column removal
--        new columns must have defaults or be nullable

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Back-fill: treat existing OAuth accounts and existing password accounts as verified
-- (they predate this feature; forcing re-verification on deploy would lock everyone out)
UPDATE users SET email_verified = TRUE WHERE auth_provider != 'password';
UPDATE users SET email_verified = TRUE WHERE created_at < NOW();

CREATE TABLE IF NOT EXISTS auth_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,          -- 'email_verify' | 'password_reset'
    token_hash  TEXT NOT NULL UNIQUE,   -- SHA-256 hex of the raw token
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_kind  ON auth_tokens(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_token_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires_at ON auth_tokens(expires_at);
