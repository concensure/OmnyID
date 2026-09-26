/// State Synthesizer — Pillar C of Continuity.
///
/// Aggregates active tasks, pending decisions, recent watcher alerts, and
/// calendar pressure into a single `state_synthesis` AFP message.  Entirely
/// heuristic — zero LLM tokens.  Intended to run on every dashboard bootstrap
/// or explicitly via POST /agent/state/synthesize.
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::Row;
use std::collections::HashSet;
use ulid::Ulid;

use crate::{
    afp::Message as ProtoMessage,
    agent_template::{AGENT_SUBTYPE_APPROVAL_REQUEST, AGENT_TYPE, MSG_AGENT_APPROVAL_REQUEST},
    background_watcher_runtime::score_metadata_relevance,
    db::Db,
    ema_state::EmaAccumulator,
    field_engine::{
        FieldEngineOutcomeSignals, apply_outcome_signals_to_field_engine_metrics,
        evaluate_field_engine_snapshot, field_engine_metric_notes, summarize_field_engine_snapshot,
    },
    file_path_refs::message_file_path_refs,
    heuristic_adaptation::{normalise_queue_pressure, normalise_topic_recurrence},
    message::{
        AFP_TYPE_PERSONA_STATE, AFP_TYPE_SYNTHESIS_INVALIDATION_EVENT, AfpPersonaStateContent,
        AfpSynthesisInvalidationEventContent,
    },
    object_refs::message_object_refs,
    prepared_context_packet::build_prepared_context_packet,
    prepared_draft_packet::{
        PreparedDraftGenerationFeedback, PreparedDraftGenerationPolicy, build_prepared_draft_packet,
    },
    proactive_outcome_memory::summarize_family_outcome_rates_adapted_with_signal_overrides,
    response_queue_policy::ResponseQueuePolicy,
    simulator_loop::simulate_snapshot_projection,
    simulator_promotion::materialize_simulator_promotions,
    state_fields::{
        STATE_FIELD_APPROVAL_REQUIRED_WORK, STATE_FIELD_FOLLOW_UP_PRESSURE,
        STATE_FIELD_RELATIONSHIP_FOLLOW_UP, StateFieldActivation,
        apply_field_engine_advisory_to_state_fields, build_state_fields,
    },
    state_snapshot::{
        AFP_TYPE_STATE_SNAPSHOT, StateSnapshotCommitment, StateSnapshotContent,
        StateSnapshotContextItem, StateSnapshotContinuityMetrics, StateSnapshotCriticalChange,
        StateSnapshotDecisionItem, StateSnapshotResponseItem, StateSnapshotWatcherSignal,
        build_state_snapshot_afp,
    },
    state_synthesizer_contract::{
        SURFACE_HOMEPAGE, apply_empathy_context_to_handoff,
        apply_field_engine_projection_to_handoff, apply_simulation_projection_to_handoff,
        build_synthesizer_handoff,
    },
    topology_retrieval::build_neighborhood_bundle,
};

pub const AFP_TYPE_STATE_SYNTHESIS: &str = "state_synthesis";
pub const AFP_SUBTYPE_PARA_OVERVIEW: &str = "para_overview";
const AFP_TYPE_BROWSER_TASK_FAMILY: &str = "browser_task";
const AFP_SUBTYPE_BROWSER_TASK_REQUEST_FAMILY: &str = "request";
const STATE_SYNTHESIZER_AGENT: &str = "state_synthesizer";
const STATE_SNAPSHOT_RETENTION_LIMIT: i64 = 24;
const STATE_SYNTHESIS_RETENTION_LIMIT: i64 = 24;

/// PARA section item counts for the `para_overview` subtype.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct ParaOverview {
    pub projects: u32,
    pub areas: u32,
    pub resources: u32,
    pub archive: u32,
    pub total: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AfpStateSynthesisContent {
    pub synthesized_at: String,
    pub active_task_count: u32,
    pub pending_decision_count: u32,
    pub unread_alert_count: u32,
    pub calendar_pressure: String,
    pub headline: String,
    #[serde(default)]
    pub focus_items: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub para_overview: Option<ParaOverview>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct BackgroundWorkQueueSummary {
    total_count: usize,
    prepared_review_count: usize,
    approval_count: usize,
    follow_up_count: usize,
    communication_count: usize,
    renewal_count: usize,
    bill_count: usize,
    form_count: usize,
    evidence_refs: Vec<String>,
}

impl BackgroundWorkQueueSummary {
    fn has_items(&self) -> bool {
        self.total_count > 0
    }

    fn dominant_family(&self) -> Option<&'static str> {
        let families = [
            ("forms", self.form_count),
            ("bills", self.bill_count),
            ("renewals", self.renewal_count),
            ("communications", self.communication_count),
        ];
        families
            .into_iter()
            .filter(|(_, count)| *count > 0)
            .max_by_key(|(_, count)| *count)
            .map(|(family, _)| family)
    }

    fn dominant_family_label(&self) -> &'static str {
        match self.dominant_family() {
            Some("forms") => "form review",
            Some("bills") => "bill review",
            Some("renewals") => "renewal review",
            Some("communications") => "communication follow-up",
            _ => "background work",
        }
    }

    fn preferred_surface_hint(&self) -> &'static str {
        if self.approval_count > 0 {
            return crate::state_synthesizer_contract::SURFACE_DECISION_QUEUE;
        }
        match self.dominant_family() {
            Some("communications") => crate::state_synthesizer_contract::SURFACE_RESPONSE_QUEUE,
            Some("forms" | "bills" | "renewals") => {
                crate::state_synthesizer_contract::SURFACE_DECISION_QUEUE
            }
            _ => crate::state_synthesizer_contract::SURFACE_HOMEPAGE,
        }
    }
}

/// Synthesise a `state_synthesis` AFP message for `user_id`.
/// Reads from the messages table — no LLM tokens consumed.
pub async fn synthesize_state(db: &Db, user_id: &str) -> Result<Value, sqlx::Error> {
    // Gather context from recent AFP messages.
    let tasks = list_messages_by_type(db, user_id, &["task"], 30).await?;
    let decisions = list_messages_by_type(
        db,
        user_id,
        &[
            "decision_request",
            "decision_result",
            MSG_AGENT_APPROVAL_REQUEST,
            AFP_TYPE_BROWSER_TASK_FAMILY,
            AGENT_TYPE,
        ],
        30,
    )
    .await?;
    let alerts = list_messages_by_type(db, user_id, &["watcher_alert"], 10).await?;
    let watcher_resolutions =
        list_messages_by_type(db, user_id, &["watcher_resolution_event"], 50).await?;
    let calendar = list_messages_by_type(db, user_id, &["daily_context"], 3).await?;
    let recent_messages = list_recent_messages(db, user_id, 80).await?;
    let prior_state_snapshots =
        list_messages_by_type(db, user_id, &[AFP_TYPE_STATE_SNAPSHOT], 1).await?;
    let persona_state_messages =
        list_messages_by_type(db, user_id, &[AFP_TYPE_PERSONA_STATE], 1).await?;
    let background_work_queue = db
        .list_personal_automation_conversations(user_id, None, Some("active"), Some(true), 12)
        .await
        .unwrap_or_default();
    let background_work_summary = summarize_background_work_queue(&background_work_queue);
    let response_queue_policy = load_response_queue_policy(db, user_id).await;
    let resolved_watcher_ids = resolved_watcher_message_ids(&watcher_resolutions);
    let unresolved_alerts = alerts
        .iter()
        .filter(|message| {
            !message["id"]
                .as_str()
                .is_some_and(|id| resolved_watcher_ids.contains(id))
        })
        .cloned()
        .collect::<Vec<_>>();
    let decision_queue_preview = build_decision_queue(&tasks, &decisions, &unresolved_alerts);
    let response_queue_preview = build_response_queue(&recent_messages, &response_queue_policy);
    let queue_pressure = normalise_queue_pressure(
        (decision_queue_preview.len()
            + response_queue_preview.len()
            + background_work_summary.total_count) as u32,
        20,
    );
    let (prepared_draft_generation_policy, field_engine_outcome_signals) =
        build_prepared_draft_generation_policy(db, user_id, Some(queue_pressure)).await?;

    let active_task_count = tasks
        .iter()
        .filter(|m| {
            m["content"]["status"]
                .as_str()
                .map(|s| s != "done" && s != "cancelled")
                .unwrap_or(true)
        })
        .count() as u32;

    let pending_decision_count = decisions
        .iter()
        .filter(|m| m["type"].as_str() == Some("decision_request"))
        .count() as u32;

    let unread_alert_count = unresolved_alerts.len() as u32;

    // Infer calendar pressure from most recent daily_context.
    let calendar_pressure = calendar
        .first()
        .and_then(|c| c["content"]["schedule_summary"].as_array())
        .map(|sched| {
            if sched.len() >= 6 {
                "heavy"
            } else if sched.len() >= 3 {
                "moderate"
            } else {
                "calm"
            }
        })
        .unwrap_or("calm");

    let headline = compose_headline_with_background(
        active_task_count,
        pending_decision_count,
        unread_alert_count,
        calendar_pressure,
        &background_work_summary,
    );

    let focus_items = compose_focus_items_with_background(
        active_task_count,
        pending_decision_count,
        unread_alert_count,
        calendar_pressure,
        &background_work_summary,
    );

    let para_counts = db
        .count_para_sections(user_id)
        .await
        .unwrap_or((0, 0, 0, 0));
    let para_overview = Some(ParaOverview {
        projects: para_counts.0 as u32,
        areas: para_counts.1 as u32,
        resources: para_counts.2 as u32,
        archive: para_counts.3 as u32,
        total: (para_counts.0 + para_counts.1 + para_counts.2 + para_counts.3) as u32,
    });

    let content = AfpStateSynthesisContent {
        synthesized_at: Utc::now().to_rfc3339(),
        active_task_count,
        pending_decision_count,
        unread_alert_count,
        calendar_pressure: calendar_pressure.to_string(),
        headline: headline.clone(),
        focus_items: focus_items.clone(),
        para_overview,
    };

    // Only write a durable state_synthesis record when the snapshot is actionable.
    // Routine summaries (nothing pending, calm calendar) remain ephemeral to keep
    // the message log clean.
    let notable = unread_alert_count > 0
        || pending_decision_count > 0
        || calendar_pressure == "heavy"
        || active_task_count > 5
        || background_work_summary.has_items();

    let id = Ulid::new().to_string();
    let mut afp = build_state_synthesis_afp(user_id, &id, &content);
    if notable {
        let proto = afp_json_to_proto_message(&afp);
        if let Err(err) = db
            .store_private_message(user_id, &proto, afp["content"].clone())
            .await
        {
            tracing::warn!(%err, %user_id, "synthesize_state: failed to persist state_synthesis AFP");
        } else if let Err(err) = db
            .prune_private_messages_to_recent_limit(
                user_id,
                AFP_TYPE_STATE_SYNTHESIS,
                "",
                STATE_SYNTHESIZER_AGENT,
                STATE_SYNTHESIS_RETENTION_LIMIT,
            )
            .await
        {
            tracing::warn!(
                %err,
                %user_id,
                "synthesize_state: failed to prune retained state_synthesis AFP history"
            );
        }
    } else {
        // Mark as ephemeral so callers know this was not persisted.
        afp["metadata"]["store"] = serde_json::Value::Bool(false);
        afp["metadata"]["ephemeral"] = serde_json::Value::Bool(true);
    }

    let snapshot_content = build_state_snapshot_content(
        &content,
        &tasks,
        &calendar,
        &decisions,
        &alerts,
        &recent_messages,
        &response_queue_policy,
        &prepared_draft_generation_policy,
        prior_snapshot_continuity_metrics(&prior_state_snapshots).as_ref(),
        Some(&field_engine_outcome_signals),
        Some(&background_work_summary),
    );
    let snapshot_view_id = format!("{SURFACE_HOMEPAGE}:state:{user_id}");
    let mut snapshot_afp = build_state_snapshot_afp(
        user_id,
        &format!("continuity:state:{}", user_id),
        &snapshot_view_id,
        &snapshot_content,
    );
    let mut synthesizer_handoff = build_synthesizer_handoff(
        snapshot_afp["id"].as_str().unwrap_or_default(),
        &snapshot_view_id,
        &snapshot_content,
        None,
    );
    let persona_state = latest_persona_state(&persona_state_messages);
    apply_empathy_context_to_handoff(
        &mut synthesizer_handoff,
        &snapshot_content,
        persona_state.as_ref(),
    );
    let mut field_engine_evaluation = evaluate_field_engine_snapshot(&snapshot_content);
    apply_outcome_signals_to_field_engine_metrics(
        &mut field_engine_evaluation.metrics,
        &field_engine_outcome_signals,
    );
    let field_engine_snapshot = field_engine_evaluation.snapshot.clone();
    let field_engine_summary = summarize_field_engine_snapshot(&field_engine_snapshot);
    apply_field_engine_projection_to_handoff(&mut synthesizer_handoff, &field_engine_snapshot);
    let simulation = simulate_snapshot_projection(
        snapshot_afp["id"].as_str().unwrap_or_default(),
        snapshot_content.clone(),
        Some(synthesizer_handoff.clone()),
    );
    let promotion_preview = materialize_simulator_promotions(
        user_id,
        snapshot_afp["thread_id"].as_str().unwrap_or_default(),
        snapshot_afp["id"].as_str(),
        &simulation.output.promotions,
    );
    apply_simulation_projection_to_handoff(&mut synthesizer_handoff, &simulation);
    let active_attention_window =
        build_active_attention_window_metadata(&snapshot_content, &recent_messages);
    let handoff_json = serde_json::to_value(&synthesizer_handoff).unwrap_or(Value::Null);
    snapshot_afp["metadata"]["synthesizer_handoff"] = handoff_json.clone();
    snapshot_afp["metadata"]["active_attention_window"] = active_attention_window.clone();
    snapshot_afp["metadata"]["field_engine_snapshot"] =
        serde_json::to_value(&field_engine_snapshot).unwrap_or(Value::Null);
    snapshot_afp["metadata"]["field_engine_metrics"] =
        serde_json::to_value(&field_engine_evaluation.metrics).unwrap_or(Value::Null);
    snapshot_afp["metadata"]["field_engine_summary"] =
        serde_json::to_value(&field_engine_summary).unwrap_or(Value::Null);
    snapshot_afp["metadata"]["simulator_trace_summary"] =
        serde_json::to_value(&simulation.output.trace_summary).unwrap_or(Value::Null);
    snapshot_afp["metadata"]["simulator_rollout_summary"] =
        serde_json::to_value(&simulation.output.rollout).unwrap_or(Value::Null);
    snapshot_afp["metadata"]["simulator_calibration_summary"] =
        serde_json::to_value(&simulation.output.calibration).unwrap_or(Value::Null);
    snapshot_afp["metadata"]["simulator_promotions"] =
        serde_json::to_value(&simulation.output.promotions).unwrap_or(Value::Null);
    snapshot_afp["metadata"]["simulator_prepared_context_preview"] =
        serde_json::to_value(&promotion_preview.prepared_context_packet).unwrap_or(Value::Null);
    snapshot_afp["metadata"]["simulator_prepared_draft_preview"] =
        serde_json::to_value(&promotion_preview.prepared_draft_packet).unwrap_or(Value::Null);
    snapshot_afp["metadata"]["simulator_reversible_action_preview"] =
        serde_json::to_value(&promotion_preview.reversible_action_bundle).unwrap_or(Value::Null);
    snapshot_afp["metadata"]["simulator_approval_review_preview"] = promotion_preview
        .approval_review
        .clone()
        .unwrap_or(Value::Null);
    if notable {
        let snapshot_proto = afp_json_to_proto_message(&snapshot_afp);
        if let Err(err) = db
            .store_private_snapshot_message(
                user_id,
                &snapshot_proto,
                snapshot_afp["content"].clone(),
            )
            .await
        {
            tracing::warn!(%err, %user_id, "synthesize_state: failed to persist state_snapshot AFP");
        } else if let Err(err) = db
            .prune_private_messages_to_recent_limit(
                user_id,
                AFP_TYPE_STATE_SNAPSHOT,
                crate::state_snapshot::AFP_SUBTYPE_STATE_SNAPSHOT,
                STATE_SYNTHESIZER_AGENT,
                STATE_SNAPSHOT_RETENTION_LIMIT,
            )
            .await
        {
            tracing::warn!(
                %err,
                %user_id,
                "synthesize_state: failed to prune retained state_snapshot AFP history"
            );
        }
    }

    afp["metadata"]["state_snapshot_ref"] = snapshot_afp["id"].clone();
    afp["metadata"]["state_snapshot_type"] = Value::String("state_snapshot".to_string());
    afp["metadata"]["state_snapshot_view_id"] = Value::String(snapshot_view_id);
    afp["metadata"]["synthesizer_handoff"] = handoff_json;
    afp["metadata"]["active_attention_window"] = active_attention_window;
    afp["metadata"]["field_engine_snapshot"] =
        serde_json::to_value(&field_engine_snapshot).unwrap_or(Value::Null);
    afp["metadata"]["field_engine_metrics"] =
        serde_json::to_value(&field_engine_evaluation.metrics).unwrap_or(Value::Null);
    afp["metadata"]["field_engine_summary"] =
        serde_json::to_value(&field_engine_summary).unwrap_or(Value::Null);
    afp["metadata"]["simulator_trace_summary"] =
        serde_json::to_value(&simulation.output.trace_summary).unwrap_or(Value::Null);
    afp["metadata"]["simulator_rollout_summary"] =
        serde_json::to_value(&simulation.output.rollout).unwrap_or(Value::Null);
    afp["metadata"]["simulator_calibration_summary"] =
        serde_json::to_value(&simulation.output.calibration).unwrap_or(Value::Null);
    afp["metadata"]["simulator_promotions"] =
        serde_json::to_value(&simulation.output.promotions).unwrap_or(Value::Null);
    afp["metadata"]["simulator_prepared_context_preview"] =
        serde_json::to_value(&promotion_preview.prepared_context_packet).unwrap_or(Value::Null);
    afp["metadata"]["simulator_prepared_draft_preview"] =
        serde_json::to_value(&promotion_preview.prepared_draft_packet).unwrap_or(Value::Null);
    afp["metadata"]["simulator_reversible_action_preview"] =
        serde_json::to_value(&promotion_preview.reversible_action_bundle).unwrap_or(Value::Null);
    afp["metadata"]["simulator_approval_review_preview"] =
        promotion_preview.approval_review.unwrap_or(Value::Null);
    Ok(afp)
}

