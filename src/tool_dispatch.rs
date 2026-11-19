/*
 * Registry-aware tool dispatch for orchestrator task execution.
 *
 * Primary rule: only execute external user tools through the user's approved
 * MCP connection list. Built-in deterministic helpers such as weather remain
 * available without a user tool connection.
 */

use serde_json::{Map, Value, json};

use crate::{
    db::{Db, UserExternalToolUsageEventInsert},
    message::AfpNormalizedToolResultData,
};

mod result_format;
pub mod runbook_contract;
pub mod runbook_provider;
mod runbook_registry;
use result_format::format_tool_result;

pub struct ToolDispatchContext<'a> {
    pub user_id: &'a str,
    pub db: &'a Db,
}

#[derive(Debug)]
pub enum DispatchResult {
    Handled(ToolDispatchOutput),
    NotHandled,
}

#[derive(Debug, Clone)]
pub struct ToolDispatchOutput {
    pub summary: String,
    pub metadata: Option<AfpNormalizedToolResultData>,
}

#[derive(Debug, Clone)]
pub(crate) struct ApprovedTool {
    slug: String,
    name: String,
    mcp_server_url: String,
    api_key: String,
    connection_provider: String,
    capabilities: Vec<String>,
    tool_descriptor: Value,
}

#[derive(Debug, Clone)]
struct ToolInvocation {
    tool: ApprovedTool,
    capability: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ToolRequestAnalysis {
    NoToolRequest,
    Ready {
        tool_slug: String,
        tool_name: String,
        capability: String,
    },
    AmbiguousApprovedTool {
        tool_slug: String,
        tool_name: String,
        capabilities: Vec<String>,
    },
    UnapprovedTool {
        tool_name: String,
    },
}

pub async fn try_dispatch(task_content: &str, ctx: &ToolDispatchContext<'_>) -> DispatchResult {
    let approved_tools = match load_approved_tools(ctx).await {
        Ok(tools) => tools,
        Err(err) => {
            return DispatchResult::Handled(
                format!("Approved tool registry could not be loaded for this request: {err}")
                    .into(),
            );
        }
    };

    match inspect_tool_request(task_content, &approved_tools) {
        ToolRequestAnalysis::Ready {
            tool_slug,
            capability,
            ..
        } => {
            if let Some(invocation) = select_mcp_tool(task_content, &approved_tools) {
                let args = build_tool_arguments(task_content, &invocation);
                let result = crate::mcp_client::call_tool(
                    &invocation.tool.mcp_server_url,
                    Some(invocation.tool.api_key.as_str()),
                    &invocation.capability,
                    args,
                )
                .await;

                return match result {
                    Ok(payload) => {
                        record_successful_tool_usage(ctx, &invocation).await;
                        DispatchResult::Handled(format_tool_result(&invocation, &payload))
                    }
                    Err(err) => DispatchResult::Handled(
                        format!(
                            "Approved tool '{}' failed while running '{}': {}",
                            tool_slug, capability, err
                        )
                        .into(),
                    ),
                };
            }
        }
        ToolRequestAnalysis::AmbiguousApprovedTool {
            tool_name,
            capabilities,
            ..
        } => {
            let suggestions = capabilities
                .iter()
                .take(3)
                .map(|capability| capability.replace('_', " "))
                .collect::<Vec<_>>();
            let suggestion_text = if suggestions.is_empty() {
                "Specify the exact action you want the agent to take.".to_string()
            } else {
                format!("Try one of: {}.", suggestions.join(", "))
            };
            return DispatchResult::Handled(format!(
                "This request mentions approved tool '{}', but the action is underspecified. {}",
                tool_name, suggestion_text
            )
            .into());
        }
        ToolRequestAnalysis::UnapprovedTool { .. } => {
            return DispatchResult::Handled(
                "This task references an external tool that is not in the user's approved MCP connection list."
                    .to_string()
                    .into(),
            );
        }
        ToolRequestAnalysis::NoToolRequest => {}
    }

    let low = task_content.to_ascii_lowercase();
    let weather_tokens = [
        "weather",
        "forecast",
        "temperature",
        "rain",
        "precipitation",
    ];
    if weather_tokens.iter().any(|t| low.contains(t)) {
        let locations = crate::composite_intent::parse_weather_locations(task_content);
        if !locations.is_empty() {
            let mut parts: Vec<String> = Vec::new();
            for (city, days) in locations {
                match fetch_weather_summary(&city, days).await {
                    Ok(summary) => parts.push(summary),
                    Err(e) => parts.push(format!("Weather for {city} unavailable: {e}")),
                }
            }
            return DispatchResult::Handled(parts.join("\n\n").into());
        }
    }

    DispatchResult::NotHandled
}

pub(crate) async fn analyze_user_tool_request(
    task_content: &str,
    db: &Db,
    user_id: &str,
) -> Result<ToolRequestAnalysis, String> {
    let ctx = ToolDispatchContext { user_id, db };
    let approved_tools = load_approved_tools(&ctx).await?;
    Ok(inspect_tool_request(task_content, &approved_tools))
}

async fn load_approved_tools(ctx: &ToolDispatchContext<'_>) -> Result<Vec<ApprovedTool>, String> {
    let rows = ctx
        .db
        .list_tool_execution_registry(ctx.user_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let descriptor = row
                .get("tool_descriptor")
                .cloned()
                .unwrap_or_else(|| json!({}));
            let capabilities = descriptor
                .get("capabilities")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(|s| s.to_string())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            ApprovedTool {
                slug: row
                    .get("tool_slug")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                name: row
                    .get("tool_name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                mcp_server_url: row
                    .get("mcp_server_url")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                api_key: row
                    .get("api_key_enc")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                connection_provider: row
                    .get("connection_provider")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                capabilities,
                tool_descriptor: descriptor,
            }
        })
        .filter(|tool| !tool.mcp_server_url.is_empty())
        .collect())
}

