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
    curator_runtime::run_curator_backfill_pass,
    daemon_registry,
    db::Db,
    knowledge_curator::{DaemonKind, MergeSuggestionStatus},
};

pub async fn start_archive_daemon(db: Db) {
    tokio::spawn(async move {
        info!("Archive & cold storage daemon started");
        loop {
            let (processed, errors) = run_archive_pass(&db).await;
            emit_daemon_heartbeats(&db, DaemonKind::ArchiveColdStorage, processed, errors).await;
            tokio::time::sleep(Duration::from_secs(600)).await;
        }
    });
}

pub async fn start_health_maintenance_daemon(db: Db) {
    tokio::spawn(async move {
        info!("Health & maintenance daemon started");
        loop {
            let (processed, errors) = run_health_pass(&db).await;
            emit_daemon_heartbeats(&db, DaemonKind::HealthMaintenance, processed, errors).await;
            tokio::time::sleep(Duration::from_secs(900)).await;
        }
    });
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
        SELECT id, thread_id, type, subtype, timestamp::text AS timestamp,
               content, metadata, encryption, expires_at::text AS expires_at, summary
        FROM {}
        WHERE NOT EXISTS (
            SELECT 1 FROM afp_archive_index ai WHERE ai.message_id = id
        )
        ORDER BY timestamp ASC
        LIMIT 100
        "#,
        tenant_messages_table(user_id)
    ))
    .fetch_all(&db.pool)
    .await?;

    let archive_root = archive_root_dir();
    let minio = minio_client();
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
        let payload_bytes = serde_json::to_vec(&payload).unwrap_or_default();
        let archive_key_str = archive_key.to_string_lossy().replace('\\', "/");
        let uploaded = if let Some(minio) = &minio {
            upload_archive_payload(minio, &archive_key_str, payload_bytes.clone()).await
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
                "storage_backend": if minio.is_some() { "minio" } else { "filesystem_fallback" },
            }),
        )
        .await?;
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
    processed += repair_reciprocal_backlinks(db, user_id).await?;
    processed += create_duplicate_suggestions(db, user_id).await?;
    processed += emit_health_insight(db, user_id).await?;
    Ok(processed)
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
            r#type: "merge_suggestion".to_string(),
            content: content.to_string(),
            signature: String::new(),
            encryption: "{}".to_string(),
            views: "[]".to_string(),
            references: json!([source_id, target_id]).to_string(),
            attachments: "[]".to_string(),
            store_in_relational: false,
            subtype: "duplicate_detection".to_string(),
            metadata: json!({"created_by": "health_maintenance"}).to_string(),
        };
        let _ = db.store_private_message(user_id, &msg, content).await?;
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
        WHERE type = 'merge_suggestion'
          AND "references" @> $1::jsonb
          AND "references" @> $2::jsonb
        LIMIT 1
        "#,
        tenant_messages_table(user_id)
    ))
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
        id: format!("insight.{}", Ulid::new()),
        thread_id: format!("thread.insight.{}", Utc::now().format("%Y%m%d")),
        parent_id: String::new(),
        from: "omnyid://daemon/health-maintenance".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: Utc::now().to_rfc3339(),
        r#type: "insight".to_string(),
        content: content.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: "[]".to_string(),
        attachments: "[]".to_string(),
        store_in_relational: false,
        subtype: "maintenance_summary".to_string(),
        metadata: json!({"created_by": "health_maintenance"}).to_string(),
    };
    let _ = db.store_private_message(user_id, &msg, content).await?;
    Ok(1)
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

async fn upload_archive_payload(client: &MinioClient, key: &str, payload: Vec<u8>) -> bool {
    client
        .client
        .put_object()
        .bucket(&client.bucket)
        .key(prefixed_object_key(client, key))
        .body(ByteStream::from(payload))
        .content_type("application/json")
        .send()
        .await
        .is_ok()
}

fn minio_client() -> Option<MinioClient> {
    let endpoint = std::env::var("OMNYID_MINIO_ENDPOINT").ok()?;
    let access_key = std::env::var("OMNYID_MINIO_ACCESS_KEY").ok()?;
    let secret_key = std::env::var("OMNYID_MINIO_SECRET_KEY").ok()?;
    let bucket = std::env::var("OMNYID_MINIO_BUCKET").ok()?;
    let prefix = std::env::var("OMNYID_MINIO_PREFIX").unwrap_or_default();
    let region = std::env::var("OMNYID_MINIO_REGION").unwrap_or_else(|_| "us-east-1".to_string());
    let config = S3Config::builder()
        .region(Region::new(region))
        .credentials_provider(Credentials::new(
            access_key, secret_key, None, None, "omnyid",
        ))
        .endpoint_url(endpoint)
        .force_path_style(true)
        .build();
    Some(MinioClient {
        bucket,
        prefix,
        client: S3Client::from_conf(config),
    })
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

fn prefixed_object_key(client: &MinioClient, key: &str) -> String {
    if client.prefix.trim().is_empty() {
        key.to_string()
    } else {
        format!("{}/{}", client.prefix.trim_matches('/'), key)
    }
}

fn daemon_kind_slug(kind: &DaemonKind) -> &'static str {
    match kind {
        DaemonKind::KnowledgeCurator => "knowledge_curator",
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

fn tenant_schema_name(user_id: &str) -> String {
    let mut schema = String::from("user_");
    for ch in user_id.chars().flat_map(|c| c.to_lowercase()) {
        schema.push(if ch.is_ascii_alphanumeric() { ch } else { '_' });
        if schema.len() >= 60 {
            break;
        }
    }
    if schema == "user_" {
        schema.push_str("tenant");
    }
    schema
}

struct MinioClient {
    bucket: String,
    prefix: String,
    client: S3Client,
}
