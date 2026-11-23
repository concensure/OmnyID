use super::*;
use omnyid_homeserver::provenance_record::canonical_value_hash as hash;
use sqlx::Row;

async fn content(db: &Db, owner: &str, id: &str) -> Value {
    let table = format!("\"user_{}\".messages", owner.to_lowercase());
    let row = sqlx::query(&format!("SELECT * FROM {table} WHERE id=$1"))
        .bind(id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(row.get::<Value, _>("content"), json!({}));
    let aad = json!({"protocol":"afp-v1","id":id,
        "thread_id":row.get::<String,_>("thread_id"),
        "parent_id":row.get::<Option<String>,_>("parent_id").unwrap_or_default(),
        "from":row.get::<String,_>("from_agent"),"to":row.get::<Value,_>("to_agents"),
        "timestamp":row.get::<chrono::DateTime<Utc>,_>("timestamp").to_rfc3339_opts(chrono::SecondsFormat::Micros,true),
        "type":row.get::<String,_>("type"),"subtype":row.get::<Option<String>,_>("subtype"),
        "metadata":row.get::<Value,_>("metadata")});
    omnyid_homeserver::crypto::decrypt_content(&row.get::<Value, _>("encryption"), &aad, &[55; 32])
        .unwrap()
}

pub(super) async fn assert_schedule_traces(db: &Db, owner: &str, expected: usize) {
    let table = format!("\"user_{}\".messages", owner.to_lowercase());
    let ids: Vec<String> = sqlx::query_scalar(&format!(
        "SELECT id FROM {table} WHERE type='runbook_schedule'"
    ))
    .fetch_all(&db.pool)
    .await
    .unwrap();
    assert_eq!(ids.len(), expected);
    for id in ids {
        let schedule = content(db, owner, &id).await;
        let trace_id = hash(&json!([
            "runbook_schedule_trace.v1",
            owner,
            schedule["schedule_id"],
            schedule["revision"]
        ]));
        let trace = content(db, owner, &trace_id).await;
        let expected_status = match schedule["status"].as_str().unwrap() {
            "scheduled" => "waiting",
            "delivered" => "completed",
            "cancelled" => "denied",
            "expired" => "failed",
            _ => panic!("unexpected schedule"),
        };
        assert_eq!(trace["status"], expected_status);
        assert_eq!(trace["step_kind"], "wait");
        assert_eq!(trace["instance_id"], schedule["instance_id"]);
        assert_eq!(trace["output_refs"], json!([id]));
        assert_eq!(trace["output_hash"], hash(&schedule));
        assert_eq!(
            trace["completed_at"].is_null(),
            expected_status == "waiting"
        );
        let provenance = content(db, owner, trace["provenance_ref"].as_str().unwrap()).await;
        assert_eq!(provenance["output_hashes"][0]["sha256"], hash(&schedule));
    }
}

#[tokio::test]
async fn failed_trace_write_rolls_back_schedule_and_instance() {
    let Some(db) = database().await else {
        return;
    };
    let owner = user(&db).await;
    let store = RunbookStore::new(&db, [55; 32], [56; 32]);
    let runtime = RunbookRuntime::new(&store);
    store.save(&owner, None, definition(true)).await.unwrap();
    let id = instance(&db, &runtime, &owner, json!({})).await;
    let schema = format!("\"user_{}\"", owner.to_lowercase());
    sqlx::raw_sql(&format!("CREATE FUNCTION {schema}.reject_wait_trace() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'runbook_step_trace' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_wait_trace BEFORE INSERT ON {schema}.messages FOR EACH ROW EXECUTE FUNCTION {schema}.reject_wait_trace();"))
        .execute(&db.pool).await.unwrap();
    let due = Utc::now() + Duration::hours(1);
    assert!(
        runtime
            .schedule_wait(&owner, &id, 2, due, due + Duration::hours(1))
            .await
            .is_err()
    );
    assert_eq!(
        runtime
            .instance(&owner, &id)
            .await
            .unwrap()
            .instance
            .revision,
        2
    );
    let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {schema}.messages WHERE type IN ('runbook_schedule','provenance_record')"))
        .fetch_one(&db.pool).await.unwrap();
    assert_eq!(count, 0);
    sqlx::raw_sql(&format!("DROP TRIGGER reject_wait_trace ON {schema}.messages; DROP FUNCTION {schema}.reject_wait_trace();"))
        .execute(&db.pool).await.unwrap();
    runtime
        .schedule_wait(&owner, &id, 2, due, due + Duration::hours(1))
        .await
        .unwrap();
    assert_schedule_traces(&db, &owner, 1).await;
    db.delete_user_account_and_data(&owner, &format!("control-{owner}@omnyid.test"), &[])
        .await
        .unwrap();
}
