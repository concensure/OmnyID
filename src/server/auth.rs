use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;

use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use rand::Rng;
use serde_json::Value;
use sqlx::Row;
use tonic::Status;
use tower_http::cors::CorsLayer;
use tracing::warn;
use ulid::Ulid;

use crate::{
    db::{AuthSessionRecord, Db, ManagedAgentRecord, UserAccountStatusRecord, UserRecord},
    message::AFPMessage,
};

use super::{
    AppState, RateLimitPolicy, internal_error, internal_http_error, status_to_http, types::*,
};
mod apple_config; pub(super) use apple_config::apple_auth_config_http; use apple_config::apple_client_id_configured;
mod verification_source;

const APPLE_JWKS_URL: &str = "https://appleid.apple.com/auth/keys";
const APPLE_JWKS_CACHE_TTL_SECS: u64 = 300;
const SESSION_COOKIE_NAME: &str = "omnyid_session";
const SESSION_COOKIE_MAX_AGE_SECS: i64 = 30 * 24 * 60 * 60;

// ── Auth / registration ────────────────────────────────────────────────────────

pub(super) async fn register_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("register", &headers),
        RateLimitPolicy {
            max_requests: 8,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let email = request.email.trim().to_lowercase();
    let password = request.password.trim().to_string();
    let verification_source = request.source.clone();
    let display_name = request
        .display_name
        .unwrap_or_else(|| email.split('@').next().unwrap_or("Omnyid User").to_string())
        .trim()
        .to_string();

    validate_registration_fields(&email, &display_name, &password)?;

    if let Some(existing_user) = state
        .db
        .find_user_by_email(&email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        let email_verified = state
            .db
            .is_user_email_verified(&existing_user.id)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        if !email_verified && existing_user.auth_provider == "password" {
            if let Err(err) = issue_and_send_verification_email(&state, &existing_user, verification_source.as_deref()).await {
                warn!(
                    user_id = %existing_user.id,
                    error = %err.1,
                    "Verification email could not be delivered during registration"
                );
                return Ok(Json(registration_delivery_unavailable_response(&email)));
            }
        }
        return Ok(Json(registration_public_response(&email)));
    }

    let password_hash = hash_password(&password).map_err(internal_http_error)?;
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: email.clone(),
        password_hash: Some(password_hash),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state
        .db
        .create_user(&user)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    ensure_user_agents_and_demo_seed(&state, &user)
        .await
        .map_err(internal_http_error)?;
    if let Err(err) = issue_and_send_verification_email(&state, &user, verification_source.as_deref()).await {
        warn!(
            user_id = %user.id,
            error = %err.1,
            "Verification email could not be delivered during registration"
        );
        return Ok(Json(registration_delivery_unavailable_response(
            &user.email,
        )));
    }

    Ok(Json(registration_public_response(&user.email)))
}

fn validate_registration_fields(
    email: &str,
    display_name: &str,
    password: &str,
) -> Result<(), (StatusCode, String)> {
    if email.is_empty() || !email.contains('@') {
        return Err((
            StatusCode::BAD_REQUEST,
            "valid email is required".to_string(),
        ));
    }
    if email.len() > 254 {
        return Err((StatusCode::BAD_REQUEST, "email too long".to_string()));
    }
    if display_name.len() > 100 {
        return Err((
            StatusCode::BAD_REQUEST,
            "display_name must be 100 characters or fewer".to_string(),
        ));
    }
    if password.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "password must be at least 8 characters".to_string(),
        ));
    }
    Ok(())
}

pub(super) async fn login_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> Result<Response, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("login", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let email = request.email.trim().to_lowercase();
    let user = state
        .db
        .find_user_by_email(&email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(login_invalid_credentials_error)?;

    let password_hash = user
        .password_hash
        .clone()
        .ok_or_else(login_invalid_credentials_error)?;
    if !verify_password(&password_hash, request.password.trim()).map_err(internal_http_error)? {
        return Err(login_invalid_credentials_error());
    }

    let email_verified = state
        .db
        .is_user_email_verified(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    if !email_verified {
        let _ = issue_and_send_verification_email(&state, &user, None).await;
        return Err(login_invalid_credentials_error());
    }

    let session = create_session_for_user(&state.db, &user).await?;
    Ok(auth_response_with_session_cookie(session, &user, false))
}

pub(super) async fn google_auth_config_http() -> Json<GoogleAuthConfigResponse> {
    let client_id = google_client_id_configured();
    Json(GoogleAuthConfigResponse {
        enabled: client_id.is_some(),
        client_id,
    })
}

pub(super) async fn google_auth_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<GoogleAuthRequest>,
) -> Result<Response, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("google_auth", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let token_info = verify_google_id_token(&request.id_token)
        .await
        .map_err(|err| {
            warn!("google sign-in rejected: {err}");
            external_sign_in_failed_error()
        })?;
    let google_subjects = google_subject_candidates(&token_info.sub);
    let google_subject = google_subjects[0].clone();

    let (user, account_created) = if let Some(existing) = state
        .db
        .find_user_by_any_google_sub(&google_subjects)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        (existing, false)
    } else if let Some(existing_email) = state
        .db
        .find_user_by_email(&token_info.email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        let linked = state
            .db
            .bind_user_google_sub_if_unset_or_matching_any(
                &existing_email.id,
                &google_subject,
                &google_subjects,
            )
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        if !linked {
            return Err(external_sign_in_failed_error());
        }
        (existing_email, false)
    } else {
        let user = UserRecord {
            id: Ulid::new().to_string(),
            email: token_info.email.clone(),
            password_hash: None,
            auth_provider: "google".to_string(),
            google_sub: Some(google_subject),
            display_name: token_info
                .name
                .clone()
                .or(token_info.given_name.clone())
                .unwrap_or_else(|| {
                    token_info
                        .email
                        .split('@')
                        .next()
                        .unwrap_or("Omnyid User")
                        .to_string()
                }),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        state
            .db
            .create_user(&user)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        ensure_user_agents_and_demo_seed(&state, &user)
            .await
            .map_err(internal_http_error)?;
        (user, true)
    };

    state
        .db
        .mark_email_verified(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let session = create_session_for_user(&state.db, &user).await?;
    Ok(auth_response_with_session_cookie(session, &user, account_created))
}

fn passkey_rp_id_configured() -> Result<String, (StatusCode, String)> {
    let rp_id = std::env::var("OMNYID_RP_ID").map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Passkey auth is not configured on this homeserver. Set OMNYID_RP_ID.".to_string(),
        )
    })?;
    let trimmed = rp_id.trim();
    if trimmed.is_empty() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Passkey auth is not configured on this homeserver. Set OMNYID_RP_ID.".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

fn passkey_origin_configured() -> Result<String, (StatusCode, String)> {
    let origin = std::env::var("OMNYID_ORIGIN").map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Passkey auth is not configured on this homeserver. Set OMNYID_ORIGIN.".to_string(),
        )
    })?;
    let trimmed = origin.trim();
    if trimmed.is_empty() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Passkey auth is not configured on this homeserver. Set OMNYID_ORIGIN.".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

fn passkey_public_rate_limit_key(label: &str, user_id: &str, headers: &HeaderMap) -> String {
    let normalized = user_id.trim();
    let source = request_ip_identity(headers);
    if normalized.is_empty() {
        format!("{label}:{source}:anonymous")
    } else {
        format!("{label}:{source}:{normalized}")
    }
}

fn passkey_authentication_begin_options(
    rp_id: &str,
) -> (crate::webauthn::AuthenticationOptions, String) {
    // Passkey registration requires discoverable resident credentials, so the
    // public begin step does not need to reveal stored credential IDs.
    crate::webauthn::authentication_options(&[], rp_id)
}

fn normalize_passkey_begin_email(email: &str) -> Option<String> {
    let normalized = email.trim().to_lowercase();
    if normalized.is_empty() || !normalized.contains('@') {
        return None;
    }
    Some(normalized)
}

fn passkey_authenticate_challenge_kind(headers: &HeaderMap) -> String {
    let source = request_ip_identity(headers);
    let source_hash = sha256_token(&source);
    format!("authenticate:{}", &source_hash[..16])
}

/// POST /auth/apple — Sign in with Apple.
/// The Apple identity token is a signed JWT; the iOS ASAuthorizationController
/// has already validated it against Apple's servers before the app sends it here.
/// The token is signature-verified against Apple's JWKS and then fail-closed
/// validated for issuer, audience, timestamps, and JWT header sanity before
/// claims are trusted.
#[derive(serde::Deserialize)]
pub(super) struct AppleAuthRequest {
    pub identity_token: String,
    /// Email from the Apple credential; only provided by Apple on first sign-in.
    /// The iOS client persists it in the Keychain and re-sends it on subsequent logins.
    #[serde(default)]
    pub email: String,
    #[serde(default)] pub nonce: Option<String>,
}

pub(super) async fn apple_auth_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<AppleAuthRequest>,
) -> Result<Response, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("apple_auth", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let expected_audience = apple_client_id_configured().ok_or_else(|| (StatusCode::SERVICE_UNAVAILABLE, "Apple sign-in is not configured".to_string()))?;
    let token_claims = verify_apple_identity_token(
        &request.identity_token,
        Some(&expected_audience),
        chrono::Utc::now().timestamp(),
    )
    .await
    .map_err(|err| {
        warn!("apple sign-in rejected: {err}");
        external_sign_in_failed_error()
    })?;
    if let Some(nonce) = request.nonce.as_deref().map(str::trim).filter(|value| !value.is_empty()) && token_claims.nonce.as_deref() != Some(nonce) { return Err(external_sign_in_failed_error()); }
    let apple_sub = format!("apple:{}", token_claims.sub);

    let email = if !request.email.is_empty() {
        request.email.trim().to_lowercase()
    } else {
        token_claims
            .email
            .clone()
            .map(|e| e.to_lowercase())
            .ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "email is required on first Apple Sign In; ensure your iOS client sends it"
                        .to_string(),
                )
            })?
    };

    let user = if let Some(existing) = state
        .db
        .find_user_by_google_sub(&apple_sub)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        existing
    } else if let Some(existing) = state
        .db
        .find_user_by_email(&email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        let linked = state
            .db
            .bind_user_google_sub_if_unset_or_matching(&existing.id, &apple_sub)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        if !linked {
            return Err(external_sign_in_failed_error());
        }
        existing
    } else {
        let display_name = email
            .split('@')
            .next()
            .unwrap_or("OmnyPulse User")
            .to_string();
        let new_user = UserRecord {
            id: Ulid::new().to_string(),
            email: email.clone(),
            password_hash: None,
            auth_provider: "apple".to_string(),
            // Reuse google_sub column to store the stable Apple subject identifier.
            google_sub: Some(apple_sub),
            display_name,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        state
            .db
            .create_user(&new_user)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        ensure_user_agents_and_demo_seed(&state, &new_user)
            .await
            .map_err(internal_http_error)?;
        new_user
    };

    state
        .db
        .mark_email_verified(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let session = create_session_for_user(&state.db, &user).await?;
    Ok(auth_response_with_session_cookie(session, &user, false))
}

#[derive(serde::Deserialize)]
struct AppleJwtHeader {
    alg: Option<String>,
    kid: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug)]
struct AppleJwtClaims {
    sub: String,
    email: Option<String>,
    iss: Option<String>,
    aud: Option<String>,
    exp: Option<i64>,
    iat: Option<i64>,
    nonce: Option<String>,
}

#[derive(serde::Deserialize, Clone, Debug)]
struct AppleJwk {
    kid: String,
    kty: Option<String>,
    alg: Option<String>,
    #[serde(rename = "use")]
    use_: Option<String>,
    n: String,
    e: String,
}

#[derive(serde::Deserialize, Clone, Debug)]
struct AppleJwks {
    keys: Vec<AppleJwk>,
}

static APPLE_JWKS_CACHE: OnceLock<Mutex<Option<(AppleJwks, std::time::Instant)>>> = OnceLock::new();

fn apple_jwks_cache() -> &'static Mutex<Option<(AppleJwks, std::time::Instant)>> {
    APPLE_JWKS_CACHE.get_or_init(|| Mutex::new(None))
}

async fn fetch_apple_jwks() -> Result<AppleJwks, String> {
    if let Ok(cache) = apple_jwks_cache().lock()
        && let Some((jwks, fetched_at)) = cache.as_ref()
        && fetched_at.elapsed().as_secs() < APPLE_JWKS_CACHE_TTL_SECS
    {
        return Ok(jwks.clone());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|err| {
            tracing::error!(error = %err, "Could not build Apple JWKS client");
            "Apple identity verification is temporarily unavailable".to_string()
        })?;

    let response = client.get(APPLE_JWKS_URL).send().await.map_err(|err| {
        tracing::error!(error = %err, "Could not fetch Apple JWKS");
        "Apple identity verification is temporarily unavailable".to_string()
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "Apple JWKS endpoint returned {}",
            response.status()
        ));
    }

    let jwks = response.json::<AppleJwks>().await.map_err(|err| {
        tracing::error!(error = %err, "Apple JWKS response was invalid");
        "Apple identity verification is temporarily unavailable".to_string()
    })?;

    if let Ok(mut cache) = apple_jwks_cache().lock() {
        *cache = Some((jwks.clone(), std::time::Instant::now()));
    }

    Ok(jwks)
}

async fn verify_apple_identity_token(
    jwt: &str,
    expected_audience: Option<&str>,
    now_epoch_secs: i64,
) -> Result<AppleJwtClaims, String> {
    let jwks = fetch_apple_jwks().await?;
    validate_apple_identity_token_with_jwks(jwt, expected_audience, now_epoch_secs, &jwks)
}

fn validate_apple_identity_token_with_jwks(
    jwt: &str,
    expected_audience: Option<&str>,
    now_epoch_secs: i64,
    jwks: &AppleJwks,
) -> Result<AppleJwtClaims, String> {
    let header = decode_header(jwt).map_err(|_| "Malformed Apple identity token".to_string())?;

    if header.alg != Algorithm::RS256 {
        return Err("Apple identity token algorithm is invalid".to_string());
    }

    let kid = header
        .kid
        .ok_or_else(|| "Apple identity token is missing key id".to_string())?;
    if kid.trim().is_empty() {
        return Err("Apple identity token is missing key id".to_string());
    }

    let jwk = jwks
        .keys
        .iter()
        .find(|candidate| {
            candidate.kid == kid
                && candidate.kty.as_deref().unwrap_or("RSA") == "RSA"
                && candidate.alg.as_deref().unwrap_or("RS256") == "RS256"
                && candidate.use_.as_deref().unwrap_or("sig") == "sig"
        })
        .ok_or_else(|| "Apple identity token key id is not trusted".to_string())?;

    let decoding_key = DecodingKey::from_rsa_components(&jwk.n, &jwk.e)
        .map_err(|_| "Apple JWKS key material was invalid".to_string())?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.validate_exp = false;
    validation.validate_nbf = false;
    validation.validate_aud = false;
    validation.required_spec_claims.clear();
    let token_data = decode::<AppleJwtClaims>(jwt, &decoding_key, &validation)
        .map_err(|_| "Apple identity token signature verification failed".to_string())?;
    let claims = token_data.claims;

    match claims.iss.as_deref() {
        Some("https://appleid.apple.com") | Some("appleid.apple.com") => {}
        _ => return Err("Apple identity token issuer is invalid".to_string()),
    }

    if let Some(expected_audience) = expected_audience.filter(|aud| !aud.trim().is_empty()) {
        if claims.aud.as_deref() != Some(expected_audience) {
            return Err("Apple identity token audience does not match Omnyid".to_string());
        }
    }

    let exp = claims
        .exp
        .ok_or_else(|| "Apple identity token is missing exp".to_string())?;
    if exp + 60 < now_epoch_secs {
        return Err("Apple sign-in token has expired".to_string());
    }

    if let Some(iat) = claims.iat
        && iat > now_epoch_secs + 300
    {
        return Err("Apple sign-in token issued-at timestamp is invalid".to_string());
    }

    if claims.sub.trim().is_empty() {
        return Err("Apple identity token missing 'sub' claim".to_string());
    }

    Ok(claims)
}

