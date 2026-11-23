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

fn interpretation_with_substitutions() -> VendorChangeInterpretation {
    let mut response = response();
    response.commercial_facts = vec![
        fact(
            "replacement-a",
            "change.line_item.lighting.replacement",
            VendorCommercialValue::Text("Warm festoon lighting".to_string()),
        ),
        fact(
            "replacement-b",
            "change.line_item.lighting.replacement",
            VendorCommercialValue::Text("Cool pin-spot lighting".to_string()),
        ),
        fact(
            "deadline",
            "change.line_item.lighting.deadline",
            VendorCommercialValue::Date("2026-11-15T00:00:00Z".to_string()),
        ),
    ];
    interpret_vendor_response_change(&response, &quotation())
}

fn aesthetic_constraint() -> PlanningConstraint {
    PlanningConstraint {
        schema_version: CONSTRAINT_SCHEMA_VERSION.to_string(),
        constraint_id: "constraint-style-v1".to_string(),
        template_id: "wedding".to_string(),
        plan_id: "plan-1".to_string(),
        subject_ref: SubjectReference {
            kind: SubjectKind::Plan,
            id: "plan-1".to_string(),
        },
        kind: ConstraintKind::AestheticPreference,
        operator: ConstraintOperator::Prefers,
        value: ConstraintValue::Enum {
            value: "warm".to_string(),
            vocabulary: "palette".to_string(),
        },
        strength: ConstraintStrength::Strong,
        authority: ConstraintAuthority::User,
        privacy: ConstraintPrivacy::PlanPrivate,
        source_ref: "constraint-source-v1".to_string(),
        source_anchor: SourceAnchor {
            message_id: "constraint-source".to_string(),
            source_version_id: Some("constraint-source-v1".to_string()),
            locator: "facet=palette".to_string(),
            exact_excerpt: "warm palette".to_string(),
        },
        observed_at: "2026-10-19T00:00:00Z".to_string(),
        effective_window: None,
        status: ConstraintStatus::Confirmed,
        supersedes: None,
    }
}

fn evaluation(option_ref: &str, result: EvaluationResult) -> ConstraintEvaluation {
    ConstraintEvaluation {
        schema_version: EVALUATION_SCHEMA_VERSION.to_string(),
        evaluation_id: format!("evaluation-{result:?}-{option_ref}"),
        constraint_ref: "constraint-style-v1".to_string(),
        candidate_ref: option_ref.to_string(),
        result: result.clone(),
        severity: if result == EvaluationResult::Conflict {
            EvaluationSeverity::DecisionRelevant
        } else {
            EvaluationSeverity::Informational
        },
        constraint_evidence_ref: "constraint-source-v1".to_string(),
        candidate_evidence_ref: Some("vendor-response-source-1-v1".to_string()),
        explanation_code: if result == EvaluationResult::Conflict {
            EvaluationExplanationCode::ExplicitConflict
        } else {
            EvaluationExplanationCode::ExplicitMatch
        },
        evaluated_at: "2026-10-19T00:00:00Z".to_string(),
    }
}

fn review<'a>(
    interpretation: &'a VendorChangeInterpretation,
    constraints: &'a [PlanningConstraint],
    evaluations: &'a [ConstraintEvaluation],
    budget: Option<&'a VendorChangeBudgetEvidence>,
    event: Option<&'a VendorChangeEventEvidence>,
) -> VendorChangeReview {
    build_vendor_change_review(&VendorChangeReviewInput {
        interpretation,
        current_response_ref: &interpretation.response_ref,
        current_response_fingerprint: &interpretation.response_fingerprint,
        current_quotation_version_ref: &interpretation.quotation_version_ref,
        constraints,
        evaluations,
        budget,
        event,
        as_of: "2026-10-19T23:30:00+11:00",
    })
}

