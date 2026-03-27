-- 0020_gmail_tokens: per-user Gmail OAuth token storage
CREATE TABLE IF NOT EXISTS user_gmail_tokens (
    user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token  TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL DEFAULT '',
    token_expiry  TIMESTAMPTZ,
    gmail_email   TEXT NOT NULL DEFAULT '',
    connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
