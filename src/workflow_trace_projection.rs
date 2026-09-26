/*
 * @module-id: rust.workflow-trace-projection
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde_json::{Map, Number, Value, json};

pub fn insert_action_outcome_fields(
    action: &mut Map<String, Value>,
    outcome: &str,
    retry_count: i64,
    connector_status: &str,
    status_code: Option<i64>,
    result_summary: &str,
) {
    action.insert("outcome".to_string(), Value::String(outcome.to_string()));
    action.insert(
        "retry_count".to_string(),
        Value::Number(Number::from(retry_count)),
    );
    action.insert(
        "connector_status".to_string(),
        Value::String(connector_status.to_string()),
    );
    action.insert(
        "status_code".to_string(),
        status_code
            .map(|value| Value::Number(Number::from(value)))
            .unwrap_or(Value::Null),
    );
    action.insert(
        "result_summary".to_string(),
        Value::String(result_summary.to_string()),
    );
}

pub fn set_action_result_summary(
    action: &mut Map<String, Value>,
    outcome: Option<&str>,
    result_summary: &str,
) {
    if let Some(outcome) = outcome {
        action.insert("outcome".to_string(), Value::String(outcome.to_string()));
    }
    action.insert(
        "result_summary".to_string(),
        Value::String(result_summary.to_string()),
    );
}

pub fn workflow_runtime_action(
    action_category: &str,
    integration_family: &str,
    auth_mode: &str,
    outcome: &str,
    result_summary: &str,
) -> Value {
    json!({
        "action_category": action_category,
        "integration_family": integration_family,
        "auth_mode": auth_mode,
        "outcome": outcome,
        "result_summary": result_summary,
    })
}

#[cfg(test)]
mod tests {
    use super::{insert_action_outcome_fields, set_action_result_summary, workflow_runtime_action};
    use serde_json::{Map, Value};

    #[test]
    fn inserts_action_outcome_fields() {
        let mut action = Map::new();
        insert_action_outcome_fields(
            &mut action,
            "completed",
            2,
            "success",
            Some(200),
            "Connector completed successfully.",
        );
        assert_eq!(action["outcome"].as_str(), Some("completed"));
        assert_eq!(action["retry_count"].as_i64(), Some(2));
        assert_eq!(action["connector_status"].as_str(), Some("success"));
        assert_eq!(action["status_code"].as_i64(), Some(200));
        assert_eq!(
            action["result_summary"].as_str(),
            Some("Connector completed successfully.")
        );
    }

    #[test]
    fn updates_action_summary_and_optional_outcome() {
        let mut action =
            Map::from_iter([("outcome".to_string(), Value::String("queued".to_string()))]);
        set_action_result_summary(&mut action, Some("cancelled"), "Approval rejected.");
        assert_eq!(action["outcome"].as_str(), Some("cancelled"));
        assert_eq!(
            action["result_summary"].as_str(),
            Some("Approval rejected.")
        );
    }

    #[test]
    fn builds_workflow_runtime_action_payload() {
        let action = workflow_runtime_action(
            "workflow_resume",
            "workflow_runtime",
            "system_resume",
            "resumed_pending_execution",
            "Workflow resumed.",
        );
        assert_eq!(action["action_category"].as_str(), Some("workflow_resume"));
        assert_eq!(
            action["outcome"].as_str(),
            Some("resumed_pending_execution")
        );
    }
}
