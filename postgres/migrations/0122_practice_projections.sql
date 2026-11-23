-- Rebuildable indexes only. WED-277 must project owner-authorised AFP events
-- transactionally; no browser write route or inferred/backfilled grant exists.
CREATE TABLE IF NOT EXISTS practice_directory_projection (
    practice_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 160),
    source_event_id TEXT NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS practice_membership_projection (
    practice_id TEXT NOT NULL REFERENCES practice_directory_projection(practice_id),
    subject_account_id TEXT NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    grant_body JSONB NOT NULL CHECK (jsonb_typeof(grant_body) = 'object'),
    source_event_id TEXT NOT NULL,
    PRIMARY KEY (practice_id, subject_account_id)
);
CREATE INDEX IF NOT EXISTS practice_membership_subject_idx
    ON practice_membership_projection(subject_account_id, practice_id);
CREATE TABLE IF NOT EXISTS practice_client_projection (
    practice_id TEXT NOT NULL REFERENCES practice_directory_projection(practice_id),
    subject_account_id TEXT NOT NULL,
    owner_account_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    grant_body JSONB NOT NULL CHECK (jsonb_typeof(grant_body) = 'object'),
    summary JSONB NOT NULL CHECK (jsonb_typeof(summary) = 'object')
        CHECK ((summary - ARRAY['plan','client_label','wedding_date','stage','assigned_planner_id',
          'next_action','next_action_due_at','unread_count','action_needed_count','financial_due',
          'source_projection_version']::text[]) = '{}'::jsonb),
    source_event_id TEXT NOT NULL,
    PRIMARY KEY (practice_id, subject_account_id, owner_account_id, plan_id, thread_id),
    FOREIGN KEY (practice_id, subject_account_id)
        REFERENCES practice_membership_projection(practice_id, subject_account_id)
);
-- Only strict ClientSummary fields may be persisted in summary; application decode
-- fails closed on unknown fields. No messages, quotes, attachments or guest bodies.
-- Rollback: turn practice flag off, revert consumers, retain these additive indexes.
-- Dropping them is optional after rollback verification; no source AFP is deleted.
