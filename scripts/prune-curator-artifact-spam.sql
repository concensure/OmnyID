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
            WITH ranked_cards AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY COALESCE(content->>'source_id', id)
                        ORDER BY timestamp DESC, created_at DESC, id DESC
                    ) AS rn
                FROM %I.messages
                WHERE type = 'knowledge_card'
                  AND subtype = 'auto_summary'
                  AND from_agent = 'omnyid://daemon/knowledge-curator'
            )
            DELETE FROM %I.messages
            WHERE id IN (
                SELECT id
                FROM ranked_cards
                WHERE rn > 1
            )
            $sql$,
            schema_name,
            schema_name
        );

        EXECUTE format(
            $sql$
            WITH ranked_backlinks AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY
                            COALESCE(content->>'source_id', ''),
                            COALESCE(content->>'target_id', ''),
                            COALESCE(subtype, ''),
                            COALESCE(from_agent, '')
                        ORDER BY timestamp DESC, created_at DESC, id DESC
                    ) AS rn
                FROM %I.messages
                WHERE type = 'backlink_update'
                  AND subtype = 'semantic_similarity'
                  AND from_agent = 'omnyid://daemon/knowledge-curator'
            )
            DELETE FROM %I.messages
            WHERE id IN (
                SELECT id
                FROM ranked_backlinks
                WHERE rn > 1
            )
            $sql$,
            schema_name,
            schema_name
        );
    END LOOP;
END $$;
