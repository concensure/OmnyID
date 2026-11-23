// @locs-version: 1.0
// @module-id: server.agent-routes
// @primary-capability: agent-http-routes
// @stability: beta

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde_json::Value;

use super::*;
use crate::agent_personas::resolve_active_persona_output_prompt;

fn agent_route_user_facing_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

// ── Master Agent Orchestration Handlers ──────────────────────────────────────

/// GET /dashboard/session
/// For unauthenticated users: checks the 3-session limit and provisions an
/// ephemeral master agent. Authenticated users skip the gate entirely.
pub(super) async fn dashboard_session_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    // Authenticated users bypass the anon gate
    if authenticated_user(&state.db, &headers).await.is_ok() {
        return Ok(Json(
            serde_json::json!({"authenticated": true, "session": "persistent"}),
        ));
    }

    let fingerprint = anonymous_session_identity_key(&headers);
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

/// POST /agent/onboarding
/// Saves soul.md answers and regenerates soul_md for the user's master agent.
#[derive(serde::Deserialize)]
pub(super) struct OnboardingAnswers {
    personality: String,
    tone: String,
    goals: String,
    rules: String,
}

pub(super) async fn agent_onboarding_http(
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
        "# Agent Soul — {display_name}\n\
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

// ── Focus items ────────────────────────────────────────────────────────────────

/// GET /agent/focus
pub(super) async fn list_focus_items_http(
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
pub(super) struct CreateFocusItemRequest {
    title: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    priority: Option<String>,
}

pub(super) async fn create_focus_item_http(
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
pub(super) struct UpdateFocusItemRequest {
    status: String,
}

pub(super) async fn update_focus_item_http(
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

/// POST /agent/trigger
#[derive(serde::Deserialize)]
pub(super) struct CreateTriggerRequest {
    trigger_type: String,
    config: serde_json::Value,
}

// ── POST /ingest/internal/{event_type} — authenticated internal event ingress ──

#[derive(serde::Deserialize)]
pub(super) struct InternalIngestBody {
    source_workflow_id: Option<String>,
    source_run_id: Option<String>,
    #[serde(default)]
    payload: serde_json::Value,
}

/// `POST /ingest/internal/{event_type}`
///
/// Authenticated endpoint allowing any component of the system (or an
/// authorised caller) to emit an internal runtime event.  The event is
/// enqueued in `public.internal_event_queue` and will be dispatched to all
/// matching `internal_event`-kind trigger registrations owned by the calling
/// user on the next dispatcher tick.
pub(super) async fn internal_ingest_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(event_type): Path<String>,
    Json(body): Json<InternalIngestBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state.db.get_active_agent_persona(&user.id).await.ok().flatten();
    let event_id = format!("ievt_{}", ulid::Ulid::new().to_string().to_lowercase());
    state
        .db
        .enqueue_internal_event(
            &event_id,
            &event_type,
            body.source_workflow_id.as_deref(),
            body.source_run_id.as_deref(),
            &user.id,
            &body.payload,
        )
        .await
        .map_err(internal_http_error)?;
    Ok(Json(serde_json::json!({
        "event_id": event_id,
        "event_type": event_type,
        "status": "queued",
        "note": agent_route_user_facing_text(
            "Internal event queued for dispatch.",
            active_persona.as_ref(),
        ),
    })))
}

// ── Triggers ──────────────────────────────────────────────────────────────────

pub(super) async fn create_trigger_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateTriggerRequest>,
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
    Ok(Json(serde_json::json!({"id": id})))
}

/// DELETE /agent/trigger/:id
pub(super) async fn delete_trigger_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .delete_trigger(&user.id, &id)
        .await
        .map_err(trigger_delete_error_to_http)?;
    Ok(Json(serde_json::json!({"deleted": true})))
}

/// POST /agent/delegate
#[derive(serde::Deserialize)]
pub(super) struct CreateDelegationRequest {
    scope: String,
    #[serde(default = "default_delegation_mask")]
    mask: String,
    #[serde(default = "default_delegation_expiry")]
    expires_in: u64,
}
pub(super) fn default_delegation_mask() -> String {
    "private".to_string()
}
pub(super) fn default_delegation_expiry() -> u64 {
    3600
}

// ── Delegations ───────────────────────────────────────────────────────────────

pub(super) async fn create_delegation_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateDelegationRequest>,
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
    let master_key_hex = crate::agent_template::delegation_master_key_hex().map_err(|err| {
        tracing::error!(%err, "delegation issuance blocked by invalid master key");
        (StatusCode::SERVICE_UNAVAILABLE, err)
    })?;
    let task_id = Ulid::new().to_string();
    let delegation = crate::agent_template::generate_delegated_key(
        &master_key_hex,
        &body.scope,
        &task_id,
        body.expires_in,
        &instance_id,
        &user.id,
        vec![], // allowed_capabilities: resolved by orchestrator for workflow delegations
        vec![], // outbound_allowlist: resolved from compiled IR for workflow delegations
        None,   // context_snapshot: populated by orchestrator at delegation time
    );
    let id = delegation.id.clone();
    let expires_at = delegation.expires_at.to_rfc3339();
    state
        .db
        .create_delegation(&delegation)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "id": id,
        "scope": body.scope,
        "mask": body.mask,
        "expires_at": expires_at,
    })))
}

