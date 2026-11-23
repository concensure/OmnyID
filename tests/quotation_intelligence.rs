use omnyid_homeserver::quotation::*;
use std::collections::BTreeMap;

fn anchor(excerpt: &str) -> SourceAnchor {
    SourceAnchor {
        source_id: "source-1".to_string(),
        source_version_id: "source-1-v1".to_string(),
        locator: "page=1&block=2".to_string(),
        exact_excerpt: excerpt.to_string(),
    }
}

fn evidence(excerpt: &str) -> Evidence {
    Evidence::confirmed(anchor(excerpt))
}

fn line(
    id: &str,
    basis: PriceBasis,
    amount_minor: Option<i64>,
    inclusion: InclusionState,
) -> LineItem {
    LineItem {
        line_id: id.to_string(),
        label: id.replace('_', " "),
        category: "service".to_string(),
        inclusion,
        price_basis: basis,
        effect: LineEffect::Charge,
        unit_price: amount_minor.map(|amount_minor| Money {
            amount_minor,
            currency: "AUD".to_string(),
        }),
        quantity: None,
        rate_bps: None,
        percentage_basis_line_ids: Vec::new(),
        evidence: evidence("Supported quote excerpt"),
    }
}

fn quote(id: &str, version: &str) -> NormalisedQuotation {
    NormalisedQuotation {
        schema_version: QUOTATION_SCHEMA_VERSION.to_string(),
        registry_version: "venue.v1".to_string(),
        identity: QuotationIdentity {
            quotation_id: id.to_string(),
            version_id: version.to_string(),
            supersedes_version_id: None,
            vendor_id: format!("vendor-{id}"),
            context_namespace: "wedding_planner".to_string(),
        },
        lifecycle: QuoteLifecycle::Active,
        currency: "AUD".to_string(),
        issued_at: Some("2026-10-17T00:00:00Z".to_string()),
        valid_until: Some("2026-11-17T00:00:00Z".to_string()),
        sources: vec![SourceReference {
            source_id: "source-1".to_string(),
            source_version_id: "source-1-v1".to_string(),
            media_type: "application/pdf".to_string(),
            content_hash: Some("sha256:synthetic".to_string()),
        }],
        line_items: vec![line(
            "base",
            PriceBasis::Fixed,
            Some(100_000),
            InclusionState::Included,
        )],
        commercial_terms: Vec::new(),
        unmapped_items: Vec::new(),
        tax: TaxRule {
            treatment: TaxTreatment::Exclusive,
            rate_bps: Some(1_000),
            evidence: evidence("Prices exclude 10% GST"),
        },
    }
}

fn scenario() -> ComparableScenario {
    ComparableScenario {
        scenario_id: "scenario-80-guests".to_string(),
        guest_count: Some(10),
        selected_optional_line_ids: Vec::new(),
        quantity_overrides: BTreeMap::new(),
    }
}

#[test]
fn calculates_percentage_minimum_spend_and_tax_with_integer_arithmetic() {
    let mut quotation = quote("quote-a", "quote-a-v1");
    quotation.line_items.push(line(
        "catering",
        PriceBasis::PerPerson,
        Some(10_000),
        InclusionState::Required,
    ));
    let mut service = line(
        "service_fee",
        PriceBasis::Percentage,
        None,
        InclusionState::Required,
    );
    service.rate_bps = Some(1_000);
    service.percentage_basis_line_ids = vec!["base".to_string(), "catering".to_string()];
    quotation.line_items.push(service);
    quotation.line_items.push(line(
        "minimum_spend",
        PriceBasis::MinimumSpend,
        Some(250_000),
        InclusionState::Required,
    ));

    assert!(validate_normalised_quotation(&quotation).is_empty());
    let total = calculate_comparable_total(&quotation, &scenario());
    assert_eq!(total.status, TotalStatus::Complete);
    assert_eq!(total.subtotal_minor, Some(250_000));
    assert_eq!(total.tax_minor, Some(25_000));
    assert_eq!(total.total_minor, Some(275_000));
    assert_eq!(total.evidence_coverage_bps, 10_000);
    assert_eq!(total.formula_trace.len(), 5);
    assert!(
        total
            .formula_trace
            .iter()
            .all(|entry| { entry.formula_version == "v1" && !entry.rounding.is_empty() })
    );
}

