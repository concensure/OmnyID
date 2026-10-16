use omnyid_homeserver::quotation::*;

fn passing_counts() -> QuotationEvaluationCounts {
    QuotationEvaluationCounts {
        material_fields: 100,
        anchored_confirmed_material_fields: 100,
        unsupported_confirmed_material_fields: 0,
        money_currency_cases: 100,
        money_currency_exact: 98,
        inclusion_cases: 100,
        inclusion_exact: 95,
        deterministic_cases: 100,
        deterministic_exact: 100,
        approval_send_cases: 100,
        approval_send_enforced: 100,
    }
}

#[test]
fn empty_evidence_is_untested_and_fails_closed() {
    let report = quotation_readiness_report(&QuotationEvaluationCounts::default(), false);
    assert_eq!(report.status, ReadinessStatus::Untested);
    assert!(!report.blocking_reasons.is_empty());
    let requested = QuotationFeatureFlags {
        extraction: true,
        recommendation: true,
        clarification_draft: true,
        clarification_send: true,
        closure: true,
        vendor_context_grants: true,
    };
    assert_eq!(
        requested.gated_by(&report),
        QuotationFeatureFlags::default()
    );
}

#[test]
fn fixed_threshold_boundary_verifies_and_cannot_be_lowered_at_runtime() {
    assert_eq!(MIN_MONEY_CURRENCY_EXACT_BPS, 9_800);
    assert_eq!(MIN_INCLUSION_ACCURACY_BPS, 9_500);
    assert_eq!(REQUIRED_SAFETY_BPS, 10_000);
    let report = quotation_readiness_report(&passing_counts(), false);
    assert_eq!(report.status, ReadinessStatus::Verified);

    let mut below = passing_counts();
    below.money_currency_exact = 97;
    assert_eq!(
        quotation_readiness_report(&below, false).status,
        ReadinessStatus::Failed
    );
}

#[test]
fn any_unsupported_confirmed_material_field_fails_the_gate() {
    let mut counts = passing_counts();
    counts.unsupported_confirmed_material_fields = 1;
    let report = quotation_readiness_report(&counts, false);
    assert_eq!(report.status, ReadinessStatus::Failed);
    assert!(
        report
            .blocking_reasons
            .iter()
            .any(|reason| reason.starts_with("unsupported_confirmed_material_fields"))
    );
}

#[test]
fn external_blockers_are_distinct_from_accuracy_failure() {
    let report = quotation_readiness_report(&passing_counts(), true);
    assert_eq!(report.status, ReadinessStatus::Blocked);
}

#[test]
fn metrics_accept_bounded_aggregates_and_reject_identifiers_or_urls() {
    let aggregate = QuotationMetricEvent {
        event: "quotation_extraction_completed".to_string(),
        category: "venue".to_string(),
        outcome: "review_required".to_string(),
        count: 1,
        latency_ms: Some(125),
        provider_fallback_count: Some(1),
        correction_count: Some(2),
        estimated_cost_usd_micros: Some(40),
    };
    assert!(validate_metric_event(&aggregate).is_ok());
    let mut leaking = aggregate.clone();
    leaking.outcome = "vendor@example.test".to_string();
    assert!(validate_metric_event(&leaking).is_err());
    leaking.outcome = "https://private-source.test/quote".to_string();
    assert!(validate_metric_event(&leaking).is_err());

    let raw = serde_json::json!({
        "event": "quotation_extraction_completed",
        "category": "venue",
        "outcome": "ok",
        "count": 1,
        "source_body": "secret quote"
    });
    assert!(serde_json::from_value::<QuotationMetricEvent>(raw).is_err());
}
