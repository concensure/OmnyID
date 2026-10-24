//! Disposable-Postgres proof for authenticated encrypted Email Worker ingress.

use axum::{
    Router,
    body::Body,
    http::{HeaderMap, Request, StatusCode},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Utc;
use hmac::{Hmac, Mac};
use http_body_util::BodyExt;
use omnyid_homeserver::db::{Db, UserRecord};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;
use tower::ServiceExt;
use ulid::Ulid;

const SECRET: &str = "0123456789abcdef0123456789abcdef";

fn test_db_url() -> Option<String> {
    std::env::var("TEST_DATABASE_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .inspect(|value| {
            assert!(
                value.contains("@127.0.0.1:") && value.ends_with("/omnyid_test"),
                "Email Worker tests require disposable local omnyid_test",
            );
        })
}

async fn seed_route(db: &Db) -> (String, String) {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("worker-{suffix}@example.test"),
        password_hash: Some("integration-test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Worker ingress representative".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let vendor_id = Ulid::new().to_string();
    let local_part = format!("worker_test_{}", &suffix[suffix.len() - 8..]);
    sqlx::query(
        r#"INSERT INTO wedding_vendors
            (vendor_id, vendor_slug, vendor_name, category, service_area, status,
             claim_status, claimed_by_user_id, verified_at)
           VALUES ($1,$2,'Worker Test Vendor','venue','Mosman NSW','active',
                   'verified',$3,NOW())"#,
    )
    .bind(&vendor_id)
    .bind(format!("worker-test-{suffix}"))
    .bind(&user.id)
    .execute(&db.pool)
    .await
    .expect("verified vendor");
    sqlx::query(
        r#"INSERT INTO wedding_vendor_sender_identities
            (identity_id, vendor_id, owner_user_id, mask_local_part, mask_domain,
             selected_kind, status)
           VALUES ($1,$2,$3,$4,'omnyid.com','omnyid_mask','active')"#,
    )
    .bind(format!("vsi_{}", Ulid::new().to_string().to_lowercase()))
    .bind(&vendor_id)
    .bind(&user.id)
    .bind(&local_part)
    .execute(&db.pool)
    .await
    .expect("sender identity");
    (vendor_id, format!("{local_part}@omnyid.com"))
}

fn signed_headers(body: &[u8], to: &str, event_id: &str) -> HeaderMap {
    let timestamp = Utc::now().timestamp().to_string();
    let digest = hex::encode(Sha256::digest(body));
    let from = URL_SAFE_NO_PAD.encode("couple@example.test");
    let to = URL_SAFE_NO_PAD.encode(to);
    let nonce = "aabbccddeeff00112233445566778899";
    let size = body.len().to_string();
    let canonical = [
        "omnyid-email-worker-v1",
        "primary-v1",
        &timestamp,
        nonce,
        event_id,
        &from,
        &to,
        &digest,
        &size,
    ]
    .join("\n");
    let mut mac = Hmac::<Sha256>::new_from_slice(SECRET.as_bytes()).expect("hmac key");
    mac.update(canonical.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());
    let mut headers = HeaderMap::new();
    for (name, value) in [
        ("content-type", "message/rfc822".to_string()),
        ("x-omnyid-email-version", "1".to_string()),
        ("x-omnyid-email-key-id", "primary-v1".to_string()),
        ("x-omnyid-email-timestamp", timestamp),
        ("x-omnyid-email-nonce", nonce.to_string()),
        ("x-omnyid-email-event-id", event_id.to_string()),
        ("x-omnyid-email-from", from),
        ("x-omnyid-email-to", to),
        ("x-omnyid-email-body-sha256", digest),
        ("x-omnyid-email-raw-size", size),
        ("x-omnyid-email-signature", signature),
    ] {
        headers.insert(
            axum::http::HeaderName::from_bytes(name.as_bytes()).expect("header name"),
            value.parse().expect("header value"),
        );
    }
    headers
}

async fn post(app: &Router, body: &[u8], headers: HeaderMap) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method("POST")
        .uri("/integrations/vendor-email/cloudflare/inbound")
        .body(Body::from(body.to_vec()))
        .expect("request");
    *request.headers_mut() = headers;
    let response = app.clone().oneshot(request).await.expect("response");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body")
        .to_bytes();
    let body = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| serde_json::json!({"text": String::from_utf8_lossy(&bytes)}));
    (status, body)
}