async fn record_successful_tool_usage(ctx: &ToolDispatchContext<'_>, invocation: &ToolInvocation) {
    let Some(event) = build_usage_event_insert(ctx.user_id, invocation) else {
        return;
    };
    let _ = ctx.db.record_user_external_tool_usage_event(&event).await;
}

fn build_usage_event_insert(
    user_id: &str,
    invocation: &ToolInvocation,
) -> Option<UserExternalToolUsageEventInsert> {
    let billing = invocation
        .tool
        .tool_descriptor
        .get("billing")
        .and_then(Value::as_object)?;

    let capability_metering = billing
        .get("capability_metering")
        .and_then(Value::as_object)
        .and_then(|entries| entries.get(&invocation.capability))
        .and_then(Value::as_object);

    let usage_unit = capability_metering
        .and_then(|value| value.get("usage_unit"))
        .and_then(Value::as_str)
        .or_else(|| billing.get("default_usage_unit").and_then(Value::as_str))
        .unwrap_or("requests")
        .trim();
    if usage_unit.is_empty() {
        return None;
    }

    let quantity = capability_metering
        .and_then(|value| value.get("quantity"))
        .and_then(Value::as_f64)
        .or_else(|| {
            billing
                .get("default_quantity_per_call")
                .and_then(Value::as_f64)
        })
        .unwrap_or(1.0);
    if !quantity.is_finite() || quantity <= 0.0 {
        return None;
    }

    let estimated_cost_usd = capability_metering
        .and_then(|value| value.get("estimated_cost_usd"))
        .and_then(Value::as_f64)
        .or_else(|| {
            billing
                .get("estimated_cost_usd_per_call")
                .and_then(Value::as_f64)
        })
        .unwrap_or(0.0)
        .max(0.0);

    let provider_key = billing
        .get("provider_key")
        .and_then(Value::as_str)
        .unwrap_or(invocation.tool.slug.as_str())
        .trim();
    let provider_category = billing
        .get("provider_category")
        .and_then(Value::as_str)
        .unwrap_or("external_tool")
        .trim();
    let billing_category = billing
        .get("billing_category")
        .and_then(Value::as_str)
        .or_else(|| billing.get("provider_category").and_then(Value::as_str))
        .unwrap_or("external_tool")
        .trim();
    if provider_key.is_empty() || provider_category.is_empty() || billing_category.is_empty() {
        return None;
    }

    let mut metadata = Map::new();
    metadata.insert(
        "capability".to_string(),
        Value::String(invocation.capability.clone()),
    );
    metadata.insert(
        "connection_provider".to_string(),
        Value::String(invocation.tool.connection_provider.clone()),
    );
    metadata.insert(
        "mcp_server_url".to_string(),
        Value::String(invocation.tool.mcp_server_url.clone()),
    );

    Some(UserExternalToolUsageEventInsert {
        user_id: user_id.to_string(),
        tool_slug: invocation.tool.slug.clone(),
        tool_name: invocation.tool.name.clone(),
        provider_key: provider_key.to_string(),
        provider_category: provider_category.to_string(),
        billing_category: billing_category.to_string(),
        usage_unit: usage_unit.to_string(),
        quantity,
        estimated_cost_usd,
        currency: Some("USD".to_string()),
        source: Some("tool_dispatch".to_string()),
        occurred_at: None,
        metadata_json: Some(Value::Object(metadata)),
    })
}

