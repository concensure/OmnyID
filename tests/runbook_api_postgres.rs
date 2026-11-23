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
use omnyid_homeserver::{
    runbook_input::InputSupplied, runbook_read::ReadRequest, runbook_runtime::RunbookRuntime,
};
use serde_json::{json, Value};
use tower::ServiceExt;
use ulid::Ulid;

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
    if path.starts_with("/runbooks") {
        assert_eq!(response.headers()["cache-control"], "no-store");
    }
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or_else(|_| json!(String::from_utf8_lossy(&bytes))),
    )
}

async fn start(db: &Db, runtime: &RunbookRuntime<'_, '_>, owner: &str) -> String {
    let event = Ulid::new().to_string();
    db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":event,"type":"workflow_failed","to":[owner],
        "thread_id":"workflow:api","timestamp":Utc::now().to_rfc3339(),"content":{"confidence":0.9,"private_body":"do_not_expose_this_body"}})).await.unwrap();
    let id = runtime
        .dispatch(owner, &event)
        .await
        .unwrap()
        .instance_ids
        .remove(0);
    runtime.start(owner, &id, 1).await.unwrap();
    runtime
        .execute_read(
            owner,
            &id,
            &ReadRequest {
                step_id: "read_context".into(),
                expected_revision: 2,
                snapshot_ref: None,
                decrypt_limit: 4,
                byte_limit: 65536,
            },
        )
        .await
        .unwrap();
    id
}

