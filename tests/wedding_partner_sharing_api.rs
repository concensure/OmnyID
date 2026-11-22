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
    let prior_encryption_key = std::env::var_os("OMNYID_ENCRYPTION_KEY_HEX");
    unsafe { std::env::set_var("OMNYID_PUBLIC_ORIGIN", "https://example.test") };
    unsafe {
        std::env::set_var(
            "OMNYID_ENCRYPTION_KEY_HEX",
            "1111111111111111111111111111111111111111111111111111111111111111",
        )
    };

    let db = Db::new(&db_url).await.expect("database");
    let owner_email = format!("owner-{suffix}@omnyid.test");
    let partner_email = format!("partner-{suffix}@omnyid.test");
    let third_email = format!("third-{suffix}@omnyid.test");
    let (owner_id, owner_auth) = seed_user(&db, owner_email.clone()).await;
    let (partner_id, partner_auth) = seed_user(&db, partner_email.clone()).await;
    let (third_id, third_auth) = seed_user(&db, third_email.clone()).await;
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

    db.ensure_user_private_schema(&owner_id)
        .await
        .expect("owner private schema");
    let owner_table = format!("\"{}\".messages", tenant_schema_name(&owner_id));
    let source_id = format!("runsheet-source-{suffix}");
    let source_insert = format!(
        "INSERT INTO {owner_table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,content,signature,store_in_relational,metadata) VALUES ($1,$2,'agent://wedding-planning','[]'::jsonb,NOW(),'task','wedding_task',$3,'test',TRUE,$4)"
    );
    sqlx::query(&source_insert)
        .bind(&source_id)
        .bind(format!("wedding:{workspace_id}"))
        .bind(json!({
            "kind":"wedding_task",
            "wedding_plan_id":plan_id,
            "response_workspace_id":workspace_id,
            "title":"Confirm ceremony start"
        }))
        .bind(json!({
            "weddingPlanId":plan_id,
            "responseWorkspaceId":workspace_id
        }))
        .execute(&db.pool)
        .await
        .expect("run-sheet source");
    let database_id = format!("database:wedding-run-sheet:{plan_id}");
    let install_body = json!({
        "database_id":database_id,
        "wedding_plan_id":plan_id,
        "response_workspace_id":workspace_id
    });
    let (partner_install_status, partner_install) = request_json(
        &app,
        Method::POST,
        "/database/wedding-runsheet/install",
        &partner_auth,
        Some(&install_body),
    )
    .await;
    assert_eq!(
        partner_install_status,
        StatusCode::OK,
        "partner install: {partner_install}"
    );
    assert!(partner_install["checkpoint"].is_null());
    let record_id = format!("runsheet:task:{suffix}");
    let projection_body = json!({
        "database_id":database_id,
        "wedding_plan_id":plan_id,
        "response_workspace_id":workspace_id,
        "profile_id":"wedding_runsheet.v1",
        "expected_checkpoint":null,
        "next_checkpoint":{
            "source_cursor":source_id,
            "projector_version":1,
            "source_fingerprint":format!("fingerprint-{suffix}")
        },
        "records":[{
            "kind":"database_record",
            "contract_version":1,
            "database_id":database_id,
            "record_id":record_id,
            "revision":1,
            "table":"run_sheet",
            "data":{
                "runsheet_item_id":record_id,
                "projection_state":"projected",
                "title":"Confirm ceremony start"
            },
            "source_refs":[{"message_id":source_id,"kind":"wedding_task"}],
            "idempotency_key":format!("runsheet-record-{suffix}")
        }],
        "revisions":[],
        "receipt":{
            "kind":"database_projection_receipt",
            "contract_version":1,
            "database_id":database_id,
            "projector_id":"wedding-runsheet",
            "projector_version":1,
            "source_cursor":source_id,
            "source_fingerprint":format!("fingerprint-{suffix}"),
            "affected_record_ids":[record_id],
            "idempotency_key":format!("runsheet-receipt-{suffix}")
        },
        "explanation":"One shared run-sheet item was projected.",
        "model_calls":0
    });
    let (partner_projection_status, partner_projection) = request_json(
        &app,
        Method::POST,
        "/database/wedding-runsheet/projection",
        &partner_auth,
        Some(&projection_body),
    )
    .await;
    assert_eq!(
        partner_projection_status,
        StatusCode::OK,
        "partner projection: {partner_projection}"
    );
    assert_eq!(partner_projection["commit"]["projector_version"], 1);
    let run_sheet_query = format!(
        "database_id={database_id}&wedding_plan_id={plan_id}&response_workspace_id={workspace_id}"
    );
    let (owner_projection_status, owner_projection) = request_json(
        &app,
        Method::GET,
        &format!("/database/wedding-runsheet/projection?{run_sheet_query}"),
        &owner_auth,
        None,
    )
    .await;
    assert_eq!(
        owner_projection_status,
        StatusCode::OK,
        "owner projection: {owner_projection}"
    );
    assert_eq!(owner_projection["checkpoint"]["projector_version"], 1);
    assert_eq!(
        owner_projection["messages"],
        partner_projection["state"]["messages"]
    );

    let (wrong_runsheet_workspace_status, _) = request_json(
        &app,
        Method::GET,
        &format!("/database/wedding-runsheet/projection?database_id={database_id}&wedding_plan_id={plan_id}&response_workspace_id=guessed-{suffix}"),
        &partner_auth,
        None,
    )
    .await;
    assert_eq!(wrong_runsheet_workspace_status, StatusCode::FORBIDDEN);
    let wrong_workspace_research = json!({
        "wedding_plan_id":plan_id,
        "response_workspace_id":format!("guessed-{suffix}"),
        "task_id":format!("decision-{suffix}"),
        "title":"Choose the ceremony start time",
        "context":[],
        "queue_rank":0
    });
    let (wrong_research_workspace_status, _) = request_json(
        &app,
        Method::POST,
        "/wedding/decision-research",
        &partner_auth,
        Some(&wrong_workspace_research),
    )
    .await;
    assert_eq!(wrong_research_workspace_status, StatusCode::FORBIDDEN);
    let wrong_workspace_delivery = json!({
        "wedding_plan_id":plan_id,
        "response_workspace_id":format!("guessed-{suffix}"),
        "task_id":format!("task-{suffix}"),
        "task_title":"Confirm ceremony start",
        "assignee_name":"Owner tester",
        "assignee_email":owner_email
    });
    let (wrong_delivery_workspace_status, _) = request_json(
        &app,
        Method::POST,
        "/wedding/task-assignment/deliver",
        &partner_auth,
        Some(&wrong_workspace_delivery),
    )
    .await;
    assert_eq!(wrong_delivery_workspace_status, StatusCode::FORBIDDEN);
    let other_plan_id = format!("other-plan-{suffix}");
    let other_workspace_id = format!("other-workspace-{suffix}");
    sqlx::query("INSERT INTO wedding_user_onboarding_state (user_id,wedding_plan_id,intake_variant,entry_source) VALUES ($1,$2,'wedding_site','wedding_site')")
        .bind(&third_id)
        .bind(&other_plan_id)
        .execute(&db.pool)
        .await
        .expect("other couple plan");
    let (other_scope_status, _) = request_json(
        &app,
        Method::GET,
        &format!("/wedding/partners?wedding_plan_id={other_plan_id}&response_workspace_id={other_workspace_id}"),
        &third_auth,
        None,
    )
    .await;
    assert_eq!(other_scope_status, StatusCode::OK);
    let (cross_couple_runsheet_status, _) = request_json(
        &app,
        Method::GET,
        &format!("/database/wedding-runsheet/projection?{run_sheet_query}"),
        &third_auth,
        None,
    )
    .await;
    assert_eq!(cross_couple_runsheet_status, StatusCode::FORBIDDEN);
    let scoped_research = json!({
        "wedding_plan_id":plan_id,
        "response_workspace_id":workspace_id,
        "task_id":format!("decision-{suffix}"),
        "title":"Choose the ceremony start time",
        "context":[],
        "queue_rank":0
    });
    let (cross_couple_research_status, _) = request_json(
        &app,
        Method::POST,
        "/wedding/decision-research",
        &third_auth,
        Some(&scoped_research),
    )
    .await;
    assert_eq!(cross_couple_research_status, StatusCode::FORBIDDEN);
    let scoped_delivery = json!({
        "wedding_plan_id":plan_id,
        "response_workspace_id":workspace_id,
        "task_id":format!("task-{suffix}"),
        "task_title":"Confirm ceremony start",
        "assignee_name":"Owner tester",
        "assignee_email":owner_email
    });
    let (cross_couple_delivery_status, _) = request_json(
        &app,
        Method::POST,
        "/wedding/task-assignment/deliver",
        &third_auth,
        Some(&scoped_delivery),
    )
    .await;
    assert_eq!(cross_couple_delivery_status, StatusCode::FORBIDDEN);

    let (share_status, shared) = request_json(
        &app,
        Method::POST,
        "/wedding/partners/contacts",
        &owner_auth,
        Some(&json!({
            "wedding_plan_id":plan_id,
            "response_workspace_id":workspace_id,
            "recipient_user_id":partner_id,
            "contact_ref":"contact-celebrant",
            "contact":{
                "name":"Casey Celebrant",
                "email":"casey@example.test",
                "roles":["Celebrant"]
            }
        })),
    )
    .await;
    assert_eq!(share_status, StatusCode::OK, "share contact: {shared}");
    let share_id = shared["share_id"].as_str().expect("share id");

    let (owner_contacts_status, owner_contacts) = request_json(
        &app,
        Method::GET,
        &format!("/wedding/partners/contacts?{scope_query}"),
        &owner_auth,
        None,
    )
    .await;
    assert_eq!(owner_contacts_status, StatusCode::OK);
    assert_eq!(owner_contacts["contacts"].as_array().map(Vec::len), Some(0));
    assert_eq!(
        owner_contacts["shared_by_me"].as_array().map(Vec::len),
        Some(1)
    );
    assert_eq!(
        owner_contacts["shared_by_me"][0]["recipient_display_name"],
        "Partner tester"
    );
    assert!(owner_contacts["shared_by_me"][0]["contact"]["phone"].is_null());

    let (partner_contacts_status, partner_contacts) = request_json(
        &app,
        Method::GET,
        &format!("/wedding/partners/contacts?{scope_query}"),
        &partner_auth,
        None,
    )
    .await;
    assert_eq!(partner_contacts_status, StatusCode::OK);
    assert_eq!(
        partner_contacts["contacts"].as_array().map(Vec::len),
        Some(1)
    );
    assert_eq!(
        partner_contacts["contacts"][0]["shared_by_user_id"],
        owner_id
    );
    assert_eq!(
        partner_contacts["contacts"][0]["contact"]["email"],
        "casey@example.test"
    );
    assert!(partner_contacts["contacts"][0].get("contact_ref").is_none());

    let (recipient_revoke_status, recipient_revoke) = request_json(
        &app,
        Method::DELETE,
        &format!("/wedding/partners/contacts/{share_id}?{scope_query}"),
        &partner_auth,
        None,
    )
    .await;
    assert_eq!(recipient_revoke_status, StatusCode::OK);
    assert_eq!(recipient_revoke["revoked"], false);

    let (owner_revoke_status, owner_revoke) = request_json(
        &app,
        Method::DELETE,
        &format!("/wedding/partners/contacts/{share_id}?{scope_query}"),
        &owner_auth,
        None,
    )
    .await;
    assert_eq!(owner_revoke_status, StatusCode::OK);
    assert_eq!(owner_revoke["revoked"], true);

    let (partner_share_status, partner_share) = request_json(
        &app,
        Method::POST,
        "/wedding/partners/contacts",
        &partner_auth,
        Some(&json!({
            "wedding_plan_id":plan_id,
            "response_workspace_id":workspace_id,
            "recipient_user_id":owner_id,
            "contact_ref":"contact-photographer",
            "contact":{"name":"Morgan Photo","phone":"0400 000 002","roles":["Photographer"]}
        })),
    )
    .await;
    assert_eq!(
        partner_share_status,
        StatusCode::OK,
        "partner share: {partner_share}"
    );
    let partner_share_id = partner_share["share_id"]
        .as_str()
        .expect("partner share id")
        .to_string();

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
    let partner_share_status: String =
        sqlx::query_scalar("SELECT status FROM wedding_shared_contact_grants WHERE share_id=$1")
            .bind(&partner_share_id)
            .fetch_one(&db.pool)
            .await
            .expect("partner share status");
    assert_eq!(partner_share_status, "revoked");
    let (revoked_status, _) = request_json(
        &app,
        Method::GET,
        &format!("/wedding/partners?{scope_query}"),
        &partner_auth,
        None,
    )
    .await;
    assert_eq!(revoked_status, StatusCode::FORBIDDEN);
    let (revoked_runsheet_status, _) = request_json(
        &app,
        Method::GET,
        &format!("/database/wedding-runsheet/projection?{run_sheet_query}"),
        &partner_auth,
        None,
    )
    .await;
    assert_eq!(revoked_runsheet_status, StatusCode::FORBIDDEN);
    let (revoked_research_status, _) = request_json(
        &app,
        Method::POST,
        "/wedding/decision-research",
        &partner_auth,
        Some(&scoped_research),
    )
    .await;
    assert_eq!(revoked_research_status, StatusCode::FORBIDDEN);
    let (revoked_delivery_status, _) = request_json(
        &app,
        Method::POST,
        "/wedding/task-assignment/deliver",
        &partner_auth,
        Some(&scoped_delivery),
    )
    .await;
    assert_eq!(revoked_delivery_status, StatusCode::FORBIDDEN);
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
    match prior_encryption_key {
        Some(value) => unsafe { std::env::set_var("OMNYID_ENCRYPTION_KEY_HEX", value) },
        None => unsafe { std::env::remove_var("OMNYID_ENCRYPTION_KEY_HEX") },
    }
}
