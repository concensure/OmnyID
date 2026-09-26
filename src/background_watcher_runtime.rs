/// Background Watcher daemon runtime — the main watcher loop.
///
/// This module wires together:
///   - Passive life events ingested from ElectricSQL change-streams
///   - The heuristic evaluation engine (reused from `proactive_engine`)
///   - Life-care heuristic packs from `background_watcher_heuristics`
///   - AFP builder helpers from `background_watcher`
///   - Watcher audit records written to `watcher_run_audit`
///
/// Operating model (token-budget first):
///   1. Receive a `WatcherTrigger` (life event or scheduled scan).
///   2. Load the user's `UserLifeProfile` and `DailyContextSnapshot` from AFP.
///   3. Run ALL enabled heuristics against the event — zero LLM tokens.
///   4. For each firing heuristic, build a `watcher_alert` or `smart_suggestion`
///      AFP message with embedded A2UI `views[]`.
///   5. If no heuristic fires but the event has high ambiguity and LLM escalation
///      is enabled, escalate via the LLM gate (not yet implemented; stub present).
///   6. Write a `WatcherRunAudit` record for observability.
///
/// The watcher runs every 5 minutes via the daemon heartbeat loop, and is also
/// triggered immediately on life-event passive messages via ElectricSQL shapes.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    background_watcher::{
        CATEGORY_MEDICATION, CATEGORY_SAFETY, CATEGORY_SHOPPING, SEVERITY_IMPORTANT,
        SEVERITY_URGENT, WatcherPolicy, WatcherPolicyOutcome, WatcherRunAudit, WatcherRunStatus,
        WatcherTrigger, build_smart_suggestion_afp_with_feedback, build_watcher_alert_afp,
        build_watcher_alert_afp_with_feedback, check_watcher_policy,
        effective_alert_confidence_threshold,
    },
    background_watcher_empathy::{
        decorate_watcher_message, decorate_watcher_message_with_feedback,
    },
    background_watcher_heuristics::WatcherHeuristicIndex,
    calendar_event_profile::calendar_event_profile_from_fields,
    message::{
        AFP_TYPE_DAILY_CONTEXT, AFP_TYPE_USER_LIFE_PROFILE, AfpPassiveEventContent,
        AfpSmartSuggestionContent, AfpWatcherAlertContent,
    },
    model_broker::{ModelAssignment, select_model_for_node},
    personal_event_ingestion::plan_passive_event_background_artifact,
    proactive_outcome_memory::HeuristicOutcomeFeedback,
    simulator_loop::{
        SimulatorExecutionResult, simulate_snapshot_projection_for_watcher,
        simulate_snapshot_projection_with_policy,
    },
    simulator_rollout::{SimulatorRolloutPolicy, SimulatorRolloutSurface},
    state_snapshot::{
        StateSnapshotContent, StateSnapshotCriticalChange, StateSnapshotResponseItem,
        StateSnapshotWatcherSignal,
    },
};

// ── Watcher processing result ─────────────────────────────────────────────────

pub struct WatcherRunResult {
    pub run_id: String,
    pub alerts: Vec<Value>,
    pub suggestions: Vec<Value>,
    pub automation_artifacts: Vec<Value>,
    pub audit: WatcherRunAudit,
    /// Model selected for any LLM escalation in this run (always Haiku for daemon nodes).
    pub model_assignment: ModelAssignment,
    pub simulator_actionable: bool,
    pub simulator_summary: Option<String>,
}

// ── Life context loaded from AFP ledger ───────────────────────────────────────

/// Minimal projection of the user's life profile needed for heuristic evaluation.
#[derive(Debug, Clone, Default)]
pub struct LiveLifeContext {
    pub allergies: Vec<String>,
    pub medications: Vec<String>,
    pub dietary_preferences: Vec<String>,
    pub sensitivities: Vec<String>,
    /// Enabled watcher pack IDs (empty = all packs active).
    pub enabled_packs: Vec<String>,
}

impl LiveLifeContext {
    /// Build from an AFP `user_life_profile` message content JSON.
    pub fn from_afp_content(content: &Value) -> Self {
        Self {
            allergies: json_string_array(content, "allergies"),
            medications: json_string_array(content, "medications"),
            dietary_preferences: json_string_array(content, "dietary_preferences"),
            sensitivities: json_string_array(content, "sensitivities"),
            enabled_packs: Vec::new(),
        }
    }

    /// Returns `true` if the given item name contains any known allergen.
    pub fn item_is_allergen(&self, item_name: &str) -> bool {
        let lower = item_name.to_lowercase();
        self.allergies
            .iter()
            .any(|a| lower.contains(&a.to_lowercase()))
    }

    /// Returns `true` if the user is on a statin medication.
    pub fn on_statin(&self) -> bool {
        self.medications.iter().any(|m| {
            let lower = m.to_lowercase();
            lower.contains("atorvastatin")
                || lower.contains("simvastatin")
                || lower.contains("rosuvastatin")
                || lower.contains("lovastatin")
                || lower.contains("pravastatin")
        })
    }
}

// ── Main watcher processing function ─────────────────────────────────────────

/// Process a single watcher trigger: evaluate heuristics, build AFP messages,
/// return audit-ready result.
///
/// `index` is built once at daemon startup via `build_watcher_index()` and
/// shared across all calls — O(1) dispatch + zero condition-string parsing.
/// `events_this_hour` and `tokens_today` are provided by the caller from DB
/// counters so this function stays pure and testable.
pub fn process_watcher_trigger(
    trigger: &WatcherTrigger,
    event: &AfpPassiveEventContent,
    event_subtype: &str,
    policy: &WatcherPolicy,
    index: &WatcherHeuristicIndex,
    events_this_hour: u32,
    tokens_today: u32,
) -> WatcherRunResult {
    process_watcher_trigger_with_outcome_feedback(
        trigger,
        event,
        event_subtype,
        policy,
        index,
        events_this_hour,
        tokens_today,
        &[],
    )
}

pub fn process_watcher_trigger_with_personal_automation(
    trigger: &WatcherTrigger,
    event: &AfpPassiveEventContent,
    event_subtype: &str,
    policy: &WatcherPolicy,
    index: &WatcherHeuristicIndex,
    events_this_hour: u32,
    tokens_today: u32,
    connected_capabilities: &[crate::db::UserConnectedCapabilityRecord],
    priority_rules: &Value,
) -> WatcherRunResult {
    let mut result = process_watcher_trigger(
        trigger,
        event,
        event_subtype,
        policy,
        index,
        events_this_hour,
        tokens_today,
    );

    if let Some(source_ref) = trigger.source_message_id.as_deref() {
        if let Some(artifact) = plan_passive_event_background_artifact(
            &trigger.user_id,
            &format!("watcher:{}", trigger.user_id),
            source_ref,
            event,
            event_subtype,
            connected_capabilities,
            priority_rules,
        ) {
            result.automation_artifacts.push(artifact);
        }
    }

    result
}

