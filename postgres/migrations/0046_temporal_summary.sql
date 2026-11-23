-- P3.2: Temporal memory materialized view.
-- Computes per (event_type, entity_id): last seen, event count, average frequency,
-- and a decay-weighted recency score (exponential decay, half-life 72 h).
-- Refreshed every 30 minutes by the application scheduler or pg_cron.

CREATE MATERIALIZED VIEW IF NOT EXISTS temporal_summary AS
SELECT
    type                                               AS event_type,
    content->>'entity_id'                             AS entity_id,
    COUNT(*)                                           AS event_count,
    MAX(timestamp)                                     AS last_seen_at,
    MIN(timestamp)                                     AS first_seen_at,
    CASE
        WHEN COUNT(*) > 1 THEN
            EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp)))
            / NULLIF(COUNT(*) - 1, 0)
            / 3600.0
        ELSE NULL
    END                                                AS avg_frequency_hours,
    -- ln(2)/72 ≈ 0.00963 per hour; higher score = seen more recently / more often
    SUM(
        EXP(-0.00963 * EXTRACT(EPOCH FROM (NOW() - timestamp)) / 3600.0)
    )                                                  AS recency_score
FROM messages
WHERE type = 'passive_event'
   OR type LIKE '%event%'
GROUP BY type, content->>'entity_id'
WITH DATA;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_temporal_summary_type_entity
    ON temporal_summary (event_type, (entity_id));

-- Optional: schedule concurrent refresh via pg_cron (no-op when not installed)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'refresh-temporal-summary',
            '*/30 * * * *',
            'REFRESH MATERIALIZED VIEW CONCURRENTLY temporal_summary'
        );
    END IF;
END $$;
