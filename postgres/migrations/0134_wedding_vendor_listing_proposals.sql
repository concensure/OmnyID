-- Private vendor-proposed listings. The canonical directory row remains hidden
-- until ownership is verified and an operator explicitly publishes it.

CREATE TABLE IF NOT EXISTS wedding_vendor_listing_proposals (
    proposal_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL UNIQUE REFERENCES wedding_vendors(vendor_id) ON DELETE RESTRICT,
    claim_id TEXT NOT NULL UNIQUE REFERENCES wedding_vendor_claims(claim_id) ON DELETE RESTRICT,
    claimant_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    proposal_fingerprint TEXT NOT NULL CHECK (proposal_fingerprint ~ '^[a-f0-9]{64}$'),
    afp_message_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'awaiting_ownership'
        CHECK (status IN ('awaiting_ownership', 'awaiting_review', 'published', 'rejected')),
    review_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    CHECK (jsonb_typeof(review_evidence) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_listing_proposal_open_fingerprint
    ON wedding_vendor_listing_proposals (proposal_fingerprint)
    WHERE status IN ('awaiting_ownership', 'awaiting_review');
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_listing_proposals_claimant
    ON wedding_vendor_listing_proposals (claimant_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_listing_proposals_review
    ON wedding_vendor_listing_proposals (status, created_at);

COMMENT ON TABLE wedding_vendor_listing_proposals IS
    'Private vendor-authored directory proposals; never selected by public directory queries before publication.';
