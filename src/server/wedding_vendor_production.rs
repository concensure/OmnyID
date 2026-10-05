/*
 * @module-id: rust.server.wedding-vendor-production
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

//! Server-owned wedding quote projection and restart reconciliation.

use super::*;
use crate::wedding_vendor_quote_orchestration::{
    due_deferral_resurface, is_wedding_vendor_quote_event, project_quote_event,
};
use std::collections::HashMap;

fn enabled_by_default_value(value: Option<&str>) -> bool {
    !matches!(
        value.map(str::trim).map(str::to_ascii_lowercase).as_deref(),
        Some("0" | "false" | "no" | "off")
    )
}

fn event_projection_enabled() -> bool {
    enabled_by_default_value(
        std::env::var("OMNYID_WEDDING_EVENT_QUOTE_PROJECTION_ENABLED")
            .ok()
            .as_deref(),
    )
}

fn env_enabled_by_default(name: &str) -> bool {
    enabled_by_default_value(std::env::var(name).ok().as_deref())
}

fn is_wedding_scoped(message: &AFPMessage) -> bool {
    message
        .supertags
        .iter()
        .any(|tag| tag.to_ascii_lowercase().contains("wedding"))
        || message
            .kind
            .as_deref()
            .is_some_and(|kind| kind.to_ascii_lowercase().contains("wedding_vendor"))
        || message
            .subtype
            .as_deref()
            .is_some_and(|kind| kind.to_ascii_lowercase().contains("wedding_vendor"))
}

pub(super) fn external_send_allowed(message: &AFPMessage) -> bool {
    !is_wedding_scoped(message) || env_enabled_by_default("OMNYID_WEDDING_EXTERNAL_SEND_ENABLED")
}

fn elapsed_since(timestamp: &str, now: chrono::DateTime<chrono::Utc>) -> Option<u64> {
    let timestamp = chrono::DateTime::parse_from_rfc3339(timestamp)
        .ok()?
        .with_timezone(&chrono::Utc);
    Some((now - timestamp).num_milliseconds().max(0) as u64)
}

fn missed_critical_boundary(decision: &AFPMessage, now: chrono::DateTime<chrono::Utc>) -> bool {
    decision
        .content
        .get("safety_envelope")
        .and_then(|value| value.get("critical_at"))
        .and_then(Value::as_str)
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .is_some_and(|critical| critical.with_timezone(&chrono::Utc) < now)
}

async fn store_generated_private_message(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    owner_user_id: &str,
    mut message: AFPMessage,
) -> Result<bool, String> {
    sign_server_generated_message(&mut message)?;
    let proto = app_to_proto(message.clone());
    let inserted = db
        .store_private_message(owner_user_id, &proto, message.content.clone())
        .await
        .map_err(|error| error.to_string())?;
    if inserted {
        metrics.inc_messages_stored();
        index_backlink_update(db, &message, Some(owner_user_id)).await;
        let _ = relay_tx.send(
            json!({
                "event": "message_stored",
                "message_id": proto.id,
                "thread_id": proto.thread_id,
                "type": proto.r#type,
                "owner_user_id": owner_user_id,
                "projection": "wedding_quote_to_decisionos",
            })
            .to_string(),
        );
    } else {
        metrics.inc_messages_replayed();
    }
    Ok(inserted)
}

pub(super) async fn project_inserted_wedding_quote(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    owner_user_id: Option<&str>,
    source: &AFPMessage,
) {
    if !event_projection_enabled() || !is_wedding_vendor_quote_event(source) {
        return;
    }
    metrics.inc_wedding_quote_events_seen();
    let Some(owner_user_id) = owner_user_id else {
        metrics.inc_wedding_quote_projection_blocked();
        tracing::warn!(
            quote_message_id = %source.id,
            "wedding quote projection skipped because no tenant owner was available"
        );
        return;
    };
    let projected_at = chrono::Utc::now();
    let batch = project_quote_event(source, projected_at);
    if batch.messages.is_empty() {
        metrics.inc_wedding_quote_projection_blocked();
        return;
    }
    for message in batch.messages {
        let is_decision = message.r#type == "decision_request";
        match store_generated_private_message(db, metrics, relay_tx, owner_user_id, message).await {
            Ok(true) if is_decision => {
                metrics.inc_wedding_quote_decisions_projected();
                if let Some(latency_ms) = elapsed_since(&source.timestamp, projected_at) {
                    metrics.observe_wedding_quote_projection_latency_ms(latency_ms);
                }
            }
            Ok(_) => {}
            Err(error) => {
                metrics.inc_wedding_quote_projection_blocked();
                tracing::error!(
                    quote_message_id = %source.id,
                    user_id = %owner_user_id,
                    %error,
                    "wedding quote projection persistence failed"
                );
            }
        }
    }
}

fn decision_id(message: &AFPMessage) -> Option<String> {
    message
        .content
        .get("decision_id")
        .and_then(Value::as_str)
        .or_else(|| {
            message
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("decision_id"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

async fn reconcile_user_wedding_quote_projections(
    state: &Arc<AppState>,
    owner_user_id: &str,
) -> Result<(), sqlx::Error> {
    let stored = state
        .db
        .recent_private_messages_for_user(owner_user_id, 1_000)
        .await?;
    let messages = stored.into_iter().map(proto_to_app).collect::<Vec<_>>();

    for quote in messages
        .iter()
        .filter(|message| is_wedding_vendor_quote_event(message))
    {
        project_inserted_wedding_quote(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            Some(owner_user_id),
            quote,
        )
        .await;
    }

    let decisions = messages
        .iter()
        .filter(|message| message.r#type == "decision_request")
        .filter_map(|message| decision_id(message).map(|id| (id, message)))
        .collect::<HashMap<_, _>>();
    for deferral in messages.iter().filter(|message| {
        matches!(message.kind.as_deref(), Some("wedding_decision_deferral"))
            || matches!(
                message.subtype.as_deref(),
                Some("wedding_decision_deferral")
            )
    }) {
        let Some(deferral_decision_id) = decision_id(deferral) else {
            continue;
        };
        let Some(original) = decisions.get(&deferral_decision_id) else {
            continue;
        };
        let now = chrono::Utc::now();
        let Some(resurface) = due_deferral_resurface(deferral, original, now) else {
            continue;
        };
        match store_generated_private_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            owner_user_id,
            resurface,
        )
        .await
        {
            Ok(true) => {
                state.metrics.inc_wedding_quote_decisions_resurfaced();
                if missed_critical_boundary(original, now) {
                    state.metrics.inc_wedding_quote_missed_critical_deadlines();
                }
            }
            Ok(false) => {}
            Err(error) => tracing::error!(
                user_id = %owner_user_id,
                deferral_id = %deferral.id,
                %error,
                "wedding quote resurface persistence failed"
            ),
        }
    }
    Ok(())
}

pub(super) async fn wedding_quote_reconciliation_tick(state: Arc<AppState>) {
    if !event_projection_enabled() {
        return;
    }
    let user_ids = match state.db.list_user_ids().await {
        Ok(user_ids) => user_ids,
        Err(error) => {
            tracing::error!(%error, "wedding quote reconciliation could not list active users");
            return;
        }
    };
    for user_id in user_ids {
        if let Err(error) = reconcile_user_wedding_quote_projections(&state, &user_id).await {
            tracing::warn!(
                user_id = %user_id,
                %error,
                "wedding quote reconciliation skipped one user"
            );
        }
    }
}

pub(super) async fn wedding_quote_reconciliation_loop(state: Arc<AppState>) {
    tracing::info!("wedding quote reconciliation watcher starting (300s interval)");
    tokio::time::sleep(tokio::time::Duration::from_secs(20)).await;
    loop {
        wedding_quote_reconciliation_tick(state.clone()).await;
        tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decision_identity_reads_content_then_metadata() {
        let mut message = AFPMessage {
            protocol: "afp/1.0".to_string(),
            id: "id".to_string(),
            thread_id: "thread".to_string(),
            parent_id: None,
            from: "system".to_string(),
            to: vec![],
            timestamp: "2026-10-06T00:00:00Z".to_string(),
            r#type: "decision_request".to_string(),
            kind: None,
            supertags: vec![],
            subtype: None,
            content: json!({"decision_id": "content-id"}),
            metadata: Some(json!({"decision_id": "metadata-id"})),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        };
        assert_eq!(decision_id(&message).as_deref(), Some("content-id"));
        message.content = json!({});
        assert_eq!(decision_id(&message).as_deref(), Some("metadata-id"));
    }

    #[test]
    fn feature_flag_parser_is_fail_open_only_for_missing_or_enabled_values() {
        assert!(enabled_by_default_value(None));
        assert!(enabled_by_default_value(Some("true")));
        assert!(!enabled_by_default_value(Some(" FALSE ")));
        assert!(!enabled_by_default_value(Some("off")));
    }

    #[test]
    fn wedding_send_scope_is_detected_without_affecting_unrelated_messages() {
        let mut message = AFPMessage {
            protocol: "afp/1.0".to_string(),
            id: "id".to_string(),
            thread_id: "thread".to_string(),
            parent_id: None,
            from: "system".to_string(),
            to: vec![],
            timestamp: "2026-10-06T00:00:00Z".to_string(),
            r#type: "message".to_string(),
            kind: None,
            supertags: vec![],
            subtype: None,
            content: json!({}),
            metadata: None,
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        };
        assert!(!is_wedding_scoped(&message));
        message
            .supertags
            .push("wedding_vendor_outreach".to_string());
        assert!(is_wedding_scoped(&message));
    }
}
