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

async fn get_json(app: &Router, uri: &str, auth: &str) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(uri)
                .header(AUTHORIZATION, auth)
                .body(Body::empty())
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
    let invitation_b = format!("invite-{}", Ulid::new());
    let response_b = format!("rsvp-response-{}", Ulid::new());
    append_fixture(&db, &owner.id, "wedding_boundary_event_invitation", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_event_invitation","boundary_object_id":invitation_b,
        "invitation_id":invitation_b,"event_id":format!("event-{workspace}"),"person_id":person_b,
        "invitation_status":"rsvp_yes","response_revision":2
    })).await;
    append_fixture(
        &db,
        &owner.id,
        "wedding_rsvp_response",
        &plan,
        &workspace,
        json!({
            "kind":"wedding_rsvp_response","response_id":response_b,"invitation_id":invitation_b,
            "person_id":person_b,"attendance":"attending","revision":1
        }),
    )
    .await;
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
        "confirmed_elevated_impact":true,"idempotency_key":key
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
    let invitation_query = format!(
        "SELECT content FROM {table} WHERE kind='wedding_boundary_event_invitation' AND content->>'person_id'=$1 ORDER BY COALESCE((content->>'response_revision')::bigint,1) DESC,timestamp DESC,id DESC LIMIT 1"
    );
    let preserved = sqlx::query_scalar::<_, Value>(&invitation_query)
        .bind(&person_b)
        .fetch_one(&db.pool)
        .await
        .expect("preserved invitation");
    assert_eq!(preserved["invitation_id"], invitation_b);
    assert_eq!(preserved["invitation_status"], "rsvp_yes");
    let response_query = format!(
        "SELECT COUNT(*) FROM {table} WHERE kind='wedding_rsvp_response' AND content->>'response_id'=$1"
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(&response_query)
            .bind(response_b)
            .fetch_one(&db.pool)
            .await
            .expect("response history"),
        1
    );
    assert_eq!(response["response_history_preserved"], true);
    assert!(
        response["connected_updates"]
            .as_array()
            .is_some_and(|items| items.iter().any(|item| item == "RSVP history retained"))
    );
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

