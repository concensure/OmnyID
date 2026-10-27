use super::*;
use chrono::{DateTime, Utc};
use std::collections::BTreeSet;

fn now() -> DateTime<Utc> {
    "2026-10-27T00:00:00Z".parse().unwrap()
}
fn fixture() -> (PracticeMembership, PracticeClient) {
    let plan = PlanRef {
        account_id: "couple".into(),
        plan_id: "wedding".into(),
        thread_id: "thread".into(),
    };
    let capabilities: BTreeSet<_> = [
        Resource::ClientIndex,
        Resource::Conversation,
        Resource::Quotation,
        Resource::FinancialSummary,
        Resource::FinancialEvidence,
        Resource::Collaboration,
        Resource::Hold,
        Resource::Tasks,
    ]
    .into_iter()
    .map(|resource| Capability {
        resource,
        action: Action::Read,
    })
    .collect();
    let membership = Grant {
        grant_id: "member".into(),
        practice_id: "practice".into(),
        plan: None,
        resource_id: None,
        subject_account_id: "planner".into(),
        role: Role::LeadPlanner,
        capabilities,
        valid_from: "2026-10-26T00:00:00Z".into(),
        expires_at: None,
        revoked_at: None,
    };
    let member = PracticeMembership {
        practice_id: "practice".into(),
        display_name: "Harbour Events".into(),
        revision: 1,
        grant: membership.clone(),
    };
    let mut grant = membership;
    grant.plan = Some(plan.clone());
    grant.grant_id = "collaboration".into();
    let summary = ClientSummary {
        plan: plan.clone(),
        client_label: "Couple A".into(),
        wedding_date: None,
        stage: ClientStage::Planning,
        assigned_planner_id: Some("planner".into()),
        next_action: Some(NextAction::ReviewQuote),
        next_action_due_at: None,
        unread_count: Some(2),
        action_needed_count: Some(2),
        financial_due: vec![],
        source_projection_version: 3,
    };
    (
        member,
        PracticeClient {
            practice_id: "practice".into(),
            subject_account_id: "planner".into(),
            plan,
            revision: 2,
            grant,
            summary,
        },
    )
}

#[test]
fn entitlement_requires_both_switch_and_exact_account_allowlist() {
    for flag in [None, Some("false"), Some("yes"), Some("TRUE")] {
        assert!(!practice_entitled(flag, "planner", "planner"));
    }
    assert!(practice_entitled(
        Some("true"),
        " other, planner ",
        "planner"
    ));
    assert!(!practice_entitled(
        Some("true"),
        "planner-longer",
        "planner"
    ));
    assert!(!practice_entitled(Some("true"), "*", "planner"));
}

#[test]
fn bootstrap_never_selects_cached_or_first_practice_implicitly() {
    let (m, c) = fixture();
    let initial = project_practice_bootstrap("planner", true, None, &[m], &[c], now());
    assert_eq!(initial.status, "choose_practice");
    assert!(initial.clients.is_empty());
    assert!(initial.next_action.is_none());
    let (m, c) = fixture();
    let hidden = project_practice_bootstrap("planner", false, Some("practice"), &[m], &[c], now());
    assert!(hidden.practices.is_empty());
    assert!(hidden.clients.is_empty());
}

#[test]
fn revoked_expired_cross_tenant_or_cross_practice_records_never_enter_totals() {
    for damage in 0..6 {
        let (mut m, mut c) = fixture();
        match damage {
            0 => m.grant.revoked_at = Some(now().to_rfc3339()),
            1 => c.grant.revoked_at = Some(now().to_rfc3339()),
            2 => c.grant.expires_at = Some(now().to_rfc3339()),
            3 => c.subject_account_id = "another-planner".into(),
            4 => c.grant.plan.as_mut().unwrap().account_id = "other-couple".into(),
            _ => c.practice_id = "other-practice".into(),
        }
        let result =
            project_practice_bootstrap("planner", true, Some("practice"), &[m], &[c], now());
        assert!(result.clients.is_empty());
        assert!(result.next_action.is_none());
    }
}

#[test]
fn deterministic_priority_uses_semantic_time_and_plan_ties() {
    let (m, mut first) = fixture();
    first.summary.next_action_due_at = Some("2026-10-28T11:00:00+11:00".into());
    let (_, mut second) = fixture();
    second.plan.plan_id = "second".into();
    second.summary.plan = second.plan.clone();
    second.grant.plan = Some(second.plan.clone());
    second.summary.next_action_due_at = Some("2026-10-28T01:00:00Z".into());
    let result = project_practice_bootstrap(
        "planner",
        true,
        Some("practice"),
        &[m],
        &[second, first],
        now(),
    );
    assert_eq!(result.clients.len(), 2);
    assert_eq!(result.next_action.unwrap().plan.plan_id, "wedding");
}

#[test]
fn finance_only_sees_allowed_summaries_but_no_hidden_action() {
    let (mut m, mut c) = fixture();
    let caps = BTreeSet::from([Capability {
        resource: Resource::ClientIndex,
        action: Action::Read,
    }]);
    m.grant.role = Role::FinanceOnly;
    m.grant.capabilities = caps.clone();
    c.grant.role = Role::FinanceOnly;
    c.grant.capabilities = caps;
    let result = project_practice_bootstrap("planner", true, Some("practice"), &[m], &[c], now());
    assert_eq!(result.clients.len(), 1);
    assert!(result.next_action.is_none());
    assert!(result.clients[0].summary.unread_count.is_none());
}
