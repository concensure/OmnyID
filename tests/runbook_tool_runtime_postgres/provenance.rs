use super::*;
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
    omnyid_homeserver::crypto::decrypt_content(&row.get::<Value, _>("encryption"), &aad, &[31; 32])
        .unwrap()
}

pub(super) async fn assert_exact_tool_hashes(
    db: &Db,
    owner: &str,
    receipt: &omnyid_homeserver::runbook_tool_runtime::ToolReceipt,
) {
    use omnyid_homeserver::provenance_record::canonical_value_hash as hash;
    let provenance = content(db, owner, receipt.trace.provenance_ref.as_deref().unwrap()).await;
    let approval = content(db, owner, receipt.trace.approval_ref.as_deref().unwrap()).await;
    let proposal = content(db, owner, &receipt.proposal_ref).await;
    let definition = content(db, owner, proposal["definition_ref"].as_str().unwrap()).await;
    let hashes = provenance["input_hashes"].as_array().unwrap();
    assert_eq!(hashes.len(), 5);
    let get = |label: &str| hashes.iter().find(|h| h["label"] == label).unwrap()["sha256"].clone();
    let store = RunbookStore::new(db, [31; 32], [32; 32]);
    let instance = RunbookRuntime::new(&store)
        .instance(owner, &receipt.instance_id)
        .await
        .unwrap()
        .instance;
    let dispatch_id = hash(&json!([
        "runbook_dispatch.v1",
        owner,
        instance.trigger_event_id
    ]));
    let dispatch = content(db, owner, &dispatch_id).await;
    assert_eq!(get("trigger"), dispatch["event_hash"]);
    assert_eq!(get("definition"), hash(&definition));
    assert_eq!(get("approval"), hash(&approval));
    assert_eq!(get("step_input"), receipt.request_hash);
    assert_eq!(get("evidence_packet"), hash(&Value::Null));
    assert_eq!(
        provenance["output_hashes"],
        json!([{"label":"step_output","sha256":hash(&json!([receipt.outcome,receipt.failure,receipt.output]))}])
    );
    assert_eq!(provenance["context"]["authority"], "audit_only");
    assert_eq!(
        provenance["context"]["approval_ref"],
        receipt.trace.approval_ref.as_ref().unwrap().as_str()
    );
}
