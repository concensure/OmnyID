-- Content-free, rebuildable activation projection over approved private AFP source references.
CREATE TABLE IF NOT EXISTS growth_activation_projector_cursors (
    owner_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_timestamp TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
    last_message_id TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS growth_weddings (
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    created_source_message_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    definition_version TEXT NOT NULL CHECK (definition_version = 'activation-v1'),
    PRIMARY KEY (owner_user_id, wedding_plan_id)
);

CREATE TABLE IF NOT EXISTS growth_activation_sources (
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_message_id TEXT NOT NULL,
    wedding_plan_id TEXT NOT NULL,
    event_name TEXT NOT NULL CHECK (event_name IN (
        'wedding_plan_saved', 'budget_saved', 'vendor_saved', 'decision_resolved'
    )),
    occurred_at TIMESTAMPTZ NOT NULL,
    definition_version TEXT NOT NULL CHECK (definition_version = 'activation-v1'),
    PRIMARY KEY (owner_user_id, source_message_id, event_name),
    FOREIGN KEY (owner_user_id, wedding_plan_id)
        REFERENCES growth_weddings(owner_user_id, wedding_plan_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS growth_wedding_activations (
    owner_user_id TEXT NOT NULL,
    wedding_plan_id TEXT NOT NULL,
    first_event_name TEXT NOT NULL,
    first_source_message_id TEXT NOT NULL,
    activated_at TIMESTAMPTZ NOT NULL,
    definition_version TEXT NOT NULL CHECK (definition_version = 'activation-v1'),
    PRIMARY KEY (owner_user_id, wedding_plan_id),
    FOREIGN KEY (owner_user_id, wedding_plan_id)
        REFERENCES growth_weddings(owner_user_id, wedding_plan_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS growth_wedding_activity_daily (
    owner_user_id TEXT NOT NULL,
    wedding_plan_id TEXT NOT NULL,
    activity_date DATE NOT NULL,
    activity_count INTEGER NOT NULL CHECK (activity_count > 0),
    first_activity_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL,
    definition_version TEXT NOT NULL CHECK (definition_version = 'activation-v1'),
    PRIMARY KEY (owner_user_id, wedding_plan_id, activity_date),
    FOREIGN KEY (owner_user_id, wedding_plan_id)
        REFERENCES growth_weddings(owner_user_id, wedding_plan_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_growth_activation_sources_plan_time
    ON growth_activation_sources (owner_user_id, wedding_plan_id, occurred_at, source_message_id);
CREATE INDEX IF NOT EXISTS idx_growth_wedding_activity_date
    ON growth_wedding_activity_daily (activity_date, owner_user_id, wedding_plan_id);

REVOKE ALL ON growth_activation_projector_cursors FROM PUBLIC;
REVOKE ALL ON growth_weddings FROM PUBLIC;
REVOKE ALL ON growth_activation_sources FROM PUBLIC;
REVOKE ALL ON growth_wedding_activations FROM PUBLIC;
REVOKE ALL ON growth_wedding_activity_daily FROM PUBLIC;