#[tokio::test]
async fn removing_an_rsvped_guest_requires_confirmation_and_preserves_response_history() {
    let Some(db_url) = test_db_url() else { return };
    let db = Db::new(&db_url).await.expect("connect test database");
    let (owner, auth) = seed_user(&db, "remove-rsvp").await;
    let plan = format!("wedding-plan-{}", Ulid::new());
    let workspace = format!("wedding-workspace-{}", Ulid::new());
    let household = format!("household-{}", Ulid::new());
    let person = format!("person-{}", Ulid::new());
    let invitation = format!("invite-{}", Ulid::new());
    let request_id = format!("remove-request-{}", Ulid::new());
    let response_id = format!("rsvp-response-{}", Ulid::new());
    append_fixture(&db, &owner.id, "wedding_boundary_household", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_household","boundary_object_id":household,"household_id":household,
        "display_name":"Accepted household","status":"active","member_person_ids":[person],"revision":1
    })).await;
    append_fixture(&db, &owner.id, "wedding_boundary_guest_profile", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_guest_profile","boundary_object_id":person,"person_id":person,
        "display_name":"Accepted guest","status":"active","household_id":household
    })).await;
    append_fixture(&db, &owner.id, "wedding_boundary_event_invitation", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_event_invitation","boundary_object_id":invitation,"invitation_id":invitation,
        "event_id":format!("event-{workspace}"),"person_id":person,"invitation_status":"rsvp_yes",
        "visible_to_guest":true,"response_revision":2
    })).await;
    append_fixture(&db, &owner.id, "wedding_rsvp_response", &plan, &workspace, json!({
        "kind":"wedding_rsvp_response","response_id":response_id,"invitation_id":invitation,"person_id":person,
        "attendance":"attending","revision":1,"encrypted_private_payload":"encrypted:v1:not-for-boundary-receipt"
    })).await;
    append_fixture(&db, &owner.id, "wedding_boundary_change_request", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_change_request","boundary_object_id":request_id,"request_id":request_id,
        "requested_by":"family:planner","change_type":"remove_guest","target_person_id":person,
        "request_status":"pending","status":"pending","approval_required":true,"required_approval_count":1,
        "policy_ids":[],"policy_versions":{},"revision":1
    })).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let unconfirmed = json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"request_id":request_id,"decision":"approve",
        "expected_revision":1,"approval_actor_id":null,"confirmed_elevated_impact":false,
        "idempotency_key":format!("remove-unconfirmed-{}",Ulid::new())
    });
    let (blocked_status, blocked) =
        post_json(&app, "/wedding/boundaries/decisions", &auth, unconfirmed).await;
    assert_eq!(
        blocked_status,
        StatusCode::CONFLICT,
        "unconfirmed removal: {blocked}"
    );

    let confirmed = json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"request_id":request_id,"decision":"approve",
        "expected_revision":1,"approval_actor_id":null,"confirmed_elevated_impact":true,
        "idempotency_key":format!("remove-confirmed-{}",Ulid::new())
    });
    let (status, response) = post_json(
        &app,
        "/wedding/boundaries/decisions",
        &auth,
        confirmed.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "confirmed removal: {response}");
    assert_eq!(response["response_history_preserved"], true);
    assert!(
        response["connected_updates"]
            .as_array()
            .is_some_and(|items| items.len() >= 3)
    );
    let (retry_status, retry) =
        post_json(&app, "/wedding/boundaries/decisions", &auth, confirmed).await;
    assert_eq!(retry_status, StatusCode::OK, "retry: {retry}");
    assert_eq!(retry["impact_receipt_id"], response["impact_receipt_id"]);

    let table = format!("\"{}\".messages", tenant_schema(&owner.id));
    let response_count_query = format!(
        "SELECT COUNT(*) FROM {table} WHERE kind='wedding_rsvp_response' AND content->>'response_id'=$1"
    );
    let response_count = sqlx::query_scalar::<_, i64>(&response_count_query)
        .bind(&response_id)
        .fetch_one(&db.pool)
        .await
        .expect("response history count");
    assert_eq!(
        response_count, 1,
        "historical RSVP response must remain immutable"
    );
    let invitation_query = format!(
        "SELECT content FROM {table} WHERE kind='wedding_boundary_event_invitation' AND content->>'person_id'=$1 ORDER BY COALESCE((content->>'response_revision')::bigint,1) DESC,timestamp DESC,id DESC LIMIT 1"
    );
    let latest_invitation = sqlx::query_scalar::<_, Value>(&invitation_query)
        .bind(&person)
        .fetch_one(&db.pool)
        .await
        .expect("latest invitation");
    assert_eq!(latest_invitation["invitation_id"], invitation);
    assert_eq!(latest_invitation["invitation_status"], "declined_by_couple");
    assert_eq!(latest_invitation["previous_invitation_status"], "rsvp_yes");
    let receipt_id = response["impact_receipt_id"].as_str().expect("receipt id");
    let receipt_query = format!(
        "SELECT content FROM {table} WHERE kind='wedding_boundary_impact_receipt' AND content->>'receipt_id'=$1"
    );
    let receipt = sqlx::query_scalar::<_, Value>(&receipt_query)
        .bind(receipt_id)
        .fetch_one(&db.pool)
        .await
        .expect("impact receipt");
    assert_eq!(receipt["response_history_preserved"], true);
    assert_eq!(receipt["previous_invitation_status"], "rsvp_yes");
    assert!(!receipt.to_string().contains("not-for-boundary-receipt"));
}

