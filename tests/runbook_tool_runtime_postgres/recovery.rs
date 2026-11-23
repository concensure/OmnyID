use super::*;

#[tokio::test]
async fn abandonment_requires_reservation_owner_revision_and_is_atomic_and_idempotent() {
    let db = database().await;
    let owner = user(&db).await;
    let other = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (mut provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    provider.gate = Some(Arc::new(tokio::sync::Semaphore::new(0)));
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    let pid = approve(&runtime, &owner.id, &instance).await;
    assert_eq!(
        runtime
            .abandon_tool_attempt(&owner.id, &instance, &pid, 4)
            .await
            .unwrap_err(),
        "tool_reservation_missing"
    );
    {
        let call = runtime.execute_tool(&owner.id, &instance, &pid, &provider);
        tokio::pin!(call);
        tokio::select! { _=&mut call=>panic!("call should be blocked"), _=provider.entered.notified()=>{} }
    }
    assert!(
        runtime
            .abandon_tool_attempt(&other.id, &instance, &pid, 4)
            .await
            .is_err()
    );
    assert_eq!(
        runtime
            .abandon_tool_attempt(&owner.id, &instance, &pid, 3)
            .await
            .unwrap_err(),
        "stale_revision"
    );
    let table = format!("\"user_{}\".messages", owner.id.to_lowercase());
    sqlx::query(&format!(
        "ALTER TABLE {table} ADD CONSTRAINT fail_recovery CHECK (type<>'runbook_tool_result')"
    ))
    .execute(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        runtime
            .abandon_tool_attempt(&owner.id, &instance, &pid, 4)
            .await
            .unwrap_err(),
        "storage_unavailable"
    );
    let count: i64 = sqlx::query_scalar(&format!("SELECT count(*) FROM {table} WHERE type IN ('runbook_tool_result','runbook_step_trace','provenance_record')"))
        .fetch_one(&db.pool).await.unwrap();
    assert_eq!(count, 0);
    assert_eq!(
        runtime
            .instance(&owner.id, &instance)
            .await
            .unwrap()
            .instance
            .revision,
        4
    );
    sqlx::query(&format!(
        "ALTER TABLE {table} DROP CONSTRAINT fail_recovery"
    ))
    .execute(&db.pool)
    .await
    .unwrap();
    let (a, b) = tokio::join!(
        runtime.abandon_tool_attempt(&owner.id, &instance, &pid, 4),
        runtime.abandon_tool_attempt(&owner.id, &instance, &pid, 4)
    );
    let receipt = a.unwrap();
    assert_eq!(receipt, b.unwrap());
    assert_eq!(receipt.outcome, ToolOutcome::Unknown);
    assert_eq!(receipt.failure.as_deref(), Some("tool_attempt_abandoned"));
    assert!(!receipt.applied && receipt.output.is_none());
    assert!(receipt.trace.provenance_ref.is_some());
    assert_eq!(
        runtime
            .instance(&owner.id, &instance)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Failed
    );
    assert_eq!(
        runtime
            .execute_tool(&owner.id, &instance, &pid, &provider)
            .await
            .unwrap(),
        receipt
    );
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    server.abort();
    erase(&db, &other).await;
    erase(&db, &owner).await;
}

#[tokio::test]
async fn late_provider_success_cannot_overwrite_abandonment_or_advance_instance() {
    let db = database().await;
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (mut provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    let gate = Arc::new(tokio::sync::Semaphore::new(0));
    provider.gate = Some(gate.clone());
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    let pid = approve(&runtime, &owner.id, &instance).await;
    let call = runtime.execute_tool(&owner.id, &instance, &pid, &provider);
    tokio::pin!(call);
    tokio::select! { _=&mut call=>panic!("call should be blocked"), _=provider.entered.notified()=>{} }
    let receipt = runtime
        .abandon_tool_attempt(&owner.id, &instance, &pid, 4)
        .await
        .unwrap();
    gate.add_permits(1);
    assert_eq!(call.await.unwrap(), receipt);
    let current = runtime
        .instance(&owner.id, &instance)
        .await
        .unwrap()
        .instance;
    assert_eq!(current.status, InstanceState::Failed);
    assert!(current.completed_step_ids.is_empty());
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    server.abort();
    erase(&db, &owner).await;
}

#[tokio::test]
async fn abandonment_preserves_completed_receipts() {
    let db = database().await;
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    let pid = approve(&runtime, &owner.id, &instance).await;
    let receipt = runtime
        .execute_tool(&owner.id, &instance, &pid, &provider)
        .await
        .unwrap();
    assert_eq!(
        runtime
            .abandon_tool_attempt(&owner.id, &instance, &pid, 4)
            .await
            .unwrap(),
        receipt
    );
    assert_eq!(receipt.outcome, ToolOutcome::Completed);
    server.abort();
    erase(&db, &owner).await;
}

#[tokio::test]
async fn abandonment_after_cancellation_records_unknown_without_reopening_instance() {
    let db = database().await;
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (mut provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    provider.gate = Some(Arc::new(tokio::sync::Semaphore::new(0)));
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    let pid = approve(&runtime, &owner.id, &instance).await;
    {
        let call = runtime.execute_tool(&owner.id, &instance, &pid, &provider);
        tokio::pin!(call);
        tokio::select! { _=&mut call=>panic!("call should be blocked"), _=provider.entered.notified()=>{} }
    }
    runtime.cancel(&owner.id, &instance, 4).await.unwrap();
    let receipt = runtime
        .abandon_tool_attempt(&owner.id, &instance, &pid, 5)
        .await
        .unwrap();
    assert_eq!(receipt.outcome, ToolOutcome::Unknown);
    assert!(!receipt.applied);
    let current = runtime
        .instance(&owner.id, &instance)
        .await
        .unwrap()
        .instance;
    assert_eq!(current.status, InstanceState::Cancelled);
    assert_eq!(current.revision, 5);
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    server.abort();
    erase(&db, &owner).await;
}

#[tokio::test]
async fn repeated_tool_failures_suppress_new_dispatch_and_already_matched_start() {
    let db = database().await;
    let owner = user(&db).await;
    let other = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (provider, server) = provider(json!({"structuredContent":{"unexpected":true}})).await;
    let first = setup(&db, &store, &owner.id, &provider.endpoint).await;
    async fn trigger(
        db: &Db,
        runtime: &RunbookRuntime<'_, '_>,
        owner: &str,
    ) -> omnyid_homeserver::runbook_runtime::DispatchReceipt {
        let event = Ulid::new().to_string();
        db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":event,"type":"workflow_failed","to":[owner],"thread_id":"cooldown:test","timestamp":Utc::now().to_rfc3339(),"content":{"confidence":0.9,"metadata":{"status":"failed"}}})).await.unwrap();
        runtime.dispatch(owner, &event).await.unwrap()
    }
    let queued = trigger(&db, &runtime, &owner.id).await.instance_ids[0].clone();
    for index in 0..3 {
        let id = if index == 0 {
            first.clone()
        } else {
            let id = trigger(&db, &runtime, &owner.id).await.instance_ids[0].clone();
            runtime.start(&owner.id, &id, 1).await.unwrap();
            id
        };
        let pid = approve(&runtime, &owner.id, &id).await;
        let receipt = runtime
            .execute_tool(&owner.id, &id, &pid, &provider)
            .await
            .unwrap();
        assert_eq!(receipt.outcome, ToolOutcome::Unknown);
        assert_eq!(
            runtime
                .execute_tool(&owner.id, &id, &pid, &provider)
                .await
                .unwrap(),
            receipt
        );
    }
    assert_eq!(provider.calls.load(Ordering::SeqCst), 3);
    let suppressed = trigger(&db, &runtime, &owner.id).await;
    assert!(suppressed.instance_ids.is_empty());
    assert_eq!(
        suppressed.decisions[0].disposition,
        omnyid_homeserver::runbook_matcher::MatchDisposition::OutcomeCooldown
    );
    assert_eq!(
        runtime
            .dispatch(&owner.id, &suppressed.event_id)
            .await
            .unwrap(),
        suppressed
    );
    assert_eq!(
        runtime.start(&owner.id, &queued, 1).await.unwrap_err(),
        "runbook_failure_cooldown"
    );
    assert_eq!(
        runtime
            .instance(&owner.id, &queued)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Matched
    );
    // Same runbook in a different account remains eligible.
    setup(&db, &store, &other.id, &provider.endpoint).await;
    assert_eq!(
        trigger(&db, &runtime, &other.id).await.instance_ids.len(),
        1
    );
    server.abort();
    erase(&db, &other).await;
    erase(&db, &owner).await;
}
