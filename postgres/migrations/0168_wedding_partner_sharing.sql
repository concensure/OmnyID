-- Explicit, revocable partner membership for a shared Wedding plan.
-- General account data and contacts remain private. Only records carrying the
-- exact plan/workspace identity are projected across active memberships.

CREATE TABLE IF NOT EXISTS wedding_plan_memberships (
    wedding_owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    response_workspace_id TEXT NOT NULL,
    member_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'co_owner')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY (wedding_owner_user_id, wedding_plan_id, member_user_id)
);

CREATE INDEX IF NOT EXISTS wedding_plan_memberships_member_active_idx
    ON wedding_plan_memberships (member_user_id, status, wedding_plan_id);

CREATE TABLE IF NOT EXISTS wedding_partner_invites (
    invite_id TEXT PRIMARY KEY,
    wedding_owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    response_workspace_id TEXT NOT NULL,
    invited_email_digest TEXT NOT NULL,
    token_digest TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'co_owner' CHECK (role = 'co_owner'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    accepted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wedding_partner_invites_owner_idx
    ON wedding_partner_invites (wedding_owner_user_id, wedding_plan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wedding_shared_contact_grants (
    share_id TEXT PRIMARY KEY,
    wedding_owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    response_workspace_id TEXT NOT NULL,
    shared_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_ref TEXT NOT NULL,
    role_labels TEXT[] NOT NULL DEFAULT '{}',
    contact_ciphertext TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (wedding_owner_user_id, wedding_plan_id, shared_by_user_id, recipient_user_id, contact_ref)
);

CREATE INDEX IF NOT EXISTS wedding_shared_contact_grants_recipient_idx
    ON wedding_shared_contact_grants (recipient_user_id, status, wedding_plan_id, updated_at DESC);

-- Wedding plan labels are meaningful only inside an account. The original
-- review indexes assumed globally unique plan/workspace strings, which could
-- make two unrelated accounts collide when both used starter identifiers.
-- Partners still converge because their membership resolves to one owner.
DROP INDEX IF EXISTS uq_wedding_reviews_planner_workspace;
CREATE UNIQUE INDEX uq_wedding_reviews_planner_workspace
    ON wedding_reviews (owner_user_id, wedding_plan_id, response_workspace_id)
    WHERE subject_kind = 'planner';

DROP INDEX IF EXISTS uq_wedding_reviews_vendor_workspace;
CREATE UNIQUE INDEX uq_wedding_reviews_vendor_workspace
    ON wedding_reviews (owner_user_id, wedding_plan_id, response_workspace_id, vendor_id)
    WHERE subject_kind = 'vendor';
