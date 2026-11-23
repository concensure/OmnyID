//! Disposable-Postgres HTTP evidence for the plan-private constraint ledger.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::{
    db::{AuthSessionRecord, Db, UserRecord},
    planning_intelligence::{
        ConstraintAuthority, ConstraintPrivacy, ConstraintStatus, PlanningConstraint,
    },
};
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
                "constraint API tests require disposable local omnyid_test"
            );
        })
}

async fn seed_user(db: &Db, label: &str) -> String {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("constraint-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Constraint {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("constraint_session_{suffix}");
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
    let request_body = if let Some(body) = body {
        builder = builder.header("content-type", "application/json");
        Body::from(body.to_string())
    } else {
        Body::empty()
    };
    let response = app
        .clone()
        .oneshot(builder.body(request_body).expect("request"))
        .await
        .expect("response");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body")
        .to_bytes();
    let body = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| json!({"text": String::from_utf8_lossy(&bytes)}));
    (status, body)
}

fn source_message(
    thread_id: &str,
    source_id: &str,
    source_version_id: &str,
    body: &str,
    timestamp: &str,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": source_id,
        "thread_id": thread_id,
        "from": "user://constraint-owner",
        "to": ["agent://planning-intelligence"],
        "timestamp": timestamp,
        "type": "note",
        "kind": "planning_source",
        "content": {"body": body},
        "metadata": {
            "store": true,
            "privacy_scope": "tenant_private",
            "source_version_id": source_version_id
        },
        "store_in_relational": true
    })
}

fn fixture_constraint() -> PlanningConstraint {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/planning/contract-cases.json"))
            .expect("fixture JSON");
    fixture["cases"]
        .as_array()
        .expect("cases")
        .iter()
        .find(|case| case["name"] == "renovation_step_free_constraint")
        .and_then(|case| serde_json::from_value(case["payload"].clone()).ok())
        .expect("constraint fixture")
}

fn bind_source(
    constraint: &mut PlanningConstraint,
    source_id: &str,
    source_version_id: &str,
    excerpt: &str,
    observed_at: &str,
) {
    constraint.source_ref = source_id.to_string();
    constraint.source_anchor.message_id = source_id.to_string();
    constraint.source_anchor.source_version_id = Some(source_version_id.to_string());
    constraint.source_anchor.exact_excerpt = excerpt.to_string();
    constraint.observed_at = observed_at.to_string();
}

fn append_body(thread_id: &str, authority: &str, constraint: &PlanningConstraint) -> Value {
    json!({
        "thread_id": thread_id,
        "authority": authority,
        "constraint": constraint
    })
}

