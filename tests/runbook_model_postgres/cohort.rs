use super::*;
use omnyid_homeserver::runbook_execution_cohort::{ExecutionCohort, ExecutionKind};
use sha2::{Digest, Sha256};

struct Delayed {
    mock: Mock,
    deadline: chrono::DateTime<Utc>,
}
#[async_trait]
impl ModelProvider for Delayed {
    async fn infer(
        &self,
        request: &ModelRequest,
    ) -> std::result::Result<ModelResponse, ModelFailure> {
        while Utc::now() <= self.deadline {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        self.mock.infer(request).await
    }
}

fn cohort(
    owner: &str,
    definition: &RunbookDefinition,
    deadline: chrono::DateTime<Utc>,
) -> ExecutionCohort {
    ExecutionCohort::parse(ExecutionKind::Draft, "true", &json!({
        "expires_at":deadline, "members":[{"owner":owner,"runbook_id":definition.runbook_id,
        "version":definition.version,"step_id":"model",
        "definition_sha256":hex::encode(Sha256::digest(json!(definition).to_string().as_bytes()))}]
    }).to_string(), Utc::now()).unwrap()
}

#[tokio::test]
async fn cohort_expiry_during_model_call_preserves_receipt_cost_and_prevents_resend() {
    let db = database().await;
    let (owner, id, definition, _) = fixture(&db, StepKind::Draft, 20, 0).await;
    let store = RunbookStore::new(&db, [21; 32], [22; 32]);
    let runtime = RunbookRuntime::new(&store);
    let deadline = Utc::now() + chrono::Duration::seconds(2);
    let gated = runtime.for_execution_cohort(cohort(&owner.id, &definition, deadline));
    let provider = Delayed {
        mock: Mock::new(Mode::Valid),
        deadline,
    };
    let mut policy = policy();
    policy.allow_escalation = false;
    policy.timeout_ms = 5000;
    policy.attempt_cost_ceiling = 75_000; // Reviewed step's smaller limit wins.
    let receipt = gated
        .execute_model(&owner.id, &id, "model", 4, &policy, &provider)
        .await
        .unwrap();
    assert!(!receipt.applied);
    assert!(receipt.trace.provenance_ref.is_some());
    let requests = provider.mock.requests.lock().unwrap().clone();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].max_cost_microunits, 20);
    assert!(
        gated
            .execute_model(&owner.id, &id, "model", 4, &policy, &provider)
            .await
            .is_err()
    );
    assert_eq!(
        runtime
            .execute_model(&owner.id, &id, "model", 4, &policy, &provider)
            .await
            .unwrap(),
        receipt
    );
    assert_eq!(provider.mock.requests.lock().unwrap().len(), 1);
    let current = runtime.instance(&owner.id, &id).await.unwrap().instance;
    assert!(!current.completed_step_ids.contains(&"model".to_owned()));
    let table = format!("\"user_{}\".messages", owner.id.to_lowercase());
    let count: i64 = sqlx::query_scalar(&format!(
        "SELECT count(*) FROM {table} WHERE type='runbook_model_result'"
    ))
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
    cleanup(&db, &owner).await;
}
