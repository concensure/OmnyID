use omnyid_homeserver::{
    daemon_registry::{self, DaemonManifest, spawn_daemon},
    db::{Db, UserRecord},
    knowledge_curator::DaemonKind,
};
use serde_json::json;
use ulid::Ulid;

#[tokio::test]
async fn idle_heartbeats_are_sampled_and_rate_limit_rows_expire_globally() {
    if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
        return;
    }

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
    let db = Db::new(&database_url)
        .await
        .expect("connect to disposable test database");
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: format!("retention_{suffix}"),
        email: format!("retention-{suffix}@omnyid.test"),
        password_hash: Some("smoke-hash".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: "Operational Retention Test".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create test user");
    let registration = spawn_daemon(
        &db,
        DaemonManifest {
            user_id: user.id.clone(),
            daemon_kind: DaemonKind::LedgerIngestion,
            workflow_id: None,
            delegated_key_id: format!("test:ledger_ingestion:{}", user.id),
            policy_config: json!({}),
        },
    )
    .await
    .expect("register test daemon");

    daemon_registry::record_heartbeat(&db, &registration.daemon_id, &user.id, 0, 0, 0, 0)
        .await
        .expect("record first idle heartbeat");
    daemon_registry::record_heartbeat(&db, &registration.daemon_id, &user.id, 0, 0, 0, 0)
        .await
        .expect("sample repeated idle heartbeat");
    let idle_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM daemon_heartbeats WHERE daemon_id = $1")
            .bind(&registration.daemon_id)
            .fetch_one(&db.pool)
            .await
            .expect("count sampled idle heartbeats");
    assert_eq!(idle_count, 1);

    daemon_registry::record_heartbeat(&db, &registration.daemon_id, &user.id, 0, 1, 0, 0)
        .await
        .expect("record meaningful heartbeat");
    let meaningful_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM daemon_heartbeats WHERE daemon_id = $1")
            .bind(&registration.daemon_id)
            .fetch_one(&db.pool)
            .await
            .expect("count meaningful heartbeat");
    assert_eq!(meaningful_count, 2);

    let stale_bucket = format!("retention-test:{suffix}:stale");
    let current_bucket = format!("retention-test:{suffix}:current");
    sqlx::query(
        r#"
        INSERT INTO rate_limit_log (bucket_key, request_time)
        VALUES ($1, NOW() - INTERVAL '48 hours'), ($2, NOW())
        "#,
    )
    .bind(&stale_bucket)
    .bind(&current_bucket)
    .execute(&db.pool)
    .await
    .expect("seed rate-limit retention rows");

    let (_, _, rate_limit_rows) = daemon_registry::prune_operational_daemon_history(&db)
        .await
        .expect("prune operational history");
    assert!(rate_limit_rows >= 1);
    let stale_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM rate_limit_log WHERE bucket_key = $1")
            .bind(&stale_bucket)
            .fetch_one(&db.pool)
            .await
            .expect("count stale rate-limit rows");
    let current_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM rate_limit_log WHERE bucket_key = $1")
            .bind(&current_bucket)
            .fetch_one(&db.pool)
            .await
            .expect("count current rate-limit rows");
    assert_eq!(stale_count, 0);
    assert_eq!(current_count, 1);

    sqlx::query("DELETE FROM rate_limit_log WHERE bucket_key = $1")
        .bind(&current_bucket)
        .execute(&db.pool)
        .await
        .expect("remove current test rate-limit row");
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(&user.id)
        .execute(&db.pool)
        .await
        .expect("remove test user");
}
