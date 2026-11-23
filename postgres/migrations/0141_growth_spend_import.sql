-- Immutable, operator-audited advertising spend imports and corrections.
CREATE TABLE IF NOT EXISTS growth_spend_imports (
    id TEXT PRIMARY KEY,
    content_sha256 TEXT NOT NULL UNIQUE CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    original_filename TEXT NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 240),
    platform TEXT NOT NULL CHECK (length(platform) BETWEEN 1 AND 40),
    file_bytes BIGINT NOT NULL CHECK (file_bytes BETWEEN 1 AND 5242880),
    source_row_count INTEGER NOT NULL CHECK (source_row_count BETWEEN 1 AND 20000),
    committed_row_count INTEGER NOT NULL DEFAULT 0 CHECK (committed_row_count >= 0),
    selected_grain TEXT CHECK (selected_grain IN ('account','campaign','ad_set','ad','creative','placement')),
    mapping_json JSONB NOT NULL,
    decision_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    operator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    committed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS growth_spend_rows (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL REFERENCES growth_spend_imports(id) ON DELETE RESTRICT,
    source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
    source_row_digest TEXT NOT NULL UNIQUE CHECK (source_row_digest ~ '^[0-9a-f]{64}$'),
    spend_date DATE NOT NULL,
    platform TEXT NOT NULL CHECK (length(platform) BETWEEN 1 AND 40),
    account_id TEXT,
    account_name TEXT,
    campaign_id TEXT,
    campaign_name TEXT,
    ad_set_id TEXT,
    ad_set_name TEXT,
    ad_id TEXT,
    ad_name TEXT,
    creative_id TEXT,
    creative_name TEXT,
    placement TEXT,
    grain TEXT NOT NULL CHECK (grain IN ('account','campaign','ad_set','ad','creative','placement')),
    source_spend_minor BIGINT NOT NULL CHECK (source_spend_minor >= 0),
    source_currency TEXT NOT NULL CHECK (source_currency ~ '^[A-Z]{3}$'),
    aud_spend_minor BIGINT NOT NULL CHECK (aud_spend_minor >= 0),
    aud_rate_micros BIGINT NOT NULL CHECK (aud_rate_micros > 0),
    conversion_source TEXT NOT NULL CHECK (length(conversion_source) BETWEEN 1 AND 200),
    conversion_date DATE NOT NULL,
    impressions BIGINT CHECK (impressions >= 0),
    clicks BIGINT CHECK (clicks >= 0),
    platform_landing_views BIGINT CHECK (platform_landing_views >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_id, source_row_number)
);

CREATE INDEX IF NOT EXISTS idx_growth_spend_rows_date_grain
    ON growth_spend_rows (spend_date, platform, grain);
CREATE INDEX IF NOT EXISTS idx_growth_spend_rows_campaign
    ON growth_spend_rows (campaign_id, ad_set_id, ad_id);

CREATE TABLE IF NOT EXISTS growth_spend_adjustments (
    id TEXT PRIMARY KEY,
    spend_row_id TEXT NOT NULL REFERENCES growth_spend_rows(id) ON DELETE RESTRICT,
    source_spend_delta_minor BIGINT NOT NULL,
    aud_spend_delta_minor BIGINT NOT NULL,
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
    operator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (source_spend_delta_minor <> 0 OR aud_spend_delta_minor <> 0)
);

CREATE TABLE IF NOT EXISTS growth_spend_audit (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN ('preview','commit','manual_row','adjustment','export')),
    import_id TEXT REFERENCES growth_spend_imports(id) ON DELETE RESTRICT,
    spend_row_id TEXT REFERENCES growth_spend_rows(id) ON DELETE RESTRICT,
    operator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON growth_spend_imports FROM PUBLIC;
REVOKE ALL ON growth_spend_rows FROM PUBLIC;
REVOKE ALL ON growth_spend_adjustments FROM PUBLIC;
REVOKE ALL ON growth_spend_audit FROM PUBLIC;
REVOKE ALL ON SEQUENCE growth_spend_audit_id_seq FROM PUBLIC;
