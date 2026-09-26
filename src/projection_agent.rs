/// Projection Agent - Pillar D of Continuity.
///
/// Builds an anticipatory LLM objective that reasons about upcoming deadline
/// conflicts, goal drift, and interruption patterns, then emits `projection`
/// AFP messages. The objective is dispatched via /agent/orchestrate so the
/// LLM result arrives as an AFP message on the user's SSE stream.
///
/// Token budget gate: before building the objective the agent checks
/// `TokenBudgetGate` and falls back to `build_heuristic_projection_afp`
/// when the daily limit is reached or escalation is disabled.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    db::Db,
    message::{AFP_TYPE_PROJECTION, AfpProjectionContent},
    privacy_escalation::PrivacyEscalationLayer,
    state_snapshot::{AFP_TYPE_STATE_SNAPSHOT, StateSnapshotContent},
    token_budget::{BudgetDecision, TokenBudgetGate},
    topology_retrieval::build_neighborhood_bundle,
};

#[derive(Clone, Debug, Default)]
pub struct ProjectionObjectiveContext {
    pub today: String,
    pub user_id: String,
    pub tasks: Vec<Value>,
    pub patterns: Vec<Value>,
    pub temporal: Vec<Value>,
    pub alerts: Vec<Value>,
    pub latest_state_snapshot: Option<StateSnapshotContent>,
    pub topology_anchor_refs: Vec<String>,
    pub topology_neighbors: Option<Value>,
}

/// Build the LLM objective string for the Projection Agent, gated by the token budget.
pub async fn check_budget_and_build_projection(
    db: &Db,
    user_id: &str,
) -> Result<Option<(String, Vec<Value>)>, sqlx::Error> {
    const HEURISTIC_ID: &str = "projection-agent";
    const ESTIMATED_TOKENS: u32 = 1500;

    let gate = TokenBudgetGate::new(db);
    let privacy = PrivacyEscalationLayer::new(db);

    let (decision, daily_used, daily_limit) = gate
        .check_and_gate(user_id, HEURISTIC_ID, ESTIMATED_TOKENS)
        .await;

    let provider = privacy.select_provider(user_id).await;

    let trigger_afp = TokenBudgetGate::build_proactive_trigger_afp(
        user_id,
        HEURISTIC_ID,
        daily_used,
        daily_limit,
        &decision,
        provider.tier(),
    );

    match decision {
        BudgetDecision::Allowed { .. } => {
            let objective = build_projection_objective(db, user_id).await?;
            Ok(Some((objective, vec![trigger_afp])))
        }
        _ => Ok(None),
    }
}