pub fn process_watcher_trigger_with_outcome_feedback(
    trigger: &WatcherTrigger,
    event: &AfpPassiveEventContent,
    event_subtype: &str,
    policy: &WatcherPolicy,
    index: &WatcherHeuristicIndex,
    events_this_hour: u32,
    tokens_today: u32,
    outcome_feedback: &[HeuristicOutcomeFeedback],
) -> WatcherRunResult {
    let started_at = Utc::now();
    // Select model upfront for any LLM escalation this run may need.
    // Daemon nodes always route to Haiku; remaining budget is daily token allowance minus used.
    let remaining_budget_micro_cents =
        (policy.max_tokens_per_day.saturating_sub(tokens_today) as i64).saturating_mul(25); // 25 µ¢/1k tokens (haiku rate)
    let model_assignment = select_model_for_node(
        "daemon",
        "background_watcher",
        512, // typical escalation token estimate
        remaining_budget_micro_cents,
        false, // daemon nodes never request premium model
    );

    let mut alerts: Vec<Value> = Vec::new();
    let mut suggestions: Vec<Value> = Vec::new();
    let mut skipped_by_policy: u32 = 0;

    // Canonicalise event_subtype: strip whitespace and normalise to lowercase so that
    // mixed-case or padded subtypes ("Email_Incoming", " email_incoming ") still match
    // heuristic bucket keys and the email LLM gate condition.
    let event_subtype = event_subtype.trim().to_lowercase();
    let event_subtype = event_subtype.as_str();

    // O(1) bucket lookup + pre-compiled condition evaluation.
    let evaluation_results = index.evaluate(event, event_subtype);
    let heuristics_evaluated = index.bucket_len(event_subtype) as u32;

    // Deduplicate by heuristic_id: a bucket that registers the same heuristic twice
    // (e.g. via both a pack and a direct registration) would otherwise emit duplicate
    // alerts for a single event.
    let mut seen_heuristic_ids = std::collections::HashSet::new();
    let evaluation_results: Vec<_> = evaluation_results
        .into_iter()
        .filter(|r| seen_heuristic_ids.insert(r.heuristic_id.clone()))
        .collect();

    // Build feedback index once before the loop so each heuristic lookup is O(1)
    // rather than O(feedback_len) per heuristic.
    let feedback_by_id: std::collections::HashMap<&str, &HeuristicOutcomeFeedback> =
        outcome_feedback
            .iter()
            .map(|f| (f.heuristic_id.as_str(), f))
            .collect();

    let thread_id = format!("watcher:{}", &trigger.user_id);

    for result in &evaluation_results {
        // Derive category from heuristic id prefix.
        let category = category_from_heuristic_id(&result.heuristic_id);

        // Policy gate — skip if category disabled or rate-limited.
        match check_watcher_policy(policy, events_this_hour, tokens_today, &category) {
            WatcherPolicyOutcome::Allowed => {}
            _ => {
                skipped_by_policy += 1;
                continue;
            }
        }

        let heuristic_feedback = feedback_by_id.get(result.heuristic_id.as_str()).copied();

        // Skip if below policy confidence threshold.
        if result.suggestion.confidence
            < effective_alert_confidence_threshold(policy, heuristic_feedback)
        {
            continue;
        }

        // Decide alert vs suggestion based on urgency.
        let urgency = &result.suggestion.urgency;
        if urgency == SEVERITY_IMPORTANT || urgency == SEVERITY_URGENT {
            let content = AfpWatcherAlertContent {
                category: category.clone(),
                severity: urgency.clone(),
                message: result.suggestion.description.clone(),
                suggestion: None,
                confidence: result.suggestion.confidence,
                heuristic_id: result.heuristic_id.clone(),
                source_event_id: trigger.source_message_id.clone(),
                ..Default::default()
            };
            let default_chips = default_action_chips(urgency, &category);
            let chip_refs: Vec<&str> = default_chips.iter().map(String::as_str).collect();
            alerts.push(decorate_watcher_message_with_feedback(
                build_watcher_alert_afp_with_feedback(
                    &trigger.user_id,
                    &thread_id,
                    &content,
                    &chip_refs,
                    heuristic_feedback,
                ),
                &category,
                urgency,
                result.suggestion.confidence,
                heuristic_feedback,
            ));
        } else {
            let content = AfpSmartSuggestionContent {
                category: category.clone(),
                title: result.suggestion.action_label.clone(),
                body: result.suggestion.description.clone(),
                confidence: result.suggestion.confidence,
                heuristic_id: result.heuristic_id.clone(),
                action_chips: default_action_chips(urgency, &category),
                source_event_id: trigger.source_message_id.clone(),
            };
            suggestions.push(decorate_watcher_message_with_feedback(
                build_smart_suggestion_afp_with_feedback(
                    &trigger.user_id,
                    &thread_id,
                    &content,
                    heuristic_feedback,
                ),
                &category,
                urgency,
                result.suggestion.confidence,
                heuristic_feedback,
            ));
        }
    }

    // LLM gate: escalate ambiguous email events that no heuristic fired on.
    // Respects `llm_escalation_enabled` so users who disable LLM escalation globally
    // are never sent to the LLM triage path even when the email category is permitted.
    if event_subtype == "email_incoming"
        && evaluation_results.is_empty()
        && policy.llm_escalation_enabled
    {
        match check_watcher_policy(policy, events_this_hour, tokens_today, "email") {
            WatcherPolicyOutcome::Allowed => {
                if let Some(llm_alert) = llm_gate_email_triage(event) {
                    let default_chips = default_action_chips(SEVERITY_URGENT, "email");
                    let chip_refs: Vec<&str> = default_chips.iter().map(String::as_str).collect();
                    alerts.push(decorate_watcher_message(
                        build_watcher_alert_afp(
                            &trigger.user_id,
                            &thread_id,
                            &llm_alert,
                            &chip_refs,
                        ),
                        "email",
                        SEVERITY_URGENT,
                        llm_alert.confidence,
                    ));
                }
            }
            _ => {}
        }
    }

    // Clamp to [0, u32::MAX] before casting.  A negative value (NTP clock jump) becomes 0;
    // a run exceeding ~49 days (impossible in practice) is clamped to u32::MAX.
    let duration_ms = (Utc::now() - started_at)
        .num_milliseconds()
        .clamp(0, u32::MAX as i64) as u32;
    let simulation = simulate_watcher_projection(trigger, &alerts, &suggestions);

    let audit = WatcherRunAudit {
        run_id: trigger.run_id.clone(),
        user_id: trigger.user_id.clone(),
        daemon_id: trigger.daemon_id.clone(),
        source_message_id: trigger.source_message_id.clone(),
        trigger_kind: trigger.trigger_kind.clone(),
        alerts_emitted: alerts.len() as u32,
        suggestions_emitted: suggestions.len() as u32,
        heuristics_evaluated,
        skipped_by_policy,
        tokens_used: 0,
        duration_ms: Some(duration_ms),
        status: WatcherRunStatus::Completed,
        error_message: None,
        created_at: Utc::now().to_rfc3339(),
    };

    WatcherRunResult {
        run_id: trigger.run_id.clone(),
        alerts,
        suggestions,
        automation_artifacts: Vec::new(),
        audit,
        model_assignment,
        simulator_actionable: simulation
            .as_ref()
            .map(|result| result.stats.actionable_events > 0)
            .unwrap_or(false),
        simulator_summary: simulation.and_then(|result| {
            (result.stats.actionable_events > 0).then_some(result.output.trace_summary.summary)
        }),
    }
}

fn simulate_watcher_projection(
    trigger: &WatcherTrigger,
    alerts: &[Value],
    suggestions: &[Value],
) -> Option<SimulatorExecutionResult> {
    simulate_watcher_projection_with_policy(
        trigger,
        alerts,
        suggestions,
        &SimulatorRolloutPolicy {
            surface: SimulatorRolloutSurface::Watcher,
            ..crate::simulator_rollout::load_simulator_rollout_policy(
                SimulatorRolloutSurface::Watcher,
            )
        },
    )
}

