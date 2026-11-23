//! Bounded maintenance for vendor-published limited-date specials.
//!
//! Availability is removed from discovery as soon as a vendor confirmation
//! expires. Provisional holds return to availability only while their vendor
//! confirmation is still fresh. Each transition is written once; subsequent
//! passes are no-ops.

use std::time::Duration;

use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::{daemon_runtime::ShutdownRx, db::Db};

const MAINTENANCE_BATCH: i64 = 100;
const RETENTION_BATCH: i64 = 250;
const MAINTENANCE_INTERVAL: Duration = Duration::from_secs(300);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SpecialOfferMaintenanceOutcome {
    pub stale_slots: u64,
    pub expired_holds: u64,
    pub retired_operational_events: u64,
}

pub async fn maintain_vendor_special_offers(
    db: &Db,
    batch_limit: i64,
) -> Result<SpecialOfferMaintenanceOutcome, sqlx::Error> {
    let limit = batch_limit.clamp(1, 500);
    let mut tx = db.pool.begin().await?;
    let stale_slots = sqlx::query(
        r#"WITH candidates AS (
               SELECT slot_id
                 FROM wedding_vendor_special_offer_slots
                WHERE state IN ('available','enquiry_received')
                  AND confirmation_expires_at <= NOW()
                ORDER BY confirmation_expires_at, slot_id
                LIMIT $1
                FOR UPDATE SKIP LOCKED
           ), updated AS (
               UPDATE wedding_vendor_special_offer_slots AS slot
                  SET state='stale', revision=revision+1, updated_at=NOW()
                 FROM candidates
                WHERE slot.slot_id=candidates.slot_id
            RETURNING slot.vendor_id,slot.offer_id,slot.slot_id,slot.revision
           )
           INSERT INTO wedding_vendor_special_offer_events
               (event_id,vendor_id,offer_id,slot_id,event_kind,actor_kind,source_ref,dedupe_key,metadata)
           SELECT 'wvs_event_' || md5(slot_id || ':' || revision::TEXT), vendor_id, offer_id,
                  slot_id, 'stale', 'system', 'bounded_maintenance',
                  'maintenance:stale:' || slot_id || ':' || revision::TEXT,
                  jsonb_build_object('revision',revision,'reason','confirmation_expired','event_version','wedding_vendor_special_offer.v1')
             FROM updated
           ON CONFLICT (offer_id,event_kind,dedupe_key) DO NOTHING
        RETURNING event_id"#,
    )
    .bind(limit)
    .fetch_all(&mut *tx)
    .await?
    .len() as u64;

    let expired_holds = sqlx::query(
        r#"WITH candidates AS (
               SELECT slot_id
                 FROM wedding_vendor_special_offer_slots
                WHERE state='provisional_hold' AND hold_expires_at <= NOW()
                ORDER BY hold_expires_at, slot_id
                LIMIT $1
                FOR UPDATE SKIP LOCKED
           ), updated AS (
               UPDATE wedding_vendor_special_offer_slots AS slot
                  SET state=CASE WHEN confirmation_expires_at > NOW() THEN 'available' ELSE 'stale' END,
                      hold_expires_at=NULL, revision=revision+1, updated_at=NOW()
                 FROM candidates
                WHERE slot.slot_id=candidates.slot_id
            RETURNING slot.vendor_id,slot.offer_id,slot.slot_id,slot.revision,slot.state
           )
           INSERT INTO wedding_vendor_special_offer_events
               (event_id,vendor_id,offer_id,slot_id,event_kind,actor_kind,source_ref,dedupe_key,metadata)
           SELECT 'wvs_event_' || md5(slot_id || ':hold:' || revision::TEXT), vendor_id, offer_id,
                  slot_id, 'hold_expired', 'system', 'bounded_maintenance',
                  'maintenance:hold_expired:' || slot_id || ':' || revision::TEXT,
                  jsonb_build_object('revision',revision,'next_state',state,'event_version','wedding_vendor_special_offer.v1')
             FROM updated
           ON CONFLICT (offer_id,event_kind,dedupe_key) DO NOTHING
        RETURNING event_id"#,
    )
    .bind(limit)
    .fetch_all(&mut *tx)
    .await?
    .len() as u64;

    // These rows are content-light operational telemetry, not AFP authority.
    // Keep authoritative lifecycle events and remove only old high-volume
    // viewed/failure observations in bounded batches.
    let retired_operational_events = sqlx::query(
        r#"WITH retired AS (
               SELECT event_id
                 FROM wedding_vendor_special_offer_events
                WHERE event_kind IN ('viewed','delivery_failed')
                  AND occurred_at < NOW() - INTERVAL '90 days'
                ORDER BY occurred_at,event_id
                LIMIT $1
           )
           DELETE FROM wedding_vendor_special_offer_events AS event
            USING retired
            WHERE event.event_id=retired.event_id
        RETURNING event.event_id"#,
    )
    .bind(RETENTION_BATCH)
    .fetch_all(&mut *tx)
    .await?
    .len() as u64;
    tx.commit().await?;
    Ok(SpecialOfferMaintenanceOutcome {
        stale_slots,
        expired_holds,
        retired_operational_events,
    })
}

