// @locs-version: 1.0
// @module-id: server.user-integrations
// @primary-capability: user-integration-http-routes
// @stability: beta

use super::*;
use crate::secret_manager::read_process_secret_trimmed;

mod calendar;
#[cfg(test)]
mod tests;

use calendar::{
    calendar_create_http, calendar_delete_http, calendar_google_callback_http,
    calendar_google_connect_url_http, calendar_google_disconnect_http, calendar_google_status_http,
    calendar_google_sync_http, calendar_list_http,
};

const GMAIL_OAUTH_STATE_TTL_SECS: i64 = 600;
const GMAIL_TOKEN_EXPIRY_WARNING_WINDOW_HOURS: i64 = 24;
const LOCAL_CACHE_KEY_CONNECTED_APPS: &str = "connected_apps_storage";

fn integration_user_facing_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

// ── OAuth CSRF helpers ────────────────────────────────────────────────────────

/// Returns `"{user_id}:{hmac_hex}"` — a tamper-proof state token for OAuth flows.
///
/// The HMAC is computed over `user_id` using the server secret so that an
/// attacker who knows another user's id cannot craft a valid callback URL that
/// links their OAuth grant to the victim's account.
fn oauth_csrf_secret() -> Result<String, (StatusCode, String)> {
    if let Some(s) = read_process_secret_trimmed("OMNYID_SESSION_SECRET") {
        return Ok(s);
    }
    Err((
        StatusCode::SERVICE_UNAVAILABLE,
        "Gmail OAuth is not configured on this homeserver. Set OMNYID_SESSION_SECRET.".to_string(),
    ))
}

fn gmail_oauth_state_sign(user_id: &str) -> Result<String, (StatusCode, String)> {
    gmail_oauth_state_sign_at(user_id, chrono::Utc::now().timestamp())
}

fn gmail_oauth_state_sign_at(
    user_id: &str,
    issued_at: i64,
) -> Result<String, (StatusCode, String)> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    let payload = format!("{issued_at}:{user_id}");
    let secret = oauth_csrf_secret()?;
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(payload.as_bytes());
    let tag: String = mac
        .finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    Ok(format!("{payload}:{tag}"))
}

/// Verifies a state token produced by `gmail_oauth_state_sign`.
/// Returns `Some(user_id)` on success, `None` if the signature is invalid.
fn gmail_oauth_state_verify(state: &str) -> Option<String> {
    gmail_oauth_state_verify_at(state, chrono::Utc::now().timestamp())
        .ok()
        .flatten()
}

fn gmail_oauth_state_verify_at(
    state: &str,
    now_secs: i64,
) -> Result<Option<String>, (StatusCode, String)> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    let Some((payload, provided_hex)) = state.rsplit_once(':') else {
        return Ok(None);
    };
    let Some((issued_at_raw, user_id)) = payload.split_once(':') else {
        return Ok(None);
    };
    let Ok(issued_at) = issued_at_raw.parse::<i64>() else {
        return Ok(None);
    };
    if issued_at > now_secs + 60 {
        return Ok(None);
    }
    if now_secs - issued_at > GMAIL_OAUTH_STATE_TTL_SECS {
        return Ok(None);
    }
    let provided_bytes: Option<Vec<u8>> = provided_hex
        .as_bytes()
        .chunks(2)
        .map(|chunk| {
            let hi = (chunk[0] as char).to_digit(16)?;
            let lo = chunk.get(1).and_then(|b| (*b as char).to_digit(16))?;
            Some((hi as u8) << 4 | lo as u8)
        })
        .collect();
    let Some(provided_bytes) = provided_bytes else {
        return Ok(None);
    };

    let secret = oauth_csrf_secret()?;
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(payload.as_bytes());
    // verify_slice uses constant-time comparison
    if mac.verify_slice(&provided_bytes).is_err() {
        return Ok(None);
    }
    Ok(Some(user_id.to_string()))
}

fn gmail_oauth_redirect_target(status: &str) -> String {
    let suffix = format!("/workspace/?gmail={status}");
    std::env::var("OMNYID_WORKSPACE_BASE_URL")
        .ok()
        .or_else(|| std::env::var("OMNYID_UI_BASE_URL").ok())
        .or_else(derive_workspace_base_url_from_homeserver)
        .map(|base| format!("{}{}", base.trim_end_matches('/'), suffix))
        .unwrap_or(suffix)
}