fn select_mcp_tool(task_content: &str, approved_tools: &[ApprovedTool]) -> Option<ToolInvocation> {
    let low = task_content.to_ascii_lowercase();
    let mentioned_tool = find_mentioned_approved_tool(&low, approved_tools)?;

    let capability = select_capability(&low, &mentioned_tool.capabilities).or_else(|| {
        if mentioned_tool.capabilities.len() == 1 {
            mentioned_tool.capabilities.first().cloned()
        } else {
            None
        }
    })?;

    Some(ToolInvocation {
        tool: mentioned_tool.clone(),
        capability,
    })
}

fn inspect_tool_request(
    task_content: &str,
    approved_tools: &[ApprovedTool],
) -> ToolRequestAnalysis {
    let low = task_content.to_ascii_lowercase();

    if let Some(tool) = find_mentioned_approved_tool(&low, approved_tools) {
        if let Some(capability) = select_capability(&low, &tool.capabilities).or_else(|| {
            if tool.capabilities.len() == 1 {
                tool.capabilities.first().cloned()
            } else {
                None
            }
        }) {
            return ToolRequestAnalysis::Ready {
                tool_slug: tool.slug.clone(),
                tool_name: tool.name.clone(),
                capability,
            };
        }

        return ToolRequestAnalysis::AmbiguousApprovedTool {
            tool_slug: tool.slug.clone(),
            tool_name: tool.name.clone(),
            capabilities: tool.capabilities.clone(),
        };
    }

    if let Some(tool_name) = find_unapproved_tool_mention(&low, approved_tools) {
        return ToolRequestAnalysis::UnapprovedTool { tool_name };
    }

    ToolRequestAnalysis::NoToolRequest
}

fn find_mentioned_approved_tool<'a>(
    low: &str,
    approved_tools: &'a [ApprovedTool],
) -> Option<&'a ApprovedTool> {
    approved_tools
        .iter()
        .find(|tool| tool_usage_requested(low, &tool_aliases(tool)))
}

fn select_capability(low: &str, capabilities: &[String]) -> Option<String> {
    let normalized_caps: Vec<(String, String)> = capabilities
        .iter()
        .map(|cap| (cap.to_ascii_lowercase(), cap.clone()))
        .collect();

    for (needle, original) in &normalized_caps {
        let spaced = needle.replace('_', " ");
        if low.contains(needle) || low.contains(&spaced) {
            return Some(original.clone());
        }
    }

    let action_preferences: &[(&[&str], &[&str])] = &[
        (
            &["send", "post", "message", "notify"],
            &["send_", "post_", "reply_"],
        ),
        (
            &["create", "write", "draft", "add", "upload"],
            &["create_", "append_", "add_", "put_"],
        ),
        (
            &["update", "edit", "change", "modify"],
            &["update_", "edit_", "set_"],
        ),
        (
            &["search", "find", "look up"],
            &["search_", "find_", "query_"],
        ),
        (&["list", "show", "browse"], &["list_", "get_", "query_"]),
        (&["read", "fetch", "retrieve"], &["get_", "read_", "fetch_"]),
    ];

    for (verbs, prefixes) in action_preferences {
        if verbs.iter().any(|verb| low.contains(verb)) {
            if let Some((_, original)) = normalized_caps
                .iter()
                .find(|(cap, _)| prefixes.iter().any(|prefix| cap.starts_with(prefix)))
            {
                return Some(original.clone());
            }
        }
    }

    None
}

fn build_tool_arguments(task_content: &str, invocation: &ToolInvocation) -> Value {
    let stripped = strip_tool_name(task_content, &invocation.tool);
    let title =
        extract_title_hint(&stripped).unwrap_or_else(|| format!("{} task", invocation.tool.name));
    let mut payload = json!({
        "query": stripped,
        "instruction": task_content,
        "content": stripped,
        "text": stripped,
        "message": stripped,
        "title": title,
        "tool_id": invocation.tool.slug,
    });

    apply_capability_specific_arguments(&mut payload, task_content, &stripped, invocation);
    payload
}

