/*
 * @module-id: rust.server.continuity-ranking-helpers
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub(crate) type ContinuityPreparedDraftRank = (u8, u8, u8, u8, u8);
pub(crate) type ContinuityPreparedDraftAlignmentRank = (u8, u8, u8, u8, u8);
pub(crate) type ContinuityContextPackRank = ((u8, u8, u8), u8, u8, std::cmp::Reverse<usize>, u8);

pub(crate) fn prepared_draft_scope_rank(
    memory_space: Option<&str>,
    author_mask: Option<&str>,
    author_type: Option<&str>,
    author_id: Option<&str>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
) -> u8 {
    crate::server::scope_helpers::scope_rank(
        memory_space,
        author_mask,
        author_type,
        author_id,
        is_human_authored,
        human_only,
    )
}

pub(crate) fn prepared_draft_timing_rank(response_due_hint: &str) -> u8 {
    crate::timing_hints::due_hint_timing_rank(response_due_hint)
}

pub(crate) fn prepared_draft_value_rank(draft_class: &str, selection_reason: Option<&str>) -> u8 {
    crate::prepared_draft_semantics::prepared_draft_value_rank(draft_class, selection_reason)
}

pub(crate) fn source_refs_alignment_rank(
    source_refs: &[String],
    preferred_source_refs: Option<&[String]>,
) -> u8 {
    let Some(preferred_source_refs) = preferred_source_refs else {
        return 1;
    };
    if preferred_source_refs.is_empty() {
        return 1;
    }
    if source_refs.iter().any(|source_ref| {
        preferred_source_refs
            .iter()
            .any(|preferred_ref| preferred_ref == source_ref)
    }) {
        0
    } else {
        1
    }
}

pub(crate) fn source_refs_evidence_rank(source_refs: &[String]) -> u8 {
    source_count_evidence_rank(source_refs.len())
}

pub(crate) fn source_count_evidence_rank(source_count: usize) -> u8 {
    match source_count {
        3.. => 0,
        2 => 1,
        _ => 2,
    }
}

pub(crate) fn context_pack_scope_rank(
    memory_space: Option<&str>,
    author_mask: Option<&str>,
    author_type: Option<&str>,
    author_id: Option<&str>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
) -> u8 {
    crate::server::scope_helpers::scope_rank(
        memory_space,
        author_mask,
        author_type,
        author_id,
        is_human_authored,
        human_only,
    )
}

pub(crate) fn context_pack_file_rank(file_refs: &[String], file_labels: &[String]) -> u8 {
    file_signal_rank(file_refs.len(), file_labels.len())
}

pub(crate) fn file_signal_rank(file_ref_count: usize, file_label_count: usize) -> u8 {
    if file_ref_count > 0 || file_label_count > 0 {
        0
    } else {
        1
    }
}

pub(crate) fn context_pack_value_rank(
    pack_kind: &str,
    evidence_kinds: &[String],
    why_surfaced: &str,
) -> (u8, u8, u8) {
    crate::server::value_signal_helpers::context_pack_value_rank(
        pack_kind,
        evidence_kinds,
        why_surfaced,
    )
}

pub(crate) fn continuity_prepared_draft_rank(
    draft_class: &str,
    selection_reason: Option<&str>,
    memory_space: Option<&str>,
    author_mask: Option<&str>,
    author_type: Option<&str>,
    author_id: Option<&str>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
    response_due_hint: &str,
    file_alignment_rank: u8,
    source_refs: &[String],
) -> ContinuityPreparedDraftRank {
    (
        prepared_draft_value_rank(draft_class, selection_reason),
        prepared_draft_scope_rank(
            memory_space,
            author_mask,
            author_type,
            author_id,
            is_human_authored,
            human_only,
        ),
        prepared_draft_timing_rank(response_due_hint),
        file_alignment_rank,
        source_refs_evidence_rank(source_refs),
    )
}

pub(crate) fn continuity_prepared_draft_alignment_rank(
    memory_space: Option<&str>,
    author_mask: Option<&str>,
    author_type: Option<&str>,
    author_id: Option<&str>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
    response_due_hint: &str,
    file_alignment_rank: u8,
    source_refs: &[String],
    draft_class: &str,
    selection_reason: Option<&str>,
) -> ContinuityPreparedDraftAlignmentRank {
    (
        prepared_draft_scope_rank(
            memory_space,
            author_mask,
            author_type,
            author_id,
            is_human_authored,
            human_only,
        ),
        prepared_draft_timing_rank(response_due_hint),
        prepared_draft_value_rank(draft_class, selection_reason),
        file_alignment_rank,
        source_refs_evidence_rank(source_refs),
    )
}

pub(crate) fn continuity_context_pack_rank(
    pack_kind: &str,
    evidence_kinds: &[String],
    why_surfaced: &str,
    memory_space: Option<&str>,
    author_mask: Option<&str>,
    author_type: Option<&str>,
    author_id: Option<&str>,
    is_human_authored: Option<bool>,
    human_only: Option<bool>,
    file_refs: &[String],
    file_labels: &[String],
    reference_ref_count: usize,
    source_refs: &[String],
) -> ContinuityContextPackRank {
    (
        context_pack_value_rank(pack_kind, evidence_kinds, why_surfaced),
        context_pack_scope_rank(
            memory_space,
            author_mask,
            author_type,
            author_id,
            is_human_authored,
            human_only,
        ),
        context_pack_file_rank(file_refs, file_labels),
        std::cmp::Reverse(reference_ref_count),
        source_refs_evidence_rank(source_refs),
    )
}

#[cfg(test)]
mod tests {
    use super::{
        context_pack_file_rank, file_signal_rank, prepared_draft_timing_rank,
        prepared_draft_value_rank, source_count_evidence_rank, source_refs_alignment_rank,
        source_refs_evidence_rank,
    };

    #[test]
    fn source_refs_alignment_rank_prefers_overlap_with_preferred_refs() {
        let source_refs = vec!["thread:1".to_string(), "file:2".to_string()];
        let preferred = vec!["file:2".to_string()];
        assert_eq!(
            source_refs_alignment_rank(&source_refs, Some(&preferred)),
            0
        );
        assert_eq!(source_refs_alignment_rank(&source_refs, Some(&[])), 1);
        assert_eq!(source_refs_alignment_rank(&source_refs, None), 1);
    }

    #[test]
    fn source_refs_evidence_rank_prefers_more_sources() {
        assert!(
            source_refs_evidence_rank(&["a".to_string(), "b".to_string(), "c".to_string()])
                < source_refs_evidence_rank(&["a".to_string()])
        );
        assert!(source_count_evidence_rank(3) < source_count_evidence_rank(1));
    }

    #[test]
    fn context_pack_file_rank_prefers_file_linked_packs() {
        assert_eq!(context_pack_file_rank(&["file:1".to_string()], &[]), 0);
        assert_eq!(context_pack_file_rank(&[], &["Doc".to_string()]), 0);
        assert_eq!(context_pack_file_rank(&[], &[]), 1);
        assert_eq!(file_signal_rank(1, 0), 0);
        assert_eq!(file_signal_rank(0, 1), 0);
        assert_eq!(file_signal_rank(0, 0), 1);
    }

    #[test]
    fn prepared_draft_helpers_delegate_to_existing_semantics() {
        assert!(prepared_draft_timing_rank("Today") < prepared_draft_timing_rank("Next week"));
        assert!(
            prepared_draft_value_rank("decision_memo", Some("Decision review needed."))
                < prepared_draft_value_rank("communication_reply", Some("Reply later this week."))
        );
    }
}
