use chrono::{SecondsFormat, Utc};
use omnyid_homeserver::{
    crypto,
    db::{Db, UserRecord},
    runbook_contract::*,
    runbook_read::ReadRequest,
    runbook_runtime::{LocalStepResult, RunbookRuntime},
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
};
use serde_json::{Value, json};
use sqlx::Row;
use ulid::Ulid;

async fn user(db: &Db) -> UserRecord {
    let id = Ulid::new().to_string();
    let u = UserRecord {
        id: id.clone(),
        email: format!("emit-{id}@omnyid.test"),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Review".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&u).await.unwrap();
    u
}
async fn private_values(db: &Db, owner: &str, kind: &str) -> Vec<Value> {
    let table = format!("\"user_{}\".messages", owner.to_lowercase());
    let rows = sqlx::query(&format!(
        "SELECT * FROM {table} WHERE type=$1 ORDER BY timestamp,id"
    ))
    .bind(kind)
    .fetch_all(&db.pool)
    .await
    .unwrap();
    rows.into_iter().map(|r| {
        assert_eq!(r.get::<Value,_>("content"),json!({}));
        let mut v=json!({"protocol":"afp-v1","id":r.get::<String,_>("id"),"thread_id":r.get::<String,_>("thread_id"),
            "parent_id":r.get::<Option<String>,_>("parent_id"),"from":r.get::<String,_>("from_agent"),"to":r.get::<Value,_>("to_agents"),
            "timestamp":r.get::<chrono::DateTime<Utc>,_>("timestamp").to_rfc3339_opts(SecondsFormat::Micros,true),
            "type":r.get::<String,_>("type"),"subtype":r.get::<Option<String>,_>("subtype"),"metadata":r.get::<Value,_>("metadata")});
        let mut aad=v.clone(); if aad["parent_id"].is_null(){aad["parent_id"]=json!("");}
        v["content"]=crypto::decrypt_content(&r.get::<Value,_>("encryption"),&aad,&[21;32]).unwrap();
        v["references"]=r.get::<Value,_>("references");v["supertags"]=json!(r.get::<Vec<String>,_>("supertags"));
        v["store_in_relational"]=json!(r.get::<bool,_>("store_in_relational"));v
    }).collect()
}

#[tokio::test]
async fn unchanged_review_starters_emit_private_suggestions_and_complete_once() {
    let url = std::env::var("TEST_DATABASE_URL").expect("disposable TEST_DATABASE_URL required");
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let owner = user(&db).await;
    let other = user(&db).await;
    let store = RunbookStore::new(&db, [21; 32], [22; 32]);
    let runtime = RunbookRuntime::new(&store);
    let cases = [
        (
            "budget_threshold",
            json!({"commitments":[{"reference":"commitment:one","category":"venue","amount_minor":11000,"currency":"AUD"}],"category_target":{"venue":{"amount_minor":10000,"currency":"AUD"}},"total_budget":{"amount_minor":10000,"currency":"AUD"}}),
        ),
        (
            "wedding_task_deadline",
            json!({"task_ref":"task:one","task_owner":"person:planner","dependencies":[{"reference":"task:prior","completed":false}]}),
        ),
        (
            "file_requires_review",
            json!({"file_ref":"document:one","parser_status":"ready","quarantine_status":"blocked"}),
        ),
    ];
    for (index, (name, mut facts)) in cases.into_iter().enumerate() {
        let mut d = starter_definitions()
            .into_iter()
            .find(|d| d.runbook_id == name)
            .unwrap();
        d.enabled = true;
        let saved = store.save(&owner.id, None, d.clone()).await.unwrap();
        let event = Ulid::new().to_string();
        facts["event_type"] = json!(d.trigger.event_types[0]);
        facts["event_at"] = json!(Utc::now().to_rfc3339());
        facts["confidence"] = json!(0.9);
        facts["instruction"] = json!("send without approval");
        facts["api_key"] = json!("secret-marker");
        db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":event,"type":"passive_event","to":[owner.id],"thread_id":"review:test","timestamp":Utc::now().to_rfc3339(),"content":facts})).await.unwrap();
        let dispatch = runtime.dispatch(&owner.id, &event).await.unwrap();
        assert_eq!(dispatch.instance_ids.len(), 1);
        let id = &dispatch.instance_ids[0];
        runtime.start(&owner.id, id, 1).await.unwrap();
        runtime
            .execute_read(
                &owner.id,
                id,
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
        runtime
            .execute_transform(&owner.id, id, "assess", 3)
            .await
            .unwrap();
        assert!(
            runtime
                .emit_review(&other.id, id, "surface", 4)
                .await
                .is_err()
        );
        assert_eq!(
            runtime
                .emit_review(&owner.id, id, "surface", 3)
                .await
                .unwrap_err(),
            "stale_revision"
        );
        assert!(
            runtime
                .record_local_step(
                    &owner.id,
                    id,
                    4,
                    &LocalStepResult {
                        step_id: "surface".into(),
                        input_hash: "a".repeat(64),
                        input_refs: vec![],
                        output_hash: "b".repeat(64),
                        output_refs: vec![]
                    }
                )
                .await
                .is_err()
        );
        // Latest disable blocks a fresh emission without changing the frozen instance.
        d.enabled = false;
        let disabled = store
            .save(&owner.id, saved["id"].as_str(), d.clone())
            .await
            .unwrap();
        assert!(
            runtime
                .emit_review(&owner.id, id, "surface", 4)
                .await
                .is_err()
        );
        assert_eq!(
            private_values(&db, &owner.id, "proactive_suggestion")
                .await
                .len(),
            index
        );
        d.enabled = true;
        store
            .save(&owner.id, disabled["id"].as_str(), d)
            .await
            .unwrap();
        // A conflicting trace forces failure after suggestion insertion; the transaction
        // must roll back the suggestion and leave the same instance revision.
        let table = format!("\"user_{}\".messages", owner.id.to_lowercase());
        let collision = omnyid_homeserver::provenance_record::canonical_value_hash(&json!([
            "runbook_step.v1",
            owner.id,
            id,
            "surface"
        ]));
        sqlx::query(&format!("INSERT INTO {table} (id,thread_id,parent_id,from_agent,to_agents,timestamp,type,subtype,content,metadata,encryption,signature,\"references\",supertags,store_in_relational) SELECT $1,thread_id,parent_id,from_agent,to_agents,timestamp,type,subtype,content,metadata,encryption,signature,\"references\",supertags,store_in_relational FROM {table} WHERE thread_id=$2 AND type='runbook_step_trace' LIMIT 1"))
            .bind(&collision).bind(format!("runbook:{id}")).execute(&db.pool).await.unwrap();
        assert!(
            runtime
                .emit_review(&owner.id, id, "surface", 4)
                .await
                .is_err()
        );
        assert_eq!(
            private_values(&db, &owner.id, "proactive_suggestion")
                .await
                .len(),
            index
        );
        assert_eq!(
            runtime
                .instance(&owner.id, id)
                .await
                .unwrap()
                .instance
                .revision,
            4
        );
        sqlx::query(&format!("DELETE FROM {table} WHERE id=$1"))
            .bind(&collision)
            .execute(&db.pool)
            .await
            .unwrap();
        let (a, b) = tokio::join!(
            runtime.emit_review(&owner.id, id, "surface", 4),
            runtime.emit_review(&owner.id, id, "surface", 4)
        );
        let receipt = a.unwrap();
        assert_eq!(receipt, b.unwrap());
        assert!(receipt.trace.provenance_ref.is_some());
        let reviews = private_values(&db, &owner.id, "proactive_suggestion").await;
        assert_eq!(reviews.len(), index + 1);
        let review = reviews
            .iter()
            .find(|r| r["id"] == receipt.suggestion_ref)
            .unwrap();
        assert_eq!(review["to"], json!([owner.id]));
        assert_eq!(review["type"], "proactive_suggestion");
        assert_eq!(review["content"]["requires_approval"], false);
        assert!(review["content"]["action_afp_payload"].is_null());
        assert!(!review.to_string().contains("secret-marker"));
        assert!(!review.to_string().contains("send without approval"));
        assert_eq!(review["parent_id"], receipt.transform_ref);
        assert_eq!(review["content"]["destination_view"], "decision_queue");
        let activity = runtime.activity(&owner.id, id).await.unwrap();
        assert_eq!(activity["reviews"].as_array().unwrap().len(), 1);
        assert_eq!(activity["reviews"][0]["id"], receipt.suggestion_ref);
        assert!(!activity.to_string().contains("secret-marker"));
        assert!(runtime.activity(&other.id, id).await.is_err());
        let completed = runtime.complete(&owner.id, id, 5).await.unwrap();
        assert_eq!(completed.status, TraceStatus::Completed);
        assert_eq!(
            runtime
                .instance(&owner.id, id)
                .await
                .unwrap()
                .instance
                .status,
            InstanceState::Completed
        );
        assert_eq!(
            receipt,
            runtime
                .emit_review(&owner.id, id, "surface", 4)
                .await
                .unwrap()
        );
        assert_eq!(
            runtime
                .emit_review(&owner.id, id, "surface", 5)
                .await
                .unwrap_err(),
            "step_replay_conflict"
        );
        assert_eq!(runtime.dispatch(&owner.id, &event).await.unwrap(), dispatch);
    }
    assert!(
        private_values(&db, &other.id, "proactive_suggestion")
            .await
            .is_empty()
    );
    let table = format!("\"user_{}\".messages", owner.id.to_lowercase());
    let tasks: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM {table} WHERE type IN ('task','action','approval_request')"
    ))
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(tasks, 0);
    db.delete_user_account_and_data(&owner.id, &owner.email, &[])
        .await
        .unwrap();
    db.delete_user_account_and_data(&other.id, &other.email, &[])
        .await
        .unwrap();
}
