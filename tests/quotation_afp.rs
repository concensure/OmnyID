use omnyid_homeserver::quotation::*;
use std::collections::BTreeMap;

fn quote_v1() -> NormalisedQuotation {
    serde_json::from_str(include_str!(
        "fixtures/quotation/generic_normalised_quote.json"
    ))
    .unwrap()
}

fn quote_v2() -> NormalisedQuotation {
    let mut quotation = quote_v1();
    quotation.identity.version_id = "production-hire-quote-v2".to_string();
    quotation.identity.supersedes_version_id = Some("production-hire-quote-v1".to_string());
    quotation.line_items[0]
        .unit_price
        .as_mut()
        .unwrap()
        .amount_minor = 450_000;
    quotation
}

fn scenario() -> ComparableScenario {
    ComparableScenario {
        scenario_id: "production-scenario".to_string(),
        guest_count: None,
        selected_optional_line_ids: Vec::new(),
        quantity_overrides: BTreeMap::new(),
    }
}

fn comparison(quotation: &NormalisedQuotation, id: &str) -> QuotationComparison {
    let total = calculate_comparable_total(quotation, &scenario());
    compare_quotations(
        id,
        scenario().scenario_id,
        vec![ComparisonCandidate {
            quotation_id: quotation.identity.quotation_id.clone(),
            version_id: quotation.identity.version_id.clone(),
            vendor_id: quotation.identity.vendor_id.clone(),
            total,
            requirements: Vec::new(),
        }],
    )
}

#[test]
fn projections_are_deterministic_private_source_referenced_and_body_free() {
    let quotation = quote_v1();
    let first = normalised_quotation_message(
        &quotation,
        "thread-1",
        None,
        "2026-10-17T00:00:00Z",
        "agent://quotation-normaliser",
    );
    let second = normalised_quotation_message(
        &quotation,
        "thread-1",
        None,
        "2026-10-17T00:00:00Z",
        "agent://quotation-normaliser",
    );
    assert_eq!(first.id, second.id);
    assert_eq!(first.kind.as_deref(), Some(NORMALISED_QUOTATION_KIND));
    assert_eq!(
        first.metadata.as_ref().unwrap()["privacy_scope"],
        "tenant_private"
    );
    assert_eq!(first.metadata.as_ref().unwrap()["e2ee_required"], true);
    assert_eq!(first.references, first.typed_refs);
    assert!(first.references.iter().any(|reference| {
        reference.get("target").and_then(|value| value.as_str()) == Some("source-generic-v1")
    }));
    assert!(first.attachments.is_empty());
    assert!(!first.content.to_string().contains("FULL RAW DOCUMENT BODY"));
}

#[test]
fn successor_uses_parent_and_supersedes_reference_without_mutating_prior_event() {
    let prior = normalised_quotation_message(
        &quote_v1(),
        "thread-1",
        None,
        "2026-10-17T00:00:00Z",
        "agent://quotation-normaliser",
    );
    let successor = normalised_quotation_message(
        &quote_v2(),
        "thread-1",
        Some(&prior.id),
        "2026-10-18T00:00:00Z",
        "agent://quotation-normaliser",
    );
    assert_eq!(successor.kind.as_deref(), Some(CORRECTED_QUOTATION_KIND));
    assert_eq!(successor.parent_id.as_deref(), Some(prior.id.as_str()));
    assert!(successor.references.iter().any(|reference| {
        reference.get("type").and_then(|value| value.as_str())
            == Some("supersedes_quotation_version")
            && reference.get("target").and_then(|value| value.as_str())
                == Some("production-hire-quote-v1")
    }));
    assert_eq!(prior.kind.as_deref(), Some(NORMALISED_QUOTATION_KIND));
}

#[test]
fn shuffled_duplicate_delivery_replays_to_identical_active_state() {
    let first = normalised_quotation_message(
        &quote_v1(),
        "thread-1",
        None,
        "2026-10-17T00:00:00Z",
        "agent://quotation-normaliser",
    );
    let second = normalised_quotation_message(
        &quote_v2(),
        "thread-1",
        Some(&first.id),
        "2026-10-18T00:00:00Z",
        "agent://quotation-normaliser",
    );
    let comparison = quotation_comparison_message(
        &comparison(&quote_v2(), "comparison-v2"),
        "thread-1",
        Some(&second.id),
        "2026-10-18T00:01:00Z",
        "agent://quotation-comparison",
    );
    let ordered = replay_quotation_messages(&[first.clone(), second.clone(), comparison.clone()]);
    let shuffled = replay_quotation_messages(&[
        comparison.clone(),
        second.clone(),
        first.clone(),
        second,
        first,
    ]);
    assert_eq!(ordered, shuffled);
    assert_eq!(
        ordered
            .active_version_by_quotation
            .get("production-hire-quote")
            .map(String::as_str),
        Some("production-hire-quote-v2")
    );
    assert!(ordered.active_comparisons.contains_key("comparison-v2"));
}

#[test]
fn comparison_referencing_superseded_version_is_not_active() {
    let first_quote = quote_v1();
    let first = normalised_quotation_message(
        &first_quote,
        "thread-1",
        None,
        "2026-10-17T00:00:00Z",
        "agent://quotation-normaliser",
    );
    let stale_comparison = quotation_comparison_message(
        &comparison(&first_quote, "comparison-v1"),
        "thread-1",
        Some(&first.id),
        "2026-10-17T00:01:00Z",
        "agent://quotation-comparison",
    );
    let second = normalised_quotation_message(
        &quote_v2(),
        "thread-1",
        Some(&first.id),
        "2026-10-18T00:00:00Z",
        "agent://quotation-normaliser",
    );
    let state = replay_quotation_messages(&[first, stale_comparison, second]);
    assert!(state.comparisons.contains_key("comparison-v1"));
    assert!(!state.active_comparisons.contains_key("comparison-v1"));
}
