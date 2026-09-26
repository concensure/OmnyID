/*
 * @module-id: workflow.instance-contracts
 * @primary-capability: workflow.instance-parameter-runtime-binding
 * @sub-capabilities: manifest-runtime-enrichment, supervisor-instruction-shaping, binding-normalization
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid-runtime
 */

use serde_json::{Map, Value};

use crate::{master_orchestrator::WorkflowNodeManifest, message::AFPMessage};

pub fn apply_runtime_instance_inputs_to_manifest(manifest_obj: &mut Map<String, Value>) -> usize {
    let Some(bindings) = manifest_instance_input_bindings(manifest_obj) else {
        return 0;
    };
    let parameter_keys = bindings
        .iter()
        .filter_map(|entry| entry.get("key").and_then(Value::as_str).map(str::to_string))
        .collect::<Vec<_>>();
    let resolved_values = bindings
        .iter()
        .filter_map(|entry| {
            let key = entry.get("key").and_then(Value::as_str)?;
            let value = entry.get("value")?.clone();
            Some((key.to_string(), value))
        })
        .collect::<Map<String, Value>>();
    let target_bindings = bindings
        .iter()
        .filter_map(|entry| {
            let key = entry.get("key").and_then(Value::as_str)?;
            let target_path = entry.get("target_path").and_then(Value::as_str)?;
            Some(serde_json::json!({
                "key": key,
                "target_path": target_path,
                "value_type": entry.get("value_type").cloned().unwrap_or(Value::Null),
            }))
        })
        .collect::<Vec<_>>();
    let semantic_role = manifest_obj
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|meta| meta.get("instance_input_semantic_role"))
        .and_then(Value::as_str);
    let family_id = manifest_obj
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|meta| meta.get("instance_input_family_id"))
        .and_then(Value::as_str);
    let family_workflow_id = manifest_obj
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|meta| meta.get("instance_input_family_workflow_id"))
        .and_then(Value::as_str);
    let family_asset_workflow_id = manifest_obj
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|meta| meta.get("instance_input_family_asset_workflow_id"))
        .and_then(Value::as_str);
    let instance_workflow_id = manifest_obj
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|meta| meta.get("instance_input_instance_workflow_id"))
        .and_then(Value::as_str);
    let template_binding = manifest_obj
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|meta| meta.get("instance_input_template_binding"))
        .cloned()
        .unwrap_or(Value::Null);

    let runtime_payload = serde_json::json!({
        "source": "workflow_family_instance",
        "semantic_role": semantic_role,
        "family_id": family_id,
        "family_workflow_id": family_workflow_id,
        "family_asset_workflow_id": family_asset_workflow_id,
        "instance_workflow_id": instance_workflow_id,
        "parameter_keys": parameter_keys,
        "values": resolved_values,
        "target_bindings": target_bindings,
        "template_binding": template_binding,
    });

    let connector_binding = manifest_obj
        .entry("connector_binding".to_string())
        .or_insert_with(|| serde_json::json!({}));
    if let Some(binding_obj) = connector_binding.as_object_mut() {
        let runtime_defaults = binding_obj
            .entry("runtime_defaults".to_string())
            .or_insert_with(|| serde_json::json!({}));
        if let Some(runtime_defaults_obj) = runtime_defaults.as_object_mut() {
            runtime_defaults_obj.insert("instance_inputs".to_string(), runtime_payload.clone());
        }
        let runtime_context = binding_obj
            .entry("runtime_context".to_string())
            .or_insert_with(|| serde_json::json!({}));
        if let Some(runtime_context_obj) = runtime_context.as_object_mut() {
            runtime_context_obj.insert("instance_inputs".to_string(), runtime_payload.clone());
        }
    }

    let runtime_context = manifest_obj
        .entry("runtime_context".to_string())
        .or_insert_with(|| serde_json::json!({}));
    if let Some(runtime_context_obj) = runtime_context.as_object_mut() {
        runtime_context_obj.insert("instance_inputs".to_string(), runtime_payload);
    }

    bindings.len()
}

