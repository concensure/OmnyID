/*
 * @module-id: integration.user-integrations.calendar
 * @primary-capability: google-calendar-integration
 * @sub-capabilities: calendar-oauth, calendar-sync, local-calendar-events
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid-runtime
 */

use super::*;

const GOOGLE_CALENDAR_SCOPES: &str = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

fn calendar_google_oauth_redirect_target(status: &str) -> String {
    let suffix = format!("/workspace/?calendar={status}");
    std::env::var("OMNYID_WORKSPACE_BASE_URL")
        .ok()
        .or_else(|| std::env::var("OMNYID_UI_BASE_URL").ok())
        .or_else(derive_workspace_base_url_from_homeserver)
        .map(|base| format!("{}{}", base.trim_end_matches('/'), suffix))
        .unwrap_or(suffix)
}

fn calendar_google_oauth_redirect_uri() -> Result<String, (StatusCode, String)> {
    let base_url = std::env::var("OMNYID_HOMESERVER_URL").map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Google Calendar OAuth not configured on this server. Set OMNYID_HOMESERVER_URL."
                .to_string(),
        )
    })?;
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Google Calendar OAuth not configured on this server. Set OMNYID_HOMESERVER_URL."
                .to_string(),
        ));
    }
    Ok(format!("{trimmed}/calendar/google/callback"))
}

pub(super) fn calendar_google_oauth_is_fully_configured() -> bool {
    calendar_google_oauth_client_id_configured().is_ok()
        && calendar_google_oauth_client_secret_configured().is_ok()
        && calendar_google_oauth_redirect_uri().is_ok()
        && oauth_csrf_secret().is_ok()
}

pub(super) fn calendar_google_oauth_client_id_configured() -> Result<String, (StatusCode, String)> {
    for env_key in [
        "OMNYID_GOOGLE_CALENDAR_CLIENT_ID",
        "OMNYID_ADMIN_GOOGLE_CALENDAR_CLIENT_ID",
    ] {
        if let Ok(client_id) = std::env::var(env_key) {
            let trimmed = client_id.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }
    gmail_oauth_client_id_configured()
}

pub(super) fn calendar_google_oauth_client_secret_configured()
-> Result<String, (StatusCode, String)> {
    for env_key in [
        "OMNYID_GOOGLE_CALENDAR_CLIENT_SECRET",
        "OMNYID_ADMIN_GOOGLE_CALENDAR_CLIENT_SECRET",
        "GOOGLE_CALENDAR_CLIENT_SECRET",
        "GOOGLE_CLIENT_SECRET",
    ] {
        if let Some(secret) = read_process_secret_trimmed(env_key) {
            return Ok(secret);
        }
    }
    gmail_oauth_client_secret_configured()
}

pub(super) fn calendar_google_oauth_client_source() -> &'static str {
    if std::env::var("OMNYID_GOOGLE_CALENDAR_CLIENT_ID")
        .ok()
        .is_some_and(|value| !value.trim().is_empty())
    {
        return "calendar";
    }
    if std::env::var("OMNYID_ADMIN_GOOGLE_CALENDAR_CLIENT_ID")
        .ok()
        .is_some_and(|value| !value.trim().is_empty())
    {
        return "admin_calendar";
    }
    "gmail_fallback"
}

/// GET /calendar/google/connect-url - returns the Google OAuth authorization URL for Calendar scopes.
pub(super) async fn calendar_google_connect_url_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    if gmail_connection_change_requires_recent_session() {
        require_recent_high_risk_session(&session)?;
    }
    let client_id = calendar_google_oauth_client_id_configured()?;
    let redirect_uri = calendar_google_oauth_redirect_uri()?;
    let signed_state = gmail_oauth_state_sign(&user.id)?;
    let url = google_oauth_authorization_url(
        &client_id,
        &redirect_uri,
        GOOGLE_CALENDAR_SCOPES,
        &signed_state,
    );
    Ok(Json(serde_json::json!({"url": url})))
}

