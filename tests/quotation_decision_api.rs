use std::collections::BTreeMap;

use omnyid_homeserver::quotation::*;

fn quote() -> NormalisedQuotation {
    serde_json::from_str(include_str!(
        "fixtures/quotation/generic_normalised_quote.json"
    ))
    .unwrap()
}

fn comparison(quotation: &NormalisedQuotation) -> QuotationComparison {
    let scenario = ComparableScenario {
        scenario_id: "decision-scenario".to_string(),
        guest_count: None,
        selected_optional_line_ids: Vec::new(),
        quantity_overrides: BTreeMap::new(),
    };
    compare_quotations(
        "decision-comparison".to_string(),
        scenario.scenario_id.clone(),
        vec![ComparisonCandidate {
            quotation_id: quotation.identity.quotation_id.clone(),
            version_id: quotation.identity.version_id.clone(),
            vendor_id: quotation.identity.vendor_id.clone(),
            total: calculate_comparable_total(quotation, &scenario),
            requirements: Vec::new(),
        }],
    )
}

fn selected_messages() -> Vec<omnyid_homeserver::message::AFPMessage> {
    let quotation = quote();
    let quotation_message = normalised_quotation_message(
        &quotation,
        "thread-decision",
        None,
        "2027-01-10T00:00:00Z",
        "user-synthetic",
    );
    let comparison_message = quotation_comparison_message(
        &comparison(&quotation),
        "thread-decision",
        Some(&quotation_message.id),
        "2027-01-10T00:01:00Z",
        "user-synthetic",
    );
    let selection = QuotationSelection {
        selection_id: "selection-synthetic-1".to_string(),
        comparison_id: "decision-comparison".to_string(),
        comparison_revision: comparison_message.id.clone(),
        quotation_id: quotation.identity.quotation_id.clone(),
        quotation_version_id: quotation.identity.version_id.clone(),
        vendor_id: quotation.identity.vendor_id.clone(),
        supersedes_selection_id: None,
        actor_id: "user-synthetic".to_string(),
        user_authority: true,
        occurred_at: "2027-01-10T00:02:00Z".to_string(),
        idempotency_key: "decision-idempotency-1".to_string(),
    };
    let selection_message =
        quotation_selection_message(&selection, "thread-decision", &comparison_message.id);
    let transition = ClosureTransition {
        event_id: "selection_closure:selection-synthetic-1".to_string(),
        quotation_id: quotation.identity.quotation_id.clone(),
        quotation_version_id: quotation.identity.version_id.clone(),
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
        "decision-idempotency-1:closure",
        "thread-decision",
        &selection_message.id,
    );
    vec![
        quotation_message,
        comparison_message,
        selection_message,
        closure_message,
    ]
}

#[test]
fn selection_and_initial_closure_replay_once_under_shuffle_and_duplicates() {
    let messages = selected_messages();
    let ordered = replay_quotation_messages(&messages);
    let shuffled = replay_quotation_messages(&[
        messages[3].clone(),
        messages[2].clone(),
        messages[0].clone(),
        messages[1].clone(),
        messages[2].clone(),
    ]);
    assert_eq!(ordered, shuffled);
    assert_eq!(ordered.active_selections.len(), 1);
    assert_eq!(
        ordered.active_closures["production-hire-quote"].state,
        ClosureState::Selected
    );
    assert_eq!(messages[2].references, messages[2].typed_refs);
    assert_eq!(messages[2].content["payment_execution"], false);
    assert_eq!(messages[3].content["payment_execution"], false);
}

#[test]
fn quotation_successor_makes_the_old_selection_and_closure_inactive() {
    let mut messages = selected_messages();
    let mut successor = quote();
    successor.identity.version_id = "production-hire-quote-v2".to_string();
    successor.identity.supersedes_version_id = Some("production-hire-quote-v1".to_string());
    messages.push(normalised_quotation_message(
        &successor,
        "thread-decision",
        Some(&messages[0].id),
        "2027-01-11T00:00:00Z",
        "user-synthetic",
    ));
    let replay = replay_quotation_messages(&messages);
    assert!(replay.active_selections.is_empty());
    assert!(replay.active_closures.is_empty());
    assert!(replay.selections.contains_key("selection-synthetic-1"));
    assert!(
        replay
            .closure_snapshots
            .contains_key("production-hire-quote-v1")
    );
}

#[test]
fn selection_requires_explicit_user_authority_and_stable_idempotency() {
    let messages = selected_messages();
    let mut selection: QuotationSelection =
        serde_json::from_value(messages[2].content["selection"].clone()).unwrap();
    let first = quotation_selection_message(&selection, "thread-decision", &messages[1].id);
    let second = quotation_selection_message(&selection, "thread-decision", &messages[1].id);
    assert_eq!(first.id, second.id);
    selection.user_authority = false;
    assert_eq!(
        validate_selection(&selection),
        Err(SelectionError::InvalidSelection)
    );
}
