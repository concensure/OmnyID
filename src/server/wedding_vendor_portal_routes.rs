//! Remaining verified-vendor portal authorities.
//!
//! These routes extend the canonical owner profile, room/resource, Limited
//! Specials, subscription and AFP-compatible audit stores. They deliberately
//! do not create a parallel vendor CRM or calendar.

use std::{sync::Arc, time::Duration};

use axum::{
    Router,
    http::{HeaderMap, StatusCode},
};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};
use ulid::Ulid;

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    wedding_vendor_claim_routes::valid_slug,
};

mod publication;
mod resources;
mod settings;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum VendorPermission {
    View,
    Publish,
    Calendar,
    Enquiries,
    ManageTeam,
}

#[derive(Clone, Debug)]
pub(super) struct VendorAccess {
    pub vendor_id: String,
    pub vendor_slug: String,
    pub vendor_name: String,
    pub category: String,
    pub owner: bool,
    pub role: String,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .merge(publication::routes())
        .merge(resources::routes())
        .merge(settings::routes())
}

pub(super) async fn require_vendor_access(
    state: &AppState,
    headers: &HeaderMap,
    vendor_slug: &str,
    permission: VendorPermission,
) -> Result<(crate::db::UserRecord, VendorAccess), (StatusCode, String)> {
    enforce_rate_limit(
        state,
        authenticated_rate_limit_key("wedding-vendor-portal", headers),
        RateLimitPolicy {
            max_requests: 90,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, headers).await?;
    let slug = valid_slug(vendor_slug)?;
    let email_verified = state
        .db
        .is_user_email_verified(&user.id)
        .await
        .map_err(database_failure)?;
    let row = sqlx::query(
        r#"SELECT v.vendor_id,v.vendor_slug,v.vendor_name,v.category,v.claimed_by_user_id,
                  m.membership_id,m.role,m.status AS membership_status
           FROM wedding_vendors v
           LEFT JOIN wedding_vendor_memberships m ON m.vendor_id=v.vendor_id
             AND m.status IN ('invited','active')
             AND (m.user_id=$2 OR (m.user_id IS NULL AND lower(m.member_email)=lower($3)))
           WHERE v.vendor_slug=$1 AND v.claim_status='verified' AND v.status='active'
             AND (v.claimed_by_user_id=$2 OR m.membership_id IS NOT NULL)
           ORDER BY CASE WHEN v.claimed_by_user_id=$2 THEN 0 ELSE 1 END
           LIMIT 1"#,
    )
    .bind(&slug)
    .bind(&user.id)
    .bind(&user.email)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or((
        StatusCode::FORBIDDEN,
        "Verified vendor access is required.".to_string(),
    ))?;
    let owner = row
        .get::<Option<String>, _>("claimed_by_user_id")
        .as_deref()
        == Some(user.id.as_str());
    let role = if owner {
        "owner".to_string()
    } else {
        if !email_verified {
            return Err((
                StatusCode::FORBIDDEN,
                "Verify the invited email address before using vendor team access.".to_string(),
            ));
        }
        row.get::<Option<String>, _>("role")
            .unwrap_or_else(|| "viewer".to_string())
    };
    if !role_allows(&role, permission) {
        return Err((
            StatusCode::FORBIDDEN,
            "This vendor role cannot perform that action.".to_string(),
        ));
    }
    if !owner && row.get::<Option<String>, _>("membership_status").as_deref() == Some("invited") {
        sqlx::query(
            "UPDATE wedding_vendor_memberships SET status='active',user_id=$1,accepted_at=COALESCE(accepted_at,NOW()),revision=revision+1,updated_at=NOW() WHERE membership_id=$2 AND status='invited'",
        )
        .bind(&user.id)
        .bind(row.get::<String, _>("membership_id"))
        .execute(&state.db.pool)
        .await
        .map_err(database_failure)?;
    }
    Ok((
        user,
        VendorAccess {
            vendor_id: row.get("vendor_id"),
            vendor_slug: row.get("vendor_slug"),
            vendor_name: row.get("vendor_name"),
            category: row.get("category"),
            owner,
            role,
        },
    ))
}

pub(super) fn role_allows(role: &str, permission: VendorPermission) -> bool {
    if role == "owner" {
        return true;
    }
    if role == "manager" {
        return permission != VendorPermission::ManageTeam;
    }
    match permission {
        VendorPermission::View => matches!(
            role,
            "profile_editor" | "calendar_manager" | "enquiry_manager" | "viewer"
        ),
        VendorPermission::Publish => role == "profile_editor",
        VendorPermission::Calendar => role == "calendar_manager",
        VendorPermission::Enquiries => role == "enquiry_manager",
        VendorPermission::ManageTeam => false,
    }
}

pub(super) fn clean(value: &str, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

pub(super) fn clean_email(value: &str) -> Result<String, (StatusCode, String)> {
    let value = clean(value, 320).to_ascii_lowercase();
    let valid = value.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty() && domain.contains('.') && !domain.contains(' ')
    });
    if !valid {
        return Err((
            StatusCode::BAD_REQUEST,
            "Use a valid team email address.".into(),
        ));
    }
    Ok(value)
}

