//! Disposable-Postgres HTTP evidence for the scoped quotation response boundary.

use axum::{
    Router,
    body::Body,
    http::{HeaderMap, Request, StatusCode, header},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::{
    db::{AuthSessionRecord, Db, UserRecord},
    message::AFPMessage,
    quotation::{
        ContextGrantAction, ContextGrantPurpose, ContextGrantScope, NormalisedQuotation,
        ShareableContextClass, ShareableContextField, VendorContextGrant,
        normalised_quotation_message, project_vendor_context, vendor_context_grant_message,
        vendor_context_projection_fingerprint,
    },
};
use serde_json::{Value, json};
use std::collections::BTreeSet;
use tower::ServiceExt;
use ulid::Ulid;

#[test]
fn capability_boundary_has_no_request_secret_or_projection_logging_calls() {
    let routes = include_str!("../src/server/quotation_response_capability_routes.rs");
    let portal_routes = include_str!("../src/server/quotation_response_portal_routes.rs");
    let persistence = include_str!("../src/db/quotation_response_capabilities.rs");
    let response = include_str!("../src/quotation/secure_link_response.rs");
    for source in [routes, portal_routes, persistence, response] {
        assert!(!source.contains("tracing::"));
        assert!(!source.contains("#[instrument"));
        assert!(!source.contains("println!"));
        assert!(!source.contains("dbg!"));
    }
    for required in [
        "CACHE_CONTROL",
        "no-store",
        "REFERRER_POLICY",
        "no-referrer",
        "x-frame-options",
        "frame-ancestors 'none'",
        "permissions-policy",
    ] {
        assert!(routes.contains(required), "missing portal boundary {required}");
    }
    let middleware = include_str!("../src/server/mod.rs");
    let request_span = middleware
        .split("async fn request_id_middleware")
        .nth(1)
        .and_then(|source| source.split("pub(super) fn internal_error").next())
        .expect("request middleware source");
    assert!(!request_span.contains("headers ="));
    assert!(!request_span.contains("body ="));
    assert!(!request_span.contains("uri ="));
}

fn test_db_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .inspect(|value| {
            assert!(
                value.contains("@127.0.0.1:") && value.ends_with("/omnyid_test"),
                "capability API tests require disposable local omnyid_test"
            );
        })
}

async fn seed_user(db: &Db, label: &str) -> (UserRecord, String) {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("response-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Response {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("response_session_{suffix}");
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: user.id.clone(),
        created_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + Duration::hours(2)).to_rfc3339(),
    })
    .await
    .expect("create session");
    (user, format!("Bearer {token}"))
}

async fn request(
    app: &Router,
    method: &str,
    uri: &str,
    headers: &[(&str, &str)],
    body: Value,
) -> (StatusCode, HeaderMap, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json");
    for (name, value) in headers {
        builder = builder.header(*name, *value);
    }
    let response = app
        .clone()
        .oneshot(builder.body(Body::from(body.to_string())).expect("request"))
        .await
        .expect("response");
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body")
        .to_bytes();
    let body = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| json!({"text": String::from_utf8_lossy(&bytes)}));
    (status, headers, body)
}

fn quotation(suffix: &str) -> NormalisedQuotation {
    let mut value: Value = serde_json::from_str(include_str!(
        "fixtures/quotation/generic_normalised_quote.json"
    ))
    .expect("fixture");
    value["identity"]["quotation_id"] = json!(format!("response-quote-{suffix}"));
    value["identity"]["version_id"] = json!(format!("response-quote-{suffix}-v1"));
    serde_json::from_value(value).expect("quotation")
}

fn grant_and_fields(
    user_id: &str,
    thread_id: &str,
    quotation: &NormalisedQuotation,
) -> (VendorContextGrant, Vec<ShareableContextField>) {
    let fields = vec![ShareableContextField {
        fact_id: "fact-own-price".to_string(),
        key: "own_quote.total".to_string(),
        value: json!({"amount_minor": 400000, "currency": "AUD"}),
        provenance_ref: quotation.identity.version_id.clone(),
        class: ShareableContextClass::VendorQuotation,
    }];
    let now = Utc::now();
    let mut grant = VendorContextGrant {
        grant_id: format!("grant-{}", Ulid::new()),
        granted_by_user_id: user_id.to_string(),
        target_vendor_id: quotation.identity.vendor_id.clone(),
        quotation_id: quotation.identity.quotation_id.clone(),
        quotation_version_id: quotation.identity.version_id.clone(),
        thread_id: thread_id.to_string(),
        response_recipient_id: format!("recipient-{}", Ulid::new()),
        target_agent_id: None,
        purpose: ContextGrantPurpose::ResolveQuoteGaps,
        allowed_fact_ids: vec!["fact-own-price".to_string()],
        allowed_question_ids: vec!["availability".to_string()],
        allowed_actions: vec![ContextGrantAction::AnswerQuestions],
        issued_at: (now - Duration::minutes(2)).to_rfc3339(),
        not_before: (now - Duration::minutes(1)).to_rfc3339(),
        expires_at: (now + Duration::hours(1)).to_rfc3339(),
        scope: ContextGrantScope::SingleUse,
        approval_receipt_ref: Ulid::new().to_string(),
        projection_version: "quotation.vendor_context.v1".to_string(),
        projection_fingerprint: "0".repeat(64),
    };
    grant.projection_fingerprint =
        vendor_context_projection_fingerprint(&grant, &fields).expect("fingerprint");
    (grant, fields)
}

