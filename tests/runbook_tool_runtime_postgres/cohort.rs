use super::*;
use omnyid_homeserver::runbook_execution_cohort::{ExecutionCohort, ExecutionKind};
use sha2::{Digest, Sha256};

#[tokio::test]
async fn cohort_expiry_during_tool_call_preserves_receipt_and_prevents_resend() {
    let db = database().await;
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (mut provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    let gate = Arc::new(tokio::sync::Semaphore::new(0));
    provider.gate = Some(gate.clone());
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    let pid = approve(&runtime, &owner.id, &instance).await;
    let registry = store.registry(&owner.id).await.unwrap();
    let definition = &registry.get("tool_test").unwrap().definition;
    let deadline = Utc::now() + chrono::Duration::seconds(2);
    let cohort = ExecutionCohort::parse(ExecutionKind::Tool, "true", &json!({
        "expires_at":deadline,"members":[{"owner":owner.id,"runbook_id":definition.runbook_id,
        "version":definition.version,"step_id":"tool",
        "definition_sha256":hex::encode(Sha256::digest(json!(definition).to_string().as_bytes()))}]
    }).to_string(), Utc::now()).unwrap();
    let gated = runtime.for_execution_cohort(cohort);
    let call = gated.execute_tool(&owner.id, &instance, &pid, &provider);
    tokio::pin!(call);
    tokio::select! { _=&mut call=>panic!("call should be blocked"), _=provider.entered.notified()=>{} }
    while Utc::now() <= deadline {
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    gate.add_permits(1);
    let receipt = call.await.unwrap();
    assert!(!receipt.applied);
    assert!(receipt.trace.provenance_ref.is_some());
    assert!(
        gated
            .execute_tool(&owner.id, &instance, &pid, &provider)
            .await
            .is_err()
    );
    assert_eq!(
        runtime
            .execute_tool(&owner.id, &instance, &pid, &provider)
            .await
            .unwrap(),
        receipt
    );
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    assert!(
        runtime
            .instance(&owner.id, &instance)
            .await
            .unwrap()
            .instance
            .completed_step_ids
            .is_empty()
    );
    server.abort();
    erase(&db, &owner).await;
}