#[tokio::test]
async fn authenticated_activity_answer_cancel_and_deterministic_completion() {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        return;
    };
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let (alice, auth) = user(&db).await;
    let (bob, bob_auth) = user(&db).await;
    let store = RunbookStore::new(&db, [61; 32], [62; 32]);
    let runtime = RunbookRuntime::new(&store);
    let mut d = starter_definitions().remove(0);
    d.enabled = true;
    d.trigger.event_types = vec!["workflow_failed".into()];
    d.trigger.filters.clear();
    d.steps
        .retain(|s| matches!(s.kind, StepKind::Read | StepKind::Complete));
    d.steps[0].step_id = "read_context".into();
    d.steps[0].required_fields.clear();
    d.steps[0].input_refs = vec!["event.source_refs".into()];
    d.steps[1].input_refs.clear();
    d.steps[1].required_fields = vec!["priority".into()];
    d.escalate_when = vec![EscalationReason::MissingRequiredFact];
    d.success_criteria = vec![Filter {
        path: "instance.outputs.read_context.status".into(),
        op: FilterOp::Eq,
        value: Some(json!("completed")),
    }];
    validate_definition(&d).unwrap();
    let saved = store.save(&alice.id, None, d.clone()).await.unwrap();
    let id = start(&db, &runtime, &alice.id).await;
    let e = runtime
        .request_missing_input(
            &alice.id,
            &id,
            3,
            AnswerSchema::ShortText,
            Utc::now() + Duration::hours(1),
        )
        .await
        .unwrap()
        .unwrap();
    unsafe {
        std::env::set_var("OMNYID_ENCRYPTION_KEY_HEX", hex::encode([61; 32]));
        std::env::set_var("OMNYID_SIGNING_KEY_HEX", hex::encode([62; 32]));
        std::env::remove_var("OMNYID_RUNBOOK_MANAGEMENT_ENABLED");
    }
    let app = omnyid_homeserver::server::build_test_router(&url).await;
    let path = format!("/runbooks/instances/{id}/activity");
    assert_eq!(
        request(&app, "GET", &path, &auth, json!(null)).await.0,
        StatusCode::NOT_FOUND
    );
    unsafe {
        std::env::set_var("OMNYID_RUNBOOK_MANAGEMENT_ENABLED", "true");
    }
    assert_eq!(
        request(&app, "GET", &path, "", json!(null)).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(&app, "GET", &path, &bob_auth, json!(null)).await.0,
        StatusCode::NOT_FOUND
    );
    let (status, activity) = request(&app, "GET", &path, &auth, json!(null)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(activity["questions"].as_array().unwrap().len(), 1);
    assert_eq!(activity["instance"]["status"], "waiting_for_input");
    assert!(activity["views"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v["content"]["kind"] == "runbook_question"));
    let listing = request(&app, "GET", "/runbooks/instances", &auth, json!(null)).await;
    assert_eq!(listing.0, StatusCode::OK);
    assert_eq!(listing.1["activities"].as_array().unwrap().len(), 1);
    assert!(!listing.1.to_string().contains("do_not_expose_this_body"));
    let other_listing = request(&app, "GET", "/runbooks/instances", &bob_auth, json!(null)).await;
    assert_eq!(other_listing.1["activities"], json!([]));

    assert!(!activity.to_string().contains("do_not_expose_this_body"));
    assert!(activity["traces"][0].get("input_hash").is_none());
    let detail = request(
        &app,
        "GET",
        &format!("/runbooks/{}", d.runbook_id),
        &auth,
        json!(null),
    )
    .await;
    assert_eq!(detail.0, StatusCode::OK);
    assert!(detail.1["definition"].get("steps").is_none());
    let input = InputSupplied {
        event_id: Ulid::new().to_string(),
        instance_id: id.clone(),
        escalation_id: e.escalation_id,
        answers: [("priority".into(), json!("do_not_expose_this_answer"))].into(),
    };
    let answer_path = format!("/runbooks/instances/{id}/answers");
    let body = json!({"expected_revision":4,"input":input});
    assert_eq!(
        request(&app, "POST", &answer_path, &bob_auth, body.clone())
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(
            &app,
            "POST",
            &answer_path,
            &auth,
            json!({"expected_revision":4,"input":input,"owner":bob.id})
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let mut bad = body.clone();
    bad["input"]["answers"]["priority"] = json!(true);
    assert_eq!(
        request(&app, "POST", &answer_path, &auth, bad).await.0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        request(&app, "POST", &answer_path, &auth, body.clone())
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        request(&app, "POST", &answer_path, &auth, body).await.0,
        StatusCode::CONFLICT
    );
    let activity = request(&app, "GET", &path, &auth, json!(null)).await.1;
    assert_eq!(activity["questions"][0]["status"], "answered");
    assert!(!activity.to_string().contains("do_not_expose_this_answer"));
    let (a, b) = tokio::join!(
        runtime.complete(&alice.id, &id, 5),
        runtime.complete(&alice.id, &id, 5)
    );
    let trace = a.unwrap();
    assert_eq!(trace, b.unwrap());
    assert_eq!(trace.status, TraceStatus::Completed);
    let outcome_path = format!("/runbooks/instances/{id}/outcomes");
    let body = json!({"trace_id":trace.trace_id,"outcome":"accepted"});
    assert_eq!(
        request(&app, "POST", &outcome_path, &bob_auth, body.clone())
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(&app, "POST", &outcome_path, "", body.clone())
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let saved_outcome = request(&app, "POST", &outcome_path, &auth, body.clone()).await;
    assert_eq!(saved_outcome.0, StatusCode::OK);
    assert_eq!(saved_outcome.1["authority"], "feedback_only");
    assert_eq!(
        request(&app, "POST", &outcome_path, &auth, body.clone()).await,
        saved_outcome
    );
    let mut invalid = body.clone();
    invalid["owner"] = json!(bob.id);
    assert_eq!(
        request(&app, "POST", &outcome_path, &auth, invalid).await.0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        request(
            &app,
            "POST",
            &outcome_path,
            &auth,
            json!({"trace_id":trace.trace_id,"outcome":"approved"})
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );

    assert_eq!(
        runtime
            .instance(&alice.id, &id)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Completed
    );
    assert!(runtime.complete(&bob.id, &id, 5).await.is_err());
    assert!(runtime.complete(&alice.id, &id, 6).await.is_err());
    let cancel_path = format!("/runbooks/instances/{id}/cancel");
    assert_eq!(
        request(
            &app,
            "POST",
            &cancel_path,
            &auth,
            json!({"expected_revision":6})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let cancel_id = start(&db, &runtime, &alice.id).await;
    let cancel_path = format!("/runbooks/instances/{cancel_id}/cancel");
    assert_eq!(
        request(
            &app,
            "POST",
            &cancel_path,
            &bob_auth,
            json!({"expected_revision":3})
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(
            &app,
            "POST",
            &cancel_path,
            &auth,
            json!({"expected_revision":2})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        request(
            &app,
            "POST",
            &cancel_path,
            &auth,
            json!({"expected_revision":3})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        request(
            &app,
            "POST",
            &cancel_path,
            &auth,
            json!({"expected_revision":3})
        )
        .await
        .0,
        StatusCode::OK
    );
    d.steps[1].required_fields.clear();
    d.success_criteria[0].path = "instance.outputs.invented_fact".into();
    d.success_criteria[0].op = FilterOp::Exists;
    d.success_criteria[0].value = None;
    store
        .save(&alice.id, saved["id"].as_str(), d.clone())
        .await
        .unwrap();
    let failed = start(&db, &runtime, &alice.id).await;
    let trace = runtime.complete(&alice.id, &failed, 3).await.unwrap();
    assert_eq!(trace.status, TraceStatus::Failed);
    assert_eq!(
        runtime.complete(&alice.id, &failed, 3).await.unwrap(),
        trace
    );
    assert_eq!(
        runtime
            .instance(&alice.id, &failed)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Failed
    );
    let current = store.registry(&alice.id).await.unwrap();
    let head = current.get(&d.runbook_id).unwrap();
    let toggle_path = format!("/runbooks/{}/enabled", d.runbook_id);
    let toggle = json!({"expected_parent":head.message_id,"enabled":false});
    assert_eq!(
        request(&app, "POST", &toggle_path, &bob_auth, toggle.clone())
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    let disabled = request(&app, "POST", &toggle_path, &auth, toggle.clone()).await;
    assert_eq!(disabled.0, StatusCode::OK);
    assert_eq!(disabled.1["definitions"][0]["enabled"], false);
    assert!(disabled.1["definitions"][0].get("steps").is_none());
    assert_eq!(
        request(&app, "POST", &toggle_path, &auth, toggle).await.0,
        StatusCode::CONFLICT
    );
    let mut review_definition = starter_definitions()
        .into_iter()
        .find(|d| d.runbook_id == "workflow_failure")
        .unwrap();
    review_definition.enabled = true;
    store
        .save(&alice.id, None, review_definition)
        .await
        .unwrap();
    let event = Ulid::new().to_string();
    db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":event,"type":"workflow_failed","to":[alice.id],"thread_id":"workflow:approval","timestamp":Utc::now().to_rfc3339(),"content":{"confidence":0.9,"run_ref":"workflow:failed","error_ref":"message:error","retry_consequences":"unknown"}})).await.unwrap();
    let reviewed = runtime
        .dispatch(&alice.id, &event)
        .await
        .unwrap()
        .instance_ids
        .remove(0);
    runtime.start(&alice.id, &reviewed, 1).await.unwrap();
    runtime
        .execute_read(
            &alice.id,
            &reviewed,
            &ReadRequest {
                step_id: "read".into(),
                expected_revision: 2,
                snapshot_ref: None,
                decrypt_limit: 4,
                byte_limit: 65536,
            },
        )
        .await
        .unwrap();
    runtime
        .execute_transform(&alice.id, &reviewed, "assess", 3)
        .await
        .unwrap();
    let proposal = runtime
        .request_review(&alice.id, &reviewed, "review_consequence", 4)
        .await
        .unwrap();
    let body = json!({"thread_id":format!("runbook:{reviewed}"),"target_message_id":proposal.action_ref,"decision":"approved","decided_by":alice.id,"capability_id":"runbook.review","runbook_revision":5});
    assert_eq!(
        request(&app, "POST", "/actions/decision", "", body.clone())
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    let mut forged = body.clone();
    forged["decided_by"] = json!(bob.id);
    assert!(!request(&app, "POST", "/actions/decision", &auth, forged)
        .await
        .0
        .is_success());
    let mut foreign = body.clone();
    foreign["decided_by"] = json!(bob.id);
    assert!(
        !request(&app, "POST", "/actions/decision", &bob_auth, foreign)
            .await
            .0
            .is_success()
    );
    let stale = Ulid::new().to_string();
    db.create_session(&AuthSessionRecord {
        token: stale.clone(),
        user_id: alice.id.clone(),
        created_at: (Utc::now() - Duration::days(2)).to_rfc3339(),
        expires_at: (Utc::now() + Duration::hours(1)).to_rfc3339(),
    })
    .await
    .unwrap();
    assert!(!request(
        &app,
        "POST",
        "/actions/decision",
        &format!("Bearer {stale}"),
        body.clone()
    )
    .await
    .0
    .is_success());
    let result = request(&app, "POST", "/actions/decision", &auth, body.clone()).await;
    assert_eq!(result.0, StatusCode::OK, "{:?}", result.1);
    assert_eq!(result.1["external_execution_authorized"], false);
    assert_eq!(
        request(&app, "POST", "/actions/decision", &auth, body).await,
        result
    );
    runtime
        .emit_review(&alice.id, &reviewed, "surface", 6)
        .await
        .unwrap();
    runtime.complete(&alice.id, &reviewed, 7).await.unwrap();
    db.delete_user_account_and_data(&alice.id, &alice.email, &[])
        .await
        .unwrap();
    assert!(runtime.activity(&alice.id, &id).await.is_err());
    db.delete_user_account_and_data(&bob.id, &bob.email, &[])
        .await
        .unwrap();
    unsafe {
        std::env::remove_var("OMNYID_RUNBOOK_MANAGEMENT_ENABLED");
    }
}
