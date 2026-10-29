use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_user, public_rate_limit_key},
    authenticated_rate_limit_key, enforce_rate_limit,
};
use crate::db::{WeddingRunSheetShareGrantCreate, WeddingRunSheetShareGrantSummary};
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
        .route(
            "/database/wedding-runsheet/shares/capability",
            get(capability_http),
        )
        .route(
            "/database/wedding-runsheet/shares",
            get(list_http).post(create_http),
        )
        .route(
            "/database/wedding-runsheet/shares/{grant_id}/revoke",
            post(revoke_http),
        )
        .route("/database/wedding-runsheet/shares/open", post(open_http))
        .route(
            "/database/wedding-runsheet/shares/acknowledge",
            post(acknowledge_http),
        )
}

fn enabled() -> bool {
    std::env::var("OMNYID_WEDDING_RUNSHEET_SHARING_ENABLED")
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

fn bounded_text(value: &str, max: usize) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty() && trimmed.chars().count() <= max && !trimmed.chars().any(char::is_control)
}

fn token_digest(token: &str) -> Option<String> {
    let bytes = URL_SAFE_NO_PAD.decode(token.trim()).ok()?;
    if bytes.len() != 32 {
        return None;
    }
    Some(hex::encode(Sha256::digest(bytes)))
}

fn unavailable() -> (StatusCode, String) {
    (
        StatusCode::NOT_FOUND,
        "This protected run sheet is not available.".into(),
    )
}
fn bad_request(message: &str) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}
fn store_error(error: sqlx::Error) -> (StatusCode, String) {
    tracing::error!(%error, "Wedding run-sheet sharing persistence failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Run-sheet sharing is temporarily unavailable.".into(),
    )
}

#[derive(Serialize)]
struct CapabilityResponse {
    enabled: bool,
    max_expiry_days: i64,
    token_in_fragment: bool,
}

async fn capability_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<CapabilityResponse>, (StatusCode, String)> {
    let _ = authenticated_user(&state.db, &headers).await?;
    Ok(Json(CapabilityResponse {
        enabled: enabled(),
        max_expiry_days: MAX_GRANT_DAYS,
        token_in_fragment: true,
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ShareQuery {
    database_id: String,
}

async fn list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<ShareQuery>,
) -> Result<Json<Vec<WeddingRunSheetShareGrantSummary>>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&query.database_id) {
        return Err(bad_request("Choose a valid run sheet."));
    }
    state
        .db
        .list_wedding_runsheet_share_grants(&user.id, &query.database_id)
        .await
        .map(Json)
        .map_err(store_error)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateRequest {
    database_id: String,
    wedding_plan_id: String,
    view_id: String,
    view_revision: i64,
    recipient_role: String,
    recipient_label: String,
    record_ids: Vec<String>,
    signoff_required: bool,
    signoff_due_at: Option<String>,
    expires_at: String,
}

#[derive(Serialize)]
struct CreateResponse {
    grant: WeddingRunSheetShareGrantSummary,
    token: String,
}

fn validate_create(
    request: &CreateRequest,
    now: DateTime<Utc>,
) -> Result<(DateTime<Utc>, Option<DateTime<Utc>>), (StatusCode, String)> {
    if !valid_id(&request.database_id)
        || !valid_id(&request.wedding_plan_id)
        || !valid_id(&request.view_id)
        || request.view_revision < 1
    {
        return Err(bad_request("Choose a valid saved run-sheet view."));
    }
    if !matches!(
        request.recipient_role.as_str(),
        "vendor" | "photo_video" | "vip" | "guest"
    ) || !bounded_text(&request.recipient_label, 120)
    {
        return Err(bad_request("Choose a valid recipient role and label."));
    }
    if request.signoff_required && request.recipient_role != "vendor" {
        return Err(bad_request(
            "Only a vendor view can request final sign-off.",
        ));
    }
    if request.record_ids.is_empty()
        || request.record_ids.len() > 500
        || request.record_ids.iter().any(|id| !valid_id(id))
        || request.record_ids.iter().collect::<HashSet<_>>().len() != request.record_ids.len()
    {
        return Err(bad_request(
            "Preview between 1 and 500 unique run-sheet items before sharing.",
        ));
    }
    let expires_at = DateTime::parse_from_rfc3339(&request.expires_at)
        .map_err(|_| bad_request("Choose a valid expiry."))?
        .with_timezone(&Utc);
    if expires_at < now + ChronoDuration::minutes(15)
        || expires_at > now + ChronoDuration::days(MAX_GRANT_DAYS)
    {
        return Err(bad_request(
            "Expiry must be between 15 minutes and 30 days from now.",
        ));
    }
    let signoff_due_at = request
        .signoff_due_at
        .as_deref()
        .map(DateTime::parse_from_rfc3339)
        .transpose()
        .map_err(|_| bad_request("Choose a valid sign-off deadline."))?
        .map(|value| value.with_timezone(&Utc));
    if request.signoff_required && signoff_due_at.is_none() {
        return Err(bad_request("Choose a sign-off deadline for this vendor."));
    }
    if signoff_due_at.is_some_and(|due| due <= now || due > expires_at) {
        return Err(bad_request("Sign-off must be due before the link expires."));
    }
    Ok((expires_at, signoff_due_at))
}

async fn create_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateRequest>,
) -> Result<Json<CreateResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_runsheet_share_create", &headers),
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
    let (expires_at, signoff_due_at) = validate_create(&request, Utc::now())?;
    let mut entropy = [0_u8; 32];
    OsRng.fill_bytes(&mut entropy);
    let token = URL_SAFE_NO_PAD.encode(entropy);
    let digest = hex::encode(Sha256::digest(entropy));
    let input = WeddingRunSheetShareGrantCreate {
        grant_id: format!("runsheet-share-{}", Ulid::new()),
        database_id: request.database_id,
        wedding_plan_id: request.wedding_plan_id,
        view_id: request.view_id,
        view_revision: request.view_revision,
        token_digest: digest,
        recipient_role: request.recipient_role,
        recipient_label: request.recipient_label.trim().into(),
        record_ids: request.record_ids,
        signoff_required: request.signoff_required,
        signoff_due_at,
        expires_at,
    };
    let grant = state
        .db
        .create_wedding_runsheet_share_grant(&user.id, input)
        .await
        .map_err(store_error)?
        .ok_or_else(|| {
            bad_request("Save and preview a matching non-private role view before sharing.")
        })?;
    Ok(Json(CreateResponse { grant, token }))
}

