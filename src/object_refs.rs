use serde_json::Value;
use std::collections::BTreeSet;

use crate::message::parse_afp_references;

pub fn message_object_refs(message: &Value) -> Vec<String> {
    let mut refs = BTreeSet::new();

    for reference in message
        .get("references")
        .and_then(Value::as_array)
        .map(|references| parse_afp_references(references))
        .unwrap_or_default()
    {
        if reference.r#type.trim() == "message" {
            continue;
        }
        let target = reference.target.trim();
        if !target.is_empty() {
            refs.insert(target.to_string());
        }
    }

    for value in [
        &message["object_id"],
        &message["entity_id"],
        &message["content"]["object_id"],
        &message["content"]["entity_id"],
        &message["metadata"]["object_id"],
        &message["metadata"]["entity_id"],
        &message["content"]["metadata"]["object_id"],
        &message["content"]["metadata"]["entity_id"],
        &message["metadata"]["searchable_metadata"]["object_id"],
        &message["metadata"]["searchable_metadata"]["entity_id"],
        &message["content"]["metadata"]["searchable_metadata"]["object_id"],
        &message["content"]["metadata"]["searchable_metadata"]["entity_id"],
    ] {
        if let Some(raw) = value.as_str() {
            let normalized = raw.trim();
            if !normalized.is_empty() {
                refs.insert(normalized.to_string());
            }
        }
    }

    refs.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn message_object_refs_collects_non_message_targets_and_entity_ids() {
        let message = json!({
            "references": [
                { "type": "project", "target": "project_aurora" },
                { "type": "message", "target": "msg_1" }
            ],
            "metadata": {
                "entity_id": "entity:metric:q3",
                "searchable_metadata": {
                    "object_id": "object:launch-plan"
                }
            }
        });

        let refs = message_object_refs(&message);
        assert!(refs.contains(&"project_aurora".to_string()));
        assert!(refs.contains(&"entity:metric:q3".to_string()));
        assert!(refs.contains(&"object:launch-plan".to_string()));
        assert!(!refs.contains(&"msg_1".to_string()));
    }
}
