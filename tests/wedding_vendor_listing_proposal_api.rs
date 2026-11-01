//! Disposable-Postgres proof for private missing-listing proposals.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::db::{AuthSessionRecord, Db, UserRecord};
use serde_json::{Value, json};
use sqlx::Row;
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
                "listing proposal tests require disposable local omnyid_test",
            );
        })
}

async fn seed_user(db: &Db, email: String) -> (String, String) {
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email,
        password_hash: Some("integration-test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Listing proposal tester".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    db.mark_email_verified(&user.id)
        .await
        .expect("verify email");
    let token = format!(
        "listing_proposal_{}",
        Ulid::new().to_string().to_lowercase()
    );
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: user.id.clone(),
        created_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + Duration::hours(2)).to_rfc3339(),
    })
    .await
    .expect("create session");
    (user.id, format!("Bearer {token}"))
}

async fn request(
    app: &Router,
    method: &str,
    uri: &str,
    auth: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
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
    let value = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| json!({"text": String::from_utf8_lossy(&bytes)}));
    (status, value)
}

#[tokio::test]
async fn proposal_stays_private_until_ownership_and_operator_review() {
    let Some(db_url) = test_db_url() else {
        return;
    };
    let prior_enabled = std::env::var_os("OMNYID_VENDOR_LISTING_PROPOSALS_ENABLED");
    let prior_admins = std::env::var_os("OMNYID_ADMIN_EMAILS");
    let suffix = Ulid::new().to_string().to_lowercase();
    let domain = format!("{suffix}.vendor.test");
    let owner_email = format!("owner@{domain}");
    let operator_email = format!("operator-{suffix}@omnyid.test");
    unsafe {
        std::env::set_var("OMNYID_VENDOR_LISTING_PROPOSALS_ENABLED", "true");
        std::env::set_var("OMNYID_ADMIN_EMAILS", &operator_email);
    }
    let db = Db::new(&db_url).await.expect("database");
    let (_owner_id, owner_auth) = seed_user(&db, owner_email.clone()).await;
    let (_operator_id, operator_auth) = seed_user(&db, operator_email).await;
    let (_other_id, other_auth) = seed_user(&db, format!("other-{suffix}@omnyid.test")).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let proposal = json!({
        "business_name": format!("Private Vendor {suffix}"),
        "category": "venue",
        "service_area": "Sydney NSW",
        "website_url": format!("https://{domain}/weddings"),
        "business_email": owner_email,
        "declared_role": "owner"
    });

    let (status, created) = request(
        &app,
        "POST",
        "/api/wedding/vendor/listing-proposals",
        &owner_auth,
        proposal.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create: {created}");
    let proposal_id = created["proposal_id"].as_str().expect("proposal id");
    let vendor_slug = created["vendor_slug"].as_str().expect("vendor slug");
    let row = sqlx::query(
        "SELECT status, claim_status, claimed_by_user_id FROM wedding_vendors WHERE vendor_slug = $1",
    )
    .bind(vendor_slug)
    .fetch_one(&db.pool)
    .await
    .expect("hidden vendor");
    assert_eq!(row.get::<String, _>("status"), "hidden");
    assert_eq!(row.get::<String, _>("claim_status"), "claim_pending");
    assert!(
        row.try_get::<Option<String>, _>("claimed_by_user_id")
            .ok()
            .flatten()
            .is_none()
    );

    let (status, repeated) = request(
        &app,
        "POST",
        "/api/wedding/vendor/listing-proposals",
        &owner_auth,
        proposal.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "idempotent retry: {repeated}");
    assert_eq!(repeated["proposal_id"], created["proposal_id"]);
    let (status, duplicate) = request(
        &app,
        "POST",
        "/api/wedding/vendor/listing-proposals",
        &other_auth,
        proposal,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "duplicate: {duplicate}");

    let (status, verified) = request(
        &app,
        "POST",
        "/api/wedding/vendor/ownership/verify",
        &owner_auth,
        json!({"vendor_slug": vendor_slug, "method": "email_domain"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "ownership: {verified}");
    let status_before_review: String =
        sqlx::query_scalar("SELECT status FROM wedding_vendors WHERE vendor_slug = $1")
            .bind(vendor_slug)
            .fetch_one(&db.pool)
            .await
            .expect("pre-review status");
    assert_eq!(status_before_review, "hidden");
    let proposal_status: String = sqlx::query_scalar(
        "SELECT status FROM wedding_vendor_listing_proposals WHERE proposal_id = $1",
    )
    .bind(proposal_id)
    .fetch_one(&db.pool)
    .await
    .expect("proposal review status");
    assert_eq!(proposal_status, "awaiting_review");

    let (status, published) = request(
        &app,
        "POST",
        &format!("/admin/wedding/vendor/listing-proposals/{proposal_id}/decision"),
        &operator_auth,
        json!({
            "decision": "publish",
            "note": "Ownership evidence and the proposed listing were reviewed."
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "publish: {published}");
    let final_status: String =
        sqlx::query_scalar("SELECT status FROM wedding_vendors WHERE vendor_slug = $1")
            .bind(vendor_slug)
            .fetch_one(&db.pool)
            .await
            .expect("published status");
    assert_eq!(final_status, "active");

    match prior_enabled {
        Some(value) => unsafe {
            std::env::set_var("OMNYID_VENDOR_LISTING_PROPOSALS_ENABLED", value)
        },
        None => unsafe { std::env::remove_var("OMNYID_VENDOR_LISTING_PROPOSALS_ENABLED") },
    }
    match prior_admins {
        Some(value) => unsafe { std::env::set_var("OMNYID_ADMIN_EMAILS", value) },
        None => unsafe { std::env::remove_var("OMNYID_ADMIN_EMAILS") },
    }
}
