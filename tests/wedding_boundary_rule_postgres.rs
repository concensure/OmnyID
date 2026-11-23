//! Disposable-Postgres evidence for versioned Family Boundary rule commands.
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

async fn seed_user(db: &Db) -> (UserRecord, String) {
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: format!("boundary-rule-{suffix}@omnyid.test"),
        password_hash: Some("integration-test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Boundary Rule Owner".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let token = format!("boundary_rule_session_{suffix}");
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
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata,\"references\",supertags) VALUES ($1,$2,'test://family-boundary-rule',$3,NOW(),'ledger',$4,$4,$5,'test',TRUE,$6,'[]'::jsonb,$7)"
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

async fn post(app: &Router, auth: &str, body: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/wedding/boundaries/rules/commands")
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

async fn seed_scope(db: &Db, owner: &UserRecord, plan: &str, workspace: &str) -> (String, String) {
    let household = format!("household-{}", Ulid::new());
    let person = format!("person-{}", Ulid::new());
    let invitation = format!("invitation-{}", Ulid::new());
    append_fixture(db, &owner.id, "wedding_boundary_household", plan, workspace, json!({
        "ledger_kind":"wedding_boundary_household","boundary_object_id":household,"household_id":household,
        "display_name":"Rivera household","title":"Rivera household","status":"active","member_person_ids":[person],"revision":1
    })).await;
    append_fixture(db, &owner.id, "wedding_boundary_guest_profile", plan, workspace, json!({
        "ledger_kind":"wedding_boundary_guest_profile","boundary_object_id":person,"person_id":person,
        "display_name":"Alex Rivera","title":"Alex Rivera","status":"active","household_id":household,
        "dietary_note":"must never enter a rule receipt","contact_label":"private@example.test"
    })).await;
    append_fixture(db, &owner.id, "wedding_boundary_event_invitation", plan, workspace, json!({
        "ledger_kind":"wedding_boundary_event_invitation","boundary_object_id":invitation,"invitation_id":invitation,
        "event_id":format!("event-{workspace}"),"person_id":person,"invitation_status":"rsvp_yes","response_revision":2
    })).await;
    (household, person)
}

async fn seed_rule(db: &Db, owner: &UserRecord, plan: &str, workspace: &str, rule: &str) {
    append_fixture(db, &owner.id, "wedding_boundary_policy", plan, workspace, json!({
        "ledger_kind":"wedding_boundary_policy","boundary_object_id":rule,"title":"Named guests only","status":"active",
        "visibility":"family_visible","rule_type":"invitation_scope","enforcement":"require_approval",
        "plain_language":"Changes to named guests need couple approval.","scope_kind":"wedding","scope_id":null,
        "effect":"require_approval","authority":"couple","rule_status":"active","version":1,
        "private_rationale_encrypted":false
    })).await;
}

#[tokio::test]
async fn rule_archive_and_replacement_are_confirmed_versioned_retry_safe_and_private() {
    let Some(db_url) = test_db_url() else { return };
    let db = Db::new(&db_url).await.expect("connect test database");
    let (owner, auth) = seed_user(&db).await;
    let plan = format!("wedding-plan-{}", Ulid::new());
    let workspace = format!("wedding-workspace-{}", Ulid::new());
    let (_household, _person) = seed_scope(&db, &owner, &plan, &workspace).await;
    let archived_rule = format!("rule-archive-{}", Ulid::new());
    seed_rule(&db, &owner, &plan, &workspace, &archived_rule).await;
    let app = omnyid_homeserver::server::build_test_router(&db_url).await;

    let archive_key = format!("archive-{}", Ulid::new());
    let archive = json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"operation":"archive_rule",
        "rule_id":archived_rule,"expected_version":1,"replacement":null,
        "confirmed_elevated_impact":false,"idempotency_key":archive_key
    });
    let (unconfirmed_status, _) = post(&app, &auth, archive.clone()).await;
    assert_eq!(unconfirmed_status, StatusCode::CONFLICT);
    let mut confirmed_archive = archive;
    confirmed_archive["confirmed_elevated_impact"] = json!(true);
    let (archive_status, archive_response) = post(&app, &auth, confirmed_archive.clone()).await;
    assert_eq!(
        archive_status,
        StatusCode::OK,
        "archive: {archive_response}"
    );
    assert_eq!(archive_response["response_history_preserved"], true);
    let (retry_status, retry) = post(&app, &auth, confirmed_archive).await;
    assert_eq!(retry_status, StatusCode::OK);
    assert_eq!(
        retry["impact_receipt_id"],
        archive_response["impact_receipt_id"]
    );

    let replaced_rule = format!("rule-replace-{}", Ulid::new());
    seed_rule(&db, &owner, &plan, &workspace, &replaced_rule).await;
    let replace = json!({
        "wedding_plan_id":plan,"response_workspace_id":workspace,"operation":"supersede_rule",
        "rule_id":replaced_rule,"expected_version":1,"confirmed_elevated_impact":true,
        "idempotency_key":format!("replace-{}", Ulid::new()),
        "replacement":{
            "title":"Named guests and approved changes","plain_language":"Named guest changes need either partner to approve.",
            "rule_type":"invitation_scope","scope_kind":"wedding","scope_id":null,
            "effect":"require_approval","authority":"couple","effective_until":null
        }
    });
    let (replace_status, replace_response) = post(&app, &auth, replace).await;
    assert_eq!(
        replace_status,
        StatusCode::OK,
        "replace: {replace_response}"
    );
    assert!(
        replace_response["replacement_rule_id"]
            .as_str()
            .is_some_and(|id| !id.is_empty())
    );

    let table = format!("\"{}\".messages", tenant_schema(&owner.id));
    let policy_query = format!(
        "SELECT content FROM {table} WHERE kind='wedding_boundary_policy' AND content->>'boundary_object_id'=$1 ORDER BY COALESCE((content->>'version')::bigint,1) DESC,timestamp DESC,id DESC LIMIT 1"
    );
    let archived = sqlx::query_scalar::<_, Value>(&policy_query)
        .bind(&archived_rule)
        .fetch_one(&db.pool)
        .await
        .expect("archived policy");
    assert_eq!(archived["version"], 2);
    assert_eq!(archived["rule_status"], "archived");
    let superseded = sqlx::query_scalar::<_, Value>(&policy_query)
        .bind(&replaced_rule)
        .fetch_one(&db.pool)
        .await
        .expect("superseded policy");
    assert_eq!(superseded["version"], 2);
    assert_eq!(superseded["rule_status"], "superseded");
    let receipt_query = format!(
        "SELECT content FROM {table} WHERE kind='wedding_boundary_impact_receipt' AND content->>'receipt_id'=$1"
    );
    let receipt = sqlx::query_scalar::<_, Value>(&receipt_query)
        .bind(
            archive_response["impact_receipt_id"]
                .as_str()
                .expect("receipt id"),
        )
        .fetch_one(&db.pool)
        .await
        .expect("impact receipt");
    assert_eq!(receipt["invitation_sent"], false);
    assert_eq!(receipt["attendance_inferred"], false);
    assert_eq!(receipt["private_content_copied"], false);
    assert!(!receipt.to_string().contains("private@example.test"));
    assert!(!receipt.to_string().contains("must never enter"));
}
