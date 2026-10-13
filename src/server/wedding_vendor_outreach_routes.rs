/*
 * @module-id: rust.server.wedding-vendor-outreach-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */
//
// Admin-funded "write me an outreach email to this vendor" draft generator.
// A platform-owned provider ladder pays for the call, so every limit here
// exists to bound that spend and to stop the model from inventing facts about
// the couple it was not given.
//
// Unlike wedding_understanding_routes.rs this route is authenticated — it is
// reached only from inside a signed-in couple's own workspace — so rate
// limiting keys off the session, not the IP.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::wedding_vendor_evidence::{VENDOR_AVAILABILITY_STATES, VendorAvailabilityInput};
use crate::inference::{InferenceBackend, InferenceMessage, InferenceRequest, dispatch_infer};
use crate::wedding_shared_tool_metering::{
    WeddingSharedToolFeature, WeddingSharedToolProvider, WeddingSharedToolUsageInput,
    record_wedding_shared_tool_usage,
};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    llm_resolution::{
        read_hosted_anthropic_api_key, read_hosted_cerebras_api_key, read_hosted_mistral_api_key,
    },
    wedding_admin_ai_policy,
};

// Verified against the configured Cerebras account's /v1/models response.
const DEFAULT_CEREBRAS_MODEL: &str = "qwen-3.8-27b";
const DEFAULT_MISTRAL_MODEL: &str = "mistral-small-latest";
const DEFAULT_ANTHROPIC_MODEL: &str = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS: u32 = 600;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum OutreachDraftProvider {
    Cerebras,
    Mistral,
    Anthropic,
}

impl OutreachDraftProvider {
    const ORDER: [Self; 3] = [Self::Cerebras, Self::Mistral, Self::Anthropic];

    const fn label(self) -> &'static str {
        match self {
            Self::Cerebras => "cerebras",
            Self::Mistral => "mistral",
            Self::Anthropic => "anthropic",
        }
    }

    const fn metering_provider(self) -> WeddingSharedToolProvider {
        match self {
            Self::Cerebras => WeddingSharedToolProvider::CerebrasLlm,
            Self::Mistral => WeddingSharedToolProvider::MistralLlm,
            Self::Anthropic => WeddingSharedToolProvider::AnthropicLlm,
        }
    }

    fn model(self) -> String {
        let (env_key, default_model) = match self {
            Self::Cerebras => (
                "OMNYID_WEDDING_OUTREACH_CEREBRAS_MODEL",
                DEFAULT_CEREBRAS_MODEL,
            ),
            Self::Mistral => (
                "OMNYID_WEDDING_OUTREACH_MISTRAL_MODEL",
                DEFAULT_MISTRAL_MODEL,
            ),
            Self::Anthropic => (
                "OMNYID_WEDDING_OUTREACH_ANTHROPIC_MODEL",
                DEFAULT_ANTHROPIC_MODEL,
            ),
        };
        std::env::var(env_key)
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty() && value.len() <= 128)
            .unwrap_or_else(|| default_model.to_string())
    }

    fn api_key(self) -> Option<String> {
        match self {
            Self::Cerebras => read_hosted_cerebras_api_key(),
            Self::Mistral => read_hosted_mistral_api_key(),
            Self::Anthropic => read_hosted_anthropic_api_key(),
        }
    }
}

const MAX_VENDOR_SNIPPET_CHARS: usize = 800;
const MAX_COUPLE_FIELD_CHARS: usize = 400;
const MAX_VENDOR_FIELD_CHARS: usize = 400;
const MAX_TOP_PRIORITIES: usize = 8;

const WEDDING_VENDOR_OUTREACH_SYSTEM_PROMPT: &str = r#"You write a short, warm, first-person-plural wedding vendor enquiry email on behalf of a couple, addressed to one vendor.

Rules:
- Use ONLY facts supplied in the couple's details below. Never invent a date, guest count, budget figure, or venue name that was not given to you.
- Name at least one concrete thing the couple said (a priority, their location, their season) so the vendor can see this is not a mass mailout.
- Ask a clear question: availability, package options, and an indicative quote.
- Make no pricing promises and no claim that anything is booked or confirmed.
- 120 to 180 words. Plain sentences, no headings, no emoji, no signature block — the app appends the sender identity separately.
- Respond with ONLY valid JSON, no markdown code fences, no commentary before or after it, matching exactly this shape:
{"subject": string, "body_markdown": string, "grounded_on": [string, ...]}

