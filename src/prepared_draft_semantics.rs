/*
 * @module-id: rust.prepared-draft-semantics
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub fn follow_up_proposal_from_draft_semantics(
    draft_class: &str,
    due_hint: &str,
) -> Option<String> {
    let trimmed = due_hint.trim();
    if trimmed.is_empty() {
        return None;
    }
    match draft_class.trim() {
        "communication_reply" | "follow_up_draft" => Some(trimmed.to_string()),
        _ => None,
    }
}

pub fn prepared_draft_destination_view(draft_class: &str) -> &'static str {
    match draft_class.trim() {
        "communication_reply" => "response_queue",
        "comparison_table" | "decision_memo" => "decision_queue",
        _ => "home",
    }
}

pub fn prepared_draft_action_label(draft_class: &str) -> &'static str {
    match prepared_draft_destination_view(draft_class) {
        "response_queue" => "Open responses",
        "decision_queue" => "Open decision queue",
        _ => "Open workspace",
    }
}

pub fn prepared_draft_boundary_hint(
    draft_class: &str,
    requires_approval: bool,
    readiness: &str,
    response_due_hint: &str,
) -> Option<String> {
    if requires_approval {
        return Some(
            "Opens a review step first; no external action runs without approval.".to_string(),
        );
    }
    match draft_class.trim() {
        "comparison_table" | "decision_memo" => Some(
            "Opens prepared decision support without committing to a final action.".to_string(),
        ),
        "communication_reply" => {
            Some("Opens a prepared reply for review; sending remains explicitly gated.".to_string())
        }
        "follow_up_draft" => {
            Some("Resumes follow-up context before any outbound step is taken.".to_string())
        }
        "project_prep_note" | "meeting_brief" | "task_bundle" => {
            Some("Opens prepared work for review rather than executing a side effect.".to_string())
        }
        _ if readiness == "ready_now"
            || crate::timing_hints::due_hint_is_immediate(response_due_hint) =>
        {
            Some("Opens the prepared item immediately for review.".to_string())
        }
        _ => None,
    }
}

pub fn should_promote_prepared_draft_class(draft_class: &str) -> bool {
    matches!(
        draft_class.trim(),
        "communication_reply"
            | "comparison_table"
            | "decision_memo"
            | "follow_up_draft"
            | "meeting_brief"
            | "project_prep_note"
            | "task_bundle"
    )
}

pub fn prepared_draft_value_rank(draft_class: &str, selection_reason: Option<&str>) -> u8 {
    let selection_reason = selection_reason
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let draft_class = draft_class.trim().to_ascii_lowercase();

    if matches!(
        draft_class.as_str(),
        "follow_up_draft" | "decision_memo" | "comparison_table"
    ) || selection_reason.contains("obligation")
        || selection_reason.contains("follow-up")
        || selection_reason.contains("follow up")
        || selection_reason.contains("decision")
        || selection_reason.contains("approval")
        || selection_reason.contains("commitment")
    {
        return 0;
    }

    if selection_reason.contains("reply")
        || selection_reason.contains("deadline")
        || selection_reason.contains("due")
        || selection_reason.contains("urgent")
    {
        return 1;
    }

    2
}

pub fn follow_up_timing_summary_line(follow_up_at: Option<&str>) -> Option<String> {
    let follow_up_at = follow_up_at
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    Some(format!("Follow-up timing: {follow_up_at}"))
}

pub fn follow_up_timing_summary_line_unless_present(
    follow_up_at: Option<&str>,
    existing_summary: Option<&str>,
) -> Option<String> {
    let normalized_follow_up_at = follow_up_at
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    if existing_summary.is_some_and(|summary| {
        let lower_summary = summary.to_ascii_lowercase();
        let lower_timing = normalized_follow_up_at.to_ascii_lowercase();
        lower_summary.contains(&lower_timing) && lower_summary.contains("timing")
    }) {
        return None;
    }
    follow_up_timing_summary_line(Some(normalized_follow_up_at))
}

#[cfg(test)]
mod tests {
    use super::{
        follow_up_proposal_from_draft_semantics, follow_up_timing_summary_line,
        follow_up_timing_summary_line_unless_present, prepared_draft_action_label,
        prepared_draft_boundary_hint, prepared_draft_destination_view, prepared_draft_value_rank,
        should_promote_prepared_draft_class,
    };

    #[test]
    fn follow_up_proposal_only_applies_to_reply_like_drafts() {
        assert_eq!(
            follow_up_proposal_from_draft_semantics("communication_reply", "Today").as_deref(),
            Some("Today")
        );
        assert_eq!(
            follow_up_proposal_from_draft_semantics("follow_up_draft", "This week").as_deref(),
            Some("This week")
        );
        assert_eq!(
            follow_up_proposal_from_draft_semantics("decision_memo", "Today"),
            None
        );
    }

    #[test]
    fn follow_up_timing_summary_ignores_empty_values() {
        assert_eq!(follow_up_timing_summary_line(None), None);
        assert_eq!(follow_up_timing_summary_line(Some("   ")), None);
        assert_eq!(
            follow_up_timing_summary_line(Some("Today")).as_deref(),
            Some("Follow-up timing: Today")
        );
    }

    #[test]
    fn follow_up_timing_summary_suppresses_duplicate_timing_copy() {
        assert_eq!(
            follow_up_timing_summary_line_unless_present(
                Some("Today"),
                Some("Follow-up timing: Today"),
            ),
            None
        );
        assert_eq!(
            follow_up_timing_summary_line_unless_present(
                Some("Today"),
                Some("Prepared reply ready."),
            )
            .as_deref(),
            Some("Follow-up timing: Today")
        );
    }

    #[test]
    fn prepared_draft_class_helpers_keep_view_and_actions_consistent() {
        assert_eq!(
            prepared_draft_destination_view("communication_reply"),
            "response_queue"
        );
        assert_eq!(
            prepared_draft_destination_view("decision_memo"),
            "decision_queue"
        );
        assert_eq!(
            prepared_draft_action_label("decision_memo"),
            "Open decision queue"
        );
        assert!(should_promote_prepared_draft_class("project_prep_note"));
        assert!(!should_promote_prepared_draft_class("unknown"));
    }

    #[test]
    fn prepared_draft_boundary_hint_preserves_class_specific_review_copy() {
        assert_eq!(
            prepared_draft_boundary_hint("follow_up_draft", false, "ready", "This week").as_deref(),
            Some("Resumes follow-up context before any outbound step is taken.")
        );
        assert_eq!(
            prepared_draft_boundary_hint("unknown", false, "ready_now", "Today").as_deref(),
            Some("Opens the prepared item immediately for review.")
        );
    }

    #[test]
    fn prepared_draft_value_rank_prefers_follow_up_and_decision_heavier_drafts() {
        assert!(
            prepared_draft_value_rank(
                "follow_up_draft",
                Some("Active follow-up commitment on this thread."),
            ) < prepared_draft_value_rank("communication_reply", Some("Generic reply path."))
        );
        assert!(
            prepared_draft_value_rank("decision_memo", Some("Decision review needed."))
                < prepared_draft_value_rank("communication_reply", Some("Reply later this week."))
        );
    }
}
