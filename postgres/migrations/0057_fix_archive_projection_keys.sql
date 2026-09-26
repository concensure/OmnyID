-- 0057: Add composite unique constraints to fix multi-tenant key collisions.
--
-- afp_archive_index and afp_relational_projections previously used message_id
-- alone as the primary key. If two users produced a message with the same ID
-- (astronomically unlikely with ULIDs but architecturally unsound), the second
-- upsert would silently overwrite the first user's row.
--
-- Strategy: drop the single-column PK, add a surrogate id column as the new PK,
-- and promote (message_id, user_id) / (message_id, owner_user_id) to a unique
-- constraint that the ON CONFLICT clause in db.rs targets.

-- ── afp_archive_index ─────────────────────────────────────────────────────────

ALTER TABLE afp_archive_index
    DROP CONSTRAINT IF EXISTS afp_archive_index_pkey;

ALTER TABLE afp_archive_index
    ADD COLUMN IF NOT EXISTS id BIGSERIAL PRIMARY KEY;

ALTER TABLE afp_archive_index
    DROP CONSTRAINT IF EXISTS afp_archive_index_message_user_uniq;

ALTER TABLE afp_archive_index
    ADD CONSTRAINT afp_archive_index_message_user_uniq
        UNIQUE (message_id, user_id);

-- ── afp_relational_projections ────────────────────────────────────────────────

ALTER TABLE afp_relational_projections
    DROP CONSTRAINT IF EXISTS afp_relational_projections_pkey;

ALTER TABLE afp_relational_projections
    ADD COLUMN IF NOT EXISTS id BIGSERIAL PRIMARY KEY;

ALTER TABLE afp_relational_projections
    DROP CONSTRAINT IF EXISTS afp_rel_proj_message_owner_uniq;

ALTER TABLE afp_relational_projections
    ADD CONSTRAINT afp_rel_proj_message_owner_uniq
        UNIQUE (message_id, owner_user_id);
