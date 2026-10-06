-- Keep one clearly demo-labelled bootstrap message per tenant and remove the
-- older synthetic seed graph. New accounts are seeded with one message by the
-- application; this migration reconciles accounts created before that change.
DO $$
DECLARE
    schema_name text;
    keep_message_id text;
BEGIN
    FOR schema_name IN
        SELECT nspname
        FROM pg_namespace
        WHERE nspname LIKE 'user\_%' ESCAPE '\'
    LOOP
        keep_message_id := NULL;

        EXECUTE format(
            $sql$
            SELECT id
            FROM %I.messages
            WHERE content->>'kind' IN ('demo_seed', 'demo_seed_note')
            ORDER BY
                CASE WHEN content->>'kind' = 'demo_seed' THEN 0 ELSE 1 END,
                timestamp ASC,
                created_at ASC,
                id ASC
            LIMIT 1
            $sql$,
            schema_name
        ) INTO keep_message_id;

        IF keep_message_id IS NOT NULL THEN
            EXECUTE format(
                $sql$
                DELETE FROM %I.messages
                WHERE content->>'kind' IN ('demo_seed', 'demo_seed_note')
                  AND id <> $1
                $sql$,
                schema_name
            ) USING keep_message_id;
        END IF;
    END LOOP;
END $$;
