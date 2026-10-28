// @locs-version: 1.0
// @module-id: server.continuity-routes
// @primary-capability: continuity-http-routes
// @stability: beta

/// Continuity & Projection routes — Pillars A–D.
///
/// POST /agent/behavior-patterns/synthesize  — emit behavior_pattern AFP messages
/// POST /agent/state/synthesize              — emit state_synthesis AFP message
/// POST /agent/temporal-projections/generate — queue temporal_projection via orchestrate
/// POST /agent/projections/generate          — queue projection AFP messages via orchestrate
/// GET  /agent/continuity/summary            — return recent continuity messages for briefing bar
use super::*;
use crate::{
    agent_personas::resolve_active_persona_output_prompt,
    autonomy_policy::proactive_tier_for_requires_approval,
    behavioral_pattern_extractor::synthesize_behavior_patterns,
    field_engine_contract::{field_type_from_primary_or_summary, field_type_pressure_label},
    message::{
        AFP_TYPE_BEHAVIOR_PATTERN, AFP_TYPE_PROJECTION, AFP_TYPE_SYNTHESIS_INVALIDATION_EVENT,
        AFP_TYPE_TEMPORAL_PROJECTION,
    },
    prepared_context_packet::PreparedContextPacket,
    prepared_draft_packet::PreparedDraftPacket,
    projection_agent::build_projection_objective,
    simulator_loop::simulate_snapshot_projection_for_planning,
    state_snapshot::{AFP_TYPE_STATE_SNAPSHOT, StateSnapshotContent},
    state_synthesizer::{AFP_TYPE_STATE_SYNTHESIS, AfpStateSynthesisContent, synthesize_state},
    state_synthesizer_contract::SynthesizerToMasterHandoff,
    temporal_projection::build_temporal_projection_objective,
};
use sqlx::Row;

const CONTINUITY_ACTION_ITEM_LIMIT: usize = 3;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/agent/behavior-patterns/synthesize",
            post(behavior_patterns_synthesize_http),
        )
        .route("/agent/state/synthesize", post(state_synthesize_http))
        .route(
            "/agent/temporal-projections/generate",
            post(temporal_projection_generate_http),
        )
        .route(
            "/agent/projections/generate",
            post(projection_generate_http),
        )
        .route("/agent/continuity/summary", get(continuity_summary_http))
}

// ── A: Behavioral Pattern Extractor ──────────────────────────────────────────

async fn behavior_patterns_synthesize_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let patterns = synthesize_behavior_patterns(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "emitted": patterns.len(),
        "patterns": patterns,
    })))
}

// ── C: State Synthesizer ──────────────────────────────────────────────────────

async fn state_synthesize_http(
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
    let synthesis = synthesize_state(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(style_state_synthesis_response(
        synthesis,
        active_persona.as_ref(),
    )))
}

// ── B: Temporal Projection ────────────────────────────────────────────────────

#[derive(serde::Deserialize, Default)]
struct TemporalProjectionRequest {
    #[serde(default = "default_horizon")]
    horizon_days: u32,
}

fn default_horizon() -> u32 {
    7
}

async fn temporal_projection_generate_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<TemporalProjectionRequest>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    let horizon = body.map(|b| b.0.horizon_days).unwrap_or(7);

    let objective = build_temporal_projection_objective(&state.db, &user.id, horizon)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    // Fire via the standard orchestrate path — result arrives via SSE.
    let _ = api_fetch_internal(&state, &user.id, &objective).await;

    Ok(Json(serde_json::json!({
        "status": "queued",
        "horizon_days": horizon,
        "note": continuity_user_facing_text(
            "Temporal projection will arrive as a temporal_projection AFP message.",
            active_persona.as_ref(),
        ),
    })))
}

// ── D: Projection Agent ───────────────────────────────────────────────────────

async fn projection_generate_http(
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

    let objective = build_projection_objective(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let _ = api_fetch_internal(&state, &user.id, &objective).await;

    Ok(Json(serde_json::json!({
        "status": "queued",
        "note": continuity_user_facing_text(
            "Projection insights will arrive as projection AFP messages.",
            active_persona.as_ref(),
        ),
    })))
}

// ── Summary (all 4 types) ─────────────────────────────────────────────────────

async fn continuity_summary_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<ContinuitySummaryResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();

    let types = continuity_message_types();

    let messages = list_continuity_messages_by_type(&state.db, &user.id, types, 20)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let watcher_resolution_messages =
        list_continuity_messages_by_type(&state.db, &user.id, &["watcher_resolution_event"], 50)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;

    let state_summary =
        continuity_state_summary_with_watcher_resolutions(&messages, &watcher_resolution_messages);

    Ok(Json(build_continuity_summary_response_with_persona(
        messages,
        state_summary,
        active_persona.as_ref(),
    )))
}

// ── Internal orchestrate dispatch ─────────────────────────────────────────────

/// Fire-and-forget: run an LLM objective through the master orchestrator.
/// Results arrive as AFP messages on the relay SSE stream.
async fn api_fetch_internal(state: &Arc<AppState>, user_id: &str, objective: &str) {
    let state = state.clone();
    let objective = objective.to_string();
    let user_id = user_id.to_string();
    tokio::spawn(async move {
        let instance = match state.db.get_master_agent_instance(&user_id).await {
            Ok(Some(i)) => i,
            _ => {
                tracing::warn!(%user_id, "continuity: no master agent instance, skipping orchestrate");
                return;
            }
        };
        let resolved_llm = match super::llm_resolution::resolve_user_inference_backend(
            &state.db, &user_id,
        )
        .await
        {
            Ok(Some(config)) => config,
            _ => {
                tracing::warn!(%user_id, "continuity: no usable LLM config, skipping orchestrate");
                return;
            }
        };
        let instance_id = instance["id"].as_str().unwrap_or("").to_string();
        let soul_md = instance["soul_md"].as_str().unwrap_or("").to_string();
        let lora_active = instance["lora_genome_active"].as_bool().unwrap_or(false);
        let model = resolved_llm.model;
        let backend = resolved_llm.backend;
        let soul_opt = if soul_md.is_empty() {
            None
        } else {
            Some(soul_md.as_str())
        };
        let output_persona_prompt =
            match resolve_active_persona_output_prompt(&state.db, &user_id).await {
                Ok(prompt) => prompt,
                Err(error) => {
                    tracing::warn!(%user_id, ?error, "continuity: could not load active persona");
                    None
                }
            };
        let trace_context = continuity_trace_context_for_user(&state.db, &user_id)
            .await
            .ok()
            .flatten();
        let orchestrator =
            crate::master_orchestrator::MasterOrchestrator::new(instance_id, user_id.clone());
        match orchestrator
            .run_with_backend(
                &objective,
                &state.db,
                &backend,
                &model,
                soul_opt,
                output_persona_prompt.as_deref(),
                lora_active,
                Some(state.cost_oracle.as_ref()),
                trace_context.as_deref(),
            )
            .await
        {
            Ok(_) => tracing::info!(%user_id, "continuity objective completed"),
            Err(e) => tracing::warn!(%user_id, error = %e, "continuity objective failed"),
        }
    });
}

pub(super) async fn list_continuity_messages_by_type(
    db: &Db,
    user_id: &str,
    types: &[&str],
    limit: i64,
) -> Result<Vec<Value>, sqlx::Error> {
    let type_values: Vec<String> = types.iter().map(|t| (*t).to_string()).collect();
    let rows = sqlx::query(
        r#"
        SELECT id, thread_id, type, subtype, content, metadata, views, timestamp::text AS timestamp
        FROM messages
        WHERE type = ANY($1)
          AND (to_agents @> $2::jsonb OR from_agent = $3)
        ORDER BY timestamp DESC
        LIMIT $4
        "#,
    )
    .bind(&type_values)
    .bind(serde_json::json!([user_id]))
    .bind(user_id)
    .bind(limit)
    .fetch_all(&db.pool)
    .await?;

    let mut messages = Vec::with_capacity(rows.len());
    for row in rows {
        messages.push(serde_json::json!({
            "id": row.try_get::<String, _>("id")?,
            "thread_id": row.try_get::<String, _>("thread_id")?,
            "timestamp": row.try_get::<String, _>("timestamp")?,
            "type": row.try_get::<String, _>("type")?,
            "subtype": row.try_get::<Option<String>, _>("subtype")?.unwrap_or_default(),
            "content": row.try_get::<Value, _>("content")?,
            "metadata": row.try_get::<Option<Value>, _>("metadata")?.unwrap_or(Value::Null),
            "views": row.try_get::<Value, _>("views").unwrap_or(Value::Array(vec![])),
        }));
    }
    Ok(messages)
}

pub(super) async fn load_continuity_state_summary(
    db: &Db,
    user_id: &str,
    limit: i64,
) -> Result<DashboardContinuityStateResponse, sqlx::Error> {
    let continuity_messages =
        list_continuity_messages_by_type(db, user_id, continuity_message_types(), limit).await?;
    let watcher_resolution_messages =
        list_continuity_messages_by_type(db, user_id, &["watcher_resolution_event"], 50).await?;
    Ok(continuity_state_summary_with_watcher_resolutions(
        &continuity_messages,
        &watcher_resolution_messages,
    ))
}

pub(super) async fn continuity_trace_context_for_user(
    db: &Db,
    user_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let state = load_continuity_state_summary(db, user_id, 20).await?;
    Ok(continuity_trace_context_from_state_summary(&state))
}

pub(super) fn continuity_trace_context_from_state_summary(
    state: &DashboardContinuityStateResponse,
) -> Option<String> {
    let mut lines = Vec::new();
    let snapshot_packet_notes = state
        .latest_state_snapshot
        .as_ref()
        .and_then(continuity_state_snapshot_content)
        .map(continuity_prepared_packet_detail_lines)
        .unwrap_or_default();
    let fresh_planning_simulation = state.latest_state_snapshot.as_ref().and_then(|message| {
        match message.parsed_content.as_ref() {
            Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => {
                Some(simulate_snapshot_projection_for_planning(
                    message.id.clone(),
                    snapshot.clone(),
                    message.synthesizer_handoff.clone(),
                ))
            }
            _ => None,
        }
    });

    if let Some(handoff) = state.preferred_synthesizer_handoff.as_ref() {
        lines.push(format!(
            "Continuity handoff: surface={} confidence={} escalation_required={}.",
            handoff.surface_recommendation,
            handoff.confidence,
            if handoff.escalation_required {
                "yes"
            } else {
                "no"
            }
        ));

        if let Some(summary) = handoff
            .simulated_projection_summary
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            lines.push(format!("Simulator projection: {summary}"));
        }

        if let Some(count) = handoff.simulated_actionable_event_count {
            lines.push(format!("Simulator actionable events: {count}."));
        }

        if let Some(summary) = handoff
            .simulated_review_summary
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            lines.push(format!("Simulator review summary: {summary}"));
        }

        if let Some(count) = handoff.simulated_promotion_candidate_count {
            lines.push(format!("Simulator promotion candidates: {count}."));
        }

        let calibration_notes = handoff
            .simulated_calibration_notes
            .iter()
            .map(|item| item.trim().trim_end_matches('.').trim_end_matches(';'))
            .filter(|item| !item.is_empty())
            .take(3)
            .collect::<Vec<_>>();
        if !calibration_notes.is_empty() {
            lines.push(format!(
                "Simulator calibration notes: {}.",
                calibration_notes.join("; ")
            ));
        }

        let simulated_risks = handoff
            .simulated_projection_risks
            .iter()
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .take(3)
            .collect::<Vec<_>>();
        if !simulated_risks.is_empty() {
            lines.push(format!("Simulator risks: {}.", simulated_risks.join("; ")));
        }

        let simulated_opportunities = handoff
            .simulated_projection_opportunities
            .iter()
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .take(3)
            .collect::<Vec<_>>();
        if !simulated_opportunities.is_empty() {
            lines.push(format!(
                "Simulator opportunities: {}.",
                simulated_opportunities.join("; ")
            ));
        }

        if let Some(summary) = handoff
            .prepared_context_summary
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            lines.push(format!("Prepared context: {summary}"));
        }

        if let Some(summary) = handoff
            .prepared_draft_summary
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            lines.push(format!("Prepared draft: {summary}"));
        }

        for note in &snapshot_packet_notes {
            lines.push(note.clone());
        }

        let suggested_actions = handoff
            .suggested_next_actions
            .iter()
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .take(3)
            .collect::<Vec<_>>();
        if !suggested_actions.is_empty() {
            lines.push(format!(
                "Suggested next actions: {}.",
                suggested_actions.join("; ")
            ));
        }
    }

    if state.preferred_synthesizer_handoff.is_none() {
        for note in snapshot_packet_notes {
            lines.push(note);
        }
    }

    if let Some(simulation) = fresh_planning_simulation.as_ref() {
        let rollout = simulation.output.rollout.as_ref();
        lines.push(format!(
            "Planning projection: {}",
            simulation.output.trace_summary.summary.trim()
        ));
        if let Some(stage) = rollout
            .and_then(|rollout| (!rollout.rollout_stage.trim().is_empty()).then_some(rollout))
        {
            lines.push(format!(
                "Planning simulator policy: stage={} calibration={} promotions_enabled={}.",
                stage.rollout_stage,
                stage.calibration_mode,
                if stage.allow_promotion { "yes" } else { "no" }
            ));
        }
        let planning_risks = simulation
            .output
            .trace_summary
            .simulated_risks
            .iter()
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .take(3)
            .collect::<Vec<_>>();
        if !planning_risks.is_empty() {
            lines.push(format!("Planning risks: {}.", planning_risks.join("; ")));
        }
        let planning_opportunities = simulation
            .output
            .trace_summary
            .simulated_opportunities
            .iter()
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .take(3)
            .collect::<Vec<_>>();
        if !planning_opportunities.is_empty() {
            lines.push(format!(
                "Planning opportunities: {}.",
                planning_opportunities.join("; ")
            ));
        }
    }

    if let Some(brief) = state.preferred_state_brief.as_ref() {
        lines.push(format!(
            "Continuity priority: {} (source={}, decisions={}, critical_changes={}).",
            brief.title, brief.source_type, brief.decision_count, brief.critical_change_count
        ));
    }

    if lines.is_empty() {
        None
    } else {
        Some(lines.join("\n"))
    }
}

pub(super) fn continuity_state_snapshot_content(
    message: &DashboardContinuityMessage,
) -> Option<&StateSnapshotContent> {
    match message.parsed_content.as_ref() {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => Some(snapshot),
        _ => None,
    }
}

fn continuity_push_unique_line(lines: &mut Vec<String>, value: Option<String>) {
    let Some(value) = value.map(|item| item.trim().to_string()) else {
        return;
    };
    if value.is_empty() || lines.iter().any(|existing| existing == &value) {
        return;
    }
    lines.push(value);
}

fn continuity_humanize_token(value: &str) -> String {
    value.trim().replace('_', " ")
}

pub(super) fn continuity_prepared_packet_detail_lines(
    snapshot: &StateSnapshotContent,
) -> Vec<String> {
    let mut lines = Vec::new();

    if let Some(packet) = snapshot
        .prepared_context_packet
        .as_ref()
        .filter(|packet| packet.ready)
    {
        continuity_push_unique_line(
            &mut lines,
            (!packet.retrieval_mode.trim().is_empty()).then(|| {
                format!(
                    "Prepared context retrieval mode: {}.",
                    continuity_humanize_token(&packet.retrieval_mode)
                )
            }),
        );
        continuity_push_unique_line(
            &mut lines,
            packet
                .readiness_reason
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| format!("Prepared context readiness: {value}")),
        );
        continuity_push_unique_line(
            &mut lines,
            packet.deeper_retrieval_recommended.then(|| {
                "Prepared context remains metadata-first and recommends selective deeper retrieval if needed."
                    .to_string()
            }),
        );
    }

    if let Some(draft) = snapshot
        .prepared_draft_packet
        .as_ref()
        .filter(|packet| packet.ready)
        .and_then(|packet| packet.drafts.first())
    {
        continuity_push_unique_line(
            &mut lines,
            Some(format!(
                "Prepared draft lane: {} ({})",
                continuity_humanize_token(&draft.draft_class),
                continuity_humanize_token(&draft.readiness)
            )),
        );
        continuity_push_unique_line(
            &mut lines,
            draft
                .selection_reason
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| format!("Prepared draft selection: {value}")),
        );
        continuity_push_unique_line(
            &mut lines,
            draft
                .approval_required_to_send
                .then(|| "Prepared draft remains approval-gated before send.".to_string()),
        );
    }

    lines
}

fn build_continuity_summary_response(
    messages: Vec<Value>,
    state: DashboardContinuityStateResponse,
) -> ContinuitySummaryResponse {
    build_continuity_summary_response_with_persona(messages, state, None)
}

fn continuity_user_facing_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

fn style_state_synthesis_string_array(
    value: &mut Value,
    active_persona: &crate::agent_personas::AgentPersona,
) {
    if let Some(items) = value.as_array_mut() {
        for item in items {
            if let Some(text) = item.as_str() {
                *item = Value::String(crate::agent_personas::restyle_user_facing_text(
                    text,
                    active_persona,
                ));
            }
        }
    }
}

