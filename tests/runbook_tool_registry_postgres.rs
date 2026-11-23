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

#[tokio::test]
async fn exact_preparation_requires_owner_registry_and_never_enables_dispatch() {
    let db = database().await;
    let alice = user(&db).await;
    let bob = user(&db).await;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/mcp", listener.local_addr().unwrap());
    install(&db, &alice.id, &endpoint).await;
    let ctx = ToolDispatchContext {
        user_id: &alice.id,
        db: &db,
    };
    let other = ToolDispatchContext {
        user_id: &bob.id,
        db: &db,
    };
    let first = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":0}))
        .await
        .unwrap();
    assert_eq!(first.owner(), alice.id);
    assert_eq!(first.tool_slug(), "mail");
    assert_eq!(first.capability(), "read");
    assert_eq!(first.arguments(), &json!({"limit":0}));
    assert_eq!(
        first.request_hash(),
        prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":0}))
            .await
            .unwrap()
            .request_hash()
    );
    revalidate_runbook_tool(&ctx, &first).await.unwrap();
    assert!(revalidate_runbook_tool(&other, &first).await.is_err());
    assert!(
        prepare_runbook_tool(&other, "mail", "read", json!({"limit":0}))
            .await
            .is_err()
    );
    for (cap, input) in [
        ("send", json!({"limit":0})),
        ("read", json!({"limit":0,"send":true})),
        ("read", json!({"limit":"0"})),
    ] {
        assert!(
            prepare_runbook_tool(&ctx, "mail", cap, input)
                .await
                .is_err()
        );
    }
    first
        .validate_result(&json!({"structuredContent":{"limit":0}}))
        .unwrap();
    assert!(
        first
            .validate_result(&json!({"structuredContent":{"limit":0,"extra":true}}))
            .is_err()
    );
    assert!(
        first
            .validate_result(&json!({"structuredContent":{"limit":0},"isError":true}))
            .is_err()
    );
    assert!(
        db.list_tool_execution_registry(&alice.id)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(50), listener.accept())
            .await
            .is_err()
    );
    db.delete_user_connected_capabilities_for_provider_account(
        &alice.id,
        "tool_connection",
        "mail",
    )
    .await
    .unwrap();
    assert!(
        prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":0}))
            .await
            .is_err()
    );
    erase(&db, &alice).await;
    erase(&db, &bob).await;
}

#[tokio::test]
async fn revoked_unhealthy_suggestion_only_and_mismatched_projections_fail_closed() {
    let db = database().await;
    let owner = user(&db).await;
    let endpoint = "https://example.invalid/mcp";
    install(&db, &owner.id, endpoint).await;
    let ctx = ToolDispatchContext {
        user_id: &owner.id,
        db: &db,
    };
    for health in ["degraded", "unknown", "revoked"] {
        let mut c = grant(&owner.id, endpoint);
        c.health_state = health.into();
        db.upsert_user_connected_capability(&c).await.unwrap();
        assert!(
            prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":1}))
                .await
                .is_err()
        );
    }
    let mut cases = vec![];
    let mut c = grant(&owner.id, endpoint);
    c.revoked_at = Some(Utc::now().to_rfc3339());
    cases.push(c);
    let mut c = grant(&owner.id, endpoint);
    c.approval_mode = "suggest_only".into();
    cases.push(c);
    let mut c = grant(&owner.id, endpoint);
    c.secret_ref = Some("foreign-reference".into());
    cases.push(c);
    let mut c = grant(&owner.id, endpoint);
    c.transport = "composio".into();
    cases.push(c);
    let mut c = grant(&owner.id, endpoint);
    c.metadata_json["mcp_server_url"] = json!("https://other.invalid");
    cases.push(c);
    let mut c = grant(&owner.id, endpoint);
    c.metadata_json["tool_descriptor"]["runbook_contracts"]["read"]["version"] = json!(2);
    cases.push(c);
    let mut c = grant(&owner.id, endpoint);
    c.metadata_json["tool_descriptor"]["capabilities"] = json!(["read", "read"]);
    cases.push(c);
    for c in cases {
        db.upsert_user_connected_capability(&c).await.unwrap();
        assert!(
            prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":1}))
                .await
                .is_err()
        );
    }
    db.upsert_user_connected_capability(&grant(&owner.id, endpoint))
        .await
        .unwrap();
    let mut conn = connection(&owner.id, endpoint);
    conn.tool_descriptor = Some(json!({"capabilities":["read"],"padding":"x".repeat(65537)}));
    db.upsert_mcp_tool_connection(&conn).await.unwrap();
    assert!(
        prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":1}))
            .await
            .is_err()
    );
    erase(&db, &owner).await;
}

