use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_user, public_rate_limit_key},
    authenticated_rate_limit_key, enforce_rate_limit,
};
use crate::db::tenant_schema_name;
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chacha20poly1305::aead::{OsRng, rand_core::RngCore};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use std::{collections::HashSet, sync::Arc, time::Duration};
use ulid::Ulid;

const MAX_GRANT_DAYS: i64 = 30;
const HELPER_ACTIONS: [&str; 2] = ["view_summary", "propose_request"];

mod delegated_access;
mod household_commands;
mod private_notes;
mod request_mutations;
mod rule_commands;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/wedding/boundaries/grants",
            get(list_grants).post(create_grant),
        )
        .route(
            "/wedding/boundaries/grants/{grant_id}/revoke",
            post(revoke_grant),
        )
        .route("/wedding/boundaries/helpers/open", post(open_helper))
        .route("/wedding/boundaries/helpers/propose", post(propose_request))
        .route("/wedding/boundaries/decisions", post(decide_request))
        .merge(delegated_access::routes())
        .merge(household_commands::routes())
        .merge(private_notes::routes())
        .merge(rule_commands::routes())
}

fn helper_enabled() -> bool {
    std::env::var("OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED")
        .ok()
        .as_deref()
        == Some("true")
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

fn valid_label(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= 200 && !value.chars().any(char::is_control)
}

fn bad(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}

fn unavailable() -> (StatusCode, String) {
    (
        StatusCode::NOT_FOUND,
        "This family access link is not available.".into(),
    )
}

fn conflict(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::CONFLICT, message.into())
}

fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!(error_kind = %error.as_database_error().map(|value| format!("{:?}", value.kind())).unwrap_or_else(|| "storage".into()), "Wedding boundary persistence failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Family boundaries are temporarily unavailable.".into(),
    )
}

fn metadata_scope(alias: &str, plan_parameter: usize, workspace_parameter: usize) -> String {
    format!(
        "COALESCE({alias}.metadata->>'weddingPlanId',{alias}.metadata->>'wedding_plan_id')=${plan_parameter} AND COALESCE({alias}.metadata->>'responseWorkspaceId',{alias}.metadata->>'response_workspace_id')=${workspace_parameter}"
    )
}

fn token_digest(token: &str) -> Option<String> {
    let bytes = URL_SAFE_NO_PAD.decode(token.trim()).ok()?;
    (bytes.len() == 32).then(|| hex::encode(Sha256::digest(bytes)))
}

fn new_token() -> (String, String) {
    let mut entropy = [0_u8; 32];
    OsRng.fill_bytes(&mut entropy);
    (
        URL_SAFE_NO_PAD.encode(entropy),
        hex::encode(Sha256::digest(entropy)),
    )
}

fn parse_expiry(value: &str) -> Result<DateTime<Utc>, (StatusCode, String)> {
    let now = Utc::now();
    let expiry = DateTime::parse_from_rfc3339(value)
        .map_err(|_| bad("Choose a valid access expiry."))?
        .with_timezone(&Utc);
    if expiry < now + ChronoDuration::minutes(15)
        || expiry > now + ChronoDuration::days(MAX_GRANT_DAYS)
    {
        return Err(bad(
            "Access must expire between 15 minutes and 30 days from now.",
        ));
    }
    Ok(expiry)
}

fn fingerprint(value: &Value) -> String {
    hex::encode(Sha256::digest(value.to_string().as_bytes()))
}

fn tenant_table(user_id: &str) -> String {
    format!("\"{}\".messages", tenant_schema_name(user_id))
}

