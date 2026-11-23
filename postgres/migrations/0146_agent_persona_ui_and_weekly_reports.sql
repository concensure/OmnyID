-- Account-scoped presentation preferences and bounded persona avatars.
ALTER TABLE agent_personas
    ADD COLUMN IF NOT EXISTS image_data_url TEXT;

ALTER TABLE agent_personas
    DROP CONSTRAINT IF EXISTS agent_personas_image_data_url_size;
ALTER TABLE agent_personas
    ADD CONSTRAINT agent_personas_image_data_url_size
    CHECK (image_data_url IS NULL OR octet_length(image_data_url) <= 180000);

CREATE TABLE IF NOT EXISTS user_agent_ui_preferences (
    owner_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    persona_fab_visible BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A content-free receipt makes the weekly operator report replay-safe across
-- restarts and multiple replicas. It stores no email body or account details.
CREATE TABLE IF NOT EXISTS weekly_operator_report_receipts (
    report_week DATE PRIMARY KEY,
    recipient_digest TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('sending', 'accepted', 'failed')),
    provider_reference TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ
);
