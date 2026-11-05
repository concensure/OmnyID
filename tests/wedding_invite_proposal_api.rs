//! Disposable-Postgres proof for the Invite Proposals approval boundary.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::db::{AuthSessionRecord, Db, UserRecord, WeddingVendorUpsertRecord};
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
                "Invite Proposal tests require disposable local omnyid_test",
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
        display_name: "Proposal tester".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    db.mark_email_verified(&user.id)
        .await
        .expect("verify email");
    let token = format!("invite_proposal_{}", Ulid::new().to_string().to_lowercase());
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

async fn post(app: &Router, auth: &str, body: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/wedding/invite-proposals/approval-preflight")
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
async fn preflight_rechecks_tenant_vendor_and_opt_out_policy() {
    let Some(db_url) = test_db_url() else {
        return;
    };
    let suffix = Ulid::new().to_string().to_lowercase();
    let owner_email = format!("proposal-owner-{suffix}@omnyid.test");
    let prior_enabled = std::env::var_os("OMNYID_WEDDING_INVITE_PROPOSALS_ENABLED");
    let prior_allowlist = std::env::var_os("OMNYID_WEDDING_INVITE_PROPOSALS_ALLOWLIST");
    unsafe {
        std::env::set_var("OMNYID_WEDDING_INVITE_PROPOSALS_ENABLED", "true");
        std::env::set_var("OMNYID_WEDDING_INVITE_PROPOSALS_ALLOWLIST", &owner_email);
    }
    let db = Db::new(&db_url).await.expect("database");
    let (owner_id, owner_auth) = seed_user(&db, owner_email).await;
    let (_other_id, other_auth) =
        seed_user(&db, format!("proposal-other-{suffix}@omnyid.test")).await;
    let plan_id = format!("wedding_plan:{suffix}");
    sqlx::query("INSERT INTO wedding_user_onboarding_state (user_id,wedding_plan_id,intake_variant,entry_source) VALUES ($1,$2,'wedding_site','wedding_site')")
        .bind(&owner_id).bind(&plan_id).execute(&db.pool).await.expect("onboarding state");
    let vendor = db
        .upsert_wedding_vendor(
            None,
            &WeddingVendorUpsertRecord {
                vendor_slug: format!("proposal-venue-{suffix}"),
                vendor_name: "Proposal Test Venue".into(),
                category: "Wedding venue".into(),
                service_area: "Sydney NSW".into(),
                address: None,
                website_url: Some("https://venue.example.test".into()),
                contact_phone: None,
                contact_email: Some(format!("hello-{suffix}@vendor.test")),
                source_url: None,
                source_label: Some("Integration fixture".into()),
                source_checked_at: None,
                status: "active".into(),
                notes: None,
                evidence: json!({"contact_email_verified": true}),
                caveat_labels: vec![],
                photos: vec![],
            },
            &owner_id,
        )
        .await
        .expect("vendor");
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let body = json!({
        "wedding_plan_id": plan_id, "brief_id": format!("brief-{suffix}"), "revision": 1,
        "category": "venues", "location": "Sydney NSW", "vendor_ids": [vendor.vendor_id]
    });
    let (status, approved) = post(&app, &owner_auth, body.clone()).await;
    assert_eq!(status, StatusCode::OK, "approved: {approved}");
    assert_eq!(approved["recipients"][0]["route"], "verified_email");
    // Review/preflight is not an external action and must not spend the four
    // approvals-per-day allowance. A couple can reopen the exact preview.
    for _ in 0..5 {
        let (status, repeated) = post(&app, &owner_auth, body.clone()).await;
        assert_eq!(status, StatusCode::OK, "repeat preview: {repeated}");
    }
    let (status, denied) = post(&app, &other_auth, body.clone()).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "tenant denial: {denied}");
    sqlx::query("UPDATE wedding_vendors SET evidence=jsonb_build_object('proposal_opt_out',true) WHERE vendor_id=$1")
        .bind(&vendor.vendor_id).execute(&db.pool).await.expect("opt out");
    let mut opted_out = body;
    opted_out["brief_id"] = json!(format!("brief-opt-out-{suffix}"));
    let (status, denied) = post(&app, &owner_auth, opted_out).await;
    assert_eq!(
        status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "opt-out denial: {denied}"
    );
    match prior_enabled {
        Some(value) => unsafe {
            std::env::set_var("OMNYID_WEDDING_INVITE_PROPOSALS_ENABLED", value)
        },
        None => unsafe { std::env::remove_var("OMNYID_WEDDING_INVITE_PROPOSALS_ENABLED") },
    }
    match prior_allowlist {
        Some(value) => unsafe {
            std::env::set_var("OMNYID_WEDDING_INVITE_PROPOSALS_ALLOWLIST", value)
        },
        None => unsafe { std::env::remove_var("OMNYID_WEDDING_INVITE_PROPOSALS_ALLOWLIST") },
    }
}
