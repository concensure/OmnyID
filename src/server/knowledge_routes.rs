// @locs-version: 1.0
// @module-id: server.knowledge-routes
// @primary-capability: knowledge-http-routes
// @stability: beta

use super::*;
use crate::search_tags::{
    extract_hash_supertags, extract_kind_filter, extract_link_type_filter,
    extract_metadata_term_pairs, extract_metadata_terms, extract_reference_targets,
    extract_reference_type_filter, strip_structured_search_terms,
};
use crate::server::thread_discovery::{
    load_ranked_thread_summaries, thread_discovery_facet_next_moves,
    thread_discovery_facet_suggestions, thread_discovery_retrieval_state,
};

fn attach_render_resolution(
    content: &mut Value,
    schema: &str,
    contract_version: &str,
    strict: bool,
    renderer: &str,
    renderer_label: &str,
    description: &str,
) {
    if let Some(obj) = content.as_object_mut() {
        obj.insert(
            "render_resolution".to_string(),
            serde_json::json!({
                "schema": schema,
                "contract_version": contract_version,
                "strict": strict,
                "strategy": {
                    "zone": renderer,
                    "label": renderer_label,
                    "description": description,
                }
            }),
        );
    }
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/notes/backlinks/{message_id}", get(note_backlinks_http))
        .route("/notes/supertag-messages", get(supertag_messages_http))
        .route("/notes/reference-messages", get(reference_messages_http))
        .route("/notes/object-messages", get(object_messages_http))
        .route("/threads/summaries", get(thread_summaries_http))
        .route("/knowledge/triples", get(knowledge_triples_http))
        .route(
            "/knowledge/context-window",
            get(knowledge_context_window_http),
        )
        .route(
            "/knowledge/claim-neighborhood/{message_id}",
            get(knowledge_claim_neighborhood_http),
        )
        .route("/knowledge/neighborhood", get(knowledge_neighborhood_http))
        .route(
            "/notes/{message_id}/backlink-override",
            post(note_backlink_override_http),
        )
        .route("/notes/supertags", get(user_supertags_http))
        .route(
            "/notes/supertag-definitions",
            get(user_supertag_definitions_http),
        )
        .route("/backlinks/graph", get(backlinks_graph_http))
        .route(
            "/notes/supertags/install-defaults",
            post(install_default_supertags_http),
        )
}

fn parse_supertag_filters(params: &HashMap<String, String>) -> Vec<String> {
    params
        .get("tags")
        .or_else(|| params.get("tag"))
        .map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.trim_start_matches('#').to_lowercase())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn parse_supertag_hierarchy_expansion(params: &HashMap<String, String>) -> bool {
    matches!(
        params
            .get("expand_hierarchy")
            .or_else(|| params.get("hierarchy"))
            .map(|value| value.trim().to_ascii_lowercase())
            .as_deref(),
        Some("1" | "true" | "yes" | "descendants")
    )
}

fn parse_supertag_message_offset(params: &HashMap<String, String>) -> i64 {
    params
        .get("offset")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        .clamp(0, 10_000)
}

fn parse_kind_filter(params: &HashMap<String, String>) -> Option<String> {
    params
        .get("kind")
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
}

fn parse_reference_targets(params: &HashMap<String, String>) -> Vec<String> {
    params
        .get("targets")
        .or_else(|| params.get("target"))
        .map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn parse_csv_query_values(
    params: &HashMap<String, String>,
    primary: &str,
    fallback: &str,
    lowercase: bool,
) -> Vec<String> {
    params
        .get(primary)
        .or_else(|| params.get(fallback))
        .map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| {
                    if lowercase {
                        value.to_ascii_lowercase()
                    } else {
                        value.to_string()
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn parse_reference_query(
    params: &HashMap<String, String>,
) -> (
    Vec<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    i64,
) {
    let targets = parse_reference_targets(params);
    let reference_type = params
        .get("type")
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());
    let link_type = params
        .get("link_type")
        .or_else(|| params.get("linkType"))
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());
    let kind = parse_kind_filter(params);
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(30)
        .clamp(1, 100);
    (targets, reference_type, link_type, kind, limit)
}

fn parse_thread_summary_query(
    params: &HashMap<String, String>,
) -> (
    Option<String>,
    Vec<String>,
    Vec<String>,
    Vec<String>,
    Vec<String>,
    Vec<String>,
    Vec<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    bool,
    i64,
) {
    let mut tags = parse_supertag_filters(params);
    let mut reference_targets = parse_reference_targets(params);
    let mut metadata_values =
        parse_csv_query_values(params, "metadata_values", "metadataValues", false);
    let mut metadata_terms =
        parse_csv_query_values(params, "metadata_terms", "metadataTerms", false);
    let mut thread_ids = parse_csv_query_values(params, "thread_ids", "threadIds", false);
    let mut from_agents = parse_csv_query_values(params, "from_agents", "fromAgents", true);
    let raw_query = params
        .get("query")
        .or_else(|| params.get("q"))
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let mut kind = parse_kind_filter(params);
    let mut time_from = params
        .get("time_from")
        .or_else(|| params.get("timeFrom"))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let mut time_to = params
        .get("time_to")
        .or_else(|| params.get("timeTo"))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(query) = raw_query {
        for tag in extract_hash_supertags(query) {
            if !tags.iter().any(|existing| existing == &tag) {
                tags.push(tag);
            }
        }
        if kind.is_none() {
            kind = extract_kind_filter(query);
        }
        push_unique(&mut reference_targets, extract_reference_targets(query));
        let (_metadata_keys, query_metadata_values) = extract_metadata_terms(query);
        push_unique(&mut metadata_values, query_metadata_values);
        push_unique(
            &mut metadata_terms,
            extract_metadata_term_pairs(query)
                .into_iter()
                .map(|(key, value)| {
                    format!(
                        "{}:{}",
                        key.trim().to_ascii_lowercase(),
                        value.trim().to_ascii_lowercase()
                    )
                }),
        );
        extract_thread_summary_scope_terms(
            query,
            &mut thread_ids,
            &mut from_agents,
            &mut time_from,
            &mut time_to,
        );
    }
    let query = raw_query
        .map(strip_structured_search_terms)
        .filter(|value| !value.is_empty());
    let match_all = matches!(
        params
            .get("match")
            .map(|value| value.trim().to_ascii_lowercase())
            .as_deref(),
        Some("all")
    );
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(40)
        .clamp(1, 100);
    (
        query,
        tags,
        reference_targets,
        metadata_values,
        metadata_terms,
        thread_ids,
        from_agents,
        time_from,
        time_to,
        kind,
        match_all,
        limit,
    )
}

fn extract_thread_summary_scope_terms(
    query: &str,
    thread_ids: &mut Vec<String>,
    from_agents: &mut Vec<String>,
    time_from: &mut Option<String>,
    time_to: &mut Option<String>,
) {
    for token in query.split_whitespace() {
        let trimmed = token.trim_matches(|ch: char| {
            matches!(
                ch,
                ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
            )
        });
        let lowered = trimmed.to_ascii_lowercase();
        if let Some(value) = ["thread:", "thread_id:"]
            .iter()
            .find_map(|prefix| trimmed.strip_prefix(prefix))
        {
            let normalized = value
                .trim()
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                    )
                })
                .to_string();
            if !normalized.is_empty() && !thread_ids.iter().any(|existing| existing == &normalized)
            {
                thread_ids.push(normalized);
            }
            continue;
        }
        if let Some(value) = ["from:", "agent:", "sender:"]
            .iter()
            .find_map(|prefix| lowered.strip_prefix(prefix))
        {
            let normalized = value
                .trim()
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        ',' | '.' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
                    )
                })
                .to_string();
            if !normalized.is_empty() && !from_agents.iter().any(|existing| existing == &normalized)
            {
                from_agents.push(normalized);
            }
            continue;
        }
        if let Some(value) = lowered.strip_prefix("after:") {
            let normalized = value.trim().to_string();
            if !normalized.is_empty() {
                *time_from = Some(normalized);
            }
            continue;
        }
        if let Some(value) = lowered.strip_prefix("before:") {
            let normalized = value.trim().to_string();
            if !normalized.is_empty() {
                *time_to = Some(normalized);
            }
            continue;
        }
        if let Some(value) = lowered.strip_prefix("on:") {
            let normalized = value.trim().to_string();
            if !normalized.is_empty() {
                *time_from = Some(normalized.clone());
                *time_to = Some(normalized);
            }
        }
    }
}

#[derive(Clone, Debug, Default)]
pub(crate) struct ObjectMessageQuery {
    query: Option<String>,
    free_text: Option<String>,
    focus_thread_id: Option<String>,
    focus_object_id: Option<String>,
    kind: Option<String>,
    tags: Vec<String>,
    reference_targets: Vec<String>,
    reference_type: Option<String>,
    link_type: Option<String>,
    metadata_keys: Vec<String>,
    metadata_values: Vec<String>,
    metadata_terms: Vec<(String, String)>,
    match_all: bool,
    limit: i64,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
struct FacetSuggestion {
    value: String,
    count: usize,
}

#[derive(Clone, Debug, Default)]
struct WeightedFacetSuggestionAggregate {
    count: usize,
    weight: f64,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq)]
struct FacetNextMove {
    value: String,
    count: usize,
    score: f64,
    rationale: String,
}

#[derive(Clone, Debug, Default)]
struct WeightedFacetAggregate {
    count: usize,
    weight: f64,
    state_hits: usize,
    object_hits: usize,
    thread_hits: usize,
    explicit_thread_hits: usize,
    fresh_hits: usize,
    stale_hits: usize,
}

fn push_unique(values: &mut Vec<String>, additions: impl IntoIterator<Item = String>) {
    for value in additions {
        if !values.iter().any(|existing| existing == &value) {
            values.push(value);
        }
    }
}

pub(crate) fn parse_object_message_query(params: &HashMap<String, String>) -> ObjectMessageQuery {
    let focus_thread_id = params
        .get("focus_thread_id")
        .or_else(|| params.get("thread_focus"))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let focus_object_id = params
        .get("focus_object_id")
        .or_else(|| params.get("object_focus"))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let mut tags = parse_supertag_filters(params);
    let mut kind = parse_kind_filter(params);
    let mut reference_targets = parse_reference_targets(params);
    let mut metadata_keys = parse_csv_query_values(params, "metadata_keys", "metadataKeys", true);
    let mut metadata_values =
        parse_csv_query_values(params, "metadata_values", "metadataValues", false);
    let mut metadata_terms =
        parse_csv_query_values(params, "metadata_terms", "metadataTerms", false)
            .into_iter()
            .filter_map(|term| {
                let (key, value) = term.split_once(':')?;
                let key = key.trim().to_ascii_lowercase();
                let value = value.trim().to_ascii_lowercase();
                (!key.is_empty() && !value.is_empty()).then_some((key, value))
            })
            .collect::<Vec<_>>();
    let mut reference_type = params
        .get("type")
        .or_else(|| params.get("reference_type"))
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());
    let mut link_type = params
        .get("link_type")
        .or_else(|| params.get("linkType"))
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());
    let query = params
        .get("query")
        .or_else(|| params.get("q"))
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if let Some(raw_query) = query.as_deref() {
        push_unique(&mut tags, extract_hash_supertags(raw_query));
        if kind.is_none() {
            kind = extract_kind_filter(raw_query);
        }
        push_unique(&mut reference_targets, extract_reference_targets(raw_query));
        if reference_type.is_none() {
            reference_type = extract_reference_type_filter(raw_query);
        }
        if link_type.is_none() {
            link_type = extract_link_type_filter(raw_query);
        }
        let (query_metadata_keys, query_metadata_values) = extract_metadata_terms(raw_query);
        push_unique(&mut metadata_keys, query_metadata_keys);
        push_unique(&mut metadata_values, query_metadata_values);
        for (key, value) in extract_metadata_term_pairs(raw_query) {
            let normalized_key = key.trim().to_ascii_lowercase();
            let normalized_value = value.trim().to_ascii_lowercase();
            if !metadata_terms.iter().any(|(existing_key, existing_value)| {
                existing_key == &normalized_key && existing_value == &normalized_value
            }) {
                metadata_terms.push((normalized_key, normalized_value));
            }
        }
    }

    let free_text = query
        .as_deref()
        .map(strip_structured_search_terms)
        .filter(|value| !value.is_empty());
    let match_all = matches!(
        params
            .get("match")
            .map(|value| value.trim().to_ascii_lowercase())
            .as_deref(),
        Some("all")
    );
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(30)
        .clamp(1, 100);

    ObjectMessageQuery {
        query,
        free_text,
        focus_thread_id,
        focus_object_id,
        kind,
        tags,
        reference_targets,
        reference_type,
        link_type,
        metadata_keys,
        metadata_values,
        metadata_terms,
        match_all,
        limit,
    }
}

fn message_reference_field_values(message: &AFPMessage) -> (Vec<String>, Vec<String>, Vec<String>) {
    let mut targets = Vec::new();
    let mut reference_types = Vec::new();
    let mut link_types = Vec::new();
    for reference in &message.references {
        let Some(reference_obj) = reference.as_object() else {
            continue;
        };
        if let Some(target) = reference_obj.get("target").and_then(Value::as_str) {
            let target = target.trim();
            if !target.is_empty() && !targets.iter().any(|existing| existing == target) {
                targets.push(target.to_string());
            }
        }
        if let Some(reference_type) = reference_obj.get("type").and_then(Value::as_str) {
            let reference_type = reference_type.trim();
            if !reference_type.is_empty()
                && !reference_types
                    .iter()
                    .any(|existing| existing == reference_type)
            {
                reference_types.push(reference_type.to_string());
            }
        }
        if let Some(link_type) = reference_obj
            .get("metadata")
            .and_then(Value::as_object)
            .and_then(|metadata| metadata.get("link_type"))
            .and_then(Value::as_str)
        {
            let link_type = link_type.trim();
            if !link_type.is_empty() && !link_types.iter().any(|existing| existing == link_type) {
                link_types.push(link_type.to_string());
            }
        }
    }
    (targets, reference_types, link_types)
}

fn collect_message_metadata_strings(
    value: &Value,
    path: &mut Vec<String>,
    keys: &mut Vec<String>,
    values: &mut Vec<String>,
) {
    match value {
        Value::Null => {}
        Value::Bool(flag) => {
            let value = flag.to_string();
            if !values.iter().any(|existing| existing == &value) {
                values.push(value);
            }
        }
        Value::Number(number) => {
            let value = number.to_string();
            if !values.iter().any(|existing| existing == &value) {
                values.push(value);
            }
        }
        Value::String(text) => {
            let trimmed = text.trim();
            if !trimmed.is_empty() && !values.iter().any(|existing| existing == trimmed) {
                values.push(trimmed.to_string());
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_message_metadata_strings(item, path, keys, values);
            }
        }
        Value::Object(map) => {
            for (key, nested) in map {
                path.push(key.clone());
                let joined = path.join(".");
                if !keys.iter().any(|existing| existing == &joined) {
                    keys.push(joined);
                }
                collect_message_metadata_strings(nested, path, keys, values);
                path.pop();
            }
        }
    }
}

