/*
 * @module-id: rust.server.value-signal-helpers
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub(crate) fn context_pack_value_rank(
    pack_kind: &str,
    evidence_kinds: &[String],
    why_surfaced: &str,
) -> (u8, u8, u8) {
    let pack_rank = if pack_kind == "obligation_pack" { 0 } else { 1 };
    let evidence_rank = if evidence_kinds
        .iter()
        .any(|kind| matches!(kind.as_str(), "follow_up" | "decision"))
    {
        0
    } else if evidence_kinds
        .iter()
        .any(|kind| matches!(kind.as_str(), "project" | "reference" | "relationship"))
    {
        1
    } else {
        2
    };
    let urgency_rank = context_pack_urgency_rank(why_surfaced);
    (pack_rank, evidence_rank, urgency_rank)
}

pub(crate) fn context_pack_urgency_rank(reason: &str) -> u8 {
    let normalized = reason.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return 2;
    }
    if normalized.contains("due")
        || normalized.contains("overdue")
        || normalized.contains("active follow-up")
        || normalized.contains("stacked")
    {
        return 0;
    }
    if normalized.contains("current")
        || normalized.contains("linked")
        || normalized.contains("stale")
    {
        return 1;
    }
    2
}

#[cfg(test)]
mod tests {
    use super::{context_pack_urgency_rank, context_pack_value_rank};

    #[test]
    fn context_pack_value_rank_prefers_obligation_and_follow_up_evidence() {
        let obligation = context_pack_value_rank(
            "obligation_pack",
            &["follow_up".to_string()],
            "Surfaced from due commitments and active follow-up pressure.",
        );
        let generic = context_pack_value_rank(
            "topic_pack",
            &["reference".to_string()],
            "Surfaced from linked current topic context.",
        );
        assert!(obligation < generic);
    }

    #[test]
    fn context_pack_urgency_rank_marks_due_language_as_stronger() {
        assert!(
            context_pack_urgency_rank("Due follow-up stack")
                < context_pack_urgency_rank("Linked current topic")
        );
    }
}
