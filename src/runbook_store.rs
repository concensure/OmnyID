//! Append-only runbook definitions in the existing authenticated owner's private ledger.
//! Callers supply an authenticated account ID, never an owner from request content.
use crate::runbook_contract::{Result, RunbookDefinition};
use crate::runbook_registry::{Registry, build_definition_afp};
use crate::runbook_starter_pack::{STARTER_PACK_VERSION, selected_starters};
use crate::{
    crypto,
    db::{Db, tenant_schema_name},
    message::AFPMessage,
};
use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};

pub struct RunbookStore<'a> {
    pub(crate) db: &'a Db,
    definition_cache: std::sync::Mutex<crate::runbook_cache::DefinitionCache>,
    pub(crate) encryption_key: [u8; 32],
    signing_key: [u8; 32],
}

impl<'a> RunbookStore<'a> {
    pub fn new(db: &'a Db, encryption_key: [u8; 32], signing_key: [u8; 32]) -> Self {
        Self {
            db,
            definition_cache: Default::default(),
            encryption_key,
            signing_key,
        }
    }

    pub(crate) async fn begin(&self, owner: &str) -> Result<Transaction<'_, Postgres>> {
        if owner.is_empty()
            || owner.len() > 55
            || !owner
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        {
            return Err("invalid_owner");
        }
        let mut tx = self
            .db
            .pool
            .begin()
            .await
            .map_err(|_| "storage_unavailable")?;
        // Account deletion cannot commit while this transaction holds the account row.
        // Do not create schemas here: an erased account must never be resurrected.
        let found: Option<String> =
            sqlx::query_scalar("SELECT id FROM users WHERE id=$1 FOR KEY SHARE")
                .bind(owner)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|_| "storage_unavailable")?;
        if found.is_none() {
            self.definition_cache
                .lock()
                .map_err(|_| "cache_unavailable")?
                .clear();
            return Err("owner_not_found");
        }
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(format!("runbooks:{owner}"))
            .execute(&mut *tx)
            .await
            .map_err(|_| "storage_unavailable")?;
        Ok(tx)
    }

    pub async fn registry(&self, owner: &str) -> Result<Registry> {
        let mut tx = self.begin(owner).await?;
        let registry = self.load(owner, &mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(registry)
    }

    /// Repeated setup never overwrites an edited, disabled or archived definition.
    pub async fn seed(&self, owner: &str, selected: &[String]) -> Result<Registry> {
        let templates = selected_starters(selected)?;
        let mut tx = self.begin(owner).await?;
        let registry = self.load(owner, &mut tx).await?;
        for definition in templates {
            if registry.get(&definition.runbook_id).is_some() {
                continue;
            }
            let mut message = build_definition_afp(owner, &definition, Utc::now())?;
            message["id"] = json!(digest(&json!([
                "runbook_seed.v1",
                owner,
                STARTER_PACK_VERSION,
                definition.runbook_id
            ])));
            self.append(owner, message, &mut tx).await?;
        }
        let registry = self.load(owner, &mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(registry)
    }

    /// Compare-and-append under the same transaction lock used by setup and reads.
    /// The content-addressed message ID makes an exact retry return its original AFP
    /// record even after later edits. Changed content with a stale parent conflicts.
    pub async fn save(
        &self,
        owner: &str,
        expected_parent: Option<&str>,
        definition: RunbookDefinition,
    ) -> Result<Value> {
        let request_id = digest(&json!([
            "runbook_save.v1",
            owner,
            expected_parent,
            definition
        ]));
        let mut tx = self.begin(owner).await?;
        if let Some(message) = self.read(owner, Some(&request_id), &mut tx).await?.pop() {
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(message);
        }
        let registry = self.load(owner, &mut tx).await?;
        let mut message = match expected_parent {
            Some(parent) => registry.successor(
                &definition.runbook_id,
                parent,
                definition.clone(),
                Utc::now(),
            )?,
            None if registry.get(&definition.runbook_id).is_none() => {
                build_definition_afp(owner, &definition, Utc::now())?
            }
            None => return Err("definition_exists"),
        };
        // A root import must not introduce a disconnected successor.
        if expected_parent.is_none() && definition.version != 1 {
            return Err("missing_definition_root");
        }
        message["id"] = json!(request_id);
        self.append(owner, message.clone(), &mut tx).await?;
        // Check history limits before committing, including the record just appended.
        self.load(owner, &mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(message)
    }

    pub(crate) async fn load(
        &self,
        owner: &str,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<Registry> {
        let messages = self.read(owner, None, tx).await?;
        let mut cache = self
            .definition_cache
            .lock()
            .map_err(|_| "cache_unavailable")?;
        Registry::rebuild_with(owner, &messages, |value| cache.parse(owner, value))
    }

    async fn read(
        &self,
        owner: &str,
        id: Option<&str>,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<Vec<Value>> {
        self.read_kind(owner, "runbook_definition", id, None, tx)
            .await
    }

    pub(crate) async fn read_kind(
        &self,
        owner: &str,
        kind: &str,
        id: Option<&str>,
        thread: Option<&str>,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<Vec<Value>> {
        let table = format!("\"{}\".messages", tenant_schema_name(owner));
        // Emit only applicable predicates so PostgreSQL can use envelope indexes
        // even with generic prepared plans. Values remain bound parameters.
        let mut query = sqlx::QueryBuilder::<Postgres>::new(format!(
            "SELECT id,thread_id,parent_id,from_agent,to_agents,timestamp,type,kind,subtype,content,metadata,signature,encryption,\"references\",supertags,store_in_relational FROM {table} WHERE type="
        ));
        query.push_bind(kind);
        if let Some(id) = id {
            query.push(" AND id=").push_bind(id);
        }
        if let Some(thread) = thread {
            query.push(" AND thread_id=").push_bind(thread);
        }
        query.push(" ORDER BY id LIMIT 4097");
        let rows = query
            .build()
            .fetch_all(&mut **tx)
            .await
            .map_err(|_| "storage_unavailable")?;
        if rows.len() > 4096 {
            return Err("registry_history_limit");
        }
        let public_key = hex::encode(
            ed25519_dalek::SigningKey::from_bytes(&self.signing_key)
                .verifying_key()
                .to_bytes(),
        );
        rows.into_iter().map(|row| {
            let timestamp: DateTime<Utc> = row.try_get("timestamp").map_err(|_| "invalid_stored_definition")?;
            let mut message: AFPMessage = serde_json::from_value(json!({
                "protocol":"afp-v1", "id":row.get::<String,_>("id"),
                "thread_id":row.get::<String,_>("thread_id"), "parent_id":row.get::<Option<String>,_>("parent_id"),
                "from":row.get::<String,_>("from_agent"), "to":row.get::<Value,_>("to_agents"),
                "timestamp":timestamp.to_rfc3339_opts(SecondsFormat::Micros,true),
                "type":row.get::<String,_>("type"), "kind":row.get::<Option<String>,_>("kind"),
                "subtype":row.get::<Option<String>,_>("subtype"), "content":row.get::<Value,_>("content"),
                "metadata":row.get::<Option<Value>,_>("metadata"), "signature":row.get::<String,_>("signature"),
                "encryption":row.get::<Option<Value>,_>("encryption"), "references":row.get::<Value,_>("references"),
                "supertags":row.get::<Vec<String>,_>("supertags"), "store_in_relational":row.get::<bool,_>("store_in_relational")
            })).map_err(|_| "invalid_stored_definition")?;
            if message.from != owner || message.to != [owner] || message.content != json!({})
                || !crypto::signature_matches_public_key(&message.signature, &public_key)
                || !crypto::verify_signature(&message) { return Err("invalid_stored_definition"); }
            message.content = crypto::decrypt_content(message.encryption.as_ref().ok_or("unencrypted_definition")?, &aad(&message), &self.encryption_key)
                .ok_or("definition_decryption_failed")?;
            let value = serde_json::to_value(message).map_err(|_| "invalid_stored_definition")?;
            if value["type"] == "runbook_definition" {
                self.definition_cache.lock().map_err(|_| "cache_unavailable")?.parse(owner, &value)?;
            } else { validate_record(owner, &value)?; }
            Ok(value)
        }).collect()
    }

    pub(crate) async fn append(
        &self,
        owner: &str,
        value: Value,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<()> {
        validate_record(owner, &value)?;
        if value["type"] == "runbook_definition" {
            self.definition_cache
                .lock()
                .map_err(|_| "cache_unavailable")?
                .clear();
        }
        let mut message: AFPMessage =
            serde_json::from_value(value).map_err(|_| "invalid_definition_envelope")?;
        // PostgreSQL stores microseconds. Canonicalise before encryption/signing so
        // an at-rest round trip preserves both the AAD and signature exactly.
        let timestamp = DateTime::parse_from_rfc3339(&message.timestamp)
            .map_err(|_| "invalid_timestamp")?
            .with_timezone(&Utc);
        message.timestamp = timestamp.to_rfc3339_opts(SecondsFormat::Micros, true);
        message.encryption = Some(crypto::encrypt_content(
            &message.content,
            &aad(&message),
            &self.encryption_key,
        ));
        message.content = json!({});
        crypto::sign_message(&mut message, &self.signing_key);
        let table = format!("\"{}\".messages", tenant_schema_name(owner));
        sqlx::query(&format!("INSERT INTO {table} (id,thread_id,parent_id,from_agent,to_agents,timestamp,type,kind,subtype,content,metadata,signature,encryption,\"references\",supertags,store_in_relational) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE)"))
            .bind(&message.id).bind(&message.thread_id).bind(&message.parent_id).bind(&message.from)
            .bind(json!(message.to)).bind(DateTime::parse_from_rfc3339(&message.timestamp).map_err(|_| "invalid_timestamp")?)
            .bind(&message.r#type).bind(&message.kind).bind(&message.subtype).bind(&message.content)
            .bind(&message.metadata).bind(&message.signature).bind(&message.encryption)
            .bind(json!(message.references)).bind(&message.supertags)
            .execute(&mut **tx).await.map_err(|_| "storage_unavailable")?;
        Ok(())
    }
}

fn aad(message: &AFPMessage) -> Value {
    json!({"protocol":message.protocol,"id":message.id,"thread_id":message.thread_id,
        "parent_id":message.parent_id.as_deref().unwrap_or(""),"from":message.from,"to":message.to,
        "timestamp":message.timestamp,"type":message.r#type,"subtype":message.subtype,"metadata":message.metadata})
}

pub(crate) fn digest(value: &Value) -> String {
    hex::encode(Sha256::digest(value.to_string().as_bytes()))
}

fn validate_record(owner: &str, value: &Value) -> Result<()> {
    match value["type"].as_str() {
        Some("action" | "runbook_review_gate") => {
            crate::runbook_review_gate::validate(owner, value)?
        }
        Some("runbook_budget_policy") => {
            crate::runbook_budget::validate(owner, value)?;
        }
        Some("runbook_model_reservation" | "runbook_model_result") => {
            crate::runbook_model_runtime::validate(owner, value)?
        }
        Some("proactive_suggestion") => crate::runbook_emit::validate_suggestion(owner, value)?,
        Some("runbook_emission") => {
            crate::runbook_emit::validate_receipt(owner, value)?;
        }
        Some("runbook_transform") => {
            crate::runbook_transform_runtime::validate(owner, value)?;
        }
        Some("runbook_outcome") => {
            crate::runbook_outcome::validate(owner, value)?;
        }
        Some("provenance_record") => crate::runbook_provenance::validate(owner, value)?,
        Some("runbook_input_supplied" | "runbook_schedule" | "runbook_follow_up") => {
            crate::runbook_control::validate(owner, value)?;
        }
        Some("runbook_policy") => {
            crate::runbook_authority::parse_policy_receipt(owner, value)?;
        }
        Some("runbook_evidence") => {
            crate::runbook_read::parse_receipt(owner, value)?;
        }
        Some("runbook_definition") => {
            crate::runbook_registry::parse_definition_afp(owner, value)?;
        }
        Some("runbook_instance" | "runbook_step_trace" | "epistemic_escalation") => {
            crate::runbook_afp::parse_runtime_afp(owner, value)?;
        }
        Some("runbook_dispatch" | "runbook_resolution") => {
            crate::runbook_runtime::validate_audit(owner, value)?;
        }
        _ => return Err("unsupported_runbook_record"),
    }
    Ok(())
}
