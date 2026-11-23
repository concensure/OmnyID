/*
 * @module-id: server.workflow-connector-bindings
 * @primary-capability: workflow.connector-family-normalization
 * @sub-capabilities: connector-inference, integration-family-mapping, manifest-capability-resolution
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid-server
 */

use serde_json::{Map, Value};

pub(crate) const CONNECTOR_FAMILY_SKILL_CAPSULE: &str = "skill_capsule";

pub(crate) fn normalized_connector_family(
    config: Option<&Map<String, Value>>,
    graph_node_kind: &str,
) -> Option<String> {
    if let Some(configured) = config
        .and_then(|entry| entry.get("connector_family"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        return Some(configured.to_string());
    }

    if graph_node_kind == "tool" && is_skill_capsule_config(config) {
        return Some(CONNECTOR_FAMILY_SKILL_CAPSULE.to_string());
    }

    None
}

pub(crate) fn execution_path_for_connector(
    connector_family: Option<&str>,
    graph_node_kind: &str,
) -> &'static str {
    match connector_family {
        Some("openai_function")
        | Some("mcp")
        | Some("internal")
        | Some(CONNECTOR_FAMILY_SKILL_CAPSULE) => "direct_http",
        Some("a2a") => "delegation",
        _ if graph_node_kind == "tool" => "direct_http",
        _ if graph_node_kind == "delegation" => "delegation",
        _ if graph_node_kind == "policy" => "policy_runtime",
        _ if graph_node_kind == "approval" => "approval_runtime",
        _ if graph_node_kind == "merge" => "merge_runtime",
        _ if graph_node_kind == "termination" => "termination_runtime",
        _ if graph_node_kind == "trigger" => "runtime_dispatch",
        _ => "llm_agent",
    }
}

pub(crate) fn integration_family_for_binding(
    connector_family: Option<&str>,
    capability_id: Option<&str>,
) -> &'static str {
    if let Some(family) = connector_family {
        return match family {
            "openai_function" | "mcp" => "ai_services",
            "a2a" => "agent_delegation",
            CONNECTOR_FAMILY_SKILL_CAPSULE => "skill_runtime",
            _ => "integration",
        };
    }

    match capability_id {
        Some("email") => "communications",
        Some("calendar") => "scheduling",
        Some("document_extract") => "document_processing",
        Some("web_search") => "research",
        Some("finance") => "finance",
        Some("travel") => "travel",
        Some("skill_capsule") => "skill_runtime",
        Some(_) => "integration",
        None => "orchestration",
    }
}

pub(crate) fn manifest_primary_capability_id(manifest: &Map<String, Value>) -> Option<String> {
    manifest
        .get("capability_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or_else(|| {
            manifest
                .get("connector_binding")
                .and_then(Value::as_object)
                .and_then(|binding| binding.get("capability_id"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .map(str::to_string)
        })
}

pub(crate) fn manifest_primary_connector_family(manifest: &Map<String, Value>) -> Option<String> {
    manifest
        .get("connector_family")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or_else(|| {
            manifest
                .get("connector_binding")
                .and_then(Value::as_object)
                .and_then(|binding| binding.get("connector_family"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .map(str::to_string)
        })
}

pub(crate) fn skill_capsule_service_name(config: Option<&Map<String, Value>>) -> Option<String> {
    let operation = config
        .and_then(|entry| entry.get("operation"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty());
    let atom_id = config
        .and_then(|entry| entry.get("atom_id"))
        .and_then(Value::as_str)
        .or_else(|| {
            config
                .and_then(|entry| entry.get("skill_capsule_atom_id"))
                .and_then(Value::as_str)
        })
        .filter(|value| !value.trim().is_empty());

    match (operation, atom_id) {
        (Some(op), Some(atom)) => Some(format!("skill_capsule/{op}/{atom}")),
        (Some(op), None) => Some(format!("skill_capsule/{op}")),
        (None, Some(atom)) => Some(format!("skill_capsule/atom/{atom}")),
        (None, None) => None,
    }
}

fn is_skill_capsule_config(config: Option<&Map<String, Value>>) -> bool {
    config
        .and_then(|entry| entry.get("capability_id"))
        .and_then(Value::as_str)
        .map(|value| value == "skill_capsule")
        .unwrap_or(false)
        || config
            .and_then(|entry| entry.get("atom_id"))
            .and_then(Value::as_str)
            .is_some()
        || config
            .and_then(|entry| entry.get("skill_capsule_atom_id"))
            .and_then(Value::as_str)
            .is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalized_connector_family_infers_skill_capsule_for_tool_node() {
        let config = serde_json::json!({
            "capability_id": "skill_capsule",
            "operation": "compose"
        });
        let family = normalized_connector_family(config.as_object(), "tool");
        assert_eq!(family.as_deref(), Some(CONNECTOR_FAMILY_SKILL_CAPSULE));
    }

    #[test]
    fn manifest_primary_capability_id_falls_back_to_connector_binding() {
        let manifest = serde_json::json!({
            "connector_binding": {
                "capability_id": "skill_capsule",
                "connector_family": "skill_capsule"
            }
        });
        let capability = manifest_primary_capability_id(manifest.as_object().expect("manifest"));
        assert_eq!(capability.as_deref(), Some("skill_capsule"));
    }

    #[test]
    fn skill_capsule_service_name_includes_operation_and_atom() {
        let config = serde_json::json!({
            "capability_id": "skill_capsule",
            "operation": "prepare",
            "atom_id": "code.edit.safe"
        });
        let service = skill_capsule_service_name(config.as_object());
        assert_eq!(
            service.as_deref(),
            Some("skill_capsule/prepare/code.edit.safe")
        );
    }

    #[test]
    fn integration_family_marks_skill_capsule_runtime() {
        assert_eq!(
            integration_family_for_binding(Some(CONNECTOR_FAMILY_SKILL_CAPSULE), None),
            "skill_runtime"
        );
    }
}