#[tokio::test]
async fn delegated_access_is_scoped_revocable_and_private_notes_stay_opaque() {
    let Some(db_url) = test_db_url() else { return };
    let db = Db::new(&db_url).await.expect("connect test database");
    let (owner, owner_auth) = seed_user(&db, "delegate-owner").await;
    let (delegate, delegate_auth) = seed_user(&db, "delegate-planner").await;
    let (_outsider, outsider_auth) = seed_user(&db, "delegate-outsider").await;
    let plan = format!("wedding-plan-{}", Ulid::new());
    let workspace = format!("wedding-workspace-{}", Ulid::new());
    let household = format!("household-{}", Ulid::new());
    let person = format!("person-{}", Ulid::new());
    let restricted_marker = "restricted-seating-dietary-contact";
    append_fixture(&db, &owner.id, "wedding_boundary_household", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_household","boundary_object_id":household,"household_id":household,
        "display_name":"Scoped household","title":"Scoped household","status":"active",
        "member_person_ids":[person],"invitation_allocation":2,"revision":1,
        "seating_conflict_reason":restricted_marker
    })).await;
    append_fixture(&db, &owner.id, "wedding_boundary_guest_profile", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_guest_profile","boundary_object_id":person,"person_id":person,
        "display_name":"Scoped guest","title":"Scoped guest","status":"active","household_id":household,
        "dietary_note":restricted_marker,"contact_label":restricted_marker
    })).await;
    append_fixture(&db, &owner.id, "wedding_boundary_event_invitation", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_event_invitation","boundary_object_id":format!("invite-{person}"),
        "invitation_id":format!("invite-{person}"),"event_id":format!("event-{workspace}"),"person_id":person,
        "invitation_status":"not_invited","plus_one_allowed":false,"response_revision":1,
        "seating_conflict_reason":restricted_marker
    })).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    unsafe {
        std::env::remove_var("OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST");
    }
    let grant_body = json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"delegate_email":delegate.email,
        "role":"planner","person_id":null,"household_ids":[household],
        "expires_at":(Utc::now()+Duration::days(2)).to_rfc3339()
    });
    let (disabled_status, _) = post_json(
        &app,
        "/wedding/boundaries/delegates/grants",
        &owner_auth,
        grant_body.clone(),
    )
    .await;
    assert_eq!(disabled_status, StatusCode::NOT_FOUND);
    unsafe {
        std::env::set_var("OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED", "true");
        std::env::set_var(
            "OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST",
            &owner.id,
        );
    }
    let (grant_status, grant) = post_json(
        &app,
        "/wedding/boundaries/delegates/grants",
        &owner_auth,
        grant_body,
    )
    .await;
    assert_eq!(grant_status, StatusCode::OK, "grant: {grant}");
    let grant_id = grant["grant_id"].as_str().expect("grant id");
    let open_uri = format!("/wedding/boundaries/delegates/grants/{grant_id}/open");
    let (open_status, opened) = get_json(&app, &open_uri, &delegate_auth).await;
    assert_eq!(open_status, StatusCode::OK, "open: {opened}");
    assert_eq!(opened["private_notes_visible"], false);
    assert!(opened.get("guests").is_none());
    assert!(!opened.to_string().contains(restricted_marker));
    let (outsider_status, _) = get_json(&app, &open_uri, &outsider_auth).await;
    assert_eq!(outsider_status, StatusCode::NOT_FOUND);

    let proposal_uri = format!("/wedding/boundaries/delegates/grants/{grant_id}/propose");
    let (proposal_status, proposal) = post_json(
        &app,
        &proposal_uri,
        &delegate_auth,
        json!({
            "change_type":"plus_one_change","request_label":"Please allow a plus-one",
            "target_household_id":household,"target_person_id":person,"proposed_guest_name":null,
            "proposed_plus_one_allowed":true,"proposed_invitation_status":null,
            "proposed_contact_label":null,"idempotency_key":format!("proposal-{}",Ulid::new())
        }),
    )
    .await;
    assert_eq!(proposal_status, StatusCode::OK, "proposal: {proposal}");
    assert_eq!(proposal["status"], "pending");
    let request_id = proposal["request_id"].as_str().expect("request id");
    let (delegate_decision_status, _) = post_json(
        &app,
        "/wedding/boundaries/decisions",
        &delegate_auth,
        json!({
            "wedding_plan_id":plan,"response_workspace_id":workspace,"request_id":request_id,
            "decision":"approve","expected_revision":1,"approval_actor_id":null,
            "idempotency_key":format!("forged-delegate-decision-{}",Ulid::new())
        }),
    )
    .await;
    assert_eq!(delegate_decision_status, StatusCode::FORBIDDEN);
    let (decision_status, decision) = post_json(
        &app,
        "/wedding/boundaries/decisions",
        &owner_auth,
        json!({
            "wedding_plan_id":plan,"response_workspace_id":workspace,"request_id":request_id,
            "decision":"approve","expected_revision":1,"approval_actor_id":null,
            "idempotency_key":format!("delegate-decision-{}",Ulid::new())
        }),
    )
    .await;
    assert_eq!(decision_status, StatusCode::OK, "decision: {decision}");

    let ciphertext = "encrypted:v1:opaque-couple-owned-envelope";
    let (note_status, note) = post_json(
        &app,
        "/wedding/boundaries/private-notes",
        &owner_auth,
        json!({
            "wedding_plan_id":plan,"response_workspace_id":workspace,"person_id":person,
            "ciphertext":ciphertext,"expected_version":null,
            "idempotency_key":format!("private-note-{}",Ulid::new())
        }),
    )
    .await;
    assert_eq!(note_status, StatusCode::OK, "private note: {note}");
    let query = format!(
        "/wedding/boundaries/private-notes?wedding_plan_id={plan}&response_workspace_id={workspace}&person_id={person}"
    );
    let (owner_read_status, owner_note) = get_json(&app, &query, &owner_auth).await;
    assert_eq!(owner_read_status, StatusCode::OK);
    assert_eq!(owner_note["ciphertext"], ciphertext);
    let (_, delegate_note) = get_json(&app, &query, &delegate_auth).await;
    assert!(delegate_note["ciphertext"].is_null());
    let table = format!("\"{}\".messages", tenant_schema(&owner.id));
    let leak_query = format!("SELECT COUNT(*) FROM {table} WHERE content::text LIKE $1");
    let leaked = sqlx::query_scalar::<_, i64>(&leak_query)
        .bind(format!("%{ciphertext}%"))
        .fetch_one(&db.pool)
        .await
        .expect("ciphertext leak query");
    assert_eq!(
        leaked, 0,
        "opaque ciphertext must not be copied into AFP events"
    );

    let revoke_uri = format!("/wedding/boundaries/delegates/grants/{grant_id}/revoke");
    let (revoke_status, _) = post_json(&app, &revoke_uri, &owner_auth, json!({})).await;
    assert_eq!(revoke_status, StatusCode::OK);
    let (revoked_status, _) = get_json(&app, &open_uri, &delegate_auth).await;
    assert_eq!(revoked_status, StatusCode::NOT_FOUND);
    sqlx::query("UPDATE wedding_boundary_delegated_grants SET revoked_at=NULL,created_at=NOW()-INTERVAL '2 days',expires_at=NOW()-INTERVAL '1 day' WHERE grant_id=$1")
        .bind(grant_id).execute(&db.pool).await.expect("expire delegated grant");
    let (expired_status, _) = get_json(&app, &open_uri, &delegate_auth).await;
    assert_eq!(expired_status, StatusCode::NOT_FOUND);
    sqlx::query("DELETE FROM users WHERE id=$1")
        .bind(&delegate.id)
        .execute(&db.pool)
        .await
        .expect("delete delegate account");
    let grant_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM wedding_boundary_delegated_grants WHERE grant_id=$1",
    )
    .bind(grant_id)
    .fetch_one(&db.pool)
    .await
    .expect("grant retention count");
    assert_eq!(grant_count, 0, "delegate deletion must cascade its grants");
    sqlx::query("DELETE FROM users WHERE id=$1")
        .bind(&owner.id)
        .execute(&db.pool)
        .await
        .expect("delete owner account");
    let private_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM wedding_boundary_private_notes WHERE owner_user_id=$1",
    )
    .bind(&owner.id)
    .fetch_one(&db.pool)
    .await
    .expect("private-note retention count");
    assert_eq!(
        private_count, 0,
        "account deletion must cascade private boundary notes"
    );
    unsafe {
        std::env::remove_var("OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST");
    }
}

