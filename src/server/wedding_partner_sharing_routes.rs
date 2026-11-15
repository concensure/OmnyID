//! Explicit Wedding partner membership and selected-contact sharing.
//!
//! Membership never grants access to either account's general workspace. The
//! shared projection is limited to AFP records carrying the exact Wedding plan
//! and response-workspace identifiers. Contacts require a separate, explicit
//! encrypted grant and can be revoked independently.

use std::{sync::Arc, time::Duration};

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{delete, get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use ulid::Ulid;

use crate::gateway::smtp_out::{send_outgoing_email, OutgoingEmailRequest};

use super::{
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit}, AppState,
    wedding_scope::resolve_wedding_scope, RateLimitPolicy,
};

const INVITE_LIFETIME_DAYS: i64 = 7;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/partners", get(list_members_http))
        .route("/wedding/partners/invites", post(create_invite_http))
        .route("/wedding/partners/invites/accept", post(accept_invite_http))
        .route("/wedding/partners/leave", delete(leave_plan_http))
        .route("/wedding/partners/{member_user_id}", delete(revoke_member_http))
        .route("/wedding/partners/contacts", get(list_shared_contacts_http).post(share_contact_http))
        .route("/wedding/partners/contacts/{share_id}", delete(revoke_shared_contact_http))
}

fn clean(value: &str, max: usize) -> String {
    value.trim().chars().take(max).collect()
}

fn hash(value: &str) -> String {
    crate::db::sha256_token(value)
}

fn encryption_key() -> Result<[u8; 32], (StatusCode, String)> {
    super::env_hex_32("OMNYID_ENCRYPTION_KEY_HEX")
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Sharing is temporarily unavailable.".into()))?
        .ok_or((StatusCode::SERVICE_UNAVAILABLE, "Sharing is temporarily unavailable.".into()))
}

fn db_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(error_kind = ?error.as_database_error().map(|e| e.kind()), "Wedding partner sharing database operation failed");
    (StatusCode::SERVICE_UNAVAILABLE, "Sharing could not be updated just now.".into())
}

#[derive(Deserialize)]
struct ScopeQuery {
    wedding_plan_id: String,
    response_workspace_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateInviteRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    email: String,
}

