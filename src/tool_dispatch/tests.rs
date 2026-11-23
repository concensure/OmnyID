use super::*;

fn approved_tool(slug: &str, caps: &[&str]) -> ApprovedTool {
    ApprovedTool {
        slug: slug.to_string(),
        name: slug.to_string(),
        mcp_server_url: "https://mcp.example.com".to_string(),
        api_key: "test-key".to_string(),
        connection_provider: "direct".to_string(),
        capabilities: caps.iter().map(|cap| cap.to_string()).collect(),
        tool_descriptor: json!({}),
    }
}

#[test]
fn usage_event_insert_uses_default_billing_metering() {
    let invocation = ToolInvocation {
        tool: ApprovedTool {
            tool_descriptor: json!({
                "billing": {
                    "provider_key": "tavily",
                    "provider_category": "search_api",
                    "billing_category": "search_api",
                    "default_usage_unit": "credits",
                    "default_quantity_per_call": 1,
                    "estimated_cost_usd_per_call": 0.008
                }
            }),
            ..approved_tool("tavily", &["search_web"])
        },
        capability: "search_web".to_string(),
    };

    let event = build_usage_event_insert("user-1", &invocation).expect("usage event");
    assert_eq!(event.user_id, "user-1");
    assert_eq!(event.provider_key, "tavily");
    assert_eq!(event.provider_category, "search_api");
    assert_eq!(event.billing_category, "search_api");
    assert_eq!(event.usage_unit, "credits");
    assert_eq!(event.quantity, 1.0);
    assert!((event.estimated_cost_usd - 0.008).abs() < f64::EPSILON);
    assert_eq!(event.source.as_deref(), Some("tool_dispatch"));
}

#[test]
fn usage_event_insert_prefers_capability_specific_metering() {
    let invocation = ToolInvocation {
        tool: ApprovedTool {
            tool_descriptor: json!({
                "billing": {
                    "provider_key": "exa",
                    "provider_category": "search_api",
                    "billing_category": "search_api",
                    "default_usage_unit": "requests",
                    "default_quantity_per_call": 1,
                    "estimated_cost_usd_per_call": 0.01,
                    "capability_metering": {
                        "answer_question": {
                            "usage_unit": "requests",
                            "quantity": 1,
                            "estimated_cost_usd": 0.005
                        }
                    }
                }
            }),
            ..approved_tool("exa", &["search_web", "answer_question"])
        },
        capability: "answer_question".to_string(),
    };

    let event = build_usage_event_insert("user-2", &invocation).expect("usage event");
    assert_eq!(event.provider_key, "exa");
    assert_eq!(event.usage_unit, "requests");
    assert_eq!(event.quantity, 1.0);
    assert!((event.estimated_cost_usd - 0.005).abs() < f64::EPSILON);
}

#[test]
fn usage_event_insert_skips_tools_without_billing_metadata() {
    let invocation = ToolInvocation {
        tool: approved_tool("github", &["create_issue"]),
        capability: "create_issue".to_string(),
    };
    assert!(build_usage_event_insert("user-3", &invocation).is_none());
}

#[test]
fn selects_explicit_tool_and_capability() {
    let tools = vec![approved_tool("notion", &["create_page", "search_pages"])];
    let invocation = select_mcp_tool("Use notion to create a project page", &tools).unwrap();
    assert_eq!(invocation.tool.slug, "notion");
    assert_eq!(invocation.capability, "create_page");
}

#[test]
fn selects_send_capability_from_verbs() {
    let cap = select_capability(
        "post this update to slack",
        &["list_channels".to_string(), "send_message".to_string()],
    )
    .unwrap();
    assert_eq!(cap, "send_message");
}

#[test]
fn detects_unapproved_tool_mentions() {
    let tools = vec![approved_tool("notion", &["create_page"])];
    assert_eq!(
        find_unapproved_tool_mention("send this to slack", &tools),
        Some("Slack".to_string())
    );
    assert_eq!(find_unapproved_tool_mention("slack pricing", &tools), None);
}

#[test]
fn ambiguous_tool_request_requires_clarification() {
    let tools = vec![approved_tool("notion", &["create_page", "search_pages"])];
    let result = inspect_tool_request("Use notion for this", &tools);
    assert_eq!(
        result,
        ToolRequestAnalysis::AmbiguousApprovedTool {
            tool_slug: "notion".to_string(),
            tool_name: "notion".to_string(),
            capabilities: vec!["create_page".to_string(), "search_pages".to_string()],
        }
    );
}

