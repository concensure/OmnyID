//! Disposable-Postgres HTTP proof for bounded capture and explicit confirmation.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::db::{AuthSessionRecord, Db, UserRecord};
use serde_json::{Value, json};
use tower::ServiceExt;
use ulid::Ulid;

fn test_db_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .inspect(|value| {
            assert!(
                value.contains("@127.0.0.1:") && value.ends_with("/omnyid_test"),
                "constraint capture tests require disposable local omnyid_test"
            );
        })
}

async fn seed_user(db: &Db, label: &str) -> String {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("capture-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Capture {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("capture_session_{suffix}");
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: user.id,
        created_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + Duration::hours(2)).to_rfc3339(),
    })
    .await
    .expect("create session");
    format!("Bearer {token}")
}

async fn request(
    app: &Router,
    method: &str,
    uri: &str,
    auth: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(uri);
    if let Some(auth) = auth {
        builder = builder.header(AUTHORIZATION, auth);
    }
    let body = if let Some(body) = body {
        builder = builder.header("content-type", "application/json");
        Body::from(body.to_string())
    } else {
        Body::empty()
    };
    let response = app
        .clone()
        .oneshot(builder.body(body).expect("request"))
        .await
        .expect("response");
    let status = response.status();
    let bytes = response.into_body().collect().await.expect("body").to_bytes();
    let body = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| json!({"text": String::from_utf8_lossy(&bytes)}));
    (status, body)
}

fn source_message(thread_id: &str, source_id: &str, version: &str, remark: &str) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": source_id,
        "thread_id": thread_id,
        "from": "user://capture-owner",
        "to": ["agent://planning-intelligence"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": "note",
        "kind": "planning_remark",
        "content": {"remark": remark, "source_version_id": version},
        "metadata": {"store": true, "privacy_scope": "tenant_private", "source_version_id": version},
        "store_in_relational": true
    })
}

fn capture_body(thread_id: &str, source_id: &str, version: &str, remark: &str) -> Value {
    json!({
        "thread_id": thread_id,
        "template_id": "wedding_planning",
        "plan_id": "wedding_plan:capture-test",
        "subject_ref": {"kind": "plan", "id": "plan:wedding:capture-test"},
        "source_message_id": source_id,
        "source_version_id": version,
        "locator": "content.remark",
        "remark": remark
    })
}

#[tokio::test]
async fn capture_is_private_bounded_and_confirmed_only_by_the_user() {
    let Some(db_url) = test_db_url() else { return };
    unsafe {
        std::env::remove_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED");
        std::env::remove_var("OMNYID_PLANNING_CONSTRAINT_CAPTURE_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_ROUTING_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_AUDIT_RECEIPTS_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_ADMIN_AI_DAILY_REQUEST_LIMIT");
    }
    let db = Db::new(&db_url).await.expect("database");
    let owner = seed_user(&db, "owner").await;
    let other = seed_user(&db, "other").await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let thread_id = Ulid::new().to_string();
    let source_id = Ulid::new().to_string();
    let version = format!("source:{source_id}:v1");
    let remark = "Grandma has arthritis, so we need step-free access.";

    let (status, _) = request(
        &app,
        "POST",
        "/send",
        Some(&owner),
        Some(source_message(&thread_id, &source_id, &version, remark)),
    ).await;
    assert_eq!(status, StatusCode::OK);

    let (status, disabled) = request(
        &app,
        "POST",
        "/planning/constraints/capture",
        Some(&owner),
        Some(capture_body(&thread_id, &source_id, &version, remark)),
    ).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "disabled: {disabled}");

    unsafe {
        std::env::set_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED", "true");
        std::env::set_var("OMNYID_PLANNING_CONSTRAINT_CAPTURE_ENABLED", "true");
    }
    let (status, cross_tenant) = request(
        &app,
        "POST",
        "/planning/constraints/capture",
        Some(&other),
        Some(capture_body(&thread_id, &source_id, &version, remark)),
    ).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "cross tenant: {cross_tenant}");

    let (status, captured) = request(
        &app,
        "POST",
        "/planning/constraints/capture",
        Some(&owner),
        Some(capture_body(&thread_id, &source_id, &version, remark)),
    ).await;
    assert_eq!(status, StatusCode::OK, "capture: {captured}");
    assert_eq!(captured["status"], "proposal");
    assert_eq!(captured["proposals"].as_array().unwrap().len(), 1);
    assert_eq!(captured["proposals"][0]["constraint"]["status"], "proposed");
    assert_eq!(captured["proposals"][0]["constraint"]["authority"], "deterministic");
    assert_eq!(captured["proposals"][0]["constraint"]["strength"], "hard");
    assert_eq!(captured["proposals"][0]["constraint"]["source_anchor"]["exact_excerpt"], "step-free");
    assert!(!captured["a2ui"].to_string().contains("arthritis"));

    let mut confirmed = captured["proposals"][0]["constraint"].clone();
    confirmed["status"] = json!("confirmed");
    confirmed["authority"] = json!("user");
    let append = json!({"thread_id": thread_id, "authority": "user_confirmed", "constraint": confirmed});
    let (status, first) = request(&app, "POST", "/planning/constraints", Some(&owner), Some(append.clone())).await;
    assert_eq!(status, StatusCode::OK, "confirm: {first}");
    assert_eq!(first["inserted"], true);
    let (status, retry) = request(&app, "POST", "/planning/constraints", Some(&owner), Some(append)).await;
    assert_eq!(status, StatusCode::OK, "retry: {retry}");
    assert_eq!(retry["inserted"], false);
    assert_eq!(retry["message_id"], first["message_id"]);

    let ambiguous_id = Ulid::new().to_string();
    let ambiguous_version = format!("source:{ambiguous_id}:v1");
    let ambiguous = "Maybe we need a step-free venue.";
    let (status, _) = request(
        &app, "POST", "/send", Some(&owner),
        Some(source_message(&thread_id, &ambiguous_id, &ambiguous_version, ambiguous)),
    ).await;
    assert_eq!(status, StatusCode::OK);
    let (status, clarification) = request(
        &app, "POST", "/planning/constraints/capture", Some(&owner),
        Some(capture_body(&thread_id, &ambiguous_id, &ambiguous_version, ambiguous)),
    ).await;
    assert_eq!(status, StatusCode::OK, "clarification: {clarification}");
    assert_eq!(clarification["status"], "needs_clarification");
    assert!(clarification["proposals"].as_array().unwrap().is_empty());

    unsafe {
        std::env::remove_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED");
        std::env::remove_var("OMNYID_PLANNING_CONSTRAINT_CAPTURE_ENABLED");
    }
}
