/*
 * @module-id: rust.server.agent-setup-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/dashboard/session", get(dashboard_session_http))
        .route("/agent/onboarding", post(agent_onboarding_http))
        .route(
            "/agent/focus",
            get(list_focus_items_http).post(create_focus_item_http),
        )
        .route(
            "/agent/focus/{id}",
            axum::routing::patch(update_focus_item_http),
        )
}

/// GET /dashboard/session
/// For unauthenticated users: checks the 3-session limit and provisions an
/// ephemeral master agent. Authenticated users skip the gate entirely.
async fn dashboard_session_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    // Authenticated users bypass the anon gate
    if authenticated_user(&state.db, &headers).await.is_ok() {
        return Ok(Json(
            serde_json::json!({"authenticated": true, "session": "persistent"}),
        ));
    }

    let fingerprint = super::anonymous_session_identity_key(&headers);
    let count = state
        .db
        .check_and_increment_anon_session(&fingerprint)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    if count > 3 {
        return Err((
            StatusCode::FORBIDDEN,
            "You've used all 3 free guest sessions from this device. Sign in to continue."
                .to_string(),
        ));
    }

    let domain = std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "omnyid.com".to_string());
    let instance = crate::agent_template::AgentInstance::provision_ephemeral(&fingerprint, &domain);
    let instance_id = instance.id.clone();
    state
        .db
        .save_master_agent_instance(&instance)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "authenticated": false,
        "session": "ephemeral",
        "session_count": count,
        "sessions_remaining": 3 - count,
        "agent_instance_id": instance_id,
    })))
}

#[cfg(test)]
mod tests {
    use super::super::anonymous_session_identity_key;
    use axum::http::{HeaderMap, HeaderValue};
    use std::sync::{Mutex, OnceLock};

    fn env_test_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn anonymous_session_identity_key_is_stable_for_same_headers() {
        let mut headers = HeaderMap::new();
        headers.insert("user-agent", HeaderValue::from_static("omnyid-test"));

        let first = anonymous_session_identity_key(&headers);
        let second = anonymous_session_identity_key(&headers);

        assert_eq!(first, second);
        assert!(first.starts_with("direct:"));
    }

    #[test]
    fn anonymous_session_identity_key_ignores_forwarded_for_without_trusted_proxy() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::remove_var("OMNYID_BEHIND_TRUSTED_PROXY");
        }

        let mut baseline = HeaderMap::new();
        baseline.insert("user-agent", HeaderValue::from_static("omnyid-test"));

        let mut spoofed = baseline.clone();
        spoofed.insert("x-forwarded-for", HeaderValue::from_static("203.0.113.42"));

        assert_eq!(
            anonymous_session_identity_key(&baseline),
            anonymous_session_identity_key(&spoofed)
        );
    }

    #[test]
    fn anonymous_session_identity_key_uses_forwarded_for_when_trusted_proxy_enabled() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::set_var("OMNYID_BEHIND_TRUSTED_PROXY", "true");
        }

        let mut baseline = HeaderMap::new();
        baseline.insert("user-agent", HeaderValue::from_static("omnyid-test"));

        let mut forwarded = baseline.clone();
        forwarded.insert("x-forwarded-for", HeaderValue::from_static("203.0.113.42"));

        assert_ne!(
            anonymous_session_identity_key(&baseline),
            anonymous_session_identity_key(&forwarded)
        );

        unsafe {
            std::env::remove_var("OMNYID_BEHIND_TRUSTED_PROXY");
        }
    }

    #[test]
    fn anonymous_session_identity_key_prefers_browser_fingerprint_header() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::remove_var("OMNYID_BEHIND_TRUSTED_PROXY");
        }

        let mut headers = HeaderMap::new();
        headers.insert("user-agent", HeaderValue::from_static("omnyid-test"));
        headers.insert(
            "x-omnyid-browser-fingerprint",
            HeaderValue::from_static("browser-fingerprint_1234567890"),
        );

        let identity = anonymous_session_identity_key(&headers);
        assert_eq!(identity, "direct:browser-fingerprint_1234");

        unsafe {
            std::env::remove_var("OMNYID_BEHIND_TRUSTED_PROXY");
        }
    }
}

/// POST /agent/onboarding
/// Saves soul.md answers and regenerates soul_md for the user's master agent.
#[derive(serde::Deserialize)]
struct OnboardingAnswers {
    personality: String,
    tone: String,
    goals: String,
    rules: String,
}

async fn agent_onboarding_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<OnboardingAnswers>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no master agent instance found".to_string(),
            )
        })?;
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();

    let soul_md = format!(
        "# Agent Soul - {display_name}\n\
        \n\
        ## Personality\n\
        {personality}\n\
        \n\
        ## Tone\n\
        {tone}\n\
        \n\
        ## Goals\n\
        {goals}\n\
        \n\
        ## Rules\n\
        {rules}\n\
        \n\
        ## LoRA Status\n\
        LoRA fine-tuning will progressively internalise this profile.\n\
        Once confidence reaches 85 %, this file will be archived.\n",
        display_name = user.display_name,
        personality = body.personality,
        tone = body.tone,
        goals = body.goals,
        rules = body.rules,
    );

    state
        .db
        .update_agent_soul(&user.id, &instance_id, &soul_md)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(
        serde_json::json!({"updated": true, "soul_md": soul_md}),
    ))
}

/// GET /agent/focus
async fn list_focus_items_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();
    let items = state
        .db
        .list_focus_items(&user.id, &instance_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"items": items})))
}

/// POST /agent/focus
#[derive(serde::Deserialize)]
struct CreateFocusItemRequest {
    title: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    priority: Option<String>,
}

async fn create_focus_item_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateFocusItemRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();
    let mut item = crate::agent_template::FocusItem::new(instance_id, user.id.clone(), body.title);
    if let Some(desc) = body.description {
        item.description = Some(desc);
    }
    if let Some(prio) = body.priority {
        item.priority = prio;
    }
    let id = item.id.clone();
    state
        .db
        .create_focus_item(&item)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"id": id, "status": "pending"})))
}

/// PATCH /agent/focus/:id
#[derive(serde::Deserialize)]
struct UpdateFocusItemRequest {
    status: String,
}

async fn update_focus_item_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<UpdateFocusItemRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .update_focus_item_status(&user.id, &id, &body.status)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"updated": true})))
}