#[tokio::test]
async fn group_plus_one_exceptions_and_last_seat_are_serialized() {
    let Some(db_url) = test_db_url() else { return };
    let db = Db::new(&db_url).await.expect("connect test database");
    let (owner, auth) = seed_user(&db, "capacity-owner").await;
    let (former_representative_account, _) = seed_user(&db, "former-representative").await;
    let plan = format!("wedding-plan-{}", Ulid::new());
    let workspace = format!("wedding-workspace-{}", Ulid::new());
    let household = format!("household-{}", Ulid::new());
    let group = format!("family-group-{}", Ulid::new());
    let person_a = format!("person-a-{}", Ulid::new());
    let person_b = format!("person-b-{}", Ulid::new());
    append_fixture(&db, &owner.id, "wedding_boundary_household", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_household","boundary_object_id":household,"household_id":household,
        "display_name":"Capacity household","title":"Capacity household","status":"active",
        "family_group_id":group,"primary_contact_person_id":person_a,"member_person_ids":[person_a,person_b],"invitation_allocation":3,"revision":1
    })).await;
    for person in [&person_a, &person_b] {
        append_fixture(&db, &owner.id, "wedding_boundary_guest_profile", &plan, &workspace, json!({
            "ledger_kind":"wedding_boundary_guest_profile","boundary_object_id":person,"person_id":person,
            "display_name":"Capacity guest","title":"Capacity guest","status":"active","household_id":household
        })).await;
        append_fixture(&db, &owner.id, "wedding_boundary_event_invitation", &plan, &workspace, json!({
            "ledger_kind":"wedding_boundary_event_invitation","boundary_object_id":format!("invite-{person}"),
            "invitation_id":format!("invite-{person}"),"event_id":format!("event-{workspace}"),"person_id":person,
            "invitation_status":"not_invited","plus_one_allowed":true,"response_revision":1
        })).await;
    }
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let (policy_status, policy) = request_json(&app, &auth, json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"operation":"apply_group_plus_one_policy",
        "source_household_ids":[household],"target_household_id":null,"new_household_id":null,
        "new_household_label":null,"move_person_ids":[],"expected_revisions":{(household.clone()):1},
        "family_group_id":group,"invitation_allocation":null,"representative_person_id":null,
        "plus_one_allowed":false,"exception_person_ids":[person_b],"confirmed_elevated_impact":false,
        "idempotency_key":format!("group-policy-{}",Ulid::new())
    })).await;
    assert_eq!(policy_status, StatusCode::OK, "policy: {policy}");
    let table = format!("\"{}\".messages", tenant_schema(&owner.id));
    let invitation_query = format!(
        "SELECT (content->>'plus_one_allowed')::boolean FROM {table} WHERE kind='wedding_boundary_event_invitation' AND content->>'person_id'=$1 ORDER BY COALESCE((content->>'response_revision')::bigint,1) DESC,timestamp DESC,id DESC LIMIT 1"
    );
    let a_allowed = sqlx::query_scalar::<_, bool>(&invitation_query)
        .bind(&person_a)
        .fetch_one(&db.pool)
        .await
        .expect("person a");
    let b_allowed = sqlx::query_scalar::<_, bool>(&invitation_query)
        .bind(&person_b)
        .fetch_one(&db.pool)
        .await
        .expect("person b");
    assert!(!a_allowed);
    assert!(
        b_allowed,
        "authorised exception must preserve its plus-one state"
    );

    sqlx::query("INSERT INTO wedding_boundary_helper_grants (grant_id,owner_user_id,wedding_plan_id,response_workspace_id,principal_label,household_ids,allowed_actions,token_digest,expires_at) VALUES ($1,$2,$3,$4,'Former representative',$5,$6,$7,NOW()+INTERVAL '2 days')")
        .bind(format!("helper-{}",Ulid::new())).bind(&owner.id).bind(&plan).bind(&workspace)
        .bind(json!([household.clone()])).bind(json!(["view_summary"])).bind("a".repeat(64))
        .execute(&db.pool).await.expect("helper grant fixture");
    sqlx::query("INSERT INTO wedding_boundary_delegated_grants (grant_id,owner_user_id,delegate_user_id,wedding_plan_id,response_workspace_id,role,person_id,household_ids,allowed_actions,expires_at) VALUES ($1,$2,$3,$4,$5,'rsvp_guest',$6,$7,$8,NOW()+INTERVAL '2 days')")
        .bind(format!("delegate-{}",Ulid::new())).bind(&owner.id).bind(&former_representative_account.id)
        .bind(&plan).bind(&workspace).bind(&person_a).bind(json!([household.clone()]))
        .bind(json!(["view_own_invitation"])).execute(&db.pool).await.expect("delegate fixture");
    let (representative_status, representative_response) = request_json(&app, &auth, json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"operation":"change_representative",
        "source_household_ids":[household],"target_household_id":null,"new_household_id":null,
        "new_household_label":null,"move_person_ids":[],"expected_revisions":{(household.clone()):1},
        "family_group_id":null,"invitation_allocation":null,"representative_person_id":person_b,
        "plus_one_allowed":null,"exception_person_ids":[],"confirmed_elevated_impact":false,
        "idempotency_key":format!("representative-{}",Ulid::new())
    })).await;
    assert_eq!(
        representative_status,
        StatusCode::OK,
        "representative: {representative_response}"
    );
    let helper_live = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM wedding_boundary_helper_grants WHERE owner_user_id=$1 AND response_workspace_id=$2 AND revoked_at IS NULL")
        .bind(&owner.id).bind(&workspace).fetch_one(&db.pool).await.expect("helper live count");
    let delegate_live = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM wedding_boundary_delegated_grants WHERE owner_user_id=$1 AND response_workspace_id=$2 AND revoked_at IS NULL")
        .bind(&owner.id).bind(&workspace).fetch_one(&db.pool).await.expect("delegate live count");
    assert_eq!(
        helper_live, 0,
        "representative changes revoke household helper links"
    );
    assert_eq!(
        delegate_live, 0,
        "representative changes revoke the former representative's authenticated grant"
    );

    let request_a = format!("last-seat-a-{}", Ulid::new());
    let request_b = format!("last-seat-b-{}", Ulid::new());
    for (request_id, person_id) in [
        (&request_a, format!("new-a-{}", Ulid::new())),
        (&request_b, format!("new-b-{}", Ulid::new())),
    ] {
        append_fixture(&db, &owner.id, "wedding_boundary_change_request", &plan, &workspace, json!({
            "ledger_kind":"wedding_boundary_change_request","boundary_object_id":request_id,"request_id":request_id,
            "requested_by":"family:helper","change_type":"add_guest","target_household_id":household,
            "target_person_id":person_id,"proposed_guest_name":"Last seat guest","expected_household_revision":2,
            "request_status":"pending","status":"pending","approval_required":true,"required_approval_count":1,"revision":1
        })).await;
    }
    let decision = |request_id: String| {
        json!({
            "wedding_plan_id":plan,"response_workspace_id":workspace,"request_id":request_id,"decision":"approve",
            "expected_revision":1,"approval_actor_id":null,"idempotency_key":format!("capacity-{}",Ulid::new())
        })
    };
    let app_a = app.clone();
    let app_b = app.clone();
    let auth_a = auth.clone();
    let auth_b = auth.clone();
    let (result_a, result_b) = tokio::join!(
        post_json(
            &app_a,
            "/wedding/boundaries/decisions",
            &auth_a,
            decision(request_a)
        ),
        post_json(
            &app_b,
            "/wedding/boundaries/decisions",
            &auth_b,
            decision(request_b)
        )
    );
    let statuses = [result_a.0, result_b.0];
    assert_eq!(
        statuses
            .iter()
            .filter(|status| **status == StatusCode::OK)
            .count(),
        1
    );
    assert_eq!(
        statuses
            .iter()
            .filter(|status| **status == StatusCode::CONFLICT)
            .count(),
        1
    );
}

