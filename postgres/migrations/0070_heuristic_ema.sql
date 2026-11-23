-- Migration: 0070_heuristic_ema
-- Purpose: Persist per-user, per-heuristic EMA adaptation state for Phase 8
--          Bayesian/EMA threshold adaptation.
--
-- The EMA value decays old signal smoothly (α=0.3) so recent dismissals or
-- acceptances have more influence than stale history. The stored EMA is updated
-- on every outcome record — no scheduled job needed.
--
-- Rules: additive only — no DROP, no ALTER TYPE removal, no column removal.
--        All new columns have defaults or are nullable.

CREATE TABLE IF NOT EXISTS heuristic_ema_state (
    id                      TEXT        PRIMARY KEY DEFAULT gen_ulid(),
    owner_user_id           TEXT        NOT NULL,
    heuristic_id            TEXT        NOT NULL,
    -- Running EMA of acceptance rate (0.0–1.0). Starts at 0.5 (neutral prior).
    ema_acceptance_rate     REAL        NOT NULL DEFAULT 0.5,
    -- EMA of dismissal rate (1 - acceptance). Redundant but explicit for readers.
    ema_dismissal_rate      REAL        NOT NULL DEFAULT 0.5,
    -- Raw count of outcomes included in EMA (for minimum-signal guard).
    sample_count            INTEGER     NOT NULL DEFAULT 0,
    -- Last computed threshold delta from [-0.20, +0.20].
    last_threshold_delta    REAL        NOT NULL DEFAULT 0.0,
    -- Human-readable reason label for the last adaptation decision.
    last_adaptation_reason  TEXT        NOT NULL DEFAULT 'insufficient_signal',
    last_updated            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_heuristic_ema_user_heuristic
    ON heuristic_ema_state (owner_user_id, heuristic_id);

CREATE INDEX IF NOT EXISTS idx_heuristic_ema_user
    ON heuristic_ema_state (owner_user_id);

COMMENT ON TABLE heuristic_ema_state IS
    'Per-user, per-heuristic EMA (Exponential Moving Average) adaptation state. '
    'Updated on each proactive outcome record. Used by heuristic_adaptation.rs to '
    'compute a bounded threshold delta that tunes (but does not replace) the base '
    'confidence_threshold from the heuristic definition.';
