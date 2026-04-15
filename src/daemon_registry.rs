use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::Row;

use crate::{
    db::Db,
    knowledge_curator::{
        CuratorPolicy, DaemonHeartbeat, DaemonKind, DaemonRegistration, DaemonStatus,
    },
};

#[derive(Clone, Debug)]
pub struct DaemonManifest {
    pub user_id: String,
    pub daemon_kind: DaemonKind,
    pub workflow_id: Option<String>,
    pub delegated_key_id: String,
    pub policy_config: Value,
}

#[derive(Clone, Debug)]
pub struct StaleHeartbeatWarning {
    pub daemon_id: String,
    pub user_id: String,
    pub daemon_kind: DaemonKind,
    pub last_heartbeat_at: Option<String>,
    pub stale_minutes: i64,
}

pub async fn ensure_system_daemons_registered(db: &Db) -> Result<(), sqlx::Error> {
    let user_ids = db.list_user_ids().await?;
    for user_id in user_ids {
        for daemon_kind in [
            DaemonKind::KnowledgeCurator,
            DaemonKind::EmailGateway,
            DaemonKind::RelationalSync,
            DaemonKind::ArchiveColdStorage,
            DaemonKind::HealthMaintenance,
        ] {
            let slug = daemon_kind_slug(&daemon_kind);
            let _ = spawn_daemon(
                db,
                DaemonManifest {
                    user_id: user_id.clone(),
                    daemon_kind,
                    workflow_id: None,
                    delegated_key_id: format!("system:{slug}"),
                    policy_config: json!({
                        "managed_by": "homeserver",
                        "daemon_kind": slug,
                    }),
                },
            )
            .await?;
        }
    }
    Ok(())
}

pub async fn spawn_daemon(
    db: &Db,
    manifest: DaemonManifest,
) -> Result<DaemonRegistration, sqlx::Error> {
    let daemon_id = db
        .upsert_daemon_registration(
            &manifest.user_id,
            &manifest.daemon_kind,
            &manifest.delegated_key_id,
            manifest.workflow_id.as_deref(),
            manifest.policy_config,
        )
        .await?;
    get_daemon_registration(db, &daemon_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn revoke_daemon(db: &Db, daemon_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE daemon_registrations
        SET status = 'revoked',
            revoked_at = NOW()
        WHERE daemon_id = $1
        "#,
    )
    .bind(daemon_id)
    .execute(&db.pool)
    .await?;
    Ok(())
}

pub async fn record_heartbeat(
    db: &Db,
    daemon_id: &str,
    user_id: &str,
    queue_depth: u32,
    events_processed_last_hour: u32,
    tokens_used_today: u32,
    error_count_last_hour: u32,
) -> Result<(), sqlx::Error> {
    let heartbeat = DaemonHeartbeat {
        heartbeat_id: ulid::Ulid::new().to_string(),
        daemon_id: daemon_id.to_string(),
        user_id: user_id.to_string(),
        queue_depth,
        events_processed_last_hour,
        tokens_used_today,
        error_count_last_hour,
        created_at: Utc::now().to_rfc3339(),
    };
    db.record_daemon_heartbeat(&heartbeat).await
}

pub async fn get_active_daemons(
    db: &Db,
    user_id: &str,
) -> Result<Vec<DaemonRegistration>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT
            daemon_id,
            user_id,
            daemon_kind,
            workflow_id,
            delegated_key_id,
            status,
            policy_config,
            last_heartbeat_at::text AS last_heartbeat_at,
            created_at::text AS created_at,
            revoked_at::text AS revoked_at
        FROM daemon_registrations
        WHERE user_id = $1
          AND status = 'active'
        ORDER BY created_at ASC
        "#,
    )
    .bind(user_id)
    .fetch_all(&db.pool)
    .await?;
    rows.into_iter()
        .map(|row| registration_from_row(&row))
        .collect()
}

pub async fn get_active_daemon_for_kind(
    db: &Db,
    user_id: &str,
    kind: DaemonKind,
) -> Result<Option<DaemonRegistration>, sqlx::Error> {
    let daemons = get_active_daemons(db, user_id).await?;
    Ok(daemons
        .into_iter()
        .find(|daemon| daemon.daemon_kind == kind))
}