pub(super) async fn auth_session_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<SessionUserResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    Ok(Json(session_user_response(&user)))
}

pub(super) async fn delete_auth_session_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, String)> {
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    state
        .db
        .revoke_session_by_hash(&user.id, &session.token)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(cleared_session_response(
        StatusCode::OK,
        Json(serde_json::json!({ "ok": true })),
    ))
}

fn change_password_revokes_other_sessions(current_token: &str) -> bool {
    !current_token.trim().is_empty()
}

/// Change password and revoke all other sessions (GAP-006).
///
/// Requires the current password for verification. On success all existing
/// sessions except the current one are invalidated, limiting the damage from
/// a compromised password.
pub(super) async fn change_password_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ChangePasswordRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("change_password", &headers),
        RateLimitPolicy {
            max_requests: 5,
            window: Duration::from_secs(300),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;

    let password_hash = user.password_hash.as_deref().ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "password change is not supported for OAuth accounts".to_string(),
        )
    })?;

    let current_ok =
        verify_password(password_hash, &request.current_password).map_err(internal_http_error)?;
    if !current_ok {
        return Err((
            StatusCode::UNAUTHORIZED,
            "current password is incorrect".to_string(),
        ));
    }

    if request.new_password.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "new password must be at least 8 characters".to_string(),
        ));
    }
    if request.new_password == request.current_password {
        return Err((
            StatusCode::BAD_REQUEST,
            "new password must differ from the current password".to_string(),
        ));
    }

    let new_hash = hash_password(&request.new_password).map_err(internal_http_error)?;

    let updated = state
        .db
        .update_user_password(&user.id, &new_hash)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    if !updated {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "password update failed".to_string(),
        ));
    }

    // Revoke all sessions so any attacker who obtained the old password loses access.
    let current_token = bearer_token_from_headers(&headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
    if !change_password_revokes_other_sessions(&current_token) {
        return Err((StatusCode::UNAUTHORIZED, "missing bearer token".to_string()));
    }
    state
        .db
        .revoke_other_sessions(&user.id, &current_token)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(
        serde_json::json!({ "ok": true, "sessions_revoked": true }),
    ))
}

// ── Email verification (GAP-018) ──────────────────────────────────────────────

/// POST /auth/verify-email/send — resend verification email for the authenticated user.
pub(super) async fn send_verification_email_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("verify_email_send", &headers),
        RateLimitPolicy {
            max_requests: 3,
            window: Duration::from_secs(300),
        },
    )
    .await?;

    let user = authenticated_user(&state.db, &headers).await?;
    issue_and_send_verification_email(&state, &user, None).await?;
    Ok(Json(
        serde_json::json!({ "ok": true, "message": "verification email sent" }),
    ))
}

/// POST /auth/verify-email/resend — resend verification email without requiring an active session.
pub(super) async fn resend_verification_email_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ForgotPasswordRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("verify_email_resend", &headers),
        RateLimitPolicy {
            max_requests: 4,
            window: Duration::from_secs(300),
        },
    )
    .await?;

    let email = request.email.trim().to_lowercase();
    let Some(user) = state
        .db
        .find_user_by_email(&email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    else {
        return Ok(resend_verification_public_response());
    };

    if user.auth_provider != "password" {
        return Ok(resend_verification_public_response());
    }

    let email_verified = state
        .db
        .is_user_email_verified(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    if email_verified {
        return Ok(resend_verification_public_response());
    }

    if let Err((status, err)) = issue_and_send_verification_email(&state, &user, request.source.as_deref()).await {
        tracing::warn!(
            %status,
            %err,
            user_id = %user.id,
            "Suppressing resend-verification delivery/config error to avoid account enumeration"
        );
    }

    Ok(resend_verification_public_response())
}

/// POST /auth/verify-email — consume a verification token.
pub(super) async fn verify_email_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<VerifyEmailRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("verify_email", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(300),
        },
    )
    .await?;

    let token_hash = crate::db::sha256_token(&request.token);
    let record = state
        .db
        .find_auth_token("email_verify", &token_hash)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "invalid or expired verification token".to_string(),
            )
        })?;

    if !auth_token_record_is_usable(&record) {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid or expired verification token".to_string(),
        ));
    }

    state
        .db
        .consume_auth_token(&record.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    state
        .db
        .mark_email_verified(&record.user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(
        serde_json::json!({ "ok": true, "email_verified": true }),
    ))
}

// ── Password reset (GAP-019) ──────────────────────────────────────────────────

/// POST /auth/forgot-password — create and email a password-reset token.
pub(super) async fn forgot_password_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ForgotPasswordRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("forgot_password", &headers),
        RateLimitPolicy {
            max_requests: 4,
            window: Duration::from_secs(300),
        },
    )
    .await?;

    let email = request.email.trim().to_lowercase();
    // Always return success to avoid confirming whether an email is registered.
    let Some(user) = state
        .db
        .find_user_by_email(&email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    else {
        return Ok(forgot_password_public_response());
    };

    if user.auth_provider != "password" {
        // OAuth accounts cannot reset a password — tell them to sign in with their provider.
        return Ok(forgot_password_public_response());
    }

    if let Err((status, err)) = issue_and_send_password_reset_email(&state, &user).await {
        tracing::warn!(
            %status,
            %err,
            user_id = %user.id,
            "Suppressing forgot-password delivery/config error to avoid account enumeration"
        );
    }

    Ok(forgot_password_public_response())
}

/// POST /auth/reset-password — consume the reset token and set a new password.
pub(super) async fn reset_password_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ResetPasswordRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("reset_password", &headers),
        RateLimitPolicy {
            max_requests: 5,
            window: Duration::from_secs(300),
        },
    )
    .await?;

    if request.new_password.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "password must be at least 8 characters".to_string(),
        ));
    }

    let token_hash = crate::db::sha256_token(&request.token);
    let record = state
        .db
        .find_auth_token("password_reset", &token_hash)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "invalid or expired reset token".to_string(),
            )
        })?;

    if !auth_token_record_is_usable(&record) {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid or expired reset token".to_string(),
        ));
    }

    let new_hash = hash_password(&request.new_password).map_err(internal_http_error)?;
    let updated = state
        .db
        .update_user_password(&record.user_id, &new_hash)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    if !updated {
        return Err((
            StatusCode::BAD_REQUEST,
            "password reset is only supported for password accounts".to_string(),
        ));
    }

    state
        .db
        .consume_auth_token(&record.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    // Revoke all sessions — the account was likely compromised.
    state
        .db
        .revoke_all_sessions(&record.user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(
        serde_json::json!({ "ok": true, "sessions_revoked": true }),
    ))
}

// ── Internal helpers for auth tokens ─────────────────────────────────────────

fn is_auth_token_expired(expires_at: &str) -> bool {
    parse_datetime_to_utc(expires_at)
        .map(|dt| dt < chrono::Utc::now())
        .unwrap_or(true)
}

fn auth_token_record_is_usable(record: &crate::db::AuthTokenRecord) -> bool {
    record.used_at.is_none() && !is_auth_token_expired(&record.expires_at)
}

fn login_invalid_credentials_error() -> (StatusCode, String) {
    (
        StatusCode::UNAUTHORIZED,
        "invalid email or password".to_string(),
    )
}

fn external_sign_in_failed_error() -> (StatusCode, String) {
    (
        StatusCode::UNAUTHORIZED,
        "external sign-in failed".to_string(),
    )
}

fn passkey_registration_failed_error() -> (StatusCode, String) {
    (
        StatusCode::BAD_REQUEST,
        "passkey registration failed".to_string(),
    )
}

fn passkey_authentication_failed_error() -> (StatusCode, String) {
    (
        StatusCode::UNAUTHORIZED,
        "passkey authentication failed".to_string(),
    )
}

fn forgot_password_public_response() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok": true,
        "message": "if that email is registered, a reset link has been sent"
    }))
}

fn resend_verification_public_response() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok": true,
        "message": "if that email can still be verified, a new verification link has been sent"
    }))
}

fn registration_public_response(email: &str) -> AuthResponse {
    verification_required_response(
        email,
        "If this email can be registered or still needs verification, check your inbox for next steps.",
    )
}

/// Registration remains account-enumeration safe, but it must not tell a person
/// to check an inbox when the server itself knows its transactional delivery
/// attempt failed. This response describes a service-wide delivery problem,
/// rather than whether a particular address exists.
fn registration_delivery_unavailable_response(email: &str) -> AuthResponse {
    verification_required_response(
        email,
        "We could not send a confirmation email yet. Please try again shortly.",
    )
}

fn generate_secure_token() -> String {
    let raw: [u8; 32] = rand::rng().random();
    hex::encode(raw)
}

fn auth_base_url_configured() -> Result<String, (StatusCode, String)> {
    let base_url = std::env::var("OMNYID_BASE_URL").map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Auth email flows are not configured on this homeserver. Set OMNYID_BASE_URL."
                .to_string(),
        )
    })?;
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Auth email flows are not configured on this homeserver. Set OMNYID_BASE_URL."
                .to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

async fn issue_and_send_verification_email(
    state: &super::AppState,
    user: &crate::db::UserRecord,
    source: Option<&str>,
) -> Result<(), (StatusCode, String)> {
    let raw_token = generate_secure_token();
    let token_hash = crate::db::sha256_token(&raw_token);
    let token_id = ulid::Ulid::new().to_string();
    let expires_at = (chrono::Utc::now() + chrono::Duration::hours(24)).to_rfc3339();

    state
        .db
        .create_auth_token(
            &token_id,
            &user.id,
            "email_verify",
            &token_hash,
            &expires_at,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let base_url = auth_base_url_configured()?;
    let verify_url = verification_source::verification_url(&base_url, &raw_token, source);

    let body = format!(
        "Hi {name},\n\nVerify your OmnyID email address by visiting the link below:\n\n{url}\n\nThis link expires in 24 hours.\n\nIf you did not create an OmnyID account, ignore this email.\n",
        name = user.display_name,
        url = verify_url,
    );

    crate::gateway::smtp_out::send_transactional_email(
        &user.email,
        "Verify your OmnyID email",
        &body,
    )
    .await
    .map_err(|err| {
        tracing::warn!(%err, user_id = %user.id, "Failed to send verification email");
        internal_http_error(err)
    })
}

async fn issue_and_send_password_reset_email(
    state: &super::AppState,
    user: &crate::db::UserRecord,
) -> Result<(), (StatusCode, String)> {
    let raw_token = generate_secure_token();
    let token_hash = crate::db::sha256_token(&raw_token);
    let token_id = ulid::Ulid::new().to_string();
    let expires_at = (chrono::Utc::now() + chrono::Duration::hours(1)).to_rfc3339();

    state
        .db
        .create_auth_token(
            &token_id,
            &user.id,
            "password_reset",
            &token_hash,
            &expires_at,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let base_url = auth_base_url_configured()?;
    let reset_url = format!("{base_url}/reset-password?token={raw_token}");

    let body = format!(
        "Hi {name},\n\nReset your OmnyID password by visiting the link below:\n\n{url}\n\nThis link expires in 1 hour. If you did not request a password reset, ignore this email — your password has not changed.\n",
        name = user.display_name,
        url = reset_url,
    );

    crate::gateway::smtp_out::send_transactional_email(
        &user.email,
        "Reset your OmnyID password",
        &body,
    )
    .await
    .map_err(|err| {
        tracing::warn!(%err, user_id = %user.id, "Failed to send password reset email");
        internal_http_error(err)
    })
}

// ── Auth helpers & rate limiting ──────────────────────────────────────────────

pub(super) async fn authenticated_user(
    db: &Db,
    headers: &HeaderMap,
) -> Result<UserRecord, (StatusCode, String)> {
    authenticated_user_and_session(db, headers)
        .await
        .map(|(user, _session)| user)
}

pub(super) async fn authenticated_user_and_session(
    db: &Db,
    headers: &HeaderMap,
) -> Result<(UserRecord, AuthSessionRecord), (StatusCode, String)> {
    require_cookie_auth_allowed_origin(headers)?;
    let token = session_token_from_headers(headers).ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            "missing session token".to_string(),
        )
    })?;
    let session = db
        .find_session(&token)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "invalid session".to_string()))?;

    if session_is_expired(&session.expires_at) {
        return Err((StatusCode::UNAUTHORIZED, "session expired".to_string()));
    }

    let row_opt = sqlx::query(
        r#"
        SELECT id, email, password_hash, auth_provider, google_sub, display_name, created_at::text as created_at,
               COALESCE(account_status, 'active') AS account_status,
               account_status_reason
        FROM users
        WHERE id = $1
        LIMIT 1
        "#,
    )
    .bind(&session.user_id)
    .fetch_optional(&db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let row = row_opt.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            "user for session not found".to_string(),
        )
    })?;

    // Required columns use `?` so a NULL or type-mismatch surfaces as a 500 rather than
    // silently producing an empty string that passes downstream authorization checks.
    let col_err = |col: &'static str| {
        move |_: sqlx::Error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("db column decode failed: {col}"),
            )
        }
    };
    let user = UserRecord {
        id: row.try_get("id").map_err(col_err("id"))?,
        email: row.try_get("email").map_err(col_err("email"))?,
        password_hash: row.try_get("password_hash").unwrap_or(None),
        auth_provider: row
            .try_get("auth_provider")
            .map_err(col_err("auth_provider"))?,
        google_sub: row.try_get("google_sub").unwrap_or(None),
        display_name: row
            .try_get("display_name")
            .map_err(col_err("display_name"))?,
        created_at: row.try_get("created_at").map_err(col_err("created_at"))?,
    };
    let account_status = row
        .try_get::<String, _>("account_status")
        .map_err(col_err("account_status"))?;
    let account_status_reason = row
        .try_get::<Option<String>, _>("account_status_reason")
        .unwrap_or(None);
    require_account_status_active(&account_status, account_status_reason.as_deref())?;

    Ok((user, session))
}

pub(super) async fn optional_authenticated_user(
    db: &Db,
    headers: &HeaderMap,
) -> Result<Option<UserRecord>, (StatusCode, String)> {
    if session_token_from_headers(headers).is_none() {
        return Ok(None);
    }
    authenticated_user(db, headers).await.map(Some)
}