/// GET /calendar/google/config — safe OAuth diagnostics for admins and support UI.
pub(super) async fn calendar_google_config_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _ = authenticated_user_and_session(&state.db, &headers).await?;
    let redirect_uri = calendar_google_oauth_redirect_uri().ok();
    Ok(Json(serde_json::json!({
        "configured": calendar_google_oauth_is_fully_configured(),
        "client_id_configured": calendar_google_oauth_client_id_configured().is_ok(),
        "client_secret_configured": calendar_google_oauth_client_secret_configured().is_ok(),
        "csrf_secret_configured": oauth_csrf_secret().is_ok(),
        "homeserver_url_configured": redirect_uri.is_some(),
        "redirect_uri": redirect_uri,
        "required_authorized_redirect_uri": redirect_uri,
        "required_scopes": GOOGLE_CALENDAR_SCOPES.split_whitespace().collect::<Vec<_>>(),
        "oauth_client_source": calendar_google_oauth_client_source(),
    })))
}

/// GET /calendar/google/callback?code=... — exchanges the OAuth code and stores the token
pub(super) async fn calendar_google_callback_http(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let Some(code) = params.get("code").cloned() else {
        return axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target(
            "error",
        ))
        .into_response();
    };
    let Some(raw_state) = params.get("state").cloned() else {
        return axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target(
            "error",
        ))
        .into_response();
    };
    let user_id = match gmail_oauth_state_verify_at(&raw_state, chrono::Utc::now().timestamp()) {
        Ok(Some(user_id)) => user_id,
        Ok(None) => {
            return axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target(
                "error",
            ))
            .into_response();
        }
        Err(_) => {
            return axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target(
                "not_configured",
            ))
            .into_response();
        }
    };

    let Ok(client_id) = calendar_google_oauth_client_id_configured() else {
        return axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target(
            "not_configured",
        ))
        .into_response();
    };
    let Ok(client_secret) = calendar_google_oauth_client_secret_configured() else {
        return axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target(
            "not_configured",
        ))
        .into_response();
    };
    let Ok(redirect_uri) = calendar_google_oauth_redirect_uri() else {
        return axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target(
            "not_configured",
        ))
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
                return axum::response::Redirect::temporary(
                    &calendar_google_oauth_redirect_target("error"),
                )
                .into_response();
            }
        },
        _ => {
            return axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target(
                "error",
            ))
            .into_response();
        }
    };

    let Some(access_token) = gmail_access_token_from_token_response(&token_data) else {
        return axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target(
            "error",
        ))
        .into_response();
    };
    let refresh_token = token_data["refresh_token"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let google_email = if !access_token.is_empty() {
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
        .store_google_calendar_token(
            &user_id,
            &access_token,
            &refresh_token,
            &google_email,
            expiry_iso,
        )
        .await
        .is_err()
    {
        return axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target(
            "error",
        ))
        .into_response();
    }

    if state
        .db
        .refresh_google_calendar_connected_capabilities(&user_id, &google_email)
        .await
        .is_err()
    {
        return axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target(
            "error",
        ))
        .into_response();
    }

    // Pull an initial batch of events right away so the Calendar view has
    // something to show without the user needing a separate manual sync.
    let _ = calendar_google_sync_events(&state, &user_id).await;

    axum::response::Redirect::temporary(&calendar_google_oauth_redirect_target("connected"))
        .into_response()
}

/// GET /calendar/google/status — returns whether a Google Calendar token is stored for the user
pub(super) async fn calendar_google_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let token = state
        .db
        .get_google_calendar_token(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let token_expiry = token
        .as_ref()
        .and_then(|value| value.get("token_expiry"))
        .and_then(Value::as_str);
    let (token_expired, expires_within_24h) =
        gmail_token_expiry_warning_state(token_expiry, chrono::Utc::now());
    Ok(Json(serde_json::json!({
        "connected": token.is_some(),
        "google_email": token.as_ref().and_then(|t| t["google_email"].as_str()).unwrap_or(""),
        "configured": calendar_google_oauth_is_fully_configured(),
        "token_expiry": token_expiry,
        "connected_at": token
            .as_ref()
            .and_then(|value| value.get("connected_at"))
            .and_then(Value::as_str),
        "token_expired": token_expired,
        "expires_within_24h": expires_within_24h,
        "message": if token.is_some() {
            if token_expired {
                "Google Calendar is connected, but the token has expired and needs to be refreshed."
            } else {
                "Google Calendar is connected and ready."
            }
        } else if calendar_google_oauth_is_fully_configured() {
            "Google Calendar is available to connect."
        } else {
            "Google Calendar OAuth is not fully configured on this homeserver."
        },
    })))
}

