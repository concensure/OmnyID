use super::*;
use chrono::{DateTime, Utc};
use std::collections::BTreeSet;

fn now() -> DateTime<Utc> {
    "2026-10-27T12:00:00Z".parse().unwrap()
}
fn plan() -> PlanRef {
    PlanRef {
        account_id: "couple".into(),
        plan_id: "plan-a".into(),
        thread_id: "thread-a".into(),
    }
}
fn cap(resource: Resource, action: Action) -> Capability {
    Capability { resource, action }
}
fn grant(role: Role, capability: Capability, client: bool) -> Grant {
    Grant {
        grant_id: if client {
            "collaboration"
        } else {
            "membership"
        }
        .into(),
        practice_id: "practice-a".into(),
        plan: client.then(plan),
        resource_id: None,
        subject_account_id: "planner".into(),
        role,
        capabilities: BTreeSet::from([capability]),
        valid_from: "2026-10-26T12:00:00Z".into(),
        expires_at: Some("2026-10-28T12:00:00Z".into()),
        revoked_at: None,
    }
}
fn setup(role: Role, capability: Capability) -> (AuthoritySnapshot, CommandEnvelope) {
    let practice_only = matches!(
        capability.resource,
        Resource::PracticeSettings | Resource::Membership
    );
    let selected_plan = (!practice_only).then(plan);
    let mut client = grant(role, capability, true);
    let proof = match role {
        Role::CoupleOwner | Role::CoupleCoOwner => AuthorityProof::Couple { ownership: client },
        Role::VendorRepresentative => {
            client.resource_id = Some("resource-a".into());
            AuthorityProof::Vendor {
                grant: client,
                resource_id: "resource-a".into(),
            }
        }
        _ => AuthorityProof::Practice {
            membership: grant(role, capability, false),
            collaboration: Some(client),
        },
    };
    let revision = AuthorityRevision {
        membership: 4,
        collaboration: 7,
    };
    let command = CommandEnvelope {
        schema_version: PRACTICE_COMMAND_VERSION.into(),
        actor_account_id: "planner".into(),
        practice_id: "practice-a".into(),
        plan: selected_plan.clone(),
        resource_id: "resource-a".into(),
        capability,
        expected_authority: revision.clone(),
        expected_projection_version: 11,
        idempotency_key: "request-a".into(),
    };
    (
        AuthoritySnapshot {
            actor_account_id: "planner".into(),
            practice_id: "practice-a".into(),
            plan: selected_plan,
            revision,
            proof,
        },
        command,
    )
}

#[test]
fn exhaustive_role_resource_action_matrix() {
    use Resource::*;
    use Role::*;
    let resources = [
        PracticeSettings,
        Membership,
        ClientIndex,
        Plan,
        Tasks,
        Calendar,
        Conversation,
        Documents,
        Guests,
        SensitiveNotes,
        FinancialSummary,
        FinancialEvidence,
        Quotation,
        Hold,
        Booking,
        PaymentTracking,
        Collaboration,
        SupplierProfile,
    ];
    // r=read p=propose e=edit a=assign s=send t=accept c=confirm m=manage.
    let matrix = [
        (
            PracticeOwner,
            [
                "rm", "rm", "rpea", "rpea", "rpea", "rpea", "rps", "rpe", "rpe", "rpe", "r", "rpe",
                "rpt", "rpet", "rp", "rpe", "r", "r",
            ],
        ),
        (
            LeadPlanner,
            [
                "r", "r", "rpea", "rpea", "rpea", "rpea", "rps", "rpe", "rpe", "rpe", "r", "rpe",
                "rpt", "rpet", "rp", "rpe", "r", "r",
            ],
        ),
        (
            Coordinator,
            [
                "", "", "r", "r", "rpea", "rpea", "rps", "rp", "rp", "", "r", "", "rp", "rp", "rp",
                "", "", "r",
            ],
        ),
        (
            FinanceOnly,
            [
                "", "", "r", "", "", "", "", "", "", "", "r", "rpe", "", "", "", "rpe", "", "",
            ],
        ),
        (
            ReadOnly,
            [
                "", "", "r", "r", "r", "r", "r", "r", "r", "r", "r", "r", "r", "r", "r", "r", "",
                "r",
            ],
        ),
        (
            CoupleOwner,
            [
                "", "", "", "rpe", "rpea", "rpea", "rps", "rpe", "rpe", "rpe", "r", "rpe", "rpt",
                "rpt", "rp", "rpe", "rm", "r",
            ],
        ),
        (
            CoupleCoOwner,
            [
                "", "", "", "rpe", "rpea", "rpea", "rps", "rpe", "rpe", "rpe", "r", "rpe", "rpt",
                "rpt", "rp", "rpe", "rm", "r",
            ],
        ),
        (
            VendorRepresentative,
            [
                "", "", "", "", "", "", "rps", "", "", "", "r", "rpe", "rpes", "rpes", "rc", "rpe",
                "", "rpes",
            ],
        ),
    ];
    let actions = [
        (Action::Read, 'r'),
        (Action::Propose, 'p'),
        (Action::Edit, 'e'),
        (Action::Assign, 'a'),
        (Action::Send, 's'),
        (Action::Accept, 't'),
        (Action::Confirm, 'c'),
        (Action::Manage, 'm'),
    ];
    for (role, permissions) in matrix {
        for (resource, permission) in resources.into_iter().zip(permissions) {
            for (action, letter) in actions {
                let capability = cap(resource, action);
                let expected = permission.contains(letter);
                assert_eq!(
                    role_allows(role, capability),
                    expected,
                    "{role:?}/{resource:?}/{action:?}"
                );
                let (snapshot, command) = setup(role, capability);
                assert_eq!(
                    authorize(&snapshot, &command, AccessSurface::Http, now()).is_ok(),
                    expected,
                    "guard {role:?}/{resource:?}/{action:?}"
                );
            }
        }
    }
}

