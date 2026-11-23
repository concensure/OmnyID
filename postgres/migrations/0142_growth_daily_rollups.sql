-- Rebuildable, content-free Sydney-calendar aggregates over authoritative Growth projections.
CREATE TABLE IF NOT EXISTS growth_daily_rollups (
    report_date DATE PRIMARY KEY,
    landing_sessions BIGINT NOT NULL DEFAULT 0 CHECK (landing_sessions >= 0),
    first_party_landing_views BIGINT NOT NULL DEFAULT 0 CHECK (first_party_landing_views >= 0),
    registered_weddings BIGINT NOT NULL DEFAULT 0 CHECK (registered_weddings >= 0),
    activated_weddings BIGINT NOT NULL DEFAULT 0 CHECK (activated_weddings >= 0),
    returned_weddings_days_1_to_7 BIGINT NOT NULL DEFAULT 0
        CHECK (returned_weddings_days_1_to_7 >= 0),
    paid_weddings BIGINT NOT NULL DEFAULT 0 CHECK (paid_weddings >= 0),
    spend_aud_minor BIGINT NOT NULL DEFAULT 0 CHECK (spend_aud_minor >= 0),
    meta_landing_views BIGINT NOT NULL DEFAULT 0 CHECK (meta_landing_views >= 0),
    gross_minor BIGINT NOT NULL DEFAULT 0 CHECK (gross_minor >= 0),
    refunded_minor BIGINT NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0),
    tax_minor BIGINT,
    tax_complete BOOLEAN NOT NULL DEFAULT FALSE,
    definition_version TEXT NOT NULL CHECK (definition_version = 'growth-kpi-v1'),
    rebuilt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (tax_minor IS NULL OR tax_minor >= 0),
    CHECK (refunded_minor <= gross_minor)
);

CREATE TABLE IF NOT EXISTS growth_rollup_checkpoints (
    projector_key TEXT PRIMARY KEY CHECK (projector_key = 'growth-daily-v1'),
    last_completed_date DATE NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON growth_daily_rollups FROM PUBLIC;
REVOKE ALL ON growth_rollup_checkpoints FROM PUBLIC;