pub fn build_projection_objective_from_context(context: &ProjectionObjectiveContext) -> String {
    let state_snapshot_summary = context
        .latest_state_snapshot
        .as_ref()
        .map(projection_snapshot_summary)
        .unwrap_or_else(|| "No synthesized state snapshot is available.".to_string());
    let topology_summary = context
        .topology_neighbors
        .as_ref()
        .map(|bundle| serde_json::to_string_pretty(bundle).unwrap_or_default())
        .unwrap_or_else(|| {
            "No topology neighborhood was available for current anchors.".to_string()
        });

    format!(
        "You are the Projection Agent for OmnyID. Today is {}.\n\
        Use the synthesized `state_snapshot` as the primary source of truth. \
        Use raw tasks, patterns, temporal projections, alerts, and topology only as supporting evidence.\n\n\
        ## Synthesized state snapshot\n{}\n\n\
        ## Topology neighborhood for snapshot anchors\n{}\n\n\
        ## Active tasks\n{}\n\n\
        ## Behavioral patterns\n{}\n\n\
        ## Temporal projections\n{}\n\n\
        ## Recent alerts\n{}\n\n\
        Produce 1-3 concise anticipatory `projection` AFP messages. Each must have:\n\
          type: \"projection\"\n\
          content: {{ headline, body, category (one of: deadline_conflict | goal_drift | \
        interruption_pattern | opportunity | other), urgency (low|medium|high), \
        confidence (0.0-1.0), remediation_steps (array of strings), \
        action_chips (array of strings), source_refs (array of source message ids), \
        surface_policy (one of: surface_now | defer | background_only), \
        approval_policy (one of: no_side_effect | approval_required) }}\n\
          id: new ULID, thread_id \"continuity:projection:{}\", \
        from \"projection_agent\", to [\"{}\"], \
        metadata.store=true, metadata.continuity=true, metadata.proactive=true, \
        metadata.source_refs mirrors content.source_refs, store_in_relational=true\n\
        Guardrails: projections may suggest preparation, review, or draft work, \
        but must not claim an action was taken. Set approval_policy=\"approval_required\" \
        whenever the remediation would send, book, cancel, pay, or disclose information.\n\
        Current topology anchors: {}\n\
        Return an array of AFP JSON objects. Do not ask clarifying questions.",
        context.today,
        state_snapshot_summary,
        topology_summary,
        serde_json::to_string_pretty(&context.tasks).unwrap_or_default(),
        serde_json::to_string_pretty(&context.patterns).unwrap_or_default(),
        serde_json::to_string_pretty(&context.temporal).unwrap_or_default(),
        serde_json::to_string_pretty(&context.alerts).unwrap_or_default(),
        context.user_id,
        context.user_id,
        serde_json::to_string(&context.topology_anchor_refs).unwrap_or_default(),
    )
}

/// Build the LLM objective string for the Projection Agent.
pub async fn build_projection_objective(db: &Db, user_id: &str) -> Result<String, sqlx::Error> {
    let tasks = db
        .list_afp_messages_by_type(user_id, &["task"], 20)
        .await
        .unwrap_or_default();
    let patterns = db
        .list_afp_messages_by_type(user_id, &["behavior_pattern"], 5)
        .await
        .unwrap_or_default();
    let temporal = db
        .list_afp_messages_by_type(user_id, &["temporal_projection"], 2)
        .await
        .unwrap_or_default();
    let alerts = db
        .list_afp_messages_by_type(user_id, &["watcher_alert"], 5)
        .await
        .unwrap_or_default();
    let latest_state_snapshot = db
        .list_afp_messages_by_type(user_id, &[AFP_TYPE_STATE_SNAPSHOT], 1)
        .await
        .unwrap_or_default()
        .first()
        .and_then(state_snapshot_content_from_message);
    let topology_anchor_refs = latest_state_snapshot
        .as_ref()
        .map(projection_anchor_refs_from_snapshot)
        .unwrap_or_default();
    let topology_neighbors = if topology_anchor_refs.is_empty() {
        None
    } else {
        let recent_messages = db
            .query_private_context_window(user_id, None, None, 60 * 24 * 30, 80, None)
            .await
            .unwrap_or_default();
        let bundle = build_neighborhood_bundle(&topology_anchor_refs, &recent_messages, 2, 12);
        Some(serde_json::to_value(bundle).unwrap_or(Value::Null))
    };

    Ok(build_projection_objective_from_context(
        &ProjectionObjectiveContext {
            today: Utc::now().format("%Y-%m-%d").to_string(),
            user_id: user_id.to_string(),
            tasks,
            patterns,
            temporal,
            alerts,
            latest_state_snapshot,
            topology_anchor_refs,
            topology_neighbors,
        },
    ))
}

fn state_snapshot_content_from_message(message: &Value) -> Option<StateSnapshotContent> {
    serde_json::from_value(message.get("content")?.clone()).ok()
}

