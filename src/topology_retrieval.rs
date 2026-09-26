use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet, VecDeque};

use crate::{
    file_path_refs::message_file_path_refs,
    message::{is_topology_link_message_type, parse_afp_references},
    object_refs::message_object_refs,
    topology_decay::rank_neighborhood_items,
    topology_message_refs::{
        message_open_question_refs, message_source_attachment_refs, message_source_message_refs,
    },
};

const LINK_TYPE_SAME_THREAD: &str = "same_thread";
const LINK_TYPE_SAME_RELATIONSHIP: &str = "same_relationship";
const LINK_TYPE_SAME_FOLLOW_UP_CHAIN: &str = "same_follow_up_chain";
const LINK_TYPE_SAME_PROJECT: &str = "same_project";
const LINK_TYPE_SAME_AREA: &str = "same_area";
const LINK_TYPE_SAME_RESOURCE: &str = "same_resource";
const LINK_TYPE_SAME_FILE_LEDGER: &str = "same_file_ledger";
const LINK_TYPE_SAME_FILE_PATH: &str = "same_file_path";
const LINK_TYPE_SAME_OPEN_QUESTION: &str = "same_open_question";
const LINK_TYPE_SHARED_OBJECT: &str = "shared_object";
const LINK_TYPE_SAME_SOURCE_MESSAGE: &str = "same_source_message";
const LINK_TYPE_SAME_SOURCE_ATTACHMENT: &str = "same_source_attachment";

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TopologyNeighborhoodItem {
    pub message_id: String,
    pub label: String,
    pub confidence: String,
    #[serde(default)]
    pub freshness: String,
    pub why_surfaced: String,
    #[serde(default)]
    pub relation_path: Vec<String>,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub decrypt_needed: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TopologyNeighborhoodBundle {
    #[serde(default)]
    pub anchor_refs: Vec<String>,
    #[serde(default)]
    pub items: Vec<TopologyNeighborhoodItem>,
    pub coverage_summary: String,
    pub result_budget_used: usize,
}

#[derive(Clone, Debug, Default)]
struct TopologyNode {
    id: String,
    label: String,
    parent_id: Option<String>,
    thread_id: Option<String>,
    relationship_id: Option<String>,
    supertags: Vec<String>,
    file_path_refs: Vec<String>,
    object_refs: Vec<String>,
    open_question_refs: Vec<String>,
    source_message_refs: Vec<String>,
    source_attachment_refs: Vec<String>,
    observed_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug)]
struct TopologyEdge {
    from: String,
    to: String,
    link_type: String,
    confidence_score: u8,
}

