use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_user, public_rate_limit_key},
    authenticated_rate_limit_key, enforce_rate_limit,
};
use crate::db::{
    WeddingRsvpCapabilityGrantCreate, WeddingRsvpCapabilityGrantRotation,
    WeddingRsvpCapabilityGrantSummary,
};
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header::CACHE_CONTROL},
    response::IntoResponse,
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chacha20poly1305::aead::{OsRng, rand_core::RngCore};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, sync::Arc, time::Duration};
use ulid::Ulid;

const MAX_GRANT_DAYS: i64 = 30;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/rsvp/capabilities/status", get(status_http))
        .route(
            "/wedding/rsvp/capabilities",
            get(list_http).post(create_http),
        )
        .route(
            "/wedding/rsvp/capabilities/{grant_id}/revoke",
            post(revoke_http),
        )
        .route(
            "/wedding/rsvp/capabilities/{grant_id}/regenerate",
            post(regenerate_http),
        )
        .route("/wedding/rsvp/capabilities/open", post(open_http))
}

fn enabled() -> bool {
    std::env::var("OMNYID_WEDDING_RSVP_PUBLIC_ENABLED")
        .ok()
        .as_deref()
        == Some("true")
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

fn unavailable() -> (StatusCode, String) {
    (
        StatusCode::NOT_FOUND,
        "This RSVP invitation is not available.".into(),
    )
}

fn bad_request(message: &str) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}

fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!(error_kind = %error.as_database_error().map(|value| format!("{:?}", value.kind())).unwrap_or_else(|| "storage".into()), "Wedding RSVP capability persistence failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "RSVP invitations are temporarily unavailable.".into(),
    )
}

pub(crate) fn token_digest(token: &str) -> Option<String> {
    let bytes = URL_SAFE_NO_PAD.decode(token.trim()).ok()?;
    if bytes.len() != 32 {
        return None;
    }
    Some(hex::encode(Sha256::digest(bytes)))
}

fn new_token() -> (String, String) {
    let mut entropy = [0_u8; 32];
    OsRng.fill_bytes(&mut entropy);
    (
        URL_SAFE_NO_PAD.encode(entropy),
        hex::encode(Sha256::digest(entropy)),
    )
}

fn parse_expiry(value: &str, now: DateTime<Utc>) -> Result<DateTime<Utc>, (StatusCode, String)> {
    let expiry = DateTime::parse_from_rfc3339(value)
        .map_err(|_| bad_request("Choose a valid RSVP link expiry."))?
        .with_timezone(&Utc);
    if expiry < now + ChronoDuration::minutes(15)
        || expiry > now + ChronoDuration::days(MAX_GRANT_DAYS)
    {
        return Err(bad_request(
            "RSVP link expiry must be between 15 minutes and 30 days from now.",
        ));
    }
    Ok(expiry)
}

#[derive(Serialize)]
struct StatusResponse {
    enabled: bool,
    max_expiry_days: i64,
    token_in_fragment: bool,
}

async fn status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<StatusResponse>, (StatusCode, String)> {
    let _ = authenticated_user(&state.db, &headers).await?;
    Ok(Json(StatusResponse {
        enabled: enabled(),
        max_expiry_days: MAX_GRANT_DAYS,
        token_in_fragment: true,
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CapabilityQuery {
    response_workspace_id: String,
}

async fn list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<CapabilityQuery>,
) -> Result<Json<Vec<WeddingRsvpCapabilityGrantSummary>>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&query.response_workspace_id) {
        return Err(bad_request("Choose a valid Wedding workspace."));
    }
    state
        .db
        .list_wedding_rsvp_capability_grants(&user.id, &query.response_workspace_id)
        .await
        .map(Json)
        .map_err(store_error)
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreateRequest {
    pub(crate) wedding_plan_id: String,
    pub(crate) response_workspace_id: String,
    pub(crate) household_id: String,
    pub(crate) invitation_ids: Vec<String>,
    pub(crate) expires_at: String,
}

#[derive(Serialize)]
struct CreateResponse {
    grant: WeddingRsvpCapabilityGrantSummary,
    token: String,
}

pub(crate) fn validate_create(
    request: &CreateRequest,
    now: DateTime<Utc>,
) -> Result<DateTime<Utc>, (StatusCode, String)> {
    if !valid_id(&request.wedding_plan_id)
        || !valid_id(&request.response_workspace_id)
        || !valid_id(&request.household_id)
        || request.invitation_ids.is_empty()
        || request.invitation_ids.len() > 100
        || request.invitation_ids.iter().any(|id| !valid_id(id))
        || request.invitation_ids.iter().collect::<HashSet<_>>().len()
            != request.invitation_ids.len()
    {
        return Err(bad_request(
            "Choose one household and its valid Wedding invitations.",
        ));
    }
    parse_expiry(&request.expires_at, now)
}

async fn create_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateRequest>,
) -> Result<Json<CreateResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_rsvp_capability_create", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !enabled() {
        return Err(unavailable());
    }
    let expires_at = validate_create(&request, Utc::now())?;
    let (token, token_digest) = new_token();
    let input = WeddingRsvpCapabilityGrantCreate {
        grant_id: format!("rsvp-capability-{}", Ulid::new()),
        wedding_plan_id: request.wedding_plan_id,
        response_workspace_id: request.response_workspace_id,
        household_id: request.household_id,
        invitation_ids: request.invitation_ids,
        token_digest,
        expires_at,
    };
    let grant = state
        .db
        .create_wedding_rsvp_capability_grant(&user.id, input)
        .await
        .map_err(store_error)?
        .ok_or_else(|| bad_request("Those invitations do not belong to one household."))?;
    Ok(Json(CreateResponse { grant, token }))
}

async fn revoke_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(grant_id): Path<String>,
) -> Result<Json<WeddingRsvpCapabilityGrantSummary>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&grant_id) {
        return Err(unavailable());
    }
    state
        .db
        .revoke_wedding_rsvp_capability_grant(&user.id, &grant_id)
        .await
        .map_err(store_error)?
        .map(Json)
        .ok_or_else(unavailable)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RegenerateRequest {
    expires_at: String,
}

async fn regenerate_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(grant_id): Path<String>,
    Json(request): Json<RegenerateRequest>,
) -> Result<Json<CreateResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_rsvp_capability_regenerate", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !enabled() || !valid_id(&grant_id) {
        return Err(unavailable());
    }
    let expires_at = parse_expiry(&request.expires_at, Utc::now())?;
    let (token, token_digest) = new_token();
    let grant = state
        .db
        .rotate_wedding_rsvp_capability_grant(
            &user.id,
            WeddingRsvpCapabilityGrantRotation {
                source_grant_id: grant_id,
                grant_id: format!("rsvp-capability-{}", Ulid::new()),
                token_digest,
                expires_at,
            },
        )
        .await
        .map_err(store_error)?
        .ok_or_else(unavailable)?;
    Ok(Json(CreateResponse { grant, token }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TokenRequest {
    token: String,
}

async fn open_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<TokenRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_rsvp_capability_open", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(3600),
        },
    )
    .await?;
    if !enabled() {
        return Err(unavailable());
    }
    let digest = token_digest(&request.token).ok_or_else(unavailable)?;
    let scope = state
        .db
        .open_wedding_rsvp_capability(&digest)
        .await
        .map_err(store_error)?
        .ok_or_else(unavailable)?;
    Ok(([(CACHE_CONTROL, "private, no-store")], Json(scope)))
}
