-- Operational retention and legacy watcher retirement.
--
-- The public rate-limit key may contain a client IP when the trusted proxy mode
-- is enabled. A global request-time index keeps the scheduled 47-hour purge
-- bounded even when a visitor never returns to the same rate-limit bucket.

CREATE INDEX IF NOT EXISTS rate_limit_log_request_time_idx
    ON rate_limit_log(request_time);

COMMENT ON TABLE rate_limit_log IS
    'Short-lived abuse-control requests. Delete globally within 48 hours.';

-- background_watcher is a retired registration kind. No current executor reads
-- it, so leaving legacy rows active creates a false operational signal.
UPDATE daemon_registrations
SET status = 'revoked',
    revoked_at = COALESCE(revoked_at, NOW())
WHERE daemon_kind = 'background_watcher'
  AND status <> 'revoked';