#[test]
fn strips_tool_name_from_payload() {
    let tool = approved_tool("slack", &["send_message"]);
    let stripped = strip_tool_name("Send this update to Slack: launch in 5", &tool);
    assert!(
        stripped
            .to_ascii_lowercase()
            .contains("send this update to")
    );
    assert!(!stripped.to_ascii_lowercase().contains("slack"));
}

#[test]
fn builds_slack_send_message_arguments() {
    let invocation = ToolInvocation {
        tool: approved_tool("slack", &["send_message"]),
        capability: "send_message".to_string(),
    };
    let payload = build_tool_arguments(
        "Use slack send_message to #launch-team: launch in 5",
        &invocation,
    );
    assert_eq!(payload["channel"].as_str(), Some("#launch-team"));
    assert_eq!(payload["tool_id"].as_str(), Some("slack"));
}

#[test]
fn builds_notion_create_page_arguments() {
    let invocation = ToolInvocation {
        tool: approved_tool("notion", &["create_page"]),
        capability: "create_page".to_string(),
    };
    let payload = build_tool_arguments(
        "Use notion create_page to save meeting recap for Monday launch",
        &invocation,
    );
    assert!(payload.get("markdown").is_some());
    assert!(payload.get("properties").is_some());
}

#[test]
fn builds_google_calendar_create_event_arguments() {
    let invocation = ToolInvocation {
        tool: approved_tool("google-calendar", &["create_event"]),
        capability: "create_event".to_string(),
    };
    let payload = build_tool_arguments(
        "Use google calendar create_event for launch sync tomorrow at 3pm with sam@example.com",
        &invocation,
    );
    assert_eq!(payload["attendee"].as_str(), Some("sam@example.com"));
    assert!(payload.get("when").is_some());
    assert!(payload.get("summary").is_some());
}

#[test]
fn builds_google_drive_create_file_arguments() {
    let invocation = ToolInvocation {
        tool: approved_tool("google-drive", &["create_file"]),
        capability: "create_file".to_string(),
    };
    let payload = build_tool_arguments(
        "Use google drive create_file for \"Launch plan.md\" with the weekly rollout outline",
        &invocation,
    );
    assert_eq!(payload["filename"].as_str(), Some("Launch plan.md"));
    assert!(payload.get("body").is_some());
}

#[test]
fn formats_slack_result_into_compact_summary() {
    let invocation = ToolInvocation {
        tool: approved_tool("slack", &["send_message"]),
        capability: "send_message".to_string(),
    };
    let payload = json!({
        "structuredContent": {
            "status": "success",
            "channel": "#launch",
            "text": "Launch update sent to the team."
        }
    });
    let output = format_tool_result(&invocation, &payload);
    assert!(output.summary.contains("#launch"));
    assert!(output.summary.contains("Launch update sent"));
    assert_eq!(
        output.metadata.as_ref().and_then(|meta| meta.url.as_ref()),
        None
    );
    assert_eq!(
        output
            .metadata
            .as_ref()
            .map(|meta| meta.schema_version.as_str()),
        Some(crate::message::AFP_TOOL_RESULT_SCHEMA_V1)
    );
    assert_eq!(
        output
            .metadata
            .as_ref()
            .map(|meta| meta.connector_label.as_str()),
        Some("slack")
    );
    assert_eq!(
        output
            .metadata
            .as_ref()
            .map(|meta| meta.artifact_label.as_str()),
        Some("#launch")
    );
    assert_eq!(
        output
            .metadata
            .as_ref()
            .map(|meta| meta.artifact_kind.as_str()),
        Some("message")
    );
}

#[test]
fn formats_notion_result_with_url() {
    let invocation = ToolInvocation {
        tool: approved_tool("notion", &["create_page"]),
        capability: "create_page".to_string(),
    };
    let payload = json!({
        "structuredContent": {
            "status": "success",
            "title": "Weekly recap",
            "url": "https://notion.so/page"
        }
    });
    let output = format_tool_result(&invocation, &payload);
    assert!(output.summary.contains("Weekly recap"));
    assert!(output.summary.contains("https://notion.so/page"));
    assert_eq!(
        output
            .metadata
            .as_ref()
            .and_then(|meta| meta.url.as_deref()),
        Some("https://notion.so/page")
    );
    assert_eq!(
        output
            .metadata
            .as_ref()
            .map(|meta| meta.artifact_label.as_str()),
        Some("Weekly recap")
    );
    assert_eq!(
        output
            .metadata
            .as_ref()
            .map(|meta| meta.artifact_kind.as_str()),
        Some("page")
    );
}
