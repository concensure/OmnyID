/*
 * @module-id: server.workflow-semantic-templates
 * @primary-capability: server.workflow.template-suggestion
 * @sub-capabilities: semantic-node-detection, path-matching, template-advisory
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid-server
 */

use std::collections::{BTreeSet, HashMap, VecDeque};

use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(super) struct WorkflowTemplateSuggestion {
    pub(super) template_id: String,
    pub(super) title: String,
    pub(super) workflow_family: String,
    pub(super) reliability: String,
    pub(super) advisory: String,
    pub(super) rationale: String,
    pub(super) matched_node_ids: Vec<String>,
    pub(super) semantic_roles: Vec<String>,
    pub(super) score: u8,
    pub(super) already_aligned: bool,
    pub(super) customization_allowed: bool,
    pub(super) implementation_status: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct SemanticNodeMatch {
    node_id: String,
    semantic_roles: BTreeSet<&'static str>,
}

const ROLE_PDF_SOURCE: &str = "pdf_source";
const ROLE_DOCUMENT_SOURCE: &str = "document_source";
const ROLE_EXTRACTION_STEP: &str = "extraction_step";
const ROLE_REVIEW_STEP: &str = "review_step";
const ROLE_SPREADSHEET_OUTPUT: &str = "spreadsheet_output";
const ROLE_WEATHER_SOURCE: &str = "weather_source";
const ROLE_CHART_OUTPUT: &str = "chart_output";
const ROLE_MEETING_SOURCE: &str = "meeting_source";
const ROLE_DIGEST_OUTPUT: &str = "digest_output";
const ROLE_BUDGET_SOURCE: &str = "budget_source";

pub(super) fn workflow_template_suggestions(graph: &Value) -> Vec<WorkflowTemplateSuggestion> {
    let nodes = graph
        .get("nodes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let edges = graph
        .get("edges")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let matches = semantic_node_matches(&nodes);
    if matches.is_empty() {
        return Vec::new();
    }

    let adjacency = edge_adjacency(&edges);
    let existing_template_ids = existing_template_ids(graph);
    let dismissed_template_ids = dismissed_template_ids(graph);
    let mut suggestions = Vec::new();

    if let Some(suggestion) = template_suggestion_for_path(
        &matches,
        &adjacency,
        &existing_template_ids,
        "document_to_spreadsheet",
        "PDF to Spreadsheet",
        "document_ingest",
        "high",
        "advisory_only",
        &[ROLE_PDF_SOURCE, ROLE_DOCUMENT_SOURCE],
        &[ROLE_SPREADSHEET_OUTPUT],
    ) {
        suggestions.push(suggestion);
    }

    if let Some(suggestion) = template_suggestion_for_path(
        &matches,
        &adjacency,
        &existing_template_ids,
        "weather_to_chart",
        "Weather to Chart",
        "forecast_visualization",
        "high",
        "advisory_only",
        &[ROLE_WEATHER_SOURCE],
        &[ROLE_CHART_OUTPUT],
    ) {
        suggestions.push(suggestion);
    }

    if let Some(suggestion) = template_suggestion_for_path(
        &matches,
        &adjacency,
        &existing_template_ids,
        "meeting_to_digest",
        "Meeting to Digest",
        "content_digest",
        "high",
        "advisory_only",
        &[ROLE_MEETING_SOURCE],
        &[ROLE_DIGEST_OUTPUT],
    ) {
        suggestions.push(suggestion);
    }

    if let Some(suggestion) = template_suggestion_for_path(
        &matches,
        &adjacency,
        &existing_template_ids,
        "budget_projection",
        "Budget Projection",
        "finance_planning",
        "medium",
        "advisory_only",
        &[ROLE_BUDGET_SOURCE],
        &[ROLE_CHART_OUTPUT, ROLE_SPREADSHEET_OUTPUT],
    ) {
        suggestions.push(suggestion);
    }

    suggestions.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.title.cmp(&right.title))
    });
    suggestions
        .into_iter()
        .filter(|entry| !dismissed_template_ids.contains(&entry.template_id))
        .collect()
}

