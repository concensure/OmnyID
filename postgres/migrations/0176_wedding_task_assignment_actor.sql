-- Preserve the acting member separately from the canonical Wedding owner.
ALTER TABLE wedding_task_assignment_deliveries
    ADD COLUMN IF NOT EXISTS actor_user_id TEXT;

UPDATE wedding_task_assignment_deliveries
SET actor_user_id = owner_user_id
WHERE actor_user_id IS NULL;

ALTER TABLE wedding_task_assignment_deliveries
    ALTER COLUMN actor_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wedding_task_assignment_delivery_actor
    ON wedding_task_assignment_deliveries (actor_user_id, updated_at DESC);
