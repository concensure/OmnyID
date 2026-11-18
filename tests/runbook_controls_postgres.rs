//! Actual private-ledger transactions; no external providers or live daemon.
use chrono::{Duration, Utc};
use omnyid_homeserver::{
    db::{Db, UserRecord},
    runbook_contract::*,
    runbook_input::{InputSupplied, validate_answer},
    runbook_read::ReadRequest,
    runbook_runtime::RunbookRuntime,
    runbook_schedule::ScheduleStatus,
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
};
use serde_json::{Value, json};
use ulid::Ulid;

async fn database() -> Option<Db> {
    let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!("SKIP: TEST_DATABASE_URL required");
        return None;
    };
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    Some(Db::new(&url).await.unwrap())
}
async fn user(db: &Db) -> String {
    let id = Ulid::new().to_string();
    db.create_user(&UserRecord {
        id: id.clone(),
        email: format!("control-{id}@omnyid.test"),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Control".into(),
        created_at: Utc::now().to_rfc3339(),
    })
    .await
    .unwrap();
    id
}
async fn instance(db: &Db, runtime: &RunbookRuntime<'_, '_>, owner: &str, extra: Value) -> String {
    let event = Ulid::new().to_string();
    let mut content = json!({"confidence":0.9});
    content
        .as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    db.insert_daemon_afp_message(
        &json!({"protocol":"afp-v1","id":event,"type":"workflow_failed","to":[owner],
        "thread_id":"workflow:controls","timestamp":Utc::now().to_rfc3339(),"content":content}),
    )
    .await
    .unwrap();
    let id = runtime
        .dispatch(owner, &event)
        .await
        .unwrap()
        .instance_ids
        .remove(0);
    runtime.start(owner, &id, 1).await.unwrap();
    id
}
fn definition(wait: bool) -> RunbookDefinition {
    let mut d = starter_definitions().remove(0);
    d.enabled = true;
    d.trigger.event_types = vec!["workflow_failed".into()];
    d.trigger.filters.clear();
    d.steps.retain(|s| {
        if wait {
            matches!(s.kind, StepKind::Wait | StepKind::Complete)
        } else {
            matches!(
                s.kind,
                StepKind::Read | StepKind::Transform | StepKind::Complete
            )
        }
    });
    for s in &mut d.steps {
        s.input_refs.clear();
        s.required_fields.clear();
    }
    if !wait {
        d.steps[0].input_refs = vec!["event.source_refs".into()];
        d.steps[1].required_fields = vec!["priority".into()];
    }
    d.escalate_when = vec![EscalationReason::MissingRequiredFact];
    d
}
async fn read(runtime: &RunbookRuntime<'_, '_>, owner: &str, id: &str) {
    let step = runtime
        .instance(owner, id)
        .await
        .unwrap()
        .instance
        .current_step_id
        .unwrap();
    runtime
        .execute_read(
            owner,
            id,
            &ReadRequest {
                step_id: step,
                expected_revision: 2,
                snapshot_ref: None,
                decrypt_limit: 4,
                byte_limit: 65536,
            },
        )
        .await
        .unwrap();
}
fn answer(id: &str, e: &EpistemicEscalation, value: Value) -> InputSupplied {
    InputSupplied {
        event_id: Ulid::new().to_string(),
        instance_id: id.into(),
        escalation_id: e.escalation_id.clone(),
        answers: [("priority".into(), value)].into(),
    }
}

#[test]
fn strict_answer_schemas_and_closed_events() {
    for (schema, good, bad) in [
        (AnswerSchema::Boolean, json!(false), json!("false")),
        (AnswerSchema::Date, json!("2028-02-29"), json!("2027-02-29")),
        (
            AnswerSchema::ShortText,
            json!("Keep the ceremony"),
            json!(" "),
        ),
        (AnswerSchema::NonNegativeNumber, json!(0), json!(-1)),
    ] {
        assert!(validate_answer(schema, &good).is_ok());
        assert!(validate_answer(schema, &bad).is_err());
    }
    for bad in [
        json!(null),
        json!({"tool":"send"}),
        json!(["x"]),
        json!("x".repeat(513)),
        json!("hidden\ncommand"),
    ] {
        assert!(validate_answer(AnswerSchema::ShortText, &bad).is_err());
    }
    assert!(serde_json::from_value::<InputSupplied>(json!({"event_id":"x","instance_id":"i","escalation_id":"e","answers":{"priority":"high"},"approval":true})).is_err());
}

