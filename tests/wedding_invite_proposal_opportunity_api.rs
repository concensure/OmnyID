//! Disposable-Postgres proof for category proposal opportunities and secure referral links.

use axum::{
    Router,
    body::Body,
    http::{HeaderMap, Request, StatusCode, header::AUTHORIZATION},
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
                "proposal-opportunity tests require disposable local omnyid_test",
            );
        })
}

fn tenant_schema_name(user_id: &str) -> String {
    let suffix: String = user_id
        .chars()
        .flat_map(|character| character.to_lowercase())
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .take(55)
        .collect();
    format!("user_{suffix}")
}

async fn seed_user(db: &Db, email: String) -> (String, String) {
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email,
        password_hash: Some("integration-test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Proposal opportunity tester".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    db.mark_email_verified(&user.id)
        .await
        .expect("verify email");
    let token = format!(
        "proposal_opportunity_{}",
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
    auth: Option<&str>,
    body: Value,
) -> (StatusCode, HeaderMap, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json");
    if let Some(auth) = auth {
        builder = builder.header(AUTHORIZATION, auth);
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
    let value = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| json!({"text": String::from_utf8_lossy(&bytes)}));
    (status, headers, value)
}

#[tokio::test]
async fn opportunity_is_tenant_scoped_deduplicated_and_revocable() {
    let Some(db_url) = test_db_url() else { return };
    let suffix = Ulid::new().to_string().to_lowercase();
    let owner_email = format!("opportunity-owner-{suffix}@omnyid.test");
    let operator_email = format!("opportunity-operator-{suffix}@omnyid.test");
    let prior_enabled = std::env::var_os("OMNYID_WEDDING_INVITE_PROPOSALS_ENABLED");
    let prior_allowlist = std::env::var_os("OMNYID_WEDDING_INVITE_PROPOSALS_ALLOWLIST");
    let prior_admins = std::env::var_os("OMNYID_ADMIN_EMAILS");
    unsafe {
        std::env::set_var("OMNYID_WEDDING_INVITE_PROPOSALS_ENABLED", "true");
        std::env::set_var("OMNYID_WEDDING_INVITE_PROPOSALS_ALLOWLIST", &owner_email);
        std::env::set_var("OMNYID_ADMIN_EMAILS", &operator_email);
    }
    let db = Db::new(&db_url).await.expect("database");
    let (owner_id, owner_auth) = seed_user(&db, owner_email).await;
    let (vendor_user_id, other_auth) =
        seed_user(&db, format!("opportunity-other-{suffix}@omnyid.test")).await;
    let (_operator_id, operator_auth) = seed_user(&db, operator_email).await;
    let plan_id = format!("wedding_plan:{suffix}");
    let workspace_id = format!("wedding_response_workspace:{suffix}");
    let category_label = format!("Wedding photographers {suffix}");
    let location_label = format!("Synthetic-{suffix} NSW");
    sqlx::query("INSERT INTO wedding_user_onboarding_state (user_id,wedding_plan_id,intake_variant,entry_source) VALUES ($1,$2,'wedding_site','wedding_site')")
        .bind(&owner_id).bind(&plan_id).execute(&db.pool).await.expect("onboarding state");
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let vendor_id = format!("proposal-vendor-{suffix}");
    let vendor_slug = format!("synthetic-photo-{suffix}");
    sqlx::query("INSERT INTO wedding_vendors (vendor_id,vendor_slug,vendor_name,category,service_area,status,claim_status,claimed_by_user_id,verified_at) VALUES ($1,$2,'Synthetic Photo Co','Photographer',$3,'active','verified',$4,NOW())")
        .bind(&vendor_id).bind(&vendor_slug).bind(&location_label).bind(&vendor_user_id).execute(&db.pool).await.expect("vendor listing");

    let (status, _, published) = request(
        &app,
        "POST",
        "/wedding/invite-proposals/opportunities",
        Some(&owner_auth),
        json!({
            "wedding_plan_id":plan_id,"response_workspace_id":workspace_id,
            "brief_id":format!("brief-{suffix}"),"category":category_label.clone(),
            "location":location_label.clone(),"brief_text":"Documentary coverage through speeches",
            "shared_context":{"date_or_season":"2027-11-20","guest_count":90,"phone":"must-not-leak"}
        }),
    ).await;
    assert_eq!(status, StatusCode::OK, "publish: {published}");
    let opportunity_id = published["opportunity_id"]
        .as_str()
        .expect("opportunity id");

    let (status, _, denied) = request(
        &app,
        "POST",
        &format!("/wedding/invite-proposals/opportunities/{opportunity_id}/close"),
        Some(&other_auth),
        json!({}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "cross-tenant close: {denied}"
    );

    let (status, _, link) = request(
        &app,
        "POST",
        &format!("/wedding/invite-proposals/opportunities/{opportunity_id}/share-link"),
        Some(&owner_auth),
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "share link: {link}");
    let url = link["url"].as_str().expect("share URL");
    let token = url.split("proposal=").nth(1).expect("capability token");
    let stored: String = sqlx::query_scalar(
        "SELECT token_digest FROM wedding_invite_proposal_share_grants WHERE opportunity_id=$1",
    )
    .bind(opportunity_id)
    .fetch_one(&db.pool)
    .await
    .expect("token digest");
    assert_ne!(
        stored, token,
        "the plaintext capability must never be stored"
    );
    assert_eq!(stored.len(), 64);

    let public_uri = format!("/api/public/wedding/proposal-opportunities/{token}");
    let (status, headers, public) = request(&app, "GET", &public_uri, None, json!({})).await;
    assert_eq!(status, StatusCode::OK, "public brief: {public}");
    assert_eq!(
        headers
            .get("x-robots-tag")
            .and_then(|value| value.to_str().ok()),
        Some("noindex, nofollow, noarchive")
    );
    assert!(public["shared_context"].get("phone").is_none());

    let response = json!({
        "business_name":"Synthetic Photo Co","business_email":"hello@synthetic.test",
        "message":"Eight hours of documentary coverage with a second photographer.",
        "amount":6200,"currency":"AUD","valid_until":"2027-02-01"
    });
    let (status, _, first) = request(&app, "POST", &public_uri, None, response.clone()).await;
    assert_eq!(status, StatusCode::OK, "first response: {first}");
    assert_eq!(first["replayed"], false);
    let (status, _, replay) = request(&app, "POST", &public_uri, None, response).await;
    assert_eq!(status, StatusCode::OK, "replay: {replay}");
    assert_eq!(replay["replayed"], true);
    let response_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM wedding_invite_proposal_responses WHERE opportunity_id=$1",
    )
    .bind(opportunity_id)
    .fetch_one(&db.pool)
    .await
    .expect("response count");
    assert_eq!(response_count, 1);
    let tenant_table = format!("\"{}\".messages", tenant_schema_name(&owner_id));
    let artifact_count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {tenant_table} WHERE subtype='wedding_artifact' AND kind='wedding_vendor_proposal_response'"))
        .fetch_one(&db.pool).await.expect("private artifact count");
    assert_eq!(artifact_count, 1);

    let (status, _, feed_link) = request(
        &app,
        "POST",
        "/wedding/vendor/proposal-lead-link",
        Some(&other_auth),
        json!({"vendor_slug":vendor_slug}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "claimed vendor lead link: {feed_link}"
    );
    let feed_token = feed_link["url"]
        .as_str()
        .expect("feed URL")
        .split("proposal_feed=")
        .nth(1)
        .expect("feed token");
    let stored_feed_digest: String = sqlx::query_scalar(
        "SELECT token_digest FROM wedding_invite_proposal_vendor_feed_grants WHERE vendor_id=$1 AND revoked_at IS NULL",
    ).bind(&vendor_id).fetch_one(&db.pool).await.expect("feed digest");
    assert_ne!(stored_feed_digest, feed_token);
    let feed_uri = format!("/api/public/wedding/proposal-leads/{feed_token}");
    let (status, headers, feed) = request(&app, "GET", &feed_uri, None, json!({})).await;
    assert_eq!(status, StatusCode::OK, "vendor lead feed: {feed}");
    assert_eq!(
        headers
            .get("x-robots-tag")
            .and_then(|value| value.to_str().ok()),
        Some("noindex, nofollow, noarchive")
    );
    assert_eq!(feed["vendor_name"], "Synthetic Photo Co");
    assert!(feed["opportunities"].as_array().is_some_and(|rows| {
        rows.iter()
            .any(|row| row["opportunity_id"] == opportunity_id)
    }));
    let (status, _, vendor_reply) = request(
        &app,
        "POST",
        &format!("{feed_uri}/{opportunity_id}/responses"),
        None,
        json!({
            "response_kind":"available_date","available_date":"2027-11-20",
            "message":"We can offer this date, subject to a couple-specific confirmation."
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "vendor feed reply: {vendor_reply}");
    let stored_kind: (String, Option<chrono::NaiveDate>) = sqlx::query_as(
        "SELECT response_kind,available_date FROM wedding_invite_proposal_responses WHERE opportunity_id=$1 AND channel='vendor_feed'",
    ).bind(opportunity_id).fetch_one(&db.pool).await.expect("vendor feed response");
    assert_eq!(stored_kind.0, "available_date");
    assert_eq!(
        stored_kind.1.map(|date| date.to_string()).as_deref(),
        Some("2027-11-20")
    );

    let (status, _, metrics) = request(
        &app,
        "GET",
        "/admin/wedding/proposal-opportunities",
        Some(&operator_auth),
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "admin metrics: {metrics}");
    assert!(metrics["categories"].as_array().is_some_and(|rows| {
        rows.iter()
            .any(|row| row["category"] == category_label && row["replies"] == 2)
    }));
    assert!(
        metrics["opportunities"]
            .as_array()
            .is_some_and(|rows| rows.iter().any(|row| {
                row["couple_email"]
                    .as_str()
                    .is_some_and(|email| email.starts_with("opportunity-owner-"))
                    && row["shared_context"]["guest_count"] == 90
            }))
    );
    assert!(
        metrics["vendors"]
            .as_array()
            .is_some_and(|rows| rows.iter().any(|row| row["vendor_slug"] == vendor_slug))
    );

    let (status, _, operator_link) = request(
        &app,
        "POST",
        "/admin/wedding/proposal-lead-link",
        Some(&operator_auth),
        json!({"vendor_slug":vendor_slug}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "operator vendor link: {operator_link}"
    );
    let (status, _, _) = request(&app, "GET", &feed_uri, None, json!({})).await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "rotating a feed link must revoke the prior bearer token"
    );

    let (status, _, closed) = request(
        &app,
        "POST",
        &format!("/wedding/invite-proposals/opportunities/{opportunity_id}/close"),
        Some(&owner_auth),
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "close: {closed}");
    let lifecycle_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {tenant_table} WHERE kind='wedding_vendor_proposal_opportunity' AND content->>'opportunity_id'=$1"
    ))
    .bind(opportunity_id)
    .fetch_one(&db.pool)
    .await
    .expect("private opportunity lifecycle");
    assert_eq!(
        lifecycle_count, 2,
        "publish and close must both enter private AFP"
    );
    let closed_lifecycle_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {tenant_table} WHERE kind='wedding_vendor_proposal_opportunity' AND content->>'opportunity_id'=$1 AND content->>'status'='closed'"
    ))
    .bind(opportunity_id)
    .fetch_one(&db.pool)
    .await
    .expect("private opportunity closure");
    assert_eq!(closed_lifecycle_count, 1);
    let (status, _, _) = request(&app, "GET", &public_uri, None, json!({})).await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "revoked link must stop working"
    );

    for (key, value) in [
        ("OMNYID_WEDDING_INVITE_PROPOSALS_ENABLED", prior_enabled),
        ("OMNYID_WEDDING_INVITE_PROPOSALS_ALLOWLIST", prior_allowlist),
        ("OMNYID_ADMIN_EMAILS", prior_admins),
    ] {
        match value {
            Some(value) => unsafe { std::env::set_var(key, value) },
            None => unsafe { std::env::remove_var(key) },
        }
    }
}
