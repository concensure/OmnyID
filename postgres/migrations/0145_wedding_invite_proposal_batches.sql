CREATE TABLE IF NOT EXISTS wedding_invite_proposal_batches (
    batch_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    brief_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    approval_fingerprint TEXT NOT NULL CHECK (approval_fingerprint ~ '^[a-f0-9]{64}$'),
    status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('approved', 'sending', 'partial', 'accepted', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, approval_fingerprint)
);

CREATE TABLE IF NOT EXISTS wedding_invite_proposal_deliveries (
    batch_id TEXT NOT NULL REFERENCES wedding_invite_proposal_batches(batch_id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE RESTRICT,
    destination_digest TEXT NOT NULL CHECK (destination_digest ~ '^[a-f0-9]{64}$'),
    draft_message_id TEXT NOT NULL,
    client_message_id TEXT NOT NULL,
    provider_message_id TEXT,
    route TEXT NOT NULL CHECK (route IN ('authenticated_vendor', 'verified_email', 'unclaimed_referral')),
    status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('approved', 'sending', 'accepted', 'failed')),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_id, vendor_id),
    UNIQUE (owner_user_id, draft_message_id)
);

CREATE INDEX IF NOT EXISTS idx_wedding_invite_proposal_batches_owner
    ON wedding_invite_proposal_batches (owner_user_id, created_at DESC);