pub fn build_neighborhood_bundle(
    anchor_refs: &[String],
    messages: &[Value],
    max_hops: usize,
    result_limit: usize,
) -> TopologyNeighborhoodBundle {
    let nodes = collect_nodes(messages);
    let edges = collect_edges(messages, &nodes);
    let adjacency = build_adjacency(&edges);

    let anchor_set: HashSet<String> = anchor_refs.iter().cloned().collect();
    let mut queue: VecDeque<(String, usize, Vec<String>)> = anchor_refs
        .iter()
        .filter(|anchor| nodes.contains_key(*anchor))
        .map(|anchor| (anchor.clone(), 0usize, Vec::new()))
        .collect();
    let mut best_paths: HashMap<String, (usize, Vec<String>, u8)> = HashMap::new();
    let mut visited_depth: HashMap<String, usize> = HashMap::new();

    while let Some((current, depth, path)) = queue.pop_front() {
        if depth >= max_hops {
            continue;
        }

        for edge in adjacency.get(&current).into_iter().flatten() {
            let next_depth = depth + 1;
            let next_path = extend_relation_path(&path, &edge.link_type);
            let should_visit = visited_depth
                .get(&edge.to)
                .map(|seen| next_depth < *seen)
                .unwrap_or(true);

            if should_visit {
                visited_depth.insert(edge.to.clone(), next_depth);
                queue.push_back((edge.to.clone(), next_depth, next_path.clone()));
            }

            if !anchor_set.contains(&edge.to) {
                let candidate = (next_depth, next_path.clone(), edge.confidence_score);
                let replace = best_paths
                    .get(&edge.to)
                    .map(|(seen_depth, _, seen_conf)| {
                        next_depth < *seen_depth
                            || (next_depth == *seen_depth && edge.confidence_score > *seen_conf)
                    })
                    .unwrap_or(true);
                if replace {
                    best_paths.insert(edge.to.clone(), candidate);
                }
            }
        }
    }

    let mut items = best_paths
        .into_iter()
        .filter_map(|(message_id, (depth, relation_path, confidence_score))| {
            let node = nodes.get(&message_id)?;
            let freshness = topology_item_freshness(node.observed_at, &relation_path);
            Some(TopologyNeighborhoodItem {
                message_id: message_id.clone(),
                label: node.label.clone(),
                confidence: confidence_bucket(confidence_score).to_string(),
                freshness: freshness.to_string(),
                why_surfaced: why_surfaced_for_path(node, &relation_path, depth, freshness),
                relation_path,
                source_refs: vec![message_id],
                decrypt_needed: false,
            })
        })
        .collect::<Vec<_>>();

    rank_neighborhood_items(&mut items);
    if items.len() > result_limit {
        items.truncate(result_limit);
    }

    let coverage_summary = if items.is_empty() {
        "No related context was surfaced from current topology signals.".to_string()
    } else {
        format!(
            "Surfaced {} related context item{} from {} anchor{} within {} hop{} ({} fresh, {} reactivated).",
            items.len(),
            if items.len() == 1 { "" } else { "s" },
            anchor_refs.len(),
            if anchor_refs.len() == 1 { "" } else { "s" },
            max_hops,
            if max_hops == 1 { "" } else { "s" },
            items
                .iter()
                .filter(|item| item.freshness == "fresh")
                .count(),
            items
                .iter()
                .filter(|item| item.freshness == "reactivated")
                .count(),
        )
    };

    TopologyNeighborhoodBundle {
        anchor_refs: anchor_refs.to_vec(),
        result_budget_used: items.len(),
        coverage_summary,
        items,
    }
}

fn collect_nodes(messages: &[Value]) -> HashMap<String, TopologyNode> {
    let mut nodes = HashMap::new();
    for message in messages {
        let message_type = message["type"].as_str().unwrap_or_default();
        if is_topology_link_type(message_type) {
            continue;
        }

        let Some(id) = message["id"].as_str() else {
            continue;
        };

        nodes.insert(
            id.to_string(),
            TopologyNode {
                id: id.to_string(),
                label: message_label(message),
                parent_id: message["parent_id"].as_str().map(str::to_string),
                thread_id: message["thread_id"].as_str().map(str::to_string),
                relationship_id: message_relationship_id(message),
                supertags: message_supertags(message),
                file_path_refs: message_file_path_refs(message),
                object_refs: message_object_refs(message),
                open_question_refs: message_open_question_refs(message),
                source_message_refs: message_source_message_refs(message),
                source_attachment_refs: message_source_attachment_refs(message),
                observed_at: message_observed_at(message),
            },
        );
    }
    nodes
}

