-- Bridge C: Postgres LISTEN/NOTIFY for AFP coordination events.
--
-- Fires pg_notify('afp_coordination', 'family|owner_user_id') after every
-- insert of a coordination-relevant AFP message.  The payload is intentionally
-- minimal (no message content) so notifications carry no sensitive data.
--
-- The trigger scopes to coordination-worthy message types, mirroring the
-- coord_family_of() predicate in src/coordination_bus.rs.  Adding a new family
-- requires updating both this WHEN clause and that Rust function.
--
-- Bridge C is opt-in (OMNYID_COORD_DB_NOTIFY=1) and primarily useful for
-- multi-replica deploys.  Single-process deploys already get Bridge A
-- in-process wakeups at no cost.

CREATE OR REPLACE FUNCTION notify_afp_coordination()
RETURNS TRIGGER AS $$
DECLARE
    family TEXT;
BEGIN
    -- Map message type to family slug (mirrors coord_family_of in Rust).
    family := CASE NEW.type
        WHEN 'watcher_alert'            THEN 'watcher'
        WHEN 'smart_suggestion'         THEN 'watcher'
        WHEN 'watcher_resolution_event' THEN 'watcher'
        WHEN 'brain_doctor'             THEN 'brain_doctor'
        WHEN 'state_synthesis'          THEN 'synthesis'
        WHEN 'state_snapshot'           THEN 'synthesis'
        WHEN 'ledger_entry'             THEN 'ingestion'
        WHEN 'ledger_link'              THEN 'ingestion'
        WHEN 'entity_link'              THEN 'ingestion'
        WHEN 'relation_link'            THEN 'ingestion'
        WHEN 'topology_link'            THEN 'ingestion'
        WHEN 'merge_suggestion'         THEN 'ingestion'
        WHEN 'insight'                  THEN 'ingestion'
        ELSE NULL
    END;

    -- Also fire for store_in_relational writes and explicit coordination_event flag.
    IF family IS NULL THEN
        IF NEW.store_in_relational THEN
            family := 'other';
        -- Check metadata JSON for coordination_event:true.
        ELSIF NEW.metadata IS NOT NULL
              AND NEW.metadata::jsonb @> '{"coordination_event":true}'::jsonb THEN
            family := 'other';
        ELSE
            RETURN NEW;  -- Not a coordination event; skip notification.
        END IF;
    END IF;

    PERFORM pg_notify(
        'afp_coordination',
        family || '|' || COALESCE(NEW.from_agent, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to both the shared messages table and the afp_messages daemon table.
-- Tenant-private schema tables are not covered here; Bridge A (in-process) is
-- sufficient for single-process deploys and covers private schema writes.

DROP TRIGGER IF EXISTS trigger_afp_coordination ON messages;
CREATE TRIGGER trigger_afp_coordination
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION notify_afp_coordination();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'afp_messages'
    ) THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trigger_afp_coordination_daemon ON afp_messages';
        EXECUTE '
            CREATE TRIGGER trigger_afp_coordination_daemon
            AFTER INSERT ON afp_messages
            FOR EACH ROW
            EXECUTE FUNCTION notify_afp_coordination()
        ';
    END IF;
END;
$$;
