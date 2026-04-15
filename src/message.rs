use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── Message types ─────────────────────────────────────────────────────────────
pub const AFP_TYPE_FOLDER_RULE: &str = "folder_rule";
pub const AFP_TYPE_AREA_RULES: &str = "area_rules";
pub const AFP_TYPE_TAG_UPDATE: &str = "tag_update";
pub const AFP_TYPE_BACKLINK_OVERRIDE: &str = "backlink_override";
pub const AFP_TYPE_SUPERTAG_DEFINITION: &str = "supertag_definition";

// ── Trigger subtypes ──────────────────────────────────────────────────────────
pub const AFP_SUBTYPE_TRIGGER_REQUEST: &str = "trigger_request";
pub const AFP_SUBTYPE_TRIGGER_DISPATCH: &str = "trigger_dispatch";
pub const AFP_SUBTYPE_TRIGGER_INITIATION: &str = "trigger_initiation";
pub const AFP_SUBTYPE_EVENT_DISPATCH: &str = "event_dispatch";
pub const AFP_SUBTYPE_WAKE_REQUEST: &str = "wake_request";
pub const AFP_SUBTYPE_WAKE_RESULT: &str = "wake_result";
pub const AFP_SUBTYPE_WAKE_DISPATCH: &str = "wake_dispatch";
pub const AFP_SUBTYPE_APPROVAL_DECISION: &str = "approval_decision";

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
    pub attachments: Vec<serde_json::Value>,
    #[serde(default)]
    pub store_in_relational: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prev_hash: Option<String>,
}

fn default_protocol() -> String {
    "afp-v1".to_string()
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
        "Merge" | "merge" => vec![
            s(AFP_SUBTYPE_NODE_REQUEST),
            s(AFP_SUBTYPE_NODE_RESULT),
        ],
        "Termination" | "termination" => vec![
            s(AFP_SUBTYPE_NODE_RESULT),
            s(AFP_SUBTYPE_WORKFLOW_SUMMARY),
        ],
        "CapabilityRouter" | "capability_router" => vec![
            s(AFP_SUBTYPE_CAPABILITY_OFFER),
            s(AFP_SUBTYPE_NODE_REQUEST),
            s(AFP_SUBTYPE_NODE_RESULT),
        ],
        // Unknown kinds get the minimal executor set.
        _ => vec![
            s(AFP_SUBTYPE_NODE_REQUEST),
            s(AFP_SUBTYPE_NODE_RESULT),
        ],
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
