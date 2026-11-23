-- 0091: Public daemon AFP message store.
--
-- Several authenticated workspace summaries read operational AFP messages from
-- public.afp_messages. Older deployments can have the code without this table,
-- which turns a normal signed-in workspace boot into 500s. Keep the schema
-- deliberately permissive because AFP payload shape evolves in application
-- code and the canonical message remains the JSON payload.

CREATE TABLE IF NOT EXISTS afp_messages (
    id                  TEXT        PRIMARY KEY,
    owner_user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                TEXT        NOT NULL,
    subtype             TEXT,
    thread_id           TEXT,
    from_agent          TEXT,
    store_in_relational BOOLEAN     NOT NULL DEFAULT false,
    metadata            JSONB,
    payload             JSONB       NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_afp_messages_owner_type_created
    ON afp_messages(owner_user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_afp_messages_thread_created
    ON afp_messages(thread_id, created_at DESC)
    WHERE thread_id IS NOT NULL AND thread_id <> '';

CREATE INDEX IF NOT EXISTS idx_afp_messages_payload_gin
    ON afp_messages USING GIN (payload);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE proname = 'notify_afp_coordination'
    ) THEN
        DROP TRIGGER IF EXISTS trigger_afp_coordination_daemon ON afp_messages;
        CREATE TRIGGER trigger_afp_coordination_daemon
        AFTER INSERT ON afp_messages
        FOR EACH ROW
        EXECUTE FUNCTION notify_afp_coordination();
    END IF;
END;
$$;
