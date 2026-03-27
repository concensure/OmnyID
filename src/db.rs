use crate::afp::Message as ProtoMessage;
use crate::crypto::is_supported_encryption_envelope;
use crate::integration::{ActionResult, IntegrationCapability};
use crate::local_sync::{DeviceBootstrap, SyncSliceSpec};
use crate::personalization::{LoraArtifact, PersonalizationEvent};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgPool, Row};

#[derive(Clone)]
pub struct Db {
    pub pool: PgPool,
}

impl Db {
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPool::connect(database_url).await?;
        apply_migrations(&pool).await?;
        Ok(Db { pool })
    }

    pub async fn healthcheck(&self) -> Result<(), sqlx::Error> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    pub async fn ensure_user_private_schema(
        &self,
        user_id: &str,
    ) -> Result<String, sqlx::Error> {
        let schema = tenant_schema_name(user_id);
        let statements = tenant_private_schema_bootstrap_sql(&schema);
        let mut tx = self.pool.begin().await?;
        for statement in statements {
            sqlx::query(&statement).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(schema)
    }

    pub async fn store_message(
        &self,
        msg: &ProtoMessage,
        content_json: Value,
    ) -> Result<bool, sqlx::Error> {
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
                id, thread_id, parent_id, from_agent, to_agents, timestamp, type, content,
                views, summary, embedding, signature, encryption, "references", attachments,
                store_in_relational, subtype, metadata
            )
            VALUES (
                $1, $2, $3, $4, $5, $6::timestamptz, $7, $8,
                $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18
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
                id, thread_id, parent_id, from_agent, to_agents, timestamp, type, content,
                views, summary, embedding, signature, encryption, "references", attachments,
                store_in_relational, subtype, metadata
            )
            VALUES (
                $1, $2, $3, $4, $5, $6::timestamptz, $7, $8,
                $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18
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

        Ok(rows.into_iter().map(proto_message_from_row).collect())
    }

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

        Ok(row.map(|row| {
            let thread_id: String = row.try_get("thread_id").unwrap_or_default();
            let message_id: String = row.try_get("id").unwrap_or_default();
            (thread_id, message_id)
        }))
    }

    pub async fn record_outbound_delivery_attempt(
        &self,
        message_id: &str,
        thread_id: &str,
        provider: &str,
        status: &str,
        last_error: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO outbound_email_receipts (
                message_id, thread_id, provider, status, last_error
            )
            VALUES ($1, $2, $3, $4, $5)
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

        Ok(sync_device_policy_from_row(row))
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

        Ok(rows.into_iter().map(sync_device_policy_from_row).collect())
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

        Ok(row.map(sync_device_policy_from_row))
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

        Ok(row.map(sync_device_policy_from_row))
    }

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

        Ok(row.map(user_from_row))
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

        Ok(row.map(user_from_row))
    }

    pub async fn create_session(&self, session: &AuthSessionRecord) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO auth_sessions (token, user_id, created_at, expires_at)
            VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
            "#,
        )
        .bind(&session.token)
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
        .bind(token)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(session_from_row))
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

        Ok(rows.into_iter().map(session_from_row).collect())
    }

    pub async fn revoke_session(&self, user_id: &str, token: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            r#"
            DELETE FROM auth_sessions
            WHERE user_id = $1
              AND token = $2
            "#,
        )
        .bind(user_id)
        .bind(token)
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
        .bind(current_token)
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

        Ok(rows.into_iter().map(managed_agent_from_row).collect())
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

        Ok(rows.into_iter().map(proto_message_from_row).collect())
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

        Ok(rows.into_iter().map(action_audit_entry_from_row).collect())
    }

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

        Ok(row.map(runtime_deployment_from_row))
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

        Ok(row.map(runtime_deployment_from_row))
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

        Ok(runtime_update_policy_from_row(row))
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

        Ok(row.map(runtime_update_policy_from_row))
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
            .collect())
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
            .collect())
    }

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

        Ok(row.map(user_onboarding_from_row))
    }

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

        Ok(support_access_grant_from_row(row))
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

        Ok(row.map(support_access_grant_from_row))
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

        Ok(row.map(support_access_grant_from_row))
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
            .collect())
    }

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

        Ok(runtime_backup_policy_from_row(row))
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

        Ok(row.map(runtime_backup_policy_from_row))
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

        Ok(rows.into_iter().map(runtime_backup_from_row).collect())
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

        Ok(row.map(runtime_backup_from_row))
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

        Ok(row.map(runtime_backup_from_row))
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

        Ok(rows.into_iter().map(runtime_backup_from_row).collect())
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
            .collect())
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

    /// Provision an agent instance for a new user account.
    /// Idempotent: if the user already has an instance, returns its ID without error.
    pub async fn provision_agent(
        &self,
        instance: &crate::agent_template::AgentInstance,
    ) -> Result<String, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(&instance.owner_user_id)
            .execute(&mut *tx)
            .await?;
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
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(id)
    }

    pub async fn get_agent_instance(
        &self,
        owner_user_id: &str,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(owner_user_id)
            .execute(&mut *tx)
            .await?;
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
        .fetch_optional(&mut *tx)
        .await?;
        tx.commit().await?;
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

    pub async fn append_workflow_run(
        &self,
        record: &WorkflowRunRecord,
    ) -> Result<(), sqlx::Error> {
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
        .bind(&cfg.encrypted_api_key)
        .bind(&cfg.ollama_url)
        .bind(cfg.monthly_budget_cents)
        .bind(cfg.usage_cents_current_month)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_llm_config(
        &self,
        owner_user_id: &str,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        let config_table = tenant_user_llm_config_table(owner_user_id);
        // Reset monthly usage if a new month has started before reading
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
        let row = sqlx::query(&format!(
            r#"
            SELECT id, backend, provider, model, ollama_url,
                   monthly_budget_cents, usage_cents_current_month,
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

    pub async fn record_llm_usage(
        &self,
        owner_user_id: &str,
        agent_task_id: Option<&str>,
        model: &str,
        tokens_input: i32,
        tokens_output: i32,
        cost_cents: i32,
    ) -> Result<(), sqlx::Error> {
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
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(owner_user_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            r#"
            UPDATE agent_instances
            SET priority_rules_json = $2, updated_at = NOW()
            WHERE owner_user_id = $1
            "#,
        )
        .bind(owner_user_id)
        .bind(rules)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
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
        Ok(row.map(|r| r.try_get::<String, _>("challenge").unwrap_or_default()))
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
            .map(|r| crate::webauthn::StoredCredential {
                credential_id: r.try_get("credential_id").unwrap_or_default(),
                user_id: r.try_get("user_id").unwrap_or_default(),
                public_key_cbor: r.try_get("public_key_cbor").unwrap_or_default(),
                sign_count: r.try_get::<i64, _>("sign_count").unwrap_or(0) as u32,
                aaguid: r.try_get("aaguid").unwrap_or_default(),
                device_type: r.try_get("device_type").unwrap_or_default(),
                created_at: r.try_get("created_at").unwrap_or_default(),
            })
            .collect();
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
        Ok(row.map(|r| crate::webauthn::StoredCredential {
            credential_id: r.try_get("credential_id").unwrap_or_default(),
            user_id: r.try_get("user_id").unwrap_or_default(),
            public_key_cbor: r.try_get("public_key_cbor").unwrap_or_default(),
            sign_count: r.try_get::<i64, _>("sign_count").unwrap_or(0) as u32,
            aaguid: r.try_get("aaguid").unwrap_or_default(),
            device_type: r.try_get("device_type").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
        }))
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
        .bind(&token)
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

    pub async fn delete_trigger(&self, owner_user_id: &str, id: &str) -> Result<(), sqlx::Error> {
        let table = tenant_agent_triggers_table(owner_user_id);
        let result = sqlx::query(&format!("DELETE FROM {table} WHERE owner_user_id = $2 AND id = $1"))
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
        sqlx::query(&format!(
            r#"
            INSERT INTO {table}
                (id, master_instance_id, owner_user_id, scope, mask,
                 delegated_key_hex, expires_at, task_id, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
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
            "SELECT owner_user_id FROM agent_instances WHERE id = $1"
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
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(follower_user_id)
            .execute(&mut *tx)
            .await?;
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
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn unfollow_agent(
        &self,
        follower_user_id: &str,
        followed_agent_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(follower_user_id)
            .execute(&mut *tx)
            .await?;
        let result = sqlx::query(
            "DELETE FROM agent_follows WHERE follower_user_id = $1 AND followed_agent_id = $2",
        )
        .bind(follower_user_id)
        .bind(followed_agent_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn list_following(
        &self,
        follower_user_id: &str,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(follower_user_id)
            .execute(&mut *tx)
            .await?;
        let rows = sqlx::query(
            r#"
            SELECT followed_agent_id, created_at::text AS created_at
            FROM agent_follows
            WHERE follower_user_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(follower_user_id)
        .fetch_all(&mut *tx)
        .await?;
        tx.commit().await?;
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
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
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
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
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
        query: &str,
        limit: i64,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        // Full-text search over agent_instances system_prompt and capability names/descriptions.
        let rows = sqlx::query(
            r#"
            SELECT DISTINCT
                ai.id,
                ai.agent_id,
                ai.name,
                ai.status,
                ai.system_prompt
            FROM agent_instances ai
            LEFT JOIN agent_capability_registry acr ON acr.agent_instance_id = ai.id
            WHERE ai.status = 'active'
              AND (
                to_tsvector('english', COALESCE(ai.system_prompt, ''))
                  @@ plainto_tsquery('english', $1)
                OR to_tsvector('english',
                     COALESCE(acr.name, '') || ' ' || COALESCE(acr.description, ''))
                  @@ plainto_tsquery('english', $1)
              )
            ORDER BY ai.created_at DESC
            LIMIT $2
            "#,
        )
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
        owner_user_id: &str,
        agent_instance_id: &str,
        soul_md: &str,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(owner_user_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE agent_instances SET soul_md = $1, updated_at = NOW() WHERE id = $2")
            .bind(soul_md)
            .bind(agent_instance_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn update_agent_memory(
        &self,
        owner_user_id: &str,
        agent_instance_id: &str,
        memory_md: &str,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(owner_user_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE agent_instances SET memory_md = $1, updated_at = NOW() WHERE id = $2")
            .bind(memory_md)
            .bind(agent_instance_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    // ── LoRA confidence / takeover ────────────────────────────────────────────

    pub async fn update_lora_confidence(
        &self,
        owner_user_id: &str,
        agent_instance_id: &str,
        score: f64,
    ) -> Result<bool, sqlx::Error> {
        let active = score >= crate::agent_template::LORA_TAKEOVER_THRESHOLD;
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(owner_user_id)
            .execute(&mut *tx)
            .await?;
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
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(active)
    }

    // ── Public feed (Plaza equivalent) ───────────────────────────────────────

    pub async fn list_public_messages(
        &self,
        limit: i64,
        before_id: Option<&str>,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
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
                ORDER BY created_at DESC LIMIT $2
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
                ORDER BY created_at DESC LIMIT $1
                "#,
            )
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows.iter().map(|r| serde_json::json!({
            "id": r.try_get::<String, _>("id").unwrap_or_default(),
            "thread_id": r.try_get::<String, _>("thread_id").unwrap_or_default(),
            "from_agent": r.try_get::<String, _>("from_agent").unwrap_or_default(),
            "to_agents": r.try_get::<serde_json::Value, _>("to_agents").unwrap_or(serde_json::json!([])),
            "type": r.try_get::<String, _>("type").unwrap_or_default(),
            "content": r.try_get::<serde_json::Value, _>("content").unwrap_or(serde_json::json!({})),
            "references": r.try_get::<serde_json::Value, _>("references").unwrap_or(serde_json::json!([])),
            "views": r.try_get::<serde_json::Value, _>("views").unwrap_or(serde_json::json!([])),
            "timestamp": r.try_get::<String, _>("timestamp").unwrap_or_default(),
            "signature": r.try_get::<String, _>("signature").unwrap_or_default(),
            "encryption": r.try_get::<serde_json::Value, _>("encryption").ok(),
        })).collect())
    }

    // ── Agent instance with new fields ────────────────────────────────────────

    pub async fn save_master_agent_instance(
        &self,
        instance: &crate::agent_template::AgentInstance,
    ) -> Result<String, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(&instance.owner_user_id)
            .execute(&mut *tx)
            .await?;
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
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(id)
    }

    pub async fn get_master_agent_instance(
        &self,
        owner_user_id: &str,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(owner_user_id)
            .execute(&mut *tx)
            .await?;
        let row = sqlx::query(
            r#"
            SELECT id, agent_id, name, status, system_prompt,
                   priority_rules_json, soul_md, memory_md,
                   is_master, max_sub_agents, ephemeral,
                   expires_at::text,
                   lora_confidence_score, lora_genome_active,
                   created_at::text, updated_at::text
            FROM agent_instances
            WHERE owner_user_id = $1 AND is_master = TRUE
            LIMIT 1
            "#,
        )
        .bind(owner_user_id)
        .fetch_optional(&mut *tx)
        .await?;
        tx.commit().await?;
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
                "created_at": r.get::<String, _>("created_at"),
                "updated_at": r.get::<String, _>("updated_at"),
            })
        }))
    }

    pub async fn store_gmail_token(
        &self,
        user_id: &str,
        access_token: &str,
        refresh_token: &str,
        gmail_email: &str,
        expiry_iso: Option<String>,
    ) -> Result<(), sqlx::Error> {
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
        .bind(access_token)
        .bind(refresh_token)
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
            serde_json::json!({
                "access_token": r.get::<String, _>("access_token"),
                "refresh_token": r.get::<String, _>("refresh_token"),
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
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(owner_user_id)
            .execute(&mut *tx)
            .await?;
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
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(serde_json::json!({
            "id": row.try_get::<String,_>("id").unwrap_or_default(),
            "title": row.try_get::<String,_>("title").unwrap_or_default(),
            "description": row.try_get::<Option<String>,_>("description").ok().flatten(),
            "start_at": row.try_get::<String,_>("start_at").unwrap_or_default(),
            "end_at": row.try_get::<Option<String>,_>("end_at").ok().flatten(),
            "all_day": row.try_get::<bool,_>("all_day").unwrap_or(false),
            "location": row.try_get::<Option<String>,_>("location").ok().flatten(),
            "status": row.try_get::<String,_>("status").unwrap_or_else(|_| "confirmed".to_string()),
            "created_at": row.try_get::<String,_>("created_at").unwrap_or_default(),
        }))
    }

    pub async fn list_calendar_events_in_range(
        &self,
        owner_user_id: &str,
        range_start: &str,
        range_end: &str,
    ) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(owner_user_id)
            .execute(&mut *tx)
            .await?;
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
        .fetch_all(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(rows.iter().map(|r| serde_json::json!({
            "id": r.try_get::<String,_>("id").unwrap_or_default(),
            "title": r.try_get::<String,_>("title").unwrap_or_default(),
            "description": r.try_get::<Option<String>,_>("description").ok().flatten(),
            "start_at": r.try_get::<String,_>("start_at").unwrap_or_default(),
            "end_at": r.try_get::<Option<String>,_>("end_at").ok().flatten(),
            "all_day": r.try_get::<bool,_>("all_day").unwrap_or(false),
            "location": r.try_get::<Option<String>,_>("location").ok().flatten(),
            "status": r.try_get::<String,_>("status").unwrap_or_else(|_| "confirmed".to_string()),
        })).collect())
    }

    pub async fn delete_calendar_event(
        &self,
        owner_user_id: &str,
        event_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(owner_user_id)
            .execute(&mut *tx)
            .await?;
        let result = sqlx::query(
            r#"UPDATE calendar_events SET status = 'cancelled', updated_at = NOW()
               WHERE id = $1 AND owner_user_id = $2"#,
        )
        .bind(event_id)
        .bind(owner_user_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
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

        Ok(row.map(|r| AliasRecord {
            alias: r.try_get("alias").unwrap_or_default(),
            agent_id: r.try_get("agent_id").unwrap_or_default(),
            user_id: r.try_get("user_id").unwrap_or_default(),
            created_at: r.try_get("created_at").unwrap_or_default(),
            updated_at: r.try_get("updated_at").unwrap_or_default(),
            last_changed_at: r.try_get("last_changed_at").unwrap_or_default(),
        }))
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
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        let row = sqlx::query(
            r#"
            SELECT optimization_mode, auto_confirm_threshold_cents, show_cost_estimates
            FROM user_agent_preferences
            WHERE owner_user_id = $1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await?;
        tx.commit().await?;

        use sqlx::Row;
        Ok(row.map(|r| {
            serde_json::json!({
                "optimization_mode":             r.get::<String, _>("optimization_mode"),
                "auto_confirm_threshold_cents":  r.get::<f64, _>("auto_confirm_threshold_cents"),
                "show_cost_estimates":           r.get::<bool, _>("show_cost_estimates"),
            })
        }))
    }

    pub async fn upsert_agent_preferences(
        &self,
        user_id: &str,
        optimization_mode: &str,
        auto_confirm_threshold_cents: f64,
        show_cost_estimates: bool,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            r#"
            INSERT INTO user_agent_preferences
                (owner_user_id, optimization_mode, auto_confirm_threshold_cents, show_cost_estimates, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT (owner_user_id) DO UPDATE SET
                optimization_mode             = EXCLUDED.optimization_mode,
                auto_confirm_threshold_cents  = EXCLUDED.auto_confirm_threshold_cents,
                show_cost_estimates           = EXCLUDED.show_cost_estimates,
                updated_at                    = NOW()
            "#,
        )
        .bind(user_id)
        .bind(optimization_mode)
        .bind(auto_confirm_threshold_cents)
        .bind(show_cost_estimates)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }
}

const MIGRATIONS: [(&str, &str, &str); 26] = [
    (
        "0001_init",
        "Initial Omnyid schema baseline",
        include_str!("../postgres/migrations/0001_init.sql"),
    ),
    (
        "0002_workflow_state",
        "Workflow state, delivery receipts, sync devices, and personalization tables",
        include_str!("../postgres/migrations/0002_workflow_state.sql"),
    ),
    (
        "0003_accounts",
        "User accounts, sessions, and managed agent records",
        include_str!("../postgres/migrations/0003_accounts.sql"),
    ),
    (
        "0004_runtime_deployments",
        "Per-user runtime deployment records for isolated agent frameworks",
        include_str!("../postgres/migrations/0004_runtime_deployments.sql"),
    ),
    (
        "0005_user_onboarding",
        "Persisted onboarding state for account setup and gated runtime deployment",
        include_str!("../postgres/migrations/0005_user_onboarding.sql"),
    ),
    (
        "0006_waitlist_submissions",
        "Persisted waitlist submissions with delivery fallback state",
        include_str!("../postgres/migrations/0006_waitlist_submissions.sql"),
    ),
    (
        "0007_support_access",
        "Support access grants with time-limited consent and revoke support",
        include_str!("../postgres/migrations/0007_support_access.sql"),
    ),
    (
        "0008_runtime_backups",
        "Hosted runtime backup metadata, retention policy, and snapshot inventory",
        include_str!("../postgres/migrations/0008_runtime_backups.sql"),
    ),
    (
        "0009_runtime_restore_drills",
        "Runtime restore drill records for backup rehearsal and audit history",
        include_str!("../postgres/migrations/0009_runtime_restore_drills.sql"),
    ),
    (
        "0010_runtime_update_policies",
        "Hosted runtime update policies for scaffold refresh checks and manual apply control",
        include_str!("../postgres/migrations/0010_runtime_update_policies.sql"),
    ),
    (
        "0011_runtime_update_audit",
        "Hosted runtime update check and apply audit events",
        include_str!("../postgres/migrations/0011_runtime_update_audit.sql"),
    ),
    (
        "0012_sync_device_policies",
        "Per-device sync policy registry for local-first clients",
        include_str!("../postgres/migrations/0012_sync_device_policies.sql"),
    ),
    (
        "0013_sync_device_tokens",
        "Per-device sync access tokens for local-first client boundaries",
        include_str!("../postgres/migrations/0013_sync_device_tokens.sql"),
    ),
    (
        "0014_runtime_runner_policy_events",
        "Metadata-only audit history for hosted Python runner policy changes",
        include_str!("../postgres/migrations/0014_runtime_runner_policy_events.sql"),
    ),
    (
        "0015_peer_key_cache",
        "Durable peer key cache and key rotation audit for Phase 2 key lifecycle",
        include_str!("../postgres/migrations/0015_peer_key_cache.sql"),
    ),
    (
        "0016_billing",
        "Billing subscriptions and Stripe webhook event history for Phase 12 cloud tier",
        include_str!("../postgres/migrations/0016_billing.sql"),
    ),
    (
        "0017_agent_template",
        "Per-user agent instances, task queue, LLM config, and usage log with RLS",
        include_str!("../postgres/migrations/0017_agent_template.sql"),
    ),
    (
        "0018_webauthn",
        "Passkey credentials and ephemeral challenges for WebAuthn/passkey authentication",
        include_str!("../postgres/migrations/0018_webauthn.sql"),
    ),
    (
        "0019_master_agent",
        "Master agent orchestration: soul/memory, ephemeral agents, LoRA, focus items, triggers, delegations",
        include_str!("../postgres/migrations/0019_master_agent.sql"),
    ),
    (
        "0020_gmail_tokens",
        "Per-user Gmail OAuth token storage",
        include_str!("../postgres/migrations/0020_gmail_tokens.sql"),
    ),
    (
        "0021_capability_registry",
        "Structured capability descriptors for agent AgentCard and Python SDK @capability decorator",
        include_str!("../postgres/migrations/0021_capability_registry.sql"),
    ),
    (
        "0022_follow_engage",
        "Agent follow subscriptions and feed engagement metrics",
        include_str!("../postgres/migrations/0022_follow_engage.sql"),
    ),
    (
        "0023_llm_runpod_calendar",
        "Add runpod backend to LLM config check constraint + calendar_events table",
        include_str!("../postgres/migrations/0023_llm_runpod_calendar.sql"),
    ),
    (
        "0024_aliases",
        "Global agent alias registry with uniqueness, format constraints, and 30-day change cooldown",
        include_str!("../postgres/migrations/0024_aliases.sql"),
    ),
    (
        "0025_agent_preferences",
        "Per-user agent optimization preferences (optimization_mode, auto_confirm_threshold, show_cost_estimates)",
        include_str!("../postgres/migrations/0025_agent_preferences.sql"),
    ),
    (
        "0026_message_taxonomy",
        "Optional subtype and metadata columns for broad stable AFP message taxonomy",
        include_str!("../postgres/migrations/0026_message_taxonomy.sql"),
    ),
];

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

async fn apply_migrations(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::raw_sql(
        r#"
        CREATE TABLE IF NOT EXISTS omnyid_schema_migrations (
            version TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await?;

    for (version, description, sql) in MIGRATIONS {
        let already_applied = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM omnyid_schema_migrations WHERE version = $1",
        )
        .bind(version)
        .fetch_one(pool)
        .await?;

        if already_applied > 0 {
            continue;
        }

        sqlx::raw_sql(sql).execute(pool).await?;
        sqlx::query(
            r#"
            INSERT INTO omnyid_schema_migrations (version, description)
            VALUES ($1, $2)
            ON CONFLICT (version) DO NOTHING
            "#,
        )
        .bind(version)
        .bind(description)
        .execute(pool)
        .await?;
    }

    Ok(())
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
    format!("\"{}\".agent_capability_registry", tenant_schema_name(user_id))
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

fn proto_message_from_row(row: sqlx::postgres::PgRow) -> ProtoMessage {
    let encryption = row
        .try_get::<Option<Value>, _>("encryption")
        .unwrap_or(None)
        .unwrap_or_else(|| Value::Object(Default::default()));
    let views = row
        .try_get::<Value, _>("views")
        .unwrap_or_else(|_| Value::Array(vec![]));

    ProtoMessage {
        protocol: "afp-v1".to_string(),
        id: row.try_get("id").unwrap_or_default(),
        thread_id: row.try_get("thread_id").unwrap_or_default(),
        parent_id: row
            .try_get::<Option<String>, _>("parent_id")
            .unwrap_or_default()
            .unwrap_or_default(),
        from: row.try_get("from_agent").unwrap_or_default(),
        to: serde_json::from_value(row.try_get("to_agents").unwrap_or(Value::Array(vec![])))
            .unwrap_or_default(),
        timestamp: row.try_get("timestamp").unwrap_or_default(),
        r#type: row.try_get("type").unwrap_or_default(),
        content: row
            .try_get::<Value, _>("content")
            .unwrap_or_else(|_| Value::Object(Default::default()))
            .to_string(),
        signature: row.try_get("signature").unwrap_or_default(),
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
    }
}

fn user_from_row(row: sqlx::postgres::PgRow) -> UserRecord {
    UserRecord {
        id: row.try_get("id").unwrap_or_default(),
        email: row.try_get("email").unwrap_or_default(),
        password_hash: row.try_get("password_hash").unwrap_or(None),
        auth_provider: row.try_get("auth_provider").unwrap_or_default(),
        google_sub: row.try_get("google_sub").unwrap_or(None),
        display_name: row.try_get("display_name").unwrap_or_default(),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }
}

fn session_from_row(row: sqlx::postgres::PgRow) -> AuthSessionRecord {
    AuthSessionRecord {
        token: row.try_get("token").unwrap_or_default(),
        user_id: row.try_get("user_id").unwrap_or_default(),
        created_at: row.try_get("created_at").unwrap_or_default(),
        expires_at: row.try_get("expires_at").unwrap_or_default(),
    }
}

fn managed_agent_from_row(row: sqlx::postgres::PgRow) -> ManagedAgentRecord {
    ManagedAgentRecord {
        id: row.try_get("id").unwrap_or_default(),
        owner_user_id: row.try_get("owner_user_id").unwrap_or_default(),
        agent_id: row.try_get("agent_id").unwrap_or_default(),
        label: row.try_get("label").unwrap_or_default(),
        email: row.try_get("email").unwrap_or_default(),
        kind: row.try_get("kind").unwrap_or_default(),
        created_at: row.try_get("created_at").unwrap_or_default(),
        metadata: row
            .try_get("metadata")
            .unwrap_or_else(|_| Value::Object(Default::default())),
    }
}

fn action_audit_entry_from_row(row: sqlx::postgres::PgRow) -> ActionAuditEntry {
    ActionAuditEntry {
        capability_id: row.try_get("capability_id").unwrap_or_default(),
        thread_id: row.try_get("thread_id").unwrap_or_default(),
        status: row.try_get("status").unwrap_or_default(),
        output: row
            .try_get("output")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        external_reference: row.try_get("external_reference").unwrap_or(None),
        recorded_at: row.try_get("recorded_at").unwrap_or_default(),
    }
}

fn runtime_deployment_from_row(row: sqlx::postgres::PgRow) -> RuntimeDeploymentRecord {
    RuntimeDeploymentRecord {
        id: row.try_get("id").unwrap_or_default(),
        owner_user_id: row.try_get("owner_user_id").unwrap_or_default(),
        framework: row.try_get("framework").unwrap_or_default(),
        gui: row.try_get("gui").unwrap_or(None),
        status: row.try_get("status").unwrap_or_default(),
        python_version: row.try_get("python_version").unwrap_or_default(),
        image_ref: row.try_get("image_ref").unwrap_or_default(),
        runtime_token: row.try_get("runtime_token").unwrap_or_default(),
        workspace_path: row.try_get("workspace_path").unwrap_or_default(),
        config_json: row
            .try_get("config_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }
}

fn user_onboarding_from_row(row: sqlx::postgres::PgRow) -> UserOnboardingRecord {
    UserOnboardingRecord {
        owner_user_id: row.try_get("owner_user_id").unwrap_or_default(),
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
        updated_at: row.try_get("updated_at").unwrap_or_default(),
        completed_at: row.try_get("completed_at").unwrap_or(None),
    }
}

fn support_access_grant_from_row(row: sqlx::postgres::PgRow) -> SupportAccessGrantRecord {
    SupportAccessGrantRecord {
        id: row.try_get("id").unwrap_or_default(),
        owner_user_id: row.try_get("owner_user_id").unwrap_or_default(),
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
        granted_at: row.try_get("granted_at").unwrap_or_default(),
        expires_at: row.try_get("expires_at").unwrap_or_default(),
        revoked_at: row.try_get("revoked_at").unwrap_or(None),
    }
}

fn runtime_backup_policy_from_row(row: sqlx::postgres::PgRow) -> RuntimeBackupPolicyRecord {
    RuntimeBackupPolicyRecord {
        owner_user_id: row.try_get("owner_user_id").unwrap_or_default(),
        retention_days: row.try_get("retention_days").unwrap_or(14),
        storage_mode: row
            .try_get::<Option<String>, _>("storage_mode")
            .unwrap_or(Some("metadata_only_hosted".to_string()))
            .unwrap_or_else(|| "metadata_only_hosted".to_string()),
        last_snapshot_at: row.try_get("last_snapshot_at").unwrap_or(None),
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }
}

fn runtime_backup_from_row(row: sqlx::postgres::PgRow) -> RuntimeBackupRecord {
    RuntimeBackupRecord {
        id: row.try_get("id").unwrap_or_default(),
        owner_user_id: row.try_get("owner_user_id").unwrap_or_default(),
        runtime_deployment_id: row.try_get("runtime_deployment_id").unwrap_or(None),
        snapshot_type: row.try_get("snapshot_type").unwrap_or_default(),
        storage_mode: row
            .try_get::<Option<String>, _>("storage_mode")
            .unwrap_or(Some("metadata_only_hosted".to_string()))
            .unwrap_or_else(|| "metadata_only_hosted".to_string()),
        status: row.try_get("status").unwrap_or_default(),
        file_count: row.try_get("file_count").unwrap_or_default(),
        total_workspace_bytes: row.try_get("total_workspace_bytes").unwrap_or_default(),
        artifact_size_bytes: row.try_get("artifact_size_bytes").unwrap_or_default(),
        artifact_path: row.try_get("artifact_path").unwrap_or(None),
        manifest_json: row
            .try_get("manifest_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        created_at: row.try_get("created_at").unwrap_or_default(),
        expires_at: row.try_get("expires_at").unwrap_or_default(),
    }
}

fn runtime_restore_drill_from_row(row: sqlx::postgres::PgRow) -> RuntimeRestoreDrillRecord {
    RuntimeRestoreDrillRecord {
        id: row.try_get("id").unwrap_or_default(),
        owner_user_id: row.try_get("owner_user_id").unwrap_or_default(),
        backup_id: row.try_get("backup_id").unwrap_or_default(),
        status: row.try_get("status").unwrap_or_default(),
        notes_json: row
            .try_get("notes_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        started_at: row.try_get("started_at").unwrap_or_default(),
        completed_at: row.try_get("completed_at").unwrap_or(None),
    }
}

fn runtime_update_policy_from_row(row: sqlx::postgres::PgRow) -> RuntimeUpdatePolicyRecord {
    RuntimeUpdatePolicyRecord {
        owner_user_id: row.try_get("owner_user_id").unwrap_or_default(),
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
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }
}

fn runtime_update_event_from_row(row: sqlx::postgres::PgRow) -> RuntimeUpdateEventRecord {
    RuntimeUpdateEventRecord {
        id: row.try_get("id").unwrap_or_default(),
        owner_user_id: row.try_get("owner_user_id").unwrap_or_default(),
        runtime_deployment_id: row.try_get("runtime_deployment_id").unwrap_or(None),
        action: row.try_get("action").unwrap_or_default(),
        from_version: row.try_get("from_version").unwrap_or(None),
        to_version: row.try_get("to_version").unwrap_or(None),
        status: row.try_get("status").unwrap_or_default(),
        notes_json: row
            .try_get("notes_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }
}

fn runtime_runner_policy_event_from_row(
    row: sqlx::postgres::PgRow,
) -> RuntimeRunnerPolicyEventRecord {
    RuntimeRunnerPolicyEventRecord {
        id: row.try_get("id").unwrap_or_default(),
        owner_user_id: row.try_get("owner_user_id").unwrap_or_default(),
        runtime_deployment_id: row.try_get("runtime_deployment_id").unwrap_or(None),
        event_kind: row.try_get("event_kind").unwrap_or_default(),
        summary_json: row
            .try_get("summary_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        created_at: row.try_get("created_at").unwrap_or_default(),
    }
}

fn sync_device_policy_from_row(row: sqlx::postgres::PgRow) -> SyncDevicePolicyRecord {
    SyncDevicePolicyRecord {
        device_id: row.try_get("device_id").unwrap_or_default(),
        owner_user_id: row.try_get("owner_user_id").unwrap_or_default(),
        agent_id: row.try_get("agent_id").unwrap_or_default(),
        device_class: row.try_get("device_class").unwrap_or_default(),
        policy_profile: row.try_get("policy_profile").unwrap_or_default(),
        sync_slices: row
            .try_get("sync_slices")
            .unwrap_or_else(|_| Value::Array(vec![])),
        requires_local_key_material: row.try_get("requires_local_key_material").unwrap_or(false),
        notes_json: row
            .try_get("notes_json")
            .unwrap_or_else(|_| Value::Object(Default::default())),
        last_bundle_at: row.try_get("last_bundle_at").unwrap_or_default(),
        last_used_at: row.try_get("last_used_at").unwrap_or(None),
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }
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
    persist_attachment_metadata_to_table(pool, "attachments", message_id, thread_id, attachments_json)
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
        Db, SavedWorkflowRecord, StorageMode, UserRecord, WorkflowDeploymentRecord, WorkflowRunRecord, effective_storage_mode, enable_server_summarization,
        persisted_content_for_mode, persisted_views_for_mode, redacted_views_for_read,
        summary_and_embedding_for_mode, tenant_private_schema_bootstrap_sql,
        tenant_schema_name,
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
                  'workflow_runs'
                )
              "#,
          )
        .bind(&schema_name)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant tables");
          assert_eq!(tenant_table_count, 10);

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
        assert!(private_task_thread
            .iter()
            .any(|message| message.id == private_plan_trace.id));
        assert!(private_task_thread
            .iter()
            .any(|message| message.id == private_result_trace.id));
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
        db.create_focus_item(&focus).await.expect("create focus item");
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
        assert!(focus_items
            .iter()
            .any(|entry| entry["id"] == focus.id && entry["status"] == "in_progress"));

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
        assert!(active_delegations
            .iter()
            .any(|entry| entry["id"] == delegation_id));
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
        assert!(!active_delegations
            .iter()
            .any(|entry| entry["id"] == delegation_id));

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
            "SELECT COUNT(*) FROM public.agent_capability_registry WHERE id = $1"
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
        assert!(capabilities.iter().any(|entry| entry["id"] == capability_id));
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
        let public_llm_cfg_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM public.user_llm_config WHERE owner_user_id = $1")
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
        let public_llm_usage_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM public.llm_usage_log WHERE owner_user_id = $1")
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
          assert!(listed_workflows
              .iter()
              .any(|entry| entry["workflow_id"] == saved_workflow.workflow_id));
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
          let public_saved_workflow_count: i64 =
              sqlx::query_scalar("SELECT COUNT(*) FROM public.saved_workflows WHERE workflow_id = $1")
                  .bind(&saved_workflow.workflow_id)
                  .fetch_one(&db.pool)
                  .await
                  .unwrap_or(0);
          assert_eq!(public_saved_workflow_count, 0);
          let public_workflow_deployment_count: i64 =
              sqlx::query_scalar("SELECT COUNT(*) FROM public.workflow_deployments WHERE workflow_id = $1")
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
        db.store_private_message(
            &user.id,
            &private_message,
            json!({"body": "private hello"}),
        )
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
