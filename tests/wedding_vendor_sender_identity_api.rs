//! Disposable-Postgres proof for verified vendor sender identity selection.

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
                "sender identity tests require disposable local omnyid_test",
            );
        })
}

async fn seed_user(db: &Db, label: &str) -> (UserRecord, String) {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("{label}-{suffix}@example.test"),
        password_hash: Some("integration-test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: format!("{label} representative"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    db.mark_email_verified(&user.id)
        .await
        .expect("verify email");
    let token = format!("sender_identity_{suffix}");
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: user.id.clone(),
        created_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + Duration::hours(2)).to_rfc3339(),
    })
    .await
    .expect("session");
    (user, format!("Bearer {token}"))
}

async fn seed_verified_vendor(
    db: &Db,
    owner_id: &str,
    slug_suffix: &str,
    location_marker: &str,
) -> String {
    let vendor_id = Ulid::new().to_string();
    sqlx::query(
        r#"INSERT INTO wedding_vendors
            (vendor_id, vendor_slug, vendor_name, category, service_area, status,
             claim_status, claimed_by_user_id, verified_at)
           VALUES ($1,$2,'Bejewelled Jewellery','jewellery',$3,
                   'active','verified',$4,NOW())"#,
    )
    .bind(&vendor_id)
    .bind(format!("bejewelled-{slug_suffix}"))
    .bind(format!("Mosman {location_marker} NSW 2088"))
    .bind(owner_id)
    .execute(&db.pool)
    .await
    .expect("verified vendor");
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

#[tokio::test]
async fn verified_owner_reserves_mask_and_unverified_actor_cannot_select_it() {
    let Some(db_url) = test_db_url() else { return };
    let db = Db::new(&db_url).await.expect("database");
    let suffix = Ulid::new().to_string().to_lowercase();
    let (owner, owner_auth) = seed_user(&db, "owner").await;
    let (_other, other_auth) = seed_user(&db, "other").await;
    let marker = &suffix[suffix.len() - 8..];
    let vendor_id = seed_verified_vendor(&db, &owner.id, &suffix, marker).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;

    let uri = format!("/api/wedding/vendor/sender-identity?vendor_id={vendor_id}");
    let (status, preview) = request(&app, "GET", &uri, &owner_auth, Value::Null).await;
    assert_eq!(status, StatusCode::OK, "preview: {preview}");
    assert_eq!(preview["identity_id"], Value::Null);
    assert_eq!(
        preview["options"][1]["address"],
        format!("bejewelled_jewellery_mosman_{marker}@omnyid.com")
    );
    assert_eq!(preview["relay_delivery_enabled"], false);

    let (status, selected) = request(
        &app,
        "PUT",
        "/api/wedding/vendor/sender-identity",
        &owner_auth,
        json!({"vendor_id": vendor_id, "kind": "omnyid_mask"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "selection: {selected}");
    assert_eq!(selected["selected_kind"], "omnyid_mask");
    assert!(selected["identity_id"].as_str().is_some());

    let row = sqlx::query(
        "SELECT mask_local_part, mask_domain, selected_kind FROM wedding_vendor_sender_identities WHERE vendor_id = $1 AND status = 'active'",
    )
    .bind(&vendor_id)
    .fetch_one(&db.pool)
    .await
    .expect("stored identity");
    assert_eq!(
        row.get::<String, _>("mask_local_part"),
        format!("bejewelled_jewellery_mosman_{marker}")
    );
    assert_eq!(row.get::<String, _>("mask_domain"), "omnyid.com");
    assert_eq!(row.get::<String, _>("selected_kind"), "omnyid_mask");

    let (status, denied) = request(&app, "GET", &uri, &other_auth, Value::Null).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "cross-tenant read: {denied}");

    let (status, unavailable) = request(
        &app,
        "PUT",
        "/api/wedding/vendor/sender-identity",
        &owner_auth,
        json!({"vendor_id": vendor_id, "kind": "connected_email"}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::PRECONDITION_FAILED,
        "mailbox gate: {unavailable}"
    );
}

#[tokio::test]
async fn duplicate_business_and_locality_use_neutral_collision_suffix() {
    let Some(db_url) = test_db_url() else { return };
    let db = Db::new(&db_url).await.expect("database");
    let suffix = Ulid::new().to_string().to_lowercase();
    let (first, first_auth) = seed_user(&db, "first").await;
    let (second, second_auth) = seed_user(&db, "second").await;
    let marker = &suffix[suffix.len() - 8..];
    let first_vendor =
        seed_verified_vendor(&db, &first.id, &format!("first-{suffix}"), marker).await;
    let second_vendor =
        seed_verified_vendor(&db, &second.id, &format!("second-{suffix}"), marker).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;

    for (auth, vendor_id) in [(&first_auth, &first_vendor), (&second_auth, &second_vendor)] {
        let (status, body) = request(
            &app,
            "PUT",
            "/api/wedding/vendor/sender-identity",
            auth,
            json!({"vendor_id": vendor_id, "kind": "omnyid_mask"}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "selection: {body}");
    }
    let masks: Vec<String> = sqlx::query_scalar(
        "SELECT mask_local_part FROM wedding_vendor_sender_identities WHERE vendor_id = ANY($1) ORDER BY mask_local_part",
    )
    .bind(vec![first_vendor, second_vendor])
    .fetch_all(&db.pool)
    .await
    .expect("masks");
    assert_eq!(
        masks,
        vec![
            format!("bejewelled_jewellery_mosman_{marker}"),
            format!("bejewelled_jewellery_mosman_{marker}_harbour"),
        ]
    );
}
