use std::{path::PathBuf, time::Duration};

use aws_sdk_s3::{
    Client as S3Client, Config as S3Config,
    config::{Credentials, Region},
    primitives::ByteStream,
};
use chrono::Utc;
use serde_json::{Value, json};
use sqlx::Row;
use tokio::fs;
use tracing::{info, warn};
use ulid::Ulid;

use crate::{
    afp::Message as ProtoMessage,
    coordination_bus::{CoordFamily, DaemonCursor, coordination_bus},
    curator_runtime::run_curator_backfill_pass,
    daemon_registry,
    db::Db,
    knowledge_curator::{DaemonKind, MergeSuggestionStatus},
};
use tokio::task::JoinHandle;

/// Shared shutdown signal: send `()` to ask all daemons to stop gracefully.
pub type ShutdownRx = tokio::sync::watch::Receiver<bool>;
pub type ShutdownTx = tokio::sync::watch::Sender<bool>;

pub fn shutdown_channel() -> (ShutdownTx, ShutdownRx) {
    tokio::sync::watch::channel(false)
}

const ARCHIVE_MIN_IDLE_SECS: u64 = 30;
const HEALTH_MIN_IDLE_SECS: u64 = 60;
const HEALTH_MAINTENANCE_AGENT: &str = "omnyid://daemon/health-maintenance";
const HEALTH_MAINTENANCE_SUMMARY_TYPE: &str = "insight";
const HEALTH_MAINTENANCE_SUMMARY_SUBTYPE: &str = "maintenance_summary";
const HEALTH_MAINTENANCE_SUMMARY_ID: &str = "insight.health-maintenance.current";
const HEALTH_MAINTENANCE_SUMMARY_THREAD_ID: &str = "thread.insight.health-maintenance";
const HEALTH_DUPLICATE_SUGGESTION_TYPE: &str = "merge_suggestion";
const HEALTH_DUPLICATE_SUGGESTION_SUBTYPE: &str = "duplicate_detection";
const HEALTH_DUPLICATE_SUGGESTION_RETENTION_LIMIT: i64 = 100;

fn should_emit_health_insight(
    archived_last_day: i64,
    archive_backlog: i64,
    knowledge_cards: i64,
) -> bool {
    archived_last_day > 0 || archive_backlog > 0 || knowledge_cards > 0
}

pub fn start_archive_daemon(db: Db, mut shutdown: ShutdownRx) -> JoinHandle<()> {
    tokio::spawn(async move {
        info!("Archive & cold storage daemon started");
        let mut idle_secs: u64 = 600;
        let mut wake = coordination_bus().subscribe();
        loop {
            let (processed, errors) = run_archive_pass(&db).await;
            emit_daemon_heartbeats(&db, DaemonKind::ArchiveColdStorage, processed, errors).await;
            if processed > 0 {
                idle_secs = 600;
            }
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(idle_secs)) => {
                    idle_secs = 600;
                }
                // Bridge A: coordination events that may add archivable entries.
                res = wake.recv() => {
                    use tokio::sync::broadcast::error::RecvError;
                    match res {
                        Ok(_) | Err(RecvError::Lagged(_)) => {
                            idle_secs = ARCHIVE_MIN_IDLE_SECS;
                        }
                        Err(RecvError::Closed) => break,
                    }
                }
                _ = shutdown.changed() => {
                    if *shutdown.borrow() {
                        info!("Archive daemon: graceful shutdown");
                        break;
                    }
                }
            }
        }
    })
}