fn apply_capability_specific_arguments(
    payload: &mut Value,
    task_content: &str,
    stripped: &str,
    invocation: &ToolInvocation,
) {
    let capability = invocation.capability.as_str();

    if let Some(channel) = extract_channel_hint(task_content) {
        payload["channel"] = Value::String(channel);
    }

    match invocation.tool.slug.as_str() {
        "slack" | "teams" | "discord" => {
            if capability == "send_message" || capability == "post_message" {
                if let Some(channel) = extract_channel_hint(task_content)
                    .or_else(|| extract_named_target_hint(task_content, &["channel", "room"]))
                {
                    payload["channel"] = Value::String(channel);
                }
                payload["message"] = Value::String(clean_message_body(stripped));
                payload["text"] = payload["message"].clone();
            } else if capability == "create_channel" {
                if let Some(name) = extract_named_target_hint(task_content, &["channel"]) {
                    payload["name"] = Value::String(trim_target_marker(&name));
                }
            }
        }
        "notion" => {
            payload["markdown"] = payload["content"].clone();
            payload["body"] = payload["content"].clone();
            if matches!(capability, "create_page" | "update_page") {
                payload["properties"] = json!({
                    "title": payload["title"].clone(),
                });
            }
            if capability == "query_database" || capability == "search_pages" {
                payload["query"] = Value::String(clean_search_query(stripped));
            }
        }
        "google-calendar" => {
            if capability == "create_event" {
                payload["summary"] = payload["title"].clone();
                payload["description"] = payload["content"].clone();
                if let Some(attendee) = extract_email_hint(task_content)
                    .or_else(|| extract_named_target_hint(task_content, &["with"]))
                {
                    payload["attendee"] = Value::String(attendee);
                }
                if let Some(when_text) = extract_when_hint(task_content) {
                    payload["when"] = Value::String(when_text);
                }
            } else if capability == "check_availability" || capability == "list_events" {
                if let Some(when_text) = extract_when_hint(task_content) {
                    payload["when"] = Value::String(when_text);
                }
            }
        }
        "google-drive" => match capability {
            "create_file" => {
                if let Some(filename) = extract_filename_hint(task_content) {
                    payload["filename"] = Value::String(filename);
                }
                payload["body"] = payload["content"].clone();
            }
            "read_file" | "share_file" | "move_file" => {
                if let Some(filename) = extract_filename_hint(task_content) {
                    payload["filename"] = Value::String(filename);
                }
            }
            "list_files" => {
                payload["query"] = Value::String(clean_search_query(stripped));
            }
            _ => {}
        },
        "github" | "linear" | "jira" => {
            if capability.starts_with("create_") {
                payload["name"] = payload["title"].clone();
                payload["body"] = payload["content"].clone();
                payload["description"] = payload["content"].clone();
            } else if capability.starts_with("search_") || capability.starts_with("list_") {
                payload["query"] = Value::String(clean_search_query(stripped));
            } else if capability.starts_with("update_") {
                payload["body"] = payload["content"].clone();
            }
        }
        _ => {
            if capability.starts_with("search_") || capability.starts_with("list_") {
                payload["query"] = Value::String(clean_search_query(stripped));
            }
            if capability.starts_with("create_") {
                payload["name"] = payload["title"].clone();
            }
        }
    }
}

impl From<String> for ToolDispatchOutput {
    fn from(summary: String) -> Self {
        Self {
            summary,
            metadata: None,
        }
    }
}

impl From<&str> for ToolDispatchOutput {
    fn from(summary: &str) -> Self {
        Self {
            summary: summary.to_string(),
            metadata: None,
        }
    }
}

fn find_unapproved_tool_mention(low: &str, approved_tools: &[ApprovedTool]) -> Option<String> {
    let common_external_tools = [
        ("notion", "Notion"),
        ("slack", "Slack"),
        ("linear", "Linear"),
        ("jira", "Jira"),
        ("github", "GitHub"),
        ("figma", "Figma"),
        ("google drive", "Google Drive"),
        ("google calendar", "Google Calendar"),
    ];

    common_external_tools.iter().find_map(|(needle, label)| {
        let aliases = vec![needle.to_string()];
        let approved = approved_tools.iter().any(|tool| {
            tool_aliases(tool)
                .into_iter()
                .any(|alias| alias == *needle || alias.contains(needle))
        });
        if !approved && tool_usage_requested(low, &aliases) {
            Some((*label).to_string())
        } else {
            None
        }
    })
}