fn approval_message(thread_id: &str, approval_id: &str, signing_key: &[u8; 32]) -> AFPMessage {
    let mut message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: approval_id.to_string(),
        thread_id: thread_id.to_string(),
        parent_id: None,
        from: "user://quotation-owner".to_string(),
        to: vec!["agent://quotation-permission".to_string()],
        timestamp: Utc::now().to_rfc3339(),
        r#type: "action".to_string(),
        kind: None,
        supertags: vec![],
        subtype: Some("approval_decision".to_string()),
        content: json!({"decision": "approved"}),
        metadata: Some(json!({"origin": "human_approval"})),
        signature: String::new(),
        encryption: None,
        views: vec![],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    };
    omnyid_homeserver::crypto::sign_message(&mut message, signing_key);
    message
}

#[tokio::test]
async fn capability_http_is_tenant_bound_one_time_and_stores_no_raw_secrets() {
    let Some(db_url) = test_db_url() else {
        return;
    };
    let pepper = URL_SAFE_NO_PAD.encode([42_u8; 32]);
    let signing_key = [43_u8; 32];
    unsafe {
        std::env::set_var("OMNYID_QUOTATION_RELEASE_GATE", "verified");
        std::env::set_var(
            "OMNYID_QUOTATION_RELEASE_GATE_VERSION",
            "quotation.readiness.v1",
        );
        std::env::set_var(
            "OMNYID_QUOTATION_RELEASE_EVIDENCE_SHA",
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        );
        std::env::set_var(
            "OMNYID_QUOTATION_VENDOR_RESPONSE_CAPABILITIES_ENABLED",
            "true",
        );
        std::env::set_var("OMNYID_QUOTATION_RESPONSE_CAPABILITY_PEPPER", &pepper);
        std::env::set_var("OMNYID_SIGNING_KEY_HEX", hex::encode(signing_key));
    }
    let db = Db::new(&db_url).await.expect("database");
    let (owner, owner_auth) = seed_user(&db, "owner").await;
    let (_other, other_auth) = seed_user(&db, "other").await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let thread_id = Ulid::new().to_string();
    let suffix = Ulid::new().to_string().to_lowercase();
    let quotation = quotation(&suffix);
    let quotation_message = normalised_quotation_message(
        &quotation,
        &thread_id,
        None,
        &Utc::now().to_rfc3339(),
        "agent://quotation-intelligence",
    );
    let (status, _, body) = request(
        &app,
        "POST",
        "/send",
        &[("authorization", &owner_auth)],
        serde_json::to_value(quotation_message).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "quotation: {body}");

    let (grant, fields) = grant_and_fields(&owner.id, &thread_id, &quotation);
    let (status, _, body) = request(
        &app,
        "POST",
        "/send",
        &[("authorization", &owner_auth)],
        serde_json::to_value(approval_message(
            &thread_id,
            &grant.approval_receipt_ref,
            &signing_key,
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "approval: {body}");
    let projection = project_vendor_context(
        &grant,
        &grant.target_vendor_id,
        &fields,
        &[],
        &BTreeSet::new(),
        Utc::now(),
    )
    .expect("projection");
    let grant_message = vendor_context_grant_message(
        &grant,
        &projection,
        &grant.approval_receipt_ref,
        "agent://quotation-permission",
    )
    .expect("grant message");
    let grant_message_id = grant_message.id.clone();
    let (status, _, body) = request(
        &app,
        "POST",
        "/send",
        &[("authorization", &owner_auth)],
        serde_json::to_value(grant_message).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "grant: {body}");

    let issue_body = json!({"thread_id": thread_id, "grant_message_id": grant_message_id});
    let (status, _, other_issue) = request(
        &app,
        "POST",
        "/quotation/response-capabilities",
        &[("authorization", &other_auth)],
        issue_body.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "cross tenant: {other_issue}");
    let (status, _, issued) = request(
        &app,
        "POST",
        "/quotation/response-capabilities",
        &[("authorization", &owner_auth)],
        issue_body,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "issue: {issued}");
    let raw_token = issued["response_token"].as_str().expect("raw token");
    let capability_id = issued["capability_id"].as_str().expect("capability id");

    let exchange_body = json!({"response_token": raw_token});
    let wrong_vendor = json!({"response_token": raw_token, "vendor_id": "other-vendor"});
    let (status, _, wrong) = request(
        &app,
        "POST",
        "/quotation/vendor-response/exchange",
        &[("cf-connecting-ip", "192.0.2.10")],
        wrong_vendor,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(wrong, json!({"text": "response unavailable"}));

    let (status, exchange_headers, exchanged) = request(
        &app,
        "POST",
        "/quotation/vendor-response/exchange",
        &[("cf-connecting-ip", "192.0.2.10")],
        exchange_body,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "exchange: {exchanged}");
    assert_eq!(exchanged["account_access"], false);
    assert_eq!(exchanged["projection"], json!(projection));
    let set_cookie = exchange_headers
        .get(header::SET_COOKIE)
        .and_then(|value| value.to_str().ok())
        .expect("strict cookie");
    assert!(set_cookie.contains("HttpOnly"));
    assert!(set_cookie.contains("Secure"));
    assert!(set_cookie.contains("SameSite=Strict"));
    assert_eq!(
        exchange_headers
            .get(header::CACHE_CONTROL)
            .and_then(|value| value.to_str().ok()),
        Some("no-store")
    );
    assert_eq!(
        exchange_headers
            .get(header::REFERRER_POLICY)
            .and_then(|value| value.to_str().ok()),
        Some("no-referrer")
    );
    assert_eq!(
        exchange_headers
            .get("x-frame-options")
            .and_then(|value| value.to_str().ok()),
        Some("DENY")
    );
    let cookie = set_cookie.split(';').next().expect("cookie pair");
    let csrf = exchanged["csrf_token"].as_str().expect("csrf");
    let nonce = exchanged["submission_nonce"].as_str().expect("nonce");

    let (status, _, cross_revoke) = request(
        &app,
        "POST",
        &format!("/quotation/response-capabilities/{capability_id}/revoke"),
        &[("authorization", &other_auth)],
        json!({}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "cross revoke: {cross_revoke}"
    );

    let consume_body = json!({
        "submission_nonce": nonce,
        "action": "answer_questions",
        "question_answers": [{
            "question_id": "availability",
            "state": "confirmed",
            "answer": "Yes, the package is available.",
            "anchors": [],
        }],
        "commercial_facts": [],
        "availability": {"state": "available", "anchors": []},
        "affirmed": true,
    });
    let (status, _, _) = request(
        &app,
        "POST",
        "/quotation/vendor-response/consume",
        &[("cookie", cookie), ("x-csrf-token", "wrong")],
        consume_body.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, consume_headers, consumed) = request(
        &app,
        "POST",
        "/quotation/vendor-response/consume",
        &[("cookie", cookie), ("x-csrf-token", csrf)],
        consume_body.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "consume: {consumed}");
    assert_eq!(consumed["status"], "received");
    assert_eq!(consumed["requires_user_review"], true);
    assert_eq!(consumed["accepted"], false);
    assert_eq!(consumed["booking"], false);
    assert_eq!(consumed["payment_execution"], false);
    assert_eq!(
        consume_headers
            .get(header::CACHE_CONTROL)
            .and_then(|value| value.to_str().ok()),
        Some("no-store")
    );
    let (status, _, replayed) = request(
        &app,
        "POST",
        "/quotation/vendor-response/consume",
        &[("cookie", cookie), ("x-csrf-token", csrf)],
        consume_body,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "replay: {replayed}");
    assert_eq!(replayed["receipt_id"], consumed["receipt_id"]);

    let stored_messages = db
        .get_private_thread(&owner.id, &grant.thread_id)
        .await
        .expect("private response thread");
    let response_message = stored_messages
        .iter()
        .find(|message| message.kind.as_deref() == Some("quotation_vendor_response_received"))
        .expect("private AFP response event");
    let response_content: Value =
        serde_json::from_str(&response_message.content).expect("response content");
    assert_eq!(response_content["response"]["channel"], "secure_link");
    assert_eq!(response_content["response"]["status"], "received");
    assert_eq!(
        response_content["attribution"]["signed_vendor_agent"],
        false
    );
    assert_eq!(response_content["attribution"]["booking"], false);

    let stored: (String, Value) = sqlx::query_as(
        "SELECT token_mac, record_json FROM quotation_response_capabilities WHERE capability_id = $1",
    )
    .bind(capability_id)
    .fetch_one(&db.pool)
    .await
    .expect("stored capability");
    assert_ne!(stored.0, raw_token);
    assert!(!stored.1.to_string().contains(raw_token));
    let leaked_audit: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM quotation_response_capability_audit WHERE event_id LIKE '%' || $1 || '%'",
    )
    .bind(raw_token)
    .fetch_one(&db.pool)
    .await
    .expect("audit scan");
    assert_eq!(leaked_audit, 0);
}
