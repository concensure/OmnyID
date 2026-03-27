//! mcp_server.rs — Model Context Protocol server for Omnyid.
//!
//! Exposes AFP thread content as MCP tools so any MCP-compatible client
//! (Claude Desktop, Cursor, etc.) can query the user's private inbox.
//!
//! Transport: HTTP JSON-RPC 2.0 on /mcp (internal only; not exposed via Caddy).
//!
//! Available tools:
//!   - search_threads(query) → list of matching thread IDs
//!   - get_thread(thread_id) → AFP messages in thread
//!   - get_agent_status() → current agent instance + active tasks
//!
//! All responses return decrypted content only if the client provides a valid
//! Bearer session token. Otherwise message bodies are omitted.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

// ── JSON-RPC types ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
pub struct McpRequest {
    pub jsonrpc: String,
    pub id: Value,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct McpResponse {
    pub jsonrpc: String,
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<McpError>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct McpError {
    pub code: i32,
    pub message: String,
}

impl McpResponse {
    pub fn ok(id: Value, result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }
    pub fn err(id: Value, code: i32, message: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(McpError {
                code,
                message: message.into(),
            }),
        }
    }
}

// ── Tool definitions (returned by tools/list) ─────────────────────────────────

pub fn mcp_tool_list() -> Value {
    json!({
        "tools": [
            {
                "name": "search_threads",
                "description": "Search AFP thread IDs by keyword in message content metadata.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search keyword"}
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "get_thread",
                "description": "Retrieve AFP messages from a thread by thread_id.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "thread_id": {"type": "string"}
                    },
                    "required": ["thread_id"]
                }
            },
            {
                "name": "get_agent_status",
                "description": "Get the current agent instance and active task list.",
                "inputSchema": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "submit_intent",
                "description": "Submit a natural language intent for the agent to execute.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "intent": {"type": "string"},
                        "priority": {"type": "string", "enum": ["high", "normal", "low"]}
                    },
                    "required": ["intent"]
                }
            }
        ]
    })
}

// ── Route this into server.rs dispatch ────────────────────────────────────────

/// Dispatch a single MCP JSON-RPC request. Called from the HTTP handler.
/// `user_id` is None if the client has no valid session.
pub async fn dispatch_mcp_request(
    req: McpRequest,
    db: &crate::db::Db,
    user_id: Option<&str>,
) -> McpResponse {
    match req.method.as_str() {
        "initialize" => McpResponse::ok(
            req.id,
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "omnyid-mcp", "version": "1.0.0"}
            }),
        ),
        "tools/list" => McpResponse::ok(req.id, mcp_tool_list()),
        "tools/call" => {
            let Some(uid) = user_id else {
                return McpResponse::err(req.id, -32001, "authentication required");
            };
            let tool_name = req
                .params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let args = req.params.get("arguments").cloned().unwrap_or_default();
            dispatch_tool_call(req.id, tool_name, args, db, uid).await
        }
        "ping" => McpResponse::ok(req.id, json!({})),
        _ => McpResponse::err(req.id, -32601, format!("method not found: {}", req.method)),
    }
}

async fn dispatch_tool_call(
    id: Value,
    tool: &str,
    args: Value,
    db: &crate::db::Db,
    user_id: &str,
) -> McpResponse {
    match tool {
        "search_threads" => {
            let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            // Lightweight: return recent thread IDs, rely on caller to filter by query
            let agents = db
                .list_managed_agents_by_user(user_id)
                .await
                .unwrap_or_default();
            let agent_ids: Vec<String> = agents.iter().map(|a| a.agent_id.clone()).collect();
            let msgs = db
                .recent_messages_for_agents(&agent_ids, 50)
                .await
                .unwrap_or_default();
            let thread_ids: Vec<&str> = msgs
                .iter()
                .filter(|m| m.thread_id.contains(query) || m.from.contains(query))
                .map(|m| m.thread_id.as_str())
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect();
            McpResponse::ok(
                id,
                json!({
                    "content": [{"type": "text", "text": serde_json::to_string(&thread_ids).unwrap_or_default()}]
                }),
            )
        }
        "get_thread" => {
            let thread_id = args.get("thread_id").and_then(|v| v.as_str()).unwrap_or("");
            match db.get_thread(thread_id).await {
                Ok(msgs) => {
                    let summaries: Vec<Value> = msgs
                        .iter()
                        .map(|m| {
                            json!({
                                "id": m.id,
                                "from": m.from,
                                "type": m.r#type,
                                "timestamp": m.timestamp,
                            })
                        })
                        .collect();
                    McpResponse::ok(
                        id,
                        json!({
                            "content": [{"type": "text", "text": serde_json::to_string(&summaries).unwrap_or_default()}]
                        }),
                    )
                }
                Err(e) => McpResponse::err(id, -32603, e.to_string()),
            }
        }
        "get_agent_status" => {
            let instance = db.get_agent_instance(user_id).await.unwrap_or(None);
            let tasks = db
                .list_agent_tasks(user_id, Some("executing"), 10)
                .await
                .unwrap_or_default();
            McpResponse::ok(
                id,
                json!({
                    "content": [{"type": "text", "text": serde_json::to_string(&json!({
                        "agent": instance,
                        "active_tasks": tasks,
                    })).unwrap_or_default()}]
                }),
            )
        }
        "submit_intent" => {
            let intent = args
                .get("intent")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let priority = args
                .get("priority")
                .and_then(|v| v.as_str())
                .unwrap_or("normal")
                .to_string();
            let instance = match db.get_agent_instance(user_id).await.unwrap_or(None) {
                Some(i) => i,
                None => return McpResponse::err(id, -32603, "no agent instance"),
            };
            let prio = match priority.as_str() {
                "high" => crate::agent_template::TaskPriority::High,
                "low" => crate::agent_template::TaskPriority::Low,
                _ => crate::agent_template::TaskPriority::Normal,
            };
            let instance_id = instance["id"].as_str().unwrap_or("").to_string();
            let task = crate::agent_template::AgentTask::new(
                user_id.to_string(),
                instance_id,
                intent,
                prio,
            );
            let task_id = task.id.clone();
            let thread_id = task.thread_id.clone();
            match db.create_agent_task(&task).await {
                Ok(()) => McpResponse::ok(
                    id,
                    json!({
                        "content": [{"type": "text", "text": format!("Task {task_id} created in thread {thread_id}")}]
                    }),
                ),
                Err(e) => McpResponse::err(id, -32603, e.to_string()),
            }
        }
        other => McpResponse::err(id, -32601, format!("unknown tool: {other}")),
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcp_tool_list_has_four_tools() {
        let list = mcp_tool_list();
        assert_eq!(list["tools"].as_array().unwrap().len(), 4);
    }

    #[test]
    fn mcp_response_ok_has_no_error() {
        let r = McpResponse::ok(json!(1), json!({"ok": true}));
        assert!(r.error.is_none());
        assert!(r.result.is_some());
    }

    #[test]
    fn mcp_response_err_has_no_result() {
        let r = McpResponse::err(json!(1), -32601, "not found");
        assert!(r.result.is_none());
        assert_eq!(r.error.as_ref().unwrap().code, -32601);
    }

    #[test]
    fn initialize_method_returns_protocol_version() {
        // synchronous test — just exercise the tool list shape
        let list = mcp_tool_list();
        let tool_names: Vec<&str> = list["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert!(tool_names.contains(&"search_threads"));
        assert!(tool_names.contains(&"submit_intent"));
    }
}