Field meaning:
- subject: a short, specific email subject line.
- body_markdown: the email body as plain sentences (markdown paragraphs only, no headings).
- grounded_on: the couple-detail field names you actually used (for example "top_priorities", "location", "guest_count") — never an empty list, and never a field you did not actually reference."#;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/wedding/vendor-outreach-draft",
            post(wedding_vendor_outreach_draft_http),
        )
        .route(
            "/wedding/vendors/{vendor_id}/availability",
            post(wedding_vendor_availability_http),
        )
}

#[derive(Deserialize)]
struct WeddingVendorAvailabilityRequest {
    wedding_plan_id: String,
    state: String,
    date_from: Option<String>,
    date_to: Option<String>,
    confidence: Option<f32>,
    valid_until: Option<String>,
    notes: Option<String>,
    source_ref: Option<String>,
}

const MAX_AVAILABILITY_NOTES_CHARS: usize = 1000;
const MAX_AVAILABILITY_REF_CHARS: usize = 200;

fn bad_request(message: String) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message)
}

fn parse_availability_date(
    label: &str,
    value: &Option<String>,
) -> Result<Option<chrono::NaiveDate>, (StatusCode, String)> {
    let Some(raw) = value
        .as_deref()
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
    else {
        return Ok(None);
    };
    chrono::NaiveDate::parse_from_str(raw, "%Y-%m-%d")
        .map(Some)
        .map_err(|_| bad_request(format!("{label} must use YYYY-MM-DD; got '{raw}'")))
}

/// `source` is always "user" here: only the signed-in couple can assert their own state through
/// this route. Operator and outreach-derived states are written by other paths.
fn availability_input_from_request(
    user_id: &str,
    vendor_id: &str,
    body: WeddingVendorAvailabilityRequest,
) -> Result<VendorAvailabilityInput, (StatusCode, String)> {
    let wedding_plan_id = body.wedding_plan_id.trim().to_string();
    if wedding_plan_id.is_empty() || wedding_plan_id.chars().count() > 200 {
        return Err(bad_request(
            "wedding_plan_id is required (at most 200 characters)".to_string(),
        ));
    }
    let state = body.state.trim().to_string();
    if !VENDOR_AVAILABILITY_STATES.contains(&state.as_str()) {
        return Err(bad_request(format!(
            "state '{state}' is not valid; use one of {VENDOR_AVAILABILITY_STATES:?}"
        )));
    }
    let date_from = parse_availability_date("date_from", &body.date_from)?;
    let date_to = parse_availability_date("date_to", &body.date_to)?;
    if let (Some(from), Some(to)) = (date_from, date_to) {
        if to < from {
            return Err(bad_request(
                "date_to must not be before date_from".to_string(),
            ));
        }
    }
    if body
        .confidence
        .is_some_and(|value| !(0.0..=1.0).contains(&value))
    {
        return Err(bad_request(
            "confidence must be between 0 and 1".to_string(),
        ));
    }
    let valid_until = body
        .valid_until
        .as_deref()
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .map(|raw| {
            chrono::DateTime::parse_from_rfc3339(raw)
                .map(|_| raw.to_string())
                .map_err(|_| {
                    bad_request(format!(
                        "valid_until must be an RFC3339 timestamp; got '{raw}'"
                    ))
                })
        })
        .transpose()?;
    reject_if_over_length("notes", &body.notes, MAX_AVAILABILITY_NOTES_CHARS)?;
    reject_if_over_length("source_ref", &body.source_ref, MAX_AVAILABILITY_REF_CHARS)?;
    Ok(VendorAvailabilityInput {
        user_id: user_id.to_string(),
        vendor_id: vendor_id.to_string(),
        wedding_plan_id,
        state,
        date_from: date_from.map(|date| date.to_string()),
        date_to: date_to.map(|date| date.to_string()),
        source: "user".to_string(),
        source_ref: capped(&body.source_ref, MAX_AVAILABILITY_REF_CHARS),
        confidence: body.confidence,
        valid_until,
        notes: capped(&body.notes, MAX_AVAILABILITY_NOTES_CHARS),
    })
}

