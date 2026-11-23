-- 0042_spaces.sql
-- Agentic Spaces: persistent multi-agent AFP collaboration rooms

-- ── spaces ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS spaces (
    id              TEXT        NOT NULL PRIMARY KEY,
    name            TEXT        NOT NULL,
    description     TEXT,
    owner_user_id   TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_public       BOOLEAN     NOT NULL DEFAULT FALSE,
    afp_thread_id   TEXT        NOT NULL,
    settings        JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS spaces_owner_idx ON spaces (owner_user_id);
CREATE INDEX IF NOT EXISTS spaces_thread_idx ON spaces (afp_thread_id);

ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaces FORCE ROW LEVEL SECURITY;

CREATE POLICY spaces_owner ON spaces
    FOR ALL
    USING (owner_user_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY spaces_public_read ON spaces
    FOR SELECT
    USING (is_public = TRUE);

-- ── space_members ─────────────────────────────────────────────────────────────

CREATE TYPE space_role AS ENUM ('observer', 'contributor', 'admin');

CREATE TABLE IF NOT EXISTS space_members (
    id              TEXT        NOT NULL PRIMARY KEY,
    space_id        TEXT        NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id         TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id        TEXT,
    role            space_role  NOT NULL DEFAULT 'contributor',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_by      TEXT,
    UNIQUE (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS space_members_space_idx ON space_members (space_id);
CREATE INDEX IF NOT EXISTS space_members_user_idx  ON space_members (user_id);

ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_members FORCE ROW LEVEL SECURITY;

CREATE POLICY space_members_self ON space_members
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', TRUE));

CREATE POLICY space_members_owner_space ON space_members
    FOR ALL
    USING (
        space_id IN (
            SELECT id FROM spaces
            WHERE owner_user_id = current_setting('app.current_user_id', TRUE)
        )
    );

-- ── space_messages ────────────────────────────────────────────────────────────
-- Lightweight denormalized log for Space feed rendering (source of truth is AFP).

CREATE TABLE IF NOT EXISTS space_messages (
    id              TEXT        NOT NULL PRIMARY KEY,
    space_id        TEXT        NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    afp_message_id  TEXT        NOT NULL,
    from_agent      TEXT        NOT NULL,
    author_user_id  TEXT        NOT NULL,
    type            TEXT        NOT NULL,
    subtype         TEXT,
    content         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS space_messages_space_idx    ON space_messages (space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS space_messages_afp_idx     ON space_messages (afp_message_id);
CREATE INDEX IF NOT EXISTS space_messages_author_idx  ON space_messages (author_user_id);

ALTER TABLE space_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY space_messages_member ON space_messages
    FOR ALL
    USING (
        space_id IN (
            SELECT space_id FROM space_members
            WHERE user_id = current_setting('app.current_user_id', TRUE)
            UNION
            SELECT id FROM spaces
            WHERE owner_user_id = current_setting('app.current_user_id', TRUE)
        )
    );
