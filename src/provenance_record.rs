/*
 * @module-id: rust.provenance-record
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use chrono::Utc;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_PROVENANCE_ACTION, AFP_TYPE_PROVENANCE_RECORD, AfpProvenanceHash,
    AfpProvenanceRecordContent,
};

pub fn canonical_value_hash(value: &Value) -> String {
    canonical_bytes_hash(value.to_string().as_bytes())
}

pub fn canonical_bytes_hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn build_provenance_record_afp(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    content: &AfpProvenanceRecordContent,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "parent_id": parent_id,
        "from": "provenance_agent",
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_PROVENANCE_RECORD,
        "subtype": AFP_SUBTYPE_PROVENANCE_ACTION,
        "content": serde_json::to_value(content).unwrap_or(Value::Null),
        "metadata": {
            "store": true,
            "provenance": true,
        },
        "store_in_relational": true,
    })
}

pub fn build_action_provenance_record_afp(
    owner_user_id: &str,
    thread_id: &str,
    parent_id: Option<&str>,
    actor: &str,
    action_type: &str,
    action_label: &str,
    source_message_ids: &[&str],
    input_hashes: Vec<AfpProvenanceHash>,
    output_hashes: Vec<AfpProvenanceHash>,
    confidence: Option<f64>,
    context: Option<Value>,
) -> Value {
    let content = AfpProvenanceRecordContent {
        record_id: Ulid::new().to_string(),
        actor: actor.to_string(),
        action_type: action_type.to_string(),
        action_label: action_label.to_string(),
        source_message_ids: source_message_ids
            .iter()
            .map(|id| (*id).to_string())
            .collect(),
        input_hashes,
        output_hashes,
        confidence,
        recorded_at: Utc::now().to_rfc3339(),
        context,
    };
    build_provenance_record_afp(owner_user_id, thread_id, parent_id, &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_value_hash_is_stable() {
        let a = json!({"a":1,"b":["x",true]});
        let b = json!({"a":1,"b":["x",true]});
        assert_eq!(canonical_value_hash(&a), canonical_value_hash(&b));
    }

    #[test]
    fn build_provenance_record_afp_sets_parent_and_type() {
        let content = AfpProvenanceRecordContent {
            record_id: "prov_1".to_string(),
            actor: "browser_runner".to_string(),
            action_type: "browser_task_result".to_string(),
            action_label: "Completed browser task".to_string(),
            source_message_ids: vec!["msg_a".to_string(), "msg_b".to_string()],
            input_hashes: vec![AfpProvenanceHash {
                label: "request".to_string(),
                sha256: "abc".to_string(),
            }],
            output_hashes: vec![AfpProvenanceHash {
                label: "result".to_string(),
                sha256: "def".to_string(),
            }],
            confidence: Some(0.94),
            recorded_at: "2026-06-12T00:00:00Z".to_string(),
            context: Some(json!({"status": "success"})),
        };
        let afp = build_provenance_record_afp("user_01", "thread_01", Some("msg_parent"), &content);
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_PROVENANCE_RECORD));
        assert_eq!(afp["subtype"].as_str(), Some(AFP_SUBTYPE_PROVENANCE_ACTION));
        assert_eq!(afp["parent_id"].as_str(), Some("msg_parent"));
    }
}