pub fn start_health_maintenance_daemon(db: Db, mut shutdown: ShutdownRx) -> JoinHandle<()> {
    tokio::spawn(async move {
        info!("Health & maintenance daemon started");
        let mut idle_secs: u64 = 900;
        let mut wake = coordination_bus().subscribe();
        let mut cursor = DaemonCursor::new(&[
            CoordFamily::Ingestion,
            CoordFamily::Watcher,
            CoordFamily::Other,
        ]);
        loop {
            let (processed, errors) = if cursor.should_run() {
                let r = run_health_pass(&db).await;
                cursor.commit();
                r
            } else {
                (0, 0)
            };
            match daemon_registry::prune_operational_daemon_history(&db).await {
                Ok((0, 0, 0)) => {}
                Ok((heartbeats, curator_audits, rate_limit_rows)) => {
                    info!(heartbeats, curator_audits, rate_limit_rows, "Pruned old history")
                }
                Err(err) => {
                    warn!(%err, "Failed to prune daemon history; check DB connectivity and retention indexes")
                }
            }
            let (runbook_processed, runbook_errors) = crate::runbook_hooks::maintenance_pass(&db).await;
            emit_daemon_heartbeats(&db, DaemonKind::HealthMaintenance,
                processed + runbook_processed, errors + runbook_errors).await;
            if processed > 0 {
                idle_secs = 900;
            }
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(idle_secs)) => {
                    idle_secs = 900;
                }
                // Bridge A: new ingestion/watcher activity may create backlink or duplicate-detection work.
                res = wake.recv() => {
                    use tokio::sync::broadcast::error::RecvError;
                    match res {
                        Ok(w) => {
                            if matches!(w.family, CoordFamily::Ingestion | CoordFamily::Watcher | CoordFamily::Other) {
                                idle_secs = HEALTH_MIN_IDLE_SECS;
                            }
                        }
                        Err(RecvError::Lagged(_)) => { idle_secs = HEALTH_MIN_IDLE_SECS; }
                        Err(RecvError::Closed) => break,
                    }
                }
                _ = shutdown.changed() => {
                    if *shutdown.borrow() {
                        info!("Health maintenance daemon: graceful shutdown");
                        break;
                    }
                }
            }
        }
    })
}

pub async fn emit_daemon_heartbeats(db: &Db, daemon_kind: DaemonKind, processed: u32, errors: u32) {
    let Ok(user_ids) = db.list_user_ids().await else {
        return;
    };

    for user_id in user_ids {
        let Ok(Some(registration)) =
            daemon_registry::get_active_daemon_for_kind(db, &user_id, daemon_kind.clone()).await
        else {
            continue;
        };
        if let Err(err) = daemon_registry::record_heartbeat(
            db,
            &registration.daemon_id,
            &user_id,
            0,
            processed,
            0,
            errors,
        )
        .await
        {
            warn!(%err, daemon = daemon_kind_slug(&daemon_kind), "Failed to persist daemon heartbeat");
        }
    }
}

async fn run_archive_pass(db: &Db) -> (u32, u32) {
    let Ok(user_ids) = db.list_user_ids().await else {
        return (0, 1);
    };
    let mut processed = 0u32;
    let mut errors = 0u32;
    for user_id in user_ids {
        let Ok(Some(_)) = daemon_registry::get_active_daemon_for_kind(
            db,
            &user_id,
            DaemonKind::ArchiveColdStorage,
        )
        .await
        else {
            continue;
        };
        if let Err(err) = db.ensure_user_private_schema(&user_id).await {
            errors += 1;
            warn!(%err, %user_id, "Archive daemon failed to ensure tenant schema");
            continue;
        }
        match archive_user_messages(db, &user_id).await {
            Ok(count) => processed += count,
            Err(err) => {
                errors += 1;
                warn!(%err, %user_id, "Archive daemon pass failed for user");
            }
        }
    }
    (processed, errors)
}

