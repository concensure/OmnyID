//! mcp_server.rs — Model Context Protocol server for Omnyid.
//!
//! Exposes AFP thread content as MCP tools so any MCP-compatible client
//! (Claude Desktop, Cursor, etc.) can query the user's private inbox.
//!
//! Transport: HTTP JSON-RPC 2.0 on /mcp.
//! The public HTTP route requires an authenticated OmnyID user before dispatch.
//! `initialize`/`ping` remain unauthenticated only for trusted internal callers
//! that invoke the JSON-RPC dispatcher directly in tests or other in-process code.
//!
//! Available tools:
//!   - search_threads(query) → list of matching thread IDs
//!   - get_thread(thread_id) → AFP messages in thread
//!   - get_agent_status() → current agent instance + active tasks
//!
//! All responses return decrypted content only if the client provides a valid
//! Bearer session token. Otherwise message bodies are omitted.

use std::collections::HashMap;

use crate::search_tags::{
    extract_hash_supertags, extract_kind_filter, extract_link_type_filter,
    extract_metadata_term_pairs, extract_metadata_terms, extract_reference_targets,
    extract_reference_type_filter, strip_structured_search_terms,
};
use crate::server::{
    knowledge_routes::{
        object_message_facet_next_moves, object_message_retrieval_state,
        parse_object_message_query, rank_object_messages,
    },
    proto_to_app,
    thread_discovery::{
        load_ranked_thread_summaries, thread_discovery_facet_next_moves,
        thread_discovery_facet_suggestions, thread_discovery_retrieval_state,
    },
};
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
                "description": "Search AFP thread IDs by keyword, metadata, or canonical top-level supertags.",
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
                "name": "find_reference_messages",
                "description": "Find AFP messages whose canonical top-level references point at specific targets.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "targets": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Reference target IDs or URIs to match"
                        },
                        "reference_type": {
                            "type": "string",
                            "description": "Optional canonical reference type filter"
                        },
                        "link_type": {
                            "type": "string",
                            "description": "Optional reference.metadata.link_type filter"
                        },
                        "kind": {
                            "type": "string",
                            "description": "Optional unified object kind filter"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of messages to return"
                        }
                    },
                    "required": ["targets"]
                }
            },
            {
                "name": "find_object_messages",
                "description": "Find AFP messages by unified object facets such as kind, supertags, reference targets, relation type, and metadata terms.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Optional structured query text using terms like kind:task #project target:msg_1 status:active"},
                        "kind": {"type": "string"},
                        "tags": {"type": "array", "items": {"type": "string"}},
                        "reference_targets": {"type": "array", "items": {"type": "string"}},
                        "reference_type": {"type": "string"},
                        "link_type": {"type": "string"},
                        "metadata_keys": {"type": "array", "items": {"type": "string"}},
                        "metadata_values": {"type": "array", "items": {"type": "string"}},
                        "match": {"type": "string", "enum": ["all", "any"]},
                        "limit": {"type": "integer"}
                    }
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

#[derive(Debug)]
struct ReferenceMessageLookupArgs {
    targets: Vec<String>,
    reference_type: Option<String>,
    link_type: Option<String>,
    kind: Option<String>,
    limit: i64,
}

#[derive(Debug)]
struct ObjectMessageLookupArgs {
    query: Option<String>,
    kind: Option<String>,
    tags: Vec<String>,
    reference_targets: Vec<String>,
    reference_type: Option<String>,
    link_type: Option<String>,
    metadata_keys: Vec<String>,
    metadata_values: Vec<String>,
    match_all: bool,
    limit: i64,
}

fn parse_reference_message_lookup_args(
    args: &Value,
) -> Result<ReferenceMessageLookupArgs, &'static str> {
    let targets = args
        .get("targets")
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if targets.is_empty() {
        return Err("targets array required");
    }

    Ok(ReferenceMessageLookupArgs {
        targets,
        reference_type: args
            .get("reference_type")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned),
        link_type: args
            .get("link_type")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned),
        kind: args
            .get("kind")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase()),
        limit: args
            .get("limit")
            .and_then(|value| value.as_i64())
            .unwrap_or(20)
            .clamp(1, 100),
    })
}

