// @locs-version: 2.0
use serde_json::Value;

pub(super) fn companion_afp_for_storage(
    companion_json: Value,
) -> Option<(crate::message::AFPMessage, Value)> {
    let companion_afp =
        serde_json::from_value::<crate::message::AFPMessage>(companion_json.clone()).ok()?;
    let content = companion_json.get("content").cloned().unwrap_or_default();
    Some((companion_afp, content))
}

pub(super) async fn store_proactive_companion_afps(db: &crate::db::Db, companion_afps: Vec<Value>) {
    for companion_json in companion_afps {
        if let Some((companion_afp, content)) = companion_afp_for_storage(companion_json) {
            let proto = super::afp_to_proto(&companion_afp);
            let _ = db.store_message(&proto, content).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        message::{
            AFP_SUBTYPE_PROVENANCE_ACTION, AFP_TYPE_PROACTIVE_SUGGESTION,
            AFP_TYPE_PROVENANCE_RECORD, AfpProactiveSuggestionContent,
        },
        proactive_bundle::build_suggestion_afp_bundle,
        proactive_engine::EvaluationResult,
        proactive_provenance::build_proactive_suggestion_provenance_afp,
    };
    use serde_json::json;
    use sqlx::Row;

    #[test]
    fn companion_afp_for_storage_extracts_generated_provenance_message_and_content() {
        let suggestion = json!({
            "id": "suggestion_1",
            "thread_id": "thread_1",
            "content": {
                "heuristic_id": "stalled-thread",
                "action_label": "Follow up on thread",
                "confidence": 0.91,
                "source_refs": ["msg_1"],
                "strategic_policy": { "action": "ask_approval" },
                "surface_policy": "surface_now",
                "approval_policy": "approval_required",
                "selection_reason": "Thread stalled.",
                "provenance_cue": "Traceable to event."
            },
            "metadata": {}
        });
        let value =
            build_proactive_suggestion_provenance_afp("user_1", &suggestion).expect("provenance");

        let (message, content) = companion_afp_for_storage(value).expect("valid companion AFP");

        assert_eq!(message.protocol, "afp-v1");
        assert_eq!(message.thread_id, "thread_1");
        assert_eq!(message.parent_id.as_deref(), Some("suggestion_1"));
        assert_eq!(message.r#type, AFP_TYPE_PROVENANCE_RECORD);
        assert_eq!(
            message.subtype.as_deref(),
            Some(AFP_SUBTYPE_PROVENANCE_ACTION)
        );
        assert!(message.store_in_relational);
        assert_eq!(content["source_message_ids"][0], "msg_1");
        assert_eq!(
            content["context"]["approval_policy"].as_str(),
            Some("approval_required")
        );
    }

    #[test]
    fn companion_afp_for_storage_skips_invalid_payloads() {
        assert!(companion_afp_for_storage(json!({ "content": {} })).is_none());
    }

    #[tokio::test]
    async fn local_postgres_proactive_bundle_persists_suggestion_and_companion_provenance() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let db = crate::db::Db::new(&database_url)
            .await
            .expect("connect to Postgres for proactive bundle smoke");

        let result = EvaluationResult {
            heuristic_id: "stalled-thread".to_string(),
            suggestion: AfpProactiveSuggestionContent {
                heuristic_id: "stalled-thread".to_string(),
                confidence: 0.91,
                urgency: "medium".to_string(),
                action_label: "Follow up on thread".to_string(),
                description: "An email thread has stalled. Prepare a follow-up.".to_string(),
                entity_id: Some("thread_smoke".to_string()),
                ..Default::default()
            },
        };
        let bundle =
            build_suggestion_afp_bundle("user_smoke", "thread_smoke", &result, Some("event_smoke"));
        let suggestion_afp =
            serde_json::from_value::<crate::message::AFPMessage>(bundle.suggestion_afp.clone())
                .expect("suggestion AFP");
        let suggestion_content = bundle
            .suggestion_afp
            .get("content")
            .cloned()
            .expect("suggestion content");
        let suggestion_proto = super::super::afp_to_proto(&suggestion_afp);

        db.store_message(&suggestion_proto, suggestion_content)
            .await
            .expect("store suggestion");
        store_proactive_companion_afps(&db, bundle.companion_afps).await;

        let rows = sqlx::query(
            r#"
            SELECT id, type, parent_id, content, store_in_relational
            FROM messages
            WHERE id = $1 OR parent_id = $1
            "#,
        )
        .bind(&suggestion_afp.id)
        .fetch_all(&db.pool)
        .await
        .expect("fetch stored proactive bundle");

        let suggestion_row = rows
            .iter()
            .find(|row| row.get::<String, _>("id") == suggestion_afp.id)
            .expect("stored suggestion row");
        assert_eq!(
            suggestion_row.get::<String, _>("type"),
            AFP_TYPE_PROACTIVE_SUGGESTION
        );

        let provenance_row = rows
            .iter()
            .find(|row| row.get::<String, _>("type") == AFP_TYPE_PROVENANCE_RECORD)
            .expect("stored provenance row");
        assert_eq!(
            provenance_row
                .get::<Option<String>, _>("parent_id")
                .as_deref(),
            Some(suggestion_afp.id.as_str())
        );
        assert!(provenance_row.get::<bool, _>("store_in_relational"));
        assert_eq!(
            provenance_row.get::<Value, _>("content")["source_message_ids"][0],
            "event_smoke"
        );
    }
}
