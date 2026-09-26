/*
 * @module-id: rust.orchestration-workflow-cards
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde_json::Value;

use crate::{master_orchestrator::TaskResult, message::AFPMessage};

fn workflow_card_status(result_status: &str) -> &'static str {
    match result_status {
        "ok" | "completed" => "done",
        "failed" | "timeout" => "failed",
        "policy_blocked" | "budget_blocked" | "approval_required" | "clarification_required" => {
            "blocked"
        }
        "in_progress" => "running",
        _ => "pending",
    }
}

pub fn build_workflow_card_props(
    task_result: &TaskResult,
    ledger_messages: &[AFPMessage],
    workflow_id: &str,
) -> Value {
    let source_message = ledger_messages
        .iter()
        .find(|message| message.content["task_id"].as_str() == Some(&task_result.task_id));

    let task_content = source_message
        .and_then(|message| message.content["description"].as_str())
        .unwrap_or(&task_result.task_type)
        .to_string();
    let execution_group = source_message
        .and_then(|message| message.content.get("execution_group"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let result_meta = task_result.result_meta.as_ref();
    let mut props = serde_json::Map::from_iter([
        (
            "workflow_id".to_string(),
            Value::String(workflow_id.to_string()),
        ),
        (
            "title".to_string(),
            Value::String(task_content.chars().take(80).collect::<String>()),
        ),
        (
            "description".to_string(),
            Value::String(format!("Type: {}", task_result.task_type)),
        ),
        (
            "status".to_string(),
            Value::String(workflow_card_status(&task_result.status).to_string()),
        ),
        (
            "raw_status".to_string(),
            Value::String(task_result.status.clone()),
        ),
        (
            "task_type".to_string(),
            Value::String(task_result.task_type.clone()),
        ),
        ("execution_group".to_string(), Value::from(execution_group)),
        (
            "summary".to_string(),
            Value::String(task_result.result.clone().unwrap_or_default()),
        ),
        (
            "error".to_string(),
            Value::String(task_result.error.clone().unwrap_or_default()),
        ),
    ]);
    if let Some(meta) = result_meta {
        meta.insert_a2ui_fields(&mut props);
    }
    Value::Object(props)
}

#[cfg(test)]
mod tests {
    use super::build_workflow_card_props;
    use crate::{master_orchestrator::TaskResult, message::AFPMessage};
    use serde_json::json;

    fn ledger_message(task_id: &str, execution_group: u64) -> AFPMessage {
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
                "description": "Publish the launch update",
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
    fn workflow_card_props_include_result_metadata() {
        let result = TaskResult {
            task_id: "t1".to_string(),
            task_type: "task".to_string(),
            status: "ok".to_string(),
            result: Some("Posted update to Slack".to_string()),
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
        };

        let props = build_workflow_card_props(&result, &[ledger_message("t1", 2)], "wf_1");
        assert_eq!(props["status"].as_str(), Some("done"));
        assert_eq!(props["raw_status"].as_str(), Some("ok"));
        assert_eq!(props["summary"].as_str(), Some("Posted update to Slack"));
        assert_eq!(props["tool_name"].as_str(), Some("Slack"));
        assert_eq!(props["capability"].as_str(), Some("send_message"));
        assert_eq!(
            props["schema_version"].as_str(),
            Some(crate::message::AFP_TOOL_RESULT_SCHEMA_V1)
        );
        assert_eq!(props["connector_label"].as_str(), Some("Slack"));
        assert_eq!(props["artifact_label"].as_str(), Some("#team-launch"));
        assert_eq!(props["artifact_kind"].as_str(), Some("message"));
        assert_eq!(props["url"].as_str(), Some("https://example.com/message/1"));
        assert_eq!(props["execution_group"].as_u64(), Some(2));
    }
}