pub fn task_graph_content_with_instance_inputs(
    manifest: &Value,
    runtime_kind: &str,
    label: &str,
) -> String {
    let Some(bindings) = manifest_instance_input_bindings_from_value(manifest) else {
        return format!("Execute {runtime_kind} node: {label}");
    };
    let mut rendered = bindings
        .iter()
        .filter_map(|entry| {
            let key = entry.get("key").and_then(Value::as_str)?;
            let value = entry.get("value").and_then(value_as_inline_text)?;
            Some(format!("{key}={value}"))
        })
        .collect::<Vec<_>>();
    if rendered.is_empty() {
        return format!("Execute {runtime_kind} node: {label}");
    }
    rendered.sort();
    format!(
        "Execute {runtime_kind} node: {label}. Instance inputs: {}",
        rendered.join(", ")
    )
}

pub fn workflow_node_manifests_from_ir(ir: &Value) -> Vec<WorkflowNodeManifest> {
    ir.get("manifests")
        .and_then(Value::as_array)
        .map(|manifests| {
            manifests
                .iter()
                .filter_map(Value::as_object)
                .map(|manifest_obj| {
                    let metadata = manifest_obj.get("metadata").and_then(Value::as_object);
                    let policy = manifest_obj.get("policy").and_then(Value::as_object);
                    let prompt = manifest_obj.get("prompt").and_then(Value::as_object);
                    WorkflowNodeManifest {
                        node_id: manifest_obj
                            .get("node_id")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        kind: manifest_obj
                            .get("runtime_kind")
                            .and_then(Value::as_str)
                            .unwrap_or("executor")
                            .to_string(),
                        allowed_capabilities: policy
                            .and_then(|entry| entry.get("allowed_capabilities"))
                            .and_then(Value::as_array)
                            .map(|items| {
                                items
                                    .iter()
                                    .filter_map(Value::as_str)
                                    .map(str::to_string)
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default(),
                        outbound_allowlist: policy
                            .and_then(|entry| entry.get("outbound_allowlist"))
                            .and_then(Value::as_array)
                            .map(|items| {
                                items
                                    .iter()
                                    .filter_map(Value::as_str)
                                    .map(str::to_string)
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default(),
                        system_prompt: prompt
                            .and_then(|entry| entry.get("system_prompt"))
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        instruction_prompt: prompt
                            .and_then(|entry| entry.get("instruction_prompt"))
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        semantic_role: metadata
                            .and_then(|entry| entry.get("instance_input_semantic_role"))
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        workflow_family_id: metadata
                            .and_then(|entry| entry.get("instance_input_family_id"))
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        family_workflow_id: metadata
                            .and_then(|entry| entry.get("instance_input_family_workflow_id"))
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        instance_inputs: metadata
                            .and_then(|entry| entry.get("instance_input_bindings"))
                            .and_then(Value::as_array)
                            .map(|items| {
                                items
                                    .iter()
                                    .filter_map(|entry| {
                                        Some((
                                            entry.get("key")?.as_str()?.to_string(),
                                            value_as_inline_text(entry.get("value")?)?,
                                        ))
                                    })
                                    .collect()
                            })
                            .unwrap_or_default(),
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

pub fn apply_manifest_instance_inputs_to_prompts(
    manifest: Option<&WorkflowNodeManifest>,
    system_prompt: Option<String>,
    instruction_prompt: Option<String>,
) -> (Option<String>, Option<String>) {
    let Some(manifest) = manifest else {
        return (system_prompt, instruction_prompt);
    };
    let Some(summary) = manifest_instance_summary(manifest) else {
        return (system_prompt, instruction_prompt);
    };
    let mut next_system = system_prompt;
    let next_instruction = if let Some(existing) = instruction_prompt {
        Some(format!("{existing}\n\n{summary}"))
    } else {
        Some(summary.clone())
    };
    if next_system.is_none() {
        next_system = Some(format!(
            "Workflow family context is active. Respect the node-specific instance inputs.\n{summary}"
        ));
    }
    (next_system, next_instruction)
}

pub fn workflow_family_context_from_manifest(manifest: Option<&Value>) -> Option<Value> {
    let metadata = manifest?.get("metadata")?.as_object()?;
    workflow_family_context_from_metadata(metadata)
}

pub fn workflow_family_context_from_message(message: &AFPMessage) -> Option<Value> {
    workflow_family_context_from_value(message.content.get("workflow_family_context"))
        .or_else(|| {
            workflow_family_context_from_value(message.content.get("approval_family_context"))
        })
        .or_else(|| {
            workflow_family_context_from_value(message.content.get("wait_resume_family_context"))
        })
        .or_else(|| {
            workflow_family_context_from_value(
                message
                    .metadata
                    .as_ref()
                    .and_then(|meta| meta.get("workflow_family_context")),
            )
        })
        .or_else(|| {
            message.views.iter().find_map(|view| {
                workflow_family_context_from_value(
                    view.get("content")
                        .and_then(|content| content.get("workflow_family_context")),
                )
            })
        })
}

pub fn workflow_family_context_from_json(value: &Value) -> Option<Value> {
    workflow_family_context_from_value(Some(value))
        .or_else(|| workflow_family_context_from_value(value.get("workflow_family_context")))
        .or_else(|| workflow_family_context_from_value(value.get("approval_family_context")))
        .or_else(|| workflow_family_context_from_value(value.get("wait_resume_family_context")))
}

pub fn attach_workflow_family_context(target: &mut Value, context: Option<&Value>) {
    let Some(context) = context.cloned() else {
        return;
    };
    let Some(target_obj) = target.as_object_mut() else {
        return;
    };
    target_obj.insert("workflow_family_context".to_string(), context);
}

pub fn build_workflow_family_context(
    semantic_role: Option<&str>,
    family_id: Option<&str>,
    family_workflow_id: Option<&str>,
    family_asset_workflow_id: Option<&str>,
    instance_workflow_id: Option<&str>,
    values: Map<String, Value>,
) -> Option<Value> {
    normalized_workflow_family_context(
        semantic_role.map(str::to_string),
        family_id.map(str::to_string),
        family_workflow_id.map(str::to_string),
        family_asset_workflow_id.map(str::to_string),
        instance_workflow_id.map(str::to_string),
        values,
    )
}

fn manifest_instance_input_bindings(manifest_obj: &Map<String, Value>) -> Option<Vec<Value>> {
    manifest_obj
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|meta| meta.get("instance_input_bindings"))
        .and_then(Value::as_array)
        .cloned()
}

fn manifest_instance_input_bindings_from_value(manifest: &Value) -> Option<Vec<Value>> {
    manifest
        .as_object()
        .and_then(manifest_instance_input_bindings)
}

fn value_as_inline_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn manifest_instance_summary(manifest: &WorkflowNodeManifest) -> Option<String> {
    if manifest.instance_inputs.is_empty()
        && manifest.semantic_role.is_none()
        && manifest.workflow_family_id.is_none()
    {
        return None;
    }
    let mut lines = Vec::new();
    if let Some(role) = manifest.semantic_role.as_deref() {
        lines.push(format!("Semantic role: {role}."));
    }
    if let Some(family) = manifest.workflow_family_id.as_deref() {
        lines.push(format!("Workflow family: {family}."));
    }
    if let Some(source_workflow) = manifest.family_workflow_id.as_deref() {
        lines.push(format!("Family source workflow: {source_workflow}."));
    }
    if !manifest.instance_inputs.is_empty() {
        let mut pairs = manifest
            .instance_inputs
            .iter()
            .map(|(key, value)| format!("{key}={value}"))
            .collect::<Vec<_>>();
        pairs.sort();
        lines.push(format!("Instance inputs: {}.", pairs.join(", ")));
    }
    Some(lines.join(" "))
}

fn workflow_family_context_from_metadata(metadata: &Map<String, Value>) -> Option<Value> {
    let semantic_role = metadata
        .get("instance_input_semantic_role")
        .and_then(Value::as_str)
        .map(str::to_string);
    let family_id = metadata
        .get("instance_input_family_id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let family_workflow_id = metadata
        .get("instance_input_family_workflow_id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let family_asset_workflow_id = metadata
        .get("instance_input_family_asset_workflow_id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let instance_workflow_id = metadata
        .get("instance_input_instance_workflow_id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let values = metadata
        .get("instance_input_bindings")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|entry| {
                    Some((
                        entry.get("key")?.as_str()?.to_string(),
                        entry.get("value")?.clone(),
                    ))
                })
                .collect::<Map<String, Value>>()
        })
        .unwrap_or_default();
    normalized_workflow_family_context(
        semantic_role,
        family_id,
        family_workflow_id,
        family_asset_workflow_id,
        instance_workflow_id,
        values,
    )
}

fn workflow_family_context_from_value(value: Option<&Value>) -> Option<Value> {
    let entry = value?.as_object()?;
    let semantic_role = entry
        .get("semantic_role")
        .and_then(Value::as_str)
        .map(str::to_string);
    let family_id = entry
        .get("family_id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let family_workflow_id = entry
        .get("family_workflow_id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let family_asset_workflow_id = entry
        .get("family_asset_workflow_id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let instance_workflow_id = entry
        .get("instance_workflow_id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let values = entry
        .get("values")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    normalized_workflow_family_context(
        semantic_role,
        family_id,
        family_workflow_id,
        family_asset_workflow_id,
        instance_workflow_id,
        values,
    )
}

fn normalized_workflow_family_context(
    semantic_role: Option<String>,
    family_id: Option<String>,
    family_workflow_id: Option<String>,
    family_asset_workflow_id: Option<String>,
    instance_workflow_id: Option<String>,
    values: Map<String, Value>,
) -> Option<Value> {
    if semantic_role.is_none()
        && family_id.is_none()
        && family_workflow_id.is_none()
        && family_asset_workflow_id.is_none()
        && instance_workflow_id.is_none()
        && values.is_empty()
    {
        return None;
    }
    Some(serde_json::json!({
        "semantic_role": semantic_role,
        "family_id": family_id,
        "family_workflow_id": family_workflow_id,
        "family_asset_workflow_id": family_asset_workflow_id,
        "instance_workflow_id": instance_workflow_id,
        "values": values,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_runtime_instance_inputs_to_manifest_inserts_runtime_payloads() {
        let mut manifest = serde_json::json!({
            "metadata": {
                "instance_input_bindings": [
                    {
                        "key": "location_query",
                        "value": "Sydney",
                        "target_path": "config.location_query",
                        "value_type": "string"
                    }
                ],
                "instance_input_semantic_role": "weather_source",
                "instance_input_family_id": "family_weather",
                "instance_input_family_workflow_id": "wf_weather_base",
                "instance_input_template_binding": {
                    "template_id": "weather_to_chart",
                    "slot_name": "source_slot"
                }
            },
            "connector_binding": {}
        })
        .as_object()
        .expect("manifest object")
        .clone();

        let applied = apply_runtime_instance_inputs_to_manifest(&mut manifest);
        assert_eq!(applied, 1);
        assert_eq!(
            manifest["connector_binding"]["runtime_defaults"]["instance_inputs"]["values"]
                ["location_query"]
                .as_str(),
            Some("Sydney")
        );
        assert_eq!(
            manifest["runtime_context"]["instance_inputs"]["semantic_role"].as_str(),
            Some("weather_source")
        );
    }

    #[test]
    fn task_graph_content_with_instance_inputs_appends_inline_summary() {
        let manifest = serde_json::json!({
            "metadata": {
                "instance_input_bindings": [
                    {"key": "chart_type", "value": "line"},
                    {"key": "forecast_days", "value": "5"}
                ]
            }
        });
        let content =
            task_graph_content_with_instance_inputs(&manifest, "executor", "Forecast chart");
        assert!(content.contains("chart_type=line"));
        assert!(content.contains("forecast_days=5"));
    }

    #[test]
    fn workflow_node_manifests_from_ir_reads_instance_fields() {
        let ir = serde_json::json!({
            "manifests": [
                {
                    "node_id": "mf_weather",
                    "runtime_kind": "executor",
                    "policy": {
                        "allowed_capabilities": ["weather"],
                        "outbound_allowlist": ["api.open-meteo.com"]
                    },
                    "metadata": {
                        "instance_input_semantic_role": "weather_source",
                        "instance_input_family_id": "family_weather",
                        "instance_input_family_workflow_id": "wf_weather_template",
                        "instance_input_bindings": [
                            {"key": "location_query", "value": "Sydney"},
                            {"key": "forecast_days", "value": "5"}
                        ]
                    },
                    "prompt": {
                        "instruction_prompt": "Generate the forecast."
                    }
                }
            ]
        });
        let manifests = workflow_node_manifests_from_ir(&ir);
        assert_eq!(manifests.len(), 1);
        assert_eq!(
            manifests[0].semantic_role.as_deref(),
            Some("weather_source")
        );
        assert_eq!(
            manifests[0].workflow_family_id.as_deref(),
            Some("family_weather")
        );
        assert_eq!(
            manifests[0]
                .instance_inputs
                .get("location_query")
                .map(String::as_str),
            Some("Sydney")
        );
    }

    #[test]
    fn apply_manifest_instance_inputs_to_prompts_appends_summary() {
        let manifest = WorkflowNodeManifest {
            node_id: "mf_weather".into(),
            kind: "executor".into(),
            allowed_capabilities: vec![],
            outbound_allowlist: vec![],
            system_prompt: None,
            instruction_prompt: None,
            semantic_role: Some("weather_source".into()),
            workflow_family_id: Some("family_weather".into()),
            family_workflow_id: Some("wf_weather_template".into()),
            instance_inputs: [("location_query".to_string(), "Sydney".to_string())]
                .into_iter()
                .collect(),
        };
        let (system_prompt, instruction_prompt) =
            apply_manifest_instance_inputs_to_prompts(Some(&manifest), None, None);
        assert!(
            system_prompt
                .as_deref()
                .unwrap_or_default()
                .contains("Workflow family context is active")
        );
        assert!(
            instruction_prompt
                .as_deref()
                .unwrap_or_default()
                .contains("location_query=Sydney")
        );
    }

    #[test]
    fn workflow_family_context_from_manifest_extracts_normalized_payload() {
        let manifest = serde_json::json!({
            "metadata": {
                "instance_input_semantic_role": "weather_source",
                "instance_input_family_id": "family_weather",
                "instance_input_family_workflow_id": "wf_weather_template",
                "instance_input_bindings": [
                    {"key": "location_query", "value": "Sydney"}
                ]
            }
        });
        let context = workflow_family_context_from_manifest(Some(&manifest)).expect("context");
        assert_eq!(context["family_id"].as_str(), Some("family_weather"));
        assert_eq!(context["values"]["location_query"].as_str(), Some("Sydney"));
    }

    #[test]
    fn workflow_family_context_from_message_prefers_direct_context() {
        let message = AFPMessage {
            protocol: "afp".into(),
            id: "msg_weather".into(),
            thread_id: "thread_weather".into(),
            parent_id: None,
            from: "omnyid://server".into(),
            to: vec![],
            timestamp: "2026-01-01T00:00:00Z".into(),
            r#type: "chart_spec".into(),
            kind: None,
            supertags: vec![],
            subtype: None,
            content: serde_json::json!({
                "workflow_family_context": {
                    "semantic_role": "chart_output",
                    "family_id": "family_weather",
                    "family_workflow_id": "wf_weather_template",
                    "values": {
                        "chart_type": "line"
                    }
                }
            }),
            metadata: None,
            views: vec![],
            typed_refs: vec![],
            attachments: vec![],
            references: vec![],
            store_in_relational: false,
            encryption: None,
            signature: String::new(),
            prev_hash: None,
        };
        let context = workflow_family_context_from_message(&message).expect("context");
        assert_eq!(context["semantic_role"].as_str(), Some("chart_output"));
        assert_eq!(context["values"]["chart_type"].as_str(), Some("line"));
    }
}
