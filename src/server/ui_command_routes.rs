#![allow(clippy::too_many_lines)]
use std::sync::Arc;

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde_json::Value;
use ulid::Ulid;

use super::*;

mod fallback_search;
mod preview_intents;
#[cfg(test)]
mod tests;

fn style_user_facing_ui_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

fn style_ui_command_response(
    mut response: UiCommandResponse,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> UiCommandResponse {
    if let Some(persona) = active_persona {
        response.summary =
            crate::agent_personas::restyle_user_facing_text(&response.summary, persona);
        response.bullets = response
            .bullets
            .into_iter()
            .map(|bullet| crate::agent_personas::restyle_user_facing_text(&bullet, persona))
            .collect();
        if let Some(runner_draft) = response.runner_draft.as_mut() {
            runner_draft.title =
                crate::agent_personas::restyle_user_facing_text(&runner_draft.title, persona);
            runner_draft.content =
                crate::agent_personas::restyle_user_facing_text(&runner_draft.content, persona);
        }
    }
    response
}

fn command_router_system_prompt_with_skill_guidance(
    base_prompt: &str,
    reasoning_guidance: &[String],
) -> String {
    if reasoning_guidance.is_empty() {
        return base_prompt.to_string();
    }

    let guidance_lines = reasoning_guidance
        .iter()
        .map(|line| format!("- {line}"))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "{base_prompt}\n\n# Enabled workspace reasoning guidance\nApply the following user-selected reasoning guidance when classifying intent and shaping the structured response. These instructions refine reasoning style and do not override explicit user intent, safety rules, or tool boundaries.\n{guidance_lines}"
    )
}

// ── UI command / LLM router ───────────────────────────────────────────────────

