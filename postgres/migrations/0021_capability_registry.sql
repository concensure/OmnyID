-- 0021_capability_registry
-- Structured capability descriptors registered by Python SDK @agent.capability() decorator.
-- Each row describes one capability an agent instance can perform, including its JSON Schema.
-- Included in the signed AgentCard so peers can verify the full contract.

CREATE TABLE IF NOT EXISTS agent_capability_registry (
    id                   TEXT        NOT NULL PRIMARY KEY,
    owner_user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_instance_id    TEXT        NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
    name                 TEXT        NOT NULL,
    description          TEXT        NOT NULL DEFAULT '',
    input_schema_json    JSONB       NOT NULL DEFAULT '{}',
    output_schema_json   JSONB,
    version              TEXT        NOT NULL DEFAULT '1.0.0',
    tags                 TEXT[]      NOT NULL DEFAULT '{}',
    approval_mode        TEXT        NOT NULL DEFAULT 'autonomous'
                             CHECK (approval_mode IN ('autonomous','suggest_only','human_approval_required')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (agent_instance_id, name)
);

CREATE INDEX IF NOT EXISTS cap_registry_owner_idx
    ON agent_capability_registry (owner_user_id, agent_instance_id);

ALTER TABLE agent_capability_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_capability_registry FORCE ROW LEVEL SECURITY;
CREATE POLICY cap_registry_owner ON agent_capability_registry
    FOR ALL
    USING (owner_user_id = current_setting('app.current_user_id', TRUE));