#[tokio::test]
async fn missing_facts_questions_answer_resume_and_isolation() {
    let Some(db) = database().await else {
        return;
    };
    let alice = user(&db).await;
    let bob = user(&db).await;
    let store = RunbookStore::new(&db, [51; 32], [52; 32]);
    let runtime = RunbookRuntime::new(&store);
    store.save(&alice, None, definition(false)).await.unwrap();
    let id = instance(&db, &runtime, &alice, json!({})).await;
    read(&runtime, &alice, &id).await;
    let expiry = Utc::now() + Duration::hours(1);
    let (a, b) = tokio::join!(
        runtime.request_missing_input(&alice, &id, 3, AnswerSchema::ShortText, expiry),
        runtime.request_missing_input(&alice, &id, 3, AnswerSchema::ShortText, expiry)
    );
    let e = a.unwrap().unwrap();
    assert_eq!(Some(e.clone()), b.unwrap());
    assert_eq!(e.missing_fields, vec!["priority"]);
    assert_eq!(e.attempted_refs.len(), 1);
    assert!(e.question.contains("priority"));
    assert!(!e.why_needed.is_empty());
    let current = runtime.instance(&alice, &id).await.unwrap().instance;
    assert_eq!(current.status, InstanceState::WaitingForInput);
    assert_eq!(current.revision, 4);
    assert!(runtime.start(&alice, &id, 4).await.is_err());
    assert!(
        runtime
            .request_missing_input(&alice, &id, 4, AnswerSchema::Boolean, expiry)
            .await
            .is_err()
    );
    let good = answer(&id, &e, json!("ceremony first"));
    assert!(runtime.supply_input(&bob, &good, 4).await.is_err());
    assert!(
        runtime
            .supply_input(&alice, &answer(&id, &e, json!(true)), 4)
            .await
            .is_err()
    );
    let mut extra = good.clone();
    extra.answers.insert("tool".into(), json!("send"));
    assert!(runtime.supply_input(&alice, &extra, 4).await.is_err());
    assert!(runtime.supply_input(&alice, &good, 3).await.is_err());
    let other = instance(&db, &runtime, &alice, json!({})).await;
    read(&runtime, &alice, &other).await;
    runtime
        .request_missing_input(&alice, &other, 3, AnswerSchema::ShortText, expiry)
        .await
        .unwrap();
    let mut wrong = good.clone();
    wrong.instance_id = other.clone();
    assert!(runtime.supply_input(&alice, &wrong, 4).await.is_err());
    let (a, b) = tokio::join!(
        runtime.supply_input(&alice, &good, 4),
        runtime.supply_input(&alice, &good, 4)
    );
    assert_ne!(a.is_ok(), b.is_ok());
    let resumed = runtime.instance(&alice, &id).await.unwrap().instance;
    assert_eq!(resumed.status, InstanceState::Running);
    assert_eq!(resumed.revision, 5);
    assert_eq!(resumed.current_step_id, current.current_step_id);
    assert_eq!(resumed.completed_step_ids, current.completed_step_ids);
    assert_eq!(
        runtime.supplied_inputs(&alice, &id).await.unwrap(),
        vec![good.clone()]
    );
    assert!(runtime.supply_input(&alice, &good, 5).await.is_err());
    assert_eq!(
        runtime
            .request_missing_input(&alice, &id, 5, AnswerSchema::ShortText, expiry)
            .await
            .unwrap()
            .unwrap()
            .status,
        EscalationStatus::Answered
    );
    runtime.cancel(&alice, &other, 4).await.unwrap();
    assert!(runtime.supply_input(&alice, &wrong, 5).await.is_err());
    assert_eq!(
        runtime
            .request_missing_input(&alice, &other, 5, AnswerSchema::ShortText, expiry)
            .await
            .unwrap()
            .unwrap()
            .status,
        EscalationStatus::Cancelled
    );
    let known = instance(&db, &runtime, &alice, json!({"priority":false})).await;
    read(&runtime, &alice, &known).await;
    assert!(
        runtime
            .request_missing_input(&alice, &known, 3, AnswerSchema::Boolean, expiry)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        runtime
            .instance(&alice, &known)
            .await
            .unwrap()
            .instance
            .revision,
        3
    );
    // At rest neither answers nor the question are copied into plaintext fields.
    let table = format!("\"user_{}\".messages", alice.to_lowercase());
    let rows:Vec<(Value,Value)>=sqlx::query_as(&format!("SELECT content,metadata FROM {table} WHERE type IN ('epistemic_escalation','runbook_input_supplied')")).fetch_all(&db.pool).await.unwrap();
    assert!(!rows.is_empty());
    for (content, metadata) in rows {
        assert_eq!(content, json!({}));
        assert!(!metadata.to_string().contains("ceremony"));
    }
    db.delete_user_account_and_data(&alice).await.unwrap();
    assert!(runtime.supplied_inputs(&alice, &id).await.is_err());
    db.delete_user_account_and_data(&bob).await.unwrap();
}