#[test]
fn unknown_inclusion_and_tax_never_become_a_false_exact_total() {
    let mut quotation = quote("quote-a", "quote-a-v1");
    let mut unknown = line("staffing", PriceBasis::Fixed, None, InclusionState::Unknown);
    unknown.evidence = Evidence::unknown("not stated in source");
    quotation.line_items.push(unknown);
    quotation.tax = TaxRule {
        treatment: TaxTreatment::Unknown,
        rate_bps: None,
        evidence: Evidence::unknown("tax inclusion not stated"),
    };

    let total = calculate_comparable_total(&quotation, &scenario());
    assert_eq!(total.status, TotalStatus::Incomplete);
    assert_eq!(total.subtotal_minor, Some(100_000));
    assert_eq!(total.total_minor, None);
    assert!(total.gaps.iter().any(|gap| gap.code == "unknown_inclusion"));
}

#[test]
fn tax_ambiguity_preserves_subtotal_but_withholds_total() {
    let mut quotation = quote("quote-a", "quote-a-v1");
    quotation.tax = TaxRule {
        treatment: TaxTreatment::Unknown,
        rate_bps: None,
        evidence: Evidence::unknown("tax inclusion not stated"),
    };
    let total = calculate_comparable_total(&quotation, &scenario());
    assert_eq!(total.status, TotalStatus::Ambiguous);
    assert_eq!(total.subtotal_minor, Some(100_000));
    assert_eq!(total.total_minor, None);
}

#[test]
fn validation_rejects_unanchored_confirmations_and_mixed_currency() {
    let mut quotation = quote("quote-a", "quote-a-v1");
    quotation.line_items[0]
        .unit_price
        .as_mut()
        .unwrap()
        .currency = "USD".to_string();
    quotation.line_items[0].evidence.anchors.clear();
    let issues = validate_normalised_quotation(&quotation);
    assert!(issues.iter().any(|issue| issue.code == "mixed_currency"));
    assert!(
        issues
            .iter()
            .any(|issue| issue.code == "evidence_anchor_required")
    );
}

fn candidate(
    quotation: &NormalisedQuotation,
    requirement_status: RequirementStatus,
) -> ComparisonCandidate {
    ComparisonCandidate {
        quotation_id: quotation.identity.quotation_id.clone(),
        version_id: quotation.identity.version_id.clone(),
        vendor_id: quotation.identity.vendor_id.clone(),
        total: calculate_comparable_total(quotation, &scenario()),
        requirements: vec![RequirementAssessment {
            requirement_id: "capacity".to_string(),
            importance: RequirementImportance::Hard,
            status: requirement_status,
            evidence: match requirement_status {
                RequirementStatus::Unknown => Evidence::unknown("capacity not stated"),
                _ => evidence("Maximum capacity 100"),
            },
        }],
    }
}

#[test]
fn comparison_excludes_confirmed_hard_conflicts_and_conditions_unknowns() {
    let first = quote("quote-a", "quote-a-v1");
    let mut second = quote("quote-b", "quote-b-v1");
    second.line_items[0]
        .unit_price
        .as_mut()
        .unwrap()
        .amount_minor = 90_000;
    let third = quote("quote-c", "quote-c-v1");
    let comparison = compare_quotations(
        "comparison-1",
        scenario().scenario_id,
        vec![
            candidate(&first, RequirementStatus::Met),
            candidate(&second, RequirementStatus::Conflict),
            candidate(&third, RequirementStatus::Unknown),
        ],
    );
    assert_eq!(
        comparison.recommended_quotation_id.as_deref(),
        Some("quote-a")
    );
    assert_eq!(
        comparison.candidates[0].disposition,
        CandidateDisposition::Eligible
    );
    assert!(comparison.candidates.iter().any(|candidate| {
        candidate.quotation_id == "quote-b"
            && candidate.disposition == CandidateDisposition::Excluded
    }));
    assert!(comparison.candidates.iter().any(|candidate| {
        candidate.quotation_id == "quote-c"
            && candidate.disposition == CandidateDisposition::Conditional
    }));
}

