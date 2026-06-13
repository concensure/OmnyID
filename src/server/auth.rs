use std::sync::Arc;
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
    http::{HeaderMap, HeaderValue, Method, StatusCode},
};
use rand::Rng;
use serde_json::Value;
use sqlx::Row;
use tonic::Status;
use tower_http::cors::CorsLayer;
use ulid::Ulid;

use crate::{
    db::{AuthSessionRecord, Db, ManagedAgentRecord, UserRecord},
    message::AFPMessage,
};

use super::{AppState, RateLimitPolicy, internal_error, status_to_http, types::*};

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
    let display_name = request
        .display_name
        .unwrap_or_else(|| email.split('@').next().unwrap_or("Omnyid User").to_string())
        .trim()
        .to_string();

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
            issue_and_send_verification_email(&state, &existing_user).await?;
            return Ok(Json(verification_required_response(
                &existing_user.email,
                "Account created but not yet verified. We sent a fresh verification email.",
            )));
        }
        return Err((
            StatusCode::CONFLICT,
            "account already exists for that email".to_string(),
        ));
    }

    let password_hash =
        hash_password(&password).map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
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
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    issue_and_send_verification_email(&state, &user).await?;

    Ok(Json(verification_required_response(
        &user.email,
        "Check your email to verify your account before signing in.",
    )))
}

