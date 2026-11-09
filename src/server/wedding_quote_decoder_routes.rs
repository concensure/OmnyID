// @module-id: server.wedding-quote-decoder-routes
// @primary-capability: bounded-public-source-grounded-quote-extraction
// @locs-version: 1.0

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::{
    AppState, RateLimitPolicy,
    auth::{enforce_rate_limit, public_rate_limit_key},
    openrouter_funded_inference::{self, FundedInferenceRequest},
};

const MAX_QUOTE_CHARS: usize = 20_000;
const MIN_QUOTE_CHARS: usize = 40;

const SYSTEM_PROMPT: &str = r#"You extract commercial terms from one wedding venue proposal. Return only strict JSON. Never calculate arithmetic: OmnyID calculates totals deterministically. Never infer an unstated value. Never map a component subtotal to whole_package_amount. Every extracted or ambiguous value must include one exact, contiguous source_snippet copied verbatim from the proposal; do not add ellipses. If no exact support exists, use state not_found and value null.

Return exactly this shape:
{
  "schema_version":"quote-extraction.v2",
  "fields":{
    "pricing_model":{"state":"extracted|ambiguous|not_found","value":"per_head|fixed|minimum_spend|hybrid|unclear|null","source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "per_head_rate":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "guest_count":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "whole_package_amount":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "fixed_fee":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "minimum_spend":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "gst":{"state":"extracted|ambiguous|not_found","value":"included|excluded|unclear|null","source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "service_charge_pct":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "venue_hours":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "overtime_rate":{"state":"extracted|ambiguous|not_found","value":number|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string},
    "payment_schedule":{"state":"extracted|ambiguous|not_found","value":string|null,"source_snippet":string|null,"confidence":"high|medium|low","reason":string}
  },
  "line_items":[{"label":string,"unit":"per_head|fixed|included|unclear","amount":number|null,"source_snippet":string,"confidence":"high|medium|low"}],
  "inclusions":[{"label":string,"source_snippet":string}],
  "exclusions":[{"label":string,"source_snippet":string}]
}

Classification rules:
- A rate such as 120 guests x $275 is per_head_rate 275 and guest_count 120. It is not a whole-package amount. Do not return the multiplication result.
- whole_package_amount is only for wording that explicitly identifies a grand total, package total or total payable for the proposal as a whole.
- fixed_fee is a stated room, ceremony, hire or other fixed commercial fee, not a calculated subtotal.
- A minimum spend is not a quoted total.
- Line items preserve catering, beverages and other components. Their amounts are quoted values only.
- An inclusion can be stated without a price. Missing information is useful: return not_found for every absent field with a short reason."#;

#[derive(Deserialize)]
struct ExtractRequest {
    text: String,
    #[serde(default)]
    proposal: String,
    #[serde(default)]
    comparison_guests: Option<u32>,
    #[serde(default)]
    company: String,
}

#[derive(Clone, Deserialize, Serialize)]
struct ExtractedField {
    state: String,
    value: Option<Value>,
    source_snippet: Option<String>,
    confidence: String,
    reason: String,
}

#[derive(Deserialize)]
struct ModelFields {
    pricing_model: ExtractedField,
    per_head_rate: ExtractedField,
    guest_count: ExtractedField,
    whole_package_amount: ExtractedField,
    fixed_fee: ExtractedField,
    minimum_spend: ExtractedField,
    gst: ExtractedField,
    service_charge_pct: ExtractedField,
    venue_hours: ExtractedField,
    overtime_rate: ExtractedField,
    payment_schedule: ExtractedField,
}

#[derive(Deserialize, Serialize)]
struct LineItem {
    label: String,
    unit: String,
    amount: Option<f64>,
    source_snippet: String,
    confidence: String,
}

#[derive(Deserialize, Serialize)]
struct EvidenceItem {
    label: String,
    source_snippet: String,
}

#[derive(Deserialize)]
struct ModelPayload {
    schema_version: String,
    fields: ModelFields,
    #[serde(default)]
    line_items: Vec<LineItem>,
    #[serde(default)]
    inclusions: Vec<EvidenceItem>,
    #[serde(default)]
    exclusions: Vec<EvidenceItem>,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/quote-extract", post(extract_http))
        .layer(DefaultBodyLimit::max(28 * 1024))
}

fn bounded(value: &str, max: usize) -> String {
    value.trim().chars().take(max).collect()
}

fn source_is_exact(text: &str, source: &str) -> bool {
    let source = source.trim();
    !source.is_empty() && text.contains(source)
}

fn missing(reason: &str) -> ExtractedField {
    ExtractedField {
        state: "not_found".to_string(),
        value: None,
        source_snippet: None,
        confidence: "low".to_string(),
        reason: bounded(reason, 180),
    }
}

fn sanitize_field(text: &str, mut field: ExtractedField, kind: &str) -> ExtractedField {
    if !matches!(
        field.state.as_str(),
        "extracted" | "ambiguous" | "not_found"
    ) {
        return missing("The extractor returned an unsupported evidence state.");
    }
    if !matches!(field.confidence.as_str(), "high" | "medium" | "low") {
        field.confidence = "low".to_string();
    }
    field.reason = bounded(&field.reason, 180);
    if field.state == "not_found" {
        field.value = None;
        field.source_snippet = None;
        return field;
    }
    let source = field.source_snippet.as_deref().unwrap_or_default().trim();
    if !source_is_exact(text, source) {
        return missing("The suggested value had no exact source sentence in the proposal.");
    }
    field.source_snippet = Some(bounded(source, 260));
    let valid_value = match kind {
        "pricing_model" => field
            .value
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|value| {
                matches!(
                    value,
                    "per_head" | "fixed" | "minimum_spend" | "hybrid" | "unclear"
                )
            }),
        "gst" => field
            .value
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|value| matches!(value, "included" | "excluded" | "unclear")),
        "payment_schedule" => field
            .value
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty() && value.chars().count() <= 500),
        "guest_count" => field
            .value
            .as_ref()
            .and_then(Value::as_f64)
            .is_some_and(|value| value >= 1.0 && value <= 5_000.0 && value.fract() == 0.0),
        "service_charge_pct" => field
            .value
            .as_ref()
            .and_then(Value::as_f64)
            .is_some_and(|value| (0.0..=100.0).contains(&value)),
        "venue_hours" => field
            .value
            .as_ref()
            .and_then(Value::as_f64)
            .is_some_and(|value| value > 0.0 && value <= 48.0),
        _ => field
            .value
            .as_ref()
            .and_then(Value::as_f64)
            .is_some_and(|value| value >= 0.0 && value <= 10_000_000.0),
    };
    if valid_value {
        field
    } else {
        missing("The suggested value was outside the supported field type or range.")
    }
}

