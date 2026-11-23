use chrono::{Duration, SecondsFormat, Utc};
use omnyid_homeserver::{
    crypto,
    db::{Db, UserRecord},
    message::AFPMessage,
    provenance_record::canonical_value_hash as hash,
    runbook_retention::expired_projection_ids,
    runbook_store::RunbookStore,
};
use serde_json::{Value, json};
use ulid::Ulid;

fn receipt(owner: &str, trace: &str, age: i64, regret: bool) -> Value {
    let root = hash(&json!(["runbook_outcome.v1", owner, trace]));
    let id = if regret {
        hash(&json!(["runbook_regret.v1", owner, trace]))
    } else {
        root.clone()
    };
    json!({"protocol":"afp-v1","id":id,"thread_id":"runbook:instance","parent_id":if regret{root}else{trace.into()},
        "from":owner,"to":[owner],"timestamp":(Utc::now()-Duration::days(age)).to_rfc3339_opts(SecondsFormat::Micros,true),
        "type":"runbook_outcome","subtype":"v1","content":{"instance_id":"instance","trace_id":trace,
        "heuristic_id":"runbook:review:read","family_id":"runbook:review","outcome":if regret{"regretted"}else{"accepted"}},
        "metadata":{"private":true,"store":true},"references":[],"supertags":["runbook_outcome"],"store_in_relational":true})
}

#[test]
fn retention_requires_old_complete_owner_receipts_and_preserves_recent_regret() {
    let root = receipt("owner", "trace", 40, false);
    assert_eq!(
        expired_projection_ids("owner", &[root.clone()], Utc::now()).unwrap(),
        vec![root["id"].as_str().unwrap()]
    );
    let regret = receipt("owner", "trace", 2, true);
    assert!(
        expired_projection_ids("owner", &[root.clone(), regret.clone()], Utc::now())
            .unwrap()
            .is_empty()
    );
    assert!(expired_projection_ids("owner", &[regret], Utc::now()).is_err());
    assert!(expired_projection_ids("other", &[root], Utc::now()).is_err());
    assert!(
        expired_projection_ids(
            "owner",
            &[receipt("owner", "future", -1, false)],
            Utc::now()
        )
        .is_err()
    );
}

async fn user(db: &Db) -> UserRecord {
    let id = Ulid::new().to_string();
    let u = UserRecord {
        id: id.clone(),
        email: format!("retention-{id}@omnyid.test"),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Retention".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&u).await.unwrap();
    u
}

#[tokio::test]
async fn bounded_projection_cleanup_keeps_immutable_private_evidence_and_other_rows() {
    let url = std::env::var("TEST_DATABASE_URL").expect("disposable TEST_DATABASE_URL required");
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let a = user(&db).await;
    let b = user(&db).await;
    let table = format!("\"user_{}\".messages", a.id.to_lowercase());
    for n in 0..101 {
        let value = receipt(&a.id, &format!("trace_{n}"), 40, false);
        let mut message: AFPMessage = serde_json::from_value(value).unwrap();
        let aad = json!({"protocol":message.protocol,"id":message.id,"thread_id":message.thread_id,"parent_id":message.parent_id,
            "from":message.from,"to":message.to,"timestamp":message.timestamp,"type":message.r#type,"subtype":message.subtype,"metadata":message.metadata});
        message.encryption = Some(crypto::encrypt_content(&message.content, &aad, &[21; 32]));
        message.content = json!({});
        crypto::sign_message(&mut message, &[22; 32]);
        sqlx::query(&format!("INSERT INTO {table} (id,thread_id,parent_id,from_agent,to_agents,timestamp,type,subtype,content,metadata,encryption,signature,\"references\",supertags,store_in_relational) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,'{{}}',$9,$10,$11,'[]',$12,true)"))
            .bind(&message.id).bind(&message.thread_id).bind(&message.parent_id).bind(&message.from).bind(json!(message.to)).bind(&message.timestamp)
            .bind(&message.r#type).bind(&message.subtype).bind(&message.metadata).bind(&message.encryption).bind(&message.signature).bind(&message.supertags)
            .execute(&db.pool).await.unwrap();
        sqlx::query("INSERT INTO proactive_outcomes (id,owner_user_id,suggestion_id,accepted,heuristic_id,created_at) VALUES ($1,$2,$3,true,'runbook:review:read',NOW()-INTERVAL '40 days')")
            .bind(&message.id).bind(&a.id).bind(format!("trace_{n}")).execute(&db.pool).await.unwrap();
    }
    for owner in [&a.id, &b.id] {
        sqlx::query("INSERT INTO proactive_outcomes (id,owner_user_id,suggestion_id,accepted,heuristic_id,created_at) VALUES ($1,$2,'forged',false,'runbook:review:read',NOW()-INTERVAL '40 days')")
            .bind(Ulid::new().to_string()).bind(owner).execute(&db.pool).await.unwrap();
    }
    let store = RunbookStore::new(&db, [21; 32], [22; 32]);
    assert_eq!(store.prune_derived_outcomes(&b.id).await.unwrap(), 0);
    assert_eq!(store.prune_derived_outcomes(&a.id).await.unwrap(), 100);
    assert_eq!(store.prune_derived_outcomes(&a.id).await.unwrap(), 1);
    assert_eq!(store.prune_derived_outcomes(&a.id).await.unwrap(), 0);
    let retained: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(retained, 101);
    let rows: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM proactive_outcomes WHERE owner_user_id=ANY($1)")
            .bind(vec![a.id.clone(), b.id.clone()])
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(rows, 2);
    db.delete_user_account_and_data(&a.id, &a.email, &[])
        .await
        .unwrap();
    db.delete_user_account_and_data(&b.id, &b.email, &[])
        .await
        .unwrap();
}