async fn archive_user_messages(db: &Db, user_id: &str) -> Result<u32, sqlx::Error> {
    let rows = sqlx::query(&format!(
        r#"
        SELECT id::text AS id, thread_id, type, subtype, timestamp::text AS timestamp,
               content, metadata, encryption, expires_at::text AS expires_at, summary
        FROM {} m
        WHERE NOT EXISTS (
            SELECT 1 FROM afp_archive_index ai WHERE ai.user_id = $1 AND ai.message_id = m.id::text
        )
        ORDER BY timestamp ASC
        LIMIT 100
        "#,
        tenant_messages_table(user_id)
    ))
    .bind(user_id)
    .fetch_all(&db.pool)
    .await?;

    let archive_root = archive_root_dir();
    let object_store = seaweedfs_client();
    let mut processed = 0u32;

    for row in rows {
        let message_id: String = row.try_get("id").unwrap_or_default();
        let content: Value = row.try_get("content").unwrap_or_else(|_| json!({}));
        let metadata = row.try_get::<Option<Value>, _>("metadata").ok().flatten();
        let expires_at = row
            .try_get::<Option<String>, _>("expires_at")
            .ok()
            .flatten();
        if !should_archive_now(&content, metadata.as_ref(), expires_at.as_deref()) {
            continue;
        }

        let timestamp: String = row
            .try_get("timestamp")
            .unwrap_or_else(|_| Utc::now().to_rfc3339());
        let thread_id: String = row.try_get("thread_id").unwrap_or_default();
        let message_type: String = row.try_get("type").unwrap_or_default();
        let subtype = row.try_get::<Option<String>, _>("subtype").ok().flatten();
        let summary = row
            .try_get::<Option<String>, _>("summary")
            .ok()
            .flatten()
            .unwrap_or_default();
        let encryption = row.try_get::<Option<Value>, _>("encryption").ok().flatten();

        let archive_key = archive_key_for(user_id, &timestamp, &message_id);
        let payload = json!({
            "message_id": message_id,
            "thread_id": thread_id,
            "type": message_type,
            "subtype": subtype,
            "timestamp": timestamp,
            "content": content,
            "metadata": metadata,
            "encryption": encryption,
        });
        let payload_bytes = match serde_json::to_vec(&payload) {
            Ok(b) => b,
            Err(err) => {
                warn!(%err, %message_id, "Archive payload serialization failed; skipping message");
                continue;
            }
        };
        let archive_key_str = archive_key.to_string_lossy().replace('\\', "/");
        let uploaded = if let Some(object_store) = &object_store {
            upload_archive_payload(object_store, &archive_key_str, payload_bytes.clone()).await
        } else {
            persist_archive_locally(&archive_root, &archive_key, &payload_bytes).await
        };
        if !uploaded {
            continue;
        }

        db.upsert_archive_index_entry(
            user_id,
            payload
                .get("message_id")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            payload
                .get("thread_id")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            payload
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            &archive_key_str,
            json!({
                "summary": summary,
                "timestamp": payload.get("timestamp"),
                "subtype": payload.get("subtype"),
                "archive_reason": "expires_or_archive_after",
                "storage_backend": if object_store.is_some() { "seaweedfs" } else { "filesystem_fallback" },
            }),
        )
        .await?;
        let deleted = db
            .delete_private_message_by_id(user_id, &message_id)
            .await?;
        if deleted == 0 {
            warn!(
                %user_id,
                %message_id,
                "Archive index written but hot message row was already absent"
            );
        }
        processed += 1;
    }

    Ok(processed)
}

async fn run_health_pass(db: &Db) -> (u32, u32) {
    let Ok(user_ids) = db.list_user_ids().await else {
        return (0, 1);
    };
    let mut processed = 0u32;
    let mut errors = 0u32;
    for user_id in user_ids {
        let Ok(Some(_)) = daemon_registry::get_active_daemon_for_kind(
            db,
            &user_id,
            DaemonKind::HealthMaintenance,
        )
        .await
        else {
            continue;
        };
        if let Err(err) = db.ensure_user_private_schema(&user_id).await {
            errors += 1;
            warn!(%err, %user_id, "Health daemon failed to ensure tenant schema");
            continue;
        }
        match inspect_user_health(db, &user_id).await {
            Ok(count) => processed += count,
            Err(err) => {
                errors += 1;
                warn!(%err, %user_id, "Health daemon pass failed for user");
            }
        }
    }
    (processed, errors)
}

async fn inspect_user_health(db: &Db, user_id: &str) -> Result<u32, sqlx::Error> {
    let mut processed = run_curator_backfill_pass(db, user_id, 20).await?;
    processed += repair_legacy_graph_messages(db, user_id).await?;
    processed += repair_reciprocal_backlinks(db, user_id).await?;
    processed += create_duplicate_suggestions(db, user_id).await?;
    processed += emit_health_insight(db, user_id).await?;
    Ok(processed)
}

fn canonical_message_reference(target: &str, link_type: &str, label: Option<&str>) -> Value {
    let mut reference = serde_json::Map::new();
    reference.insert("type".to_string(), Value::String("message".to_string()));
    reference.insert("target".to_string(), Value::String(target.to_string()));
    if let Some(label) = label.map(str::trim).filter(|value| !value.is_empty()) {
        reference.insert("label".to_string(), Value::String(label.to_string()));
    }
    reference.insert(
        "metadata".to_string(),
        json!({
            "link_type": link_type,
        }),
    );
    Value::Object(reference)
}

