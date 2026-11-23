/*
 * @module-id: rust.decision-outcome-diary
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Decision Outcome Diary â€” records and analyses decision outcomes over time.
///
/// Tracks the real-world result of each decision made via OmnyID:
///   - `decision_outcome:record` â€” written when the user rates an outcome
///   - `decision_outcome:review` â€” periodic aggregate (weekly/monthly/quarterly)
///
/// Outcome scores are normalised floats: positiveâ‰ˆ0.7-1.0, neutralâ‰ˆ0.0,
/// negativeâ‰ˆ-0.7 to -1.0.  The review computes aggregate stats and derives
/// plain-language insights without any LLM call.
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_DECISION_OUTCOME_RECORD, AFP_SUBTYPE_DECISION_OUTCOME_REVIEW,
    AFP_TYPE_DECISION_OUTCOME, AfpDecisionOutcomeContent, AfpDecisionOutcomeReviewContent,
    AfpOutcomeCategory,
};

// â”€â”€ Outcome constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub const OUTCOME_POSITIVE: &str = "positive";
pub const OUTCOME_NEUTRAL: &str = "neutral";
pub const OUTCOME_NEGATIVE: &str = "negative";
pub const OUTCOME_MIXED: &str = "mixed";

/// Canonical score for each outcome label.
pub fn default_outcome_score(outcome: &str) -> f32 {
    match outcome {
        OUTCOME_POSITIVE => 0.8,
        OUTCOME_NEUTRAL => 0.0,
        OUTCOME_NEGATIVE => -0.8,
        OUTCOME_MIXED => 0.2,
        _ => 0.0,
    }
}

// â”€â”€ Outcome extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Extract all `decision_outcome:record` messages in a time range from a flat
/// slice of AFP JSON messages.  Returns them in recorded_at order (oldest first).
pub fn extract_outcomes_in_range(
    messages: &[Value],
    start: &str,
    end: &str,
) -> Vec<AfpDecisionOutcomeContent> {
    let start_dt: DateTime<Utc> = match start.parse() {
        Ok(dt) => dt,
        Err(_) => return vec![],
    };
    let end_dt: DateTime<Utc> = match end.parse() {
        Ok(dt) => dt,
        Err(_) => return vec![],
    };

    let mut outcomes: Vec<AfpDecisionOutcomeContent> = messages
        .iter()
        .filter(|m| {
            m["type"].as_str() == Some(AFP_TYPE_DECISION_OUTCOME)
                && m["subtype"].as_str() == Some(AFP_SUBTYPE_DECISION_OUTCOME_RECORD)
        })
        .filter_map(|m| {
            serde_json::from_value::<AfpDecisionOutcomeContent>(m["content"].clone()).ok()
        })
        .filter(|c| {
            if let Ok(ts) = c.outcome_recorded_at.parse::<DateTime<Utc>>() {
                ts >= start_dt && ts <= end_dt
            } else {
                false
            }
        })
        .collect();

    outcomes.sort_by(|a, b| a.outcome_recorded_at.cmp(&b.outcome_recorded_at));
    outcomes
}

// â”€â”€ Analytics computation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Compute a review from a slice of outcome records and a period window.
pub fn compute_review(
    outcomes: &[AfpDecisionOutcomeContent],
    period_start: &str,
    period_end: &str,
) -> AfpDecisionOutcomeReviewContent {
    let total = outcomes.len() as u32;

    let positive_count = outcomes
        .iter()
        .filter(|o| o.outcome == OUTCOME_POSITIVE)
        .count() as u32;
    let negative_count = outcomes
        .iter()
        .filter(|o| o.outcome == OUTCOME_NEGATIVE)
        .count() as u32;
    let neutral_count = outcomes
        .iter()
        .filter(|o| o.outcome == OUTCOME_NEUTRAL)
        .count() as u32;
    let mixed_count = outcomes
        .iter()
        .filter(|o| o.outcome == OUTCOME_MIXED)
        .count() as u32;

    let avg_outcome_score = if total == 0 {
        0.0
    } else {
        outcomes.iter().map(|o| o.outcome_score).sum::<f32>() / total as f32
    };

    let avg_decision_time_ms = {
        let timed: Vec<u64> = outcomes.iter().filter_map(|o| o.decision_time_ms).collect();
        if timed.is_empty() {
            None
        } else {
            Some(timed.iter().sum::<u64>() / timed.len() as u64)
        }
    };

    let categories = aggregate_categories(outcomes);
    let insights = derive_insights(
        total,
        positive_count,
        negative_count,
        avg_outcome_score,
        &categories,
    );

    AfpDecisionOutcomeReviewContent {
        review_id: Ulid::new().to_string(),
        period_start: period_start.to_string(),
        period_end: period_end.to_string(),
        total_decisions: total,
        positive_count,
        negative_count,
        neutral_count,
        mixed_count,
        avg_outcome_score,
        avg_decision_time_ms,
        categories,
        insights,
        ..Default::default()
    }
}

// â”€â”€ Internal helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

fn aggregate_categories(outcomes: &[AfpDecisionOutcomeContent]) -> Vec<AfpOutcomeCategory> {
    use std::collections::HashMap;

    let mut map: HashMap<String, (u32, f32)> = HashMap::new();
    for o in outcomes {
        if let Some(cat) = &o.category {
            let entry = map.entry(cat.clone()).or_insert((0, 0.0));
            entry.0 += 1;
            entry.1 += o.outcome_score;
        }
    }

    let mut cats: Vec<AfpOutcomeCategory> = map
        .into_iter()
        .map(|(name, (count, score_sum))| AfpOutcomeCategory {
            name,
            count,
            avg_score: if count > 0 {
                score_sum / count as f32
            } else {
                0.0
            },
            ..Default::default()
        })
        .collect();

    cats.sort_by(|a, b| b.count.cmp(&a.count));
    cats
}

fn derive_insights(
    total: u32,
    positive_count: u32,
    negative_count: u32,
    avg_score: f32,
    categories: &[AfpOutcomeCategory],
) -> Vec<String> {
    let mut insights = Vec::new();

    if total == 0 {
        insights.push("No decisions recorded in this period.".to_string());
        return insights;
    }

    let positive_rate = positive_count as f32 / total as f32 * 100.0;
    insights.push(format!(
        "Your positive decision rate is {:.0}% this period ({positive_count}/{total}).",
        positive_rate
    ));

    if avg_score > 0.5 {
        insights.push(
            "Overall decision quality is strong â€” keep building on current patterns.".to_string(),
        );
    } else if avg_score < -0.3 {
        insights.push(
            "Decision outcomes have trended negative; consider reviewing your decision criteria."
                .to_string(),
        );
    } else {
        insights.push("Decision outcomes are mixed â€” review recurring negative categories for improvement opportunities.".to_string());
    }

    if negative_count > 0 && total > 0 {
        let negative_rate = negative_count as f32 / total as f32 * 100.0;
        if negative_rate > 40.0 {
            insights.push(format!(
                "High negative rate ({:.0}%) â€” identify common factors in poor outcomes.",
                negative_rate
            ));
        }
    }

    if let Some(top_cat) = categories.first() {
        insights.push(format!(
            "Most decisions this period were in the '{}' category ({} decisions).",
            top_cat.name, top_cat.count
        ));
        if top_cat.avg_score < -0.2 {
            insights.push(format!(
                "Average outcome in '{}' is negative â€” deeper review recommended.",
                top_cat.name
            ));
        }
    }

    insights
}

// â”€â”€ AFP builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `decision_outcome:record` AFP message.
pub fn build_outcome_record_afp(
    owner_user_id: &str,
    thread_id: &str,
    content: &AfpDecisionOutcomeContent,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "parent_id": content.decision_message_id,
        "from": "decision_outcome_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_DECISION_OUTCOME,
        "subtype": AFP_SUBTYPE_DECISION_OUTCOME_RECORD,
        "content": serde_json::to_value(content).unwrap_or(Value::Null),
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `decision_outcome:review` AFP message for a period.
pub fn build_outcome_review_afp(
    owner_user_id: &str,
    thread_id: &str,
    review: &AfpDecisionOutcomeReviewContent,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "decision_outcome_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_DECISION_OUTCOME,
        "subtype": AFP_SUBTYPE_DECISION_OUTCOME_REVIEW,
        "content": serde_json::to_value(review).unwrap_or(Value::Null),
        "metadata": { "store": true, "review": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    fn outcome_record(
        outcome: &str,
        recorded_at: &str,
        category: Option<&str>,
    ) -> AfpDecisionOutcomeContent {
        let score = default_outcome_score(outcome);
        AfpDecisionOutcomeContent {
            decision_message_id: "msg_01".to_string(),
            decision_summary: "Test decision".to_string(),
            outcome_label: outcome.to_string(),
            outcome_recorded_at: recorded_at.to_string(),
            outcome: outcome.to_string(),
            outcome_score: score,
            category: category.map(str::to_string),
            decision_time_ms: None,
            learnings: None,
            recorded_at: recorded_at.to_string(),
        }
    }

    #[test]
    fn default_outcome_score_positive() {
        assert!(default_outcome_score(OUTCOME_POSITIVE) > 0.0);
        assert!(default_outcome_score(OUTCOME_NEGATIVE) < 0.0);
        assert_eq!(default_outcome_score(OUTCOME_NEUTRAL), 0.0);
    }

    #[test]
    fn compute_review_empty() {
        let review = compute_review(&[], "2026-01-01T00:00:00Z", "2026-03-31T00:00:00Z");
        assert_eq!(review.total_decisions, 0);
        assert!((review.avg_outcome_score - 0.0).abs() < f32::EPSILON);
        assert_eq!(review.insights.len(), 1);
    }

    #[test]
    fn compute_review_counts_correctly() {
        let outcomes = vec![
            outcome_record(OUTCOME_POSITIVE, "2026-02-01T00:00:00Z", None),
            outcome_record(OUTCOME_POSITIVE, "2026-02-02T00:00:00Z", None),
            outcome_record(OUTCOME_NEGATIVE, "2026-02-03T00:00:00Z", None),
            outcome_record(OUTCOME_NEUTRAL, "2026-02-04T00:00:00Z", None),
        ];
        let review = compute_review(&outcomes, "2026-01-01T00:00:00Z", "2026-03-31T00:00:00Z");
        assert_eq!(review.total_decisions, 4);
        assert_eq!(review.positive_count, 2);
        assert_eq!(review.negative_count, 1);
        assert_eq!(review.neutral_count, 1);
    }

    #[test]
    fn compute_review_avg_score() {
        let outcomes = vec![
            outcome_record(OUTCOME_POSITIVE, "2026-02-01T00:00:00Z", None),
            outcome_record(OUTCOME_NEGATIVE, "2026-02-02T00:00:00Z", None),
        ];
        let review = compute_review(&outcomes, "2026-01-01T00:00:00Z", "2026-03-31T00:00:00Z");
        assert!((review.avg_outcome_score - 0.0).abs() < 0.01);
    }

    #[test]
    fn compute_review_categories_aggregated() {
        let outcomes = vec![
            outcome_record(OUTCOME_POSITIVE, "2026-02-01T00:00:00Z", Some("work")),
            outcome_record(OUTCOME_NEGATIVE, "2026-02-02T00:00:00Z", Some("work")),
            outcome_record(OUTCOME_POSITIVE, "2026-02-03T00:00:00Z", Some("personal")),
        ];
        let review = compute_review(&outcomes, "2026-01-01T00:00:00Z", "2026-03-31T00:00:00Z");
        let work_cat = review.categories.iter().find(|c| c.name == "work");
        assert!(work_cat.is_some());
        assert_eq!(work_cat.unwrap().count, 2);
    }

    #[test]
    fn extract_outcomes_in_range_filters() {
        let msgs = vec![
            json!({
                "type": AFP_TYPE_DECISION_OUTCOME,
                "subtype": AFP_SUBTYPE_DECISION_OUTCOME_RECORD,
                "content": outcome_record(OUTCOME_POSITIVE, "2026-03-01T00:00:00Z", None),
            }),
            json!({
                "type": AFP_TYPE_DECISION_OUTCOME,
                "subtype": AFP_SUBTYPE_DECISION_OUTCOME_RECORD,
                "content": outcome_record(OUTCOME_NEGATIVE, "2026-06-01T00:00:00Z", None),
            }),
        ];
        let result =
            extract_outcomes_in_range(&msgs, "2026-01-01T00:00:00Z", "2026-04-30T00:00:00Z");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].outcome, OUTCOME_POSITIVE);
    }

    #[test]
    fn extract_outcomes_in_range_invalid_bounds_returns_empty() {
        let msgs = vec![json!({
            "type": AFP_TYPE_DECISION_OUTCOME,
            "subtype": AFP_SUBTYPE_DECISION_OUTCOME_RECORD,
            "content": outcome_record(OUTCOME_POSITIVE, "2026-03-01T00:00:00Z", None),
        })];
        assert!(extract_outcomes_in_range(&msgs, "not-a-date", "also-not").is_empty());
    }

    #[test]
    fn insights_include_positive_rate() {
        let outcomes = vec![
            outcome_record(OUTCOME_POSITIVE, "2026-02-01T00:00:00Z", None),
            outcome_record(OUTCOME_POSITIVE, "2026-02-02T00:00:00Z", None),
            outcome_record(OUTCOME_POSITIVE, "2026-02-03T00:00:00Z", None),
        ];
        let review = compute_review(&outcomes, "2026-01-01T00:00:00Z", "2026-03-31T00:00:00Z");
        assert!(review.insights.iter().any(|i| i.contains("100%")));
    }

    #[test]
    fn build_outcome_record_afp_has_correct_type() {
        let content = outcome_record(OUTCOME_POSITIVE, "2026-02-01T00:00:00Z", None);
        let afp = build_outcome_record_afp("user_01", "thread_01", &content);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_DECISION_OUTCOME));
        assert_eq!(afp["parent_id"].as_str(), Some("msg_01"));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_DECISION_OUTCOME_RECORD)
        );
    }

    #[test]
    fn build_outcome_review_afp_has_correct_subtype() {
        let outcomes = vec![outcome_record(
            OUTCOME_NEUTRAL,
            "2026-02-01T00:00:00Z",
            None,
        )];
        let review = compute_review(&outcomes, "2026-01-01T00:00:00Z", "2026-03-31T00:00:00Z");
        let afp = build_outcome_review_afp("user_01", "thread_01", &review);
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_DECISION_OUTCOME_REVIEW)
        );
    }

    #[test]
    fn avg_decision_time_computed_when_present() {
        let mut o1 = outcome_record(OUTCOME_POSITIVE, "2026-02-01T00:00:00Z", None);
        o1.decision_time_ms = Some(3000);
        let mut o2 = outcome_record(OUTCOME_POSITIVE, "2026-02-02T00:00:00Z", None);
        o2.decision_time_ms = Some(5000);
        let review = compute_review(&[o1, o2], "2026-01-01T00:00:00Z", "2026-03-31T00:00:00Z");
        assert_eq!(review.avg_decision_time_ms, Some(4000));
    }
}
