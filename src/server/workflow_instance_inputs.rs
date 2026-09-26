/*
 * @module-id: server.workflow-instance-inputs
 * @primary-capability: server.workflow.instance-parameter-binding
 * @sub-capabilities: semantic-role-binding, manifest-input-schema, family-instance-contracts
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid-server
 */

use std::collections::BTreeMap;

use serde_json::{Map, Value};

#[derive(Clone, Debug, PartialEq, Eq)]
struct WorkflowInstanceInputsContract {
    family_id: Option<String>,
    family_workflow_id: Option<String>,
    family_asset_workflow_id: Option<String>,
    instance_workflow_id: Option<String>,
    values: BTreeMap<String, String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ParameterBindingSpec {
    key: &'static str,
    value_type: &'static str,
    target_path: &'static str,
    label: &'static str,
    required: bool,
}

const ROLE_DOCUMENT_SOURCE: &str = "document_source";
const ROLE_PDF_SOURCE: &str = "pdf_source";
const ROLE_MEETING_SOURCE: &str = "meeting_source";
const ROLE_WEATHER_SOURCE: &str = "weather_source";
const ROLE_BUDGET_SOURCE: &str = "budget_source";
const ROLE_SPREADSHEET_OUTPUT: &str = "spreadsheet_output";
const ROLE_CHART_OUTPUT: &str = "chart_output";
const ROLE_DIGEST_OUTPUT: &str = "digest_output";
const ROLE_REVIEW_STEP: &str = "review_step";

pub(super) fn workflow_instance_input_bindings_for_node(
    node: &Map<String, Value>,
    template_binding: Option<(&str, &str)>,
    graph_instance_inputs: &Value,
) -> Option<Value> {
    let instance_inputs = parse_instance_inputs(graph_instance_inputs)?;
    let semantic_role = node_semantic_role(node)?;
    let parameter_specs = parameter_specs_for_role(semantic_role);
    if parameter_specs.is_empty() {
        return None;
    }

    let parameters = parameter_specs
        .iter()
        .filter_map(|spec| {
            instance_inputs.values.get(spec.key).map(|value| {
                serde_json::json!({
                    "key": spec.key,
                    "label": spec.label,
                    "value": value,
                    "value_type": spec.value_type,
                    "target_path": spec.target_path,
                    "required": spec.required,
                    "source": "workflow_instance_input",
                })
            })
        })
        .collect::<Vec<_>>();
    if parameters.is_empty() {
        return None;
    }

    let required = parameter_specs
        .iter()
        .filter(|spec| spec.required && instance_inputs.values.contains_key(spec.key))
        .map(|spec| Value::String(spec.key.to_string()))
        .collect::<Vec<_>>();
    let properties = parameter_specs
        .iter()
        .filter_map(|spec| {
            instance_inputs.values.get(spec.key).map(|value| {
                (
                    spec.key.to_string(),
                    serde_json::json!({
                        "type": spec.value_type,
                        "title": spec.label,
                        "default": value,
                        "target_path": spec.target_path,
                        "required": spec.required,
                        "source": "workflow_instance_input",
                    }),
                )
            })
        })
        .collect::<Map<String, Value>>();

    let mut payload = serde_json::json!({
        "family_id": instance_inputs.family_id,
        "family_workflow_id": instance_inputs.family_workflow_id,
        "family_asset_workflow_id": instance_inputs.family_asset_workflow_id,
        "instance_workflow_id": instance_inputs.instance_workflow_id,
        "semantic_role": semantic_role,
        "parameter_keys": parameters
            .iter()
            .filter_map(|entry| entry.get("key").and_then(Value::as_str).map(str::to_string))
            .collect::<Vec<_>>(),
        "parameters": parameters,
        "input_schema": {
            "type": "object",
            "title": format!("{semantic_role} instance inputs"),
            "semantic_role": semantic_role,
            "properties": properties,
            "required": required,
        }
    });
    if let Some((template_id, slot_name)) = template_binding {
        if let Some(obj) = payload.as_object_mut() {
            obj.insert(
                "template_binding".to_string(),
                serde_json::json!({
                    "template_id": template_id,
                    "slot_name": slot_name,
                }),
            );
        }
        if let Some(schema_obj) = payload
            .get_mut("input_schema")
            .and_then(Value::as_object_mut)
        {
            schema_obj.insert(
                "template_binding".to_string(),
                serde_json::json!({
                    "template_id": template_id,
                    "slot_name": slot_name,
                }),
            );
        }
    }
    Some(payload)
}

pub(super) fn workflow_instance_input_key_count(graph_instance_inputs: &Value) -> usize {
    parse_instance_inputs(graph_instance_inputs)
        .map(|inputs| inputs.values.len())
        .unwrap_or(0)
}

fn parse_instance_inputs(value: &Value) -> Option<WorkflowInstanceInputsContract> {
    let obj = value.as_object()?;
    let values = obj
        .get("values")
        .and_then(Value::as_object)?
        .iter()
        .filter_map(|(key, value)| value.as_str().map(|v| (key.clone(), v.to_string())))
        .collect::<BTreeMap<_, _>>();
    Some(WorkflowInstanceInputsContract {
        family_id: obj
            .get("family_id")
            .and_then(Value::as_str)
            .map(str::to_string),
        family_workflow_id: obj
            .get("family_workflow_id")
            .and_then(Value::as_str)
            .map(str::to_string),
        family_asset_workflow_id: obj
            .get("family_asset_workflow_id")
            .and_then(Value::as_str)
            .map(str::to_string),
        instance_workflow_id: obj
            .get("instance_workflow_id")
            .and_then(Value::as_str)
            .map(str::to_string),
        values,
    })
}

fn node_semantic_role(node: &Map<String, Value>) -> Option<&str> {
    let metadata = node.get("metadata").and_then(Value::as_object)?;
    metadata
        .get("semantic_role")
        .and_then(Value::as_str)
        .or_else(|| metadata.get("semantic_node_kind").and_then(Value::as_str))
}

fn parameter_specs_for_role(semantic_role: &str) -> &'static [ParameterBindingSpec] {
    match semantic_role {
        ROLE_PDF_SOURCE | ROLE_DOCUMENT_SOURCE => &[ParameterBindingSpec {
            key: "source_kind",
            value_type: "string",
            target_path: "config.source_kind",
            label: "Source kind",
            required: true,
        }],
        ROLE_MEETING_SOURCE => &[ParameterBindingSpec {
            key: "meeting_source_kind",
            value_type: "string",
            target_path: "config.source_kind",
            label: "Meeting source kind",
            required: true,
        }],
        ROLE_WEATHER_SOURCE => &[
            ParameterBindingSpec {
                key: "location_query",
                value_type: "string",
                target_path: "config.location_query",
                label: "Location query",
                required: true,
            },
            ParameterBindingSpec {
                key: "forecast_days",
                value_type: "integer",
                target_path: "config.forecast_days",
                label: "Forecast days",
                required: false,
            },
        ],
        ROLE_BUDGET_SOURCE => &[
            ParameterBindingSpec {
                key: "horizon_months",
                value_type: "integer",
                target_path: "config.horizon_months",
                label: "Projection horizon",
                required: false,
            },
            ParameterBindingSpec {
                key: "currency",
                value_type: "string",
                target_path: "config.currency",
                label: "Currency",
                required: false,
            },
        ],
        ROLE_SPREADSHEET_OUTPUT => &[ParameterBindingSpec {
            key: "export_format",
            value_type: "string",
            target_path: "config.final_schema.formats[]",
            label: "Export format",
            required: true,
        }],
        ROLE_CHART_OUTPUT => &[ParameterBindingSpec {
            key: "chart_type",
            value_type: "string",
            target_path: "config.final_schema.preferred_chart_type",
            label: "Chart type",
            required: true,
        }],
        ROLE_DIGEST_OUTPUT => &[ParameterBindingSpec {
            key: "digest_style",
            value_type: "string",
            target_path: "config.final_schema.digest_kind",
            label: "Digest style",
            required: true,
        }],
        ROLE_REVIEW_STEP => &[ParameterBindingSpec {
            key: "review_mode",
            value_type: "string",
            target_path: "policy.approval_mode",
            label: "Review mode",
            required: false,
        }],
        _ => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workflow_instance_input_bindings_match_weather_semantic_role() {
        let node = serde_json::json!({
            "id": "weather",
            "kind": "tool",
            "metadata": {
                "semantic_role": "weather_source"
            }
        });
        let instance_inputs = serde_json::json!({
            "family_id": "family_weather",
            "family_workflow_id": "wf_weather_base",
            "family_asset_workflow_id": "wf_weather_asset",
            "instance_workflow_id": "wf_weather_instance",
            "values": {
                "location_query": "Sydney",
                "forecast_days": "5"
            }
        });

        let bindings = workflow_instance_input_bindings_for_node(
            node.as_object().expect("node object"),
            Some(("weather_to_chart", "source_slot")),
            &instance_inputs,
        )
        .expect("bindings");

        assert_eq!(bindings["semantic_role"].as_str(), Some("weather_source"));
        assert_eq!(
            bindings["family_asset_workflow_id"].as_str(),
            Some("wf_weather_asset")
        );
        assert_eq!(
            bindings["instance_workflow_id"].as_str(),
            Some("wf_weather_instance")
        );
        assert_eq!(
            bindings["parameters"].as_array().map(|items| items.len()),
            Some(2)
        );
        assert_eq!(
            bindings["input_schema"]["properties"]["location_query"]["target_path"].as_str(),
            Some("config.location_query")
        );
        assert_eq!(
            bindings["input_schema"]["template_binding"]["template_id"].as_str(),
            Some("weather_to_chart")
        );
    }
}
