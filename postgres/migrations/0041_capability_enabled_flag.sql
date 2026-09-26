-- 0041_capability_enabled_flag
-- Adds an enabled boolean to agent_capability_registry so capabilities can be
-- toggled on/off without losing their descriptor. Disabled capabilities are
-- excluded from the agent's active capability slice and AgentCard but remain
-- queryable so the dashboard can surface them with a re-enable button.

ALTER TABLE agent_capability_registry
    ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS cap_registry_enabled_idx
    ON agent_capability_registry (owner_user_id, agent_instance_id, enabled);
