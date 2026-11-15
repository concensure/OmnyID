//! Disposable-Postgres proof for canonical two-person Wedding membership.

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header::AUTHORIZATION},
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
                "Wedding partner tests require disposable local omnyid_test",
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
        display_name: "Partner tester".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    db.mark_email_verified(&user.id)
        .await
        .expect("verify email");
    let token = format!("wedding_partner_{}", Ulid::new().to_string().to_lowercase());
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
        .unwrap_or_else(|_| json!({"text":String::from_utf8_lossy(&bytes)}));
    (status, body)
}

#[tokio::test]
async fn membership_is_two_person_revisioned_and_revocable() {
    let Some(db_url) = test_db_url() else { return };
    let suffix = Ulid::new().to_string().to_lowercase();
    let prior_origin = std::env::var_os("OMNYID_PUBLIC_ORIGIN");
    unsafe { std::env::set_var("OMNYID_PUBLIC_ORIGIN", "https://example.test") };

    let db = Db::new(&db_url).await.expect("database");
    let owner_email = format!("owner-{suffix}@omnyid.test");
    let partner_email = format!("partner-{suffix}@omnyid.test");
    let third_email = format!("third-{suffix}@omnyid.test");
    let (owner_id, owner_auth) = seed_user(&db, owner_email).await;
    let (partner_id, partner_auth) = seed_user(&db, partner_email.clone()).await;
    let (_, third_auth) = seed_user(&db, third_email.clone()).await;
    let plan_id = format!("couple-plan-{suffix}");
    let workspace_id = format!("couple-workspace-{suffix}");
    sqlx::query("INSERT INTO wedding_user_onboarding_state (user_id,wedding_plan_id,intake_variant,entry_source) VALUES ($1,$2,'wedding_site','wedding_site')")
        .bind(&owner_id)
        .bind(&plan_id)
        .execute(&db.pool)
        .await
        .expect("owner plan");
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let scope_query = format!("wedding_plan_id={plan_id}&response_workspace_id={workspace_id}");

    let (owner_status, owner_members) = request_json(
        &app,
        Method::GET,
        &format!("/wedding/partners?{scope_query}"),
        &owner_auth,
        None,
    )
    .await;
    assert_eq!(owner_status, StatusCode::OK, "owner scope: {owner_members}");
    assert_eq!(owner_members["scope"]["role"], "owner");
    assert_eq!(owner_members["members"].as_array().map(Vec::len), Some(1));
    assert_eq!(owner_members["invites"].as_array().map(Vec::len), Some(0));

    let (wrong_workspace_status, _) = request_json(
        &app,
        Method::GET,
        &format!(
            "/wedding/partners?wedding_plan_id={plan_id}&response_workspace_id=guessed-{suffix}"
        ),
        &owner_auth,
        None,
    )
    .await;
    assert_eq!(wrong_workspace_status, StatusCode::FORBIDDEN);

    let (invite_status, invite) = request_json(
        &app,
        Method::POST,
        "/wedding/partners/invites",
        &owner_auth,
        Some(&json!({
            "wedding_plan_id":plan_id,
            "response_workspace_id":workspace_id,
            "email":partner_email
        })),
    )
    .await;
    assert_eq!(invite_status, StatusCode::OK, "partner invite: {invite}");
    let token = invite["invite_url"]
        .as_str()
        .and_then(|value| value.split("wedding-partner-invite=").nth(1))
        .expect("invite token");
    let (accept_status, accepted) = request_json(
        &app,
        Method::POST,
        "/wedding/partners/invites/accept",
        &partner_auth,
        Some(&json!({"token":token})),
    )
    .await;
    assert_eq!(accept_status, StatusCode::OK, "accept partner: {accepted}");

    let (owner_invite_history_status, owner_invite_history) = request_json(
        &app,
        Method::GET,
        &format!("/wedding/partners?{scope_query}"),
        &owner_auth,
        None,
    )
    .await;
    assert_eq!(owner_invite_history_status, StatusCode::OK);
    assert_eq!(owner_invite_history["invites"][0]["status"], "accepted");
    assert!(
        owner_invite_history["invites"][0]
            .get("invited_email_digest")
            .is_none()
    );

    let (partner_status, partner_members) = request_json(
        &app,
        Method::GET,
        &format!("/wedding/partners?{scope_query}"),
        &partner_auth,
        None,
    )
    .await;
    assert_eq!(
        partner_status,
        StatusCode::OK,
        "partner scope: {partner_members}"
    );
    assert_eq!(partner_members["scope"]["role"], "co_owner");
    assert_eq!(partner_members["scope"]["owner_user_id"], owner_id);
    assert_eq!(partner_members["members"].as_array().map(Vec::len), Some(2));
    assert_eq!(partner_members["invites"].as_array().map(Vec::len), Some(0));

    let (third_invite_status, _) = request_json(
        &app,
        Method::POST,
        "/wedding/partners/invites",
        &owner_auth,
        Some(&json!({
            "wedding_plan_id":plan_id,
            "response_workspace_id":workspace_id,
            "email":third_email
        })),
    )
    .await;
    assert_eq!(third_invite_status, StatusCode::CONFLICT);
    let (partner_invite_status, _) = request_json(
        &app,
        Method::POST,
        "/wedding/partners/invites",
        &partner_auth,
        Some(&json!({
            "wedding_plan_id":plan_id,
            "response_workspace_id":workspace_id,
            "email":third_email
        })),
    )
    .await;
    assert_eq!(partner_invite_status, StatusCode::FORBIDDEN);

    let (revoke_status, revoked) = request_json(
        &app,
        Method::DELETE,
        &format!("/wedding/partners/{partner_id}?{scope_query}"),
        &owner_auth,
        None,
    )
    .await;
    assert_eq!(revoke_status, StatusCode::OK, "revoke partner: {revoked}");
    assert_eq!(revoked["revoked"], true);
    let (revoked_status, _) = request_json(
        &app,
        Method::GET,
        &format!("/wedding/partners?{scope_query}"),
        &partner_auth,
        None,
    )
    .await;
    assert_eq!(revoked_status, StatusCode::FORBIDDEN);
    let revision: i64 = sqlx::query_scalar(
        "SELECT membership_revision FROM wedding_plan_memberships
          WHERE wedding_owner_user_id=$1 AND wedding_plan_id=$2 AND member_user_id=$3",
    )
    .bind(&owner_id)
    .bind(&plan_id)
    .bind(&partner_id)
    .fetch_one(&db.pool)
    .await
    .expect("membership revision");
    assert_eq!(revision, 2);

    let (guessed_status, _) = request_json(
        &app,
        Method::GET,
        &format!("/wedding/partners?{scope_query}"),
        &third_auth,
        None,
    )
    .await;
    assert_eq!(guessed_status, StatusCode::FORBIDDEN);

    match prior_origin {
        Some(value) => unsafe { std::env::set_var("OMNYID_PUBLIC_ORIGIN", value) },
        None => unsafe { std::env::remove_var("OMNYID_PUBLIC_ORIGIN") },
    }
}
