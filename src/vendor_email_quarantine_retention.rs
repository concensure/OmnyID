//! Bounded destruction of expired vendor-email quarantine ciphertext.
//!
//! Routing metadata remains as an auditable tombstone. The recipient-encrypted
//! RFC 822 envelope, including its ephemeral public-key material, is replaced
//! so neither the server nor an operator can recover expired correspondence.

use std::time::Duration;

use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::{daemon_runtime::ShutdownRx, db::Db};

const RETENTION_BATCH: i64 = 250;
const RETENTION_INTERVAL: Duration = Duration::from_secs(60);

pub async fn destroy_expired_vendor_email_quarantine(
    db: &Db,
    batch_limit: i64,
) -> Result<u64, sqlx::Error> {
    let limit = batch_limit.clamp(1, 1_000);
    let rows = sqlx::query(
        r#"WITH expired AS (
               SELECT quarantine_id
                 FROM wedding_vendor_email_ingress_quarantine
                WHERE expires_at <= NOW()
                  AND deleted_at IS NULL
                ORDER BY expires_at, quarantine_id
                LIMIT $1
                FOR UPDATE SKIP LOCKED
           )
           UPDATE wedding_vendor_email_ingress_quarantine AS quarantine
              SET ciphertext_envelope = jsonb_build_object(
                      'scheme', 'destroyed',
                      'reason', 'retention_expired'
                  ),
                  processing_status = 'expired',
                  error_code = 'retention_expired',
                  processed_at = COALESCE(processed_at, NOW()),
                  deleted_at = NOW()
             FROM expired
            WHERE quarantine.quarantine_id = expired.quarantine_id
        RETURNING quarantine.quarantine_id"#,
    )
    .bind(limit)
    .fetch_all(&db.pool)
    .await?;
    Ok(rows.len() as u64)
}

pub fn start_vendor_email_quarantine_retention(db: Db, mut shutdown: ShutdownRx) -> JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match destroy_expired_vendor_email_quarantine(&db, RETENTION_BATCH).await {
                Ok(0) => {}
                Ok(destroyed) => {
                    info!(
                        destroyed,
                        "Destroyed expired vendor-email quarantine ciphertext"
                    )
                }
                Err(error) => {
                    warn!(%error, "Vendor-email quarantine retention pass failed")
                }
            }
            tokio::select! {
                _ = tokio::time::sleep(RETENTION_INTERVAL) => {}
                changed = shutdown.changed() => {
                    if changed.is_err() || *shutdown.borrow() {
                        break;
                    }
                }
            }
        }
    })
}
