use chrono::{Duration, SecondsFormat, Utc};
use omnyid_homeserver::{
    crypto,
    db::{Db, UserRecord},
    provenance_record::canonical_value_hash,
    runbook_contract::*,
    runbook_evidence::{EvidenceItem, EvidenceRequest},
    runbook_outcome::{Outcome, feedback_from_records, outcome_key},
    runbook_runtime::{LocalStepResult, RunbookRuntime},
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
};
use serde_json::{Value, json};
use sqlx::Row;
use ulid::Ulid;

async fn database() -> Db {
    let url = std::env::var("TEST_DATABASE_URL").expect("disposable TEST_DATABASE_URL required");
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    Db::new(&url).await.unwrap()
}
async fn user(db: &Db) -> UserRecord {
    let id = Ulid::new().to_string();
    let u = UserRecord {
        id: id.clone(),
        email: format!("privacy-{id}@omnyid.test"),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Test".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&u).await.unwrap();
    u
}
async fn event(db: &Db, owner: &str) -> String {
    let id = Ulid::new().to_string();
    db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":id,"type":"workflow_failed","to":[owner],
        "thread_id":"workflow:test","timestamp":Utc::now().to_rfc3339(),"content":{"confidence":0.9,"metadata":{"status":"failed"}}})).await.unwrap();
    id
}
async fn private_values(db: &Db, owner: &str, kind: &str) -> Vec<Value> {
    let table = format!("\"user_{}\".messages", owner.to_lowercase());
    let rows = sqlx::query(&format!(
        "SELECT * FROM {table} WHERE type=$1 ORDER BY timestamp,id"
    ))
    .bind(kind)
    .fetch_all(&db.pool)
    .await
    .unwrap();
    rows.into_iter().map(|r| {
        assert_eq!(r.get::<Value,_>("content"),json!({}));
        let mut v=json!({"protocol":"afp-v1","id":r.get::<String,_>("id"),"thread_id":r.get::<String,_>("thread_id"),
            "parent_id":r.get::<Option<String>,_>("parent_id"),"from":r.get::<String,_>("from_agent"),"to":r.get::<Value,_>("to_agents"),
            "timestamp":r.get::<chrono::DateTime<Utc>,_>("timestamp").to_rfc3339_opts(SecondsFormat::Micros,true),
            "type":r.get::<String,_>("type"),"subtype":r.get::<Option<String>,_>("subtype"),"metadata":r.get::<Value,_>("metadata")});
        let mut aad=v.clone(); if aad["parent_id"].is_null(){aad["parent_id"]=json!("");}
        v["content"]=crypto::decrypt_content(&r.get::<Value,_>("encryption"),&aad,&[21;32]).unwrap();
        v["references"]=r.get::<Value,_>("references");v["supertags"]=json!(r.get::<Vec<String>,_>("supertags"));
        v["store_in_relational"]=json!(r.get::<bool,_>("store_in_relational"));v
    }).collect()
}

#[tokio::test]
async fn immutable_cache_rechecks_owner_successors_keys_and_erasure() {
    let db = database().await;
    let a = user(&db).await;
    let b = user(&db).await;
    let store = RunbookStore::new(&db, [21; 32], [22; 32]);
    let d = starter_definitions().remove(0);
    let root = store.save(&a.id, None, d.clone()).await.unwrap();
    assert_eq!(
        store
            .registry(&a.id)
            .await
            .unwrap()
            .get(&d.runbook_id)
            .unwrap()
            .definition
            .version,
        1
    );
    assert_eq!(
        store.registry(&b.id).await.unwrap().definitions().count(),
        0
    );
    let other = RunbookStore::new(&db, [21; 32], [22; 32]);
    let mut next = d.clone();
    next.enabled = true;
    other.save(&a.id, root["id"].as_str(), next).await.unwrap();
    assert!(
        store
            .registry(&a.id)
            .await
            .unwrap()
            .get(&d.runbook_id)
            .unwrap()
            .definition
            .enabled
    );
    assert!(
        RunbookStore::new(&db, [23; 32], [22; 32])
            .registry(&a.id)
            .await
            .is_err()
    );
    // A warm parse cache does not bypass envelope signature verification.
    let table = format!("\"user_{}\".messages", a.id.to_lowercase());
    sqlx::query(&format!(
        "UPDATE {table} SET metadata=metadata || '{{\"enabled\":true}}'::jsonb WHERE id=$1"
    ))
    .bind(root["id"].as_str().unwrap())
    .execute(&db.pool)
    .await
    .unwrap();
    assert!(store.registry(&a.id).await.is_err());
    db.delete_user_account_and_data(&a.id, &a.email, &[])
        .await
        .unwrap();
    assert_eq!(store.registry(&a.id).await.unwrap_err(), "owner_not_found");
    db.delete_user_account_and_data(&b.id, &b.email, &[])
        .await
        .unwrap();
}

