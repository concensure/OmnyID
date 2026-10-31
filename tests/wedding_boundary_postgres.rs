//! Disposable-Postgres evidence for server-authoritative Family Boundaries.
//! Set TEST_DATABASE_URL to a local `omnyid_test` database; otherwise this skips.

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
                "Family Boundary integration tests require disposable local omnyid_test"
            );
        })
}

fn tenant_schema(user_id: &str) -> String {
    let suffix = user_id
        .chars()
        .flat_map(char::to_lowercase)
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .take(55)
        .collect::<String>();
    format!("user_{suffix}")
}

async fn seed_user(db: &Db, label: &str) -> (UserRecord, String) {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("boundary-{label}-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: format!("Boundary {label}"),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("boundary_session_{suffix}");
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: user.id.clone(),
        created_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + Duration::hours(2)).to_rfc3339(),
    })
    .await
    .expect("create session");
    db.ensure_user_private_schema(&user.id)
        .await
        .expect("tenant schema");
    (user, format!("Bearer {token}"))
}

async fn append_fixture(
    db: &Db,
    user_id: &str,
    kind: &str,
    plan: &str,
    workspace: &str,
    content: Value,
) {
    let table = format!("\"{}\".messages", tenant_schema(user_id));
    let query = format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata,\"references\",supertags) VALUES ($1,$2,'test://family-boundary',$3,NOW(),'ledger',$4,$4,$5,'test',TRUE,$6,'[]'::jsonb,$7)"
    );
    sqlx::query(&query)
        .bind(Ulid::new().to_string())
        .bind(format!("wedding_boundary:{workspace}"))
        .bind(json!(["agent://wedding-planning"]))
        .bind(kind)
        .bind(content)
        .bind(json!({"weddingPlanId":plan,"responseWorkspaceId":workspace,"test_fixture":true}))
        .bind(vec!["template:wedding_planner", "wedding_boundary"])
        .execute(&db.pool)
        .await
        .expect("fixture event");
}

async fn post_json(app: &Router, uri: &str, auth: &str, body: Value) -> (StatusCode, Value) {
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
    let payload = serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| json!({"text":String::from_utf8_lossy(&bytes)}));
    (status, payload)
}

async fn request_json(app: &Router, auth: &str, body: Value) -> (StatusCode, Value) {
    post_json(app, "/wedding/boundaries/households/commands", auth, body).await
}

