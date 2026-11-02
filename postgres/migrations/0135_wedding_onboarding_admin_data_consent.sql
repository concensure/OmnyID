ALTER TABLE wedding_user_onboarding_state
    ADD COLUMN IF NOT EXISTS admin_data_consent BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN wedding_user_onboarding_state.admin_data_consent IS
    'Explicit couple choice to share de-identified wedding planning data with authorised OmnyID administrators.';
