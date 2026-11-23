use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, put},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use ulid::Ulid;

use super::{
    AppState, VendorPermission, clean, clean_email, database_failure, dedupe_key,
    record_portal_event, require_paid_feature, require_vendor_access,
};

#[derive(Deserialize)]
struct VendorQuery {
    vendor_slug: String,
}

#[derive(Deserialize)]
struct InviteInput {
    vendor_slug: String,
    email: String,
    role: String,
    idempotency_key: String,
}

#[derive(Deserialize)]
struct MemberUpdate {
    vendor_slug: String,
    role: Option<String>,
    status: Option<String>,
    expected_revision: u64,
    idempotency_key: String,
}

#[derive(Deserialize)]
struct NotificationInput {
    vendor_slug: String,
    expected_revision: u64,
    new_enquiry: bool,
    follow_up_reminders: bool,
    calendar_freshness: bool,
    expiring_holds: bool,
    publication_updates: bool,
    product_updates: bool,
    idempotency_key: String,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/wedding/vendor/portal/team",
            get(team_http).post(invite_http),
        )
        .route(
            "/api/wedding/vendor/portal/team/{membership_id}",
            put(member_update_http),
        )
        .route(
            "/api/wedding/vendor/portal/notifications",
            get(notifications_http).put(notifications_update_http),
        )
        .route(
            "/api/wedding/vendor/portal/entitlements",
            get(entitlements_http),
        )
}

async fn team_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (_user, access) = require_vendor_access(
        &state,
        &headers,
        &query.vendor_slug,
        VendorPermission::ManageTeam,
    )
    .await?;
    let rows = sqlx::query(
        r#"SELECT membership_id,member_email,role,status,revision,accepted_at::text,
                  created_at::text,updated_at::text
           FROM wedding_vendor_memberships WHERE vendor_id=$1 ORDER BY created_at"#,
    )
    .bind(&access.vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;
    let members = rows
        .into_iter()
        .map(|row| {
            json!({
                "membership_id":row.get::<String,_>("membership_id"),
                "email":row.get::<String,_>("member_email"),
                "role":row.get::<String,_>("role"),"status":row.get::<String,_>("status"),
                "revision":row.get::<i64,_>("revision"),
                "accepted_at":row.get::<Option<String>,_>("accepted_at"),
                "created_at":row.get::<String,_>("created_at"),
            })
        })
        .collect::<Vec<_>>();
    Ok(Json(
        json!({"vendor":super::portal_summary(&access),"members":members}),
    ))
}

