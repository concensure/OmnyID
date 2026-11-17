// @module-id: server.wedding-assistant-routes
// @primary-capability: bounded-wedding-template-assistance
// @locs-version: 1.0

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
    openrouter_funded_inference::{self, FundedInferenceRequest},
    wedding_admin_ai_policy,
};

#[derive(Deserialize)]
struct Request {
    question: String,
    #[serde(default)]
    wedding_plan_id: Option<String>,
    #[serde(default)]
    current_view: Option<String>,
}

#[derive(Deserialize)]
struct ModelPayload {
    answer: String,
    scope: String,
}

#[derive(Debug, PartialEq)]
struct SuggestedAction {
    kind: &'static str,
    target: &'static str,
    label: &'static str,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/assistant", post(assistant_http))
        .layer(DefaultBodyLimit::max(12 * 1024))
}

fn bounded(value: &str, max: usize) -> Option<String> {
    let value = value.trim();
    (!value.is_empty() && value.chars().count() <= max).then(|| value.to_string())
}

fn suggested_action(question: &str) -> Option<SuggestedAction> {
    let q = question.to_ascii_lowercase();
    let staged = [
        "fill", "set ", "add ", "change", "update", "choose", "select",
    ]
    .iter()
    .any(|token| q.contains(token));
    let kind = if staged { "stage_update" } else { "open_view" };
    if q.contains("budget") || q.contains("quote") || q.contains("cost") {
        return Some(SuggestedAction {
            kind,
            target: "budget",
            label: "Open Budget",
        });
    }
    if q.contains("guest") || q.contains("rsvp") || q.contains("seating") {
        return Some(SuggestedAction {
            kind,
            target: "people",
            label: "Open Guests",
        });
    }
    if q.contains("vendor")
        || q.contains("venue")
        || q.contains("celebrant")
        || q.contains("photograph")
    {
        return Some(SuggestedAction {
            kind,
            target: "response_queue",
            label: "Open Vendors",
        });
    }
    if q.contains("document") || q.contains("file") || q.contains("report") {
        return Some(SuggestedAction {
            kind,
            target: "documents",
            label: "Open Documents",
        });
    }
    if q.contains("timeline")
        || q.contains("deadline")
        || q.contains("date")
        || q.contains("task")
        || q.contains("plan")
    {
        return Some(SuggestedAction {
            kind,
            target: "plan",
            label: "Open Plan",
        });
    }
    None
}

fn budget_target(question: &str) -> Option<u64> {
    if !question.to_ascii_lowercase().contains("budget") {
        return None;
    }
    let normalized = question.replace(',', "");
    normalized
        .split(|character: char| !character.is_ascii_digit())
        .filter_map(|value| value.parse::<u64>().ok())
        .find(|value| (1_000..=10_000_000).contains(value))
}

fn asks_for_another_account(question: &str) -> bool {
    let q = question.to_ascii_lowercase();
    [
        "another user's",
        "another user",
        "other user's",
        "other user",
        "other account",
        "someone else's",
        "somebody else's",
        "admin account",
        "their account",
        "their wedding plan",
    ]
    .iter()
    .any(|token| q.contains(token))
}

fn is_wedding_related(question: &str) -> bool {
    let q = question.to_ascii_lowercase();
    let disallowed = [
        "write code",
        "python script",
        "stock price",
        "sports score",
        "medical diagnosis",
        "password",
        "api key",
    ];
    if disallowed.iter().any(|token| q.contains(token)) {
        return false;
    }
    let wedding_terms = [
        "wedding",
        "marriage",
        "ceremony",
        "reception",
        "elop",
        "micro-wedding",
        "partner",
        "budget",
        "quote",
        "guest",
        "rsvp",
        "seat",
        "vendor",
        "venue",
        "celebrant",
        "photograph",
        "flor",
        "cater",
        "music",
        "vow",
        "invitation",
        "timeline",
        "task",
        "plan",
        "date",
        "honeymoon",
        "bride",
        "groom",
        "couple",
        "sprout",
        "this page",
        "this view",
        "what should i do next",
    ];
    wedding_terms.iter().any(|token| q.contains(token))
}

