/*
 * @module-id: rust.server.ranking-helpers
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub(crate) fn cmp_weighted_value(
    left_value: &str,
    left_count: usize,
    left_weight: f64,
    right_value: &str,
    right_count: usize,
    right_weight: f64,
) -> std::cmp::Ordering {
    right_weight
        .partial_cmp(&left_weight)
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| right_count.cmp(&left_count))
        .then_with(|| left_value.cmp(right_value))
}

pub(crate) fn cmp_weighted_metadata_term_value(
    left_value: &str,
    left_count: usize,
    left_weight: f64,
    right_value: &str,
    right_count: usize,
    right_weight: f64,
) -> std::cmp::Ordering {
    right_weight
        .partial_cmp(&left_weight)
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| right_count.cmp(&left_count))
        .then_with(|| {
            crate::server::metadata_term_helpers::metadata_term_rank(left_value).cmp(
                &crate::server::metadata_term_helpers::metadata_term_rank(right_value),
            )
        })
        .then_with(|| left_value.cmp(right_value))
}

pub(crate) fn cmp_scored_value(
    left_value: &str,
    left_count: usize,
    left_score: f64,
    right_value: &str,
    right_count: usize,
    right_score: f64,
) -> std::cmp::Ordering {
    right_score
        .partial_cmp(&left_score)
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| right_count.cmp(&left_count))
        .then_with(|| left_value.cmp(right_value))
}

pub(crate) fn cmp_scored_metadata_term_value(
    left_value: &str,
    left_count: usize,
    left_score: f64,
    right_value: &str,
    right_count: usize,
    right_score: f64,
) -> std::cmp::Ordering {
    right_score
        .partial_cmp(&left_score)
        .unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| right_count.cmp(&left_count))
        .then_with(|| {
            crate::server::metadata_term_helpers::metadata_term_rank(left_value).cmp(
                &crate::server::metadata_term_helpers::metadata_term_rank(right_value),
            )
        })
        .then_with(|| left_value.cmp(right_value))
}

#[cfg(test)]
mod tests {
    use super::{
        cmp_scored_metadata_term_value, cmp_scored_value, cmp_weighted_metadata_term_value,
        cmp_weighted_value,
    };

    #[test]
    fn weighted_metadata_term_cmp_prefers_higher_weight_then_metadata_rank() {
        assert_eq!(
            cmp_weighted_metadata_term_value("memory_space:work", 2, 4.0, "status:active", 2, 4.0),
            std::cmp::Ordering::Less
        );
        assert_eq!(
            cmp_weighted_value("b", 2, 5.0, "a", 2, 4.0),
            std::cmp::Ordering::Less
        );
    }

    #[test]
    fn scored_metadata_term_cmp_prefers_higher_score_then_metadata_rank() {
        assert_eq!(
            cmp_scored_metadata_term_value("priority:high", 2, 5.0, "status:active", 2, 5.0),
            std::cmp::Ordering::Less
        );
        assert_eq!(
            cmp_scored_value("b", 2, 5.0, "a", 2, 4.0),
            std::cmp::Ordering::Less
        );
    }
}
