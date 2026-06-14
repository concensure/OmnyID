use serde::{Deserialize, Serialize};
use serde_json::Value;

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
                heuristic_id,
                total,
                accepted,
                acceptance_rate,
                status: status.to_string(),
                scope: "exact".to_string(),
                suggested_suppression_hours: suppression_hours,
                suggested_half_life_days: half_life_days,
            }
        })
        .collect();

    feedback.sort_by(|left, right| left.heuristic_id.cmp(&right.heuristic_id));
    feedback
}

pub fn summarize_family_outcome_rates(rates: &[Value]) -> Vec<HeuristicOutcomeFeedback> {
    let mut feedback = summarize_outcome_rates(rates);
    for item in &mut feedback {
        item.scope = "family".to_string();
        item.status = downgrade_family_feedback_status(&item.status).to_string();
        if item.status != "suppressed" {
            item.suggested_suppression_hours = None;
        }
    }
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
    ema_states: &std::collections::HashMap<String, serde_json::Value>,
) -> Vec<HeuristicOutcomeFeedback> {
    let mut feedback: Vec<HeuristicOutcomeFeedback> = rates
        .iter()
        .map(|rate| {
            let heuristic_id = rate
                .get("heuristic_id")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string();
            let total = rate.get("total").and_then(serde_json::Value::as_i64).unwrap_or(0);
            let accepted = rate.get("accepted").and_then(serde_json::Value::as_i64).unwrap_or(0);
            let acceptance_rate = rate
                .get("acceptance_rate")
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(0.0)
                .clamp(0.0, 1.0);

            let thresholds = ema_states
                .get(&heuristic_id)
                .map(|s| {
                    let delta = s["last_threshold_delta"].as_f64().unwrap_or(0.0);
                    FeedbackThresholds::default().apply_delta(delta)
                })
                .unwrap_or_default();

            let (status, suppression_hours, half_life_days) =
                derive_feedback_fields_with_thresholds(total, acceptance_rate, &thresholds);

            HeuristicOutcomeFeedback {
                heuristic_id,
                total,
                accepted,
                acceptance_rate,
                status: status.to_string(),
                scope: "exact".to_string(),
                suggested_suppression_hours: suppression_hours,
                suggested_half_life_days: half_life_days,
            }
        })
        .collect();

    feedback.sort_by(|l, r| l.heuristic_id.cmp(&r.heuristic_id));
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
            return 2usize;
        };
        outcome_feedback_priority(&match_feedback.status, &match_feedback.scope)
    });
    suggestions
}

fn derive_feedback_fields(total: i64, acceptance_rate: f64) -> (&'static str, Option<u32>, u32) {
    derive_feedback_fields_with_thresholds(total, acceptance_rate, &FeedbackThresholds::default())
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
        self.suppress_below  = (self.suppress_below  + delta).clamp(0.05, 0.60);
        self.cooldown_below  = (self.cooldown_below  + delta).clamp(0.15, 0.70);
        self.reinforce_above = (self.reinforce_above + delta).clamp(0.50, 0.95);
        self.trusted_above   = (self.trusted_above   + delta).clamp(0.40, 0.90);
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

fn suggestion_feedback_entry<'a>(
    suggestion: &Value,
    feedback: &'a [HeuristicOutcomeFeedback],
) -> Option<&'a HeuristicOutcomeFeedback> {
    let content = suggestion.get("content")?;
    let heuristic_id = content.get("heuristic_id").and_then(Value::as_str);
    if let Some(heuristic_id) = heuristic_id {
        if let Some(exact_match) = feedback.iter().find(|item| item.heuristic_id == heuristic_id) {
            return Some(exact_match);
        }
    }

    let explicit_family_id = content
        .get("heuristic_family_id")
        .and_then(Value::as_str);
    if let Some(family_id) = explicit_family_id {
        return feedback.iter().find(|item| item.heuristic_id == family_id);
    }

    heuristic_id
        .map(crate::db::proactive_heuristic_family_id)
        .and_then(|family_id| feedback.iter().find(|item| item.heuristic_id == family_id))
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
}