/// Build the AFP JSON for a `state_synthesis` message.
pub fn build_state_synthesis_afp(
    user_id: &str,
    id: &str,
    content: &AfpStateSynthesisContent,
) -> Value {
    let pressure_tone = match content.calendar_pressure.as_str() {
        "heavy" => "warning",
        "moderate" => "strategy",
        _ => "success",
    };

    let mut msg = json!({
        "protocol": "afp-v1",
        "id": id,
        "thread_id": format!("continuity:state:{}", user_id),
        "from": "state_synthesizer",
        "to": [user_id],
        "timestamp": content.synthesized_at,
        "type": AFP_TYPE_STATE_SYNTHESIS,
        "content": {
            "synthesized_at": content.synthesized_at,
            "active_task_count": content.active_task_count,
            "pending_decision_count": content.pending_decision_count,
            "unread_alert_count": content.unread_alert_count,
            "calendar_pressure": content.calendar_pressure,
            "headline": content.headline,
            "focus_items": content.focus_items,
        },
        "views": [{
            "schema_version": "a2ui.v1",
            "kind": "stat_row",
            "props": {
                "tone": pressure_tone,
                "title": content.headline,
                "stats": [
                    { "label": "Active tasks", "value": content.active_task_count },
                    { "label": "Pending decisions", "value": content.pending_decision_count },
                    { "label": "Alerts", "value": content.unread_alert_count },
                    { "label": "Calendar", "value": content.calendar_pressure },
                ],
                "items": content.focus_items,
            },
        }],
        // store defaults true; synthesize_state() overrides to false for routine (non-notable) passes.
        "metadata": { "store": true, "continuity": true },
        "store_in_relational": true,
    });
    if let Some(para) = &content.para_overview {
        msg["content"]["para_overview"] = serde_json::to_value(para).unwrap_or(Value::Null);
    }
    msg
}

/// Build a standalone `state_synthesis` AFP message with `subtype: "para_overview"`.
/// Contains only PARA section counts — no task/decision/alert context.
/// Called by the PARA Navigator or State Synthesizer on demand (T-20).
pub fn build_para_overview_afp(user_id: &str, id: &str, para: &ParaOverview) -> Value {
    let synthesized_at = Utc::now().to_rfc3339();
    json!({
        "protocol": "afp-v1",
        "id": id,
        "thread_id": format!("continuity:state:{}", user_id),
        "from": "state_synthesizer",
        "to": [user_id],
        "timestamp": synthesized_at,
        "type": AFP_TYPE_STATE_SYNTHESIS,
        "subtype": AFP_SUBTYPE_PARA_OVERVIEW,
        "content": {
            "synthesized_at": synthesized_at,
            "para_overview": {
                "projects":  para.projects,
                "areas":     para.areas,
                "resources": para.resources,
                "archive":   para.archive,
                "total":     para.total,
            },
        },
        "views": [{
            "schema_version": "a2ui.v1",
            "kind": "stat_row",
            "props": {
                "title": "PARA Overview",
                "stats": [
                    { "label": "Projects",  "value": para.projects  },
                    { "label": "Areas",     "value": para.areas     },
                    { "label": "Resources", "value": para.resources },
                    { "label": "Archive",   "value": para.archive   },
                ],
            },
        }],
        "metadata": { "store": false, "ephemeral": true, "continuity": false },
        "store_in_relational": false,
    })
}

pub fn build_synthesis_invalidation_afp(
    user_id: &str,
    content: &AfpSynthesisInvalidationEventContent,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": format!("continuity:state:{}", user_id),
        "from": "state_synthesizer",
        "to": [user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_SYNTHESIS_INVALIDATION_EVENT,
        "subtype": format!("synthesis_invalidation:{}", content.invalidation_kind),
        "content": serde_json::to_value(content).unwrap_or(Value::Null),
        "metadata": {
            "store": true,
            "coordination_event": true,
            "searchable_metadata": {
                "invalidation_kind": content.invalidation_kind,
                "reason_message_id": content.reason_message_id,
                "reason_type": content.reason_type,
                "invalidated_snapshot_ref": content.invalidated_snapshot_ref,
                "invalidated_synthesis_ref": content.invalidated_synthesis_ref,
                "heuristic_id": content.heuristic_id,
                "watcher_category": content.category,
            },
        },
        "store_in_relational": true,
    })
}

