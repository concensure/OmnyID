-- Claim intake is not ownership. Multiple representatives may begin proof without
-- reserving a public listing; authority is granted only by a verified proof.
ALTER TABLE wedding_vendor_claims
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verification_evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE wedding_vendor_claims
SET expires_at = created_at + INTERVAL '72 hours'
WHERE status = 'started' AND expires_at IS NULL;

ALTER TABLE wedding_vendor_claims
    DROP CONSTRAINT IF EXISTS wedding_vendor_claims_verification_method_check;
ALTER TABLE wedding_vendor_claims
    ADD CONSTRAINT wedding_vendor_claims_verification_method_check
    CHECK (verification_method IN ('email_domain', 'website_meta', 'social_business', 'admin'));

-- Release listings reserved by the old intake-only flow. Existing verified or
-- claimed listings are not touched.
UPDATE wedding_vendors
SET claim_status = 'unclaimed', claimed_by_user_id = NULL, claimed_at = NULL, updated_at = NOW()
WHERE claim_status = 'claim_pending';

DROP INDEX IF EXISTS uq_wedding_vendor_claims_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_claims_authoritative
    ON wedding_vendor_claims (vendor_id)
    WHERE status IN ('published', 'verified');
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_claims_started_actor
    ON wedding_vendor_claims (vendor_id, user_id)
    WHERE status = 'started';
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_claims_expiry
    ON wedding_vendor_claims (expires_at)
    WHERE status = 'started';

CREATE TABLE IF NOT EXISTS wedding_vendor_ownership_proofs (
    proof_id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES wedding_vendor_claims(claim_id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('website_meta', 'social_business')),
    token_hash TEXT NOT NULL,
    target TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'expired', 'failed', 'cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_ownership_pending_method
    ON wedding_vendor_ownership_proofs (claim_id, method)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_ownership_expiry
    ON wedding_vendor_ownership_proofs (expires_at)
    WHERE status = 'pending';
