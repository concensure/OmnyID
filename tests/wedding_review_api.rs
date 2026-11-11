//! Disposable-Postgres proof for review idempotency and partner uniqueness.

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header::AUTHORIZATION},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::{
    afp::Message as ProtoMessage,
    db::{AuthSessionRecord, Db, UserRecord, WeddingVendorUpsertRecord},
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
                "Wedding review tests require disposable local omnyid_test",
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
        display_name: "Review tester".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    db.mark_email_verified(&user.id)
        .await
        .expect("verify email");
    let token = format!("wedding_review_{}", Ulid::new().to_string().to_lowercase());
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

async fn post(app: &Router, auth: &str, body: &Value) -> (StatusCode, Value) {
    request_json(
        app,
        Method::POST,
        "/wedding/reviews/revisions",
        auth,
        Some(body),
    )
    .await
}

async fn request_json(
    app: &Router,
    method: Method,
    uri: &str,
    auth: &str,
    body: Option<&Value>,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(uri)
                .header(AUTHORIZATION, auth)
                .header("content-type", "application/json")
                .body(Body::from(body.map(Value::to_string).unwrap_or_default()))
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

async fn append_proof_fixture(db: &Db, owner_user_id: &str, suffix: &str) -> String {
    let attachment_id = Ulid::new().to_string();
    let message_id = Ulid::new().to_string();
    let thread_id = Ulid::new().to_string();
    let storage_key = format!("users/{owner_user_id}/attachments/{attachment_id}/proof.txt");
    let upload_root = std::env::var("OMNYID_UPLOAD_DIR").expect("upload root");
    let file_path = std::path::Path::new(&upload_root).join(&storage_key);
    std::fs::create_dir_all(file_path.parent().expect("proof parent")).expect("proof directory");
    std::fs::write(&file_path, b"Synthetic completed-event proof").expect("proof bytes");
    let attachment = json!({
        "id":attachment_id,
        "name":"proof.txt",
        "mime_type":"text/plain",
        "size_bytes":31,
        "storage":{"backend":"filesystem","key":storage_key},
        "encryption":{"scheme":"none"},
        "sha256":"44d62c4d24c08bf15d13cff803482b91e9d619ef6d9821064610a4ddcc396f99"
    });
    let content = json!({"schema_version":1,"fixture":suffix});
    let message = ProtoMessage {
        protocol: "afp-v1".into(),
        id: message_id,
        thread_id,
        parent_id: String::new(),
        from: format!("user://{owner_user_id}"),
        to: vec!["agent://wedding-planning".into()],
        timestamp: Utc::now().to_rfc3339(),
        r#type: "file_ledger".into(),
        kind: Some("file_upload".into()),
        supertags: vec!["source:attachment".into(), "wedding_review_evidence".into()],
        content: content.to_string(),
        signature: String::new(),
        encryption: "{}".into(),
        views: "[]".into(),
        references: "[]".into(),
        attachments: json!([attachment]).to_string(),
        store_in_relational: true,
        subtype: "file_ledger:create".into(),
        metadata: json!({"store":true,"upload_source":"wedding_review_evidence"}).to_string(),
    };
    assert!(
        db.store_private_message(owner_user_id, &message, content)
            .await
            .expect("store proof")
    );
    attachment_id
}

fn review_body(plan_id: &str, workspace_id: &str, vendor_id: &str, key: &str) -> Value {
    json!({
        "wedding_plan_id": plan_id,
        "response_workspace_id": workspace_id,
        "subject_kind": "vendor",
        "vendor_id": vendor_id,
        "audience": "public_review",
        "experience_kind": "wedding_held",
        "experience_status": "completed",
        "rating": 5,
        "event_month": "2026-11-01",
        "display_mode": "omnyid_couple",
        "title": "Clear communication",
        "body": "The venue team explained the wet-weather plan clearly.",
        "context_tags": ["wet-weather"],
        "expected_revision": 0,
        "idempotency_key": key,
        "action": "submit"
    })
}

#[tokio::test]
async fn concurrent_retry_and_partner_submission_converge_without_duplicate_rating() {
    let Some(db_url) = test_db_url() else { return };
    let suffix = Ulid::new().to_string().to_lowercase();
    let prior_enabled = std::env::var_os("OMNYID_WEDDING_REVIEWS_ENABLED");
    let prior_admins = std::env::var_os("OMNYID_ADMIN_EMAILS");
    let prior_upload_dir = std::env::var_os("OMNYID_UPLOAD_DIR");
    let upload_dir = std::env::temp_dir().join(format!("omnyid-review-{suffix}"));
    let operator_email = format!("review-operator-{suffix}@omnyid.test");
    unsafe { std::env::set_var("OMNYID_WEDDING_REVIEWS_ENABLED", "true") };
    unsafe { std::env::set_var("OMNYID_ADMIN_EMAILS", &operator_email) };
    unsafe { std::env::set_var("OMNYID_UPLOAD_DIR", &upload_dir) };

    let db = Db::new(&db_url).await.expect("database");
    let (first_id, first_auth) = seed_user(&db, format!("review-first-{suffix}@omnyid.test")).await;
    let (partner_id, partner_auth) =
        seed_user(&db, format!("review-partner-{suffix}@omnyid.test")).await;
    let (_, operator_auth) = seed_user(&db, operator_email).await;
    let plan_id = format!("wedding-plan-{suffix}");
    let workspace_id = format!("wedding-workspace-{suffix}");
    for user_id in [&first_id, &partner_id] {
        sqlx::query("INSERT INTO wedding_user_onboarding_state (user_id,wedding_plan_id,intake_variant,entry_source) VALUES ($1,$2,'wedding_site','wedding_site')")
            .bind(user_id).bind(&plan_id).execute(&db.pool).await.expect("onboarding state");
    }
    let vendor = db
        .upsert_wedding_vendor(
            None,
            &WeddingVendorUpsertRecord {
                vendor_slug: format!("review-venue-{suffix}"),
                vendor_name: "Review Test Venue".into(),
                category: "Venue".into(),
                service_area: "Sydney NSW".into(),
                address: None,
                website_url: Some("https://venue.example.test".into()),
                contact_phone: None,
                contact_email: None,
                source_url: Some("https://directory.example.test/venue".into()),
                source_label: Some("Integration fixture".into()),
                source_checked_at: None,
                status: "active".into(),
                notes: None,
                evidence: json!({}),
                caveat_labels: vec![],
                photos: vec![],
            },
            &first_id,
        )
        .await
        .expect("vendor");
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;

    let retry = review_body(
        &plan_id,
        &workspace_id,
        &vendor.vendor_id,
        &format!("same-retry-{suffix}"),
    );
    let (first, second) = tokio::join!(
        post(&app, &first_auth, &retry),
        post(&app, &first_auth, &retry),
    );
    assert_eq!(first.0, StatusCode::OK, "first retry response: {}", first.1);
    assert_eq!(
        second.0,
        StatusCode::OK,
        "second retry response: {}",
        second.1
    );
    assert_ne!(first.1["replayed"], second.1["replayed"]);
    assert_eq!(first.1["review_id"], second.1["review_id"]);

    let partner = review_body(
        &plan_id,
        &workspace_id,
        &vendor.vendor_id,
        &format!("partner-{suffix}"),
    );
    let (status, body) = post(&app, &partner_auth, &partner).await;
    assert_eq!(status, StatusCode::CONFLICT, "partner response: {body}");

    let review_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM wedding_reviews WHERE wedding_plan_id=$1 AND response_workspace_id=$2 AND vendor_id=$3")
        .bind(&plan_id).bind(&workspace_id).bind(&vendor.vendor_id).fetch_one(&db.pool).await.expect("review count");
    let revision_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM wedding_review_revisions rr JOIN wedding_reviews r ON r.review_id=rr.review_id WHERE r.wedding_plan_id=$1 AND r.response_workspace_id=$2 AND r.vendor_id=$3")
        .bind(&plan_id).bind(&workspace_id).bind(&vendor.vendor_id).fetch_one(&db.pool).await.expect("revision count");
    assert_eq!(review_count, 1);
    assert_eq!(revision_count, 1);

    let review_id = first.1["review_id"].as_str().expect("review id");
    let attachment_id = append_proof_fixture(&db, &first_id, &suffix).await;
    let (link_status, linked) = request_json(
        &app,
        Method::POST,
        &format!("/wedding/reviews/{review_id}/evidence"),
        &first_auth,
        Some(&json!({"revision":1,"attachment_id":attachment_id.clone(),"evidence_kind":"post_event_correspondence"})),
    )
    .await;
    assert_eq!(link_status, StatusCode::OK, "link evidence: {linked}");
    let evidence_ref_id = linked["evidence_ref_id"].as_str().expect("evidence ref");
    let (access_status, access) = request_json(
        &app,
        Method::GET,
        &format!("/admin/wedding/reviews/{review_id}/evidence?purpose=eligibility"),
        &operator_auth,
        None,
    )
    .await;
    assert_eq!(access_status, StatusCode::OK, "operator access: {access}");
    assert_eq!(access["items"].as_array().map(Vec::len), Some(1));
    assert!(
        access["items"][0]["access_url"]
            .as_str()
            .is_some_and(|value| value.starts_with("/attachments/"))
    );
    let access_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM wedding_review_evidence_access_log WHERE review_id=$1 AND purpose_code='eligibility'")
        .bind(review_id).fetch_one(&db.pool).await.expect("access count");
    assert_eq!(access_count, 1);
    let (schedule_status, scheduled) = request_json(
        &app,
        Method::POST,
        &format!("/admin/wedding/reviews/evidence/{evidence_ref_id}/schedule-purge"),
        &operator_auth,
        Some(&json!({"reason_code":"retention_expired"})),
    )
    .await;
    assert_eq!(
        schedule_status,
        StatusCode::OK,
        "schedule purge: {scheduled}"
    );
    let (purge_status, purged) = request_json(
        &app,
        Method::POST,
        "/admin/wedding/reviews/evidence/purge-due",
        &operator_auth,
        None,
    )
    .await;
    assert_eq!(purge_status, StatusCode::OK, "purge due: {purged}");
    assert_eq!(purged["purged"], 1);
    let evidence_status: String = sqlx::query_scalar(
        "SELECT status FROM wedding_review_evidence_refs WHERE evidence_ref_id=$1",
    )
    .bind(evidence_ref_id)
    .fetch_one(&db.pool)
    .await
    .expect("evidence status");
    assert_eq!(evidence_status, "purged");
    assert!(
        db.private_attachment_by_id(&first_id, &attachment_id)
            .await
            .expect("attachment lookup")
            .is_none()
    );

    match prior_enabled {
        Some(value) => unsafe { std::env::set_var("OMNYID_WEDDING_REVIEWS_ENABLED", value) },
        None => unsafe { std::env::remove_var("OMNYID_WEDDING_REVIEWS_ENABLED") },
    }
    match prior_admins {
        Some(value) => unsafe { std::env::set_var("OMNYID_ADMIN_EMAILS", value) },
        None => unsafe { std::env::remove_var("OMNYID_ADMIN_EMAILS") },
    }
    match prior_upload_dir {
        Some(value) => unsafe { std::env::set_var("OMNYID_UPLOAD_DIR", value) },
        None => unsafe { std::env::remove_var("OMNYID_UPLOAD_DIR") },
    }
    let _ = std::fs::remove_dir_all(upload_dir);
}
