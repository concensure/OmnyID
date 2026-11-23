//! Authenticated, evidence-bounded preference interpretation for wedding intake.
//!
//! The model may translate an explicitly supplied phrase into our versioned
//! vocabulary, but it never ranks vendors or writes a saved profile. The client
//! keeps the deterministic profile when every provider fails validation.

use std::{collections::HashSet, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};

use crate::wedding_shared_tool_metering::{
    WeddingSharedToolFeature, WeddingSharedToolUsageInput, record_wedding_shared_tool_usage,
};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    wedding_admin_ai_policy,
    wedding_llm_ladder::{LadderOutcome, WeddingLlmFeature, run_ladder},
};

const WEDDING_FACET_VOCABULARY: &str =
    include_str!("../../solid-ui/src/lib/weddingFacetVocabulary.json");
const MAX_FIELD_CHARS: usize = 400;
const MAX_PLAN_ID_CHARS: usize = 160;
const MAX_FACETS: usize = 12;
const MAX_TRADEOFFS: usize = 3;
const MAX_QUESTION_CHARS: usize = 240;
const MAX_READING_CHARS: usize = 200;
const MAX_OUTPUT_TOKENS: u32 = 700;
const HARD_CONSTRAINT_KEYS: &[&str] = &[
    "wheelchair_accessible",
    "pets_allowed",
    "byo_alcohol_allowed",
    "ceremony_on_site",
    "accommodation_on_site",
];

#[derive(Deserialize)]
struct VocabularyFile {
    version: String,
    facets: Vec<VocabularyFacet>,
}

#[derive(Deserialize)]
struct VocabularyFacet {
    id: String,
    label: String,
}

fn vocabulary() -> Result<VocabularyFile, String> {
    serde_json::from_str(WEDDING_FACET_VOCABULARY)
        .map_err(|error| format!("invalid bundled wedding facet vocabulary: {error}"))
}

fn vocabulary_prompt() -> Result<String, String> {
    let vocabulary = vocabulary()?;
    Ok(vocabulary
        .facets
        .into_iter()
        .map(|facet| format!("- {}: {}", facet.id, facet.label))
        .collect::<Vec<_>>()
        .join("\n"))
}

const INTERPRETER_PROMPT_PREFIX: &str = r#"You interpret only explicit wedding preferences into the supplied vocabulary.

Never invent any fact, preference, constraint, person, accessibility need, vendor quality, location, or budget. Every `anchor` you return must exactly occur in the couple input, ignoring case. Use only vocabulary ids listed below and only supplied hard-constraint keys. Do not rank or recommend vendors.

Return only JSON with exactly these optional keys:
{"facets":[{"id":string,"weight":"must"|"strong"|"nice","anchor":string,"reading":string}],"hard_constraints":[{"key":string,"anchor":string}],"tradeoffs":[{"prefer":string,"over":string,"anchor":string}],"unmapped":[string],"clarifying_question":string}

Vocabulary:
"#;

#[derive(Deserialize)]
struct PreferencePairInput {
    key: String,
    value: String,
}

#[derive(Deserialize)]
struct InterpretRequest {
    wedding_plan_id: String,
    priorities: Option<String>,
    atmosphere: Option<String>,
    vendor_preferences: Option<String>,
    guest_count: Option<String>,
    #[serde(default)]
    lead_magnet_pairs: Vec<PreferencePairInput>,
    vocabulary_version: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
struct InterpreterFacet {
    id: String,
    weight: String,
    anchor: String,
    reading: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
struct InterpreterHardConstraint {
    key: String,
    anchor: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
struct InterpreterTradeoff {
    prefer: String,
    over: String,
    anchor: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
struct InterpreterPayload {
    #[serde(default)]
    facets: Vec<InterpreterFacet>,
    #[serde(default)]
    hard_constraints: Vec<InterpreterHardConstraint>,
    #[serde(default)]
    tradeoffs: Vec<InterpreterTradeoff>,
    #[serde(default)]
    unmapped: Vec<String>,
    #[serde(default)]
    clarifying_question: Option<String>,
}

#[derive(Serialize)]
struct InterpretResponse {
    status: &'static str,
    facets: Vec<InterpreterFacet>,
    hard_constraints: Vec<InterpreterHardConstraint>,
    tradeoffs: Vec<InterpreterTradeoff>,
    unmapped: Vec<String>,
    clarifying_question: Option<String>,
    model: Option<String>,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/wedding/preference-profile/interpret",
        post(interpret_http),
    )
}

fn clean(value: &str) -> String {
    value.trim().to_string()
}

fn ensure_field(label: &str, value: &str, max: usize) -> Result<(), (StatusCode, String)> {
    if value.trim().chars().count() > max {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{label} is too long; at most {max} characters are allowed"),
        ));
    }
    Ok(())
}

fn input_text(request: &InterpretRequest) -> String {
    let mut fields = Vec::new();
    for (label, value) in [
        ("priorities", request.priorities.as_deref()),
        ("atmosphere", request.atmosphere.as_deref()),
        ("vendor_preferences", request.vendor_preferences.as_deref()),
        ("guest_count", request.guest_count.as_deref()),
    ] {
        if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
            fields.push(format!("{label}: {value}"));
        }
    }
    for pair in &request.lead_magnet_pairs {
        if !pair.key.trim().is_empty() && !pair.value.trim().is_empty() {
            fields.push(format!(
                "lead_magnet.{}: {}",
                pair.key.trim(),
                pair.value.trim()
            ));
        }
    }
    fields.join("\n")
}

