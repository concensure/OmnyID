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
        if let Some(kind) = daemon_kind_from_str(&kind_str) {
            registered.entry(user_id).or_default().insert(kind);
        }
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
    use super::{
        daemon_kind_from_str, missing_system_daemon_kinds, parse_timestamp, positive_limit,
        system_daemon_kinds,
    };
    use crate::knowledge_curator::DaemonKind;
    use std::collections::HashSet;

    #[test]
    fn positive_limit_uses_valid_override_and_falls_back_otherwise() {
        assert_eq!(positive_limit(Some("24"), 48), 24);
        assert_eq!(positive_limit(Some(" 24 "), 48), 24);
        assert_eq!(positive_limit(Some("0"), 48), 48);
        assert_eq!(positive_limit(Some("-5"), 48), 48);
        assert_eq!(positive_limit(Some("abc"), 48), 48);
        assert_eq!(positive_limit(None, 48), 48);
    }

    #[test]
    fn curator_audit_retention_defaults_to_seven_days() {
        assert_eq!(super::CURATOR_AUDIT_RETENTION_HOURS_DEFAULT, 168);
        assert_eq!(positive_limit(Some("72"), 168), 72);
        assert_eq!(positive_limit(Some("0"), 168), 168);
    }

    #[test]
    fn rate_limit_retention_runs_inside_the_forty_eight_hour_promise() {
        assert_eq!(super::RATE_LIMIT_RETENTION_HOURS, 47);
        assert!(super::RATE_LIMIT_PRUNE_BATCH > 0);
        assert!(super::RATE_LIMIT_PRUNE_MAX_BATCHES_PER_PASS > 0);
    }

    #[test]
    fn anonymous_site_measurement_is_bounded_to_thirty_days_and_small_batches() {
        assert_eq!(super::SITE_MEASUREMENT_RETENTION_DAYS, 30);
        assert_eq!(super::SITE_MEASUREMENT_PRUNE_BATCH, 1_000);
        assert!(super::SITE_MEASUREMENT_PRUNE_MAX_BATCHES_PER_PASS > 0);
    }

    #[test]
    fn legacy_daemon_kinds_are_not_misclassified_as_knowledge_curators() {
        assert_eq!(
            daemon_kind_from_str("knowledge_curator"),
            Some(DaemonKind::KnowledgeCurator)
        );
        assert_eq!(daemon_kind_from_str("background_watcher"), None);
        assert_eq!(daemon_kind_from_str("state_synthesizer"), None);
    }

    #[test]
    fn active_kind_lookup_requires_the_exact_persisted_daemon_kind() {
        let source = include_str!("daemon_registry.rs");
        let start = source
            .rfind("pub async fn get_active_daemon_for_kind")
            .expect("lookup exists");
        let end = source[start..]
            .find("\npub async fn get_daemon_registration")
            .map(|offset| start + offset)
            .expect("registration lookup follows exact-kind lookup");
        let function_source = &source[start..end];
        assert!(function_source.contains("AND daemon_kind = $2"));
        assert!(function_source.contains(".bind(daemon_kind_slug(&kind))"));
        assert!(!function_source.contains("get_active_daemons(db"));
    }

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

    #[test]
    fn daemon_health_timestamp_accepts_rfc3339_and_postgres_text() {
        let rfc3339 = parse_timestamp("2026-11-21T15:14:19.674875+00:00")
            .expect("RFC 3339 heartbeat timestamp");
        let postgres = parse_timestamp("2026-11-21 15:14:19.674875+00")
            .expect("PostgreSQL timestamptz text");

        assert_eq!(rfc3339, postgres);
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
          AND daemon_kind IN (
              'knowledge_curator', 'ledger_ingestion', 'email_gateway',
              'relational_sync', 'archive_cold_storage', 'health_maintenance'
          )
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
        WHERE user_id = $1
          AND daemon_kind = $2
          AND status = 'active'
        ORDER BY created_at ASC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(daemon_kind_slug(&kind))
    .fetch_optional(&db.pool)
    .await?;
    row.as_ref().map(registration_from_row).transpose()
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

const HEARTBEAT_RETENTION_HOURS_ENV: &str = "OMNYID_DAEMON_HEARTBEAT_RETENTION_HOURS";
const HEARTBEAT_MAX_ROWS_ENV: &str = "OMNYID_DAEMON_HEARTBEAT_MAX_ROWS";
const HEARTBEAT_RETENTION_HOURS_DEFAULT: i64 = 48;
// ~480 bytes per row including indexes, so the default cap is roughly 240 MB.
const HEARTBEAT_MAX_ROWS_DEFAULT: i64 = 500_000;
const HEARTBEAT_PRUNE_BATCH: i64 = 10_000;
// Bounds WAL growth and lock time; a large backlog drains over several passes.
const HEARTBEAT_PRUNE_MAX_BATCHES_PER_PASS: u32 = 100;
const CURATOR_AUDIT_RETENTION_HOURS_ENV: &str = "OMNYID_CURATOR_AUDIT_RETENTION_HOURS";
const CURATOR_AUDIT_RETENTION_HOURS_DEFAULT: i64 = 7 * 24;
const CURATOR_AUDIT_PRUNE_BATCH: i64 = 5_000;
const CURATOR_AUDIT_PRUNE_MAX_BATCHES_PER_PASS: u32 = 20;
const RATE_LIMIT_RETENTION_HOURS: i64 = 47;
const RATE_LIMIT_PRUNE_BATCH: i64 = 5_000;
const RATE_LIMIT_PRUNE_MAX_BATCHES_PER_PASS: u32 = 20;
const SITE_MEASUREMENT_RETENTION_DAYS: i32 = 30;
const SITE_MEASUREMENT_PRUNE_BATCH: i64 = 1_000;
const SITE_MEASUREMENT_PRUNE_MAX_BATCHES_PER_PASS: u32 = 4;

fn positive_limit(raw: Option<&str>, default: i64) -> i64 {
    raw.and_then(|value| value.trim().parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn heartbeat_limit(key: &str, default: i64) -> i64 {
    positive_limit(std::env::var(key).ok().as_deref(), default)
}

/// Keeps `daemon_heartbeats` a rolling log: rows older than the retention window are
/// dropped, and if the table still exceeds the row cap the oldest rows go first.
/// Returns the number of rows deleted in this pass.
pub async fn prune_heartbeats(db: &Db) -> Result<u64, sqlx::Error> {
    let retention_hours = heartbeat_limit(
        HEARTBEAT_RETENTION_HOURS_ENV,
        HEARTBEAT_RETENTION_HOURS_DEFAULT,
    );
    let max_rows = heartbeat_limit(HEARTBEAT_MAX_ROWS_ENV, HEARTBEAT_MAX_ROWS_DEFAULT);

    // The cutoff is computed once so each delete batch is a plain index range scan.
    let cutoff: String = sqlx::query_scalar(
        r#"
        SELECT GREATEST(
            now() - make_interval(hours => $1::int),
            COALESCE(
                (SELECT created_at FROM daemon_heartbeats
                 ORDER BY created_at DESC OFFSET $2 LIMIT 1),
                '-infinity'::timestamptz
            )
        )::text
        "#,
    )
    .bind(retention_hours)
    .bind(max_rows)
    .fetch_one(&db.pool)
    .await?;

    let mut deleted_total = 0u64;
    for _ in 0..HEARTBEAT_PRUNE_MAX_BATCHES_PER_PASS {
        let deleted = sqlx::query(
            r#"
            DELETE FROM daemon_heartbeats
            WHERE heartbeat_id IN (
                SELECT heartbeat_id FROM daemon_heartbeats
                WHERE created_at < $1::timestamptz
                ORDER BY created_at
                LIMIT $2
            )
            "#,
        )
        .bind(&cutoff)
        .bind(HEARTBEAT_PRUNE_BATCH)
        .execute(&db.pool)
        .await?
        .rows_affected();
        deleted_total += deleted;
        if deleted < HEARTBEAT_PRUNE_BATCH as u64 {
            break;
        }
    }
    Ok(deleted_total)
}

async fn prune_curator_run_audits(db: &Db) -> Result<u64, sqlx::Error> {
    let retention_hours = heartbeat_limit(
        CURATOR_AUDIT_RETENTION_HOURS_ENV,
        CURATOR_AUDIT_RETENTION_HOURS_DEFAULT,
    );
    let mut deleted_total = 0u64;
    for _ in 0..CURATOR_AUDIT_PRUNE_MAX_BATCHES_PER_PASS {
        let deleted = sqlx::query(
            r#"
            DELETE FROM curator_run_audit audit
            USING (
                SELECT run_id
                FROM curator_run_audit
                WHERE created_at < NOW() - make_interval(hours => $1::int)
                ORDER BY created_at
                LIMIT $2
                FOR UPDATE SKIP LOCKED
            ) stale
            WHERE audit.run_id = stale.run_id
            "#,
        )
        .bind(retention_hours)
        .bind(CURATOR_AUDIT_PRUNE_BATCH)
        .execute(&db.pool)
        .await?
        .rows_affected();
        deleted_total += deleted;
        if deleted < CURATOR_AUDIT_PRUNE_BATCH as u64 {
            break;
        }
    }
    Ok(deleted_total)
}

async fn prune_rate_limit_history(db: &Db) -> Result<u64, sqlx::Error> {
    let mut deleted_total = 0u64;
    for _ in 0..RATE_LIMIT_PRUNE_MAX_BATCHES_PER_PASS {
        let deleted = sqlx::query(
            r#"
            DELETE FROM rate_limit_log rate_log
            USING (
                SELECT ctid
                FROM rate_limit_log
                WHERE request_time < NOW() - make_interval(hours => $1::int)
                ORDER BY request_time
                LIMIT $2
                FOR UPDATE SKIP LOCKED
            ) stale
            WHERE rate_log.ctid = stale.ctid
            "#,
        )
        .bind(RATE_LIMIT_RETENTION_HOURS)
        .bind(RATE_LIMIT_PRUNE_BATCH)
        .execute(&db.pool)
        .await?
        .rows_affected();
        deleted_total += deleted;
        if deleted < RATE_LIMIT_PRUNE_BATCH as u64 {
            break;
        }
    }
    Ok(deleted_total)
}

/// Bounds high-volume daemon observability using independently committed batches.
pub async fn prune_operational_daemon_history(db: &Db) -> Result<(u64, u64, u64), sqlx::Error> {
    let heartbeats = prune_heartbeats(db).await?;
    let curator_audits = prune_curator_run_audits(db).await?;
    let rate_limit_rows = prune_rate_limit_history(db).await?;
    for _ in 0..SITE_MEASUREMENT_PRUNE_MAX_BATCHES_PER_PASS {
        let deleted = db
            .prune_wedding_site_measurement_batch(
                SITE_MEASUREMENT_RETENTION_DAYS,
                SITE_MEASUREMENT_PRUNE_BATCH,
            )
            .await?;
        if deleted < SITE_MEASUREMENT_PRUNE_BATCH as u64 {
            break;
        }
    }
    sqlx::query(
        "DELETE FROM wedding_binder_requests WHERE requested_at < NOW() - INTERVAL '12 months'",
    )
    .execute(&db.pool)
    .await?;
    sqlx::query(
        "UPDATE operator_email_relay_threads SET status = 'closed', closed_at = COALESCE(closed_at, NOW()) WHERE status = 'active' AND last_activity_at < NOW() - INTERVAL '365 days'",
    )
    .execute(&db.pool)
    .await?;
    sqlx::query(
        r#"DELETE FROM operator_email_relay_events event
            USING operator_email_relay_threads thread
           WHERE event.relay_thread_id = thread.relay_thread_id
             AND thread.status <> 'active'
             AND event.created_at < NOW() - INTERVAL '90 days'"#,
    )
    .execute(&db.pool)
    .await?;
    sqlx::query(
        "DELETE FROM operator_email_relay_threads WHERE status <> 'active' AND last_activity_at < NOW() - INTERVAL '365 days'",
    )
    .execute(&db.pool)
    .await?;
    Ok((heartbeats, curator_audits, rate_limit_rows))
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
              AND daemon_kind IN (
                  'knowledge_curator', 'ledger_ingestion', 'email_gateway',
                  'relational_sync', 'archive_cold_storage', 'health_maintenance'
              )
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
              AND daemon_kind IN (
                  'knowledge_curator', 'ledger_ingestion', 'email_gateway',
                  'relational_sync', 'archive_cold_storage', 'health_maintenance'
              )
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
        let Some(daemon_kind) = daemon_kind_from_str(&row.get::<String, _>("daemon_kind")) else {
            continue;
        };
        warnings.push(StaleHeartbeatWarning {
            daemon_id: row.get("daemon_id"),
            user_id: row.get("user_id"),
            daemon_kind,
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
    let kind_label = row.get::<String, _>("daemon_kind");
    let daemon_kind = daemon_kind_from_str(&kind_label).ok_or_else(|| {
        sqlx::Error::Decode(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("unsupported system daemon kind: {kind_label}"),
        )))
    })?;
    Ok(DaemonRegistration {
        daemon_id: row.get("daemon_id"),
        user_id: row.get("user_id"),
        daemon_kind,
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

fn daemon_kind_from_str(value: &str) -> Option<DaemonKind> {
    match value {
        "knowledge_curator" => Some(DaemonKind::KnowledgeCurator),
        "ledger_ingestion" => Some(DaemonKind::LedgerIngestion),
        "email_gateway" => Some(DaemonKind::EmailGateway),
        "relational_sync" => Some(DaemonKind::RelationalSync),
        "archive_cold_storage" => Some(DaemonKind::ArchiveColdStorage),
        "health_maintenance" => Some(DaemonKind::HealthMaintenance),
        _ => None,
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
        .or_else(|_| DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f%#z"))
        .ok()
        .map(|value| value.with_timezone(&Utc))
}
