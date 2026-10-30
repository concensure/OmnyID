use super::{
    AppState, RateLimitPolicy, auth::authenticated_user, authenticated_rate_limit_key,
    enforce_rate_limit,
};
use crate::db::tenant_schema_name;
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Transaction};
use std::{sync::Arc, time::Duration};
use ulid::Ulid;

const RESPONSE_KIND: &str = "wedding_rsvp_response";
const RECEIPT_KIND: &str = "wedding_rsvp_impact_receipt";
const MAX_PRIVATE_ENVELOPE_BYTES: usize = 32 * 1024;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/wedding/rsvp/responses", post(record_response_http))
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Attendance {
    Pending,
    Attending,
    NotAttending,
}

impl Attendance {
    fn invitation_status(&self) -> &'static str {
        match self {
            Self::Pending => "invited",
            Self::Attending => "rsvp_yes",
            Self::NotAttending => "rsvp_no",
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RecordResponseRequest {
    pub wedding_plan_id: String,
    pub response_workspace_id: String,
    pub invitation_id: String,
    pub person_id: String,
    pub event_id: String,
    pub attendance: Attendance,
    pub expected_revision: i64,
    pub idempotency_key: String,
    pub private_answers_ciphertext: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
struct RecordResponseReply {
    response: Value,
    impact_receipt: Value,
    replayed: bool,
    explanation: String,
}

#[derive(Clone, Debug)]
pub(crate) struct InvitationAuthority {
    pub person_id: String,
    pub event_id: String,
    pub invitation_status: String,
    pub response_revision: i64,
    pub locked_at: Option<String>,
    pub plus_one_allowed: bool,
    pub children_invited: bool,
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

fn bad_request(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}

fn conflict(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::CONFLICT, message.into())
}

fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!(%error, "Wedding RSVP response transaction failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "That RSVP could not be saved. Please try again.".into(),
    )
}

pub(crate) fn validate_request(
    request: &RecordResponseRequest,
) -> Result<(), (StatusCode, String)> {
    if !valid_id(&request.wedding_plan_id)
        || !valid_id(&request.response_workspace_id)
        || !valid_id(&request.invitation_id)
        || !valid_id(&request.person_id)
        || !valid_id(&request.event_id)
        || !valid_id(&request.idempotency_key)
    {
        return Err(bad_request("Choose a valid wedding invitation."));
    }
    if request.expected_revision < 0 {
        return Err(bad_request("The RSVP revision is invalid."));
    }
    if request
        .private_answers_ciphertext
        .as_ref()
        .is_some_and(|value| {
            !value.starts_with("encrypted:v1:")
                || value.len() <= "encrypted:v1:".len()
                || value.len() > MAX_PRIVATE_ENVELOPE_BYTES
                || value.chars().any(char::is_whitespace)
        })
    {
        return Err(bad_request("The private RSVP answer envelope is invalid."));
    }
    Ok(())
}

pub(crate) fn validate_expected_revision(
    expected_revision: i64,
    current_revision: i64,
) -> Result<(), (StatusCode, String)> {
    if expected_revision != current_revision {
        return Err(conflict(
            "This RSVP changed on another screen. Refresh before saving your answer.",
        ));
    }
    Ok(())
}

pub(crate) fn validate_invitation_scope(
    request: &RecordResponseRequest,
    authority: &InvitationAuthority,
) -> Result<(), (StatusCode, String)> {
    if authority.person_id != request.person_id || authority.event_id != request.event_id {
        return Err((
            StatusCode::FORBIDDEN,
            "That invitation does not belong to this guest and event.".into(),
        ));
    }
    if authority.locked_at.is_some() {
        return Err(conflict(
            "This RSVP is locked. Unlock it before recording another response.",
        ));
    }
    Ok(())
}

fn request_fingerprint(request: &RecordResponseRequest) -> String {
    let canonical = json!({
        "wedding_plan_id": request.wedding_plan_id,
        "response_workspace_id": request.response_workspace_id,
        "invitation_id": request.invitation_id,
        "person_id": request.person_id,
        "event_id": request.event_id,
        "attendance": request.attendance,
        "expected_revision": request.expected_revision,
        "private_answers_ciphertext": request.private_answers_ciphertext,
    });
    hex::encode(Sha256::digest(canonical.to_string().as_bytes()))
}

fn metadata_scope_clause(alias: &str) -> String {
    format!(
        "(COALESCE({alias}.metadata->>'weddingPlanId',{alias}.metadata->>'wedding_plan_id')=$2 AND COALESCE({alias}.metadata->>'responseWorkspaceId',{alias}.metadata->>'response_workspace_id')=$3)"
    )
}

async fn existing_replay(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    request: &RecordResponseRequest,
) -> Result<Option<(Value, Value)>, (StatusCode, String)> {
    let query = format!(
        "SELECT content FROM {table} WHERE kind=$1 AND metadata->>'idempotency_key'=$2 ORDER BY timestamp DESC LIMIT 1"
    );
    let existing = sqlx::query_scalar::<_, Value>(&query)
        .bind(RESPONSE_KIND)
        .bind(&request.idempotency_key)
        .fetch_optional(&mut **tx)
        .await
        .map_err(store_error)?;
    let Some(response) = existing else {
        return Ok(None);
    };
    if response.get("request_fingerprint").and_then(Value::as_str)
        != Some(request_fingerprint(request).as_str())
    {
        return Err(conflict(
            "This RSVP save key was already used for different answers.",
        ));
    }
    let response_id = response
        .get("response_id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let receipt_query = format!(
        "SELECT content FROM {table} WHERE kind=$1 AND content->>'response_id'=$2 ORDER BY timestamp DESC LIMIT 1"
    );
    let receipt = sqlx::query_scalar::<_, Value>(&receipt_query)
        .bind(RECEIPT_KIND)
        .bind(response_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(store_error)?
        .unwrap_or_else(|| {
            json!({
                "kind": RECEIPT_KIND,
                "contract_version": 1,
                "response_id": response_id,
                "effects": [],
            })
        });
    Ok(Some((response, receipt)))
}

async fn invitation_authority(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    request: &RecordResponseRequest,
) -> Result<Option<InvitationAuthority>, (StatusCode, String)> {
    let scope = metadata_scope_clause("m");
    let query = format!(
        "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_event_invitation' AND m.content->>'invitation_id'=$1 AND {scope} ORDER BY m.timestamp DESC,m.id DESC LIMIT 1"
    );
    let value = sqlx::query_scalar::<_, Value>(&query)
        .bind(&request.invitation_id)
        .bind(&request.wedding_plan_id)
        .bind(&request.response_workspace_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(store_error)?;
    Ok(value.map(|content| InvitationAuthority {
        person_id: content
            .get("person_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        event_id: content
            .get("event_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        invitation_status: content
            .get("invitation_status")
            .and_then(Value::as_str)
            .unwrap_or("invited")
            .to_string(),
        response_revision: content
            .get("response_revision")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        locked_at: content
            .get("locked_at")
            .and_then(Value::as_str)
            .map(str::to_string),
        plus_one_allowed: content
            .get("plus_one_allowed")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        children_invited: content
            .get("children_invited")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }))
}

async fn latest_response(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    request: &RecordResponseRequest,
) -> Result<Option<Value>, (StatusCode, String)> {
    let scope = metadata_scope_clause("m");
    let query = format!(
        "SELECT m.content FROM {table} m WHERE m.kind=$1 AND m.content->>'invitation_id'=$2 AND {scope} ORDER BY (m.content->>'revision')::bigint DESC,m.timestamp DESC LIMIT 1"
    );
    sqlx::query_scalar::<_, Value>(&query)
        .bind(RESPONSE_KIND)
        .bind(&request.invitation_id)
        .bind(&request.wedding_plan_id)
        .bind(&request.response_workspace_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(store_error)
}

fn insert_query(table: &str) -> String {
    format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata,\"references\",supertags) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,TRUE,$10,$11,$12)"
    )
}

async fn insert_message(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    id: &str,
    thread_id: &str,
    kind: &str,
    content: &Value,
    metadata: &Value,
    references: &Value,
    supertags: &[String],
) -> Result<(), (StatusCode, String)> {
    sqlx::query(&insert_query(table))
        .bind(id)
        .bind(thread_id)
        .bind("system://wedding-rsvp")
        .bind(json!([
            "agent://wedding-planning",
            "agent://knowledge-graph"
        ]))
        .bind(Utc::now())
        .bind("ledger")
        .bind(kind)
        .bind(content)
        .bind("server:wedding-rsvp:v1")
        .bind(metadata)
        .bind(references)
        .bind(supertags)
        .execute(&mut **tx)
        .await
        .map_err(store_error)?;
    Ok(())
}

async fn record_response_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RecordResponseRequest>,
) -> Result<Json<RecordResponseReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_rsvp_response", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    validate_request(&request)?;
    state
        .db
        .ensure_user_private_schema(&user.id)
        .await
        .map_err(store_error)?;
    let table = format!("\"{}\".messages", tenant_schema_name(&user.id));
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(format!("{}:{}", user.id, request.invitation_id))
        .execute(&mut *tx)
        .await
        .map_err(store_error)?;
    if let Some((response, impact_receipt)) = existing_replay(&mut tx, &table, &request).await? {
        tx.commit().await.map_err(store_error)?;
        return Ok(Json(RecordResponseReply {
            response,
            impact_receipt,
            replayed: true,
            explanation: "This RSVP was already saved; no duplicate changes were made.".into(),
        }));
    }
    let authority = invitation_authority(&mut tx, &table, &request)
        .await?
        .ok_or((
            StatusCode::FORBIDDEN,
            "That invitation is not available in this wedding.".into(),
        ))?;
    validate_invitation_scope(&request, &authority)?;
    let latest = latest_response(&mut tx, &table, &request).await?;
    let current_revision = latest
        .as_ref()
        .and_then(|value| value.get("revision"))
        .and_then(Value::as_i64)
        .unwrap_or(authority.response_revision);
    validate_expected_revision(request.expected_revision, current_revision)?;
    let previous_status = latest
        .as_ref()
        .and_then(|value| value.get("invitation_status"))
        .and_then(Value::as_str)
        .unwrap_or(&authority.invitation_status);
    let revision = current_revision + 1;
    let response_id = format!("wedding-rsvp-response-{}", Ulid::new());
    let receipt_id = format!("wedding-rsvp-impact-{}", Ulid::new());
    let responded_at = Utc::now().to_rfc3339();
    let invitation_status = request.attendance.invitation_status();
    let response = json!({
        "kind": RESPONSE_KIND,
        "contract_version": 1,
        "response_id": response_id,
        "wedding_plan_id": request.wedding_plan_id,
        "response_workspace_id": request.response_workspace_id,
        "invitation_id": request.invitation_id,
        "person_id": request.person_id,
        "event_id": request.event_id,
        "source": "couple_manual",
        "attendance": request.attendance,
        "invitation_status": invitation_status,
        "previous_invitation_status": previous_status,
        "revision": revision,
        "supersedes_response_id": latest.as_ref().and_then(|value| value.get("response_id")).and_then(Value::as_str),
        "responded_at": responded_at,
        "locked_at": Value::Null,
        "plus_one_allowed": authority.plus_one_allowed,
        "children_invited": authority.children_invited,
        "has_private_answers": request.private_answers_ciphertext.is_some(),
        "encrypted_private_payload": request.private_answers_ciphertext,
        "request_fingerprint": request_fingerprint(&request),
    });
    let receipt = json!({
        "kind": RECEIPT_KIND,
        "contract_version": 1,
        "receipt_id": receipt_id,
        "response_id": response_id,
        "invitation_id": request.invitation_id,
        "revision": revision,
        "effects": [
            "guest_attendance_updated",
            "guest_view_summary_updated",
            "wedding_home_guest_tile_updated",
            "final_guest_count_recalculation_requested"
        ],
        "explanation": "The guest response, RSVP summary, Home guest tile and final-count readiness now use this answer.",
        "created_at": responded_at,
    });
    let metadata = json!({
        "template": "wedding_planning",
        "weddingPlanId": request.wedding_plan_id,
        "responseWorkspaceId": request.response_workspace_id,
        "idempotency_key": request.idempotency_key,
        "origin": "authenticated_couple_rsvp",
        "model_calls": 0,
        "e2ee_required": request.private_answers_ciphertext.is_some(),
        "private_fields": if request.private_answers_ciphertext.is_some() { vec!["encrypted_private_payload"] } else { Vec::<&str>::new() },
    });
    let references = json!([
        {"type":"wedding_plan","target":request.wedding_plan_id,"label":"Wedding plan"},
        {"type":"response_workspace","target":request.response_workspace_id,"label":"Wedding workspace"},
        {"type":"rsvp_for_invitation","target":request.invitation_id,"label":"Invitation"},
        {"type":"request_targets_guest","target":request.person_id,"label":"Guest"},
        {"type":"request_targets_event","target":request.event_id,"label":"Wedding event"}
    ]);
    let supertags = vec![
        "template:wedding_planning".into(),
        "event:wedding".into(),
        "wedding_rsvp:response".into(),
        format!("wedding_plan:{}", request.wedding_plan_id),
        format!("response_workspace:{}", request.response_workspace_id),
    ];
    let thread_id = format!("wedding_rsvp:{}", request.response_workspace_id);
    insert_message(
        &mut tx,
        &table,
        &Ulid::new().to_string(),
        &thread_id,
        RESPONSE_KIND,
        &response,
        &metadata,
        &references,
        &supertags,
    )
    .await?;
    let receipt_metadata = json!({
        "template": "wedding_planning",
        "weddingPlanId": request.wedding_plan_id,
        "responseWorkspaceId": request.response_workspace_id,
        "origin": "wedding_rsvp_consequence_projector",
        "model_calls": 0,
    });
    insert_message(
        &mut tx,
        &table,
        &Ulid::new().to_string(),
        &thread_id,
        RECEIPT_KIND,
        &receipt,
        &receipt_metadata,
        &json!([{"type":"rsvp_response","target":response_id,"label":"RSVP response"}]),
        &supertags,
    )
    .await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(RecordResponseReply {
        response,
        impact_receipt: receipt,
        replayed: false,
        explanation:
            "RSVP saved. Guest totals and the Wedding Home guest tile will use this response."
                .into(),
    }))
}
