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
use omnyid_homeserver::agentcard::{AgentCard, sign_agent_card};
use omnyid_homeserver::db::{Db, UserRecord};
use omnyid_homeserver::vendor_email_quarantine_retention::destroy_expired_vendor_email_quarantine;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use tower::ServiceExt;
use ulid::Ulid;
use x25519_dalek::{PublicKey, StaticSecret};

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

async fn seed_route(db: &Db) -> (String, String, String, StaticSecret, String) {
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
    let agent_id = format!("agent:vendor-{suffix}@example.test");
    let encryption_secret = StaticSecret::from([7_u8; 32]);
    let encryption_public = PublicKey::from(&encryption_secret);
    let signing_seed = hex::encode([3_u8; 32]);
    let signing_public = omnyid_homeserver::agentcard::derive_public_key_hex(&signing_seed)
        .expect("signing public key");
    let mut card = AgentCard::new(
        agent_id.clone(),
        format!("test-{suffix}"),
        vec![],
        signing_public,
        "https://example.test".to_string(),
    );
    card.encryption_public_key_hex = Some(hex::encode(encryption_public.as_bytes()));
    card.signature = sign_agent_card(&card, &signing_seed).expect("signed card");
    sqlx::query(
        r#"INSERT INTO managed_agents (id, owner_user_id, agent_id, label, email, kind)
           VALUES ($1,$2,$3,'Worker Test Vendor',$4,'vendor')"#,
    )
    .bind(format!("managed-{suffix}"))
    .bind(&user.id)
    .bind(&agent_id)
    .bind(&user.email)
    .execute(&db.pool)
    .await
    .expect("managed vendor agent");
    sqlx::query(
        r#"INSERT INTO wedding_vendor_agent_links
            (vendor_id, agent_id, agent_card, card_verified_at)
           VALUES ($1,$2,$3,NOW())"#,
    )
    .bind(&vendor_id)
    .bind(&agent_id)
    .bind(serde_json::to_value(&card).expect("card json"))
    .execute(&db.pool)
    .await
    .expect("vendor agent link");
    (
        user.id,
        vendor_id,
        format!("{local_part}@omnyid.com"),
        encryption_secret,
        card.key_id,
    )
}

