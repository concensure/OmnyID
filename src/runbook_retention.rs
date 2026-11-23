//! Retention applies to rebuildable projections only. Private AFP evidence,
//! definitions, traces, approvals, dedupe receipts and current quotas are retained.
use crate::{
    runbook_contract::Result,
    runbook_outcome::{Outcome, validate},
    runbook_store::{RunbookStore, digest},
};
use chrono::{DateTime, Duration, Utc};
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub const OUTCOME_PROJECTION_DAYS: i64 = 30;
pub const RETENTION_BATCH_LIMIT: usize = 100;

/// Requires verified owner-private receipts in production. A later regret extends
/// retention of its projection; IDs claimed by the generic outcome API are not
/// sufficient evidence to delete any row. An incomplete regret chain fails closed.
pub fn expired_projection_ids(
    owner: &str,
    records: &[Value],
    now: DateTime<Utc>,
) -> Result<Vec<String>> {
    if records.len() > 4096 {
        return Err("outcome_history_limit");
    }
    let mut candidates = BTreeMap::<String, (DateTime<Utc>, bool, bool)>::new();
    for value in records {
        let receipt = validate(owner, value)?;
        let at =
            DateTime::parse_from_rfc3339(value["timestamp"].as_str().ok_or("invalid_outcome")?)
                .map_err(|_| "invalid_outcome")?
                .with_timezone(&Utc);
        if at > now {
            return Err("future_outcome");
        }
        let root = digest(&json!(["runbook_outcome.v1", owner, receipt.trace_id]));
        let entry = candidates.entry(root).or_insert((at, false, false));
        entry.0 = entry.0.max(at);
        if receipt.outcome == Outcome::Regretted {
            entry.2 = true;
        } else {
            entry.1 = true;
        }
    }
    if candidates
        .values()
        .any(|(_, root, regret)| *regret && !root)
    {
        return Err("acceptance_required");
    }
    Ok(candidates
        .into_iter()
        .filter(|(_, (at, _, _))| *at < now - Duration::days(OUTCOME_PROJECTION_DAYS))
        .map(|(id, _)| id)
        .collect())
}

impl RunbookStore<'_> {
    /// Existing owner lock serializes with feedback writes and account erasure.
    /// No wildcard deletes, private ledger pruning or user-supplied cutoff.
    pub async fn prune_derived_outcomes(&self, owner: &str) -> Result<u32> {
        let mut tx = self.begin(owner).await?;
        let records = self
            .read_kind(owner, "runbook_outcome", None, None, &mut tx)
            .await?;
        let ids = expired_projection_ids(owner, &records, Utc::now())?;
        let count=sqlx::query("DELETE FROM proactive_outcomes WHERE owner_user_id=$1 AND id IN (SELECT id FROM proactive_outcomes WHERE owner_user_id=$1 AND id=ANY($2) AND created_at<NOW()-INTERVAL '30 days' ORDER BY id LIMIT $3)")
            .bind(owner).bind(&ids).bind(RETENTION_BATCH_LIMIT as i64).execute(&mut *tx).await.map_err(|_|"storage_unavailable")?.rows_affected();
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(count as u32)
    }
}