#[tokio::test]
async fn household_split_is_atomic_idempotent_stale_safe_and_tenant_private() {
    let Some(db_url) = test_db_url() else { return };
    let db = Db::new(&db_url).await.expect("connect test database");
    let (owner, owner_auth) = seed_user(&db, "owner").await;
    let (_outsider, outsider_auth) = seed_user(&db, "outsider").await;
    let plan = format!("wedding-plan-{}", Ulid::new());
    let workspace = format!("wedding-workspace-{}", Ulid::new());
    let source = format!("household-source-{}", Ulid::new());
    let destination = format!("household-destination-{}", Ulid::new());
    let person_a = format!("person-a-{}", Ulid::new());
    let person_b = format!("person-b-{}", Ulid::new());
    append_fixture(&db, &owner.id, "wedding_boundary_household", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_household","boundary_object_id":source,"household_id":source,"display_name":"Rivera household","title":"Rivera household","status":"active","member_person_ids":[person_a,person_b],"revision":1
    })).await;
    for (person, label) in [(&person_a, "Alex"), (&person_b, "Sam")] {
        append_fixture(&db, &owner.id, "wedding_boundary_guest_profile", &plan, &workspace, json!({
            "ledger_kind":"wedding_boundary_guest_profile","boundary_object_id":person,"person_id":person,"display_name":label,"title":label,"status":"active","household_id":source
        })).await;
    }
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let prior_helper_flag = std::env::var_os("OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED");
    unsafe { std::env::remove_var("OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED") };
    let helper_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/wedding/boundaries/helpers/open")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"not-an-actual-token"}"#))
                .expect("helper request"),
        )
        .await
        .expect("helper response");
    match prior_helper_flag {
        Some(value) => unsafe {
            std::env::set_var("OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED", value)
        },
        None => unsafe { std::env::remove_var("OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED") },
    }
    assert_eq!(
        helper_response.status(),
        StatusCode::NOT_FOUND,
        "flags-off helper shadow must expose no capability surface"
    );
    let key = format!("split-{}", Ulid::new());
    let command = json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"operation":"split_household",
        "source_household_ids":[source],"target_household_id":null,"new_household_id":destination,
        "new_household_label":"Sam household","move_person_ids":[person_b],"expected_revisions":{(source.clone()):1},
        "family_group_id":null,"invitation_allocation":null,"representative_person_id":null,
        "confirmed_elevated_impact":false,"idempotency_key":key
    });
    let (status, response) = request_json(&app, &owner_auth, command.clone()).await;
    assert_eq!(status, StatusCode::OK, "split response: {response}");
    assert_eq!(response["status"], "applied");
    let (retry_status, retry) = request_json(&app, &owner_auth, command.clone()).await;
    assert_eq!(retry_status, StatusCode::OK, "retry response: {retry}");
    assert_eq!(retry["impact_receipt_id"], response["impact_receipt_id"]);

    let stale_key = format!("stale-{}", Ulid::new());
    let mut stale = command.clone();
    stale["idempotency_key"] = json!(stale_key);
    let (stale_status, _) = request_json(&app, &owner_auth, stale).await;
    assert_eq!(stale_status, StatusCode::CONFLICT);
    let outsider_key = format!("outsider-{}", Ulid::new());
    let mut outsider = command;
    outsider["idempotency_key"] = json!(outsider_key);
    let (outsider_status, _) = request_json(&app, &outsider_auth, outsider).await;
    assert_eq!(outsider_status, StatusCode::CONFLICT);

    let table = format!("\"{}\".messages", tenant_schema(&owner.id));
    let query = format!(
        "SELECT content->>'household_id' FROM {table} WHERE kind='wedding_boundary_guest_profile' AND content->>'person_id'=$1 ORDER BY timestamp DESC,id DESC LIMIT 1"
    );
    let moved_to = sqlx::query_scalar::<_, String>(&query)
        .bind(&person_b)
        .fetch_one(&db.pool)
        .await
        .expect("moved guest");
    assert_eq!(moved_to, destination);
}