fn collect_edges(messages: &[Value], nodes: &HashMap<String, TopologyNode>) -> Vec<TopologyEdge> {
    let mut edges = Vec::new();
    let mut knowledge_groups: HashMap<(String, String), Vec<(String, u8)>> = HashMap::new();

    for message in messages {
        if !is_topology_link_message(message) {
            if let Some(edges_for_message) = ledger_reference_edges(message, nodes) {
                edges.extend(edges_for_message);
            }
            continue;
        }

        let source = message["content"]["source_message_id"]
            .as_str()
            .unwrap_or_default();
        let target = message["content"]["target_message_id"]
            .as_str()
            .unwrap_or_default();
        let relationship_id = message["content"]["relationship_id"]
            .as_str()
            .or_else(|| message["metadata"]["relationship_id"].as_str());
        let membership_link_type = message["content"]["link_type"]
            .as_str()
            .unwrap_or("linked")
            .to_string();
        let confidence = score_from_optional_float(message["content"]["confidence"].as_f64(), 90);
        if !source.is_empty() && nodes.contains_key(source) {
            if let Some(relationship_id) = relationship_id {
                knowledge_groups
                    .entry((relationship_id.to_string(), membership_link_type))
                    .or_default()
                    .push((source.to_string(), confidence));
            }
        }

        if source.is_empty() || target.is_empty() {
            continue;
        }
        if !nodes.contains_key(source) || !nodes.contains_key(target) {
            continue;
        }

        let link_type = message["content"]["link_type"]
            .as_str()
            .unwrap_or("linked")
            .to_string();

        edges.push(TopologyEdge {
            from: source.to_string(),
            to: target.to_string(),
            link_type: link_type.clone(),
            confidence_score: confidence,
        });
        edges.push(TopologyEdge {
            from: target.to_string(),
            to: source.to_string(),
            link_type,
            confidence_score: confidence,
        });
    }

    let mut thread_groups: HashMap<String, Vec<&TopologyNode>> = HashMap::new();
    let mut relationship_groups: HashMap<String, Vec<&TopologyNode>> = HashMap::new();
    let mut follow_up_groups: HashMap<String, Vec<&TopologyNode>> = HashMap::new();
    let mut project_groups: HashMap<String, Vec<&TopologyNode>> = HashMap::new();
    let mut area_groups: HashMap<String, Vec<&TopologyNode>> = HashMap::new();
    let mut resource_groups: HashMap<String, Vec<&TopologyNode>> = HashMap::new();
    let mut file_path_groups: HashMap<String, Vec<&TopologyNode>> = HashMap::new();
    let mut open_question_groups: HashMap<String, Vec<&TopologyNode>> = HashMap::new();
    let mut object_groups: HashMap<String, Vec<&TopologyNode>> = HashMap::new();
    let mut source_message_groups: HashMap<String, Vec<&TopologyNode>> = HashMap::new();
    let mut source_attachment_groups: HashMap<String, Vec<&TopologyNode>> = HashMap::new();

    for node in nodes.values() {
        if let Some(thread_id) = node.thread_id.as_ref() {
            thread_groups
                .entry(thread_id.clone())
                .or_default()
                .push(node);
        }
        if let Some(relationship_id) = node.relationship_id.as_ref() {
            relationship_groups
                .entry(relationship_id.clone())
                .or_default()
                .push(node);
        }
        if let Some(parent_id) = node.parent_id.as_ref() {
            follow_up_groups
                .entry(parent_id.clone())
                .or_default()
                .push(node);
        }
        for supertag in &node.supertags {
            if let Some(group_key) = supertag_group_key(supertag, "project:") {
                project_groups.entry(group_key).or_default().push(node);
            } else if let Some(group_key) = supertag_group_key(supertag, "area:") {
                area_groups.entry(group_key).or_default().push(node);
            } else if let Some(group_key) = supertag_group_key(supertag, "resource:") {
                resource_groups.entry(group_key).or_default().push(node);
            }
        }
        for file_path in &node.file_path_refs {
            file_path_groups
                .entry(file_path.clone())
                .or_default()
                .push(node);
        }
        for object_ref in &node.object_refs {
            object_groups
                .entry(object_ref.clone())
                .or_default()
                .push(node);
        }
        for open_question_ref in &node.open_question_refs {
            open_question_groups
                .entry(open_question_ref.clone())
                .or_default()
                .push(node);
        }
        for source_message_ref in &node.source_message_refs {
            source_message_groups
                .entry(source_message_ref.clone())
                .or_default()
                .push(node);
        }
        for source_attachment_ref in &node.source_attachment_refs {
            source_attachment_groups
                .entry(source_attachment_ref.clone())
                .or_default()
                .push(node);
        }
    }

    for (parent_id, members) in &mut follow_up_groups {
        if let Some(parent) = nodes.get(parent_id) {
            members.push(parent);
        }
    }
    for (source_message_id, members) in &mut source_message_groups {
        if let Some(source_message) = nodes.get(source_message_id) {
            members.push(source_message);
        }
    }

    edges.extend(group_edges(thread_groups, LINK_TYPE_SAME_THREAD, 70));
    edges.extend(group_edges(
        relationship_groups,
        LINK_TYPE_SAME_RELATIONSHIP,
        80,
    ));
    edges.extend(group_edges(
        follow_up_groups,
        LINK_TYPE_SAME_FOLLOW_UP_CHAIN,
        78,
    ));
    edges.extend(group_edges(project_groups, LINK_TYPE_SAME_PROJECT, 76));
    edges.extend(group_edges(area_groups, LINK_TYPE_SAME_AREA, 74));
    edges.extend(group_edges(resource_groups, LINK_TYPE_SAME_RESOURCE, 72));
    edges.extend(group_edges(file_path_groups, LINK_TYPE_SAME_FILE_PATH, 82));
    edges.extend(group_edges(
        open_question_groups,
        LINK_TYPE_SAME_OPEN_QUESTION,
        85,
    ));
    edges.extend(group_edges(object_groups, LINK_TYPE_SHARED_OBJECT, 84));
    edges.extend(group_edges(
        source_message_groups,
        LINK_TYPE_SAME_SOURCE_MESSAGE,
        90,
    ));
    edges.extend(group_edges(
        source_attachment_groups,
        LINK_TYPE_SAME_SOURCE_ATTACHMENT,
        86,
    ));
    edges.extend(group_message_membership_edges(knowledge_groups));

    edges
}

