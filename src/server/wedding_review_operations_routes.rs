//! Operational Wedding review routes.
//!
//! This module completes the narrow invitation, appeal, decision-evidence and
//! aggregate-metrics surfaces without copying review prose out of the existing
//! tenant-private AFP/publication authorities.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use ulid::Ulid;

use crate::gateway::smtp_out::{OutgoingEmailRequest, send_outgoing_email};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user},
    cost_controls::operator_access_allowed,
    enforce_rate_limit,
};

const INVITATION_DAYS: i64 = 21;
const REMINDER_DAYS: i64 = 7;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/admin/wedding/reviews/{review_id}/invitation",
            post(create_invitation_http),
        )
        .route(
            "/admin/wedding/reviews/invitations/remind",
            post(remind_invitations_http),
        )
        .route(
            "/admin/wedding/reviews/operations/metrics",
            get(review_metrics_http),
        )
        .route(
            "/admin/wedding/reviews/appeals/{appeal_id}",
            post(resolve_appeal_http),
        )
        .route(
            "/wedding/reviews/invitations/open",
            post(open_invitation_http),
        )
        .route(
            "/wedding/reviews/invitations/{invitation_id}/respond",
            post(respond_invitation_http),
        )
        .route(
            "/wedding/reviews/{review_id}/appeal",
            get(appeal_status_http).post(create_appeal_http),
        )
        .route(
            "/wedding/reviews/decision-observation",
            get(decision_observation_http),
        )
}

fn enabled() -> bool {
    std::env::var("OMNYID_WEDDING_REVIEWS_ENABLED").as_deref() == Ok("true")
}

fn unavailable() -> (StatusCode, String) {
    (
        StatusCode::NOT_FOUND,
        "Wedding review is not available.".into(),
    )
}

fn bad(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}

fn conflict(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::CONFLICT, message.into())
}

fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(
        error_kind = ?error.as_database_error().map(|value| value.kind()),
        "Wedding review operation failed"
    );
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "The review operation could not be completed just now.".into(),
    )
}

fn valid_id(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

fn clean(value: &str, max: usize) -> String {
    value.trim().chars().take(max).collect()
}

fn token_digest(value: &str) -> String {
    crate::db::sha256_token(value)
}

async fn operator(
    state: &Arc<AppState>,
    headers: &HeaderMap,
) -> Result<crate::db::UserRecord, (StatusCode, String)> {
    let user = authenticated_user(&state.db, headers).await?;
    if !operator_access_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "operator access required".into()));
    }
    if !enabled() {
        return Err(unavailable());
    }
    Ok(user)
}