#[test]
fn two_substitutions_keep_explicit_style_conflict_and_unknown_separate() {
    let interpretation = interpretation_with_substitutions();
    let options = &interpretation.changes[0].replacement_options;
    let conflicted_ref = vendor_replacement_option_ref(&interpretation.changes[0], &options[0]);
    let constraints = vec![aesthetic_constraint()];
    let evaluations = vec![evaluation(&conflicted_ref, EvaluationResult::Conflict)];

    let review = review(&interpretation, &constraints, &evaluations, None, None);

    let conflicted = review
        .options
        .iter()
        .find(|value| value.option_ref == conflicted_ref)
        .unwrap();
    assert_eq!(conflicted.constraint_fit, VendorChangeFit::Conflict);
    assert_eq!(conflicted.aesthetic_fit, VendorChangeFit::Conflict);
    let unknown = review
        .options
        .iter()
        .find(|value| value.option_ref != conflicted_ref)
        .unwrap();
    assert_eq!(unknown.constraint_fit, VendorChangeFit::Unknown);
    assert_eq!(unknown.aesthetic_fit, VendorChangeFit::Unknown);
    assert_eq!(unknown.unknown_constraint_refs, vec!["constraint-style-v1"]);
    assert!(!review.quotation_mutated);
}

#[test]
fn price_change_uses_current_headroom_without_losing_uncertainty() {
    let mut response = response();
    response.commercial_facts = vec![fact(
        "price",
        "change.line_item.lighting.price",
        VendorCommercialValue::Money(crate::quotation::Money {
            amount_minor: 425_000,
            currency: "AUD".to_string(),
        }),
    )];
    let interpretation = interpret_vendor_response_change(&response, &quotation());
    let uncertain = VendorChangeBudgetEvidence {
        budget_revision_ref: "budget-v1".to_string(),
        available_headroom: MoneyRange {
            minimum_minor: 10_000,
            maximum_minor: 30_000,
            currency: "AUD".to_string(),
            evidence_refs: vec!["budget-evidence-v1".to_string()],
        },
    };
    let uncertain_review = review(&interpretation, &[], &[], Some(&uncertain), None);
    assert_eq!(
        uncertain_review.options[0].budget_fit,
        VendorChangeBudgetFit::Uncertain
    );

    let exceeded = VendorChangeBudgetEvidence {
        available_headroom: MoneyRange {
            maximum_minor: 20_000,
            ..uncertain.available_headroom.clone()
        },
        ..uncertain
    };
    let exceeded_review = review(&interpretation, &[], &[], Some(&exceeded), None);
    assert_eq!(
        exceeded_review.options[0].budget_fit,
        VendorChangeBudgetFit::ExceedsBudget
    );
}

#[test]
fn timing_uses_calendar_dates_only_when_event_and_deadline_are_explicit() {
    let interpretation = interpretation_with_substitutions();
    let event = VendorChangeEventEvidence {
        event_at: "2026-12-01T09:00:00+11:00".to_string(),
        source_revision_ref: "wedding-date-v2".to_string(),
    };
    let dated_review = review(&interpretation, &[], &[], None, Some(&event));
    assert_eq!(dated_review.timing[0].days_to_event, Some(43));
    assert_eq!(dated_review.timing[0].days_to_deadline, Some(27));
    assert_eq!(
        dated_review.timing[0].event_date_evidence_ref.as_deref(),
        Some("wedding-date-v2")
    );

    let undated_review = review(&interpretation, &[], &[], None, None);
    assert_eq!(undated_review.timing[0].days_to_event, None);
    assert_eq!(undated_review.timing[0].days_to_deadline, Some(27));
    assert_eq!(undated_review.timing[0].event_date_evidence_ref, None);
}