fn is_topology_link_type(message_type: &str) -> bool {
    is_topology_link_message_type(message_type)
}

fn is_topology_link_message(message: &Value) -> bool {
    message["type"]
        .as_str()
        .map(is_topology_link_type)
        .unwrap_or(false)
}

fn ledger_reference_edges(
    message: &Value,
    nodes: &HashMap<String, TopologyNode>,
) -> Option<Vec<TopologyEdge>> {
    let mut edges = canonical_reference_edges(message, nodes);

    let message_id = message.get("id").and_then(Value::as_str)?;
    let message_type = message
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if message_type != "file_ledger" {
        return (!edges.is_empty()).then_some(edges);
    }

    let referenced_ledger_id = message
        .get("content")
        .and_then(|content| content.get("ledger_message_id"))
        .and_then(Value::as_str)?;
    if referenced_ledger_id.is_empty()
        || referenced_ledger_id == message_id
        || !nodes.contains_key(message_id)
        || !nodes.contains_key(referenced_ledger_id)
    {
        return (!edges.is_empty()).then_some(edges);
    }

    edges.extend(vec![
        TopologyEdge {
            from: message_id.to_string(),
            to: referenced_ledger_id.to_string(),
            link_type: LINK_TYPE_SAME_FILE_LEDGER.to_string(),
            confidence_score: 86,
        },
        TopologyEdge {
            from: referenced_ledger_id.to_string(),
            to: message_id.to_string(),
            link_type: LINK_TYPE_SAME_FILE_LEDGER.to_string(),
            confidence_score: 86,
        },
    ]);

    Some(edges)
}

