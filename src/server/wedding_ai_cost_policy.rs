//! Account and wedding-plan budget gate for platform-funded wedding inference.
//!
//! It reads the existing per-account `budget_configs` limit and the append-only
//! external-tool usage ledger. A wedding receives a bounded share of the account
//! budget so one plan cannot consume every funded call. The gate never weakens
//! grounding: callers use a deterministic template or manual review when blocked.

use crate::db::Db;
use sqlx::Row;

const DEFAULT_PLAN_BUDGET_RATIO: f64 = 0.5;
const SOFT_LIMIT_RATIO: f64 = 0.8;

#[derive(Clone, Debug, PartialEq)]
pub struct WeddingAiBudgetDecision {
    pub allow_model: bool,
    pub near_limit: bool,
    pub account_cost_usd: f64,
    pub plan_cost_usd: f64,
    pub account_tokens: i64,
    pub plan_tokens: i64,
    pub account_cost_limit_usd: f64,
    pub plan_cost_limit_usd: f64,
    pub account_token_limit: i64,
    pub plan_token_limit: i64,
}

fn plan_budget_ratio() -> f64 {
    std::env::var("OMNYID_WEDDING_AI_PLAN_BUDGET_RATIO")
        .ok()
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite() && (0.05..=1.0).contains(value))
        .unwrap_or(DEFAULT_PLAN_BUDGET_RATIO)
}

pub async fn wedding_ai_budget_decision(
    db: &Db,
    user_id: &str,
    wedding_plan_id: &str,
    estimated_tokens: i64,
) -> Result<WeddingAiBudgetDecision, sqlx::Error> {
    let row = sqlx::query(
        r#"
        WITH active_budget AS (
            SELECT
                COALESCE(u.max_cost_usd, g.max_cost_usd, 0.10)::float8 AS max_cost_usd,
                COALESCE(u.max_llm_tokens, g.max_llm_tokens, 50000)::bigint AS max_llm_tokens
            FROM (SELECT 1) seed
            LEFT JOIN budget_configs u ON u.user_id = $1
            LEFT JOIN budget_configs g ON g.user_id IS NULL
            LIMIT 1
        ), usage AS (
            SELECT
                COALESCE(SUM(estimated_cost_usd), 0)::float8 AS account_cost,
                COALESCE(SUM(quantity) FILTER (WHERE usage_unit = 'tokens'), 0)::bigint AS account_tokens,
                COALESCE(SUM(estimated_cost_usd) FILTER (WHERE metadata_json->>'wedding_plan_id' = $2), 0)::float8 AS plan_cost,
                COALESCE(SUM(quantity) FILTER (WHERE usage_unit = 'tokens' AND metadata_json->>'wedding_plan_id' = $2), 0)::bigint AS plan_tokens
            FROM user_external_tool_usage_events
            WHERE user_id = $1
              AND provider_category = 'llm'
              AND billing_category = 'wedding_ai'
              AND occurred_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
        )
        SELECT * FROM active_budget CROSS JOIN usage
        "#,
    )
    .bind(user_id)
    .bind(wedding_plan_id)
    .fetch_one(&db.pool)
    .await?;
    let ratio = plan_budget_ratio();
    let account_cost_limit_usd = row.get::<f64, _>("max_cost_usd").max(0.0);
    let account_token_limit = row.get::<i64, _>("max_llm_tokens").max(0);
    let plan_cost_limit_usd = account_cost_limit_usd * ratio;
    let plan_token_limit = ((account_token_limit as f64) * ratio).round() as i64;
    let account_cost_usd = row.get::<f64, _>("account_cost").max(0.0);
    let plan_cost_usd = row.get::<f64, _>("plan_cost").max(0.0);
    let account_tokens = row.get::<i64, _>("account_tokens").max(0);
    let plan_tokens = row.get::<i64, _>("plan_tokens").max(0);
    let estimated_tokens = estimated_tokens.max(0);
    let hard = account_cost_usd >= account_cost_limit_usd
        || plan_cost_usd >= plan_cost_limit_usd
        || account_tokens.saturating_add(estimated_tokens) > account_token_limit
        || plan_tokens.saturating_add(estimated_tokens) > plan_token_limit;
    let near_limit = account_cost_usd >= account_cost_limit_usd * SOFT_LIMIT_RATIO
        || plan_cost_usd >= plan_cost_limit_usd * SOFT_LIMIT_RATIO
        || account_tokens.saturating_add(estimated_tokens) as f64 >= account_token_limit as f64 * SOFT_LIMIT_RATIO
        || plan_tokens.saturating_add(estimated_tokens) as f64 >= plan_token_limit as f64 * SOFT_LIMIT_RATIO;
    Ok(WeddingAiBudgetDecision {
        allow_model: !hard,
        near_limit,
        account_cost_usd,
        plan_cost_usd,
        account_tokens,
        plan_tokens,
        account_cost_limit_usd,
        plan_cost_limit_usd,
        account_token_limit,
        plan_token_limit,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_ratio_is_bounded() {
        assert!((0.05..=1.0).contains(&plan_budget_ratio()));
    }
}