fn style_state_synthesis_value(
    value: &mut Value,
    active_persona: &crate::agent_personas::AgentPersona,
) {
    match value {
        Value::Object(map) => {
            for (key, nested) in map.iter_mut() {
                match key.as_str() {
                    "headline"
                    | "title"
                    | "summary"
                    | "description"
                    | "selection_reason"
                    | "why_surfaced"
                    | "readiness_reason"
                    | "prepared_draft_summary"
                    | "prepared_context_summary"
                    | "recommended_action"
                    | "reason"
                    | "note"
                    | "message"
                    | "suppression_reason"
                    | "escalation_reason" => {
                        if let Some(text) = nested.as_str() {
                            *nested =
                                Value::String(crate::agent_personas::restyle_user_facing_text(
                                    text,
                                    active_persona,
                                ));
                        }
                    }
                    "focus_items"
                    | "items"
                    | "suggested_actions"
                    | "confidence_notes"
                    | "prepared_draft_summary_lines" => {
                        style_state_synthesis_string_array(nested, active_persona);
                    }
                    _ => style_state_synthesis_value(nested, active_persona),
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                if item.is_object() {
                    style_state_synthesis_value(item, active_persona);
                }
            }
        }
        _ => {}
    }
}

pub(super) fn style_state_synthesis_response(
    mut synthesis: Value,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> Value {
    let Some(active_persona) = active_persona else {
        return synthesis;
    };

    style_state_synthesis_value(&mut synthesis, active_persona);

    if let Some(review) = synthesis
        .get("metadata")
        .and_then(|metadata| metadata.get("simulator_approval_review_preview"))
        .cloned()
    {
        synthesis["metadata"]["simulator_approval_review_preview"] =
            crate::server::approval_surfaces::style_approval_review_payload(
                review,
                Some(active_persona),
            );
    }

    synthesis
}

pub(super) fn style_continuity_priority_card(
    mut card: ContinuityPriorityCard,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> ContinuityPriorityCard {
    card.description = continuity_user_facing_text(&card.description, active_persona);
    card.selection_reason = card
        .selection_reason
        .as_deref()
        .map(|text| continuity_user_facing_text(text, active_persona));
    card.approval_or_reversibility_hint = card
        .approval_or_reversibility_hint
        .as_deref()
        .map(|text| continuity_user_facing_text(text, active_persona));
    card.provenance_cue = card
        .provenance_cue
        .as_deref()
        .map(|text| continuity_user_facing_text(text, active_persona));
    card.readiness_reason = card
        .readiness_reason
        .as_deref()
        .map(|text| continuity_user_facing_text(text, active_persona));
    card
}

pub(super) fn style_continuity_response_item(
    mut item: ContinuityResponseItem,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> ContinuityResponseItem {
    item.prepared_draft_summary = item
        .prepared_draft_summary
        .as_deref()
        .map(|text| continuity_user_facing_text(text, active_persona));
    item.prepared_draft_selection_reason = item
        .prepared_draft_selection_reason
        .as_deref()
        .map(|text| continuity_user_facing_text(text, active_persona));
    item.prepared_draft_lead_summary = item
        .prepared_draft_lead_summary
        .as_deref()
        .map(|text| continuity_user_facing_text(text, active_persona));
    item.prepared_draft_summary_lines = item
        .prepared_draft_summary_lines
        .into_iter()
        .map(|line| continuity_user_facing_text(&line, active_persona))
        .collect();
    item
}

pub(super) fn style_continuity_prepared_draft_item(
    mut item: ContinuityPreparedDraftItem,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> ContinuityPreparedDraftItem {
    item.summary = continuity_user_facing_text(&item.summary, active_persona);
    item.selection_reason = item
        .selection_reason
        .as_deref()
        .map(|text| continuity_user_facing_text(text, active_persona));
    item
}

pub(super) fn style_continuity_context_panel_item(
    mut item: ContinuityContextPanelItem,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> ContinuityContextPanelItem {
    item.why_surfaced = continuity_user_facing_text(&item.why_surfaced, active_persona);
    item
}

pub(super) fn style_continuity_context_pack_item(
    mut item: ContinuityPreparedContextPackItem,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> ContinuityPreparedContextPackItem {
    item.summary = continuity_user_facing_text(&item.summary, active_persona);
    item.why_surfaced = continuity_user_facing_text(&item.why_surfaced, active_persona);
    item.readiness_reason = item
        .readiness_reason
        .as_deref()
        .map(|text| continuity_user_facing_text(text, active_persona));
    item
}

pub(super) fn style_dashboard_continuity_state_response(
    mut state: DashboardContinuityStateResponse,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> DashboardContinuityStateResponse {
    state.preferred_priority_card = state
        .preferred_priority_card
        .map(|card| style_continuity_priority_card(card, active_persona));
    state.preferred_action_overflow_summary = state
        .preferred_action_overflow_summary
        .as_deref()
        .map(|text| continuity_user_facing_text(text, active_persona));
    state.preferred_response_items = state
        .preferred_response_items
        .into_iter()
        .map(|item| style_continuity_response_item(item, active_persona))
        .collect();
    state.preferred_prepared_draft_items = state
        .preferred_prepared_draft_items
        .into_iter()
        .map(|item| style_continuity_prepared_draft_item(item, active_persona))
        .collect();
    state.preferred_context_panel_items = state
        .preferred_context_panel_items
        .into_iter()
        .map(|item| style_continuity_context_panel_item(item, active_persona))
        .collect();
    state.preferred_context_pack_items = state
        .preferred_context_pack_items
        .into_iter()
        .map(|item| style_continuity_context_pack_item(item, active_persona))
        .collect();
    state
}

fn build_continuity_summary_response_with_persona(
    messages: Vec<Value>,
    state: DashboardContinuityStateResponse,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> ContinuitySummaryResponse {
    let state = style_dashboard_continuity_state_response(state, active_persona);
    ContinuitySummaryResponse {
        messages,
        latest_state_snapshot_ref: state.latest_state_snapshot_ref.clone(),
        preferred_state_brief: state.preferred_state_brief.clone(),
        preferred_synthesizer_handoff: state.preferred_synthesizer_handoff.clone(),
        preferred_priority_item: state.preferred_priority_item.clone(),
        preferred_priority_card: state.preferred_priority_card.clone(),
        preferred_action_items: state.preferred_action_items.clone(),
        preferred_action_overflow_count: state.preferred_action_overflow_count,
        preferred_action_overflow_summary: state.preferred_action_overflow_summary.clone(),
        preferred_response_items: state.preferred_response_items.clone(),
        preferred_prepared_draft_items: state.preferred_prepared_draft_items.clone(),
        preferred_context_panel_items: state.preferred_context_panel_items.clone(),
        preferred_context_pack_items: state.preferred_context_pack_items.clone(),
        preferred_state_fields: state.preferred_state_fields.clone(),
        state,
    }
}

pub(super) fn continuity_message_types() -> &'static [&'static str] {
    &[
        AFP_TYPE_BEHAVIOR_PATTERN,
        AFP_TYPE_TEMPORAL_PROJECTION,
        AFP_TYPE_STATE_SYNTHESIS,
        AFP_TYPE_STATE_SNAPSHOT,
        AFP_TYPE_SYNTHESIS_INVALIDATION_EVENT,
        AFP_TYPE_PROJECTION,
    ]
}

pub(super) fn continuity_state_summary(messages: &[Value]) -> DashboardContinuityStateResponse {
    continuity_state_summary_with_watcher_resolutions(messages, &[])
}

fn continuity_state_summary_with_watcher_resolutions(
    messages: &[Value],
    watcher_resolution_messages: &[Value],
) -> DashboardContinuityStateResponse {
    let latest_snapshot = latest_message_of_type(messages, AFP_TYPE_STATE_SNAPSHOT);
    let latest_synthesis = latest_message_of_type(messages, AFP_TYPE_STATE_SYNTHESIS);
    let resolved_watcher_ids = continuity_resolved_watcher_message_ids(watcher_resolution_messages);
    let latest_state_snapshot = latest_snapshot
        .map(compact_continuity_message)
        .map(|message| {
            apply_watcher_resolutions_to_continuity_state(message, &resolved_watcher_ids)
        });
    let latest_state_synthesis = latest_synthesis.map(compact_continuity_message);
    let preferred_state = latest_state_snapshot
        .clone()
        .or_else(|| latest_state_synthesis.clone());
    let preferred_state_brief = continuity_brief_from_state(preferred_state.as_ref());
    let preferred_synthesizer_handoff = preferred_state
        .as_ref()
        .and_then(|message| message.synthesizer_handoff.clone());
    let continuity_surface_hint = preferred_synthesizer_handoff
        .as_ref()
        .map(|handoff| handoff.surface_recommendation.as_str());
    let continuity_requires_approval = preferred_synthesizer_handoff
        .as_ref()
        .map(|handoff| handoff.escalation_required)
        .unwrap_or(false);
    let preferred_action_items = continuity_action_items(
        preferred_state.as_ref(),
        preferred_state_brief.as_ref(),
        preferred_synthesizer_handoff.as_ref(),
    );
    let preferred_action_overflow_count = continuity_action_item_overflow_count(
        preferred_state.as_ref(),
        preferred_synthesizer_handoff.as_ref(),
    );
    let preferred_action_overflow_summary = continuity_action_item_overflow_summary(
        preferred_state.as_ref(),
        preferred_synthesizer_handoff.as_ref(),
        preferred_action_overflow_count,
    );
    let preferred_response_items = continuity_response_items(preferred_state.as_ref());
    let preferred_prepared_draft_items = continuity_prepared_draft_items(preferred_state.as_ref());
    let preferred_context_panel_items = continuity_context_panel_items(preferred_state.as_ref());
    let preferred_context_pack_items = continuity_context_pack_items(preferred_state.as_ref());
    let preferred_state_fields = continuity_state_fields(preferred_state.as_ref());
    let preferred_panel_kind =
        continuity_panel_kind(continuity_surface_hint, continuity_requires_approval);
    let preferred_priority_item = continuity_priority_item(
        preferred_state.as_ref(),
        preferred_state_brief.as_ref(),
        preferred_synthesizer_handoff.as_ref(),
        preferred_panel_kind,
        &preferred_action_items,
        &preferred_response_items,
        &preferred_prepared_draft_items,
        &preferred_context_pack_items,
    );

    DashboardContinuityStateResponse {
        latest_state_snapshot_ref: latest_snapshot
            .and_then(|m| m["id"].as_str())
            .map(str::to_string),
        latest_state_synthesis_ref: latest_synthesis
            .and_then(|m| m["id"].as_str())
            .map(str::to_string),
        latest_state_snapshot,
        latest_state_synthesis,
        preferred_state_type: if latest_snapshot.is_some() {
            AFP_TYPE_STATE_SNAPSHOT
        } else if latest_synthesis.is_some() {
            AFP_TYPE_STATE_SYNTHESIS
        } else {
            "none"
        }
        .to_string(),
        preferred_state_brief: preferred_state_brief.clone(),
        preferred_synthesizer_handoff: preferred_synthesizer_handoff.clone(),
        preferred_priority_item: preferred_priority_item.clone(),
        preferred_priority_card: continuity_priority_card(
            preferred_priority_item.as_ref(),
            preferred_state.as_ref(),
        ),
        preferred_action_items,
        preferred_action_overflow_count,
        preferred_action_overflow_summary,
        preferred_response_items,
        preferred_prepared_draft_items,
        preferred_context_panel_items,
        preferred_context_pack_items,
        preferred_state_fields,
    }
}

fn continuity_resolved_watcher_message_ids(
    messages: &[Value],
) -> std::collections::HashSet<String> {
    messages
        .iter()
        .filter(|message| message["type"].as_str() == Some("watcher_resolution_event"))
        .filter_map(|message| {
            message["content"]["resolved_message_id"]
                .as_str()
                .map(str::to_string)
        })
        .collect()
}

fn apply_watcher_resolutions_to_continuity_state(
    mut state: DashboardContinuityMessage,
    resolved_watcher_ids: &std::collections::HashSet<String>,
) -> DashboardContinuityMessage {
    if resolved_watcher_ids.is_empty() {
        return state;
    }

    let Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) =
        state.parsed_content.as_mut()
    else {
        return state;
    };

    snapshot.watcher_signals.retain(|signal| {
        !resolved_watcher_ids.contains(&signal.id)
            && !signal
                .source_refs
                .iter()
                .any(|reference| resolved_watcher_ids.contains(reference))
    });
    snapshot.continuity_metrics =
        continuity_metrics_after_watcher_resolution(snapshot, &snapshot.watcher_signals);
    state.content = serde_json::to_value(snapshot.clone()).unwrap_or(Value::Null);
    state
}

fn continuity_metrics_after_watcher_resolution(
    snapshot: &StateSnapshotContent,
    watcher_signals: &[crate::state_snapshot::StateSnapshotWatcherSignal],
) -> crate::state_snapshot::StateSnapshotContinuityMetrics {
    fn normalize_score(raw: f64, ceiling: f64) -> f64 {
        if ceiling <= 0.0 {
            return 0.0;
        }
        (raw / ceiling).clamp(0.0, 1.0)
    }

    let actionable_watcher_signals = watcher_signals
        .iter()
        .filter(|signal| signal.suppression_status != "suppressed")
        .collect::<Vec<_>>();
    let fresh_signal_count = actionable_watcher_signals
        .iter()
        .filter(|signal| signal.freshness == "fresh")
        .count() as u32;
    let mut fresh_by_category = std::collections::HashMap::<&str, u32>::new();
    for signal in actionable_watcher_signals
        .iter()
        .filter(|signal| signal.freshness == "fresh")
    {
        *fresh_by_category
            .entry(signal.category.as_str())
            .or_insert(0) += 1;
    }
    let burst_signal_count = fresh_by_category
        .values()
        .filter(|count| **count >= 2)
        .sum();
    let urgent_signals = actionable_watcher_signals
        .iter()
        .filter(|signal| matches!(signal.urgency.as_str(), "urgent" | "important" | "today"))
        .count() as f64;
    let fresh_signals = fresh_signal_count as f64;
    let recent_signal_count = actionable_watcher_signals.len() as f64;
    let unique_categories = actionable_watcher_signals
        .iter()
        .map(|signal| signal.category.as_str())
        .collect::<std::collections::HashSet<_>>()
        .len() as f64;
    let unique_threads = actionable_watcher_signals
        .iter()
        .map(|signal| signal.thread_id.as_str())
        .filter(|thread_id| !thread_id.is_empty())
        .collect::<std::collections::HashSet<_>>()
        .len() as f64;
    let queue_pressure_raw = snapshot.decision_queue.len() as f64 * 1.0
        + snapshot.response_queue.len() as f64 * 0.8
        + snapshot.context_panel_items.len() as f64 * 0.35;

    crate::state_snapshot::StateSnapshotContinuityMetrics {
        recent_signal_count: actionable_watcher_signals.len() as u32,
        fresh_signal_count,
        burst_signal_count,
        reactivation_signal_count: actionable_watcher_signals
            .iter()
            .filter(|signal| {
                signal.source_subtype.contains("idle")
                    || signal.source_subtype.contains("reactivat")
            })
            .count() as u32,
        deadline_signal_count: actionable_watcher_signals
            .iter()
            .filter(|signal| {
                signal.source_subtype.contains("deadline")
                    || signal.source_subtype.contains("appointment")
                    || signal.source_subtype.contains("starting_soon")
            })
            .count() as u32,
        activity_velocity: normalize_score(
            0.55 * recent_signal_count + 0.45 * fresh_signals + burst_signal_count as f64 * 0.25,
            6.0,
        ),
        urgency_acceleration: normalize_score(
            urgent_signals + (fresh_signals * 0.8) + (burst_signal_count as f64 * 0.5),
            5.0,
        ),
        context_switch_rate: normalize_score(unique_categories + (unique_threads * 0.7), 6.0),
        unresolved_queue_pressure: normalize_score(queue_pressure_raw, 7.5),
        follow_up_drift_score: normalize_score(
            actionable_watcher_signals
                .iter()
                .filter(|signal| {
                    signal.source_subtype.contains("idle")
                        || signal.source_subtype.contains("reactivat")
                })
                .count() as f64
                + snapshot.response_queue.len() as f64 * 0.8
                + actionable_watcher_signals
                    .iter()
                    .filter(|signal| {
                        signal.source_subtype.contains("deadline")
                            || signal.source_subtype.contains("appointment")
                            || signal.source_subtype.contains("starting_soon")
                    })
                    .count() as f64
                    * 0.3,
            5.0,
        ),
    }
}

pub(super) fn preferred_continuity_state_message(
    summary: &DashboardContinuityStateResponse,
) -> Option<DashboardContinuityMessage> {
    summary
        .latest_state_snapshot
        .clone()
        .or_else(|| summary.latest_state_synthesis.clone())
}

pub(super) fn continuity_panel_kind(
    surface_hint: Option<&str>,
    requires_approval: bool,
) -> &'static str {
    if requires_approval {
        return "approval_queue";
    }

    match surface_hint {
        Some("decision_queue") => "decision_queue",
        Some("response_queue") => "response_queue",
        Some("context_panel") => "context_panel",
        _ => "briefing_bar",
    }
}

pub(super) fn continuity_priority_item(
    preferred_state: Option<&DashboardContinuityMessage>,
    brief: Option<&DashboardContinuityBrief>,
    handoff: Option<&SynthesizerToMasterHandoff>,
    panel_kind: &str,
    action_items: &[ContinuityActionItem],
    response_items: &[ContinuityResponseItem],
    prepared_draft_items: &[ContinuityPreparedDraftItem],
    context_pack_items: &[ContinuityPreparedContextPackItem],
) -> Option<ContinuityPriorityItem> {
    if panel_kind == "briefing_bar" {
        return None;
    }
    if panel_kind == "response_queue"
        && watcher_context_is_cooled_down(preferred_state)
        && prepared_draft_items.is_empty()
        && response_items
            .iter()
            .all(|item| !item.prepared_draft_available && item.prepared_draft_id.is_none())
    {
        return None;
    }

    let action_intent = continuity_priority_action_intent(brief, handoff);
    let preferred_prepared_draft = if panel_kind == "response_queue" {
        continuity_priority_preferred_prepared_draft(
            action_intent,
            response_items,
            prepared_draft_items,
            preferred_state,
        )
    } else {
        None
    };
    let effective_panel_kind = continuity_priority_effective_panel_kind(
        panel_kind,
        preferred_prepared_draft,
        response_items,
    );
    let title = continuity_priority_title(
        &effective_panel_kind,
        brief,
        handoff,
        response_items,
        prepared_draft_items,
        preferred_prepared_draft,
        context_pack_items,
    )
    .unwrap_or_else(|| "Review continuity state".to_string());
    let (prepared_draft_class, selection_reason) = continuity_priority_selection_context(
        panel_kind,
        preferred_state,
        handoff,
        response_items,
        prepared_draft_items,
        preferred_prepared_draft,
        context_pack_items,
    );
    let source_refs = continuity_priority_source_refs(
        &effective_panel_kind,
        action_items,
        response_items,
        prepared_draft_items,
        context_pack_items,
        preferred_prepared_draft,
    );
    let scope = continuity_priority_scope(
        &effective_panel_kind,
        preferred_prepared_draft,
        context_pack_items,
    );
    let surface_hint = continuity_priority_surface_hint(
        handoff,
        panel_kind,
        &effective_panel_kind,
        preferred_prepared_draft,
    );

    Some(ContinuityPriorityItem {
        title,
        panel_kind: effective_panel_kind,
        requires_approval: handoff
            .map(|handoff| handoff.escalation_required)
            .unwrap_or(false),
        surface_hint,
        suggested_action: action_intent.map(str::to_string),
        confidence: handoff.map(|handoff| handoff.confidence.clone()),
        prepared_draft_class,
        selection_reason,
        source_refs,
        memory_space: scope.memory_space,
        author_mask: scope.author_mask,
        author_type: scope.author_type,
        author_id: scope.author_id,
        is_human_authored: scope.is_human_authored,
        human_only: scope.human_only,
    })
}

fn continuity_priority_effective_panel_kind(
    panel_kind: &str,
    preferred_prepared_draft: Option<&ContinuityPreparedDraftItem>,
    response_items: &[ContinuityResponseItem],
) -> String {
    if panel_kind == "approval_queue" {
        return panel_kind.to_string();
    }

    preferred_prepared_draft
        .map(|draft| continuity_prepared_draft_destination_view(&draft.draft_class).to_string())
        .or_else(|| {
            response_items.first().and_then(|item| {
                item.prepared_draft_class.as_deref().map(|draft_class| {
                    continuity_prepared_draft_destination_view(draft_class).to_string()
                })
            })
        })
        .unwrap_or_else(|| panel_kind.to_string())
}

fn continuity_priority_surface_hint(
    handoff: Option<&SynthesizerToMasterHandoff>,
    original_panel_kind: &str,
    effective_panel_kind: &str,
    preferred_prepared_draft: Option<&ContinuityPreparedDraftItem>,
) -> Option<String> {
    if let Some(handoff) = handoff {
        if preferred_prepared_draft.is_some()
            || handoff.surface_recommendation != effective_panel_kind
        {
            return Some(effective_panel_kind.to_string());
        }
        return Some(handoff.surface_recommendation.clone());
    }

    if original_panel_kind != effective_panel_kind {
        Some(effective_panel_kind.to_string())
    } else {
        None
    }
}

fn continuity_priority_action_intent<'a>(
    brief: Option<&'a DashboardContinuityBrief>,
    handoff: Option<&'a SynthesizerToMasterHandoff>,
) -> Option<&'a str> {
    handoff
        .and_then(|handoff| handoff.suggested_next_actions.first().map(String::as_str))
        .or_else(|| brief.and_then(|brief| brief.suggested_actions.first().map(String::as_str)))
}

fn continuity_priority_preferred_prepared_draft<'a>(
    action_intent: Option<&str>,
    response_items: &[ContinuityResponseItem],
    prepared_draft_items: &'a [ContinuityPreparedDraftItem],
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Option<&'a ContinuityPreparedDraftItem> {
    let action_intent = action_intent?;
    let aligned_prepared_draft = prepared_draft_items
        .iter()
        .filter(|item| suggested_actions_align(&item.suggested_action, action_intent))
        .min_by_key(|item| {
            crate::server::continuity_ranking_helpers::continuity_prepared_draft_alignment_rank(
                item.memory_space.as_deref(),
                item.author_mask.as_deref(),
                item.author_type.as_deref(),
                item.author_id.as_deref(),
                item.is_human_authored,
                item.human_only,
                &item.response_due_hint,
                continuity_prepared_draft_file_rank(item, preferred_state),
                &item.source_refs,
                &item.draft_class,
                item.selection_reason.as_deref(),
            )
        })?;
    let response_aligned = response_items
        .first()
        .map(|item| suggested_actions_align(&item.suggested_action, action_intent))
        .unwrap_or(false);
    if response_aligned {
        None
    } else {
        Some(aligned_prepared_draft)
    }
}

fn continuity_prepared_draft_scope_rank(item: &ContinuityPreparedDraftItem) -> u8 {
    crate::server::continuity_ranking_helpers::prepared_draft_scope_rank(
        item.memory_space.as_deref(),
        item.author_mask.as_deref(),
        item.author_type.as_deref(),
        item.author_id.as_deref(),
        item.is_human_authored,
        item.human_only,
    )
}

fn continuity_prepared_draft_timing_rank(response_due_hint: &str) -> u8 {
    crate::server::continuity_ranking_helpers::prepared_draft_timing_rank(response_due_hint)
}

fn continuity_prepared_draft_value_rank(item: &ContinuityPreparedDraftItem) -> u8 {
    crate::server::continuity_ranking_helpers::prepared_draft_value_rank(
        &item.draft_class,
        item.selection_reason.as_deref(),
    )
}

fn continuity_prepared_draft_file_rank(
    item: &ContinuityPreparedDraftItem,
    preferred_state: Option<&DashboardContinuityMessage>,
) -> u8 {
    let Some(preferred_packet) = preferred_state.and_then(continuity_prepared_context_packet)
    else {
        return crate::server::continuity_ranking_helpers::source_refs_alignment_rank(
            &item.source_refs,
            None,
        );
    };
    crate::server::continuity_ranking_helpers::source_refs_alignment_rank(
        &item.source_refs,
        Some(preferred_packet.source_refs.as_slice()),
    )
}

fn continuity_prepared_draft_evidence_rank(item: &ContinuityPreparedDraftItem) -> u8 {
    crate::server::continuity_ranking_helpers::source_refs_evidence_rank(&item.source_refs)
}

fn continuity_context_pack_scope_rank(item: &ContinuityPreparedContextPackItem) -> u8 {
    crate::server::continuity_ranking_helpers::context_pack_scope_rank(
        item.memory_space.as_deref(),
        item.author_mask.as_deref(),
        item.author_type.as_deref(),
        item.author_id.as_deref(),
        item.is_human_authored,
        item.human_only,
    )
}

fn continuity_context_pack_file_rank(item: &ContinuityPreparedContextPackItem) -> u8 {
    crate::server::continuity_ranking_helpers::context_pack_file_rank(
        &item.file_refs,
        &item.file_labels,
    )
}

fn continuity_context_pack_evidence_rank(item: &ContinuityPreparedContextPackItem) -> u8 {
    crate::server::continuity_ranking_helpers::source_refs_evidence_rank(&item.source_refs)
}

#[derive(Clone, Default)]
struct ContinuityPriorityScope {
    memory_space: Option<String>,
    author_mask: Option<String>,
    author_type: Option<String>,
    author_id: Option<String>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
}

fn continuity_priority_scope(
    panel_kind: &str,
    preferred_prepared_draft: Option<&ContinuityPreparedDraftItem>,
    context_pack_items: &[ContinuityPreparedContextPackItem],
) -> ContinuityPriorityScope {
    if panel_kind != "context_panel" {
        if let Some(item) = preferred_prepared_draft {
            return ContinuityPriorityScope {
                memory_space: item.memory_space.clone(),
                author_mask: item.author_mask.clone(),
                author_type: item.author_type.clone(),
                author_id: item.author_id.clone(),
                is_human_authored: item.is_human_authored,
                human_only: item.human_only,
            };
        }
    }

    if panel_kind == "context_panel" {
        if let Some(item) = context_pack_items.first() {
            return ContinuityPriorityScope {
                memory_space: item.memory_space.clone(),
                author_mask: item.author_mask.clone(),
                author_type: item.author_type.clone(),
                author_id: item.author_id.clone(),
                is_human_authored: item.is_human_authored,
                human_only: item.human_only,
            };
        }
    }

    ContinuityPriorityScope::default()
}

fn suggested_actions_align(left: &str, right: &str) -> bool {
    let normalized_left = left.trim().to_ascii_lowercase();
    let normalized_right = right.trim().to_ascii_lowercase();
    if normalized_left.is_empty() || normalized_right.is_empty() {
        return false;
    }
    if normalized_left == normalized_right {
        return true;
    }

    let left_tokens = normalized_left
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .collect::<std::collections::BTreeSet<_>>();
    let right_tokens = normalized_right
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .collect::<std::collections::BTreeSet<_>>();
    if left_tokens.is_empty() || right_tokens.is_empty() {
        return false;
    }
    let overlap = left_tokens.intersection(&right_tokens).count();
    overlap >= 2
        || left_tokens
            .iter()
            .any(|token| token == &"reply" && right_tokens.contains("reply"))
}

fn continuity_priority_selection_context(
    panel_kind: &str,
    preferred_state: Option<&DashboardContinuityMessage>,
    handoff: Option<&SynthesizerToMasterHandoff>,
    response_items: &[ContinuityResponseItem],
    prepared_draft_items: &[ContinuityPreparedDraftItem],
    preferred_prepared_draft: Option<&ContinuityPreparedDraftItem>,
    context_pack_items: &[ContinuityPreparedContextPackItem],
) -> (Option<String>, Option<String>) {
    let field_engine_reason = handoff.and_then(|handoff| {
        handoff
            .field_engine_summary
            .as_ref()
            .filter(|summary| handoff.field_engine_ready && !summary.trim().is_empty())
            .cloned()
    });
    let watcher_cooldown_reason = watcher_context_cooldown_reason(preferred_state);
    let empathy_reason = empathy_coordination_reason(handoff);
    if panel_kind != "response_queue" && panel_kind != "context_panel" {
        return (None, field_engine_reason);
    }

    let response_context = response_items.first().and_then(|item| {
        item.prepared_draft_class.as_ref().map(|draft_class| {
            (
                Some(draft_class.clone()),
                item.prepared_draft_selection_reason.clone(),
            )
        })
    });
    let prepared_context = preferred_prepared_draft
        .or_else(|| prepared_draft_items.first())
        .map(|item| {
            (
                Some(item.draft_class.clone()),
                item.selection_reason.clone(),
            )
        });
    let context_pack_context = context_pack_items.first().map(|item| {
        (
            None,
            Some(item.why_surfaced.clone()).filter(|value| !value.trim().is_empty()),
        )
    });

    let selected_context = if panel_kind == "context_panel" {
        context_pack_context
            .or(prepared_context)
            .or(response_context)
    } else if preferred_prepared_draft.is_some() {
        prepared_context.or(response_context)
    } else {
        response_context.or(prepared_context)
    };

    selected_context
        .map(|(draft_class, selection_reason)| {
            (
                draft_class,
                selection_reason
                    .or_else(|| field_engine_reason.clone())
                    .or_else(|| {
                        if panel_kind == "response_queue" {
                            watcher_cooldown_reason
                                .clone()
                                .or_else(|| empathy_reason.clone())
                        } else {
                            None
                        }
                    }),
            )
        })
        .unwrap_or((None, field_engine_reason))
}

pub(super) fn empathy_coordination_reason(
    handoff: Option<&SynthesizerToMasterHandoff>,
) -> Option<String> {
    handoff
        .and_then(|handoff| handoff.empathy_context.as_ref())
        .filter(|context| {
            matches!(
                context.watcher_mode.as_str(),
                "cooldown" | "urgent_clear" | "trusted_gentle"
            )
        })
        .and_then(|context| context.explanation.as_ref())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn continuity_priority_title(
    panel_kind: &str,
    brief: Option<&DashboardContinuityBrief>,
    handoff: Option<&SynthesizerToMasterHandoff>,
    response_items: &[ContinuityResponseItem],
    prepared_draft_items: &[ContinuityPreparedDraftItem],
    preferred_prepared_draft: Option<&ContinuityPreparedDraftItem>,
    context_pack_items: &[ContinuityPreparedContextPackItem],
) -> Option<String> {
    if panel_kind == "home" && preferred_prepared_draft.is_some() {
        return preferred_prepared_draft
            .map(|item| item.title.clone())
            .or_else(|| prepared_draft_items.first().map(|item| item.title.clone()))
            .or_else(|| handoff.and_then(|handoff| handoff.prepared_draft_summary.clone()))
            .or_else(|| handoff.and_then(|handoff| handoff.suggested_next_actions.first().cloned()))
            .or_else(|| brief.map(|brief| brief.title.clone()))
            .or_else(|| response_items.first().map(|item| item.title.clone()));
    }

    if panel_kind == "response_queue" {
        preferred_prepared_draft
            .map(|item| item.title.clone())
            .or_else(|| prepared_draft_items.first().map(|item| item.title.clone()))
            .or_else(|| response_items.first().map(|item| item.title.clone()))
            .or_else(|| brief.map(|brief| brief.title.clone()))
            .or_else(|| handoff.and_then(|handoff| handoff.suggested_next_actions.first().cloned()))
    } else if panel_kind == "context_panel" {
        context_pack_items
            .first()
            .map(|item| item.title.clone())
            .or_else(|| brief.map(|brief| brief.title.clone()))
            .or_else(|| handoff.and_then(|handoff| handoff.suggested_next_actions.first().cloned()))
            .or_else(|| prepared_draft_items.first().map(|item| item.title.clone()))
            .or_else(|| response_items.first().map(|item| item.title.clone()))
    } else {
        brief
            .map(|brief| brief.title.clone())
            .or_else(|| handoff.and_then(|handoff| handoff.suggested_next_actions.first().cloned()))
            .or_else(|| prepared_draft_items.first().map(|item| item.title.clone()))
            .or_else(|| response_items.first().map(|item| item.title.clone()))
    }
}

fn continuity_priority_source_refs(
    panel_kind: &str,
    action_items: &[ContinuityActionItem],
    response_items: &[ContinuityResponseItem],
    prepared_draft_items: &[ContinuityPreparedDraftItem],
    context_pack_items: &[ContinuityPreparedContextPackItem],
    preferred_prepared_draft: Option<&ContinuityPreparedDraftItem>,
) -> Vec<String> {
    let response_refs = response_items
        .first()
        .map(|item| item.source_refs.as_slice());
    let prepared_draft_refs = preferred_prepared_draft
        .map(|item| item.source_refs.as_slice())
        .or_else(|| {
            prepared_draft_items
                .first()
                .map(|item| item.source_refs.as_slice())
        });
    let action_refs = action_items.first().map(|item| item.source_refs.as_slice());
    let context_pack_refs = context_pack_items.first().map(|item| {
        if !item.reference_refs.is_empty() {
            item.reference_refs.as_slice()
        } else {
            item.source_refs.as_slice()
        }
    });

    let selected_refs = if panel_kind == "home" && preferred_prepared_draft.is_some() {
        prepared_draft_refs
            .or(action_refs)
            .or(response_refs)
            .or(context_pack_refs)
    } else if panel_kind == "response_queue" {
        if preferred_prepared_draft.is_some() {
            prepared_draft_refs
                .or(response_refs)
                .or(action_refs)
                .or(context_pack_refs)
        } else {
            response_refs
                .or(prepared_draft_refs)
                .or(action_refs)
                .or(context_pack_refs)
        }
    } else if panel_kind == "context_panel" {
        context_pack_refs
            .or(action_refs)
            .or(response_refs)
            .or(prepared_draft_refs)
    } else {
        action_refs
            .or(response_refs)
            .or(prepared_draft_refs)
            .or(context_pack_refs)
    };

    selected_refs.unwrap_or(&[]).to_vec()
}

pub(super) fn continuity_priority_card(
    item: Option<&ContinuityPriorityItem>,
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Option<ContinuityPriorityCard> {
    let item = item?;
    let action_label = item
        .suggested_action
        .clone()
        .unwrap_or_else(|| item.title.clone());
    let linked_target_label = continuity_target_label(&item.source_refs, preferred_state);
    let object_refs = continuity_priority_object_refs(item, preferred_state);
    let object_labels = continuity_reference_labels(&object_refs, preferred_state);
    let file_refs = continuity_priority_file_refs(item, preferred_state);
    let file_labels = continuity_reference_labels(&file_refs, preferred_state);
    let prepared_context_packet =
        continuity_priority_prepared_context_packet(item, preferred_state);
    let neighborhood_freshness =
        continuity_context_freshness_for_refs(preferred_state, &item.source_refs);
    let base_description = continuity_priority_card_description(item, &action_label);
    let autonomy_tier = continuity_priority_card_autonomy_tier(item.requires_approval);
    let approval_or_reversibility_hint =
        continuity_priority_card_boundary_hint(item, prepared_context_packet);
    let provenance_cue = continuity_priority_card_provenance_cue(item, &object_refs, &file_refs);
    let autonomy_decision = continuity_priority_card_autonomy_decision(
        item,
        item.confidence.as_deref(),
        &base_description,
    );
    let thread_retrieval_state = thread_retrieval_state_from_refs(
        "continuity_priority",
        item.requires_approval,
        &item.source_refs,
        &[],
        &object_refs,
        &object_labels,
        &file_refs,
        &file_labels,
        neighborhood_freshness,
    );
    Some(ContinuityPriorityCard {
        title: item.title.clone(),
        description: base_description,
        panel_kind: item.panel_kind.clone(),
        requires_approval: item.requires_approval,
        action_label,
        surface_hint: item.surface_hint.clone(),
        confidence: item.confidence.clone(),
        prepared_draft_class: item.prepared_draft_class.clone(),
        selection_reason: item.selection_reason.clone(),
        approval_or_reversibility_hint: Some(approval_or_reversibility_hint),
        provenance_cue: Some(provenance_cue),
        autonomy_tier: Some(autonomy_tier.to_string()),
        retrieval_mode: prepared_context_packet.map(|packet| {
            let trimmed = packet.retrieval_mode.trim();
            if trimmed.is_empty() {
                crate::prepared_context_packet::PREPARED_CONTEXT_RETRIEVAL_MODE_METADATA_FIRST
                    .to_string()
            } else {
                trimmed.to_string()
            }
        }),
        deeper_retrieval_recommended: prepared_context_packet
            .map(|packet| packet.deeper_retrieval_recommended)
            .unwrap_or(false),
        readiness_reason: prepared_context_packet.and_then(|packet| {
            packet.readiness_reason.clone().or_else(|| {
                if packet.ready && !packet.deeper_retrieval_recommended {
                    Some(
                        "Metadata-first support is complete for the current continuity bundle."
                            .to_string(),
                    )
                } else {
                    None
                }
            })
        }),
        topology_budget_used: prepared_context_packet
            .map(|packet| packet.topology_budget_used)
            .unwrap_or(0),
        working_set_count: prepared_context_packet
            .map(|packet| packet.working_set_refs.len() as u32)
            .unwrap_or(0),
        active_topic_count: prepared_context_packet
            .map(|packet| packet.active_topic_refs.len() as u32)
            .unwrap_or(0),
        working_set_refs: prepared_context_packet
            .map(|packet| packet.working_set_refs.clone())
            .unwrap_or_default(),
        active_topic_refs: prepared_context_packet
            .map(|packet| packet.active_topic_refs.clone())
            .unwrap_or_default(),
        decision_history_refs: prepared_context_packet
            .map(|packet| packet.decision_history_refs.clone())
            .unwrap_or_default(),
        project_refs: prepared_context_packet
            .map(|packet| packet.project_refs.clone())
            .unwrap_or_default(),
        thread_refs: prepared_context_packet
            .map(|packet| packet.thread_refs.clone())
            .unwrap_or_default(),
        linked_target_label,
        source_refs: item.source_refs.clone(),
        object_refs,
        object_labels,
        file_refs,
        file_labels,
        thread_retrieval_state,
        autonomy_decision: Some(autonomy_decision),
        memory_space: item.memory_space.clone(),
        author_mask: item.author_mask.clone(),
        author_type: item.author_type.clone(),
        author_id: item.author_id.clone(),
        is_human_authored: item.is_human_authored,
        human_only: item.human_only,
    })
}

fn continuity_priority_card_description(
    item: &ContinuityPriorityItem,
    action_label: &str,
) -> String {
    if item.requires_approval {
        return format!("{action_label} requires explicit approval.");
    }

    if item.panel_kind == "response_queue" && item.prepared_draft_class.is_some() {
        return "Prepared response is ready for review.".to_string();
    }

    if item.panel_kind == "decision_queue" && item.prepared_draft_class.is_some() {
        return "Prepared decision support is ready for review.".to_string();
    }

    if item.panel_kind == "context_panel"
        && (item.title.to_ascii_lowercase().contains("prepared context")
            || item
                .selection_reason
                .as_deref()
                .map(|reason| reason.to_ascii_lowercase().contains("prepared context"))
                .unwrap_or(false))
    {
        return "Prepared context is ready for review.".to_string();
    }

    if item.panel_kind == "home" && item.prepared_draft_class.is_some() {
        return "Prepared work is ready for review.".to_string();
    }

    format!("Surface this in the {}.", item.panel_kind)
}

fn continuity_priority_card_autonomy_tier(requires_approval: bool) -> &'static str {
    proactive_tier_for_requires_approval(requires_approval).as_str()
}

fn continuity_priority_card_boundary_hint(
    item: &ContinuityPriorityItem,
    prepared_context_packet: Option<&PreparedContextPacket>,
) -> String {
    if item.requires_approval {
        return "Remains approval-gated before any action runs.".to_string();
    }
    if prepared_context_packet.is_some() || item.panel_kind == "context_panel" {
        return "Opening this reveals prepared context only; it does not execute a side effect."
            .to_string();
    }
    if item.prepared_draft_class.is_some() {
        return "Opens prepared work for review rather than executing a side effect.".to_string();
    }
    "Opening this keeps the current continuity reviewable before any action is taken.".to_string()
}

fn continuity_priority_card_provenance_cue(
    item: &ContinuityPriorityItem,
    object_refs: &[String],
    file_refs: &[String],
) -> String {
    if !item.source_refs.is_empty() {
        return "Traceable to the currently linked continuity sources behind this priority."
            .to_string();
    }
    if !object_refs.is_empty() || !file_refs.is_empty() {
        return "Traceable to the current continuity neighborhood behind this priority."
            .to_string();
    }
    "Traceable to the current continuity and ranking state.".to_string()
}

fn continuity_priority_card_autonomy_decision(
    item: &ContinuityPriorityItem,
    confidence: Option<&str>,
    description: &str,
) -> CompactAutonomyDecision {
    if item.requires_approval {
        return CompactAutonomyDecision::request_approval(
            confidence,
            item.selection_reason
                .clone()
                .unwrap_or_else(|| description.to_string()),
        );
    }

    let reason = if item.prepared_draft_class.is_some() {
        "Prepared work is ready for review before any action is taken.".to_string()
    } else {
        item.selection_reason
            .clone()
            .unwrap_or_else(|| description.to_string())
    };
    CompactAutonomyDecision::suggest_with_artifact(confidence, reason)
}

fn watcher_context_is_cooled_down(preferred_state: Option<&DashboardContinuityMessage>) -> bool {
    watcher_context_cooldown_reason(preferred_state).is_some()
}

fn watcher_context_cooldown_reason(
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Option<String> {
    let Some(DashboardContinuityMessage {
        parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)),
        ..
    }) = preferred_state
    else {
        return None;
    };

    let has_active_or_trusted = snapshot
        .watcher_signals
        .iter()
        .any(|signal| matches!(signal.suppression_status.as_str(), "active" | "trusted"));
    if has_active_or_trusted {
        return None;
    }

    snapshot
        .watcher_signals
        .iter()
        .find(|signal| {
            matches!(
                signal.suppression_status.as_str(),
                "suppressed" | "cooldown"
            )
        })
        .and_then(|signal| {
            let suppression_reason = signal.suppression_reason.trim();
            if !suppression_reason.is_empty() {
                return Some(suppression_reason.to_string());
            }
            let escalation_reason = signal.escalation_reason.trim();
            if !escalation_reason.is_empty() {
                return Some(escalation_reason.to_string());
            }
            let urgency_hint = signal.urgency_hint.trim();
            if !urgency_hint.is_empty() {
                return Some(urgency_hint.to_string());
            }
            None
        })
}

fn continuity_priority_object_refs(
    item: &ContinuityPriorityItem,
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Vec<String> {
    if item.panel_kind != "context_panel" {
        return Vec::new();
    }
    preferred_state
        .and_then(|state| match state.parsed_content.as_ref() {
            Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => {
                snapshot.prepared_context_packet.as_ref()
            }
            Some(DashboardContinuityParsedContent::StateSynthesis(_)) | None => None,
        })
        .map(|packet| packet.object_refs.clone())
        .unwrap_or_default()
}

fn continuity_priority_file_refs(
    item: &ContinuityPriorityItem,
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Vec<String> {
    if item.panel_kind != "context_panel" {
        return Vec::new();
    }
    preferred_state
        .and_then(|state| match state.parsed_content.as_ref() {
            Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => {
                snapshot.prepared_context_packet.as_ref()
            }
            Some(DashboardContinuityParsedContent::StateSynthesis(_)) | None => None,
        })
        .map(|packet| packet.file_refs.clone())
        .unwrap_or_default()
}

fn continuity_priority_prepared_context_packet<'a>(
    item: &ContinuityPriorityItem,
    preferred_state: Option<&'a DashboardContinuityMessage>,
) -> Option<&'a crate::prepared_context_packet::PreparedContextPacket> {
    if item.panel_kind != "context_panel" {
        return None;
    }
    preferred_state.and_then(|state| match state.parsed_content.as_ref() {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => {
            snapshot.prepared_context_packet.as_ref()
        }
        Some(DashboardContinuityParsedContent::StateSynthesis(_)) | None => None,
    })
}

pub(super) fn thread_retrieval_state_from_refs(
    kind: &str,
    requires_approval: bool,
    source_refs: &[String],
    reference_refs: &[String],
    object_refs: &[String],
    object_labels: &[String],
    file_refs: &[String],
    file_labels: &[String],
    neighborhood_freshness: Option<&str>,
) -> Option<Value> {
    let thread_refs = source_refs
        .iter()
        .chain(reference_refs.iter())
        .filter_map(|reference| normalize_thread_ref(reference))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    if thread_refs.is_empty()
        && !reference_refs
            .iter()
            .chain(object_refs.iter())
            .any(|reference| !is_thread_ref(reference) && !reference.trim().is_empty())
    {
        return None;
    }

    let object_linked = reference_refs
        .iter()
        .chain(object_refs.iter())
        .any(|reference| !is_thread_ref(reference) && !reference.trim().is_empty());
    let file_linked = file_refs
        .iter()
        .any(|reference| !reference.trim().is_empty());

    let mut badges = Vec::new();
    if !thread_refs.is_empty() {
        badges.push("thread-linked".to_string());
    }
    if object_linked {
        badges.push("object-linked".to_string());
    }
    if file_linked {
        badges.push("file-linked".to_string());
    }
    match neighborhood_freshness {
        Some("reactivated") => badges.push("reactivated-neighborhood".to_string()),
        Some("stale") => badges.push("stale-neighborhood".to_string()),
        _ => {}
    }
    match kind {
        "continuity_priority" => badges.push("priority-driven".to_string()),
        "context_pack" => badges.push("context-packed".to_string()),
        "prepared_draft" => badges.push("draft-guided".to_string()),
        _ => {}
    }
    if requires_approval {
        badges.push("approval-sensitive".to_string());
    }

    let lead_thread = thread_refs.first().map(|value| humanize_thread_ref(value));
    let lead_object = object_labels
        .iter()
        .find(|label| !label.trim().is_empty())
        .cloned()
        .or_else(|| {
            object_refs
                .iter()
                .find(|reference| !reference.trim().is_empty())
                .cloned()
        });
    let lead_file = file_labels
        .iter()
        .find(|label| !label.trim().is_empty())
        .cloned()
        .or_else(|| {
            file_refs
                .iter()
                .find(|reference| !reference.trim().is_empty())
                .map(|reference| humanize_file_ref(reference))
        });
    let mut summary_parts = vec![match (
        thread_refs.len(),
        lead_thread.as_ref(),
        lead_object.as_ref(),
        lead_file.as_ref(),
    ) {
        (1, Some(lead_thread), _, _) => format!("Surfaced around {lead_thread}."),
        (count, Some(lead_thread), _, _) if count > 1 => {
            format!("Surfaced around {count} thread-linked cues, led by {lead_thread}.",)
        }
        (_, _, Some(object_label), _) => {
            format!("Surfaced around linked object focus on {object_label}.")
        }
        (_, _, _, Some(file_label)) => {
            format!("Surfaced around linked file focus on {file_label}.")
        }
        _ => "Surfaced from linked continuity evidence.".to_string(),
    }];
    if let Some(object_label) = lead_object.as_ref() {
        summary_parts.push(format!("Linked object focus centers on {object_label}."));
    }
    if let Some(file_label) = lead_file.as_ref() {
        summary_parts.push(format!("Linked file focus centers on {file_label}."));
    }
    if let Some(freshness_summary) = thread_retrieval_freshness_summary(neighborhood_freshness) {
        summary_parts.push(freshness_summary.to_string());
    }
    match kind {
        "continuity_priority" => summary_parts.push(if lead_object.is_some() {
            "Priority pressure is concentrated around this object-linked thread neighborhood."
                .to_string()
        } else if lead_file.is_some() {
            "Priority pressure is concentrated around this file-linked thread neighborhood."
                .to_string()
        } else {
            "Priority pressure is concentrated in this thread neighborhood.".to_string()
        }),
        "context_pack" => summary_parts.push(if lead_object.is_some() {
            "This pack consolidates the most relevant thread-linked context around the same object."
                .to_string()
        } else if lead_file.is_some() {
            "This pack consolidates the most relevant thread-linked context around the same file."
                .to_string()
        } else {
            "This pack consolidates the most relevant thread-linked context.".to_string()
        }),
        "prepared_draft" => summary_parts.push(if lead_object.is_some() {
            "The prepared draft is anchored in this object-linked thread neighborhood.".to_string()
        } else if lead_file.is_some() {
            "The prepared draft is anchored in this file-linked thread neighborhood.".to_string()
        } else {
            "The prepared draft is anchored in this thread neighborhood.".to_string()
        }),
        _ => {}
    }
    if requires_approval {
        summary_parts.push("Approval remains in the loop.".to_string());
    }

    Some(serde_json::json!({
        "summary": summary_parts.join(" "),
        "badges": badges,
    }))
}

fn thread_retrieval_freshness_summary(freshness: Option<&str>) -> Option<&'static str> {
    match freshness {
        Some("fresh") => Some("Recent linked activity still dominates this neighborhood."),
        Some("active") => Some("Still-active linked context keeps this neighborhood in view."),
        Some("reactivated") => {
            Some("Dormant but strongly linked context is being reactivated here.")
        }
        Some("stale") => {
            Some("This neighborhood is currently held mostly by older linked context.")
        }
        _ => None,
    }
}

pub(super) fn continuity_context_freshness_for_refs(
    preferred_state: Option<&DashboardContinuityMessage>,
    refs: &[String],
) -> Option<&'static str> {
    let snapshot = match preferred_state.and_then(|state| state.parsed_content.as_ref()) {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => snapshot,
        _ => return None,
    };
    if refs.is_empty() {
        return None;
    }

    ["fresh", "active", "reactivated", "stale"]
        .into_iter()
        .find(|freshness| {
            snapshot.context_panel_items.iter().any(|item| {
                item.freshness.eq_ignore_ascii_case(freshness)
                    && (refs.iter().any(|reference| reference == &item.id)
                        || item
                            .source_refs
                            .iter()
                            .any(|source_ref| refs.iter().any(|reference| reference == source_ref)))
            })
        })
}

fn is_thread_ref(reference: &str) -> bool {
    normalize_thread_ref(reference).is_some()
}

fn normalize_thread_ref(reference: &str) -> Option<String> {
    let trimmed = reference.trim();
    for prefix in ["thread:", "conversation:"] {
        if let Some(value) = trimmed.strip_prefix(prefix) {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn humanize_file_ref(reference: &str) -> String {
    let trimmed = reference
        .trim()
        .strip_prefix("file:")
        .unwrap_or(reference.trim());
    trimmed
        .rsplit(['/', '\\'])
        .next()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(trimmed)
        .to_string()
}

fn humanize_thread_ref(reference: &str) -> String {
    reference
        .split(':')
        .filter(|part| !part.trim().is_empty())
        .map(|part| part.replace(['_', '-'], " "))
        .collect::<Vec<_>>()
        .join(" / ")
}

pub(super) fn cost_status_from_snapshot(
    snapshot: &DashboardCostSnapshot,
) -> Option<DashboardCostStatus> {
    let budget = snapshot.monthly_budget_usd;
    let recent_spend = snapshot.recent_spend_usd_14d;
    let ratio = if budget > 0.0 {
        recent_spend / budget
    } else {
        0.0
    };
    let soft_limit = snapshot.soft_limit_ratio.max(0.0);

    if budget <= 0.0 {
        return Some(DashboardCostStatus {
            level: "notice".to_string(),
            title: "Set a monthly cost cap".to_string(),
            detail: "Cost tracking is live, but no monthly run budget is configured yet."
                .to_string(),
            action_label: "Open Cost Dashboard".to_string(),
        });
    }

    if ratio >= 1.0 || snapshot.estimated_monthly_margin_usd < 0.0 {
        return Some(DashboardCostStatus {
            level: "warning".to_string(),
            title: "Budget pressure is high".to_string(),
            detail: format!(
                "{} used against a {} cap in the recent window.",
                currency_label(recent_spend),
                currency_label(budget)
            ),
            action_label: "Review cost limits".to_string(),
        });
    }

    if ratio >= soft_limit {
        return Some(DashboardCostStatus {
            level: "elevated".to_string(),
            title: "Approaching your soft limit".to_string(),
            detail: format!(
                "{} of {} already consumed; usage guards may engage soon.",
                currency_label(recent_spend),
                currency_label(budget)
            ),
            action_label: "Check cost pacing".to_string(),
        });
    }

    None
}

fn cost_status_priority_item(status: &DashboardCostStatus) -> Option<ContinuityPriorityItem> {
    let confidence = match status.level.as_str() {
        "warning" => "high",
        "elevated" => "medium",
        _ => return None,
    };

    Some(ContinuityPriorityItem {
        title: status.title.clone(),
        panel_kind: "decision_queue".to_string(),
        requires_approval: false,
        surface_hint: Some("decision_queue".to_string()),
        suggested_action: Some(status.action_label.clone()),
        confidence: Some(confidence.to_string()),
        prepared_draft_class: None,
        selection_reason: None,
        source_refs: Vec::new(),
        memory_space: None,
        author_mask: None,
        author_type: None,
        author_id: None,
        is_human_authored: None,
        human_only: None,
    })
}

pub(super) fn effective_priority_item_with_cost(
    continuity_priority_item: Option<&ContinuityPriorityItem>,
    cost_status: Option<&DashboardCostStatus>,
) -> Option<ContinuityPriorityItem> {
    let cost_priority_item = cost_status.and_then(cost_status_priority_item);

    match (continuity_priority_item, cost_priority_item) {
        (Some(item), _) if item.requires_approval => Some(item.clone()),
        (Some(_), Some(cost_item))
            if matches!(
                cost_status.map(|status| status.level.as_str()),
                Some("warning")
            ) =>
        {
            Some(cost_item)
        }
        (Some(item), _) => Some(item.clone()),
        (None, Some(cost_item)) => Some(cost_item),
        (None, None) => None,
    }
}

fn currency_label(value: f64) -> String {
    if value >= 100.0 {
        format!("${:.0}", value)
    } else {
        format!("${:.2}", value)
    }
}

pub(super) async fn load_dashboard_cost_snapshot(
    state: &Arc<AppState>,
    user_id: &str,
) -> Result<Option<DashboardCostSnapshot>, anyhow::Error> {
    let summary = state.cost_oracle.cost_summary_for_user(user_id).await;
    let budget = state.cost_oracle.active_budget_for_user(user_id).await;

    let month_row = sqlx::query(
        r#"SELECT
               COALESCE(SUM(CASE WHEN created_at >= now() - interval '14 days' THEN cost_usd ELSE 0 END), 0) AS recent_spend_usd_14d,
               COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN cost_usd ELSE 0 END), 0) AS cost_month_usd
           FROM cost_records
           WHERE user_id = $1"#,
    )
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await?;

    let plan = sqlx::query(
        "SELECT COALESCE(plan, 'free') AS plan FROM billing_subscriptions WHERE account_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await?
    .and_then(|row| row.try_get::<String, _>("plan").ok())
    .unwrap_or_else(|| "free".to_string());
    let tier_policy = crate::policy_engine::PolicyEngine::tier_policy(&plan);
    let plan_revenue_usd = tier_policy.monthly_price_usd;

    let recent_spend_usd_14d = month_row
        .as_ref()
        .and_then(|row| row.try_get::<f64, _>("recent_spend_usd_14d").ok())
        .unwrap_or(0.0);
    let cost_month_usd = month_row
        .as_ref()
        .and_then(|row| row.try_get::<f64, _>("cost_month_usd").ok())
        .unwrap_or(0.0);

    let total_events = summary["event_count"].as_i64().unwrap_or(0);
    let has_budget = budget["max_cost_usd"].as_f64().unwrap_or(0.0) > 0.0;
    if total_events == 0 && !has_budget {
        return Ok(None);
    }

    let soft_limit_ratio = budget["soft_limit_ratio"].as_f64().unwrap_or(0.8);
    let monthly_budget_usd = budget["max_cost_usd"].as_f64().unwrap_or(0.0);
    let estimated_monthly_margin_usd = plan_revenue_usd - cost_month_usd;

    Ok(Some(DashboardCostSnapshot {
        total_usd: summary["total_usd"].as_f64().unwrap_or(0.0),
        total_tokens: summary["total_tokens"].as_i64().unwrap_or(0),
        event_count: total_events,
        run_count: summary["run_count"].as_i64().unwrap_or(0),
        monthly_budget_usd,
        soft_limit_ratio,
        recent_spend_usd_14d,
        cost_month_usd,
        estimated_monthly_margin_usd,
        deep_queries_today: 0,
        daily_deep_query_limit: 0,
        margin_guard_active: estimated_monthly_margin_usd < 0.0,
        usage_guard_active: monthly_budget_usd > 0.0 && recent_spend_usd_14d >= monthly_budget_usd,
    }))
}

pub(super) fn continuity_action_items(
    preferred_state: Option<&DashboardContinuityMessage>,
    preferred_brief: Option<&DashboardContinuityBrief>,
    preferred_handoff: Option<&SynthesizerToMasterHandoff>,
) -> Vec<ContinuityActionItem> {
    let state_items = match preferred_state.and_then(|message| message.parsed_content.as_ref()) {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => snapshot
            .decision_queue
            .iter()
            .map(ContinuityActionItem::from)
            .take(CONTINUITY_ACTION_ITEM_LIMIT)
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };
    if !state_items.is_empty() {
        return state_items;
    }

    let Some(handoff) = preferred_handoff else {
        return Vec::new();
    };
    let prepared_draft_item = continuity_action_item_prepared_draft(preferred_state, handoff);
    let effective_surface_hint =
        continuity_handoff_effective_surface_hint(handoff, prepared_draft_item.as_ref());
    let prepared_draft_scope =
        continuity_action_item_prepared_draft_scope(prepared_draft_item.as_ref());
    let context_pack_scope = continuity_action_item_context_pack_scope(preferred_state, handoff);
    let handoff_actions = continuity_handoff_actions(handoff, &effective_surface_hint);
    let mut items = handoff_actions
        .iter()
        .take(CONTINUITY_ACTION_ITEM_LIMIT)
        .enumerate()
        .map(|(index, action)| {
            let scope = continuity_action_item_scope(
                &effective_surface_hint,
                prepared_draft_scope.as_ref(),
                context_pack_scope.as_ref(),
            );
            ContinuityActionItem {
                id: format!("handoff_action_{}", index + 1),
                title: handoff_action_item_title(handoff, action, &effective_surface_hint),
                category: handoff_action_item_category(
                    handoff,
                    preferred_brief,
                    &effective_surface_hint,
                ),
                urgency: handoff_action_item_urgency(handoff),
                confidence: handoff.confidence.clone(),
                requires_approval: handoff.approval_boundary.is_some(),
                suggested_action: handoff_action_item_label(
                    handoff,
                    action,
                    &effective_surface_hint,
                    prepared_draft_item.as_ref(),
                ),
                surface_hint: Some(effective_surface_hint.clone()),
                autonomy_decision: Some(continuity_action_item_autonomy_decision(
                    handoff.approval_boundary.is_some(),
                    Some(handoff.confidence.as_str()),
                    prepared_draft_item.as_ref(),
                )),
                source_refs: vec![handoff.snapshot_ref.clone()],
                memory_space: scope.memory_space,
                author_mask: scope.author_mask,
                author_type: scope.author_type,
                author_id: scope.author_id,
                is_human_authored: scope.is_human_authored,
                human_only: scope.human_only,
            }
        })
        .collect::<Vec<_>>();
    continuity_dedupe_action_items(&mut items);
    items
}

fn continuity_action_item_overflow_count(
    preferred_state: Option<&DashboardContinuityMessage>,
    preferred_handoff: Option<&SynthesizerToMasterHandoff>,
) -> usize {
    match preferred_state.and_then(|message| message.parsed_content.as_ref()) {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => snapshot
            .decision_queue
            .len()
            .saturating_sub(CONTINUITY_ACTION_ITEM_LIMIT),
        _ => preferred_handoff
            .map(|handoff| {
                continuity_handoff_actions(handoff, &handoff.surface_recommendation)
                    .len()
                    .saturating_sub(CONTINUITY_ACTION_ITEM_LIMIT)
            })
            .unwrap_or(0),
    }
}

fn continuity_action_item_overflow_summary(
    preferred_state: Option<&DashboardContinuityMessage>,
    preferred_handoff: Option<&SynthesizerToMasterHandoff>,
    overflow_count: usize,
) -> Option<String> {
    if overflow_count == 0 {
        return None;
    }

    let item_label = if overflow_count == 1 { "item" } else { "items" };
    match preferred_state.and_then(|message| message.parsed_content.as_ref()) {
        Some(DashboardContinuityParsedContent::StateSnapshot(_)) => Some(format!(
            "{overflow_count} more decision {item_label} remain queued beyond the top {CONTINUITY_ACTION_ITEM_LIMIT}."
        )),
        _ => preferred_handoff.map(|handoff| {
            let queue_label = match handoff.surface_recommendation.trim() {
                "response_queue" => "response",
                "approval_queue" => "approval",
                "context_panel" => "context",
                "decision_queue" => "decision",
                _ => "continuity",
            };
            format!(
                "{overflow_count} more {queue_label} {item_label} remain queued beyond the top {CONTINUITY_ACTION_ITEM_LIMIT}."
            )
        }),
    }
}

fn continuity_handoff_actions(
    handoff: &SynthesizerToMasterHandoff,
    effective_surface_hint: &str,
) -> Vec<String> {
    if handoff.suggested_mood.as_deref() == Some("focused")
        && !handoff.escalation_required
        && handoff.approval_boundary.is_none()
    {
        match effective_surface_hint {
            "response_queue" if handoff.prepared_draft_ready => {
                return vec!["Review prepared reply".to_string()];
            }
            "context_panel" if handoff.prepared_context_ready => {
                return vec!["Review prepared context".to_string()];
            }
            _ => {}
        }
    }

    handoff.suggested_next_actions.clone()
}

fn continuity_action_item_autonomy_decision(
    requires_approval: bool,
    confidence: Option<&str>,
    prepared_draft_item: Option<&ContinuityPreparedDraftItem>,
) -> CompactAutonomyDecision {
    if requires_approval {
        return CompactAutonomyDecision::request_approval(
            confidence,
            "This action still needs explicit approval before execution.",
        );
    }

    let reason = if prepared_draft_item.is_some() {
        "Prepared work is ready for review before any action is taken."
    } else {
        "Suggested next step stays reviewable before execution."
    };
    CompactAutonomyDecision::suggest_with_artifact(confidence, reason)
}

fn continuity_dedupe_action_items(items: &mut Vec<ContinuityActionItem>) {
    let mut seen = std::collections::HashSet::new();
    items.retain(|item| {
        let key = format!(
            "{}\u{1f}|{}\u{1f}|{}",
            item.title.trim().to_ascii_lowercase(),
            item.suggested_action.trim().to_ascii_lowercase(),
            item.category.trim().to_ascii_lowercase(),
        );
        seen.insert(key)
    });
}

fn continuity_action_item_prepared_draft(
    preferred_state: Option<&DashboardContinuityMessage>,
    handoff: &SynthesizerToMasterHandoff,
) -> Option<ContinuityPreparedDraftItem> {
    if !handoff.prepared_draft_ready {
        return None;
    }

    continuity_prepared_draft_items(preferred_state)
        .into_iter()
        .next()
}

fn continuity_handoff_effective_surface_hint(
    handoff: &SynthesizerToMasterHandoff,
    prepared_draft_item: Option<&ContinuityPreparedDraftItem>,
) -> String {
    prepared_draft_item
        .map(|draft| continuity_prepared_draft_destination_view(&draft.draft_class).to_string())
        .unwrap_or_else(|| handoff.surface_recommendation.clone())
}

fn continuity_action_item_prepared_draft_scope(
    prepared_draft_item: Option<&ContinuityPreparedDraftItem>,
) -> Option<ContinuityPriorityScope> {
    prepared_draft_item.map(|draft| ContinuityPriorityScope {
        memory_space: draft.memory_space.clone(),
        author_mask: draft.author_mask.clone(),
        author_type: draft.author_type.clone(),
        author_id: draft.author_id.clone(),
        is_human_authored: draft.is_human_authored,
        human_only: draft.human_only,
    })
}

fn continuity_action_item_context_pack_scope(
    preferred_state: Option<&DashboardContinuityMessage>,
    handoff: &SynthesizerToMasterHandoff,
) -> Option<ContinuityPriorityScope> {
    if handoff.surface_recommendation != "context_panel" || !handoff.prepared_context_ready {
        return None;
    }

    continuity_context_pack_items(preferred_state)
        .into_iter()
        .next()
        .map(|pack| ContinuityPriorityScope {
            memory_space: pack.memory_space,
            author_mask: pack.author_mask,
            author_type: pack.author_type,
            author_id: pack.author_id,
            is_human_authored: pack.is_human_authored,
            human_only: pack.human_only,
        })
}

fn continuity_action_item_scope(
    effective_surface_hint: &str,
    prepared_draft_scope: Option<&ContinuityPriorityScope>,
    context_pack_scope: Option<&ContinuityPriorityScope>,
) -> ContinuityPriorityScope {
    match effective_surface_hint {
        "context_panel" => context_pack_scope.cloned().unwrap_or_default(),
        _ => prepared_draft_scope.cloned().unwrap_or_default(),
    }
}

fn handoff_action_item_title(
    handoff: &SynthesizerToMasterHandoff,
    action: &str,
    effective_surface_hint: &str,
) -> String {
    match effective_surface_hint {
        "response_queue" | "decision_queue" | "home" if handoff.prepared_draft_ready => handoff
            .prepared_draft_summary
            .clone()
            .filter(|summary| !summary.trim().is_empty())
            .unwrap_or_else(|| action.to_string()),
        "context_panel" => handoff
            .prepared_context_summary
            .clone()
            .filter(|summary| !summary.trim().is_empty())
            .unwrap_or_else(|| action.to_string()),
        _ => action.to_string(),
    }
}

fn handoff_action_item_category(
    handoff: &SynthesizerToMasterHandoff,
    preferred_brief: Option<&DashboardContinuityBrief>,
    effective_surface_hint: &str,
) -> String {
    match effective_surface_hint {
        "response_queue" => "response".to_string(),
        "decision_queue" => {
            if handoff.approval_boundary.is_some() {
                "approval".to_string()
            } else {
                "decision".to_string()
            }
        }
        "context_panel" => {
            if handoff.prepared_context_ready {
                "context".to_string()
            } else {
                "research".to_string()
            }
        }
        "home" if handoff.prepared_draft_ready => "prepared".to_string(),
        _ => {
            if handoff.prepared_draft_ready {
                "prepared".to_string()
            } else if handoff.prepared_context_ready {
                "context".to_string()
            } else {
                preferred_brief
                    .map(|brief| brief.source_type.clone())
                    .unwrap_or_else(|| "continuity".to_string())
            }
        }
    }
}

fn handoff_action_item_urgency(handoff: &SynthesizerToMasterHandoff) -> String {
    if handoff.approval_boundary.is_some() {
        "urgent".to_string()
    } else if handoff.escalation_required {
        "high".to_string()
    } else if handoff.prepared_draft_ready || handoff.prepared_context_ready {
        "medium".to_string()
    } else {
        "low".to_string()
    }
}

fn handoff_action_item_label(
    handoff: &SynthesizerToMasterHandoff,
    action: &str,
    effective_surface_hint: &str,
    prepared_draft_item: Option<&ContinuityPreparedDraftItem>,
) -> String {
    match effective_surface_hint {
        "response_queue" => "Open responses".to_string(),
        "decision_queue" => {
            if handoff.approval_boundary.is_some() {
                "Open approval queue".to_string()
            } else if handoff.prepared_draft_ready {
                "Open decision queue".to_string()
            } else {
                action.to_string()
            }
        }
        "context_panel" => {
            if handoff.prepared_context_ready {
                "Open context".to_string()
            } else {
                action.to_string()
            }
        }
        "home" if handoff.prepared_draft_ready => prepared_draft_item
            .map(|draft| continuity_prepared_draft_action_label(&draft.draft_class).to_string())
            .unwrap_or_else(|| "Open workspace".to_string()),
        _ => action.to_string(),
    }
}

fn continuity_prepared_draft_destination_view(draft_class: &str) -> &'static str {
    crate::prepared_draft_semantics::prepared_draft_destination_view(draft_class)
}

fn continuity_prepared_draft_action_label(draft_class: &str) -> &'static str {
    crate::prepared_draft_semantics::prepared_draft_action_label(draft_class)
}

pub(super) fn continuity_context_panel_items(
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Vec<ContinuityContextPanelItem> {
    let Some(message) = preferred_state else {
        return Vec::new();
    };

    match message.parsed_content.as_ref() {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => snapshot
            .context_panel_items
            .iter()
            .map(ContinuityContextPanelItem::from)
            .take(6)
            .collect(),
        _ => Vec::new(),
    }
}

pub(super) fn continuity_state_fields(
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Vec<ContinuityStateFieldItem> {
    let Some(message) = preferred_state else {
        return Vec::new();
    };

    match message.parsed_content.as_ref() {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => {
            let prepared_work_ready = snapshot
                .prepared_context_packet
                .as_ref()
                .map(|packet| packet.ready)
                .unwrap_or(false)
                || snapshot
                    .prepared_draft_packet
                    .as_ref()
                    .map(|packet| packet.ready)
                    .unwrap_or(false);

            crate::state_fields::visible_state_fields(&snapshot.state_fields)
                .into_iter()
                .filter(|field| {
                    !(prepared_work_ready
                        && field.status == "monitor"
                        && continuity_field_reason_indicates_prepared_support(
                            field.reason.as_str(),
                        ))
                })
                .map(Clone::clone)
                .collect()
        }
        _ => Vec::new(),
    }
}

fn continuity_field_reason_indicates_prepared_support(reason: &str) -> bool {
    reason.contains("Prepared follow-up work is already available")
        || reason.contains("Prepared relationship follow-up is already available")
        || reason.contains("Prepared context is already available")
        || reason.contains("Prepared support is already available")
}

pub(super) fn continuity_context_pack_items(
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Vec<ContinuityPreparedContextPackItem> {
    let Some(message) = preferred_state else {
        return Vec::new();
    };

    continuity_prepared_context_packet(message)
        .map(|packet| {
            let mut items = packet
                .packs
                .iter()
                .map(|pack| {
                    let mut item = ContinuityPreparedContextPackItem::from(pack);
                    item.retrieval_mode = Some(packet.retrieval_mode.clone());
                    item.deeper_retrieval_recommended = packet.deeper_retrieval_recommended;
                    item.readiness_reason = packet.readiness_reason.clone();
                    item.topology_budget_used = packet.topology_budget_used;
                    item.working_set_count = packet.working_set_refs.len() as u32;
                    item.active_topic_count = packet.active_topic_refs.len() as u32;
                    item.reference_labels =
                        continuity_reference_labels(&item.reference_refs, preferred_state);
                    item.object_labels =
                        continuity_reference_labels(&item.object_refs, preferred_state);
                    if item.file_labels.is_empty() {
                        let continuity_file_labels =
                            continuity_reference_labels(&item.file_refs, preferred_state);
                        for label in continuity_file_labels {
                            if !item.file_labels.iter().any(|existing| existing == &label) {
                                item.file_labels.push(label);
                            }
                        }
                    }
                    item.thread_retrieval_state = thread_retrieval_state_from_refs(
                        "context_pack",
                        false,
                        &item.source_refs,
                        &item.reference_refs,
                        &item.object_refs,
                        &item.object_labels,
                        &item.file_refs,
                        &item.file_labels,
                        continuity_context_freshness_for_refs(preferred_state, &item.source_refs),
                    );
                    item
                })
                .collect::<Vec<_>>();
            items.sort_by(|a, b| {
                crate::server::continuity_ranking_helpers::continuity_context_pack_rank(
                    &a.pack_kind,
                    &a.evidence_kinds,
                    &a.why_surfaced,
                    a.memory_space.as_deref(),
                    a.author_mask.as_deref(),
                    a.author_type.as_deref(),
                    a.author_id.as_deref(),
                    a.is_human_authored,
                    a.human_only,
                    &a.file_refs,
                    &a.file_labels,
                    a.reference_refs.len(),
                    &a.source_refs,
                )
                .cmp(
                    &crate::server::continuity_ranking_helpers::continuity_context_pack_rank(
                        &b.pack_kind,
                        &b.evidence_kinds,
                        &b.why_surfaced,
                        b.memory_space.as_deref(),
                        b.author_mask.as_deref(),
                        b.author_type.as_deref(),
                        b.author_id.as_deref(),
                        b.is_human_authored,
                        b.human_only,
                        &b.file_refs,
                        &b.file_labels,
                        b.reference_refs.len(),
                        &b.source_refs,
                    ),
                )
                .then_with(|| a.title.cmp(&b.title))
                .then_with(|| a.id.cmp(&b.id))
            });
            items.truncate(4);
            items
        })
        .unwrap_or_default()
}

fn continuity_context_pack_value_rank(item: &ContinuityPreparedContextPackItem) -> (u8, u8, u8) {
    crate::server::continuity_ranking_helpers::context_pack_value_rank(
        &item.pack_kind,
        &item.evidence_kinds,
        &item.why_surfaced,
    )
}

pub(super) fn continuity_response_items(
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Vec<ContinuityResponseItem> {
    let Some(message) = preferred_state else {
        return Vec::new();
    };

    match message.parsed_content.as_ref() {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => {
            let draft_packet = continuity_prepared_draft_packet(message);
            let drafts = draft_packet
                .as_ref()
                .map(|packet| packet.drafts.as_slice())
                .unwrap_or(&[]);
            let draft_file_refs = continuity_prepared_context_packet(message)
                .as_ref()
                .map(|packet| packet.file_refs.clone())
                .unwrap_or_default();
            let draft_file_labels = continuity_reference_labels(&draft_file_refs, preferred_state);
            snapshot
                .response_queue
                .iter()
                .map(|item| {
                    let mut response_item = ContinuityResponseItem::from(item);
                    if let Some(draft) = drafts.iter().find(|draft| {
                        draft.source_refs.iter().any(|draft_ref| {
                            item.source_refs
                                .iter()
                                .any(|source_ref| source_ref == draft_ref)
                        })
                    }) {
                        let draft_object_labels =
                            continuity_reference_labels(&draft.object_refs, preferred_state);
                        let prepared_draft_thread_retrieval_state =
                            thread_retrieval_state_from_refs(
                                "prepared_draft",
                                draft.approval_required_to_send,
                                &draft.source_refs,
                                &[],
                                &draft.object_refs,
                                &draft_object_labels,
                                &draft_file_refs,
                                &draft_file_labels,
                                continuity_context_freshness_for_refs(
                                    preferred_state,
                                    &draft.source_refs,
                                ),
                            );
                        let prepared_draft_summary_lines =
                            continuity_response_prepared_draft_summary_lines(
                                draft,
                                &draft_object_labels,
                                &draft_file_refs,
                                &draft_file_labels,
                                prepared_draft_thread_retrieval_state.as_ref(),
                            );
                        response_item.prepared_draft_id = Some(draft.draft_id.clone());
                        response_item.prepared_draft_summary = Some(draft.summary.clone());
                        response_item.prepared_draft_readiness = Some(draft.readiness.clone());
                        response_item.prepared_draft_body = Some(draft.body.clone());
                        response_item.prepared_draft_class = Some(draft.draft_class.clone());
                        response_item.prepared_draft_selection_reason =
                            draft.selection_reason.clone();
                        response_item.prepared_draft_available = true;
                        response_item.prepared_draft_requires_approval =
                            draft.approval_required_to_send;
                        response_item.prepared_draft_autonomy_decision = Some(
                            if draft.approval_required_to_send {
                                CompactAutonomyDecision::request_approval(
                                    Some(draft.confidence.as_str()),
                                    "Prepared draft still needs explicit approval before any outbound action.",
                                )
                            } else {
                                CompactAutonomyDecision::suggest_with_artifact(
                                    Some(draft.confidence.as_str()),
                                    "Prepared draft is ready for review before any outbound action.",
                                )
                            },
                        );
                        response_item.prepared_draft_lead_summary =
                            prepared_draft_summary_lines.first().cloned();
                        response_item.prepared_draft_summary_lines = prepared_draft_summary_lines;
                        response_item.prepared_draft_object_refs = draft.object_refs.clone();
                        response_item.prepared_draft_object_labels = draft_object_labels.clone();
                        response_item.prepared_draft_thread_retrieval_state =
                            prepared_draft_thread_retrieval_state;
                    }
                    response_item
                })
                .take(5)
                .collect()
        }
        _ => Vec::new(),
    }
}

fn continuity_response_prepared_draft_summary_lines(
    draft: &crate::prepared_draft_packet::PreparedDraftArtifact,
    object_labels: &[String],
    file_refs: &[String],
    file_labels: &[String],
    thread_retrieval_state: Option<&Value>,
) -> Vec<String> {
    let mut lines = Vec::new();
    if let Some(summary) = thread_retrieval_state
        .and_then(|state| state["summary"].as_str())
        .map(str::trim)
        .filter(|summary| !summary.is_empty())
    {
        lines.push(summary.to_string());
    }
    if let Some(scope_summary) = continuity_scope_summary_line(
        draft.memory_space.as_deref(),
        draft.author_type.as_deref(),
        draft.is_human_authored,
        draft.human_only,
    ) {
        push_unique_summary_line(&mut lines, scope_summary);
    }
    let draft_label = draft.label.trim();
    if !draft_label.is_empty() {
        let draft_label_line = format!("Draft: {draft_label}");
        push_unique_summary_line(&mut lines, draft_label_line);
    }
    if let Some(timing_summary) = continuity_follow_up_timing_summary_line(
        crate::prepared_draft_semantics::follow_up_proposal_from_draft_semantics(
            &draft.draft_class,
            &draft.response_due_hint,
        )
        .as_deref(),
        Some(draft.summary.as_str()),
    ) {
        push_unique_summary_line(&mut lines, timing_summary);
    }
    if let Some(object_anchor_summary) =
        continuity_reference_summary("Object anchors", &draft.object_refs, object_labels)
    {
        push_unique_summary_line(&mut lines, object_anchor_summary);
    }
    if let Some(file_anchor_summary) =
        continuity_reference_summary("File anchors", file_refs, file_labels)
    {
        push_unique_summary_line(&mut lines, file_anchor_summary);
    }
    let draft_summary = draft.summary.trim();
    if !draft_summary.is_empty() {
        push_unique_summary_line(&mut lines, draft_summary.to_string());
    }
    let suggested_next_action = draft.suggested_next_action.trim();
    if !suggested_next_action.is_empty() {
        push_unique_summary_line(&mut lines, format!("Next action: {suggested_next_action}"));
    }
    lines
}

fn push_unique_summary_line(lines: &mut Vec<String>, line: String) {
    if !lines.iter().any(|existing| existing == &line) {
        lines.push(line);
    }
}

fn continuity_follow_up_timing_summary_line(
    follow_up_at: Option<&str>,
    existing_summary: Option<&str>,
) -> Option<String> {
    crate::prepared_draft_semantics::follow_up_timing_summary_line_unless_present(
        follow_up_at,
        existing_summary,
    )
}

fn continuity_scope_summary_line(
    memory_space: Option<&str>,
    author_type: Option<&str>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
) -> Option<String> {
    crate::server::scope_helpers::scope_summary_line(
        memory_space,
        author_type,
        is_human_authored,
        human_only,
    )
}

fn continuity_reference_summary(
    prefix: &str,
    refs: &[String],
    labels: &[String],
) -> Option<String> {
    crate::server::summary_helpers::reference_summary_line(prefix, labels, refs, Some(2), true)
}

pub(super) fn continuity_prepared_draft_items(
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Vec<ContinuityPreparedDraftItem> {
    let Some(message) = preferred_state else {
        return Vec::new();
    };

    continuity_prepared_draft_packet(message)
        .map(|packet| {
            let mut items = packet
                .drafts
                .iter()
                .map(|draft| {
                    let mut item = ContinuityPreparedDraftItem::from(draft);
                    item.object_labels =
                        continuity_reference_labels(&item.object_refs, preferred_state);
                    item
                })
                .collect::<Vec<_>>();
            items.sort_by(|a, b| {
                crate::server::continuity_ranking_helpers::continuity_prepared_draft_rank(
                    &a.draft_class,
                    a.selection_reason.as_deref(),
                    a.memory_space.as_deref(),
                    a.author_mask.as_deref(),
                    a.author_type.as_deref(),
                    a.author_id.as_deref(),
                    a.is_human_authored,
                    a.human_only,
                    &a.response_due_hint,
                    continuity_prepared_draft_file_rank(a, preferred_state),
                    &a.source_refs,
                )
                .cmp(
                    &crate::server::continuity_ranking_helpers::continuity_prepared_draft_rank(
                        &b.draft_class,
                        b.selection_reason.as_deref(),
                        b.memory_space.as_deref(),
                        b.author_mask.as_deref(),
                        b.author_type.as_deref(),
                        b.author_id.as_deref(),
                        b.is_human_authored,
                        b.human_only,
                        &b.response_due_hint,
                        continuity_prepared_draft_file_rank(b, preferred_state),
                        &b.source_refs,
                    ),
                )
                .then_with(|| a.title.cmp(&b.title))
                .then_with(|| a.id.cmp(&b.id))
            });
            items.truncate(4);
            items
        })
        .unwrap_or_default()
}

fn continuity_prepared_context_packet(
    message: &DashboardContinuityMessage,
) -> Option<PreparedContextPacket> {
    match message.parsed_content.as_ref() {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => snapshot
            .prepared_context_packet
            .clone()
            .or_else(|| simulator_prepared_context_preview_from_state(message)),
        _ => None,
    }
}

fn continuity_prepared_draft_packet(
    message: &DashboardContinuityMessage,
) -> Option<PreparedDraftPacket> {
    match message.parsed_content.as_ref() {
        Some(DashboardContinuityParsedContent::StateSnapshot(snapshot)) => snapshot
            .prepared_draft_packet
            .clone()
            .or_else(|| simulator_prepared_draft_preview_from_state(message)),
        _ => None,
    }
}

pub(super) fn continuity_primary_mode(
    priority_card: Option<&ContinuityPriorityCard>,
    panel_kind: &str,
) -> &'static str {
    if priority_card.is_some() {
        "priority_card"
    } else if panel_kind == "briefing_bar" {
        "briefing_bar"
    } else {
        "continuity_panel"
    }
}

fn latest_message_of_type<'a>(messages: &'a [Value], message_type: &str) -> Option<&'a Value> {
    messages
        .iter()
        .find(|message| message["type"].as_str() == Some(message_type))
}

fn compact_continuity_message(message: &Value) -> DashboardContinuityMessage {
    let message_type = message["type"].as_str().unwrap_or_default().to_string();
    let content = message["content"].clone();
    DashboardContinuityMessage {
        id: message["id"].as_str().unwrap_or_default().to_string(),
        thread_id: message["thread_id"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        timestamp: message["timestamp"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        r#type: message_type.clone(),
        subtype: message["subtype"].as_str().unwrap_or_default().to_string(),
        content: content.clone(),
        parsed_content: parse_continuity_content(&message_type, &content),
        synthesizer_handoff: parse_synthesizer_handoff(&message["metadata"]),
        metadata: message["metadata"].clone(),
        views: message["views"].clone(),
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum NormalizedContinuityRefKind {
    Thread,
    Message,
    Calendar,
    File,
}

struct NormalizedContinuityRef {
    kind: NormalizedContinuityRefKind,
    value: String,
}

fn normalize_continuity_ref(raw: &str) -> Option<NormalizedContinuityRef> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(value) = trimmed.strip_prefix("calendar:") {
        let value = value.trim();
        if value.is_empty() {
            return None;
        }
        return Some(NormalizedContinuityRef {
            kind: NormalizedContinuityRefKind::Calendar,
            value: value.to_string(),
        });
    }
    if let Some(value) = trimmed.strip_prefix("file:") {
        let value = value.trim();
        if value.is_empty() {
            return None;
        }
        return Some(NormalizedContinuityRef {
            kind: NormalizedContinuityRefKind::File,
            value: value.to_string(),
        });
    }
    for prefix in ["thread:", "conversation:"] {
        if let Some(value) = trimmed.strip_prefix(prefix) {
            let value = value.trim();
            if value.is_empty() {
                return None;
            }
            return Some(NormalizedContinuityRef {
                kind: NormalizedContinuityRefKind::Thread,
                value: value.to_string(),
            });
        }
    }
    for prefix in ["message:", "msg:", "email:", "note:"] {
        if let Some(value) = trimmed.strip_prefix(prefix) {
            let value = value.trim();
            if value.is_empty() {
                return None;
            }
            return Some(NormalizedContinuityRef {
                kind: NormalizedContinuityRefKind::Message,
                value: value.to_string(),
            });
        }
    }
    Some(NormalizedContinuityRef {
        kind: NormalizedContinuityRefKind::Message,
        value: trimmed.to_string(),
    })
}

fn humanize_continuity_ref_value(value: &str) -> String {
    let normalized_path = value.replace('\\', "/");
    if normalized_path.contains('/') {
        if let Some(filename) = normalized_path
            .split('/')
            .filter(|segment| !segment.is_empty())
            .next_back()
        {
            if !filename.is_empty() {
                return filename.to_string();
            }
        }
    }
    value
        .replace(['-', '_'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn continuity_message_display_title(message: &DashboardContinuityMessage) -> Option<String> {
    let content_title = message
        .content
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let metadata_title = message
        .metadata
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let content_name = message
        .content
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    content_title.or(metadata_title).or(content_name)
}

fn refs_match(refs: &[String], raw: &str, normalized: &NormalizedContinuityRef) -> bool {
    refs.iter().any(|candidate| {
        let candidate = candidate.trim();
        candidate == raw || candidate == normalized.value
    })
}

fn continuity_label_from_snapshot(
    raw: &str,
    normalized: &NormalizedContinuityRef,
    snapshot: &StateSnapshotContent,
) -> Option<String> {
    snapshot
        .decision_queue
        .iter()
        .find(|item| item.id == normalized.value || refs_match(&item.source_refs, raw, normalized))
        .map(|item| item.label.clone())
        .or_else(|| {
            snapshot
                .response_queue
                .iter()
                .find(|item| {
                    item.id == normalized.value || refs_match(&item.source_refs, raw, normalized)
                })
                .map(|item| item.label.clone())
        })
        .or_else(|| {
            snapshot
                .active_commitments
                .iter()
                .find(|item| refs_match(&item.source_refs, raw, normalized))
                .map(|item| item.label.clone())
        })
        .or_else(|| {
            snapshot
                .critical_changes
                .iter()
                .find(|item| refs_match(&item.source_refs, raw, normalized))
                .map(|item| item.label.clone())
        })
        .or_else(|| {
            snapshot
                .context_panel_items
                .iter()
                .find(|item| {
                    item.id == normalized.value || refs_match(&item.source_refs, raw, normalized)
                })
                .map(|item| item.label.clone())
        })
        .or_else(|| {
            snapshot
                .watcher_signals
                .iter()
                .find(|item| {
                    item.id == normalized.value
                        || item.thread_id == normalized.value
                        || refs_match(&item.source_refs, raw, normalized)
                })
                .map(|item| item.signal_key.clone())
        })
        .or_else(|| {
            snapshot.prepared_draft_packet.as_ref().and_then(|packet| {
                packet
                    .drafts
                    .iter()
                    .find(|item| refs_match(&item.source_refs, raw, normalized))
                    .map(|item| item.label.clone())
            })
        })
        .or_else(|| {
            snapshot
                .prepared_context_packet
                .as_ref()
                .and_then(|packet| {
                    packet
                        .packs
                        .iter()
                        .find(|item| {
                            refs_match(&item.anchor_refs, raw, normalized)
                                || refs_match(&item.source_refs, raw, normalized)
                                || refs_match(&item.reference_refs, raw, normalized)
                        })
                        .map(|item| item.title.clone())
                })
        })
}

fn continuity_target_label(
    refs: &[String],
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Option<String> {
    let state = preferred_state?;
    for raw_ref in refs {
        let normalized = match normalize_continuity_ref(raw_ref) {
            Some(value) => value,
            None => continue,
        };
        if normalized.kind == NormalizedContinuityRefKind::Message
            && (state.id == normalized.value || state.thread_id == normalized.value)
        {
            if let Some(title) = continuity_message_display_title(state) {
                return Some(title);
            }
        }
        if let Some(snapshot) = state
            .parsed_content
            .as_ref()
            .and_then(|content| match content {
                DashboardContinuityParsedContent::StateSnapshot(snapshot) => Some(snapshot),
                DashboardContinuityParsedContent::StateSynthesis(_) => None,
            })
        {
            if let Some(label) = continuity_label_from_snapshot(raw_ref, &normalized, snapshot) {
                return Some(label);
            }
        }
        let humanized = humanize_continuity_ref_value(&normalized.value);
        if humanized.is_empty() {
            continue;
        }
        return Some(match normalized.kind {
            NormalizedContinuityRefKind::Thread => format!("Thread: {humanized}"),
            NormalizedContinuityRefKind::Message => humanized,
            NormalizedContinuityRefKind::Calendar => "Calendar".to_string(),
            NormalizedContinuityRefKind::File => humanized,
        });
    }
    None
}

pub(super) fn continuity_reference_labels(
    refs: &[String],
    preferred_state: Option<&DashboardContinuityMessage>,
) -> Vec<String> {
    let mut labels = Vec::new();
    for raw_ref in refs {
        let Some(label) = continuity_target_label(std::slice::from_ref(raw_ref), preferred_state)
        else {
            continue;
        };
        if !labels.iter().any(|existing| existing == &label) {
            labels.push(label);
        }
    }
    labels
}

fn parse_continuity_content(
    message_type: &str,
    content: &Value,
) -> Option<DashboardContinuityParsedContent> {
    match message_type {
        AFP_TYPE_STATE_SNAPSHOT => serde_json::from_value::<StateSnapshotContent>(content.clone())
            .ok()
            .map(DashboardContinuityParsedContent::StateSnapshot),
        AFP_TYPE_STATE_SYNTHESIS => {
            serde_json::from_value::<AfpStateSynthesisContent>(content.clone())
                .ok()
                .map(DashboardContinuityParsedContent::StateSynthesis)
        }
        _ => None,
    }
}

fn parse_synthesizer_handoff(metadata: &Value) -> Option<SynthesizerToMasterHandoff> {
    serde_json::from_value::<SynthesizerToMasterHandoff>(
        metadata.get("synthesizer_handoff")?.clone(),
    )
    .ok()
}

fn simulator_promotion_record_for_target<'a>(
    state: &'a DashboardContinuityMessage,
    target_kind: &str,
) -> Option<&'a serde_json::Map<String, Value>> {
    state
        .metadata
        .get("simulator_promotions")
        .and_then(Value::as_array)
        .and_then(|promotions| {
            promotions.iter().find(|promotion| {
                promotion
                    .get("target_kind")
                    .and_then(Value::as_str)
                    .map(|value| value == target_kind)
                    .unwrap_or(false)
            })
        })
        .and_then(Value::as_object)
}

fn simulator_review_surface_is_available(
    state: &DashboardContinuityMessage,
    target_kind: &str,
) -> bool {
    simulator_promotion_record_for_target(state, target_kind)
        .and_then(|promotion| promotion.get("review_surface"))
        .and_then(Value::as_object)
        .and_then(|surface| surface.get("review_available"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

pub(crate) fn simulator_prepared_context_preview_from_state(
    state: &DashboardContinuityMessage,
) -> Option<PreparedContextPacket> {
    simulator_promotion_record_for_target(state, "prepared_context")?;
    serde_json::from_value::<PreparedContextPacket>(
        state
            .metadata
            .get("simulator_prepared_context_preview")?
            .clone(),
    )
    .ok()
}

pub(crate) fn simulator_prepared_draft_preview_from_state(
    state: &DashboardContinuityMessage,
) -> Option<PreparedDraftPacket> {
    simulator_promotion_record_for_target(state, "prepared_draft")?;
    serde_json::from_value::<PreparedDraftPacket>(
        state
            .metadata
            .get("simulator_prepared_draft_preview")?
            .clone(),
    )
    .ok()
}

pub(crate) fn simulator_reversible_action_preview_from_state(
    state: &DashboardContinuityMessage,
) -> Option<Value> {
    if !simulator_review_surface_is_available(state, "reversible_action") {
        return None;
    }
    state
        .metadata
        .get("simulator_reversible_action_preview")
        .cloned()
        .filter(|value| !value.is_null())
}

pub(crate) fn simulator_approval_review_preview_from_state(
    state: &DashboardContinuityMessage,
) -> Option<Value> {
    if !simulator_review_surface_is_available(state, "approval_required") {
        return None;
    }
    state
        .metadata
        .get("simulator_approval_review_preview")
        .cloned()
        .filter(|value| !value.is_null())
}

pub(super) fn continuity_brief_from_state(
    state: Option<&DashboardContinuityMessage>,
) -> Option<DashboardContinuityBrief> {
    let state = state?;
    let field_engine_primary_type = continuity_field_engine_primary_type(state);
    let field_engine_summary = continuity_field_engine_summary(state);
    match state.parsed_content.as_ref()? {
        DashboardContinuityParsedContent::StateSnapshot(snapshot) => {
            let default_title = snapshot
                .suggested_actions
                .first()
                .cloned()
                .unwrap_or_else(|| snapshot.snapshot_kind.clone());
            Some(DashboardContinuityBrief {
                source_type: state.r#type.clone(),
                title: continuity_brief_title(
                    &default_title,
                    Some(snapshot.snapshot_kind.as_str()),
                    field_engine_primary_type.as_deref(),
                    field_engine_summary.as_deref(),
                ),
                decision_count: snapshot.decision_queue.len() as u32,
                commitment_count: snapshot.active_commitments.len() as u32,
                critical_change_count: snapshot.critical_changes.len() as u32,
                suggested_actions: snapshot.suggested_actions.clone(),
                staleness_at: Some(snapshot.staleness_at.clone()),
            })
        }
        DashboardContinuityParsedContent::StateSynthesis(synthesis) => {
            let default_title = synthesis.headline.clone();
            Some(DashboardContinuityBrief {
                source_type: state.r#type.clone(),
                title: continuity_brief_title(
                    &default_title,
                    None,
                    field_engine_primary_type.as_deref(),
                    field_engine_summary.as_deref(),
                ),
                decision_count: synthesis.pending_decision_count,
                commitment_count: synthesis.active_task_count,
                critical_change_count: synthesis.unread_alert_count,
                suggested_actions: synthesis.focus_items.clone(),
                staleness_at: Some(synthesis.synthesized_at.clone()),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state_snapshot::{StateSnapshotDecisionItem, StateSnapshotResponseItem};

    #[test]
    fn continuity_message_types_include_additive_state_snapshot() {
        let types = continuity_message_types();
        assert!(types.contains(&AFP_TYPE_STATE_SYNTHESIS));
        assert!(types.contains(&AFP_TYPE_STATE_SNAPSHOT));
        assert!(types.contains(&AFP_TYPE_SYNTHESIS_INVALIDATION_EVENT));

        let synthesis_idx = types
            .iter()
            .position(|t| *t == AFP_TYPE_STATE_SYNTHESIS)
            .expect("state_synthesis type should be present");
        let snapshot_idx = types
            .iter()
            .position(|t| *t == AFP_TYPE_STATE_SNAPSHOT)
            .expect("state_snapshot type should be present");
        let invalidation_idx = types
            .iter()
            .position(|t| *t == AFP_TYPE_SYNTHESIS_INVALIDATION_EVENT)
            .expect("synthesis_invalidation_event type should be present");

        assert!(
            snapshot_idx > synthesis_idx,
            "additive state_snapshot should follow legacy state_synthesis in continuity ordering"
        );
        assert!(
            invalidation_idx > snapshot_idx,
            "invalidation markers should sort after the synthesized state artifacts they refer to"
        );
    }

    #[test]
    fn continuity_state_summary_prefers_state_snapshot_when_present() {
        let messages = vec![
            json!({
                "id": "synthesis_1",
                "thread_id": "continuity:state:user_01",
                "timestamp": "2026-06-03T09:00:00Z",
                "type": AFP_TYPE_STATE_SYNTHESIS,
                "subtype": "",
                "content": {
                    "synthesized_at": "2026-06-03T09:00:00Z",
                    "active_task_count": 2,
                    "pending_decision_count": 1,
                    "unread_alert_count": 0,
                    "calendar_pressure": "moderate",
                    "headline": "Legacy synthesis",
                    "focus_items": ["Review one decision"]
                },
                "metadata": {},
                "views": []
            }),
            json!({
                "id": "snapshot_1",
                "thread_id": "continuity:state:user_01",
                "timestamp": "2026-06-03T10:00:00Z",
                "type": AFP_TYPE_STATE_SNAPSHOT,
                "subtype": "homepage_briefing",
                "content": {
                    "snapshot_kind": "homepage_briefing",
                    "time_window": "today",
                    "sources": ["decision_1"],
                    "decision_queue": [],
                    "active_commitments": [],
                    "critical_changes": [],
                    "suggested_actions": ["Review schedule"],
                    "confidence_notes": ["Calendar is current"],
                    "staleness_at": "2026-06-03T12:00:00Z"
                },
                "metadata": {
                    "synthesizer_handoff": {
                        "snapshot_ref": "snapshot_1",
                        "view_id": "homepage:state:user_01",
                        "confidence": "medium",
                        "surface_recommendation": "decision_queue",
                        "suggested_next_actions": ["Review schedule"],
                        "escalation_required": true
                    }
                },
                "views": []
            }),
        ];

        let summary = continuity_state_summary(&messages);
        assert_eq!(
            summary.latest_state_snapshot_ref.as_deref(),
            Some("snapshot_1")
        );
        assert_eq!(
            summary.latest_state_synthesis_ref.as_deref(),
            Some("synthesis_1")
        );
        assert_eq!(summary.preferred_state_type, AFP_TYPE_STATE_SNAPSHOT);
        assert_eq!(
            summary
                .preferred_state_brief
                .as_ref()
                .map(|brief| brief.title.as_str()),
            Some("Review schedule")
        );
        assert_eq!(
            summary
                .preferred_synthesizer_handoff
                .as_ref()
                .map(|handoff| handoff.surface_recommendation.as_str()),
            Some("decision_queue")
        );
        assert_eq!(
            summary
                .latest_state_snapshot
                .as_ref()
                .map(|message| message.id.as_str()),
            Some("snapshot_1")
        );
        assert!(matches!(
            summary
                .latest_state_snapshot
                .as_ref()
                .and_then(|message| message.parsed_content.as_ref()),
            Some(DashboardContinuityParsedContent::StateSnapshot(_))
        ));
        assert_eq!(
            summary
                .latest_state_snapshot
                .as_ref()
                .and_then(|message| message.synthesizer_handoff.as_ref())
                .map(|handoff| handoff.snapshot_ref.as_str()),
            Some("snapshot_1")
        );
        assert_eq!(
            summary
                .latest_state_synthesis
                .as_ref()
                .map(|message| message.id.as_str()),
            Some("synthesis_1")
        );
        assert!(matches!(
            summary
                .latest_state_synthesis
                .as_ref()
                .and_then(|message| message.parsed_content.as_ref()),
            Some(DashboardContinuityParsedContent::StateSynthesis(_))
        ));
    }

    #[test]
    fn continuity_state_summary_falls_back_to_legacy_state_synthesis() {
        let messages = vec![json!({
            "id": "synthesis_only",
            "thread_id": "continuity:state:user_01",
            "timestamp": "2026-06-03T10:00:00Z",
            "type": AFP_TYPE_STATE_SYNTHESIS,
            "subtype": "",
            "content": {
                "synthesized_at": "2026-06-03T10:00:00Z",
                "active_task_count": 2,
                "pending_decision_count": 1,
                "unread_alert_count": 0,
                "calendar_pressure": "medium",
                "headline": "Legacy synthesis",
                "focus_items": ["Review schedule"]
            },
            "metadata": { "store": true },
            "views": []
        })];

        let summary = continuity_state_summary(&messages);
        assert_eq!(summary.preferred_state_type, AFP_TYPE_STATE_SYNTHESIS);
        assert_eq!(
            summary
                .preferred_state_brief
                .as_ref()
                .map(|brief| brief.source_type.as_str()),
            Some(AFP_TYPE_STATE_SYNTHESIS)
        );
        assert_eq!(summary.latest_state_snapshot_ref.as_deref(), None);
        assert_eq!(
            summary
                .latest_state_synthesis
                .as_ref()
                .and_then(|message| message.content["headline"].as_str()),
            Some("Legacy synthesis")
        );
    }

    #[test]
    fn continuity_state_summary_applies_watcher_resolution_events_to_latest_snapshot() {
        let messages = vec![json!({
            "id": "snapshot_1",
            "thread_id": "continuity:state:user_01",
            "timestamp": "2026-06-03T10:00:00Z",
            "type": AFP_TYPE_STATE_SNAPSHOT,
            "subtype": "homepage_briefing",
            "content": {
                "snapshot_kind": "homepage_briefing",
                "time_window": "today",
                "sources": [],
                "decision_queue": [],
                "response_queue": [],
                "active_commitments": [],
                "critical_changes": [],
                "context_panel_items": [],
                "watcher_signals": [
                    {
                        "id": "alert_resolved",
                        "signal_key": "watcher:deadline",
                        "category": "schedule",
                        "freshness": "fresh",
                        "urgency": "today",
                        "confidence": "high",
                        "urgency_hint": "Needs attention today.",
                        "suppression_status": "active",
                        "suppression_reason": "",
                        "escalation_status": "required",
                        "escalation_reason": "Time-sensitive.",
                        "decrypt_needed": false,
                        "source_type": "watcher_alert",
                        "source_subtype": "deadline_due_today",
                        "thread_id": "watcher:user_1",
                        "source_refs": ["alert_resolved"]
                    },
                    {
                        "id": "alert_live",
                        "signal_key": "watcher:deadline",
                        "category": "schedule",
                        "freshness": "fresh",
                        "urgency": "today",
                        "confidence": "high",
                        "urgency_hint": "Still active.",
                        "suppression_status": "active",
                        "suppression_reason": "",
                        "escalation_status": "required",
                        "escalation_reason": "Time-sensitive.",
                        "decrypt_needed": false,
                        "source_type": "watcher_alert",
                        "source_subtype": "deadline_due_today",
                        "thread_id": "watcher:user_1",
                        "source_refs": ["alert_live"]
                    }
                ],
                "continuity_metrics": {
                    "recent_signal_count": 2,
                    "fresh_signal_count": 2,
                    "burst_signal_count": 2,
                    "reactivation_signal_count": 0,
                    "deadline_signal_count": 2,
                    "activity_velocity": 0.5,
                    "urgency_acceleration": 0.5,
                    "context_switch_rate": 0.5,
                    "unresolved_queue_pressure": 0.0,
                    "follow_up_drift_score": 0.4
                },
                "suggested_actions": ["Review schedule"],
                "confidence_notes": [],
                "state_fields": [],
                "staleness_at": "2026-06-03T10:00:00Z"
            },
            "metadata": { "store": true },
            "views": []
        })];
        let watcher_resolution_messages = vec![json!({
            "id": "resolution_1",
            "thread_id": "watcher:user_1",
            "timestamp": "2026-06-03T10:05:00Z",
            "type": "watcher_resolution_event",
            "subtype": "accepted",
            "content": { "resolved_message_id": "alert_resolved" },
            "metadata": {},
            "views": []
        })];

        let summary = continuity_state_summary_with_watcher_resolutions(
            &messages,
            &watcher_resolution_messages,
        );
        let snapshot = summary
            .latest_state_snapshot
            .as_ref()
            .and_then(|message| message.parsed_content.as_ref())
            .and_then(|parsed| match parsed {
                DashboardContinuityParsedContent::StateSnapshot(snapshot) => Some(snapshot),
                DashboardContinuityParsedContent::StateSynthesis(_) => None,
            })
            .expect("snapshot should remain available");

        assert_eq!(snapshot.watcher_signals.len(), 1);
        assert_eq!(snapshot.watcher_signals[0].id, "alert_live");
        assert_eq!(snapshot.continuity_metrics.recent_signal_count, 1);
        assert_eq!(snapshot.continuity_metrics.fresh_signal_count, 1);
        assert_eq!(snapshot.continuity_metrics.deadline_signal_count, 1);
    }

    #[test]
    fn continuity_brief_prefers_field_engine_summary_when_snapshot_title_is_generic() {
        let state = DashboardContinuityMessage {
            id: "snapshot_knowledge".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: AFP_TYPE_STATE_SNAPSHOT.to_string(),
            subtype: "homepage_briefing".to_string(),
            content: json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_knowledge".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: vec![crate::state_snapshot::StateSnapshotContextItem {
                        id: "ctx_aurora".to_string(),
                        label: "Dormant Aurora context".to_string(),
                        why_surfaced: "Aurora context resurfaced from the same project."
                            .to_string(),
                        confidence: "medium".to_string(),
                        freshness: "reactivated".to_string(),
                        relation_path: vec!["same_project".to_string()],
                        source_refs: vec!["thread:aurora".to_string()],
                        decrypt_needed: false,
                    }],
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: vec![],
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(
                        crate::prepared_context_packet::PreparedContextPacket {
                            packet_kind: "continuity_context".to_string(),
                            ready: true,
                            summary: "Prepared context ready.".to_string(),
                            anchor_refs: vec!["msg_1".to_string()],
                            source_refs: vec!["msg_1".to_string()],
                            decision_refs: Vec::new(),
                            decision_history_refs: Vec::new(),
                            response_refs: vec!["msg_1".to_string()],
                            follow_up_refs: Vec::new(),
                            relationship_refs: Vec::new(),
                            project_refs: Vec::new(),
                            reference_refs: Vec::new(),
                            object_refs: Vec::new(),
                            thread_refs: Vec::new(),
                            file_refs: vec!["file:docs/launch-brief.md".to_string()],
                            packs: Vec::new(),
                            decrypt_needed_count: 0,
                            memory_space: None,
                            author_mask: None,
                            author_type: None,
                            author_id: None,
                            is_human_authored: None,
                            human_only: None,
                            ..crate::prepared_context_packet::PreparedContextPacket::default()
                        },
                    ),
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                field_engine_ready: true,
                field_engine_summary: Some(
                    "Knowledge field shows active pressure with density 0.62 and momentum -0.16."
                        .to_string(),
                ),
                ..Default::default()
            }),
            metadata: json!({}),
            views: json!([]),
        };

        let brief = continuity_brief_from_state(Some(&state)).expect("brief should be derived");
        assert_eq!(
            brief.title,
            "Knowledge field shows active pressure with density 0.62 and momentum -0.16."
        );
    }

    #[test]
    fn continuity_brief_prefers_field_engine_summary_when_synthesis_headline_is_generic() {
        let state = DashboardContinuityMessage {
            id: "synthesis_project".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: AFP_TYPE_STATE_SYNTHESIS.to_string(),
            subtype: String::new(),
            content: json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSynthesis(
                crate::state_synthesizer::AfpStateSynthesisContent {
                    synthesized_at: "2026-06-03T10:00:00Z".to_string(),
                    active_task_count: 1,
                    pending_decision_count: 0,
                    unread_alert_count: 0,
                    calendar_pressure: "moderate".to_string(),
                    headline: "Legacy synthesis".to_string(),
                    focus_items: vec!["Check project pressure".to_string()],
                    para_overview: None,
                },
            )),
            synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                field_engine_ready: true,
                field_engine_summary: Some(
                    "Project field shows active pressure with density 0.63 and momentum -0.32."
                        .to_string(),
                ),
                ..Default::default()
            }),
            metadata: json!({}),
            views: json!([]),
        };

        let brief = continuity_brief_from_state(Some(&state)).expect("brief should be derived");
        assert_eq!(
            brief.title,
            "Project field shows active pressure with density 0.63 and momentum -0.32."
        );
    }

    #[test]
    fn continuity_brief_falls_back_to_field_engine_pressure_label_when_summary_is_missing() {
        let state = DashboardContinuityMessage {
            id: "snapshot_obligation".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: AFP_TYPE_STATE_SNAPSHOT.to_string(),
            subtype: "homepage_briefing".to_string(),
            content: json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_obligation".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: vec![crate::state_snapshot::StateSnapshotContextItem {
                        id: "ctx_aurora".to_string(),
                        label: "Dormant Aurora context".to_string(),
                        why_surfaced: "Aurora context resurfaced from the same project."
                            .to_string(),
                        confidence: "medium".to_string(),
                        freshness: "reactivated".to_string(),
                        relation_path: vec!["same_project".to_string()],
                        source_refs: vec!["thread:aurora".to_string()],
                        decrypt_needed: false,
                    }],
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: vec![],
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                field_engine_ready: true,
                field_engine_primary_type: Some("obligation".to_string()),
                field_engine_summary: None,
                ..Default::default()
            }),
            metadata: json!({}),
            views: json!([]),
        };

        let brief = continuity_brief_from_state(Some(&state)).expect("brief should be derived");
        assert_eq!(brief.title, "Obligation pressure");
    }

    #[test]
    fn continuity_brief_falls_back_to_metadata_field_engine_pressure_label_when_summary_is_missing()
    {
        let state = DashboardContinuityMessage {
            id: "snapshot_interest".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: AFP_TYPE_STATE_SNAPSHOT.to_string(),
            subtype: "homepage_briefing".to_string(),
            content: json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_interest".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: vec![crate::state_snapshot::StateSnapshotContextItem {
                        id: "ctx_aurora_linked".to_string(),
                        label: "Dormant Aurora context".to_string(),
                        why_surfaced: "Aurora context resurfaced from the same project."
                            .to_string(),
                        confidence: "medium".to_string(),
                        freshness: "reactivated".to_string(),
                        relation_path: vec!["same_project".to_string()],
                        source_refs: vec!["thread:aurora".to_string()],
                        decrypt_needed: false,
                    }],
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: vec![],
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: json!({
                "field_engine_summary": {
                    "primary_field_type": "interest"
                }
            }),
            views: json!([]),
        };

        let brief = continuity_brief_from_state(Some(&state)).expect("brief should be derived");
        assert_eq!(brief.title, "Interest pressure");
    }

    #[test]
    fn preferred_continuity_state_message_prefers_snapshot_then_falls_back() {
        let snapshot = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: AFP_TYPE_STATE_SNAPSHOT.to_string(),
            subtype: "homepage_briefing".to_string(),
            content: json!({}),
            parsed_content: None,
            synthesizer_handoff: None,
            metadata: json!({}),
            views: json!([]),
        };
        let synthesis = DashboardContinuityMessage {
            id: "synthesis_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T09:00:00Z".to_string(),
            r#type: AFP_TYPE_STATE_SYNTHESIS.to_string(),
            subtype: String::new(),
            content: json!({}),
            parsed_content: None,
            synthesizer_handoff: None,
            metadata: json!({}),
            views: json!([]),
        };

        let with_snapshot = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some(snapshot.id.clone()),
            latest_state_synthesis_ref: Some(synthesis.id.clone()),
            latest_state_snapshot: Some(snapshot.clone()),
            latest_state_synthesis: Some(synthesis.clone()),
            preferred_state_type: AFP_TYPE_STATE_SNAPSHOT.to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };
        assert_eq!(
            preferred_continuity_state_message(&with_snapshot)
                .as_ref()
                .map(|message| message.id.as_str()),
            Some("snapshot_1")
        );

        let synthesis_only = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: Some(synthesis.id.clone()),
            latest_state_snapshot: None,
            latest_state_synthesis: Some(synthesis),
            preferred_state_type: AFP_TYPE_STATE_SYNTHESIS.to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };
        assert_eq!(
            preferred_continuity_state_message(&synthesis_only)
                .as_ref()
                .map(|message| message.id.as_str()),
            Some("synthesis_1")
        );
    }

    #[test]
    fn continuity_panel_kind_prioritizes_approval_then_surface_hint() {
        assert_eq!(
            continuity_panel_kind(Some("decision_queue"), true),
            "approval_queue"
        );
        assert_eq!(
            continuity_panel_kind(Some("decision_queue"), false),
            "decision_queue"
        );
        assert_eq!(
            continuity_panel_kind(Some("context_panel"), false),
            "context_panel"
        );
        assert_eq!(
            continuity_panel_kind(Some("response_queue"), false),
            "response_queue"
        );
        assert_eq!(
            continuity_panel_kind(Some("homepage"), false),
            "briefing_bar"
        );
        assert_eq!(continuity_panel_kind(None, false), "briefing_bar");
    }

    #[test]
    fn continuity_priority_item_is_only_built_for_non_briefing_panels() {
        let brief = DashboardContinuityBrief {
            source_type: "state_snapshot".to_string(),
            title: "Review your schedule".to_string(),
            decision_count: 1,
            commitment_count: 0,
            critical_change_count: 0,
            suggested_actions: vec!["Review your schedule".to_string()],
            staleness_at: None,
        };
        let handoff = SynthesizerToMasterHandoff {
            snapshot_ref: "snapshot_1".to_string(),
            view_id: "homepage:state:user_01".to_string(),
            confidence: "medium".to_string(),
            surface_recommendation: "decision_queue".to_string(),
            suggested_mood: None,
            suggested_next_actions: vec!["Review your schedule".to_string()],
            escalation_required: true,
            approval_boundary: None,
            autonomy_decision: None,
            browser_action_candidate: None,
            prepared_context_ready: false,
            prepared_context_summary: None,
            prepared_draft_ready: false,
            prepared_draft_summary: None,
            follow_up_write_candidate: None,
            decrypt_trace: None,
            simulated_projection_ready: false,
            simulated_projection_summary: None,
            simulated_projection_risks: Vec::new(),
            simulated_projection_opportunities: Vec::new(),
            simulated_actionable_event_count: None,
            simulated_review_surfaces_ready: false,
            simulated_rollout_stage: None,
            simulated_calibration_mode: None,
            simulated_review_summary: None,
            simulated_calibration_notes: Vec::new(),
            simulated_promotion_candidate_count: None,
            field_engine_ready: false,
            field_engine_primary_type: None,
            field_engine_summary: None,
            field_engine_risks: Vec::new(),
            field_engine_opportunities: Vec::new(),
            empathy_context: None,
        };

        assert!(
            continuity_priority_item(
                None,
                Some(&brief),
                Some(&handoff),
                "briefing_bar",
                &[],
                &[],
                &[],
                &[],
            )
            .is_none()
        );

        let item = continuity_priority_item(
            None,
            Some(&brief),
            Some(&handoff),
            "approval_queue",
            &[ContinuityActionItem {
                id: "decision_1".to_string(),
                title: "Review your schedule".to_string(),
                category: "decision".to_string(),
                urgency: "medium".to_string(),
                confidence: "medium".to_string(),
                requires_approval: true,
                suggested_action: "Review your schedule".to_string(),
                surface_hint: Some("decision_queue".to_string()),
                autonomy_decision: None,
                source_refs: vec!["msg_1".to_string()],
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }],
            &[],
            &[],
            &[],
        )
        .expect("priority item should be produced");
        assert_eq!(item.panel_kind, "approval_queue");
        assert!(item.requires_approval);
        assert_eq!(
            item.suggested_action.as_deref(),
            Some("Review your schedule")
        );
        assert_eq!(item.source_refs, vec!["msg_1".to_string()]);
    }

    #[test]
    fn continuity_priority_item_prefers_response_context_for_response_queue() {
        let brief = DashboardContinuityBrief {
            source_type: "state_snapshot".to_string(),
            title: "General continuity brief".to_string(),
            decision_count: 0,
            commitment_count: 0,
            critical_change_count: 0,
            suggested_actions: vec!["Reply to team".to_string()],
            staleness_at: None,
        };
        let handoff = SynthesizerToMasterHandoff {
            snapshot_ref: "snapshot_2".to_string(),
            view_id: "homepage:state:user_01".to_string(),
            confidence: "high".to_string(),
            surface_recommendation: "response_queue".to_string(),
            suggested_mood: None,
            suggested_next_actions: vec!["Reply to team".to_string()],
            escalation_required: false,
            approval_boundary: None,
            autonomy_decision: None,
            browser_action_candidate: None,
            prepared_context_ready: false,
            prepared_context_summary: None,
            prepared_draft_ready: true,
            prepared_draft_summary: Some("Draft ready for Slack follow-up".to_string()),
            follow_up_write_candidate: None,
            decrypt_trace: None,
            simulated_projection_ready: false,
            simulated_projection_summary: None,
            simulated_projection_risks: Vec::new(),
            simulated_projection_opportunities: Vec::new(),
            simulated_actionable_event_count: None,
            simulated_review_surfaces_ready: false,
            simulated_rollout_stage: None,
            simulated_calibration_mode: None,
            simulated_review_summary: None,
            simulated_calibration_notes: Vec::new(),
            simulated_promotion_candidate_count: None,
            field_engine_ready: false,
            field_engine_primary_type: None,
            field_engine_summary: None,
            field_engine_risks: Vec::new(),
            field_engine_opportunities: Vec::new(),
            empathy_context: None,
        };

        let item = continuity_priority_item(
            None,
            Some(&brief),
            Some(&handoff),
            "response_queue",
            &[],
            &[ContinuityResponseItem {
                id: "resp_1".to_string(),
                title: "Reply to design team".to_string(),
                channel: "slack".to_string(),
                urgency: "high".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "today".to_string(),
                suggested_action: "Reply in thread".to_string(),
                autonomy_decision: None,
                prepared_draft_id: Some("draft_1".to_string()),
                prepared_draft_summary: Some(
                    "Acknowledges blocker and proposes next step".to_string(),
                ),
                prepared_draft_readiness: Some("ready".to_string()),
                prepared_draft_body: None,
                prepared_draft_class: Some("communication_reply".to_string()),
                prepared_draft_selection_reason: None,
                prepared_draft_available: true,
                prepared_draft_requires_approval: true,
                prepared_draft_autonomy_decision: None,
                prepared_draft_lead_summary: None,
                prepared_draft_summary_lines: Vec::new(),
                prepared_draft_object_refs: Vec::new(),
                prepared_draft_object_labels: Vec::new(),
                prepared_draft_thread_retrieval_state: None,
                source_refs: vec!["thread:slack:team".to_string()],
            }],
            &[ContinuityPreparedDraftItem {
                id: "draft_1".to_string(),
                draft_class: "communication_reply".to_string(),
                title: "Draft reply for design team".to_string(),
                channel: "slack".to_string(),
                summary: "Acknowledges blocker and proposes next step".to_string(),
                body: "Draft body".to_string(),
                confidence: "high".to_string(),
                readiness: "ready".to_string(),
                response_due_hint: "today".to_string(),
                requires_approval: true,
                suggested_action: "Review and send email reply".to_string(),
                autonomy_decision: None,
                selection_reason: None,
                source_refs: vec!["thread:slack:team".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }],
            &[],
        )
        .expect("priority item should be produced");

        assert_eq!(item.panel_kind, "response_queue");
        assert_eq!(item.title, "Draft reply for design team");
        assert_eq!(
            item.prepared_draft_class.as_deref(),
            Some("communication_reply")
        );
        assert_eq!(item.surface_hint.as_deref(), Some("response_queue"));
        assert_eq!(item.source_refs, vec!["thread:slack:team".to_string()]);
    }

    #[test]
    fn continuity_priority_item_carries_displaced_reply_reason_for_response_queue() {
        let item = continuity_priority_item(
            None,
            None,
            None,
            "response_queue",
            &[],
            &[ContinuityResponseItem {
                id: "resp_2".to_string(),
                title: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "today".to_string(),
                suggested_action: "Review prepared context".to_string(),
                autonomy_decision: None,
                prepared_draft_id: Some("draft_2".to_string()),
                prepared_draft_summary: Some("Project follow-up prepared".to_string()),
                prepared_draft_readiness: Some("ready_now".to_string()),
                prepared_draft_body: None,
                prepared_draft_class: Some("project_prep_note".to_string()),
                prepared_draft_selection_reason: Some(
                    "Selected project prep note because this conversation belongs to an active project or thread context."
                        .to_string(),
                ),
                prepared_draft_available: true,
                prepared_draft_requires_approval: false,
                prepared_draft_autonomy_decision: None,
                prepared_draft_lead_summary: None,
                prepared_draft_summary_lines: Vec::new(),
                prepared_draft_object_refs: Vec::new(),
                prepared_draft_object_labels: Vec::new(),
                prepared_draft_thread_retrieval_state: None,
                source_refs: vec!["thread:email:supplier".to_string()],
            }],
            &[],
            &[],
        )
        .expect("priority item should be produced");

        assert_eq!(
            item.prepared_draft_class.as_deref(),
            Some("project_prep_note")
        );
        assert_eq!(item.panel_kind, "home");
        assert_eq!(item.surface_hint.as_deref(), Some("home"));
        assert_eq!(
            item.selection_reason.as_deref(),
            Some(
                "Selected project prep note because this conversation belongs to an active project or thread context."
            )
        );
    }

    #[test]
    fn continuity_priority_item_prefers_action_aligned_prepared_draft_for_response_queue() {
        let brief = DashboardContinuityBrief {
            source_type: "state_snapshot".to_string(),
            title: "Continuity brief".to_string(),
            decision_count: 0,
            commitment_count: 0,
            critical_change_count: 0,
            suggested_actions: vec!["Review prepared context".to_string()],
            staleness_at: None,
        };

        let item = continuity_priority_item(
            None,
            Some(&brief),
            None,
            "response_queue",
            &[],
            &[ContinuityResponseItem {
                id: "resp_4".to_string(),
                title: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "today".to_string(),
                suggested_action: "Reply in thread".to_string(),
                autonomy_decision: None,
                prepared_draft_id: Some("draft_generic".to_string()),
                prepared_draft_summary: Some("Generic draft ready".to_string()),
                prepared_draft_readiness: Some("ready".to_string()),
                prepared_draft_body: None,
                prepared_draft_class: Some("communication_reply".to_string()),
                prepared_draft_selection_reason: Some(
                    "Selected the first reply thread in the queue.".to_string(),
                ),
                prepared_draft_available: true,
                prepared_draft_requires_approval: false,
                prepared_draft_autonomy_decision: None,
                prepared_draft_lead_summary: None,
                prepared_draft_summary_lines: Vec::new(),
                prepared_draft_object_refs: Vec::new(),
                prepared_draft_object_labels: Vec::new(),
                prepared_draft_thread_retrieval_state: None,
                source_refs: vec!["thread:email:supplier".to_string()],
            }],
            &[
                ContinuityPreparedDraftItem {
                    id: "draft_generic".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Draft reply for supplier".to_string(),
                    channel: "email".to_string(),
                    summary: "Generic reply draft".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                autonomy_decision: None,
                    selection_reason: Some("Generic queue ordering.".to_string()),
                    source_refs: vec!["thread:email:supplier".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
            },
                ContinuityPreparedDraftItem {
                    id: "draft_context".to_string(),
                    draft_class: "project_prep_note".to_string(),
                    title: "Prepared context for supplier follow-up".to_string(),
                    channel: "email".to_string(),
                    summary: "Context bundle is ready for review".to_string(),
                    body: "Prepared context body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review prepared context".to_string(),
                autonomy_decision: None,
                    selection_reason: Some(
                        "Selected prepared context because the continuity intent already points toward context review."
                            .to_string(),
                    ),
                    source_refs: vec!["thread:project:supplier".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: None,
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
            },
            ],
            &[],
        )
        .expect("priority item should be produced");

        assert_eq!(item.title, "Prepared context for supplier follow-up");
        assert_eq!(
            item.prepared_draft_class.as_deref(),
            Some("project_prep_note")
        );
        assert_eq!(item.panel_kind, "home");
        assert_eq!(item.surface_hint.as_deref(), Some("home"));
        assert_eq!(
            item.selection_reason.as_deref(),
            Some(
                "Selected prepared context because the continuity intent already points toward context review."
            )
        );
        assert_eq!(
            item.source_refs,
            vec!["thread:project:supplier".to_string()]
        );
        assert_eq!(
            item.suggested_action.as_deref(),
            Some("Review prepared context")
        );
    }

    #[test]
    fn continuity_priority_item_prefers_context_pack_reference_refs_for_context_panel() {
        let item = continuity_priority_item(
            None,
            None,
            None,
            "context_panel",
            &[],
            &[],
            &[],
            &[ContinuityPreparedContextPackItem {
                id: "pack_1".to_string(),
                pack_kind: "topic_pack".to_string(),
                title: "Aurora topic pack".to_string(),
                summary: "Bounded topic continuity across linked work.".to_string(),
                confidence: "high".to_string(),
                why_surfaced: "Surfaced from linked project continuity.".to_string(),
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                anchor_refs: vec!["msg_anchor".to_string()],
                source_refs: vec!["msg_anchor".to_string(), "msg_related".to_string()],
                reference_refs: vec!["thread:aurora".to_string()],
                reference_labels: Vec::new(),
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                evidence_kinds: vec!["reference".to_string(), "project".to_string()],
                thread_retrieval_state: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }],
        )
        .expect("priority item should be produced");

        assert_eq!(item.title, "Aurora topic pack");
        assert_eq!(
            item.selection_reason.as_deref(),
            Some("Surfaced from linked project continuity.")
        );
        assert_eq!(item.source_refs, vec!["thread:aurora".to_string()]);
    }

    #[test]
    fn continuity_priority_item_prefers_user_grounded_aligned_prepared_draft_when_intent_ties() {
        let brief = DashboardContinuityBrief {
            source_type: "state_snapshot".to_string(),
            title: "Reply path".to_string(),
            decision_count: 0,
            commitment_count: 0,
            critical_change_count: 0,
            suggested_actions: vec!["Reply in thread".to_string()],
            staleness_at: None,
        };

        let item = continuity_priority_item(
            None,
            Some(&brief),
            None,
            "response_queue",
            &[],
            &[],
            &[
                ContinuityPreparedDraftItem {
                    id: "draft_generic".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Generic reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Generic draft".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Generic reply path.".to_string()),
                    source_refs: vec!["thread:generic".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: None,
                    author_mask: Some("public".to_string()),
                    author_type: Some("agent".to_string()),
                    author_id: None,
                    is_human_authored: Some(false),
                    human_only: Some(false),
                },
                ContinuityPreparedDraftItem {
                    id: "draft_grounded".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Grounded reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Grounded draft".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Grounded in work memory.".to_string()),
                    source_refs: vec!["thread:grounded".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(false),
                },
            ],
            &[],
        )
        .expect("priority item should be produced");

        assert_eq!(item.title, "Grounded reply draft");
        assert_eq!(item.source_refs, vec!["thread:grounded".to_string()]);
        assert_eq!(
            item.prepared_draft_class.as_deref(),
            Some("communication_reply")
        );
        assert_eq!(item.suggested_action.as_deref(), Some("Reply in thread"));
    }

    #[test]
    fn continuity_priority_item_prefers_more_immediate_aligned_prepared_draft_when_scope_ties() {
        let brief = DashboardContinuityBrief {
            source_type: "state_snapshot".to_string(),
            title: "Reply path".to_string(),
            decision_count: 0,
            commitment_count: 0,
            critical_change_count: 0,
            suggested_actions: vec!["Reply in thread".to_string()],
            staleness_at: None,
        };

        let item = continuity_priority_item(
            None,
            Some(&brief),
            None,
            "response_queue",
            &[],
            &[],
            &[
                ContinuityPreparedDraftItem {
                    id: "draft_week".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "This-week reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply later this week".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "This week".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("This week reply path.".to_string()),
                    source_refs: vec!["thread:week".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(false),
                },
                ContinuityPreparedDraftItem {
                    id: "draft_today".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Today reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Today reply path.".to_string()),
                    source_refs: vec!["thread:today".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(false),
                },
            ],
            &[],
        )
        .expect("priority item should be produced");

        assert_eq!(item.title, "Today reply draft");
        assert_eq!(item.source_refs, vec!["thread:today".to_string()]);
    }

    #[test]
    fn continuity_priority_item_prefers_file_linked_aligned_prepared_draft_when_other_ranks_tie() {
        let brief = DashboardContinuityBrief {
            source_type: "state_snapshot".to_string(),
            title: "Reply path".to_string(),
            decision_count: 0,
            commitment_count: 0,
            critical_change_count: 0,
            suggested_actions: vec!["Reply in thread".to_string()],
            staleness_at: None,
        };
        let state = DashboardContinuityMessage {
            id: "snapshot_file_draft".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_file".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: vec![crate::state_snapshot::StateSnapshotContextItem {
                        id: "ctx_aurora_linked".to_string(),
                        label: "Dormant Aurora context".to_string(),
                        why_surfaced: "Aurora context resurfaced from the same project."
                            .to_string(),
                        confidence: "medium".to_string(),
                        freshness: "reactivated".to_string(),
                        relation_path: vec!["same_project".to_string()],
                        source_refs: vec!["thread:aurora".to_string()],
                        decrypt_needed: false,
                    }],
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Reply in thread".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(
                        crate::prepared_context_packet::PreparedContextPacket {
                            packet_kind: "continuity_context".to_string(),
                            ready: true,
                            summary: "Prepared context ready.".to_string(),
                            anchor_refs: vec!["msg_file".to_string()],
                            source_refs: vec!["msg_file".to_string()],
                            decision_refs: Vec::new(),
                            decision_history_refs: Vec::new(),
                            response_refs: Vec::new(),
                            follow_up_refs: Vec::new(),
                            relationship_refs: Vec::new(),
                            project_refs: Vec::new(),
                            reference_refs: Vec::new(),
                            object_refs: Vec::new(),
                            thread_refs: Vec::new(),
                            file_refs: vec!["file:docs/launch-brief.md".to_string()],
                            packs: Vec::new(),
                            decrypt_needed_count: 0,
                            memory_space: None,
                            author_mask: None,
                            author_type: None,
                            author_id: None,
                            is_human_authored: None,
                            human_only: None,
                            ..crate::prepared_context_packet::PreparedContextPacket::default()
                        },
                    ),
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let item = continuity_priority_item(
            Some(&state),
            Some(&brief),
            None,
            "response_queue",
            &[],
            &[],
            &[
                ContinuityPreparedDraftItem {
                    id: "draft_plain".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Plain reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Plain reply path.".to_string()),
                    source_refs: vec!["msg_plain".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(false),
                },
                ContinuityPreparedDraftItem {
                    id: "draft_file".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "File-linked reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("File-linked reply path.".to_string()),
                    source_refs: vec!["msg_file".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(false),
                },
            ],
            &[],
        )
        .expect("priority item should be produced");

        assert_eq!(item.title, "File-linked reply draft");
        assert_eq!(item.source_refs, vec!["msg_file".to_string()]);
    }

    #[test]
    fn continuity_priority_item_prefers_value_heavier_aligned_prepared_draft_when_scope_and_timing_tie()
     {
        let brief = DashboardContinuityBrief {
            source_type: "state_snapshot".to_string(),
            title: "Reply path".to_string(),
            decision_count: 0,
            commitment_count: 0,
            critical_change_count: 0,
            suggested_actions: vec!["Reply in thread".to_string()],
            staleness_at: None,
        };

        let item = continuity_priority_item(
            None,
            Some(&brief),
            None,
            "response_queue",
            &[],
            &[],
            &[
                ContinuityPreparedDraftItem {
                    id: "draft_generic".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Generic reply draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Generic reply path.".to_string()),
                    source_refs: vec!["thread:generic".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(false),
                },
                ContinuityPreparedDraftItem {
                    id: "draft_follow_up".to_string(),
                    draft_class: "follow_up_draft".to_string(),
                    title: "Follow-up commitment draft".to_string(),
                    channel: "email".to_string(),
                    summary: "Follow up today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review follow-up reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some(
                        "Active follow-up commitment on this thread.".to_string(),
                    ),
                    source_refs: vec!["thread:follow-up".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(false),
                },
            ],
            &[],
        )
        .expect("priority item should be produced");

        assert_eq!(item.title, "Follow-up commitment draft");
        assert_eq!(item.source_refs, vec!["thread:follow-up".to_string()]);
        assert_eq!(
            item.prepared_draft_class.as_deref(),
            Some("follow_up_draft")
        );
    }

    #[test]
    fn continuity_priority_item_prefers_more_evidenced_aligned_prepared_draft_when_other_ranks_tie()
    {
        let brief = DashboardContinuityBrief {
            source_type: "state_snapshot".to_string(),
            title: "Reply path".to_string(),
            decision_count: 0,
            commitment_count: 0,
            critical_change_count: 0,
            suggested_actions: vec!["Reply in thread".to_string()],
            staleness_at: None,
        };

        let item = continuity_priority_item(
            None,
            Some(&brief),
            None,
            "response_queue",
            &[],
            &[],
            &[
                ContinuityPreparedDraftItem {
                    id: "draft_light".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "Lightly grounded reply".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Prepared support is ready.".to_string()),
                    source_refs: vec!["thread:generic".to_string()],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(false),
                },
                ContinuityPreparedDraftItem {
                    id: "draft_grounded".to_string(),
                    draft_class: "communication_reply".to_string(),
                    title: "More grounded reply".to_string(),
                    channel: "email".to_string(),
                    summary: "Reply today".to_string(),
                    body: "Draft body".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready".to_string(),
                    response_due_hint: "Today".to_string(),
                    requires_approval: false,
                    suggested_action: "Review and send email reply".to_string(),
                    autonomy_decision: None,
                    selection_reason: Some("Prepared support is ready.".to_string()),
                    source_refs: vec![
                        "thread:grounded".to_string(),
                        "msg:context".to_string(),
                        "file:brief".to_string(),
                    ],
                    object_refs: Vec::new(),
                    object_labels: Vec::new(),
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    memory_space: Some("work".to_string()),
                    author_mask: Some("private".to_string()),
                    author_type: Some("human".to_string()),
                    author_id: Some("user_01".to_string()),
                    is_human_authored: Some(true),
                    human_only: Some(false),
                },
            ],
            &[],
        )
        .expect("priority item should be produced");

        assert_eq!(item.title, "More grounded reply");
        assert_eq!(
            item.source_refs,
            vec![
                "thread:grounded".to_string(),
                "msg:context".to_string(),
                "file:brief".to_string(),
            ]
        );
    }

    #[test]
    fn continuity_priority_item_suppresses_response_queue_priority_when_watcher_context_is_cooled_down()
     {
        let preferred_state = DashboardContinuityMessage {
            id: "snapshot_3".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: vec![crate::state_snapshot::StateSnapshotWatcherSignal {
                        id: "sig_1".to_string(),
                        signal_key: "watcher:study".to_string(),
                        category: "study".to_string(),
                        freshness: "fresh".to_string(),
                        urgency: "today".to_string(),
                        confidence: "medium".to_string(),
                        urgency_hint: "Signal stays visible for auditability while suppression remains active.".to_string(),
                        suppression_status: "suppressed".to_string(),
                        suppression_reason: "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours.".to_string(),
                        escalation_status: "deferred".to_string(),
                        escalation_reason: "Suppression is currently active, so this signal remains audit-visible without contributing live escalation pressure.".to_string(),
                        decrypt_needed: false,
                        source_type: "smart_suggestion".to_string(),
                        source_subtype: "study".to_string(),
                        thread_id: "watcher:user_01".to_string(),
                        source_refs: vec!["msg_1".to_string()],
                    }],
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        assert!(
            continuity_priority_item(
                Some(&preferred_state),
                None,
                None,
                "response_queue",
                &[],
                &[ContinuityResponseItem {
                    id: "resp_3".to_string(),
                    title: "Reply to supplier".to_string(),
                    channel: "email".to_string(),
                    urgency: "today".to_string(),
                    confidence: "high".to_string(),
                    response_due_hint: "today".to_string(),
                    suggested_action: "Reply in thread".to_string(),
                    autonomy_decision: None,
                    prepared_draft_id: None,
                    prepared_draft_summary: None,
                    prepared_draft_readiness: None,
                    prepared_draft_body: None,
                    prepared_draft_class: None,
                    prepared_draft_selection_reason: None,
                    prepared_draft_available: false,
                    prepared_draft_requires_approval: false,
                    prepared_draft_autonomy_decision: None,
                    prepared_draft_lead_summary: None,
                    prepared_draft_summary_lines: Vec::new(),
                    prepared_draft_object_refs: Vec::new(),
                    prepared_draft_object_labels: Vec::new(),
                    prepared_draft_thread_retrieval_state: None,
                    source_refs: vec!["thread:email:supplier".to_string()],
                }],
                &[],
                &[],
            )
            .is_none()
        );
    }

    #[test]
    fn continuity_priority_item_carries_watcher_cooldown_reason_when_response_priority_still_surfaces()
     {
        let preferred_state = DashboardContinuityMessage {
            id: "snapshot_4".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: vec![crate::state_snapshot::StateSnapshotResponseItem {
                        id: "rq_1".to_string(),
                        label: "Reply to supplier".to_string(),
                        urgency: "today".to_string(),
                        confidence: "high".to_string(),
                        source_refs: vec!["thread:email:supplier".to_string()],
                        ..crate::state_snapshot::StateSnapshotResponseItem::default()
                    }],
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: vec![crate::state_snapshot::StateSnapshotWatcherSignal {
                        id: "sig_1".to_string(),
                        signal_key: "watcher:study".to_string(),
                        category: "study".to_string(),
                        freshness: "fresh".to_string(),
                        urgency: "today".to_string(),
                        confidence: "medium".to_string(),
                        urgency_hint: "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours.".to_string(),
                        suppression_status: "suppressed".to_string(),
                        suppression_reason: "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours.".to_string(),
                        escalation_status: "deferred".to_string(),
                        escalation_reason: "Suppression is currently active, so this signal remains audit-visible without contributing live escalation pressure.".to_string(),
                        decrypt_needed: false,
                        source_type: "smart_suggestion".to_string(),
                        source_subtype: "study".to_string(),
                        thread_id: "watcher:user_01".to_string(),
                        source_refs: vec!["msg_1".to_string()],
                    }],
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Reply in thread".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let item = continuity_priority_item(
            Some(&preferred_state),
            Some(&DashboardContinuityBrief {
                source_type: "state_snapshot".to_string(),
                title: "Reply in thread".to_string(),
                decision_count: 0,
                commitment_count: 0,
                critical_change_count: 0,
                suggested_actions: vec!["Reply in thread".to_string()],
                staleness_at: Some("2026-06-03T12:00:00Z".to_string()),
            }),
            None,
            "response_queue",
            &[],
            &[ContinuityResponseItem {
                id: "resp_4".to_string(),
                title: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "today".to_string(),
                suggested_action: "Reply in thread".to_string(),
                autonomy_decision: None,
                prepared_draft_id: Some("draft_4".to_string()),
                prepared_draft_summary: Some("Prepared reply ready.".to_string()),
                prepared_draft_readiness: Some("ready_now".to_string()),
                prepared_draft_body: Some("Reply body".to_string()),
                prepared_draft_class: Some("communication_reply".to_string()),
                prepared_draft_selection_reason: None,
                prepared_draft_available: true,
                prepared_draft_requires_approval: false,
                prepared_draft_autonomy_decision: None,
                prepared_draft_lead_summary: None,
                prepared_draft_summary_lines: Vec::new(),
                prepared_draft_object_refs: Vec::new(),
                prepared_draft_object_labels: Vec::new(),
                prepared_draft_thread_retrieval_state: None,
                source_refs: vec!["thread:email:supplier".to_string()],
            }],
            &[],
            &[],
        )
        .expect("priority item should still be produced");

        assert_eq!(
            item.selection_reason.as_deref(),
            Some(
                "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours."
            )
        );
    }

    #[test]
    fn continuity_priority_item_carries_empathy_reason_when_response_priority_still_surfaces() {
        let handoff = SynthesizerToMasterHandoff {
            surface_recommendation: "response_queue".to_string(),
            empathy_context: Some(crate::state_synthesizer_contract::EmpathyCoordinationContext {
                profile_id: Some("clarity_partner".to_string()),
                tone_mode: Some("calm".to_string()),
                initiative_level: Some("gentle".to_string()),
                caution_level: Some("medium".to_string()),
                watcher_mode: "trusted_gentle".to_string(),
                suppression_active_count: 0,
                trusted_signal_count: 1,
                explanation: Some(
                    "1 watcher signal(s) are trusted from prior outcomes, so gentle continuity framing is appropriate."
                        .to_string(),
                ),
            }),
            ..Default::default()
        };

        let item = continuity_priority_item(
            None,
            Some(&DashboardContinuityBrief {
                source_type: "state_snapshot".to_string(),
                title: "Reply in thread".to_string(),
                decision_count: 0,
                commitment_count: 0,
                critical_change_count: 0,
                suggested_actions: vec!["Reply in thread".to_string()],
                staleness_at: Some("2026-06-03T12:00:00Z".to_string()),
            }),
            Some(&handoff),
            "response_queue",
            &[],
            &[ContinuityResponseItem {
                id: "resp_5".to_string(),
                title: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "today".to_string(),
                suggested_action: "Reply in thread".to_string(),
                autonomy_decision: None,
                prepared_draft_id: Some("draft_5".to_string()),
                prepared_draft_summary: Some("Prepared reply ready.".to_string()),
                prepared_draft_readiness: Some("ready_now".to_string()),
                prepared_draft_body: Some("Reply body".to_string()),
                prepared_draft_class: Some("communication_reply".to_string()),
                prepared_draft_selection_reason: None,
                prepared_draft_available: true,
                prepared_draft_requires_approval: false,
                prepared_draft_autonomy_decision: None,
                prepared_draft_lead_summary: None,
                prepared_draft_summary_lines: Vec::new(),
                prepared_draft_object_refs: Vec::new(),
                prepared_draft_object_labels: Vec::new(),
                prepared_draft_thread_retrieval_state: None,
                source_refs: vec!["thread:email:supplier".to_string()],
            }],
            &[],
            &[],
        )
        .expect("priority item should still be produced");

        assert_eq!(
            item.selection_reason.as_deref(),
            Some(
                "1 watcher signal(s) are trusted from prior outcomes, so gentle continuity framing is appropriate."
            )
        );
    }

    #[test]
    fn continuity_priority_card_builds_homepage_ready_card_seed() {
        let item = ContinuityPriorityItem {
            title: "Approve the suggested action".to_string(),
            panel_kind: "approval_queue".to_string(),
            requires_approval: true,
            surface_hint: Some("decision_queue".to_string()),
            suggested_action: Some("Approve the suggested action".to_string()),
            confidence: Some("medium".to_string()),
            prepared_draft_class: None,
            selection_reason: None,
            source_refs: vec!["msg_1".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let card =
            continuity_priority_card(Some(&item), None).expect("priority card should be produced");
        assert_eq!(card.panel_kind, "approval_queue");
        assert!(card.requires_approval);
        assert_eq!(card.action_label, "Approve the suggested action");
        assert_eq!(
            card.autonomy_decision
                .as_ref()
                .map(|decision| decision.autonomy_level.as_str()),
            Some("request_approval")
        );
    }

    #[test]
    fn continuity_priority_card_resolves_linked_target_label_from_snapshot_state() {
        let item = ContinuityPriorityItem {
            title: "Review linked context".to_string(),
            panel_kind: "context_panel".to_string(),
            requires_approval: false,
            surface_hint: Some("context_panel".to_string()),
            suggested_action: Some("Open linked object".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: None,
            selection_reason: None,
            source_refs: vec!["thread:aurora".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };
        let state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["thread:aurora".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: vec![crate::state_snapshot::StateSnapshotResponseItem {
                        id: "rq_1".to_string(),
                        label: "Aurora rollout thread".to_string(),
                        channel: "chat".to_string(),
                        urgency: "today".to_string(),
                        confidence: "high".to_string(),
                        response_due_hint: "Today".to_string(),
                        source_refs: vec!["thread:aurora".to_string()],
                        suggested_next_action: "Reply in thread".to_string(),
                    }],
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: vec![crate::state_snapshot::StateSnapshotContextItem {
                        id: "ctx_aurora_linked".to_string(),
                        label: "Dormant Aurora context".to_string(),
                        why_surfaced: "Aurora context resurfaced from the same project."
                            .to_string(),
                        confidence: "medium".to_string(),
                        freshness: "reactivated".to_string(),
                        relation_path: vec!["same_project".to_string()],
                        source_refs: vec!["thread:aurora".to_string()],
                        decrypt_needed: false,
                    }],
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review linked context".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(
                        crate::prepared_context_packet::PreparedContextPacket {
                            packet_kind: "continuity_context".to_string(),
                            ready: true,
                            summary: "Prepared context ready: 1 context pack.".to_string(),
                            anchor_refs: vec!["thread:aurora".to_string()],
                            source_refs: vec!["thread:aurora".to_string()],
                            decision_refs: Vec::new(),
                            decision_history_refs: Vec::new(),
                            response_refs: Vec::new(),
                            follow_up_refs: Vec::new(),
                            relationship_refs: Vec::new(),
                            project_refs: Vec::new(),
                            reference_refs: Vec::new(),
                            object_refs: vec!["project_aurora".to_string()],
                            thread_refs: vec!["thread:aurora".to_string()],
                            file_refs: vec!["file:docs/launch-brief.md".to_string()],
                            packs: vec![crate::prepared_context_packet::PreparedContextPack {
                                pack_id: "continuity_topic_pack".to_string(),
                                pack_kind: "topic_pack".to_string(),
                                title: "Project topic pack".to_string(),
                                summary: "Bounded topic continuity across linked work.".to_string(),
                                confidence: "high".to_string(),
                                why_surfaced: "Surfaced from linked project continuity."
                                    .to_string(),
                                anchor_refs: vec!["thread:aurora".to_string()],
                                source_refs: vec!["thread:aurora".to_string()],
                                reference_refs: vec!["project_aurora".to_string()],
                                object_refs: vec!["project_aurora".to_string()],
                                file_refs: vec!["file:docs/launch-brief.md".to_string()],
                                file_labels: vec!["launch-brief.md".to_string()],
                                evidence_kinds: vec!["project".to_string()],
                                memory_space: None,
                                author_mask: None,
                                author_type: None,
                                author_id: None,
                                is_human_authored: None,
                                human_only: None,
                            }],
                            decrypt_needed_count: 0,
                            memory_space: None,
                            author_mask: None,
                            author_type: None,
                            author_id: None,
                            is_human_authored: None,
                            human_only: None,
                            ..crate::prepared_context_packet::PreparedContextPacket::default()
                        },
                    ),
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let card = continuity_priority_card(Some(&item), Some(&state))
            .expect("priority card should be produced");
        assert_eq!(
            card.linked_target_label.as_deref(),
            Some("Aurora rollout thread")
        );
        assert_eq!(card.object_refs, vec!["project_aurora"]);
        assert_eq!(card.object_labels, vec!["Project topic pack"]);
        assert_eq!(card.file_refs, vec!["file:docs/launch-brief.md"]);
        assert_eq!(card.file_labels, vec!["launch-brief.md"]);
        assert_eq!(card.retrieval_mode.as_deref(), Some("metadata_first"));
        assert!(!card.deeper_retrieval_recommended);
        assert_eq!(
            card.readiness_reason.as_deref(),
            Some("Metadata-first support is complete for the current continuity bundle.")
        );
        assert_eq!(card.topology_budget_used, 0);
        assert_eq!(card.working_set_count, 0);
        assert_eq!(card.active_topic_count, 0);
        assert!(card.working_set_refs.is_empty());
        assert!(card.active_topic_refs.is_empty());
        assert!(card.decision_history_refs.is_empty());
        assert!(card.project_refs.is_empty());
        assert_eq!(card.thread_refs, vec!["thread:aurora"]);
        assert!(card.thread_retrieval_state.is_some());
        assert_eq!(
            card.thread_retrieval_state
                .as_ref()
                .and_then(|state| state["badges"].as_array())
                .map(|badges| badges.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec![
                "thread-linked",
                "object-linked",
                "file-linked",
                "reactivated-neighborhood",
                "priority-driven",
            ])
        );
        assert!(
            card.thread_retrieval_state
                .as_ref()
                .and_then(|state| state["summary"].as_str())
                .is_some_and(|summary| summary
                    .contains("Dormant but strongly linked context is being reactivated here."))
        );
    }

    #[test]
    fn continuity_priority_card_uses_prepared_response_description_for_prepared_reply() {
        let item = ContinuityPriorityItem {
            title: "Prepared 1 communication reply draft for review.".to_string(),
            panel_kind: "response_queue".to_string(),
            requires_approval: false,
            surface_hint: Some("response_queue".to_string()),
            suggested_action: Some("Open responses".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: Some("communication_reply".to_string()),
            selection_reason: Some("Prepared reply is already ready.".to_string()),
            source_refs: vec!["msg_1".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let card =
            continuity_priority_card(Some(&item), None).expect("priority card should be produced");
        assert_eq!(card.description, "Prepared response is ready for review.");
    }

    #[test]
    fn continuity_priority_card_uses_prepared_context_description_for_prepared_context() {
        let item = ContinuityPriorityItem {
            title: "Prepared context ready: 1 context pack.".to_string(),
            panel_kind: "context_panel".to_string(),
            requires_approval: false,
            surface_hint: Some("context_panel".to_string()),
            suggested_action: Some("Open context".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: None,
            selection_reason: Some(
                "Selected prepared context because the continuity intent already points toward context review."
                    .to_string(),
            ),
            source_refs: vec!["msg_1".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let card =
            continuity_priority_card(Some(&item), None).expect("priority card should be produced");
        assert_eq!(card.description, "Prepared context is ready for review.");
    }

    #[test]
    fn continuity_priority_card_uses_prepared_work_description_for_home_prepared_draft() {
        let item = ContinuityPriorityItem {
            title: "Aurora rollout prep note".to_string(),
            panel_kind: "home".to_string(),
            requires_approval: false,
            surface_hint: Some("home".to_string()),
            suggested_action: Some("Open workspace".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: Some("project_prep_note".to_string()),
            selection_reason: Some(
                "Selected project prep note because linked project context is already ready."
                    .to_string(),
            ),
            source_refs: vec!["thread:aurora".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let card =
            continuity_priority_card(Some(&item), None).expect("priority card should be produced");
        assert_eq!(card.description, "Prepared work is ready for review.");
    }

    #[test]
    fn continuity_priority_card_uses_decision_support_description_for_decision_prepared_draft() {
        let item = ContinuityPriorityItem {
            title: "Review provider switch memo".to_string(),
            panel_kind: "decision_queue".to_string(),
            requires_approval: false,
            surface_hint: Some("decision_queue".to_string()),
            suggested_action: Some("Open decision queue".to_string()),
            confidence: Some("high".to_string()),
            prepared_draft_class: Some("decision_memo".to_string()),
            selection_reason: Some("Prepared decision support is ready.".to_string()),
            source_refs: vec!["renewal:memo:1".to_string()],
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        let card =
            continuity_priority_card(Some(&item), None).expect("priority card should be produced");
        assert_eq!(
            card.description,
            "Prepared decision support is ready for review."
        );
    }

    #[test]
    fn continuity_action_items_promote_snapshot_decision_queue() {
        let state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["decision_request_1".to_string()],
                    decision_queue: vec![StateSnapshotDecisionItem {
                        id: "decision_request_1".to_string(),
                        label: "Approve grocery order".to_string(),
                        category: "decision".to_string(),
                        urgency: "today".to_string(),
                        confidence: "medium".to_string(),
                        source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
                        suggested_next_action: "Review and decide".to_string(),
                        approval_required: true,
                    }],
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Approve grocery order".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_action_items(Some(&state), None, None);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Approve grocery order");
        assert_eq!(items[0].source_refs.len(), 2);
        assert!(items[0].requires_approval);
    }

    #[test]
    fn continuity_action_item_overflow_reports_snapshot_queue_truncation() {
        let decision_queue = (1..=4)
            .map(|index| StateSnapshotDecisionItem {
                id: format!("decision_request_{index}"),
                label: format!("Approve item {index}"),
                category: "decision".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                source_refs: vec![format!("msg_{index}")],
                suggested_next_action: "Review and decide".to_string(),
                approval_required: index == 1,
            })
            .collect::<Vec<_>>();
        let state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["decision_request_1".to_string()],
                    decision_queue,
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Approve item 1".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_action_items(Some(&state), None, None);
        let overflow_count = continuity_action_item_overflow_count(Some(&state), None);
        let overflow_summary =
            continuity_action_item_overflow_summary(Some(&state), None, overflow_count);

        assert_eq!(items.len(), CONTINUITY_ACTION_ITEM_LIMIT);
        assert_eq!(overflow_count, 1);
        assert_eq!(
            overflow_summary.as_deref(),
            Some("1 more decision item remain queued beyond the top 3.")
        );
    }

    #[test]
    fn continuity_action_items_fall_back_to_handoff_suggested_actions() {
        let brief = DashboardContinuityBrief {
            source_type: "state_snapshot".to_string(),
            title: "Review your schedule".to_string(),
            decision_count: 0,
            commitment_count: 1,
            critical_change_count: 0,
            suggested_actions: vec!["Review your schedule".to_string()],
            staleness_at: None,
        };
        let handoff = SynthesizerToMasterHandoff {
            snapshot_ref: "snapshot_1".to_string(),
            view_id: "homepage:state:user_01".to_string(),
            confidence: "medium".to_string(),
            surface_recommendation: "decision_queue".to_string(),
            suggested_mood: None,
            suggested_next_actions: vec![
                "Review your schedule".to_string(),
                "Confirm the next checkpoint".to_string(),
            ],
            escalation_required: true,
            approval_boundary: None,
            autonomy_decision: None,
            browser_action_candidate: None,
            prepared_context_ready: false,
            prepared_context_summary: None,
            prepared_draft_ready: false,
            prepared_draft_summary: None,
            follow_up_write_candidate: None,
            decrypt_trace: None,
            simulated_projection_ready: false,
            simulated_projection_summary: None,
            simulated_projection_risks: Vec::new(),
            simulated_projection_opportunities: Vec::new(),
            simulated_actionable_event_count: None,
            simulated_review_surfaces_ready: false,
            simulated_rollout_stage: None,
            simulated_calibration_mode: None,
            simulated_review_summary: None,
            simulated_calibration_notes: Vec::new(),
            simulated_promotion_candidate_count: None,
            field_engine_ready: false,
            field_engine_primary_type: None,
            field_engine_summary: None,
            field_engine_risks: Vec::new(),
            field_engine_opportunities: Vec::new(),
            empathy_context: None,
        };

        let items = continuity_action_items(None, Some(&brief), Some(&handoff));
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].title, "Review your schedule");
        assert_eq!(items[0].category, "decision");
        assert_eq!(items[0].urgency, "high");
        assert_eq!(items[0].source_refs, vec!["snapshot_1".to_string()]);
        assert!(!items[0].requires_approval);
        assert_eq!(
            items[0]
                .autonomy_decision
                .as_ref()
                .map(|decision| decision.autonomy_level.as_str()),
            Some("suggest_with_artifact")
        );
    }

    #[test]
    fn continuity_action_items_fall_back_to_response_framing_when_handoff_targets_response_queue() {
        let handoff = SynthesizerToMasterHandoff {
            snapshot_ref: "snapshot_2".to_string(),
            view_id: "homepage:state:user_01".to_string(),
            confidence: "high".to_string(),
            surface_recommendation: "response_queue".to_string(),
            suggested_mood: None,
            suggested_next_actions: vec!["Review reply draft".to_string()],
            escalation_required: false,
            approval_boundary: None,
            autonomy_decision: None,
            browser_action_candidate: None,
            prepared_context_ready: false,
            prepared_context_summary: None,
            prepared_draft_ready: true,
            prepared_draft_summary: Some(
                "Prepared 1 communication reply draft for review.".to_string(),
            ),
            follow_up_write_candidate: None,
            decrypt_trace: None,
            simulated_projection_ready: false,
            simulated_projection_summary: None,
            simulated_projection_risks: Vec::new(),
            simulated_projection_opportunities: Vec::new(),
            simulated_actionable_event_count: None,
            simulated_review_surfaces_ready: false,
            simulated_rollout_stage: None,
            simulated_calibration_mode: None,
            simulated_review_summary: None,
            simulated_calibration_notes: Vec::new(),
            simulated_promotion_candidate_count: None,
            field_engine_ready: false,
            field_engine_primary_type: None,
            field_engine_summary: None,
            field_engine_risks: Vec::new(),
            field_engine_opportunities: Vec::new(),
            empathy_context: None,
        };

        let items = continuity_action_items(None, None, Some(&handoff));
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0].title,
            "Prepared 1 communication reply draft for review."
        );
        assert_eq!(items[0].category, "response");
        assert_eq!(items[0].urgency, "medium");
        assert_eq!(items[0].suggested_action, "Open responses");
    }

    #[test]
    fn continuity_action_items_carry_scope_from_prepared_draft_when_handoff_targets_response_queue()
    {
        let state = DashboardContinuityMessage {
            id: "snapshot_2".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: vec![StateSnapshotResponseItem {
                        id: "resp_1".to_string(),
                        label: "Reply to supplier".to_string(),
                        channel: "email".to_string(),
                        urgency: "today".to_string(),
                        confidence: "high".to_string(),
                        response_due_hint: "Today".to_string(),
                        suggested_next_action: "Review prepared reply".to_string(),
                        source_refs: vec!["msg_1".to_string()],
                    }],
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Reply draft ready".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                        ready: true,
                        summary: "Prepared 1 communication reply draft for review.".to_string(),
                        drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                            draft_id: "draft:reply:msg_1".to_string(),
                            draft_class: "communication_reply".to_string(),
                            label: "Reply draft for Supplier quote follow up".to_string(),
                            channel: "email".to_string(),
                            summary: "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                            body: "Thanks for sending this through.".to_string(),
                            confidence: "medium".to_string(),
                            readiness: "ready_now".to_string(),
                            response_due_hint: "Today".to_string(),
                            approval_required_to_send: true,
                            source_refs: vec!["msg_1".to_string()],
                            source_count: 1,
                            storage_type: "ledger".to_string(),
                            storage_kind: Some("rich_note".to_string()),
                            comparison_headers: Vec::new(),
                            comparison_rows: Vec::new(),
                            selection_reason: None,
                            suggested_next_action: "Review and send email reply".to_string(),
                            object_refs: Vec::new(),
                            memory_space: Some("work".to_string()),
                            author_mask: Some("private".to_string()),
                            author_type: Some("human".to_string()),
                            author_id: Some("user_01".to_string()),
                            is_human_authored: Some(true),
                            human_only: Some(true),
                        }],
                    }),
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };
        let handoff = SynthesizerToMasterHandoff {
            snapshot_ref: "snapshot_2".to_string(),
            view_id: "homepage:state:user_01".to_string(),
            confidence: "high".to_string(),
            surface_recommendation: "response_queue".to_string(),
            suggested_mood: None,
            suggested_next_actions: vec!["Review reply draft".to_string()],
            escalation_required: false,
            approval_boundary: None,
            autonomy_decision: None,
            browser_action_candidate: None,
            prepared_context_ready: false,
            prepared_context_summary: None,
            prepared_draft_ready: true,
            prepared_draft_summary: Some(
                "Prepared 1 communication reply draft for review.".to_string(),
            ),
            follow_up_write_candidate: None,
            decrypt_trace: None,
            simulated_projection_ready: false,
            simulated_projection_summary: None,
            simulated_projection_risks: Vec::new(),
            simulated_projection_opportunities: Vec::new(),
            simulated_actionable_event_count: None,
            simulated_review_surfaces_ready: false,
            simulated_rollout_stage: None,
            simulated_calibration_mode: None,
            simulated_review_summary: None,
            simulated_calibration_notes: Vec::new(),
            simulated_promotion_candidate_count: None,
            field_engine_ready: false,
            field_engine_primary_type: None,
            field_engine_summary: None,
            field_engine_risks: Vec::new(),
            field_engine_opportunities: Vec::new(),
            empathy_context: None,
        };

        let items = continuity_action_items(Some(&state), None, Some(&handoff));
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].memory_space.as_deref(), Some("work"));
        assert_eq!(items[0].author_mask.as_deref(), Some("private"));
        assert_eq!(items[0].author_type.as_deref(), Some("human"));
        assert_eq!(items[0].author_id.as_deref(), Some("user_01"));
        assert_eq!(items[0].is_human_authored, Some(true));
        assert_eq!(items[0].human_only, Some(true));
    }

    #[test]
    fn continuity_action_items_use_prepared_draft_destination_semantics_for_non_response_work() {
        let state = DashboardContinuityMessage {
            id: "snapshot_prepared_workspace".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["thread:aurora".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review project prep note".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                        ready: true,
                        summary: "Prepared project prep note for review.".to_string(),
                        drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                            draft_id: "draft:project:aurora".to_string(),
                            draft_class: "project_prep_note".to_string(),
                            label: "Aurora rollout prep note".to_string(),
                            channel: "workspace".to_string(),
                            summary: "Prepared a rollout prep note from linked project context.".to_string(),
                            body: "- Confirm scope\n- Check blockers".to_string(),
                            confidence: "high".to_string(),
                            readiness: "ready_now".to_string(),
                            response_due_hint: String::new(),
                            approval_required_to_send: false,
                            source_refs: vec!["thread:aurora".to_string()],
                            source_count: 1,
                            storage_type: "ledger".to_string(),
                            storage_kind: Some("rich_note".to_string()),
                            comparison_headers: Vec::new(),
                            comparison_rows: Vec::new(),
                            selection_reason: Some(
                                "Selected project prep note because linked project context is already ready."
                                    .to_string(),
                            ),
                            suggested_next_action: "Review project prep note".to_string(),
                            object_refs: vec!["project_aurora".to_string()],
                            memory_space: Some("work".to_string()),
                            author_mask: Some("private".to_string()),
                            author_type: Some("human".to_string()),
                            author_id: Some("user_01".to_string()),
                            is_human_authored: Some(true),
                            human_only: Some(true),
                        }],
                    }),
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };
        let handoff = SynthesizerToMasterHandoff {
            snapshot_ref: "snapshot_prepared_workspace".to_string(),
            view_id: "homepage:state:user_01".to_string(),
            confidence: "high".to_string(),
            surface_recommendation: "context_panel".to_string(),
            suggested_mood: None,
            suggested_next_actions: vec!["Review project prep note".to_string()],
            escalation_required: false,
            approval_boundary: None,
            autonomy_decision: None,
            browser_action_candidate: None,
            prepared_context_ready: false,
            prepared_context_summary: None,
            prepared_draft_ready: true,
            prepared_draft_summary: Some("Prepared project prep note for review.".to_string()),
            follow_up_write_candidate: None,
            decrypt_trace: None,
            simulated_projection_ready: false,
            simulated_projection_summary: None,
            simulated_projection_risks: Vec::new(),
            simulated_projection_opportunities: Vec::new(),
            simulated_actionable_event_count: None,
            simulated_review_surfaces_ready: false,
            simulated_rollout_stage: None,
            simulated_calibration_mode: None,
            simulated_review_summary: None,
            simulated_calibration_notes: Vec::new(),
            simulated_promotion_candidate_count: None,
            field_engine_ready: false,
            field_engine_primary_type: None,
            field_engine_summary: None,
            field_engine_risks: Vec::new(),
            field_engine_opportunities: Vec::new(),
            empathy_context: None,
        };

        let items = continuity_action_items(Some(&state), None, Some(&handoff));
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Prepared project prep note for review.");
        assert_eq!(items[0].category, "prepared");
        assert_eq!(items[0].suggested_action, "Open workspace");
        assert_eq!(items[0].surface_hint.as_deref(), Some("home"));
        assert_eq!(items[0].memory_space.as_deref(), Some("work"));
        assert_eq!(items[0].author_mask.as_deref(), Some("private"));
        assert_eq!(items[0].author_type.as_deref(), Some("human"));
        assert_eq!(items[0].author_id.as_deref(), Some("user_01"));
        assert_eq!(items[0].is_human_authored, Some(true));
        assert_eq!(items[0].human_only, Some(true));
    }

    #[test]
    fn continuity_action_items_dedupe_duplicate_response_handoff_cards() {
        let handoff = SynthesizerToMasterHandoff {
            snapshot_ref: "snapshot_2".to_string(),
            view_id: "homepage:state:user_01".to_string(),
            confidence: "high".to_string(),
            surface_recommendation: "response_queue".to_string(),
            suggested_mood: None,
            suggested_next_actions: vec![
                "Review reply draft".to_string(),
                "Send the prepared reply".to_string(),
                "Open responses".to_string(),
            ],
            escalation_required: false,
            approval_boundary: None,
            autonomy_decision: None,
            browser_action_candidate: None,
            prepared_context_ready: false,
            prepared_context_summary: None,
            prepared_draft_ready: true,
            prepared_draft_summary: Some(
                "Prepared 1 communication reply draft for review.".to_string(),
            ),
            follow_up_write_candidate: None,
            decrypt_trace: None,
            simulated_projection_ready: false,
            simulated_projection_summary: None,
            simulated_projection_risks: Vec::new(),
            simulated_projection_opportunities: Vec::new(),
            simulated_actionable_event_count: None,
            simulated_review_surfaces_ready: false,
            simulated_rollout_stage: None,
            simulated_calibration_mode: None,
            simulated_review_summary: None,
            simulated_calibration_notes: Vec::new(),
            simulated_promotion_candidate_count: None,
            field_engine_ready: false,
            field_engine_primary_type: None,
            field_engine_summary: None,
            field_engine_risks: Vec::new(),
            field_engine_opportunities: Vec::new(),
            empathy_context: None,
        };

        let items = continuity_action_items(None, None, Some(&handoff));
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0].title,
            "Prepared 1 communication reply draft for review."
        );
        assert_eq!(items[0].suggested_action, "Open responses");
    }

    #[test]
    fn continuity_action_items_compress_focused_prepared_reply_handoff_to_one_card() {
        let handoff = SynthesizerToMasterHandoff {
            snapshot_ref: "snapshot_2".to_string(),
            view_id: "homepage:state:user_01".to_string(),
            confidence: "high".to_string(),
            surface_recommendation: "response_queue".to_string(),
            suggested_mood: Some("focused".to_string()),
            suggested_next_actions: vec![
                "Review prepared reply".to_string(),
                "Review and send email reply".to_string(),
                "Open responses".to_string(),
            ],
            escalation_required: false,
            approval_boundary: None,
            autonomy_decision: None,
            browser_action_candidate: None,
            prepared_context_ready: false,
            prepared_context_summary: None,
            prepared_draft_ready: true,
            prepared_draft_summary: Some(
                "Prepared 1 communication reply draft for review.".to_string(),
            ),
            follow_up_write_candidate: None,
            decrypt_trace: None,
            simulated_projection_ready: false,
            simulated_projection_summary: None,
            simulated_projection_risks: Vec::new(),
            simulated_projection_opportunities: Vec::new(),
            simulated_actionable_event_count: None,
            simulated_review_surfaces_ready: false,
            simulated_rollout_stage: None,
            simulated_calibration_mode: None,
            simulated_review_summary: None,
            simulated_calibration_notes: Vec::new(),
            simulated_promotion_candidate_count: None,
            field_engine_ready: false,
            field_engine_primary_type: None,
            field_engine_summary: None,
            field_engine_risks: Vec::new(),
            field_engine_opportunities: Vec::new(),
            empathy_context: None,
        };

        let items = continuity_action_items(None, None, Some(&handoff));
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0].title,
            "Prepared 1 communication reply draft for review."
        );
        assert_eq!(items[0].suggested_action, "Open responses");
    }

    #[test]
    fn continuity_action_items_compress_focused_prepared_context_handoff_to_one_card() {
        let handoff = SynthesizerToMasterHandoff {
            snapshot_ref: "snapshot_3".to_string(),
            view_id: "homepage:state:user_01".to_string(),
            confidence: "high".to_string(),
            surface_recommendation: "context_panel".to_string(),
            suggested_mood: Some("focused".to_string()),
            suggested_next_actions: vec![
                "Review prepared context".to_string(),
                "Inspect supporting context".to_string(),
                "Open context".to_string(),
            ],
            escalation_required: false,
            approval_boundary: None,
            autonomy_decision: None,
            browser_action_candidate: None,
            prepared_context_ready: true,
            prepared_context_summary: Some("Prepared context ready: 1 context pack.".to_string()),
            prepared_draft_ready: false,
            prepared_draft_summary: None,
            follow_up_write_candidate: None,
            decrypt_trace: None,
            simulated_projection_ready: false,
            simulated_projection_summary: None,
            simulated_projection_risks: Vec::new(),
            simulated_projection_opportunities: Vec::new(),
            simulated_actionable_event_count: None,
            simulated_review_surfaces_ready: false,
            simulated_rollout_stage: None,
            simulated_calibration_mode: None,
            simulated_review_summary: None,
            simulated_calibration_notes: Vec::new(),
            simulated_promotion_candidate_count: None,
            field_engine_ready: false,
            field_engine_primary_type: None,
            field_engine_summary: None,
            field_engine_risks: Vec::new(),
            field_engine_opportunities: Vec::new(),
            empathy_context: None,
        };

        let items = continuity_action_items(None, None, Some(&handoff));
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Prepared context ready: 1 context pack.");
        assert_eq!(items[0].suggested_action, "Open context");
    }

    #[test]
    fn continuity_context_panel_items_promote_snapshot_context_bundle() {
        let state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["task_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: vec![crate::state_snapshot::StateSnapshotContextItem {
                        id: "email_1".to_string(),
                        label: "Supplier quote follow up".to_string(),
                        why_surfaced: "Supplier quote follow up surfaced through 1 topology hop via same thread.".to_string(),
                        confidence: "medium".to_string(),
                        freshness: "reactivated".to_string(),
                        relation_path: vec!["same_thread".to_string()],
                        source_refs: vec!["email_1".to_string()],
                        decrypt_needed: false,
                    }],
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review your schedule".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_context_panel_items(Some(&state));
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "email_1");
        assert_eq!(items[0].freshness, "reactivated");
        assert_eq!(items[0].relation_path, vec!["same_thread".to_string()]);
    }

    #[test]
    fn continuity_context_pack_items_promote_prepared_context_packs() {
        let state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["task_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review your schedule".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(crate::prepared_context_packet::PreparedContextPacket {
                        packet_kind: "continuity_context".to_string(),
                        ready: true,
                        summary: "Prepared context ready: 1 context pack.".to_string(),
                        anchor_refs: vec!["email_1".to_string()],
                        source_refs: vec!["email_1".to_string(), "file_1".to_string()],
                        decision_refs: Vec::new(),
                        decision_history_refs: Vec::new(),
                        response_refs: Vec::new(),
                        follow_up_refs: vec!["email_1".to_string()],
                        relationship_refs: Vec::new(),
                        project_refs: vec!["email_1".to_string()],
                        reference_refs: Vec::new(),
                        object_refs: vec!["project_aurora".to_string()],
                        thread_refs: vec!["email_1".to_string()],
                        file_refs: vec!["file_1".to_string()],
                        packs: vec![crate::prepared_context_packet::PreparedContextPack {
                            pack_id: "continuity_topic_pack".to_string(),
                            pack_kind: "topic_pack".to_string(),
                            title: "Project topic pack".to_string(),
                            summary: "Bounded topic continuity across 2 refs.".to_string(),
                            confidence: "high".to_string(),
                            why_surfaced: "Surfaced from linked project, thread, and file continuity evidence.".to_string(),
                            anchor_refs: vec!["email_1".to_string()],
                            source_refs: vec!["email_1".to_string(), "file_1".to_string()],
                            reference_refs: vec!["project_aurora".to_string()],
                            object_refs: vec!["project_aurora".to_string()],
                            file_refs: vec!["file_1".to_string()],
                            file_labels: vec!["aurora-plan.pdf".to_string()],
                            evidence_kinds: vec!["project".to_string(), "thread".to_string(), "file".to_string()],
                            memory_space: None,
                            author_mask: None,
                            author_type: None,
                            author_id: None,
                            is_human_authored: None,
                            human_only: None,
                        }],
                        decrypt_needed_count: 0,
                        memory_space: None,
                        author_mask: None,
                        author_type: None,
                        author_id: None,
                        is_human_authored: None,
                        human_only: None,
                        ..crate::prepared_context_packet::PreparedContextPacket::default()
                    }),
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_context_pack_items(Some(&state));
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].pack_kind, "topic_pack");
        assert_eq!(items[0].reference_refs, vec!["project_aurora"]);
        assert_eq!(items[0].reference_labels, vec!["Project topic pack"]);
        assert_eq!(items[0].object_refs, vec!["project_aurora"]);
        assert_eq!(items[0].object_labels, vec!["Project topic pack"]);
        assert_eq!(items[0].file_refs, vec!["file_1"]);
        assert_eq!(items[0].file_labels, vec!["aurora-plan.pdf"]);
        assert_eq!(items[0].evidence_kinds, vec!["project", "thread", "file"]);
    }

    #[test]
    fn continuity_context_pack_items_prefer_user_grounded_pack_when_other_ranks_tie() {
        let state = DashboardContinuityMessage {
            id: "snapshot_scope_ctx".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["task_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review context".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(
                        crate::prepared_context_packet::PreparedContextPacket {
                            packet_kind: "continuity_context".to_string(),
                            ready: true,
                            summary: "Prepared context ready: 2 context packs.".to_string(),
                            anchor_refs: vec!["email_1".to_string()],
                            source_refs: vec!["email_1".to_string()],
                            decision_refs: Vec::new(),
                            decision_history_refs: Vec::new(),
                            response_refs: Vec::new(),
                            follow_up_refs: Vec::new(),
                            relationship_refs: Vec::new(),
                            project_refs: Vec::new(),
                            reference_refs: Vec::new(),
                            object_refs: Vec::new(),
                            thread_refs: vec!["email_1".to_string()],
                            file_refs: Vec::new(),
                            packs: vec![
                                crate::prepared_context_packet::PreparedContextPack {
                                    pack_id: "pack_generic".to_string(),
                                    pack_kind: "topic_pack".to_string(),
                                    title: "Generic topic pack".to_string(),
                                    summary: "Generic continuity pack.".to_string(),
                                    confidence: "high".to_string(),
                                    why_surfaced: "Linked continuity evidence.".to_string(),
                                    anchor_refs: vec!["email_1".to_string()],
                                    source_refs: vec!["email_1".to_string()],
                                    reference_refs: vec!["project_aurora".to_string()],
                                    object_refs: vec!["project_aurora".to_string()],
                                    file_refs: Vec::new(),
                                    file_labels: Vec::new(),
                                    evidence_kinds: vec!["project".to_string()],
                                    memory_space: None,
                                    author_mask: Some("public".to_string()),
                                    author_type: Some("agent".to_string()),
                                    author_id: None,
                                    is_human_authored: Some(false),
                                    human_only: Some(false),
                                },
                                crate::prepared_context_packet::PreparedContextPack {
                                    pack_id: "pack_grounded".to_string(),
                                    pack_kind: "topic_pack".to_string(),
                                    title: "Grounded topic pack".to_string(),
                                    summary: "Grounded continuity pack.".to_string(),
                                    confidence: "high".to_string(),
                                    why_surfaced: "Linked continuity evidence.".to_string(),
                                    anchor_refs: vec!["email_1".to_string()],
                                    source_refs: vec!["email_1".to_string()],
                                    reference_refs: vec!["project_aurora".to_string()],
                                    object_refs: vec!["project_aurora".to_string()],
                                    file_refs: Vec::new(),
                                    file_labels: Vec::new(),
                                    evidence_kinds: vec!["project".to_string()],
                                    memory_space: Some("work".to_string()),
                                    author_mask: Some("private".to_string()),
                                    author_type: Some("human".to_string()),
                                    author_id: Some("user_01".to_string()),
                                    is_human_authored: Some(true),
                                    human_only: Some(false),
                                },
                            ],
                            decrypt_needed_count: 0,
                            memory_space: None,
                            author_mask: None,
                            author_type: None,
                            author_id: None,
                            is_human_authored: None,
                            human_only: None,
                            ..crate::prepared_context_packet::PreparedContextPacket::default()
                        },
                    ),
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_context_pack_items(Some(&state));
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, "pack_grounded");
        assert_eq!(items[0].title, "Grounded topic pack");
    }

    #[test]
    fn continuity_context_pack_items_prefer_file_linked_pack_when_other_ranks_tie() {
        let state = DashboardContinuityMessage {
            id: "snapshot_file_ctx".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["email_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review context".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(
                        crate::prepared_context_packet::PreparedContextPacket {
                            packet_kind: "continuity_context".to_string(),
                            ready: true,
                            summary: "Prepared context ready: 2 context packs.".to_string(),
                            anchor_refs: vec!["email_1".to_string()],
                            source_refs: vec!["email_1".to_string()],
                            decision_refs: Vec::new(),
                            decision_history_refs: Vec::new(),
                            response_refs: Vec::new(),
                            follow_up_refs: Vec::new(),
                            relationship_refs: Vec::new(),
                            project_refs: Vec::new(),
                            reference_refs: Vec::new(),
                            object_refs: Vec::new(),
                            thread_refs: vec!["email_1".to_string()],
                            file_refs: Vec::new(),
                            packs: vec![
                                crate::prepared_context_packet::PreparedContextPack {
                                    pack_id: "pack_plain".to_string(),
                                    pack_kind: "topic_pack".to_string(),
                                    title: "Plain topic pack".to_string(),
                                    summary: "General continuity pack.".to_string(),
                                    confidence: "high".to_string(),
                                    why_surfaced: "Linked continuity evidence.".to_string(),
                                    anchor_refs: vec!["email_1".to_string()],
                                    source_refs: vec!["email_1".to_string()],
                                    reference_refs: vec!["project_aurora".to_string()],
                                    object_refs: vec!["project_aurora".to_string()],
                                    file_refs: Vec::new(),
                                    file_labels: Vec::new(),
                                    evidence_kinds: vec!["project".to_string()],
                                    memory_space: None,
                                    author_mask: None,
                                    author_type: None,
                                    author_id: None,
                                    is_human_authored: None,
                                    human_only: None,
                                },
                                crate::prepared_context_packet::PreparedContextPack {
                                    pack_id: "pack_file".to_string(),
                                    pack_kind: "topic_pack".to_string(),
                                    title: "File-linked topic pack".to_string(),
                                    summary: "General continuity pack.".to_string(),
                                    confidence: "high".to_string(),
                                    why_surfaced: "Linked continuity evidence.".to_string(),
                                    anchor_refs: vec!["email_1".to_string()],
                                    source_refs: vec!["email_1".to_string()],
                                    reference_refs: vec!["project_aurora".to_string()],
                                    object_refs: vec!["project_aurora".to_string()],
                                    file_refs: vec!["file:docs/launch-brief.md".to_string()],
                                    file_labels: vec!["launch-brief.md".to_string()],
                                    evidence_kinds: vec!["project".to_string()],
                                    memory_space: None,
                                    author_mask: None,
                                    author_type: None,
                                    author_id: None,
                                    is_human_authored: None,
                                    human_only: None,
                                },
                            ],
                            decrypt_needed_count: 0,
                            memory_space: None,
                            author_mask: None,
                            author_type: None,
                            author_id: None,
                            is_human_authored: None,
                            human_only: None,
                            ..crate::prepared_context_packet::PreparedContextPacket::default()
                        },
                    ),
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_context_pack_items(Some(&state));
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, "pack_file");
        assert_eq!(items[0].file_labels, vec!["launch-brief.md"]);
    }

    #[test]
    fn continuity_context_pack_items_prefer_obligation_pack_when_scope_ties() {
        let state = DashboardContinuityMessage {
            id: "snapshot_value_ctx".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["task_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review context".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(crate::prepared_context_packet::PreparedContextPacket {
                        packet_kind: "continuity_context".to_string(),
                        ready: true,
                        summary: "Prepared context ready: 2 context packs.".to_string(),
                        anchor_refs: vec!["email_1".to_string()],
                        source_refs: vec!["email_1".to_string()],
                        decision_refs: Vec::new(),
                        decision_history_refs: Vec::new(),
                        response_refs: Vec::new(),
                        follow_up_refs: Vec::new(),
                        relationship_refs: Vec::new(),
                        project_refs: Vec::new(),
                        reference_refs: Vec::new(),
                        object_refs: Vec::new(),
                        thread_refs: vec!["email_1".to_string()],
                        file_refs: Vec::new(),
                        packs: vec![
                            crate::prepared_context_packet::PreparedContextPack {
                                pack_id: "pack_topic".to_string(),
                                pack_kind: "topic_pack".to_string(),
                                title: "Project topic pack".to_string(),
                                summary: "Generic project continuity.".to_string(),
                                confidence: "high".to_string(),
                                why_surfaced: "Surfaced from linked project continuity.".to_string(),
                                anchor_refs: vec!["email_1".to_string()],
                                source_refs: vec!["email_1".to_string()],
                                reference_refs: vec!["project_aurora".to_string()],
                                object_refs: vec!["project_aurora".to_string()],
                                file_refs: Vec::new(),
                                file_labels: Vec::new(),
                                evidence_kinds: vec!["project".to_string()],
                                memory_space: Some("work".to_string()),
                                author_mask: Some("private".to_string()),
                                author_type: Some("human".to_string()),
                                author_id: Some("user_01".to_string()),
                                is_human_authored: Some(true),
                                human_only: Some(false),
                            },
                            crate::prepared_context_packet::PreparedContextPack {
                                pack_id: "pack_obligation".to_string(),
                                pack_kind: "obligation_pack".to_string(),
                                title: "Due obligations".to_string(),
                                summary: "Due obligations continuity.".to_string(),
                                confidence: "high".to_string(),
                                why_surfaced: "Surfaced from due commitments and active follow-up pressure.".to_string(),
                                anchor_refs: vec!["email_1".to_string()],
                                source_refs: vec!["email_1".to_string()],
                                reference_refs: vec!["task_deadline".to_string()],
                                object_refs: vec!["task_deadline".to_string()],
                                file_refs: Vec::new(),
                                file_labels: Vec::new(),
                                evidence_kinds: vec!["follow_up".to_string()],
                                memory_space: Some("work".to_string()),
                                author_mask: Some("private".to_string()),
                                author_type: Some("human".to_string()),
                                author_id: Some("user_01".to_string()),
                                is_human_authored: Some(true),
                                human_only: Some(false),
                            },
                        ],
                        decrypt_needed_count: 0,
                        memory_space: None,
                        author_mask: None,
                        author_type: None,
                        author_id: None,
                        is_human_authored: None,
                        human_only: None,
                        ..crate::prepared_context_packet::PreparedContextPacket::default()
                    }),
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_context_pack_items(Some(&state));
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, "pack_obligation");
        assert_eq!(items[0].pack_kind, "obligation_pack");
    }

    #[test]
    fn continuity_context_pack_items_prefer_more_evidenced_pack_when_other_ranks_tie() {
        let state = DashboardContinuityMessage {
            id: "snapshot_evidenced_ctx".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["email_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review context".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(
                        crate::prepared_context_packet::PreparedContextPacket {
                            packet_kind: "continuity_context".to_string(),
                            ready: true,
                            summary: "Prepared context ready: 2 context packs.".to_string(),
                            anchor_refs: vec!["email_1".to_string()],
                            source_refs: vec!["email_1".to_string()],
                            decision_refs: Vec::new(),
                            decision_history_refs: Vec::new(),
                            response_refs: Vec::new(),
                            follow_up_refs: Vec::new(),
                            relationship_refs: Vec::new(),
                            project_refs: Vec::new(),
                            reference_refs: Vec::new(),
                            object_refs: Vec::new(),
                            thread_refs: vec!["email_1".to_string()],
                            file_refs: Vec::new(),
                            packs: vec![
                                crate::prepared_context_packet::PreparedContextPack {
                                    pack_id: "pack_light".to_string(),
                                    pack_kind: "topic_pack".to_string(),
                                    title: "Light topic pack".to_string(),
                                    summary: "General continuity pack.".to_string(),
                                    confidence: "high".to_string(),
                                    why_surfaced: "Linked continuity evidence.".to_string(),
                                    anchor_refs: vec!["email_1".to_string()],
                                    source_refs: vec!["email_1".to_string()],
                                    reference_refs: vec!["project_aurora".to_string()],
                                    object_refs: vec!["project_aurora".to_string()],
                                    file_refs: Vec::new(),
                                    file_labels: Vec::new(),
                                    evidence_kinds: vec!["project".to_string()],
                                    memory_space: None,
                                    author_mask: None,
                                    author_type: None,
                                    author_id: None,
                                    is_human_authored: None,
                                    human_only: None,
                                },
                                crate::prepared_context_packet::PreparedContextPack {
                                    pack_id: "pack_grounded".to_string(),
                                    pack_kind: "topic_pack".to_string(),
                                    title: "Grounded topic pack".to_string(),
                                    summary: "General continuity pack.".to_string(),
                                    confidence: "high".to_string(),
                                    why_surfaced: "Linked continuity evidence.".to_string(),
                                    anchor_refs: vec!["email_1".to_string()],
                                    source_refs: vec![
                                        "email_1".to_string(),
                                        "thread_1".to_string(),
                                        "file:docs/brief.md".to_string(),
                                    ],
                                    reference_refs: vec!["project_aurora".to_string()],
                                    object_refs: vec!["project_aurora".to_string()],
                                    file_refs: Vec::new(),
                                    file_labels: Vec::new(),
                                    evidence_kinds: vec!["project".to_string()],
                                    memory_space: None,
                                    author_mask: None,
                                    author_type: None,
                                    author_id: None,
                                    is_human_authored: None,
                                    human_only: None,
                                },
                            ],
                            decrypt_needed_count: 0,
                            memory_space: None,
                            author_mask: None,
                            author_type: None,
                            author_id: None,
                            is_human_authored: None,
                            human_only: None,
                            ..crate::prepared_context_packet::PreparedContextPacket::default()
                        },
                    ),
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_context_pack_items(Some(&state));
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, "pack_grounded");
        assert_eq!(items[1].id, "pack_light");
    }

    #[test]
    fn continuity_context_pack_items_fall_back_to_simulator_prepared_context_preview() {
        let state = DashboardContinuityMessage {
            id: "snapshot_sim_ctx".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_2".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_promotions": [{
                    "target_kind": "prepared_context"
                }],
                "simulator_prepared_context_preview": {
                    "packet_kind": "continuity",
                    "ready": true,
                    "summary": "Prepare bounded context from flag_conflict around Calendar conflict.",
                    "anchor_refs": ["msg_2"],
                    "source_refs": ["msg_2"],
                    "decision_refs": [],
                    "decision_history_refs": [],
                    "response_refs": [],
                    "follow_up_refs": [],
                    "relationship_refs": [],
                    "project_refs": [],
                    "reference_refs": [],
                    "object_refs": ["project:aurora"],
                    "thread_refs": [],
                    "file_refs": [],
                    "packs": [{
                        "pack_id": "simulator:context:flag-conflict",
                        "pack_kind": "topic_pack",
                        "title": "Simulated context pack",
                        "summary": "Prepare bounded context from flag_conflict around Calendar conflict.",
                        "confidence": "medium",
                        "why_surfaced": "Prepared from bounded simulator projection.",
                        "anchor_refs": ["msg_2"],
                        "source_refs": ["msg_2"],
                        "reference_refs": [],
                        "object_refs": ["project:aurora"],
                        "evidence_kinds": ["simulator_projection"]
                    }],
                    "decrypt_needed_count": 0
                }
            }),
            views: serde_json::json!([]),
        };

        let items = continuity_context_pack_items(Some(&state));
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Simulated context pack");
        assert_eq!(items[0].object_refs, vec!["project:aurora"]);
        assert_eq!(items[0].evidence_kinds, vec!["simulator_projection"]);
    }

    #[test]
    fn continuity_response_items_carry_prepared_draft_object_context() {
        let state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: vec![StateSnapshotResponseItem {
                        id: "resp_1".to_string(),
                        label: "Reply to supplier".to_string(),
                        channel: "email".to_string(),
                        urgency: "today".to_string(),
                        confidence: "high".to_string(),
                        response_due_hint: "Today".to_string(),
                        suggested_next_action: "Review prepared reply".to_string(),
                        source_refs: vec!["msg_1".to_string()],
                    }],
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Reply draft ready".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(crate::prepared_context_packet::PreparedContextPacket {
                        packet_kind: "continuity_context".to_string(),
                        ready: true,
                        summary: "Prepared context packet with linked file anchors.".to_string(),
                        anchor_refs: vec!["msg_1".to_string()],
                        source_refs: vec!["msg_1".to_string()],
                        decision_refs: Vec::new(),
                        decision_history_refs: Vec::new(),
                        response_refs: vec!["msg_1".to_string()],
                        follow_up_refs: Vec::new(),
                        relationship_refs: Vec::new(),
                        project_refs: Vec::new(),
                        reference_refs: Vec::new(),
                        object_refs: vec!["project_aurora".to_string()],
                        thread_refs: Vec::new(),
                        file_refs: vec!["file:docs/launch-brief.md".to_string()],
                        packs: Vec::new(),
                        decrypt_needed_count: 0,
                        memory_space: None,
                        author_mask: None,
                        author_type: None,
                        author_id: None,
                        is_human_authored: None,
                        human_only: None,
                        ..crate::prepared_context_packet::PreparedContextPacket::default()
                    }),
                    prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                        ready: true,
                        summary: "Prepared 1 communication reply draft for review.".to_string(),
                        drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                            draft_id: "draft:reply:msg_1".to_string(),
                            draft_class: "communication_reply".to_string(),
                            label: "Reply draft for Supplier quote follow up".to_string(),
                            channel: "email".to_string(),
                            summary: "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                            body: "Thanks for sending this through.".to_string(),
                            confidence: "medium".to_string(),
                            readiness: "ready_now".to_string(),
                            response_due_hint: "Today".to_string(),
                            approval_required_to_send: true,
                            source_refs: vec!["msg_1".to_string()],
                            source_count: 1,
                            storage_type: "ledger".to_string(),
                            storage_kind: Some("rich_note".to_string()),
                            comparison_headers: Vec::new(),
                            comparison_rows: Vec::new(),
                            selection_reason: None,
                            suggested_next_action: "Review and send email reply".to_string(),
                            object_refs: vec!["project_aurora".to_string()],
                            memory_space: None,
                            author_mask: None,
                            author_type: None,
                            author_id: None,
                            is_human_authored: None,
                            human_only: None,
                        }],
                    }),
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_response_items(Some(&state));
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0].prepared_draft_lead_summary.as_deref(),
            Some(
                "Surfaced around linked object focus on project aurora. Linked object focus centers on project aurora. Linked file focus centers on launch-brief.md. The prepared draft is anchored in this object-linked thread neighborhood. Approval remains in the loop."
            )
        );
        assert_eq!(items[0].prepared_draft_object_refs, vec!["project_aurora"]);
        assert_eq!(
            items[0].prepared_draft_object_labels,
            vec!["project aurora"]
        );
        assert_eq!(
            items[0].prepared_draft_summary_lines,
            vec![
                "Surfaced around linked object focus on project aurora. Linked object focus centers on project aurora. Linked file focus centers on launch-brief.md. The prepared draft is anchored in this object-linked thread neighborhood. Approval remains in the loop.".to_string(),
                "Draft: Reply draft for Supplier quote follow up".to_string(),
                "Object anchors: project aurora.".to_string(),
                "File anchors: launch-brief.md.".to_string(),
                "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                "Next action: Review and send email reply".to_string(),
            ]
        );
        assert_eq!(
            items[0]
                .prepared_draft_thread_retrieval_state
                .as_ref()
                .and_then(|state| state["badges"].as_array())
                .map(|badges| badges.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec![
                "object-linked",
                "file-linked",
                "draft-guided",
                "approval-sensitive"
            ])
        );
    }

    #[test]
    fn continuity_response_items_include_scope_summary_when_prepared_draft_is_grounded() {
        let state = DashboardContinuityMessage {
            id: "snapshot_scope".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: vec![StateSnapshotResponseItem {
                        id: "resp_1".to_string(),
                        label: "Reply to supplier".to_string(),
                        channel: "email".to_string(),
                        urgency: "today".to_string(),
                        confidence: "high".to_string(),
                        response_due_hint: "Today".to_string(),
                        suggested_next_action: "Review prepared reply".to_string(),
                        source_refs: vec!["msg_1".to_string()],
                    }],
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Reply draft ready".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                        ready: true,
                        summary: "Prepared 1 communication reply draft for review.".to_string(),
                        drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                            draft_id: "draft:reply:msg_1".to_string(),
                            draft_class: "communication_reply".to_string(),
                            label: "Reply draft for Supplier quote follow up".to_string(),
                            channel: "email".to_string(),
                            summary: "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                            body: "Thanks for sending this through.".to_string(),
                            confidence: "medium".to_string(),
                            readiness: "ready_now".to_string(),
                            response_due_hint: "Today".to_string(),
                            approval_required_to_send: true,
                            source_refs: vec!["msg_1".to_string()],
                            source_count: 1,
                            storage_type: "ledger".to_string(),
                            storage_kind: Some("rich_note".to_string()),
                            comparison_headers: Vec::new(),
                            comparison_rows: Vec::new(),
                            selection_reason: None,
                            suggested_next_action: "Review and send email reply".to_string(),
                            object_refs: vec!["project_aurora".to_string()],
                            memory_space: Some("work".to_string()),
                            author_mask: Some("private".to_string()),
                            author_type: Some("human".to_string()),
                            author_id: Some("user_01".to_string()),
                            is_human_authored: Some(true),
                            human_only: Some(true),
                        }],
                    }),
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_response_items(Some(&state));
        assert_eq!(
            items[0].prepared_draft_summary_lines,
            vec![
                "Surfaced around linked object focus on project aurora. Linked object focus centers on project aurora. The prepared draft is anchored in this object-linked thread neighborhood. Approval remains in the loop.".to_string(),
                "Scope: work context, human-grounded".to_string(),
                "Draft: Reply draft for Supplier quote follow up".to_string(),
                "Object anchors: project aurora.".to_string(),
                "Prepared an email reply draft for review. Suggested timing: Today.".to_string(),
                "Next action: Review and send email reply".to_string(),
            ]
        );
    }

    #[test]
    fn continuity_prepared_draft_items_fall_back_to_simulator_prepared_draft_preview() {
        let state = DashboardContinuityMessage {
            id: "snapshot_sim_draft".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_promotions": [{
                    "target_kind": "prepared_draft"
                }],
                "simulator_prepared_draft_preview": {
                    "ready": true,
                    "summary": "Prepared 1 project prep note for review.",
                    "drafts": [{
                        "draft_id": "draft:simulator:1",
                        "draft_class": "project_prep_note",
                        "label": "Simulated project prep note",
                        "channel": "project",
                        "summary": "Prepare alternative draft from propose_alternative around Customer demo.",
                        "body": "Prepare alternative draft from propose_alternative around Customer demo.",
                        "confidence": "medium",
                        "readiness": "ready",
                        "response_due_hint": "Next work session",
                        "approval_required_to_send": false,
                        "source_refs": ["msg_1"],
                        "source_count": 1,
                        "storage_type": "ledger",
                        "storage_kind": "rich_note",
                        "comparison_headers": [],
                        "comparison_rows": [],
                        "selection_reason": "Prepared from bounded simulator projection.",
                        "suggested_next_action": "Review simulated prep note",
                        "object_refs": ["project:aurora"]
                    }]
                }
            }),
            views: serde_json::json!([]),
        };

        let items = continuity_prepared_draft_items(Some(&state));
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Simulated project prep note");
        assert_eq!(items[0].draft_class, "project_prep_note");
        assert_eq!(items[0].source_refs, vec!["msg_1"]);
    }

    #[test]
    fn simulator_preview_readers_fail_closed_without_matching_promotion_metadata() {
        let state = DashboardContinuityMessage {
            id: "snapshot_sim_stale".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: Vec::new(),
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({
                "simulator_prepared_context_preview": {
                    "packet_kind": "continuity",
                    "ready": true,
                    "summary": "Stale simulator context preview."
                },
                "simulator_prepared_draft_preview": {
                    "ready": true,
                    "summary": "Stale simulator draft preview.",
                    "drafts": []
                },
                "simulator_reversible_action_preview": {
                    "action_result": {
                        "capability_id": "cap_internal_task_draft_create"
                    }
                },
                "simulator_approval_review_preview": {
                    "approval_kind": "send"
                }
            }),
            views: serde_json::json!([]),
        };

        assert!(simulator_prepared_context_preview_from_state(&state).is_none());
        assert!(simulator_prepared_draft_preview_from_state(&state).is_none());
        assert!(simulator_reversible_action_preview_from_state(&state).is_none());
        assert!(simulator_approval_review_preview_from_state(&state).is_none());
    }

    #[test]
    fn continuity_prepared_draft_items_prefer_file_linked_draft_when_other_ranks_tie() {
        let state = DashboardContinuityMessage {
            id: "snapshot_file_ranked_drafts".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_file".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Reply in thread".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: Some(PreparedContextPacket {
                        packet_kind: "continuity_context".to_string(),
                        ready: true,
                        summary: "Prepared context with file anchors.".to_string(),
                        anchor_refs: Vec::new(),
                        source_refs: vec!["msg_file".to_string()],
                        decision_refs: Vec::new(),
                        decision_history_refs: Vec::new(),
                        response_refs: Vec::new(),
                        follow_up_refs: Vec::new(),
                        relationship_refs: Vec::new(),
                        project_refs: Vec::new(),
                        reference_refs: Vec::new(),
                        object_refs: Vec::new(),
                        thread_refs: Vec::new(),
                        file_refs: vec!["file:docs/launch-brief.md".to_string()],
                        packs: Vec::new(),
                        decrypt_needed_count: 0,
                        memory_space: None,
                        author_mask: None,
                        author_type: None,
                        author_id: None,
                        is_human_authored: None,
                        human_only: None,
                        ..PreparedContextPacket::default()
                    }),
                    prepared_draft_packet: Some(PreparedDraftPacket {
                        ready: true,
                        summary: "Prepared 2 communication reply drafts for review.".to_string(),
                        drafts: vec![
                            crate::prepared_draft_packet::PreparedDraftArtifact {
                                draft_id: "draft:generic".to_string(),
                                draft_class: "communication_reply".to_string(),
                                label: "Reply today".to_string(),
                                channel: "email".to_string(),
                                summary: "Reply today.".to_string(),
                                body: "Reply today.".to_string(),
                                confidence: "high".to_string(),
                                readiness: "ready_now".to_string(),
                                response_due_hint: "Today".to_string(),
                                approval_required_to_send: false,
                                source_refs: vec!["msg_plain".to_string()],
                                source_count: 1,
                                storage_type: "ledger".to_string(),
                                storage_kind: Some("message".to_string()),
                                comparison_headers: Vec::new(),
                                comparison_rows: Vec::new(),
                                selection_reason: Some("Prepared support is ready.".to_string()),
                                suggested_next_action: "Reply in thread".to_string(),
                                object_refs: Vec::new(),
                                memory_space: None,
                                author_mask: None,
                                author_type: None,
                                author_id: None,
                                is_human_authored: None,
                                human_only: None,
                            },
                            crate::prepared_draft_packet::PreparedDraftArtifact {
                                draft_id: "draft:file".to_string(),
                                draft_class: "communication_reply".to_string(),
                                label: "Reply today".to_string(),
                                channel: "email".to_string(),
                                summary: "Reply today.".to_string(),
                                body: "Reply today.".to_string(),
                                confidence: "high".to_string(),
                                readiness: "ready_now".to_string(),
                                response_due_hint: "Today".to_string(),
                                approval_required_to_send: false,
                                source_refs: vec!["msg_file".to_string()],
                                source_count: 1,
                                storage_type: "ledger".to_string(),
                                storage_kind: Some("message".to_string()),
                                comparison_headers: Vec::new(),
                                comparison_rows: Vec::new(),
                                selection_reason: Some("Prepared support is ready.".to_string()),
                                suggested_next_action: "Reply in thread".to_string(),
                                object_refs: Vec::new(),
                                memory_space: None,
                                author_mask: None,
                                author_type: None,
                                author_id: None,
                                is_human_authored: None,
                                human_only: None,
                            },
                        ],
                    }),
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_prepared_draft_items(Some(&state));
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, "draft:file");
        assert_eq!(items[1].id, "draft:generic");
    }

    #[test]
    fn continuity_prepared_draft_items_prefer_more_evidenced_draft_when_other_ranks_tie() {
        let state = DashboardContinuityMessage {
            id: "snapshot_evidenced_drafts".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Reply in thread".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: Vec::new(),
                    prepared_context_packet: None,
                    prepared_draft_packet: Some(PreparedDraftPacket {
                        ready: true,
                        summary: "Prepared 2 communication reply drafts for review.".to_string(),
                        drafts: vec![
                            crate::prepared_draft_packet::PreparedDraftArtifact {
                                draft_id: "draft:light".to_string(),
                                draft_class: "communication_reply".to_string(),
                                label: "Reply today".to_string(),
                                channel: "email".to_string(),
                                summary: "Reply today.".to_string(),
                                body: "Reply today.".to_string(),
                                confidence: "high".to_string(),
                                readiness: "ready_now".to_string(),
                                response_due_hint: "Today".to_string(),
                                approval_required_to_send: false,
                                source_refs: vec!["msg_plain".to_string()],
                                source_count: 1,
                                storage_type: "ledger".to_string(),
                                storage_kind: Some("message".to_string()),
                                comparison_headers: Vec::new(),
                                comparison_rows: Vec::new(),
                                selection_reason: Some("Prepared support is ready.".to_string()),
                                suggested_next_action: "Reply in thread".to_string(),
                                object_refs: Vec::new(),
                                memory_space: Some("work".to_string()),
                                author_mask: Some("private".to_string()),
                                author_type: Some("human".to_string()),
                                author_id: Some("user_01".to_string()),
                                is_human_authored: Some(true),
                                human_only: Some(false),
                            },
                            crate::prepared_draft_packet::PreparedDraftArtifact {
                                draft_id: "draft:grounded".to_string(),
                                draft_class: "communication_reply".to_string(),
                                label: "Reply today".to_string(),
                                channel: "email".to_string(),
                                summary: "Reply today.".to_string(),
                                body: "Reply today.".to_string(),
                                confidence: "high".to_string(),
                                readiness: "ready_now".to_string(),
                                response_due_hint: "Today".to_string(),
                                approval_required_to_send: false,
                                source_refs: vec![
                                    "msg_plain".to_string(),
                                    "thread:client".to_string(),
                                    "file:brief".to_string(),
                                ],
                                source_count: 3,
                                storage_type: "ledger".to_string(),
                                storage_kind: Some("message".to_string()),
                                comparison_headers: Vec::new(),
                                comparison_rows: Vec::new(),
                                selection_reason: Some("Prepared support is ready.".to_string()),
                                suggested_next_action: "Reply in thread".to_string(),
                                object_refs: Vec::new(),
                                memory_space: Some("work".to_string()),
                                author_mask: Some("private".to_string()),
                                author_type: Some("human".to_string()),
                                author_id: Some("user_01".to_string()),
                                is_human_authored: Some(true),
                                human_only: Some(false),
                            },
                        ],
                    }),
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_prepared_draft_items(Some(&state));
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, "draft:grounded");
        assert_eq!(items[1].id, "draft:light");
    }

    #[test]
    fn continuity_state_fields_promote_active_snapshot_fields() {
        let state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["meeting_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review your schedule".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: vec![
                        crate::state_fields::StateFieldActivation {
                            field_key: "meeting_readiness".to_string(),
                            label: "Meeting readiness".to_string(),
                            status: "active".to_string(),
                            confidence: "high".to_string(),
                            surface_hint: "home".to_string(),
                            recommended_action: "Review the prepared meeting brief.".to_string(),
                            autonomy_level: "suggest_with_artifact".to_string(),
                            reason: "A meeting brief is already prepared.".to_string(),
                            evidence_refs: vec!["meeting_1".to_string()],
                        },
                        crate::state_fields::StateFieldActivation {
                            field_key: "research_gap".to_string(),
                            label: "Research gap".to_string(),
                            status: "inactive".to_string(),
                            confidence: "low".to_string(),
                            surface_hint: "context_panel".to_string(),
                            recommended_action: "Gather more context.".to_string(),
                            autonomy_level: "prepare_silently".to_string(),
                            reason: "No gap detected.".to_string(),
                            evidence_refs: Vec::new(),
                        },
                    ],
                    prepared_context_packet: None,
                    prepared_draft_packet: None,
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_state_fields(Some(&state));
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].field_key, "meeting_readiness");
    }

    #[test]
    fn continuity_state_fields_suppress_monitor_lanes_already_bounded_by_prepared_support() {
        let state = DashboardContinuityMessage {
            id: "snapshot_1".to_string(),
            thread_id: "continuity:state:user_01".to_string(),
            timestamp: "2026-06-03T10:00:00Z".to_string(),
            r#type: "state_snapshot".to_string(),
            subtype: "homepage_briefing".to_string(),
            content: serde_json::json!({}),
            parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                StateSnapshotContent {
                    snapshot_kind: "homepage_briefing".to_string(),
                    time_window: "today".to_string(),
                    sources: vec!["msg_1".to_string()],
                    decision_queue: Vec::new(),
                    response_queue: Vec::new(),
                    active_commitments: Vec::new(),
                    critical_changes: Vec::new(),
                    context_panel_items: Vec::new(),
                    watcher_signals: Vec::new(),
                    continuity_metrics: Default::default(),
                    suggested_actions: vec!["Review prepared reply".to_string()],
                    confidence_notes: Vec::new(),
                    state_fields: vec![
                        crate::state_fields::StateFieldActivation {
                            field_key: "project_scope_drift".to_string(),
                            label: "Project scope drift".to_string(),
                            status: "monitor".to_string(),
                            confidence: "medium".to_string(),
                            surface_hint: "context_panel".to_string(),
                            recommended_action: "Inspect project context.".to_string(),
                            autonomy_level: "suggest_with_artifact".to_string(),
                            reason: "One project-linked signal suggests a possible shift in scope."
                                .to_string(),
                            evidence_refs: vec!["msg_project".to_string()],
                        },
                        crate::state_fields::StateFieldActivation {
                            field_key: crate::state_fields::STATE_FIELD_FOLLOW_UP_PRESSURE
                                .to_string(),
                            label: "Follow-up pressure".to_string(),
                            status: "monitor".to_string(),
                            confidence: "medium".to_string(),
                            surface_hint: "response_queue".to_string(),
                            recommended_action: "Review follow-up pressure.".to_string(),
                            autonomy_level: "suggest_with_artifact".to_string(),
                            reason:
                                "Prepared follow-up work is already available, so reply pressure stays bounded."
                                    .to_string(),
                            evidence_refs: vec!["msg_follow_up".to_string()],
                        },
                    ],
                    prepared_context_packet: None,
                    prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                        ready: true,
                        summary: "Prepared 1 communication reply draft for review.".to_string(),
                        drafts: Vec::new(),
                    }),
                    staleness_at: "2026-06-03T12:00:00Z".to_string(),
                },
            )),
            synthesizer_handoff: None,
            metadata: serde_json::json!({}),
            views: serde_json::json!([]),
        };

        let items = continuity_state_fields(Some(&state));
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].field_key, "project_scope_drift");
    }

    #[test]
    fn continuity_trace_context_from_state_summary_includes_simulator_projection() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_conflict".to_string()],
            decision_queue: vec![crate::state_snapshot::StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Resolve Aurora conflict".to_string(),
                category: "scheduling".to_string(),
                urgency: "high".to_string(),
                confidence: "high".to_string(),
                approval_required: true,
                source_refs: vec!["msg_conflict".to_string()],
                suggested_next_action: "Review schedule options".to_string(),
                ..crate::state_snapshot::StateSnapshotDecisionItem::default()
            }],
            watcher_signals: vec![crate::state_snapshot::StateSnapshotWatcherSignal {
                id: "watcher_1".to_string(),
                signal_key: "conflict".to_string(),
                category: "scheduling".to_string(),
                freshness: "fresh".to_string(),
                urgency: "high".to_string(),
                confidence: "high".to_string(),
                urgency_hint: "approval soon".to_string(),
                suppression_status: "active".to_string(),
                escalation_status: "active".to_string(),
                source_type: "watcher_alert".to_string(),
                source_subtype: "scheduling_conflict".to_string(),
                thread_id: "thread_aurora".to_string(),
                source_refs: vec!["msg_conflict".to_string()],
                ..crate::state_snapshot::StateSnapshotWatcherSignal::default()
            }],
            prepared_context_packet: Some(crate::prepared_context_packet::PreparedContextPacket {
                ready: true,
                retrieval_mode: "metadata_first_with_selective_deepening".to_string(),
                deeper_retrieval_recommended: true,
                readiness_reason: Some(
                    "Enough continuity evidence is assembled for a bounded approval review."
                        .to_string(),
                ),
                ..crate::prepared_context_packet::PreparedContextPacket::default()
            }),
            prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                ready: true,
                drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                    draft_class: "communication_reply".to_string(),
                    readiness: "ready_now".to_string(),
                    selection_reason: Some(
                        "The safest next step is a reviewable reply draft before rescheduling."
                            .to_string(),
                    ),
                    approval_required_to_send: true,
                    ..crate::prepared_draft_packet::PreparedDraftArtifact::default()
                }],
                ..crate::prepared_draft_packet::PreparedDraftPacket::default()
            }),
            ..StateSnapshotContent::default()
        };
        let state = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: None,
            latest_state_snapshot: Some(DashboardContinuityMessage {
                id: "snapshot_1".to_string(),
                thread_id: "continuity:state:user_01".to_string(),
                timestamp: "2026-06-03T10:00:00Z".to_string(),
                r#type: AFP_TYPE_STATE_SNAPSHOT.to_string(),
                subtype: "homepage_briefing".to_string(),
                content: serde_json::json!({}),
                parsed_content: Some(DashboardContinuityParsedContent::StateSnapshot(
                    snapshot,
                )),
                synthesizer_handoff: None,
                metadata: serde_json::json!({}),
                views: serde_json::json!([]),
            }),
            latest_state_synthesis: None,
            preferred_state_type: AFP_TYPE_STATE_SNAPSHOT.to_string(),
            preferred_state_brief: Some(DashboardContinuityBrief {
                source_type: AFP_TYPE_STATE_SNAPSHOT.to_string(),
                title: "Review Aurora conflict".to_string(),
                decision_count: 2,
                commitment_count: 0,
                critical_change_count: 1,
                suggested_actions: vec!["Review simulator preview".to_string()],
                staleness_at: None,
            }),
            preferred_synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                snapshot_ref: "snapshot_1".to_string(),
                view_id: "homepage:state:user_01".to_string(),
                confidence: "high".to_string(),
                surface_recommendation: "decision_queue".to_string(),
                suggested_mood: None,
                suggested_next_actions: vec![
                    "Review simulator preview".to_string(),
                    "Confirm bounded approval path".to_string(),
                ],
                escalation_required: true,
                approval_boundary: None,
                autonomy_decision: None,
                browser_action_candidate: None,
                prepared_context_ready: true,
                prepared_context_summary: Some("Conflict packet is ready for review.".to_string()),
                prepared_draft_ready: false,
                prepared_draft_summary: None,
                follow_up_write_candidate: None,
                decrypt_trace: None,
                simulated_projection_ready: true,
                simulated_projection_summary: Some(
                    "Bounded simulation found an approval-gated conflict with a reversible fallback."
                        .to_string(),
                ),
                simulated_projection_risks: vec!["Double-booking risk".to_string()],
                simulated_projection_opportunities: vec![
                    "Reschedule through internal review".to_string(),
                ],
                simulated_actionable_event_count: Some(2),
                simulated_review_surfaces_ready: true,
                simulated_rollout_stage: Some("shadow".to_string()),
                simulated_calibration_mode: Some("shadow_only".to_string()),
                simulated_review_summary: Some(
                    "Simulator preview remains shadow-only until a human reviews the conflict."
                        .to_string(),
                ),
                simulated_calibration_notes: vec![
                    "Promotions remain suppressed during bounded deterministic review."
                        .to_string(),
                ],
                simulated_promotion_candidate_count: Some(2),
                field_engine_ready: false,
                field_engine_primary_type: None,
                field_engine_summary: None,
                field_engine_risks: Vec::new(),
                field_engine_opportunities: Vec::new(),
                empathy_context: None,
            }),
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let trace = continuity_trace_context_from_state_summary(&state).expect("trace context");
        assert!(trace.contains(
            "Continuity handoff: surface=decision_queue confidence=high escalation_required=yes."
        ));
        assert!(trace.contains("Planning projection: Bounded simulation traced"));
        assert!(trace.contains(
            "Planning simulator policy: stage=shadow calibration=bounded_deterministic promotions_enabled=no."
        ));
        assert!(trace.contains(
            "Simulator projection: Bounded simulation found an approval-gated conflict with a reversible fallback."
        ));
        assert!(trace.contains("Simulator actionable events: 2."));
        assert!(trace.contains(
            "Simulator review summary: Simulator preview remains shadow-only until a human reviews the conflict."
        ));
        assert!(trace.contains("Simulator promotion candidates: 2."));
        assert!(trace.contains(
            "Simulator calibration notes: Promotions remain suppressed during bounded deterministic review."
        ));
        assert!(trace.contains("Simulator risks: Double-booking risk."));
        assert!(trace.contains("Simulator opportunities: Reschedule through internal review."));
        assert!(trace.contains("Prepared context: Conflict packet is ready for review."));
        assert!(
            trace.contains(
                "Prepared context retrieval mode: metadata first with selective deepening."
            )
        );
        assert!(trace.contains(
            "Prepared context readiness: Enough continuity evidence is assembled for a bounded approval review."
        ));
        assert!(trace.contains("Prepared draft lane: communication reply (ready now)"));
        assert!(trace.contains(
            "Prepared draft selection: The safest next step is a reviewable reply draft before rescheduling."
        ));
        assert!(trace.contains("Prepared draft remains approval-gated before send."));
        assert!(trace.contains(
            "Continuity priority: Review Aurora conflict (source=state_snapshot, decisions=2, critical_changes=1)."
        ));
    }

    #[test]
    fn continuity_trace_context_from_state_summary_falls_back_to_brief() {
        let state = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: Some("synthesis_1".to_string()),
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: AFP_TYPE_STATE_SYNTHESIS.to_string(),
            preferred_state_brief: Some(DashboardContinuityBrief {
                source_type: AFP_TYPE_STATE_SYNTHESIS.to_string(),
                title: "Catch up on inbox replies".to_string(),
                decision_count: 1,
                commitment_count: 0,
                critical_change_count: 0,
                suggested_actions: vec!["Review inbox".to_string()],
                staleness_at: None,
            }),
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: None,
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: Vec::new(),
            preferred_state_fields: Vec::new(),
        };

        let trace = continuity_trace_context_from_state_summary(&state).expect("trace context");
        assert_eq!(
            trace,
            "Continuity priority: Catch up on inbox replies (source=state_synthesis, decisions=1, critical_changes=0)."
        );
    }

    #[test]
    fn continuity_primary_mode_prefers_priority_card_then_briefing() {
        let card = ContinuityPriorityCard {
            title: "Approve the suggested action".to_string(),
            description: "Approve the suggested action requires explicit approval.".to_string(),
            panel_kind: "approval_queue".to_string(),
            requires_approval: true,
            action_label: "Approve the suggested action".to_string(),
            surface_hint: Some("decision_queue".to_string()),
            confidence: Some("medium".to_string()),
            prepared_draft_class: None,
            selection_reason: None,
            approval_or_reversibility_hint: None,
            provenance_cue: None,
            autonomy_tier: None,
            retrieval_mode: None,
            deeper_retrieval_recommended: false,
            readiness_reason: None,
            topology_budget_used: 0,
            working_set_count: 0,
            active_topic_count: 0,
            working_set_refs: Vec::new(),
            active_topic_refs: Vec::new(),
            decision_history_refs: Vec::new(),
            project_refs: Vec::new(),
            thread_refs: Vec::new(),
            linked_target_label: None,
            source_refs: vec!["msg_1".to_string()],
            object_refs: Vec::new(),
            object_labels: Vec::new(),
            file_refs: Vec::new(),
            file_labels: Vec::new(),
            thread_retrieval_state: None,
            autonomy_decision: None,
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        };

        assert_eq!(
            continuity_primary_mode(Some(&card), "approval_queue"),
            "priority_card"
        );
        assert_eq!(
            continuity_primary_mode(None, "briefing_bar"),
            "briefing_bar"
        );
        assert_eq!(
            continuity_primary_mode(None, "context_panel"),
            "continuity_panel"
        );
    }

    #[test]
    fn build_continuity_summary_response_preserves_state_aliases() {
        let messages = vec![json!({
            "id": "snapshot_1",
            "type": AFP_TYPE_STATE_SNAPSHOT,
        })];
        let state = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: Some("snapshot_1".to_string()),
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: AFP_TYPE_STATE_SNAPSHOT.to_string(),
            preferred_state_brief: Some(DashboardContinuityBrief {
                source_type: AFP_TYPE_STATE_SNAPSHOT.to_string(),
                title: "Review schedule".to_string(),
                decision_count: 1,
                commitment_count: 0,
                critical_change_count: 0,
                suggested_actions: vec!["Review schedule".to_string()],
                staleness_at: Some("2026-06-03T12:00:00Z".to_string()),
            }),
            preferred_synthesizer_handoff: Some(SynthesizerToMasterHandoff {
                snapshot_ref: "snapshot_1".to_string(),
                view_id: "homepage:state:user_01".to_string(),
                confidence: "medium".to_string(),
                surface_recommendation: "decision_queue".to_string(),
                suggested_mood: None,
                suggested_next_actions: vec!["Review schedule".to_string()],
                escalation_required: true,
                approval_boundary: None,
                autonomy_decision: None,
                browser_action_candidate: None,
                prepared_context_ready: false,
                prepared_context_summary: None,
                prepared_draft_ready: false,
                prepared_draft_summary: None,
                follow_up_write_candidate: None,
                decrypt_trace: None,
                simulated_projection_ready: false,
                simulated_projection_summary: None,
                simulated_projection_risks: Vec::new(),
                simulated_projection_opportunities: Vec::new(),
                simulated_actionable_event_count: None,
                simulated_review_surfaces_ready: false,
                simulated_rollout_stage: None,
                simulated_calibration_mode: None,
                simulated_review_summary: None,
                simulated_calibration_notes: Vec::new(),
                simulated_promotion_candidate_count: None,
                field_engine_ready: false,
                field_engine_primary_type: None,
                field_engine_summary: None,
                field_engine_risks: Vec::new(),
                field_engine_opportunities: Vec::new(),
                empathy_context: None,
            }),
            preferred_priority_item: Some(ContinuityPriorityItem {
                title: "Review schedule".to_string(),
                panel_kind: "approval_queue".to_string(),
                requires_approval: true,
                surface_hint: Some("decision_queue".to_string()),
                suggested_action: Some("Review schedule".to_string()),
                confidence: Some("medium".to_string()),
                prepared_draft_class: None,
                selection_reason: None,
                source_refs: vec!["msg_1".to_string()],
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            preferred_priority_card: Some(ContinuityPriorityCard {
                title: "Review schedule".to_string(),
                description: "Review schedule requires explicit approval.".to_string(),
                panel_kind: "approval_queue".to_string(),
                requires_approval: true,
                action_label: "Review schedule".to_string(),
                surface_hint: Some("decision_queue".to_string()),
                confidence: Some("medium".to_string()),
                prepared_draft_class: None,
                selection_reason: None,
                approval_or_reversibility_hint: None,
                provenance_cue: None,
                autonomy_tier: None,
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                working_set_refs: Vec::new(),
                active_topic_refs: Vec::new(),
                decision_history_refs: Vec::new(),
                project_refs: Vec::new(),
                thread_refs: Vec::new(),
                linked_target_label: Some("Aurora rollout thread".to_string()),
                source_refs: vec!["msg_1".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                thread_retrieval_state: None,
                autonomy_decision: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: None,
            preferred_response_items: Vec::new(),
            preferred_prepared_draft_items: Vec::new(),
            preferred_context_panel_items: Vec::new(),
            preferred_context_pack_items: vec![ContinuityPreparedContextPackItem {
                id: "topic_1".to_string(),
                pack_kind: "topic_pack".to_string(),
                title: "Aurora topic pack".to_string(),
                summary: "Bounded topic continuity across linked work.".to_string(),
                confidence: "high".to_string(),
                why_surfaced: "Surfaced from linked project continuity.".to_string(),
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                anchor_refs: vec!["msg_1".to_string()],
                source_refs: vec!["msg_1".to_string(), "msg_2".to_string()],
                reference_refs: vec!["thread:aurora".to_string()],
                reference_labels: vec!["Aurora rollout thread".to_string()],
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                evidence_kinds: vec!["reference".to_string(), "project".to_string()],
                thread_retrieval_state: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }],
            preferred_state_fields: Vec::new(),
        };

        let response = build_continuity_summary_response(messages.clone(), state.clone());
        assert_eq!(response.messages.len(), 1);
        assert_eq!(
            response.latest_state_snapshot_ref.as_deref(),
            Some("snapshot_1")
        );
        assert_eq!(
            response
                .preferred_state_brief
                .as_ref()
                .map(|brief| brief.title.as_str()),
            Some("Review schedule")
        );
        assert_eq!(
            response
                .preferred_synthesizer_handoff
                .as_ref()
                .map(|handoff| handoff.view_id.as_str()),
            Some("homepage:state:user_01")
        );
        assert_eq!(
            response
                .preferred_priority_item
                .as_ref()
                .map(|item| item.panel_kind.as_str()),
            Some("approval_queue")
        );
        assert_eq!(
            response
                .preferred_priority_card
                .as_ref()
                .map(|card| card.panel_kind.as_str()),
            Some("approval_queue")
        );
        assert_eq!(
            response
                .preferred_priority_card
                .as_ref()
                .and_then(|card| card.linked_target_label.as_deref()),
            Some("Aurora rollout thread")
        );
        assert_eq!(
            response
                .preferred_context_pack_items
                .first()
                .and_then(|item| item.reference_labels.first())
                .map(String::as_str),
            Some("Aurora rollout thread")
        );
        assert_eq!(response.state.preferred_state_type, AFP_TYPE_STATE_SNAPSHOT);
    }

    #[test]
    fn continuity_summary_response_restyles_review_copy_for_active_persona() {
        let persona = crate::agent_personas::AgentPersona {
            id: "persona_1".to_string(),
            owner_user_id: "user_1".to_string(),
            name: "Brief".to_string(),
            soul_md: "Keep review copy concise.".to_string(),
            writing_style: "concise".to_string(),
            skills_json: serde_json::json!([]),
            lora_confidence_score: 0.0,
            lora_genome_active: false,
            is_active: true,
            created_at: "2026-08-26T00:00:00Z".to_string(),
            updated_at: "2026-08-26T00:00:00Z".to_string(),
        };
        let state = DashboardContinuityStateResponse {
            latest_state_snapshot_ref: None,
            latest_state_synthesis_ref: None,
            latest_state_snapshot: None,
            latest_state_synthesis: None,
            preferred_state_type: "none".to_string(),
            preferred_state_brief: None,
            preferred_synthesizer_handoff: None,
            preferred_priority_item: None,
            preferred_priority_card: Some(ContinuityPriorityCard {
                title: "Prepared response".to_string(),
                description: "Prepared response is ready for review.".to_string(),
                panel_kind: "response_queue".to_string(),
                requires_approval: false,
                action_label: "Open responses".to_string(),
                surface_hint: Some("response_queue".to_string()),
                confidence: Some("high".to_string()),
                prepared_draft_class: Some("communication_reply".to_string()),
                selection_reason: Some("Prepared reply is already aligned.".to_string()),
                approval_or_reversibility_hint: Some(
                    "Reviewing this suggestion does not execute a side effect.".to_string(),
                ),
                provenance_cue: None,
                autonomy_tier: None,
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: None,
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                working_set_refs: Vec::new(),
                active_topic_refs: Vec::new(),
                decision_history_refs: Vec::new(),
                project_refs: Vec::new(),
                thread_refs: Vec::new(),
                linked_target_label: None,
                source_refs: Vec::new(),
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                thread_retrieval_state: None,
                autonomy_decision: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }),
            preferred_action_items: Vec::new(),
            preferred_action_overflow_count: 0,
            preferred_action_overflow_summary: Some(
                "Prepared work is available for review.".to_string(),
            ),
            preferred_response_items: vec![ContinuityResponseItem {
                id: "resp_1".to_string(),
                title: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                response_due_hint: "Today".to_string(),
                suggested_action: "Open response queue".to_string(),
                autonomy_decision: None,
                prepared_draft_id: Some("draft_1".to_string()),
                prepared_draft_summary: Some("Prepared an email reply draft.".to_string()),
                prepared_draft_readiness: None,
                prepared_draft_body: None,
                prepared_draft_class: Some("communication_reply".to_string()),
                prepared_draft_selection_reason: Some(
                    "Prepared response is ready for review.".to_string(),
                ),
                prepared_draft_available: true,
                prepared_draft_requires_approval: false,
                prepared_draft_autonomy_decision: None,
                prepared_draft_lead_summary: Some("Prepared a calm follow-up.".to_string()),
                prepared_draft_summary_lines: vec!["Suggested timing: Today.".to_string()],
                prepared_draft_object_refs: Vec::new(),
                prepared_draft_object_labels: Vec::new(),
                prepared_draft_thread_retrieval_state: None,
                source_refs: Vec::new(),
            }],
            preferred_prepared_draft_items: vec![ContinuityPreparedDraftItem {
                id: "draft_1".to_string(),
                draft_class: "communication_reply".to_string(),
                title: "Supplier reply".to_string(),
                channel: "email".to_string(),
                summary: "Prepared an email reply draft for review.".to_string(),
                body: "Body".to_string(),
                confidence: "high".to_string(),
                readiness: "ready_now".to_string(),
                response_due_hint: "Today".to_string(),
                requires_approval: false,
                suggested_action: "Review reply".to_string(),
                autonomy_decision: None,
                selection_reason: Some("Prepared response is ready for review.".to_string()),
                source_refs: Vec::new(),
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                comparison_headers: Vec::new(),
                comparison_rows: Vec::new(),
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }],
            preferred_context_panel_items: vec![ContinuityContextPanelItem {
                id: "ctx_1".to_string(),
                label: "Aurora".to_string(),
                why_surfaced: "Related context was assembled for review.".to_string(),
                confidence: "high".to_string(),
                freshness: "fresh".to_string(),
                relation_path: Vec::new(),
                source_refs: Vec::new(),
                decrypt_needed: false,
            }],
            preferred_context_pack_items: vec![ContinuityPreparedContextPackItem {
                id: "pack_1".to_string(),
                pack_kind: "topic".to_string(),
                title: "Prepared context".to_string(),
                summary: "Prepared context is ready for review.".to_string(),
                confidence: "high".to_string(),
                why_surfaced: "Related context was assembled because this thread is active."
                    .to_string(),
                retrieval_mode: None,
                deeper_retrieval_recommended: false,
                readiness_reason: Some("One more anchor may be worth reviewing.".to_string()),
                topology_budget_used: 0,
                working_set_count: 0,
                active_topic_count: 0,
                anchor_refs: Vec::new(),
                source_refs: Vec::new(),
                reference_refs: Vec::new(),
                reference_labels: Vec::new(),
                object_refs: Vec::new(),
                object_labels: Vec::new(),
                file_refs: Vec::new(),
                file_labels: Vec::new(),
                evidence_kinds: Vec::new(),
                thread_retrieval_state: None,
                memory_space: None,
                author_mask: None,
                author_type: None,
                author_id: None,
                is_human_authored: None,
                human_only: None,
            }],
            preferred_state_fields: Vec::new(),
        };

        let response = super::build_continuity_summary_response_with_persona(
            Vec::new(),
            state,
            Some(&persona),
        );
        assert_eq!(
            response
                .preferred_priority_card
                .as_ref()
                .map(|card| card.description.as_str()),
            Some("Briefly: Prepared response is ready for review.")
        );
        assert_eq!(
            response
                .preferred_response_items
                .first()
                .and_then(|item| item.prepared_draft_summary.as_deref()),
            Some("Briefly: Prepared an email reply draft.")
        );
        assert_eq!(
            response
                .preferred_context_pack_items
                .first()
                .map(|item| item.summary.as_str()),
            Some("Briefly: Prepared context is ready for review.")
        );
    }

    #[test]
    fn state_synthesis_response_restyles_user_visible_copy_for_active_persona() {
        let persona = crate::agent_personas::AgentPersona {
            id: "persona_1".to_string(),
            owner_user_id: "user_1".to_string(),
            name: "Brief".to_string(),
            soul_md: "Keep user-facing copy concise.".to_string(),
            writing_style: "concise".to_string(),
            skills_json: serde_json::json!([]),
            lora_confidence_score: 0.0,
            lora_genome_active: false,
            is_active: true,
            created_at: "2026-08-26T00:00:00Z".to_string(),
            updated_at: "2026-08-26T00:00:00Z".to_string(),
        };
        let synthesis = serde_json::json!({
            "content": {
                "headline": "Prepared response is ready for review.",
                "focus_items": ["Prepared context is ready for review."]
            },
            "views": [{
                "props": {
                    "title": "Prepared response is ready for review.",
                    "items": ["Prepared context is ready for review."]
                }
            }],
            "metadata": {
                "synthesizer_handoff": {
                    "suggested_actions": ["Review follow-up pressure."],
                    "prepared_context_summary": "Prepared context is ready for review.",
                    "profile_id": "profile_7",
                    "field_engine_ready": true
                },
                "field_engine_summary": {
                    "summary": "Prepared response is ready for review.",
                    "status": "stable",
                    "risks": [{
                        "recommended_action": "Gather evidence.",
                        "risk_id": "risk_1"
                    }]
                },
                "simulator_approval_review_preview": {
                    "title": "Review outbound action",
                    "reason": "Prepared work is ready for review.",
                    "status": "pending",
                    "options": [{
                        "option_id": "review_first",
                        "label": "Review first",
                        "consequence_summary": "Nothing sends until you approve."
                    }]
                }
            }
        });

        let styled = super::style_state_synthesis_response(synthesis, Some(&persona));

        assert_eq!(
            styled["content"]["headline"].as_str(),
            Some("Briefly: Prepared response is ready for review.")
        );
        assert_eq!(
            styled["views"][0]["props"]["items"][0].as_str(),
            Some("Briefly: Prepared context is ready for review.")
        );
        assert_eq!(
            styled["metadata"]["synthesizer_handoff"]["suggested_actions"][0].as_str(),
            Some("Briefly: Review follow-up pressure.")
        );
        assert_eq!(
            styled["metadata"]["field_engine_summary"]["risks"][0]["recommended_action"].as_str(),
            Some("Briefly: Gather evidence.")
        );
        assert_eq!(
            styled["metadata"]["simulator_approval_review_preview"]["reason"].as_str(),
            Some("Briefly: Prepared work is ready for review.")
        );
        assert_eq!(
            styled["metadata"]["synthesizer_handoff"]["profile_id"].as_str(),
            Some("profile_7")
        );
        assert_eq!(
            styled["metadata"]["synthesizer_handoff"]["field_engine_ready"].as_bool(),
            Some(true)
        );
        assert_eq!(
            styled["metadata"]["field_engine_summary"]["status"].as_str(),
            Some("stable")
        );
        assert_eq!(
            styled["metadata"]["field_engine_summary"]["risks"][0]["risk_id"].as_str(),
            Some("risk_1")
        );
        assert_eq!(
            styled["metadata"]["simulator_approval_review_preview"]["status"].as_str(),
            Some("pending")
        );
        assert_eq!(
            styled["metadata"]["simulator_approval_review_preview"]["options"][0]["option_id"]
                .as_str(),
            Some("review_first")
        );
    }
}

fn continuity_field_engine_primary_type(state: &DashboardContinuityMessage) -> Option<String> {
    state
        .synthesizer_handoff
        .as_ref()
        .and_then(|handoff| {
            if !handoff.field_engine_ready {
                return None;
            }
            field_type_from_primary_or_summary(
                handoff.field_engine_primary_type.as_deref(),
                handoff.field_engine_summary.as_deref(),
            )
            .map(str::to_string)
        })
        .or_else(|| {
            state
                .metadata
                .get("field_engine_summary")
                .and_then(Value::as_object)
                .and_then(|summary| {
                    field_type_from_primary_or_summary(
                        summary.get("primary_field_type").and_then(Value::as_str),
                        summary.get("summary").and_then(Value::as_str),
                    )
                })
                .map(str::to_string)
        })
}

fn continuity_field_engine_summary(state: &DashboardContinuityMessage) -> Option<String> {
    state
        .synthesizer_handoff
        .as_ref()
        .and_then(|handoff| {
            handoff
                .field_engine_summary
                .as_ref()
                .filter(|summary| handoff.field_engine_ready && !summary.trim().is_empty())
                .cloned()
        })
        .or_else(|| {
            state
                .metadata
                .get("field_engine_summary")
                .and_then(Value::as_object)
                .and_then(|summary| summary.get("summary"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|summary| !summary.is_empty())
                .map(str::to_string)
        })
}

fn continuity_brief_title(
    default_title: &str,
    snapshot_kind: Option<&str>,
    field_engine_primary_type: Option<&str>,
    field_engine_summary: Option<&str>,
) -> String {
    let trimmed = default_title.trim();
    if !trimmed.is_empty() && !is_generic_continuity_brief_title(trimmed, snapshot_kind) {
        return trimmed.to_string();
    }
    if let Some(summary) = field_engine_summary
        .map(str::trim)
        .filter(|summary| !summary.is_empty())
    {
        return summary.to_string();
    }
    if let Some(label) = field_engine_primary_type.and_then(field_type_pressure_label) {
        return label.to_string();
    }
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    snapshot_kind
        .unwrap_or("General continuity brief")
        .to_string()
}

fn is_generic_continuity_brief_title(title: &str, snapshot_kind: Option<&str>) -> bool {
    let normalized = title.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return true;
    }
    if snapshot_kind.is_some_and(|kind| normalized == kind.trim().to_ascii_lowercase()) {
        return true;
    }
    matches!(
        normalized.as_str(),
        "general continuity brief" | "legacy synthesis" | "state synthesis" | "homepage briefing"
    )
}
