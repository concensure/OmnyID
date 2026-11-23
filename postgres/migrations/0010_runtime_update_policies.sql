CREATE TABLE IF NOT EXISTS runtime_update_policies (
    owner_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    update_channel TEXT NOT NULL DEFAULT 'stable',
    auto_apply TEXT NOT NULL DEFAULT 'manual_only',
    last_checked_at TIMESTAMPTZ,
    last_applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (update_channel IN ('stable', 'manual_only')),
    CHECK (auto_apply IN ('manual_only', 'scaffold_refresh_only'))
);