#[tokio::test]
async fn valid_delivery_is_encrypted_and_exact_retry_is_idempotent() {
    let Some(db_url) = test_db_url() else { return };
    unsafe {
        std::env::set_var("OMNYID_VENDOR_MAIL_INGRESS_ENABLED", "true");
        std::env::set_var("OMNYID_VENDOR_MAIL_ENABLED", "true");
        std::env::set_var("OMNYID_VENDOR_SENDER_MASK_ENABLED", "true");
        std::env::set_var("OMNYID_VENDOR_MAIL_WORKER_KEY_ID", "primary-v1");
        std::env::set_var("OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET", SECRET);
        std::env::set_var("OMNYID_VENDOR_MAIL_INGRESS_ENCRYPTION_KEY", "11".repeat(32));
    }
    let db = Db::new(&db_url).await.expect("database");
    let (_vendor_id, recipient) = seed_route(&db).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let body = b"Subject: Private test\r\nMessage-ID: <worker@example.test>\r\n\r\nSecret body";
    let event_id = hex::encode(Sha256::digest(format!("{}-{}", recipient, Ulid::new())));

    let (status, accepted) = post(&app, body, signed_headers(body, &recipient, &event_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "accepted: {accepted}");
    assert_eq!(accepted["status"], "quarantined");
    let (status, duplicate) = post(&app, body, signed_headers(body, &recipient, &event_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "duplicate: {duplicate}");
    assert_eq!(duplicate["status"], "duplicate");

    let row = sqlx::query(
        "SELECT ciphertext_envelope, processing_status FROM wedding_vendor_email_ingress_quarantine WHERE provider_event_id = $1",
    )
    .bind(&event_id)
    .fetch_one(&db.pool)
    .await
    .expect("quarantine row");
    let ciphertext: Value = row.get("ciphertext_envelope");
    assert_eq!(ciphertext["scheme"], "omnyid-envelope-v1");
    assert!(!ciphertext.to_string().contains("Secret body"));
    assert_eq!(row.get::<String, _>("processing_status"), "awaiting_scan");
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM wedding_vendor_email_ingress_quarantine WHERE provider_event_id = $1",
    )
    .bind(&event_id)
    .fetch_one(&db.pool)
    .await
    .expect("quarantine count");
    assert_eq!(count, 1);

    let changed = b"Subject: Private test\r\n\r\nChanged body";
    let (status, _) = post(
        &app,
        changed,
        signed_headers(changed, &recipient, &event_id),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);

    let unknown_id = hex::encode(Sha256::digest(format!("unknown-{}", Ulid::new())));
    let (status, _) = post(
        &app,
        body,
        signed_headers(body, "unknown_mask@omnyid.com", &unknown_id),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    sqlx::query(
        "UPDATE wedding_vendor_sender_identities SET selected_kind = 'connected_email' WHERE mask_local_part = $1",
    )
    .bind(recipient.trim_end_matches("@omnyid.com"))
    .execute(&db.pool)
    .await
    .expect("change identity kind");
    let connected_id = hex::encode(Sha256::digest(format!("connected-{}", Ulid::new())));
    let (status, _) = post(&app, body, signed_headers(body, &recipient, &connected_id)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    unsafe { std::env::set_var("OMNYID_VENDOR_SENDER_MASK_ENABLED", "false") };
    let disabled_id = hex::encode(Sha256::digest(format!("disabled-{}", Ulid::new())));
    let (status, _) = post(&app, body, signed_headers(body, &recipient, &disabled_id)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    unsafe {
        std::env::remove_var("OMNYID_VENDOR_MAIL_INGRESS_ENABLED");
        std::env::remove_var("OMNYID_VENDOR_MAIL_ENABLED");
        std::env::remove_var("OMNYID_VENDOR_SENDER_MASK_ENABLED");
        std::env::remove_var("OMNYID_VENDOR_MAIL_WORKER_KEY_ID");
        std::env::remove_var("OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET");
        std::env::remove_var("OMNYID_VENDOR_MAIL_INGRESS_ENCRYPTION_KEY");
    }
}
