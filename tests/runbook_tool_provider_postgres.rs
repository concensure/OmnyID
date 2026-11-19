//! Disposable local PostgreSQL only. No provider is invoked by these tests.
use chrono::Utc;
use omnyid_homeserver::{
    db::{Db, McpToolConnectionUpsert, UserConnectedCapabilityRecord, UserRecord},
    tool_dispatch::{
        ToolDispatchContext,
        runbook_contract::{prepare_runbook_tool, revalidate_runbook_tool},
    },
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
    mcp_client::bounded::{CallOutcome, destination::PinnedMcpTarget},
    runbook_contract::*,
    runbook_runtime::RunbookRuntime,
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
    runbook_tool_runtime::{ToolOutcome, ToolProvider, ToolRequest},
    tool_dispatch::runbook_provider::McpRunbookProvider,
};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
const KEY: [u8; 32] = [81; 32];
async fn credential(db: &Db, owner: &str, value: &str) {
    sqlx::query(
        "UPDATE mcp_tool_connections SET api_key_enc=$2 WHERE user_id=$1 AND tool_slug='mail'",
    )
    .bind(owner)
    .bind(value)
    .execute(&db.pool)
    .await
    .unwrap();
}
async fn mock() -> (String, Arc<AtomicUsize>, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/mcp", listener.local_addr().unwrap());
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let app=axum::Router::new().route("/mcp",axum::routing::post(move |headers:axum::http::HeaderMap,axum::Json(body):axum::Json<Value>| {
        let count=count.clone(); async move {
            count.fetch_add(1,Ordering::SeqCst);
            assert_eq!(headers["authorization"],"Bearer dummy-owner-key");
            assert_eq!(headers["x-api-key"],"dummy-owner-key");
            assert_eq!(body["params"],json!({"name":"read","arguments":{"limit":0}}));
            axum::Json(json!({"jsonrpc":"2.0","id":body["id"],"result":{"structuredContent":{"limit":0}}}))
        }
    }));
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (endpoint, calls, task)
}
fn adapter<'a>(db: &'a Db, endpoint: &str, key: [u8; 32]) -> McpRunbookProvider<'a> {
    McpRunbookProvider::new(
        db,
        key,
        vec![PinnedMcpTarget::loopback_sandbox(endpoint).unwrap()],
    )
    .unwrap()
}
#[test]
fn production_destinations_require_exact_https_and_public_pins() {
    use std::net::Ipv4Addr;
    for ip in [
        "0.0.0.0",
        "10.0.0.1",
        "100.64.0.1",
        "127.0.0.1",
        "169.254.169.254",
        "172.16.0.1",
        "192.168.0.1",
        "192.0.2.1",
        "192.88.99.1",
        "198.18.0.1",
        "198.51.100.1",
        "203.0.113.1",
        "224.0.0.1",
        "255.255.255.255",
    ] {
        assert!(
            PinnedMcpTarget::https("https://provider.example/mcp", vec![ip.parse().unwrap()])
                .is_err()
        );
    }
    for url in [
        "http://provider.example/mcp",
        "https://u:p@provider.example/mcp",
        "https://provider.example/mcp?key=x",
        "https://provider.example/mcp#x",
        "https://provider.example./mcp",
        "https://127.0.0.1/mcp",
        "https://[::1]/mcp",
    ] {
        assert!(PinnedMcpTarget::https(url, vec![Ipv4Addr::new(8, 8, 8, 8)]).is_err());
    }
    assert!(PinnedMcpTarget::https("https://provider.example/mcp", vec![]).is_err());
    assert!(
        PinnedMcpTarget::https(
            "https://provider.example/mcp",
            vec![Ipv4Addr::new(8, 8, 8, 8)]
        )
        .is_ok()
    );
    assert!(PinnedMcpTarget::https("https://8.8.8.8/mcp", vec![Ipv4Addr::new(8, 8, 8, 8)]).is_ok());
    for url in [
        "http://localhost/mcp",
        "http://10.0.0.1/mcp",
        "http://example.com/mcp",
        "https://127.0.0.1/mcp",
    ] {
        assert!(PinnedMcpTarget::loopback_sandbox(url).is_err());
    }
}
#[tokio::test]
async fn adapter_executes_only_exact_approved_owner_request_and_persists_receipt() {
    let db = database().await;
    let owner = user(&db).await;
    let (endpoint, calls, server) = mock().await;
    install(&db, &owner.id, &endpoint).await;
    credential(
        &db,
        &owner.id,
        &omnyid_homeserver::crypto::encrypt_secret("dummy-owner-key", &KEY),
    )
    .await;
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let mut d = starter_definitions().remove(0);
    d.runbook_id = "adapter_test".into();
    d.enabled = true;
    d.trigger.event_types = vec!["workflow_failed".into()];
    d.trigger.filters.clear();
    d.tools_allowlist = vec!["mail.read".into()];
    d.max_autonomy = MaxAutonomy::ApprovalRequired;
    let mut tool = d.steps[0].clone();
    tool.step_id = "tool".into();
    tool.kind = StepKind::Tool;
    tool.tool = Some("mail.read".into());
    tool.operation = None;
    tool.required_fields.clear();
    tool.input_refs.clear();
    let mut complete = d.steps.last().unwrap().clone();
    complete.input_refs.clear();
    complete.required_fields.clear();
    d.steps = vec![tool, complete];
    d.success_criteria = vec![Filter {
        path: "instance.outputs.tool.status".into(),
        op: FilterOp::Eq,
        value: Some(json!("completed")),
    }];
    store.save(&owner.id, None, d).await.unwrap();
    let event = Ulid::new().to_string();
    db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":event,"type":"workflow_failed","to":[owner.id],"thread_id":"tool:test","timestamp":Utc::now().to_rfc3339(),"content":{"confidence":0.9,"metadata":{"status":"failed"}}})).await.unwrap();
    let id = runtime
        .dispatch(&owner.id, &event)
        .await
        .unwrap()
        .instance_ids[0]
        .clone();
    runtime.start(&owner.id, &id, 1).await.unwrap();
    let p = runtime
        .propose_tool(
            &owner.id,
            &id,
            "tool",
            2,
            &ToolRequest {
                tool_slug: "mail".into(),
                capability: "read".into(),
                arguments: json!({"limit":0}),
            },
        )
        .await
        .unwrap();
    let provider = adapter(&db, &endpoint, KEY);
    assert!(
        runtime
            .execute_tool(&owner.id, &id, &p.proposal_ref, &provider)
            .await
            .is_err()
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    runtime
        .decide_tool(&owner.id, &id, &p.proposal_ref, 3, true)
        .await
        .unwrap();
    let receipt = runtime
        .execute_tool(&owner.id, &id, &p.proposal_ref, &provider)
        .await
        .unwrap();
    assert_eq!(receipt.outcome, ToolOutcome::Completed);
    assert!(receipt.applied);
    assert!(receipt.trace.provenance_ref.is_some());
    assert_eq!(
        receipt,
        runtime
            .execute_tool(&owner.id, &id, &p.proposal_ref, &provider)
            .await
            .unwrap()
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert!(
        !serde_json::to_string(&receipt)
            .unwrap()
            .contains("dummy-owner-key")
    );
    server.abort();
    erase(&db, &owner).await;
}
#[tokio::test]
async fn rotation_same_timestamp_invalidates_preparation_and_adapter_without_send() {
    let db = database().await;
    let owner = user(&db).await;
    let (endpoint, calls, server) = mock().await;
    install(&db, &owner.id, &endpoint).await;
    credential(
        &db,
        &owner.id,
        &omnyid_homeserver::crypto::encrypt_secret("dummy-owner-key", &KEY),
    )
    .await;
    let ctx = ToolDispatchContext {
        user_id: &owner.id,
        db: &db,
    };
    let before = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":0}))
        .await
        .unwrap();
    let stamp: String = sqlx::query_scalar(
        "SELECT connected_at FROM mcp_tool_connections WHERE user_id=$1 AND tool_slug='mail'",
    )
    .bind(&owner.id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    credential(
        &db,
        &owner.id,
        &omnyid_homeserver::crypto::encrypt_secret("rotated-dummy-key", &KEY),
    )
    .await;
    let after: String = sqlx::query_scalar(
        "SELECT connected_at FROM mcp_tool_connections WHERE user_id=$1 AND tool_slug='mail'",
    )
    .bind(&owner.id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(stamp, after);
    assert_eq!(
        revalidate_runbook_tool(&ctx, &before).await.unwrap_err(),
        "tool_preparation_stale"
    );
    let failure = adapter(&db, &endpoint, KEY)
        .call(&before)
        .await
        .err()
        .unwrap();
    assert_eq!(failure.outcome, CallOutcome::NotSent);
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    server.abort();
    erase(&db, &owner).await;
}
#[tokio::test]
async fn adapter_rejects_unreviewed_targets_wrong_keys_plaintext_and_revoked_grants() {
    let db = database().await;
    let owner = user(&db).await;
    let (endpoint, calls, server) = mock().await;
    install(&db, &owner.id, &endpoint).await;
    let ctx = ToolDispatchContext {
        user_id: &owner.id,
        db: &db,
    };
    credential(
        &db,
        &owner.id,
        &omnyid_homeserver::crypto::encrypt_secret("dummy-owner-key", &KEY),
    )
    .await;
    let p = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":0}))
        .await
        .unwrap();
    for provider in [
        adapter(&db, &endpoint, [82; 32]),
        adapter(&db, &format!("{endpoint}/other"), KEY),
    ] {
        assert_eq!(
            provider.call(&p).await.err().unwrap().outcome,
            CallOutcome::NotSent
        );
    }
    credential(&db, &owner.id, "plaintext-is-not-accepted").await;
    let p = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":0}))
        .await
        .unwrap();
    assert_eq!(
        adapter(&db, &endpoint, KEY)
            .call(&p)
            .await
            .err()
            .unwrap()
            .outcome,
        CallOutcome::NotSent
    );
    credential(
        &db,
        &owner.id,
        &omnyid_homeserver::crypto::encrypt_secret("dummy-owner-key", &KEY),
    )
    .await;
    let p = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":0}))
        .await
        .unwrap();
    sqlx::query("UPDATE user_connected_capabilities SET revoked_at=now() WHERE user_id=$1")
        .bind(&owner.id)
        .execute(&db.pool)
        .await
        .unwrap();
    assert_eq!(
        adapter(&db, &endpoint, KEY)
            .call(&p)
            .await
            .err()
            .unwrap()
            .outcome,
        CallOutcome::NotSent
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    server.abort();
    erase(&db, &owner).await;
}

#[tokio::test]
async fn unsupported_transport_and_deleted_owner_never_send() {
    let db = database().await;
    let owner = user(&db).await;
    let (endpoint, calls, server) = mock().await;
    install(&db, &owner.id, &endpoint).await;
    credential(
        &db,
        &owner.id,
        &omnyid_homeserver::crypto::encrypt_secret("dummy-owner-key", &KEY),
    )
    .await;
    let ctx = ToolDispatchContext {
        user_id: &owner.id,
        db: &db,
    };
    let direct = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":0}))
        .await
        .unwrap();
    let mut conn = connection(&owner.id, &endpoint);
    conn.connection_provider = "composio".into();
    conn.external_user_id = Some(owner.id.clone());
    conn.composio_connected_account_id = Some("account1".into());
    db.upsert_mcp_tool_connection(&conn).await.unwrap();
    let mut cap = grant(&owner.id, &endpoint);
    cap.transport = "composio".into();
    cap.metadata_json["connection_provider"] = json!("composio");
    db.upsert_user_connected_capability(&cap).await.unwrap();
    let composio = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":0}))
        .await
        .unwrap();
    assert_eq!(
        adapter(&db, &endpoint, KEY)
            .call(&composio)
            .await
            .err()
            .unwrap()
            .outcome,
        CallOutcome::NotSent
    );
    erase(&db, &owner).await;
    assert_eq!(
        adapter(&db, &endpoint, KEY)
            .call(&direct)
            .await
            .err()
            .unwrap()
            .outcome,
        CallOutcome::NotSent
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    server.abort();
}
