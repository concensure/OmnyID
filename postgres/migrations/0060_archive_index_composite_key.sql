-- Migration: 0060_archive_index_composite_key
-- Purpose: Add composite unique constraint on (user_id, message_id) so that the astronomically
--          rare case of two users generating the same ULID cannot silently overwrite each other's
--          archive entries. The message_id PK is kept for backward compatibility; the unique
--          constraint adds the tenant boundary at the DB level.
-- Rules: additive only — no DROP, no ALTER TYPE removal, no column removal

-- afp_archive_index already has user_id NOT NULL; add the composite unique index.
CREATE UNIQUE INDEX IF NOT EXISTS afp_archive_index_user_message_uidx
    ON afp_archive_index(user_id, message_id);

-- afp_relational_projections already has owner_user_id; ensure the composite uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS afp_rel_proj_user_message_uidx
    ON afp_relational_projections(owner_user_id, message_id)
    WHERE owner_user_id IS NOT NULL;
