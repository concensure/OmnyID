/// Proactive agent heuristic engine — Layers 1–2 of the 4-layer architecture.
///
/// Layer 1: passive events are ingested via `POST /events/passive` and stored as
///          AFP messages (type = "passive_event").  No LLM.
/// Layer 2: this module evaluates built-in heuristic rules against each incoming
///          passive event and emits `proactive_suggestion` AFP messages when
///          conditions are satisfied.  No LLM.  Pure rule evaluation.
///
/// The LLM gate (Layer 4) is invoked only when `P4_CONFIDENCE_THRESHOLD` is
/// exceeded AND the heuristic action template requires synthesis.  That path is
/// intentionally left for a later phase (P4.x) and is not implemented here.
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    autonomy_policy::AutonomyDecision,
    message::{
        AFP_SUBTYPE_CALENDAR_EVENT_COMPLETED, AFP_SUBTYPE_DEEP_WORK_SESSION_STARTED,
        AFP_SUBTYPE_EMAIL_THREAD_IDLE, AFP_SUBTYPE_WORKFLOW_FAILED, AFP_TYPE_PROACTIVE_SUGGESTION,
        AfpPassiveEventContent, AfpProactiveSuggestionContent,
    },
    proactive_policy::policy_for_proactive_suggestion,
};

pub use crate::proactive_bundle::{
    ProactiveSuggestionAfpBundle, build_suggestion_afp_bundle,
    build_suggestion_afp_bundle_with_autonomy,
};

// ── Built-in heuristics (P2.2) ────────────────────────────────────────────────

/// A single built-in or user-defined heuristic rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProactiveHeuristic {
    pub id: String,
    pub name: String,
    /// Passive-event subtype that activates this rule.
    pub trigger_event_type: String,
    /// Key/value conditions evaluated against `event.metadata`.
    pub conditions: Value,
    /// Template for the `proactive_suggestion` AFP content.
    pub action_template: ActionTemplate,
    /// Minimum confidence required to emit a suggestion (0.0–1.0).
    pub confidence_threshold: f64,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionTemplate {
    pub action_label: String,
    pub description: String,
    pub urgency: String,
}

/// Returns the 5 built-in seed heuristics shipped on first run.
pub fn builtin_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        ProactiveHeuristic {
            id: "meeting-follow-up".to_string(),
            name: "Meeting Follow-Up Reminder".to_string(),
            trigger_event_type: AFP_SUBTYPE_CALENDAR_EVENT_COMPLETED.to_string(),
            conditions: json!({ "meeting_tag": "client" }),
            action_template: ActionTemplate {
                action_label: "Draft follow-up".to_string(),
                description: "Client meeting just ended and no follow-up AFP was recorded in the last 12 hours. Draft a follow-up message now?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.7,
            enabled: true,
        },
        ProactiveHeuristic {
            id: "invoice-delay".to_string(),
            name: "Post-Meeting Invoice Reminder".to_string(),
            trigger_event_type: AFP_SUBTYPE_CALENDAR_EVENT_COMPLETED.to_string(),
            conditions: json!({ "meeting_tag": "client" }),
            action_template: ActionTemplate {
                action_label: "Invoice ready to draft".to_string(),
                description: "A client meeting completed but no invoice AFP was created within 24 hours. Create invoice now?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        ProactiveHeuristic {
            id: "workflow-failure-notify".to_string(),
            name: "Workflow Failure Alert".to_string(),
            trigger_event_type: AFP_SUBTYPE_WORKFLOW_FAILED.to_string(),
            conditions: json!({}),
            action_template: ActionTemplate {
                action_label: "View failure details".to_string(),
                description: "A workflow run failed. Review the run and retry or adjust the workflow?".to_string(),
                urgency: "high".to_string(),
            },
            confidence_threshold: 0.5,
            enabled: true,
        },
        ProactiveHeuristic {
            id: "deep-work-protect".to_string(),
            name: "Deep Work Notification Suppression".to_string(),
            trigger_event_type: AFP_SUBTYPE_DEEP_WORK_SESSION_STARTED.to_string(),
            conditions: json!({}),
            action_template: ActionTemplate {
                action_label: "Enable focus mode".to_string(),
                description: "A deep-work session started. Non-urgent AFP notifications will be batched until the session ends.".to_string(),
                urgency: "low".to_string(),
            },
            confidence_threshold: 0.8,
            enabled: true,
        },
        ProactiveHeuristic {
            id: "stalled-thread".to_string(),
            name: "Stalled Email Thread Follow-Up".to_string(),
            trigger_event_type: AFP_SUBTYPE_EMAIL_THREAD_IDLE.to_string(),
            conditions: json!({ "idle_hours_threshold": 48 }),
            action_template: ActionTemplate {
                action_label: "Follow up on thread".to_string(),
                description: "An email thread has had no reply for 48 hours. Send a follow-up?".to_string(),
                urgency: "medium".to_string(),
            },
            confidence_threshold: 0.6,
            enabled: true,
        },
    ]
}

