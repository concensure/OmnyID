//! Disposable-Postgres proof for private revision-bound constraint evaluation.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::{
    db::{AuthSessionRecord, Db, UserRecord},
    planning_intelligence::PlanningConstraint,
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
                "constraint evaluation tests require disposable local omnyid_test"
            );
        })
}

async fn seed_user(db: &Db, label: &str) -> String {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("evaluation-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Evaluation {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("evaluation_session_{suffix}");
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
        "from": "user://evaluation-owner",
        "to": ["agent://planning-intelligence"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": "note",
        "kind": "planning_source",
        "content": {"body": body, "source_version_id": version},
        "metadata": {"store": true, "privacy_scope": "tenant_private", "source_version_id": version},
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

#[tokio::test]
async fn evaluation_uses_private_active_comparison_evidence() {
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
    let constraint_source_id = Ulid::new().to_string();
    let constraint_source_version = format!("source:{constraint_source_id}:v1");
    let quote_source_id = Ulid::new().to_string();
    let quote_source_version = format!("source:{quote_source_id}:v1");
    let quote_evidence = "No step-free entrance is available.";
    let mut constraint = fixture_constraint();
    constraint.source_ref = constraint_source_id.clone();
    constraint.source_anchor.message_id = constraint_source_id.clone();
    constraint.source_anchor.source_version_id = Some(constraint_source_version.clone());
    constraint.observed_at = Utc::now().to_rfc3339();

    for source in [
        source_message(
            &thread_id,
            &constraint_source_id,
            &constraint_source_version,
            &constraint.source_anchor.exact_excerpt,
        ),
        source_message(
            &thread_id,
            &quote_source_id,
            &quote_source_version,
            quote_evidence,
        ),
    ] {
        let (status, body) = request(&app, "POST", "/send", Some(&owner), Some(source)).await;
        assert_eq!(status, StatusCode::OK, "source: {body}");
    }
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

    let mut quotation: Value = serde_json::from_str(include_str!(
        "fixtures/quotation/generic_normalised_quote.json"
    ))
    .expect("quotation fixture");
    quotation["identity"]["quotation_id"] = json!(format!("quotation:{thread_id}"));
    quotation["identity"]["version_id"] = json!(format!("quotation:{thread_id}:v1"));
    quotation["identity"]["vendor_id"] = json!(format!("vendor:{thread_id}"));
    quotation["sources"][0]["source_id"] = json!(quote_source_id);
    quotation["sources"][0]["source_version_id"] = json!(quote_source_version);
    quotation["line_items"][0]["evidence"]["anchors"][0]["source_id"] =
        json!(quote_source_id);
    quotation["line_items"][0]["evidence"]["anchors"][0]["source_version_id"] =
        json!(quote_source_version);
    quotation["commercial_terms"][0]["evidence"]["anchors"][0]["source_id"] =
        json!(quote_source_id);
    quotation["commercial_terms"][0]["evidence"]["anchors"][0]["source_version_id"] =
        json!(quote_source_version);
    quotation["tax"]["evidence"]["anchors"][0]["source_id"] = json!(quote_source_id);
    quotation["tax"]["evidence"]["anchors"][0]["source_version_id"] =
        json!(quote_source_version);
    let version_id = quotation["identity"]["version_id"]
        .as_str()
        .expect("version")
        .to_string();
    let (status, body) = request(
        &app,
        "POST",
        "/quotation/normalisations",
        Some(&owner),
        Some(json!({"thread_id": thread_id, "quotation": quotation})),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "quotation: {body}");

    let comparison_id = format!("comparison:{thread_id}");
    let (status, body) = request(
        &app,
        "POST",
        "/quotation/comparisons",
        Some(&owner),
        Some(json!({
            "thread_id": thread_id,
            "comparison_id": comparison_id,
            "scenario": {"scenario_id": "scenario:one"},
            "inputs": [{
                "version_id": version_id,
                "requirements": [{
                    "requirement_id": constraint.constraint_id,
                    "importance": "hard",
                    "status": "conflict",
                    "evidence": {
                        "state": "confirmed",
                        "anchors": [{
                            "source_id": quote_source_id,
                            "source_version_id": quote_source_version,
                            "locator": "content.body",
                            "exact_excerpt": quote_evidence
                        }]
                    }
                }]
            }]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "comparison: {body}");

    let evaluation_body = json!({
        "thread_id": thread_id,
        "plan_id": constraint.plan_id,
        "comparison_id": comparison_id,
        "quotation_version_id": version_id,
    });
    let (status, disabled) = request(
        &app,
        "POST",
        "/planning/constraint-evaluations",
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
        "/planning/constraint-evaluations",
        Some(&other),
        Some(evaluation_body.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "cross tenant: {cross_tenant}");
    let (status, evaluated) = request(
        &app,
        "POST",
        "/planning/constraint-evaluations",
        Some(&owner),
        Some(evaluation_body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "evaluation: {evaluated}");
    assert_eq!(evaluated["candidate_revision_ref"], version_id);
    assert_eq!(evaluated["evaluations"][0]["evaluation"]["result"], "conflict");
    assert_eq!(evaluated["evaluations"][0]["evaluation"]["severity"], "blocking");
    assert_eq!(evaluated["evaluations"][0]["presentation"]["domain"], "constraint_conflict");
    assert!(!evaluated.to_string().contains(quote_evidence));

    unsafe {
        std::env::remove_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED");
        std::env::remove_var("OMNYID_PLANNING_EVALUATION_ENABLED");
    }
}