fn gmail_connection_change_requires_recent_session() -> bool {
    true
}

fn derive_workspace_base_url_from_homeserver() -> Option<String> {
    let base_url = std::env::var("OMNYID_HOMESERVER_URL").ok()?;
    let parsed = reqwest::Url::parse(base_url.trim()).ok()?;
    let host = parsed.host_str()?;
    let derived_host = match host.strip_prefix("api.") {
        Some(value) => value.to_string(),
        None => host.to_string(),
    };
    let mut derived = parsed;
    derived.set_host(Some(&derived_host)).ok()?;
    derived.set_path("");
    derived.set_query(None);
    derived.set_fragment(None);
    Some(derived.to_string().trim_end_matches('/').to_string())
}

fn gmail_oauth_redirect_uri() -> Result<String, (StatusCode, String)> {
    let base_url = std::env::var("OMNYID_HOMESERVER_URL").map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Gmail OAuth not configured on this server. Set OMNYID_HOMESERVER_URL.".to_string(),
        )
    })?;
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Gmail OAuth not configured on this server. Set OMNYID_HOMESERVER_URL.".to_string(),
        ));
    }
    Ok(format!("{trimmed}/gmail/callback"))
}

fn gmail_oauth_client_id_configured() -> Result<String, (StatusCode, String)> {
    let client_id = std::env::var("OMNYID_GMAIL_CLIENT_ID").map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Gmail OAuth not configured on this server. Set OMNYID_GMAIL_CLIENT_ID.".to_string(),
        )
    })?;
    let trimmed = client_id.trim();
    if trimmed.is_empty() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Gmail OAuth not configured on this server. Set OMNYID_GMAIL_CLIENT_ID.".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

fn gmail_oauth_client_secret_configured() -> Result<String, (StatusCode, String)> {
    read_process_secret_trimmed("OMNYID_GMAIL_CLIENT_SECRET").ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Gmail OAuth not configured on this server. Set OMNYID_GMAIL_CLIENT_SECRET."
                .to_string(),
        )
    })
}

fn gmail_oauth_is_fully_configured() -> bool {
    gmail_oauth_client_id_configured().is_ok()
        && gmail_oauth_client_secret_configured().is_ok()
        && gmail_oauth_redirect_uri().is_ok()
        && oauth_csrf_secret().is_ok()
}

fn gmail_access_token_from_token_response(token_data: &Value) -> Option<String> {
    let access_token = token_data["access_token"].as_str()?.trim();
    if access_token.is_empty() {
        return None;
    }
    Some(access_token.to_string())
}

async fn alias_agent_id_for_user(
    state: &Arc<AppState>,
    user_id: &str,
    explicit_agent_id: Option<&str>,
) -> Result<String, (StatusCode, String)> {
    if let Some(agent_id) = explicit_agent_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let agent_id = validate_alias_agent_id(agent_id)?;
        let owned = state
            .db
            .user_owns_agent_id(user_id, &agent_id)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        if !owned {
            return Err((
                StatusCode::FORBIDDEN,
                "Alias claiming requires an agent_id owned by the authenticated user.".to_string(),
            ));
        }
        return Ok(agent_id);
    }

    let Some(master_agent) = state
        .db
        .get_master_agent_instance(user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Alias claiming is not configured for this account because no master agent instance is available."
                .to_string(),
        ));
    };

    let agent_id = master_agent
        .get("agent_id")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "Alias claiming is not configured for this account because the master agent is missing its agent_id."
                    .to_string(),
            )
        })?;

    validate_alias_agent_id(agent_id)
}

