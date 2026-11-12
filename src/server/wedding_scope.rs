//! Canonical Wedding collaboration scope.
//!
//! This is an authorisation value derived by the server, never a client claim.
//! It grants access only to records carrying the exact Wedding plan/workspace
//! tuple and does not grant access to another member's general account data.

use axum::http::StatusCode;
use sqlx::Row;

use crate::db::Db;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct WeddingScope {
    pub owner_user_id: String,
    pub wedding_plan_id: String,
    pub response_workspace_id: String,
    pub member_user_id: String,
    pub role: String,
    pub membership_revision: i64,
}

impl WeddingScope {
    pub(super) fn can_manage_membership(&self) -> bool {
        self.role == "owner" && self.owner_user_id == self.member_user_id
    }

    pub(super) fn cache_namespace(&self) -> String {
        format!(
            "wedding:{}:{}:{}:{}",
            self.owner_user_id,
            self.wedding_plan_id,
            self.response_workspace_id,
            self.membership_revision
        )
    }
}

fn clean_scope_id(value: &str) -> String {
    value.trim().chars().take(200).collect()
}

fn valid_scope_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:.-/".contains(character))
}

fn unavailable() -> (StatusCode, String) {
    (
        StatusCode::FORBIDDEN,
        "This Wedding plan is not available to this account.".into(),
    )
}

fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(
        error_kind = ?error.as_database_error().map(|value| value.kind()),
        "Wedding scope resolution failed"
    );
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Wedding access could not be checked just now.".into(),
    )
}

pub(super) async fn resolve_wedding_scope(
    db: &Db,
    member_user_id: &str,
    wedding_plan_id: &str,
    response_workspace_id: &str,
) -> Result<WeddingScope, (StatusCode, String)> {
    let plan = clean_scope_id(wedding_plan_id);
    let workspace = clean_scope_id(response_workspace_id);
    if !valid_scope_id(&plan) || !valid_scope_id(&workspace) {
        return Err((StatusCode::BAD_REQUEST, "Choose a valid Wedding plan.".into()));
    }

    if let Some(row) = sqlx::query(
        "SELECT wedding_owner_user_id,role,membership_revision
           FROM wedding_plan_memberships
          WHERE wedding_plan_id=$1 AND response_workspace_id=$2
            AND member_user_id=$3 AND status='active'
          LIMIT 1",
    )
    .bind(&plan)
    .bind(&workspace)
    .bind(member_user_id)
    .fetch_optional(&db.pool)
    .await
    .map_err(store_error)?
    {
        return Ok(WeddingScope {
            owner_user_id: row.get("wedding_owner_user_id"),
            wedding_plan_id: plan,
            response_workspace_id: workspace,
            member_user_id: member_user_id.to_string(),
            role: row.get("role"),
            membership_revision: row.get("membership_revision"),
        });
    }

    let owns_plan = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(
             SELECT 1 FROM wedding_user_onboarding_state
              WHERE user_id=$1 AND wedding_plan_id=$2
         )",
    )
    .bind(member_user_id)
    .bind(&plan)
    .fetch_one(&db.pool)
    .await
    .map_err(store_error)?;
    if !owns_plan {
        return Err(unavailable());
    }

    let row = sqlx::query(
        "INSERT INTO wedding_plan_memberships
            (wedding_owner_user_id,wedding_plan_id,response_workspace_id,
             member_user_id,role,invited_by_user_id)
         VALUES ($1,$2,$3,$1,'owner',$1)
         ON CONFLICT (wedding_owner_user_id,wedding_plan_id,member_user_id)
         DO UPDATE SET response_workspace_id=EXCLUDED.response_workspace_id,
                       role='owner',status='active',revoked_at=NULL,
                       membership_revision=CASE
                         WHEN wedding_plan_memberships.status='active'
                          AND wedding_plan_memberships.response_workspace_id=EXCLUDED.response_workspace_id
                         THEN wedding_plan_memberships.membership_revision
                         ELSE wedding_plan_memberships.membership_revision+1 END,
                       updated_at=NOW()
         RETURNING wedding_owner_user_id,role,membership_revision",
    )
    .bind(member_user_id)
    .bind(&plan)
    .bind(&workspace)
    .fetch_one(&db.pool)
    .await
    .map_err(store_error)?;
    Ok(WeddingScope {
        owner_user_id: row.get("wedding_owner_user_id"),
        wedding_plan_id: plan,
        response_workspace_id: workspace,
        member_user_id: member_user_id.to_string(),
        role: row.get("role"),
        membership_revision: row.get("membership_revision"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_ids_are_bounded_and_cache_key_is_revisioned() {
        assert!(valid_scope_id("plan-1"));
        assert!(!valid_scope_id("plan?owner=other"));
        let scope = WeddingScope {
            owner_user_id: "owner".into(),
            wedding_plan_id: "plan".into(),
            response_workspace_id: "workspace".into(),
            member_user_id: "partner".into(),
            role: "co_owner".into(),
            membership_revision: 4,
        };
        assert_eq!(scope.cache_namespace(), "wedding:owner:plan:workspace:4");
        assert!(!scope.can_manage_membership());
    }
}
