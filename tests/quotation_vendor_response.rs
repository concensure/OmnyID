use omnyid_homeserver::quotation::*;
use serde_json::{Value, json};

fn fixture() -> QuotationVendorResponse {
    serde_json::from_str(include_str!("fixtures/quotation/vendor_response_v1.json"))
        .expect("vendor response fixture")
}

#[test]
fn shared_fixture_round_trips_and_is_template_neutral() {
    let response = fixture();
    assert!(validate_vendor_response(&response).is_empty());
    assert_eq!(response.schema_version, VENDOR_RESPONSE_SCHEMA_VERSION);
    assert_eq!(response.status, VendorResponseStatus::Submitted);
    let encoded = serde_json::to_value(&response).unwrap();
    assert!(encoded.get("wedding_plan_id").is_none());
    assert!(encoded.get("accepted").is_none());
    assert!(encoded.get("booking_confirmed").is_none());
    assert!(encoded.get("payment").is_none());
    assert_eq!(
        vendor_response_fingerprint(&response).unwrap(),
        "b25879e08c13c2b2286a53808915d4e126d5e814886b99d73b17f8727c03ea55"
    );
}

#[test]
fn serde_denies_unknown_fields_at_every_material_boundary() {
    let mut response: Value =
        serde_json::from_str(include_str!("fixtures/quotation/vendor_response_v1.json")).unwrap();
    response["wedding_plan_id"] = json!("must-not-exist");
    assert!(serde_json::from_value::<QuotationVendorResponse>(response).is_err());

    let mut response: Value =
        serde_json::from_str(include_str!("fixtures/quotation/vendor_response_v1.json")).unwrap();
    response["commercial_facts"][0]["private_note"] = json!("hidden");
    assert!(serde_json::from_value::<QuotationVendorResponse>(response).is_err());

    let mut response: Value =
        serde_json::from_str(include_str!("fixtures/quotation/vendor_response_v1.json")).unwrap();
    response["commercial_facts"][0]["value"]["value"]["display_amount"] = json!("AUD 4,250");
    assert!(serde_json::from_value::<QuotationVendorResponse>(response).is_err());
}

#[test]
fn confirmed_material_facts_require_exact_registered_evidence() {
    let mut response = fixture();
    response.commercial_facts[0].anchors.clear();
    assert!(
        validate_vendor_response(&response)
            .iter()
            .any(|issue| issue.code == "invalid_commercial_fact")
    );

    let mut proposed = fixture();
    proposed.commercial_facts[0].state = VendorResponseEvidenceState::Proposed;
    proposed.commercial_facts[0].anchors.clear();
    assert!(validate_vendor_response(&proposed).is_empty());

    let mut missing_source = fixture();
    missing_source.sources.clear();
    assert!(
        validate_vendor_response(&missing_source)
            .iter()
            .any(|issue| issue.code == "invalid_commercial_fact")
    );
}

#[test]
fn structured_facts_become_source_linked_review_proposals_not_acceptance() {
    let proposal = vendor_response_review_proposal(&fixture()).unwrap();
    assert!(proposal.requires_user_review);
    assert_eq!(proposal.facts.len(), 2);
    assert_eq!(proposal.sources.len(), 1);
    assert_eq!(proposal.facts[0].evidence.state, EvidenceState::Confirmed);
    assert_eq!(proposal.facts[0].evidence.anchors.len(), 1);
    assert_eq!(
        proposal.facts[1].vendor_state,
        VendorResponseEvidenceState::Proposed
    );
    assert_eq!(proposal.facts[1].evidence.state, EvidenceState::Unknown);
    assert!(proposal.facts[1].evidence.anchors.is_empty());
    assert!(
        !serde_json::to_string(&proposal)
            .unwrap()
            .contains("accepted")
    );
    assert!(
        !serde_json::to_string(&proposal)
            .unwrap()
            .contains("booking")
    );
}

