/*
 * @module-id: rust.ledger-ingestion-daemon
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use std::time::Duration;

use futures_util::future::join_all;
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::{
    coordination_bus::{CoordFamily, DaemonCursor, coordination_bus},
    daemon_registry,
    db::Db,
    knowledge_curator::DaemonKind,
    ledger_ingestion_runtime::{
        persist_ingestion_pass_messages, run_ledger_ingestion_backfill_pass,
    },
    message::AfpTieredLedgerContent,
};

const DEFAULT_PREVIEW_LIMIT: i64 = 24;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LedgerIngestionTarget {
    pub thread_id: String,
    pub ledger: AfpTieredLedgerContent,
}

pub fn default_ledger_ingestion_target() -> LedgerIngestionTarget {
    LedgerIngestionTarget {
        thread_id: "thread.ledger_ingestion.session".to_string(),
        ledger: AfpTieredLedgerContent {
            name: "Auto Context Ledger".to_string(),
            tier: "session".to_string(),
            description: Some(
                "Metadata-first ledger target for background topology and context ingestion."
                    .to_string(),
            ),
            ..Default::default()
        },
    }
}

/// Minimum seconds between passes when Bridge A wakeups are active.
/// Prevents a burst of coordination writes from busy-looping the daemon.
const MIN_IDLE_SECS: u64 = 2;

pub fn start_ledger_ingestion_daemon(
    db: Db,
    mut shutdown: crate::daemon_runtime::ShutdownRx,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        info!("Ledger Ingestion daemon started");
        let mut idle_secs: u64 = 30;
        // Subscribe before the loop so we never miss a wakeup that fires
        // between two passes.
        let mut wake = coordination_bus().subscribe();
        // Bridge B: track which families this daemon cares about.
        let mut cursor = DaemonCursor::new(&[
            CoordFamily::Ingestion,
            CoordFamily::Watcher,
            CoordFamily::Other,
        ]);
        loop {
            // Bridge B hot-path skip: if the cursor hasn't advanced for our
            // families since the last pass, skip the DB work entirely.
            let pass_result = if cursor.should_run() {
                let r = run_ledger_ingestion_pass_for_all_users(&db).await;
                cursor.commit();
                r
            } else {
                Ok(0)
            };
            match pass_result {
                Ok(total) if total > 0 => idle_secs = 30,
                Ok(_) => idle_secs = idle_secs.saturating_mul(2).min(180),
                Err(err) => {
                    warn!(%err, "Ledger Ingestion pass failed");
                    idle_secs = idle_secs.saturating_mul(2).min(180);
                }
            }

            // Add sub-second jitter to the sleep interval using the current
            // timestamp's sub-millisecond bits.  This distributes concurrent
            // daemon instances across a ~1 s window, preventing thundering-herd
            // DB load after each backoff reset.
            let jitter_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .subsec_millis()
                % 1000;

            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(idle_secs) + Duration::from_millis(jitter_ms as u64)) => {}
                // Bridge A: a coordination AFP was just written â€” wake immediately
                // and reset idle backoff.  Lagged is treated as a wakeup (safe:
                // at worst triggers one extra pass).  Closed exits cleanly.
                res = wake.recv() => {
                    use tokio::sync::broadcast::error::RecvError;
                    match res {
                        Ok(w) => {
                            // Only wake for families this daemon cares about.
                            if matches!(w.family, CoordFamily::Watcher | CoordFamily::Ingestion | CoordFamily::Other) {
                                idle_secs = MIN_IDLE_SECS;
                            }
                        }
                        Err(RecvError::Lagged(_)) => { idle_secs = MIN_IDLE_SECS; }
                        Err(RecvError::Closed) => break,
                    }
                }
                _ = shutdown.changed() => {
                    if *shutdown.borrow() {
                        info!("Ledger Ingestion daemon: graceful shutdown");
                        break;
                    }
                }
            }
        }
    })
}

pub async fn run_ledger_ingestion_backfill_for_user(
    db: &Db,
    user_id: &str,
) -> Result<u32, sqlx::Error> {
    let Some(registration) =
        daemon_registry::get_active_daemon_for_kind(db, user_id, DaemonKind::LedgerIngestion)
            .await?
    else {
        return Ok(0);
    };

    let stored = run_user_ledger_ingestion_pass(db, user_id).await?;
    daemon_registry::record_heartbeat(db, &registration.daemon_id, user_id, 0, stored, 0, 0)
        .await?;
    Ok(stored)
}

async fn run_ledger_ingestion_pass_for_all_users(db: &Db) -> Result<u32, sqlx::Error> {
    let user_ids = db.list_user_ids().await?;
    let handles: Vec<_> = user_ids
        .into_iter()
        .map(|user_id| {
            let db = db.clone();
            tokio::spawn(async move {
                let registration = daemon_registry::get_active_daemon_for_kind(
                    &db,
                    &user_id,
                    DaemonKind::LedgerIngestion,
                )
                .await;
                let Ok(Some(registration)) = registration else {
                    return 0u32;
                };
                if let Err(err) = db.ensure_user_private_schema(&user_id).await {
                    warn!(%err, %user_id, "Ledger ingestion failed to ensure tenant schema");
                    return 0u32;
                }

                let stored = run_user_ledger_ingestion_pass(&db, &user_id)
                    .await
                    .unwrap_or_else(|err| {
                        warn!(%err, %user_id, "Ledger Ingestion pass failed for user");
                        0
                    });
                // Always record a heartbeat regardless of whether new messages were stored.
                // Monitoring that relies on heartbeat presence will otherwise flag idle
                // (but healthy) users as dead when their ingestion window is quiet.
                let _ = daemon_registry::record_heartbeat(
                    &db,
                    &registration.daemon_id,
                    &user_id,
                    0,
                    stored,
                    0,
                    0,
                )
                .await;
                stored
            })
        })
        .collect();

    let results = join_all(handles).await;
    Ok(results.into_iter().filter_map(|result| result.ok()).sum())
}

async fn run_user_ledger_ingestion_pass(db: &Db, user_id: &str) -> Result<u32, sqlx::Error> {
    let target = default_ledger_ingestion_target();
    let result = run_ledger_ingestion_backfill_pass(
        db,
        user_id,
        &target.ledger,
        &target.thread_id,
        DEFAULT_PREVIEW_LIMIT,
        None, // ledger creation date not yet plumbed through the daemon layer
    )
    .await?;
    persist_ingestion_pass_messages(db, user_id, &result).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_target_is_session_scoped_and_stable() {
        let target = default_ledger_ingestion_target();
        assert_eq!(target.thread_id, "thread.ledger_ingestion.session");
        assert_eq!(target.ledger.tier, "session");
        assert_eq!(target.ledger.name, "Auto Context Ledger");
    }
}
