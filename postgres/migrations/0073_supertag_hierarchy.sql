ALTER TABLE afp_supertag_definitions
  ADD COLUMN IF NOT EXISTS parent_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS alias_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hierarchy_mode TEXT NOT NULL DEFAULT 'soft';

CREATE INDEX IF NOT EXISTS afp_supertag_def_parent_tags_gin_idx
  ON afp_supertag_definitions USING GIN (parent_tags);

CREATE INDEX IF NOT EXISTS afp_supertag_def_alias_tags_gin_idx
  ON afp_supertag_definitions USING GIN (alias_tags);
