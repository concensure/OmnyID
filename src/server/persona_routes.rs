/*
 * @module-id: rust.server.persona-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde_json::Value;

use super::*;
use crate::agent_personas::{
    AgentPersona, CreatePersonaRequest, UpdatePersonaRequest, sanitize_persona_name,
    sanitize_persona_writing_style,
};

fn persona_user_facing_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

fn persona_error(e: sqlx::Error) -> (StatusCode, String) {
    internal_http_error(e)
}

fn persona_response_value(persona: &AgentPersona) -> Value {
    let mut value = serde_json::to_value(persona).unwrap_or_else(|_| serde_json::json!({}));
    if let Some(persona_obj) = value.as_object_mut() {
        persona_obj.insert("labels_json".to_string(), persona.skills_json.clone());
    }
    value
}

fn persona_list_response_value(personas: &[AgentPersona]) -> Vec<Value> {
    personas.iter().map(persona_response_value).collect()
}

/// GET /agent/personas
pub(super) async fn list_personas_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let personas = state
        .db
        .list_agent_personas(&user.id)
        .await
        .map_err(persona_error)?;
    Ok(Json(serde_json::json!({
        "personas": persona_list_response_value(&personas)
    })))
}

/// POST /agent/personas
pub(super) async fn create_persona_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<CreatePersonaRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    if sanitize_persona_name(&req.name).is_empty() {
        return Err((StatusCode::BAD_REQUEST, "name is required".into()));
    }
    if let Some(writing_style) = req.writing_style.as_deref() {
        let normalized = sanitize_persona_writing_style(writing_style);
        if normalized != writing_style.trim().to_lowercase() {
            return Err((
                StatusCode::BAD_REQUEST,
                "writing_style must be one of: balanced, concise, warm, formal, creative, analytical".into(),
            ));
        }
    }
    let persona = state
        .db
        .create_agent_persona(&user.id, &req)
        .await
        .map_err(persona_error)?;
    Ok(Json(serde_json::json!({
        "persona": persona_response_value(&persona),
        "message": persona_user_facing_text(
            "Persona created.",
            active_persona.as_ref(),
        )
    })))
}

/// PUT /agent/personas/:id
pub(super) async fn update_persona_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(persona_id): Path<String>,
    Json(req): Json<UpdatePersonaRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    if let Some(name) = req.name.as_deref() {
        if sanitize_persona_name(name).is_empty() {
            return Err((StatusCode::BAD_REQUEST, "name is required".into()));
        }
    }
    if let Some(writing_style) = req.writing_style.as_deref() {
        let normalized = sanitize_persona_writing_style(writing_style);
        if normalized != writing_style.trim().to_lowercase() {
            return Err((
                StatusCode::BAD_REQUEST,
                "writing_style must be one of: balanced, concise, warm, formal, creative, analytical".into(),
            ));
        }
    }
    let updated = state
        .db
        .update_agent_persona(&user.id, &persona_id, &req)
        .await
        .map_err(persona_error)?;
    match updated {
        Some(p) => Ok(Json(serde_json::json!({
            "persona": persona_response_value(&p),
            "message": persona_user_facing_text(
                "Persona updated.",
                active_persona.as_ref(),
            )
        }))),
        None => Err((StatusCode::NOT_FOUND, "persona not found".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::persona_response_value;

    #[test]
    fn persona_response_includes_labels_json_alias() {
        let persona = crate::agent_personas::AgentPersona {
            id: "persona_1".to_string(),
            owner_user_id: "user_1".to_string(),
            name: "Warm".to_string(),
            soul_md: "Keep replies calm.".to_string(),
            writing_style: "warm".to_string(),
            skills_json: serde_json::json!(["email", "notes"]),
            lora_confidence_score: 0.0,
            lora_genome_active: false,
            is_active: true,
            created_at: "2026-08-26T00:00:00Z".to_string(),
            updated_at: "2026-08-26T00:00:00Z".to_string(),
        };

        let value = persona_response_value(&persona);
        assert_eq!(value["skills_json"], serde_json::json!(["email", "notes"]));
        assert_eq!(value["labels_json"], serde_json::json!(["email", "notes"]));
    }
}

/// POST /agent/personas/:id/activate
pub(super) async fn activate_persona_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(persona_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let ok = state
        .db
        .activate_agent_persona(&user.id, &persona_id)
        .await
        .map_err(persona_error)?;
    if ok {
        Ok(Json(serde_json::json!({
            "activated": persona_id,
            "message": persona_user_facing_text(
                "Persona activated.",
                active_persona.as_ref(),
            )
        })))
    } else {
        Err((StatusCode::NOT_FOUND, "persona not found".into()))
    }
}

/// DELETE /agent/personas/:id
pub(super) async fn delete_persona_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(persona_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let ok = state
        .db
        .delete_agent_persona(&user.id, &persona_id)
        .await
        .map_err(persona_error)?;
    if ok {
        Ok(Json(serde_json::json!({
            "deleted": persona_id,
            "message": persona_user_facing_text(
                "Persona deleted.",
                active_persona.as_ref(),
            )
        })))
    } else {
        Err((StatusCode::NOT_FOUND, "persona not found".into()))
    }
}
