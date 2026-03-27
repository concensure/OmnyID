CREATE TABLE IF NOT EXISTS user_onboarding (
    owner_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    identity_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    email_provider TEXT,
    email_address TEXT,
    email_connected BOOLEAN NOT NULL DEFAULT FALSE,
    llm_mode TEXT NOT NULL DEFAULT 'byo_or_local',
    notes JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
