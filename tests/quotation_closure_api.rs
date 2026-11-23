use std::collections::BTreeMap;

use omnyid_homeserver::quotation::*;

fn quote() -> NormalisedQuotation {
    serde_json::from_str(include_str!(
        "fixtures/quotation/generic_normalised_quote.json"
    ))
    .unwrap()
}

fn setup_messages() -> Vec<omnyid_homeserver::message::AFPMessage> {
    let quotation = quote();
    let quotation_message = normalised_quotation_message(
        &quotation,
        "thread-closure-api",
        None,
        "2027-01-10T00:00:00Z",
        "user-synthetic",
    );
    let scenario = ComparableScenario {
        scenario_id: "closure-scenario".to_string(),
        guest_count: None,
        selected_optional_line_ids: Vec::new(),
        quantity_overrides: BTreeMap::new(),
    };
    let comparison = compare_quotations(
        "closure-comparison".to_string(),
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
        "thread-closure-api",
        Some(&quotation_message.id),
        "2027-01-10T00:01:00Z",
        "user-synthetic",
    );
    let selection = QuotationSelection {
        selection_id: "selection-closure-1".to_string(),
        comparison_id: comparison.comparison_id,
        comparison_revision: comparison_message.id.clone(),
        quotation_id: quotation.identity.quotation_id.clone(),
        quotation_version_id: quotation.identity.version_id.clone(),
        vendor_id: quotation.identity.vendor_id.clone(),
        supersedes_selection_id: None,
        actor_id: "user-synthetic".to_string(),
        user_authority: true,
        occurred_at: "2027-01-10T00:02:00Z".to_string(),
        idempotency_key: "selection-closure-idem".to_string(),
    };
    let selection_message =
        quotation_selection_message(&selection, "thread-closure-api", &comparison_message.id);
    let selected = ClosureTransition {
        event_id: "selected-event".to_string(),
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
    let selected_message = quotation_closure_transition_message(
        &selected,
        "selected-idem",
        "thread-closure-api",
        &selection_message.id,
    );
    vec![
        quotation_message,
        comparison_message,
        selection_message,
        selected_message,
    ]
}

fn evidence(source_id: &str, version: &str) -> SourceReference {
    SourceReference {
        source_id: source_id.to_string(),
        source_version_id: version.to_string(),
        media_type: "application/pdf".to_string(),
        content_hash: Some(format!("synthetic-hash-{version}")),
    }
}

fn transition(
    event_id: &str,
    expected: ClosureState,
    target: ClosureState,
    occurred_at: &str,
    source_id: &str,
) -> ClosureTransition {
    ClosureTransition {
        event_id: event_id.to_string(),
        quotation_id: "production-hire-quote".to_string(),
        quotation_version_id: "production-hire-quote-v1".to_string(),
        expected_state: Some(expected),
        target_state: target,
        actor_id: "user-synthetic".to_string(),
        user_authority: true,
        occurred_at: occurred_at.to_string(),
        evidence_sources: vec![evidence(source_id, &format!("{event_id}-source-v1"))],
        contract_changes: Vec::new(),
        contract_changes_reviewed: false,
        deposit: None,
        deadline_at: None,
    }
}

#[test]
fn evidence_backed_booking_replays_once_and_creates_one_commitment() {
    let mut messages = setup_messages();
    let received = transition(
        "contract-received",
        ClosureState::Selected,
        ClosureState::ContractReceived,
        "2027-01-11T00:00:00Z",
        &messages[0].id,
    );
    let received_message = quotation_closure_transition_message(
        &received,
        "contract-received-idem",
        "thread-closure-api",
        &messages[3].id,
    );
    let reviewed = transition(
        "contract-reviewed",
        ClosureState::ContractReceived,
        ClosureState::ContractReviewed,
        "2027-01-11T00:01:00Z",
        &messages[0].id,
    );
    let reviewed_message = quotation_closure_transition_message(
        &reviewed,
        "contract-reviewed-idem",
        "thread-closure-api",
        &received_message.id,
    );
    let booking = transition(
        "booking-confirmed",
        ClosureState::ContractReviewed,
        ClosureState::BookingConfirmed,
        "2027-01-11T00:02:00Z",
        &messages[0].id,
    );
    let booking_message = quotation_closure_transition_message(
        &booking,
        "booking-confirmed-idem",
        "thread-closure-api",
        &reviewed_message.id,
    );
    messages.extend([
        booking_message.clone(),
        received_message,
        reviewed_message,
        booking_message,
    ]);
    let replay = replay_quotation_messages(&messages);
    let snapshot = &replay.active_closures["production-hire-quote"];
    assert_eq!(snapshot.state, ClosureState::BookingConfirmed);
    let commitment = budget_commitment(
        snapshot,
        Money {
            amount_minor: 425_000,
            currency: "AUD".to_string(),
        },
    )
    .expect("booking commitment");
    assert_eq!(commitment.quotation_version_id, "production-hire-quote-v1");
    assert_eq!(replay.closure_transitions.len(), 4);
}

#[test]
fn invalid_leap_and_missing_authority_fail_before_persistence() {
    let selected =
        replay_quotation_messages(&setup_messages()).active_closures["production-hire-quote"]
            .clone();
    let mut invalid = transition(
        "invalid-booking",
        ClosureState::Selected,
        ClosureState::BookingConfirmed,
        "2027-01-11T00:00:00Z",
        "source-synthetic",
    );
    assert_eq!(
        apply_closure_transition(Some(&selected), &invalid),
        Err(ClosureError::InvalidTransition)
    );
    invalid.target_state = ClosureState::ContractReceived;
    invalid.user_authority = false;
    assert_eq!(
        apply_closure_transition(Some(&selected), &invalid),
        Err(ClosureError::EvidenceRequired)
    );
}

#[test]
fn replay_rejects_closure_evidence_that_is_not_visible_in_the_thread() {
    let mut messages = setup_messages();
    let forged = transition(
        "unavailable-contract",
        ClosureState::Selected,
        ClosureState::ContractReceived,
        "2027-01-11T00:00:00Z",
        "missing-source-message",
    );
    let parent_id = messages[3].id.clone();
    messages.push(quotation_closure_transition_message(
        &forged,
        "unavailable-contract-idem",
        "thread-closure-api",
        &parent_id,
    ));
    let replay = replay_quotation_messages(&messages);
    assert_eq!(
        replay.active_closures["production-hire-quote"].state,
        ClosureState::Selected
    );
    assert!(replay.diagnostics.iter().any(|diagnostic| {
        diagnostic.code == "closure_source_unavailable"
            && diagnostic.detail == "closure evidence does not resolve in this thread"
    }));
}

#[test]
fn deposit_record_is_evidence_not_payment_execution() {
    let mut requested = transition(
        "deposit-requested",
        ClosureState::ContractReviewed,
        ClosureState::DepositRequested,
        "2027-01-11T00:03:00Z",
        "source-synthetic",
    );
    requested.deposit = Some(DepositRecord {
        amount: Money {
            amount_minor: 100_000,
            currency: "AUD".to_string(),
        },
        due_at: Some("2027-01-20T00:00:00Z".to_string()),
        paid_at: None,
        refundable: Some(true),
        is_fee: false,
    });
    let requested_snapshot = apply_closure_transition(
        Some(&ClosureSnapshot {
            quotation_id: "production-hire-quote".to_string(),
            quotation_version_id: "production-hire-quote-v1".to_string(),
            state: ClosureState::ContractReviewed,
            last_event_id: "contract-reviewed".to_string(),
            updated_at: "2027-01-11T00:02:00Z".to_string(),
            deposit: None,
            deadline_at: None,
            evidence_sources: vec![evidence("source-synthetic", "contract-v1")],
        }),
        &requested,
    )
    .unwrap();
    let mut paid = transition(
        "deposit-recorded",
        ClosureState::DepositRequested,
        ClosureState::DepositRecordedPaid,
        "2027-01-11T00:04:00Z",
        "source-synthetic",
    );
    paid.deposit = requested.deposit.clone();
    paid.deposit.as_mut().unwrap().paid_at = Some("2027-01-11T00:04:00Z".to_string());
    apply_closure_transition(Some(&requested_snapshot), &paid).unwrap();
    let message = quotation_closure_transition_message(
        &paid,
        "deposit-recorded-idem",
        "thread-closure-api",
        "synthetic-parent",
    );
    assert_eq!(message.content["payment_execution"], false);
    assert_eq!(message.metadata.unwrap()["payment_execution"], false);
}
