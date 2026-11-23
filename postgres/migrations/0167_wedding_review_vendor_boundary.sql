-- Vendor reply and report boundary for Wedding reviews.
-- Narrative remains in the authenticated vendor member's tenant-private AFP
-- store. Relational rows hold only workflow state, reason codes and pointers.

CREATE TABLE IF NOT EXISTS wedding_review_reports (
    report_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    reported_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    afp_message_id TEXT NOT NULL,
    reason_code TEXT NOT NULL CHECK (reason_code IN (
        'personal_information', 'abuse', 'unsupported_claim', 'conflict', 'policy_other'
    )),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
        'open', 'resolved', 'dismissed', 'withdrawn'
    )),
    handled_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    resolution_reason TEXT CHECK (resolution_reason IS NULL OR resolution_reason IN (
        'review_restricted', 'review_corrected', 'no_policy_breach', 'duplicate_report', 'other'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wedding_review_reports_queue
    ON wedding_review_reports (status, created_at)
    WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_wedding_review_reports_review
    ON wedding_review_reports (review_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS wedding_review_vendor_command_receipts (
    receipt_id TEXT PRIMARY KEY,
    actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 180),
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    command_kind TEXT NOT NULL CHECK (command_kind IN ('reply', 'report')),
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    result_id TEXT,
    result_status TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (actor_user_id, vendor_id, idempotency_key),
    CHECK ((completed_at IS NULL AND result_id IS NULL AND result_status IS NULL)
        OR (completed_at IS NOT NULL AND result_id IS NOT NULL AND result_status IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS wedding_review_reply_access_log (
    access_id TEXT PRIMARY KEY,
    reply_id TEXT NOT NULL REFERENCES wedding_review_vendor_replies(reply_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    operator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    purpose TEXT NOT NULL CHECK (purpose IN ('moderation', 'appeal', 'privacy')),
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wedding_review_reply_access_recent
    ON wedding_review_reply_access_log (reply_id, revision, operator_user_id, accessed_at DESC);

CREATE TABLE IF NOT EXISTS wedding_review_reply_moderation_receipts (
    receipt_id TEXT PRIMARY KEY,
    operator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 180),
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    reply_id TEXT NOT NULL REFERENCES wedding_review_vendor_replies(reply_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    result_status TEXT CHECK (result_status IS NULL OR result_status IN ('published', 'rejected')),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (operator_user_id, idempotency_key),
    CHECK ((completed_at IS NULL AND result_status IS NULL)
        OR (completed_at IS NOT NULL AND result_status IS NOT NULL))
);

ALTER TABLE wedding_review_vendor_replies
    ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

ALTER TABLE wedding_review_vendor_replies
    DROP CONSTRAINT IF EXISTS wedding_review_vendor_replies_moderation_reason_check;
ALTER TABLE wedding_review_vendor_replies
    ADD CONSTRAINT wedding_review_vendor_replies_moderation_reason_check
    CHECK (moderation_reason IS NULL OR moderation_reason IN (
        'approved', 'personal_information', 'abuse', 'unsupported_claim',
        'correction_required', 'policy_other'
    ));