fn tool_aliases(tool: &ApprovedTool) -> Vec<String> {
    let mut aliases = vec![
        tool.slug.to_ascii_lowercase(),
        tool.name.to_ascii_lowercase(),
        tool.slug.replace('-', " ").to_ascii_lowercase(),
    ];
    aliases.sort();
    aliases.dedup();
    aliases
        .into_iter()
        .filter(|alias| !alias.is_empty())
        .collect()
}

fn tool_usage_requested(low: &str, aliases: &[String]) -> bool {
    let action_tokens = [
        "send", "post", "message", "notify", "create", "write", "draft", "add", "update", "edit",
        "change", "modify", "search", "find", "list", "show", "read", "fetch", "retrieve",
        "upload", "share", "move", "query", "run", "open", "use",
    ];
    let explicit_usage_patterns = ["use ", "using ", "via ", "through "];
    let placement_patterns = [
        " to ",
        " in ",
        " on ",
        " via ",
        " using ",
        " through ",
        " with ",
    ];

    aliases.iter().any(|alias| {
        let mentioned = low.contains(alias);
        if !mentioned {
            return false;
        }

        explicit_usage_patterns
            .iter()
            .any(|prefix| low.contains(&format!("{prefix}{alias}")))
            || (action_tokens.iter().any(|verb| low.contains(verb))
                && placement_patterns
                    .iter()
                    .any(|prefix| low.contains(&format!("{prefix}{alias}"))))
    })
}

