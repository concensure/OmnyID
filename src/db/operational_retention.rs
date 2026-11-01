use serde_json::json;

use crate::{db::Db, knowledge_curator::DaemonHeartbeat};

fn heartbeat_is_meaningful(heartbeat: &DaemonHeartbeat) -> bool {
    heartbeat.queue_depth > 0
        || heartbeat.events_processed_last_hour > 0
        || heartbeat.tokens_used_today > 0
        || heartbeat.error_count_last_hour > 0
}

impl Db {
    pub async fn record_daemon_heartbeat(
        &self,
        heartbeat: &DaemonHeartbeat,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE daemon_registrations
            SET last_heartbeat_at = $2::timestamptz
            WHERE daemon_id = $1
            "#,
        )
        .bind(&heartbeat.daemon_id)
        .bind(&heartbeat.created_at)
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO daemon_heartbeats (
                heartbeat_id,
                daemon_id,
                user_id,
                metrics,
                created_at
            )
            SELECT $1, $2, $3, $4, $5::timestamptz
            WHERE $6
               OR NOT EXISTS (
                    SELECT 1
                    FROM daemon_heartbeats
                    WHERE daemon_id = $2
                      AND created_at >= $5::timestamptz - INTERVAL '15 minutes'
               )
            ON CONFLICT (heartbeat_id) DO NOTHING
            "#,
        )
        .bind(&heartbeat.heartbeat_id)
        .bind(&heartbeat.daemon_id)
        .bind(&heartbeat.user_id)
        .bind(json!({
            "queue_depth": heartbeat.queue_depth,
            "events_processed_last_hour": heartbeat.events_processed_last_hour,
            "tokens_used_today": heartbeat.tokens_used_today,
            "error_count_last_hour": heartbeat.error_count_last_hour,
        }))
        .bind(&heartbeat.created_at)
        .bind(heartbeat_is_meaningful(heartbeat))
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::heartbeat_is_meaningful;
    use crate::{db::MIGRATIONS, knowledge_curator::DaemonHeartbeat};

    fn heartbeat() -> DaemonHeartbeat {
        DaemonHeartbeat {
            heartbeat_id: "heartbeat-1".to_string(),
            daemon_id: "daemon-1".to_string(),
            user_id: "user-1".to_string(),
            queue_depth: 0,
            events_processed_last_hour: 0,
            tokens_used_today: 0,
            error_count_last_hour: 0,
            created_at: "2026-11-02T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn idle_heartbeat_is_sampled_while_meaningful_work_is_always_recorded() {
        let mut value = heartbeat();
        assert!(!heartbeat_is_meaningful(&value));
        value.events_processed_last_hour = 1;
        assert!(heartbeat_is_meaningful(&value));
        value.events_processed_last_hour = 0;
        value.error_count_last_hour = 1;
        assert!(heartbeat_is_meaningful(&value));
    }

    #[test]
    fn migration_adds_global_retention_and_retires_legacy_watcher() {
        let migration = MIGRATIONS
            .iter()
            .find(|entry| entry.0 == "0130_operational_retention_and_legacy_watcher")
            .expect("operational retention migration present");
        assert!(migration.2.contains("rate_limit_log_request_time_idx"));
        assert!(migration.2.contains("daemon_kind = 'background_watcher'"));
        assert!(migration.2.contains("status = 'revoked'"));
    }
}