fn message_metadata_field_values(message: &AFPMessage) -> (Vec<String>, Vec<String>) {
    let mut keys = Vec::new();
    let mut values = Vec::new();
    if let Some(metadata) = message.metadata.as_ref() {
        let mut path = vec!["metadata".to_string()];
        collect_message_metadata_strings(metadata, &mut path, &mut keys, &mut values);
    }
    if let Some(content_metadata) = message.content.get("metadata") {
        let mut path = vec!["content".to_string(), "metadata".to_string()];
        collect_message_metadata_strings(content_metadata, &mut path, &mut keys, &mut values);
    }
    (keys, values)
}

fn collect_message_metadata_term_counts(
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
                collect_message_metadata_term_counts(item, path, counts);
            }
        }
        Value::Object(map) => {
            for (key, nested) in map {
                path.push(key.clone());
                collect_message_metadata_term_counts(nested, path, counts);
                path.pop();
            }
        }
    }
}

fn message_metadata_term_values(message: &AFPMessage) -> Vec<String> {
    let mut counts = HashMap::new();
    if let Some(metadata) = message.metadata.as_ref() {
        let mut path = vec!["metadata".to_string()];
        collect_message_metadata_term_counts(metadata, &mut path, &mut counts);
    }
    if let Some(content_metadata) = message.content.get("metadata") {
        let mut path = vec!["content".to_string(), "metadata".to_string()];
        collect_message_metadata_term_counts(content_metadata, &mut path, &mut counts);
    }
    let mut values = counts.into_keys().collect::<Vec<_>>();
    values.sort();
    values
}

