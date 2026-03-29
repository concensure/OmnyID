-- 0025_agent_preferences.sql
-- Agent optimization preferences per user.
-- Stores optimization_mode, auto_confirm_threshold, and show_cost_estimates.

CREATE TABLE IF NOT EXISTS user_agent_preferences (
    owner_user_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    -- "speed" | "cost" | "balanced"
    optimization_mode          TEXT    NOT NULL DEFAULT 'balanced',
    -- Auto-confirm if cost is below this threshold (in cents)
    auto_confirm_threshold_cents DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    -- Whether to display cost estimates in the generative card UI
    show_cost_estimates        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS so users can only read/write their own preferences
ALTER TABLE user_agent_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_agent_preferences_owner_policy ON user_agent_preferences
    USING (owner_user_id = current_setting('app.current_user_id', true));