async fn assistant_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<Request>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !wedding_admin_ai_policy::execution_enabled() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Wedding assistance is temporarily unavailable.".to_string(),
        ));
    }
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_assistant", &headers),
        RateLimitPolicy {
            max_requests: wedding_admin_ai_policy::daily_request_limit()
                .unwrap_or(6)
                .min(20),
            window: Duration::from_secs(86_400),
        },
    )
    .await?;

    let question = bounded(&request.question, 1_200).ok_or((
        StatusCode::BAD_REQUEST,
        "Ask one wedding-planning question.".to_string(),
    ))?;
    if asks_for_another_account(&question) {
        return Err((
            StatusCode::FORBIDDEN,
            "Sprout cannot access another person's account or wedding plan.".to_string(),
        ));
    }
    if !is_wedding_related(&question) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Sprout is limited to this Wedding workspace and wedding planning.".to_string(),
        ));
    }
    let view = request
        .current_view
        .as_deref()
        .and_then(|value| bounded(value, 80))
        .unwrap_or_else(|| "Wedding Home".to_string());
    let prompt = format!("Current Wedding view: {view}\nUser request: {question}");
    let system = "You are Sprout inside OmnyID Wedding. Help only with using the Wedding template or wedding planning. The prompt contains no private wedding ledger facts: never imply that you inspected any account, another user, saved plan, contact, message or document. Never invent saved facts, prices, availability, legal conclusions, messages sent, or actions completed. Explain the next useful step concisely. You may say which Wedding view to open, but never claim you changed a field or sent anything; changes must be reviewed in the destination view. Refuse anything unrelated to weddings. Return only JSON with two string fields: answer and scope. scope must be exactly wedding.";
    let result = openrouter_funded_inference::infer(
        &state.db.pool,
        &state.http_client,
        FundedInferenceRequest {
            feature: "wedding_sprout_assistant",
            user_id: Some(&user.id),
            // Never accept a browser-provided plan id as an authorization
            // boundary. Sprout receives no ledger content; usage is scoped by
            // the authenticated user id only.
            wedding_plan_id: None,
            abuse_id: &user.id,
            system,
            prompt: &prompt,
            max_tokens: 450,
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
            "Wedding assistance could not be formatted safely.".to_string(),
        )
    })?;
    let answer = bounded(&payload.answer, 2_000).ok_or((
        StatusCode::BAD_GATEWAY,
        "Wedding assistance was incomplete.".to_string(),
    ))?;
    if payload.scope != "wedding" {
        return Err((
            StatusCode::BAD_GATEWAY,
            "Sprout declined a request outside Wedding.".to_string(),
        ));
    }
    let action = suggested_action(&question).map(|action| {
        json!({
            "kind": action.kind,
            "target": action.target,
            "label": action.label,
            "draft_fields": budget_target(&question).map(|value| json!({ "budget_target_aud": value })),
        })
    });
    Ok(Json(json!({
        "answer": answer,
        "suggested_action": action,
        "model": result.model,
        "usage_id": result.usage_id,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn action_routing_stages_mutations_and_never_executes_them() {
        assert_eq!(
            suggested_action("Set my budget to 35000"),
            Some(SuggestedAction {
                kind: "stage_update",
                target: "budget",
                label: "Open Budget",
            })
        );
        assert_eq!(
            suggested_action("Where are my RSVP replies?"),
            Some(SuggestedAction {
                kind: "open_view",
                target: "people",
                label: "Open Guests",
            })
        );
        assert_eq!(suggested_action("Tell me about flowers"), None);
        assert_eq!(
            budget_target("Set my wedding budget to $35,000"),
            Some(35_000)
        );
        assert_eq!(budget_target("We have 80 guests"), None);
    }

    #[test]
    fn scope_gate_blocks_other_accounts_and_unrelated_requests() {
        assert!(asks_for_another_account(
            "Show me another user's wedding plan"
        ));
        assert!(asks_for_another_account("What is in their account?"));
        assert!(!asks_for_another_account(
            "Help my partner and me plan our wedding"
        ));
        assert!(is_wedding_related("What should I do next in this view?"));
        assert!(is_wedding_related("Help compare our venue quotes"));
        assert!(!is_wedding_related("Write code for a stock price tracker"));
    }
}