#[test]
fn stale_bindings_and_stale_evaluations_fail_closed() {
    let interpretation = interpretation_with_substitutions();
    let option_ref = vendor_replacement_option_ref(
        &interpretation.changes[0],
        &interpretation.changes[0].replacement_options[0],
    );
    let constraints = vec![aesthetic_constraint()];
    let mut stale = evaluation(&option_ref, EvaluationResult::Satisfied);
    stale.constraint_ref = "constraint-style-v0".to_string();
    let input = VendorChangeReviewInput {
        interpretation: &interpretation,
        current_response_ref: "response-successor",
        current_response_fingerprint: "fingerprint-successor",
        current_quotation_version_ref: "quote-successor",
        constraints: &constraints,
        evaluations: &[stale],
        budget: None,
        event: None,
        as_of: "2026-10-19T00:00:00Z",
    };
    let review = build_vendor_change_review(&input);
    for kind in [
        VendorChangeReviewBlockerKind::ResponseNotCurrent,
        VendorChangeReviewBlockerKind::QuotationNotCurrent,
        VendorChangeReviewBlockerKind::EvaluationNotCurrent,
    ] {
        assert!(review.blockers.iter().any(|value| value.kind == kind));
    }
}

#[test]
fn currentness_and_identity_are_order_independent_and_revision_bound() {
    let interpretation = interpretation_with_substitutions();
    let constraints = vec![aesthetic_constraint()];
    let refs = interpretation.changes[0]
        .replacement_options
        .iter()
        .map(|option| vendor_replacement_option_ref(&interpretation.changes[0], option))
        .collect::<Vec<_>>();
    let first_evaluations = vec![
        evaluation(&refs[0], EvaluationResult::Satisfied),
        evaluation(&refs[1], EvaluationResult::Conflict),
    ];
    let mut second_evaluations = first_evaluations.clone();
    second_evaluations.reverse();
    let first = review(
        &interpretation,
        &constraints,
        &first_evaluations,
        None,
        None,
    );
    let second = review(
        &interpretation,
        &constraints,
        &second_evaluations,
        None,
        None,
    );
    assert_eq!(first.review_id, second.review_id);
    assert_eq!(first.options, second.options);

    assert!(vendor_change_review_is_current(
        &first,
        &CurrentVendorChangeReviewRevisions {
            response_ref: &interpretation.response_ref,
            response_fingerprint: &interpretation.response_fingerprint,
            quotation_version_ref: &interpretation.quotation_version_ref,
            constraint_revision_refs: &["constraint-style-v1".to_string()],
            budget_revision_ref: None,
            event_date_revision_ref: None,
        }
    ));
}

#[test]
fn one_known_match_does_not_hide_an_unevaluated_current_constraint() {
    let interpretation = interpretation_with_substitutions();
    let option_ref = vendor_replacement_option_ref(
        &interpretation.changes[0],
        &interpretation.changes[0].replacement_options[0],
    );
    let first = aesthetic_constraint();
    let mut second = first.clone();
    second.constraint_id = "constraint-style-v2".to_string();
    second.source_ref = "constraint-source-v2".to_string();
    second.source_anchor.message_id = "constraint-source-2".to_string();
    second.source_anchor.source_version_id = Some("constraint-source-v2".to_string());
    let constraints = vec![first, second];
    let evaluations = vec![evaluation(&option_ref, EvaluationResult::Satisfied)];

    let review = review(&interpretation, &constraints, &evaluations, None, None);
    let option = review
        .options
        .iter()
        .find(|value| value.option_ref == option_ref)
        .unwrap();
    assert_eq!(option.constraint_fit, VendorChangeFit::Unknown);
    assert_eq!(option.aesthetic_fit, VendorChangeFit::Unknown);
    assert_eq!(option.unknown_constraint_refs, vec!["constraint-style-v2"]);
}

#[test]
fn transport_status_never_becomes_acceptance_or_mutation() {
    let mut response = response();
    response.status = VendorResponseStatus::Reviewed;
    response.commercial_facts = vec![fact(
        "scope",
        "change.line_item.lighting.scope",
        VendorCommercialValue::Inclusion(crate::quotation::InclusionState::Included),
    )];
    let interpretation = interpret_vendor_response_change(&response, &quotation());
    let review = review(&interpretation, &[], &[], None, None);
    assert!(review.requires_user_review);
    assert!(!review.quotation_mutated);
}