fn template_suggestion_for_path(
    matches: &[SemanticNodeMatch],
    adjacency: &HashMap<String, Vec<String>>,
    existing_template_ids: &BTreeSet<String>,
    template_id: &str,
    title: &str,
    workflow_family: &str,
    reliability: &str,
    implementation_status: &str,
    source_roles: &[&str],
    target_roles: &[&str],
) -> Option<WorkflowTemplateSuggestion> {
    let sources = node_ids_for_roles(matches, source_roles);
    let targets = node_ids_for_roles(matches, target_roles);
    let path = first_matching_path(&sources, &targets, adjacency)?;
    let matched_ids = path.iter().map(String::as_str).collect::<BTreeSet<_>>();
    let semantic_roles = matches
        .iter()
        .filter(|entry| matched_ids.contains(entry.node_id.as_str()))
        .flat_map(|entry| entry.semantic_roles.iter().copied())
        .collect::<BTreeSet<_>>();
    let has_review = path
        .iter()
        .any(|node_id| node_has_role(matches, node_id, ROLE_REVIEW_STEP));
    let has_extraction = path
        .iter()
        .any(|node_id| node_has_role(matches, node_id, ROLE_EXTRACTION_STEP));
    let mut score = 72u8;
    if has_extraction {
        score = score.saturating_add(12);
    }
    if has_review {
        score = score.saturating_add(8);
    }
    if path.len() <= 2 {
        score = score.saturating_sub(3);
    }
    let already_aligned = existing_template_ids.contains(template_id);
    if already_aligned {
        score = score.saturating_add(5);
    }
    let rationale = build_rationale(title, has_extraction, has_review, path.len());
    let advisory = if already_aligned {
        "This graph already carries the matching template lineage. Keep customizing if you need exceptions."
            .to_string()
    } else {
        "This is advisory only. You can keep the custom graph or adopt the matching template for stronger defaults and validation."
            .to_string()
    };

    Some(WorkflowTemplateSuggestion {
        template_id: template_id.to_string(),
        title: title.to_string(),
        workflow_family: workflow_family.to_string(),
        reliability: reliability.to_string(),
        advisory,
        rationale,
        matched_node_ids: path,
        semantic_roles: semantic_roles.into_iter().map(str::to_string).collect(),
        score,
        already_aligned,
        customization_allowed: true,
        implementation_status: implementation_status.to_string(),
    })
}

fn build_rationale(title: &str, has_extraction: bool, has_review: bool, path_len: usize) -> String {
    let mut notes = Vec::new();
    if has_extraction {
        notes.push("includes an explicit extraction or transformation step");
    }
    if has_review {
        notes.push("already includes a review or approval checkpoint");
    }
    if path_len > 2 {
        notes.push("spans multiple connected nodes rather than a single shortcut");
    }
    if notes.is_empty() {
        format!("The graph shape matches the core source-to-output path for the {title} workflow.")
    } else {
        format!(
            "The graph shape matches the {title} workflow and {}.",
            notes.join(", ")
        )
    }
}

fn existing_template_ids(graph: &Value) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    if let Some(value) = graph.get("template_id").and_then(Value::as_str) {
        ids.insert(value.to_string());
    }
    if let Some(presets) = graph.get("presets").and_then(Value::as_array) {
        for preset in presets {
            if let Some(value) = preset.get("template_id").and_then(Value::as_str) {
                ids.insert(value.to_string());
            }
            if let Some(value) = preset.get("preset_kind").and_then(Value::as_str) {
                ids.insert(value.to_string());
            }
        }
    }
    if let Some(bindings) = graph.get("template_bindings").and_then(Value::as_array) {
        for binding in bindings {
            if let Some(value) = binding.get("template_id").and_then(Value::as_str) {
                ids.insert(value.to_string());
            }
        }
    }
    if let Some(metadata) = graph.get("metadata").and_then(Value::as_object) {
        if let Some(values) = metadata
            .get("accepted_template_suggestions")
            .and_then(Value::as_array)
        {
            for value in values.iter().filter_map(Value::as_str) {
                ids.insert(value.to_string());
            }
        }
    }
    ids
}

fn dismissed_template_ids(graph: &Value) -> BTreeSet<String> {
    graph
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|metadata| metadata.get("dismissed_template_suggestions"))
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<BTreeSet<_>>()
        })
        .unwrap_or_default()
}