pub(super) async fn ui_command_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<UiCommandRequest>,
) -> Result<Json<UiCommandResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("ui_command", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: std::time::Duration::from_secs(60),
        },
    )
    .await?;

    let engine = super::ui_command_router_core::normalize_search_engine(request.engine.as_deref());
    let trimmed_query = request.query.trim();
    if trimmed_query.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "query is required".to_string()));
    }

    // Try to resolve authenticated user (optional — unauthenticated callers still get fallback)
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let default_store_in_history = state
        .db
        .get_agent_preferences(&user.id)
        .await
        .ok()
        .flatten()
        .and_then(|value| {
            value
                .get("default_store_in_history")
                .and_then(Value::as_bool)
        })
        .unwrap_or(true);
    let store_in_history = request.store_in_history.unwrap_or(default_store_in_history);

    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .ok()
        .flatten();

    let base = super::ui_command_router_core::route_ui_command(
        trimmed_query,
        engine.clone(),
        deployment.as_ref(),
        request.active_file_id.as_deref(),
    );
    let finalize_response = |response| {
        super::ui_command_response_enricher::finalize_ui_command_response(
            trimmed_query,
            style_ui_command_response(response, active_persona.as_ref()),
        )
    };

    // For authenticated users with an LLM configured, use the model to classify
    // intent and act accordingly — tasks, research, notes, or orchestration.
    // Unauthenticated / no-LLM calls fall through to the keyword-based base result.
    if let Ok(Some(resolved_llm)) =
        super::llm_resolution::resolve_user_inference_backend(&state.db, &user.id).await
    {
        let backend_name = resolved_llm.backend_name;
        let model = resolved_llm.model;
        let backend = resolved_llm.backend;
        let backend_api_key = match &backend {
            crate::inference::InferenceBackend::Anthropic { api_key }
            | crate::inference::InferenceBackend::OpenAICompat { api_key, .. } => {
                Some(api_key.clone())
            }
            crate::inference::InferenceBackend::RunPod { api_key, .. } => Some(api_key.clone()),
            crate::inference::InferenceBackend::Ollama { .. } => None,
        };
        let orchestration_supported = matches!(
            &backend,
            crate::inference::InferenceBackend::Anthropic { .. }
                | crate::inference::InferenceBackend::RunPod { .. }
        );

        {
            // Single LLM call: classify intent AND generate structured content.
            // The shared prompt keeps this route aligned with the master-agent path.
            let base_system_prompt =
                crate::ui_command_intent_contract::COMMAND_ROUTER_SYSTEM_PROMPT;
            let system_prompt =
                match super::skill_capsule_routes::selected_reasoning_skill_guidance_for_user(
                    &user.id,
                ) {
                    Ok(guidance) => command_router_system_prompt_with_skill_guidance(
                        base_system_prompt,
                        &guidance,
                    ),
                    Err(_) => base_system_prompt.to_string(),
                };
            let infer_req = crate::inference::InferenceRequest {
                system: system_prompt,
                messages: vec![crate::inference::InferenceMessage {
                    role: "user".to_string(),
                    content: trimmed_query.to_string(),
                }],
                max_tokens: 900,
                temperature: 0.2,
            };

            let infer_result = crate::inference::dispatch_infer(&backend, &model, &infer_req).await;

            if let Ok(infer_resp) = infer_result {
                let raw = infer_resp.content.trim();

                if let Some(parsed_route) =
                    crate::intent_routing::parse_command_router_response(raw, trimmed_query)
                {
                    let crate::intent_routing::ParsedCommandRoute {
                        route,
                        payload: parsed,
                    } = parsed_route;
                    let route_meta = crate::intent_routing::route_metadata_json(&route);
                    let detected_intent = route.primary_intent.as_str();
                    let summary = parsed["summary"]
                        .as_str()
                        .unwrap_or(trimmed_query)
                        .to_string();
                    // preferred_view: the router may supply it, or fall back to intent mapping
                    let preferred_view = if route.preferred_view.is_empty() {
                        crate::ui_command_intent_contract::preferred_view_for_intent(
                            detected_intent,
                        )
                        .to_string()
                    } else {
                        route.preferred_view.clone()
                    };

                    // Get the master agent instance for AFP message authorship
                    let agent_id_opt = state
                        .db
                        .get_master_agent_instance(&user.id)
                        .await
                        .ok()
                        .flatten()
                        .and_then(|inst| inst["agent_id"].as_str().map(str::to_string));

                    if let Some(response) = preview_intents::preview_intent_response(
                        detected_intent,
                        &parsed,
                        trimmed_query,
                        &summary,
                        &preferred_view,
                        &engine,
                        &route_meta,
                    ) {
                        return Ok(Json(finalize_response(response)));
                    }

                    match detected_intent {
                        // ── Schedule / day-plan ──────────────────────────────────────────
                        "schedule" => {
                            let title = parsed["title"]
                                .as_str()
                                .unwrap_or("Scheduled plan")
                                .to_string();
                            let description =
                                parsed["description"].as_str().unwrap_or("").to_string();
                            // Persist as a high-priority task so the fleet view tracks it
                            let instance =
                                state.db.get_agent_instance(&user.id).await.ok().flatten();
                            if store_in_history {
                                if let (Some(inst), Some(agent_id)) =
                                    (instance, agent_id_opt.clone())
                                {
                                    let instance_id = inst["id"].as_str().unwrap_or("").to_string();
                                    let task = AgentTask::new(
                                        user.id.clone(),
                                        instance_id,
                                        title.clone(),
                                        TaskPriority::Normal,
                                    );
                                    let task_id = task.id.clone();
                                    let thread_id = task.thread_id.clone();
                                    let _ = state.db.create_agent_task(&task).await;
                                    // Store AFP message with draggable_calendar view so frontend renders the planner
                                    let slots = parsed["slots"].clone();
                                    let msg_content = serde_json::json!({
                                        "task_id": task_id,
                                        "title": title,
                                        "description": description,
                                        "status": "pending",
                                        "slots": slots,
                                    });
                                    let msg_views = vec![serde_json::json!({
                                        "format": "draggable_calendar",
                                        "content": {
                                            "title": title,
                                            "slots": slots,
                                            "pending_confirmation": true,
                                        },
                                        "priority": 10
                                    })];
                                    if let Ok(msg) = new_server_message(
                                        agent_id,
                                        vec![],
                                        thread_id,
                                        "schedule",
                                        msg_content,
                                        msg_views,
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
                            }
                            let bullets: Vec<String> = parsed["slots"]
                                .as_array()
                                .map(|arr| {
                                    arr.iter()
                                        .filter_map(|s| {
                                            let label = s["label"].as_str()?;
                                            let start = s["start_hour"].as_u64().unwrap_or(0);
                                            let dur = s["duration_hours"].as_f64().unwrap_or(1.0);
                                            Some(format!("{label} — {start:02}:00 ({dur}h)"))
                                        })
                                        .collect()
                                })
                                .unwrap_or_default();
                            let preview_events = parsed["slots"]
                                    .as_array()
                                    .cloned()
                                    .unwrap_or_default()
                                    .iter()
                                    .enumerate()
                                    .map(|(idx, slot)| {
                                        let start_hour = slot["start_hour"].as_u64().unwrap_or(9);
                                        let duration_hours =
                                            slot["duration_hours"].as_u64().unwrap_or(1).max(1);
                                        serde_json::json!({
                                            "id": format!("schedule-slot-{idx}"),
                                            "title": slot["label"].as_str().unwrap_or("Planned block"),
                                            "start": format!("2026-03-27T{start_hour:02}:00:00Z"),
                                            "end": format!("2026-03-27T{:02}:00:00Z", start_hour + duration_hours),
                                            "description": description,
                                            "status": "tentative",
                                        })
                                    })
                                    .collect::<Vec<_>>();
                            return Ok(Json(finalize_response(UiCommandResponse {
                                intent: "schedule".to_string(),
                                suggested_view: "calendar".to_string(),
                                preferred_view,
                                summary,
                                engine,
                                links: vec![],
                                runner_draft: None,
                                bullets,
                                card_id: None,
                                preview_message: Some(AFPMessage {
                                    protocol: "afp-v1".to_string(),
                                    id: format!("preview.schedule.{}", Ulid::new()),
                                    thread_id: format!("thread.preview.schedule.{}", Ulid::new()),
                                    parent_id: None,
                                    from: "omnyid://workspace/command-bar".to_string(),
                                    to: vec!["omnyid://workspace/user".to_string()],
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                    r#type: "schedule".to_string(),
                                    kind: None,
                                    supertags: vec![],
                                    subtype: Some("preview".to_string()),
                                    content: serde_json::json!({
                                        "title": title,
                                        "description": description,
                                        "events": preview_events,
                                    }),
                                    metadata: Some(serde_json::json!({
                                        "origin": "workspace_command_preview",
                                        "store": store_in_history,
                                        "intent_route": route_meta.clone(),
                                    })),
                                    signature: String::new(),
                                    encryption: None,
                                    views: vec![serde_json::json!({
                                        "format": "calendar",
                                        "priority": 100,
                                        "content": {
                                            "title": title,
                                            "events": preview_events,
                                        }
                                    })],
                                    references: vec![],
                                    typed_refs: vec![],
                                    attachments: vec![],
                                    store_in_relational: false,
                                    prev_hash: None,
                                }),
                                intent_route: Some(route_meta.clone()),
                                boundary: None,
                                execution_explanation: None,
                            })));
                        }

                        // ── Task creation ────────────────────────────────────────────────
                        "task" => {
                            let title = parsed["title"]
                                .as_str()
                                .unwrap_or(trimmed_query)
                                .to_string();
                            let description =
                                parsed["description"].as_str().unwrap_or("").to_string();
                            let priority_str = parsed["priority"].as_str().unwrap_or("normal");
                            let task_type = parsed["task_type"]
                                .as_str()
                                .unwrap_or("general")
                                .to_string();
                            let priority = TaskPriority::from_label(Some(priority_str));

                            // Get the primary (non-master) agent instance for task ownership
                            let instance =
                                state.db.get_agent_instance(&user.id).await.ok().flatten();
                            if store_in_history {
                                if let Some(inst) = instance {
                                    let instance_id = inst["id"].as_str().unwrap_or("").to_string();
                                    let task = AgentTask::new(
                                        user.id.clone(),
                                        instance_id,
                                        title.clone(),
                                        priority,
                                    );
                                    let task_id = task.id.clone();
                                    let thread_id = task.thread_id.clone();
                                    let _ = state.db.create_agent_task(&task).await;

                                    // Store AFP message with task_card view
                                    if let Some(agent_id) = agent_id_opt {
                                        let msg_content = serde_json::json!({
                                            "task_id": task_id,
                                            "title": title,
                                            "description": description,
                                            "priority": priority_str,
                                            "task_type": task_type,
                                            "status": "pending",
                                        });
                                        let msg_views = vec![serde_json::json!({
                                            "format": "task_card",
                                            "content": {
                                                "task_id": task_id,
                                                "title": title,
                                                "description": description,
                                                "priority": priority_str,
                                                "task_type": task_type,
                                                "status": "pending",
                                            },
                                            "priority": 10
                                        })];
                                        if let Ok(msg) = new_server_message(
                                            agent_id,
                                            vec![],
                                            thread_id,
                                            "task",
                                            msg_content,
                                            msg_views,
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
                                }
                            }

                            return Ok(Json(finalize_response(UiCommandResponse {
                                intent: "task".to_string(),
                                suggested_view: "search".to_string(),
                                preferred_view,
                                summary,
                                engine,
                                links: vec![],
                                runner_draft: None,
                                bullets: vec![],
                                card_id: None,
                                preview_message: Some(AFPMessage {
                                    protocol: "afp-v1".to_string(),
                                    id: format!("preview.task.{}", Ulid::new()),
                                    thread_id: format!("thread.preview.task.{}", Ulid::new()),
                                    parent_id: None,
                                    from: "omnyid://workspace/command-bar".to_string(),
                                    to: vec!["omnyid://workspace/user".to_string()],
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                    r#type: "task".to_string(),
                                    kind: None,
                                    supertags: vec![],
                                    subtype: Some("preview".to_string()),
                                    content: serde_json::json!({
                                        "title": title,
                                        "description": description,
                                        "priority": priority_str,
                                        "task_type": task_type,
                                        "status": "pending",
                                    }),
                                    metadata: Some(serde_json::json!({
                                        "origin": "workspace_command_preview",
                                        "store": store_in_history,
                                        "intent_route": route_meta.clone(),
                                    })),
                                    signature: String::new(),
                                    encryption: None,
                                    views: vec![serde_json::json!({
                                        "format": "task_card",
                                        "priority": 100,
                                        "content": {
                                            "title": title,
                                            "description": description,
                                            "priority": priority_str,
                                            "task_type": task_type,
                                            "status": "pending",
                                        }
                                    })],
                                    references: vec![],
                                    typed_refs: vec![],
                                    attachments: vec![],
                                    store_in_relational: false,
                                    prev_hash: None,
                                }),
                                intent_route: Some(route_meta.clone()),
                                boundary: None,
                                execution_explanation: None,
                            })));
                        }

                        // ── Note creation ────────────────────────────────────────────────
                        "note" => {
                            let title = parsed["title"].as_str().unwrap_or("Note").to_string();
                            let content = parsed["content"]
                                .as_str()
                                .unwrap_or(trimmed_query)
                                .to_string();

                            if store_in_history {
                                if let Some(agent_id) = agent_id_opt {
                                    let thread_id = Ulid::new().to_string();
                                    let msg_content =
                                        serde_json::json!({"title": title, "content": content});
                                    let msg_views = vec![serde_json::json!({
                                        "format": "canvas",
                                        "content": {"title": title, "body": content},
                                        "priority": 10
                                    })];
                                    if let Ok(msg) = new_server_message(
                                        agent_id,
                                        vec![],
                                        thread_id,
                                        "note",
                                        msg_content,
                                        msg_views,
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
                            }

                            return Ok(Json(finalize_response(UiCommandResponse {
                                intent: "note".to_string(),
                                suggested_view: "note".to_string(),
                                preferred_view,
                                summary,
                                engine,
                                links: vec![],
                                runner_draft: None,
                                bullets: vec![],
                                card_id: None,
                                preview_message: Some(AFPMessage {
                                    protocol: "afp-v1".to_string(),
                                    id: format!("preview.note.{}", Ulid::new()),
                                    thread_id: format!("thread.preview.note.{}", Ulid::new()),
                                    parent_id: None,
                                    from: "omnyid://workspace/command-bar".to_string(),
                                    to: vec!["omnyid://workspace/user".to_string()],
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                    r#type: "note".to_string(),
                                    kind: None,
                                    supertags: vec![],
                                    subtype: Some("preview".to_string()),
                                    content: serde_json::json!({
                                        "title": title,
                                        "blocks": [
                                            {"type": "paragraph", "text": content}
                                        ],
                                    }),
                                    metadata: Some(serde_json::json!({
                                        "origin": "workspace_command_preview",
                                        "store": store_in_history,
                                        "intent_route": route_meta.clone(),
                                    })),
                                    signature: String::new(),
                                    encryption: None,
                                    views: vec![serde_json::json!({
                                        "format": "canvas",
                                        "priority": 100,
                                        "content": {
                                            "title": title,
                                            "blocks": [
                                                {"type": "paragraph", "text": content}
                                            ],
                                        }
                                    })],
                                    references: vec![],
                                    typed_refs: vec![],
                                    attachments: vec![],
                                    store_in_relational: false,
                                    prev_hash: None,
                                }),
                                intent_route: Some(route_meta.clone()),
                                boundary: None,
                                execution_explanation: None,
                            })));
                        }

                        // ── Orchestration ────────────────────────────────────────────────
                        "orchestrate" => {
                            let objective = parsed["objective"]
                                .as_str()
                                .unwrap_or(trimmed_query)
                                .to_string();
                            let thread_id = format!("thread.orchestrate.{}", Ulid::new());
                            let card_id = format!("card.orchestrate.{}", Ulid::new());
                            let gate_raw = classify_orchestration_gate(&objective);

                            // Read the user's auto-approve preference from the agent instance.
                            // When auto_approve_workflows=true (default) and the gate is only
                            // Clarification (not Approval), we downgrade to Gate::None so the
                            // workflow runs immediately without a confirmation step.
                            // Gate::Approval (destructive / financial) always stays as Approval
                            // regardless of the preference — the inner ApprovalNode handles it.
                            let auto_approve = state
                                .db
                                .get_master_agent_instance(&user.id)
                                .await
                                .ok()
                                .flatten()
                                .and_then(|inst| inst["auto_approve_workflows"].as_bool())
                                .unwrap_or(true);

                            let gate =
                                if auto_approve && gate_raw == OrchestrationGate::Clarification {
                                    // Clarification-only objectives can auto-run; assumptions are
                                    // visible in the workflow_preview metadata on the card.
                                    OrchestrationGate::None
                                } else {
                                    gate_raw
                                };

                            // ── Generate + save a visual workflow draft from the objective ──
                            // This bridges the command bar and the workflow builder: every
                            // orchestration request now also creates a user-inspectable
                            // workflow graph.  The draft is saved immediately; for Approval
                            // and Clarification gates it becomes the pending workflow the
                            // user confirms before execution.
                            let described = workflow_builder_describe_draft(
                                &user.id,
                                &DescribeWorkflowRequest {
                                    intent: objective.clone(),
                                    base_workflow: None,
                                    preset_override: None,
                                    optimization_override: None,
                                    regeneration_mode: "new".to_string(),
                                    save_draft: false,
                                    branch_from_workflow_id: None,
                                    branch_from_event_id: None,
                                },
                            );
                            let workflow_preview = described.get("workflow").cloned();
                            let generated_workflow_id = workflow_preview
                                .as_ref()
                                .and_then(|w| w.get("workflow_id"))
                                .and_then(Value::as_str)
                                .map(str::to_string);
                            let generated_node_count = workflow_preview
                                .as_ref()
                                .and_then(|w| w.get("graph"))
                                .and_then(|g| g.get("nodes"))
                                .and_then(Value::as_array)
                                .map(|n| n.len())
                                .unwrap_or(0);
                            let generated_preset = workflow_preview
                                .as_ref()
                                .and_then(|w| w.get("graph"))
                                .and_then(|g| g.get("presets"))
                                .and_then(Value::as_array)
                                .and_then(|arr| arr.first())
                                .and_then(|p| p.get("preset_kind").or(p.get("kind")))
                                .and_then(Value::as_str)
                                .unwrap_or("research_assistant")
                                .to_string();

                            // Save as a named draft workflow so it appears in the builder
                            if let Some(wf_value) = workflow_preview.clone() {
                                if let Some(graph) = wf_value.get("graph").cloned() {
                                    let record = normalized_workflow_record(
                                        &user.id,
                                        SaveWorkflowRequest {
                                            graph,
                                            latest_ir: None,
                                            favorite: Some(false),
                                            archived: None,
                                        },
                                        None,
                                    );
                                    if let Ok(rec) = record {
                                        let _ = state.db.upsert_saved_workflow(&rec).await;
                                    }
                                }
                            }

                            let initial_summary = if gate == OrchestrationGate::Approval {
                                format!(
                                    "This orchestration may trigger external actions. Review the plan and confirm before OmnyID proceeds: {objective}"
                                )
                            } else if gate == OrchestrationGate::Clarification {
                                format!(
                                    "This objective is still a bit broad. Review the draft plan and decide whether OmnyID should proceed with best-effort assumptions: {objective}"
                                )
                            } else {
                                format!("Orchestrating: {objective}")
                            };
                            let initial_summary = style_user_facing_ui_text(
                                &initial_summary,
                                active_persona.as_ref(),
                            );
                            let preview_message = Some(orchestration_preview_message(
                                &objective,
                                &initial_summary,
                                &card_id,
                                &thread_id,
                                gate,
                                active_persona.as_ref(),
                            ));

                            if let Some(agent_id) = agent_id_opt.clone() {
                                let msg_content = serde_json::json!({
                                    "card_id": card_id,
                                    "query": objective,
                                    "status": "streaming",
                                    "optimization_mode": "balanced",
                                    "provider": "omnyid",
                                    "model": "",
                                    "intent_route": route_meta.clone(),
                                    "secondary_intents": route.secondary_intents.clone(),
                                    "gate": match gate {
                                        OrchestrationGate::None => "none",
                                        OrchestrationGate::Clarification => "clarification",
                                        OrchestrationGate::Approval => "approval",
                                    },
                                    // workflow_preview carries the generated draft so the
                                    // frontend can render a compact minimap + action buttons.
                                    "workflow_preview": {
                                        "workflow_id": generated_workflow_id,
                                        "preset_kind": generated_preset,
                                        "node_count": generated_node_count,
                                        "gate": match gate {
                                            OrchestrationGate::None => "none",
                                            OrchestrationGate::Clarification => "clarification",
                                            OrchestrationGate::Approval => "approval",
                                        },
                                        // auto_run: true means the frontend shows a "Running…"
                                        // spinner instead of an "Approve & Run" button.
                                        "auto_run": gate == OrchestrationGate::None && orchestration_supported,
                                    },
                                    "sections": orchestrate_card_sections(
                                        &initial_summary,
                                        &objective,
                                        gate,
                                        active_persona.as_ref(),
                                    ),
                                });
                                if let Ok(msg) = new_server_message(
                                    agent_id,
                                    vec![],
                                    thread_id.clone(),
                                    "generative_card",
                                    msg_content,
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
                            if gate == OrchestrationGate::None && orchestration_supported {
                                let lora_active = state
                                    .db
                                    .get_master_agent_instance(&user.id)
                                    .await
                                    .ok()
                                    .flatten()
                                    .and_then(|inst| inst["lora_genome_active"].as_bool())
                                    .unwrap_or(false);
                                spawn_orchestration_run(
                                    state.clone(),
                                    user.id.clone(),
                                    backend_api_key.clone().unwrap_or_default(),
                                    model.clone(),
                                    backend_name.clone(),
                                    objective.clone(),
                                    crate::response_queue_policy::AgentExecutionProfile::from_mode(
                                        "balanced",
                                    ),
                                    lora_active,
                                    thread_id.clone(),
                                    card_id.clone(),
                                    agent_id_opt.clone(),
                                    None,
                                );
                            }

                            return Ok(Json(finalize_response(UiCommandResponse {
                                intent: "orchestrate".to_string(),
                                suggested_view: "search".to_string(),
                                preferred_view:
                                    crate::ui_command_intent_contract::preferred_view_for_intent(
                                        "orchestrate",
                                    )
                                    .to_string(),
                                summary: initial_summary,
                                engine,
                                links: vec![],
                                runner_draft: None,
                                bullets: if gate == OrchestrationGate::Approval {
                                    vec![
                                                "A visual workflow has been generated — review it before OmnyID executes.".to_string(),
                                                "Approve the workflow to start execution, or open it in the builder to edit first.".to_string(),
                                            ]
                                } else if gate == OrchestrationGate::Clarification {
                                    vec![
                                                "A visual workflow draft has been generated with best-effort assumptions.".to_string(),
                                                "Confirm to run it as-is, or open it in the builder to adjust before execution.".to_string(),
                                            ]
                                } else {
                                    vec![
                                                "A visual workflow has been generated and is now running.".to_string(),
                                                "Results will appear in the agent feed — open the workflow to watch the execution trace.".to_string(),
                                            ]
                                },
                                card_id: Some(card_id),
                                preview_message,
                                intent_route: Some(route_meta.clone()),
                                boundary: Some(serde_json::json!({
                                    "gate": match gate {
                                        OrchestrationGate::None => "none",
                                        OrchestrationGate::Clarification => "clarification",
                                        OrchestrationGate::Approval => "approval",
                                    }
                                })),
                                execution_explanation: Some(serde_json::json!({
                                    "mode": route.execution_policy.mode,
                                    "requires_confirmation": route.requires_confirmation,
                                    "missing_slots": route.missing_slots,
                                })),
                            })));
                        }

                        // ── Web research — fetch real results, then LLM summarizes ──────────
                        _ => {
                            let search_query = parsed["query"]
                                .as_str()
                                .unwrap_or(trimmed_query)
                                .to_string();
                            let _ = agent_id_opt;

                            // Step 1: Fetch real web results from DuckDuckGo (free, no key needed)
                            let ddg_context =
                                super::ui_command_research::fetch_ddg_results(&search_query).await;
                            super::ui_command_research::record_duckduckgo_usage(
                                &state.db,
                                &user.id,
                                &search_query,
                                ddg_context.len(),
                            )
                            .await;

                            // Step 2: Second LLM call to summarize real results
                            let reasoning_guidance = super::skill_capsule_routes::selected_reasoning_skill_guidance_for_user(&user.id)
                                    .unwrap_or_default();
                            let (final_summary, bullets, links) = if ddg_context.is_empty() {
                                // No DDG results — fall back to LLM knowledge with disclaimer
                                let b: Vec<String> = parsed["bullets"]
                                    .as_array()
                                    .map(|arr| {
                                        arr.iter()
                                            .filter_map(|v| v.as_str().map(String::from))
                                            .collect()
                                    })
                                    .unwrap_or_default();
                                let s: Vec<Value> =
                                    parsed["sources"].as_array().cloned().unwrap_or_default();
                                let l: Vec<UiCommandLink> = s
                                    .iter()
                                    .filter_map(|src| {
                                        Some(UiCommandLink {
                                            title: src["title"].as_str()?.to_string(),
                                            url: src["url"].as_str()?.to_string(),
                                            kind: "source".to_string(),
                                            origin: Some("external".to_string()),
                                        })
                                    })
                                    .collect();
                                (
                                    format!(
                                        "{summary} (from agent knowledge — live web results unavailable)"
                                    ),
                                    b,
                                    l,
                                )
                            } else {
                                super::ui_command_research::summarize_search_results(
                                    &search_query,
                                    &ddg_context,
                                    &backend,
                                    &model,
                                    &reasoning_guidance,
                                )
                                .await
                            };

                            // Add direct search link always
                            let mut all_links = links;
                            all_links.push(UiCommandLink {
                                title: format!("Search: {search_query}"),
                                url: super::ui_command_router_core::search_engine_url(
                                    &engine,
                                    &search_query,
                                ),
                                kind: "search".to_string(),
                                origin: Some("external".to_string()),
                            });

                            return Ok(Json(finalize_response(UiCommandResponse {
                                intent: "web_research".to_string(),
                                suggested_view: "search".to_string(),
                                preferred_view: preferred_view.clone(),
                                summary: final_summary,
                                engine,
                                links: all_links,
                                runner_draft: None,
                                bullets,
                                card_id: None,
                                preview_message: None,
                                intent_route: Some(route_meta.clone()),
                                boundary: None,
                                execution_explanation: None,
                            })));
                        }
                    }
                }
            }
        }
    }

    // Browser AI path — authenticated user, no server LLM, but client sent a
    // pre-classified intent from Chrome Gemini Nano or Edge Phi.
    if let (Some(b_intent), Some(b_parsed)) = (&request.browser_intent, &request.browser_parsed) {
        if let Some(response) = super::ui_command_browser_fallback::handle_browser_classified_route(
            &state,
            &user,
            trimmed_query,
            &engine,
            store_in_history,
            b_intent,
            b_parsed,
        )
        .await
        {
            return Ok(Json(finalize_response(response)));
        }
    }

    // No LLM configured — still do a real DDG search for web_research queries.
    // Returns snippet-based bullets without LLM summarization.
    if let Some(response) =
        fallback_search::fallback_search_response(&state, &user.id, trimmed_query, &base).await
    {
        return Ok(Json(finalize_response(response)));
    }

    Ok(Json(finalize_response(base)))
}