#[tokio::test]
async fn schemas_scopes_and_grant_replacement_invalidate_prepared_requests() {
    let db = database().await;
    let owner = user(&db).await;
    let endpoint = "https://example.invalid/mcp";
    install(&db, &owner.id, endpoint).await;
    let ctx = ToolDispatchContext {
        user_id: &owner.id,
        db: &db,
    };
    let first = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":1}))
        .await
        .unwrap();
    assert_ne!(
        first.request_hash(),
        prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":2}))
            .await
            .unwrap()
            .request_hash()
    );
    let mut c = grant(&owner.id, endpoint);
    c.granted_scopes.push("read_metadata".into());
    db.upsert_user_connected_capability(&c).await.unwrap();
    assert_eq!(
        revalidate_runbook_tool(&ctx, &first).await.unwrap_err(),
        "tool_preparation_stale"
    );
    let second = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":1}))
        .await
        .unwrap();
    let mut conn = connection(&owner.id, endpoint);
    conn.tool_descriptor.as_mut().unwrap()["runbook_contracts"]["read"]["input_schema"]["properties"]
        ["limit"]["maximum"] = json!(4);
    db.upsert_mcp_tool_connection(&conn).await.unwrap();
    assert!(
        prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":1}))
            .await
            .is_err()
    );
    c.metadata_json["tool_descriptor"] = conn.tool_descriptor.clone().unwrap();
    db.upsert_user_connected_capability(&c).await.unwrap();
    assert_eq!(
        revalidate_runbook_tool(&ctx, &second).await.unwrap_err(),
        "tool_preparation_stale"
    );
    let third = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":1}))
        .await
        .unwrap();
    db.delete_user_connected_capabilities_for_provider_account(
        &owner.id,
        "tool_connection",
        "mail",
    )
    .await
    .unwrap();
    db.upsert_user_connected_capability(&c).await.unwrap();
    assert_eq!(
        revalidate_runbook_tool(&ctx, &third).await.unwrap_err(),
        "tool_preparation_stale"
    );
    erase(&db, &owner).await;
}

#[tokio::test]
async fn provider_identity_ambiguity_and_cross_account_binding_are_enforced() {
    let db = database().await;
    let owner = user(&db).await;
    let other = user(&db).await;
    let endpoint = "https://example.invalid/mcp";
    install(&db, &owner.id, endpoint).await;
    install(&db, &other.id, endpoint).await;
    let ctx = ToolDispatchContext {
        user_id: &owner.id,
        db: &db,
    };
    let mut conn = connection(&owner.id, endpoint);
    conn.connection_provider = "composio".into();
    conn.external_user_id = Some(owner.id.clone());
    conn.composio_connected_account_id = Some("account_one".into());
    let mut c = grant(&owner.id, endpoint);
    c.transport = "composio".into();
    c.metadata_json["connection_provider"] = json!("composio");
    db.upsert_mcp_tool_connection(&conn).await.unwrap();
    db.upsert_user_connected_capability(&c).await.unwrap();
    let first = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":1}))
        .await
        .unwrap();
    conn.composio_connected_account_id = Some("account_two".into());
    db.upsert_mcp_tool_connection(&conn).await.unwrap();
    assert_eq!(
        revalidate_runbook_tool(&ctx, &first).await.unwrap_err(),
        "tool_preparation_stale"
    );
    conn.external_user_id = Some(other.id.clone());
    db.upsert_mcp_tool_connection(&conn).await.unwrap();
    assert!(
        prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":1}))
            .await
            .is_err()
    );
    conn.external_user_id = Some(owner.id.clone());
    db.upsert_mcp_tool_connection(&conn).await.unwrap();
    let mut duplicate = c.clone();
    duplicate.account_ref = "another_account".into();
    db.upsert_user_connected_capability(&duplicate)
        .await
        .unwrap();
    assert!(
        prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":1}))
            .await
            .is_err()
    );
    erase(&db, &owner).await;
    erase(&db, &other).await;
}

#[tokio::test]
async fn correlated_transport_receipt_still_requires_frozen_output_schema() {
    use omnyid_homeserver::mcp_client::bounded::{CallLimits, CallOutcome, call_tool};
    let db = database().await;
    let owner = user(&db).await;
    for (result, valid) in [
        (json!({"structuredContent":{"limit":0}}), true),
        (json!({"structuredContent":{"limit":"0"}}), false),
        (json!({"structuredContent":{"limit":0,"extra":true}}), false),
        (
            json!({"structuredContent":{"limit":0},"isError":true}),
            false,
        ),
    ] {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}/", listener.local_addr().unwrap());
        install(&db, &owner.id, &endpoint).await;
        let ctx = ToolDispatchContext {
            user_id: &owner.id,
            db: &db,
        };
        let prepared = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":0}))
            .await
            .unwrap();
        let app = axum::Router::new().route(
            "/",
            axum::routing::post(move |axum::Json(request): axum::Json<Value>| async move {
                axum::Json(json!({"jsonrpc":"2.0","id":request["id"],"result":result}))
            }),
        );
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let receipt = call_tool(
            &endpoint,
            None,
            "read",
            prepared.arguments(),
            CallLimits::default(),
        )
        .await
        .unwrap();
        let validated = prepared.validate_response(&receipt);
        if valid {
            assert_eq!(validated.unwrap(), &json!({"limit":0}));
        } else {
            let err = validated.unwrap_err();
            assert_eq!(err.code, "tool_output_schema_failed");
            assert_eq!(err.outcome, CallOutcome::Unknown);
        }
        let different = prepare_runbook_tool(&ctx, "mail", "read", json!({"limit":1}))
            .await
            .unwrap();
        assert_eq!(
            different.validate_response(&receipt).unwrap_err().code,
            "tool_response_request_mismatch"
        );
        server.abort();
    }
    erase(&db, &owner).await;
}