fn normalize_facet_suggestions(
    counts: HashMap<String, WeightedFacetSuggestionAggregate>,
    excluded: &[String],
    limit: usize,
) -> Vec<FacetSuggestion> {
    let mut suggestions = counts
        .into_iter()
        .filter(|(value, _)| !excluded.iter().any(|existing| existing == value))
        .map(|(value, aggregate)| {
            (
                FacetSuggestion {
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

fn normalize_metadata_term_suggestions(
    counts: HashMap<String, WeightedFacetSuggestionAggregate>,
    excluded: &[String],
    limit: usize,
) -> Vec<FacetSuggestion> {
    let mut suggestions = counts
        .into_iter()
        .filter(|(value, _)| !excluded.iter().any(|existing| existing == value))
        .map(|(value, aggregate)| {
            (
                FacetSuggestion {
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

fn object_message_facet_suggestions(messages: &[AFPMessage], query: &ObjectMessageQuery) -> Value {
    let explicit_focus_thread = query.focus_thread_id.clone();
    let focus_thread = explicit_focus_thread
        .clone()
        .or_else(|| dominant_object_thread_focus(messages));
    let focus_object_id = query.focus_object_id.as_deref();
    let mut kind_counts = HashMap::<String, WeightedFacetSuggestionAggregate>::new();
    let mut tag_counts = HashMap::<String, WeightedFacetSuggestionAggregate>::new();
    let mut target_counts = HashMap::<String, WeightedFacetSuggestionAggregate>::new();
    let mut reference_type_counts = HashMap::<String, WeightedFacetSuggestionAggregate>::new();
    let mut link_type_counts = HashMap::<String, WeightedFacetSuggestionAggregate>::new();
    let mut metadata_term_counts = HashMap::<String, WeightedFacetSuggestionAggregate>::new();

    for message in messages {
        let state_weight = (object_message_state_bias(message).max(0) as f64) + 1.0;
        let thread_weight = if focus_thread
            .as_deref()
            .map(|thread_id| message.thread_id == thread_id)
            .unwrap_or(false)
        {
            if explicit_focus_thread.is_some() {
                10.0
            } else {
                2.0
            }
        } else {
            0.0
        };
        let object_weight = if focus_object_id
            .map(|focus_object_id| message_matches_focus_object(message, focus_object_id))
            .unwrap_or(false)
        {
            2.0
        } else {
            0.0
        };
        let combined_weight = state_weight + object_weight + thread_weight;
        if let Some(kind) = message
            .kind
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
        {
            let entry = kind_counts.entry(kind.to_ascii_lowercase()).or_default();
            entry.count += 1;
            entry.weight += combined_weight;
        }
        for tag in &message.supertags {
            let normalized = tag.trim().to_ascii_lowercase();
            if !normalized.is_empty() {
                let entry = tag_counts.entry(normalized).or_default();
                entry.count += 1;
                entry.weight += combined_weight;
            }
        }
        let (targets, reference_types, link_types) = message_reference_field_values(message);
        for target in targets {
            let entry = target_counts.entry(target).or_default();
            entry.count += 1;
            entry.weight += combined_weight;
        }
        for reference_type in reference_types {
            let entry = reference_type_counts
                .entry(reference_type.to_ascii_lowercase())
                .or_default();
            entry.count += 1;
            entry.weight += combined_weight;
        }
        for link_type in link_types {
            let entry = link_type_counts
                .entry(link_type.to_ascii_lowercase())
                .or_default();
            entry.count += 1;
            entry.weight += combined_weight;
        }
        for term in message_metadata_term_values(message) {
            let entry = metadata_term_counts.entry(term).or_default();
            entry.count += 1;
            entry.weight += combined_weight;
        }
    }

    let excluded_kind = query.kind.clone().into_iter().collect::<Vec<_>>();
    let excluded_reference_type = query.reference_type.clone().into_iter().collect::<Vec<_>>();
    let excluded_link_type = query.link_type.clone().into_iter().collect::<Vec<_>>();
    let excluded_metadata_terms = query
        .metadata_terms
        .iter()
        .map(|(key, value)| format!("{key}:{value}"))
        .collect::<Vec<_>>();

    serde_json::json!({
        "kinds": normalize_facet_suggestions(kind_counts, &excluded_kind, 6),
        "tags": normalize_facet_suggestions(tag_counts, &query.tags, 10),
        "reference_targets": normalize_facet_suggestions(target_counts, &query.reference_targets, 10),
        "reference_types": normalize_facet_suggestions(reference_type_counts, &excluded_reference_type, 8),
        "link_types": normalize_facet_suggestions(link_type_counts, &excluded_link_type, 8),
        "metadata_terms": normalize_metadata_term_suggestions(metadata_term_counts, &excluded_metadata_terms, 12),
    })
}

fn normalize_next_moves(
    counts: HashMap<String, WeightedFacetAggregate>,
    excluded: &[String],
    total_weight: f64,
    limit: usize,
) -> Vec<FacetNextMove> {
    if total_weight <= 0.0 {
        return Vec::new();
    }
    let mut moves = counts
        .into_iter()
        .filter(|(value, _)| !excluded.iter().any(|existing| existing == value))
        .filter_map(|(value, aggregate)| {
            if aggregate.count == 0 || aggregate.weight <= 0.0 || aggregate.weight >= total_weight {
                return None;
            }
            let coverage = aggregate.weight / total_weight;
            let discrimination = 1.0 - (0.5 - coverage).abs() * 2.0;
            let score = discrimination * aggregate.weight;
            (score > 0.0).then_some(FacetNextMove {
                value,
                count: aggregate.count,
                score,
                rationale: facet_next_move_rationale(&aggregate),
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

fn normalize_metadata_term_next_moves(
    counts: HashMap<String, WeightedFacetAggregate>,
    excluded: &[String],
    total_weight: f64,
    limit: usize,
) -> Vec<FacetNextMove> {
    let mut moves = normalize_next_moves(counts, excluded, total_weight, usize::MAX);
    for entry in &mut moves {
        entry.score +=
            crate::server::metadata_term_helpers::metadata_term_score_bonus(&entry.value);
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

fn facet_next_move_rationale(aggregate: &WeightedFacetAggregate) -> String {
    let mut parts = Vec::new();
    if aggregate.state_hits > 0 {
        parts.push("active-state pressure");
    }
    if aggregate.object_hits > 0 {
        parts.push("focused object anchor");
    }
    if aggregate.explicit_thread_hits > 0 {
        parts.push("explicit thread focus");
    } else if aggregate.thread_hits > 0 {
        parts.push("local continuity");
    }
    parts.push("strong narrowing power");
    if aggregate.fresh_hits > aggregate.stale_hits {
        parts.push("fresh object support");
    } else if aggregate.stale_hits > aggregate.fresh_hits {
        parts.push("older object support");
    }
    parts.join(" + ")
}

fn message_matches_focus_object(message: &AFPMessage, focus_object_id: &str) -> bool {
    let (targets, _, _) = message_reference_field_values(message);
    message.id == focus_object_id || targets.iter().any(|existing| existing == focus_object_id)
}

fn dominant_object_thread_focus(messages: &[AFPMessage]) -> Option<String> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for message in messages.iter().take(8) {
        let thread_id = message.thread_id.trim();
        if thread_id.is_empty() {
            continue;
        }
        *counts.entry(thread_id.to_string()).or_insert(0) += 1;
    }
    let (thread_id, count) = counts
        .into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(&a.0)))?;
    (count >= 2).then_some(thread_id)
}

pub(crate) fn object_message_facet_next_moves(
    messages: &[AFPMessage],
    query: &ObjectMessageQuery,
) -> Value {
    let explicit_focus_thread = query.focus_thread_id.clone();
    let focus_thread = explicit_focus_thread
        .clone()
        .or_else(|| dominant_object_thread_focus(messages));
    let focus_object_id = query.focus_object_id.as_deref();
    let latest_message_at = messages
        .iter()
        .filter_map(|message| chrono::DateTime::parse_from_rfc3339(&message.timestamp).ok())
        .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
        .max();
    let mut total_weight = 0.0;
    let mut kind_counts: HashMap<String, WeightedFacetAggregate> = HashMap::new();
    let mut tag_counts: HashMap<String, WeightedFacetAggregate> = HashMap::new();
    let mut target_counts: HashMap<String, WeightedFacetAggregate> = HashMap::new();
    let mut reference_type_counts: HashMap<String, WeightedFacetAggregate> = HashMap::new();
    let mut link_type_counts: HashMap<String, WeightedFacetAggregate> = HashMap::new();
    let mut metadata_term_counts: HashMap<String, WeightedFacetAggregate> = HashMap::new();

    for message in messages {
        let state_weight = (object_message_state_bias(message).max(0) as f64) + 1.0;
        let thread_weight = if focus_thread
            .as_deref()
            .map(|thread_id| message.thread_id == thread_id)
            .unwrap_or(false)
        {
            if explicit_focus_thread.is_some() {
                10.0
            } else {
                2.0
            }
        } else {
            0.0
        };
        let has_explicit_thread_bias = explicit_focus_thread
            .as_deref()
            .map(|thread_id| message.thread_id == thread_id)
            .unwrap_or(false);
        let object_weight = if focus_object_id
            .map(|focus_object_id| message_matches_focus_object(message, focus_object_id))
            .unwrap_or(false)
        {
            2.0
        } else {
            0.0
        };
        let has_state_bias = object_message_state_bias(message) > 0;
        let has_object_bias = object_weight > 0.0;
        let has_thread_bias = thread_weight > 0.0;
        let freshness =
            object_message_activity_freshness(&message.timestamp, latest_message_at.as_ref());
        let combined_weight = state_weight + object_weight + thread_weight;
        total_weight += combined_weight;
        if let Some(kind) = message
            .kind
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
        {
            let entry = kind_counts.entry(kind.to_ascii_lowercase()).or_default();
            entry.count += 1;
            entry.weight += combined_weight;
            entry.state_hits += usize::from(has_state_bias);
            entry.object_hits += usize::from(has_object_bias);
            entry.thread_hits += usize::from(has_thread_bias);
            entry.explicit_thread_hits += usize::from(has_explicit_thread_bias);
            entry.fresh_hits += usize::from(freshness == "fresh");
            entry.stale_hits += usize::from(freshness == "stale");
        }
        for tag in &message.supertags {
            let normalized = tag.trim().to_ascii_lowercase();
            if !normalized.is_empty() {
                let entry = tag_counts.entry(normalized).or_default();
                entry.count += 1;
                entry.weight += combined_weight;
                entry.state_hits += usize::from(has_state_bias);
                entry.object_hits += usize::from(has_object_bias);
                entry.thread_hits += usize::from(has_thread_bias);
                entry.explicit_thread_hits += usize::from(has_explicit_thread_bias);
                entry.fresh_hits += usize::from(freshness == "fresh");
                entry.stale_hits += usize::from(freshness == "stale");
            }
        }
        let (targets, reference_types, link_types) = message_reference_field_values(message);
        for target in targets {
            let entry = target_counts.entry(target).or_default();
            entry.count += 1;
            entry.weight += combined_weight;
            entry.state_hits += usize::from(has_state_bias);
            entry.object_hits += usize::from(has_object_bias);
            entry.thread_hits += usize::from(has_thread_bias);
            entry.explicit_thread_hits += usize::from(has_explicit_thread_bias);
            entry.fresh_hits += usize::from(freshness == "fresh");
            entry.stale_hits += usize::from(freshness == "stale");
        }
        for reference_type in reference_types {
            let entry = reference_type_counts
                .entry(reference_type.to_ascii_lowercase())
                .or_default();
            entry.count += 1;
            entry.weight += combined_weight;
            entry.state_hits += usize::from(has_state_bias);
            entry.object_hits += usize::from(has_object_bias);
            entry.thread_hits += usize::from(has_thread_bias);
            entry.explicit_thread_hits += usize::from(has_explicit_thread_bias);
            entry.fresh_hits += usize::from(freshness == "fresh");
            entry.stale_hits += usize::from(freshness == "stale");
        }
        for link_type in link_types {
            let entry = link_type_counts
                .entry(link_type.to_ascii_lowercase())
                .or_default();
            entry.count += 1;
            entry.weight += combined_weight;
            entry.state_hits += usize::from(has_state_bias);
            entry.object_hits += usize::from(has_object_bias);
            entry.thread_hits += usize::from(has_thread_bias);
            entry.explicit_thread_hits += usize::from(has_explicit_thread_bias);
            entry.fresh_hits += usize::from(freshness == "fresh");
            entry.stale_hits += usize::from(freshness == "stale");
        }
        for term in message_metadata_term_values(message) {
            let entry = metadata_term_counts.entry(term).or_default();
            entry.count += 1;
            entry.weight += combined_weight;
            entry.state_hits += usize::from(has_state_bias);
            entry.object_hits += usize::from(has_object_bias);
            entry.thread_hits += usize::from(has_thread_bias);
            entry.explicit_thread_hits += usize::from(has_explicit_thread_bias);
            entry.fresh_hits += usize::from(freshness == "fresh");
            entry.stale_hits += usize::from(freshness == "stale");
        }
    }

    let excluded_kind = query.kind.clone().into_iter().collect::<Vec<_>>();
    let excluded_reference_type = query.reference_type.clone().into_iter().collect::<Vec<_>>();
    let excluded_link_type = query.link_type.clone().into_iter().collect::<Vec<_>>();
    let excluded_metadata_terms = query
        .metadata_terms
        .iter()
        .map(|(key, value)| format!("{key}:{value}"))
        .collect::<Vec<_>>();

    serde_json::json!({
        "kinds": normalize_next_moves(kind_counts, &excluded_kind, total_weight, 3),
        "tags": normalize_next_moves(tag_counts, &query.tags, total_weight, 4),
        "reference_targets": normalize_next_moves(target_counts, &query.reference_targets, total_weight, 4),
        "reference_types": normalize_next_moves(reference_type_counts, &excluded_reference_type, total_weight, 3),
        "link_types": normalize_next_moves(link_type_counts, &excluded_link_type, total_weight, 3),
        "metadata_terms": normalize_metadata_term_next_moves(metadata_term_counts, &excluded_metadata_terms, total_weight, 4),
    })
}

fn message_search_text(message: &AFPMessage) -> String {
    let mut parts = Vec::new();
    if let Some(content) = message.content.as_object() {
        for key in [
            "title",
            "summary",
            "description",
            "text",
            "body",
            "intent",
            "query",
        ] {
            if let Some(value) = content.get(key).and_then(Value::as_str) {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    parts.push(trimmed.to_string());
                }
            }
        }
    }
    if let Some(metadata) = message.metadata.as_ref() {
        parts.push(metadata.to_string());
    }
    parts.join(" ").to_ascii_lowercase()
}

fn object_message_state_bias(message: &AFPMessage) -> i32 {
    let mut bias = 0;
    if let Ok(timestamp) = message.timestamp.parse::<chrono::DateTime<chrono::Utc>>() {
        let age_days = (chrono::Utc::now() - timestamp).num_days();
        if age_days <= 3 {
            bias += 3;
        } else if age_days <= 14 {
            bias += 2;
        } else if age_days <= 60 {
            bias += 1;
        }
    }

    let lowercase_statuses = message_metadata_field_values(message)
        .1
        .into_iter()
        .map(|value| value.to_ascii_lowercase())
        .collect::<Vec<_>>();
    if lowercase_statuses.iter().any(|value| {
        matches!(
            value.as_str(),
            "active" | "open" | "current" | "in_progress" | "in progress" | "reactivated"
        )
    }) {
        bias += 4;
    }
    if message
        .subtype
        .as_deref()
        .map(|value| {
            let lowered = value.to_ascii_lowercase();
            lowered.contains("snapshot") || lowered.contains("update") || lowered.contains("signal")
        })
        .unwrap_or(false)
    {
        bias += 1;
    }
    bias
}

pub(crate) fn rank_object_messages(messages: &mut [AFPMessage], query: &ObjectMessageQuery) {
    let free_text_terms = query
        .free_text
        .as_deref()
        .unwrap_or_default()
        .split_whitespace()
        .map(|value| value.to_ascii_lowercase())
        .collect::<Vec<_>>();

    messages.sort_by(|a, b| {
        let a_score = object_message_query_score(a, query, &free_text_terms);
        let b_score = object_message_query_score(b, query, &free_text_terms);
        let a_tiebreak = object_message_metadata_term_tiebreak_score(a, query);
        let b_tiebreak = object_message_metadata_term_tiebreak_score(b, query);
        b_score
            .cmp(&a_score)
            .then_with(|| b_tiebreak.cmp(&a_tiebreak))
            .then_with(|| b.timestamp.cmp(&a.timestamp))
            .then_with(|| a.id.cmp(&b.id))
    });
}

fn object_message_metadata_term_tiebreak_score(
    message: &AFPMessage,
    query: &ObjectMessageQuery,
) -> i32 {
    if query.metadata_terms.is_empty() {
        return 0;
    }
    let metadata_terms = message_metadata_term_values(message);
    query
        .metadata_terms
        .iter()
        .filter_map(|(key, value)| {
            let normalized = format!(
                "{}:{}",
                key.trim().to_ascii_lowercase(),
                value.trim().to_ascii_lowercase()
            );
            metadata_terms
                .iter()
                .any(|existing| existing == &normalized)
                .then_some(
                    100_i32
                        - i32::from(crate::server::metadata_term_helpers::metadata_term_rank(
                            &normalized,
                        )),
                )
        })
        .sum()
}

fn object_message_query_score(
    message: &AFPMessage,
    query: &ObjectMessageQuery,
    free_text_terms: &[String],
) -> i32 {
    let mut score = object_message_state_bias(message);
    if query
        .focus_thread_id
        .as_deref()
        .map(|thread_id| message.thread_id == thread_id)
        .unwrap_or(false)
    {
        score += 5;
    }
    if let Some(kind) = query.kind.as_deref() {
        if message
            .kind
            .as_deref()
            .map(|value| value.eq_ignore_ascii_case(kind))
            .unwrap_or(false)
        {
            score += 6;
        }
    }
    for tag in &query.tags {
        if message
            .supertags
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(tag))
        {
            score += 3;
        }
    }
    if let Some(focus_object_id) = query.focus_object_id.as_deref() {
        if message_matches_focus_object(message, focus_object_id) {
            score += 5;
        }
    }
    let (targets, reference_types, link_types) = message_reference_field_values(message);
    for target in &query.reference_targets {
        if targets.iter().any(|existing| existing == target) {
            score += 4;
        }
    }
    if let Some(reference_type) = query.reference_type.as_deref() {
        if reference_types
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(reference_type))
        {
            score += 2;
        }
    }
    if let Some(link_type) = query.link_type.as_deref() {
        if link_types
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(link_type))
        {
            score += 2;
        }
    }
    let (metadata_keys, metadata_values) = message_metadata_field_values(message);
    for key in &query.metadata_keys {
        if metadata_keys
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(key))
        {
            score += 2;
        }
    }
    for value in &query.metadata_values {
        if metadata_values
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(value))
        {
            score += 1;
        }
    }
    if !query.metadata_terms.is_empty() {
        let metadata_terms = message_metadata_term_values(message);
        for (key, value) in &query.metadata_terms {
            let normalized = format!(
                "{}:{}",
                key.trim().to_ascii_lowercase(),
                value.trim().to_ascii_lowercase()
            );
            if metadata_terms
                .iter()
                .any(|existing| existing == &normalized)
            {
                score += 3;
            }
        }
    }
    if !free_text_terms.is_empty() {
        let haystack = message_search_text(message);
        for term in free_text_terms {
            if haystack.contains(term) {
                score += 2;
            }
        }
    }
    score
}

fn retrieval_pressure_labels(facet_next_moves: &Value) -> Vec<String> {
    let mut joined = String::new();
    for key in [
        "kinds",
        "tags",
        "reference_targets",
        "reference_types",
        "link_types",
        "metadata_terms",
    ] {
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
    if joined.contains("focused object anchor") {
        labels.push("focused-object anchored".to_string());
    }
    if joined.contains("explicit thread focus") {
        labels.push("thread-prioritized".to_string());
    }
    if joined.contains("local continuity") {
        labels.push("continuity-local".to_string());
    }
    if joined.contains("active-state pressure") {
        labels.push("active-state weighted".to_string());
    }
    if joined.contains("fresh object support") {
        labels.push("fresh-object supported".to_string());
    }
    if joined.contains("older object support") {
        labels.push("older-object supported".to_string());
    }
    if joined.contains("strong narrowing power") {
        labels.push("narrowing-first".to_string());
    }
    labels
}

fn retrieval_scope_badges_from_metadata_terms(metadata_terms: &[(String, String)]) -> Vec<String> {
    let mut badges = Vec::new();
    for (key, value) in metadata_terms {
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

fn humanize_retrieval_summary_label(label: &str) -> String {
    match label.trim() {
        "focused-object anchored" => "focused object anchored".to_string(),
        "thread-prioritized" => "thread prioritized".to_string(),
        "continuity-local" => "continuity local".to_string(),
        "active-state weighted" => "active-state weighted".to_string(),
        "fresh-object supported" => "fresh object support".to_string(),
        "older-object supported" => "older object support".to_string(),
        "narrowing-first" => "narrowing-first".to_string(),
        other => other.to_string(),
    }
}

fn best_scope_narrowing_summary(facet_next_moves: &Value) -> Option<String> {
    let entries = facet_next_moves.get("metadata_terms")?.as_array()?;
    for entry in entries {
        let value = entry.get("value")?.as_str()?;
        if let Some(label) = crate::server::metadata_term_helpers::metadata_term_label(value) {
            return Some(format!("Next best narrowing: {label}."));
        }
    }
    None
}

pub(crate) fn object_message_retrieval_state(
    query: &ObjectMessageQuery,
    facet_next_moves: &Value,
    messages: &[AFPMessage],
) -> Value {
    let mut badges = Vec::new();
    if let Some(thread_id) = query
        .focus_thread_id
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        badges.push(format!("thread {thread_id}"));
    }
    if query
        .focus_object_id
        .as_deref()
        .filter(|value| !value.is_empty())
        .is_some()
    {
        badges.push("focused object".to_string());
    }
    for label in retrieval_pressure_labels(facet_next_moves) {
        if !badges.iter().any(|existing| existing == &label) {
            badges.push(label);
        }
    }
    let scope_badges = retrieval_scope_badges_from_metadata_terms(&query.metadata_terms);
    for label in &scope_badges {
        if !badges.iter().any(|existing| existing == label) {
            badges.push(label.clone());
        }
    }

    let mut summary_parts = Vec::new();
    let pressure_labels = retrieval_pressure_labels(facet_next_moves);
    if !pressure_labels.is_empty() {
        let rendered = pressure_labels
            .iter()
            .map(|label| humanize_retrieval_summary_label(label))
            .collect::<Vec<_>>();
        summary_parts.push(format!("Current ranking is {}.", rendered.join(", ")));
    }
    if let Some(scope_summary) = retrieval_scope_summary_from_badges(&scope_badges) {
        summary_parts.push(scope_summary);
    }
    if let Some(narrowing_summary) = best_scope_narrowing_summary(facet_next_moves) {
        summary_parts.push(narrowing_summary);
    }
    if let Some((badge, detail)) = object_message_concentration_cue(messages) {
        if !badges.iter().any(|existing| existing == badge) {
            badges.push(badge.to_string());
        }
        summary_parts.push(detail);
    }
    if let Some(top_message) = messages.first() {
        let latest_message_at = messages
            .iter()
            .filter_map(|message| chrono::DateTime::parse_from_rfc3339(&message.timestamp).ok())
            .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
            .max();
        let freshness =
            object_message_activity_freshness(&top_message.timestamp, latest_message_at.as_ref());
        if let Some(detail) = object_message_activity_freshness_summary(freshness) {
            let badge = format!("{freshness}-top-object");
            if !badges.iter().any(|existing| existing == &badge) {
                badges.push(badge);
            }
            summary_parts.push(detail.to_string());
        }
        if let Some(tag) = top_message
            .supertags
            .first()
            .filter(|value| !value.is_empty())
        {
            summary_parts.push(format!("Leading object cue: {tag}."));
        }
    }
    if let Some(focus_object_id) = query
        .focus_object_id
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        summary_parts.push(format!("Focused object anchor: {focus_object_id}."));
    } else if let Some(focus_thread_id) = query
        .focus_thread_id
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        summary_parts.push(format!("Thread anchor: {focus_thread_id}."));
    }
    let observability =
        object_message_observability_state(query, facet_next_moves, messages, &scope_badges);

    serde_json::json!({
        "summary": summary_parts.join(" "),
        "badges": badges,
        "observability": observability,
    })
}

fn object_message_observability_state(
    query: &ObjectMessageQuery,
    facet_next_moves: &Value,
    messages: &[AFPMessage],
    scope_badges: &[String],
) -> Value {
    let active_filter_count = usize::from(
        query
            .focus_thread_id
            .as_deref()
            .is_some_and(|value| !value.is_empty()),
    ) + usize::from(
        query
            .focus_object_id
            .as_deref()
            .is_some_and(|value| !value.is_empty()),
    ) + query.metadata_terms.len();
    let narrowing_mode = if !scope_badges.is_empty() {
        "workspace_scoped"
    } else if query
        .focus_object_id
        .as_deref()
        .is_some_and(|value| !value.is_empty())
        || query
            .focus_thread_id
            .as_deref()
            .is_some_and(|value| !value.is_empty())
        || !query.metadata_terms.is_empty()
    {
        "facet_scoped"
    } else {
        "broad"
    };
    let concentration_mode = match object_message_concentration_cue(messages) {
        Some(("mixed neighborhood", _)) => Some("mixed_neighborhood"),
        Some(_) => Some("kind_concentrated"),
        None => None,
    };
    let top_activity_freshness = messages.first().map(|top_message| {
        let latest_message_at = messages
            .iter()
            .filter_map(|message| chrono::DateTime::parse_from_rfc3339(&message.timestamp).ok())
            .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
            .max();
        object_message_activity_freshness(&top_message.timestamp, latest_message_at.as_ref())
            .to_string()
    });

    serde_json::json!({
        "active_filter_count": active_filter_count,
        "narrowing_mode": narrowing_mode,
        "result_count": messages.len(),
        "scope_badge_count": scope_badges.len(),
        "top_kind": messages
            .first()
            .and_then(|message| message.kind.as_deref())
            .filter(|value| !value.is_empty()),
        "top_activity_freshness": top_activity_freshness,
        "concentration_mode": concentration_mode,
        "next_best_narrowing": best_scope_narrowing_summary(facet_next_moves)
            .map(|summary| summary.trim_end_matches('.').to_string()),
    })
}

fn object_message_concentration_cue(messages: &[AFPMessage]) -> Option<(&'static str, String)> {
    let leading_kinds = messages
        .iter()
        .take(3)
        .filter_map(|message| {
            message
                .kind
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.to_ascii_lowercase())
        })
        .collect::<Vec<_>>();
    if leading_kinds.len() < 2 {
        return None;
    }

    let unique_kinds = leading_kinds
        .iter()
        .cloned()
        .collect::<std::collections::HashSet<_>>();
    if unique_kinds.len() == 1 {
        let kind = leading_kinds
            .first()
            .cloned()
            .unwrap_or_else(|| "work".to_string());
        return Some((
            "kind-concentrated",
            format!("Top object results stay concentrated around {kind} work."),
        ));
    }

    Some((
        "mixed neighborhood",
        format!(
            "Top object results remain mixed across {} work kinds.",
            unique_kinds.len()
        ),
    ))
}

fn object_message_activity_freshness(
    top_message_at: &str,
    latest_message_at: Option<&chrono::DateTime<chrono::Utc>>,
) -> &'static str {
    let Some(latest_message_at) = latest_message_at else {
        return "";
    };
    let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(top_message_at) else {
        return "";
    };
    let age_hours = (*latest_message_at - parsed.with_timezone(&chrono::Utc)).num_hours();
    if age_hours <= 72 {
        "fresh"
    } else if age_hours <= 24 * 14 {
        "active"
    } else {
        "stale"
    }
}

fn object_message_activity_freshness_summary(freshness: &str) -> Option<&'static str> {
    match freshness {
        "fresh" => Some("Top surfaced object result is still fresh in the current result window."),
        "active" => {
            Some("Top surfaced object result remains active within the current result window.")
        }
        "stale" => Some("Top surfaced object result is older context that still ranks highly."),
        _ => None,
    }
}

async fn supertag_messages_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let tags = parse_supertag_filters(&params);
    if tags.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "tag or tags query parameter required".to_string(),
        ));
    }
    let kind = parse_kind_filter(&params);

    let match_all = matches!(
        params
            .get("match")
            .map(|value| value.trim().to_ascii_lowercase())
            .as_deref(),
        Some("all")
    );
    let hierarchy_requested = parse_supertag_hierarchy_expansion(&params);
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(30)
        .clamp(1, 100);
    let offset = parse_supertag_message_offset(&params);

    let hierarchy_expanded = hierarchy_requested && !match_all;
    let resolved_tags = if hierarchy_expanded {
        state
            .db
            .expand_supertag_query_tags(&user.id, &tags)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?
    } else {
        tags.clone()
    };

    let messages = state
        .db
        .list_private_messages_by_supertags(
            &user.id,
            &resolved_tags,
            kind.as_deref(),
            match_all,
            limit + 1,
            offset,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(proto_to_app)
        .map(|message| {
            serde_json::json!({
                "id": message.id,
                "thread_id": message.thread_id,
                "parent_id": message.parent_id,
                "from": message.from,
                "to": message.to,
                "timestamp": message.timestamp,
                "type": message.r#type,
                "kind": message.kind,
                "subtype": message.subtype,
                "supertags": message.supertags,
                "content": message.content,
                "metadata": message.metadata,
                "views": message.views,
                "attachments": message.attachments,
                "references": message.references,
                "encryption": message.encryption,
                "signature": message.signature,
            })
        })
        .collect::<Vec<_>>();
    let has_more = messages.len() as i64 > limit;
    let messages = messages
        .into_iter()
        .take(limit as usize)
        .collect::<Vec<_>>();

    Ok(Json(serde_json::json!({
        "tags": tags,
        "resolved_tags": resolved_tags,
        "kind": kind,
        "match": if match_all { "all" } else { "any" },
        "hierarchy_requested": hierarchy_requested,
        "hierarchy_expanded": hierarchy_expanded,
        "count": messages.len(),
        "limit": limit,
        "offset": offset,
        "next_offset": if has_more { Some(offset + limit) } else { None },
        "has_more": has_more,
        "messages": messages,
    })))
}

async fn reference_messages_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let (targets, reference_type, link_type, kind, limit) = parse_reference_query(&params);
    if targets.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "target or targets query parameter required".to_string(),
        ));
    }

    let messages = state
        .db
        .list_private_messages_by_reference_targets(
            &user.id,
            &targets,
            reference_type.as_deref(),
            link_type.as_deref(),
            kind.as_deref(),
            limit,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(proto_to_app)
        .map(|message| {
            serde_json::json!({
                "id": message.id,
                "thread_id": message.thread_id,
                "parent_id": message.parent_id,
                "from": message.from,
                "to": message.to,
                "timestamp": message.timestamp,
                "type": message.r#type,
                "kind": message.kind,
                "subtype": message.subtype,
                "supertags": message.supertags,
                "content": message.content,
                "metadata": message.metadata,
                "views": message.views,
                "attachments": message.attachments,
                "references": message.references,
                "encryption": message.encryption,
                "signature": message.signature,
            })
        })
        .collect::<Vec<_>>();

    Ok(Json(serde_json::json!({
        "targets": targets,
        "reference_type": reference_type,
        "link_type": link_type,
        "kind": kind,
        "count": messages.len(),
        "messages": messages,
    })))
}