async fn append_event(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    id: &str,
    kind: &str,
    plan: &str,
    workspace: &str,
    content: Value,
) -> Result<(), (StatusCode, String)> {
    let query = format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata,\"references\",supertags) VALUES ($1,$2,'system://wedding-boundaries',$3,NOW(),'ledger',$4,$4,$5,'server:wedding-boundaries:v1',TRUE,$6,$7,$8) ON CONFLICT(id) DO NOTHING"
    );
    sqlx::query(&query)
        .bind(id)
        .bind(format!("wedding_boundary:{workspace}"))
        .bind(json!(["agent://wedding-planning", "agent://decision-queue"]))
        .bind(kind)
        .bind(content)
        .bind(json!({"weddingPlanId": plan, "responseWorkspaceId": workspace, "origin": "server_wedding_boundaries"}))
        .bind(json!([]))
        .bind(vec!["template:wedding_planner", "wedding_boundary", "decisionos:wedding_boundary"])
        .execute(&mut **tx).await.map_err(store_error)?;
    Ok(())
}

async fn household_scope_exists(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    household_ids: &[String],
) -> Result<bool, (StatusCode, String)> {
    let query = format!(
        "SELECT COUNT(DISTINCT m.content->>'household_id') FROM {table} m WHERE m.kind='wedding_boundary_household' AND m.content->>'household_id'=ANY($1) AND {}",
        metadata_scope("m", 2, 3)
    );
    let count = sqlx::query_scalar::<_, i64>(&query)
        .bind(household_ids)
        .bind(plan)
        .bind(workspace)
        .fetch_one(&mut **tx)
        .await
        .map_err(store_error)?;
    Ok(count == household_ids.len() as i64)
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateGrantRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    principal_label: String,
    household_ids: Vec<String>,
    allowed_actions: Vec<String>,
    expires_at: String,
}

#[derive(Debug, Serialize)]
struct GrantReply {
    grant_id: String,
    wedding_plan_id: String,
    response_workspace_id: String,
    principal_label: String,
    household_ids: Vec<String>,
    allowed_actions: Vec<String>,
    expires_at: String,
    revoked_at: Option<String>,
}

async fn create_grant(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateGrantRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_boundary_grant", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !helper_enabled() {
        return Err(unavailable());
    }
    let household_set = request.household_ids.iter().collect::<HashSet<_>>();
    let action_set = request.allowed_actions.iter().collect::<HashSet<_>>();
    if !valid_id(&request.wedding_plan_id)
        || !valid_id(&request.response_workspace_id)
        || !valid_label(&request.principal_label)
        || request.household_ids.is_empty()
        || request.household_ids.len() > 50
        || household_set.len() != request.household_ids.len()
        || request.household_ids.iter().any(|value| !valid_id(value))
        || request.allowed_actions.is_empty()
        || action_set.len() != request.allowed_actions.len()
        || request
            .allowed_actions
            .iter()
            .any(|value| !HELPER_ACTIONS.contains(&value.as_str()))
    {
        return Err(bad(
            "Choose valid households and minimum-necessary helper permissions.",
        ));
    }
    let expires_at = parse_expiry(&request.expires_at)?;
    state
        .db
        .ensure_user_private_schema(&user.id)
        .await
        .map_err(store_error)?;
    let table = tenant_table(&user.id);
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    if !household_scope_exists(
        &mut tx,
        &table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        &request.household_ids,
    )
    .await?
    {
        return Err((
            StatusCode::FORBIDDEN,
            "Those households are not part of this wedding.".into(),
        ));
    }
    let (token, digest) = new_token();
    let grant_id = format!("boundary-grant-{}", Ulid::new());
    sqlx::query("INSERT INTO wedding_boundary_helper_grants (grant_id,owner_user_id,wedding_plan_id,response_workspace_id,principal_label,household_ids,allowed_actions,token_digest,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)")
        .bind(&grant_id).bind(&user.id).bind(&request.wedding_plan_id).bind(&request.response_workspace_id)
        .bind(request.principal_label.trim()).bind(json!(&request.household_ids)).bind(json!(&request.allowed_actions)).bind(digest).bind(expires_at)
        .execute(&mut *tx).await.map_err(store_error)?;
    append_event(&mut tx, &table, &format!("boundary-grant-created-{}", Ulid::new()), "wedding_boundary_permission_grant", &request.wedding_plan_id, &request.response_workspace_id, json!({
        "grant_id": grant_id, "principal_label": request.principal_label.trim(), "household_ids": request.household_ids,
        "allowed_actions": request.allowed_actions, "expires_at": expires_at.to_rfc3339(), "token_stored": false,
    })).await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(
        json!({"grant": GrantReply { grant_id, wedding_plan_id: request.wedding_plan_id, response_workspace_id: request.response_workspace_id, principal_label: request.principal_label.trim().into(), household_ids: request.household_ids, allowed_actions: request.allowed_actions, expires_at: expires_at.to_rfc3339(), revoked_at: None }, "token": token}),
    ))
}

