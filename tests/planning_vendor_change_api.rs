//! Disposable-Postgres proof for current tenant-private vendor-change review.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::{
    db::{AuthSessionRecord, Db, UserRecord},
    message::AFPMessage,
    quotation::{
        NormalisedQuotation, PreparedSecureLinkResponse, QuotationVendorResponse,
        VendorCommercialFact, VendorCommercialValue, VendorResponseEvidenceState,
        VendorResponseStatus, normalised_quotation_message, secure_link_response_message,
        vendor_response_fingerprint, vendor_response_review_proposal,
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
                "vendor-change tests require disposable local omnyid_test"
            );
        })
}

async fn seed_user(db: &Db, label: &str) -> String {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("vendor-change-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Vendor change {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("vendor_change_session_{suffix}");
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

async fn get(app: &Router, uri: &str, auth: &str) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(uri)
                .header(AUTHORIZATION, auth)
                .body(Body::empty())
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

async fn send(app: &Router, auth: &str, message: &AFPMessage) {
    let (status, body) = post(
        app,
        "/send",
        auth,
        serde_json::to_value(message).expect("message JSON"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "send: {body}");
}

fn app_message(thread_id: &str, kind: &str, content: Value) -> AFPMessage {
    serde_json::from_value(json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "system://wedding-planning",
        "to": ["agent://planning-intelligence"],
        "timestamp": "2026-10-19T00:00:00Z",
        "type": "note",
        "kind": kind,
        "subtype": kind,
        "supertags": ["wedding"],
        "content": content,
        "metadata": {"store": true, "privacy_scope": "tenant_private"},
        "store_in_relational": true
    }))
    .expect("AFP message")
}

fn quotation(thread_id: &str) -> (NormalisedQuotation, AFPMessage) {
    let quotation: NormalisedQuotation = serde_json::from_str(include_str!(
        "fixtures/quotation/generic_normalised_quote.json"
    ))
    .expect("quotation fixture");
    let message = normalised_quotation_message(
        &quotation,
        thread_id,
        None,
        "2026-10-17T00:00:00Z",
        "agent://quotation-normaliser",
    );
    (quotation, message)
}

fn response(thread_id: &str, response_id: &str) -> QuotationVendorResponse {
    let mut response: QuotationVendorResponse =
        serde_json::from_str(include_str!("fixtures/quotation/vendor_response_v1.json"))
            .expect("response fixture");
    response.thread_id = thread_id.to_string();
    response.response_id = response_id.to_string();
    response.status = VendorResponseStatus::Received;
    response.question_answers.clear();
    response.availability = None;
    response.attachments.clear();
    response.explanation = None;
    response.commercial_facts = vec![price_fact(425_000), deadline_fact()];
    response
}

fn price_fact(amount_minor: i64) -> VendorCommercialFact {
    VendorCommercialFact {
        fact_id: "lighting-price-change".to_string(),
        key: "change.line_item.lighting.price".to_string(),
        state: VendorResponseEvidenceState::Confirmed,
        value: Some(VendorCommercialValue::Money(
            omnyid_homeserver::quotation::Money {
                amount_minor,
                currency: "AUD".to_string(),
            },
        )),
        anchors: vec![omnyid_homeserver::quotation::SourceAnchor {
            source_id: "vendor-response-source-1".to_string(),
            source_version_id: "vendor-response-source-1-v1".to_string(),
            locator: "section=pricing".to_string(),
            exact_excerpt: format!("Lighting package now costs {amount_minor}"),
        }],
    }
}

fn deadline_fact() -> VendorCommercialFact {
    VendorCommercialFact {
        fact_id: "lighting-deadline".to_string(),
        key: "change.line_item.lighting.deadline".to_string(),
        state: VendorResponseEvidenceState::Confirmed,
        value: Some(VendorCommercialValue::Date(
            "2026-11-15T00:00:00Z".to_string(),
        )),
        anchors: vec![omnyid_homeserver::quotation::SourceAnchor {
            source_id: "vendor-response-source-1".to_string(),
            source_version_id: "vendor-response-source-1-v1".to_string(),
            locator: "section=deadline".to_string(),
            exact_excerpt: "Choose by 15 November".to_string(),
        }],
    }
}

fn response_message(response: QuotationVendorResponse, session: &str) -> AFPMessage {
    let fingerprint = vendor_response_fingerprint(&response).expect("fingerprint");
    let proposal = vendor_response_review_proposal(&response).expect("proposal");
    secure_link_response_message(
        &PreparedSecureLinkResponse {
            response,
            proposal,
            fingerprint,
            receipt_id: format!("receipt-{session}"),
        },
        "grant-message-1",
        session,
    )
}

fn flags(enabled: bool) {
    for name in [
        "OMNYID_PLANNING_VENDOR_CHANGES_ENABLED",
        "OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED",
        "OMNYID_PLANNING_EVALUATION_ENABLED",
        "OMNYID_PLANNING_COST_TRADEOFFS_ENABLED",
    ] {
        unsafe {
            if enabled {
                std::env::set_var(name, "true");
            } else {
                std::env::remove_var(name);
            }
        }
    }
}

#[tokio::test]
async fn vendor_change_prepare_is_private_current_deduplicated_and_non_mutating() {
    let Some(db_url) = test_db_url() else { return };
    flags(false);
    let db = Db::new(&db_url).await.expect("database");
    let owner = seed_user(&db, "owner").await;
    let other = seed_user(&db, "other").await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let thread_id = Ulid::new().to_string();
    let plan_id = format!("plan:{thread_id}");
    let request = json!({
        "thread_id": thread_id,
        "plan_id": plan_id,
        "response_id": "response-original"
    });

    let (status, body) = post(
        &app,
        "/planning/vendor-changes/prepare",
        &owner,
        request.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "disabled: {body}");

    let (_, quotation_message) = quotation(&thread_id);
    send(&app, &owner, &quotation_message).await;
    send(
        &app,
        &owner,
        &response_message(response(&thread_id, "response-original"), "original"),
    )
    .await;
    let mut duplicate = response(&thread_id, "response-duplicate");
    duplicate.channel_receipt.receipt_id = "duplicate-receipt".to_string();
    send(&app, &owner, &response_message(duplicate, "duplicate")).await;

    let budget_id = Ulid::new().to_string();
    let mut budget = app_message(
        &thread_id,
        "planning_cost_evidence",
        json!({
            "schema_version": "planning.cost_evidence.v1",
            "plan_id": plan_id,
            "currency": "AUD",
            "budget_target": {
                "minimum_minor": 500000,
                "maximum_minor": 550000,
                "currency": "AUD",
                "evidence_refs": [budget_id]
            },
            "forecast_before": {
                "minimum_minor": 450000,
                "maximum_minor": 480000,
                "currency": "AUD",
                "evidence_refs": [budget_id]
            },
            "categories": [],
            "unresolved_fee_drivers": []
        }),
    );
    budget.id = budget_id;
    send(&app, &owner, &budget).await;
    send(
        &app,
        &owner,
        &app_message(
            &thread_id,
            "note",
            json!({
                "kind": "wedding_decision_selection",
                "artifact_id": format!("wedding_date:{thread_id}"),
                "wedding_plan_id": plan_id,
                "selected_option": {"id": "wedding-date-2026-12-01"},
                "source": "user"
            }),
        ),
    )
    .await;

    flags(true);
    let (status, hidden) = post(
        &app,
        "/planning/vendor-changes/prepare",
        &other,
        request.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "tenant isolation: {hidden}");

    let (status, review) = post(
        &app,
        "/planning/vendor-changes/prepare",
        &owner,
        request.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "review: {review}");
    assert_eq!(review["quotation_mutated"], false);
    assert_eq!(review["requires_user_review"], true);
    assert_eq!(review["options"][0]["budget_fit"], "uncertain");
    assert_eq!(review["options"][0]["constraint_fit"], "unknown");
    assert_eq!(review["timing"][0]["days_to_event"], 44);
    assert_eq!(review["timing"][0]["days_to_deadline"], 28);

    let duplicate_request = json!({
        "thread_id": thread_id,
        "plan_id": plan_id,
        "response_id": "response-duplicate"
    });
    let (status, duplicate_review) = post(
        &app,
        "/planning/vendor-changes/prepare",
        &owner,
        duplicate_request,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "duplicate: {duplicate_review}");
    assert_eq!(review["review_id"], duplicate_review["review_id"]);

    let acceptance = json!({
        "preparation": request,
        "review_id": review["review_id"],
        "option_ref": review["options"][0]["option_ref"],
        "idempotency_key": "accept-lighting-price-v1"
    });
    let (status, hidden_acceptance) = post(
        &app,
        "/planning/vendor-changes/accept",
        &other,
        acceptance.clone(),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "accept tenant isolation: {hidden_acceptance}"
    );
    let (status, accepted) = post(
        &app,
        "/planning/vendor-changes/accept",
        &owner,
        acceptance.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "accept: {accepted}");
    assert_eq!(accepted["inserted"], true);
    assert_eq!(accepted["booking_created"], false);
    assert_eq!(accepted["payment_executed"], false);
    assert_eq!(accepted["message_ids"].as_array().unwrap().len(), 2);
    let successor_version = accepted["quotation_version_id"]
        .as_str()
        .expect("successor version");

    let (status, retried) = post(
        &app,
        "/planning/vendor-changes/accept",
        &owner,
        acceptance.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "idempotent retry: {retried}");
    assert_eq!(retried["inserted"], false);
    assert_eq!(retried["quotation_version_id"], successor_version);

    let mut reused_key = acceptance.clone();
    reused_key["review_id"] = json!("different-review");
    let (status, conflict) =
        post(&app, "/planning/vendor-changes/accept", &owner, reused_key).await;
    assert_eq!(status, StatusCode::CONFLICT, "key reuse: {conflict}");

    let mut second_key = acceptance.clone();
    second_key["idempotency_key"] = json!("accept-lighting-price-v2");
    let (status, duplicate_acceptance) =
        post(&app, "/planning/vendor-changes/accept", &owner, second_key).await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "a second key cannot fork the accepted quotation: {duplicate_acceptance}"
    );

    let (status, state) = get(
        &app,
        &format!("/quotation/state?thread_id={thread_id}"),
        &owner,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "quotation state: {state}");
    assert_eq!(
        state["active_version_by_quotation"]["production-hire-quote"],
        successor_version
    );
    assert_eq!(
        state["versions"][successor_version]["line_items"][0]["unit_price"]["amount_minor"],
        425_000
    );
    assert_eq!(
        state["versions"][successor_version]["line_items"][0]["evidence"]["rationale"],
        "accepted_vendor_change"
    );
    assert_eq!(
        state["versions"][successor_version]["sources"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|source| source["source_id"] == "vendor-response-source-1")
            .count(),
        1
    );

    let (status, stale_quote) = post(
        &app,
        "/planning/vendor-changes/prepare",
        &owner,
        request.clone(),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "accepted quote successor makes preparation stale: {stale_quote}"
    );

    let mut successor = response(&thread_id, "response-successor");
    successor.parent_response_id = Some("response-original".to_string());
    successor.submitted_at = "2026-10-20T01:04:00Z".to_string();
    successor.channel_receipt.received_at = "2026-10-20T01:05:00Z".to_string();
    successor.attestation.attested_at = "2026-10-20T01:03:00Z".to_string();
    successor.commercial_facts[0] = price_fact(430_000);
    send(&app, &owner, &response_message(successor, "successor")).await;
    let (status, stale) = post(&app, "/planning/vendor-changes/prepare", &owner, request).await;
    assert_eq!(status, StatusCode::CONFLICT, "stale response: {stale}");
    flags(false);
}