// ── Rule evaluator (P2.3) ─────────────────────────────────────────────────────

/// Result produced by evaluating heuristics against a passive event.
#[derive(Debug, Clone)]
pub struct EvaluationResult {
    pub heuristic_id: String,
    pub suggestion: AfpProactiveSuggestionContent,
}

/// Evaluate all enabled heuristics against a single passive event.
///
/// Returns one `EvaluationResult` per heuristic whose conditions are satisfied
/// AND whose `confidence_threshold` is met.  Token cost: zero.
pub fn evaluate(
    event: &AfpPassiveEventContent,
    event_subtype: &str,
    heuristics: &[ProactiveHeuristic],
) -> Vec<EvaluationResult> {
    let mut results = Vec::new();

    for h in heuristics {
        if !h.enabled {
            continue;
        }
        if h.trigger_event_type != event_subtype {
            continue;
        }
        if event.confidence < h.confidence_threshold {
            continue;
        }
        if !conditions_satisfied(&h.conditions, &event.metadata) {
            continue;
        }

        results.push(EvaluationResult {
            heuristic_id: h.id.clone(),
            suggestion: enrich_proactive_suggestion_content(AfpProactiveSuggestionContent {
                heuristic_id: h.id.clone(),
                confidence: event.confidence,
                urgency: h.action_template.urgency.clone(),
                action_label: h.action_template.action_label.clone(),
                description: h.action_template.description.clone(),
                title: Some(h.action_template.action_label.clone()),
                action_afp_payload: None,
                dismiss_reason: None,
                source_event_id: None,
                entity_id: event.entity_id.clone(),
                ..Default::default()
            }),
        });
    }

    results
}

/// Check that all conditions in the heuristic's `conditions` object are present
/// and matching in `event_metadata`.  An empty conditions object always passes.
///
/// Numeric range conventions (avoids embedding comparison logic in condition
/// values; instead encode it in the key suffix):
///   `key_min: N`  → metadata["key"] ≥ N   (e.g. `session_duration_minutes_min: 25`)
///   `key_max: N`  → metadata["key"] ≤ N   (e.g. `hours_until_due_max: 48`)
///   `idle_hours_threshold: N` — legacy alias for `idle_hours_min`; kept for
///   backwards compatibility with existing proactive heuristics.
fn conditions_satisfied(conditions: &Value, metadata: &Value) -> bool {
    let cond_map = match conditions.as_object() {
        Some(m) => m,
        None => return true,
    };
    if cond_map.is_empty() {
        return true;
    }

    for (key, expected) in cond_map {
        // Legacy: `idle_hours_threshold` → metadata["idle_hours"] ≥ threshold.
        if key == "idle_hours_threshold" {
            let threshold = expected.as_f64().unwrap_or(0.0);
            let actual = metadata
                .get("idle_hours")
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            if actual < threshold {
                return false;
            }
            continue;
        }

        // `*_min` suffix → metadata[base_key] ≥ threshold.
        if let Some(base_key) = key.strip_suffix("_min") {
            let threshold = expected.as_f64().unwrap_or(0.0);
            let actual = metadata
                .get(base_key)
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            if actual < threshold {
                return false;
            }
            continue;
        }

        // `*_max` suffix → metadata[base_key] ≤ threshold.
        if let Some(base_key) = key.strip_suffix("_max") {
            let threshold = expected.as_f64().unwrap_or(f64::MAX);
            let actual = metadata
                .get(base_key)
                .and_then(Value::as_f64)
                .unwrap_or(f64::MAX);
            if actual > threshold {
                return false;
            }
            continue;
        }

        // Default: exact string/value match.
        match metadata.get(key) {
            Some(actual) => {
                if actual != expected {
                    return false;
                }
            }
            None => return false,
        }
    }
    true
}

