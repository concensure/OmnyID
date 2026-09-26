-- 0049_notification_source_filters.sql
-- Granular source filters for calendar/email proactive notifications.

ALTER TABLE user_agent_preferences
    ADD COLUMN IF NOT EXISTS calendar_notification_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS email_notification_filters JSONB NOT NULL DEFAULT '{}'::jsonb;

