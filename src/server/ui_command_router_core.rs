/*
 * @module-id: rust.server.ui-command-router-core
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use ulid::Ulid;

use crate::db::RuntimeDeploymentRecord;
use crate::intent_routing::{infer_route_decision, route_metadata_json, special_route_decision};
use crate::ui_command_intent_contract::preferred_view_for_intent;

use super::types::{UiCommandLink, UiCommandResponse, UiRunnerDraftResponse};
use super::ui_command_zero_token::ZeroTokenRouteHint;

pub(super) fn normalize_search_engine(engine: Option<&str>) -> String {
    match engine
        .unwrap_or("duckduckgo")
        .trim()
        .to_lowercase()
        .as_str()
    {
        "google" => "google".to_string(),
        _ => "duckduckgo".to_string(),
    }
}

pub(super) fn search_engine_url(engine: &str, query: &str) -> String {
    let encoded = url_encode_query(query);
    match engine {
        "google" => format!("https://www.google.com/search?q={encoded}"),
        _ => format!("https://duckduckgo.com/?q={encoded}"),
    }
}

fn url_encode_query(input: &str) -> String {
    input
        .bytes()
        .flat_map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![b as char]
            }
            b' ' => vec!['+'],
            _ => format!("%{b:02X}").chars().collect(),
        })
        .collect()
}

fn command_fallback_boundary(detail: &str) -> serde_json::Value {
    serde_json::json!({
        "kind": "command_fallback",
        "label": "Deterministic fallback",
        "detail": detail,
        "llm_connected": false,
    })
}

fn command_fallback_execution_explanation(summary: &str, reason: &str) -> serde_json::Value {
    serde_json::json!({
        "mode": "deterministic_fallback",
        "summary": summary,
        "reason": reason,
        "model_inference_ran": false,
        "executed_agent_work": false,
    })
}

fn infer_runner_target_file(query: &str, active_file_id: Option<&str>) -> String {
    let lowered = query.to_lowercase();
    if lowered.contains("dockerfile")
        || lowered.contains("container")
        || lowered.contains("image build")
    {
        "dockerfile".to_string()
    } else if lowered.contains("policy.py")
        || lowered.contains("policy ")
        || lowered.contains("allowlist")
    {
        "policy_py".to_string()
    } else if lowered.contains("tool registry") || lowered.contains("tool_registry") {
        "tool_registry_py".to_string()
    } else if lowered.contains("requirements")
        || lowered.contains("dependency")
        || lowered.contains("package")
    {
        "requirements_txt".to_string()
    } else if lowered.contains("template") {
        "starter_templates_json".to_string()
    } else if lowered.contains("profile") || lowered.contains("agent profile") {
        "agent_profile_json".to_string()
    } else if lowered.contains("runtime policy")
        || lowered.contains("token cap")
        || lowered.contains("spend cap")
    {
        "runtime_policy_json".to_string()
    } else if let Some(current) = active_file_id {
        current.to_string()
    } else {
        "runner_chat_py".to_string()
    }
}

fn build_runner_draft(query: &str, target_file_id: &str) -> UiRunnerDraftResponse {
    let timestamp = chrono::Utc::now().to_rfc3339();
    let snippet = match target_file_id {
        "policy_py" => format!(
            "\n\n# TODO(omnyid-search-agent): requested from unified command bar at {timestamp}\n# Instruction: {query}\ndef requested_policy_hook(policy: dict, context: dict) -> dict:\n    \"\"\"Implement the requested policy behavior and return the updated context.\"\"\"\n    return context\n"
        ),
        "tool_registry_py" => format!(
            "\n\n# TODO(omnyid-search-agent): requested from unified command bar at {timestamp}\n# Instruction: {query}\ndef requested_tool_action(prompt: str, policy: dict):\n    \"\"\"Add a capability-gated tool flow for this request.\"\"\"\n    return [], []\n"
        ),
        "requirements_txt" => format!(
            "\n# TODO(omnyid-search-agent): review requested dependency change at {timestamp}: {query}\n"
        ),
        "starter_templates_json" => format!(
            "\n{{\n  \"id\": \"generated_template_{id}\",\n  \"name\": \"Generated from command bar\",\n  \"summary\": \"{summary}\",\n  \"system_prompt\": \"Expand this into a safe starter template based on the user request.\",\n  \"suggested_prompts\": [\"{prompt}\"]\n}}\n",
            id = Ulid::new(),
            summary = query.replace('"', "'"),
            prompt = query.replace('"', "'")
        ),
        "agent_profile_json" => format!(
            "\n// TODO(omnyid-search-agent): review profile update requested at {timestamp}: {query}\n"
        ),
        "runtime_policy_json" => format!(
            "\n// TODO(omnyid-search-agent): review policy update requested at {timestamp}: {query}\n"
        ),
        _ => format!(
            "\n\n# TODO(omnyid-search-agent): requested from unified command bar at {timestamp}\n# Instruction: {query}\ndef requested_command_bar_change(state: dict):\n    \"\"\"Implement the requested runner behavior and return the updated state.\"\"\"\n    return state\n"
        ),
    };

    UiRunnerDraftResponse {
        target_file_id: target_file_id.to_string(),
        title: "Command bar draft".to_string(),
        content: snippet,
        requires_confirmation: true,
    }
}

pub(super) fn route_ui_command(
    query: &str,
    engine: String,
    deployment: Option<&RuntimeDeploymentRecord>,
    active_file_id: Option<&str>,
) -> UiCommandResponse {
    let lowered = query.to_lowercase();
    let runner_intent = [
        "runner",
        "python",
        "code",
        "edit",
        "function",
        "policy",
        "tool registry",
        "requirements",
        "template",
        "dockerfile",
        "container",
        "image build",
    ]
    .iter()
    .any(|token| lowered.contains(token));

    if runner_intent && deployment.map(|item| item.framework.as_str()) == Some("python-runner-chat")
    {
        let target_file_id = infer_runner_target_file(query, active_file_id);
        let intent_route = route_metadata_json(&special_route_decision(
            "runner_edit",
            preferred_view_for_intent("runner_edit"),
            "The command bar matched a deterministic Python runner edit route.",
        ));
        return UiCommandResponse {
            intent: "runner_edit".to_string(),
            suggested_view: "runner".to_string(),
            preferred_view: preferred_view_for_intent("runner_edit").to_string(),
            summary: "The command bar recognized a Python runner code/config edit request and prepared a review-required draft.".to_string(),
            engine,
            links: vec![],
            runner_draft: Some(build_runner_draft(query, &target_file_id)),
            bullets: vec![],
            card_id: None,
            preview_message: None,
            intent_route: Some(intent_route),
            boundary: None,
            execution_explanation: Some(serde_json::json!({
                "mode": "review_required",
                "reason": "Runner edits stay draft-only until reviewed."
            })),
        };
    }

    if lowered.contains("dashboard")
        || lowered.contains("agent status")
        || lowered.contains("messages")
    {
        let intent_route = route_metadata_json(&special_route_decision(
            "dashboard_focus",
            preferred_view_for_intent("dashboard_focus"),
            "The command bar matched a deterministic dashboard focus route.",
        ));
        return UiCommandResponse {
            intent: "dashboard_focus".to_string(),
            suggested_view: "search".to_string(),
            preferred_view: preferred_view_for_intent("dashboard_focus").to_string(),
            summary: "The command bar recognized a dashboard intent and can pivot the UI to recent agent output and runtime health.".to_string(),
            engine,
            links: vec![],
            runner_draft: None,
            bullets: vec![],
            card_id: None,
            preview_message: None,
            intent_route: Some(intent_route),
            boundary: None,
            execution_explanation: None,
        };
    }

    if let Some(hint) = super::ui_command_zero_token::classify_zero_token_signal(query) {
        return zero_token_response(hint, engine);
    }

    let task_keywords = [
        "add ",
        "add to",
        "remind me",
        "reminder",
        "todo",
        "to-do",
        "to do",
        "shopping list",
        "buy ",
        "note:",
        "note to",
        "remember to",
        "don't forget",
        "task:",
        "create task",
        "new task",
        "make a note",
        "jot down",
    ];
    let is_task = task_keywords.iter().any(|t| lowered.contains(t));
    if is_task {
        let route = infer_route_decision(
            query,
            &serde_json::json!({
                "intent": "task",
                "preferred_view": preferred_view_for_intent("task"),
                "summary": format!("Task noted: {query}. Sign in and configure your LLM for full agent routing."),
                "task_type": "general"
            }),
        );
        return UiCommandResponse {
            intent: "task".to_string(),
            suggested_view: "search".to_string(),
            preferred_view: preferred_view_for_intent("task").to_string(),
            summary: format!(
                "Task noted: {query}. Sign in and configure your LLM for full agent routing."
            ),
            engine,
            links: vec![],
            runner_draft: None,
            bullets: vec![
                "Connect your LLM in Agent Settings to enable full task management.".to_string(),
            ],
            card_id: None,
            preview_message: None,
            intent_route: Some(route_metadata_json(&route)),
            boundary: Some(command_fallback_boundary(
                "No LLM backend is connected. This task result was assembled from deterministic command-bar rules.",
            )),
            execution_explanation: Some(command_fallback_execution_explanation(
                "This task result came from deterministic command-bar rules only.",
                "No server-side LLM is connected, so the workspace did not run model inference or execute agent task work for this request.",
            )),
        };
    }

    let route = infer_route_decision(
        query,
        &serde_json::json!({
            "intent": "web_research",
            "preferred_view": preferred_view_for_intent("web_research"),
            "query": query,
            "summary": "Web search - results below"
        }),
    );
    UiCommandResponse {
        intent: "web_search".to_string(),
        suggested_view: "search".to_string(),
        preferred_view: preferred_view_for_intent("web_research").to_string(),
        summary: "Web search - results below".to_string(),
        links: vec![UiCommandLink {
            title: "Search the web".to_string(),
            url: search_engine_url(&engine, query),
            kind: "search".to_string(),
            origin: Some("external".to_string()),
        }],
        engine,
        runner_draft: None,
        bullets: vec![],
        card_id: None,
        preview_message: None,
        intent_route: Some(route_metadata_json(&route)),
        boundary: Some(command_fallback_boundary(
            "No LLM backend is connected. This web result is a deterministic handoff to external search, not an AI-generated answer.",
        )),
        execution_explanation: Some(command_fallback_execution_explanation(
            "This result is a deterministic handoff to external search.",
            "No server-side LLM is connected, so the workspace did not generate an AI answer or execute agent work before returning this search handoff.",
        )),
    }
}

fn zero_token_response(hint: ZeroTokenRouteHint, engine: String) -> UiCommandResponse {
    let mut route_meta = route_metadata_json(&infer_route_decision(&hint.summary, &hint.payload));
    if let Some(route_obj) = route_meta.as_object_mut() {
        if let Some(audit_obj) = route_obj
            .get_mut("audit")
            .and_then(|value| value.as_object_mut())
        {
            audit_obj.insert(
                "route_reason".to_string(),
                serde_json::Value::String(hint.route_reason.to_string()),
            );
            let heuristics = audit_obj
                .entry("heuristics_used".to_string())
                .or_insert_with(|| serde_json::json!([]));
            if let Some(existing) = heuristics.as_array_mut() {
                for heuristic in hint.heuristics_used {
                    if !existing
                        .iter()
                        .any(|value| value.as_str() == Some(heuristic.as_str()))
                    {
                        existing.push(serde_json::Value::String(heuristic));
                    }
                }
            }
        }
    }

    UiCommandResponse {
        intent: hint.intent.to_string(),
        suggested_view: hint.suggested_view.to_string(),
        preferred_view: hint.preferred_view.to_string(),
        summary: hint.summary,
        engine,
        links: vec![],
        runner_draft: None,
        bullets: hint.bullets,
        card_id: None,
        preview_message: None,
        intent_route: Some(route_meta),
        boundary: Some(command_fallback_boundary(
            "No LLM backend is connected. This result came from a zero-token fallback shortcut instead of model inference.",
        )),
        execution_explanation: Some(command_fallback_execution_explanation(
            "This result came from a zero-token fallback shortcut.",
            "No server-side LLM is connected, so the workspace matched a bounded deterministic shortcut and did not run model inference or execute agent work.",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_deployment() -> RuntimeDeploymentRecord {
        RuntimeDeploymentRecord {
            id: "dep_1".to_string(),
            owner_user_id: "user_1".to_string(),
            framework: "python-runner-chat".to_string(),
            gui: None,
            status: "running".to_string(),
            python_version: "3.11".to_string(),
            image_ref: "image".to_string(),
            runtime_token: "token".to_string(),
            workspace_path: "C:\\workspace".to_string(),
            config_json: serde_json::json!({}),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn normalize_search_engine_defaults_to_duckduckgo() {
        assert_eq!(normalize_search_engine(None), "duckduckgo");
        assert_eq!(normalize_search_engine(Some(" GOOGLE ")), "google");
    }

    #[test]
    fn route_ui_command_builds_runner_edit_for_python_runner_requests() {
        let response = route_ui_command(
            "edit the dockerfile",
            "duckduckgo".to_string(),
            Some(&sample_deployment()),
            None,
        );
        assert_eq!(response.intent, "runner_edit");
        assert_eq!(response.preferred_view, "runner");
        assert_eq!(
            response
                .runner_draft
                .as_ref()
                .map(|draft| draft.target_file_id.as_str()),
            Some("dockerfile")
        );
        assert_eq!(
            response
                .intent_route
                .as_ref()
                .and_then(|meta| meta["route_mode"].as_str()),
            Some("special")
        );
    }

    #[test]
    fn route_ui_command_can_target_policy_file_for_python_runner_requests() {
        let response = route_ui_command(
            "Edit policy.py to tighten the allowlist",
            "duckduckgo".to_string(),
            Some(&sample_deployment()),
            Some("runner_chat_py"),
        );
        assert_eq!(response.intent, "runner_edit");
        assert_eq!(response.suggested_view, "runner");
        assert_eq!(
            response
                .runner_draft
                .as_ref()
                .map(|draft| draft.target_file_id.as_str()),
            Some("policy_py")
        );
    }

    #[test]
    fn route_ui_command_can_target_dockerfile_from_active_runner_file() {
        let response = route_ui_command(
            "Update the Dockerfile to add a system package",
            "duckduckgo".to_string(),
            Some(&sample_deployment()),
            Some("runner_chat_py"),
        );
        assert_eq!(response.intent, "runner_edit");
        assert_eq!(
            response
                .runner_draft
                .as_ref()
                .map(|draft| draft.target_file_id.as_str()),
            Some("dockerfile")
        );
    }

    #[test]
    fn route_ui_command_falls_back_to_search_link() {
        let response = route_ui_command("what is rust", "google".to_string(), None, None);
        assert_eq!(response.intent, "web_search");
        assert_eq!(response.preferred_view, "search_result");
        assert_eq!(response.links.len(), 1);
        assert_eq!(
            response
                .boundary
                .as_ref()
                .and_then(|boundary| boundary["kind"].as_str()),
            Some("command_fallback")
        );
        assert_eq!(
            response
                .intent_route
                .as_ref()
                .and_then(|meta| meta["primary_intent"].as_str()),
            Some("web_research")
        );
        assert_eq!(
            response
                .execution_explanation
                .as_ref()
                .and_then(|value| value["mode"].as_str()),
            Some("deterministic_fallback")
        );
        assert_eq!(
            response
                .execution_explanation
                .as_ref()
                .and_then(|value| value["model_inference_ran"].as_bool()),
            Some(false)
        );
        assert!(response.links[0]
            .url
            .contains("google.com/search?q=what+is+rust"));
    }

    #[test]
    fn route_ui_command_uses_zero_token_task_signal_before_search_fallback() {
        let response = route_ui_command("/task buy oat milk", "google".to_string(), None, None);
        assert_eq!(response.intent, "task");
        assert_eq!(response.preferred_view, "task_board");
        assert!(response.links.is_empty());
        assert_eq!(
            response
                .boundary
                .as_ref()
                .and_then(|boundary| boundary["kind"].as_str()),
            Some("command_fallback")
        );
        assert_eq!(
            response
                .intent_route
                .as_ref()
                .and_then(|meta| meta["audit"]["route_reason"].as_str()),
            Some("A zero-token task shortcut matched a direct task or reminder command.")
        );
        assert_eq!(
            response
                .execution_explanation
                .as_ref()
                .and_then(|value| value["executed_agent_work"].as_bool()),
            Some(false)
        );
    }

    #[test]
    fn route_ui_command_uses_zero_token_travel_comparison_signal() {
        let response = route_ui_command(
            "compare routes home to airport",
            "duckduckgo".to_string(),
            None,
            None,
        );
        assert_eq!(response.intent, "travel");
        assert_eq!(response.preferred_view, "comparison_table");
        assert!(response.links.is_empty());
        assert_eq!(
            response
                .boundary
                .as_ref()
                .and_then(|boundary| boundary["kind"].as_str()),
            Some("command_fallback")
        );
        assert_eq!(
            response
                .intent_route
                .as_ref()
                .and_then(|meta| meta["audit"]["heuristics_used"].as_array())
                .map(|items| items
                    .iter()
                    .any(|item| item.as_str() == Some("zero_token_travel_compare_signal"))),
            Some(true)
        );
        assert_eq!(
            response
                .execution_explanation
                .as_ref()
                .and_then(|value| value["mode"].as_str()),
            Some("deterministic_fallback")
        );
    }

    #[test]
    fn route_ui_command_uses_zero_token_schedule_signal() {
        let response = route_ui_command("plan my day", "duckduckgo".to_string(), None, None);
        assert_eq!(response.intent, "schedule");
        assert_eq!(response.preferred_view, "draggable_calendar");
        assert_eq!(
            response
                .intent_route
                .as_ref()
                .and_then(|meta| meta["primary_intent"].as_str()),
            Some("schedule")
        );
        assert_eq!(
            response
                .intent_route
                .as_ref()
                .and_then(|meta| meta["audit"]["route_reason"].as_str()),
            Some("A zero-token schedule signal matched a direct calendar planning command.")
        );
    }

    #[test]
    fn route_ui_command_builds_a_family_travel_plan_before_web_search_fallback() {
        let response = route_ui_command(
            "plan a family trip (2 adults, 1 toddler under 2 years old) to Tokyo from Sydney, for 5 days, from 12th Oct 2026",
            "duckduckgo".to_string(),
            None,
            None,
        );

        assert_eq!(response.intent, "travel");
        assert_eq!(response.preferred_view, "route_card");
        assert!(response.links.is_empty());
        assert!(response
            .bullets
            .iter()
            .any(|item| item.starts_with("Day 1:")));
        assert!(response.summary.contains("Sydney to Tokyo"));
    }

    #[test]
    fn route_ui_command_builds_dashboard_focus_special_route() {
        let response = route_ui_command(
            "show dashboard messages",
            "duckduckgo".to_string(),
            None,
            None,
        );
        assert_eq!(response.intent, "dashboard_focus");
        assert_eq!(response.preferred_view, "search");
        assert_eq!(
            response
                .intent_route
                .as_ref()
                .and_then(|meta| meta["route_mode"].as_str()),
            Some("special")
        );
        assert_eq!(
            response
                .intent_route
                .as_ref()
                .and_then(|meta| meta["audit"]["route_reason"].as_str()),
            Some("The command bar matched a deterministic dashboard focus route.")
        );
    }

    #[test]
    fn route_ui_command_uses_zero_token_social_signal() {
        let response = route_ui_command(
            "draft a LinkedIn post about OmnyID launch",
            "duckduckgo".to_string(),
            None,
            None,
        );
        assert_eq!(response.intent, "social");
        assert_eq!(response.preferred_view, "social_composer");
        assert_eq!(
            response
                .intent_route
                .as_ref()
                .and_then(|meta| meta["audit"]["heuristics_used"].as_array())
                .map(|items| items
                    .iter()
                    .any(|item| item.as_str() == Some("zero_token_social_signal"))),
            Some(true)
        );
    }

    #[test]
    fn route_ui_command_uses_zero_token_spaces_signal() {
        let response = route_ui_command(
            "open a space for launch prep",
            "duckduckgo".to_string(),
            None,
            None,
        );
        assert_eq!(response.intent, "spaces");
        assert_eq!(response.preferred_view, "spaces");
        assert_eq!(
            response
                .intent_route
                .as_ref()
                .and_then(|meta| meta["primary_intent"].as_str()),
            Some("spaces")
        );
    }
}
