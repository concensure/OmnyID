/*
 * @module-id: rust.orchestration-result-projection
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde_json::{Map, Value, json};

use crate::{master_orchestrator::TaskResult, message::AfpNormalizedToolResultData};

pub fn result_summary_text(result: &TaskResult) -> String {
    result
        .result
        .clone()
        .or_else(|| result.error.clone())
        .unwrap_or_default()
}

pub fn result_summary_preview(result: &TaskResult, max_chars: usize) -> String {
    result_summary_text(result)
        .chars()
        .take(max_chars)
        .collect()
}

pub fn result_cost_label(result: &TaskResult) -> String {
    let estimate = result
        .cost_estimate_usd
        .map(|v| format!("${v:.4}"))
        .unwrap_or_else(|| "n/a".to_string());
    let actual = result
        .actual_cost_usd
        .map(|v| format!("${v:.4}"))
        .unwrap_or_else(|| "n/a".to_string());
    format!("{estimate} / {actual}")
}

pub fn result_meta_value(result: &TaskResult) -> Value {
    result
        .result_meta
        .as_ref()
        .map(AfpNormalizedToolResultData::as_value)
        .unwrap_or(Value::Null)
}

pub fn result_payload_fields(result: &TaskResult) -> Map<String, Value> {
    let mut fields = Map::from_iter([
        ("task_id".to_string(), Value::String(result.task_id.clone())),
        (
            "task_type".to_string(),
            Value::String(result.task_type.clone()),
        ),
        ("status".to_string(), Value::String(result.status.clone())),
        (
            "result_summary".to_string(),
            result
                .result
                .clone()
                .map(Value::String)
                .unwrap_or(Value::Null),
        ),
        ("result_meta".to_string(), result_meta_value(result)),
        (
            "error".to_string(),
            result
                .error
                .clone()
                .map(Value::String)
                .unwrap_or(Value::Null),
        ),
        (
            "cost_estimate_usd".to_string(),
            result
                .cost_estimate_usd
                .map(Value::from)
                .unwrap_or(Value::Null),
        ),
        (
            "actual_cost_usd".to_string(),
            result
                .actual_cost_usd
                .map(Value::from)
                .unwrap_or(Value::Null),
        ),
        (
            "api_tier".to_string(),
            result.api_tier.map(Value::from).unwrap_or(Value::Null),
        ),
        (
            "token_estimate".to_string(),
            result
                .token_estimate
                .map(Value::from)
                .unwrap_or(Value::Null),
        ),
        (
            "tokens_used".to_string(),
            result.tokens_used.map(Value::from).unwrap_or(Value::Null),
        ),
        (
            "downgrade_action".to_string(),
            result
                .downgrade_action
                .clone()
                .map(Value::String)
                .unwrap_or(Value::Null),
        ),
        (
            "execution_explanation".to_string(),
            result
                .execution_explanation
                .as_ref()
                .cloned()
                .or_else(|| {
                    Some(crate::master_orchestrator::task_execution_explanation(
                        result,
                    ))
                })
                .as_ref()
                .and_then(|value| serde_json::to_value(value).ok())
                .unwrap_or(Value::Null),
        ),
    ]);
    if let Some(meta) = result.result_meta.as_ref() {
        meta.insert_a2ui_fields(&mut fields);
    }
    fields
}

pub fn artifact_link_item(result: &TaskResult) -> Option<Value> {
    let meta = result.result_meta.as_ref()?;
    let url = meta.url.as_deref()?;
    let title = if meta.artifact_label.is_empty() {
        result.task_type.as_str()
    } else {
        meta.artifact_label.as_str()
    };
    Some(json!({
        "title": format!("{} Â· {}", result.task_type, title),
        "url": url,
        "subtitle": if meta.connector_label.is_empty() { "Connector artifact" } else { meta.connector_label.as_str() },
    }))
}

#[cfg(test)]
mod tests {
    use super::{
        artifact_link_item, result_cost_label, result_payload_fields, result_summary_preview,
    };
    use crate::{
        master_orchestrator::TaskResult,
        message::{AFP_TOOL_RESULT_SCHEMA_V1, AfpNormalizedToolResultData},
    };

    fn notion_result() -> TaskResult {
        TaskResult {
            task_id: "task_1".to_string(),
            task_type: "note".to_string(),
            status: "ok".to_string(),
            result: Some("Completed Notion page \"Weekly recap\".".to_string()),
            result_meta: Some(AfpNormalizedToolResultData {
                schema_version: AFP_TOOL_RESULT_SCHEMA_V1.to_string(),
                tool_slug: "notion".to_string(),
                tool_name: "Notion".to_string(),
                capability: "create_page".to_string(),
                connector_label: "Notion".to_string(),
                artifact_label: "Weekly recap".to_string(),
                artifact_kind: "page".to_string(),
                url: Some("https://notion.so/page".to_string()),
                title: Some("Weekly recap".to_string()),
                channel: None,
                filename: None,
                tool_id: "tool_notion".to_string(),
                status: "done".to_string(),
                output: Some(serde_json::json!({ "page_id": "page_1" })),
                error: None,
                completed_at: "2026-05-18T10:00:00Z".to_string(),
            }),
            error: None,
            cost_estimate_usd: Some(0.0009),
            actual_cost_usd: Some(0.0012),
            api_tier: Some(2),
            token_estimate: Some(45),
            tokens_used: Some(32),
            downgrade_action: Some("use_tier_2".to_string()),
            execution_explanation: None,
        }
    }

    #[test]
    fn result_payload_fields_include_normalized_meta_and_costs() {
        let fields = result_payload_fields(&notion_result());
        assert_eq!(fields["tool_name"].as_str(), Some("Notion"));
        assert_eq!(fields["artifact_label"].as_str(), Some("Weekly recap"));
        assert_eq!(fields["actual_cost_usd"].as_f64(), Some(0.0012));
        assert_eq!(fields["tokens_used"].as_u64(), Some(32));
        assert!(fields.contains_key("execution_explanation"));
    }

    #[test]
    fn artifact_link_item_uses_normalized_labels() {
        let item = artifact_link_item(&notion_result()).expect("artifact link");
        assert_eq!(item["title"].as_str(), Some("note Â· Weekly recap"));
        assert_eq!(item["subtitle"].as_str(), Some("Notion"));
    }

    #[test]
    fn result_helpers_format_summary_and_cost_label() {
        let result = notion_result();
        assert!(result_summary_preview(&result, 20).starts_with("Completed Notion"));
        assert_eq!(result_cost_label(&result), "$0.0009 / $0.0012");
    }
}
