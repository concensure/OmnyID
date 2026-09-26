use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;

use crate::autonomy_policy::AutonomyDecision;

// ── Message types ─────────────────────────────────────────────────────────────
pub const AFP_TYPE_FOLDER_RULE: &str = "folder_rule";
pub const AFP_TYPE_AREA_RULES: &str = "area_rules";
pub const AFP_TYPE_TAG_UPDATE: &str = "tag_update";
pub const AFP_TYPE_BACKLINK_OVERRIDE: &str = "backlink_override";
pub const AFP_TYPE_SUPERTAG_DEFINITION: &str = "supertag_definition";
pub const AFP_TYPE_KNOWLEDGE_LINK: &str = "knowledge_link";
pub const AFP_TYPE_RELATION_LINK: &str = "relation_link";
pub const AFP_TYPE_THREAD_SUMMARY: &str = "thread_summary";
pub const AFP_TYPE_LEDGER: &str = "ledger";
pub const AFP_TYPE_PROVENANCE_RECORD: &str = "provenance_record";
pub const AFP_KIND_DATABASE_VIEW: &str = "database_view";
pub const AFP_KIND_CHAT_THREAD: &str = "chat_thread";
pub const AFP_KIND_RICH_NOTE: &str = "rich_note";
pub const AFP_UNIFIED_OBJECT_KINDS: &[&str] = &[
    "task",
    "project",
    "note",
    "observation",
    "resource",
    "relationship",
    "decision",
    "meeting",
    AFP_KIND_DATABASE_VIEW,
    AFP_KIND_CHAT_THREAD,
    AFP_KIND_RICH_NOTE,
    "communication",
    "event",
    "research",
];

pub fn is_topology_link_message_type(message_type: &str) -> bool {
    matches!(
        message_type,
        AFP_TYPE_KNOWLEDGE_LINK | AFP_TYPE_RELATION_LINK
    )
}

pub fn is_unified_object_message_type_and_kind(message_type: &str, kind: Option<&str>) -> bool {
    message_type == AFP_TYPE_LEDGER && kind.is_some_and(|value| !value.trim().is_empty())
}

pub fn is_operational_message_type(message_type: &str) -> bool {
    matches!(
        message_type,
        AFP_TYPE_KNOWLEDGE_LINK
            | AFP_TYPE_RELATION_LINK
            | AFP_TYPE_FILE_LEDGER
            | crate::state_snapshot::AFP_TYPE_STATE_SNAPSHOT
            | AFP_TYPE_BROWSER_TASK
            | AFP_TYPE_PROVENANCE_RECORD
    )
}