fn simulate_watcher_projection_with_policy(
    trigger: &WatcherTrigger,
    alerts: &[Value],
    suggestions: &[Value],
    policy: &SimulatorRolloutPolicy,
) -> Option<SimulatorExecutionResult> {
    if alerts.is_empty() && suggestions.is_empty() {
        return None;
    }

    let source_refs = trigger
        .source_message_id
        .iter()
        .cloned()
        .collect::<Vec<_>>();
    let watcher_signals = alerts
        .iter()
        .enumerate()
        .map(|(index, alert)| StateSnapshotWatcherSignal {
            id: format!("watcher-signal-{}", index + 1),
            signal_key: format!(
                "watcher:{}",
                alert["subtype"].as_str().unwrap_or("watcher")
            ),
            category: alert["subtype"].as_str().unwrap_or("watcher").to_string(),
            freshness: "fresh".to_string(),
            urgency: alert["content"]["severity"]
                .as_str()
                .unwrap_or("important")
                .to_string(),
            confidence: "high".to_string(),
            urgency_hint: "Fresh watcher alert is still active now.".to_string(),
            suppression_status: "active".to_string(),
            suppression_reason: alert["metadata"]["empathetic_explanation"]
                .as_str()
                .unwrap_or("Watcher surfaced this signal without an active suppression override.")
                .to_string(),
            escalation_status: "required".to_string(),
            escalation_reason:
                "Active watcher alert is time-sensitive and should remain in the live escalation path."
                    .to_string(),
            decrypt_needed: false,
            source_type: "watcher_alert".to_string(),
            source_subtype: alert["subtype"].as_str().unwrap_or("watcher").to_string(),
            thread_id: format!("watcher:{}", trigger.user_id),
            source_refs: source_refs.clone(),
        })
        .collect::<Vec<_>>();
    let critical_changes = alerts
        .iter()
        .enumerate()
        .map(|(index, alert)| StateSnapshotCriticalChange {
            label: alert["content"]["message"]
                .as_str()
                .unwrap_or("Watcher alert")
                .to_string(),
            delta_type: format!(
                "watcher_alert:{}",
                alert["subtype"].as_str().unwrap_or("watcher")
            ),
            source_refs: vec![format!("watcher-alert-{}", index + 1)],
        })
        .collect::<Vec<_>>();
    let response_queue = suggestions
        .iter()
        .enumerate()
        .map(|(index, suggestion)| StateSnapshotResponseItem {
            id: format!("watcher-response-{}", index + 1),
            label: suggestion["content"]["title"]
                .as_str()
                .unwrap_or("Watcher suggestion")
                .to_string(),
            channel: "watcher".to_string(),
            urgency: "today".to_string(),
            confidence: "medium".to_string(),
            response_due_hint: "Soon".to_string(),
            source_refs: vec![format!("watcher-suggestion-{}", index + 1)],
            suggested_next_action: suggestion["content"]["title"]
                .as_str()
                .unwrap_or("Review suggestion")
                .to_string(),
        })
        .collect::<Vec<_>>();

    let snapshot = StateSnapshotContent {
        snapshot_kind: "watcher_projection".to_string(),
        time_window: "now".to_string(),
        sources: source_refs,
        response_queue,
        critical_changes,
        watcher_signals,
        staleness_at: Utc::now().to_rfc3339(),
        ..StateSnapshotContent::default()
    };

    Some(if policy.surface == SimulatorRolloutSurface::Watcher {
        simulate_snapshot_projection_with_policy(
            format!("watcher-simulation:{}", trigger.run_id),
            snapshot,
            None,
            policy,
        )
    } else {
        simulate_snapshot_projection_for_watcher(
            format!("watcher-simulation:{}", trigger.run_id),
            snapshot,
        )
    })
}

// ── Enrichment helpers ────────────────────────────────────────────────────────

/// Enrich a passive life event with life-context flags before evaluation.
/// For example, adds `"contains_allergen": true` if the shopping item is in the
/// user's allergen list, or `"on_statin": true` if the medication list contains
/// a statin.
///
/// Callers should call this before `process_watcher_trigger` to give heuristics
/// the enriched metadata they need.
pub fn enrich_event_metadata(
    original_metadata: &Value,
    life_context: &LiveLifeContext,
    event_subtype: &str,
) -> Value {
    let mut enriched = original_metadata.clone();
    let obj = enriched
        .as_object_mut()
        .expect("metadata is always an object");

    // Shopping events: check if item contains a known allergen.
    if event_subtype == "shopping_list_updated" {
        if let Some(item_name) = original_metadata.get("item_name").and_then(Value::as_str) {
            if life_context.item_is_allergen(item_name) {
                obj.insert("contains_allergen".to_string(), json!(true));
            }
            if item_name.to_lowercase().contains("grapefruit") && life_context.on_statin() {
                obj.insert("on_statin".to_string(), json!(true));
                obj.insert("item_name_contains".to_string(), json!("grapefruit"));
            }
        }
    }

    // Email events: derive urgency_score from keyword presence in subject line.
    // The LLM gate (llm_gate_email_triage) uses this score for escalation decisions.
    if event_subtype == "email_incoming" {
        if let Some(subject) = original_metadata.get("subject").and_then(Value::as_str) {
            let lower = subject.to_lowercase();
            let urgency_keywords = [
                "urgent",
                "action required",
                "critical",
                "asap",
                "immediately",
                "important",
            ];
            let hit_count = urgency_keywords
                .iter()
                .filter(|kw| lower.contains(*kw))
                .count();
            if hit_count > 0 {
                let score = hit_count as f64 / urgency_keywords.len() as f64;
                obj.insert("urgency_score".to_string(), json!(score));
            }
        }
    }

    // Calendar events: compute minutes_until_start from the start_time_iso field.
    // The heuristic engine uses `minutes_until_start_max` conditions; this must be
    // set before the index evaluate call or CAL-* rules will never fire.
    if event_subtype == "calendar_event_approaching" {
        let profile = original_metadata
            .get("profile")
            .cloned()
            .unwrap_or_else(|| {
                calendar_event_profile_from_fields(
                    original_metadata
                        .get("title")
                        .and_then(Value::as_str)
                        .unwrap_or("Calendar event"),
                    original_metadata.get("description").and_then(Value::as_str),
                    original_metadata.get("location").and_then(Value::as_str),
                    original_metadata
                        .get("all_day")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                )
            });
        obj.insert("profile".to_string(), profile.clone());
        if let Some(start_iso) = original_metadata
            .get("start_time_iso")
            .and_then(Value::as_str)
        {
            if let Ok(start_dt) = chrono::DateTime::parse_from_rfc3339(start_iso) {
                let now = Utc::now();
                let minutes_until: i64 = (start_dt.with_timezone(&Utc) - now).num_minutes();
                obj.insert(
                    "minutes_until_start".to_string(),
                    json!(minutes_until.max(0)),
                );
                let days_until: i64 = (start_dt.with_timezone(&Utc) - now).num_days();
                obj.insert("days_until_start".to_string(), json!(days_until.max(0)));
                if let Some(prep_lead_minutes) =
                    profile.get("prep_lead_minutes").and_then(Value::as_i64)
                {
                    let prep_remaining = (minutes_until - prep_lead_minutes).max(0);
                    obj.insert("prep_minutes_remaining".to_string(), json!(prep_remaining));
                }
            }
        }
        if let Some(schedule_anchor_type) =
            profile.get("schedule_anchor_type").and_then(Value::as_str)
        {
            obj.entry("schedule_anchor_type".to_string())
                .or_insert_with(|| json!(schedule_anchor_type));
        }
        if let Some(schedule_focus_kind) =
            profile.get("schedule_focus_kind").and_then(Value::as_str)
        {
            obj.entry("schedule_focus_kind".to_string())
                .or_insert_with(|| json!(schedule_focus_kind));
        }
        if let Some(note_kind) = profile.get("schedule_note_kind").and_then(Value::as_str) {
            obj.entry("schedule_note_kind".to_string())
                .or_insert_with(|| json!(note_kind));
        }
        if let Some(prep_lead_minutes) = profile.get("prep_lead_minutes").and_then(Value::as_i64) {
            obj.entry("prep_lead_minutes".to_string())
                .or_insert_with(|| json!(prep_lead_minutes));
        }
        if let Some(has_agenda_signal) = profile.get("has_agenda_signal").and_then(Value::as_bool) {
            obj.entry("agenda_exists".to_string())
                .or_insert_with(|| json!(has_agenda_signal));
        }
        if let Some(has_high_importance_signal) = profile
            .get("has_high_importance_signal")
            .and_then(Value::as_bool)
        {
            obj.entry("importance".to_string()).or_insert_with(|| {
                json!(if has_high_importance_signal {
                    "high"
                } else {
                    "normal"
                })
            });
        }
        // Copy event_type for CAL-02/03 conditions.
        if let Some(ev_type) = original_metadata.get("event_type").and_then(Value::as_str) {
            obj.entry("event_type".to_string())
                .or_insert_with(|| json!(ev_type));
        }
        // Carry travel_required from the event.
        if let Some(tr) = original_metadata
            .get("travel_required")
            .and_then(Value::as_bool)
        {
            obj.entry("travel_required".to_string())
                .or_insert_with(|| json!(tr));
        }
    }

    // Medication events: carry dietary flags.
    if event_subtype == "medication_time" {
        if !life_context.dietary_preferences.is_empty() {
            obj.insert(
                "dietary_preferences".to_string(),
                json!(life_context.dietary_preferences),
            );
        }
    }

    enriched
}