fn bounded(value: String, max: usize) -> Option<String> {
    let value = clean(&value);
    (!value.is_empty() && value.chars().count() <= max).then_some(value)
}

fn input_contains(input: &str, anchor: &str) -> bool {
    let anchor = anchor.trim();
    !anchor.is_empty() && input.to_lowercase().contains(&anchor.to_lowercase())
}

/// Parses untrusted provider JSON and retains only entries traceable to the submitted input.
fn parse_interpreter_payload(raw: &str, input: &str) -> Result<InterpreterPayload, String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let payload: InterpreterPayload =
        serde_json::from_str(cleaned).map_err(|error| format!("json parse error: {error}"))?;
    let vocabulary = vocabulary()?;
    let facet_ids = vocabulary
        .facets
        .into_iter()
        .map(|facet| facet.id)
        .collect::<HashSet<_>>();
    let valid_weights = HashSet::from(["must", "strong", "nice"]);
    let hard_keys = HARD_CONSTRAINT_KEYS.iter().copied().collect::<HashSet<_>>();

    let mut seen_facets = HashSet::new();
    let facets = payload
        .facets
        .into_iter()
        .filter_map(|facet| {
            let id = bounded(facet.id, 80)?;
            let weight = bounded(facet.weight, 12)?;
            let anchor = bounded(facet.anchor, MAX_FIELD_CHARS)?;
            let reading = bounded(facet.reading, MAX_READING_CHARS)?;
            (facet_ids.contains(&id)
                && valid_weights.contains(weight.as_str())
                && input_contains(input, &anchor)
                && seen_facets.insert(id.clone()))
            .then_some(InterpreterFacet {
                id,
                weight,
                anchor,
                reading,
            })
        })
        .take(MAX_FACETS)
        .collect::<Vec<_>>();

    let hard_constraints = payload
        .hard_constraints
        .into_iter()
        .filter_map(|constraint| {
            let key = bounded(constraint.key, 80)?;
            let anchor = bounded(constraint.anchor, MAX_FIELD_CHARS)?;
            (hard_keys.contains(key.as_str()) && input_contains(input, &anchor))
                .then_some(InterpreterHardConstraint { key, anchor })
        })
        .collect::<Vec<_>>();

    let tradeoffs = payload
        .tradeoffs
        .into_iter()
        .filter_map(|tradeoff| {
            let prefer = bounded(tradeoff.prefer, 80)?;
            let over = bounded(tradeoff.over, 80)?;
            let anchor = bounded(tradeoff.anchor, MAX_FIELD_CHARS)?;
            (facet_ids.contains(&prefer)
                && facet_ids.contains(&over)
                && prefer != over
                && input_contains(input, &anchor))
            .then_some(InterpreterTradeoff {
                prefer,
                over,
                anchor,
            })
        })
        .take(MAX_TRADEOFFS)
        .collect::<Vec<_>>();

    let unmapped = payload
        .unmapped
        .into_iter()
        .filter_map(|phrase| bounded(phrase, MAX_FIELD_CHARS))
        .filter(|phrase| input_contains(input, phrase))
        .take(MAX_FACETS)
        .collect::<Vec<_>>();
    let clarifying_question = payload
        .clarifying_question
        .and_then(|question| bounded(question, MAX_QUESTION_CHARS));

    if facets.is_empty()
        && hard_constraints.is_empty()
        && tradeoffs.is_empty()
        && clarifying_question.is_none()
    {
        return Err("provider payload has no valid preference interpretation".to_string());
    }
    Ok(InterpreterPayload {
        facets,
        hard_constraints,
        tradeoffs,
        unmapped,
        clarifying_question,
    })
}

