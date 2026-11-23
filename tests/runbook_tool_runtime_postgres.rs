#[path = "runbook_tool_runtime_postgres/cohort.rs"]
mod cohort;
// Disposable PostgreSQL and loopback mock provider only; no external calls.
#[path = "runbook_tool_runtime_postgres/recovery.rs"]
mod recovery;
#[path = "runbook_tool_runtime_postgres/provenance.rs"]
mod provenance;
use chrono::Utc;
use omnyid_homeserver::db::{
    Db, McpToolConnectionUpsert, UserConnectedCapabilityRecord, UserRecord,
};
use serde_json::{Value, json};
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
        email: format!("tool-{id}@omnyid.test"),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Tool test".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&u).await.unwrap();
    u
}
fn descriptor() -> Value {
    let schema = json!({"type":"object","properties":{"limit":{"type":"integer","minimum":0,"maximum":5}},"required":["limit"],"additionalProperties":false});
    json!({"capabilities":["read"],"runbook_contracts":{"read":{"version":1,"input_schema":schema,"output_schema":schema}}})
}
fn connection(owner: &str, endpoint: &str) -> McpToolConnectionUpsert {
    McpToolConnectionUpsert {
        user_id: owner.into(),
        tool_slug: "mail".into(),
        tool_name: "Mail".into(),
        mcp_server_url: endpoint.into(),
        api_key: Some("not-a-real-secret".into()),
        connection_provider: "mcp".into(),
        external_user_id: None,
        composio_connected_account_id: None,
        tool_descriptor: Some(descriptor()),
    }
}
fn grant(owner: &str, endpoint: &str) -> UserConnectedCapabilityRecord {
    UserConnectedCapabilityRecord {
        id: String::new(),
        user_id: owner.into(),
        provider: "tool_connection".into(),
        account_ref: "mail".into(),
        capability_family: "tool_connection".into(),
        capability_id: "mail.read".into(),
        transport: "mcp".into(),
        granted_scopes: vec!["read".into()],
        approval_mode: "human_approval_required".into(),
        secret_ref: Some(format!("mcp_tool_connections:{owner}:mail")),
        health_state: "healthy".into(),
        last_checked_at: None,
        connected_at: Utc::now().to_rfc3339(),
        revoked_at: None,
        metadata_json: json!({"origin":"tool_connection","tool_slug":"mail","mcp_server_url":endpoint,"connection_provider":"mcp","tool_descriptor":descriptor()}),
    }
}
async fn install(db: &Db, owner: &str, endpoint: &str) {
    db.upsert_mcp_tool_connection(&connection(owner, endpoint))
        .await
        .unwrap();
    db.upsert_user_connected_capability(&grant(owner, endpoint))
        .await
        .unwrap();
}
async fn erase(db: &Db, u: &UserRecord) {
    db.delete_mcp_tool_connection(&u.id, "mail").await.unwrap();
    db.delete_user_account_and_data(&u.id, &u.email, &[])
        .await
        .unwrap();
}

