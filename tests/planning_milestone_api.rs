//! Disposable-Postgres proof for tenant-private milestone projection.

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
                "milestone tests require disposable local omnyid_test"
            );
        })
}

async fn seed_user(db: &Db, label: &str) -> String {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("milestone-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Milestone {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("milestone_session_{suffix}");
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

async fn post(app: &Router, uri: &str, auth: &str, body: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header(AUTHORIZATION, auth)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .expect("request"),
        )
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

fn message(
    thread_id: &str,
    kind: &str,
    message_type: &str,
    subtype: &str,
    content: Value,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "system://wedding-planning",
        "to": ["agent://wedding-planning"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": message_type,
        "kind": kind,
        "subtype": subtype,
        "supertags": ["wedding"],
        "content": content,
        "metadata": {"store": true, "privacy_scope": "tenant_private"},
        "store_in_relational": true
    })
}

async fn send(app: &Router, auth: &str, body: Value) {
    let (status, response) = post(app, "/send", auth, body).await;
    assert_eq!(status, StatusCode::OK, "send: {response}");
}

#[tokio::test]
async fn milestone_projection_reads_owned_explicit_sources_and_stays_default_off() {
    let Some(db_url) = test_db_url() else { return };
    unsafe { std::env::remove_var("OMNYID_PLANNING_CRITICAL_PATH_ENABLED") };
    let db = Db::new(&db_url).await.expect("database");
    let owner = seed_user(&db, "owner").await;
    let other = seed_user(&db, "other").await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let suffix = Ulid::new().to_string().to_lowercase();
    let plan_id = format!("plan:{suffix}");
    let request = json!({"plan_id": plan_id});

    let (status, disabled) = post(
        &app,
        "/planning/milestones/project",
        &owner,
        request.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "disabled: {disabled}");

    send(
        &app,
        &owner,
        message(
            &Ulid::new().to_string(),
            "note",
            "decision",
            "wedding_decision_selection",
            json!({
                "kind": "wedding_decision_selection",
                "artifact_id": format!("wedding_date:{suffix}"),
                "wedding_plan_id": plan_id,
                "selected_option": {"id": "wedding-date-2027-12-01"},
                "source": "user"
            }),
        ),
    )
    .await;
    send(
        &app,
        &owner,
        message(
            &Ulid::new().to_string(),
            "task",
            "task",
            "wedding_task",
            json!({
                "task_id": format!("task:guest-count:{suffix}"),
                "wedding_plan_id": plan_id,
                "wedding_milestone_key": "guest_count_draft",
                "status": "completed",
                "title": "private title must not be returned"
            }),
        ),
    )
    .await;
    send(
        &app,
        &owner,
        message(
            &Ulid::new().to_string(),
            "event",
            "calendar_event",
            "wedding_event",
            json!({
                "event_id": format!("event:stationery:{suffix}"),
                "wedding_plan_id": plan_id,
                "wedding_milestone_key": "stationery_details",
                "status": "confirmed",
                "start_at": "2027-05-01T09:00:00Z",
                "title": "private calendar title must not be returned"
            }),
        ),
    )
    .await;

    unsafe { std::env::set_var("OMNYID_PLANNING_CRITICAL_PATH_ENABLED", "true") };
    let (status, hidden) = post(
        &app,
        "/planning/milestones/project",
        &other,
        request.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "other tenant: {hidden}");
    assert!(
        hidden["blockers"]
            .as_array()
            .unwrap()
            .iter()
            .all(|blocker| { blocker["kind"].as_str() == Some("horizon_missing") })
    );

    let (status, projection) = post(
        &app,
        "/planning/milestones/project",
        &owner,
        request.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "projection: {projection}");
    assert_eq!(projection["template_version"], "wedding.milestones.v1");
    assert_eq!(projection["plan_id"], request["plan_id"]);
    let milestones = projection["milestones"].as_array().expect("milestones");
    let guest = milestones
        .iter()
        .find(|item| {
            item["dependency"]["milestone_id"]
                .as_str()
                .is_some_and(|id| id.ends_with(":guest_count_draft"))
        })
        .expect("guest count milestone");
    assert_eq!(guest["dependency"]["state"], "complete");
    let stationery = milestones
        .iter()
        .find(|item| {
            item["dependency"]["milestone_id"]
                .as_str()
                .is_some_and(|id| id.ends_with(":stationery_details"))
        })
        .expect("stationery milestone");
    assert_eq!(
        stationery["dependency"]["latest_at"],
        "2027-05-01T09:00:00Z"
    );
    assert_eq!(stationery["date_provenance"]["authority"], "manual");
    let serialized = projection.to_string();
    assert!(!serialized.contains("private title"));

    let (status, repeated) = post(&app, "/planning/milestones/project", &owner, request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(projection["projection_id"], repeated["projection_id"]);
    unsafe { std::env::remove_var("OMNYID_PLANNING_CRITICAL_PATH_ENABLED") };
}
