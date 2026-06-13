use crate::afp::Message as ProtoMessage;
use crate::crypto::is_supported_encryption_envelope;
use crate::integration::{ActionResult, IntegrationCapability};
use crate::knowledge_curator::{BacklinkKind, BacklinkRecord, DaemonHeartbeat, DaemonKind};
use crate::local_sync::{DeviceBootstrap, SyncSliceSpec};
use crate::message::metadata_store_flag;
use crate::personalization::{LoraArtifact, PersonalizationEvent};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ulid::Ulid;
use sqlx::{Acquire, PgPool, Row, postgres::PgPoolOptions};
use std::time::Duration;

mod migration_catalog;
pub use migration_catalog::MIGRATIONS;

#[derive(Clone)]
pub struct Db {
    pub pool: PgPool,
}

impl Db {
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let settings = database_pool_settings_from_env();
        let statement_timeout_ms = settings.statement_timeout_ms;
        let idle_tx_timeout_ms = settings.idle_in_transaction_timeout_ms;
        let pool = PgPoolOptions::new()
            .max_connections(settings.max_connections)
            .min_connections(settings.min_connections)
            .acquire_timeout(Duration::from_secs(settings.acquire_timeout_secs))
            .idle_timeout(Some(Duration::from_secs(settings.idle_timeout_secs)))
            .max_lifetime(Some(Duration::from_secs(settings.max_lifetime_secs)))
            .after_connect(move |conn, _meta| {
                Box::pin(async move {
                    sqlx::query(&format!("SET statement_timeout = {statement_timeout_ms}"))
                        .execute(&mut *conn)
                        .await?;
                    sqlx::query(&format!(
                        "SET idle_in_transaction_session_timeout = {idle_tx_timeout_ms}"
                    ))
                    .execute(&mut *conn)
                    .await?;
                    Ok(())
                })
            })
            .connect(database_url)
            .await?;
        apply_migrations(&pool).await?;
        Ok(Db { pool })
    }

    pub async fn healthcheck(&self) -> Result<(), sqlx::Error> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    pub async fn ensure_user_private_schema(&self, user_id: &str) -> Result<String, sqlx::Error> {
        let schema = tenant_schema_name(user_id);
        let statements = tenant_private_schema_bootstrap_sql(&schema);
        let mut tx = self.pool.begin().await?;
        for statement in statements {
            sqlx::query(&statement).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(schema)
    }

    // ── Messages & threads ────────────────────────────────────────────────────

    pub async fn store_message(
        &self,
        msg: &ProtoMessage,
        content_json: Value,
    ) -> Result<bool, sqlx::Error> {
        // Enforce AFP metadata.store:false — ephemeral tool-call messages must
        // never be written to storage, regardless of what the client requests.
        if !metadata_store_flag(&msg.metadata) {
            return Ok(false);
        }

        let views_json = parse_json_array_string(&msg.views);
        let references_json = parse_json_array_string(&msg.references);
        let attachments_json = parse_json_array_string(&msg.attachments);
        let encryption_json = parse_json_object_string(&msg.encryption);

        let storage_mode = effective_storage_mode(msg, &content_json, &encryption_json);
        let persisted_content =
            persisted_content_for_mode(&storage_mode, &content_json, &encryption_json);
        let persisted_views =
            persisted_views_for_mode(&storage_mode, &views_json, &encryption_json);
        let (summary, embedding) = summary_and_embedding_for_mode(&storage_mode, &content_json);

        let result = sqlx::query(
            r#"
            INSERT INTO messages (
                id, thread_id, parent_id, from_agent, to_agents, timestamp, type, kind, content,
                views, summary, embedding, signature, encryption, "references", attachments,
                store_in_relational, subtype, metadata
            )
            VALUES (
                $1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16,
                $17, $18, $19
            )
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(&msg.id)
        .bind(&msg.thread_id)
        .bind(nullable_string(&msg.parent_id))
        .bind(&msg.from)
        .bind(serde_json::json!(msg.to))
        .bind(&msg.timestamp)
        .bind(&msg.r#type)
        .bind(msg.kind.as_deref())
        .bind(persisted_content)
        .bind(persisted_views)
        .bind(summary)
        .bind(embedding.as_deref())
        .bind(&msg.signature)
        .bind(encryption_json)
        .bind(references_json)
        .bind(&attachments_json)
        .bind(msg.store_in_relational)
        .bind(nullable_string(&msg.subtype))
        .bind(parse_json_optional_object_string(&msg.metadata))
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 1 {
            persist_attachment_metadata(&self.pool, &msg.id, &msg.thread_id, &attachments_json)
                .await?;
        }

        Ok(result.rows_affected() == 1)
    }

    pub async fn store_private_message(
        &self,
        owner_user_id: &str,
        msg: &ProtoMessage,
        content_json: Value,
    ) -> Result<bool, sqlx::Error> {
        // Enforce AFP metadata.store:false — ephemeral tool-call messages must
        // never be written to storage, regardless of what the client requests.
        if !metadata_store_flag(&msg.metadata) {
            return Ok(false);
        }

        let views_json = parse_json_array_string(&msg.views);
        let references_json = parse_json_array_string(&msg.references);
        let attachments_json = parse_json_array_string(&msg.attachments);
        let encryption_json = parse_json_object_string(&msg.encryption);

        let storage_mode = effective_storage_mode(msg, &content_json, &encryption_json);
        let persisted_content =
            persisted_content_for_mode(&storage_mode, &content_json, &encryption_json);
        let persisted_views =
            persisted_views_for_mode(&storage_mode, &views_json, &encryption_json);
        let (summary, embedding) = summary_and_embedding_for_mode(&storage_mode, &content_json);

        let messages_table = tenant_messages_table(owner_user_id);
        let result = sqlx::query(&format!(
            r#"
            INSERT INTO {messages_table} (
                id, thread_id, parent_id, from_agent, to_agents, timestamp, type, kind, content,
                views, summary, embedding, signature, encryption, "references", attachments,
                store_in_relational, subtype, metadata
            )
            VALUES (
                $1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16,
                $17, $18, $19
            )
            ON CONFLICT (id) DO NOTHING
            "#,
        ))
        .bind(&msg.id)
        .bind(&msg.thread_id)
        .bind(nullable_string(&msg.parent_id))
        .bind(&msg.from)
        .bind(serde_json::json!(msg.to))
        .bind(&msg.timestamp)
        .bind(&msg.r#type)
        .bind(msg.kind.as_deref())
        .bind(persisted_content)
        .bind(persisted_views)
        .bind(summary)
        .bind(embedding.as_deref())
        .bind(&msg.signature)
        .bind(encryption_json)
        .bind(references_json)
        .bind(&attachments_json)
        .bind(msg.store_in_relational)
        .bind(nullable_string(&msg.subtype))
        .bind(parse_json_optional_object_string(&msg.metadata))
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 1 {
            persist_attachment_metadata_to_table(
                &self.pool,
                &tenant_attachments_table(owner_user_id),
                &msg.id,
                &msg.thread_id,
                &attachments_json,
            )
            .await?;
        }

        Ok(result.rows_affected() == 1)
    }

    pub async fn get_thread(&self, thread_id: &str) -> Result<Vec<ProtoMessage>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT
                id,
                thread_id,
                parent_id,
                from_agent,
                to_agents,
                timestamp::text as timestamp,
                type,
                kind,
                content,
                signature,
                encryption,
                views,
                "references",
                attachments,
                store_in_relational,
                subtype,
                metadata
            FROM messages
            WHERE thread_id = $1
            ORDER BY timestamp
            "#,
        )
        .bind(thread_id)
        .fetch_all(&self.pool)
        .await?;

        let mut messages = Vec::with_capacity(rows.len());
        for row in rows {
            messages.push(ProtoMessage {
                protocol: "afp-v1".to_string(),
                id: row.try_get("id")?,
                thread_id: row.try_get("thread_id")?,
                parent_id: row
                    .try_get::<Option<String>, _>("parent_id")?
                    .unwrap_or_default(),
                from: row.try_get("from_agent")?,
                to: serde_json::from_value(row.try_get("to_agents")?).unwrap_or_default(),
                timestamp: row.try_get("timestamp")?,
                r#type: row.try_get("type")?,
                kind: row
                    .try_get::<Option<String>, _>("kind")?
                    .filter(|value| !value.trim().is_empty()),
                content: row.try_get::<Value, _>("content")?.to_string(),
                signature: row.try_get("signature")?,
                encryption: row
                    .try_get::<Option<Value>, _>("encryption")?
                    .unwrap_or_else(|| serde_json::json!({}))
                    .to_string(),
                views: redacted_views_for_read(
                    &row.try_get::<Value, _>("views")
                        .unwrap_or_else(|_| Value::Array(vec![])),
                    &row.try_get::<Option<Value>, _>("encryption")
                        .unwrap_or(None)
                        .unwrap_or_else(|| Value::Object(Default::default())),
                )
                .to_string(),
                references: row
                    .try_get::<Value, _>("references")
                    .unwrap_or_else(|_| Value::Array(vec![]))
                    .to_string(),
                attachments: row
                    .try_get::<Value, _>("attachments")
                    .unwrap_or_else(|_| Value::Array(vec![]))
                    .to_string(),
                store_in_relational: row.try_get("store_in_relational")?,
                subtype: row
                    .try_get::<Option<String>, _>("subtype")?
                    .unwrap_or_default(),
                metadata: row
                    .try_get::<Option<Value>, _>("metadata")?
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
            });
        }

        Ok(messages)
    }

    pub async fn get_private_thread(
        &self,
        owner_user_id: &str,
        thread_id: &str,
    ) -> Result<Vec<ProtoMessage>, sqlx::Error> {
        let messages_table = tenant_messages_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT
                id,
                thread_id,
                parent_id,
                from_agent,
                to_agents,
                timestamp::text as timestamp,
                type,
                kind,
                content,
                signature,
                encryption,
                views,
                "references",
                attachments,
                store_in_relational,
                subtype,
                metadata
            FROM {messages_table}
            WHERE thread_id = $1
            ORDER BY timestamp
            "#,
        ))
        .bind(thread_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(proto_message_from_row).collect::<Result<Vec<_>, _>>()?)
    }

    pub async fn upsert_backlink_record(&self, record: &BacklinkRecord) -> Result<(), sqlx::Error> {
        if record.user_id.trim().is_empty() {
            return Ok(());
        }

        // GAP-135/GAP-136: include ref_type in INSERT and ON CONFLICT so the
        // semantic stance is persisted and the conflict key matches migration 0053.
        let ref_type = if record.ref_type.is_empty() {
            "mentions".to_string()
        } else {
            record.ref_type.clone()
        };
        sqlx::query(
            r#"
            INSERT INTO afp_backlinks (
                backlink_id,
                user_id,
                source_id,
                target_id,
                link_kind,
                ref_type,
                similarity,
                entities,
                created_at,
                curator_run_id
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10
            )
            ON CONFLICT (user_id, source_id, target_id, link_kind) DO UPDATE SET
                backlink_id = EXCLUDED.backlink_id,
                ref_type = EXCLUDED.ref_type,
                similarity = EXCLUDED.similarity,
                entities = EXCLUDED.entities,
                created_at = EXCLUDED.created_at,
                curator_run_id = EXCLUDED.curator_run_id
            "#,
        )
        .bind(&record.backlink_id)
        .bind(&record.user_id)
        .bind(&record.source_id)
        .bind(&record.target_id)
        .bind(backlink_kind_as_str(&record.link_kind))
        .bind(&ref_type)
        .bind(record.similarity)
        .bind(&record.entities)
        .bind(&record.created_at)
        .bind(&record.curator_run_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_backlinks_for_message(
        &self,
        user_id: &str,
        message_id: &str,
    ) -> Result<Vec<BacklinkRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT
                backlink_id,
                user_id,
                source_id,
                target_id,
                link_kind,
                COALESCE(ref_type, 'mentions') AS ref_type,
                similarity,
                entities,
                created_at::text AS created_at,
                curator_run_id
            FROM afp_backlinks
            WHERE user_id = $1
              AND (source_id = $2 OR target_id = $2)
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .bind(message_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| BacklinkRecord {
                backlink_id: row.get("backlink_id"),
                user_id: row.get("user_id"),
                source_id: row.get("source_id"),
                target_id: row.get("target_id"),
                link_kind: backlink_kind_from_str(&row.get::<String, _>("link_kind")),
                ref_type: row
                    .get::<Option<String>, _>("ref_type")
                    .unwrap_or_else(|| "mentions".to_string()),
                similarity: row.get("similarity"),
                entities: row.get("entities"),
                created_at: row.get("created_at"),
                curator_run_id: row
                    .get::<Option<String>, _>("curator_run_id")
                    .unwrap_or_default(),
            })
            .collect())
    }

    /// Return the top-N supertags by usage frequency across the user's
    /// knowledge cards.  Each item is `{ "tag": string, "count": number }`.
    pub async fn list_top_supertags(
        &self,
        user_id: &str,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT tag, COUNT(*) AS freq
            FROM afp_knowledge_cards,
                 UNNEST(supertags) AS tag
            WHERE user_id = $1
            GROUP BY tag
            ORDER BY freq DESC
            LIMIT $2
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                serde_json::json!({
                    "tag":   row.get::<String, _>("tag"),
                    "count": row.try_get::<i64, _>("freq").unwrap_or(0),
                })
            })
            .collect())
    }

    /// BFS multi-hop backlink graph traversal.
    ///
    /// Starting from `root_id`, expands up to `depth` hops through the
    /// `afp_backlinks` table and returns the set of unique edges reachable
    /// within that radius.  Depth is clamped to 4 to prevent runaway queries.
    ///
    /// Returns `(nodes, edges)` where:
    /// - `nodes` is the de-duplicated set of all message IDs encountered.
    /// - `edges` is a `Vec<BacklinkRecord>` for every edge in the subgraph.
    pub async fn bfs_backlinks_graph(
        &self,
        user_id: &str,
        root_id: &str,
        depth: u32,
    ) -> Result<(Vec<String>, Vec<BacklinkRecord>), sqlx::Error> {
        let depth = depth.min(4) as usize;
        let mut visited_nodes: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut visited_edge_ids: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        let mut all_edges: Vec<BacklinkRecord> = Vec::new();
        let mut frontier: Vec<String> = vec![root_id.to_string()];
        visited_nodes.insert(root_id.to_string());

        for _ in 0..depth {
            if frontier.is_empty() {
                break;
            }
            let mut next_frontier: Vec<String> = Vec::new();
            for node_id in &frontier {
                let edges = self.list_backlinks_for_message(user_id, node_id).await?;
                for edge in edges {
                    if visited_edge_ids.contains(&edge.backlink_id) {
                        continue;
                    }
                    visited_edge_ids.insert(edge.backlink_id.clone());
                    // Discover the neighbour node
                    let neighbour = if edge.source_id == *node_id {
                        edge.target_id.clone()
                    } else {
                        edge.source_id.clone()
                    };
                    if !visited_nodes.contains(&neighbour) {
                        visited_nodes.insert(neighbour.clone());
                        next_frontier.push(neighbour);
                    }
                    all_edges.push(edge);
                }
            }
            frontier = next_frontier;
        }

        let nodes: Vec<String> = visited_nodes.into_iter().collect();
        Ok((nodes, all_edges))
    }

    // ── Mail sync ─────────────────────────────────────────────────────────────

    pub async fn upsert_mail_sync_checkpoint(
        &self,
        provider: &str,
        account: &str,
        cursor: Option<&str>,
        last_message_id: Option<&str>,
        status: &str,
        last_error: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO mail_sync_checkpoints (
                provider, account, cursor, last_message_id, status, last_error, last_synced_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            ON CONFLICT (provider, account) DO UPDATE SET
                cursor = EXCLUDED.cursor,
                last_message_id = EXCLUDED.last_message_id,
                status = EXCLUDED.status,
                last_error = EXCLUDED.last_error,
                last_synced_at = EXCLUDED.last_synced_at,
                updated_at = NOW()
            "#,
        )
        .bind(provider)
        .bind(account)
        .bind(cursor)
        .bind(last_message_id)
        .bind(status)
        .bind(last_error)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_message_by_external_email_targets(
        &self,
        targets: &[String],
    ) -> Result<Option<(String, String)>, sqlx::Error> {
        if targets.is_empty() {
            return Ok(None);
        }

        let row = sqlx::query(
            r#"
            SELECT m.thread_id, m.id
            FROM messages m
            CROSS JOIN LATERAL jsonb_array_elements(m."references") AS ref
            WHERE ref->>'type' = 'external_email'
              AND ref->>'target' = ANY($1)
            ORDER BY m.timestamp DESC
            LIMIT 1
            "#,
        )
        .bind(targets)
        .fetch_optional(&self.pool)
        .await?;

        Ok(match row {
            None => None,
            Some(row) => {
                let thread_id: String = row.try_get("thread_id")?;
                let message_id: String = row.try_get("id")?;
                Some((thread_id, message_id))
            }
        })
    }

    pub async fn record_outbound_delivery_attempt(
        &self,
        message_id: &str,
        thread_id: &str,
        provider: &str,
        status: &str,
        last_error: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        // GAP-134: use ON CONFLICT to upsert so retries do not create duplicate rows.
        // The unique key is (message_id, provider); later attempts update status and error.
        sqlx::query(
            r#"
            INSERT INTO outbound_email_receipts (
                message_id, thread_id, provider, status, last_error
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (message_id, provider)
            DO UPDATE SET
                status     = EXCLUDED.status,
                last_error = EXCLUDED.last_error,
                updated_at = NOW()
            "#,
        )
        .bind(message_id)
        .bind(thread_id)
        .bind(provider)
        .bind(status)
        .bind(last_error)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ── Integrations & action results ─────────────────────────────────────────

    pub async fn upsert_daemon_registration(
        &self,
        user_id: &str,
        daemon_kind: &DaemonKind,
        delegated_key_id: &str,
        workflow_id: Option<&str>,
        policy_config: Value,
    ) -> Result<String, sqlx::Error> {
        let daemon_id = format!("{}:{}", daemon_kind_label(daemon_kind), user_id.trim());
        sqlx::query(
            r#"
            INSERT INTO daemon_registrations (
                daemon_id,
                user_id,
                daemon_kind,
                workflow_id,
                delegated_key_id,
                allowed_message_types,
                status,
                policy_config,
                last_heartbeat_at,
                created_at,
                revoked_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, NOW(), NOW(), NULL)
            ON CONFLICT (daemon_id) DO UPDATE SET
                workflow_id = EXCLUDED.workflow_id,
                delegated_key_id = EXCLUDED.delegated_key_id,
                allowed_message_types = EXCLUDED.allowed_message_types,
                status = 'active',
                policy_config = EXCLUDED.policy_config,
                revoked_at = NULL
            "#,
        )
        .bind(&daemon_id)
        .bind(user_id)
        .bind(daemon_kind_label(daemon_kind))
        .bind(workflow_id)
        .bind(delegated_key_id)
        .bind(daemon_kind.allowed_message_types())
        .bind(policy_config)
        .execute(&self.pool)
        .await?;
        Ok(daemon_id)
    }

    pub async fn record_daemon_heartbeat(
        &self,
        heartbeat: &DaemonHeartbeat,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE daemon_registrations
            SET last_heartbeat_at = $2::timestamptz
            WHERE daemon_id = $1
            "#,
        )
        .bind(&heartbeat.daemon_id)
        .bind(&heartbeat.created_at)
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO daemon_heartbeats (
                heartbeat_id,
                daemon_id,
                user_id,
                metrics,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5::timestamptz)
            ON CONFLICT (heartbeat_id) DO NOTHING
            "#,
        )
        .bind(&heartbeat.heartbeat_id)
        .bind(&heartbeat.daemon_id)
        .bind(&heartbeat.user_id)
        .bind(json!({
            "queue_depth": heartbeat.queue_depth,
            "events_processed_last_hour": heartbeat.events_processed_last_hour,
            "tokens_used_today": heartbeat.tokens_used_today,
            "error_count_last_hour": heartbeat.error_count_last_hour,
        }))
        .bind(&heartbeat.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn upsert_relational_projection(
        &self,
        owner_user_id: Option<&str>,
        message_id: &str,
        thread_id: &str,
        message_type: &str,
        subtype: Option<&str>,
        projection_kind: &str,
        workspace_id: Option<&str>,
        projection_json: Value,
        source_timestamp: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO afp_relational_projections (
                message_id,
                owner_user_id,
                thread_id,
                message_type,
                subtype,
                projection_kind,
                workspace_id,
                projection_json,
                synced_at,
                source_timestamp
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9::timestamptz)
            ON CONFLICT (message_id) DO UPDATE SET
                owner_user_id = EXCLUDED.owner_user_id,
                thread_id = EXCLUDED.thread_id,
                message_type = EXCLUDED.message_type,
                subtype = EXCLUDED.subtype,
                projection_kind = EXCLUDED.projection_kind,
                workspace_id = EXCLUDED.workspace_id,
                projection_json = EXCLUDED.projection_json,
                synced_at = NOW(),
                source_timestamp = EXCLUDED.source_timestamp
            "#,
        )
        .bind(message_id)
        .bind(owner_user_id)
        .bind(thread_id)
        .bind(message_type)
        .bind(subtype)
        .bind(projection_kind)
        .bind(workspace_id)
        .bind(projection_json)
        .bind(source_timestamp)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn upsert_archive_index_entry(
        &self,
        user_id: &str,
        message_id: &str,
        thread_id: &str,
        message_type: &str,
        seaweedfs_key: &str,
        metadata_stub: Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO afp_archive_index (
                message_id,
                user_id,
                thread_id,
                message_type,
                archived_at,
                seaweedfs_key,
                metadata_stub,
                restored_at
            )
            VALUES ($1, $2, $3, $4, NOW(), $5, $6, NULL)
            ON CONFLICT (message_id) DO UPDATE SET
                seaweedfs_key = EXCLUDED.seaweedfs_key,
                metadata_stub = EXCLUDED.metadata_stub,
                archived_at = NOW()
            "#,
        )
        .bind(message_id)
        .bind(user_id)
        .bind(thread_id)
        .bind(message_type)
        .bind(seaweedfs_key)
        .bind(metadata_stub)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn delete_private_message_by_id(
        &self,
        user_id: &str,
        message_id: &str,
    ) -> Result<u64, sqlx::Error> {
        let messages_table = tenant_messages_table(user_id);
        let result = sqlx::query(&format!(
            r#"
            DELETE FROM {}
            WHERE id = $1
            "#,
            messages_table
        ))
        .bind(message_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn upsert_integration_capability(
        &self,
        capability: &IntegrationCapability,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO integration_capabilities (
                capability_id, provider, operation, transport, scopes, approval_mode, secret_refs, metadata, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (capability_id) DO UPDATE SET
                provider = EXCLUDED.provider,
                operation = EXCLUDED.operation,
                transport = EXCLUDED.transport,
                scopes = EXCLUDED.scopes,
                approval_mode = EXCLUDED.approval_mode,
                secret_refs = EXCLUDED.secret_refs,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
            "#,
        )
        .bind(&capability.capability_id)
        .bind(&capability.provider)
        .bind(&capability.operation)
        .bind(integration_transport_label(&capability.transport))
        .bind(json!(capability.scopes))
        .bind(approval_mode_label(&capability.approval_mode))
        .bind(json!(capability.secret_refs))
        .bind(capability.metadata.clone())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn record_action_result(&self, result: &ActionResult) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO action_audit_log (
                capability_id, thread_id, status, output, external_reference, recorded_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
            "#,
        )
        .bind(&result.capability_id)
        .bind(&result.thread_id)
        .bind(action_status_label(&result.status))
        .bind(result.output.clone())
        .bind(&result.external_reference)
        .bind(&result.recorded_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ── Peer key cache (Phase 2 key lifecycle) ────────────────────────────

    /// Cache a discovered peer's public key so recipient wrapping survives restarts.
    pub async fn upsert_peer_key(
        &self,
        agent_id: &str,
        key_id: &str,
        public_key_hex: &str,
        homeserver_url: &str,
        previous_key_ids: &[String],
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO peer_keys (agent_id, key_id, public_key_hex, homeserver_url, previous_key_ids)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            ON CONFLICT (agent_id, key_id) DO UPDATE SET
                public_key_hex  = EXCLUDED.public_key_hex,
                homeserver_url  = EXCLUDED.homeserver_url,
                previous_key_ids = EXCLUDED.previous_key_ids
            "#,
        )
        .bind(agent_id)
        .bind(key_id)
        .bind(public_key_hex)
        .bind(homeserver_url)
        .bind(serde_json::to_value(previous_key_ids).unwrap_or(serde_json::json!([])))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Retrieve the cached active key for a peer agent (non-revoked, latest discovery).
    pub async fn get_peer_key(
        &self,
        agent_id: &str,
    ) -> Result<Option<(String, String, String)>, sqlx::Error> {
        // Returns (key_id, public_key_hex, homeserver_url) for the newest non-revoked key
        let row = sqlx::query_as::<_, (String, String, String)>(
            r#"
            SELECT key_id, public_key_hex, homeserver_url
            FROM peer_keys
            WHERE agent_id = $1
              AND revoked_at IS NULL
            ORDER BY discovered_at DESC
            LIMIT 1
            "#,
        )
        .bind(agent_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    /// Mark a peer key as revoked (e.g. when a rotation notice arrives).
    pub async fn revoke_peer_key(&self, agent_id: &str, key_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"UPDATE peer_keys SET revoked_at = NOW() WHERE agent_id = $1 AND key_id = $2"#,
        )
        .bind(agent_id)
        .bind(key_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Record a server-side key rotation event for audit.
    pub async fn record_key_rotation(
        &self,
        agent_id: &str,
        old_key_id: &str,
        new_key_id: &str,
        new_public_key: &str,
        reason: Option<&str>,
    ) -> Result<String, sqlx::Error> {
        let id = ulid::Ulid::new().to_string();
        sqlx::query(
            r#"
            INSERT INTO key_rotation_events (id, agent_id, old_key_id, new_key_id, new_public_key, reason)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(&id)
        .bind(agent_id)
        .bind(old_key_id)
        .bind(new_key_id)
        .bind(new_public_key)
        .bind(reason)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    pub async fn upsert_sync_device(&self, device: &DeviceBootstrap) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO sync_devices (
                device_id, agent_id, electric_project_url, encrypted_seed_ref, pglite_path, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (device_id) DO UPDATE SET
                agent_id = EXCLUDED.agent_id,
                electric_project_url = EXCLUDED.electric_project_url,
                encrypted_seed_ref = EXCLUDED.encrypted_seed_ref,
                pglite_path = EXCLUDED.pglite_path,
                updated_at = NOW()
            "#,
        )
        .bind(&device.device_id)
        .bind(&device.agent_id)
        .bind(&device.electric_project_url)
        .bind(&device.encrypted_seed_ref)
        .bind(&device.pglite_path)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn upsert_sync_device_policy(
        &self,
        owner_user_id: &str,
        device: &DeviceBootstrap,
        device_class: &str,
        policy_profile: &str,
        sync_slices: &[SyncSliceSpec],
        requires_local_key_material: bool,
        notes_json: Value,
    ) -> Result<SyncDevicePolicyRecord, sqlx::Error> {
        let row = sqlx::query(
            r#"
            INSERT INTO sync_device_policies (
                device_id, owner_user_id, agent_id, device_class, policy_profile, sync_slices,
                requires_local_key_material, notes_json, last_bundle_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            ON CONFLICT (device_id) DO UPDATE SET
                owner_user_id = EXCLUDED.owner_user_id,
                agent_id = EXCLUDED.agent_id,
                device_class = EXCLUDED.device_class,
                policy_profile = EXCLUDED.policy_profile,
                sync_slices = EXCLUDED.sync_slices,
                requires_local_key_material = EXCLUDED.requires_local_key_material,
                notes_json = EXCLUDED.notes_json,
                last_bundle_at = NOW(),
                updated_at = NOW()
            RETURNING
                device_id,
                owner_user_id,
                agent_id,
                device_class,
                policy_profile,
                sync_slices,
                requires_local_key_material,
                notes_json,
                last_bundle_at::text AS last_bundle_at,
                last_used_at::text AS last_used_at,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            "#,
        )
        .bind(&device.device_id)
        .bind(owner_user_id)
        .bind(&device.agent_id)
        .bind(device_class)
        .bind(policy_profile)
        .bind(json!(sync_slices))
        .bind(requires_local_key_material)
        .bind(notes_json)
        .fetch_one(&self.pool)
        .await?;

        Ok(sync_device_policy_from_row(row)?)
    }

    pub async fn list_sync_device_policies_by_user(
        &self,
        owner_user_id: &str,
        limit: i64,
    ) -> Result<Vec<SyncDevicePolicyRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT
                device_id,
                owner_user_id,
                agent_id,
                device_class,
                policy_profile,
                sync_slices,
                requires_local_key_material,
                notes_json,
                last_bundle_at::text AS last_bundle_at,
                last_used_at::text AS last_used_at,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            FROM sync_device_policies
            WHERE owner_user_id = $1
            ORDER BY updated_at DESC
            LIMIT $2
            "#,
        )
        .bind(owner_user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(sync_device_policy_from_row).collect::<Result<Vec<_>, _>>()?)
    }

    pub async fn find_sync_device_policy_by_user(
        &self,
        owner_user_id: &str,
        device_id: &str,
    ) -> Result<Option<SyncDevicePolicyRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT
                device_id,
                owner_user_id,
                agent_id,
                device_class,
                policy_profile,
                sync_slices,
                requires_local_key_material,
                notes_json,
                last_bundle_at::text AS last_bundle_at,
                last_used_at::text AS last_used_at,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            FROM sync_device_policies
            WHERE owner_user_id = $1
              AND device_id = $2
            LIMIT 1
            "#,
        )
        .bind(owner_user_id)
        .bind(device_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(sync_device_policy_from_row).transpose()?)
    }

    pub async fn update_sync_device_policy(
        &self,
        owner_user_id: &str,
        device_id: &str,
        policy_profile: &str,
        sync_slices: &[SyncSliceSpec],
        requires_local_key_material: bool,
        notes_json: Value,
    ) -> Result<Option<SyncDevicePolicyRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            UPDATE sync_device_policies
            SET
                policy_profile = $3,
                sync_slices = $4,
                requires_local_key_material = $5,
                notes_json = $6,
                updated_at = NOW()
            WHERE owner_user_id = $1
              AND device_id = $2
            RETURNING
                device_id,
                owner_user_id,
                agent_id,
                device_class,
                policy_profile,
                sync_slices,
                requires_local_key_material,
                notes_json,
                last_bundle_at::text AS last_bundle_at,
                last_used_at::text AS last_used_at,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            "#,
        )
        .bind(owner_user_id)
        .bind(device_id)
        .bind(policy_profile)
        .bind(json!(sync_slices))
        .bind(requires_local_key_material)
        .bind(notes_json)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(sync_device_policy_from_row).transpose()?)
    }

    // ── Personalization ────────────────────────────────────────────────────────

    pub async fn record_personalization_event(
        &self,
        event: &PersonalizationEvent,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO personalization_events (
                event_id, thread_id, message_id, actor_agent_id, signal, rationale, captured_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
            ON CONFLICT (event_id) DO NOTHING
            "#,
        )
        .bind(&event.event_id)
        .bind(&event.thread_id)
        .bind(&event.message_id)
        .bind(&event.actor_agent_id)
        .bind(feedback_signal_label(&event.signal))
        .bind(&event.rationale)
        .bind(&event.captured_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Return per-signal event counts and the latest active LoRA artifact, if any.
    pub async fn get_personalization_stats(
        &self,
        agent_id: &str,
    ) -> Result<serde_json::Value, sqlx::Error> {
        #[derive(sqlx::FromRow)]
        struct SignalRow {
            signal: String,
            count: i64,
        }

        let rows = sqlx::query_as::<_, SignalRow>(
            r#"
            SELECT signal, COUNT(*) AS count
            FROM personalization_events
            WHERE actor_agent_id = $1
            GROUP BY signal
            "#,
        )
        .bind(agent_id)
        .fetch_all(&self.pool)
        .await?;

        let signal_counts: serde_json::Map<String, serde_json::Value> = rows
            .into_iter()
            .map(|row| (row.signal, serde_json::json!(row.count)))
            .collect();

        let latest_artifact: Option<String> = sqlx::query_scalar(
            r#"
            SELECT artifact_id FROM lora_artifacts
            WHERE status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .fetch_optional(&self.pool)
        .await?;

        let total: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM personalization_events WHERE actor_agent_id = $1"#,
        )
        .bind(agent_id)
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0);

        Ok(serde_json::json!({
            "agent_id": agent_id,
            "total_events": total,
            "signal_counts": signal_counts,
            "active_lora_artifact_id": latest_artifact,
            "training_schedule": crate::personalization::TrainingSchedule::weekly_default(),
        }))
    }

    /// Compute a LoRA confidence score from feedback signal counts for an agent.
    ///
    /// Formula:  raw = (approved × 0.02) + (edited × 0.01) − (rejected × 0.01)
    /// Clamped to [0.0, LORA_TAKEOVER_THRESHOLD].
    ///
    /// Returns `(score, genome_active)`.  Callers should call `update_lora_confidence`
    /// with the result so the agent record stays consistent.
    pub async fn compute_lora_score_from_feedback(
        &self,
        agent_id: &str,
    ) -> Result<(f64, bool), sqlx::Error> {
        #[derive(sqlx::FromRow)]
        struct Row {
            signal: String,
            count: i64,
        }
        let rows = sqlx::query_as::<_, Row>(
            r#"
            SELECT signal, COUNT(*) AS count
            FROM personalization_events
            WHERE actor_agent_id = $1
            GROUP BY signal
            "#,
        )
        .bind(agent_id)
        .fetch_all(&self.pool)
        .await?;

        let mut approved: i64 = 0;
        let mut edited: i64 = 0;
        let mut rejected: i64 = 0;
        for row in rows {
            match row.signal.as_str() {
                "approved" => approved = row.count,
                "edited" => edited = row.count,
                "rejected" => rejected = row.count,
                _ => {}
            }
        }

        let threshold = crate::agent_template::LORA_TAKEOVER_THRESHOLD;
        let raw = (approved as f64 * 0.02) + (edited as f64 * 0.01) - (rejected as f64 * 0.01);
        let score = raw.clamp(0.0, threshold);
        let genome_active = score >= threshold;
        Ok((score, genome_active))
    }

    // ── Billing ────────────────────────────────────────────────────────────────

    /// Upsert billing subscription state for an account (from Stripe webhook).
    pub async fn upsert_billing_subscription(
        &self,
        account_id: &str,
        stripe_customer_id: Option<&str>,
        stripe_subscription_id: Option<&str>,
        plan: &str,
        status: &str,
        current_period_end: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO billing_subscriptions (
                account_id, stripe_customer_id, stripe_subscription_id,
                plan, status, current_period_end, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::timestamptz, NOW())
            ON CONFLICT (account_id) DO UPDATE SET
                stripe_customer_id     = COALESCE(EXCLUDED.stripe_customer_id, billing_subscriptions.stripe_customer_id),
                stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, billing_subscriptions.stripe_subscription_id),
                plan                   = EXCLUDED.plan,
                status                 = EXCLUDED.status,
                current_period_end     = EXCLUDED.current_period_end,
                updated_at             = NOW()
            "#,
        )
        .bind(account_id)
        .bind(stripe_customer_id)
        .bind(stripe_subscription_id)
        .bind(plan)
        .bind(status)
        .bind(current_period_end)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Record a Stripe webhook event (idempotent via stripe_event_id unique constraint).
    pub async fn record_billing_event(
        &self,
        account_id: Option<&str>,
        stripe_event_id: &str,
        event_type: &str,
        payload: &serde_json::Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO billing_events (account_id, stripe_event_id, event_type, payload)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (stripe_event_id) DO NOTHING
            "#,
        )
        .bind(account_id)
        .bind(stripe_event_id)
        .bind(event_type)
        .bind(payload)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Fetch the current billing subscription for an account.
    pub async fn get_billing_status(
        &self,
        account_id: &str,
    ) -> Result<serde_json::Value, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT plan, status, stripe_customer_id, stripe_subscription_id,
                   current_period_end, updated_at
            FROM billing_subscriptions
            WHERE account_id = $1
            "#,
        )
        .bind(account_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(match row {
            Some(r) => serde_json::json!({
                "account_id": account_id,
                "plan": r.try_get::<String, _>("plan").unwrap_or_else(|_| "free".to_string()),
                "status": r.try_get::<String, _>("status").unwrap_or_else(|_| "inactive".to_string()),
                "stripe_customer_id": r.try_get::<Option<String>, _>("stripe_customer_id").ok().flatten(),
                "stripe_subscription_id": r.try_get::<Option<String>, _>("stripe_subscription_id").ok().flatten(),
                "current_period_end": r.try_get::<Option<String>, _>("current_period_end").ok().flatten(),
            }),
            None => serde_json::json!({
                "account_id": account_id,
                "plan": "free",
                "status": "inactive",
            }),
        })
    }

    // ── LoRA artifacts ─────────────────────────────────────────────────────────

    pub async fn upsert_lora_artifact(&self, artifact: &LoraArtifact) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO lora_artifacts (
                artifact_id, base_model, storage_uri, version, status, created_at, supersedes
            )
            VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7)
            ON CONFLICT (artifact_id) DO UPDATE SET
                base_model = EXCLUDED.base_model,
                storage_uri = EXCLUDED.storage_uri,
                version = EXCLUDED.version,
                status = EXCLUDED.status,
                created_at = EXCLUDED.created_at,
                supersedes = EXCLUDED.supersedes
            "#,
        )
        .bind(&artifact.artifact_id)
        .bind(&artifact.base_model)
        .bind(&artifact.storage_uri)
        .bind(&artifact.version)
        .bind(artifact_status_label(&artifact.status))
        .bind(&artifact.created_at)
        .bind(&artifact.supersedes)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ── Users & sessions ───────────────────────────────────────────────────────

    pub async fn create_user(&self, user: &UserRecord) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO users (
                id, email, password_hash, auth_provider, google_sub, display_name, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
            "#,
        )
        .bind(&user.id)
        .bind(&user.email)
        .bind(&user.password_hash)
        .bind(&user.auth_provider)
        .bind(&user.google_sub)
        .bind(&user.display_name)
        .bind(&user.created_at)
        .execute(&self.pool)
        .await?;

        self.ensure_user_private_schema(&user.id).await?;

        Ok(())
    }

    pub async fn list_user_ids(&self) -> Result<Vec<String>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id
            FROM users
            ORDER BY created_at ASC, id ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.try_get::<String, _>("id").ok())
            .collect())
    }

    pub async fn update_user_password(
        &self,
        user_id: &str,
        new_password_hash: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            r#"UPDATE users SET password_hash = $1 WHERE id = $2 AND auth_provider = 'password'"#,
        )
        .bind(new_password_hash)
        .bind(user_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }

    // ── Persistent rate limiting (GAP-007) ───────────────────────────────────

    /// Check whether a request is within the sliding-window rate limit and record it if allowed.
    ///
    /// Returns `true` if the request should be allowed. Purges entries older than the window
    /// as part of the same transaction to keep the table small.
    pub async fn rate_limit_allow(
        &self,
        bucket_key: &str,
        window_secs: i64,
        max_requests: i64,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            r#"
            WITH purge AS (
                DELETE FROM rate_limit_log
                WHERE bucket_key = $1 AND request_time < NOW() - ($2 || ' seconds')::interval
            ),
            recent AS (
                SELECT COUNT(*) AS cnt FROM rate_limit_log
                WHERE bucket_key = $1 AND request_time >= NOW() - ($2 || ' seconds')::interval
            ),
            maybe_insert AS (
                INSERT INTO rate_limit_log (bucket_key)
                SELECT $1 WHERE (SELECT cnt FROM recent) < $3
                RETURNING 1
            )
            SELECT EXISTS(SELECT 1 FROM maybe_insert) AS allowed
            "#,
        )
        .bind(bucket_key)
        .bind(window_secs)
        .bind(max_requests)
        .fetch_one(&self.pool)
        .await?;
        Ok(result.get::<bool, _>("allowed"))
    }

    // ── Auth tokens (email verification + password reset) ─────────────────────

    pub async fn create_auth_token(
        &self,
        id: &str,
        user_id: &str,
        kind: &str,
        token_hash: &str,
        expires_at: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO auth_tokens (id, user_id, kind, token_hash, expires_at)
            VALUES ($1, $2, $3, $4, $5::timestamptz)
            "#,
        )
        .bind(id)
        .bind(user_id)
        .bind(kind)
        .bind(token_hash)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn find_auth_token(
        &self,
        kind: &str,
        token_hash: &str,
    ) -> Result<Option<AuthTokenRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, user_id, kind, token_hash, expires_at::text AS expires_at,
                   used_at::text AS used_at, created_at::text AS created_at
            FROM auth_tokens
            WHERE kind = $1 AND token_hash = $2
            LIMIT 1
            "#,
        )
        .bind(kind)
        .bind(token_hash)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| AuthTokenRecord {
            id: r.get("id"),
            user_id: r.get("user_id"),
            kind: r.get("kind"),
            token_hash: r.get("token_hash"),
            expires_at: r.get("expires_at"),
            used_at: r.get("used_at"),
            created_at: r.get("created_at"),
        }))
    }

    pub async fn consume_auth_token(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(r#"UPDATE auth_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL"#)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn mark_email_verified(&self, user_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(r#"UPDATE users SET email_verified = TRUE WHERE id = $1"#)
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn is_user_email_verified(&self, user_id: &str) -> Result<bool, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT email_verified
            FROM users
            WHERE id = $1
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row
            .map(|record| record.get::<bool, _>("email_verified"))
            .unwrap_or(false))
    }

    pub async fn find_user_by_email(&self, email: &str) -> Result<Option<UserRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, email, password_hash, auth_provider, google_sub, display_name, created_at::text as created_at
            FROM users
            WHERE lower(email) = lower($1)
            LIMIT 1
            "#,
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(user_from_row).transpose()?)
    }

    pub async fn find_user_by_google_sub(
        &self,
        google_sub: &str,
    ) -> Result<Option<UserRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, email, password_hash, auth_provider, google_sub, display_name, created_at::text as created_at
            FROM users
            WHERE google_sub = $1
            LIMIT 1
            "#,
        )
        .bind(google_sub)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(user_from_row).transpose()?)
    }

    pub async fn create_session(&self, session: &AuthSessionRecord) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO auth_sessions (token, user_id, created_at, expires_at)
            VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
            "#,
        )
        // Store a SHA-256 hash of the bearer token, never the raw token (GAP-005).
        .bind(sha256_token(&session.token))
        .bind(&session.user_id)
        .bind(&session.created_at)
        .bind(&session.expires_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_session(
        &self,
        token: &str,
    ) -> Result<Option<AuthSessionRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT token, user_id, created_at::text as created_at, expires_at::text as expires_at
            FROM auth_sessions
            WHERE token = $1
            LIMIT 1
            "#,
        )
        .bind(sha256_token(token))
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(session_from_row).transpose()?)
    }

    pub async fn list_sessions_by_user(
        &self,
        user_id: &str,
    ) -> Result<Vec<AuthSessionRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT token, user_id, created_at::text as created_at, expires_at::text as expires_at
            FROM auth_sessions
            WHERE user_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(session_from_row).collect::<Result<Vec<_>, _>>()?)
    }

    pub async fn revoke_session(&self, user_id: &str, token: &str) -> Result<bool, sqlx::Error> {
        self.revoke_session_by_hash(user_id, &sha256_token(token))
            .await
    }

    pub async fn revoke_session_by_hash(
        &self,
        user_id: &str,
        token_hash: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            r#"
            DELETE FROM auth_sessions
            WHERE user_id = $1
              AND token = $2
            "#,
        )
        .bind(user_id)
        .bind(token_hash)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() == 1)
    }

    pub async fn revoke_other_sessions(
        &self,
        user_id: &str,
        current_token: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            r#"
            DELETE FROM auth_sessions
            WHERE user_id = $1
              AND token <> $2
            "#,
        )
        .bind(user_id)
        .bind(sha256_token(current_token))
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn revoke_all_sessions(&self, user_id: &str) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(r#"DELETE FROM auth_sessions WHERE user_id = $1"#)
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_user_account_and_data(
        &self,
        user_id: &str,
        email: &str,
        agent_ids: &[String],
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        if !agent_ids.is_empty() {
            let thread_rows = sqlx::query(
                r#"
                SELECT DISTINCT thread_id
                FROM messages
                WHERE from_agent = ANY($1)
                   OR EXISTS (
                       SELECT 1
                       FROM jsonb_array_elements_text(to_agents) AS recipient
                       WHERE recipient = ANY($1)
                   )
                "#,
            )
            .bind(agent_ids)
            .fetch_all(&mut *tx)
            .await?;

            let thread_ids = thread_rows
                .into_iter()
                .filter_map(|row| row.try_get::<Option<String>, _>("thread_id").ok().flatten())
                .collect::<Vec<_>>();

            sqlx::query(
                r#"
                DELETE FROM sync_devices
                WHERE agent_id = ANY($1)
                "#,
            )
            .bind(agent_ids)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                r#"
                DELETE FROM messages
                WHERE from_agent = ANY($1)
                   OR EXISTS (
                       SELECT 1
                       FROM jsonb_array_elements_text(to_agents) AS recipient
                       WHERE recipient = ANY($1)
                   )
                "#,
            )
            .bind(agent_ids)
            .execute(&mut *tx)
            .await?;

            if !thread_ids.is_empty() {
                sqlx::query(
                    r#"
                    DELETE FROM action_audit_log
                    WHERE thread_id = ANY($1)
                    "#,
                )
                .bind(&thread_ids)
                .execute(&mut *tx)
                .await?;

                sqlx::query(
                    r#"
                    DELETE FROM personalization_events
                    WHERE thread_id = ANY($1)
                    "#,
                )
                .bind(&thread_ids)
                .execute(&mut *tx)
                .await?;
            }
        }

        sqlx::query(
            r#"
            DELETE FROM waitlist_submissions
            WHERE lower(email) = lower($1)
            "#,
        )
        .bind(email)
        .execute(&mut *tx)
        .await?;

        // Drop the tenant-private schema so private AFP messages, per-user
        // workflow tables, and other user-scoped data cannot survive account
        // deletion in orphaned schemas.
        let tenant_schema = tenant_schema_name(user_id);
        sqlx::query(&format!(
            r#"DROP SCHEMA IF EXISTS "{tenant_schema}" CASCADE"#
        ))
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            DELETE FROM users
            WHERE id = $1
            "#,
        )
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    // ── Managed agents ─────────────────────────────────────────────────────────

    pub async fn upsert_managed_agent(
        &self,
        agent: &ManagedAgentRecord,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO managed_agents (
                id, owner_user_id, agent_id, label, email, kind, created_at, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8)
            ON CONFLICT (agent_id) DO UPDATE SET
                owner_user_id = EXCLUDED.owner_user_id,
                label = EXCLUDED.label,
                email = EXCLUDED.email,
                kind = EXCLUDED.kind,
                metadata = EXCLUDED.metadata
            "#,
        )
        .bind(&agent.id)
        .bind(&agent.owner_user_id)
        .bind(&agent.agent_id)
        .bind(&agent.label)
        .bind(&agent.email)
        .bind(&agent.kind)
        .bind(&agent.created_at)
        .bind(agent.metadata.clone())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_managed_agents_by_user(
        &self,
        user_id: &str,
    ) -> Result<Vec<ManagedAgentRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, owner_user_id, agent_id, label, email, kind, created_at::text as created_at, metadata
            FROM managed_agents
            WHERE owner_user_id = $1
            ORDER BY created_at
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(managed_agent_from_row).collect::<Result<Vec<_>, _>>()?)
    }

    pub async fn recent_messages_for_agents(
        &self,
        agent_ids: &[String],
        limit: i64,
    ) -> Result<Vec<ProtoMessage>, sqlx::Error> {
        if agent_ids.is_empty() {
            return Ok(vec![]);
        }

        let rows = sqlx::query(
            r#"
            SELECT
                id,
                thread_id,
                parent_id,
                from_agent,
                to_agents,
                timestamp::text as timestamp,
                type,
                content,
                signature,
                encryption,
                views,
                "references",
                attachments,
                store_in_relational
            FROM messages
            WHERE from_agent = ANY($1)
               OR EXISTS (
                   SELECT 1
                   FROM jsonb_array_elements_text(to_agents) AS recipient
                   WHERE recipient = ANY($1)
               )
            ORDER BY timestamp DESC
            LIMIT $2
            "#,
        )
        .bind(agent_ids)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(proto_message_from_row).collect::<Result<Vec<_>, _>>()?)
    }

    /// GAP-075: fetch recent messages from the user's private tenant schema.
    /// The shared `messages` table only holds public/inter-agent messages;
    /// personal messages written via `store_private_message` live in the
    /// tenant-scoped table and were missing from the dashboard bootstrap.
    pub async fn recent_private_messages_for_user(
        &self,
        user_id: &str,
        limit: i64,
    ) -> Result<Vec<ProtoMessage>, sqlx::Error> {
        let table = tenant_messages_table(user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT
                id,
                thread_id,
                parent_id,
                from_agent,
                to_agents,
                timestamp::text as timestamp,
                type,
                content,
                signature,
                encryption,
                views,
                "references",
                attachments,
                store_in_relational
            FROM {table}
            ORDER BY timestamp DESC
            LIMIT $1
            "#,
        ))
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(proto_message_from_row).collect::<Result<Vec<_>, _>>()?)
    }

    /// Returns lightweight private-message previews shaped for metadata-first background scans.
    /// This avoids hydrating full proto messages when a daemon only needs a recent window of
    /// message ids, headers, and short plaintext previews.
    pub async fn recent_private_message_previews_for_user(
        &self,
        user_id: &str,
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let table = tenant_messages_table(user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT
                id,
                thread_id,
                timestamp::text as timestamp,
                type,
                subtype,
                from_agent,
                metadata,
                COALESCE(
                    summary,
                    content->>'text',
                    content->>'body',
                    content->>'message',
                    content->>'description',
                    content->>'summary',
                    content->>'title'
                ) AS content_preview
            FROM {table}
            ORDER BY timestamp DESC
            LIMIT $1
            "#,
        ))
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                json!({
                    "id": row.get::<String, _>("id"),
                    "thread_id": row.get::<String, _>("thread_id"),
                    "timestamp": row.get::<String, _>("timestamp"),
                    "type": row.get::<String, _>("type"),
                    "subtype": row.get::<Option<String>, _>("subtype"),
                    "from": row.get::<String, _>("from_agent"),
                    "metadata": row.get::<Option<Value>, _>("metadata"),
                    "content_preview": row.get::<Option<String>, _>("content_preview"),
                })
            })
            .collect())
    }

    pub async fn recent_action_results_for_threads(
        &self,
        thread_ids: &[String],
        limit: i64,
    ) -> Result<Vec<ActionAuditEntry>, sqlx::Error> {
        if thread_ids.is_empty() {
            return Ok(vec![]);
        }

        let rows = sqlx::query(
            r#"
            SELECT capability_id, thread_id, status, output, external_reference, recorded_at::text as recorded_at
            FROM action_audit_log
            WHERE thread_id = ANY($1)
            ORDER BY recorded_at DESC
            LIMIT $2
            "#,
        )
        .bind(thread_ids)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(action_audit_entry_from_row).collect::<Result<Vec<_>, _>>()?)
    }

    // ── Runtime deployments & update policy ───────────────────────────────────

    pub async fn upsert_runtime_deployment(
        &self,
        deployment: &RuntimeDeploymentRecord,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO runtime_deployments (
                id, owner_user_id, framework, gui, status, python_version, image_ref,
                runtime_token, workspace_path, config_json, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz)
            ON CONFLICT (owner_user_id, framework) DO UPDATE SET
                gui = EXCLUDED.gui,
                status = EXCLUDED.status,
                python_version = EXCLUDED.python_version,
                image_ref = EXCLUDED.image_ref,
                runtime_token = EXCLUDED.runtime_token,
                workspace_path = EXCLUDED.workspace_path,
                config_json = EXCLUDED.config_json,
                updated_at = EXCLUDED.updated_at
            "#,
        )
        .bind(&deployment.id)
        .bind(&deployment.owner_user_id)
        .bind(&deployment.framework)
        .bind(&deployment.gui)
        .bind(&deployment.status)
        .bind(&deployment.python_version)
        .bind(&deployment.image_ref)
        .bind(&deployment.runtime_token)
        .bind(&deployment.workspace_path)
        .bind(deployment.config_json.clone())
        .bind(&deployment.created_at)
        .bind(&deployment.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_runtime_deployment_by_user(
        &self,
        user_id: &str,
    ) -> Result<Option<RuntimeDeploymentRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT
                id, owner_user_id, framework, gui, status, python_version, image_ref,
                runtime_token, workspace_path, config_json, created_at::text as created_at,
                updated_at::text as updated_at
            FROM runtime_deployments
            WHERE owner_user_id = $1
            ORDER BY updated_at DESC
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(runtime_deployment_from_row).transpose()?)
    }

    pub async fn delete_runtime_deployment_by_user(
        &self,
        user_id: &str,
    ) -> Result<Option<RuntimeDeploymentRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            DELETE FROM runtime_deployments
            WHERE id = (
                SELECT id
                FROM runtime_deployments
                WHERE owner_user_id = $1
                ORDER BY updated_at DESC
                LIMIT 1
            )
            RETURNING
                id, owner_user_id, framework, gui, status, python_version, image_ref,
                runtime_token, workspace_path, config_json, created_at::text as created_at,
                updated_at::text as updated_at
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(runtime_deployment_from_row).transpose()?)
    }

    pub async fn upsert_runtime_update_policy(
        &self,
        owner_user_id: &str,
        update_channel: &str,
        auto_apply: &str,
        last_checked_at: Option<&str>,
        last_applied_at: Option<&str>,
    ) -> Result<RuntimeUpdatePolicyRecord, sqlx::Error> {
        let row = sqlx::query(
            r#"
            INSERT INTO runtime_update_policies (
                owner_user_id, update_channel, auto_apply, last_checked_at, last_applied_at, updated_at
            )
            VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, NOW())
            ON CONFLICT (owner_user_id) DO UPDATE SET
                update_channel = EXCLUDED.update_channel,
                auto_apply = EXCLUDED.auto_apply,
                last_checked_at = COALESCE(EXCLUDED.last_checked_at, runtime_update_policies.last_checked_at),
                last_applied_at = COALESCE(EXCLUDED.last_applied_at, runtime_update_policies.last_applied_at),
                updated_at = NOW()
            RETURNING
                owner_user_id,
                update_channel,
                auto_apply,
                last_checked_at::text AS last_checked_at,
                last_applied_at::text AS last_applied_at,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            "#,
        )
        .bind(owner_user_id)
        .bind(update_channel)
        .bind(auto_apply)
        .bind(last_checked_at)
        .bind(last_applied_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(runtime_update_policy_from_row(row)?)
    }

    pub async fn find_runtime_update_policy(
        &self,
        owner_user_id: &str,
    ) -> Result<Option<RuntimeUpdatePolicyRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT
                owner_user_id,
                update_channel,
                auto_apply,
                last_checked_at::text AS last_checked_at,
                last_applied_at::text AS last_applied_at,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            FROM runtime_update_policies
            WHERE owner_user_id = $1
            "#,
        )
        .bind(owner_user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(runtime_update_policy_from_row).transpose()?)
    }

    pub async fn create_runtime_update_event(
        &self,
        record: &RuntimeUpdateEventRecord,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO runtime_update_events (
                id, owner_user_id, runtime_deployment_id, action, from_version, to_version, status, notes_json, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
            "#,
        )
        .bind(&record.id)
        .bind(&record.owner_user_id)
        .bind(&record.runtime_deployment_id)
        .bind(&record.action)
        .bind(&record.from_version)
        .bind(&record.to_version)
        .bind(&record.status)
        .bind(record.notes_json.clone())
        .bind(&record.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_runtime_update_events(
        &self,
        owner_user_id: &str,
        limit: i64,
    ) -> Result<Vec<RuntimeUpdateEventRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT
                id,
                owner_user_id,
                runtime_deployment_id,
                action,
                from_version,
                to_version,
                status,
                notes_json,
                created_at::text AS created_at
            FROM runtime_update_events
            WHERE owner_user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(owner_user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(runtime_update_event_from_row)
            .collect::<Result<Vec<_>, _>>()?)
    }

    pub async fn create_runtime_runner_policy_event(
        &self,
        record: &RuntimeRunnerPolicyEventRecord,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO runtime_runner_policy_events (
                id, owner_user_id, runtime_deployment_id, event_kind, summary_json, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
            "#,
        )
        .bind(&record.id)
        .bind(&record.owner_user_id)
        .bind(&record.runtime_deployment_id)
        .bind(&record.event_kind)
        .bind(record.summary_json.clone())
        .bind(&record.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_runtime_runner_policy_events(
        &self,
        owner_user_id: &str,
        limit: i64,
    ) -> Result<Vec<RuntimeRunnerPolicyEventRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT
                id,
                owner_user_id,
                runtime_deployment_id,
                event_kind,
                summary_json,
                created_at::text AS created_at
            FROM runtime_runner_policy_events
            WHERE owner_user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(owner_user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(runtime_runner_policy_event_from_row)
            .collect::<Result<Vec<_>, _>>()?)
    }

    // ── User onboarding ────────────────────────────────────────────────────────

    pub async fn upsert_user_onboarding(
        &self,
        onboarding: &UserOnboardingRecord,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO user_onboarding (
                owner_user_id, identity_confirmed, email_provider, email_address,
                email_connected, llm_mode, notes, updated_at, completed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)
            ON CONFLICT (owner_user_id) DO UPDATE SET
                identity_confirmed = EXCLUDED.identity_confirmed,
                email_provider = EXCLUDED.email_provider,
                email_address = EXCLUDED.email_address,
                email_connected = EXCLUDED.email_connected,
                llm_mode = EXCLUDED.llm_mode,
                notes = EXCLUDED.notes,
                updated_at = EXCLUDED.updated_at,
                completed_at = EXCLUDED.completed_at
            "#,
        )
        .bind(&onboarding.owner_user_id)
        .bind(onboarding.identity_confirmed)
        .bind(&onboarding.email_provider)
        .bind(&onboarding.email_address)
        .bind(onboarding.email_connected)
        .bind(&onboarding.llm_mode)
        .bind(onboarding.notes.clone())
        .bind(&onboarding.updated_at)
        .bind(&onboarding.completed_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_user_onboarding(
        &self,
        user_id: &str,
    ) -> Result<Option<UserOnboardingRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT
                owner_user_id, identity_confirmed, email_provider, email_address,
                email_connected, llm_mode, notes, updated_at::text as updated_at,
                completed_at::text as completed_at
            FROM user_onboarding
            WHERE owner_user_id = $1
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(user_onboarding_from_row).transpose()?)
    }

    // ── Support access ─────────────────────────────────────────────────────────

    pub async fn create_support_access_grant(
        &self,
        owner_user_id: &str,
        access_scope: &str,
        reason: Option<&str>,
        expires_at: &str,
        notes: Value,
    ) -> Result<SupportAccessGrantRecord, sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE support_access_grants
            SET status = 'revoked', revoked_at = NOW()
            WHERE owner_user_id = $1
              AND status = 'active'
              AND revoked_at IS NULL
            "#,
        )
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;

        let record_id = ulid::Ulid::new().to_string();
        sqlx::query(
            r#"
            INSERT INTO support_access_grants (
                id, owner_user_id, status, access_scope, reason, notes, granted_at, expires_at
            )
            VALUES ($1, $2, 'active', $3, $4, $5, NOW(), $6::timestamptz)
            "#,
        )
        .bind(&record_id)
        .bind(owner_user_id)
        .bind(access_scope)
        .bind(reason)
        .bind(notes)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;

        let row = sqlx::query(
            r#"
            SELECT
                id,
                owner_user_id,
                CASE
                    WHEN status = 'active' AND expires_at <= NOW() THEN 'expired'
                    ELSE status
                END AS status,
                access_scope,
                reason,
                notes,
                granted_at::text AS granted_at,
                expires_at::text AS expires_at,
                revoked_at::text AS revoked_at
            FROM support_access_grants
            WHERE id = $1
            LIMIT 1
            "#,
        )
        .bind(&record_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(support_access_grant_from_row(row)?)
    }

    pub async fn revoke_active_support_access(
        &self,
        owner_user_id: &str,
        revoke_note: Option<&str>,
    ) -> Result<Option<SupportAccessGrantRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            UPDATE support_access_grants
            SET
                status = 'revoked',
                revoked_at = NOW(),
                notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object('revoked_note', COALESCE($2, 'revoked_by_user'))
            WHERE id = (
                SELECT id
                FROM support_access_grants
                WHERE owner_user_id = $1
                  AND status = 'active'
                  AND revoked_at IS NULL
                ORDER BY granted_at DESC
                LIMIT 1
            )
            RETURNING
                id,
                owner_user_id,
                status,
                access_scope,
                reason,
                notes,
                granted_at::text AS granted_at,
                expires_at::text AS expires_at,
                revoked_at::text AS revoked_at
            "#,
        )
        .bind(owner_user_id)
        .bind(revoke_note)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(support_access_grant_from_row).transpose()?)
    }

    pub async fn latest_support_access_grant(
        &self,
        owner_user_id: &str,
    ) -> Result<Option<SupportAccessGrantRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT
                id,
                owner_user_id,
                CASE
                    WHEN status = 'active' AND expires_at <= NOW() THEN 'expired'
                    ELSE status
                END AS status,
                access_scope,
                reason,
                notes,
                granted_at::text AS granted_at,
                expires_at::text AS expires_at,
                revoked_at::text AS revoked_at
            FROM support_access_grants
            WHERE owner_user_id = $1
            ORDER BY granted_at DESC
            LIMIT 1
            "#,
        )
        .bind(owner_user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(support_access_grant_from_row).transpose()?)
    }

    pub async fn list_support_access_grants(
        &self,
        owner_user_id: &str,
        limit: i64,
    ) -> Result<Vec<SupportAccessGrantRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT
                id,
                owner_user_id,
                CASE
                    WHEN status = 'active' AND expires_at <= NOW() THEN 'expired'
                    ELSE status
                END AS status,
                access_scope,
                reason,
                notes,
                granted_at::text AS granted_at,
                expires_at::text AS expires_at,
                revoked_at::text AS revoked_at
            FROM support_access_grants
            WHERE owner_user_id = $1
            ORDER BY granted_at DESC
            LIMIT $2
            "#,
        )
        .bind(owner_user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(support_access_grant_from_row)
            .collect::<Result<Vec<_>, _>>()?)
    }

    // ── Runtime backups ────────────────────────────────────────────────────────

    pub async fn upsert_runtime_backup_policy(
        &self,
        owner_user_id: &str,
        retention_days: i32,
        storage_mode: &str,
    ) -> Result<RuntimeBackupPolicyRecord, sqlx::Error> {
        let row = sqlx::query(
            r#"
            INSERT INTO runtime_backup_policies (
                owner_user_id, retention_days, storage_mode, updated_at
            )
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (owner_user_id) DO UPDATE SET
                retention_days = EXCLUDED.retention_days,
                storage_mode = EXCLUDED.storage_mode,
                updated_at = NOW()
            RETURNING
                owner_user_id,
                retention_days,
                storage_mode,
                last_snapshot_at::text AS last_snapshot_at,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            "#,
        )
        .bind(owner_user_id)
        .bind(retention_days)
        .bind(storage_mode)
        .fetch_one(&self.pool)
        .await?;

        Ok(runtime_backup_policy_from_row(row)?)
    }

    pub async fn find_runtime_backup_policy(
        &self,
        owner_user_id: &str,
    ) -> Result<Option<RuntimeBackupPolicyRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT
                owner_user_id,
                retention_days,
                storage_mode,
                last_snapshot_at::text AS last_snapshot_at,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            FROM runtime_backup_policies
            WHERE owner_user_id = $1
            "#,
        )
        .bind(owner_user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(runtime_backup_policy_from_row).transpose()?)
    }

    pub async fn create_runtime_backup(
        &self,
        record: &RuntimeBackupRecord,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO runtime_backups (
                id,
                owner_user_id,
                runtime_deployment_id,
                snapshot_type,
                storage_mode,
                status,
                file_count,
                total_workspace_bytes,
                artifact_size_bytes,
                artifact_path,
                manifest_json,
                created_at,
                expires_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::timestamptz
            )
            "#,
        )
        .bind(&record.id)
        .bind(&record.owner_user_id)
        .bind(&record.runtime_deployment_id)
        .bind(&record.snapshot_type)
        .bind(&record.storage_mode)
        .bind(&record.status)
        .bind(record.file_count)
        .bind(record.total_workspace_bytes)
        .bind(record.artifact_size_bytes)
        .bind(&record.artifact_path)
        .bind(record.manifest_json.clone())
        .bind(&record.created_at)
        .bind(&record.expires_at)
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            UPDATE runtime_backup_policies
            SET last_snapshot_at = $2::timestamptz, updated_at = NOW()
            WHERE owner_user_id = $1
            "#,
        )
        .bind(&record.owner_user_id)
        .bind(&record.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_runtime_backups(
        &self,
        owner_user_id: &str,
        limit: i64,
    ) -> Result<Vec<RuntimeBackupRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT
                id,
                owner_user_id,
                runtime_deployment_id,
                snapshot_type,
                storage_mode,
                status,
                file_count,
                total_workspace_bytes,
                artifact_size_bytes,
                artifact_path,
                manifest_json,
                created_at::text AS created_at,
                expires_at::text AS expires_at
            FROM runtime_backups
            WHERE owner_user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(owner_user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(runtime_backup_from_row).collect::<Result<Vec<_>, _>>()?)
    }

    pub async fn find_runtime_backup_by_id(
        &self,
        owner_user_id: &str,
        backup_id: &str,
    ) -> Result<Option<RuntimeBackupRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT
                id,
                owner_user_id,
                runtime_deployment_id,
                snapshot_type,
                storage_mode,
                status,
                file_count,
                total_workspace_bytes,
                artifact_size_bytes,
                artifact_path,
                manifest_json,
                created_at::text AS created_at,
                expires_at::text AS expires_at
            FROM runtime_backups
            WHERE owner_user_id = $1
              AND id = $2
            LIMIT 1
            "#,
        )
        .bind(owner_user_id)
        .bind(backup_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(runtime_backup_from_row).transpose()?)
    }

    pub async fn delete_runtime_backup_by_id(
        &self,
        owner_user_id: &str,
        backup_id: &str,
    ) -> Result<Option<RuntimeBackupRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            DELETE FROM runtime_backups
            WHERE owner_user_id = $1
              AND id = $2
            RETURNING
                id,
                owner_user_id,
                runtime_deployment_id,
                snapshot_type,
                storage_mode,
                status,
                file_count,
                total_workspace_bytes,
                artifact_size_bytes,
                artifact_path,
                manifest_json,
                created_at::text AS created_at,
                expires_at::text AS expires_at
            "#,
        )
        .bind(owner_user_id)
        .bind(backup_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(runtime_backup_from_row).transpose()?)
    }

    pub async fn delete_expired_runtime_backups(
        &self,
        owner_user_id: &str,
    ) -> Result<Vec<RuntimeBackupRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            DELETE FROM runtime_backups
            WHERE owner_user_id = $1
              AND expires_at <= NOW()
            RETURNING
                id,
                owner_user_id,
                runtime_deployment_id,
                snapshot_type,
                storage_mode,
                status,
                file_count,
                total_workspace_bytes,
                artifact_size_bytes,
                artifact_path,
                manifest_json,
                created_at::text AS created_at,
                expires_at::text AS expires_at
            "#,
        )
        .bind(owner_user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(runtime_backup_from_row).collect::<Result<Vec<_>, _>>()?)
    }

    pub async fn create_runtime_restore_drill(
        &self,
        record: &RuntimeRestoreDrillRecord,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO runtime_restore_drills (
                id, owner_user_id, backup_id, status, notes_json, started_at, completed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
            "#,
        )
        .bind(&record.id)
        .bind(&record.owner_user_id)
        .bind(&record.backup_id)
        .bind(&record.status)
        .bind(record.notes_json.clone())
        .bind(&record.started_at)
        .bind(&record.completed_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_runtime_restore_drills(
        &self,
        owner_user_id: &str,
        limit: i64,
    ) -> Result<Vec<RuntimeRestoreDrillRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT
                id,
                owner_user_id,
                backup_id,
                status,
                notes_json,
                started_at::text AS started_at,
                completed_at::text AS completed_at
            FROM runtime_restore_drills
            WHERE owner_user_id = $1
            ORDER BY started_at DESC
            LIMIT $2
            "#,
        )
        .bind(owner_user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(runtime_restore_drill_from_row)
            .collect::<Result<Vec<_>, _>>()?)
    }

    pub async fn delete_runtime_backups_by_user(
        &self,
        owner_user_id: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            r#"
            DELETE FROM runtime_backups
            WHERE owner_user_id = $1
            "#,
        )
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }

    // ── Waitlist ───────────────────────────────────────────────────────────────

    pub async fn record_waitlist_submission(
        &self,
        email: &str,
        delivery_status: &str,
        delivery_error: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO waitlist_submissions (
                id, email, delivery_status, delivery_error, created_at
            )
            VALUES ($1, $2, $3, $4, NOW())
            "#,
        )
        .bind(ulid::Ulid::new().to_string())
        .bind(email)
        .bind(delivery_status)
        .bind(delivery_error)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ── Agent template ────────────────────────────────────────────────────────

    // ── Agent instances & tasks ────────────────────────────────────────────────

    /// Provision an agent instance for a new user account.
    /// Idempotent: if the user already has an instance, returns its ID without error.
    pub async fn provision_agent(
        &self,
        instance: &crate::agent_template::AgentInstance,
    ) -> Result<String, sqlx::Error> {
        let id: String = sqlx::query_scalar(
            r#"
            INSERT INTO agent_instances (
                id, owner_user_id, agent_id, name, status,
                system_prompt, priority_rules_json, created_at, updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
            ON CONFLICT (agent_id) DO UPDATE
                SET updated_at = EXCLUDED.updated_at
            RETURNING id
            "#,
        )
        .bind(&instance.id)
        .bind(&instance.owner_user_id)
        .bind(&instance.agent_id)
        .bind(&instance.name)
        .bind(&instance.status)
        .bind(&instance.system_prompt)
        .bind(&instance.priority_rules)
        .fetch_one(&self.pool)
        .await?;
        Ok(id)
    }

    pub async fn get_agent_instance(
        &self,
        owner_user_id: &str,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, agent_id, name, status, system_prompt,
                   priority_rules_json, created_at::text, updated_at::text
            FROM agent_instances
            WHERE owner_user_id = $1
            LIMIT 1
            "#,
        )
        .bind(owner_user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| {
            json!({
                "id": r.get::<String, _>("id"),
                "agent_id": r.get::<String, _>("agent_id"),
                "name": r.get::<String, _>("name"),
                "status": r.get::<String, _>("status"),
                "system_prompt": r.get::<String, _>("system_prompt"),
                "priority_rules": r.get::<serde_json::Value, _>("priority_rules_json"),
                "created_at": r.get::<String, _>("created_at"),
                "updated_at": r.get::<String, _>("updated_at"),
            })
        }))
    }

    pub async fn create_agent_task(
        &self,
        task: &crate::agent_template::AgentTask,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_agent_task_queue_table(&task.owner_user_id);
        sqlx::query(&format!(
            r#"
            INSERT INTO {table} (
                id, owner_user_id, agent_instance_id, thread_id,
                status, intent, plan_json, result_json, priority, created_at, updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
            "#,
        ))
        .bind(&task.id)
        .bind(&task.owner_user_id)
        .bind(&task.agent_instance_id)
        .bind(&task.thread_id)
        .bind(task.status.as_str())
        .bind(&task.intent)
        .bind(&task.plan)
        .bind(&task.result)
        .bind(task.priority.as_str())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_agent_tasks(
        &self,
        owner_user_id: &str,
        status_filter: Option<&str>,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let table = tenant_agent_task_queue_table(owner_user_id);
        let rows = if let Some(status) = status_filter {
            sqlx::query(&format!(
                r#"
                SELECT id, agent_instance_id, thread_id, status, intent,
                       plan_json, result_json, error, priority,
                       created_at::text, updated_at::text
                FROM {table}
                WHERE owner_user_id = $1 AND status = $2
                ORDER BY created_at DESC LIMIT $3
                "#,
            ))
            .bind(owner_user_id)
            .bind(status)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query(&format!(
                r#"
                SELECT id, agent_instance_id, thread_id, status, intent,
                       plan_json, result_json, error, priority,
                       created_at::text, updated_at::text
                FROM {table}
                WHERE owner_user_id = $1
                ORDER BY created_at DESC LIMIT $2
                "#,
            ))
            .bind(owner_user_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows.iter().map(agent_task_json_from_row).collect())
    }

    pub async fn get_agent_task(
        &self,
        owner_user_id: &str,
        task_id: &str,
    ) -> Result<serde_json::Value, sqlx::Error> {
        let table = tenant_agent_task_queue_table(owner_user_id);
        let row = sqlx::query(&format!(
            r#"
            SELECT id, agent_instance_id, thread_id, status, intent,
                   plan_json, result_json, error, priority,
                   created_at::text, updated_at::text
            FROM {table}
            WHERE owner_user_id = $1 AND id = $2
            "#,
        ))
        .bind(owner_user_id)
        .bind(task_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(r) => Ok(agent_task_json_from_row(&r)),
            None => Err(sqlx::Error::RowNotFound),
        }
    }

    pub async fn update_agent_task_status(
        &self,
        owner_user_id: &str,
        task_id: &str,
        status: &str,
        result: Option<serde_json::Value>,
        error: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_agent_task_queue_table(owner_user_id);
        let result = sqlx::query(&format!(
            r#"
            UPDATE {table}
            SET status = $3,
                result_json = COALESCE($4, result_json),
                error = $5,
                updated_at = NOW()
            WHERE id = $2 AND owner_user_id = $1
            "#,
        ))
        .bind(owner_user_id)
        .bind(task_id)
        .bind(status)
        .bind(result)
        .bind(error)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        Ok(())
    }

    // ── Workflow storage ───────────────────────────────────────────────────────

    pub async fn upsert_saved_workflow(
        &self,
        record: &SavedWorkflowRecord,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_saved_workflows_table(&record.owner_user_id);
        sqlx::query(&format!(
            r#"
            INSERT INTO {table} (
                workflow_id, owner_user_id, title, description, favorite,
                preset_kinds, graph_json, latest_ir_json, created_at, updated_at, archived_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11::timestamptz)
            ON CONFLICT (workflow_id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                favorite = EXCLUDED.favorite,
                preset_kinds = EXCLUDED.preset_kinds,
                graph_json = EXCLUDED.graph_json,
                latest_ir_json = EXCLUDED.latest_ir_json,
                updated_at = EXCLUDED.updated_at,
                archived_at = EXCLUDED.archived_at
            "#,
        ))
        .bind(&record.workflow_id)
        .bind(&record.owner_user_id)
        .bind(&record.title)
        .bind(&record.description)
        .bind(record.favorite)
        .bind(&record.preset_kinds)
        .bind(&record.graph_json)
        .bind(record.latest_ir_json.as_ref())
        .bind(&record.created_at)
        .bind(&record.updated_at)
        .bind(record.archived_at.as_deref())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_saved_workflows(
        &self,
        owner_user_id: &str,
        include_archived: bool,
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let table = tenant_saved_workflows_table(owner_user_id);
        let rows = if include_archived {
            sqlx::query(&format!(
                r#"
                SELECT workflow_id, owner_user_id, title, description, favorite,
                       preset_kinds, graph_json, latest_ir_json,
                       created_at::text, updated_at::text, archived_at::text
                FROM {table}
                WHERE owner_user_id = $1
                ORDER BY favorite DESC, updated_at DESC
                LIMIT $2
                "#,
            ))
            .bind(owner_user_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query(&format!(
                r#"
                SELECT workflow_id, owner_user_id, title, description, favorite,
                       preset_kinds, graph_json, latest_ir_json,
                       created_at::text, updated_at::text, archived_at::text
                FROM {table}
                WHERE owner_user_id = $1
                  AND archived_at IS NULL
                ORDER BY favorite DESC, updated_at DESC
                LIMIT $2
                "#,
            ))
            .bind(owner_user_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows.iter().map(saved_workflow_json_from_row).collect())
    }

    pub async fn get_saved_workflow(
        &self,
        owner_user_id: &str,
        workflow_id: &str,
    ) -> Result<Value, sqlx::Error> {
        let table = tenant_saved_workflows_table(owner_user_id);
        let row = sqlx::query(&format!(
            r#"
            SELECT workflow_id, owner_user_id, title, description, favorite,
                   preset_kinds, graph_json, latest_ir_json,
                   created_at::text, updated_at::text, archived_at::text
            FROM {table}
            WHERE owner_user_id = $1 AND workflow_id = $2
            "#,
        ))
        .bind(owner_user_id)
        .bind(workflow_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(r) => Ok(saved_workflow_json_from_row(&r)),
            None => Err(sqlx::Error::RowNotFound),
        }
    }

    pub async fn append_workflow_deployment(
        &self,
        record: &WorkflowDeploymentRecord,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_workflow_deployments_table(&record.owner_user_id);
        sqlx::query(&format!(
            r#"
            INSERT INTO {table} (
                deployment_id, workflow_id, owner_user_id, environment, status,
                ir_snapshot_json, graph_snapshot_json, source_deployment_id,
                deployed_at, created_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz)
            ON CONFLICT (deployment_id) DO UPDATE SET
                status = EXCLUDED.status,
                ir_snapshot_json = EXCLUDED.ir_snapshot_json,
                graph_snapshot_json = EXCLUDED.graph_snapshot_json,
                source_deployment_id = EXCLUDED.source_deployment_id,
                deployed_at = EXCLUDED.deployed_at
            "#,
        ))
        .bind(&record.deployment_id)
        .bind(&record.workflow_id)
        .bind(&record.owner_user_id)
        .bind(&record.environment)
        .bind(&record.status)
        .bind(&record.ir_snapshot_json)
        .bind(&record.graph_snapshot_json)
        .bind(record.source_deployment_id.as_deref())
        .bind(&record.deployed_at)
        .bind(&record.created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_workflow_deployments(
        &self,
        owner_user_id: &str,
        workflow_id: &str,
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let table = tenant_workflow_deployments_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT deployment_id, workflow_id, owner_user_id, environment, status,
                   ir_snapshot_json, graph_snapshot_json, source_deployment_id,
                   deployed_at::text, created_at::text
            FROM {table}
            WHERE owner_user_id = $1
              AND workflow_id = $2
            ORDER BY deployed_at DESC, created_at DESC
            LIMIT $3
            "#,
        ))
        .bind(owner_user_id)
        .bind(workflow_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(workflow_deployment_json_from_row).collect())
    }

    pub async fn get_workflow_deployment(
        &self,
        owner_user_id: &str,
        workflow_id: &str,
        deployment_id: &str,
    ) -> Result<Value, sqlx::Error> {
        let table = tenant_workflow_deployments_table(owner_user_id);
        let row = sqlx::query(&format!(
            r#"
            SELECT deployment_id, workflow_id, owner_user_id, environment, status,
                   ir_snapshot_json, graph_snapshot_json, source_deployment_id,
                   deployed_at::text, created_at::text
            FROM {table}
            WHERE owner_user_id = $1
              AND workflow_id = $2
              AND deployment_id = $3
            "#,
        ))
        .bind(owner_user_id)
        .bind(workflow_id)
        .bind(deployment_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(r) => Ok(workflow_deployment_json_from_row(&r)),
            None => Err(sqlx::Error::RowNotFound),
        }
    }

    pub async fn append_workflow_run(&self, record: &WorkflowRunRecord) -> Result<(), sqlx::Error> {
        let table = tenant_workflow_runs_table(&record.owner_user_id);
        sqlx::query(&format!(
            r#"
            INSERT INTO {table} (
                run_id, workflow_id, deployment_id, owner_user_id, status,
                trigger_kind, replay_of_run_id, timeline_json, result_json,
                started_at, completed_at, created_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12::timestamptz)
            ON CONFLICT (run_id) DO UPDATE SET
                status = EXCLUDED.status,
                timeline_json = EXCLUDED.timeline_json,
                result_json = EXCLUDED.result_json,
                completed_at = EXCLUDED.completed_at
            "#
        ))
        .bind(&record.run_id)
        .bind(&record.workflow_id)
        .bind(&record.deployment_id)
        .bind(&record.owner_user_id)
        .bind(&record.status)
        .bind(&record.trigger_kind)
        .bind(record.replay_of_run_id.as_deref())
        .bind(&record.timeline_json)
        .bind(&record.result_json)
        .bind(&record.started_at)
        .bind(record.completed_at.as_deref())
        .bind(&record.created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_workflow_runs(
        &self,
        owner_user_id: &str,
        workflow_id: &str,
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let table = tenant_workflow_runs_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT run_id, workflow_id, deployment_id, owner_user_id, status,
                   trigger_kind, replay_of_run_id, timeline_json, result_json,
                   started_at::text, completed_at::text, created_at::text
            FROM {table}
            WHERE owner_user_id = $1
              AND workflow_id = $2
            ORDER BY started_at DESC, created_at DESC
            LIMIT $3
            "#
        ))
        .bind(owner_user_id)
        .bind(workflow_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(workflow_run_json_from_row).collect())
    }

    pub async fn get_workflow_run(
        &self,
        owner_user_id: &str,
        workflow_id: &str,
        run_id: &str,
    ) -> Result<Value, sqlx::Error> {
        let table = tenant_workflow_runs_table(owner_user_id);
        let row = sqlx::query(&format!(
            r#"
            SELECT run_id, workflow_id, deployment_id, owner_user_id, status,
                   trigger_kind, replay_of_run_id, timeline_json, result_json,
                   started_at::text, completed_at::text, created_at::text
            FROM {table}
            WHERE owner_user_id = $1
              AND workflow_id = $2
              AND run_id = $3
            "#
        ))
        .bind(owner_user_id)
        .bind(workflow_id)
        .bind(run_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(r) => Ok(workflow_run_json_from_row(&r)),
            None => Err(sqlx::Error::RowNotFound),
        }
    }

    // ── Workflow wait / resume ─────────────────────────────────────────────────

    pub async fn append_workflow_wait_resume_record(
        &self,
        record: &WorkflowWaitResumeRecord,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_workflow_wait_resume_table(&record.owner_user_id);
        sqlx::query(&format!(
            r#"
            INSERT INTO {table} (
                wait_resume_id, workflow_id, deployment_id, run_id, owner_user_id,
                manifest_node_id, source_graph_node_id, status, resume_family, resume_kind,
                wait_reason, scheduled_for, descriptor_json, created_at, resumed_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$13,$14::timestamptz,$15::timestamptz)
            ON CONFLICT (wait_resume_id) DO UPDATE SET
                status = EXCLUDED.status,
                wait_reason = EXCLUDED.wait_reason,
                scheduled_for = EXCLUDED.scheduled_for,
                descriptor_json = EXCLUDED.descriptor_json,
                resumed_at = EXCLUDED.resumed_at
            "#
        ))
        .bind(&record.wait_resume_id)
        .bind(&record.workflow_id)
        .bind(&record.deployment_id)
        .bind(&record.run_id)
        .bind(&record.owner_user_id)
        .bind(&record.manifest_node_id)
        .bind(&record.source_graph_node_id)
        .bind(&record.status)
        .bind(&record.resume_family)
        .bind(&record.resume_kind)
        .bind(record.wait_reason.as_deref())
        .bind(record.scheduled_for.as_deref())
        .bind(&record.descriptor_json)
        .bind(&record.created_at)
        .bind(record.resumed_at.as_deref())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_workflow_wait_resume_records(
        &self,
        owner_user_id: &str,
        workflow_id: &str,
        run_id: &str,
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let table = tenant_workflow_wait_resume_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT wait_resume_id, workflow_id, deployment_id, run_id, owner_user_id,
                   manifest_node_id, source_graph_node_id, status, resume_family, resume_kind,
                   wait_reason, scheduled_for::text, descriptor_json, created_at::text, resumed_at::text
            FROM {table}
            WHERE owner_user_id = $1
              AND workflow_id = $2
              AND run_id = $3
            ORDER BY created_at DESC
            LIMIT $4
            "#
        ))
        .bind(owner_user_id)
        .bind(workflow_id)
        .bind(run_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(workflow_wait_resume_json_from_row)
            .collect())
    }

    pub async fn get_workflow_wait_resume_record(
        &self,
        owner_user_id: &str,
        workflow_id: &str,
        run_id: &str,
        wait_resume_id: &str,
    ) -> Result<Value, sqlx::Error> {
        let table = tenant_workflow_wait_resume_table(owner_user_id);
        let row = sqlx::query(&format!(
            r#"
            SELECT wait_resume_id, workflow_id, deployment_id, run_id, owner_user_id,
                   manifest_node_id, source_graph_node_id, status, resume_family, resume_kind,
                   wait_reason, scheduled_for::text, descriptor_json, created_at::text, resumed_at::text
            FROM {table}
            WHERE owner_user_id = $1
              AND workflow_id = $2
              AND run_id = $3
              AND wait_resume_id = $4
            "#
        ))
        .bind(owner_user_id)
        .bind(workflow_id)
        .bind(run_id)
        .bind(wait_resume_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(row) => Ok(workflow_wait_resume_json_from_row(&row)),
            None => Err(sqlx::Error::RowNotFound),
        }
    }

    pub async fn list_due_workflow_wait_resume_records(
        &self,
        owner_user_id: &str,
        due_before: &str,
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let table = tenant_workflow_wait_resume_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT wait_resume_id, workflow_id, deployment_id, run_id, owner_user_id,
                   manifest_node_id, source_graph_node_id, status, resume_family, resume_kind,
                   wait_reason, scheduled_for::text, descriptor_json, created_at::text, resumed_at::text
            FROM {table}
            WHERE owner_user_id = $1
              AND status = 'pending'
              AND resume_family IN ('timer', 'hybrid')
              AND scheduled_for IS NOT NULL
              AND scheduled_for <= $2::timestamptz
            ORDER BY scheduled_for ASC, created_at ASC
            LIMIT $3
            "#
        ))
        .bind(owner_user_id)
        .bind(due_before)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(workflow_wait_resume_json_from_row)
            .collect())
    }

    pub async fn update_workflow_wait_resume_record_status(
        &self,
        owner_user_id: &str,
        wait_resume_id: &str,
        status: &str,
        resumed_at: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_workflow_wait_resume_table(owner_user_id);
        sqlx::query(&format!(
            r#"
            UPDATE {table}
            SET status = $3,
                resumed_at = $4::timestamptz
            WHERE owner_user_id = $1
              AND wait_resume_id = $2
            "#
        ))
        .bind(owner_user_id)
        .bind(wait_resume_id)
        .bind(status)
        .bind(resumed_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Workflow trigger registry ─────────────────────────────────────────────

    pub async fn upsert_workflow_trigger_registration(
        &self,
        record: &WorkflowTriggerRegistrationRecord,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_workflow_trigger_registrations_table(&record.owner_user_id);
        sqlx::query(&format!(
            r#"
            INSERT INTO {table} (
                registration_id, workflow_id, deployment_id, owner_user_id,
                environment, trigger_node_id, manifest_node_id,
                trigger_family, trigger_kind, registration_status,
                idempotency_key, dedup_hash, descriptor_json,
                last_fired_at, next_fire_at, retry_count, created_at, updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13::jsonb,
                $14::timestamptz, $15::timestamptz, $16, $17::timestamptz, $18::timestamptz
            )
            ON CONFLICT (idempotency_key) DO UPDATE SET
                registration_status = EXCLUDED.registration_status,
                dedup_hash = EXCLUDED.dedup_hash,
                descriptor_json = EXCLUDED.descriptor_json,
                next_fire_at = EXCLUDED.next_fire_at,
                retry_count = EXCLUDED.retry_count,
                updated_at = NOW()
            "#
        ))
        .bind(&record.registration_id)
        .bind(&record.workflow_id)
        .bind(&record.deployment_id)
        .bind(&record.owner_user_id)
        .bind(&record.environment)
        .bind(&record.trigger_node_id)
        .bind(&record.manifest_node_id)
        .bind(&record.trigger_family)
        .bind(&record.trigger_kind)
        .bind(&record.registration_status)
        .bind(&record.idempotency_key)
        .bind(&record.dedup_hash)
        .bind(record.descriptor_json.to_string())
        .bind(record.last_fired_at.as_deref())
        .bind(record.next_fire_at.as_deref())
        .bind(record.retry_count)
        .bind(&record.created_at)
        .bind(&record.updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_workflow_trigger_registrations(
        &self,
        owner_user_id: &str,
        workflow_id: &str,
        deployment_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let table = tenant_workflow_trigger_registrations_table(owner_user_id);
        let rows: Vec<(Value,)> = if let Some(dep_id) = deployment_id {
            sqlx::query_as(&format!(
                r#"
                SELECT to_jsonb(r) AS row
                FROM {table} r
                WHERE r.owner_user_id = $1
                  AND r.workflow_id = $2
                  AND r.deployment_id = $3
                ORDER BY r.created_at DESC
                LIMIT $4
                "#
            ))
            .bind(owner_user_id)
            .bind(workflow_id)
            .bind(dep_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as(&format!(
                r#"
                SELECT to_jsonb(r) AS row
                FROM {table} r
                WHERE r.owner_user_id = $1
                  AND r.workflow_id = $2
                ORDER BY r.created_at DESC
                LIMIT $3
                "#
            ))
            .bind(owner_user_id)
            .bind(workflow_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows.into_iter().map(|(v,)| v).collect())
    }

    pub async fn update_workflow_trigger_registration_status(
        &self,
        owner_user_id: &str,
        registration_id: &str,
        status: &str,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_workflow_trigger_registrations_table(owner_user_id);
        sqlx::query(&format!(
            r#"
            UPDATE {table}
            SET registration_status = $3,
                updated_at = NOW()
            WHERE owner_user_id = $1
              AND registration_id = $2
            "#
        ))
        .bind(owner_user_id)
        .bind(registration_id)
        .bind(status)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn retire_workflow_trigger_registrations_for_deployment(
        &self,
        owner_user_id: &str,
        deployment_id: &str,
    ) -> Result<u64, sqlx::Error> {
        let table = tenant_workflow_trigger_registrations_table(owner_user_id);
        let result = sqlx::query(&format!(
            r#"
            UPDATE {table}
            SET registration_status = 'retired',
                updated_at = NOW()
            WHERE owner_user_id = $1
              AND deployment_id = $2
              AND registration_status != 'retired'
            "#
        ))
        .bind(owner_user_id)
        .bind(deployment_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Returns all `email`-family trigger registrations with status `registered`
    /// for the given user.  Used by the email trigger dispatcher background task.
    /// Returns an empty vec (not an error) when the tenant table does not exist.
    pub async fn list_due_email_trigger_registrations_for_user(
        &self,
        owner_user_id: &str,
    ) -> Result<Vec<WorkflowTriggerRegistrationRecord>, sqlx::Error> {
        let table = tenant_workflow_trigger_registrations_table(owner_user_id);
        let rows: Vec<(serde_json::Value,)> = sqlx::query_as(&format!(
            r#"
            SELECT to_jsonb(r) AS row
            FROM {table} r
            WHERE r.trigger_family = 'event'
              AND r.trigger_kind   = 'email'
              AND r.registration_status = 'registered'
            ORDER BY r.created_at ASC
            LIMIT 100
            "#
        ))
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();
        Ok(rows
            .into_iter()
            .filter_map(|(v,)| serde_json::from_value(v).ok())
            .collect())
    }

    /// Returns all `schedule`-family trigger registrations for the given user
    /// whose `next_fire_at` is at or before `now_rfc3339`.  Used exclusively
    /// by the background cron scheduler.  Returns an empty vec (not an error)
    /// when the tenant schema has no trigger registrations table yet.
    pub async fn list_due_schedule_registrations_for_user(
        &self,
        owner_user_id: &str,
        now_rfc3339: &str,
    ) -> Result<Vec<WorkflowTriggerRegistrationRecord>, sqlx::Error> {
        let table = tenant_workflow_trigger_registrations_table(owner_user_id);
        let rows: Vec<(serde_json::Value,)> = sqlx::query_as(&format!(
            r#"
            SELECT to_jsonb(r) AS row
            FROM {table} r
            WHERE r.trigger_family = 'schedule'
              AND r.registration_status = 'registered'
              AND (r.next_fire_at IS NULL OR r.next_fire_at <= $1::timestamptz)
            ORDER BY r.next_fire_at ASC NULLS FIRST
            LIMIT 100
            "#
        ))
        .bind(now_rfc3339)
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default(); // table may not exist for users with no tenant schema yet
        Ok(rows
            .into_iter()
            .filter_map(|(v,)| serde_json::from_value(v).ok())
            .collect())
    }

    /// Updates `last_fired_at` and `next_fire_at` on a schedule trigger
    /// registration after a successful scheduler-initiated run.
    /// Resets `retry_count` to 0.
    pub async fn mark_trigger_fired(
        &self,
        owner_user_id: &str,
        registration_id: &str,
        last_fired_at: &str,
        next_fire_at: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_workflow_trigger_registrations_table(owner_user_id);
        sqlx::query(&format!(
            r#"
            UPDATE {table}
            SET last_fired_at = $1::timestamptz,
                next_fire_at  = $2::timestamptz,
                retry_count   = 0,
                updated_at    = NOW()
            WHERE registration_id = $3
              AND owner_user_id   = $4
            "#
        ))
        .bind(last_fired_at)
        .bind(next_fire_at)
        .bind(registration_id)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Webhook ingress routing (migration 0029) ──────────────────────────────

    /// Register a public webhook ingress route.
    ///
    /// Called at workflow deploy time for every webhook-family trigger
    /// registration so the unauthenticated `POST /ingest/webhook/{id}` handler
    /// can look up the owning tenant and workflow without bearer auth.
    pub async fn insert_webhook_ingress_route(
        &self,
        registration_id: &str,
        owner_user_id: &str,
        workflow_id: &str,
        webhook_path: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO public.webhook_ingress_routing
                (registration_id, owner_user_id, workflow_id, webhook_path, registered_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (registration_id) DO UPDATE
                SET owner_user_id = EXCLUDED.owner_user_id,
                    workflow_id   = EXCLUDED.workflow_id,
                    webhook_path  = EXCLUDED.webhook_path,
                    registered_at = NOW()
            "#,
        )
        .bind(registration_id)
        .bind(owner_user_id)
        .bind(workflow_id)
        .bind(webhook_path)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Look up the routing row for a given `registration_id`.
    ///
    /// Returns `(owner_user_id, workflow_id, webhook_path)` when found.
    /// Returns `None` when the registration is not in the routing table
    /// (i.e. not a webhook-family trigger or not yet deployed).
    pub async fn lookup_webhook_ingress_route(
        &self,
        registration_id: &str,
    ) -> Result<Option<(String, String, Option<String>)>, sqlx::Error> {
        let row: Option<(String, String, Option<String>)> = sqlx::query_as(
            r#"
            SELECT owner_user_id, workflow_id, webhook_path
            FROM public.webhook_ingress_routing
            WHERE registration_id = $1
            "#,
        )
        .bind(registration_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    /// Remove the webhook ingress route for a registration.
    ///
    /// Called at rollback or trigger retirement so stale routes do not linger
    /// in the routing table and cannot receive new webhook deliveries.
    pub async fn delete_webhook_ingress_route(
        &self,
        registration_id: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(r#"DELETE FROM public.webhook_ingress_routing WHERE registration_id = $1"#)
            .bind(registration_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Email trigger queue (migration 0030) ──────────────────────────────────

    /// Write one entry to the global email trigger queue.
    ///
    /// Called non-fatally by the IMAP/Gmail/Graph sync loop after each email
    /// is successfully ingested so the email_trigger_dispatcher can later
    /// fire workflow runs for all users with registered email-family triggers.
    pub async fn enqueue_email_trigger_event(
        &self,
        event_id: &str,
        provider: &str,
        account: &str,
        email_subject: Option<&str>,
        email_from: Option<&str>,
        message_uid: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO public.email_trigger_queue
                (event_id, provider, account, email_subject, email_from, message_uid, processed_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (event_id) DO NOTHING
            "#,
        )
        .bind(event_id)
        .bind(provider)
        .bind(account)
        .bind(email_subject)
        .bind(email_from)
        .bind(message_uid)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Return up to `limit` unprocessed email trigger queue entries.
    ///
    /// Returns `(event_id, provider, account, email_subject, email_from, message_uid)`.
    pub async fn list_pending_email_trigger_events(
        &self,
        limit: i64,
    ) -> Result<
        Vec<(
            String,
            String,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
        )>,
        sqlx::Error,
    > {
        let rows = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                Option<String>,
                Option<String>,
                Option<String>,
            ),
        >(
            r#"
            SELECT event_id, provider, account, email_subject, email_from, message_uid
            FROM public.email_trigger_queue
            WHERE dispatched_at IS NULL
            ORDER BY processed_at ASC
            LIMIT $1
            "#,
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Mark a queue entry as dispatched after the dispatcher has fired runs for it.
    pub async fn mark_email_trigger_dispatched(&self, event_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"UPDATE public.email_trigger_queue SET dispatched_at = NOW() WHERE event_id = $1"#,
        )
        .bind(event_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── File-drop trigger queue (migration 0031) ──────────────────────────────

    /// Returns all `file_drop`-kind trigger registrations with status `registered`
    /// for the given user.  Used by the file-drop trigger dispatcher background task.
    /// Returns an empty vec (not an error) when the tenant table does not exist.
    pub async fn list_due_file_drop_trigger_registrations_for_user(
        &self,
        owner_user_id: &str,
    ) -> Result<Vec<WorkflowTriggerRegistrationRecord>, sqlx::Error> {
        let table = tenant_workflow_trigger_registrations_table(owner_user_id);
        let rows: Vec<(serde_json::Value,)> = sqlx::query_as(&format!(
            r#"
            SELECT to_jsonb(r) AS row
            FROM {table} r
            WHERE r.trigger_family = 'event'
              AND r.trigger_kind   = 'file_drop'
              AND r.registration_status = 'registered'
            "#
        ))
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();
        Ok(rows
            .into_iter()
            .filter_map(|(v,)| serde_json::from_value(v).ok())
            .collect())
    }

    /// Write one entry to the global file-drop trigger queue.
    ///
    /// Called non-fatally by the file-watcher task after detecting a new file
    /// so the file-drop trigger dispatcher can later fire workflow runs.
    pub async fn enqueue_file_drop_trigger_event(
        &self,
        event_id: &str,
        watched_path: &str,
        file_name: &str,
        file_size_bytes: Option<i64>,
        file_event_type: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO public.file_drop_trigger_queue
                (event_id, watched_path, file_name, file_size_bytes, file_event_type, processed_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (event_id) DO NOTHING
            "#,
        )
        .bind(event_id)
        .bind(watched_path)
        .bind(file_name)
        .bind(file_size_bytes)
        .bind(file_event_type)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Return up to `limit` unprocessed file-drop trigger queue entries.
    ///
    /// Returns `(event_id, watched_path, file_name, file_size_bytes, file_event_type)`.
    pub async fn list_pending_file_drop_trigger_events(
        &self,
        limit: i64,
    ) -> Result<Vec<(String, String, String, Option<i64>, String)>, sqlx::Error> {
        let rows = sqlx::query_as::<_, (String, String, String, Option<i64>, String)>(
            r#"
            SELECT event_id, watched_path, file_name, file_size_bytes, file_event_type
            FROM public.file_drop_trigger_queue
            WHERE dispatched_at IS NULL
            ORDER BY processed_at ASC
            LIMIT $1
            "#,
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Mark a file-drop queue entry as dispatched.
    pub async fn mark_file_drop_trigger_dispatched(
        &self,
        event_id: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"UPDATE public.file_drop_trigger_queue SET dispatched_at = NOW() WHERE event_id = $1"#,
        )
        .bind(event_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Internal event queue (migration 0032) ─────────────────────────────────

    /// Returns all `internal_event`-kind trigger registrations with status `registered`
    /// for the given user.  Used by the internal-event trigger dispatcher.
    /// Returns an empty vec when the tenant table does not exist.
    pub async fn list_due_internal_event_trigger_registrations_for_user(
        &self,
        owner_user_id: &str,
    ) -> Result<Vec<WorkflowTriggerRegistrationRecord>, sqlx::Error> {
        let table = tenant_workflow_trigger_registrations_table(owner_user_id);
        let rows: Vec<(serde_json::Value,)> = sqlx::query_as(&format!(
            r#"
            SELECT to_jsonb(r) AS row
            FROM {table} r
            WHERE r.trigger_family = 'event'
              AND r.trigger_kind   = 'internal_event'
              AND r.registration_status = 'registered'
            "#
        ))
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();
        Ok(rows
            .into_iter()
            .filter_map(|(v,)| serde_json::from_value(v).ok())
            .collect())
    }

    /// Write one entry to the global internal event queue.
    ///
    /// Called non-fatally by the workflow runtime after a run reaches a
    /// terminal state so downstream workflows with internal_event triggers
    /// can be started by the dispatcher.
    pub async fn enqueue_internal_event(
        &self,
        event_id: &str,
        event_type: &str,
        source_workflow_id: Option<&str>,
        source_run_id: Option<&str>,
        owner_user_id: &str,
        payload: &serde_json::Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO public.internal_event_queue
                (event_id, event_type, source_workflow_id, source_run_id,
                 owner_user_id, payload, processed_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (event_id) DO NOTHING
            "#,
        )
        .bind(event_id)
        .bind(event_type)
        .bind(source_workflow_id)
        .bind(source_run_id)
        .bind(owner_user_id)
        .bind(payload)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Return up to `limit` unprocessed internal event queue entries.
    ///
    /// Returns `(event_id, event_type, source_workflow_id, source_run_id, owner_user_id, payload)`.
    pub async fn list_pending_internal_events(
        &self,
        limit: i64,
    ) -> Result<
        Vec<(
            String,
            String,
            Option<String>,
            Option<String>,
            String,
            serde_json::Value,
        )>,
        sqlx::Error,
    > {
        let rows = sqlx::query_as::<
            _,
            (
                String,
                String,
                Option<String>,
                Option<String>,
                String,
                serde_json::Value,
            ),
        >(
            r#"
            SELECT event_id, event_type, source_workflow_id, source_run_id,
                   owner_user_id, payload
            FROM public.internal_event_queue
            WHERE dispatched_at IS NULL
            ORDER BY processed_at ASC
            LIMIT $1
            "#,
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Mark an internal event queue entry as dispatched.
    pub async fn mark_internal_event_dispatched(&self, event_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"UPDATE public.internal_event_queue SET dispatched_at = NOW() WHERE event_id = $1"#,
        )
        .bind(event_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Trigger observability & replay protection ─────────────────────────────

    /// Write one trigger observability record.  The caller must call
    /// `check_and_claim_replay_nonce` first; this function does not enforce
    /// uniqueness on `replay_nonce` itself (the table has a UNIQUE constraint).
    pub async fn write_trigger_observation(
        &self,
        record: &TriggerObservabilityRecord,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_trigger_observations_table(&record.owner_user_id);
        sqlx::query(&format!(
            r#"
            INSERT INTO {table} (
                observation_id, registration_id, workflow_id, deployment_id,
                owner_user_id, trigger_source, trigger_time,
                payload_summary, schedule_metadata,
                delayed_resumption_reason, hybrid_decision_chain,
                run_initiation_trace, replay_nonce, created_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7::timestamptz,
                $8::jsonb, $9::jsonb,
                $10, $11::jsonb,
                $12::jsonb, $13, $14::timestamptz
            )
            ON CONFLICT (replay_nonce) DO NOTHING
            "#
        ))
        .bind(&record.observation_id)
        .bind(&record.registration_id)
        .bind(&record.workflow_id)
        .bind(&record.deployment_id)
        .bind(&record.owner_user_id)
        .bind(&record.trigger_source)
        .bind(&record.trigger_time)
        .bind(record.payload_summary.to_string())
        .bind(record.schedule_metadata.to_string())
        .bind(record.delayed_resumption_reason.as_deref())
        .bind(record.hybrid_decision_chain.to_string())
        .bind(record.run_initiation_trace.to_string())
        .bind(&record.replay_nonce)
        .bind(&record.created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Returns `true` when `replay_nonce` is new and has been claimed (inserted).
    /// Returns `false` when the nonce already exists — the caller must reject the
    /// duplicate activation.
    ///
    /// Uses a public schema replay-nonce table so the check works even before the
    /// per-user tenant schema is fully initialised.
    pub async fn check_and_claim_replay_nonce(
        &self,
        owner_user_id: &str,
        replay_nonce: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            r#"
            INSERT INTO public.trigger_replay_nonces (replay_nonce, owner_user_id, claimed_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (replay_nonce) DO NOTHING
            "#,
        )
        .bind(replay_nonce)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn list_trigger_observations(
        &self,
        owner_user_id: &str,
        workflow_id: &str,
        registration_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let table = tenant_trigger_observations_table(owner_user_id);
        let rows: Vec<(Value,)> = if let Some(reg_id) = registration_id {
            sqlx::query_as(&format!(
                r#"
                SELECT to_jsonb(o) AS row
                FROM {table} o
                WHERE o.owner_user_id = $1
                  AND o.workflow_id = $2
                  AND o.registration_id = $3
                ORDER BY o.created_at DESC
                LIMIT $4
                "#
            ))
            .bind(owner_user_id)
            .bind(workflow_id)
            .bind(reg_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as(&format!(
                r#"
                SELECT to_jsonb(o) AS row
                FROM {table} o
                WHERE o.owner_user_id = $1
                  AND o.workflow_id = $2
                ORDER BY o.created_at DESC
                LIMIT $3
                "#
            ))
            .bind(owner_user_id)
            .bind(workflow_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows.into_iter().map(|(v,)| v).collect())
    }

    // ── LLM config & usage ────────────────────────────────────────────────────

    pub async fn upsert_llm_config(
        &self,
        cfg: &crate::agent_template::LlmConfig,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_user_llm_config_table(&cfg.owner_user_id);
        let backend_str = match cfg.backend {
            crate::agent_template::LlmBackend::Hosted => "hosted",
            crate::agent_template::LlmBackend::Byok => "byok",
            crate::agent_template::LlmBackend::Ollama => "ollama",
            crate::agent_template::LlmBackend::RunPod => "runpod",
        };
        // GAP-049: encrypt the BYOK API key before writing it to the database.
        let stored_key: Option<String> = cfg.encrypted_api_key.as_deref().map(|raw| {
            let kek = crate::crypto::byok_api_key_kek(&cfg.provider);
            crate::crypto::encrypt_secret(raw, &kek)
        });
        sqlx::query(&format!(
            r#"
            INSERT INTO {table} (
                id, owner_user_id, backend, provider, model,
                encrypted_api_key, ollama_url, monthly_budget_cents,
                usage_cents_current_month, usage_reset_at, created_at, updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,DATE_TRUNC('month',NOW()),NOW(),NOW())
            ON CONFLICT (owner_user_id) DO UPDATE SET
                backend = EXCLUDED.backend,
                provider = EXCLUDED.provider,
                model = EXCLUDED.model,
                encrypted_api_key = EXCLUDED.encrypted_api_key,
                ollama_url = EXCLUDED.ollama_url,
                monthly_budget_cents = EXCLUDED.monthly_budget_cents,
                updated_at = NOW()
            "#,
        ))
        .bind(&cfg.id)
        .bind(&cfg.owner_user_id)
        .bind(backend_str)
        .bind(&cfg.provider)
        .bind(&cfg.model)
        .bind(&stored_key)
        .bind(&cfg.ollama_url)
        .bind(cfg.monthly_budget_cents)
        .bind(cfg.usage_cents_current_month)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Reset monthly LLM usage to zero if the calendar month has rolled over.
    /// Call from billing or usage-recording paths only — not from reads.
    pub async fn reset_llm_monthly_usage_if_needed(
        &self,
        owner_user_id: &str,
    ) -> Result<(), sqlx::Error> {
        let config_table = tenant_user_llm_config_table(owner_user_id);
        sqlx::query(&format!(
            r#"
            UPDATE {config_table}
            SET usage_cents_current_month = 0,
                usage_reset_at = DATE_TRUNC('month', NOW()),
                updated_at = NOW()
            WHERE owner_user_id = $1
              AND usage_reset_at < DATE_TRUNC('month', NOW())
            "#,
        ))
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_llm_config(
        &self,
        owner_user_id: &str,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        let config_table = tenant_user_llm_config_table(owner_user_id);
        // GAP-137: pure read — CASE expression returns 0 for usage when a month rollover
        // is pending without issuing a write. Callers that record usage must call
        // reset_llm_monthly_usage_if_needed() beforehand.
        let row = sqlx::query(&format!(
            r#"
            SELECT id, backend, provider, model, ollama_url,
                   monthly_budget_cents,
                   CASE WHEN usage_reset_at < DATE_TRUNC('month', NOW()) THEN 0
                        ELSE usage_cents_current_month
                   END AS usage_cents_current_month,
                   usage_reset_at::text, updated_at::text
            FROM {config_table}
            WHERE owner_user_id = $1
            "#,
        ))
        .bind(owner_user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| llm_config_json_from_row(&r)))
    }

    /// GAP-049: retrieve and decrypt the BYOK API key for a user.
    /// Returns `None` if the user has no BYOK config or no key stored.
    pub async fn get_byok_api_key(
        &self,
        owner_user_id: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        let config_table = tenant_user_llm_config_table(owner_user_id);
        let row = sqlx::query(&format!(
            "SELECT provider, encrypted_api_key FROM {config_table} WHERE owner_user_id = $1",
        ))
        .bind(owner_user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.and_then(|r| {
            let provider = r.try_get::<String, _>("provider").ok()?;
            let enc_key = r.try_get::<String, _>("encrypted_api_key").ok()?;
            let kek = crate::crypto::byok_api_key_kek(&provider);
            // Attempt decryption; fall back to the raw value for keys stored before
            // encryption was introduced so existing users are not locked out.
            Some(crate::crypto::decrypt_secret(&enc_key, &kek).unwrap_or(enc_key))
        }))
    }

    pub async fn record_llm_usage(
        &self,
        owner_user_id: &str,
        agent_task_id: Option<&str>,
        model: &str,
        tokens_input: i32,
        tokens_output: i32,
        cost_cents: i32,
    ) -> Result<(), sqlx::Error> {
        // GAP-137: reset the monthly counter before incrementing so the budget
        // accumulator never spans across a calendar-month boundary.
        self.reset_llm_monthly_usage_if_needed(owner_user_id)
            .await?;
        let usage_table = tenant_llm_usage_log_table(owner_user_id);
        let config_table = tenant_user_llm_config_table(owner_user_id);
        sqlx::query(&format!(
            r#"
            INSERT INTO {usage_table}
                (owner_user_id, agent_task_id, model, tokens_input, tokens_output, cost_cents)
            VALUES ($1,$2,$3,$4,$5,$6)
            "#,
        ))
        .bind(owner_user_id)
        .bind(agent_task_id)
        .bind(model)
        .bind(tokens_input)
        .bind(tokens_output)
        .bind(cost_cents)
        .execute(&self.pool)
        .await?;
        // Increment running total on the config row
        sqlx::query(&format!(
            r#"
            UPDATE {config_table}
            SET usage_cents_current_month = usage_cents_current_month + $2,
                updated_at = NOW()
            WHERE owner_user_id = $1
            "#,
        ))
        .bind(owner_user_id)
        .bind(cost_cents)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_user_priority_rules(
        &self,
        owner_user_id: &str,
        rules: serde_json::Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE agent_instances
            SET priority_rules_json = $2, updated_at = NOW()
            WHERE owner_user_id = $1
            "#,
        )
        .bind(owner_user_id)
        .bind(rules)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Passkey / WebAuthn ─────────────────────────────────────────────────

    pub async fn store_passkey_challenge(
        &self,
        user_id: &str,
        challenge: &str,
        kind: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO passkey_challenges (user_id, challenge, kind, expires_at)
            VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')
            ON CONFLICT (user_id, kind) DO UPDATE
                SET challenge = EXCLUDED.challenge, expires_at = EXCLUDED.expires_at
            "#,
        )
        .bind(user_id)
        .bind(challenge)
        .bind(kind)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_passkey_challenge(
        &self,
        user_id: &str,
        kind: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT challenge FROM passkey_challenges
            WHERE user_id = $1 AND kind = $2 AND expires_at > NOW()
            "#,
        )
        .bind(user_id)
        .bind(kind)
        .fetch_optional(&self.pool)
        .await?;
        Ok(match row {
            None => None,
            Some(r) => Some(r.try_get::<String, _>("challenge")?),
        })
    }

    pub async fn clear_passkey_challenge(
        &self,
        user_id: &str,
        kind: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM passkey_challenges WHERE user_id = $1 AND kind = $2")
            .bind(user_id)
            .bind(kind)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn store_passkey_credential(
        &self,
        cred: &crate::webauthn::StoredCredential,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO passkey_credentials
                (credential_id, user_id, public_key_cbor, sign_count, aaguid, device_type, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (credential_id) DO NOTHING
            "#,
        )
        .bind(&cred.credential_id)
        .bind(&cred.user_id)
        .bind(&cred.public_key_cbor)
        .bind(cred.sign_count as i64)
        .bind(&cred.aaguid)
        .bind(&cred.device_type)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_passkey_credentials(
        &self,
        user_id: &str,
    ) -> Result<Vec<crate::webauthn::StoredCredential>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT credential_id, user_id, public_key_cbor, sign_count,
                   aaguid, device_type, created_at::text as created_at
            FROM passkey_credentials WHERE user_id = $1
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        let creds = rows
            .iter()
            .map(|r| -> Result<crate::webauthn::StoredCredential, sqlx::Error> {
                Ok(crate::webauthn::StoredCredential {
                    credential_id: r.try_get("credential_id")?,
                    user_id: r.try_get("user_id")?,
                    public_key_cbor: r.try_get("public_key_cbor")?,
                    sign_count: r.try_get::<i64, _>("sign_count").unwrap_or(0) as u32,
                    aaguid: r.try_get("aaguid")?,
                    device_type: r.try_get("device_type")?,
                    created_at: r.try_get("created_at")?,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(creds)
    }

    pub async fn get_passkey_credential(
        &self,
        credential_id: &str,
    ) -> Result<Option<crate::webauthn::StoredCredential>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT credential_id, user_id, public_key_cbor, sign_count,
                   aaguid, device_type, created_at::text as created_at
            FROM passkey_credentials WHERE credential_id = $1
            "#,
        )
        .bind(credential_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(match row {
            None => None,
            Some(r) => Some(crate::webauthn::StoredCredential {
                credential_id: r.try_get("credential_id")?,
                user_id: r.try_get("user_id")?,
                public_key_cbor: r.try_get("public_key_cbor")?,
                sign_count: r.try_get::<i64, _>("sign_count").unwrap_or(0) as u32,
                aaguid: r.try_get("aaguid")?,
                device_type: r.try_get("device_type")?,
                created_at: r.try_get("created_at")?,
            }),
        })
    }

    pub async fn update_passkey_sign_count(
        &self,
        credential_id: &str,
        sign_count: u32,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE passkey_credentials SET sign_count = $1 WHERE credential_id = $2")
            .bind(sign_count as i64)
            .bind(credential_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn create_session_for_passkey(
        &self,
        user_id: &str,
        auth_method: &str,
    ) -> Result<String, sqlx::Error> {
        let token = {
            let mut bytes = [0u8; 32];
            rand::rng().fill_bytes(&mut bytes);
            hex::encode(bytes)
        };
        sqlx::query(
            r#"
            INSERT INTO auth_sessions (user_id, token, auth_method, expires_at)
            VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')
            "#,
        )
        .bind(user_id)
        .bind(sha256_token(&token))
        .bind(auth_method)
        .execute(&self.pool)
        .await?;
        Ok(token)
    }

    // ── Anon session management ───────────────────────────────────────────────

    /// Increment the session count for the given fingerprint.
    /// Returns the new count, or an error if the count has already reached 3.
    pub async fn check_and_increment_anon_session(
        &self,
        fingerprint: &str,
    ) -> Result<i32, sqlx::Error> {
        let row: (i32,) = sqlx::query_as(
            r#"
            INSERT INTO anon_dashboard_sessions (fingerprint, session_count, first_seen, last_seen)
            VALUES ($1, 1, NOW(), NOW())
            ON CONFLICT (fingerprint) DO UPDATE
                SET session_count = anon_dashboard_sessions.session_count + 1,
                    last_seen = NOW()
            RETURNING session_count
            "#,
        )
        .bind(fingerprint)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }

    // ── Ephemeral agent cleanup ───────────────────────────────────────────────

    /// Delete all ephemeral agent instances that have passed their `expires_at`.
    /// Cascading FK constraints also clean up delegations, focus items, triggers.
    pub async fn cleanup_expired_ephemeral_agents(&self) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM agent_instances WHERE ephemeral = TRUE AND expires_at < NOW()",
        )
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }

    // ── Focus items ───────────────────────────────────────────────────────────

    pub async fn create_focus_item(
        &self,
        item: &crate::agent_template::FocusItem,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_agent_focus_items_table(&item.owner_user_id);
        sqlx::query(&format!(
            r#"
            INSERT INTO {table}
                (id, agent_instance_id, owner_user_id, title, description,
                 status, priority, due_at, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
            "#,
        ))
        .bind(&item.id)
        .bind(&item.agent_instance_id)
        .bind(&item.owner_user_id)
        .bind(&item.title)
        .bind(&item.description)
        .bind(&item.status)
        .bind(&item.priority)
        .bind(&item.due_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_focus_items(
        &self,
        owner_user_id: &str,
        agent_instance_id: &str,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let table = tenant_agent_focus_items_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT id, agent_instance_id, title, description, status, priority,
                   due_at::text, created_at::text, updated_at::text
            FROM {table}
            WHERE owner_user_id = $1 AND agent_instance_id = $2
            ORDER BY created_at DESC
            "#,
        ))
        .bind(owner_user_id)
        .bind(agent_instance_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(focus_item_json_from_row).collect())
    }

    pub async fn update_focus_item_status(
        &self,
        owner_user_id: &str,
        id: &str,
        status: &str,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_agent_focus_items_table(owner_user_id);
        let result = sqlx::query(&format!(
            "UPDATE {table} SET status = $1, updated_at = NOW() WHERE owner_user_id = $3 AND id = $2"
        ))
            .bind(status)
            .bind(id)
            .bind(owner_user_id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        Ok(())
    }

    // ── Triggers ──────────────────────────────────────────────────────────────

    pub async fn create_trigger(
        &self,
        trigger: &crate::agent_template::AgentTrigger,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_agent_triggers_table(&trigger.owner_user_id);
        sqlx::query(&format!(
            r#"
            INSERT INTO {table}
                (id, agent_instance_id, owner_user_id, trigger_type,
                 config_json, enabled, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,NOW())
            "#,
        ))
        .bind(&trigger.id)
        .bind(&trigger.agent_instance_id)
        .bind(&trigger.owner_user_id)
        .bind(trigger.trigger_type.as_str())
        .bind(&trigger.config_json)
        .bind(trigger.enabled)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_triggers(
        &self,
        owner_user_id: &str,
        agent_instance_id: &str,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let table = tenant_agent_triggers_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT id, trigger_type, config_json, enabled,
                   last_fired_at::text, next_fire_at::text, created_at::text
            FROM {table}
            WHERE owner_user_id = $1 AND agent_instance_id = $2
            ORDER BY created_at DESC
            "#,
        ))
        .bind(owner_user_id)
        .bind(agent_instance_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(trigger_json_from_row).collect())
    }

    /// Returns all agent_triggers for a user regardless of agent_instance_id.
    /// Used by the workflow deploy path to surface overlaps between the legacy
    /// activation table and new `workflow_trigger_registrations` rows.
    pub async fn list_all_triggers_for_user(
        &self,
        owner_user_id: &str,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let table = tenant_agent_triggers_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT id, trigger_type, config_json, enabled,
                   last_fired_at::text, next_fire_at::text, created_at::text
            FROM {table}
            WHERE owner_user_id = $1
            ORDER BY created_at DESC
            "#,
        ))
        .bind(owner_user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(trigger_json_from_row).collect())
    }

    pub async fn delete_trigger(&self, owner_user_id: &str, id: &str) -> Result<(), sqlx::Error> {
        let table = tenant_agent_triggers_table(owner_user_id);
        let result = sqlx::query(&format!(
            "DELETE FROM {table} WHERE owner_user_id = $2 AND id = $1"
        ))
        .bind(id)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        Ok(())
    }

    // ── Delegations ───────────────────────────────────────────────────────────

    pub async fn create_delegation(
        &self,
        d: &crate::agent_template::AgentDelegation,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_agent_delegations_table(&d.owner_user_id);
        let caps_json = serde_json::to_value(&d.allowed_capabilities)
            .unwrap_or(serde_json::Value::Array(vec![]));
        let allowlist_json =
            serde_json::to_value(&d.outbound_allowlist).unwrap_or(serde_json::Value::Array(vec![]));
        let snapshot_json = d
            .context_snapshot
            .as_ref()
            .and_then(|s| serde_json::to_value(s).ok());
        sqlx::query(&format!(
            r#"
            INSERT INTO {table}
                (id, master_instance_id, owner_user_id, scope, mask,
                 delegated_key_hex, expires_at, task_id,
                 allowed_capabilities, outbound_allowlist, context_snapshot,
                 created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
            "#,
        ))
        .bind(&d.id)
        .bind(&d.master_instance_id)
        .bind(&d.owner_user_id)
        .bind(&d.scope)
        .bind(&d.mask)
        .bind(&d.delegated_key_hex)
        .bind(d.expires_at.to_rfc3339())
        .bind(&d.task_id)
        .bind(caps_json)
        .bind(allowlist_json)
        .bind(snapshot_json)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn revoke_delegation(
        &self,
        owner_user_id: &str,
        id: &str,
    ) -> Result<(), sqlx::Error> {
        let table = tenant_agent_delegations_table(owner_user_id);
        let result = sqlx::query(&format!(
            "UPDATE {table} SET revoked_at = NOW() WHERE owner_user_id = $2 AND id = $1"
        ))
        .bind(id)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        Ok(())
    }

    /// Fetch a single delegation by id within the owner's private schema.
    pub async fn get_delegation_by_id(
        &self,
        owner_user_id: &str,
        id: &str,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        let table = tenant_agent_delegations_table(owner_user_id);
        let row = sqlx::query(&format!(
            r#"
            SELECT id, scope, mask, task_id, owner_user_id,
                   revoked_at::text, expires_at::text, created_at::text
            FROM {table}
            WHERE owner_user_id = $1 AND id = $2
            "#,
        ))
        .bind(owner_user_id)
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| delegation_json_from_row(&r)))
    }

    pub async fn get_active_delegations(
        &self,
        owner_user_id: &str,
        master_instance_id: &str,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let table = tenant_agent_delegations_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT id, scope, mask, task_id, expires_at::text, created_at::text
            FROM {table}
            WHERE owner_user_id = $1
              AND master_instance_id = $2
              AND revoked_at IS NULL
              AND expires_at > NOW()
            ORDER BY created_at DESC
            "#,
        ))
        .bind(owner_user_id)
        .bind(master_instance_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|r| {
                json!({
                    "id": r.get::<String, _>("id"),
                    "scope": r.get::<String, _>("scope"),
                    "mask": r.get::<String, _>("mask"),
                    "task_id": r.try_get::<Option<String>, _>("task_id").ok().flatten(),
                    "expires_at": r.get::<String, _>("expires_at"),
                    "created_at": r.get::<String, _>("created_at"),
                })
            })
            .collect())
    }

    // ── Capability registry ───────────────────────────────────────────────────

    /// Insert or update a capability descriptor for an agent instance.
    /// Returns the capability id.
    pub async fn create_capability(
        &self,
        owner_user_id: &str,
        agent_instance_id: &str,
        name: &str,
        descriptor: &serde_json::Value,
    ) -> Result<String, sqlx::Error> {
        let id = ulid::Ulid::new().to_string();
        let description = descriptor
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let input_schema = descriptor
            .get("input_schema")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        let output_schema = descriptor.get("output_schema").cloned();
        let version = descriptor
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("1.0.0");
        let approval_mode = descriptor
            .get("approval_mode")
            .and_then(|v| v.as_str())
            .unwrap_or("autonomous");
        let tags: Vec<String> = descriptor
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| t.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();

        let table = tenant_agent_capability_registry_table(owner_user_id);
        sqlx::query(&format!(
            r#"
            INSERT INTO {table}
                (id, owner_user_id, agent_instance_id, name, description,
                 input_schema_json, output_schema_json, version, tags, approval_mode)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (agent_instance_id, name) DO UPDATE SET
                description       = EXCLUDED.description,
                input_schema_json = EXCLUDED.input_schema_json,
                output_schema_json= EXCLUDED.output_schema_json,
                version           = EXCLUDED.version,
                tags              = EXCLUDED.tags,
                approval_mode     = EXCLUDED.approval_mode,
                updated_at        = NOW()
            "#,
        ))
        .bind(&id)
        .bind(owner_user_id)
        .bind(agent_instance_id)
        .bind(name)
        .bind(description)
        .bind(&input_schema)
        .bind(output_schema.as_ref())
        .bind(version)
        .bind(&tags)
        .bind(approval_mode)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    pub async fn list_capabilities(
        &self,
        owner_user_id: &str,
        agent_instance_id: &str,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let table = tenant_agent_capability_registry_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT id, name, description, input_schema_json, output_schema_json,
                   version, tags, approval_mode, created_at::text, updated_at::text
            FROM {table}
            WHERE owner_user_id = $1 AND agent_instance_id = $2
            ORDER BY created_at ASC
            "#,
        ))
        .bind(owner_user_id)
        .bind(agent_instance_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(capability_json_from_row).collect())
    }

    pub async fn delete_capability(
        &self,
        owner_user_id: &str,
        cap_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let table = tenant_agent_capability_registry_table(owner_user_id);
        let result = sqlx::query(&format!(
            "DELETE FROM {table} WHERE id = $1 AND owner_user_id = $2"
        ))
        .bind(cap_id)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Returns capability descriptors for inclusion in the signed AgentCard.
    /// Does not require owner_user_id — called by the public /.well-known/agent-card handler.
    pub async fn get_capabilities_for_agent_card(
        &self,
        agent_instance_id: &str,
    ) -> Result<Vec<crate::agentcard::CapabilityDescriptor>, sqlx::Error> {
        let owner_user_id = sqlx::query_scalar::<_, String>(
            "SELECT owner_user_id FROM agent_instances WHERE id = $1",
        )
        .bind(agent_instance_id)
        .fetch_optional(&self.pool)
        .await?;
        let Some(owner_user_id) = owner_user_id else {
            return Ok(vec![]);
        };
        let table = tenant_agent_capability_registry_table(&owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT name, description, input_schema_json, output_schema_json,
                   version, tags, approval_mode
            FROM {table}
            WHERE agent_instance_id = $1
            ORDER BY created_at ASC
            "#,
        ))
        .bind(agent_instance_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|r| crate::agentcard::CapabilityDescriptor {
                name: r.get("name"),
                description: r.get("description"),
                input_schema: r.get("input_schema_json"),
                output_schema: r
                    .try_get::<Option<serde_json::Value>, _>("output_schema_json")
                    .ok()
                    .flatten(),
                version: r.get("version"),
                tags: r.get("tags"),
                approval_mode: r.get("approval_mode"),
            })
            .collect())
    }

    // ── Follow / engage ───────────────────────────────────────────────────────

    pub async fn follow_agent(
        &self,
        follower_user_id: &str,
        followed_agent_id: &str,
    ) -> Result<(), sqlx::Error> {
        let id = ulid::Ulid::new().to_string();
        sqlx::query(
            r#"
            INSERT INTO agent_follows (id, follower_user_id, followed_agent_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (follower_user_id, followed_agent_id) DO NOTHING
            "#,
        )
        .bind(&id)
        .bind(follower_user_id)
        .bind(followed_agent_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn unfollow_agent(
        &self,
        follower_user_id: &str,
        followed_agent_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM agent_follows WHERE follower_user_id = $1 AND followed_agent_id = $2",
        )
        .bind(follower_user_id)
        .bind(followed_agent_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn list_following(
        &self,
        follower_user_id: &str,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT followed_agent_id, created_at::text AS created_at
            FROM agent_follows
            WHERE follower_user_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(follower_user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|r| {
                serde_json::json!({
                    "followed_agent_id": r.get::<String, _>("followed_agent_id"),
                    "created_at": r.get::<String, _>("created_at"),
                })
            })
            .collect())
    }

    pub async fn record_engagement(
        &self,
        user_id: &str,
        message_id: &str,
        engagement_type: &str,
    ) -> Result<(), sqlx::Error> {
        let id = ulid::Ulid::new().to_string();
        sqlx::query(
            r#"
            INSERT INTO feed_engagements (id, message_id, user_id, type)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (message_id, user_id, type) DO NOTHING
            "#,
        )
        .bind(&id)
        .bind(message_id)
        .bind(user_id)
        .bind(engagement_type)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_engagement_counts(
        &self,
        message_id: &str,
    ) -> Result<serde_json::Value, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT
                COUNT(*) FILTER (WHERE type = 'view')  AS views,
                COUNT(*) FILTER (WHERE type = 'share') AS shares,
                COUNT(*) FILTER (WHERE type = 'reply') AS replies
            FROM feed_engagements
            WHERE message_id = $1
            "#,
        )
        .bind(message_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(serde_json::json!({
            "views":   row.get::<i64, _>("views"),
            "shares":  row.get::<i64, _>("shares"),
            "replies": row.get::<i64, _>("replies"),
        }))
    }

    pub async fn search_agents(
        &self,
        owner_user_id: &str,
        query: &str,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        // GAP-125: scope search to the user's tenant-private capability registry.
        let acr_table = tenant_agent_capability_registry_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT DISTINCT
                ai.id,
                ai.agent_id,
                ai.name,
                ai.status,
                ai.system_prompt
            FROM agent_instances ai
            LEFT JOIN {acr_table} acr ON acr.agent_instance_id = ai.id
            WHERE ai.owner_user_id = $1
              AND ai.status = 'active'
              AND (
                to_tsvector('english', COALESCE(ai.system_prompt, ''))
                  @@ plainto_tsquery('english', $2)
                OR to_tsvector('english',
                     COALESCE(acr.name, '') || ' ' || COALESCE(acr.description, ''))
                  @@ plainto_tsquery('english', $2)
              )
            ORDER BY ai.created_at DESC
            LIMIT $3
            "#,
        ))
        .bind(owner_user_id)
        .bind(query)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let results: Vec<serde_json::Value> = rows
            .iter()
            .map(|r| {
                serde_json::json!({
                    "id": r.get::<String, _>("id"),
                    "agent_id": r.get::<String, _>("agent_id"),
                    "name": r.get::<String, _>("name"),
                    "status": r.get::<String, _>("status"),
                })
            })
            .collect();
        Ok(results)
    }

    // ── Soul / memory ─────────────────────────────────────────────────────────

    pub async fn update_agent_soul(
        &self,
        _owner_user_id: &str,
        agent_instance_id: &str,
        soul_md: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE agent_instances SET soul_md = $1, updated_at = NOW() WHERE id = $2")
            .bind(soul_md)
            .bind(agent_instance_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_agent_memory(
        &self,
        _owner_user_id: &str,
        agent_instance_id: &str,
        memory_md: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE agent_instances SET memory_md = $1, updated_at = NOW() WHERE id = $2")
            .bind(memory_md)
            .bind(agent_instance_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── LoRA confidence / takeover ────────────────────────────────────────────

    pub async fn update_lora_confidence(
        &self,
        _owner_user_id: &str,
        agent_instance_id: &str,
        score: f64,
    ) -> Result<bool, sqlx::Error> {
        let active = score >= crate::agent_template::LORA_TAKEOVER_THRESHOLD;
        sqlx::query(
            r#"
            UPDATE agent_instances
            SET lora_confidence_score = $1,
                lora_genome_active = $2,
                updated_at = NOW()
            WHERE id = $3
            "#,
        )
        .bind(score)
        .bind(active)
        .bind(agent_instance_id)
        .execute(&self.pool)
        .await?;
        Ok(active)
    }

    /// Update LoRA confidence by AFP `agent_id` string (e.g. `"agent:foo@domain"`).
    ///
    /// Used by the auto-compute path in the personalization event handler where
    /// only the AFP agent ID is available. Isolation is enforced by the WHERE clause.
    pub async fn update_lora_confidence_by_afp_id(
        &self,
        afp_agent_id: &str,
        score: f64,
    ) -> Result<bool, sqlx::Error> {
        let active = score >= crate::agent_template::LORA_TAKEOVER_THRESHOLD;
        sqlx::query(
            r#"
            UPDATE agent_instances
            SET lora_confidence_score = $1,
                lora_genome_active = $2,
                updated_at = NOW()
            WHERE agent_id = $3
            "#,
        )
        .bind(score)
        .bind(active)
        .bind(afp_agent_id)
        .execute(&self.pool)
        .await?;
        Ok(active)
    }

    // ── Public feed (Plaza equivalent) ───────────────────────────────────────

    pub async fn list_public_messages(
        &self,
        limit: i64,
        before_id: Option<&str>,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        // GAP-133: cursor uses id < $1 so ORDER BY must also use id DESC to stay
        // consistent. ULIDs are lexicographically monotonic (time-prefixed) so
        // id ordering is equivalent to chronological ordering in practice.
        let rows = if let Some(bid) = before_id {
            sqlx::query(
                r#"
                SELECT id, thread_id, from_agent, to_agents,
                       type, content, "references", views,
                       timestamp, signature, encryption
                FROM messages
                WHERE (type = 'public_article'
                   OR (type = 'research' AND subtype = 'public_article'))
                  AND id < $1
                ORDER BY id DESC LIMIT $2
                "#,
            )
            .bind(bid)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query(
                r#"
                SELECT id, thread_id, from_agent, to_agents,
                       type, content, "references", views,
                       timestamp, signature, encryption
                FROM messages
                WHERE type = 'public_article'
                   OR (type = 'research' AND subtype = 'public_article')
                ORDER BY id DESC LIMIT $1
                "#,
            )
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        };
        let results = rows.iter().map(|r| -> Result<serde_json::Value, sqlx::Error> {
            let id: String = r.try_get("id")?;
            let thread_id: String = r.try_get("thread_id")?;
            let from_agent: String = r.try_get("from_agent")?;
            let msg_type: String = r.try_get("type")?;
            let timestamp: String = r.try_get("timestamp")?;
            let signature: String = r.try_get("signature")?;
            Ok(serde_json::json!({
                "id": id,
                "thread_id": thread_id,
                "from_agent": from_agent,
                "to_agents": r.try_get::<serde_json::Value, _>("to_agents").unwrap_or(serde_json::json!([])),
                "type": msg_type,
                "content": r.try_get::<serde_json::Value, _>("content").unwrap_or(serde_json::json!({})),
                "references": r.try_get::<serde_json::Value, _>("references").unwrap_or(serde_json::json!([])),
                "views": r.try_get::<serde_json::Value, _>("views").unwrap_or(serde_json::json!([])),
                "timestamp": timestamp,
                "signature": signature,
                "encryption": r.try_get::<serde_json::Value, _>("encryption").ok(),
            }))
        }).collect::<Result<Vec<_>, _>>()?;
        Ok(results)
    }

    // ── Agent instance with new fields ────────────────────────────────────────

    pub async fn save_master_agent_instance(
        &self,
        instance: &crate::agent_template::AgentInstance,
    ) -> Result<String, sqlx::Error> {
        let id: String = sqlx::query_scalar(
            r#"
            INSERT INTO agent_instances (
                id, owner_user_id, agent_id, name, status,
                system_prompt, priority_rules_json,
                soul_md, memory_md, is_master, max_sub_agents,
                ephemeral, expires_at,
                lora_confidence_score, lora_genome_active,
                created_at, updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$14,$15,NOW(),NOW())
            ON CONFLICT (agent_id) DO UPDATE
                SET updated_at = EXCLUDED.updated_at,
                    soul_md = EXCLUDED.soul_md,
                    is_master = EXCLUDED.is_master
            RETURNING id
            "#,
        )
        .bind(&instance.id)
        .bind(&instance.owner_user_id)
        .bind(&instance.agent_id)
        .bind(&instance.name)
        .bind(&instance.status)
        .bind(&instance.system_prompt)
        .bind(&instance.priority_rules)
        .bind(&instance.soul_md)
        .bind(&instance.memory_md)
        .bind(instance.is_master)
        .bind(instance.max_sub_agents)
        .bind(instance.ephemeral)
        .bind(instance.expires_at.map(|d| d.to_rfc3339()))
        .bind(instance.lora_confidence_score)
        .bind(instance.lora_genome_active)
        .fetch_one(&self.pool)
        .await?;
        Ok(id)
    }

    pub async fn get_master_agent_instance(
        &self,
        owner_user_id: &str,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT id, agent_id, name, status, system_prompt,
                   priority_rules_json, soul_md, memory_md,
                   is_master, max_sub_agents, ephemeral,
                   expires_at::text,
                   lora_confidence_score, lora_genome_active,
                   auto_approve_workflows,
                   created_at::text, updated_at::text
            FROM agent_instances
            WHERE owner_user_id = $1 AND is_master = TRUE
            LIMIT 1
            "#,
        )
        .bind(owner_user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| {
            json!({
                "id": r.get::<String, _>("id"),
                "agent_id": r.get::<String, _>("agent_id"),
                "name": r.get::<String, _>("name"),
                "status": r.get::<String, _>("status"),
                "soul_md": r.get::<String, _>("soul_md"),
                "memory_md": r.get::<String, _>("memory_md"),
                "is_master": r.get::<bool, _>("is_master"),
                "max_sub_agents": r.get::<i32, _>("max_sub_agents"),
                "ephemeral": r.get::<bool, _>("ephemeral"),
                "expires_at": r.try_get::<Option<String>, _>("expires_at").ok().flatten(),
                "lora_confidence_score": r.get::<f64, _>("lora_confidence_score"),
                "lora_genome_active": r.get::<bool, _>("lora_genome_active"),
                "auto_approve_workflows": r.try_get::<bool, _>("auto_approve_workflows").unwrap_or(true),
                "created_at": r.get::<String, _>("created_at"),
                "updated_at": r.get::<String, _>("updated_at"),
            })
        }))
    }

    /// PATCH /agent/settings — persist per-user agent settings on the master instance.
    pub async fn update_agent_settings(
        &self,
        owner_user_id: &str,
        auto_approve_workflows: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE agent_instances SET auto_approve_workflows = $1, updated_at = NOW() \
             WHERE owner_user_id = $2 AND is_master = TRUE",
        )
        .bind(auto_approve_workflows)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Gmail & calendar ──────────────────────────────────────────────────────

    pub async fn store_gmail_token(
        &self,
        user_id: &str,
        access_token: &str,
        refresh_token: &str,
        gmail_email: &str,
        expiry_iso: Option<String>,
    ) -> Result<(), sqlx::Error> {
        // GAP-062: encrypt OAuth tokens at rest using server encryption key.
        let key = gmail_token_encryption_key();
        let enc_access = crate::crypto::encrypt_secret(access_token, &key);
        let enc_refresh = crate::crypto::encrypt_secret(refresh_token, &key);
        sqlx::query(
            "INSERT INTO user_gmail_tokens (user_id, access_token, refresh_token, gmail_email, token_expiry, updated_at)
             VALUES ($1, $2, $3, $4, $5::timestamptz, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
               access_token = EXCLUDED.access_token,
               refresh_token = EXCLUDED.refresh_token,
               gmail_email = EXCLUDED.gmail_email,
               token_expiry = EXCLUDED.token_expiry,
               updated_at = NOW()",
        )
        .bind(user_id)
        .bind(&enc_access)
        .bind(&enc_refresh)
        .bind(gmail_email)
        .bind(expiry_iso)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_gmail_token(
        &self,
        user_id: &str,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        let row = sqlx::query(
            "SELECT access_token, refresh_token, gmail_email, token_expiry::text as token_expiry, connected_at::text as connected_at
             FROM user_gmail_tokens WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| {
            let key = gmail_token_encryption_key();
            let raw_access = r.get::<String, _>("access_token");
            let raw_refresh = r.get::<String, _>("refresh_token");
            // Attempt decryption; fall back to raw value for tokens stored before encryption was added.
            let access_token =
                crate::crypto::decrypt_secret(&raw_access, &key).unwrap_or(raw_access);
            let refresh_token =
                crate::crypto::decrypt_secret(&raw_refresh, &key).unwrap_or(raw_refresh);
            serde_json::json!({
                "access_token": access_token,
                "refresh_token": refresh_token,
                "gmail_email": r.get::<String, _>("gmail_email"),
                "token_expiry": r.try_get::<Option<String>, _>("token_expiry").ok().flatten(),
                "connected_at": r.get::<String, _>("connected_at"),
            })
        }))
    }

    // ── Calendar events ───────────────────────────────────────────────────────

    pub async fn create_calendar_event(
        &self,
        owner_user_id: &str,
        id: &str,
        title: &str,
        description: Option<&str>,
        start_at: &str,
        end_at: Option<&str>,
        all_day: bool,
        location: Option<&str>,
    ) -> Result<serde_json::Value, sqlx::Error> {
        let row = sqlx::query(
            r#"
            INSERT INTO calendar_events
                (id, owner_user_id, title, description, start_at, end_at, all_day, location)
            VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8)
            RETURNING id, title, description, start_at::text AS start_at,
                      end_at::text AS end_at, all_day, location, status, created_at::text AS created_at
            "#,
        )
        .bind(id)
        .bind(owner_user_id)
        .bind(title)
        .bind(description)
        .bind(start_at)
        .bind(end_at)
        .bind(all_day)
        .bind(location)
        .fetch_one(&self.pool)
        .await?;
        Ok(serde_json::json!({
            "id": row.try_get::<String,_>("id")?,
            "title": row.try_get::<String,_>("title")?,
            "description": row.try_get::<Option<String>,_>("description").ok().flatten(),
            "start_at": row.try_get::<String,_>("start_at")?,
            "end_at": row.try_get::<Option<String>,_>("end_at").ok().flatten(),
            "all_day": row.try_get::<bool,_>("all_day").unwrap_or(false),
            "location": row.try_get::<Option<String>,_>("location").ok().flatten(),
            "status": row.try_get::<String,_>("status").unwrap_or_else(|_| "confirmed".to_string()),
            "created_at": row.try_get::<String,_>("created_at")?,
        }))
    }

    pub async fn list_calendar_events_in_range(
        &self,
        owner_user_id: &str,
        range_start: &str,
        range_end: &str,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT id, title, description, start_at::text AS start_at,
                   end_at::text AS end_at, all_day, location, status, created_at::text AS created_at
            FROM calendar_events
            WHERE owner_user_id = $1
              AND start_at >= $2::timestamptz
              AND start_at <  $3::timestamptz
              AND status != 'cancelled'
            ORDER BY start_at ASC
            "#,
        )
        .bind(owner_user_id)
        .bind(range_start)
        .bind(range_end)
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(|r| -> Result<serde_json::Value, sqlx::Error> {
            Ok(serde_json::json!({
                "id": r.try_get::<String,_>("id")?,
                "title": r.try_get::<String,_>("title")?,
                "description": r.try_get::<Option<String>,_>("description").ok().flatten(),
                "start_at": r.try_get::<String,_>("start_at")?,
                "end_at": r.try_get::<Option<String>,_>("end_at").ok().flatten(),
                "all_day": r.try_get::<bool,_>("all_day").unwrap_or(false),
                "location": r.try_get::<Option<String>,_>("location").ok().flatten(),
                "status": r.try_get::<String,_>("status").unwrap_or_else(|_| "confirmed".to_string()),
            }))
        }).collect()
    }

    pub async fn delete_calendar_event(
        &self,
        owner_user_id: &str,
        event_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            r#"UPDATE calendar_events SET status = 'cancelled', updated_at = NOW()
               WHERE id = $1 AND owner_user_id = $2"#,
        )
        .bind(event_id)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // ── Agent Alias Registry ─────────────────────────────────────────────────

    /// Returns the alias row for a user, or None if they have not claimed one.
    pub async fn get_alias_for_user(
        &self,
        user_id: &str,
    ) -> Result<Option<AliasRecord>, sqlx::Error> {
        let row = sqlx::query(
            "SELECT alias, agent_id, user_id, \
             created_at::text, updated_at::text, last_changed_at::text \
             FROM public.aliases WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(match row {
            None => None,
            Some(r) => Some(AliasRecord {
                alias: r.try_get("alias")?,
                agent_id: r.try_get("agent_id")?,
                user_id: r.try_get("user_id")?,
                created_at: r.try_get("created_at")?,
                updated_at: r.try_get("updated_at")?,
                last_changed_at: r.try_get("last_changed_at")?,
            }),
        })
    }

    /// Returns true if the alias is not yet taken (does not check validity).
    pub async fn is_alias_available(&self, alias: &str) -> Result<bool, sqlx::Error> {
        let row = sqlx::query("SELECT COUNT(*) AS n FROM public.aliases WHERE alias = $1")
            .bind(alias)
            .fetch_one(&self.pool)
            .await?;
        let n: i64 = row.try_get("n").unwrap_or(1);
        Ok(n == 0)
    }

    /// Claim a brand-new alias for a user who does not yet have one.
    /// Errors with a descriptive sqlx error on constraint violation.
    pub async fn claim_alias(
        &self,
        user_id: &str,
        agent_id: &str,
        alias: &str,
    ) -> Result<AliasRecord, sqlx::Error> {
        let row = sqlx::query(
            r#"
            INSERT INTO public.aliases (alias, agent_id, user_id, created_at, updated_at, last_changed_at)
            VALUES ($1, $2, $3, NOW(), NOW(), NOW())
            RETURNING alias, agent_id, user_id,
                      created_at::text, updated_at::text, last_changed_at::text
            "#,
        )
        .bind(alias)
        .bind(agent_id)
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(AliasRecord {
            alias: row.try_get("alias")?,
            agent_id: row.try_get("agent_id")?,
            user_id: row.try_get("user_id")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
            last_changed_at: row.try_get("last_changed_at")?,
        })
    }

    /// Change an existing alias. Enforces 30-day cooldown in the database.
    /// Returns Err with message "cooldown" if the cooldown has not elapsed.
    pub async fn change_alias(
        &self,
        user_id: &str,
        new_alias: &str,
    ) -> Result<AliasRecord, sqlx::Error> {
        // Atomic check-and-update: only proceeds if last_changed_at is older than 30 days
        let row = sqlx::query(
            r#"
            UPDATE public.aliases
            SET alias           = $2,
                updated_at      = NOW(),
                last_changed_at = NOW()
            WHERE user_id         = $1
              AND last_changed_at <= NOW() - INTERVAL '30 days'
            RETURNING alias, agent_id, user_id,
                      created_at::text, updated_at::text, last_changed_at::text
            "#,
        )
        .bind(user_id)
        .bind(new_alias)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(r) => Ok(AliasRecord {
                alias: r.try_get("alias")?,
                agent_id: r.try_get("agent_id")?,
                user_id: r.try_get("user_id")?,
                created_at: r.try_get("created_at")?,
                updated_at: r.try_get("updated_at")?,
                last_changed_at: r.try_get("last_changed_at")?,
            }),
            // Row exists but cooldown has not elapsed → 0 rows updated
            None => Err(sqlx::Error::RowNotFound),
        }
    }

    // ── Agent preferences ─────────────────────────────────────────────────────

    pub async fn get_agent_preferences(
        &self,
        user_id: &str,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT optimization_mode, auto_confirm_threshold_cents, show_cost_estimates,
                   default_store_in_history,
                   calendar_notification_filters,
                   email_notification_filters
            FROM user_agent_preferences
            WHERE owner_user_id = $1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        use sqlx::Row;
        Ok(row.map(|r| {
            serde_json::json!({
                "optimization_mode":             r.get::<String, _>("optimization_mode"),
                "auto_confirm_threshold_cents":  r.get::<f64, _>("auto_confirm_threshold_cents"),
                "show_cost_estimates":           r.get::<bool, _>("show_cost_estimates"),
                "default_store_in_history":      r.get::<bool, _>("default_store_in_history"),
                "calendar_notification_filters": r.try_get::<serde_json::Value, _>("calendar_notification_filters").unwrap_or_else(|_| serde_json::json!({})),
                "email_notification_filters":    r.try_get::<serde_json::Value, _>("email_notification_filters").unwrap_or_else(|_| serde_json::json!({})),
            })
        }))
    }

    pub async fn upsert_agent_preferences(
        &self,
        user_id: &str,
        optimization_mode: &str,
        auto_confirm_threshold_cents: f64,
        show_cost_estimates: bool,
        default_store_in_history: bool,
        calendar_notification_filters: &serde_json::Value,
        email_notification_filters: &serde_json::Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO user_agent_preferences
                (owner_user_id, optimization_mode, auto_confirm_threshold_cents, show_cost_estimates, default_store_in_history, calendar_notification_filters, email_notification_filters, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
            ON CONFLICT (owner_user_id) DO UPDATE SET
                optimization_mode             = EXCLUDED.optimization_mode,
                auto_confirm_threshold_cents  = EXCLUDED.auto_confirm_threshold_cents,
                show_cost_estimates           = EXCLUDED.show_cost_estimates,
                default_store_in_history      = EXCLUDED.default_store_in_history,
                calendar_notification_filters = EXCLUDED.calendar_notification_filters,
                email_notification_filters    = EXCLUDED.email_notification_filters,
                updated_at                    = NOW()
            "#,
        )
        .bind(user_id)
        .bind(optimization_mode)
        .bind(auto_confirm_threshold_cents)
        .bind(show_cost_estimates)
        .bind(default_store_in_history)
        .bind(calendar_notification_filters)
        .bind(email_notification_filters)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Capability enable/disable (0041_capability_enabled_flag) ─────────────

    pub async fn set_capability_enabled(
        &self,
        owner_user_id: &str,
        cap_id: &str,
        enabled: bool,
    ) -> Result<bool, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            UPDATE agent_capability_registry
            SET enabled = $1
            WHERE id = $2 AND owner_user_id = $3
            "#,
        )
        .bind(enabled)
        .bind(cap_id)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?
        .rows_affected();
        Ok(rows > 0)
    }

    // ── Cost spend history (0035_cost_tracking) ───────────────────────────────

    pub async fn spend_history_for_user(
        &self,
        user_id: &str,
        days: i32,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT date_trunc('day', created_at) AS day,
                   SUM(cost_usd)   AS total_usd,
                   SUM(tokens_used) AS total_tokens,
                   COUNT(*)        AS event_count
            FROM cost_records
            WHERE user_id = $1
              AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
            GROUP BY 1
            ORDER BY 1 DESC
            "#,
        )
        .bind(user_id)
        .bind(days)
        .fetch_all(&self.pool)
        .await?;

        use sqlx::Row;
        Ok(rows
            .into_iter()
            .map(|row| {
                serde_json::json!({
                    "day": row.try_get::<String, _>("day").unwrap_or_default(),
                    "total_usd": row.try_get::<f64, _>("total_usd").unwrap_or(0.0),
                    "total_tokens": row.try_get::<i64, _>("total_tokens").unwrap_or(0),
                    "event_count": row.try_get::<i64, _>("event_count").unwrap_or(0),
                })
            })
            .collect())
    }

    // ── User token budget (0035_cost_tracking budget_configs) ─────────────────

    pub async fn get_user_token_budget(
        &self,
        user_id: &str,
    ) -> Result<(i64, f64, bool), sqlx::Error> {
        use sqlx::Row;
        let row = sqlx::query(
            r#"
            SELECT COALESCE(u.max_llm_tokens, g.max_llm_tokens, 50000)  AS daily_limit,
                   COALESCE(u.soft_limit_ratio, g.soft_limit_ratio, 0.8) AS alert_pct,
                   FALSE AS escalation_enabled
            FROM (SELECT * FROM budget_configs WHERE user_id = $1 LIMIT 1) u
            RIGHT JOIN (SELECT * FROM budget_configs WHERE user_id IS NULL LIMIT 1) g ON TRUE
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            Ok((
                row.try_get::<i64, _>("daily_limit").unwrap_or(50000),
                row.try_get::<f64, _>("alert_pct").unwrap_or(0.8),
                row.try_get::<bool, _>("escalation_enabled").unwrap_or(false),
            ))
        } else {
            Ok((50000, 0.8, false))
        }
    }

    // ── Trigger enable/disable ────────────────────────────────────────────────

    pub async fn set_trigger_enabled(
        &self,
        owner_user_id: &str,
        trigger_id: &str,
        enabled: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE agent_triggers
            SET enabled = $1, updated_at = NOW()
            WHERE id = $2 AND owner_user_id = $3
            "#,
        )
        .bind(enabled)
        .bind(trigger_id)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Behavioral memory ─────────────────────────────────────────────────────

    pub async fn list_behavioral_memory(
        &self,
        owner_user_id: &str,
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT content FROM behavioral_memory
               WHERE owner_user_id = $1
               ORDER BY updated_at DESC LIMIT $2"#,
        )
        .bind(owner_user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        use sqlx::Row;
        Ok(rows
            .into_iter()
            .map(|r| r.try_get::<Value, _>("content").unwrap_or(Value::Null))
            .collect())
    }

    pub async fn insert_daemon_afp_message(&self, afp: &Value) -> Result<(), sqlx::Error> {
        let id = afp["id"].as_str().unwrap_or("").to_string();
        let owner_user_id = afp["to"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let afp_type = afp["type"].as_str().unwrap_or("").to_string();
        let thread_id = afp["thread_id"].as_str().unwrap_or("").to_string();
        sqlx::query(
            r#"INSERT INTO afp_messages (id, owner_user_id, type, thread_id, payload, created_at)
               VALUES ($1, $2, $3, $4, $5, NOW())
               ON CONFLICT (id) DO NOTHING"#,
        )
        .bind(&id)
        .bind(&owner_user_id)
        .bind(&afp_type)
        .bind(&thread_id)
        .bind(afp)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Training reflection traces ────────────────────────────────────────────

    pub async fn store_training_reflection_trace(
        &self,
        owner_user_id: &str,
        thread_id: &str,
        problem_id: &str,
        content: &Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO training_reflection_traces
               (id, owner_user_id, thread_id, problem_id, content, created_at)
               VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW())"#,
        )
        .bind(owner_user_id)
        .bind(thread_id)
        .bind(problem_id)
        .bind(content)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── LLM provider config ───────────────────────────────────────────────────

    pub async fn get_user_llm_providers(
        &self,
        owner_user_id: &str,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT config FROM user_llm_providers
               WHERE owner_user_id = $1
               ORDER BY priority ASC"#,
        )
        .bind(owner_user_id)
        .fetch_all(&self.pool)
        .await?;
        use sqlx::Row;
        Ok(rows
            .into_iter()
            .map(|r| r.try_get::<Value, _>("config").unwrap_or(Value::Null))
            .collect())
    }

    // ── Proactive token budget ────────────────────────────────────────────────

    pub async fn daily_token_usage(
        &self,
        heuristic_id: &str,
        owner_user_id: &str,
    ) -> Result<i64, sqlx::Error> {
        let count: i64 = sqlx::query_scalar(
            r#"SELECT COALESCE(SUM(tokens_used), 0)
               FROM proactive_token_usage
               WHERE heuristic_id = $1 AND owner_user_id = $2
                 AND created_at > NOW() - INTERVAL '24 hours'"#,
        )
        .bind(heuristic_id)
        .bind(owner_user_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(count)
    }

    pub async fn log_proactive_token_usage(
        &self,
        heuristic_id: &str,
        owner_user_id: &str,
        tokens_used: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO proactive_token_usage
               (id, heuristic_id, owner_user_id, tokens_used, created_at)
               VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())"#,
        )
        .bind(heuristic_id)
        .bind(owner_user_id)
        .bind(tokens_used)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Agent session management (stub) ──────────────────────────────────────

    pub async fn get_agent_session_by_thread(
        &self,
        _user_id: &str,
        _thread_id: &str,
    ) -> Result<Option<AgentSessionRecord>, sqlx::Error> {
        Ok(None)
    }

    pub async fn list_session_requests(
        &self,
        _user_id: &str,
        _session_id: &str,
    ) -> Result<Vec<SessionRequestRecord>, sqlx::Error> {
        Ok(vec![])
    }

    pub async fn update_session_request_status(
        &self,
        _user_id: &str,
        _request_id: &str,
        _status: &str,
        _result: Option<&Value>,
        _error: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        Ok(())
    }

    pub async fn update_agent_session_state(
        &self,
        _user_id: &str,
        _session_id: &str,
        _state: &str,
        _queue_depth: i64,
        _active_request_id: Option<&str>,
        _error: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        Ok(())
    }

    pub async fn get_agent_session(
        &self,
        _user_id: &str,
        _session_id: &str,
    ) -> Result<Option<AgentSessionRecord>, sqlx::Error> {
        Ok(None)
    }

    pub async fn log_proactive_action(
        &self,
        _user_id: &str,
        _heuristic_id: &str,
        _suggestion_id: &str,
        _action_type: &str,
        _audit_content: Option<serde_json::Value>,
        _afp_message_id: Option<&str>,
        _tier: &str,
        _tokens_used: i64,
    ) -> Result<(), sqlx::Error> {
        Ok(())
    }

    pub async fn record_proactive_outcome(
        &self,
        _record: &crate::proactive_engine::ProactiveOutcomeRecord,
    ) -> Result<(), sqlx::Error> {
        Ok(())
    }

    pub async fn list_proactive_audit_log(
        &self,
        _user_id: &str,
        _limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        Ok(vec![])
    }

    pub async fn enable_pack(
        &self,
        _user_id: &str,
        _pack_id: &str,
    ) -> Result<(), sqlx::Error> {
        Ok(())
    }

    pub async fn disable_pack(
        &self,
        _user_id: &str,
        _pack_id: &str,
    ) -> Result<(), sqlx::Error> {
        Ok(())
    }

    pub async fn list_tool_execution_registry(
        &self,
        _user_id: &str,
    ) -> Result<Vec<Value>, sqlx::Error> {
        Ok(vec![])
    }

    // ── Generic AFP message list by type ─────────────────────────────────────

    pub async fn list_afp_messages_by_type(
        &self,
        owner_user_id: &str,
        types: &[&str],
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let type_list: Vec<String> = types.iter().map(|s| s.to_string()).collect();
        let rows = sqlx::query(
            r#"SELECT payload FROM afp_messages
               WHERE owner_user_id = $1 AND type = ANY($2)
               ORDER BY created_at DESC LIMIT $3"#,
        )
        .bind(owner_user_id)
        .bind(&type_list)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        use sqlx::Row;
        Ok(rows
            .into_iter()
            .map(|r| r.try_get::<Value, _>("payload").unwrap_or(Value::Null))
            .collect())
    }

    // ── Proactive suggestions ─────────────────────────────────────────────────

    pub async fn list_proactive_suggestions(
        &self,
        owner_user_id: &str,
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT content FROM proactive_suggestions
               WHERE owner_user_id = $1 AND dismissed_at IS NULL
               ORDER BY created_at DESC LIMIT $2"#,
        )
        .bind(owner_user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        use sqlx::Row;
        Ok(rows
            .into_iter()
            .map(|r| r.try_get::<Value, _>("content").unwrap_or(Value::Null))
            .collect())
    }

    pub async fn has_active_proactive_suggestion(
        &self,
        owner_user_id: &str,
        heuristic_id: &str,
    ) -> Result<bool, sqlx::Error> {
        use sqlx::Row;
        let row = sqlx::query(
            r#"SELECT 1 AS present FROM proactive_suggestions
               WHERE owner_user_id = $1 AND heuristic_id = $2 AND dismissed_at IS NULL
               LIMIT 1"#,
        )
        .bind(owner_user_id)
        .bind(heuristic_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row
            .and_then(|value| value.try_get::<i32, _>("present").ok())
            .is_some())
    }

    pub async fn get_enabled_packs(&self, owner_user_id: &str) -> Result<Vec<String>, sqlx::Error> {
        use sqlx::Row;
        let rows = sqlx::query(
            r#"SELECT pack_id FROM enabled_heuristic_packs WHERE owner_user_id = $1"#,
        )
        .bind(owner_user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .filter_map(|r| r.try_get::<String, _>("pack_id").ok())
            .collect())
    }

    pub async fn heuristic_acceptance_rates(
        &self,
        owner_user_id: &str,
    ) -> Result<Vec<Value>, sqlx::Error> {
        use sqlx::Row;
        let rows = sqlx::query(
            r#"SELECT heuristic_id,
                  COUNT(*) FILTER (WHERE outcome = 'accepted') AS accepted,
                  COUNT(*) FILTER (WHERE outcome = 'dismissed') AS dismissed
               FROM proactive_outcomes
               WHERE owner_user_id = $1
               GROUP BY heuristic_id"#,
        )
        .bind(owner_user_id)
        .fetch_all(&self.pool)
        .await?;
        let mut result = Vec::new();
        for row in rows {
            let hid = row.try_get::<String, _>("heuristic_id").unwrap_or_default();
            let acc = row.try_get::<i64, _>("accepted").unwrap_or(0);
            let dis = row.try_get::<i64, _>("dismissed").unwrap_or(0);
            let total = acc + dis;
            let acceptance_rate = if total > 0 { acc as f64 / total as f64 } else { 0.5 };
            result.push(serde_json::json!({
                "heuristic_id": hid,
                "accepted": acc,
                "dismissed": dis,
                "total": total,
                "acceptance_rate": acceptance_rate,
            }));
        }
        Ok(result)
    }

    pub async fn query_temporal_summary(&self, limit: i64) -> Result<Vec<Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT content FROM temporal_summaries ORDER BY created_at DESC LIMIT $1"#,
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        use sqlx::Row;
        Ok(rows
            .into_iter()
            .map(|r| r.try_get::<Value, _>("content").unwrap_or(Value::Null))
            .collect())
    }

    pub async fn get_autonomy_override(
        &self,
        owner_user_id: &str,
        heuristic_id: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        use sqlx::Row;
        let row = sqlx::query(
            r#"SELECT autonomy_tier FROM autonomy_overrides
               WHERE owner_user_id = $1 AND heuristic_id = $2"#,
        )
        .bind(owner_user_id)
        .bind(heuristic_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.and_then(|r| r.try_get::<String, _>("autonomy_tier").ok()))
    }

    pub async fn set_autonomy_override(
        &self,
        owner_user_id: &str,
        heuristic_id: &str,
        autonomy_tier: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO autonomy_overrides (owner_user_id, heuristic_id, autonomy_tier, updated_at)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (owner_user_id, heuristic_id) DO UPDATE SET autonomy_tier = $3, updated_at = NOW()"#,
        )
        .bind(owner_user_id)
        .bind(heuristic_id)
        .bind(autonomy_tier)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_proactivity_level(&self, owner_user_id: &str) -> Result<i32, sqlx::Error> {
        use sqlx::Row;
        let row = sqlx::query(
            r#"SELECT level FROM proactivity_levels WHERE owner_user_id = $1"#,
        )
        .bind(owner_user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row
            .and_then(|r| r.try_get::<i32, _>("level").ok())
            .unwrap_or(2))
    }

    pub async fn set_proactivity_level(
        &self,
        owner_user_id: &str,
        level: i32,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO proactivity_levels (owner_user_id, level, updated_at)
               VALUES ($1, $2, NOW())
               ON CONFLICT (owner_user_id) DO UPDATE SET level = $2, updated_at = NOW()"#,
        )
        .bind(owner_user_id)
        .bind(level)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Email contact groups ──────────────────────────────────────────────────

    pub async fn list_email_contact_groups(
        &self,
        owner_user_id: &str,
    ) -> Result<Vec<Value>, sqlx::Error> {
        use sqlx::Row;
        let rows = sqlx::query(
            r#"SELECT id, name, color, sla_hours, auto_draft, created_at
               FROM email_contact_groups WHERE owner_user_id = $1
               ORDER BY created_at DESC"#,
        )
        .bind(owner_user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| {
                serde_json::json!({
                    "id": r.try_get::<String, _>("id").unwrap_or_default(),
                    "name": r.try_get::<String, _>("name").unwrap_or_default(),
                    "color": r.try_get::<String, _>("color").unwrap_or_default(),
                    "sla_hours": r.try_get::<i32, _>("sla_hours").unwrap_or(24),
                    "auto_draft": r.try_get::<bool, _>("auto_draft").unwrap_or(false),
                    "created_at": r.try_get::<String, _>("created_at").unwrap_or_default(),
                })
            })
            .collect())
    }

    pub async fn upsert_email_contact_group(
        &self,
        owner_user_id: &str,
        id: &str,
        name: &str,
        color: &str,
        sla_hours: i32,
        auto_draft: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO email_contact_groups
               (id, owner_user_id, name, color, sla_hours, auto_draft, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (id) DO UPDATE SET name=$3, color=$4, sla_hours=$5, auto_draft=$6"#,
        )
        .bind(id)
        .bind(owner_user_id)
        .bind(name)
        .bind(color)
        .bind(sla_hours)
        .bind(auto_draft)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_email_contact_group(
        &self,
        owner_user_id: &str,
        group_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            r#"DELETE FROM email_contact_groups WHERE id = $1 AND owner_user_id = $2"#,
        )
        .bind(group_id)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn get_contact_group_memberships(
        &self,
        owner_user_id: &str,
        email: &str,
    ) -> Result<Vec<String>, sqlx::Error> {
        use sqlx::Row;
        let rows = sqlx::query(
            r#"SELECT group_id FROM contact_group_memberships
               WHERE owner_user_id = $1 AND email = $2"#,
        )
        .bind(owner_user_id)
        .bind(email)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .filter_map(|r| r.try_get::<String, _>("group_id").ok())
            .collect())
    }

    pub async fn set_contact_group_memberships(
        &self,
        owner_user_id: &str,
        email: &str,
        group_ids: &[String],
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"DELETE FROM contact_group_memberships WHERE owner_user_id = $1 AND email = $2"#,
        )
        .bind(owner_user_id)
        .bind(email)
        .execute(&self.pool)
        .await?;
        for gid in group_ids {
            sqlx::query(
                r#"INSERT INTO contact_group_memberships (owner_user_id, email, group_id)
                   VALUES ($1, $2, $3) ON CONFLICT DO NOTHING"#,
            )
            .bind(owner_user_id)
            .bind(email)
            .bind(gid)
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    // ── Plaza feed ────────────────────────────────────────────────────────────

    pub async fn publish_to_plaza(
        &self,
        owner_user_id: &str,
        message_id: &str,
        from_agent: &str,
        title: &str,
        body: &str,
    ) -> Result<String, sqlx::Error> {
        let id = ulid::Ulid::new().to_string();
        sqlx::query(
            r#"INSERT INTO plaza_feed (id, owner_user_id, message_id, from_agent, title, body, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())"#,
        )
        .bind(&id)
        .bind(owner_user_id)
        .bind(message_id)
        .bind(from_agent)
        .bind(title)
        .bind(body)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    // ── Knowledge triple queries ──────────────────────────────────────────────

    pub async fn query_private_knowledge_triples(
        &self,
        owner_user_id: &str,
        subject: Option<&str>,
        predicate: Option<&str>,
        object: Option<&str>,
        source_message_id: Option<&str>,
        domain: Option<&str>,
        limit: i64,
    ) -> Result<Vec<Value>, sqlx::Error> {
        use sqlx::Row;
        let rows = sqlx::query(
            r#"SELECT subject, predicate, object, source_message_id, domain, confidence, created_at
               FROM knowledge_triples
               WHERE owner_user_id = $1
                 AND ($2::text IS NULL OR subject ILIKE $2)
                 AND ($3::text IS NULL OR predicate = $3)
                 AND ($4::text IS NULL OR object ILIKE $4)
                 AND ($5::text IS NULL OR source_message_id = $5)
                 AND ($6::text IS NULL OR domain = $6)
               ORDER BY created_at DESC LIMIT $7"#,
        )
        .bind(owner_user_id)
        .bind(subject)
        .bind(predicate)
        .bind(object)
        .bind(source_message_id)
        .bind(domain)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| {
                serde_json::json!({
                    "subject": r.try_get::<String,_>("subject").unwrap_or_default(),
                    "predicate": r.try_get::<String,_>("predicate").unwrap_or_default(),
                    "object": r.try_get::<String,_>("object").unwrap_or_default(),
                    "source_message_id": r.try_get::<Option<String>,_>("source_message_id").unwrap_or(None),
                    "domain": r.try_get::<Option<String>,_>("domain").unwrap_or(None),
                    "confidence": r.try_get::<f64,_>("confidence").unwrap_or(1.0),
                    "created_at": r.try_get::<String,_>("created_at").unwrap_or_default(),
                })
            })
            .collect())
    }

    pub async fn query_private_context_window(
        &self,
        owner_user_id: &str,
        anchor_message_id: Option<&str>,
        anchor_timestamp: Option<&str>,
        window_minutes: i64,
        limit: i64,
        message_type: Option<&str>,
    ) -> Result<Vec<Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT payload FROM afp_messages
               WHERE owner_user_id = $1
                 AND ($2::text IS NULL OR id = $2)
                 AND ($3::text IS NULL OR created_at BETWEEN $3::timestamptz - ($4 * INTERVAL '1 minute') AND $3::timestamptz + ($4 * INTERVAL '1 minute'))
                 AND ($5::text IS NULL OR type = $5)
               ORDER BY created_at DESC LIMIT $6"#,
        )
        .bind(owner_user_id)
        .bind(anchor_message_id)
        .bind(anchor_timestamp)
        .bind(window_minutes)
        .bind(message_type)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        use sqlx::Row;
        Ok(rows
            .into_iter()
            .map(|r| r.try_get::<Value, _>("payload").unwrap_or(Value::Null))
            .collect())
    }

    pub async fn query_private_claim_neighborhood(
        &self,
        owner_user_id: &str,
        message_id: &str,
        limit_per_group: i64,
        stance: Option<&str>,
        depth: i64,
    ) -> Result<Value, sqlx::Error> {
        let row = sqlx::query(
            r#"SELECT payload FROM afp_messages WHERE owner_user_id = $1 AND id = $2 LIMIT 1"#,
        )
        .bind(owner_user_id)
        .bind(message_id)
        .fetch_optional(&self.pool)
        .await?;
        use sqlx::Row;
        let anchor = row
            .as_ref()
            .and_then(|r| r.try_get::<Value, _>("payload").ok())
            .unwrap_or(Value::Null);

        let depth_u32 = (depth as u32).min(3);
        let (node_set, edges) = self.bfs_backlinks_graph(owner_user_id, message_id, depth_u32).await?;

        let cap = (limit_per_group.max(1).min(50)) as usize;
        let mut supports: Vec<Value> = Vec::new();
        let mut refutes: Vec<Value> = Vec::new();
        let mut mentions: Vec<Value> = Vec::new();
        let mut part_of: Vec<Value> = Vec::new();
        let mut caused_by: Vec<Value> = Vec::new();
        let mut temporally_related: Vec<Value> = Vec::new();

        for edge in &edges {
            let normalized = normalized_claim_ref_type(&edge.ref_type);
            if let Some(s) = stance {
                if s != "all" && normalized != s {
                    continue;
                }
            }
            let peer_id = if edge.source_id == message_id { &edge.target_id } else { &edge.source_id };
            let entry = serde_json::json!({
                "message_id": peer_id,
                "direction": if edge.source_id == message_id { "outbound" } else { "inbound" },
                "ref_type": normalized,
                "link_kind": format!("{:?}", edge.link_kind).to_lowercase(),
                "similarity": edge.similarity,
                "created_at": edge.created_at,
            });
            match normalized {
                "supports"            if supports.len() < cap            => supports.push(entry),
                "refutes"             if refutes.len() < cap             => refutes.push(entry),
                "part_of"             if part_of.len() < cap             => part_of.push(entry),
                "caused_by"           if caused_by.len() < cap           => caused_by.push(entry),
                "temporally_related"  if temporally_related.len() < cap  => temporally_related.push(entry),
                _                     if mentions.len() < cap            => mentions.push(entry),
                _ => {}
            }
        }

        // Compute hop distances for related_claims summary
        let mut node_hops: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
        for node_id in &node_set {
            if node_id != message_id {
                // Approximate hop: count min path length via BFS edge set
                let hop = edges.iter().filter(|e| e.source_id == *node_id || e.target_id == *node_id).count().min(depth as usize);
                node_hops.insert(node_id.clone(), if hop == 0 { 1 } else { hop.min(depth as usize) });
            }
        }
        let related_claims = summarize_related_claims(message_id, &node_hops, &edges, cap);

        let triple_rows = sqlx::query(
            r#"SELECT subject, predicate_norm AS predicate, object_value AS object, confidence, source_message_id
               FROM afp_knowledge_triples
               WHERE user_id = $1 AND source_message_id = $2
               ORDER BY confidence DESC LIMIT $3"#,
        )
        .bind(owner_user_id)
        .bind(message_id)
        .bind(cap as i64)
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();

        let triples: Vec<Value> = triple_rows
            .iter()
            .map(|r| serde_json::json!({
                "subject":    r.try_get::<String, _>("subject").unwrap_or_default(),
                "predicate":  r.try_get::<String, _>("predicate").unwrap_or_default(),
                "object":     r.try_get::<String, _>("object").unwrap_or_default(),
                "confidence": r.try_get::<f64, _>("confidence").unwrap_or(0.0),
                "source_message_id": r.try_get::<Option<String>, _>("source_message_id").ok().flatten(),
            }))
            .collect();

        let summary = summarize_claim_neighborhood(&supports, &refutes, &mentions, &triples);

        Ok(serde_json::json!({
            "anchor":              anchor,
            "supports":            supports,
            "refutes":             refutes,
            "mentions":            mentions,
            "part_of":             part_of,
            "caused_by":           caused_by,
            "temporally_related":  temporally_related,
            "related_claims":      related_claims,
            "triples":             triples,
            "summary":             summary,
        }))
    }

    // ── Token budget ──────────────────────────────────────────────────────────

    pub async fn daily_total_token_usage(&self, owner_user_id: &str) -> Result<i64, sqlx::Error> {
        use sqlx::Row;
        let row = sqlx::query(
            r#"SELECT COALESCE(SUM(tokens_used), 0) AS total
               FROM proactive_token_usage
               WHERE owner_user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'"#,
        )
        .bind(owner_user_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.try_get::<i64, _>("total").unwrap_or(0))
    }

    pub async fn upsert_user_token_budget(
        &self,
        owner_user_id: &str,
        daily_limit_tokens: i64,
        alert_threshold: f64,
        escalation_threshold: f64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO user_token_budgets
               (owner_user_id, daily_limit_tokens, alert_threshold, escalation_threshold, updated_at)
               VALUES ($1, $2, $3, $4, NOW())
               ON CONFLICT (owner_user_id) DO UPDATE
               SET daily_limit_tokens=$2, alert_threshold=$3, escalation_threshold=$4, updated_at=NOW()"#,
        )
        .bind(owner_user_id)
        .bind(daily_limit_tokens)
        .bind(alert_threshold)
        .bind(escalation_threshold)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn upsert_user_llm_provider(
        &self,
        owner_user_id: &str,
        provider_id: &str,
        provider: &str,
        display_name: &str,
        encrypted_key: Option<&str>,
        base_url: Option<&str>,
        model_id: &str,
        priority: i32,
        consent: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO user_llm_providers
               (id, owner_user_id, provider, display_name, encrypted_key, base_url, model_id, priority, consent_given, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
               ON CONFLICT (id) DO UPDATE
               SET provider=$3, display_name=$4, encrypted_key=$5, base_url=$6, model_id=$7, priority=$8, consent_given=$9, updated_at=NOW()"#,
        )
        .bind(provider_id)
        .bind(owner_user_id)
        .bind(provider)
        .bind(display_name)
        .bind(encrypted_key)
        .bind(base_url)
        .bind(model_id)
        .bind(priority)
        .bind(consent)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn disable_user_llm_provider(
        &self,
        owner_user_id: &str,
        provider_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            r#"DELETE FROM user_llm_providers WHERE id = $1 AND owner_user_id = $2"#,
        )
        .bind(provider_id)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // ── PARA classification methods ───────────────────────────────────────────
    //
    // Original AFP messages are NEVER mutated. All PARA queries go through
    // afp_para_classifications, which is an overlay indexed by (user_id, target_id).

    /// Upsert a para_classification record. Creates on first call, updates on re-classify.
    pub async fn upsert_para_classification(
        &self,
        user_id: &str,
        classification_id: &str,
        target_id: &str,
        para_tags: Vec<String>,
        status: &str,
        reason: Option<&str>,
        context: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let archived_at: Option<chrono::DateTime<chrono::Utc>> =
            if status == "archived" { Some(chrono::Utc::now()) } else { None };
        sqlx::query(
            r#"INSERT INTO afp_para_classifications
                   (id, user_id, target_id, para_tags, status, archived_at, reason, context)
               VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (user_id, target_id) DO UPDATE SET
                   para_tags   = EXCLUDED.para_tags,
                   status      = EXCLUDED.status,
                   archived_at = CASE WHEN EXCLUDED.status = 'archived'
                                      THEN COALESCE(afp_para_classifications.archived_at, now())
                                      ELSE NULL END,
                   reason      = EXCLUDED.reason,
                   context     = EXCLUDED.context,
                   updated_at  = now()"#,
        )
        .bind(classification_id)
        .bind(user_id)
        .bind(target_id)
        .bind(para_tags)
        .bind(status)
        .bind(archived_at)
        .bind(reason)
        .bind(context)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Fetch active classifications whose para_tags contain at least one tag with the given prefix.
    /// prefix: "project:" | "area:" | "resource:"
    pub async fn get_para_by_tag_prefix(
        &self,
        user_id: &str,
        prefix: &str,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let pattern = format!("{prefix}%");
        let rows = sqlx::query(
            r#"SELECT id, target_id, para_tags, status, reason, context, created_at, updated_at
               FROM afp_para_classifications
               WHERE user_id = $1::uuid
                 AND status = 'active'
                 AND EXISTS (SELECT 1 FROM unnest(para_tags) t WHERE t LIKE $2)
               ORDER BY updated_at DESC LIMIT $3"#,
        )
        .bind(user_id)
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| {
                serde_json::json!({
                    "id":        r.try_get::<String, _>("id").unwrap_or_default(),
                    "target_id": r.try_get::<String, _>("target_id").unwrap_or_default(),
                    "para_tags": r.try_get::<Vec<String>, _>("para_tags").unwrap_or_default(),
                    "status":    r.try_get::<String, _>("status").unwrap_or_default(),
                    "reason":    r.try_get::<Option<String>, _>("reason").unwrap_or(None),
                    "context":   r.try_get::<Option<String>, _>("context").unwrap_or(None),
                    "created_at": r.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")
                        .map(|t| t.to_rfc3339()).unwrap_or_default(),
                    "updated_at": r.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at")
                        .map(|t| t.to_rfc3339()).unwrap_or_default(),
                })
            })
            .collect())
    }

    /// Fetch archived classifications for this user.
    pub async fn get_para_archived(
        &self,
        user_id: &str,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT id, target_id, para_tags, reason, context, archived_at, updated_at
               FROM afp_para_classifications
               WHERE user_id = $1::uuid AND status = 'archived'
               ORDER BY archived_at DESC NULLS LAST LIMIT $2"#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| {
                serde_json::json!({
                    "id":          r.try_get::<String, _>("id").unwrap_or_default(),
                    "target_id":   r.try_get::<String, _>("target_id").unwrap_or_default(),
                    "para_tags":   r.try_get::<Vec<String>, _>("para_tags").unwrap_or_default(),
                    "reason":      r.try_get::<Option<String>, _>("reason").unwrap_or(None),
                    "context":     r.try_get::<Option<String>, _>("context").unwrap_or(None),
                    "archived_at": r.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("archived_at")
                        .unwrap_or(None)
                        .map(|t| t.to_rfc3339()),
                    "updated_at":  r.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at")
                        .map(|t| t.to_rfc3339()).unwrap_or_default(),
                })
            })
            .collect())
    }

    /// Count how many active items fall into each PARA section for `user_id`.
    /// Returns `(projects, areas, resources, archive)` as a 4-tuple.
    /// A single item may belong to multiple sections if it carries multiple prefixed tags.
    pub async fn count_para_sections(
        &self,
        user_id: &str,
    ) -> Result<(i64, i64, i64, i64), sqlx::Error> {
        let row = sqlx::query(
            r#"SELECT
                 COUNT(*) FILTER (
                   WHERE status = 'active'
                     AND EXISTS (SELECT 1 FROM unnest(para_tags) t WHERE t LIKE 'project:%')
                 ) AS projects,
                 COUNT(*) FILTER (
                   WHERE status = 'active'
                     AND EXISTS (SELECT 1 FROM unnest(para_tags) t WHERE t LIKE 'area:%')
                 ) AS areas,
                 COUNT(*) FILTER (
                   WHERE status = 'active'
                     AND EXISTS (SELECT 1 FROM unnest(para_tags) t WHERE t LIKE 'resource:%')
                 ) AS resources,
                 COUNT(*) FILTER (WHERE status = 'archived') AS archive
               FROM afp_para_classifications
               WHERE user_id = $1::uuid"#,
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok((
            row.try_get::<i64, _>("projects").unwrap_or(0),
            row.try_get::<i64, _>("areas").unwrap_or(0),
            row.try_get::<i64, _>("resources").unwrap_or(0),
            row.try_get::<i64, _>("archive").unwrap_or(0),
        ))
    }

    /// Candidates for auto-archiving: active classifications older than 180 days.
    pub async fn get_para_auto_archive_candidates(
        &self,
        user_id: &str,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT id, target_id, para_tags, created_at
               FROM afp_para_classifications
               WHERE user_id = $1::uuid
                 AND status = 'active'
                 AND created_at < now() - interval '180 days'
               ORDER BY created_at ASC LIMIT $2"#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| {
                serde_json::json!({
                    "id":        r.try_get::<String, _>("id").unwrap_or_default(),
                    "target_id": r.try_get::<String, _>("target_id").unwrap_or_default(),
                    "para_tags": r.try_get::<Vec<String>, _>("para_tags").unwrap_or_default(),
                    "created_at": r.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")
                        .map(|t| t.to_rfc3339()).unwrap_or_default(),
                })
            })
            .collect())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct DatabasePoolSettings {
    max_connections: u32,
    min_connections: u32,
    acquire_timeout_secs: u64,
    idle_timeout_secs: u64,
    max_lifetime_secs: u64,
    statement_timeout_ms: u64,
    idle_in_transaction_timeout_ms: u64,
}

fn database_pool_settings_from_env() -> DatabasePoolSettings {
    DatabasePoolSettings {
        max_connections: parse_env_u32("OMNYID_DB_MAX_CONNECTIONS", 32),
        min_connections: parse_env_u32("OMNYID_DB_MIN_CONNECTIONS", 4),
        acquire_timeout_secs: parse_env_u64("OMNYID_DB_ACQUIRE_TIMEOUT_SECS", 10),
        idle_timeout_secs: parse_env_u64("OMNYID_DB_IDLE_TIMEOUT_SECS", 300),
        max_lifetime_secs: parse_env_u64("OMNYID_DB_MAX_LIFETIME_SECS", 1800),
        statement_timeout_ms: parse_env_u64("OMNYID_DB_STATEMENT_TIMEOUT_MS", 30_000),
        idle_in_transaction_timeout_ms: parse_env_u64(
            "OMNYID_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS",
            15_000,
        ),
    }
}

fn parse_env_u32(name: &str, default: u32) -> u32 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<u32>().ok())
        .unwrap_or(default)
}

fn parse_env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(default)
}

#[cfg(test)]
mod db_pool_settings_tests {
    use super::{
        DatabasePoolSettings, database_pool_settings_from_env, migration_catalog::MIGRATIONS,
    };

    #[test]
    fn database_pool_settings_use_hardened_defaults() {
        let keys = [
            "OMNYID_DB_MAX_CONNECTIONS",
            "OMNYID_DB_MIN_CONNECTIONS",
            "OMNYID_DB_ACQUIRE_TIMEOUT_SECS",
            "OMNYID_DB_IDLE_TIMEOUT_SECS",
            "OMNYID_DB_MAX_LIFETIME_SECS",
            "OMNYID_DB_STATEMENT_TIMEOUT_MS",
            "OMNYID_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS",
        ];
        let previous = keys
            .iter()
            .map(|key| ((*key).to_string(), std::env::var(key).ok()))
            .collect::<Vec<_>>();

        unsafe {
            for key in keys {
                std::env::remove_var(key);
            }
        }

        let settings = database_pool_settings_from_env();
        assert_eq!(
            settings,
            DatabasePoolSettings {
                max_connections: 32,
                min_connections: 4,
                acquire_timeout_secs: 10,
                idle_timeout_secs: 300,
                max_lifetime_secs: 1800,
                statement_timeout_ms: 30_000,
                idle_in_transaction_timeout_ms: 15_000,
            }
        );

        unsafe {
            for (key, value) in previous {
                if let Some(value) = value {
                    std::env::set_var(key, value);
                } else {
                    std::env::remove_var(key);
                }
            }
        }
    }

    #[test]
    fn migration_catalog_matches_current_embedded_set() {
        assert_eq!(MIGRATIONS.len(), 64);
        assert_eq!(MIGRATIONS.first().map(|entry| entry.0), Some("0001_init"));
        assert_eq!(
            MIGRATIONS.last().map(|entry| entry.0),
            Some("0064_afp_kind_and_seaweedfs")
        );
    }
}

fn daemon_kind_label(kind: &DaemonKind) -> &'static str {
    match kind {
        DaemonKind::KnowledgeCurator => "knowledge_curator",
        DaemonKind::LedgerIngestion => "ledger_ingestion",
        DaemonKind::EmailGateway => "email_gateway",
        DaemonKind::RelationalSync => "relational_sync",
        DaemonKind::ArchiveColdStorage => "archive_cold_storage",
        DaemonKind::HealthMaintenance => "health_maintenance",
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AliasRecord {
    pub alias: String,
    pub agent_id: String,
    pub user_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_changed_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserRecord {
    pub id: String,
    pub email: String,
    pub password_hash: Option<String>,
    pub auth_provider: String,
    pub google_sub: Option<String>,
    pub display_name: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthSessionRecord {
    pub token: String,
    pub user_id: String,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthTokenRecord {
    pub id: String,
    pub user_id: String,
    pub kind: String,
    pub token_hash: String,
    pub expires_at: String,
    pub used_at: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ManagedAgentRecord {
    pub id: String,
    pub owner_user_id: String,
    pub agent_id: String,
    pub label: String,
    pub email: String,
    pub kind: String,
    pub created_at: String,
    pub metadata: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActionAuditEntry {
    pub capability_id: String,
    pub thread_id: String,
    pub status: String,
    pub output: Value,
    pub external_reference: Option<String>,
    pub recorded_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SavedWorkflowRecord {
    pub workflow_id: String,
    pub owner_user_id: String,
    pub title: String,
    pub description: Option<String>,
    pub favorite: bool,
    pub preset_kinds: Vec<String>,
    pub graph_json: Value,
    pub latest_ir_json: Option<Value>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkflowDeploymentRecord {
    pub deployment_id: String,
    pub workflow_id: String,
    pub owner_user_id: String,
    pub environment: String,
    pub status: String,
    pub ir_snapshot_json: Value,
    pub graph_snapshot_json: Value,
    pub source_deployment_id: Option<String>,
    pub deployed_at: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkflowRunRecord {
    pub run_id: String,
    pub workflow_id: String,
    pub deployment_id: String,
    pub owner_user_id: String,
    pub status: String,
    pub trigger_kind: String,
    pub replay_of_run_id: Option<String>,
    pub timeline_json: Value,
    pub result_json: Value,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkflowWaitResumeRecord {
    pub wait_resume_id: String,
    pub workflow_id: String,
    pub deployment_id: String,
    pub run_id: String,
    pub owner_user_id: String,
    pub manifest_node_id: String,
    pub source_graph_node_id: String,
    pub status: String,
    pub resume_family: String,
    pub resume_kind: String,
    pub wait_reason: Option<String>,
    pub scheduled_for: Option<String>,
    pub descriptor_json: Value,
    pub created_at: String,
    pub resumed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkflowTriggerRegistrationRecord {
    pub registration_id: String,
    pub workflow_id: String,
    pub deployment_id: String,
    pub owner_user_id: String,
    pub environment: String,
    pub trigger_node_id: String,
    pub manifest_node_id: String,
    pub trigger_family: String,
    pub trigger_kind: String,
    /// One of: preview | registered | paused | unhealthy | retired
    pub registration_status: String,
    /// SHA-256 of (deployment_id + trigger_node_id) — prevents double-registration
    pub idempotency_key: String,
    /// Hash of the trigger descriptor JSON — used to detect config drift between deployments
    pub dedup_hash: Option<String>,
    pub descriptor_json: Value,
    pub last_fired_at: Option<String>,
    pub next_fire_at: Option<String>,
    pub retry_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// One row per trigger activation attempt, written before the run is initiated.
/// Provides the audit trail required by Phase 3 item 11 of the builder plan.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TriggerObservabilityRecord {
    pub observation_id: String,
    /// Foreign-key reference to `workflow_trigger_registrations.registration_id`.
    pub registration_id: String,
    pub workflow_id: String,
    pub deployment_id: String,
    pub owner_user_id: String,
    /// `manual` | `cron` | `webhook` | `event` | `wake_up` | `hybrid`
    pub trigger_source: String,
    /// RFC-3339 timestamp at which the trigger fired.
    pub trigger_time: String,
    /// Sanitised/truncated JSON summary of the inbound payload (no secrets).
    pub payload_summary: Value,
    /// `schedule_kind`, `cron_expression`, `timezone`, `scheduled_for` for time triggers.
    pub schedule_metadata: Value,
    /// Non-null for `wake_up` family: reason the delayed continuation fired.
    pub delayed_resumption_reason: Option<String>,
    /// Ordered list of conditions evaluated for hybrid trigger composition.
    pub hybrid_decision_chain: Value,
    /// `run_id`, `workflow_id`, `deployment_id`, `trigger_node_id` linking this
    /// observation to the resulting workflow run.
    pub run_initiation_trace: Value,
    /// Stable unique nonce derived from (activation_id + trigger_node_id + deployment_id).
    /// Checked before insertion; duplicate nonce → activation rejected.
    pub replay_nonce: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeDeploymentRecord {
    pub id: String,
    pub owner_user_id: String,
    pub framework: String,
    pub gui: Option<String>,
    pub status: String,
    pub python_version: String,
    pub image_ref: String,
    pub runtime_token: String,
    pub workspace_path: String,
    pub config_json: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserOnboardingRecord {
    pub owner_user_id: String,
    pub identity_confirmed: bool,
    pub email_provider: Option<String>,
    pub email_address: Option<String>,
    pub email_connected: bool,
    pub llm_mode: String,
    pub notes: Value,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SupportAccessGrantRecord {
    pub id: String,
    pub owner_user_id: String,
    pub status: String,
    pub access_scope: String,
    pub reason: Option<String>,
    pub notes: Value,
    pub granted_at: String,
    pub expires_at: String,
    pub revoked_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeBackupPolicyRecord {
    pub owner_user_id: String,
    pub retention_days: i32,
    pub storage_mode: String,
    pub last_snapshot_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeBackupRecord {
    pub id: String,
    pub owner_user_id: String,
    pub runtime_deployment_id: Option<String>,
    pub snapshot_type: String,
    pub storage_mode: String,
    pub status: String,
    pub file_count: i32,
    pub total_workspace_bytes: i64,
    pub artifact_size_bytes: i64,
    pub artifact_path: Option<String>,
    pub manifest_json: Value,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeRestoreDrillRecord {
    pub id: String,
    pub owner_user_id: String,
    pub backup_id: String,
    pub status: String,
    pub notes_json: Value,
    pub started_at: String,
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeUpdatePolicyRecord {
    pub owner_user_id: String,
    pub update_channel: String,
    pub auto_apply: String,
    pub last_checked_at: Option<String>,
    pub last_applied_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeUpdateEventRecord {
    pub id: String,
    pub owner_user_id: String,
    pub runtime_deployment_id: Option<String>,
    pub action: String,
    pub from_version: Option<String>,
    pub to_version: Option<String>,
    pub status: String,
    pub notes_json: Value,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeRunnerPolicyEventRecord {
    pub id: String,
    pub owner_user_id: String,
    pub runtime_deployment_id: Option<String>,
    pub event_kind: String,
    pub summary_json: Value,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SyncDevicePolicyRecord {
    pub device_id: String,
    pub owner_user_id: String,
    pub agent_id: String,
    pub device_class: String,
    pub policy_profile: String,
    pub sync_slices: Value,
    pub requires_local_key_material: bool,
    pub notes_json: Value,
    pub last_bundle_at: String,
    pub last_used_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSessionRecord {
    pub session_id: String,
    pub owner_user_id: String,
    pub state: String,
    pub queue_depth: i64,
    pub active_request_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRequestRecord {
    pub request_id: String,
    pub session_id: String,
    pub owner_user_id: String,
    pub status: String,
    pub created_at: String,
}

async fn apply_migrations(pool: &PgPool) -> Result<(), sqlx::Error> {
    // GAP-029: acquire a session-level advisory lock so only one homeserver instance
    // runs migrations at startup when multiple containers race on boot.
    // Lock key 7799887788 is a fixed OmnyID namespace constant.
    let mut conn = pool.acquire().await?;
    sqlx::query("SELECT pg_advisory_lock(7799887788)")
        .execute(&mut *conn)
        .await?;

    let result = apply_migrations_inner(&mut conn).await;

    // Always release the lock, even on error.
    let _ = sqlx::query("SELECT pg_advisory_unlock(7799887788)")
        .execute(&mut *conn)
        .await;

    result
}

async fn apply_migrations_inner(
    conn: &mut sqlx::pool::PoolConnection<sqlx::Postgres>,
) -> Result<(), sqlx::Error> {
    sqlx::raw_sql(
        r#"
        CREATE TABLE IF NOT EXISTS omnyid_schema_migrations (
            version TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(&mut **conn)
    .await?;

    for (version, description, sql) in MIGRATIONS {
        let already_applied = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM omnyid_schema_migrations WHERE version = $1",
        )
        .bind(version)
        .fetch_one(&mut **conn)
        .await?;

        if already_applied > 0 {
            continue;
        }

        // CGAP-003: each migration runs in its own transaction so a partial failure
        // rolls back cleanly. The advisory lock on the outer connection is session-level
        // and persists across these inner transactions.
        let mut tx = conn.begin().await?;
        if let Err(e) = sqlx::raw_sql(sql).execute(&mut *tx).await {
            // tx is dropped here, triggering automatic ROLLBACK.
            return Err(e);
        }
        sqlx::query(
            r#"
            INSERT INTO omnyid_schema_migrations (version, description)
            VALUES ($1, $2)
            ON CONFLICT (version) DO NOTHING
            "#,
        )
        .bind(version)
        .bind(description)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
    }

    Ok(())
}

// ── Claim neighborhood helpers ────────────────────────────────────────────────

/// Normalize semantic stance aliases to canonical ref_type values.
/// Canonical set: "supports", "refutes", "part_of", "caused_by",
/// "temporally_related", "mentions" (default).
pub(crate) fn normalized_claim_ref_type(ref_type: &str) -> &'static str {
    match ref_type.trim().to_lowercase().as_str() {
        "supports" | "supported_by" | "support" | "confirms" | "validates" => "supports",
        "refutes" | "refuted_by" | "contradicts" | "disputes" | "negates" | "challenges" => "refutes",
        "part_of" | "component_of" | "subset_of" | "belongs_to" | "contained_in" => "part_of",
        "caused_by" | "causes" | "leads_to" | "results_in" | "triggers" | "explains" => "caused_by",
        "temporally_related" | "before" | "after" | "concurrent" | "preceded_by" | "followed_by" => {
            "temporally_related"
        }
        _ => "mentions",
    }
}

/// Return `true` when `ref_type` (after normalization) satisfies `filter`.
/// `None` or `"all"` match any stance.
pub(crate) fn claim_ref_type_matches_filter(ref_type: &str, filter: Option<&str>) -> bool {
    match filter {
        None | Some("all") => true,
        Some(f) => normalized_claim_ref_type(ref_type) == f,
    }
}

/// Group knowledge triples by predicate, returning `{predicate, count}` sorted descending.
pub(crate) fn group_claim_triples_by_predicate(triples: &[Value]) -> Vec<Value> {
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for triple in triples {
        let predicate = triple["predicate"].as_str().unwrap_or("").to_string();
        *counts.entry(predicate).or_default() += 1;
    }
    let mut groups: Vec<Value> = counts
        .into_iter()
        .map(|(predicate, count)| json!({ "predicate": predicate, "count": count }))
        .collect();
    groups.sort_by(|a, b| {
        b["count"]
            .as_u64()
            .unwrap_or(0)
            .cmp(&a["count"].as_u64().unwrap_or(0))
    });
    groups
}

/// Build a summary object for a claim's neighborhood (counts + dominant predicates).
pub(crate) fn summarize_claim_neighborhood(
    supports: &[Value],
    refutes: &[Value],
    mentions: &[Value],
    triples: &[Value],
) -> Value {
    let triple_groups = group_claim_triples_by_predicate(triples);
    let dominant_predicates = triple_groups.iter().take(5).cloned().collect::<Vec<_>>();
    json!({
        "support_count":       supports.len(),
        "refute_count":        refutes.len(),
        "mention_count":       mentions.len(),
        "triple_count":        triples.len(),
        "net_support":         supports.len() as i64 - refutes.len() as i64,
        "dominant_predicates": dominant_predicates,
        "triple_groups":       triple_groups,
    })
}

/// Build a ranked list of related claims ordered by hop distance then total edge count.
pub(crate) fn summarize_related_claims(
    anchor_id: &str,
    node_hops: &std::collections::BTreeMap<String, usize>,
    edges: &[crate::knowledge_curator::BacklinkRecord],
    limit: usize,
) -> Vec<Value> {
    let mut summaries: Vec<Value> = node_hops
        .iter()
        .filter(|(id, _)| id.as_str() != anchor_id)
        .map(|(node_id, &hop)| {
            let support_edges = edges
                .iter()
                .filter(|e| {
                    (e.source_id == *node_id || e.target_id == *node_id)
                        && normalized_claim_ref_type(&e.ref_type) == "supports"
                })
                .count();
            let refute_edges = edges
                .iter()
                .filter(|e| {
                    (e.source_id == *node_id || e.target_id == *node_id)
                        && normalized_claim_ref_type(&e.ref_type) == "refutes"
                })
                .count();
            json!({
                "message_id":    node_id,
                "hop_distance":  hop,
                "support_edges": support_edges,
                "refute_edges":  refute_edges,
            })
        })
        .collect();
    summaries.sort_by(|a, b| {
        let hop_a = a["hop_distance"].as_u64().unwrap_or(0);
        let hop_b = b["hop_distance"].as_u64().unwrap_or(0);
        let total_a = a["support_edges"].as_u64().unwrap_or(0) + a["refute_edges"].as_u64().unwrap_or(0);
        let total_b = b["support_edges"].as_u64().unwrap_or(0) + b["refute_edges"].as_u64().unwrap_or(0);
        hop_a.cmp(&hop_b).then(total_b.cmp(&total_a))
    });
    summaries.truncate(limit);
    summaries
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum StorageMode {
    Plaintext,
    CiphertextOnly,
}

fn effective_storage_mode(
    msg: &ProtoMessage,
    content_json: &Value,
    encryption_json: &Value,
) -> StorageMode {
    if allow_plaintext_storage() {
        return StorageMode::Plaintext;
    }

    if has_ciphertext_envelope(msg, encryption_json) {
        return StorageMode::CiphertextOnly;
    }

    if content_json.is_null() {
        StorageMode::CiphertextOnly
    } else {
        StorageMode::Plaintext
    }
}

fn persisted_content_for_mode(
    storage_mode: &StorageMode,
    content_json: &Value,
    encryption_json: &Value,
) -> Value {
    match storage_mode {
        StorageMode::Plaintext => content_json.clone(),
        StorageMode::CiphertextOnly => json!({
            "omnyid_storage": {
                "mode": "ciphertext_only",
                "plaintext_removed": true,
                "has_encryption_envelope": !is_effectively_empty_json(encryption_json)
            }
        }),
    }
}

fn persisted_views_for_mode(
    storage_mode: &StorageMode,
    views_json: &Value,
    encryption_json: &Value,
) -> Value {
    match storage_mode {
        StorageMode::Plaintext => views_json.clone(),
        StorageMode::CiphertextOnly => json!([
            {
                "format": "system",
                "content": {
                    "mode": "ciphertext_only",
                    "plaintext_removed": true,
                    "has_encryption_envelope": !is_effectively_empty_json(encryption_json)
                }
            }
        ]),
    }
}

fn summary_and_embedding_for_mode(
    storage_mode: &StorageMode,
    content_json: &Value,
) -> (Option<String>, Option<Vec<f32>>) {
    if !enable_server_summarization() || matches!(storage_mode, StorageMode::CiphertextOnly) {
        return (None, None);
    }

    let (summary, embedding) = crate::summarizer::generate_summary_and_embedding(content_json);
    (Some(summary), Some(embedding))
}

fn has_ciphertext_envelope(msg: &ProtoMessage, encryption_json: &Value) -> bool {
    !msg.encryption.trim().is_empty()
        && !is_effectively_empty_json(encryption_json)
        && is_supported_encryption_envelope(encryption_json)
}

fn is_effectively_empty_json(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::Object(map) => map.is_empty(),
        _ => false,
    }
}

fn redacted_views_for_read(views_json: &Value, encryption_json: &Value) -> Value {
    if is_supported_encryption_envelope(encryption_json) {
        persisted_views_for_mode(&StorageMode::CiphertextOnly, views_json, encryption_json)
    } else {
        views_json.clone()
    }
}

fn allow_plaintext_storage() -> bool {
    std::env::var("OMNYID_ALLOW_PLAINTEXT_STORAGE")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

fn enable_server_summarization() -> bool {
    std::env::var("OMNYID_ENABLE_SERVER_SUMMARIZATION")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

fn parse_json_array_string(input: &str) -> Value {
    serde_json::from_str(input).unwrap_or_else(|_| Value::Array(vec![]))
}

fn parse_json_object_string(input: &str) -> Value {
    if input.trim().is_empty() {
        Value::Object(Default::default())
    } else {
        serde_json::from_str(input).unwrap_or_else(|_| Value::Object(Default::default()))
    }
}

fn parse_json_optional_object_string(input: &str) -> Option<Value> {
    if input.trim().is_empty() {
        None
    } else {
        Some(parse_json_object_string(input))
    }
}

fn nullable_string(input: &str) -> Option<String> {
    if input.trim().is_empty() {
        None
    } else {
        Some(input.to_string())
    }
}

fn backlink_kind_as_str(kind: &BacklinkKind) -> &'static str {
    match kind {
        BacklinkKind::SemanticSimilarity => "semantic_similarity",
        BacklinkKind::EntityOverlap => "entity_overlap",
        BacklinkKind::ExplicitRef => "explicit_ref",
        BacklinkKind::TemporalProximity => "temporal_proximity",
    }
}

fn backlink_kind_from_str(input: &str) -> BacklinkKind {
    match input {
        "semantic_similarity" => BacklinkKind::SemanticSimilarity,
        "entity_overlap" => BacklinkKind::EntityOverlap,
        "temporal_proximity" => BacklinkKind::TemporalProximity,
        _ => BacklinkKind::ExplicitRef,
    }
}

pub(crate) fn tenant_schema_name(user_id: &str) -> String {
    // Log a warning if the user_id contains characters outside the expected
    // alphanumeric set — this indicates a programming error upstream; the
    // normalization below still prevents SQL injection but we want visibility.
    let clean = user_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !clean && !user_id.is_empty() {
        tracing::warn!(
            user_id,
            "tenant_schema_name: user_id contains unexpected characters; \
             normalising to alphanumeric — check registration code path"
        );
    }
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

fn tenant_agent_task_queue_table(user_id: &str) -> String {
    format!("\"{}\".agent_task_queue", tenant_schema_name(user_id))
}

fn tenant_agent_focus_items_table(user_id: &str) -> String {
    format!("\"{}\".agent_focus_items", tenant_schema_name(user_id))
}

fn tenant_agent_triggers_table(user_id: &str) -> String {
    format!("\"{}\".agent_triggers", tenant_schema_name(user_id))
}

fn tenant_agent_delegations_table(user_id: &str) -> String {
    format!("\"{}\".agent_delegations", tenant_schema_name(user_id))
}

fn tenant_agent_capability_registry_table(user_id: &str) -> String {
    format!(
        "\"{}\".agent_capability_registry",
        tenant_schema_name(user_id)
    )
}

fn tenant_user_llm_config_table(user_id: &str) -> String {
    format!("\"{}\".user_llm_config", tenant_schema_name(user_id))
}

fn tenant_llm_usage_log_table(user_id: &str) -> String {
    format!("\"{}\".llm_usage_log", tenant_schema_name(user_id))
}

fn tenant_saved_workflows_table(user_id: &str) -> String {
    format!("\"{}\".saved_workflows", tenant_schema_name(user_id))
}

fn tenant_workflow_deployments_table(user_id: &str) -> String {
    format!("\"{}\".workflow_deployments", tenant_schema_name(user_id))
}

fn tenant_workflow_runs_table(user_id: &str) -> String {
    format!("\"{}\".workflow_runs", tenant_schema_name(user_id))
}

fn tenant_workflow_wait_resume_table(user_id: &str) -> String {
    format!("\"{}\".workflow_wait_resume", tenant_schema_name(user_id))
}

fn tenant_workflow_trigger_registrations_table(user_id: &str) -> String {
    format!(
        "\"{}\".workflow_trigger_registrations",
        tenant_schema_name(user_id)
    )
}

fn tenant_trigger_observations_table(user_id: &str) -> String {
    format!(
        "\"{}\".workflow_trigger_observations",
        tenant_schema_name(user_id)
    )
}

/// Derive a 32-byte symmetric key for Gmail OAuth token encryption (GAP-062).
/// Uses HKDF-SHA256 over the server's signing key with a Gmail-specific info tag
/// so compromise of one domain doesn't expose another.
fn gmail_token_encryption_key() -> [u8; 32] {
    let root_key_hex = std::env::var("OMNYID_ENCRYPTION_KEY_HEX")
        .or_else(|_| std::env::var("OMNYID_SIGNING_KEY_HEX"))
        .unwrap_or_default();
    let root_key = hex::decode(root_key_hex.trim()).unwrap_or_else(|_| vec![0u8; 32]);
    let derived = crate::post_quantum::hkdf_sha256(&root_key, b"omnyid-gmail-token-kek", b"v1", 32);
    let mut key = [0u8; 32];
    key.copy_from_slice(&derived);
    key
}

fn tenant_messages_table(user_id: &str) -> String {
    format!("\"{}\".messages", tenant_schema_name(user_id))
}

fn tenant_attachments_table(user_id: &str) -> String {
    format!("\"{}\".attachments", tenant_schema_name(user_id))
}

fn agent_task_json_from_row(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "id": row.get::<String, _>("id"),
        "agent_instance_id": row.get::<String, _>("agent_instance_id"),
        "thread_id": row.get::<String, _>("thread_id"),
        "status": row.get::<String, _>("status"),
        "intent": row.get::<String, _>("intent"),
        "plan": row.get::<serde_json::Value, _>("plan_json"),
        "plan_json": row.get::<serde_json::Value, _>("plan_json"),
        "result": row.get::<serde_json::Value, _>("result_json"),
        "result_json": row.get::<serde_json::Value, _>("result_json"),
        "error": row.get::<Option<String>, _>("error"),
        "priority": row.get::<String, _>("priority"),
        "created_at": row.get::<String, _>("created_at"),
        "updated_at": row.get::<String, _>("updated_at"),
    })
}

fn saved_workflow_json_from_row(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "workflow_id": row.get::<String, _>("workflow_id"),
        "owner_user_id": row.get::<String, _>("owner_user_id"),
        "title": row.get::<String, _>("title"),
        "description": row.get::<Option<String>, _>("description"),
        "favorite": row.get::<bool, _>("favorite"),
        "preset_kinds": row.get::<Vec<String>, _>("preset_kinds"),
        "graph": row.get::<serde_json::Value, _>("graph_json"),
        "latest_ir": row.get::<Option<serde_json::Value>, _>("latest_ir_json"),
        "created_at": row.get::<String, _>("created_at"),
        "updated_at": row.get::<String, _>("updated_at"),
        "archived_at": row.get::<Option<String>, _>("archived_at"),
    })
}

fn workflow_deployment_json_from_row(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "deployment_id": row.get::<String, _>("deployment_id"),
        "workflow_id": row.get::<String, _>("workflow_id"),
        "owner_user_id": row.get::<String, _>("owner_user_id"),
        "environment": row.get::<String, _>("environment"),
        "status": row.get::<String, _>("status"),
        "ir_snapshot": row.get::<serde_json::Value, _>("ir_snapshot_json"),
        "graph_snapshot": row.get::<serde_json::Value, _>("graph_snapshot_json"),
        "source_deployment_id": row.get::<Option<String>, _>("source_deployment_id"),
        "deployed_at": row.get::<String, _>("deployed_at"),
        "created_at": row.get::<String, _>("created_at"),
    })
}

fn workflow_run_json_from_row(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "run_id": row.get::<String, _>("run_id"),
        "workflow_id": row.get::<String, _>("workflow_id"),
        "deployment_id": row.get::<String, _>("deployment_id"),
        "owner_user_id": row.get::<String, _>("owner_user_id"),
        "status": row.get::<String, _>("status"),
        "trigger_kind": row.get::<String, _>("trigger_kind"),
        "replay_of_run_id": row.get::<Option<String>, _>("replay_of_run_id"),
        "timeline": row.get::<serde_json::Value, _>("timeline_json"),
        "result": row.get::<serde_json::Value, _>("result_json"),
        "started_at": row.get::<String, _>("started_at"),
        "completed_at": row.get::<Option<String>, _>("completed_at"),
        "created_at": row.get::<String, _>("created_at"),
    })
}

fn workflow_wait_resume_json_from_row(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "wait_resume_id": row.get::<String, _>("wait_resume_id"),
        "workflow_id": row.get::<String, _>("workflow_id"),
        "deployment_id": row.get::<String, _>("deployment_id"),
        "run_id": row.get::<String, _>("run_id"),
        "owner_user_id": row.get::<String, _>("owner_user_id"),
        "manifest_node_id": row.get::<String, _>("manifest_node_id"),
        "source_graph_node_id": row.get::<String, _>("source_graph_node_id"),
        "status": row.get::<String, _>("status"),
        "resume_family": row.get::<String, _>("resume_family"),
        "resume_kind": row.get::<String, _>("resume_kind"),
        "wait_reason": row.get::<Option<String>, _>("wait_reason"),
        "scheduled_for": row.get::<Option<String>, _>("scheduled_for"),
        "descriptor": row.get::<serde_json::Value, _>("descriptor_json"),
        "created_at": row.get::<String, _>("created_at"),
        "resumed_at": row.get::<Option<String>, _>("resumed_at"),
    })
}

fn focus_item_json_from_row(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "id": row.get::<String, _>("id"),
        "agent_instance_id": row.get::<String, _>("agent_instance_id"),
        "title": row.get::<String, _>("title"),
        "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
        "status": row.get::<String, _>("status"),
        "priority": row.get::<String, _>("priority"),
        "due_at": row.try_get::<Option<String>, _>("due_at").ok().flatten(),
        "created_at": row.get::<String, _>("created_at"),
        "updated_at": row.get::<String, _>("updated_at"),
    })
}

fn trigger_json_from_row(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "id": row.get::<String, _>("id"),
        "trigger_type": row.get::<String, _>("trigger_type"),
        "config_json": row.get::<serde_json::Value, _>("config_json"),
        "enabled": row.get::<bool, _>("enabled"),
        "last_fired_at": row.try_get::<Option<String>, _>("last_fired_at").ok().flatten(),
        "next_fire_at": row.try_get::<Option<String>, _>("next_fire_at").ok().flatten(),
        "created_at": row.get::<String, _>("created_at"),
    })
}

fn delegation_json_from_row(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "id": row.get::<String, _>("id"),
        "scope": row.get::<String, _>("scope"),
        "mask": row.get::<String, _>("mask"),
        "owner_user_id": row.get::<String, _>("owner_user_id"),
        "task_id": row.try_get::<Option<String>, _>("task_id").ok().flatten(),
        "revoked_at": row.try_get::<Option<String>, _>("revoked_at").ok().flatten(),
        "expires_at": row.get::<String, _>("expires_at"),
        "created_at": row.get::<String, _>("created_at"),
    })
}

fn capability_json_from_row(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "id": row.get::<String, _>("id"),
        "name": row.get::<String, _>("name"),
        "description": row.get::<String, _>("description"),
        "input_schema": row.get::<serde_json::Value, _>("input_schema_json"),
        "output_schema": row.try_get::<Option<serde_json::Value>, _>("output_schema_json").ok().flatten(),
        "version": row.get::<String, _>("version"),
        "tags": row.get::<Vec<String>, _>("tags"),
        "approval_mode": row.get::<String, _>("approval_mode"),
        "created_at": row.get::<String, _>("created_at"),
        "updated_at": row.get::<String, _>("updated_at"),
    })
}

fn llm_config_json_from_row(row: &sqlx::postgres::PgRow) -> Value {
    json!({
        "backend": row.get::<String, _>("backend"),
        "provider": row.get::<String, _>("provider"),
        "model": row.get::<String, _>("model"),
        "ollama_url": row.get::<Option<String>, _>("ollama_url"),
        "monthly_budget_cents": row.get::<i32, _>("monthly_budget_cents"),
        "usage_cents_current_month": row.get::<i32, _>("usage_cents_current_month"),
        "usage_reset_at": row.get::<String, _>("usage_reset_at"),
    })
}

fn tenant_private_schema_bootstrap_sql(schema: &str) -> Vec<String> {
    let schema_quoted = format!("\"{}\"", schema);
    vec![
        format!("CREATE SCHEMA IF NOT EXISTS {schema_quoted}"),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                parent_id TEXT,
                from_agent TEXT NOT NULL,
                to_agents JSONB NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL,
                type TEXT NOT NULL,
                kind TEXT,
                content JSONB NOT NULL,
                views JSONB NOT NULL DEFAULT '[]'::jsonb,
                summary TEXT,
                embedding VECTOR(768),
                signature TEXT NOT NULL,
                encryption JSONB,
                "references" JSONB NOT NULL DEFAULT '[]'::jsonb,
                attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
                store_in_relational BOOLEAN DEFAULT FALSE,
                expires_at TIMESTAMPTZ,
                legal_hold BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                subtype TEXT,
                metadata JSONB
            )
            "#
        ),
        format!("CREATE INDEX IF NOT EXISTS idx_thread ON {schema_quoted}.messages(thread_id)"),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_embedding ON {schema_quoted}.messages USING hnsw (embedding vector_cosine_ops)"
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_references ON {schema_quoted}.messages USING gin (\"references\")"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.attachments (
                id TEXT PRIMARY KEY,
                message_id TEXT NOT NULL REFERENCES {schema_quoted}.messages(id) ON DELETE CASCADE,
                thread_id TEXT NOT NULL,
                name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes BIGINT NOT NULL,
                storage JSONB NOT NULL,
                encryption JSONB NOT NULL,
                sha256 TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON {schema_quoted}.attachments(message_id)"
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_attachments_thread_id ON {schema_quoted}.attachments(thread_id)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.action_audit_log (
                id BIGSERIAL PRIMARY KEY,
                capability_id TEXT NOT NULL,
                thread_id TEXT NOT NULL,
                status TEXT NOT NULL,
                output JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                external_reference TEXT,
                recorded_at TIMESTAMPTZ NOT NULL
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_action_audit_log_thread_id ON {schema_quoted}.action_audit_log(thread_id, recorded_at DESC)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.sync_devices (
                device_id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                electric_project_url TEXT NOT NULL,
                encrypted_seed_ref TEXT NOT NULL,
                pglite_path TEXT NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            "#
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.personalization_events (
                event_id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                actor_agent_id TEXT NOT NULL,
                signal TEXT NOT NULL,
                rationale TEXT,
                captured_at TIMESTAMPTZ NOT NULL
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_personalization_events_thread_id ON {schema_quoted}.personalization_events(thread_id, captured_at DESC)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.agent_task_queue (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                agent_instance_id TEXT NOT NULL REFERENCES public.agent_instances(id) ON DELETE CASCADE,
                thread_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                        'pending','planning','executing',
                        'awaiting_approval','completed','failed','cancelled'
                    )),
                intent TEXT NOT NULL,
                plan_json JSONB NOT NULL DEFAULT '{{"steps":[]}}'::jsonb,
                result_json JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                error TEXT,
                priority TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('high','normal','low')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_agent_task_queue_owner ON {schema_quoted}.agent_task_queue(owner_user_id, status)"
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_agent_task_queue_agent ON {schema_quoted}.agent_task_queue(agent_instance_id)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.agent_focus_items (
                id TEXT PRIMARY KEY,
                agent_instance_id TEXT NOT NULL REFERENCES public.agent_instances(id) ON DELETE CASCADE,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','done','blocked')),
                priority TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low','medium','high')),
                due_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_agent_focus_items_owner ON {schema_quoted}.agent_focus_items(owner_user_id, agent_instance_id)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.agent_triggers (
                id TEXT PRIMARY KEY,
                agent_instance_id TEXT NOT NULL REFERENCES public.agent_instances(id) ON DELETE CASCADE,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                trigger_type TEXT NOT NULL,
                config_json JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                last_fired_at TIMESTAMPTZ,
                next_fire_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_agent_triggers_owner ON {schema_quoted}.agent_triggers(owner_user_id, agent_instance_id)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.agent_delegations (
                id TEXT PRIMARY KEY,
                master_instance_id TEXT NOT NULL REFERENCES public.agent_instances(id) ON DELETE CASCADE,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                scope TEXT NOT NULL,
                mask TEXT NOT NULL DEFAULT 'private',
                delegated_key_hex TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                task_id TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                revoked_at TIMESTAMPTZ
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_agent_delegations_owner ON {schema_quoted}.agent_delegations(owner_user_id, master_instance_id)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.agent_capability_registry (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                agent_instance_id TEXT NOT NULL REFERENCES public.agent_instances(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                input_schema_json JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                output_schema_json JSONB,
                version TEXT NOT NULL DEFAULT '1.0.0',
                tags TEXT[] NOT NULL DEFAULT '{{}}',
                approval_mode TEXT NOT NULL DEFAULT 'autonomous'
                    CHECK (approval_mode IN ('autonomous','suggest_only','human_approval_required')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (agent_instance_id, name)
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_agent_capability_registry_owner ON {schema_quoted}.agent_capability_registry(owner_user_id, agent_instance_id)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.user_llm_config (
                id TEXT NOT NULL PRIMARY KEY,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                backend TEXT NOT NULL DEFAULT 'hosted'
                    CHECK (backend IN ('hosted','byok','ollama','runpod')),
                provider TEXT NOT NULL DEFAULT 'anthropic',
                model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
                encrypted_api_key TEXT,
                ollama_url TEXT,
                monthly_budget_cents INT NOT NULL DEFAULT 0,
                usage_cents_current_month INT NOT NULL DEFAULT 0,
                usage_reset_at DATE NOT NULL DEFAULT DATE_TRUNC('month', NOW()),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (owner_user_id)
            )
            "#
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.llm_usage_log (
                id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                agent_task_id TEXT,
                model TEXT NOT NULL,
                tokens_input INT NOT NULL DEFAULT 0,
                tokens_output INT NOT NULL DEFAULT 0,
                cost_cents INT NOT NULL DEFAULT 0,
                recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_llm_usage_log_owner_month ON {schema_quoted}.llm_usage_log(owner_user_id, recorded_at)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.saved_workflows (
                workflow_id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                favorite BOOLEAN NOT NULL DEFAULT FALSE,
                preset_kinds TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
                graph_json JSONB NOT NULL,
                latest_ir_json JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                archived_at TIMESTAMPTZ
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_saved_workflows_owner_updated ON {schema_quoted}.saved_workflows(owner_user_id, updated_at DESC)"
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_saved_workflows_owner_favorite ON {schema_quoted}.saved_workflows(owner_user_id, favorite DESC, updated_at DESC)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.workflow_deployments (
                deployment_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL REFERENCES {schema_quoted}.saved_workflows(workflow_id) ON DELETE CASCADE,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                environment TEXT NOT NULL,
                status TEXT NOT NULL,
                ir_snapshot_json JSONB NOT NULL,
                graph_snapshot_json JSONB NOT NULL,
                source_deployment_id TEXT,
                deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_workflow_deployments_workflow_deployed ON {schema_quoted}.workflow_deployments(workflow_id, deployed_at DESC)"
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_workflow_deployments_owner_workflow ON {schema_quoted}.workflow_deployments(owner_user_id, workflow_id, created_at DESC)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.workflow_runs (
                run_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL REFERENCES {schema_quoted}.saved_workflows(workflow_id) ON DELETE CASCADE,
                deployment_id TEXT NOT NULL REFERENCES {schema_quoted}.workflow_deployments(deployment_id) ON DELETE CASCADE,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                trigger_kind TEXT NOT NULL,
                replay_of_run_id TEXT,
                timeline_json JSONB NOT NULL,
                result_json JSONB NOT NULL,
                started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_started ON {schema_quoted}.workflow_runs(workflow_id, started_at DESC)"
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_workflow_runs_owner_workflow ON {schema_quoted}.workflow_runs(owner_user_id, workflow_id, created_at DESC)"
        ),
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.workflow_wait_resume (
                wait_resume_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL REFERENCES {schema_quoted}.saved_workflows(workflow_id) ON DELETE CASCADE,
                deployment_id TEXT NOT NULL REFERENCES {schema_quoted}.workflow_deployments(deployment_id) ON DELETE CASCADE,
                run_id TEXT NOT NULL REFERENCES {schema_quoted}.workflow_runs(run_id) ON DELETE CASCADE,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                manifest_node_id TEXT NOT NULL,
                source_graph_node_id TEXT NOT NULL,
                status TEXT NOT NULL,
                resume_family TEXT NOT NULL,
                resume_kind TEXT NOT NULL,
                wait_reason TEXT,
                scheduled_for TIMESTAMPTZ,
                descriptor_json JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                resumed_at TIMESTAMPTZ
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_workflow_wait_resume_run_created ON {schema_quoted}.workflow_wait_resume(run_id, created_at DESC)"
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_workflow_wait_resume_owner_workflow ON {schema_quoted}.workflow_wait_resume(owner_user_id, workflow_id, created_at DESC)"
        ),
        // ── Workflow trigger registrations ────────────────────────────────────
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.workflow_trigger_registrations (
                registration_id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL REFERENCES {schema_quoted}.saved_workflows(workflow_id) ON DELETE CASCADE,
                deployment_id TEXT NOT NULL REFERENCES {schema_quoted}.workflow_deployments(deployment_id) ON DELETE CASCADE,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                environment TEXT NOT NULL DEFAULT 'dev',
                trigger_node_id TEXT NOT NULL,
                manifest_node_id TEXT NOT NULL,
                trigger_family TEXT NOT NULL DEFAULT 'manual',
                trigger_kind TEXT NOT NULL DEFAULT 'manual',
                registration_status TEXT NOT NULL DEFAULT 'preview'
                    CHECK (registration_status IN ('preview','registered','paused','unhealthy','retired')),
                idempotency_key TEXT NOT NULL UNIQUE,
                dedup_hash TEXT,
                descriptor_json JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                last_fired_at TIMESTAMPTZ,
                next_fire_at TIMESTAMPTZ,
                retry_count INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_wf_trigger_reg_deployment ON {schema_quoted}.workflow_trigger_registrations(deployment_id, created_at DESC)"
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_wf_trigger_reg_workflow ON {schema_quoted}.workflow_trigger_registrations(owner_user_id, workflow_id, created_at DESC)"
        ),
        // ── Trigger observability (Phase 3 item 11) ───────────────────────────
        format!(
            r#"
            CREATE TABLE IF NOT EXISTS {schema_quoted}.workflow_trigger_observations (
                observation_id TEXT PRIMARY KEY,
                registration_id TEXT NOT NULL,
                workflow_id TEXT NOT NULL REFERENCES {schema_quoted}.saved_workflows(workflow_id) ON DELETE CASCADE,
                deployment_id TEXT NOT NULL,
                owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                trigger_source TEXT NOT NULL DEFAULT 'manual',
                trigger_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                payload_summary JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                schedule_metadata JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                delayed_resumption_reason TEXT,
                hybrid_decision_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
                run_initiation_trace JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                replay_nonce TEXT NOT NULL UNIQUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            "#
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_wf_trigger_obs_registration ON {schema_quoted}.workflow_trigger_observations(registration_id, created_at DESC)"
        ),
        format!(
            "CREATE INDEX IF NOT EXISTS idx_wf_trigger_obs_workflow ON {schema_quoted}.workflow_trigger_observations(owner_user_id, workflow_id, created_at DESC)"
        ),
        format!(
            r#"
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_trigger
                    WHERE tgname = 'trigger_new_message'
                      AND tgrelid = '{schema}.messages'::regclass
                ) THEN
                    EXECUTE 'CREATE TRIGGER trigger_new_message
                        AFTER INSERT ON {schema_quoted}.messages
                        FOR EACH ROW
                        WHEN (NEW.store_in_relational = true)
                        EXECUTE FUNCTION public.notify_new_message()';
                END IF;
            END
            $$;
            "#
        ),
    ]
}

fn integration_transport_label(
    transport: &crate::integration::IntegrationTransport,
) -> &'static str {
    match transport {
        crate::integration::IntegrationTransport::Rest => "rest",
        crate::integration::IntegrationTransport::Graphql => "graphql",
        crate::integration::IntegrationTransport::BrowserAutomation => "browser_automation",
    }
}

fn proto_message_from_row(row: sqlx::postgres::PgRow) -> Result<ProtoMessage, sqlx::Error> {
    let encryption = row
        .try_get::<Option<Value>, _>("encryption")
        .unwrap_or(None)
        .unwrap_or_else(|| Value::Object(Default::default()));
    let views = row
        .try_get::<Value, _>("views")
        .unwrap_or_else(|_| Value::Array(vec![]));

    Ok(ProtoMessage {
        protocol: "afp-v1".to_string(),
        id: row.try_get("id")?,
        thread_id: row.try_get("thread_id")?,
        parent_id: row
            .try_get::<Option<String>, _>("parent_id")?
            .unwrap_or_default(),
        from: row.try_get("from_agent")?,
        to: serde_json::from_value(row.try_get("to_agents").unwrap_or(Value::Array(vec![])))
            .unwrap_or_default(),
        timestamp: row.try_get("timestamp")?,
        r#type: row.try_get("type")?,
        kind: row
            .try_get::<Option<String>, _>("kind")
            .unwrap_or(None)
            .filter(|value| !value.trim().is_empty()),
        content: row
            .try_get::<Value, _>("content")
            .unwrap_or_else(|_| Value::Object(Default::default()))
            .to_string(),
        signature: row.try_get("signature")?,
        encryption: encryption.to_string(),
        views: redacted_views_for_read(&views, &encryption).to_string(),
        references: row
            .try_get::<Value, _>("references")
            .unwrap_or_else(|_| Value::Array(vec![]))
            .to_string(),
        attachments: row
            .try_get::<Value, _>("attachments")
            .unwrap_or_else(|_| Value::Array(vec![]))
            .to_string(),
        store_in_relational: row.try_get("store_in_relational").unwrap_or(false),
        subtype: row
            .try_get::<Option<String>, _>("subtype")
            .unwrap_or(None)
            .unwrap_or_default(),
        metadata: row
            .try_get::<Option<Value>, _>("metadata")
            .unwrap_or(None)
            .map(|value| value.to_string())
            .unwrap_or_default(),
    })
}

fn user_from_row(row: sqlx::postgres::PgRow) -> Result<UserRecord, sqlx::Error> {
    Ok(UserRecord {
        id: row.try_get("id")?,
        email: row.try_get("email")?,
        password_hash: row.try_get("password_hash").unwrap_or(None),
        auth_provider: row.try_get("auth_provider")?,
        google_sub: row.try_get("google_sub").unwrap_or(None),
        display_name: row.try_get("display_name")?,
        created_at: row.try_get("created_at")?,
    })
}

/// SHA-256 hash of a raw bearer token for at-rest storage (GAP-005).
///
/// Never stored or compared in plain text. Hashing here means a DB
/// compromise exposes only token hashes, not usable credentials.
pub(crate) fn sha256_token(raw: &str) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(raw.as_bytes()))
}

fn session_from_row(row: sqlx::postgres::PgRow) -> Result<AuthSessionRecord, sqlx::Error> {
    Ok(AuthSessionRecord {
        token: row.try_get("token")?,
        user_id: row.try_get("user_id")?,
        created_at: row.try_get("created_at")?,
        expires_at: row.try_get("expires_at")?,
    })
}

fn managed_agent_from_row(row: sqlx::postgres::PgRow) -> Result<ManagedAgentRecord, sqlx::Error> {
    Ok(ManagedAgentRecord {
        id: row.try_get("id")?,
        owner_user_id: row.try_get("owner_user_id")?,
        agent_id: row.try_get("agent_id")?,
        label: row.try_get("label")?,
        email: row.try_get("email")?,
        kind: row.try_get("kind")?,
        created_at: row.try_get("created_at")?,
        metadata: row
            .try_get("metadata")
            .unwrap_or_else(|_| Value::Object(Default::default())),
    })
}

fn action_audit_entry_from_row(row: sqlx::postgres::PgRow) -> Result<ActionAuditEntry, sqlx::Error> {
    Ok(ActionAuditEntry {
        capability_id: row.try_get("capability_id")?,
        thread_id: row.try_get("thread_id")?,
        status: row.try_get("status")?,
        output: row
            .try_get("output")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        external_reference: row.try_get("external_reference").unwrap_or(None),
        recorded_at: row.try_get("recorded_at")?,
    })
}

fn runtime_deployment_from_row(row: sqlx::postgres::PgRow) -> Result<RuntimeDeploymentRecord, sqlx::Error> {
    Ok(RuntimeDeploymentRecord {
        id: row.try_get("id")?,
        owner_user_id: row.try_get("owner_user_id")?,
        framework: row.try_get("framework")?,
        gui: row.try_get("gui").unwrap_or(None),
        status: row.try_get("status")?,
        python_version: row.try_get("python_version")?,
        image_ref: row.try_get("image_ref")?,
        runtime_token: row.try_get("runtime_token")?,
        workspace_path: row.try_get("workspace_path")?,
        config_json: row
            .try_get("config_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn user_onboarding_from_row(row: sqlx::postgres::PgRow) -> Result<UserOnboardingRecord, sqlx::Error> {
    Ok(UserOnboardingRecord {
        owner_user_id: row.try_get("owner_user_id")?,
        identity_confirmed: row.try_get("identity_confirmed").unwrap_or(false),
        email_provider: row.try_get("email_provider").unwrap_or(None),
        email_address: row.try_get("email_address").unwrap_or(None),
        email_connected: row.try_get("email_connected").unwrap_or(false),
        llm_mode: row
            .try_get::<Option<String>, _>("llm_mode")
            .unwrap_or(Some("byo_or_local".to_string()))
            .unwrap_or_else(|| "byo_or_local".to_string()),
        notes: row
            .try_get("notes")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        updated_at: row.try_get("updated_at")?,
        completed_at: row.try_get("completed_at").unwrap_or(None),
    })
}

fn support_access_grant_from_row(row: sqlx::postgres::PgRow) -> Result<SupportAccessGrantRecord, sqlx::Error> {
    Ok(SupportAccessGrantRecord {
        id: row.try_get("id")?,
        owner_user_id: row.try_get("owner_user_id")?,
        status: row
            .try_get("status")
            .unwrap_or_else(|_| "disabled".to_string()),
        access_scope: row
            .try_get::<Option<String>, _>("access_scope")
            .unwrap_or(Some("runtime_metadata_only".to_string()))
            .unwrap_or_else(|| "runtime_metadata_only".to_string()),
        reason: row.try_get("reason").unwrap_or(None),
        notes: row
            .try_get("notes")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        granted_at: row.try_get("granted_at")?,
        expires_at: row.try_get("expires_at")?,
        revoked_at: row.try_get("revoked_at").unwrap_or(None),
    })
}

fn runtime_backup_policy_from_row(row: sqlx::postgres::PgRow) -> Result<RuntimeBackupPolicyRecord, sqlx::Error> {
    Ok(RuntimeBackupPolicyRecord {
        owner_user_id: row.try_get("owner_user_id")?,
        retention_days: row.try_get("retention_days").unwrap_or(14),
        storage_mode: row
            .try_get::<Option<String>, _>("storage_mode")
            .unwrap_or(Some("metadata_only_hosted".to_string()))
            .unwrap_or_else(|| "metadata_only_hosted".to_string()),
        last_snapshot_at: row.try_get("last_snapshot_at").unwrap_or(None),
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn runtime_backup_from_row(row: sqlx::postgres::PgRow) -> Result<RuntimeBackupRecord, sqlx::Error> {
    Ok(RuntimeBackupRecord {
        id: row.try_get("id")?,
        owner_user_id: row.try_get("owner_user_id")?,
        runtime_deployment_id: row.try_get("runtime_deployment_id").unwrap_or(None),
        snapshot_type: row.try_get("snapshot_type")?,
        storage_mode: row
            .try_get::<Option<String>, _>("storage_mode")
            .unwrap_or(Some("metadata_only_hosted".to_string()))
            .unwrap_or_else(|| "metadata_only_hosted".to_string()),
        status: row.try_get("status")?,
        file_count: row.try_get("file_count").unwrap_or_default(),
        total_workspace_bytes: row.try_get("total_workspace_bytes").unwrap_or_default(),
        artifact_size_bytes: row.try_get("artifact_size_bytes").unwrap_or_default(),
        artifact_path: row.try_get("artifact_path").unwrap_or(None),
        manifest_json: row
            .try_get("manifest_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        created_at: row.try_get("created_at")?,
        expires_at: row.try_get("expires_at")?,
    })
}

fn runtime_restore_drill_from_row(row: sqlx::postgres::PgRow) -> Result<RuntimeRestoreDrillRecord, sqlx::Error> {
    Ok(RuntimeRestoreDrillRecord {
        id: row.try_get("id")?,
        owner_user_id: row.try_get("owner_user_id")?,
        backup_id: row.try_get("backup_id")?,
        status: row.try_get("status")?,
        notes_json: row
            .try_get("notes_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        started_at: row.try_get("started_at")?,
        completed_at: row.try_get("completed_at").unwrap_or(None),
    })
}

fn runtime_update_policy_from_row(row: sqlx::postgres::PgRow) -> Result<RuntimeUpdatePolicyRecord, sqlx::Error> {
    Ok(RuntimeUpdatePolicyRecord {
        owner_user_id: row.try_get("owner_user_id")?,
        update_channel: row
            .try_get::<Option<String>, _>("update_channel")
            .unwrap_or(Some("stable".to_string()))
            .unwrap_or_else(|| "stable".to_string()),
        auto_apply: row
            .try_get::<Option<String>, _>("auto_apply")
            .unwrap_or(Some("manual_only".to_string()))
            .unwrap_or_else(|| "manual_only".to_string()),
        last_checked_at: row.try_get("last_checked_at").unwrap_or(None),
        last_applied_at: row.try_get("last_applied_at").unwrap_or(None),
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn runtime_update_event_from_row(row: sqlx::postgres::PgRow) -> Result<RuntimeUpdateEventRecord, sqlx::Error> {
    Ok(RuntimeUpdateEventRecord {
        id: row.try_get("id")?,
        owner_user_id: row.try_get("owner_user_id")?,
        runtime_deployment_id: row.try_get("runtime_deployment_id").unwrap_or(None),
        action: row.try_get("action")?,
        from_version: row.try_get("from_version").unwrap_or(None),
        to_version: row.try_get("to_version").unwrap_or(None),
        status: row.try_get("status")?,
        notes_json: row
            .try_get("notes_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        created_at: row.try_get("created_at")?,
    })
}

fn runtime_runner_policy_event_from_row(
    row: sqlx::postgres::PgRow,
) -> Result<RuntimeRunnerPolicyEventRecord, sqlx::Error> {
    Ok(RuntimeRunnerPolicyEventRecord {
        id: row.try_get("id")?,
        owner_user_id: row.try_get("owner_user_id")?,
        runtime_deployment_id: row.try_get("runtime_deployment_id").unwrap_or(None),
        event_kind: row.try_get("event_kind")?,
        summary_json: row
            .try_get("summary_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        created_at: row.try_get("created_at")?,
    })
}

fn sync_device_policy_from_row(row: sqlx::postgres::PgRow) -> Result<SyncDevicePolicyRecord, sqlx::Error> {
    Ok(SyncDevicePolicyRecord {
        device_id: row.try_get("device_id")?,
        owner_user_id: row.try_get("owner_user_id")?,
        agent_id: row.try_get("agent_id")?,
        device_class: row.try_get("device_class")?,
        policy_profile: row.try_get("policy_profile")?,
        sync_slices: row
            .try_get("sync_slices")
            .unwrap_or_else(|_| Value::Array(vec![])),
        requires_local_key_material: row.try_get("requires_local_key_material").unwrap_or(false),
        notes_json: row
            .try_get("notes_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        last_bundle_at: row.try_get("last_bundle_at")?,
        last_used_at: row.try_get("last_used_at").unwrap_or(None),
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn approval_mode_label(mode: &crate::integration::ApprovalMode) -> &'static str {
    match mode {
        crate::integration::ApprovalMode::Autonomous => "autonomous",
        crate::integration::ApprovalMode::SuggestOnly => "suggest_only",
        crate::integration::ApprovalMode::HumanApprovalRequired => "human_approval_required",
    }
}

fn action_status_label(status: &crate::integration::ActionStatus) -> &'static str {
    match status {
        crate::integration::ActionStatus::Pending => "pending",
        crate::integration::ActionStatus::Approved => "approved",
        crate::integration::ActionStatus::Rejected => "rejected",
        crate::integration::ActionStatus::Completed => "completed",
        crate::integration::ActionStatus::Failed => "failed",
    }
}

fn feedback_signal_label(signal: &crate::personalization::FeedbackSignal) -> &'static str {
    match signal {
        crate::personalization::FeedbackSignal::Approved => "approved",
        crate::personalization::FeedbackSignal::Rejected => "rejected",
        crate::personalization::FeedbackSignal::Edited => "edited",
        crate::personalization::FeedbackSignal::Ignored => "ignored",
    }
}

fn artifact_status_label(status: &crate::personalization::ArtifactStatus) -> &'static str {
    match status {
        crate::personalization::ArtifactStatus::Draft => "draft",
        crate::personalization::ArtifactStatus::Active => "active",
        crate::personalization::ArtifactStatus::Paused => "paused",
        crate::personalization::ArtifactStatus::RolledBack => "rolled_back",
    }
}

async fn persist_attachment_metadata(
    pool: &PgPool,
    message_id: &str,
    thread_id: &str,
    attachments_json: &Value,
) -> Result<(), sqlx::Error> {
    persist_attachment_metadata_to_table(
        pool,
        "attachments",
        message_id,
        thread_id,
        attachments_json,
    )
    .await
}

async fn persist_attachment_metadata_to_table(
    pool: &PgPool,
    attachments_table: &str,
    message_id: &str,
    thread_id: &str,
    attachments_json: &Value,
) -> Result<(), sqlx::Error> {
    let Some(attachments) = attachments_json.as_array() else {
        return Ok(());
    };

    for attachment in attachments {
        let Some(attachment_id) = attachment.get("id").and_then(Value::as_str) else {
            continue;
        };
        let Some(name) = attachment.get("name").and_then(Value::as_str) else {
            continue;
        };
        let Some(mime_type) = attachment.get("mime_type").and_then(Value::as_str) else {
            continue;
        };
        let Some(size_bytes) = attachment.get("size_bytes").and_then(Value::as_i64) else {
            continue;
        };

        let storage = attachment
            .get("storage")
            .cloned()
            .unwrap_or_else(|| Value::Object(Default::default()));
        let encryption = attachment
            .get("encryption")
            .cloned()
            .unwrap_or_else(|| Value::Object(Default::default()));
        let sha256 = attachment
            .get("sha256")
            .and_then(Value::as_str)
            .map(str::to_string);

        sqlx::query(&format!(
            r#"
            INSERT INTO {attachments_table} (
                id, message_id, thread_id, name, mime_type, size_bytes, storage, encryption, sha256
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO NOTHING
            "#,
        ))
        .bind(attachment_id)
        .bind(message_id)
        .bind(thread_id)
        .bind(name)
        .bind(mime_type)
        .bind(size_bytes)
        .bind(storage)
        .bind(encryption)
        .bind(sha256)
        .execute(pool)
        .await?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        Db, SavedWorkflowRecord, StorageMode, UserRecord, WorkflowDeploymentRecord,
        WorkflowRunRecord, WorkflowWaitResumeRecord, effective_storage_mode,
        enable_server_summarization, persisted_content_for_mode, persisted_views_for_mode,
        redacted_views_for_read, summary_and_embedding_for_mode,
        tenant_private_schema_bootstrap_sql, tenant_schema_name,
    };
    use crate::afp::Message;
    use crate::agent_template::{
        AgentInstance, AgentTask, FocusItem, TaskPriority, TriggerType, generate_delegated_key,
    };
    use serde_json::json;
    use ulid::Ulid;

    fn sample_proto_message() -> Message {
        Message {
            protocol: "afp-v1".to_string(),
            id: "msg_test_01".to_string(),
            thread_id: "thread_test_01".to_string(),
            parent_id: String::new(),
            from: "agent:test@omnyid.local".to_string(),
            to: vec!["agent:peer@omnyid.local".to_string()],
            timestamp: "2026-03-20T00:00:00Z".to_string(),
            r#type: "task".to_string(),
            kind: None,
            content: "{\"secret\":true}".to_string(),
            signature: "demo".to_string(),
            encryption: "{\"scheme\":\"omnyid-envelope-v1\",\"algorithm\":\"xchacha20poly1305-ietf\",\"nonce\":\"abc\",\"ciphertext\":\"def\"}".to_string(),
            views: "[]".to_string(),
            references: "[]".to_string(),
            attachments: "[]".to_string(),
            store_in_relational: false,
            subtype: "status".to_string(),
            metadata: "{\"domain\":\"ops\"}".to_string(),
        }
    }

    #[test]
    fn encrypted_messages_default_to_ciphertext_only_storage() {
        unsafe {
            std::env::remove_var("OMNYID_ALLOW_PLAINTEXT_STORAGE");
        }
        let message = sample_proto_message();
        let mode = effective_storage_mode(
            &message,
            &json!({"secret": true}),
            &json!({
                "scheme": "omnyid-envelope-v1",
                "algorithm": "xchacha20poly1305-ietf",
                "nonce": "abc",
                "ciphertext": "def"
            }),
        );
        assert_eq!(mode, StorageMode::CiphertextOnly);
    }

    #[test]
    fn ciphertext_only_mode_removes_plaintext_content() {
        let persisted = persisted_content_for_mode(
            &StorageMode::CiphertextOnly,
            &json!({"secret": "message"}),
            &json!({
                "scheme": "omnyid-envelope-v1",
                "algorithm": "xchacha20poly1305-ietf",
                "nonce": "abc",
                "ciphertext": "def"
            }),
        );
        assert_eq!(persisted["omnyid_storage"]["mode"], "ciphertext_only");
        assert_eq!(persisted["omnyid_storage"]["plaintext_removed"], true);
    }

    #[test]
    fn ciphertext_only_mode_removes_plaintext_views() {
        let persisted = persisted_views_for_mode(
            &StorageMode::CiphertextOnly,
            &json!([{"format": "email", "content": {"body": "secret"}}]),
            &json!({
                "scheme": "omnyid-envelope-v1",
                "algorithm": "xchacha20poly1305-ietf",
                "nonce": "abc",
                "ciphertext": "def"
            }),
        );
        assert_eq!(persisted[0]["format"], "system");
        assert_eq!(persisted[0]["content"]["plaintext_removed"], true);
    }

    #[test]
    fn encrypted_messages_redact_views_on_read() {
        let redacted = redacted_views_for_read(
            &json!([{"format": "email", "content": {"body": "secret"}}]),
            &json!({
                "scheme": "omnyid-envelope-v1",
                "algorithm": "xchacha20poly1305-ietf",
                "nonce": "abc",
                "ciphertext": "def"
            }),
        );
        assert_eq!(redacted[0]["format"], "system");
        assert_eq!(redacted[0]["content"]["mode"], "ciphertext_only");
    }

    #[test]
    fn server_summarization_defaults_to_disabled() {
        unsafe {
            std::env::remove_var("OMNYID_ENABLE_SERVER_SUMMARIZATION");
        }
        assert!(!enable_server_summarization());
    }

    #[test]
    fn ciphertext_only_mode_disables_summary_generation() {
        let (summary, embedding) =
            summary_and_embedding_for_mode(&StorageMode::CiphertextOnly, &json!({"text": "hello"}));
        assert!(summary.is_none());
        assert!(embedding.is_none());
    }

    #[test]
    fn bootstrap_schema_contains_mail_sync_checkpoints_table() {
        let schema = include_str!("../postgres/migrations/0001_init.sql");
        assert!(schema.contains("CREATE TABLE IF NOT EXISTS mail_sync_checkpoints"));
    }

    #[test]
    fn tenant_schema_name_normalizes_user_ids() {
        assert_eq!(tenant_schema_name("01J8K9XYZ789"), "user_01j8k9xyz789");
        assert_eq!(
            tenant_schema_name("user:abc@omnyid.com"),
            "user_user_abc_omnyid_com"
        );
        assert_eq!(tenant_schema_name(""), "user_tenant");
    }

    #[test]
    fn tenant_private_schema_bootstrap_contains_core_private_tables() {
        let statements = tenant_private_schema_bootstrap_sql("user_test");
        let joined = statements.join("\n");
        assert!(joined.contains("CREATE SCHEMA IF NOT EXISTS \"user_test\""));
        assert!(joined.contains("\"user_test\".messages"));
        assert!(joined.contains("\"user_test\".attachments"));
        assert!(joined.contains("\"user_test\".agent_task_queue"));
        assert!(joined.contains("\"user_test\".agent_focus_items"));
        assert!(joined.contains("\"user_test\".agent_triggers"));
        assert!(joined.contains("\"user_test\".agent_delegations"));
        assert!(joined.contains("\"user_test\".agent_capability_registry"));
        assert!(joined.contains("\"user_test\".user_llm_config"));
        assert!(joined.contains("\"user_test\".llm_usage_log"));
        assert!(joined.contains("\"user_test\".saved_workflows"));
        assert!(joined.contains("\"user_test\".workflow_deployments"));
        assert!(joined.contains("\"user_test\".workflow_runs"));
        assert!(joined.contains("\"user_test\".workflow_wait_resume"));
        assert!(joined.contains("\"user_test\".sync_devices"));
        assert!(joined.contains("\"user_test\".personalization_events"));
        assert!(joined.contains("public.notify_new_message()"));
    }

    #[test]
    fn migration_list_starts_with_versioned_init_baseline() {
        assert_eq!(super::MIGRATIONS[0].0, "0001_init");
        assert!(
            super::MIGRATIONS[0]
                .2
                .contains("CREATE TABLE IF NOT EXISTS messages")
        );
    }

    #[test]
    fn migration_list_includes_workflow_state_baseline() {
        assert_eq!(super::MIGRATIONS[1].0, "0002_workflow_state");
        assert!(
            super::MIGRATIONS[1]
                .2
                .contains("CREATE TABLE IF NOT EXISTS outbound_email_receipts")
        );
        assert!(
            super::MIGRATIONS[1]
                .2
                .contains("CREATE TABLE IF NOT EXISTS integration_capabilities")
        );
        assert!(
            super::MIGRATIONS[1]
                .2
                .contains("CREATE TABLE IF NOT EXISTS personalization_events")
        );
    }

    #[test]
    fn migration_list_includes_accounts_baseline() {
        assert_eq!(super::MIGRATIONS[2].0, "0003_accounts");
        assert!(
            super::MIGRATIONS[2]
                .2
                .contains("CREATE TABLE IF NOT EXISTS users")
        );
        assert!(
            super::MIGRATIONS[2]
                .2
                .contains("CREATE TABLE IF NOT EXISTS managed_agents")
        );
    }

    #[test]
    fn migration_list_includes_runtime_deployments_baseline() {
        assert_eq!(super::MIGRATIONS[3].0, "0004_runtime_deployments");
        assert!(
            super::MIGRATIONS[3]
                .2
                .contains("CREATE TABLE IF NOT EXISTS runtime_deployments")
        );
    }

    #[test]
    fn migration_list_includes_user_onboarding_baseline() {
        assert_eq!(super::MIGRATIONS[4].0, "0005_user_onboarding");
        assert!(
            super::MIGRATIONS[4]
                .2
                .contains("CREATE TABLE IF NOT EXISTS user_onboarding")
        );
    }

    #[test]
    fn migration_list_includes_waitlist_submissions_baseline() {
        assert_eq!(super::MIGRATIONS[5].0, "0006_waitlist_submissions");
        assert!(
            super::MIGRATIONS[5]
                .2
                .contains("CREATE TABLE IF NOT EXISTS waitlist_submissions")
        );
    }

    #[test]
    fn migration_list_includes_support_access_baseline() {
        assert_eq!(super::MIGRATIONS[6].0, "0007_support_access");
        assert!(
            super::MIGRATIONS[6]
                .2
                .contains("CREATE TABLE IF NOT EXISTS support_access_grants")
        );
    }

    #[test]
    fn migration_list_includes_runtime_backups_baseline() {
        assert_eq!(super::MIGRATIONS[7].0, "0008_runtime_backups");
        assert!(
            super::MIGRATIONS[7]
                .2
                .contains("CREATE TABLE IF NOT EXISTS runtime_backup_policies")
        );
        assert!(
            super::MIGRATIONS[7]
                .2
                .contains("CREATE TABLE IF NOT EXISTS runtime_backups")
        );
    }

    #[test]
    fn migration_list_includes_runtime_restore_drills_baseline() {
        assert_eq!(super::MIGRATIONS[8].0, "0009_runtime_restore_drills");
        assert!(
            super::MIGRATIONS[8]
                .2
                .contains("CREATE TABLE IF NOT EXISTS runtime_restore_drills")
        );
    }

    #[test]
    fn migration_list_includes_runtime_update_policy_baseline() {
        assert_eq!(super::MIGRATIONS[9].0, "0010_runtime_update_policies");
        assert!(
            super::MIGRATIONS[9]
                .2
                .contains("CREATE TABLE IF NOT EXISTS runtime_update_policies")
        );
    }

    #[test]
    fn migration_list_includes_runtime_update_audit_baseline() {
        assert_eq!(super::MIGRATIONS[10].0, "0011_runtime_update_audit");
        assert!(
            super::MIGRATIONS[10]
                .2
                .contains("CREATE TABLE IF NOT EXISTS runtime_update_events")
        );
    }

    #[test]
    fn migration_list_includes_sync_device_policy_baseline() {
        assert_eq!(super::MIGRATIONS[11].0, "0012_sync_device_policies");
        assert!(
            super::MIGRATIONS[11]
                .2
                .contains("CREATE TABLE IF NOT EXISTS sync_device_policies")
        );
    }

    #[test]
    fn migration_list_includes_sync_device_tokens_baseline() {
        assert_eq!(super::MIGRATIONS[12].0, "0013_sync_device_tokens");
        assert!(
            super::MIGRATIONS[12]
                .2
                .contains("CREATE TABLE IF NOT EXISTS sync_device_tokens")
        );
    }

    #[test]
    fn migration_list_includes_runtime_runner_policy_events_baseline() {
        assert_eq!(super::MIGRATIONS[13].0, "0014_runtime_runner_policy_events");
        assert!(
            super::MIGRATIONS[13]
                .2
                .contains("CREATE TABLE IF NOT EXISTS runtime_runner_policy_events")
        );
    }

    #[test]
    fn external_email_lookup_query_remains_present() {
        let query = r#"
            SELECT m.thread_id, m.id
            FROM messages m
            CROSS JOIN LATERAL jsonb_array_elements(m."references") AS ref
            WHERE ref->>'type' = 'external_email'
              AND ref->>'target' = ANY($1)
            ORDER BY m.timestamp DESC
            LIMIT 1
            "#;
        assert!(query.contains("jsonb_array_elements"));
        assert!(query.contains("external_email"));
    }

    #[tokio::test]
    async fn local_postgres_tenant_private_workflow_round_trip() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_smoke_{suffix}"),
            email: format!("smoke-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Smoke {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create smoke user");

        let schema_name = tenant_schema_name(&user.id);
        let tenant_table_count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = $1
                AND table_name IN (
                  'agent_task_queue',
                  'agent_focus_items',
                  'agent_triggers',
                  'agent_delegations',
                  'agent_capability_registry',
                  'user_llm_config',
                  'llm_usage_log',
                  'saved_workflows',
                  'workflow_deployments',
                  'workflow_runs',
                  'workflow_wait_resume'
                )
              "#,
        )
        .bind(&schema_name)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant tables");
        assert_eq!(tenant_table_count, 11);

        let instance = AgentInstance::provision(&user.id, &format!("Smoke{suffix}"), "omnyid.test");
        let agent_instance_id = db
            .provision_agent(&instance)
            .await
            .expect("provision smoke agent");

        let task = AgentTask::new(
            user.id.clone(),
            agent_instance_id.clone(),
            "Plan the smoke test".to_string(),
            TaskPriority::Normal,
        );
        db.create_agent_task(&task).await.expect("create task");
        let tenant_task_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".agent_task_queue WHERE id = $1",
            schema_name
        ))
        .bind(&task.id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant task rows");
        assert_eq!(tenant_task_count, 1);
        let public_task_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM public.agent_task_queue WHERE id = $1")
                .bind(&task.id)
                .fetch_one(&db.pool)
                .await
                .expect("count public task rows");
        assert_eq!(public_task_count, 0);
        let listed_tasks = db
            .list_agent_tasks(&user.id, Some("pending"), 10)
            .await
            .expect("list pending tasks");
        assert!(listed_tasks.iter().any(|entry| entry["id"] == task.id));
        db.update_agent_task_status(
            &user.id,
            &task.id,
            "completed",
            Some(json!({"status": "done"})),
            None,
        )
        .await
        .expect("complete task");
        let task_detail = db
            .get_agent_task(&user.id, &task.id)
            .await
            .expect("get task detail");
        assert_eq!(task_detail["status"], "completed");
        assert_eq!(task_detail["result"]["status"], "done");

        let private_plan_trace = Message {
            protocol: "afp-v1".to_string(),
            id: format!("plan_trace_{suffix}"),
            thread_id: task.thread_id.clone(),
            parent_id: String::new(),
            from: instance.agent_id.clone(),
            to: vec![],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: "agent".to_string(),
            kind: None,
            content: String::new(),
            signature: "smoke-signature".to_string(),
            encryption: String::new(),
            views: String::new(),
            references: String::new(),
            attachments: String::new(),
            store_in_relational: true,
            subtype: "plan".to_string(),
            metadata: json!({
                "origin": "smoke_task_trace",
                "task_id": task.id,
                "legacy_type": "agent_plan"
            })
            .to_string(),
        };
        db.store_private_message(
            &user.id,
            &private_plan_trace,
            json!({
                "task_id": task.id,
                "intent": task.intent,
                "status": "pending"
            }),
        )
        .await
        .expect("store private task plan trace");

        let private_result_trace = Message {
            protocol: "afp-v1".to_string(),
            id: format!("result_trace_{suffix}"),
            thread_id: task.thread_id.clone(),
            parent_id: private_plan_trace.id.clone(),
            from: instance.agent_id.clone(),
            to: vec![],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: "agent".to_string(),
            kind: None,
            content: String::new(),
            signature: "smoke-signature".to_string(),
            encryption: String::new(),
            views: String::new(),
            references: String::new(),
            attachments: String::new(),
            store_in_relational: true,
            subtype: "result".to_string(),
            metadata: json!({
                "origin": "smoke_task_trace",
                "task_id": task.id,
                "legacy_type": "agent_result"
            })
            .to_string(),
        };
        db.store_private_message(
            &user.id,
            &private_result_trace,
            json!({
                "task_id": task.id,
                "status": "completed",
                "final_answer": "Smoke task completed successfully.",
                "result": {"status": "done"}
            }),
        )
        .await
        .expect("store private task result trace");
        let private_task_thread = db
            .get_private_thread(&user.id, &task.thread_id)
            .await
            .expect("get private task thread");
        assert!(
            private_task_thread
                .iter()
                .any(|message| message.id == private_plan_trace.id)
        );
        assert!(
            private_task_thread
                .iter()
                .any(|message| message.id == private_result_trace.id)
        );
        let tenant_private_trace_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".messages WHERE id = ANY($1)",
            schema_name
        ))
        .bind(vec![
            private_plan_trace.id.clone(),
            private_result_trace.id.clone(),
        ])
        .fetch_one(&db.pool)
        .await
        .expect("count tenant private task trace rows");
        assert_eq!(tenant_private_trace_count, 2);
        let public_private_trace_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM public.messages WHERE id = ANY($1)")
                .bind(vec![
                    private_plan_trace.id.clone(),
                    private_result_trace.id.clone(),
                ])
                .fetch_one(&db.pool)
                .await
                .expect("count public private task trace rows");
        assert_eq!(public_private_trace_count, 0);

        let focus = FocusItem::new(
            agent_instance_id.clone(),
            user.id.clone(),
            "Review smoke focus".to_string(),
        );
        db.create_focus_item(&focus)
            .await
            .expect("create focus item");
        let tenant_focus_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".agent_focus_items WHERE id = $1",
            schema_name
        ))
        .bind(&focus.id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant focus rows");
        assert_eq!(tenant_focus_count, 1);
        let public_focus_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM public.agent_focus_items WHERE id = $1")
                .bind(&focus.id)
                .fetch_one(&db.pool)
                .await
                .expect("count public focus rows");
        assert_eq!(public_focus_count, 0);
        let focus_items = db
            .list_focus_items(&user.id, &agent_instance_id)
            .await
            .expect("list focus items");
        assert!(focus_items.iter().any(|entry| entry["id"] == focus.id));
        db.update_focus_item_status(&user.id, &focus.id, "in_progress")
            .await
            .expect("update focus item");
        let focus_items = db
            .list_focus_items(&user.id, &agent_instance_id)
            .await
            .expect("list updated focus items");
        assert!(
            focus_items
                .iter()
                .any(|entry| entry["id"] == focus.id && entry["status"] == "in_progress")
        );

        let trigger = crate::agent_template::AgentTrigger::new(
            agent_instance_id.clone(),
            user.id.clone(),
            TriggerType::Scheduled,
            json!({"cron": "0 9 * * *"}),
        );
        db.create_trigger(&trigger).await.expect("create trigger");
        let tenant_trigger_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".agent_triggers WHERE id = $1",
            schema_name
        ))
        .bind(&trigger.id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant trigger rows");
        assert_eq!(tenant_trigger_count, 1);
        let public_trigger_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM public.agent_triggers WHERE id = $1")
                .bind(&trigger.id)
                .fetch_one(&db.pool)
                .await
                .expect("count public trigger rows");
        assert_eq!(public_trigger_count, 0);
        let triggers = db
            .list_triggers(&user.id, &agent_instance_id)
            .await
            .expect("list triggers");
        assert!(triggers.iter().any(|entry| entry["id"] == trigger.id));
        db.delete_trigger(&user.id, &trigger.id)
            .await
            .expect("delete trigger");
        let triggers = db
            .list_triggers(&user.id, &agent_instance_id)
            .await
            .expect("list triggers after delete");
        assert!(!triggers.iter().any(|entry| entry["id"] == trigger.id));

        let delegation = generate_delegated_key(
            &"0".repeat(64),
            "calendar.read",
            &task.id,
            600,
            &agent_instance_id,
            &user.id,
            vec![],
            vec![],
            None,
        );
        let delegation_id = delegation.id.clone();
        db.create_delegation(&delegation)
            .await
            .expect("create delegation");
        let tenant_delegation_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".agent_delegations WHERE id = $1",
            schema_name
        ))
        .bind(&delegation_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant delegation rows");
        assert_eq!(tenant_delegation_count, 1);
        let public_delegation_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM public.agent_delegations WHERE id = $1")
                .bind(&delegation_id)
                .fetch_one(&db.pool)
                .await
                .expect("count public delegation rows");
        assert_eq!(public_delegation_count, 0);
        let active_delegations = db
            .get_active_delegations(&user.id, &agent_instance_id)
            .await
            .expect("list active delegations");
        assert!(
            active_delegations
                .iter()
                .any(|entry| entry["id"] == delegation_id)
        );
        let delegation_detail = db
            .get_delegation_by_id(&user.id, &delegation_id)
            .await
            .expect("get delegation detail")
            .expect("delegation exists");
        assert_eq!(delegation_detail["scope"], "calendar.read");
        db.revoke_delegation(&user.id, &delegation_id)
            .await
            .expect("revoke delegation");
        let active_delegations = db
            .get_active_delegations(&user.id, &agent_instance_id)
            .await
            .expect("list active delegations after revoke");
        assert!(
            !active_delegations
                .iter()
                .any(|entry| entry["id"] == delegation_id)
        );

        let capability_id = db
            .create_capability(
                &user.id,
                &agent_instance_id,
                "calendar.read",
                &json!({
                    "description": "Read the calendar",
                    "input_schema": {"type": "object"},
                    "output_schema": {"type": "object"},
                    "version": "1.0.0",
                    "tags": ["calendar", "read"],
                    "approval_mode": "suggest_only"
                }),
            )
            .await
            .expect("create capability");
        let tenant_capability_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".agent_capability_registry WHERE id = $1",
            schema_name
        ))
        .bind(&capability_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant capability rows");
        assert_eq!(tenant_capability_count, 1);
        let public_capability_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM public.agent_capability_registry WHERE id = $1",
        )
        .bind(&capability_id)
        .fetch_one(&db.pool)
        .await
        .expect("count public capability rows");
        assert_eq!(public_capability_count, 0);
        let capabilities = db
            .list_capabilities(&user.id, &agent_instance_id)
            .await
            .expect("list capabilities");
        assert!(
            capabilities
                .iter()
                .any(|entry| entry["id"] == capability_id)
        );
        let card_caps = db
            .get_capabilities_for_agent_card(&agent_instance_id)
            .await
            .expect("get card capabilities");
        assert!(card_caps.iter().any(|entry| entry.name == "calendar.read"));
        let deleted = db
            .delete_capability(&user.id, &capability_id)
            .await
            .expect("delete capability");
        assert!(deleted);

        let mut llm_cfg = crate::agent_template::LlmConfig::default_hosted(user.id.clone());
        llm_cfg.provider = "anthropic".to_string();
        llm_cfg.model = "claude-haiku-4-5-20251001".to_string();
        llm_cfg.monthly_budget_cents = 900;
        db.upsert_llm_config(&llm_cfg)
            .await
            .expect("upsert llm config");
        let tenant_llm_cfg_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".user_llm_config WHERE owner_user_id = $1",
            schema_name
        ))
        .bind(&user.id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant llm config rows");
        assert_eq!(tenant_llm_cfg_count, 1);
        let public_llm_cfg_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM public.user_llm_config WHERE owner_user_id = $1",
        )
        .bind(&user.id)
        .fetch_one(&db.pool)
        .await
        .expect("count public llm config rows");
        assert_eq!(public_llm_cfg_count, 0);
        let llm_view = db
            .get_llm_config(&user.id)
            .await
            .expect("get llm config")
            .expect("llm config exists");
        assert_eq!(llm_view["monthly_budget_cents"], 900);
        db.record_llm_usage(&user.id, Some(&task.id), &llm_cfg.model, 120, 40, 33)
            .await
            .expect("record llm usage");
        let tenant_llm_usage_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".llm_usage_log WHERE owner_user_id = $1",
            schema_name
        ))
        .bind(&user.id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant llm usage rows");
        assert_eq!(tenant_llm_usage_count, 1);
        let public_llm_usage_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM public.llm_usage_log WHERE owner_user_id = $1",
        )
        .bind(&user.id)
        .fetch_one(&db.pool)
        .await
        .expect("count public llm usage rows");
        assert_eq!(public_llm_usage_count, 0);
        let llm_view = db
            .get_llm_config(&user.id)
            .await
            .expect("get llm config after usage")
            .expect("llm config exists after usage");
        assert_eq!(llm_view["usage_cents_current_month"], 33);

        let saved_workflow = SavedWorkflowRecord {
            workflow_id: format!("wf_{suffix}"),
            owner_user_id: user.id.clone(),
            title: "Smoke workflow".to_string(),
            description: Some("Tenant-local saved workflow smoke test".to_string()),
            favorite: true,
            preset_kinds: vec!["research_assistant".to_string()],
            graph_json: json!({
                "version": "omnyid-workflow.v1",
                "workflow_id": format!("wf_{suffix}"),
                "title": "Smoke workflow",
                "status": "draft",
                "environment": "dev",
                "owner_user_id": user.id,
                "root_node_ids": ["node_trigger"],
                "nodes": [
                    {
                        "id": "node_trigger",
                        "kind": "trigger",
                        "label": "Manual start",
                        "position": {"x": 0, "y": 0},
                        "inputs": [],
                        "outputs": [],
                        "policy": {
                            "mask": "private",
                            "approval_mode": "none",
                            "allowed_tools": [],
                            "allowed_capabilities": [],
                            "max_steps": 1,
                            "max_cost_cents": 0,
                            "outbound_allowlist": []
                        },
                        "metadata": {},
                        "hidden_runtime_nodes": [],
                        "config": {
                            "trigger_kind": "manual",
                            "event_filter": {}
                        }
                    }
                ],
                "edges": [],
                "presets": [],
                "optimization_mode": "balanced",
                "metadata": {}
            }),
            latest_ir_json: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            archived_at: None,
        };
        db.upsert_saved_workflow(&saved_workflow)
            .await
            .expect("save workflow");
        let listed_workflows = db
            .list_saved_workflows(&user.id, false, 10)
            .await
            .expect("list saved workflows");
        assert!(
            listed_workflows
                .iter()
                .any(|entry| entry["workflow_id"] == saved_workflow.workflow_id)
        );
        let workflow_detail = db
            .get_saved_workflow(&user.id, &saved_workflow.workflow_id)
            .await
            .expect("get saved workflow");
        assert_eq!(workflow_detail["title"], "Smoke workflow");
        let deployment = WorkflowDeploymentRecord {
            deployment_id: format!("wfdep_smoke_{suffix}"),
            workflow_id: saved_workflow.workflow_id.clone(),
            owner_user_id: user.id.clone(),
            environment: "dev".to_string(),
            status: "active".to_string(),
            ir_snapshot_json: json!({
                "version": "omnyid-workflow-ir.v1",
                "deployment_id": format!("wfdep_smoke_{suffix}")
            }),
            graph_snapshot_json: saved_workflow.graph_json.clone(),
            source_deployment_id: None,
            deployed_at: chrono::Utc::now().to_rfc3339(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.append_workflow_deployment(&deployment)
            .await
            .expect("append workflow deployment");
        let listed_deployments = db
            .list_workflow_deployments(&user.id, &saved_workflow.workflow_id, 10)
            .await
            .expect("list workflow deployments");
        assert_eq!(listed_deployments.len(), 1);
        assert_eq!(
            listed_deployments[0]["deployment_id"].as_str(),
            Some(deployment.deployment_id.as_str())
        );
        let run = WorkflowRunRecord {
            run_id: format!("wfrun_smoke_{suffix}"),
            workflow_id: saved_workflow.workflow_id.clone(),
            deployment_id: deployment.deployment_id.clone(),
            owner_user_id: user.id.clone(),
            status: "completed".to_string(),
            trigger_kind: "manual".to_string(),
            replay_of_run_id: None,
            timeline_json: json!([
                {
                    "node_id": "mf_start",
                    "runtime_kind": "goal_intake",
                    "status": "completed"
                }
            ]),
            result_json: json!({"summary": "Smoke run completed"}),
            started_at: chrono::Utc::now().to_rfc3339(),
            completed_at: Some(chrono::Utc::now().to_rfc3339()),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.append_workflow_run(&run)
            .await
            .expect("append workflow run");
        let listed_runs = db
            .list_workflow_runs(&user.id, &saved_workflow.workflow_id, 10)
            .await
            .expect("list workflow runs");
        assert_eq!(listed_runs.len(), 1);
        assert_eq!(listed_runs[0]["run_id"].as_str(), Some(run.run_id.as_str()));
        let wait_resume = WorkflowWaitResumeRecord {
            wait_resume_id: format!("wfwait_smoke_{suffix}"),
            workflow_id: saved_workflow.workflow_id.clone(),
            deployment_id: deployment.deployment_id.clone(),
            run_id: run.run_id.clone(),
            owner_user_id: user.id.clone(),
            manifest_node_id: "mf_review".to_string(),
            source_graph_node_id: "review".to_string(),
            status: "pending".to_string(),
            resume_family: "approval".to_string(),
            resume_kind: "human_approval".to_string(),
            wait_reason: Some("A manager must approve this workflow.".to_string()),
            scheduled_for: None,
            descriptor_json: json!({
                "resume_family": "approval",
                "resume_kind": "human_approval"
            }),
            created_at: chrono::Utc::now().to_rfc3339(),
            resumed_at: None,
        };
        db.append_workflow_wait_resume_record(&wait_resume)
            .await
            .expect("append workflow wait resume");
        let listed_wait_resume = db
            .list_workflow_wait_resume_records(
                &user.id,
                &saved_workflow.workflow_id,
                &run.run_id,
                10,
            )
            .await
            .expect("list workflow wait resume");
        assert_eq!(listed_wait_resume.len(), 1);
        assert_eq!(
            listed_wait_resume[0]["wait_resume_id"].as_str(),
            Some(wait_resume.wait_resume_id.as_str())
        );
        let tenant_saved_workflow_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".saved_workflows WHERE workflow_id = $1",
            schema_name
        ))
        .bind(&saved_workflow.workflow_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant saved workflow rows");
        assert_eq!(tenant_saved_workflow_count, 1);
        let tenant_workflow_deployment_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".workflow_deployments WHERE workflow_id = $1",
            schema_name
        ))
        .bind(&saved_workflow.workflow_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant workflow deployment rows");
        assert_eq!(tenant_workflow_deployment_count, 1);
        let tenant_workflow_run_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".workflow_runs WHERE workflow_id = $1",
            schema_name
        ))
        .bind(&saved_workflow.workflow_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant workflow run rows");
        assert_eq!(tenant_workflow_run_count, 1);
        let public_saved_workflow_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM public.saved_workflows WHERE workflow_id = $1",
        )
        .bind(&saved_workflow.workflow_id)
        .fetch_one(&db.pool)
        .await
        .unwrap_or(0);
        assert_eq!(public_saved_workflow_count, 0);
        let public_workflow_deployment_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM public.workflow_deployments WHERE workflow_id = $1",
        )
        .bind(&saved_workflow.workflow_id)
        .fetch_one(&db.pool)
        .await
        .unwrap_or(0);
        assert_eq!(public_workflow_deployment_count, 0);
        let public_workflow_run_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM public.workflow_runs WHERE workflow_id = $1")
                .bind(&saved_workflow.workflow_id)
                .fetch_one(&db.pool)
                .await
                .unwrap_or(0);
        assert_eq!(public_workflow_run_count, 0);

        let private_message = Message {
            protocol: "afp-v1".to_string(),
            id: format!("msg_{suffix}"),
            thread_id: format!("private-thread-{suffix}"),
            parent_id: String::new(),
            from: instance.agent_id.clone(),
            to: vec!["agent:peer@omnyid.test".to_string()],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: "agent".to_string(),
            kind: None,
            content: String::new(),
            signature: "smoke-signature".to_string(),
            encryption: String::new(),
            views: String::new(),
            references: String::new(),
            attachments: json!([{
                "id": format!("att_{suffix}"),
                "name": "brief.txt",
                "mime_type": "text/plain",
                "size_bytes": 12,
                "storage": {"kind": "inline"},
                "encryption": {}
            }])
            .to_string(),
            store_in_relational: false,
            subtype: "message".to_string(),
            metadata: json!({"scope": "private_smoke"}).to_string(),
        };
        db.store_private_message(&user.id, &private_message, json!({"body": "private hello"}))
            .await
            .expect("store private message");
        let private_thread = db
            .get_private_thread(&user.id, &private_message.thread_id)
            .await
            .expect("get private thread");
        assert_eq!(private_thread.len(), 1);
        assert_eq!(private_thread[0].id, private_message.id);
        let tenant_private_message_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".messages WHERE id = $1",
            schema_name
        ))
        .bind(&private_message.id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant private message rows");
        assert_eq!(tenant_private_message_count, 1);
        let public_private_message_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM public.messages WHERE id = $1")
                .bind(&private_message.id)
                .fetch_one(&db.pool)
                .await
                .expect("count public private message rows");
        assert_eq!(public_private_message_count, 0);
        let attachment_id = format!("att_{suffix}");
        let tenant_private_attachment_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\".attachments WHERE id = $1",
            schema_name
        ))
        .bind(&attachment_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant private attachment rows");
        assert_eq!(tenant_private_attachment_count, 1);
        let public_private_attachment_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM public.attachments WHERE id = $1")
                .bind(&attachment_id)
                .fetch_one(&db.pool)
                .await
                .expect("count public private attachment rows");
        assert_eq!(public_private_attachment_count, 0);
    }
}

#[cfg(test)]
#[path = "db/tests.rs"]
mod claim_neighborhood_tests;
