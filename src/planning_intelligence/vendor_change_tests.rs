use crate::quotation::{
    NormalisedQuotation, QuotationVendorResponse, VendorCommercialFact, VendorCommercialValue,
    VendorResponseEvidenceState, VendorResponseStatus,
};

use super::*;

fn quotation() -> NormalisedQuotation {
    serde_json::from_str(include_str!(
        "../../tests/fixtures/quotation/generic_normalised_quote.json"
    ))
    .unwrap()
}

fn response() -> QuotationVendorResponse {
    let mut response: QuotationVendorResponse = serde_json::from_str(include_str!(
        "../../tests/fixtures/quotation/vendor_response_v1.json"
    ))
    .unwrap();
    response.status = VendorResponseStatus::Received;
    response.question_answers.clear();
    response.commercial_facts.clear();
    response
}

fn fact(id: &str, key: &str, value: VendorCommercialValue) -> VendorCommercialFact {
    VendorCommercialFact {
        fact_id: id.to_string(),
        key: key.to_string(),
        state: VendorResponseEvidenceState::Confirmed,
        value: Some(value),
        anchors: vec![crate::quotation::SourceAnchor {
            source_id: "vendor-response-source-1".to_string(),
            source_version_id: "vendor-response-source-1-v1".to_string(),
            locator: format!("fact={id}"),
            exact_excerpt: format!("Exact vendor statement for {id}"),
        }],
    }
}

#[test]
fn unavailable_item_with_two_substitutions_becomes_one_anchored_review_change() {
    let mut response = response();
    response.commercial_facts = vec![
        fact(
            "lighting-unavailable",
            "change.line_item.lighting.unavailable",
            VendorCommercialValue::Boolean(true),
        ),
        fact(
            "replacement-a",
            "change.line_item.lighting.replacement",
            VendorCommercialValue::Text("Warm festoon lighting".to_string()),
        ),
        fact(
            "replacement-b",
            "change.line_item.lighting.replacement",
            VendorCommercialValue::Text("Pin-spot lighting".to_string()),
        ),
        fact(
            "decision-deadline",
            "change.line_item.lighting.deadline",
            VendorCommercialValue::Date("2026-11-15T00:00:00Z".to_string()),
        ),
    ];

    let interpretation = interpret_vendor_response_change(&response, &quotation());

    assert_eq!(
        interpretation.kind,
        VendorResponseInterpretationKind::ChangeProposal
    );
    assert!(interpretation.blockers.is_empty());
    assert_eq!(interpretation.changes.len(), 1);
    let change = &interpretation.changes[0];
    assert_eq!(change.change_kind, VendorChangeKind::Substituted);
    assert_eq!(change.affected_object_ref, "line_item:lighting");
    assert_eq!(change.original_term.value, "Lighting package");
    assert_eq!(change.replacement_options.len(), 2);
    assert_eq!(change.deadline.as_deref(), Some("2026-11-15T00:00:00Z"));
    assert!(change.requires_user_decision);
    assert!(!interpretation.quotation_mutated);
}

#[test]
fn price_change_uses_exact_currency_delta_and_response_evidence() {
    let mut response = response();
    response.commercial_facts = vec![fact(
        "lighting-price-change",
        "change.line_item.lighting.price",
        VendorCommercialValue::Money(crate::quotation::Money {
            amount_minor: 425_000,
            currency: "AUD".to_string(),
        }),
    )];

    let interpretation = interpret_vendor_response_change(&response, &quotation());
    let change = &interpretation.changes[0];
    assert_eq!(change.change_kind, VendorChangeKind::PriceChanged);
    assert_eq!(change.original_term.value, "AUD:400000");
    assert_eq!(change.replacement_options[0].value, "AUD:425000");
    assert_eq!(
        change.cost_delta,
        KnownMoney::Exact {
            amount: Money {
                amount_minor: 25_000,
                currency: "AUD".to_string(),
            },
            evidence_ref: "vendor-response-source-1-v1".to_string(),
        }
    );
}

