//! Privacy budgets shared by all runbooks for an account, including failed reads.
use crate::{runbook_contract::Result, runbook_store::RunbookStore};

pub const ACCOUNT_DAILY_DECRYPT_LIMIT: i64 = 128;

impl RunbookStore<'_> {
    /// Called only while the existing owner-row/Runbook transaction is held.
    /// This independent atomic reservation intentionally survives caller rollback:
    /// a failed step must not recover decrypt allowance. Existing behavioral memory
    /// supplies an owner-scoped counter; it contains no evidence or credentials.
    pub(crate) async fn reserve_evidence_decrypt(&self, owner: &str) -> Result<bool> {
        let charged = sqlx::query_scalar::<_, i64>(
            "INSERT INTO behavioral_memory (id,owner_user_id,pattern_key,evidence_count,last_observed_at,confidence,metadata) \
             VALUES ($1,$2,'runbook:decrypt_budget:v1',1,NOW(),0,'{}') \
             ON CONFLICT (owner_user_id,pattern_key) DO UPDATE SET \
             evidence_count=CASE WHEN behavioral_memory.last_observed_at AT TIME ZONE 'UTC' >= date_trunc('day',NOW() AT TIME ZONE 'UTC') \
             THEN behavioral_memory.evidence_count+1 ELSE 1 END,last_observed_at=NOW() \
             WHERE behavioral_memory.last_observed_at AT TIME ZONE 'UTC' < date_trunc('day',NOW() AT TIME ZONE 'UTC') \
             OR behavioral_memory.evidence_count<$3 RETURNING evidence_count::bigint"
        ).bind(ulid::Ulid::new().to_string()).bind(owner).bind(ACCOUNT_DAILY_DECRYPT_LIMIT)
            .fetch_optional(&self.db.pool).await.map_err(|_| "decrypt_budget_unavailable")?;
        Ok(charged.is_some())
    }
}

/// Explicit AFP entity references resolve to that exact private message ID.
/// No untyped IDs, mutable names, provider URLs, discovery scans or link chasing.
pub fn entity_afp_type(kind: &str) -> Option<&'static str> {
    match kind {
        "document" => Some(crate::message::AFP_TYPE_PARSED_DOCUMENT),
        "task" => Some("task"),
        _ => None,
    }
}