fn edge_adjacency(edges: &[Value]) -> HashMap<String, Vec<String>> {
    let mut adjacency: HashMap<String, Vec<String>> = HashMap::new();
    for edge in edges {
        let Some(source) = edge.get("source").and_then(Value::as_str) else {
            continue;
        };
        let Some(target) = edge.get("target").and_then(Value::as_str) else {
            continue;
        };
        adjacency
            .entry(source.to_string())
            .or_default()
            .push(target.to_string());
    }
    adjacency
}

fn first_matching_path(
    source_ids: &[String],
    target_ids: &[String],
    adjacency: &HashMap<String, Vec<String>>,
) -> Option<Vec<String>> {
    let targets = target_ids
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let mut best_path = None;
    for source_id in source_ids {
        if let Some(path) = bfs_path(source_id, &targets, adjacency, 6) {
            let replace = best_path
                .as_ref()
                .map(|existing: &Vec<String>| path.len() < existing.len())
                .unwrap_or(true);
            if replace {
                best_path = Some(path);
            }
        }
    }
    best_path
}

fn bfs_path(
    start: &str,
    targets: &BTreeSet<&str>,
    adjacency: &HashMap<String, Vec<String>>,
    max_depth: usize,
) -> Option<Vec<String>> {
    let mut queue = VecDeque::from([(start.to_string(), vec![start.to_string()])]);
    let mut seen = BTreeSet::from([start.to_string()]);
    while let Some((node_id, path)) = queue.pop_front() {
        if targets.contains(node_id.as_str()) {
            return Some(path);
        }
        if path.len() > max_depth {
            continue;
        }
        for next_id in adjacency.get(&node_id).into_iter().flatten() {
            if !seen.insert(next_id.clone()) {
                continue;
            }
            let mut next_path = path.clone();
            next_path.push(next_id.clone());
            queue.push_back((next_id.clone(), next_path));
        }
    }
    None
}

fn node_ids_for_roles(matches: &[SemanticNodeMatch], roles: &[&str]) -> Vec<String> {
    matches
        .iter()
        .filter(|entry| roles.iter().any(|role| entry.semantic_roles.contains(role)))
        .map(|entry| entry.node_id.clone())
        .collect()
}

fn node_has_role(matches: &[SemanticNodeMatch], node_id: &str, role: &str) -> bool {
    matches
        .iter()
        .find(|entry| entry.node_id == node_id)
        .map(|entry| entry.semantic_roles.contains(role))
        .unwrap_or(false)
}

fn semantic_node_matches(nodes: &[Value]) -> Vec<SemanticNodeMatch> {
    nodes
        .iter()
        .filter_map(|node| {
            let node_id = node.get("id").and_then(Value::as_str)?.to_string();
            let semantic_roles = infer_node_semantic_roles(node);
            if semantic_roles.is_empty() {
                None
            } else {
                Some(SemanticNodeMatch {
                    node_id,
                    semantic_roles,
                })
            }
        })
        .collect()
}