#[test]
fn every_surface_rejects_revocation_expiry_reduction_and_stale_cached_authority() {
    for surface in [
        AccessSurface::Http,
        AccessSurface::Search,
        AccessSurface::Websocket,
        AccessSurface::Cache,
        AccessSurface::Attachment,
        AccessSurface::Export,
    ] {
        for which_grant in [false, true] {
            for damage in 0..8 {
                let (mut snapshot, command) =
                    setup(Role::LeadPlanner, cap(Resource::Documents, Action::Read));
                if let AuthorityProof::Practice {
                    membership,
                    collaboration,
                } = &mut snapshot.proof
                {
                    let grant = if which_grant {
                        collaboration.as_mut().unwrap()
                    } else {
                        membership
                    };
                    match damage {
                        0 => grant.revoked_at = Some("2026-10-27T11:00:00Z".into()),
                        1 => grant.expires_at = Some("2026-10-27T12:00:00Z".into()),
                        2 => grant.capabilities.clear(),
                        3 => grant.valid_from = "2026-10-28T00:00:00Z".into(),
                        4 => grant.subject_account_id = "other-user".into(),
                        5 => grant.practice_id = "other-practice".into(),
                        6 => grant.expires_at = Some("not-a-time".into()),
                        _ => {
                            grant.plan = Some(PlanRef {
                                plan_id: "other-plan".into(),
                                ..plan()
                            })
                        }
                    }
                }
                assert_eq!(
                    authorize(&snapshot, &command, surface, now()),
                    Err(PracticeError::Forbidden)
                );
            }
        }
        let (mut snapshot, command) =
            setup(Role::LeadPlanner, cap(Resource::Documents, Action::Read));
        snapshot.revision.collaboration += 1;
        assert_eq!(
            authorize(&snapshot, &command, surface, now()),
            Err(PracticeError::StaleAuthority)
        );
    }
}

#[test]
fn no_role_or_context_is_implicit_authority() {
    let (mut snapshot, command) = setup(Role::PracticeOwner, cap(Resource::Plan, Action::Read));
    if let AuthorityProof::Practice { collaboration, .. } = &mut snapshot.proof {
        *collaboration = None;
    }
    assert_eq!(
        authorize(&snapshot, &command, AccessSurface::Http, now()),
        Err(PracticeError::Forbidden)
    );
    for field in 0..5 {
        let (snapshot, mut command) = setup(Role::LeadPlanner, cap(Resource::Plan, Action::Read));
        match field {
            0 => command.actor_account_id = "attacker".into(),
            1 => command.practice_id = "other-practice".into(),
            2 => command.plan.as_mut().unwrap().account_id = "other-tenant".into(),
            3 => command.plan.as_mut().unwrap().plan_id = "other-plan".into(),
            _ => command.plan.as_mut().unwrap().thread_id = "other-thread".into(),
        }
        assert_eq!(
            authorize(&snapshot, &command, AccessSurface::Http, now()),
            Err(PracticeError::Forbidden)
        );
    }
    let (snapshot, mut command) = setup(
        Role::VendorRepresentative,
        cap(Resource::Conversation, Action::Read),
    );
    command.resource_id = "another-enquiry".into();
    assert_eq!(
        authorize(&snapshot, &command, AccessSurface::Http, now()),
        Err(PracticeError::Forbidden)
    );
}

#[test]
fn vendor_and_couple_proofs_are_bound_to_the_same_plan_and_subject() {
    for role in [
        Role::VendorRepresentative,
        Role::CoupleOwner,
        Role::CoupleCoOwner,
    ] {
        for damage in 0..4 {
            let (mut snapshot, command) = setup(role, cap(Resource::Conversation, Action::Read));
            let grant = match &mut snapshot.proof {
                AuthorityProof::Vendor { grant, .. } => grant,
                AuthorityProof::Couple { ownership } => ownership,
                _ => unreachable!(),
            };
            match damage {
                0 => grant.plan.as_mut().unwrap().thread_id = "other-thread".into(),
                1 => grant.subject_account_id = "other-user".into(),
                2 => grant.practice_id = "other-practice".into(),
                _ => grant.revoked_at = Some("2026-10-27T00:00:00Z".into()),
            }
            assert_eq!(
                authorize(&snapshot, &command, AccessSurface::Cache, now()),
                Err(PracticeError::Forbidden)
            );
        }
    }
}