fn canonical_graph_references_for_message(message_type: &str, content: &Value) -> Vec<Value> {
    match message_type {
        "knowledge_card" => content
            .get("source_id")
            .and_then(Value::as_str)
            .or_else(|| content.get("source_message_id").and_then(Value::as_str))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|target| {
                vec![canonical_message_reference(
                    target,
                    "derived_from",
                    Some("source material"),
                )]
            })
            .unwrap_or_default(),
        "backlink_update" => {
            let mut refs = Vec::new();
            for (target, label) in [
                (
                    content
                        .get("source_id")
                        .and_then(Value::as_str)
                        .or_else(|| content.get("source_message_id").and_then(Value::as_str)),
                    "similar source",
                ),
                (
                    content
                        .get("target_id")
                        .and_then(Value::as_str)
                        .or_else(|| content.get("target_message_id").and_then(Value::as_str)),
                    "similar target",
                ),
            ] {
                let Some(target) = target.map(str::trim).filter(|value| !value.is_empty()) else {
                    continue;
                };
                refs.push(canonical_message_reference(
                    target,
                    "related_to",
                    Some(label),
                ));
            }
            refs
        }
        "merge_suggestion" => content
            .get("message_ids")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|target| {
                canonical_message_reference(
                    target,
                    "duplicate_candidate",
                    Some("duplicate candidate"),
                )
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn references_need_graph_normalization(references: &Value) -> bool {
    let Some(items) = references.as_array() else {
        return true;
    };
    if items.is_empty() {
        return true;
    }
    items.iter().any(|item| {
        !item.is_object()
            || item
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .is_empty()
    })
}

async fn repair_legacy_graph_messages(db: &Db, user_id: &str) -> Result<u32, sqlx::Error> {
    let messages_table = tenant_messages_table(user_id);
    let rows = sqlx::query(&format!(
        r#"
        SELECT
            id,
            thread_id,
            parent_id,
            from_agent,
            to_agents,
            timestamp::text AS timestamp,
            type,
            kind,
            content,
            views,
            signature,
            encryption,
            "references",
            attachments,
            store_in_relational,
            subtype,
            metadata,
            supertags
        FROM {messages_table}
        WHERE type = ANY($1::text[])
          AND (
              COALESCE(jsonb_array_length("references"), 0) = 0
              OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements("references") AS ref
                  WHERE jsonb_typeof(ref) <> 'object'
              )
          )
        ORDER BY timestamp DESC, created_at DESC, id DESC
        LIMIT 20
        "#
    ))
    .bind(vec![
        "knowledge_card".to_string(),
        "backlink_update".to_string(),
        HEALTH_DUPLICATE_SUGGESTION_TYPE.to_string(),
    ])
    .fetch_all(&db.pool)
    .await?;

    let mut repaired = 0u32;
    for row in rows {
        let message_type = row.try_get::<String, _>("type").unwrap_or_default();
        let content = row
            .try_get::<Value, _>("content")
            .unwrap_or_else(|_| json!({}));
        let existing_references = row
            .try_get::<Value, _>("references")
            .unwrap_or_else(|_| Value::Array(Vec::new()));
        if !references_need_graph_normalization(&existing_references) {
            continue;
        }
        let canonical_references = canonical_graph_references_for_message(&message_type, &content);
        if canonical_references.is_empty() {
            continue;
        }

        let proto = ProtoMessage {
            protocol: "afp-v1".to_string(),
            id: row.try_get::<String, _>("id").unwrap_or_default(),
            thread_id: row.try_get::<String, _>("thread_id").unwrap_or_default(),
            parent_id: row
                .try_get::<Option<String>, _>("parent_id")
                .unwrap_or(None)
                .unwrap_or_default(),
            from: row.try_get::<String, _>("from_agent").unwrap_or_default(),
            to: serde_json::from_value(
                row.try_get::<Value, _>("to_agents")
                    .unwrap_or_else(|_| Value::Array(Vec::new())),
            )
            .unwrap_or_default(),
            timestamp: row.try_get::<String, _>("timestamp").unwrap_or_default(),
            r#type: message_type,
            kind: row.try_get::<Option<String>, _>("kind").unwrap_or(None),
            supertags: row
                .try_get::<Vec<String>, _>("supertags")
                .unwrap_or_default(),
            content: content.to_string(),
            signature: row.try_get::<String, _>("signature").unwrap_or_default(),
            encryption: row
                .try_get::<Value, _>("encryption")
                .unwrap_or_else(|_| json!({}))
                .to_string(),
            views: row
                .try_get::<Value, _>("views")
                .unwrap_or_else(|_| Value::Array(Vec::new()))
                .to_string(),
            references: Value::Array(canonical_references).to_string(),
            attachments: row
                .try_get::<Value, _>("attachments")
                .unwrap_or_else(|_| Value::Array(Vec::new()))
                .to_string(),
            store_in_relational: row
                .try_get::<bool, _>("store_in_relational")
                .unwrap_or(false),
            subtype: row
                .try_get::<Option<String>, _>("subtype")
                .unwrap_or(None)
                .unwrap_or_default(),
            metadata: row
                .try_get::<Option<Value>, _>("metadata")
                .unwrap_or(None)
                .map(|value| value.to_string())
                .unwrap_or_default(),
        };

        db.upsert_private_message(user_id, &proto, content).await?;
        repaired += 1;
    }

    Ok(repaired)
}

async fn repair_reciprocal_backlinks(db: &Db, user_id: &str) -> Result<u32, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT a.source_id, a.target_id, a.link_kind, a.similarity, a.entities, a.curator_run_id
        FROM afp_backlinks a
        LEFT JOIN afp_backlinks b
          ON b.user_id = a.user_id
         AND b.source_id = a.target_id
         AND b.target_id = a.source_id
         AND b.link_kind = a.link_kind
        WHERE a.user_id = $1
          AND b.backlink_id IS NULL
        LIMIT 20
        "#,
    )
    .bind(user_id)
    .fetch_all(&db.pool)
    .await?;

    let mut repaired = 0u32;
    for row in rows {
        let reverse = crate::knowledge_curator::BacklinkRecord {
            backlink_id: Ulid::new().to_string(),
            user_id: user_id.to_string(),
            source_id: row.get("target_id"),
            target_id: row.get("source_id"),
            link_kind: match row.get::<String, _>("link_kind").as_str() {
                "entity_overlap" => crate::knowledge_curator::BacklinkKind::EntityOverlap,
                "explicit_ref" => crate::knowledge_curator::BacklinkKind::ExplicitRef,
                "temporal_proximity" => crate::knowledge_curator::BacklinkKind::TemporalProximity,
                _ => crate::knowledge_curator::BacklinkKind::SemanticSimilarity,
            },
            ref_type: row
                .try_get::<Option<String>, _>("ref_type")
                .ok()
                .flatten()
                .unwrap_or_else(|| "mentions".to_string()),
            similarity: row.try_get::<Option<f32>, _>("similarity").ok().flatten(),
            entities: row
                .try_get::<Vec<String>, _>("entities")
                .unwrap_or_default(),
            created_at: Utc::now().to_rfc3339(),
            curator_run_id: row
                .try_get::<Option<String>, _>("curator_run_id")
                .ok()
                .flatten()
                .unwrap_or_default(),
        };
        db.upsert_backlink_record(&reverse).await?;
        repaired += 1;
    }
    Ok(repaired)
}

