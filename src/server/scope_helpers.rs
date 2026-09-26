/*
 * @module-id: rust.server.scope-helpers
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub(crate) fn scope_rank(
    memory_space: Option<&str>,
    author_mask: Option<&str>,
    author_type: Option<&str>,
    author_id: Option<&str>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
) -> u8 {
    let human_only = human_only.unwrap_or(false);
    let is_human_authored = is_human_authored.unwrap_or(false);
    let author_type = author_type.unwrap_or_default().trim().to_ascii_lowercase();
    let author_mask = author_mask.unwrap_or_default().trim().to_ascii_lowercase();
    let memory_space = memory_space.unwrap_or_default().trim();
    let author_id = author_id.unwrap_or_default().trim();

    if human_only || is_human_authored || author_type == "human" {
        0
    } else if !memory_space.is_empty()
        || !author_id.is_empty()
        || matches!(author_mask.as_str(), "private" | "work")
    {
        1
    } else {
        2
    }
}

pub(crate) fn scope_summary_line(
    memory_space: Option<&str>,
    author_type: Option<&str>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
) -> Option<String> {
    let memory_space = memory_space
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let human_grounded = human_only.unwrap_or(false)
        || is_human_authored.unwrap_or(false)
        || matches!(author_type.map(str::trim), Some("human"));

    match (memory_space, human_grounded) {
        (Some(space), true) => Some(format!("Scope: {space} context, human-grounded")),
        (Some(space), false) => Some(format!("Scope: {space} context")),
        (None, true) => Some("Scope: human-grounded".to_string()),
        (None, false) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{scope_rank, scope_summary_line};

    #[test]
    fn scope_rank_prefers_human_grounding_before_generic_scope() {
        assert!(
            scope_rank(
                Some("work"),
                Some("private"),
                Some("human"),
                Some("user_01"),
                Some(true),
                Some(false),
            ) < scope_rank(
                Some("work"),
                Some("private"),
                Some("agent"),
                None,
                Some(false),
                Some(false),
            )
        );
    }

    #[test]
    fn scope_summary_line_matches_existing_grounded_phrasing() {
        assert_eq!(
            scope_summary_line(Some("work"), Some("human"), Some(true), Some(false)).as_deref(),
            Some("Scope: work context, human-grounded")
        );
        assert_eq!(
            scope_summary_line(None, Some("human"), Some(true), Some(false)).as_deref(),
            Some("Scope: human-grounded")
        );
    }
}
