//! Postgres-backed HTTP evidence for release-critical API boundaries.
//!
//! The CI integration lane sets `TEST_DATABASE_URL` to a disposable local
//! database. Local runs without that variable skip cleanly.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::{
    db::{AuthSessionRecord, Db, UserRecord},
    quotation::{NormalisedQuotation, quotation_material_fingerprint},
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
                "API flows require the disposable local omnyid_test database"
            );
        })
}

async fn seed_user(db: &Db, label: &str) -> (UserRecord, String) {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("quotation-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Quotation {label} {suffix}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create test user");
    let token = format!("quotation_session_{suffix}");
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: user.id.clone(),
        created_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + Duration::hours(2)).to_rfc3339(),
    })
    .await
    .expect("create test session");
    (user, format!("Bearer {token}"))
}

async fn request_json(
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
        .expect("response body")
        .to_bytes();
    let payload = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| json!({"text": String::from_utf8_lossy(&bytes)}));
    (status, payload)
}

fn source_message(thread_id: &str, source_id: &str) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": source_id,
        "thread_id": thread_id,
        "from": "omnyid://integration/quotation-source",
        "to": ["agent://quotation-intelligence"],
        "timestamp": Utc::now().to_rfc3339(),
        "type": "document",
        "kind": "quotation_source",
        "content": {"title": "Bounded synthetic quotation source"},
        "metadata": {"privacy_scope": "tenant_private", "test_fixture": true},
        "store_in_relational": true
    })
}

fn quotation(source_id: &str, suffix: &str) -> NormalisedQuotation {
    let mut value: Value = serde_json::from_str(include_str!(
        "fixtures/quotation/generic_normalised_quote.json"
    ))
    .expect("quotation fixture");
    value["identity"]["quotation_id"] = json!(format!("production-hire-{suffix}"));
    value["identity"]["version_id"] = json!(format!("production-hire-{suffix}-v1"));
    value["sources"][0]["source_id"] = json!(source_id);
    value["line_items"][0]["evidence"]["anchors"][0]["source_id"] = json!(source_id);
    value["commercial_terms"][0]["evidence"]["anchors"][0]["source_id"] = json!(source_id);
    serde_json::from_value(value).expect("normalised quotation")
}

