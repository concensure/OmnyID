-- 0037: user-authored supertag definitions and default taxonomy support
--
-- Stores materialised rows derived from `supertag_definition` AFP messages so
-- the Knowledge Curator can query auto-apply rules without scanning the full
-- AFP message history on every processing pass.
--
-- The AFP message remains the source of truth; this table is a derived index.

CREATE TABLE IF NOT EXISTS afp_supertag_definitions (
    definition_id  TEXT        NOT NULL,
    user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag_name       TEXT        NOT NULL,
    keywords       TEXT[]      NOT NULL DEFAULT '{}',
    -- empty = apply in all folders; populated = scope to listed folder ids
    folder_scope   TEXT[]      NOT NULL DEFAULT '{}',
    afp_message_id TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT afp_supertag_definitions_pkey PRIMARY KEY (definition_id)
);

CREATE INDEX IF NOT EXISTS afp_supertag_def_user_idx
    ON afp_supertag_definitions(user_id);

CREATE INDEX IF NOT EXISTS afp_supertag_def_tag_idx
    ON afp_supertag_definitions(user_id, tag_name);

-- GIN index on keywords for fast containment queries
CREATE INDEX IF NOT EXISTS afp_supertag_def_keywords_gin_idx
    ON afp_supertag_definitions USING GIN (keywords);
