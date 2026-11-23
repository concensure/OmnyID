-- 0055: User-defined email contact groups with many-to-many memberships.
--
-- A contact group is owned by a user, has a name, display color, SLA target
-- (in hours), and an auto-draft flag.  An email address may belong to many
-- groups simultaneously; a group may contain many email addresses.

CREATE TABLE IF NOT EXISTS email_contact_groups (
    id              TEXT        NOT NULL,
    owner_user_id   TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    color           TEXT        NOT NULL DEFAULT '#6b7280',
    sla_hours       INTEGER     NOT NULL DEFAULT 168,
    auto_draft      BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, owner_user_id)
);

CREATE TABLE IF NOT EXISTS email_contact_group_memberships (
    owner_user_id   TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_address   TEXT        NOT NULL,
    group_id        TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_user_id, email_address, group_id),
    FOREIGN KEY (group_id, owner_user_id)
        REFERENCES email_contact_groups(id, owner_user_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ecg_owner
    ON email_contact_groups(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_ecgm_owner_email
    ON email_contact_group_memberships(owner_user_id, email_address);

CREATE INDEX IF NOT EXISTS idx_ecgm_group
    ON email_contact_group_memberships(owner_user_id, group_id);
