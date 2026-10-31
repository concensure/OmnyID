-- Authenticated delegated Family Boundary access and opaque mutable private notes.
-- These are content-light enforcement/mutable indexes. AFP remains the durable
-- domain history and records only redacted references to private note changes.

CREATE TABLE IF NOT EXISTS wedding_boundary_delegated_grants (
    grant_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delegate_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    response_workspace_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('planner', 'rsvp_guest')),
    person_id TEXT,
    household_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    allowed_actions JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (owner_user_id <> delegate_user_id),
    CHECK (jsonb_typeof(household_ids) = 'array'),
    CHECK (jsonb_array_length(household_ids) <= 50),
    CHECK (jsonb_typeof(allowed_actions) = 'array'),
    CHECK (jsonb_array_length(allowed_actions) BETWEEN 1 AND 8),
    CHECK ((role = 'rsvp_guest' AND person_id IS NOT NULL) OR role = 'planner'),
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_wedding_boundary_delegated_grants_owner
    ON wedding_boundary_delegated_grants
    (owner_user_id, response_workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wedding_boundary_delegated_grants_delegate
    ON wedding_boundary_delegated_grants
    (delegate_user_id, expires_at DESC)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS wedding_boundary_private_notes (
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    response_workspace_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    ciphertext TEXT NOT NULL CHECK (
        length(ciphertext) > length('encrypted:v1:')
        AND length(ciphertext) <= 32768
        AND ciphertext LIKE 'encrypted:v1:%'
    ),
    version BIGINT NOT NULL CHECK (version >= 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_user_id, wedding_plan_id, response_workspace_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_wedding_boundary_private_notes_workspace
    ON wedding_boundary_private_notes
    (owner_user_id, response_workspace_id, updated_at DESC);
