-- A submitted correction may move a review into edit_pending while the prior
-- moderated publication remains visible. Command receipts must replay that
-- truthful lifecycle result rather than collapsing it to submitted.

ALTER TABLE wedding_review_command_receipts
    DROP CONSTRAINT IF EXISTS wedding_review_command_receipts_result_status_check;

ALTER TABLE wedding_review_command_receipts
    ADD CONSTRAINT wedding_review_command_receipts_result_status_check
    CHECK (result_status IS NULL OR result_status IN ('draft', 'submitted', 'edit_pending'));