#[tokio::test]
async fn quotation_http_flow_is_tenant_private_idempotent_and_stale_safe() {
    let Some(db_url) = test_db_url() else {
        return;
    };
    unsafe {
        std::env::set_var("OMNYID_QUOTATION_RELEASE_GATE", "verified");
        std::env::set_var(
            "OMNYID_QUOTATION_RELEASE_GATE_VERSION",
            "quotation.readiness.v1",
        );
        std::env::set_var(
            "OMNYID_QUOTATION_RELEASE_EVIDENCE_SHA",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        );
        std::env::set_var("OMNYID_QUOTATION_CLOSURE_ENABLED", "true");
    }
    let db = Db::new(&db_url).await.expect("connect test database");
    let (user_a, auth_a) = seed_user(&db, "tenant-a").await;
    let (_user_b, auth_b) = seed_user(&db, "tenant-b").await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let thread_id = Ulid::new().to_string();
    let source_id = Ulid::new().to_string();
    let tenant_b_source_id = Ulid::new().to_string();
    let suffix = Ulid::new().to_string().to_lowercase();

    let (status, unauthenticated) = request_json(
        &app,
        "GET",
        &format!("/quotation/state?thread_id={thread_id}"),
        None,
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "unauthenticated state read: {unauthenticated}"
    );

    let (status, _) = request_json(
        &app,
        "POST",
        "/send",
        Some(&auth_a),
        Some(source_message(&thread_id, &source_id)),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = request_json(
        &app,
        "POST",
        "/send",
        Some(&auth_b),
        Some(source_message(&thread_id, &tenant_b_source_id)),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let quote = quotation(&source_id, &suffix);
    let normalisation = json!({
        "thread_id": thread_id,
        "quotation": quote,
        "parent_message_id": source_id
    });
    let (status, first) = request_json(
        &app,
        "POST",
        "/quotation/normalisations",
        Some(&auth_a),
        Some(normalisation.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "first normalisation: {first}");
    let first_id = first["message_ids"][0]
        .as_str()
        .expect("normalisation message id");
    assert_eq!(first_id.len(), 26, "quotation events must use AFP ULIDs");

    let (status, duplicate) = request_json(
        &app,
        "POST",
        "/quotation/normalisations",
        Some(&auth_a),
        Some(normalisation.clone()),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "duplicate normalisation: {duplicate}"
    );
    assert_eq!(duplicate["message_ids"][0], first["message_ids"][0]);

    let (status, tenant_b_state) = request_json(
        &app,
        "GET",
        &format!("/quotation/state?thread_id={thread_id}"),
        Some(&auth_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "tenant state: {tenant_b_state}");
    assert_eq!(
        tenant_b_state["versions"]
            .as_object()
            .map(|versions| versions.len()),
        Some(0),
        "tenant B must not replay tenant A's quotation"
    );

    let (status, tenant_b_write) = request_json(
        &app,
        "POST",
        "/quotation/normalisations",
        Some(&auth_b),
        Some(normalisation),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "cross-tenant write: {tenant_b_write}"
    );

    let comparison_id = format!("comparison-{suffix}");
    let version_id = quote.identity.version_id.clone();
    let (status, comparison) = request_json(
        &app,
        "POST",
        "/quotation/comparisons",
        Some(&auth_a),
        Some(json!({
            "thread_id": thread_id,
            "comparison_id": comparison_id,
            "scenario": {
                "scenario_id": format!("scenario-{suffix}"),
                "selected_optional_line_ids": [],
                "quantity_overrides": {}
            },
            "inputs": [{"version_id": version_id, "requirements": []}]
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "comparison: {comparison}");

    let (status, state) = request_json(
        &app,
        "GET",
        &format!("/quotation/state?thread_id={thread_id}"),
        Some(&auth_a),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "quotation state: {state}");
    assert_eq!(state["versions"].as_object().map(|map| map.len()), Some(1));
    assert_eq!(
        state["active_comparisons"][&comparison_id]["candidates"][0]["total"]["total_minor"],
        400_000
    );
    assert!(
        state["active_comparisons"][&comparison_id]["recommended_quotation_id"].is_null(),
        "recommendation must remain disabled without verified release evidence"
    );

    let comparison_revision = comparison["message_ids"][0]
        .as_str()
        .expect("comparison message id");
    let selection = json!({
        "thread_id": thread_id,
        "selection_id": format!("selection-{suffix}"),
        "comparison_id": comparison_id,
        "expected_comparison_revision": comparison_revision,
        "quotation_id": quote.identity.quotation_id,
        "quotation_version_id": quote.identity.version_id,
        "vendor_id": quote.identity.vendor_id,
        "idempotency_key": format!("selection-idempotency-{suffix}"),
        "user_authority": true
    });
    let (status, selected) = request_json(
        &app,
        "POST",
        "/quotation/decisions",
        Some(&auth_a),
        Some(selection.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "selection: {selected}");
    assert_eq!(selected["message_ids"].as_array().map(Vec::len), Some(2));
    let (status, duplicate_selection) = request_json(
        &app,
        "POST",
        "/quotation/decisions",
        Some(&auth_a),
        Some(selection.clone()),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "duplicate selection: {duplicate_selection}"
    );
    assert_eq!(duplicate_selection, selected);

    let (status, cross_tenant_selection) = request_json(
        &app,
        "POST",
        "/quotation/decisions",
        Some(&auth_b),
        Some(selection),
    )
    .await;
    assert!(
        matches!(status, StatusCode::NOT_FOUND | StatusCode::CONFLICT),
        "cross-tenant selection must disclose no object: {cross_tenant_selection}"
    );

    let closure = json!({
        "thread_id": thread_id,
        "event_id": format!("contract-received-{suffix}"),
        "quotation_id": quote.identity.quotation_id,
        "quotation_version_id": quote.identity.version_id,
        "comparison_id": comparison_id,
        "expected_comparison_revision": comparison_revision,
        "expected_state": "selected",
        "target_state": "contract_received",
        "user_authority": true,
        "evidence_sources": [{
            "source_id": source_id,
            "source_version_id": "contract-source-v1",
            "media_type": "application/pdf"
        }],
        "contract_changes": [],
        "contract_changes_reviewed": false,
        "idempotency_key": format!("contract-received-idempotency-{suffix}")
    });
    let (status, closed) = request_json(
        &app,
        "POST",
        "/quotation/closure-transitions",
        Some(&auth_a),
        Some(closure.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "contract receipt: {closed}");
    let (status, duplicate_closure) = request_json(
        &app,
        "POST",
        "/quotation/closure-transitions",
        Some(&auth_a),
        Some(closure.clone()),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "duplicate closure: {duplicate_closure}"
    );
    assert_eq!(duplicate_closure, closed);

    let mut invalid_leap = closure;
    invalid_leap["event_id"] = json!(format!("invalid-booking-{suffix}"));
    invalid_leap["expected_state"] = json!("contract_received");
    invalid_leap["target_state"] = json!("booking_confirmed");
    invalid_leap["idempotency_key"] = json!(format!("invalid-booking-idem-{suffix}"));
    let (status, rejected_leap) = request_json(
        &app,
        "POST",
        "/quotation/closure-transitions",
        Some(&auth_a),
        Some(invalid_leap),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "invalid closure leap: {rejected_leap}"
    );

    let fingerprint = quotation_material_fingerprint(&quote);
    let review = json!({
        "thread_id": thread_id,
        "command": {
            "command_id": format!("confirm-{suffix}"),
            "expected_version_id": quote.identity.version_id,
            "expected_material_fingerprint": fingerprint,
            "actor_id": user_a.id,
            "reviewed_at": Utc::now().to_rfc3339(),
            "action": {"action": "confirm_line", "line_id": "lighting"}
        }
    });
    let (status, accepted) = request_json(
        &app,
        "POST",
        "/quotation/reviews",
        Some(&auth_a),
        Some(review.clone()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "review: {accepted}");
    assert_eq!(accepted["message_ids"].as_array().map(Vec::len), Some(2));

    let (status, stale) = request_json(
        &app,
        "POST",
        "/quotation/reviews",
        Some(&auth_a),
        Some(review),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "stale review: {stale}");

    unsafe {
        std::env::remove_var("OMNYID_QUOTATION_RELEASE_GATE");
        std::env::remove_var("OMNYID_QUOTATION_RELEASE_GATE_VERSION");
        std::env::remove_var("OMNYID_QUOTATION_RELEASE_EVIDENCE_SHA");
        std::env::remove_var("OMNYID_QUOTATION_CLOSURE_ENABLED");
    }
}
