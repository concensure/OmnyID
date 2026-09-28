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
                        PARTITION BY
                            type,
                            subtype,
                            COALESCE(content->>'source_message_id', ''),
                            COALESCE(content->>'link_type', ''),
                            COALESCE(content->>'relationship_id', ''),
                            COALESCE(from_agent, '')
                        ORDER BY timestamp DESC, created_at DESC, id DESC
                    ) AS rn
                FROM %I.messages
                WHERE type IN ('knowledge_link', 'relation_link')
                  AND subtype IN ('entity', 'relationship')
                  AND from_agent IN ('entity_extractor', 'omnyid://daemon/ledger-ingestion')
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
