//! Durable runtime transactions against an explicitly selected disposable database.
use chrono::{Duration, Utc};
use omnyid_homeserver::{
    db::{Db, UserRecord},
    runbook_contract::*,
    runbook_matcher::MatchDisposition,
    runbook_runtime::{LocalStepResult, RunbookRuntime},
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
};
use serde_json::{Value, json};
use ulid::Ulid;

async fn user(db: &Db) -> UserRecord {
    let id = Ulid::new().to_string();
    let u = UserRecord {
        id: id.clone(),
        email: format!("runtime-{id}@omnyid.test"),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Runtime".into(),
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
fn result(step: &str, event: &str) -> LocalStepResult {
    LocalStepResult {
        step_id: step.into(),
        input_hash: "a".repeat(64),
        input_refs: vec![format!("message:{event}")],
        output_hash: "b".repeat(64),
        output_refs: vec!["document:review".into()],
    }
}

#[tokio::test]
async fn atomic_dispatch_steps_cancellation_and_due_resolution() {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!("SKIP: TEST_DATABASE_URL required");
        return;
    };
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let alice = user(&db).await;
    let bob = user(&db).await;
    let store = RunbookStore::new(&db, [21; 32], [22; 32]);
    let runtime = RunbookRuntime::new(&store);
    for i in 0..8 {
        let mut d = starter_definitions().remove(0);
        d.runbook_id = format!("test_{i}");
        d.enabled = true;
        d.trigger.event_types = vec!["workflow_failed".into()];
        d.dedupe_group = if i < 2 { Some("shared".into()) } else { None };
        store.save(&alice.id, None, d).await.unwrap();
    }
    let trigger = event(&db, &alice.id).await;
    assert_eq!(
        runtime.dispatch(&bob.id, &trigger).await.unwrap_err(),
        "event_not_found_or_too_large"
    );
    let (a, b) = tokio::join!(
        runtime.dispatch(&alice.id, &trigger),
        runtime.dispatch(&alice.id, &trigger)
    );
    let receipt = a.unwrap();
    assert_eq!(receipt, b.unwrap());
    assert_eq!(receipt.instance_ids.len(), 5);
    assert_eq!(
        receipt
            .decisions
            .iter()
            .filter(|d| d.disposition == MatchDisposition::DedupeGroup)
            .count(),
        1
    );
    assert_eq!(
        receipt
            .decisions
            .iter()
            .filter(|d| d.disposition == MatchDisposition::EventCap)
            .count(),
        2
    );
    let id = &receipt.instance_ids[0];
    let initial = runtime.instance(&alice.id, id).await.unwrap();
    assert_eq!(initial.instance.status, InstanceState::Matched);
    assert_eq!(
        runtime.instance(&bob.id, id).await.unwrap_err(),
        "instance_not_found"
    );
    let (a, b) = tokio::join!(
        runtime.start(&alice.id, id, 1),
        runtime.start(&alice.id, id, 1)
    );
    assert_ne!(a.is_ok(), b.is_ok());
    assert_eq!(
        runtime
            .instance(&alice.id, id)
            .await
            .unwrap()
            .instance
            .revision,
        2
    );
    let step = result("read", &trigger);
    let (a, b) = tokio::join!(
        runtime.record_local_step(&alice.id, id, 2, &step),
        runtime.record_local_step(&alice.id, id, 2, &step)
    );
    let trace = a.unwrap();
    assert_eq!(trace, b.unwrap());
    assert_eq!(
        runtime
            .instance(&alice.id, id)
            .await
            .unwrap()
            .instance
            .revision,
        3
    );
    let mut changed = step.clone();
    changed.input_hash = "c".repeat(64);
    assert_eq!(
        runtime
            .record_local_step(&alice.id, id, 2, &changed)
            .await
            .unwrap_err(),
        "step_replay_conflict"
    );
    let next = result("assess", &trigger);
    assert_eq!(
        runtime
            .record_local_step(&alice.id, id, 2, &next)
            .await
            .unwrap_err(),
        "stale_revision"
    );
    // Definition edits cannot alter the version already bound to the instance.
    let registry = store.registry(&alice.id).await.unwrap();
    let current = registry.get("test_0").unwrap();
    let mut edited = current.definition.clone();
    edited.priority = 80;
    store
        .save(&alice.id, Some(&current.message_id), edited)
        .await
        .unwrap();
    assert_eq!(
        runtime.dispatch(&alice.id, &trigger).await.unwrap(),
        receipt
    );
    assert_eq!(
        runtime
            .instance(&alice.id, id)
            .await
            .unwrap()
            .instance
            .runbook_version,
        1
    );
    runtime
        .record_local_step(&alice.id, id, 3, &next)
        .await
        .unwrap();
    assert_eq!(
        runtime
            .record_local_step(&alice.id, id, 4, &result("draft", &trigger))
            .await
            .unwrap_err(),
        "step_requires_executor_integration"
    );
    let cancelled = runtime.cancel(&alice.id, id, 4).await.unwrap();
    assert_eq!(cancelled.instance.status, InstanceState::Cancelled);
    assert_eq!(
        runtime.cancel(&alice.id, id, 4).await.unwrap().message_id,
        cancelled.message_id
    );
    assert!(runtime.start(&alice.id, id, 5).await.is_err());
    assert!(runtime.cancel(&alice.id, id, 5).await.is_err());
    assert!(
        runtime
            .record_local_step(&alice.id, id, 5, &result("draft", &trigger))
            .await
            .is_err()
    );
    // Returning the already committed trace after cancellation never advances state.
    assert_eq!(
        runtime
            .record_local_step(&alice.id, id, 2, &step)
            .await
            .unwrap(),
        trace
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
    let registry = store.registry(&alice.id).await.unwrap();
    let current = registry.get("test_2").unwrap();
    let mut disabled = current.definition.clone();
    disabled.enabled = false;
    store
        .save(&alice.id, Some(&current.message_id), disabled)
        .await
        .unwrap();
    assert_eq!(
        runtime
            .start(&alice.id, &receipt.instance_ids[1], 1)
            .await
            .unwrap_err(),
        "definition_disabled"
    );
    // A stored event altered after dispatch is a conflict, never a second dispatch.
    sqlx::query("UPDATE afp_messages SET payload=jsonb_set(payload,'{content,confidence}','0.5') WHERE owner_user_id=$1 AND id=$2")
        .bind(&alice.id).bind(&trigger).execute(&db.pool).await.unwrap();
    assert_eq!(
        runtime.dispatch(&alice.id, &trigger).await.unwrap_err(),
        "event_replay_conflict"
    );
    // A new event observes current enablement while the original receipt is frozen.
    let second = event(&db, &alice.id).await;
    let second_receipt = runtime.dispatch(&alice.id, &second).await.unwrap();
    assert!(
        !second_receipt
            .decisions
            .iter()
            .any(|d| d.runbook_id == "test_2")
    );
    assert_ne!(second_receipt.instance_ids, receipt.instance_ids);
    let bob_event = event(&db, &bob.id).await;
    assert!(
        runtime
            .dispatch(&bob.id, &bob_event)
            .await
            .unwrap()
            .instance_ids
            .is_empty()
    );

    // A reviewed Wait-only fixture verifies due-time and cancellation boundaries
    // without invoking the not-yet-connected scheduler or external executor.
    let mut wait_definition = starter_definitions().remove(0);
    wait_definition.runbook_id = "wait_test".into();
    wait_definition.enabled = true;
    wait_definition.trigger.event_types = vec!["workflow_failed".into()];
    wait_definition
        .steps
        .retain(|s| matches!(s.kind, StepKind::Wait | StepKind::Complete));
    wait_definition.steps[1].input_refs = vec![];
    store.save(&bob.id, None, wait_definition).await.unwrap();
    let wait_event = event(&db, &bob.id).await;
    let waiting = runtime
        .dispatch(&bob.id, &wait_event)
        .await
        .unwrap()
        .instance_ids
        .remove(0);
    runtime.start(&bob.id, &waiting, 1).await.unwrap();
    let due = Utc::now() + Duration::milliseconds(300);
    let expiry = due + Duration::milliseconds(700);
    assert!(runtime.wait(&bob.id, &waiting, 2, due, due).await.is_err());
    let wait_record = runtime
        .wait(&bob.id, &waiting, 2, due, expiry)
        .await
        .unwrap();
    assert_eq!(wait_record.instance.status, InstanceState::WaitingForEvent);
    tokio::time::sleep(std::time::Duration::from_millis(350)).await;
    // Reaching the follow-up due time does not expire the wait prematurely.
    assert_eq!(
        runtime.expire_wait(&bob.id, &waiting, 3).await.unwrap_err(),
        "wait_not_due"
    );
    tokio::time::sleep(std::time::Duration::from_millis(700)).await;
    let (a, b) = tokio::join!(
        runtime.expire_wait(&bob.id, &waiting, 3),
        runtime.expire_wait(&bob.id, &waiting, 3)
    );
    let expired = a.unwrap();
    assert_eq!(expired.message_id, b.unwrap().message_id);
    assert_eq!(expired.instance.status, InstanceState::Failed);
    assert!(expired.instance.next_follow_up_at.is_none());
    assert!(expired.instance.wait_expires_at.is_none());
    assert!(runtime.start(&bob.id, &waiting, 4).await.is_err());
    let cancel_event = event(&db, &bob.id).await;
    let cancel_id = runtime
        .dispatch(&bob.id, &cancel_event)
        .await
        .unwrap()
        .instance_ids
        .remove(0);
    runtime.start(&bob.id, &cancel_id, 1).await.unwrap();
    runtime
        .wait(
            &bob.id,
            &cancel_id,
            2,
            Utc::now() + Duration::hours(1),
            Utc::now() + Duration::hours(2),
        )
        .await
        .unwrap();
    runtime.cancel(&bob.id, &cancel_id, 3).await.unwrap();
    assert!(runtime.expire_wait(&bob.id, &cancel_id, 4).await.is_err());

    let table = format!("\"user_{}\".messages", alice.id.to_lowercase());
    let trace_count: i64 = sqlx::query_scalar(&format!(
        "SELECT count(*) FROM {table} WHERE type='runbook_step_trace'"
    ))
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(trace_count, 2);
    let roots: i64 = sqlx::query_scalar(&format!(
        "SELECT count(*) FROM {table} WHERE type='runbook_instance' AND parent_id IS NULL"
    ))
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(roots, 10);
    let public_rows: Vec<Value> = sqlx::query_scalar(&format!(
        "SELECT to_jsonb(m) FROM {table} m WHERE type != 'runbook_definition'"
    ))
    .fetch_all(&db.pool)
    .await
    .unwrap();
    for row in public_rows {
        assert_eq!(row["content"], json!({}));
        // AFP references intentionally retain opaque source/output IDs; private
        // content must not be copied into searchable metadata or plaintext content.
        assert!(!row["metadata"].to_string().contains("document:review"));
        assert_eq!(row["encryption"]["scheme"], "omnyid-envelope-v1");
    }
    // All receipt and instance records disappear with the existing account erasure.
    db.delete_user_account_and_data(&alice.id, &alice.email, &[])
        .await
        .unwrap();
    assert_eq!(
        runtime.instance(&alice.id, id).await.unwrap_err(),
        "owner_not_found"
    );
    assert_eq!(
        runtime
            .instance(&bob.id, &waiting)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Failed
    );
    db.delete_user_account_and_data(&bob.id, &bob.email, &[])
        .await
        .unwrap();
}

#[tokio::test]
async fn read_execution_freezes_evidence_and_commits_atomically() {
    use omnyid_homeserver::runbook_read::ReadRequest;
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        return;
    };
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let alice = user(&db).await;
    let bob = user(&db).await;
    let store = RunbookStore::new(&db, [21; 32], [22; 32]);
    let runtime = RunbookRuntime::new(&store);
    let mut definition = starter_definitions().remove(0);
    definition.enabled = true;
    definition.trigger.event_types = vec!["workflow_failed".into()];
    let step_id = definition.steps[0].step_id.clone();
    store.save(&alice.id, None, definition).await.unwrap();
    let trigger = event(&db, &alice.id).await;
    let id = runtime
        .dispatch(&alice.id, &trigger)
        .await
        .unwrap()
        .instance_ids
        .remove(0);
    runtime.start(&alice.id, &id, 1).await.unwrap();
    let mut request = ReadRequest {
        step_id,
        expected_revision: 2,
        snapshot_ref: None,
        decrypt_limit: 1,
        byte_limit: 0,
    };
    assert_eq!(
        runtime
            .execute_read(&alice.id, &id, &request)
            .await
            .unwrap_err(),
        "invalid_evidence_budget"
    );
    assert_eq!(
        runtime
            .instance(&alice.id, &id)
            .await
            .unwrap()
            .instance
            .revision,
        2
    );
    request.byte_limit = 65536;
    request.snapshot_ref = Some("snapshot:injected".into());
    assert_eq!(
        runtime
            .execute_read(&alice.id, &id, &request)
            .await
            .unwrap_err(),
        "undeclared_snapshot_selector"
    );
    request.snapshot_ref = None;
    assert_eq!(
        runtime
            .execute_read(&bob.id, &id, &request)
            .await
            .unwrap_err(),
        "instance_not_found"
    );
    let (a, b) = tokio::join!(
        runtime.execute_read(&alice.id, &id, &request),
        runtime.execute_read(&alice.id, &id, &request)
    );
    let receipt = a.unwrap();
    assert_eq!(receipt, b.unwrap());
    assert_eq!(receipt.packet.included.len(), 1);
    assert_eq!(
        receipt.packet.included[0].reference,
        format!("message:{trigger}")
    );
    assert_eq!(
        receipt.trace.output_hash.as_deref(),
        Some(receipt.packet.hash.as_str())
    );
    let current = runtime.instance(&alice.id, &id).await.unwrap();
    assert_eq!(current.instance.revision, 3);
    assert!(current.instance.evidence_packet_ref.is_some());
    let table = format!("\"user_{}\".messages", alice.id.to_lowercase());
    let row: Value = sqlx::query_scalar(&format!(
        "SELECT to_jsonb(m) FROM {table} m WHERE type='runbook_evidence'"
    ))
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(row["content"], json!({}));
    assert_eq!(row["encryption"]["scheme"], "omnyid-envelope-v1");
    assert!(!row["metadata"].to_string().contains(&trigger));
    sqlx::query("UPDATE afp_messages SET payload=jsonb_set(payload,'{content,confidence}','0.1') WHERE id=$1 AND owner_user_id=$2")
        .bind(&trigger).bind(&alice.id).execute(&db.pool).await.unwrap();
    assert_eq!(
        runtime
            .execute_read(&alice.id, &id, &request)
            .await
            .unwrap(),
        receipt
    );
    let mut changed = request.clone();
    changed.byte_limit = 1000;
    assert_eq!(
        runtime
            .execute_read(&alice.id, &id, &changed)
            .await
            .unwrap_err(),
        "step_replay_conflict"
    );
    runtime.cancel(&alice.id, &id, 3).await.unwrap();
    assert_eq!(
        runtime
            .execute_read(&alice.id, &id, &request)
            .await
            .unwrap(),
        receipt
    );
    assert_eq!(
        runtime
            .instance(&alice.id, &id)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Cancelled
    );
    let trigger2 = event(&db, &alice.id).await;
    let id2 = runtime
        .dispatch(&alice.id, &trigger2)
        .await
        .unwrap()
        .instance_ids
        .remove(0);
    runtime.start(&alice.id, &id2, 1).await.unwrap();
    sqlx::query("UPDATE afp_messages SET payload=jsonb_set(payload,'{content,confidence}','0.1') WHERE id=$1 AND owner_user_id=$2")
        .bind(&trigger2).bind(&alice.id).execute(&db.pool).await.unwrap();
    assert_eq!(
        runtime
            .execute_read(&alice.id, &id2, &request)
            .await
            .unwrap_err(),
        "event_replay_conflict"
    );
    assert_eq!(
        runtime
            .instance(&alice.id, &id2)
            .await
            .unwrap()
            .instance
            .revision,
        2
    );
    db.delete_user_account_and_data(&alice.id, &alice.email, &[])
        .await
        .unwrap();
    db.delete_user_account_and_data(&bob.id, &bob.email, &[])
        .await
        .unwrap();
}
