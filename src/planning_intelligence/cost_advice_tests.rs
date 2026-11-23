use super::*;

fn money_range(minimum_minor: i64, maximum_minor: i64, evidence: &str) -> MoneyRange {
    MoneyRange {
        minimum_minor,
        maximum_minor,
        currency: "AUD".to_string(),
        evidence_refs: vec![evidence.to_string()],
    }
}

fn category(
    category_ref: &str,
    state: CategoryCostState,
    source_revision_ref: &str,
    saving: Option<(i64, i64)>,
) -> CategoryCostEvidence {
    CategoryCostEvidence {
        category_ref: category_ref.to_string(),
        state,
        source_revision_ref: source_revision_ref.to_string(),
        offset_kind: saving.map(|_| OffsetEvidenceKind::CurrentRange),
        saving_range: saving.map(|(minimum, maximum)| {
            money_range(minimum, maximum, &format!("evidence:{category_ref}"))
        }),
    }
}

fn priority(id: &str, values: &[&str]) -> PlanningConstraint {
    PlanningConstraint {
        schema_version: CONSTRAINT_SCHEMA_VERSION.to_string(),
        constraint_id: id.to_string(),
        template_id: "wedding_planning".to_string(),
        plan_id: "plan:test".to_string(),
        subject_ref: SubjectReference {
            kind: SubjectKind::Plan,
            id: "plan:test".to_string(),
        },
        kind: ConstraintKind::CategoryPriority,
        operator: ConstraintOperator::Prefers,
        value: ConstraintValue::EnumList {
            values: values.iter().map(|value| (*value).to_string()).collect(),
            vocabulary: "planning.category_priority.v1".to_string(),
        },
        strength: ConstraintStrength::Strong,
        authority: ConstraintAuthority::User,
        privacy: ConstraintPrivacy::PlanPrivate,
        source_ref: "message:priority".to_string(),
        source_anchor: SourceAnchor {
            message_id: "message:priority".to_string(),
            source_version_id: Some("message:priority:v1".to_string()),
            locator: "content.remark".to_string(),
            exact_excerpt: "Photography matters more than flowers".to_string(),
        },
        observed_at: "2026-10-19T01:00:00Z".to_string(),
        effective_window: None,
        status: ConstraintStatus::Confirmed,
        supersedes: None,
    }
}

fn input() -> CostAdviceInput {
    CostAdviceInput {
        candidate_decision_ref: "decision:photography-upgrade".to_string(),
        candidate_revision_ref: "quotation:photographer:v3".to_string(),
        candidate_category_ref: "photography".to_string(),
        budget_revision_ref: "budget:v7".to_string(),
        currency: "AUD".to_string(),
        budget_target: money_range(4_000_000, 4_000_000, "budget:v7"),
        forecast_before: money_range(3_900_000, 3_950_000, "forecast:v7"),
        candidate_cost: CandidateCostEstimate::Exact {
            amount_minor: 200_000,
            currency: "AUD".to_string(),
            evidence_ref: "quotation:photographer:v3:upgrade".to_string(),
        },
        categories: vec![
            category(
                "venue",
                CategoryCostState::Allowance,
                "budget:venue:v2",
                Some((300_000, 500_000)),
            ),
            category(
                "flowers",
                CategoryCostState::Quoted,
                "quotation:flowers:v4",
                Some((50_000, 100_000)),
            ),
            category(
                "transport",
                CategoryCostState::Uncontracted,
                "budget:transport:v1",
                None,
            ),
        ],
        unresolved_fee_drivers: vec![UnresolvedCostDriver {
            driver_ref: "fee:photography:overtime_quantity".to_string(),
            source_revision_ref: "quotation:photographer:v3".to_string(),
        }],
        current_source_revision_refs: vec![
            "quotation:flowers:v4".to_string(),
            "budget:venue:v2".to_string(),
            "budget:transport:v1".to_string(),
            "quotation:photographer:v3".to_string(),
        ],
    }
}

#[test]
fn exact_upgrade_projects_evidenced_forecast_and_requires_over_budget_acknowledgement() {
    let advice = build_cost_tradeoff_advice(
        &input(),
        &[priority(
            "constraint:priority:v1",
            &["photography", "venue", "flowers"],
        )],
    )
    .expect("cost advice");

    assert_eq!(
        advice.tradeoff.incremental_cost,
        KnownMoney::Exact {
            amount: Money {
                amount_minor: 200_000,
                currency: "AUD".to_string(),
            },
            evidence_ref: "quotation:photographer:v3:upgrade".to_string(),
        }
    );
    assert_eq!(
        advice
            .tradeoff
            .forecast_after
            .as_ref()
            .map(|value| (value.minimum_minor, value.maximum_minor)),
        Some((4_100_000, 4_150_000))
    );
    assert!(advice.exceeds_budget);
    assert!(advice.requires_acknowledgement);
    assert_eq!(advice.uncontracted_category_refs, ["transport"]);
    assert_eq!(
        advice.unresolved_fee_driver_refs,
        ["fee:photography:overtime_quantity"]
    );
    assert!(
        advice
            .tradeoff
            .unknown_cost_drivers
            .contains(&"transport".to_string())
    );
}

#[test]
fn offsets_preserve_priority_instead_of_maximising_raw_savings() {
    let mut value = input();
    value.categories.push(category(
        "stationery",
        CategoryCostState::Allowance,
        "budget:stationery:v1",
        Some((10_000, 20_000)),
    ));
    value
        .current_source_revision_refs
        .push("budget:stationery:v1".to_string());
    let advice = build_cost_tradeoff_advice(
        &value,
        &[priority(
            "constraint:priority:v1",
            &["photography", "venue", "flowers"],
        )],
    )
    .unwrap();
    let categories = advice
        .tradeoff
        .offset_options
        .iter()
        .map(|option| option.category_ref.as_str())
        .collect::<Vec<_>>();

    assert_eq!(categories, ["stationery", "flowers", "venue"]);
    assert_eq!(advice.tradeoff.priority_impact, PriorityImpact::Preserved);
    assert!(
        advice.tradeoff.offset_options[0]
            .evidence_refs
            .contains(&"budget:stationery:v1".to_string())
    );
}