/// Build the AFP message JSON for a `proactive_suggestion`.
/// This is stored via the normal AFP message path — no separate table needed.
pub fn build_suggestion_afp(
    owner_user_id: &str,
    thread_id: &str,
    result: &EvaluationResult,
    source_event_afp_id: Option<&str>,
) -> Value {
    let mut suggestion = enrich_proactive_suggestion_content(result.suggestion.clone());
    suggestion.source_event_id = source_event_afp_id.map(str::to_string);
    if let Some(source_event_id) = source_event_afp_id {
        if suggestion.source_refs.is_empty() {
            suggestion.source_refs = vec![source_event_id.to_string()];
        }
        if suggestion.source_count.is_none() {
            suggestion.source_count = Some(1);
        }
    }
    let selection_reason = proactive_suggestion_selection_reason(&suggestion);
    let consequence_preview = proactive_suggestion_consequence_preview(&suggestion);
    let provenance_cue = proactive_suggestion_provenance_cue(&suggestion);
    let source_count = suggestion
        .source_count
        .unwrap_or(suggestion.source_refs.len() as u32);
    if suggestion.selection_reason.is_none() {
        suggestion.selection_reason = Some(selection_reason.clone());
    }
    if suggestion.approval_or_reversibility_hint.is_none() {
        suggestion.approval_or_reversibility_hint = Some(consequence_preview.clone());
    }
    if suggestion.provenance_cue.is_none() {
        suggestion.provenance_cue = Some(provenance_cue.clone());
    }
    if suggestion.source_count.is_none() {
        suggestion.source_count = Some(source_count);
    }
    let strategic_policy = policy_for_proactive_suggestion(&suggestion);
    let strategic_policy_value = serde_json::to_value(&strategic_policy).unwrap_or_default();
    let mut content = serde_json::to_value(&suggestion).unwrap_or_default();
    if let Some(content_object) = content.as_object_mut() {
        content_object.insert(
            "strategic_policy".to_string(),
            strategic_policy_value.clone(),
        );
        content_object.insert(
            "surface_policy".to_string(),
            json!(strategic_policy.surface_policy),
        );
        content_object.insert(
            "approval_policy".to_string(),
            json!(strategic_policy.approval_policy),
        );
    }

    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "proactive_engine",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_PROACTIVE_SUGGESTION,
        "subtype": result.heuristic_id,
        "content": content,
        "metadata": {
            "store": true,
            "proactive": true,
            "heuristic_id": result.heuristic_id,
            "strategic_policy": strategic_policy_value,
            "surface_policy": strategic_policy.surface_policy,
            "approval_policy": strategic_policy.approval_policy,
            "selection_reason": selection_reason,
            "approval_or_reversibility_hint": consequence_preview,
            "provenance_cue": provenance_cue,
            "source_refs": suggestion.source_refs,
            "source_count": source_count,
            "entity_id": suggestion.entity_id,
            "source_event_id": suggestion.source_event_id,
            "searchable_metadata": {
                "heuristic_id": result.heuristic_id,
                "proactive_urgency": suggestion.urgency,
                "destination_view": suggestion.destination_view,
                "surface_hint": suggestion.surface_hint,
                "surface_policy": strategic_policy.surface_policy,
                "approval_policy": strategic_policy.approval_policy,
                "strategic_action": strategic_policy.action,
                "draft_class": suggestion.draft_class,
                "source_event_id": suggestion.source_event_id,
                "entity_id": suggestion.entity_id,
            },
        },
        "signature": "",
        "store_in_relational": false,
    })
}

fn proactive_suggestion_selection_reason(suggestion: &AfpProactiveSuggestionContent) -> String {
    if let Some(reason) = suggestion
        .selection_reason
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return reason.to_string();
    }

    match suggestion.heuristic_id.as_str() {
        "meeting-follow-up" => {
            "Recent client meeting context suggests preparing the follow-up while the conversation is still fresh."
                .to_string()
        }
        "invoice-delay" => {
            "Client meeting completion suggests preparing the invoice before the billing window slips."
                .to_string()
        }
        "workflow-failure-notify" => {
            "Workflow failure surfaced because the latest run needs review before downstream work drifts."
                .to_string()
        }
        "deep-work-protect" => {
            "Deep-work context surfaced because the current session benefits from lower interruption pressure."
                .to_string()
        }
        "stalled-thread" => {
            "Thread inactivity surfaced because a prepared follow-up may prevent the conversation from stalling further."
                .to_string()
        }
        _ => "Current heuristic conditions suggest preparing this next step now.".to_string(),
    }
}

