/*
 * @module-id: rust.consumer-preflight
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use crate::{db::Db, message::AFPMessage, tool_dispatch::ToolRequestAnalysis};
use serde_json::json;
use ulid::Ulid;

pub struct ConsumerPreflightBlock {
    pub intent: String,
    pub suggested_view: String,
    pub preferred_view: String,
    pub summary: String,
    pub bullets: Vec<String>,
    pub preview_message: Option<AFPMessage>,
}

pub async fn evaluate_ui_command(
    query: &str,
    db: &Db,
    user_id: &str,
) -> Result<Option<ConsumerPreflightBlock>, String> {
    let analysis = crate::tool_dispatch::analyze_user_tool_request(query, db, user_id).await?;
    if let Some(block) = block_for_tool_request(analysis) {
        return Ok(Some(block));
    }
    if let Some(block) = block_for_policy_limited_query(query) {
        return Ok(Some(block));
    }
    Ok(block_for_missing_context(query))
}

fn block_for_tool_request(analysis: ToolRequestAnalysis) -> Option<ConsumerPreflightBlock> {
    match analysis {
        ToolRequestAnalysis::UnapprovedTool { tool_name } => Some(ConsumerPreflightBlock {
            intent: "tool_preflight".to_string(),
            suggested_view: "search".to_string(),
            preferred_view: "chat".to_string(),
            summary: format!(
                "This request asks OmnyID to act in {}, but that tool is not in the approved MCP list for this user.",
                tool_name
            ),
            bullets: vec![
                format!(
                    "Connect and approve {} in the Tools view before re-running this request.",
                    tool_name
                ),
                "If you only want research or advice about the tool, ask that directly without requesting an in-tool action."
                    .to_string(),
            ],
            preview_message: None,
        }),
        ToolRequestAnalysis::AmbiguousApprovedTool {
            tool_name,
            capabilities,
            ..
        } => {
            let examples = capabilities
                .into_iter()
                .take(3)
                .map(|capability| capability.replace('_', " "))
                .collect::<Vec<_>>();
            let mut bullets = vec![format!(
                "{} is approved, but the requested action is too vague to execute safely.",
                tool_name
            )];
            if !examples.is_empty() {
                bullets.push(format!(
                    "Specify one concrete action such as: {}.",
                    examples.join(", ")
                ));
            }
            Some(ConsumerPreflightBlock {
                intent: "tool_preflight".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "chat".to_string(),
                summary: format!(
                    "This request references approved tool {}, but OmnyID needs a more specific action before orchestration starts.",
                    tool_name
                ),
                bullets,
                preview_message: None,
            })
        }
        ToolRequestAnalysis::NoToolRequest | ToolRequestAnalysis::Ready { .. } => None,
    }
}

fn block_for_policy_limited_query(query: &str) -> Option<ConsumerPreflightBlock> {
    let lowered = query.to_lowercase();
    let health = [
        "diagnose",
        "diagnosis",
        "symptom",
        "symptoms",
        "medication",
        "prescription",
        "treatment",
    ]
    .iter()
    .any(|token| lowered.contains(token));
    let legal = [
        "lawsuit",
        "sue",
        "legal advice",
        "contract dispute",
        "custody",
        "criminal charge",
    ]
    .iter()
    .any(|token| lowered.contains(token));
    let finance = [
        "should i invest",
        "buy this stock",
        "buy this crypto",
        "retirement advice",
        "tax advice",
    ]
    .iter()
    .any(|token| lowered.contains(token));

    if !health && !legal && !finance {
        return None;
    }

    let (title, body, bullets) = if health {
        (
            "Health guidance is limited",
            "OmnyID can help organise health information, but it should not act like a clinician. Use it for questions to ask, records to collect, and plain-language explanation rather than diagnosis or treatment instructions.",
            vec![
                "If this is urgent or safety-critical, contact a qualified clinician or local emergency service now.".to_string(),
                "If you want help, restate the request as explanation, preparation, or question drafting.".to_string(),
            ],
        )
    } else if legal {
        (
            "Legal guidance is limited",
            "OmnyID can help summarise documents and organise issues, but it should not present itself as your lawyer or give definitive legal advice.",
            vec![
                "If you want help, ask for a summary, a checklist of questions for counsel, or a document comparison.".to_string(),
                "Jurisdiction matters here, so any binding interpretation should be verified with a qualified professional.".to_string(),
            ],
        )
    } else {
        (
            "Financial guidance is limited",
            "OmnyID can help compare options, explain terms, and organise evidence, but it should not present a high-confidence personal investment or tax decision as final advice.",
            vec![
                "If you want help, restate the request as comparison, scenario analysis, or question preparation.".to_string(),
                "Current market, tax, and personal suitability factors should be verified before acting.".to_string(),
            ],
        )
    };

    let preview_message = Some(build_callout_preview(
        "policy-limited",
        "Policy-limited request",
        body,
        bullets.clone(),
        "warning",
    ));

    Some(ConsumerPreflightBlock {
        intent: "policy_limited".to_string(),
        suggested_view: "search".to_string(),
        preferred_view: "chat".to_string(),
        summary: title.to_string(),
        bullets,
        preview_message,
    })
}

fn block_for_missing_context(query: &str) -> Option<ConsumerPreflightBlock> {
    let lowered = query.to_lowercase();

    if looks_like_travel_query(&lowered) {
        let fields = travel_missing_fields(query, &lowered);
        if !fields.is_empty() {
            let bullets = fields
                .iter()
                .map(|field| format!("Missing: {}", field.0))
                .collect::<Vec<_>>();
            return Some(ConsumerPreflightBlock {
                intent: "clarification_required".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "chat".to_string(),
                summary: "I can help with this trip, but I need a few specific details before I plan or price it.".to_string(),
                bullets,
                preview_message: Some(build_input_collection_preview(
                    "travel-clarification",
                    "Trip details needed",
                    "Add only the missing trip details below. OmnyID will keep the response lightweight until the basics are clear.",
                    query,
                    fields,
                    Some("Use the date picker for local format. The submitted value stays unambiguous."),
                )),
            });
        }
    }

    if looks_like_meal_plan_query(&lowered) {
        let fields = meal_plan_missing_fields(&lowered);
        if !fields.is_empty() {
            let bullets = fields
                .iter()
                .map(|field| format!("Missing: {}", field.0))
                .collect::<Vec<_>>();
            return Some(ConsumerPreflightBlock {
                intent: "clarification_required".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "chat".to_string(),
                summary: "I can build a meal plan, but I need the practical constraints first."
                    .to_string(),
                bullets,
                preview_message: Some(build_input_collection_preview(
                    "meal-plan-clarification",
                    "Meal-plan details needed",
                    "Add the missing constraints so OmnyID can plan something usable instead of generic.",
                    query,
                    fields,
                    None,
                )),
            });
        }
    }

    if looks_like_comparison_query(&lowered) {
        let fields = comparison_missing_fields(&lowered);
        if !fields.is_empty() {
            let bullets = fields
                .iter()
                .map(|field| format!("Missing: {}", field.0))
                .collect::<Vec<_>>();
            return Some(ConsumerPreflightBlock {
                intent: "clarification_required".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "chat".to_string(),
                summary: "I can compare options, but I need the target and decision criteria before ranking anything.".to_string(),
                bullets,
                preview_message: Some(build_input_collection_preview(
                    "comparison-clarification",
                    "Comparison details needed",
                    "Add the minimum decision context so OmnyID can compare the right things.",
                    query,
                    fields,
                    None,
                )),
            });
        }
    }

    if looks_like_negotiation_query(&lowered) {
        let fields = negotiation_missing_fields(&lowered);
        if !fields.is_empty() {
            let bullets = fields
                .iter()
                .map(|field| format!("Missing: {}", field.0))
                .collect::<Vec<_>>();
            return Some(ConsumerPreflightBlock {
                intent: "clarification_required".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "chat".to_string(),
                summary: "I can help with negotiation wording or tactics, but I need the item, channel, and price anchor first.".to_string(),
                bullets,
                preview_message: Some(build_input_collection_preview(
                    "negotiation-clarification",
                    "Negotiation details needed",
                    "Add the missing transaction details so OmnyID can draft something specific and credible.",
                    query,
                    fields,
                    None,
                )),
            });
        }
    }

    None
}

fn build_callout_preview(
    slug: &str,
    title: &str,
    body: &str,
    bullets: Vec<String>,
    tone: &str,
) -> AFPMessage {
    let timestamp = chrono::Utc::now().to_rfc3339();
    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: format!("preview.{slug}.{}", Ulid::new()),
        thread_id: format!("thread.preview.{slug}"),
        parent_id: None,
        from: "omnyid://workspace/command-bar".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp,
        r#type: "agent".to_string(),
        kind: None,
        supertags: vec![],
        subtype: Some("workspace_panel".to_string()),
        content: json!({
            "schema_version": "a2ui.v1",
            "kind": "panel",
            "title": title,
            "description": body,
            "layout": { "type": "stack", "gap": "md" },
            "nodes": [
                {
                    "id": "policy-summary",
                    "type": "callout",
                    "props": {
                        "tone": tone,
                        "title": title,
                        "body": body,
                    }
                },
                {
                    "id": "policy-next-steps",
                    "type": "table",
                    "props": {
                        "columns": ["Next step"],
                        "rows": bullets.iter().map(|item| json!([item])).collect::<Vec<_>>(),
                        "caption": "Recommended handling"
                    }
                }
            ]
        }),
        metadata: Some(json!({
            "origin": "consumer_preflight",
            "preflight_kind": slug,
        })),
        signature: String::new(),
        encryption: None,
        views: vec![json!({
            "format": "a2ui.v1",
            "priority": 100,
            "content": {
                "schema_version": "a2ui.v1",
                "kind": "panel",
                "title": title,
                "description": body,
                "layout": { "type": "stack", "gap": "md" },
                "nodes": [
                    {
                        "id": "policy-summary",
                        "type": "callout",
                        "props": {
                            "tone": tone,
                            "title": title,
                            "body": body,
                        }
                    },
                    {
                        "id": "policy-next-steps",
                        "type": "table",
                        "props": {
                            "columns": ["Next step"],
                            "rows": bullets.iter().map(|item| json!([item])).collect::<Vec<_>>(),
                            "caption": "Recommended handling"
                        }
                    }
                ]
            }
        })],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: false,
        prev_hash: None,
    }
}

fn build_input_collection_preview(
    slug: &str,
    title: &str,
    description: &str,
    prompt_prefix: &str,
    fields: Vec<(&'static str, serde_json::Value)>,
    helper_text: Option<&str>,
) -> AFPMessage {
    let timestamp = chrono::Utc::now().to_rfc3339();
    let field_values = fields.into_iter().collect::<Vec<_>>();
    let rows = field_values
        .iter()
        .map(|(label, _)| json!([format!("Add {label}")]))
        .collect::<Vec<_>>();
    let field_defs = field_values
        .iter()
        .map(|(_, field)| field.clone())
        .collect::<Vec<_>>();
    let panel = json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": title,
        "description": description,
        "layout": { "type": "stack", "gap": "md" },
        "nodes": [
            {
                "id": "clarification-summary",
                "type": "callout",
                "props": {
                    "tone": "strategy",
                    "title": title,
                    "body": description,
                }
            },
            {
                "id": "clarification-fields",
                "type": "input_collection",
                "props": {
                    "prompt_prefix": prompt_prefix,
                    "helper_text": helper_text.unwrap_or(""),
                    "apply_label": "Add details to chat",
                    "submit_label": "Run with these details",
                    "fields": field_defs,
                }
            },
            {
                "id": "clarification-checklist",
                "type": "table",
                "props": {
                    "columns": ["Missing detail"],
                    "rows": rows,
                    "caption": "Required before execution"
                }
            }
        ]
    });

    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: format!("preview.{slug}.{}", Ulid::new()),
        thread_id: format!("thread.preview.{slug}"),
        parent_id: None,
        from: "omnyid://workspace/command-bar".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp,
        r#type: "agent".to_string(),
        kind: None,
        supertags: vec![],
        subtype: Some("workspace_panel".to_string()),
        content: panel.clone(),
        metadata: Some(json!({
            "origin": "consumer_preflight",
            "preflight_kind": slug,
        })),
        signature: String::new(),
        encryption: None,
        views: vec![json!({
            "format": "a2ui.v1",
            "priority": 100,
            "content": panel,
        })],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: false,
        prev_hash: None,
    }
}

fn looks_like_travel_query(lowered: &str) -> bool {
    [
        "flight",
        "flights",
        "hotel",
        "travel",
        "trip",
        "itinerary",
        "holiday",
        "vacation",
        "route",
    ]
    .iter()
    .any(|token| lowered.contains(token))
}

fn looks_like_meal_plan_query(lowered: &str) -> bool {
    lowered.contains("meal plan")
        || lowered.contains("diet plan")
        || (lowered.contains("meal") && lowered.contains("week"))
}

fn looks_like_comparison_query(lowered: &str) -> bool {
    lowered.contains("compare")
        || lowered.contains("which is better")
        || lowered.contains("best option")
        || lowered.contains("recommend")
}

fn looks_like_negotiation_query(lowered: &str) -> bool {
    lowered.contains("negotiat")
        || lowered.contains("haggle")
        || (lowered.contains("offer") && lowered.contains("seller"))
}

fn travel_missing_fields(query: &str, lowered: &str) -> Vec<(&'static str, serde_json::Value)> {
    let mut fields = Vec::new();
    let has_from = lowered.contains(" from ");
    let has_to = lowered.contains(" to ");
    let has_date = contains_date_hint(query, lowered);
    let wants_return = lowered.contains("return")
        || lowered.contains("round trip")
        || lowered.contains("round-trip")
        || lowered.contains("come back");
    if !has_from {
        fields.push((
            "Departure airport or city",
            json!({
                "id": "departure_origin",
                "label": "Departure airport or city",
                "kind": "text",
                "required": true,
                "placeholder": "e.g. Sydney or SYD"
            }),
        ));
    }
    if !has_to {
        fields.push((
            "Destination",
            json!({
                "id": "destination",
                "label": "Destination",
                "kind": "text",
                "required": true,
                "placeholder": "e.g. Tokyo"
            }),
        ));
    }
    if !has_date {
        fields.push((
            "Departure date",
            json!({
                "id": "departure_date",
                "label": "Departure date",
                "kind": "date",
                "required": true
            }),
        ));
    }
    if wants_return && !lowered.contains(" return ") && !lowered.contains(" back on ") {
        fields.push((
            "Return date",
            json!({
                "id": "return_date",
                "label": "Return date",
                "kind": "date",
                "required": true
            }),
        ));
    }
    if lowered.contains("budget") || lowered.contains("cheap") || lowered.contains("afford") {
        if !contains_currency_hint(lowered) {
            fields.push((
                "Budget",
                json!({
                    "id": "budget",
                    "label": "Budget",
                    "kind": "text",
                    "required": false,
                    "placeholder": "e.g. AUD 1500 total"
                }),
            ));
        }
    }
    fields
}

fn meal_plan_missing_fields(lowered: &str) -> Vec<(&'static str, serde_json::Value)> {
    let mut fields = Vec::new();
    if ![
        "vegan",
        "vegetarian",
        "gluten",
        "dairy",
        "halal",
        "kosher",
        "allergy",
        "allergies",
        "paleo",
        "keto",
    ]
    .iter()
    .any(|token| lowered.contains(token))
    {
        fields.push((
            "Dietary constraints",
            json!({
                "id": "dietary_constraints",
                "label": "Dietary constraints",
                "kind": "text",
                "required": true,
                "placeholder": "e.g. vegetarian, nut-free"
            }),
        ));
    }
    if !lowered.contains("for ") && !lowered.contains("days") && !lowered.contains("week") {
        fields.push((
            "Plan duration",
            json!({
                "id": "plan_duration",
                "label": "Plan duration",
                "kind": "text",
                "required": true,
                "placeholder": "e.g. 5 days"
            }),
        ));
    }
    if !lowered.contains("budget") && !lowered.contains("cheap") {
        fields.push((
            "Budget preference",
            json!({
                "id": "budget_preference",
                "label": "Budget preference",
                "kind": "select",
                "required": false,
                "options": ["Budget", "Mid-range", "Flexible"]
            }),
        ));
    }
    fields
}

fn comparison_missing_fields(lowered: &str) -> Vec<(&'static str, serde_json::Value)> {
    let mut fields = Vec::new();
    if !lowered.contains(" vs ")
        && !lowered.contains(" versus ")
        && !lowered.contains(" between ")
        && !lowered.contains("compare ")
    {
        fields.push((
            "Options to compare",
            json!({
                "id": "options",
                "label": "Options to compare",
                "kind": "text",
                "required": true,
                "placeholder": "e.g. MacBook Air vs Dell XPS 13"
            }),
        ));
    }
    if !lowered.contains("budget") && !contains_currency_hint(lowered) {
        fields.push((
            "Budget",
            json!({
                "id": "budget",
                "label": "Budget",
                "kind": "text",
                "required": false,
                "placeholder": "e.g. under AUD 2,000"
            }),
        ));
    }
    if ![
        "battery",
        "performance",
        "price",
        "weight",
        "camera",
        "durability",
        "value",
    ]
    .iter()
    .any(|token| lowered.contains(token))
    {
        fields.push((
            "Decision criteria",
            json!({
                "id": "criteria",
                "label": "Decision criteria",
                "kind": "text",
                "required": true,
                "placeholder": "e.g. battery life, weight, and price"
            }),
        ));
    }
    fields
}

fn negotiation_missing_fields(lowered: &str) -> Vec<(&'static str, serde_json::Value)> {
    let mut fields = Vec::new();
    if ![
        "car", "house", "rent", "laptop", "bike", "sofa", "phone", "ticket", "item",
    ]
    .iter()
    .any(|token| lowered.contains(token))
    {
        fields.push((
            "Item or service",
            json!({
                "id": "item",
                "label": "Item or service",
                "kind": "text",
                "required": true,
                "placeholder": "e.g. used bike"
            }),
        ));
    }
    if ![
        "facebook marketplace",
        "gumtree",
        "ebay",
        "dealer",
        "email",
        "text",
        "sms",
        "call",
    ]
    .iter()
    .any(|token| lowered.contains(token))
    {
        fields.push((
            "Negotiation channel",
            json!({
                "id": "channel",
                "label": "Negotiation channel",
                "kind": "select",
                "required": true,
                "options": ["Email", "Text message", "Marketplace chat", "Phone call", "In person"]
            }),
        ));
    }
    if !contains_currency_hint(lowered) {
        fields.push((
            "Current asking price",
            json!({
                "id": "asking_price",
                "label": "Current asking price",
                "kind": "text",
                "required": true,
                "placeholder": "e.g. AUD 420"
            }),
        ));
    }
    fields
}

fn contains_currency_hint(lowered: &str) -> bool {
    [" aud", " usd", " eur", "$", "Â£", "â‚¬", "Â¥"]
        .iter()
        .any(|token| lowered.contains(token))
}

fn contains_date_hint(query: &str, lowered: &str) -> bool {
    if [
        "today",
        "tomorrow",
        "next week",
        "next month",
        "this weekend",
    ]
    .iter()
    .any(|token| lowered.contains(token))
    {
        return true;
    }
    if query.contains('/') || query.contains('-') {
        let digit_count = query.chars().filter(|ch| ch.is_ascii_digit()).count();
        if digit_count >= 6 {
            return true;
        }
    }
    [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ]
    .iter()
    .any(|token| lowered.contains(token))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_unapproved_tool_block() {
        let block = block_for_tool_request(ToolRequestAnalysis::UnapprovedTool {
            tool_name: "Slack".to_string(),
        })
        .expect("block");

        assert_eq!(block.intent, "tool_preflight");
        assert!(block.summary.contains("Slack"));
        assert_eq!(block.bullets.len(), 2);
    }

    #[test]
    fn builds_ambiguous_tool_block() {
        let block = block_for_tool_request(ToolRequestAnalysis::AmbiguousApprovedTool {
            tool_slug: "notion".to_string(),
            tool_name: "Notion".to_string(),
            capabilities: vec!["create_page".to_string(), "search_pages".to_string()],
        })
        .expect("block");

        assert!(block.summary.contains("Notion"));
        assert!(
            block
                .bullets
                .iter()
                .any(|bullet| bullet.contains("create page"))
        );
    }

    #[test]
    fn builds_travel_clarification_block() {
        let block = block_for_missing_context("Find me flights to Tokyo")
            .expect("travel clarification block");
        assert_eq!(block.intent, "clarification_required");
        assert!(
            block
                .bullets
                .iter()
                .any(|bullet| bullet.contains("Departure airport or city"))
        );
        assert!(block.preview_message.is_some());
    }

    #[test]
    fn builds_policy_limited_block() {
        let block = block_for_policy_limited_query("Should I buy this stock for retirement?")
            .expect("policy block");
        assert_eq!(block.intent, "policy_limited");
        assert!(block.summary.contains("Financial"));
    }
}
