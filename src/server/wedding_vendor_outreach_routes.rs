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
use crate::gateway::smtp_out::send_transactional_email;
use crate::wedding_shared_tool_metering::{
    WeddingSharedToolFeature, WeddingSharedToolUsageInput,
    record_wedding_shared_tool_usage,
};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    wedding_ai_cost_policy::wedding_ai_budget_decision,
    wedding_llm_ladder::{LadderOutcome, WeddingLlmFeature, run_ladder},
    wedding_admin_ai_policy,
    wedding_vendor_outreach_generation::{
        OutreachGenerationMetadata, deterministic_generation, model_generation,
    },
};

const MAX_OUTPUT_TOKENS: u32 = 600;

const MAX_VENDOR_SNIPPET_CHARS: usize = 800;
const MAX_COUPLE_FIELD_CHARS: usize = 400;
const MAX_VENDOR_FIELD_CHARS: usize = 400;
const MAX_TOP_PRIORITIES: usize = 8;
const MAX_DEAL_BREAKERS: usize = 8;
const MAX_VERIFY_QUESTIONS: usize = 3;
const MAX_VERIFY_QUESTION_CHARS: usize = 200;

const WEDDING_VENDOR_OUTREACH_SYSTEM_PROMPT: &str = r#"You write a short, warm, first-person-plural wedding vendor enquiry email on behalf of a couple, addressed to one vendor.

Rules:
- Use ONLY facts supplied in the couple's details below. Never invent a date, guest count, budget figure, or venue name that was not given to you.
- Name at least one concrete thing the couple said (a priority, their location, their season) so the vendor can see this is not a mass mailout.
- Ask a clear question: availability, package options, and an indicative quote.
- Make no pricing promises and no claim that anything is booked or confirmed.
- Use short paragraphs separated by blank lines: greeting, wedding context, request, offer to share more, then thanks. Plain sentences, no headings or emoji. Do not add a signature — the app appends the onboarding name separately.
- A budget must use `AUD $` plus a grouped number (for example `AUD $13,900`) and the word `budget` must never be repeated.
- When budget_category_label and budget_category_amount are supplied, use that category allocation as this vendor's budget, never the total wedding budget, and record it in grounded_on as `budget_comfort`.
- Summarise verification questions as plain topics. For capacity and price, use exactly: `We would also appreciate answers to capacity and price.`
- Treat supplied deal_breakers as explicit requirements. Ask the vendor to confirm them; do not imply they are already satisfied.
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
            "/wedding/vendor-outreach/send-approved",
            post(wedding_vendor_outreach_send_approved_http),
        )
        .route(
            "/wedding/vendors/{vendor_id}/availability",
            post(wedding_vendor_availability_http),
        )
}

#[derive(Deserialize)]
struct WeddingVendorApprovedSendRequest {
    vendor_id: String,
    to: String,
    subject: String,
    text: String,
    draft_message_id: String,
}

#[derive(Serialize)]
struct WeddingVendorApprovedSendResponse {
    sent: bool,
    message_id: String,
    client_message_id: String,
}

async fn wedding_vendor_outreach_send_approved_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<WeddingVendorApprovedSendRequest>,
) -> Result<Json<WeddingVendorApprovedSendResponse>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_vendor_outreach_send", &headers),
        RateLimitPolicy { max_requests: 8, window: Duration::from_secs(60) },
    ).await?;
    let vendor_id = request.vendor_id.trim();
    let recipient = request.to.trim().to_lowercase();
    let subject = request.subject.trim();
    let text = request.text.trim();
    if vendor_id.is_empty() || request.draft_message_id.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "The approved vendor draft is incomplete.".into()));
    }
    if subject.is_empty() || subject.chars().count() > 240 || text.is_empty() || text.chars().count() > 20_000 {
        return Err((StatusCode::BAD_REQUEST, "The approved enquiry content is invalid.".into()));
    }
    let directory_email = sqlx::query_scalar::<_, Option<String>>(
        "SELECT contact_email FROM wedding_vendors WHERE vendor_id=$1 AND status='active'",
    )
    .bind(vendor_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
    .flatten()
    .map(|value| value.trim().to_lowercase())
    .filter(|value| !value.is_empty())
    .ok_or((StatusCode::PRECONDITION_FAILED, "This vendor does not have a verified delivery address yet.".into()))?;
    if recipient != directory_email {
        return Err((StatusCode::FORBIDDEN, "The recipient no longer matches this vendor's directory address. Refresh before sending.".into()));
    }
    send_transactional_email(&recipient, subject, text)
        .await
        .map_err(|_| (StatusCode::BAD_GATEWAY, "The email provider did not accept this enquiry. Your approved draft remains saved.".into()))?;
    let receipt = ulid::Ulid::new().to_string();
    Ok(Json(WeddingVendorApprovedSendResponse {
        sent: true,
        message_id: format!("platform-{receipt}"),
        client_message_id: request.draft_message_id.trim().to_string(),
    }))
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
    budget_category_label: Option<String>,
    budget_category_amount: Option<f64>,
    budget_currency: Option<String>,
    #[serde(default)]
    top_priorities: Vec<String>,
    atmosphere_description: Option<String>,
    vendor_preferences: Option<String>,
    couple_names: Option<String>,
    #[serde(default)]
    deal_breakers: Vec<String>,
}

