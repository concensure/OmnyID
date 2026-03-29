CREATE TABLE IF NOT EXISTS sync_device_policies (
    device_id TEXT PRIMARY KEY REFERENCES sync_devices(device_id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    device_class TEXT NOT NULL,
    policy_profile TEXT NOT NULL,
    sync_slices JSONB NOT NULL DEFAULT '[]'::jsonb,
    requires_local_key_material BOOLEAN NOT NULL DEFAULT FALSE,
    notes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_bundle_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_device_policies_owner_user_id
    ON sync_device_policies(owner_user_id, updated_at DESC);
