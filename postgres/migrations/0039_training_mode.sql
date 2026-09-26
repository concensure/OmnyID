-- 0039: training mode toggle + config for model-agnostic challenge harness
ALTER TABLE agent_instances
    ADD COLUMN IF NOT EXISTS training_mode BOOLEAN NOT NULL DEFAULT FALSE;

-- training_config stores challenge-specific settings as JSON for flexibility:
-- { "challenge_model": "nvidia/llama-3.1-nemotron-70b-instruct",
--   "challenge_backend_url": "https://integrate.api.nvidia.com/v1",
--   "reflection_policy": "every_step",
--   "confidence_threshold": 0.7,
--   "max_replan_passes": 3,
--   "collect_lora_examples": true }
ALTER TABLE agent_instances
    ADD COLUMN IF NOT EXISTS training_config JSONB NOT NULL DEFAULT '{}';