#[test]
fn comparison_will_not_rank_across_currencies_or_recommend_one_quote() {
    let first = quote("quote-a", "quote-a-v1");
    let mut second = quote("quote-b", "quote-b-v1");
    second.currency = "USD".to_string();
    second.line_items[0].unit_price.as_mut().unwrap().currency = "USD".to_string();
    let cross_currency = compare_quotations(
        "comparison-fx",
        scenario().scenario_id,
        vec![
            candidate(&first, RequirementStatus::Met),
            candidate(&second, RequirementStatus::Met),
        ],
    );
    assert_eq!(cross_currency.recommended_quotation_id, None);
    assert!(
        cross_currency
            .candidates
            .iter()
            .all(|candidate| { candidate.disposition == CandidateDisposition::Conditional })
    );

    let single = compare_quotations(
        "comparison-one",
        scenario().scenario_id,
        vec![candidate(&first, RequirementStatus::Met)],
    );
    assert_eq!(single.recommended_quotation_id, None);
}

#[test]
fn comparison_does_not_rank_a_cheaper_estimate_above_a_complete_total() {
    let complete = quote("complete", "complete-v1");
    let mut estimate = quote("estimate", "estimate-v1");
    estimate.line_items[0].unit_price.as_mut().unwrap().amount_minor = 1;
    estimate.line_items[0].evidence.state = EvidenceState::Inferred;
    let comparison = compare_quotations(
        "comparison-estimate",
        scenario().scenario_id,
        vec![
            candidate(&estimate, RequirementStatus::Unknown),
            candidate(&complete, RequirementStatus::Unknown),
        ],
    );
    assert_eq!(comparison.candidates[0].quotation_id, "complete");
    assert_eq!(comparison.candidates[0].total.status, TotalStatus::Complete);
    assert_eq!(comparison.candidates[1].total.status, TotalStatus::Ambiguous);
}

#[test]
fn optional_items_are_scenario_bound_and_cash_flow_terms_are_not_cost() {
    let mut quotation = quote("quote-options", "quote-options-v1");
    quotation.line_items.push(line(
        "optional_coach",
        PriceBasis::Fixed,
        Some(25_000),
        InclusionState::Optional,
    ));
    quotation.commercial_terms.push(CommercialTerm {
        term_id: "deposit".to_string(),
        kind: "deposit".to_string(),
        label: "Booking deposit".to_string(),
        amount: Some(Money {
            amount_minor: 50_000,
            currency: "AUD".to_string(),
        }),
        due_at: None,
        refundable: Some(false),
        evidence: evidence("Booking deposit AUD 500"),
    });
    let without_option = calculate_comparable_total(&quotation, &scenario());
    assert_eq!(without_option.subtotal_minor, Some(100_000));
    assert_eq!(without_option.total_minor, Some(110_000));

    let mut selected = scenario();
    selected
        .selected_optional_line_ids
        .push("optional_coach".to_string());
    let with_option = calculate_comparable_total(&quotation, &selected);
    assert_eq!(with_option.subtotal_minor, Some(125_000));
    assert_eq!(with_option.total_minor, Some(137_500));
}

#[test]
fn source_backed_percentage_discount_reduces_only_its_explicit_basis() {
    let mut quotation = quote("quote-discount", "quote-discount-v1");
    let mut discount = line(
        "weekday_discount",
        PriceBasis::Percentage,
        None,
        InclusionState::Included,
    );
    discount.effect = LineEffect::Discount;
    discount.rate_bps = Some(1_000);
    discount.percentage_basis_line_ids = vec!["base".to_string()];
    discount.evidence = evidence("10% weekday discount on room hire");
    quotation.line_items.push(discount);
    let total = calculate_comparable_total(&quotation, &scenario());
    assert_eq!(total.status, TotalStatus::Complete);
    assert_eq!(total.subtotal_minor, Some(90_000));
    assert_eq!(total.tax_minor, Some(9_000));
    assert_eq!(total.total_minor, Some(99_000));
    assert!(
        total
            .formula_trace
            .iter()
            .any(|entry| entry.line_id == "weekday_discount" && entry.amount_minor == -10_000)
    );
}