fn invitation_message(
    display_name: &str,
    subject_name: &str,
    invitation_url: &str,
    reminder: bool,
) -> (String, String) {
    let subject = if reminder {
        format!("Reminder: share your experience with {subject_name}")
    } else {
        format!("Share your experience with {subject_name}")
    };
    let lead = if reminder {
        "This is the only reminder for this invitation."
    } else {
        "You are invited to share an honest experience."
    };
    let body = format!(
        "Hi {display_name},\n\n{lead} Positive, critical and private feedback are handled under the same rules. Nothing becomes public without your exact preview and independent review.\n\nOpen the invitation:\n{invitation_url}\n\nYou may decline or opt out after opening it. The link expires after {INVITATION_DAYS} days."
    );
    (subject, body)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateInvitationRequest {
    idempotency_key: String,
}

async fn create_invitation_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(review_id): Path<String>,
    Json(request): Json<CreateInvitationRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_invitation_create", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let operator = operator(&state, &headers).await?;
    let key = clean(&request.idempotency_key, 180);
    if !valid_id(&review_id, 200) || !valid_id(&key, 180) || key.len() < 8 {
        return Err(bad("Choose a valid review and retry key."));
    }

    if let Some(existing) = sqlx::query(
        "SELECT invitation_id,status,delivery_status,expires_at::text
           FROM wedding_review_invitations
          WHERE created_by_user_id=$1 AND request_key=$2",
    )
    .bind(&operator.id)
    .bind(&key)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?
    {
        return Ok(Json(json!({
            "invitation_id": existing.get::<String,_>("invitation_id"),
            "status": existing.get::<String,_>("status"),
            "delivery_status": existing.get::<String,_>("delivery_status"),
            "expires_at": existing.get::<String,_>("expires_at"),
            "replayed": true
        })));
    }

    let row = sqlx::query(
        "SELECT review.owner_user_id,review.status,review.subject_kind,
                review.wedding_plan_id,review.response_workspace_id,review.vendor_id,
                recipient.email,recipient.display_name,
                COALESCE(vendor.vendor_name,'OmnyID Wedding') AS subject_name,
                EXISTS(SELECT 1 FROM wedding_review_invitations prior
                       WHERE prior.invited_user_id=review.owner_user_id
                         AND prior.subject_kind=review.subject_kind
                         AND prior.vendor_id IS NOT DISTINCT FROM review.vendor_id
                         AND prior.status='opted_out') AS opted_out
           FROM wedding_reviews review
           JOIN users recipient ON recipient.id=review.owner_user_id
           LEFT JOIN wedding_vendors vendor ON vendor.vendor_id=review.vendor_id
          WHERE review.review_id=$1",
    )
    .bind(&review_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)?;
    let review_status: String = row.get("status");
    if !["draft", "rejected", "evidence_requested"].contains(&review_status.as_str()) {
        return Err(conflict("This review no longer needs an invitation."));
    }
    if row.get::<bool, _>("opted_out") {
        return Err(conflict(
            "This person opted out of review invitations for this subject.",
        ));
    }

    let mut token_bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut token_bytes);
    let token = URL_SAFE_NO_PAD.encode(token_bytes);
    let invitation_id = format!("review-invitation-{}", Ulid::new());
    let message_id = format!("review-invitation-message-{}", Ulid::new());
    let owner_user_id: String = row.get("owner_user_id");
    let subject_kind: String = row.get("subject_kind");
    let vendor_id: Option<String> = row.try_get("vendor_id").ok().flatten();
    sqlx::query(
        "INSERT INTO wedding_review_invitations
            (invitation_id,review_id,wedding_plan_id,response_workspace_id,vendor_id,
             subject_kind,origin,token_digest,status,expires_at,created_by_user_id,
             invited_user_id,delivery_status,delivery_message_id,request_key)
         VALUES ($1,$2,$3,$4,$5,$6,'operator',$7,'pending',
                 NOW()+($8*INTERVAL '1 day'),$9,$10,'not_requested',$11,$12)",
    )
    .bind(&invitation_id)
    .bind(&review_id)
    .bind(row.get::<String, _>("wedding_plan_id"))
    .bind(row.get::<String, _>("response_workspace_id"))
    .bind(vendor_id)
    .bind(subject_kind)
    .bind(token_digest(&token))
    .bind(INVITATION_DAYS)
    .bind(&operator.id)
    .bind(&owner_user_id)
    .bind(&message_id)
    .bind(&key)
    .execute(&state.db.pool)
    .await
    .map_err(store_error)?;

    let origin = std::env::var("OMNYID_PUBLIC_ORIGIN")
        .unwrap_or_else(|_| "https://omnyid.com".into())
        .trim_end_matches('/')
        .to_string();
    let invitation_url = format!("{origin}/workspace/#wedding-review-invite={token}");
    let display_name: String = row.get("display_name");
    let subject_name: String = row.get("subject_name");
    let (subject, body) = invitation_message(&display_name, &subject_name, &invitation_url, false);
    let outgoing = OutgoingEmailRequest {
        thread_id: format!("wedding-review:{invitation_id}"),
        message_id: message_id.clone(),
        parent_id: None,
        to: vec![row.get::<String, _>("email")],
        subject,
        body,
        in_reply_to: None,
        references: vec![],
        attachments: vec![],
    };
    let delivered = send_outgoing_email(&outgoing).await.is_ok();
    let delivery_status = if delivered { "delivered" } else { "failed" };
    sqlx::query(
        "UPDATE wedding_review_invitations
            SET delivery_status=$1,delivered_at=CASE WHEN $2 THEN NOW() ELSE NULL END,
                updated_at=NOW() WHERE invitation_id=$3",
    )
    .bind(delivery_status)
    .bind(delivered)
    .bind(&invitation_id)
    .execute(&state.db.pool)
    .await
    .map_err(store_error)?;
    sqlx::query(
        "INSERT INTO wedding_review_events
            (event_id,review_id,event_kind,actor_role,actor_user_id,revision,
             reason_code,dedupe_key,metadata)
         SELECT $1,review_id,'invitation_sent','operator',$2,current_revision,
                $3,$4,$5 FROM wedding_reviews WHERE review_id=$6
         ON CONFLICT (review_id,event_kind,dedupe_key) DO NOTHING",
    )
    .bind(format!("review-event-{}", Ulid::new()))
    .bind(&operator.id)
    .bind(delivery_status)
    .bind(&key)
    .bind(json!({"schema_version":1,"delivery_status":delivery_status,"origin":"operator"}))
    .bind(&review_id)
    .execute(&state.db.pool)
    .await
    .map_err(store_error)?;
    Ok(Json(json!({
        "invitation_id": invitation_id,
        "status": "pending",
        "delivery_status": delivery_status,
        "expires_in_days": INVITATION_DAYS,
        "replayed": false
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReminderRequest {
    #[serde(default = "default_reminder_limit")]
    limit: i64,
}

fn default_reminder_limit() -> i64 {
    25
}

async fn remind_invitations_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ReminderRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_invitation_remind", &headers),
        RateLimitPolicy {
            max_requests: 4,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let operator = operator(&state, &headers).await?;
    let limit = request.limit.clamp(1, 50);
    let rows = sqlx::query(
        "SELECT invitation.invitation_id,invitation.review_id,invitation.delivery_message_id,
                recipient.email,recipient.display_name,
                COALESCE(vendor.vendor_name,'OmnyID Wedding') AS subject_name
           FROM wedding_review_invitations invitation
           JOIN wedding_reviews review ON review.review_id=invitation.review_id
           JOIN users recipient ON recipient.id=invitation.invited_user_id
           LEFT JOIN wedding_vendors vendor ON vendor.vendor_id=invitation.vendor_id
          WHERE invitation.status IN ('pending','opened')
            AND invitation.reminder_count=0
            AND invitation.created_at<=NOW()-($1*INTERVAL '1 day')
            AND invitation.expires_at>NOW()
            AND review.status IN ('draft','rejected','evidence_requested')
          ORDER BY invitation.created_at
          LIMIT $2",
    )
    .bind(REMINDER_DAYS)
    .bind(limit)
    .fetch_all(&state.db.pool)
    .await
    .map_err(store_error)?;
    let mut delivered = 0_u64;
    let mut failed = 0_u64;
    for row in rows {
        let invitation_id: String = row.get("invitation_id");
        let claimed = sqlx::query(
            "UPDATE wedding_review_invitations SET reminder_count=1,last_reminded_at=NOW(),updated_at=NOW()
              WHERE invitation_id=$1 AND reminder_count=0 AND status IN ('pending','opened')
              RETURNING token_digest",
        )
        .bind(&invitation_id)
        .fetch_optional(&state.db.pool)
        .await
        .map_err(store_error)?;
        if claimed.is_none() {
            continue;
        }
        // A reminder never exposes or regenerates the original bearer token.
        // It returns the recipient to the authenticated review status surface.
        let origin = std::env::var("OMNYID_PUBLIC_ORIGIN")
            .unwrap_or_else(|_| "https://omnyid.com".into())
            .trim_end_matches('/')
            .to_string();
        let url = format!(
            "{origin}/workspace/#view=wedding&review={}",
            row.get::<String, _>("review_id")
        );
        let (subject, body) = invitation_message(
            &row.get::<String, _>("display_name"),
            &row.get::<String, _>("subject_name"),
            &url,
            true,
        );
        let reminder_id = format!("review-reminder-{}", Ulid::new());
        let outgoing = OutgoingEmailRequest {
            thread_id: format!("wedding-review:{invitation_id}"),
            message_id: reminder_id.clone(),
            parent_id: row.try_get("delivery_message_id").ok(),
            to: vec![row.get::<String, _>("email")],
            subject,
            body,
            in_reply_to: row.try_get("delivery_message_id").ok(),
            references: row
                .try_get::<String, _>("delivery_message_id")
                .ok()
                .into_iter()
                .collect(),
            attachments: vec![],
        };
        let sent = send_outgoing_email(&outgoing).await.is_ok();
        if sent {
            delivered += 1;
        } else {
            failed += 1;
        }
        sqlx::query(
            "INSERT INTO wedding_review_events
                (event_id,review_id,event_kind,actor_role,actor_user_id,revision,
                 reason_code,dedupe_key,metadata)
             SELECT $1,review_id,'invitation_reminded','operator',$2,current_revision,
                    $3,$4,$5 FROM wedding_reviews WHERE review_id=$6
             ON CONFLICT (review_id,event_kind,dedupe_key) DO NOTHING",
        )
        .bind(format!("review-event-{}", Ulid::new()))
        .bind(&operator.id)
        .bind(if sent { "delivered" } else { "failed" })
        .bind(format!("review-reminder:{invitation_id}"))
        .bind(json!({"schema_version":1,"delivery_status":if sent {"delivered"} else {"failed"},"reminder_number":1}))
        .bind(row.get::<String,_>("review_id"))
        .execute(&state.db.pool)
        .await
        .map_err(store_error)?;
    }
    Ok(Json(
        json!({"delivered":delivered,"failed":failed,"reminder_limit":1}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OpenInvitationRequest {
    token: String,
}

async fn open_invitation_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<OpenInvitationRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_invitation_open", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    if !enabled() {
        return Err(unavailable());
    }
    let token = clean(&request.token, 100);
    if token.len() < 32 {
        return Err(unavailable());
    }
    let mut transaction = state.db.pool.begin().await.map_err(store_error)?;
    let row = sqlx::query(
        "SELECT invitation.invitation_id,invitation.review_id,invitation.invited_user_id,
                invitation.status,invitation.expires_at<=NOW() AS expired,
                review.wedding_plan_id,review.response_workspace_id,
                review.vendor_id,review.current_revision
           FROM wedding_review_invitations invitation
           JOIN wedding_reviews review ON review.review_id=invitation.review_id
          WHERE invitation.token_digest=$1 FOR UPDATE OF invitation",
    )
    .bind(token_digest(&token))
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)?;
    if row.try_get::<String, _>("invited_user_id").ok().as_deref() != Some(user.id.as_str()) {
        return Err(unavailable());
    }
    if row.get::<bool, _>("expired")
        || !["pending", "opened"].contains(&row.get::<String, _>("status").as_str())
    {
        return Err((
            StatusCode::GONE,
            "This review invitation is no longer active.".into(),
        ));
    }
    let invitation_id: String = row.get("invitation_id");
    sqlx::query("UPDATE wedding_review_invitations SET status='opened',updated_at=NOW() WHERE invitation_id=$1 AND status='pending'")
        .bind(&invitation_id).execute(&mut *transaction).await.map_err(store_error)?;
    sqlx::query(
        "INSERT INTO wedding_review_events
            (event_id,review_id,event_kind,actor_role,actor_user_id,revision,dedupe_key,metadata)
         VALUES ($1,$2,'invitation_opened','author',$3,$4,$5,$6)
         ON CONFLICT (review_id,event_kind,dedupe_key) DO NOTHING",
    )
    .bind(format!("review-event-{}", Ulid::new()))
    .bind(row.get::<String, _>("review_id"))
    .bind(&user.id)
    .bind(row.get::<i64, _>("current_revision"))
    .bind(format!("review-invitation-open:{invitation_id}"))
    .bind(json!({"schema_version":1,"invitation_id":invitation_id}))
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?;
    transaction.commit().await.map_err(store_error)?;
    Ok(Json(json!({
        "invitation_id": invitation_id,
        "review_id": row.get::<String,_>("review_id"),
        "wedding_plan_id": row.get::<String,_>("wedding_plan_id"),
        "response_workspace_id": row.get::<String,_>("response_workspace_id"),
        "vendor_id": row.try_get::<String,_>("vendor_id").ok(),
        "status": "opened"
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct InvitationResponseRequest {
    action: String,
}

async fn respond_invitation_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(invitation_id): Path<String>,
    Json(request): Json<InvitationResponseRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !enabled() || !valid_id(&invitation_id, 200) {
        return Err(unavailable());
    }
    let (status, event_kind) = match request.action.trim() {
        "decline" => ("declined", "invitation_declined"),
        "opt_out" => ("opted_out", "invitation_opted_out"),
        _ => return Err(bad("Choose decline or opt_out.")),
    };
    let row = sqlx::query(
        "UPDATE wedding_review_invitations invitation
            SET status=$1,token_digest=NULL,updated_at=NOW()
          WHERE invitation.invitation_id=$2 AND invitation.invited_user_id=$3
            AND invitation.status IN ('pending','opened')
          RETURNING invitation.review_id",
    )
    .bind(status)
    .bind(&invitation_id)
    .bind(&user.id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)?;
    let review_id: String = row.get("review_id");
    sqlx::query(
        "INSERT INTO wedding_review_events
            (event_id,review_id,event_kind,actor_role,actor_user_id,dedupe_key,metadata)
         VALUES ($1,$2,$3,'author',$4,$5,$6)
         ON CONFLICT (review_id,event_kind,dedupe_key) DO NOTHING",
    )
    .bind(format!("review-event-{}", Ulid::new()))
    .bind(&review_id)
    .bind(event_kind)
    .bind(&user.id)
    .bind(format!("review-invitation-response:{invitation_id}"))
    .bind(json!({"schema_version":1,"result":status}))
    .execute(&state.db.pool)
    .await
    .map_err(store_error)?;
    Ok(Json(json!({"invitation_id":invitation_id,"status":status})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AppealRequest {
    reason_code: String,
}

async fn create_appeal_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(review_id): Path<String>,
    Json(request): Json<AppealRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_review_appeal", &headers),
        RateLimitPolicy {
            max_requests: 5,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    if !enabled() || !valid_id(&review_id, 200) {
        return Err(unavailable());
    }
    let reason = clean(&request.reason_code, 80);
    if ![
        "eligibility",
        "evidence",
        "personal_information",
        "unsupported_claim",
        "correction_required",
        "policy_other",
    ]
    .contains(&reason.as_str())
    {
        return Err(bad("Choose a valid appeal reason."));
    }
    let row = sqlx::query(
        "SELECT review.current_revision,review.status,revision.authored_by_user_id
           FROM wedding_reviews review
           JOIN wedding_review_revisions revision ON revision.review_id=review.review_id
            AND revision.revision=review.current_revision
          WHERE review.review_id=$1",
    )
    .bind(&review_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)?;
    if row.get::<String, _>("authored_by_user_id") != user.id {
        return Err(unavailable());
    }
    if !["rejected", "restricted"].contains(&row.get::<String, _>("status").as_str()) {
        return Err(conflict(
            "An appeal is available only for a rejected or restricted review.",
        ));
    }
    let appeal_id = format!("review-appeal-{}", Ulid::new());
    let revision: i64 = row.get("current_revision");
    let mut transaction = state.db.pool.begin().await.map_err(store_error)?;
    let inserted = sqlx::query(
        "INSERT INTO wedding_review_appeals
            (appeal_id,review_id,revision,author_user_id,reason_code)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (review_id) WHERE status='open' DO NOTHING",
    )
    .bind(&appeal_id)
    .bind(&review_id)
    .bind(revision)
    .bind(&user.id)
    .bind(&reason)
    .execute(&mut *transaction)
    .await
    .map_err(store_error)?
    .rows_affected();
    if inserted == 0 {
        return Err(conflict("An appeal is already awaiting review."));
    }
    sqlx::query(
        "INSERT INTO wedding_review_events
            (event_id,review_id,event_kind,actor_role,actor_user_id,revision,reason_code,dedupe_key,metadata)
         VALUES ($1,$2,'appeal_submitted','author',$3,$4,$5,$6,$7)",
    ).bind(format!("review-event-{}", Ulid::new())).bind(&review_id).bind(&user.id)
      .bind(revision).bind(&reason).bind(format!("review-appeal:{appeal_id}"))
      .bind(json!({"schema_version":1,"reason_code":reason,"status":"open"}))
      .execute(&mut *transaction).await.map_err(store_error)?;
    transaction.commit().await.map_err(store_error)?;
    Ok(Json(
        json!({"appeal_id":appeal_id,"review_id":review_id,"status":"open","reason_code":reason}),
    ))
}

async fn appeal_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(review_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !enabled() || !valid_id(&review_id, 200) {
        return Err(unavailable());
    }
    let row = sqlx::query(
        "SELECT appeal.appeal_id,appeal.reason_code,appeal.status,appeal.resolution_code,
                appeal.submitted_at::text,appeal.resolved_at::text
           FROM wedding_review_appeals appeal
          WHERE appeal.review_id=$1 AND appeal.author_user_id=$2
          ORDER BY appeal.submitted_at DESC LIMIT 1",
    )
    .bind(&review_id)
    .bind(&user.id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?;
    Ok(Json(match row {
        Some(row) => {
            json!({"appeal":{"appeal_id":row.get::<String,_>("appeal_id"),"reason_code":row.get::<String,_>("reason_code"),"status":row.get::<String,_>("status"),"resolution_code":row.try_get::<String,_>("resolution_code").ok(),"submitted_at":row.get::<String,_>("submitted_at"),"resolved_at":row.try_get::<String,_>("resolved_at").ok()}})
        }
        None => json!({"appeal":null}),
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ResolveAppealRequest {
    decision: String,
}

async fn resolve_appeal_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(appeal_id): Path<String>,
    Json(request): Json<ResolveAppealRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator = operator(&state, &headers).await?;
    if !valid_id(&appeal_id, 200) {
        return Err(unavailable());
    }
    let (resolution, review_status) = match request.decision.trim() {
        "uphold" => ("upheld", None),
        "reopen" => ("reopened", Some("moderation_pending")),
        "request_correction" => ("correction_requested", Some("rejected")),
        _ => return Err(bad("Choose uphold, reopen or request_correction.")),
    };
    let mut transaction = state.db.pool.begin().await.map_err(store_error)?;
    let row = sqlx::query(
        "UPDATE wedding_review_appeals
            SET status='resolved',resolution_code=$1,resolved_at=NOW(),resolved_by_user_id=$2
          WHERE appeal_id=$3 AND status='open'
          RETURNING review_id,revision",
    )
    .bind(resolution)
    .bind(&operator.id)
    .bind(&appeal_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_error)?
    .ok_or_else(unavailable)?;
    let review_id: String = row.get("review_id");
    let revision: i64 = row.get("revision");
    if let Some(status) = review_status {
        sqlx::query("UPDATE wedding_reviews SET status=$1,updated_at=NOW() WHERE review_id=$2 AND current_revision=$3")
            .bind(status).bind(&review_id).bind(revision)
            .execute(&mut *transaction).await.map_err(store_error)?;
    }
    sqlx::query(
        "INSERT INTO wedding_review_events
            (event_id,review_id,event_kind,actor_role,actor_user_id,revision,reason_code,dedupe_key,metadata)
         VALUES ($1,$2,'appeal_resolved','operator',$3,$4,$5,$6,$7)",
    ).bind(format!("review-event-{}", Ulid::new())).bind(&review_id).bind(&operator.id)
      .bind(revision).bind(resolution).bind(format!("review-appeal-resolution:{appeal_id}"))
      .bind(json!({"schema_version":1,"resolution_code":resolution}))
      .execute(&mut *transaction).await.map_err(store_error)?;
    transaction.commit().await.map_err(store_error)?;
    Ok(Json(
        json!({"appeal_id":appeal_id,"review_id":review_id,"status":"resolved","resolution_code":resolution}),
    ))
}

async fn review_metrics_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    operator(&state, &headers).await?;
    let row = sqlx::query(
        "SELECT
           (SELECT COUNT(*) FROM wedding_review_invitations)::bigint invitations,
           (SELECT COUNT(*) FROM wedding_review_invitations WHERE delivery_status='delivered')::bigint delivered,
           (SELECT COUNT(*) FROM wedding_review_invitations WHERE status='opened')::bigint opened,
           (SELECT COUNT(*) FROM wedding_review_invitations WHERE status='submitted')::bigint invitation_submissions,
           (SELECT COUNT(*) FROM wedding_reviews WHERE status IN ('submitted','evidence_requested','moderation_pending','edit_pending'))::bigint handling,
           (SELECT COUNT(*) FROM wedding_reviews WHERE verification_state IN ('verified_activity','verified_booking','verified_wedding_held'))::bigint verified,
           (SELECT COUNT(*) FROM wedding_review_publications WHERE status='published')::bigint published,
           (SELECT COUNT(*) FROM wedding_review_appeals WHERE status='open')::bigint open_appeals,
           (SELECT COUNT(DISTINCT vendor_id) FROM wedding_review_publications WHERE status='published' AND vendor_id IS NOT NULL)::bigint covered_vendors,
           (SELECT COUNT(*) FROM wedding_review_publications WHERE status='published' AND aggregate_eligible)::bigint aggregate_eligible",
    ).fetch_one(&state.db.pool).await.map_err(store_error)?;
    Ok(Json(json!({
        "schema_version":1,
        "content_free":true,
        "counts":{
            "invitations":row.get::<i64,_>("invitations"),
            "delivered":row.get::<i64,_>("delivered"),
            "opened":row.get::<i64,_>("opened"),
            "invitation_submissions":row.get::<i64,_>("invitation_submissions"),
            "awaiting_handling":row.get::<i64,_>("handling"),
            "verified":row.get::<i64,_>("verified"),
            "published":row.get::<i64,_>("published"),
            "open_appeals":row.get::<i64,_>("open_appeals"),
            "covered_vendors":row.get::<i64,_>("covered_vendors"),
            "aggregate_eligible":row.get::<i64,_>("aggregate_eligible")
        },
        "excluded":["review_text","evidence","display_label","private_reviewer_id"]
    })))
}

#[derive(Deserialize)]
struct ObservationQuery {
    wedding_plan_id: String,
    vendor_id: String,
}

async fn decision_observation_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<ObservationQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !enabled()
        || !valid_id(query.wedding_plan_id.trim(), 180)
        || !valid_id(query.vendor_id.trim(), 200)
    {
        return Err(unavailable());
    }
    let authorised: bool = sqlx::query_scalar(
        "SELECT EXISTS(
             SELECT 1 FROM wedding_user_onboarding_state state
              WHERE state.user_id=$1 AND state.wedding_plan_id=$2
             UNION ALL
             SELECT 1 FROM wedding_plan_memberships member
              WHERE member.member_user_id=$1 AND member.wedding_plan_id=$2 AND member.status='active'
         )",
    ).bind(&user.id).bind(query.wedding_plan_id.trim()).fetch_one(&state.db.pool).await.map_err(store_error)?;
    if !authorised {
        return Err(unavailable());
    }
    let row = sqlx::query(
        "SELECT publication.publication_id,publication.experience_kind,
                publication.verification_state,publication.rating,
                publication.public_snapshot,publication.published_at::text
           FROM wedding_review_publications publication
          WHERE publication.vendor_id=$1 AND publication.status='published'
          ORDER BY publication.published_at DESC,publication.publication_id LIMIT 1",
    )
    .bind(query.vendor_id.trim())
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?;
    Ok(Json(match row {
        Some(row) => {
            let snapshot: Value = row.get("public_snapshot");
            json!({"observation":{
                "publication_id":row.get::<String,_>("publication_id"),
                "observed_at":row.get::<String,_>("published_at"),
                "experience_kind":row.get::<String,_>("experience_kind"),
                "verification_state":row.get::<String,_>("verification_state"),
                "rating":row.try_get::<i16,_>("rating").ok(),
                "summary":snapshot.get("title").and_then(Value::as_str),
                "question":snapshot.get("next_couple_question").and_then(Value::as_str),
                "caveat":"This is one couple's past experience, not current price, policy or availability evidence.",
                "source_kind":"published_wedding_review"
            }})
        }
        None => json!({"observation":null}),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invitation_copy_is_neutral_and_bounded() {
        let (subject, body) =
            invitation_message("Alex", "Harbour Garden", "https://example.test", false);
        assert!(subject.contains("Share your experience"));
        assert!(body.contains("Positive, critical and private feedback"));
        assert!(!body.contains("five star"));
    }

    #[test]
    fn valid_ids_reject_query_syntax() {
        assert!(valid_id("review-01", 200));
        assert!(!valid_id("review?id=01", 200));
    }
}