fn proactive_suggestion_consequence_preview(suggestion: &AfpProactiveSuggestionContent) -> String {
    if suggestion.requires_approval {
        "Prepared suggestion still needs explicit approval before any outbound action.".to_string()
    } else {
        "Reviewing this suggestion does not execute a side effect; it keeps the prepared next step available for judgment."
            .to_string()
    }
}

fn proactive_suggestion_provenance_cue(suggestion: &AfpProactiveSuggestionContent) -> String {
    if suggestion.source_event_id.is_some() {
        "Traceable to the passive event that triggered this proactive heuristic.".to_string()
    } else {
        format!(
            "Traceable to proactive heuristic {}.",
            suggestion.heuristic_id
        )
    }
}

pub fn apply_proactive_autonomy_to_suggestion_value(
    suggestion_afp: &mut Value,
    autonomy_tier: &str,
    autonomy_decision: &AutonomyDecision,
) {
    if let Some(content) = suggestion_afp
        .get_mut("content")
        .and_then(Value::as_object_mut)
    {
        content.insert("autonomy_tier".to_string(), json!(autonomy_tier));
        content.insert(
            "autonomy_decision".to_string(),
            serde_json::to_value(autonomy_decision).unwrap_or_default(),
        );
    }
    if let Some(metadata) = suggestion_afp
        .get_mut("metadata")
        .and_then(Value::as_object_mut)
    {
        metadata.insert("autonomy_tier".to_string(), json!(autonomy_tier));
        metadata.insert(
            "autonomy_decision".to_string(),
            serde_json::to_value(autonomy_decision).unwrap_or_default(),
        );
        if let Some(searchable) = metadata
            .get_mut("searchable_metadata")
            .and_then(Value::as_object_mut)
        {
            searchable.insert("autonomy_tier".to_string(), json!(autonomy_tier));
            searchable.insert(
                "autonomy_level".to_string(),
                json!(autonomy_decision.autonomy_level),
            );
        }
    }
}

fn enrich_proactive_suggestion_content(
    mut suggestion: AfpProactiveSuggestionContent,
) -> AfpProactiveSuggestionContent {
    if suggestion.title.is_none() {
        suggestion.title = Some(suggestion.action_label.clone());
    }
    if suggestion.artifact_summary_lines.is_empty() && !suggestion.description.is_empty() {
        suggestion.artifact_summary_lines = vec![suggestion.description.clone()];
    }

    match suggestion.heuristic_id.as_str() {
        "meeting-follow-up" => {
            suggestion
                .destination_view
                .get_or_insert_with(|| "home".to_string());
            suggestion
                .surface_hint
                .get_or_insert_with(|| "home".to_string());
            suggestion
                .draft_class
                .get_or_insert_with(|| "follow_up_draft".to_string());
            suggestion
                .channel
                .get_or_insert_with(|| "email".to_string());
            suggestion
                .response_due_hint
                .get_or_insert_with(|| "Today".to_string());
            suggestion.requires_approval = true;
        }
        "invoice-delay" => {
            suggestion
                .destination_view
                .get_or_insert_with(|| "home".to_string());
            suggestion
                .surface_hint
                .get_or_insert_with(|| "home".to_string());
        }
        "workflow-failure-notify" => {
            suggestion
                .destination_view
                .get_or_insert_with(|| "workflows".to_string());
            suggestion
                .surface_hint
                .get_or_insert_with(|| "workflows".to_string());
        }
        "deep-work-protect" => {
            suggestion
                .destination_view
                .get_or_insert_with(|| "home".to_string());
            suggestion
                .surface_hint
                .get_or_insert_with(|| "home".to_string());
        }
        "stalled-thread" => {
            suggestion
                .destination_view
                .get_or_insert_with(|| "response_queue".to_string());
            suggestion
                .surface_hint
                .get_or_insert_with(|| "response_queue".to_string());
            suggestion
                .draft_class
                .get_or_insert_with(|| "follow_up_draft".to_string());
            suggestion
                .channel
                .get_or_insert_with(|| "email".to_string());
            suggestion
                .response_due_hint
                .get_or_insert_with(|| "Follow up soon".to_string());
            suggestion.requires_approval = true;
        }
        _ => {}
    }

    suggestion
}

