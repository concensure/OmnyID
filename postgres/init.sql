CREATE TABLE IF NOT EXISTS omnyid_schema_migrations (
    version TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

\i /docker-entrypoint-initdb.d/migrations/0001_init.sql
\i /docker-entrypoint-initdb.d/migrations/0002_workflow_state.sql

INSERT INTO omnyid_schema_migrations (version, description)
VALUES ('0001_init', 'Initial Omnyid schema baseline')
ON CONFLICT (version) DO NOTHING;

INSERT INTO omnyid_schema_migrations (version, description)
VALUES ('0002_workflow_state', 'Workflow state, delivery receipts, sync devices, and personalization tables')
ON CONFLICT (version) DO NOTHING;
