use super::*;
use chrono::{DateTime, Utc};
use serde::Serialize;

pub const BOOTSTRAP_VERSION: &str = "practice.bootstrap.v1";

pub struct PracticeMembership {
    pub practice_id: String,
    pub display_name: String,
    pub revision: u64,
    pub grant: Grant,
}

pub struct PracticeClient {
    pub practice_id: String,
    pub subject_account_id: String,
    pub plan: PlanRef,
    pub revision: u64,
    pub grant: Grant,
    pub summary: ClientSummary,
}

#[derive(Clone, Debug, Serialize)]
pub struct PracticeOverview {
    pub practice_id: String,
    pub display_name: String,
    pub role: Role,
    pub membership_revision: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct PracticeClientView {
    pub summary: ClientSummary,
    pub authority: AuthorityRevision,
}

#[derive(Clone, Debug, Serialize)]
pub struct PracticeNextActionCard {
    pub component: &'static str,
    pub plan: PlanRef,
    pub client_label: String,
    pub action: NextAction,
    pub due_at: Option<String>,
    pub owner_account_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct PracticeBootstrap {
    pub schema_version: &'static str,
    pub account_id: String,
    pub professional_planner: bool,
    pub status: &'static str,
    pub practices: Vec<PracticeOverview>,
    pub selected_practice_id: Option<String>,
    pub clients: Vec<PracticeClientView>,
    pub next_action: Option<PracticeNextActionCard>,
    pub generated_at: String,
}

pub fn practice_entitled(flag: Option<&str>, allowlist: &str, account_id: &str) -> bool {
    flag.is_some_and(|v| matches!(v.trim(), "true" | "1"))
        && !account_id.is_empty()
        && allowlist
            .split(',')
            .map(str::trim)
            .any(|id| id == account_id)
}

pub fn active_practice_membership(
    member: &PracticeMembership,
    actor: &str,
    now: DateTime<Utc>,
) -> bool {
    member.revision > 0
        && bounded(&member.practice_id, 180)
        && bounded(&member.display_name, 160)
        && member.grant.practice_id == member.practice_id
        && member.grant.plan.is_none()
        && member.grant.resource_id.is_none()
        && matches!(
            member.grant.role,
            Role::PracticeOwner
                | Role::LeadPlanner
                | Role::Coordinator
                | Role::FinanceOnly
                | Role::ReadOnly
        )
        && !member.grant.capabilities.is_empty()
        && member
            .grant
            .capabilities
            .iter()
            .all(|cap| role_allows(member.grant.role, *cap))
        && super::authority::live(&member.grant, actor, now)
}

fn priority(action: NextAction) -> u8 {
    match action {
        NextAction::ReviewPermission => 0,
        NextAction::ReviewApproval => 1,
        NextAction::ReviewResponse | NextAction::ReviewQuote => 2,
        NextAction::ReviewHold => 3,
        NextAction::ReviewPaymentEvidence => 4,
        NextAction::PrepareFollowUp => 5,
        NextAction::ReviewTask => 6,
    }
}

/// Inputs are current database projections loaded in one repeatable-read snapshot.
/// Never accept these records from the browser. Only the selected practice loads clients.
pub fn project_practice_bootstrap(
    actor: &str,
    entitled: bool,
    selected: Option<&str>,
    memberships: &[PracticeMembership],
    clients: &[PracticeClient],
    now: DateTime<Utc>,
) -> PracticeBootstrap {
    let mut result = PracticeBootstrap {
        schema_version: BOOTSTRAP_VERSION,
        account_id: actor.into(),
        professional_planner: entitled,
        status: "unavailable",
        practices: vec![],
        selected_practice_id: None,
        clients: vec![],
        next_action: None,
        generated_at: now.to_rfc3339(),
    };
    if !entitled {
        return result;
    }
    let mut visible: Vec<_> = memberships
        .iter()
        .filter(|m| active_practice_membership(m, actor, now))
        .collect();
    visible.sort_by(|a, b| a.practice_id.cmp(&b.practice_id));
    result.practices = visible
        .iter()
        .map(|m| PracticeOverview {
            practice_id: m.practice_id.clone(),
            display_name: m.display_name.clone(),
            role: m.grant.role,
            membership_revision: m.revision,
        })
        .collect();
    result.status = if visible.is_empty() {
        "no_practice"
    } else {
        "choose_practice"
    };
    let Some(selected) = selected else {
        return result;
    };
    let Some(member) = visible.into_iter().find(|m| m.practice_id == selected) else {
        result.status = "forbidden";
        return result;
    };
    result.selected_practice_id = Some(selected.into());
    result.status = "ready";
    for client in clients {
        if client.practice_id != selected
            || client.subject_account_id != actor
            || client.plan != client.summary.plan
            || client.revision == 0
        {
            continue;
        }
        let revision = AuthorityRevision {
            membership: member.revision,
            collaboration: client.revision,
        };
        let command = CommandEnvelope {
            schema_version: PRACTICE_COMMAND_VERSION.into(),
            actor_account_id: actor.into(),
            practice_id: selected.into(),
            plan: Some(client.plan.clone()),
            resource_id: "client-index".into(),
            capability: Capability {
                resource: Resource::ClientIndex,
                action: Action::Read,
            },
            expected_authority: revision.clone(),
            expected_projection_version: client.summary.source_projection_version,
            idempotency_key: "bootstrap-read".into(),
        };
        let snapshot = AuthoritySnapshot {
            actor_account_id: actor.into(),
            practice_id: selected.into(),
            plan: Some(client.plan.clone()),
            revision: revision.clone(),
            proof: AuthorityProof::Practice {
                membership: member.grant.clone(),
                collaboration: Some(client.grant.clone()),
            },
        };
        if let Ok(summary) = project_client_summary(
            &snapshot,
            &command,
            &client.summary,
            AccessSurface::Http,
            now,
        ) {
            result.clients.push(PracticeClientView {
                summary,
                authority: revision,
            });
        }
    }
    result.clients.sort_by(|a, b| {
        a.summary
            .plan
            .plan_id
            .cmp(&b.summary.plan.plan_id)
            .then(a.summary.plan.account_id.cmp(&b.summary.plan.account_id))
            .then(a.summary.plan.thread_id.cmp(&b.summary.plan.thread_id))
    });
    let mut actions: Vec<_> = result
        .clients
        .iter()
        .filter_map(|client| client.summary.next_action.map(|action| (client, action)))
        .collect();
    actions.sort_by(|(a, aa), (b, ba)| {
        priority(*aa)
            .cmp(&priority(*ba))
            .then_with(|| {
                let due = |c: &PracticeClientView| {
                    c.summary
                        .next_action_due_at
                        .as_ref()
                        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
                        .map(|v| v.timestamp())
                        .unwrap_or(i64::MAX)
                };
                due(a).cmp(&due(b))
            })
            .then(a.summary.plan.plan_id.cmp(&b.summary.plan.plan_id))
            .then(a.summary.plan.account_id.cmp(&b.summary.plan.account_id))
            .then(a.summary.plan.thread_id.cmp(&b.summary.plan.thread_id))
    });
    result.next_action = actions
        .first()
        .map(|(client, action)| PracticeNextActionCard {
            component: "practice_next_action",
            plan: client.summary.plan.clone(),
            client_label: client.summary.client_label.clone(),
            action: *action,
            due_at: client.summary.next_action_due_at.clone(),
            owner_account_id: client.summary.assigned_planner_id.clone(),
        });
    result
}