fn infer_node_semantic_roles(node: &Value) -> BTreeSet<&'static str> {
    let mut roles = BTreeSet::new();
    let kind = node
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let label = node
        .get("label")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let description = node
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let config = node.get("config").and_then(Value::as_object);
    let metadata = node.get("metadata").and_then(Value::as_object);
    let objective = config
        .and_then(|cfg| cfg.get("objective"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let operation = config
        .and_then(|cfg| cfg.get("operation"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let preset_kind = config
        .and_then(|cfg| cfg.get("preset_kind"))
        .and_then(Value::as_str)
        .or_else(|| {
            metadata
                .and_then(|meta| meta.get("preset_kind"))
                .and_then(Value::as_str)
        })
        .unwrap_or_default()
        .to_ascii_lowercase();
    let template_slot = metadata
        .and_then(|meta| meta.get("template_slot"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let haystack = [
        kind.as_str(),
        label.as_str(),
        description.as_str(),
        objective.as_str(),
        operation.as_str(),
        preset_kind.as_str(),
        template_slot.as_str(),
    ]
    .join(" ");

    if haystack.contains("pdf") {
        roles.insert(ROLE_PDF_SOURCE);
        roles.insert(ROLE_DOCUMENT_SOURCE);
    }
    if contains_any(
        &haystack,
        &["document", "attachment", "file", "parsed_document"],
    ) {
        roles.insert(ROLE_DOCUMENT_SOURCE);
    }
    if contains_any(
        &haystack,
        &["extract", "parse table", "tabular", "dataset", "table"],
    ) {
        roles.insert(ROLE_EXTRACTION_STEP);
    }
    if contains_any(
        &haystack,
        &["review", "approve", "approval", "validate", "revise"],
    ) {
        roles.insert(ROLE_REVIEW_STEP);
    }
    if contains_any(
        &haystack,
        &[
            "excel",
            "xlsx",
            "spreadsheet",
            "csv export",
            "export spreadsheet",
        ],
    ) {
        roles.insert(ROLE_SPREADSHEET_OUTPUT);
    }
    if contains_any(
        &haystack,
        &["weather", "forecast", "temperature", "precipitation"],
    ) {
        roles.insert(ROLE_WEATHER_SOURCE);
    }
    if contains_any(&haystack, &["chart", "graph", "plot", "visualize"]) {
        roles.insert(ROLE_CHART_OUTPUT);
    }
    if contains_any(
        &haystack,
        &["meeting", "transcript", "recording", "audio summary"],
    ) {
        roles.insert(ROLE_MEETING_SOURCE);
    }
    if contains_any(
        &haystack,
        &[
            "summary",
            "digest",
            "recap",
            "action items",
            "meeting notes",
        ],
    ) {
        roles.insert(ROLE_DIGEST_OUTPUT);
    }
    if contains_any(
        &haystack,
        &[
            "budget",
            "cash flow",
            "cashflow",
            "expense",
            "income",
            "finance",
        ],
    ) {
        roles.insert(ROLE_BUDGET_SOURCE);
    }

    match preset_kind.as_str() {
        "receipt_tracker" => {
            roles.insert(ROLE_DOCUMENT_SOURCE);
            roles.insert(ROLE_EXTRACTION_STEP);
            roles.insert(ROLE_SPREADSHEET_OUTPUT);
        }
        "finance_guardian" => {
            roles.insert(ROLE_BUDGET_SOURCE);
        }
        _ => {}
    }

    roles
}

fn contains_any(haystack: &str, tokens: &[&str]) -> bool {
    tokens.iter().any(|token| haystack.contains(token))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn suggests_document_to_spreadsheet_for_pdf_review_export_path() {
        let graph = json!({
            "nodes": [
                {"id": "pdf", "kind": "tool", "label": "PDF source"},
                {"id": "extract", "kind": "transform", "label": "Extract table"},
                {"id": "review", "kind": "approval", "label": "Review dataset"},
                {"id": "excel", "kind": "termination", "label": "Excel export"}
            ],
            "edges": [
                {"source": "pdf", "target": "extract"},
                {"source": "extract", "target": "review"},
                {"source": "review", "target": "excel"}
            ]
        });

        let suggestions = super::workflow_template_suggestions(&graph);
        let suggestion = suggestions
            .iter()
            .find(|entry| entry.template_id == "document_to_spreadsheet")
            .expect("document template suggestion");
        assert!(suggestion.score >= 80);
        assert_eq!(
            suggestion.matched_node_ids,
            vec![
                "pdf".to_string(),
                "extract".to_string(),
                "review".to_string(),
                "excel".to_string()
            ]
        );
    }

    #[test]
    fn suggests_meeting_digest_for_recording_path() {
        let graph = json!({
            "nodes": [
                {"id": "meeting", "kind": "tool", "label": "Meeting recording"},
                {"id": "summary", "kind": "termination", "label": "Meeting digest"}
            ],
            "edges": [
                {"source": "meeting", "target": "summary"}
            ]
        });

        let suggestions = super::workflow_template_suggestions(&graph);
        assert!(
            suggestions
                .iter()
                .any(|entry| entry.template_id == "meeting_to_digest")
        );
    }

    #[test]
    fn returns_empty_when_graph_has_no_semantic_match() {
        let graph = json!({
            "nodes": [
                {"id": "a", "kind": "agent", "label": "General helper"},
                {"id": "b", "kind": "termination", "label": "Reply"}
            ],
            "edges": [
                {"source": "a", "target": "b"}
            ]
        });

        assert!(super::workflow_template_suggestions(&graph).is_empty());
    }
}