async fn revoke_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(grant_id): Path<String>,
) -> Result<Json<WeddingRunSheetShareGrantSummary>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&grant_id) {
        return Err(unavailable());
    }
    state
        .db
        .revoke_wedding_runsheet_share_grant(&user.id, &grant_id)
        .await
        .map_err(store_error)?
        .map(Json)
        .ok_or_else(unavailable)
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
        public_rate_limit_key("wedding_runsheet_share_open", &headers),
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
    let view = state
        .db
        .open_wedding_runsheet_share(&digest)
        .await
        .map_err(store_error)?
        .ok_or_else(unavailable)?;
    Ok(([(CACHE_CONTROL, "private, no-store")], Json(view)))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AcknowledgeRequest {
    token: String,
    status: String,
    actor_label: String,
    note: Option<String>,
    idempotency_key: String,
}

async fn acknowledge_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<AcknowledgeRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_runsheet_share_ack", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(3600),
        },
    )
    .await?;
    if !enabled() {
        return Err(unavailable());
    }
    if !matches!(
        request.status.as_str(),
        "acknowledged" | "changes_requested"
    ) || !bounded_text(&request.actor_label, 120)
        || !valid_id(&request.idempotency_key)
        || request.note.as_ref().is_some_and(|note| {
            note.chars().count() > 1000 || note.chars().any(|character| character == '\0')
        })
    {
        return Err(bad_request("Check the sign-off response and try again."));
    }
    let digest = token_digest(&request.token).ok_or_else(unavailable)?;
    let acknowledgement_id = format!("runsheet-ack-{}", Ulid::new());
    let acknowledgement = state
        .db
        .acknowledge_wedding_runsheet_share(
            &digest,
            &acknowledgement_id,
            &request.status,
            request.actor_label.trim(),
            request
                .note
                .as_deref()
                .map(str::trim)
                .filter(|note| !note.is_empty()),
            &request.idempotency_key,
        )
        .await
        .map_err(store_error)?
        .ok_or_else(unavailable)?;
    Ok((
        [(CACHE_CONTROL, "private, no-store")],
        Json(acknowledgement),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> CreateRequest {
        CreateRequest {
            database_id: "database:runsheet".into(),
            wedding_plan_id: "plan-1".into(),
            view_id: "wedding-runsheet-vendor".into(),
            view_revision: 1,
            recipient_role: "vendor".into(),
            recipient_label: "Venue manager".into(),
            record_ids: vec!["row-1".into()],
            signoff_required: true,
            signoff_due_at: Some((Utc::now() + ChronoDuration::days(2)).to_rfc3339()),
            expires_at: (Utc::now() + ChronoDuration::days(3)).to_rfc3339(),
        }
    }

    #[test]
    fn token_digest_requires_full_random_capability() {
        assert!(token_digest("short").is_none());
        let token = URL_SAFE_NO_PAD.encode([7_u8; 32]);
        assert_eq!(token_digest(&token).unwrap().len(), 64);
    }

    #[test]
    fn vendor_signoff_is_bounded_by_expiry() {
        let now = Utc::now();
        assert!(validate_create(&request(), now).is_ok());
        let mut invalid = request();
        invalid.recipient_role = "guest".into();
        assert!(validate_create(&invalid, now).is_err());
        let mut long = request();
        long.expires_at = (now + ChronoDuration::days(31)).to_rfc3339();
        assert!(validate_create(&long, now).is_err());
    }
}
