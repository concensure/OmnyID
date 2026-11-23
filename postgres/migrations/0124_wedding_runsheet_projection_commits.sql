-- Content-light coordination state for deterministic wedding run-sheet AFP
-- projection. The run-sheet rows and receipts remain in each account's AFP
-- ledger; these tables only serialize checkpoint advancement and retries.
CREATE TABLE IF NOT EXISTS wedding_runsheet_projection_checkpoints (
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    database_id TEXT NOT NULL,
    wedding_plan_id TEXT NOT NULL,
    projector_id TEXT NOT NULL,
    projector_version INTEGER NOT NULL CHECK (projector_version >= 0),
    source_cursor TEXT,
    source_fingerprint TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_user_id, database_id, projector_id)
);

CREATE TABLE IF NOT EXISTS wedding_runsheet_projection_commits (
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    database_id TEXT NOT NULL,
    wedding_plan_id TEXT NOT NULL,
    projector_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    source_cursor TEXT NOT NULL,
    source_fingerprint TEXT NOT NULL,
    projector_version INTEGER NOT NULL CHECK (projector_version > 0),
    message_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    affected_record_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_wedding_runsheet_projection_commits_database
    ON wedding_runsheet_projection_commits
    (owner_user_id, database_id, committed_at DESC);
