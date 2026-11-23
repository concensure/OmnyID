CREATE TABLE IF NOT EXISTS wedding_vendor_shortlist_run_claims (
    claim_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    category TEXT NOT NULL,
    material_fingerprint TEXT NOT NULL,
    ranking_policy_version TEXT NOT NULL DEFAULT '1',
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, wedding_plan_id, category, material_fingerprint, ranking_policy_version)
);

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_shortlist_claims_plan
    ON wedding_vendor_shortlist_run_claims (user_id, wedding_plan_id, updated_at DESC);
