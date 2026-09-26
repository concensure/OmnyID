/*
 * @module-id: rust.server.agent-capability-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

fn capability_user_facing_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/agent/capabilities", get(list_capabilities_http))
        .route(
            "/agent/capability",
            post(create_capability_http).get(list_capabilities_http),
        )
        .route(
            "/agent/capability/{id}",
            axum::routing::delete(delete_capability_http).patch(patch_capability_http),
        )
        .route("/agent/spend-history", get(spend_history_http))
}

/// POST /agent/capability
#[derive(serde::Deserialize)]
struct CreateCapabilityRequest {
    name: String,
    description: Option<String>,
    input_schema: Option<serde_json::Value>,
    output_schema: Option<serde_json::Value>,
    version: Option<String>,
    tags: Option<Vec<String>>,
    approval_mode: Option<String>,
}

async fn create_capability_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateCapabilityRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let agent_instance_id = instance["id"].as_str().unwrap_or("").to_string();

    let descriptor = serde_json::json!({
        "name": body.name,
        "description": body.description.unwrap_or_default(),
        "input_schema": body.input_schema.unwrap_or(serde_json::json!({})),
        "output_schema": body.output_schema,
        "version": body.version.unwrap_or_else(|| "1.0.0".to_string()),
        "tags": body.tags.unwrap_or_default(),
        "approval_mode": body.approval_mode.unwrap_or_else(|| "autonomous".to_string()),
    });

    let id = state
        .db
        .create_capability(&user.id, &agent_instance_id, &body.name, &descriptor)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "id": id,
        "name": body.name,
        "message": capability_user_facing_text(
            "Capability saved.",
            active_persona.as_ref(),
        )
    })))
}

/// GET /agent/capabilities (also matched by GET /agent/capability)
async fn list_capabilities_http(
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
    let agent_instance_id = instance["id"].as_str().unwrap_or("").to_string();

    let caps = state
        .db
        .list_capabilities(&user.id, &agent_instance_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!(caps)))
}

/// DELETE /agent/capability/:id
async fn delete_capability_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Path(cap_id): axum::extract::Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deleted = state
        .db
        .delete_capability(&user.id, &cap_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    if !deleted {
        return Err((StatusCode::NOT_FOUND, "capability not found".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// PATCH /agent/capability/:id â€” toggle enabled flag
#[derive(serde::Deserialize)]
struct PatchCapabilityRequest {
    enabled: bool,
}

async fn patch_capability_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Path(cap_id): axum::extract::Path<String>,
    Json(body): Json<PatchCapabilityRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let updated = state
        .db
        .set_capability_enabled(&user.id, &cap_id, body.enabled)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    if !updated {
        return Err((StatusCode::NOT_FOUND, "capability not found".to_string()));
    }
    Ok(Json(serde_json::json!({
        "id": cap_id,
        "enabled": body.enabled,
        "message": capability_user_facing_text(
            if body.enabled {
                "Capability enabled."
            } else {
                "Capability disabled."
            },
            active_persona.as_ref(),
        )
    })))
}

/// GET /agent/spend-history?days=30
async fn spend_history_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let days: i32 = params
        .get("days")
        .and_then(|v| v.parse().ok())
        .unwrap_or(30)
        .min(365);
    let history = state
        .db
        .spend_history_for_user(&user.id, days)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(
        serde_json::json!({ "days": days, "history": history }),
    ))
}