async fn create_duplicate_suggestions(db: &Db, user_id: &str) -> Result<u32, sqlx::Error> {
    let rows = sqlx::query(&format!(
        r#"
        SELECT
            a.id AS source_id,
            b.id AS target_id,
            GREATEST(0.0, 1 - (a.embedding <=> b.embedding)) AS similarity
        FROM {table} a
        JOIN {table} b
          ON a.id < b.id
        WHERE a.embedding IS NOT NULL
          AND b.embedding IS NOT NULL
          AND a.timestamp > NOW() - INTERVAL '45 days'
          AND b.timestamp > NOW() - INTERVAL '45 days'
          AND (1 - (a.embedding <=> b.embedding)) >= 0.97
        ORDER BY a.embedding <=> b.embedding
        LIMIT 8
        "#,
        table = tenant_messages_table(user_id)
    ))
    .fetch_all(&db.pool)
    .await?;

    let mut created = 0u32;
    for row in rows {
        let source_id: String = row.get("source_id");
        let target_id: String = row.get("target_id");
        if duplicate_suggestion_exists(db, user_id, &source_id, &target_id).await? {
            continue;
        }
        let similarity = row.try_get::<f64, _>("similarity").unwrap_or(0.0) as f32;
        let content = json!({
            "suggestion_id": format!("merge.{}", Ulid::new()),
            "message_ids": [source_id, target_id],
            "similarity": similarity,
            "rationale": "Health maintenance found a near-duplicate pair via pgvector similarity.",
            "status": match MergeSuggestionStatus::Pending {
                MergeSuggestionStatus::Pending => "pending",
                MergeSuggestionStatus::Approved => "approved",
                MergeSuggestionStatus::Dismissed => "dismissed",
            },
        });
        let msg = ProtoMessage {
            protocol: "afp-v1".to_string(),
            id: format!("merge-suggestion.{}", Ulid::new()),
            thread_id: format!("thread.merge.{}", Ulid::new()),
            parent_id: String::new(),
            from: "omnyid://daemon/health-maintenance".to_string(),
            to: vec!["omnyid://workspace/user".to_string()],
            timestamp: Utc::now().to_rfc3339(),
            r#type: HEALTH_DUPLICATE_SUGGESTION_TYPE.to_string(),
            kind: None,
            supertags: vec![],
            content: content.to_string(),
            signature: String::new(),
            encryption: "{}".to_string(),
            views: "[]".to_string(),
            references: json!([
                canonical_message_reference(
                    &source_id,
                    "duplicate_candidate",
                    Some("duplicate candidate")
                ),
                canonical_message_reference(
                    &target_id,
                    "duplicate_candidate",
                    Some("duplicate candidate")
                )
            ])
            .to_string(),
            attachments: "[]".to_string(),
            store_in_relational: false,
            subtype: HEALTH_DUPLICATE_SUGGESTION_SUBTYPE.to_string(),
            metadata: json!({"created_by": "health_maintenance"}).to_string(),
        };
        let _ = db.store_private_message(user_id, &msg, content).await?;
        let _ = db
            .prune_private_messages_to_recent_limit(
                user_id,
                HEALTH_DUPLICATE_SUGGESTION_TYPE,
                HEALTH_DUPLICATE_SUGGESTION_SUBTYPE,
                HEALTH_MAINTENANCE_AGENT,
                HEALTH_DUPLICATE_SUGGESTION_RETENTION_LIMIT,
            )
            .await;
        created += 1;
    }
    Ok(created)
}

