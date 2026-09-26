-- Proactive Privacy & Token Budget infrastructure.
--
-- user_llm_providers: encrypted user-supplied API keys for privacy-first LLM escalation.
-- user_token_budget:  per-user daily token limit config (overrides system default of 50k).

CREATE TABLE IF NOT EXISTS user_llm_providers (
    id                  TEXT        NOT NULL,
    owner_user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider            TEXT        NOT NULL,   -- 'openai' | 'anthropic' | 'grok' | 'ollama' | 'openai_compat'
    display_name        TEXT        NOT NULL,
    encrypted_api_key   TEXT,                   -- NULL for ollama/self-hosted
    base_url            TEXT,                   -- for ollama / openai-compat endpoints
    model_id            TEXT        NOT NULL,   -- e.g. 'gpt-4o-mini', 'claude-haiku-4-5-20251001'
    priority            INTEGER     NOT NULL DEFAULT 10,  -- lower = preferred (1 = highest)
    enabled             BOOLEAN     NOT NULL DEFAULT TRUE,
    consent_given_at    TIMESTAMPTZ,            -- non-NULL = user gave explicit privacy consent
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, owner_user_id),
    UNIQUE (owner_user_id, provider, model_id)
);

CREATE INDEX IF NOT EXISTS idx_user_llm_providers_owner
    ON user_llm_providers (owner_user_id, enabled, priority);

-- Per-user daily token budget config.
CREATE TABLE IF NOT EXISTS user_token_budget (
    owner_user_id           TEXT        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    daily_limit_tokens      INTEGER     NOT NULL DEFAULT 50000,
    alert_threshold_pct     INTEGER     NOT NULL DEFAULT 80,
    escalation_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
