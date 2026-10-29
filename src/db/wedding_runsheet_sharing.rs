use super::{tenant_schema_name, Db};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sqlx::{Postgres, Row, Transaction};
use std::collections::{BTreeMap, HashSet};

const PRIVATE_FIELDS: &[&str] = &[
    "private_notes",
    "couple_phone",
    "couple_email",
    "personal_phone",
    "personal_email",
    "internal_notes",
    "source_refs",
    "source_fingerprint",
];

#[derive(Clone, Debug)]
pub struct WeddingRunSheetShareGrantCreate {
    pub grant_id: String,
    pub database_id: String,
    pub wedding_plan_id: String,
    pub view_id: String,
    pub view_revision: i64,
    pub token_digest: String,
    pub recipient_role: String,
    pub recipient_label: String,
    pub record_ids: Vec<String>,
    pub signoff_required: bool,
    pub signoff_due_at: Option<DateTime<Utc>>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRunSheetShareAcknowledgement {
    pub acknowledgement_id: String,
    pub status: String,
    pub actor_label: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRunSheetShareGrantSummary {
    pub grant_id: String,
    pub database_id: String,
    pub wedding_plan_id: String,
    pub view_id: String,
    pub view_revision: i64,
    pub recipient_role: String,
    pub recipient_label: String,
    pub record_ids: Vec<String>,
    pub signoff_required: bool,
    pub signoff_due_at: Option<String>,
    pub expires_at: String,
    pub revoked_at: Option<String>,
    pub view_count: i64,
    pub last_viewed_at: Option<String>,
    pub created_at: String,
    pub acknowledgement: Option<WeddingRunSheetShareAcknowledgement>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRunSheetSharedRow {
    pub record_id: String,
    pub values: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRunSheetHostedView {
    pub grant: WeddingRunSheetShareGrantSummary,
    pub view_name: String,
    pub columns: Vec<String>,
    pub rows: Vec<WeddingRunSheetSharedRow>,
}

#[derive(Clone, Debug)]
struct SavedViewPolicy {
    name: String,
    columns: Vec<String>,
    visibility: String,
}

fn value_strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn row_acknowledgement(row: &sqlx::postgres::PgRow) -> Option<WeddingRunSheetShareAcknowledgement> {
    Some(WeddingRunSheetShareAcknowledgement {
        acknowledgement_id: row
            .try_get::<Option<String>, _>("acknowledgement_id")
            .ok()??,
        status: row
            .try_get::<Option<String>, _>("acknowledgement_status")
            .ok()??,
        actor_label: row
            .try_get::<Option<String>, _>("acknowledgement_actor")
            .ok()??,
        note: row.try_get("acknowledgement_note").ok().flatten(),
        created_at: row
            .try_get::<Option<String>, _>("acknowledgement_created_at")
            .ok()??,
    })
}

fn grant_summary(
    row: &sqlx::postgres::PgRow,
) -> Result<WeddingRunSheetShareGrantSummary, sqlx::Error> {
    Ok(WeddingRunSheetShareGrantSummary {
        grant_id: row.try_get("grant_id")?,
        database_id: row.try_get("database_id")?,
        wedding_plan_id: row.try_get("wedding_plan_id")?,
        view_id: row.try_get("view_id")?,
        view_revision: row.try_get("view_revision")?,
        recipient_role: row.try_get("recipient_role")?,
        recipient_label: row.try_get("recipient_label")?,
        record_ids: serde_json::from_value(row.try_get::<Value, _>("record_ids")?)
            .unwrap_or_default(),
        signoff_required: row.try_get("signoff_required")?,
        signoff_due_at: row.try_get("signoff_due_at")?,
        expires_at: row.try_get("expires_at")?,
        revoked_at: row.try_get("revoked_at")?,
        view_count: row.try_get("view_count")?,
        last_viewed_at: row.try_get("last_viewed_at")?,
        created_at: row.try_get("created_at")?,
        acknowledgement: row_acknowledgement(row),
    })
}

fn grant_select(where_clause: &str) -> String {
    format!(
        r#"SELECT g.grant_id,g.database_id,g.wedding_plan_id,g.view_id,g.view_revision,
        g.recipient_role,g.recipient_label,g.record_ids,g.signoff_required,
        g.signoff_due_at::text,g.expires_at::text,g.revoked_at::text,g.view_count,
        g.last_viewed_at::text,g.created_at::text,
        a.acknowledgement_id,a.status AS acknowledgement_status,a.actor_label AS acknowledgement_actor,
        a.note AS acknowledgement_note,a.created_at::text AS acknowledgement_created_at
      FROM wedding_runsheet_share_grants g
      LEFT JOIN LATERAL (
        SELECT acknowledgement_id,status,actor_label,note,created_at
        FROM wedding_runsheet_share_acknowledgements
        WHERE grant_id=g.grant_id ORDER BY created_at DESC,acknowledgement_id DESC LIMIT 1
      ) a ON TRUE WHERE {where_clause}"#
    )
}

async fn saved_view_policy(
    tx: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    database_id: &str,
    view_id: &str,
    view_revision: i64,
    recipient_role: &str,
) -> Result<Option<SavedViewPolicy>, sqlx::Error> {
    let table = format!("\"{}\".messages", tenant_schema_name(owner_user_id));
    let query = format!(
        "SELECT content FROM {table} WHERE content->>'kind'='database_saved_view' AND content->>'database_id'=$1 AND content->>'view_id'=$2 AND (content->>'revision')::bigint=$3 ORDER BY timestamp DESC LIMIT 1"
    );
    let Some(content) = sqlx::query_scalar::<_, Value>(&query)
        .bind(database_id)
        .bind(view_id)
        .bind(view_revision)
        .fetch_optional(&mut **tx)
        .await?
    else {
        return Ok(None);
    };
    let columns = value_strings(content.get("columns").unwrap_or(&Value::Null));
    let include = value_strings(
        content
            .pointer("/field_policy/include_fields")
            .unwrap_or(&Value::Null),
    );
    let excluded = value_strings(
        content
            .pointer("/field_policy/exclude_fields")
            .unwrap_or(&Value::Null),
    );
    let resolves_contacts = content
        .pointer("/field_policy/resolve_contact_fields")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let filters = content
        .get("filters")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let visibility = match recipient_role {
        "photo_video" => "photo-video",
        role => role,
    };
    let safe_filter = filters.len() == 1
        && filters[0].get("field").and_then(Value::as_str) == Some("visibility")
        && filters[0].get("operator").and_then(Value::as_str) == Some("contains")
        && filters[0].get("value").and_then(Value::as_str) == Some(visibility);
    let private = PRIVATE_FIELDS.iter().copied().collect::<HashSet<_>>();
    let safe_columns = !columns.is_empty()
        && columns.len() <= 100
        && columns.iter().all(|field| {
            include.contains(field)
                && !private.contains(field.as_str())
                && !excluded.iter().any(|blocked| blocked == field)
        });
    let deny_list_complete = PRIVATE_FIELDS
        .iter()
        .all(|field| excluded.iter().any(|blocked| blocked == field));
    if resolves_contacts || !safe_filter || !safe_columns || !deny_list_complete {
        return Ok(None);
    }
    Ok(Some(SavedViewPolicy {
        name: content
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Run sheet")
            .to_string(),
        columns,
        visibility: visibility.to_string(),
    }))
}

async fn share_definition_exists(
    tx: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    database_id: &str,
    wedding_plan_id: &str,
) -> Result<bool, sqlx::Error> {
    let table = format!("\"{}\".messages", tenant_schema_name(owner_user_id));
    let query = format!(
        "SELECT EXISTS(SELECT 1 FROM {table} WHERE content->>'kind'='database_definition' AND content->>'database_id'=$1 AND content->>'profile_id'='wedding_runsheet.v1' AND content#>>'{{scope,account_id}}'=$2 AND content#>>'{{scope,wedding_plan_id}}'=$3)"
    );
    sqlx::query_scalar(&query)
        .bind(database_id)
        .bind(owner_user_id)
        .bind(wedding_plan_id)
        .fetch_one(&mut **tx)
        .await
}

async fn projected_rows(
    tx: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    database_id: &str,
    record_ids: &[String],
    policy: &SavedViewPolicy,
) -> Result<Vec<WeddingRunSheetSharedRow>, sqlx::Error> {
    let table = format!("\"{}\".messages", tenant_schema_name(owner_user_id));
    let query = format!(
        "SELECT content FROM {table} WHERE content->>'database_id'=$1 AND COALESCE(content->>'record_id',content->>'target_record_id')=ANY($2) AND content->>'kind' IN ('database_record','database_record_update') ORDER BY timestamp,id"
    );
    let messages = sqlx::query_scalar::<_, Value>(&query)
        .bind(database_id)
        .bind(record_ids)
        .fetch_all(&mut **tx)
        .await?;
    let requested = record_ids.iter().cloned().collect::<HashSet<_>>();
    let mut effective: BTreeMap<String, (i64, Map<String, Value>)> = BTreeMap::new();
    for content in messages {
        let record_id = content
            .get("record_id")
            .or_else(|| content.get("target_record_id"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !requested.contains(record_id) {
            continue;
        }
        let revision = content
            .get("revision")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        if revision
            <= effective
                .get(record_id)
                .map(|entry| entry.0)
                .unwrap_or_default()
        {
            continue;
        }
        if content.get("kind").and_then(Value::as_str) == Some("database_record") {
            if let Some(data) = content.get("data").and_then(Value::as_object) {
                effective.insert(record_id.to_string(), (revision, data.clone()));
            }
        } else if content.get("operation").and_then(Value::as_str) == Some("tombstone") {
            effective.remove(record_id);
        } else if let Some(patch) = content.get("patch").and_then(Value::as_object) {
            if let Some(entry) = effective.get_mut(record_id) {
                for (key, value) in patch {
                    entry.1.insert(key.clone(), value.clone());
                }
                entry.0 = revision;
            }
        }
    }
    let mut rows = Vec::new();
    for record_id in record_ids {
        let Some((_, data)) = effective.get(record_id) else {
            continue;
        };
        if !value_strings(data.get("visibility").unwrap_or(&Value::Null))
            .iter()
            .any(|role| role == &policy.visibility)
        {
            continue;
        }
        rows.push(WeddingRunSheetSharedRow {
            record_id: record_id.clone(),
            values: policy
                .columns
                .iter()
                .map(|field| {
                    (
                        field.clone(),
                        data.get(field).cloned().unwrap_or(Value::Null),
                    )
                })
                .collect(),
        });
    }
    Ok(rows)
}

async fn insert_event(
    tx: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    grant: &WeddingRunSheetShareGrantSummary,
    event: &str,
    event_id: &str,
    detail: Value,
) -> Result<(), sqlx::Error> {
    let table = format!("\"{}\".messages", tenant_schema_name(owner_user_id));
    let content = json!({
        "kind": format!("wedding_runsheet_share_{event}"), "contract_version": 1,
        "grant_id": grant.grant_id, "database_id": grant.database_id, "wedding_plan_id": grant.wedding_plan_id,
        "view_id": grant.view_id, "view_revision": grant.view_revision, "recipient_role": grant.recipient_role,
        "detail": detail,
    });
    let query = format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,content,signature,store_in_relational,metadata) VALUES ($1,$2,'omnyid://wedding/runsheet-share',$3,NOW(),$4,$5,$6,'server:wedding-runsheet-share:v1',TRUE,$7) ON CONFLICT(id) DO NOTHING"
    );
    sqlx::query(&query).bind(event_id).bind(format!("db_{}_shares", grant.database_id)).bind(json!(["agent://database"]))
        .bind(format!("wedding_runsheet_share_{event}")).bind(format!("wedding_runsheet_share_{event}"))
        .bind(content).bind(json!({"origin":"wedding_runsheet_share","database_id":grant.database_id,"grant_id":grant.grant_id}))
        .execute(&mut **tx).await?;
    Ok(())
}

impl Db {
    pub async fn create_wedding_runsheet_share_grant(
        &self,
        owner_user_id: &str,
        input: WeddingRunSheetShareGrantCreate,
    ) -> Result<Option<WeddingRunSheetShareGrantSummary>, sqlx::Error> {
        self.ensure_user_private_schema(owner_user_id).await?;
        let mut tx = self.pool.begin().await?;
        if !share_definition_exists(
            &mut tx,
            owner_user_id,
            &input.database_id,
            &input.wedding_plan_id,
        )
        .await?
        {
            tx.rollback().await?;
            return Ok(None);
        }
        let Some(policy) = saved_view_policy(
            &mut tx,
            owner_user_id,
            &input.database_id,
            &input.view_id,
            input.view_revision,
            &input.recipient_role,
        )
        .await?
        else {
            tx.rollback().await?;
            return Ok(None);
        };
        let rows = projected_rows(
            &mut tx,
            owner_user_id,
            &input.database_id,
            &input.record_ids,
            &policy,
        )
        .await?;
        if rows.len() != input.record_ids.len() {
            tx.rollback().await?;
            return Ok(None);
        }
        sqlx::query("INSERT INTO wedding_runsheet_share_grants (grant_id,owner_user_id,database_id,wedding_plan_id,view_id,view_revision,token_digest,recipient_role,recipient_label,record_ids,signoff_required,signoff_due_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)")
            .bind(&input.grant_id).bind(owner_user_id).bind(&input.database_id).bind(&input.wedding_plan_id).bind(&input.view_id).bind(input.view_revision)
            .bind(&input.token_digest).bind(&input.recipient_role).bind(&input.recipient_label).bind(json!(input.record_ids)).bind(input.signoff_required).bind(input.signoff_due_at).bind(input.expires_at)
            .execute(&mut *tx).await?;
        let row = sqlx::query(&format!(
            "{} ORDER BY g.created_at DESC LIMIT 1",
            grant_select("g.grant_id=$1 AND g.owner_user_id=$2")
        ))
        .bind(&input.grant_id)
        .bind(owner_user_id)
        .fetch_one(&mut *tx)
        .await?;
        let grant = grant_summary(&row)?;
        insert_event(&mut tx, owner_user_id, &grant, "granted", &format!("runsheet-share-granted:{}", grant.grant_id), json!({"expires_at":grant.expires_at,"record_ids":grant.record_ids,"signoff_required":grant.signoff_required,"signoff_due_at":grant.signoff_due_at,"delivery_method":"protected_link"})).await?;
        tx.commit().await?;
        Ok(Some(grant))
    }

    pub async fn list_wedding_runsheet_share_grants(
        &self,
        owner_user_id: &str,
        database_id: &str,
    ) -> Result<Vec<WeddingRunSheetShareGrantSummary>, sqlx::Error> {
        self.ensure_user_private_schema(owner_user_id).await?;
        let mut tx = self.pool.begin().await?;
        let expired = sqlx::query("UPDATE wedding_runsheet_share_grants SET expired_event_at=NOW() WHERE owner_user_id=$1 AND database_id=$2 AND revoked_at IS NULL AND expired_event_at IS NULL AND expires_at<=NOW() RETURNING grant_id")
            .bind(owner_user_id).bind(database_id).fetch_all(&mut *tx).await?;
        for row in expired {
            let id: String = row.try_get("grant_id")?;
            let grant_row = sqlx::query(&format!("{} LIMIT 1", grant_select("g.grant_id=$1")))
                .bind(&id)
                .fetch_one(&mut *tx)
                .await?;
            let grant = grant_summary(&grant_row)?;
            insert_event(
                &mut tx,
                owner_user_id,
                &grant,
                "expired",
                &format!("runsheet-share-expired:{id}"),
                json!({}),
            )
            .await?;
        }
        let rows = sqlx::query(&format!(
            "{} ORDER BY g.created_at DESC LIMIT 101",
            grant_select("g.owner_user_id=$1 AND g.database_id=$2")
        ))
        .bind(owner_user_id)
        .bind(database_id)
        .fetch_all(&mut *tx)
        .await?;
        let grants = rows
            .iter()
            .map(grant_summary)
            .collect::<Result<Vec<_>, _>>()?;
        tx.commit().await?;
        Ok(grants)
    }

    pub async fn revoke_wedding_runsheet_share_grant(
        &self,
        owner_user_id: &str,
        grant_id: &str,
    ) -> Result<Option<WeddingRunSheetShareGrantSummary>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let updated=sqlx::query("UPDATE wedding_runsheet_share_grants SET revoked_at=COALESCE(revoked_at,NOW()) WHERE owner_user_id=$1 AND grant_id=$2 RETURNING grant_id").bind(owner_user_id).bind(grant_id).fetch_optional(&mut *tx).await?;
        if updated.is_none() {
            tx.rollback().await?;
            return Ok(None);
        }
        let row = sqlx::query(&format!(
            "{} LIMIT 1",
            grant_select("g.owner_user_id=$1 AND g.grant_id=$2")
        ))
        .bind(owner_user_id)
        .bind(grant_id)
        .fetch_one(&mut *tx)
        .await?;
        let grant = grant_summary(&row)?;
        insert_event(
            &mut tx,
            owner_user_id,
            &grant,
            "revoked",
            &format!("runsheet-share-revoked:{grant_id}"),
            json!({}),
        )
        .await?;
        tx.commit().await?;
        Ok(Some(grant))
    }

    pub async fn open_wedding_runsheet_share(
        &self,
        token_digest: &str,
    ) -> Result<Option<WeddingRunSheetHostedView>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let Some(owner_user_id)=sqlx::query_scalar::<_,String>("SELECT owner_user_id FROM wedding_runsheet_share_grants WHERE token_digest=$1 AND revoked_at IS NULL AND expires_at>NOW()").bind(token_digest).fetch_optional(&mut *tx).await? else {tx.rollback().await?;return Ok(None)};
        let row = sqlx::query(&format!(
            "{} LIMIT 1",
            grant_select("g.token_digest=$1 AND g.revoked_at IS NULL AND g.expires_at>NOW()")
        ))
        .bind(token_digest)
        .fetch_one(&mut *tx)
        .await?;
        let mut grant = grant_summary(&row)?;
        let Some(policy) = saved_view_policy(
            &mut tx,
            &owner_user_id,
            &grant.database_id,
            &grant.view_id,
            grant.view_revision,
            &grant.recipient_role,
        )
        .await?
        else {
            tx.rollback().await?;
            return Ok(None);
        };
        let rows = projected_rows(
            &mut tx,
            &owner_user_id,
            &grant.database_id,
            &grant.record_ids,
            &policy,
        )
        .await?;
        let count:i64=sqlx::query_scalar("UPDATE wedding_runsheet_share_grants SET view_count=view_count+1,last_viewed_at=NOW() WHERE grant_id=$1 RETURNING view_count").bind(&grant.grant_id).fetch_one(&mut *tx).await?;
        grant.view_count = count;
        grant.last_viewed_at = Some(Utc::now().to_rfc3339());
        insert_event(
            &mut tx,
            &owner_user_id,
            &grant,
            "viewed",
            &format!("runsheet-share-viewed:{}:{count}", grant.grant_id),
            json!({"view_count":count}),
        )
        .await?;
        tx.commit().await?;
        Ok(Some(WeddingRunSheetHostedView {
            grant,
            view_name: policy.name,
            columns: policy.columns,
            rows,
        }))
    }

    pub async fn acknowledge_wedding_runsheet_share(
        &self,
        token_digest: &str,
        acknowledgement_id: &str,
        status: &str,
        actor_label: &str,
        note: Option<&str>,
        idempotency_key: &str,
    ) -> Result<Option<WeddingRunSheetShareAcknowledgement>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let Some(owner_user_id)=sqlx::query_scalar::<_,String>("SELECT owner_user_id FROM wedding_runsheet_share_grants WHERE token_digest=$1 AND recipient_role='vendor' AND signoff_required=TRUE AND revoked_at IS NULL AND expires_at>NOW()").bind(token_digest).fetch_optional(&mut *tx).await? else {tx.rollback().await?;return Ok(None)};
        let grant_row = sqlx::query(&format!("{} LIMIT 1", grant_select("g.token_digest=$1")))
            .bind(token_digest)
            .fetch_one(&mut *tx)
            .await?;
        let grant = grant_summary(&grant_row)?;
        sqlx::query("INSERT INTO wedding_runsheet_share_acknowledgements (acknowledgement_id,grant_id,status,actor_label,note,idempotency_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(grant_id,idempotency_key) DO NOTHING")
            .bind(acknowledgement_id).bind(&grant.grant_id).bind(status).bind(actor_label).bind(note).bind(idempotency_key).execute(&mut *tx).await?;
        let row=sqlx::query("SELECT acknowledgement_id,status,actor_label,note,created_at::text FROM wedding_runsheet_share_acknowledgements WHERE grant_id=$1 AND idempotency_key=$2").bind(&grant.grant_id).bind(idempotency_key).fetch_one(&mut *tx).await?;
        let acknowledgement = WeddingRunSheetShareAcknowledgement {
            acknowledgement_id: row.try_get("acknowledgement_id")?,
            status: row.try_get("status")?,
            actor_label: row.try_get("actor_label")?,
            note: row.try_get("note")?,
            created_at: row.try_get("created_at")?,
        };
        insert_event(&mut tx,&owner_user_id,&grant,"acknowledged",&format!("runsheet-share-ack:{}:{}",grant.grant_id,idempotency_key),json!({"acknowledgement_id":acknowledgement.acknowledgement_id,"status":acknowledgement.status,"actor_label":acknowledgement.actor_label})).await?;
        tx.commit().await?;
        Ok(Some(acknowledgement))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    async fn insert_message(db: &Db, table: &str, id: &str, kind: &str, content: Value) {
        let query = format!(
            "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,content,signature,store_in_relational,metadata) VALUES ($1,'runsheet-share-test','test','[]'::jsonb,NOW(),$2,$2,$3,'test',TRUE,'{{}}'::jsonb)"
        );
        sqlx::query(&query)
            .bind(id)
            .bind(kind)
            .bind(content)
            .execute(&db.pool)
            .await
            .expect("insert tenant AFP fixture");
    }

    #[tokio::test]
    async fn disposable_postgres_proves_share_ack_expiry_and_revocation() {
        let Ok(database_url) = std::env::var("OMNYID_RUNSHEET_TEST_DATABASE_URL") else {
            eprintln!(
                "OMNYID_RUNSHEET_TEST_DATABASE_URL not set; hosted share Postgres proof skipped"
            );
            return;
        };
        let db = Db::new(&database_url)
            .await
            .expect("connect disposable Postgres");
        let unique = ulid::Ulid::new().to_string().to_lowercase();
        let owner = format!("runsheet_share_test_{unique}");
        sqlx::query("INSERT INTO users (id,email,auth_provider,display_name) VALUES ($1,$2,'password','Run-sheet share test')")
            .bind(&owner)
            .bind(format!("{owner}@example.invalid"))
            .execute(&db.pool)
            .await
            .expect("create test user");
        let schema = db
            .ensure_user_private_schema(&owner)
            .await
            .expect("private schema");
        let table = format!("\"{schema}\".messages");
        let database_id = format!("database:share-{unique}");
        insert_message(
            &db,
            &table,
            "definition",
            "database_definition",
            json!({
                "kind":"database_definition", "database_id":database_id,
                "profile_id":"wedding_runsheet.v1",
                "scope":{"account_id":owner,"wedding_plan_id":"plan-test"}
            }),
        )
        .await;
        insert_message(
            &db,
            &table,
            "vendor-view",
            "database_saved_view",
            json!({
                "kind":"database_saved_view", "database_id":database_id,
                "view_id":"wedding-runsheet-vendor", "revision":1,
                "name":"Vendor final run sheet", "columns":["title","start_at","visibility"],
                "filters":[{"field":"visibility","operator":"contains","value":"vendor"}],
                "field_policy":{
                    "include_fields":["title","start_at","visibility"],
                    "exclude_fields":PRIVATE_FIELDS,
                    "resolve_contact_fields":false
                }
            }),
        )
        .await;
        insert_message(
            &db,
            &table,
            "record-vendor",
            "database_record",
            json!({
                "kind":"database_record", "database_id":database_id,
                "record_id":"record-vendor", "revision":1,
                "data":{
                    "title":"Venue access", "start_at":"2027-11-20T01:00:00Z",
                    "visibility":["master","vendor"], "private_notes":"door code",
                    "couple_phone":"0400000000"
                }
            }),
        )
        .await;

        let token_digest = format!("a{unique}{unique}{unique}")
            .chars()
            .take(64)
            .collect::<String>();
        let grant = db
            .create_wedding_runsheet_share_grant(
                &owner,
                WeddingRunSheetShareGrantCreate {
                    grant_id: format!("grant-{unique}"),
                    database_id: database_id.clone(),
                    wedding_plan_id: "plan-test".into(),
                    view_id: "wedding-runsheet-vendor".into(),
                    view_revision: 1,
                    token_digest: token_digest.clone(),
                    recipient_role: "vendor".into(),
                    recipient_label: "Example Venue".into(),
                    record_ids: vec!["record-vendor".into()],
                    signoff_required: true,
                    signoff_due_at: Some(Utc::now() + Duration::days(2)),
                    expires_at: Utc::now() + Duration::days(3),
                },
            )
            .await
            .expect("create grant")
            .expect("valid grant");
        assert_eq!(grant.view_count, 0);

        let hosted = db
            .open_wedding_runsheet_share(&token_digest)
            .await
            .expect("open hosted projection")
            .expect("active grant");
        assert_eq!(hosted.grant.view_count, 1);
        assert_eq!(hosted.rows.len(), 1);
        assert_eq!(hosted.rows[0].values["title"], "Venue access");
        assert!(!hosted.rows[0].values.contains_key("private_notes"));
        assert!(!hosted.rows[0].values.contains_key("couple_phone"));

        let acknowledgement_id = format!("ack-{unique}");
        let acknowledgement_replay_id = format!("ack-replay-{unique}");
        let reply_idempotency_key = format!("reply-{unique}");
        let first_ack = db
            .acknowledge_wedding_runsheet_share(
                &token_digest,
                &acknowledgement_id,
                "acknowledged",
                "Venue manager",
                Some("Times confirmed"),
                &reply_idempotency_key,
            )
            .await
            .expect("acknowledge")
            .expect("vendor sign-off available");
        let replay = db
            .acknowledge_wedding_runsheet_share(
                &token_digest,
                &acknowledgement_replay_id,
                "changes_requested",
                "Different actor",
                None,
                &reply_idempotency_key,
            )
            .await
            .expect("replay acknowledgement")
            .expect("existing acknowledgement");
        assert_eq!(replay, first_ack);

        assert!(db
            .revoke_wedding_runsheet_share_grant("different-owner", &grant.grant_id)
            .await
            .expect("cross-tenant revoke is refused")
            .is_none());
        db.revoke_wedding_runsheet_share_grant(&owner, &grant.grant_id)
            .await
            .expect("revoke grant")
            .expect("owned grant");
        assert!(db
            .open_wedding_runsheet_share(&token_digest)
            .await
            .expect("revoked lookup")
            .is_none());

        let expiry_digest = format!("b{unique}{unique}{unique}")
            .chars()
            .take(64)
            .collect::<String>();
        let expiry_grant = db
            .create_wedding_runsheet_share_grant(
                &owner,
                WeddingRunSheetShareGrantCreate {
                    grant_id: format!("expiring-{unique}"),
                    database_id: database_id.clone(),
                    wedding_plan_id: "plan-test".into(),
                    view_id: "wedding-runsheet-vendor".into(),
                    view_revision: 1,
                    token_digest: expiry_digest.clone(),
                    recipient_role: "vendor".into(),
                    recipient_label: "Expiring Venue".into(),
                    record_ids: vec!["record-vendor".into()],
                    signoff_required: false,
                    signoff_due_at: None,
                    expires_at: Utc::now() + Duration::hours(1),
                },
            )
            .await
            .expect("create expiring grant")
            .expect("valid expiring grant");
        sqlx::query(
            "UPDATE wedding_runsheet_share_grants SET created_at=NOW()-INTERVAL '2 hours', expires_at=NOW()-INTERVAL '1 minute' WHERE grant_id=$1",
        )
        .bind(&expiry_grant.grant_id)
        .execute(&db.pool)
        .await
        .expect("advance expiry");
        assert!(db
            .open_wedding_runsheet_share(&expiry_digest)
            .await
            .expect("expired lookup")
            .is_none());
        db.list_wedding_runsheet_share_grants(&owner, &database_id)
            .await
            .expect("project expiry event");

        let event_count: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM {table} WHERE metadata->>'origin'='wedding_runsheet_share'"
        ))
        .fetch_one(&db.pool)
        .await
        .expect("share event count");
        assert_eq!(event_count, 6);

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