pub(super) async fn login_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
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
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "invalid email or password".to_string(),
            )
        })?;

    let password_hash = user.password_hash.clone().ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            "account requires Google sign-in".to_string(),
        )
    })?;
    if !verify_password(&password_hash, request.password.trim())
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?
    {
        return Err((
            StatusCode::UNAUTHORIZED,
            "invalid email or password".to_string(),
        ));
    }

    let email_verified = state
        .db
        .is_user_email_verified(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    if !email_verified {
        let _ = issue_and_send_verification_email(&state, &user).await;
        return Err((
            StatusCode::FORBIDDEN,
            "email address not verified; we sent a fresh verification link".to_string(),
        ));
    }

    let session = create_session_for_user(&state.db, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    Ok(Json(session_auth_response(session, &user)))
}

pub(super) async fn google_auth_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<GoogleAuthRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
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
        .map_err(|err| (StatusCode::UNAUTHORIZED, err))?;

    let user = if let Some(existing) = state
        .db
        .find_user_by_google_sub(&token_info.sub)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        existing
    } else if let Some(existing_email) = state
        .db
        .find_user_by_email(&token_info.email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        existing_email
    } else {
        let user = UserRecord {
            id: Ulid::new().to_string(),
            email: token_info.email.clone(),
            password_hash: None,
            auth_provider: "google".to_string(),
            google_sub: Some(token_info.sub.clone()),
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
            .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
        user
    };

    state
        .db
        .mark_email_verified(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let session = create_session_for_user(&state.db, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    Ok(Json(session_auth_response(session, &user)))
}

/// POST /auth/apple — Sign in with Apple.
/// The Apple identity token is a signed JWT; the iOS ASAuthorizationController
/// has already validated it against Apple's servers before the app sends it here.
/// The payload is decoded (not signature-verified) to extract the stable `sub` claim.
/// TODO: add RS256 JWKS verification against https://appleid.apple.com/auth/keys for
///       hardened multi-tenant production deployments.
#[derive(serde::Deserialize)]
pub(super) struct AppleAuthRequest {
    pub identity_token: String,
    /// Email from the Apple credential; only provided by Apple on first sign-in.
    /// The iOS client persists it in the Keychain and re-sends it on subsequent logins.
    #[serde(default)]
    pub email: String,
}

pub(super) async fn apple_auth_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<AppleAuthRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("apple_auth", &headers),
        RateLimitPolicy { max_requests: 12, window: Duration::from_secs(60) },
    )
    .await?;

    let apple_sub = apple_jwt_claim(&request.identity_token, "sub")
        .map_err(|e| (StatusCode::UNAUTHORIZED, e))?;

    let email = if !request.email.is_empty() {
        request.email.trim().to_lowercase()
    } else {
        apple_jwt_claim(&request.identity_token, "email")
            .map(|e| e.to_lowercase())
            .map_err(|_| (StatusCode::BAD_REQUEST,
                "email is required on first Apple Sign In; ensure your iOS client sends it".to_string()))?
    };

    let user = if let Some(existing) = state
        .db
        .find_user_by_email(&email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        existing
    } else {
        let display_name = email.split('@').next().unwrap_or("OmnyPulse User").to_string();
        let new_user = UserRecord {
            id: Ulid::new().to_string(),
            email: email.clone(),
            password_hash: None,
            auth_provider: "apple".to_string(),
            // Reuse google_sub column to store the stable Apple subject identifier.
            google_sub: Some(format!("apple:{apple_sub}")),
            display_name,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        state.db.create_user(&new_user).await.map_err(internal_error).map_err(status_to_http)?;
        ensure_user_agents_and_demo_seed(&state, &new_user)
            .await
            .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
        new_user
    };

    state.db.mark_email_verified(&user.id).await.map_err(internal_error).map_err(status_to_http)?;
    let session = create_session_for_user(&state.db, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    Ok(Json(session_auth_response(session, &user)))
}

/// Decode the payload segment of an Apple JWT and return the value of a named claim.
fn apple_jwt_claim(jwt: &str, claim: &str) -> Result<String, String> {
    let parts: Vec<&str> = jwt.splitn(3, '.').collect();
    if parts.len() < 2 {
        return Err("Malformed Apple identity token".to_string());
    }
    let payload_bytes = B64URL
        .decode(parts[1])
        .map_err(|_| "Could not base64-decode Apple JWT payload".to_string())?;
    let payload: Value = serde_json::from_slice(&payload_bytes)
        .map_err(|_| "Apple JWT payload is not valid JSON".to_string())?;
    payload
        .get(claim)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("Apple JWT missing '{claim}' claim"))
}

pub(super) async fn auth_session_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<SessionUserResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    Ok(Json(session_user_response(&user)))
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

    let current_ok = verify_password(password_hash, &request.current_password)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
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

    let new_hash = hash_password(&request.new_password)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

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
    issue_and_send_verification_email(&state, &user).await?;
    Ok(Json(
        serde_json::json!({ "ok": true, "message": "verification email sent" }),
    ))
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

    if record.used_at.is_some() {
        return Err((
            StatusCode::BAD_REQUEST,
            "verification token already used".to_string(),
        ));
    }
    if is_auth_token_expired(&record.expires_at) {
        return Err((
            StatusCode::BAD_REQUEST,
            "verification token has expired".to_string(),
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
        return Ok(Json(serde_json::json!({
            "ok": true,
            "message": "if that email is registered, a reset link has been sent"
        })));
    };

    if user.auth_provider != "password" {
        // OAuth accounts cannot reset a password — tell them to sign in with their provider.
        return Ok(Json(serde_json::json!({
            "ok": true,
            "message": "if that email is registered, a reset link has been sent"
        })));
    }

    issue_and_send_password_reset_email(&state, &user).await?;
    Ok(Json(serde_json::json!({
        "ok": true,
        "message": "if that email is registered, a reset link has been sent"
    })))
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

    if record.used_at.is_some() {
        return Err((
            StatusCode::BAD_REQUEST,
            "reset token already used".to_string(),
        ));
    }
    if is_auth_token_expired(&record.expires_at) {
        return Err((
            StatusCode::BAD_REQUEST,
            "reset token has expired — request a new one".to_string(),
        ));
    }

    let new_hash = hash_password(&request.new_password)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
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
    chrono::DateTime::parse_from_rfc3339(expires_at)
        .map(|dt| dt < chrono::Utc::now())
        .unwrap_or(true)
}

fn generate_secure_token() -> String {
    let raw: [u8; 32] = rand::rng().random();
    hex::encode(raw)
}

async fn issue_and_send_verification_email(
    state: &super::AppState,
    user: &crate::db::UserRecord,
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

    let base_url =
        std::env::var("OMNYID_BASE_URL").unwrap_or_else(|_| "https://omnyid.com".to_string());
    let verify_url = format!("{base_url}/verify-email?token={raw_token}");

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
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to send verification email: {err}"),
        )
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

    let base_url =
        std::env::var("OMNYID_BASE_URL").unwrap_or_else(|_| "https://omnyid.com".to_string());
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
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to send password reset email: {err}"),
        )
    })
}