#[tokio::test]
async fn two_partner_approval_applies_only_after_distinct_second_partner() {
    let Some(db_url) = test_db_url() else { return };
    let db = Db::new(&db_url).await.expect("connect test database");
    let (owner, auth) = seed_user(&db, "partner-pair").await;
    let plan = format!("wedding-plan-{}", Ulid::new());
    let workspace = format!("wedding-workspace-{}", Ulid::new());
    let household = format!("household-{}", Ulid::new());
    let existing_person = format!("person-existing-{}", Ulid::new());
    let proposed_person = format!("person-proposed-{}", Ulid::new());
    let partner_a = format!("partner-a-{}", Ulid::new());
    let partner_b = format!("partner-b-{}", Ulid::new());
    let request_id = format!("boundary-request-{}", Ulid::new());
    let plus_one_request_id = format!("boundary-plus-one-{}", Ulid::new());
    append_fixture(&db, &owner.id, "wedding_boundary_household", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_household","boundary_object_id":household,"household_id":household,
        "display_name":"Pair approval household","title":"Pair approval household","status":"active",
        "member_person_ids":[existing_person],"invitation_allocation":3,"revision":1
    })).await;
    append_fixture(&db, &owner.id, "wedding_boundary_guest_profile", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_guest_profile","boundary_object_id":existing_person,"person_id":existing_person,
        "display_name":"Existing guest","title":"Existing guest","status":"active","household_id":household
    })).await;
    append_fixture(&db, &owner.id, "wedding_boundary_event_invitation", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_event_invitation","boundary_object_id":format!("invite-{existing_person}"),
        "invitation_id":format!("invite-{existing_person}"),"event_id":format!("event-{workspace}"),
        "person_id":existing_person,"invitation_status":"not_invited","plus_one_allowed":false,"response_revision":1
    })).await;
    for (partner, title) in [(&partner_a, "Partner one"), (&partner_b, "Partner two")] {
        append_fixture(&db, &owner.id, "wedding_boundary_role_assignment", &plan, &workspace, json!({
            "ledger_kind":"wedding_boundary_role_assignment","boundary_object_id":format!("role-{partner}"),
            "person_id":partner,"role":"couple","title":title,"status":"active"
        })).await;
    }
    append_fixture(&db, &owner.id, "wedding_boundary_change_request", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_change_request","boundary_object_id":request_id,"request_id":request_id,
        "requested_by":"family:helper","change_type":"add_guest","target_household_id":household,
        "target_person_id":proposed_person,"proposed_guest_name":"Proposed guest","expected_household_revision":1,
        "request_status":"pending","status":"pending","approval_required":true,"approval_gate_recorded":true,
        "approval_count":0,"required_approval_count":2,"policy_ids":[],"policy_versions":{},"revision":1
    })).await;
    append_fixture(&db, &owner.id, "wedding_boundary_change_request", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_change_request","boundary_object_id":plus_one_request_id,"request_id":plus_one_request_id,
        "requested_by":"family:planner","change_type":"plus_one_change","target_person_id":existing_person,
        "proposed_plus_one_allowed":true,"request_status":"pending","status":"pending","approval_required":true,
        "approval_gate_recorded":true,"required_approval_count":1,"policy_ids":[],"policy_versions":{},"revision":1
    })).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let first = json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"request_id":request_id,"decision":"approve",
        "expected_revision":1,"approval_actor_id":partner_a,"idempotency_key":format!("first-{}",Ulid::new())
    });
    let (first_status, first_response) =
        post_json(&app, "/wedding/boundaries/decisions", &auth, first).await;
    assert_eq!(
        first_status,
        StatusCode::OK,
        "first approval: {first_response}"
    );
    assert_eq!(first_response["status"], "partially_approved");
    let table = format!("\"{}\".messages", tenant_schema(&owner.id));
    let count_query = format!(
        "SELECT COUNT(*) FROM {table} WHERE kind='wedding_boundary_guest_profile' AND content->>'person_id'=$1"
    );
    let before = sqlx::query_scalar::<_, i64>(&count_query)
        .bind(&proposed_person)
        .fetch_one(&db.pool)
        .await
        .expect("count before second approval");
    assert_eq!(
        before, 0,
        "first approval must not apply the guest mutation"
    );

    let duplicate = json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"request_id":request_id,"decision":"approve",
        "expected_revision":2,"approval_actor_id":partner_a,"idempotency_key":format!("duplicate-{}",Ulid::new())
    });
    let (duplicate_status, _) =
        post_json(&app, "/wedding/boundaries/decisions", &auth, duplicate).await;
    assert_eq!(duplicate_status, StatusCode::CONFLICT);
    let second = json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"request_id":request_id,"decision":"approve",
        "expected_revision":2,"approval_actor_id":partner_b,"idempotency_key":format!("second-{}",Ulid::new())
    });
    let (second_status, second_response) =
        post_json(&app, "/wedding/boundaries/decisions", &auth, second).await;
    assert_eq!(
        second_status,
        StatusCode::OK,
        "second approval: {second_response}"
    );
    assert_eq!(second_response["status"], "approved");
    let after = sqlx::query_scalar::<_, i64>(&count_query)
        .bind(&proposed_person)
        .fetch_one(&db.pool)
        .await
        .expect("count after second approval");
    assert_eq!(
        after, 1,
        "distinct second approval applies exactly one guest profile"
    );

    let plus_one_decision = json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"request_id":plus_one_request_id,"decision":"approve",
        "expected_revision":1,"approval_actor_id":null,"idempotency_key":format!("plus-one-{}",Ulid::new())
    });
    let (plus_status, plus_response) = post_json(
        &app,
        "/wedding/boundaries/decisions",
        &auth,
        plus_one_decision,
    )
    .await;
    assert_eq!(
        plus_status,
        StatusCode::OK,
        "plus-one approval: {plus_response}"
    );
    let invitation_query = format!(
        "SELECT (content->>'plus_one_allowed')::boolean FROM {table} WHERE kind='wedding_boundary_event_invitation' AND content->>'person_id'=$1 ORDER BY COALESCE((content->>'response_revision')::bigint,1) DESC,timestamp DESC,id DESC LIMIT 1"
    );
    let plus_one_allowed = sqlx::query_scalar::<_, bool>(&invitation_query)
        .bind(&existing_person)
        .fetch_one(&db.pool)
        .await
        .expect("plus-one projection");
    assert!(
        plus_one_allowed,
        "approved non-add request updates the canonical invitation"
    );
}
