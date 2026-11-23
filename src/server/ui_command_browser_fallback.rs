/*
 * @module-id: rust.server.ui-command-browser-fallback
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use std::sync::Arc;

use serde_json::Value;
use ulid::Ulid;

use crate::{
    agent_template::{AgentTask, TaskPriority},
    db::UserRecord,
    intent_routing::{infer_route_decision, route_metadata_json},
    ui_command_intent_contract::preferred_view_for_intent,
};

use super::{AppState, UiCommandResponse, new_server_message, store_private_app_message};

pub(super) async fn handle_browser_classified_route(
    state: &Arc<AppState>,
    user: &UserRecord,
    trimmed_query: &str,
    engine: &str,
    store_in_history: bool,
    browser_intent: &str,
    browser_parsed: &Value,
) -> Option<UiCommandResponse> {
    if !supports_browser_intent(browser_intent) {
        return None;
    }

    let agent_id_opt = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .ok()
        .flatten()
        .and_then(|inst| inst["agent_id"].as_str().map(str::to_string));

    match browser_intent {
        "task" => {
            let title = browser_parsed["title"]
                .as_str()
                .unwrap_or(trimmed_query)
                .to_string();
            let description = browser_parsed["description"]
                .as_str()
                .unwrap_or("")
                .to_string();
            let priority_str = browser_parsed["priority"].as_str().unwrap_or("normal");
            let task_type = browser_parsed["task_type"]
                .as_str()
                .unwrap_or("general")
                .to_string();
            let priority = TaskPriority::from_label(Some(priority_str));
            if store_in_history {
                persist_browser_task(
                    state,
                    user,
                    agent_id_opt.as_deref(),
                    title.clone(),
                    description,
                    priority_str,
                    task_type,
                    priority,
                )
                .await;
            }
        }
        "note" => {
            let title = browser_parsed["title"]
                .as_str()
                .unwrap_or("Note")
                .to_string();
            let content = browser_parsed["content"]
                .as_str()
                .unwrap_or(trimmed_query)
                .to_string();
            if store_in_history {
                persist_browser_note(state, user, agent_id_opt.as_deref(), title, content).await;
            }
        }
        "orchestrate" => {}
        _ => return None,
    }

    browser_response_for_intent(trimmed_query, engine, browser_intent, browser_parsed)
}

fn supports_browser_intent(intent: &str) -> bool {
    matches!(intent, "task" | "note" | "orchestrate")
}

fn browser_response_for_intent(
    trimmed_query: &str,
    engine: &str,
    browser_intent: &str,
    browser_parsed: &Value,
) -> Option<UiCommandResponse> {
    if !supports_browser_intent(browser_intent) {
        return None;
    }

    let summary = browser_parsed["summary"]
        .as_str()
        .unwrap_or(trimmed_query)
        .to_string();
    let browser_route_meta =
        route_metadata_json(&infer_route_decision(trimmed_query, browser_parsed));

    match browser_intent {
        "task" => Some(UiCommandResponse {
            intent: "task".to_string(),
            suggested_view: "search".to_string(),
            preferred_view: preferred_view_for_intent("task").to_string(),
            summary,
            engine: engine.to_string(),
            links: vec![],
            runner_draft: None,
            bullets: vec![],
            card_id: None,
            preview_message: None,
            intent_route: Some(browser_route_meta),
            boundary: None,
            execution_explanation: None,
        }),
        "note" => Some(UiCommandResponse {
            intent: "note".to_string(),
            suggested_view: "note".to_string(),
            preferred_view: preferred_view_for_intent("note").to_string(),
            summary,
            engine: engine.to_string(),
            links: vec![],
            runner_draft: None,
            bullets: vec![],
            card_id: None,
            preview_message: None,
            intent_route: Some(browser_route_meta),
            boundary: None,
            execution_explanation: None,
        }),
        "orchestrate" => Some(UiCommandResponse {
            intent: "orchestrate".to_string(),
            suggested_view: "search".to_string(),
            preferred_view: preferred_view_for_intent("orchestrate").to_string(),
            summary: "Multi-step orchestration requires a server API key. Add one in Agent Settings -> AI Model Configuration.".to_string(),
            engine: engine.to_string(),
            links: vec![],
            runner_draft: None,
            bullets: vec![
                "Go to Agent Settings and add your API key to enable full orchestration."
                    .to_string(),
            ],
            card_id: None,
            preview_message: None,
            intent_route: Some(browser_route_meta),
            boundary: None,
            execution_explanation: Some(serde_json::json!({
                "mode": "server_llm_required",
                "reason": "Browser-classified orchestration stays blocked until a server-side LLM is configured."
            })),
        }),
        _ => None,
    }
}

async fn persist_browser_task(
    state: &Arc<AppState>,
    user: &UserRecord,
    agent_id: Option<&str>,
    title: String,
    description: String,
    priority_str: &str,
    task_type: String,
    priority: TaskPriority,
) {
    let instance = state.db.get_agent_instance(&user.id).await.ok().flatten();
    if let Some(inst) = instance {
        let instance_id = inst["id"].as_str().unwrap_or("").to_string();
        let task = AgentTask::new(user.id.clone(), instance_id, title.clone(), priority);
        let task_id = task.id.clone();
        let thread_id = task.thread_id.clone();
        let _ = state.db.create_agent_task(&task).await;
        if let Some(agent_id) = agent_id {
            let msg_content = serde_json::json!({
                "task_id": task_id,
                "title": title,
                "description": description,
                "priority": priority_str,
                "task_type": task_type,
                "status": "pending"
            });
            let msg_views = vec![serde_json::json!({
                "format": "task_card",
                "content": {
                    "task_id": task_id,
                    "title": title,
                    "description": description,
                    "priority": priority_str,
                    "task_type": task_type,
                    "status": "pending"
                },
                "priority": 10
            })];
            if let Ok(msg) = new_server_message(
                agent_id.to_string(),
                vec![],
                thread_id,
                "task",
                msg_content,
                msg_views,
                vec![],
                vec![],
                true,
            ) {
                let _ = store_private_app_message(
                    &state.db,
                    &state.metrics,
                    &state.relay_tx,
                    &user.id,
                    msg,
                )
                .await;
            }
        }
    }
}

async fn persist_browser_note(
    state: &Arc<AppState>,
    user: &UserRecord,
    agent_id: Option<&str>,
    title: String,
    content: String,
) {
    if let Some(agent_id) = agent_id {
        let thread_id = Ulid::new().to_string();
        let msg_content = serde_json::json!({"title": title, "content": content});
        let msg_views = vec![serde_json::json!({
            "format": "canvas",
            "content": {"title": title, "body": content},
            "priority": 10
        })];
        if let Ok(msg) = new_server_message(
            agent_id.to_string(),
            vec![],
            thread_id,
            "note",
            msg_content,
            msg_views,
            vec![],
            vec![],
            true,
        ) {
            let _ = store_private_app_message(
                &state.db,
                &state.metrics,
                &state.relay_tx,
                &user.id,
                msg,
            )
            .await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{browser_response_for_intent, supports_browser_intent};
    use serde_json::json;

    #[test]
    fn supports_only_local_browser_fallback_intents() {
        assert!(supports_browser_intent("task"));
        assert!(supports_browser_intent("note"));
        assert!(supports_browser_intent("orchestrate"));
        assert!(!supports_browser_intent("web_research"));
        assert!(!supports_browser_intent("travel"));
        assert!(!supports_browser_intent("social"));
        assert!(!supports_browser_intent("spaces"));
        assert!(!supports_browser_intent("schedule"));
    }

    #[test]
    fn builds_task_browser_response() {
        let response = browser_response_for_intent(
            "buy milk",
            "duckduckgo",
            "task",
            &json!({
                "intent": "task",
                "title": "Buy milk",
                "description": "Buy milk",
                "priority": "normal",
                "task_type": "shopping",
                "summary": "Added to shopping list"
            }),
        )
        .expect("task response");

        assert_eq!(response.intent, "task");
        assert_eq!(response.preferred_view, "task_board");
        assert_eq!(
            response
                .intent_route
                .as_ref()
                .and_then(|meta| meta["primary_intent"].as_str()),
            Some("task")
        );
    }

    #[test]
    fn builds_note_browser_response() {
        let response = browser_response_for_intent(
            "save this as a note",
            "duckduckgo",
            "note",
            &json!({
                "intent": "note",
                "title": "Meeting note",
                "content": "Agenda and outcomes",
                "summary": "Saved note"
            }),
        )
        .expect("note response");

        assert_eq!(response.intent, "note");
        assert_eq!(response.suggested_view, "note");
        assert_eq!(response.preferred_view, "ledger_canvas");
    }

    #[test]
    fn builds_orchestrate_browser_response() {
        let response = browser_response_for_intent(
            "organize this and send it",
            "duckduckgo",
            "orchestrate",
            &json!({
                "intent": "orchestrate",
                "objective": "Organize this and send it",
                "summary": "Preparing a workflow"
            }),
        )
        .expect("orchestrate response");

        assert_eq!(response.intent, "orchestrate");
        assert_eq!(response.preferred_view, "orchestrate_progress");
        assert_eq!(
            response
                .execution_explanation
                .as_ref()
                .and_then(|value| value["mode"].as_str()),
            Some("server_llm_required")
        );
        assert!(
            response
                .bullets
                .iter()
                .any(|item| item.contains("Agent Settings"))
        );
    }

    #[test]
    fn rejects_unsupported_browser_response_intent() {
        let response = browser_response_for_intent(
            "compare routes home to airport",
            "duckduckgo",
            "travel",
            &json!({
                "intent": "travel",
                "summary": "Prepared a route comparison"
            }),
        );

        assert!(response.is_none());
    }
}