/// Build a `daily_context` AFP message JSON from a life context snapshot.
pub fn build_daily_context_afp(
    owner_user_id: &str,
    thread_id: &str,
    date: &str,
    weather_summary: Option<&str>,
    medication_adherence: Value,
    shopping_list_status: Value,
    schedule_summary: Vec<String>,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "background_watcher",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_DAILY_CONTEXT,
        "content": {
            "date": date,
            "weather_summary": weather_summary,
            "medication_adherence": medication_adherence,
            "shopping_list_status": shopping_list_status,
            "schedule_summary": schedule_summary,
            "nutrition_log": [],
            "custom": {},
        },
        "metadata": { "store": true, "watcher": true },
        "store_in_relational": true,
    })
}

/// Build a `user_life_profile` AFP message JSON.
pub fn build_life_profile_afp(
    owner_user_id: &str,
    thread_id: &str,
    allergies: &[String],
    medications: &[String],
    dietary_preferences: &[String],
    sensitivities: &[String],
    routines: &[String],
    household_members: &[String],
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "background_watcher",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_USER_LIFE_PROFILE,
        "content": {
            "allergies": allergies,
            "medications": medications,
            "dietary_preferences": dietary_preferences,
            "sensitivities": sensitivities,
            "routines": routines,
            "household_members": household_members,
            "custom": {},
        },
        "metadata": { "store": true, "watcher": true },
        "store_in_relational": true,
    })
}

// ── Metadata scan pass (selective decryption) ────────────────────────────────

/// Relevance score computed from unencrypted AFP message metadata alone.
/// Used to decide whether a message warrants full decryption and heuristic
/// evaluation.  Returns a value in [0.0, 1.0]; callers should decrypt only
/// when the score exceeds `RELEVANCE_DECRYPT_THRESHOLD`.
#[derive(Debug, Clone, Default)]
pub struct MetadataRelevance {
    /// Final score [0.0, 1.0].
    pub score: f64,
    /// Signal that drove the score (for audit).
    pub primary_signal: String,
}

/// Minimum relevance score required before a message is fully decrypted and
/// passed to the heuristic evaluator.
pub const RELEVANCE_DECRYPT_THRESHOLD: f64 = 0.25;

/// Score an AFP message using only its unencrypted header fields.
/// No decryption, no LLM calls — pure metadata heuristics.
///
/// Inputs:
/// - `msg_type`    : AFP `type` field (e.g. `"passive_event"`)
/// - `msg_subtype` : AFP `subtype` field (e.g. `"email_received"`)
/// - `from`        : Sender identifier (used to boost known watcher sources)
/// - `metadata`    : Raw `metadata` JSON (may contain `"watcher": true`, etc.)
pub fn score_metadata_relevance(
    msg_type: &str,
    msg_subtype: &str,
    from: &str,
    metadata: &serde_json::Value,
) -> MetadataRelevance {
    let mut score = 0.0_f64;
    let mut primary = "no_signal".to_string();

    // Known high-value type/subtype combinations.
    let type_boost: f64 = match (msg_type, msg_subtype) {
        ("passive_event", "email_received" | "email_incoming") => {
            primary = "passive_event:email".to_string();
            0.70
        }
        ("passive_event", "calendar_event_starting_soon" | "appointment_approaching") => {
            primary = "passive_event:calendar".to_string();
            0.65
        }
        ("passive_event", "weather_alert" | "medication_time") => {
            primary = "passive_event:life_critical".to_string();
            0.80
        }
        ("passive_event", _) => {
            primary = "passive_event:generic".to_string();
            0.30
        }
        ("watcher_alert", _) | ("smart_suggestion", _) => {
            primary = "watcher_output".to_string();
            0.50
        }
        _ => 0.0,
    };
    score += type_boost;

    // Boost for messages flagged by a known watcher source.
    if from.starts_with("background_watcher") || from.starts_with("watcher") {
        score = (score + 0.15).min(1.0);
    }

    // Boost for messages explicitly tagged `"watcher": true` in metadata.
    if metadata.get("watcher").and_then(serde_json::Value::as_bool) == Some(true) {
        score = (score + 0.10).min(1.0);
    }

    // Boost for `"urgent": true` or `"priority": "high"` in metadata.
    if metadata.get("urgent").and_then(serde_json::Value::as_bool) == Some(true)
        || metadata.get("priority").and_then(serde_json::Value::as_str) == Some("high")
    {
        score = (score + 0.30).min(1.0);
        if primary == "no_signal" {
            primary = "metadata:urgent_flag".to_string();
        }
    }

    MetadataRelevance {
        score,
        primary_signal: primary,
    }
}

/// Filter a batch of raw AFP messages to only those worth full decryption.
/// Returns indices of messages that exceed `RELEVANCE_DECRYPT_THRESHOLD`.
///
/// `messages` is a slice of unencrypted header-only JSON objects
/// (i.e. the `content` field may be absent or ciphertext — do NOT read it).
pub fn filter_by_relevance(messages: &[serde_json::Value]) -> Vec<usize> {
    messages
        .iter()
        .enumerate()
        .filter_map(|(i, msg)| {
            let msg_type = msg
                .get("type")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            let msg_subtype = msg
                .get("subtype")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            let from = msg
                .get("from")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            let metadata = msg.get("metadata").unwrap_or(&serde_json::Value::Null);
            let rel = score_metadata_relevance(msg_type, msg_subtype, from, metadata);
            if rel.score >= RELEVANCE_DECRYPT_THRESHOLD {
                Some(i)
            } else {
                None
            }
        })
        .collect()
}

// ── Proactivity level 3: background LLM scanner ───────────────────────────────

/// Parameters for a single background LLM scan run.
pub struct ProactiveScanRequest<'a> {
    /// User on whose behalf the scan runs.
    pub user_id: &'a str,
    /// Recent AFP messages from the user's ledger (compressed context).
    pub recent_messages: Vec<Value>,
    /// Inference API key.
    pub api_key: &'a str,
    /// Model to use — always a small/fast model (e.g. Haiku) for background scans.
    pub model: &'a str,
    /// Daily token budget remaining (prevents runaway cost).
    pub tokens_remaining: u32,
}

/// Result of one background LLM scan.
pub struct ProactiveScanResult {
    /// AFP `proactive_suggestion` messages emitted, ready to store.
    pub suggestions: Vec<Value>,
    /// Tokens consumed by this scan.
    pub tokens_used: u32,
    /// Human-readable note for the audit log.
    pub note: String,
}

