CREATE TABLE IF NOT EXISTS operator_runtime_remediation_receipts (
    id TEXT PRIMARY KEY,
    operator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    execution_mode TEXT NOT NULL,
    approval_required BOOLEAN NOT NULL DEFAULT TRUE,
    summary TEXT NOT NULL,
    command TEXT NOT NULL,
    source TEXT NOT NULL,
    guidance_status TEXT NOT NULL,
    pressure_status TEXT,
    pressure_total_rows BIGINT,
    cleanup_mode TEXT,
    artifact_generated_at TIMESTAMPTZ,
    note TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operator_runtime_remediation_receipts_operator_time
    ON operator_runtime_remediation_receipts (operator_user_id, issued_at DESC, id DESC);