fn canonical_reference_edges(
    message: &Value,
    nodes: &HashMap<String, TopologyNode>,
) -> Vec<TopologyEdge> {
    let Some(message_id) = message.get("id").and_then(Value::as_str) else {
        return Vec::new();
    };
    if !nodes.contains_key(message_id) {
        return Vec::new();
    }

    let references = message
        .get("references")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut edges = Vec::new();
    let parsed_references = parse_afp_references(&references);
    let fallback_references = if parsed_references.is_empty() {
        inferred_message_references(message)
    } else {
        Vec::new()
    };
    for reference in parsed_references
        .into_iter()
        .chain(fallback_references.into_iter())
    {
        if reference.r#type.trim() != "message" {
            continue;
        }
        let target = reference.target.trim();
        if target.is_empty() || target == message_id || !nodes.contains_key(target) {
            continue;
        }

        let link_type = reference
            .metadata
            .as_ref()
            .and_then(Value::as_object)
            .and_then(|metadata| metadata.get("link_type"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("references")
            .to_string();
        let confidence_score = reference_confidence_score(&link_type);

        edges.push(TopologyEdge {
            from: message_id.to_string(),
            to: target.to_string(),
            link_type: link_type.clone(),
            confidence_score,
        });
        edges.push(TopologyEdge {
            from: target.to_string(),
            to: message_id.to_string(),
            link_type,
            confidence_score,
        });
    }
    edges
}

fn inferred_message_references(message: &Value) -> Vec<crate::message::AfpReference> {
    let message_type = message
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match message_type {
        "knowledge_card" => {
            let source_id = message["content"]["source_id"]
                .as_str()
                .or_else(|| message["content"]["source_message_id"].as_str())
                .or_else(|| message["metadata"]["source_id"].as_str())
                .or_else(|| message["metadata"]["source_message_id"].as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());
            source_id
                .map(|target| {
                    vec![crate::message::AfpReference {
                        r#type: "message".to_string(),
                        target: target.to_string(),
                        label: Some("source material".to_string()),
                        metadata: Some(serde_json::json!({ "link_type": "derived_from" })),
                    }]
                })
                .unwrap_or_default()
        }
        "backlink_update" => {
            let mut refs = Vec::new();
            for (target, label) in [
                (
                    message["content"]["source_id"]
                        .as_str()
                        .or_else(|| message["content"]["source_message_id"].as_str()),
                    "similar source",
                ),
                (
                    message["content"]["target_id"]
                        .as_str()
                        .or_else(|| message["content"]["target_message_id"].as_str()),
                    "similar target",
                ),
            ] {
                let Some(target) = target.map(str::trim).filter(|value| !value.is_empty()) else {
                    continue;
                };
                refs.push(crate::message::AfpReference {
                    r#type: "message".to_string(),
                    target: target.to_string(),
                    label: Some(label.to_string()),
                    metadata: Some(serde_json::json!({ "link_type": "related_to" })),
                });
            }
            refs
        }
        _ => Vec::new(),
    }
}

fn reference_confidence_score(link_type: &str) -> u8 {
    match link_type {
        "depends_on" | "part_of" => 88,
        "supports" | "blocks" | "caused_by" => 84,
        "related_to" | "references" => 80,
        _ => 78,
    }
}

fn group_edges(
    groups: HashMap<String, Vec<&TopologyNode>>,
    link_type: &str,
    confidence_score: u8,
) -> Vec<TopologyEdge> {
    let mut edges = Vec::new();
    for nodes in groups.into_values() {
        for (idx, left) in nodes.iter().enumerate() {
            for right in nodes.iter().skip(idx + 1) {
                edges.push(TopologyEdge {
                    from: left.id.clone(),
                    to: right.id.clone(),
                    link_type: link_type.to_string(),
                    confidence_score,
                });
                edges.push(TopologyEdge {
                    from: right.id.clone(),
                    to: left.id.clone(),
                    link_type: link_type.to_string(),
                    confidence_score,
                });
            }
        }
    }
    edges
}

fn group_message_membership_edges(
    groups: HashMap<(String, String), Vec<(String, u8)>>,
) -> Vec<TopologyEdge> {
    let mut edges = Vec::new();
    for ((_, link_type), members) in groups {
        for (idx, (left_id, left_confidence)) in members.iter().enumerate() {
            for (right_id, right_confidence) in members.iter().skip(idx + 1) {
                let confidence_score = (*left_confidence).max(*right_confidence);
                edges.push(TopologyEdge {
                    from: left_id.clone(),
                    to: right_id.clone(),
                    link_type: link_type.clone(),
                    confidence_score,
                });
                edges.push(TopologyEdge {
                    from: right_id.clone(),
                    to: left_id.clone(),
                    link_type: link_type.clone(),
                    confidence_score,
                });
            }
        }
    }
    edges
}

fn build_adjacency(edges: &[TopologyEdge]) -> HashMap<String, Vec<TopologyEdge>> {
    let mut adjacency: HashMap<String, Vec<TopologyEdge>> = HashMap::new();
    for edge in edges {
        adjacency
            .entry(edge.from.clone())
            .or_default()
            .push(edge.clone());
    }
    adjacency
}

fn extend_relation_path(path: &[String], relation: &str) -> Vec<String> {
    let mut next = path.to_vec();
    next.push(relation.to_string());
    next
}

fn why_surfaced_for_path(
    node: &TopologyNode,
    relation_path: &[String],
    depth: usize,
    freshness: &str,
) -> String {
    if relation_path.is_empty() {
        return format!("{} is directly relevant to the active state.", node.label);
    }

    let relation_summary = relation_path.join(" -> ");
    let freshness_note = match freshness {
        "fresh" => " It is still fresh in the recent continuity window.",
        "reactivated" => " It is being resurfaced as a dormant but still-linked context item.",
        "active" => " It remains active enough to keep in the current neighborhood.",
        _ => "",
    };
    format!(
        "{} surfaced through {} topology hop{} via {}.{}",
        node.label,
        depth,
        if depth == 1 { "" } else { "s" },
        relation_summary.replace('_', " "),
        freshness_note
    )
}

fn message_observed_at(message: &Value) -> Option<DateTime<Utc>> {
    for value in [
        message.get("timestamp"),
        message.get("updated_at"),
        message.get("created_at"),
        message
            .get("content")
            .and_then(|content| content.get("updated_at")),
        message
            .get("content")
            .and_then(|content| content.get("created_at")),
    ] {
        let Some(raw) = value.and_then(Value::as_str) else {
            continue;
        };
        if let Ok(parsed) = DateTime::parse_from_rfc3339(raw) {
            return Some(parsed.with_timezone(&Utc));
        }
    }
    None
}

fn topology_item_freshness(
    observed_at: Option<DateTime<Utc>>,
    relation_path: &[String],
) -> &'static str {
    let Some(observed_at) = observed_at else {
        return "stale";
    };
    let age_hours = (Utc::now() - observed_at).num_hours();
    if age_hours <= 72 {
        return "fresh";
    }
    if age_hours <= 24 * 14 {
        return "active";
    }
    if relation_path.iter().any(|relation| {
        matches!(
            relation.as_str(),
            LINK_TYPE_SAME_FOLLOW_UP_CHAIN
                | LINK_TYPE_SAME_RELATIONSHIP
                | LINK_TYPE_SAME_PROJECT
                | LINK_TYPE_SAME_FILE_LEDGER
                | LINK_TYPE_SAME_OPEN_QUESTION
                | LINK_TYPE_SAME_SOURCE_MESSAGE
                | LINK_TYPE_SAME_SOURCE_ATTACHMENT
        )
    }) {
        return "reactivated";
    }
    "stale"
}