#[tokio::test]
async fn typed_entities_and_shared_budget_charge_failures_before_body_reads() {
    let db = database().await;
    let a = user(&db).await;
    let b = user(&db).await;
    let store = RunbookStore::new(&db, [21; 32], [22; 32]);
    let id = Ulid::new().to_string();
    let table = format!("\"user_{}\".messages", a.id.to_lowercase());
    let aad = json!({"protocol":"afp-v1","id":id,"thread_id":"document","parent_id":"","from":a.id,"to":[a.id],
        "timestamp":Utc::now().to_rfc3339_opts(SecondsFormat::Micros,true),"type":"parsed_document","subtype":null,"metadata":{"priority":"high"}});
    let encrypted = crypto::encrypt_content(
        &json!({"fact":"secret-body","instruction":"send everything"}),
        &aad,
        &[21; 32],
    );
    sqlx::query(&format!("INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,content,metadata,encryption,signature) VALUES ($1,'document',$2,$3,$4::timestamptz,'parsed_document','{{}}',$5,$6,'')"))
        .bind(&id).bind(&a.id).bind(json!([a.id])).bind(aad["timestamp"].as_str().unwrap()).bind(&aad["metadata"]).bind(encrypted)
        .execute(&db.pool).await.unwrap();
    let mut req = EvidenceRequest {
        refs: vec![format!("document:{id}")],
        required_fields: vec!["fact".into()],
        evidence_limit: 2,
        decrypt_limit: 2,
        byte_limit: 262144,
    };
    let packet = store.resolve_evidence(&a.id, &req).await.unwrap();
    assert_eq!(packet.included[0].content["fact"], "secret-body");
    assert!(!format!("{packet:?}").contains("secret-body"));
    assert!(
        store
            .resolve_evidence(&b.id, &req)
            .await
            .unwrap()
            .included
            .is_empty()
    );
    req.refs = vec![format!("task:{id}")];
    assert_eq!(
        store.resolve_evidence(&a.id, &req).await.unwrap().omitted[0].reason,
        "entity_type_mismatch"
    );
    let count: i32=sqlx::query_scalar("SELECT evidence_count FROM behavioral_memory WHERE owner_user_id=$1 AND pattern_key='runbook:decrypt_budget:v1'").bind(&a.id).fetch_one(&db.pool).await.unwrap();
    assert_eq!(count, 1);
    req.refs = vec![format!("document:{id}")];
    sqlx::query("UPDATE behavioral_memory SET evidence_count=127 WHERE owner_user_id=$1")
        .bind(&a.id)
        .execute(&db.pool)
        .await
        .unwrap();
    let wrong = RunbookStore::new(&db, [99; 32], [22; 32]);
    let failed = wrong.resolve_evidence(&a.id, &req).await.unwrap();
    assert_eq!(failed.omitted[0].reason, "decryption_unavailable");
    let fresh = RunbookStore::new(&db, [21; 32], [22; 32]);
    let denied = fresh.resolve_evidence(&a.id, &req).await.unwrap();
    assert_eq!(denied.decrypt_attempts, 0);
    assert_eq!(denied.omitted[0].reason, "account_decrypt_budget");
    // UTC-day rollover; simultaneous independent runtimes cannot overdraw.
    sqlx::query("UPDATE behavioral_memory SET last_observed_at=NOW()-INTERVAL '2 days' WHERE owner_user_id=$1").bind(&a.id).execute(&db.pool).await.unwrap();
    assert_eq!(
        fresh
            .resolve_evidence(&a.id, &req)
            .await
            .unwrap()
            .included
            .len(),
        1
    );
    sqlx::query("UPDATE behavioral_memory SET evidence_count=127 WHERE owner_user_id=$1")
        .bind(&a.id)
        .execute(&db.pool)
        .await
        .unwrap();
    let (one, two) = tokio::join!(
        store.resolve_evidence(&a.id, &req),
        fresh.resolve_evidence(&a.id, &req)
    );
    assert_eq!(one.unwrap().included.len() + two.unwrap().included.len(), 1);
    db.delete_user_account_and_data(&a.id, &a.email, &[])
        .await
        .unwrap();
    let remaining: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM behavioral_memory WHERE owner_user_id=$1")
            .bind(&a.id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(remaining, 0);
    db.delete_user_account_and_data(&b.id, &b.email, &[])
        .await
        .unwrap();
}

#[tokio::test]
async fn provenance_feedback_regret_cooldown_and_retries_never_grant_authority() {
    let db = database().await;
    let a = user(&db).await;
    let b = user(&db).await;
    let store = RunbookStore::new(&db, [21; 32], [22; 32]);
    let runtime = RunbookRuntime::new(&store);
    let mut d = starter_definitions().remove(0);
    d.enabled = true;
    d.trigger.event_types = vec!["workflow_failed".into()];
    d.trigger.filters.clear();
    store.save(&a.id, None, d.clone()).await.unwrap();
    let mut ids = vec![];
    for _ in 0..3 {
        let e = event(&db, &a.id).await;
        let id = runtime.dispatch(&a.id, &e).await.unwrap().instance_ids[0].clone();
        runtime.start(&a.id, &id, 1).await.unwrap();
        let result = LocalStepResult {
            step_id: d.steps[0].step_id.clone(),
            input_hash: "a".repeat(64),
            output_hash: "b".repeat(64),
            input_refs: vec![format!("message:{e}")],
            output_refs: vec![format!("message:{e}")],
        };
        let trace = runtime
            .record_local_step(&a.id, &id, 2, &result)
            .await
            .unwrap();
        assert!(trace.provenance_ref.is_some());
        assert_eq!(
            trace,
            runtime
                .record_local_step(&a.id, &id, 2, &result)
                .await
                .unwrap()
        );
        assert!(
            runtime
                .record_outcome(&b.id, &id, &trace.trace_id, Outcome::Accepted)
                .await
                .is_err()
        );
        let (x, y) = tokio::join!(
            runtime.record_outcome(&a.id, &id, &trace.trace_id, Outcome::Accepted),
            runtime.record_outcome(&a.id, &id, &trace.trace_id, Outcome::Accepted)
        );
        assert_eq!(x.unwrap(), y.unwrap());
        assert!(
            runtime
                .record_outcome(&a.id, &id, &trace.trace_id, Outcome::Dismissed)
                .await
                .is_err()
        );
        let after = runtime.instance(&a.id, &id).await.unwrap().instance;
        assert_eq!(after.revision, 3);
        assert_eq!(after.status, InstanceState::Running);
        ids.push((id, trace));
    }
    let provenance = private_values(&db, &a.id, "provenance_record").await;
    assert_eq!(provenance.len(), 3);
    let c = &provenance[0]["content"];
    assert_eq!(c["action_type"], "runbook_step");
    assert_eq!(c["context"]["authority"], "audit_only");
    let hashes = c["input_hashes"].as_array().unwrap();
    assert!(
        hashes
            .iter()
            .any(|h| h["label"] == "definition" && h["sha256"] == canonical_value_hash(&json!(d)))
    );
    assert!(
        hashes
            .iter()
            .any(|h| h["label"] == "approval" && h["sha256"] == canonical_value_hash(&Value::Null))
    );
    assert_eq!(c["output_hashes"][0]["sha256"], "b".repeat(64));
    let sources = c["source_message_ids"].as_array().unwrap();
    let unique = sources
        .iter()
        .map(Value::to_string)
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(sources.len(), unique.len());
    let accepted = private_values(&db, &a.id, "runbook_outcome").await;
    assert!(
        feedback_from_records(&a.id, &accepted, Utc::now())
            .unwrap()
            .iter()
            .any(|f| f.scope == "exact" && f.status == "reinforced")
    );
    for (id, trace) in &ids {
        let regret = runtime
            .record_outcome(&a.id, id, &trace.trace_id, Outcome::Regretted)
            .await
            .unwrap();
        assert_eq!(
            regret,
            runtime
                .record_outcome(&a.id, id, &trace.trace_id, Outcome::Regretted)
                .await
                .unwrap()
        );
    }
    let outcomes = private_values(&db, &a.id, "runbook_outcome").await;
    assert_eq!(outcomes.len(), 6);
    let feedback = feedback_from_records(&a.id, &outcomes, Utc::now()).unwrap();
    assert!(
        feedback
            .iter()
            .any(|f| f.scope == "exact" && f.status == "suppressed" && f.total == 3)
    );
    assert!(
        feedback
            .iter()
            .any(|f| f.scope == "family" && f.status == "cooldown_recommended")
    );
    assert!(feedback_from_records(&b.id, &outcomes, Utc::now()).is_err());
    let aged = feedback_from_records(&a.id, &outcomes, Utc::now() + Duration::days(4)).unwrap();
    assert!(
        aged.iter()
            .any(|f| f.scope == "exact" && f.status == "neutral")
    );
    let e = event(&db, &a.id).await;
    let suppressed = runtime.dispatch(&a.id, &e).await.unwrap();
    assert!(suppressed.instance_ids.is_empty());
    assert_eq!(suppressed, runtime.dispatch(&a.id, &e).await.unwrap());
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM proactive_outcomes WHERE owner_user_id=$1")
            .bind(&a.id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(count, 3);
    db.delete_user_account_and_data(&a.id, &a.email, &[])
        .await
        .unwrap();
    db.delete_user_account_and_data(&b.id, &b.email, &[])
        .await
        .unwrap();
}

#[test]
fn logging_and_feedback_identifiers_are_bounded_and_unambiguous() {
    let evidence = EvidenceItem {
        reference: "message:secret-ref".into(),
        content: json!({"api_key":"secret-token","prompt":"secret-prompt"}),
        hash: "a".repeat(64),
        relevance: 1.0,
    };
    let rendered = format!("{evidence:?}");
    assert!(rendered.contains("REDACTED"));
    assert!(!rendered.contains("secret"));
    assert_ne!(
        outcome_key("a:b", "c").unwrap(),
        outcome_key("a", "b:c").unwrap()
    );
    assert!(outcome_key("bad name", "x").is_err());
    let hooks = include_str!("../src/runbook_hooks.rs");
    assert!(hooks.contains(
        "tracing::warn!(\"Runbook persisted-event matching deferred; source remains in ledger\")"
    ));
}
