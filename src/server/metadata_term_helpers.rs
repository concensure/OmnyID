/*
 * @module-id: rust.server.metadata-term-helpers
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub(crate) fn metadata_term_rank(value: &str) -> u8 {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.starts_with("memory_space:") {
        0
    } else if normalized.starts_with("author_type:") {
        1
    } else if normalized.starts_with("author_mask:") {
        2
    } else if normalized.starts_with("follow_up_at:") {
        3
    } else if normalized.starts_with("priority:") {
        4
    } else if normalized.starts_with("status:") {
        5
    } else if normalized.starts_with("domain:") {
        6
    } else {
        7
    }
}

pub(crate) fn metadata_term_score_bonus(value: &str) -> f64 {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.starts_with("memory_space:") {
        2.0
    } else if normalized.starts_with("author_type:") {
        0.9
    } else if normalized.starts_with("author_mask:") {
        0.8
    } else if normalized.starts_with("follow_up_at:") {
        2.0
    } else if normalized.starts_with("priority:") {
        0.35
    } else if normalized.starts_with("domain:") {
        0.2
    } else {
        0.0
    }
}

pub(crate) fn metadata_term_label(value: &str) -> Option<String> {
    let (key, raw_value) = value.split_once(':')?;
    let normalized_key = key.trim().to_ascii_lowercase();
    let normalized_value = raw_value.trim().to_ascii_lowercase();
    match normalized_key.as_str() {
        "memory_space" if !normalized_value.is_empty() => Some(format!(
            "{} context",
            normalized_value.replace(['_', '-'], " ")
        )),
        "author_type" if normalized_value == "human" => Some("human authored".to_string()),
        "author_type" if normalized_value == "agent" => Some("agent authored".to_string()),
        "author_mask" if normalized_value == "private" => Some("private authored".to_string()),
        "author_mask" if normalized_value == "public" => Some("public authored".to_string()),
        "status" if !normalized_value.is_empty() => Some(format!(
            "{} status",
            normalized_value.replace(['_', '-'], " ")
        )),
        "priority" if !normalized_value.is_empty() => Some(format!(
            "{} priority",
            normalized_value.replace(['_', '-'], " ")
        )),
        "domain" if !normalized_value.is_empty() => Some(format!(
            "{} domain",
            normalized_value.replace(['_', '-'], " ")
        )),
        "follow_up_at" if !normalized_value.is_empty() => Some(format!(
            "follow-up {}",
            normalized_value.replace(['_', '-'], " ")
        )),
        _ => None,
    }
}

pub(crate) fn inject_metadata_term_cue_into_rationale(rationale: &str, cue: &str) -> String {
    let mut parts = rationale
        .split(" + ")
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.iter().any(|part| part.eq_ignore_ascii_case(cue)) {
        return rationale.to_string();
    }
    if let Some(index) = parts
        .iter()
        .position(|part| part.eq_ignore_ascii_case("strong narrowing power"))
    {
        parts.insert(index, cue);
    } else {
        parts.push(cue);
    }
    parts.join(" + ")
}

#[cfg(test)]
mod tests {
    use super::{
        inject_metadata_term_cue_into_rationale, metadata_term_label, metadata_term_rank,
        metadata_term_score_bonus,
    };

    #[test]
    fn metadata_term_rank_prioritizes_scope_and_value_facets_before_generic_terms() {
        assert!(metadata_term_rank("memory_space:work") < metadata_term_rank("follow_up_at:today"));
        assert!(metadata_term_rank("follow_up_at:today") < metadata_term_rank("status:active"));
        assert!(metadata_term_rank("status:active") < metadata_term_rank("owner:ozan"));
    }

    #[test]
    fn metadata_term_score_bonus_prefers_scope_and_follow_up_terms() {
        assert!(metadata_term_score_bonus("memory_space:work") > 0.0);
        assert!(metadata_term_score_bonus("follow_up_at:today") > 0.0);
        assert_eq!(metadata_term_score_bonus("status:active"), 0.0);
        assert_eq!(metadata_term_score_bonus("owner:ozan"), 0.0);
    }

    #[test]
    fn inject_metadata_term_cue_into_rationale_is_idempotent() {
        let cue = metadata_term_label("status:active").expect("label");
        let once = inject_metadata_term_cue_into_rationale(
            "active-state pressure + strong narrowing power",
            &cue,
        );
        let twice = inject_metadata_term_cue_into_rationale(&once, &cue);
        assert_eq!(once, twice);
    }
}