fn message_label(message: &Value) -> String {
    for key in ["label", "title", "headline", "summary", "subject"] {
        if let Some(value) = message["content"][key].as_str() {
            if !value.trim().is_empty() {
                return value.to_string();
            }
        }
    }

    message["type"]
        .as_str()
        .unwrap_or("related_context")
        .to_string()
}

fn message_relationship_id(message: &Value) -> Option<String> {
    message["metadata"]["relationship_id"]
        .as_str()
        .or_else(|| message["content"]["relationship_id"].as_str())
        .map(str::to_string)
}

fn message_supertags(message: &Value) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut tags = Vec::new();
    for value in [
        &message["supertags"],
        &message["content"]["supertags"],
        &message["metadata"]["supertags"],
    ] {
        if let Some(items) = value.as_array() {
            for item in items {
                let Some(tag) = item.as_str() else {
                    continue;
                };
                let normalized = tag.trim();
                if normalized.is_empty() || !seen.insert(normalized.to_string()) {
                    continue;
                }
                tags.push(normalized.to_string());
            }
        }
    }
    if let Some(entries) = message["content"]["entries"].as_array() {
        for entry in entries {
            if let Some(items) = entry.get("supertags").and_then(Value::as_array) {
                for item in items {
                    let Some(tag) = item.as_str() else {
                        continue;
                    };
                    let normalized = tag.trim();
                    if normalized.is_empty() || !seen.insert(normalized.to_string()) {
                        continue;
                    }
                    tags.push(normalized.to_string());
                }
            }
        }
    }
    tags
}

fn supertag_group_key(tag: &str, prefix: &str) -> Option<String> {
    let normalized = tag.trim();
    if normalized.is_empty() || !normalized.starts_with(prefix) {
        return None;
    }
    Some(normalized.to_string())
}

fn score_from_optional_float(value: Option<f64>, default_score: u8) -> u8 {
    value
        .map(|score| (score.clamp(0.0, 1.0) * 100.0).round() as u8)
        .unwrap_or(default_score)
}

fn confidence_bucket(score: u8) -> &'static str {
    match score {
        85..=100 => "high",
        65..=84 => "medium",
        _ => "low",
    }
}

#[cfg(test)]
#[path = "topology_retrieval_tests.rs"]
mod topology_retrieval_tests;
