use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::{
    db::{AuthSessionRecord, Db, UserRecord},
    runbook_contract::*,
    runbook_hooks::{HookPolicy, maintenance_pass},
    runbook_runtime::RunbookRuntime,
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
};
use serde_json::{Value, json};
use tower::ServiceExt;
use ulid::Ulid;

async fn user(db: &Db) -> (String, String, String) {
    let id = Ulid::new().to_string();
    let email = format!("hooks-{id}@omnyid.test");
    db.create_user(&UserRecord {
        id: id.clone(),
        email: email.clone(),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Hooks".into(),
        created_at: Utc::now().to_rfc3339(),
    })
    .await
    .unwrap();
    let token = Ulid::new().to_string();
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: id.clone(),
        created_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + Duration::hours(1)).to_rfc3339(),
    })
    .await
    .unwrap();
    (id, email, token)
}

#[tokio::test]
async fn persisted_hooks_are_opt_in_owner_scoped_idempotent_and_share_due_pass() {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        return;
    };
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let (owner, email, token) = user(&db).await;
    let (other, other_email, _) = user(&db).await;
    let store = RunbookStore::new(&db, [71; 32], [72; 32]);
    let runtime = RunbookRuntime::new(&store);
    let mut d = starter_definitions().remove(0);
    d.enabled = true;
    d.trigger.event_types = vec!["runbook_test_event".into(), "watcher_alert".into()];
    d.trigger.filters.clear();
    d.steps
        .retain(|s| matches!(s.kind, StepKind::Wait | StepKind::Complete));
    for step in &mut d.steps {
        step.input_refs.clear();
        step.required_fields.clear();
    }
    store.save(&owner, None, d.clone()).await.unwrap();
    store.save(&other, None, d).await.unwrap();
    unsafe {
        std::env::set_var("OMNYID_ENCRYPTION_KEY_HEX", hex::encode([71; 32]));
        std::env::set_var("OMNYID_SIGNING_KEY_HEX", hex::encode([72; 32]));
        std::env::set_var("OMNYID_RUNBOOK_ALLOWLIST", &owner);
        std::env::remove_var("OMNYID_RUNBOOK_EVENT_HOOKS_ENABLED");
        std::env::remove_var("OMNYID_RUNBOOK_FOLLOW_UPS_ENABLED");
    }
    assert!(!HookPolicy::from_env().event_allowed(&owner, "watcher_alert"));
    let event = |owner: &str| {
        json!({"protocol":"afp-v1","id":Ulid::new().to_string(),
        "type":"watcher_alert","to":[owner],"thread_id":"watcher:test",
        "timestamp":Utc::now().to_rfc3339(),"content":{"confidence":0.9}})
    };
    let stored = event(&owner);
    db.insert_daemon_afp_message(&stored).await.unwrap();
    assert_eq!(
        runtime.activities(&owner).await.unwrap()["activities"],
        json!([])
    );
    unsafe {
        std::env::set_var("OMNYID_RUNBOOK_EVENT_HOOKS_ENABLED", "true");
    }
    assert!(!HookPolicy::from_env().event_allowed(&other, "watcher_alert"));
    assert!(!HookPolicy::from_env().event_allowed(&owner, "runbook_follow_up"));
    db.insert_daemon_afp_message(&stored).await.unwrap(); // duplicate persisted source retries matching
    db.insert_daemon_afp_message(&stored).await.unwrap();
    assert_eq!(
        runtime.activities(&owner).await.unwrap()["activities"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    db.insert_daemon_afp_message(&event(&other)).await.unwrap();
    assert_eq!(
        runtime.activities(&other).await.unwrap()["activities"],
        json!([])
    );
    let receipt = runtime
        .dispatch(&owner, stored["id"].as_str().unwrap())
        .await
        .unwrap();
    let id = &receipt.instance_ids[0];
    assert_eq!(
        runtime.instance(&owner, id).await.unwrap().instance.status,
        InstanceState::Matched
    );
    runtime.start(&owner, id, 1).await.unwrap();
    runtime
        .schedule_wait(
            &owner,
            id,
            2,
            Utc::now() + Duration::seconds(1),
            Utc::now() + Duration::hours(1),
        )
        .await
        .unwrap();
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    assert_eq!(maintenance_pass(&db).await, (0, 0));
    unsafe {
        std::env::set_var("OMNYID_RUNBOOK_FOLLOW_UPS_ENABLED", "true");
    }
    assert_eq!(maintenance_pass(&db).await, (1, 0));
    assert_eq!(maintenance_pass(&db).await, (0, 0));
    assert_eq!(
        runtime.instance(&owner, id).await.unwrap().instance.status,
        InstanceState::Running
    );

    // Real passive HTTP route persists event_type and bridges the authenticated owner.
    let app = omnyid_homeserver::server::build_test_router(&url).await;
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/events/passive")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({"event_type":"runbook_test_event","source":"workflow",
            "event_at":Utc::now().to_rfc3339(),"metadata":{"private_body":"private_ingress_body"}})
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let value: Value = serde_json::from_slice(&bytes).unwrap();
    let event_id = value["event_afp_id"].as_str().unwrap();
    let persisted: Value =
        sqlx::query_scalar("SELECT payload FROM afp_messages WHERE owner_user_id=$1 AND id=$2")
            .bind(&owner)
            .bind(event_id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(persisted["content"]["event_type"], "runbook_test_event");
    assert!(!persisted.to_string().contains("private_ingress_body"));
    assert!(persisted.get("signature").is_none());
    assert_eq!(
        runtime.activities(&owner).await.unwrap()["activities"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let receipt = runtime.dispatch(&owner, event_id).await.unwrap();
    assert_eq!(
        runtime
            .instance(&owner, &receipt.instance_ids[0])
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Matched
    );
    // A corrupted allowlist disables both hooks rather than widening scope.
    unsafe {
        std::env::set_var("OMNYID_RUNBOOK_ALLOWLIST", "bad/owner");
    }
    assert!(!HookPolicy::from_env().events);
    assert_eq!(maintenance_pass(&db).await, (0, 0));
    unsafe {
        std::env::remove_var("OMNYID_RUNBOOK_EVENT_HOOKS_ENABLED");
        std::env::remove_var("OMNYID_RUNBOOK_FOLLOW_UPS_ENABLED");
        std::env::remove_var("OMNYID_RUNBOOK_ALLOWLIST");
    }
    db.delete_user_account_and_data(&owner, &email, &[])
        .await
        .unwrap();
    db.delete_user_account_and_data(&other, &other_email, &[])
        .await
        .unwrap();
}