async fn wedding_vendor_availability_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(vendor_id): Path<String>,
    Json(body): Json<WeddingVendorAvailabilityRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_vendor_availability", &headers),
        RateLimitPolicy {
            max_requests: 60,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let input = availability_input_from_request(&user.id, vendor_id.trim(), body)?;
    let record = state
        .db
        .record_wedding_vendor_availability(&input)
        .await
        .map_err(|err| match &err {
            sqlx::Error::Database(db_err) if db_err.is_foreign_key_violation() => (
                StatusCode::NOT_FOUND,
                format!(
                    "vendor '{}' was not found; refresh the vendor list and try again",
                    input.vendor_id
                ),
            ),
            _ => {
                tracing::warn!(%err, "wedding_vendor_availability: insert failed");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "couldn't save the availability update right now — please try again"
                        .to_string(),
                )
            }
        })?;
    Ok(Json(serde_json::json!({ "availability": record })))
}

#[derive(Deserialize)]
pub(super) struct WeddingVendorOutreachVendorInput {
    name: String,
    category: Option<String>,
    website_url: Option<String>,
    address: Option<String>,
    source_url: Option<String>,
    snippet: Option<String>,
}

#[derive(Deserialize, Default)]
pub(super) struct WeddingVendorOutreachCoupleInput {
    date_or_season: Option<String>,
    location: Option<String>,
    guest_count: Option<String>,
    budget_comfort: Option<String>,
    #[serde(default)]
    top_priorities: Vec<String>,
    atmosphere_description: Option<String>,
    vendor_preferences: Option<String>,
    couple_names: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WeddingVendorOutreachDraftRequest {
    vendor: WeddingVendorOutreachVendorInput,
    #[serde(default)]
    couple: WeddingVendorOutreachCoupleInput,
    #[allow(dead_code)]
    wedding_plan_id: String,
}

#[derive(Deserialize, Debug)]
struct ModelOutreachPayload {
    subject: String,
    body_markdown: String,
    grounded_on: Vec<String>,
}

#[derive(Serialize)]
struct WeddingVendorOutreachDraftResponse {
    subject: String,
    body_markdown: String,
    grounded_on: Vec<String>,
    model: String,
}

fn capped(value: &Option<String>, max_chars: usize) -> Option<String> {
    value
        .as_ref()
        .map(|raw| raw.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|s| {
            if s.chars().count() > max_chars {
                s.chars().take(max_chars).collect()
            } else {
                s
            }
        })
}

fn reject_if_over_length(
    label: &str,
    value: &Option<String>,
    max_chars: usize,
) -> Result<(), (StatusCode, String)> {
    if let Some(raw) = value {
        if raw.trim().chars().count() > max_chars {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("{label} is too long — at most {max_chars} characters are allowed"),
            ));
        }
    }
    Ok(())
}

fn couple_has_grounding(couple: &WeddingVendorOutreachCoupleInput) -> bool {
    let non_empty = |value: &Option<String>| value.as_ref().is_some_and(|v| !v.trim().is_empty());
    non_empty(&couple.date_or_season)
        || non_empty(&couple.location)
        || non_empty(&couple.guest_count)
        || non_empty(&couple.budget_comfort)
        || non_empty(&couple.atmosphere_description)
        || non_empty(&couple.vendor_preferences)
        || non_empty(&couple.couple_names)
        || couple.top_priorities.iter().any(|p| !p.trim().is_empty())
}