pub(super) fn bearer_token_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .and_then(|header| header.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(super) fn merge_thread_messages(
    private_messages: Vec<crate::afp::Message>,
    public_messages: Vec<crate::afp::Message>,
) -> Vec<crate::afp::Message> {
    let mut merged = Vec::with_capacity(private_messages.len() + public_messages.len());
    let mut seen = std::collections::HashSet::new();

    for message in private_messages
        .into_iter()
        .chain(public_messages.into_iter())
    {
        if seen.insert(message.id.clone()) {
            merged.push(message);
        }
    }

    merged.sort_by(|a, b| a.timestamp.cmp(&b.timestamp).then_with(|| a.id.cmp(&b.id)));
    merged
}

pub(super) async fn thread_messages_for_headers(
    db: &Db,
    headers: &HeaderMap,
    thread_id: &str,
) -> Result<Vec<crate::afp::Message>, (StatusCode, String)> {
    let user = authenticated_user(db, headers).await?;
    let private_messages = db
        .get_private_thread(&user.id, thread_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    if private_messages.is_empty() {
        return Err((StatusCode::NOT_FOUND, "thread not found".to_string()));
    }
    let public_messages = db
        .get_thread(thread_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    // Daemon liveness records belong in operational monitoring, never in a
    // person's chat transcript. Keep the source rows for audit/health use.
    Ok(merge_thread_messages(private_messages, public_messages)
        .into_iter()
        .filter(|message| message.r#type != "daemon_heartbeat")
        .collect())
}

pub(crate) async fn store_private_app_message(
    db: &Db,
    metrics: &Arc<crate::metrics::Metrics>,
    relay_tx: &tokio::sync::broadcast::Sender<String>,
    owner_user_id: &str,
    message: AFPMessage,
) -> Result<bool, Status> {
    let proto = super::app_to_proto(message.clone());
    if !super::validate_proto_message(&proto) {
        return Err(Status::invalid_argument("Invalid AFP message"));
    }

    let content_json: Value = serde_json::from_str(&proto.content)
        .map_err(|_| Status::invalid_argument("Message content must be valid JSON"))?;

    let inserted = db
        .store_private_message(owner_user_id, &proto, content_json)
        .await
        .map_err(internal_error)?;

    if inserted {
        metrics.inc_messages_stored();
        super::index_backlink_update(db, &message, Some(owner_user_id)).await;
        super::handle_inserted_message_effects(
            db,
            metrics,
            relay_tx,
            &message,
            Some(owner_user_id),
        )
        .await;
        // Include owner_user_id so the relay socket can filter to the owning user (GAP-060).
        let _ = relay_tx.send(
            serde_json::json!({
                "event": "message_stored",
                "message_id": proto.id,
                "thread_id": proto.thread_id,
                "type": proto.r#type,
                "owner_user_id": owner_user_id,
            })
            .to_string(),
        );
    } else {
        metrics.inc_messages_replayed();
    }

    Ok(inserted)
}

pub(super) async fn store_app_message_for_headers(
    db: &Db,
    metrics: &Arc<crate::metrics::Metrics>,
    relay_tx: &tokio::sync::broadcast::Sender<String>,
    headers: &HeaderMap,
    message: AFPMessage,
) -> Result<String, (StatusCode, String)> {
    let message_id = message.id.clone();
    if let Some(user) = optional_authenticated_user(db, headers).await? {
        store_private_app_message(db, metrics, relay_tx, &user.id, message)
            .await
            .map_err(status_to_http)?;
    } else {
        super::store_proto_message(db, metrics, relay_tx, super::app_to_proto(message))
            .await
            .map_err(status_to_http)?;
    }
    Ok(message_id)
}

pub(super) async fn append_private_task_status_trace(
    db: &Db,
    metrics: &Arc<crate::metrics::Metrics>,
    relay_tx: &tokio::sync::broadcast::Sender<String>,
    owner_user_id: &str,
    task_id: &str,
    status: &str,
    rationale: &str,
) -> Result<(), (StatusCode, String)> {
    let task = db
        .get_agent_task(owner_user_id, task_id)
        .await
        .map_err(super::task_update_error_to_http)?;
    let Some(thread_id) = task
        .get("thread_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    else {
        return Ok(());
    };

    let sender = task
        .get("agent_instance_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("omnyid://runner/{value}"))
        .unwrap_or_else(|| format!("omnyid://runner/{task_id}"));
    let intent = task
        .get("intent")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    if let Ok(msg) = new_server_message(
        sender,
        vec![],
        thread_id.to_string(),
        "agent_message",
        serde_json::json!({
            "task_id": task_id,
            "status": status,
            "intent": intent,
            "rationale": rationale,
        }),
        vec![],
        vec![],
        vec![],
        true,
    ) {
        let _ = store_private_app_message(db, metrics, relay_tx, owner_user_id, msg)
            .await
            .map_err(status_to_http)?;
    }

    Ok(())
}

pub(super) async fn enforce_rate_limit(
    state: &AppState,
    key: String,
    policy: RateLimitPolicy,
) -> Result<(), (StatusCode, String)> {
    // Prefer the persistent DB rate limiter (GAP-007). Fall back to in-memory
    // if the DB call fails (e.g. during startup or connection hiccup) — the
    // in-memory limiter still blocks within the current process lifetime.
    let allowed = match state
        .db
        .rate_limit_allow(
            &key,
            policy.window.as_secs() as i64,
            policy.max_requests as i64,
        )
        .await
    {
        Ok(allowed) => allowed,
        Err(err) => {
            tracing::warn!(%err, %key, "DB rate limiter unavailable; falling back to in-memory");
            state.rate_limiter.allow(key, policy).await
        }
    };

    if allowed {
        return Ok(());
    }

    state.metrics.inc_rate_limited_requests();
    Err((
        StatusCode::TOO_MANY_REQUESTS,
        "too many requests, please try again shortly".to_string(),
    ))
}

pub(super) fn public_rate_limit_key(scope: &str, headers: &HeaderMap) -> String {
    format!("public:{scope}:{}", request_ip_identity(headers))
}

pub(super) fn authenticated_rate_limit_key(scope: &str, headers: &HeaderMap) -> String {
    let identity = session_token_from_headers(headers)
        .map(|token| format!("session:{}", super::runtime_token_preview(&token)))
        .unwrap_or_else(|| format!("ip:{}", request_ip_identity(headers)));
    format!("auth:{scope}:{identity}")
}

pub(super) fn request_ip_identity(headers: &HeaderMap) -> String {
    // X-Forwarded-For and similar headers are client-controlled when the server
    // is not behind a trusted reverse proxy.  An attacker can set these to any
    // value, rotating through spoofed IPs to bypass per-IP rate limits.
    //
    // Only trust them when OMNYID_BEHIND_TRUSTED_PROXY=true is explicitly set,
    // meaning the operator has confirmed that the listening socket is only
    // reachable through a proxy that strips/overwrites these headers.
    //
    // Without that flag, all direct connections share the key "direct", which
    // keeps rate limiting conservative but immune to header spoofing.
    let behind_trusted_proxy =
        std::env::var("OMNYID_BEHIND_TRUSTED_PROXY").as_deref() == Ok("true");

    if behind_trusted_proxy {
        forwarded_header_identity(headers, "x-forwarded-for")
            .or_else(|| forwarded_header_identity(headers, "cf-connecting-ip"))
            .or_else(|| forwarded_header_identity(headers, "x-real-ip"))
            .unwrap_or_else(|| "direct".to_string())
    } else {
        // Return a stable placeholder; rate-limit buckets are still enforced
        // but keyed on the connection rather than on a spoofable IP.
        "direct".to_string()
    }
}

pub(super) fn forwarded_header_identity(headers: &HeaderMap, header_name: &str) -> Option<String> {
    headers
        .get(header_name)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            value.split(',').find_map(|candidate| {
                let trimmed = candidate.trim();
                (!trimmed.is_empty()).then(|| trimmed.to_string())
            })
        })
}

pub(super) fn session_token_from_headers(headers: &HeaderMap) -> Option<String> {
    bearer_token_from_headers(headers).or_else(|| session_cookie_token_from_headers(headers))
}

fn require_cookie_auth_allowed_origin(headers: &HeaderMap) -> Result<(), (StatusCode, String)> {
    if bearer_token_from_headers(headers).is_some()
        || session_cookie_token_from_headers(headers).is_none()
    {
        return Ok(());
    }
    if request_origin_is_allowed(headers) {
        Ok(())
    } else {
        Err((
            StatusCode::FORBIDDEN,
            "origin not allowed for cookie-authenticated request".to_string(),
        ))
    }
}

fn request_origin_is_allowed(headers: &HeaderMap) -> bool {
    let allowed = allowed_cors_origins();
    match headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
    {
        Some(origin) => allowed
            .iter()
            .any(|allowed| allowed.to_str().unwrap_or("") == origin),
        None => true,
    }
}

fn session_cookie_token_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| cookie_value(value, SESSION_COOKIE_NAME))
}

fn cookie_value(cookie_header: &str, name: &str) -> Option<String> {
    cookie_header.split(';').find_map(|segment| {
        let mut parts = segment.trim().splitn(2, '=');
        let candidate_name = parts.next()?.trim();
        let candidate_value = parts.next()?.trim();
        if candidate_name == name && !candidate_value.is_empty() {
            Some(candidate_value.to_string())
        } else {
            None
        }
    })
}

fn auth_response_with_session_cookie(session: AuthSessionRecord, user: &UserRecord, account_created: bool) -> Response {
    let token = session.token.clone(); json_response_with_session_cookie(&token, Json(session_auth_response(session, user, account_created)))
}

fn json_response_with_session_cookie(body_token: &str, body: impl IntoResponse) -> Response {
    let mut response = body.into_response();
    if let Ok(cookie) = HeaderValue::from_str(&session_cookie_header_value(body_token)) {
        response.headers_mut().append(header::SET_COOKIE, cookie);
    }
    response
}

fn cleared_session_response(status: StatusCode, body: impl IntoResponse) -> Response {
    let mut response = (status, body).into_response();
    if let Ok(cookie) = HeaderValue::from_str(&clear_session_cookie_header_value()) {
        response.headers_mut().append(header::SET_COOKIE, cookie);
    }
    response
}

fn session_cookie_header_value(token: &str) -> String {
    let mut cookie = format!(
        "{SESSION_COOKIE_NAME}={token}; Path=/; Max-Age={SESSION_COOKIE_MAX_AGE_SECS}; HttpOnly; SameSite=Lax"
    );
    if session_cookie_secure_enabled() {
        cookie.push_str("; Secure");
    }
    if let Some(domain) = session_cookie_domain() {
        cookie.push_str("; Domain=");
        cookie.push_str(&domain);
    }
    cookie
}

fn clear_session_cookie_header_value() -> String {
    let mut cookie = format!("{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    if session_cookie_secure_enabled() {
        cookie.push_str("; Secure");
    }
    if let Some(domain) = session_cookie_domain() {
        cookie.push_str("; Domain=");
        cookie.push_str(&domain);
    }
    cookie
}

fn session_cookie_domain() -> Option<String> {
    std::env::var("OMNYID_SESSION_COOKIE_DOMAIN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| {
            !value.is_empty() && !value.contains(';') && !value.contains(' ') && value.is_ascii()
        })
}

fn session_cookie_secure_enabled() -> bool {
    match std::env::var("OMNYID_SESSION_COOKIE_SECURE") {
        Ok(value) => env_truthy(&value),
        Err(_) => !localhost_origins_allowed_by_default(),
    }
}

fn localhost_origins_allowed_by_default() -> bool {
    std::env::var("OMNYID_ALLOW_LOCALHOST_ORIGINS")
        .map(|value| env_truthy(&value))
        .unwrap_or(cfg!(debug_assertions))
}

