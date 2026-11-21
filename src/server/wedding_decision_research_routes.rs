// @module-id: server.wedding-decision-research-routes
// @primary-capability: bounded-active-wedding-decision-research
// @locs-version: 1.0

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::{sync::Arc, time::Duration};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    openrouter_funded_inference::{self, FundedInferenceRequest},
    wedding_admin_ai_policy,
};

#[derive(Deserialize)]
struct Request {
    wedding_plan_id: String,
    task_id: String,
    title: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    context: Vec<String>,
    queue_rank: usize,
}

#[derive(Deserialize)]
struct ModelPayload {
    recommendation: String,
    report_markdown: String,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/decision-research", post(research_http))
        .layer(DefaultBodyLimit::max(24 * 1024))
}

fn bounded(value: &str, max: usize) -> Option<String> {
    let value = value.trim();
    (!value.is_empty() && value.chars().count() <= max).then(|| value.to_string())
}

async fn research_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<Request>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !wedding_admin_ai_policy::execution_enabled() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Wedding research is temporarily unavailable.".to_string(),
        ));
    }
    if request.queue_rank > 2 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Only the current, next and following decision can be researched.".to_string(),
        ));
    }
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_decision_research", &headers),
        RateLimitPolicy {
            max_requests: wedding_admin_ai_policy::daily_request_limit()
                .unwrap_or(6)
                .min(12),
            window: Duration::from_secs(86_400),
        },
    )
    .await?;
    let plan = bounded(&request.wedding_plan_id, 160).ok_or((
        StatusCode::BAD_REQUEST,
        "Wedding plan is required.".to_string(),
    ))?;
    let task_id = bounded(&request.task_id, 200)
        .ok_or((StatusCode::BAD_REQUEST, "Task is required.".to_string()))?;
    let title = bounded(&request.title, 240).ok_or((
        StatusCode::BAD_REQUEST,
        "Task title is required.".to_string(),
    ))?;
    let context = request
        .context
        .iter()
        .filter_map(|value| bounded(value, 600))
        .take(12)
        .collect::<Vec<_>>();
    let prompt = format!(
        "Decision: {title}\nNotes: {}\nSaved wedding context:\n- {}",
        request.notes.chars().take(1200).collect::<String>(),
        context.join("\n- ")
    );
    let input_hash = hex::encode(Sha256::digest(prompt.as_bytes()));
    if let Some(row) = sqlx::query("SELECT recommendation, report_markdown, model FROM wedding_decision_research_cache WHERE user_id=$1 AND wedding_plan_id=$2 AND task_id=$3 AND input_hash=$4")
        .bind(&user.id).bind(&plan).bind(&task_id).bind(&input_hash).fetch_optional(&state.db.pool).await.map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))? {
        return Ok(Json(json!({"recommendation": row.get::<String,_>("recommendation"), "report_markdown": row.get::<String,_>("report_markdown"), "model": row.get::<String,_>("model"), "cached": true})));
    }
    let system = "You are OmnyID's wedding planning research assistant. Analyse only the supplied wedding facts and task. Never invent a venue, route, live weather, price, availability, legal conclusion or web finding. Clearly separate saved evidence, reasonable planning guidance, unknowns and checks still needed. Give one specific user-facing recommendation, then a concise readable Markdown report with headings: What we know, Recommendation, What to verify, Next actions. Return only JSON with recommendation and report_markdown.";
    let result = openrouter_funded_inference::infer(
        &state.db.pool,
        &state.http_client,
        FundedInferenceRequest {
            feature: "wedding_decision_research",
            user_id: Some(&user.id),
            wedding_plan_id: Some(&plan),
            abuse_id: &user.id,
            system,
            prompt: &prompt,
            max_tokens: 750,
            json_mode: true,
        },
    )
    .await
    .map_err(|error| (StatusCode::SERVICE_UNAVAILABLE, error))?;
    let cleaned = result
        .content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let payload: ModelPayload = serde_json::from_str(cleaned).map_err(|_| {
        (
            StatusCode::BAD_GATEWAY,
            "Research could not be formatted safely.".to_string(),
        )
    })?;
    let recommendation = bounded(&payload.recommendation, 500).ok_or((
        StatusCode::BAD_GATEWAY,
        "Research was incomplete.".to_string(),
    ))?;
    let report = bounded(&payload.report_markdown, 8_000).ok_or((
        StatusCode::BAD_GATEWAY,
        "Research was incomplete.".to_string(),
    ))?;
    sqlx::query("INSERT INTO wedding_decision_research_cache (user_id,wedding_plan_id,task_id,input_hash,recommendation,report_markdown,model,usage_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING")
        .bind(&user.id).bind(&plan).bind(&task_id).bind(&input_hash).bind(&recommendation).bind(&report).bind(&result.model).bind(&result.usage_id)
        .execute(&state.db.pool).await.map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    Ok(Json(
        json!({"recommendation": recommendation, "report_markdown": report, "model": result.model, "cached": false}),
    ))
}