async fn start_clean_clamd(expected_connections: usize) -> String {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("clamd listener");
    let address = listener.local_addr().expect("clamd address");
    tokio::spawn(async move {
        for _ in 0..expected_connections {
            let (mut stream, _) = listener.accept().await.expect("clamd connection");
            let mut command = [0_u8; 10];
            stream
                .read_exact(&mut command)
                .await
                .expect("clamd command");
            assert_eq!(&command, b"nINSTREAM\n");
            loop {
                let size = stream.read_u32().await.expect("clamd chunk size");
                if size == 0 {
                    break;
                }
                let mut chunk = vec![0_u8; size as usize];
                stream.read_exact(&mut chunk).await.expect("clamd chunk");
            }
            stream
                .write_all(b"stream: OK\n")
                .await
                .expect("clamd response");
        }
    });
    address.to_string()
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
    let clamd = start_clean_clamd(3).await;
    unsafe {
        std::env::set_var("OMNYID_VENDOR_MAIL_INGRESS_ENABLED", "true");
        std::env::set_var("OMNYID_VENDOR_MAIL_ENABLED", "true");
        std::env::set_var("OMNYID_VENDOR_SENDER_MASK_ENABLED", "true");
        std::env::set_var("OMNYID_VENDOR_MAIL_WORKER_KEY_ID", "primary-v1");
        std::env::set_var("OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET", SECRET);
        std::env::set_var("CLAMD_HOST", &clamd);
        std::env::set_var("OMNYID_SIGNING_KEY_HEX", hex::encode([9_u8; 32]));
    }
    let db = Db::new(&db_url).await.expect("database");
    let (owner_user_id, vendor_id, recipient, _recipient_secret, recipient_key_id) =
        seed_route(&db).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let body = b"Subject: Private test\r\nMessage-ID: <worker@example.test>\r\n\r\nSecret body";
    let event_id = hex::encode(Sha256::digest(format!("{}-{}", recipient, Ulid::new())));

    let (status, accepted) = post(&app, body, signed_headers(body, &recipient, &event_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "accepted: {accepted}");
    assert_eq!(accepted["status"], "accepted");
    let afp_message_id = accepted["afp_message_id"]
        .as_str()
        .expect("AFP message id")
        .to_string();
    let (status, duplicate) = post(&app, body, signed_headers(body, &recipient, &event_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "duplicate: {duplicate}");
    assert_eq!(duplicate["status"], "duplicate");

    let row = sqlx::query(
        "SELECT ciphertext_envelope, processing_status, recipient_key_id FROM wedding_vendor_email_ingress_quarantine WHERE provider_event_id = $1",
    )
    .bind(&event_id)
    .fetch_one(&db.pool)
    .await
    .expect("quarantine row");
    let ciphertext: Value = row.get("ciphertext_envelope");
    assert_eq!(ciphertext["scheme"], "omnyid-envelope-v1");
    assert_eq!(ciphertext["mode"], "recipient-x25519-v1");
    assert_eq!(ciphertext["recipient_key_id"], recipient_key_id);
    assert_eq!(row.get::<String, _>("recipient_key_id"), recipient_key_id);
    assert!(!ciphertext.to_string().contains("Secret body"));
    assert_eq!(row.get::<String, _>("processing_status"), "accepted");
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM wedding_vendor_email_ingress_quarantine WHERE provider_event_id = $1",
    )
    .bind(&event_id)
    .fetch_one(&db.pool)
    .await
    .expect("quarantine count");
    assert_eq!(count, 1);
    let provider = sqlx::query(
        "SELECT processing_status, afp_message_id FROM wedding_vendor_email_provider_events WHERE provider = 'cloudflare_email_worker' AND provider_event_id = $1",
    )
    .bind(&event_id)
    .fetch_one(&db.pool)
    .await
    .expect("provider event");
    assert_eq!(provider.get::<String, _>("processing_status"), "completed");
    assert_eq!(
        provider
            .get::<Option<String>, _>("afp_message_id")
            .as_deref(),
        Some(afp_message_id.as_str())
    );
    let private_table = format!("\"user_{}\".messages", owner_user_id.to_ascii_lowercase());
    let private_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {private_table} WHERE id = $1 AND subtype = 'wedding_vendor_email_received'"
    ))
    .bind(&afp_message_id)
    .fetch_one(&db.pool)
    .await
    .expect("private AFP count");
    assert_eq!(
        private_count, 1,
        "exact retry must not append a second AFP event"
    );
    let persisted = sqlx::query(&format!(
        "SELECT content, encryption, metadata FROM {private_table} WHERE id = $1"
    ))
    .bind(&afp_message_id)
    .fetch_one(&db.pool)
    .await
    .expect("private AFP event");
    assert!(
        !persisted
            .get::<Value, _>("content")
            .to_string()
            .contains("Secret body")
    );
    assert!(
        !persisted
            .get::<Value, _>("metadata")
            .to_string()
            .contains("couple@example.test")
    );
    assert_eq!(
        persisted.get::<Value, _>("encryption")["mode"],
        "recipient-x25519-v1"
    );

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
        "UPDATE wedding_vendor_sender_identities SET status = 'disabled' WHERE mask_local_part = $1",
    )
    .bind(recipient.trim_end_matches("@omnyid.com"))
    .execute(&db.pool)
    .await
    .expect("disable identity");
    let disabled_route_id = hex::encode(Sha256::digest(format!("disabled-route-{}", Ulid::new())));
    let (status, _) = post(
        &app,
        body,
        signed_headers(body, &recipient, &disabled_route_id),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    sqlx::query(
        "UPDATE wedding_vendor_sender_identities SET status = 'active' WHERE mask_local_part = $1",
    )
    .bind(recipient.trim_end_matches("@omnyid.com"))
    .execute(&db.pool)
    .await
    .expect("restore identity");

    let transferred_owner = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("transferred-{}@example.test", Ulid::new()),
        password_hash: Some("integration-test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Transferred owner".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&transferred_owner)
        .await
        .expect("transferred owner");
    sqlx::query("UPDATE wedding_vendors SET claimed_by_user_id = $1 WHERE vendor_id = $2")
        .bind(&transferred_owner.id)
        .bind(&vendor_id)
        .execute(&db.pool)
        .await
        .expect("transfer listing");
    let transferred_id = hex::encode(Sha256::digest(format!("transferred-{}", Ulid::new())));
    let (status, _) = post(
        &app,
        body,
        signed_headers(body, &recipient, &transferred_id),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    sqlx::query("UPDATE wedding_vendors SET claimed_by_user_id = $1 WHERE vendor_id = $2")
        .bind(&owner_user_id)
        .bind(&vendor_id)
        .execute(&db.pool)
        .await
        .expect("restore listing owner");

    sqlx::query("UPDATE wedding_vendors SET status = 'archived' WHERE vendor_id = $1")
        .bind(&vendor_id)
        .execute(&db.pool)
        .await
        .expect("archive listing");
    let archived_id = hex::encode(Sha256::digest(format!("archived-{}", Ulid::new())));
    let (status, _) = post(&app, body, signed_headers(body, &recipient, &archived_id)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    sqlx::query("UPDATE wedding_vendors SET status = 'active' WHERE vendor_id = $1")
        .bind(&vendor_id)
        .execute(&db.pool)
        .await
        .expect("restore listing");

    sqlx::query(
        "UPDATE wedding_vendor_sender_identities SET owner_user_id = $1 WHERE mask_local_part = $2",
    )
    .bind(&transferred_owner.id)
    .bind(recipient.trim_end_matches("@omnyid.com"))
    .execute(&db.pool)
    .await
    .expect("cross-tenant identity");
    let cross_tenant_id = hex::encode(Sha256::digest(format!("cross-tenant-{}", Ulid::new())));
    let (status, _) = post(
        &app,
        body,
        signed_headers(body, &recipient, &cross_tenant_id),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    sqlx::query(
        "UPDATE wedding_vendor_sender_identities SET owner_user_id = $1 WHERE mask_local_part = $2",
    )
    .bind(&owner_user_id)
    .bind(recipient.trim_end_matches("@omnyid.com"))
    .execute(&db.pool)
    .await
    .expect("restore identity owner");

    let private_table = format!("\"user_{}\".messages", owner_user_id.to_ascii_lowercase());
    sqlx::query(&format!(
        "ALTER TABLE {private_table} ADD CONSTRAINT wed286_reject_vendor_email CHECK (subtype IS DISTINCT FROM 'wedding_vendor_email_received') NOT VALID"
    ))
    .execute(&db.pool)
    .await
    .expect("install persistence failure fixture");
    let interrupted_id = hex::encode(Sha256::digest(format!("interrupted-{}", Ulid::new())));
    let interrupted =
        b"Subject: Interrupted test\r\nMessage-ID: <interrupted@example.test>\r\n\r\nRetry body";
    let (status, _) = post(
        &app,
        interrupted,
        signed_headers(interrupted, &recipient, &interrupted_id),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    let interrupted_state = sqlx::query(
        "SELECT processing_status, afp_message_id FROM wedding_vendor_email_provider_events WHERE provider = 'cloudflare_email_worker' AND provider_event_id = $1",
    )
    .bind(&interrupted_id)
    .fetch_one(&db.pool)
    .await
    .expect("interrupted provider event");
    assert_eq!(
        interrupted_state.get::<String, _>("processing_status"),
        "accepted"
    );
    assert!(
        interrupted_state
            .get::<Option<String>, _>("afp_message_id")
            .is_none()
    );
    sqlx::query(&format!(
        "ALTER TABLE {private_table} DROP CONSTRAINT wed286_reject_vendor_email"
    ))
    .execute(&db.pool)
    .await
    .expect("remove persistence failure fixture");
    let (status, repaired) = post(
        &app,
        interrupted,
        signed_headers(interrupted, &recipient, &interrupted_id),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "repaired: {repaired}");
    assert_eq!(repaired["status"], "accepted");
    let repaired_afp_id = repaired["afp_message_id"]
        .as_str()
        .expect("repaired AFP id");
    let repaired_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {private_table} WHERE id = $1 AND subtype = 'wedding_vendor_email_received'"
    ))
    .bind(repaired_afp_id)
    .fetch_one(&db.pool)
    .await
    .expect("repaired private AFP count");
    assert_eq!(repaired_count, 1);

    let unavailable = std::net::TcpListener::bind("127.0.0.1:0")
        .expect("reserve unavailable scanner endpoint")
        .local_addr()
        .expect("unavailable scanner address");
    unsafe { std::env::set_var("CLAMD_HOST", unavailable.to_string()) };
    let scanner_failure_id =
        hex::encode(Sha256::digest(format!("scanner-failure-{}", Ulid::new())));
    let (status, _) = post(
        &app,
        body,
        signed_headers(body, &recipient, &scanner_failure_id),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    let scanner_failure_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM wedding_vendor_email_provider_events WHERE provider = 'cloudflare_email_worker' AND provider_event_id = $1",
    )
    .bind(&scanner_failure_id)
    .fetch_one(&db.pool)
    .await
    .expect("scanner failure provider count");
    assert_eq!(
        scanner_failure_count, 0,
        "scanner failure must not claim delivery"
    );
    unsafe { std::env::set_var("CLAMD_HOST", &clamd) };

    sqlx::query(
        "UPDATE wedding_vendor_email_ingress_quarantine SET expires_at = NOW() - INTERVAL '1 minute' WHERE provider_event_id = $1",
    )
    .bind(&event_id)
    .execute(&db.pool)
    .await
    .expect("expire accepted quarantine");
    assert_eq!(
        destroy_expired_vendor_email_quarantine(&db, 25)
            .await
            .expect("retention pass"),
        1
    );
    let expired = sqlx::query(
        "SELECT ciphertext_envelope, processing_status, deleted_at FROM wedding_vendor_email_ingress_quarantine WHERE provider_event_id = $1",
    )
    .bind(&event_id)
    .fetch_one(&db.pool)
    .await
    .expect("expired quarantine tombstone");
    assert_eq!(
        expired.get::<Value, _>("ciphertext_envelope")["scheme"],
        "destroyed"
    );
    assert_eq!(expired.get::<String, _>("processing_status"), "expired");
    assert!(
        expired
            .get::<Option<chrono::DateTime<Utc>>, _>("deleted_at")
            .is_some()
    );

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
        std::env::remove_var("CLAMD_HOST");
        std::env::remove_var("OMNYID_SIGNING_KEY_HEX");
    }
}
