//! Disposable-Postgres proof for revision-bound cost advice and acknowledgement.

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
                "cost advice tests require disposable local omnyid_test"
            );
        })
}

async fn seed_user(db: &Db, label: &str) -> String {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("cost-advice-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Cost advice {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("cost_advice_session_{suffix}");
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

fn message(thread_id: &str, id: &str, kind: &str, content: Value) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": id,
        "thread_id": thread_id,
        "from": "user://cost-advice-owner",
        "to": ["agent://planning-intelligence"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": "ledger",
        "kind": kind,
        "subtype": kind,
        "content": content,
        "metadata": {"store": true, "privacy_scope": "tenant_private"},
        "store_in_relational": true
    })
}

fn cost_evidence(plan_id: &str, budget_revision_ref: &str, quote_revision_ref: &str) -> Value {
    json!({
        "schema_version": "planning.cost_evidence.v1",
        "plan_id": plan_id,
        "currency": "AUD",
        "budget_target": {
            "minimum_minor": 100_000,
            "maximum_minor": 100_000,
            "currency": "AUD",
            "evidence_refs": [budget_revision_ref]
        },
        "forecast_before": {
            "minimum_minor": 90_000,
            "maximum_minor": 90_000,
            "currency": "AUD",
            "evidence_refs": [budget_revision_ref]
        },
        "categories": [
            {
                "category_ref": "flowers_decor",
                "state": "allowance",
                "source_revision_ref": budget_revision_ref,
                "offset_kind": "current_allowance",
                "saving_range": {
                    "minimum_minor": 10_000,
                    "maximum_minor": 20_000,
                    "currency": "AUD",
                    "evidence_refs": [budget_revision_ref]
                }
            },
            {
                "category_ref": "transport",
                "state": "uncontracted",
                "source_revision_ref": budget_revision_ref,
                "offset_kind": null,
                "saving_range": null
            }
        ],
        "unresolved_fee_drivers": [{
            "driver_ref": "fee:photography:quantity_unconfirmed",
            "source_revision_ref": quote_revision_ref
        }]
    })
}

#[tokio::test]
async fn cost_advice_uses_owned_current_evidence_and_acknowledges_exact_revision() {
    let Some(db_url) = test_db_url() else { return };
    for flag in [
        "OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED",
        "OMNYID_PLANNING_COST_TRADEOFFS_ENABLED",
    ] {
        unsafe { std::env::remove_var(flag) };
    }
    let db = Db::new(&db_url).await.expect("database");
    let owner = seed_user(&db, "owner").await;
    let other = seed_user(&db, "other").await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let thread_id = Ulid::new().to_string();
    let plan_id = format!("plan:{thread_id}");
    let quote_source = Ulid::new().to_string();
    let quote_source_version = format!("source:{quote_source}:v1");
    let (status, body) = post(
        &app,
        "/send",
        &owner,
        message(
            &thread_id,
            &quote_source,
            "planning_source",
            json!({"body": "Photography package total AUD 3,000.", "source_version_id": quote_source_version}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "quote source: {body}");

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
    let version_id = quotation["identity"]["version_id"]
        .as_str()
        .unwrap()
        .to_string();
    let (status, body) = post(
        &app,
        "/quotation/normalisations",
        &owner,
        json!({"thread_id": thread_id, "quotation": quotation}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "quotation: {body}");

    let comparison_id = format!("comparison:{thread_id}");
    let (status, comparison) = post(
        &app,
        "/quotation/comparisons",
        &owner,
        json!({
            "thread_id": thread_id,
            "comparison_id": comparison_id,
            "scenario": {"scenario_id": "scenario:cost-advice"},
            "inputs": [{"version_id": version_id, "requirements": []}]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "comparison: {comparison}");

    let budget_revision = Ulid::new().to_string();
    let (status, body) = post(
        &app,
        "/send",
        &owner,
        message(
            &thread_id,
            &budget_revision,
            "planning_cost_evidence",
            cost_evidence(&plan_id, &budget_revision, &version_id),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "budget evidence: {body}");

    let preparation = json!({
        "thread_id": thread_id,
        "plan_id": plan_id,
        "budget_revision_ref": budget_revision,
        "comparison_id": comparison_id,
        "quotation_version_id": version_id,
        "candidate_category_ref": "photo_video"
    });
    let (status, disabled) = post(
        &app,
        "/planning/cost-tradeoffs/prepare",
        &owner,
        preparation.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "disabled: {disabled}");
    unsafe {
        std::env::set_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED", "true");
        std::env::set_var("OMNYID_PLANNING_COST_TRADEOFFS_ENABLED", "true");
    }
    let (status, hidden) = post(
        &app,
        "/planning/cost-tradeoffs/prepare",
        &other,
        preparation.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "cross tenant: {hidden}");
    let (status, advice) = post(
        &app,
        "/planning/cost-tradeoffs/prepare",
        &owner,
        preparation.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "advice: {advice}");
    assert_eq!(advice["tradeoff"]["incremental_cost"]["state"], "exact");
    assert_eq!(advice["requires_acknowledgement"], true);
    assert_eq!(advice["uncontracted_category_refs"], json!(["transport"]));
    assert_eq!(
        advice["tradeoff"]["offset_options"][0]["category_ref"],
        "flowers_decor"
    );

    let acknowledge = json!({
        "preparation": preparation,
        "idempotency_key": "intent:cost-advice:test"
    });
    let (status, receipt) = post(
        &app,
        "/planning/cost-tradeoffs/acknowledge",
        &owner,
        acknowledge.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "acknowledge: {receipt}");
    assert_eq!(receipt["inserted"], true);
    assert_eq!(receipt["advance_allowed"], true);
    let (status, replay) = post(
        &app,
        "/planning/cost-tradeoffs/acknowledge",
        &owner,
        acknowledge,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "acknowledge replay: {replay}");
    assert_eq!(replay["inserted"], false);
    assert_eq!(receipt["message_id"], replay["message_id"]);

    let next_budget_revision = Ulid::new().to_string();
    let (status, body) = post(
        &app,
        "/send",
        &owner,
        message(
            &thread_id,
            &next_budget_revision,
            "planning_cost_evidence",
            cost_evidence(&plan_id, &next_budget_revision, &version_id),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "next budget: {body}");
    let old_preparation = receipt["advice"]["bindings"]["budget_revision_ref"]
        .as_str()
        .unwrap();
    let (status, stale) = post(
        &app,
        "/planning/cost-tradeoffs/prepare",
        &owner,
        json!({
            "thread_id": thread_id,
            "plan_id": plan_id,
            "budget_revision_ref": old_preparation,
            "comparison_id": comparison_id,
            "quotation_version_id": version_id,
            "candidate_category_ref": "photo_video"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "stale budget: {stale}");

    unsafe {
        std::env::remove_var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED");
        std::env::remove_var("OMNYID_PLANNING_COST_TRADEOFFS_ENABLED");
    }
}
