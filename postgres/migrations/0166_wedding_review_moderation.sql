-- Audited, idempotent operator moderation for Wedding reviews.
-- Narrative remains in the authored tenant-private AFP revision. This schema
-- stores only access facts, command receipts and the deliberately bounded
-- public snapshot created by the application.

CREATE TABLE IF NOT EXISTS wedding_review_moderation_access_log (
    access_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    operator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    purpose_code TEXT NOT NULL CHECK (purpose_code IN (
        'moderation', 'privacy', 'appeal', 'duplicate', 'conflict'
    )),
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wedding_review_moderation_access_recent
    ON wedding_review_moderation_access_log
       (review_id, revision, operator_user_id, accessed_at DESC);

CREATE TABLE IF NOT EXISTS wedding_review_moderation_receipts (
    receipt_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    moderator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 180),
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    decision TEXT NOT NULL CHECK (decision IN (
        'request_evidence', 'approve', 'reject', 'restrict', 'restore', 'return_for_correction'
    )),
    result_status TEXT NOT NULL CHECK (result_status IN (
        'evidence_requested', 'published', 'rejected', 'restricted', 'restored'
    )),
    publication_id TEXT REFERENCES wedding_review_publications(publication_id) ON DELETE SET NULL,
    decision_id TEXT NOT NULL REFERENCES wedding_review_moderation_decisions(decision_id)
        ON DELETE RESTRICT,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (moderator_user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_wedding_review_moderation_receipts_review
    ON wedding_review_moderation_receipts (review_id, revision, completed_at DESC);
