//! Disposable-Postgres proof for bounded, vendor-scoped celebrant link batches.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
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
                "Celebrant management tests require disposable local omnyid_test",
            )
        })
}

async fn seed_user(db: &Db, email: String) -> (String, String) {
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email,
        password_hash: Some("integration-test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Celebrant link operator".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("celebrant_management_{}", Ulid::new());
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

async fn post(app: &Router, auth: &str, uri: &str, body: Value) -> (StatusCode, Value) {
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
    let value = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| json!({"text": String::from_utf8_lossy(&bytes)}));
    (status, value)
}

#[tokio::test]
async fn concurrent_batches_create_one_once_only_link_and_preserve_it() {
    let Some(db_url) = test_db_url() else {
        return;
    };
    let previous_admins = std::env::var_os("OMNYID_ADMIN_EMAILS");
    let previous_pepper = std::env::var_os("OMNYID_WEDDING_VENDOR_SPECIALS_CAPABILITY_PEPPER");
    let suffix = Ulid::new().to_string().to_lowercase();
    let operator_email = format!("celebrant-operator-{suffix}@omnyid.test");
    unsafe {
        std::env::set_var("OMNYID_ADMIN_EMAILS", &operator_email);
        std::env::set_var(
            "OMNYID_WEDDING_VENDOR_SPECIALS_CAPABILITY_PEPPER",
            URL_SAFE_NO_PAD.encode([37_u8; 32]),
        );
    }
    let db = Db::new(&db_url).await.expect("database");
    let (_, operator_auth) = seed_user(&db, operator_email).await;
    let (_, ordinary_auth) =
        seed_user(&db, format!("celebrant-ordinary-{suffix}@omnyid.test")).await;
    let vendor_id = format!("celebrant-batch-{suffix}");
    sqlx::query("INSERT INTO wedding_vendors (vendor_id,vendor_slug,vendor_name,category,service_area,status) VALUES ($1,$1,'Batch Test Celebrant','Celebrant','Sydney','active')")
        .bind(&vendor_id)
        .execute(&db.pool)
        .await
        .expect("seed celebrant");
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let body = json!({"vendor_ids":[vendor_id],"expires_in_days":14});

    let batch_uri = "/admin/wedding/celebrant-management/links/batch";
    let (ordinary_status, _) = post(&app, &ordinary_auth, batch_uri, body.clone()).await;
    assert_eq!(ordinary_status, StatusCode::FORBIDDEN);

    let (left, right) = tokio::join!(
        post(&app, &operator_auth, batch_uri, body.clone()),
        post(&app, &operator_auth, batch_uri, body.clone())
    );
    assert_eq!(left.0, StatusCode::OK, "left: {}", left.1);
    assert_eq!(right.0, StatusCode::OK, "right: {}", right.1);
    let created =
        left.1["created"].as_array().unwrap().len() + right.1["created"].as_array().unwrap().len();
    let skipped =
        left.1["skipped"].as_array().unwrap().len() + right.1["skipped"].as_array().unwrap().len();
    assert_eq!(created, 1);
    assert_eq!(skipped, 1);
    let active: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM wedding_celebrant_management_grants WHERE vendor_id=$1 AND status IN ('active','exchanged')")
        .bind(&vendor_id)
        .fetch_one(&db.pool)
        .await
        .expect("active grants");
    assert_eq!(active, 1);
    let persisted_plaintext: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM wedding_celebrant_management_events WHERE vendor_id=$1 AND metadata::text LIKE '%celebrant_management=%'")
        .bind(&vendor_id)
        .fetch_one(&db.pool)
        .await
        .expect("plaintext audit");
    assert_eq!(persisted_plaintext, 0);

    let (opt_out_status, opt_out) = post(
        &app,
        &operator_auth,
        "/admin/wedding/celebrant-management/outreach",
        json!({
            "vendor_id":vendor_id,
            "channel":"email",
            "status":"opted_out",
            "sent_at":null,
            "follow_up_due_at":null
        }),
    )
    .await;
    assert_eq!(opt_out_status, StatusCode::OK, "opt out: {opt_out}");
    assert_eq!(opt_out["revoked_links"], 1);
    let (blocked_status, blocked) = post(&app, &operator_auth, batch_uri, body).await;
    assert_eq!(blocked_status, StatusCode::OK, "blocked batch: {blocked}");
    assert_eq!(blocked["created"].as_array().unwrap().len(), 0);
    assert_eq!(blocked["skipped"].as_array().unwrap().len(), 1);
    assert!(
        blocked["skipped"][0]["reason"]
            .as_str()
            .unwrap_or_default()
            .contains("opted out")
    );

    unsafe {
        match previous_admins {
            Some(value) => std::env::set_var("OMNYID_ADMIN_EMAILS", value),
            None => std::env::remove_var("OMNYID_ADMIN_EMAILS"),
        }
        match previous_pepper {
            Some(value) => {
                std::env::set_var("OMNYID_WEDDING_VENDOR_SPECIALS_CAPABILITY_PEPPER", value)
            }
            None => std::env::remove_var("OMNYID_WEDDING_VENDOR_SPECIALS_CAPABILITY_PEPPER"),
        }
    }
}
