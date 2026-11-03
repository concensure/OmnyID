// @module-id: server.openrouter-funded-inference
// @primary-capability: hard-capped-platform-funded-inference
// @locs-version: 1.0

use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use ulid::Ulid;

const MODEL: &str = "openai/gpt-5-mini";
const MAX_WEEKLY_USD: f64 = 50.0;
const DEFAULT_RESERVATION_USD: f64 = 0.02;

pub(super) struct FundedInferenceRequest<'a> {
    pub feature: &'a str,
    pub user_id: Option<&'a str>,
    pub wedding_plan_id: Option<&'a str>,
    pub abuse_id: &'a str,
    pub system: &'a str,
    pub prompt: &'a str,
    pub max_tokens: u32,
    pub json_mode: bool,
}

pub(super) struct FundedInferenceResult {
    pub content: String,
    pub model: String,
    pub usage_id: String,
    pub cost_usd: f64,
}

fn weekly_cap_usd() -> f64 {
    std::env::var("OMNYID_OPENROUTER_WEEKLY_CAP_USD")
        .ok()
        .and_then(|value| value.trim().parse::<f64>().ok())
        .filter(|value| *value > 0.0)
        .map(|value| value.min(MAX_WEEKLY_USD))
        .unwrap_or(MAX_WEEKLY_USD)
}

fn enabled() -> bool {
    matches!(
        std::env::var("OMNYID_OPENROUTER_FUNDED_ENABLED")
            .ok()
            .as_deref(),
        Some("1" | "true" | "TRUE")
    )
}

fn api_key() -> Option<String> {
    crate::secret_manager::read_process_secret_trimmed("OPENROUTER_API_KEY")
        .or_else(|| crate::secret_manager::read_process_secret_trimmed("OMNYID_OPENROUTER_API_KEY"))
}

async fn reserve(pool: &PgPool, request: &FundedInferenceRequest<'_>) -> Result<String, String> {
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('omnyid:platform-funded-ai:weekly-cap'))")
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    let spent: f64 = sqlx::query(
        "SELECT COALESCE(SUM(COALESCE(actual_cost_usd, reserved_cost_usd)), 0)::double precision AS spent
         FROM platform_funded_ai_usage
         WHERE status <> 'failed' AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'"
    ).fetch_one(&mut *transaction).await.map_err(|error| error.to_string())?
        .try_get("spent").map_err(|error| error.to_string())?;
    if spent + DEFAULT_RESERVATION_USD > weekly_cap_usd() {
        return Err("The weekly funded research allowance has been reached.".to_string());
    }
    let id = format!("funded-ai-{}", Ulid::new());
    let fingerprint = hex::encode(Sha256::digest(
        format!("{}:{}", request.feature, request.prompt).as_bytes(),
    ));
    sqlx::query(
        "INSERT INTO platform_funded_ai_usage
         (id, feature, user_id, wedding_plan_id, request_fingerprint, model, status, reserved_cost_usd)
         VALUES ($1, $2, $3, $4, $5, $6, 'reserved', $7)"
    )
    .bind(&id).bind(request.feature).bind(request.user_id).bind(request.wedding_plan_id)
    .bind(fingerprint).bind(MODEL).bind(DEFAULT_RESERVATION_USD)
    .execute(&mut *transaction).await.map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(id)
}

async fn finish(pool: &PgPool, id: &str, status: &str, cost: f64, provider_id: Option<&str>) {
    let _ = sqlx::query(
        "UPDATE platform_funded_ai_usage SET status = $2, actual_cost_usd = $3,
         provider_request_id = $4, completed_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .bind(status)
    .bind(cost.max(0.0))
    .bind(provider_id)
    .execute(pool)
    .await;
}

pub(super) async fn infer(
    pool: &PgPool,
    client: &reqwest::Client,
    request: FundedInferenceRequest<'_>,
) -> Result<FundedInferenceResult, String> {
    if !enabled() {
        return Err("Funded inference is not enabled.".to_string());
    }
    let key = api_key().ok_or_else(|| "Funded inference is not configured.".to_string())?;
    let usage_id = reserve(pool, &request).await?;
    let abuse_hash = hex::encode(Sha256::digest(request.abuse_id.as_bytes()));
    let mut body = serde_json::json!({
        "model": MODEL,
        "max_completion_tokens": request.max_tokens.min(900),
        "temperature": 0.35,
        "user": abuse_hash,
        "messages": [
            { "role": "system", "content": request.system },
            { "role": "user", "content": request.prompt }
        ],
        "provider": { "data_collection": "deny", "require_parameters": true }
    });
    if request.json_mode {
        body["response_format"] = serde_json::json!({ "type": "json_object" });
    }
    let response = tokio::time::timeout(
        std::time::Duration::from_secs(18),
        client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .bearer_auth(key)
            .header("HTTP-Referer", "https://omnyid.com/")
            .header("X-Title", "OmnyID funded planning research")
            .json(&body)
            .send(),
    )
    .await
    .map_err(|_| "The model request timed out.".to_string())
    .and_then(|result| result.map_err(|error| error.to_string()));
    let response = match response {
        Ok(response) => response,
        Err(error) => {
            finish(pool, &usage_id, "failed", 0.0, None).await;
            return Err(error);
        }
    };
    let status = response.status();
    let payload: Value = match response.json().await {
        Ok(payload) => payload,
        Err(error) => {
            finish(pool, &usage_id, "failed", 0.0, None).await;
            return Err(error.to_string());
        }
    };
    if !status.is_success() {
        finish(pool, &usage_id, "failed", 0.0, None).await;
        return Err(format!("OpenRouter returned {status}"));
    }
    let content = payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    if content.is_empty() {
        finish(pool, &usage_id, "failed", 0.0, None).await;
        return Err("The model returned an empty response.".to_string());
    }
    let cost = payload
        .pointer("/usage/cost")
        .and_then(Value::as_f64)
        .unwrap_or(DEFAULT_RESERVATION_USD);
    let provider_id = payload.get("id").and_then(Value::as_str);
    finish(pool, &usage_id, "completed", cost, provider_id).await;
    Ok(FundedInferenceResult {
        content,
        model: MODEL.to_string(),
        usage_id,
        cost_usd: cost,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configured_cap_can_never_exceed_fifty_dollars() {
        unsafe {
            std::env::set_var("OMNYID_OPENROUTER_WEEKLY_CAP_USD", "500");
        }
        assert_eq!(weekly_cap_usd(), 50.0);
        unsafe {
            std::env::remove_var("OMNYID_OPENROUTER_WEEKLY_CAP_USD");
        }
    }
}
