/*
 * @module-id: rust.background-watcher
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

// Background Watcher daemon contract.
//
// The Background Watcher is a considerate, proactive, privacy-first background
// sub-agent that quietly manages everyday life aspects for users â€” the elderly,
// disabled individuals, housewives, students, and busy parents.
//
// Role distinction (do not conflate with the Knowledge Curator):
//   Knowledge Curator  â†’ retrospective librarian: indexes the past, builds
//                        backlinks, knowledge cards, and supertags.
//   Background Watcher â†’ proactive life assistant: anticipates the future,
//                        monitors allergies/medications/shopping/nutrition/
//                        appointments/study/household needs and surfaces gentle,
//                        actionable suggestions.
//
// Operating model:
//   1. Heuristics first â€” pure pattern matching, zero LLM tokens.
//   2. Escalate to the LLM gate only when heuristics detect ambiguity or
//      high severity that requires synthesis.
//   3. All user-facing output via A2UI with `watcher_alert` / `smart_suggestion`
//      AFP messages.
//   4. Every observation stored as AFP for continuity and auditability.
//
// Nothing in this file performs I/O or async calls.  It defines the event
// contract, policy types, AFP builder helpers, and audit structures that the
// server wires together via `background_watcher_runtime.rs`.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::autonomy_policy::{
    autonomy_decision_for_smart_suggestion, autonomy_decision_for_watcher_alert,
};
use crate::message::{
    AFP_TYPE_SMART_SUGGESTION, AFP_TYPE_WATCHER_ALERT, AFP_TYPE_WATCHER_RESOLUTION_EVENT,
    AfpSmartSuggestionContent, AfpWatcherAlertContent, AfpWatcherResolutionEventContent,
};
use crate::proactive_outcome_memory::HeuristicOutcomeFeedback;
use crate::signal_scoring::UnifiedSignalScore;

// â”€â”€ Well-known category constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// New categories can be added without touching existing code â€” use plain strings
// in `AfpWatcherAlertContent.category`.

pub const CATEGORY_SHOPPING: &str = "shopping";
pub const CATEGORY_MEDICATION: &str = "medication";
pub const CATEGORY_SCHEDULE: &str = "schedule";
pub const CATEGORY_NUTRITION: &str = "nutrition";
pub const CATEGORY_STUDY: &str = "study";
pub const CATEGORY_HOUSEHOLD: &str = "household";
pub const CATEGORY_WEATHER: &str = "weather";
pub const CATEGORY_SAFETY: &str = "safety";

// â”€â”€ Severity constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub const SEVERITY_GENTLE: &str = "gentle";
pub const SEVERITY_IMPORTANT: &str = "important";
pub const SEVERITY_URGENT: &str = "urgent";

fn default_true() -> bool {
    true
}

// â”€â”€ Watcher policy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Policy constraints applied to every Background Watcher run.
/// Stored in `daemon_registrations.policy_config` as JSONB.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WatcherPolicy {
    /// Max watcher events processed per hour per user.
    pub max_events_per_hour: u32,
    /// Max LLM tokens the watcher may consume per day.
    pub max_tokens_per_day: u32,
    /// Minimum confidence required before emitting any alert (0.0â€“1.0).
    pub alert_confidence_threshold: f64,
    /// When true the watcher may apply bounded threshold tuning from recent
    /// heuristic outcome feedback.
    #[serde(default = "default_true")]
    pub auto_tune: bool,
    /// Categories the user has enabled (empty = all enabled).
    pub enabled_categories: Vec<String>,
    /// When true the watcher may escalate to the LLM gate for ambiguous events.
    pub llm_escalation_enabled: bool,
    /// Preserve E2EE â€” encrypt watcher output with the same key material as
    /// the source message.
    pub preserve_e2ee: bool,
}

impl Default for WatcherPolicy {
    fn default() -> Self {
        Self {
            max_events_per_hour: 200,
            max_tokens_per_day: 20_000,
            alert_confidence_threshold: 0.65,
            auto_tune: true,
            enabled_categories: Vec::new(),
            llm_escalation_enabled: true,
            preserve_e2ee: true,
        }
    }
}

impl WatcherPolicy {
    /// Returns true when the given category is enabled by this policy.
    /// An empty `enabled_categories` list means ALL categories are allowed.
    pub fn category_enabled(&self, category: &str) -> bool {
        self.enabled_categories.is_empty() || self.enabled_categories.iter().any(|c| c == category)
    }
}

// â”€â”€ Watcher trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// What caused the Background Watcher to wake up.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WatcherTriggerKind {
    /// A passive life event arrived (shopping list update, meal log, etc.).
    LifeEvent,
    /// Scheduled periodic scan (every N minutes).
    ScheduledScan,
    /// The user's medication log was updated.
    MedicationCheck,
    /// A shopping list was modified.
    ShoppingListUpdate,
    /// A calendar appointment is approaching.
    CalendarAlert,
    /// A study session started or a deadline is near.
    StudyAlert,
    /// Household item fell below threshold.
    HouseholdCheck,
    /// External weather data changed.
    WeatherAlert,
}

/// Input to a single Background Watcher processing run.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WatcherTrigger {
    pub run_id: String,
    pub daemon_id: String,
    pub user_id: String,
    pub trigger_kind: WatcherTriggerKind,
    /// AFP message id that caused this run (None for scheduled scans).
    pub source_message_id: Option<String>,
    /// Event subtype from the passive_event AFP message.
    pub event_subtype: Option<String>,
    pub triggered_at: String,
}

// â”€â”€ Policy pre-flight check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, PartialEq, Eq)]
pub enum WatcherPolicyOutcome {
    Allowed,
    RateLimited { reason: &'static str },
    Blocked { reason: &'static str },
}

/// Validate a watcher trigger against the user's policy before processing.
pub fn check_watcher_policy(
    policy: &WatcherPolicy,
    events_this_hour: u32,
    tokens_today: u32,
    category: &str,
) -> WatcherPolicyOutcome {
    if events_this_hour >= policy.max_events_per_hour {
        return WatcherPolicyOutcome::RateLimited {
            reason: "max_events_per_hour exceeded",
        };
    }
    if tokens_today >= policy.max_tokens_per_day {
        return WatcherPolicyOutcome::RateLimited {
            reason: "max_tokens_per_day exceeded",
        };
    }
    if !policy.category_enabled(category) {
        return WatcherPolicyOutcome::Blocked {
            reason: "category disabled by policy",
        };
    }
    WatcherPolicyOutcome::Allowed
}

/// Derive the effective confidence threshold for a watcher heuristic given
/// existing user outcome feedback. This is intentionally bounded and additive:
/// it does not mutate stored policy, and it only raises thresholds for noisy
/// heuristics when auto-tuning is enabled.
pub fn effective_alert_confidence_threshold(
    policy: &WatcherPolicy,
    feedback: Option<&HeuristicOutcomeFeedback>,
) -> f64 {
    let base = policy.alert_confidence_threshold.clamp(0.0, 1.0);
    if !policy.auto_tune {
        return base;
    }

    let Some(feedback) = feedback else {
        return base;
    };

    let acceptance_rate = feedback.acceptance_rate.clamp(0.0, 1.0);
    let mut delta = (1.0 - acceptance_rate) * 0.15;
    if feedback.scope == "family" {
        delta *= 0.8;
    }

    let upper_bound = 0.95_f64.max(base);
    (base + delta).clamp(base, upper_bound)
}

fn watcher_source_refs(source_event_id: Option<&str>) -> Vec<String> {
    source_event_id
        .map(|event_id| vec![event_id.to_string()])
        .unwrap_or_default()
}

fn watcher_alert_selection_reason(content: &AfpWatcherAlertContent) -> String {
    format!(
        "Watcher policy surfaced this {} alert because the current signal crossed the review threshold.",
        content.category
    )
}

fn watcher_alert_consequence_preview(_content: &AfpWatcherAlertContent) -> String {
    "Reviewing this alert does not execute a side effect; it keeps the watcher signal visible for judgment."
        .to_string()
}

fn watcher_provenance_cue(source_event_id: Option<&str>, heuristic_id: &str) -> String {
    if source_event_id.is_some() {
        "Traceable to the passive event that triggered this watcher heuristic.".to_string()
    } else {
        format!("Traceable to watcher heuristic {heuristic_id}.")
    }
}

fn smart_suggestion_selection_reason(_content: &AfpSmartSuggestionContent) -> String {
    "Watcher policy surfaced this suggestion because the current pattern is strong enough to prepare reviewable work now."
        .to_string()
}

fn smart_suggestion_consequence_preview(_content: &AfpSmartSuggestionContent) -> String {
    "Reviewing this suggestion does not execute a side effect; it keeps the prepared option available for judgment."
        .to_string()
}

// â”€â”€ AFP message builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `watcher_alert` AFP message JSON with embedded A2UI `views[]`.
///
/// The views array contains two components:
///   1. `insight_line` â€” the primary alert text and confidence badge.
///   2. `action_chips` â€” user-facing actions ("Keep Anyway", suggested swap, etc.).
pub fn build_watcher_alert_afp(
    owner_user_id: &str,
    thread_id: &str,
    content: &AfpWatcherAlertContent,
    action_chips: &[&str],
) -> Value {
    build_watcher_alert_afp_with_feedback(owner_user_id, thread_id, content, action_chips, None)
}

/// Build a `watcher_alert` AFP message JSON with embedded score metadata.
///
/// This variant accepts existing heuristic feedback so watcher output can carry
/// a calibrated, cross-agent score without forcing every caller to know the
/// scoring details.
pub fn build_watcher_alert_afp_with_feedback(
    owner_user_id: &str,
    thread_id: &str,
    content: &AfpWatcherAlertContent,
    action_chips: &[&str],
    feedback: Option<&HeuristicOutcomeFeedback>,
) -> Value {
    let confidence_label = confidence_label(content.confidence);
    let primary = content.message.clone();
    let secondary = content.suggestion.clone().unwrap_or_default();
    let signal_score = UnifiedSignalScore::from_feedback(content.confidence, feedback);
    let selection_reason = watcher_alert_selection_reason(content);
    let autonomy_decision =
        autonomy_decision_for_watcher_alert(content.severity.as_str(), selection_reason.clone());
    let consequence_preview = watcher_alert_consequence_preview(content);
    let provenance_cue =
        watcher_provenance_cue(content.source_event_id.as_deref(), &content.heuristic_id);
    let source_refs = watcher_source_refs(content.source_event_id.as_deref());
    let source_count = source_refs.len();

    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "background_watcher",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_WATCHER_ALERT,
        "subtype": content.category,
        "content": serde_json::to_value(content).unwrap_or_default(),
        "views": [
            {
                "format": "insight_line",
                "props": {
                    "primary": primary,
                    "secondary": secondary,
                    "confidence": confidence_label,
                    "severity": content.severity,
                    "category": content.category,
                    "icon": category_icon(&content.category),
                    "kind": "watcher_alert",
                    "urgency": content.severity,
                    "selection_reason": selection_reason,
                    "consequence_preview": consequence_preview,
                    "provenance_cue": provenance_cue,
                    "source_refs": source_refs,
                    "source_count": source_count,
                }
            },
            {
                "format": "action_chips",
                "props": {
                    "actions": action_chips,
                    "selection_reason": selection_reason,
                    "consequence_preview": consequence_preview,
                    "provenance_cue": provenance_cue,
                    "source_refs": source_refs,
                    "source_count": source_count,
                }
            }
        ],
        "metadata": {
            "store": true,
            "proactive": true,
            "watcher": true,
            "heuristic_id": content.heuristic_id,
            "autonomy_decision": autonomy_decision,
            "selection_reason": selection_reason,
            "approval_or_reversibility_hint": consequence_preview,
            "provenance_cue": provenance_cue,
            "source_refs": source_refs,
            "source_count": source_count,
            "entity_id": content.entity_id,
            "source_event_id": content.source_event_id,
            "signal_score_raw": signal_score.raw,
            "signal_score_calibrated": signal_score.calibrated,
            "signal_tier": signal_score.tier.as_str(),
            "searchable_metadata": {
                "heuristic_id": content.heuristic_id,
                "signal_tier": signal_score.tier.as_str(),
                "watcher_category": content.category,
                "watcher_severity": content.severity,
                "source_event_id": content.source_event_id,
                "watcher_entity_id": content.entity_id,
            },
        },
        "store_in_relational": true,
    })
}

/// Build a `smart_suggestion` AFP message JSON with A2UI `views[]`.
pub fn build_smart_suggestion_afp(
    owner_user_id: &str,
    thread_id: &str,
    content: &AfpSmartSuggestionContent,
) -> Value {
    build_smart_suggestion_afp_with_feedback(owner_user_id, thread_id, content, None)
}

pub fn build_smart_suggestion_afp_with_feedback(
    owner_user_id: &str,
    thread_id: &str,
    content: &AfpSmartSuggestionContent,
    feedback: Option<&HeuristicOutcomeFeedback>,
) -> Value {
    let confidence_label = confidence_label(content.confidence);
    let signal_score = UnifiedSignalScore::from_feedback(content.confidence, feedback);
    let selection_reason = smart_suggestion_selection_reason(content);
    let autonomy_decision =
        autonomy_decision_for_smart_suggestion(content.confidence, selection_reason.clone());
    let consequence_preview = smart_suggestion_consequence_preview(content);
    let provenance_cue =
        watcher_provenance_cue(content.source_event_id.as_deref(), &content.heuristic_id);
    let source_refs = watcher_source_refs(content.source_event_id.as_deref());
    let source_count = source_refs.len();
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "background_watcher",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_SMART_SUGGESTION,
        "subtype": content.category,
        "content": serde_json::to_value(content).unwrap_or_default(),
        "views": [
            {
                "format": "callout",
                "props": {
                    "title": content.title,
                    "body": content.body,
                    "confidence": confidence_label,
                    "category": content.category,
                    "icon": category_icon(&content.category),
                    "selection_reason": selection_reason,
                    "consequence_preview": consequence_preview,
                    "provenance_cue": provenance_cue,
                    "source_refs": source_refs,
                    "source_count": source_count,
                }
            },
            {
                "format": "action_chips",
                "props": {
                    "actions": content.action_chips,
                    "selection_reason": selection_reason,
                    "consequence_preview": consequence_preview,
                    "provenance_cue": provenance_cue,
                    "source_refs": source_refs,
                    "source_count": source_count,
                }
            }
        ],
        "metadata": {
            "store": true,
            "proactive": true,
            "watcher": true,
            "heuristic_id": content.heuristic_id,
            "autonomy_decision": autonomy_decision,
            "selection_reason": selection_reason,
            "approval_or_reversibility_hint": consequence_preview,
            "provenance_cue": provenance_cue,
            "source_refs": source_refs,
            "source_count": source_count,
            "source_event_id": content.source_event_id,
            "signal_score_raw": signal_score.raw,
            "signal_score_calibrated": signal_score.calibrated,
            "signal_tier": signal_score.tier.as_str(),
            "searchable_metadata": {
                "heuristic_id": content.heuristic_id,
                "signal_tier": signal_score.tier.as_str(),
                "watcher_category": content.category,
                "source_event_id": content.source_event_id,
            },
        },
        "store_in_relational": true,
    })
}

/// Build an AFP-native watcher resolution event.
///
/// This is the durable coordination artifact for downstream runtime consumers:
/// acceptance, dismissal, snooze, or completion of a watcher-originated message
/// can be replayed, indexed, and consumed without relying on hidden bus state.
pub fn build_watcher_resolution_event_afp(
    owner_user_id: &str,
    thread_id: &str,
    content: &AfpWatcherResolutionEventContent,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "background_watcher",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_WATCHER_RESOLUTION_EVENT,
        "subtype": format!("watcher_resolution:{}", content.resolution_kind),
        "content": serde_json::to_value(content).unwrap_or_default(),
        "metadata": {
            "store": true,
            "watcher": true,
            "coordination_event": true,
            "heuristic_id": content.heuristic_id,
            "searchable_metadata": {
                "heuristic_id": content.heuristic_id,
                "watcher_category": content.category,
                "watcher_resolution_kind": content.resolution_kind,
                "resolved_message_id": content.resolved_message_id,
                "watcher_severity": content.severity,
                "source_event_id": content.source_event_id,
            },
        },
        "store_in_relational": true,
    })
}

fn confidence_label(confidence: f64) -> &'static str {
    if confidence >= 0.9 {
        "high"
    } else if confidence >= 0.7 {
        "medium"
    } else {
        "low"
    }
}

fn category_icon(category: &str) -> &'static str {
    match category {
        CATEGORY_SHOPPING => "ðŸ›’",
        CATEGORY_MEDICATION => "ðŸ’Š",
        CATEGORY_SCHEDULE => "ðŸ“…",
        CATEGORY_NUTRITION => "ðŸ¥—",
        CATEGORY_STUDY => "ðŸ“š",
        CATEGORY_HOUSEHOLD => "ðŸ ",
        CATEGORY_WEATHER => "ðŸŒ¤",
        CATEGORY_SAFETY => "ðŸ›¡",
        _ => "ðŸ’¡",
    }
}

// â”€â”€ Run audit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Audit record for a single Background Watcher processing run.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WatcherRunAudit {
    pub run_id: String,
    pub user_id: String,
    pub daemon_id: String,
    pub source_message_id: Option<String>,
    pub trigger_kind: WatcherTriggerKind,
    pub alerts_emitted: u32,
    pub suggestions_emitted: u32,
    pub heuristics_evaluated: u32,
    pub skipped_by_policy: u32,
    pub tokens_used: u32,
    pub duration_ms: Option<u32>,
    pub status: WatcherRunStatus,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WatcherRunStatus {
    Completed,
    Failed,
    Skipped,
    Partial,
}

// â”€â”€ Example A2UI output builders (test fixtures only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a ready-to-emit watcher_alert for an allergy conflict detected in a
/// shopping list (example: grapefruit juice added, user is on atorvastatin).
#[cfg(test)]
pub fn example_allergy_alert(
    user_id: &str,
    thread_id: &str,
    flagged_item: &str,
    safe_alternative: &str,
    heuristic_id: &str,
) -> Value {
    let content = AfpWatcherAlertContent {
        category: CATEGORY_SHOPPING.to_string(),
        severity: SEVERITY_IMPORTANT.to_string(),
        message: format!(
            "I noticed you added {flagged_item} to your shopping list. \
             This may interact with one of your medications."
        ),
        suggestion: Some(format!("{safe_alternative} is a safe alternative.")),
        confidence: 0.94,
        heuristic_id: heuristic_id.to_string(),
        source_event_id: None,
        ..Default::default()
    };
    build_watcher_alert_afp(
        user_id,
        thread_id,
        &content,
        &[
            "Keep Anyway",
            &format!("Swap to {safe_alternative}"),
            "Learn More",
        ],
    )
}

/// Build a ready-to-emit watcher_alert for a medication reminder.
#[cfg(test)]
pub fn example_medication_reminder(
    user_id: &str,
    thread_id: &str,
    medication_name: &str,
    scheduled_time: &str,
    heuristic_id: &str,
) -> Value {
    let content = AfpWatcherAlertContent {
        category: CATEGORY_MEDICATION.to_string(),
        severity: SEVERITY_GENTLE.to_string(),
        message: format!(
            "Just a gentle reminder â€” it's nearly time for your {medication_name} \
             (scheduled {scheduled_time})."
        ),
        suggestion: Some("Take it with a full glass of water.".to_string()),
        confidence: 0.97,
        heuristic_id: heuristic_id.to_string(),
        source_event_id: None,
        ..Default::default()
    };
    build_watcher_alert_afp(
        user_id,
        thread_id,
        &content,
        &["Mark as Taken", "Remind me in 15 min", "Skip Today"],
    )
}

/// Build a study break suggestion.
#[cfg(test)]
pub fn example_study_break(
    user_id: &str,
    thread_id: &str,
    study_duration_minutes: u32,
    heuristic_id: &str,
) -> Value {
    let content = AfpSmartSuggestionContent {
        category: CATEGORY_STUDY.to_string(),
        title: "Time for a short break".to_string(),
        body: format!(
            "You've been studying for {study_duration_minutes} minutes. \
             A 5-minute break can improve focus and retention."
        ),
        confidence: 0.88,
        heuristic_id: heuristic_id.to_string(),
        action_chips: vec![
            "Take a 5-min break".to_string(),
            "Keep studying".to_string(),
            "Set a 25-min timer".to_string(),
        ],
        source_event_id: None,
    };
    build_smart_suggestion_afp(user_id, thread_id, &content)
}

/// Build a shopping suggestion for a regularly purchased item that is running low.
#[cfg(test)]
pub fn example_shopping_restock(
    user_id: &str,
    thread_id: &str,
    item_name: &str,
    heuristic_id: &str,
) -> Value {
    let content = AfpSmartSuggestionContent {
        category: CATEGORY_SHOPPING.to_string(),
        title: format!("{item_name} is running low"),
        body: format!(
            "Based on your usual usage, you'll likely need {item_name} soon. \
             Add it to your shopping list?"
        ),
        confidence: 0.81,
        heuristic_id: heuristic_id.to_string(),
        action_chips: vec![
            "Add to List".to_string(),
            "Skip This Week".to_string(),
            "Don't Remind Again".to_string(),
        ],
        source_event_id: None,
    };
    build_smart_suggestion_afp(user_id, thread_id, &content)
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proactive_outcome_memory::HeuristicOutcomeFeedback;

    fn feedback(status: &str, acceptance_rate: f64) -> HeuristicOutcomeFeedback {
        HeuristicOutcomeFeedback {
            heuristic_id: "med-reminder-morning".to_string(),
            total: 10,
            accepted: (acceptance_rate * 10.0).round() as i64,
            acceptance_rate,
            status: status.to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 3,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }
    }

    #[test]
    fn watcher_policy_default_is_conservative() {
        let policy = WatcherPolicy::default();
        assert!(policy.preserve_e2ee);
        assert!(policy.alert_confidence_threshold >= 0.5);
        assert!(policy.max_events_per_hour <= 500);
    }

    #[test]
    fn watcher_policy_all_categories_enabled_when_list_empty() {
        let policy = WatcherPolicy::default();
        assert!(policy.category_enabled(CATEGORY_MEDICATION));
        assert!(policy.category_enabled(CATEGORY_SHOPPING));
        assert!(policy.category_enabled("custom_category"));
    }

    #[test]
    fn watcher_policy_respects_enabled_category_list() {
        let policy = WatcherPolicy {
            enabled_categories: vec![CATEGORY_MEDICATION.to_string()],
            ..WatcherPolicy::default()
        };
        assert!(policy.category_enabled(CATEGORY_MEDICATION));
        assert!(!policy.category_enabled(CATEGORY_SHOPPING));
    }

    #[test]
    fn check_watcher_policy_rate_limits() {
        let policy = WatcherPolicy::default();
        let result = check_watcher_policy(&policy, 300, 0, CATEGORY_MEDICATION);
        assert_eq!(
            result,
            WatcherPolicyOutcome::RateLimited {
                reason: "max_events_per_hour exceeded"
            }
        );
    }

    #[test]
    fn check_watcher_policy_allows_normal_run() {
        let policy = WatcherPolicy::default();
        let result = check_watcher_policy(&policy, 0, 0, CATEGORY_SHOPPING);
        assert_eq!(result, WatcherPolicyOutcome::Allowed);
    }

    #[test]
    fn build_watcher_alert_afp_has_required_fields() {
        let content = AfpWatcherAlertContent {
            category: CATEGORY_MEDICATION.to_string(),
            severity: SEVERITY_GENTLE.to_string(),
            message: "Time for your medication.".to_string(),
            suggestion: Some("Take with water.".to_string()),
            confidence: 0.95,
            heuristic_id: "med-reminder-morning".to_string(),
            entity_id: None,
            source_event_id: None,
        };
        let afp = build_watcher_alert_afp("user_01", "thread_01", &content, &["Mark as Taken"]);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_WATCHER_ALERT));
        assert_eq!(afp["from"].as_str(), Some("background_watcher"));
        assert!(afp["views"].is_array());
        let views = afp["views"].as_array().unwrap();
        assert_eq!(views.len(), 2);
        assert_eq!(views[0]["format"].as_str(), Some("insight_line"));
        assert_eq!(views[1]["format"].as_str(), Some("action_chips"));
        assert_eq!(
            afp["metadata"]["signal_tier"].as_str(),
            Some("critical"),
            "0.95 raw confidence should surface as critical by default"
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["watcher_category"].as_str(),
            Some(CATEGORY_MEDICATION)
        );
        assert_eq!(
            afp["metadata"]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("suggest_with_artifact")
        );
        assert_eq!(
            afp["metadata"]["approval_or_reversibility_hint"].as_str(),
            Some(
                "Reviewing this alert does not execute a side effect; it keeps the watcher signal visible for judgment."
            )
        );
    }

    #[test]
    fn build_watcher_alert_afp_with_feedback_embeds_calibrated_score_metadata() {
        let content = AfpWatcherAlertContent {
            category: CATEGORY_MEDICATION.to_string(),
            severity: SEVERITY_GENTLE.to_string(),
            message: "Time for your medication.".to_string(),
            suggestion: Some("Take with water.".to_string()),
            confidence: 0.70,
            heuristic_id: "med-reminder-morning".to_string(),
            entity_id: None,
            source_event_id: None,
        };
        let afp = build_watcher_alert_afp_with_feedback(
            "user_01",
            "thread_01",
            &content,
            &["Mark as Taken"],
            Some(&feedback("suppressed", 0.10)),
        );
        let raw = afp["metadata"]["signal_score_raw"].as_f64().unwrap();
        let calibrated = afp["metadata"]["signal_score_calibrated"].as_f64().unwrap();
        assert_eq!(raw, 0.70);
        assert!(calibrated < raw);
        assert_eq!(afp["metadata"]["signal_tier"].as_str(), Some("ambient"));
        assert_eq!(
            afp["metadata"]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("suggest_with_artifact")
        );
    }

    #[test]
    fn build_smart_suggestion_afp_with_feedback_embeds_score_metadata() {
        let content = AfpSmartSuggestionContent {
            category: CATEGORY_STUDY.to_string(),
            title: "Take a break".to_string(),
            body: "You've been studying for 45 minutes.".to_string(),
            confidence: 0.68,
            heuristic_id: "study-pomodoro-break".to_string(),
            action_chips: vec!["Break now".to_string(), "Keep going".to_string()],
            source_event_id: None,
        };
        let afp = build_smart_suggestion_afp_with_feedback(
            "user_01",
            "thread_01",
            &content,
            Some(&feedback("reinforced", 0.9)),
        );
        assert_eq!(afp["metadata"]["signal_score_raw"].as_f64(), Some(0.68));
        assert!(
            afp["metadata"]["signal_score_calibrated"]
                .as_f64()
                .unwrap_or_default()
                > 0.68
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["signal_tier"].as_str(),
            Some("urgent")
        );
        assert_eq!(
            afp["metadata"]["autonomy_decision"]["autonomy_level"].as_str(),
            Some("suggest_with_artifact")
        );
    }

    #[test]
    fn effective_alert_confidence_threshold_raises_when_auto_tune_enabled() {
        let policy = WatcherPolicy::default();
        let adjusted =
            effective_alert_confidence_threshold(&policy, Some(&feedback("suppressed", 0.10)));
        assert!(adjusted > policy.alert_confidence_threshold);
    }

    #[test]
    fn effective_alert_confidence_threshold_stays_base_when_auto_tune_disabled() {
        let policy = WatcherPolicy {
            auto_tune: false,
            ..WatcherPolicy::default()
        };
        let adjusted =
            effective_alert_confidence_threshold(&policy, Some(&feedback("suppressed", 0.10)));
        assert_eq!(adjusted, policy.alert_confidence_threshold);
    }

    #[test]
    fn example_allergy_alert_is_valid_afp() {
        let afp = example_allergy_alert(
            "user_01",
            "thread_01",
            "grapefruit juice",
            "orange juice",
            "allergy-grapefruit-statin",
        );
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_WATCHER_ALERT));
        let chips = &afp["views"][1]["props"]["actions"];
        assert!(chips.as_array().unwrap().len() >= 2);
    }

    #[test]
    fn build_smart_suggestion_afp_has_callout_and_chips() {
        let content = AfpSmartSuggestionContent {
            category: CATEGORY_STUDY.to_string(),
            title: "Take a break".to_string(),
            body: "You've been studying for 45 minutes.".to_string(),
            confidence: 0.88,
            heuristic_id: "study-pomodoro-break".to_string(),
            action_chips: vec!["Break now".to_string(), "Keep going".to_string()],
            source_event_id: None,
        };
        let afp = build_smart_suggestion_afp("user_01", "thread_01", &content);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_SMART_SUGGESTION));
        let views = afp["views"].as_array().unwrap();
        assert_eq!(views[0]["format"].as_str(), Some("callout"));
        assert_eq!(views[1]["format"].as_str(), Some("action_chips"));
        assert_eq!(
            afp["metadata"]["selection_reason"].as_str(),
            Some(
                "Watcher policy surfaced this suggestion because the current pattern is strong enough to prepare reviewable work now."
            )
        );
    }

    #[test]
    fn watcher_builders_preserve_shared_provenance_fields_when_source_event_exists() {
        let alert = AfpWatcherAlertContent {
            category: CATEGORY_SHOPPING.to_string(),
            severity: SEVERITY_IMPORTANT.to_string(),
            message: "Milk supply is running low.".to_string(),
            suggestion: Some("Add milk to the next grocery order.".to_string()),
            confidence: 0.83,
            heuristic_id: "shopping-restock-milk".to_string(),
            entity_id: Some("pantry:milk".to_string()),
            source_event_id: Some("evt_123".to_string()),
        };
        let suggestion = AfpSmartSuggestionContent {
            category: CATEGORY_STUDY.to_string(),
            title: "Prepare a short reset".to_string(),
            body: "A five-minute reset now may improve your next block.".to_string(),
            confidence: 0.76,
            heuristic_id: "study-reset".to_string(),
            action_chips: vec!["Take break".to_string()],
            source_event_id: Some("evt_123".to_string()),
        };

        let alert_afp = build_watcher_alert_afp("user_01", "thread_01", &alert, &["Add item"]);
        let suggestion_afp = build_smart_suggestion_afp("user_01", "thread_01", &suggestion);

        assert_eq!(
            alert_afp["metadata"]["source_refs"][0].as_str(),
            Some("evt_123")
        );
        assert_eq!(
            alert_afp["metadata"]["provenance_cue"].as_str(),
            Some("Traceable to the passive event that triggered this watcher heuristic.")
        );
        assert_eq!(
            alert_afp["views"][0]["props"]["source_refs"][0].as_str(),
            Some("evt_123")
        );
        assert_eq!(
            suggestion_afp["metadata"]["source_refs"][0].as_str(),
            Some("evt_123")
        );
        assert_eq!(
            suggestion_afp["metadata"]["provenance_cue"].as_str(),
            Some("Traceable to the passive event that triggered this watcher heuristic.")
        );
    }

    #[test]
    fn build_watcher_resolution_event_afp_has_durable_coordination_metadata() {
        let content = AfpWatcherResolutionEventContent {
            resolution_kind: "dismissed".to_string(),
            resolved_message_id: "01JRESOLVEDWATCHERALERT".to_string(),
            heuristic_id: "shopping-restock-milk".to_string(),
            category: CATEGORY_SHOPPING.to_string(),
            severity: Some(SEVERITY_GENTLE.to_string()),
            source_event_id: Some("evt_123".to_string()),
            note: Some("Not needed this week".to_string()),
            snoozed_until: None,
        };

        let afp = build_watcher_resolution_event_afp("user_01", "thread_01", &content);
        assert_eq!(
            afp["type"].as_str(),
            Some(AFP_TYPE_WATCHER_RESOLUTION_EVENT)
        );
        assert_eq!(
            afp["subtype"].as_str(),
            Some("watcher_resolution:dismissed")
        );
        assert_eq!(afp["metadata"]["coordination_event"].as_bool(), Some(true));
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["watcher_resolution_kind"].as_str(),
            Some("dismissed")
        );
        assert_eq!(
            afp["metadata"]["searchable_metadata"]["resolved_message_id"].as_str(),
            Some("01JRESOLVEDWATCHERALERT")
        );
    }
}