#[derive(Deserialize)]
pub(super) struct WeddingVendorOutreachDraftRequest {
    vendor: WeddingVendorOutreachVendorInput,
    #[serde(default)]
    couple: WeddingVendorOutreachCoupleInput,
    wedding_plan_id: String,
    #[serde(default)]
    verify_questions: Vec<String>,
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
    #[serde(flatten)]
    generation: OutreachGenerationMetadata,
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
        || couple.deal_breakers.iter().any(|value| !value.trim().is_empty())
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
        "couple.budget_category_label",
        &request.couple.budget_category_label,
        MAX_COUPLE_FIELD_CHARS,
    )?;
    reject_if_over_length(
        "couple.budget_currency",
        &request.couple.budget_currency,
        8,
    )?;
    if request.couple.budget_category_amount.is_some_and(|amount| !amount.is_finite() || amount <= 0.0) {
        return Err((StatusCode::BAD_REQUEST, "couple.budget_category_amount must be a finite positive amount".to_string()));
    }
    if request.couple.budget_currency.as_ref().is_some_and(|currency| currency.trim().to_uppercase() != "AUD") {
        return Err((StatusCode::BAD_REQUEST, "couple.budget_currency must be AUD".to_string()));
    }
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
    if request.couple.deal_breakers.len() > MAX_DEAL_BREAKERS {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("couple.deal_breakers supports at most {MAX_DEAL_BREAKERS} entries"),
        ));
    }
    for requirement in &request.couple.deal_breakers {
        reject_if_over_length(
            "couple.deal_breakers[]",
            &Some(requirement.clone()),
            MAX_COUPLE_FIELD_CHARS,
        )?;
    }
    request.couple.deal_breakers.retain(|value| !value.trim().is_empty());
    request.couple.deal_breakers.truncate(MAX_DEAL_BREAKERS);
    for question in &request.verify_questions {
        reject_if_over_length("verify_questions[]", &Some(question.clone()), MAX_VERIFY_QUESTION_CHARS)?;
    }
    request.verify_questions.retain(|question| !question.trim().is_empty());
    request.verify_questions.truncate(MAX_VERIFY_QUESTIONS);

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
        capped(&couple.budget_category_label, MAX_COUPLE_FIELD_CHARS)
            .map(|v| format!("budget_category_label: {v}")),
        couple.budget_category_amount.map(|v| format!("budget_category_amount: {v:.2}")),
        capped(&couple.budget_currency, 8).map(|v| format!("budget_currency: {v}")),
        (!couple.top_priorities.is_empty())
            .then(|| format!("top_priorities: {}", couple.top_priorities.join(", "))),
        capped(&couple.atmosphere_description, MAX_COUPLE_FIELD_CHARS)
            .map(|v| format!("atmosphere_description: {v}")),
        capped(&couple.vendor_preferences, MAX_COUPLE_FIELD_CHARS)
            .map(|v| format!("vendor_preferences: {v}")),
        capped(&couple.couple_names, MAX_COUPLE_FIELD_CHARS).map(|v| format!("couple_names: {v}")),
        (!couple.deal_breakers.is_empty())
            .then(|| format!("deal_breakers: {}", couple.deal_breakers.join("; "))),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join("\n");

    let user_text = format!(
        "Vendor to write to:\n{vendor_lines}\n\nWhat the couple has told OmnyID about their wedding (use only this — nothing else is known):\n{couple_lines}"
    );

    let verify_questions = request.verify_questions.iter().map(|question| question.trim()).collect::<Vec<_>>();
    let user_text = if verify_questions.is_empty() {
        user_text
    } else {
        format!("{user_text}\n\nQuestions to include (ask these exactly when appropriate):\n- {}", verify_questions.join("\n- "))
    };

    // A user-selected follow-up must remain editable and saveable even if the
    // optional hosted models are disabled, out of credit, or return malformed
    // output. Provider failures deliberately cascade Cerebras -> Mistral ->
    // Anthropic; the final fallback uses only validated couple fields and
    // never sends. Do not log model output because it can contain email text.
    let budget_allows_model = wedding_ai_budget_decision(
        &state.db,
        &user.id,
        request.wedding_plan_id.trim(),
        i64::from(MAX_OUTPUT_TOKENS) + 1_200,
    )
    .await
    .map(|decision| decision.allow_model)
    .unwrap_or(false);
    let generated = if wedding_admin_ai_policy::execution_enabled() && budget_allows_model {
        match run_ladder(
            WeddingLlmFeature::Outreach,
            WEDDING_VENDOR_OUTREACH_SYSTEM_PROMPT,
            &user_text,
            MAX_OUTPUT_TOKENS,
            parse_outreach_model_payload,
        ).await {
            LadderOutcome::Success { value, provider, model, tokens_input, tokens_output, cost_cents, .. } => {
                Some((value, provider, model, model_generation(&user_text, tokens_input, tokens_output, cost_cents)))
            }
            LadderOutcome::Exhausted { .. } => None,
        }
    } else {
        None
    };

    let (mut payload, selected_provider, model, generation) = generated
        .map(|(payload, provider, model, generation)| (payload, Some(provider), model, generation))
        .unwrap_or_else(|| {
            (
                deterministic_outreach_payload(vendor, couple, &request.verify_questions),
                None,
                "deterministic_template".to_string(),
                deterministic_generation(&user_text),
            )
        });
    payload.body_markdown = finalize_outreach_body(&payload.body_markdown, &request.couple);
    if capped(&request.couple.couple_names, MAX_COUPLE_FIELD_CHARS).is_some()
        && !payload
            .grounded_on
            .iter()
            .any(|field| field == "couple_names")
    {
        payload.grounded_on.push("couple_names".to_string());
    }

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
                quantity: f64::from(generation.input_tokens + generation.output_tokens),
                estimated_cost_usd: generation.estimated_cost_usd,
                usage_unit: Some("tokens".to_string()),
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
        generation,
    }))
}