fn env_truthy(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

async fn create_session_for_user(
    db: &Db,
    user: &UserRecord,
) -> Result<AuthSessionRecord, (StatusCode, String)> {
    let account_status = db
        .user_account_status(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    if let Some(account_status) = account_status {
        require_account_status_record_active(&account_status)?;
    }
    db.ensure_user_private_schema(&user.id)
        .await
        .map_err(session_creation_http_error)?;
    let session = AuthSessionRecord {
        token: random_token(),
        user_id: user.id.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        expires_at: (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339(),
    };
    db.create_session(&session)
        .await
        .map_err(session_creation_http_error)?;
    Ok(session)
}

pub(super) fn random_token() -> String {
    let mut bytes = [0u8; 24];
    rand::rng().fill(&mut bytes);
    hex::encode(bytes)
}

/// Re-export the DB-layer token hash so server submodules can compare
/// raw bearer tokens against the stored hashes.
pub(super) fn sha256_token(raw: &str) -> String {
    crate::db::sha256_token(raw)
}

pub(super) fn session_is_expired(expires_at: &str) -> bool {
    parse_datetime_to_utc(expires_at)
        .map(|expires| expires < chrono::Utc::now())
        .unwrap_or(true)
}

pub(super) fn high_risk_session_max_age_minutes() -> i64 {
    std::env::var("OMNYID_HIGH_RISK_SESSION_MAX_AGE_MINUTES")
        .ok()
        .and_then(|value| value.trim().parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(15)
}

pub(super) fn session_is_recent_for_high_risk(session: &AuthSessionRecord) -> bool {
    let Some(created_at) = parse_datetime_to_utc(&session.created_at) else {
        return false;
    };
    let max_age = chrono::Duration::minutes(high_risk_session_max_age_minutes());
    chrono::Utc::now().signed_duration_since(created_at) <= max_age
}

pub(super) fn require_recent_high_risk_session(
    session: &AuthSessionRecord,
) -> Result<(), (StatusCode, String)> {
    if session_is_recent_for_high_risk(session) {
        Ok(())
    } else {
        Err((
            StatusCode::FORBIDDEN,
            "recent sign-in required for high-risk action".to_string(),
        ))
    }
}

pub(super) fn parse_datetime_to_utc(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
        .ok()
        .or_else(|| {
            chrono::DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f%#z")
                .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
                .ok()
        })
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(password_processing_error)
}

fn verify_password(password_hash: &str, password: &str) -> Result<bool, String> {
    let parsed_hash = PasswordHash::new(password_hash).map_err(password_verification_error)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

fn session_creation_error(err: impl std::fmt::Display) -> String {
    warn!(error = %err, "Suppressing session creation internals");
    "failed to start session".to_string()
}

fn session_creation_http_error(err: impl std::fmt::Display) -> (StatusCode, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        session_creation_error(err),
    )
}

fn account_status_is_active(account_status: &str) -> bool {
    account_status.trim().eq_ignore_ascii_case("active")
}

fn account_status_block_message(reason: Option<&str>) -> String {
    let normalized_reason = reason.map(str::trim).filter(|value| !value.is_empty());
    match normalized_reason {
        Some(reason) => format!("account access is disabled: {reason}"),
        None => "account access is disabled".to_string(),
    }
}

fn require_account_status_active(
    account_status: &str,
    reason: Option<&str>,
) -> Result<(), (StatusCode, String)> {
    if account_status_is_active(account_status) {
        Ok(())
    } else {
        Err((StatusCode::FORBIDDEN, account_status_block_message(reason)))
    }
}

fn require_account_status_record_active(
    record: &UserAccountStatusRecord,
) -> Result<(), (StatusCode, String)> {
    require_account_status_active(
        &record.account_status,
        record.account_status_reason.as_deref(),
    )
}

fn password_processing_error(err: impl std::fmt::Display) -> String {
    warn!(error = %err, "Suppressing password processing internals");
    "failed to process password".to_string()
}

fn password_verification_error(err: impl std::fmt::Display) -> String {
    warn!(error = %err, "Suppressing password verification internals");
    "password verification failed".to_string()
}

fn account_bootstrap_error(context: &'static str, err: impl std::fmt::Display) -> String {
    warn!(context, error = %err, "Suppressing account bootstrap internals");
    "failed to provision account workspace".to_string()
}

fn google_client_id_configured() -> Option<String> {
    let client_id = std::env::var("OMNYID_GOOGLE_CLIENT_ID").ok()?;
    let trimmed = client_id.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

async fn verify_google_id_token(id_token: &str) -> Result<GoogleTokenInfoResponse, String> {
    let client_id = google_client_id_configured()
        .ok_or_else(|| "Google sign-in is not configured for this homeserver".to_string())?;
    let response = reqwest::Client::new()
        .get("https://oauth2.googleapis.com/tokeninfo")
        .query(&[("id_token", id_token)])
        .send()
        .await
        .map_err(|err| {
            tracing::error!(error = %err, "Google token verification failed");
            "Google sign-in is temporarily unavailable".to_string()
        })?;
    if !response.status().is_success() {
        return Err("Google sign-in was rejected".to_string());
    }
    let token_info = response
        .json::<GoogleTokenInfoResponse>()
        .await
        .map_err(|err| {
            tracing::error!(error = %err, "Google token payload was invalid");
            "Google sign-in is temporarily unavailable".to_string()
        })?;
    validate_google_token_info(&token_info, &client_id, chrono::Utc::now().timestamp())?;
    Ok(token_info)
}

fn validate_google_token_info(
    token_info: &GoogleTokenInfoResponse,
    client_id: &str,
    now_epoch_secs: i64,
) -> Result<(), String> {
    if token_info.aud != client_id {
        return Err("Google token audience does not match Omnyid".to_string());
    }

    match token_info.iss.as_deref() {
        Some("accounts.google.com") | Some("https://accounts.google.com") => {}
        _ => return Err("Google token issuer is invalid".to_string()),
    }

    if token_info.email_verified.as_deref() != Some("true") {
        return Err("Google account email is not verified".to_string());
    }

    let exp = parse_google_epoch_field(token_info.exp.as_deref(), "exp")?;
    if exp + 60 < now_epoch_secs {
        return Err("Google sign-in token has expired".to_string());
    }

    if let Some(iat_raw) = token_info.iat.as_deref() {
        let iat = parse_google_epoch_field(Some(iat_raw), "iat")?;
        if iat > now_epoch_secs + 300 {
            return Err("Google sign-in token issued-at timestamp is invalid".to_string());
        }
    }

    Ok(())
}

fn parse_google_epoch_field(raw: Option<&str>, field_name: &str) -> Result<i64, String> {
    let value = raw.ok_or_else(|| format!("Google token is missing {field_name}"))?;
    value
        .parse::<i64>()
        .map_err(|_| format!("Google token {field_name} was invalid"))
}

fn google_subject_candidates(subject: &str) -> Vec<String> {
    vec![format!("google:{subject}"), subject.to_string()]
}

#[cfg(test)]
mod tests {
    use super::{
        account_bootstrap_error, allowed_cors_methods, allowed_cors_origins,
        auth_base_url_configured, auth_token_record_is_usable,
        change_password_revokes_other_sessions, clear_session_cookie_header_value, cookie_value,
        env_truthy, external_sign_in_failed_error, forgot_password_public_response,
        google_client_id_configured, google_subject_candidates, high_risk_session_max_age_minutes,
        login_invalid_credentials_error, normalize_passkey_begin_email,
        passkey_authenticate_challenge_kind, passkey_authentication_begin_options,
        passkey_authentication_failed_error, passkey_origin_configured,
        passkey_public_rate_limit_key, passkey_registration_failed_error, passkey_rp_id_configured,
        password_processing_error, password_verification_error,
        registration_delivery_unavailable_response, registration_public_response,
        request_origin_is_allowed, require_account_status_active,
        require_cookie_auth_allowed_origin, require_recent_high_risk_session,
        resend_verification_public_response, session_cookie_header_value,
        session_cookie_secure_enabled, session_creation_error, session_is_recent_for_high_risk,
        validate_apple_identity_token_with_jwks, validate_google_token_info,
        validate_registration_fields, verify_password,
    };
    use crate::{
        db::{AuthSessionRecord, AuthTokenRecord},
        server::types::GoogleTokenInfoResponse,
    };
    use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
    use base64::Engine as _;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;
    use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
    use serde_json::json;
    use std::sync::{Mutex, OnceLock};

    const TEST_APPLE_RSA_PRIVATE_KEY_PEM: &str = r#"-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDNEsIxR3vIFEo5
LtEosANQRjkgc/L5FfEDRNjiEfgGGx0CmZIrqmndK64TZU12RgPP4rowL1a2p3lH
+SIshDkrv8L1F4q1q2ueK69D2mNMewTcZA/fNmwwS8fiIOcCDSYcpix46GcSR9IZ
SjmhDvJ8K/HVbIHhu5TIxYsPmJwPjtvvR2ebjrgOvE7fDN5HukoF7UIMZNpahYXc
T6c9x+sdwy8d5EpHc0sfW7W4tbCvXEjozl+b1C6F9An9SLNF3jnuNn8vQbeX5URe
uPL3PhlYRryNx9OGaPi52gbxpuJginfKK7LDi2p225KTH2uDV605//JAAZ2mWqgB
N7/Hl02VAgMBAAECggEAMfnak95XEtso/HcFl2wPnqpCZT+EjMHVXqXSUgOthTVp
1DafOd95laH9tfHX1xU4fBrFo5UBxZkaNBlJg/5EHX6J0Sdn0R6hpyX/vCI2VU7c
kCYdfRj69CkfoOLCUUxph41SpLOEXN7eW3XshezJ2Mtvz8J2A5AuceA8Y7ReAecv
zYQoO6XRUU77rc+dsWY9WEjgfNrWjXTjOk+aIc3Jq/Lt+vX4Tf6xSiyiKO7xBcH4
VX3zD9Ptb/uzZlvj3nfxsp203tILI2mygGVHLsdlIvTUMVX2ScQh50Z2CVd2ncj8
nYZhHyxJzQnj9WKpNrYrWrFcx3Yf49QY2wtxC0i+qQKBgQDpU8vEcd4lA2xxmVvL
5sCZ62BvG1IKcRZx+LIo9Nc+m9Eda1LWY4KLNoFYwcoPEWO/EsDPNpUVk032IqTw
+guIdcN3+hsKwUIF0GJyOduHz+Emqb4LJJnP1Mv6WE+zo569lvhuow4ws9G+h58z
vufqFyuMXUpix+QbfFOUKYBYPQKBgQDhAB7Uooar8WJzL1W1IpB0dMXNUN1JE6y8
zzmsww6NS7TdQc5tDwWaQYyxuUi4I2sz92mSkB2c8D4BIaeXF8KthLiNpQ66kVsW
i+/mueO2whCjc9eWKQEhfazfpTbByUX6ptDrR0a7bPXtt/kMo87MyqbaQ/rk19n1
6QOylqTIOQKBgFi0DaxyKaTip1CMn/RllmUtsayrs0Xa9lB/3qNpaYcYz6gijAyL
Ki7omsX2bm3KC6SxaXGda5IXPTVMuG4QcWAAfT5Ya/1ruUDilvqb+lSoeA0tzN0J
nhv/50gWWL6PfqLPCUVuYc+sHRoVDzYp5pr9EgY71TK2kYbNfiy+lld1AoGAQR7f
zXscrzc131Cb5ckTNiF1/m6hHT1siVkQwEfUNmDq//7D2By46mR+bBHMUj8uD+RT
0e+UIpAF4h3ze2+NENuQ7q4PDUB0tJnb3VN/7K1OU4B7rSJBCYhuOGyA5KV0c49E
eFQwzJ5Er4DHvDjM6cjdcd6rBwDSPLIsN8wR9UECgYAAxI9CPR2yBdFCSHtDPJR5
+3QBpN2urQN3JMh2XDT5oJHgO9LWn+fWCqzSjXzk26M718kcrrsbSVtRo6ZpUUYv
3jsUj4qrYwGxunDFOOO6hk+zIXu2MxQRGZ7ug4CIwuir11m0L2xKAPy/pBf10Ho4
aSnVsBzVGTmyju6PoBR7Yw==
-----END PRIVATE KEY-----"#;

    fn cors_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn sample_google_token_info() -> GoogleTokenInfoResponse {
        GoogleTokenInfoResponse {
            sub: "google-subject".to_string(),
            email: "user@example.com".to_string(),
            email_verified: Some("true".to_string()),
            aud: "client-id".to_string(),
            iss: Some("https://accounts.google.com".to_string()),
            exp: Some("2000000000".to_string()),
            iat: Some("1700000000".to_string()),
            name: Some("Example User".to_string()),
            given_name: Some("Example".to_string()),
        }
    }

    fn sample_apple_jwks() -> super::AppleJwks {
        super::AppleJwks {
            keys: vec![super::AppleJwk {
                kid: "apple-key-1".to_string(),
                kty: Some("RSA".to_string()),
                alg: Some("RS256".to_string()),
                use_: Some("sig".to_string()),
                n: "zRLCMUd7yBRKOS7RKLADUEY5IHPy-RXxA0TY4hH4BhsdApmSK6pp3SuuE2VNdkYDz-K6MC9Wtqd5R_kiLIQ5K7_C9ReKtatrniuvQ9pjTHsE3GQP3zZsMEvH4iDnAg0mHKYseOhnEkfSGUo5oQ7yfCvx1WyB4buUyMWLD5icD47b70dnm464DrxO3wzeR7pKBe1CDGTaWoWF3E-nPcfrHcMvHeRKR3NLH1u1uLWwr1xI6M5fm9QuhfQJ_UizRd457jZ_L0G3l-VEXrjy9z4ZWEa8jcfThmj4udoG8abiYIp3yiuyw4tqdtuSkx9rg1etOf_yQAGdplqoATe_x5dNlQ".to_string(),
                e: "AQAB".to_string(),
            }],
        }
    }

    fn make_apple_identity_token(claims: super::AppleJwtClaims) -> String {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some("apple-key-1".to_string());
        encode(
            &header,
            &claims,
            &EncodingKey::from_rsa_pem(TEST_APPLE_RSA_PRIVATE_KEY_PEM.as_bytes())
                .expect("valid Apple test RSA private key"),
        )
        .expect("sign Apple identity token for tests")
    }

    #[test]
    fn session_creation_error_is_generic() {
        assert_eq!(
            session_creation_error("relation auth_sessions does not exist"),
            "failed to start session"
        );
    }

    #[test]
    fn require_account_status_active_accepts_active_status() {
        assert_eq!(require_account_status_active("active", None), Ok(()));
    }

    #[test]
    fn require_account_status_active_rejects_suspended_status() {
        let err = require_account_status_active("suspended", Some("abuse review"))
            .expect_err("suspended account should be blocked");
        assert_eq!(err.0, StatusCode::FORBIDDEN);
        assert!(err.1.contains("account access is disabled"));
        assert!(err.1.contains("abuse review"));
    }

    #[test]
    fn password_processing_error_is_generic() {
        assert_eq!(
            password_processing_error("argon2 backend exploded"),
            "failed to process password"
        );
    }

    #[test]
    fn password_verification_error_is_generic() {
        assert_eq!(
            password_verification_error("malformed PHC string"),
            "password verification failed"
        );
    }

    #[test]
    fn high_risk_session_max_age_minutes_defaults_to_fifteen() {
        unsafe {
            std::env::remove_var("OMNYID_HIGH_RISK_SESSION_MAX_AGE_MINUTES");
        }
        assert_eq!(high_risk_session_max_age_minutes(), 15);
    }

    #[test]
    fn session_is_recent_for_high_risk_accepts_fresh_sessions() {
        let session = AuthSessionRecord {
            token: "token".to_string(),
            user_id: "user".to_string(),
            created_at: (chrono::Utc::now() - chrono::Duration::minutes(5)).to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(1)).to_rfc3339(),
        };
        assert!(session_is_recent_for_high_risk(&session));
    }

    #[test]
    fn require_recent_high_risk_session_rejects_stale_sessions() {
        let session = AuthSessionRecord {
            token: "token".to_string(),
            user_id: "user".to_string(),
            created_at: (chrono::Utc::now() - chrono::Duration::minutes(30)).to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(1)).to_rfc3339(),
        };
        let error = require_recent_high_risk_session(&session)
            .expect_err("stale session should be rejected");
        assert_eq!(error.0, StatusCode::FORBIDDEN);
        assert!(error.1.contains("recent sign-in required"));
    }

    #[test]
    fn cookie_value_extracts_named_cookie() {
        assert_eq!(
            cookie_value(
                "theme=dark; omnyid_session=token-123; path=/",
                "omnyid_session"
            )
            .as_deref(),
            Some("token-123")
        );
    }

    #[test]
    fn env_truthy_recognizes_enabled_variants() {
        for value in ["1", "true", "TRUE", " yes ", "On"] {
            assert!(env_truthy(value), "expected truthy for {value}");
        }
        assert!(!env_truthy("false"));
    }

    #[test]
    fn session_cookie_header_defaults_to_secure_when_explicitly_enabled() {
        let _guard = cors_env_lock().lock().unwrap();
        unsafe {
            std::env::set_var("OMNYID_SESSION_COOKIE_SECURE", "true");
            std::env::remove_var("OMNYID_SESSION_COOKIE_DOMAIN");
        }
        let header = session_cookie_header_value("abc123");
        assert!(header.contains("omnyid_session=abc123"));
        assert!(header.contains("HttpOnly"));
        assert!(header.contains("SameSite=Lax"));
        assert!(header.contains("Secure"));
        unsafe {
            std::env::remove_var("OMNYID_SESSION_COOKIE_SECURE");
        }
    }

    #[test]
    fn session_cookie_header_includes_configured_domain() {
        let _guard = cors_env_lock().lock().unwrap();
        unsafe {
            std::env::set_var("OMNYID_SESSION_COOKIE_SECURE", "false");
            std::env::set_var("OMNYID_SESSION_COOKIE_DOMAIN", ".omnyid.com");
        }
        let header = session_cookie_header_value("abc123");
        assert!(header.contains("Domain=.omnyid.com"));
        assert!(!header.contains("Secure"));
        unsafe {
            std::env::remove_var("OMNYID_SESSION_COOKIE_SECURE");
            std::env::remove_var("OMNYID_SESSION_COOKIE_DOMAIN");
        }
    }

    #[test]
    fn clear_session_cookie_header_expires_cookie() {
        let _guard = cors_env_lock().lock().unwrap();
        unsafe {
            std::env::set_var("OMNYID_SESSION_COOKIE_SECURE", "true");
            std::env::remove_var("OMNYID_SESSION_COOKIE_DOMAIN");
        }
        let header = clear_session_cookie_header_value();
        assert!(header.contains("Max-Age=0"));
        assert!(header.contains("Secure"));
        unsafe {
            std::env::remove_var("OMNYID_SESSION_COOKIE_SECURE");
        }
    }

    #[test]
    fn session_cookie_secure_enabled_respects_explicit_override() {
        let _guard = cors_env_lock().lock().unwrap();
        unsafe {
            std::env::set_var("OMNYID_SESSION_COOKIE_SECURE", "false");
            std::env::set_var("OMNYID_ALLOW_LOCALHOST_ORIGINS", "false");
        }
        assert!(!session_cookie_secure_enabled());
        unsafe {
            std::env::remove_var("OMNYID_SESSION_COOKIE_SECURE");
            std::env::remove_var("OMNYID_ALLOW_LOCALHOST_ORIGINS");
        }
    }

    #[test]
    fn bearer_or_cookie_headers_can_carry_session_token() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("other=1; omnyid_session=cookie-token"),
        );
        assert_eq!(
            super::session_token_from_headers(&headers).as_deref(),
            Some("cookie-token")
        );
    }

    #[test]
    fn request_origin_is_allowed_accepts_known_origin() {
        let _guard = cors_env_lock().lock().unwrap();
        unsafe {
            std::env::set_var("OMNYID_ALLOWED_ORIGINS", "https://app.omnyid.com");
        }
        let mut headers = HeaderMap::new();
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://app.omnyid.com"),
        );
        assert!(request_origin_is_allowed(&headers));
        unsafe {
            std::env::remove_var("OMNYID_ALLOWED_ORIGINS");
        }
    }

    #[test]
    fn cookie_auth_origin_check_rejects_disallowed_origin() {
        let _guard = cors_env_lock().lock().unwrap();
        unsafe {
            std::env::set_var("OMNYID_ALLOWED_ORIGINS", "https://app.omnyid.com");
        }
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("omnyid_session=cookie-token"),
        );
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://evil.example"),
        );
        let err = require_cookie_auth_allowed_origin(&headers)
            .expect_err("disallowed origin should be rejected");
        assert_eq!(err.0, StatusCode::FORBIDDEN);
        assert!(err.1.contains("origin not allowed"));
        unsafe {
            std::env::remove_var("OMNYID_ALLOWED_ORIGINS");
        }
    }

    #[test]
    fn cookie_auth_origin_check_allows_absent_origin() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("omnyid_session=cookie-token"),
        );
        assert!(require_cookie_auth_allowed_origin(&headers).is_ok());
    }

    #[test]
    fn cookie_auth_origin_check_skips_bearer_requests() {
        let _guard = cors_env_lock().lock().unwrap();
        unsafe {
            std::env::set_var("OMNYID_ALLOWED_ORIGINS", "https://app.omnyid.com");
        }
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer bearer-token"),
        );
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://evil.example"),
        );
        assert!(require_cookie_auth_allowed_origin(&headers).is_ok());
        unsafe {
            std::env::remove_var("OMNYID_ALLOWED_ORIGINS");
        }
    }

    #[test]
    fn account_bootstrap_error_is_generic() {
        assert_eq!(
            account_bootstrap_error("save_master_agent_instance", "duplicate key value"),
            "failed to provision account workspace"
        );
    }

    #[test]
    fn verify_password_does_not_expose_hash_parse_details() {
        let err = verify_password("not-a-valid-password-hash", "secret")
            .expect_err("malformed password hash should fail");
        assert_eq!(err, "password verification failed");
    }

    #[test]
    fn apple_identity_token_validation_accepts_recent_token() {
        let token = make_apple_identity_token(super::AppleJwtClaims {
            sub: "apple-subject".to_string(),
            email: Some("user@example.com".to_string()),
            iss: Some("https://appleid.apple.com".to_string()),
            aud: Some("com.omnyid.app".to_string()),
            exp: Some(2_000_000_000i64),
            iat: Some(1_700_000_000i64), nonce: None,
        });

        let result = validate_apple_identity_token_with_jwks(
            &token,
            Some("com.omnyid.app"),
            1_800_000_000,
            &sample_apple_jwks(),
        );
        assert!(result.is_ok(), "expected valid token, got {result:?}");
    }

    #[test]
    fn apple_identity_token_validation_rejects_wrong_issuer() {
        let token = make_apple_identity_token(super::AppleJwtClaims {
            sub: "apple-subject".to_string(),
            email: None,
            iss: Some("https://evil.example".to_string()),
            aud: Some("com.omnyid.app".to_string()),
            exp: Some(2_000_000_000i64),
            iat: None, nonce: None,
        });

        let result = validate_apple_identity_token_with_jwks(
            &token,
            Some("com.omnyid.app"),
            1_800_000_000,
            &sample_apple_jwks(),
        );
        assert!(matches!(result, Err(message) if message.contains("issuer")));
    }

    #[test]
    fn apple_identity_token_validation_rejects_wrong_audience() {
        let token = make_apple_identity_token(super::AppleJwtClaims {
            sub: "apple-subject".to_string(),
            email: None,
            iss: Some("https://appleid.apple.com".to_string()),
            aud: Some("com.other.app".to_string()),
            exp: Some(2_000_000_000i64),
            iat: None, nonce: None,
        });

        let result = validate_apple_identity_token_with_jwks(
            &token,
            Some("com.omnyid.app"),
            1_800_000_000,
            &sample_apple_jwks(),
        );
        assert!(matches!(result, Err(message) if message.contains("audience")));
    }

    #[test]
    fn apple_identity_token_validation_rejects_expired_token() {
        let token = make_apple_identity_token(super::AppleJwtClaims {
            sub: "apple-subject".to_string(),
            email: None,
            iss: Some("https://appleid.apple.com".to_string()),
            aud: Some("com.omnyid.app".to_string()),
            exp: Some(100i64),
            iat: None, nonce: None,
        });

        let result = validate_apple_identity_token_with_jwks(
            &token,
            Some("com.omnyid.app"),
            1_800_000_000,
            &sample_apple_jwks(),
        );
        assert!(matches!(result, Err(message) if message.contains("expired")));
    }

    #[test]
    fn apple_identity_token_validation_rejects_non_rs256_header() {
        let header = B64URL.encode(
            serde_json::to_vec(&json!({
                "alg": "HS256",
                "kid": "apple-key-1"
            }))
            .expect("serialize Apple JWT header for tests"),
        );
        let payload = B64URL.encode(
            serde_json::to_vec(&json!({
                "sub": "apple-subject",
                "iss": "https://appleid.apple.com",
                "aud": "com.omnyid.app",
                "exp": 2_000_000_000i64
            }))
            .expect("serialize Apple JWT payload for tests"),
        );
        let token = format!("{header}.{payload}.signature");

        let result = validate_apple_identity_token_with_jwks(
            &token,
            Some("com.omnyid.app"),
            1_800_000_000,
            &sample_apple_jwks(),
        );
        assert!(matches!(result, Err(message) if message.contains("algorithm")));
    }

    #[test]
    fn google_token_validation_accepts_valid_verified_token() {
        let token_info = sample_google_token_info();
        let result = validate_google_token_info(&token_info, "client-id", 1_800_000_000);
        assert!(result.is_ok(), "expected valid token, got {result:?}");
    }

    #[test]
    fn google_token_validation_rejects_expired_token() {
        let mut token_info = sample_google_token_info();
        token_info.exp = Some("100".to_string());
        let result = validate_google_token_info(&token_info, "client-id", 1_800_000_000);
        assert!(matches!(result, Err(message) if message.contains("expired")));
    }

    #[test]
    fn google_token_validation_rejects_future_issued_at_beyond_skew_window() {
        let mut token_info = sample_google_token_info();
        token_info.iat = Some("1800000400".to_string());
        let result = validate_google_token_info(&token_info, "client-id", 1_800_000_000);
        assert!(matches!(result, Err(message) if message.contains("issued-at")));
    }

    #[test]
    fn google_token_validation_rejects_untrusted_issuer() {
        let mut token_info = sample_google_token_info();
        token_info.iss = Some("https://evil.example".to_string());
        let result = validate_google_token_info(&token_info, "client-id", 1_800_000_000);
        assert!(matches!(result, Err(message) if message.contains("issuer")));
    }

    #[test]
    fn google_client_id_configured_returns_none_when_env_missing() {
        let _guard = cors_env_lock().lock().unwrap();
        let previous = std::env::var("OMNYID_GOOGLE_CLIENT_ID").ok();
        unsafe {
            std::env::remove_var("OMNYID_GOOGLE_CLIENT_ID");
        }

        assert_eq!(google_client_id_configured(), None);

        match previous {
            Some(value) => unsafe { std::env::set_var("OMNYID_GOOGLE_CLIENT_ID", value) },
            None => unsafe { std::env::remove_var("OMNYID_GOOGLE_CLIENT_ID") },
        }
    }

    #[test]
    fn google_client_id_configured_trims_and_returns_configured_value() {
        let _guard = cors_env_lock().lock().unwrap();
        let previous = std::env::var("OMNYID_GOOGLE_CLIENT_ID").ok();
        unsafe {
            std::env::set_var(
                "OMNYID_GOOGLE_CLIENT_ID",
                " client-id.apps.googleusercontent.com ",
            );
        }

        assert_eq!(
            google_client_id_configured(),
            Some("client-id.apps.googleusercontent.com".to_string())
        );

        match previous {
            Some(value) => unsafe { std::env::set_var("OMNYID_GOOGLE_CLIENT_ID", value) },
            None => unsafe { std::env::remove_var("OMNYID_GOOGLE_CLIENT_ID") },
        }
    }

    #[test]
    fn google_subject_candidates_include_namespaced_and_legacy_values() {
        assert_eq!(
            google_subject_candidates("subject-123"),
            vec!["google:subject-123".to_string(), "subject-123".to_string()]
        );
    }

    #[test]
    fn passkey_rp_id_configured_requires_explicit_env() {
        let _guard = cors_env_lock().lock().unwrap();
        let previous = std::env::var("OMNYID_RP_ID").ok();
        unsafe {
            std::env::remove_var("OMNYID_RP_ID");
        }

        let err = passkey_rp_id_configured().expect_err("missing rp id should fail");
        assert_eq!(err.0, StatusCode::SERVICE_UNAVAILABLE);
        assert!(err.1.contains("OMNYID_RP_ID"));

        match previous {
            Some(value) => unsafe { std::env::set_var("OMNYID_RP_ID", value) },
            None => unsafe { std::env::remove_var("OMNYID_RP_ID") },
        }
    }

    #[test]
    fn passkey_origin_configured_requires_explicit_env() {
        let _guard = cors_env_lock().lock().unwrap();
        let previous = std::env::var("OMNYID_ORIGIN").ok();
        unsafe {
            std::env::remove_var("OMNYID_ORIGIN");
        }

        let err = passkey_origin_configured().expect_err("missing origin should fail");
        assert_eq!(err.0, StatusCode::SERVICE_UNAVAILABLE);
        assert!(err.1.contains("OMNYID_ORIGIN"));

        match previous {
            Some(value) => unsafe { std::env::set_var("OMNYID_ORIGIN", value) },
            None => unsafe { std::env::remove_var("OMNYID_ORIGIN") },
        }
    }

    #[test]
    fn passkey_config_helpers_trim_values() {
        let _guard = cors_env_lock().lock().unwrap();
        let previous_rp_id = std::env::var("OMNYID_RP_ID").ok();
        let previous_origin = std::env::var("OMNYID_ORIGIN").ok();
        unsafe {
            std::env::set_var("OMNYID_RP_ID", " omnyid.example ");
            std::env::set_var("OMNYID_ORIGIN", " https://app.omnyid.example ");
        }

        assert_eq!(
            passkey_rp_id_configured().expect("rp id"),
            "omnyid.example".to_string()
        );
        assert_eq!(
            passkey_origin_configured().expect("origin"),
            "https://app.omnyid.example".to_string()
        );

        match previous_rp_id {
            Some(value) => unsafe { std::env::set_var("OMNYID_RP_ID", value) },
            None => unsafe { std::env::remove_var("OMNYID_RP_ID") },
        }
        match previous_origin {
            Some(value) => unsafe { std::env::set_var("OMNYID_ORIGIN", value) },
            None => unsafe { std::env::remove_var("OMNYID_ORIGIN") },
        }
    }

    #[test]
    fn passkey_public_rate_limit_key_trims_user_id() {
        let headers = HeaderMap::new();
        assert_eq!(
            passkey_public_rate_limit_key("passkey_auth_begin", "  user_123  ", &headers),
            "passkey_auth_begin:direct:user_123"
        );
    }

    #[test]
    fn passkey_public_rate_limit_key_falls_back_for_blank_user_id() {
        let headers = HeaderMap::new();
        assert_eq!(
            passkey_public_rate_limit_key("passkey_auth_finish", "   ", &headers),
            "passkey_auth_finish:direct:anonymous"
        );
    }

    #[test]
    fn enforce_rate_limit_prefers_db_limiter_before_in_memory_fallback() {
        let source = include_str!("auth.rs");
        let start = source
            .find("pub(super) async fn enforce_rate_limit(")
            .expect("enforce_rate_limit exists");
        let end = source[start..]
            .find("\npub(super) fn public_rate_limit_key(")
            .map(|offset| start + offset)
            .expect("public_rate_limit_key follows enforce_rate_limit");
        let function_source = &source[start..end];

        let db_call = function_source
            .find(".db\n        .rate_limit_allow(")
            .expect("db-backed limiter call exists");
        let fallback = function_source
            .find("state.rate_limiter.allow(key, policy).await")
            .expect("in-memory fallback exists");

        assert!(db_call < fallback);
        assert!(
            function_source.contains("\"DB rate limiter unavailable; falling back to in-memory\"")
        );
    }

    #[test]
    fn enforce_rate_limit_returns_429_when_request_is_rejected() {
        let source = include_str!("auth.rs");
        let start = source
            .find("pub(super) async fn enforce_rate_limit(")
            .expect("enforce_rate_limit exists");
        let end = source[start..]
            .find("\npub(super) fn public_rate_limit_key(")
            .map(|offset| start + offset)
            .expect("public_rate_limit_key follows enforce_rate_limit");
        let function_source = &source[start..end];

        assert!(function_source.contains("state.metrics.inc_rate_limited_requests();"));
        assert!(function_source.contains("StatusCode::TOO_MANY_REQUESTS"));
        assert!(function_source.contains("\"too many requests, please try again shortly\""));
    }

    #[test]
    fn passkey_authentication_begin_options_hide_registered_credential_ids() {
        let (opts, challenge) = passkey_authentication_begin_options("omnyid.com");
        assert_eq!(opts.rp_id, "omnyid.com");
        assert_eq!(opts.challenge, challenge);
        assert!(opts.allow_credentials.is_empty());
    }

    #[test]
    fn normalize_passkey_begin_email_trims_and_lowercases() {
        assert_eq!(
            normalize_passkey_begin_email("  USER@Example.com  "),
            Some("user@example.com".to_string())
        );
    }

    #[test]
    fn normalize_passkey_begin_email_rejects_blank_and_invalid_values() {
        assert_eq!(normalize_passkey_begin_email("   "), None);
        assert_eq!(normalize_passkey_begin_email("not-an-email"), None);
    }

    #[test]
    fn passkey_authenticate_challenge_kind_is_source_bound_and_stable() {
        let headers = HeaderMap::new();
        let kind = passkey_authenticate_challenge_kind(&headers);
        assert!(kind.starts_with("authenticate:"));
        assert_eq!(kind.len(), "authenticate:".len() + 16);
        assert_eq!(kind, passkey_authenticate_challenge_kind(&headers));
    }

    #[test]
    fn forgot_password_public_response_is_generic() {
        let payload = forgot_password_public_response().0;
        assert_eq!(payload["ok"], true);
        assert_eq!(
            payload["message"],
            "if that email is registered, a reset link has been sent"
        );
    }

    #[test]
    fn resend_verification_public_response_is_generic() {
        let payload = resend_verification_public_response().0;
        assert_eq!(payload["ok"], true);
        assert_eq!(
            payload["message"],
            "if that email can still be verified, a new verification link has been sent"
        );
    }

    #[test]
    fn login_invalid_credentials_error_is_generic() {
        let err = login_invalid_credentials_error();
        assert_eq!(err.0, StatusCode::UNAUTHORIZED);
        assert_eq!(err.1, "invalid email or password".to_string());
    }

    #[test]
    fn external_sign_in_failed_error_is_generic() {
        let err = external_sign_in_failed_error();
        assert_eq!(err.0, StatusCode::UNAUTHORIZED);
        assert_eq!(err.1, "external sign-in failed".to_string());
    }

    #[test]
    fn passkey_registration_failed_error_is_generic() {
        let err = passkey_registration_failed_error();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert_eq!(err.1, "passkey registration failed".to_string());
    }

    #[test]
    fn passkey_authentication_failed_error_is_generic() {
        let err = passkey_authentication_failed_error();
        assert_eq!(err.0, StatusCode::UNAUTHORIZED);
        assert_eq!(err.1, "passkey authentication failed".to_string());
    }

    #[test]
    fn passkey_register_finish_stores_extracted_cose_key_instead_of_client_data() {
        let source = include_str!("auth.rs");
        assert!(
            source.contains("let cose_key_cbor_b64 = crate::webauthn::extract_cose_key_from_auth_data(&auth_data)"),
            "registration finish should extract the COSE public key from authData"
        );
        assert!(
            source.contains(
                "let cred = crate::webauthn::build_stored_credential(&finish, &cose_key_cbor_b64);"
            ),
            "registration finish should store the extracted COSE public key"
        );
    }

    #[test]
    fn passkey_authenticate_finish_verifies_signature_before_issuing_session() {
        let source = include_str!("auth.rs");
        let verify_idx = source
            .find("crate::webauthn::verify_assertion_signature(")
            .expect("passkey auth finish should verify assertion signatures");
        let session_idx = source
            .find(".create_session_for_passkey(&cred.user_id, \"passkey\")")
            .expect("passkey auth finish should issue a passkey-backed session");
        assert!(
            verify_idx < session_idx,
            "signature verification must happen before session issuance"
        );
    }

    #[test]
    fn external_identity_failures_and_passkey_begin_serialization_are_sanitized() {
        let source = include_str!("auth.rs");
        assert!(
            source.contains("\"Apple identity verification is temporarily unavailable\""),
            "apple identity verification failures should be bounded"
        );
        assert!(
            source.contains("\"Google sign-in is temporarily unavailable\""),
            "google sign-in failures should be bounded"
        );
        assert!(
            source
                .matches("serde_json::to_value(opts).map_err(internal_http_error)?;")
                .count()
                >= 2,
            "passkey register begin and passkey authenticate begin should both propagate serialization failures through sanitized internal errors"
        );
    }

    #[test]
    fn registration_public_response_is_generic() {
        let response = registration_public_response("user@example.com");
        assert!(response.verification_required);
        assert_eq!(response.email.as_deref(), Some("user@example.com"));
        assert_eq!(
            response.message.as_deref(),
            Some(
                "If this email can be registered or still needs verification, check your inbox for next steps."
            )
        );
        assert!(response.token.is_none());
        assert!(response.user.is_none());
    }

    #[test]
    fn registration_delivery_failure_is_honest_without_revealing_account_state() {
        let response = registration_delivery_unavailable_response("person@example.com");
        assert!(response.verification_required);
        assert_eq!(response.email.as_deref(), Some("person@example.com"));
        assert_eq!(
            response.message.as_deref(),
            Some("We could not send a confirmation email yet. Please try again shortly.")
        );
    }

    #[test]
    fn auth_base_url_configured_requires_explicit_env() {
        let _guard = cors_env_lock().lock().unwrap();
        let previous = std::env::var("OMNYID_BASE_URL").ok();
        unsafe {
            std::env::remove_var("OMNYID_BASE_URL");
        }

        let err = auth_base_url_configured().expect_err("missing base url should fail");
        assert_eq!(err.0, StatusCode::SERVICE_UNAVAILABLE);
        assert!(err.1.contains("OMNYID_BASE_URL"));

        match previous {
            Some(value) => unsafe { std::env::set_var("OMNYID_BASE_URL", value) },
            None => unsafe { std::env::remove_var("OMNYID_BASE_URL") },
        }
    }

    #[test]
    fn auth_base_url_configured_trims_and_drops_trailing_slash() {
        let _guard = cors_env_lock().lock().unwrap();
        let previous = std::env::var("OMNYID_BASE_URL").ok();
        unsafe {
            std::env::set_var("OMNYID_BASE_URL", " https://app.omnyid.example/ ");
        }

        assert_eq!(
            auth_base_url_configured().expect("base url"),
            "https://app.omnyid.example".to_string()
        );

        match previous {
            Some(value) => unsafe { std::env::set_var("OMNYID_BASE_URL", value) },
            None => unsafe { std::env::remove_var("OMNYID_BASE_URL") },
        }
    }

    #[test]
    fn auth_token_record_is_usable_rejects_used_or_expired_tokens() {
        let fresh = AuthTokenRecord {
            id: "tok_1".to_string(),
            user_id: "user_1".to_string(),
            kind: "email_verify".to_string(),
            token_hash: "hash".to_string(),
            expires_at: "2999-01-01T00:00:00Z".to_string(),
            used_at: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
        };
        let used = AuthTokenRecord {
            used_at: Some("2026-01-02T00:00:00Z".to_string()),
            ..fresh.clone()
        };
        let expired = AuthTokenRecord {
            expires_at: "2000-01-01T00:00:00Z".to_string(),
            ..fresh.clone()
        };

        assert!(auth_token_record_is_usable(&fresh));
        assert!(!auth_token_record_is_usable(&used));
        assert!(!auth_token_record_is_usable(&expired));
    }

    #[test]
    fn registration_validation_rejects_overlong_display_name() {
        let display_name = "x".repeat(101);
        let result = validate_registration_fields("user@example.com", &display_name, "password123");
        assert!(matches!(
            result,
            Err((StatusCode::BAD_REQUEST, message))
            if message.contains("100 characters or fewer")
        ));
    }

    #[test]
    fn registration_validation_rejects_overlong_email() {
        let local = "a".repeat(243);
        let email = format!("{local}@example.com");
        let result = validate_registration_fields(&email, "Example", "password123");
        assert!(matches!(
            result,
            Err((StatusCode::BAD_REQUEST, message))
            if message == "email too long"
        ));
    }

    #[test]
    fn allowed_cors_methods_include_admin_vendor_delete() {
        let methods = allowed_cors_methods();
        assert!(methods.contains(&Method::GET));
        assert!(methods.contains(&Method::POST));
        assert!(methods.contains(&Method::PUT));
        assert!(methods.contains(&Method::DELETE));
        assert!(methods.contains(&Method::OPTIONS));
    }

    #[test]
    fn allowed_cors_origins_excludes_localhost_when_not_explicitly_allowed() {
        let _guard = cors_env_lock().lock().unwrap();
        let previous_allowed = std::env::var("OMNYID_ALLOWED_ORIGINS").ok();
        let previous_localhost = std::env::var("OMNYID_ALLOW_LOCALHOST_ORIGINS").ok();
        unsafe {
            std::env::remove_var("OMNYID_ALLOWED_ORIGINS");
            std::env::set_var("OMNYID_ALLOW_LOCALHOST_ORIGINS", "false");
        }

        let origins = allowed_cors_origins()
            .into_iter()
            .filter_map(|value| value.to_str().ok().map(str::to_string))
            .collect::<Vec<_>>();

        assert!(origins.iter().any(|origin| origin == "https://omnyid.com"));
        assert!(
            origins
                .iter()
                .any(|origin| origin == "https://cloud.omnyid.com")
        );
        assert!(!origins.iter().any(|origin| origin.contains("localhost")));
        assert!(!origins.iter().any(|origin| origin.contains("127.0.0.1")));

        unsafe {
            if let Some(value) = previous_allowed {
                std::env::set_var("OMNYID_ALLOWED_ORIGINS", value);
            } else {
                std::env::remove_var("OMNYID_ALLOWED_ORIGINS");
            }
            if let Some(value) = previous_localhost {
                std::env::set_var("OMNYID_ALLOW_LOCALHOST_ORIGINS", value);
            } else {
                std::env::remove_var("OMNYID_ALLOW_LOCALHOST_ORIGINS");
            }
        }
    }

    #[test]
    fn allowed_cors_origins_can_explicitly_include_localhost_for_dev_surfaces() {
        let _guard = cors_env_lock().lock().unwrap();
        let previous_allowed = std::env::var("OMNYID_ALLOWED_ORIGINS").ok();
        let previous_localhost = std::env::var("OMNYID_ALLOW_LOCALHOST_ORIGINS").ok();
        unsafe {
            std::env::remove_var("OMNYID_ALLOWED_ORIGINS");
            std::env::set_var("OMNYID_ALLOW_LOCALHOST_ORIGINS", "true");
        }

        let origins = allowed_cors_origins()
            .into_iter()
            .filter_map(|value| value.to_str().ok().map(str::to_string))
            .collect::<Vec<_>>();

        assert!(origins.iter().any(|origin| origin == "https://omnyid.com"));
        assert!(
            origins
                .iter()
                .any(|origin| origin == "https://cloud.omnyid.com")
        );
        assert!(
            origins
                .iter()
                .any(|origin| origin == "http://localhost:3000")
        );
        assert!(
            origins
                .iter()
                .any(|origin| origin == "http://127.0.0.1:3000")
        );
        assert!(
            origins
                .iter()
                .any(|origin| origin == "http://localhost:4174")
        );
        assert!(
            origins
                .iter()
                .any(|origin| origin == "http://127.0.0.1:4174")
        );

        unsafe {
            if let Some(value) = previous_allowed {
                std::env::set_var("OMNYID_ALLOWED_ORIGINS", value);
            } else {
                std::env::remove_var("OMNYID_ALLOWED_ORIGINS");
            }
            if let Some(value) = previous_localhost {
                std::env::set_var("OMNYID_ALLOW_LOCALHOST_ORIGINS", value);
            } else {
                std::env::remove_var("OMNYID_ALLOW_LOCALHOST_ORIGINS");
            }
        }
    }

    #[test]
    fn change_password_requires_a_current_session_to_revoke_others() {
        assert!(change_password_revokes_other_sessions("session-token"));
        assert!(!change_password_revokes_other_sessions(""));
        assert!(!change_password_revokes_other_sessions("   "));
    }
}