#[tokio::test]
async fn question_expiry_rejects_late_answers_and_terminal_resume() {
    let Some(db) = database().await else {
        return;
    };
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [53; 32], [54; 32]);
    let runtime = RunbookRuntime::new(&store);
    store.save(&owner, None, definition(false)).await.unwrap();
    let id = instance(&db, &runtime, &owner, json!({})).await;
    read(&runtime, &owner, &id).await;
    assert!(
        runtime
            .request_missing_input(
                &owner,
                &id,
                3,
                AnswerSchema::Date,
                Utc::now() - Duration::seconds(1)
            )
            .await
            .is_err()
    );
    let expiry = Utc::now() + Duration::seconds(2);
    let e = runtime
        .request_missing_input(&owner, &id, 3, AnswerSchema::Date, expiry)
        .await
        .unwrap()
        .unwrap();
    assert!(
        runtime
            .expire_input(&owner, &id, &e.escalation_id, 4)
            .await
            .is_err()
    );
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    assert_eq!(
        runtime
            .supply_input(&owner, &answer(&id, &e, json!("2027-01-01")), 4)
            .await
            .unwrap_err(),
        "answer_expired"
    );
    let failed = runtime
        .expire_input(&owner, &id, &e.escalation_id, 4)
        .await
        .unwrap();
    assert_eq!(failed.instance.status, InstanceState::Failed);
    assert!(
        runtime
            .supply_input(&owner, &answer(&id, &e, json!("2027-01-01")), 5)
            .await
            .is_err()
    );
    assert_eq!(
        runtime
            .request_missing_input(&owner, &id, 5, AnswerSchema::Date, expiry)
            .await
            .unwrap()
            .unwrap()
            .status,
        EscalationStatus::Expired
    );
    db.delete_user_account_and_data(&owner).await.unwrap();
}

