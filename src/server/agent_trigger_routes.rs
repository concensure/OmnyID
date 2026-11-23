/*
 * @module-id: rust.server.agent-trigger-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

fn trigger_user_facing_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/agent/triggers", get(list_triggers_http))
        .route("/agent/trigger", post(create_trigger_http))
        .route(
            "/agent/trigger/{id}",
            axum::routing::delete(delete_trigger_http).patch(patch_trigger_http),
        )
}

/// GET /agent/triggers â€” list all triggers for the authenticated user's master agent
async fn list_triggers_http(
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
    let triggers = state
        .db
        .list_triggers(&user.id, &instance_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "triggers": triggers })))
}

/// PATCH /agent/trigger/:id â€” enable or disable a trigger
#[derive(serde::Deserialize)]
struct PatchTriggerRequest {
    enabled: Option<bool>,
}

async fn patch_trigger_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<PatchTriggerRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    if let Some(enabled) = body.enabled {
        state
            .db
            .set_trigger_enabled(&user.id, &id, enabled)
            .await
            .map_err(internal_http_error)?;
    }
    Ok(Json(serde_json::json!({
        "updated": true,
        "message": trigger_user_facing_text(
            match body.enabled {
                Some(true) => "Trigger enabled.",
                Some(false) => "Trigger disabled.",
                None => "Trigger settings saved.",
            },
            active_persona.as_ref(),
        )
    })))
}

/// POST /agent/trigger
#[derive(serde::Deserialize)]
struct CreateTriggerRequest {
    trigger_type: String,
    config: serde_json::Value,
}

async fn create_trigger_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateTriggerRequest>,
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
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();
    let trigger_type = crate::agent_template::TriggerType::from_str(&body.trigger_type);
    let trigger = crate::agent_template::AgentTrigger::new(
        instance_id,
        user.id.clone(),
        trigger_type,
        body.config,
    );
    let id = trigger.id.clone();
    state
        .db
        .create_trigger(&trigger)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "id": id,
        "message": trigger_user_facing_text(
            "Trigger created.",
            active_persona.as_ref(),
        )
    })))
}

/// DELETE /agent/trigger/:id
async fn delete_trigger_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    state
        .db
        .delete_trigger(&user.id, &id)
        .await
        .map_err(trigger_delete_error_to_http)?;
    Ok(Json(serde_json::json!({
        "deleted": true,
        "message": trigger_user_facing_text(
            "Trigger deleted.",
            active_persona.as_ref(),
        )
    })))
}
