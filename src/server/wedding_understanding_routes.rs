// @locs-version: 1.0
// @module-id: server.wedding-understanding
// @primary-capability: public-lead-magnet-wedding-aesthetic-reflection
// @stability: beta
//
// Free, unauthenticated "Wedding Understanding" lead magnet for the wedding
// marketing site (omnyid.com/wedding/): a visitor describes their wedding
// and/or uploads a few inspiration photos, and a vision-capable model
// reflects back the priorities their own choices reveal.
//
// This is a public endpoint that calls a paid vision model with no login
// required, which makes it the most cost-exposed route in the app. Every
// validation and limit below exists to bound token spend and abuse, not
// just correctness:
//   - images are capped in count and byte size (the client is also expected
//     to downscale/compress before upload; this is the server-side backstop)
//   - a short free-text minimum keeps empty/junk submissions from spending a
//     model call for nothing
//   - two rate-limit layers (burst + daily) bound worst-case spend per IP
//   - a honeypot field drops obvious bot submissions before any model call
//   - links are never fetched server-side — they are passed to the model as
//     plain text hints only, which avoids both SSRF risk and the extra
//     token/latency cost of fetching and describing remote pages
//   - output tokens are capped tightly, since the expected result is a few
//     short lines, not a long-form response
//   - nothing submitted here is persisted: images and text are used once,
//     for a single model call, and then discarded

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    AppState, RateLimitPolicy,
    auth::{enforce_rate_limit, public_rate_limit_key},
    llm_resolution::read_hosted_openrouter_api_key,
};

const MODEL: &str = "google/gemini-3.5-flash-lite";
const MAX_OUTPUT_TOKENS: u32 = 500;

const MAX_IMAGES: usize = 3;
const MAX_IMAGE_BYTES: usize = 1_500_000; // decoded bytes, per image
const MAX_TEXT_CHARS: usize = 4_000;
const MIN_TEXT_CHARS_WITHOUT_IMAGES: usize = 20;
const MAX_LINKS: usize = 5;
const MAX_LINK_CHARS: usize = 300;

const ALLOWED_IMAGE_MEDIA_TYPES: &[&str] = &["image/jpeg", "image/png", "image/webp"];

const WEDDING_UNDERSTANDING_SYSTEM_PROMPT: &str = r#"You are OmnyID's wedding-aesthetic reflection engine. A couple has spent a few minutes describing the wedding they're picturing, and may have shared inspiration photos and saved links. Your job is to reflect back what their own choices actually reveal about their priorities — not generic wedding advice, not a plan, not a checklist. Write a short, perceptive, warm "here's what we noticed" reflection: specific enough to feel true to this couple, never generic enough to apply to anyone.

Rules:
- Base every specific claim only on details actually present in what was shared. Never invent a number, name, date, or fact that was not given to you (for example, never state a guest count unless the couple wrote one).
- You may describe a visual style or mood you see across the photos (e.g. "string lights and long shared tables show up in every photo"), but do not claim to identify a specific commercial venue, brand, or vendor from an image — you cannot reliably verify identities from photos, so describe only what the image shows, not who or where it is.
- Look for one genuine tension: a place where the couple's words point one way and their photos or other stated preferences point somewhat differently. This should feel true and a little surprising, not manufactured. If nothing in what was shared suggests a real tension, return null for largest_tension rather than inventing one — a couple whose choices are already aligned deserves an honest reflection of that, not a fabricated conflict.
- Tone: warm, observant, a little poetic, never clinical, never salesy, never a sales pitch for any product. Address the couple directly ("you").
- Respond with ONLY valid JSON, no markdown code fences, no commentary before or after it, matching exactly this shape:
{"opening_observation": string or null, "core_theme": string, "preferences": [{"a": string, "b": string}, ... between 2 and 4 items], "largest_tension": string or null}

Field meaning:
- opening_observation: one sentence naming something specific and slightly surprising you noticed (or null if nothing stood out this way).
- core_theme: one sentence naming the through-line that consistently appears in their choices.
- preferences: 2 to 4 short "a > b" pairs of a few words each, contrasting what they seem to actually value against a plausible alternative (e.g. {"a": "people", "b": "spectacle"}). Only include pairs you can actually support from what was shared.
- largest_tension: one sentence naming the clearest tension between what they said and what their choices show, referencing only real details they gave you — or null if there genuinely isn't one."#;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/wedding/understanding", post(wedding_understanding_http))
}

#[derive(Deserialize)]
pub(super) struct WeddingUnderstandingImage {
    data_base64: String,
    media_type: String,
}

#[derive(Deserialize)]
pub(super) struct WeddingUnderstandingRequest {
    #[serde(default)]
    text: String,
    #[serde(default)]
    images: Vec<WeddingUnderstandingImage>,
    #[serde(default)]
    links: Vec<String>,
    /// Honeypot: a field real visitors never fill in (hidden on the form).
    /// Any non-empty value here means the submission is automated, so it is
    /// dropped before any model call is made.
    #[serde(default)]
    company: String,
}

#[derive(Serialize)]
struct PreferencePairOut {
    a: String,
    b: String,
}

#[derive(Deserialize)]
struct ModelPreferencePair {
    a: String,
    b: String,
}

#[derive(Deserialize)]
struct ModelUnderstandingPayload {
    opening_observation: Option<String>,
    core_theme: String,
    preferences: Vec<ModelPreferencePair>,
    largest_tension: Option<String>,
}

fn cleaned_link(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(MAX_LINK_CHARS).collect())
}

