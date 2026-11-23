//! Explicit compatible Runbook funding through the existing shared usage ledger.
//! No prompt, source reference or credential is written to the accounting table.
use crate::{
    db::Db,
    runbook_llm_step::{BASE_MODEL, ESCALATION_MODEL, ModelFailure, ModelResponse},
};
use serde_json::json;

pub(crate) struct SharedRunbookReservation {
    pub(crate) api_key: String,
    id: String,
    owner: String,
    ceiling: u64,
}

pub(crate) async fn reserve_shared_runbook(
    db: &Db,
    owner: &str,
    model: &str,
    ceiling: u64,
) -> Result<SharedRunbookReservation, ModelFailure> {
    if !super::enabled()
        || std::env::var("OMNYID_RUNBOOK_SHARED_INFERENCE_ENABLED").as_deref() != Ok("true")
        || !crate::runbook_hooks::HookPolicy::from_env()
            .owners
            .contains(owner)
        || !matches!(model, BASE_MODEL | ESCALATION_MODEL)
        || ceiling == 0
        || ceiling > 1_000_000
    {
        return Err(ModelFailure::Provider);
    }
    let cfg = db
        .get_llm_config(owner)
        .await
        .map_err(|_| ModelFailure::Provider)?
        .ok_or(ModelFailure::Provider)?;
    // Hosted is an explicit account choice. Never fund a failed/incompatible BYOK
    // request or silently replace an owner's selected model/provider.
    if cfg["backend"] != "hosted" || cfg["provider"] != "openai" || cfg["model"] != BASE_MODEL {
        return Err(ModelFailure::ModelMismatch);
    }
    let monthly = cfg["monthly_budget_cents"]
        .as_i64()
        .filter(|v| *v > 0)
        .and_then(|v| v.checked_mul(10_000))
        .ok_or(ModelFailure::CostCeiling)?;
    let api_key = super::openai_api_key().ok_or(ModelFailure::Provider)?;
    let id = reserve(
        db,
        owner,
        model,
        ceiling,
        monthly,
        (super::weekly_cap_usd() * 1_000_000.0).floor() as i64,
    )
    .await?;
    Ok(SharedRunbookReservation {
        api_key,
        id,
        owner: owner.into(),
        ceiling,
    })
}

async fn reserve(
    db: &Db,
    owner: &str,
    model: &str,
    ceiling: u64,
    monthly: i64,
    weekly: i64,
) -> Result<String, ModelFailure> {
    let mut tx = db.pool.begin().await.map_err(|_| ModelFailure::Provider)?;
    let active: Option<String> = sqlx::query_scalar(
        "SELECT id FROM users WHERE id=$1 AND COALESCE(account_status,'active')='active' FOR SHARE",
    )
    .bind(owner)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| ModelFailure::Provider)?;
    if active.is_none() {
        return Err(ModelFailure::Provider);
    }
    // Lock and re-read account policy inside the reservation transaction. The
    // other inference paths charge this counter; do not give that spent budget
    // back merely because their costs are absent from the funded-feature ledger.
    let table = format!(
        "\"{}\".user_llm_config",
        crate::db::tenant_schema_name(owner)
    );
    let account: Option<(String, String, String, i32, i32)> = sqlx::query_as(&format!(
        "SELECT backend,provider,model,monthly_budget_cents,CASE WHEN usage_reset_at < DATE_TRUNC('month',NOW()) THEN 0 ELSE usage_cents_current_month END FROM {table} WHERE owner_user_id=$1 FOR SHARE"
    )).bind(owner).fetch_optional(&mut *tx).await.map_err(|_| ModelFailure::Provider)?;
    let (backend, provider, selected, budget, usage) = account.ok_or(ModelFailure::Provider)?;
    if backend != "hosted" || provider != "openai" || selected != BASE_MODEL {
        return Err(ModelFailure::ModelMismatch);
    }
    let remaining = i64::from(budget)
        .checked_sub(i64::from(usage.max(0)))
        .and_then(|v| v.checked_mul(10_000))
        .filter(|v| *v > 0)
        .ok_or(ModelFailure::CostCeiling)?;
    let monthly = monthly.min(remaining);
    // Same lock as every existing funded feature: reservations cannot race the
    // shared weekly cap. Integer microdollars avoid float comparisons at the cap.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('omnyid:platform-funded-ai:weekly-cap'))")
        .execute(&mut *tx)
        .await
        .map_err(|_| ModelFailure::Provider)?;
    let spent: (i64, i64) = sqlx::query_as(
        "SELECT CEIL(COALESCE(SUM(CASE WHEN created_at >= date_trunc('week',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN COALESCE(actual_cost_usd,reserved_cost_usd) ELSE 0 END),0)*1000000)::bigint,
        CEIL(COALESCE(SUM(CASE WHEN user_id=$1 AND created_at >= date_trunc('month',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN COALESCE(actual_cost_usd,reserved_cost_usd) ELSE 0 END),0)*1000000)::bigint
        FROM platform_funded_ai_usage WHERE status <> 'failed'"
    ).bind(owner).fetch_one(&mut *tx).await.map_err(|_| ModelFailure::Provider)?;
    let amount = i64::try_from(ceiling).map_err(|_| ModelFailure::CostCeiling)?;
    if spent.0.checked_add(amount).is_none_or(|v| v > weekly)
        || spent.1.checked_add(amount).is_none_or(|v| v > monthly)
    {
        return Err(ModelFailure::CostCeiling);
    }
    let id = format!("funded-runbook-{}", ulid::Ulid::new());
    let fingerprint = crate::runbook_store::digest(&json!(["runbook_funding.v1", owner, id]));
    sqlx::query("INSERT INTO platform_funded_ai_usage (id,feature,user_id,request_fingerprint,model,status,reserved_cost_usd) VALUES ($1,'runbook_model',$2,$3,$4,'reserved',$5::bigint::numeric/1000000)")
        .bind(&id).bind(owner).bind(fingerprint).bind(model).bind(amount)
        .execute(&mut *tx).await.map_err(|_| ModelFailure::Provider)?;
    tx.commit().await.map_err(|_| ModelFailure::Provider)?;
    Ok(id)
}

impl SharedRunbookReservation {
    /// Only a validated provider response reconciles a reservation. Cancellation,
    /// timeout, malformed responses and storage errors keep the full exposure.
    pub(crate) async fn finish(
        &self,
        db: &Db,
        response: &ModelResponse,
    ) -> Result<(), ModelFailure> {
        if response.cost_microunits > self.ceiling {
            return Err(ModelFailure::CostCeiling);
        }
        let changed = sqlx::query("UPDATE platform_funded_ai_usage SET status='completed',actual_cost_usd=$3::bigint::numeric/1000000,completed_at=NOW() WHERE id=$1 AND user_id=$2 AND feature='runbook_model' AND status='reserved' AND model=$4")
            .bind(&self.id).bind(&self.owner).bind(response.cost_microunits as i64).bind(&response.model)
            .execute(&db.pool).await.map_err(|_| ModelFailure::Provider)?.rows_affected();
        if changed != 1 {
            return Err(ModelFailure::Provider);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
