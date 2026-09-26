use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::Row;
use std::collections::{HashMap, HashSet};

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

// GAP-129: Batch the registration check into 2 queries instead of N+1.
// Fetch all existing active daemon registrations and all user IDs in one round-trip each,
// then compute missing (user, daemon_kind) pairs in Rust before spawning.
pub async fn ensure_system_daemons_registered(db: &Db) -> Result<(), sqlx::Error> {
    // Single query: all active system daemon registrations for all users.
    let existing_rows = sqlx::query(
        "SELECT user_id, daemon_kind FROM daemon_registrations WHERE status = 'active'",
    )
    .fetch_all(&db.pool)
    .await?;

    let mut registered: HashMap<String, HashSet<DaemonKind>> = HashMap::new();
    for row in existing_rows {
        let user_id: String = row.get("user_id");
        let kind_str: String = row.get("daemon_kind");
        let kind = daemon_kind_from_str(&kind_str);
        registered.entry(user_id).or_default().insert(kind);
    }

    let user_ids = db.list_user_ids().await?;
    for user_id in user_ids {
        let existing_kinds = registered.get(&user_id).cloned().unwrap_or_default();
        for daemon_kind in missing_system_daemon_kinds(&existing_kinds) {
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

fn system_daemon_kinds() -> [DaemonKind; 6] {
    [
        DaemonKind::KnowledgeCurator,
        DaemonKind::LedgerIngestion,
        DaemonKind::EmailGateway,
        DaemonKind::RelationalSync,
        DaemonKind::ArchiveColdStorage,
        DaemonKind::HealthMaintenance,
    ]
}

fn missing_system_daemon_kinds(existing_kinds: &HashSet<DaemonKind>) -> Vec<DaemonKind> {
    system_daemon_kinds()
        .into_iter()
        .filter(|daemon_kind| !existing_kinds.contains(daemon_kind))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{missing_system_daemon_kinds, system_daemon_kinds};
    use crate::knowledge_curator::DaemonKind;
    use std::collections::HashSet;

    #[test]
    fn missing_system_daemon_kinds_skips_already_registered_daemons() {
        let existing = [DaemonKind::KnowledgeCurator, DaemonKind::EmailGateway]
            .into_iter()
            .collect::<HashSet<_>>();

        let missing = missing_system_daemon_kinds(&existing);
        assert_eq!(
            missing,
            vec![
                DaemonKind::LedgerIngestion,
                DaemonKind::RelationalSync,
                DaemonKind::ArchiveColdStorage,
                DaemonKind::HealthMaintenance
            ]
        );
    }

    #[test]
    fn missing_system_daemon_kinds_returns_empty_when_all_present() {
        let existing = system_daemon_kinds().into_iter().collect::<HashSet<_>>();
        let missing = missing_system_daemon_kinds(&existing);
        assert!(missing.is_empty());
    }

    #[test]
    fn missing_system_daemon_kinds_returns_full_system_set_when_none_registered() {
        let existing = HashSet::new();
        let missing = missing_system_daemon_kinds(&existing);
        assert_eq!(missing, system_daemon_kinds().to_vec());
    }

    #[test]
    fn ensure_system_daemons_registered_uses_batched_scan_instead_of_per_user_active_fetches() {
        let source = include_str!("daemon_registry.rs");
        let start = source
            .find("pub async fn ensure_system_daemons_registered")
            .expect("ensure_system_daemons_registered exists");
        let end = source[start..]
            .find("\nfn system_daemon_kinds()")
            .map(|offset| start + offset)
            .expect("system_daemon_kinds follows ensure_system_daemons_registered");
        let function_source = &source[start..end];

        assert!(function_source.contains(
            "SELECT user_id, daemon_kind FROM daemon_registrations WHERE status = 'active'"
        ));
        assert!(
            !function_source.contains("get_active_daemons("),
            "ensure_system_daemons_registered should not re-fetch active daemons per user"
        );
    }

    #[test]
    fn daemon_health_check_supports_both_user_scoped_and_ops_wide_queries() {
        let source = include_str!("daemon_registry.rs");
        let start = source
            .find("pub async fn daemon_health_check")
            .expect("daemon_health_check exists");
        let function_source = &source[start..];

        assert!(function_source.contains("if let Some(uid) = user_id"));
        assert!(function_source.contains("WHERE status = 'active' AND user_id = $1"));
        assert!(function_source.contains("WHERE status = 'active'"));
    }
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

/// Returns stale-heartbeat warnings for active daemons.
/// Pass `Some(user_id)` to scope to one user (user-facing endpoint).
/// Pass `None` to return all users' stale daemons (health/ops endpoint — GAP-130).
pub async fn daemon_health_check(
    db: &Db,
    user_id: Option<&str>,
) -> Result<Vec<StaleHeartbeatWarning>, sqlx::Error> {
    let rows = if let Some(uid) = user_id {
        sqlx::query(
            r#"
            SELECT daemon_id, user_id, daemon_kind, last_heartbeat_at::text AS last_heartbeat_at
            FROM daemon_registrations
            WHERE status = 'active' AND user_id = $1
            "#,
        )
        .bind(uid)
        .fetch_all(&db.pool)
        .await?
    } else {
        sqlx::query(
            r#"
            SELECT daemon_id, user_id, daemon_kind, last_heartbeat_at::text AS last_heartbeat_at
            FROM daemon_registrations
            WHERE status = 'active'
            "#,
        )
        .fetch_all(&db.pool)
        .await?
    };

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
        "ledger_ingestion" => DaemonKind::LedgerIngestion,
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
        DaemonKind::LedgerIngestion => "ledger_ingestion",
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