#[derive(Deserialize)]
struct GrantQuery {
    response_workspace_id: String,
}

async fn list_grants(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<GrantQuery>,
) -> Result<Json<Vec<GrantReply>>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&query.response_workspace_id) {
        return Err(bad("Choose a valid Wedding workspace."));
    }
    let rows = sqlx::query("SELECT grant_id,wedding_plan_id,response_workspace_id,principal_label,household_ids,allowed_actions,expires_at::text,revoked_at::text FROM wedding_boundary_helper_grants WHERE owner_user_id=$1 AND response_workspace_id=$2 ORDER BY created_at DESC")
        .bind(&user.id).bind(&query.response_workspace_id).fetch_all(&state.db.pool).await.map_err(store_error)?;
    Ok(Json(
        rows.into_iter()
            .map(|row| GrantReply {
                grant_id: row.get("grant_id"),
                wedding_plan_id: row.get("wedding_plan_id"),
                response_workspace_id: row.get("response_workspace_id"),
                principal_label: row.get("principal_label"),
                household_ids: serde_json::from_value(row.get("household_ids")).unwrap_or_default(),
                allowed_actions: serde_json::from_value(row.get("allowed_actions"))
                    .unwrap_or_default(),
                expires_at: row.get("expires_at"),
                revoked_at: row.get("revoked_at"),
            })
            .collect(),
    ))
}

async fn revoke_grant(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(grant_id): Path<String>,
) -> Result<Json<GrantReply>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&grant_id) {
        return Err(unavailable());
    }
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    let row = sqlx::query("UPDATE wedding_boundary_helper_grants SET revoked_at=COALESCE(revoked_at,NOW()) WHERE grant_id=$1 AND owner_user_id=$2 RETURNING wedding_plan_id,response_workspace_id,principal_label,household_ids,allowed_actions,expires_at::text,revoked_at::text")
        .bind(&grant_id).bind(&user.id).fetch_optional(&mut *tx).await.map_err(store_error)?.ok_or_else(unavailable)?;
    let reply = GrantReply {
        grant_id: grant_id.clone(),
        wedding_plan_id: row.get("wedding_plan_id"),
        response_workspace_id: row.get("response_workspace_id"),
        principal_label: row.get("principal_label"),
        household_ids: serde_json::from_value(row.get("household_ids")).unwrap_or_default(),
        allowed_actions: serde_json::from_value(row.get("allowed_actions")).unwrap_or_default(),
        expires_at: row.get("expires_at"),
        revoked_at: row.get("revoked_at"),
    };
    append_event(
        &mut tx,
        &tenant_table(&user.id),
        &format!("boundary-grant-revoked-{}", Ulid::new()),
        "wedding_boundary_permission_revoked",
        &reply.wedding_plan_id,
        &reply.response_workspace_id,
        json!({"grant_id": grant_id, "revoked_at": reply.revoked_at}),
    )
    .await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(reply))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TokenRequest {
    token: String,
}

#[derive(Debug)]
struct LiveGrant {
    grant_id: String,
    owner_user_id: String,
    plan: String,
    workspace: String,
    principal: String,
    household_ids: Vec<String>,
    actions: Vec<String>,
    expires_at: String,
}

