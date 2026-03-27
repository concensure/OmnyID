CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    parent_id TEXT,
    from_agent TEXT NOT NULL,
    to_agents JSONB NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    type TEXT NOT NULL,
    content JSONB NOT NULL,
    views JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary TEXT,
    embedding VECTOR(768),
    signature TEXT NOT NULL,
    encryption JSONB,
    "references" JSONB NOT NULL DEFAULT '[]'::jsonb,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    store_in_relational BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    legal_hold BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_embedding ON messages USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_references ON messages USING gin ("references");

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage JSONB NOT NULL,
    encryption JSONB NOT NULL,
    sha256 TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_thread_id ON attachments(thread_id);

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    thread_id TEXT,
    amount NUMERIC,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mail_sync_checkpoints (
    provider TEXT NOT NULL,
    account TEXT NOT NULL,
    cursor TEXT,
    last_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    last_error TEXT,
    last_synced_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (provider, account)
);

CREATE INDEX IF NOT EXISTS idx_mail_sync_checkpoints_updated_at ON mail_sync_checkpoints(updated_at DESC);

CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('new_message', NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_new_message ON messages;

CREATE TRIGGER trigger_new_message
AFTER INSERT ON messages
FOR EACH ROW
WHEN (NEW.store_in_relational = true)
EXECUTE FUNCTION notify_new_message();
