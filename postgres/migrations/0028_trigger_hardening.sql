-- Migration 0028: Trigger Hardening — Phase 3 items 10–11
-- Adds public replay-nonce deduplication table (shared across all tenants)
-- and documents the per-tenant workflow_trigger_observations table which is
-- created inline by ensure_tenant_schema().

-- Public replay-nonce registry.  One row per trigger activation attempt.
-- check_and_claim_replay_nonce() inserts here; duplicate nonce → 0 rows affected → reject.
CREATE TABLE IF NOT EXISTS public.trigger_replay_nonces (
    replay_nonce TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trigger_replay_nonces_owner
    ON public.trigger_replay_nonces(owner_user_id, claimed_at DESC);
