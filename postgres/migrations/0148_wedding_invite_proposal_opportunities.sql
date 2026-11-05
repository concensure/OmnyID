CREATE TABLE IF NOT EXISTS wedding_invite_proposal_opportunities (
    opportunity_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    response_workspace_id TEXT NOT NULL,
    brief_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 120),
    location TEXT,
    brief_text TEXT NOT NULL CHECK (char_length(brief_text) BETWEEN 1 AND 8000),
    shared_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, brief_id)
);

CREATE INDEX IF NOT EXISTS idx_wedding_invite_proposal_opportunities_category
    ON wedding_invite_proposal_opportunities (lower(category), status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_invite_proposal_opportunities_owner
    ON wedding_invite_proposal_opportunities (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wedding_invite_proposal_share_grants (
    grant_id TEXT PRIMARY KEY,
    opportunity_id TEXT NOT NULL REFERENCES wedding_invite_proposal_opportunities(opportunity_id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_digest TEXT NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_viewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS wedding_invite_proposal_responses (
    response_id TEXT PRIMARY KEY,
    opportunity_id TEXT NOT NULL REFERENCES wedding_invite_proposal_opportunities(opportunity_id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_id TEXT REFERENCES wedding_vendors(vendor_id) ON DELETE SET NULL,
    channel TEXT NOT NULL CHECK (channel IN ('claimed_vendor', 'secure_referral')),
    response_fingerprint TEXT NOT NULL CHECK (response_fingerprint ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (opportunity_id, response_fingerprint)
);

CREATE TABLE IF NOT EXISTS wedding_invite_proposal_events (
    event_id TEXT PRIMARY KEY,
    opportunity_id TEXT NOT NULL REFERENCES wedding_invite_proposal_opportunities(opportunity_id) ON DELETE CASCADE,
    event_kind TEXT NOT NULL CHECK (event_kind IN ('published', 'share_link_created', 'secure_link_view', 'claimed_vendor_view', 'response_received', 'opportunity_closed')),
    vendor_id TEXT REFERENCES wedding_vendors(vendor_id) ON DELETE SET NULL,
    dedupe_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (opportunity_id, event_kind, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_wedding_invite_proposal_events_rollup
    ON wedding_invite_proposal_events (opportunity_id, event_kind, created_at DESC);
