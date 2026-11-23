-- 0040_profit_guardrails.sql
-- Idempotent cost events + monthly margin alert dedupe.

ALTER TABLE cost_records
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS cost_records_idempotency_key_uidx
    ON cost_records(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS profit_margin_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    month_bucket DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, month_bucket)
);

CREATE INDEX IF NOT EXISTS profit_margin_alerts_user_month_idx
    ON profit_margin_alerts(user_id, month_bucket DESC);