pub fn start_vendor_special_offer_maintenance(db: Db, mut shutdown: ShutdownRx) -> JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match maintain_vendor_special_offers(&db, MAINTENANCE_BATCH).await {
                Ok(outcome) if outcome != SpecialOfferMaintenanceOutcome::default() => info!(
                    stale_slots = outcome.stale_slots,
                    expired_holds = outcome.expired_holds,
                    retired_operational_events = outcome.retired_operational_events,
                    "Maintained Wedding limited-date specials"
                ),
                Ok(_) => {}
                Err(error) => warn!(%error, "Wedding limited-date-special maintenance failed"),
            }
            tokio::select! {
                _ = tokio::time::sleep(MAINTENANCE_INTERVAL) => {}
                changed = shutdown.changed() => {
                    if changed.is_err() || *shutdown.borrow() { break; }
                }
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;
    use ulid::Ulid;

    #[tokio::test]
    async fn disposable_postgres_transitions_each_expiry_once() {
        let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
            return;
        };
        assert!(
            database_url.contains("@127.0.0.1:") && database_url.ends_with("/omnyid_test"),
            "special-offer maintenance requires disposable local omnyid_test"
        );
        // The disposable harness owns migration replay. Re-running the full
        // historical catalogue here would make this focused test depend on
        // old, non-idempotent migrations rather than the maintenance worker.
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(&database_url)
            .await
            .expect("connect disposable database");
        let db = Db::from_pool(pool);
        // A previous interrupted focused run can leave an otherwise valid
        // expired fixture behind in the disposable database. Drain the global
        // worker queue before inserting this test's uniquely named rows so
        // the exact transition count below remains deterministic.
        for _ in 0..100 {
            let drained = maintain_vendor_special_offers(&db, 500)
                .await
                .expect("drain disposable maintenance queue");
            if drained.stale_slots == 0 && drained.expired_holds == 0 {
                break;
            }
        }
        let suffix = Ulid::new().to_string().to_ascii_lowercase();
        let vendor_id = format!("maintenance-vendor-{suffix}");
        let offer_id = format!("maintenance-offer-{suffix}");
        sqlx::query("INSERT INTO wedding_vendors(vendor_id,vendor_slug,vendor_name,category,service_area) VALUES($1,$1,$2,'Venue','Sydney NSW')")
            .bind(&vendor_id).bind(format!("Maintenance {suffix}")).execute(&db.pool).await.unwrap();
        sqlx::query("INSERT INTO wedding_vendor_special_offers(offer_id,vendor_id,creation_idempotency_key,category,title,summary,offer_type,currency,mandatory_charges_known) VALUES($1,$2,$3,'Venue','Test special','Disposable proof','minimum_spend','AUD',TRUE)")
            .bind(&offer_id).bind(&vendor_id).bind(format!("create-{suffix}")).execute(&db.pool).await.unwrap();
        for (offset, (slot_id, state, hold, confirmed, expires)) in [
            (
                format!("stale-{suffix}"),
                "available",
                None,
                "NOW()-INTERVAL '2 days'",
                "NOW()-INTERVAL '1 minute'",
            ),
            (
                format!("hold-{suffix}"),
                "provisional_hold",
                Some("NOW()-INTERVAL '1 minute'"),
                "NOW()-INTERVAL '1 day'",
                "NOW()+INTERVAL '1 day'",
            ),
        ]
        .into_iter()
        .enumerate()
        {
            let sql = format!(
                "INSERT INTO wedding_vendor_special_offer_slots(slot_id,offer_id,vendor_id,local_date,timezone,state,hold_expires_at,last_confirmed_at,confirmation_expires_at) VALUES($1,$2,$3,CURRENT_DATE+$5,'Australia/Sydney',$4,{}, {}, {})",
                hold.unwrap_or("NULL"),
                confirmed,
                expires
            );
            sqlx::query(&sql)
                .bind(slot_id)
                .bind(&offer_id)
                .bind(&vendor_id)
                .bind(state)
                .bind(30_i32 + offset as i32)
                .execute(&db.pool)
                .await
                .unwrap();
        }
        let first = maintain_vendor_special_offers(&db, 10).await.unwrap();
        assert_eq!((first.stale_slots, first.expired_holds), (1, 1));
        let second = maintain_vendor_special_offers(&db, 10).await.unwrap();
        assert_eq!((second.stale_slots, second.expired_holds), (0, 0));
        let states = sqlx::query_scalar::<_, String>("SELECT state FROM wedding_vendor_special_offer_slots WHERE offer_id=$1 ORDER BY slot_id")
            .bind(&offer_id).fetch_all(&db.pool).await.unwrap();
        assert_eq!(states, vec!["available", "stale"]);
        sqlx::query("DELETE FROM wedding_vendors WHERE vendor_id=$1")
            .bind(&vendor_id)
            .execute(&db.pool)
            .await
            .unwrap();
    }
}