#[test]
fn semantically_equivalent_channels_and_order_share_one_fingerprint() {
    let first = fixture();
    let mut equivalent = first.clone();
    equivalent.response_id = "email-response-9".to_string();
    equivalent.channel = VendorResponseChannel::Email;
    equivalent.channel_receipt.receipt_id = "gmail-message-9".to_string();
    equivalent.channel_receipt.transport_message_id = Some("provider-message-9".to_string());
    equivalent.channel_receipt.received_at = "2026-10-18T02:00:00Z".to_string();
    equivalent.submitted_at = "2026-10-18T01:59:00Z".to_string();
    equivalent.attestation.attested_by = "claimed-agent-9".to_string();
    equivalent.attestation.authority = VendorAttestationAuthority::ClaimedAgent;
    equivalent.sources[0].source_id = "email-source-9".to_string();
    equivalent.sources[0].source_version_id = "email-source-9-v1".to_string();
    equivalent.commercial_facts[0].anchors[0].source_id = "email-source-9".to_string();
    equivalent.commercial_facts[0].anchors[0].source_version_id = "email-source-9-v1".to_string();
    equivalent.attachments[0].source_id = "email-source-9".to_string();
    equivalent.attachments[0].source_version_id = "email-source-9-v1".to_string();
    equivalent.sources[0].media_type = "APPLICATION/PDF".to_string();
    equivalent.sources[0].content_hash = Some("SHA256:VENDOR-RESPONSE-FIXTURE".to_string());
    equivalent.attachments[0].media_type = "APPLICATION/PDF".to_string();
    equivalent.attachments[0].content_hash = "SHA256:VENDOR-RESPONSE-FIXTURE".to_string();
    equivalent.availability.as_mut().unwrap().starts_at = Some("2027-02-19T21:00:00Z".to_string());
    equivalent.availability.as_mut().unwrap().ends_at = Some("2027-02-20T12:00:00Z".to_string());
    equivalent.question_answers.reverse();
    equivalent.commercial_facts.reverse();
    equivalent.sources.reverse();
    equivalent.attachments.reverse();
    assert_eq!(
        vendor_response_fingerprint(&first).unwrap(),
        vendor_response_fingerprint(&equivalent).unwrap()
    );
    assert!(matches!(
        reconcile_vendor_response(&first, &equivalent),
        Ok(VendorResponseReconciliation::Duplicate { .. })
    ));
}

#[test]
fn a_material_change_requires_an_exact_parent_linked_successor() {
    let existing = fixture();
    let mut changed = existing.clone();
    changed.response_id = "response-2".to_string();
    changed.submitted_at = "2026-10-18T02:00:00Z".to_string();
    changed.channel_receipt.receipt_id = "secure-link-receipt-2".to_string();
    changed.channel_receipt.received_at = "2026-10-18T02:01:00Z".to_string();
    changed.commercial_facts[0].value = Some(VendorCommercialValue::Money(Money {
        amount_minor: 450_000,
        currency: "AUD".to_string(),
    }));
    assert_eq!(
        reconcile_vendor_response(&existing, &changed),
        Err(VendorResponseReconciliationError::SuccessorRequired)
    );
    changed.parent_response_id = Some(existing.response_id.clone());
    assert!(matches!(
        reconcile_vendor_response(&existing, &changed),
        Ok(VendorResponseReconciliation::Successor { .. })
    ));
}

#[test]
fn binding_changes_cannot_be_disguised_as_successors() {
    let existing = fixture();
    for field in ["vendor", "thread", "grant", "version", "projection"] {
        let mut changed = existing.clone();
        changed.response_id = format!("response-{field}");
        changed.parent_response_id = Some(existing.response_id.clone());
        changed.submitted_at = "2026-10-18T02:00:00Z".to_string();
        changed.channel_receipt.received_at = "2026-10-18T02:01:00Z".to_string();
        changed.explanation = Some(format!("material change {field}"));
        match field {
            "vendor" => changed.vendor_id = "other-vendor".to_string(),
            "thread" => changed.thread_id = "other-thread".to_string(),
            "grant" => changed.grant_id = "other-grant".to_string(),
            "version" => changed.quotation_version_id = "other-version".to_string(),
            "projection" => changed.projection_fingerprint = "b".repeat(64),
            _ => unreachable!(),
        }
        assert_eq!(
            reconcile_vendor_response(&existing, &changed),
            Err(VendorResponseReconciliationError::BindingMismatch),
            "{field}"
        );
    }
}

#[test]
fn response_lifecycle_never_contains_user_acceptance_or_booking() {
    assert!(vendor_response_status_transition_allowed(
        VendorResponseStatus::Draft,
        VendorResponseStatus::Submitted,
    ));
    assert!(vendor_response_status_transition_allowed(
        VendorResponseStatus::Submitted,
        VendorResponseStatus::Received,
    ));
    assert!(vendor_response_status_transition_allowed(
        VendorResponseStatus::Received,
        VendorResponseStatus::Reviewed,
    ));
    assert!(!vendor_response_status_transition_allowed(
        VendorResponseStatus::Submitted,
        VendorResponseStatus::Reviewed,
    ));
    let encoded = serde_json::to_string(&[
        VendorResponseStatus::Draft,
        VendorResponseStatus::Submitted,
        VendorResponseStatus::Received,
        VendorResponseStatus::Reviewed,
        VendorResponseStatus::Rejected,
        VendorResponseStatus::Superseded,
    ])
    .unwrap();
    assert!(!encoded.contains("accepted"));
    assert!(!encoded.contains("booking"));
}
