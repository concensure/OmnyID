use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::message::AFPMessage;

use super::{
    QuotationVendorResponse, ResponseCapabilityBinding, SourceReference,
    VENDOR_RESPONSE_SCHEMA_VERSION, VendorAttestation, VendorAttestationAuthority,
    VendorCommercialFact, VendorQuestionAnswer, VendorResponseChannel,
    VendorResponseChannelReceipt, VendorResponseReconciliation, VendorResponseRoutingMetadata,
    VendorResponseStatus, VendorTransportReceipt, reconcile_vendor_response,
    vendor_response_fingerprint, vendor_response_review_proposal,
};

pub const EMAIL_VENDOR_RESPONSE_KIND: &str = "quotation_vendor_response_received";
pub const RESPONSE_CHANNEL_RECONCILED_KIND: &str = "quotation_vendor_response_channel_reconciled";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorResponseProgress {
    DeliveryAccepted,
    Received,
    Parsed,
    Reviewed,
    Resolved,
}

pub fn response_progress_transition_allowed(
    from: VendorResponseProgress,
    to: VendorResponseProgress,
) -> bool {
    matches!(
        (from, to),
        (
            VendorResponseProgress::DeliveryAccepted,
            VendorResponseProgress::Received
        ) | (
            VendorResponseProgress::Received,
            VendorResponseProgress::Parsed
        ) | (
            VendorResponseProgress::Parsed,
            VendorResponseProgress::Reviewed
        ) | (
            VendorResponseProgress::Reviewed,
            VendorResponseProgress::Resolved
        )
    )
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EmailResponseInput {
    pub binding: ResponseCapabilityBinding,
    pub recipient_email: String,
    pub smtp_message_id: String,
    pub source: SourceReference,
    pub received_at: DateTime<Utc>,
    pub explanation: String,
    pub question_answers: Vec<VendorQuestionAnswer>,
    pub commercial_facts: Vec<VendorCommercialFact>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ChannelReconciliationDecision {
    New(QuotationVendorResponse),
    Duplicate {
        existing_response_id: String,
        fingerprint: String,
    },
    Successor(QuotationVendorResponse),
}

fn bounded(value: &str, max: usize) -> bool {
    let value = value.trim();
    !value.is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

fn stable_id(prefix: &str, namespace: &str, material: &impl Serialize) -> String {
    format!(
        "{prefix}_{}",
        &super::stable_hash(&(namespace, material))[..26]
    )
}

pub fn normalize_email_address(value: &str) -> Option<String> {
    let value = value.trim().to_ascii_lowercase();
    (value.len() <= 320 && value.contains('@') && !value.contains([',', ';', '\r', '\n', ' ']))
        .then_some(value)
}

pub fn email_reply_binding_matches(
    sender: &str,
    approved_recipient: &str,
    reply_candidates: &[String],
    invitation_message_id: &str,
) -> bool {
    let Some(sender) = normalize_email_address(sender) else {
        return false;
    };
    let Some(recipient) = normalize_email_address(approved_recipient) else {
        return false;
    };
    sender == recipient
        && bounded(invitation_message_id, 998)
        && reply_candidates
            .iter()
            .any(|candidate| candidate.trim() == invitation_message_id.trim())
}

pub fn build_email_vendor_response(
    input: EmailResponseInput,
) -> Result<QuotationVendorResponse, String> {
    let recipient = normalize_email_address(&input.recipient_email)
        .ok_or_else(|| "invalid approved email recipient".to_string())?;
    if !bounded(&input.smtp_message_id, 998)
        || !input.smtp_message_id.trim().starts_with('<')
        || !input.smtp_message_id.trim().ends_with('>')
        || !bounded(&input.explanation, 4_000)
        || input.source.content_hash.is_none()
    {
        return Err("invalid email response material".to_string());
    }
    let submitted_at = input.received_at.to_rfc3339();
    let response = QuotationVendorResponse {
        schema_version: VENDOR_RESPONSE_SCHEMA_VERSION.to_string(),
        response_id: stable_id(
            "qvr",
            "quotation-email-response",
            &(&input.binding.thread_id, &input.smtp_message_id),
        ),
        parent_response_id: None,
        vendor_id: input.binding.vendor_id,
        thread_id: input.binding.thread_id,
        grant_id: input.binding.grant_id,
        quotation_id: input.binding.quotation_id,
        quotation_version_id: input.binding.quotation_version_id,
        projection_fingerprint: input.binding.projection_fingerprint,
        channel: VendorResponseChannel::Email,
        channel_receipt: VendorResponseChannelReceipt {
            receipt_id: stable_id("qvrr", "quotation-email-receipt", &input.smtp_message_id),
            received_at: submitted_at.clone(),
            transport_message_id: Some(input.smtp_message_id),
        },
        status: VendorResponseStatus::Received,
        submitted_at: submitted_at.clone(),
        sender_identity: None,
        question_answers: input.question_answers,
        commercial_facts: input.commercial_facts,
        availability: None,
        explanation: Some(input.explanation.trim().to_string()),
        sources: vec![input.source],
        attachments: vec![],
        attestation: VendorAttestation {
            attested_by: recipient,
            authority: VendorAttestationAuthority::VerifiedEmailRecipient,
            affirmed: true,
            attested_at: submitted_at,
        },
    };
    vendor_response_fingerprint(&response)
        .map(|_| response)
        .map_err(|_| "invalid email response".to_string())
}

fn same_binding(left: &QuotationVendorResponse, right: &QuotationVendorResponse) -> bool {
    left.vendor_id == right.vendor_id
        && left.thread_id == right.thread_id
        && left.grant_id == right.grant_id
        && left.quotation_id == right.quotation_id
        && left.quotation_version_id == right.quotation_version_id
        && left.projection_fingerprint == right.projection_fingerprint
}

pub fn reconcile_response_channels(
    existing: &[QuotationVendorResponse],
    mut incoming: QuotationVendorResponse,
) -> Result<ChannelReconciliationDecision, String> {
    let incoming_fingerprint =
        vendor_response_fingerprint(&incoming).map_err(|_| "invalid incoming response")?;
    let mut matching = existing
        .iter()
        .filter(|response| same_binding(response, &incoming))
        .collect::<Vec<_>>();
    matching.sort_by(|left, right| {
        let parsed = |value: &str| {
            DateTime::parse_from_rfc3339(value)
                .ok()
                .map(|timestamp| timestamp.with_timezone(&Utc))
        };
        parsed(&left.submitted_at)
            .cmp(&parsed(&right.submitted_at))
            .then_with(|| left.response_id.cmp(&right.response_id))
    });
    for response in &matching {
        let fingerprint =
            vendor_response_fingerprint(response).map_err(|_| "invalid stored response")?;
        if fingerprint == incoming_fingerprint {
            return Ok(ChannelReconciliationDecision::Duplicate {
                existing_response_id: response.response_id.clone(),
                fingerprint,
            });
        }
    }
    let Some(parent) = matching.last() else {
        return Ok(ChannelReconciliationDecision::New(incoming));
    };
    incoming.parent_response_id = Some(parent.response_id.clone());
    incoming.response_id = stable_id(
        "qvr",
        "quotation-response-successor",
        &(&parent.response_id, &incoming_fingerprint),
    );
    match reconcile_vendor_response(parent, &incoming).map_err(|_| "invalid response successor")? {
        VendorResponseReconciliation::Successor { .. } => {
            Ok(ChannelReconciliationDecision::Successor(incoming))
        }
        VendorResponseReconciliation::Duplicate { .. } => unreachable!(),
    }
}

/// Converges a client-decrypted, already transport-verified AFP payload. The
/// homeserver never decrypts the federation envelope; the caller must retain
/// the validated routing metadata and prove the canonical plaintext hashes to
/// the same fingerprint before it can enter review.
pub fn reconcile_verified_afp_response(
    existing: &[QuotationVendorResponse],
    response: QuotationVendorResponse,
    routing: &VendorResponseRoutingMetadata,
) -> Result<ChannelReconciliationDecision, String> {
    let fingerprint = vendor_response_fingerprint(&response)
        .map_err(|_| "invalid decrypted AFP response".to_string())?;
    if response.channel != VendorResponseChannel::Afp
        || response.attestation.authority != VendorAttestationAuthority::ClaimedAgent
        || response.response_id != routing.response_id
        || response.channel_receipt.transport_message_id.as_deref()
            != Some(routing.response_id.as_str())
        || response.grant_id != routing.grant_id
        || response.vendor_id != routing.vendor_id
        || response.quotation_id != routing.quotation_id
        || response.quotation_version_id != routing.quotation_version_id
        || !response
            .projection_fingerprint
            .eq_ignore_ascii_case(&routing.projection_fingerprint)
        || !fingerprint.eq_ignore_ascii_case(&routing.response_fingerprint)
    {
        return Err("decrypted AFP response does not match verified routing".to_string());
    }
    reconcile_response_channels(existing, response)
}

pub fn email_vendor_response_message(
    response: &QuotationVendorResponse,
    grant_message_id: &str,
    source_message_id: &str,
) -> Result<AFPMessage, String> {
    let fingerprint =
        vendor_response_fingerprint(response).map_err(|_| "invalid email response")?;
    let proposal =
        vendor_response_review_proposal(response).map_err(|_| "invalid email review proposal")?;
    let mut message = super::afp::base_message(
        super::afp::stable_message_id(
            "quotation-email-response",
            &(&response.thread_id, &response.response_id),
        ),
        &response.thread_id,
        Some(source_message_id),
        &response.submitted_at,
        "agent://email-gateway",
    );
    message.kind = Some(EMAIL_VENDOR_RESPONSE_KIND.to_string());
    message.subtype = message.kind.clone();
    message.supertags.extend([
        "quotation_vendor_response".to_string(),
        "channel:email".to_string(),
        "review:required".to_string(),
    ]);
    message.content = json!({
        "response": response,
        "review_proposal": proposal,
        "progress": VendorResponseProgress::Received,
        "attribution": {
            "mode": "verified_email_headers",
            "provider_delivery_is_booking_evidence": false,
            "user_acceptance": false,
            "booking": false,
            "payment_execution": false,
        },
    });
    message.metadata = Some(json!({
        "schema_version": VENDOR_RESPONSE_SCHEMA_VERSION,
        "response_fingerprint": fingerprint,
        "privacy_scope": "tenant_private",
        "requires_user_review": true,
    }));
    message.references = vec![
        super::afp::reference("quotation_context_grant", grant_message_id),
        super::afp::reference("quotation_source", source_message_id),
        super::afp::reference("quotation", &response.quotation_id),
        super::afp::reference("quotation_version", &response.quotation_version_id),
        super::afp::reference("vendor_response", &response.response_id),
    ];
    message.typed_refs = message.references.clone();
    Ok(message)
}

pub fn afp_vendor_response_message(
    response: &QuotationVendorResponse,
    grant_message_id: &str,
    transport_message_id: &str,
) -> Result<AFPMessage, String> {
    if response.channel != VendorResponseChannel::Afp {
        return Err("response is not an AFP response".to_string());
    }
    let fingerprint =
        vendor_response_fingerprint(response).map_err(|_| "invalid AFP response".to_string())?;
    let proposal =
        vendor_response_review_proposal(response).map_err(|_| "invalid AFP review".to_string())?;
    let mut message = super::afp::base_message(
        super::afp::stable_message_id(
            "quotation-afp-response",
            &(&response.thread_id, &response.response_id, &fingerprint),
        ),
        &response.thread_id,
        Some(transport_message_id),
        &response.submitted_at,
        "agent://quotation-federation",
    );
    message.kind = Some(EMAIL_VENDOR_RESPONSE_KIND.to_string());
    message.subtype = message.kind.clone();
    message.supertags.extend([
        "quotation_vendor_response".to_string(),
        "channel:afp".to_string(),
        "review:required".to_string(),
    ]);
    message.content = json!({
        "response": response,
        "review_proposal": proposal,
        "progress": VendorResponseProgress::Received,
        "attribution": {
            "mode": "verified_claimed_agent",
            "transport_signature_verified": true,
            "client_decryption_confirmed": true,
            "provider_delivery_is_booking_evidence": false,
            "user_acceptance": false,
            "booking": false,
            "payment_execution": false,
        },
    });
    message.metadata = Some(json!({
        "schema_version": VENDOR_RESPONSE_SCHEMA_VERSION,
        "response_fingerprint": fingerprint,
        "privacy_scope": "tenant_private",
        "requires_user_review": true,
    }));
    message.references = vec![
        super::afp::reference("quotation_context_grant", grant_message_id),
        super::afp::reference("vendor_response_transport", transport_message_id),
        super::afp::reference("quotation", &response.quotation_id),
        super::afp::reference("quotation_version", &response.quotation_version_id),
        super::afp::reference("vendor_response", &response.response_id),
    ];
    message.typed_refs = message.references.clone();
    Ok(message)
}

pub fn channel_reconciled_message(
    incoming: &QuotationVendorResponse,
    existing_response_id: &str,
    fingerprint: &str,
    source_message_id: &str,
) -> AFPMessage {
    let mut message = super::afp::base_message(
        super::afp::stable_message_id(
            "quotation-response-channel-reconciled",
            &(&incoming.thread_id, existing_response_id, fingerprint),
        ),
        &incoming.thread_id,
        Some(source_message_id),
        &incoming.submitted_at,
        "agent://quotation-intelligence",
    );
    message.kind = Some(RESPONSE_CHANNEL_RECONCILED_KIND.to_string());
    message.subtype = message.kind.clone();
    message.content = json!({
        "existing_response_id": existing_response_id,
        "duplicate_channel": incoming.channel,
        "response_fingerprint": fingerprint,
        "review_proposal_created": false,
        "quotation_successor_created": false,
        "booking": false,
        "payment_execution": false,
    });
    message.references = vec![
        super::afp::reference("vendor_response", existing_response_id),
        super::afp::reference(
            if incoming.channel == VendorResponseChannel::Afp {
                "vendor_response_transport"
            } else {
                "quotation_source"
            },
            source_message_id,
        ),
    ];
    message.typed_refs = message.references.clone();
    message
}

#[allow(clippy::too_many_arguments)]
pub fn afp_transport_accepted_message(
    receipt: &VendorTransportReceipt,
    thread_id: &str,
    grant_message_id: &str,
    vendor_id: &str,
    quotation_id: &str,
    quotation_version_id: &str,
    response_id: &str,
    response_fingerprint: &str,
    owner_user_id: &str,
) -> AFPMessage {
    let mut message = super::afp::base_message(
        super::afp::stable_message_id(
            "quotation-afp-response-transport-accepted",
            &(thread_id, response_id, &receipt.receipt_id),
        ),
        thread_id,
        Some(grant_message_id),
        &receipt.received_at,
        "agent://quotation-federation",
    );
    message.to = vec![owner_user_id.to_string()];
    message.kind = Some("quotation_vendor_response_transport_accepted".to_string());
    message.subtype = message.kind.clone();
    message
        .supertags
        .extend(["channel:afp".to_string(), "transport:accepted".to_string()]);
    message.content = json!({
        "transport_receipt": receipt,
        "progress": VendorResponseProgress::DeliveryAccepted,
        "response_id": response_id,
        "response_fingerprint": response_fingerprint,
        "canonical_response_created": false,
        "requires_client_decryption": true,
        "provider_delivery_is_booking_evidence": false,
        "booking": false,
        "payment_execution": false,
    });
    message.metadata = Some(json!({
        "privacy_scope": "tenant_private",
        "schema_version": "quotation.vendor_response_transport_state.v1",
    }));
    message.references = vec![
        super::afp::reference("quotation_context_grant", grant_message_id),
        super::afp::reference("target_vendor", vendor_id),
        super::afp::reference("quotation", quotation_id),
        super::afp::reference("quotation_version", quotation_version_id),
        super::afp::reference("vendor_response", response_id),
    ];
    message.typed_refs = message.references.clone();
    message
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quotation::ContextGrantAction;

    fn binding() -> ResponseCapabilityBinding {
        ResponseCapabilityBinding {
            grant_id: "grant-1".into(),
            vendor_id: "vendor-1".into(),
            response_recipient_id: "vendor@example.test".into(),
            quotation_id: "quote-1".into(),
            quotation_version_id: "quote-1-v1".into(),
            thread_id: "thread-1".into(),
            projection_fingerprint: "a".repeat(64),
            allowed_actions: vec![ContextGrantAction::AnswerQuestions],
            allowed_question_ids: vec![],
            not_before: "2026-10-18T00:00:00Z".into(),
            expires_at: "2026-10-19T00:00:00Z".into(),
        }
    }

    fn email_response() -> QuotationVendorResponse {
        build_email_vendor_response(EmailResponseInput {
            binding: binding(),
            recipient_email: "vendor@example.test".into(),
            smtp_message_id: "<reply-1@example.test>".into(),
            source: SourceReference {
                source_id: "source-email".into(),
                source_version_id: "source-email:1".into(),
                media_type: "message/rfc822".into(),
                content_hash: Some("sha256:body".into()),
            },
            received_at: "2026-10-18T01:00:00Z".parse().unwrap(),
            explanation: "The revised total is AUD 4,200.".into(),
            question_answers: vec![],
            commercial_facts: vec![],
        })
        .unwrap()
    }

    #[test]
    fn header_and_recipient_binding_never_falls_back_to_sender_alone() {
        assert!(email_reply_binding_matches(
            "Vendor@Example.Test",
            "vendor@example.test",
            &["<invite@example.test>".into()],
            "<invite@example.test>",
        ));
        assert!(!email_reply_binding_matches(
            "vendor@example.test",
            "vendor@example.test",
            &[],
            "<invite@example.test>",
        ));
        assert!(!email_reply_binding_matches(
            "other@example.test",
            "vendor@example.test",
            &["<invite@example.test>".into()],
            "<invite@example.test>",
        ));
    }

    #[test]
    fn response_progress_does_not_turn_delivery_into_review_or_resolution() {
        assert!(response_progress_transition_allowed(
            VendorResponseProgress::DeliveryAccepted,
            VendorResponseProgress::Received,
        ));
        assert!(!response_progress_transition_allowed(
            VendorResponseProgress::DeliveryAccepted,
            VendorResponseProgress::Reviewed,
        ));
        assert!(!response_progress_transition_allowed(
            VendorResponseProgress::Received,
            VendorResponseProgress::Resolved,
        ));
    }

    #[test]
    fn exact_cross_channel_material_deduplicates_without_new_review() {
        let email = email_response();
        let mut portal = email.clone();
        portal.response_id = "portal-response".into();
        portal.channel = VendorResponseChannel::SecureLink;
        portal.channel_receipt.receipt_id = "portal-receipt".into();
        portal.channel_receipt.transport_message_id = None;
        portal.attestation.authority = VendorAttestationAuthority::VendorRepresentative;
        let decision = reconcile_response_channels(&[portal.clone()], email.clone()).unwrap();
        let ChannelReconciliationDecision::Duplicate {
            existing_response_id,
            fingerprint,
        } = decision
        else {
            panic!("expected duplicate")
        };
        assert_eq!(existing_response_id, portal.response_id);
        let message =
            channel_reconciled_message(&email, &existing_response_id, &fingerprint, "source-email");
        assert_eq!(message.content["review_proposal_created"], false);
        assert_eq!(message.content["quotation_successor_created"], false);
    }

    #[test]
    fn material_cross_channel_change_is_parent_linked_successor() {
        let first = email_response();
        let mut changed = email_response();
        changed.response_id = "changed-transport-id".into();
        changed.channel_receipt.receipt_id = "changed-receipt".into();
        changed.channel_receipt.transport_message_id = Some("<reply-2@example.test>".into());
        changed.submitted_at = "2026-10-18T02:00:00Z".into();
        changed.channel_receipt.received_at = changed.submitted_at.clone();
        changed.attestation.attested_at = changed.submitted_at.clone();
        changed.explanation = Some("The revised total is AUD 4,500.".into());
        let ChannelReconciliationDecision::Successor(successor) =
            reconcile_response_channels(&[first.clone()], changed).unwrap()
        else {
            panic!("expected successor")
        };
        assert_eq!(
            successor.parent_response_id.as_deref(),
            Some(first.response_id.as_str())
        );
    }

    #[test]
    fn verified_afp_plaintext_converges_only_when_transport_fingerprint_matches() {
        let email = email_response();
        let mut afp = email.clone();
        afp.response_id = "afp-response-1".into();
        afp.channel = VendorResponseChannel::Afp;
        afp.channel_receipt.receipt_id = "afp-receipt-1".into();
        afp.channel_receipt.transport_message_id = Some("afp-response-1".into());
        afp.attestation.authority = VendorAttestationAuthority::ClaimedAgent;
        let fingerprint = vendor_response_fingerprint(&afp).expect("canonical fingerprint");
        let routing = VendorResponseRoutingMetadata {
            schema_version: crate::quotation::VENDOR_RESPONSE_TRANSPORT_VERSION.into(),
            grant_message_id: "grant-message-1".into(),
            grant_id: afp.grant_id.clone(),
            vendor_id: afp.vendor_id.clone(),
            quotation_id: afp.quotation_id.clone(),
            quotation_version_id: afp.quotation_version_id.clone(),
            projection_fingerprint: afp.projection_fingerprint.clone(),
            response_id: afp.response_id.clone(),
            response_fingerprint: fingerprint,
            nonce: "nonce-1".into(),
            agent_card_key_id: "key-1".into(),
            expires_at: "2026-10-19T00:00:00Z".into(),
            sender_identity_id: None,
            sender_identity_kind: None,
        };
        assert!(matches!(
            reconcile_verified_afp_response(&[email], afp.clone(), &routing),
            Ok(ChannelReconciliationDecision::Duplicate { .. })
        ));
        let mut tampered = afp;
        tampered.explanation = Some("A different total".into());
        assert!(reconcile_verified_afp_response(&[], tampered, &routing).is_err());
    }

    #[test]
    fn afp_transport_acceptance_is_not_a_review_or_booking_event() {
        let receipt = VendorTransportReceipt {
            receipt_id: "receipt-1".into(),
            request_id: "request-1".into(),
            request_digest: "a".repeat(64),
            status: crate::quotation::VendorTransportReceiptStatus::Accepted,
            message_id: Some("response-1".into()),
            failure: None,
            received_at: "2026-10-18T01:00:00Z".into(),
        };
        let message = afp_transport_accepted_message(
            &receipt,
            "thread-1",
            "grant-message-1",
            "vendor-1",
            "quote-1",
            "quote-1-v1",
            "response-1",
            &"b".repeat(64),
            "owner-1",
        );
        assert_eq!(message.content["progress"], "delivery_accepted");
        assert_eq!(message.content["canonical_response_created"], false);
        assert_eq!(
            message.content["provider_delivery_is_booking_evidence"],
            false
        );
        assert_eq!(message.content["booking"], false);
    }
}