/// POST /calendar/google/disconnect
pub(super) async fn calendar_google_disconnect_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    if gmail_connection_change_requires_recent_session() {
        require_recent_high_risk_session(&session)?;
    }
    let existing = state
        .db
        .get_google_calendar_token(&user.id)
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

    let disconnected = state
        .db
        .delete_google_calendar_token(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let cleared_capability_count = state
        .db
        .delete_user_connected_capabilities_for_provider(&user.id, "google_calendar")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "ok": true,
        "disconnected": disconnected,
        "revoke_attempted": revoke_attempted,
        "cleared_capability_count": cleared_capability_count,
        "connection_provider": "google_calendar",
        "message": if disconnected {
            "Google Calendar has been disconnected."
        } else {
            "No Google Calendar connection was active."
        },
    })))
}

/// POST /calendar/google/sync — pulls events from Google Calendar into the local calendar
pub(super) async fn calendar_google_sync_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let synced_count = calendar_google_sync_events(&state, &user.id).await?;
    Ok(Json(
        serde_json::json!({ "ok": true, "synced_count": synced_count }),
    ))
}

/// Refreshes the stored access token via the refresh_token grant if it's
/// missing/expired, returning a usable access token.
async fn calendar_google_ensure_access_token(
    state: &Arc<AppState>,
    user_id: &str,
    token: &Value,
) -> Result<String, (StatusCode, String)> {
    let access_token = token
        .get("access_token")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let token_expiry = token.get("token_expiry").and_then(Value::as_str);
    let (expired, _) = gmail_token_expiry_warning_state(token_expiry, chrono::Utc::now());
    if !access_token.is_empty() && !expired {
        return Ok(access_token);
    }

    let refresh_token = token
        .get("refresh_token")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "Google Calendar connection has no refresh token; reconnect Google Calendar."
                    .to_string(),
            )
        })?;
    let client_id = calendar_google_oauth_client_id_configured()?;
    let client_secret = calendar_google_oauth_client_secret_configured()?;

    let resp = reqwest::Client::new()
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("refresh_token", refresh_token),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(internal_http_error)?;

    if !resp.status().is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            "Failed to refresh the Google Calendar access token; reconnect Google Calendar."
                .to_string(),
        ));
    }
    let token_data: Value = resp.json().await.map_err(internal_http_error)?;
    let new_access_token =
        gmail_access_token_from_token_response(&token_data).ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                "Google did not return a usable access token when refreshing Google Calendar."
                    .to_string(),
            )
        })?;
    let expiry_iso = token_data["expires_in"]
        .as_i64()
        .map(|secs| (chrono::Utc::now() + chrono::Duration::seconds(secs)).to_rfc3339());
    state
        .db
        .update_google_calendar_access_token(user_id, &new_access_token, expiry_iso)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(new_access_token)
}

/// Extracts a Google Calendar event's start/end into (timestamp, all_day).
fn calendar_google_event_datetime(value: &Value) -> Option<(String, bool)> {
    if let Some(date_time) = value.get("dateTime").and_then(Value::as_str) {
        return Some((date_time.to_string(), false));
    }
    if let Some(date) = value.get("date").and_then(Value::as_str) {
        return Some((format!("{date}T00:00:00Z"), true));
    }
    None
}

