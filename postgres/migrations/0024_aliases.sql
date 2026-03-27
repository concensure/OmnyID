-- Migration 0024: Global Agent Alias Registry
-- Provides memorable human-readable handles for agent identities (e.g. "alicesmith" → alicesmith@omnyid.com)

CREATE TABLE IF NOT EXISTS public.aliases (
    alias            TEXT        NOT NULL,
    agent_id         TEXT        NOT NULL,
    user_id          TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT aliases_pkey             PRIMARY KEY (alias),
    -- Minimum 7 characters
    CONSTRAINT aliases_alias_min_length CHECK (char_length(alias) >= 7),
    -- Lowercase alphanumeric + internal hyphens only; cannot start or end with hyphen
    CONSTRAINT aliases_alias_format     CHECK (alias ~ '^[a-z0-9][a-z0-9\-]*[a-z0-9]$'),
    -- Must already be lowercase (belt-and-suspenders)
    CONSTRAINT aliases_alias_lowercase  CHECK (alias = lower(alias)),

    CONSTRAINT aliases_user_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Each user holds at most one alias at a time
CREATE UNIQUE INDEX IF NOT EXISTS aliases_user_id_unique ON public.aliases(user_id);

-- Fast lookup by agent_id (resolving alias → cryptographic identity)
CREATE INDEX IF NOT EXISTS aliases_agent_id_idx ON public.aliases(agent_id);
