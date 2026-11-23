//! Disposable-Postgres proof for approval-safe conflict intervention preparation.

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
                "intervention tests require disposable local omnyid_test"
            );
        })
}

async fn seed_user(db: &Db, label: &str) -> String {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("intervention-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Intervention {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("intervention_session_{suffix}");
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

async fn request(app: &Router, uri: &str, auth: &str, body: Value) -> (StatusCode, Value) {
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

fn source_message(thread_id: &str, id: &str, version: &str, body: &str) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": id,
        "thread_id": thread_id,
        "from": "user://intervention-owner",
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
async fn intervention_rederives_private_conflict_and_prepares_no_send_authority() {
    let Some(db_url) = test_db_url() else { return };
    for flag in [
        "OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED",
        "OMNYID_PLANNING_EVALUATION_ENABLED",
        "OMNYID_PLANNING_INTERVENTIONS_ENABLED",
    ] {
        unsafe { std::env::remove_var(flag) };
    }
    let db = Db::new(&db_url).await.expect("database");
    let owner = seed_user(&db, "owner").await;
    let other = seed_user(&db, "other").await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let thread_id = Ulid::new().to_string();
    let requirement_source = Ulid::new().to_string();
    let requirement_version = format!("source:{requirement_source}:v1");
    let quote_source = Ulid::new().to_string();
    let quote_source_version = format!("source:{quote_source}:v1");
    let private_statement = "The entry must be step-free for a family member.";
    let quote_evidence = "The main entry has three steps.";
    let mut constraint = fixture_constraint();
    constraint.source_ref = requirement_source.clone();
    constraint.source_anchor.message_id = requirement_source.clone();
    constraint.source_anchor.source_version_id = Some(requirement_version.clone());
    constraint.source_anchor.exact_excerpt = private_statement.to_string();
    constraint.observed_at = Utc::now().to_rfc3339();

    for source in [
        source_message(
            &thread_id,
            &requirement_source,
            &requirement_version,
            private_statement,
        ),
        source_message(
            &thread_id,
            &quote_source,
            &quote_source_version,
            quote_evidence,
        ),
    ] {
        let (status, body) = request(&app, "/send", &owner, source).await;
        assert_eq!(status, StatusCode::OK, "source: {body}");
    }
    unsafe { std::env::set_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED", "true") };
    let (status, body) = request(
        &app,
        "/planning/constraints",
        &owner,
        json!({"thread_id": thread_id, "authority": "user_confirmed", "constraint": constraint}),
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
    quotation["sources"][0]["source_id"] = json!(quote_source);
    quotation["sources"][0]["source_version_id"] = json!(quote_source_version);
    for path in ["line_items", "commercial_terms"] {
        quotation[path][0]["evidence"]["anchors"][0]["source_id"] = json!(quote_source);
        quotation[path][0]["evidence"]["anchors"][0]["source_version_id"] =
            json!(quote_source_version);
    }
    quotation["tax"]["evidence"]["anchors"][0]["source_id"] = json!(quote_source);
    quotation["tax"]["evidence"]["anchors"][0]["source_version_id"] = json!(quote_source_version);
    let quotation_id = quotation["identity"]["quotation_id"]
        .as_str()
        .expect("quotation id")
        .to_string();
    let version_id = quotation["identity"]["version_id"]
        .as_str()
        .expect("version")
        .to_string();
    let (status, body) = request(
        &app,
        "/quotation/normalisations",
        &owner,
        json!({"thread_id": thread_id, "quotation": quotation}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "quotation: {body}");

    let comparison_id = format!("comparison:{thread_id}");
    let (status, comparison_receipt) = request(
        &app,
        "/quotation/comparisons",
        &owner,
        json!({
            "thread_id": thread_id,
            "comparison_id": comparison_id,
            "scenario": {"scenario_id": "scenario:intervention"},
            "inputs": [{
                "version_id": version_id,
                "requirements": [{
                    "requirement_id": constraint.constraint_id,
                    "importance": "hard",
                    "status": "conflict",
                    "evidence": {"state": "confirmed", "anchors": [{
                        "source_id": quote_source,
                        "source_version_id": quote_source_version,
                        "locator": "content.body",
                        "exact_excerpt": quote_evidence
                    }]}
                }]
            }]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "comparison: {comparison_receipt}");
    let comparison_revision = comparison_receipt["message_ids"][0]
        .as_str()
        .expect("comparison revision");

    let prepare = json!({
        "thread_id": thread_id,
        "plan_id": constraint.plan_id,
        "constraint_id": constraint.constraint_id,
        "comparison_id": comparison_id,
        "quotation_version_id": version_id,
        "recipient": "venue@example.test"
    });
    let (status, disabled) = request(
        &app,
        "/planning/constraint-interventions/prepare",
        &owner,
        prepare.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "disabled: {disabled}");
    unsafe {
        std::env::set_var("OMNYID_PLANNING_EVALUATION_ENABLED", "true");
        std::env::set_var("OMNYID_PLANNING_INTERVENTIONS_ENABLED", "true");
    }
    let (status, hidden) = request(
        &app,
        "/planning/constraint-interventions/prepare",
        &other,
        prepare.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "cross tenant: {hidden}");
    let (status, prepared) = request(
        &app,
        "/planning/constraint-interventions/prepare",
        &owner,
        prepare.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "prepare: {prepared}");
    let (status, retry) = request(
        &app,
        "/planning/constraint-interventions/prepare",
        &owner,
        prepare.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "retry: {retry}");
    assert_eq!(prepared, retry, "immutable replay should be deterministic");
    assert_eq!(prepared["remembered_statement"], private_statement);
    assert_eq!(prepared["bindings"]["comparison_id"], comparison_id);
    assert_eq!(
        prepared["bindings"]["comparison_revision"],
        comparison_revision
    );
    assert_eq!(prepared["bindings"]["quotation_version_id"], version_id);
    assert_eq!(
        prepared["clarification_draft"]["quotation_id"],
        quotation_id
    );
    assert_eq!(
        prepared["clarification_draft"]["comparison_revision"],
        comparison_id
    );
    assert_eq!(
        prepared["intervention"]["options"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    assert!(
        prepared["unknown_labels"]
            .to_string()
            .contains("permission")
    );
    let vendor_draft = prepared["clarification_draft"].to_string();
    assert!(!vendor_draft.contains(private_statement));
    assert!(!vendor_draft.contains(quote_evidence));
    assert!(vendor_draft.contains("required accessibility feature"));
    assert!(!prepared.to_string().contains("provider_receipt_id"));

    let selection = json!({
        "preparation": prepare,
        "selected_option_id": "ask_vendor",
        "idempotency_key": "intervention-intent:one"
    });
    let (status, selected) = request(
        &app,
        "/planning/constraint-interventions/select",
        &owner,
        selection.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "select: {selected}");
    assert_eq!(selected["inserted"], true);
    assert_eq!(selected["decision"]["selected_option_id"], "ask_vendor");
    assert_eq!(
        selected["decision"]["prepared_clarification_draft_ref"],
        prepared["clarification_draft"]["draft_id"]
    );
    assert!(
        selected["clarification_draft_message_id"]
            .as_str()
            .is_some_and(|id| id.len() == 26)
    );
    assert_eq!(
        selected["intervention"]["remembered_statement"],
        private_statement
    );

    let (status, replayed) = request(
        &app,
        "/planning/constraint-interventions/select",
        &owner,
        selection.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "selection retry: {replayed}");
    assert_eq!(replayed["inserted"], false);
    assert_eq!(replayed["message_id"], selected["message_id"]);
    assert_eq!(
        replayed["clarification_draft_message_id"],
        selected["clarification_draft_message_id"]
    );
    assert_eq!(replayed["decision"], selected["decision"]);

    let mut divergent = selection;
    divergent["selected_option_id"] = json!("accept_conflict");
    let (status, conflict) = request(
        &app,
        "/planning/constraint-interventions/select",
        &owner,
        divergent,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "divergent retry: {conflict}");

    for flag in [
        "OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED",
        "OMNYID_PLANNING_EVALUATION_ENABLED",
        "OMNYID_PLANNING_INTERVENTIONS_ENABLED",
    ] {
        unsafe { std::env::remove_var(flag) };
    }
}
