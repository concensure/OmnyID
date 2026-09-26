ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS supertags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_messages_supertags
  ON messages USING GIN (supertags);

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
      'ALTER TABLE %I.messages ADD COLUMN IF NOT EXISTS supertags TEXT[] NOT NULL DEFAULT ''{}''',
      schema_name
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.messages USING GIN (supertags)',
      'idx_' || schema_name || '_messages_supertags',
      schema_name
    );
  END LOOP;
END
$$;