#[tokio::test]
async fn follow_up_due_reschedule_cancel_delivery_retry_and_erasure() {
    let Some(db) = database().await else {
        return;
    };
    let owner = user(&db).await;
    let other = user(&db).await;
    let store = RunbookStore::new(&db, [55; 32], [56; 32]);
    let runtime = RunbookRuntime::new(&store);
    store.save(&owner, None, definition(true)).await.unwrap();
    let id = instance(&db, &runtime, &owner, json!({})).await;
    let due = Utc::now() + Duration::hours(1);
    let expiry = due + Duration::hours(1);
    let (a, b) = tokio::join!(
        runtime.schedule_wait(&owner, &id, 2, due, expiry),
        runtime.schedule_wait(&owner, &id, 2, due, expiry)
    );
    let root = a.unwrap();
    assert_eq!(root, b.unwrap());
    assert!(runtime.due_schedules(&owner, 10).await.unwrap().is_empty());
    assert!(
        runtime
            .deliver_follow_up(&owner, &id, &root.message_id)
            .await
            .is_err()
    );
    assert!(
        runtime
            .deliver_follow_up(&other, &id, &root.message_id)
            .await
            .is_err()
    );
    assert!(
        runtime
            .schedule_wait(&owner, &id, 2, due + Duration::minutes(1), expiry)
            .await
            .is_err()
    );
    let new_due = Utc::now() + Duration::seconds(2);
    let new_expiry = new_due + Duration::hours(1);
    let next = runtime
        .reschedule_wait(&owner, &id, &root.message_id, 3, new_due, new_expiry)
        .await
        .unwrap();
    assert_eq!(next.schedule.revision, 2);
    assert_eq!(
        next.schedule.cancellation_key,
        root.schedule.cancellation_key
    );
    assert_eq!(
        next,
        runtime
            .reschedule_wait(&owner, &id, &root.message_id, 3, new_due, new_expiry)
            .await
            .unwrap()
    );
    assert!(
        runtime
            .reschedule_wait(&owner, &id, &root.message_id, 3, due, expiry)
            .await
            .is_err()
    );
    assert!(
        runtime
            .deliver_follow_up(&owner, &id, &root.message_id)
            .await
            .is_err()
    );
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    assert_eq!(
        runtime.due_schedules(&owner, 1).await.unwrap(),
        vec![next.clone()]
    );
    let (a, b) = tokio::join!(
        runtime.deliver_follow_up(&owner, &id, &next.message_id),
        runtime.deliver_follow_up(&owner, &id, &next.message_id)
    );
    let delivered = a.unwrap();
    assert_eq!(delivered, b.unwrap());
    assert_eq!(delivered.schedule.status, ScheduleStatus::Delivered);
    let current = runtime.instance(&owner, &id).await.unwrap().instance;
    assert_eq!(current.status, InstanceState::Running);
    assert_eq!(current.revision, 5);
    assert_eq!(current.completed_step_ids.len(), 1);
    assert!(current.next_follow_up_at.is_none());
    assert!(runtime.due_schedules(&owner, 10).await.unwrap().is_empty());
    runtime.cancel(&owner, &id, 5).await.unwrap();
    assert_eq!(
        runtime
            .deliver_follow_up(&owner, &id, &next.message_id)
            .await
            .unwrap(),
        delivered
    );
    assert_eq!(
        runtime.instance(&owner, &id).await.unwrap().instance.status,
        InstanceState::Cancelled
    );
    let cancel = instance(&db, &runtime, &owner, json!({})).await;
    let r = runtime
        .schedule_wait(&owner, &cancel, 2, due, expiry)
        .await
        .unwrap();
    runtime.cancel(&owner, &cancel, 3).await.unwrap();
    assert!(
        runtime
            .deliver_follow_up(&owner, &cancel, &r.message_id)
            .await
            .is_err()
    );
    let timed = instance(&db, &runtime, &owner, json!({})).await;
    let soon = Utc::now() + Duration::seconds(1);
    let r = runtime
        .schedule_wait(&owner, &timed, 2, soon, soon + Duration::seconds(1))
        .await
        .unwrap();
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    assert_eq!(
        runtime
            .deliver_follow_up(&owner, &timed, &r.message_id)
            .await
            .unwrap()
            .schedule
            .status,
        ScheduleStatus::Expired
    );
    assert_eq!(
        runtime
            .instance(&owner, &timed)
            .await
            .unwrap()
            .instance
            .status,
        InstanceState::Failed
    );
    let table = format!("\"user_{}\".messages", owner.to_lowercase());
    let count: i64 = sqlx::query_scalar(&format!(
        "SELECT count(*) FROM {table} WHERE type='runbook_follow_up'"
    ))
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
    let count:i64=sqlx::query_scalar(&format!("SELECT count(*) FROM {table} WHERE type='runbook_schedule' AND (content <> '{{}}'::jsonb OR encryption IS NULL)")).fetch_one(&db.pool).await.unwrap();
    assert_eq!(count, 0);
    db.delete_user_account_and_data(&owner).await.unwrap();
    assert!(runtime.due_schedules(&owner, 10).await.is_err());
    assert!(
        runtime
            .deliver_follow_up(&owner, &id, &next.message_id)
            .await
            .is_err()
    );
    db.delete_user_account_and_data(&other).await.unwrap();
}

#[tokio::test]
async fn latest_definition_can_revoke_follow_up_before_write_or_delivery() {
    let Some(db) = database().await else {
        return;
    };
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [57; 32], [58; 32]);
    let runtime = RunbookRuntime::new(&store);
    let d = definition(true);
    let saved = store.save(&owner, None, d.clone()).await.unwrap();
    let waiting = instance(&db, &runtime, &owner, json!({})).await;
    let unscheduled = instance(&db, &runtime, &owner, json!({})).await;
    let due = Utc::now() + Duration::seconds(2);
    let expiry = due + Duration::hours(1);
    let r = runtime
        .schedule_wait(&owner, &waiting, 2, due, expiry)
        .await
        .unwrap();
    let mut changed = d;
    changed.follow_up_events = vec!["different_due".into()];
    changed.steps[0].follow_up_event = Some("different_due".into());
    store
        .save(&owner, saved["id"].as_str(), changed)
        .await
        .unwrap();
    assert_eq!(
        runtime
            .schedule_wait(
                &owner,
                &unscheduled,
                2,
                Utc::now() + Duration::hours(1),
                expiry + Duration::hours(1)
            )
            .await
            .unwrap_err(),
        "undeclared_follow_up"
    );
    assert_eq!(
        runtime
            .instance(&owner, &unscheduled)
            .await
            .unwrap()
            .instance
            .revision,
        2
    );
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    assert_eq!(
        runtime
            .deliver_follow_up(&owner, &waiting, &r.message_id)
            .await
            .unwrap_err(),
        "undeclared_follow_up"
    );
    assert_eq!(
        runtime
            .instance(&owner, &waiting)
            .await
            .unwrap()
            .instance
            .revision,
        3
    );
    // Revocation never prevents cancellation and successor audit preservation.
    runtime.cancel(&owner, &waiting, 3).await.unwrap();
    db.delete_user_account_and_data(&owner).await.unwrap();
}
