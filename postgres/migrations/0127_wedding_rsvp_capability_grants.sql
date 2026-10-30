-- Content-light bearer grants for household-scoped Wedding RSVP invitations.
-- Public tokens are returned once and never stored; only SHA-256 digests remain.
CREATE TABLE IF NOT EXISTS wedding_rsvp_capability_grants (
    grant_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    response_workspace_id TEXT NOT NULL,
    household_id TEXT NOT NULL,
    invitation_ids JSONB NOT NULL,
    token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    expired_event_at TIMESTAMPTZ,
    last_opened_at TIMESTAMPTZ,
    open_count BIGINT NOT NULL DEFAULT 0 CHECK (open_count >= 0),
    rotated_from_grant_id TEXT REFERENCES wedding_rsvp_capability_grants(grant_id),
    replaced_by_grant_id TEXT REFERENCES wedding_rsvp_capability_grants(grant_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (jsonb_typeof(invitation_ids) = 'array'),
    CHECK (jsonb_array_length(invitation_ids) BETWEEN 1 AND 100),
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_wedding_rsvp_capability_owner
    ON wedding_rsvp_capability_grants
    (owner_user_id, response_workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wedding_rsvp_capability_expiry
    ON wedding_rsvp_capability_grants (expires_at)
    WHERE revoked_at IS NULL;
