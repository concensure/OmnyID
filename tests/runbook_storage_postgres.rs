//! Run with TEST_DATABASE_URL pointing to a disposable local omnyid_test database.
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use chrono::{Duration, Utc};
use http_body_util::BodyExt;
use omnyid_homeserver::{
    db::{AuthSessionRecord, Db, UserRecord},
    runbook_contract::*,
    runbook_starter_pack::*,
    runbook_store::RunbookStore,
    runbook_validation::validate_definition,
};
use serde_json::{Value, json};
use tower::ServiceExt;
use ulid::Ulid;

#[test]
fn reviewed_starters_are_bounded_and_disabled() {
    let starters = starter_definitions();
    assert_eq!(starters.len(), 12);
    for d in &starters {
        validate_definition(d).unwrap();
        assert!(!d.enabled);
        let transform = d
            .steps
            .iter()
            .find(|s| s.kind == StepKind::Transform)
            .unwrap();
        assert!(transform.operation.is_some());
        assert!(!transform.required_fields.is_empty());
        assert!(!d.steps.iter().any(|s| s.kind == StepKind::Tool));
        if d.max_autonomy == MaxAutonomy::ApprovalRequired {
            assert!(d.steps.iter().any(|s| s.kind == StepKind::Approval));
        }
    }
    assert!(selected_starters(&["unknown".into()]).is_err());
    assert!(
        selected_starters(&[
            starters[0].runbook_id.clone(),
            starters[0].runbook_id.clone()
        ])
        .is_err()
    );
    let mut bad = starters[0].clone();
    bad.steps[1].operation = None;
    assert_eq!(
        validate_definition(&bad),
        Err("invalid_transform_operation")
    );
}

async fn user(db: &Db) -> (UserRecord, String) {
    let id = Ulid::new().to_string();
    let user = UserRecord {
        id: id.clone(),
        email: format!("runbook-{id}@omnyid.test"),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Runbook test".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.unwrap();
    let token = Ulid::new().to_string();
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: id,
        created_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + Duration::hours(1)).to_rfc3339(),
    })
    .await
    .unwrap();
    (user, format!("Bearer {token}"))
}

async fn request(
    app: &axum::Router,
    method: &str,
    path: &str,
    auth: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("authorization", auth)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.headers()["cache-control"], "no-store");
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or_else(|_| json!(String::from_utf8_lossy(&bytes))),
    )
}