#[tokio::test]
async fn expired_requests_close_without_mutation_and_access_capabilities_stay_false_default() {
    let Some(db_url) = test_db_url() else { return };
    let db = Db::new(&db_url).await.expect("connect test database");
    let (owner, auth) = seed_user(&db, "expiry-owner").await;
    let plan = format!("wedding-plan-{}", Ulid::new());
    let workspace = format!("wedding-workspace-{}", Ulid::new());
    let household = format!("household-{}", Ulid::new());
    let request_id = format!("request-{}", Ulid::new());
    let proposed_person = format!("person-{}", Ulid::new());
    append_fixture(&db, &owner.id, "wedding_boundary_household", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_household","boundary_object_id":household,"household_id":household,
        "display_name":"Expired request household","title":"Expired request household","status":"active",
        "member_person_ids":[],"invitation_allocation":4,"revision":1
    })).await;
    append_fixture(&db, &owner.id, "wedding_boundary_change_request", &plan, &workspace, json!({
        "ledger_kind":"wedding_boundary_change_request","boundary_object_id":request_id,"request_id":request_id,
        "requested_by":"family:helper","change_type":"add_guest","target_household_id":household,
        "target_person_id":proposed_person,"proposed_guest_name":"Expired guest","expected_household_revision":1,
        "expires_at":(Utc::now()-Duration::days(1)).to_rfc3339(),"request_status":"pending","status":"pending",
        "approval_required":true,"approval_gate_recorded":true,"required_approval_count":1,"revision":1
    })).await;
    let prior_helper = std::env::var_os("OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED");
    let prior_delegate = std::env::var_os("OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED");
    let prior_allowlist = std::env::var_os("OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST");
    unsafe {
        std::env::remove_var("OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED");
        std::env::remove_var("OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST");
    }
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;
    let (capability_status, capabilities) = get_json(&app, "/wedding/boundaries/access/capabilities", &auth).await;
    assert_eq!(capability_status, StatusCode::OK, "capabilities: {capabilities}");
    assert_eq!(capabilities["helper_links_enabled"], false);
    assert_eq!(capabilities["authenticated_delegates_enabled"], false);
    let (status, response) = post_json(&app, "/wedding/boundaries/decisions", &auth, json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"request_id":request_id,"decision":"approve",
        "expected_revision":1,"approval_actor_id":null,"confirmed_elevated_impact":false,
        "idempotency_key":format!("expiry-{}",Ulid::new())
    })).await;
    assert_eq!(status, StatusCode::OK, "expiry: {response}");
    assert_eq!(response["status"], "expired");
    let table = format!("\"{}\".messages", tenant_schema(&owner.id));
    let latest_status = sqlx::query_scalar::<_, String>(&format!(
        "SELECT content->>'request_status' FROM {table} WHERE kind='wedding_boundary_change_request' AND content->>'request_id'=$1 ORDER BY COALESCE((content->>'revision')::bigint,1) DESC,timestamp DESC,id DESC LIMIT 1"
    )).bind(&request_id).fetch_one(&db.pool).await.expect("latest request");
    assert_eq!(latest_status, "expired");
    let created_guests = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM {table} WHERE kind='wedding_boundary_guest_profile' AND content->>'person_id'=$1"
    )).bind(&proposed_person).fetch_one(&db.pool).await.expect("guest count");
    assert_eq!(created_guests, 0, "expiry must not mutate the guest list");
    match prior_helper { Some(value) => unsafe { std::env::set_var("OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED", value) }, None => unsafe { std::env::remove_var("OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED") } }
    match prior_delegate { Some(value) => unsafe { std::env::set_var("OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED", value) }, None => unsafe { std::env::remove_var("OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED") } }
    match prior_allowlist { Some(value) => unsafe { std::env::set_var("OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST", value) }, None => unsafe { std::env::remove_var("OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST") } }
}
