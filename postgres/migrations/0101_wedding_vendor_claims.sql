-- Foundation for vendor ownership.  This migration is additive: public seed facts
-- remain in wedding_vendors and are never overwritten by a claimant.
ALTER TABLE wedding_vendors
    ADD COLUMN IF NOT EXISTS claim_status TEXT NOT NULL DEFAULT 'unclaimed'
        CHECK (claim_status IN ('unclaimed', 'claim_pending', 'claimed', 'verified', 'disputed')),
    ADD COLUMN IF NOT EXISTS claimed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS priority_eligible BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE wedding_vendors
SET claim_status = 'unclaimed'
WHERE claim_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_wedding_vendors_claim_status
    ON wedding_vendors (claim_status, category);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('couple', 'vendor', 'admin')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role)
);

-- This is deliberately append-only. The current public state is denormalised on
-- wedding_vendors so it remains quick and safe to show from the public directory.
CREATE TABLE IF NOT EXISTS wedding_vendor_claims (
    claim_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('started', 'published', 'verified', 'disputed', 'revoked', 'abandoned')),
    declared_role TEXT CHECK (declared_role IN ('owner', 'manager', 'marketing', 'other')),
    declaration_accepted_at TIMESTAMPTZ,
    verification_method TEXT CHECK (verification_method IN ('email_domain', 'email_code', 'admin')),
    step_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    audit_ip_hash TEXT,
    audit_user_agent TEXT,
    afp_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_claims_vendor
    ON wedding_vendor_claims (vendor_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_claims_active
    ON wedding_vendor_claims (vendor_id)
    WHERE status IN ('started', 'published', 'verified');

CREATE TABLE IF NOT EXISTS wedding_vendor_claim_codes (
    claim_id TEXT PRIMARY KEY REFERENCES wedding_vendor_claims(claim_id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    sent_to TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Tokens are stored only as hashes. A consumed token is retained for replay
-- prevention and audit rather than being deleted.
CREATE TABLE IF NOT EXISTS auth_magic_links (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    intent TEXT,
    vendor_slug TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_magic_links_email
    ON auth_magic_links (email, created_at DESC);
