-- Stable client event identity makes public measurement retries replay-safe.
ALTER TABLE wedding_site_events
    DROP CONSTRAINT IF EXISTS wedding_site_events_pkey;

ALTER TABLE wedding_site_events
    ADD CONSTRAINT wedding_site_events_event_id_format
    CHECK (
        length(event_id) BETWEEN 16 AND 32
        AND event_id ~ '^[A-Za-z0-9]+$'
    ) NOT VALID;

ALTER TABLE wedding_site_events
    VALIDATE CONSTRAINT wedding_site_events_event_id_format;

ALTER TABLE wedding_site_events
    ADD CONSTRAINT wedding_site_events_pkey PRIMARY KEY (visit_id, event_id);