fn validate_alias_agent_id(agent_id: &str) -> Result<String, (StatusCode, String)> {
    if crate::federation::parse_agent_id(agent_id).is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Alias claiming requires a valid agent_id like agent:name@example.com.".to_string(),
        ));
    }
    Ok(agent_id.to_string())
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/calendar/events",
            get(calendar_list_http).post(calendar_create_http),
        )
        .route(
            "/calendar/events/{id}",
            axum::routing::delete(calendar_delete_http),
        )
        .route("/gmail/connect-url", get(gmail_connect_url_http))
        .route("/gmail/callback", get(gmail_callback_http))
        .route("/gmail/status", get(gmail_status_http))
        .route("/gmail/disconnect", post(gmail_disconnect_http))
        .route(
            "/calendar/google/connect-url",
            get(calendar_google_connect_url_http),
        )
        .route(
            "/calendar/google/callback",
            get(calendar_google_callback_http),
        )
        .route("/calendar/google/status", get(calendar_google_status_http))
        .route(
            "/calendar/google/disconnect",
            post(calendar_google_disconnect_http),
        )
        .route("/calendar/google/sync", post(calendar_google_sync_http))
        .route("/api/alias/check", get(alias_check_http))
        .route("/api/alias/mine", get(alias_mine_http))
        .route("/api/alias/claim", post(alias_claim_http))
        .route("/api/alias/change", post(alias_change_http))
}

// ── Gmail OAuth routes ────────────────────────────────────────────────────────

/// GET /gmail/status — returns whether a Gmail token is stored for the user
async fn gmail_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let token = state
        .db
        .get_gmail_token(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let token_expiry = token
        .as_ref()
        .and_then(|value| value.get("token_expiry"))
        .and_then(Value::as_str);
    let (token_expired, expires_within_24h) =
        gmail_token_expiry_warning_state(token_expiry, chrono::Utc::now());
    if let Some(gmail_email) = token
        .as_ref()
        .and_then(|value| value.get("gmail_email"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        state
            .db
            .refresh_gmail_connected_capabilities(&user.id, gmail_email)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
    }
    Ok(Json(serde_json::json!({
        "connected": token.is_some(),
        "gmail_email": token.as_ref().and_then(|t| t["gmail_email"].as_str()).unwrap_or(""),
        "configured": gmail_oauth_is_fully_configured(),
        "token_expiry": token_expiry,
        "connected_at": token
            .as_ref()
            .and_then(|value| value.get("connected_at"))
            .and_then(Value::as_str),
        "token_expired": token_expired,
        "expires_within_24h": expires_within_24h,
        "message": integration_user_facing_text(
            if token.is_some() {
                if token_expired {
                    "Gmail is connected, but the token has expired and needs to be refreshed."
                } else if expires_within_24h {
                    "Gmail is connected. The token will expire within 24 hours."
                } else {
                    "Gmail is connected and ready."
                }
            } else if gmail_oauth_is_fully_configured() {
                "Gmail is available to connect."
            } else {
                "Gmail OAuth is not fully configured on this homeserver."
            },
            active_persona.as_ref(),
        ),
    })))
}

fn gmail_token_expiry_warning_state(
    token_expiry: Option<&str>,
    now: chrono::DateTime<chrono::Utc>,
) -> (bool, bool) {
    let Some(token_expiry) = token_expiry else {
        return (false, false);
    };
    let Some(expires_at) = parse_datetime_to_utc(token_expiry) else {
        return (false, false);
    };
    if expires_at <= now {
        return (true, false);
    }
    let warning_window = chrono::Duration::hours(GMAIL_TOKEN_EXPIRY_WARNING_WINDOW_HOURS);
    (
        false,
        expires_at.signed_duration_since(now) <= warning_window,
    )
}

async fn gmail_disconnect_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    if gmail_connection_change_requires_recent_session() {
        require_recent_high_risk_session(&session)?;
    }
    let existing = state
        .db
        .get_gmail_token(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let revoke_attempted = if let Some(token) = existing.as_ref() {
        let refresh_token = token
            .get("refresh_token")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let access_token = token
            .get("access_token")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if let Some(token_value) = refresh_token.or(access_token) {
            let _ = reqwest::Client::new()
                .post("https://oauth2.googleapis.com/revoke")
                .form(&[("token", token_value)])
                .send()
                .await;
            true
        } else {
            false
        }
    } else {
        false
    };

    let disconnected = sqlx::query("DELETE FROM user_gmail_tokens WHERE user_id = $1")
        .bind(&user.id)
        .execute(&state.db.pool)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .rows_affected()
        > 0;

    let cleared_capability_count = state
        .db
        .delete_user_connected_capabilities_for_provider(&user.id, "gmail")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "ok": true,
        "disconnected": disconnected,
        "revoke_attempted": revoke_attempted,
        "upstream_revocation_supported": true,
        "capability_registry_refreshed": true,
        "cleared_capability_count": cleared_capability_count,
        "invalidate_local_cache_keys": [LOCAL_CACHE_KEY_CONNECTED_APPS],
        "connection_provider": "gmail",
        "session_cleanup_recommended": false,
        "message": integration_user_facing_text(
            if disconnected {
                "Gmail has been disconnected."
            } else {
                "No Gmail connection was active."
            },
            active_persona.as_ref(),
        ),
    })))
}