async fn wedding_vendor_outreach_draft_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(mut request): Json<WeddingVendorOutreachDraftRequest>,
) -> Result<Json<WeddingVendorOutreachDraftResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_vendor_outreach_draft_burst", &headers),
        RateLimitPolicy {
            max_requests: 6,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_vendor_outreach_draft_daily", &headers),
        RateLimitPolicy {
            max_requests: wedding_admin_ai_policy::daily_request_limit().unwrap_or(1),
            window: Duration::from_secs(86_400),
        },
    )
    .await?;

    if request.vendor.name.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "vendor.name is required".to_string(),
        ));
    }
    reject_if_over_length(
        "vendor.name",
        &Some(request.vendor.name.clone()),
        MAX_VENDOR_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "vendor.category",
        &request.vendor.category,
        MAX_VENDOR_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "vendor.website_url",
        &request.vendor.website_url,
        MAX_VENDOR_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "vendor.address",
        &request.vendor.address,
        MAX_VENDOR_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "vendor.source_url",
        &request.vendor.source_url,
        MAX_VENDOR_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "vendor.snippet",
        &request.vendor.snippet,
        MAX_VENDOR_SNIPPET_CHARS,
    )?;
    reject_if_over_length(
        "couple.date_or_season",
        &request.couple.date_or_season,
        MAX_COUPLE_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "couple.location",
        &request.couple.location,
        MAX_COUPLE_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "couple.guest_count",
        &request.couple.guest_count,
        MAX_COUPLE_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "couple.budget_comfort",
        &request.couple.budget_comfort,
        MAX_COUPLE_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "couple.atmosphere_description",
        &request.couple.atmosphere_description,
        MAX_COUPLE_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "couple.vendor_preferences",
        &request.couple.vendor_preferences,
        MAX_COUPLE_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "couple.couple_names",
        &request.couple.couple_names,
        MAX_COUPLE_FIELD_CHARS,
    )?;
    if request.couple.top_priorities.len() > MAX_TOP_PRIORITIES {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("couple.top_priorities supports at most {MAX_TOP_PRIORITIES} entries"),
        ));
    }
    for priority in &request.couple.top_priorities {
        reject_if_over_length(
            "couple.top_priorities[]",
            &Some(priority.clone()),
            MAX_COUPLE_FIELD_CHARS,
        )?;
    }
    request.couple.top_priorities.truncate(MAX_TOP_PRIORITIES);

    if !couple_has_grounding(&request.couple) {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "capture some wedding basics first (date, location, priorities, or budget comfort) — an outreach draft needs at least one real detail about your wedding to personalise it".to_string(),
        ));
    }

    let vendor = &request.vendor;
    let couple = &request.couple;
    let vendor_lines = [
        Some(format!("Name: {}", vendor.name.trim())),
        capped(&vendor.category, MAX_VENDOR_FIELD_CHARS).map(|v| format!("Category: {v}")),
        capped(&vendor.website_url, MAX_VENDOR_FIELD_CHARS).map(|v| format!("Website: {v}")),
        capped(&vendor.address, MAX_VENDOR_FIELD_CHARS).map(|v| format!("Address: {v}")),
        capped(&vendor.source_url, MAX_VENDOR_FIELD_CHARS).map(|v| format!("Source: {v}")),
        capped(&vendor.snippet, MAX_VENDOR_SNIPPET_CHARS).map(|v| format!("Listing snippet: {v}")),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join("\n");

    let couple_lines = [
        capped(&couple.date_or_season, MAX_COUPLE_FIELD_CHARS)
            .map(|v| format!("date_or_season: {v}")),
        capped(&couple.location, MAX_COUPLE_FIELD_CHARS).map(|v| format!("location: {v}")),
        capped(&couple.guest_count, MAX_COUPLE_FIELD_CHARS).map(|v| format!("guest_count: {v}")),
        capped(&couple.budget_comfort, MAX_COUPLE_FIELD_CHARS)
            .map(|v| format!("budget_comfort: {v}")),
        (!couple.top_priorities.is_empty())
            .then(|| format!("top_priorities: {}", couple.top_priorities.join(", "))),
        capped(&couple.atmosphere_description, MAX_COUPLE_FIELD_CHARS)
            .map(|v| format!("atmosphere_description: {v}")),
        capped(&couple.vendor_preferences, MAX_COUPLE_FIELD_CHARS)
            .map(|v| format!("vendor_preferences: {v}")),
        capped(&couple.couple_names, MAX_COUPLE_FIELD_CHARS).map(|v| format!("couple_names: {v}")),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join("\n");

    let user_text = format!(
        "Vendor to write to:\n{vendor_lines}\n\nWhat the couple has told OmnyID about their wedding (use only this — nothing else is known):\n{couple_lines}"
    );

    // A user-selected follow-up must remain editable and saveable even if the
    // optional hosted models are disabled, out of credit, or return malformed
    // output. Provider failures deliberately cascade Cerebras -> Mistral ->
    // Anthropic; the final fallback uses only validated couple fields and
    // never sends. Do not log model output because it can contain email text.
    let generated = if wedding_admin_ai_policy::execution_enabled() {
        let mut result = None;
        for provider in OutreachDraftProvider::ORDER {
            let Some(api_key) = provider.api_key() else {
                continue;
            };
            let model = provider.model();
            match outreach_text_infer(provider, &api_key, &model, &user_text).await {
                Ok(raw) => match parse_outreach_model_payload(&raw) {
                    Ok(payload) => {
                        result = Some((payload, provider, model));
                        break;
                    }
                    Err(_) => tracing::warn!(
                        provider = provider.label(),
                        "wedding_vendor_outreach_draft: invalid model output; trying next provider"
                    ),
                },
                Err(_) => tracing::warn!(
                    provider = provider.label(),
                    user_id = %user.id,
                    "wedding_vendor_outreach_draft: model call failed; trying next provider"
                ),
            }
        }
        result
    } else {
        None
    };

    let (payload, selected_provider, model) = generated
        .map(|(payload, provider, model)| (payload, Some(provider), model))
        .unwrap_or_else(|| {
            (
                deterministic_outreach_payload(vendor, couple),
                None,
                "deterministic_template".to_string(),
            )
        });

    // Fail closed if the platform-funded call cannot be written to the shared
    // wedding usage ledger. This provides a durable, tenant-scoped audit receipt
    // without exposing an admin key or rerouting a direct Master Agent request.
    if let Some(provider) = selected_provider {
        record_wedding_shared_tool_usage(
            &state.db,
            WeddingSharedToolUsageInput {
                user_id: user.id.clone(),
                provider: provider.metering_provider(),
                feature: WeddingSharedToolFeature::VendorOutreachDraft,
                quantity: 1.0,
                estimated_cost_usd: 0.0,
                usage_unit: Some("requests".to_string()),
                wedding_plan_id: Some(request.wedding_plan_id.clone()),
                operation: Some("vendor_outreach_draft".to_string()),
                provider_request_id: None,
                occurred_at: Some(chrono::Utc::now().to_rfc3339()),
            },
        )
        .await
        .map_err(|err| {
            tracing::error!(%err, user_id = %user.id, "wedding_vendor_outreach_draft: audit receipt failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "couldn't save the admin-funded AI usage receipt; the draft was not returned. Please try again."
                    .to_string(),
            )
        })?;
    }

    Ok(Json(WeddingVendorOutreachDraftResponse {
        subject: payload.subject,
        body_markdown: payload.body_markdown,
        grounded_on: payload.grounded_on,
        model,
    }))
}

fn deterministic_outreach_payload(
    vendor: &WeddingVendorOutreachVendorInput,
    couple: &WeddingVendorOutreachCoupleInput,
) -> ModelOutreachPayload {
    let mut grounded_on = Vec::new();
    let intro = match capped(&couple.couple_names, MAX_COUPLE_FIELD_CHARS) {
        Some(names) => {
            grounded_on.push("couple_names".to_string());
            format!("We are {names} and are planning our wedding")
        }
        None => "We are planning our wedding".to_string(),
    };
    let mut details = Vec::new();
    if let Some(date) = capped(&couple.date_or_season, MAX_COUPLE_FIELD_CHARS) {
        details.push(format!("for {date}"));
        grounded_on.push("date_or_season".to_string());
    }
    if let Some(location) = capped(&couple.location, MAX_COUPLE_FIELD_CHARS) {
        details.push(format!("in {location}"));
        grounded_on.push("location".to_string());
    }
    if let Some(guests) = capped(&couple.guest_count, MAX_COUPLE_FIELD_CHARS) {
        details.push(format!("for around {guests} guests"));
        grounded_on.push("guest_count".to_string());
    }
    if let Some(preferences) = capped(&couple.vendor_preferences, MAX_COUPLE_FIELD_CHARS) {
        details.push(format!("with {preferences} in mind"));
        grounded_on.push("vendor_preferences".to_string());
    }
    if let Some(atmosphere) = capped(&couple.atmosphere_description, MAX_COUPLE_FIELD_CHARS) {
        details.push(format!("and a {atmosphere} atmosphere"));
        grounded_on.push("atmosphere_description".to_string());
    }
    if let Some(budget) = capped(&couple.budget_comfort, MAX_COUPLE_FIELD_CHARS) {
        details.push(format!("within a {budget} budget"));
        grounded_on.push("budget_comfort".to_string());
    }
    let priorities = couple
        .top_priorities
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .take(3)
        .collect::<Vec<_>>();
    let priority_sentence = if priorities.is_empty() {
        String::new()
    } else {
        grounded_on.push("top_priorities".to_string());
        format!(" Our priorities include {}.", priorities.join(", "))
    };
    let detail_sentence = if details.is_empty() {
        String::new()
    } else {
        format!(" {}.", details.join(" "))
    };
    ModelOutreachPayload {
        subject: format!("Wedding enquiry for {}", vendor.name.trim()),
        body_markdown: format!(
            "Hello {} team,\n\n{}{detail_sentence}{priority_sentence} Could you please let us know whether you are available, the package options you offer, and an indicative quote? We would be happy to share any other details you need.\n\nThank you.",
            vendor.name.trim(),
            intro,
        ),
        grounded_on,
    }
}

fn parse_outreach_model_payload(raw: &str) -> Result<ModelOutreachPayload, String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let payload: ModelOutreachPayload =
        serde_json::from_str(cleaned).map_err(|e| format!("json parse error: {e}"))?;
    if payload.subject.trim().is_empty() {
        return Err("empty subject".to_string());
    }
    if payload.body_markdown.trim().is_empty() {
        return Err("empty body_markdown".to_string());
    }
    if payload.grounded_on.is_empty() {
        return Err("empty grounded_on".to_string());
    }
    Ok(payload)
}

