/*
 * @module-id: rust.server.ui-decision-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;
use crate::memory_workspace::{MemoryWorkspaceScope, apply_workspace_scope_metadata};

fn style_decision_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/ui/decision", post(ui_decision_http))
}

pub(super) async fn ui_decision_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<UiDecisionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let session_record = state
        .db
        .get_agent_session_by_thread(&user.id, &body.thread_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let session_context = if let Some(session) = session_record {
        let request_id = if let Some(active_request_id) = session.active_request_id.clone() {
            Some(active_request_id)
        } else {
            state
                .db
                .list_session_requests(&user.id, &session.session_id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .into_iter()
                .find_map(|item| {
                    if matches!(
                        item.status.as_str(),
                        "waiting_for_approval" | "waiting_for_resume"
                    ) {
                        Some(item.request_id)
                    } else {
                        None
                    }
                })
        };
        request_id.map(|request_id| (session, request_id))
    } else {
        None
    };

    let workspace_scope = MemoryWorkspaceScope {
        memory_space: body.memory_space.clone(),
        author_mask: body.author_mask.clone(),
        author_type: body.author_type.clone(),
        author_id: body.author_id.clone(),
        is_human_authored: body.is_human_authored,
        human_only: body.human_only,
    };
    let mut decision_metadata = serde_json::Map::new();
    decision_metadata.insert(
        "origin".to_string(),
        serde_json::Value::String("workspace_ui_decision".to_string()),
    );
    apply_workspace_scope_metadata(&mut decision_metadata, Some(&workspace_scope));

    // Store as an AFP user_decision message in the thread so the running agent
    // can pick it up via its relay WebSocket subscription.
    let decision_msg = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: Ulid::new().to_string(),
        thread_id: body.thread_id.clone(),
        parent_id: None,
        from: user.id.clone(),
        to: body.agent_id.clone().map(|a| vec![a]).unwrap_or_default(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "user_decision".to_string(),
        kind: None,
        supertags: vec![],
        subtype: Some("decision_point".to_string()),
        content: serde_json::json!({
            "card_id":            body.card_id,
            "decision_point_id":  body.decision_point_id,
            "selected_option_id": body.selected_option_id,
            "decided_by":         user.id,
        }),
        metadata: Some(serde_json::Value::Object(decision_metadata)),
        views: vec![],
        typed_refs: vec![],
        attachments: vec![],
        references: vec![],
        encryption: None,
        signature: String::new(),
        store_in_relational: true,
        prev_hash: None,
    };

    let decision_message_id = decision_msg.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        decision_msg,
    )
    .await
    .map_err(status_to_http)?;

    if body.decision_point_id == "approval_gate" || body.decision_point_id == "clarification_gate" {
        let thread_messages =
            thread_messages_for_headers(&state.db, &headers, &body.thread_id).await?;
        let app_messages = thread_messages
            .into_iter()
            .map(proto_to_app)
            .collect::<Vec<_>>();
        if let Some(card_message) = app_messages.iter().find(|message| {
            message.r#type == "generative_card"
                && message.content.get("card_id").and_then(Value::as_str)
                    == Some(body.card_id.as_str())
        }) {
            let agent_preferences_value = state
                .db
                .get_agent_preferences(&user.id)
                .await
                .ok()
                .flatten();
            let execution_profile = resolve_execution_profile(
                None,
                card_message
                    .content
                    .get("optimization_mode")
                    .and_then(Value::as_str),
                agent_preferences_value.as_ref(),
            );
            let objective = card_message
                .content
                .get("query")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();

            let is_approval_confirm = body.selected_option_id == "confirm_orchestration";
            let clarification_instruction =
                clarification_option_instruction(&body.selected_option_id);
            let is_clarification_proceed = body.decision_point_id == "clarification_gate"
                && clarification_instruction.is_some();

            if (is_approval_confirm || is_clarification_proceed) && !objective.is_empty() {
                let resolved_llm =
                    super::llm_resolution::resolve_user_inference_backend(&state.db, &user.id)
                        .await
                        .map_err(internal_error)
                        .map_err(status_to_http)?
                        .ok_or_else(|| {
                            (
                                StatusCode::BAD_REQUEST,
                                "no usable LLM backend is configured".to_string(),
                            )
                        })?;
                let model = resolved_llm.model;
                let backend = resolved_llm.backend;
                let master_instance = state
                    .db
                    .get_master_agent_instance(&user.id)
                    .await
                    .map_err(internal_error)
                    .map_err(status_to_http)?
                    .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
                let lora_active = master_instance["lora_genome_active"]
                    .as_bool()
                    .unwrap_or(false);
                let agent_id = master_instance["agent_id"].as_str().map(str::to_string);
                let orchestration_objective = if body.decision_point_id == "clarification_gate" {
                    apply_clarification_context(&objective, &body.selected_option_id)
                } else {
                    objective.clone()
                };
                let orchestration_objective =
                    apply_workspace_reasoning_overlays(&orchestration_objective, &user.id);

                if let Some(agent_id_value) = agent_id.clone() {
                    if body.decision_point_id == "clarification_gate"
                        || body.decision_point_id == "approval_gate"
                    {
                        let (title, text, tone) = if body.decision_point_id == "clarification_gate"
                        {
                            clarification_option_summary(&body.selected_option_id)
                        } else {
                            approval_option_summary(&body.selected_option_id)
                        };
                        let text = style_decision_text(text, active_persona.as_ref());
                        let section_id = if body.decision_point_id == "clarification_gate" {
                            "clarification_gate"
                        } else {
                            "approval_gate"
                        };
                        let assumption_update = serde_json::json!({
                            "card_id": body.card_id,
                            "section": {
                                "id": section_id,
                                "type": "callout",
                                "order": 3,
                                "status": "complete",
                                "content": {
                                    "title": title,
                                    "text": text,
                                    "tone": tone,
                                }
                            }
                        });
                        if let Ok(msg) = new_server_message(
                            agent_id_value.clone(),
                            vec![],
                            body.thread_id.clone(),
                            "card_section_update",
                            assumption_update,
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

                    let update = serde_json::json!({
                        "card_id": body.card_id,
                        "section": {
                            "id": "progress",
                            "type": "progress",
                            "order": 1,
                            "status": "streaming",
                            "content": {
                                "text": style_decision_text(if body.decision_point_id == "clarification_gate" {
                                    clarification_option_progress_text(&body.selected_option_id)
                                } else {
                                    "Approval received. Starting orchestration now."
                                }, active_persona.as_ref()),
                                "pct": 25
                            }
                        }
                    });
                    if let Ok(msg) = new_server_message(
                        agent_id_value,
                        vec![],
                        body.thread_id.clone(),
                        "card_section_update",
                        update,
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

                if let Some((session_record, request_id)) = session_context.as_ref() {
                    let queued_requests = state
                        .db
                        .list_session_requests(&user.id, &session_record.session_id)
                        .await
                        .map_err(internal_error)
                        .map_err(status_to_http)?;
                    let queue_depth = queued_requests
                        .iter()
                        .filter(|item| item.status == "queued")
                        .count() as i64;
                    state
                        .db
                        .update_session_request_status(&user.id, request_id, "running", None, None)
                        .await
                        .map_err(internal_error)
                        .map_err(status_to_http)?;
                    state
                        .db
                        .update_agent_session_state(
                            &user.id,
                            &session_record.session_id,
                            "running",
                            queue_depth,
                            Some(request_id.as_str()),
                            None,
                        )
                        .await
                        .map_err(internal_error)
                        .map_err(status_to_http)?;
                    if let Ok(Some(updated)) = state
                        .db
                        .get_agent_session(&user.id, &session_record.session_id)
                        .await
                    {
                        emit_agent_session_message(&state, &user.id, &updated).await;
                    }
                }

                spawn_orchestration_run(
                    state.clone(),
                    user.id.clone(),
                    backend,
                    model,
                    orchestration_objective,
                    execution_profile,
                    lora_active,
                    body.thread_id.clone(),
                    body.card_id.clone(),
                    agent_id,
                    session_context.as_ref().map(|(session, request_id)| {
                        (session.session_id.clone(), request_id.clone())
                    }),
                );
            } else if body.selected_option_id == "cancel_orchestration"
                || body.selected_option_id == "cancel_for_clarification"
            {
                let master_instance = state
                    .db
                    .get_master_agent_instance(&user.id)
                    .await
                    .map_err(internal_error)
                    .map_err(status_to_http)?
                    .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
                if let Some(agent_id) = master_instance["agent_id"].as_str() {
                    if body.decision_point_id == "approval_gate" {
                        let (title, text, tone) = approval_option_summary(&body.selected_option_id);
                        let text = style_decision_text(text, active_persona.as_ref());
                        let approval_update = serde_json::json!({
                            "card_id": body.card_id,
                            "section": {
                                "id": "approval_gate",
                                "type": "callout",
                                "order": 3,
                                "status": "complete",
                                "content": {
                                    "title": title,
                                    "text": text,
                                    "tone": tone,
                                }
                            }
                        });
                        if let Ok(msg) = new_server_message(
                            agent_id.to_string(),
                            vec![],
                            body.thread_id.clone(),
                            "card_section_update",
                            approval_update,
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

                    let update = serde_json::json!({
                        "card_id": body.card_id,
                        "section": {
                            "id": "final",
                            "type": "final_answer",
                            "order": 4,
                            "status": "complete",
                            "content": {
                                "text": style_decision_text(if body.decision_point_id == "clarification_gate" {
                                    "Orchestration cancelled until a more specific objective is provided."
                                } else {
                                    "Orchestration cancelled before any external action was started."
                                }, active_persona.as_ref())
                            }
                        }
                    });
                    if let Ok(msg) = new_server_message(
                        agent_id.to_string(),
                        vec![],
                        body.thread_id.clone(),
                        "card_section_update",
                        update,
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

                if let Some((session_record, request_id)) = session_context.as_ref() {
                    state
                        .db
                        .update_session_request_status(
                            &user.id,
                            request_id,
                            "cancelled",
                            None,
                            None,
                        )
                        .await
                        .map_err(internal_error)
                        .map_err(status_to_http)?;
                    let queued_requests = state
                        .db
                        .list_session_requests(&user.id, &session_record.session_id)
                        .await
                        .map_err(internal_error)
                        .map_err(status_to_http)?;
                    let queue_depth = queued_requests
                        .iter()
                        .filter(|item| item.status == "queued")
                        .count() as i64;
                    state
                        .db
                        .update_agent_session_state(
                            &user.id,
                            &session_record.session_id,
                            if queue_depth > 0 { "queued" } else { "idle" },
                            queue_depth,
                            None,
                            None,
                        )
                        .await
                        .map_err(internal_error)
                        .map_err(status_to_http)?;
                    if let Ok(Some(updated)) = state
                        .db
                        .get_agent_session(&user.id, &session_record.session_id)
                        .await
                    {
                        emit_agent_session_message(&state, &user.id, &updated).await;
                    }
                    spawn_session_dispatcher(
                        state.clone(),
                        user.id.clone(),
                        session_record.session_id.clone(),
                    );
                }
            }
        }
    }

    Ok(Json(serde_json::json!({
        "success":    true,
        "message_id": decision_message_id,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_personas::AgentPersona;

    fn sample_persona() -> AgentPersona {
        AgentPersona {
            id: "persona_1".to_string(),
            owner_user_id: "user_1".to_string(),
            name: "Brief".to_string(),
            soul_md: "Keep visible wording concise.".to_string(),
            writing_style: "concise".to_string(),
            skills_json: serde_json::json!([]),
            lora_confidence_score: 0.0,
            lora_genome_active: false,
            is_active: true,
            created_at: "2026-08-26T00:00:00Z".to_string(),
            updated_at: "2026-08-26T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn ui_decision_request_accepts_optional_memory_scope_fields() {
        let parsed: UiDecisionRequest = serde_json::from_value(serde_json::json!({
            "card_id": "card_1",
            "decision_point_id": "dp_1",
            "selected_option_id": "opt_1",
            "thread_id": "thread_1",
            "memory_space": "work",
            "author_mask": "private",
            "author_type": "human",
            "author_id": "user_1",
            "human_only": true
        }))
        .expect("request should deserialize");

        assert_eq!(parsed.memory_space.as_deref(), Some("work"));
        assert_eq!(parsed.author_mask.as_deref(), Some("private"));
        assert_eq!(parsed.author_type.as_deref(), Some("human"));
        assert_eq!(parsed.author_id.as_deref(), Some("user_1"));
        assert_eq!(parsed.human_only, Some(true));
        assert_eq!(parsed.is_human_authored, None);
    }

    #[test]
    fn style_decision_text_uses_active_persona() {
        assert_eq!(
            style_decision_text(
                "Approval received. Starting orchestration now.",
                Some(&sample_persona())
            ),
            "Briefly: Approval received. Starting orchestration now."
        );
    }

    #[test]
    fn ui_decision_request_keeps_scope_optional() {
        let parsed: UiDecisionRequest = serde_json::from_value(serde_json::json!({
            "card_id": "card_1",
            "decision_point_id": "dp_1",
            "selected_option_id": "opt_1",
            "thread_id": "thread_1"
        }))
        .expect("request should deserialize");

        assert!(parsed.memory_space.is_none());
        assert!(parsed.author_mask.is_none());
        assert!(parsed.author_type.is_none());
        assert!(parsed.author_id.is_none());
        assert!(parsed.is_human_authored.is_none());
        assert!(parsed.human_only.is_none());
    }
}
