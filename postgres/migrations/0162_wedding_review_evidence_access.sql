-- Audited operator access and purge execution for protected Wedding review proof.
-- The log records purpose and actor only; attachment identifiers, storage keys,
-- reviewer contacts and evidence content stay outside immutable audit rows.

CREATE TABLE IF NOT EXISTS wedding_review_evidence_access_log (
    access_id TEXT PRIMARY KEY,
    evidence_ref_id TEXT NOT NULL REFERENCES wedding_review_evidence_refs(evidence_ref_id) ON DELETE CASCADE,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    operator_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    purpose_code TEXT NOT NULL CHECK (purpose_code IN (
        'eligibility', 'evidence', 'duplicate', 'conflict',
        'personal_information', 'appeal'
    )),
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wedding_review_evidence_access_review
    ON wedding_review_evidence_access_log (review_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_review_evidence_access_operator
    ON wedding_review_evidence_access_log (operator_user_id, accessed_at DESC);

-- Expired proof remains fail-closed while deletion is retried. The executor
-- marks a reference purged only after the underlying object has been removed.
CREATE INDEX IF NOT EXISTS idx_wedding_review_evidence_purge_due
    ON wedding_review_evidence_refs (expires_at, evidence_ref_id)
    WHERE status = 'purge_scheduled' AND purged_at IS NULL;
