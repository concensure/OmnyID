-- Migration 0029: Webhook Ingress Routing Table
-- Adds a global public-schema routing table so the unauthenticated
-- POST /ingest/webhook/{registration_id} endpoint can look up the owning
-- tenant and workflow without scanning per-tenant schemas.
--
-- Rows are inserted at deploy time (for webhook-family trigger registrations)
-- and deleted at rollback / registration retirement.

CREATE TABLE IF NOT EXISTS public.webhook_ingress_routing (
    -- The trigger registration ID from the per-tenant
    -- workflow_trigger_registrations table.  Acts as the external-facing
    -- webhook URL segment (e.g. /ingest/webhook/<registration_id>).
    registration_id TEXT PRIMARY KEY,

    -- Owner tenant — used to locate the per-tenant schema.
    owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Workflow identifier — surfaced in the trigger observation and run record.
    workflow_id TEXT NOT NULL,

    -- Optional path alias the user configured on the trigger node.
    -- Stored for display/audit; the canonical key is registration_id.
    webhook_path TEXT,

    -- When this route was registered (matches deploy timestamp).
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_ingress_routing_owner
    ON public.webhook_ingress_routing(owner_user_id, registered_at DESC);
