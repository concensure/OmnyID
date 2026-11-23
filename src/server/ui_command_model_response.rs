// @locs-version: 1.0
// @module-id: server.ui-command-model-response
// @primary-capability: master-agent-model-response-boundary
// @stability: beta

use super::UiCommandResponse;

#[cfg(test)]
use super::Value;

fn bounded_model_text(text: &str, max_chars: usize) -> String {
    let normalized = text.trim();
    if normalized.chars().count() <= max_chars {
        return normalized.to_string();
    }
    let mut value = normalized.chars().take(max_chars).collect::<String>();
    value.push('…');
    value
}

pub(super) fn unstructured_model_response(raw: &str, engine: String) -> Option<UiCommandResponse> {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('{')
        || trimmed.starts_with('[')
        || trimmed.starts_with("```json")
    {
        return None;
    }
    Some(UiCommandResponse {
        intent: "chat".to_string(),
        suggested_view: "search".to_string(),
        preferred_view: "chat".to_string(),
        summary: bounded_model_text(trimmed, 12_000),
        engine,
        links: vec![],
        runner_draft: None,
        bullets: vec![],
        card_id: None,
        preview_message: None,
        intent_route: None,
        boundary: None,
        execution_explanation: Some(serde_json::json!({
            "mode": "model_response",
            "model_inference_ran": true,
            "executed_agent_work": false,
        })),
    })
}

pub(super) fn configured_model_failure_response(engine: String) -> UiCommandResponse {
    let detail = "The connected AI model did not return a usable answer this time. Try again, or test the saved model connection in Settings.";
    UiCommandResponse {
        intent: "model_unavailable".to_string(),
        suggested_view: "search".to_string(),
        preferred_view: "chat".to_string(),
        summary: detail.to_string(),
        engine,
        links: vec![],
        runner_draft: None,
        bullets: vec![],
        card_id: None,
        preview_message: None,
        intent_route: None,
        boundary: Some(serde_json::json!({
            "kind": "command_fallback",
            "label": "AI model needs attention",
            "detail": detail,
            "llm_connected": true,
            "model_configured": true,
        })),
        execution_explanation: Some(serde_json::json!({
            "mode": "blocked",
            "reason": "The configured model call failed or returned an invalid structured response.",
            "model_inference_ran": true,
            "executed_agent_work": false,
        })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_provider_text_becomes_a_readable_chat_response() {
        let response = unstructured_model_response(
            "First paragraph.\n\nSecond paragraph.",
            "primary".to_string(),
        )
        .expect("plain model output should remain visible");

        assert_eq!(response.intent, "chat");
        assert_eq!(response.preferred_view, "chat");
        assert_eq!(response.summary, "First paragraph.\n\nSecond paragraph.");
        assert!(response.boundary.is_none());
    }

    #[test]
    fn invalid_structured_provider_output_uses_a_non_technical_failure() {
        assert!(unstructured_model_response("{not valid json", "primary".to_string()).is_none());
        let response = configured_model_failure_response("primary".to_string());

        assert_eq!(response.intent, "model_unavailable");
        assert_eq!(
            response
                .boundary
                .as_ref()
                .and_then(|value: &Value| value["model_configured"].as_bool()),
            Some(true)
        );
        assert!(!response.summary.to_lowercase().contains("http"));
        assert!(!response.summary.to_lowercase().contains("api key"));
    }
}