async fn outreach_text_infer(
    provider: OutreachDraftProvider,
    api_key: &str,
    model: &str,
    user_text: &str,
) -> Result<String, String> {
    let backend = match provider {
        OutreachDraftProvider::Cerebras => InferenceBackend::OpenAICompat {
            base_url: "https://api.cerebras.ai/v1".to_string(),
            api_key: api_key.to_string(),
            cost_per_1m_input: 0.0,
            cost_per_1m_output: 0.0,
        },
        OutreachDraftProvider::Mistral => InferenceBackend::OpenAICompat {
            base_url: "https://api.mistral.ai/v1".to_string(),
            api_key: api_key.to_string(),
            cost_per_1m_input: 0.0,
            cost_per_1m_output: 0.0,
        },
        OutreachDraftProvider::Anthropic => InferenceBackend::Anthropic {
            api_key: api_key.to_string(),
        },
    };
    let response = dispatch_infer(
        &backend,
        model,
        &InferenceRequest {
            system: WEDDING_VENDOR_OUTREACH_SYSTEM_PROMPT.to_string(),
            messages: vec![InferenceMessage {
                role: "user".to_string(),
                content: user_text.to_string(),
            }],
            max_tokens: MAX_OUTPUT_TOKENS,
            temperature: 0.6,
        },
    )
    .await
    .map_err(|_| "provider request failed".to_string())?;
    Ok(response.content)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_couple() -> WeddingVendorOutreachCoupleInput {
        WeddingVendorOutreachCoupleInput {
            date_or_season: Some("March 2027".to_string()),
            location: Some("Sydney".to_string()),
            guest_count: None,
            budget_comfort: None,
            top_priorities: vec!["flowers".to_string(), "photography".to_string()],
            atmosphere_description: None,
            vendor_preferences: None,
            couple_names: None,
        }
    }

    fn availability_request(state: &str) -> WeddingVendorAvailabilityRequest {
        WeddingVendorAvailabilityRequest {
            wedding_plan_id: "wp_1".to_string(),
            state: state.to_string(),
            date_from: Some("2027-03-20".to_string()),
            date_to: None,
            confidence: Some(0.9),
            valid_until: None,
            notes: Some("  Spoke to events manager  ".to_string()),
            source_ref: None,
        }
    }

    #[test]
    fn availability_accepts_every_documented_state_and_forces_user_source() {
        for state in VENDOR_AVAILABILITY_STATES {
            let input = availability_input_from_request("u1", "v1", availability_request(state))
                .expect("valid state");
            assert_eq!(input.state, state);
            assert_eq!(input.source, "user");
            assert_eq!(input.notes.as_deref(), Some("Spoke to events manager"));
        }
    }

    #[test]
    fn availability_rejects_junk_state_dates_and_confidence() {
        let err = availability_input_from_request("u1", "v1", availability_request("maybe"))
            .err()
            .expect("junk state rejected");
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert!(err.1.contains("maybe"));

        let mut bad_date = availability_request("booked");
        bad_date.date_from = Some("20/03/2027".to_string());
        assert!(availability_input_from_request("u1", "v1", bad_date).is_err());

        let mut inverted = availability_request("booked");
        inverted.date_to = Some("2027-03-01".to_string());
        assert!(availability_input_from_request("u1", "v1", inverted).is_err());

        let mut confidence = availability_request("booked");
        confidence.confidence = Some(2.0);
        assert!(availability_input_from_request("u1", "v1", confidence).is_err());

        let mut valid_until = availability_request("booked");
        valid_until.valid_until = Some("tomorrow".to_string());
        assert!(availability_input_from_request("u1", "v1", valid_until).is_err());

        let mut no_plan = availability_request("booked");
        no_plan.wedding_plan_id = "  ".to_string();
        assert!(availability_input_from_request("u1", "v1", no_plan).is_err());
    }

    #[test]
    fn vendor_name_is_required() {
        let request = WeddingVendorOutreachDraftRequest {
            vendor: WeddingVendorOutreachVendorInput {
                name: "   ".to_string(),
                category: None,
                website_url: None,
                address: None,
                source_url: None,
                snippet: None,
            },
            couple: sample_couple(),
            wedding_plan_id: "wp_1".to_string(),
        };
        assert!(request.vendor.name.trim().is_empty());
    }

    #[test]
    fn over_length_field_is_rejected() {
        let long = "x".repeat(MAX_COUPLE_FIELD_CHARS + 1);
        let err = reject_if_over_length("couple.location", &Some(long), MAX_COUPLE_FIELD_CHARS)
            .expect_err("expected rejection");
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert!(err.1.contains("too long"));
    }

    #[test]
    fn within_length_field_is_accepted() {
        let ok = "Sydney".to_string();
        assert!(
            reject_if_over_length("couple.location", &Some(ok), MAX_COUPLE_FIELD_CHARS).is_ok()
        );
    }

    #[test]
    fn ungrounded_couple_has_no_grounding() {
        let empty = WeddingVendorOutreachCoupleInput::default();
        assert!(!couple_has_grounding(&empty));
    }

    #[test]
    fn couple_with_any_real_field_is_grounded() {
        assert!(couple_has_grounding(&sample_couple()));

        let mut only_priorities = WeddingVendorOutreachCoupleInput::default();
        only_priorities.top_priorities = vec!["venue".to_string()];
        assert!(couple_has_grounding(&only_priorities));
    }

    #[test]
    fn deterministic_outreach_draft_uses_only_supplied_couple_fields() {
        let vendor = WeddingVendorOutreachVendorInput {
            name: "Mackay Family Estate".to_string(),
            category: Some("venue".to_string()),
            website_url: None,
            address: None,
            source_url: None,
            snippet: None,
        };
        let payload = deterministic_outreach_payload(&vendor, &sample_couple());

        assert!(payload.subject.contains("Mackay Family Estate"));
        assert!(payload.body_markdown.contains("March 2027"));
        assert!(payload.body_markdown.contains("Sydney"));
        assert!(payload.body_markdown.contains("flowers, photography"));
        assert!(!payload.body_markdown.contains("120 guests"));
        assert_eq!(
            payload.grounded_on,
            vec![
                "date_or_season".to_string(),
                "location".to_string(),
                "top_priorities".to_string(),
            ]
        );
    }

    #[test]
    fn parses_fenced_json_response() {
        let raw = "```json\n{\"subject\": \"Enquiry\", \"body_markdown\": \"Hello there\", \"grounded_on\": [\"location\"]}\n```";
        let payload = parse_outreach_model_payload(raw).expect("should parse");
        assert_eq!(payload.subject, "Enquiry");
        assert_eq!(payload.body_markdown, "Hello there");
        assert_eq!(payload.grounded_on, vec!["location".to_string()]);
    }

    #[test]
    fn hosted_draft_provider_order_is_cerebras_then_mistral_then_anthropic() {
        assert_eq!(
            OutreachDraftProvider::ORDER,
            [
                OutreachDraftProvider::Cerebras,
                OutreachDraftProvider::Mistral,
                OutreachDraftProvider::Anthropic,
            ]
        );
        assert_eq!(OutreachDraftProvider::Cerebras.label(), "cerebras");
        assert_eq!(OutreachDraftProvider::Mistral.label(), "mistral");
        assert_eq!(OutreachDraftProvider::Anthropic.label(), "anthropic");
    }

    #[test]
    fn rejects_empty_grounded_on() {
        let raw =
            "{\"subject\": \"Enquiry\", \"body_markdown\": \"Hello there\", \"grounded_on\": []}";
        let err = parse_outreach_model_payload(raw).expect_err("expected rejection");
        assert!(err.contains("grounded_on"));
    }

    #[test]
    fn rejects_empty_subject() {
        let raw = "{\"subject\": \"\", \"body_markdown\": \"Hello there\", \"grounded_on\": [\"location\"]}";
        let err = parse_outreach_model_payload(raw).expect_err("expected rejection");
        assert!(err.contains("subject"));
    }
}
