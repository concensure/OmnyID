-- Privacy-bounded same-session acquisition linkage. Persistent browser identity is not enabled.
CREATE TABLE IF NOT EXISTS growth_acquisition_touches (
    visit_id TEXT PRIMARY KEY REFERENCES wedding_site_sessions(visit_id) ON DELETE CASCADE,
    touch_class TEXT NOT NULL,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    intent TEXT,
    landing_path TEXT NOT NULL,
    first_seen TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK (expires_at <= first_seen + INTERVAL '30 days')
);

CREATE TABLE IF NOT EXISTS growth_identity_links (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    visit_id TEXT NOT NULL UNIQUE REFERENCES growth_acquisition_touches(visit_id) ON DELETE CASCADE,
    wedding_plan_id TEXT,
    link_kind TEXT NOT NULL DEFAULT 'same_session' CHECK (link_kind = 'same_session'),
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK (expires_at <= linked_at + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_growth_acquisition_touches_expiry
    ON growth_acquisition_touches (expires_at);
CREATE INDEX IF NOT EXISTS idx_growth_identity_links_wedding
    ON growth_identity_links (user_id, wedding_plan_id)
    WHERE wedding_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_growth_identity_links_expiry
    ON growth_identity_links (expires_at);

REVOKE ALL ON growth_acquisition_touches FROM PUBLIC;
REVOKE ALL ON growth_identity_links FROM PUBLIC;
