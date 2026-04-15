-- Migration 0032: global internal workflow runtime event queue
--
-- Written whenever the workflow runtime produces an observable lifecycle
-- event (workflow_started, workflow_completed, workflow_failed, node_completed,
-- etc.).  Consumed by the internal event dispatcher, which fans out workflow
-- runs to all users with a registered event/internal_event trigger whose
-- filter matches the event_type and optional source_workflow_id.

CREATE TABLE IF NOT EXISTS public.internal_event_queue (
    event_id            TEXT        PRIMARY KEY,
    event_type          TEXT        NOT NULL,   -- e.g. workflow_completed, workflow_failed
    source_workflow_id  TEXT,
    source_run_id       TEXT,
    owner_user_id       TEXT        NOT NULL,   -- user who owns the source workflow
    payload             JSONB       NOT NULL DEFAULT '{}'::JSONB,
    processed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dispatched_at       TIMESTAMPTZ
);

-- Fast scan for pending events.
CREATE INDEX IF NOT EXISTS idx_internal_event_queue_pending
    ON public.internal_event_queue(processed_at ASC)
    WHERE dispatched_at IS NULL;

-- Lookup by owner for tenant-scoped dispatch.
CREATE INDEX IF NOT EXISTS idx_internal_event_queue_owner
    ON public.internal_event_queue(owner_user_id, event_type, processed_at DESC);
