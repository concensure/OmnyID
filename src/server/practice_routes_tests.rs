use crate::db::{AuthSessionRecord, Db, UserRecord};
use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

async fn request(app: &Router, auth: &str, query: &str) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/practice/bootstrap{query}"))
                .header(AUTHORIZATION, auth)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    assert_eq!(
        response.headers().get("cache-control").unwrap(),
        "no-store, private"
    );
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test]
#[ignore = "requires a disposable TEST_DATABASE_URL; run alone with --test-threads=1"]
async fn bootstrap_http_enforces_entitlement_tenant_scope_and_immediate_revocation() {
    let url = std::env::var("TEST_DATABASE_URL").expect("disposable DB required");
    assert!(url.contains("@127.0.0.1:55433/") && url.ends_with("/omnyid_test"));
    // This isolated test process must not run any other environment-mutating test.
    unsafe {
        std::env::remove_var("OMNYID_WEDDING_PRO_PRACTICE_ENABLED");
    }
    let db = Db::new(&url).await.expect("migrations");
    let actor = format!("planner-{}", ulid::Ulid::new());
    let other = format!("other-{}", ulid::Ulid::new());
    let token = format!("practice-session-{}", ulid::Ulid::new());
    db.create_user(&UserRecord {
        id: actor.clone(),
        email: format!("{actor}@example.test"),
        password_hash: Some("test-only".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Practice test".into(),
        created_at: Utc::now().to_rfc3339(),
    })
    .await
    .unwrap();
    db.mark_email_verified(&actor).await.unwrap();
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: actor.clone(),
        created_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + Duration::hours(1)).to_rfc3339(),
    })
    .await
    .unwrap();
    let auth = format!("Bearer {token}");
    let app = crate::server::build_test_router(&url).await;
    assert_eq!(request(&app, "", "").await.0, StatusCode::UNAUTHORIZED);
    let (_, off) = request(&app, &auth, "").await;
    assert_eq!(off["professional_planner"], false);
    unsafe {
        std::env::set_var("OMNYID_WEDDING_PRO_PRACTICE_ENABLED", "true");
        std::env::set_var("OMNYID_WEDDING_PRO_ACCOUNT_ALLOWLIST", &other);
    }
    assert_eq!(
        request(&app, &auth, "").await.1["professional_planner"],
        false
    );
    unsafe {
        std::env::set_var("OMNYID_WEDDING_PRO_ACCOUNT_ALLOWLIST", &actor);
    }
    let practice = format!("practice-{}", ulid::Ulid::new());
    sqlx::query("INSERT INTO practice_directory_projection(practice_id,display_name,source_event_id) VALUES($1,'Harbour Events','event-practice')").bind(&practice).execute(&db.pool).await.unwrap();
    let grant = json!({"grant_id":"member","practice_id":practice,"plan":null,"resource_id":null,
        "subject_account_id":actor,"role":"lead_planner","valid_from":"2026-01-01T00:00:00Z",
        "expires_at":null,"revoked_at":null,"capabilities":[{"resource":"client_index","action":"read"},{"resource":"quotation","action":"read"}]});
    sqlx::query("INSERT INTO practice_membership_projection(practice_id,subject_account_id,revision,grant_body,source_event_id) VALUES($1,$2,1,$3,'event-member')")
        .bind(&practice).bind(&actor).bind(&grant).execute(&db.pool).await.unwrap();
    let plan = json!({"account_id":"couple-a","plan_id":"plan-a","thread_id":"thread-a"});
    let mut collaboration = grant.clone();
    collaboration["plan"] = plan.clone();
    collaboration["grant_id"] = json!("collaboration");
    let summary = json!({"plan":plan,"client_label":"Private couple","wedding_date":null,"stage":"planning","assigned_planner_id":actor,
        "next_action":"review_quote","next_action_due_at":null,"unread_count":7,"action_needed_count":10,"financial_due":[],"source_projection_version":1});
    sqlx::query("INSERT INTO practice_client_projection(practice_id,subject_account_id,owner_account_id,plan_id,thread_id,revision,grant_body,summary,source_event_id) VALUES($1,$2,'couple-a','plan-a','thread-a',1,$3,$4,'event-index')")
        .bind(&practice).bind(&actor).bind(&collaboration).bind(&summary).execute(&db.pool).await.unwrap();
    // Canonical migration is idempotent and SQL rejects forbidden index content.
    sqlx::raw_sql(include_str!(
        "../../postgres/migrations/0122_practice_projections.sql"
    ))
    .execute(&db.pool)
    .await
    .unwrap();
    assert!(sqlx::query("UPDATE practice_client_projection SET summary=summary || '{\"message_body\":\"forbidden\"}'::jsonb WHERE practice_id=$1")
        .bind(&practice).execute(&db.pool).await.is_err());
    let query = format!("?practice_id={practice}");
    let (status, ready) = request(&app, &auth, &query).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(ready["clients"].as_array().unwrap().len(), 1);
    assert_eq!(ready["clients"][0]["summary"]["unread_count"], Value::Null);
    assert_eq!(ready["next_action"]["action"], "review_quote");
    assert!(
        request(&app, &auth, "").await.1["clients"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        request(&app, &auth, "?practice_id=guessed").await.1["status"],
        "forbidden"
    );
    sqlx::query("UPDATE practice_client_projection SET grant_body=jsonb_set(grant_body,'{revoked_at}',to_jsonb(NOW()::text)),revision=revision+1 WHERE practice_id=$1")
        .bind(&practice).execute(&db.pool).await.unwrap();
    let revoked = request(&app, &auth, &query).await.1;
    assert!(revoked["clients"].as_array().unwrap().is_empty());
    assert!(revoked["next_action"].is_null());
    sqlx::query("UPDATE practice_membership_projection SET grant_body=jsonb_set(grant_body,'{revoked_at}',to_jsonb(NOW()::text)),revision=revision+1 WHERE practice_id=$1")
        .bind(&practice).execute(&db.pool).await.unwrap();
    assert_eq!(request(&app, &auth, &query).await.1["status"], "forbidden");
    unsafe {
        std::env::remove_var("OMNYID_WEDDING_PRO_PRACTICE_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_PRO_ACCOUNT_ALLOWLIST");
    }
}
