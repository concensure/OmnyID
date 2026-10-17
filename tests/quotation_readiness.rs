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
        vendor_response_capabilities: true,
        claimed_vendor_responses: true,
        email_response_reconciliation: true,
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
        event: QuotationMetricName::ExtractionMaterialAccuracy,
        category: QuotationMetricCategory::Venue,
        outcome: QuotationMetricOutcome::ManualReview,
        count: 1,
        latency_ms: None,
        provider_fallback_count: Some(1),
        correction_count: Some(2),
        estimated_cost_usd_micros: Some(40),
    };
    assert!(validate_metric_event(&aggregate).is_ok());
    let raw = serde_json::json!({
        "event": "extraction_material_accuracy",
        "category": "venue",
        "outcome": "exact",
        "count": 1,
        "source_body": "secret quote"
    });
    assert!(serde_json::from_value::<QuotationMetricEvent>(raw).is_err());

    for (field, private_value) in [
        ("event", "quotation-01KGPRIVATE"),
        ("category", "vendor@example.test"),
        ("outcome", "https://private-source.test/quote"),
    ] {
        let mut raw = serde_json::json!({
            "event": "response_channel",
            "category": "venue",
            "outcome": "email",
            "count": 1,
        });
        raw[field] = serde_json::json!(private_value);
        assert!(serde_json::from_value::<QuotationMetricEvent>(raw).is_err());
    }
}

#[test]
fn four_investment_metrics_are_expressible_without_content_or_identifiers() {
    let events = [
        QuotationMetricEvent {
            event: QuotationMetricName::FirstCompleteQuoteToDecision,
            category: QuotationMetricCategory::All,
            outcome: QuotationMetricOutcome::Preferred,
            count: 8,
            latency_ms: Some(86_400_000),
            provider_fallback_count: None,
            correction_count: None,
            estimated_cost_usd_micros: None,
        },
        QuotationMetricEvent {
            event: QuotationMetricName::ClarificationExchangesPerBooking,
            category: QuotationMetricCategory::All,
            outcome: QuotationMetricOutcome::VerifiedBooking,
            count: 3,
            latency_ms: None,
            provider_fallback_count: None,
            correction_count: None,
            estimated_cost_usd_micros: None,
        },
        QuotationMetricEvent {
            event: QuotationMetricName::QualifiedEnquiryOutcome,
            category: QuotationMetricCategory::All,
            outcome: QuotationMetricOutcome::VerifiedBooking,
            count: 12,
            latency_ms: None,
            provider_fallback_count: None,
            correction_count: None,
            estimated_cost_usd_micros: None,
        },
        QuotationMetricEvent {
            event: QuotationMetricName::VendorActiveResponseTime,
            category: QuotationMetricCategory::All,
            outcome: QuotationMetricOutcome::Submitted,
            count: 9,
            latency_ms: Some(420_000),
            provider_fallback_count: None,
            correction_count: None,
            estimated_cost_usd_micros: None,
        },
    ];
    assert!(
        events
            .iter()
            .all(|event| validate_metric_event(event).is_ok())
    );
    let encoded = serde_json::to_string(&events).unwrap();
    for prohibited in [
        "thread_id",
        "quotation_id",
        "vendor_id",
        "amount_minor",
        "email",
    ] {
        assert!(!encoded.contains(prohibited));
    }
}

#[test]
fn latency_metrics_require_bounded_elapsed_time_and_counts_are_nonzero() {
    let mut event = QuotationMetricEvent {
        event: QuotationMetricName::FirstCompleteQuoteToBooking,
        category: QuotationMetricCategory::Other,
        outcome: QuotationMetricOutcome::VerifiedBooking,
        count: 1,
        latency_ms: None,
        provider_fallback_count: None,
        correction_count: None,
        estimated_cost_usd_micros: None,
    };
    assert!(validate_metric_event(&event).is_err());
    event.latency_ms = Some(366 * 24 * 60 * 60 * 1_000 + 1);
    assert!(validate_metric_event(&event).is_err());
    event.latency_ms = Some(1_000);
    event.count = 0;
    assert!(validate_metric_event(&event).is_err());
}