// ── Auth helpers & rate limiting ──────────────────────────────────────────────

pub(super) async fn authenticated_user(
    db: &Db,
    headers: &HeaderMap,
) -> Result<UserRecord, (StatusCode, String)> {
    let token = bearer_token_from_headers(headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
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
        SELECT id, email, password_hash, auth_provider, google_sub, display_name, created_at::text as created_at
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

    let row = row_opt.ok_or_else(|| (StatusCode::UNAUTHORIZED, "user for session not found".to_string()))?;

    // Required columns use `?` so a NULL or type-mismatch surfaces as a 500 rather than
    // silently producing an empty string that passes downstream authorization checks.
    let col_err = |col: &'static str| move |_: sqlx::Error| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("db column decode failed: {col}"))
    };
    let user = UserRecord {
        id:            row.try_get("id").map_err(col_err("id"))?,
        email:         row.try_get("email").map_err(col_err("email"))?,
        password_hash: row.try_get("password_hash").unwrap_or(None),
        auth_provider: row.try_get("auth_provider").map_err(col_err("auth_provider"))?,
        google_sub:    row.try_get("google_sub").unwrap_or(None),
        display_name:  row.try_get("display_name").map_err(col_err("display_name"))?,
        created_at:    row.try_get("created_at").map_err(col_err("created_at"))?,
    };

    Ok(user)
}