async fn duplicate_suggestion_exists(
    db: &Db,
    user_id: &str,
    source_id: &str,
    target_id: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query(&format!(
        r#"
        SELECT id
        FROM {}
        WHERE type = $1
          AND (
              reference_targets @> ARRAY[$2::text, $3::text]
              OR (
                  "references" @> $4::jsonb
                  AND "references" @> $5::jsonb
              )
          )
        LIMIT 1
        "#,
        tenant_messages_table(user_id)
    ))
    .bind(HEALTH_DUPLICATE_SUGGESTION_TYPE)
    .bind(source_id)
    .bind(target_id)
    .bind(json!([source_id]))
    .bind(json!([target_id]))
    .fetch_optional(&db.pool)
    .await?;
    Ok(row.is_some())
}

async fn emit_health_insight(db: &Db, user_id: &str) -> Result<u32, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
            COUNT(*) FILTER (WHERE archived_at > NOW() - INTERVAL '1 day') AS archived_last_day,
            COUNT(*) FILTER (WHERE restored_at IS NULL) AS archive_backlog,
            COUNT(*) AS knowledge_cards
        FROM afp_archive_index ai
        FULL OUTER JOIN afp_knowledge_cards kc
          ON kc.user_id = ai.user_id
        WHERE COALESCE(ai.user_id, kc.user_id) = $1
        "#,
    )
    .bind(user_id)
    .fetch_one(&db.pool)
    .await?;
    let archived_last_day: i64 = row.try_get("archived_last_day").unwrap_or(0);
    let archive_backlog: i64 = row.try_get("archive_backlog").unwrap_or(0);
    let knowledge_cards: i64 = row.try_get("knowledge_cards").unwrap_or(0);
    if !should_emit_health_insight(archived_last_day, archive_backlog, knowledge_cards) {
        return Ok(0);
    }
    let content = json!({
        "title": "Knowledge maintenance summary",
        "body": format!(
            "Archive backlog: {archive_backlog}. Knowledge cards indexed: {knowledge_cards}. Messages archived in the last day: {archived_last_day}."
        ),
        "confidence": 0.72,
        "metrics": {
            "archive_backlog": archive_backlog,
            "knowledge_cards": knowledge_cards,
            "archived_last_day": archived_last_day,
        }
    });
    let msg = ProtoMessage {
        protocol: "afp-v1".to_string(),
        id: HEALTH_MAINTENANCE_SUMMARY_ID.to_string(),
        thread_id: HEALTH_MAINTENANCE_SUMMARY_THREAD_ID.to_string(),
        parent_id: String::new(),
        from: HEALTH_MAINTENANCE_AGENT.to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: Utc::now().to_rfc3339(),
        r#type: HEALTH_MAINTENANCE_SUMMARY_TYPE.to_string(),
        kind: None,
        supertags: vec![],
        content: content.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: "[]".to_string(),
        attachments: "[]".to_string(),
        store_in_relational: false,
        subtype: HEALTH_MAINTENANCE_SUMMARY_SUBTYPE.to_string(),
        metadata: json!({"created_by": "health_maintenance"}).to_string(),
    };
    let changed = db
        .store_private_snapshot_message(user_id, &msg, content)
        .await?;
    Ok(u32::from(changed))
}

