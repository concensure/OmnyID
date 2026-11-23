-- Revisioned Wedding membership authority for cross-domain couple coworking.
-- The revision namespaces caches and subscriptions so revocation cannot keep
-- serving stale shared projections. It does not broaden any personal scope.

ALTER TABLE wedding_plan_memberships
    ADD COLUMN IF NOT EXISTS membership_revision BIGINT NOT NULL DEFAULT 1
        CHECK (membership_revision > 0),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS wedding_plan_memberships_scope_revision_idx
    ON wedding_plan_memberships
       (member_user_id, wedding_plan_id, response_workspace_id,
        status, membership_revision);