async fn invite_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<InviteInput>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) = require_vendor_access(
        &state,
        &headers,
        &body.vendor_slug,
        VendorPermission::ManageTeam,
    )
    .await?;
    require_paid_feature(&state, &access.vendor_id, "Vendor team access").await?;
    let email = clean_email(&body.email)?;
    let role = valid_role(&body.role)?;
    if email == user.email.to_ascii_lowercase() {
        return Err((
            StatusCode::BAD_REQUEST,
            "The listing owner already has access.".into(),
        ));
    }
    let dedupe = dedupe_key(&body.idempotency_key)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if let Some(subject) =
        existing_event_subject(&mut tx, &access.vendor_id, "member_invited", &dedupe).await?
    {
        tx.rollback().await.ok();
        return Ok(Json(json!({"membership_id":subject,"replayed":true})));
    }
    let membership_id = Ulid::new().to_string();
    let known_user = sqlx::query_scalar::<_, String>(
        "SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1",
    )
    .bind(&email)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?;
    let row = sqlx::query(
        r#"INSERT INTO wedding_vendor_memberships
           (membership_id,vendor_id,member_email,user_id,role,status,invited_by_user_id)
           VALUES($1,$2,$3,$4,$5,'invited',$6)
           ON CONFLICT(vendor_id,member_email) DO UPDATE SET role=EXCLUDED.role,
             status='invited',user_id=COALESCE(wedding_vendor_memberships.user_id,EXCLUDED.user_id),
             revoked_at=NULL,revision=wedding_vendor_memberships.revision+1,updated_at=NOW()
           RETURNING membership_id,revision"#,
    )
    .bind(&membership_id)
    .bind(&access.vendor_id)
    .bind(&email)
    .bind(known_user)
    .bind(role)
    .bind(&user.id)
    .fetch_one(&mut *tx)
    .await
    .map_err(database_failure)?;
    let actual_id: String = row.get("membership_id");
    record_portal_event(
        &mut tx,
        &access,
        &user.id,
        "member_invited",
        Some(&actual_id),
        &dedupe,
        json!({"role":role}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    let portal_url = format!(
        "https://omnyid.com/workspace/vendor.html?vendor_slug={}",
        access.vendor_slug
    );
    let invitation = format!(
        "You have been invited to help manage {} on OmnyID Wedding as {}.\n\nSign in with this email address to accept only that scoped access:\n{}",
        access.vendor_name,
        role.replace('_', " "),
        portal_url
    );
    if let Err(error) = crate::gateway::smtp_out::send_transactional_email(
        &email,
        "Vendor team invitation",
        &invitation,
    )
    .await
    {
        tracing::warn!(vendor_id=%access.vendor_id, %error, "vendor team invitation email was not delivered");
    }
    Ok(Json(
        json!({"membership_id":actual_id,"revision":row.get::<i64,_>("revision"),"status":"invited"}),
    ))
}

async fn member_update_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(membership_id): Path<String>,
    Json(body): Json<MemberUpdate>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) = require_vendor_access(
        &state,
        &headers,
        &body.vendor_slug,
        VendorPermission::ManageTeam,
    )
    .await?;
    require_paid_feature(&state, &access.vendor_id, "Vendor team access").await?;
    let role = body.role.as_deref().map(valid_role).transpose()?;
    let status = body.status.as_deref().unwrap_or("active");
    if !matches!(status, "active" | "revoked") {
        return Err((
            StatusCode::BAD_REQUEST,
            "Member status must be active or revoked.".into(),
        ));
    }
    let dedupe = dedupe_key(&body.idempotency_key)?;
    let event_kind = if status == "revoked" {
        "member_revoked"
    } else {
        "member_role_changed"
    };
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if existing_event_subject(&mut tx, &access.vendor_id, event_kind, &dedupe)
        .await?
        .is_some()
    {
        tx.rollback().await.ok();
        return Ok(Json(json!({"membership_id":membership_id,"replayed":true})));
    }
    let row = sqlx::query(
        r#"UPDATE wedding_vendor_memberships SET role=COALESCE($1,role),status=$2,
             revoked_at=CASE WHEN $2='revoked' THEN NOW() ELSE NULL END,
             revision=revision+1,updated_at=NOW()
           WHERE membership_id=$3 AND vendor_id=$4 AND revision=$5 RETURNING revision,role,status"#,
    )
    .bind(role)
    .bind(status)
    .bind(clean(&membership_id, 100))
    .bind(&access.vendor_id)
    .bind(body.expected_revision as i64)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or((
        StatusCode::CONFLICT,
        "This team member changed in another session. Refresh first.".into(),
    ))?;
    record_portal_event(
        &mut tx,
        &access,
        &user.id,
        event_kind,
        Some(&membership_id),
        &dedupe,
        json!({"role":row.get::<String,_>("role"),"status":row.get::<String,_>("status")}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(
        json!({"membership_id":membership_id,"revision":row.get::<i64,_>("revision"),
        "role":row.get::<String,_>("role"),"status":row.get::<String,_>("status")}),
    ))
}

async fn notifications_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) =
        require_vendor_access(&state, &headers, &query.vendor_slug, VendorPermission::View).await?;
    ensure_preferences(&state, &access.vendor_id, &user.id).await?;
    let row = notification_row(&state, &access.vendor_id, &user.id).await?;
    Ok(Json(notification_json(&row)))
}

