//! Requires a disposable PostgreSQL database; never points at production.
use omnyid_homeserver::db::Db;
use ulid::Ulid;

#[tokio::test]
async fn attachment_totals_decode_bigint_and_stay_owner_scoped() {
    let url = std::env::var("TEST_DATABASE_URL").expect("set disposable TEST_DATABASE_URL");
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let alice = Ulid::new().to_string();
    let bob = Ulid::new().to_string();
    let schema = db.ensure_user_private_schema(&alice).await.unwrap();
    let other_schema = db.ensure_user_private_schema(&bob).await.unwrap();
    assert_eq!(
        db.attachment_storage_bytes_for_user(&alice).await.unwrap(),
        0
    );
    sqlx::query(&format!(
        "INSERT INTO \"{schema}\".messages (id,thread_id,from_agent,to_agents,timestamp,type,content,signature) VALUES ('billing-fixture','thread','fixture','[]',NOW(),'text','{{}}','fixture')"
    )).execute(&db.pool).await.unwrap();
    for (id, bytes) in [("a", 3_000_000_000_i64), ("b", 2_000_000_001_i64)] {
        sqlx::query(&format!(
            "INSERT INTO \"{schema}\".attachments (id,message_id,thread_id,name,mime_type,size_bytes,storage,encryption) VALUES ($1,'billing-fixture','thread','fixture','text/plain',$2,'{{}}','{{}}')"
        )).bind(id).bind(bytes).execute(&db.pool).await.unwrap();
    }
    assert_eq!(
        db.attachment_storage_bytes_for_user(&alice).await.unwrap(),
        5_000_000_001
    );
    assert_eq!(db.attachment_storage_bytes_for_user(&bob).await.unwrap(), 0);
    for schema in [schema, other_schema] {
        sqlx::query(&format!("DROP SCHEMA \"{schema}\" CASCADE"))
            .execute(&db.pool)
            .await
            .unwrap();
    }
}