/// GET /gmail/connect-url — returns the Google OAuth authorization URL for Gmail scopes
async fn gmail_connect_url_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    if gmail_connection_change_requires_recent_session() {
        require_recent_high_risk_session(&session)?;
    }
    let _ = user.id; // ensure user is authenticated
    let client_id = gmail_oauth_client_id_configured()?;
    let redirect_uri = gmail_oauth_redirect_uri()?;
    let scopes = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email";
    // Percent-encode manually for the URL query string
    let redirect_enc: String = redirect_uri
        .chars()
        .map(|c| match c {
            ':' => "%3A".to_string(),
            '/' => "%2F".to_string(),
            _ => c.to_string(),
        })
        .collect();
    let scope_enc: String = scopes
        .chars()
        .map(|c| match c {
            ' ' => "%20".to_string(),
            ':' => "%3A".to_string(),
            '/' => "%2F".to_string(),
            _ => c.to_string(),
        })
        .collect();
    // Sign the state so the callback can verify it wasn't forged.
    let signed_state = gmail_oauth_state_sign(&user.id)?;
    let state_enc: String = signed_state
        .chars()
        .map(|c| match c {
            ':' => "%3A".to_string(),
            _ => c.to_string(),
        })
        .collect();
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={client_id}&redirect_uri={redirect_enc}&response_type=code&scope={scope_enc}&access_type=offline&prompt=consent&state={state_enc}"
    );
    Ok(Json(serde_json::json!({"url": url})))
}

/// GET /gmail/callback?code=...  — exchanges the OAuth code and stores the token
async fn gmail_callback_http(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let Some(code) = params.get("code").cloned() else {
        return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("error"))
            .into_response();
    };
    // Verify the signed OAuth state before trusting the user_id it carries.
    // Without this check an attacker could forge a callback URL with an arbitrary
    // user_id and link their OAuth grant to a victim's account (CSRF).
    let Some(raw_state) = params.get("state").cloned() else {
        return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("error"))
            .into_response();
    };
    let user_id = match gmail_oauth_state_verify_at(&raw_state, chrono::Utc::now().timestamp()) {
        Ok(Some(user_id)) => user_id,
        Ok(None) => {
            return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("error"))
                .into_response();
        }
        Err(_) => {
            return axum::response::Redirect::temporary(&gmail_oauth_redirect_target(
                "not_configured",
            ))
            .into_response();
        }
    };

    let Ok(client_id) = gmail_oauth_client_id_configured() else {
        return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("not_configured"))
            .into_response();
    };
    let Ok(client_secret) = gmail_oauth_client_secret_configured() else {
        return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("not_configured"))
            .into_response();
    };
    let Ok(redirect_uri) = gmail_oauth_redirect_uri() else {
        return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("not_configured"))
            .into_response();
    };

    let http = reqwest::Client::new();
    let token_resp = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await;

    let token_data: Value = match token_resp {
        Ok(r) if r.status().is_success() => match r.json().await {
            Ok(v) => v,
            Err(_) => {
                return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("error"))
                    .into_response();
            }
        },
        Err(_) => {
            return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("error"))
                .into_response();
        }
        Ok(_) => {
            return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("error"))
                .into_response();
        }
    };

    let Some(access_token) = gmail_access_token_from_token_response(&token_data) else {
        return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("error"))
            .into_response();
    };
    let refresh_token = token_data["refresh_token"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Fetch Gmail email address
    let gmail_email = if !access_token.is_empty() {
        let ui_resp = http
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(&access_token)
            .send()
            .await;
        match ui_resp {
            Ok(r) => r
                .json::<Value>()
                .await
                .ok()
                .and_then(|v| v["email"].as_str().map(str::to_string))
                .unwrap_or_default(),
            Err(_) => String::new(),
        }
    } else {
        String::new()
    };

    let expiry_iso = token_data["expires_in"]
        .as_i64()
        .map(|secs| (chrono::Utc::now() + chrono::Duration::seconds(secs)).to_rfc3339());

    if state
        .db
        .store_gmail_token(
            &user_id,
            &access_token,
            &refresh_token,
            &gmail_email,
            expiry_iso,
        )
        .await
        .is_err()
    {
        return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("error"))
            .into_response();
    }

    if state
        .db
        .refresh_gmail_connected_capabilities(&user_id, &gmail_email)
        .await
        .is_err()
    {
        return axum::response::Redirect::temporary(&gmail_oauth_redirect_target("error"))
            .into_response();
    }

    axum::response::Redirect::temporary(&gmail_oauth_redirect_target("connected")).into_response()
}