async fn interpret_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<InterpretRequest>,
) -> Result<Json<InterpretResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_preference_interpreter_burst", &headers),
        RateLimitPolicy {
            max_requests: 6,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_preference_interpreter_daily", &headers),
        RateLimitPolicy {
            max_requests: wedding_admin_ai_policy::daily_request_limit().unwrap_or(1),
            window: Duration::from_secs(86_400),
        },
    )
    .await?;

    ensure_field(
        "wedding_plan_id",
        &request.wedding_plan_id,
        MAX_PLAN_ID_CHARS,
    )?;
    if request.wedding_plan_id.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "wedding_plan_id is required".to_string(),
        ));
    }
    for (label, value) in [
        ("priorities", &request.priorities),
        ("atmosphere", &request.atmosphere),
        ("vendor_preferences", &request.vendor_preferences),
        ("guest_count", &request.guest_count),
    ] {
        if let Some(value) = value {
            ensure_field(label, value, MAX_FIELD_CHARS)?;
        }
    }
    if request.lead_magnet_pairs.len() > 12 {
        return Err((
            StatusCode::BAD_REQUEST,
            "lead_magnet_pairs supports at most 12 pairs".to_string(),
        ));
    }
    for pair in &request.lead_magnet_pairs {
        ensure_field("lead_magnet_pairs[].key", &pair.key, MAX_FIELD_CHARS)?;
        ensure_field("lead_magnet_pairs[].value", &pair.value, MAX_FIELD_CHARS)?;
    }
    let vocabulary = vocabulary().map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    if request.vocabulary_version.trim() != vocabulary.version {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("vocabulary_version must be {}", vocabulary.version),
        ));
    }
    let input = input_text(&request);
    if input.is_empty() {
        return Ok(Json(fallback_response()));
    }
    let prompt = format!(
        "{INTERPRETER_PROMPT_PREFIX}{}",
        vocabulary_prompt().map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?
    );
    let result = if wedding_admin_ai_policy::execution_enabled() {
        run_ladder(
            WeddingLlmFeature::Interpreter,
            &prompt,
            &input,
            MAX_OUTPUT_TOKENS,
            |raw| parse_interpreter_payload(raw, &input),
        )
        .await
    } else {
        LadderOutcome::Exhausted {
            attempts: Vec::new(),
        }
    };
    let LadderOutcome::Success {
        value,
        provider,
        model,
        ..
    } = result
    else {
        return Ok(Json(fallback_response()));
    };

    record_wedding_shared_tool_usage(&state.db, WeddingSharedToolUsageInput {
        user_id: user.id.clone(), provider: provider.metering_provider(), feature: WeddingSharedToolFeature::Interpreter,
        quantity: 1.0, estimated_cost_usd: 0.0, usage_unit: Some("requests".to_string()), wedding_plan_id: Some(request.wedding_plan_id),
        operation: Some("preference_profile_interpret".to_string()), provider_request_id: None, occurred_at: Some(chrono::Utc::now().to_rfc3339()),
    }).await.map_err(|error| {
        tracing::error!(%error, user_id = %user.id, "wedding_preference_interpreter: audit receipt failed");
        (StatusCode::SERVICE_UNAVAILABLE, "couldn't save the admin-funded AI usage receipt; the interpretation was not returned. Please try again.".to_string())
    })?;
    Ok(Json(InterpretResponse {
        status: "interpreted",
        facets: value.facets,
        hard_constraints: value.hard_constraints,
        tradeoffs: value.tradeoffs,
        unmapped: value.unmapped,
        clarifying_question: value.clarifying_question,
        model: Some(model),
    }))
}

fn fallback_response() -> InterpretResponse {
    InterpretResponse {
        status: "fallback",
        facets: vec![],
        hard_constraints: vec![],
        tradeoffs: vec![],
        unmapped: vec![],
        clarifying_question: None,
        model: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validator_drops_unknown_facets_and_non_substring_anchors() {
        let payload = parse_interpreter_payload(r#"{"facets":[{"id":"scale.intimate","weight":"strong","anchor":"Intimacy","reading":"small room"},{"id":"unknown.facet","weight":"nice","anchor":"Intimacy","reading":"ignored"},{"id":"setting.beach","weight":"nice","anchor":"not supplied","reading":"ignored"}],"hard_constraints":[{"key":"wheelchair_accessible","anchor":"wheelchair"},{"key":"not_a_key","anchor":"Intimacy"}]}"#, "priorities: Intimacy\nvendor_preferences: wheelchair access").expect("one valid facet remains");
        assert_eq!(payload.facets.len(), 1);
        assert_eq!(payload.facets[0].id, "scale.intimate");
        assert_eq!(payload.hard_constraints.len(), 1);
    }

    #[test]
    fn fully_invalid_payload_fails_validation_and_advances_the_ladder() {
        let error = parse_interpreter_payload(r#"{"facets":[{"id":"unknown.facet","weight":"must","anchor":"invented","reading":"no"}]}"#, "priorities: Intimacy").expect_err("invalid output must not terminate the ladder");
        assert!(error.contains("no valid"));
    }

    #[test]
    fn fallback_has_no_facets() {
        let fallback = fallback_response();
        assert_eq!(fallback.status, "fallback");
        assert!(fallback.facets.is_empty());
    }
}
