use chrono::{DateTime, Utc};
use omnyid_homeserver::{
    message::AFPMessage, wedding_vendor_quote_orchestration::project_quote_event,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeSet;

#[derive(Deserialize)]
struct FixtureCorpus {
    fixture_version: String,
    cases: Vec<FixtureCase>,
}

#[derive(Deserialize)]
struct FixtureCase {
    case_id: String,
    category_registry: String,
    source_kind: String,
    features: Vec<String>,
    versions: Vec<FixtureVersion>,
}

#[derive(Deserialize)]
struct FixtureVersion {
    version_id: String,
    excerpt: String,
    expected_change: String,
    gold: Vec<GoldFact>,
}

#[derive(Deserialize)]
struct GoldFact {
    key: String,
    value: Option<String>,
    evidence_state: String,
    exact_excerpt: String,
}

fn corpus() -> FixtureCorpus {
    serde_json::from_str(include_str!(
        "fixtures/quotation/synthetic_quote_versions.json"
    ))
    .expect("valid synthetic quotation corpus")
}

#[test]
fn corpus_has_required_size_sources_venue_coverage_and_risks() {
    let corpus = corpus();
    assert_eq!(corpus.fixture_version, "quotation.synthetic.v1");
    assert_eq!(corpus.cases.len(), 12);
    assert_eq!(
        corpus
            .cases
            .iter()
            .map(|case| case.versions.len())
            .sum::<usize>(),
        24
    );
    assert_eq!(
        corpus
            .cases
            .iter()
            .filter(|case| case.category_registry == "venue.v1")
            .count(),
        8
    );
    let sources = corpus
        .cases
        .iter()
        .map(|case| case.source_kind.as_str())
        .collect::<BTreeSet<_>>();
    for source in [
        "text_pdf",
        "scanned_pdf_ocr",
        "image_ocr",
        "email_body",
        "docx",
        "missing_parser",
    ] {
        assert!(sources.contains(source), "missing source fixture {source}");
    }
    let features = corpus
        .cases
        .iter()
        .flat_map(|case| case.features.iter().map(String::as_str))
        .collect::<BTreeSet<_>>();
    for feature in [
        "fixed_hire",
        "per_person",
        "minimum_spend",
        "included_tax",
        "exclusive_tax",
        "service_charge",
        "optional_extras",
        "refundable_bond",
        "discount_eligibility",
        "unknown_price",
        "conflicting_totals",
        "supersession",
        "prompt_injection_source",
    ] {
        assert!(features.contains(feature), "missing risk fixture {feature}");
    }
}

#[test]
fn every_gold_fact_has_an_exact_source_excerpt_and_explicit_state() {
    for case in corpus().cases {
        assert!(!case.case_id.trim().is_empty());
        for version in case.versions {
            assert!(!version.version_id.trim().is_empty());
            assert!(!version.expected_change.trim().is_empty());
            assert!(!version.gold.is_empty());
            for fact in version.gold {
                assert!(!fact.key.trim().is_empty());
                assert!(!fact.exact_excerpt.trim().is_empty());
                assert!(version.excerpt.contains(&fact.exact_excerpt));
                assert!(matches!(
                    fact.evidence_state.as_str(),
                    "confirmed" | "unknown" | "conflicting"
                ));
                if fact.evidence_state == "confirmed" {
                    assert!(fact.value.as_deref().is_some_and(|value| !value.is_empty()));
                }
            }
        }
    }
}

fn source_quote(id: &str, supersedes: Option<&str>) -> AFPMessage {
    let mut metadata = json!({"wedding_plan_id": "synthetic-plan"});
    if let Some(prior) = supersedes {
        metadata["supersedes_quote_id"] = json!(prior);
    }
    AFPMessage {
        protocol: "afp/1.0".to_string(),
        id: id.to_string(),
        thread_id: "synthetic-vendor-thread".to_string(),
        parent_id: None,
        from: "vendor://synthetic".to_string(),
        to: vec!["agent://wedding-planning".to_string()],
        timestamp: "2026-10-17T00:00:00Z".to_string(),
        r#type: "ledger".to_string(),
        kind: Some("wedding_vendor_quote_received".to_string()),
        supertags: vec!["wedding_vendor_quote".to_string()],
        subtype: Some("wedding_vendor_quote_received".to_string()),
        content: json!({"quote": {
            "vendorName": "Synthetic Venue",
            "amount": 20000,
            "currency": "AUD",
            "validUntil": "2026-11-17T00:00:00Z"
        }}),
        metadata: Some(metadata),
        signature: String::new(),
        encryption: None,
        views: Vec::new(),
        references: Vec::new(),
        typed_refs: Vec::new(),
        attachments: Vec::new(),
        store_in_relational: true,
        prev_hash: None,
    }
}

#[test]
fn existing_single_quote_projection_remains_deterministic_and_does_not_copy_quote_body() {
    let now = DateTime::parse_from_rfc3339("2026-10-17T00:00:00Z")
        .unwrap()
        .with_timezone(&Utc);
    let source = source_quote("quote-v1", None);
    let first = project_quote_event(&source, now);
    let second = project_quote_event(&source, now);
    assert_eq!(
        serde_json::to_value(&first.messages).unwrap(),
        serde_json::to_value(&second.messages).unwrap()
    );
    assert_eq!(first.messages.len(), 1);
    assert_eq!(first.messages[0].r#type, "decision_request");
    assert_eq!(first.messages[0].content.get("quote"), None);
}

#[test]
fn existing_revision_projection_resolves_prior_decision_before_successor() {
    let now = DateTime::parse_from_rfc3339("2026-10-17T00:00:00Z")
        .unwrap()
        .with_timezone(&Utc);
    let batch = project_quote_event(&source_quote("quote-v2", Some("quote-v1")), now);
    assert_eq!(batch.messages.len(), 2);
    assert_eq!(batch.messages[0].r#type, "decision_result");
    assert_eq!(
        batch.messages[0].content["resolution"],
        Value::String("superseded".to_string())
    );
    assert_eq!(batch.messages[1].r#type, "decision_request");
}