pub(super) async fn optional_authenticated_user(
    db: &Db,
    headers: &HeaderMap,
) -> Result<Option<UserRecord>, (StatusCode, String)> {
    if bearer_token_from_headers(headers).is_none() {
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
    Ok(merge_thread_messages(private_messages, public_messages))
}

pub(super) async fn store_private_app_message(
    db: &Db,
    metrics: &Arc<crate::metrics::Metrics>,
    relay_tx: &tokio::sync::broadcast::Sender<String>,
    owner_user_id: &str,
    message: AFPMessage,
) -> Result<(), Status> {
    let proto = super::app_to_proto(message);
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

    Ok(())
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
    let identity = bearer_token_from_headers(headers)
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

async fn create_session_for_user(db: &Db, user: &UserRecord) -> Result<AuthSessionRecord, String> {
    db.ensure_user_private_schema(&user.id)
        .await
        .map_err(|err| err.to_string())?;
    let session = AuthSessionRecord {
        token: random_token(),
        user_id: user.id.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        expires_at: (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339(),
    };
    db.create_session(&session)
        .await
        .map_err(|err| err.to_string())?;
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
        .map_err(|err| err.to_string())
}

fn verify_password(password_hash: &str, password: &str) -> Result<bool, String> {
    let parsed_hash = PasswordHash::new(password_hash).map_err(|err| err.to_string())?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

async fn verify_google_id_token(id_token: &str) -> Result<GoogleTokenInfoResponse, String> {
    let client_id = std::env::var("OMNYID_GOOGLE_CLIENT_ID").unwrap_or_else(|_| {
        "975613409177-nv214f97lors4g5j2dcvuftv5pf9c88p.apps.googleusercontent.com".to_string()
    });
    let response = reqwest::Client::new()
        .get("https://oauth2.googleapis.com/tokeninfo")
        .query(&[("id_token", id_token)])
        .send()
        .await
        .map_err(|err| format!("Google token verification failed: {err}"))?;
    if !response.status().is_success() {
        return Err("Google sign-in was rejected".to_string());
    }
    let token_info = response
        .json::<GoogleTokenInfoResponse>()
        .await
        .map_err(|err| format!("Google token payload was invalid: {err}"))?;
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

#[cfg(test)]
mod tests {
    use super::{allowed_cors_origins, validate_google_token_info};
    use crate::server::types::GoogleTokenInfoResponse;

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
    fn google_token_validation_rejects_untrusted_issuer() {
        let mut token_info = sample_google_token_info();
        token_info.iss = Some("https://evil.example".to_string());
        let result = validate_google_token_info(&token_info, "client-id", 1_800_000_000);
        assert!(matches!(result, Err(message) if message.contains("issuer")));
    }

    #[test]
    fn allowed_cors_origins_excludes_localhost_when_not_explicitly_allowed() {
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
}

pub(super) async fn ensure_user_agents_and_demo_seed(
    state: &Arc<AppState>,
    user: &UserRecord,
) -> Result<(), String> {
    let existing_agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(|err| err.to_string())?;
    if !existing_agents.is_empty() {
        return Ok(());
    }

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

    for agent in [&primary_agent, &alpha_agent, &beta_agent] {
        state
            .db
            .upsert_managed_agent(agent)
            .await
            .map_err(|err| err.to_string())?;
    }

    let thread_id = demo_thread_id(&user.id);
    let intro_messages = vec![
        new_server_message(
            alpha_agent.agent_id.clone(),
            vec![beta_agent.agent_id.clone()],
            thread_id.clone(),
            "agent_message",
            serde_json::json!({
                "body": format!("Hello {}, alpha is online and ready to relay through Omnyid.", user.display_name),
                "kind": "demo_seed"
            }),
            vec![serde_json::json!({
                "format": "email",
                "content": {
                    "subject": "Alpha boot sequence",
                    "body": format!("Hello {}, alpha is online and ready to relay through Omnyid.", user.display_name)
                }
            })],
            vec![],
            vec![],
            true,
        )?,
        new_server_message(
            beta_agent.agent_id.clone(),
            vec![alpha_agent.agent_id.clone()],
            thread_id.clone(),
            "agent_message",
            serde_json::json!({
                "body": "Beta acknowledged. You can now send secure test messages between your demo agents.",
                "kind": "demo_seed"
            }),
            vec![serde_json::json!({
                "format": "email",
                "content": {
                    "subject": "Beta acknowledged",
                    "body": "Beta acknowledged. You can now send secure test messages between your demo agents."
                }
            })],
            vec![],
            vec![],
            true,
        )?,
    ];

    for message in intro_messages {
        store_private_app_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            &user.id,
            message,
        )
        .await
        .map_err(|err| err.message().to_string())?;
    }

    // Provision master AgentInstance with soul.md
    let master_instance =
        crate::agent_template::AgentInstance::provision(&user.id, &user.display_name, "omnyid.com");
    state
        .db
        .save_master_agent_instance(&master_instance)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

pub(super) fn new_server_message(
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
    format!("thread.demo.{}", user_id)
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

fn session_auth_response(session: AuthSessionRecord, user: &UserRecord) -> AuthResponse {
    AuthResponse {
        token: Some(session.token),
        user: Some(session_user_response(user)),
        requires_2fa: false,
        verification_required: false,
        message: None,
        email: None,
    }
}

fn verification_required_response(email: &str, message: &str) -> AuthResponse {
    AuthResponse {
        token: None,
        user: None,
        requires_2fa: false,
        verification_required: true,
        message: Some(message.to_string()),
        email: Some(email.to_string()),
    }
}

pub(super) fn cors_layer() -> CorsLayer {
    let origins = allowed_cors_origins();
    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
        ])
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
    let user = authenticated_user(&state.db, &headers).await?;
    let rp_id = std::env::var("OMNYID_RP_ID").unwrap_or_else(|_| "omnyid.com".to_string());
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
    Ok(Json(serde_json::to_value(opts).unwrap_or_default()))
}

/// POST /auth/passkey/register/finish
///
/// Verifies the browser's attestation response and stores the new credential.
pub(super) async fn passkey_register_finish_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(finish): Json<crate::webauthn::RegistrationFinish>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let origin =
        std::env::var("OMNYID_ORIGIN").unwrap_or_else(|_| "https://omnyid.com".to_string());

    let challenge = state
        .db
        .get_passkey_challenge(&user.id, "register")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((
            StatusCode::BAD_REQUEST,
            "no pending challenge — call /begin first".to_string(),
        ))?;

    crate::webauthn::verify_registration_client_data(&finish.client_data_json, &challenge, &origin)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Extract the COSE public key from the attestation object's authData (GAP-004).
    let auth_data = crate::webauthn::extract_auth_data(&finish.attestation_object)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let cose_key_cbor_b64 = crate::webauthn::extract_cose_key_from_auth_data(&auth_data)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))
        .and_then(|_key| {
            // Locate the COSE CBOR bytes within authData and store them base64url-encoded.
            let flags = auth_data.get(32).copied().unwrap_or(0);
            let at_flag = flags & 0x40 != 0;
            if !at_flag || auth_data.len() < 55 {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "authData missing credential data".into(),
                ));
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

pub(super) async fn passkey_authenticate_begin_http(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PasskeyAuthBeginRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let rp_id = std::env::var("OMNYID_RP_ID").unwrap_or_else(|_| "omnyid.com".to_string());
    let creds = state
        .db
        .list_passkey_credentials(&body.user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let (opts, challenge) = crate::webauthn::authentication_options(&creds, &rp_id);
    state
        .db
        .store_passkey_challenge(&body.user_id, &challenge, "authenticate")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::to_value(opts).unwrap_or_default()))
}

/// POST /auth/passkey/authenticate/finish
///
/// Verifies the assertion and issues a new session token on success.
pub(super) async fn passkey_authenticate_finish_http(
    State(state): State<Arc<AppState>>,
    Json(finish): Json<crate::webauthn::AuthenticationFinish>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let origin =
        std::env::var("OMNYID_ORIGIN").unwrap_or_else(|_| "https://omnyid.com".to_string());
    let rp_id = std::env::var("OMNYID_RP_ID").unwrap_or_else(|_| "omnyid.com".to_string());

    let challenge = state
        .db
        .get_passkey_challenge(&finish.user_id, "authenticate")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((StatusCode::BAD_REQUEST, "no pending challenge".to_string()))?;

    crate::webauthn::verify_authentication_client_data(
        &finish.client_data_json,
        &challenge,
        &origin,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let sign_count =
        crate::webauthn::verify_authenticator_data(&finish.authenticator_data, &rp_id, true)
            .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let cred = state
        .db
        .get_passkey_credential(&finish.credential_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((StatusCode::UNAUTHORIZED, "credential not found".to_string()))?;

    // GAP-004: Verify the assertion signature before accepting authentication.
    crate::webauthn::verify_assertion_signature(
        &finish.authenticator_data,
        &finish.client_data_json,
        &finish.signature,
        &cred,
    )
    .map_err(|e| (StatusCode::UNAUTHORIZED, e.to_string()))?;

    crate::webauthn::verify_sign_count(cred.sign_count, sign_count)
        .map_err(|e| (StatusCode::UNAUTHORIZED, e.to_string()))?;

    state
        .db
        .update_passkey_sign_count(&finish.credential_id, sign_count)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    state
        .db
        .clear_passkey_challenge(&finish.user_id, "authenticate")
        .await
        .ok();

    // Issue a short-lived session token for this device
    let session = state
        .db
        .create_session_for_passkey(&cred.user_id, "passkey")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "authenticated": true,
        "session_token": session,
        "user_id": cred.user_id,
    })))
}
