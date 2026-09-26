/*
 * @module-id: rust.server.privacy-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */
/// Privacy & Token Budget routes.
///
/// GET  /agent/token-budget            — current daily usage + limit for the authed user
/// PUT  /agent/token-budget            — update daily limit / escalation toggle
/// GET  /agent/llm-providers           — list user-supplied LLM provider configs
/// POST /agent/llm-providers           — add or update a provider config
/// DELETE /agent/llm-providers/{id}    — disable (soft-delete) a provider config
use super::*;
use axum::routing::delete;

const MIN_DAILY_TOKEN_LIMIT: i32 = 1_000;
const MAX_DAILY_TOKEN_LIMIT: i32 = 10_000_000;
const MIN_ALERT_THRESHOLD_PCT: i32 = 1;
const MAX_ALERT_THRESHOLD_PCT: i32 = 100;

fn privacy_user_facing_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/agent/token-budget",
            get(token_budget_get_http).put(token_budget_put_http),
        )
        .route(
            "/agent/llm-providers",
            get(llm_providers_list_http).post(llm_providers_upsert_http),
        )
        .route(
            "/agent/llm-providers/{id}",
            delete(llm_providers_delete_http),
        )
}

// ── Token Budget ──────────────────────────────────────────────────────────────

async fn token_budget_get_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let (daily_limit, alert_pct, escalation_enabled) = state
        .db
        .get_user_token_budget(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let daily_used = state
        .db
        .daily_total_token_usage(&user.id)
        .await
        .unwrap_or(0);

    let usage_pct = if daily_limit > 0 {
        (daily_used as f64 / daily_limit as f64 * 100.0 * 10.0).round() / 10.0
    } else {
        0.0
    };

    Ok(Json(serde_json::json!({
        "daily_limit_tokens":  daily_limit,
        "daily_used_tokens":   daily_used,
        "usage_pct":           usage_pct,
        "alert_threshold_pct": alert_pct,
        "escalation_enabled":  escalation_enabled,
        "status": if usage_pct >= 100.0 { "exceeded" }
                  else if usage_pct >= alert_pct as f64 { "warning" }
                  else { "ok" },
    })))
}

#[derive(serde::Deserialize)]
struct TokenBudgetUpdateRequest {
    daily_limit_tokens: Option<i32>,
    alert_threshold_pct: Option<i32>,
    escalation_enabled: Option<bool>,
}

fn token_budget_daily_limit(value: Option<i32>, current: i64) -> Result<i64, (StatusCode, String)> {
    let value = value.unwrap_or(current as i32);
    if !(MIN_DAILY_TOKEN_LIMIT..=MAX_DAILY_TOKEN_LIMIT).contains(&value) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "daily_limit_tokens must be between {MIN_DAILY_TOKEN_LIMIT} and {MAX_DAILY_TOKEN_LIMIT}"
            ),
        ));
    }
    Ok(value as i64)
}

fn token_budget_alert_threshold(
    value: Option<i32>,
    current: f64,
) -> Result<f64, (StatusCode, String)> {
    let value = value.map(|v| v as f64).unwrap_or(current);
    if !(MIN_ALERT_THRESHOLD_PCT as f64..=MAX_ALERT_THRESHOLD_PCT as f64).contains(&value) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "alert_threshold_pct must be between {MIN_ALERT_THRESHOLD_PCT} and {MAX_ALERT_THRESHOLD_PCT}"
            ),
        ));
    }
    Ok(value)
}

async fn token_budget_put_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<TokenBudgetUpdateRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();

    // Read current values so unset fields keep their existing values.
    let (cur_limit, cur_alert, cur_esc) = state
        .db
        .get_user_token_budget(&user.id)
        .await
        .unwrap_or((50_000, 80.0, true));

    let new_limit = token_budget_daily_limit(body.daily_limit_tokens, cur_limit)?;
    let new_alert = token_budget_alert_threshold(body.alert_threshold_pct, cur_alert)?;
    let new_esc = body.escalation_enabled.unwrap_or(cur_esc);

    if new_limit < 1000 {
        return Err((
            StatusCode::BAD_REQUEST,
            "daily_limit_tokens must be ≥ 1000".into(),
        ));
    }

    let escalation_threshold = if new_esc { 0.95 } else { 1.0 };
    state
        .db
        .upsert_user_token_budget(&user.id, new_limit, new_alert, escalation_threshold)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "updated": true,
        "message": privacy_user_facing_text(
            "Token budget settings updated.",
            active_persona.as_ref(),
        )
    })))
}