async fn object_messages_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let object_query = parse_object_message_query(&params);

    if object_query.kind.is_none()
        && object_query.tags.is_empty()
        && object_query.reference_targets.is_empty()
        && object_query.reference_type.is_none()
        && object_query.link_type.is_none()
        && object_query.metadata_keys.is_empty()
        && object_query.metadata_values.is_empty()
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "at least one object facet filter is required".to_string(),
        ));
    }

    let messages = state
        .db
        .list_private_messages_by_object_facets(
            &user.id,
            object_query.kind.as_deref(),
            &object_query.tags,
            object_query.match_all,
            &object_query.reference_targets,
            object_query.reference_type.as_deref(),
            object_query.link_type.as_deref(),
            &object_query.metadata_keys,
            &object_query.metadata_values,
            object_query.limit,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(proto_to_app)
        .collect::<Vec<_>>();
    let mut messages = messages;
    rank_object_messages(&mut messages, &object_query);
    let facet_suggestions = object_message_facet_suggestions(&messages, &object_query);
    let facet_next_moves = object_message_facet_next_moves(&messages, &object_query);
    let retrieval_state =
        object_message_retrieval_state(&object_query, &facet_next_moves, &messages);
    let messages = messages
        .into_iter()
        .map(|message| {
            serde_json::json!({
                "id": message.id,
                "thread_id": message.thread_id,
                "parent_id": message.parent_id,
                "from": message.from,
                "to": message.to,
                "timestamp": message.timestamp,
                "type": message.r#type,
                "kind": message.kind,
                "subtype": message.subtype,
                "supertags": message.supertags,
                "content": message.content,
                "metadata": message.metadata,
                "views": message.views,
                "attachments": message.attachments,
                "references": message.references,
                "encryption": message.encryption,
                "signature": message.signature,
            })
        })
        .collect::<Vec<_>>();

    Ok(Json(serde_json::json!({
        "query": object_query.query,
        "free_text": object_query.free_text,
        "focus_thread_id": object_query.focus_thread_id,
        "focus_object_id": object_query.focus_object_id,
        "kind": object_query.kind,
        "tags": object_query.tags,
        "reference_targets": object_query.reference_targets,
        "reference_type": object_query.reference_type,
        "link_type": object_query.link_type,
        "metadata_keys": object_query.metadata_keys,
        "metadata_values": object_query.metadata_values,
        "match": if object_query.match_all { "all" } else { "any" },
        "facet_suggestions": facet_suggestions,
        "facet_next_moves": facet_next_moves,
        "retrieval_state": retrieval_state,
        "count": messages.len(),
        "messages": messages,
    })))
}

async fn thread_summaries_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let (
        query,
        tags,
        reference_targets,
        metadata_values,
        metadata_terms,
        thread_ids,
        from_agents,
        time_from,
        time_to,
        kind,
        match_all,
        limit,
    ) = parse_thread_summary_query(&params);

    let thread_summaries = load_ranked_thread_summaries(
        &state.db,
        &user.id,
        query.as_deref(),
        &tags,
        &reference_targets,
        &metadata_values,
        &metadata_terms,
        &thread_ids,
        &from_agents,
        time_from.as_deref(),
        time_to.as_deref(),
        kind.as_deref(),
        match_all,
        limit,
    )
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;
    let facet_suggestions = thread_discovery_facet_suggestions(
        &thread_summaries,
        &tags,
        &metadata_terms,
        kind.as_deref(),
    );
    let facet_next_moves = thread_discovery_facet_next_moves(
        &thread_summaries,
        &tags,
        &metadata_terms,
        kind.as_deref(),
    );
    let retrieval_state = thread_discovery_retrieval_state(
        query.as_deref(),
        &tags,
        &reference_targets,
        &metadata_values,
        &metadata_terms,
        &thread_ids,
        &from_agents,
        time_from.as_deref(),
        time_to.as_deref(),
        kind.as_deref(),
        Some(&facet_next_moves),
        &thread_summaries,
    );

    Ok(Json(serde_json::json!({
        "query": query,
        "tags": tags,
        "reference_targets": reference_targets,
        "metadata_values": metadata_values,
        "metadata_terms": metadata_terms,
        "thread_ids": thread_ids,
        "from_agents": from_agents,
        "time_from": time_from,
        "time_to": time_to,
        "kind": kind,
        "match": if match_all { "all" } else { "any" },
        "facet_suggestions": facet_suggestions,
        "facet_next_moves": facet_next_moves,
        "retrieval_state": retrieval_state,
        "count": thread_summaries.len(),
        "thread_summaries": thread_summaries,
    })))
}

fn claim_message_label(message_id: &str, message: Option<&Value>) -> String {
    let Some(message) = message else {
        return message_id.to_string();
    };
    let content = message.get("content").and_then(Value::as_object);
    let direct = content
        .and_then(|obj| {
            obj.get("title")
                .and_then(Value::as_str)
                .or_else(|| obj.get("claim").and_then(Value::as_str))
                .or_else(|| obj.get("text").and_then(Value::as_str))
                .or_else(|| obj.get("summary").and_then(Value::as_str))
        })
        .or_else(|| message.get("subtype").and_then(Value::as_str))
        .unwrap_or(message_id)
        .trim();
    if direct.is_empty() {
        message_id.to_string()
    } else {
        direct.to_string()
    }
}

fn claim_edge_rows(
    edges: &[Value],
    messages: &serde_json::Map<String, Value>,
    limit: usize,
) -> Vec<Value> {
    edges
        .iter()
        .take(limit.max(1))
        .map(|edge| {
            let message_id = edge
                .get("message_id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let label = claim_message_label(message_id, messages.get(message_id));
            let similarity = edge
                .get("similarity")
                .and_then(Value::as_f64)
                .map(|value| format!("{value:.2}"))
                .unwrap_or_else(|| "—".to_string());
            serde_json::json!([
                label,
                edge.get("direction").and_then(Value::as_str).unwrap_or(""),
                edge.get("ref_type")
                    .and_then(Value::as_str)
                    .unwrap_or("mentions"),
                similarity,
            ])
        })
        .collect()
}

fn related_claim_rows(
    related_claims: &[Value],
    messages: &serde_json::Map<String, Value>,
    limit: usize,
) -> Vec<Value> {
    related_claims
        .iter()
        .take(limit.max(1))
        .map(|claim| {
            let message_id = claim
                .get("message_id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let label = claim_message_label(message_id, messages.get(message_id));
            serde_json::json!([
                label,
                claim
                    .get("hop_distance")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
                claim
                    .get("support_edges")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
                claim
                    .get("refute_edges")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
                claim
                    .get("mention_edges")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
            ])
        })
        .collect()
}

fn claim_neighborhood_a2ui(
    message_id: &str,
    neighborhood: &Value,
    stance: Option<&str>,
    depth: u32,
    limit_per_group: i64,
) -> Value {
    let summary = neighborhood
        .get("summary")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let messages = neighborhood
        .get("messages")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let anchor = neighborhood.get("anchor");
    let supports = neighborhood
        .get("supports")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let refutes = neighborhood
        .get("refutes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mentions = neighborhood
        .get("mentions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let related_claims = neighborhood
        .get("related_claims")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let dominant_predicates = summary
        .get("dominant_predicates")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let anchor_label = claim_message_label(message_id, anchor);
    let support_count = summary
        .get("support_count")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let refute_count = summary
        .get("refute_count")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let mention_count = summary
        .get("mention_count")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let related_claim_count = summary
        .get("related_claim_count")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let net_support = summary
        .get("net_support")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let stance_label = stance.unwrap_or("all");
    let summary_body = format!(
        "{anchor_label} currently has {support_count} supporting links, {refute_count} counter-links, and {related_claim_count} related claims across {depth} hop(s). Net support: {net_support}."
    );

    let predicate_rows = dominant_predicates
        .iter()
        .take(limit_per_group.max(1) as usize)
        .map(|predicate| {
            serde_json::json!([
                predicate
                    .get("predicate")
                    .and_then(Value::as_str)
                    .unwrap_or("related_to"),
                predicate.get("count").and_then(Value::as_u64).unwrap_or(0),
            ])
        })
        .collect::<Vec<_>>();

    let mut content = serde_json::json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": "Claim neighborhood",
        "description": "Typed support, refute, and related-claim context around the selected claim.",
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": [
            {
                "id": "claim-neighborhood-summary",
                "type": "callout",
                "props": {
                    "tone": if net_support >= 0 { "info" } else { "warning" },
                    "title": anchor_label,
                    "body": summary_body,
                }
            },
            {
                "id": "claim-neighborhood-stats",
                "type": "stats_grid",
                "props": {
                    "items": [
                        {"label": "Supports", "value": support_count.to_string()},
                        {"label": "Refutes", "value": refute_count.to_string()},
                        {"label": "Mentions", "value": mention_count.to_string()},
                        {"label": "Related", "value": related_claim_count.to_string()},
                    ]
                }
            },
            {
                "id": "claim-neighborhood-filters",
                "type": "text",
                "props": {
                    "label": "Graph scope",
                    "value": format!("stance={stance_label} · depth={depth} · group limit={limit_per_group}"),
                }
            },
            {
                "id": "claim-neighborhood-supports",
                "type": "table",
                "props": {
                    "columns": ["Supporting claim", "Direction", "Ref type", "Similarity"],
                    "rows": claim_edge_rows(&supports, &messages, limit_per_group.max(1) as usize),
                    "caption": "Direct supporting evidence",
                }
            },
            {
                "id": "claim-neighborhood-refutes",
                "type": "table",
                "props": {
                    "columns": ["Counter-claim", "Direction", "Ref type", "Similarity"],
                    "rows": claim_edge_rows(&refutes, &messages, limit_per_group.max(1) as usize),
                    "caption": "Direct counter-evidence",
                }
            },
            {
                "id": "claim-neighborhood-related",
                "type": "table",
                "props": {
                    "columns": ["Related claim", "Hops", "Supports", "Refutes", "Mentions"],
                    "rows": related_claim_rows(&related_claims, &messages, limit_per_group.max(1) as usize),
                    "caption": "Multi-hop related claims",
                }
            },
            {
                "id": "claim-neighborhood-predicates",
                "type": "table",
                "props": {
                    "columns": ["Predicate", "Count"],
                    "rows": predicate_rows,
                    "caption": "Dominant triple predicates",
                }
            },
            {
                "id": "claim-neighborhood-mentions",
                "type": "table",
                "props": {
                    "columns": ["Mentioning claim", "Direction", "Ref type", "Similarity"],
                    "rows": claim_edge_rows(&mentions, &messages, limit_per_group.max(1) as usize),
                    "caption": "Other typed mentions",
                }
            }
        ]
    });
    attach_render_resolution(
        &mut content,
        "a2ui.v1",
        "a2ui.v1",
        true,
        "a2ui",
        "Pure A2UI",
        "Knowledge graph companion rendered through the A2UI contract.",
    );
    content
}

async fn note_backlinks_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
    Path(message_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let ref_type_filter = params
        .get("ref_type")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let direction_filter = params
        .get("direction")
        .map(|value| value.trim().to_lowercase())
        .filter(|value| matches!(value.as_str(), "inbound" | "outbound"));
    let backlinks = state
        .db
        .list_backlinks_for_message(&user.id, &message_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let items: Vec<Value> = backlinks
        .into_iter()
        .filter(|record| match ref_type_filter.as_ref() {
            Some(value) => record.ref_type.eq_ignore_ascii_case(value),
            None => true,
        })
        .filter(|record| match direction_filter.as_ref() {
            Some(direction) => {
                (direction == "outbound" && record.source_id == message_id)
                    || (direction == "inbound" && record.source_id != message_id)
            }
            None => true,
        })
        .map(|record| {
            let ref_type = if record.ref_type.is_empty() {
                Value::Null
            } else {
                Value::String(record.ref_type.clone())
            };
            serde_json::json!({
                "backlink_id": record.backlink_id,
                "source_id":   record.source_id,
                "target_id":   record.target_id,
                "direction":   if record.source_id == message_id { "outbound" } else { "inbound" },
                "link_kind":   format!("{:?}", record.link_kind).to_lowercase(),
                "ref_type":    ref_type,
                "similarity":  record.similarity,
                "entities":    record.entities,
                "created_at":  record.created_at,
            })
        })
        .collect();
    let count = items.len();
    Ok(Json(serde_json::json!({
        "message_id": message_id,
        "filters": {
            "ref_type": ref_type_filter,
            "direction": direction_filter,
        },
        "backlinks":  items,
        "count":      count,
    })))
}

/// `GET /notes/supertags`
///
/// Returns the top-20 supertags most frequently used in the authenticated
/// user's private messages and derived knowledge cards, ordered by frequency
/// descending. Used to populate the DashboardFeed filter strip and the NoteView
/// autocomplete palette.
async fn user_supertags_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let tags = state
        .db
        .list_top_supertags(&user.id, 20)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "supertags": tags })))
}