// ── SQL helpers for DB layer ──────────────────────────────────────────────────

// ── P2.4 — Heuristic confidence feedback from outcomes ────────────────────────

/// Adjust heuristic `confidence_threshold` based on observed acceptance rates.
///
/// Rules:
/// - acceptance_rate < 0.20 and total ≥ 5 → raise threshold by 0.05 (harder to fire)
/// - acceptance_rate ≥ 0.60 → lower threshold by 0.03 (easier to fire), min 0.30
/// - acceptance_rate = 0.0 and total ≥ 10 → disable the heuristic
///
/// Returns a new `Vec` with updated heuristics; heuristics with no outcome data are unchanged.
pub fn apply_confidence_feedback(
    heuristics: Vec<ProactiveHeuristic>,
    acceptance_rates: &[serde_json::Value],
) -> Vec<ProactiveHeuristic> {
    heuristics
        .into_iter()
        .map(|mut h| {
            if let Some(rate_obj) = acceptance_rates
                .iter()
                .find(|r| r["heuristic_id"].as_str() == Some(&h.id))
            {
                let total = rate_obj["total"].as_i64().unwrap_or(0);
                let rate = rate_obj["acceptance_rate"].as_f64().unwrap_or(0.5);

                if total >= 10 && rate == 0.0 {
                    h.enabled = false;
                } else if total >= 5 && rate < 0.20 {
                    h.confidence_threshold = (h.confidence_threshold + 0.05).min(0.95);
                } else if rate >= 0.60 {
                    h.confidence_threshold = (h.confidence_threshold - 0.03).max(0.30);
                }
            }
            h
        })
        .collect()
}

/// Row shape returned by `list_proactive_suggestions`.
#[derive(Debug, Serialize, Deserialize)]
pub struct ProactiveSuggestionRow {
    pub id: String,
    pub thread_id: String,
    pub heuristic_id: String,
    pub confidence: f64,
    pub urgency: String,
    pub action_label: String,
    pub description: String,
    pub entity_id: Option<String>,
    pub source_event_id: Option<String>,
    pub timestamp: String,
}

/// Row shape for outcome recording (P3.3).
#[derive(Debug, Serialize, Deserialize)]
pub struct ProactiveOutcomeRecord {
    pub owner_user_id: String,
    pub suggestion_id: String,
    pub accepted: bool,
    pub outcome_afp_id: Option<String>,
    pub heuristic_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::autonomy_policy::{ProactiveAutonomyTier, autonomy_decision_for_proactive_enum};

