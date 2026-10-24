use omnyid_homeserver::{
    afp::Message,
    curator_runtime::run_curator_backfill_pass,
    daemon_registry::{DaemonManifest, spawn_daemon},
    db::{Db, UserRecord},
    knowledge_curator::DaemonKind,
};
use serde_json::json;
use ulid::Ulid;

#[tokio::test]
async fn ineligible_message_is_marked_once_without_audit_growth() {
    if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
        return;
    }

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
    let db = Db::new(&database_url)
        .await
        .expect("connect to test database");
    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: format!("curator_skip_{suffix}"),
        email: format!("curator-skip-{suffix}@omnyid.test"),
        password_hash: Some("smoke-hash".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: "Curator Skip Test".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create user");
    let registration = spawn_daemon(
        &db,
        DaemonManifest {
            user_id: user.id.clone(),
            daemon_kind: DaemonKind::KnowledgeCurator,
            workflow_id: None,
            delegated_key_id: format!("test:knowledge_curator:{}", user.id),
            policy_config: json!({}),
        },
    )
    .await
    .expect("register curator");
    let source_id = format!("msg_{}", Ulid::new().to_string().to_lowercase());
    let content = json!({"body": "brief"});
    let message = Message {
        protocol: "afp-v1".to_string(),
        id: source_id.clone(),
        thread_id: "thread:curator-skip".to_string(),
        parent_id: String::new(),
        from: format!("omnyid://workspace/{}", user.id),
        to: vec![],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "note".to_string(),
        kind: None,
        supertags: vec![],
        content: content.to_string(),
        signature: String::new(),
        encryption: "{}".to_string(),
        views: "[]".to_string(),
        references: "[]".to_string(),
        attachments: "[]".to_string(),
        store_in_relational: true,
        subtype: String::new(),
        metadata: json!({"origin": "curator_skip_regression"}).to_string(),
    };
    db.store_private_message(&user.id, &message, content)
        .await
        .expect("store ineligible source");

    sqlx::query(
        r#"
        INSERT INTO daemon_registrations (
            daemon_id, user_id, daemon_kind, delegated_key_id, status, policy_config, created_at
        ) VALUES ($1, $2, 'background_watcher', 'test:legacy-watcher', 'active', '{}', NOW() - INTERVAL '1 day')
        "#,
    )
    .bind(format!("background_watcher:{}", user.id))
    .bind(&user.id)
    .execute(&db.pool)
    .await
    .expect("insert legacy watcher registration");
    sqlx::query("UPDATE daemon_registrations SET status='paused' WHERE daemon_id=$1")
        .bind(&registration.daemon_id)
        .execute(&db.pool)
        .await
        .expect("pause exact curator");
    let blocked = run_curator_backfill_pass(&db, &user.id, 10)
        .await
        .expect("legacy watcher must not impersonate curator");
    let marker_before_resume: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM afp_knowledge_cards WHERE user_id=$1 AND source_id=$2",
    )
    .bind(&user.id)
    .bind(&source_id)
    .fetch_one(&db.pool)
    .await
    .expect("pre-resume marker count");
    sqlx::query("UPDATE daemon_registrations SET status='active' WHERE daemon_id=$1")
        .bind(&registration.daemon_id)
        .execute(&db.pool)
        .await
        .expect("resume exact curator");

    let first = run_curator_backfill_pass(&db, &user.id, 10)
        .await
        .expect("first curator pass");
    let second = run_curator_backfill_pass(&db, &user.id, 10)
        .await
        .expect("second curator pass");
    let marker_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM afp_knowledge_cards WHERE user_id=$1 AND source_id=$2 AND model_version='ineligible-skip-v1'",
    )
    .bind(&user.id)
    .bind(&source_id)
    .fetch_one(&db.pool)
    .await
    .expect("marker count");
    let audit_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM curator_run_audit WHERE user_id=$1 AND source_message_id=$2",
    )
    .bind(&user.id)
    .bind(&source_id)
    .fetch_one(&db.pool)
    .await
    .expect("audit count");

    assert_eq!(blocked, 0);
    assert_eq!(marker_before_resume, 0);
    assert_eq!(first, 1);
    assert_eq!(second, 0);
    assert_eq!(marker_count, 1);
    assert_eq!(audit_count, 0);

    sqlx::query("DELETE FROM users WHERE id=$1")
        .bind(&user.id)
        .execute(&db.pool)
        .await
        .expect("clean test user");
    assert_eq!(registration.user_id, user.id);
}