#[test]
fn price_decrease_keeps_direction_in_terms_and_uses_contract_safe_delta_magnitude() {
    let mut response = response();
    response.commercial_facts = vec![fact(
        "lighting-price-decrease",
        "change.line_item.lighting.price",
        VendorCommercialValue::Money(crate::quotation::Money {
            amount_minor: 375_000,
            currency: "AUD".to_string(),
        }),
    )];

    let interpretation = interpret_vendor_response_change(&response, &quotation());
    let change = &interpretation.changes[0];
    assert_eq!(change.original_term.value, "AUD:400000");
    assert_eq!(change.replacement_options[0].value, "AUD:375000");
    assert_eq!(
        change.cost_delta,
        KnownMoney::Exact {
            amount: Money {
                amount_minor: 25_000,
                currency: "AUD".to_string()
            },
            evidence_ref: "vendor-response-source-1-v1".to_string(),
        }
    );
}

#[test]
fn proposed_unanchored_change_and_stale_quote_are_blockers_not_mutations() {
    let mut response = response();
    let mut proposed = fact(
        "replacement",
        "change.line_item.lighting.replacement",
        VendorCommercialValue::Text("Alternative".to_string()),
    );
    proposed.state = VendorResponseEvidenceState::Proposed;
    proposed.anchors.clear();
    response.commercial_facts = vec![proposed];
    response.quotation_version_id = "production-hire-quote-v0".to_string();

    let interpretation = interpret_vendor_response_change(&response, &quotation());

    assert_eq!(
        interpretation.kind,
        VendorResponseInterpretationKind::ChangeProposal
    );
    assert!(interpretation.changes.is_empty());
    assert!(
        interpretation
            .blockers
            .iter()
            .any(|value| value.kind == VendorChangeBlockerKind::EvidenceNotConfirmed)
    );
    assert!(
        interpretation
            .blockers
            .iter()
            .any(|value| value.kind == VendorChangeBlockerKind::StaleQuotationBinding)
    );
    assert!(!interpretation.quotation_mutated);
}

#[test]
fn ambiguous_object_and_currency_never_become_a_change() {
    let mut response = response();
    response.commercial_facts = vec![
        fact(
            "missing-object",
            "change.line_item.flowers.replacement",
            VendorCommercialValue::Text("Native flowers".to_string()),
        ),
        fact(
            "mixed-currency",
            "change.line_item.lighting.price",
            VendorCommercialValue::Money(crate::quotation::Money {
                amount_minor: 4_200,
                currency: "USD".to_string(),
            }),
        ),
    ];

    let interpretation = interpret_vendor_response_change(&response, &quotation());

    assert!(interpretation.changes.is_empty());
    assert!(
        interpretation
            .blockers
            .iter()
            .any(|value| value.kind == VendorChangeBlockerKind::OriginalObjectMissing)
    );
    assert!(
        interpretation
            .blockers
            .iter()
            .any(|value| value.kind == VendorChangeBlockerKind::CurrencyMismatch)
    );
}

#[test]
fn ordinary_answers_and_quote_facts_classify_without_inventing_changes() {
    let mut clarification = response();
    clarification.question_answers = serde_json::from_value(serde_json::json!([{
        "question_id": "availability",
        "state": "proposed",
        "answer": "Available"
    }]))
    .unwrap();
    assert_eq!(
        interpret_vendor_response_change(&clarification, &quotation()).kind,
        VendorResponseInterpretationKind::Clarification
    );

    let mut quote = response();
    quote.commercial_facts = vec![fact(
        "ordinary-total",
        "own_quote.total",
        VendorCommercialValue::Money(crate::quotation::Money {
            amount_minor: 425_000,
            currency: "AUD".to_string(),
        }),
    )];
    let interpretation = interpret_vendor_response_change(&quote, &quotation());
    assert_eq!(interpretation.kind, VendorResponseInterpretationKind::Quote);
    assert!(interpretation.changes.is_empty());
}

#[test]
fn fact_order_does_not_change_interpretation_identity() {
    let mut first = response();
    first.commercial_facts = vec![
        fact(
            "replacement-a",
            "change.line_item.lighting.replacement",
            VendorCommercialValue::Text("Warm festoon lighting".to_string()),
        ),
        fact(
            "replacement-b",
            "change.line_item.lighting.replacement",
            VendorCommercialValue::Text("Pin-spot lighting".to_string()),
        ),
    ];
    let mut second = first.clone();
    second.commercial_facts.reverse();

    let first = interpret_vendor_response_change(&first, &quotation());
    let second = interpret_vendor_response_change(&second, &quotation());
    assert_eq!(first.interpretation_id, second.interpretation_id);
    assert_eq!(first.changes, second.changes);
}