pub async fn get_daemon_registration(
    db: &Db,
    daemon_id: &str,
) -> Result<Option<DaemonRegistration>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
            daemon_id,
            user_id,
            daemon_kind,
            workflow_id,
            delegated_key_id,
            status,
            policy_config,
            last_heartbeat_at::text AS last_heartbeat_at,
            created_at::text AS created_at,
            revoked_at::text AS revoked_at
        FROM daemon_registrations
        WHERE daemon_id = $1
        "#,
    )
    .bind(daemon_id)
    .fetch_optional(&db.pool)
    .await?;
    row.as_ref().map(registration_from_row).transpose()
}

pub async fn get_latest_heartbeat(db: &Db, daemon_id: &str) -> Result<Option<Value>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT heartbeat_id, daemon_id, user_id, metrics, created_at::text AS created_at
        FROM daemon_heartbeats
        WHERE daemon_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(daemon_id)
    .fetch_optional(&db.pool)
    .await?;
    Ok(row.map(|row| {
        json!({
            "heartbeat_id": row.get::<String, _>("heartbeat_id"),
            "daemon_id": row.get::<String, _>("daemon_id"),
            "user_id": row.get::<String, _>("user_id"),
            "metrics": row.get::<Value, _>("metrics"),
            "created_at": row.get::<String, _>("created_at"),
        })
    }))
}

pub async fn daemon_health_check(db: &Db) -> Result<Vec<StaleHeartbeatWarning>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT
            daemon_id,
            user_id,
            daemon_kind,
            last_heartbeat_at::text AS last_heartbeat_at
        FROM daemon_registrations
        WHERE status = 'active'
        "#,
    )
    .fetch_all(&db.pool)
    .await?;

    let now = Utc::now();
    let mut warnings = Vec::new();
    for row in rows {
        let last_heartbeat_at = row
            .try_get::<Option<String>, _>("last_heartbeat_at")
            .ok()
            .flatten();
        let stale_minutes = last_heartbeat_at
            .as_deref()
            .and_then(parse_timestamp)
            .map(|value| (now - value).num_minutes())
            .unwrap_or(10_000);
        if stale_minutes < 10 {
            continue;
        }
        warnings.push(StaleHeartbeatWarning {
            daemon_id: row.get("daemon_id"),
            user_id: row.get("user_id"),
            daemon_kind: daemon_kind_from_str(&row.get::<String, _>("daemon_kind")),
            last_heartbeat_at,
            stale_minutes,
        });
    }
    Ok(warnings)
}

fn registration_from_row(row: &sqlx::postgres::PgRow) -> Result<DaemonRegistration, sqlx::Error> {
    let policy_json = row
        .try_get::<Option<Value>, _>("policy_config")?
        .unwrap_or_else(|| json!({}));
    Ok(DaemonRegistration {
        daemon_id: row.get("daemon_id"),
        user_id: row.get("user_id"),
        daemon_kind: daemon_kind_from_str(&row.get::<String, _>("daemon_kind")),
        workflow_id: row.try_get("workflow_id").ok().flatten(),
        delegated_key_id: row.get("delegated_key_id"),
        status: daemon_status_from_str(&row.get::<String, _>("status")),
        policy_config: serde_json::from_value::<CuratorPolicy>(policy_json)
            .unwrap_or_else(|_| CuratorPolicy::default()),
        last_heartbeat_at: row.try_get("last_heartbeat_at").ok().flatten(),
        created_at: row.get("created_at"),
        revoked_at: row.try_get("revoked_at").ok().flatten(),
    })
}

fn daemon_status_from_str(value: &str) -> DaemonStatus {
    match value {
        "paused" => DaemonStatus::Paused,
        "revoked" => DaemonStatus::Revoked,
        _ => DaemonStatus::Active,
    }
}

fn daemon_kind_from_str(value: &str) -> DaemonKind {
    match value {
        "email_gateway" => DaemonKind::EmailGateway,
        "relational_sync" => DaemonKind::RelationalSync,
        "archive_cold_storage" => DaemonKind::ArchiveColdStorage,
        "health_maintenance" => DaemonKind::HealthMaintenance,
        _ => DaemonKind::KnowledgeCurator,
    }
}

fn daemon_kind_slug(kind: &DaemonKind) -> &'static str {
    match kind {
        DaemonKind::KnowledgeCurator => "knowledge_curator",
        DaemonKind::EmailGateway => "email_gateway",
        DaemonKind::RelationalSync => "relational_sync",
        DaemonKind::ArchiveColdStorage => "archive_cold_storage",
        DaemonKind::HealthMaintenance => "health_maintenance",
    }
}

fn parse_timestamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}