/// Run a background proactivity scan using a small LLM (level-3 mode).
///
/// Called by the daemon heartbeat every 20 minutes when the user's
/// `user_proactivity_config.level = 3`. The scan looks for things the
/// zero-token heuristics might have missed by reasoning over recent context.
///
/// Safety rails:
/// - Hard budget cap: returns empty when `tokens_remaining < 100`.
/// - Skips if `recent_messages` is empty.
/// - LLM output is validated; malformed JSON is silently dropped.
/// - All emitted suggestions have `source: "proactive_llm_scan"` in metadata
///   so they can be audited and distinguished from heuristic suggestions.
pub async fn run_proactive_llm_scan(
    req: ProactiveScanRequest<'_>,
    infer: impl std::future::Future<Output = Result<String, String>>,
) -> ProactiveScanResult {
    if req.tokens_remaining < 100 || req.recent_messages.is_empty() {
        return ProactiveScanResult {
            suggestions: vec![],
            tokens_used: 0,
            note: "scan skipped: budget or context empty".to_string(),
        };
    }

    // Compress recent messages into a brief context summary (last 20 messages).
    let context_items: Vec<String> = req
        .recent_messages
        .iter()
        .rev()
        .take(20)
        .filter_map(|m| {
            let t = m.get("type").and_then(Value::as_str).unwrap_or("?");
            let sub = m.get("subtype").and_then(Value::as_str).unwrap_or("");
            let ts = m.get("timestamp").and_then(Value::as_str).unwrap_or("");
            // Skip low-signal messages to save tokens.
            if matches!(t, "heartbeat" | "daily_context" | "user_life_profile") {
                return None;
            }
            let summary = format!("[{ts}] {t}/{sub}");
            Some(summary)
        })
        .collect();

    if context_items.is_empty() {
        return ProactiveScanResult {
            suggestions: vec![],
            tokens_used: 0,
            note: "scan skipped: no actionable context".to_string(),
        };
    }

    let context_block = context_items.join("\n");
    let prompt = format!(
        "You are OmnyID's proactive life assistant. Review the following recent activity \
        and identify up to 3 things the user might benefit from being reminded about, \
        warned about, or nudged towards. Focus on things NOT already covered by standard \
        calendar/email reminders.\n\
        \n\
        Recent activity (newest last):\n\
        {context_block}\n\
        \n\
        Respond ONLY with valid JSON — no prose, no code fences:\n\
        {{\"suggestions\":[{{\"title\":\"...\",\"body\":\"...\",\"urgency\":\"gentle|important|urgent\",\"heuristic_id\":\"llm-scan-001\"}}]}}\n\
        \n\
        Rules:\n\
        - Maximum 3 suggestions. Return [] if nothing material to say.\n\
        - Do not invent facts. Only reason from the activity shown.\n\
        - urgency must be one of: gentle, important, urgent.\n\
        - Each body must be 1–2 sentences, actionable."
    );

    // Run inference — caller provides the concrete future (allows mocking in tests).
    let raw = match infer.await {
        Ok(text) => text,
        Err(e) => {
            return ProactiveScanResult {
                suggestions: vec![],
                tokens_used: 0,
                note: format!("scan inference error: {e}"),
            };
        }
    };

    // Parse suggestions — use the same robust extractor as the orchestrator.
    let suggestions_json = match parse_scan_suggestions(&raw) {
        Some(v) => v,
        None => {
            return ProactiveScanResult {
                suggestions: vec![],
                tokens_used: 0,
                note: "scan parse error: no valid JSON found".to_string(),
            };
        }
    };

    let items = match suggestions_json.as_array() {
        Some(a) => a,
        None => {
            return ProactiveScanResult {
                suggestions: vec![],
                tokens_used: 0,
                note: "scan parse error: suggestions not an array".to_string(),
            };
        }
    };

    // Estimate tokens: rough 1 token ≈ 4 chars for English prose.
    let tokens_used = ((prompt.len() + raw.len()) / 4).min(req.tokens_remaining as usize) as u32;

    let thread_id = format!("proactive-scan:{}", req.user_id);
    let suggestions: Vec<Value> = items
        .iter()
        .take(3)
        .filter_map(|item| {
            let title = item.get("title").and_then(Value::as_str)?;
            let body = item.get("body").and_then(Value::as_str)?;
            let urgency = item
                .get("urgency")
                .and_then(Value::as_str)
                .unwrap_or("gentle");
            // Validate urgency — drop malformed entries.
            if !matches!(urgency, "gentle" | "important" | "urgent") {
                return None;
            }
            Some(serde_json::json!({
                "type": "proactive_suggestion",
                "subtype": "llm_scan",
                "thread_id": thread_id,
                "from": "omnyid://server/background-watcher",
                "content": {
                    "action_label": "Review suggestion",
                    "title": title,
                    "description": body,
                    "artifact_summary_lines": [body],
                    "urgency": urgency,
                    "confidence": 0.70,
                    "source": "proactive_llm_scan",
                    "destination_view": "home",
                    "surface_hint": "home",
                    "heuristic_id": format!("llm-scan-{}", ulid::Ulid::new()),
                },
                "metadata": {
                    "model": req.model,
                    "tokens_used": tokens_used,
                    "scan_ts": chrono::Utc::now().to_rfc3339(),
                }
            }))
        })
        .collect();

    ProactiveScanResult {
        tokens_used,
        note: format!(
            "scan ok: {} suggestion(s), ~{} tokens",
            suggestions.len(),
            tokens_used
        ),
        suggestions,
    }
}

/// Extract the `suggestions` array from a raw LLM response string.
fn parse_scan_suggestions(raw: &str) -> Option<Value> {
    let text = raw.trim();
    // Strip optional code fences.
    let inner = if text.starts_with("```") {
        text.splitn(2, '\n')
            .nth(1)
            .unwrap_or(text)
            .trim_end()
            .strip_suffix("```")
            .unwrap_or(text)
            .trim()
    } else {
        text
    };
    // Find balanced JSON object.
    let start = inner.find('{')?;
    let bytes = inner.as_bytes();
    let mut depth = 0u32;
    let mut in_str = false;
    let mut escaped = false;
    let mut end = None;
    for (i, &b) in bytes.iter().enumerate().skip(start) {
        if escaped {
            escaped = false;
            continue;
        }
        match b {
            b'\\' if in_str => escaped = true,
            b'"' => in_str = !in_str,
            b'{' if !in_str => depth += 1,
            b'}' if !in_str => {
                depth -= 1;
                if depth == 0 {
                    end = Some(i + 1);
                    break;
                }
            }
            _ => {}
        }
    }
    let json_str = &inner[start..end?];
    let parsed: Value = serde_json::from_str(json_str).ok()?;
    Some(parsed["suggestions"].clone())
}

// ── LLM gate ─────────────────────────────────────────────────────────────────

/// Keyword-based email escalation gate. Escalates emails whose `urgency_score`
/// (set by the enrichment pass from subject-line keywords) exceeds the threshold.
/// Confidence is the raw urgency_score, capped at 1.0.
/// Replace this with an LLM inference call when the inference runtime is wired up.
fn llm_gate_email_triage(event: &AfpPassiveEventContent) -> Option<AfpWatcherAlertContent> {
    let subject = event
        .metadata
        .get("subject")
        .and_then(Value::as_str)
        .unwrap_or("");
    let urgency_score = event
        .metadata
        .get("urgency_score")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);

    // Only escalate if subject-line keyword score signals urgency.
    if urgency_score < 0.15 {
        return None;
    }

    Some(AfpWatcherAlertContent {
        category: "email".to_string(),
        severity: SEVERITY_URGENT.to_string(),
        message: format!("Urgent email detected: \"{}\"", subject),
        suggestion: Some("Review immediately and decide on next action.".to_string()),
        confidence: urgency_score.min(1.0),
        heuristic_id: "email-keyword-escalation".to_string(),
        source_event_id: event.entity_id.clone(),
        ..Default::default()
    })
}

// ── Helper utilities ──────────────────────────────────────────────────────────

fn category_from_heuristic_id(id: &str) -> String {
    if id.starts_with("allergy-") {
        CATEGORY_SAFETY.to_string()
    } else if id.starts_with("med-") {
        CATEGORY_MEDICATION.to_string()
    } else if id.starts_with("shopping-") {
        CATEGORY_SHOPPING.to_string()
    } else if id.starts_with("nutrition-") {
        "nutrition".to_string()
    } else if id.starts_with("study-") {
        "study".to_string()
    } else if id.starts_with("household-") {
        "household".to_string()
    } else if id.starts_with("schedule-") {
        "schedule".to_string()
    } else if id.starts_with("email-") {
        "email".to_string()
    } else if id.starts_with("cal-") {
        "calendar".to_string()
    } else if id.starts_with("weather-") {
        "weather".to_string()
    } else if id.starts_with("traffic-") {
        "traffic".to_string()
    } else if id.starts_with("news-") {
        "news".to_string()
    } else if id.starts_with("task-") {
        "task".to_string()
    } else if id.starts_with("goal-") {
        "goal".to_string()
    } else if id.starts_with("mtg-") {
        "meeting".to_string()
    } else if id.starts_with("deadline-") {
        "deadline".to_string()
    } else if id.starts_with("fin-") {
        "finance".to_string()
    } else if id.starts_with("nk-") {
        "knowledge".to_string()
    } else if id.starts_with("llm-scan-") {
        "llm_scan".to_string()
    } else {
        "general".to_string()
    }
}