fn projection_snapshot_summary(snapshot: &StateSnapshotContent) -> String {
    serde_json::to_string_pretty(&json!({
        "snapshot_kind": snapshot.snapshot_kind,
        "time_window": snapshot.time_window,
        "staleness_at": snapshot.staleness_at,
        "continuity_metrics": snapshot.continuity_metrics,
        "decision_queue": snapshot.decision_queue,
        "response_queue": snapshot.response_queue,
        "active_commitments": snapshot.active_commitments,
        "critical_changes": snapshot.critical_changes,
        "context_panel_items": snapshot.context_panel_items,
        "watcher_signals": snapshot.watcher_signals,
        "state_fields": snapshot.state_fields,
        "prepared_context_packet": snapshot.prepared_context_packet.as_ref().map(|packet| json!({
            "ready": packet.ready,
            "retrieval_mode": packet.retrieval_mode,
            "summary": packet.summary,
            "anchor_refs": packet.anchor_refs,
            "source_refs": packet.source_refs,
        })),
        "suggested_actions": snapshot.suggested_actions,
        "confidence_notes": snapshot.confidence_notes,
    }))
    .unwrap_or_default()
}

fn projection_anchor_refs_from_snapshot(snapshot: &StateSnapshotContent) -> Vec<String> {
    let mut refs = Vec::new();
    refs.extend(snapshot.sources.iter().cloned());
    refs.extend(
        snapshot
            .decision_queue
            .iter()
            .flat_map(|item| item.source_refs.iter().cloned()),
    );
    refs.extend(
        snapshot
            .response_queue
            .iter()
            .flat_map(|item| item.source_refs.iter().cloned()),
    );
    refs.extend(
        snapshot
            .active_commitments
            .iter()
            .flat_map(|item| item.source_refs.iter().cloned()),
    );
    refs.extend(
        snapshot
            .critical_changes
            .iter()
            .flat_map(|item| item.source_refs.iter().cloned()),
    );
    refs.extend(
        snapshot
            .context_panel_items
            .iter()
            .flat_map(|item| item.source_refs.iter().cloned()),
    );
    refs.extend(
        snapshot
            .watcher_signals
            .iter()
            .flat_map(|item| item.source_refs.iter().cloned()),
    );
    if let Some(packet) = &snapshot.prepared_context_packet {
        refs.extend(packet.anchor_refs.iter().cloned());
        refs.extend(packet.source_refs.iter().cloned());
    }
    if let Some(packet) = &snapshot.prepared_draft_packet {
        refs.extend(
            packet
                .drafts
                .iter()
                .flat_map(|draft| draft.source_refs.iter().cloned()),
        );
    }

    dedupe_nonempty(refs, 12)
}

fn dedupe_nonempty(values: Vec<String>, limit: usize) -> Vec<String> {
    let mut deduped: Vec<String> = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() || deduped.iter().any(|existing| existing == trimmed) {
            continue;
        }
        deduped.push(trimmed.to_string());
        if deduped.len() >= limit {
            break;
        }
    }
    deduped
}