// ── Google Calendar OAuth routes ────────────────────────────────────────────────
//
// Native OAuth connection for Google Calendar, mirroring the Gmail flow above.
// Reuses the same OAuth client (OMNYID_GMAIL_CLIENT_ID/SECRET) since Google
// treats scopes independently per authorization — this just needs its own
// authorized redirect URI (.../calendar/google/callback) registered on that
// client in Google Cloud Console.

const ALIAS_RESERVED: &[&str] = &[
    "admin",
    "administrator",
    "support",
    "system",
    "root",
    "api",
    "www",
    "mail",
    "smtp",
    "imap",
    "pop3",
    "ftp",
    "ssh",
    "host",
    "server",
    "help",
    "info",
    "contact",
    "security",
    "abuse",
    "noreply",
    "no-reply",
    "postmaster",
    "webmaster",
    "hostmaster",
    "daemon",
    "mailer",
    "omnyid",
    "agenton",
    "aetherix",
    "omny-id",
    "agent-on",
    "billing",
    "payments",
    "invoice",
    "account",
    "accounts",
    "signup",
    "signin",
    "login",
    "logout",
    "register",
];

fn validate_alias(alias: &str) -> Result<(), String> {
    let alias = alias.trim();
    if alias.len() < 7 {
        return Err("Alias must be at least 7 characters.".into());
    }
    if alias.len() > 48 {
        return Err("Alias must be 48 characters or fewer.".into());
    }
    if !alias
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("Only lowercase letters (a–z), digits, and hyphens are allowed.".into());
    }
    if alias.starts_with('-') || alias.ends_with('-') {
        return Err("Alias cannot start or end with a hyphen.".into());
    }
    if alias.contains("--") {
        return Err("Alias cannot contain consecutive hyphens.".into());
    }
    if ALIAS_RESERVED.contains(&alias) {
        return Err("This alias is reserved and cannot be claimed.".into());
    }
    Ok(())
}

#[derive(serde::Deserialize)]
struct AliasCheckQuery {
    alias: String,
}

/// GET /api/alias/check?alias=xxx
/// Returns availability and validation status — does not require authentication.
async fn alias_check_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<AliasCheckQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("alias_check", &headers),
        RateLimitPolicy {
            max_requests: 60,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let alias = q.alias.trim().to_lowercase();
    if let Err(msg) = validate_alias(&alias) {
        return Ok(Json(serde_json::json!({
            "available": false,
            "valid": false,
            "reason": msg
        })));
    }
    let available = state
        .db
        .is_alias_available(&alias)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "available": available,
        "valid": true,
        "reason": if available { "" } else { "This alias is already taken." }
    })))
}

