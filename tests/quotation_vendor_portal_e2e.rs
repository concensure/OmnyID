use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use omnyid_homeserver::{message::AFPMessage, quotation::*};
use serde_json::json;

const PEPPER: &[u8] = b"vendor-portal-e2e-pepper-at-least-32-bytes";

fn at(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .unwrap()
        .with_timezone(&Utc)
}

fn quote() -> NormalisedQuotation {
    serde_json::from_str(include_str!(
        "fixtures/quotation/generic_normalised_quote.json"
    ))
    .unwrap()
}

fn response() -> QuotationVendorResponse {
    serde_json::from_str(include_str!("fixtures/quotation/vendor_response_v1.json")).unwrap()
}

fn selected_messages() -> Vec<AFPMessage> {
    let quotation = quote();
    let quotation_message = normalised_quotation_message(
        &quotation,
        "thread-e2e",
        None,
        "2027-01-10T00:00:00Z",
        "user-synthetic",
    );
    let scenario = ComparableScenario {
        scenario_id: "scenario-e2e".to_string(),
        guest_count: None,
        selected_optional_line_ids: Vec::new(),
        quantity_overrides: BTreeMap::new(),
    };
    let comparison = compare_quotations(
        "comparison-e2e".to_string(),
        scenario.scenario_id.clone(),
        vec![ComparisonCandidate {
            quotation_id: quotation.identity.quotation_id.clone(),
            version_id: quotation.identity.version_id.clone(),
            vendor_id: quotation.identity.vendor_id.clone(),
            total: calculate_comparable_total(&quotation, &scenario),
            requirements: Vec::new(),
        }],
    );
    let comparison_message = quotation_comparison_message(
        &comparison,
        "thread-e2e",
        Some(&quotation_message.id),
        "2027-01-10T00:01:00Z",
        "user-synthetic",
    );
    let selection = QuotationSelection {
        selection_id: "selection-e2e".to_string(),
        comparison_id: comparison.comparison_id,
        comparison_revision: comparison_message.id.clone(),
        quotation_id: quotation.identity.quotation_id.clone(),
        quotation_version_id: quotation.identity.version_id.clone(),
        vendor_id: quotation.identity.vendor_id.clone(),
        supersedes_selection_id: None,
        actor_id: "user-synthetic".to_string(),
        user_authority: true,
        occurred_at: "2027-01-10T00:02:00Z".to_string(),
        idempotency_key: "selection-e2e-idempotency".to_string(),
    };
    let selection_message =
        quotation_selection_message(&selection, "thread-e2e", &comparison_message.id);
    let transition = ClosureTransition {
        event_id: "closure-selected-e2e".to_string(),
        quotation_id: quotation.identity.quotation_id,
        quotation_version_id: quotation.identity.version_id,
        expected_state: None,
        target_state: ClosureState::Selected,
        actor_id: "user-synthetic".to_string(),
        user_authority: true,
        occurred_at: "2027-01-10T00:02:00Z".to_string(),
        evidence_sources: Vec::new(),
        contract_changes: Vec::new(),
        contract_changes_reviewed: false,
        deposit: None,
        deadline_at: None,
    };
    let closure_message = quotation_closure_transition_message(
        &transition,
        "closure-selected-e2e-idempotency",
        "thread-e2e",
        &selection_message.id,
    );
    vec![
        quotation_message,
        comparison_message,
        selection_message,
        closure_message,
    ]
}

fn source(id: &str) -> SourceReference {
    SourceReference {
        source_id: id.to_string(),
        source_version_id: format!("{id}-v1"),
        media_type: "application/pdf".to_string(),
        content_hash: Some(format!("sha256:{id}")),
    }
}

fn closure(id: &str, expected: Option<ClosureState>, target: ClosureState) -> ClosureTransition {
    let minute = match target {
        ClosureState::Selected => 0,
        ClosureState::ContractReceived => 1,
        ClosureState::ContractReviewed => 2,
        ClosureState::DepositRequested => 3,
        ClosureState::DepositRecordedPaid => 4,
        ClosureState::BookingConfirmed => 5,
        ClosureState::Cancelled => 6,
        ClosureState::Refunded => 7,
        ClosureState::Superseded => 8,
    };
    ClosureTransition {
        event_id: id.to_string(),
        quotation_id: "quote-e2e".to_string(),
        quotation_version_id: "quote-e2e-v2".to_string(),
        expected_state: expected,
        target_state: target,
        actor_id: "user-synthetic".to_string(),
        user_authority: true,
        occurred_at: format!("2027-01-10T00:{minute:02}:00Z"),
        evidence_sources: if target == ClosureState::Selected {
            Vec::new()
        } else {
            vec![source(id)]
        },
        contract_changes: Vec::new(),
        contract_changes_reviewed: false,
        deposit: None,
        deadline_at: None,
    }
}

