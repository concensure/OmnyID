CREATE TABLE IF NOT EXISTS wedding_invite_proposal_vendor_feed_grants (
    grant_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    issued_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    authority TEXT NOT NULL CHECK (authority IN ('operator', 'claimed_vendor')),
    token_digest TEXT NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_viewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wedding_invite_proposal_vendor_feed_grants_vendor
    ON wedding_invite_proposal_vendor_feed_grants (vendor_id, created_at DESC);

ALTER TABLE wedding_invite_proposal_responses
    ADD COLUMN IF NOT EXISTS response_kind TEXT NOT NULL DEFAULT 'proposal',
    ADD COLUMN IF NOT EXISTS available_date DATE;

ALTER TABLE wedding_invite_proposal_responses
    DROP CONSTRAINT IF EXISTS wedding_invite_proposal_responses_channel_check;
ALTER TABLE wedding_invite_proposal_responses
    ADD CONSTRAINT wedding_invite_proposal_responses_channel_check
    CHECK (channel IN ('claimed_vendor', 'secure_referral', 'vendor_feed'));

ALTER TABLE wedding_invite_proposal_responses
    DROP CONSTRAINT IF EXISTS wedding_invite_proposal_responses_response_kind_check;
ALTER TABLE wedding_invite_proposal_responses
    ADD CONSTRAINT wedding_invite_proposal_responses_response_kind_check
    CHECK (response_kind IN ('proposal', 'available_date', 'notify_couple'));
