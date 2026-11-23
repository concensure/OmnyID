-- User goals: tracks agent-inferred and user-confirmed life goals
BEGIN;

CREATE TABLE IF NOT EXISTS user_goals (
  goal_id             TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  domain              TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  target_date         DATE,
  status              TEXT NOT NULL DEFAULT 'active',    -- active | archived | suggested
  agent_support_level TEXT NOT NULL DEFAULT 'passive',   -- passive | periodic | active
  success_signals     JSONB DEFAULT '[]',
  afp_message_id      TEXT,                              -- back-link to originating AFP message
  priority_rank       INTEGER DEFAULT 0,                 -- user-controlled ordering (0=unranked)
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_goals_user_status ON user_goals (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_goals_domain      ON user_goals (user_id, domain);

-- Goal progress signals: individual observations toward a goal
CREATE TABLE IF NOT EXISTS user_goal_progress (
  progress_id    TEXT PRIMARY KEY,
  goal_id        TEXT NOT NULL REFERENCES user_goals(goal_id) ON DELETE CASCADE,
  signal_type    TEXT NOT NULL,   -- e.g. "calendar_event_completed", "task_done", "manual"
  note           TEXT,            -- human-readable one-liner
  afp_message_id TEXT,
  recorded_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goal_progress_goal ON user_goal_progress (goal_id, recorded_at DESC);

-- Daily intelligence briefs: one per user per day
CREATE TABLE IF NOT EXISTS intelligence_briefs (
  brief_id              TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL,
  brief_date            DATE NOT NULL,
  sections              JSONB DEFAULT '[]',
  generated_at          TIMESTAMPTZ DEFAULT now(),
  read_at               TIMESTAMPTZ,
  accepted_offer_intent TEXT,       -- populated when user accepts an agent_offer from the brief
  accepted_offer_id     TEXT,       -- correlates back to the action the daemon should execute
  UNIQUE (user_id, brief_date)
);

CREATE INDEX IF NOT EXISTS idx_briefs_user_date ON intelligence_briefs (user_id, brief_date DESC);

COMMIT;