/// Build a heuristic fallback `projection` AFP message when context is minimal.
pub fn build_heuristic_projection_afp(
    user_id: &str,
    headline: &str,
    body: &str,
    category: &str,
    urgency: &str,
    remediation_steps: Vec<String>,
) -> Value {
    let content = AfpProjectionContent {
        headline: headline.to_string(),
        body: body.to_string(),
        category: Some(category.to_string()),
        urgency: Some(urgency.to_string()),
        confidence: 0.5,
        remediation_steps: remediation_steps.clone(),
        action_chips: vec![
            serde_json::Value::String("Acknowledge".to_string()),
            serde_json::Value::String("Plan now".to_string()),
        ],
        source_refs: Vec::new(),
        surface_policy: Some(
            if urgency == "high" {
                "surface_now"
            } else {
                "defer"
            }
            .to_string(),
        ),
        approval_policy: Some("no_side_effect".to_string()),
        ..Default::default()
    };
    let source_refs = content.source_refs.clone();
    let surface_policy = content.surface_policy.clone();
    let approval_policy = content.approval_policy.clone();

    let urgency_tone = match urgency {
        "high" => "warning",
        "medium" => "strategy",
        _ => "info",
    };

    let id = Ulid::new().to_string();
    json!({
        "protocol": "afp-v1",
        "id": id,
        "thread_id": format!("continuity:projection:{}", user_id),
        "from": "projection_agent",
        "to": [user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_PROJECTION,
        "content": {
            "headline": content.headline,
            "body": content.body,
            "category": content.category,
            "urgency": content.urgency,
            "confidence": content.confidence,
            "remediation_steps": content.remediation_steps,
            "action_chips": content.action_chips,
            "source_refs": source_refs,
            "surface_policy": surface_policy,
            "approval_policy": approval_policy,
        },
        "views": [{
            "schema_version": "a2ui.v1",
            "kind": "callout",
            "props": {
                "tone": urgency_tone,
                "title": content.headline,
                "body": content.body,
                "action_chips": content.action_chips,
            },
        }],
        "metadata": {
            "store": true,
            "continuity": true,
            "proactive": true,
            "source_refs": source_refs,
            "surface_policy": surface_policy,
            "approval_policy": approval_policy,
        },
        "store_in_relational": true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state_snapshot::{
        StateSnapshotContent, StateSnapshotContinuityMetrics, StateSnapshotDecisionItem,
    };

    #[test]
    fn projection_objective_uses_state_snapshot_topology_and_policy_contract() {
        let snapshot = StateSnapshotContent {
            snapshot_kind: "homepage_briefing".to_string(),
            time_window: "7d".to_string(),
            sources: vec!["msg_root".to_string()],
            decision_queue: vec![StateSnapshotDecisionItem {
                id: "decision_1".to_string(),
                label: "Choose caterer".to_string(),
                category: "vendor".to_string(),
                urgency: "high".to_string(),
                confidence: "high".to_string(),
                source_refs: vec!["msg_caterer".to_string()],
                suggested_next_action: "Compare quotes".to_string(),
                approval_required: true,
            }],
            continuity_metrics: StateSnapshotContinuityMetrics {
                deadline_signal_count: 2,
                unresolved_queue_pressure: 0.8,
                ..Default::default()
            },
            staleness_at: "2026-09-26T00:00:00Z".to_string(),
            ..Default::default()
        };
        let anchors = projection_anchor_refs_from_snapshot(&snapshot);
        let objective = build_projection_objective_from_context(&ProjectionObjectiveContext {
            today: "2026-09-26".to_string(),
            user_id: "user_1".to_string(),
            latest_state_snapshot: Some(snapshot),
            topology_anchor_refs: anchors,
            topology_neighbors: Some(json!({
                "coverage_summary": "Surfaced related wedding context.",
                "items": [{ "message_id": "msg_quote", "label": "Caterer quote" }]
            })),
            ..Default::default()
        });

        assert!(
            objective
                .contains("Use the synthesized `state_snapshot` as the primary source of truth")
        );
        assert!(objective.contains("Choose caterer"));
        assert!(objective.contains("Surfaced related wedding context"));
        assert!(objective.contains("source_refs"));
        assert!(objective.contains("surface_policy"));
        assert!(objective.contains("approval_policy"));
        assert!(objective.contains("msg_caterer"));
    }

    #[test]
    fn heuristic_projection_carries_policy_metadata() {
        let afp = build_heuristic_projection_afp(
            "user_1",
            "Review vendor deadline",
            "A deadline may need attention.",
            "deadline_conflict",
            "high",
            vec!["Review options".to_string()],
        );

        assert_eq!(
            afp["content"]["surface_policy"].as_str(),
            Some("surface_now")
        );
        assert_eq!(
            afp["content"]["approval_policy"].as_str(),
            Some("no_side_effect")
        );
        assert_eq!(
            afp["metadata"]["surface_policy"].as_str(),
            Some("surface_now")
        );
        assert!(afp["content"]["source_refs"].as_array().is_some());
    }
}
