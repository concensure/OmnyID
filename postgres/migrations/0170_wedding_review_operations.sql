-- Operational completion for Wedding reviews: neutral invitations, author
-- appeals, content-free delivery evidence and privacy-safe aggregate metrics.
-- Review prose and evidence remain in the existing tenant-private AFP stores.

ALTER TABLE wedding_review_invitations
    ADD COLUMN IF NOT EXISTS invited_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'not_requested'
        CHECK (delivery_status IN ('not_requested', 'delivered', 'failed', 'suppressed')),
    ADD COLUMN IF NOT EXISTS delivery_message_id TEXT,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suppression_reason TEXT,
    ADD COLUMN IF NOT EXISTS request_key TEXT;

CREATE INDEX IF NOT EXISTS idx_wedding_review_invitations_user
    ON wedding_review_invitations (invited_user_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_review_invitations_request
    ON wedding_review_invitations (created_by_user_id, request_key)
    WHERE request_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS wedding_review_appeals (
    appeal_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason_code TEXT NOT NULL CHECK (reason_code IN (
        'eligibility', 'evidence', 'personal_information',
        'unsupported_claim', 'correction_required', 'policy_other'
    )),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'withdrawn')),
    resolution_code TEXT CHECK (resolution_code IS NULL OR resolution_code IN (
        'upheld', 'reopened', 'correction_requested', 'withdrawn'
    )),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    CHECK ((status='open' AND resolution_code IS NULL AND resolved_at IS NULL)
        OR status<>'open')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_review_appeals_open
    ON wedding_review_appeals (review_id)
    WHERE status='open';
CREATE INDEX IF NOT EXISTS idx_wedding_review_appeals_queue
    ON wedding_review_appeals (status, submitted_at);

ALTER TABLE wedding_review_events
    DROP CONSTRAINT IF EXISTS wedding_review_events_event_kind_check;
ALTER TABLE wedding_review_events
    ADD CONSTRAINT wedding_review_events_event_kind_check CHECK (event_kind IN (
        'draft_saved', 'submitted', 'evidence_requested', 'evidence_decided',
        'moderation_decided', 'published', 'correction_submitted', 'restricted',
        'restored', 'withdrawn', 'invitation_sent', 'invitation_opened',
        'invitation_reminded', 'invitation_suppressed', 'invitation_declined',
        'invitation_opted_out', 'appeal_submitted', 'appeal_resolved',
        'vendor_reply_submitted', 'vendor_reply_published', 'report_created'
    ));
