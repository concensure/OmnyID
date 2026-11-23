-- Daemon heartbeat retention hardening:
-- - add a created_at index so oldest-first retention scans stay index-backed
-- - document the intended 48-hour rolling window

CREATE INDEX IF NOT EXISTS daemon_heartbeats_created_at_idx
  ON daemon_heartbeats(created_at);

COMMENT ON TABLE daemon_heartbeats IS
  'Rolling daemon heartbeat log. Retain only the most recent 48 hours unless a shorter operator override is explicitly required.';
