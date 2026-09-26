-- Proactivity level per user (1 = suggestions only, 2 = confirm, 3 = full auto)
-- and per-user notification silence window.
CREATE TABLE IF NOT EXISTS user_proactivity_config (
    id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    owner_user_id   TEXT        NOT NULL UNIQUE,
    level           INTEGER     NOT NULL DEFAULT 2 CHECK (level BETWEEN 1 AND 3),
    silence_until   TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