async fn wedding_understanding_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<WeddingUnderstandingRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    // Honeypot: accept-and-drop, no model call, no distinguishing error that
    // would help a bot learn it was detected.
    if !request.company.trim().is_empty() {
        return Ok(Json(serde_json::json!({ "status": "ok" })));
    }

    // Layered rate limiting: a short burst guard on top of a hard daily cap,
    // both per IP. This is the primary defense against runaway model spend
    // on a public, unauthenticated route.
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_understanding_burst", &headers),
        RateLimitPolicy {
            max_requests: 2,
            window: Duration::from_secs(600),
        },
    )
    .await?;
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_understanding_daily", &headers),
        RateLimitPolicy {
            max_requests: 3,
            window: Duration::from_secs(86_400),
        },
    )
    .await?;

    let text = request.text.trim();
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err((StatusCode::BAD_REQUEST, "text is too long".to_string()));
    }
    if request.images.len() > MAX_IMAGES {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("at most {MAX_IMAGES} photos are supported"),
        ));
    }
    if request.links.len() > MAX_LINKS {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("at most {MAX_LINKS} links are supported"),
        ));
    }
    if text.chars().count() < MIN_TEXT_CHARS_WITHOUT_IMAGES && request.images.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "tell us a little about the wedding, or add a photo, so there's something to reflect on"
                .to_string(),
        ));
    }

    // Build OpenRouter's OpenAI-compatible multimodal content blocks while
    // validating each image. The browser never provides a remote image URL;
    // only bounded, decoded-and-checked data URLs reach the provider.
    let mut content: Vec<Value> = Vec::with_capacity(request.images.len() + 1);
    for image in &request.images {
        if !ALLOWED_IMAGE_MEDIA_TYPES.contains(&image.media_type.as_str()) {
            return Err((
                StatusCode::BAD_REQUEST,
                "photos must be JPEG, PNG or WebP".to_string(),
            ));
        }
        let decoded = STANDARD.decode(image.data_base64.as_bytes()).map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "a photo failed to decode".to_string(),
            )
        })?;
        if decoded.len() > MAX_IMAGE_BYTES {
            return Err((
                StatusCode::BAD_REQUEST,
                "a photo is larger than allowed — please use a smaller image".to_string(),
            ));
        }
        content.push(serde_json::json!({
            "type": "image_url",
            "image_url": {
                "url": format!("data:{};base64,{}", image.media_type, image.data_base64),
            }
        }));
    }

    let links_line = {
        let cleaned: Vec<String> = request
            .links
            .iter()
            .filter_map(|link| cleaned_link(link))
            .collect();
        if cleaned.is_empty() {
            String::new()
        } else {
            format!(
                "\n\nInspiration links they saved (context only — you cannot browse these, treat them only as a hint about taste from their URLs/titles):\n{}",
                cleaned.join("\n")
            )
        }
    };

    let user_text = format!(
        "What the couple wrote about the wedding they're picturing:\n{}{}",
        if text.is_empty() {
            "(nothing written — go by the photos alone)"
        } else {
            text
        },
        links_line
    );
    content.push(serde_json::json!({ "type": "text", "text": user_text }));

    let api_key = read_hosted_openrouter_api_key().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "this feature isn't configured yet".to_string(),
    ))?;

    let raw = openrouter_vision_infer(
        &state.http_client,
        &api_key,
        MODEL,
        WEDDING_UNDERSTANDING_SYSTEM_PROMPT,
        content,
    )
    .await
    .map_err(|err| {
        tracing::warn!(%err, "wedding_understanding: model call failed");
        (
            StatusCode::BAD_GATEWAY,
            "couldn't generate your Wedding Understanding right now — please try again in a moment"
                .to_string(),
        )
    })?;

    let payload = parse_model_payload(&raw).map_err(|err| {
        tracing::warn!(%err, "wedding_understanding: could not parse model output");
        (
            StatusCode::BAD_GATEWAY,
            "couldn't generate your Wedding Understanding right now — please try again in a moment"
                .to_string(),
        )
    })?;

    Ok(Json(serde_json::json!({
        "title": "Your Wedding, According to OmnyID",
        "opening_observation": payload.opening_observation,
        "core_theme": payload.core_theme,
        "preferences": payload
            .preferences
            .into_iter()
            .map(|p| PreferencePairOut { a: p.a, b: p.b })
            .collect::<Vec<_>>(),
        "largest_tension": payload.largest_tension,
    })))
}

fn parse_model_payload(raw: &str) -> Result<ModelUnderstandingPayload, String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let payload: ModelUnderstandingPayload =
        serde_json::from_str(cleaned).map_err(|e| format!("json parse error: {e}"))?;
    if payload.core_theme.trim().is_empty() {
        return Err("empty core_theme".to_string());
    }
    if payload.preferences.is_empty() || payload.preferences.len() > 4 {
        return Err("preferences out of expected range".to_string());
    }
    Ok(payload)
}

async fn openrouter_vision_infer(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    system: &str,
    content: Vec<Value>,
) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        "max_completion_tokens": MAX_OUTPUT_TOKENS,
        "temperature": 0.7,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": content }
        ],
        "response_format": { "type": "json_object" },
        "provider": { "data_collection": "deny", "require_parameters": true },
    });
    let resp = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .bearer_auth(api_key)
        .header("HTTP-Referer", "https://omnyid.com/wedding/")
        .header("X-Title", "OmnyID Wedding Understanding")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("http error: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("openrouter api error {status}: {text}"));
    }
    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("decode error: {e}"))?;
    Ok(json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string())
}