/// `GET /notes/supertag-definitions`
///
/// Returns the authenticated user's stored supertag definitions, including
/// optional hierarchy metadata.
async fn user_supertag_definitions_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let definitions = state
        .db
        .list_supertag_definitions(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "definitions": definitions })))
}

/// `POST /notes/{message_id}/backlink-override`
///
/// Stores a `backlink_override` AFP message that the Knowledge Curator will
/// respect on the next processing pass for this message.
///
/// Body: `{ "suppress": bool, "rules": "...", "scope": "message" | "thread" }`
async fn note_backlink_override_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(message_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    // Verify the target message belongs to the authenticated user.
    let owner: Option<String> =
        sqlx::query_scalar("SELECT owner_user_id FROM afp_messages WHERE id = $1")
            .bind(&message_id)
            .fetch_optional(&state.db.pool)
            .await
            .unwrap_or(None);
    if owner.as_deref() != Some(user.id.as_str()) {
        return Err((StatusCode::NOT_FOUND, "message not found".to_string()));
    }

    let suppress = body
        .get("suppress")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let rules = body
        .get("rules")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .map(str::to_string);
    let scope_str = body
        .get("scope")
        .and_then(Value::as_str)
        .unwrap_or("message");
    let thread_id = body
        .get("thread_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let content = serde_json::json!({
        "source_id":  message_id,
        "thread_id":  if thread_id.is_empty() { Value::Null } else { Value::String(thread_id.clone()) },
        "scope":      scope_str,
        "suppress":   suppress,
        "rules":      rules,
    });

    let msg = crate::afp::Message {
        protocol: "afp-v1".to_string(),
        id: format!("backlink-override.{}", Ulid::new()),
        thread_id: if thread_id.is_empty() {
            format!("thread.backlink-override.{message_id}")
        } else {
            thread_id
        },
        parent_id: String::new(),
        from: format!("omnyid://user/{}", user.id),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: crate::message::AFP_TYPE_BACKLINK_OVERRIDE.to_string(),
        kind: None,
        supertags: vec![],
        content: content.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: serde_json::json!([message_id]).to_string(),
        attachments: "[]".to_string(),
        store_in_relational: false,
        subtype: scope_str.to_string(),
        metadata: serde_json::json!({ "source_id": message_id }).to_string(),
    };
    state
        .db
        .store_private_message(&user.id, &msg, content)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "stored": true,
        "message_id": message_id,
        "suppress": suppress,
        "scope": scope_str,
    })))
}

/// `GET /backlinks/graph?root={id}&depth={n}`
///
/// BFS traversal of the backlink graph starting from `root`, up to `depth`
/// hops (max 4).  Returns all reachable nodes and edges as a JSON graph
/// suitable for force-directed visualisation.
async fn backlinks_graph_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let root = params
        .get("root")
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "root query parameter required".to_string(),
            )
        })?
        .clone();
    let depth: u32 = params
        .get("depth")
        .and_then(|s| s.parse().ok())
        .unwrap_or(2)
        .min(4);
    let ref_type_filter = params
        .get("ref_type")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let (nodes, edges) = state
        .db
        .bfs_backlinks_graph(&user.id, &root, depth)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let edge_values: Vec<Value> = edges
        .into_iter()
        .filter(|record| match ref_type_filter.as_ref() {
            Some(value) => record.ref_type.eq_ignore_ascii_case(value),
            None => true,
        })
        .map(|record| {
            let ref_type = if record.ref_type.is_empty() {
                Value::Null
            } else {
                Value::String(record.ref_type.clone())
            };
            serde_json::json!({
                "backlink_id": record.backlink_id,
                "source_id":   record.source_id,
                "target_id":   record.target_id,
                "link_kind":   format!("{:?}", record.link_kind).to_lowercase(),
                "ref_type":    ref_type,
                "similarity":  record.similarity,
                "entities":    record.entities,
                "created_at":  record.created_at,
            })
        })
        .collect();
    let node_count = nodes.len();
    let edge_count = edge_values.len();

    Ok(Json(serde_json::json!({
        "root":   root,
        "depth":  depth,
        "ref_type": ref_type_filter,
        "nodes":  nodes,
        "edges":  edge_values,
        "node_count": node_count,
        "edge_count": edge_count,
    })))
}

async fn knowledge_triples_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let subject = params
        .get("subject")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let predicate = params
        .get("predicate")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let object = params
        .get("object")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let source_message_id = params
        .get("source_message_id")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let domain = params
        .get("domain")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(50)
        .clamp(1, 200);

    let triples = state
        .db
        .query_private_knowledge_triples(
            &user.id,
            subject,
            predicate,
            object,
            source_message_id,
            domain,
            limit,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let count = triples.len();

    Ok(Json(serde_json::json!({
        "filters": {
            "subject": subject,
            "predicate": predicate,
            "object": object,
            "source_message_id": source_message_id,
            "domain": domain,
            "limit": limit,
        },
        "triples": triples,
        "count": count,
    })))
}

async fn knowledge_context_window_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let anchor_message_id = params
        .get("message_id")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let anchor_timestamp = params
        .get("anchor_timestamp")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    if anchor_message_id.is_none() && anchor_timestamp.is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            "message_id or anchor_timestamp query parameter required".to_string(),
        ));
    }
    let window_minutes = params
        .get("window_minutes")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(60)
        .clamp(1, 1440);
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(20)
        .clamp(1, 200);
    let message_type = params
        .get("type")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());

    let messages = state
        .db
        .query_private_context_window(
            &user.id,
            anchor_message_id,
            anchor_timestamp,
            window_minutes,
            limit,
            message_type,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let count = messages.len();

    Ok(Json(serde_json::json!({
        "filters": {
            "message_id": anchor_message_id,
            "anchor_timestamp": anchor_timestamp,
            "window_minutes": window_minutes,
            "limit": limit,
            "type": message_type,
        },
        "messages": messages,
        "count": count,
    })))
}

async fn knowledge_claim_neighborhood_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(message_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let limit_per_group = params
        .get("limit_per_group")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(8)
        .clamp(1, 50);
    let depth = params
        .get("depth")
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(1)
        .clamp(1, 3);
    let stance = params
        .get("stance")
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| {
            matches!(
                value.as_str(),
                "all"
                    | "supports"
                    | "refutes"
                    | "mentions"
                    | "part_of"
                    | "caused_by"
                    | "temporally_related"
            )
        });

    let neighborhood = state
        .db
        .query_private_claim_neighborhood(
            &user.id,
            &message_id,
            limit_per_group,
            stance.as_deref(),
            depth as i64,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let a2ui = claim_neighborhood_a2ui(
        &message_id,
        &neighborhood,
        stance.as_deref(),
        depth,
        limit_per_group,
    );

    Ok(Json(serde_json::json!({
        "message_id": message_id,
        "limit_per_group": limit_per_group,
        "filters": {
            "depth": depth,
            "stance": stance,
        },
        "neighborhood": neighborhood,
        "a2ui": a2ui,
    })))
}

/// `GET /knowledge/neighborhood?anchor_ids={a,b,c}&hops=2&limit=20`
///
/// Topology-aware neighborhood search. BFS-expands from anchor message IDs through
/// the backlink graph, fetches all reachable AFP messages, and returns a ranked
/// `TopologyNeighborhoodBundle` suitable for the Master Agent context panel.
async fn knowledge_neighborhood_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    use crate::topology_retrieval::build_neighborhood_bundle;
    use sqlx::Row;

    let user = authenticated_user(&state.db, &headers).await?;

    let raw_anchor_ids = params.get("anchor_ids").map(|s| s.as_str()).unwrap_or("");
    if raw_anchor_ids.len() > 2048 {
        return Err((
            StatusCode::BAD_REQUEST,
            "anchor_ids param too large (max 2048 bytes)".to_string(),
        ));
    }
    let anchor_ids: Vec<String> = raw_anchor_ids
        .split(',')
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .take(10)
        .collect();
    if anchor_ids.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "anchor_ids required (comma-separated)".to_string(),
        ));
    }
    let hops: u32 = params
        .get("hops")
        .and_then(|s| s.parse().ok())
        .unwrap_or(2)
        .min(3);
    let limit: usize = params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(20)
        .min(50);

    // BFS from each anchor to collect all reachable node IDs
    let mut all_node_ids: std::collections::HashSet<String> = anchor_ids.iter().cloned().collect();
    for anchor_id in &anchor_ids {
        let (nodes, _) = state
            .db
            .bfs_backlinks_graph(&user.id, anchor_id, hops)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        all_node_ids.extend(nodes);
    }

    // Fetch AFP payloads for all discovered message IDs
    let node_list: Vec<String> = all_node_ids.into_iter().collect();
    let rows = sqlx::query(
        r#"SELECT payload FROM afp_messages
           WHERE owner_user_id = $1 AND id = ANY($2)
           LIMIT 200"#,
    )
    .bind(&user.id)
    .bind(&node_list)
    .fetch_all(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    let messages: Vec<Value> = rows
        .iter()
        .filter_map(|r| r.try_get::<Value, _>("payload").ok())
        .collect();

    let bundle = build_neighborhood_bundle(&anchor_ids, &messages, hops as usize, limit);

    Ok(Json(serde_json::json!({
        "anchor_ids":       anchor_ids,
        "hops":             hops,
        "limit":            limit,
        "coverage_summary": bundle.coverage_summary,
        "result_count":     bundle.result_budget_used,
        "items":            bundle.items,
    })))
}

/// Default taxonomy to seed.  Each entry is `(tag_name, keywords)`.
const DEFAULT_SUPERTAG_TAXONOMY: &[(&str, &[&str])] = &[
    (
        "#Work",
        &[
            "meeting",
            "standup",
            "sprint",
            "deadline",
            "milestone",
            "jira",
            "ticket",
            "project",
            "client",
            "proposal",
        ],
    ),
    (
        "#Personal",
        &[
            "birthday",
            "anniversary",
            "family",
            "holiday",
            "weekend",
            "personal",
            "home",
        ],
    ),
    (
        "#Health",
        &[
            "gym",
            "workout",
            "doctor",
            "appointment",
            "medication",
            "therapy",
            "wellness",
            "run",
            "exercise",
        ],
    ),
    (
        "#Finance",
        &[
            "invoice",
            "payment",
            "salary",
            "tax",
            "budget",
            "expense",
            "receipt",
            "bank",
            "subscription",
        ],
    ),
    (
        "#Travel",
        &[
            "flight",
            "hotel",
            "airport",
            "visa",
            "booking",
            "trip",
            "travel",
            "itinerary",
            "passport",
        ],
    ),
    (
        "#Learning",
        &[
            "course",
            "lecture",
            "study",
            "tutorial",
            "book",
            "reading",
            "workshop",
            "certification",
        ],
    ),
    (
        "#Ideas",
        &[
            "idea",
            "brainstorm",
            "concept",
            "hypothesis",
            "experiment",
            "prototype",
            "draft",
        ],
    ),
    (
        "#Urgent",
        &[
            "urgent", "asap", "critical", "blocker", "p0", "hotfix", "fire", "outage",
        ],
    ),
];

