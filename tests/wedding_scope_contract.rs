const MIGRATION: &str = include_str!("../postgres/migrations/0171_wedding_scope_revision.sql");
const SCOPE: &str = include_str!("../src/server/wedding_scope.rs");
const PARTNER_ROUTES: &str = include_str!("../src/server/wedding_partner_sharing_routes.rs");
const RUNSHEET_ROUTES: &str = include_str!("../src/server/wedding_runsheet_projection_routes.rs");
const DECISION_RESEARCH_ROUTES: &str =
    include_str!("../src/server/wedding_decision_research_routes.rs");
const TASK_ASSIGNMENT_ROUTES: &str =
    include_str!("../src/server/wedding_task_assignment_routes.rs");
const TASK_ASSIGNMENT_ACTOR_MIGRATION: &str =
    include_str!("../postgres/migrations/0176_wedding_task_assignment_actor.sql");
const SERVER: &str = include_str!("../src/server/mod.rs");

#[test]
fn canonical_scope_is_server_derived_and_revisioned() {
    assert!(MIGRATION.contains("membership_revision BIGINT NOT NULL DEFAULT 1"));
    assert!(MIGRATION.contains("member_user_id, wedding_plan_id, response_workspace_id"));
    assert!(SCOPE.contains("WHERE wedding_plan_id=$1 AND response_workspace_id=$2"));
    assert!(SCOPE.contains("AND member_user_id=$3 AND status='active'"));
    assert!(SCOPE.contains("membership_revision"));
    assert!(SCOPE.contains("cache_namespace"));
    assert!(!SCOPE.contains("owner_user_id: &str"));
}

#[test]
fn partner_routes_reuse_scope_without_broadening_personal_data() {
    assert!(PARTNER_ROUTES.contains("resolve_wedding_scope"));
    assert!(!PARTNER_ROUTES.contains("async fn require_scope_access"));
    assert!(PARTNER_ROUTES.contains("membership_revision=membership_revision+1"));
    assert!(PARTNER_ROUTES.contains("wedding_shared_contact_grants"));
    assert!(
        PARTNER_ROUTES
            .contains("contact_grant.recipient_user_id=$1 OR contact_grant.shared_by_user_id=$1")
    );
    assert!(
        PARTNER_ROUTES.contains(
            "contact_grant.wedding_owner_user_id=$2 AND contact_grant.wedding_plan_id=$3"
        )
    );
    assert!(PARTNER_ROUTES.contains("shared_by_user_id=$2 AND wedding_owner_user_id=$3"));
    assert!(SERVER.contains("mod wedding_scope;"));
}

#[test]
fn run_sheet_projection_resolves_canonical_scope_before_owner_storage() {
    assert!(RUNSHEET_ROUTES.contains("resolve_wedding_scope"));
    assert!(RUNSHEET_ROUTES.contains("&scope.owner_user_id"));
    assert!(RUNSHEET_ROUTES.contains("&scope.response_workspace_id"));
    assert!(!RUNSHEET_ROUTES.contains("commit_wedding_runsheet_projection(&user.id"));
    assert!(
        !RUNSHEET_ROUTES.contains("load_wedding_runsheet_projection_state(\n            &user.id")
    );
}

#[test]
fn decision_research_and_task_delivery_keep_canonical_owner_and_actor_separate() {
    assert!(DECISION_RESEARCH_ROUTES.contains("response_workspace_id"));
    assert!(DECISION_RESEARCH_ROUTES.contains("resolve_wedding_scope"));
    assert!(DECISION_RESEARCH_ROUTES.contains(".bind(&scope.owner_user_id)"));
    assert!(DECISION_RESEARCH_ROUTES.contains("user_id: Some(&actor.id)"));
    assert!(!DECISION_RESEARCH_ROUTES.contains(".bind(&actor.id).bind(&plan)"));

    assert!(TASK_ASSIGNMENT_ROUTES.contains("resolve_wedding_scope"));
    assert!(TASK_ASSIGNMENT_ROUTES.contains(".bind(&scope.owner_user_id)"));
    assert!(TASK_ASSIGNMENT_ROUTES.contains(".bind(&actor.id)"));
    assert!(TASK_ASSIGNMENT_ROUTES.contains("&scope.response_workspace_id"));
    assert!(TASK_ASSIGNMENT_ROUTES.contains("&actor.display_name"));
    assert!(TASK_ASSIGNMENT_ACTOR_MIGRATION.contains("actor_user_id TEXT"));
    assert!(TASK_ASSIGNMENT_ACTOR_MIGRATION.contains("ALTER COLUMN actor_user_id SET NOT NULL"));
}