fn capability_binding() -> ResponseCapabilityBinding {
    ResponseCapabilityBinding {
        grant_id: "grant-e2e".to_string(),
        vendor_id: "vendor-e2e".to_string(),
        response_recipient_id: "recipient-e2e".to_string(),
        quotation_id: "quote-e2e".to_string(),
        quotation_version_id: "quote-e2e-v2".to_string(),
        thread_id: "thread-e2e".to_string(),
        projection_fingerprint: "a".repeat(64),
        allowed_actions: vec![ContextGrantAction::AnswerQuestions],
        allowed_question_ids: vec!["availability".to_string()],
        not_before: "2027-01-10T00:00:00Z".to_string(),
        expires_at: "2027-01-11T00:00:00Z".to_string(),
    }
}

#[test]
fn scenario_a_material_successor_invalidates_the_active_decision() {
    let mut messages = selected_messages();
    let ordered = replay_quotation_messages(&messages);
    let shuffled_with_duplicate = replay_quotation_messages(&[
        messages[3].clone(),
        messages[1].clone(),
        messages[2].clone(),
        messages[0].clone(),
        messages[2].clone(),
    ]);
    assert_eq!(ordered, shuffled_with_duplicate);
    assert_eq!(ordered.active_selections.len(), 1);

    let mut successor = quote();
    successor.identity.version_id = "production-hire-quote-v2".to_string();
    successor.identity.supersedes_version_id = Some("production-hire-quote-v1".to_string());
    messages.push(normalised_quotation_message(
        &successor,
        "thread-e2e",
        Some(&messages[0].id),
        "2027-01-11T00:00:00Z",
        "user-synthetic",
    ));
    let stale = replay_quotation_messages(&messages);
    assert!(stale.active_selections.is_empty());
    assert!(stale.active_closures.is_empty());
    assert!(stale.selections.contains_key("selection-e2e"));
}

#[test]
fn scenario_b_contract_change_requires_source_linked_human_review() {
    let selected =
        apply_closure_transition(None, &closure("selected", None, ClosureState::Selected)).unwrap();
    let received = apply_closure_transition(
        Some(&selected),
        &closure(
            "contract",
            Some(ClosureState::Selected),
            ClosureState::ContractReceived,
        ),
    )
    .unwrap();
    let mut review = closure(
        "review",
        Some(ClosureState::ContractReceived),
        ClosureState::ContractReviewed,
    );
    review.contract_changes.push(MaterialChange {
        kind: MaterialChangeKind::LineAdded,
        path: "mandatory_fees.security".to_string(),
        before: None,
        after: Some(json!({"amount_minor": 30000, "currency": "AUD"})),
    });
    assert_eq!(
        apply_closure_transition(Some(&received), &review),
        Err(ClosureError::ContractChangesRequireReview)
    );
    review.contract_changes_reviewed = true;
    let reviewed = apply_closure_transition(Some(&received), &review).unwrap();
    assert_eq!(reviewed.state, ClosureState::ContractReviewed);
    assert!(!reviewed.evidence_sources.is_empty());
}

#[test]
fn scenario_c_claimed_afp_response_is_review_only_and_competitor_blind() {
    let mut claimed = response();
    claimed.channel = VendorResponseChannel::Afp;
    claimed.attestation.authority = VendorAttestationAuthority::ClaimedAgent;
    assert!(validate_vendor_response(&claimed).is_empty());
    let proposal = vendor_response_review_proposal(&claimed).unwrap();
    assert!(proposal.requires_user_review);
    let encoded = serde_json::to_string(&proposal).unwrap();
    for prohibited in [
        "competitor",
        "private_note",
        "booking_confirmed",
        "accepted",
    ] {
        assert!(!encoded.contains(prohibited));
    }
    assert_eq!(proposal.response_id, claimed.response_id);
}

