-- Claim-specific Wedding review eligibility decisions.
-- Assessments contain only bounded signal/reason codes. Evidence content,
-- source identifiers, reviewer contacts and private matching fields stay in
-- their existing protected authorities.

ALTER TABLE wedding_reviews
    ADD COLUMN IF NOT EXISTS verification_version BIGINT NOT NULL DEFAULT 0
        CHECK (verification_version >= 0);

CREATE TABLE IF NOT EXISTS wedding_review_eligibility_assessments (
    assessment_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    verification_version BIGINT NOT NULL CHECK (verification_version > 0),
    verification_state TEXT NOT NULL CHECK (verification_state IN (
        'pending', 'verified_activity', 'verified_booking',
        'verified_wedding_held', 'insufficient', 'conflicted'
    )),
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    probable_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
    reason_codes TEXT[] NOT NULL,
    signal_codes TEXT[] NOT NULL,
    assessed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (review_id, verification_version),
    UNIQUE (review_id, idempotency_key),
    CHECK (cardinality(reason_codes) BETWEEN 1 AND 8),
    CHECK (cardinality(signal_codes) <= 16)
);

CREATE INDEX IF NOT EXISTS idx_wedding_review_eligibility_queue
    ON wedding_review_eligibility_assessments
    (probable_duplicate, verification_state, created_at DESC)
    WHERE probable_duplicate OR verification_state IN ('pending', 'insufficient', 'conflicted');

ALTER TABLE wedding_review_events
    DROP CONSTRAINT IF EXISTS wedding_review_events_event_kind_check;

ALTER TABLE wedding_review_events
    ADD CONSTRAINT wedding_review_events_event_kind_check CHECK (event_kind IN (
        'draft_saved', 'submitted', 'evidence_requested', 'evidence_decided',
        'eligibility_decided', 'moderation_decided', 'published',
        'correction_submitted', 'restricted', 'restored', 'withdrawn',
        'invitation_sent', 'invitation_suppressed', 'vendor_reply_submitted',
        'vendor_reply_published', 'report_created'
    ));
