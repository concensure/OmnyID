-- Expiry is an explicit, auditable terminal lifecycle state. This migration is
-- additive because 0112 may already have been applied by a development environment.
ALTER TABLE quotation_response_capabilities
    DROP CONSTRAINT IF EXISTS quotation_response_capabilities_status_check;
ALTER TABLE quotation_response_capabilities
    ADD CONSTRAINT quotation_response_capabilities_status_check
    CHECK (status IN ('active', 'exchanged', 'consumed', 'revoked', 'rotated', 'expired'));

ALTER TABLE quotation_response_capability_audit
    DROP CONSTRAINT IF EXISTS quotation_response_capability_audit_event_kind_check;
ALTER TABLE quotation_response_capability_audit
    ADD CONSTRAINT quotation_response_capability_audit_event_kind_check
    CHECK (event_kind IN ('issued', 'exchanged', 'consumed', 'revoked', 'rotated', 'expired'));