fn default_action_chips(urgency: &str, category: &str) -> Vec<String> {
    match (urgency, category) {
        (SEVERITY_URGENT, CATEGORY_SAFETY) => vec![
            "Understood".to_string(),
            "View Details".to_string(),
            "Contact Doctor".to_string(),
        ],
        (SEVERITY_URGENT, "email") => vec![
            "Open Email".to_string(),
            "Mark Urgent".to_string(),
            "Reply Now".to_string(),
        ],
        (SEVERITY_URGENT, "news") => vec![
            "Read More".to_string(),
            "Stay Informed".to_string(),
            "Share with Household".to_string(),
        ],
        (SEVERITY_URGENT, "task") => vec!["Start Now".to_string(), "Reschedule".to_string()],
        (SEVERITY_URGENT, _) => vec!["Act Now".to_string(), "Remind Later".to_string()],
        (SEVERITY_IMPORTANT, CATEGORY_MEDICATION) => vec![
            "Mark as Taken".to_string(),
            "Remind in 15 min".to_string(),
            "Skip Today".to_string(),
        ],
        (SEVERITY_IMPORTANT, "email") => vec![
            "Open Email".to_string(),
            "Reply".to_string(),
            "Snooze 2h".to_string(),
        ],
        (SEVERITY_IMPORTANT, "calendar") => vec![
            "View Event".to_string(),
            "Reschedule".to_string(),
            "Join Now".to_string(),
        ],
        (SEVERITY_IMPORTANT, "goal") => vec![
            "Break Down Goal".to_string(),
            "View Progress".to_string(),
            "Schedule Session".to_string(),
        ],
        (SEVERITY_IMPORTANT, "task") => vec![
            "Start Task".to_string(),
            "Reschedule".to_string(),
            "Delegate".to_string(),
        ],
        (SEVERITY_IMPORTANT, "weather") | (SEVERITY_IMPORTANT, "traffic") => vec![
            "Check Details".to_string(),
            "Adjust Plans".to_string(),
            "Dismiss".to_string(),
        ],
        (SEVERITY_IMPORTANT, _) => vec![
            "Do it now".to_string(),
            "Remind me later".to_string(),
            "Dismiss".to_string(),
        ],
        _ => vec!["OK, thanks".to_string(), "Remind later".to_string()],
    }
}

