/*
 * @module-id: rust.server.summary-helpers
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub(crate) fn reference_summary_line(
    prefix: &str,
    preferred_labels: &[String],
    fallback_refs: &[String],
    max_items: Option<usize>,
    trailing_period: bool,
) -> Option<String> {
    let values = if preferred_labels
        .iter()
        .any(|label| !label.trim().is_empty())
    {
        preferred_labels
            .iter()
            .filter_map(|label| {
                let trimmed = label.trim();
                (!trimmed.is_empty()).then_some(trimmed.to_string())
            })
            .collect::<Vec<_>>()
    } else {
        fallback_refs
            .iter()
            .filter_map(|reference| {
                let trimmed = reference.trim();
                (!trimmed.is_empty()).then_some(trimmed.to_string())
            })
            .collect::<Vec<_>>()
    };
    if values.is_empty() {
        return None;
    }
    let visible = if let Some(limit) = max_items {
        values.into_iter().take(limit).collect::<Vec<_>>()
    } else {
        values
    };
    let suffix = if trailing_period { "." } else { "" };
    Some(format!("{prefix}: {}{suffix}", visible.join(", ")))
}

pub(crate) fn counted_item_line(
    prefix: &str,
    count: usize,
    singular: &str,
    plural: &str,
    trailing_period: bool,
) -> Option<String> {
    let phrase = counted_noun_phrase(count, singular, plural)?;
    let suffix = if trailing_period { "." } else { "" };
    Some(format!("{prefix} {phrase}{suffix}"))
}

pub(crate) fn list_summary_line(
    prefix: &str,
    values: &[String],
    trailing_period: bool,
) -> Option<String> {
    let visible = values
        .iter()
        .filter_map(|value| {
            let trimmed = value.trim();
            (!trimmed.is_empty()).then_some(trimmed.to_string())
        })
        .collect::<Vec<_>>();
    if visible.is_empty() {
        return None;
    }
    let suffix = if trailing_period { "." } else { "" };
    Some(format!("{prefix}: {}{suffix}", visible.join(", ")))
}

pub(crate) fn counted_noun_phrase(count: usize, singular: &str, plural: &str) -> Option<String> {
    if count == 0 {
        return None;
    }
    let noun = if count == 1 { singular } else { plural };
    Some(format!("{count} {noun}"))
}

#[cfg(test)]
mod tests {
    use super::{
        counted_item_line, counted_noun_phrase, list_summary_line, reference_summary_line,
    };

    #[test]
    fn reference_summary_line_prefers_labels_and_trims() {
        assert_eq!(
            reference_summary_line(
                "Object anchors",
                &["  project aurora  ".to_string(), "".to_string()],
                &["obj:1".to_string()],
                None,
                false,
            ),
            Some("Object anchors: project aurora".to_string())
        );
    }

    #[test]
    fn reference_summary_line_falls_back_and_can_truncate_with_period() {
        assert_eq!(
            reference_summary_line(
                "Object anchors",
                &[],
                &[
                    "obj:1".to_string(),
                    "obj:2".to_string(),
                    "obj:3".to_string()
                ],
                Some(2),
                true,
            ),
            Some("Object anchors: obj:1, obj:2.".to_string())
        );
    }

    #[test]
    fn counted_item_line_handles_zero_and_pluralization() {
        assert_eq!(
            counted_item_line(
                "Includes",
                0,
                "linked file reference",
                "linked file references",
                true
            ),
            None
        );
        assert_eq!(
            counted_item_line(
                "Includes",
                1,
                "linked file reference",
                "linked file references",
                true
            ),
            Some("Includes 1 linked file reference.".to_string())
        );
        assert_eq!(
            counted_item_line(
                "Carries",
                2,
                "decision-history reference",
                "decision-history references",
                true
            ),
            Some("Carries 2 decision-history references.".to_string())
        );
    }

    #[test]
    fn list_summary_line_trims_and_skips_empty_values() {
        assert_eq!(
            list_summary_line(
                "File refs",
                &[
                    "  docs/spec.md  ".to_string(),
                    "".to_string(),
                    "notes/todo.md".to_string()
                ],
                false,
            ),
            Some("File refs: docs/spec.md, notes/todo.md".to_string())
        );
    }

    #[test]
    fn counted_noun_phrase_handles_zero_and_pluralization() {
        assert_eq!(
            counted_noun_phrase(0, "context pack", "context packs"),
            None
        );
        assert_eq!(
            counted_noun_phrase(1, "context pack", "context packs"),
            Some("1 context pack".to_string())
        );
        assert_eq!(
            counted_noun_phrase(3, "context pack", "context packs"),
            Some("3 context packs".to_string())
        );
    }
}
