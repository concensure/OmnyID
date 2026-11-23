-- Migration: 0062_anon_dashboard_sessions
-- Purpose: Anonymous dashboard session gate so trial-runner quota is enforced
--          per fingerprint rather than blocking all visitors (GAP-126).
-- Rules: additive only

CREATE TABLE IF NOT EXISTS anon_dashboard_sessions (
    fingerprint   TEXT        PRIMARY KEY,
    session_count INT         NOT NULL DEFAULT 0,
    first_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS anon_dashboard_sessions_last_seen_idx
    ON anon_dashboard_sessions(last_seen);