/// DELETE /agent/delegate/:id
pub(super) async fn revoke_delegation_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .revoke_delegation(&user.id, &id)
        .await
        .map_err(delegation_revoke_error_to_http)?;
    Ok(Json(serde_json::json!({"revoked": true})))
}

// ── Agent fleet & orchestration ───────────────────────────────────────────────

/// GET /agent/fleet
pub(super) async fn agent_fleet_http(
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
    let delegations = state
        .db
        .get_active_delegations(&user.id, &instance_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let tasks = state
        .db
        .list_agent_tasks(&user.id, None, 20)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let active_count = tasks
        .iter()
        .filter(|t| t.get("status").and_then(Value::as_str) == Some("in_progress"))
        .count();
    let idle_count = tasks
        .iter()
        .filter(|t| t.get("status").and_then(Value::as_str) == Some("pending"))
        .count();

    Ok(Json(serde_json::json!({
        "master_instance": instance,
        "active_delegations": delegations,
        "recent_tasks": tasks,
        "active_count": active_count,
        "idle_count": idle_count,
    })))
}

/// PATCH /agent/settings
#[derive(serde::Deserialize)]
pub(super) struct AgentSettingsRequest {
    auto_approve_workflows: Option<bool>,
}

pub(super) async fn agent_settings_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AgentSettingsRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if let Some(auto_approve) = body.auto_approve_workflows {
        state
            .db
            .update_agent_settings(&user.id, auto_approve)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// POST /agent/orchestrate
#[derive(serde::Deserialize)]
pub(super) struct OrchestrateRequest {
    objective: String,
}

pub(super) async fn agent_orchestrate_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<OrchestrateRequest>,
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
    let soul_md_val = instance["soul_md"].as_str().unwrap_or("").to_string();
    let lora_active = instance["lora_genome_active"].as_bool().unwrap_or(false);

    // Fetch LLM config for API key / model
    let llm_cfg = state
        .db
        .get_llm_config(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "no LLM config; call POST /user/llm-config".to_string(),
            )
        })?;
    let backend_name = llm_cfg["backend"].as_str().unwrap_or("hosted");
    let (api_key, model) = if backend_name == "runpod" {
        let key =
            crate::secret_manager::read_process_secret_trimmed("OMNYID_RUNPOD_API_KEY")
                .unwrap_or_default();
        let mdl = llm_cfg["model"]
            .as_str()
            .unwrap_or("Qwen/Qwen3.5-35B-A3B")
            .to_string();
        (key, mdl)
    } else {
        let key = crate::secret_manager::read_process_secret_trimmed("OMNYID_ANTHROPIC_KEY")
            .or_else(|| crate::secret_manager::read_process_secret_trimmed("ANTHROPIC_API_KEY"))
            .unwrap_or_default();
        let mdl = llm_cfg["model"]
            .as_str()
            .unwrap_or("claude-haiku-4-5-20251001")
            .to_string();
        (key, mdl)
    };

    let orchestrator =
        crate::master_orchestrator::MasterOrchestrator::new(instance_id, user.id.clone());
    let soul_opt = if soul_md_val.is_empty() {
        None
    } else {
        Some(soul_md_val.as_str())
    };
    let output_persona_prompt = resolve_active_persona_output_prompt(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runpod_ep = if backend_name == "runpod" {
        Some(
            std::env::var("OMNYID_RUNPOD_ENDPOINT_ID")
                .unwrap_or_else(|_| "sdr11n90qjwjy2".to_string()),
        )
    } else {
        None
    };
    let result = orchestrator
        .run(
            &body.objective,
            &state.db,
            &api_key,
            &model,
            soul_opt,
            output_persona_prompt.as_deref(),
            lora_active,
            runpod_ep.as_deref(),
            Some(state.cost_oracle.as_ref()),
            None,
        )
        .await
        .map_err(internal_http_error)?;

    Ok(Json(serde_json::to_value(&result).unwrap_or_default()))
}

