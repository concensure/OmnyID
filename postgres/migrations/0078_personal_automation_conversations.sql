-- 0078_personal_automation_conversations:
-- Durable per-user conversation registry for personal automation flows.

CREATE TABLE IF NOT EXISTS personal_automation_conversations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    account_ref TEXT NOT NULL DEFAULT '',
    conversation_key TEXT NOT NULL,
    conversation_family TEXT NOT NULL DEFAULT 'communications',
    display_label TEXT NOT NULL DEFAULT '',
    latest_message_ref TEXT,
    latest_subject TEXT,
    latest_sender TEXT,
    health_state TEXT NOT NULL DEFAULT 'active'
        CHECK (health_state IN ('active', 'archived', 'unknown')),
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (user_id, provider, account_ref, conversation_key)
);

CREATE INDEX IF NOT EXISTS idx_personal_automation_conversations_user
    ON personal_automation_conversations (user_id, conversation_family, last_observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_personal_automation_conversations_key
    ON personal_automation_conversations (user_id, provider, account_ref, conversation_key);
