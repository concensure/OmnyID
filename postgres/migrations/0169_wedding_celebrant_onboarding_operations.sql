-- Content-light celebrant acquisition and consent facts. Vendor identity,
-- consultation windows, wedding-date availability and publication remain in
-- their existing canonical authorities.

ALTER TABLE wedding_celebrant_pilot_profiles
    DROP CONSTRAINT IF EXISTS wedding_celebrant_pilot_profiles_register_status_check;
ALTER TABLE wedding_celebrant_pilot_profiles
    ADD CONSTRAINT wedding_celebrant_pilot_profiles_register_status_check
    CHECK (register_status IN (
        'pending','verified','not_found','requires_review','rejected','expired'
    ));

ALTER TABLE wedding_celebrant_pilot_profiles
    ADD COLUMN IF NOT EXISTS participation_status TEXT NOT NULL DEFAULT 'not_asked',
    ADD COLUMN IF NOT EXISTS participation_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS callback_phone_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE wedding_celebrant_pilot_profiles
    DROP CONSTRAINT IF EXISTS wedding_celebrant_pilot_profiles_participation_status_check;
ALTER TABLE wedding_celebrant_pilot_profiles
    ADD CONSTRAINT wedding_celebrant_pilot_profiles_participation_status_check
    CHECK (participation_status IN ('not_asked','accepted','declined','paused'));

ALTER TABLE wedding_celebrant_management_grants
    ADD COLUMN IF NOT EXISTS capability_scopes TEXT[] NOT NULL
        DEFAULT ARRAY['consultation_availability']::TEXT[];
ALTER TABLE wedding_celebrant_management_grants
    DROP CONSTRAINT IF EXISTS wedding_celebrant_management_grants_scope_check;
ALTER TABLE wedding_celebrant_management_grants
    ADD CONSTRAINT wedding_celebrant_management_grants_scope_check CHECK (
        cardinality(capability_scopes) BETWEEN 1 AND 2
        AND capability_scopes <@ ARRAY[
            'consultation_availability','wedding_date_availability'
        ]::TEXT[]
    );

CREATE TABLE IF NOT EXISTS wedding_celebrant_outreach (
    vendor_id TEXT PRIMARY KEY REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email','instagram','phone','other')),
    status TEXT NOT NULL CHECK (status IN (
        'planned','sent','follow_up_due','responded','opted_out'
    )),
    sent_at TIMESTAMPTZ,
    follow_up_due_at TIMESTAMPTZ,
    opted_out_at TIMESTAMPTZ,
    updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status <> 'sent' OR sent_at IS NOT NULL),
    CHECK (status <> 'opted_out' OR opted_out_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_celebrant_outreach_follow_up
    ON wedding_celebrant_outreach (status, follow_up_due_at)
    WHERE status <> 'opted_out';

ALTER TABLE wedding_celebrant_management_events
    DROP CONSTRAINT IF EXISTS wedding_celebrant_management_events_event_kind_check;
ALTER TABLE wedding_celebrant_management_events
    ADD CONSTRAINT wedding_celebrant_management_events_event_kind_check
    CHECK (event_kind IN (
        'link_created','link_exchanged','link_rotated','link_revoked',
        'settings_updated','window_added','window_removed','live_started','live_paused',
        'participation_updated','outreach_updated','listing_previewed','listing_created'
    ));
