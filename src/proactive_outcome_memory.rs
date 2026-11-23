use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use crate::heuristic_adaptation::{HeuristicSignals, compute_threshold_adaptation};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HeuristicOutcomeFeedback {
    pub heuristic_id: String,
    pub total: i64,
    pub accepted: i64,
    pub acceptance_rate: f64,
    pub status: String,
    #[serde(default)]
    pub scope: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggested_suppression_hours: Option<u32>,
    pub suggested_half_life_days: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub adaptation_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub threshold_delta: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sample_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub adaptation_signals: Vec<String>,
}

pub fn summarize_outcome_rates(rates: &[Value]) -> Vec<HeuristicOutcomeFeedback> {
    let mut feedback: Vec<HeuristicOutcomeFeedback> = rates
        .iter()
        .map(|rate| {
            let heuristic_id = rate
                .get("heuristic_id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let total = rate.get("total").and_then(Value::as_i64).unwrap_or(0);
            let accepted = rate.get("accepted").and_then(Value::as_i64).unwrap_or(0);
            let acceptance_rate = rate
                .get("acceptance_rate")
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
                .clamp(0.0, 1.0);
            let (status, suppression_hours, half_life_days) =
                derive_feedback_fields(total, acceptance_rate);
            HeuristicOutcomeFeedback {
                heuristic_id: heuristic_id.clone(),
                total,
                accepted,
                acceptance_rate,
                status: status.to_string(),
                scope: "exact".to_string(),
                suggested_suppression_hours: suppression_hours,
                suggested_half_life_days: half_life_days,
                adaptation_reason: None,
                threshold_delta: None,
                sample_count: None,
                adaptation_signals: Vec::new(),
            }
        })
        .collect();

    feedback.sort_by(|left, right| left.heuristic_id.cmp(&right.heuristic_id));
    feedback
}

pub fn summarize_family_outcome_rates(rates: &[Value]) -> Vec<HeuristicOutcomeFeedback> {
    let mut feedback = summarize_outcome_rates(rates);
    downgrade_feedback_to_family_scope(&mut feedback);
    feedback
}

/// Like `summarize_outcome_rates` but applies the EMA threshold delta from
/// Phase 8 adaptation before classifying each heuristic.
///
/// `ema_states` maps `heuristic_id` → the EMA state JSON from
/// `db.get_heuristic_ema_state()`.  Heuristics not present in the map fall
/// back to static defaults (same behaviour as `summarize_outcome_rates`).
pub fn summarize_outcome_rates_adapted(
    rates: &[serde_json::Value],
    ema_states: &HashMap<String, serde_json::Value>,
) -> Vec<HeuristicOutcomeFeedback> {
    summarize_outcome_rates_adapted_with_signal_overrides(rates, ema_states, None, None, None, None)
}

pub fn summarize_outcome_rates_adapted_with_signal_overrides(
    rates: &[serde_json::Value],
    ema_states: &HashMap<String, serde_json::Value>,
    queue_pressure: Option<f64>,
    topic_recurrence: Option<&HashMap<String, f64>>,
    undone_action_rate: Option<f64>,
    draft_usage_rate: Option<f64>,
) -> Vec<HeuristicOutcomeFeedback> {
    let mut feedback: Vec<HeuristicOutcomeFeedback> = rates
        .iter()
        .map(|rate| {
            let heuristic_id = rate
                .get("heuristic_id")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string();
            let total = rate
                .get("total")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(0);
            let accepted = rate
                .get("accepted")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(0);
            let acceptance_rate = rate
                .get("acceptance_rate")
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(0.0)
                .clamp(0.0, 1.0);
            let adaptation = threshold_adaptation_for_rate(
                &heuristic_id,
                total,
                acceptance_rate,
                ema_states,
                queue_pressure,
                topic_recurrence,
                undone_action_rate,
                draft_usage_rate,
            );
            let thresholds = FeedbackThresholds::default().apply_delta(adaptation.threshold_delta);

            let (status, suppression_hours, half_life_days) =
                derive_feedback_fields_with_thresholds(total, acceptance_rate, &thresholds);
            let adaptation_signals = active_adaptation_signals(
                adaptation.adaptation_reason,
                queue_pressure,
                topic_recurrence.and_then(|map| map.get(&heuristic_id).copied()),
                undone_action_rate,
                draft_usage_rate,
            );

            HeuristicOutcomeFeedback {
                heuristic_id: heuristic_id.clone(),
                total,
                accepted,
                acceptance_rate,
                status: status.to_string(),
                scope: "exact".to_string(),
                suggested_suppression_hours: suppression_hours,
                suggested_half_life_days: half_life_days,
                adaptation_reason: Some(adaptation.adaptation_reason.to_string()),
                threshold_delta: Some(adaptation.threshold_delta),
                sample_count: Some(adaptation.sample_count),
                adaptation_signals,
            }
        })
        .collect();

    feedback.sort_by(|l, r| l.heuristic_id.cmp(&r.heuristic_id));
    feedback
}

pub fn summarize_family_outcome_rates_adapted(
    rates: &[serde_json::Value],
    ema_states: &HashMap<String, serde_json::Value>,
) -> Vec<HeuristicOutcomeFeedback> {
    let mut feedback = summarize_outcome_rates_adapted(rates, ema_states);
    downgrade_feedback_to_family_scope(&mut feedback);
    feedback
}

pub fn summarize_family_outcome_rates_adapted_with_signal_overrides(
    rates: &[serde_json::Value],
    ema_states: &HashMap<String, serde_json::Value>,
    queue_pressure: Option<f64>,
    topic_recurrence: Option<&HashMap<String, f64>>,
    undone_action_rate: Option<f64>,
    draft_usage_rate: Option<f64>,
) -> Vec<HeuristicOutcomeFeedback> {
    let mut feedback = summarize_outcome_rates_adapted_with_signal_overrides(
        rates,
        ema_states,
        queue_pressure,
        topic_recurrence,
        undone_action_rate,
        draft_usage_rate,
    );
    downgrade_feedback_to_family_scope(&mut feedback);
    feedback
}

pub fn feedback_for_heuristic(
    rates: &[Value],
    heuristic_id: &str,
) -> Option<HeuristicOutcomeFeedback> {
    summarize_outcome_rates(rates)
        .into_iter()
        .find(|feedback| feedback.heuristic_id == heuristic_id)
}

pub fn suggestion_allowed_by_outcome_feedback(
    suggestion: &Value,
    feedback: &[HeuristicOutcomeFeedback],
) -> bool {
    let Some(match_feedback) = suggestion_feedback_entry(suggestion, feedback) else {
        return true;
    };

    if is_simulator_bounded_preview_suggestion(suggestion)
        && matches!(
            (
                match_feedback.status.as_str(),
                match_feedback.scope.as_str()
            ),
            ("suppressed", _) | ("cooldown_recommended", _) | ("cautious", "family")
        )
    {
        return false;
    }

    !matches!(match_feedback.status.as_str(), "suppressed")
}

pub fn filter_suggestions_by_outcome_feedback(
    suggestions: Vec<Value>,
    feedback: &[HeuristicOutcomeFeedback],
) -> Vec<Value> {
    suggestions
        .into_iter()
        .filter(|suggestion| suggestion_allowed_by_outcome_feedback(suggestion, feedback))
        .collect()
}

pub fn annotate_suggestions_with_outcome_feedback(
    suggestions: Vec<Value>,
    feedback: &[HeuristicOutcomeFeedback],
) -> Vec<Value> {
    suggestions
        .into_iter()
        .map(|mut suggestion| {
            let Some(match_feedback) = suggestion_feedback_entry(&suggestion, feedback) else {
                return suggestion;
            };

            if let Some(root) = suggestion.as_object_mut() {
                root.insert(
                    "outcome_feedback".to_string(),
                    serde_json::to_value(match_feedback).unwrap_or(Value::Null),
                );
            }
            suggestion
        })
        .collect()
}

pub fn reprioritize_suggestions_by_outcome_feedback(
    mut suggestions: Vec<Value>,
    feedback: &[HeuristicOutcomeFeedback],
) -> Vec<Value> {
    suggestions.sort_by_key(|suggestion| {
        let Some(match_feedback) = suggestion_feedback_entry(suggestion, feedback) else {
            return (2usize, 1usize);
        };
        let mut priority = outcome_feedback_priority(&match_feedback.status, &match_feedback.scope);
        if is_simulator_bounded_preview_suggestion(suggestion)
            && match_feedback.scope == "family"
            && !matches!(match_feedback.status.as_str(), "reinforced" | "trusted")
        {
            priority += 1;
        }
        (
            priority,
            simulator_preview_tiebreak_priority(suggestion, match_feedback),
        )
    });
    suggestions
}

fn derive_feedback_fields(total: i64, acceptance_rate: f64) -> (&'static str, Option<u32>, u32) {
    derive_feedback_fields_with_thresholds(total, acceptance_rate, &FeedbackThresholds::default())
}

fn threshold_adaptation_for_rate(
    heuristic_id: &str,
    total: i64,
    acceptance_rate: f64,
    ema_states: &HashMap<String, serde_json::Value>,
    queue_pressure: Option<f64>,
    topic_recurrence: Option<&HashMap<String, f64>>,
    undone_action_rate: Option<f64>,
    draft_usage_rate: Option<f64>,
) -> crate::heuristic_adaptation::ThresholdAdaptation {
    let ema_state = ema_states.get(heuristic_id);
    let ema_acceptance_rate = ema_state
        .and_then(|state| state.get("ema_acceptance_rate"))
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(acceptance_rate);
    let sample_count = ema_state
        .and_then(|state| state.get("sample_count"))
        .and_then(serde_json::Value::as_u64)
        .map(|count| count as u32)
        .unwrap_or(total.max(0) as u32);
    let signals = HeuristicSignals {
        ema_acceptance_rate,
        sample_count,
        queue_pressure: queue_pressure.unwrap_or(0.0).clamp(0.0, 1.0),
        undone_action_rate: undone_action_rate.unwrap_or(0.0).clamp(0.0, 1.0),
        draft_usage_rate: draft_usage_rate.unwrap_or(0.0).clamp(0.0, 1.0),
        topic_recurrence: topic_recurrence
            .and_then(|map| map.get(heuristic_id).copied())
            .unwrap_or(0.0)
            .clamp(0.0, 1.0),
        ..Default::default()
    };
    compute_threshold_adaptation(0.7, &signals)
}

fn active_adaptation_signals(
    adaptation_reason: &str,
    queue_pressure: Option<f64>,
    topic_recurrence: Option<f64>,
    undone_action_rate: Option<f64>,
    draft_usage_rate: Option<f64>,
) -> Vec<String> {
    let mut signals = Vec::new();
    if queue_pressure.unwrap_or(0.0) > 0.7 {
        signals.push("queue pressure".to_string());
    }
    if topic_recurrence.unwrap_or(0.0) > 0.6
        && matches!(adaptation_reason, "suppression_active" | "cooldown_active")
    {
        signals.push("topic recurrence".to_string());
    }
    if undone_action_rate.unwrap_or(0.0) > 0.3 {
        signals.push("undo regret".to_string());
    }
    if draft_usage_rate.unwrap_or(0.0) > 0.5
        && matches!(adaptation_reason, "suppression_active" | "cooldown_active")
    {
        signals.push("draft usage".to_string());
    }
    signals
}

fn downgrade_feedback_to_family_scope(feedback: &mut [HeuristicOutcomeFeedback]) {
    for item in feedback {
        item.scope = "family".to_string();
        item.status = downgrade_family_feedback_status(&item.status).to_string();
        if item.status != "suppressed" {
            item.suggested_suppression_hours = None;
        }
    }
}

/// Acceptance-rate thresholds used by `derive_feedback_fields`.
/// Phase 8 callers build adapted thresholds from the EMA delta; all other
/// callers use the static defaults.
#[derive(Debug, Clone)]
pub struct FeedbackThresholds {
    /// Rate below this → "suppressed".
    pub suppress_below: f64,
    /// Rate below this → "cooldown_recommended".
    pub cooldown_below: f64,
    /// Rate above this → "reinforced".
    pub reinforce_above: f64,
    /// Rate above this → "trusted".
    pub trusted_above: f64,
}

impl Default for FeedbackThresholds {
    fn default() -> Self {
        Self {
            suppress_below: 0.25,
            cooldown_below: 0.45,
            reinforce_above: 0.80,
            trusted_above: 0.65,
        }
    }
}

impl FeedbackThresholds {
    /// Shift thresholds by the EMA delta, clamping each to a safe range.
    ///
    /// A positive delta (poor acceptance → raise bar) tightens each threshold
    /// upward; a negative delta (great acceptance → lower bar) relaxes them.
    pub fn apply_delta(mut self, delta: f64) -> Self {
        self.suppress_below = (self.suppress_below + delta).clamp(0.05, 0.60);
        self.cooldown_below = (self.cooldown_below + delta).clamp(0.15, 0.70);
        self.reinforce_above = (self.reinforce_above + delta).clamp(0.50, 0.95);
        self.trusted_above = (self.trusted_above + delta).clamp(0.40, 0.90);
        self
    }
}

fn derive_feedback_fields_with_thresholds(
    total: i64,
    acceptance_rate: f64,
    t: &FeedbackThresholds,
) -> (&'static str, Option<u32>, u32) {
    if total < 3 {
        return ("insufficient_signal", None, 14);
    }
    if acceptance_rate < t.suppress_below {
        return ("suppressed", Some(72), 5);
    }
    if acceptance_rate < t.cooldown_below {
        return ("cooldown_recommended", Some(24), 7);
    }
    if acceptance_rate > t.reinforce_above {
        return ("reinforced", None, 45);
    }
    if acceptance_rate > t.trusted_above {
        return ("trusted", None, 30);
    }
    ("neutral", None, 14)
}

fn downgrade_family_feedback_status(status: &str) -> String {
    match status {
        "suppressed" => "cooldown_recommended".to_string(),
        "cooldown_recommended" => "cautious".to_string(),
        other => other.to_string(),
    }
}

fn outcome_feedback_priority(status: &str, scope: &str) -> usize {
    match (status, scope) {
        ("reinforced", _) => 0,
        ("trusted", _) => 1,
        ("neutral", _) | ("insufficient_signal", _) => 2,
        ("cautious", "family") => 3,
        ("cooldown_recommended", "family") => 4,
        ("cooldown_recommended", _) => 5,
        ("suppressed", _) => 6,
        _ => 2,
    }
}

fn simulator_preview_tiebreak_priority(
    suggestion: &Value,
    feedback: &HeuristicOutcomeFeedback,
) -> usize {
    if is_simulator_bounded_preview_suggestion(suggestion)
        && feedback.scope == "exact"
        && matches!(feedback.status.as_str(), "reinforced" | "trusted")
    {
        return 0;
    }
    1
}

fn suggestion_feedback_entry<'a>(
    suggestion: &Value,
    feedback: &'a [HeuristicOutcomeFeedback],
) -> Option<&'a HeuristicOutcomeFeedback> {
    let content = suggestion.get("content").unwrap_or(suggestion);
    let heuristic_id = content.get("heuristic_id").and_then(Value::as_str);
    if let Some(heuristic_id) = heuristic_id {
        if let Some(exact_match) = feedback
            .iter()
            .find(|item| item.heuristic_id == heuristic_id)
        {
            return Some(exact_match);
        }
    }

    let explicit_family_id = content.get("heuristic_family_id").and_then(Value::as_str);
    if let Some(family_id) = explicit_family_id {
        return feedback.iter().find(|item| item.heuristic_id == family_id);
    }

    heuristic_id
        .map(crate::db::proactive_heuristic_family_id)
        .and_then(|family_id| feedback.iter().find(|item| item.heuristic_id == family_id))
}