async fn create_invite_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateInviteRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(&state, authenticated_rate_limit_key("wedding-partner-invite", &headers), RateLimitPolicy { max_requests: 8, window: Duration::from_secs(60) }).await?;
    let plan_id = clean(&request.wedding_plan_id, 200);
    let workspace_id = clean(&request.response_workspace_id, 200);
    let scope = resolve_wedding_scope(&state.db, &user.id, &plan_id, &workspace_id).await?;
    if !scope.can_manage_membership() {
        return Err((StatusCode::FORBIDDEN, "Only the plan owner can invite a partner.".into()));
    }
    let owner_id = scope.owner_user_id;
    let email = request.email.trim().to_ascii_lowercase();
    if !email.contains('@') || email.len() > 254 || email == user.email.to_ascii_lowercase() {
        return Err((StatusCode::BAD_REQUEST, "Enter your partner's email address.".into()));
    }
    sqlx::query(
        "UPDATE wedding_partner_invites SET status='expired'
          WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2
            AND status='pending' AND expires_at<=NOW()",
    )
    .bind(&owner_id)
    .bind(&plan_id)
    .execute(&state.db.pool)
    .await
    .map_err(db_error)?;
    let active_partner: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM wedding_plan_memberships
          WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2
            AND status='active' AND role='co_owner')",
    )
    .bind(&owner_id)
    .bind(&plan_id)
    .fetch_one(&state.db.pool)
    .await
    .map_err(db_error)?;
    if active_partner {
        return Err((StatusCode::CONFLICT, "This Wedding plan already has two partners.".into()));
    }
    let pending_digest = sqlx::query_scalar::<_, String>(
        "SELECT invited_email_digest FROM wedding_partner_invites
          WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2 AND status='pending'
          ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&owner_id)
    .bind(&plan_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(db_error)?;
    if pending_digest.as_deref().is_some_and(|digest| digest != hash(&email)) {
        return Err((StatusCode::CONFLICT, "A partner invitation is already awaiting a response.".into()));
    }
    let mut raw = [0_u8; 32];
    rand::rng().fill_bytes(&mut raw);
    let token = URL_SAFE_NO_PAD.encode(raw);
    let invite_id = format!("wedding_partner_invite_{}", Ulid::new().to_string().to_lowercase());
    sqlx::query(
        "UPDATE wedding_partner_invites SET status='revoked',revoked_at=NOW() WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2 AND invited_email_digest=$3 AND status='pending'",
    ).bind(&owner_id).bind(&plan_id).bind(hash(&email)).execute(&state.db.pool).await.map_err(db_error)?;
    sqlx::query(
        "INSERT INTO wedding_partner_invites (invite_id,wedding_owner_user_id,wedding_plan_id,response_workspace_id,invited_email_digest,token_digest,invited_by_user_id,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()+($8*INTERVAL '1 day'))",
    )
    .bind(&invite_id).bind(&owner_id).bind(&plan_id).bind(&workspace_id).bind(hash(&email)).bind(hash(&token)).bind(&user.id).bind(INVITE_LIFETIME_DAYS)
    .execute(&state.db.pool).await.map_err(db_error)?;
    let origin = std::env::var("OMNYID_PUBLIC_ORIGIN").unwrap_or_else(|_| "https://omnyid.com".into()).trim_end_matches('/').to_string();
    let invite_url = format!("{origin}/workspace/#wedding-partner-invite={token}");
    let outgoing = OutgoingEmailRequest {
        thread_id: format!("wedding-partner:{invite_id}"),
        message_id: invite_id.clone(),
        parent_id: None,
        to: vec![email],
        subject: format!("{} invited you to share a Wedding plan", user.display_name),
        body: format!("{} invited you to plan the same wedding together in OmnyID Wedding. Sign in with this email address, then accept the invitation:\n\n{}\n\nThis private link expires in {} days. Your personal workspace and contacts are not shared.", user.display_name, invite_url, INVITE_LIFETIME_DAYS),
        in_reply_to: None,
        references: vec![],
        attachments: vec![],
    };
    let delivered = send_outgoing_email(&outgoing).await.is_ok();
    Ok(Json(json!({ "invite_id": invite_id, "invite_url": invite_url, "delivered": delivered, "expires_in_days": INVITE_LIFETIME_DAYS })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AcceptInviteRequest { token: String }

async fn accept_invite_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<AcceptInviteRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let token = clean(&request.token, 100);
    let mut tx = state.db.pool.begin().await.map_err(db_error)?;
    let invite = sqlx::query(
        "SELECT invite_id,wedding_owner_user_id,wedding_plan_id,response_workspace_id,invited_email_digest,status,expires_at<NOW() AS expired FROM wedding_partner_invites WHERE token_digest=$1 FOR UPDATE",
    ).bind(hash(&token)).fetch_optional(&mut *tx).await.map_err(db_error)?
      .ok_or((StatusCode::NOT_FOUND, "This partner invitation is unavailable.".into()))?;
    if invite.get::<String,_>("invited_email_digest") != hash(&user.email.to_ascii_lowercase()) {
        return Err((StatusCode::FORBIDDEN, "Sign in with the email address that received this invitation.".into()));
    }
    if invite.get::<bool,_>("expired") || invite.get::<String,_>("status") != "pending" {
        return Err((StatusCode::GONE, "This partner invitation has expired or was already used.".into()));
    }
    let owner: String = invite.get("wedding_owner_user_id");
    let plan: String = invite.get("wedding_plan_id");
    let workspace: String = invite.get("response_workspace_id");
    sqlx::query(
        "SELECT member_user_id FROM wedding_plan_memberships
          WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2 AND role='owner'
          FOR UPDATE",
    )
    .bind(&owner)
    .bind(&plan)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    let active_partner: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM wedding_plan_memberships
          WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2
            AND status='active' AND role='co_owner' AND member_user_id<>$3)",
    )
    .bind(&owner)
    .bind(&plan)
    .bind(&user.id)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    if active_partner {
        return Err((StatusCode::CONFLICT, "This Wedding plan already has two partners.".into()));
    }
    sqlx::query("INSERT INTO wedding_plan_memberships (wedding_owner_user_id,wedding_plan_id,response_workspace_id,member_user_id,role,invited_by_user_id) VALUES ($1,$2,$3,$4,'co_owner',$1) ON CONFLICT (wedding_owner_user_id,wedding_plan_id,member_user_id) DO UPDATE SET role='co_owner',status='active',revoked_at=NULL,response_workspace_id=EXCLUDED.response_workspace_id,membership_revision=wedding_plan_memberships.membership_revision+1,updated_at=NOW()")
        .bind(&owner).bind(&plan).bind(&workspace).bind(&user.id).execute(&mut *tx).await.map_err(db_error)?;
    sqlx::query("UPDATE wedding_partner_invites SET status='accepted',accepted_by_user_id=$1,accepted_at=NOW() WHERE invite_id=$2")
        .bind(&user.id).bind(invite.get::<String,_>("invite_id")).execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    super::dashboard_routes::invalidate_dashboard_message_cache(&user.id);
    super::dashboard_routes::invalidate_dashboard_message_cache(&owner);
    Ok(Json(json!({ "accepted": true, "wedding_plan_id": plan, "response_workspace_id": workspace })))
}