async fn notifications_update_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<NotificationInput>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, access) =
        require_vendor_access(&state, &headers, &body.vendor_slug, VendorPermission::View).await?;
    ensure_preferences(&state, &access.vendor_id, &user.id).await?;
    let dedupe = dedupe_key(&body.idempotency_key)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if existing_event_subject(
        &mut tx,
        &access.vendor_id,
        "notification_preferences_updated",
        &dedupe,
    )
    .await?
    .is_some()
    {
        tx.rollback().await.ok();
        let row = notification_row(&state, &access.vendor_id, &user.id).await?;
        return Ok(Json(notification_json(&row)));
    }
    let row = sqlx::query(
        r#"UPDATE wedding_vendor_notification_preferences SET new_enquiry=$1,
           follow_up_reminders=$2,calendar_freshness=$3,expiring_holds=$4,
           publication_updates=$5,product_updates=$6,revision=revision+1,updated_at=NOW()
           WHERE vendor_id=$7 AND user_id=$8 AND revision=$9 RETURNING *"#,
    )
    .bind(body.new_enquiry)
    .bind(body.follow_up_reminders)
    .bind(body.calendar_freshness)
    .bind(body.expiring_holds)
    .bind(body.publication_updates)
    .bind(body.product_updates)
    .bind(&access.vendor_id)
    .bind(&user.id)
    .bind(body.expected_revision as i64)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or((
        StatusCode::CONFLICT,
        "Notification settings changed in another session. Refresh first.".into(),
    ))?;
    record_portal_event(
        &mut tx,
        &access,
        &user.id,
        "notification_preferences_updated",
        None,
        &dedupe,
        json!({"revision":row.get::<i64,_>("revision")}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(notification_json(&row)))
}

async fn entitlements_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (_user, access) =
        require_vendor_access(&state, &headers, &query.vendor_slug, VendorPermission::View).await?;
    let row = sqlx::query(
        "SELECT tier,status,current_period_end::text FROM vendor_subscriptions WHERE vendor_id=$1",
    )
    .bind(&access.vendor_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?;
    let (tier, status, period_end) = row
        .map(|row| {
            (
                row.get::<String, _>("tier"),
                row.get::<String, _>("status"),
                row.get::<Option<String>, _>("current_period_end"),
            )
        })
        .unwrap_or_else(|| ("starter".into(), "active".into(), None));
    let advanced = matches!(tier.as_str(), "founding" | "pro")
        && matches!(status.as_str(), "active" | "trialing");
    Ok(Json(
        json!({"tier":tier,"status":status,"current_period_end":period_end,"features":{
        "public_profile":true,"single_calendar":true,"enquiries":true,
        "named_resources":advanced,"bulk_calendar":advanced,"vendor_team":advanced,
        "advanced_notifications":advanced
    },"data_retained_on_downgrade":true}),
    ))
}

async fn ensure_preferences(
    state: &AppState,
    vendor_id: &str,
    user_id: &str,
) -> Result<(), (StatusCode, String)> {
    sqlx::query("INSERT INTO wedding_vendor_notification_preferences(vendor_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING")
        .bind(vendor_id).bind(user_id).execute(&state.db.pool).await.map_err(database_failure)?;
    Ok(())
}

async fn notification_row(
    state: &AppState,
    vendor_id: &str,
    user_id: &str,
) -> Result<sqlx::postgres::PgRow, (StatusCode, String)> {
    sqlx::query(
        "SELECT * FROM wedding_vendor_notification_preferences WHERE vendor_id=$1 AND user_id=$2",
    )
    .bind(vendor_id)
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(database_failure)
}

async fn existing_event_subject(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    vendor_id: &str,
    event_kind: &str,
    dedupe: &str,
) -> Result<Option<Option<String>>, (StatusCode, String)> {
    sqlx::query_scalar(
        "SELECT subject_ref FROM wedding_vendor_portal_events WHERE vendor_id=$1 AND event_kind=$2 AND dedupe_key=$3",
    )
    .bind(vendor_id)
    .bind(event_kind)
    .bind(dedupe)
    .fetch_optional(&mut **tx)
    .await
    .map_err(database_failure)
}

fn notification_json(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "new_enquiry":row.get::<bool,_>("new_enquiry"),"follow_up_reminders":row.get::<bool,_>("follow_up_reminders"),
        "calendar_freshness":row.get::<bool,_>("calendar_freshness"),"expiring_holds":row.get::<bool,_>("expiring_holds"),
        "publication_updates":row.get::<bool,_>("publication_updates"),"product_updates":row.get::<bool,_>("product_updates"),
        "revision":row.get::<i64,_>("revision"),"security_notifications":"always_on"
    })
}

fn valid_role(value: &str) -> Result<&str, (StatusCode, String)> {
    match value {
        "manager" | "profile_editor" | "calendar_manager" | "enquiry_manager" | "viewer" => {
            Ok(value)
        }
        _ => Err((
            StatusCode::BAD_REQUEST,
            "Choose a supported vendor team role.".into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn team_roles_are_bounded() {
        assert!(valid_role("calendar_manager").is_ok());
        assert!(valid_role("owner").is_err());
    }
}