fn json_string_array(content: &Value, key: &str) -> Vec<String> {
    content
        .get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

// ── Proactive escalation result ───────────────────────────────────────────────

/// Outcome of `resolve_watcher_escalation`.
pub struct EscalationOutcome {
    /// Additional alerts generated by the budget-gated LLM path (may be empty).
    pub extra_alerts: Vec<Value>,
    /// AFP audit messages: proactive_trigger + optional minimal_context_packet + token_budget_log.
    pub audit_afps: Vec<Value>,
}

/// Resolve the LLM escalation gate for a watcher run that produced no heuristic matches.
///
/// This is the async companion to the pure `process_watcher_trigger` function.
/// It applies the token budget gate, selects the LLM provider tier, builds the
/// minimal context packet, and returns any additional alert AFP messages.
///
/// Example flows
/// ─────────────
/// **Medication conflict alert (grapefruit + statin)**
///   Event subtype: `shopping_list_updated`, item_name: `Grapefruit juice`
///   → Heuristic SHOP-02 fires directly (no escalation needed).
///
/// **Supplier reply reminder**
///   Event subtype: `email_incoming`, urgency_score: 0.33 (moderate).
///   → No heuristic fires.  `resolve_watcher_escalation` checks budget:
///     - Budget OK, tier = user_key (Anthropic Haiku).
///     - Builds minimal context: subject line only, anonymised.
///     - Emits `proactive_trigger` (decision=allowed) + `minimal_context_packet`.
///     - Caller dispatches objective via orchestrate; result arrives as `watcher_alert` via SSE.
///
/// **Schedule remediation**
///   Event subtype: `calendar_event_approaching`, minutes_until_start: 45.
///   → Heuristic CAL-01 fires directly (no escalation needed).
///   → If budget exhausted: `resolve_watcher_escalation` returns FallbackHeuristic,
///     emits `proactive_trigger` (decision=fallback_heuristic), caller uses keyword summary.
pub async fn resolve_watcher_escalation(
    db: &crate::db::Db,
    user_id: &str,
    _thread_id: &str,
    event: &crate::message::AfpPassiveEventContent,
    event_subtype: &str,
) -> EscalationOutcome {
    use crate::{
        privacy_escalation::PrivacyEscalationLayer,
        token_budget::{BudgetDecision, TokenBudgetGate},
    };

    let gate = TokenBudgetGate::new(db);
    let privacy = PrivacyEscalationLayer::new(db);
    const ESCALATION_HEURISTIC: &str = "llm-gate-email-triage";
    const ESTIMATED_TOKENS: u32 = 512;

    let (decision, daily_used, daily_limit) = gate
        .check_and_gate(user_id, ESCALATION_HEURISTIC, ESTIMATED_TOKENS)
        .await;

    let provider = privacy.select_provider(user_id).await;

    let trigger_afp = TokenBudgetGate::build_proactive_trigger_afp(
        user_id,
        ESCALATION_HEURISTIC,
        daily_used,
        daily_limit,
        &decision,
        provider.tier(),
    );

    let mut audit_afps = vec![trigger_afp];
    let extra_alerts;

    match &decision {
        BudgetDecision::Allowed { .. } => {
            // Build minimal context from available event metadata.
            let subject = event
                .metadata
                .get("subject")
                .and_then(|v| v.as_str())
                .unwrap_or("(no subject)");
            let sender = event
                .metadata
                .get("from_address")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown sender");
            let snippets = vec![
                format!("Event: {}", event_subtype),
                format!("Subject: {}", subject),
                format!("Sender: {}", sender),
            ];
            let snippet_refs: Vec<&str> = snippets.iter().map(String::as_str).collect();
            let packet = PrivacyEscalationLayer::build_minimal_context(
                &snippet_refs,
                ESCALATION_HEURISTIC,
                ESTIMATED_TOKENS,
            );
            let ctx_afp = PrivacyEscalationLayer::build_minimal_context_packet_afp(
                user_id,
                ESCALATION_HEURISTIC,
                &packet,
                &provider,
            );
            audit_afps.push(ctx_afp);

            // For now this is a stub — a full implementation would dispatch
            // the packet.summary to the LLM via the orchestrate pipeline and
            // then call gate.record_usage(...) + build_token_budget_log_afp.
            // The objective format and SSE delivery already exist; wiring the
            // actual HTTP call here would require access to the AppState / HTTP
            // client, which belongs in the server layer, not the daemon module.
            tracing::info!(
                %user_id,
                event_subtype,
                provider_tier = provider.tier(),
                estimated_tokens = ESTIMATED_TOKENS,
                "watcher LLM escalation gate: allowed — objective queued via orchestrate",
            );
            extra_alerts = vec![];
        }
        BudgetDecision::FallbackHeuristic { reason } => {
            tracing::debug!(%user_id, reason, "watcher escalation: fallback heuristic");
            extra_alerts = vec![];
        }
        BudgetDecision::Queued {
            retry_after_seconds,
        } => {
            tracing::debug!(%user_id, retry_after_seconds, "watcher escalation: queued (budget exceeded)");
            extra_alerts = vec![];
        }
    }

    EscalationOutcome {
        extra_alerts,
        audit_afps,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        agent_template::default_priority_rules,
        background_watcher::{WatcherPolicy, WatcherTrigger, WatcherTriggerKind},
        background_watcher_heuristics::build_watcher_index,
        db::UserConnectedCapabilityRecord,
        proactive_outcome_memory::HeuristicOutcomeFeedback,
    };

    fn make_trigger(user_id: &str, kind: WatcherTriggerKind) -> WatcherTrigger {
        WatcherTrigger {
            run_id: Ulid::new().to_string(),
            daemon_id: "daemon_01".to_string(),
            user_id: user_id.to_string(),
            trigger_kind: kind,
            source_message_id: None,
            event_subtype: None,
            triggered_at: Utc::now().to_rfc3339(),
        }
    }

    fn medication_event(not_taken: bool) -> AfpPassiveEventContent {
        AfpPassiveEventContent {
            event_type: "medication_time".to_string(),
            payload: None,
            context: None,
            source: "medication_tracker".to_string(),
            entity_id: None,
            event_at: Utc::now().to_rfc3339(),
            confidence: 1.0,
            metadata: json!({ "dose_window": "morning", "not_taken": not_taken }),
        }
    }

    fn study_session_event(confidence: f64, minutes: u32) -> AfpPassiveEventContent {
        AfpPassiveEventContent {
            event_type: "study_session_started".to_string(),
            payload: None,
            context: None,
            source: "study_tracker".to_string(),
            entity_id: None,
            event_at: Utc::now().to_rfc3339(),
            confidence,
            metadata: json!({ "session_duration_minutes": minutes }),
        }
    }

    fn email_event(subject: &str, snippet: &str, metadata: Value) -> AfpPassiveEventContent {
        let mut merged = json!({
            "provider": "gmail",
            "gmail_email": "person@example.com",
            "subject": subject,
            "snippet": snippet
        });
        if let (Some(base), Some(extra)) = (merged.as_object_mut(), metadata.as_object()) {
            for (key, value) in extra {
                base.insert(key.clone(), value.clone());
            }
        }
        AfpPassiveEventContent {
            event_type: "passive_event".to_string(),
            payload: None,
            context: None,
            source: "gmail_watch".to_string(),
            entity_id: None,
            event_at: Utc::now().to_rfc3339(),
            confidence: 0.9,
            metadata: merged,
        }
    }

    fn gmail_capability(capability_id: &str) -> UserConnectedCapabilityRecord {
        UserConnectedCapabilityRecord {
            id: "ucc_test".to_string(),
            user_id: "user_01".to_string(),
            provider: "gmail".to_string(),
            account_ref: "person@example.com".to_string(),
            capability_family: "communications".to_string(),
            capability_id: capability_id.to_string(),
            transport: "rest".to_string(),
            granted_scopes: vec![],
            approval_mode: "autonomous".to_string(),
            secret_ref: Some("user_gmail_tokens:user_01".to_string()),
            health_state: "healthy".to_string(),
            last_checked_at: None,
            connected_at: "2026-07-17T00:00:00Z".to_string(),
            revoked_at: None,
            metadata_json: json!({}),
        }
    }

    #[test]
    fn watcher_emits_suggestion_for_gentle_medication_reminder() {
        let trigger = make_trigger("user_01", WatcherTriggerKind::MedicationCheck);
        let event = medication_event(true);
        let policy = WatcherPolicy::default();
        let index = build_watcher_index(&[]);

        let result =
            process_watcher_trigger(&trigger, &event, "medication_time", &policy, &index, 0, 0);

        // "gentle" urgency → smart suggestion, not alert.
        assert!(
            !result.suggestions.is_empty() || !result.alerts.is_empty(),
            "Expected at least one watcher output"
        );
        assert!(!result.simulator_actionable);
        assert!(result.simulator_summary.is_none());
    }

    #[test]
    fn watcher_simulator_preview_can_be_enabled_explicitly() {
        let trigger = make_trigger("user_01", WatcherTriggerKind::MedicationCheck);
        let policy = SimulatorRolloutPolicy {
            surface: SimulatorRolloutSurface::Watcher,
            enabled: true,
            allow_promotion: false,
            probabilistic_sampling_enabled: false,
            review_surfaces_enabled: false,
            rollout_stage: crate::simulator_rollout::SIMULATOR_ROLLOUT_STAGE_SHADOW.to_string(),
            calibration_mode: crate::simulator_rollout::SIMULATOR_CALIBRATION_MODE_SHADOW_ONLY
                .to_string(),
        };
        let alerts = vec![json!({
            "subtype": "watcher_alert",
            "content": {
                "severity": "important",
                "message": "Medication reminder still pending."
            },
            "metadata": {
                "empathetic_explanation": "This reminder still matters now."
            }
        })];
        let suggestions = vec![json!({
            "content": {
                "title": "Check medication"
            }
        })];

        let result =
            simulate_watcher_projection_with_policy(&trigger, &alerts, &suggestions, &policy)
                .expect("watcher simulation result");

        assert!(result.stats.promotions_suppressed);
        assert!(result.stats.actionable_events > 0);
        assert!(!result.output.trace_summary.summary.is_empty());
    }

    #[test]
    fn watcher_emits_nothing_when_medication_taken() {
        let trigger = make_trigger("user_01", WatcherTriggerKind::MedicationCheck);
        let event = medication_event(false);
        let policy = WatcherPolicy::default();
        let index = build_watcher_index(&[]);

        let result =
            process_watcher_trigger(&trigger, &event, "medication_time", &policy, &index, 0, 0);

        assert!(result.alerts.is_empty());
        assert!(result.suggestions.is_empty());
    }

    #[test]
    fn watcher_rate_limits_when_hourly_cap_exceeded() {
        let trigger = make_trigger("user_01", WatcherTriggerKind::MedicationCheck);
        let event = medication_event(true);
        let policy = WatcherPolicy::default();
        let index = build_watcher_index(&[]);

        let result = process_watcher_trigger(
            &trigger,
            &event,
            "medication_time",
            &policy,
            &index,
            300, // >= max_events_per_hour
            0,
        );

        assert!(result.alerts.is_empty());
        assert!(result.suggestions.is_empty());
    }

    #[test]
    fn watcher_feedback_can_apply_suppression_window_to_emitted_suggestion() {
        let trigger = make_trigger("user_01", WatcherTriggerKind::MedicationCheck);
        let event = medication_event(true);
        let policy = WatcherPolicy::default();
        let index = build_watcher_index(&[]);

        let baseline =
            process_watcher_trigger(&trigger, &event, "medication_time", &policy, &index, 0, 0);
        let heuristic_id = baseline.suggestions[0]["content"]["heuristic_id"]
            .as_str()
            .expect("watcher suggestion heuristic id")
            .to_string();
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id,
            total: 8,
            accepted: 1,
            acceptance_rate: 0.125,
            status: "suppressed".to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: Some(72),
            suggested_half_life_days: 5,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];

        let result = process_watcher_trigger_with_outcome_feedback(
            &trigger,
            &event,
            "medication_time",
            &policy,
            &index,
            0,
            0,
            &feedback,
        );

        assert!(
            result.suggestions[0]["metadata"]["emotional_decay"]["suppressed_until"]
                .as_str()
                .is_some()
        );
        assert_eq!(
            result.suggestions[0]["metadata"]["emotional_decay"]["half_life_days"].as_u64(),
            Some(5)
        );
    }

    #[test]
    fn watcher_feedback_can_mark_emitted_suggestion_as_reinforced() {
        let trigger = make_trigger("user_01", WatcherTriggerKind::MedicationCheck);
        let event = medication_event(true);
        let policy = WatcherPolicy::default();
        let index = build_watcher_index(&[]);

        let baseline =
            process_watcher_trigger(&trigger, &event, "medication_time", &policy, &index, 0, 0);
        let heuristic_id = baseline.suggestions[0]["content"]["heuristic_id"]
            .as_str()
            .expect("watcher suggestion heuristic id")
            .to_string();
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id,
            total: 10,
            accepted: 9,
            acceptance_rate: 0.9,
            status: "reinforced".to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 45,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];

        let result = process_watcher_trigger_with_outcome_feedback(
            &trigger,
            &event,
            "medication_time",
            &policy,
            &index,
            0,
            0,
            &feedback,
        );

        assert_eq!(
            result.suggestions[0]["metadata"]["emotional_decay"]["half_life_days"].as_u64(),
            Some(45)
        );
        assert_eq!(
            result.suggestions[0]["metadata"]["empathetic_explanation"].as_str(),
            Some(
                "This heuristic has been helpful before, so its context is retained for about 45 days."
            )
        );
        assert!(
            result.suggestions[0]["metadata"]["signal_score_calibrated"]
                .as_f64()
                .unwrap_or_default()
                >= result.suggestions[0]["metadata"]["signal_score_raw"]
                    .as_f64()
                    .unwrap_or_default()
        );
    }

    #[test]
    fn watcher_auto_tune_can_suppress_low_acceptance_heuristic_under_tie() {
        let trigger = make_trigger("user_01", WatcherTriggerKind::StudyAlert);
        let event = study_session_event(0.90, 30);
        let index = build_watcher_index(&[]);

        let baseline_policy = WatcherPolicy {
            auto_tune: false,
            ..WatcherPolicy::default()
        };
        let baseline = process_watcher_trigger(
            &trigger,
            &event,
            "study_session_started",
            &baseline_policy,
            &index,
            0,
            0,
        );
        let heuristic_id = baseline.suggestions[0]["content"]["heuristic_id"]
            .as_str()
            .expect("watcher suggestion heuristic id")
            .to_string();
        let confidence = baseline.suggestions[0]["content"]["confidence"]
            .as_f64()
            .expect("watcher suggestion confidence");
        let tuned_policy = WatcherPolicy {
            alert_confidence_threshold: (confidence - 0.02).max(0.0),
            auto_tune: true,
            ..WatcherPolicy::default()
        };
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id,
            total: 8,
            accepted: 1,
            acceptance_rate: 0.125,
            status: "suppressed".to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: Some(72),
            suggested_half_life_days: 5,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];

        let tuned = process_watcher_trigger_with_outcome_feedback(
            &trigger,
            &event,
            "study_session_started",
            &tuned_policy,
            &index,
            0,
            0,
            &feedback,
        );

        assert!(
            baseline.suggestions.len() == 1 && tuned.suggestions.is_empty(),
            "auto-tuned threshold should suppress the low-acceptance heuristic in this narrow band"
        );
    }

    #[test]
    fn enrich_event_detects_allergen_in_shopping_item() {
        let life_context = LiveLifeContext {
            allergies: vec!["grapefruit".to_string()],
            ..LiveLifeContext::default()
        };
        let metadata = json!({ "item_name": "Grapefruit Juice 1L" });
        let enriched = enrich_event_metadata(&metadata, &life_context, "shopping_list_updated");
        assert_eq!(enriched["contains_allergen"], json!(true));
    }

    #[test]
    fn enrich_event_detects_statin_grapefruit_interaction() {
        let life_context = LiveLifeContext {
            allergies: vec![],
            medications: vec!["atorvastatin 20mg".to_string()],
            ..LiveLifeContext::default()
        };
        let metadata = json!({ "item_name": "grapefruit juice" });
        let enriched = enrich_event_metadata(&metadata, &life_context, "shopping_list_updated");
        assert_eq!(enriched["on_statin"], json!(true));
        assert_eq!(enriched["item_name_contains"], json!("grapefruit"));
    }

    #[test]
    fn enrich_calendar_event_metadata_uses_shared_profile_signals() {
        let life_context = LiveLifeContext::default();
        let metadata = json!({
            "title": "Board review meeting",
            "description": "Launch agenda and executive review",
            "location": "Level 4 boardroom",
            "all_day": false,
            "start_time_iso": "2026-07-28T10:00:00Z",
            "profile": crate::calendar_event_profile::calendar_event_profile_from_fields(
                "Board review meeting",
                Some("Launch agenda and executive review"),
                Some("Level 4 boardroom"),
                false,
            ),
        });
        let enriched =
            enrich_event_metadata(&metadata, &life_context, "calendar_event_approaching");
        assert_eq!(enriched["agenda_exists"], json!(true));
        assert_eq!(enriched["importance"], json!("high"));
        assert_eq!(enriched["schedule_anchor_type"], json!("meeting"));
        assert_eq!(enriched["schedule_note_kind"], json!("high_stakes_prep"));
        assert_eq!(enriched["prep_lead_minutes"], json!(60));
        assert!(enriched.get("profile").is_some());
    }

    #[test]
    fn live_life_context_from_afp_content_parses_correctly() {
        let content = json!({
            "allergies": ["grapefruit", "penicillin"],
            "medications": ["atorvastatin", "metformin"],
            "dietary_preferences": ["low_sugar", "high_protein"],
            "sensitivities": ["loud noises"],
        });
        let ctx = LiveLifeContext::from_afp_content(&content);
        assert_eq!(ctx.allergies, vec!["grapefruit", "penicillin"]);
        assert!(ctx.on_statin());
        assert!(ctx.item_is_allergen("Fresh Grapefruit"));
    }

    #[test]
    fn metadata_relevance_email_exceeds_threshold() {
        let rel = score_metadata_relevance(
            "passive_event",
            "email_incoming",
            "gmail_gateway",
            &serde_json::json!({}),
        );
        assert!(rel.score >= RELEVANCE_DECRYPT_THRESHOLD);
        assert!(rel.primary_signal.contains("email"));
    }

    #[test]
    fn metadata_relevance_unknown_type_is_below_threshold() {
        let rel =
            score_metadata_relevance("agent_session", "message", "user", &serde_json::json!({}));
        assert!(rel.score < RELEVANCE_DECRYPT_THRESHOLD);
    }

    #[test]
    fn metadata_urgent_flag_boosts_score() {
        let meta = serde_json::json!({ "urgent": true });
        let rel = score_metadata_relevance("unknown_type", "", "system", &meta);
        assert!(rel.score >= RELEVANCE_DECRYPT_THRESHOLD);
    }

    #[test]
    fn filter_by_relevance_keeps_email_drops_chat() {
        let messages = vec![
            serde_json::json!({ "type": "passive_event", "subtype": "email_incoming", "from": "gateway", "metadata": {} }),
            serde_json::json!({ "type": "agent_session", "subtype": "message", "from": "user", "metadata": {} }),
            serde_json::json!({ "type": "passive_event", "subtype": "medication_time", "from": "watcher", "metadata": {} }),
        ];
        let indices = filter_by_relevance(&messages);
        assert!(indices.contains(&0), "email should be kept");
        assert!(!indices.contains(&1), "chat message should be filtered");
        assert!(indices.contains(&2), "medication should be kept");
    }

    #[test]
    fn watcher_personal_automation_wrapper_emits_prepare_draft_artifact_for_routine_email() {
        let mut trigger = make_trigger("user_01", WatcherTriggerKind::LifeEvent);
        trigger.source_message_id = Some("thread:gmail:prepare".to_string());
        let event = email_event(
            "Quick follow up",
            "Can you reply when you have a moment?",
            json!({}),
        );
        let policy = WatcherPolicy::default();
        let index = build_watcher_index(&[]);

        let result = process_watcher_trigger_with_personal_automation(
            &trigger,
            &event,
            "email_incoming",
            &policy,
            &index,
            0,
            0,
            &[gmail_capability("gmail.draft")],
            &default_priority_rules(),
        );

        assert_eq!(result.automation_artifacts.len(), 1);
        assert_eq!(
            result.automation_artifacts[0]["type"].as_str(),
            Some("ledger")
        );
    }

    #[test]
    fn watcher_personal_automation_wrapper_emits_approval_artifact_for_high_impact_email() {
        let mut trigger = make_trigger("user_01", WatcherTriggerKind::LifeEvent);
        trigger.source_message_id = Some("thread:gmail:approval".to_string());
        let event = email_event(
            "Contract signature needed today",
            "Please review and approve this contract.",
            json!({
                "requires_action": true,
                "impact": "high"
            }),
        );
        let policy = WatcherPolicy::default();
        let index = build_watcher_index(&[]);

        let result = process_watcher_trigger_with_personal_automation(
            &trigger,
            &event,
            "email_incoming",
            &policy,
            &index,
            0,
            0,
            &[
                gmail_capability("gmail.draft"),
                gmail_capability("gmail.send"),
            ],
            &default_priority_rules(),
        );

        assert_eq!(result.automation_artifacts.len(), 1);
        assert_eq!(
            result.automation_artifacts[0]["type"].as_str(),
            Some("watcher_alert")
        );
    }

    #[test]
    fn daily_context_afp_has_correct_type() {
        let afp = build_daily_context_afp(
            "user_01",
            "watcher:user_01",
            "2026-05-23",
            Some("Sunny, 22°C"),
            json!({}),
            json!({}),
            vec![],
        );
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_DAILY_CONTEXT));
    }

    #[test]
    fn life_profile_afp_has_correct_type() {
        let afp = build_life_profile_afp(
            "user_01",
            "watcher:user_01",
            &["grapefruit".to_string()],
            &["atorvastatin".to_string()],
            &["low_sugar".to_string()],
            &[],
            &[],
            &[],
        );
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_USER_LIFE_PROFILE));
    }
}
