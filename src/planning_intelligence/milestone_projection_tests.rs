use super::*;

fn milestone_id(key: &str) -> String {
    format!("milestone:plan:test:{key}")
}

fn evidence(key: &str, state: ObservedMilestoneState) -> MilestoneEvidence {
    MilestoneEvidence {
        milestone_id: milestone_id(key),
        source_ref: format!("task:{key}"),
        source_revision_ref: format!("task:{key}:v1"),
        source_kind: MilestoneEvidenceSourceKind::Task,
        state,
        manual_due_at: None,
        manual_date_source_ref: None,
    }
}

#[test]
fn wedding_template_projects_real_prerequisites_and_computed_slack() {
    let projection = project_wedding_milestones(
        "plan:test",
        "2026-01-01T00:00:00Z",
        Some("2026-12-01T00:00:00Z"),
        vec![],
    )
    .expect("projection");

    let invitations = projection
        .milestones
        .iter()
        .find(|item| item.dependency.milestone_id == milestone_id("invitations_ready"))
        .expect("invitations");
    assert_eq!(
        invitations.dependency.depends_on,
        vec![
            milestone_id("guest_count_draft"),
            milestone_id("accommodation_blocks"),
            milestone_id("stationery_details"),
        ]
    );
    assert!(invitations.dependency.earliest_at.is_some());
    assert!(invitations.dependency.latest_at.is_some());
    assert!(invitations.dependency.slack_days.is_some());
    assert_eq!(
        invitations
            .date_provenance
            .as_ref()
            .map(|value| &value.authority),
        Some(&MilestoneDateAuthority::ComputedTemplate)
    );
}

#[test]
fn absent_event_date_is_an_explicit_blocker_and_never_claims_critical_path() {
    let projection = project_wedding_milestones("plan:test", "2026-01-01T00:00:00Z", None, vec![])
        .expect("blocked projection");

    assert_eq!(projection.blockers.len(), projection.milestones.len());
    assert!(
        projection
            .blockers
            .iter()
            .all(|value| value.kind == MilestoneBlockerKind::HorizonMissing)
    );
    assert!(projection.milestones.iter().all(|value| {
        value.dependency.state == MilestoneState::Blocked && value.dependency.slack_days.is_none()
    }));
    assert!(projection.selected_path_item.is_none());
}

#[test]
fn manual_date_overrides_template_suggestion_with_exact_provenance() {
    let mut manual = evidence("stationery_details", ObservedMilestoneState::Active);
    manual.manual_due_at = Some("2026-05-01T00:00:00Z".to_string());
    manual.manual_date_source_ref = Some("calendar:event:stationery-deadline:v4".to_string());
    let projection = project_wedding_milestones(
        "plan:test",
        "2026-01-01T00:00:00Z",
        Some("2026-12-01T00:00:00Z"),
        vec![manual],
    )
    .expect("projection");
    let item = projection
        .milestones
        .iter()
        .find(|item| item.dependency.milestone_id == milestone_id("stationery_details"))
        .expect("stationery");

    assert_eq!(
        item.dependency.latest_at.as_deref(),
        Some("2026-05-01T00:00:00Z")
    );
    assert_eq!(
        item.date_provenance,
        Some(MilestoneDateProvenance {
            authority: MilestoneDateAuthority::Manual,
            source_ref: "calendar:event:stationery-deadline:v4".to_string(),
        })
    );
}

#[test]
fn completed_and_waived_milestones_remain_in_history_but_leave_active_path() {
    let projection = project_wedding_milestones(
        "plan:test",
        "2026-08-01T00:00:00Z",
        Some("2026-12-01T00:00:00Z"),
        vec![
            evidence("guest_count_draft", ObservedMilestoneState::Complete),
            evidence("accommodation_blocks", ObservedMilestoneState::Waived),
        ],
    )
    .expect("projection");

    let guest = projection
        .milestones
        .iter()
        .find(|item| item.dependency.milestone_id == milestone_id("guest_count_draft"))
        .unwrap();
    let accommodation = projection
        .milestones
        .iter()
        .find(|item| item.dependency.milestone_id == milestone_id("accommodation_blocks"))
        .unwrap();
    assert_eq!(guest.dependency.state, MilestoneState::Complete);
    assert_eq!(accommodation.dependency.state, MilestoneState::Waived);
    assert!(guest.dependency.slack_days.is_none());
    assert!(accommodation.dependency.slack_days.is_none());
    assert_ne!(
        projection
            .selected_path_item
            .as_ref()
            .map(|value| value.milestone_id.as_str()),
        Some(guest.dependency.milestone_id.as_str())
    );
}