async fn live_grant(
    tx: &mut Transaction<'_, Postgres>,
    token: &str,
    for_update: bool,
) -> Result<LiveGrant, (StatusCode, String)> {
    let digest = token_digest(token).ok_or_else(unavailable)?;
    let lock = if for_update { " FOR UPDATE" } else { "" };
    let row = sqlx::query(&format!("SELECT grant_id,owner_user_id,wedding_plan_id,response_workspace_id,principal_label,household_ids,allowed_actions,expires_at::text FROM wedding_boundary_helper_grants WHERE token_digest=$1 AND revoked_at IS NULL AND expires_at>NOW(){lock}"))
        .bind(digest).fetch_optional(&mut **tx).await.map_err(store_error)?.ok_or_else(unavailable)?;
    Ok(LiveGrant {
        grant_id: row.get("grant_id"),
        owner_user_id: row.get("owner_user_id"),
        plan: row.get("wedding_plan_id"),
        workspace: row.get("response_workspace_id"),
        principal: row.get("principal_label"),
        household_ids: serde_json::from_value(row.get("household_ids")).unwrap_or_default(),
        actions: serde_json::from_value(row.get("allowed_actions")).unwrap_or_default(),
        expires_at: row.get("expires_at"),
    })
}

async fn open_helper(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<TokenRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_boundary_helper_open", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    if !helper_enabled() {
        return Err(unavailable());
    }
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    let grant = live_grant(&mut tx, &request.token, false).await?;
    sqlx::query("UPDATE wedding_boundary_helper_grants SET open_count=open_count+1,last_opened_at=NOW() WHERE grant_id=$1").bind(&grant.grant_id).execute(&mut *tx).await.map_err(store_error)?;
    let table = tenant_table(&grant.owner_user_id);
    let query = format!(
        "SELECT DISTINCT ON (m.content->>'household_id') m.content FROM {table} m WHERE m.kind='wedding_boundary_household' AND m.content->>'household_id'=ANY($1) AND {} ORDER BY m.content->>'household_id',m.timestamp DESC,m.id DESC",
        metadata_scope("m", 2, 3)
    );
    let households = sqlx::query_scalar::<_, Value>(&query)
        .bind(&grant.household_ids)
        .bind(&grant.plan)
        .bind(&grant.workspace)
        .fetch_all(&mut *tx)
        .await
        .map_err(store_error)?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(
        json!({"grant_id": grant.grant_id, "principal_label": grant.principal, "expires_at": grant.expires_at, "allowed_actions": grant.actions, "households": households.into_iter().map(|value| json!({"household_id": value.get("household_id"), "label": value.get("display_name"), "invitation_allocation": value.get("invitation_allocation"), "request_deadline": value.get("request_deadline")})).collect::<Vec<_>>() }),
    ))
}

async fn replay_or_reserve(
    tx: &mut Transaction<'_, Postgres>,
    owner: &str,
    key: &str,
    kind: &str,
    request_fingerprint: &str,
) -> Result<Option<Value>, (StatusCode, String)> {
    if let Some(row) = sqlx::query("SELECT request_fingerprint,response FROM wedding_boundary_command_receipts WHERE owner_user_id=$1 AND idempotency_key=$2 FOR UPDATE").bind(owner).bind(key).fetch_optional(&mut **tx).await.map_err(store_error)? {
        if row.get::<String, _>("request_fingerprint") != request_fingerprint { return Err(conflict("That save key was already used for a different family boundary command.")); }
        return Ok(Some(row.get("response")));
    }
    sqlx::query("INSERT INTO wedding_boundary_command_receipts (owner_user_id,idempotency_key,command_kind,request_fingerprint,response) VALUES ($1,$2,$3,$4,'null'::jsonb)").bind(owner).bind(key).bind(kind).bind(request_fingerprint).execute(&mut **tx).await.map_err(store_error)?;
    Ok(None)
}

