DO $$
DECLARE
    schema_name text;
BEGIN
    DELETE FROM public.afp_messages
    WHERE type IN (
        'watcher_resolution_event',
        'synthesis_invalidation_event',
        'reflection_trace',
        'minimal_context_packet',
        'proactive_trigger',
        'token_budget_log'
    )
      AND created_at < NOW() - INTERVAL '30 days';

    DELETE FROM public.afp_messages m
    USING (
        SELECT id
        FROM (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY owner_user_id, type
                    ORDER BY created_at DESC, id DESC
                ) AS rn
            FROM public.afp_messages
            WHERE type IN (
                'watcher_resolution_event',
                'synthesis_invalidation_event',
                'reflection_trace',
                'minimal_context_packet',
                'proactive_trigger',
                'token_budget_log'
            )
        ) ranked
        WHERE rn > 500
    ) overflow
    WHERE m.id = overflow.id;

    DELETE FROM public.training_reflection_traces
    WHERE created_at < NOW() - INTERVAL '30 days';

    DELETE FROM public.training_reflection_traces t
    USING (
        SELECT id
        FROM (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY owner_user_id
                    ORDER BY created_at DESC, id DESC
                ) AS rn
            FROM public.training_reflection_traces
        ) ranked
        WHERE rn > 1000
    ) overflow
    WHERE t.id = overflow.id;

    DELETE FROM public.proactive_token_usage
    WHERE created_at < NOW() - INTERVAL '30 days';

    DELETE FROM public.proactive_token_usage p
    USING (
        SELECT id
        FROM (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY owner_user_id
                    ORDER BY created_at DESC, id DESC
                ) AS rn
            FROM public.proactive_token_usage
        ) ranked
        WHERE rn > 5000
    ) overflow
    WHERE p.id = overflow.id;

    DELETE FROM public.user_external_tool_usage_events
    WHERE occurred_at < NOW() - INTERVAL '90 days';

    DELETE FROM public.user_external_tool_usage_events e
    USING (
        SELECT id
        FROM (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY user_id
                    ORDER BY occurred_at DESC, recorded_at DESC, id DESC
                ) AS rn
            FROM public.user_external_tool_usage_events
        ) ranked
        WHERE rn > 5000
    ) overflow
    WHERE e.id = overflow.id;

    DELETE FROM public.proactive_suggestions
    WHERE created_at < NOW() - INTERVAL '90 days';

    DELETE FROM public.proactive_suggestions s
    USING (
        SELECT id
        FROM (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY owner_user_id
                    ORDER BY
                        CASE WHEN dismissed_at IS NULL THEN 0 ELSE 1 END,
                        created_at DESC,
                        id DESC
                ) AS rn
            FROM public.proactive_suggestions
        ) ranked
        WHERE rn > 2000
    ) overflow
    WHERE s.id = overflow.id;

    DELETE FROM public.trigger_replay_nonces
    WHERE claimed_at < NOW() - INTERVAL '90 days';

    DELETE FROM public.trigger_replay_nonces n
    USING (
        SELECT replay_nonce
        FROM (
            SELECT
                replay_nonce,
                ROW_NUMBER() OVER (
                    PARTITION BY owner_user_id
                    ORDER BY claimed_at DESC, replay_nonce DESC
                ) AS rn
            FROM public.trigger_replay_nonces
        ) ranked
        WHERE rn > 10000
    ) overflow
    WHERE n.replay_nonce = overflow.replay_nonce;

    FOR schema_name IN
        SELECT nspname
        FROM pg_namespace
        WHERE nspname LIKE 'user\_%' ESCAPE '\'
    LOOP
        EXECUTE format(
            $sql$
            DELETE FROM %I.action_audit_log
            WHERE recorded_at < NOW() - INTERVAL '180 days'
            $sql$,
            schema_name
        );

        EXECUTE format(
            $sql$
            DELETE FROM %I.action_audit_log a
            USING (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            ORDER BY recorded_at DESC, id DESC
                        ) AS rn
                    FROM %I.action_audit_log
                ) ranked
                WHERE rn > 5000
            ) overflow
            WHERE a.id = overflow.id
            $sql$,
            schema_name,
            schema_name
        );

        EXECUTE format(
            $sql$
            DELETE FROM %I.llm_usage_log
            WHERE recorded_at < NOW() - INTERVAL '180 days'
            $sql$,
            schema_name
        );

        EXECUTE format(
            $sql$
            DELETE FROM %I.llm_usage_log l
            USING (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            ORDER BY recorded_at DESC, id DESC
                        ) AS rn
                    FROM %I.llm_usage_log
                ) ranked
                WHERE rn > 10000
            ) overflow
            WHERE l.id = overflow.id
            $sql$,
            schema_name,
            schema_name
        );

        EXECUTE format(
            $sql$
            DELETE FROM %I.workflow_trigger_observations
            WHERE created_at < NOW() - INTERVAL '90 days'
            $sql$,
            schema_name
        );

        EXECUTE format(
            $sql$
            DELETE FROM %I.workflow_trigger_observations w
            USING (
                SELECT observation_id
                FROM (
                    SELECT
                        observation_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY workflow_id
                            ORDER BY created_at DESC, observation_id DESC
                        ) AS rn
                    FROM %I.workflow_trigger_observations
                ) ranked
                WHERE rn > 2000
            ) overflow
            WHERE w.observation_id = overflow.observation_id
            $sql$,
            schema_name,
            schema_name
        );
    END LOOP;
END $$;