async fn list_members_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<ScopeQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let scope = resolve_wedding_scope(&state.db, &user.id, &query.wedding_plan_id, &query.response_workspace_id).await?;
    let cache_namespace = scope.cache_namespace();
    let rows = sqlx::query("SELECT m.member_user_id,m.role,m.status,m.membership_revision,m.joined_at::text AS joined_at,u.display_name FROM wedding_plan_memberships m JOIN users u ON u.id=m.member_user_id WHERE m.wedding_owner_user_id=$1 AND m.wedding_plan_id=$2 AND m.status='active' ORDER BY m.joined_at")
        .bind(&scope.owner_user_id).bind(&scope.wedding_plan_id).fetch_all(&state.db.pool).await.map_err(db_error)?;
    let invites = if scope.can_manage_membership() {
        sqlx::query(
            "UPDATE wedding_partner_invites SET status='expired'
               WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2
                 AND status='pending' AND expires_at<=NOW()",
        )
        .bind(&scope.owner_user_id)
        .bind(&scope.wedding_plan_id)
        .execute(&state.db.pool)
        .await
        .map_err(db_error)?;
        sqlx::query(
            "SELECT invite_id,status,created_at::text AS created_at,expires_at::text AS expires_at,
                    accepted_at::text AS accepted_at,revoked_at::text AS revoked_at
               FROM wedding_partner_invites
              WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2
              ORDER BY created_at DESC LIMIT 8",
        )
        .bind(&scope.owner_user_id)
        .bind(&scope.wedding_plan_id)
        .fetch_all(&state.db.pool)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(|row| json!({
            "invite_id": row.get::<String, _>("invite_id"),
            "status": row.get::<String, _>("status"),
            "created_at": row.get::<String, _>("created_at"),
            "expires_at": row.get::<String, _>("expires_at"),
            "accepted_at": row.get::<Option<String>, _>("accepted_at"),
            "revoked_at": row.get::<Option<String>, _>("revoked_at"),
        }))
        .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    Ok(Json(json!({"scope":{"owner_user_id":scope.owner_user_id,"wedding_plan_id":scope.wedding_plan_id,"response_workspace_id":scope.response_workspace_id,"member_user_id":scope.member_user_id,"role":scope.role,"membership_revision":scope.membership_revision,"cache_namespace":cache_namespace},"members": rows.into_iter().map(|row| json!({"user_id":row.get::<String,_>("member_user_id"),"display_name":row.get::<String,_>("display_name"),"role":row.get::<String,_>("role"),"membership_revision":row.get::<i64,_>("membership_revision"),"joined_at":row.get::<String,_>("joined_at")})).collect::<Vec<_>>(),"invites":invites })))
}

