-- Migration: 0061_rate_limit_log
-- Purpose: Persistent rate-limit log so buckets survive server restarts (GAP-007).
--          Each row is one request. Old rows are cleaned up by the rate_limit_allow() DB function.
-- Rules: additive only

CREATE TABLE IF NOT EXISTS rate_limit_log (
    bucket_key   TEXT        NOT NULL,
    request_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limit_log_bucket_time_idx
    ON rate_limit_log(bucket_key, request_time DESC);
