use chrono::{Duration, Utc};
use omnyid_homeserver::{
    db::{Db, UserRecord},
    runbook_contract::*,
    runbook_input::InputSupplied,
    runbook_read::ReadRequest,
    runbook_runtime::RunbookRuntime,
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
};
use serde_json::json;
use std::collections::BTreeMap;
use ulid::Ulid;

async fn user(db: &Db) -> UserRecord {
    let id = Ulid::new().to_string();
    let u = UserRecord {
        id: id.clone(),
        email: format!("transform-{id}@omnyid.test"),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Transform".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&u).await.unwrap();
    u
}

#[tokio::test]
async fn frozen_read_question_answer_transform_completion_and_concurrent_retry() {
    let url = std::env::var("TEST_DATABASE_URL").expect("disposable TEST_DATABASE_URL required");
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let a = user(&db).await;
    let b = user(&db).await;
    let store = RunbookStore::new(&db, [21; 32], [22; 32]);
    let runtime = RunbookRuntime::new(&store);
    let mut d = starter_definitions()
        .into_iter()
        .find(|d| d.runbook_id == "file_requires_review")
        .unwrap();
    d.enabled = true;
    d.trigger.event_types = vec!["workflow_failed".into()];
    d.steps.retain(|s| s.kind != StepKind::Emit);
    d.steps.last_mut().unwrap().input_refs = vec!["steps.assess.output_refs".into()];
    d.success_criteria = vec![Filter {
        path: "instance.outputs.assess.status".into(),
        op: FilterOp::Eq,
        value: Some(json!("completed")),
    }];
    let saved = store.save(&a.id, None, d.clone()).await.unwrap();
    let trigger = Ulid::new().to_string();
    db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":trigger,"type":"workflow_failed","to":[a.id],
        "thread_id":"workflow:review","timestamp":Utc::now().to_rfc3339(),"content":{"confidence":0.9,"file_ref":"document:one",
        "parser_status":"ready","instruction":"release automatically","api_key":"secret-marker"}})).await.unwrap();
    let id = runtime
        .dispatch(&a.id, &trigger)
        .await
        .unwrap()
        .instance_ids[0]
        .clone();
    runtime.start(&a.id, &id, 1).await.unwrap();
    runtime
        .execute_read(
            &a.id,
            &id,
            &ReadRequest {
                step_id: "read".into(),
                expected_revision: 2,
                snapshot_ref: None,
                decrypt_limit: 4,
                byte_limit: 262144,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        runtime
            .execute_transform(&a.id, &id, "assess", 3)
            .await
            .unwrap_err(),
        "missing_required_fact"
    );
    assert_eq!(
        runtime
            .instance(&a.id, &id)
            .await
            .unwrap()
            .instance
            .revision,
        3
    );
    let question = runtime
        .request_missing_input(
            &a.id,
            &id,
            3,
            AnswerSchema::ShortText,
            Utc::now() + Duration::hours(1),
        )
        .await
        .unwrap()
        .unwrap();
    runtime
        .supply_input(
            &a.id,
            &InputSupplied {
                event_id: Ulid::new().to_string(),
                instance_id: id.clone(),
                escalation_id: question.escalation_id,
                answers: BTreeMap::from([("quarantine_status".into(), json!("clear"))]),
            },
            4,
        )
        .await
        .unwrap();
    assert!(
        runtime
            .execute_transform(&b.id, &id, "assess", 5)
            .await
            .is_err()
    );
    let (first, second) = tokio::join!(
        runtime.execute_transform(&a.id, &id, "assess", 5),
        runtime.execute_transform(&a.id, &id, "assess", 5)
    );
    let receipt = first.unwrap();
    assert_eq!(receipt, second.unwrap());
    assert_eq!(receipt.result.conclusions["ready_for_review"], true);
    assert_eq!(receipt.result.conclusions["release_authorized"], false);
    assert!(receipt.trace.provenance_ref.is_some());
    assert!(!json!(receipt).to_string().contains("secret-marker"));
    assert_eq!(
        runtime
            .instance(&a.id, &id)
            .await
            .unwrap()
            .instance
            .revision,
        6
    );
    let completed = runtime.complete(&a.id, &id, 6).await.unwrap();
    assert_eq!(completed.status, TraceStatus::Completed);
    // Exact retry remains a receipt even after completion, source mutation and revocation.
    sqlx::query("UPDATE afp_messages SET payload=jsonb_set(payload,'{content,quarantine_status}','\"blocked\"') WHERE owner_user_id=$1 AND id=$2")
        .bind(&a.id).bind(&trigger).execute(&db.pool).await.unwrap();
    d.enabled = false;
    store.save(&a.id, saved["id"].as_str(), d).await.unwrap();
    assert_eq!(
        receipt,
        runtime
            .execute_transform(&a.id, &id, "assess", 5)
            .await
            .unwrap()
    );
    assert_eq!(
        runtime
            .execute_transform(&a.id, &id, "assess", 6)
            .await
            .unwrap_err(),
        "step_replay_conflict"
    );
    let table = format!("\"user_{}\".messages", a.id.to_lowercase());
    let bodies:i64=sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table} WHERE type='runbook_transform' AND content='{{}}'::jsonb AND encryption IS NOT NULL"))
        .fetch_one(&db.pool).await.unwrap();
    assert_eq!(bodies, 1);
    db.delete_user_account_and_data(&a.id, &a.email, &[])
        .await
        .unwrap();
    db.delete_user_account_and_data(&b.id, &b.email, &[])
        .await
        .unwrap();
}