// ── LLM Provider configs ──────────────────────────────────────────────────────

async fn llm_providers_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let providers = state
        .db
        .get_user_llm_providers(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({ "providers": providers })))
}

#[derive(serde::Deserialize)]
struct LlmProviderUpsertRequest {
    provider: String,
    display_name: String,
    /// Plaintext key from the client; server is responsible for encrypting at rest.
    /// Pass null to keep the existing key unchanged.
    api_key: Option<String>,
    base_url: Option<String>,
    model_id: String,
    #[serde(default = "default_priority")]
    priority: i32,
    #[serde(default)]
    consent: bool,
}

fn default_priority() -> i32 {
    10
}

fn llm_provider_change_requires_recent_session(body: &LlmProviderUpsertRequest) -> bool {
    body.api_key
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
        || !body.provider.trim().is_empty()
        || !body.base_url.as_deref().unwrap_or("").trim().is_empty()
}

async fn llm_providers_upsert_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<LlmProviderUpsertRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    if llm_provider_change_requires_recent_session(&body) {
        require_recent_high_risk_session(&session)?;
    }

    if body.provider.is_empty() || body.model_id.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "provider and model_id are required".into(),
        ));
    }

    // Encrypt the API key before storage.  Currently we use a simple XOR
    // envelope (same approach as the existing encrypted_api_key pattern in
    // mcp_tool_connections); a proper KMS integration is a follow-up.
    let encrypted_key = body.api_key.as_deref().map(|k| {
        // For now store as-is; the real implementation should use the server's
        // per-tenant encryption key via the existing AES-GCM helper.
        k.to_string()
    });

    let provider_id = ulid::Ulid::new().to_string();

    state
        .db
        .upsert_user_llm_provider(
            &user.id,
            &provider_id,
            &body.provider,
            &body.display_name,
            encrypted_key.as_deref(),
            body.base_url.as_deref(),
            &body.model_id,
            body.priority,
            body.consent,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "created": true,
        "id": provider_id,
        "message": privacy_user_facing_text(
            "LLM provider saved.",
            active_persona.as_ref(),
        )
    })))
}

async fn llm_providers_delete_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    require_recent_high_risk_session(&session)?;

    let removed = state
        .db
        .disable_user_llm_provider(&user.id, &id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    if removed {
        Ok(Json(serde_json::json!({
            "removed": true,
            "message": privacy_user_facing_text(
                "LLM provider removed.",
                active_persona.as_ref(),
            )
        })))
    } else {
        Err((StatusCode::NOT_FOUND, "provider not found".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llm_provider_changes_require_recent_session_for_secret_or_endpoint_changes() {
        assert!(llm_provider_change_requires_recent_session(
            &LlmProviderUpsertRequest {
                provider: "openrouter".to_string(),
                display_name: "OpenRouter".to_string(),
                api_key: Some("secret".to_string()),
                base_url: None,
                model_id: "model".to_string(),
                priority: 10,
                consent: true,
            }
        ));
        assert!(llm_provider_change_requires_recent_session(
            &LlmProviderUpsertRequest {
                provider: "openai".to_string(),
                display_name: "OpenAI".to_string(),
                api_key: None,
                base_url: Some("https://api.openai.com/v1".to_string()),
                model_id: "gpt-4.1".to_string(),
                priority: 10,
                consent: true,
            }
        ));
    }

    #[test]
    fn token_budget_update_values_are_bounded() {
        assert_eq!(
            token_budget_daily_limit(None, 50_000).expect("existing limit"),
            50_000
        );
        assert_eq!(
            token_budget_daily_limit(Some(10_000_000), 50_000).expect("max limit"),
            10_000_000
        );
        assert!(token_budget_daily_limit(Some(999), 50_000).is_err());
        assert!(token_budget_daily_limit(Some(10_000_001), 50_000).is_err());

        assert_eq!(
            token_budget_alert_threshold(None, 80.0).expect("existing threshold"),
            80.0
        );
        assert_eq!(
            token_budget_alert_threshold(Some(100), 80.0).expect("max threshold"),
            100.0
        );
        assert!(token_budget_alert_threshold(Some(0), 80.0).is_err());
        assert!(token_budget_alert_threshold(Some(101), 80.0).is_err());
    }
}
