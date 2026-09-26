/*
 * @module-id: rust.orchestration-task-board
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use std::collections::{BTreeMap, HashMap};

use serde_json::Value;

use crate::{master_orchestrator::TaskResult, message::AFPMessage};

fn normalize_board_status(result_status: &str) -> &'static str {
    match result_status {
        "ok" | "completed" => "done",
        "in_progress" => "in_progress",
        "failed"
        | "timeout"
        | "policy_blocked"
        | "budget_blocked"
        | "approval_required"
        | "clarification_required" => "blocked",
        _ => "pending",
    }
}

fn task_board_item(create_message: &AFPMessage, result: Option<&TaskResult>) -> Value {
    let content = &create_message.content;
    let result_meta = result.and_then(|item| item.result_meta.as_ref());
    let mut item = serde_json::Map::from_iter([
        (
            "id".to_string(),
            content.get("task_id").cloned().unwrap_or(Value::Null),
        ),
        (
            "task_id".to_string(),
            content.get("task_id").cloned().unwrap_or(Value::Null),
        ),
        (
            "title".to_string(),
            content
                .get("title")
                .cloned()
                .unwrap_or(Value::String("Task".to_string())),
        ),
        (
            "description".to_string(),
            content.get("description").cloned().unwrap_or(Value::Null),
        ),
        (
            "status".to_string(),
            Value::String(
                normalize_board_status(
                    result.map(|item| item.status.as_str()).unwrap_or("pending"),
                )
                .to_string(),
            ),
        ),
        (
            "raw_status".to_string(),
            Value::String(
                result
                    .map(|item| item.status.clone())
                    .unwrap_or_else(|| "pending".to_string()),
            ),
        ),
        (
            "priority".to_string(),
            content
                .get("priority")
                .cloned()
                .unwrap_or(Value::String("normal".to_string())),
        ),
        (
            "depends_on".to_string(),
            content
                .get("depends_on")
                .cloned()
                .unwrap_or_else(|| Value::Array(vec![])),
        ),
        (
            "execution_group".to_string(),
            content
                .get("execution_group")
                .cloned()
                .unwrap_or(Value::from(0)),
        ),
        (
            "progress".to_string(),
            Value::from(
                if matches!(
                    result.map(|item| item.status.as_str()),
                    Some("ok" | "completed")
                ) {
                    100
                } else {
                    0
                },
            ),
        ),
        (
            "summary".to_string(),
            Value::String(
                result
                    .and_then(|item| item.result.clone())
                    .unwrap_or_default(),
            ),
        ),
        (
            "result".to_string(),
            Value::String(
                result
                    .and_then(|item| item.result.clone())
                    .unwrap_or_default(),
            ),
        ),
        (
            "error".to_string(),
            Value::String(
                result
                    .and_then(|item| item.error.clone())
                    .unwrap_or_default(),
            ),
        ),
    ]);
    if let Some(meta) = result_meta {
        meta.insert_a2ui_fields(&mut item);
    }
    Value::Object(item)
}

pub fn build_grouped_task_board_payload(
    ledger_messages: &[AFPMessage],
    results: &[TaskResult],
) -> BTreeMap<u64, Vec<Value>> {
    let results_by_task_id: HashMap<&str, &TaskResult> = results
        .iter()
        .map(|result| (result.task_id.as_str(), result))
        .collect();

    let mut groups: BTreeMap<u64, Vec<Value>> = BTreeMap::new();
    for message in ledger_messages {
        if message.subtype.as_deref() != Some("create") {
            continue;
        }
        let group = message
            .content
            .get("execution_group")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let task_id = message
            .content
            .get("task_id")
            .and_then(Value::as_str)
            .unwrap_or("");
        let result = results_by_task_id.get(task_id).copied();
        groups
            .entry(group)
            .or_default()
            .push(task_board_item(message, result));
    }
    groups
}

#[cfg(test)]
mod tests {
    use super::build_grouped_task_board_payload;
    use crate::master_orchestrator::TaskResult;
    use crate::message::AFPMessage;
    use serde_json::json;

    fn create_task_message(task_id: &str, execution_group: u64) -> AFPMessage {
        AFPMessage {
            protocol: "afp-v1".to_string(),
            id: format!("task-{task_id}"),
            thread_id: "ledger:test".to_string(),
            parent_id: None,
            from: "master-orchestrator".to_string(),
            to: vec![],
            timestamp: "2026-05-18T00:00:00Z".to_string(),
            r#type: "task".to_string(),
            kind: None,
            supertags: vec![],
            subtype: Some("create".to_string()),
            content: json!({
                "task_id": task_id,
                "title": format!("Task {task_id}"),
                "description": "desc",
                "priority": "high",
                "depends_on": [],
                "execution_group": execution_group,
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
        }
    }

    #[test]
    fn grouped_task_board_payload_carries_normalized_connector_fields() {
        let messages = vec![create_task_message("t1", 0)];
        let results = vec![TaskResult {
            task_id: "t1".to_string(),
            task_type: "task".to_string(),
            status: "ok".to_string(),
            result: Some("Posted update".to_string()),
            result_meta: Some(crate::message::AfpNormalizedToolResultData {
                schema_version: crate::message::AFP_TOOL_RESULT_SCHEMA_V1.to_string(),
                tool_slug: String::new(),
                tool_name: "Slack".to_string(),
                capability: "send_message".to_string(),
                connector_label: "Slack".to_string(),
                artifact_label: "#team-launch".to_string(),
                artifact_kind: "message".to_string(),
                url: Some("https://example.com/message/1".to_string()),
                channel: Some("team-launch".to_string()),
                title: Some("Launch message".to_string()),
                filename: None,
                tool_id: "tool_slack".to_string(),
                status: "done".to_string(),
                output: Some(serde_json::json!({ "message_id": "m1" })),
                error: None,
                completed_at: "2026-05-18T10:00:00Z".to_string(),
            }),
            error: None,
            cost_estimate_usd: None,
            actual_cost_usd: None,
            api_tier: None,
            token_estimate: None,
            tokens_used: None,
            downgrade_action: None,
            execution_explanation: None,
        }];

        let grouped = build_grouped_task_board_payload(&messages, &results);
        let item = &grouped[&0][0];
        assert_eq!(item["status"].as_str(), Some("done"));
        assert_eq!(item["raw_status"].as_str(), Some("ok"));
        assert_eq!(item["summary"].as_str(), Some("Posted update"));
        assert_eq!(item["tool_name"].as_str(), Some("Slack"));
        assert_eq!(item["capability"].as_str(), Some("send_message"));
        assert_eq!(
            item["schema_version"].as_str(),
            Some(crate::message::AFP_TOOL_RESULT_SCHEMA_V1)
        );
        assert_eq!(item["connector_label"].as_str(), Some("Slack"));
        assert_eq!(item["artifact_label"].as_str(), Some("#team-launch"));
        assert_eq!(item["artifact_kind"].as_str(), Some("message"));
        assert_eq!(item["channel"].as_str(), Some("team-launch"));
        assert_eq!(item["url"].as_str(), Some("https://example.com/message/1"));
    }

    #[test]
    fn blocked_results_map_to_pending_board_contract_without_todo_status() {
        let messages = vec![create_task_message("t2", 1)];
        let results = vec![TaskResult {
            task_id: "t2".to_string(),
            task_type: "task".to_string(),
            status: "clarification_required".to_string(),
            result: None,
            result_meta: None,
            error: Some("Need a concrete capability".to_string()),
            cost_estimate_usd: None,
            actual_cost_usd: None,
            api_tier: None,
            token_estimate: None,
            tokens_used: None,
            downgrade_action: None,
            execution_explanation: None,
        }];

        let grouped = build_grouped_task_board_payload(&messages, &results);
        let item = &grouped[&1][0];
        assert_eq!(item["status"].as_str(), Some("blocked"));
        assert_eq!(item["raw_status"].as_str(), Some("clarification_required"));
        assert_eq!(item["error"].as_str(), Some("Need a concrete capability"));
        assert_ne!(item["status"].as_str(), Some("todo"));
    }
}