#[test]
fn scenario_d_secure_link_is_exact_bound_single_use_and_fail_closed() {
    let issued = issue_response_capability_with_entropy(
        ResponseCapabilityIssue {
            capability_id: "capability-e2e".to_string(),
            binding: capability_binding(),
            issued_at: "2027-01-10T00:00:00Z".to_string(),
        },
        PEPPER,
        [7; 32],
        1,
        None,
    )
    .unwrap();
    let raw = issued.token.expose();
    let mut record = issued.record;
    let fingerprint = record.binding.projection_fingerprint.clone();
    let access = ResponseCapabilityAccess {
        vendor_id: "vendor-e2e",
        response_recipient_id: "recipient-e2e",
        quotation_id: "quote-e2e",
        quotation_version_id: "quote-e2e-v2",
        thread_id: "thread-e2e",
        projection_fingerprint: &fingerprint,
    };
    let authority = ResponseCapabilityAuthority {
        grant_active: true,
        quotation_active: true,
        claim_disputed: false,
        closure_terminal: false,
        active_projection_fingerprint: &fingerprint,
    };
    let mut session = exchange_response_capability_with_entropy(
        &mut record,
        &raw,
        PEPPER,
        &access,
        &authority,
        at("2027-01-10T00:01:00Z"),
        [8; 32],
        [9; 32],
        [10; 32],
    )
    .unwrap();
    assert!(!session.record.account_access);
    assert!(session.secrets.cookie_header().contains("SameSite=Strict"));
    let proof = ResponseSubmissionProof {
        session_token: session.secrets.session_token(),
        csrf_token: session.secrets.csrf_token(),
        submission_nonce: session.secrets.submission_nonce(),
        action: ContextGrantAction::AnswerQuestions,
    };
    consume_response_capability(
        &mut record,
        &mut session.record,
        &proof,
        PEPPER,
        &authority,
        at("2027-01-10T00:02:00Z"),
    )
    .unwrap();
    assert_eq!(
        consume_response_capability(
            &mut record,
            &mut session.record,
            &proof,
            PEPPER,
            &authority,
            at("2027-01-10T00:03:00Z"),
        ),
        Err(ResponseCapabilityError::Unavailable)
    );

    let policy = ResponseCapabilityRatePolicy {
        token_prefix_limit: 5,
        ip_hash_limit: 10,
        vendor_limit: 20,
        thread_limit: 20,
        retry_after_seconds: 60,
    };
    assert!(matches!(
        response_capability_rate_decision(
            &ResponseCapabilityRateSnapshot {
                token_prefix_attempts: 5,
                ip_hash_attempts: 0,
                vendor_attempts: 0,
                thread_attempts: 0,
            },
            &policy,
        ),
        ResponseCapabilityRateDecision::Limited { .. }
    ));
}

#[test]
fn scenario_e_email_and_portal_material_converge_on_one_review_response() {
    let portal = response();
    let mut email = portal.clone();
    email.response_id = "response-email-e2e".to_string();
    email.channel = VendorResponseChannel::Email;
    email.channel_receipt.receipt_id = "receipt-email-e2e".to_string();
    email.channel_receipt.transport_message_id = Some("provider-email-e2e".to_string());
    email.attestation.authority = VendorAttestationAuthority::VerifiedEmailRecipient;
    assert_eq!(
        vendor_response_fingerprint(&portal).unwrap(),
        vendor_response_fingerprint(&email).unwrap()
    );
    assert!(matches!(
        reconcile_vendor_response(&portal, &email),
        Ok(VendorResponseReconciliation::Duplicate { .. })
    ));
    assert_eq!(
        vendor_response_review_proposal(&portal).unwrap().facts,
        vendor_response_review_proposal(&email).unwrap().facts
    );
}