#[test]
fn uncertain_candidate_uses_a_range_and_never_claims_an_exact_increment() {
    let mut value = input();
    value.candidate_cost = CandidateCostEstimate::Range {
        minimum_minor: 100_000,
        maximum_minor: 250_000,
        currency: "AUD".to_string(),
        evidence_refs: vec!["quotation:photographer:v3:range".to_string()],
    };
    let advice = build_cost_tradeoff_advice(&value, &[]).unwrap();

    assert_eq!(advice.tradeoff.incremental_cost, KnownMoney::Unknown);
    assert_eq!(
        advice
            .tradeoff
            .forecast_after
            .as_ref()
            .map(|value| (value.minimum_minor, value.maximum_minor)),
        Some((4_000_000, 4_200_000))
    );
    assert!(
        advice
            .tradeoff
            .assumptions
            .contains(&CostAssumptionCode::ConservativeRange)
    );
}

#[test]
fn unknown_candidate_stays_unknown_without_a_zero_forecast_or_quote_claim() {
    let mut value = input();
    value.candidate_cost = CandidateCostEstimate::Unknown {
        driver_refs: vec!["fee:photography:album_selection".to_string()],
    };
    let advice = build_cost_tradeoff_advice(&value, &[]).unwrap();

    assert_eq!(advice.tradeoff.incremental_cost, KnownMoney::Unknown);
    assert!(advice.tradeoff.forecast_after.is_none());
    assert!(
        advice
            .tradeoff
            .unknown_cost_drivers
            .contains(&"fee:photography:album_selection".to_string())
    );
    assert!(
        !advice
            .tradeoff
            .assumptions
            .contains(&CostAssumptionCode::CurrentQuote)
    );
}

#[test]
fn stale_sources_are_not_presented_as_offsets_or_unknown_drivers() {
    let mut value = input();
    value.current_source_revision_refs = vec!["quotation:photographer:v3".to_string()];
    let advice = build_cost_tradeoff_advice(&value, &[]).unwrap();

    assert!(advice.tradeoff.offset_options.is_empty());
    assert!(advice.uncontracted_category_refs.is_empty());
    assert_eq!(
        advice.unresolved_fee_driver_refs,
        ["fee:photography:overtime_quantity"]
    );
}

#[test]
fn currency_mismatch_empty_evidence_and_arithmetic_overflow_fail_closed() {
    let mut mismatch = input();
    mismatch.currency = "USD".to_string();
    assert!(build_cost_tradeoff_advice(&mismatch, &[]).is_err());

    let mut missing = input();
    missing.budget_target.evidence_refs.clear();
    assert!(build_cost_tradeoff_advice(&missing, &[]).is_err());

    let mut overflow = input();
    overflow.forecast_before.maximum_minor = i64::MAX;
    overflow.forecast_before.minimum_minor = i64::MAX;
    assert!(build_cost_tradeoff_advice(&overflow, &[]).is_err());
}

#[test]
fn identity_is_order_independent_and_all_bound_successors_make_advice_stale() {
    let value = input();
    let constraint = priority(
        "constraint:priority:v1",
        &["photography", "venue", "flowers"],
    );
    let first = build_cost_tradeoff_advice(&value, std::slice::from_ref(&constraint)).unwrap();
    let mut shuffled = value.clone();
    shuffled.categories.reverse();
    shuffled.current_source_revision_refs.reverse();
    let second = build_cost_tradeoff_advice(&shuffled, &[constraint]).unwrap();
    assert_eq!(first, second);

    let current = CurrentCostAdviceRevisions {
        candidate_revision_ref: "quotation:photographer:v3",
        budget_revision_ref: "budget:v7",
        constraint_revision_refs: &["constraint:priority:v1".to_string()],
        source_revision_refs: &value.current_source_revision_refs,
    };
    assert!(cost_tradeoff_advice_is_current(&first, &current));
    assert!(!cost_tradeoff_advice_is_current(
        &first,
        &CurrentCostAdviceRevisions {
            candidate_revision_ref: "quotation:photographer:v4",
            ..current.clone()
        }
    ));
    assert!(!cost_tradeoff_advice_is_current(
        &first,
        &CurrentCostAdviceRevisions {
            budget_revision_ref: "budget:v8",
            ..current.clone()
        }
    ));
    assert!(!cost_tradeoff_advice_is_current(
        &first,
        &CurrentCostAdviceRevisions {
            constraint_revision_refs: &["constraint:priority:v2".to_string()],
            ..current.clone()
        }
    ));
    assert!(!cost_tradeoff_advice_is_current(
        &first,
        &CurrentCostAdviceRevisions {
            source_revision_refs: &["quotation:photographer:v4".to_string()],
            ..current
        }
    ));
}

#[test]
fn conflicting_or_repeated_priority_constraints_fail_closed() {
    let first = priority("constraint:priority:a", &["photography", "flowers"]);
    let conflicting = priority("constraint:priority:b", &["flowers", "photography"]);
    assert!(build_cost_tradeoff_advice(&input(), &[first, conflicting]).is_err());

    let repeated = priority("constraint:priority:c", &["photography", "photography"]);
    assert!(build_cost_tradeoff_advice(&input(), &[repeated]).is_err());
}
