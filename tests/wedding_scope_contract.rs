const MIGRATION: &str = include_str!("../postgres/migrations/0171_wedding_scope_revision.sql");
const SCOPE: &str = include_str!("../src/server/wedding_scope.rs");
const PARTNER_ROUTES: &str = include_str!("../src/server/wedding_partner_sharing_routes.rs");
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
    assert!(PARTNER_ROUTES.contains("contact_grant.recipient_user_id=$1 OR contact_grant.shared_by_user_id=$1"));
    assert!(PARTNER_ROUTES.contains("contact_grant.wedding_owner_user_id=$2 AND contact_grant.wedding_plan_id=$3"));
    assert!(PARTNER_ROUTES.contains("shared_by_user_id=$2 AND wedding_owner_user_id=$3"));
    assert!(SERVER.contains("mod wedding_scope;"));
}