#[tokio::test]
async fn private_atomic_definition_lifecycle_and_authenticated_management() {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!("SKIP: set TEST_DATABASE_URL for disposable PostgreSQL integration");
        return;
    };
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let (alice, auth) = user(&db).await;
    let (bob, bob_auth) = user(&db).await;
    let store = RunbookStore::new(&db, [11; 32], [12; 32]);
    let selected: Vec<String> = starter_definitions()
        .iter()
        .map(|d| d.runbook_id.clone())
        .collect();
    // Competing setup calls converge on one root per starter, per owner.
    let (a, b) = tokio::join!(
        store.seed(&alice.id, &selected),
        store.seed(&alice.id, &selected)
    );
    assert_eq!(a.unwrap().definitions().count(), 12);
    assert_eq!(b.unwrap().definitions().count(), 12);
    let initial = store.registry(&alice.id).await.unwrap();
    let root = initial.get(&selected[0]).unwrap();
    let bob_registry = store.seed(&bob.id, &selected).await.unwrap();
    assert_ne!(
        root.message_id,
        bob_registry.get(&selected[0]).unwrap().message_id
    );
    let mut edited = root.definition.clone();
    edited.name = "private_owner_edit_do_not_index".into();
    edited.enabled = true;
    let mut competing = edited.clone();
    competing.name = "competing_edit".into();
    let (a, b) = tokio::join!(
        store.save(&alice.id, Some(&root.message_id), edited.clone()),
        store.save(&alice.id, Some(&root.message_id), competing.clone())
    );
    assert_ne!(a.is_ok(), b.is_ok());
    let (saved, original) = if let Ok(value) = a {
        assert_eq!(b.unwrap_err(), "stale_definition");
        (value, edited)
    } else {
        (b.unwrap(), competing)
    };
    let id = saved["id"].as_str().unwrap();
    let retry = store
        .save(&alice.id, Some(&root.message_id), original.clone())
        .await
        .unwrap();
    assert_eq!(retry["id"], id);
    let reseeded = store.seed(&alice.id, &selected).await.unwrap();
    assert_eq!(
        reseeded.get(&selected[0]).unwrap().definition.name,
        original.name
    );
    assert!(reseeded.get(&selected[0]).unwrap().definition.enabled);
    // A sibling owner's parent cannot be used to edit this history.
    assert_eq!(
        store
            .save(
                &alice.id,
                Some(&bob_registry.get(&selected[0]).unwrap().message_id),
                original.clone()
            )
            .await
            .unwrap_err(),
        "stale_definition"
    );
    let mut disabled = reseeded.get(&selected[0]).unwrap().definition.clone();
    disabled.enabled = false;
    let disabled_record = store
        .save(&alice.id, Some(id), disabled.clone())
        .await
        .unwrap();
    assert!(
        !store
            .seed(&alice.id, &selected)
            .await
            .unwrap()
            .get(&selected[0])
            .unwrap()
            .definition
            .enabled
    );
    assert_eq!(
        store
            .save(&alice.id, Some(&root.message_id), original)
            .await
            .unwrap()["id"],
        id
    );
    assert_eq!(
        store
            .registry(&bob.id)
            .await
            .unwrap()
            .get(&selected[0])
            .unwrap()
            .definition
            .version,
        1
    );
    let table = format!("\"user_{}\".messages", alice.id.to_lowercase());
    let count: i64 = sqlx::query_scalar(&format!(
        "SELECT count(*) FROM {table} WHERE type='runbook_definition'"
    ))
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(count, 14);
    let stored: Vec<Value> = sqlx::query_scalar(&format!("SELECT to_jsonb(m) FROM {table} m"))
        .fetch_all(&db.pool)
        .await
        .unwrap();
    for row in &stored {
        assert_eq!(row["content"], json!({}));
        assert_eq!(row["encryption"]["scheme"], "omnyid-envelope-v1");
        assert!(!row.to_string().contains("private_owner_edit_do_not_index"));
        assert!(!row.to_string().contains("competing_edit"));
    }
    assert!(
        RunbookStore::new(&db, [99; 32], [12; 32])
            .registry(&alice.id)
            .await
            .is_err()
    );
    assert!(
        RunbookStore::new(&db, [11; 32], [99; 32])
            .registry(&alice.id)
            .await
            .is_err()
    );

    // All management derives the owner from the session and is absent by default.
    unsafe {
        std::env::remove_var("OMNYID_RUNBOOK_MANAGEMENT_ENABLED");
        std::env::set_var("OMNYID_ENCRYPTION_KEY_HEX", hex::encode([11; 32]));
        std::env::set_var("OMNYID_SIGNING_KEY_HEX", hex::encode([12; 32]));
    }
    let app = omnyid_homeserver::server::build_test_router(&url).await;
    assert_eq!(
        request(&app, "GET", "/runbooks", &auth, json!(null))
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    unsafe {
        std::env::set_var("OMNYID_RUNBOOK_MANAGEMENT_ENABLED", "true");
    }
    assert_eq!(
        request(&app, "GET", "/runbooks", "", json!(null)).await.0,
        StatusCode::UNAUTHORIZED
    );
    let (status, body) = request(&app, "GET", "/runbooks", &auth, json!(null)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["definitions"].as_array().unwrap().len(), 12);
    assert_eq!(body["execution_available"], false);
    assert_eq!(
        request(
            &app,
            "POST",
            "/runbooks/setup",
            &auth,
            json!({"selected":selected,"owner":bob.id})
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let path = format!("/runbooks/{}/upgrade-preview", selected[0]);
    let (status, preview) = request(&app, "GET", &path, &auth, json!(null)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(preview["applied"], false);
    assert_eq!(preview["current"]["version"], 3);
    assert_eq!(preview["proposed"]["version"], 4);
    assert_eq!(preview["proposed"]["enabled"], false);
    assert_eq!(
        store
            .registry(&alice.id)
            .await
            .unwrap()
            .get(&selected[0])
            .unwrap()
            .definition
            .version,
        3
    );
    let path = format!("/runbooks/{}/definition", selected[0]);
    let body = json!({"expected_parent":disabled_record["id"],"definition":preview["proposed"]});
    assert_eq!(
        request(&app, "PUT", &path, &bob_auth, body.clone()).await.0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        request(&app, "PUT", &path, &auth, body.clone()).await.0,
        StatusCode::OK
    );
    assert_eq!(
        request(&app, "PUT", &path, &auth, body).await.0,
        StatusCode::OK
    );
    let latest = store.registry(&alice.id).await.unwrap();
    let latest = latest.get(&selected[0]).unwrap();
    let mut archived = latest.definition.clone();
    archived.status = DefinitionStatus::Archived;
    let archived_record = store
        .save(&alice.id, Some(&latest.message_id), archived)
        .await
        .unwrap();
    assert_eq!(
        store
            .seed(&alice.id, &selected)
            .await
            .unwrap()
            .get(&selected[0])
            .unwrap()
            .definition
            .status,
        DefinitionStatus::Archived
    );
    assert_eq!(
        store
            .save(
                &alice.id,
                Some(archived_record["id"].as_str().unwrap()),
                disabled
            )
            .await
            .unwrap_err(),
        "invalid_successor"
    );
    // Metadata forgery must fail signature verification rather than change the projection.
    sqlx::query(&format!(
        "UPDATE {table} SET metadata=jsonb_set(metadata,'{{enabled}}','true') WHERE id=$1"
    ))
    .bind(archived_record["id"].as_str().unwrap())
    .execute(&db.pool)
    .await
    .unwrap();
    assert!(store.registry(&alice.id).await.is_err());
    db.delete_user_account_and_data(&alice.id, &alice.email, &[])
        .await
        .unwrap();
    assert_eq!(
        store.seed(&alice.id, &selected).await.unwrap_err(),
        "owner_not_found"
    );
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1)")
            .bind(format!("user_{}", alice.id.to_lowercase()))
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert!(!exists);
    assert_eq!(
        store.registry(&bob.id).await.unwrap().definitions().count(),
        12
    );
    db.delete_user_account_and_data(&bob.id, &bob.email, &[])
        .await
        .unwrap();
    unsafe {
        std::env::remove_var("OMNYID_RUNBOOK_MANAGEMENT_ENABLED");
    }
}
