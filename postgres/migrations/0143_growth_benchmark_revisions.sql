-- Append-only operator targets. No fabricated or vendor-supplied benchmark is seeded.
CREATE TABLE IF NOT EXISTS growth_benchmark_revisions (
    id TEXT PRIMARY KEY,
    kpi_key TEXT NOT NULL CHECK (kpi_key IN (
        'cost_per_landing_session','signup_rate','activation_rate_7d',
        'cost_per_activated_wedding','return_rate_days_1_to_7','paid_cac_30d'
    )),
    target_value BIGINT NOT NULL CHECK (target_value >= 0),
    unit TEXT NOT NULL CHECK (unit IN ('aud_minor_per_unit','basis_points')),
    direction TEXT NOT NULL CHECK (direction IN ('lower_is_better','higher_is_better')),
    effective_from DATE NOT NULL,
    effective_through DATE,
    rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 10 AND 500),
    supersedes_id TEXT REFERENCES growth_benchmark_revisions(id) ON DELETE RESTRICT,
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (effective_through IS NULL OR effective_through >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_growth_benchmark_revisions_current
    ON growth_benchmark_revisions (kpi_key, effective_from DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS growth_admin_audit (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN ('benchmark_created','export')),
    operator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON growth_benchmark_revisions FROM PUBLIC;
REVOKE ALL ON growth_admin_audit FROM PUBLIC;
REVOKE ALL ON SEQUENCE growth_admin_audit_id_seq FROM PUBLIC;