struct DemoSeedRelationSpec {
    target_slug: &'static str,
    relation: &'static str,
    label: &'static str,
}

struct DemoSeedNoteSpec {
    slug: &'static str,
    title: &'static str,
    summary: &'static str,
    tags: &'static [&'static str],
    supertags: &'static [&'static str],
    facts: &'static [&'static str],
    relations: &'static [DemoSeedRelationSpec],
}

#[allow(dead_code)]
fn demo_seed_note_specs() -> Vec<DemoSeedNoteSpec> {
    vec![
        DemoSeedNoteSpec {
            slug: "seed-index",
            title: "Demo knowledge seed index",
            summary: "Overview of the seeded profile, people, objectives, values, projects, and knowledge cards.",
            tags: &["demo", "index", "bootstrap"],
            supertags: &["Knowledge", "Profile"],
            facts: &[
                "This workspace contains structured fake data for profile, people, objectives, values, projects, and knowledge.",
                "Each seeded card is stored as an AFP note so it appears through existing notes, thread, and retrieval paths.",
                "People cards describe trusted collaborators, communication norms, and ongoing commitments.",
                "Objective cards capture annual, quarterly, and weekly steering priorities.",
                "Knowledge cards summarize routines, preferences, heuristics, and project context.",
                "Relationship references connect the seed cards so graph and retrieval surfaces have real structure to inspect.",
            ],
            relations: &[],
        },
        DemoSeedNoteSpec {
            slug: "profile-core",
            title: "Demo user profile: operating context",
            summary: "Core profile traits, work context, and environmental constraints for the seeded user.",
            tags: &["profile", "context", "identity"],
            supertags: &["Profile", "Knowledge"],
            facts: &[
                "The seeded user works as a product-minded technical founder operating across product, design, and infrastructure.",
                "Primary working hours are 08:30 to 17:30 local time with a protected deep-work block before lunch.",
                "The user prefers written synthesis before meetings and dislikes jumping directly into unstructured calls.",
                "Personal energy is highest in the morning and drops sharply after 16:30 unless work is already in motion.",
                "The user tracks obligations across work, family, health, and learning rather than keeping a work-only system.",
                "The user values clarity, reversibility, and low-friction follow-through over maximal throughput theater.",
            ],
            relations: &[],
        },
        DemoSeedNoteSpec {
            slug: "profile-workstyle",
            title: "Demo user profile: workstyle and preferences",
            summary: "Interaction preferences, planning habits, and decision patterns for the seeded user.",
            tags: &["profile", "preferences", "workstyle"],
            supertags: &["Profile", "Values", "Knowledge"],
            facts: &[
                "The user prefers one clearly recommended next action instead of a broad undifferentiated task list.",
                "The user is comfortable with automation when provenance and undo boundaries are explicit.",
                "The user wants reminders to be calm and sparse rather than frequent and pushy.",
                "The user reads long-form notes comfortably but prefers compressed summaries on the home surface.",
                "The user wants relationship follow-ups suggested only when there is enough evidence to make them feel timely.",
                "The user prefers prepared drafts over generic nudges when the system already has enough context to help concretely.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "profile-core",
                relation: "expands",
                label: "Expands core profile",
            }],
        },
        DemoSeedNoteSpec {
            slug: "values-map",
            title: "Demo values map",
            summary: "Stable values and tradeoff preferences that should shape ranking and recommendations.",
            tags: &["values", "decision-making", "preferences"],
            supertags: &["Values", "Profile", "Knowledge"],
            facts: &[
                "Clarity outranks speed when the user is making commitments that affect other people.",
                "Reversible progress is preferred over irreversible leaps unless the upside is unusually high.",
                "The user wants the system to protect attention as aggressively as it protects completeness.",
                "High-context relationships should be handled with warmth and precision rather than optimized for efficiency alone.",
                "The user is willing to spend more time on work that compounds into durable knowledge or better infrastructure.",
                "Low-trust recommendations should be framed as suggestions for inspection, not as quiet defaults.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "profile-core",
                relation: "grounds",
                label: "Grounds profile behavior",
            }],
        },
        DemoSeedNoteSpec {
            slug: "annual-objectives",
            title: "Annual objectives",
            summary: "Top yearly objectives for the seeded user across product, health, and relationships.",
            tags: &["objectives", "annual", "planning"],
            supertags: &["Objectives", "Work", "Life"],
            facts: &[
                "Ship a reliable personal operating system that feels calmer and more useful than a normal chat interface.",
                "Stabilize the Oracle-hosted production path so the system is usable outside local development.",
                "Build a trustworthy retrieval layer that can surface relevant context without overwhelming the user.",
                "Restore a consistent movement routine with four workouts and two long walks per week.",
                "Maintain closer contact with family and three core friends through timely, high-quality follow-ups.",
                "Reduce fragmented decision overhead by packaging more work into prepared drafts and prepared context.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "values-map",
                relation: "guided_by",
                label: "Guided by values map",
            }],
        },
        DemoSeedNoteSpec {
            slug: "quarterly-objectives",
            title: "Quarterly objectives",
            summary: "Current-quarter focus areas derived from the seeded annual objectives.",
            tags: &["objectives", "quarterly", "execution"],
            supertags: &["Objectives", "Work"],
            facts: &[
                "Finish the editor-first notes surface and close the remaining browse-first interaction seams.",
                "Expand seeded knowledge so retrieval, continuity, and graph surfaces have richer real-looking context.",
                "Harden the Oracle deployment path with a repeatable compose + environment workflow.",
                "Improve continuity ranking so prepared work wins over generic queue pressure more consistently.",
                "Tighten relationship follow-up surfacing so it is grounded, timely, and easy to dismiss.",
                "Document the strongest product-shape principles so new work lands in the right architecture by default.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "annual-objectives",
                relation: "decomposes",
                label: "Decomposes annual objectives",
            }],
        },
        DemoSeedNoteSpec {
            slug: "weekly-rules",
            title: "Weekly operating rules",
            summary: "Low-level operating heuristics the seeded user tries to maintain week to week.",
            tags: &["weekly", "heuristics", "operating-rules"],
            supertags: &["Knowledge", "Values"],
            facts: &[
                "Finish one meaningful prepared artifact before opening a new large initiative.",
                "Avoid stacking more than two high-cognitive-load meetings in a single day.",
                "Close response loops with core collaborators within twenty-four hours whenever possible.",
                "If a task can be made clearer with one structured note, write the note before touching implementation.",
                "If a suggestion requires too much interpretation, turn it into a draft or hide it.",
                "If a routine breaks for more than three days, restart with the smallest credible version first.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "values-map",
                relation: "applies",
                label: "Applies values operationally",
            }],
        },
        DemoSeedNoteSpec {
            slug: "person-maya",
            title: "Person: Maya Chen",
            summary: "Trusted product collaborator with strong design instincts and fast feedback loops.",
            tags: &["people", "collaborator", "design"],
            supertags: &["People", "Relationships", "Work"],
            facts: &[
                "Maya is the most reliable thought partner for product framing and interface simplification.",
                "She prefers concise written updates before meetings and responds quickly to clear visual direction.",
                "She is unusually good at spotting where a workflow still feels like tooling instead of product.",
                "She cares about emotional tone, not just information density, in user-facing surfaces.",
                "She is comfortable challenging scope but dislikes ambiguous ownership boundaries.",
                "The user trusts Maya most on decision surfaces, onboarding clarity, and interaction polish.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "relation-map",
                relation: "member_of",
                label: "Part of relationship map",
            }],
        },
        DemoSeedNoteSpec {
            slug: "person-daniel",
            title: "Person: Daniel Ortiz",
            summary: "Operations-oriented collaborator focused on delivery risk and infrastructure reliability.",
            tags: &["people", "operations", "infrastructure"],
            supertags: &["People", "Relationships", "Work"],
            facts: &[
                "Daniel is the main collaborator for deployment, incident prevention, and rollout sequencing.",
                "He prefers explicit checklists, timestamps, and concrete risk statements over abstract planning language.",
                "He is patient with technical complexity but impatient with repeated avoidable deployment mistakes.",
                "He notices infrastructure debt earlier than product debt and escalates when confidence is low.",
                "He prefers to batch environment changes rather than tweak them ad hoc throughout the week.",
                "The user trusts Daniel most on production readiness and operational tradeoff realism.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "relation-map",
                relation: "member_of",
                label: "Part of relationship map",
            }],
        },
        DemoSeedNoteSpec {
            slug: "person-priya",
            title: "Person: Priya Nair",
            summary: "Research-heavy collaborator who helps synthesize markets, workflows, and user needs.",
            tags: &["people", "research", "synthesis"],
            supertags: &["People", "Relationships", "Knowledge"],
            facts: &[
                "Priya is the best collaborator for translating scattered evidence into coherent narrative framing.",
                "She prefers asynchronous briefs with links, claims, and open questions already separated.",
                "She is especially helpful when product work risks drifting away from real user pain.",
                "She notices missing assumptions faster than missing features.",
                "She tends to reply thoughtfully but not instantly, so reminders should be gentle rather than urgent.",
                "The user trusts Priya most on synthesis quality, market signals, and framing ambiguity.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "relation-map",
                relation: "member_of",
                label: "Part of relationship map",
            }],
        },
        DemoSeedNoteSpec {
            slug: "person-sofia",
            title: "Person: Sofia Kim",
            summary: "Close friend whose follow-ups matter personally even when they are not work-related.",
            tags: &["people", "friendship", "personal"],
            supertags: &["People", "Relationships", "Life"],
            facts: &[
                "Sofia is a close friend who values thoughtful messages over high-frequency check-ins.",
                "She usually responds well to specific life updates, book recommendations, and reflective questions.",
                "She dislikes transactional communication and can sense when a follow-up feels automated.",
                "She is an important relationship for emotional grounding outside work.",
                "Her best communication windows are weekday evenings and late Sunday afternoons.",
                "The user wants reminders about Sofia to feel warm, sparse, and well-timed.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "relation-map",
                relation: "member_of",
                label: "Part of relationship map",
            }],
        },
        DemoSeedNoteSpec {
            slug: "relation-map",
            title: "Relationship map",
            summary: "High-level relationship context across collaborators, friends, and family-facing obligations.",
            tags: &["relationships", "network", "continuity"],
            supertags: &["Relationships", "Knowledge", "Profile"],
            facts: &[
                "Work-critical relationships currently cluster around product, infrastructure, and synthesis roles.",
                "Personal relationships matter for energy regulation and should not be crowded out by task urgency.",
                "Warm follow-ups should prefer quality and timing over raw frequency.",
                "The user benefits from seeing which relationships are overdue before they become emotionally costly.",
                "Context-rich collaborators deserve prepared drafts more often than generic reminder nudges.",
                "A small number of trusted people drive a disproportionate amount of leverage and support.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "profile-workstyle",
                relation: "supports",
                label: "Supports communication preferences",
            }],
        },
        DemoSeedNoteSpec {
            slug: "project-atlas",
            title: "Project Atlas",
            summary: "Core workspace and continuity productization effort for the seeded user.",
            tags: &["project", "product", "continuity"],
            supertags: &["Work", "Objectives", "Knowledge"],
            facts: &[
                "Project Atlas is the main effort to turn the personal operating system into a coherent daily product.",
                "Its highest-value surfaces are DecisionOS, continuity, prepared work, and retrieval.",
                "The biggest risk is slipping back into tool-sprawl instead of shipping one integrated operating surface.",
                "The project needs quality ranking, trust cues, and reversible actions more than more isolated features.",
                "The project benefits when new work lands inside existing seams rather than inventing parallel systems.",
                "The user wants Atlas to feel calm, inspectable, and high-leverage rather than chat-heavy.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "quarterly-objectives",
                relation: "advances",
                label: "Advances quarterly objectives",
            }],
        },
        DemoSeedNoteSpec {
            slug: "project-harbor",
            title: "Project Harbor",
            summary: "Deployment and production hardening effort centered on Oracle-hosted reliability.",
            tags: &["project", "deployment", "oracle"],
            supertags: &["Work", "Infrastructure", "Knowledge"],
            facts: &[
                "Project Harbor focuses on making Oracle-hosted Omnyid stable enough for continuous use.",
                "Its priority is reducing deployment fragility and making environment assumptions explicit.",
                "The most important surfaces are bootstrap reliability, transport health, database continuity, and secrets handling.",
                "The user wants seeded data and bootstrap quality to work the same way locally and on Oracle.",
                "The project should avoid drift between local assumptions and cloud reality.",
                "Operational trust improves when deployment docs match the actual code path and seeded behavior.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "person-daniel",
                relation: "owned_with",
                label: "Owned with Daniel",
            }],
        },
        DemoSeedNoteSpec {
            slug: "project-lighthouse",
            title: "Project Lighthouse",
            summary: "Retrieval and knowledge-layer improvement effort for higher-signal context surfacing.",
            tags: &["project", "retrieval", "knowledge"],
            supertags: &["Work", "Knowledge", "Objectives"],
            facts: &[
                "Project Lighthouse focuses on making retrieval feel precise, explainable, and useful in live work.",
                "The most important levers are structured metadata, supertags, relationship signals, and ranking quality.",
                "The project should make user profile, people, values, and objectives first-class retrieval context.",
                "The user wants better access to the right card or thread without manually reconstructing context.",
                "Hierarchy, exact metadata terms, and prepared-work alignment should improve search without overwhelming users.",
                "Seeded fake data is useful here because retrieval quality can only be judged against meaningful context density.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "person-priya",
                relation: "researched_with",
                label: "Researched with Priya",
            }],
        },
        DemoSeedNoteSpec {
            slug: "knowledge-health",
            title: "Knowledge: health and energy routines",
            summary: "Routines, constraints, and heuristics for sustaining energy and reducing burnout.",
            tags: &["health", "routines", "energy"],
            supertags: &["Knowledge", "Life", "Profile"],
            facts: &[
                "Four workouts per week is the target routine, but consistency matters more than intensity.",
                "A twenty-minute walk after heavy cognitive work helps the user reset faster than passive browsing.",
                "Skipping lunch leads to lower-quality late-day decision making more often than it saves time.",
                "Sleep debt affects emotional tone long before it affects raw task throughput.",
                "Gentle reminders about movement are useful only when attached to a realistic open time window.",
                "The system should treat sustained low-energy context as a routing factor, not just a wellness note.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "profile-core",
                relation: "supports",
                label: "Supports profile stability",
            }],
        },
        DemoSeedNoteSpec {
            slug: "knowledge-finance",
            title: "Knowledge: finance preferences",
            summary: "Financial habits, thresholds, and decision rules for the seeded user.",
            tags: &["finance", "budget", "decision-rules"],
            supertags: &["Knowledge", "Life", "Values"],
            facts: &[
                "The user is comfortable spending on durable infrastructure but cautious about recurring low-value subscriptions.",
                "Unexpected spending above a moderate threshold should be summarized before it is approved.",
                "The user prefers to batch financial admin into one weekly review window.",
                "Financial reminders should be framed as reducing uncertainty, not as pressure language.",
                "Tradeoffs with strong time savings can justify spend more easily than tradeoffs with marginal convenience only.",
                "Shared cost visibility matters more than perfect categorization detail in the daily interface.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "values-map",
                relation: "expresses",
                label: "Expresses values in finance",
            }],
        },
        DemoSeedNoteSpec {
            slug: "knowledge-learning",
            title: "Knowledge: learning roadmap",
            summary: "Topics and study patterns the seeded user wants to deepen over time.",
            tags: &["learning", "research", "roadmap"],
            supertags: &["Knowledge", "Objectives", "Life"],
            facts: &[
                "The user wants to deepen understanding of retrieval systems, memory architecture, and agent product design.",
                "Reading is most useful when immediately converted into notes, principles, or implementation experiments.",
                "Dense technical topics should be revisited in short repeated sessions rather than a single long binge.",
                "The user wants the system to connect new readings to current projects automatically when confidence is high.",
                "Learning reminders should align with curiosity windows rather than compete with urgent coordination work.",
                "High-value knowledge should become reusable cards, not remain buried in one-off notes.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "project-lighthouse",
                relation: "feeds",
                label: "Feeds retrieval work",
            }],
        },
        DemoSeedNoteSpec {
            slug: "knowledge-communication",
            title: "Knowledge: communication heuristics",
            summary: "Style and medium preferences that should shape drafts and follow-up suggestions.",
            tags: &["communication", "drafting", "follow-up"],
            supertags: &["Knowledge", "Relationships", "Profile"],
            facts: &[
                "The user prefers short clear drafts with one recommendation and one fallback rather than sprawling options.",
                "Messages should acknowledge context first and request action second when the recipient matters personally.",
                "Follow-ups are better when grounded in actual thread history instead of generic reminder phrasing.",
                "The user values calm tone and specificity over performative warmth.",
                "Relationship-sensitive communication should avoid sounding system-generated even when seeded by the system.",
                "Prepared drafts are usually more welcome than reminders when there is enough context to draft responsibly.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "person-sofia",
                relation: "applies_to",
                label: "Applies to Sofia follow-ups",
            }],
        },
        DemoSeedNoteSpec {
            slug: "knowledge-travel",
            title: "Knowledge: travel and movement preferences",
            summary: "Practical travel preferences and environmental constraints for planning.",
            tags: &["travel", "planning", "preferences"],
            supertags: &["Knowledge", "Life", "Profile"],
            facts: &[
                "Morning flights are preferred when they reduce uncertainty, even if they are slightly less convenient.",
                "The user packs light and prefers a single reliable bag over multiple fragile categories.",
                "Trips longer than three days require a deliberate work continuity plan before departure.",
                "Travel planning should surface transport, lodging, and follow-up obligations together rather than separately.",
                "Jet lag recovery is materially easier when the first evening remains light and unscheduled.",
                "The user values calm transitions more than maximizing every available hour on travel days.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "profile-core",
                relation: "constrains",
                label: "Constrains scheduling profile",
            }],
        },
        DemoSeedNoteSpec {
            slug: "knowledge-infrastructure",
            title: "Knowledge: infrastructure preferences",
            summary: "Stable principles around deployment, environments, backups, and runtime observability.",
            tags: &["infrastructure", "deployment", "ops"],
            supertags: &["Knowledge", "Infrastructure", "Values"],
            facts: &[
                "Environment drift is more dangerous than temporary incompleteness because it creates false confidence.",
                "The user prefers one documented deployment path over several half-maintained alternatives.",
                "Seed data should be inserted through the same application code path used in production rather than direct SQL hacks.",
                "Operational documentation is only trustworthy when it is updated as part of the same slice as the code change.",
                "Meaningful bootstrap data is part of product readiness because empty systems hide retrieval and continuity defects.",
                "Observability should explain what the system believes is happening, not only whether the process is alive.",
            ],
            relations: &[DemoSeedRelationSpec {
                target_slug: "project-harbor",
                relation: "supports",
                label: "Supports Harbor operations",
            }],
        },
    ]
}

