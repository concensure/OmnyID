// @locs-version: 1.0
// @module-id: server.thread-discovery
// @primary-capability: thread-discovery-http-routes
// @stability: beta

use super::*;
use crate::server::types::DashboardThreadSummary;
use chrono::{DateTime, Utc};
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
pub(crate) struct ThreadFacetSuggestion {
    value: String,
    count: usize,
}

#[derive(Clone, Debug, Default)]
struct WeightedThreadFacetSuggestionAggregate {
    count: usize,
    weight: f64,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq)]
pub(crate) struct ThreadFacetNextMove {
    value: String,
    count: usize,
    score: f64,
    rationale: String,
}

#[derive(Clone, Debug, Default)]
struct WeightedThreadFacetAggregate {
    count: usize,
    weight: f64,
    state_hits: usize,
    continuity_hits: usize,
    fresh_hits: usize,
    stale_hits: usize,
}

pub(super) fn discovery_kind_bonus(kind: Option<&str>) -> i32 {
    match kind.unwrap_or_default() {
        "task" | "project" | "decision" | "relationship" => 5,
        "note" | "meeting" | "resource" | "database_view" | "chat_thread" => 4,
        _ if kind.is_some() => 2,
        _ => 0,
    }
}

pub(super) fn discovery_supertag_bonus(tags: &[String]) -> i32 {
    let mut score = 0;
    for tag in tags {
        if tag.starts_with("project:")
            || tag.starts_with("area:")
            || tag.starts_with("resource:")
            || tag.starts_with("topic:")
        {
            score += 2;
        } else {
            score += 1;
        }
    }
    score.min(6)
}

pub(super) fn discovery_type_bonus(message_type: &str) -> i32 {
    match message_type {
        "ledger" | "relation_link" | "file_ledger" => 3,
        "proactive_suggestion" | "action" | "agent" => 1,
        _ => 0,
    }
}

