-- Idempotent author lifecycle commands for Wedding reviews.
-- Receipts contain no narrative, evidence identifiers or contact details.

CREATE TABLE IF NOT EXISTS wedding_review_lifecycle_receipts (
    receipt_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    command TEXT NOT NULL CHECK (command IN ('withdraw')),
    idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 180),
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    revision BIGINT NOT NULL CHECK (revision > 0),
    result_status TEXT NOT NULL CHECK (result_status IN ('withdrawn')),
    affected_publications INTEGER NOT NULL DEFAULT 0 CHECK (affected_publications >= 0),
    scheduled_evidence INTEGER NOT NULL DEFAULT 0 CHECK (scheduled_evidence >= 0),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (actor_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_wedding_review_lifecycle_receipts_review
    ON wedding_review_lifecycle_receipts (review_id, completed_at DESC);
