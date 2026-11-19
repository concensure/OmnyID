//! Operator-only bounded fixture probe. Never run with an application database.
//! Requires a dedicated empty database and an external network-isolation boundary.
use chrono::Utc;
use omnyid_homeserver::{
    db::{Db, UserRecord},
    runbook_contract::InstanceState,
    runbook_event::normalize_stored_event,
    runbook_matcher::{MatchDecision, MatchDisposition, match_event},
    runbook_read::ReadRequest,
    runbook_runtime::RunbookRuntime,
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::postgres::PgConnectOptions;
use std::{collections::HashSet, str::FromStr};
use ulid::Ulid;

fn counts(decisions: &[MatchDecision]) -> Value {
    let count = |kind| decisions.iter().filter(|d| d.disposition == kind).count();
    json!({"matched":count(MatchDisposition::Matched),
        "duplicate":count(MatchDisposition::Duplicate),
        "dedupe_group":count(MatchDisposition::DedupeGroup),
        "event_cap":count(MatchDisposition::EventCap)})
}
async fn count(db: &Db, owner: &str, kind: &str) -> i64 {
    assert!(owner.len() == 26 && owner.bytes().all(|c| c.is_ascii_alphanumeric()));
    let schema = format!("user_{}", owner.to_lowercase());
    sqlx::query_scalar(&format!(
        "SELECT count(*) FROM \"{schema}\".messages WHERE type=$1"
    ))
    .bind(kind)
    .fetch_one(&db.pool)
    .await
    .unwrap()
}
async fn fixture_user(db: &Db, label: &str) -> UserRecord {
    let id = Ulid::new().to_string();
    let user = UserRecord {
        id: id.clone(),
        email: format!("wed378-{label}-{id}@omnyid.test"),
        password_hash: None,
        auth_provider: "password".into(),
        google_sub: None,
        display_name: format!("WED378 {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.unwrap();
    user
}

#[tokio::main]
async fn main() {
    tokio::time::timeout(std::time::Duration::from_secs(180), probe())
        .await
        .expect("probe exceeded bounded 180-second window");
}
async fn probe() {
    let started_at = Utc::now();
    let sha = std::env::var("RUNBOOK_PROBE_SOURCE_SHA").expect("full frozen SHA required");
    assert!(sha.len() == 40 && sha.bytes().all(|c| c.is_ascii_hexdigit()));
    assert_eq!(
        std::env::var("RUNBOOK_PROBE_ISOLATED").as_deref(),
        Ok("wed378-disposable")
    );
    let url = std::env::var("RUNBOOK_PROBE_DATABASE_URL").expect("dedicated database required");
    let options = PgConnectOptions::from_str(&url).expect("invalid probe database URL");
    assert_eq!(options.get_database(), Some("wed378_runbook_probe"));
    assert_eq!(options.get_host(), "omnyid-wed378-probe-postgres");
    // The runner must additionally provide an internal-only Docker network and no
    // provider credentials. No model/provider adapter is composed in this binary.
    for (key, value) in std::env::vars() {
        if key.starts_with("OMNYID_RUNBOOK_") && key.ends_with("_ENABLED") {
            assert_eq!(value, "false", "rollout flags must remain off");
        }
        assert!(
            !key.contains("API_KEY")
                && !key.contains("SIGNING_KEY")
                && !key.contains("ENCRYPTION_KEY"),
            "application/provider credentials must not enter the probe"
        );
    }
    // Check emptiness before Db::new may apply migrations; never mutate a populated database.
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let tables: i64 = sqlx::query_scalar("SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(tables, 0, "probe requires a new empty database");
    pool.close().await;
    let db = Db::new(&url).await.unwrap();
    let alice = fixture_user(&db, "micro-24-budget-18000").await;
    let bob = fixture_user(&db, "garden-120-budget-45000").await;
    // Ephemeral random keys are used only for this isolated, retained fixture database.
    let store = RunbookStore::new(&db, rand::random(), rand::random());
    let mut definitions = vec![];
    for i in 0..9 {
        let mut d = starter_definitions()
            .into_iter()
            .find(|d| d.runbook_id == "vendor_quote_received")
            .unwrap();
        d.runbook_id = format!("wed378_{i}");
        d.enabled = i < 8;
        d.trigger.event_types = vec!["workflow_failed".into()];
        d.dedupe_group = if i < 2 { Some("shared".into()) } else { None };
        definitions.push(d.clone());
        store.save(&alice.id, None, d).await.unwrap();
    }
    let pack_hash = hex::encode(Sha256::digest(serde_json::to_vec(&definitions).unwrap()));
    let registry = store.registry(&alice.id).await.unwrap();
    assert_eq!(registry.definitions().count(), 9);
    assert_eq!(
        store.registry(&bob.id).await.unwrap().definitions().count(),
        0
    );
    let event_id = Ulid::new().to_string();
    let message = json!({"protocol":"afp-v1","id":event_id,"type":"workflow_failed",
        "to":[alice.id],"thread_id":"wed378:fixture","timestamp":Utc::now().to_rfc3339(),
        "content":{"confidence":0.9,"metadata":{"status":"failed"}}});
    db.insert_daemon_afp_message(&message).await.unwrap();
    let stored: Value =
        sqlx::query_scalar("SELECT payload FROM afp_messages WHERE owner_user_id=$1 AND id=$2")
            .bind(&alice.id)
            .bind(&event_id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    let event = normalize_stored_event(&alice.id, &alice.id, &stored).unwrap();
    let before = count(&db, &alice.id, "runbook_instance").await;
    let first = match_event(&alice.id, &registry, &event, &HashSet::new()).unwrap();
    let expected = json!({"matched":5,"duplicate":0,"dedupe_group":1,"event_cap":2});
    assert_eq!(counts(&first), expected);
    let keys = first
        .iter()
        .filter(|d| d.disposition == MatchDisposition::Matched)
        .map(|d| d.instance_key.clone())
        .collect();
    let replay = match_event(&alice.id, &registry, &event, &keys).unwrap();
    let replay_expected = json!({"matched":0,"duplicate":5,"dedupe_group":1,"event_cap":2});
    assert_eq!(counts(&replay), replay_expected);
    assert_eq!(
        match_event(&bob.id, &registry, &event, &HashSet::new()).unwrap_err(),
        "owner_mismatch"
    );
    let after = count(&db, &alice.id, "runbook_instance").await;
    assert_eq!((before, after), (0, 0));
    assert_eq!(count(&db, &alice.id, "runbook_step_trace").await, 0);
    let shadow = json!({"definitions":9,"expected":expected,"observed":counts(&first),
        "replay_expected":replay_expected,"replay_observed":counts(&replay),
        "instance_records_before":before,"instance_records_after":after,"cross_owner_denials":1});

    // Separate bounded deterministic runtime phase. Read evidence only; no fabricated
    // local result hashes and no model, tool, emit, scheduling or approval adapter.
    let runtime = RunbookRuntime::new(&store);
    assert_eq!(
        runtime.dispatch(&bob.id, &event_id).await.unwrap_err(),
        "event_not_found_or_too_large"
    );
    let (left, right) = tokio::join!(
        runtime.dispatch(&alice.id, &event_id),
        runtime.dispatch(&alice.id, &event_id)
    );
    let receipt = left.unwrap();
    assert_eq!(receipt, right.unwrap());
    assert_eq!(receipt.instance_ids.len(), 5);
    assert_eq!(count(&db, &alice.id, "runbook_instance").await, 5);
    let id = &receipt.instance_ids[0];
    assert_eq!(
        runtime.instance(&bob.id, id).await.unwrap_err(),
        "instance_not_found"
    );
    assert_eq!(
        runtime.start(&alice.id, id, 0).await.unwrap_err(),
        "stale_revision"
    );
    runtime.start(&alice.id, id, 1).await.unwrap();
    let request = ReadRequest {
        step_id: "read".into(),
        expected_revision: 2,
        snapshot_ref: None,
        decrypt_limit: 8,
        byte_limit: 262144,
    };
    assert_eq!(
        runtime
            .execute_read(&bob.id, id, &request)
            .await
            .unwrap_err(),
        "instance_not_found"
    );
    let (left, right) = tokio::join!(
        runtime.execute_read(&alice.id, id, &request),
        runtime.execute_read(&alice.id, id, &request)
    );
    let read = left.unwrap();
    assert_eq!(read, right.unwrap());
    assert!(
        read.packet
            .included
            .iter()
            .any(|e| e.reference == format!("message:{event_id}"))
    );
    assert_eq!(count(&db, &alice.id, "runbook_step_trace").await, 1);
    let mut changed = request.clone();
    changed.byte_limit = 1000;
    assert_eq!(
        runtime
            .execute_read(&alice.id, id, &changed)
            .await
            .unwrap_err(),
        "step_replay_conflict"
    );
    runtime.cancel(&alice.id, id, 3).await.unwrap();
    assert_eq!(
        runtime.start(&alice.id, id, 4).await.unwrap_err(),
        "instance_not_matched"
    );
    assert_eq!(
        runtime
            .instance(&alice.id, id)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Cancelled
    );
    assert_eq!(count(&db, &bob.id, "runbook_instance").await, 0);
    assert_eq!(count(&db, &bob.id, "runbook_step_trace").await, 0);
    println!("{}", serde_json::to_string_pretty(&json!({
        "schema":"runbook_hosted_probe.v1","source_sha":sha,"started_at":started_at,
        "finished_at":Utc::now(),"maximum_duration_seconds":180,"definition_pack_sha256":pack_hash,
        "owners":[{"id":alice.id,"email":alice.email},{"id":bob.id,"email":bob.email}],
        "event_kinds":["workflow_failed"],"definition_ids":definitions.iter().map(|d| &d.runbook_id).collect::<Vec<_>>(),
        "shadow":shadow,"deterministic":{"instances":5,"started_instances":1,"read_traces":1,
            "concurrent_dispatch_replay_checks":1,"concurrent_read_replay_checks":1,
            "cross_owner_denials":3,"stale_revision_denials":1,"changed_replay_denials":1,
            "terminal_reopen_denials":1,"foreign_instance_records":0,"foreign_trace_records":0},
        "model_or_provider_adapters_composed":false,"application_rollout_enabled":false,
        "limitations":["operator fixture probe, not an enabled application worker cohort",
            "only one read step executed; transform/emit/model/tool rollout gates remain open",
            "network isolation and binary/source provenance are supplied by the external runner"]
    })).unwrap());
}