#[test]
fn finance_index_scrubs_hidden_activity_and_rechecks_cached_access() {
    let (mut snapshot, command) =
        setup(Role::FinanceOnly, cap(Resource::ClientIndex, Action::Read));
    let source = ClientSummary {
        plan: plan(),
        client_label: "Client A".into(),
        wedding_date: None,
        stage: ClientStage::Planning,
        assigned_planner_id: None,
        next_action: Some(NextAction::ReviewResponse),
        next_action_due_at: Some("2026-10-28T00:00:00Z".into()),
        unread_count: Some(3),
        action_needed_count: Some(5),
        financial_due: vec![FinancialDue {
            amount: crate::quotation::Money {
                amount_minor: 100,
                currency: "AUD".into(),
            },
            due_at: "2026-10-28T00:00:00Z".into(),
        }],
        source_projection_version: 11,
    };
    let projected =
        project_client_summary(&snapshot, &command, &source, AccessSurface::Cache, now()).unwrap();
    assert_eq!(projected.unread_count, None);
    assert_eq!(projected.action_needed_count, None);
    assert_eq!(projected.next_action, None);
    assert_eq!(projected.next_action_due_at, None);
    assert!(projected.financial_due.is_empty());
    if let AuthorityProof::Practice {
        membership,
        collaboration,
    } = &mut snapshot.proof
    {
        membership
            .capabilities
            .insert(cap(Resource::FinancialSummary, Action::Read));
        collaboration
            .as_mut()
            .unwrap()
            .capabilities
            .insert(cap(Resource::FinancialSummary, Action::Read));
    }
    assert_eq!(
        project_client_summary(&snapshot, &command, &source, AccessSurface::Cache, now())
            .unwrap()
            .financial_due
            .len(),
        1
    );
    snapshot.revision.membership += 1;
    assert_eq!(
        project_client_summary(&snapshot, &command, &source, AccessSurface::Cache, now()),
        Err(PracticeError::StaleAuthority)
    );
}

#[test]
fn command_retries_and_conflicts_are_distinct() {
    let (_, command) = setup(Role::LeadPlanner, cap(Resource::Tasks, Action::Edit));
    let digest = "a".repeat(64);
    let other = "b".repeat(64);
    assert_eq!(
        check_command_revision(&command, 11, &digest, None),
        Ok(true)
    );
    assert_eq!(
        check_command_revision(&command, 12, &digest, None),
        Err(PracticeError::StaleProjection)
    );
    assert_eq!(
        check_command_revision(&command, 12, &digest, Some(&digest)),
        Ok(false)
    );
    assert_eq!(
        check_command_revision(&command, 11, &digest, Some(&other)),
        Err(PracticeError::IdempotencyConflict)
    );
    let mut invalid = command;
    invalid.schema_version = "practice.command.v99".into();
    assert_eq!(
        validate_command(&invalid),
        Err(PracticeError::UnsupportedVersion)
    );
}

#[test]
fn digest_binds_actor_context_capability_revision_key_and_payload() {
    let (_, command) = setup(Role::LeadPlanner, cap(Resource::Tasks, Action::Assign));
    let payload = PracticeEventPayload::WorkflowItemAssigned(Assignment {
        workflow_item_id: "task-a".into(),
        assignee_account_id: "planner".into(),
        supersedes_event_id: None,
    });
    let original = command_digest(&command, &payload).unwrap();
    assert_eq!(original.len(), 64);
    assert_eq!(command_digest(&command, &payload).unwrap(), original);
    for field in 0..8 {
        let mut changed = command.clone();
        match field {
            0 => changed.actor_account_id = "other".into(),
            1 => changed.practice_id = "other".into(),
            2 => changed.plan.as_mut().unwrap().account_id = "other".into(),
            3 => changed.plan.as_mut().unwrap().plan_id = "other".into(),
            4 => changed.expected_authority.membership += 1,
            5 => changed.expected_projection_version += 1,
            6 => changed.idempotency_key = "other".into(),
            _ => changed.capability.action = Action::Read,
        }
        assert_ne!(command_digest(&changed, &payload).unwrap(), original);
    }
    let changed = PracticeEventPayload::WorkflowItemAssigned(Assignment {
        workflow_item_id: "task-a".into(),
        assignee_account_id: "other".into(),
        supersedes_event_id: None,
    });
    assert_ne!(command_digest(&command, &changed).unwrap(), original);
}