/// `POST /notes/supertags/install-defaults`
///
/// One-click install of the default supertag taxonomy.  Writes one
/// `supertag_definition` AFP message per tag.  Idempotent — safe to call
/// multiple times.
async fn install_default_supertags_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    use crate::message::AFP_TYPE_SUPERTAG_DEFINITION;
    use std::collections::HashSet;

    let user = authenticated_user(&state.db, &headers).await?;
    let mut installed: Vec<String> = Vec::new();
    let existing_tags: HashSet<String> = state
        .db
        .list_supertag_definitions(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .filter_map(|definition| {
            definition
                .get("tag_name")
                .and_then(Value::as_str)
                .map(|tag_name| tag_name.trim().to_ascii_lowercase())
        })
        .collect();

    for (tag_name, keywords) in DEFAULT_SUPERTAG_TAXONOMY {
        if existing_tags.contains(&tag_name.to_ascii_lowercase()) {
            continue;
        }
        let content = serde_json::json!({
            "tag_name":     tag_name,
            "keywords":     keywords,
            "folder_scope": [],
            "parent_tags":  [],
            "alias_tags":   [],
            "hierarchy_mode": "soft",
        });
        let slug = tag_name.trim_start_matches('#').to_lowercase();
        let msg = crate::afp::Message {
            protocol: "afp-v1".to_string(),
            id: format!("supertag-def.{}.{}", slug, Ulid::new()),
            thread_id: format!("thread.supertag-def.{slug}"),
            parent_id: String::new(),
            from: format!("omnyid://user/{}", user.id),
            to: vec!["omnyid://workspace/user".to_string()],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: AFP_TYPE_SUPERTAG_DEFINITION.to_string(),
            kind: None,
            supertags: vec![],
            content: content.to_string(),
            signature: String::new(),
            encryption: "{}".to_string(),
            views: "[]".to_string(),
            references: "[]".to_string(),
            attachments: "[]".to_string(),
            store_in_relational: false,
            subtype: String::new(),
            metadata: "{}".to_string(),
        };
        if let Err(e) = state
            .db
            .store_private_message(&user.id, &msg, content)
            .await
        {
            tracing::warn!("install_default_supertags: skipped {tag_name}: {e}");
            continue;
        }
        installed.push(tag_name.to_string());
    }

    let count = installed.len();
    Ok(Json(serde_json::json!({
        "installed": installed,
        "count": count,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn object_message(
        id: &str,
        timestamp: &str,
        kind: Option<&str>,
        subtype: Option<&str>,
        supertags: &[&str],
        content: serde_json::Value,
        metadata: Option<serde_json::Value>,
        references: &[serde_json::Value],
    ) -> AFPMessage {
        AFPMessage {
            protocol: "afp-v1".to_string(),
            id: id.to_string(),
            thread_id: format!("thread.{id}"),
            parent_id: None,
            from: "omnyid://user/test".to_string(),
            to: vec!["omnyid://workspace/user".to_string()],
            timestamp: timestamp.to_string(),
            r#type: "ledger".to_string(),
            kind: kind.map(str::to_string),
            supertags: supertags.iter().map(|value| value.to_string()).collect(),
            subtype: subtype.map(str::to_string),
            content,
            metadata,
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: references.to_vec(),
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: false,
            prev_hash: None,
        }
    }

    #[test]
    fn claim_neighborhood_a2ui_includes_summary_and_tables() {
        let neighborhood = serde_json::json!({
            "anchor": {
                "message_id": "claim.anchor",
                "content": { "title": "Anchor claim" }
            },
            "summary": {
                "support_count": 2,
                "refute_count": 1,
                "mention_count": 1,
                "related_claim_count": 3,
                "net_support": 1,
                "dominant_predicates": [
                    {"predicate": "supports", "count": 2}
                ]
            },
            "supports": [
                {"message_id": "claim.support", "direction": "outbound", "ref_type": "supports", "similarity": 0.91}
            ],
            "refutes": [
                {"message_id": "claim.refute", "direction": "inbound", "ref_type": "refutes", "similarity": 0.42}
            ],
            "mentions": [],
            "related_claims": [
                {"message_id": "claim.related", "hop_distance": 2, "support_edges": 1, "refute_edges": 0, "mention_edges": 1}
            ],
            "messages": {
                "claim.support": { "content": { "title": "Supporting claim" } },
                "claim.refute": { "content": { "title": "Counter claim" } },
                "claim.related": { "content": { "title": "Related claim" } }
            },
            "triples": []
        });

        let panel = claim_neighborhood_a2ui("claim.anchor", &neighborhood, Some("supports"), 2, 8);
        assert_eq!(panel["schema_version"].as_str(), Some("a2ui.v1"));
        assert_eq!(panel["nodes"][0]["type"].as_str(), Some("callout"));
        assert_eq!(panel["nodes"][1]["type"].as_str(), Some("stats_grid"));
        assert_eq!(panel["nodes"][3]["type"].as_str(), Some("table"));
        assert_eq!(
            panel["nodes"][3]["props"]["rows"][0][0].as_str(),
            Some("Supporting claim")
        );
        assert_eq!(
            panel["render_resolution"]["strategy"]["label"].as_str(),
            Some("Pure A2UI")
        );
    }

    #[test]
    fn parse_supertag_filters_normalizes_hash_and_case() {
        let mut params = HashMap::new();
        params.insert(
            "tags".to_string(),
            " #Project:Aurora , topic:Launch, #Health ".to_string(),
        );

        assert_eq!(
            parse_supertag_filters(&params),
            vec![
                "project:aurora".to_string(),
                "topic:launch".to_string(),
                "health".to_string()
            ]
        );
    }

    #[test]
    fn parse_supertag_hierarchy_expansion_accepts_descendant_flags() {
        let mut params = HashMap::new();
        params.insert("expand_hierarchy".to_string(), "true".to_string());
        assert!(parse_supertag_hierarchy_expansion(&params));

        params.clear();
        params.insert("hierarchy".to_string(), "descendants".to_string());
        assert!(parse_supertag_hierarchy_expansion(&params));

        params.clear();
        params.insert("expand_hierarchy".to_string(), "no".to_string());
        assert!(!parse_supertag_hierarchy_expansion(&params));
    }

    #[test]
    fn parse_supertag_message_offset_clamps_to_bounded_window() {
        let mut params = HashMap::new();
        params.insert("offset".to_string(), "42".to_string());
        assert_eq!(parse_supertag_message_offset(&params), 42);

        params.insert("offset".to_string(), "-5".to_string());
        assert_eq!(parse_supertag_message_offset(&params), 0);

        params.insert("offset".to_string(), "25000".to_string());
        assert_eq!(parse_supertag_message_offset(&params), 10_000);
    }

    #[test]
    fn supertag_messages_route_exposes_pagination_metadata() {
        let source = include_str!("knowledge_routes.rs");
        let start = source
            .find("async fn supertag_messages_http(")
            .expect("supertag messages route exists");
        let end = source[start..]
            .find("\nasync fn reference_messages_http(")
            .map(|offset| start + offset)
            .expect("reference messages route follows supertag route");
        let route_source = &source[start..end];

        assert!(route_source.contains("parse_supertag_message_offset(&params)"));
        assert!(route_source.contains("limit + 1"));
        assert!(route_source.contains("\"has_more\": has_more"));
        assert!(route_source.contains("\"next_offset\""));
    }

    #[test]
    fn parse_kind_filter_normalizes_case_and_whitespace() {
        let mut params = HashMap::new();
        params.insert("kind".to_string(), "  Task  ".to_string());

        assert_eq!(parse_kind_filter(&params).as_deref(), Some("task"));
    }

    #[test]
    fn parse_reference_query_normalizes_filters_and_targets() {
        let mut params = HashMap::new();
        params.insert(
            "targets".to_string(),
            " msg_project_aurora , msg_health_routine ".to_string(),
        );
        params.insert("type".to_string(), " Message ".to_string());
        params.insert("linkType".to_string(), " Part_Of ".to_string());
        params.insert("kind".to_string(), " Task ".to_string());
        params.insert("limit".to_string(), "500".to_string());

        let (targets, reference_type, link_type, kind, limit) = parse_reference_query(&params);

        assert_eq!(
            targets,
            vec![
                "msg_project_aurora".to_string(),
                "msg_health_routine".to_string()
            ]
        );
        assert_eq!(reference_type.as_deref(), Some("message"));
        assert_eq!(link_type.as_deref(), Some("part_of"));
        assert_eq!(kind.as_deref(), Some("task"));
        assert_eq!(limit, 100);
    }

    #[test]
    fn parse_thread_summary_query_prefers_query_alias_and_clamps_limit() {
        let mut params = HashMap::new();
        params.insert("q".to_string(), "  launch prep  ".to_string());
        params.insert(
            "tags".to_string(),
            "project:aurora,#Topic:Launch".to_string(),
        );
        params.insert("limit".to_string(), "500".to_string());

        let (
            query,
            tags,
            reference_targets,
            metadata_values,
            metadata_terms,
            thread_ids,
            from_agents,
            time_from,
            time_to,
            kind,
            match_all,
            limit,
        ) = parse_thread_summary_query(&params);

        assert_eq!(query.as_deref(), Some("launch prep"));
        assert_eq!(
            tags,
            vec!["project:aurora".to_string(), "topic:launch".to_string()]
        );
        assert!(reference_targets.is_empty());
        assert!(metadata_values.is_empty());
        assert!(metadata_terms.is_empty());
        assert!(thread_ids.is_empty());
        assert!(from_agents.is_empty());
        assert!(time_from.is_none());
        assert!(time_to.is_none());
        assert!(kind.is_none());
        assert!(!match_all);
        assert_eq!(limit, 100);
    }

    #[test]
    fn parse_thread_summary_query_extracts_hash_tags_from_query_text() {
        let mut params = HashMap::new();
        params.insert(
            "query".to_string(),
            "review #ProjectAurora with #Health, then close".to_string(),
        );

        let (
            query,
            tags,
            reference_targets,
            metadata_values,
            metadata_terms,
            thread_ids,
            from_agents,
            time_from,
            time_to,
            kind,
            match_all,
            limit,
        ) = parse_thread_summary_query(&params);

        assert_eq!(query.as_deref(), Some("review with then close"));
        assert_eq!(
            tags,
            vec!["health".to_string(), "projectaurora".to_string()]
        );
        assert!(reference_targets.is_empty());
        assert!(metadata_values.is_empty());
        assert!(metadata_terms.is_empty());
        assert!(thread_ids.is_empty());
        assert!(from_agents.is_empty());
        assert!(time_from.is_none());
        assert!(time_to.is_none());
        assert!(kind.is_none());
        assert!(!match_all);
        assert_eq!(limit, 40);
    }

    #[test]
    fn parse_thread_summary_query_uses_defaults_for_invalid_input() {
        let mut params = HashMap::new();
        params.insert("query".to_string(), "   ".to_string());
        params.insert("limit".to_string(), "nope".to_string());

        let (
            query,
            tags,
            reference_targets,
            metadata_values,
            metadata_terms,
            thread_ids,
            from_agents,
            time_from,
            time_to,
            kind,
            match_all,
            limit,
        ) = parse_thread_summary_query(&params);

        assert!(query.is_none());
        assert!(tags.is_empty());
        assert!(reference_targets.is_empty());
        assert!(metadata_values.is_empty());
        assert!(metadata_terms.is_empty());
        assert!(thread_ids.is_empty());
        assert!(from_agents.is_empty());
        assert!(time_from.is_none());
        assert!(time_to.is_none());
        assert!(kind.is_none());
        assert!(!match_all);
        assert_eq!(limit, 40);
    }

    #[test]
    fn parse_thread_summary_query_supports_match_all() {
        let mut params = HashMap::new();
        params.insert("tags".to_string(), "project:aurora,health".to_string());
        params.insert("match".to_string(), "all".to_string());

        let (
            query,
            tags,
            reference_targets,
            metadata_values,
            metadata_terms,
            thread_ids,
            from_agents,
            time_from,
            time_to,
            kind,
            match_all,
            limit,
        ) = parse_thread_summary_query(&params);

        assert!(query.is_none());
        assert_eq!(
            tags,
            vec!["project:aurora".to_string(), "health".to_string()]
        );
        assert!(reference_targets.is_empty());
        assert!(metadata_values.is_empty());
        assert!(metadata_terms.is_empty());
        assert!(thread_ids.is_empty());
        assert!(from_agents.is_empty());
        assert!(time_from.is_none());
        assert!(time_to.is_none());
        assert!(kind.is_none());
        assert!(match_all);
        assert_eq!(limit, 40);
    }

    #[test]
    fn parse_thread_summary_query_extracts_kind_filter_from_query_text() {
        let mut params = HashMap::new();
        params.insert(
            "query".to_string(),
            "review kind:Task #ProjectAurora then close".to_string(),
        );

        let (
            query,
            tags,
            reference_targets,
            metadata_values,
            metadata_terms,
            thread_ids,
            from_agents,
            time_from,
            time_to,
            kind,
            match_all,
            limit,
        ) = parse_thread_summary_query(&params);

        assert_eq!(query.as_deref(), Some("review then close"));
        assert_eq!(tags, vec!["projectaurora".to_string()]);
        assert!(reference_targets.is_empty());
        assert!(metadata_values.is_empty());
        assert!(metadata_terms.is_empty());
        assert!(thread_ids.is_empty());
        assert!(from_agents.is_empty());
        assert!(time_from.is_none());
        assert!(time_to.is_none());
        assert_eq!(kind.as_deref(), Some("task"));
        assert!(!match_all);
        assert_eq!(limit, 40);
    }

    #[test]
    fn parse_thread_summary_query_extracts_reference_targets_and_metadata_values() {
        let mut params = HashMap::new();
        params.insert(
            "query".to_string(),
            "review target:msg_1 owner:ozan status:active #ProjectAurora".to_string(),
        );

        let (
            query,
            tags,
            reference_targets,
            metadata_values,
            metadata_terms,
            thread_ids,
            from_agents,
            time_from,
            time_to,
            kind,
            match_all,
            limit,
        ) = parse_thread_summary_query(&params);

        assert_eq!(query.as_deref(), Some("review owner:ozan"));
        assert_eq!(tags, vec!["projectaurora".to_string()]);
        assert_eq!(reference_targets, vec!["msg_1".to_string()]);
        assert_eq!(
            metadata_values,
            vec!["active".to_string(), "ozan".to_string()]
        );
        assert_eq!(
            metadata_terms,
            vec!["owner:ozan".to_string(), "status:active".to_string()]
        );
        assert!(thread_ids.is_empty());
        assert!(from_agents.is_empty());
        assert!(time_from.is_none());
        assert!(time_to.is_none());
        assert!(kind.is_none());
        assert!(!match_all);
        assert_eq!(limit, 40);
    }

    #[test]
    fn parse_thread_summary_query_extracts_thread_sender_and_date_scope_terms() {
        let mut params = HashMap::new();
        params.insert(
            "query".to_string(),
            "review thread:thread.alpha from:background_watcher after:2026-06-01 before:2026-06-30"
                .to_string(),
        );

        let (
            query,
            tags,
            reference_targets,
            metadata_values,
            metadata_terms,
            thread_ids,
            from_agents,
            time_from,
            time_to,
            kind,
            match_all,
            limit,
        ) = parse_thread_summary_query(&params);

        assert_eq!(query.as_deref(), Some("review"));
        assert!(tags.is_empty());
        assert!(reference_targets.is_empty());
        assert!(metadata_values.is_empty());
        assert!(metadata_terms.is_empty());
        assert_eq!(thread_ids, vec!["thread.alpha".to_string()]);
        assert_eq!(from_agents, vec!["background_watcher".to_string()]);
        assert_eq!(time_from.as_deref(), Some("2026-06-01"));
        assert_eq!(time_to.as_deref(), Some("2026-06-30"));
        assert!(kind.is_none());
        assert!(!match_all);
        assert_eq!(limit, 40);
    }

    #[test]
    fn parse_object_message_query_extracts_structured_reference_and_metadata_terms() {
        let mut params = HashMap::new();
        params.insert(
            "query".to_string(),
            "review kind:Task #ProjectAurora target:msg_1 relation:part_of owner:ozan status:active".to_string(),
        );
        params.insert("match".to_string(), "all".to_string());

        let parsed = parse_object_message_query(&params);

        assert_eq!(
            parsed.query.as_deref(),
            Some(
                "review kind:Task #ProjectAurora target:msg_1 relation:part_of owner:ozan status:active"
            )
        );
        assert_eq!(parsed.free_text.as_deref(), Some("review owner:ozan"));
        assert!(parsed.focus_thread_id.is_none());
        assert!(parsed.focus_object_id.is_none());
        assert_eq!(parsed.kind.as_deref(), Some("task"));
        assert_eq!(parsed.tags, vec!["projectaurora".to_string()]);
        assert_eq!(parsed.reference_targets, vec!["msg_1".to_string()]);
        assert_eq!(parsed.link_type.as_deref(), Some("part_of"));
        assert!(parsed.reference_type.is_none());
        assert_eq!(
            parsed.metadata_keys,
            vec![
                "metadata.searchable_metadata.status".to_string(),
                "owner".to_string()
            ]
        );
        assert_eq!(
            parsed.metadata_values,
            vec!["active".to_string(), "ozan".to_string()]
        );
        assert_eq!(
            parsed.metadata_terms,
            vec![
                ("owner".to_string(), "ozan".to_string()),
                ("status".to_string(), "active".to_string())
            ]
        );
        assert!(parsed.match_all);
    }

    #[test]
    fn rank_object_messages_prefers_state_biased_object_matches() {
        let query = ObjectMessageQuery {
            kind: Some("task".to_string()),
            tags: vec!["project:aurora".to_string()],
            reference_targets: vec!["msg_project_aurora".to_string()],
            metadata_values: vec!["active".to_string()],
            ..ObjectMessageQuery::default()
        };
        let mut messages = vec![
            object_message(
                "stale-note",
                "2024-01-01T00:00:00Z",
                Some("note"),
                Some("snapshot"),
                &["misc"],
                serde_json::json!({"title": "Archive note"}),
                Some(serde_json::json!({"status": "archived"})),
                &[],
            ),
            object_message(
                "active-task",
                "2026-06-15T00:00:00Z",
                Some("task"),
                Some("update"),
                &["project:aurora"],
                serde_json::json!({"title": "Aurora rollout", "summary": "Close launch blockers"}),
                Some(serde_json::json!({"status": "active"})),
                &[serde_json::json!({
                    "type": "message",
                    "target": "msg_project_aurora",
                    "metadata": { "link_type": "part_of" }
                })],
            ),
        ];

        rank_object_messages(&mut messages, &query);

        assert_eq!(messages[0].id, "active-task");
        assert_eq!(messages[1].id, "stale-note");
    }

    #[test]
    fn rank_object_messages_breaks_metadata_ties_toward_scope_terms() {
        let query = ObjectMessageQuery {
            metadata_terms: vec![
                ("memory_space".to_string(), "work".to_string()),
                ("priority".to_string(), "high".to_string()),
            ],
            ..ObjectMessageQuery::default()
        };
        let mut messages = vec![
            object_message(
                "priority-match",
                "2026-06-15T00:00:00Z",
                Some("note"),
                Some("update"),
                &["project:aurora"],
                serde_json::json!({"title": "Priority note"}),
                Some(serde_json::json!({"status": "active", "priority": "high"})),
                &[],
            ),
            object_message(
                "scope-match",
                "2026-06-15T00:00:00Z",
                Some("note"),
                Some("update"),
                &["project:aurora"],
                serde_json::json!({"title": "Scoped work note"}),
                Some(serde_json::json!({"status": "active", "memory_space": "work"})),
                &[],
            ),
        ];

        rank_object_messages(&mut messages, &query);

        assert_eq!(messages[0].id, "scope-match");
        assert_eq!(messages[1].id, "priority-match");
    }

    #[test]
    fn object_message_facet_suggestions_exclude_selected_filters_and_rank_counts() {
        let query = ObjectMessageQuery {
            kind: Some("task".to_string()),
            tags: vec!["project:aurora".to_string()],
            reference_targets: vec!["msg_project_aurora".to_string()],
            reference_type: Some("message".to_string()),
            link_type: Some("part_of".to_string()),
            metadata_terms: vec![("status".to_string(), "active".to_string())],
            ..ObjectMessageQuery::default()
        };
        let messages = vec![
            object_message(
                "task-1",
                "2026-06-15T00:00:00Z",
                Some("task"),
                Some("update"),
                &["project:aurora", "health"],
                serde_json::json!({"title": "Aurora rollout"}),
                Some(serde_json::json!({"status": "active", "owner": "ozan"})),
                &[serde_json::json!({
                    "type": "message",
                    "target": "msg_project_aurora",
                    "metadata": { "link_type": "part_of" }
                })],
            ),
            object_message(
                "task-2",
                "2026-06-14T00:00:00Z",
                Some("task"),
                Some("update"),
                &["health"],
                serde_json::json!({"title": "Health routine"}),
                Some(serde_json::json!({"status": "active", "owner": "ozan"})),
                &[serde_json::json!({
                    "type": "claim",
                    "target": "msg_health_routine",
                    "metadata": { "link_type": "supports" }
                })],
            ),
        ];

        let suggestions = object_message_facet_suggestions(&messages, &query);
        assert_eq!(suggestions["tags"][0]["value"].as_str(), Some("health"));
        assert_eq!(
            suggestions["reference_targets"][0]["value"].as_str(),
            Some("msg_health_routine")
        );
        assert_eq!(
            suggestions["reference_types"][0]["value"].as_str(),
            Some("claim")
        );
        assert_eq!(
            suggestions["link_types"][0]["value"].as_str(),
            Some("supports")
        );
        assert_eq!(
            suggestions["metadata_terms"][0]["value"].as_str(),
            Some("owner:ozan")
        );
    }

    #[test]
    fn object_message_facet_suggestions_prefer_focus_thread_weight_when_counts_tie() {
        let query = ObjectMessageQuery {
            focus_thread_id: Some("thread.alpha".to_string()),
            ..ObjectMessageQuery::default()
        };
        let mut alpha = object_message(
            "alpha-1",
            "2026-06-16T00:00:00Z",
            Some("task"),
            Some("update"),
            &["aurora"],
            serde_json::json!({"title": "Aurora task"}),
            Some(serde_json::json!({"status": "active"})),
            &[],
        );
        alpha.thread_id = "thread.alpha".to_string();

        let mut beta = object_message(
            "beta-1",
            "2026-06-15T00:00:00Z",
            Some("task"),
            Some("update"),
            &["health"],
            serde_json::json!({"title": "Health task"}),
            Some(serde_json::json!({"status": "active"})),
            &[],
        );
        beta.thread_id = "thread.beta".to_string();

        let suggestions = object_message_facet_suggestions(&[alpha, beta], &query);
        assert_eq!(suggestions["tags"][0]["value"].as_str(), Some("aurora"));
        assert_eq!(suggestions["tags"][1]["value"].as_str(), Some("health"));
    }

    #[test]
    fn object_message_facet_suggestions_prefer_scope_metadata_terms_on_equal_evidence() {
        let query = ObjectMessageQuery::default();
        let messages = vec![
            object_message(
                "task-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora task"}),
                Some(serde_json::json!({
                    "memory_space": "work",
                    "owner": "ozan"
                })),
                &[],
            ),
            object_message(
                "task-2",
                "2026-06-15T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora follow-up"}),
                Some(serde_json::json!({
                    "memory_space": "work",
                    "owner": "ozan"
                })),
                &[],
            ),
        ];

        let suggestions = object_message_facet_suggestions(&messages, &query);
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
    fn object_message_facet_next_moves_favor_discriminative_mid_coverage_terms() {
        let query = ObjectMessageQuery::default();
        let messages = vec![
            object_message(
                "task-1",
                "2026-06-15T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora", "health"],
                serde_json::json!({"title": "Aurora rollout"}),
                Some(serde_json::json!({"status": "active", "owner": "ozan"})),
                &[],
            ),
            object_message(
                "task-2",
                "2026-06-14T00:00:00Z",
                Some("task"),
                Some("update"),
                &["health"],
                serde_json::json!({"title": "Health routine"}),
                Some(serde_json::json!({"status": "active", "owner": "ozan"})),
                &[],
            ),
            object_message(
                "note-1",
                "2026-06-13T00:00:00Z",
                Some("note"),
                Some("snapshot"),
                &["aurora"],
                serde_json::json!({"title": "Aurora note"}),
                Some(serde_json::json!({"status": "archived", "owner": "maya"})),
                &[],
            ),
        ];

        let next_moves = object_message_facet_next_moves(&messages, &query);
        assert_eq!(next_moves["tags"][0]["value"].as_str(), Some("aurora"));
        assert_eq!(next_moves["kinds"][0]["value"].as_str(), Some("task"));
        assert_eq!(
            next_moves["metadata_terms"][0]["value"].as_str(),
            Some("status:active")
        );
        assert_eq!(
            next_moves["metadata_terms"][0]["rationale"].as_str(),
            Some(
                "active-state pressure + active status + strong narrowing power + fresh object support"
            )
        );
        assert_eq!(
            next_moves["tags"][0]["rationale"].as_str(),
            Some("active-state pressure + strong narrowing power + fresh object support")
        );
    }

    #[test]
    fn object_message_facet_next_moves_prefer_state_weighted_active_terms() {
        let query = ObjectMessageQuery::default();
        let messages = vec![
            object_message(
                "active-task-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora task"}),
                Some(serde_json::json!({"status": "active", "owner": "ozan"})),
                &[],
            ),
            object_message(
                "active-task-2",
                "2026-06-15T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora follow-up"}),
                Some(serde_json::json!({"status": "active", "owner": "ozan"})),
                &[],
            ),
            object_message(
                "archived-note",
                "2024-01-01T00:00:00Z",
                Some("note"),
                Some("snapshot"),
                &["archive"],
                serde_json::json!({"title": "Old archive"}),
                Some(serde_json::json!({"status": "archived", "owner": "maya"})),
                &[],
            ),
        ];

        let next_moves = object_message_facet_next_moves(&messages, &query);
        assert_eq!(next_moves["tags"][0]["value"].as_str(), Some("aurora"));
        assert_eq!(
            next_moves["metadata_terms"][0]["value"].as_str(),
            Some("status:active")
        );
        assert_eq!(
            next_moves["metadata_terms"][0]["rationale"].as_str(),
            Some(
                "active-state pressure + active status + strong narrowing power + fresh object support"
            )
        );
    }

    #[test]
    fn object_message_facet_next_moves_prefer_scope_metadata_terms_on_equal_evidence() {
        let query = ObjectMessageQuery::default();
        let messages = vec![
            object_message(
                "task-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora task"}),
                Some(serde_json::json!({
                    "memory_space": "work",
                    "owner": "ozan"
                })),
                &[],
            ),
            object_message(
                "task-2",
                "2026-06-15T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora follow-up"}),
                Some(serde_json::json!({
                    "memory_space": "work",
                    "owner": "ozan"
                })),
                &[],
            ),
            object_message(
                "task-3",
                "2026-06-14T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora note"}),
                Some(serde_json::json!({
                    "status": "active"
                })),
                &[],
            ),
        ];

        let next_moves = object_message_facet_next_moves(&messages, &query);
        let metadata_terms = next_moves["metadata_terms"]
            .as_array()
            .expect("metadata terms");
        assert_eq!(
            metadata_terms[0]["value"].as_str(),
            Some("memory_space:work")
        );
        assert_eq!(
            metadata_terms[0]["rationale"].as_str(),
            Some(
                "active-state pressure + work context + strong narrowing power + fresh object support"
            )
        );
        assert!(
            metadata_terms
                .iter()
                .any(|term| term["value"].as_str() == Some("status:active"))
        );
        assert!(
            metadata_terms
                .iter()
                .any(|term| term["value"].as_str() == Some("memory_space:work"))
        );
        assert!(
            metadata_terms
                .iter()
                .any(|term| term["value"].as_str() == Some("owner:ozan"))
        );
    }

    #[test]
    fn object_message_facet_next_moves_prefer_value_metadata_terms_on_equal_evidence() {
        let query = ObjectMessageQuery::default();
        let messages = vec![
            object_message(
                "task-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora task"}),
                Some(serde_json::json!({
                    "follow_up_at": "today",
                    "owner": "ozan"
                })),
                &[],
            ),
            object_message(
                "task-2",
                "2026-06-15T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora follow-up"}),
                Some(serde_json::json!({
                    "follow_up_at": "today",
                    "owner": "ozan"
                })),
                &[],
            ),
            object_message(
                "task-3",
                "2026-06-14T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora note"}),
                Some(serde_json::json!({
                    "status": "active"
                })),
                &[],
            ),
        ];

        let next_moves = object_message_facet_next_moves(&messages, &query);
        let metadata_terms = next_moves["metadata_terms"]
            .as_array()
            .expect("metadata terms");
        assert_eq!(
            metadata_terms[0]["value"].as_str(),
            Some("follow_up_at:today")
        );
        assert_eq!(
            metadata_terms[0]["rationale"].as_str(),
            Some(
                "active-state pressure + follow-up today + strong narrowing power + fresh object support"
            )
        );
        assert!(
            metadata_terms
                .iter()
                .any(|term| term["value"].as_str() == Some("status:active"))
        );
        assert!(
            metadata_terms
                .iter()
                .any(|term| term["value"].as_str() == Some("follow_up_at:today"))
        );
        assert!(
            metadata_terms
                .iter()
                .any(|term| term["value"].as_str() == Some("owner:ozan"))
        );
    }

    #[test]
    fn object_message_facet_next_moves_prefer_dominant_thread_context() {
        let query = ObjectMessageQuery::default();
        let messages = vec![
            object_message(
                "thread-a-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora task"}),
                Some(serde_json::json!({"status": "active", "owner": "ozan"})),
                &[],
            ),
            object_message(
                "thread-a-2",
                "2026-06-15T00:00:00Z",
                Some("note"),
                Some("update"),
                &["aurora", "supplierx"],
                serde_json::json!({"title": "Supplier note"}),
                Some(serde_json::json!({"status": "active", "owner": "ozan"})),
                &[],
            ),
            object_message(
                "thread-b-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["health"],
                serde_json::json!({"title": "Health task"}),
                Some(serde_json::json!({"status": "active", "owner": "maya"})),
                &[],
            ),
        ];
        let mut messages = messages;
        messages[0].thread_id = "thread.alpha".to_string();
        messages[1].thread_id = "thread.alpha".to_string();
        messages[2].thread_id = "thread.beta".to_string();

        let next_moves = object_message_facet_next_moves(&messages, &query);
        assert_eq!(next_moves["tags"][0]["value"].as_str(), Some("aurora"));
        assert_eq!(
            next_moves["metadata_terms"][0]["value"].as_str(),
            Some("owner:ozan")
        );
        assert_eq!(
            next_moves["tags"][0]["rationale"].as_str(),
            Some(
                "active-state pressure + local continuity + strong narrowing power + fresh object support"
            )
        );
    }

    #[test]
    fn object_message_facet_next_moves_prefer_explicit_focus_thread_over_inferred_thread() {
        let query = ObjectMessageQuery {
            focus_thread_id: Some("thread.beta".to_string()),
            ..ObjectMessageQuery::default()
        };
        let mut messages = vec![
            object_message(
                "thread-a-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora task"}),
                Some(serde_json::json!({"status": "active", "owner": "ozan"})),
                &[],
            ),
            object_message(
                "thread-a-2",
                "2026-06-15T00:00:00Z",
                Some("note"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora note"}),
                Some(serde_json::json!({"status": "active", "owner": "ozan"})),
                &[],
            ),
            object_message(
                "thread-b-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["health"],
                serde_json::json!({"title": "Health task"}),
                Some(serde_json::json!({"status": "active", "owner": "maya"})),
                &[],
            ),
        ];
        messages[0].thread_id = "thread.alpha".to_string();
        messages[1].thread_id = "thread.alpha".to_string();
        messages[2].thread_id = "thread.beta".to_string();

        let next_moves = object_message_facet_next_moves(&messages, &query);
        assert_eq!(next_moves["tags"][0]["value"].as_str(), Some("health"));
        assert_eq!(
            next_moves["metadata_terms"][0]["value"].as_str(),
            Some("owner:maya")
        );
        assert_eq!(
            next_moves["metadata_terms"][0]["rationale"].as_str(),
            Some(
                "active-state pressure + explicit thread focus + strong narrowing power + fresh object support"
            )
        );
    }

    #[test]
    fn object_message_facet_next_moves_include_focused_object_anchor_in_rationale() {
        let query = ObjectMessageQuery {
            focus_object_id: Some("msg_project_aurora".to_string()),
            ..ObjectMessageQuery::default()
        };
        let focused = object_message(
            "task-1",
            "2026-06-16T00:00:00Z",
            Some("task"),
            Some("update"),
            &["aurora"],
            serde_json::json!({"title": "Aurora task"}),
            Some(serde_json::json!({"status": "active", "owner": "ozan"})),
            &[serde_json::json!({
                "type": "message",
                "target": "msg_project_aurora",
                "metadata": { "link_type": "part_of" }
            })],
        );
        let unfocused = object_message(
            "task-2",
            "2026-06-15T00:00:00Z",
            Some("task"),
            Some("update"),
            &["health"],
            serde_json::json!({"title": "Health task"}),
            Some(serde_json::json!({"status": "active", "owner": "maya"})),
            &[],
        );

        let next_moves = object_message_facet_next_moves(&[focused, unfocused], &query);
        assert_eq!(next_moves["tags"][0]["value"].as_str(), Some("aurora"));
        assert_eq!(
            next_moves["tags"][0]["rationale"].as_str(),
            Some(
                "active-state pressure + focused object anchor + strong narrowing power + fresh object support"
            )
        );
    }

    #[test]
    fn object_message_facet_next_moves_call_out_older_object_support_when_stale_messages_drive_it()
    {
        let query = ObjectMessageQuery::default();
        let messages = vec![
            object_message(
                "fresh-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["topic:fresh"],
                serde_json::json!({"title": "Fresh task"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
            object_message(
                "stale-1",
                "2026-05-01T00:00:00Z",
                Some("task"),
                Some("update"),
                &["topic:archive"],
                serde_json::json!({"title": "Older archive task"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
            object_message(
                "stale-2",
                "2026-05-02T00:00:00Z",
                Some("task"),
                Some("update"),
                &["topic:archive"],
                serde_json::json!({"title": "Older archive follow-up"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
        ];

        let next_moves = object_message_facet_next_moves(&messages, &query);
        assert_eq!(
            next_moves["tags"][0]["value"].as_str(),
            Some("topic:archive")
        );
        assert_eq!(
            next_moves["tags"][0]["rationale"].as_str(),
            Some("active-state pressure + strong narrowing power + older object support")
        );
    }

    #[test]
    fn object_message_query_score_prefers_focus_thread_and_focus_object() {
        let query = ObjectMessageQuery {
            focus_thread_id: Some("thread.alpha".to_string()),
            focus_object_id: Some("msg_project_aurora".to_string()),
            ..ObjectMessageQuery::default()
        };
        let focused = object_message(
            "task-1",
            "2026-06-16T00:00:00Z",
            Some("task"),
            Some("update"),
            &["aurora"],
            serde_json::json!({"title": "Aurora task"}),
            Some(serde_json::json!({"status": "active"})),
            &[serde_json::json!({
                "type": "message",
                "target": "msg_project_aurora",
                "metadata": { "link_type": "part_of" }
            })],
        );
        let mut off_focus = focused.clone();
        off_focus.thread_id = "thread.beta".to_string();
        off_focus.references = vec![];

        let focused_score = object_message_query_score(&focused, &query, &[]);
        let off_focus_score = object_message_query_score(&off_focus, &query, &[]);
        assert!(focused_score > off_focus_score);
    }

    #[test]
    fn object_message_query_score_prefers_exact_memory_and_authorship_terms() {
        let query = ObjectMessageQuery {
            metadata_keys: vec!["memory_space".to_string(), "author_type".to_string()],
            metadata_values: vec!["work".to_string(), "human".to_string()],
            metadata_terms: vec![
                ("memory_space".to_string(), "work".to_string()),
                ("author_type".to_string(), "human".to_string()),
            ],
            ..ObjectMessageQuery::default()
        };
        let exact = object_message(
            "task-exact",
            "2026-06-16T00:00:00Z",
            Some("task"),
            Some("update"),
            &["aurora"],
            serde_json::json!({"title": "Exact scoped task"}),
            Some(serde_json::json!({
                "searchable_metadata": {
                    "memory_space": "work",
                    "author_type": "human"
                }
            })),
            &[],
        );
        let loose = object_message(
            "task-loose",
            "2026-06-15T00:00:00Z",
            Some("task"),
            Some("update"),
            &["aurora"],
            serde_json::json!({"title": "Loose scoped task"}),
            Some(serde_json::json!({
                "searchable_metadata": {
                    "memory_space": "private",
                    "owner": "human"
                }
            })),
            &[],
        );

        let exact_score = object_message_query_score(&exact, &query, &[]);
        let loose_score = object_message_query_score(&loose, &query, &[]);
        assert!(exact_score > loose_score);
    }

    #[test]
    fn object_message_retrieval_state_marks_kind_concentrated_results() {
        let query = ObjectMessageQuery {
            focus_object_id: Some("msg_project_aurora".to_string()),
            metadata_terms: vec![
                ("memory_space".to_string(), "work".to_string()),
                ("author_type".to_string(), "human".to_string()),
                ("status".to_string(), "active".to_string()),
                ("follow_up_at".to_string(), "today".to_string()),
            ],
            ..ObjectMessageQuery::default()
        };
        let messages = vec![
            object_message(
                "task-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora task"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
            object_message(
                "task-2",
                "2026-06-15T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora follow-up"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
        ];
        let facet_next_moves = serde_json::json!({
            "tags": [{
                "value": "aurora",
                "count": 2,
                "score": 0.88,
                "rationale": "active-state pressure + focused object anchor + strong narrowing power"
            }],
            "metadata_terms": [{
                "value": "memory_space:work",
                "count": 2,
                "score": 0.82,
                "rationale": "active-state pressure + work context + strong narrowing power"
            }, {
                "value": "follow_up_at:today",
                "count": 2,
                "score": 0.76,
                "rationale": "active-state pressure + follow-up today + strong narrowing power"
            }]
        });

        let state = object_message_retrieval_state(&query, &facet_next_moves, &messages);
        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("kind-concentrated"))
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
                "Current ranking is focused object anchored, active-state weighted, narrowing-first. Scoped to work context, human authored, active status, and follow-up today. Next best narrowing: work context. Top object results stay concentrated around task work. Top surfaced object result is still fresh in the current result window. Leading object cue: aurora. Focused object anchor: msg_project_aurora."
            )
        );
        assert_eq!(
            state["observability"]["active_filter_count"].as_u64(),
            Some(5)
        );
        assert_eq!(
            state["observability"]["narrowing_mode"].as_str(),
            Some("workspace_scoped")
        );
        assert_eq!(state["observability"]["result_count"].as_u64(), Some(2));
        assert_eq!(
            state["observability"]["scope_badge_count"].as_u64(),
            Some(4)
        );
        assert_eq!(state["observability"]["top_kind"].as_str(), Some("task"));
        assert_eq!(
            state["observability"]["top_activity_freshness"].as_str(),
            Some("fresh")
        );
        assert_eq!(
            state["observability"]["concentration_mode"].as_str(),
            Some("kind_concentrated")
        );
        assert_eq!(
            state["observability"]["next_best_narrowing"].as_str(),
            Some("Next best narrowing: work context")
        );
        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("fresh-top-object"))
        );
    }

    #[test]
    fn object_message_retrieval_state_marks_mixed_neighborhood_results() {
        let query = ObjectMessageQuery::default();
        let messages = vec![
            object_message(
                "task-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora task"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
            object_message(
                "decision-1",
                "2026-06-15T00:00:00Z",
                Some("decision"),
                Some("update"),
                &["aurora"],
                serde_json::json!({"title": "Aurora decision"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
        ];
        let facet_next_moves = serde_json::json!({
            "tags": [{
                "value": "aurora",
                "count": 2,
                "score": 0.88,
                "rationale": "local continuity + strong narrowing power"
            }]
        });

        let state = object_message_retrieval_state(&query, &facet_next_moves, &messages);
        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("mixed neighborhood"))
        );
        assert_eq!(
            state["summary"].as_str(),
            Some(
                "Current ranking is continuity local, narrowing-first. Top object results remain mixed across 2 work kinds. Top surfaced object result is still fresh in the current result window. Leading object cue: aurora."
            )
        );
        assert_eq!(
            state["observability"]["concentration_mode"].as_str(),
            Some("mixed_neighborhood")
        );
    }

    #[test]
    fn object_message_retrieval_state_surfaces_explicit_thread_priority() {
        let query = ObjectMessageQuery {
            focus_thread_id: Some("thread.health".to_string()),
            ..ObjectMessageQuery::default()
        };
        let messages = vec![
            object_message(
                "health-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["health"],
                serde_json::json!({"title": "Health task"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
            object_message(
                "health-2",
                "2026-06-15T00:00:00Z",
                Some("task"),
                Some("update"),
                &["health"],
                serde_json::json!({"title": "Health follow-up"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
        ];
        let facet_next_moves = serde_json::json!({
            "tags": [{
                "value": "health",
                "count": 2,
                "score": 0.88,
                "rationale": "active-state pressure + explicit thread focus + strong narrowing power"
            }]
        });

        let state = object_message_retrieval_state(&query, &facet_next_moves, &messages);
        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("thread-prioritized"))
        );
        assert_eq!(
            state["summary"].as_str(),
            Some(
                "Current ranking is thread prioritized, active-state weighted, narrowing-first. Top object results stay concentrated around task work. Top surfaced object result is still fresh in the current result window. Leading object cue: health. Thread anchor: thread.health."
            )
        );
    }

    #[test]
    fn object_message_retrieval_state_surfaces_stale_top_object_results() {
        let query = ObjectMessageQuery::default();
        let messages = vec![
            object_message(
                "stale-1",
                "2026-05-01T00:00:00Z",
                Some("task"),
                Some("update"),
                &["archive"],
                serde_json::json!({"title": "Older archive task"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
            object_message(
                "fresh-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["archive"],
                serde_json::json!({"title": "Recent archive task"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
        ];
        let facet_next_moves = serde_json::json!({
            "tags": [{
                "value": "archive",
                "count": 2,
                "score": 0.88,
                "rationale": "active-state pressure + strong narrowing power"
            }]
        });

        let state = object_message_retrieval_state(&query, &facet_next_moves, &messages);
        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("stale-top-object"))
        );
        assert_eq!(
            state["summary"].as_str(),
            Some(
                "Current ranking is active-state weighted, narrowing-first. Top object results stay concentrated around task work. Top surfaced object result is older context that still ranks highly. Leading object cue: archive."
            )
        );
    }

    #[test]
    fn object_message_retrieval_state_surfaces_older_object_support_badge() {
        let query = ObjectMessageQuery::default();
        let messages = vec![
            object_message(
                "stale-1",
                "2026-05-01T00:00:00Z",
                Some("task"),
                Some("update"),
                &["archive"],
                serde_json::json!({"title": "Older archive task"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
            object_message(
                "fresh-1",
                "2026-06-16T00:00:00Z",
                Some("task"),
                Some("update"),
                &["fresh"],
                serde_json::json!({"title": "Recent task"}),
                Some(serde_json::json!({"status": "active"})),
                &[],
            ),
        ];
        let facet_next_moves = serde_json::json!({
            "tags": [{
                "value": "archive",
                "count": 1,
                "score": 0.88,
                "rationale": "active-state pressure + older object support + strong narrowing power"
            }]
        });

        let state = object_message_retrieval_state(&query, &facet_next_moves, &messages);
        assert!(
            state["badges"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("older-object supported"))
        );
        assert_eq!(
            state["summary"].as_str(),
            Some(
                "Current ranking is active-state weighted, older object support, narrowing-first. Top object results stay concentrated around task work. Top surfaced object result is older context that still ranks highly. Leading object cue: archive."
            )
        );
        assert_eq!(
            state["observability"]["top_activity_freshness"].as_str(),
            Some("stale")
        );
    }
}
