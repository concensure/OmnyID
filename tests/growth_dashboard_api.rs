//! Disposable-Postgres access and response proof for the false-default Growth dashboard API.

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
                "Growth API tests require disposable local omnyid_test"
            );
        })
}

async fn seed_user(db: &Db, email: String) -> (String, String) {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email,
        password_hash: Some("integration-test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Growth API tester".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("growth_{suffix}");
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

async fn request(app: &Router, uri: &str, auth: Option<&str>) -> (StatusCode, Value) {
    let mut builder = Request::builder().method("GET").uri(uri);
    if let Some(auth) = auth {
        builder = builder.header(AUTHORIZATION, auth);
    }
    let response = app
        .clone()
        .oneshot(builder.body(Body::empty()).expect("request"))
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
        .unwrap_or_else(|_| json!({"text":String::from_utf8_lossy(&bytes)}));
    (status, value)
}

async fn post_request(app: &Router, uri: &str, auth: &str, body: Value) -> (StatusCode, Value) {
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
    let bytes = response.into_body().collect().await.expect("body").to_bytes();
    let value = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| json!({"text":String::from_utf8_lossy(&bytes)}));
    (status, value)
}

#[tokio::test]
async fn growth_routes_are_false_default_operator_only_and_definition_labelled() {
    let Some(db_url) = test_db_url() else {
        return;
    };
    let prior_enabled = std::env::var_os("OMNYID_GROWTH_ANALYTICS_ENABLED");
    let prior_admins = std::env::var_os("OMNYID_ADMIN_EMAILS");
    let suffix = Ulid::new().to_string().to_lowercase();
    let operator_email = format!("growth-operator-{suffix}@omnyid.test");
    unsafe {
        std::env::set_var("OMNYID_GROWTH_ANALYTICS_ENABLED", "true");
        std::env::set_var("OMNYID_ADMIN_EMAILS", &operator_email);
    }
    let db = Db::new(&db_url).await.expect("database");
    let (operator_id, operator_auth) = seed_user(&db, operator_email).await;
    let (ordinary_id, ordinary_auth) =
        seed_user(&db, format!("growth-ordinary-{suffix}@omnyid.test")).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;

    let (anonymous_status, _) = request(&app, "/admin/growth/overview", None).await;
    assert_eq!(anonymous_status, StatusCode::UNAUTHORIZED);
    let (ordinary_status, _) =
        request(&app, "/admin/growth/overview", Some(&ordinary_auth)).await;
    assert_eq!(ordinary_status, StatusCode::FORBIDDEN);
    let (operator_status, overview) = request(
        &app,
        "/admin/growth/overview?from=2026-10-01&through=2026-10-30",
        Some(&operator_auth),
    )
    .await;
    assert_eq!(operator_status, StatusCode::OK, "{overview}");
    assert_eq!(overview["meta"]["definition_version"], "growth-kpi-v1");
    assert_eq!(overview["meta"]["timezone"], "Australia/Sydney");
    assert!(overview["comparison"]["current"]["signup_rate"]["state"].is_string());
    assert!(overview.get("funnel").is_some());

    let (target_status, target) = post_request(
        &app,
        "/admin/growth/benchmarks",
        &operator_auth,
        json!({
            "kpi_key":"signup_rate","target_value":2500,"effective_from":"2026-10-01",
            "rationale":"Reviewed internal acquisition target."
        }),
    )
    .await;
    assert_eq!(target_status, StatusCode::OK, "{target}");
    assert_eq!(target["revision"]["unit"], "basis_points");
    assert_eq!(target["revision"]["direction"], "higher_is_better");
    let first_revision_id = target["revision"]["id"]
        .as_str()
        .expect("first target id")
        .to_owned();
    let (revised_status, revised) = post_request(
        &app,
        "/admin/growth/benchmarks",
        &operator_auth,
        json!({
            "kpi_key":"signup_rate","target_value":2750,"effective_from":"2026-10-15",
            "rationale":"Reviewed target after the first acquisition cycle."
        }),
    )
    .await;
    assert_eq!(revised_status, StatusCode::OK, "{revised}");
    assert_eq!(
        revised["revision"]["supersedes_id"],
        Value::String(first_revision_id)
    );
    let (targets_status, targets) = request(
        &app,
        "/admin/growth/benchmarks?from=2026-10-01&through=2026-10-30",
        Some(&operator_auth),
    )
    .await;
    assert_eq!(targets_status, StatusCode::OK, "{targets}");
    assert_eq!(targets["items"].as_array().map(Vec::len), Some(2));
    let (export_status, _) = request(
        &app,
        "/admin/growth/export.csv?from=2026-10-01&through=2026-10-30",
        Some(&operator_auth),
    )
    .await;
    assert_eq!(export_status, StatusCode::OK);
    let export_audits: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM growth_admin_audit WHERE operator_user_id=$1 AND action='export'",
    )
    .bind(&operator_id)
    .fetch_one(&db.pool)
    .await
    .expect("export audit");
    assert_eq!(export_audits, 1);

    let (bounded_status, _) = request(
        &app,
        "/admin/growth/campaigns?from=2025-01-01&through=2026-02-01",
        Some(&operator_auth),
    )
    .await;
    assert_eq!(bounded_status, StatusCode::BAD_REQUEST);

    unsafe { std::env::set_var("OMNYID_GROWTH_ANALYTICS_ENABLED", "false") };
    let (disabled_status, _) =
        request(&app, "/admin/growth/overview", Some(&operator_auth)).await;
    assert_eq!(disabled_status, StatusCode::NOT_FOUND);

    sqlx::query("DELETE FROM growth_admin_audit WHERE operator_user_id=$1")
        .bind(&operator_id)
        .execute(&db.pool)
        .await
        .expect("cleanup Growth audit");
    sqlx::query("DELETE FROM growth_benchmark_revisions WHERE created_by_user_id=$1")
        .bind(&operator_id)
        .execute(&db.pool)
        .await
        .expect("cleanup targets");
    sqlx::query("DELETE FROM users WHERE id IN ($1,$2)")
        .bind(&operator_id)
        .bind(&ordinary_id)
        .execute(&db.pool)
        .await
        .expect("cleanup users");
    match prior_enabled {
        Some(value) => unsafe { std::env::set_var("OMNYID_GROWTH_ANALYTICS_ENABLED", value) },
        None => unsafe { std::env::remove_var("OMNYID_GROWTH_ANALYTICS_ENABLED") },
    }
    match prior_admins {
        Some(value) => unsafe { std::env::set_var("OMNYID_ADMIN_EMAILS", value) },
        None => unsafe { std::env::remove_var("OMNYID_ADMIN_EMAILS") },
    }
}