// ── Capability registry handlers ─────────────────────────────────────────────

/// POST /agent/capability
#[derive(serde::Deserialize)]
pub(super) struct CreateCapabilityRequest {
    name: String,
    description: Option<String>,
    input_schema: Option<serde_json::Value>,
    output_schema: Option<serde_json::Value>,
    version: Option<String>,
    tags: Option<Vec<String>>,
    approval_mode: Option<String>,
}

pub(super) async fn create_capability_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateCapabilityRequest>,
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

    Ok(Json(serde_json::json!({ "id": id, "name": body.name })))
}

/// GET /agent/capabilities (also matched by GET /agent/capability)
pub(super) async fn list_capabilities_http(
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
pub(super) async fn delete_capability_http(
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

// ── Agent invoke handler ──────────────────────────────────────────────────────

/// POST /agent/invoke
/// Validates delegation (if present), then forwards to the runner's /invoke endpoint.
#[derive(serde::Deserialize)]
pub(super) struct AgentInvokeRequest {
    capability_name: String,
    params: serde_json::Value,
    delegation_id: Option<String>,
    /// Optional thread_id to post the capability_invoke AFP message into.
    thread_id: Option<String>,
}

pub(super) async fn agent_invoke_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AgentInvokeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    // Validate delegation scope if a delegation_id was supplied
    if let Some(ref del_id) = body.delegation_id {
        let del = state
            .db
            .get_delegation_by_id(&user.id, del_id)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?
            .ok_or_else(|| (StatusCode::NOT_FOUND, "delegation not found".to_string()))?;
        if del["scope"].as_str().unwrap_or("") != body.capability_name {
            return Err((
                StatusCode::FORBIDDEN,
                "delegation scope mismatch".to_string(),
            ));
        }
        if del["revoked_at"].is_string() {
            return Err((
                StatusCode::FORBIDDEN,
                "delegation has been revoked".to_string(),
            ));
        }
    }

    // Find the user's runtime deployment
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let result = if let Some(dep) = deployment {
        // Forward to runner's /invoke endpoint
        let runner_port = dep
            .config_json
            .get("chat_port")
            .and_then(|v| v.as_u64())
            .unwrap_or(7860);
        let runner_url = format!("http://127.0.0.1:{runner_port}/invoke");
        let invoke_payload = serde_json::json!({
            "type": "capability_invoke",
            "content": {
                "capability_name": body.capability_name,
                "params": body.params,
                "delegation_id": body.delegation_id,
            }
        });
        match state
            .http_client
            .post(&runner_url)
            .json(&invoke_payload)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await
        {
            Ok(resp) => {
                let status = resp.status();
                if !status.is_success() {
                    tracing::error!(runner_status = %status, "agent invoke: runner returned non-success status");
                    runner_invoke_error_payload("runner invocation failed")
                } else {
                    match resp.json::<serde_json::Value>().await {
                        Ok(value) => value,
                        Err(err) => {
                            tracing::error!(error = %err, "agent invoke: runner returned unreadable JSON");
                            runner_invoke_error_payload("runner returned unreadable response")
                        }
                    }
                }
            }
            Err(err) => {
                tracing::error!(error = %err, "agent invoke: runner request failed");
                runner_invoke_error_payload("runner invocation failed")
            }
        }
    } else {
        serde_json::json!({"error": "no runner deployment found"})
    };

    // Append an AFP audit message (append-only, ON CONFLICT DO NOTHING)
    let thread_id = body
        .thread_id
        .unwrap_or_else(|| format!("agent-invoke:{}", ulid::Ulid::new()));
    let audit_msg = crate::afp::Message {
        protocol: "afp-v1".to_string(),
        id: ulid::Ulid::new().to_string(),
        thread_id: thread_id.clone(),
        parent_id: String::new(),
        from: user.id.clone(),
        to: vec![],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "action_capability_invoke".to_string(),
        kind: None,
        content: serde_json::to_string(&serde_json::json!({
            "capability_name": body.capability_name,
            "delegation_id": body.delegation_id,
        }))
        .unwrap_or_default(),
        views: String::new(),
        attachments: String::new(),
        references: String::new(),
        encryption: String::new(),
        signature: String::new(),
        store_in_relational: false,
        subtype: String::new(),
        metadata: String::new(),
    };
    let audit_content = serde_json::json!({
        "capability_name": body.capability_name,
        "delegation_id": body.delegation_id,
    });
    let _ = state
        .db
        .store_private_message(&user.id, &audit_msg, audit_content)
        .await;

    Ok(Json(
        serde_json::json!({ "result": result, "thread_id": thread_id }),
    ))
}

fn runner_invoke_error_payload(message: &str) -> Value {
    serde_json::json!({
        "error": message,
        "status": "service_dependency_unavailable",
    })
}

#[cfg(test)]
mod tests {
    use super::runner_invoke_error_payload;

    #[test]
    fn runner_invoke_error_payload_is_sanitized() {
        let payload = runner_invoke_error_payload("runner invocation failed");
        assert_eq!(
            payload.get("error").and_then(|value| value.as_str()),
            Some("runner invocation failed")
        );
        assert_eq!(
            payload.get("status").and_then(|value| value.as_str()),
            Some("service_dependency_unavailable")
        );
        assert!(payload.get("details").is_none());
    }

    #[test]
    fn agent_invoke_route_no_longer_echoes_raw_transport_errors() {
        let source = include_str!("agent_routes.rs");
        let start = source
            .find("pub(super) async fn agent_invoke_http(")
            .expect("agent_invoke_http definition");
        let end = source[start..]
            .find("/// POST /agent/tasks/:id/complete")
            .map(|offset| start + offset)
            .expect("task complete marker");
        let function_source = &source[start..end];
        assert!(function_source.contains("runner_invoke_error_payload(\"runner invocation failed\")"));
        assert!(function_source.contains("runner_invoke_error_payload(\"runner returned unreadable response\")"));
        assert!(!function_source.contains("serde_json::json!({\"error\": e.to_string()})"));
    }
}

/// POST /agent/tasks/:id/complete
/// Called by the runner to mark a task as completed with its result.
#[derive(serde::Deserialize)]
pub(super) struct TaskCompleteRequest {
    pub(super) result: Option<serde_json::Value>,
    #[serde(flatten)]
    pub(super) extra: std::collections::HashMap<String, serde_json::Value>,
}

pub(super) fn task_complete_result_payload(body: TaskCompleteRequest) -> Option<serde_json::Value> {
    if let Some(result) = body.result {
        return Some(result);
    }
    if body.extra.is_empty() {
        return None;
    }
    Some(serde_json::Value::Object(body.extra.into_iter().collect()))
}

pub(super) async fn agent_task_complete_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Path(task_id): axum::extract::Path<String>,
    Json(body): Json<TaskCompleteRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let task_snapshot = state
        .db
        .get_agent_task(&user.id, &task_id)
        .await
        .map_err(task_update_error_to_http)?;
    let result_payload = task_complete_result_payload(body);
    state
        .db
        .update_agent_task_status(
            &user.id,
            &task_id,
            crate::agent_template::TaskStatus::Completed.as_str(),
            result_payload.clone(),
            None,
        )
        .await
        .map_err(task_update_error_to_http)?;
    let _ = state
        .relay_tx
        .send(relay_fleet_update_payload(&task_id, "completed", &user.id));

    if let Some(thread_id) = task_snapshot
        .get("thread_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
    {
        let result_content = result_payload
            .clone()
            .unwrap_or_else(|| serde_json::json!({}));
        let result_summary = if let Some(text) = result_content
            .get("final_answer")
            .and_then(Value::as_str)
            .or_else(|| result_content.get("summary").and_then(Value::as_str))
            .or_else(|| result_content.get("text").and_then(Value::as_str))
        {
            text.to_string()
        } else {
            "Task completed successfully.".to_string()
        };
        let sender = task_snapshot
            .get("agent_instance_id")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(|value| format!("omnyid://runner/{value}"))
            .unwrap_or_else(|| format!("omnyid://runner/{task_id}"));

        if let Ok(msg) = new_server_message(
            sender,
            vec![],
            thread_id,
            "agent_result",
            serde_json::json!({
                "task_id": task_id,
                "status": "completed",
                "final_answer": result_summary,
                "result": result_content,
            }),
            vec![],
            vec![],
            vec![],
            vec![],
            true,
        ) {
            let _ = store_private_app_message(
                &state.db,
                &state.metrics,
                &state.relay_tx,
                &user.id,
                msg,
            )
            .await;
        }
    }
    Ok(Json(task_status_response_payload(&task_id, "completed")))
}

/// PATCH /agent/lora-confidence
#[derive(serde::Deserialize)]
pub(super) struct LoraConfidenceRequest {
    score: f64,
}

// ── LoRA confidence ────────────────────────────────────────────────────────────

pub(super) async fn lora_confidence_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<LoraConfidenceRequest>,
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
    let lora_active = state
        .db
        .update_lora_confidence(&user.id, &instance_id, body.score)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "score": body.score,
        "lora_active": lora_active,
        "message": if lora_active {
            "LoRA genome has taken over. soul.md and memory.md are now archived."
        } else {
            "LoRA confidence updated."
        }
    })))
}