fn should_archive_now(content: &Value, metadata: Option<&Value>, expires_at: Option<&str>) -> bool {
    expires_at
        .and_then(parse_timestamp)
        .map(|ts| ts <= Utc::now())
        .unwrap_or(false)
        || timestamp_from_field(content, "archive_after")
            .map(|ts| ts <= Utc::now())
            .unwrap_or(false)
        || metadata
            .and_then(|value| timestamp_from_value(value.get("archive_after")))
            .map(|ts| ts <= Utc::now())
            .unwrap_or(false)
}

async fn persist_archive_locally(root: &PathBuf, archive_key: &PathBuf, payload: &[u8]) -> bool {
    let archive_path = root.join(archive_key);
    if let Some(parent) = archive_path.parent() {
        let _ = fs::create_dir_all(parent).await;
    }
    fs::write(&archive_path, payload).await.is_ok()
}

pub async fn upload_archive_payload(
    client: &ObjectStoreClient,
    key: &str,
    payload: Vec<u8>,
) -> bool {
    upload_object_payload(client, key, payload, "application/json").await
}

pub async fn upload_object_payload(
    client: &ObjectStoreClient,
    key: &str,
    payload: Vec<u8>,
    content_type: &str,
) -> bool {
    client
        .client
        .put_object()
        .bucket(&client.bucket)
        .key(prefixed_object_key(client, key))
        .body(ByteStream::from(payload))
        .content_type(content_type)
        .send()
        .await
        .is_ok()
}

pub async fn download_archive_payload(
    client: &ObjectStoreClient,
    key: &str,
) -> Result<Vec<u8>, String> {
    download_object_payload(client, key).await
}

pub async fn delete_object_payload(client: &ObjectStoreClient, key: &str) -> Result<(), String> {
    client
        .client
        .delete_object()
        .bucket(&client.bucket)
        .key(prefixed_object_key(client, key))
        .send()
        .await
        .map_err(|err| format!("SeaweedFS object delete failed: {err}"))?;
    Ok(())
}

pub async fn download_object_payload(
    client: &ObjectStoreClient,
    key: &str,
) -> Result<Vec<u8>, String> {
    let response = client
        .client
        .get_object()
        .bucket(&client.bucket)
        .key(prefixed_object_key(client, key))
        .send()
        .await
        .map_err(|err| format!("SeaweedFS object download failed: {err}"))?;
    let bytes = response
        .body
        .collect()
        .await
        .map_err(|err| format!("SeaweedFS object body read failed: {err}"))?;
    Ok(bytes.into_bytes().to_vec())
}

pub fn seaweedfs_client() -> Option<ObjectStoreClient> {
    let endpoint = std::env::var("OMNYID_SEAWEEDFS_S3_ENDPOINT")
        .or_else(|_| std::env::var("OMNYID_SEAWEEDFS_ENDPOINT"))
        .ok()?;
    let access_key =
        crate::secret_manager::read_process_secret_trimmed("OMNYID_SEAWEEDFS_ACCESS_KEY")?;
    let secret_key =
        crate::secret_manager::read_process_secret_trimmed("OMNYID_SEAWEEDFS_SECRET_KEY")?;
    let bucket = std::env::var("OMNYID_SEAWEEDFS_BUCKET").ok()?;
    let prefix = std::env::var("OMNYID_SEAWEEDFS_PREFIX").unwrap_or_default();
    let region =
        std::env::var("OMNYID_SEAWEEDFS_REGION").unwrap_or_else(|_| "us-east-1".to_string());
    let config = S3Config::builder()
        .behavior_version_latest()
        .region(Region::new(region))
        .credentials_provider(Credentials::new(
            access_key, secret_key, None, None, "omnyid",
        ))
        .endpoint_url(endpoint)
        .force_path_style(true)
        .build();
    Some(ObjectStoreClient {
        bucket,
        prefix,
        client: S3Client::from_conf(config),
    })
}

pub async fn check_seaweedfs_access() -> Option<Result<(), String>> {
    let client = seaweedfs_client()?;
    let probe = client
        .client
        .head_bucket()
        .bucket(&client.bucket)
        .send()
        .await;
    let failure = |_| "authenticated object-store probe failed".to_string();
    Some(probe.map(|_| ()).map_err(failure))
}

