-- 0034: per-agent user-level settings (auto_approve_workflows toggle)
ALTER TABLE agent_instances
    ADD COLUMN IF NOT EXISTS auto_approve_workflows BOOLEAN NOT NULL DEFAULT TRUE;