use omnyid_homeserver::{
    mcp_client::bounded::{CallFailure, CallLimits, CallResponse, call_tool},
    runbook_contract::*,
    runbook_runtime::RunbookRuntime,
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
    runbook_tool_runtime::{ToolOutcome, ToolProvider, ToolRequest},
    tool_dispatch::runbook_contract::PreparedRunbookTool,
};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
struct Provider {
    endpoint: String,
    calls: Arc<AtomicUsize>,
    gate: Option<Arc<tokio::sync::Semaphore>>,
    entered: Arc<tokio::sync::Notify>,
}
#[async_trait::async_trait]
impl ToolProvider for Provider {
    async fn call(
        &self,
        p: &PreparedRunbookTool,
    ) -> std::result::Result<CallResponse, CallFailure> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.entered.notify_one();
        if let Some(g) = &self.gate {
            let permit = g.acquire().await.unwrap();
            permit.forget();
        }
        call_tool(
            &self.endpoint,
            None,
            p.capability(),
            p.arguments(),
            CallLimits::default(),
        )
        .await
    }
}
async fn provider(result: Value) -> (Provider, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/", listener.local_addr().unwrap());
    let app = axum::Router::new().route(
        "/",
        axum::routing::post(move |axum::Json(r): axum::Json<Value>| {
            let result = result.clone();
            async move { axum::Json(json!({"jsonrpc":"2.0","id":r["id"],"result":result})) }
        }),
    );
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (
        Provider {
            endpoint,
            calls: Arc::new(AtomicUsize::new(0)),
            gate: None,
            entered: Arc::new(tokio::sync::Notify::new()),
        },
        server,
    )
}
fn request() -> ToolRequest {
    ToolRequest {
        tool_slug: "mail".into(),
        capability: "read".into(),
        arguments: json!({"limit":0}),
    }
}
fn proposal_id(owner: &str, instance: &str) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(
        json!(["runbook_tool_proposal", owner, instance, "tool"])
            .to_string()
            .as_bytes(),
    ))
}
async fn setup(db: &Db, store: &RunbookStore<'_>, owner: &str, endpoint: &str) -> String {
    install(db, owner, endpoint).await;
    let mut d = starter_definitions().remove(0);
    d.runbook_id = "tool_test".into();
    d.enabled = true;
    d.trigger.event_types = vec!["workflow_failed".into()];
    d.trigger.filters = vec![];
    d.tools_allowlist = vec!["mail.read".into()];
    d.max_autonomy = MaxAutonomy::ApprovalRequired;
    let mut tool = d.steps[0].clone();
    tool.step_id = "tool".into();
    tool.kind = StepKind::Tool;
    tool.tool = Some("mail.read".into());
    tool.operation = None;
    tool.required_fields = vec![];
    tool.input_refs = vec![];
    let mut complete = d.steps.last().unwrap().clone();
    complete.input_refs = vec![];
    complete.required_fields = vec![];
    d.steps = vec![tool, complete];
    d.success_criteria = vec![Filter {
        path: "instance.outputs.tool.status".into(),
        op: FilterOp::Eq,
        value: Some(json!("completed")),
    }];
    store.save(owner, None, d).await.unwrap();
    let event = Ulid::new().to_string();
    db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":event,"type":"workflow_failed","to":[owner],
        "thread_id":"tool:test","timestamp":Utc::now().to_rfc3339(),"content":{"confidence":0.9,"metadata":{"status":"failed"}}})).await.unwrap();
    let runtime = RunbookRuntime::new(store);
    let id = runtime.dispatch(owner, &event).await.unwrap().instance_ids[0].clone();
    runtime.start(owner, &id, 1).await.unwrap();
    id
}
async fn approve(runtime: &RunbookRuntime<'_, '_>, owner: &str, instance: &str) -> String {
    runtime
        .propose_tool(owner, instance, "tool", 2, &request())
        .await
        .unwrap();
    let pid = proposal_id(owner, instance);
    runtime
        .decide_tool(owner, instance, &pid, 3, true)
        .await
        .unwrap();
    pid
}
#[tokio::test]
async fn exact_approval_concurrent_execution_and_private_atomic_receipt() {
    let db = database().await;
    let owner = user(&db).await;
    let other = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    let proposed_request = request();
    let (a, b) = tokio::join!(
        runtime.propose_tool(&owner.id, &instance, "tool", 2, &proposed_request),
        runtime.propose_tool(&owner.id, &instance, "tool", 2, &proposed_request)
    );
    assert_eq!(a.unwrap(), b.unwrap());
    let pid = proposal_id(&owner.id, &instance);
    assert!(
        runtime
            .execute_tool(&owner.id, &instance, &pid, &provider)
            .await
            .is_err()
    );
    assert!(
        runtime
            .decide_tool(&other.id, &instance, &pid, 3, true)
            .await
            .is_err()
    );
    assert_eq!(
        runtime
            .decide_tool(&owner.id, &instance, &pid, 2, true)
            .await
            .unwrap_err(),
        "stale_revision"
    );
    let (a, b) = tokio::join!(
        runtime.decide_tool(&owner.id, &instance, &pid, 3, true),
        runtime.decide_tool(&owner.id, &instance, &pid, 3, true)
    );
    assert_eq!(a.unwrap(), b.unwrap());
    assert!(
        runtime
            .decide_tool(&owner.id, &instance, &pid, 3, false)
            .await
            .is_err()
    );
    let (a, b) = tokio::join!(
        runtime.execute_tool(&owner.id, &instance, &pid, &provider),
        runtime.execute_tool(&owner.id, &instance, &pid, &provider)
    );
    assert!(a.is_ok() || b.is_ok());
    for failed in [&a, &b].into_iter().filter_map(|r| r.as_ref().err()) {
        assert_eq!(*failed, "tool_attempt_reserved");
    }
    let receipt = runtime
        .execute_tool(&owner.id, &instance, &pid, &provider)
        .await
        .unwrap();
    assert!(receipt.applied);
    assert_eq!(receipt.outcome, ToolOutcome::Completed);
    assert_eq!(receipt.output, Some(json!({"limit":0})));
    assert!(receipt.trace.provenance_ref.is_some());
    assert!(receipt.trace.approval_ref.is_some());
    provenance::assert_exact_tool_hashes(&db, &owner.id, &receipt).await;
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    assert_eq!(
        runtime
            .instance(&owner.id, &instance)
            .await
            .unwrap()
            .instance
            .completed_step_ids,
        vec!["tool"]
    );
    assert_eq!(
        runtime
            .propose_tool(&owner.id, &instance, "tool", 2, &request())
            .await
            .unwrap()
            .request_hash,
        receipt.request_hash
    );
    let table = format!(
        "\"{}\".messages",
        format!("user_{}", owner.id.to_lowercase())
    );
    let private_count:i64=sqlx::query_scalar(&format!("SELECT count(*) FROM {table} WHERE type LIKE 'runbook_tool_%' AND content='{{}}'::jsonb AND encryption IS NOT NULL AND signature<>''"))
        .fetch_one(&db.pool).await.unwrap();
    assert_eq!(private_count, 4);
    let completed = runtime.complete(&owner.id, &instance, 5).await.unwrap();
    assert_eq!(completed.status, TraceStatus::Completed);
    assert_eq!(
        runtime.complete(&owner.id, &instance, 5).await.unwrap(),
        completed
    );
    assert_eq!(
        runtime
            .instance(&owner.id, &instance)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Completed
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
    erase(&db, &owner).await;
    erase(&db, &other).await;
}
#[tokio::test]
async fn changed_grants_and_revoked_policy_deny_approval_or_dispatch() {
    let db = database().await;
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    runtime
        .propose_tool(&owner.id, &instance, "tool", 2, &request())
        .await
        .unwrap();
    let pid = proposal_id(&owner.id, &instance);
    let mut c = grant(&owner.id, &provider.endpoint);
    c.granted_scopes.push("changed".into());
    db.upsert_user_connected_capability(&c).await.unwrap();
    assert_eq!(
        runtime
            .decide_tool(&owner.id, &instance, &pid, 3, true)
            .await
            .unwrap_err(),
        "tool_preparation_stale"
    );
    db.upsert_user_connected_capability(&grant(&owner.id, &provider.endpoint))
        .await
        .unwrap();
    runtime
        .decide_tool(&owner.id, &instance, &pid, 3, true)
        .await
        .unwrap();
    let mut c = grant(&owner.id, &provider.endpoint);
    c.revoked_at = Some(Utc::now().to_rfc3339());
    db.upsert_user_connected_capability(&c).await.unwrap();
    assert!(
        runtime
            .execute_tool(&owner.id, &instance, &pid, &provider)
            .await
            .is_err()
    );
    assert_eq!(provider.calls.load(Ordering::SeqCst), 0);
    server.abort();
    erase(&db, &owner).await;
}
#[tokio::test]
async fn cancellation_during_call_records_truth_without_advancing_cancelled_instance() {
    let db = database().await;
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (mut provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    let gate = Arc::new(tokio::sync::Semaphore::new(0));
    provider.gate = Some(gate.clone());
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    let pid = approve(&runtime, &owner.id, &instance).await;
    let (receipt, ()) = tokio::join!(
        runtime.execute_tool(&owner.id, &instance, &pid, &provider),
        async {
            provider.entered.notified().await;
            runtime.cancel(&owner.id, &instance, 4).await.unwrap();
            gate.add_permits(1);
        }
    );
    let receipt = receipt.unwrap();
    assert_eq!(receipt.outcome, ToolOutcome::Completed);
    assert!(!receipt.applied);
    assert_eq!(receipt.trace.status, TraceStatus::Denied);
    assert_eq!(
        runtime
            .instance(&owner.id, &instance)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Cancelled
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
    erase(&db, &owner).await;
}
#[tokio::test]
async fn aborted_call_keeps_one_shot_reservation_and_cannot_be_reissued() {
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
        tokio::select! {_=&mut call=>panic!("call should be blocked"),_=provider.entered.notified()=>{}}
    }
    assert_eq!(
        runtime
            .execute_tool(&owner.id, &instance, &pid, &provider)
            .await
            .unwrap_err(),
        "tool_attempt_reserved"
    );
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    server.abort();
    erase(&db, &owner).await;
}
#[tokio::test]
async fn schema_failure_is_unknown_and_never_retried() {
    let db = database().await;
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (provider, server) = provider(json!({"structuredContent":{"limit":"wrong"}})).await;
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    let pid = approve(&runtime, &owner.id, &instance).await;
    let receipt = runtime
        .execute_tool(&owner.id, &instance, &pid, &provider)
        .await
        .unwrap();
    assert_eq!(receipt.outcome, ToolOutcome::Unknown);
    assert!(!receipt.applied);
    assert_eq!(receipt.failure.as_deref(), Some("tool_response_invalid"));
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
    erase(&db, &owner).await;
}

#[tokio::test]
async fn result_failure_rolls_back_trace_and_provenance_but_keeps_reservation() {
    let db = database().await;
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    let pid = approve(&runtime, &owner.id, &instance).await;
    let table = format!(
        "\"{}\".messages",
        format!("user_{}", owner.id.to_lowercase())
    );
    sqlx::query(&format!(
        "ALTER TABLE {table} ADD CONSTRAINT fail_tool_result CHECK (type<>'runbook_tool_result')"
    ))
    .execute(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        runtime
            .execute_tool(&owner.id, &instance, &pid, &provider)
            .await
            .unwrap_err(),
        "storage_unavailable"
    );
    let count:i64=sqlx::query_scalar(&format!("SELECT count(*) FROM {table} WHERE type IN ('runbook_tool_result','runbook_step_trace','provenance_record')")).fetch_one(&db.pool).await.unwrap();
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
        "ALTER TABLE {table} DROP CONSTRAINT fail_tool_result"
    ))
    .execute(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        runtime
            .execute_tool(&owner.id, &instance, &pid, &provider)
            .await
            .unwrap_err(),
        "tool_attempt_reserved"
    );
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    server.abort();
    erase(&db, &owner).await;
}
#[tokio::test]
async fn rejection_remains_possible_after_grant_revocation_and_cannot_be_approved_later() {
    let db = database().await;
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    runtime
        .propose_tool(&owner.id, &instance, "tool", 2, &request())
        .await
        .unwrap();
    let pid = proposal_id(&owner.id, &instance);
    db.delete_user_connected_capabilities_for_provider_account(
        &owner.id,
        "tool_connection",
        "mail",
    )
    .await
    .unwrap();
    runtime
        .decide_tool(&owner.id, &instance, &pid, 3, false)
        .await
        .unwrap();
    assert_eq!(
        runtime
            .instance(&owner.id, &instance)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Cancelled
    );
    assert!(
        runtime
            .decide_tool(&owner.id, &instance, &pid, 3, true)
            .await
            .is_err()
    );
    assert!(
        runtime
            .execute_tool(&owner.id, &instance, &pid, &provider)
            .await
            .is_err()
    );
    assert_eq!(provider.calls.load(Ordering::SeqCst), 0);
    server.abort();
    erase(&db, &owner).await;
}

