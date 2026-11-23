-- Add top-level AFP message kind support and index it for container/message routing.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS kind TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_kind
  ON messages (kind)
  WHERE kind IS NOT NULL;

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN
    SELECT table_schema
    FROM information_schema.tables
    WHERE table_name = 'messages'
      AND table_schema NOT IN ('pg_catalog', 'information_schema', 'public')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.messages ADD COLUMN IF NOT EXISTS kind TEXT',
      schema_name
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.messages (kind) WHERE kind IS NOT NULL',
      'idx_' || schema_name || '_messages_kind',
      schema_name
    );
  END LOOP;
END
$$;
