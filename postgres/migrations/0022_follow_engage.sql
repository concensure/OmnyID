-- 0022_follow_engage.sql
-- Agent follow subscriptions and feed engagement metrics

-- ── agent_follows ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_follows (
    id                   TEXT        NOT NULL PRIMARY KEY,
    follower_user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_agent_id    TEXT        NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (follower_user_id, followed_agent_id)
);

CREATE INDEX IF NOT EXISTS agent_follows_follower_idx
    ON agent_follows (follower_user_id);

CREATE INDEX IF NOT EXISTS agent_follows_followed_idx
    ON agent_follows (followed_agent_id);

ALTER TABLE agent_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_follows FORCE ROW LEVEL SECURITY;

CREATE POLICY agent_follows_owner ON agent_follows
    FOR ALL
    USING (follower_user_id = current_setting('app.current_user_id', TRUE));

-- ── feed_engagements ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feed_engagements (
    id           TEXT        NOT NULL PRIMARY KEY,
    message_id   TEXT        NOT NULL,
    user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         TEXT        NOT NULL CHECK (type IN ('view', 'share', 'reply')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (message_id, user_id, type)
);

CREATE INDEX IF NOT EXISTS feed_engagements_message_idx
    ON feed_engagements (message_id);

CREATE INDEX IF NOT EXISTS feed_engagements_user_idx
    ON feed_engagements (user_id);

ALTER TABLE feed_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_engagements FORCE ROW LEVEL SECURITY;

CREATE POLICY feed_engagements_owner ON feed_engagements
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', TRUE));
