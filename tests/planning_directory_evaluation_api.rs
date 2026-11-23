//! Disposable-Postgres proof for revision-bound directory constraint evaluation.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::{
    db::{
        wedding_vendor_evidence::VendorAttributeWrite, AuthSessionRecord, Db, UserRecord,
    },
    planning_intelligence::{
        ConstraintKind, ConstraintOperator, ConstraintValue, PlanningConstraint,
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
                "directory evaluation tests require disposable local omnyid_test"
            );
        })
}

async fn seed_user(db: &Db, label: &str) -> String {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("directory-evaluation-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Directory evaluation {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("directory_evaluation_session_{suffix}");
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

fn source_message(thread_id: &str, id: &str, version: &str, body: &str) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": id,
        "thread_id": thread_id,
        "from": "user://directory-evaluation-owner",
        "to": ["agent://planning-intelligence"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": "note",
        "kind": "planning_source",
        "content": {"body": body, "source_version_id": version},
        "metadata": {"store": true, "privacy_scope": "tenant_private", "source_version_id": version},
        "store_in_relational": true
    })
}

fn service_constraint(
    source_id: &str,
    source_version: &str,
    observed_at: &str,
) -> PlanningConstraint {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/planning/contract-cases.json"))
            .expect("fixture JSON");
    let mut constraint: PlanningConstraint = fixture["cases"]
        .as_array()
        .expect("cases")
        .iter()
        .find(|case| case["name"] == "renovation_step_free_constraint")
        .and_then(|case| serde_json::from_value(case["payload"].clone()).ok())
        .expect("constraint fixture");
    constraint.constraint_id = "constraint:wedding:ceremony-on-site:v1".to_string();
    constraint.template_id = "wedding_planner".to_string();
    constraint.plan_id = "wedding_plan:directory-evaluation".to_string();
    constraint.subject_ref.id = "plan:wedding:directory-evaluation".to_string();
    constraint.kind = ConstraintKind::ServiceRequirement;
    constraint.operator = ConstraintOperator::Requires;
    constraint.value = ConstraintValue::Enum {
        value: "ceremony_on_site".to_string(),
        vocabulary: "vendor_service.v1".to_string(),
    };
    constraint.source_ref = source_id.to_string();
    constraint.source_anchor.message_id = source_id.to_string();
    constraint.source_anchor.source_version_id = Some(source_version.to_string());
    constraint.source_anchor.exact_excerpt = "Ceremony must be held on site.".to_string();
    constraint.observed_at = observed_at.to_string();
    constraint
}

fn service_attribute(value: bool) -> VendorAttributeWrite {
    VendorAttributeWrite {
        attribute_key: "ceremony_on_site".to_string(),
        value: Some(json!(value)),
        status: "known".to_string(),
        confidence: Some(1.0),
        authority: "primary_official".to_string(),
        preferred_authority: "primary_official".to_string(),
        source_url: Some("https://venue.example/ceremonies".to_string()),
        source_label: Some("Venue information".to_string()),
        valid_until: None,
        notes: None,
    }
}

#[tokio::test]
async fn directory_evaluation_is_private_default_off_and_revision_bound() {
    let Some(db_url) = test_db_url() else { return };
    unsafe {
        std::env::remove_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED");
        std::env::remove_var("OMNYID_PLANNING_EVALUATION_ENABLED");
    }
    let db = Db::new(&db_url).await.expect("database");
    let owner = seed_user(&db, "owner").await;
    let other = seed_user(&db, "other").await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let thread_id = Ulid::new().to_string();
    let source_id = Ulid::new().to_string();
    let source_version = format!("source:{source_id}:v1");
    let observed_at = Utc::now().to_rfc3339();
    let constraint = service_constraint(&source_id, &source_version, &observed_at);
    let (status, body) = request(
        &app,
        "POST",
        "/send",
        Some(&owner),
        Some(source_message(
            &thread_id,
            &source_id,
            &source_version,
            &constraint.source_anchor.exact_excerpt,
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "source: {body}");
    unsafe {
        std::env::set_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED", "true");
    }
    let (status, body) = request(
        &app,
        "POST",
        "/planning/constraints",
        Some(&owner),
        Some(json!({
            "thread_id": thread_id,
            "authority": "user_confirmed",
            "constraint": constraint,
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "constraint: {body}");

    let vendor_id = Ulid::new().to_string();
    sqlx::query(
        "INSERT INTO wedding_vendors (vendor_id, vendor_slug, vendor_name, category, service_area, contact_email, status) VALUES ($1, $1, 'Directory Evaluation Venue', 'venue', 'Sydney', 'venue@example.invalid', 'active')",
    )
    .bind(&vendor_id)
    .execute(&db.pool)
    .await
    .expect("insert vendor");
    assert!(
        db.upsert_wedding_vendor_attribute(&vendor_id, &service_attribute(false), None)
            .await
            .expect("insert attribute")
    );
    let evaluation_body = json!({
        "thread_id": thread_id,
        "plan_id": constraint.plan_id,
        "vendor_id": vendor_id,
    });
    let (status, disabled) = request(
        &app,
        "POST",
        "/planning/directory-constraint-evaluations",
        Some(&owner),
        Some(evaluation_body.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "disabled: {disabled}");
    unsafe {
        std::env::set_var("OMNYID_PLANNING_EVALUATION_ENABLED", "true");
    }
    let (status, cross_tenant) = request(
        &app,
        "POST",
        "/planning/directory-constraint-evaluations",
        Some(&other),
        Some(evaluation_body.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "cross tenant: {cross_tenant}");
    let (status, conflict) = request(
        &app,
        "POST",
        "/planning/directory-constraint-evaluations",
        Some(&owner),
        Some(evaluation_body.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "conflict: {conflict}");
    assert_eq!(conflict["evaluations"][0]["evaluation"]["result"], "conflict");
    assert_eq!(conflict["evaluations"][0]["evaluation"]["severity"], "blocking");
    assert!(!conflict.to_string().contains("Directory Evaluation Venue"));
    let first_revision = conflict["candidate_revision_ref"].as_str().expect("revision");

    assert!(
        db.upsert_wedding_vendor_attribute(&vendor_id, &service_attribute(true), None)
            .await
            .expect("update attribute")
    );
    let (status, satisfied) = request(
        &app,
        "POST",
        "/planning/directory-constraint-evaluations",
        Some(&owner),
        Some(evaluation_body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "satisfied: {satisfied}");
    assert_eq!(satisfied["evaluations"][0]["evaluation"]["result"], "satisfied");
    assert_ne!(
        satisfied["candidate_revision_ref"].as_str().expect("revision"),
        first_revision
    );

    sqlx::query("DELETE FROM wedding_vendors WHERE vendor_id = $1")
        .bind(&vendor_id)
        .execute(&db.pool)
        .await
        .expect("cleanup vendor");
    unsafe {
        std::env::remove_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED");
        std::env::remove_var("OMNYID_PLANNING_EVALUATION_ENABLED");
    }
}
