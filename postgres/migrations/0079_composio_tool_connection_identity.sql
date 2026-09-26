-- Per-user Composio/tool identity metadata for shared-project-key integrations.
-- The project API key stays in server env; connected-account ids remain tied to user_id.
ALTER TABLE mcp_tool_connections
    ADD COLUMN IF NOT EXISTS connection_provider TEXT NOT NULL DEFAULT 'mcp',
    ADD COLUMN IF NOT EXISTS external_user_id TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS composio_connected_account_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_mcp_tool_connections_user_provider
    ON mcp_tool_connections (user_id, connection_provider);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_tool_connections_user_composio_account
    ON mcp_tool_connections (user_id, composio_connected_account_id)
    WHERE composio_connected_account_id IS NOT NULL;
