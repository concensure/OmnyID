use omnyid_homeserver::quotation::*;

fn source(id: &str) -> SourceReference {
    SourceReference {
        source_id: id.to_string(),
        source_version_id: format!("{id}-v1"),
        media_type: "application/pdf".to_string(),
        content_hash: Some(format!("sha256:{id}")),
    }
}

fn event(
    id: &str,
    at: &str,
    expected: Option<ClosureState>,
    target: ClosureState,
) -> ClosureTransition {
    ClosureTransition {
        event_id: id.to_string(),
        quotation_id: "quote-1".to_string(),
        quotation_version_id: "quote-1-v2".to_string(),
        expected_state: expected,
        target_state: target,
        actor_id: "user-1".to_string(),
        user_authority: true,
        occurred_at: at.to_string(),
        evidence_sources: if target == ClosureState::Selected {
            vec![]
        } else {
            vec![source(id)]
        },
        contract_changes: vec![],
        contract_changes_reviewed: false,
        deposit: None,
        deadline_at: None,
    }
}

#[test]
fn selection_does_not_mark_a_booking_and_invalid_leaps_fail() {
    let selected = apply_closure_transition(
        None,
        &event(
            "select",
            "2026-10-17T10:00:00Z",
            None,
            ClosureState::Selected,
        ),
    )
    .unwrap();
    assert_eq!(selected.state, ClosureState::Selected);
    assert!(
        budget_commitment(
            &selected,
            Money {
                amount_minor: 1_000_000,
                currency: "AUD".to_string()
            }
        )
        .is_none()
    );
    assert_eq!(
        apply_closure_transition(
            Some(&selected),
            &event(
                "confirm",
                "2026-10-17T10:01:00Z",
                Some(ClosureState::Selected),
                ClosureState::BookingConfirmed
            ),
        ),
        Err(ClosureError::InvalidTransition)
    );
}

#[test]
fn changed_contract_terms_require_explicit_review() {
    let selected = apply_closure_transition(
        None,
        &event(
            "select",
            "2026-10-17T10:00:00Z",
            None,
            ClosureState::Selected,
        ),
    )
    .unwrap();
    let received = apply_closure_transition(
        Some(&selected),
        &event(
            "contract",
            "2026-10-17T10:01:00Z",
            Some(ClosureState::Selected),
            ClosureState::ContractReceived,
        ),
    )
    .unwrap();
    let mut review = event(
        "review",
        "2026-10-17T10:02:00Z",
        Some(ClosureState::ContractReceived),
        ClosureState::ContractReviewed,
    );
    review.contract_changes.push(MaterialChange {
        kind: MaterialChangeKind::LineChanged,
        path: "line_items.venue_hire".to_string(),
        before: Some(serde_json::json!(500_000)),
        after: Some(serde_json::json!(550_000)),
    });
    assert_eq!(
        apply_closure_transition(Some(&received), &review),
        Err(ClosureError::ContractChangesRequireReview)
    );
    review.contract_changes_reviewed = true;
    assert_eq!(
        apply_closure_transition(Some(&received), &review)
            .unwrap()
            .state,
        ClosureState::ContractReviewed
    );
}

#[test]
fn deposits_are_cash_flow_unless_explicitly_fees() {
    let deposit = DepositRecord {
        amount: Money {
            amount_minor: 200_000,
            currency: "AUD".to_string(),
        },
        due_at: Some("2026-11-01T00:00:00Z".to_string()),
        paid_at: None,
        refundable: Some(false),
        is_fee: false,
    };
    let effect = deposit_budget_effect(&deposit);
    assert_eq!(effect.cash_flow_minor, 200_000);
    assert_eq!(effect.additional_cost_minor, 0);
    let mut fee = deposit;
    fee.is_fee = true;
    assert_eq!(deposit_budget_effect(&fee).additional_cost_minor, 200_000);
}

#[test]
fn confirmed_booking_creates_one_traceable_budget_commitment() {
    let events = vec![
        event(
            "select",
            "2026-10-17T10:00:00Z",
            None,
            ClosureState::Selected,
        ),
        event(
            "contract",
            "2026-10-17T10:01:00Z",
            Some(ClosureState::Selected),
            ClosureState::ContractReceived,
        ),
        event(
            "review",
            "2026-10-17T10:02:00Z",
            Some(ClosureState::ContractReceived),
            ClosureState::ContractReviewed,
        ),
        event(
            "confirm",
            "2026-10-17T10:03:00Z",
            Some(ClosureState::ContractReviewed),
            ClosureState::BookingConfirmed,
        ),
    ];
    let snapshot = replay_closure(&events).unwrap().unwrap();
    let total = Money {
        amount_minor: 1_000_000,
        currency: "AUD".to_string(),
    };
    let first = budget_commitment(&snapshot, total.clone()).unwrap();
    let second = budget_commitment(&snapshot, total).unwrap();
    assert_eq!(first, second);
    assert_eq!(first.quotation_version_id, "quote-1-v2");
    assert!(!first.source_refs.is_empty());
}

#[test]
fn replay_is_stable_under_duplicates_and_shuffled_delivery() {
    let selected = event(
        "select",
        "2026-10-17T10:00:00Z",
        None,
        ClosureState::Selected,
    );
    let contract = event(
        "contract",
        "2026-10-17T10:01:00Z",
        Some(ClosureState::Selected),
        ClosureState::ContractReceived,
    );
    let review = event(
        "review",
        "2026-10-17T10:02:00Z",
        Some(ClosureState::ContractReceived),
        ClosureState::ContractReviewed,
    );
    let ordered = replay_closure(&[selected.clone(), contract.clone(), review.clone()]).unwrap();
    let shuffled = replay_closure(&[review, selected.clone(), contract, selected]).unwrap();
    assert_eq!(ordered, shuffled);
}

#[test]
fn cancellation_and_refund_are_evidence_backed_successors() {
    let selected = apply_closure_transition(
        None,
        &event(
            "select",
            "2026-10-17T10:00:00Z",
            None,
            ClosureState::Selected,
        ),
    )
    .unwrap();
    let cancelled = apply_closure_transition(
        Some(&selected),
        &event(
            "cancel",
            "2026-10-17T10:01:00Z",
            Some(ClosureState::Selected),
            ClosureState::Cancelled,
        ),
    )
    .unwrap();
    let refunded = apply_closure_transition(
        Some(&cancelled),
        &event(
            "refund",
            "2026-10-17T10:02:00Z",
            Some(ClosureState::Cancelled),
            ClosureState::Refunded,
        ),
    )
    .unwrap();
    assert_eq!(refunded.state, ClosureState::Refunded);
    assert_eq!(refunded.evidence_sources.len(), 2);
}
