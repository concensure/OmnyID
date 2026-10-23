//! Disposable-Postgres proof for fail-closed vendor listing ownership.

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
                "ownership tests require disposable local omnyid_test",
            )
        })
}

async fn seed_user(db: &Db, email: String, verified: bool) -> (String, String) {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email,
        password_hash: Some("integration-test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Vendor representative".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    if verified {
        db.mark_email_verified(&user.id)
            .await
            .expect("verify email");
    }
    let token = format!("vendor_ownership_{suffix}");
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

async fn seed_vendor(db: &Db, slug: &str, domain: &str) -> String {
    let vendor_id = Ulid::new().to_string();
    sqlx::query(
        "INSERT INTO wedding_vendors (vendor_id, vendor_slug, vendor_name, category, service_area, website_url, contact_email) VALUES ($1, $2, 'Ownership test vendor', 'venue', 'Sydney', $3, $4)",
    ).bind(&vendor_id).bind(slug).bind(format!("https://{domain}"))
        .bind(format!("contact@{domain}")).execute(&db.pool).await.expect("seed vendor");
    vendor_id
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
    let body = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| json!({"text": String::from_utf8_lossy(&bytes)}));
    (status, body)
}

async fn start_claim(app: &Router, auth: &str, slug: &str) -> (StatusCode, Value) {
    request(
        app,
        "POST",
        "/api/wedding/vendor/intake",
        auth,
        json!({"vendor_slug": slug, "declared_role": "owner"}),
    )
    .await
}

#[tokio::test]
async fn ownership_is_not_granted_until_exact_verified_domain_proof() {
    let Some(db_url) = test_db_url() else {
        return;
    };
    let db = Db::new(&db_url).await.expect("database");
    let suffix = Ulid::new().to_string().to_lowercase();
    let slug = format!("ownership-{suffix}");
    let domain = format!("{suffix}.vendor.test");
    let vendor_id = seed_vendor(&db, &slug, &domain).await;
    let (attacker_id, attacker_auth) =
        seed_user(&db, format!("attacker-{suffix}@gmail.com"), true).await;
    let (owner_id, owner_auth) = seed_user(&db, format!("owner@{domain}"), true).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;

    let (status, attacker_claim) = start_claim(&app, &attacker_auth, &slug).await;
    assert_eq!(status, StatusCode::OK, "attacker intake: {attacker_claim}");
    let listing = sqlx::query(
        "SELECT claim_status, claimed_by_user_id FROM wedding_vendors WHERE vendor_id = $1",
    )
    .bind(&vendor_id)
    .fetch_one(&db.pool)
    .await
    .expect("listing");
    assert_eq!(listing.get::<String, _>("claim_status"), "unclaimed");
    assert_eq!(
        listing
            .try_get::<Option<String>, _>("claimed_by_user_id")
            .ok()
            .flatten(),
        None
    );
    let role_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM user_roles WHERE user_id = $1 AND role = 'vendor'",
    )
    .bind(&attacker_id)
    .fetch_one(&db.pool)
    .await
    .expect("role count");
    assert_eq!(role_count, 0);

    let (status, denied) = request(
        &app,
        "POST",
        "/api/wedding/vendor/ownership/verify",
        &attacker_auth,
        json!({"vendor_slug": slug, "method": "email_domain"}),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "public-mail proof: {denied}");
    let (status, denied) = request(
        &app,
        "POST",
        "/api/wedding/vendor/photo-licence",
        &attacker_auth,
        json!({"vendor_slug": slug, "accepted": true}),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "pre-proof licence: {denied}");

    let (status, owner_claim) = start_claim(&app, &owner_auth, &slug).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "parallel legitimate intake: {owner_claim}"
    );
    let (status, challenge) = request(
        &app,
        "POST",
        "/api/wedding/vendor/ownership/challenge",
        &owner_auth,
        json!({"vendor_slug": slug, "method": "website_meta"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "website challenge: {challenge}");
    assert_eq!(
        challenge["dns_record_name"],
        format!("_omnyid-claim.{domain}")
    );
    assert_eq!(challenge["dns_record_value"], challenge["token"]);
    let (status, verified) = request(
        &app,
        "POST",
        "/api/wedding/vendor/ownership/verify",
        &owner_auth,
        json!({"vendor_slug": slug, "method": "email_domain"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "work-domain proof: {verified}");
    assert_eq!(verified["ownership_verified"], true);

    let listing = sqlx::query(
        "SELECT claim_status, claimed_by_user_id FROM wedding_vendors WHERE vendor_id = $1",
    )
    .bind(&vendor_id)
    .fetch_one(&db.pool)
    .await
    .expect("verified listing");
    assert_eq!(listing.get::<String, _>("claim_status"), "verified");
    assert_eq!(listing.get::<String, _>("claimed_by_user_id"), owner_id);
    let statuses: Vec<String> = sqlx::query_scalar(
        "SELECT status FROM wedding_vendor_claims WHERE vendor_id = $1 ORDER BY status",
    )
    .bind(&vendor_id)
    .fetch_all(&db.pool)
    .await
    .expect("claim states");
    assert_eq!(
        statuses,
        vec!["abandoned".to_string(), "verified".to_string()]
    );
}

#[tokio::test]
async fn claimant_can_release_an_unverified_attempt() {
    let Some(db_url) = test_db_url() else {
        return;
    };
    let db = Db::new(&db_url).await.expect("database");
    let suffix = Ulid::new().to_string().to_lowercase();
    let slug = format!("release-{suffix}");
    seed_vendor(&db, &slug, &format!("{suffix}.release.test")).await;
    let (_user_id, auth) = seed_user(&db, format!("owner-{suffix}@example.test"), true).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    assert_eq!(start_claim(&app, &auth, &slug).await.0, StatusCode::OK);
    let (status, body) = request(
        &app,
        "POST",
        "/api/wedding/vendor/ownership/release",
        &auth,
        json!({"vendor_slug": slug}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "release: {body}");
    let claim_status: String = sqlx::query_scalar("SELECT c.status FROM wedding_vendor_claims c JOIN wedding_vendors v ON v.vendor_id = c.vendor_id WHERE v.vendor_slug = $1 ORDER BY c.created_at DESC LIMIT 1")
        .bind(&slug).fetch_one(&db.pool).await.expect("released claim");
    assert_eq!(claim_status, "abandoned");
}