pub(super) fn discovery_score(message: &crate::afp::Message) -> i32 {
    discovery_kind_bonus(message.kind.as_deref())
        + discovery_supertag_bonus(&message.supertags)
        + discovery_type_bonus(&message.r#type)
}

pub(super) fn rank_bootstrap_messages(
    mut messages: Vec<crate::afp::Message>,
    limit: usize,
) -> Vec<crate::afp::Message> {
    messages.sort_by(|a, b| {
        discovery_score(b)
            .cmp(&discovery_score(a))
            .then_with(|| b.timestamp.cmp(&a.timestamp))
            .then_with(|| a.id.cmp(&b.id))
    });
    messages.dedup_by(|a, b| a.id == b.id);
    messages.truncate(limit);
    messages
}

fn thread_title_from_messages(thread_id: &str, messages: &[AFPMessage]) -> String {
    let summary = crate::workspace_filesystem::latest_thread_summary(messages)
        .map(|summary| summary.summary_text)
        .filter(|text| !text.trim().is_empty());
    let fallback = messages.iter().find_map(|message| {
        let content = message.content.as_object()?;
        [
            "title",
            "summary",
            "description",
            "query",
            "text",
            "body",
            "intent",
        ]
        .iter()
        .find_map(|key| content.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
    });
    let raw = summary
        .or(fallback)
        .unwrap_or_else(|| thread_id.to_string());
    if raw.chars().count() <= 72 {
        raw
    } else {
        let short = raw.chars().take(72).collect::<String>();
        format!("{}...", short.trim_end())
    }
}

fn thread_preview_from_messages(messages: &[AFPMessage]) -> String {
    let raw = messages
        .iter()
        .rev()
        .find_map(|message| {
            let content = message.content.as_object()?;
            ["summary", "text", "body", "description"]
                .iter()
                .find_map(|key| content.get(*key).and_then(Value::as_str))
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        })
        .unwrap_or_default();
    if raw.chars().count() <= 120 {
        raw
    } else {
        let short = raw.chars().take(120).collect::<String>();
        format!("{}...", short.trim_end())
    }
}

fn collect_thread_metadata_term_counts(
    value: &Value,
    path: &mut Vec<String>,
    counts: &mut HashMap<String, usize>,
) {
    match value {
        Value::Null => {}
        Value::Bool(flag) => {
            if let Some(key) = path.last() {
                let term = format!("{}:{}", key.to_ascii_lowercase(), flag);
                *counts.entry(term).or_insert(0) += 1;
            }
        }
        Value::Number(number) => {
            if let Some(key) = path.last() {
                let term = format!("{}:{}", key.to_ascii_lowercase(), number);
                *counts.entry(term).or_insert(0) += 1;
            }
        }
        Value::String(text) => {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                if let Some(key) = path.last() {
                    let term = format!("{}:{}", key.to_ascii_lowercase(), trimmed);
                    *counts.entry(term).or_insert(0) += 1;
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_thread_metadata_term_counts(item, path, counts);
            }
        }
        Value::Object(map) => {
            for (key, nested) in map {
                path.push(key.clone());
                collect_thread_metadata_term_counts(nested, path, counts);
                path.pop();
            }
        }
    }
}

fn thread_metadata_term_values(messages: &[AFPMessage]) -> Vec<String> {
    let mut counts = HashMap::new();
    for message in messages {
        if let Some(metadata) = message.metadata.as_ref() {
            let mut path = vec!["metadata".to_string()];
            collect_thread_metadata_term_counts(metadata, &mut path, &mut counts);
        }
        if let Some(content_metadata) = message.content.get("metadata") {
            let mut path = vec!["content".to_string(), "metadata".to_string()];
            collect_thread_metadata_term_counts(content_metadata, &mut path, &mut counts);
        }
    }
    let mut values = counts.into_keys().collect::<Vec<_>>();
    values.sort();
    values
}

fn thread_scope_metadata_terms(messages: &[AFPMessage]) -> Vec<String> {
    let mut memory_spaces = BTreeSet::new();
    let mut author_types = BTreeSet::new();
    let mut author_masks = BTreeSet::new();

    for term in thread_metadata_term_values(messages) {
        if let Some(value) = term.strip_prefix("memory_space:") {
            if !value.trim().is_empty() {
                memory_spaces.insert(format!(
                    "memory_space:{}",
                    value.trim().to_ascii_lowercase()
                ));
            }
            continue;
        }
        if let Some(value) = term.strip_prefix("author_type:") {
            if !value.trim().is_empty() {
                author_types.insert(format!("author_type:{}", value.trim().to_ascii_lowercase()));
            }
            continue;
        }
        if let Some(value) = term.strip_prefix("author_mask:") {
            if !value.trim().is_empty() {
                author_masks.insert(format!("author_mask:{}", value.trim().to_ascii_lowercase()));
            }
        }
    }

    memory_spaces
        .into_iter()
        .chain(author_types)
        .chain(author_masks)
        .take(4)
        .collect()
}

fn thread_metadata_term_bonus(messages: &[AFPMessage], metadata_terms: &[String]) -> i32 {
    if metadata_terms.is_empty() {
        return 0;
    }
    let available = thread_metadata_term_values(messages);
    let matched = metadata_terms
        .iter()
        .filter(|term| {
            available
                .iter()
                .any(|existing| existing.eq_ignore_ascii_case(term))
        })
        .count() as i32;
    (matched * 2).min(4)
}

fn thread_metadata_term_tiebreak(messages: &[AFPMessage], metadata_terms: &[String]) -> i32 {
    if metadata_terms.is_empty() {
        return 0;
    }
    let available = thread_metadata_term_values(messages);
    metadata_terms
        .iter()
        .filter(|term| {
            available
                .iter()
                .any(|existing| existing.eq_ignore_ascii_case(term))
        })
        .map(|term| {
            100_i32
                - i32::from(crate::server::metadata_term_helpers::metadata_term_rank(
                    term,
                ))
        })
        .sum()
}

fn thread_pressure_labels(
    query: Option<&str>,
    supertags: &[String],
    reference_targets: &[String],
    metadata_values: &[String],
    metadata_terms: &[String],
    thread_ids: &[String],
    from_agents: &[String],
    time_from: Option<&str>,
    time_to: Option<&str>,
    kind_filter: Option<&str>,
) -> Vec<String> {
    let mut labels = Vec::new();
    if query.is_some_and(|value| !value.trim().is_empty()) {
        labels.push("text-guided".to_string());
    }
    if !supertags.is_empty() {
        labels.push("tag-filtered".to_string());
    }
    if !reference_targets.is_empty() {
        labels.push("object-linked".to_string());
    }
    if !metadata_terms.is_empty() {
        labels.push("exact-metadata-filtered".to_string());
    } else if !metadata_values.is_empty() {
        labels.push("metadata-filtered".to_string());
    }
    if !thread_ids.is_empty() {
        labels.push("thread-scoped".to_string());
    }
    if !from_agents.is_empty() {
        labels.push("sender-scoped".to_string());
    }
    if time_from.is_some() || time_to.is_some() {
        labels.push("time-windowed".to_string());
    }
    if kind_filter.is_some_and(|value| !value.trim().is_empty()) {
        labels.push("kind-focused".to_string());
    }
    labels
}

fn thread_support_labels_from_next_moves(facet_next_moves: &Value) -> Vec<String> {
    let mut joined = String::new();
    for key in ["kinds", "tags", "metadata_terms"] {
        if let Some(entries) = facet_next_moves.get(key).and_then(Value::as_array) {
            for entry in entries.iter().take(8) {
                if let Some(rationale) = entry.get("rationale").and_then(Value::as_str) {
                    if !joined.is_empty() {
                        joined.push_str(" || ");
                    }
                    joined.push_str(&rationale.to_ascii_lowercase());
                }
            }
        }
    }

    let mut labels = Vec::new();
    if joined.contains("fresh thread support") {
        labels.push("fresh-thread supported".to_string());
    }
    if joined.contains("older thread support") {
        labels.push("older-thread supported".to_string());
    }
    labels
}

fn humanize_thread_retrieval_summary_label(label: &str) -> String {
    match label.trim() {
        "text-guided" => "text guided".to_string(),
        "tag-filtered" => "tag filtered".to_string(),
        "object-linked" => "object linked".to_string(),
        "exact-metadata-filtered" => "exact-metadata filtered".to_string(),
        "metadata-filtered" => "metadata filtered".to_string(),
        "thread-scoped" => "thread scoped".to_string(),
        "sender-scoped" => "sender scoped".to_string(),
        "time-windowed" => "time windowed".to_string(),
        "kind-focused" => "kind focused".to_string(),
        "fresh-thread supported" => "fresh thread support".to_string(),
        "older-thread supported" => "older thread support".to_string(),
        other => other.to_string(),
    }
}

fn retrieval_scope_badges_from_metadata_terms(metadata_terms: &[String]) -> Vec<String> {
    let mut badges = Vec::new();
    for term in metadata_terms {
        let Some((key, value)) = term.split_once(':') else {
            continue;
        };
        let normalized_key = key.trim().to_ascii_lowercase();
        let normalized_value = value.trim().to_ascii_lowercase();
        match normalized_key.as_str() {
            "memory_space" if !normalized_value.is_empty() => {
                let badge = format!("{} context", normalized_value.replace(['_', '-'], " "));
                if !badges.iter().any(|existing| existing == &badge) {
                    badges.push(badge);
                }
            }
            "author_type" if normalized_value == "human" => {
                let badge = "human authored".to_string();
                if !badges.iter().any(|existing| existing == &badge) {
                    badges.push(badge);
                }
            }
            "author_type" if normalized_value == "agent" => {
                let badge = "agent authored".to_string();
                if !badges.iter().any(|existing| existing == &badge) {
                    badges.push(badge);
                }
            }
            "author_mask" if normalized_value == "private" => {
                let badge = "private authored".to_string();
                if !badges.iter().any(|existing| existing == &badge) {
                    badges.push(badge);
                }
            }
            "author_mask" if normalized_value == "public" => {
                let badge = "public authored".to_string();
                if !badges.iter().any(|existing| existing == &badge) {
                    badges.push(badge);
                }
            }
            "status" if !normalized_value.is_empty() => {
                let badge = format!("{} status", normalized_value.replace(['_', '-'], " "));
                if !badges.iter().any(|existing| existing == &badge) {
                    badges.push(badge);
                }
            }
            "priority" if !normalized_value.is_empty() => {
                let badge = format!("{} priority", normalized_value.replace(['_', '-'], " "));
                if !badges.iter().any(|existing| existing == &badge) {
                    badges.push(badge);
                }
            }
            "domain" if !normalized_value.is_empty() => {
                let badge = format!("{} domain", normalized_value.replace(['_', '-'], " "));
                if !badges.iter().any(|existing| existing == &badge) {
                    badges.push(badge);
                }
            }
            "follow_up_at" if !normalized_value.is_empty() => {
                let badge = format!("follow-up {}", normalized_value.replace(['_', '-'], " "));
                if !badges.iter().any(|existing| existing == &badge) {
                    badges.push(badge);
                }
            }
            _ => {}
        }
    }
    badges
}

fn retrieval_scope_summary_from_badges(scope_badges: &[String]) -> Option<String> {
    match scope_badges {
        [] => None,
        [only] => Some(format!("Scoped to {only}.")),
        [first, second] => Some(format!("Scoped to {first} and {second}.")),
        _ => Some(format!(
            "Scoped to {}, and {}.",
            scope_badges[..scope_badges.len() - 1].join(", "),
            scope_badges.last().cloned().unwrap_or_default()
        )),
    }
}

fn thread_summary_state_weight(summary: &DashboardThreadSummary) -> f64 {
    let base = 1.0 + (summary.score as f64 / 10.0);
    let depth_bonus = ((summary.message_count as f64).min(6.0)) / 12.0;
    (base + depth_bonus) * thread_activity_freshness_weight(summary.activity_freshness.as_str())
}

fn thread_activity_freshness_weight(freshness: &str) -> f64 {
    match freshness {
        "fresh" => 1.1,
        "active" => 1.0,
        "stale" => 0.9,
        _ => 1.0,
    }
}

fn normalize_thread_facet_suggestions(
    aggregates: HashMap<String, WeightedThreadFacetSuggestionAggregate>,
    excluded: &[String],
    limit: usize,
) -> Vec<ThreadFacetSuggestion> {
    let mut suggestions = aggregates
        .into_iter()
        .filter(|(value, _)| !excluded.iter().any(|existing| existing == value))
        .map(|(value, aggregate)| {
            (
                ThreadFacetSuggestion {
                    value,
                    count: aggregate.count,
                },
                aggregate.weight,
            )
        })
        .collect::<Vec<_>>();
    suggestions.sort_by(|(left, left_weight), (right, right_weight)| {
        crate::server::ranking_helpers::cmp_weighted_value(
            &left.value,
            left.count,
            *left_weight,
            &right.value,
            right.count,
            *right_weight,
        )
    });
    let mut suggestions = suggestions
        .into_iter()
        .map(|(suggestion, _)| suggestion)
        .collect::<Vec<_>>();
    suggestions.truncate(limit);
    suggestions
}

fn normalize_thread_metadata_term_suggestions(
    aggregates: HashMap<String, WeightedThreadFacetSuggestionAggregate>,
    excluded: &[String],
    limit: usize,
) -> Vec<ThreadFacetSuggestion> {
    let mut suggestions = aggregates
        .into_iter()
        .filter(|(value, _)| !excluded.iter().any(|existing| existing == value))
        .map(|(value, aggregate)| {
            (
                ThreadFacetSuggestion {
                    value,
                    count: aggregate.count,
                },
                aggregate.weight,
            )
        })
        .collect::<Vec<_>>();
    suggestions.sort_by(|(left, left_weight), (right, right_weight)| {
        crate::server::ranking_helpers::cmp_weighted_metadata_term_value(
            &left.value,
            left.count,
            *left_weight,
            &right.value,
            right.count,
            *right_weight,
        )
    });
    let mut suggestions = suggestions
        .into_iter()
        .map(|(suggestion, _)| suggestion)
        .collect::<Vec<_>>();
    suggestions.truncate(limit);
    suggestions
}

fn thread_next_move_rationale(aggregate: &WeightedThreadFacetAggregate, coverage: f64) -> String {
    let mut parts = Vec::new();
    if aggregate.state_hits > 0 {
        parts.push("active-state pressure");
    }
    if aggregate.continuity_hits > 0 {
        parts.push("local continuity");
    }
    if coverage <= 0.8 {
        parts.push("strong narrowing power");
    }
    if aggregate.fresh_hits > aggregate.stale_hits {
        parts.push("fresh thread support");
    } else if aggregate.stale_hits > aggregate.fresh_hits {
        parts.push("older thread support");
    }
    if parts.is_empty() {
        parts.push("broad neighborhood coverage");
    }
    parts.join(" + ")
}

fn normalize_thread_facet_next_moves(
    aggregates: HashMap<String, WeightedThreadFacetAggregate>,
    total: usize,
    excluded: &[String],
    limit: usize,
) -> Vec<ThreadFacetNextMove> {
    if total == 0 {
        return Vec::new();
    }
    let total_f64 = total as f64;
    let mut moves = aggregates
        .into_iter()
        .filter(|(value, _)| !excluded.iter().any(|existing| existing == value))
        .filter_map(|(value, aggregate)| {
            let coverage = aggregate.count as f64 / total_f64;
            if !(0.0..1.0).contains(&coverage) {
                return None;
            }
            let discriminative = coverage * (1.0 - coverage);
            let state_bias = aggregate.weight / aggregate.count as f64;
            let continuity_bonus = if aggregate.continuity_hits > 0 {
                0.12
            } else {
                0.0
            };
            let score = discriminative * 2.6 + state_bias * 0.35 + continuity_bonus;
            Some(ThreadFacetNextMove {
                rationale: thread_next_move_rationale(&aggregate, coverage),
                value,
                count: aggregate.count,
                score,
            })
        })
        .collect::<Vec<_>>();
    moves.sort_by(|a, b| {
        crate::server::ranking_helpers::cmp_scored_value(
            &a.value, a.count, a.score, &b.value, b.count, b.score,
        )
    });
    moves.truncate(limit);
    moves
}

fn normalize_thread_metadata_term_next_moves(
    aggregates: HashMap<String, WeightedThreadFacetAggregate>,
    total: usize,
    excluded: &[String],
    limit: usize,
) -> Vec<ThreadFacetNextMove> {
    let mut moves = normalize_thread_facet_next_moves(aggregates, total, excluded, usize::MAX);
    for entry in &mut moves {
        if let Some(scope_cue) =
            crate::server::metadata_term_helpers::metadata_term_label(&entry.value)
        {
            entry.rationale =
                crate::server::metadata_term_helpers::inject_metadata_term_cue_into_rationale(
                    &entry.rationale,
                    &scope_cue,
                );
        }
    }
    moves.sort_by(|a, b| {
        crate::server::ranking_helpers::cmp_scored_metadata_term_value(
            &a.value, a.count, a.score, &b.value, b.count, b.score,
        )
    });
    moves.truncate(limit);
    moves
}

pub(crate) fn thread_discovery_retrieval_state(
    query: Option<&str>,
    supertags: &[String],
    reference_targets: &[String],
    metadata_values: &[String],
    metadata_terms: &[String],
    thread_ids: &[String],
    from_agents: &[String],
    time_from: Option<&str>,
    time_to: Option<&str>,
    kind_filter: Option<&str>,
    facet_next_moves: Option<&Value>,
    summaries: &[DashboardThreadSummary],
) -> Value {
    let mut badges = thread_pressure_labels(
        query,
        supertags,
        reference_targets,
        metadata_values,
        metadata_terms,
        thread_ids,
        from_agents,
        time_from,
        time_to,
        kind_filter,
    );
    let scope_badges = retrieval_scope_badges_from_metadata_terms(metadata_terms);
    for label in &scope_badges {
        if !badges.iter().any(|existing| existing == label) {
            badges.push(label.clone());
        }
    }
    if let Some(facet_next_moves) = facet_next_moves {
        for label in thread_support_labels_from_next_moves(facet_next_moves) {
            if !badges.iter().any(|existing| existing == &label) {
                badges.push(label);
            }
        }
    }
    let mut summary_parts = Vec::new();
    if !badges.is_empty() {
        let rendered = badges
            .iter()
            .map(|label| humanize_thread_retrieval_summary_label(label))
            .collect::<Vec<_>>();
        summary_parts.push(format!("Thread discovery is {}.", rendered.join(", ")));
    }
    if let Some(scope_summary) = retrieval_scope_summary_from_badges(&scope_badges) {
        summary_parts.push(scope_summary);
    }
    if let Some(facet_next_moves) = facet_next_moves {
        if let Some(narrowing_summary) = best_thread_scope_narrowing_summary(facet_next_moves) {
            summary_parts.push(narrowing_summary);
        }
    }
    if let Some((badge, detail)) = thread_discovery_concentration_cue(summaries) {
        if !badges.iter().any(|existing| existing == badge) {
            badges.push(badge.to_string());
        }
        summary_parts.push(detail);
    }
    if let Some(top_summary) = summaries.first() {
        if let Some(kind) = top_summary
            .dominant_kind
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            summary_parts.push(format!("Top surfaced thread is {kind}-heavy."));
        }
        if let Some(detail) =
            thread_activity_freshness_summary(top_summary.activity_freshness.as_str())
        {
            let badge = format!("{}-top-thread", top_summary.activity_freshness);
            if !badges.iter().any(|existing| existing == &badge) {
                badges.push(badge);
            }
            summary_parts.push(detail.to_string());
        }
        if let Some(tag) = top_summary
            .supertags
            .first()
            .filter(|value| !value.is_empty())
        {
            summary_parts.push(format!("Leading neighborhood cue: {tag}."));
        }
    }
    let observability = thread_discovery_observability_state(
        query,
        supertags,
        reference_targets,
        metadata_values,
        metadata_terms,
        thread_ids,
        from_agents,
        time_from,
        time_to,
        kind_filter,
        facet_next_moves,
        summaries,
        &scope_badges,
    );
    serde_json::json!({
        "summary": summary_parts.join(" "),
        "badges": badges,
        "observability": observability,
    })
}

fn thread_discovery_observability_state(
    query: Option<&str>,
    supertags: &[String],
    reference_targets: &[String],
    metadata_values: &[String],
    metadata_terms: &[String],
    thread_ids: &[String],
    from_agents: &[String],
    time_from: Option<&str>,
    time_to: Option<&str>,
    kind_filter: Option<&str>,
    facet_next_moves: Option<&Value>,
    summaries: &[DashboardThreadSummary],
    scope_badges: &[String],
) -> Value {
    let active_filter_count = usize::from(query.is_some_and(|value| !value.trim().is_empty()))
        + supertags.len()
        + reference_targets.len()
        + metadata_values.len()
        + metadata_terms.len()
        + thread_ids.len()
        + from_agents.len()
        + usize::from(time_from.is_some())
        + usize::from(time_to.is_some())
        + usize::from(kind_filter.is_some());
    let narrowing_mode = if !scope_badges.is_empty() {
        "workspace_scoped"
    } else if !supertags.is_empty()
        || !reference_targets.is_empty()
        || !metadata_values.is_empty()
        || !metadata_terms.is_empty()
        || !thread_ids.is_empty()
        || !from_agents.is_empty()
        || time_from.is_some()
        || time_to.is_some()
        || kind_filter.is_some()
    {
        "facet_scoped"
    } else if query.is_some_and(|value| !value.trim().is_empty()) {
        "text_guided"
    } else {
        "broad"
    };
    let concentration_mode = match thread_discovery_concentration_cue(summaries) {
        Some(("mixed neighborhood", _)) => Some("mixed_neighborhood"),
        Some(_) => Some("kind_concentrated"),
        None => None,
    };
    let next_best_narrowing = facet_next_moves
        .and_then(best_thread_scope_narrowing_summary)
        .map(|summary| summary.trim_end_matches('.').to_string());

    serde_json::json!({
        "active_filter_count": active_filter_count,
        "narrowing_mode": narrowing_mode,
        "result_count": summaries.len(),
        "scope_badge_count": scope_badges.len(),
        "top_kind": summaries
            .first()
            .and_then(|summary| summary.dominant_kind.as_deref())
            .filter(|value| !value.is_empty()),
        "top_activity_freshness": summaries
            .first()
            .map(|summary| summary.activity_freshness.as_str())
            .filter(|value| !value.is_empty()),
        "concentration_mode": concentration_mode,
        "next_best_narrowing": next_best_narrowing,
    })
}

fn best_thread_scope_narrowing_summary(facet_next_moves: &Value) -> Option<String> {
    let entries = facet_next_moves.get("metadata_terms")?.as_array()?;
    for entry in entries {
        let value = entry.get("value")?.as_str()?;
        if let Some(label) = crate::server::metadata_term_helpers::metadata_term_label(value) {
            return Some(format!("Next best narrowing: {label}."));
        }
    }
    None
}

fn thread_discovery_concentration_cue(
    summaries: &[DashboardThreadSummary],
) -> Option<(&'static str, String)> {
    let leading_kinds = summaries
        .iter()
        .take(3)
        .filter_map(|summary| {
            summary
                .dominant_kind
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.to_ascii_lowercase())
        })
        .collect::<Vec<_>>();
    if leading_kinds.len() < 2 {
        return None;
    }

    let unique_kinds = leading_kinds.iter().cloned().collect::<HashSet<_>>();
    if unique_kinds.len() == 1 {
        let kind = leading_kinds
            .first()
            .cloned()
            .unwrap_or_else(|| "work".to_string());
        return Some((
            "kind-concentrated",
            format!("Top results stay concentrated around {kind} work."),
        ));
    }

    Some((
        "mixed neighborhood",
        format!(
            "Top results remain mixed across {} work kinds.",
            unique_kinds.len()
        ),
    ))
}

