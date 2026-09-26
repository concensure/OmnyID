/*
 * @module-id: rust.intent-routing
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::intent_safety_gate;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntentContextPolicy {
    #[serde(default)]
    pub inject: Vec<String>,
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntentExecutionPolicy {
    pub mode: Option<String>,
    #[serde(default)]
    pub allowed_now: Vec<String>,
    #[serde(default)]
    pub blocked_until_confirmation: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntentRouteAudit {
    pub route_reason: Option<String>,
    #[serde(default)]
    pub heuristics_used: Vec<String>,
    #[serde(default)]
    pub do_not_route_to: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntentRouteDecision {
    pub primary_intent: String,
    #[serde(default)]
    pub secondary_intents: Vec<String>,
    pub route_mode: String,
    pub preferred_view: String,
    pub requires_context: bool,
    #[serde(default)]
    pub required_context: Vec<String>,
    #[serde(default)]
    pub missing_slots: Vec<String>,
    pub risk_level: String,
    pub requires_confirmation: bool,
    pub external_side_effect: bool,
    #[serde(default)]
    pub context_policy: IntentContextPolicy,
    #[serde(default)]
    pub execution_policy: IntentExecutionPolicy,
    #[serde(default)]
    pub audit: IntentRouteAudit,
}

#[derive(Debug, Clone)]
pub struct ParsedCommandRoute {
    pub route: IntentRouteDecision,
    pub payload: Value,
}

pub const COMMAND_ROUTER_SYSTEM_PROMPT: &str = r#"You are OmnyID's master-agent intent router.

Return ONLY valid JSON. Never return markdown or commentary.

You must output this top-level shape:
{
  "route": {
    "primary_intent": "schedule|task|note|orchestrate|web_research|travel|social|spaces",
    "secondary_intents": ["..."],
    "route_mode": "single|multi|special",
    "preferred_view": "draggable_calendar|task_board|ledger_canvas|orchestrate_progress|search_result|route_card|comparison_table|social_composer|spaces",
    "requires_context": true,
    "required_context": ["active_document"],
    "missing_slots": ["recipient"],
    "risk_level": "low|medium|high",
    "requires_confirmation": true,
    "external_side_effect": true,
    "context_policy": {
      "inject": ["active_document"],
      "exclude": ["calendar", "mood", "old_email_threads"]
    },
    "execution_policy": {
      "mode": "execute|partial_execute_then_confirm|clarify_then_execute",
      "allowed_now": ["document_edit"],
      "blocked_until_confirmation": ["send_message"]
    },
    "audit": {
      "route_reason": "short explanation",
      "heuristics_used": ["explicit_schedule_terms"],
      "do_not_route_to": ["task"]
    }
  },
  "payload": { ... intent-specific object ... }
}

Intent rules:
- "schedule": planning time, day scheduling, calendar events, lessons, appointments, "plan my day", "block time", "add to calendar".
- "task": adding/managing items such as shopping lists, to-dos, reminders, errands, "buy X", "remind me to X".
- "note": saving information, memo capture, journaling, quick notes.
- "orchestrate": complex multi-step goals, especially when the user combines multiple intents or asks OmnyID to manage/handle/set up something end to end.
- "web_research": look something up, factual questions, research, finding information.
- "travel": routes, commuting, directions, travel option comparison.
- "social": drafting posts or public updates for LinkedIn, X, Bluesky, launch updates, threads.
- "spaces": opening or preparing a collaboration space, room, war room, or shared workspace.

Critical routing rules:
- "plan my day", "I have lessons at X", "schedule my workout" must route to "schedule", not "task".
- "add X to my shopping list", "buy X", "remind me to X" must route to "task", not "web_research".
- If the request clearly combines multiple distinct intents, set route_mode to "multi" and usually route primary_intent to "orchestrate".
- Separate intent from permission: wanting to send, book, pay, delete, cancel, submit, transfer, or contact someone means requires_confirmation=true and risk_level at least medium.
- If ambiguity blocks safe execution, fill missing_slots and use execution_policy.mode="clarify_then_execute".
- Fetch broadly, inject narrowly: only request active context when the user depends on references like "this", "that", "it", "continue", "same as before", "send it", "the document", "the project".

The payload must match the primary intent:

schedule payload:
{"intent":"schedule","preferred_view":"draggable_calendar","title":"<brief title>","description":"<full description>","summary":"<friendly confirmation>","slots":[{"label":"<slot name>","start_hour":<hour 0-23>,"duration_hours":<hours>}]}

task payload:
{"intent":"task","preferred_view":"task_board","title":"<short task title>","description":"<full description>","priority":"low|normal|high","task_type":"shopping|todo|reminder|general","summary":"<friendly confirmation>"}

note payload:
{"intent":"note","preferred_view":"ledger_canvas","title":"<note title>","content":"<full note content>","summary":"<friendly confirmation>"}

orchestrate payload:
{"intent":"orchestrate","preferred_view":"orchestrate_progress","objective":"<full multi-step objective>","summary":"<what OmnyID is about to do>"}

web_research payload:
{"intent":"web_research","preferred_view":"search_result","query":"<cleaned search query>","summary":"<1-2 sentence overview>","bullets":["key point 1","key point 2","key point 3"],"sources":[{"title":"source name","url":"https://example.com","snippet":"brief description"}]}

travel payload:
{"intent":"travel","preferred_view":"route_card|comparison_table","title":"<route title>","description":"<route or trip context>","summary":"<friendly confirmation>","bullets":["<duration or key signal>","<distance or cost>","<mode or transfer note>","<optional tradeoff or alternative>"]}

social payload:
{"intent":"social","preferred_view":"social_composer","title":"<draft title>","description":"<what the post is about>","draft_text":"<draft body>","platforms":["LinkedIn","X","Bluesky"],"summary":"<friendly confirmation>","bullets":["<suggestion 1>","<suggestion 2>"]}

spaces payload:
{"intent":"spaces","preferred_view":"spaces","space_name":"<space name>","description":"<space purpose>","summary":"<friendly confirmation>","bullets":["<initial update 1>","<initial update 2>"]}"#;

pub fn parse_command_router_response(raw: &str, query: &str) -> Option<ParsedCommandRoute> {
    let json_str = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let parsed = serde_json::from_str::<Value>(json_str).ok()?;
    let route = parsed.get("route").cloned().unwrap_or(Value::Null);
    let payload = parsed
        .get("payload")
        .cloned()
        .unwrap_or_else(|| parsed.clone());
    let decision = build_route_decision(query, &payload, &route);
    Some(ParsedCommandRoute {
        route: decision,
        payload,
    })
}

pub fn route_metadata_json(route: &IntentRouteDecision) -> Value {
    json!({
        "primary_intent": route.primary_intent,
        "secondary_intents": route.secondary_intents,
        "route_mode": route.route_mode,
        "preferred_view": route.preferred_view,
        "requires_context": route.requires_context,
        "required_context": route.required_context,
        "missing_slots": route.missing_slots,
        "risk_level": route.risk_level,
        "requires_confirmation": route.requires_confirmation,
        "external_side_effect": route.external_side_effect,
        "context_policy": {
            "inject": route.context_policy.inject,
            "exclude": route.context_policy.exclude,
        },
        "execution_policy": {
            "mode": route.execution_policy.mode,
            "allowed_now": route.execution_policy.allowed_now,
            "blocked_until_confirmation": route.execution_policy.blocked_until_confirmation,
        },
        "audit": {
            "route_reason": route.audit.route_reason,
            "heuristics_used": route.audit.heuristics_used,
            "do_not_route_to": route.audit.do_not_route_to,
        }
    })
}

pub fn infer_route_decision(query: &str, payload: &Value) -> IntentRouteDecision {
    build_route_decision(query, payload, &Value::Null)
}

pub fn special_route_decision(
    primary_intent: &str,
    preferred_view: &str,
    route_reason: &str,
) -> IntentRouteDecision {
    IntentRouteDecision {
        primary_intent: primary_intent.to_string(),
        secondary_intents: vec![],
        route_mode: "special".to_string(),
        preferred_view: preferred_view.to_string(),
        requires_context: false,
        required_context: vec![],
        missing_slots: vec![],
        risk_level: "low".to_string(),
        requires_confirmation: false,
        external_side_effect: false,
        context_policy: IntentContextPolicy {
            inject: vec![],
            exclude: vec![
                "calendar".to_string(),
                "mood".to_string(),
                "old_email_threads".to_string(),
            ],
        },
        execution_policy: IntentExecutionPolicy {
            mode: Some("execute".to_string()),
            allowed_now: vec![],
            blocked_until_confirmation: vec![],
        },
        audit: IntentRouteAudit {
            route_reason: Some(route_reason.to_string()),
            heuristics_used: vec!["deterministic_special_route".to_string()],
            do_not_route_to: default_do_not_route_to(primary_intent),
        },
    }
}

fn build_route_decision(query: &str, payload: &Value, route: &Value) -> IntentRouteDecision {
    let primary_intent = route
        .get("primary_intent")
        .and_then(Value::as_str)
        .or_else(|| payload.get("intent").and_then(Value::as_str))
        .unwrap_or("web_research")
        .to_string();
    let preferred_view = route
        .get("preferred_view")
        .and_then(Value::as_str)
        .or_else(|| payload.get("preferred_view").and_then(Value::as_str))
        .map(str::to_string)
        .unwrap_or_else(|| default_preferred_view(&primary_intent).to_string());
    let safety_assessment = intent_safety_gate::assess_request(query, &primary_intent, payload);
    let secondary_intents = route_string_list(route.get("secondary_intents"));
    let risk_level = max_risk_level(
        route
            .get("risk_level")
            .and_then(Value::as_str)
            .unwrap_or_else(|| infer_risk_level(query)),
        safety_assessment.risk_floor,
    )
    .to_string();
    let requires_confirmation = route
        .get("requires_confirmation")
        .and_then(Value::as_bool)
        .unwrap_or_else(|| inferred_confirmation_requirement(query, &primary_intent, payload))
        || safety_assessment.requires_confirmation;
    let missing_slots = route_string_list(route.get("missing_slots"));
    let external_side_effect = route
        .get("external_side_effect")
        .and_then(Value::as_bool)
        .unwrap_or_else(|| inferred_confirmation_requirement(query, &primary_intent, payload))
        || safety_assessment.external_side_effect;

    let context_policy = context_policy_from_route(query, route);
    let execution_policy = execution_policy_from_route(
        route,
        &primary_intent,
        requires_confirmation,
        &missing_slots,
        &safety_assessment.blocked_until_confirmation,
    );
    let route_mode = route
        .get("route_mode")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| infer_route_mode(query, &primary_intent, &secondary_intents));

    let required_context = if context_policy.inject.is_empty() {
        route_string_list(route.get("required_context"))
    } else {
        context_policy.inject.clone()
    };
    let requires_context = route
        .get("requires_context")
        .and_then(Value::as_bool)
        .unwrap_or(!required_context.is_empty());

    IntentRouteDecision {
        primary_intent: primary_intent.clone(),
        secondary_intents,
        route_mode,
        preferred_view,
        requires_context,
        required_context,
        missing_slots,
        risk_level,
        requires_confirmation,
        external_side_effect,
        context_policy,
        execution_policy,
        audit: audit_from_route(
            query,
            route,
            &primary_intent,
            &safety_assessment.heuristics_used,
        ),
    }
}

fn context_policy_from_route(query: &str, route: &Value) -> IntentContextPolicy {
    let inject = route_string_list(route.pointer("/context_policy/inject"));
    let exclude = route_string_list(route.pointer("/context_policy/exclude"));
    if !inject.is_empty() || !exclude.is_empty() {
        return IntentContextPolicy { inject, exclude };
    }

    let inferred_inject = if query_depends_on_active_context(query) {
        vec!["active_document".to_string()]
    } else {
        vec![]
    };
    IntentContextPolicy {
        inject: inferred_inject,
        exclude: vec![
            "calendar".to_string(),
            "mood".to_string(),
            "old_email_threads".to_string(),
        ],
    }
}

fn execution_policy_from_route(
    route: &Value,
    primary_intent: &str,
    requires_confirmation: bool,
    missing_slots: &[String],
    safety_blocked_until_confirmation: &[String],
) -> IntentExecutionPolicy {
    let mode = route
        .pointer("/execution_policy/mode")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            if !missing_slots.is_empty() {
                Some("clarify_then_execute".to_string())
            } else if requires_confirmation {
                Some("partial_execute_then_confirm".to_string())
            } else if primary_intent == "orchestrate" {
                Some("execute".to_string())
            } else {
                None
            }
        });
    let allowed_now = route_string_list(route.pointer("/execution_policy/allowed_now"));
    let mut blocked_until_confirmation =
        route_string_list(route.pointer("/execution_policy/blocked_until_confirmation"));
    blocked_until_confirmation.extend(
        safety_blocked_until_confirmation
            .iter()
            .map(std::string::ToString::to_string),
    );
    blocked_until_confirmation.sort();
    blocked_until_confirmation.dedup();

    IntentExecutionPolicy {
        mode,
        allowed_now,
        blocked_until_confirmation,
    }
}

fn audit_from_route(
    query: &str,
    route: &Value,
    primary_intent: &str,
    safety_heuristics: &[String],
) -> IntentRouteAudit {
    let route_reason = route
        .pointer("/audit/route_reason")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| Some(default_route_reason(query, primary_intent)));
    let mut heuristics_used = route_string_list(route.pointer("/audit/heuristics_used"));
    heuristics_used.extend(
        safety_heuristics
            .iter()
            .map(std::string::ToString::to_string),
    );
    if query_depends_on_active_context(query) {
        heuristics_used.push("context_dependency_signal".to_string());
    }
    if query_has_confirmation_risk(query) {
        heuristics_used.push("side_effect_risk_gate".to_string());
    }
    heuristics_used.sort();
    heuristics_used.dedup();

    let do_not_route_to = if let Some(value) = route.pointer("/audit/do_not_route_to") {
        route_string_list(Some(value))
    } else {
        default_do_not_route_to(primary_intent)
    };

    IntentRouteAudit {
        route_reason,
        heuristics_used,
        do_not_route_to,
    }
}

fn infer_route_mode(query: &str, primary_intent: &str, secondary_intents: &[String]) -> String {
    if primary_intent == "runner_edit" || primary_intent == "dashboard_focus" {
        return "special".to_string();
    }
    if !secondary_intents.is_empty() || looks_multi_intent(query) {
        return "multi".to_string();
    }
    "single".to_string()
}

fn infer_risk_level(query: &str) -> &'static str {
    if query_has_high_risk_tokens(query) {
        "high"
    } else if query_has_confirmation_risk(query) {
        "medium"
    } else {
        "low"
    }
}

fn normalize_risk_level(level: &str) -> &'static str {
    match level {
        "high" => "high",
        "medium" => "medium",
        _ => "low",
    }
}

fn max_risk_level(left: &str, right: &str) -> &'static str {
    match (
        risk_level_rank(normalize_risk_level(left)),
        risk_level_rank(normalize_risk_level(right)),
    ) {
        (left_rank, right_rank) if left_rank >= right_rank => normalize_risk_level(left),
        _ => normalize_risk_level(right),
    }
}

fn risk_level_rank(level: &str) -> u8 {
    match normalize_risk_level(level) {
        "high" => 3,
        "medium" => 2,
        _ => 1,
    }
}

fn default_route_reason(query: &str, primary_intent: &str) -> String {
    if primary_intent == "orchestrate" && looks_multi_intent(query) {
        "The request combines multiple actions, so the master agent should stabilise intent before execution.".to_string()
    } else if query_depends_on_active_context(query) {
        format!("The request maps to {primary_intent} and depends on active workspace context.")
    } else {
        format!("The request most closely matches the {primary_intent} route.")
    }
}

fn default_do_not_route_to(primary_intent: &str) -> Vec<String> {
    match primary_intent {
        "schedule" => vec!["task".to_string(), "web_research".to_string()],
        "task" => vec!["schedule".to_string(), "web_research".to_string()],
        "note" => vec!["task".to_string()],
        "orchestrate" => vec![],
        "travel" => vec!["task".to_string()],
        "social" => vec!["web_research".to_string()],
        "spaces" => vec!["web_research".to_string()],
        _ => vec!["task".to_string()],
    }
}

fn route_string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn default_preferred_view(intent: &str) -> &'static str {
    match intent {
        "task" => "task_board",
        "note" => "ledger_canvas",
        "schedule" => "draggable_calendar",
        "orchestrate" => "orchestrate_progress",
        "travel" => "route_card",
        "social" => "social_composer",
        "spaces" => "spaces",
        _ => "search_result",
    }
}

fn query_depends_on_active_context(query: &str) -> bool {
    let lowered = query.to_ascii_lowercase();
    [
        "this",
        "that",
        "it",
        "continue",
        "same as before",
        "use the previous",
        "send it",
        "make it better",
        "the document",
        "the project",
    ]
    .iter()
    .any(|token| lowered.contains(token))
}

fn looks_multi_intent(query: &str) -> bool {
    let lowered = query.to_ascii_lowercase();
    let connectors = [" and ", " then ", " also ", " after that ", ","];
    let action_groups: &[&[&str]] = &[
        &[
            "write", "draft", "note", "document", "edit", "improve", "better",
        ],
        &["send", "email", "message", "text", "post"],
        &["search", "research", "find", "look up", "compare"],
        &["schedule", "plan", "book", "calendar"],
    ];

    let connector_hit = connectors.iter().any(|token| lowered.contains(token));
    let group_hits = action_groups
        .iter()
        .filter(|group| group.iter().any(|token| lowered.contains(token)))
        .count();
    connector_hit && group_hits >= 2
}

fn query_has_confirmation_risk(query: &str) -> bool {
    let lowered = query.to_ascii_lowercase();
    [
        "send", "email", "message", "text", "post", "book", "purchase", "buy", "pay", "delete",
        "cancel", "submit", "apply", "transfer", "contact",
    ]
    .iter()
    .any(|token| lowered.contains(token))
}

fn query_has_high_risk_tokens(query: &str) -> bool {
    let lowered = query.to_ascii_lowercase();
    ["delete", "pay", "purchase", "transfer", "cancel account"]
        .iter()
        .any(|token| lowered.contains(token))
}

fn inferred_confirmation_requirement(query: &str, primary_intent: &str, payload: &Value) -> bool {
    if matches!(primary_intent, "task" | "note" | "schedule") {
        return false;
    }
    if primary_intent == "orchestrate"
        && payload
            .get("objective")
            .and_then(Value::as_str)
            .map(|objective| objective.eq_ignore_ascii_case(query))
            .unwrap_or(false)
    {
        return query_has_confirmation_risk(query);
    }
    query_has_confirmation_risk(query)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_wrapped_router_response() {
        let parsed = parse_command_router_response(
            r#"{
              "route": {
                "primary_intent": "orchestrate",
                "secondary_intents": ["note", "social"],
                "route_mode": "multi",
                "preferred_view": "orchestrate_progress",
                "requires_context": false,
                "required_context": [],
                "missing_slots": ["recipient"],
                "risk_level": "medium",
                "requires_confirmation": true,
                "external_side_effect": true,
                "context_policy": {"inject": [], "exclude": ["calendar"]},
                "execution_policy": {"mode": "partial_execute_then_confirm", "allowed_now": ["draft_note"], "blocked_until_confirmation": ["send_message"]},
                "audit": {"route_reason": "multiple dependent actions", "heuristics_used": ["multi_action"], "do_not_route_to": ["task"]}
              },
              "payload": {
                "intent": "orchestrate",
                "preferred_view": "orchestrate_progress",
                "objective": "Draft the update and send it to John",
                "summary": "Preparing a staged workflow."
              }
            }"#,
            "Draft the update and send it to John",
        )
        .unwrap();

        assert_eq!(parsed.route.primary_intent, "orchestrate");
        assert_eq!(parsed.route.route_mode, "multi");
        assert_eq!(parsed.route.missing_slots, vec!["recipient".to_string()]);
        assert_eq!(parsed.payload["intent"].as_str(), Some("orchestrate"));
    }

    #[test]
    fn falls_back_from_legacy_payload() {
        let parsed = parse_command_router_response(
            r#"{"intent":"task","preferred_view":"task_board","title":"Buy milk","description":"Buy milk","priority":"normal","task_type":"shopping","summary":"Added to shopping list"}"#,
            "Buy milk",
        )
        .unwrap();

        assert_eq!(parsed.route.primary_intent, "task");
        assert_eq!(parsed.route.route_mode, "single");
        assert_eq!(parsed.route.preferred_view, "task_board");
        assert!(!parsed.route.requires_confirmation);
    }

    #[test]
    fn preserves_explicit_route_controls_from_wrapped_response() {
        let parsed = parse_command_router_response(
            r#"{
              "route": {
                "primary_intent": "social",
                "secondary_intents": ["web_research"],
                "route_mode": "multi",
                "preferred_view": "social_composer",
                "requires_context": true,
                "required_context": ["active_document"],
                "missing_slots": ["platform"],
                "risk_level": "medium",
                "requires_confirmation": true,
                "external_side_effect": true,
                "context_policy": {"inject": ["active_document"], "exclude": ["calendar"]},
                "execution_policy": {"mode": "clarify_then_execute", "allowed_now": ["draft_post"], "blocked_until_confirmation": ["publish_post"]},
                "audit": {"route_reason": "Draft first, then confirm where to publish.", "heuristics_used": ["social_publish_flow"], "do_not_route_to": ["task"]}
              },
              "payload": {
                "intent": "social",
                "preferred_view": "social_composer",
                "title": "Launch update",
                "summary": "Preparing a launch update"
              }
            }"#,
            "Draft a launch update from this and post it",
        )
        .unwrap();

        assert_eq!(parsed.route.primary_intent, "social");
        assert_eq!(
            parsed.route.secondary_intents,
            vec!["web_research".to_string()]
        );
        assert_eq!(parsed.route.route_mode, "multi");
        assert_eq!(
            parsed.route.required_context,
            vec!["active_document".to_string()]
        );
        assert_eq!(parsed.route.missing_slots, vec!["platform".to_string()]);
        assert_eq!(
            parsed.route.execution_policy.mode.as_deref(),
            Some("clarify_then_execute")
        );
        assert_eq!(
            parsed.route.execution_policy.allowed_now,
            vec!["draft_post".to_string()]
        );
        assert!(
            parsed
                .route
                .execution_policy
                .blocked_until_confirmation
                .contains(&"publish_post".to_string())
        );
        assert_eq!(parsed.route.audit.do_not_route_to, vec!["task".to_string()]);
    }

    #[test]
    fn infers_context_and_risk_signals() {
        let parsed = parse_command_router_response(
            r#"{"intent":"orchestrate","preferred_view":"orchestrate_progress","objective":"Make this better and send it","summary":"Working on it"}"#,
            "Make this better and send it",
        )
        .unwrap();

        assert!(parsed.route.requires_context);
        assert!(parsed.route.requires_confirmation);
        assert_eq!(parsed.route.route_mode, "multi");
    }

    #[test]
    fn infers_route_from_payload_without_wrapped_response() {
        let route = infer_route_decision(
            "add milk to my shopping list",
            &json!({
                "intent": "task",
                "preferred_view": "task_board",
                "task_type": "shopping",
                "summary": "Added to shopping list"
            }),
        );

        assert_eq!(route.primary_intent, "task");
        assert_eq!(route.route_mode, "single");
        assert!(!route.requires_confirmation);
    }

    #[test]
    fn builds_special_route_decision() {
        let route = special_route_decision(
            "runner_edit",
            "runner",
            "Deterministic runner-edit route fired.",
        );

        assert_eq!(route.primary_intent, "runner_edit");
        assert_eq!(route.route_mode, "special");
        assert_eq!(route.preferred_view, "runner");
    }

    #[test]
    fn safety_gate_raises_risk_and_blocks_send_flow() {
        let route = infer_route_decision(
            "Send the updated contract to John",
            &json!({
                "intent": "orchestrate",
                "preferred_view": "orchestrate_progress",
                "objective": "Send the updated contract to John",
            }),
        );

        assert_eq!(route.risk_level, "medium");
        assert!(route.requires_confirmation);
        assert!(route.external_side_effect);
        assert!(
            route
                .execution_policy
                .blocked_until_confirmation
                .contains(&"external_communication".to_string())
        );
        assert!(
            route
                .audit
                .heuristics_used
                .contains(&"external_communication_gate".to_string())
        );
    }

    #[test]
    fn multi_intent_query_promotes_orchestrate_route_mode() {
        let route = infer_route_decision(
            "Research the venue options and then draft a note for the team",
            &json!({
                "intent": "orchestrate",
                "preferred_view": "orchestrate_progress",
                "objective": "Research venue options and draft a team note",
                "summary": "Preparing a staged workflow"
            }),
        );

        assert_eq!(route.primary_intent, "orchestrate");
        assert_eq!(route.route_mode, "multi");
        assert!(
            route
                .audit
                .route_reason
                .as_deref()
                .unwrap_or_default()
                .contains("combines multiple actions")
        );
    }

    #[test]
    fn context_dependent_query_infers_active_document_policy() {
        let route = infer_route_decision(
            "Make this better and save it as a note",
            &json!({
                "intent": "note",
                "preferred_view": "ledger_canvas",
                "title": "Revised draft",
                "content": "Updated content",
                "summary": "Captured the revision"
            }),
        );

        assert!(route.requires_context);
        assert_eq!(route.required_context, vec!["active_document".to_string()]);
        assert!(
            route
                .audit
                .heuristics_used
                .contains(&"context_dependency_signal".to_string())
        );
    }

    #[test]
    fn permission_change_and_credentials_flow_gets_blocked_until_confirmation() {
        let route = infer_route_decision(
            "Grant admin access to Sarah and send the new credentials",
            &json!({
                "intent": "orchestrate",
                "preferred_view": "orchestrate_progress",
                "objective": "Grant admin access to Sarah and send the new credentials",
                "summary": "Preparing the access handoff"
            }),
        );

        assert_eq!(route.risk_level, "high");
        assert!(route.requires_confirmation);
        assert!(route.external_side_effect);
        assert_eq!(
            route.execution_policy.mode.as_deref(),
            Some("partial_execute_then_confirm")
        );
        assert!(
            route
                .execution_policy
                .blocked_until_confirmation
                .contains(&"permission_boundary_change".to_string())
        );
        assert!(
            route
                .execution_policy
                .blocked_until_confirmation
                .contains(&"external_communication".to_string())
        );
        assert!(
            route
                .audit
                .heuristics_used
                .contains(&"permission_boundary_gate".to_string())
        );
    }
}