async fn fetch_weather_summary(city: &str, days: u8) -> Result<String, String> {
    let client = reqwest::Client::new();
    let geo_url = "https://geocoding-api.open-meteo.com/v1/search";
    let geo_resp: Value = client
        .get(geo_url)
        .query(&[
            ("name", city),
            ("count", "1"),
            ("language", "en"),
            ("format", "json"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let results = geo_resp["results"]
        .as_array()
        .filter(|a| !a.is_empty())
        .ok_or_else(|| format!("Location not found: {city}"))?;

    let lat = results[0]["latitude"].as_f64().unwrap_or(0.0);
    let lon = results[0]["longitude"].as_f64().unwrap_or(0.0);
    let label = results[0]["name"].as_str().unwrap_or(city).to_string();

    let forecast_url = "https://api.open-meteo.com/v1/forecast";
    let forecast_resp: Value = client
        .get(forecast_url)
        .query(&[
            ("latitude", lat.to_string().as_str()),
            ("longitude", lon.to_string().as_str()),
            (
                "daily",
                "temperature_2m_max,temperature_2m_min,precipitation_sum",
            ),
            ("forecast_days", &days.to_string()),
            ("timezone", "auto"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let dates = forecast_resp["daily"]["time"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let highs = forecast_resp["daily"]["temperature_2m_max"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let lows = forecast_resp["daily"]["temperature_2m_min"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let mut rows: Vec<String> = Vec::new();
    for (i, date) in dates.iter().enumerate() {
        let d = date.as_str().unwrap_or("?");
        let hi = highs.get(i).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let lo = lows.get(i).and_then(|v| v.as_f64()).unwrap_or(0.0);
        rows.push(format!("{d}: {hi:.1}C / {lo:.1}C"));
    }

    Ok(format!(
        "{}-day weather forecast for {}:\n{}",
        days,
        label,
        rows.join("\n")
    ))
}

fn extract_title_hint(content: &str) -> Option<String> {
    let trimmed = content.trim();
    let title = if let Some(pos) = trimmed.find(['.', '\n']) {
        trimmed[..pos].trim()
    } else if trimmed.len() > 60 {
        &trimmed[..60]
    } else {
        trimmed
    };
    if title.is_empty() {
        None
    } else {
        Some(title.to_string())
    }
}

fn strip_tool_name(content: &str, tool: &ApprovedTool) -> String {
    let low = content.to_ascii_lowercase();
    let mut result = content.trim().to_string();
    for marker in [&tool.slug, &tool.name] {
        let low_marker = marker.to_ascii_lowercase();
        if let Some(idx) = low.find(&low_marker) {
            let end = idx + marker.len();
            result = format!("{} {}", content[..idx].trim(), content[end..].trim())
                .trim()
                .trim_matches([':', '-', ' '])
                .to_string();
            break;
        }
    }
    if result.is_empty() {
        content.trim().to_string()
    } else {
        result
    }
}

fn extract_channel_hint(content: &str) -> Option<String> {
    content
        .split_whitespace()
        .find(|token| token.starts_with('#') && token.len() > 1)
        .map(|token| {
            token
                .trim_matches(|c: char| c == ',' || c == '.' || c == ':')
                .to_string()
        })
}

fn extract_named_target_hint(content: &str, markers: &[&str]) -> Option<String> {
    let normalized = content.replace('\n', " ");
    let words: Vec<&str> = normalized.split_whitespace().collect();
    for (idx, word) in words.iter().enumerate() {
        let cleaned = word
            .trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '#')
            .to_ascii_lowercase();
        if markers.iter().any(|marker| cleaned == *marker) {
            let tail = words
                .iter()
                .skip(idx + 1)
                .take_while(|token| {
                    let low = token.to_ascii_lowercase();
                    !matches!(
                        low.as_str(),
                        "for" | "with" | "about" | "using" | "via" | "through" | "in"
                    )
                })
                .map(|token| token.trim_matches(|c: char| c == ',' || c == '.'))
                .collect::<Vec<_>>()
                .join(" ");
            if !tail.is_empty() {
                return Some(tail);
            }
        }
    }
    None
}

fn trim_target_marker(value: &str) -> String {
    value
        .trim()
        .trim_matches(|c: char| c == ':' || c == '.' || c == ',')
        .to_string()
}

fn clean_message_body(content: &str) -> String {
    let mut cleaned = content.trim().to_string();
    for prefix in [
        "send this",
        "send",
        "post this",
        "post",
        "message",
        "notify",
    ] {
        let low = cleaned.to_ascii_lowercase();
        if low.starts_with(prefix) {
            cleaned = cleaned[prefix.len()..]
                .trim_start_matches([':', '-', ' '])
                .to_string();
            break;
        }
    }
    if cleaned.is_empty() {
        content.trim().to_string()
    } else {
        cleaned
    }
}

fn clean_search_query(content: &str) -> String {
    let trimmed = content.trim();
    let prefixes = [
        "search for ",
        "search ",
        "find ",
        "look up ",
        "list ",
        "show ",
        "read ",
        "open ",
    ];
    for prefix in prefixes {
        if trimmed.to_ascii_lowercase().starts_with(prefix) {
            return trimmed[prefix.len()..].trim().to_string();
        }
    }
    trimmed.to_string()
}

fn extract_when_hint(content: &str) -> Option<String> {
    let normalized = content.replace('\n', " ");
    let low = normalized.to_ascii_lowercase();
    for marker in [" on ", " at ", " tomorrow", " today", " next ", " this "] {
        if let Some(idx) = low.find(marker) {
            return Some(normalized[idx..].trim().to_string());
        }
    }
    None
}

fn extract_email_hint(content: &str) -> Option<String> {
    content
        .split_whitespace()
        .map(|token| token.trim_matches(|c: char| c == ',' || c == '.'))
        .find(|token| token.contains('@') && token.contains('.'))
        .map(str::to_string)
}

fn extract_filename_hint(content: &str) -> Option<String> {
    if let Some(quoted) = extract_quoted_text(content) {
        return Some(quoted);
    }

    let words: Vec<&str> = content.split_whitespace().collect();
    for (idx, word) in words.iter().enumerate() {
        let cleaned = word
            .trim_matches(|c: char| !c.is_ascii_alphanumeric())
            .to_ascii_lowercase();
        if matches!(cleaned.as_str(), "file" | "document" | "doc" | "page") {
            let tail = words
                .iter()
                .skip(idx + 1)
                .take_while(|token| {
                    let low = token.to_ascii_lowercase();
                    !matches!(
                        low.as_str(),
                        "to" | "for" | "with" | "in" | "on" | "via" | "through"
                    )
                })
                .map(|token| token.trim_matches(|c: char| c == ',' || c == '.'))
                .collect::<Vec<_>>()
                .join(" ");
            if !tail.is_empty() {
                return Some(tail);
            }
        }
    }
    None
}

fn extract_quoted_text(content: &str) -> Option<String> {
    let chars = content.char_indices().collect::<Vec<_>>();
    let mut start_idx = None;
    for (idx, ch) in chars {
        if ch == '"' {
            if let Some(start) = start_idx {
                let quoted = content[start + 1..idx].trim();
                if !quoted.is_empty() {
                    return Some(quoted.to_string());
                }
                start_idx = None;
            } else {
                start_idx = Some(idx);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests;