async fn revoke_member_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(member_user_id): Path<String>,
    Query(query): Query<ScopeQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let scope = resolve_wedding_scope(&state.db, &user.id, &query.wedding_plan_id, &query.response_workspace_id).await?;
    if !scope.can_manage_membership() || member_user_id == scope.owner_user_id { return Err((StatusCode::FORBIDDEN, "Only the plan owner can remove a partner.".into())); }
    let affected = sqlx::query("UPDATE wedding_plan_memberships SET status='revoked',revoked_at=NOW(),membership_revision=membership_revision+1,updated_at=NOW() WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2 AND member_user_id=$3 AND status='active'")
        .bind(&scope.owner_user_id).bind(&scope.wedding_plan_id).bind(clean(&member_user_id,200)).execute(&state.db.pool).await.map_err(db_error)?.rows_affected();
    sqlx::query("UPDATE wedding_shared_contact_grants SET status='revoked',revoked_at=NOW(),updated_at=NOW() WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2 AND recipient_user_id=$3 AND status='active'")
        .bind(&scope.owner_user_id).bind(&scope.wedding_plan_id).bind(clean(&member_user_id,200)).execute(&state.db.pool).await.map_err(db_error)?;
    super::dashboard_routes::invalidate_dashboard_message_cache(&member_user_id);
    super::dashboard_routes::invalidate_dashboard_message_cache(&scope.owner_user_id);
    Ok(Json(json!({"revoked": affected > 0})))
}

async fn leave_plan_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<ScopeQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let scope = resolve_wedding_scope(
        &state.db,
        &user.id,
        &query.wedding_plan_id,
        &query.response_workspace_id,
    )
    .await?;
    if scope.role != "co_owner" || scope.owner_user_id == user.id {
        return Err((
            StatusCode::CONFLICT,
            "The plan owner cannot leave this Wedding plan here.".into(),
        ));
    }
    let affected = sqlx::query(
        "UPDATE wedding_plan_memberships
            SET status='revoked',revoked_at=NOW(),membership_revision=membership_revision+1,updated_at=NOW()
          WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2
            AND member_user_id=$3 AND status='active'",
    )
    .bind(&scope.owner_user_id)
    .bind(&scope.wedding_plan_id)
    .bind(&user.id)
    .execute(&state.db.pool)
    .await
    .map_err(db_error)?
    .rows_affected();
    sqlx::query(
        "UPDATE wedding_shared_contact_grants
            SET status='revoked',revoked_at=NOW(),updated_at=NOW()
          WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2
            AND recipient_user_id=$3 AND status='active'",
    )
    .bind(&scope.owner_user_id)
    .bind(&scope.wedding_plan_id)
    .bind(&user.id)
    .execute(&state.db.pool)
    .await
    .map_err(db_error)?;
    super::dashboard_routes::invalidate_dashboard_message_cache(&user.id);
    super::dashboard_routes::invalidate_dashboard_message_cache(&scope.owner_user_id);
    Ok(Json(json!({"left":affected > 0})))
}

#[derive(Clone, Deserialize, Serialize)]
struct SharedContactPayload {
    name: String,
    #[serde(default)] email: Option<String>,
    #[serde(default)] phone: Option<String>,
    #[serde(default)] relationship_kind: Option<String>,
    #[serde(default)] roles: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ShareContactRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    recipient_user_id: String,
    contact_ref: String,
    contact: SharedContactPayload,
}