fn thread_activity_freshness(
    last_message_at: &str,
    latest_message_at: Option<&DateTime<Utc>>,
) -> &'static str {
    let Some(latest_message_at) = latest_message_at else {
        return "";
    };
    let Ok(parsed) = DateTime::parse_from_rfc3339(last_message_at) else {
        return "";
    };
    let age_hours = (*latest_message_at - parsed.with_timezone(&Utc)).num_hours();
    if age_hours <= 72 {
        "fresh"
    } else if age_hours <= 24 * 14 {
        "active"
    } else {
        "stale"
    }
}

fn thread_activity_freshness_summary(freshness: &str) -> Option<&'static str> {
    match freshness {
        "fresh" => Some("Top surfaced thread is still fresh in the current result window."),
        "active" => Some("Top surfaced thread remains active within the current result window."),
        "stale" => Some("Top surfaced thread is older context that still ranks highly."),
        _ => None,
    }
}

pub(crate) fn thread_discovery_facet_suggestions(
    summaries: &[DashboardThreadSummary],
    supertags: &[String],
    metadata_terms: &[String],
    kind_filter: Option<&str>,
) -> Value {
    let mut kind_aggregates = HashMap::<String, WeightedThreadFacetSuggestionAggregate>::new();
    let mut tag_aggregates = HashMap::<String, WeightedThreadFacetSuggestionAggregate>::new();
    let mut metadata_term_aggregates =
        HashMap::<String, WeightedThreadFacetSuggestionAggregate>::new();

    for summary in summaries {
        let weight = thread_summary_state_weight(summary);
        if let Some(kind) = summary
            .dominant_kind
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let aggregate = kind_aggregates
                .entry(kind.to_ascii_lowercase())
                .or_default();
            aggregate.count += 1;
            aggregate.weight += weight;
        }
        for tag in &summary.supertags {
            let normalized = tag.trim().to_ascii_lowercase();
            if !normalized.is_empty() {
                let aggregate = tag_aggregates.entry(normalized).or_default();
                aggregate.count += 1;
                aggregate.weight += weight;
            }
        }
        for metadata_term in &summary.metadata_terms {
            let normalized = metadata_term.trim().to_ascii_lowercase();
            if normalized.is_empty() {
                continue;
            }
            let aggregate = metadata_term_aggregates.entry(normalized).or_default();
            aggregate.count += 1;
            aggregate.weight += weight;
        }
    }

    let kind_excluded = kind_filter
        .map(|value| vec![value.trim().to_ascii_lowercase()])
        .unwrap_or_default();

    serde_json::json!({
        "kinds": normalize_thread_facet_suggestions(kind_aggregates, &kind_excluded, 8),
        "tags": normalize_thread_facet_suggestions(tag_aggregates, supertags, 10),
        "metadata_terms": normalize_thread_metadata_term_suggestions(metadata_term_aggregates, metadata_terms, 6),
    })
}

