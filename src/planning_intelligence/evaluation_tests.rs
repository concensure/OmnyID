use super::*;

fn constraint(
    kind: ConstraintKind,
    operator: ConstraintOperator,
    value: ConstraintValue,
) -> PlanningConstraint {
    PlanningConstraint {
        schema_version: CONSTRAINT_SCHEMA_VERSION.to_string(),
        constraint_id: format!("constraint:test:{kind:?}").to_ascii_lowercase(),
        template_id: "wedding_planning".to_string(),
        plan_id: "wedding_plan:test".to_string(),
        subject_ref: SubjectReference { kind: SubjectKind::Plan, id: "plan:wedding:test".to_string() },
        kind,
        operator,
        value,
        strength: ConstraintStrength::Hard,
        authority: ConstraintAuthority::User,
        privacy: ConstraintPrivacy::PlanPrivate,
        source_ref: "source:constraint:1".to_string(),
        source_anchor: SourceAnchor {
            message_id: "source:constraint:1".to_string(),
            source_version_id: Some("source:constraint:1:v1".to_string()),
            locator: "content.remark".to_string(),
            exact_excerpt: "explicit planning requirement".to_string(),
        },
        observed_at: "2026-10-19T01:00:00Z".to_string(),
        effective_window: None,
        status: ConstraintStatus::Confirmed,
        supersedes: None,
    }
}

fn fact(kind: ConstraintKind, state: CandidateFactState, value: ConstraintValue, evidence: &str) -> CandidateEvidenceFact {
    CandidateEvidenceFact {
        kind,
        state,
        value,
        evidence_ref: evidence.to_string(),
        candidate_revision_ref: "quotation:venue-a:revision:v2".to_string(),
        aggregate_count: None,
    }
}

fn snapshot(facts: Vec<CandidateEvidenceFact>) -> CandidateEvidenceSnapshot {
    CandidateEvidenceSnapshot {
        candidate_ref: "option:venue-a".to_string(),
        revision_ref: "quotation:venue-a:revision:v2".to_string(),
        observed_at: "2026-10-19T02:00:00Z".to_string(),
        facts,
    }
}

#[test]
fn centrepiece_height_above_the_limit_is_a_blocking_conflict() {
    let constraint = constraint(
        ConstraintKind::DimensionLimit,
        ConstraintOperator::Limits,
        ConstraintValue::Integer { value: 30, unit: Some("centimetres".to_string()) },
    );
    let fact = fact(
        ConstraintKind::DimensionLimit,
        CandidateFactState::Actual,
        ConstraintValue::Integer { value: 45, unit: Some("centimetres".to_string()) },
        "quotation:venue-a:v2:centrepiece-height",
    );
    let (evaluation, presentation) = evaluate_constraint_against_candidate(&constraint, &snapshot(vec![fact])).expect("evaluation");
    assert_eq!(evaluation.result, EvaluationResult::Conflict);
    assert_eq!(evaluation.severity, EvaluationSeverity::Blocking);
    assert_eq!(evaluation.explanation_code, EvaluationExplanationCode::ExplicitConflict);
    assert_eq!(presentation.domain, "constraint_conflict");
}

#[test]
fn explicit_step_free_absence_conflicts_but_missing_evidence_stays_unknown() {
    let constraint = constraint(
        ConstraintKind::AccessibilityRequirement,
        ConstraintOperator::Requires,
        ConstraintValue::Boolean { value: true },
    );
    let absence = fact(
        ConstraintKind::AccessibilityRequirement,
        CandidateFactState::ExplicitlyAbsent,
        ConstraintValue::Boolean { value: true },
        "directory:venue-a:revision:7:step-free",
    );
    let (conflict, _) = evaluate_constraint_against_candidate(&constraint, &snapshot(vec![absence])).expect("conflict");
    assert_eq!(conflict.result, EvaluationResult::Conflict);
    assert!(conflict.candidate_evidence_ref.is_some());

    let (unknown, _) = evaluate_constraint_against_candidate(&constraint, &snapshot(Vec::new())).expect("unknown");
    assert_eq!(unknown.result, EvaluationResult::Unknown);
    assert_eq!(unknown.explanation_code, EvaluationExplanationCode::EvidenceMissing);
    assert!(unknown.candidate_evidence_ref.is_none());
}

#[test]
fn explicit_inter_event_travel_conflicts_with_a_travel_exclusion() {
    let constraint = constraint(
        ConstraintKind::LocationRequirement,
        ConstraintOperator::Excludes,
        ConstraintValue::Enum { value: "inter_event_travel".to_string(), vocabulary: "planning.location.v1".to_string() },
    );
    let actual = fact(
        ConstraintKind::LocationRequirement,
        CandidateFactState::Actual,
        ConstraintValue::Enum { value: "inter_event_travel".to_string(), vocabulary: "planning.location.v1".to_string() },
        "quotation:venue-a:v2:location-plan",
    );
    let (evaluation, _) = evaluate_constraint_against_candidate(&constraint, &snapshot(vec![actual])).expect("evaluation");
    assert_eq!(evaluation.result, EvaluationResult::Conflict);
}