#[tokio::test]
async fn constraint_ledger_is_private_idempotent_and_append_only() {
    let Some(db_url) = test_db_url() else {
        return;
    };
    unsafe {
        std::env::remove_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED");
    }
    let db = Db::new(&db_url).await.expect("database");
    let owner_auth = seed_user(&db, "owner").await;
    let other_auth = seed_user(&db, "other").await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let thread_id = Ulid::new().to_string();
    let source_id = Ulid::new().to_string();
    let source_version_id = format!("source:{source_id}:v1");
    let source_time = Utc::now().to_rfc3339();
    let excerpt = "The ground floor must remain step-free.";

    let (status, body) = request(
        &app,
        "GET",
        &format!("/planning/constraints?thread_id={thread_id}&plan_id=plan:renovation:alpha"),
        Some(&owner_auth),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "disabled route: {body}");

    let (status, body) = request(
        &app,
        "POST",
        "/send",
        Some(&owner_auth),
        Some(source_message(
            &thread_id,
            &source_id,
            &source_version_id,
            excerpt,
            &source_time,
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "source: {body}");
    unsafe {
        std::env::set_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED", "true");
    }

    let mut original = fixture_constraint();
    bind_source(
        &mut original,
        &source_id,
        &source_version_id,
        excerpt,
        &source_time,
    );
    let (status, first) = request(
        &app,
        "POST",
        "/planning/constraints",
        Some(&owner_auth),
        Some(append_body(&thread_id, "user_confirmed", &original)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "append: {first}");
    assert_eq!(first["inserted"], true);
    assert_eq!(first["projection"]["active"].as_array().unwrap().len(), 1);
    assert_eq!(
        first["projection"]["active"][0]["constraint"]["source_anchor"]["exact_excerpt"],
        excerpt
    );

    let (status, retry) = request(
        &app,
        "POST",
        "/planning/constraints",
        Some(&owner_auth),
        Some(append_body(&thread_id, "user_confirmed", &original)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "retry: {retry}");
    assert_eq!(retry["inserted"], false);
    assert_eq!(retry["message_id"], first["message_id"]);

    let (status, unauthenticated) = request(
        &app,
        "GET",
        &format!("/planning/constraints?thread_id={thread_id}&plan_id=plan:renovation:alpha"),
        None,
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "unauthenticated: {unauthenticated}"
    );
    let (status, cross_tenant) = request(
        &app,
        "GET",
        &format!("/planning/constraints?thread_id={thread_id}&plan_id=plan:renovation:alpha"),
        Some(&other_auth),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "cross tenant: {cross_tenant}"
    );

    let successor_source_id = Ulid::new().to_string();
    let successor_version_id = format!("source:{successor_source_id}:v1");
    let successor_time = (Utc::now() + Duration::seconds(1)).to_rfc3339();
    let successor_excerpt = "Keep the entrance step-free.";
    let (status, body) = request(
        &app,
        "POST",
        "/send",
        Some(&owner_auth),
        Some(source_message(
            &thread_id,
            &successor_source_id,
            &successor_version_id,
            successor_excerpt,
            &successor_time,
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "successor source: {body}");
    let mut successor = original.clone();
    successor.constraint_id = "constraint:renovation:step-free:v2".to_string();
    successor.supersedes = Some(original.constraint_id.clone());
    bind_source(
        &mut successor,
        &successor_source_id,
        &successor_version_id,
        successor_excerpt,
        &successor_time,
    );
    let (status, replaced) = request(
        &app,
        "POST",
        "/planning/constraints",
        Some(&owner_auth),
        Some(append_body(&thread_id, "user_confirmed", &successor)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "successor: {replaced}");
    assert_eq!(
        replaced["projection"]["active"].as_array().unwrap().len(),
        1
    );
    assert_eq!(
        replaced["projection"]["superseded"]
            .as_array()
            .unwrap()
            .len(),
        1
    );

    let mut forged = successor.clone();
    forged.constraint_id = "constraint:renovation:forged:v1".to_string();
    forged.supersedes = None;
    forged.status = ConstraintStatus::Proposed;
    forged.authority = ConstraintAuthority::User;
    forged.privacy = ConstraintPrivacy::ShareableWithApproval;
    let (status, _) = request(
        &app,
        "POST",
        "/planning/constraints",
        Some(&owner_auth),
        Some(append_body(&thread_id, "proposal", &forged)),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let removal_source_id = Ulid::new().to_string();
    let removal_version_id = format!("source:{removal_source_id}:v1");
    let removal_time = (Utc::now() + Duration::seconds(2)).to_rfc3339();
    let removal_excerpt = "Remove the earlier step-free requirement.";
    let (status, body) = request(
        &app,
        "POST",
        "/send",
        Some(&owner_auth),
        Some(source_message(
            &thread_id,
            &removal_source_id,
            &removal_version_id,
            removal_excerpt,
            &removal_time,
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "removal source: {body}");
    let mut removal = successor.clone();
    removal.constraint_id = "constraint:renovation:step-free:removed:v1".to_string();
    removal.supersedes = Some(successor.constraint_id.clone());
    removal.status = ConstraintStatus::Removed;
    bind_source(
        &mut removal,
        &removal_source_id,
        &removal_version_id,
        removal_excerpt,
        &removal_time,
    );
    let (status, removed) = request(
        &app,
        "POST",
        "/planning/constraints",
        Some(&owner_auth),
        Some(append_body(&thread_id, "user_removal", &removal)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "removal: {removed}");
    assert!(
        removed["projection"]["active"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        removed["projection"]["superseded"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        removed["projection"]["removed"].as_array().unwrap().len(),
        2
    );

    let mut unanchored = removal;
    unanchored.constraint_id = "constraint:renovation:unanchored:v1".to_string();
    unanchored.supersedes = None;
    unanchored.status = ConstraintStatus::Confirmed;
    unanchored.source_anchor.exact_excerpt = "Text absent from the source.".to_string();
    let (status, _) = request(
        &app,
        "POST",
        "/planning/constraints",
        Some(&owner_auth),
        Some(append_body(&thread_id, "user_confirmed", &unanchored)),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    unsafe {
        std::env::remove_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED");
    }
}
