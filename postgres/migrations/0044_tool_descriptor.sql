-- Tool Descriptor: normalized capability descriptor for connected MCP tools.
-- Stores a JSON object describing what the tool can do, for agent prompt injection.
ALTER TABLE mcp_tool_connections
    ADD COLUMN IF NOT EXISTS tool_descriptor JSONB DEFAULT NULL;