    #[test]
    fn workflow_failed_fires_without_conditions() {
        let event = AfpPassiveEventContent {
            event_type: AFP_SUBTYPE_WORKFLOW_FAILED.to_string(),
            payload: None,
            context: None,
            source: "workflow".to_string(),
            entity_id: Some("run_123".to_string()),
            event_at: "2026-05-18T10:00:00Z".to_string(),
            confidence: 1.0,
            metadata: json!({}),
        };
        let results = evaluate(&event, AFP_SUBTYPE_WORKFLOW_FAILED, &builtin_heuristics());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].heuristic_id, "workflow-failure-notify");
    }

    #[test]
    fn meeting_follow_up_requires_client_tag() {
        let event_with_tag = AfpPassiveEventContent {
            event_type: AFP_SUBTYPE_CALENDAR_EVENT_COMPLETED.to_string(),
            payload: None,
            context: None,
            source: "calendar".to_string(),
            entity_id: None,
            event_at: "2026-05-18T10:00:00Z".to_string(),
            confidence: 0.9,
            metadata: json!({ "meeting_tag": "client" }),
        };
        let event_no_tag = AfpPassiveEventContent {
            event_type: AFP_SUBTYPE_CALENDAR_EVENT_COMPLETED.to_string(),
            payload: None,
            context: None,
            source: "calendar".to_string(),
            entity_id: None,
            event_at: "2026-05-18T10:00:00Z".to_string(),
            confidence: 0.9,
            metadata: json!({ "meeting_tag": "internal" }),
        };
        let results_with = evaluate(
            &event_with_tag,
            AFP_SUBTYPE_CALENDAR_EVENT_COMPLETED,
            &builtin_heuristics(),
        );
        let results_without = evaluate(
            &event_no_tag,
            AFP_SUBTYPE_CALENDAR_EVENT_COMPLETED,
            &builtin_heuristics(),
        );

        // Both meeting-follow-up and invoice-delay should fire for client tag.
        assert_eq!(results_with.len(), 2);
        // Neither fires for internal tag.
        assert_eq!(results_without.len(), 0);
    }

    #[test]
    fn stalled_thread_requires_idle_hours_threshold() {
        let event_old = AfpPassiveEventContent {
            event_type: AFP_SUBTYPE_EMAIL_THREAD_IDLE.to_string(),
            payload: None,
            context: None,
            source: "email".to_string(),
            entity_id: None,
            event_at: "2026-05-18T10:00:00Z".to_string(),
            confidence: 1.0,
            metadata: json!({ "idle_hours": 72.0 }),
        };
        let event_fresh = AfpPassiveEventContent {
            event_type: AFP_SUBTYPE_EMAIL_THREAD_IDLE.to_string(),
            payload: None,
            context: None,
            source: "email".to_string(),
            entity_id: None,
            event_at: "2026-05-18T10:00:00Z".to_string(),
            confidence: 1.0,
            metadata: json!({ "idle_hours": 12.0 }),
        };
        let old_results = evaluate(
            &event_old,
            AFP_SUBTYPE_EMAIL_THREAD_IDLE,
            &builtin_heuristics(),
        );
        let fresh_results = evaluate(
            &event_fresh,
            AFP_SUBTYPE_EMAIL_THREAD_IDLE,
            &builtin_heuristics(),
        );
        assert_eq!(old_results.len(), 1);
        assert_eq!(fresh_results.len(), 0);
    }

    #[test]
    fn low_confidence_event_does_not_fire_heuristic() {
        let event = AfpPassiveEventContent {
            event_type: AFP_SUBTYPE_WORKFLOW_FAILED.to_string(),
            payload: None,
            context: None,
            source: "workflow".to_string(),
            entity_id: None,
            event_at: "2026-05-18T10:00:00Z".to_string(),
            confidence: 0.3,
            metadata: json!({}),
        };
        // workflow-failure-notify has threshold 0.5; 0.3 < 0.5 → no results.
        let results = evaluate(&event, AFP_SUBTYPE_WORKFLOW_FAILED, &builtin_heuristics());
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn build_suggestion_afp_enriches_stalled_thread_payload() {
        let event = AfpPassiveEventContent {
            event_type: AFP_SUBTYPE_EMAIL_THREAD_IDLE.to_string(),
            payload: None,
            context: None,
            source: "email".to_string(),
            entity_id: Some("thread_123".to_string()),
            event_at: "2026-05-18T10:00:00Z".to_string(),
            confidence: 1.0,
            metadata: json!({ "idle_hours": 72.0 }),
        };
        let results = evaluate(&event, AFP_SUBTYPE_EMAIL_THREAD_IDLE, &builtin_heuristics());
        let afp = build_suggestion_afp("user_1", "passive:user_1", &results[0], Some("msg_1"));
        let content = afp["content"].as_object().expect("content object");

        assert_eq!(
            content.get("destination_view").and_then(Value::as_str),
            Some("response_queue")
        );
        assert_eq!(
            content.get("draft_class").and_then(Value::as_str),
            Some("follow_up_draft")
        );
        assert_eq!(
            content.get("channel").and_then(Value::as_str),
            Some("email")
        );
        assert_eq!(content.get("source_count").and_then(Value::as_u64), Some(1));
        assert_eq!(
            content.get("selection_reason").and_then(Value::as_str),
            Some(
                "Thread inactivity surfaced because a prepared follow-up may prevent the conversation from stalling further."
            )
        );
        assert_eq!(
            content
                .get("approval_or_reversibility_hint")
                .and_then(Value::as_str),
            Some("Prepared suggestion still needs explicit approval before any outbound action.")
        );
        assert_eq!(
            content.get("provenance_cue").and_then(Value::as_str),
            Some("Traceable to the passive event that triggered this proactive heuristic.")
        );
        assert_eq!(
            afp["metadata"]["selection_reason"].as_str(),
            Some(
                "Thread inactivity surfaced because a prepared follow-up may prevent the conversation from stalling further."
            )
        );
        assert_eq!(
            afp["metadata"]["approval_or_reversibility_hint"].as_str(),
            Some("Prepared suggestion still needs explicit approval before any outbound action.")
        );
        assert_eq!(
            afp["metadata"]["provenance_cue"].as_str(),
            Some("Traceable to the passive event that triggered this proactive heuristic.")
        );
        assert_eq!(afp["metadata"]["source_refs"][0].as_str(), Some("msg_1"));
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["proactive_urgency"].as_str(),
            Some("medium")
        );
        assert_eq!(
            content.get("approval_policy").and_then(Value::as_str),
            Some("approval_required")
        );
        assert_eq!(
            content
                .get("strategic_policy")
                .and_then(|policy| policy.get("action"))
                .and_then(Value::as_str),
            Some("ask_approval")
        );
        assert_eq!(
            afp["metadata"]["surface_policy"].as_str(),
            Some("surface_now")
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["strategic_action"].as_str(),
            Some("ask_approval")
        );
    }

    #[test]
    fn apply_proactive_autonomy_to_suggestion_value_updates_content_and_metadata() {
        let event = AfpPassiveEventContent {
            event_type: AFP_SUBTYPE_WORKFLOW_FAILED.to_string(),
            payload: None,
            context: None,
            source: "workflow".to_string(),
            entity_id: Some("run_123".to_string()),
            event_at: "2026-05-18T10:00:00Z".to_string(),
            confidence: 1.0,
            metadata: json!({}),
        };
        let results = evaluate(&event, AFP_SUBTYPE_WORKFLOW_FAILED, &builtin_heuristics());
        let mut afp = build_suggestion_afp("user_1", "passive:user_1", &results[0], Some("msg_1"));
        let autonomy_tier = ProactiveAutonomyTier::NotifyThenAct;
        let autonomy_decision = autonomy_decision_for_proactive_enum(autonomy_tier);

        apply_proactive_autonomy_to_suggestion_value(
            &mut afp,
            autonomy_tier.as_str(),
            &autonomy_decision,
        );

        assert_eq!(
            afp["content"]["autonomy_tier"].as_str(),
            Some(autonomy_tier.as_str())
        );
        assert_eq!(
            afp["content"]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("suggest_with_artifact")
        );
        assert_eq!(
            afp["metadata"]["autonomy_tier"].as_str(),
            Some(autonomy_tier.as_str())
        );
        assert_eq!(
            afp["metadata"]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("suggest_with_artifact")
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["autonomy_tier"].as_str(),
            Some(autonomy_tier.as_str())
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["autonomy_level"].as_str(),
            Some("suggest_with_artifact")
        );
    }

    #[test]
    fn workflow_failure_suggestion_routes_to_workflows() {
        let event = AfpPassiveEventContent {
            event_type: AFP_SUBTYPE_WORKFLOW_FAILED.to_string(),
            payload: None,
            context: None,
            source: "workflow".to_string(),
            entity_id: Some("run_123".to_string()),
            event_at: "2026-05-18T10:00:00Z".to_string(),
            confidence: 1.0,
            metadata: json!({}),
        };
        let results = evaluate(&event, AFP_SUBTYPE_WORKFLOW_FAILED, &builtin_heuristics());
        assert_eq!(
            results[0].suggestion.destination_view.as_deref(),
            Some("workflows")
        );
    }

    #[test]
    fn high_confidence_unsourced_suggestion_is_deferred_in_afp_policy() {
        let result = EvaluationResult {
            heuristic_id: "generic-high-confidence".to_string(),
            suggestion: AfpProactiveSuggestionContent {
                heuristic_id: "generic-high-confidence".to_string(),
                confidence: 0.95,
                urgency: "medium".to_string(),
                action_label: "Review possible next step".to_string(),
                description: "A possible next step is available.".to_string(),
                ..Default::default()
            },
        };

        let afp = build_suggestion_afp("user_1", "passive:user_1", &result, None);

        assert_eq!(afp["content"]["surface_policy"].as_str(), Some("defer"));
        assert_eq!(
            afp["content"]["strategic_policy"]["action"].as_str(),
            Some("defer")
        );
        assert_eq!(afp["metadata"]["surface_policy"].as_str(), Some("defer"));
    }
}
