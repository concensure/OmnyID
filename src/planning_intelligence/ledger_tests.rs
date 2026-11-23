use super::{
    ConstraintAuthority, ConstraintPrivacy, ConstraintStatus, PlanningConstraint,
    ProjectedConstraintState, constraint_from_message, constraint_message_id,
    planning_constraint_message, project_constraint_messages, validate_constraint_ledger_policy,
};

fn fixture_constraint() -> PlanningConstraint {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/planning/contract-cases.json"
    ))
    .expect("fixture JSON");
    fixture["cases"]
        .as_array()
        .expect("cases")
        .iter()
        .find(|case| case["name"] == "renovation_step_free_constraint")
        .and_then(|case| serde_json::from_value(case["payload"].clone()).ok())
        .expect("constraint fixture")
}

fn successor(
    previous: &PlanningConstraint,
    id: &str,
    status: ConstraintStatus,
) -> PlanningConstraint {
    let mut value = previous.clone();
    value.constraint_id = id.to_string();
    value.status = status;
    value.supersedes = Some(previous.constraint_id.clone());
    value.observed_at = "2026-10-18T11:00:00Z".to_string();
    value.source_ref = "message:renovation:brief:2".to_string();
    value.source_anchor.message_id = value.source_ref.clone();
    value.source_anchor.source_version_id = Some("message:renovation:brief:2:v1".to_string());
    value.source_anchor.exact_excerpt = "Keep the entrance step-free.".to_string();
    value
}

#[test]
fn exact_retry_has_stable_message_identity_and_preserves_evidence() {
    let constraint = fixture_constraint();
    let first = planning_constraint_message("thread:renovation", "user://alpha", &constraint);
    let second = planning_constraint_message("thread:renovation", "user://alpha", &constraint);
    assert_eq!(first.id, second.id);
    assert_eq!(first.timestamp, constraint.observed_at);
    assert_eq!(
        first.id,
        constraint_message_id(
            "thread:renovation",
            first.metadata.as_ref().unwrap()["payload_fingerprint"]
                .as_str()
                .unwrap()
        )
    );
    let decoded = constraint_from_message(&first).unwrap().unwrap();
    assert_eq!(decoded.source_anchor, constraint.source_anchor);
    let mut postgres_roundtrip = first;
    postgres_roundtrip.timestamp = "2026-10-18 10:00:00+00".to_string();
    assert!(constraint_from_message(&postgres_roundtrip).is_ok());

    let mut precise = constraint;
    precise.observed_at = "2026-10-18T10:00:00.123456789Z".to_string();
    let mut rounded = planning_constraint_message("thread:renovation", "user://alpha", &precise);
    rounded.timestamp = "2026-10-18 10:00:00.123456+00".to_string();
    assert!(constraint_from_message(&rounded).is_ok());
}

#[test]
fn shuffled_duplicate_replay_projects_one_active_successor() {
    let original = fixture_constraint();
    let replacement = successor(
        &original,
        "constraint:renovation:step-free:v2",
        ConstraintStatus::Confirmed,
    );
    let first = planning_constraint_message("thread:renovation", "user://alpha", &original);
    let second = planning_constraint_message("thread:renovation", "user://alpha", &replacement);
    let projection = project_constraint_messages(
        &[second.clone(), first.clone(), first, second],
        &original.plan_id,
    )
    .unwrap();
    assert_eq!(projection.active.len(), 1);
    assert_eq!(projection.superseded.len(), 1);
    assert!(projection.removed.is_empty());
    assert_eq!(
        projection.active[0].constraint.constraint_id,
        replacement.constraint_id
    );
    assert_eq!(
        projection.superseded[0].state,
        ProjectedConstraintState::Superseded
    );
}

#[test]
fn removal_is_a_tombstone_and_does_not_erase_evidence() {
    let original = fixture_constraint();
    let removed = successor(
        &original,
        "constraint:renovation:step-free:removed:v1",
        ConstraintStatus::Removed,
    );
    let messages = [
        planning_constraint_message("thread:renovation", "user://alpha", &original),
        planning_constraint_message("thread:renovation", "user://alpha", &removed),
    ];
    let projection = project_constraint_messages(&messages, &original.plan_id).unwrap();
    assert!(projection.active.is_empty());
    assert_eq!(projection.removed.len(), 2);
    assert!(projection.removed.iter().any(|entry| {
        entry.constraint.constraint_id == original.constraint_id
            && entry.constraint.source_anchor == original.source_anchor
    }));
    assert!(
        projection
            .removed
            .iter()
            .any(|entry| entry.constraint.status == ConstraintStatus::Removed)
    );
}

#[test]
fn divergent_identity_and_forged_message_bindings_fail_closed() {
    let original = fixture_constraint();
    let mut divergent = original.clone();
    divergent.privacy = ConstraintPrivacy::CouplePrivate;
    divergent.authority = ConstraintAuthority::User;
    let messages = [
        planning_constraint_message("thread:renovation", "user://alpha", &original),
        planning_constraint_message("thread:renovation", "user://alpha", &divergent),
    ];
    assert!(project_constraint_messages(&messages, &original.plan_id).is_err());

    let mut forged = messages[0].clone();
    forged.metadata.as_mut().unwrap()["plan_id"] = serde_json::json!("plan:other");
    assert!(constraint_from_message(&forged).is_err());
}

#[test]
fn ledger_policy_requires_exact_source_and_private_pseudonymous_people() {
    let mut constraint = fixture_constraint();
    constraint.source_anchor.message_id = "message:other".to_string();
    assert!(validate_constraint_ledger_policy(&constraint).is_err());

    constraint.source_anchor.message_id = constraint.source_ref.clone();
    constraint.subject_ref.kind = super::SubjectKind::Person;
    constraint.subject_ref.id = "person:Alex".to_string();
    assert!(validate_constraint_ledger_policy(&constraint).is_err());

    constraint.subject_ref.id = "person:guest_001".to_string();
    assert!(validate_constraint_ledger_policy(&constraint).is_err());
    constraint.privacy = ConstraintPrivacy::CouplePrivate;
    assert!(validate_constraint_ledger_policy(&constraint).is_ok());
}
