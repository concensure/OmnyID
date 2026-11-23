/*
 * @module-id: rust.coordination-listener
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Bridge C: Postgres LISTEN/NOTIFY â†’ in-process CoordinationBus forwarding.
///
/// Subscribes to the `afp_coordination` Postgres channel (created by migration
/// 0075_afp_coordination_notify.sql) and forwards each notification into the
/// in-process `CoordinationBus`, so multi-replica deployments benefit from
/// Bridge A wakeups without a separate message broker.
///
/// Modeled directly on `src/sync_worker.rs` which already uses `PgListener`
/// for the `new_message` channel.
///
/// Only spawned when `OMNYID_COORD_DB_NOTIFY=1`.
use sqlx::PgPool;
use tracing::{info, warn};

use crate::coordination_bus::{CoordFamily, coordination_bus};

/// Spawn the Bridge C listener task.  Should be called once at startup, gated
/// by `coordination_bus::db_notify_enabled()`.
pub async fn start_coordination_listener(pool: PgPool) {
    tokio::spawn(async move {
        // Reconnect loop: if the PgListener connection drops, restart it.
        loop {
            if let Err(err) = run_listener(&pool).await {
                warn!(%err, "Bridge C coordination listener error; reconnecting in 5 s");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    });
}

async fn run_listener(pool: &PgPool) -> Result<(), sqlx::Error> {
    let mut listener = sqlx::postgres::PgListener::connect_with(pool).await?;
    listener.listen("afp_coordination").await?;
    info!("Bridge C coordination listener connected (channel: afp_coordination)");

    loop {
        let notification = listener.recv().await?;
        // Payload format: "family_slug|owner_user_id"
        let payload = notification.payload();
        let (family_slug, user_id) = payload.split_once('|').unwrap_or((payload, ""));

        let family = CoordFamily::from_slug(family_slug);
        coordination_bus().notify(family, user_id);
    }
}