#[test]
fn evaluation_is_deterministic_under_fact_order_and_fails_closed_on_contradiction() {
    let constraint = constraint(
        ConstraintKind::DietaryRequirement,
        ConstraintOperator::Requires,
        ConstraintValue::Enum { value: "halal".to_string(), vocabulary: "planning.dietary.v1".to_string() },
    );
    let first = fact(
        ConstraintKind::DietaryRequirement,
        CandidateFactState::Confirmed,
        constraint.value.clone(),
        "catering:revision:v2:halal:a",
    );
    let second = fact(
        ConstraintKind::DietaryRequirement,
        CandidateFactState::Confirmed,
        constraint.value.clone(),
        "catering:revision:v2:halal:b",
    );
    let left = evaluate_constraint_against_candidate(&constraint, &snapshot(vec![second.clone(), first.clone()])).unwrap().0;
    let right = evaluate_constraint_against_candidate(&constraint, &snapshot(vec![first.clone(), second])).unwrap().0;
    assert_eq!(left, right);

    let absent = CandidateEvidenceFact { state: CandidateFactState::ExplicitlyAbsent, evidence_ref: "catering:revision:v2:halal:absent".to_string(), ..first };
    let (unknown, _) = evaluate_constraint_against_candidate(&constraint, &snapshot(vec![absent, fact(
        ConstraintKind::DietaryRequirement,
        CandidateFactState::Confirmed,
        constraint.value.clone(),
        "catering:revision:v2:halal:present",
    )])).unwrap();
    assert_eq!(unknown.result, EvaluationResult::Unknown);
    assert!(unknown.candidate_evidence_ref.is_none());
}

#[test]
fn private_person_requirements_are_aggregated_without_names_or_source_text() {
    let mut constraint = constraint(
        ConstraintKind::DietaryRequirement,
        ConstraintOperator::Requires,
        ConstraintValue::Enum { value: "vegan".to_string(), vocabulary: "planning.dietary.v1".to_string() },
    );
    constraint.subject_ref = SubjectReference { kind: SubjectKind::Person, id: "person:guest_1234".to_string() };
    constraint.privacy = ConstraintPrivacy::CouplePrivate;
    constraint.source_anchor.exact_excerpt = "Alice needs vegan catering".to_string();
    let mut evidence = fact(
        ConstraintKind::DietaryRequirement,
        CandidateFactState::Confirmed,
        constraint.value.clone(),
        "catering:revision:v2:vegan",
    );
    evidence.aggregate_count = Some(3);
    let (_, presentation) = evaluate_constraint_against_candidate(&constraint, &snapshot(vec![evidence])).unwrap();
    assert_eq!(presentation.evidence_label, "3 private guest requirements checked");
    assert!(!serde_json::to_string(&presentation).unwrap().contains("Alice"));
}

#[test]
fn revision_successors_make_old_evaluations_stale() {
    let constraint = constraint(
        ConstraintKind::AccessibilityRequirement,
        ConstraintOperator::Requires,
        ConstraintValue::Boolean { value: true },
    );
    let evidence = fact(
        ConstraintKind::AccessibilityRequirement,
        CandidateFactState::Confirmed,
        ConstraintValue::Boolean { value: true },
        "directory:venue-a:revision:7:step-free",
    );
    let (evaluation, _) = evaluate_constraint_against_candidate(&constraint, &snapshot(vec![evidence])).unwrap();
    assert!(evaluation_is_current(&evaluation, &constraint.constraint_id, "quotation:venue-a:revision:v2"));
    assert!(!evaluation_is_current(&evaluation, &constraint.constraint_id, "quotation:venue-a:revision:v3"));
}

#[test]
fn facts_from_another_revision_are_rejected() {
    let constraint = constraint(
        ConstraintKind::AccessibilityRequirement,
        ConstraintOperator::Requires,
        ConstraintValue::Boolean { value: true },
    );
    let mut evidence = fact(
        ConstraintKind::AccessibilityRequirement,
        CandidateFactState::Confirmed,
        ConstraintValue::Boolean { value: true },
        "directory:venue-a:revision:6:step-free",
    );
    evidence.candidate_revision_ref = "quotation:venue-a:revision:v1".to_string();
    assert!(evaluate_constraint_against_candidate(&constraint, &snapshot(vec![evidence])).is_err());
}

#[test]
fn active_batch_ignores_superseded_history_and_is_order_independent() {
    let accessibility = constraint(
        ConstraintKind::AccessibilityRequirement,
        ConstraintOperator::Requires,
        ConstraintValue::Boolean { value: true },
    );
    let mut old = accessibility.clone();
    old.constraint_id = "constraint:old".to_string();
    old.status = ConstraintStatus::Superseded;
    old.supersedes = Some("constraint:older".to_string());
    let evidence = fact(
        ConstraintKind::AccessibilityRequirement,
        CandidateFactState::Confirmed,
        ConstraintValue::Boolean { value: true },
        "directory:venue-a:revision:7:step-free",
    );
    let snapshot = snapshot(vec![evidence]);
    let left = evaluate_active_constraints(&[old.clone(), accessibility.clone()], &snapshot).unwrap();
    let right = evaluate_active_constraints(&[accessibility, old], &snapshot).unwrap();
    assert_eq!(left, right);
    assert_eq!(left.len(), 1);
}
