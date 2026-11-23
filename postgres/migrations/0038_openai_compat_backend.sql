-- 0038: add OpenAI-compatible backend option for external model providers
ALTER TABLE user_llm_config
    DROP CONSTRAINT IF EXISTS user_llm_config_backend_check;
ALTER TABLE user_llm_config
    ADD CONSTRAINT user_llm_config_backend_check
    CHECK (backend IN ('hosted','byok','ollama','runpod','openai_compat'));

ALTER TABLE user_llm_config
    ADD COLUMN IF NOT EXISTS openai_compat_base_url TEXT;