fn normalized_non_empty_str(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn legacy_message_type_to_kind(message_type: &str) -> Option<&'static str> {
    AFP_UNIFIED_OBJECT_KINDS
        .iter()
        .copied()
        .find(|kind| *kind == message_type)
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AfpSearchFacets {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtype: Option<String>,
    #[serde(default)]
    pub supertags: Vec<String>,
    #[serde(default)]
    pub reference_types: Vec<String>,
    #[serde(default)]
    pub reference_targets: Vec<String>,
    #[serde(default)]
    pub link_types: Vec<String>,
    #[serde(default)]
    pub metadata_keys: Vec<String>,
    #[serde(default)]
    pub metadata_values: Vec<String>,
    #[serde(default)]
    pub metadata_terms: Vec<String>,
}

pub fn collect_search_facets_from_parts(
    message_type: Option<&str>,
    kind: Option<&str>,
    subtype: Option<&str>,
    top_level_supertags: Option<&Value>,
    metadata: Option<&Value>,
    content: Option<&Value>,
    references: &[Value],
) -> AfpSearchFacets {
    let mut metadata_keys = BTreeSet::new();
    let mut metadata_values = BTreeSet::new();
    let mut metadata_terms = BTreeSet::new();
    collect_metadata_strings(
        metadata,
        &mut vec!["metadata".to_string()],
        &mut metadata_keys,
        &mut metadata_values,
        &mut metadata_terms,
    );
    collect_metadata_strings(
        content.and_then(|value| value.get("metadata")),
        &mut vec!["content".to_string(), "metadata".to_string()],
        &mut metadata_keys,
        &mut metadata_values,
        &mut metadata_terms,
    );

    let supertags = unique_string_values(&[
        top_level_supertags,
        content.and_then(|value| value.get("supertags")),
        metadata.and_then(|value| value.get("supertags")),
    ]);
    let parsed_references = parse_afp_references(references);
    let reference_types = parsed_references
        .iter()
        .map(|reference| reference.r#type.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let reference_targets = parsed_references
        .iter()
        .map(|reference| reference.target.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let link_types = parsed_references
        .iter()
        .filter_map(|reference| {
            reference
                .metadata
                .as_ref()
                .and_then(Value::as_object)
                .and_then(|metadata| metadata.get("link_type"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();

    AfpSearchFacets {
        message_type: message_type.map(str::to_string),
        kind: kind.map(str::to_string),
        subtype: subtype.map(str::to_string),
        supertags,
        reference_types,
        reference_targets,
        link_types,
        metadata_keys: metadata_keys.into_iter().collect(),
        metadata_values: metadata_values.into_iter().collect(),
        metadata_terms: metadata_terms.into_iter().collect(),
    }
}

fn unique_string_values(values: &[Option<&Value>]) -> Vec<String> {
    values
        .iter()
        .filter_map(|value| *value)
        .filter_map(Value::as_array)
        .flat_map(|items| items.iter())
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn collect_metadata_strings(
    value: Option<&Value>,
    path: &mut Vec<String>,
    keys: &mut BTreeSet<String>,
    values: &mut BTreeSet<String>,
    terms: &mut BTreeSet<String>,
) {
    let Some(value) = value else {
        return;
    };
    match value {
        Value::Null => {}
        Value::Bool(flag) => {
            values.insert(flag.to_string());
            if let Some(key) = path.last() {
                terms.insert(format!("{}:{}", key.to_ascii_lowercase(), flag));
            }
        }
        Value::Number(number) => {
            values.insert(number.to_string());
            if let Some(key) = path.last() {
                terms.insert(format!("{}:{}", key.to_ascii_lowercase(), number));
            }
        }
        Value::String(text) => {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                values.insert(trimmed.to_string());
                if let Some(key) = path.last() {
                    terms.insert(format!("{}:{}", key.to_ascii_lowercase(), trimmed));
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_metadata_strings(Some(item), path, keys, values, terms);
            }
        }
        Value::Object(map) => {
            for (key, nested) in map {
                path.push(key.clone());
                keys.insert(path.join("."));
                collect_metadata_strings(Some(nested), path, keys, values, terms);
                path.pop();
            }
        }
    }
}

// ── Ingest types ──────────────────────────────────────────────────────────────
pub const AFP_TYPE_CHART_SPEC: &str = "chart_spec";
pub const AFP_TYPE_CONTENT_DIGEST_RESULT: &str = "content_digest_result";
pub const AFP_TYPE_DATASET_REVISION: &str = "dataset_revision";
pub const AFP_TYPE_DOCUMENT_EXTRACT_RESULT: &str = "document_extract_result";
pub const AFP_TYPE_PARSED_DOCUMENT: &str = "parsed_document";
pub const AFP_TYPE_TABULAR_DATASET: &str = "tabular_dataset";
pub const AFP_TYPE_TRANSCRIPT: &str = "transcript";

// ── Continuity / projection types ────────────────────────────────────────────
pub const AFP_TYPE_BEHAVIOR_PATTERN: &str = "behavior_pattern";
pub const AFP_TYPE_PROJECTION: &str = "projection";
pub const AFP_TYPE_TEMPORAL_PROJECTION: &str = "temporal_projection";

// ── Proactive engine types ────────────────────────────────────────────────────
pub const AFP_TYPE_PASSIVE_EVENT: &str = "passive_event";
pub const AFP_TYPE_PROACTIVE_ACTION_TAKEN: &str = "proactive_action_taken";

// ── Trigger subtypes ──────────────────────────────────────────────────────────
pub const AFP_SUBTYPE_TRIGGER_REQUEST: &str = "trigger_request";
pub const AFP_SUBTYPE_TRIGGER_DISPATCH: &str = "trigger_dispatch";
pub const AFP_SUBTYPE_TRIGGER_INITIATION: &str = "trigger_initiation";
pub const AFP_SUBTYPE_EVENT_DISPATCH: &str = "event_dispatch";
pub const AFP_SUBTYPE_WAKE_REQUEST: &str = "wake_request";
pub const AFP_SUBTYPE_WAKE_RESULT: &str = "wake_result";
pub const AFP_SUBTYPE_WAKE_DISPATCH: &str = "wake_dispatch";
pub const AFP_SUBTYPE_APPROVAL_DECISION: &str = "approval_decision";
pub const AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY: &str = "entity";
pub const AFP_SUBTYPE_KNOWLEDGE_LINK_RELATIONSHIP: &str = "relationship";
pub const AFP_SUBTYPE_THREAD_SUMMARY_AUTO: &str = "auto";
pub const AFP_SUBTYPE_PROVENANCE_ACTION: &str = "action";

pub const LEDGER_TIER_SESSION: &str = "session";
pub const LEDGER_TIER_PROJECT: &str = "project";
pub const LEDGER_TIER_LONG_TERM: &str = "long_term";

// ── Workflow node communication subtypes ─────────────────────────────────────
/// Carries the compiled `WorkflowIR` manifest to the supervisor before execution.
pub const AFP_SUBTYPE_WORKFLOW_MANIFEST: &str = "workflow_manifest";
/// Request from an orchestrator to a capability node to execute work.
pub const AFP_SUBTYPE_NODE_REQUEST: &str = "node_request";
/// Result emitted by a capability node after completing its work.
pub const AFP_SUBTYPE_NODE_RESULT: &str = "node_result";
/// Incremental progress update streamed by a long-running capability node.
pub const AFP_SUBTYPE_NODE_PROGRESS: &str = "node_progress";
/// Request for a human or agent decision at an `ApprovalNode` or `AmbiguityNode`.
pub const AFP_SUBTYPE_DECISION_REQUEST: &str = "decision_request";
/// Response to a decision request (human selection or agent verdict).
pub const AFP_SUBTYPE_DECISION_RESULT: &str = "decision_result";
/// Emitted by a `PolicyNode` when a node's action is blocked by policy.
pub const AFP_SUBTYPE_POLICY_BLOCK: &str = "policy_block";
/// Request by a `ReflectionNode` to re-plan the remaining workflow after failure.
pub const AFP_SUBTYPE_REPLAN_REQUEST: &str = "replan_request";
/// Final structured summary emitted by a `TerminationNode` at workflow end.
pub const AFP_SUBTYPE_WORKFLOW_SUMMARY: &str = "workflow_summary";
/// MCP tool/resource discovery response from a capability node.
pub const AFP_SUBTYPE_CAPABILITY_OFFER: &str = "capability_offer";

// ── Knowledge graph stance types (ref_type values for afp_backlinks) ──────────
pub const LINK_REF_TYPE_SUPPORTS: &str = "supports";
pub const LINK_REF_TYPE_REFUTES: &str = "refutes";
pub const LINK_REF_TYPE_PART_OF: &str = "part_of";
pub const LINK_REF_TYPE_CAUSED_BY: &str = "caused_by";
pub const LINK_REF_TYPE_TEMPORALLY_RELATED: &str = "temporally_related";
pub const LINK_REF_TYPE_MENTIONS: &str = "mentions";

// ── Finance Guardian AFP types ─────────────────────────────────────────────────
pub const AFP_TYPE_TRANSACTION_INGEST: &str = "transaction_ingest";
pub const AFP_TYPE_FINANCE_REPORT: &str = "finance_report";
pub const AFP_TYPE_FINANCE_ANOMALY: &str = "finance_anomaly";
pub const AFP_TYPE_FINANCE_INSIGHT: &str = "finance_insight";
pub const AFP_TYPE_FINANCE_ACCOUNT_LINKED: &str = "finance_account_linked";

/// `metadata.tool_call` shape — present when an AFP message initiates an
/// external tool call (OpenAI function, MCP, or internal capability).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AfpToolCallMetadata {
    /// Unique identifier correlating this call with its result message.
    pub call_id: String,
    /// `openai_function` | `mcp` | `a2a` | `internal`
    pub connector_family: String,
    /// The tool or function name being invoked.
    pub tool_name: String,
    /// JSON parameters for the tool.
    pub parameters: serde_json::Value,
    /// When `true` the result message should carry `metadata.store: false`
    /// and must not be persisted to ElectricSQL.
    #[serde(default)]
    pub ephemeral_result: bool,
    /// Optional MCP server URL for `connector_family = "mcp"`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp_server_url: Option<String>,
    /// Optional A2A agent endpoint for `connector_family = "a2a"`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub a2a_agent_endpoint: Option<String>,
}

/// `metadata.tool_result` shape — present on the result message returned by an executor.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AfpToolResultMetadata {
    /// Must match the `call_id` from the originating `AfpToolCallMetadata`.
    pub call_id: String,
    /// `success` | `error` | `partial`
    pub status: String,
    /// Result payload. Omitted on error.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    /// Error message. Present when `status = "error"`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Tokens consumed by this tool call (0 for direct HTTP paths).
    #[serde(default)]
    pub tokens_used: u32,
    /// Cost in cents for this tool call (0 for self-hosted or internal).
    #[serde(default)]
    pub cost_cents: u32,
    /// Wall-clock milliseconds from dispatch to result.
    #[serde(default)]
    pub latency_ms: u32,
    /// Provider-specific request or trace ID for external observability.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_request_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AfpTriggerOriginMetadata {
    pub trigger_family: String,
    pub trigger_kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deployment_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_node_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheduled_for: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delay_anchor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub continuation_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub correlation_scope: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub causation_strategy: Option<String>,
}

impl AfpTriggerOriginMetadata {
    pub fn as_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or_else(|_| Value::Null)
    }
}

pub fn afp_trigger_message_families(
    trigger_family: &str,
    has_delay: bool,
    is_internal_event: bool,
) -> Vec<String> {
    match trigger_family {
        "time" => {
            let mut messages = vec![
                format!("agent:{AFP_SUBTYPE_TRIGGER_REQUEST}"),
                format!("agent:{AFP_SUBTYPE_TRIGGER_DISPATCH}"),
            ];
            if has_delay {
                messages.push(format!("agent:{AFP_SUBTYPE_WAKE_REQUEST}"));
                messages.push(format!("agent:{AFP_SUBTYPE_WAKE_RESULT}"));
            }
            messages
        }
        "event" => {
            let mut messages = vec![
                format!("agent:{AFP_SUBTYPE_TRIGGER_REQUEST}"),
                format!("agent:{AFP_SUBTYPE_EVENT_DISPATCH}"),
            ];
            if is_internal_event {
                messages.push("agent:node_progress".to_string());
                messages.push("agent:node_result".to_string());
                messages.push("agent:decision_result".to_string());
            }
            messages
        }
        "hybrid" => vec![
            format!("agent:{AFP_SUBTYPE_TRIGGER_REQUEST}"),
            format!("agent:{AFP_SUBTYPE_EVENT_DISPATCH}"),
            format!("agent:{AFP_SUBTYPE_WAKE_REQUEST}"),
            format!("agent:{AFP_SUBTYPE_WAKE_RESULT}"),
            "agent:decision_result".to_string(),
        ],
        _ => Vec::new(),
    }
}

#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct AfpReference {
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub target: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

pub fn parse_afp_references(references: &[Value]) -> Vec<AfpReference> {
    references
        .iter()
        .filter_map(|reference| serde_json::from_value(reference.clone()).ok())
        .filter(|reference: &AfpReference| {
            !reference.r#type.trim().is_empty() && !reference.target.trim().is_empty()
        })
        .collect()
}

fn canonical_references_from_typed_refs(typed_refs: &[Value]) -> Vec<AfpReference> {
    typed_refs
        .iter()
        .filter_map(Value::as_object)
        .filter_map(|typed_ref| {
            let target = typed_ref
                .get("id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())?
                .to_string();
            let link_type = typed_ref
                .get("ref_type")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let thread_id = typed_ref
                .get("thread_id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let label = typed_ref
                .get("label")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);

            let mut metadata = serde_json::Map::new();
            if let Some(link_type) = link_type {
                metadata.insert("link_type".to_string(), Value::String(link_type));
            }
            if let Some(thread_id) = thread_id {
                metadata.insert("thread_id".to_string(), Value::String(thread_id));
            }

            Some(AfpReference {
                r#type: "message".to_string(),
                target,
                label,
                metadata: (!metadata.is_empty()).then_some(Value::Object(metadata)),
            })
        })
        .collect()
}

fn merge_canonical_references(existing_references: &[Value], typed_refs: &[Value]) -> Vec<Value> {
    let mut merged = existing_references.to_vec();
    let mut seen = parse_afp_references(existing_references)
        .into_iter()
        .map(|reference| {
            let link_type = reference
                .metadata
                .as_ref()
                .and_then(Value::as_object)
                .and_then(|metadata| metadata.get("link_type"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
            (
                reference.r#type.trim().to_string(),
                reference.target.trim().to_string(),
                link_type,
            )
        })
        .collect::<BTreeSet<_>>();

    for reference in canonical_references_from_typed_refs(typed_refs) {
        let link_type = reference
            .metadata
            .as_ref()
            .and_then(Value::as_object)
            .and_then(|metadata| metadata.get("link_type"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        let key = (
            reference.r#type.trim().to_string(),
            reference.target.trim().to_string(),
            link_type,
        );
        if seen.insert(key) {
            merged.push(serde_json::to_value(reference).unwrap_or(Value::Null));
        }
    }

    merged
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct AFPMessage {
    #[serde(default = "default_protocol")]
    pub protocol: String,
    #[serde(default)]
    pub id: String,
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    pub from: String,
    #[serde(default)]
    pub to: Vec<String>,
    #[serde(default)]
    pub timestamp: String,
    pub r#type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub supertags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtype: Option<String>,
    #[serde(default)]
    pub content: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(default)]
    pub signature: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption: Option<serde_json::Value>,
    #[serde(default)]
    pub views: Vec<serde_json::Value>,
    #[serde(default)]
    pub references: Vec<serde_json::Value>,
    #[serde(default)]
    pub typed_refs: Vec<serde_json::Value>,
    #[serde(default)]
    pub attachments: Vec<serde_json::Value>,
    #[serde(default)]
    pub store_in_relational: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prev_hash: Option<String>,
}

fn inferred_unified_object_kind(
    message_type: &str,
    kind: Option<&str>,
    content: &Value,
    metadata: Option<&Value>,
) -> Option<String> {
    normalized_non_empty_str(kind).or_else(|| {
        if message_type == AFP_TYPE_LEDGER {
            normalized_non_empty_str(content.get("kind").and_then(Value::as_str)).or_else(|| {
                normalized_non_empty_str(
                    metadata
                        .and_then(|value| value.get("kind"))
                        .and_then(Value::as_str),
                )
            })
        } else {
            legacy_message_type_to_kind(message_type).map(str::to_string)
        }
    })
}

fn merged_message_supertags(
    top_level_supertags: &[String],
    content: &Value,
    metadata: Option<&Value>,
) -> Vec<String> {
    unique_string_values(&[
        Some(&Value::Array(
            top_level_supertags
                .iter()
                .cloned()
                .map(Value::String)
                .collect(),
        )),
        content.get("supertags"),
        metadata.and_then(|value| value.get("supertags")),
    ])
}

fn insert_searchable_field(
    target: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<&Value>,
) {
    let Some(value) = value else {
        return;
    };
    if target.contains_key(key) {
        return;
    }
    match value {
        Value::Null => {}
        Value::String(text) if text.trim().is_empty() => {}
        Value::Array(items) if items.is_empty() => {}
        Value::Object(object) if object.is_empty() => {}
        other => {
            target.insert(key.to_string(), other.clone());
        }
    }
}

fn normalized_object_metadata(metadata: Option<Value>) -> Option<serde_json::Map<String, Value>> {
    match metadata {
        Some(Value::Object(map)) => Some(map),
        Some(_) => None,
        None => Some(serde_json::Map::new()),
    }
}

pub fn normalize_message_for_storage(mut message: AFPMessage) -> AFPMessage {
    let inferred_kind = inferred_unified_object_kind(
        &message.r#type,
        message.kind.as_deref(),
        &message.content,
        message.metadata.as_ref(),
    );
    if message
        .kind
        .as_deref()
        .is_none_or(|value| value.trim().is_empty())
    {
        message.kind = inferred_kind.clone();
    }

    let supertags = merged_message_supertags(
        &message.supertags,
        &message.content,
        message.metadata.as_ref(),
    );
    message.supertags = supertags.clone();
    message.references = merge_canonical_references(&message.references, &message.typed_refs);
    let Some(mut metadata) = normalized_object_metadata(message.metadata.take()) else {
        return message;
    };

    if !supertags.is_empty() && !metadata.contains_key("supertags") {
        metadata.insert("supertags".to_string(), serde_json::json!(supertags));
    }

    if let Some(kind) = inferred_kind.as_deref() {
        if message.r#type != AFP_TYPE_LEDGER && !metadata.contains_key("legacy_type") {
            metadata.insert(
                "legacy_type".to_string(),
                Value::String(message.r#type.clone()),
            );
        }

        let mut searchable_metadata = metadata
            .remove("searchable_metadata")
            .and_then(|value| value.as_object().cloned())
            .unwrap_or_default();
        searchable_metadata
            .entry("kind".to_string())
            .or_insert_with(|| Value::String(kind.to_string()));
        searchable_metadata
            .entry("message_type".to_string())
            .or_insert_with(|| Value::String(message.r#type.clone()));
        if let Some(subtype) = normalized_non_empty_str(message.subtype.as_deref()) {
            searchable_metadata
                .entry("subtype".to_string())
                .or_insert_with(|| Value::String(subtype));
        }
        if !supertags.is_empty() {
            searchable_metadata
                .entry("supertags".to_string())
                .or_insert_with(|| serde_json::json!(supertags));
        }

        for key in [
            "title", "name", "status", "priority", "domain", "area", "state",
        ] {
            insert_searchable_field(&mut searchable_metadata, key, message.content.get(key));
        }
        insert_searchable_field(
            &mut searchable_metadata,
            "suggested_actions",
            message.content.get("suggested_actions"),
        );

        if let Some(content_metadata) = message.content.get("metadata").and_then(Value::as_object) {
            for (key, value) in content_metadata {
                insert_searchable_field(&mut searchable_metadata, key, Some(value));
            }
        }
        for key in ["memory_space", "author_mask", "author_type", "author_id"] {
            insert_searchable_field(&mut searchable_metadata, key, metadata.get(key));
        }

        if !searchable_metadata.contains_key("is_human_authored") {
            if let Some(author_type) = metadata.get("author_type").and_then(Value::as_str) {
                let is_human_authored =
                    matches!(author_type.trim().to_ascii_lowercase().as_str(), "human");
                searchable_metadata.insert(
                    "is_human_authored".to_string(),
                    Value::Bool(is_human_authored),
                );
            } else {
                insert_searchable_field(
                    &mut searchable_metadata,
                    "is_human_authored",
                    metadata.get("is_human_authored"),
                );
            }
        }

        metadata.insert(
            "searchable_metadata".to_string(),
            Value::Object(searchable_metadata),
        );
    }

    message.metadata = if metadata.is_empty() {
        None
    } else {
        Some(Value::Object(metadata))
    };
    message
}

fn default_protocol() -> String {
    "afp-v1".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpEntityMention {
    pub kind: String,
    pub name: String,
    pub canonical: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_snippet: Option<String>,
    #[serde(default)]
    pub confidence: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpRelationship {
    pub subject: String,
    pub predicate: String,
    pub object: String,
    #[serde(default)]
    pub confidence: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpKnowledgeLinkContent {
    pub source_message_id: String,
    pub thread_id: String,
    pub extracted_at: String,
    #[serde(default)]
    pub entities: Vec<AfpEntityMention>,
    #[serde(default)]
    pub relationships: Vec<AfpRelationship>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extractor_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_message_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relationship_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(default)]
    pub source_refs: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AfpProvenanceHash {
    pub label: String,
    pub sha256: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpProvenanceRecordContent {
    pub record_id: String,
    pub actor: String,
    pub action_type: String,
    pub action_label: String,
    #[serde(default)]
    pub source_message_ids: Vec<String>,
    #[serde(default)]
    pub input_hashes: Vec<AfpProvenanceHash>,
    #[serde(default)]
    pub output_hashes: Vec<AfpProvenanceHash>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    pub recorded_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AfpLedgerEntry {
    pub entry_id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authored_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AfpLedgerPromotionRule {
    pub promote_to: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after_update_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after_days: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after_entry_count: Option<u32>,
    #[serde(default)]
    pub compress_on_promote: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AfpTieredLedgerContent {
    pub name: String,
    #[serde(default)]
    pub tier: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub entries: Vec<AfpLedgerEntry>,
    #[serde(default)]
    pub pointer_bundle: Vec<String>,
    #[serde(default)]
    pub promotion_rules: Vec<AfpLedgerPromotionRule>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AfpLedgerPromotionContent {
    pub ledger_message_id: String,
    pub from_tier: String,
    pub to_tier: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compressed_summary: Option<String>,
    #[serde(default)]
    pub updates_compressed: u32,
    #[serde(default)]
    pub pointer_bundle: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct AfpThreadSummaryContent {
    #[serde(default)]
    pub thread_ids: Vec<String>,
    #[serde(default)]
    pub covered_from: String,
    #[serde(default)]
    pub covered_to: String,
    #[serde(default)]
    pub condensed_text: String,
    #[serde(default)]
    pub key_insights: Vec<String>,
    #[serde(default)]
    pub next_actions: Vec<String>,
    #[serde(default)]
    pub generated_by: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_used: Option<String>,
    #[serde(default)]
    pub tokens_compressed: u32,
}

/// Content shape for `AFP_TYPE_FOLDER_RULE` messages.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct FolderRuleContent {
    pub folder_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backlink_rules: Option<String>,
    #[serde(default)]
    pub tag_suggestions: Vec<String>,
}

/// Content shape for `AFP_TYPE_BACKLINK_OVERRIDE` messages.
/// Per-message or per-thread override for the curator backlink pipeline.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct BacklinkOverrideContent {
    /// Optional free-text backlink rules (same syntax as folder rules).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rules: Option<String>,
    /// When `true`, suppress all curator-generated backlinks for this message/thread.
    #[serde(default)]
    pub suppress: bool,
}

/// Content shape for `AFP_TYPE_SUPERTAG_DEFINITION` messages.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct SupertagDefinitionContent {
    pub tag_name: String,
    #[serde(default)]
    pub keywords: Vec<String>,
    #[serde(default)]
    pub folder_scope: Vec<String>,
    #[serde(default)]
    pub parent_tags: Vec<String>,
    #[serde(default)]
    pub alias_tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hierarchy_mode: Option<String>,
}

/// Return the AFP message families that a node of `node_kind` is expected to
/// produce or consume during workflow execution.
///
/// Used by the IR compiler to populate `node_registry.afp_message_families`
/// on each compiled manifest, and by the validator to verify that the runtime
/// capabilities bound to a node are consistent with the expected message shapes.
pub fn afp_node_message_families(node_kind: &str) -> Vec<String> {
    let s = |sub: &str| format!("agent:{sub}");
    match node_kind {
        "GoalIntake" | "goal_intake" => vec![
            s(AFP_SUBTYPE_WORKFLOW_MANIFEST),
            s(AFP_SUBTYPE_NODE_REQUEST),
            s(AFP_SUBTYPE_NODE_RESULT),
        ],
        "Plan" | "plan" => vec![
            s(AFP_SUBTYPE_NODE_REQUEST),
            s(AFP_SUBTYPE_NODE_RESULT),
            s(AFP_SUBTYPE_REPLAN_REQUEST),
        ],
        "Policy" | "policy" => vec![
            s(AFP_SUBTYPE_NODE_REQUEST),
            s(AFP_SUBTYPE_NODE_RESULT),
            s(AFP_SUBTYPE_POLICY_BLOCK),
        ],
        "Ambiguity" | "ambiguity" => vec![
            s(AFP_SUBTYPE_DECISION_REQUEST),
            s(AFP_SUBTYPE_DECISION_RESULT),
            s(AFP_SUBTYPE_NODE_RESULT),
        ],
        "Executor" | "executor" => vec![
            s(AFP_SUBTYPE_NODE_REQUEST),
            s(AFP_SUBTYPE_NODE_RESULT),
            s(AFP_SUBTYPE_NODE_PROGRESS),
        ],
        "Reflection" | "reflection" => vec![
            s(AFP_SUBTYPE_NODE_REQUEST),
            s(AFP_SUBTYPE_NODE_RESULT),
            s(AFP_SUBTYPE_REPLAN_REQUEST),
        ],
        "Approval" | "approval" => vec![
            s(AFP_SUBTYPE_DECISION_REQUEST),
            s(AFP_SUBTYPE_DECISION_RESULT),
            s(AFP_SUBTYPE_POLICY_BLOCK),
        ],
        "Merge" | "merge" => vec![s(AFP_SUBTYPE_NODE_REQUEST), s(AFP_SUBTYPE_NODE_RESULT)],
        "Termination" | "termination" => {
            vec![s(AFP_SUBTYPE_NODE_RESULT), s(AFP_SUBTYPE_WORKFLOW_SUMMARY)]
        }
        "CapabilityRouter" | "capability_router" => vec![
            s(AFP_SUBTYPE_CAPABILITY_OFFER),
            s(AFP_SUBTYPE_NODE_REQUEST),
            s(AFP_SUBTYPE_NODE_RESULT),
        ],
        // Unknown kinds get the minimal executor set.
        _ => vec![s(AFP_SUBTYPE_NODE_REQUEST), s(AFP_SUBTYPE_NODE_RESULT)],
    }
}

/// Extract the `store` flag from a raw metadata JSON string.
///
/// Returns `false` when `metadata` contains `"store": false` (or `"store": 0`),
/// indicating the message must not be persisted.  Defaults to `true`.
pub fn metadata_store_flag(metadata_str: &str) -> bool {
    if metadata_str.trim().is_empty() {
        return true;
    }
    match serde_json::from_str::<serde_json::Value>(metadata_str) {
        Ok(v) => match v.get("store") {
            Some(serde_json::Value::Bool(b)) => *b,
            Some(serde_json::Value::Number(n)) => n.as_i64().unwrap_or(1) != 0,
            _ => true,
        },
        Err(_) => true,
    }
}

// ── Ingest structs ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpTranscriptSegment {
    pub start_s: f64,
    pub end_s: f64,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpTranscript {
    pub model_used: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_attachment_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<f64>,
    pub text: String,
    #[serde(default)]
    pub segments: Vec<AfpTranscriptSegment>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpParsedDocument {
    pub content_type: String,
    pub parser_used: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_attachment_id: Option<String>,
    pub content_text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpTabularDataset {
    pub dataset_id: String,
    pub title: String,
    #[serde(default)]
    pub columns: Vec<String>,
    #[serde(default)]
    pub rows: Vec<Vec<String>>,
    #[serde(default)]
    pub source_message_ids: Vec<String>,
    pub quality_status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_family_context: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpChartSpec {
    pub dataset_id: String,
    pub chart_type: String,
    pub label_column: String,
    #[serde(default)]
    pub value_columns: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_family_context: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpDocumentExtractResult {
    pub source_message_id: String,
    pub extraction_mode: String,
    #[serde(default)]
    pub schema: Vec<String>,
    #[serde(default)]
    pub records: Vec<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence_summary: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cell_provenance: Option<serde_json::Value>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpDatasetRevision {
    pub dataset_id: String,
    pub source_dataset_message_id: String,
    #[serde(default)]
    pub columns: Vec<String>,
    #[serde(default)]
    pub rows: Vec<Vec<String>>,
    #[serde(default)]
    pub notes: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpContentDigestResult {
    pub source_message_id: String,
    pub source_message_type: String,
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub bullets: Vec<String>,
    #[serde(default)]
    pub action_items: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_family_context: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpMultimodalIngestRequest {
    pub source_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_message_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_attachment_id: Option<String>,
    pub thread_id: String,
    pub mime_type: String,
    pub parser_family: String,
    #[serde(default)]
    pub suppress_intermediates: bool,
}

// ── Proactive engine structs ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpPassiveEventContent {
    #[serde(default)]
    pub event_type: String,
    #[serde(default)]
    pub confidence: f64,
    #[serde(default)]
    pub metadata: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(default)]
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
    #[serde(default)]
    pub event_at: String,
}

// ── Agent memory & persona ────────────────────────────────────────────────────

pub const AFP_TYPE_AGENT_MEMORY: &str = "agent_memory";
pub const AFP_TYPE_PERSONA_STATE: &str = "persona_state";
pub const AFP_TYPE_MEMORY_RESURFACING_EVENT: &str = "memory_resurfacing_event";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpEmotionalSignal {
    #[serde(default)]
    pub weight: f64,
    #[serde(default)]
    pub valence: f64,
    #[serde(default)]
    pub arousal: f64,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub captured_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpEmotionalDecay {
    #[serde(default)]
    pub half_life_days: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_reinforced_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suppressed_until: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpEmpatheticMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emotional_signal: Option<AfpEmotionalSignal>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emotional_decay: Option<AfpEmotionalDecay>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpAgentMemoryContent {
    pub kind: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub source_message_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpPersonaStateContent {
    pub profile_id: String,
    pub tone_mode: String,
    pub initiative_level: String,
    pub verbosity_level: String,
    pub caution_level: String,
    #[serde(default)]
    pub continuity_anchors: Vec<String>,
    pub updated_by: String,
    pub reason: String,
    pub effective_at: String,
}

// ── Proactive suggestion ──────────────────────────────────────────────────────

pub const AFP_TYPE_PROACTIVE_SUGGESTION: &str = "proactive_suggestion";
pub const AFP_SUBTYPE_CALENDAR_EVENT_COMPLETED: &str = "calendar_event_completed";
pub const AFP_SUBTYPE_DEEP_WORK_SESSION_STARTED: &str = "deep_work_session_started";
pub const AFP_SUBTYPE_EMAIL_THREAD_IDLE: &str = "email_thread_idle";
pub const AFP_SUBTYPE_WORKFLOW_FAILED: &str = "workflow_failed";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpProactiveSuggestionContent {
    pub heuristic_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heuristic_family_id: Option<String>,
    #[serde(default)]
    pub confidence: f64,
    pub urgency: String,
    pub action_label: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub destination_view: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub draft_class: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response_due_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selection_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_or_reversibility_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance_cue: Option<String>,
    #[serde(default)]
    pub requires_approval: bool,
    #[serde(default)]
    pub artifact_summary_lines: Vec<String>,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub autonomy_decision: Option<AutonomyDecision>,
    #[serde(default)]
    pub is_pack_suggestion: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pack_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action_afp_payload: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dismiss_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_event_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
}

// ── Background watcher ────────────────────────────────────────────────────────

pub const AFP_TYPE_WATCHER_ALERT: &str = "watcher_alert";
pub const AFP_TYPE_SMART_SUGGESTION: &str = "smart_suggestion";
pub const AFP_TYPE_WATCHER_RESOLUTION_EVENT: &str = "watcher_resolution_event";
pub const AFP_TYPE_SYNTHESIS_INVALIDATION_EVENT: &str = "synthesis_invalidation_event";
pub const AFP_TYPE_DAILY_CONTEXT: &str = "daily_context";
pub const AFP_TYPE_USER_LIFE_PROFILE: &str = "user_life_profile";
pub const AFP_SUBTYPE_WATCHER_RESOLUTION_ACCEPTED: &str = "watcher_resolution:accepted";
pub const AFP_SUBTYPE_WATCHER_RESOLUTION_DISMISSED: &str = "watcher_resolution:dismissed";
pub const AFP_SUBTYPE_WATCHER_RESOLUTION_SNOOZED: &str = "watcher_resolution:snoozed";
pub const AFP_SUBTYPE_WATCHER_RESOLUTION_COMPLETED: &str = "watcher_resolution:completed";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpWatcherAlertContent {
    pub heuristic_id: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
    #[serde(default)]
    pub confidence: f64,
    pub severity: String,
    pub category: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_event_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpSmartSuggestionContent {
    pub heuristic_id: String,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub confidence: f64,
    pub category: String,
    #[serde(default)]
    pub action_chips: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_event_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpWatcherResolutionEventContent {
    pub resolution_kind: String,
    pub resolved_message_id: String,
    pub heuristic_id: String,
    pub category: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub severity: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_event_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snoozed_until: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpSynthesisInvalidationEventContent {
    pub invalidation_kind: String,
    pub reason_message_id: String,
    pub reason_type: String,
    #[serde(default)]
    pub invalidated_types: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invalidated_snapshot_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invalidated_synthesis_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heuristic_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

// ── Behavioral pattern extractor ──────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpBehaviorPatternContent {
    pub pattern_key: String,
    pub summary: String,
    pub category: String,
    #[serde(default)]
    pub confidence: f64,
    pub evidence_count: i32,
    pub last_observed_at: String,
    #[serde(default)]
    pub action_chips: Vec<String>,
}

// ── Bento card ────────────────────────────────────────────────────────────────

pub const AFP_TYPE_BENTO_CARD: &str = "bento_card";
pub const AFP_SUBTYPE_BENTO_CARD_RENDER: &str = "bento_card:render";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpBentoSlot {
    pub slot_id: String,
    #[serde(default)]
    pub col_span: u8,
    #[serde(default)]
    pub row_span: u8,
    pub variant: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sub_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trend: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(default)]
    pub items: Vec<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpBentoCardContent {
    pub card_id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub slots: Vec<AfpBentoSlot>,
    pub composed_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout: Option<String>,
}

// ── Brain doctor ──────────────────────────────────────────────────────────────

pub const AFP_TYPE_BRAIN_DOCTOR: &str = "brain_doctor";
pub const AFP_SUBTYPE_BRAIN_DOCTOR_AUDIT: &str = "brain_doctor:audit";
pub const AFP_SUBTYPE_BRAIN_DOCTOR_FINDING: &str = "brain_doctor:finding";
pub const AFP_SUBTYPE_BRAIN_DOCTOR_FIX_PROPOSAL: &str = "brain_doctor:fix_proposal";
pub const AFP_SUBTYPE_BRAIN_DOCTOR_FIX_APPLIED: &str = "brain_doctor:fix_applied";
pub const BRAIN_DOCTOR_SEVERITY_INFO: &str = "info";
pub const BRAIN_DOCTOR_SEVERITY_WARNING: &str = "warning";
pub const BRAIN_DOCTOR_SEVERITY_CRITICAL: &str = "critical";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpAuditFinding {
    pub finding_id: String,
    pub kind: String,
    pub severity: String,
    pub description: String,
    #[serde(default)]
    pub affected_entry_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggested_fix: Option<String>,
    #[serde(default)]
    pub entry_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpFixProposal {
    pub finding_id: String,
    pub action: String,
    pub details: serde_json::Value,
    pub requires_approval: bool,
    #[serde(default)]
    pub target_ids: Vec<String>,
    pub rationale: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub merged_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_tag: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpBrainDoctorAuditContent {
    pub audit_id: String,
    pub ledger_message_id: String,
    pub entries_scanned: u32,
    #[serde(default)]
    pub findings: Vec<AfpAuditFinding>,
    #[serde(default)]
    pub health_score: f64,
    pub audited_at: String,
    #[serde(default)]
    pub ledger_id: String,
    #[serde(default)]
    pub severity_summary: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpBrainDoctorFindingContent {
    pub audit_id: String,
    pub ledger_message_id: String,
    pub finding: AfpAuditFinding,
    pub entries_scanned: u32,
    #[serde(default)]
    pub health_score: f64,
    pub emitted_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpBrainDoctorFixProposalContent {
    pub audit_id: String,
    #[serde(default)]
    pub proposals: Vec<AfpFixProposal>,
    #[serde(default)]
    pub audit_message_id: String,
    #[serde(default)]
    pub ledger_id: String,
    #[serde(default)]
    pub proposed_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpBrainDoctorFixAppliedContent {
    pub audit_id: String,
    #[serde(default)]
    pub applied_finding_ids: Vec<String>,
    #[serde(default)]
    pub skipped_finding_ids: Vec<String>,
    pub applied_at: String,
    #[serde(default)]
    pub proposal_message_id: String,
    #[serde(default)]
    pub ledger_id: String,
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub affected_ids: Vec<String>,
}

// ── Browser automation ────────────────────────────────────────────────────────

pub const AFP_TYPE_BROWSER_TASK: &str = "browser_task";
pub const AFP_SUBTYPE_BROWSER_TASK_REQUEST: &str = "browser_task:request";
pub const AFP_SUBTYPE_BROWSER_TASK_PROGRESS: &str = "browser_task:progress";
pub const AFP_SUBTYPE_BROWSER_TASK_RESULT: &str = "browser_task:result";
pub const AFP_SUBTYPE_BROWSER_TASK_SCREENSHOT: &str = "browser_task:screenshot";
pub const AFP_SUBTYPE_BROWSER_TASK_BLOCKED: &str = "browser_task:blocked";
pub const AFP_SUBTYPE_BROWSER_TASK_UNBLOCK: &str = "browser_task:unblock";
pub const AFP_SUBTYPE_BROWSER_TASK_CANCEL: &str = "browser_task:cancel";
pub const NAV_PERM_READ: &str = "navigation_read";
pub const NAV_PERM_FORM: &str = "navigation_form";
pub const NAV_PERM_FULL: &str = "navigation_full";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpBrowserStep {
    #[serde(default)]
    pub step_index: u32,
    pub action: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(default)]
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selector: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpBrowserTaskRequestContent {
    pub task_description: String,
    pub navigation_permission: String,
    #[serde(default)]
    pub steps: Vec<AfpBrowserStep>,
    #[serde(default)]
    pub step_approval_required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_steps: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required_permission: Option<String>,
    #[serde(default)]
    pub planned_steps: Vec<AfpBrowserStep>,
}

// ── Camera access ─────────────────────────────────────────────────────────────

pub const AFP_TYPE_CAMERA_ACCESS: &str = "camera_access";
pub const AFP_SUBTYPE_CAMERA_ACCESS_REQUEST: &str = "camera_access:request";
pub const AFP_SUBTYPE_CAMERA_ACCESS_GRANT: &str = "camera_access:grant";
pub const AFP_SUBTYPE_CAMERA_ACCESS_RESULT: &str = "camera_access:result";
pub const AFP_SUBTYPE_CAMERA_ACCESS_CANCEL: &str = "camera_access:cancel";
pub const CAMERA_MODE_QR_SCAN: &str = "qr_scan";
pub const CAMERA_MODE_PHOTO: &str = "photo";
pub const CAMERA_GRANT_ONCE: &str = "once";
pub const CAMERA_GRANT_SESSION: &str = "session";

// ── Decision outcome diary ────────────────────────────────────────────────────

pub const AFP_TYPE_DECISION_OUTCOME: &str = "decision_outcome";
pub const AFP_SUBTYPE_DECISION_OUTCOME_RECORD: &str = "decision_outcome:record";
pub const AFP_SUBTYPE_DECISION_OUTCOME_REVIEW: &str = "decision_outcome:review";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpOutcomeCategory {
    pub name: String,
    #[serde(default)]
    pub count: u32,
    #[serde(default)]
    pub avg_score: f32,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpDecisionOutcomeContent {
    pub decision_message_id: String,
    pub decision_summary: String,
    pub outcome_label: String,
    #[serde(default)]
    pub outcome: String,
    #[serde(default)]
    pub outcome_score: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decision_time_ms: Option<u64>,
    #[serde(default)]
    pub outcome_recorded_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub learnings: Option<String>,
    pub recorded_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpDecisionOutcomeReviewContent {
    pub review_id: String,
    pub period_start: String,
    pub period_end: String,
    #[serde(default)]
    pub total_decisions: u32,
    #[serde(default)]
    pub positive_count: u32,
    #[serde(default)]
    pub negative_count: u32,
    #[serde(default)]
    pub neutral_count: u32,
    #[serde(default)]
    pub mixed_count: u32,
    #[serde(default)]
    pub avg_outcome_score: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avg_decision_time_ms: Option<u64>,
    #[serde(default)]
    pub categories: Vec<AfpOutcomeCategory>,
    #[serde(default)]
    pub insights: Vec<String>,
    #[serde(default)]
    pub outcome_message_id: String,
    #[serde(default)]
    pub review_label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default)]
    pub reviewed_at: String,
}

// ── Eval agent ────────────────────────────────────────────────────────────────

pub const AFP_SUBTYPE_EVAL_AGENT_RESULT: &str = "eval_agent:result";
pub const AFP_SUBTYPE_REFLECTION_EVAL_RESULT: &str = "reflection_eval:result";
pub const AFP_TYPE_REFLECTION_TRACE: &str = "reflection_trace";
pub const AFP_SUBTYPE_COORDINATION_CYCLE_TRACE: &str = "reflection_trace:coordination_cycle";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpReflectionTraceContent {
    pub cycle_kind: String,
    pub suggestion_id: String,
    pub outcome_kind: String,
    pub heuristic_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surfaced_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surfaced_priority_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surfaced_panel_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapshot_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub synthesis_ref: Option<String>,
    #[serde(default)]
    pub linked_artifact_ids: Vec<String>,
    #[serde(default)]
    pub reasoning_notes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome_observability: Option<AfpOutcomeObservabilityContent>,
    #[serde(default)]
    pub traced_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpOutcomeObservabilityContent {
    pub surface_kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dominant_surface_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_scope_kind: Option<String>,
    pub narrowing_signal: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feedback_status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feedback_scope: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub acceptance_rate_bucket: Option<String>,
    #[serde(default)]
    pub dominant_surface_match: bool,
    #[serde(default)]
    pub linked_artifact_count: u32,
    #[serde(default)]
    pub source_ref_count: u32,
}

// ── File access agent ─────────────────────────────────────────────────────────

pub const AFP_TYPE_FILE_ACCESS_REQUEST: &str = "file_access_request";
pub const AFP_SUBTYPE_FILE_ACCESS_REQUEST: &str = "file_access:request";
pub const AFP_SUBTYPE_FILE_ACCESS_GRANT: &str = "file_access:grant";
pub const AFP_SUBTYPE_FILE_ACCESS_DENY: &str = "file_access:deny";
pub const AFP_SUBTYPE_FILE_ACCESS_REVOKE: &str = "file_access:revoke";
pub const AFP_SUBTYPE_FILE_ACCESS_OP: &str = "file_access:op";
pub const AFP_SUBTYPE_FILE_ACCESS_OP_RESULT: &str = "file_access:op_result";
pub const FILE_PERM_READ_ONLY: &str = "read_only";
pub const FILE_PERM_READ_WRITE: &str = "read_write";
pub const FILE_PERM_FULL_CONTROL: &str = "full_control";
pub const FILE_OP_READ: &str = "read";
pub const FILE_OP_WRITE: &str = "write";
pub const FILE_OP_DELETE: &str = "delete";
pub const FILE_OP_LIST: &str = "list";
pub const FILE_OP_MKDIR: &str = "mkdir";
pub const FILE_OP_RENAME: &str = "rename";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpFileAccessGrantContent {
    pub request_message_id: String,
    pub granted_paths: Vec<String>,
    pub permission: String,
    #[serde(default)]
    pub expires_at: String,
    #[serde(default)]
    pub allowed_extensions: Vec<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub sandbox_root: String,
    #[serde(default)]
    pub max_write_bytes: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpFileOpContent {
    pub operation: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_b64: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub destination: Option<String>,
}

// ── PARA ─────────────────────────────────────────────────────────────────────
//
// Two AFP types work together:
//   "archive"              — durable audit event: something was archived
//   "para_classification"  — lightweight classification overlay; never mutates the original
//
// Original AFP messages are NEVER modified. The classification layer is a
// separate append-only overlay that assigns PARA categories and status.

pub const AFP_TYPE_ARCHIVE: &str = "archive";
pub const AFP_TYPE_PARA_CLASSIFICATION: &str = "para_classification";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpArchiveContent {
    pub original_type: String,
    pub kind: String,
    pub archived_at: String,
    pub reason: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_thread_id: Option<String>,
    #[serde(default)]
    pub references: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_content: Option<serde_json::Value>,
}

/// Audit AFP emitted when something is durably archived.
pub fn build_archive_afp(
    user_id: &str,
    id: &str,
    thread_id: &str,
    content: &AfpArchiveContent,
) -> serde_json::Value {
    serde_json::json!({
        "protocol": "afp-v1",
        "id": id,
        "thread_id": thread_id,
        "from": user_id,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "type": AFP_TYPE_ARCHIVE,
        "kind": content.kind,
        "content": content,
        "original_type": content.original_type,
        "archived_at": content.archived_at,
        "reason": content.reason,
        "views": [],
        "references": content.references,
        "metadata": { "store": true, "continuity": true },
        "signature": ""
    })
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpParaClassificationContent {
    /// ID of the original AFP message being classified.
    pub target_id: String,
    /// PARA tags: namespaced strings like "project:wellness_routine", "area:health".
    /// One item may belong to multiple categories simultaneously.
    #[serde(default)]
    pub para: Vec<String>,
    /// "active" | "archived"
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
}

/// Classification overlay AFP — never modifies the original message.
pub fn build_para_classification_afp(
    user_id: &str,
    id: &str,
    content: &AfpParaClassificationContent,
) -> serde_json::Value {
    serde_json::json!({
        "protocol": "afp-v1",
        "id": id,
        "thread_id": format!("para_class_{}", &content.target_id[..content.target_id.len().min(16)]),
        "from": user_id,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "type": AFP_TYPE_PARA_CLASSIFICATION,
        "content": content,
        "references": [content.target_id.clone()],
        "metadata": { "store": true, "continuity": false },
        "signature": ""
    })
}

// ── File ledger ───────────────────────────────────────────────────────────────

pub const AFP_TYPE_FILE_LEDGER: &str = "file_ledger";
pub const AFP_SUBTYPE_FILE_LEDGER_CREATE: &str = "file_ledger:create";
pub const AFP_SUBTYPE_FILE_LEDGER_UPDATE: &str = "file_ledger:update";
pub const AFP_SUBTYPE_FILE_LEDGER_EXPORT_RESULT: &str = "file_ledger:export_result";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpLedgerContent {
    pub ledger_id: String,
    pub title: String,
    #[serde(default)]
    pub entries: Vec<AfpLedgerEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpFileExportRequest {
    pub ledger_id: String,
    pub format: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter_status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpFileExportResult {
    pub ledger_message_id: String,
    pub format: String,
    pub download_url: String,
    #[serde(default)]
    pub file_count: i32,
    #[serde(default)]
    pub export_size_bytes: u64,
    pub generated_at: String,
    #[serde(default)]
    pub ledger_id: String,
    #[serde(default)]
    pub row_count: i32,
    #[serde(default)]
    pub exported_at: String,
}

// ── Goal progress ─────────────────────────────────────────────────────────────

pub const AFP_TYPE_GOAL_PROGRESS: &str = "goal_progress";
pub const AFP_SUBTYPE_GOAL_PROGRESS_UPDATE: &str = "goal_progress:update";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpGoalMilestone {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub completed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub milestone_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpGoalProgressContent {
    pub goal_id: String,
    pub goal_label: String,
    #[serde(default)]
    pub progress_pct: f64,
    #[serde(default)]
    pub milestones: Vec<AfpGoalMilestone>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_step: Option<String>,
    pub updated_at: String,
}

// ── Mood record ───────────────────────────────────────────────────────────────

pub const AFP_TYPE_MOOD_RECORD: &str = "mood_record";
pub const AFP_SUBTYPE_MOOD_RECORD_CHECK_IN: &str = "mood_record:check_in";
pub const AFP_SUBTYPE_MOOD_RECORD_CARRY_FORWARD: &str = "mood_record:carry_forward";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpMoodRecordContent {
    pub mood: String,
    #[serde(default)]
    pub valence: f64,
    #[serde(default)]
    pub energy: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub recorded_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub carry_forward_from: Option<String>,
    #[serde(default)]
    pub mood_label: String,
    #[serde(default)]
    pub energy_level: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub carried_from_id: Option<String>,
}

// ── Privacy escalation ────────────────────────────────────────────────────────

pub const AFP_TYPE_MINIMAL_CONTEXT_PACKET: &str = "minimal_context_packet";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpMinimalContextPacketContent {
    pub heuristic_id: String,
    pub summary: String,
    #[serde(default)]
    pub entity_count: u32,
    #[serde(default)]
    pub anonymized: bool,
    #[serde(default)]
    pub estimated_tokens: u32,
    pub context_hash: String,
    pub provider_tier: String,
    #[serde(default)]
    pub anonymized_snippet: String,
    #[serde(default)]
    pub token_count: u32,
    #[serde(default)]
    pub prepared_at: String,
}

// ── Orchestration projections ─────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpNormalizedToolResultData {
    pub schema_version: String,
    pub tool_slug: String,
    pub tool_name: String,
    pub capability: String,
    pub connector_label: String,
    pub artifact_label: String,
    pub artifact_kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(default)]
    pub tool_id: String,
    #[serde(default)]
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default)]
    pub completed_at: String,
}

impl AfpNormalizedToolResultData {
    pub fn as_value(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or(serde_json::Value::Null)
    }

    pub fn insert_a2ui_fields(&self, map: &mut serde_json::Map<String, serde_json::Value>) {
        map.insert(
            "schema_version".into(),
            serde_json::Value::String(self.schema_version.clone()),
        );
        map.insert(
            "tool_slug".into(),
            serde_json::Value::String(self.tool_slug.clone()),
        );
        map.insert(
            "tool_name".into(),
            serde_json::Value::String(self.tool_name.clone()),
        );
        map.insert(
            "capability".into(),
            serde_json::Value::String(self.capability.clone()),
        );
        map.insert(
            "connector_label".into(),
            serde_json::Value::String(self.connector_label.clone()),
        );
        map.insert(
            "artifact_label".into(),
            serde_json::Value::String(self.artifact_label.clone()),
        );
        map.insert(
            "artifact_kind".into(),
            serde_json::Value::String(self.artifact_kind.clone()),
        );
        map.insert(
            "status".into(),
            serde_json::Value::String(self.status.clone()),
        );
        if let Some(url) = &self.url {
            map.insert("url".into(), serde_json::Value::String(url.clone()));
        }
        if let Some(title) = &self.title {
            map.insert("title".into(), serde_json::Value::String(title.clone()));
        }
        if let Some(channel) = &self.channel {
            map.insert("channel".into(), serde_json::Value::String(channel.clone()));
        }
        if let Some(filename) = &self.filename {
            map.insert(
                "filename".into(),
                serde_json::Value::String(filename.clone()),
            );
        }
    }
}

// ── Planning session ──────────────────────────────────────────────────────────

pub const AFP_TYPE_PLANNING: &str = "planning";
pub const AFP_SUBTYPE_PLANNING_RESULT: &str = "planning:result";
pub const AFP_SUBTYPE_PLANNING_ASSUMPTION_CHANGE: &str = "planning:assumption_change";

// ── Projection agent ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpProjectionContent {
    pub horizon_days: u32,
    pub summary: String,
    #[serde(default)]
    pub action_items: Vec<String>,
    #[serde(default)]
    pub confidence: f64,
    pub period_start: String,
    pub period_end: String,
    #[serde(default)]
    pub headline: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub action_chips: Vec<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub urgency: Option<String>,
    #[serde(default)]
    pub remediation_steps: Vec<String>,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface_policy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<String>,
}

// ── Temporal projection ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpProjectionRisk {
    pub label: String,
    pub severity: String,
    pub recommended_action: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpTemporalProjectionContent {
    pub horizon_days: u32,
    pub summary: String,
    #[serde(default)]
    pub risks: Vec<AfpProjectionRisk>,
    #[serde(default)]
    pub confidence: f64,
    pub period_start: String,
    pub period_end: String,
}

// ── Rollback / revert ─────────────────────────────────────────────────────────

pub const AFP_TYPE_REVERT_ACTION: &str = "revert_action";
pub const AFP_SUBTYPE_REVERT_CHECKPOINT: &str = "revert_action:checkpoint";
pub const AFP_SUBTYPE_REVERT_REQUEST: &str = "revert_action:request";
pub const AFP_SUBTYPE_REVERT_RESULT: &str = "revert_action:result";
pub const AFP_SUBTYPE_REVERT_HISTORY: &str = "revert_action:history";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpRevertStep {
    #[serde(default)]
    pub step_index: u32,
    pub description: String,
    pub afp_type: String,
    pub status: String,
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub completed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpRevertHistoryEntry {
    pub checkpoint_message_id: String,
    pub target_message_id: String,
    pub reverted_at: String,
    pub status: String,
    #[serde(default)]
    pub steps: Vec<AfpRevertStep>,
}

// ── Skill chain runtime ───────────────────────────────────────────────────────

pub const AFP_TYPE_SKILL_CHAIN: &str = "skill_chain";
pub const AFP_SUBTYPE_SKILL_CHAIN_RESULT: &str = "skill_chain:result";
pub const AFP_SUBTYPE_SKILL_CHAIN_ABORT: &str = "skill_chain:abort";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpSkillChainStep {
    pub id: String,
    pub skill_id: String,
    #[serde(default)]
    pub index: u32,
    pub description: String,
    pub input_mapping: serde_json::Value,
    #[serde(default)]
    pub optional: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpSkillChainContent {
    pub chain_id: String,
    pub title: String,
    pub steps: Vec<AfpSkillChainStep>,
    pub input: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_binding: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpSkillChainStepResult {
    pub step_id: String,
    pub skill_id: String,
    #[serde(default)]
    pub index: u32,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub duration_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpSkillChainResultContent {
    pub chain_id: String,
    pub status: String,
    pub steps_run: i32,
    pub steps_succeeded: i32,
    pub steps_failed: i32,
    #[serde(default)]
    pub step_results: Vec<AfpSkillChainStepResult>,
    pub duration_ms: u64,
    pub completed_at: String,
    #[serde(default)]
    pub total_duration_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub final_output: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub abort_reason: Option<String>,
}

// ── Temporal ledger ───────────────────────────────────────────────────────────

pub const AFP_TYPE_LEDGER_SNAPSHOT: &str = "ledger_snapshot";
pub const AFP_SUBTYPE_LEDGER_SNAPSHOT_POINT_IN_TIME: &str = "ledger_snapshot:point_in_time";
pub const AFP_SUBTYPE_LEDGER_SNAPSHOT_DELTA: &str = "ledger_snapshot:delta";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpLedgerSnapshotContent {
    pub ledger_message_id: String,
    pub snapshot_id: String,
    pub snapshot_at: String,
    pub tier: String,
    #[serde(default)]
    pub entry_count: u32,
    pub entries_hash: String,
    #[serde(default)]
    pub entries_inline: Vec<serde_json::Value>,
    #[serde(default)]
    pub ledger_id: String,
    #[serde(default)]
    pub entries: Vec<AfpLedgerEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpLedgerDeltaContent {
    pub ledger_message_id: String,
    pub from_snapshot_id: String,
    pub to_snapshot_id: String,
    pub period_start: String,
    pub period_end: String,
    #[serde(default)]
    pub added_entry_ids: Vec<String>,
    #[serde(default)]
    pub removed_entry_ids: Vec<String>,
    #[serde(default)]
    pub promoted_entry_ids: Vec<String>,
    #[serde(default)]
    pub net_change: i32,
    #[serde(default)]
    pub ledger_id: String,
    #[serde(default)]
    pub to_snapshot_at: String,
    #[serde(default)]
    pub added: Vec<AfpLedgerEntry>,
    #[serde(default)]
    pub removed_ids: Vec<String>,
    #[serde(default)]
    pub modified: Vec<AfpLedgerEntry>,
}

// ── Token budget ──────────────────────────────────────────────────────────────

pub const AFP_TYPE_PROACTIVE_TRIGGER: &str = "proactive_trigger";
pub const AFP_TYPE_TOKEN_BUDGET_LOG: &str = "token_budget_log";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpProactiveTriggerContent {
    pub heuristic_id: String,
    pub decision: String,
    pub reason: String,
    pub estimated_tokens: u32,
    pub daily_used_tokens: i64,
    pub daily_limit_tokens: i64,
    pub provider_tier: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AfpTokenBudgetLogContent {
    pub heuristic_id: String,
    pub tokens_used: i32,
    pub daily_total_after: i64,
    pub daily_limit: i64,
    pub usage_pct: f64,
    pub provider_tier: String,
    pub model_id: String,
}

// ── Map service AFP types ─────────────────────────────────────────────────────

pub const AFP_TYPE_MAP_RESULT: &str = "map_result";
pub const AFP_TYPE_LOCATION_EVENT: &str = "location_event";
pub const AFP_SUBTYPE_MAP_GEOCODE: &str = "geocode";
pub const AFP_SUBTYPE_MAP_PLACES: &str = "places";
pub const AFP_SUBTYPE_MAP_ROUTE: &str = "route";

// ── Schema proposal ───────────────────────────────────────────────────────────

pub const AFP_TYPE_SCHEMA_PROPOSAL: &str = "schema_proposal";
pub const AFP_SUBTYPE_SCHEMA_PROPOSAL_PROPOSE: &str = "propose";
pub const AFP_SUBTYPE_SCHEMA_PROPOSAL_APPROVE: &str = "approve";
pub const AFP_SUBTYPE_SCHEMA_PROPOSAL_REJECT: &str = "reject";
pub const AFP_SUBTYPE_SCHEMA_PROPOSAL_APPLY: &str = "apply";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpSupertag {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub fields: Vec<String>,
    #[serde(default)]
    pub inherits: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpFieldAddition {
    pub type_name: String,
    pub field_name: String,
    pub field_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub required: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpSchemaProposalContent {
    pub proposal_id: String,
    pub proposed_by: String,
    pub rationale: String,
    #[serde(default)]
    pub new_supertags: Vec<AfpSupertag>,
    #[serde(default)]
    pub field_additions: Vec<AfpFieldAddition>,
    #[serde(default)]
    pub deprecated_fields: Vec<String>,
    pub proposed_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpSchemaDecisionContent {
    pub proposal_id: String,
    pub decision: String,
    pub decided_by: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub applied_at: Option<String>,
}

// ── Goal progress subtypes ────────────────────────────────────────────────────

pub const AFP_SUBTYPE_GOAL_PROGRESS_MILESTONE: &str = "milestone";
pub const AFP_SUBTYPE_GOAL_PROGRESS_COMPLETE: &str = "complete";

// ── Tool verification ─────────────────────────────────────────────────────────

pub const AFP_TYPE_TOOL_VERIFICATION: &str = "tool_verification";
pub const AFP_SUBTYPE_TOOL_VERIFICATION_RESULT: &str = "verification_result";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpToolVerificationRequest {
    pub call_id: String,
    pub tool_name: String,
    pub parameters: Value,
    pub raw_result: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_schema: Option<Value>,
    #[serde(default)]
    pub mode: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpVerificationIssue {
    pub kind: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub severity: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpToolVerificationResult {
    pub call_id: String,
    pub valid: bool,
    pub confidence: f64,
    #[serde(default)]
    pub issues: Vec<AfpVerificationIssue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub corrected_result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retry_reason: Option<String>,
    #[serde(default)]
    pub verification_ms: u64,
}

// ── File ledger types ─────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpFileLedgerEntry {
    pub entry_id: String,
    pub seaweed_fid: String,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub status: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Plain-text searchable summary generated at ingestion time (OCR or extraction).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub searchable_summary: Option<String>,
    /// SHA-256 hex checksum of the raw file bytes as stored in SeaweedFS.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checksum: Option<String>,
    /// Monotonic version counter; incremented on each update to the same entry.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<u32>,
    /// Semantic kind label (e.g. "invoice", "contract", "image", "receipt").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// Supertag identifiers that classify this file in the knowledge graph.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub supertags: Vec<String>,
    /// Structured metadata bag — arbitrary key/value pairs for agent querying.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub searchable_metadata: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpFileLedgerContent {
    pub name: String,
    #[serde(default)]
    pub entries: Vec<AfpFileLedgerEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AfpFileLedgerUpdate {
    pub ledger_message_id: String,
    #[serde(default)]
    pub upsert: Vec<AfpFileLedgerEntry>,
    #[serde(default)]
    pub archive: Vec<String>,
}

// ── Export result / decision trace ────────────────────────────────────────────

pub const AFP_TYPE_EXPORT_RESULT: &str = "export_result";
pub const AFP_SUBTYPE_DECISION_TRACE: &str = "decision_trace";

// ── Tool result schema version ────────────────────────────────────────────────

pub const AFP_TOOL_RESULT_SCHEMA_V1: &str = "tool_result_v1";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn afp_node_message_families_executor_includes_progress() {
        let families = afp_node_message_families("executor");
        assert!(families.iter().any(|f| f.contains("node_progress")));
        assert!(families.iter().any(|f| f.contains("node_request")));
        assert!(families.iter().any(|f| f.contains("node_result")));
    }

    #[test]
    fn afp_node_message_families_approval_includes_decision() {
        let families = afp_node_message_families("approval");
        assert!(families.iter().any(|f| f.contains("decision_request")));
        assert!(families.iter().any(|f| f.contains("decision_result")));
    }

    #[test]
    fn afp_node_message_families_termination_includes_summary() {
        let families = afp_node_message_families("termination");
        assert!(families.iter().any(|f| f.contains("workflow_summary")));
    }

    #[test]
    fn afp_node_message_families_capability_router_includes_offer() {
        let families = afp_node_message_families("capability_router");
        assert!(families.iter().any(|f| f.contains("capability_offer")));
    }

    #[test]
    fn metadata_store_flag_defaults_true_for_empty() {
        assert!(metadata_store_flag(""));
        assert!(metadata_store_flag("  "));
    }

    #[test]
    fn metadata_store_flag_false_when_store_is_false() {
        assert!(!metadata_store_flag(r#"{"store": false}"#));
    }

    #[test]
    fn metadata_store_flag_true_when_store_is_true() {
        assert!(metadata_store_flag(r#"{"store": true}"#));
    }

    #[test]
    fn metadata_store_flag_true_when_store_absent() {
        assert!(metadata_store_flag(r#"{"other": "value"}"#));
    }

    #[test]
    fn topology_link_predicate_accepts_both_relation_families() {
        assert!(is_topology_link_message_type(AFP_TYPE_KNOWLEDGE_LINK));
        assert!(is_topology_link_message_type(AFP_TYPE_RELATION_LINK));
        assert!(!is_topology_link_message_type(AFP_TYPE_LEDGER));
    }

    #[test]
    fn unified_object_message_helper_distinguishes_durable_from_operational() {
        assert!(is_unified_object_message_type_and_kind(
            AFP_TYPE_LEDGER,
            Some("project")
        ));
        assert!(!is_unified_object_message_type_and_kind(
            AFP_TYPE_LEDGER,
            None
        ));
        assert!(!is_unified_object_message_type_and_kind(
            AFP_TYPE_RELATION_LINK,
            Some("project")
        ));
        assert!(is_operational_message_type(AFP_TYPE_RELATION_LINK));
        assert!(is_operational_message_type(AFP_TYPE_FILE_LEDGER));
        assert!(!is_operational_message_type(AFP_TYPE_LEDGER));
    }

    #[test]
    fn collect_search_facets_reads_metadata_and_supertags() {
        let metadata = serde_json::json!({
            "priority": "high",
            "tags": ["alpha"],
            "searchable_metadata": {
                "status": "active",
                "domain": "work"
            },
            "supertags": ["project:aurora"]
        });
        let content = serde_json::json!({
            "title": "Aurora",
            "metadata": {
                "confidence": 0.92,
                "owner": "ozan"
            }
        });
        let references = vec![serde_json::json!({
            "type": "supports",
            "target": "msg_2",
            "metadata": {
                "link_type": "part_of"
            }
        })];

        let facets = collect_search_facets_from_parts(
            Some(AFP_TYPE_LEDGER),
            Some("project"),
            Some("snapshot"),
            Some(&serde_json::json!(["project:aurora_top_level"])),
            Some(&metadata),
            Some(&content),
            &references,
        );

        assert_eq!(facets.message_type.as_deref(), Some(AFP_TYPE_LEDGER));
        assert_eq!(facets.kind.as_deref(), Some("project"));
        assert!(facets.supertags.contains(&"project:aurora".to_string()));
        assert!(
            facets
                .supertags
                .contains(&"project:aurora_top_level".to_string())
        );
        assert!(facets.reference_types.contains(&"supports".to_string()));
        assert!(facets.reference_targets.contains(&"msg_2".to_string()));
        assert!(facets.link_types.contains(&"part_of".to_string()));
        assert!(
            facets
                .metadata_keys
                .contains(&"metadata.searchable_metadata.status".to_string())
        );
        assert!(facets.metadata_values.contains(&"active".to_string()));
        assert!(facets.metadata_values.contains(&"0.92".to_string()));
        assert!(facets.metadata_terms.contains(&"status:active".to_string()));
        assert!(
            facets
                .metadata_terms
                .contains(&"confidence:0.92".to_string())
        );
    }

    #[test]
    fn parse_afp_references_uses_canonical_reference_shape() {
        let parsed = parse_afp_references(&[
            serde_json::json!({
                "type": "message",
                "target": "msg_project_aurora",
                "label": "Aurora",
                "metadata": {
                    "link_type": "part_of"
                }
            }),
            serde_json::json!({
                "target_id": "legacy_only_shape",
                "link_type": "related_to"
            }),
        ]);

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].r#type, "message");
        assert_eq!(parsed[0].target, "msg_project_aurora");
        assert_eq!(parsed[0].label.as_deref(), Some("Aurora"));
        assert_eq!(
            parsed[0]
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("link_type"))
                .and_then(Value::as_str),
            Some("part_of")
        );
    }

    #[test]
    fn normalize_message_for_storage_infers_kind_from_legacy_type() {
        let normalized = normalize_message_for_storage(AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "01J00000000000000000000001".to_string(),
            thread_id: "01J00000000000000000000002".to_string(),
            parent_id: None,
            from: "omnyid://user/test".to_string(),
            to: vec![],
            timestamp: "2026-06-16T00:00:00Z".to_string(),
            r#type: "task".to_string(),
            kind: None,
            supertags: vec![],
            subtype: None,
            content: serde_json::json!({
                "title": "Prepare renewal review",
                "status": "active",
                "supertags": ["project:renewal_2026"],
                "metadata": {
                    "owner": "ozan"
                }
            }),
            metadata: None,
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        });

        assert_eq!(normalized.kind.as_deref(), Some("task"));
        let metadata = normalized
            .metadata
            .as_ref()
            .and_then(Value::as_object)
            .expect("metadata object");
        assert_eq!(
            metadata.get("legacy_type").and_then(Value::as_str),
            Some("task")
        );
        let searchable = metadata
            .get("searchable_metadata")
            .and_then(Value::as_object)
            .expect("searchable metadata");
        assert_eq!(searchable.get("kind").and_then(Value::as_str), Some("task"));
        assert_eq!(
            normalized.supertags,
            vec!["project:renewal_2026".to_string()]
        );
        assert_eq!(
            searchable.get("title").and_then(Value::as_str),
            Some("Prepare renewal review")
        );
        assert_eq!(
            searchable.get("owner").and_then(Value::as_str),
            Some("ozan")
        );
    }

    #[test]
    fn normalize_message_for_storage_infers_ledger_kind_from_content() {
        let normalized = normalize_message_for_storage(AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "01J00000000000000000000003".to_string(),
            thread_id: "01J00000000000000000000004".to_string(),
            parent_id: None,
            from: "omnyid://user/test".to_string(),
            to: vec![],
            timestamp: "2026-06-16T00:00:00Z".to_string(),
            r#type: AFP_TYPE_LEDGER.to_string(),
            kind: None,
            supertags: vec![],
            subtype: Some("snapshot".to_string()),
            content: serde_json::json!({
                "kind": "project",
                "title": "Aurora",
                "supertags": ["project:aurora"]
            }),
            metadata: Some(serde_json::json!({})),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        });

        assert_eq!(normalized.kind.as_deref(), Some("project"));
        let searchable = normalized
            .metadata
            .as_ref()
            .and_then(|value| value.get("searchable_metadata"))
            .and_then(Value::as_object)
            .expect("searchable metadata");
        assert_eq!(
            searchable.get("message_type").and_then(Value::as_str),
            Some(AFP_TYPE_LEDGER)
        );
        assert_eq!(
            searchable.get("subtype").and_then(Value::as_str),
            Some("snapshot")
        );
        assert_eq!(
            searchable.get("kind").and_then(Value::as_str),
            Some("project")
        );
    }

    #[test]
    fn normalize_message_for_storage_mirrors_typed_refs_into_references() {
        let normalized = normalize_message_for_storage(AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "01J00000000000000000000005".to_string(),
            thread_id: "01J00000000000000000000006".to_string(),
            parent_id: None,
            from: "omnyid://user/test".to_string(),
            to: vec![],
            timestamp: "2026-06-16T00:00:00Z".to_string(),
            r#type: AFP_TYPE_LEDGER.to_string(),
            kind: Some("task".to_string()),
            supertags: vec![],
            subtype: None,
            content: serde_json::json!({
                "title": "Prepare renewal review"
            }),
            metadata: Some(serde_json::json!({})),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![serde_json::json!({
                "id": "msg_supporting_evidence",
                "ref_type": "supports",
                "thread_id": "thread_evidence",
                "label": "Supporting evidence"
            })],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        });

        let references = parse_afp_references(&normalized.references);
        assert_eq!(references.len(), 1);
        assert_eq!(references[0].r#type, "message");
        assert_eq!(references[0].target, "msg_supporting_evidence");
        assert_eq!(references[0].label.as_deref(), Some("Supporting evidence"));
        assert_eq!(
            references[0]
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("link_type"))
                .and_then(Value::as_str),
            Some("supports")
        );
        assert_eq!(
            references[0]
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("thread_id"))
                .and_then(Value::as_str),
            Some("thread_evidence")
        );
    }

    #[test]
    fn normalize_message_for_storage_deduplicates_existing_references_against_typed_refs() {
        let normalized = normalize_message_for_storage(AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "01J00000000000000000000007".to_string(),
            thread_id: "01J00000000000000000000008".to_string(),
            parent_id: None,
            from: "omnyid://user/test".to_string(),
            to: vec![],
            timestamp: "2026-06-16T00:00:00Z".to_string(),
            r#type: AFP_TYPE_LEDGER.to_string(),
            kind: Some("task".to_string()),
            supertags: vec![],
            subtype: None,
            content: serde_json::json!({
                "title": "Prepare renewal review"
            }),
            metadata: Some(serde_json::json!({})),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![serde_json::json!({
                "type": "message",
                "target": "msg_supporting_evidence",
                "metadata": {
                    "link_type": "supports"
                }
            })],
            typed_refs: vec![serde_json::json!({
                "id": "msg_supporting_evidence",
                "ref_type": "supports",
                "thread_id": "thread_evidence"
            })],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        });

        let references = parse_afp_references(&normalized.references);
        assert_eq!(references.len(), 1);
    }

    #[test]
    fn normalize_message_for_storage_promotes_suggested_actions_into_searchable_metadata() {
        let normalized = normalize_message_for_storage(AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "01J00000000000000000000009".to_string(),
            thread_id: "01J00000000000000000000010".to_string(),
            parent_id: None,
            from: "omnyid://user/test".to_string(),
            to: vec![],
            timestamp: "2026-06-26T00:00:00Z".to_string(),
            r#type: AFP_TYPE_LEDGER.to_string(),
            kind: Some("rich_note".to_string()),
            supertags: vec![],
            subtype: Some("prepared_draft".to_string()),
            content: serde_json::json!({
                "title": "Prepared reply",
                "suggested_actions": ["Review prepared reply", "Open source thread"]
            }),
            metadata: Some(serde_json::json!({})),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        });

        let searchable = normalized
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("searchable_metadata"))
            .and_then(Value::as_object)
            .expect("searchable metadata");
        let actions = searchable
            .get("suggested_actions")
            .and_then(Value::as_array)
            .expect("suggested actions array");

        assert_eq!(actions.len(), 2);
        assert_eq!(actions[0].as_str(), Some("Review prepared reply"));
        assert_eq!(actions[1].as_str(), Some("Open source thread"));
    }

    #[test]
    fn normalize_message_for_storage_promotes_memory_and_authorship_facets_into_searchable_metadata()
     {
        let normalized = normalize_message_for_storage(AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "01J00000000000000000000011".to_string(),
            thread_id: "01J00000000000000000000012".to_string(),
            parent_id: None,
            from: "omnyid://user/test".to_string(),
            to: vec![],
            timestamp: "2026-06-26T00:00:00Z".to_string(),
            r#type: AFP_TYPE_LEDGER.to_string(),
            kind: Some("relationship_note".to_string()),
            supertags: vec![],
            subtype: Some("agent_memory".to_string()),
            content: serde_json::json!({
                "title": "Relationship memory"
            }),
            metadata: Some(serde_json::json!({
                "memory_space": "work",
                "author_mask": "private",
                "author_type": "human",
                "author_id": "user_01"
            })),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        });

        let searchable = normalized
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("searchable_metadata"))
            .and_then(Value::as_object)
            .expect("searchable metadata");

        assert_eq!(
            searchable.get("memory_space").and_then(Value::as_str),
            Some("work")
        );
        assert_eq!(
            searchable.get("author_mask").and_then(Value::as_str),
            Some("private")
        );
        assert_eq!(
            searchable.get("author_type").and_then(Value::as_str),
            Some("human")
        );
        assert_eq!(
            searchable.get("author_id").and_then(Value::as_str),
            Some("user_01")
        );
        assert_eq!(
            searchable.get("is_human_authored").and_then(Value::as_bool),
            Some(true)
        );
    }

    #[test]
    fn afp_tool_call_metadata_round_trips() {
        let tc = AfpToolCallMetadata {
            call_id: "call_1".into(),
            connector_family: "mcp".into(),
            tool_name: "search_web".into(),
            parameters: serde_json::json!({"query": "test"}),
            ephemeral_result: true,
            mcp_server_url: Some("https://mcp.example.com".into()),
            a2a_agent_endpoint: None,
        };
        let j = serde_json::to_string(&tc).unwrap();
        let tc2: AfpToolCallMetadata = serde_json::from_str(&j).unwrap();
        assert_eq!(tc, tc2);
        assert!(!j.contains("a2a_agent_endpoint"));
    }

    #[test]
    fn afp_tool_result_metadata_round_trips() {
        let tr = AfpToolResultMetadata {
            call_id: "call_1".into(),
            status: "success".into(),
            data: Some(serde_json::json!({"result": "ok"})),
            error: None,
            tokens_used: 0,
            cost_cents: 5,
            latency_ms: 120,
            provider_request_id: Some("req_abc".into()),
        };
        let j = serde_json::to_string(&tr).unwrap();
        assert!(j.contains("cost_cents"));
        assert!(!j.contains("\"error\""));
    }
}
