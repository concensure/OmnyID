//! Hosted acceptance of the actual persisted-event deterministic cohort hook.
use chrono::{Duration, Utc};
use omnyid_homeserver::{
    db::{Db, UserRecord},
    runbook_contract::*,
    runbook_deterministic::DeterministicPolicy,
    runbook_runtime::RunbookRuntime,
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
};
use serde_json::json;
use sqlx::postgres::PgConnectOptions;
use std::str::FromStr;
use ulid::Ulid;
const ALICE: &str = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const BOB: &str = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const FOREIGN: &str = "01ARZ3NDEKTSV4RRFFQ69G5FAX";
async fn count(db: &Db, owner: &str, kind: &str) -> i64 {
    assert!([ALICE, BOB, FOREIGN].contains(&owner));
    sqlx::query_scalar(&format!(
        "SELECT count(*) FROM \"user_{}\".messages WHERE type=$1",
        owner.to_lowercase()
    ))
    .bind(kind)
    .fetch_one(&db.pool)
    .await
    .unwrap()
}
fn key(name: &str) -> [u8; 32] {
    hex::decode(std::env::var(name).unwrap())
        .unwrap()
        .try_into()
        .unwrap()
}
#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter("omnyid_homeserver::runbook_hooks=info")
        .init();
    tokio::time::timeout(std::time::Duration::from_secs(180), probe())
        .await
        .unwrap();
}
async fn probe() {
    let now = Utc::now();
    for (enabled, owners, definitions, expires) in [
        (
            "false",
            ALICE,
            "budget_threshold@1",
            (now + Duration::minutes(1)).to_rfc3339(),
        ),
        (
            "true",
            ALICE,
            "budget_threshold@1",
            (now + Duration::hours(2)).to_rfc3339(),
        ),
        (
            "true",
            ALICE,
            "budget_threshold",
            (now + Duration::minutes(1)).to_rfc3339(),
        ),
        (
            "true",
            "bad owner",
            "budget_threshold@1",
            (now + Duration::minutes(1)).to_rfc3339(),
        ),
        ("true", ALICE, "budget_threshold@1", "invalid".into()),
    ] {
        assert!(
            !DeterministicPolicy::parse(enabled, owners, definitions, &expires, now)
                .owner_allowed(ALICE, now)
        );
    }
    let started = Utc::now();
    let sha = std::env::var("RUNBOOK_PROBE_SOURCE_SHA").unwrap();
    assert!(sha.len() == 40 && sha.bytes().all(|c| c.is_ascii_hexdigit()));
    assert_eq!(
        std::env::var("RUNBOOK_PROBE_ISOLATED").as_deref(),
        Ok("wed379-disposable")
    );
    let url = std::env::var("RUNBOOK_PROBE_DATABASE_URL").unwrap();
    let opts = PgConnectOptions::from_str(&url).unwrap();
    assert_eq!(opts.get_host(), "omnyid-wed379-probe-postgres");
    assert_eq!(opts.get_database(), Some("wed379_runbook_probe"));
    assert!(!std::env::vars().any(|(k, _)| k.contains("API_KEY")));
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let tables:i64=sqlx::query_scalar("SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(tables, 0);
    pool.close().await;
    let db = Db::new(&url).await.unwrap();
    let store = RunbookStore::new(
        &db,
        key("OMNYID_ENCRYPTION_KEY_HEX"),
        key("OMNYID_SIGNING_KEY_HEX"),
    );
    let runtime = RunbookRuntime::new(&store);
    let policy = DeterministicPolicy::from_env();
    assert!(policy.owner_allowed(ALICE, Utc::now()) && policy.owner_allowed(BOB, Utc::now()));
    assert!(!policy.owner_allowed(FOREIGN, Utc::now()));
    for owner in [ALICE, BOB, FOREIGN] {
        db.create_user(&UserRecord {
            id: owner.into(),
            email: format!("wed379-{owner}@omnyid.test"),
            password_hash: None,
            auth_provider: "password".into(),
            google_sub: None,
            display_name: "Isolated cohort".into(),
            created_at: Utc::now().to_rfc3339(),
        })
        .await
        .unwrap();
        store.registry(owner).await.unwrap();
    }
    let mut scenarios = vec![];
    for (owner, guests, budget, committed) in [
        (ALICE, 24, 1800000, 1900000),
        (BOB, 120, 4500000, 4000000),
        (FOREIGN, 8, 800000, 500000),
    ] {
        let mut definition = starter_definitions()
            .into_iter()
            .find(|d| d.runbook_id == "budget_threshold")
            .unwrap();
        definition.enabled = true;
        assert!(policy.definition_allowed(&definition));
        store.save(owner, None, definition.clone()).await.unwrap();
        let reference = Ulid::new().to_string();
        let facts = json!({"wedding_test_profile":{"guests":guests,"budget_minor":budget,"currency":"AUD"},
            "total_budget":{"amount_minor":budget,"currency":"AUD"},"category_target":{"venue":{"amount_minor":budget,"currency":"AUD"}},
            "commitments":[{"reference":format!("message:{reference}"),"category":"venue","amount_minor":committed,"currency":"AUD"}]});
        db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":reference,"type":"ledger","to":[owner],"thread_id":"wed379:budget",
            "timestamp":Utc::now().to_rfc3339(),"content":facts})).await.unwrap();
        let event = Ulid::new().to_string();
        let input = json!({"protocol":"afp-v1","id":event,"type":"passive_event","to":[owner],"thread_id":"wed379:budget",
            "timestamp":Utc::now().to_rfc3339(),"content":{"event_type":"wedding_commitment_changed","event_at":Utc::now().to_rfc3339(),"confidence":0.9,"source_refs":[format!("message:{reference}")]}});
        // This application DB entrypoint invokes persisted_event; no direct executor call.
        let (first, second) = tokio::join!(
            db.insert_daemon_afp_message(&input),
            db.insert_daemon_afp_message(&input)
        );
        first.unwrap();
        second.unwrap();
        if owner == FOREIGN {
            assert_eq!(count(&db, owner, "runbook_instance").await, 0);
            assert_eq!(count(&db, owner, "proactive_suggestion").await, 0);
            continue;
        }
        let receipt = runtime.dispatch(owner, &event).await.unwrap();
        assert_eq!(receipt.instance_ids.len(), 1);
        let id = &receipt.instance_ids[0];
        let instance = runtime.instance(owner, id).await.unwrap().instance;
        assert_eq!(instance.status, InstanceState::Completed);
        assert_eq!(count(&db, owner, "runbook_step_trace").await, 4);
        assert_eq!(count(&db, owner, "proactive_suggestion").await, 1);
        let review = runtime
            .execute_transform(owner, id, "assess", 3)
            .await
            .unwrap();
        assert_eq!(review.result.conclusions["over_budget"], committed > budget);
        assert_eq!(review.result.conclusions["committed_minor"], committed);
        let (left, right) = tokio::join!(
            db.insert_daemon_afp_message(&input),
            db.insert_daemon_afp_message(&input)
        );
        left.unwrap();
        right.unwrap();
        assert_eq!(count(&db, owner, "runbook_step_trace").await, 4);
        assert_eq!(count(&db, owner, "proactive_suggestion").await, 1);
        assert_eq!(
            runtime.instance(FOREIGN, id).await.unwrap_err(),
            "instance_not_found"
        );
        let other_allowed = if owner == ALICE { BOB } else { ALICE };
        assert_eq!(
            runtime.instance(other_allowed, id).await.unwrap_err(),
            "instance_not_found"
        );
        assert_eq!(
            runtime
                .start(owner, id, instance.revision)
                .await
                .unwrap_err(),
            "instance_not_matched"
        );
        let expired = DeterministicPolicy::parse(
            "true",
            owner,
            "budget_threshold@1",
            &(Utc::now() - Duration::seconds(1)).to_rfc3339(),
            Utc::now(),
        );
        assert_eq!(
            runtime
                .run_deterministic_cohort(owner, &receipt, &expired)
                .await
                .policy_denied,
            1
        );
        let unknown_version = DeterministicPolicy::parse(
            "true",
            owner,
            "budget_threshold@2",
            &(Utc::now() + Duration::minutes(1)).to_rfc3339(),
            Utc::now(),
        );
        assert_eq!(
            runtime
                .run_deterministic_cohort(owner, &receipt, &unknown_version)
                .await
                .policy_denied,
            1
        );
        assert_eq!(
            runtime
                .run_deterministic_cohort(FOREIGN, &receipt, &policy)
                .await
                .policy_denied,
            1
        );
        assert_eq!(
            runtime
                .run_deterministic_cohort(owner, &receipt, &DeterministicPolicy::default())
                .await
                .policy_denied,
            1
        );
        scenarios.push(json!({"owner":owner,"guests":guests,"budget_minor":budget,"committed_minor":committed,
            "completed_via_persisted_hook":true,"over_budget":committed>budget,"trace_records":4,"private_reviews":1,
            "duplicate_event_checks":2,"cross_owner_denials":2,"terminal_reopen_denials":1,"policy_denials":4}));
    }
    let mut bounded_definition = starter_definitions()
        .into_iter()
        .find(|d| d.runbook_id == "budget_threshold")
        .unwrap();
    bounded_definition.runbook_id = "wed379_expiry".into();
    bounded_definition.enabled = true;
    bounded_definition.trigger.event_types = vec!["document_review_required".into()];
    store
        .save(ALICE, None, bounded_definition.clone())
        .await
        .unwrap();
    let expiry_event = Ulid::new().to_string();
    db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":expiry_event,"type":"passive_event","to":[ALICE],
        "thread_id":"wed379:expiry","timestamp":Utc::now().to_rfc3339(),"content":{"event_type":"document_review_required",
        "event_at":Utc::now().to_rfc3339(),"confidence":0.9}})).await.unwrap();
    let expiry_receipt = runtime.dispatch(ALICE, &expiry_event).await.unwrap();
    let expiry_id = &expiry_receipt.instance_ids[0];
    let mut lock = db.pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(format!("runbooks:{ALICE}"))
        .execute(&mut *lock)
        .await
        .unwrap();
    let short = DeterministicPolicy::parse(
        "true",
        ALICE,
        "wed379_expiry@1",
        &(Utc::now() + Duration::milliseconds(250)).to_rfc3339(),
        Utc::now(),
    );
    assert!(short.owner_allowed(ALICE, Utc::now()));
    let (denial, ()) = tokio::join!(
        runtime.run_deterministic_cohort(ALICE, &expiry_receipt, &short),
        async {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            lock.rollback().await.unwrap();
        }
    );
    assert_eq!(denial.policy_denied, 1);
    assert_eq!(
        runtime
            .instance(ALICE, expiry_id)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Matched
    );
    let admitted = DeterministicPolicy::parse(
        "true",
        ALICE,
        "wed379_expiry@1",
        &(Utc::now() + Duration::minutes(1)).to_rfc3339(),
        Utc::now(),
    );
    assert!(admitted.definition_allowed(&bounded_definition));
    for field in ["operation", "selector", "output"] {
        let mut changed = bounded_definition.clone();
        match field {
            "operation" => {
                changed.steps[1].operation = Some(TransformOperation::CompareCalendarConflicts)
            }
            "selector" => changed.steps[2].input_refs = vec!["event.source_refs".into()],
            _ => changed.steps[2].output_kind = Some("action".into()),
        }
        assert!(!admitted.definition_allowed(&changed));
    }
    let registry = store.registry(ALICE).await.unwrap();
    let current = registry.get("wed379_expiry").unwrap();
    bounded_definition.enabled = false;
    store
        .save(ALICE, Some(&current.message_id), bounded_definition)
        .await
        .unwrap();
    assert_eq!(
        runtime
            .run_deterministic_cohort(ALICE, &expiry_receipt, &admitted)
            .await
            .policy_denied,
        1
    );

    let mut unsafe_definition = starter_definitions().remove(0);
    unsafe_definition.runbook_id = "wed379_unsafe".into();
    unsafe_definition.enabled = true;
    unsafe_definition.trigger.event_types = vec!["workflow_failed".into()];
    assert!(!policy.definition_allowed(&unsafe_definition));
    store.save(ALICE, None, unsafe_definition).await.unwrap();
    let event = Ulid::new().to_string();
    db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":event,"type":"passive_event","to":[ALICE],"thread_id":"wed379:unsafe",
        "timestamp":Utc::now().to_rfc3339(),"content":{"event_type":"workflow_failed","event_at":Utc::now().to_rfc3339(),"confidence":0.9}})).await.unwrap();
    let receipt = runtime.dispatch(ALICE, &event).await.unwrap();
    let id = &receipt.instance_ids[0];
    assert_eq!(
        runtime.instance(ALICE, id).await.unwrap().instance.status,
        InstanceState::Matched
    );
    assert_eq!(
        runtime
            .run_deterministic_cohort(ALICE, &receipt, &policy)
            .await
            .policy_denied,
        1
    );
    assert_eq!(
        runtime.start(ALICE, id, 0).await.unwrap_err(),
        "stale_revision"
    );
    runtime.cancel(ALICE, id, 1).await.unwrap();
    assert_eq!(
        runtime.start(ALICE, id, 2).await.unwrap_err(),
        "instance_not_matched"
    );
    assert_eq!(count(&db, ALICE, "runbook_step_trace").await, 4);
    println!("{}",serde_json::to_string_pretty(&json!({"source_sha":sha,"started_at":started,"finished_at":Utc::now(),
        "scenarios":scenarios,"non_allowlisted_owner_instance_records":0,"unsafe_pipeline_started":false,
        "unsafe_pipeline_policy_denials":1,"expired_lock_denials":1,"disabled_definition_denials":1,"unsupported_contract_denials":3,"stale_revision_denials":1,"cancelled_reopen_denials":1,
        "policy_configuration_denials":5,"models_or_tools_composed":false,"production_rollout":false})).unwrap());
}