/// Deterministically maps an arbitrary seed string onto a valid-format ULID
/// (26-char Crockford base32). Used for stable per-user demo thread IDs, which
/// must pass `validate_proto_message`'s ULID-format check (GAP-098) but also
/// need to resolve to the same ID on every bootstrap call so the "does this
/// demo thread already exist" dedup check works across repeated logins.
fn deterministic_ulid(seed: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(seed.as_bytes());
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    Ulid::from_bytes(bytes).to_string()
}

#[allow(dead_code)]
fn demo_seed_note_thread_id(user_id: &str, slug: &str) -> String {
    deterministic_ulid(&format!("thread.demo.seed.{}.{}", user_id, slug))
}

#[allow(dead_code)]
fn build_demo_seed_notes(
    primary_agent_id: &str,
    user: &UserRecord,
) -> Result<Vec<AFPMessage>, String> {
    let mut messages = Vec::new();
    for spec in demo_seed_note_specs() {
        let thread_id = demo_seed_note_thread_id(&user.id, spec.slug);
        let body = spec
            .facts
            .iter()
            .enumerate()
            .map(|(index, fact)| format!("{}. {}", index + 1, fact))
            .collect::<Vec<_>>()
            .join("\n");
        let references = spec
            .relations
            .iter()
            .map(|relation| {
                serde_json::json!({
                    "type": "thread",
                    "target": demo_seed_note_thread_id(&user.id, relation.target_slug),
                    "label": relation.label,
                    "metadata": {
                        "relation": relation.relation
                    }
                })
            })
            .collect::<Vec<_>>();
        messages.push(new_server_message(
            primary_agent_id.to_string(),
            vec![],
            thread_id,
            "note",
            serde_json::json!({
                "title": spec.title,
                "body": body,
                "summary": spec.summary,
                "tags": spec.tags,
                "supertags": spec.supertags,
                "kind": "demo_seed_note",
                "info_point_count": spec.facts.len(),
            }),
            vec![],
            references,
            vec![],
            true,
        )?);
    }
    Ok(messages)
}