fn deterministic_outreach_payload(
    vendor: &WeddingVendorOutreachVendorInput,
    couple: &WeddingVendorOutreachCoupleInput,
    verify_questions: &[String],
) -> ModelOutreachPayload {
    let vendor_name = outreach_vendor_display_name(&vendor.name);
    let mut grounded_on = Vec::new();
    let intro = match capped(&couple.couple_names, MAX_COUPLE_FIELD_CHARS) {
        Some(_) => {
            grounded_on.push("couple_names".to_string());
            "We are planning our wedding".to_string()
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
    if let (Some(label), Some(amount)) = (
        capped(&couple.budget_category_label, MAX_COUPLE_FIELD_CHARS),
        couple.budget_category_amount.filter(|value| value.is_finite() && *value > 0.0),
    ) {
        let currency = capped(&couple.budget_currency, 8).unwrap_or_else(|| "AUD".to_string());
        details.push(format!("with a {label} budget of {currency} ${}", format_budget_amount(amount)));
        grounded_on.push("budget_comfort".to_string());
    } else if let Some(budget) = capped(&couple.budget_comfort, MAX_COUPLE_FIELD_CHARS) {
        let amount = budget
            .trim()
            .trim_end_matches("total budget")
            .trim_end_matches("budget")
            .trim();
        details.push(format!("with a total budget of {amount}"));
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
    let deal_breakers = couple
        .deal_breakers
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .take(MAX_DEAL_BREAKERS)
        .collect::<Vec<_>>();
    let deal_breaker_sentence = if deal_breakers.is_empty() {
        String::new()
    } else {
        grounded_on.push("deal_breakers".to_string());
        format!(" Could you please confirm that you can meet these requirements: {}?", deal_breakers.join("; "))
    };
    let detail_sentence = if details.is_empty() {
        String::new()
    } else {
        format!(" {}.", details.join(" "))
    };
    let questions = verify_questions
        .iter()
        .map(|question| question.trim())
        .filter(|question| !question.is_empty())
        .take(MAX_VERIFY_QUESTIONS)
        .collect::<Vec<_>>();
    let question_topics = outreach_question_topics(&questions);
    let question_sentence = if question_topics.is_empty() {
        String::new()
    } else {
        format!(
            " We would also appreciate answers to {}.",
            question_topics.join(" and ")
        )
    };
    ModelOutreachPayload {
        subject: format!("Wedding enquiry for {vendor_name}"),
        body_markdown: format!(
            "Hello {} team,\n\n{}{detail_sentence}{priority_sentence}\n\nCould you please let us know whether you are available, the package options you offer, and an indicative quote?{deal_breaker_sentence}{question_sentence}\n\nWe would be happy to share any other details you need.\n\nThank you.",
            vendor_name, intro,
        ),
        grounded_on,
    }
}

fn format_budget_amount(amount: f64) -> String {
    let rounded = amount.round() as i64;
    let digits = rounded.abs().to_string();
    let mut grouped = String::new();
    for (index, ch) in digits.chars().rev().enumerate() {
        if index > 0 && index % 3 == 0 { grouped.push(','); }
        grouped.push(ch);
    }
    let value = grouped.chars().rev().collect::<String>();
    if rounded < 0 { format!("-{value}") } else { value }
}

fn outreach_question_topics(questions: &[&str]) -> Vec<String> {
    let mut topics = Vec::new();
    for question in questions {
        let lower = question.to_ascii_lowercase();
        let topic = if lower.contains("capacity") || lower.contains("guest") {
            "capacity"
        } else if lower.contains("price")
            || lower.contains("quote")
            || lower.contains("cost")
            || lower.contains("budget")
        {
            "price"
        } else if lower.contains("access") || lower.contains("wheelchair") {
            "accessibility"
        } else if lower.contains("availability") || lower.contains("available") {
            "availability"
        } else {
            continue;
        };
        if !topics.iter().any(|value| value == topic) {
            topics.push(topic.to_string());
        }
    }
    topics
}

fn finalize_outreach_body(body: &str, couple: &WeddingVendorOutreachCoupleInput) -> String {
    let cleaned = body
        .replace("total budget budget", "total budget")
        .replace("Total budget budget", "Total budget")
        .replace("within a AUD ", "within AUD ")
        .replace("within an AUD ", "within AUD ");
    let mut result = normalized_outreach_paragraphs(&cleaned);
    if let Some(names) = capped(&couple.couple_names, MAX_COUPLE_FIELD_CHARS) {
        let signature = names.split_whitespace().collect::<Vec<_>>().join(" ");
        if !signature.is_empty()
            && !result
                .to_ascii_lowercase()
                .ends_with(&signature.to_ascii_lowercase())
        {
            result.push_str(&format!("\n\nKind regards,\n\n{signature}"));
        }
    }
    result
}

/// Search/listing snippets sometimes append marketing prose to a business
/// name (for example `Venue, with harbour views`).  That is useful evidence,
/// not part of an email salutation.
fn outreach_vendor_display_name(value: &str) -> &str {
    value
        .split(", with ")
        .next()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("the vendor")
}

fn parse_outreach_model_payload(raw: &str) -> Result<ModelOutreachPayload, String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let mut payload: ModelOutreachPayload =
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
    payload.body_markdown = normalized_outreach_paragraphs(&payload.body_markdown);
    Ok(payload)
}

/// Provider output is still treated as content, but its presentation has a
/// stable contract: an outreach draft reads like an email, not one dense wall
/// of text. Preserve existing paragraph content and only split a one-line
/// response at sentence boundaries when the provider missed that contract.
fn normalized_outreach_paragraphs(body: &str) -> String {
    let paragraphs = body
        .split("\n\n")
        .map(|paragraph| paragraph.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|paragraph| !paragraph.is_empty())
        .collect::<Vec<_>>();
    if paragraphs.len() >= 2 {
        return paragraphs.join("\n\n");
    }

    let text = paragraphs.into_iter().next().unwrap_or_default();
    let mut sentences = Vec::new();
    let mut start = 0;
    for (index, character) in text.char_indices() {
        if matches!(character, '.' | '!' | '?') {
            let end = index + character.len_utf8();
            let sentence = text[start..end].trim();
            if !sentence.is_empty() {
                sentences.push(sentence.to_string());
            }
            start = end;
        }
    }
    let remainder = text[start..].trim();
    if !remainder.is_empty() {
        sentences.push(remainder.to_string());
    }
    if sentences.len() >= 3 {
        let final_sentence = sentences.pop().unwrap_or_default();
        let opening = sentences.remove(0);
        return format!("{opening}\n\n{}\n\n{final_sentence}", sentences.join(" "));
    }
    format!("{text}\n\nCould you please share your availability, package options, and an indicative quote?\n\nThank you.")
}

#[cfg(test)]
#[path = "wedding_vendor_outreach_routes_tests.rs"]
mod tests;