#[tokio::test]
async fn completion_requires_the_saved_tool_result_not_only_a_completed_trace() {
    let db = database().await;
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let (provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    let instance = setup(&db, &store, &owner.id, &provider.endpoint).await;
    let pid = approve(&runtime, &owner.id, &instance).await;
    runtime
        .execute_tool(&owner.id, &instance, &pid, &provider)
        .await
        .unwrap();
    let table = format!(
        "\"{}\".messages",
        format!("user_{}", owner.id.to_lowercase())
    );
    sqlx::query(&format!(
        "DELETE FROM {table} WHERE type='runbook_tool_result'"
    ))
    .execute(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        runtime.complete(&owner.id, &instance, 5).await.unwrap_err(),
        "tool_receipt_required"
    );
    assert_eq!(
        runtime
            .execute_tool(&owner.id, &instance, &pid, &provider)
            .await
            .unwrap_err(),
        "tool_attempt_reserved"
    );
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    server.abort();
    erase(&db, &owner).await;
}
struct FailedProvider(
    omnyid_homeserver::mcp_client::bounded::CallOutcome,
    AtomicUsize,
);
#[async_trait::async_trait]
impl ToolProvider for FailedProvider {
    async fn call(
        &self,
        _: &PreparedRunbookTool,
    ) -> std::result::Result<CallResponse, CallFailure> {
        self.1.fetch_add(1, Ordering::SeqCst);
        Err(CallFailure {
            code: "private provider error must not persist",
            outcome: self.0,
        })
    }
}
#[tokio::test]
async fn provider_failure_records_honest_outcomes_without_raw_error_or_retry() {
    use omnyid_homeserver::mcp_client::bounded::CallOutcome;
    let db = database().await;
    for (failure, outcome) in [
        (CallOutcome::NotSent, ToolOutcome::NotSent),
        (CallOutcome::Unknown, ToolOutcome::Unknown),
    ] {
        let owner = user(&db).await;
        let store = RunbookStore::new(&db, [31; 32], [32; 32]);
        let runtime = RunbookRuntime::new(&store);
        let instance = setup(&db, &store, &owner.id, "https://example.invalid/mcp").await;
        let pid = approve(&runtime, &owner.id, &instance).await;
        let provider = FailedProvider(failure, AtomicUsize::new(0));
        let receipt = runtime
            .execute_tool(&owner.id, &instance, &pid, &provider)
            .await
            .unwrap();
        assert_eq!(receipt.outcome, outcome);
        assert_eq!(receipt.failure.as_deref(), Some("tool_provider_failed"));
        assert!(receipt.output.is_none());
        assert!(!receipt.applied);
        assert_eq!(
            runtime
                .execute_tool(&owner.id, &instance, &pid, &provider)
                .await
                .unwrap(),
            receipt
        );
        assert_eq!(provider.1.load(Ordering::SeqCst), 1);
        erase(&db, &owner).await;
    }
}

async fn session(db: &Db, owner: &str, age_hours: i64) -> String {
    let token = Ulid::new().to_string();
    db.create_session(&omnyid_homeserver::db::AuthSessionRecord {
        token: token.clone(),
        user_id: owner.into(),
        created_at: (Utc::now() - chrono::Duration::hours(age_hours)).to_rfc3339(),
        expires_at: (Utc::now() + chrono::Duration::hours(1)).to_rfc3339(),
    })
    .await
    .unwrap();
    format!("Bearer {token}")
}
async fn http(
    app: &axum::Router,
    method: &str,
    path: &str,
    auth: &str,
    body: Value,
) -> (axum::http::StatusCode, Value) {
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    let response = app
        .clone()
        .oneshot(
            axum::http::Request::builder()
                .method(method)
                .uri(path)
                .header("authorization", auth)
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.headers()["cache-control"], "no-store");
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or_else(|_| json!(String::from_utf8_lossy(&bytes))),
    )
}
#[tokio::test]
async fn authenticated_tool_review_is_dark_owner_bound_recent_and_never_dispatches() {
    use axum::http::StatusCode as S;
    let db = database().await;
    let alice = user(&db).await;
    let bob = user(&db).await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let (provider, server) = provider(json!({"structuredContent":{"limit":0}})).await;
    let id = setup(&db, &store, &alice.id, &provider.endpoint).await;
    let bob_id = setup(&db, &store, &bob.id, &provider.endpoint).await;
    let auth = session(&db, &alice.id, 0).await;
    let stale = session(&db, &alice.id, 24).await;
    let bob_auth = session(&db, &bob.id, 0).await;
    let bob_stale = session(&db, &bob.id, 24).await;
    unsafe {
        std::env::set_var("OMNYID_ENCRYPTION_KEY_HEX", hex::encode([31; 32]));
        std::env::set_var("OMNYID_SIGNING_KEY_HEX", hex::encode([32; 32]));
        std::env::remove_var("OMNYID_RUNBOOK_MANAGEMENT_ENABLED");
        std::env::set_var("OMNYID_RUNBOOK_TOOL_REVIEW_ENABLED", "true");
    }
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = omnyid_homeserver::server::build_test_router(&url).await;
    let path = format!("/runbooks/instances/{id}/tools");
    let pid = proposal_id(&alice.id, &id);
    let detail = format!("{path}/{pid}");
    let decision = format!("{detail}/decision");
    let proposal = json!({"step_id":"tool","expected_revision":2,"request":request()});
    let yes = json!({"expected_revision":3,"approved":true});
    assert_eq!(
        http(&app, "POST", &path, &auth, proposal.clone()).await.0,
        S::NOT_FOUND
    );
    unsafe {
        std::env::set_var("OMNYID_RUNBOOK_MANAGEMENT_ENABLED", "true");
        std::env::remove_var("OMNYID_RUNBOOK_TOOL_REVIEW_ENABLED");
    }
    for (method, target, body) in [
        ("POST", &path, proposal.clone()),
        ("GET", &detail, json!(null)),
        ("POST", &decision, yes.clone()),
    ] {
        assert_eq!(
            http(&app, method, target, &auth, body).await.0,
            S::NOT_FOUND
        );
    }
    unsafe {
        std::env::set_var("OMNYID_RUNBOOK_TOOL_REVIEW_ENABLED", "true");
    }
    assert_eq!(
        http(&app, "POST", &path, "", proposal.clone()).await.0,
        S::UNAUTHORIZED
    );
    assert_eq!(
        http(&app, "POST", &path, &bob_auth, proposal.clone())
            .await
            .0,
        S::NOT_FOUND
    );
    let mut forged = proposal.clone();
    forged["owner"] = json!(bob.id);
    assert_eq!(
        http(&app, "POST", &path, &auth, forged).await.0,
        S::UNPROCESSABLE_ENTITY
    );
    let saved = http(&app, "POST", &path, &auth, proposal.clone()).await;
    assert_eq!(saved.0, S::OK);
    let activity_path = format!("/runbooks/instances/{id}/activity");
    let activity = http(&app, "GET", &activity_path, &auth, json!(null)).await;
    assert_eq!(activity.0, S::OK);
    assert_eq!(activity.1["tool_review_available"], true);
    assert_eq!(activity.1["tool_reviews"][0]["status"], "pending");
    assert_eq!(activity.1["tool_reviews"][0]["proposal_ref"], pid);
    assert!(activity.1["tool_reviews"][0].get("arguments").is_none());
    assert!(activity.1["tool_reviews"][0].get("request").is_none());
    unsafe {
        std::env::remove_var("OMNYID_RUNBOOK_TOOL_REVIEW_ENABLED");
    }
    let dark = http(&app, "GET", &activity_path, &auth, json!(null)).await;
    assert_eq!(dark.1["tool_review_available"], false);
    unsafe {
        std::env::set_var("OMNYID_RUNBOOK_TOOL_REVIEW_ENABLED", "true");
    }

    assert_eq!(saved.1["execution_available"], false);
    assert_eq!(
        saved.1["proposal"]["request"]["arguments"],
        json!({"limit":0})
    );
    assert!(!saved.1.to_string().contains("not-a-real-secret"));
    assert_eq!(http(&app, "POST", &path, &auth, proposal).await.1, saved.1);
    assert_eq!(
        http(&app, "GET", &detail, &auth, json!(null)).await.1,
        saved.1
    );
    assert_eq!(
        http(&app, "GET", &detail, &bob_auth, json!(null)).await.0,
        S::NOT_FOUND
    );
    assert_eq!(
        http(&app, "POST", &decision, &bob_auth, yes.clone())
            .await
            .0,
        S::NOT_FOUND
    );
    assert_eq!(
        http(&app, "POST", &decision, &stale, yes.clone()).await.0,
        S::FORBIDDEN
    );
    assert_eq!(
        http(
            &app,
            "POST",
            &decision,
            &auth,
            json!({"approved":true,"expected_revision":2})
        )
        .await
        .0,
        S::CONFLICT
    );
    assert_eq!(
        http(
            &app,
            "POST",
            &decision,
            &auth,
            json!({"approved":true,"expected_revision":3,"decided_by":bob.id})
        )
        .await
        .0,
        S::UNPROCESSABLE_ENTITY
    );
    let receipt = http(&app, "POST", &decision, &auth, yes.clone()).await;
    assert_eq!(receipt.0, S::OK);
    let activity = http(&app, "GET", &activity_path, &auth, json!(null)).await;
    assert_eq!(activity.1["tool_reviews"][0]["status"], "approved");

    assert_eq!(receipt.1["decision"]["approved"], true);
    assert_eq!(receipt.1["execution_available"], false);
    assert_eq!(http(&app, "POST", &decision, &auth, yes).await.1, receipt.1);
    assert_eq!(
        http(
            &app,
            "POST",
            &decision,
            &auth,
            json!({"approved":false,"expected_revision":3})
        )
        .await
        .0,
        S::CONFLICT
    );
    let runtime = RunbookRuntime::new(&store);
    let b = runtime
        .propose_tool(&bob.id, &bob_id, "tool", 2, &request())
        .await
        .unwrap();
    // Another owner cannot retrieve the original proposal through their instance.
    assert!(runtime.tool_proposal(&bob.id, &bob_id, &pid).await.is_err());
    db.delete_mcp_tool_connection(&bob.id, "mail")
        .await
        .unwrap();
    let reject = format!(
        "/runbooks/instances/{bob_id}/tools/{}/decision",
        b.proposal_ref
    );
    assert_eq!(
        http(
            &app,
            "POST",
            &reject,
            &bob_stale,
            json!({"approved":false,"expected_revision":3})
        )
        .await
        .0,
        S::OK
    );
    assert_eq!(provider.calls.load(Ordering::SeqCst), 0);
    unsafe {
        std::env::remove_var("OMNYID_RUNBOOK_TOOL_REVIEW_ENABLED");
        std::env::remove_var("OMNYID_RUNBOOK_MANAGEMENT_ENABLED");
    }
    server.abort();
    erase(&db, &alice).await;
    erase(&db, &bob).await;
}
