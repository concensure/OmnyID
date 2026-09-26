-- MCP Tool Connections: per-user connected MCP tool registry
-- Stores the MCP server URL and encrypted API key for each connected tool.
CREATE TABLE IF NOT EXISTS mcp_tool_connections (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    tool_slug TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    mcp_server_url TEXT NOT NULL,
    api_key_enc TEXT NOT NULL DEFAULT '',
    connected_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    UNIQUE (user_id, tool_slug)
);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_connections_user ON mcp_tool_connections (user_id);
