use super::*;

fn advice(over_budget: bool) -> CostTradeoffAdvice {
    CostTradeoffAdvice {
        tradeoff: CostTradeoff {
            schema_version: COST_TRADEOFF_SCHEMA_VERSION.to_string(),
            tradeoff_id: "cost_tradeoff:test".to_string(),
            candidate_decision_ref: "decision:test".to_string(),
            incremental_cost: KnownMoney::Exact {
                amount: Money {
                    amount_minor: 20_000,
                    currency: "AUD".to_string(),
                },
                evidence_ref: "quotation:test:v2".to_string(),
            },
            forecast_before: Some(MoneyRange {
                minimum_minor: 90_000,
                maximum_minor: 90_000,
                currency: "AUD".to_string(),
                evidence_refs: vec!["budget:test:v1".to_string()],
            }),
            forecast_after: Some(MoneyRange {
                minimum_minor: 110_000,
                maximum_minor: 110_000,
                currency: "AUD".to_string(),
                evidence_refs: vec![
                    "budget:test:v1".to_string(),
                    "quotation:test:v2".to_string(),
                ],
            }),
            offset_options: Vec::new(),
            priority_impact: PriorityImpact::Unknown,
            unknown_cost_drivers: Vec::new(),
            assumptions: vec![CostAssumptionCode::CurrentQuote],
        },
        bindings: CostAdviceBindings {
            candidate_revision_ref: "quotation:test:v2".to_string(),
            budget_revision_ref: "budget:test:v1".to_string(),
            constraint_revision_refs: vec!["constraint:priority:v1".to_string()],
            source_revision_refs: vec![
                "budget:test:v1".to_string(),
                "quotation:test:v2".to_string(),
            ],
        },
        uncontracted_category_refs: Vec::new(),
        unresolved_fee_driver_refs: Vec::new(),
        exceeds_budget: over_budget,
        requires_acknowledgement: over_budget,
    }
}

fn current<'a>(constraints: &'a [String], sources: &'a [String]) -> CurrentCostAdviceRevisions<'a> {
    CurrentCostAdviceRevisions {
        candidate_revision_ref: "quotation:test:v2",
        budget_revision_ref: "budget:test:v1",
        constraint_revision_refs: constraints,
        source_revision_refs: sources,
    }
}

#[test]
fn over_budget_advice_requires_an_exact_current_acknowledgement() {
    let constraints = vec!["constraint:priority:v1".to_string()];
    let sources = vec![
        "quotation:test:v2".to_string(),
        "budget:test:v1".to_string(),
    ];
    let current_revisions = current(&constraints, &sources);
    let advice = advice(true);
    assert!(!cost_advice_allows_advance(
        &advice,
        &current_revisions,
        None
    ));

    let acknowledgement = build_cost_acknowledgement(
        "thread:test",
        &advice,
        &current_revisions,
        "intent:test",
        "2026-10-19T10:00:00Z",
    )
    .unwrap();
    assert!(cost_advice_allows_advance(
        &advice,
        &current_revisions,
        Some(&acknowledgement)
    ));

    let stale_sources = vec!["quotation:test:v3".to_string()];
    assert!(!cost_advice_allows_advance(
        &advice,
        &current(&constraints, &stale_sources),
        Some(&acknowledgement)
    ));
}

#[test]
fn in_budget_advice_advances_without_fabricating_an_acknowledgement() {
    let constraints = vec!["constraint:priority:v1".to_string()];
    let sources = vec![
        "budget:test:v1".to_string(),
        "quotation:test:v2".to_string(),
    ];
    let advice = advice(false);
    assert!(cost_advice_allows_advance(
        &advice,
        &current(&constraints, &sources),
        None
    ));
    assert!(
        build_cost_acknowledgement(
            "thread:test",
            &advice,
            &current(&constraints, &sources),
            "intent:test",
            "2026-10-19T10:00:00Z",
        )
        .is_err()
    );
}

#[test]
fn acknowledgement_messages_are_private_content_bound_and_retry_deterministic() {
    let constraints = vec!["constraint:priority:v1".to_string()];
    let sources = vec![
        "budget:test:v1".to_string(),
        "quotation:test:v2".to_string(),
    ];
    let advice = advice(true);
    let first = build_cost_acknowledgement(
        "thread:test",
        &advice,
        &current(&constraints, &sources),
        "intent:test",
        "2026-10-19T10:00:00Z",
    )
    .unwrap();
    let retry = build_cost_acknowledgement(
        "thread:test",
        &advice,
        &current(&constraints, &sources),
        "intent:test",
        "2026-10-19T10:00:01Z",
    )
    .unwrap();
    assert_eq!(first.acknowledgement_id, retry.acknowledgement_id);

    let message = cost_acknowledgement_message("thread:test", "user://test", &first).unwrap();
    assert_eq!(
        message
            .metadata
            .as_ref()
            .and_then(|value| value["privacy_scope"].as_str()),
        Some("tenant_private")
    );
    assert_eq!(
        cost_acknowledgement_from_message(&message).unwrap(),
        Some(first.clone())
    );

    let mut tampered = message;
    tampered.content["acknowledgement"]["tradeoff_ref"] = serde_json::json!("cost_tradeoff:other");
    assert!(cost_acknowledgement_from_message(&tampered).is_err());
}
