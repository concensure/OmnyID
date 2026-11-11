-- Canonical Wedding review lifecycle and public projection foundation.
-- Private narrative remains in the author's tenant-private AFP message. These
-- relational records hold lifecycle, permissions and purgeable references.

CREATE TABLE IF NOT EXISTS wedding_reviews (
    review_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL CHECK (char_length(wedding_plan_id) BETWEEN 1 AND 180),
    response_workspace_id TEXT NOT NULL CHECK (char_length(response_workspace_id) BETWEEN 1 AND 180),
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('planner', 'vendor')),
    vendor_id TEXT REFERENCES wedding_vendors(vendor_id) ON DELETE RESTRICT,
    venue_space_ref TEXT CHECK (venue_space_ref IS NULL OR char_length(venue_space_ref) <= 180),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'submitted', 'evidence_requested', 'moderation_pending',
        'published', 'edit_pending', 'rejected', 'restricted', 'restored', 'withdrawn'
    )),
    verification_state TEXT NOT NULL DEFAULT 'unreviewed' CHECK (verification_state IN (
        'unreviewed', 'pending', 'verified_activity', 'verified_booking',
        'verified_wedding_held', 'insufficient', 'conflicted'
    )),
    invitation_origin TEXT NOT NULL DEFAULT 'profile_direct' CHECK (invitation_origin IN (
        'in_app', 'operator', 'vendor_standard_link', 'profile_direct', 'off_platform'
    )),
    current_revision BIGINT NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
    current_afp_message_id TEXT,
    published_revision BIGINT CHECK (published_revision IS NULL OR published_revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at TIMESTAMPTZ,
    CHECK ((subject_kind = 'planner' AND vendor_id IS NULL) OR
           (subject_kind = 'vendor' AND vendor_id IS NOT NULL)),
    CHECK ((current_revision = 0 AND current_afp_message_id IS NULL) OR
           (current_revision > 0 AND current_afp_message_id IS NOT NULL))
);

-- Partner accounts sharing the canonical wedding tuple must update the same
-- review instead of creating a second rating.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_reviews_planner_workspace
    ON wedding_reviews (wedding_plan_id, response_workspace_id)
    WHERE subject_kind = 'planner';
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_reviews_vendor_workspace
    ON wedding_reviews (wedding_plan_id, response_workspace_id, vendor_id)
    WHERE subject_kind = 'vendor';
CREATE INDEX IF NOT EXISTS idx_wedding_reviews_owner
    ON wedding_reviews (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_reviews_moderation
    ON wedding_reviews (status, updated_at DESC)
    WHERE status IN ('submitted', 'evidence_requested', 'moderation_pending', 'edit_pending', 'restricted');

CREATE TABLE IF NOT EXISTS wedding_review_revisions (
    revision_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    afp_message_id TEXT NOT NULL,
    authored_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    audience TEXT NOT NULL CHECK (audience IN ('private_feedback', 'public_review')),
    experience_kind TEXT NOT NULL CHECK (experience_kind IN (
        'planner_task', 'resource', 'wedding_held', 'booking', 'enquiry_tour'
    )),
    experience_status TEXT NOT NULL CHECK (experience_status IN (
        'completed', 'upcoming', 'cancelled', 'refunded', 'changed', 'other'
    )),
    rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
    event_month DATE,
    display_mode TEXT NOT NULL CHECK (display_mode IN (
        'first_names', 'first_name_and_initial', 'omnyid_couple'
    )),
    context_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    content_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (content_schema_version = 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    UNIQUE (review_id, revision),
    UNIQUE (review_id, afp_message_id),
    CHECK (event_month IS NULL OR EXTRACT(DAY FROM event_month) = 1),
    CHECK ((audience = 'public_review' AND experience_kind IN ('planner_task', 'resource', 'wedding_held', 'booking'))
        OR audience = 'private_feedback'),
    CHECK ((audience = 'public_review' AND experience_kind IN ('planner_task', 'wedding_held') AND rating IS NOT NULL)
        OR audience <> 'public_review'
        OR experience_kind NOT IN ('planner_task', 'wedding_held'))
);
CREATE INDEX IF NOT EXISTS idx_wedding_review_revisions_review
    ON wedding_review_revisions (review_id, revision DESC);

-- Evidence rows are purgeable pointers into the existing protected attachment
-- store. Neither file bytes nor narrative are copied into audit events.
CREATE TABLE IF NOT EXISTS wedding_review_evidence_refs (
    evidence_ref_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    attachment_id TEXT NOT NULL,
    evidence_kind TEXT NOT NULL CHECK (evidence_kind IN (
        'planner_activity', 'contract', 'payment', 'post_event_invoice',
        'post_event_correspondence', 'enquiry', 'tour', 'operator_note', 'other'
    )),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'accepted', 'rejected', 'purge_scheduled', 'purged'
    )),
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    expires_at TIMESTAMPTZ,
    purged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (review_id, revision, attachment_id)
);
CREATE INDEX IF NOT EXISTS idx_wedding_review_evidence_expiry
    ON wedding_review_evidence_refs (expires_at)
    WHERE purged_at IS NULL;