fn push_unique_owned(values: &mut Vec<String>, additions: impl IntoIterator<Item = String>) {
    for value in additions {
        if !values.iter().any(|existing| existing == &value) {
            values.push(value);
        }
    }
}

fn parse_string_array_arg(args: &Value, key: &str, lowercase: bool) -> Vec<String> {
    args.get(key)
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| {
                    if lowercase {
                        value.to_ascii_lowercase()
                    } else {
                        value.to_string()
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn parse_object_message_lookup_args(args: &Value) -> Result<ObjectMessageLookupArgs, &'static str> {
    let query = args
        .get("query")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let mut kind = args
        .get("kind")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase());
    let mut tags = parse_string_array_arg(args, "tags", true);
    let mut reference_targets = parse_string_array_arg(args, "reference_targets", false);
    let mut reference_type = args
        .get("reference_type")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let mut link_type = args
        .get("link_type")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let mut metadata_keys = parse_string_array_arg(args, "metadata_keys", true);
    let mut metadata_values = parse_string_array_arg(args, "metadata_values", false);

    if let Some(query_text) = query.as_deref() {
        push_unique_owned(&mut tags, extract_hash_supertags(query_text));
        if kind.is_none() {
            kind = extract_kind_filter(query_text);
        }
        push_unique_owned(
            &mut reference_targets,
            extract_reference_targets(query_text),
        );
        if reference_type.is_none() {
            reference_type = extract_reference_type_filter(query_text);
        }
        if link_type.is_none() {
            link_type = extract_link_type_filter(query_text);
        }
        let (query_metadata_keys, query_metadata_values) = extract_metadata_terms(query_text);
        push_unique_owned(&mut metadata_keys, query_metadata_keys);
        push_unique_owned(&mut metadata_values, query_metadata_values);
    }

    if kind.is_none()
        && tags.is_empty()
        && reference_targets.is_empty()
        && reference_type.is_none()
        && link_type.is_none()
        && metadata_keys.is_empty()
        && metadata_values.is_empty()
    {
        return Err("at least one object facet filter or query is required");
    }

    Ok(ObjectMessageLookupArgs {
        query,
        kind,
        tags,
        reference_targets,
        reference_type,
        link_type,
        metadata_keys,
        metadata_values,
        match_all: matches!(
            args.get("match")
                .and_then(|value| value.as_str())
                .map(|value| value.trim().to_ascii_lowercase())
                .as_deref(),
            Some("all")
        ),
        limit: args
            .get("limit")
            .and_then(|value| value.as_i64())
            .unwrap_or(20)
            .clamp(1, 100),
    })
}

fn object_lookup_args_to_query_params(args: &ObjectMessageLookupArgs) -> HashMap<String, String> {
    let mut params = HashMap::new();
    if let Some(query) = args.query.as_ref().filter(|value| !value.is_empty()) {
        params.insert("query".to_string(), query.clone());
    }
    if let Some(kind) = args.kind.as_ref().filter(|value| !value.is_empty()) {
        params.insert("kind".to_string(), kind.clone());
    }
    if !args.tags.is_empty() {
        params.insert("tags".to_string(), args.tags.join(","));
    }
    if !args.reference_targets.is_empty() {
        params.insert(
            "reference_targets".to_string(),
            args.reference_targets.join(","),
        );
    }
    if let Some(reference_type) = args
        .reference_type
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        params.insert("reference_type".to_string(), reference_type.clone());
    }
    if let Some(link_type) = args.link_type.as_ref().filter(|value| !value.is_empty()) {
        params.insert("link_type".to_string(), link_type.clone());
    }
    if !args.metadata_keys.is_empty() {
        params.insert("metadataKeys".to_string(), args.metadata_keys.join(","));
    }
    if !args.metadata_values.is_empty() {
        params.insert("metadataValues".to_string(), args.metadata_values.join(","));
    }
    params.insert(
        "match".to_string(),
        if args.match_all { "all" } else { "any" }.to_string(),
    );
    params.insert("limit".to_string(), args.limit.to_string());
    params
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
        // initialize is part of the MCP handshake and must be unauthenticated.
        "initialize" => McpResponse::ok(
            req.id,
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "omnyid-mcp", "version": "1.0.0"}
            }),
        ),
        // GAP-067: tools/list requires auth — it reveals the full capability surface
        // of this homeserver instance which is not public information.
        "tools/list" => {
            if user_id.is_none() {
                return McpResponse::err(req.id, -32001, "authentication required");
            }
            McpResponse::ok(req.id, mcp_tool_list())
        }
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
            let supertags = extract_hash_supertags(query);
            let kind = extract_kind_filter(query);
            let reference_targets = extract_reference_targets(query);
            let metadata_values = extract_metadata_terms(query).1;
            let metadata_terms = extract_metadata_term_pairs(query)
                .into_iter()
                .map(|(key, value)| {
                    format!(
                        "{}:{}",
                        key.trim().to_ascii_lowercase(),
                        value.trim().to_ascii_lowercase()
                    )
                })
                .collect::<Vec<_>>();
            let text_query = strip_structured_search_terms(query);
            let thread_ids = Vec::<String>::new();
            let from_agents = Vec::<String>::new();
            match load_ranked_thread_summaries(
                db,
                user_id,
                if text_query.is_empty() {
                    None
                } else {
                    Some(text_query.as_str())
                },
                &supertags,
                &reference_targets,
                &metadata_values,
                &metadata_terms,
                &thread_ids,
                &from_agents,
                None,
                None,
                kind.as_deref(),
                false,
                100,
            )
            .await
            {
                Ok(summaries) => {
                    let facet_suggestions = thread_discovery_facet_suggestions(
                        &summaries,
                        &supertags,
                        &metadata_terms,
                        kind.as_deref(),
                    );
                    let facet_next_moves = thread_discovery_facet_next_moves(
                        &summaries,
                        &supertags,
                        &metadata_terms,
                        kind.as_deref(),
                    );
                    let retrieval_state = thread_discovery_retrieval_state(
                        if text_query.is_empty() {
                            None
                        } else {
                            Some(text_query.as_str())
                        },
                        &supertags,
                        &reference_targets,
                        &metadata_values,
                        &metadata_terms,
                        &thread_ids,
                        &from_agents,
                        None,
                        None,
                        kind.as_deref(),
                        Some(&facet_next_moves),
                        &summaries,
                    );
                    let thread_ids = summaries
                        .iter()
                        .map(|summary| summary.thread_id.clone())
                        .collect::<Vec<_>>();
                    McpResponse::ok(
                        id,
                        json!({
                            "content": [{"type": "text", "text": serde_json::to_string(&json!({
                                "query": if text_query.is_empty() { None::<String> } else { Some(text_query.clone()) },
                                "tags": supertags,
                                "reference_targets": reference_targets,
                                "metadata_values": metadata_values,
                                "metadata_terms": metadata_terms,
                                "kind": kind,
                                "match": "any",
                                "facet_suggestions": facet_suggestions,
                                "facet_next_moves": facet_next_moves,
                                "retrieval_state": retrieval_state,
                                "count": thread_ids.len(),
                                "thread_ids": thread_ids,
                                "thread_summaries": summaries,
                            })).unwrap_or_default()}]
                        }),
                    )
                }
                Err(e) => McpResponse::err(id, -32603, e.to_string()),
            }
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
        "find_reference_messages" => {
            let parsed = match parse_reference_message_lookup_args(&args) {
                Ok(parsed) => parsed,
                Err(message) => return McpResponse::err(id, -32602, message),
            };
            match db
                .list_private_messages_by_reference_targets(
                    user_id,
                    &parsed.targets,
                    parsed.reference_type.as_deref(),
                    parsed.link_type.as_deref(),
                    parsed.kind.as_deref(),
                    parsed.limit,
                )
                .await
            {
                Ok(messages) => {
                    let summaries = messages
                        .into_iter()
                        .map(|message| {
                            json!({
                                "id": message.id,
                                "thread_id": message.thread_id,
                                "parent_id": message.parent_id,
                                "type": message.r#type,
                                "kind": message.kind,
                                "subtype": message.subtype,
                                "supertags": message.supertags,
                                "timestamp": message.timestamp,
                            })
                        })
                        .collect::<Vec<_>>();
                    McpResponse::ok(
                        id,
                        json!({
                            "content": [{"type": "text", "text": serde_json::to_string(&json!({
                                "targets": parsed.targets,
                                "reference_type": parsed.reference_type,
                                "link_type": parsed.link_type,
                                "kind": parsed.kind,
                                "count": summaries.len(),
                                "messages": summaries,
                            })).unwrap_or_default()}]
                        }),
                    )
                }
                Err(e) => McpResponse::err(id, -32603, e.to_string()),
            }
        }
        "find_object_messages" => {
            let parsed = match parse_object_message_lookup_args(&args) {
                Ok(parsed) => parsed,
                Err(message) => return McpResponse::err(id, -32602, message),
            };
            match db
                .list_private_messages_by_object_facets(
                    user_id,
                    parsed.kind.as_deref(),
                    &parsed.tags,
                    parsed.match_all,
                    &parsed.reference_targets,
                    parsed.reference_type.as_deref(),
                    parsed.link_type.as_deref(),
                    &parsed.metadata_keys,
                    &parsed.metadata_values,
                    parsed.limit,
                )
                .await
            {
                Ok(messages) => {
                    let mut app_messages =
                        messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
                    let object_query =
                        parse_object_message_query(&object_lookup_args_to_query_params(&parsed));
                    rank_object_messages(&mut app_messages, &object_query);
                    let facet_next_moves =
                        object_message_facet_next_moves(&app_messages, &object_query);
                    let retrieval_state = object_message_retrieval_state(
                        &object_query,
                        &facet_next_moves,
                        &app_messages,
                    );
                    let summaries = app_messages
                        .into_iter()
                        .map(|message| {
                            json!({
                                "id": message.id,
                                "thread_id": message.thread_id,
                                "parent_id": message.parent_id,
                                "type": message.r#type,
                                "kind": message.kind,
                                "subtype": message.subtype,
                                "supertags": message.supertags,
                                "timestamp": message.timestamp,
                            })
                        })
                        .collect::<Vec<_>>();
                    McpResponse::ok(
                        id,
                        json!({
                            "content": [{"type": "text", "text": serde_json::to_string(&json!({
                                "query": parsed.query,
                                "kind": parsed.kind,
                                "tags": parsed.tags,
                                "reference_targets": parsed.reference_targets,
                                "reference_type": parsed.reference_type,
                                "link_type": parsed.link_type,
                                "metadata_keys": parsed.metadata_keys,
                                "metadata_values": parsed.metadata_values,
                                "match": if parsed.match_all { "all" } else { "any" },
                                "facet_next_moves": facet_next_moves,
                                "retrieval_state": retrieval_state,
                                "count": summaries.len(),
                                "messages": summaries,
                            })).unwrap_or_default()}]
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
            let prio = crate::agent_template::TaskPriority::from_label(Some(&priority));
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
    fn mcp_tool_list_has_six_tools() {
        let list = mcp_tool_list();
        assert_eq!(list["tools"].as_array().unwrap().len(), 6);
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
        assert!(tool_names.contains(&"find_reference_messages"));
        assert!(tool_names.contains(&"find_object_messages"));
        assert!(tool_names.contains(&"submit_intent"));
    }

    #[test]
    fn parse_reference_message_lookup_args_requires_targets() {
        let error = parse_reference_message_lookup_args(&json!({})).unwrap_err();
        assert_eq!(error, "targets array required");
    }

    #[test]
    fn parse_reference_message_lookup_args_normalizes_filters() {
        let parsed = parse_reference_message_lookup_args(&json!({
            "targets": [" note:123 ", "", "https://example.com/ref "],
            "reference_type": " cites ",
            "link_type": " supports ",
            "kind": " Task ",
            "limit": 999
        }))
        .unwrap();
        assert_eq!(
            parsed.targets,
            vec![
                "note:123".to_string(),
                "https://example.com/ref".to_string()
            ]
        );
        assert_eq!(parsed.reference_type.as_deref(), Some("cites"));
        assert_eq!(parsed.link_type.as_deref(), Some("supports"));
        assert_eq!(parsed.kind.as_deref(), Some("task"));
        assert_eq!(parsed.limit, 100);
    }

    #[test]
    fn parse_object_message_lookup_args_requires_filters() {
        let error = parse_object_message_lookup_args(&json!({})).unwrap_err();
        assert_eq!(
            error,
            "at least one object facet filter or query is required"
        );
    }

    #[test]
    fn parse_object_message_lookup_args_lifts_structured_query_terms() {
        let parsed = parse_object_message_lookup_args(&json!({
            "query": "review kind:Task #ProjectAurora target:msg_1 relation:part_of owner:ozan",
            "metadata_values": ["active"],
            "limit": 999
        }))
        .unwrap();
        assert_eq!(
            parsed.query.as_deref(),
            Some("review kind:Task #ProjectAurora target:msg_1 relation:part_of owner:ozan")
        );
        assert_eq!(parsed.kind.as_deref(), Some("task"));
        assert_eq!(parsed.tags, vec!["projectaurora".to_string()]);
        assert_eq!(parsed.reference_targets, vec!["msg_1".to_string()]);
        assert_eq!(parsed.link_type.as_deref(), Some("part_of"));
        assert_eq!(parsed.metadata_keys, vec!["owner".to_string()]);
        assert_eq!(
            parsed.metadata_values,
            vec!["active".to_string(), "ozan".to_string()]
        );
        assert!(!parsed.match_all);
        assert_eq!(parsed.limit, 100);
    }

    #[test]
    fn extract_query_supertags_collects_hash_prefixed_tokens() {
        let tags = extract_hash_supertags("review #ProjectAurora with #Health, then close");
        assert_eq!(
            tags,
            vec!["health".to_string(), "projectaurora".to_string()]
        );
    }

    #[test]
    fn search_thread_query_strips_hash_tags_from_plain_text_terms() {
        let query = strip_structured_search_terms("review #ProjectAurora with #Health, then close");
        assert_eq!(query, "review with then close");
    }

    #[test]
    fn search_thread_query_extracts_kind_filter() {
        let kind = extract_kind_filter("review kind:Task #ProjectAurora");
        assert_eq!(kind.as_deref(), Some("task"));
    }

    #[test]
    fn search_threads_uses_ranked_retrieval_instead_of_literal_thread_id_matching() {
        let source = include_str!("mcp_server.rs");
        let start = source
            .find("\"search_threads\" => {")
            .expect("search_threads handler exists");
        let end = source[start..]
            .find("\n        \"get_thread\" => {")
            .map(|offset| start + offset)
            .expect("get_thread follows search_threads");
        let handler_source = &source[start..end];

        assert!(handler_source.contains("load_ranked_thread_summaries("));
        assert!(handler_source.contains("strip_structured_search_terms(query)"));
        assert!(handler_source.contains("extract_hash_supertags(query)"));
        assert!(handler_source.contains("thread_discovery_retrieval_state("));
        assert!(!handler_source.contains("m.thread_id.contains(query)"));
        assert!(!handler_source.contains("m.from.contains(query)"));
    }
}