pub(super) async fn ensure_user_agents_and_demo_seed(
    state: &Arc<AppState>,
    user: &UserRecord,
) -> Result<(), String> {
    let existing_agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(|err| account_bootstrap_error("list_managed_agents_by_user", err))?;
    let agents_were_missing = existing_agents.is_empty();

    let primary_local = email_localpart_slug(&user.email);
    let primary_agent = ManagedAgentRecord {
        id: Ulid::new().to_string(),
        owner_user_id: user.id.clone(),
        agent_id: format!("agent:{}-{}@omnyid.com", primary_local, &user.id[..8]),
        label: "Primary agent".to_string(),
        email: user.email.clone(),
        kind: "managed".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        metadata: serde_json::json!({"origin":"account_registration"}),
    };
    let alpha_agent = ManagedAgentRecord {
        id: Ulid::new().to_string(),
        owner_user_id: user.id.clone(),
        agent_id: format!("agent:test-alpha-{}@omnyid.com", &user.id[..8]),
        label: "Test agent alpha".to_string(),
        email: format!("alpha+{}@omnyid.com", &user.id[..8]),
        kind: "demo".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        metadata: serde_json::json!({"role":"demo_sender"}),
    };
    let beta_agent = ManagedAgentRecord {
        id: Ulid::new().to_string(),
        owner_user_id: user.id.clone(),
        agent_id: format!("agent:test-beta-{}@omnyid.com", &user.id[..8]),
        label: "Test agent beta".to_string(),
        email: format!("beta+{}@omnyid.com", &user.id[..8]),
        kind: "demo".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        metadata: serde_json::json!({"role":"demo_recipient"}),
    };

    if agents_were_missing {
        for agent in [&primary_agent, &alpha_agent, &beta_agent] {
            state
                .db
                .upsert_managed_agent(agent)
                .await
                .map_err(|err| account_bootstrap_error("upsert_managed_agent", err))?;
        }
    }

    let thread_id = demo_thread_id(&user.id);
    let demo_thread_exists = !state
        .db
        .get_private_thread(&user.id, &thread_id)
        .await
        .map_err(|err| account_bootstrap_error("get_private_thread.demo_intro", err))?
        .is_empty();
    if !demo_thread_exists {
        let intro_messages = vec![new_server_message(
            alpha_agent.agent_id.clone(),
            vec![beta_agent.agent_id.clone()],
            thread_id.clone(),
            "agent_message",
            serde_json::json!({
                "title": "Demo: welcome to OmnyID",
                "body": format!("Demo message for {}. Use the Master Agent field to ask a real question; this sample can be ignored.", user.display_name),
                "kind": "demo_seed",
                "is_demo": true,
                "tags": ["demo"]
            }),
            vec![serde_json::json!({
                "format": "email",
                "content": {
                    "subject": "Demo: welcome to OmnyID",
                    "body": format!("Demo message for {}. Use the Master Agent field to ask a real question; this sample can be ignored.", user.display_name)
                }
            })],
            vec![],
            vec![],
            true,
        )?];

        for message in intro_messages {
            store_private_app_message(
                &state.db,
                &state.metrics,
                &state.relay_tx,
                &user.id,
                message,
            )
            .await
            .map_err(|err| {
                account_bootstrap_error("store_private_app_message.demo_intro", err.message())
            })?;
        }
    }

    // Provision master AgentInstance with soul.md
    let master_instance =
        crate::agent_template::AgentInstance::provision(&user.id, &user.display_name, "omnyid.com");
    state
        .db
        .save_master_agent_instance(&master_instance)
        .await
        .map_err(|err| account_bootstrap_error("save_master_agent_instance", err))?;

    Ok(())
}

