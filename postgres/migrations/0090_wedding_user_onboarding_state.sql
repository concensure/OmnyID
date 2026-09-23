CREATE TABLE IF NOT EXISTS wedding_user_onboarding_state (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    intake_variant TEXT NOT NULL
        CHECK (intake_variant IN ('wedding_site', 'generic')),
    entry_source TEXT NOT NULL
        CHECK (entry_source IN ('wedding_site', 'generic')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, wedding_plan_id)
);

CREATE INDEX IF NOT EXISTS idx_wedding_user_onboarding_state_user
    ON wedding_user_onboarding_state (user_id);
