use super::{Db, tenant_schema_name};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use std::{collections::HashSet, fmt};

const RUNSHEET_PROFILE_ID: &str = "wedding_runsheet.v1";

#[derive(Clone, Debug)]
pub struct WeddingRunSheetProjectionWrite {
    pub message_type: String,
    pub content: Value,
    pub idempotency_key: String,
    pub source_message_ids: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct WeddingRunSheetProjectionBatch {
    pub database_id: String,
    pub wedding_plan_id: String,
    pub projector_id: String,
    pub projector_version: i32,
    pub expected_source_cursor: Option<String>,
    pub expected_projector_version: Option<i32>,
    pub expected_source_fingerprint: Option<String>,
    pub source_cursor: String,
    pub source_fingerprint: String,
    pub idempotency_key: String,
    pub affected_record_ids: Vec<String>,
    pub writes: Vec<WeddingRunSheetProjectionWrite>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct WeddingRunSheetProjectionCommit {
    pub database_id: String,
    pub wedding_plan_id: String,
    pub projector_id: String,
    pub projector_version: i32,
    pub source_cursor: String,
    pub source_fingerprint: String,
    pub message_ids: Vec<String>,
    pub affected_record_ids: Vec<String>,
    pub replayed: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRunSheetProjectionLedgerMessage {
    pub id: String,
    pub message_type: String,
    pub timestamp: String,
    pub content: Value,
    pub metadata: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRunSheetProjectionState {
    pub checkpoint: Option<WeddingRunSheetProjectionCommit>,
    pub messages: Vec<WeddingRunSheetProjectionLedgerMessage>,
}

#[derive(Debug)]
pub enum WeddingRunSheetProjectionStoreError {
    Sql(sqlx::Error),
    Scope(String),
    Conflict(String),
}

impl fmt::Display for WeddingRunSheetProjectionStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sql(error) => write!(formatter, "{error}"),
            Self::Scope(message) | Self::Conflict(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for WeddingRunSheetProjectionStoreError {}

impl From<sqlx::Error> for WeddingRunSheetProjectionStoreError {
    fn from(value: sqlx::Error) -> Self {
        Self::Sql(value)
    }
}

fn message_id(owner_user_id: &str, idempotency_key: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(owner_user_id.as_bytes());
    digest.update(b"\0wedding-runsheet\0");
    digest.update(idempotency_key.as_bytes());
    format!("runsheet-{}", hex::encode(digest.finalize()))
}

fn replayed_commit_from_row(
    database_id: String,
    row: &sqlx::postgres::PgRow,
) -> Result<WeddingRunSheetProjectionCommit, sqlx::Error> {
    Ok(WeddingRunSheetProjectionCommit {
        database_id,
        wedding_plan_id: row.try_get("wedding_plan_id")?,
        projector_id: row.try_get("projector_id")?,
        projector_version: row.try_get("projector_version")?,
        source_cursor: row.try_get("source_cursor")?,
        source_fingerprint: row.try_get("source_fingerprint")?,
        message_ids: serde_json::from_value(row.try_get::<Value, _>("message_ids")?)
            .unwrap_or_default(),
        affected_record_ids: serde_json::from_value(
            row.try_get::<Value, _>("affected_record_ids")?,
        )
        .unwrap_or_default(),
        replayed: true,
    })
}

fn plan_id(content: &Value, metadata: &Value) -> Option<String> {
    [
        content.get("wedding_plan_id"),
        content.get("weddingPlanId"),
        content.pointer("/scope/wedding_plan_id"),
        metadata.get("wedding_plan_id"),
        metadata.get("weddingPlanId"),
    ]
    .into_iter()
    .flatten()
    .find_map(Value::as_str)
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string)
}

async fn projection_definition_exists(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    owner_user_id: &str,
    batch: &WeddingRunSheetProjectionBatch,
) -> Result<bool, sqlx::Error> {
    let query = format!(
        "SELECT EXISTS(SELECT 1 FROM {table} WHERE content->>'kind'='database_definition' AND content->>'database_id'=$1 AND content->>'profile_id'=$2 AND content#>>'{{scope,account_id}}'=$3 AND content#>>'{{scope,wedding_plan_id}}'=$4) AS found"
    );
    sqlx::query_scalar(&query)
        .bind(&batch.database_id)
        .bind(RUNSHEET_PROFILE_ID)
        .bind(owner_user_id)
        .bind(&batch.wedding_plan_id)
        .fetch_one(&mut **tx)
        .await
}

async fn validate_source_scope(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    wedding_plan_id: &str,
    source_ids: &[String],
) -> Result<(), WeddingRunSheetProjectionStoreError> {
    if source_ids.is_empty() {
        return Ok(());
    }
    let query = format!(
        "SELECT id,content,COALESCE(metadata,'{{}}'::jsonb) AS metadata FROM {table} WHERE id=ANY($1)"
    );
    let rows = sqlx::query(&query)
        .bind(source_ids)
        .fetch_all(&mut **tx)
        .await?;
    if rows.len() != source_ids.len() {
        return Err(WeddingRunSheetProjectionStoreError::Scope(
            "A run-sheet source is not available in this account.".into(),
        ));
    }
    for row in rows {
        let content: Value = row.try_get("content")?;
        let metadata: Value = row.try_get("metadata")?;
        if plan_id(&content, &metadata).as_deref() != Some(wedding_plan_id) {
            return Err(WeddingRunSheetProjectionStoreError::Scope(
                "A run-sheet source belongs to a different wedding plan.".into(),
            ));
        }
    }
    Ok(())
}

async fn validate_revisions(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    database_id: &str,
    writes: &[WeddingRunSheetProjectionWrite],
) -> Result<(), WeddingRunSheetProjectionStoreError> {
    for write in writes {
        let Some(kind) = write.content.get("kind").and_then(Value::as_str) else {
            continue;
        };
        if kind == "database_record" {
            let record_id = write
                .content
                .get("record_id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let query = format!(
                "SELECT EXISTS(SELECT 1 FROM {table} WHERE content->>'database_id'=$1 AND (content->>'record_id'=$2 OR content->>'target_record_id'=$2))"
            );
            if sqlx::query_scalar::<_, bool>(&query)
                .bind(database_id)
                .bind(record_id)
                .fetch_one(&mut **tx)
                .await?
            {
                return Err(WeddingRunSheetProjectionStoreError::Conflict(
                    "A run-sheet row changed before this projection was saved.".into(),
                ));
            }
        } else if kind == "database_record_update" {
            let record_id = write
                .content
                .get("target_record_id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let base_revision = write
                .content
                .get("base_revision")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let query = format!(
                "SELECT content FROM {table} WHERE content->>'database_id'=$1 AND (content->>'record_id'=$2 OR content->>'target_record_id'=$2) ORDER BY (content->>'revision')::bigint DESC LIMIT 1"
            );
            let latest = sqlx::query_scalar::<_, Value>(&query)
                .bind(database_id)
                .bind(record_id)
                .fetch_optional(&mut **tx)
                .await?;
            let Some(latest) = latest else {
                return Err(WeddingRunSheetProjectionStoreError::Conflict(
                    "A run-sheet row no longer exists.".into(),
                ));
            };
            let latest_revision = latest
                .get("revision")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            if latest_revision != base_revision {
                return Err(WeddingRunSheetProjectionStoreError::Conflict(
                    "A run-sheet row changed before this projection was saved.".into(),
                ));
            }
            let create_query = format!(
                "SELECT content#>>'{{data,projection_state}}' FROM {table} WHERE content->>'database_id'=$1 AND content->>'record_id'=$2 LIMIT 1"
            );
            let projection_state = sqlx::query_scalar::<_, Option<String>>(&create_query)
                .bind(database_id)
                .bind(record_id)
                .fetch_optional(&mut **tx)
                .await?
                .flatten();
            if projection_state.as_deref() != Some("projected") {
                return Err(WeddingRunSheetProjectionStoreError::Scope(
                    "User-created run-sheet rows cannot be overwritten by projection.".into(),
                ));
            }
        }
    }
    Ok(())
}

async fn insert_projection_message(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    owner_user_id: &str,
    database_id: &str,
    wedding_plan_id: &str,
    write: &WeddingRunSheetProjectionWrite,
    index: usize,
) -> Result<String, sqlx::Error> {
    let id = message_id(owner_user_id, &write.idempotency_key);
    let timestamp = Utc::now() + Duration::microseconds(index as i64);
    let metadata = json!({
        "origin": "wedding_runsheet_projector",
        "database_id": database_id,
        "wedding_plan_id": wedding_plan_id,
        "idempotency_key": write.idempotency_key,
        "model_calls": 0,
    });
    let query = format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,content,signature,store_in_relational,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10) ON CONFLICT (id) DO NOTHING"
    );
    sqlx::query(&query)
        .bind(&id)
        .bind(format!("db_{database_id}_projection"))
        .bind("omnyid://projector/wedding-runsheet")
        .bind(json!(["agent://database"]))
        .bind(timestamp)
        .bind(&write.message_type)
        .bind(write.content.get("kind").and_then(Value::as_str))
        .bind(&write.content)
        .bind("server:wedding-runsheet:v1")
        .bind(metadata)
        .execute(&mut **tx)
        .await?;
    Ok(id)
}

impl Db {
    pub async fn load_wedding_runsheet_projection_state(
        &self,
        owner_user_id: &str,
        database_id: &str,
        wedding_plan_id: &str,
    ) -> Result<Option<WeddingRunSheetProjectionState>, sqlx::Error> {
        self.ensure_user_private_schema(owner_user_id).await?;
        let table = format!("\"{}\".messages", tenant_schema_name(owner_user_id));
        let definition_query = format!(
            "SELECT EXISTS(SELECT 1 FROM {table} WHERE content->>'kind'='database_definition' AND content->>'database_id'=$1 AND content->>'profile_id'=$2 AND content#>>'{{scope,account_id}}'=$3 AND content#>>'{{scope,wedding_plan_id}}'=$4)"
        );
        let allowed = sqlx::query_scalar::<_, bool>(&definition_query)
            .bind(database_id)
            .bind(RUNSHEET_PROFILE_ID)
            .bind(owner_user_id)
            .bind(wedding_plan_id)
            .fetch_one(&self.pool)
            .await?;
        if !allowed {
            return Ok(None);
        }
        let message_query = format!(
            "SELECT id,type,timestamp::text AS timestamp,content,COALESCE(metadata,'{{}}'::jsonb) AS metadata FROM {table} WHERE metadata->>'origin'='wedding_runsheet_projector' AND content->>'database_id'=$1 ORDER BY timestamp,id LIMIT 501"
        );
        let rows = sqlx::query(&message_query)
            .bind(database_id)
            .fetch_all(&self.pool)
            .await?;
        let mut messages = Vec::with_capacity(rows.len());
        for row in rows {
            messages.push(WeddingRunSheetProjectionLedgerMessage {
                id: row.try_get("id")?,
                message_type: row.try_get("type")?,
                timestamp: row.try_get("timestamp")?,
                content: row.try_get("content")?,
                metadata: row.try_get("metadata")?,
            });
        }
        let checkpoint = self
            .wedding_runsheet_checkpoint(owner_user_id, database_id)
            .await?;
        Ok(Some(WeddingRunSheetProjectionState {
            checkpoint,
            messages,
        }))
    }

    pub async fn wedding_runsheet_checkpoint(
        &self,
        owner_user_id: &str,
        database_id: &str,
    ) -> Result<Option<WeddingRunSheetProjectionCommit>, sqlx::Error> {
        let row = sqlx::query("SELECT wedding_plan_id,projector_id,projector_version,source_cursor,source_fingerprint FROM wedding_runsheet_projection_checkpoints WHERE owner_user_id=$1 AND database_id=$2 AND projector_id='wedding-runsheet'")
            .bind(owner_user_id).bind(database_id).fetch_optional(&self.pool).await?;
        Ok(row.and_then(|row| {
            Some(WeddingRunSheetProjectionCommit {
                database_id: database_id.into(),
                wedding_plan_id: row.try_get("wedding_plan_id").ok()?,
                projector_id: row.try_get("projector_id").ok()?,
                projector_version: row.try_get("projector_version").ok()?,
                source_cursor: row
                    .try_get::<Option<String>, _>("source_cursor")
                    .ok()
                    .flatten()?,
                source_fingerprint: row
                    .try_get::<Option<String>, _>("source_fingerprint")
                    .ok()
                    .flatten()?,
                message_ids: vec![],
                affected_record_ids: vec![],
                replayed: false,
            })
        }))
    }

    pub async fn commit_wedding_runsheet_projection(
        &self,
        owner_user_id: &str,
        batch: WeddingRunSheetProjectionBatch,
    ) -> Result<WeddingRunSheetProjectionCommit, WeddingRunSheetProjectionStoreError> {
        self.ensure_user_private_schema(owner_user_id).await?;
        let table = format!("\"{}\".messages", tenant_schema_name(owner_user_id));
        let mut tx = self.pool.begin().await?;
        if let Some(row) = sqlx::query("SELECT wedding_plan_id,projector_id,projector_version,source_cursor,source_fingerprint,message_ids,affected_record_ids FROM wedding_runsheet_projection_commits WHERE owner_user_id=$1 AND idempotency_key=$2")
            .bind(owner_user_id).bind(&batch.idempotency_key).fetch_optional(&mut *tx).await? {
            let outcome = replayed_commit_from_row(batch.database_id, &row)?;
            tx.commit().await?;
            return Ok(outcome);
        }
        sqlx::query("INSERT INTO wedding_runsheet_projection_checkpoints (owner_user_id,database_id,wedding_plan_id,projector_id,projector_version) VALUES ($1,$2,$3,$4,0) ON CONFLICT DO NOTHING")
            .bind(owner_user_id).bind(&batch.database_id).bind(&batch.wedding_plan_id).bind(&batch.projector_id).execute(&mut *tx).await?;
        let checkpoint = sqlx::query("SELECT wedding_plan_id,projector_version,source_cursor,source_fingerprint FROM wedding_runsheet_projection_checkpoints WHERE owner_user_id=$1 AND database_id=$2 AND projector_id=$3 FOR UPDATE")
            .bind(owner_user_id).bind(&batch.database_id).bind(&batch.projector_id).fetch_one(&mut *tx).await?;
        let stored_plan: String = checkpoint.try_get("wedding_plan_id")?;
        let stored_version: i32 = checkpoint.try_get("projector_version")?;
        let stored_cursor: Option<String> = checkpoint.try_get("source_cursor")?;
        let stored_fingerprint: Option<String> = checkpoint.try_get("source_fingerprint")?;
        // A concurrent retry can pass the first lookup before the winning
        // transaction commits. Re-check after taking the checkpoint lock so
        // the loser observes a replay rather than a false checkpoint conflict.
        if let Some(row) = sqlx::query("SELECT wedding_plan_id,projector_id,projector_version,source_cursor,source_fingerprint,message_ids,affected_record_ids FROM wedding_runsheet_projection_commits WHERE owner_user_id=$1 AND idempotency_key=$2")
            .bind(owner_user_id).bind(&batch.idempotency_key).fetch_optional(&mut *tx).await? {
            let outcome = replayed_commit_from_row(batch.database_id, &row)?;
            tx.commit().await?;
            return Ok(outcome);
        }
        let expected_version = batch.expected_projector_version.unwrap_or(0);
        if stored_plan != batch.wedding_plan_id
            || stored_cursor != batch.expected_source_cursor
            || stored_version != expected_version
            || stored_fingerprint != batch.expected_source_fingerprint
        {
            return Err(WeddingRunSheetProjectionStoreError::Conflict(
                "The run sheet changed while it was being updated. Refresh and try again.".into(),
            ));
        }
        if !projection_definition_exists(&mut tx, &table, owner_user_id, &batch).await? {
            return Err(WeddingRunSheetProjectionStoreError::Scope(
                "This wedding run sheet is not available in your account.".into(),
            ));
        }
        let source_ids = batch
            .writes
            .iter()
            .flat_map(|write| write.source_message_ids.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        validate_source_scope(&mut tx, &table, &batch.wedding_plan_id, &source_ids).await?;
        validate_revisions(&mut tx, &table, &batch.database_id, &batch.writes).await?;
        let mut message_ids = Vec::with_capacity(batch.writes.len());
        for (index, write) in batch.writes.iter().enumerate() {
            message_ids.push(
                insert_projection_message(
                    &mut tx,
                    &table,
                    owner_user_id,
                    &batch.database_id,
                    &batch.wedding_plan_id,
                    write,
                    index,
                )
                .await?,
            );
        }
        sqlx::query("INSERT INTO wedding_runsheet_projection_commits (owner_user_id,database_id,wedding_plan_id,projector_id,idempotency_key,source_cursor,source_fingerprint,projector_version,message_ids,affected_record_ids) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(owner_user_id).bind(&batch.database_id).bind(&batch.wedding_plan_id).bind(&batch.projector_id)
            .bind(&batch.idempotency_key).bind(&batch.source_cursor).bind(&batch.source_fingerprint).bind(batch.projector_version)
            .bind(json!(message_ids)).bind(json!(batch.affected_record_ids)).execute(&mut *tx).await?;
        sqlx::query("UPDATE wedding_runsheet_projection_checkpoints SET wedding_plan_id=$3,projector_version=$4,source_cursor=$5,source_fingerprint=$6,updated_at=NOW() WHERE owner_user_id=$1 AND database_id=$2 AND projector_id=$7")
            .bind(owner_user_id).bind(&batch.database_id).bind(&batch.wedding_plan_id).bind(batch.projector_version)
            .bind(&batch.source_cursor).bind(&batch.source_fingerprint).bind(&batch.projector_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(WeddingRunSheetProjectionCommit {
            database_id: batch.database_id,
            wedding_plan_id: batch.wedding_plan_id,
            projector_id: batch.projector_id,
            projector_version: batch.projector_version,
            source_cursor: batch.source_cursor,
            source_fingerprint: batch.source_fingerprint,
            message_ids,
            affected_record_ids: batch.affected_record_ids,
            replayed: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_ids_are_stable_without_exposing_account_or_key() {
        let first = message_id("account-a", "projection:key");
        assert_eq!(first, message_id("account-a", "projection:key"));
        assert_ne!(first, message_id("account-b", "projection:key"));
        assert!(!first.contains("account-a"));
        assert!(!first.contains("projection:key"));
    }

    #[test]
    fn plan_scope_reads_supported_afp_shapes() {
        assert_eq!(
            plan_id(&json!({"scope":{"wedding_plan_id":"plan-1"}}), &json!({})).as_deref(),
            Some("plan-1")
        );
        assert_eq!(
            plan_id(&json!({}), &json!({"weddingPlanId":"plan-2"})).as_deref(),
            Some("plan-2")
        );
    }

    fn test_batch(suffix: &str, source_id: &str) -> WeddingRunSheetProjectionBatch {
        let record_id = format!("runsheet:task:{suffix}");
        WeddingRunSheetProjectionBatch {
            database_id: "database:test-runsheet".into(),
            wedding_plan_id: "plan-test".into(),
            projector_id: "wedding-runsheet".into(),
            projector_version: 1,
            expected_source_cursor: None,
            expected_projector_version: None,
            expected_source_fingerprint: None,
            source_cursor: format!("cursor-{suffix}"),
            source_fingerprint: format!("fingerprint-{suffix}"),
            idempotency_key: format!("receipt:{suffix}"),
            affected_record_ids: vec![record_id.clone()],
            writes: vec![
                WeddingRunSheetProjectionWrite {
                    message_type: "database_record".into(),
                    idempotency_key: format!("record:{suffix}"),
                    source_message_ids: vec![source_id.into()],
                    content: json!({"kind":"database_record","database_id":"database:test-runsheet","record_id":record_id,"revision":1,"data":{"projection_state":"projected"}}),
                },
                WeddingRunSheetProjectionWrite {
                    message_type: "database_projection_receipt".into(),
                    idempotency_key: format!("receipt:{suffix}"),
                    source_message_ids: vec![],
                    content: json!({"kind":"database_projection_receipt","database_id":"database:test-runsheet"}),
                },
            ],
        }
    }

    #[tokio::test]
    async fn disposable_postgres_proves_atomic_failure_retry_and_concurrency() {
        let Ok(database_url) = std::env::var("OMNYID_RUNSHEET_TEST_DATABASE_URL") else {
            eprintln!(
                "OMNYID_RUNSHEET_TEST_DATABASE_URL not set; disposable Postgres proof skipped"
            );
            return;
        };
        let db = Db::new(&database_url)
            .await
            .expect("connect disposable Postgres");
        let unique = ulid::Ulid::new().to_string().to_lowercase();
        let owner = format!("runsheet_test_{unique}");
        sqlx::query("INSERT INTO users (id,email,auth_provider,display_name) VALUES ($1,$2,'password','Run-sheet test')")
            .bind(&owner).bind(format!("{owner}@example.invalid")).execute(&db.pool).await.expect("create test user");
        let schema = db
            .ensure_user_private_schema(&owner)
            .await
            .expect("private schema");
        let table = format!("\"{schema}\".messages");
        let insert = format!(
            "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,content,signature,store_in_relational,metadata) VALUES ($1,'test','test','[]'::jsonb,NOW(),$2,$3,'test',TRUE,$4)"
        );
        sqlx::query(&insert).bind("definition").bind("database_definition")
            .bind(json!({"kind":"database_definition","database_id":"database:test-runsheet","profile_id":"wedding_runsheet.v1","scope":{"account_id":owner.clone(),"wedding_plan_id":"plan-test"}}))
            .bind(json!({})).execute(&db.pool).await.expect("definition");
        sqlx::query(&insert)
            .bind("source")
            .bind("wedding_task")
            .bind(json!({"kind":"wedding_task","wedding_plan_id":"plan-test","task_id":"task-1"}))
            .bind(json!({}))
            .execute(&db.pool)
            .await
            .expect("source");

        let failed = db
            .commit_wedding_runsheet_projection(&owner, test_batch("bad", "missing-source"))
            .await;
        assert!(matches!(
            failed,
            Err(WeddingRunSheetProjectionStoreError::Scope(_))
        ));
        assert!(
            db.wedding_runsheet_checkpoint(&owner, "database:test-runsheet")
                .await
                .expect("checkpoint lookup")
                .is_none()
        );

        let left = test_batch("left", "source");
        let right = test_batch("right", "source");
        let (left_result, right_result) = tokio::join!(
            db.commit_wedding_runsheet_projection(&owner, left.clone()),
            db.commit_wedding_runsheet_projection(&owner, right.clone()),
        );
        let (winner_batch, winner) = match (left_result, right_result) {
            (Ok(winner), Err(WeddingRunSheetProjectionStoreError::Conflict(_))) => (left, winner),
            (Err(WeddingRunSheetProjectionStoreError::Conflict(_)), Ok(winner)) => (right, winner),
            results => panic!("expected one commit and one checkpoint conflict, got {results:?}"),
        };
        assert!(!winner.replayed);
        let retry = db
            .commit_wedding_runsheet_projection(&owner, winner_batch)
            .await
            .expect("idempotent retry");
        assert!(retry.replayed);
        assert_eq!(retry.message_ids, winner.message_ids);
        let message_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM {table} WHERE metadata->>'origin'='wedding_runsheet_projector'"
        ))
        .fetch_one(&db.pool)
        .await
        .expect("projected message count");
        assert_eq!(message_count, 2);

        sqlx::query("DELETE FROM users WHERE id=$1")
            .bind(&owner)
            .execute(&db.pool)
            .await
            .expect("remove test user");
        sqlx::raw_sql(&format!("DROP SCHEMA IF EXISTS \"{schema}\" CASCADE"))
            .execute(&db.pool)
            .await
            .expect("drop test schema");
    }
}