#[test]
fn scenario_f_booking_retries_commit_once_and_refund_preserves_history() {
    let events = vec![
        closure("selected", None, ClosureState::Selected),
        closure(
            "contract",
            Some(ClosureState::Selected),
            ClosureState::ContractReceived,
        ),
        closure(
            "reviewed",
            Some(ClosureState::ContractReceived),
            ClosureState::ContractReviewed,
        ),
        closure(
            "booking",
            Some(ClosureState::ContractReviewed),
            ClosureState::BookingConfirmed,
        ),
        closure(
            "cancelled",
            Some(ClosureState::BookingConfirmed),
            ClosureState::Cancelled,
        ),
        closure(
            "refunded",
            Some(ClosureState::Cancelled),
            ClosureState::Refunded,
        ),
    ];
    let with_duplicate = [events.clone(), vec![events[3].clone()]].concat();
    let snapshot = replay_closure(&with_duplicate).unwrap().unwrap();
    assert_eq!(snapshot.state, ClosureState::Refunded);
    assert_eq!(snapshot.last_event_id, "refunded");
    assert_eq!(snapshot.evidence_sources.len(), events.len() - 1);

    let booked = replay_closure(&events[..4]).unwrap().unwrap();
    let total = Money {
        amount_minor: 425_000,
        currency: "AUD".to_string(),
    };
    assert_eq!(
        budget_commitment(&booked, total.clone()),
        budget_commitment(&booked, total)
    );
}

#[test]
fn scenario_g_permission_projection_rejects_private_and_competitor_fields() {
    let available = vec![
        ShareableContextField {
            fact_id: "fact-approved".to_string(),
            key: "approved_requirement".to_string(),
            value: json!("wheelchair access"),
            provenance_ref: "requirement-e2e".to_string(),
            class: ShareableContextClass::ApprovedRequirement,
        },
        ShareableContextField {
            fact_id: "fact-budget".to_string(),
            key: "budget".to_string(),
            value: json!({"amount_minor": 1}),
            provenance_ref: "budget-e2e".to_string(),
            class: ShareableContextClass::ApprovedBudget,
        },
        ShareableContextField {
            fact_id: "fact-competitor".to_string(),
            key: "competitor.price".to_string(),
            value: json!("never share"),
            provenance_ref: "competitor-e2e".to_string(),
            class: ShareableContextClass::Prohibited,
        },
        ShareableContextField {
            fact_id: "fact-private".to_string(),
            key: "private_note".to_string(),
            value: json!("never share"),
            provenance_ref: "note-e2e".to_string(),
            class: ShareableContextClass::Prohibited,
        },
    ];
    let mut grant = VendorContextGrant {
        grant_id: "grant-e2e".to_string(),
        granted_by_user_id: "user-synthetic".to_string(),
        target_vendor_id: "vendor-e2e".to_string(),
        quotation_id: "quote-e2e".to_string(),
        quotation_version_id: "quote-e2e-v2".to_string(),
        thread_id: "thread-e2e".to_string(),
        response_recipient_id: "recipient-e2e".to_string(),
        target_agent_id: None,
        purpose: ContextGrantPurpose::ResolveQuoteGaps,
        allowed_fact_ids: available
            .iter()
            .map(|field| field.fact_id.clone())
            .collect(),
        allowed_question_ids: vec!["availability".to_string(), "access".to_string()],
        allowed_actions: vec![ContextGrantAction::AnswerQuestions],
        issued_at: "2027-01-10T00:00:00Z".to_string(),
        not_before: "2027-01-10T00:00:00Z".to_string(),
        expires_at: "2027-01-11T00:00:00Z".to_string(),
        scope: ContextGrantScope::SingleUse,
        approval_receipt_ref: "approval-e2e".to_string(),
        projection_version: VENDOR_CONTEXT_PROJECTION_VERSION.to_string(),
        projection_fingerprint: "0".repeat(64),
    };
    grant.projection_fingerprint =
        vendor_context_projection_fingerprint(&grant, &available).unwrap();
    let projection = project_vendor_context(
        &grant,
        "vendor-e2e",
        &available,
        &[],
        &BTreeSet::new(),
        at("2027-01-10T00:01:00Z"),
    )
    .unwrap();
    assert_eq!(projection.question_ids.len(), 2);
    assert_eq!(projection.fields.len(), 2);
    let encoded = serde_json::to_string(&projection).unwrap();
    assert!(encoded.contains("approved_requirement"));
    assert!(encoded.contains("budget"));
    assert!(!encoded.contains("competitor.price"));
    assert!(!encoded.contains("private_note"));
    assert!(!encoded.contains("never share"));
}