fn archive_root_dir() -> PathBuf {
    std::env::var("OMNYID_ARCHIVE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("omnyid-cold-storage"))
}

fn archive_key_for(user_id: &str, timestamp: &str, message_id: &str) -> PathBuf {
    let date = parse_timestamp(timestamp)
        .map(|value| value.format("%Y/%m/%d").to_string())
        .unwrap_or_else(|| "undated".to_string());
    PathBuf::from(user_id)
        .join(date)
        .join(format!("{message_id}.json"))
}

fn prefixed_object_key(client: &ObjectStoreClient, key: &str) -> String {
    if client.prefix.trim().is_empty() {
        key.to_string()
    } else {
        format!("{}/{}", client.prefix.trim_matches('/'), key)
    }
}

fn daemon_kind_slug(kind: &DaemonKind) -> &'static str {
    match kind {
        DaemonKind::KnowledgeCurator => "knowledge_curator",
        DaemonKind::LedgerIngestion => "ledger_ingestion",
        DaemonKind::EmailGateway => "email_gateway",
        DaemonKind::RelationalSync => "relational_sync",
        DaemonKind::ArchiveColdStorage => "archive_cold_storage",
        DaemonKind::HealthMaintenance => "health_maintenance",
    }
}

fn timestamp_from_field(content: &Value, field: &str) -> Option<chrono::DateTime<Utc>> {
    timestamp_from_value(content.get(field))
}

fn timestamp_from_value(value: Option<&Value>) -> Option<chrono::DateTime<Utc>> {
    value.and_then(Value::as_str).and_then(parse_timestamp)
}

fn parse_timestamp(value: &str) -> Option<chrono::DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn tenant_messages_table(user_id: &str) -> String {
    format!("\"{}\".messages", tenant_schema_name(user_id))
}

use crate::db::tenant_schema_name;

pub struct ObjectStoreClient {
    bucket: String,
    prefix: String,
    client: S3Client,
}

#[cfg(test)]
mod tests {
    use super::{
        HEALTH_DUPLICATE_SUGGESTION_TYPE, canonical_graph_references_for_message,
        canonical_message_reference, references_need_graph_normalization,
        should_emit_health_insight,
    };
    use serde_json::json;

    #[test]
    fn canonical_message_reference_uses_structured_afp_shape() {
        assert_eq!(
            canonical_message_reference("msg_1", "derived_from", Some("source material")),
            json!({
                "type": "message",
                "target": "msg_1",
                "label": "source material",
                "metadata": {
                    "link_type": "derived_from"
                }
            })
        );
    }

    #[test]
    fn canonical_graph_references_cover_legacy_graph_message_types() {
        assert_eq!(
            canonical_graph_references_for_message(
                "knowledge_card",
                &json!({ "source_id": "msg_source" })
            ),
            vec![json!({
                "type": "message",
                "target": "msg_source",
                "label": "source material",
                "metadata": {
                    "link_type": "derived_from"
                }
            })]
        );

        assert_eq!(
            canonical_graph_references_for_message(
                "backlink_update",
                &json!({
                    "source_id": "msg_a",
                    "target_id": "msg_b"
                })
            ),
            vec![
                json!({
                    "type": "message",
                    "target": "msg_a",
                    "label": "similar source",
                    "metadata": {
                        "link_type": "related_to"
                    }
                }),
                json!({
                    "type": "message",
                    "target": "msg_b",
                    "label": "similar target",
                    "metadata": {
                        "link_type": "related_to"
                    }
                })
            ]
        );

        assert_eq!(
            canonical_graph_references_for_message(
                HEALTH_DUPLICATE_SUGGESTION_TYPE,
                &json!({ "message_ids": ["msg_a", "msg_b"] })
            ),
            vec![
                json!({
                    "type": "message",
                    "target": "msg_a",
                    "label": "duplicate candidate",
                    "metadata": {
                        "link_type": "duplicate_candidate"
                    }
                }),
                json!({
                    "type": "message",
                    "target": "msg_b",
                    "label": "duplicate candidate",
                    "metadata": {
                        "link_type": "duplicate_candidate"
                    }
                })
            ]
        );
    }

    #[test]
    fn references_need_graph_normalization_detects_legacy_and_empty_shapes() {
        assert!(references_need_graph_normalization(&json!([])));
        assert!(references_need_graph_normalization(&json!(["msg_1"])));
        assert!(!references_need_graph_normalization(&json!([
            {
                "type": "message",
                "target": "msg_1",
                "metadata": { "link_type": "related_to" }
            }
        ])));
    }

    #[test]
    fn health_insight_skips_empty_noop_summary() {
        assert!(!should_emit_health_insight(0, 0, 0));
    }

    #[test]
    fn health_insight_emits_when_any_metric_changes() {
        assert!(should_emit_health_insight(1, 0, 0));
        assert!(should_emit_health_insight(0, 1, 0));
        assert!(should_emit_health_insight(0, 0, 1));
    }
}
