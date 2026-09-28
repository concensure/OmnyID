DO $$
DECLARE
    schema_name text;
BEGIN
    FOR schema_name IN
        SELECT nspname
        FROM pg_namespace
        WHERE nspname LIKE 'user\_%' ESCAPE '\'
    LOOP
        EXECUTE format(
            $sql$
            WITH ranked AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            CASE WHEN id = 'insight.health-maintenance.current' THEN 0 ELSE 1 END,
                            timestamp DESC,
                            created_at DESC,
                            id DESC
                    ) AS rn
                FROM %I.messages
                WHERE type = 'insight'
                  AND subtype = 'maintenance_summary'
                  AND from_agent = 'omnyid://daemon/health-maintenance'
            )
            DELETE FROM %I.messages
            WHERE id IN (
                SELECT id
                FROM ranked
                WHERE rn > 1
            )
            $sql$,
            schema_name,
            schema_name
        );
    END LOOP;
END $$;