/// Emit a `state_synthesis / para_overview` AFP message without persisting it.
/// Returns the JSON for the caller to forward to the requesting agent or surface.
pub async fn synthesize_para_overview(db: &Db, user_id: &str) -> Result<Value, sqlx::Error> {
    let counts = db.count_para_sections(user_id).await?;
    let para = ParaOverview {
        projects: counts.0 as u32,
        areas: counts.1 as u32,
        resources: counts.2 as u32,
        archive: counts.3 as u32,
        total: (counts.0 + counts.1 + counts.2) as u32,
    };
    let id = Ulid::new().to_string();
    Ok(build_para_overview_afp(user_id, &id, &para))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn compose_headline(tasks: u32, decisions: u32, alerts: u32, pressure: &str) -> String {
    if alerts > 0 && decisions > 0 {
        return format!(
            "{} alert{} and {} decision{} need your attention.",
            alerts,
            if alerts == 1 { "" } else { "s" },
            decisions,
            if decisions == 1 { "" } else { "s" }
        );
    }
    if pressure == "heavy" {
        return format!("Heavy schedule today — {} active tasks.", tasks);
    }
    if tasks == 0 && decisions == 0 && alerts == 0 {
        return "Everything looks clear — a good time to plan ahead.".to_string();
    }
    format!(
        "{} active task{}, calendar pressure is {}.",
        tasks,
        if tasks == 1 { "" } else { "s" },
        pressure
    )
}

fn compose_focus_items(tasks: u32, decisions: u32, alerts: u32, pressure: &str) -> Vec<String> {
    let mut items: Vec<String> = Vec::new();
    if alerts > 0 {
        items.push(format!(
            "Review {} pending watcher alert{}",
            alerts,
            if alerts == 1 { "" } else { "s" }
        ));
    }
    if decisions > 0 {
        items.push(format!(
            "Decide on {} outstanding request{}",
            decisions,
            if decisions == 1 { "" } else { "s" }
        ));
    }
    if tasks > 0 {
        items.push(format!(
            "Continue work on {} active task{}",
            tasks,
            if tasks == 1 { "" } else { "s" }
        ));
    }
    if pressure == "heavy" {
        items.push("Consider blocking focus time — calendar is busy today".to_string());
    }
    items
}

fn compose_headline_with_background(
    tasks: u32,
    decisions: u32,
    alerts: u32,
    pressure: &str,
    background_work: &BackgroundWorkQueueSummary,
) -> String {
    if alerts == 0
        && decisions == 0
        && background_work.approval_count > 0
        && background_work.total_count > 0
    {
        return format!(
            "{} approval-ready background work item{} need review.",
            background_work.approval_count,
            if background_work.approval_count == 1 {
                ""
            } else {
                "s"
            }
        );
    }
    if alerts == 0 && decisions == 0 && background_work.has_items() {
        return format!(
            "{} {} queued for review.",
            background_work.total_count,
            background_work.dominant_family_label()
        );
    }
    compose_headline(tasks, decisions, alerts, pressure)
}

fn compose_focus_items_with_background(
    tasks: u32,
    decisions: u32,
    alerts: u32,
    pressure: &str,
    background_work: &BackgroundWorkQueueSummary,
) -> Vec<String> {
    let mut items = compose_focus_items(tasks, decisions, alerts, pressure);
    if background_work.approval_count > 0 {
        items.push(format!(
            "Review {} approval-required background work item{}",
            background_work.approval_count,
            if background_work.approval_count == 1 {
                ""
            } else {
                "s"
            }
        ));
    } else if background_work.prepared_review_count > 0 {
        items.push(format!(
            "Review {} prepared {} item{}",
            background_work.prepared_review_count,
            background_work.dominant_family_label(),
            if background_work.prepared_review_count == 1 {
                ""
            } else {
                "s"
            }
        ));
    } else if background_work.follow_up_count > 0 {
        items.push(format!(
            "Triage {} queued {} item{}",
            background_work.follow_up_count,
            background_work.dominant_family_label(),
            if background_work.follow_up_count == 1 {
                ""
            } else {
                "s"
            }
        ));
    }
    items
}

fn summarize_background_work_queue(
    records: &[crate::db::PersonalAutomationConversationRecord],
) -> BackgroundWorkQueueSummary {
    let mut summary = BackgroundWorkQueueSummary::default();
    let mut evidence_refs = Vec::new();

    for record in records {
        summary.total_count += 1;
        match record.conversation_family.trim() {
            "communications" => summary.communication_count += 1,
            "renewals" => summary.renewal_count += 1,
            "bills" => summary.bill_count += 1,
            "forms" => summary.form_count += 1,
            _ => {}
        }
        match record
            .metadata_json
            .get("latest_attention_kind")
            .and_then(Value::as_str)
            .unwrap_or("background_follow_up")
        {
            "approval_request" => summary.approval_count += 1,
            "prepared_draft" => summary.prepared_review_count += 1,
            _ => summary.follow_up_count += 1,
        }
        if let Some(message_ref) = record.latest_message_ref.as_ref() {
            if !message_ref.trim().is_empty() {
                evidence_refs.push(message_ref.clone());
            }
        }
        for key in ["source_event_id", "latest_artifact_id"] {
            if let Some(reference) = record.metadata_json.get(key).and_then(Value::as_str) {
                let trimmed = reference.trim();
                if !trimmed.is_empty() {
                    evidence_refs.push(trimmed.to_string());
                }
            }
        }
    }

    evidence_refs.sort();
    evidence_refs.dedup();
    summary.evidence_refs = evidence_refs;
    summary
}

fn build_state_snapshot_content(
    synthesis: &AfpStateSynthesisContent,
    tasks: &[Value],
    calendar: &[Value],
    decisions: &[Value],
    alerts: &[Value],
    recent_messages: &[Value],
    response_queue_policy: &ResponseQueuePolicy,
    prepared_draft_generation_policy: &PreparedDraftGenerationPolicy,
    prior_continuity_metrics: Option<&StateSnapshotContinuityMetrics>,
    field_engine_outcome_signals: Option<&FieldEngineOutcomeSignals>,
    background_work_summary: Option<&BackgroundWorkQueueSummary>,
) -> StateSnapshotContent {
    let decision_queue = build_decision_queue(tasks, decisions, alerts);
    let response_queue = build_response_queue(recent_messages, response_queue_policy);
    let open_loop_summary = summarize_open_loop_coordination(recent_messages);
    let active_commitments = build_active_commitments(tasks, calendar);
    let critical_changes = build_critical_changes(calendar, alerts);
    let sources =
        collect_snapshot_sources(tasks, calendar, decisions, alerts, background_work_summary);
    let topology_bundle = build_neighborhood_bundle(&sources, recent_messages, 2, 4);
    let watcher_signals = build_watcher_signal_packets(recent_messages, &synthesis.synthesized_at);
    let continuity_metrics = continuity_metrics_for_snapshot(
        &watcher_signals,
        &decision_queue,
        &response_queue,
        &context_panel_items_from_bundle(&topology_bundle),
        prior_continuity_metrics,
    );
    let context_panel_items = context_panel_items_from_bundle(&topology_bundle);
    let prepared_context_packet = build_prepared_context_packet(
        &sources,
        &topology_bundle,
        &context_panel_items,
        &decision_queue,
        &response_queue,
        recent_messages,
    );
    let prepared_draft_packet = build_prepared_draft_packet(
        Some(prepared_draft_generation_policy),
        Some(&prepared_context_packet),
        &decision_queue,
        &response_queue,
        &active_commitments,
        &context_panel_items,
        recent_messages,
    );
    let mut suggested_actions = synthesis.focus_items.clone();
    if suggested_actions.is_empty() {
        suggested_actions.push(synthesis.headline.clone());
    }
    let mut confidence_notes = vec![
        "Heuristic synthesis from current message metadata".to_string(),
        format!(
            "Calendar pressure assessed as {}",
            synthesis.calendar_pressure
        ),
    ];
    if topology_bundle.result_budget_used > 0 {
        confidence_notes.push(topology_bundle.coverage_summary.clone());
    }
    if let Some(background_work) = background_work_summary.filter(|summary| summary.has_items()) {
        confidence_notes.push(format!(
            "Background work queue surfaced {} item(s): {} approval, {} prepared review, {} follow-up.",
            background_work.total_count,
            background_work.approval_count,
            background_work.prepared_review_count,
            background_work.follow_up_count
        ));
    }
    if continuity_metrics.recent_signal_count > 0 {
        confidence_notes.push(format!(
            "Watcher stream surfaced {} recent signal(s), {} fresh, {} deadline-oriented.",
            continuity_metrics.recent_signal_count,
            continuity_metrics.fresh_signal_count,
            continuity_metrics.deadline_signal_count
        ));
    }
    let suppressed_signal_count = watcher_signals
        .iter()
        .filter(|signal| signal.suppression_status == "suppressed")
        .count();
    if suppressed_signal_count > 0 {
        confidence_notes.push(format!(
            "{} watcher signal(s) remained visible for auditability but were excluded from active pressure because suppression is currently in effect.",
            suppressed_signal_count
        ));
    }
    let decrypt_needed_signal_count = watcher_signals
        .iter()
        .filter(|signal| signal.decrypt_needed)
        .count();
    if decrypt_needed_signal_count > 0 {
        confidence_notes.push(format!(
            "{} watcher signal(s) still need decryption before full context can be reviewed.",
            decrypt_needed_signal_count
        ));
    }
    let escalated_signal_count = watcher_signals
        .iter()
        .filter(|signal| signal.escalation_status == "required")
        .count();
    if escalated_signal_count > 0 {
        confidence_notes.push(format!(
            "{} watcher signal(s) remain on the active escalation path because they are still time-sensitive.",
            escalated_signal_count
        ));
    }
    if continuity_metrics.burst_signal_count > 1 {
        confidence_notes.push(format!(
            "Recent signal burst detected across {} high-activity item(s).",
            continuity_metrics.burst_signal_count
        ));
    }
    if continuity_metrics.reactivation_signal_count > 0 {
        confidence_notes.push(format!(
            "{} reactivation-oriented signal(s) surfaced from dormant threads or follow-ups.",
            continuity_metrics.reactivation_signal_count
        ));
    }
    if continuity_metrics.unresolved_queue_pressure >= 0.6 {
        confidence_notes.push(format!(
            "Unresolved queue pressure is elevated ({:.2}) across decision and response queues.",
            continuity_metrics.unresolved_queue_pressure
        ));
    }
    if continuity_metrics.urgency_acceleration >= 0.6 {
        confidence_notes.push(format!(
            "Urgency acceleration is elevated ({:.2}) due to fresh deadline-oriented signals.",
            continuity_metrics.urgency_acceleration
        ));
    }
    if continuity_metrics.context_switch_rate >= 0.5 {
        confidence_notes.push(format!(
            "Context switching appears elevated ({:.2}) across recent watcher categories and threads.",
            continuity_metrics.context_switch_rate
        ));
    }
    if open_loop_summary.awaiting_reply_count > 0 || open_loop_summary.due_soon_count > 0 {
        confidence_notes.push(format!(
            "Open loops surfaced {} awaiting-reply item(s) and {} due-soon follow-up anchor(s) from recent AFP metadata.",
            open_loop_summary.awaiting_reply_count,
            open_loop_summary.due_soon_count
        ));
    }
    if prior_continuity_metrics.is_some() {
        confidence_notes.push(
            "Continuity metrics were smoothed against the prior state snapshot to reduce one-tick volatility."
                .to_string(),
        );
    }
    let mut state_fields = build_state_fields(
        &decision_queue,
        &response_queue,
        &active_commitments,
        &critical_changes,
        &context_panel_items,
        &watcher_signals,
        &continuity_metrics,
        Some(&prepared_context_packet),
        Some(&prepared_draft_packet),
    );
    apply_open_loop_coordination_to_state_fields(&mut state_fields, &open_loop_summary);
    if let Some(background_work) = background_work_summary {
        apply_background_work_coordination_to_state_fields(&mut state_fields, background_work);
    }
    let provisional_snapshot = StateSnapshotContent {
        snapshot_kind: "homepage_briefing".to_string(),
        time_window: "today".to_string(),
        sources: sources.clone(),
        decision_queue: decision_queue.clone(),
        response_queue: response_queue.clone(),
        active_commitments: active_commitments.clone(),
        critical_changes: critical_changes.clone(),
        context_panel_items: context_panel_items.clone(),
        watcher_signals: watcher_signals.clone(),
        continuity_metrics: continuity_metrics.clone(),
        suggested_actions: suggested_actions.clone(),
        confidence_notes: confidence_notes.clone(),
        state_fields: state_fields.clone(),
        prepared_context_packet: Some(prepared_context_packet.clone()),
        prepared_draft_packet: Some(prepared_draft_packet.clone()),
        staleness_at: synthesis.synthesized_at.clone(),
    };
    let mut field_engine_evaluation = evaluate_field_engine_snapshot(&provisional_snapshot);
    if let Some(signals) = field_engine_outcome_signals {
        apply_outcome_signals_to_field_engine_metrics(
            &mut field_engine_evaluation.metrics,
            signals,
        );
    }
    let field_engine_snapshot = field_engine_evaluation.snapshot.clone();
    apply_field_engine_advisory_to_state_fields(&mut state_fields, &field_engine_snapshot);
    if let Some(field_summary) = summarize_field_engine_snapshot(&field_engine_snapshot) {
        confidence_notes.push(field_summary.summary);
        if let Some(risk) = field_summary.risks.first() {
            confidence_notes.push(risk.clone());
        }
    }
    if let Some(note) = field_engine_evaluation.metrics.calibration_notes.first() {
        confidence_notes.push(note.clone());
    }
    for note in field_engine_metric_notes(&field_engine_evaluation.metrics) {
        confidence_notes.push(note);
    }

    StateSnapshotContent {
        snapshot_kind: "homepage_briefing".to_string(),
        time_window: "today".to_string(),
        sources,
        decision_queue,
        response_queue,
        active_commitments,
        critical_changes,
        context_panel_items,
        watcher_signals,
        continuity_metrics,
        suggested_actions,
        confidence_notes,
        state_fields,
        prepared_context_packet: Some(prepared_context_packet),
        prepared_draft_packet: Some(prepared_draft_packet),
        staleness_at: synthesis.synthesized_at.clone(),
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct OpenLoopCoordinationSummary {
    open_loop_refs: Vec<String>,
    relationship_open_loop_refs: Vec<String>,
    due_soon_count: usize,
    awaiting_reply_count: usize,
}

fn summarize_open_loop_coordination(recent_messages: &[Value]) -> OpenLoopCoordinationSummary {
    let mut summary = OpenLoopCoordinationSummary::default();
    for message in recent_messages {
        let message_id = match message["id"].as_str() {
            Some(id) if !id.is_empty() => id.to_string(),
            _ => continue,
        };
        let Some(status) = open_loop_status(message) else {
            continue;
        };
        if !matches!(
            status.as_str(),
            "open" | "pending" | "awaiting_reply" | "needs_reply"
        ) {
            continue;
        }
        summary.awaiting_reply_count +=
            usize::from(matches!(status.as_str(), "awaiting_reply" | "needs_reply"));
        if let Some(follow_up_at) = open_loop_follow_up_at(message) {
            if is_due_soon_follow_up_hint(&follow_up_at) {
                summary.due_soon_count += 1;
            }
        }
        summary.open_loop_refs.push(message_id.clone());
        if open_loop_relationship_id(message).is_some() {
            summary.relationship_open_loop_refs.push(message_id);
        }
    }
    summary.open_loop_refs.sort();
    summary.open_loop_refs.dedup();
    summary.relationship_open_loop_refs.sort();
    summary.relationship_open_loop_refs.dedup();
    summary
}

fn apply_open_loop_coordination_to_state_fields(
    state_fields: &mut [StateFieldActivation],
    open_loop_summary: &OpenLoopCoordinationSummary,
) {
    if let Some(field) = state_fields
        .iter_mut()
        .find(|field| field.field_key == STATE_FIELD_FOLLOW_UP_PRESSURE)
    {
        apply_open_loop_follow_up_field(field, open_loop_summary);
    }
    if let Some(field) = state_fields
        .iter_mut()
        .find(|field| field.field_key == STATE_FIELD_RELATIONSHIP_FOLLOW_UP)
    {
        apply_open_loop_relationship_field(field, open_loop_summary);
    }
}

fn apply_background_work_coordination_to_state_fields(
    state_fields: &mut [StateFieldActivation],
    background_work: &BackgroundWorkQueueSummary,
) {
    if background_work.approval_count > 0 {
        if let Some(field) = state_fields
            .iter_mut()
            .find(|field| field.field_key == STATE_FIELD_APPROVAL_REQUIRED_WORK)
        {
            apply_background_work_approval_field(field, background_work);
        }
    }
    if background_work.prepared_review_count > 0 || background_work.follow_up_count > 0 {
        if let Some(field) = state_fields
            .iter_mut()
            .find(|field| field.field_key == STATE_FIELD_FOLLOW_UP_PRESSURE)
        {
            apply_background_work_follow_up_field(field, background_work);
        }
    }
}

fn apply_background_work_approval_field(
    field: &mut StateFieldActivation,
    background_work: &BackgroundWorkQueueSummary,
) {
    merge_evidence_refs(&mut field.evidence_refs, &background_work.evidence_refs);
    if field.status == "inactive" {
        field.status = "active".to_string();
        field.confidence = "medium".to_string();
        field.surface_hint = background_work.preferred_surface_hint().to_string();
        field.recommended_action = "Review approval-ready background work.".to_string();
        field.autonomy_level = "request_approval".to_string();
        field.reason = format!(
            "PersonalOS background work still carries {} approval-required item(s).",
            background_work.approval_count
        );
    } else if !field.reason.contains("approval-required item") {
        field.reason = format!(
            "{} PersonalOS background work still carries {} approval-required item(s).",
            field.reason.trim_end_matches('.'),
            background_work.approval_count
        );
    }
}

fn apply_background_work_follow_up_field(
    field: &mut StateFieldActivation,
    background_work: &BackgroundWorkQueueSummary,
) {
    merge_evidence_refs(&mut field.evidence_refs, &background_work.evidence_refs);
    let status = if background_work.follow_up_count > 0 || background_work.total_count >= 3 {
        "active"
    } else {
        "monitor"
    };
    let confidence = if status == "active" { "medium" } else { "low" };
    let reason = if background_work.follow_up_count > 0 {
        format!(
            "Background personalOS follow-up work remains queued across {} item(s), including {} direct follow-up item(s).",
            background_work.total_count, background_work.follow_up_count
        )
    } else {
        format!(
            "Background personalOS work is already queued across {} item(s), including {} prepared review item(s).",
            background_work.total_count, background_work.prepared_review_count
        )
    };
    if field.status == "inactive" {
        field.status = status.to_string();
        field.confidence = confidence.to_string();
        field.surface_hint = background_work.preferred_surface_hint().to_string();
        field.recommended_action =
            format!("Review queued {}.", background_work.dominant_family_label());
        field.autonomy_level = "suggest_with_artifact".to_string();
        field.reason = reason;
    } else if !field.reason.contains("Background personalOS") {
        field.reason = format!("{} {}", field.reason.trim_end_matches('.'), reason);
    }
}

fn apply_open_loop_follow_up_field(
    field: &mut StateFieldActivation,
    open_loop_summary: &OpenLoopCoordinationSummary,
) {
    if open_loop_summary.open_loop_refs.is_empty() {
        return;
    }
    merge_evidence_refs(&mut field.evidence_refs, &open_loop_summary.open_loop_refs);
    if field.status == "inactive" {
        field.status = "monitor".to_string();
        field.confidence = "low".to_string();
        field.reason = if open_loop_summary.due_soon_count > 0 {
            format!(
                "Recent AFP metadata still shows {} open follow-up loop(s), including {} due-soon anchor(s).",
                open_loop_summary.open_loop_refs.len(),
                open_loop_summary.due_soon_count
            )
        } else if open_loop_summary.awaiting_reply_count > 0 {
            format!(
                "Recent AFP metadata still shows {} awaiting-reply loop(s) that should not disappear from coordination view.",
                open_loop_summary.awaiting_reply_count
            )
        } else {
            format!(
                "Recent AFP metadata still shows {} open follow-up loop(s).",
                open_loop_summary.open_loop_refs.len()
            )
        };
    } else if !field.reason.contains("open follow-up loop")
        && !field.reason.contains("awaiting-reply")
    {
        field.reason = format!(
            "{} Durable open-loop AFP evidence remains visible across {} recent item(s).",
            field.reason.trim_end_matches('.'),
            open_loop_summary.open_loop_refs.len()
        );
    }
}

fn apply_open_loop_relationship_field(
    field: &mut StateFieldActivation,
    open_loop_summary: &OpenLoopCoordinationSummary,
) {
    if open_loop_summary.relationship_open_loop_refs.is_empty() {
        return;
    }
    merge_evidence_refs(
        &mut field.evidence_refs,
        &open_loop_summary.relationship_open_loop_refs,
    );
    if field.status == "inactive" {
        field.status = "monitor".to_string();
        field.confidence = "low".to_string();
        field.reason = format!(
            "Recent AFP metadata still shows {} relationship-linked open loop(s).",
            open_loop_summary.relationship_open_loop_refs.len()
        );
    } else if !field.reason.contains("relationship-linked open loop") {
        field.reason = format!(
            "{} Durable relationship-linked open-loop evidence remains visible.",
            field.reason.trim_end_matches('.')
        );
    }
}

fn merge_evidence_refs(into: &mut Vec<String>, refs: &[String]) {
    into.extend(refs.iter().cloned());
    into.sort();
    into.dedup();
}

fn open_loop_status(message: &Value) -> Option<String> {
    value_string_at_path(message, &["metadata", "searchable_metadata", "status"])
        .or_else(|| value_string_at_path(message, &["metadata", "status"]))
        .or_else(|| value_string_at_path(message, &["content", "status"]))
        .map(|status| status.to_ascii_lowercase())
}

fn open_loop_follow_up_at(message: &Value) -> Option<String> {
    value_string_at_path(
        message,
        &["metadata", "searchable_metadata", "follow_up_at"],
    )
    .or_else(|| value_string_at_path(message, &["metadata", "follow_up_at"]))
    .or_else(|| value_string_at_path(message, &["content", "follow_up_at"]))
}

fn open_loop_relationship_id(message: &Value) -> Option<String> {
    value_string_at_path(
        message,
        &["metadata", "searchable_metadata", "relationship_id"],
    )
    .or_else(|| value_string_at_path(message, &["metadata", "relationship_id"]))
    .or_else(|| value_string_at_path(message, &["content", "relationship_id"]))
}

fn value_string_at_path(message: &Value, path: &[&str]) -> Option<String> {
    let mut current = message;
    for segment in path {
        current = current.get(*segment)?;
    }
    current.as_str().map(str::to_string)
}

fn is_due_soon_follow_up_hint(value: &str) -> bool {
    let value = value.to_ascii_lowercase();
    ["today", "tomorrow", "tonight", "this week", "next day"]
        .iter()
        .any(|hint| value.contains(hint))
}

fn build_active_attention_window_metadata(
    snapshot: &StateSnapshotContent,
    recent_messages: &[Value],
) -> Value {
    let source_refs = bounded_unique_strings(
        snapshot
            .sources
            .iter()
            .cloned()
            .chain(
                snapshot
                    .decision_queue
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .response_queue
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .context_panel_items
                    .iter()
                    .flat_map(|item| item.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .watcher_signals
                    .iter()
                    .flat_map(|signal| signal.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .prepared_context_packet
                    .iter()
                    .flat_map(|packet| packet.source_refs.iter().cloned()),
            )
            .chain(
                snapshot
                    .prepared_draft_packet
                    .iter()
                    .flat_map(|packet| packet.drafts.iter())
                    .flat_map(|draft| draft.source_refs.iter().cloned()),
            ),
        8,
    );
    let source_ref_set = source_refs.iter().cloned().collect::<HashSet<_>>();
    let object_refs = bounded_unique_strings(
        snapshot
            .prepared_context_packet
            .iter()
            .flat_map(|packet| packet.object_refs.iter().cloned())
            .chain(
                snapshot
                    .prepared_draft_packet
                    .iter()
                    .flat_map(|packet| packet.drafts.iter())
                    .flat_map(|draft| draft.object_refs.iter().cloned()),
            )
            .chain(
                recent_messages
                    .iter()
                    .filter(|message| {
                        message["id"]
                            .as_str()
                            .is_some_and(|id| source_ref_set.contains(id))
                    })
                    .flat_map(message_object_refs),
            ),
        6,
    );
    let thread_refs = bounded_unique_strings(
        source_refs
            .iter()
            .filter(|value| value.starts_with("thread:"))
            .cloned()
            .chain(recent_messages.iter().filter_map(|message| {
                let message_id = message["id"].as_str()?;
                if !source_ref_set.contains(message_id) {
                    return None;
                }
                message["thread_id"].as_str().map(str::to_string)
            })),
        6,
    );
    let file_refs = bounded_unique_strings(
        snapshot
            .prepared_context_packet
            .iter()
            .flat_map(|packet| packet.file_refs.iter().cloned())
            .chain(
                recent_messages
                    .iter()
                    .filter(|message| {
                        message["id"]
                            .as_str()
                            .is_some_and(|id| source_ref_set.contains(id))
                    })
                    .flat_map(message_file_path_refs),
            ),
        6,
    );
    let relation_families = bounded_unique_strings(
        snapshot
            .context_panel_items
            .iter()
            .flat_map(|item| item.relation_path.iter().cloned()),
        8,
    );
    let supertags = bounded_unique_strings(
        recent_messages
            .iter()
            .filter(|message| {
                message["id"]
                    .as_str()
                    .is_some_and(|id| source_ref_set.contains(id))
            })
            .flat_map(|message| {
                message["supertags"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            }),
        8,
    );
    let memory_spaces = bounded_unique_strings(
        snapshot
            .prepared_draft_packet
            .iter()
            .flat_map(|packet| packet.drafts.iter())
            .filter_map(|draft| draft.memory_space.clone())
            .chain(recent_messages.iter().filter_map(|message| {
                let message_id = message["id"].as_str()?;
                if !source_ref_set.contains(message_id) {
                    return None;
                }
                value_string_at_path(
                    message,
                    &["metadata", "searchable_metadata", "memory_space"],
                )
                .or_else(|| value_string_at_path(message, &["metadata", "memory_space"]))
                .or_else(|| value_string_at_path(message, &["content", "memory_space"]))
            })),
        6,
    );
    let propagation_labels = bounded_unique_strings(
        relation_families
            .iter()
            .map(|family| format!("relation:{family}"))
            .chain(
                source_refs
                    .first()
                    .into_iter()
                    .map(|_| "ref_family:source".to_string()),
            )
            .chain(
                object_refs
                    .first()
                    .into_iter()
                    .map(|_| "ref_family:object".to_string()),
            )
            .chain(
                thread_refs
                    .first()
                    .into_iter()
                    .map(|_| "ref_family:thread".to_string()),
            )
            .chain(
                file_refs
                    .first()
                    .into_iter()
                    .map(|_| "ref_family:file".to_string()),
            )
            .chain(
                memory_spaces
                    .iter()
                    .map(|space| format!("memory_space:{space}")),
            )
            .chain(supertags.iter().map(|tag| format!("supertag:{tag}"))),
        12,
    );
    let window_ref_count =
        source_refs.len() + object_refs.len() + thread_refs.len() + file_refs.len();

    json!({
        "source_refs": source_refs,
        "object_refs": object_refs,
        "thread_refs": thread_refs,
        "file_refs": file_refs,
        "memory_spaces": memory_spaces,
        "supertags": supertags,
        "relation_families": relation_families,
        "propagation_labels": propagation_labels,
        "window_ref_count": window_ref_count,
        "expires_in_seconds": 300
    })
}

fn bounded_unique_strings(values: impl IntoIterator<Item = String>, limit: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        let normalized = trimmed.to_string();
        if !seen.insert(normalized.clone()) {
            continue;
        }
        result.push(normalized);
        if result.len() >= limit {
            break;
        }
    }
    result
}

async fn build_prepared_draft_generation_policy(
    db: &Db,
    user_id: &str,
    queue_pressure: Option<f64>,
) -> Result<(PreparedDraftGenerationPolicy, FieldEngineOutcomeSignals), sqlx::Error> {
    let family_outcome_rates = db.heuristic_family_acceptance_rates(user_id).await?;
    let heuristic_ids = family_outcome_rates
        .iter()
        .filter_map(|rate| {
            rate.get("heuristic_id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect::<Vec<_>>();
    let ema_states = db
        .list_heuristic_ema_states(user_id, &heuristic_ids)
        .await?;
    let recent_rates = db.heuristic_acceptance_rates_recent(user_id, 14).await?;
    let undone_action_rate = db.recent_undone_action_rate(user_id, 40, 3).await?;
    let draft_usage_rate = db.recent_prepared_draft_usage_rate(user_id, 40, 3).await?;
    let topic_recurrence = recent_rates
        .iter()
        .filter_map(|rate| {
            let heuristic_id = rate.get("heuristic_id").and_then(Value::as_str)?;
            let total = rate
                .get("total")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .max(0) as u32;
            Some((
                heuristic_id.to_string(),
                normalise_topic_recurrence(total, 5),
            ))
        })
        .collect::<std::collections::HashMap<_, _>>();
    let feedback = summarize_family_outcome_rates_adapted_with_signal_overrides(
        &family_outcome_rates,
        &ema_states,
        queue_pressure,
        Some(&topic_recurrence),
        Some(undone_action_rate),
        Some(draft_usage_rate),
    );
    let reusable_family_count = feedback
        .iter()
        .filter(|item| matches!(item.status.as_str(), "trusted" | "reinforced"))
        .count() as u32;
    let cautious_family_count = feedback
        .iter()
        .filter(|item| {
            matches!(
                item.status.as_str(),
                "cautious" | "cooldown_recommended" | "suppressed"
            )
        })
        .count() as u32;
    let reuse_event_count = feedback
        .iter()
        .map(|item| item.accepted.max(0) as u32)
        .sum();
    let dismissed_event_count = feedback
        .iter()
        .map(|item| (item.total - item.accepted).max(0) as u32)
        .sum();
    Ok((
        feedback
            .into_iter()
            .filter(|item| item.scope == "family")
            .map(|item| {
                (
                    item.heuristic_id,
                    PreparedDraftGenerationFeedback {
                        status: item.status,
                        acceptance_rate: item.acceptance_rate,
                    },
                )
            })
            .collect(),
        FieldEngineOutcomeSignals {
            draft_usage_rate,
            undone_action_rate,
            reusable_family_count,
            cautious_family_count,
            reuse_event_count,
            dismissed_event_count,
        },
    ))
}

fn context_panel_items_from_bundle(
    topology_bundle: &crate::topology_retrieval::TopologyNeighborhoodBundle,
) -> Vec<StateSnapshotContextItem> {
    topology_bundle
        .items
        .iter()
        .map(|item| StateSnapshotContextItem {
            id: item.message_id.clone(),
            label: item.label.clone(),
            why_surfaced: item.why_surfaced.clone(),
            confidence: item.confidence.clone(),
            freshness: item.freshness.clone(),
            relation_path: item.relation_path.clone(),
            source_refs: item.source_refs.clone(),
            decrypt_needed: item.decrypt_needed,
        })
        .collect::<Vec<_>>()
}

fn build_watcher_signal_packets(
    messages: &[Value],
    synthesized_at: &str,
) -> Vec<StateSnapshotWatcherSignal> {
    let synthesized_at = chrono::DateTime::parse_from_rfc3339(synthesized_at).ok();
    let resolved_watcher_ids = resolved_watcher_message_ids(messages);
    let mut packets = messages
        .iter()
        .filter(|message| {
            matches!(
                message["type"].as_str(),
                Some("passive_event" | "watcher_alert" | "smart_suggestion")
            )
        })
        .filter(|message| {
            !message["id"]
                .as_str()
                .is_some_and(|id| resolved_watcher_ids.contains(id))
        })
        .filter_map(|message| watcher_signal_packet_from_message(message, synthesized_at.as_ref()))
        .collect::<Vec<_>>();
    packets.sort_by_key(|packet| freshness_rank(packet.freshness.as_str()));
    if packets.len() > 6 {
        packets.truncate(6);
    }
    packets
}

fn resolved_watcher_message_ids(messages: &[Value]) -> std::collections::HashSet<String> {
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

fn watcher_signal_packet_from_message(
    message: &Value,
    synthesized_at: Option<&chrono::DateTime<chrono::FixedOffset>>,
) -> Option<StateSnapshotWatcherSignal> {
    let source_type = message["type"].as_str()?.to_string();
    let source_subtype = message["subtype"].as_str().unwrap_or_default().to_string();
    let metadata = message.get("metadata").cloned().unwrap_or(Value::Null);
    let from = message["from"].as_str().unwrap_or_default();
    let relevance = score_metadata_relevance(&source_type, &source_subtype, from, &metadata);
    let message_id = message["id"].as_str().unwrap_or_default().to_string();
    let thread_id = message["thread_id"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let timestamp = message["timestamp"].as_str().unwrap_or_default();
    let freshness = watcher_signal_freshness(timestamp, synthesized_at);
    let category = normalized_signal_category(message);
    let urgency = watcher_signal_urgency(message);
    let confidence = if relevance.score >= 0.75 {
        "high"
    } else if relevance.score >= 0.5 {
        "medium"
    } else {
        "low"
    }
    .to_string();
    let suppression_status = watcher_signal_suppression_status(message);
    let suppression_reason = watcher_signal_suppression_reason(message, &source_type);
    let decrypt_needed = watcher_signal_decrypt_needed(message);
    let escalation_status =
        watcher_signal_escalation_status(&source_type, &urgency, &suppression_status);
    let escalation_reason =
        watcher_signal_escalation_reason(&source_type, &freshness, &urgency, &suppression_status);
    let urgency_hint = watcher_signal_urgency_hint(
        &freshness,
        &urgency,
        &suppression_status,
        &suppression_reason,
        &escalation_status,
        &escalation_reason,
    );

    Some(StateSnapshotWatcherSignal {
        id: if message_id.is_empty() {
            Ulid::new().to_string()
        } else {
            message_id.clone()
        },
        signal_key: relevance.primary_signal,
        category,
        freshness,
        urgency,
        confidence,
        urgency_hint,
        suppression_status,
        suppression_reason,
        escalation_status,
        escalation_reason,
        decrypt_needed,
        source_type,
        source_subtype,
        thread_id,
        source_refs: if message_id.is_empty() {
            Vec::new()
        } else {
            vec![message_id]
        },
    })
}

fn watcher_signal_freshness(
    timestamp: &str,
    synthesized_at: Option<&chrono::DateTime<chrono::FixedOffset>>,
) -> String {
    let Some(synthesized_at) = synthesized_at else {
        return "recent".to_string();
    };
    let Some(event_at) = chrono::DateTime::parse_from_rfc3339(timestamp).ok() else {
        return "recent".to_string();
    };
    let age_hours = synthesized_at
        .signed_duration_since(event_at)
        .num_minutes()
        .max(0) as f64
        / 60.0;
    if age_hours <= 2.0 {
        "fresh".to_string()
    } else if age_hours <= 24.0 {
        "recent".to_string()
    } else {
        "stale".to_string()
    }
}

fn freshness_rank(freshness: &str) -> u8 {
    match freshness {
        "fresh" => 0,
        "recent" => 1,
        _ => 2,
    }
}

fn watcher_signal_suppression_status(message: &Value) -> String {
    let metadata = message.get("metadata").unwrap_or(&Value::Null);
    let suppressed_until = metadata["emotional_decay"]["suppressed_until"]
        .as_str()
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok());
    if suppressed_until.is_some_and(|until| until > Utc::now().fixed_offset()) {
        return "suppressed".to_string();
    }

    let explanation = metadata["empathetic_explanation"]
        .as_str()
        .or_else(|| {
            message["views"]
                .get(0)
                .and_then(|view| view["props"]["empathetic_explanation"].as_str())
        })
        .unwrap_or_default()
        .to_lowercase();
    if explanation.contains("surfaced more carefully") {
        "cooldown".to_string()
    } else if explanation.contains("helpful before") {
        "trusted".to_string()
    } else {
        "active".to_string()
    }
}

fn watcher_signal_suppression_reason(message: &Value, source_type: &str) -> String {
    let metadata = message.get("metadata").unwrap_or(&Value::Null);
    metadata["empathetic_explanation"]
        .as_str()
        .or_else(|| {
            message["views"]
                .get(0)
                .and_then(|view| view["props"]["empathetic_explanation"].as_str())
        })
        .map(str::to_string)
        .unwrap_or_else(|| match source_type {
            "passive_event" => {
                "Recent passive event observed directly from source metadata.".to_string()
            }
            "watcher_alert" | "smart_suggestion" => {
                "Watcher surfaced this signal without an active suppression override.".to_string()
            }
            _ => "Signal surfaced from recent message metadata.".to_string(),
        })
}

fn watcher_signal_decrypt_needed(message: &Value) -> bool {
    message
        .get("metadata")
        .and_then(|metadata| metadata.get("decrypt_needed"))
        .and_then(Value::as_bool)
        .unwrap_or_else(|| {
            let encryption = message.get("encryption").unwrap_or(&Value::Null);
            !encryption.is_null()
        })
}

fn watcher_signal_urgency_hint(
    freshness: &str,
    urgency: &str,
    suppression_status: &str,
    suppression_reason: &str,
    escalation_status: &str,
    escalation_reason: &str,
) -> String {
    if matches!(suppression_status, "suppressed" | "cooldown") && !suppression_reason.is_empty() {
        return suppression_reason.to_string();
    }
    if matches!(escalation_status, "required" | "escalated") && !escalation_reason.is_empty() {
        return escalation_reason.to_string();
    }
    match (freshness, urgency) {
        ("fresh", "urgent") => "Fresh urgent signal is still active now.".to_string(),
        ("fresh", "today") => "Fresh signal still needs attention today.".to_string(),
        ("fresh", _) => "Fresh watcher signal is still active now.".to_string(),
        ("recent", "urgent" | "today") => {
            "Recent active signal still carries near-term pressure.".to_string()
        }
        ("stale", _) => "Signal remains visible, but its timing pressure is aging.".to_string(),
        _ => "Signal remains available as recent watcher context.".to_string(),
    }
}

fn watcher_signal_escalation_status(
    source_type: &str,
    urgency: &str,
    suppression_status: &str,
) -> String {
    if suppression_status == "suppressed" {
        return "deferred".to_string();
    }
    if matches!(urgency, "urgent" | "today") && source_type == "watcher_alert" {
        return "required".to_string();
    }
    if matches!(urgency, "urgent" | "today") {
        return "watch".to_string();
    }
    "quiet".to_string()
}

fn watcher_signal_escalation_reason(
    source_type: &str,
    freshness: &str,
    urgency: &str,
    suppression_status: &str,
) -> String {
    if suppression_status == "suppressed" {
        return "Suppression is currently active, so this signal remains audit-visible without contributing live escalation pressure.".to_string();
    }
    if matches!(urgency, "urgent" | "today") && source_type == "watcher_alert" {
        return "Active watcher alert is time-sensitive and should remain in the live escalation path.".to_string();
    }
    if matches!(urgency, "urgent" | "today") {
        return "Near-term watcher pressure remains active, but it does not currently justify an interruptive alert.".to_string();
    }
    if freshness == "stale" {
        return "Signal is still retained as background context, but its escalation pressure has decayed.".to_string();
    }
    "Signal remains available as low-pressure watcher context.".to_string()
}

fn normalized_signal_category(message: &Value) -> String {
    match message["type"].as_str().unwrap_or_default() {
        "watcher_alert" | "smart_suggestion" => message["content"]["category"]
            .as_str()
            .unwrap_or("watcher")
            .to_string(),
        "passive_event" => {
            let subtype = message["subtype"]
                .as_str()
                .unwrap_or_default()
                .to_lowercase();
            if subtype.contains("calendar")
                || subtype.contains("appointment")
                || subtype.contains("deadline")
            {
                "schedule".to_string()
            } else if subtype.contains("email") {
                "email".to_string()
            } else if subtype.contains("medication") || subtype.contains("weather") {
                "life_critical".to_string()
            } else {
                "generic".to_string()
            }
        }
        other => other.to_string(),
    }
}

fn watcher_signal_urgency(message: &Value) -> String {
    match message["type"].as_str().unwrap_or_default() {
        "watcher_alert" => message["content"]["severity"]
            .as_str()
            .unwrap_or("today")
            .to_string(),
        "smart_suggestion" => "soon".to_string(),
        "passive_event" => {
            let subtype = message["subtype"]
                .as_str()
                .unwrap_or_default()
                .to_lowercase();
            if subtype.contains("medication") || subtype.contains("weather_alert") {
                "urgent".to_string()
            } else if subtype.contains("deadline")
                || subtype.contains("appointment")
                || subtype.contains("starting_soon")
            {
                "today".to_string()
            } else {
                "soon".to_string()
            }
        }
        _ => "soon".to_string(),
    }
}

fn continuity_metrics_for_snapshot(
    watcher_signals: &[StateSnapshotWatcherSignal],
    decision_queue: &[StateSnapshotDecisionItem],
    response_queue: &[StateSnapshotResponseItem],
    context_panel_items: &[StateSnapshotContextItem],
    prior_continuity_metrics: Option<&StateSnapshotContinuityMetrics>,
) -> StateSnapshotContinuityMetrics {
    let actionable_watcher_signals = watcher_signals
        .iter()
        .filter(|signal| signal.suppression_status != "suppressed")
        .cloned()
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
    let queue_pressure_raw = decision_queue.len() as f64 * 1.0
        + response_queue.len() as f64 * 0.8
        + context_panel_items.len() as f64 * 0.35;
    let activity_velocity = normalize_score(
        0.55 * recent_signal_count + 0.45 * fresh_signals + burst_signal_count as f64 * 0.25,
        6.0,
    );
    let urgency_acceleration = normalize_score(
        urgent_signals + (fresh_signals * 0.8) + (burst_signal_count as f64 * 0.5),
        5.0,
    );
    let context_switch_rate = normalize_score(unique_categories + (unique_threads * 0.7), 6.0);
    let unresolved_queue_pressure = normalize_score(queue_pressure_raw, 7.5);
    let follow_up_drift_score = normalize_score(
        reactivation_signal_count_for_signals(&actionable_watcher_signals) as f64
            + response_queue.len() as f64 * 0.8
            + deadline_signal_count_for_signals(&actionable_watcher_signals) as f64 * 0.3,
        5.0,
    );

    let current = StateSnapshotContinuityMetrics {
        recent_signal_count: actionable_watcher_signals.len() as u32,
        fresh_signal_count,
        burst_signal_count,
        reactivation_signal_count: reactivation_signal_count_for_signals(
            &actionable_watcher_signals,
        ),
        deadline_signal_count: deadline_signal_count_for_signals(&actionable_watcher_signals),
        activity_velocity,
        urgency_acceleration,
        context_switch_rate,
        unresolved_queue_pressure,
        follow_up_drift_score,
    };

    smooth_continuity_metrics(current, prior_continuity_metrics)
}

fn prior_snapshot_continuity_metrics(
    snapshots: &[Value],
) -> Option<StateSnapshotContinuityMetrics> {
    snapshots
        .iter()
        .filter_map(|message| {
            serde_json::from_value::<StateSnapshotContent>(message["content"].clone()).ok()
        })
        .map(|snapshot| snapshot.continuity_metrics)
        .next()
}

fn latest_persona_state(messages: &[Value]) -> Option<AfpPersonaStateContent> {
    messages
        .iter()
        .filter_map(|message| {
            serde_json::from_value::<AfpPersonaStateContent>(message["content"].clone()).ok()
        })
        .next()
}

fn smooth_continuity_metrics(
    current: StateSnapshotContinuityMetrics,
    prior: Option<&StateSnapshotContinuityMetrics>,
) -> StateSnapshotContinuityMetrics {
    let Some(prior) = prior else {
        return current;
    };

    StateSnapshotContinuityMetrics {
        recent_signal_count: current.recent_signal_count,
        fresh_signal_count: current.fresh_signal_count,
        burst_signal_count: current.burst_signal_count,
        reactivation_signal_count: current.reactivation_signal_count,
        deadline_signal_count: current.deadline_signal_count,
        activity_velocity: smooth_continuity_metric(
            prior.activity_velocity,
            current.activity_velocity,
            0.42,
        ),
        urgency_acceleration: smooth_continuity_metric(
            prior.urgency_acceleration,
            current.urgency_acceleration,
            0.42,
        ),
        context_switch_rate: smooth_continuity_metric(
            prior.context_switch_rate,
            current.context_switch_rate,
            0.38,
        ),
        unresolved_queue_pressure: smooth_continuity_metric(
            prior.unresolved_queue_pressure,
            current.unresolved_queue_pressure,
            0.48,
        ),
        follow_up_drift_score: smooth_continuity_metric(
            prior.follow_up_drift_score,
            current.follow_up_drift_score,
            0.45,
        ),
    }
}

fn smooth_continuity_metric(previous: f64, current: f64, alpha: f64) -> f64 {
    let mut ema = EmaAccumulator::new(alpha, previous);
    ema.update(current).clamp(0.0, 1.0)
}

fn normalize_score(raw: f64, ceiling: f64) -> f64 {
    if ceiling <= 0.0 {
        return 0.0;
    }
    (raw / ceiling).clamp(0.0, 1.0)
}

fn reactivation_signal_count_for_signals(watcher_signals: &[StateSnapshotWatcherSignal]) -> u32 {
    watcher_signals
        .iter()
        .filter(|signal| {
            signal.source_subtype.contains("idle") || signal.source_subtype.contains("reactivat")
        })
        .count() as u32
}

fn deadline_signal_count_for_signals(watcher_signals: &[StateSnapshotWatcherSignal]) -> u32 {
    watcher_signals
        .iter()
        .filter(|signal| {
            signal.source_subtype.contains("deadline")
                || signal.source_subtype.contains("appointment")
                || signal.source_subtype.contains("starting_soon")
        })
        .count() as u32
}

fn build_decision_queue(
    tasks: &[Value],
    decisions: &[Value],
    alerts: &[Value],
) -> Vec<StateSnapshotDecisionItem> {
    let mut items = Vec::new();

    for decision in decisions
        .iter()
        .filter(|m| m["type"].as_str() == Some("decision_request"))
        .take(3)
    {
        let message_id = decision["id"].as_str().unwrap_or_default().to_string();
        items.push(StateSnapshotDecisionItem {
            id: if message_id.is_empty() {
                Ulid::new().to_string()
            } else {
                message_id.clone()
            },
            label: content_label(decision, "Decision requested"),
            category: "decision".to_string(),
            urgency: "today".to_string(),
            confidence: "medium".to_string(),
            source_refs: if message_id.is_empty() {
                Vec::new()
            } else {
                vec![message_id]
            },
            suggested_next_action: "Review and decide".to_string(),
            approval_required: true,
        });
    }

    for approval in decisions
        .iter()
        .filter(|m| {
            m["type"].as_str() == Some(MSG_AGENT_APPROVAL_REQUEST)
                || (m["type"].as_str() == Some(AGENT_TYPE)
                    && m["subtype"].as_str() == Some(AGENT_SUBTYPE_APPROVAL_REQUEST))
        })
        .take(2)
    {
        let message_id = approval["id"].as_str().unwrap_or_default().to_string();
        items.push(StateSnapshotDecisionItem {
            id: if message_id.is_empty() {
                Ulid::new().to_string()
            } else {
                format!("approval-{message_id}")
            },
            label: content_label(approval, "Approval requested"),
            category: "approval".to_string(),
            urgency: "today".to_string(),
            confidence: "medium".to_string(),
            source_refs: if message_id.is_empty() {
                Vec::new()
            } else {
                vec![message_id]
            },
            suggested_next_action: "Review approval request".to_string(),
            approval_required: true,
        });
    }

    for browser_task in decisions
        .iter()
        .filter(|m| {
            m["type"].as_str() == Some(AFP_TYPE_BROWSER_TASK_FAMILY)
                && m["subtype"].as_str() == Some(AFP_SUBTYPE_BROWSER_TASK_REQUEST_FAMILY)
        })
        .take(2)
    {
        let message_id = browser_task["id"].as_str().unwrap_or_default().to_string();
        let label = browser_task["content"]["goal"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| content_label(browser_task, "Browser action pending"));
        let approval_required = browser_task["content"]["step_approval_required"]
            .as_bool()
            .unwrap_or(false)
            || browser_task["content"]["required_permission"]
                .as_str()
                .map(|permission| permission != "navigation_read")
                .unwrap_or(false);
        items.push(StateSnapshotDecisionItem {
            id: if message_id.is_empty() {
                Ulid::new().to_string()
            } else {
                format!("browser-{message_id}")
            },
            label,
            category: "browser_action".to_string(),
            urgency: "today".to_string(),
            confidence: "medium".to_string(),
            source_refs: if message_id.is_empty() {
                Vec::new()
            } else {
                vec![message_id]
            },
            suggested_next_action: "Review browser action".to_string(),
            approval_required,
        });
    }

    for task in tasks.iter().filter(|task| is_promotable_task(task)).take(2) {
        let message_id = task["id"].as_str().unwrap_or_default().to_string();
        items.push(StateSnapshotDecisionItem {
            id: if message_id.is_empty() {
                Ulid::new().to_string()
            } else {
                format!("task-{message_id}")
            },
            label: content_label(task, "Active task"),
            category: task["content"]["task_type"]
                .as_str()
                .unwrap_or("task")
                .to_string(),
            urgency: task_urgency(task),
            confidence: "medium".to_string(),
            source_refs: if message_id.is_empty() {
                Vec::new()
            } else {
                vec![message_id]
            },
            suggested_next_action: "Continue or schedule".to_string(),
            approval_required: false,
        });
    }

    items.sort_by(|left, right| decision_rank(left).cmp(&decision_rank(right)));
    dedupe_decision_queue(&mut items, 5);

    if items.is_empty() && !alerts.is_empty() {
        items.push(StateSnapshotDecisionItem {
            id: format!("watcher-alerts-{}", alerts.len()),
            label: format!(
                "Review {} watcher alert{}",
                alerts.len(),
                if alerts.len() == 1 { "" } else { "s" }
            ),
            category: "watcher_alert".to_string(),
            urgency: "today".to_string(),
            confidence: "medium".to_string(),
            source_refs: alerts
                .iter()
                .filter_map(|m| m["id"].as_str().map(str::to_string))
                .collect(),
            suggested_next_action: "Check surfaced alerts".to_string(),
            approval_required: false,
        });
    }

    items
}

fn is_promotable_task(task: &Value) -> bool {
    let status = task["content"]["status"].as_str().unwrap_or("pending");
    if matches!(status, "done" | "cancelled" | "completed") {
        return false;
    }

    let priority = task["content"]["priority"].as_str().unwrap_or("normal");
    status == "pending"
        || status == "active"
        || crate::agent_template::TaskPriority::rank_value(priority) <= 1
}

fn task_urgency(task: &Value) -> String {
    let priority = task["content"]["priority"].as_str().unwrap_or("normal");
    match crate::agent_template::TaskPriority::rank_value(priority) {
        0 => "urgent".to_string(),
        1 => "today".to_string(),
        _ => "soon".to_string(),
    }
}

fn dedupe_decision_queue(items: &mut Vec<StateSnapshotDecisionItem>, limit: usize) {
    let mut seen = std::collections::HashSet::new();
    items.retain(|item| seen.insert(item.label.clone()));
    if items.len() > limit {
        items.truncate(limit);
    }
}

fn decision_rank(
    item: &StateSnapshotDecisionItem,
) -> (u8, u8, u8, std::cmp::Reverse<usize>, String) {
    let approval_rank = if item.approval_required { 0 } else { 1 };
    let category_rank = match item.category.as_str() {
        "approval" => 0,
        "browser_action" if item.approval_required => 1,
        "decision" => 2,
        "browser_action" => 3,
        "watcher_alert" => 5,
        _ => 4,
    };
    let urgency_rank = match item.urgency.as_str() {
        "urgent" => 0,
        "today" => 1,
        "high" => 2,
        "medium" => 3,
        _ => 4,
    };
    (
        approval_rank,
        category_rank,
        urgency_rank,
        std::cmp::Reverse(item.source_refs.len()),
        item.label.to_ascii_lowercase(),
    )
}

fn build_response_queue(
    messages: &[Value],
    response_queue_policy: &ResponseQueuePolicy,
) -> Vec<StateSnapshotResponseItem> {
    let mut items = messages
        .iter()
        .filter_map(|message| response_item_from_message(message, response_queue_policy))
        .collect::<Vec<_>>();

    items.sort_by_key(|item| response_rank(item));
    items.truncate(5);
    items
}

fn response_item_from_message(
    message: &Value,
    response_queue_policy: &ResponseQueuePolicy,
) -> Option<StateSnapshotResponseItem> {
    if !is_response_candidate(message) {
        return None;
    }

    let label = content_label(message, "Response requested");
    let context_text = response_text(message);
    let urgency = response_urgency(&context_text);
    let confidence = response_confidence(&context_text);
    let due_hint = response_due_hint(&context_text, &urgency, response_queue_policy);
    let channel = response_channel(message);
    let message_id = message["id"].as_str().unwrap_or_default().to_string();

    Some(StateSnapshotResponseItem {
        id: if message_id.is_empty() {
            Ulid::new().to_string()
        } else {
            message_id.clone()
        },
        label,
        channel,
        urgency,
        confidence,
        response_due_hint: due_hint,
        source_refs: if message_id.is_empty() {
            Vec::new()
        } else {
            vec![message_id]
        },
        suggested_next_action: "Draft or send reply".to_string(),
    })
}

fn is_response_candidate(message: &Value) -> bool {
    let message_type = message["type"]
        .as_str()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let subtype = message["subtype"]
        .as_str()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let metadata = message["metadata"].clone();
    let channel = metadata
        .get("channel")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let transport = metadata
        .get("transport")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let text = response_text(message);

    let conversational = message_type.contains("email")
        || message_type.contains("message")
        || message_type.contains("chat")
        || message_type.contains("reply")
        || subtype.contains("reply")
        || channel.contains("smtp")
        || channel.contains("gmail")
        || channel.contains("slack")
        || channel.contains("teams")
        || channel.contains("discord")
        || channel.contains("telegram")
        || channel.contains("whatsapp")
        || transport.contains("smtp")
        || transport.contains("gmail")
        || transport.contains("slack")
        || transport.contains("teams")
        || transport.contains("discord")
        || transport.contains("telegram")
        || transport.contains("whatsapp");

    if !conversational {
        return false;
    }

    let lower = text.to_ascii_lowercase();
    lower.contains("reply")
        || lower.contains("respond")
        || lower.contains("response")
        || lower.contains("let me know")
        || lower.contains("can you")
        || lower.contains("could you")
        || lower.contains("supplier")
        || lower.contains("deadline")
        || lower.contains("asap")
        || lower.contains("urgent")
}

fn response_text(message: &Value) -> String {
    [
        message["content"]["title"].as_str(),
        message["content"]["subject"].as_str(),
        message["content"]["summary"].as_str(),
        message["content"]["body"].as_str(),
        message["content"]["text"].as_str(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ")
}

fn response_channel(message: &Value) -> String {
    let message_type = message["type"]
        .as_str()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let metadata = message["metadata"].clone();
    let channel = metadata
        .get("channel")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();

    if message_type.contains("email") || channel.contains("smtp") || channel.contains("gmail") {
        "email".to_string()
    } else if channel.contains("slack") {
        "slack".to_string()
    } else if channel.contains("teams") {
        "teams".to_string()
    } else if channel.contains("discord") {
        "discord".to_string()
    } else if channel.contains("telegram") {
        "telegram".to_string()
    } else if channel.contains("whatsapp") {
        "whatsapp".to_string()
    } else if message_type.contains("chat") || message_type.contains("message") {
        "chat".to_string()
    } else {
        "conversation".to_string()
    }
}

fn response_urgency(text: &str) -> String {
    let lower = text.to_ascii_lowercase();
    if lower.contains("asap")
        || lower.contains("urgent")
        || lower.contains("today")
        || lower.contains("eod")
        || lower.contains("deadline")
    {
        "urgent".to_string()
    } else if lower.contains("tomorrow")
        || lower.contains("soon")
        || lower.contains("supplier")
        || lower.contains("follow up")
    {
        "today".to_string()
    } else {
        "normal".to_string()
    }
}

fn response_confidence(text: &str) -> String {
    let lower = text.to_ascii_lowercase();
    if lower.contains("reply")
        || lower.contains("respond")
        || lower.contains("response")
        || lower.contains("let me know")
    {
        "medium".to_string()
    } else {
        "low".to_string()
    }
}

fn response_due_hint(
    text: &str,
    urgency: &str,
    response_queue_policy: &ResponseQueuePolicy,
) -> String {
    let lower = text.to_ascii_lowercase();
    if lower.contains("eod") || lower.contains("today") {
        "Today".to_string()
    } else if lower.contains("tomorrow") {
        "Tomorrow".to_string()
    } else if urgency == "urgent" {
        "Within 4h".to_string()
    } else if urgency == "today" {
        "Within 24h".to_string()
    } else if lower.contains("supplier") || lower.contains("vendor") || lower.contains("quote") {
        format!("Within {}h", response_queue_policy.supplier_due_hours)
    } else if lower.contains("friend") || lower.contains("family") {
        format!("Within {}h", response_queue_policy.friend_due_hours)
    } else {
        format!("Within {}h", response_queue_policy.general_due_hours)
    }
}

async fn load_response_queue_policy(db: &Db, user_id: &str) -> ResponseQueuePolicy {
    db.get_agent_preferences(user_id)
        .await
        .ok()
        .flatten()
        .and_then(|prefs| {
            serde_json::from_value::<ResponseQueuePolicy>(
                prefs
                    .get("response_queue_policy")
                    .cloned()
                    .or_else(|| {
                        prefs
                            .get("email_notification_filters")
                            .and_then(|filters| filters.get("response_queue_policy"))
                            .cloned()
                    })
                    .unwrap_or(Value::Null),
            )
            .ok()
        })
        .unwrap_or_default()
}

fn response_due_rank(due_hint: &str) -> (u8, u16) {
    crate::timing_hints::due_hint_sort_key(due_hint)
}

fn response_rank(item: &StateSnapshotResponseItem) -> (u8, (u8, u16), u8, String) {
    let urgency_rank = match item.urgency.as_str() {
        "urgent" => 0,
        "today" => 1,
        _ => 2,
    };
    let due_rank = response_due_rank(&item.response_due_hint);
    let confidence_rank = match item.confidence.as_str() {
        "high" => 0,
        "medium" => 1,
        _ => 2,
    };
    (urgency_rank, due_rank, confidence_rank, item.label.clone())
}

fn build_active_commitments(tasks: &[Value], calendar: &[Value]) -> Vec<StateSnapshotCommitment> {
    let mut items = Vec::new();

    for task in tasks.iter().take(3) {
        let label = content_label(task, "Active task");
        items.push(StateSnapshotCommitment {
            label,
            time_horizon: "active".to_string(),
            source_refs: task["id"]
                .as_str()
                .map(|id| vec![id.to_string()])
                .unwrap_or_default(),
        });
    }

    if items.is_empty() {
        if let Some(schedule) = calendar
            .first()
            .and_then(|m| m["content"]["schedule_summary"].as_array())
        {
            items.push(StateSnapshotCommitment {
                label: format!(
                    "{} scheduled item{}",
                    schedule.len(),
                    if schedule.len() == 1 { "" } else { "s" }
                ),
                time_horizon: "today".to_string(),
                source_refs: calendar
                    .first()
                    .and_then(|m| m["id"].as_str())
                    .map(|id| vec![id.to_string()])
                    .unwrap_or_default(),
            });
        }
    }

    items
}

fn build_critical_changes(
    calendar: &[Value],
    alerts: &[Value],
) -> Vec<StateSnapshotCriticalChange> {
    let mut items = Vec::new();

    if let Some(schedule) = calendar
        .first()
        .and_then(|m| m["content"]["schedule_summary"].as_array())
    {
        if schedule.len() >= 6 {
            items.push(StateSnapshotCriticalChange {
                label: "Heavy calendar pressure detected".to_string(),
                delta_type: "calendar_pressure".to_string(),
                source_refs: calendar
                    .first()
                    .and_then(|m| m["id"].as_str())
                    .map(|id| vec![id.to_string()])
                    .unwrap_or_default(),
            });
        }
    }

    if !alerts.is_empty() {
        items.push(StateSnapshotCriticalChange {
            label: format!(
                "{} recent watcher alert{}",
                alerts.len(),
                if alerts.len() == 1 { "" } else { "s" }
            ),
            delta_type: "watcher_activity".to_string(),
            source_refs: alerts
                .iter()
                .filter_map(|m| m["id"].as_str().map(str::to_string))
                .collect(),
        });
    }

    items
}

fn collect_snapshot_sources(
    tasks: &[Value],
    calendar: &[Value],
    decisions: &[Value],
    alerts: &[Value],
    background_work_summary: Option<&BackgroundWorkQueueSummary>,
) -> Vec<String> {
    let mut sources = Vec::new();
    for message in tasks.iter().chain(calendar).chain(decisions).chain(alerts) {
        if let Some(id) = message["id"].as_str() {
            sources.push(id.to_string());
        }
    }
    if let Some(background_work) = background_work_summary {
        merge_evidence_refs(&mut sources, &background_work.evidence_refs);
    }
    sources
}

fn content_label(message: &Value, fallback: &str) -> String {
    for key in ["label", "title", "headline", "summary"] {
        if let Some(label) = message["content"][key].as_str() {
            if !label.trim().is_empty() {
                return label.to_string();
            }
        }
    }
    fallback.to_string()
}

async fn list_messages_by_type(
    db: &Db,
    user_id: &str,
    types: &[&str],
    limit: i64,
) -> Result<Vec<Value>, sqlx::Error> {
    let type_values: Vec<String> = types.iter().map(|t| (*t).to_string()).collect();
    let rows = sqlx::query(
        r#"
        SELECT id, type, content
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
        messages.push(json!({
            "id": row.try_get::<String, _>("id")?,
            "type": row.try_get::<String, _>("type")?,
            "content": row.try_get::<Value, _>("content")?,
        }));
    }
    Ok(messages)
}

async fn list_recent_messages(
    db: &Db,
    user_id: &str,
    limit: i64,
) -> Result<Vec<Value>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, thread_id, type, subtype, content, metadata, timestamp::text AS timestamp
        FROM messages
        WHERE (to_agents @> $1::jsonb OR from_agent = $2)
        ORDER BY timestamp DESC
        LIMIT $3
        "#,
    )
    .bind(serde_json::json!([user_id]))
    .bind(user_id)
    .bind(limit)
    .fetch_all(&db.pool)
    .await?;

    let mut messages = Vec::with_capacity(rows.len());
    for row in rows {
        messages.push(json!({
            "id": row.try_get::<String, _>("id")?,
            "thread_id": row.try_get::<String, _>("thread_id")?,
            "timestamp": row.try_get::<String, _>("timestamp")?,
            "type": row.try_get::<String, _>("type")?,
            "subtype": row.try_get::<Option<String>, _>("subtype")?.unwrap_or_default(),
            "content": row.try_get::<Value, _>("content")?,
            "metadata": row.try_get::<Option<Value>, _>("metadata")?.unwrap_or(Value::Null),
        }));
    }
    Ok(messages)
}

fn afp_json_to_proto_message(afp: &Value) -> ProtoMessage {
    ProtoMessage {
        protocol: afp["protocol"].as_str().unwrap_or("afp-v1").to_string(),
        id: afp["id"].as_str().unwrap_or_default().to_string(),
        thread_id: afp["thread_id"].as_str().unwrap_or_default().to_string(),
        parent_id: String::new(),
        from: afp["from"].as_str().unwrap_or_default().to_string(),
        to: afp["to"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
        timestamp: afp["timestamp"].as_str().unwrap_or_default().to_string(),
        r#type: afp["type"].as_str().unwrap_or_default().to_string(),
        kind: afp["kind"].as_str().map(str::to_string),
        supertags: afp["supertags"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        subtype: afp["subtype"].as_str().unwrap_or_default().to_string(),
        content: afp["content"].to_string(),
        metadata: afp["metadata"].to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: afp["views"].to_string(),
        references: "[]".to_string(),
        attachments: "[]".to_string(),
        store_in_relational: afp["store_in_relational"].as_bool().unwrap_or(true),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_state_snapshot_content_promotes_decisions_tasks_and_sources() {
        let synthesis = AfpStateSynthesisContent {
            synthesized_at: "2026-06-03T10:00:00Z".to_string(),
            active_task_count: 2,
            pending_decision_count: 3,
            unread_alert_count: 1,
            calendar_pressure: "moderate".to_string(),
            headline: "Multiple actions need your attention.".to_string(),
            focus_items: vec!["Review pending decision".to_string()],
            para_overview: None,
        };

        let tasks = vec![json!({
            "id": "task_1",
            "type": "task",
            "content": { "title": "Finish proposal", "status": "active", "priority": "high", "task_type": "general" }
        })];
        let decisions = vec![
            json!({
                "id": "decision_1",
                "type": "decision_request",
                "content": { "title": "Approve grocery order" }
            }),
            json!({
                "id": "approval_1",
                "type": MSG_AGENT_APPROVAL_REQUEST,
                "content": { "title": "Approve contract change" }
            }),
            json!({
                "id": "browser_1",
                "type": AFP_TYPE_BROWSER_TASK_FAMILY,
                "subtype": AFP_SUBTYPE_BROWSER_TASK_REQUEST_FAMILY,
                "content": {
                    "goal": "Apply coupon to grocery cart",
                    "required_permission": "navigation_form",
                    "step_approval_required": true
                }
            }),
        ];
        let alerts = vec![json!({
            "id": "alert_1",
            "type": "watcher_alert",
            "content": { "summary": "Refill reminder" }
        })];
        let calendar = vec![json!({
            "id": "calendar_1",
            "type": "daily_context",
            "content": { "schedule_summary": ["a", "b", "c"] }
        })];
        let recent_messages = vec![
            json!({
                "id": "task_1",
                "thread_id": "thread_shared",
                "timestamp": "2026-06-03T09:00:00Z",
                "type": "task",
                "subtype": "",
                "metadata": {},
                "content": { "title": "Finish proposal", "status": "active", "priority": "high", "task_type": "general" }
            }),
            json!({
                "id": "email_1",
                "thread_id": "thread_shared",
                "timestamp": "2026-06-03T08:00:00Z",
                "type": "email_thread",
                "subtype": "reply_needed",
                "metadata": { "channel": "gmail" },
                "content": {
                    "subject": "Supplier quote follow up",
                    "body": "Can you reply today with approval?"
                }
            }),
            json!({
                "id": "event_1",
                "thread_id": "thread_schedule",
                "timestamp": "2026-06-03T09:30:00Z",
                "type": "passive_event",
                "subtype": "appointment_approaching",
                "from": "calendar_ingest",
                "metadata": { "priority": "high" },
                "content": {}
            }),
            json!({
                "id": "event_2",
                "thread_id": "thread_schedule",
                "timestamp": "2026-06-03T09:45:00Z",
                "type": "passive_event",
                "subtype": "deadline_due_today",
                "from": "calendar_ingest",
                "metadata": { "priority": "high" },
                "content": {}
            }),
            json!({
                "id": "alert_recent",
                "thread_id": "watcher:user_01",
                "timestamp": "2026-06-03T09:50:00Z",
                "type": "watcher_alert",
                "subtype": "schedule",
                "from": "background_watcher",
                "metadata": { "watcher": true },
                "content": { "category": "schedule", "severity": "important" }
            }),
        ];

        let snapshot = build_state_snapshot_content(
            &synthesis,
            &tasks,
            &calendar,
            &decisions,
            &alerts,
            &recent_messages,
            &ResponseQueuePolicy::default(),
            &PreparedDraftGenerationPolicy::default(),
            None,
            None,
            None,
        );

        assert_eq!(snapshot.snapshot_kind, "homepage_briefing");
        assert_eq!(snapshot.decision_queue.len(), 4);
        assert!(snapshot.decision_queue[0].approval_required);
        assert!(
            matches!(
                snapshot.decision_queue[0].category.as_str(),
                "approval" | "browser_action" | "decision"
            ),
            "approval-relevant work should lead a crowded decision queue"
        );
        assert!(
            snapshot
                .decision_queue
                .iter()
                .any(|item| item.category == "approval" && item.approval_required)
        );
        assert!(
            snapshot
                .decision_queue
                .iter()
                .any(|item| item.category == "browser_action" && item.approval_required)
        );
        assert!(
            snapshot
                .decision_queue
                .iter()
                .any(|item| item.label == "Finish proposal")
        );
        assert!(snapshot.sources.iter().any(|id| id == "decision_1"));
        assert!(
            snapshot
                .active_commitments
                .iter()
                .any(|c| c.label == "Finish proposal")
        );
        assert!(
            snapshot
                .confidence_notes
                .iter()
                .any(|note| note.contains("Surfaced"))
        );
        assert!(
            snapshot
                .context_panel_items
                .iter()
                .any(|item| item.id == "email_1")
        );
        assert_eq!(snapshot.response_queue.len(), 1);
        assert_eq!(snapshot.response_queue[0].channel, "email");
        assert_eq!(snapshot.watcher_signals.len(), 3);
        assert!(
            snapshot
                .watcher_signals
                .iter()
                .any(|signal| signal.signal_key == "passive_event:calendar")
        );
        assert_eq!(snapshot.continuity_metrics.recent_signal_count, 3);
        assert_eq!(snapshot.continuity_metrics.deadline_signal_count, 2);
        assert_eq!(snapshot.continuity_metrics.burst_signal_count, 3);
        assert!(snapshot.continuity_metrics.activity_velocity > 0.0);
        assert!(snapshot.continuity_metrics.urgency_acceleration > 0.0);
        assert!(snapshot.continuity_metrics.context_switch_rate > 0.0);
        assert!(snapshot.continuity_metrics.unresolved_queue_pressure > 0.0);
        assert!(snapshot.continuity_metrics.follow_up_drift_score > 0.0);
        assert_eq!(
            snapshot
                .prepared_context_packet
                .as_ref()
                .map(|packet| packet.ready),
            Some(true)
        );
        assert!(
            snapshot
                .prepared_context_packet
                .as_ref()
                .map(|packet| packet.summary.contains("Prepared context ready"))
                .unwrap_or(false)
        );
        assert!(
            snapshot
                .confidence_notes
                .iter()
                .any(|note| note.contains("Watcher stream surfaced 3 recent signal"))
        );
        assert!(
            snapshot
                .confidence_notes
                .iter()
                .any(|note| note.contains("Unresolved queue pressure"))
        );
        assert!(
            snapshot.state_fields.iter().any(
                |field| field.field_key == "approval_required_work" && field.status == "active"
            )
        );
        assert!(
            snapshot
                .state_fields
                .iter()
                .any(|field| field.field_key == "follow_up_pressure")
        );
    }

    #[test]
    fn state_synthesis_afp_can_carry_synthesizer_handoff_metadata() {
        let content = AfpStateSynthesisContent {
            synthesized_at: "2026-06-03T10:00:00Z".to_string(),
            active_task_count: 1,
            pending_decision_count: 1,
            unread_alert_count: 0,
            calendar_pressure: "moderate".to_string(),
            headline: "One decision needs attention".to_string(),
            focus_items: vec!["Review your schedule".to_string()],
            para_overview: None,
        };

        let mut afp = build_state_synthesis_afp("user_01", "synth_1", &content);
        afp["metadata"]["synthesizer_handoff"] = serde_json::json!({
            "snapshot_ref": "snapshot_1",
            "view_id": "homepage:state:user_01"
        });
        afp["metadata"]["simulator_prepared_context_preview"] = serde_json::json!({
            "ready": true,
            "summary": "Prepare bounded context from flag_conflict around Calendar conflict."
        });
        afp["metadata"]["simulator_prepared_draft_preview"] = serde_json::json!({
            "ready": true,
            "summary": "Prepared 1 project prep note for review."
        });
        afp["metadata"]["simulator_reversible_action_preview"] = serde_json::json!({
            "action_result": {
                "capability_id": "cap_internal_task_draft_create"
            }
        });
        afp["metadata"]["simulator_approval_review_preview"] = serde_json::json!({
            "approval_kind": "send"
        });

        assert_eq!(
            afp["metadata"]["synthesizer_handoff"]["snapshot_ref"].as_str(),
            Some("snapshot_1")
        );
        assert_eq!(
            afp["metadata"]["synthesizer_handoff"]["view_id"].as_str(),
            Some("homepage:state:user_01")
        );
        assert_eq!(
            afp["metadata"]["simulator_prepared_context_preview"]["ready"].as_bool(),
            Some(true)
        );
        assert_eq!(
            afp["metadata"]["simulator_prepared_draft_preview"]["ready"].as_bool(),
            Some(true)
        );
        assert_eq!(
            afp["metadata"]["simulator_reversible_action_preview"]["action_result"]["capability_id"]
                .as_str(),
            Some("cap_internal_task_draft_create")
        );
        assert_eq!(
            afp["metadata"]["simulator_approval_review_preview"]["approval_kind"].as_str(),
            Some("send")
        );
    }

    #[test]
    fn build_synthesis_invalidation_afp_has_coordination_metadata() {
        let afp = build_synthesis_invalidation_afp(
            "user_01",
            &crate::message::AfpSynthesisInvalidationEventContent {
                invalidation_kind: "watcher_resolution".to_string(),
                reason_message_id: "resolution_1".to_string(),
                reason_type: "watcher_resolution_event".to_string(),
                invalidated_types: vec![
                    "state_snapshot".to_string(),
                    "state_synthesis".to_string(),
                ],
                invalidated_snapshot_ref: Some("snapshot_1".to_string()),
                invalidated_synthesis_ref: Some("synthesis_1".to_string()),
                heuristic_id: Some("watcher.deadline".to_string()),
                category: Some("schedule".to_string()),
            },
        );

        assert_eq!(
            afp["type"].as_str(),
            Some(crate::message::AFP_TYPE_SYNTHESIS_INVALIDATION_EVENT)
        );
        assert_eq!(afp["thread_id"].as_str(), Some("continuity:state:user_01"));
        assert_eq!(afp["metadata"]["coordination_event"].as_bool(), Some(true));
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["invalidated_snapshot_ref"].as_str(),
            Some("snapshot_1")
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["reason_message_id"].as_str(),
            Some("resolution_1")
        );
    }

    #[test]
    fn continuity_metrics_for_snapshot_smooths_against_prior_snapshot_state() {
        let watcher_signals = vec![StateSnapshotWatcherSignal {
            id: "sig_1".to_string(),
            signal_key: "passive_event:calendar".to_string(),
            category: "schedule".to_string(),
            freshness: "fresh".to_string(),
            urgency: "today".to_string(),
            confidence: "high".to_string(),
            urgency_hint: "Fresh signal still needs attention today.".to_string(),
            suppression_status: "active".to_string(),
            suppression_reason: "Recent passive event observed directly from source metadata."
                .to_string(),
            escalation_status: "watch".to_string(),
            escalation_reason:
                "Near-term watcher pressure remains active, but it does not currently justify an interruptive alert."
                    .to_string(),
            decrypt_needed: false,
            source_type: "passive_event".to_string(),
            source_subtype: "deadline_due_today".to_string(),
            thread_id: "thread_1".to_string(),
            source_refs: vec!["msg_1".to_string()],
        }];
        let decision_queue = vec![StateSnapshotDecisionItem {
            id: "decision_1".to_string(),
            label: "Review contract".to_string(),
            category: "decision".to_string(),
            urgency: "today".to_string(),
            confidence: "high".to_string(),
            source_refs: vec!["msg_1".to_string()],
            suggested_next_action: "Review".to_string(),
            approval_required: true,
        }];
        let response_queue = vec![StateSnapshotResponseItem {
            id: "response_1".to_string(),
            label: "Reply to supplier".to_string(),
            channel: "email".to_string(),
            urgency: "today".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "Within 24h".to_string(),
            source_refs: vec!["msg_2".to_string()],
            suggested_next_action: "Draft reply".to_string(),
        }];
        let context_panel_items = vec![StateSnapshotContextItem {
            id: "ctx_1".to_string(),
            label: "Relevant thread".to_string(),
            why_surfaced: "Same thread".to_string(),
            confidence: "medium".to_string(),
            freshness: "fresh".to_string(),
            relation_path: vec!["same_thread".to_string()],
            source_refs: vec!["msg_2".to_string()],
            decrypt_needed: false,
        }];
        let prior = StateSnapshotContinuityMetrics {
            recent_signal_count: 8,
            fresh_signal_count: 7,
            burst_signal_count: 3,
            reactivation_signal_count: 2,
            deadline_signal_count: 3,
            activity_velocity: 0.9,
            urgency_acceleration: 0.85,
            context_switch_rate: 0.8,
            unresolved_queue_pressure: 0.75,
            follow_up_drift_score: 0.7,
        };

        let raw = continuity_metrics_for_snapshot(
            &watcher_signals,
            &decision_queue,
            &response_queue,
            &context_panel_items,
            None,
        );
        let smoothed = continuity_metrics_for_snapshot(
            &watcher_signals,
            &decision_queue,
            &response_queue,
            &context_panel_items,
            Some(&prior),
        );

        assert!(smoothed.activity_velocity > raw.activity_velocity);
        assert!(smoothed.activity_velocity < prior.activity_velocity);
        assert!(smoothed.urgency_acceleration > raw.urgency_acceleration);
        assert!(smoothed.urgency_acceleration < prior.urgency_acceleration);
        assert_eq!(smoothed.recent_signal_count, raw.recent_signal_count);
        assert_eq!(smoothed.deadline_signal_count, raw.deadline_signal_count);
    }

    #[test]
    fn build_decision_queue_prefers_approval_and_browser_review_items_when_truncating() {
        let tasks = Vec::new();
        let alerts = Vec::new();
        let decisions = vec![
            json!({
                "id": "decision_1",
                "type": "decision_request",
                "content": { "label": "Pick roadmap direction" }
            }),
            json!({
                "id": "decision_2",
                "type": "decision_request",
                "content": { "label": "Review weekly plan" }
            }),
            json!({
                "id": "decision_3",
                "type": "decision_request",
                "content": { "label": "Choose focus area" }
            }),
            json!({
                "id": "approval_1",
                "type": MSG_AGENT_APPROVAL_REQUEST,
                "content": { "label": "Approve outbound send" }
            }),
            json!({
                "id": "approval_2",
                "type": MSG_AGENT_APPROVAL_REQUEST,
                "content": { "label": "Approve export" }
            }),
            json!({
                "id": "browser_1",
                "type": AFP_TYPE_BROWSER_TASK_FAMILY,
                "subtype": AFP_SUBTYPE_BROWSER_TASK_REQUEST_FAMILY,
                "content": {
                    "goal": "Compare pricing pages",
                    "step_approval_required": true
                }
            }),
            json!({
                "id": "browser_2",
                "type": AFP_TYPE_BROWSER_TASK_FAMILY,
                "subtype": AFP_SUBTYPE_BROWSER_TASK_REQUEST_FAMILY,
                "content": {
                    "goal": "Collect source screenshots",
                    "required_permission": "file_write"
                }
            }),
        ];

        let items = build_decision_queue(&tasks, &decisions, &alerts);
        assert_eq!(items.len(), 5);
        assert!(
            items.iter().any(|item| item.category == "approval"),
            "approval items should survive truncation"
        );
        assert!(
            items
                .iter()
                .any(|item| item.category == "browser_action" && item.approval_required),
            "approval-relevant browser actions should survive truncation"
        );
        assert!(
            items
                .iter()
                .filter(|item| item.category == "decision")
                .count()
                < 3,
            "generic decision requests should yield when stronger approval work exists"
        );
    }

    #[test]
    fn build_response_queue_prefers_tighter_due_hint_when_urgency_ties() {
        let policy = ResponseQueuePolicy::default();
        let messages = vec![
            json!({
                "id": "msg_today",
                "type": "email_message",
                "metadata": { "channel": "gmail" },
                "content": {
                    "label": "Reply before close of day",
                    "subject": "Reply before close of day",
                    "body": "Please reply today with the update."
                }
            }),
            json!({
                "id": "msg_urgent",
                "type": "email_message",
                "metadata": { "channel": "gmail" },
                "content": {
                    "label": "Urgent customer reply",
                    "subject": "Urgent customer reply",
                    "body": "Please reply asap with details."
                }
            }),
            json!({
                "id": "msg_general",
                "type": "email_message",
                "metadata": { "channel": "gmail" },
                "content": {
                    "label": "General follow up",
                    "subject": "General follow up",
                    "body": "Can you respond soon with details?"
                }
            }),
        ];

        let items = build_response_queue(&messages, &policy);
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].label, "Reply before close of day");
        assert_eq!(items[0].response_due_hint, "Today");
        assert_eq!(items[1].response_due_hint, "Within 4h");
        assert_eq!(items[2].response_due_hint, "Within 24h");
    }

    #[test]
    fn continuity_metrics_ignore_fully_suppressed_watcher_signal_pressure() {
        let watcher_signals = vec![
            StateSnapshotWatcherSignal {
                id: "sig_active".to_string(),
                signal_key: "watcher:deadline".to_string(),
                category: "schedule".to_string(),
                freshness: "fresh".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                urgency_hint: "Fresh signal still needs attention today.".to_string(),
                suppression_status: "active".to_string(),
                suppression_reason:
                    "Watcher surfaced this signal without an active suppression override."
                        .to_string(),
                escalation_status: "watch".to_string(),
                escalation_reason:
                    "Near-term watcher pressure remains active, but it does not currently justify an interruptive alert."
                        .to_string(),
                decrypt_needed: false,
                source_type: "watcher_alert".to_string(),
                source_subtype: "deadline_due_today".to_string(),
                thread_id: "thread_1".to_string(),
                source_refs: vec!["msg_1".to_string()],
            },
            StateSnapshotWatcherSignal {
                id: "sig_suppressed".to_string(),
                signal_key: "watcher:study".to_string(),
                category: "study".to_string(),
                freshness: "fresh".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                urgency_hint:
                    "Signal stays visible for auditability while suppression remains active."
                        .to_string(),
                suppression_status: "suppressed".to_string(),
                suppression_reason:
                    "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours."
                        .to_string(),
                escalation_status: "deferred".to_string(),
                escalation_reason:
                    "Suppression is currently active, so this signal remains audit-visible without contributing live escalation pressure."
                        .to_string(),
                decrypt_needed: false,
                source_type: "smart_suggestion".to_string(),
                source_subtype: "study".to_string(),
                thread_id: "thread_2".to_string(),
                source_refs: vec!["msg_2".to_string()],
            },
        ];

        let metrics = continuity_metrics_for_snapshot(&watcher_signals, &[], &[], &[], None);

        assert_eq!(metrics.recent_signal_count, 1);
        assert_eq!(metrics.fresh_signal_count, 1);
        assert_eq!(metrics.deadline_signal_count, 1);
    }

    #[test]
    fn resolved_watcher_message_ids_collects_resolution_targets() {
        let messages = vec![
            json!({
                "id": "resolution_1",
                "type": "watcher_resolution_event",
                "content": { "resolved_message_id": "alert_1" }
            }),
            json!({
                "id": "resolution_2",
                "type": "watcher_resolution_event",
                "content": { "resolved_message_id": "suggestion_1" }
            }),
            json!({
                "id": "resolution_3",
                "type": "watcher_resolution_event",
                "content": {}
            }),
            json!({
                "id": "alert_2",
                "type": "watcher_alert",
                "content": {}
            }),
        ];

        let resolved = resolved_watcher_message_ids(&messages);

        assert!(resolved.contains("alert_1"));
        assert!(resolved.contains("suggestion_1"));
        assert_eq!(resolved.len(), 2);
    }

    #[test]
    fn build_watcher_signal_packets_excludes_resolved_watcher_messages() {
        let messages = vec![
            json!({
                "id": "alert_resolved",
                "thread_id": "watcher:user_1",
                "timestamp": "2026-06-03T09:50:00Z",
                "type": "watcher_alert",
                "subtype": "deadline_due_today",
                "from": "background_watcher",
                "metadata": { "watcher": true },
                "content": { "category": "schedule", "severity": "urgent" }
            }),
            json!({
                "id": "resolution_1",
                "thread_id": "watcher:user_1",
                "timestamp": "2026-06-03T09:55:00Z",
                "type": "watcher_resolution_event",
                "subtype": "accepted",
                "from": "background_watcher",
                "content": { "resolved_message_id": "alert_resolved" }
            }),
            json!({
                "id": "alert_live",
                "thread_id": "watcher:user_1",
                "timestamp": "2026-06-03T09:58:00Z",
                "type": "watcher_alert",
                "subtype": "deadline_due_today",
                "from": "background_watcher",
                "metadata": { "watcher": true },
                "content": { "category": "schedule", "severity": "urgent" }
            }),
        ];

        let packets = build_watcher_signal_packets(&messages, "2026-06-03T10:00:00Z");

        assert_eq!(packets.len(), 1);
        assert_eq!(packets[0].id, "alert_live");
        assert_eq!(packets[0].source_refs, vec!["alert_live".to_string()]);
    }

    #[test]
    fn build_state_snapshot_content_excludes_resolved_watcher_pressure_from_metrics() {
        let synthesis = AfpStateSynthesisContent {
            synthesized_at: "2026-06-03T10:00:00Z".to_string(),
            active_task_count: 0,
            pending_decision_count: 0,
            unread_alert_count: 0,
            calendar_pressure: "calm".to_string(),
            headline: "Calm state.".to_string(),
            focus_items: vec![],
            para_overview: None,
        };

        let recent_messages = vec![
            json!({
                "id": "alert_resolved",
                "thread_id": "watcher:user_1",
                "timestamp": "2026-06-03T09:50:00Z",
                "type": "watcher_alert",
                "subtype": "deadline_due_today",
                "from": "background_watcher",
                "metadata": { "watcher": true },
                "content": { "category": "schedule", "severity": "urgent" }
            }),
            json!({
                "id": "resolution_1",
                "thread_id": "watcher:user_1",
                "timestamp": "2026-06-03T09:55:00Z",
                "type": "watcher_resolution_event",
                "subtype": "accepted",
                "from": "background_watcher",
                "content": { "resolved_message_id": "alert_resolved" }
            }),
            json!({
                "id": "alert_live",
                "thread_id": "watcher:user_1",
                "timestamp": "2026-06-03T09:58:00Z",
                "type": "watcher_alert",
                "subtype": "deadline_due_today",
                "from": "background_watcher",
                "metadata": { "watcher": true },
                "content": { "category": "schedule", "severity": "urgent" }
            }),
        ];

        let snapshot = build_state_snapshot_content(
            &synthesis,
            &[],
            &[],
            &[],
            &[],
            &recent_messages,
            &ResponseQueuePolicy::default(),
            &PreparedDraftGenerationPolicy::default(),
            None,
            None,
            None,
        );

        assert_eq!(snapshot.watcher_signals.len(), 1);
        assert_eq!(snapshot.watcher_signals[0].id, "alert_live");
        assert_eq!(snapshot.continuity_metrics.recent_signal_count, 1);
        assert_eq!(snapshot.continuity_metrics.fresh_signal_count, 1);
        assert_eq!(snapshot.continuity_metrics.deadline_signal_count, 1);
    }

    #[test]
    fn summarize_open_loop_coordination_collects_due_and_relationship_refs() {
        let messages = vec![
            json!({
                "id": "loop_1",
                "type": "rich_note",
                "metadata": {
                    "searchable_metadata": {
                        "status": "awaiting_reply",
                        "follow_up_at": "today 5pm",
                        "relationship_id": "rel_1"
                    }
                }
            }),
            json!({
                "id": "loop_2",
                "type": "rich_note",
                "content": {
                    "status": "open",
                    "follow_up_at": "next day",
                    "relationship_id": "rel_2"
                }
            }),
            json!({
                "id": "closed_1",
                "type": "rich_note",
                "content": {
                    "status": "done",
                    "follow_up_at": "today"
                }
            }),
        ];

        let summary = summarize_open_loop_coordination(&messages);

        assert_eq!(
            summary.open_loop_refs,
            vec!["loop_1".to_string(), "loop_2".to_string()]
        );
        assert_eq!(
            summary.relationship_open_loop_refs,
            vec!["loop_1".to_string(), "loop_2".to_string()]
        );
        assert_eq!(summary.awaiting_reply_count, 1);
        assert_eq!(summary.due_soon_count, 2);
    }

    #[test]
    fn build_state_snapshot_content_promotes_open_loop_follow_up_fields_from_recent_afps() {
        let synthesis = AfpStateSynthesisContent {
            synthesized_at: "2026-06-03T10:00:00Z".to_string(),
            active_task_count: 0,
            pending_decision_count: 0,
            unread_alert_count: 0,
            calendar_pressure: "calm".to_string(),
            headline: "Calm state.".to_string(),
            focus_items: vec![],
            para_overview: None,
        };

        let recent_messages = vec![
            json!({
                "id": "loop_follow_up",
                "thread_id": "thread_1",
                "timestamp": "2026-06-03T09:40:00Z",
                "type": "rich_note",
                "metadata": {
                    "searchable_metadata": {
                        "status": "awaiting_reply",
                        "follow_up_at": "today 4pm"
                    }
                }
            }),
            json!({
                "id": "loop_relationship",
                "thread_id": "thread_2",
                "timestamp": "2026-06-03T09:45:00Z",
                "type": "rich_note",
                "metadata": {
                    "searchable_metadata": {
                        "status": "open",
                        "relationship_id": "rel_7"
                    }
                }
            }),
        ];

        let snapshot = build_state_snapshot_content(
            &synthesis,
            &[],
            &[],
            &[],
            &[],
            &recent_messages,
            &ResponseQueuePolicy::default(),
            &PreparedDraftGenerationPolicy::default(),
            None,
            None,
            None,
        );

        let follow_up = snapshot
            .state_fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_FOLLOW_UP_PRESSURE)
            .expect("follow_up_pressure field");
        assert_eq!(follow_up.status, "monitor");
        assert!(follow_up.reason.contains("open follow-up loop"));
        assert!(
            follow_up
                .evidence_refs
                .contains(&"loop_follow_up".to_string())
        );
        assert!(
            follow_up
                .evidence_refs
                .contains(&"loop_relationship".to_string())
        );

        let relationship = snapshot
            .state_fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_RELATIONSHIP_FOLLOW_UP)
            .expect("relationship_follow_up field");
        assert_eq!(relationship.status, "monitor");
        assert!(
            relationship
                .reason
                .contains("relationship-linked open loop")
        );
        assert_eq!(
            relationship.evidence_refs,
            vec!["loop_relationship".to_string()]
        );
        assert!(snapshot.confidence_notes.iter().any(|note| note.contains(
            "Open loops surfaced 1 awaiting-reply item(s) and 1 due-soon follow-up anchor(s)"
        )));
    }

    #[test]
    fn build_state_snapshot_content_promotes_background_work_into_state_fields() {
        let synthesis = AfpStateSynthesisContent {
            synthesized_at: "2026-07-18T09:00:00Z".to_string(),
            active_task_count: 0,
            pending_decision_count: 0,
            unread_alert_count: 0,
            calendar_pressure: "calm".to_string(),
            headline: "1 approval-ready background work item need review.".to_string(),
            focus_items: vec!["Review 1 approval-required background work item".to_string()],
            para_overview: None,
        };
        let background_work = BackgroundWorkQueueSummary {
            total_count: 2,
            prepared_review_count: 1,
            approval_count: 1,
            follow_up_count: 0,
            communication_count: 0,
            renewal_count: 1,
            bill_count: 0,
            form_count: 1,
            evidence_refs: vec!["artifact_1".to_string(), "evt_1".to_string()],
        };

        let snapshot = build_state_snapshot_content(
            &synthesis,
            &[],
            &[],
            &[],
            &[],
            &[],
            &ResponseQueuePolicy::default(),
            &PreparedDraftGenerationPolicy::default(),
            None,
            None,
            Some(&background_work),
        );

        let approval = snapshot
            .state_fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_APPROVAL_REQUIRED_WORK)
            .expect("approval_required_work field");
        assert_eq!(approval.status, "active");
        assert_eq!(approval.surface_hint, "decision_queue");
        assert!(approval.reason.contains("approval-required item"));
        assert!(approval.evidence_refs.contains(&"artifact_1".to_string()));
        assert!(approval.evidence_refs.contains(&"evt_1".to_string()));

        let follow_up = snapshot
            .state_fields
            .iter()
            .find(|field| field.field_key == STATE_FIELD_FOLLOW_UP_PRESSURE)
            .expect("follow_up_pressure field");
        assert_eq!(follow_up.status, "monitor");
        assert_eq!(follow_up.surface_hint, "decision_queue");
        assert!(
            follow_up
                .reason
                .contains("Background personalOS work is already queued")
        );
        assert!(follow_up.evidence_refs.contains(&"artifact_1".to_string()));
        assert!(follow_up.evidence_refs.contains(&"evt_1".to_string()));
        assert!(snapshot.sources.contains(&"artifact_1".to_string()));
        assert!(snapshot.sources.contains(&"evt_1".to_string()));
        assert_eq!(
            snapshot.suggested_actions,
            vec!["Review 1 approval-required background work item".to_string()]
        );

        assert!(snapshot.confidence_notes.iter().any(|note| note.contains(
            "Background work queue surfaced 2 item(s): 1 approval, 1 prepared review, 0 follow-up."
        )));
    }

    #[test]
    fn background_work_snapshot_produces_approval_gated_handoff_when_other_pressure_is_quiet() {
        let synthesis = AfpStateSynthesisContent {
            synthesized_at: "2026-07-18T09:00:00Z".to_string(),
            active_task_count: 0,
            pending_decision_count: 0,
            unread_alert_count: 0,
            calendar_pressure: "calm".to_string(),
            headline: "1 approval-ready background work item need review.".to_string(),
            focus_items: vec!["Review 1 approval-required background work item".to_string()],
            para_overview: None,
        };
        let background_work = BackgroundWorkQueueSummary {
            total_count: 1,
            prepared_review_count: 0,
            approval_count: 1,
            follow_up_count: 0,
            communication_count: 0,
            renewal_count: 1,
            bill_count: 0,
            form_count: 0,
            evidence_refs: vec!["artifact_approval".to_string()],
        };

        let snapshot = build_state_snapshot_content(
            &synthesis,
            &[],
            &[],
            &[],
            &[],
            &[],
            &ResponseQueuePolicy::default(),
            &PreparedDraftGenerationPolicy::default(),
            None,
            None,
            Some(&background_work),
        );
        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);

        assert_eq!(handoff.surface_recommendation, "decision_queue");
        assert_eq!(
            handoff.approval_boundary.as_deref(),
            Some("user_approval_required")
        );
        assert_eq!(
            handoff
                .autonomy_decision
                .as_ref()
                .map(|decision| decision.autonomy_level),
            Some(crate::autonomy_policy::PersonalAutonomyLevel::RequestApproval)
        );
        assert_eq!(handoff.suggested_mood, None);
        assert_eq!(handoff.confidence, "medium");
        assert_eq!(
            handoff.suggested_next_actions,
            vec!["Review 1 approval-required background work item".to_string()]
        );
        assert!(handoff.escalation_required);
    }

    #[test]
    fn background_work_snapshot_produces_review_handoff_for_prepared_non_approval_work() {
        let synthesis = AfpStateSynthesisContent {
            synthesized_at: "2026-07-18T09:00:00Z".to_string(),
            active_task_count: 0,
            pending_decision_count: 0,
            unread_alert_count: 0,
            calendar_pressure: "calm".to_string(),
            headline: "1 renewal review queued for review.".to_string(),
            focus_items: vec!["Review 1 prepared renewal review item".to_string()],
            para_overview: None,
        };
        let background_work = BackgroundWorkQueueSummary {
            total_count: 1,
            prepared_review_count: 1,
            approval_count: 0,
            follow_up_count: 0,
            communication_count: 0,
            renewal_count: 1,
            bill_count: 0,
            form_count: 0,
            evidence_refs: vec!["artifact_review".to_string()],
        };

        let snapshot = build_state_snapshot_content(
            &synthesis,
            &[],
            &[],
            &[],
            &[],
            &[],
            &ResponseQueuePolicy::default(),
            &PreparedDraftGenerationPolicy::default(),
            None,
            None,
            Some(&background_work),
        );
        let handoff =
            build_synthesizer_handoff("snapshot_1", "homepage:state:user_01", &snapshot, None);

        assert_eq!(handoff.surface_recommendation, "decision_queue");
        assert_eq!(handoff.approval_boundary, None);
        assert_eq!(handoff.suggested_mood, None);
        assert_eq!(
            handoff
                .autonomy_decision
                .as_ref()
                .map(|decision| decision.autonomy_level),
            Some(crate::autonomy_policy::PersonalAutonomyLevel::SuggestWithArtifact)
        );
        assert_eq!(handoff.confidence, "medium");
        assert_eq!(
            handoff.suggested_next_actions,
            vec!["Review 1 prepared renewal review item".to_string()]
        );
        assert!(!handoff.escalation_required);
    }

    #[test]
    fn compose_headline_and_focus_items_prefer_background_work_when_other_pressure_is_quiet() {
        let background_work = BackgroundWorkQueueSummary {
            total_count: 2,
            prepared_review_count: 1,
            approval_count: 1,
            follow_up_count: 0,
            communication_count: 0,
            renewal_count: 1,
            bill_count: 0,
            form_count: 1,
            evidence_refs: Vec::new(),
        };

        let headline = compose_headline_with_background(0, 0, 0, "calm", &background_work);
        let focus_items = compose_focus_items_with_background(0, 0, 0, "calm", &background_work);

        assert_eq!(
            headline,
            "1 approval-ready background work item need review."
        );
        assert_eq!(
            focus_items,
            vec!["Review 1 approval-required background work item".to_string()]
        );
    }

    #[test]
    fn build_active_attention_window_metadata_includes_snapshot_sources_without_queue_refs() {
        let snapshot = crate::state_snapshot::StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["artifact_1".to_string(), "evt_1".to_string()],
            decision_queue: Vec::new(),
            response_queue: Vec::new(),
            active_commitments: Vec::new(),
            critical_changes: Vec::new(),
            context_panel_items: Vec::new(),
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics::default(),
            suggested_actions: Vec::new(),
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: None,
            prepared_draft_packet: None,
            staleness_at: "2026-07-18T09:00:00Z".to_string(),
        };
        let recent_messages = vec![
            json!({
                "id": "artifact_1",
                "thread_id": "thread:artifact",
                "supertags": ["project:personalos"],
                "metadata": {
                    "searchable_metadata": {
                        "memory_space": "work"
                    }
                }
            }),
            json!({
                "id": "evt_1",
                "thread_id": "thread:event",
                "supertags": ["area:home"],
                "metadata": {}
            }),
        ];

        let metadata = build_active_attention_window_metadata(&snapshot, &recent_messages);

        assert_eq!(metadata["source_refs"], json!(["artifact_1", "evt_1"]));
        assert_eq!(
            metadata["thread_refs"],
            json!(["thread:artifact", "thread:event"])
        );
        assert_eq!(metadata["memory_spaces"], json!(["work"]));
    }

    #[test]
    fn build_active_attention_window_metadata_captures_ref_families_and_propagation_labels() {
        let snapshot = crate::state_snapshot::StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "today".to_string(),
            sources: vec!["msg_1".to_string(), "msg_3".to_string()],
            decision_queue: vec![crate::state_snapshot::StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Review Aurora launch".to_string(),
                category: "decision".to_string(),
                urgency: "today".to_string(),
                confidence: "high".to_string(),
                source_refs: vec!["msg_1".to_string()],
                suggested_next_action: "Review".to_string(),
                approval_required: false,
            }],
            response_queue: vec![crate::state_snapshot::StateSnapshotResponseItem {
                id: "response_1".to_string(),
                label: "Reply to supplier".to_string(),
                channel: "email".to_string(),
                urgency: "today".to_string(),
                confidence: "medium".to_string(),
                response_due_hint: "Today".to_string(),
                source_refs: vec!["msg_3".to_string()],
                suggested_next_action: "Reply".to_string(),
            }],
            active_commitments: Vec::new(),
            critical_changes: Vec::new(),
            context_panel_items: vec![crate::state_snapshot::StateSnapshotContextItem {
                id: "context_1".to_string(),
                label: "Aurora note".to_string(),
                why_surfaced: "Linked through the same project".to_string(),
                confidence: "high".to_string(),
                freshness: "fresh".to_string(),
                relation_path: vec!["same_project".to_string(), "same_thread".to_string()],
                source_refs: vec!["msg_1".to_string()],
                decrypt_needed: false,
            }],
            watcher_signals: Vec::new(),
            continuity_metrics: crate::state_snapshot::StateSnapshotContinuityMetrics::default(),
            suggested_actions: Vec::new(),
            confidence_notes: Vec::new(),
            state_fields: Vec::new(),
            prepared_context_packet: Some(crate::prepared_context_packet::PreparedContextPacket {
                ready: true,
                source_refs: vec!["msg_1".to_string()],
                object_refs: vec!["project:aurora".to_string()],
                file_refs: vec!["file:docs/launch-brief.md".to_string()],
                ..Default::default()
            }),
            prepared_draft_packet: Some(crate::prepared_draft_packet::PreparedDraftPacket {
                ready: true,
                drafts: vec![crate::prepared_draft_packet::PreparedDraftArtifact {
                    draft_id: "draft_1".to_string(),
                    draft_class: "project_prep_note".to_string(),
                    label: "Aurora prep".to_string(),
                    channel: "note".to_string(),
                    summary: "Prep".to_string(),
                    body: "Prep".to_string(),
                    confidence: "high".to_string(),
                    readiness: "ready_now".to_string(),
                    response_due_hint: "Today".to_string(),
                    approval_required_to_send: false,
                    source_refs: vec!["msg_1".to_string()],
                    source_count: 1,
                    storage_type: "ledger".to_string(),
                    storage_kind: None,
                    comparison_headers: Vec::new(),
                    comparison_rows: Vec::new(),
                    selection_reason: None,
                    suggested_next_action: "Review".to_string(),
                    object_refs: vec!["project:aurora".to_string()],
                    memory_space: Some("work".to_string()),
                    author_mask: None,
                    author_type: None,
                    author_id: None,
                    is_human_authored: None,
                    human_only: None,
                }],
                ..Default::default()
            }),
            staleness_at: "2026-06-03T10:00:00Z".to_string(),
        };
        let recent_messages = vec![
            json!({
                "id": "msg_1",
                "thread_id": "thread:aurora",
                "supertags": ["project:aurora", "area:work"],
                "metadata": {
                    "searchable_metadata": {
                        "memory_space": "work"
                    }
                }
            }),
            json!({
                "id": "msg_3",
                "thread_id": "thread:calendar",
                "metadata": {}
            }),
        ];

        let metadata = build_active_attention_window_metadata(&snapshot, &recent_messages);

        assert_eq!(metadata["expires_in_seconds"].as_u64(), Some(300));
        assert!(
            metadata["source_refs"]
                .as_array()
                .is_some_and(|refs| !refs.is_empty())
        );
        assert!(metadata["thread_refs"].as_array().is_some_and(|refs| {
            refs.iter()
                .filter_map(Value::as_str)
                .any(|value| value == "thread:aurora")
        }));
        assert!(metadata["supertags"].as_array().is_some_and(|tags| {
            tags.iter()
                .filter_map(Value::as_str)
                .any(|value| value == "project:aurora")
        }));
        assert!(metadata["memory_spaces"].as_array().is_some_and(|spaces| {
            spaces
                .iter()
                .filter_map(Value::as_str)
                .any(|value| value == "work")
        }));
        assert!(
            metadata["propagation_labels"]
                .as_array()
                .is_some_and(|labels| labels
                    .iter()
                    .filter_map(Value::as_str)
                    .any(|value| value == "ref_family:thread"))
        );
    }

    #[test]
    fn watcher_signal_packet_carries_suppression_rationale_from_metadata() {
        let message = serde_json::json!({
            "id": "msg_1",
            "thread_id": "watcher:user_1",
            "timestamp": "2026-06-03T09:30:00Z",
            "type": "smart_suggestion",
            "subtype": "study",
            "from": "background_watcher",
            "metadata": {
                "empathetic_explanation": "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours.",
                "emotional_decay": {
                    "suppressed_until": "2099-06-06T09:30:00Z"
                }
            }
        });

        let synthesized_at = chrono::DateTime::parse_from_rfc3339("2026-06-03T10:00:00Z").ok();
        let signal = watcher_signal_packet_from_message(&message, synthesized_at.as_ref())
            .expect("signal should build");

        assert_eq!(signal.suppression_status, "suppressed");
        assert!(signal.suppression_reason.contains("low acceptance history"));
        assert_eq!(
            signal.urgency_hint,
            "This heuristic has low acceptance history, so similar reminders are cooled down for about 72 hours."
        );
        assert_eq!(signal.escalation_status, "deferred");
        assert!(
            signal
                .escalation_reason
                .contains("audit-visible without contributing live escalation pressure")
        );
        assert!(!signal.decrypt_needed);
    }

    #[test]
    fn watcher_signal_packet_prefers_escalation_rationale_for_required_alerts() {
        let message = serde_json::json!({
            "id": "msg_alert_1",
            "thread_id": "watcher:user_1",
            "timestamp": "2026-06-03T09:30:00Z",
            "type": "watcher_alert",
            "subtype": "deadline_due_today",
            "content": {
                "severity": "urgent",
                "category": "schedule"
            },
            "from": "background_watcher",
            "metadata": {
                "empathetic_explanation": "Watcher surfaced this signal without an active suppression override."
            }
        });

        let synthesized_at = chrono::DateTime::parse_from_rfc3339("2026-06-03T10:00:00Z").ok();
        let signal = watcher_signal_packet_from_message(&message, synthesized_at.as_ref())
            .expect("signal should build");

        assert_eq!(signal.escalation_status, "required");
        assert_eq!(
            signal.escalation_reason,
            "Active watcher alert is time-sensitive and should remain in the live escalation path."
        );
        assert_eq!(
            signal.urgency_hint,
            "Active watcher alert is time-sensitive and should remain in the live escalation path."
        );
    }
}