async fn calendar_google_sync_events(
    state: &Arc<AppState>,
    user_id: &str,
) -> Result<usize, (StatusCode, String)> {
    let Some(token) = state
        .db
        .get_google_calendar_token(user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    else {
        return Err((
            StatusCode::BAD_REQUEST,
            "Google Calendar is not connected.".to_string(),
        ));
    };
    let access_token = calendar_google_ensure_access_token(state, user_id, &token).await?;

    let time_min = (chrono::Utc::now() - chrono::Duration::days(31)).to_rfc3339();
    let time_max = (chrono::Utc::now() + chrono::Duration::days(180)).to_rfc3339();
    let resp = reqwest::Client::new()
        .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .bearer_auth(&access_token)
        .query(&[
            ("timeMin", time_min.as_str()),
            ("timeMax", time_max.as_str()),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
            ("maxResults", "250"),
        ])
        .send()
        .await
        .map_err(internal_http_error)?;

    if !resp.status().is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            "Google Calendar declined the events request; reconnect Google Calendar.".to_string(),
        ));
    }
    let payload: Value = resp.json().await.map_err(internal_http_error)?;
    let items = payload["items"].as_array().cloned().unwrap_or_default();

    let mut synced_count = 0usize;
    for item in items {
        let Some(google_event_id) = item["id"].as_str() else {
            continue;
        };
        let Some((start_at, all_day)) = item.get("start").and_then(calendar_google_event_datetime)
        else {
            continue;
        };
        let end_at = item.get("end").and_then(calendar_google_event_datetime);
        let title = item["summary"].as_str().unwrap_or("(No title)");
        let description = item["description"].as_str();
        let location = item["location"].as_str();
        let status = match item["status"].as_str() {
            Some("cancelled") => "cancelled",
            Some("tentative") => "tentative",
            _ => "confirmed",
        };
        let local_id = ulid::Ulid::new().to_string();
        state
            .db
            .upsert_calendar_event_from_google_sync(
                user_id,
                &local_id,
                google_event_id,
                title,
                description,
                &start_at,
                end_at.as_ref().map(|(value, _)| value.as_str()),
                all_day,
                location,
                status,
            )
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        synced_count += 1;
    }
    Ok(synced_count)
}

// ── Calendar events ───────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
pub(super) struct CalendarListQuery {
    /// First day of the month window as ISO-8601, e.g. "2026-03-01"
    month: Option<String>,
}

pub(super) async fn calendar_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<CalendarListQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let month_str = q.month.unwrap_or_else(|| {
        // Format: "YYYY-MM-01" from current UTC date
        chrono::Utc::now().format("%Y-%m-01").to_string()
    });
    // Build range: month_start to month_start + 1 month
    let range_start = format!("{}T00:00:00Z", month_str);
    let range_end = {
        let parts: Vec<&str> = month_str.splitn(3, '-').collect();
        let (ny, nm) = if parts.len() >= 2 {
            let y: i64 = parts[0].parse().unwrap_or(2026);
            let m: i64 = parts[1].parse().unwrap_or(1);
            if m == 12 { (y + 1, 1i64) } else { (y, m + 1) }
        } else {
            (2026, 1)
        };
        format!("{}-{:02}-01T00:00:00Z", ny, nm)
    };
    let events = state
        .db
        .list_calendar_events_in_range(&user.id, &range_start, &range_end)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "events": events })))
}

#[derive(serde::Deserialize)]
pub(super) struct CalendarCreateRequest {
    title: String,
    description: Option<String>,
    start_at: String,
    end_at: Option<String>,
    #[serde(default)]
    all_day: bool,
    location: Option<String>,
}

pub(super) async fn calendar_create_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CalendarCreateRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let id = ulid::Ulid::new().to_string();
    let event = state
        .db
        .create_calendar_event(
            &user.id,
            &id,
            &body.title,
            body.description.as_deref(),
            &body.start_at,
            body.end_at.as_deref(),
            body.all_day,
            body.location.as_deref(),
            Some("confirmed"),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(event))
}

pub(super) async fn calendar_delete_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(event_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deleted = state
        .db
        .delete_calendar_event(&user.id, &event_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "deleted": deleted })))
}

// ── Agent Alias Registry ──────────────────────────────────────────────────────