pub(crate) fn new_server_message(
    from: String,
    to: Vec<String>,
    thread_id: String,
    message_type: &str,
    content: Value,
    views: Vec<Value>,
    references: Vec<Value>,
    attachments: Vec<Value>,
    store_in_relational: bool,
) -> Result<AFPMessage, String> {
    let encryption_key = super::env_hex_32("OMNYID_ENCRYPTION_KEY_HEX")?.ok_or_else(|| {
        "OMNYID_ENCRYPTION_KEY_HEX must be configured for server-generated messages".to_string()
    })?;
    let (normalized_type, normalized_subtype, normalized_metadata) =
        normalized_server_message_taxonomy(message_type);
    let message_id = Ulid::new().to_string();
    let timestamp = chrono::Utc::now().to_rfc3339();
    // AAD canonical format (GAP-009): must match gateway/smtp_in.rs and python-sdk.
    let aad = serde_json::json!({
        "protocol": "afp-v1",
        "id": message_id,
        "thread_id": thread_id,
        "parent_id": "",
        "from": from,
        "to": to,
        "timestamp": timestamp,
        "type": normalized_type,
        "subtype": normalized_subtype,
        "metadata": normalized_metadata,
    });
    let encryption = crate::crypto::encrypt_content(&content, &aad, &encryption_key);
    let _views = views;
    let mut message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: aad
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        thread_id: aad
            .get("thread_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        parent_id: None,
        from: aad
            .get("from")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        to: aad
            .get("to")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        timestamp: aad
            .get("timestamp")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        r#type: normalized_type.to_string(),
        kind: None,
        supertags: vec![],
        subtype: (!normalized_subtype.is_empty()).then(|| normalized_subtype.to_string()),
        content,
        metadata: if normalized_metadata.is_null() {
            None
        } else {
            Some(normalized_metadata)
        },
        signature: String::new(),
        encryption: Some(encryption),
        views: vec![],
        references,
        typed_refs: vec![],
        attachments,
        store_in_relational,
        prev_hash: None,
    };
    super::sign_server_generated_message(&mut message)?;
    Ok(message)
}

pub(super) fn normalized_server_message_taxonomy(message_type: &str) -> (&str, &str, Value) {
    match message_type {
        "agent_provisioned" => (
            "agent",
            "provisioned",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_plan" => (
            "agent",
            "plan",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_step" => (
            "agent",
            "step",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_result" => (
            "agent",
            "result",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_research_result" => (
            "agent",
            "research_result",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_approval_request" => (
            "agent",
            "approval_request",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_approval_granted" => (
            "agent",
            "approval_granted",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_approval_rejected" => (
            "agent",
            "approval_rejected",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_trigger_request" => (
            "agent",
            "trigger_request",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_trigger_dispatch" => (
            "agent",
            "trigger_dispatch",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_event_dispatch" => (
            "agent",
            "event_dispatch",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_wake_request" => (
            "agent",
            "wake_request",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_wake_result" => (
            "agent",
            "wake_result",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_conflict_detected" => (
            "agent",
            "conflict_detected",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_escalation" => (
            "agent",
            "escalation",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_triage" => (
            "agent",
            "triage",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_message" => (
            "agent",
            "message",
            serde_json::json!({"legacy_type": message_type}),
        ),
        _ => (message_type, "", Value::Null),
    }
}

pub(super) fn demo_thread_id(user_id: &str) -> String {
    deterministic_ulid(&format!("thread.demo.{}", user_id))
}

pub(super) fn email_localpart_slug(email: &str) -> String {
    email
        .split('@')
        .next()
        .unwrap_or("agent")
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

pub(super) fn session_user_response(user: &UserRecord) -> SessionUserResponse {
    SessionUserResponse {
        id: user.id.clone(),
        email: user.email.clone(),
        display_name: user.display_name.clone(),
        auth_provider: user.auth_provider.clone(),
    }
}

fn session_auth_response(session: AuthSessionRecord, user: &UserRecord, account_created: bool) -> AuthResponse { AuthResponse {
        token: Some(session.token),
        user: Some(session_user_response(user)),
        requires_2fa: false,
        verification_required: false, account_created,
        message: None,
        email: None,
    }
}

fn verification_required_response(email: &str, message: &str) -> AuthResponse { AuthResponse {
        token: None,
        user: None,
        requires_2fa: false,
        verification_required: true, account_created: true,
        message: Some(message.to_string()),
        email: Some(email.to_string()),
    }
}

pub(super) fn cors_layer() -> CorsLayer {
    let origins = allowed_cors_origins();
    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods(allowed_cors_methods())
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
        ])
        // The frontend sends `credentials: "include"` so the omnyid_session
        // cookie (see json_response_with_session_cookie) rides along on
        // cross-subdomain requests (workspace origin -> api.omnyid.com).
        // Without this, browsers block the response entirely with
        // "CORS Missing Allow Credentials" rather than a readable error —
        // allow_origin() above is already an explicit origin list (never a
        // wildcard), which is required for allow_credentials(true) to be valid.
        .allow_credentials(true)
}

pub(super) fn allowed_cors_methods() -> [Method; 5] {
    [
        Method::GET,
        Method::POST,
        Method::PUT,
        Method::DELETE,
        Method::OPTIONS,
    ]
}

pub(super) fn allowed_cors_origins() -> Vec<HeaderValue> {
    let configured = std::env::var("OMNYID_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| {
            let allow_localhost = std::env::var("OMNYID_ALLOW_LOCALHOST_ORIGINS")
                .map(|value| matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
                .unwrap_or(cfg!(debug_assertions));
            if allow_localhost {
                // localhost:4174 is the Vite dev server port (dev.ps1 $VITE_PORT)
                "https://omnyid.com,https://cloud.omnyid.com,http://localhost:3000,http://127.0.0.1:3000,http://localhost:4174,http://127.0.0.1:4174".to_string()
            } else {
                "https://omnyid.com,https://cloud.omnyid.com".to_string()
            }
        });

    configured
        .split(',')
        .filter_map(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                HeaderValue::from_str(trimmed).ok()
            }
        })
        .collect()
}

// ── Passkey registration ───────────────────────────────────────────────────────

/// POST /auth/passkey/register/begin
///
/// Returns a `RegistrationOptions` JSON challenge for the browser's
/// `navigator.credentials.create()` call.  The challenge is stored in the
/// user's session record (field `passkey_challenge`) for verification in /finish.
pub(super) async fn passkey_register_begin_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("passkey_register_begin", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(300),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let rp_id = passkey_rp_id_configured()?;
    let req = crate::webauthn::RegistrationRequest {
        user_id: user.id.clone(),
        display_name: user.email.clone(),
    };
    let (opts, challenge) = crate::webauthn::registration_options(&req, &rp_id, "Omnyid");
    // Store challenge on session for the /finish step
    state
        .db
        .store_passkey_challenge(&user.id, &challenge, "register")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let payload = serde_json::to_value(opts).map_err(internal_http_error)?;
    Ok(Json(payload))
}

/// POST /auth/passkey/register/finish
///
/// Verifies the browser's attestation response and stores the new credential.
pub(super) async fn passkey_register_finish_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(finish): Json<crate::webauthn::RegistrationFinish>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("passkey_register_finish", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(300),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let origin = passkey_origin_configured()?;

    let challenge = state
        .db
        .get_passkey_challenge(&user.id, "register")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(passkey_registration_failed_error)?;

    crate::webauthn::verify_registration_client_data(&finish.client_data_json, &challenge, &origin)
        .map_err(|_| passkey_registration_failed_error())?;

    // Extract the COSE public key from the attestation object's authData (GAP-004).
    let auth_data = crate::webauthn::extract_auth_data(&finish.attestation_object)
        .map_err(|_| passkey_registration_failed_error())?;
    let cose_key_cbor_b64 = crate::webauthn::extract_cose_key_from_auth_data(&auth_data)
        .map_err(|_| passkey_registration_failed_error())
        .and_then(|_key| {
            // Locate the COSE CBOR bytes within authData and store them base64url-encoded.
            let flags = auth_data.get(32).copied().unwrap_or(0);
            let at_flag = flags & 0x40 != 0;
            if !at_flag || auth_data.len() < 55 {
                return Err(passkey_registration_failed_error());
            }
            let cred_id_len = u16::from_be_bytes([auth_data[53], auth_data[54]]) as usize;
            let cose_start = 55 + cred_id_len;
            let cose_bytes = auth_data.get(cose_start..).unwrap_or(&[]);
            Ok(B64URL.encode(cose_bytes))
        })?;

    let cred = crate::webauthn::build_stored_credential(&finish, &cose_key_cbor_b64);
    state
        .db
        .store_passkey_credential(&cred)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    state
        .db
        .clear_passkey_challenge(&user.id, "register")
        .await
        .ok();

    Ok(Json(
        serde_json::json!({"registered": true, "credential_id": cred.credential_id}),
    ))
}

/// POST /auth/passkey/authenticate/begin
///
/// Returns authentication options for the browser's `navigator.credentials.get()`.
#[derive(serde::Deserialize)]
pub(super) struct PasskeyAuthBeginRequest {
    pub(super) user_id: String,
}

#[derive(serde::Deserialize)]
pub(super) struct PasskeyAuthBeginEmailRequest {
    pub(super) email: String,
}

#[derive(serde::Serialize)]
pub(super) struct PasskeyAuthBeginEmailResponse {
    pub(super) user_id: String,
    pub(super) options: crate::webauthn::AuthenticationOptions,
}

pub(super) async fn passkey_authenticate_begin_by_email_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<PasskeyAuthBeginEmailRequest>,
) -> Result<Json<PasskeyAuthBeginEmailResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("passkey_auth_begin_email", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(300),
        },
    )
    .await?;

    let email = normalize_passkey_begin_email(&body.email)
        .ok_or_else(passkey_authentication_failed_error)?;

    let user = state
        .db
        .find_user_by_email(&email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(passkey_authentication_failed_error)?;

    let rp_id = passkey_rp_id_configured()?;
    let (options, challenge) = passkey_authentication_begin_options(&rp_id);
    let challenge_kind = passkey_authenticate_challenge_kind(&headers);
    state
        .db
        .store_passkey_challenge(&user.id, &challenge, &challenge_kind)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(PasskeyAuthBeginEmailResponse {
        user_id: user.id,
        options,
    }))
}

pub(super) async fn passkey_authenticate_begin_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<PasskeyAuthBeginRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        passkey_public_rate_limit_key("passkey_auth_begin", &body.user_id, &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(300),
        },
    )
    .await?;
    let rp_id = passkey_rp_id_configured()?;
    let (opts, challenge) = passkey_authentication_begin_options(&rp_id);
    let challenge_kind = passkey_authenticate_challenge_kind(&headers);
    state
        .db
        .store_passkey_challenge(&body.user_id, &challenge, &challenge_kind)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let payload = serde_json::to_value(opts).map_err(internal_http_error)?;
    Ok(Json(payload))
}

/// POST /auth/passkey/authenticate/finish
///
/// Verifies the assertion and issues a new session token on success.
pub(super) async fn passkey_authenticate_finish_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(finish): Json<crate::webauthn::AuthenticationFinish>,
) -> Result<Response, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        passkey_public_rate_limit_key("passkey_auth_finish", &finish.user_id, &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(300),
        },
    )
    .await?;
    let origin = passkey_origin_configured()?;
    let rp_id = passkey_rp_id_configured()?;
    let challenge_kind = passkey_authenticate_challenge_kind(&headers);

    let challenge = state
        .db
        .get_passkey_challenge(&finish.user_id, &challenge_kind)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(passkey_authentication_failed_error)?;

    crate::webauthn::verify_authentication_client_data(
        &finish.client_data_json,
        &challenge,
        &origin,
    )
    .map_err(|_| passkey_authentication_failed_error())?;

    let sign_count =
        crate::webauthn::verify_authenticator_data(&finish.authenticator_data, &rp_id, true)
            .map_err(|_| passkey_authentication_failed_error())?;

    let cred = state
        .db
        .get_passkey_credential(&finish.credential_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(passkey_authentication_failed_error)?;

    // GAP-004: Verify the assertion signature before accepting authentication.
    crate::webauthn::verify_assertion_signature(
        &finish.authenticator_data,
        &finish.client_data_json,
        &finish.signature,
        &cred,
    )
    .map_err(|_| passkey_authentication_failed_error())?;

    crate::webauthn::verify_sign_count(cred.sign_count, sign_count)
        .map_err(|_| passkey_authentication_failed_error())?;

    state
        .db
        .update_passkey_sign_count(&finish.credential_id, sign_count)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    state
        .db
        .clear_passkey_challenge(&finish.user_id, &challenge_kind)
        .await
        .ok();

    let user = state
        .db
        .find_user_by_id(&cred.user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(passkey_authentication_failed_error)?;

    // Issue a session token for this device and preserve the shared auth response shape.
    let session_token = state
        .db
        .create_session_for_passkey(&cred.user_id, "passkey")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let session = AuthSessionRecord {
        token: session_token,
        user_id: user.id.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        expires_at: (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339(),
    };

    Ok(auth_response_with_session_cookie(session, &user, false))
}
