/*
 * @module-id: rust.ledger-ingestion-runtime
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use chrono::Utc;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use ulid::Ulid;

use crate::{
    afp::Message as ProtoMessage,
    db::Db,
    ledger_ingestion_agent::{IngestionPassResult, run_ingestion_pass},
    message::{
        AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY, AFP_SUBTYPE_KNOWLEDGE_LINK_RELATIONSHIP,
        AFP_TYPE_KNOWLEDGE_LINK, AFP_TYPE_RELATION_LINK, AfpTieredLedgerContent,
    },
};

/// Runs one metadata-first ingestion pass for a user's recent private messages.
///
/// This is a runtime adapter only: it fetches a recent preview window from the DB,
/// normalizes the shape expected by `ledger_ingestion_agent`, and returns the pure
/// ingestion result. Persistence and scheduling stay outside this module.
pub async fn run_ledger_ingestion_backfill_pass(
    db: &Db,
    user_id: &str,
    ledger: &AfpTieredLedgerContent,
    target_thread_id: &str,
    limit: i64,
    ledger_created_at: Option<&str>,
) -> Result<IngestionPassResult, sqlx::Error> {
    let previews = db
        .recent_private_message_previews_for_user(user_id, limit)
        .await?;
    Ok(run_ledger_ingestion_pass_from_previews(
        &previews,
        ledger,
        user_id,
        target_thread_id,
        ledger_created_at,
    ))
}

/// Persists the AFP messages emitted by an ingestion pass into the user's private message store.
///
/// This intentionally persists only the AFP outputs that already have a message contract.
/// Ledger-entry persistence should remain separate until there is a real stored tiered-ledger
/// thread surface.
pub async fn persist_ingestion_pass_messages(
    db: &Db,
    user_id: &str,
    result: &IngestionPassResult,
) -> Result<u32, sqlx::Error> {
    let mut stored = 0u32;
    for message in &result.afp_messages {
        if persist_ingestion_message(db, user_id, message).await? {
            stored += 1;
        }
    }
    Ok(stored)
}

pub fn run_ledger_ingestion_pass_from_previews(
    previews: &[Value],
    ledger: &AfpTieredLedgerContent,
    owner_user_id: &str,
    target_thread_id: &str,
    ledger_created_at: Option<&str>,
) -> IngestionPassResult {
    let normalized = previews
        .iter()
        .map(normalize_ingestion_preview)
        .collect::<Vec<_>>();
    run_ingestion_pass(
        &normalized,
        ledger,
        owner_user_id,
        target_thread_id,
        ledger_created_at,
    )
}

fn normalize_ingestion_preview(preview: &Value) -> Value {
    serde_json::json!({
        "id": preview["id"].as_str().unwrap_or_default(),
        "thread_id": preview["thread_id"].as_str().unwrap_or_default(),
        "type": preview["type"].as_str().unwrap_or_default(),
        "subtype": preview["subtype"].as_str().unwrap_or_default(),
        "from": preview["from"].as_str().unwrap_or_default(),
        "timestamp": preview["timestamp"].as_str().unwrap_or_default(),
        "metadata": preview["metadata"].clone(),
        "content_preview": preview["content_preview"].as_str().unwrap_or_default(),
    })
}

async fn persist_ingestion_message(
    db: &Db,
    user_id: &str,
    message: &Value,
) -> Result<bool, sqlx::Error> {
    let content = message.get("content").cloned().unwrap_or(Value::Null);
    let resolved_id = stable_ingestion_message_id(message)
        .or_else(|| message["id"].as_str().map(str::to_string))
        .unwrap_or_else(|| format!("ledger-ingestion.{}", Ulid::new()));
    let proto = ProtoMessage {
        protocol: message["protocol"].as_str().unwrap_or("afp-v1").to_string(),
        id: resolved_id,
        thread_id: message["thread_id"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        parent_id: String::new(),
        from: message["from"]
            .as_str()
            .unwrap_or("omnyid://daemon/ledger-ingestion")
            .to_string(),
        to: message["to"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_else(|| vec!["omnyid://workspace/user".to_string()]),
        timestamp: message["timestamp"]
            .as_str()
            .unwrap_or(&Utc::now().to_rfc3339())
            .to_string(),
        r#type: message["type"].as_str().unwrap_or_default().to_string(),
        kind: None,
        supertags: Vec::new(),
        content: content.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: json!(collect_message_references(message)).to_string(),
        attachments: "[]".to_string(),
        store_in_relational: message["store_in_relational"].as_bool().unwrap_or(false),
        subtype: message["subtype"].as_str().unwrap_or_default().to_string(),
        metadata: message
            .get("metadata")
            .cloned()
            .unwrap_or_else(|| json!({}))
            .to_string(),
    };
    if is_stable_ingestion_message(message) {
        db.upsert_private_message(user_id, &proto, content).await?;
        Ok(true)
    } else {
        db.store_private_message(user_id, &proto, content).await
    }
}

fn collect_message_references(message: &Value) -> Vec<String> {
    let mut refs = Vec::new();
    if let Some(source_message_id) = message["content"]["source_message_id"].as_str() {
        refs.push(source_message_id.to_string());
    }
    if let Some(target_message_id) = message["content"]["target_message_id"].as_str() {
        refs.push(target_message_id.to_string());
    }
    refs
}

fn is_stable_ingestion_message(message: &Value) -> bool {
    stable_ingestion_message_id(message).is_some()
}

fn stable_ingestion_message_id(message: &Value) -> Option<String> {
    let message_type = message["type"].as_str()?.trim();
    let subtype = message["subtype"].as_str().unwrap_or_default().trim();
    let source_message_id = message["content"]["source_message_id"].as_str()?.trim();
    if message_type.is_empty() || source_message_id.is_empty() {
        return None;
    }

    let link_type = message["content"]["link_type"]
        .as_str()
        .unwrap_or_default()
        .trim();
    let relationship_id = message["content"]["relationship_id"]
        .as_str()
        .unwrap_or_default()
        .trim();

    let supported = matches!(
        (message_type, subtype),
        (AFP_TYPE_KNOWLEDGE_LINK, AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY)
            | (
                AFP_TYPE_KNOWLEDGE_LINK,
                AFP_SUBTYPE_KNOWLEDGE_LINK_RELATIONSHIP
            )
            | (AFP_TYPE_RELATION_LINK, AFP_SUBTYPE_KNOWLEDGE_LINK_ENTITY)
            | (
                AFP_TYPE_RELATION_LINK,
                AFP_SUBTYPE_KNOWLEDGE_LINK_RELATIONSHIP
            )
    );
    if !supported {
        return None;
    }

    let mut hasher = Sha256::new();
    hasher.update(message_type.as_bytes());
    hasher.update([0x1f]);
    hasher.update(subtype.as_bytes());
    hasher.update([0x1f]);
    hasher.update(source_message_id.as_bytes());
    hasher.update([0x1f]);
    hasher.update(link_type.as_bytes());
    hasher.update([0x1f]);
    hasher.update(relationship_id.as_bytes());
    Some(format!(
        "ledger-ingestion.{}",
        hex::encode(hasher.finalize())
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_ledger() -> AfpTieredLedgerContent {
        AfpTieredLedgerContent {
            name: "Runtime Ledger".to_string(),
            tier: "session".to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn preview_pass_uses_content_preview_for_extraction() {
        let previews = vec![serde_json::json!({
            "id": "msg_1",
            "thread_id": "thread_1",
            "type": "note",
            "subtype": "journal",
            "from": "user_01",
            "timestamp": "2026-06-06T10:00:00Z",
            "content_preview": "Revenue was $10M in Q1 2026.",
        })];

        let result = run_ledger_ingestion_pass_from_previews(
            &previews,
            &empty_ledger(),
            "user_01",
            "t1",
            None,
        );
        assert!(result.entities_extracted > 0);
        assert!(result.afp_messages.iter().any(|message| {
            message["type"]
                .as_str()
                .map(crate::message::is_topology_link_message_type)
                .unwrap_or(false)
        }));
    }

    #[test]
    fn preview_normalization_preserves_header_fields() {
        let normalized = normalize_ingestion_preview(&serde_json::json!({
            "id": "msg_2",
            "thread_id": "thread_2",
            "type": "decision_request",
            "subtype": "approval",
            "from": "agent_01",
            "timestamp": "2026-06-06T11:00:00Z",
            "metadata": { "source": "test" },
            "content_preview": "Alice works at Acme."
        }));

        assert_eq!(normalized["id"].as_str(), Some("msg_2"));
        assert_eq!(normalized["thread_id"].as_str(), Some("thread_2"));
        assert_eq!(normalized["from"].as_str(), Some("agent_01"));
        assert_eq!(
            normalized["content_preview"].as_str(),
            Some("Alice works at Acme.")
        );
    }

    #[test]
    fn proto_message_references_include_source_and_target_ids() {
        let refs = collect_message_references(&serde_json::json!({
            "content": {
                "source_message_id": "msg_1",
                "target_message_id": "msg_2"
            }
        }));
        assert_eq!(refs, vec!["msg_1".to_string(), "msg_2".to_string()]);
    }

    #[test]
    fn stable_ingestion_message_id_is_deterministic_for_topology_messages() {
        let message = serde_json::json!({
            "type": "knowledge_link",
            "subtype": "entity",
            "content": {
                "source_message_id": "msg_1",
                "link_type": "shared_entity",
                "relationship_id": "entity:person:alice"
            }
        });
        assert_eq!(
            stable_ingestion_message_id(&message),
            stable_ingestion_message_id(&message)
        );
    }

    #[test]
    fn stable_ingestion_message_id_uses_lineage_fields() {
        let first = serde_json::json!({
            "type": "relation_link",
            "subtype": "relationship",
            "content": {
                "source_message_id": "msg_1",
                "link_type": "shared_relationship",
                "relationship_id": "relationship:works_at:alice:acme"
            }
        });
        let second = serde_json::json!({
            "type": "relation_link",
            "subtype": "relationship",
            "content": {
                "source_message_id": "msg_2",
                "link_type": "shared_relationship",
                "relationship_id": "relationship:works_at:alice:acme"
            }
        });
        assert_ne!(
            stable_ingestion_message_id(&first),
            stable_ingestion_message_id(&second)
        );
    }
}
