-- Migration 0031: global file-drop trigger queue
--
-- Written by the file-watcher background task each time a new file is
-- detected in the watched directory.  Consumed by the file-drop trigger
-- dispatcher, which fans out workflow runs to all users with a registered
-- event/file_drop trigger.

CREATE TABLE IF NOT EXISTS public.file_drop_trigger_queue (
    event_id        TEXT        PRIMARY KEY,
    watched_path    TEXT        NOT NULL,
    file_name       TEXT        NOT NULL,
    file_size_bytes BIGINT,
    file_event_type TEXT        NOT NULL DEFAULT 'created',  -- created | modified | deleted
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dispatched_at   TIMESTAMPTZ
);

-- Fast scan for pending (undispatched) events.
CREATE INDEX IF NOT EXISTS idx_file_drop_trigger_queue_pending
    ON public.file_drop_trigger_queue(processed_at ASC)
    WHERE dispatched_at IS NULL;

-- Lookup by path for deduplication within a single watcher tick.
CREATE INDEX IF NOT EXISTS idx_file_drop_trigger_queue_path
    ON public.file_drop_trigger_queue(watched_path, file_name, processed_at DESC);
