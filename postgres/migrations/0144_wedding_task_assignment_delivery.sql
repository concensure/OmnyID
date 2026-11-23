-- Idempotent receipts for explicit Wedding task-assignment delivery.
-- Recipient addresses are never retained in plaintext.
CREATE TABLE IF NOT EXISTS wedding_task_assignment_deliveries (
    delivery_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_email_digest TEXT NOT NULL,
    recipient_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    wedding_plan_id TEXT NOT NULL,
    response_workspace_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    assignment_fingerprint TEXT NOT NULL,
    research_input_hash TEXT,
    status TEXT NOT NULL CHECK (status IN ('prepared', 'sending', 'sent', 'failed')),
    provider_message_id TEXT,
    agent_message_id TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, assignment_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_wedding_task_assignment_delivery_owner
    ON wedding_task_assignment_deliveries (owner_user_id, updated_at DESC);

REVOKE ALL ON TABLE wedding_task_assignment_deliveries FROM PUBLIC;