#[test]
fn cycle_and_missing_predecessor_are_projected_as_blockers() {
    let definition = |id: &str, depends_on: Vec<&str>| MilestoneDefinition {
        milestone_id: id.to_string(),
        depends_on: depends_on.into_iter().map(str::to_string).collect(),
        duration_or_lead_time: DurationRange {
            minimum_days: 1,
            maximum_days: 1,
            evidence_ref: format!("template:test:{id}"),
        },
        suggested_latest_offset_days: 0,
        prepared_next_action: None,
    };
    let projection = project_milestone_graph(
        "test.milestones.v1",
        &MilestoneGraphInput {
            plan_id: "plan:test".to_string(),
            anchor_at: "2026-01-01T00:00:00Z".to_string(),
            horizon_at: Some("2026-02-01T00:00:00Z".to_string()),
            definitions: vec![
                definition("milestone:a", vec!["milestone:b"]),
                definition("milestone:b", vec!["milestone:a"]),
                definition("milestone:c", vec!["milestone:absent"]),
                definition("milestone:d", vec!["milestone:a"]),
            ],
            evidence: vec![],
        },
    )
    .expect("blocked projection");

    assert!(
        projection
            .blockers
            .iter()
            .any(|value| value.kind == MilestoneBlockerKind::Cycle)
    );
    assert!(
        projection
            .blockers
            .iter()
            .any(|value| value.kind == MilestoneBlockerKind::PredecessorMissing)
    );
    assert!(!projection.blockers.iter().any(|value| {
        value.milestone_id == "milestone:d" && value.kind == MilestoneBlockerKind::Cycle
    }));
    assert!(projection.blockers.iter().any(|value| {
        value.milestone_id == "milestone:d"
            && value.kind == MilestoneBlockerKind::PredecessorBlocked
    }));
    assert!(projection.selected_path_item.is_none());
}

#[test]
fn unresolved_source_state_blocks_descendants_instead_of_guessing_completion() {
    let projection = project_wedding_milestones(
        "plan:test",
        "2026-01-01T00:00:00Z",
        Some("2026-12-01T00:00:00Z"),
        vec![evidence(
            "guest_count_draft",
            ObservedMilestoneState::Unknown,
        )],
    )
    .expect("blocked projection");

    assert!(projection.blockers.iter().any(|value| {
        value.milestone_id == milestone_id("guest_count_draft")
            && value.kind == MilestoneBlockerKind::SourceStateUnresolved
    }));
    assert!(projection.blockers.iter().any(|value| {
        value.milestone_id == milestone_id("invitations_ready")
            && value.kind == MilestoneBlockerKind::PredecessorBlocked
    }));
}

#[test]
fn only_computed_zero_or_negative_slack_is_called_critical() {
    let projection = project_wedding_milestones(
        "plan:test",
        "2026-10-01T00:00:00Z",
        Some("2026-12-01T00:00:00Z"),
        vec![],
    )
    .expect("projection");
    let selected = projection.selected_path_item.expect("selected path item");

    assert!(selected.slack_days <= 0);
    assert_eq!(selected.urgency, PathUrgency::Critical);
}

#[test]
fn prepared_actions_are_data_only_and_attached_to_at_most_one_selected_item() {
    let projection = project_wedding_milestones(
        "plan:test",
        "2026-07-01T00:00:00Z",
        Some("2026-12-01T00:00:00Z"),
        vec![],
    )
    .expect("projection");
    let prepared = projection
        .milestones
        .iter()
        .filter(|item| item.dependency.prepared_next_action.is_some())
        .count();

    assert!(prepared <= 1);
    if let Some(selected) = projection.selected_path_item {
        assert!(selected.prepared_next_action.is_some());
        assert_eq!(
            selected.prepared_next_action,
            projection
                .milestones
                .iter()
                .find(|item| item.dependency.milestone_id == selected.milestone_id)
                .unwrap()
                .dependency
                .prepared_next_action
        );
    }
}

#[test]
fn conflicting_source_records_block_regardless_of_input_order() {
    let active = evidence("guest_count_draft", ObservedMilestoneState::Active);
    let mut complete = evidence("guest_count_draft", ObservedMilestoneState::Complete);
    complete.source_ref = "calendar:guest-count".to_string();
    complete.source_revision_ref = "calendar:guest-count:v2".to_string();
    complete.source_kind = MilestoneEvidenceSourceKind::Calendar;
    let first = project_wedding_milestones(
        "plan:test",
        "2026-01-01T00:00:00Z",
        Some("2026-12-01T00:00:00Z"),
        vec![active.clone(), complete.clone()],
    )
    .unwrap();
    let second = project_wedding_milestones(
        "plan:test",
        "2026-01-01T00:00:00Z",
        Some("2026-12-01T00:00:00Z"),
        vec![complete, active],
    )
    .unwrap();
    let state = |projection: &MilestonePlanProjection| {
        projection
            .milestones
            .iter()
            .find(|item| item.dependency.milestone_id == milestone_id("guest_count_draft"))
            .unwrap()
            .dependency
            .state
            .clone()
    };

    assert_eq!(state(&first), MilestoneState::Blocked);
    assert_eq!(state(&second), MilestoneState::Blocked);
    assert_eq!(first.projection_id, second.projection_id);
}

#[test]
fn input_order_does_not_change_projection_identity() {
    let first = project_wedding_milestones(
        "plan:test",
        "2026-01-01T00:00:00Z",
        Some("2026-12-01T00:00:00Z"),
        vec![
            evidence("stationery_details", ObservedMilestoneState::Active),
            evidence("guest_count_draft", ObservedMilestoneState::Complete),
        ],
    )
    .unwrap();
    let second = project_wedding_milestones(
        "plan:test",
        "2026-01-01T00:00:00Z",
        Some("2026-12-01T00:00:00Z"),
        vec![
            evidence("guest_count_draft", ObservedMilestoneState::Complete),
            evidence("stationery_details", ObservedMilestoneState::Active),
        ],
    )
    .unwrap();

    assert_eq!(first.projection_id, second.projection_id);
    assert_eq!(first, second);
}