fn sanitize_line_items(text: &str, items: Vec<LineItem>) -> Vec<LineItem> {
    items
        .into_iter()
        .filter_map(|mut item| {
            if !matches!(
                item.unit.as_str(),
                "per_head" | "fixed" | "included" | "unclear"
            ) || !source_is_exact(text, &item.source_snippet)
                || item.label.trim().is_empty()
                || item
                    .amount
                    .is_some_and(|amount| !(0.0..=10_000_000.0).contains(&amount))
            {
                return None;
            }
            item.label = bounded(&item.label, 120);
            item.source_snippet = bounded(&item.source_snippet, 260);
            if !matches!(item.confidence.as_str(), "high" | "medium" | "low") {
                item.confidence = "low".to_string();
            }
            Some(item)
        })
        .take(40)
        .collect()
}

fn sanitize_evidence(text: &str, items: Vec<EvidenceItem>) -> Vec<EvidenceItem> {
    items
        .into_iter()
        .filter_map(|mut item| {
            if item.label.trim().is_empty() || !source_is_exact(text, &item.source_snippet) {
                return None;
            }
            item.label = bounded(&item.label, 120);
            item.source_snippet = bounded(&item.source_snippet, 260);
            Some(item)
        })
        .take(40)
        .collect()
}

async fn extract_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ExtractRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !request.company.trim().is_empty() {
        return Ok(Json(json!({ "status": "ok" })));
    }
    let burst_key = public_rate_limit_key("wedding_quote_extract_burst", &headers);
    let daily_key = public_rate_limit_key("wedding_quote_extract_daily", &headers);
    enforce_rate_limit(
        &state,
        burst_key.clone(),
        RateLimitPolicy {
            max_requests: 2,
            window: Duration::from_secs(600),
        },
    )
    .await?;
    enforce_rate_limit(
        &state,
        daily_key,
        RateLimitPolicy {
            max_requests: 5,
            window: Duration::from_secs(86_400),
        },
    )
    .await?;

    let text = request.text.trim();
    let length = text.chars().count();
    if !(MIN_QUOTE_CHARS..=MAX_QUOTE_CHARS).contains(&length) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "proposal text must be between {MIN_QUOTE_CHARS} and {MAX_QUOTE_CHARS} characters"
            ),
        ));
    }
    let proposal = bounded(&request.proposal, 20);
    let comparison_guests = request
        .comparison_guests
        .filter(|value| (1..=500).contains(value));
    let prompt = format!(
        "Proposal side: {}\nComparison guests supplied by visitor (context only): {}\n\nPROPOSAL TEXT\n{}",
        if proposal.is_empty() {
            "unspecified"
        } else {
            &proposal
        },
        comparison_guests.map_or_else(|| "not supplied".to_string(), |value| value.to_string()),
        text
    );
    let result = openrouter_funded_inference::infer(
        &state.db.pool,
        &state.http_client,
        FundedInferenceRequest {
            feature: "public_wedding_quote_extraction",
            user_id: None,
            wedding_plan_id: None,
            abuse_id: &burst_key,
            system: SYSTEM_PROMPT,
            prompt: &prompt,
            max_tokens: 900,
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
    let payload: ModelPayload = serde_json::from_str(cleaned).map_err(|error| {
        tracing::warn!(%error, "quote extractor returned invalid structured output");
        (
            StatusCode::BAD_GATEWAY,
            "The quote could not be structured safely.".to_string(),
        )
    })?;
    if payload.schema_version != "quote-extraction.v2" {
        return Err((
            StatusCode::BAD_GATEWAY,
            "The quote extractor returned an unsupported schema.".to_string(),
        ));
    }
    let fields = payload.fields;
    Ok(Json(json!({
        "schema_version": "quote-extraction.v2",
        "model": result.model,
        "fields": {
            "pricing_model": sanitize_field(text, fields.pricing_model, "pricing_model"),
            "per_head_rate": sanitize_field(text, fields.per_head_rate, "money"),
            "guest_count": sanitize_field(text, fields.guest_count, "guest_count"),
            "whole_package_amount": sanitize_field(text, fields.whole_package_amount, "money"),
            "fixed_fee": sanitize_field(text, fields.fixed_fee, "money"),
            "minimum_spend": sanitize_field(text, fields.minimum_spend, "money"),
            "gst": sanitize_field(text, fields.gst, "gst"),
            "service_charge_pct": sanitize_field(text, fields.service_charge_pct, "service_charge_pct"),
            "venue_hours": sanitize_field(text, fields.venue_hours, "venue_hours"),
            "overtime_rate": sanitize_field(text, fields.overtime_rate, "money"),
            "payment_schedule": sanitize_field(text, fields.payment_schedule, "payment_schedule"),
        },
        "line_items": sanitize_line_items(text, payload.line_items),
        "inclusions": sanitize_evidence(text, payload.inclusions),
        "exclusions": sanitize_evidence(text, payload.exclusions),
        "retained_by_omnyid": false,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_or_ungrounded_fields_are_not_returned_as_extracted() {
        let field = ExtractedField {
            state: "extracted".to_string(),
            value: Some(json!(275)),
            source_snippet: Some("invented $275".to_string()),
            confidence: "high".to_string(),
            reason: "looks likely".to_string(),
        };
        let sanitized = sanitize_field("The package is $250 per guest.", field, "money");
        assert_eq!(sanitized.state, "not_found");
        assert!(sanitized.value.is_none());
    }

    #[test]
    fn exact_source_and_bounded_numeric_value_survive() {
        let field = ExtractedField {
            state: "extracted".to_string(),
            value: Some(json!(275)),
            source_snippet: Some("120 guests x $275.00".to_string()),
            confidence: "high".to_string(),
            reason: "explicit per-head wording".to_string(),
        };
        let sanitized = sanitize_field("Package: 120 guests x $275.00", field, "money");
        assert_eq!(sanitized.state, "extracted");
        assert_eq!(sanitized.value, Some(json!(275)));
    }
}
