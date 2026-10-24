-- Bound Knowledge Curator observability scans and retention deletes.
-- Runtime maintenance deletes rows older than seven days in committed batches.

CREATE INDEX IF NOT EXISTS curator_run_audit_created_at_idx
  ON curator_run_audit(created_at);

COMMENT ON TABLE curator_run_audit IS
  'Bounded Knowledge Curator run observability; runtime retention keeps approximately seven days.';
