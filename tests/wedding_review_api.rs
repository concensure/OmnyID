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
        "event_month": "2026-10-01",
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
    let eligibility_request = json!({
        "expected_revision":1,
        "expected_verification_version":0,
        "idempotency_key":format!("eligibility-{suffix}"),
        "evidence_decisions":[{
            "evidence_ref_id":evidence_ref_id,
            "decision":"accept"
        }]
    });
    let (eligibility_status, eligibility) = request_json(
        &app,
        Method::POST,
        &format!("/admin/wedding/reviews/{review_id}/eligibility"),
        &operator_auth,
        Some(&eligibility_request),
    )
    .await;
    assert_eq!(
        eligibility_status,
        StatusCode::OK,
        "eligibility decision: {eligibility}"
    );
    assert_eq!(eligibility["verification_state"], "verified_wedding_held");
    assert_eq!(eligibility["review_status"], "moderation_pending");
    assert_eq!(eligibility["probable_duplicate"], false);
    let (eligibility_retry_status, eligibility_retry) = request_json(
        &app,
        Method::POST,
        &format!("/admin/wedding/reviews/{review_id}/eligibility"),
        &operator_auth,
        Some(&eligibility_request),
    )
    .await;
    assert_eq!(eligibility_retry_status, StatusCode::OK);
    assert_eq!(eligibility_retry["replayed"], true);
    let assessment_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM wedding_review_eligibility_assessments WHERE review_id=$1",
    )
    .bind(review_id)
    .fetch_one(&db.pool)
    .await
    .expect("eligibility assessment count");
    assert_eq!(assessment_count, 1);
    let (queue_status, queue) = request_json(
        &app,
        Method::GET,
        "/admin/wedding/reviews/moderation?status=moderation_pending",
        &operator_auth,
        None,
    )
    .await;
    assert_eq!(queue_status, StatusCode::OK, "moderation queue: {queue}");
    assert!(
        queue["items"]
            .as_array()
            .is_some_and(|items| items.iter().any(|item| item["review_id"] == review_id))
    );
    assert!(queue.to_string().find("Clear communication").is_none());
    let moderation_request = json!({
        "expected_revision":1,
        "expected_verification_version":1,
        "decision":"approve",
        "reason_code":"eligibility",
        "idempotency_key":format!("moderate-{suffix}")
    });
    let (unopened_status, unopened) = request_json(
        &app,
        Method::POST,
        &format!("/admin/wedding/reviews/{review_id}/moderation"),
        &operator_auth,
        Some(&moderation_request),
    )
    .await;
    assert_eq!(
        unopened_status,
        StatusCode::CONFLICT,
        "approval must require an audited preview: {unopened}"
    );
    let (preview_status, preview) = request_json(
        &app,
        Method::GET,
        &format!("/admin/wedding/reviews/{review_id}/moderation?purpose=moderation"),
        &operator_auth,
        None,
    )
    .await;
    assert_eq!(
        preview_status,
        StatusCode::OK,
        "moderation preview: {preview}"
    );
    assert_eq!(preview["title"], "Clear communication");
    assert!(preview.get("owner_user_id").is_none());
    let (approve_status, approved) = request_json(
        &app,
        Method::POST,
        &format!("/admin/wedding/reviews/{review_id}/moderation"),
        &operator_auth,
        Some(&moderation_request),
    )
    .await;
    assert_eq!(approve_status, StatusCode::OK, "approve review: {approved}");
    assert_eq!(approved["result_status"], "published");
    let (approve_retry_status, approve_retry) = request_json(
        &app,
        Method::POST,
        &format!("/admin/wedding/reviews/{review_id}/moderation"),
        &operator_auth,
        Some(&moderation_request),
    )
    .await;
    assert_eq!(approve_retry_status, StatusCode::OK);
    assert_eq!(approve_retry["replayed"], true);
    let publication: Value = sqlx::query_scalar(
        "SELECT public_snapshot FROM wedding_review_publications
         WHERE review_id=$1 AND status='published'",
    )
    .bind(review_id)
    .fetch_one(&db.pool)
    .await
    .expect("published snapshot");
    assert_eq!(publication["display_label"], "An OmnyID couple");
    assert_eq!(publication["title"], "Clear communication");
    assert!(publication.get("owner_user_id").is_none());
    assert!(publication.get("evidence_ref_id").is_none());
    let (public_status, public_reviews) = request_json(
        &app,
        Method::GET,
        &format!("/public/wedding/vendors/{}/reviews", vendor.vendor_id),
        &first_auth,
        None,
    )
    .await;
    assert_eq!(
        public_status,
        StatusCode::OK,
        "public reviews: {public_reviews}"
    );
    assert_eq!(public_reviews["published_review_count"], 1);
    assert_eq!(public_reviews["aggregate"]["eligible_review_count"], 1);
    assert_eq!(public_reviews["aggregate"]["average_display"], "5.0");
    assert_eq!(public_reviews["aggregate"]["show_compact_score"], false);
    assert_eq!(
        public_reviews["reviews"][0]["public_snapshot"]["title"],
        "Clear communication"
    );
    let (restrict_status, restricted) = request_json(
        &app,
        Method::POST,
        &format!("/admin/wedding/reviews/{review_id}/moderation"),
        &operator_auth,
        Some(&json!({
            "expected_revision":1,
            "expected_verification_version":1,
            "decision":"restrict",
            "reason_code":"policy_other",
            "idempotency_key":format!("restrict-{suffix}")
        })),
    )
    .await;
    assert_eq!(
        restrict_status,
        StatusCode::OK,
        "restrict review: {restricted}"
    );
    assert_eq!(restricted["result_status"], "restricted");
    let (restricted_public_status, restricted_public) = request_json(
        &app,
        Method::GET,
        &format!("/public/wedding/vendors/{}/reviews", vendor.vendor_id),
        &first_auth,
        None,
    )
    .await;
    assert_eq!(restricted_public_status, StatusCode::OK);
    assert_eq!(restricted_public["published_review_count"], 0);
    let (restore_status, restored) = request_json(
        &app,
        Method::POST,
        &format!("/admin/wedding/reviews/{review_id}/moderation"),
        &operator_auth,
        Some(&json!({
            "expected_revision":1,
            "expected_verification_version":1,
            "decision":"restore",
            "reason_code":"policy_other",
            "idempotency_key":format!("restore-{suffix}")
        })),
    )
    .await;
    assert_eq!(restore_status, StatusCode::OK, "restore review: {restored}");
    assert_eq!(restored["result_status"], "restored");
    let published_revision: i64 =
        sqlx::query_scalar("SELECT published_revision FROM wedding_reviews WHERE review_id=$1")
            .bind(review_id)
            .fetch_one(&db.pool)
            .await
            .expect("restored publication revision");
    assert_eq!(published_revision, 1);
    let (list_status, listed) = request_json(
        &app,
        Method::GET,
        &format!("/wedding/reviews/status?wedding_plan_id={plan_id}"),
        &first_auth,
        None,
    )
    .await;
    assert_eq!(list_status, StatusCode::OK, "review status list: {listed}");
    assert_eq!(listed["items"].as_array().map(Vec::len), Some(1));
    assert_eq!(
        listed["items"][0]["verification_state"],
        "verified_wedding_held"
    );
    assert!(listed.to_string().find(&attachment_id).is_none());
    let (partner_detail_status, partner_detail) = request_json(
        &app,
        Method::GET,
        &format!("/wedding/reviews/{review_id}/status"),
        &partner_auth,
        None,
    )
    .await;
    assert_eq!(
        partner_detail_status,
        StatusCode::NOT_FOUND,
        "a partner who did not author the review cannot infer its status: {partner_detail}"
    );
    let withdrawal = json!({
        "expected_revision":1,
        "idempotency_key":format!("withdraw-{suffix}"),
        "reason_code":"author_request"
    });
    let (withdraw_status, withdrawn) = request_json(
        &app,
        Method::POST,
        &format!("/wedding/reviews/{review_id}/withdraw"),
        &first_auth,
        Some(&withdrawal),
    )
    .await;
    assert_eq!(
        withdraw_status,
        StatusCode::OK,
        "withdraw review: {withdrawn}"
    );
    assert_eq!(withdrawn["status"], "withdrawn");
    assert_eq!(withdrawn["affected_publications"], 1);
    let (withdrawn_public_status, withdrawn_public_reviews) = request_json(
        &app,
        Method::GET,
        &format!("/public/wedding/vendors/{}/reviews", vendor.vendor_id),
        &first_auth,
        None,
    )
    .await;
    assert_eq!(withdrawn_public_status, StatusCode::OK);
    assert_eq!(withdrawn_public_reviews["published_review_count"], 0);
    assert_eq!(
        withdrawn_public_reviews["aggregate"]["eligible_review_count"],
        0
    );
    assert_eq!(withdrawn["scheduled_evidence"], 1);
    let (withdraw_retry_status, withdraw_retry) = request_json(
        &app,
        Method::POST,
        &format!("/wedding/reviews/{review_id}/withdraw"),
        &first_auth,
        Some(&withdrawal),
    )
    .await;
    assert_eq!(withdraw_retry_status, StatusCode::OK);
    assert_eq!(withdraw_retry["replayed"], true);
    let (partner_schedule_status, partner_scheduled) = request_json(
        &app,
        Method::POST,
        &format!("/wedding/reviews/{review_id}/evidence/{evidence_ref_id}/schedule-purge"),
        &partner_auth,
        Some(&json!({"reason_code":"author_withdrawal"})),
    )
    .await;
    assert_eq!(
        partner_schedule_status,
        StatusCode::NOT_FOUND,
        "partner must not schedule another author's proof: {partner_scheduled}"
    );
    let (schedule_status, scheduled) = request_json(
        &app,
        Method::POST,
        &format!("/wedding/reviews/{review_id}/evidence/{evidence_ref_id}/schedule-purge"),
        &first_auth,
        Some(&json!({"reason_code":"author_withdrawal"})),
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
