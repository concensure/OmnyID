CREATE TABLE IF NOT EXISTS outbound_email_receipts (
    id BIGSERIAL PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_email_receipts_message_id
    ON outbound_email_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_outbound_email_receipts_thread_id
    ON outbound_email_receipts(thread_id);

CREATE TABLE IF NOT EXISTS integration_capabilities (
    capability_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    operation TEXT NOT NULL,
    transport TEXT NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    approval_mode TEXT NOT NULL,
    secret_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_audit_log (
    id BIGSERIAL PRIMARY KEY,
    capability_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    status TEXT NOT NULL,
    output JSONB NOT NULL DEFAULT '{}'::jsonb,
    external_reference TEXT,
    recorded_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_audit_log_thread_id
    ON action_audit_log(thread_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS sync_devices (
    device_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    electric_project_url TEXT NOT NULL,
    encrypted_seed_ref TEXT NOT NULL,
    pglite_path TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personalization_events (
    event_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    actor_agent_id TEXT NOT NULL,
    signal TEXT NOT NULL,
    rationale TEXT,
    captured_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_personalization_events_thread_id
    ON personalization_events(thread_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS lora_artifacts (
    artifact_id TEXT PRIMARY KEY,
    base_model TEXT NOT NULL,
    storage_uri TEXT NOT NULL,
    version TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    supersedes TEXT
);