pub(crate) fn thread_discovery_facet_next_moves(
    summaries: &[DashboardThreadSummary],
    supertags: &[String],
    metadata_terms: &[String],
    kind_filter: Option<&str>,
) -> Value {
    let top_thread_id = summaries.first().map(|summary| summary.thread_id.as_str());
    let top_kind = summaries
        .first()
        .and_then(|summary| summary.dominant_kind.as_deref())
        .map(|value| value.trim().to_ascii_lowercase());
    let top_tags = summaries
        .first()
        .map(|summary| {
            summary
                .supertags
                .iter()
                .map(|tag| tag.trim().to_ascii_lowercase())
                .filter(|tag| !tag.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut kind_aggregates = HashMap::<String, WeightedThreadFacetAggregate>::new();
    let mut tag_aggregates = HashMap::<String, WeightedThreadFacetAggregate>::new();
    let top_metadata_terms = summaries
        .first()
        .map(|summary| {
            summary
                .metadata_terms
                .iter()
                .map(|term| term.trim().to_ascii_lowercase())
                .filter(|term| !term.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut metadata_term_aggregates = HashMap::<String, WeightedThreadFacetAggregate>::new();

    for summary in summaries {
        let weight = thread_summary_state_weight(summary);
        if let Some(kind) = summary
            .dominant_kind
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let normalized = kind.to_ascii_lowercase();
            let aggregate = kind_aggregates.entry(normalized.clone()).or_default();
            aggregate.count += 1;
            aggregate.weight += weight;
            if weight > 1.4 {
                aggregate.state_hits += 1;
            }
            if summary.activity_freshness == "fresh" {
                aggregate.fresh_hits += 1;
            } else if summary.activity_freshness == "stale" {
                aggregate.stale_hits += 1;
            }
            if top_thread_id == Some(summary.thread_id.as_str())
                || top_kind.as_deref() == Some(normalized.as_str())
            {
                aggregate.continuity_hits += 1;
            }
        }
        for tag in &summary.supertags {
            let normalized = tag.trim().to_ascii_lowercase();
            if normalized.is_empty() {
                continue;
            }
            let aggregate = tag_aggregates.entry(normalized.clone()).or_default();
            aggregate.count += 1;
            aggregate.weight += weight;
            if weight > 1.4 {
                aggregate.state_hits += 1;
            }
            if summary.activity_freshness == "fresh" {
                aggregate.fresh_hits += 1;
            } else if summary.activity_freshness == "stale" {
                aggregate.stale_hits += 1;
            }
            if top_thread_id == Some(summary.thread_id.as_str())
                || top_tags.iter().any(|existing| existing == &normalized)
            {
                aggregate.continuity_hits += 1;
            }
        }
        for metadata_term in &summary.metadata_terms {
            let normalized = metadata_term.trim().to_ascii_lowercase();
            if normalized.is_empty() {
                continue;
            }
            let aggregate = metadata_term_aggregates
                .entry(normalized.clone())
                .or_default();
            aggregate.count += 1;
            aggregate.weight += weight;
            if weight > 1.4 {
                aggregate.state_hits += 1;
            }
            if summary.activity_freshness == "fresh" {
                aggregate.fresh_hits += 1;
            } else if summary.activity_freshness == "stale" {
                aggregate.stale_hits += 1;
            }
            if top_thread_id == Some(summary.thread_id.as_str())
                || top_metadata_terms
                    .iter()
                    .any(|existing| existing == &normalized)
            {
                aggregate.continuity_hits += 1;
            }
        }
    }

    let kind_excluded = kind_filter
        .map(|value| vec![value.trim().to_ascii_lowercase()])
        .unwrap_or_default();

    serde_json::json!({
        "kinds": normalize_thread_facet_next_moves(kind_aggregates, summaries.len(), &kind_excluded, 4),
        "tags": normalize_thread_facet_next_moves(tag_aggregates, summaries.len(), supertags, 6),
        "metadata_terms": normalize_thread_metadata_term_next_moves(metadata_term_aggregates, summaries.len(), metadata_terms, 4),
    })
}

fn build_thread_summaries_for_query(
    messages: &[AFPMessage],
    metadata_terms: &[String],
) -> Vec<DashboardThreadSummary> {
    let latest_message_at = messages
        .iter()
        .filter_map(|message| DateTime::parse_from_rfc3339(&message.timestamp).ok())
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .max();
    let mut grouped = BTreeMap::<String, Vec<AFPMessage>>::new();
    for message in messages {
        grouped
            .entry(message.thread_id.clone())
            .or_default()
            .push(message.clone());
    }

    let mut summaries = grouped
        .into_iter()
        .map(|(thread_id, thread_messages)| {
            let score = thread_messages
                .iter()
                .map(|message| {
                    discovery_kind_bonus(message.kind.as_deref())
                        + discovery_supertag_bonus(&message.supertags)
                        + discovery_type_bonus(&message.r#type)
                })
                .max()
                .unwrap_or_default()
                + thread_metadata_term_bonus(&thread_messages, metadata_terms);
            let metadata_tiebreak = thread_metadata_term_tiebreak(&thread_messages, metadata_terms);
            let dominant_kind = thread_messages
                .iter()
                .find_map(|message| message.kind.clone());
            let mut supertags = Vec::<String>::new();
            for message in &thread_messages {
                for tag in &message.supertags {
                    if !supertags.iter().any(|existing| existing == tag) {
                        supertags.push(tag.clone());
                    }
                }
            }
            let last_message_at = thread_messages
                .last()
                .map(|message| message.timestamp.clone())
                .unwrap_or_default();
            let activity_freshness =
                thread_activity_freshness(&last_message_at, latest_message_at.as_ref()).to_string();
            (
                DashboardThreadSummary {
                    title: thread_title_from_messages(&thread_id, &thread_messages),
                    preview: thread_preview_from_messages(&thread_messages),
                    message_count: thread_messages.len(),
                    last_message_at,
                    activity_freshness,
                    dominant_kind,
                    supertags,
                    metadata_terms: thread_scope_metadata_terms(&thread_messages),
                    score,
                    thread_id,
                },
                metadata_tiebreak,
            )
        })
        .collect::<Vec<_>>();

    summaries.sort_by(|(a, a_tiebreak), (b, b_tiebreak)| {
        b.score
            .cmp(&a.score)
            .then_with(|| b_tiebreak.cmp(a_tiebreak))
            .then_with(|| b.last_message_at.cmp(&a.last_message_at))
            .then_with(|| a.thread_id.cmp(&b.thread_id))
    });
    summaries.into_iter().map(|(summary, _)| summary).collect()
}

pub(super) fn build_thread_summaries(messages: &[AFPMessage]) -> Vec<DashboardThreadSummary> {
    build_thread_summaries_for_query(messages, &[])
}

fn thread_matches_kind_filter(messages: &[AFPMessage], kind_filter: Option<&str>) -> bool {
    let Some(kind_filter) = kind_filter else {
        return true;
    };
    messages.iter().any(|message| {
        message
            .kind
            .as_deref()
            .map(|kind| kind.eq_ignore_ascii_case(kind_filter))
            .unwrap_or(false)
    })
}

pub(crate) async fn load_ranked_thread_summaries(
    db: &Db,
    owner_user_id: &str,
    query: Option<&str>,
    supertags: &[String],
    reference_targets: &[String],
    metadata_values: &[String],
    metadata_terms: &[String],
    thread_ids: &[String],
    from_agents: &[String],
    time_from: Option<&str>,
    time_to: Option<&str>,
    kind_filter: Option<&str>,
    match_all_supertags: bool,
    limit: i64,
) -> Result<Vec<DashboardThreadSummary>, sqlx::Error> {
    let thread_ids = db
        .search_private_thread_ids(
            owner_user_id,
            query,
            supertags,
            reference_targets,
            metadata_values,
            metadata_terms,
            thread_ids,
            from_agents,
            time_from,
            time_to,
            match_all_supertags,
            limit,
        )
        .await?;
    let mut messages = Vec::new();

    for thread_id in thread_ids {
        let private_messages = db.get_private_thread(owner_user_id, &thread_id).await?;
        if private_messages.is_empty() {
            continue;
        }
        let public_messages = db.get_thread(&thread_id).await?;
        let merged = crate::server::auth::merge_thread_messages(private_messages, public_messages);
        let app_messages = merged.into_iter().map(proto_to_app).collect::<Vec<_>>();
        if thread_matches_kind_filter(&app_messages, kind_filter) {
            messages.extend(app_messages);
        }
    }

    let mut summaries = build_thread_summaries_for_query(&messages, metadata_terms);
    summaries.truncate(limit.max(1) as usize);
    Ok(summaries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn message(
        id: &str,
        thread_id: &str,
        timestamp: &str,
        message_type: &str,
        kind: Option<&str>,
        supertags: &[&str],
        content: serde_json::Value,
    ) -> AFPMessage {
        AFPMessage {
            protocol: "afp-v1".to_string(),
            id: id.to_string(),
            thread_id: thread_id.to_string(),
            parent_id: None,
            from: "omnyid://user/test".to_string(),
            to: vec!["omnyid://workspace/user".to_string()],
            timestamp: timestamp.to_string(),
            r#type: message_type.to_string(),
            kind: kind.map(str::to_string),
            supertags: supertags.iter().map(|tag| tag.to_string()).collect(),
            subtype: None,
            content,
            metadata: None,
            signature: String::new(),
            encryption: None,
            views: Vec::new(),
            references: Vec::new(),
            typed_refs: Vec::new(),
            attachments: Vec::new(),
            store_in_relational: false,
            prev_hash: None,
        }
    }

    #[test]
    fn build_thread_summaries_prefers_stronger_discovery_signals() {
        let summaries = build_thread_summaries(&[
            message(
                "m1",
                "thread.project",
                "2026-06-16T10:00:00Z",
                "ledger",
                Some("project"),
                &["project:aurora", "topic:launch"],
                json!({"title": "Aurora launch", "summary": "Finalize rollout checklist"}),
            ),
            message(
                "m2",
                "thread.casual",
                "2026-06-16T11:00:00Z",
                "agent",
                Some("note"),
                &["misc"],
                json!({"title": "Casual check-in", "summary": "General updates"}),
            ),
        ]);

        assert_eq!(summaries.len(), 2);
        assert_eq!(summaries[0].thread_id, "thread.project");
        assert_eq!(summaries[0].dominant_kind.as_deref(), Some("project"));
        assert_eq!(
            summaries[0].supertags,
            vec!["project:aurora", "topic:launch"]
        );
        assert!(summaries[0].score > summaries[1].score);
    }

    #[test]
    fn build_thread_summaries_for_query_prefers_exact_metadata_term_match_on_ties() {
        let summaries = build_thread_summaries_for_query(
            &[
                message(
                    "m1",
                    "thread.match",
                    "2026-06-16T10:00:00Z",
                    "ledger",
                    Some("task"),
                    &["project:aurora"],
                    json!({
                        "title": "Work reply",
                        "metadata": {
                            "memory_space": "work"
                        }
                    }),
                ),
                message(
                    "m2",
                    "thread.other",
                    "2026-06-16T11:00:00Z",
                    "ledger",
                    Some("task"),
                    &["project:aurora"],
                    json!({
                        "title": "General reply",
                        "metadata": {
                            "memory_space": "personal"
                        }
                    }),
                ),
            ],
            &["memory_space:work".to_string()],
        );

        assert_eq!(summaries[0].thread_id, "thread.match");
        assert!(summaries[0].score > summaries[1].score);
    }

    #[test]
    fn build_thread_summaries_for_query_breaks_metadata_ties_toward_scope_terms() {
        let summaries = build_thread_summaries_for_query(
            &[
                message(
                    "m1",
                    "thread.scope",
                    "2026-06-16T10:00:00Z",
                    "ledger",
                    Some("task"),
                    &["project:aurora"],
                    json!({
                        "title": "Scoped work thread",
                        "metadata": {
                            "memory_space": "work",
                            "status": "active"
                        }
                    }),
                ),
                message(
                    "m2",
                    "thread.value",
                    "2026-06-16T10:00:00Z",
                    "ledger",
                    Some("task"),
                    &["project:aurora"],
                    json!({
                        "title": "High priority thread",
                        "metadata": {
                            "priority": "high",
                            "status": "active"
                        }
                    }),
                ),
            ],
            &["memory_space:work".to_string(), "priority:high".to_string()],
        );

        assert_eq!(summaries[0].thread_id, "thread.scope");
        assert_eq!(summaries[1].thread_id, "thread.value");
        assert_eq!(summaries[0].score, summaries[1].score);
    }

    #[test]
    fn build_thread_summaries_for_query_preserves_scope_metadata_terms() {
        let summaries = build_thread_summaries_for_query(
            &[message(
                "m1",
                "thread.scope",
                "2026-06-16T10:00:00Z",
                "ledger",
                Some("task"),
                &["project:aurora"],
                json!({
                    "title": "Scoped work reply",
                    "metadata": {
                        "memory_space": "work",
                        "author_type": "human",
                        "author_mask": "private",
                        "owner": "ozan"
                    }
                }),
            )],
            &[],
        );

        assert_eq!(
            summaries[0].metadata_terms,
            vec![
                "memory_space:work".to_string(),
                "author_type:human".to_string(),
                "author_mask:private".to_string(),
            ]
        );
    }

    #[test]
    fn build_thread_summaries_deduplicates_supertags_and_uses_latest_preview() {
        let summaries = build_thread_summaries(&[
            message(
                "m1",
                "thread.1",
                "2026-06-16T09:00:00Z",
                "ledger",
                Some("task"),
                &["project:aurora", "topic:ops"],
                json!({"title": "Prepare launch plan", "summary": "Initial checklist"}),
            ),
            message(
                "m2",
                "thread.1",
                "2026-06-16T12:00:00Z",
                "ledger",
                Some("task"),
                &["project:aurora", "topic:ops"],
                json!({"summary": "Latest status update for launch readiness"}),
            ),
        ]);

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].message_count, 2);
        assert_eq!(summaries[0].supertags, vec!["project:aurora", "topic:ops"]);
        assert_eq!(
            summaries[0].preview,
            "Latest status update for launch readiness"
        );
        assert_eq!(summaries[0].last_message_at, "2026-06-16T12:00:00Z");
        assert_eq!(summaries[0].activity_freshness, "fresh");
    }

    #[test]
    fn build_thread_summaries_compute_activity_freshness_from_result_window() {
        let summaries = build_thread_summaries(&[
            message(
                "m1",
                "thread.fresh",
                "2026-06-16T12:00:00Z",
                "ledger",
                Some("task"),
                &["project:aurora"],
                json!({"title": "Fresh thread"}),
            ),
            message(
                "m2",
                "thread.active",
                "2026-06-10T12:00:00Z",
                "ledger",
                Some("task"),
                &["project:aurora"],
                json!({"title": "Active thread"}),
            ),
            message(
                "m3",
                "thread.stale",
                "2026-05-20T12:00:00Z",
                "ledger",
                Some("task"),
                &["project:aurora"],
                json!({"title": "Stale thread"}),
            ),
        ]);

        let by_thread = summaries
            .iter()
            .map(|summary| {
                (
                    summary.thread_id.as_str(),
                    summary.activity_freshness.as_str(),
                )
            })
            .collect::<std::collections::HashMap<_, _>>();

        assert_eq!(by_thread.get("thread.fresh").copied(), Some("fresh"));
        assert_eq!(by_thread.get("thread.active").copied(), Some("active"));
        assert_eq!(by_thread.get("thread.stale").copied(), Some("stale"));
    }

    #[test]
    fn thread_matches_kind_filter_accepts_matching_message_kind() {
        let messages = vec![
            message(
                "m1",
                "thread.project",
                "2026-06-16T10:00:00Z",
                "ledger",
                Some("project"),
                &["project:aurora"],
                json!({"title": "Aurora launch"}),
            ),
            message(
                "m2",
                "thread.project",
                "2026-06-16T11:00:00Z",
                "agent",
                Some("note"),
                &["topic:launch"],
                json!({"summary": "General updates"}),
            ),
        ];

        assert!(thread_matches_kind_filter(&messages, Some("project")));
        assert!(thread_matches_kind_filter(&messages, Some("PROJECT")));
        assert!(!thread_matches_kind_filter(&messages, Some("decision")));
        assert!(thread_matches_kind_filter(&messages, None));
    }

    #[test]
    fn rank_bootstrap_messages_deduplicates_and_orders_by_score_then_recency() {
        let ranked = rank_bootstrap_messages(
            vec![
                crate::afp::Message {
                    protocol: "afp-v1".to_string(),
                    id: "same".to_string(),
                    thread_id: "thread.a".to_string(),
                    parent_id: "".to_string(),
                    from: "omnyid://user/test".to_string(),
                    to: vec![],
                    timestamp: "2026-06-15T09:00:00Z".to_string(),
                    r#type: "agent".to_string(),
                    kind: Some("note".to_string()),
                    supertags: vec!["misc".to_string()],
                    content: "{}".to_string(),
                    signature: String::new(),
                    encryption: "{}".to_string(),
                    views: "[]".to_string(),
                    references: "[]".to_string(),
                    attachments: "[]".to_string(),
                    store_in_relational: false,
                    subtype: String::new(),
                    metadata: "{}".to_string(),
                },
                crate::afp::Message {
                    protocol: "afp-v1".to_string(),
                    id: "same".to_string(),
                    thread_id: "thread.a".to_string(),
                    parent_id: "".to_string(),
                    from: "omnyid://user/test".to_string(),
                    to: vec![],
                    timestamp: "2026-06-15T09:00:00Z".to_string(),
                    r#type: "agent".to_string(),
                    kind: Some("note".to_string()),
                    supertags: vec!["misc".to_string()],
                    content: "{}".to_string(),
                    signature: String::new(),
                    encryption: "{}".to_string(),
                    views: "[]".to_string(),
                    references: "[]".to_string(),
                    attachments: "[]".to_string(),
                    store_in_relational: false,
                    subtype: String::new(),
                    metadata: "{}".to_string(),
                },
                crate::afp::Message {
                    protocol: "afp-v1".to_string(),
                    id: "strong".to_string(),
                    thread_id: "thread.b".to_string(),
                    parent_id: "".to_string(),
                    from: "omnyid://user/test".to_string(),
                    to: vec![],
                    timestamp: "2026-06-16T09:00:00Z".to_string(),
                    r#type: "ledger".to_string(),
                    kind: Some("project".to_string()),
                    supertags: vec!["project:aurora".to_string()],
                    content: "{}".to_string(),
                    signature: String::new(),
                    encryption: "{}".to_string(),
                    views: "[]".to_string(),
                    references: "[]".to_string(),
                    attachments: "[]".to_string(),
                    store_in_relational: false,
                    subtype: String::new(),
                    metadata: "{}".to_string(),
                },
            ],
            10,
        );

        assert_eq!(ranked.len(), 2);
        assert_eq!(ranked[0].id, "strong");
        assert_eq!(ranked[1].id, "same");
    }

    #[test]
    fn thread_discovery_retrieval_state_summarizes_filters_and_top_kind() {
        let summaries = vec![DashboardThreadSummary {
            title: "Aurora launch".to_string(),
            preview: "Finalize rollout".to_string(),
            message_count: 3,
            last_message_at: "2026-06-16T12:00:00Z".to_string(),
            activity_freshness: "fresh".to_string(),
            dominant_kind: Some("task".to_string()),
            supertags: vec!["project:aurora".to_string()],
            metadata_terms: Vec::new(),
            score: 9,
            thread_id: "thread.aurora".to_string(),
        }];

        let state = thread_discovery_retrieval_state(
            Some("launch prep"),
            &["project:aurora".to_string()],
            &["msg_1".to_string()],
            &["ozan".to_string()],
            &["owner:ozan".to_string()],
            &[],
            &[],
            None,
            None,
            Some("task"),
            None,
            &summaries,
        );

        assert_eq!(
            state["badges"].as_array().unwrap(),
            &vec![
                serde_json::json!("text-guided"),
                serde_json::json!("tag-filtered"),
                serde_json::json!("object-linked"),
                serde_json::json!("exact-metadata-filtered"),
                serde_json::json!("kind-focused"),
                serde_json::json!("fresh-top-thread"),
            ]
        );
        assert_eq!(
            state["summary"].as_str(),
            Some(
                "Thread discovery is text guided, tag filtered, object linked, exact-metadata filtered, kind focused. Top surfaced thread is task-heavy. Top surfaced thread is still fresh in the current result window. Leading neighborhood cue: project:aurora."
            )
        );
        assert_eq!(
            state["observability"]["active_filter_count"].as_u64(),
            Some(6)
        );
        assert_eq!(
            state["observability"]["narrowing_mode"].as_str(),
            Some("facet_scoped")
        );
        assert_eq!(state["observability"]["result_count"].as_u64(), Some(1));
        assert_eq!(state["observability"]["top_kind"].as_str(), Some("task"));
        assert_eq!(
            state["observability"]["top_activity_freshness"].as_str(),
            Some("fresh")
        );
    }

    #[test]
    fn thread_discovery_retrieval_state_adds_scope_cues_for_memory_and_authorship_terms() {
        let summaries = vec![DashboardThreadSummary {
            title: "Aurora launch".to_string(),
            preview: "Finalize rollout".to_string(),
            message_count: 3,
            last_message_at: "2026-06-16T12:00:00Z".to_string(),
            activity_freshness: "fresh".to_string(),
            dominant_kind: Some("task".to_string()),
            supertags: vec!["project:aurora".to_string()],
            metadata_terms: Vec::new(),
            score: 9,
            thread_id: "thread.aurora".to_string(),
        }];

        let state = thread_discovery_retrieval_state(
            Some("launch prep"),
            &["project:aurora".to_string()],
            &[],
            &[],
            &[
                "memory_space:work".to_string(),
                "author_type:human".to_string(),
                "status:active".to_string(),
                "follow_up_at:today".to_string(),
            ],
            &[],
            &[],
            None,
            None,
            Some("task"),
            Some(&serde_json::json!({
                "metadata_terms": [{
                    "value": "memory_space:work",
                    "count": 2,
                    "score": 0.82,
                    "rationale": "active-state pressure + local continuity + work context + strong narrowing power"
                }, {
                    "value": "follow_up_at:today",
                    "count": 2,
                    "score": 0.77,
                    "rationale": "active-state pressure + local continuity + follow-up today + strong narrowing power"
                }]
            })),
            &summaries,
        );

        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("work context"))
        );
        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("human authored"))
        );
        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("active status"))
        );
        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("follow-up today"))
        );
        assert_eq!(
            state["summary"].as_str(),
            Some(
                "Thread discovery is text guided, tag filtered, exact-metadata filtered, kind focused, work context, human authored, active status, follow-up today. Scoped to work context, human authored, active status, and follow-up today. Next best narrowing: work context. Top surfaced thread is task-heavy. Top surfaced thread is still fresh in the current result window. Leading neighborhood cue: project:aurora."
            )
        );
        assert_eq!(
            state["observability"]["narrowing_mode"].as_str(),
            Some("workspace_scoped")
        );
        assert_eq!(
            state["observability"]["scope_badge_count"].as_u64(),
            Some(4)
        );
        assert_eq!(
            state["observability"]["next_best_narrowing"].as_str(),
            Some("Next best narrowing: work context")
        );
    }

    #[test]
    fn thread_discovery_retrieval_state_marks_mixed_neighborhoods() {
        let summaries = vec![
            DashboardThreadSummary {
                title: "Aurora launch".to_string(),
                preview: "Finalize rollout".to_string(),
                message_count: 3,
                last_message_at: "2026-06-16T12:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["project:aurora".to_string()],
                metadata_terms: Vec::new(),
                score: 9,
                thread_id: "thread.aurora".to_string(),
            },
            DashboardThreadSummary {
                title: "Vendor review".to_string(),
                preview: "Approve renewal".to_string(),
                message_count: 2,
                last_message_at: "2026-06-16T11:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("decision".to_string()),
                supertags: vec!["project:aurora".to_string()],
                metadata_terms: Vec::new(),
                score: 8,
                thread_id: "thread.vendor".to_string(),
            },
        ];

        let state = thread_discovery_retrieval_state(
            Some("launch prep"),
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
            None,
            None,
            None,
            None,
            &summaries,
        );

        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("mixed neighborhood"))
        );
        assert_eq!(
            state["summary"].as_str(),
            Some(
                "Thread discovery is text guided. Top results remain mixed across 2 work kinds. Top surfaced thread is task-heavy. Top surfaced thread is still fresh in the current result window. Leading neighborhood cue: project:aurora."
            )
        );
        assert_eq!(
            state["observability"]["concentration_mode"].as_str(),
            Some("mixed_neighborhood")
        );
    }

    #[test]
    fn thread_discovery_retrieval_state_surfaces_older_thread_support_badge() {
        let summaries = vec![DashboardThreadSummary {
            title: "Archive review".to_string(),
            preview: "Revisit older work".to_string(),
            message_count: 2,
            last_message_at: "2026-05-01T12:00:00Z".to_string(),
            activity_freshness: "stale".to_string(),
            dominant_kind: Some("task".to_string()),
            supertags: vec!["project:archive".to_string()],
            metadata_terms: Vec::new(),
            score: 9,
            thread_id: "thread.archive".to_string(),
        }];

        let state = thread_discovery_retrieval_state(
            None,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
            None,
            None,
            None,
            Some(&serde_json::json!({
                "tags": [{
                    "value": "project:archive",
                    "count": 2,
                    "score": 0.77,
                    "rationale": "active-state pressure + strong narrowing power + older thread support"
                }]
            })),
            &summaries,
        );

        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("older-thread supported"))
        );
        assert_eq!(
            state["summary"].as_str(),
            Some(
                "Thread discovery is older thread support. Top surfaced thread is task-heavy. Top surfaced thread is older context that still ranks highly. Leading neighborhood cue: project:archive."
            )
        );
    }

    #[test]
    fn thread_discovery_facet_suggestions_exclude_active_filters() {
        let summaries = vec![
            DashboardThreadSummary {
                title: "Aurora launch".to_string(),
                preview: "Finalize rollout".to_string(),
                message_count: 3,
                last_message_at: "2026-06-16T12:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["project:aurora".to_string(), "topic:launch".to_string()],
                metadata_terms: Vec::new(),
                score: 9,
                thread_id: "thread.aurora".to_string(),
            },
            DashboardThreadSummary {
                title: "Vendor follow-up".to_string(),
                preview: "Renew contract".to_string(),
                message_count: 2,
                last_message_at: "2026-06-16T11:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("project".to_string()),
                supertags: vec!["topic:launch".to_string(), "supplier:x".to_string()],
                metadata_terms: Vec::new(),
                score: 7,
                thread_id: "thread.vendor".to_string(),
            },
        ];

        let suggestions = thread_discovery_facet_suggestions(
            &summaries,
            &["topic:launch".to_string()],
            &[],
            Some("task"),
        );

        assert_eq!(suggestions["kinds"][0]["value"].as_str(), Some("project"));
        assert_eq!(
            suggestions["tags"][0]["value"].as_str(),
            Some("project:aurora")
        );
    }

    #[test]
    fn thread_discovery_facet_suggestions_include_scope_metadata_terms() {
        let summaries = vec![
            DashboardThreadSummary {
                title: "Aurora launch".to_string(),
                preview: "Finalize rollout".to_string(),
                message_count: 3,
                last_message_at: "2026-06-16T12:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["project:aurora".to_string()],
                metadata_terms: vec!["memory_space:work".to_string()],
                score: 9,
                thread_id: "thread.aurora".to_string(),
            },
            DashboardThreadSummary {
                title: "Vendor follow-up".to_string(),
                preview: "Renew contract".to_string(),
                message_count: 2,
                last_message_at: "2026-06-16T11:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("project".to_string()),
                supertags: vec!["supplier:x".to_string()],
                metadata_terms: vec!["author_type:human".to_string()],
                score: 7,
                thread_id: "thread.vendor".to_string(),
            },
        ];

        let suggestions = thread_discovery_facet_suggestions(&summaries, &[], &[], None);

        assert_eq!(
            suggestions["metadata_terms"][0]["value"].as_str(),
            Some("memory_space:work")
        );
        assert_eq!(
            suggestions["metadata_terms"][1]["value"].as_str(),
            Some("author_type:human")
        );
    }

    #[test]
    fn thread_discovery_facet_suggestions_prefer_scope_metadata_terms_on_equal_evidence() {
        let summaries = vec![
            DashboardThreadSummary {
                title: "Aurora launch".to_string(),
                preview: "Finalize rollout".to_string(),
                message_count: 3,
                last_message_at: "2026-06-16T12:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["project:aurora".to_string()],
                metadata_terms: vec!["memory_space:work".to_string(), "owner:ozan".to_string()],
                score: 9,
                thread_id: "thread.aurora".to_string(),
            },
            DashboardThreadSummary {
                title: "Vendor follow-up".to_string(),
                preview: "Renew contract".to_string(),
                message_count: 2,
                last_message_at: "2026-06-16T11:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("project".to_string()),
                supertags: vec!["supplier:x".to_string()],
                metadata_terms: vec!["memory_space:work".to_string(), "owner:ozan".to_string()],
                score: 7,
                thread_id: "thread.vendor".to_string(),
            },
        ];

        let suggestions = thread_discovery_facet_suggestions(&summaries, &[], &[], None);

        assert_eq!(
            suggestions["metadata_terms"][0]["value"].as_str(),
            Some("memory_space:work")
        );
        assert_eq!(
            suggestions["metadata_terms"][1]["value"].as_str(),
            Some("owner:ozan")
        );
    }

    #[test]
    fn thread_discovery_facet_suggestions_prefer_fresher_tags_when_counts_tie() {
        let summaries = vec![
            DashboardThreadSummary {
                title: "Fresh thread".to_string(),
                preview: "Recent support".to_string(),
                message_count: 3,
                last_message_at: "2026-06-16T12:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["topic:fresh".to_string()],
                metadata_terms: Vec::new(),
                score: 8,
                thread_id: "thread.fresh".to_string(),
            },
            DashboardThreadSummary {
                title: "Stale thread".to_string(),
                preview: "Older support".to_string(),
                message_count: 3,
                last_message_at: "2026-05-20T12:00:00Z".to_string(),
                activity_freshness: "stale".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["topic:stale".to_string()],
                metadata_terms: Vec::new(),
                score: 8,
                thread_id: "thread.stale".to_string(),
            },
        ];

        let suggestions = thread_discovery_facet_suggestions(&summaries, &[], &[], None);

        assert_eq!(
            suggestions["tags"][0]["value"].as_str(),
            Some("topic:fresh")
        );
        assert_eq!(
            suggestions["tags"][1]["value"].as_str(),
            Some("topic:stale")
        );
    }

    #[test]
    fn thread_discovery_facet_next_moves_prefer_continuity_local_active_values() {
        let summaries = vec![
            DashboardThreadSummary {
                title: "Aurora launch".to_string(),
                preview: "Finalize rollout".to_string(),
                message_count: 4,
                last_message_at: "2026-06-16T12:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["project:aurora".to_string(), "topic:launch".to_string()],
                metadata_terms: Vec::new(),
                score: 10,
                thread_id: "thread.aurora".to_string(),
            },
            DashboardThreadSummary {
                title: "Vendor follow-up".to_string(),
                preview: "Renew contract".to_string(),
                message_count: 2,
                last_message_at: "2026-06-16T11:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["project:aurora".to_string()],
                metadata_terms: Vec::new(),
                score: 8,
                thread_id: "thread.vendor".to_string(),
            },
            DashboardThreadSummary {
                title: "Research notes".to_string(),
                preview: "Background context".to_string(),
                message_count: 1,
                last_message_at: "2026-06-16T10:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("note".to_string()),
                supertags: vec!["topic:research".to_string()],
                metadata_terms: Vec::new(),
                score: 3,
                thread_id: "thread.research".to_string(),
            },
        ];

        let next_moves =
            thread_discovery_facet_next_moves(&summaries, &["topic:top".to_string()], &[], None);

        assert_eq!(next_moves["kinds"][0]["value"].as_str(), Some("task"));
        assert_eq!(
            next_moves["kinds"][0]["rationale"].as_str(),
            Some(
                "active-state pressure + local continuity + strong narrowing power + fresh thread support"
            )
        );
        assert_eq!(
            next_moves["tags"][0]["value"].as_str(),
            Some("topic:launch")
        );
    }

    #[test]
    fn thread_discovery_facet_next_moves_prefer_scope_metadata_terms_on_equal_evidence() {
        let summaries = vec![
            DashboardThreadSummary {
                title: "Aurora launch".to_string(),
                preview: "Finalize rollout".to_string(),
                message_count: 4,
                last_message_at: "2026-06-16T12:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["project:aurora".to_string()],
                metadata_terms: vec!["memory_space:work".to_string()],
                score: 10,
                thread_id: "thread.aurora".to_string(),
            },
            DashboardThreadSummary {
                title: "Vendor follow-up".to_string(),
                preview: "Renew contract".to_string(),
                message_count: 2,
                last_message_at: "2026-06-16T11:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["project:aurora".to_string()],
                metadata_terms: vec!["owner:ozan".to_string()],
                score: 8,
                thread_id: "thread.vendor".to_string(),
            },
            DashboardThreadSummary {
                title: "Design note".to_string(),
                preview: "Scope recap".to_string(),
                message_count: 1,
                last_message_at: "2026-06-16T10:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("note".to_string()),
                supertags: vec!["topic:design".to_string()],
                metadata_terms: vec!["memory_space:work".to_string(), "owner:ozan".to_string()],
                score: 3,
                thread_id: "thread.design".to_string(),
            },
        ];

        let next_moves =
            thread_discovery_facet_next_moves(&summaries, &["topic:top".to_string()], &[], None);

        assert_eq!(
            next_moves["metadata_terms"][0]["value"].as_str(),
            Some("memory_space:work")
        );
        assert_eq!(
            next_moves["metadata_terms"][0]["rationale"].as_str(),
            Some(
                "active-state pressure + local continuity + work context + strong narrowing power + fresh thread support"
            )
        );
    }

    #[test]
    fn thread_discovery_facet_next_moves_prefer_value_metadata_terms_on_equal_evidence() {
        let summaries = vec![
            DashboardThreadSummary {
                title: "Aurora launch".to_string(),
                preview: "Finalize rollout".to_string(),
                message_count: 4,
                last_message_at: "2026-06-16T12:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["project:aurora".to_string()],
                metadata_terms: vec!["follow_up_at:today".to_string()],
                score: 10,
                thread_id: "thread.aurora".to_string(),
            },
            DashboardThreadSummary {
                title: "Vendor follow-up".to_string(),
                preview: "Renew contract".to_string(),
                message_count: 2,
                last_message_at: "2026-06-16T11:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["project:aurora".to_string()],
                metadata_terms: vec!["owner:ozan".to_string()],
                score: 8,
                thread_id: "thread.vendor".to_string(),
            },
            DashboardThreadSummary {
                title: "Design note".to_string(),
                preview: "Scope recap".to_string(),
                message_count: 1,
                last_message_at: "2026-06-16T10:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("note".to_string()),
                supertags: vec!["topic:design".to_string()],
                metadata_terms: vec!["follow_up_at:today".to_string(), "owner:ozan".to_string()],
                score: 3,
                thread_id: "thread.design".to_string(),
            },
        ];

        let next_moves =
            thread_discovery_facet_next_moves(&summaries, &["topic:top".to_string()], &[], None);

        assert_eq!(
            next_moves["metadata_terms"][0]["value"].as_str(),
            Some("follow_up_at:today")
        );
        assert_eq!(
            next_moves["metadata_terms"][0]["rationale"].as_str(),
            Some(
                "active-state pressure + local continuity + follow-up today + strong narrowing power + fresh thread support"
            )
        );
    }

    #[test]
    fn thread_discovery_facet_next_moves_call_out_older_thread_support_when_stale_threads_drive_it()
    {
        let summaries = vec![
            DashboardThreadSummary {
                title: "Top thread".to_string(),
                preview: "Anchor".to_string(),
                message_count: 4,
                last_message_at: "2026-06-16T12:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["topic:top".to_string()],
                metadata_terms: Vec::new(),
                score: 10,
                thread_id: "thread.top".to_string(),
            },
            DashboardThreadSummary {
                title: "Older support one".to_string(),
                preview: "Older support".to_string(),
                message_count: 2,
                last_message_at: "2026-05-20T12:00:00Z".to_string(),
                activity_freshness: "stale".to_string(),
                dominant_kind: Some("note".to_string()),
                supertags: vec!["topic:archive".to_string()],
                metadata_terms: Vec::new(),
                score: 6,
                thread_id: "thread.archive.1".to_string(),
            },
            DashboardThreadSummary {
                title: "Older support two".to_string(),
                preview: "Older support".to_string(),
                message_count: 2,
                last_message_at: "2026-05-19T12:00:00Z".to_string(),
                activity_freshness: "stale".to_string(),
                dominant_kind: Some("note".to_string()),
                supertags: vec!["topic:archive".to_string()],
                metadata_terms: Vec::new(),
                score: 6,
                thread_id: "thread.archive.2".to_string(),
            },
        ];

        let next_moves =
            thread_discovery_facet_next_moves(&summaries, &["topic:top".to_string()], &[], None);

        assert_eq!(
            next_moves["tags"][0]["value"].as_str(),
            Some("topic:archive")
        );
        assert_eq!(
            next_moves["tags"][0]["rationale"].as_str(),
            Some("active-state pressure + strong narrowing power + older thread support")
        );
    }

    #[test]
    fn thread_discovery_facet_next_moves_prefer_fresher_tags_when_evidence_ties() {
        let summaries = vec![
            DashboardThreadSummary {
                title: "Top thread".to_string(),
                preview: "Anchor".to_string(),
                message_count: 4,
                last_message_at: "2026-06-16T12:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["topic:top".to_string()],
                metadata_terms: Vec::new(),
                score: 10,
                thread_id: "thread.top".to_string(),
            },
            DashboardThreadSummary {
                title: "Fresh candidate".to_string(),
                preview: "Recent support".to_string(),
                message_count: 2,
                last_message_at: "2026-06-15T12:00:00Z".to_string(),
                activity_freshness: "fresh".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["topic:fresh".to_string()],
                metadata_terms: Vec::new(),
                score: 6,
                thread_id: "thread.fresh".to_string(),
            },
            DashboardThreadSummary {
                title: "Stale candidate".to_string(),
                preview: "Older support".to_string(),
                message_count: 2,
                last_message_at: "2026-05-20T12:00:00Z".to_string(),
                activity_freshness: "stale".to_string(),
                dominant_kind: Some("task".to_string()),
                supertags: vec!["topic:stale".to_string()],
                metadata_terms: Vec::new(),
                score: 6,
                thread_id: "thread.stale".to_string(),
            },
        ];

        let next_moves =
            thread_discovery_facet_next_moves(&summaries, &["topic:top".to_string()], &[], None);

        assert_eq!(next_moves["tags"][0]["value"].as_str(), Some("topic:fresh"));
        assert_eq!(next_moves["tags"][1]["value"].as_str(), Some("topic:stale"));
    }
}
