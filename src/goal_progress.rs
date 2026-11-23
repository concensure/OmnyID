/*
 * @module-id: rust.goal-progress
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Goal Progress â€” AFP-backed goal tracking with progress ring support.
///
/// Computes progress percentages, creates milestone check-off records,
/// evaluates completion, and emits `goal_progress` AFP messages that drive
/// the GoalProgressRing UI component.
///
/// Design: progress is always computed from explicit `progress_pct` fields
/// written by the Master Agent or user â€” this module never auto-infers
/// progress from other message types to avoid false positives.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_GOAL_PROGRESS_COMPLETE, AFP_SUBTYPE_GOAL_PROGRESS_MILESTONE,
    AFP_SUBTYPE_GOAL_PROGRESS_UPDATE, AFP_TYPE_GOAL_PROGRESS, AfpGoalMilestone,
    AfpGoalProgressContent,
};

// â”€â”€ Progress constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub const GOAL_COMPLETE_THRESHOLD: f32 = 100.0;
pub const GOAL_NEAR_COMPLETE_THRESHOLD: f32 = 90.0;
pub const GOAL_LOW_PROGRESS_THRESHOLD: f32 = 20.0;

// â”€â”€ Progress computation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Derive progress percentage from milestone completion.
/// Returns 0.0 if there are no milestones.
pub fn progress_from_milestones(milestones: &[AfpGoalMilestone]) -> f32 {
    if milestones.is_empty() {
        return 0.0;
    }
    let completed = milestones.iter().filter(|m| m.completed).count();
    (completed as f32 / milestones.len() as f32) * 100.0
}

/// Clamp progress to [0.0, 100.0].
pub fn clamp_progress(pct: f32) -> f32 {
    pct.clamp(0.0, 100.0)
}

/// Determine if a goal qualifies as complete.
pub fn is_complete(pct: f32) -> bool {
    pct >= GOAL_COMPLETE_THRESHOLD
}

/// Compute the correct subtype based on progress.
pub fn subtype_for_progress(pct: f32) -> &'static str {
    if is_complete(pct) {
        AFP_SUBTYPE_GOAL_PROGRESS_COMPLETE
    } else {
        AFP_SUBTYPE_GOAL_PROGRESS_UPDATE
    }
}

// â”€â”€ Milestone helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Mark a milestone as completed, returning a new cloned Vec with the update.
pub fn complete_milestone(
    milestones: &[AfpGoalMilestone],
    milestone_id: &str,
) -> Vec<AfpGoalMilestone> {
    let now = Utc::now().to_rfc3339();
    milestones
        .iter()
        .map(|m| {
            if m.milestone_id == milestone_id {
                AfpGoalMilestone {
                    completed: true,
                    completed_at: Some(now.clone()),
                    ..m.clone()
                }
            } else {
                m.clone()
            }
        })
        .collect()
}

// â”€â”€ AFP builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `goal_progress:update` or `goal_progress:complete` AFP message.
pub fn build_goal_progress_afp(
    owner_user_id: &str,
    thread_id: &str,
    content: &AfpGoalProgressContent,
) -> Value {
    let subtype = subtype_for_progress(content.progress_pct as f32);
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "goal_progress_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_GOAL_PROGRESS,
        "subtype": subtype,
        "content": serde_json::to_value(content).unwrap_or(Value::Null),
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

/// Build a `goal_progress:milestone` AFP message when a milestone is checked off.
pub fn build_milestone_afp(
    owner_user_id: &str,
    thread_id: &str,
    goal_id: &str,
    goal_title: &str,
    milestone: &AfpGoalMilestone,
    new_progress_pct: f32,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "goal_progress_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_GOAL_PROGRESS,
        "subtype": AFP_SUBTYPE_GOAL_PROGRESS_MILESTONE,
        "content": {
            "goal_id": goal_id,
            "goal_title": goal_title,
            "milestone_id": &milestone.milestone_id,
            "milestone_title": &milestone.title,
            "completed_at": milestone.completed_at.as_deref().unwrap_or(""),
            "new_progress_pct": new_progress_pct,
        },
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Goal extraction from thread â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Extract the most recent `goal_progress` content for each unique goal_id
/// from a flat slice of AFP JSON messages (already parsed).
pub fn extract_latest_goals(messages: &[Value]) -> Vec<AfpGoalProgressContent> {
    use std::collections::HashMap;
    let mut latest: HashMap<String, (String, AfpGoalProgressContent)> = HashMap::new();

    for msg in messages {
        if msg["type"].as_str() != Some(AFP_TYPE_GOAL_PROGRESS) {
            continue;
        }
        let content: AfpGoalProgressContent = match serde_json::from_value(msg["content"].clone()) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let ts = msg["timestamp"].as_str().unwrap_or("").to_string();
        let entry = latest
            .entry(content.goal_id.clone())
            .or_insert_with(|| (ts.clone(), content.clone()));
        if ts > entry.0 {
            *entry = (ts, content);
        }
    }

    latest.into_values().map(|(_, c)| c).collect()
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    fn milestone(id: &str, completed: bool) -> AfpGoalMilestone {
        AfpGoalMilestone {
            milestone_id: id.to_string(),
            title: Some(format!("Milestone {id}")),
            completed,
            ..Default::default()
        }
    }

    #[test]
    fn progress_from_milestones_all_complete() {
        let ms = vec![milestone("m1", true), milestone("m2", true)];
        assert!((progress_from_milestones(&ms) - 100.0).abs() < f32::EPSILON);
    }

    #[test]
    fn progress_from_milestones_half_complete() {
        let ms = vec![milestone("m1", true), milestone("m2", false)];
        assert!((progress_from_milestones(&ms) - 50.0).abs() < f32::EPSILON);
    }

    #[test]
    fn progress_from_milestones_empty() {
        assert!((progress_from_milestones(&[]) - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn clamp_progress_caps_at_100() {
        assert!((clamp_progress(120.0) - 100.0).abs() < f32::EPSILON);
    }

    #[test]
    fn clamp_progress_floors_at_0() {
        assert!((clamp_progress(-5.0) - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn complete_milestone_marks_one_entry() {
        let ms = vec![milestone("m1", false), milestone("m2", false)];
        let updated = complete_milestone(&ms, "m1");
        assert!(updated[0].completed);
        assert!(!updated[1].completed);
        assert!(updated[0].completed_at.is_some());
    }

    #[test]
    fn subtype_is_complete_at_100() {
        assert_eq!(
            subtype_for_progress(100.0),
            AFP_SUBTYPE_GOAL_PROGRESS_COMPLETE
        );
    }

    #[test]
    fn subtype_is_update_below_100() {
        assert_eq!(subtype_for_progress(75.0), AFP_SUBTYPE_GOAL_PROGRESS_UPDATE);
    }

    #[test]
    fn build_goal_progress_afp_type() {
        let content = AfpGoalProgressContent {
            goal_id: "goal_01".into(),
            goal_label: "Ship OmnyID".into(),
            progress_pct: 60.0,
            updated_at: Utc::now().to_rfc3339(),
            ..Default::default()
        };
        let afp = build_goal_progress_afp("user_01", "thread_01", &content);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_GOAL_PROGRESS));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_GOAL_PROGRESS_UPDATE)
        );
    }

    #[test]
    fn extract_latest_goals_deduplicates_by_goal_id() {
        let now = Utc::now();
        let earlier = (now - chrono::Duration::hours(1)).to_rfc3339();
        let later = now.to_rfc3339();
        let msgs = vec![
            json!({
                "type": AFP_TYPE_GOAL_PROGRESS,
                "timestamp": earlier,
                "content": { "goal_id": "g1", "goal_label": "Goal", "progress_pct": 30.0, "updated_at": earlier }
            }),
            json!({
                "type": AFP_TYPE_GOAL_PROGRESS,
                "timestamp": later,
                "content": { "goal_id": "g1", "goal_label": "Goal", "progress_pct": 60.0, "updated_at": later }
            }),
        ];
        let goals = extract_latest_goals(&msgs);
        assert_eq!(goals.len(), 1);
        assert!((goals[0].progress_pct - 60.0).abs() < f64::EPSILON);
    }
}
