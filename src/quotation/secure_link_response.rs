use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::message::AFPMessage;

use super::{
    ContextGrantAction, QuotationVendorResponse, ResponseCapabilityBinding,
    VENDOR_RESPONSE_SCHEMA_VERSION, VendorAttestation, VendorAttestationAuthority,
    VendorAvailability, VendorCommercialFact, VendorContextProjection, VendorQuestionAnswer,
    VendorResponseChannel, VendorResponseChannelReceipt, VendorResponseEvidenceState,
    VendorResponseReviewProposal, VendorResponseStatus, vendor_response_fingerprint,
    vendor_response_review_proposal,
};

pub const SECURE_LINK_RESPONSE_KIND: &str = "quotation_vendor_response_received";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SecureLinkResponseInput {
    pub action: ContextGrantAction,
    #[serde(default)]
    pub question_answers: Vec<VendorQuestionAnswer>,
    #[serde(default)]
    pub commercial_facts: Vec<VendorCommercialFact>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub availability: Option<VendorAvailability>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    pub affirmed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreparedSecureLinkResponse {
    pub response: QuotationVendorResponse,
    pub proposal: VendorResponseReviewProposal,
    pub fingerprint: String,
    pub receipt_id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SecureLinkResponseError {
    Invalid,
    OutsideGrant,
}

fn opaque_id(prefix: &str, namespace: &str, session_id: &str) -> String {
    let digest = super::stable_hash(&(namespace, session_id));
    format!("{prefix}_{}", &digest[..26])
}

fn input_is_within_projection(
    input: &SecureLinkResponseInput,
    binding: &ResponseCapabilityBinding,
    projection: &VendorContextProjection,
) -> bool {
    if !binding.allowed_actions.contains(&input.action)
        || !projection.allowed_actions.contains(&input.action)
        || !input.affirmed
    {
        return false;
    }
    if input.question_answers.iter().any(|answer| {
        !binding.allowed_question_ids.contains(&answer.question_id)
            || !projection.question_ids.contains(&answer.question_id)
    }) {
        return false;
    }
    if input.commercial_facts.iter().any(|fact| {
        !projection.fact_ids.contains(&fact.fact_id)
            || !projection.fields.contains_key(&fact.key)
            || fact.state == VendorResponseEvidenceState::Confirmed
            || !fact.anchors.is_empty()
    }) {
        return false;
    }
    if input
        .availability
        .as_ref()
        .is_some_and(|availability| !availability.anchors.is_empty())
    {
        return false;
    }
    match input.action {
        ContextGrantAction::AnswerQuestions => input.commercial_facts.is_empty(),
        ContextGrantAction::SubmitRevision => true,
        ContextGrantAction::ConfirmBookingDetails => input.commercial_facts.is_empty(),
    }
}

pub fn prepare_secure_link_response(
    input: &SecureLinkResponseInput,
    binding: &ResponseCapabilityBinding,
    projection: &VendorContextProjection,
    session_id: &str,
    now: DateTime<Utc>,
) -> Result<PreparedSecureLinkResponse, SecureLinkResponseError> {
    if !input_is_within_projection(input, binding, projection)
        || projection.grant_id != binding.grant_id
        || projection.recipient_vendor_id != binding.vendor_id
        || projection.thread_id != binding.thread_id
        || projection.quotation_id != binding.quotation_id
        || projection.quotation_version_id != binding.quotation_version_id
        || projection.projection_fingerprint != binding.projection_fingerprint
    {
        return Err(SecureLinkResponseError::OutsideGrant);
    }
    let timestamp = now.to_rfc3339();
    let receipt_id = opaque_id("qvrr", "secure-link-receipt", session_id);
    let response = QuotationVendorResponse {
        schema_version: VENDOR_RESPONSE_SCHEMA_VERSION.to_string(),
        response_id: opaque_id("qvr", "secure-link-response", session_id),
        parent_response_id: None,
        vendor_id: binding.vendor_id.clone(),
        thread_id: binding.thread_id.clone(),
        grant_id: binding.grant_id.clone(),
        quotation_id: binding.quotation_id.clone(),
        quotation_version_id: binding.quotation_version_id.clone(),
        projection_fingerprint: binding.projection_fingerprint.clone(),
        channel: VendorResponseChannel::SecureLink,
        channel_receipt: VendorResponseChannelReceipt {
            receipt_id: receipt_id.clone(),
            received_at: timestamp.clone(),
            transport_message_id: None,
        },
        status: VendorResponseStatus::Received,
        submitted_at: timestamp.clone(),
        question_answers: input.question_answers.clone(),
        commercial_facts: input.commercial_facts.clone(),
        availability: input.availability.clone(),
        explanation: input.explanation.clone(),
        sources: Vec::new(),
        attachments: Vec::new(),
        attestation: VendorAttestation {
            attested_by: binding.response_recipient_id.clone(),
            authority: VendorAttestationAuthority::VendorRepresentative,
            affirmed: true,
            attested_at: timestamp,
        },
    };
    let fingerprint =
        vendor_response_fingerprint(&response).map_err(|_| SecureLinkResponseError::Invalid)?;
    let proposal =
        vendor_response_review_proposal(&response).map_err(|_| SecureLinkResponseError::Invalid)?;
    Ok(PreparedSecureLinkResponse {
        response,
        proposal,
        fingerprint,
        receipt_id,
    })
}

pub fn secure_link_response_message(
    prepared: &PreparedSecureLinkResponse,
    grant_message_id: &str,
    session_id: &str,
) -> AFPMessage {
    let mut message = super::afp::base_message(
        super::afp::stable_message_id(
            "quotation-secure-link-response",
            &(&prepared.response.thread_id, session_id),
        ),
        &prepared.response.thread_id,
        Some(grant_message_id),
        &prepared.response.submitted_at,
        "capability://quotation-response",
    );
    message.kind = Some(SECURE_LINK_RESPONSE_KIND.to_string());
    message.subtype = message.kind.clone();
    message.supertags.extend([
        "quotation_vendor_response".to_string(),
        "channel:secure_link".to_string(),
        "review:required".to_string(),
    ]);
    message.content = json!({
        "response": prepared.response,
        "review_proposal": prepared.proposal,
        "attribution": {
            "mode": "secure_link_capability",
            "signed_vendor_agent": false,
            "user_acceptance": false,
            "booking": false,
            "payment_execution": false,
        },
    });
    message.metadata = Some(json!({
        "schema_version": VENDOR_RESPONSE_SCHEMA_VERSION,
        "response_fingerprint": prepared.fingerprint,
        "idempotency_key": message.id,
        "privacy_scope": "tenant_private",
        "requires_user_review": true,
    }));
    message.references = vec![
        super::afp::reference("quotation_context_grant", grant_message_id),
        super::afp::reference("quotation", &prepared.response.quotation_id),
        super::afp::reference("quotation_version", &prepared.response.quotation_version_id),
        super::afp::reference("vendor_response", &prepared.response.response_id),
    ];
    message.typed_refs = message.references.clone();
    message
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use chrono::TimeZone;
    use serde_json::json;

    use super::*;
    use crate::quotation::{ContextGrantPurpose, VendorAvailabilityState, VendorCommercialValue};

    fn fixture() -> (ResponseCapabilityBinding, VendorContextProjection) {
        let binding = ResponseCapabilityBinding {
            grant_id: "grant-1".into(),
            vendor_id: "vendor-1".into(),
            response_recipient_id: "recipient-1".into(),
            quotation_id: "quote-1".into(),
            quotation_version_id: "quote-1-v1".into(),
            thread_id: "thread-1".into(),
            projection_fingerprint: "a".repeat(64),
            allowed_actions: vec![ContextGrantAction::SubmitRevision],
            allowed_question_ids: vec!["availability".into()],
            not_before: "2026-10-18T00:00:00Z".into(),
            expires_at: "2026-10-19T00:00:00Z".into(),
        };
        let projection = VendorContextProjection {
            projection_version: "quotation.vendor_context.v1".into(),
            projection_fingerprint: binding.projection_fingerprint.clone(),
            grant_id: binding.grant_id.clone(),
            recipient_vendor_id: binding.vendor_id.clone(),
            quotation_id: binding.quotation_id.clone(),
            quotation_version_id: binding.quotation_version_id.clone(),
            thread_id: binding.thread_id.clone(),
            response_recipient_id: binding.response_recipient_id.clone(),
            purpose: ContextGrantPurpose::RefineVendorPackage,
            allowed_actions: binding.allowed_actions.clone(),
            question_ids: binding.allowed_question_ids.clone(),
            fields: BTreeMap::from([(
                "own_quote.total".into(),
                json!({"amount_minor": 400000, "currency": "AUD"}),
            )]),
            fact_ids: vec!["fact-total".into()],
            provenance_refs: vec!["quote-1-v1".into()],
        };
        (binding, projection)
    }

    #[test]
    fn server_derives_transport_identity_and_private_afp_event() {
        let (binding, projection) = fixture();
        let input = SecureLinkResponseInput {
            action: ContextGrantAction::SubmitRevision,
            question_answers: vec![],
            commercial_facts: vec![VendorCommercialFact {
                fact_id: "fact-total".into(),
                key: "own_quote.total".into(),
                state: VendorResponseEvidenceState::Proposed,
                value: Some(VendorCommercialValue::Money(crate::quotation::Money {
                    amount_minor: 420000,
                    currency: "AUD".into(),
                })),
                anchors: vec![],
            }],
            availability: Some(VendorAvailability {
                state: VendorAvailabilityState::Available,
                starts_at: None,
                ends_at: None,
                notes: None,
                anchors: vec![],
            }),
            explanation: Some("Updated package total".into()),
            affirmed: true,
        };
        let prepared = prepare_secure_link_response(
            &input,
            &binding,
            &projection,
            "session-1",
            Utc.with_ymd_and_hms(2026, 10, 18, 1, 0, 0).unwrap(),
        )
        .unwrap();
        assert_eq!(prepared.response.channel, VendorResponseChannel::SecureLink);
        assert_eq!(prepared.response.status, VendorResponseStatus::Received);
        assert_eq!(prepared.response.attestation.attested_by, "recipient-1");
        let message = secure_link_response_message(&prepared, "grant-message", "session-1");
        assert_eq!(message.kind.as_deref(), Some(SECURE_LINK_RESPONSE_KIND));
        assert_eq!(message.parent_id.as_deref(), Some("grant-message"));
        assert_eq!(message.content["attribution"]["signed_vendor_agent"], false);
        assert_eq!(message.content["attribution"]["booking"], false);
    }

    #[test]
    fn out_of_grant_questions_and_confirmed_unanchored_facts_fail() {
        let (binding, projection) = fixture();
        let input = SecureLinkResponseInput {
            action: ContextGrantAction::SubmitRevision,
            question_answers: vec![VendorQuestionAnswer {
                question_id: "competitor-price".into(),
                state: VendorResponseEvidenceState::Confirmed,
                answer: Some("yes".into()),
                anchors: vec![],
            }],
            commercial_facts: vec![],
            availability: None,
            explanation: None,
            affirmed: true,
        };
        assert_eq!(
            prepare_secure_link_response(&input, &binding, &projection, "session-1", Utc::now()),
            Err(SecureLinkResponseError::OutsideGrant)
        );
    }
}