async fn finish_receipt(
    tx: &mut Transaction<'_, Postgres>,
    owner: &str,
    key: &str,
    response: &Value,
) -> Result<(), (StatusCode, String)> {
    sqlx::query("UPDATE wedding_boundary_command_receipts SET response=$3 WHERE owner_user_id=$1 AND idempotency_key=$2").bind(owner).bind(key).bind(response).execute(&mut **tx).await.map_err(store_error)?;
    Ok(())
}

async fn validate_policy_versions(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    request: &Value,
) -> Result<(), (StatusCode, String)> {
    let policy_ids = request
        .get("policy_ids")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let expected = request
        .get("policy_versions")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    for value in policy_ids {
        let policy_id = value.as_str().unwrap_or_default();
        let expected_version = expected.get(policy_id).and_then(Value::as_i64);
        if policy_id.is_empty() || expected_version.is_none() {
            return Err(conflict(
                "This request needs a fresh policy review before approval.",
            ));
        }
        let query = format!(
            "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_policy' AND m.content->>'boundary_object_id'=$1 AND {} ORDER BY COALESCE((m.content->>'version')::bigint,1) DESC,m.timestamp DESC,m.id DESC LIMIT 1 FOR UPDATE",
            metadata_scope("m", 2, 3)
        );
        let current = sqlx::query_scalar::<_, Value>(&query)
            .bind(policy_id)
            .bind(plan)
            .bind(workspace)
            .fetch_optional(&mut **tx)
            .await
            .map_err(store_error)?
            .ok_or_else(|| conflict("A rule used for this request is no longer available."))?;
        let current_version = current.get("version").and_then(Value::as_i64).unwrap_or(1);
        let current_status = current
            .get("rule_status")
            .or_else(|| current.get("status"))
            .and_then(Value::as_str)
            .unwrap_or("active");
        if Some(current_version) != expected_version || current_status != "active" {
            return Err(conflict(
                "A family rule changed after this request was created. Review the impact again.",
            ));
        }
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProposeRequest {
    token: String,
    household_id: String,
    change_type: String,
    request_label: String,
    proposed_guest_name: String,
    idempotency_key: String,
}

async fn propose_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ProposeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_boundary_helper_propose", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    if !helper_enabled()
        || !valid_id(&request.household_id)
        || !valid_id(&request.idempotency_key)
        || !valid_label(&request.request_label)
        || !valid_label(&request.proposed_guest_name)
    {
        return Err(unavailable());
    }
    if request.change_type != "add_guest" {
        return Err(bad(
            "This family link currently supports named guest suggestions only.",
        ));
    }
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    let grant = live_grant(&mut tx, &request.token, true).await?;
    if !grant.actions.iter().any(|value| value == "propose_request")
        || !grant.household_ids.contains(&request.household_id)
    {
        return Err(unavailable());
    }
    let household_query = format!(
        "SELECT m.content FROM {} m WHERE m.kind='wedding_boundary_household' AND m.content->>'household_id'=$1 AND {} ORDER BY COALESCE((m.content->>'revision')::bigint,1) DESC,m.timestamp DESC,m.id DESC LIMIT 1",
        tenant_table(&grant.owner_user_id),
        metadata_scope("m", 2, 3)
    );
    let household = sqlx::query_scalar::<_, Value>(&household_query)
        .bind(&request.household_id)
        .bind(&grant.plan)
        .bind(&grant.workspace)
        .fetch_optional(&mut *tx)
        .await
        .map_err(store_error)?
        .ok_or_else(unavailable)?;
    let household_revision = household
        .get("revision")
        .and_then(Value::as_i64)
        .unwrap_or(1);
    let target_person_id = format!("wedding_guest:{}:{}", grant.workspace, Ulid::new());
    let request_fingerprint = fingerprint(
        &json!({"grant": grant.grant_id, "household": request.household_id, "change": request.change_type, "label": request.request_label, "guest": request.proposed_guest_name}),
    );
    if let Some(response) = replay_or_reserve(
        &mut tx,
        &grant.owner_user_id,
        &request.idempotency_key,
        "helper_propose",
        &request_fingerprint,
    )
    .await?
    {
        tx.commit().await.map_err(store_error)?;
        return Ok(Json(response));
    }
    let request_id = format!("wedding-boundary-request-{}", Ulid::new());
    let response = json!({"request_id": request_id, "status": "pending", "replayed": false, "explanation": "Request sent for the couple to review. Nothing changed on the guest list."});
    append_event(&mut tx, &tenant_table(&grant.owner_user_id), &request_id, "wedding_boundary_change_request", &grant.plan, &grant.workspace, json!({"ledger_kind":"wedding_boundary_change_request","boundary_object_id":request_id,"title":request.request_label.trim(),"request_id":request_id,"requested_by":format!("helper_grant:{}",grant.grant_id),"change_type":request.change_type,"target_household_id":request.household_id,"target_person_id":target_person_id,"proposed_guest_name":request.proposed_guest_name.trim(),"expected_household_revision":household_revision,"request_status":"pending","approval_required":true,"approval_gate_recorded":true,"policy_ids":[],"policy_versions":{},"public_reason":"A family helper suggested adding this guest.","revision":1,"visibility":"couple_only"})).await?;
    finish_receipt(
        &mut tx,
        &grant.owner_user_id,
        &request.idempotency_key,
        &response,
    )
    .await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(response))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DecisionRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    request_id: String,
    decision: String,
    expected_revision: i64,
    approval_actor_id: Option<String>,
    #[serde(default)]
    confirmed_elevated_impact: bool,
    idempotency_key: String,
}