#[test]
fn arithmetic_overflow_and_unknown_selected_options_fail_closed() {
    let mut quotation = quote("quote-overflow", "quote-overflow-v1");
    quotation.line_items[0].price_basis = PriceBasis::PerPerson;
    quotation.line_items[0]
        .unit_price
        .as_mut()
        .unwrap()
        .amount_minor = i64::MAX;
    let mut input = scenario();
    input.guest_count = Some(u32::MAX);
    input
        .selected_optional_line_ids
        .push("not-in-this-version".to_string());
    let total = calculate_comparable_total(&quotation, &input);
    assert_eq!(total.status, TotalStatus::Incomplete);
    assert_eq!(total.total_minor, None);
    assert!(
        total
            .gaps
            .iter()
            .any(|gap| gap.code == "quantity_or_arithmetic_missing")
    );
    assert!(
        total
            .gaps
            .iter()
            .any(|gap| gap.code == "unknown_selected_option")
    );
}

#[test]
fn canonicalisation_maps_aliases_merges_exact_duplicates_and_flags_conflicts() {
    let registry = resolve_category_registry("venue.v1").unwrap();
    let mut quotation = quote("quote-canonical", "quote-canonical-v1");
    quotation.line_items[0].category = "hire fee".to_string();
    quotation.line_items[0].label = "Room Hire".to_string();
    let mut duplicate = quotation.line_items[0].clone();
    duplicate.line_id = "base-copy".to_string();
    duplicate.evidence = evidence("Room hire AUD 1,000 repeated");
    quotation.line_items.push(duplicate);
    let mut conflict = quotation.line_items[0].clone();
    conflict.line_id = "base-conflict".to_string();
    conflict.unit_price.as_mut().unwrap().amount_minor = 120_000;
    conflict.evidence = evidence("Room hire AUD 1,200");
    quotation.line_items.push(conflict);

    let result = canonicalise_quotation(&quotation, &registry);
    assert_eq!(result.quotation.line_items.len(), 1);
    assert_eq!(result.quotation.line_items[0].category, "fixed_fee");
    assert_eq!(
        result.quotation.line_items[0].evidence.state,
        EvidenceState::Conflicting
    );
    assert!(
        result
            .issues
            .iter()
            .any(|issue| issue.code == "exact_duplicate_merged")
    );
    assert!(
        result
            .issues
            .iter()
            .any(|issue| issue.code == "incompatible_duplicate")
    );
}

#[test]
fn material_change_detection_is_stable_and_version_aware() {
    let previous = quote("quote-revision", "quote-revision-v1");
    let mut current = previous.clone();
    current.identity.version_id = "quote-revision-v2".to_string();
    current.identity.supersedes_version_id = Some("quote-revision-v1".to_string());
    current.line_items[0]
        .unit_price
        .as_mut()
        .unwrap()
        .amount_minor = 125_000;
    current.valid_until = Some("2026-12-17T00:00:00Z".to_string());
    let first = detect_material_changes(&previous, &current);
    let second = detect_material_changes(&previous, &current);
    assert_eq!(first, second);
    assert!(
        first
            .iter()
            .any(|change| change.kind == MaterialChangeKind::LineChanged)
    );
    assert!(
        first
            .iter()
            .any(|change| change.kind == MaterialChangeKind::Validity)
    );
}

#[test]
fn clarification_candidates_are_impact_ordered_and_capped_at_three() {
    let mut quotation = quote("quote-gaps", "quote-gaps-v1");
    quotation.tax = TaxRule {
        treatment: TaxTreatment::Unknown,
        rate_bps: None,
        evidence: Evidence::unknown("tax not stated"),
    };
    for id in ["staffing", "security", "cleaning", "transport"] {
        let mut unknown = line(id, PriceBasis::Fixed, None, InclusionState::Unknown);
        unknown.evidence = Evidence::unknown("not stated");
        quotation.line_items.push(unknown);
    }
    let total = calculate_comparable_total(&quotation, &scenario());
    let questions = top_clarification_candidates(&total);
    assert_eq!(questions.len(), 3);
    assert!(
        questions
            .windows(2)
            .all(|pair| { pair[0].impact_rank <= pair[1].impact_rank })
    );
}

#[test]
fn equal_evidence_equal_cost_tie_has_no_winner() {
    let first = quote("quote-a", "quote-a-v1");
    let second = quote("quote-b", "quote-b-v1");
    let comparison = compare_quotations(
        "comparison-tie",
        scenario().scenario_id,
        vec![
            candidate(&first, RequirementStatus::Met),
            candidate(&second, RequirementStatus::Met),
        ],
    );
    assert_eq!(comparison.recommended_quotation_id, None);
}