CREATE TABLE IF NOT EXISTS wedding_review_invitations (
    invitation_id TEXT PRIMARY KEY,
    review_id TEXT REFERENCES wedding_reviews(review_id) ON DELETE SET NULL,
    wedding_plan_id TEXT NOT NULL,
    response_workspace_id TEXT NOT NULL,
    vendor_id TEXT REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('planner', 'vendor')),
    origin TEXT NOT NULL CHECK (origin IN (
        'in_app', 'operator', 'vendor_standard_link', 'profile_direct', 'off_platform'
    )),
    token_digest TEXT UNIQUE CHECK (token_digest IS NULL OR token_digest ~ '^[a-f0-9]{64}$'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'opened', 'submitted', 'declined', 'opted_out', 'expired', 'revoked'
    )),
    reminder_count SMALLINT NOT NULL DEFAULT 0 CHECK (reminder_count BETWEEN 0 AND 1),
    last_reminded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((subject_kind = 'planner' AND vendor_id IS NULL) OR
           (subject_kind = 'vendor' AND vendor_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_wedding_review_invitations_due
    ON wedding_review_invitations (status, created_at)
    WHERE status IN ('pending', 'opened') AND reminder_count = 0;

CREATE TABLE IF NOT EXISTS wedding_review_moderation_decisions (
    decision_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    decision TEXT NOT NULL CHECK (decision IN (
        'request_evidence', 'approve', 'reject', 'restrict', 'restore', 'return_for_correction'
    )),
    reason_code TEXT NOT NULL CHECK (reason_code IN (
        'eligibility', 'evidence', 'duplicate', 'conflict', 'personal_information',
        'abuse', 'unsupported_claim', 'correction_required', 'policy_other'
    )),
    moderator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    private_note_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (review_id, revision, decision_id)
);
CREATE INDEX IF NOT EXISTS idx_wedding_review_moderation_review
    ON wedding_review_moderation_decisions (review_id, created_at DESC);

-- This is the only public review-text projection. A withdraw/restrict command
-- changes status immediately and consumers must filter status='published'.
CREATE TABLE IF NOT EXISTS wedding_review_publications (
    publication_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('planner', 'vendor')),
    vendor_id TEXT REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    experience_kind TEXT NOT NULL,
    verification_state TEXT NOT NULL,
    aggregate_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
    public_snapshot JSONB NOT NULL CHECK (jsonb_typeof(public_snapshot) = 'object'),
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN (
        'published', 'superseded', 'restricted', 'withdrawn'
    )),
    published_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (review_id, revision),
    CHECK ((subject_kind = 'planner' AND vendor_id IS NULL) OR
           (subject_kind = 'vendor' AND vendor_id IS NOT NULL)),
    CHECK (experience_kind IN ('planner_task', 'resource', 'wedding_held', 'booking')),
    CHECK (verification_state IN (
        'verified_activity', 'verified_booking', 'verified_wedding_held'
    )),
    CHECK (NOT aggregate_eligible OR (
        subject_kind = 'vendor' AND experience_kind = 'wedding_held'
        AND verification_state = 'verified_wedding_held' AND rating IS NOT NULL
    ))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_review_publication_current
    ON wedding_review_publications (review_id)
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_wedding_review_publications_vendor
    ON wedding_review_publications (vendor_id, published_at DESC)
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_wedding_review_publications_aggregate
    ON wedding_review_publications (vendor_id, rating)
    WHERE status = 'published' AND aggregate_eligible;

CREATE TABLE IF NOT EXISTS wedding_review_vendor_replies (
    reply_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    afp_message_id TEXT NOT NULL,
    public_snapshot JSONB CHECK (public_snapshot IS NULL OR jsonb_typeof(public_snapshot) = 'object'),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
        'submitted', 'published', 'rejected', 'withdrawn'
    )),
    authored_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    moderated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (review_id, vendor_id, revision)
);

-- Content-light, AFP-compatible transition facts. Application validation keeps
-- metadata to revision/reason/policy/result fields only.
CREATE TABLE IF NOT EXISTS wedding_review_events (
    event_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES wedding_reviews(review_id) ON DELETE CASCADE,
    event_kind TEXT NOT NULL CHECK (event_kind IN (
        'draft_saved', 'submitted', 'evidence_requested', 'evidence_decided',
        'moderation_decided', 'published', 'correction_submitted', 'restricted',
        'restored', 'withdrawn', 'invitation_sent', 'invitation_suppressed',
        'vendor_reply_submitted', 'vendor_reply_published', 'report_created'
    )),
    actor_role TEXT NOT NULL CHECK (actor_role IN (
        'author', 'partner', 'operator', 'vendor_manager', 'system'
    )),
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    revision BIGINT CHECK (revision IS NULL OR revision > 0),
    reason_code TEXT,
    dedupe_key TEXT NOT NULL CHECK (char_length(dedupe_key) BETWEEN 8 AND 180),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (review_id, event_kind, dedupe_key),
    CHECK (NOT (metadata ?| ARRAY[
        'review_text', 'body', 'reviewer_email', 'reviewer_phone',
        'attachment_id', 'evidence_content'
    ]))
);
CREATE INDEX IF NOT EXISTS idx_wedding_review_events_review
    ON wedding_review_events (review_id, occurred_at DESC);