fn is_simulator_bounded_preview_suggestion(suggestion: &Value) -> bool {
    let content = suggestion.get("content").unwrap_or(suggestion);

    let kind = content
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if matches!(
        kind,
        "simulator_approval_preview" | "simulator_reversible_preview" | "simulator_conflict_fusion"
    ) {
        return true;
    }

    content
        .get("action_afp_payload")
        .and_then(|payload| payload.get("metadata"))
        .and_then(Value::as_object)
        .and_then(|metadata| metadata.get("simulator_preview_promoted"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

#[cfg(test)]
mod adaptation_tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn simulator_conflict_fusion_is_treated_as_bounded_preview() {
        assert!(is_simulator_bounded_preview_suggestion(
            &serde_json::json!({
                "kind": "simulator_conflict_fusion",
                "preview_only": true,
            })
        ));
    }

    #[test]
    fn adapted_exact_feedback_carries_adaptation_metadata() {
        let rates = vec![serde_json::json!({
            "heuristic_id": "prepared-draft:thread-1",
            "accepted": 1,
            "dismissed": 5,
            "total": 6,
            "acceptance_rate": 1.0 / 6.0,
        })];
        let ema_states = HashMap::from([(
            "prepared-draft:thread-1".to_string(),
            serde_json::json!({
                "sample_count": 8,
                "last_threshold_delta": 0.12,
                "last_adaptation_reason": "suppression_active",
            }),
        )]);

        let feedback = summarize_outcome_rates_adapted(&rates, &ema_states);
        assert_eq!(feedback.len(), 1);
        assert_eq!(feedback[0].status, "suppressed");
        assert_eq!(
            feedback[0].adaptation_reason.as_deref(),
            Some("suppression_active")
        );
        assert_eq!(feedback[0].threshold_delta, Some(0.15));
        assert_eq!(feedback[0].sample_count, Some(8));
    }

    #[test]
    fn adapted_family_feedback_downgrades_scope_but_keeps_adaptation_metadata() {
        let rates = vec![serde_json::json!({
            "heuristic_id": "prepared-draft:family-1",
            "accepted": 2,
            "dismissed": 4,
            "total": 6,
            "acceptance_rate": 2.0 / 6.0,
        })];
        let ema_states = HashMap::from([(
            "prepared-draft:family-1".to_string(),
            serde_json::json!({
                "sample_count": 10,
                "last_threshold_delta": 0.1,
                "last_adaptation_reason": "cooldown_active",
            }),
        )]);

        let feedback = summarize_family_outcome_rates_adapted(&rates, &ema_states);
        assert_eq!(feedback.len(), 1);
        assert_eq!(feedback[0].scope, "family");
        assert_eq!(feedback[0].status, "cautious");
        assert_eq!(
            feedback[0].adaptation_reason.as_deref(),
            Some("cooldown_active")
        );
        assert_eq!(feedback[0].sample_count, Some(10));
    }

    #[test]
    fn queue_pressure_softens_adapted_suppression_thresholds() {
        let rates = vec![serde_json::json!({
            "heuristic_id": "prepared-draft:thread-2",
            "accepted": 1,
            "dismissed": 3,
            "total": 4,
            "acceptance_rate": 0.25,
        })];
        let ema_states = HashMap::from([(
            "prepared-draft:thread-2".to_string(),
            serde_json::json!({
                "ema_acceptance_rate": 0.20,
                "sample_count": 6,
                "last_threshold_delta": 0.15,
                "last_adaptation_reason": "suppression_active",
            }),
        )]);

        let baseline = summarize_outcome_rates_adapted_with_signal_overrides(
            &rates,
            &ema_states,
            None,
            None,
            None,
            None,
        );
        let pressured = summarize_outcome_rates_adapted_with_signal_overrides(
            &rates,
            &ema_states,
            Some(0.85),
            None,
            None,
            None,
        );

        assert_eq!(baseline[0].status, "suppressed");
        assert_eq!(pressured[0].status, "suppressed");
        assert!(pressured[0].threshold_delta < baseline[0].threshold_delta);
        assert_eq!(
            pressured[0].adaptation_reason.as_deref(),
            Some("suppression_active")
        );
        assert!(
            pressured[0]
                .adaptation_signals
                .iter()
                .any(|signal| signal == "queue pressure")
        );
    }

    #[test]
    fn topic_recurrence_raises_adapted_threshold_delta_for_low_acceptance() {
        let rates = vec![serde_json::json!({
            "heuristic_id": "workflow-failure-notify",
            "accepted": 1,
            "dismissed": 3,
            "total": 4,
            "acceptance_rate": 0.25,
        })];
        let ema_states = HashMap::from([(
            "workflow-failure-notify".to_string(),
            serde_json::json!({
                "ema_acceptance_rate": 0.35,
                "sample_count": 7,
                "last_threshold_delta": 0.08,
                "last_adaptation_reason": "cooldown_active",
            }),
        )]);
        let recurrence = HashMap::from([("workflow-failure-notify".to_string(), 0.9)]);

        let baseline = summarize_outcome_rates_adapted_with_signal_overrides(
            &rates,
            &ema_states,
            None,
            None,
            None,
            None,
        );
        let recurrent = summarize_outcome_rates_adapted_with_signal_overrides(
            &rates,
            &ema_states,
            None,
            Some(&recurrence),
            None,
            None,
        );

        assert!(recurrent[0].threshold_delta > baseline[0].threshold_delta);
        assert_eq!(
            recurrent[0].adaptation_reason.as_deref(),
            Some("cooldown_active")
        );
        assert!(
            recurrent[0]
                .adaptation_signals
                .iter()
                .any(|signal| signal == "topic recurrence")
        );
    }

    #[test]
    fn undone_action_rate_raises_adapted_threshold_delta_for_low_acceptance() {
        let rates = vec![serde_json::json!({
            "heuristic_id": "prepared-draft:reply",
            "accepted": 1,
            "dismissed": 5,
            "total": 6,
            "acceptance_rate": 1.0 / 6.0,
        })];
        let ema_states = HashMap::from([(
            "prepared-draft:reply".to_string(),
            serde_json::json!({
                "ema_acceptance_rate": 0.18,
                "sample_count": 6,
                "last_threshold_delta": 0.15,
                "last_adaptation_reason": "suppression_active",
            }),
        )]);

        let baseline = summarize_outcome_rates_adapted_with_signal_overrides(
            &rates,
            &ema_states,
            None,
            None,
            None,
            None,
        );
        let regret_weighted = summarize_outcome_rates_adapted_with_signal_overrides(
            &rates,
            &ema_states,
            None,
            None,
            Some(0.75),
            None,
        );

        assert!(regret_weighted[0].threshold_delta > baseline[0].threshold_delta);
        assert_eq!(
            regret_weighted[0].adaptation_reason.as_deref(),
            Some("suppression_active")
        );
        assert!(
            regret_weighted[0]
                .adaptation_signals
                .iter()
                .any(|signal| signal == "undo regret")
        );
    }

    #[test]
    fn draft_usage_softens_adapted_thresholds_for_prepared_drafts() {
        let rates = vec![serde_json::json!({
            "heuristic_id": "prepared-draft:thread-5",
            "accepted": 1,
            "dismissed": 3,
            "total": 4,
            "acceptance_rate": 0.25,
        })];
        let ema_states = HashMap::from([(
            "prepared-draft:thread-5".to_string(),
            serde_json::json!({
                "ema_acceptance_rate": 0.30,
                "sample_count": 6,
                "last_threshold_delta": 0.08,
                "last_adaptation_reason": "cooldown_active",
            }),
        )]);

        let baseline = summarize_outcome_rates_adapted_with_signal_overrides(
            &rates,
            &ema_states,
            None,
            None,
            None,
            None,
        );
        let draft_weighted = summarize_outcome_rates_adapted_with_signal_overrides(
            &rates,
            &ema_states,
            None,
            None,
            None,
            Some(0.9),
        );

        assert!(draft_weighted[0].threshold_delta < baseline[0].threshold_delta);
        assert_eq!(
            draft_weighted[0].adaptation_reason.as_deref(),
            Some("cooldown_active")
        );
        assert!(
            draft_weighted[0]
                .adaptation_signals
                .iter()
                .any(|signal| signal == "draft usage")
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarize_outcome_rates_marks_low_acceptance_for_suppression() {
        let rates = vec![serde_json::json!({
            "heuristic_id": "study-break",
            "total": 8,
            "accepted": 1,
            "acceptance_rate": 0.125
        })];
        let summary = summarize_outcome_rates(&rates);
        assert_eq!(summary[0].status, "suppressed");
        assert_eq!(summary[0].suggested_suppression_hours, Some(72));
    }

    #[test]
    fn summarize_outcome_rates_marks_high_acceptance_as_reinforced() {
        let rates = vec![serde_json::json!({
            "heuristic_id": "medication-reminder",
            "total": 10,
            "accepted": 9,
            "acceptance_rate": 0.9
        })];
        let summary = summarize_outcome_rates(&rates);
        assert_eq!(summary[0].status, "reinforced");
        assert_eq!(summary[0].suggested_half_life_days, 45);
    }

    #[test]
    fn feedback_for_heuristic_finds_requested_item() {
        let rates = vec![
            serde_json::json!({
                "heuristic_id": "shopping-nudge",
                "total": 4,
                "accepted": 2,
                "acceptance_rate": 0.5
            }),
            serde_json::json!({
                "heuristic_id": "study-break",
                "total": 8,
                "accepted": 1,
                "acceptance_rate": 0.125
            }),
        ];
        let feedback = feedback_for_heuristic(&rates, "study-break").unwrap();
        assert_eq!(feedback.status, "suppressed");
    }

    #[test]
    fn filter_suggestions_by_outcome_feedback_hides_suppressed_heuristics() {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "study-break".to_string(),
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
        let suggestions = vec![
            serde_json::json!({
                "id": "s1",
                "content": { "heuristic_id": "study-break" }
            }),
            serde_json::json!({
                "id": "s2",
                "content": { "heuristic_id": "shopping-nudge" }
            }),
        ];
        let filtered = filter_suggestions_by_outcome_feedback(suggestions, &feedback);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0]["id"].as_str(), Some("s2"));
    }

    #[test]
    fn filter_suggestions_by_outcome_feedback_hides_simulator_promoted_artifacts_on_family_caution()
    {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "prepared-draft:draft:reply:msg_1".to_string(),
            total: 6,
            accepted: 2,
            acceptance_rate: 0.333,
            status: "cautious".to_string(),
            scope: "family".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 7,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![
            serde_json::json!({
                "id": "simulator-promoted",
                "content": {
                    "heuristic_id": "prepared-draft:draft:reply:msg_1:abcd1234",
                    "heuristic_family_id": "prepared-draft:draft:reply:msg_1",
                    "action_afp_payload": {
                        "metadata": {
                            "simulator_preview_promoted": true
                        }
                    }
                }
            }),
            serde_json::json!({
                "id": "ordinary-family-caution",
                "content": {
                    "heuristic_id": "prepared-draft:draft:reply:msg_1:efgh5678",
                    "heuristic_family_id": "prepared-draft:draft:reply:msg_1"
                }
            }),
        ];
        let filtered = filter_suggestions_by_outcome_feedback(suggestions, &feedback);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0]["id"].as_str(), Some("ordinary-family-caution"));
    }

    #[test]
    fn filter_suggestions_by_outcome_feedback_hides_simulator_promoted_artifacts_on_family_cooldown()
     {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "prepared-context:family-1".to_string(),
            total: 6,
            accepted: 2,
            acceptance_rate: 0.333,
            status: "cooldown_recommended".to_string(),
            scope: "family".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 7,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![serde_json::json!({
            "id": "simulator-context-pack",
            "content": {
                "heuristic_id": "prepared-context:family-1:abcd1234",
                "heuristic_family_id": "prepared-context:family-1",
                "action_afp_payload": {
                    "metadata": {
                        "simulator_preview_promoted": true
                    }
                }
            }
        })];
        let filtered = filter_suggestions_by_outcome_feedback(suggestions, &feedback);
        assert!(filtered.is_empty());
    }

    #[test]
    fn filter_suggestions_by_outcome_feedback_hides_simulator_preview_items_on_family_caution() {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "simulator-review:family-1".to_string(),
            total: 6,
            accepted: 2,
            acceptance_rate: 0.333,
            status: "cautious".to_string(),
            scope: "family".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 7,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![
            serde_json::json!({
                "id": "simulator-approval-preview",
                "content": {
                    "kind": "simulator_approval_preview",
                    "heuristic_id": "simulator-review:family-1:a",
                    "heuristic_family_id": "simulator-review:family-1"
                }
            }),
            serde_json::json!({
                "id": "ordinary-family-caution",
                "content": {
                    "heuristic_id": "simulator-review:family-1:b",
                    "heuristic_family_id": "simulator-review:family-1"
                }
            }),
        ];
        let filtered = filter_suggestions_by_outcome_feedback(suggestions, &feedback);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0]["id"].as_str(), Some("ordinary-family-caution"));
    }

    #[test]
    fn annotate_suggestions_with_outcome_feedback_attaches_feedback_payload() {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "shopping-nudge".to_string(),
            total: 5,
            accepted: 4,
            acceptance_rate: 0.8,
            status: "trusted".to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 30,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![serde_json::json!({
            "id": "s2",
            "content": { "heuristic_id": "shopping-nudge" }
        })];
        let annotated = annotate_suggestions_with_outcome_feedback(suggestions, &feedback);
        assert_eq!(
            annotated[0]["outcome_feedback"]["status"].as_str(),
            Some("trusted")
        );
    }

    #[test]
    fn summarize_family_outcome_rates_softens_suppression_to_cooldown() {
        let rates = vec![serde_json::json!({
            "heuristic_id": "prepared-draft:draft:reply:msg_1",
            "total": 8,
            "accepted": 1,
            "acceptance_rate": 0.125
        })];
        let summary = summarize_family_outcome_rates(&rates);
        assert_eq!(summary[0].scope, "family");
        assert_eq!(summary[0].status, "cooldown_recommended");
        assert_eq!(summary[0].suggested_suppression_hours, None);
    }

    #[test]
    fn annotate_suggestions_with_outcome_feedback_uses_family_fallback() {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "prepared-draft:draft:reply:msg_1".to_string(),
            total: 6,
            accepted: 1,
            acceptance_rate: 0.166,
            status: "cooldown_recommended".to_string(),
            scope: "family".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 7,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![serde_json::json!({
            "id": "s1",
            "content": {
                "heuristic_id": "prepared-draft:draft:reply:msg_1:abcd1234",
                "heuristic_family_id": "prepared-draft:draft:reply:msg_1"
            }
        })];
        let annotated = annotate_suggestions_with_outcome_feedback(suggestions, &feedback);
        assert_eq!(
            annotated[0]["outcome_feedback"]["scope"].as_str(),
            Some("family")
        );
    }

    #[test]
    fn reprioritize_suggestions_by_outcome_feedback_pushes_family_cooldown_lower() {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "prepared-draft:draft:reply:msg_1".to_string(),
            total: 6,
            accepted: 1,
            acceptance_rate: 0.166,
            status: "cooldown_recommended".to_string(),
            scope: "family".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 7,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![
            serde_json::json!({
                "id": "draft-cooled",
                "content": {
                    "heuristic_id": "prepared-draft:draft:reply:msg_1:abcd1234",
                    "heuristic_family_id": "prepared-draft:draft:reply:msg_1"
                }
            }),
            serde_json::json!({
                "id": "fresh",
                "content": {
                    "heuristic_id": "shopping-nudge"
                }
            }),
        ];
        let reprioritized = reprioritize_suggestions_by_outcome_feedback(suggestions, &feedback);
        assert_eq!(reprioritized[0]["id"].as_str(), Some("fresh"));
    }

    #[test]
    fn reprioritize_suggestions_by_outcome_feedback_demotes_simulator_promoted_family_matches() {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "prepared-context:family-1".to_string(),
            total: 5,
            accepted: 3,
            acceptance_rate: 0.6,
            status: "neutral".to_string(),
            scope: "family".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 30,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![
            serde_json::json!({
                "id": "simulator-family-match",
                "content": {
                    "heuristic_id": "prepared-context:family-1:sim",
                    "heuristic_family_id": "prepared-context:family-1",
                    "action_afp_payload": {
                        "metadata": {
                            "simulator_preview_promoted": true
                        }
                    }
                }
            }),
            serde_json::json!({
                "id": "ordinary-family-match",
                "content": {
                    "heuristic_id": "prepared-context:family-1:ordinary",
                    "heuristic_family_id": "prepared-context:family-1"
                }
            }),
        ];

        let reprioritized = reprioritize_suggestions_by_outcome_feedback(suggestions, &feedback);
        assert_eq!(
            reprioritized[0]["id"].as_str(),
            Some("ordinary-family-match")
        );
        assert_eq!(
            reprioritized[1]["id"].as_str(),
            Some("simulator-family-match")
        );
    }

    #[test]
    fn reprioritize_suggestions_by_outcome_feedback_demotes_simulator_preview_family_matches() {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "simulator-review:family-2".to_string(),
            total: 5,
            accepted: 3,
            acceptance_rate: 0.6,
            status: "neutral".to_string(),
            scope: "family".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 30,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![
            serde_json::json!({
                "id": "simulator-reversible-preview",
                "content": {
                    "kind": "simulator_reversible_preview",
                    "heuristic_id": "simulator-review:family-2:a",
                    "heuristic_family_id": "simulator-review:family-2"
                }
            }),
            serde_json::json!({
                "id": "ordinary-family-match",
                "content": {
                    "heuristic_id": "simulator-review:family-2:b",
                    "heuristic_family_id": "simulator-review:family-2"
                }
            }),
        ];

        let reprioritized = reprioritize_suggestions_by_outcome_feedback(suggestions, &feedback);
        assert_eq!(
            reprioritized[0]["id"].as_str(),
            Some("ordinary-family-match")
        );
        assert_eq!(
            reprioritized[1]["id"].as_str(),
            Some("simulator-reversible-preview")
        );
    }

    #[test]
    fn reprioritize_suggestions_by_outcome_feedback_keeps_trusted_family_simulator_preview_at_parity()
     {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "simulator-review:family-3".to_string(),
            total: 6,
            accepted: 4,
            acceptance_rate: 0.67,
            status: "trusted".to_string(),
            scope: "family".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 30,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![
            serde_json::json!({
                "id": "simulator-approval-preview",
                "content": {
                    "kind": "simulator_approval_preview",
                    "heuristic_id": "simulator-review:family-3:a",
                    "heuristic_family_id": "simulator-review:family-3"
                }
            }),
            serde_json::json!({
                "id": "ordinary-family-match",
                "content": {
                    "heuristic_id": "simulator-review:family-3:b",
                    "heuristic_family_id": "simulator-review:family-3"
                }
            }),
        ];

        let reprioritized = reprioritize_suggestions_by_outcome_feedback(suggestions, &feedback);
        assert_eq!(
            reprioritized[0]["id"].as_str(),
            Some("simulator-approval-preview")
        );
        assert_eq!(
            reprioritized[1]["id"].as_str(),
            Some("ordinary-family-match")
        );
    }

    #[test]
    fn reprioritize_suggestions_by_outcome_feedback_keeps_trusted_family_simulator_promoted_artifact_at_parity()
     {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "prepared-context:family-2".to_string(),
            total: 6,
            accepted: 4,
            acceptance_rate: 0.67,
            status: "trusted".to_string(),
            scope: "family".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 30,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![
            serde_json::json!({
                "id": "simulator-promoted-artifact",
                "content": {
                    "heuristic_id": "prepared-context:family-2:sim",
                    "heuristic_family_id": "prepared-context:family-2",
                    "action_afp_payload": {
                        "metadata": {
                            "simulator_preview_promoted": true
                        }
                    }
                }
            }),
            serde_json::json!({
                "id": "ordinary-family-match",
                "content": {
                    "heuristic_id": "prepared-context:family-2:ordinary",
                    "heuristic_family_id": "prepared-context:family-2"
                }
            }),
        ];

        let reprioritized = reprioritize_suggestions_by_outcome_feedback(suggestions, &feedback);
        assert_eq!(
            reprioritized[0]["id"].as_str(),
            Some("simulator-promoted-artifact")
        );
        assert_eq!(
            reprioritized[1]["id"].as_str(),
            Some("ordinary-family-match")
        );
    }

    #[test]
    fn reprioritize_suggestions_by_outcome_feedback_lifts_exact_trusted_simulator_preview() {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "simulator-review:exact-1".to_string(),
            total: 7,
            accepted: 5,
            acceptance_rate: 0.71,
            status: "trusted".to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 30,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![
            serde_json::json!({
                "id": "ordinary-exact-match",
                "content": {
                    "heuristic_id": "simulator-review:exact-1"
                }
            }),
            serde_json::json!({
                "id": "simulator-exact-match",
                "content": {
                    "kind": "simulator_reversible_preview",
                    "heuristic_id": "simulator-review:exact-1"
                }
            }),
        ];

        let reprioritized = reprioritize_suggestions_by_outcome_feedback(suggestions, &feedback);
        assert_eq!(
            reprioritized[0]["id"].as_str(),
            Some("simulator-exact-match")
        );
        assert_eq!(
            reprioritized[1]["id"].as_str(),
            Some("ordinary-exact-match")
        );
    }

    #[test]
    fn reprioritize_suggestions_by_outcome_feedback_lifts_exact_trusted_simulator_promoted_artifact()
     {
        let feedback = vec![HeuristicOutcomeFeedback {
            heuristic_id: "prepared-draft:exact-1".to_string(),
            total: 7,
            accepted: 5,
            acceptance_rate: 0.71,
            status: "trusted".to_string(),
            scope: "exact".to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 30,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }];
        let suggestions = vec![
            serde_json::json!({
                "id": "ordinary-exact-match",
                "content": {
                    "heuristic_id": "prepared-draft:exact-1"
                }
            }),
            serde_json::json!({
                "id": "simulator-promoted-exact-match",
                "content": {
                    "heuristic_id": "prepared-draft:exact-1",
                    "action_afp_payload": {
                        "metadata": {
                            "simulator_preview_promoted": true
                        }
                    }
                }
            }),
        ];

        let reprioritized = reprioritize_suggestions_by_outcome_feedback(suggestions, &feedback);
        assert_eq!(
            reprioritized[0]["id"].as_str(),
            Some("simulator-promoted-exact-match")
        );
        assert_eq!(
            reprioritized[1]["id"].as_str(),
            Some("ordinary-exact-match")
        );
    }
}