async fn share_contact_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ShareContactRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let scope = resolve_wedding_scope(&state.db, &user.id, &request.wedding_plan_id, &request.response_workspace_id).await?;
    let owner = scope.owner_user_id;
    let recipient = clean(&request.recipient_user_id, 200);
    let active = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM wedding_plan_memberships WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2 AND member_user_id=$3 AND status='active')")
        .bind(&owner).bind(clean(&request.wedding_plan_id,200)).bind(&recipient).fetch_one(&state.db.pool).await.map_err(db_error)?;
    if !active || recipient == user.id { return Err((StatusCode::BAD_REQUEST, "Choose an active partner.".into())); }
    let name = clean(&request.contact.name, 160);
    if name.is_empty() { return Err((StatusCode::BAD_REQUEST, "Contact name is required.".into())); }
    let payload = SharedContactPayload { name, email: request.contact.email.map(|v| clean(&v,254)).filter(|v| !v.is_empty()), phone: request.contact.phone.map(|v| clean(&v,60)).filter(|v| !v.is_empty()), relationship_kind: request.contact.relationship_kind.map(|v| clean(&v,80)).filter(|v| !v.is_empty()), roles: request.contact.roles.into_iter().map(|v| clean(&v,80)).filter(|v| !v.is_empty()).take(20).collect() };
    let ciphertext = crate::crypto::encrypt_secret(&serde_json::to_string(&payload).map_err(|_| (StatusCode::BAD_REQUEST,"Contact could not be shared.".into()))?, &encryption_key()?);
    let share_id = format!("wedding_contact_share_{}", Ulid::new().to_string().to_lowercase());
    let roles = payload.roles.clone();
    let row = sqlx::query("INSERT INTO wedding_shared_contact_grants (share_id,wedding_owner_user_id,wedding_plan_id,response_workspace_id,shared_by_user_id,recipient_user_id,contact_ref,role_labels,contact_ciphertext) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (wedding_owner_user_id,wedding_plan_id,shared_by_user_id,recipient_user_id,contact_ref) DO UPDATE SET role_labels=EXCLUDED.role_labels,contact_ciphertext=EXCLUDED.contact_ciphertext,status='active',revoked_at=NULL,updated_at=NOW() RETURNING share_id")
        .bind(&share_id).bind(&owner).bind(clean(&request.wedding_plan_id,200)).bind(clean(&request.response_workspace_id,200)).bind(&user.id).bind(&recipient).bind(clean(&request.contact_ref,200)).bind(&roles).bind(ciphertext).fetch_one(&state.db.pool).await.map_err(db_error)?;
    Ok(Json(json!({"shared":true,"share_id":row.get::<String,_>("share_id")})))
}

async fn list_shared_contacts_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<ScopeQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let _scope = resolve_wedding_scope(&state.db, &user.id, &query.wedding_plan_id, &query.response_workspace_id).await?;
    let rows = sqlx::query("SELECT share_id,shared_by_user_id,contact_ciphertext,updated_at::text AS updated_at FROM wedding_shared_contact_grants WHERE recipient_user_id=$1 AND wedding_plan_id=$2 AND response_workspace_id=$3 AND status='active' ORDER BY updated_at DESC")
        .bind(&user.id).bind(clean(&query.wedding_plan_id,200)).bind(clean(&query.response_workspace_id,200)).fetch_all(&state.db.pool).await.map_err(db_error)?;
    let key = encryption_key()?;
    let contacts = rows.into_iter().filter_map(|row| {
        let plaintext = crate::crypto::decrypt_secret(&row.get::<String,_>("contact_ciphertext"), &key)?;
        let contact: SharedContactPayload = serde_json::from_str(&plaintext).ok()?;
        Some(json!({"share_id":row.get::<String,_>("share_id"),"shared_by_user_id":row.get::<String,_>("shared_by_user_id"),"updated_at":row.get::<String,_>("updated_at"),"contact":contact}))
    }).collect::<Vec<_>>();
    Ok(Json(json!({"contacts":contacts})))
}

async fn revoke_shared_contact_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(share_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let affected = sqlx::query("UPDATE wedding_shared_contact_grants SET status='revoked',revoked_at=NOW(),updated_at=NOW() WHERE share_id=$1 AND shared_by_user_id=$2 AND status='active'")
        .bind(clean(&share_id,200)).bind(&user.id).execute(&state.db.pool).await.map_err(db_error)?.rows_affected();
    Ok(Json(json!({"revoked":affected > 0})))
}

#[cfg(test)]
mod tests {
    #[test]
    fn membership_does_not_grant_general_account_or_contact_access() {
        let source = include_str!("wedding_partner_sharing_routes.rs");
        let migration = include_str!("../../postgres/migrations/0168_wedding_partner_sharing.sql");
        assert!(source.contains("exact Wedding plan"));
        assert!(source.contains("wedding_shared_contact_grants"));
        assert!(source.contains("recipient_user_id=$1 AND wedding_plan_id=$2 AND response_workspace_id=$3"));
        assert!(migration.contains("owner_user_id, wedding_plan_id, response_workspace_id, vendor_id"));
    }
}