/// GET /api/alias/mine — returns the authenticated user's current alias (or null).
async fn alias_mine_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let record = state
        .db
        .get_alias_for_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let domain = std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "omnyid.com".to_string());
    Ok(Json(match record {
        None => serde_json::json!({ "alias": null }),
        Some(r) => {
            // Calculate when next change is allowed
            let next_change = chrono::DateTime::parse_from_rfc3339(&r.last_changed_at)
                .ok()
                .map(|dt| (dt + chrono::Duration::days(30)).to_rfc3339())
                .unwrap_or_default();
            serde_json::json!({
                "alias": r.alias,
                "agent_id": r.agent_id,
                "display_address": format!("{}@{}", r.alias, domain),
                "created_at": r.created_at,
                "last_changed_at": r.last_changed_at,
                "next_change_at": next_change,
            })
        }
    }))
}

#[derive(serde::Deserialize)]
struct AliasClaimBody {
    alias: String,
    agent_id: Option<String>,
}

/// POST /api/alias/claim — claim a first-time alias.
async fn alias_claim_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AliasClaimBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let alias = body.alias.trim().to_lowercase();

    // Reject if user already has an alias
    if let Some(existing) = state
        .db
        .get_alias_for_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        return Err((
            StatusCode::CONFLICT,
            format!(
                "You already have the alias \"{}\". Use /api/alias/change to update it.",
                existing.alias
            ),
        ));
    }

    validate_alias(&alias).map_err(|msg| (StatusCode::BAD_REQUEST, msg))?;

    // Resolve agent_id: use provided value or fall back to server default
    let agent_id = alias_agent_id_for_user(&state, &user.id, body.agent_id.as_deref()).await?;

    let record = state
        .db
        .claim_alias(&user.id, &agent_id, &alias)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("unique") || msg.contains("duplicate") || msg.contains("aliases_pkey") {
                (
                    StatusCode::CONFLICT,
                    "This alias is already taken.".to_string(),
                )
            } else if msg.contains("aliases_alias") {
                (
                    StatusCode::BAD_REQUEST,
                    "Alias format is invalid.".to_string(),
                )
            } else {
                internal_http_error(e)
            }
        })?;

    let domain = std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "omnyid.com".to_string());
    Ok(Json(serde_json::json!({
        "alias": record.alias,
        "display_address": format!("{}@{}", record.alias, domain),
        "created_at": record.created_at,
        "message": integration_user_facing_text(
            "Alias claimed.",
            active_persona.as_ref(),
        ),
    })))
}

#[derive(serde::Deserialize)]
struct AliasChangeBody {
    alias: String,
}

/// POST /api/alias/change — change an existing alias (30-day cooldown enforced).
async fn alias_change_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AliasChangeBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let alias = body.alias.trim().to_lowercase();

    validate_alias(&alias).map_err(|msg| (StatusCode::BAD_REQUEST, msg))?;

    // Must have an existing alias to change
    let existing = state
        .db
        .get_alias_for_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((
            StatusCode::NOT_FOUND,
            "You have not claimed an alias yet. Use /api/alias/claim.".into(),
        ))?;

    // Pre-flight cooldown check so we can return a helpful next_change_at date
    let last_changed =
        chrono::DateTime::parse_from_rfc3339(&existing.last_changed_at).map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Invalid timestamp in alias record.".into(),
            )
        })?;
    let next_allowed = last_changed + chrono::Duration::days(30);
    if chrono::Utc::now() < next_allowed {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            format!(
                "Alias cooldown active. You can next change your alias on {}.",
                next_allowed.format("%Y-%m-%d")
            ),
        ));
    }

    let record = state.db.change_alias(&user.id, &alias).await.map_err(|e| {
        let msg = e.to_string();
        if msg.contains("unique") || msg.contains("duplicate") || msg.contains("aliases_pkey") {
            (
                StatusCode::CONFLICT,
                "This alias is already taken.".to_string(),
            )
        } else if matches!(e, sqlx::Error::RowNotFound) {
            // Cooldown race — shouldn't reach here after pre-flight but handle defensively
            (
                StatusCode::TOO_MANY_REQUESTS,
                "Alias cooldown is still active.".to_string(),
            )
        } else {
            internal_http_error(e)
        }
    })?;

    let domain = std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "omnyid.com".to_string());
    Ok(Json(serde_json::json!({
        "alias": record.alias,
        "display_address": format!("{}@{}", record.alias, domain),
        "last_changed_at": record.last_changed_at,
        "message": integration_user_facing_text(
            "Alias updated.",
            active_persona.as_ref(),
        ),
    })))
}
