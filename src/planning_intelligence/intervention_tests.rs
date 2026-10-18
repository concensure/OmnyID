use crate::{
    planning_intelligence::*,
    quotation::{
        ClarificationApproval, ClarificationError, authorise_clarification_send, draft_hash,
    },
};

fn constraint() -> PlanningConstraint {
    PlanningConstraint {
        schema_version: CONSTRAINT_SCHEMA_VERSION.to_string(),
        constraint_id: "constraint:step_free:v1".to_string(),
        template_id: "wedding".to_string(),
        plan_id: "plan:wedding:one".to_string(),
        subject_ref: SubjectReference {
            kind: SubjectKind::Person,
            id: "person:guest:opaque".to_string(),
        },
        kind: ConstraintKind::AccessibilityRequirement,
        operator: ConstraintOperator::Requires,
        value: ConstraintValue::Boolean { value: true },
        strength: ConstraintStrength::Hard,
        authority: ConstraintAuthority::User,
        privacy: ConstraintPrivacy::CouplePrivate,
        source_ref: "source:user_note:v1".to_string(),
        source_anchor: SourceAnchor {
            message_id: "source:user_note:v1".to_string(),
            source_version_id: Some("source:user_note:revision:1".to_string()),
            locator: "content.body".to_string(),
            exact_excerpt: "My aunt needs step-free access".to_string(),
        },
        observed_at: "2026-10-19T01:00:00Z".to_string(),
        effective_window: None,
        status: ConstraintStatus::Confirmed,
        supersedes: None,
    }
}

fn evaluation() -> ConstraintEvaluation {
    ConstraintEvaluation {
        schema_version: EVALUATION_SCHEMA_VERSION.to_string(),
        evaluation_id: "evaluation:step_free:quote_v1".to_string(),
        constraint_ref: "constraint:step_free:v1".to_string(),
        candidate_ref: "quotation:venue:v1".to_string(),
        result: EvaluationResult::Conflict,
        severity: EvaluationSeverity::Blocking,
        constraint_evidence_ref: "source:user_note:v1".to_string(),
        candidate_evidence_ref: Some("quotation_evidence:no_step_free:v1".to_string()),
        explanation_code: EvaluationExplanationCode::ExplicitConflict,
        evaluated_at: "2026-10-19T01:05:00Z".to_string(),
    }
}

fn binding() -> QuotationConflictBinding {
    QuotationConflictBinding {
        quotation_id: "quotation:venue".to_string(),
        quotation_version_id: "quotation:venue:v1".to_string(),
        comparison_revision: "comparison:one:v1".to_string(),
        grant_revision: Some("grant:vendor:v1".to_string()),
        recipient: "venue@example.test".to_string(),
        subject: "Question about your venue quotation".to_string(),
        created_at: "2026-10-19T01:06:00Z".to_string(),
    }
}

#[test]
fn conflict_creates_bounded_decision_and_existing_clarification_draft() {
    let projection = build_constraint_conflict_intervention(
        &constraint(),
        &evaluation(),
        "The quotation says the entrance has three steps",
        &binding(),
    )
    .expect("intervention");

    assert_eq!(
        projection.remembered_statement,
        "My aunt needs step-free access"
    );
    assert_eq!(projection.intervention.options.len(), 4);
    assert_eq!(
        projection.intervention.recommended_option_id.as_deref(),
        Some("reject_candidate")
    );
    assert_eq!(
        projection
            .intervention
            .prepared_next_action
            .as_ref()
            .map(|action| action.target_ref.as_str()),
        Some(projection.clarification_draft.draft_id.as_str())
    );
    assert_eq!(projection.clarification_draft.questions.len(), 1);
    assert!(
        projection.clarification_draft.questions[0]
            .question
            .contains("required accessibility feature")
    );
    validate_intervention(&projection.intervention).expect("valid intervention contract");
}

#[test]
fn private_remembered_text_never_enters_vendor_draft() {
    let projection = build_constraint_conflict_intervention(
        &constraint(),
        &evaluation(),
        "The quotation says the entrance has three steps",
        &binding(),
    )
    .expect("intervention");
    let vendor_bytes = serde_json::to_string(&projection.clarification_draft).expect("json");

    assert!(!vendor_bytes.contains("My aunt"));
    assert!(!vendor_bytes.contains("three steps"));
    assert!(!vendor_bytes.contains("person:guest"));
    assert!(vendor_bytes.contains("Accessibility requirement"));
}