// ── Public feed & social ──────────────────────────────────────────────────────

/// GET /feed/public
/// Rate-limited for unauthenticated callers (10 req/min per IP).
pub(super) async fn public_feed_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    // Stricter rate limit for unauthenticated access
    if authenticated_user(&state.db, &headers).await.is_err() {
        enforce_rate_limit(
            &state,
            public_rate_limit_key("public_feed", &headers),
            RateLimitPolicy {
                max_requests: 10,
                window: std::time::Duration::from_secs(60),
            },
        )
        .await?;
    }

    let limit: i64 = params
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(100);
    let before_id = params.get("before_id").map(String::as_str);
    let messages = state
        .db
        .list_public_messages(limit, before_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let count = messages.len();
    Ok(Json(serde_json::json!({"items": messages, "count": count})))
}

// ── Feed follow / engage routes ───────────────────────────────────────────────

/// GET /feed/search?q=&limit=
pub(super) async fn feed_search_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let q = params
        .get("q")
        .map(String::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if q.is_empty() {
        return Ok(Json(serde_json::json!({"agents": []})));
    }
    let limit: i64 = params
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(50);
    let agents = state
        .db
        .search_agents(&user.id, &q, limit)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"agents": agents})))
}

/// POST /feed/follow/{agent_id}
pub(super) async fn feed_follow_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(agent_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .follow_agent(&user.id, &agent_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /feed/follow/{agent_id}
pub(super) async fn feed_unfollow_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(agent_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .unfollow_agent(&user.id, &agent_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /feed/following
pub(super) async fn feed_following_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let follows = state
        .db
        .list_following(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"following": follows})))
}

#[derive(serde::Deserialize)]
pub(super) struct EngageRequest {
    message_id: String,
    #[serde(rename = "type")]
    engagement_type: String,
}

/// POST /feed/engage
pub(super) async fn feed_engage_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<EngageRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let valid_types = ["view", "share", "reply"];
    if !valid_types.contains(&body.engagement_type.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "type must be view, share, or reply".to_string(),
        ));
    }
    state
        .db
        .record_engagement(&user.id, &body.message_id, &body.engagement_type)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Agent encryption keys ─────────────────────────────────────────────────────

/// GET /agent/keys — returns the user's encryption key so the dashboard can decrypt AFP content locally.
/// This enables client-side E2EE: ciphertext lives on the server, plaintext only exists in the client's memory.
pub(super) async fn agent_keys_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    Err(super::agent_keys_not_implemented_error())
}
