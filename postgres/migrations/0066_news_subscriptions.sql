-- News subscription channels: user-defined news feeds
BEGIN;

CREATE TABLE IF NOT EXISTS news_subscriptions (
  channel_id  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  label       TEXT NOT NULL,
  categories  JSONB DEFAULT '[]',
  locality    TEXT,
  granularity TEXT NOT NULL DEFAULT 'summaries',  -- headlines | summaries | deep
  frequency   TEXT NOT NULL DEFAULT 'daily',      -- realtime | daily | weekly
  sources     JSONB DEFAULT '[]',                 -- RSS/Atom URL allow-list (Tier 1)
  goal_id     TEXT REFERENCES user_goals(goal_id) ON DELETE SET NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_subs_user_enabled ON news_subscriptions (user_id, enabled);

-- Delivered news items per channel
CREATE TABLE IF NOT EXISTS news_items (
  id                   TEXT PRIMARY KEY,
  channel_id           TEXT NOT NULL REFERENCES news_subscriptions(channel_id) ON DELETE CASCADE,
  user_id              TEXT NOT NULL,
  url                  TEXT,
  url_hash             TEXT,                      -- for deduplication
  headline             TEXT,
  summary              TEXT,
  source_name          TEXT,
  published_at         TIMESTAMPTZ,
  reading_time_min     INTEGER,
  goal_relevance       BOOLEAN DEFAULT false,
  goal_relevance_score DOUBLE PRECISION DEFAULT 0.0,
  categories           JSONB DEFAULT '[]',
  deep_content         TEXT,
  dismissed            BOOLEAN NOT NULL DEFAULT false,
  saved_to_knowledge   BOOLEAN NOT NULL DEFAULT false,
  afp_note_id          TEXT,                      -- AFP note created when saved
  afp_message_id       TEXT,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_dedup ON news_items (channel_id, url_hash) WHERE url_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_news_items_channel      ON news_items (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_items_user         ON news_items (user_id, dismissed, created_at DESC);

COMMIT;
