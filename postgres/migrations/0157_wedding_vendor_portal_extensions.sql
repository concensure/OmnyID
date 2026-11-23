-- Complete the vendor portal without introducing a second vendor record or calendar.
-- Existing owner profiles are treated as their first published revision so this
-- additive migration does not make currently visible information disappear.

ALTER TABLE wedding_vendor_owner_profile
    ADD COLUMN IF NOT EXISTS draft_revision BIGINT NOT NULL DEFAULT 1 CHECK (draft_revision > 0),
    ADD COLUMN IF NOT EXISTS published_revision BIGINT CHECK (published_revision IS NULL OR published_revision > 0),
    ADD COLUMN IF NOT EXISTS published_description TEXT CHECK (char_length(published_description) <= 4000),
    ADD COLUMN IF NOT EXISTS published_public_contact JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(published_public_contact) = 'object'),
    ADD COLUMN IF NOT EXISTS publication_visibility JSONB NOT NULL DEFAULT '{"description":true,"email":true,"phone":true,"website_url":true,"instagram_url":true,"facebook_url":true,"photos":true}'::jsonb
        CHECK (jsonb_typeof(publication_visibility) = 'object'),
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

UPDATE wedding_vendor_owner_profile
SET published_revision = draft_revision,
    published_description = description,
    published_public_contact = public_contact,
    published_at = COALESCE(published_at, updated_at)
WHERE published_revision IS NULL
  AND (NULLIF(btrim(COALESCE(description, '')), '') IS NOT NULL OR public_contact <> '{}'::jsonb);

CREATE TABLE IF NOT EXISTS wedding_vendor_publication_revisions (
    revision_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    profile_revision BIGINT NOT NULL CHECK (profile_revision > 0),
    status TEXT NOT NULL CHECK (status IN ('pending_review', 'published', 'rejected', 'superseded')),
    snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    visibility JSONB NOT NULL CHECK (jsonb_typeof(visibility) = 'object'),
    moderation_required BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    review_note TEXT CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    UNIQUE (vendor_id, profile_revision)
);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_publication_review
    ON wedding_vendor_publication_revisions (status, submitted_at DESC);

ALTER TABLE wedding_vendor_rooms
    ADD COLUMN IF NOT EXISTS portal_revision BIGINT NOT NULL DEFAULT 1 CHECK (portal_revision > 0),
    ADD COLUMN IF NOT EXISTS resource_status TEXT NOT NULL DEFAULT 'active'
        CHECK (resource_status IN ('active', 'archived')),
    ADD COLUMN IF NOT EXISTS managed_by_vendor BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS wedding_vendor_memberships (
    membership_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    member_email TEXT NOT NULL CHECK (member_email = lower(member_email) AND char_length(member_email) BETWEEN 3 AND 320),
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('manager', 'profile_editor', 'calendar_manager', 'enquiry_manager', 'viewer')),
    status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vendor_id, member_email)
);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_memberships_user
    ON wedding_vendor_memberships (user_id, status, vendor_id);

CREATE TABLE IF NOT EXISTS wedding_vendor_notification_preferences (
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_enquiry BOOLEAN NOT NULL DEFAULT TRUE,
    follow_up_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    calendar_freshness BOOLEAN NOT NULL DEFAULT TRUE,
    expiring_holds BOOLEAN NOT NULL DEFAULT TRUE,
    publication_updates BOOLEAN NOT NULL DEFAULT TRUE,
    product_updates BOOLEAN NOT NULL DEFAULT FALSE,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (vendor_id, user_id)
);

-- Content-light audit only. Descriptions, contacts, messages and pricing are
-- retained in their canonical tables and are not copied into metadata.
CREATE TABLE IF NOT EXISTS wedding_vendor_portal_events (
    event_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    event_kind TEXT NOT NULL CHECK (event_kind IN (
        'publication_submitted', 'publication_published', 'publication_rejected',
        'resource_created', 'resource_updated', 'resource_archived', 'calendar_bulk_updated',
        'member_invited', 'member_role_changed', 'member_revoked',
        'notification_preferences_updated'
    )),
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    subject_ref TEXT,
    dedupe_key TEXT NOT NULL CHECK (char_length(dedupe_key) BETWEEN 8 AND 180),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vendor_id, event_kind, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_portal_events_vendor
    ON wedding_vendor_portal_events (vendor_id, occurred_at DESC);
