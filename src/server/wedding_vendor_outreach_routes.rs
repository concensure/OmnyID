/*
 * @module-id: rust.server.wedding-vendor-outreach-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */
//
// Admin-funded "write me an outreach email to this vendor" draft generator.
// Modelled directly on wedding_understanding_routes.rs: a hosted Anthropic key
// pays for the call, so every limit here exists to bound that spend and to
// stop the model from inventing facts about the couple it was not given.
//
// Unlike wedding_understanding_routes.rs this route is authenticated — it is
// reached only from inside a signed-in couple's own workspace — so rate
// limiting keys off the session, not the IP.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    llm_resolution::read_hosted_anthropic_api_key,
};

const MODEL: &str = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS: u32 = 600;

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
    Router::new().route(
        "/wedding/vendor-outreach-draft",
        post(wedding_vendor_outreach_draft_http),
    )
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
    model: &'static str,
}

fn capped(value: &Option<String>, max_chars: usize) -> Option<String> {
    value.as_ref().map(|raw| raw.trim().to_string()).filter(|s| !s.is_empty()).map(|s| {
        if s.chars().count() > max_chars {
            s.chars().take(max_chars).collect()
        } else {
            s
        }
    })
}

fn reject_if_over_length(label: &str, value: &Option<String>, max_chars: usize) -> Result<(), (StatusCode, String)> {
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
            max_requests: 60,
            window: Duration::from_secs(86_400),
        },
    )
    .await?;

    if request.vendor.name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "vendor.name is required".to_string()));
    }
    reject_if_over_length("vendor.name", &Some(request.vendor.name.clone()), MAX_VENDOR_FIELD_CHARS)?;
    reject_if_over_length("vendor.category", &request.vendor.category, MAX_VENDOR_FIELD_CHARS)?;
    reject_if_over_length("vendor.website_url", &request.vendor.website_url, MAX_VENDOR_FIELD_CHARS)?;
    reject_if_over_length("vendor.address", &request.vendor.address, MAX_VENDOR_FIELD_CHARS)?;
    reject_if_over_length("vendor.source_url", &request.vendor.source_url, MAX_VENDOR_FIELD_CHARS)?;
    reject_if_over_length("vendor.snippet", &request.vendor.snippet, MAX_VENDOR_SNIPPET_CHARS)?;
    reject_if_over_length("couple.date_or_season", &request.couple.date_or_season, MAX_COUPLE_FIELD_CHARS)?;
    reject_if_over_length("couple.location", &request.couple.location, MAX_COUPLE_FIELD_CHARS)?;
    reject_if_over_length("couple.guest_count", &request.couple.guest_count, MAX_COUPLE_FIELD_CHARS)?;
    reject_if_over_length("couple.budget_comfort", &request.couple.budget_comfort, MAX_COUPLE_FIELD_CHARS)?;
    reject_if_over_length("couple.atmosphere_description", &request.couple.atmosphere_description, MAX_COUPLE_FIELD_CHARS)?;
    reject_if_over_length("couple.vendor_preferences", &request.couple.vendor_preferences, MAX_COUPLE_FIELD_CHARS)?;
    reject_if_over_length("couple.couple_names", &request.couple.couple_names, MAX_COUPLE_FIELD_CHARS)?;
    if request.couple.top_priorities.len() > MAX_TOP_PRIORITIES {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("couple.top_priorities supports at most {MAX_TOP_PRIORITIES} entries"),
        ));
    }
    for priority in &request.couple.top_priorities {
        reject_if_over_length("couple.top_priorities[]", &Some(priority.clone()), MAX_COUPLE_FIELD_CHARS)?;
    }
    request.couple.top_priorities.truncate(MAX_TOP_PRIORITIES);

    if !couple_has_grounding(&request.couple) {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "capture some wedding basics first (date, location, priorities, or budget comfort) — an outreach draft needs at least one real detail about your wedding to personalise it".to_string(),
        ));
    }

    let api_key = read_hosted_anthropic_api_key().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Assisted vendor outreach is not configured on this homeserver. Set the hosted Anthropic API key (see Documents/deployment/OMNYID_ORACLE_DEPLOYMENT.md) to enable it.".to_string(),
    ))?;

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
        capped(&couple.date_or_season, MAX_COUPLE_FIELD_CHARS).map(|v| format!("date_or_season: {v}")),
        capped(&couple.location, MAX_COUPLE_FIELD_CHARS).map(|v| format!("location: {v}")),
        capped(&couple.guest_count, MAX_COUPLE_FIELD_CHARS).map(|v| format!("guest_count: {v}")),
        capped(&couple.budget_comfort, MAX_COUPLE_FIELD_CHARS).map(|v| format!("budget_comfort: {v}")),
        (!couple.top_priorities.is_empty())
            .then(|| format!("top_priorities: {}", couple.top_priorities.join(", "))),
        capped(&couple.atmosphere_description, MAX_COUPLE_FIELD_CHARS).map(|v| format!("atmosphere_description: {v}")),
        capped(&couple.vendor_preferences, MAX_COUPLE_FIELD_CHARS).map(|v| format!("vendor_preferences: {v}")),
        capped(&couple.couple_names, MAX_COUPLE_FIELD_CHARS).map(|v| format!("couple_names: {v}")),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join("\n");

    let user_text = format!(
        "Vendor to write to:\n{vendor_lines}\n\nWhat the couple has told OmnyID about their wedding (use only this — nothing else is known):\n{couple_lines}"
    );

    let raw = anthropic_text_infer(
        &state.http_client,
        &api_key,
        MODEL,
        WEDDING_VENDOR_OUTREACH_SYSTEM_PROMPT,
        &user_text,
    )
    .await
    .map_err(|err| {
        tracing::warn!(%err, user_id = %user.id, "wedding_vendor_outreach_draft: model call failed");
        (
            StatusCode::BAD_GATEWAY,
            "couldn't write an outreach draft right now — please try again in a moment".to_string(),
        )
    })?;

    let payload = parse_outreach_model_payload(&raw).map_err(|err| {
        tracing::warn!(%err, raw = %raw, "wedding_vendor_outreach_draft: could not parse model output");
        (
            StatusCode::BAD_GATEWAY,
            "couldn't write an outreach draft right now — please try again in a moment".to_string(),
        )
    })?;

    Ok(Json(WeddingVendorOutreachDraftResponse {
        subject: payload.subject,
        body_markdown: payload.body_markdown,
        grounded_on: payload.grounded_on,
        model: MODEL,
    }))
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

async fn anthropic_text_infer(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    system: &str,
    user_text: &str,
) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        "max_tokens": MAX_OUTPUT_TOKENS,
        "temperature": 0.6,
        "system": system,
        "messages": [{ "role": "user", "content": user_text }],
    });
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("http error: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("anthropic api error {status}: {text}"));
    }
    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("decode error: {e}"))?;
    Ok(json["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string())
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
        assert!(reject_if_over_length("couple.location", &Some(ok), MAX_COUPLE_FIELD_CHARS).is_ok());
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
    fn parses_fenced_json_response() {
        let raw = "```json\n{\"subject\": \"Enquiry\", \"body_markdown\": \"Hello there\", \"grounded_on\": [\"location\"]}\n```";
        let payload = parse_outreach_model_payload(raw).expect("should parse");
        assert_eq!(payload.subject, "Enquiry");
        assert_eq!(payload.body_markdown, "Hello there");
        assert_eq!(payload.grounded_on, vec!["location".to_string()]);
    }

    #[test]
    fn rejects_empty_grounded_on() {
        let raw = "{\"subject\": \"Enquiry\", \"body_markdown\": \"Hello there\", \"grounded_on\": []}";
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