#[test]
fn revisions_and_draft_hash_make_successors_stale() {
    let projection = build_constraint_conflict_intervention(
        &constraint(),
        &evaluation(),
        "Current quote conflicts",
        &binding(),
    )
    .expect("intervention");
    let current = CurrentConflictRevisions {
        constraint_ref: "constraint:step_free:v1",
        quotation_version_id: "quotation:venue:v1",
        comparison_revision: "comparison:one:v1",
        grant_revision: Some("grant:vendor:v1"),
    };
    assert!(constraint_conflict_intervention_is_current(
        &projection,
        &current
    ));

    for stale in [
        CurrentConflictRevisions {
            constraint_ref: "constraint:step_free:v2",
            ..current.clone()
        },
        CurrentConflictRevisions {
            quotation_version_id: "quotation:venue:v2",
            ..current.clone()
        },
        CurrentConflictRevisions {
            comparison_revision: "comparison:one:v2",
            ..current.clone()
        },
        CurrentConflictRevisions {
            grant_revision: Some("grant:vendor:v2"),
            ..current.clone()
        },
    ] {
        assert!(!constraint_conflict_intervention_is_current(
            &projection,
            &stale
        ));
    }

    let mut tampered = projection.clone();
    tampered.clarification_draft.questions[0].question = "Different question?".to_string();
    assert!(!constraint_conflict_intervention_is_current(
        &tampered, &current
    ));
}

#[test]
fn draft_still_requires_a_separate_matching_approval_receipt() {
    let projection = build_constraint_conflict_intervention(
        &constraint(),
        &evaluation(),
        "Current quote conflicts",
        &binding(),
    )
    .expect("intervention");
    let draft = &projection.clarification_draft;
    let no_receipt = ClarificationApproval {
        approval_id: "approval:one".to_string(),
        draft_id: draft.draft_id.clone(),
        draft_hash: draft_hash(draft),
        recipient: draft.recipient.clone(),
        quotation_version_id: draft.quotation_version_id.clone(),
        comparison_revision: draft.comparison_revision.clone(),
        expires_at: "2026-10-20T00:00:00Z".to_string(),
        approval_receipt_id: String::new(),
    };
    assert_eq!(
        authorise_clarification_send(draft, &no_receipt, "2026-10-19T02:00:00Z", &[]),
        Err(ClarificationError::MissingApprovalReceipt)
    );
}

#[test]
fn non_conflicts_stale_candidates_and_unconfirmed_constraints_fail_closed() {
    let mut not_conflict = evaluation();
    not_conflict.result = EvaluationResult::Satisfied;
    not_conflict.explanation_code = EvaluationExplanationCode::ExplicitMatch;
    assert!(
        build_constraint_conflict_intervention(
            &constraint(),
            &not_conflict,
            "Evidence",
            &binding(),
        )
        .is_err()
    );

    let mut stale = evaluation();
    stale.candidate_ref = "quotation:venue:v0".to_string();
    assert!(
        build_constraint_conflict_intervention(&constraint(), &stale, "Evidence", &binding(),)
            .is_err()
    );

    let mut proposed = constraint();
    proposed.status = ConstraintStatus::Proposed;
    proposed.authority = ConstraintAuthority::Deterministic;
    assert!(
        build_constraint_conflict_intervention(&proposed, &evaluation(), "Evidence", &binding(),)
            .is_err()
    );
}

#[test]
fn intervention_is_deterministic_and_soft_conflicts_are_not_auto_recommended() {
    let mut soft = evaluation();
    soft.severity = EvaluationSeverity::DecisionRelevant;
    let first = build_constraint_conflict_intervention(
        &constraint(),
        &soft,
        "Current evidence conflicts",
        &binding(),
    )
    .expect("first");
    let second = build_constraint_conflict_intervention(
        &constraint(),
        &soft,
        "Current evidence conflicts",
        &binding(),
    )
    .expect("second");

    assert_eq!(first, second);
    assert_eq!(first.intervention.recommended_option_id, None);
}
