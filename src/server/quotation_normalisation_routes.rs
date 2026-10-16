//! Authenticated, schema-bound quotation extraction.

use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};

use crate::{
    quotation::{
        ExtractionAttemptReceipt, ExtractionProposal, ExtractionSource, ValidatedExtraction,
        extraction_receipt, extraction_system_prompt, extraction_user_text,
        parse_extraction_proposal, resolve_category_registry, validate_extraction_proposal,
        validate_structured_submission,
    },
    wedding_shared_tool_metering::{
        WeddingSharedToolFeature, WeddingSharedToolUsageInput, record_wedding_shared_tool_usage,
    },
};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    wedding_admin_ai_policy,
    wedding_llm_ladder::{LadderOutcome, WeddingLlmFeature, run_ladder_with_temperature},
};

const MAX_OUTPUT_TOKENS: u32 = 6_000;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/quotation/normalisation/propose", post(propose_http))
}

#[derive(Deserialize)]
struct ProposeRequest {
    source_id: String,
    source_version_id: String,
    parsed_text: String,
    parser_version: String,
    registry_id: String,
    #[serde(default)]
    page_count: Option<u32>,
    #[serde(default)]
    section_names: Vec<String>,
    #[serde(default)]
    structured_submission: Option<ExtractionProposal>,
}

#[derive(Serialize)]
struct ProposeResponse {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    extraction: Option<ValidatedExtraction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    receipt: Option<ExtractionAttemptReceipt>,
    attempt_kinds: Vec<String>,
}

fn bounded_identifier(value: &str, label: &str) -> Result<String, (StatusCode, String)> {
    let value = value.trim();
    if value.is_empty() || value.len() > 180 || value.chars().any(char::is_control) {
        return Err((StatusCode::BAD_REQUEST, format!("invalid {label}")));
    }
    Ok(value.to_string())
}

async fn propose_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ProposeRequest>,
) -> Result<Json<ProposeResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("quotation_normalisation_burst", &headers),
        RateLimitPolicy {
            max_requests: 6,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("quotation_normalisation_daily", &headers),
        RateLimitPolicy {
            max_requests: wedding_admin_ai_policy::daily_request_limit().unwrap_or(1),
            window: Duration::from_secs(86_400),
        },
    )
    .await?;
    let source_id = bounded_identifier(&request.source_id, "source_id")?;
    let source_version_id = bounded_identifier(&request.source_version_id, "source_version_id")?;
    let parser_version = bounded_identifier(&request.parser_version, "parser_version")?;
    if request.section_names.len() > 500
        || request.section_names.iter().any(|name| name.len() > 500)
    {
        return Err((StatusCode::BAD_REQUEST, "invalid section_names".to_string()));
    }
    let registry = resolve_category_registry(&request.registry_id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "unknown registry_id".to_string()))?;
    let source = ExtractionSource {
        source_id: &source_id,
        source_version_id: &source_version_id,
        parsed_text: &request.parsed_text,
        page_count: request.page_count,
        section_names: &request.section_names,
    };
    let started = Instant::now();

    if !crate::quotation::QuotationFeatureFlags::from_env().extraction {
        return Ok(Json(ProposeResponse {
            status: "manual_review_required",
            extraction: None,
            receipt: None,
            attempt_kinds: vec!["feature_disabled".to_string()],
        }));
    }

    if let Some(proposal) = request.structured_submission {
        let extraction =
            validate_structured_submission(proposal, &registry, &source).map_err(|_| {
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "structured quotation is invalid".to_string(),
                )
            })?;
        let receipt = extraction_receipt(
            &source,
            &registry,
            &extraction,
            "structured_submission",
            "none",
            &parser_version,
            started.elapsed().as_millis() as u64,
            vec![],
        );
        return Ok(Json(ProposeResponse {
            status: "proposed",
            extraction: Some(extraction),
            receipt: Some(receipt),
            attempt_kinds: vec![],
        }));
    }

    let system = extraction_system_prompt(&registry).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "extraction prompt unavailable".to_string(),
        )
    })?;
    let user_text = extraction_user_text(&request.parsed_text)
        .map_err(|message| (StatusCode::BAD_REQUEST, message))?;
    if !wedding_admin_ai_policy::execution_enabled() {
        return Ok(Json(ProposeResponse {
            status: "manual_review_required",
            extraction: None,
            receipt: None,
            attempt_kinds: vec!["feature_disabled".to_string()],
        }));
    }

    let result = run_ladder_with_temperature(
        WeddingLlmFeature::QuoteNormalisation,
        &system,
        &user_text,
        MAX_OUTPUT_TOKENS,
        0.0,
        |raw| {
            let proposal = parse_extraction_proposal(raw)?;
            validate_extraction_proposal(proposal, &registry, &source)
        },
    )
    .await;
    let (value, provider, model, attempts) = match result {
        LadderOutcome::Success {
            value,
            provider,
            model,
            attempts,
        } => (value, provider, model, attempts),
        LadderOutcome::Exhausted { attempts } => {
            return Ok(Json(ProposeResponse {
                status: "manual_review_required",
                extraction: None,
                receipt: None,
                attempt_kinds: attempts
                    .into_iter()
                    .map(|attempt| format!("{}:{}", attempt.provider.label(), attempt.error_kind))
                    .collect(),
            }));
        }
    };
    let attempt_kinds = attempts
        .into_iter()
        .map(|attempt| format!("{}:{}", attempt.provider.label(), attempt.error_kind))
        .collect::<Vec<_>>();
    let receipt = extraction_receipt(
        &source,
        &registry,
        &value,
        provider.label(),
        &model,
        &parser_version,
        started.elapsed().as_millis() as u64,
        attempt_kinds.clone(),
    );
    record_wedding_shared_tool_usage(
        &state.db,
        WeddingSharedToolUsageInput {
            user_id: user.id,
            provider: provider.metering_provider(),
            feature: WeddingSharedToolFeature::QuoteNormalisation,
            quantity: 1.0,
            estimated_cost_usd: 0.0,
            usage_unit: Some("requests".to_string()),
            wedding_plan_id: None,
            operation: Some("quotation_normalisation_proposal".to_string()),
            provider_request_id: None,
            occurred_at: Some(chrono::Utc::now().to_rfc3339()),
        },
    )
    .await
    .map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "couldn't save the extraction usage receipt; no proposal was returned".to_string(),
        )
    })?;
    Ok(Json(ProposeResponse {
        status: "proposed",
        extraction: Some(value),
        receipt: Some(receipt),
        attempt_kinds,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifiers_are_bounded() {
        assert_eq!(bounded_identifier(" source ", "source").unwrap(), "source");
        assert!(bounded_identifier("bad\nsource", "source").is_err());
    }
}
