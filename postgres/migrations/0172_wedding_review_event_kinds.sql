-- Reconcile the cumulative Wedding review event-kind constraint.
--
-- Migration 0170 added invitation and appeal events but unintentionally
-- omitted `eligibility_decided`, which was introduced by migration 0163.
-- Keep this forward-only so databases that already applied 0170 are repaired.

ALTER TABLE wedding_review_events
    DROP CONSTRAINT IF EXISTS wedding_review_events_event_kind_check;

ALTER TABLE wedding_review_events
    ADD CONSTRAINT wedding_review_events_event_kind_check CHECK (event_kind IN (
        'draft_saved', 'submitted', 'evidence_requested', 'evidence_decided',
        'eligibility_decided', 'moderation_decided', 'published',
        'correction_submitted', 'restricted', 'restored', 'withdrawn',
        'invitation_sent', 'invitation_opened', 'invitation_reminded',
        'invitation_suppressed', 'invitation_declined', 'invitation_opted_out',
        'appeal_submitted', 'appeal_resolved', 'vendor_reply_submitted',
        'vendor_reply_published', 'report_created'
    ));