async fn decide_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<DecisionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_boundary_decision", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&request.wedding_plan_id)
        || !valid_id(&request.response_workspace_id)
        || !valid_id(&request.request_id)
        || !valid_id(&request.idempotency_key)
        || !["approve", "decline", "withdraw"].contains(&request.decision.as_str())
        || request.expected_revision < 1
    {
        return Err(bad("Choose a valid current family request decision."));
    }
    state
        .db
        .ensure_user_private_schema(&user.id)
        .await
        .map_err(store_error)?;
    let table = tenant_table(&user.id);
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(format!("{}:{}", user.id, request.request_id))
        .execute(&mut *tx)
        .await
        .map_err(store_error)?;
    let request_fingerprint = fingerprint(
        &json!({"plan":request.wedding_plan_id,"workspace":request.response_workspace_id,"request":request.request_id,"decision":request.decision,"expected_revision":request.expected_revision,"approval_actor_id":request.approval_actor_id,"confirmed_elevated_impact":request.confirmed_elevated_impact}),
    );
    if let Some(response) = replay_or_reserve(
        &mut tx,
        &user.id,
        &request.idempotency_key,
        "decide_request",
        &request_fingerprint,
    )
    .await?
    {
        tx.commit().await.map_err(store_error)?;
        return Ok(Json(response));
    }
    let query = format!(
        "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_change_request' AND m.content->>'request_id'=$1 AND {} ORDER BY COALESCE((m.content->>'revision')::bigint,1) DESC,m.timestamp DESC,m.id DESC LIMIT 1 FOR UPDATE",
        metadata_scope("m", 2, 3)
    );
    let current = sqlx::query_scalar::<_, Value>(&query)
        .bind(&request.request_id)
        .bind(&request.wedding_plan_id)
        .bind(&request.response_workspace_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(store_error)?
        .ok_or((
            StatusCode::FORBIDDEN,
            "That family request is not part of this wedding.".into(),
        ))?;
    let revision = current.get("revision").and_then(Value::as_i64).unwrap_or(1);
    if revision != request.expected_revision {
        return Err(conflict(
            "This request changed on another screen. Refresh before deciding.",
        ));
    }
    let current_status = current.get("request_status").and_then(Value::as_str);
    if !matches!(current_status, Some("pending") | Some("partially_approved")) {
        return Err(conflict("This family request has already been decided."));
    }
    if request.decision == "approve"
        && let Some(household_id) = current.get("target_household_id").and_then(Value::as_str)
    {
        sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
            .bind(format!(
                "boundary-capacity:{}:{}:{household_id}",
                user.id, request.response_workspace_id
            ))
            .execute(&mut *tx)
            .await
            .map_err(store_error)?;
    }
    let required_approvals = current
        .get("required_approval_count")
        .and_then(Value::as_i64)
        .unwrap_or(1)
        .clamp(1, 2);
    if request.decision == "approve" && required_approvals == 2 {
        let actor = request
            .approval_actor_id
            .as_deref()
            .filter(|value| valid_id(value))
            .ok_or_else(|| bad("Choose which partner is approving this request."))?;
        let role_query = format!(
            "SELECT EXISTS(SELECT 1 FROM {table} m WHERE m.kind='wedding_boundary_role_assignment' AND m.content->>'person_id'=$1 AND m.content->>'role'='couple' AND COALESCE(m.content->>'status','active')='active' AND {})",
            metadata_scope("m", 2, 3)
        );
        let valid_actor = sqlx::query_scalar::<_, bool>(&role_query)
            .bind(actor)
            .bind(&request.wedding_plan_id)
            .bind(&request.response_workspace_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(store_error)?;
        if !valid_actor {
            return Err((
                StatusCode::FORBIDDEN,
                "That approver is not an active partner for this wedding.".into(),
            ));
        }
        let approval_query = format!(
            "SELECT COUNT(DISTINCT m.content->>'actor_person_id') FROM {table} m WHERE m.kind='wedding_boundary_approval' AND m.content->>'request_id'=$1 AND {}",
            metadata_scope("m", 2, 3)
        );
        let approval_count = sqlx::query_scalar::<_, i64>(&approval_query)
            .bind(&request.request_id)
            .bind(&request.wedding_plan_id)
            .bind(&request.response_workspace_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(store_error)?;
        let duplicate_query = format!(
            "SELECT EXISTS(SELECT 1 FROM {table} m WHERE m.kind='wedding_boundary_approval' AND m.content->>'request_id'=$1 AND m.content->>'actor_person_id'=$2 AND {})",
            metadata_scope("m", 3, 4)
        );
        let duplicate = sqlx::query_scalar::<_, bool>(&duplicate_query)
            .bind(&request.request_id)
            .bind(actor)
            .bind(&request.wedding_plan_id)
            .bind(&request.response_workspace_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(store_error)?;
        if duplicate {
            return Err(conflict(
                "This partner has already approved the current request.",
            ));
        }
        append_event(&mut tx, &table, &format!("boundary-approval-{}", Ulid::new()), "wedding_boundary_approval", &request.wedding_plan_id, &request.response_workspace_id, json!({"request_id":request.request_id,"actor_person_id":actor,"reviewed_revision":revision,"approval_number":approval_count + 1,"private_content_copied":false})).await?;
        if approval_count + 1 < required_approvals {
            let mut partial = current.clone();
            if let Some(object) = partial.as_object_mut() {
                object.insert("request_status".into(), json!("partially_approved"));
                object.insert("status".into(), json!("partially_approved"));
                object.insert("revision".into(), json!(revision + 1));
                object.insert("approval_count".into(), json!(approval_count + 1));
            }
            append_event(
                &mut tx,
                &table,
                &format!("request-partial-{}", Ulid::new()),
                "wedding_boundary_change_request",
                &request.wedding_plan_id,
                &request.response_workspace_id,
                partial,
            )
            .await?;
            let response = json!({"request_id":request.request_id,"status":"partially_approved","approval_count":approval_count + 1,"required_approval_count":required_approvals,"replayed":false,"explanation":"One partner approved. No guest, invitation, budget, seating or vendor record changed while the second approval is pending."});
            finish_receipt(&mut tx, &user.id, &request.idempotency_key, &response).await?;
            tx.commit().await.map_err(store_error)?;
            return Ok(Json(response));
        }
    }
    let status = match request.decision.as_str() {
        "approve" => "approved",
        "decline" => "declined",
        _ => "withdrawn",
    };
    let impact = if status == "approved" {
        validate_policy_versions(
            &mut tx,
            &table,
            &request.wedding_plan_id,
            &request.response_workspace_id,
            &current,
        )
        .await?;
        Some(
            request_mutations::apply(
                &mut tx,
                &table,
                &request.wedding_plan_id,
                &request.response_workspace_id,
                &current,
                request.confirmed_elevated_impact,
            )
            .await?,
        )
    } else {
        None
    };
    let decision_id = format!("wedding-boundary-decision-{}", Ulid::new());
    let receipt_id = format!("wedding-boundary-impact-{}", Ulid::new());
    let mut updated = current.clone();
    if let Some(object) = updated.as_object_mut() {
        object.insert("request_status".into(), json!(status));
        object.insert("status".into(), json!(status));
        object.insert("approval_required".into(), json!(false));
        object.insert("approval_gate_recorded".into(), json!(false));
        object.insert("revision".into(), json!(revision + 1));
        object.insert("decision_id".into(), json!(&decision_id));
    }
    append_event(
        &mut tx,
        &table,
        &format!("request-revision-{}", Ulid::new()),
        "wedding_boundary_change_request",
        &request.wedding_plan_id,
        &request.response_workspace_id,
        updated,
    )
    .await?;
    append_event(&mut tx, &table, &decision_id, "wedding_boundary_decision", &request.wedding_plan_id, &request.response_workspace_id, json!({"decision_id":decision_id,"request_id":request.request_id,"decision":request.decision,"reviewed_revision":revision,"status":status,"actor":"couple","private_content_copied":false})).await?;
    let effects = impact
        .as_ref()
        .map(|value| value.effects.clone())
        .unwrap_or_default();
    let connected_updates = impact
        .as_ref()
        .map(|value| value.connected_updates.clone())
        .unwrap_or_default();
    let previous_invitation_status = impact
        .as_ref()
        .and_then(|value| value.previous_invitation_status.clone());
    let response_history_preserved = impact
        .as_ref()
        .is_some_and(|value| value.response_history_preserved);
    append_event(&mut tx, &table, &receipt_id, "wedding_boundary_impact_receipt", &request.wedding_plan_id, &request.response_workspace_id, json!({"receipt_id":receipt_id,"decision_id":decision_id,"request_id":request.request_id,"actor":"couple","causation":{"request_id":request.request_id,"decision_id":decision_id},"expected_request_revision":revision,"effects":effects,"connected_updates":connected_updates,"previous_invitation_status":previous_invitation_status,"response_history_preserved":response_history_preserved,"attendance_inferred":false,"invitation_sent":false,"spend_committed":false,"vendor_contract_changed":false,"private_content_copied":false})).await?;
    let explanation = if status == "approved" {
        "Request approved. Connected wedding views will refresh from one decision receipt."
    } else {
        "The guest list stays unchanged and the decision is recorded."
    };
    let response = json!({"request_id":request.request_id,"decision_id":decision_id,"impact_receipt_id":receipt_id,"status":status,"replayed":false,"explanation":explanation,"connected_updates":connected_updates,"response_history_preserved":response_history_preserved});
    finish_receipt(&mut tx, &user.id, &request.idempotency_key, &response).await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(response))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_digest_requires_256_bits() {
        assert!(token_digest("short").is_none());
        let (token, digest) = new_token();
        assert_eq!(token_digest(&token).as_deref(), Some(digest.as_str()));
    }

    #[test]
    fn identifiers_and_labels_are_bounded() {
        assert!(valid_id("household:rivera-1"));
        assert!(!valid_id("../../ household"));
        assert!(valid_label("Rivera family"));
        assert!(!valid_label("\n"));
    }

    #[test]
    fn helper_never_receives_approval_authority() {
        assert_eq!(HELPER_ACTIONS, ["view_summary", "propose_request"]);
        assert!(!HELPER_ACTIONS.contains(&"approve_request"));
    }
}