pub(super) fn dedupe_key(value: &str) -> Result<String, (StatusCode, String)> {
    let value = clean(value, 180);
    if value.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "idempotency_key is too short.".into(),
        ));
    }
    Ok(value)
}

pub(super) async fn record_portal_event(
    tx: &mut Transaction<'_, Postgres>,
    access: &VendorAccess,
    actor_user_id: &str,
    event_kind: &str,
    subject_ref: Option<&str>,
    dedupe: &str,
    metadata: Value,
) -> Result<(), (StatusCode, String)> {
    sqlx::query(
        r#"INSERT INTO wedding_vendor_portal_events
           (event_id,vendor_id,event_kind,actor_user_id,subject_ref,dedupe_key,metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (vendor_id,event_kind,dedupe_key) DO NOTHING"#,
    )
    .bind(Ulid::new().to_string())
    .bind(&access.vendor_id)
    .bind(event_kind)
    .bind(actor_user_id)
    .bind(subject_ref)
    .bind(dedupe)
    .bind(metadata)
    .execute(&mut **tx)
    .await
    .map_err(database_failure)?;
    Ok(())
}

pub(super) fn database_failure(error: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(%error, "vendor portal database operation failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "The vendor portal could not save that change just now.".into(),
    )
}

pub(super) fn portal_summary(access: &VendorAccess) -> Value {
    json!({
        "vendor_id": access.vendor_id,
        "vendor_slug": access.vendor_slug,
        "vendor_name": access.vendor_name,
        "category": access.category,
        "role": access.role,
        "owner": access.owner,
    })
}

pub(super) async fn require_paid_feature(
    state: &AppState,
    vendor_id: &str,
    feature: &str,
) -> Result<(), (StatusCode, String)> {
    let row = sqlx::query("SELECT tier,status FROM vendor_subscriptions WHERE vendor_id=$1")
        .bind(vendor_id)
        .fetch_optional(&state.db.pool)
        .await
        .map_err(database_failure)?;
    let enabled = row.is_some_and(|row| {
        paid_entitlement(
            &row.get::<String, _>("tier"),
            &row.get::<String, _>("status"),
        )
    });
    if enabled {
        Ok(())
    } else {
        Err((
            StatusCode::PAYMENT_REQUIRED,
            format!("{feature} is available on a Founding or Pro vendor plan."),
        ))
    }
}

fn paid_entitlement(tier: &str, status: &str) -> bool {
    matches!(tier, "founding" | "pro") && matches!(status, "active" | "trialing")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vendor_roles_are_capability_scoped() {
        assert!(role_allows("owner", VendorPermission::ManageTeam));
        assert!(role_allows("manager", VendorPermission::Calendar));
        assert!(!role_allows("manager", VendorPermission::ManageTeam));
        assert!(role_allows("profile_editor", VendorPermission::Publish));
        assert!(!role_allows("profile_editor", VendorPermission::Calendar));
        assert!(role_allows("calendar_manager", VendorPermission::Calendar));
        assert!(!role_allows("calendar_manager", VendorPermission::Publish));
        assert!(role_allows("viewer", VendorPermission::View));
        assert!(!role_allows("viewer", VendorPermission::Enquiries));
    }

    #[test]
    fn team_email_and_dedupe_validation_are_bounded() {
        assert_eq!(
            clean_email(" Staff@Example.COM ").unwrap(),
            "staff@example.com"
        );
        assert!(clean_email("not-an-email").is_err());
        assert!(dedupe_key("short").is_err());
        assert_eq!(
            dedupe_key("portal-action-123").unwrap(),
            "portal-action-123"
        );
    }

    #[test]
    fn paid_features_require_an_active_paid_tier() {
        assert!(paid_entitlement("founding", "active"));
        assert!(paid_entitlement("pro", "trialing"));
        assert!(!paid_entitlement("starter", "active"));
        assert!(!paid_entitlement("pro", "past_due"));
    }
}
