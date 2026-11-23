ALTER TABLE operator_runtime_remediation_receipts
    ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'issued',
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS outcome_note TEXT,
    ADD COLUMN IF NOT EXISTS proof_reference TEXT;

CREATE INDEX IF NOT EXISTS idx_operator_runtime_remediation_receipts_operator_status_time
    ON operator_runtime_remediation_receipts (operator_user_id, lifecycle_status, issued_at DESC, id DESC);
