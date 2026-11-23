CREATE TABLE IF NOT EXISTS runtime_restore_drills (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    backup_id TEXT NOT NULL REFERENCES runtime_backups(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    notes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runtime_restore_drills_owner_started_at
    ON runtime_restore_drills (owner_user_id, started_at DESC);
