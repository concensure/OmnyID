/*
 * @module-id: server.workflow-lineage-filters
 * @primary-capability: server.workflow.lineage-filtering
 * @sub-capabilities: thread-artifact-filtering, workflow-run-filtering, lineage-query-contracts
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid-server
 */

use serde::Deserialize;
use serde_json::Value;

use crate::{message::AFPMessage, workflow_instance_contracts::*};

#[derive(Clone, Debug, Default, Deserialize)]
pub(super) struct WorkflowLineageFilterQuery {
    #[serde(default)]
    pub(super) family_id: Option<String>,
    #[serde(default)]
    pub(super) family_workflow_id: Option<String>,
    #[serde(default)]
    pub(super) family_asset_workflow_id: Option<String>,
    #[serde(default)]
    pub(super) instance_workflow_id: Option<String>,
    #[serde(default)]
    pub(super) semantic_role: Option<String>,
}

pub(super) fn filter_thread_messages(
    messages: Vec<AFPMessage>,
    filter: &WorkflowLineageFilterQuery,
) -> Vec<AFPMessage> {
    if !lineage_filter_active(filter) {
        return messages;
    }
    messages
        .into_iter()
        .filter(|message| {
            let context = workflow_family_context_from_message(message);
            matches_workflow_family_context(context.as_ref(), filter)
        })
        .collect()
}

pub(super) fn filter_workflow_runs(
    runs: Vec<Value>,
    filter: &WorkflowLineageFilterQuery,
) -> Vec<Value> {
    if !lineage_filter_active(filter) {
        return runs;
    }
    runs.into_iter()
        .filter(|run| {
            let context =
                workflow_family_context_from_json(run.get("result").unwrap_or(&Value::Null));
            matches_workflow_family_context(context.as_ref(), filter)
        })
        .collect()
}

fn lineage_filter_active(filter: &WorkflowLineageFilterQuery) -> bool {
    !trimmed_filter_value(filter.family_id.as_deref()).is_empty()
        || !trimmed_filter_value(filter.family_workflow_id.as_deref()).is_empty()
        || !trimmed_filter_value(filter.family_asset_workflow_id.as_deref()).is_empty()
        || !trimmed_filter_value(filter.instance_workflow_id.as_deref()).is_empty()
        || !trimmed_filter_value(filter.semantic_role.as_deref()).is_empty()
}

fn matches_workflow_family_context(
    context: Option<&Value>,
    filter: &WorkflowLineageFilterQuery,
) -> bool {
    let Some(context) = context.and_then(Value::as_object) else {
        return false;
    };
    field_matches(
        context.get("family_id").and_then(Value::as_str),
        filter.family_id.as_deref(),
    ) && field_matches(
        context.get("family_workflow_id").and_then(Value::as_str),
        filter.family_workflow_id.as_deref(),
    ) && field_matches(
        context
            .get("family_asset_workflow_id")
            .and_then(Value::as_str),
        filter.family_asset_workflow_id.as_deref(),
    ) && field_matches(
        context.get("instance_workflow_id").and_then(Value::as_str),
        filter.instance_workflow_id.as_deref(),
    ) && field_matches(
        context.get("semantic_role").and_then(Value::as_str),
        filter.semantic_role.as_deref(),
    )
}

fn field_matches(current: Option<&str>, filter: Option<&str>) -> bool {
    let expected = trimmed_filter_value(filter);
    if expected.is_empty() {
        return true;
    }
    current.map(str::trim) == Some(expected)
}

fn trimmed_filter_value(value: Option<&str>) -> &str {
    value.map(str::trim).unwrap_or("")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filter_thread_messages_matches_instance_workflow_id() {
        let matching = AFPMessage {
            protocol: "afp-v1".into(),
            id: "msg_match".into(),
            thread_id: "thread_1".into(),
            parent_id: None,
            from: "omnyid://server".into(),
            to: vec![],
            timestamp: "2026-01-01T00:00:00Z".into(),
            r#type: "tabular_dataset".into(),
            kind: None,
            subtype: None,
            content: serde_json::json!({
                "workflow_family_context": {
                    "family_id": "family_weather",
                    "instance_workflow_id": "wf_instance_1",
                    "values": {}
                }
            }),
            metadata: None,
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: false,
            prev_hash: None,
        };
        let other = AFPMessage {
            id: "msg_other".into(),
            content: serde_json::json!({
                "workflow_family_context": {
                    "family_id": "family_weather",
                    "instance_workflow_id": "wf_instance_2",
                    "values": {}
                }
            }),
            ..matching.clone()
        };
        let filtered = filter_thread_messages(
            vec![matching, other],
            &WorkflowLineageFilterQuery {
                instance_workflow_id: Some("wf_instance_1".into()),
                ..WorkflowLineageFilterQuery::default()
            },
        );
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].id, "msg_match");
    }
}
