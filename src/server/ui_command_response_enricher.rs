// @locs-version: 1.0
// @module-id: server.ui-command-response-enricher
// @primary-capability: ui-command-response-enrichment
// @stability: beta

use crate::{calendar_event_profile::calendar_event_profile_from_fields, message::AFPMessage};
use serde_json::{Value, json};
use ulid::Ulid;

use super::types::UiCommandResponse;

const STUDY_QUERY_MARKERS: &[&str] = &[
    "study",
    "lecture",
    "reading",
    "revision",
    "revise",
    "exam",
    "course",
    "class",
    "tutorial",
    "slides",
    "notes",
    "week ",
    "semester",
    "assignment",
];

fn query_looks_study_oriented(query: &str) -> bool {
    let lowered = query.to_lowercase();
    STUDY_QUERY_MARKERS
        .iter()
        .any(|marker| lowered.contains(marker))
}

fn classify_study_section(item: &str) -> &'static str {
    let lowered = item.to_lowercase();
    if [
        "overlap",
        "connect",
        "link",
        "compare",
        "contrast",
        "difference",
        "similar",
        "reinforce",
        "diverge",
    ]
    .iter()
    .any(|token| lowered.contains(token))
    {
        return "overlaps";
    }
    if [
        "risk",
        "gap",
        "confus",
        "weak",
        "unclear",
        "misunder",
        "watch",
        "mistake",
        "exam trap",
    ]
    .iter()
    .any(|token| lowered.contains(token))
    {
        return "risks";
    }
    if [
        "revise",
        "review",
        "memor",
        "practice",
        "do next",
        "next",
        "focus",
        "ask",
        "quiz",
        "summarize",
        "summarise",
        "turn into",
    ]
    .iter()
    .any(|token| lowered.contains(token))
    {
        return "actions";
    }
    "concepts"
}

fn append_unique(bucket: &mut Vec<String>, item: String) {
    if !item.trim().is_empty() && !bucket.iter().any(|existing| existing == &item) {
        bucket.push(item);
    }
}

fn study_sections_for_response(query: &str, response: &UiCommandResponse) -> Vec<Value> {
    let mut concepts = Vec::new();
    let mut overlaps = Vec::new();
    let mut risks = Vec::new();
    let mut actions = Vec::new();

    if !response.summary.trim().is_empty() {
        append_unique(&mut concepts, response.summary.trim().to_string());
    }

    for bullet in &response.bullets {
        let trimmed = bullet.trim();
        if trimmed.is_empty() {
            continue;
        }
        match classify_study_section(trimmed) {
            "overlaps" => append_unique(&mut overlaps, trimmed.to_string()),
            "risks" => append_unique(&mut risks, trimmed.to_string()),
            "actions" => append_unique(&mut actions, trimmed.to_string()),
            _ => append_unique(&mut concepts, trimmed.to_string()),
        }
    }

    if concepts.is_empty() && !response.bullets.is_empty() {
        for bullet in response.bullets.iter().take(2) {
            append_unique(&mut concepts, bullet.trim().to_string());
        }
    }

    if actions.is_empty() {
        if response.bullets.len() >= 2 {
            append_unique(
                &mut actions,
                "Compare the retained sources in Linked ideas to see where the material reinforces or diverges.".to_string(),
            );
        }
        append_unique(
            &mut actions,
            "Review the retained extracted notes and turn the highest-priority concepts into a short revision checklist."
                .to_string(),
        );
    }

    if risks.is_empty() && query.to_lowercase().contains("exam") {
        append_unique(
            &mut risks,
            "Treat definitions, distinctions, and repeated examples as likely exam pressure points until a deeper comparison confirms otherwise."
                .to_string(),
        );
    }

    let mut sections = Vec::new();
    if !concepts.is_empty() {
        sections.push(json!({
            "id": "concepts",
            "title": "Main concepts",
            "items": concepts,
        }));
    }
    if !overlaps.is_empty() {
        sections.push(json!({
            "id": "overlaps",
            "title": "Connections and overlap",
            "items": overlaps,
        }));
    }
    if !risks.is_empty() {
        sections.push(json!({
            "id": "risks",
            "title": "Revision risks",
            "items": risks,
        }));
    }
    if !actions.is_empty() {
        sections.push(json!({
            "id": "actions",
            "title": "Do next",
            "items": actions,
        }));
    }
    sections
}

fn study_continuation_for_response(query: &str, response: &UiCommandResponse) -> Value {
    let lowered = query.to_lowercase();
    let zettelkasten = lowered.contains("zettelkasten");
    let multi_source = response.bullets.len() >= 2 || response.links.len() >= 2;

    if zettelkasten {
        return json!({
            "headline": "Continue this study result through a Zettelkasten workflow.",
            "detail": "This result is shaped for note-chain development, so the next step is to review source notes and continue linking ideas into stronger permanent notes.",
            "actions": [
                {
                    "id": "files",
                    "label": "Open retained sources",
                    "description": "Review the retained study sources and extracted notes in Files before continuing the note chain.",
                    "tone": "sky",
                },
                {
                    "id": "graph",
                    "label": "Open Zettelkasten view",
                    "description": "Continue through source notes, note links, and permanent-note progression.",
                    "tone": "emerald",
                }
            ]
        });
    }

    if multi_source {
        return json!({
            "headline": "Continue this study result through retained sources and Linked ideas.",
            "detail": "This result looks like multi-source study material, so the next step is to review what was retained and inspect where the sources overlap or diverge.",
            "actions": [
                {
                    "id": "files",
                    "label": "Open retained sources",
                    "description": "Review the retained extracted notes, classifications, and supertags in Files.",
                    "tone": "sky",
                },
                {
                    "id": "graph",
                    "label": "Open Linked ideas",
                    "description": "Inspect cross-source overlap, divergence, and revision gaps without hunting through folders.",
                    "tone": "violet",
                }
            ]
        });
    }

    json!({
        "headline": "Continue this study result through retained sources and the study graph.",
        "detail": "This result looks like a single grounded study source, so the next step is to review what was retained and use the graph as the source base grows.",
        "actions": [
            {
                "id": "files",
                "label": "Open retained sources",
                "description": "Review the retained extracted notes, classifications, and supertags in Files.",
                "tone": "sky",
            },
            {
                "id": "graph",
                "label": "Open linked study graph",
                "description": "Inspect the connected study graph built from retained notes, tags, and grounded concepts.",
                "tone": "violet",
            }
        ]
    })
}

fn preview_base(intent: &str) -> AFPMessage {
    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: format!("preview.{intent}.{}", Ulid::new()),
        thread_id: format!("thread.preview.{intent}"),
        parent_id: None,
        from: "omnyid://workspace/command-bar".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "agent".to_string(),
        kind: None,
        supertags: vec![],
        subtype: Some("a2ui_render".to_string()),
        content: Value::Null,
        metadata: Some(json!({
            "origin": "workspace_command_preview",
            "intent": intent,
        })),
        signature: String::new(),
        encryption: None,
        views: vec![],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: false,
        prev_hash: None,
    }
}

fn merge_preview_metadata(response: &UiCommandResponse, base: Option<Value>) -> Option<Value> {
    let mut metadata = base.unwrap_or_else(|| json!({}));
    if let Some(obj) = metadata.as_object_mut() {
        obj.insert(
            "preferred_view".to_string(),
            Value::String(response.preferred_view.clone()),
        );
        if let Some(route) = response.intent_route.clone() {
            obj.insert("intent_route".to_string(), route);
        }
        if let Some(boundary) = response.boundary.clone() {
            obj.insert("boundary".to_string(), boundary);
        }
        if let Some(execution_explanation) = response.execution_explanation.clone() {
            obj.insert("execution_explanation".to_string(), execution_explanation);
        }
    }
    Some(metadata)
}

fn web_research_preview_message(query: &str, response: &UiCommandResponse) -> AFPMessage {
    let mut message = preview_base("web_research");
    let study_like = query_looks_study_oriented(query);
    let study_sections = if study_like {
        study_sections_for_response(query, response)
    } else {
        Vec::new()
    };
    let study_continuation = if study_like {
        Some(study_continuation_for_response(query, response))
    } else {
        None
    };
    let source_links: Vec<Value> = response
        .links
        .iter()
        .map(|link| {
            json!({
                "title": link.title,
                "url": link.url,
                "snippet": link.kind,
                "origin": link.origin,
            })
        })
        .collect();
    let bullet_rows = response
        .bullets
        .iter()
        .map(|item| json!([item]))
        .collect::<Vec<_>>();
    let source_items = source_links
        .iter()
        .map(|item| {
            json!({
                "title": item["title"].as_str().unwrap_or(item["url"].as_str().unwrap_or("Link")),
                "url": item["url"].as_str().unwrap_or_default(),
                "subtitle": item["snippet"].as_str().unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();
    let mut nodes = vec![json!({
        "id": "search-summary",
        "type": "callout",
        "props": {
            "tone": if study_like { "strategy" } else { "info" },
            "title": if study_like {
                if query.is_empty() { "Study result" } else { "Study synthesis" }
            } else if query.is_empty() { "Research result" } else { "Research summary" },
            "body": response.summary,
        }
    })];
    if study_like && !study_sections.is_empty() {
        let section_rows = study_sections
            .iter()
            .filter_map(|section| {
                let title = section.get("title").and_then(Value::as_str)?;
                let items = section
                    .get("items")
                    .and_then(Value::as_array)
                    .map(|values| {
                        values
                            .iter()
                            .filter_map(Value::as_str)
                            .take(2)
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                    .unwrap_or_default();
                Some(json!([title, items]))
            })
            .collect::<Vec<_>>();
        if !section_rows.is_empty() {
            nodes.push(json!({
                "id": "study-sections",
                "type": "table",
                "props": {
                    "columns": ["Section", "Focus"],
                    "rows": section_rows,
                    "caption": "Grounded study structure",
                }
            }));
        }
    }
    if let Some(continuation) = &study_continuation {
        let action_rows = continuation
            .get("actions")
            .and_then(Value::as_array)
            .map(|actions| {
                actions
                    .iter()
                    .filter_map(|action| {
                        Some(json!([
                            action.get("label").and_then(Value::as_str)?,
                            action
                                .get("description")
                                .and_then(Value::as_str)
                                .unwrap_or_default(),
                        ]))
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if !action_rows.is_empty() {
            nodes.push(json!({
                "id": "study-continuation",
                "type": "table",
                "props": {
                    "columns": ["Next action", "Why"],
                    "rows": action_rows,
                    "caption": "Continue from this result",
                }
            }));
        }
    }
    if !bullet_rows.is_empty() {
        nodes.push(json!({
            "id": "search-bullets",
            "type": "table",
            "props": {
                "columns": ["Key points"],
                "rows": bullet_rows,
                "caption": if study_like { "Grounded study highlights" } else { "Research highlights" },
            }
        }));
    }
    if !source_items.is_empty() {
        nodes.push(json!({
            "id": "search-sources",
            "type": "link_list",
            "props": {
                "title": "Sources",
                "items": source_items,
            }
        }));
    }
    let companion = json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": if query.is_empty() {
            "Search result".to_string()
        } else {
            format!("Search result for \"{query}\"")
        },
        "description": "Structured research view companion for the current search result.",
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": nodes,
    });
    let content = json!({
        "kind": "web_research",
        "query": query,
        "summary": response.summary,
        "bullets": response.bullets,
        "sources": source_links,
        "study_result": study_like,
        "study_section_count": study_sections.len(),
        "study_sections": study_sections,
        "study_continuation": study_continuation,
    });
    message.r#type = "research".to_string();
    message.subtype = Some("content".to_string());
    message.content = content.clone();
    message.views = vec![
        json!({
            "format": "search_result",
            "priority": 100,
            "content": content,
        }),
        json!({
            "format": "a2ui.v1",
            "priority": 80,
            "content": companion,
        }),
    ];
    message
}

fn generic_panel_preview_message(query: &str, response: &UiCommandResponse) -> AFPMessage {
    let mut message = preview_base(&response.intent);
    let content = json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": if query.is_empty() { "Command result" } else { query },
        "description": response.summary,
        "components": [
            {
                "type": "callout",
                "props": {
                    "tone": "neutral",
                    "title": response.intent,
                    "body": response.summary,
                }
            }
        ]
    });
    message.content = content.clone();
    message.views = vec![json!({
        "format": "a2ui.v1",
        "priority": 100,
        "content": content,
    })];
    message
}

fn schedule_preview_event(title: &str, summary: &str, start_at: &str, index: usize) -> Value {
    let description = if summary.trim().is_empty() {
        None
    } else {
        Some(summary)
    };
    let profile = calendar_event_profile_from_fields(title, description, None, false);
    let note_kind = profile
        .get("schedule_note_kind")
        .and_then(Value::as_str)
        .unwrap_or("high_stakes_prep");
    let prep_lead_minutes = profile
        .get("prep_lead_minutes")
        .and_then(Value::as_i64)
        .unwrap_or(45);
    json!({
        "id": format!("preview-event-{index}"),
        "title": title,
        "start": start_at,
        "description": summary,
        "status": "tentative",
        "note_kind": note_kind,
        "prep_lead_minutes": prep_lead_minutes,
        "profile": profile,
    })
}

fn runner_edit_preview_message(query: &str, response: &UiCommandResponse) -> AFPMessage {
    let mut message = preview_base("runner_edit");
    let title = if query.is_empty() {
        "Runner draft".to_string()
    } else {
        format!("Runner draft for \"{query}\"")
    };
    let draft = response.runner_draft.as_ref();
    let target_file = draft
        .map(|item| item.target_file_id.as_str())
        .unwrap_or("runner_chat_py");
    let review_required = draft
        .map(|item| {
            if item.requires_confirmation {
                "Required"
            } else {
                "Optional"
            }
        })
        .unwrap_or("Optional");
    let code_title = if target_file.ends_with("_json") {
        "Draft code (json)"
    } else if target_file.ends_with("_txt") {
        "Draft code (text)"
    } else {
        "Draft code (python)"
    };
    let code_language = if target_file.ends_with("_json") {
        "json"
    } else if target_file.ends_with("_txt") {
        "text"
    } else {
        "python"
    };
    let code = draft.map(|item| item.content.as_str()).unwrap_or_default();
    let checklist_rows = if response.bullets.is_empty() {
        vec![
            json!(["Review the generated patch before applying it"]),
            json!(["Confirm tool and policy changes before redeploying"]),
            json!(["Run a test or dry-run after saving the draft"]),
        ]
    } else {
        response.bullets.iter().map(|item| json!([item])).collect()
    };
    let content = json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": title,
        "description": "The agent prepared a safe, review-first Python runner draft with clear next steps before execution.",
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": [
            {
                "id": "runner-edit-summary",
                "type": "callout",
                "props": {
                    "tone": "strategy",
                    "title": "Runner draft ready for review",
                    "body": response.summary,
                }
            },
            {
                "id": "runner-edit-stats",
                "type": "stats_grid",
                "props": {
                    "items": [
                        {"label": "Target file", "value": target_file},
                        {"label": "Review", "value": review_required},
                        {"label": "Workspace", "value": "Python runner"},
                    ]
                }
            },
            {
                "id": "runner-edit-workflow",
                "type": "section",
                "props": {
                    "title": "Suggested workflow",
                    "layout": {"type": "stack", "gap": "sm"},
                },
                "children": [
                    {
                        "id": "runner-edit-checklist",
                        "type": "table",
                        "props": {
                            "columns": ["Review checklist"],
                            "rows": checklist_rows,
                            "caption": "Safe editing flow",
                        }
                    },
                    {
                        "id": "runner-edit-tip",
                        "type": "text",
                        "props": {
                            "label": "Tip",
                            "value": "Keep the command bar open while reviewing the draft so the agent can revise the code in place before you save it.",
                        }
                    }
                ]
            },
            {
                "id": "runner-edit-code",
                "type": "code",
                "props": {
                    "title": code_title,
                    "language": code_language,
                    "code": code,
                }
            }
        ]
    });
    message.subtype = Some("runner_editor".to_string());
    message.content = content.clone();
    message.views = vec![json!({
        "format": "a2ui.v1",
        "priority": 100,
        "content": content,
    })];
    message
}

fn dashboard_focus_preview_message(query: &str, response: &UiCommandResponse) -> AFPMessage {
    let mut message = preview_base("dashboard_focus");
    let title = if query.is_empty() {
        "Workspace focus".to_string()
    } else {
        format!("Workspace focus for \"{query}\"")
    };
    let bullet_rows = if response.bullets.is_empty() {
        vec![
            json!([
                "Recent messages",
                "See the latest agent output and thread activity."
            ]),
            json!([
                "Agent status",
                "Check running, idle, and blocked agents at a glance."
            ]),
            json!([
                "Runtime health",
                "Inspect runner state, logs, and recent changes."
            ]),
        ]
    } else {
        response
            .bullets
            .iter()
            .map(|item| json!([item, "Suggested workspace focus"]))
            .collect()
    };
    let content = json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": title,
        "description": "Pivot the workspace toward recent agent output, runtime health, and the next useful control surface.",
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": [
            {
                "id": "dashboard-focus-summary",
                "type": "callout",
                "props": {
                    "tone": "info",
                    "title": "Dashboard focus ready",
                    "body": response.summary,
                }
            },
            {
                "id": "dashboard-focus-stats",
                "type": "stats_grid",
                "props": {
                    "items": [
                        {"label": "Primary view", "value": "Dashboard"},
                        {"label": "Status panel", "value": "Agent fleet"},
                        {"label": "Detail view", "value": "Threads and runtime"},
                    ]
                }
            },
            {
                "id": "dashboard-focus-guidance",
                "type": "section",
                "props": {
                    "title": "Suggested pivots",
                    "layout": {"type": "stack", "gap": "sm"},
                },
                "children": [
                    {
                        "id": "dashboard-focus-table",
                        "type": "table",
                        "props": {
                            "columns": ["Focus area", "What happens"],
                            "rows": bullet_rows,
                            "caption": "High-value next views",
                        }
                    },
                    {
                        "id": "dashboard-focus-tip",
                        "type": "text",
                        "props": {
                            "label": "Tip",
                            "value": "Use the agent status panel to jump from green completed tasks to orange in-progress work before opening the full thread view.",
                        }
                    }
                ]
            }
        ]
    });
    message.subtype = Some("dashboard_panel".to_string());
    message.content = content.clone();
    message.views = vec![json!({
        "format": "a2ui.v1",
        "priority": 100,
        "content": content,
    })];
    message
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum OrchestrationGate {
    None,
    Clarification,
    Approval,
}

fn objective_requires_human_confirmation(objective: &str) -> bool {
    let lowered = objective.to_lowercase();
    [
        "send",
        "email",
        "book",
        "purchase",
        "buy",
        "pay",
        "delete",
        "cancel",
        "message someone",
        "contact",
        "submit",
        "apply",
        "transfer",
    ]
    .iter()
    .any(|token| lowered.contains(token))
}

fn objective_needs_clarification(objective: &str) -> bool {
    let lowered = objective.to_lowercase();
    let ambiguity_tokens = [
        "this",
        "that",
        "something",
        "someone",
        "somebody",
        "it",
        "things",
        "stuff",
        "sort it out",
        "handle it",
    ];
    let broad_action_tokens = ["organise", "organize", "manage", "plan", "handle", "set up"];

    ambiguity_tokens.iter().any(|token| lowered.contains(token))
        || (lowered.split_whitespace().count() <= 4
            && broad_action_tokens
                .iter()
                .any(|token| lowered.contains(token)))
}

fn classify_orchestration_gate(objective: &str) -> OrchestrationGate {
    if objective_requires_human_confirmation(objective) {
        OrchestrationGate::Approval
    } else if objective_needs_clarification(objective) {
        OrchestrationGate::Clarification
    } else {
        OrchestrationGate::None
    }
}

fn orchestration_gate_value(gate: OrchestrationGate) -> &'static str {
    match gate {
        OrchestrationGate::None => "none",
        OrchestrationGate::Clarification => "clarification",
        OrchestrationGate::Approval => "approval",
    }
}

fn clarification_prompt_for_objective(objective: &str) -> Value {
    let lowered = objective.to_lowercase();

    if [
        "schedule",
        "calendar",
        "study",
        "day",
        "week",
        "deadline",
        "timetable",
    ]
    .iter()
    .any(|token| lowered.contains(token))
    {
        json!({
            "question": "What should OmnyID optimise for first in this schedule?",
            "context": "This request sounds schedule-heavy. Choosing a priority helps the agent decide whether to protect deep work, chase deadlines, or anchor around fixed commitments.",
            "options": [
                {
                    "id": "proceed_with_assumptions",
                    "label": "Prioritise deadlines",
                    "description": "Bias the plan toward urgent assignments, exams, and due dates.",
                    "pros": ["Best when something important is due soon", "Reduces deadline risk"],
                    "cons": ["May create a more intense day"],
                    "is_default": true
                },
                {
                    "id": "proceed_with_energy_first",
                    "label": "Prioritise energy and focus",
                    "description": "Protect deep-work blocks and place lighter tasks around them.",
                    "pros": ["More sustainable", "Better for cognitively demanding work"],
                    "cons": ["Some lower-priority deadlines may slip"]
                },
                {
                    "id": "cancel_for_clarification",
                    "label": "Cancel for now",
                    "description": "Wait until I provide more specific scheduling constraints."
                }
            ]
        })
    } else if [
        "research",
        "compare",
        "find",
        "look up",
        "summarise",
        "summary",
        "analyze",
        "analyse",
    ]
    .iter()
    .any(|token| lowered.contains(token))
    {
        json!({
            "question": "How far should OmnyID go with this research task?",
            "context": "This request sounds open-ended. Picking a stopping point helps the agent avoid over-collecting or jumping too quickly into recommendations.",
            "options": [
                {
                    "id": "proceed_with_assumptions",
                    "label": "Give me a concise summary",
                    "description": "Return the most relevant findings with links and a short recommendation.",
                    "pros": ["Fastest", "Lowest noise"],
                    "cons": ["May skip edge cases"],
                    "is_default": true
                },
                {
                    "id": "proceed_with_deep_research",
                    "label": "Do a deeper comparison",
                    "description": "Spend more effort comparing tradeoffs, caveats, and alternatives.",
                    "pros": ["More thorough", "Better for decisions with tradeoffs"],
                    "cons": ["Slower response", "More tokens and browsing"]
                },
                {
                    "id": "cancel_for_clarification",
                    "label": "Cancel for now",
                    "description": "Wait until I narrow the research goal."
                }
            ]
        })
    } else if [
        "budget",
        "finance",
        "money",
        "spend",
        "portfolio",
        "invest",
        "expense",
    ]
    .iter()
    .any(|token| lowered.contains(token))
    {
        json!({
            "question": "Which finance lens should OmnyID use first?",
            "context": "Finance-related tasks can optimise for caution, savings, or upside. A clear lens keeps the plan aligned with your risk tolerance.",
            "options": [
                {
                    "id": "proceed_with_assumptions",
                    "label": "Be conservative",
                    "description": "Prioritise risk reduction, cash preservation, and clear explanations.",
                    "pros": ["Safer default", "Easy to review"],
                    "cons": ["May miss higher-upside options"],
                    "is_default": true
                },
                {
                    "id": "proceed_with_growth_focus",
                    "label": "Look for upside",
                    "description": "Explore stronger optimisations and higher-return options, while still explaining risks.",
                    "pros": ["More ambitious", "Better for opportunity scouting"],
                    "cons": ["May require more validation"]
                },
                {
                    "id": "cancel_for_clarification",
                    "label": "Cancel for now",
                    "description": "Wait until I specify the outcome I want."
                }
            ]
        })
    } else {
        json!({
            "question": "This objective is still a bit underspecified. Should OmnyID proceed with best-effort assumptions?",
            "context": "Use this when you want the agent to draft a reasonable plan first, rather than waiting for a more specific request.",
            "options": [
                {
                    "id": "proceed_with_assumptions",
                    "label": "Proceed with assumptions",
                    "description": "Start with a sensible best-effort plan.",
                    "is_default": true
                },
                {
                    "id": "cancel_for_clarification",
                    "label": "Cancel for now",
                    "description": "Do nothing until I give a more specific goal."
                }
            ]
        })
    }
}

fn orchestrate_card_sections(
    summary: &str,
    objective: &str,
    gate: OrchestrationGate,
) -> Vec<Value> {
    let mut sections = vec![
        json!({
            "id": "progress",
            "type": "progress",
            "order": 1,
            "status": "streaming",
            "content": {
                "text": "Planning the orchestration steps and allocating agent work",
                "pct": 15
            }
        }),
        json!({
            "id": "plan",
            "type": "canvas",
            "order": 2,
            "status": "complete",
            "content": {
                "title": "Agent plan",
                "text": summary,
                "a2ui": {
                    "schema_version": "a2ui.v1",
                    "kind": "panel",
                    "layout": {"type": "stack", "gap": "md"},
                    "nodes": [
                        {
                            "id": "orchestrate-plan-callout",
                            "type": "callout",
                            "props": {
                                "tone": "strategy",
                                "title": "Execution plan",
                                "body": summary,
                            }
                        },
                        {
                            "id": "orchestrate-plan-note",
                            "type": "text",
                            "props": {
                                "label": "Planning summary",
                                "value": "This is the current orchestration plan before execution completes.",
                            }
                        }
                    ]
                }
            }
        }),
    ];

    if gate == OrchestrationGate::Approval {
        sections.push(json!({
            "id": "approval_gate",
            "type": "decision_point",
            "order": 3,
            "status": "awaiting_input",
            "content": {
                "id": "approval_gate",
                "category": "confirmation",
                "question": "This orchestration may trigger external actions. Do you want the agent to proceed?",
                "context": "Approval is required before OmnyID starts bookings, purchases, outbound messages, deletions, or other higher-risk actions.",
                "options": [
                    {
                        "id": "confirm_orchestration",
                        "label": "Proceed",
                        "description": "Start the orchestration now.",
                        "is_default": true
                    },
                    {
                        "id": "cancel_orchestration",
                        "label": "Cancel",
                        "description": "Keep the task paused and do nothing."
                    }
                ]
            }
        }));
    } else if gate == OrchestrationGate::Clarification {
        let clarification = clarification_prompt_for_objective(objective);
        sections.push(json!({
            "id": "clarification_gate",
            "type": "decision_point",
            "order": 3,
            "status": "awaiting_input",
            "content": {
                "id": "clarification_gate",
                "category": "clarification",
                "question": clarification["question"].clone(),
                "context": clarification["context"].clone(),
                "options": clarification["options"].clone()
            }
        }));
    }

    sections
}

fn orchestration_companion_a2ui_content(
    query: &str,
    summary: &str,
    card_id: &str,
    gate: OrchestrationGate,
) -> Value {
    let gate_label = match gate {
        OrchestrationGate::None => "None",
        OrchestrationGate::Clarification => "Clarification",
        OrchestrationGate::Approval => "Approval",
    };
    let gate_explainer = match gate {
        OrchestrationGate::None => {
            "The orchestrator can begin immediately with the current objective."
        }
        OrchestrationGate::Clarification => {
            "The orchestrator needs one planning preference before it commits to the next path."
        }
        OrchestrationGate::Approval => {
            "The orchestrator detected a higher-risk action boundary and will wait for approval."
        }
    };

    json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": if query.is_empty() {
            "Orchestration preview".to_string()
        } else {
            format!("Orchestration preview for \"{query}\"")
        },
        "description": "Structured companion view for the orchestration card, useful for inspectors and alternate renderers.",
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": [
            {
                "id": "orchestrate-summary",
                "type": "callout",
                "props": {
                    "tone": if gate == OrchestrationGate::Approval { "warning" } else if gate == OrchestrationGate::Clarification { "strategy" } else { "info" },
                    "title": "Orchestration ready",
                    "body": summary,
                }
            },
            {
                "id": "orchestrate-stats",
                "type": "stats_grid",
                "props": {
                    "items": [
                        {"label": "Card", "value": card_id},
                        {"label": "Gate", "value": gate_label},
                        {"label": "Status", "value": "streaming"},
                    ]
                }
            },
            {
                "id": "orchestrate-guidance",
                "type": "section",
                "props": {
                    "title": "Execution posture",
                    "layout": {"type": "stack", "gap": "sm"},
                },
                "children": [
                    {
                        "id": "orchestrate-gate-note",
                        "type": "text",
                        "props": {
                            "label": "Gate behavior",
                            "value": gate_explainer,
                        }
                    },
                    {
                        "id": "orchestrate-next-steps",
                        "type": "table",
                        "props": {
                            "columns": ["Next step", "Purpose"],
                            "rows": match gate {
                                OrchestrationGate::None => vec![
                                    json!(["Plan the run", "Break the objective into structured tasks."]),
                                    json!(["Start execution", "Begin the first safe step immediately."]),
                                ],
                                OrchestrationGate::Clarification => vec![
                                    json!(["Ask for a preference", "Resolve ambiguity before execution starts."]),
                                    json!(["Lock the strategy", "Resume with the selected planning mode."]),
                                ],
                                OrchestrationGate::Approval => vec![
                                    json!(["Wait for approval", "Do not cross the action boundary prematurely."]),
                                    json!(["Resume only if approved", "Continue in the same card after confirmation."]),
                                ],
                            },
                            "caption": "Expected flow",
                        }
                    }
                ]
            }
        ]
    })
}

fn orchestrate_preview_message(query: &str, response: &UiCommandResponse) -> AFPMessage {
    let mut message = preview_base("orchestrate");
    let card_id = response
        .card_id
        .clone()
        .unwrap_or_else(|| format!("card.preview.{}", Ulid::new()));
    let gate = classify_orchestration_gate(query);
    let content = json!({
        "kind": "orchestration",
        "card_id": card_id,
        "query": query,
        "status": "streaming",
        "optimization_mode": "balanced",
        "provider": "omnyid",
        "model": "",
        "gate": orchestration_gate_value(gate),
        "sections": orchestrate_card_sections(&response.summary, query, gate),
    });
    let companion = orchestration_companion_a2ui_content(
        query,
        &response.summary,
        content["card_id"].as_str().unwrap_or_default(),
        gate,
    );
    message.subtype = Some("orchestration_card".to_string());
    message.content = content.clone();
    message.metadata = Some(json!({
        "origin": "workspace_command_preview",
        "intent": response.intent,
        "gate": orchestration_gate_value(gate),
    }));
    message.views = vec![
        json!({
            "format": "generative_card",
            "priority": 100,
            "content": content,
        }),
        json!({
            "format": "a2ui.v1",
            "priority": 80,
            "content": companion,
        }),
    ];
    message
}

pub(super) fn preview_message_for_response(
    query: &str,
    response: &UiCommandResponse,
) -> AFPMessage {
    if response.intent == "social" || response.preferred_view == "social_composer" {
        return crate::ui_command_preview_surfaces::build_social_preview_message(
            if query.is_empty() {
                "Social post draft"
            } else {
                query
            },
            &response.summary,
            response
                .bullets
                .first()
                .map(String::as_str)
                .unwrap_or(&response.summary),
            &[
                "LinkedIn".to_string(),
                "X".to_string(),
                "Bluesky".to_string(),
            ],
            &response.bullets,
        );
    }
    if response.intent == "spaces" || response.preferred_view == "spaces" {
        return crate::ui_command_preview_surfaces::build_spaces_preview_message(
            query,
            &response.summary,
            if query.is_empty() {
                "Space overview"
            } else {
                query
            },
            &response.bullets,
        );
    }
    if response.intent == "travel"
        || response.preferred_view == "route_card"
        || response.preferred_view == "comparison_table"
    {
        let prefer_comparison =
            crate::ui_command_preview_surfaces::travel_preview_prefers_comparison(
                query,
                Some(response.preferred_view.as_str()),
                &response.bullets,
            );
        return if prefer_comparison {
            crate::ui_command_preview_surfaces::build_route_comparison_preview_message(
                query,
                &response.summary,
                &response.bullets,
            )
        } else {
            crate::ui_command_preview_surfaces::build_route_card_preview_message(
                query,
                &response.summary,
                &response.bullets,
            )
        };
    }
    if response.intent == "note" || response.preferred_view == "ledger_canvas" {
        let mut message = preview_base("note");
        let content = json!({
            "kind": "workspace_note",
            "title": if query.is_empty() { "Note" } else { query },
            "blocks": [{"type": "paragraph", "text": response.summary}],
        });
        message.r#type = "note".to_string();
        message.subtype = Some("content".to_string());
        message.content = content.clone();
        message.views = vec![json!({
            "format": "canvas",
            "priority": 100,
            "content": content,
        })];
        return message;
    }
    if response.intent == "task" || response.preferred_view == "task_board" {
        let mut message = preview_base("task");
        let first_bullet = response.bullets.first().cloned().unwrap_or_default();
        let description = if response.summary == first_bullet || first_bullet.is_empty() {
            response.summary.clone()
        } else {
            format!("{}\n{}", response.summary, first_bullet)
        };
        let content = json!({
            "kind": "task_preview",
            "title": if query.is_empty() { "Task" } else { query },
            "description": description,
            "priority": "normal",
            "task_type": "general",
            "status": "pending",
        });
        message.r#type = "task".to_string();
        message.subtype = Some("card".to_string());
        message.content = content.clone();
        message.views = vec![json!({
            "format": "task_card",
            "priority": 100,
            "content": content,
        })];
        return message;
    }
    if response.intent == "schedule" || response.preferred_view == "draggable_calendar" {
        let mut message = preview_base("schedule");
        let preview_start_at = chrono::Utc::now().to_rfc3339();
        let events = response
            .bullets
            .iter()
            .enumerate()
            .map(|(idx, bullet)| {
                schedule_preview_event(bullet, &response.summary, &preview_start_at, idx)
            })
            .collect::<Vec<_>>();
        let content = json!({
            "kind": "schedule_plan",
            "title": if query.is_empty() { "Schedule preview" } else { query },
            "description": response.summary,
            "events": events,
        });
        message.r#type = "calendar".to_string();
        message.subtype = Some("plan".to_string());
        message.content = content.clone();
        message.views = vec![json!({
            "format": "calendar",
            "priority": 100,
            "content": content,
        })];
        return message;
    }
    if response.intent == "web_research" || response.preferred_view == "search_result" {
        return web_research_preview_message(query, response);
    }
    if response.intent == "orchestrate" || response.preferred_view == "orchestrate_progress" {
        return orchestrate_preview_message(query, response);
    }
    if response.intent == "runner_edit" {
        return runner_edit_preview_message(query, response);
    }
    if response.intent == "dashboard_focus" {
        return dashboard_focus_preview_message(query, response);
    }
    generic_panel_preview_message(query, response)
}

pub(super) fn finalize_ui_command_response(
    query: &str,
    mut response: UiCommandResponse,
) -> UiCommandResponse {
    if response.preview_message.is_none() {
        response.preview_message = Some(preview_message_for_response(query, &response));
    }
    let merged_metadata = response
        .preview_message
        .as_ref()
        .map(|preview| merge_preview_metadata(&response, preview.metadata.clone()));
    if let (Some(preview), Some(metadata)) = (response.preview_message.as_mut(), merged_metadata) {
        preview.metadata = metadata;
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_response(intent: &str, preferred_view: &str) -> UiCommandResponse {
        UiCommandResponse {
            intent: intent.to_string(),
            suggested_view: preferred_view.to_string(),
            preferred_view: preferred_view.to_string(),
            summary: "Preview summary".to_string(),
            engine: "omnyid".to_string(),
            links: vec![],
            runner_draft: None,
            bullets: vec![],
            card_id: None,
            preview_message: None,
            intent_route: None,
            boundary: None,
            execution_explanation: None,
        }
    }

    #[test]
    fn finalize_generates_comparison_preview_for_travel_compare_requests() {
        let mut response = base_response("travel", "comparison_table");
        response.bullets = vec![
            "Car: 24 min".to_string(),
            "Train: 31 min".to_string(),
            "Bike: 42 min".to_string(),
        ];

        let finalized =
            finalize_ui_command_response("compare routes from home to office", response);

        let preview = finalized
            .preview_message
            .expect("preview should be generated");
        let view_content = &preview.views[0]["content"];
        assert_eq!(view_content["components"][0]["type"], "comparison_table");
    }

    #[test]
    fn finalize_generates_web_research_preview_with_legacy_shape() {
        let mut response = base_response("web_research", "search_result");
        response.summary = "Tomorrow looks mild with a chance of showers.".to_string();
        response.links = vec![super::super::types::UiCommandLink {
            title: "Forecast".to_string(),
            url: "https://example.com/weather".to_string(),
            kind: "source".to_string(),
            origin: Some("external".to_string()),
        }];
        response.bullets = vec!["Bring an umbrella".to_string()];

        let finalized = finalize_ui_command_response("Sydney weather tomorrow", response);

        let preview = finalized
            .preview_message
            .expect("preview should be generated");
        assert_eq!(preview.r#type, "research");
        assert_eq!(preview.subtype.as_deref(), Some("content"));
        assert_eq!(preview.content["kind"].as_str(), Some("web_research"));
        assert_eq!(preview.views.len(), 2);
        assert_eq!(preview.views[0]["format"].as_str(), Some("search_result"));
        assert_eq!(preview.views[1]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(
            preview.content["sources"][0]["origin"].as_str(),
            Some("external")
        );
        assert_eq!(
            preview.views[1]["content"]["schema_version"].as_str(),
            Some("a2ui.v1")
        );
    }

    #[test]
    fn finalize_generates_explicit_study_sections_for_study_like_search_results() {
        let mut response = base_response("web_research", "search_result");
        response.summary = "Week 3 focuses on opportunity cost and market failure.".to_string();
        response.bullets = vec![
            "Compare the lecture explanation with the assigned reading to see where the examples overlap.".to_string(),
            "A likely exam risk is confusing market failure with simple price changes.".to_string(),
            "Revise the core definitions and practice one short contrast answer.".to_string(),
        ];

        let finalized = finalize_ui_command_response(
            "Summarize this week 3 economics lecture and tell me what to revise for the exam",
            response,
        );

        let preview = finalized
            .preview_message
            .expect("preview should be generated");
        assert_eq!(preview.content["study_result"].as_bool(), Some(true));
        assert_eq!(preview.content["study_section_count"].as_u64(), Some(4));
        assert_eq!(
            preview.content["study_sections"][0]["id"].as_str(),
            Some("concepts")
        );
        assert_eq!(
            preview.content["study_sections"][1]["id"].as_str(),
            Some("overlaps")
        );
        assert_eq!(
            preview.content["study_sections"][2]["id"].as_str(),
            Some("risks")
        );
        assert_eq!(
            preview.content["study_sections"][3]["id"].as_str(),
            Some("actions")
        );
        assert_eq!(
            preview.views[1]["content"]["nodes"][1]["props"]["caption"].as_str(),
            Some("Grounded study structure")
        );
        assert_eq!(
            preview.content["study_continuation"]["actions"][0]["id"].as_str(),
            Some("files")
        );
        assert_eq!(
            preview.content["study_continuation"]["actions"][1]["label"].as_str(),
            Some("Open Linked ideas")
        );
        assert_eq!(
            preview.views[1]["content"]["nodes"][2]["props"]["caption"].as_str(),
            Some("Continue from this result")
        );
    }

    #[test]
    fn finalize_generates_runner_edit_preview_with_legacy_shape() {
        let mut response = base_response("runner_edit", "runner");
        response.summary = "Prepared a review-first draft for the runner file.".to_string();
        response.runner_draft = Some(super::super::types::UiRunnerDraftResponse {
            target_file_id: "runner_chat_py".to_string(),
            title: "Runner patch".to_string(),
            content: "print('patched')".to_string(),
            requires_confirmation: true,
        });
        response.bullets = vec!["Validate the policy changes".to_string()];

        let finalized = finalize_ui_command_response("Update the Python runner template", response);

        let preview = finalized
            .preview_message
            .expect("preview should be generated");
        assert_eq!(preview.r#type, "agent");
        assert_eq!(preview.subtype.as_deref(), Some("runner_editor"));
        assert_eq!(preview.views[0]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(
            preview.content["title"].as_str(),
            Some("Runner draft for \"Update the Python runner template\"")
        );
        assert_eq!(
            preview.content["nodes"].as_array().map(|v| v.len()),
            Some(4)
        );
    }

    #[test]
    fn finalize_generates_dashboard_focus_preview_with_legacy_shape() {
        let mut response = base_response("dashboard_focus", "search");
        response.summary =
            "The workspace can pivot to agent output, runtime health, and recent threads."
                .to_string();
        response.bullets = vec!["Recent messages".to_string(), "Runtime health".to_string()];

        let finalized = finalize_ui_command_response("Show dashboard health", response);

        let preview = finalized
            .preview_message
            .expect("preview should be generated");
        assert_eq!(preview.r#type, "agent");
        assert_eq!(preview.subtype.as_deref(), Some("dashboard_panel"));
        assert_eq!(preview.views[0]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(preview.content["kind"].as_str(), Some("panel"));
        assert_eq!(
            preview.content["nodes"].as_array().map(|v| v.len()),
            Some(3)
        );
    }

    #[test]
    fn finalize_generates_schedule_preview_with_calendar_semantics() {
        let mut response = base_response("schedule", "draggable_calendar");
        response.summary =
            "Protected prep time before the final launch review is recommended.".to_string();
        response.bullets = vec!["Launch review block".to_string()];

        let finalized =
            finalize_ui_command_response("Protect time for the launch review", response);

        let preview = finalized
            .preview_message
            .expect("preview should be generated");
        assert_eq!(preview.r#type, "calendar");
        assert_eq!(preview.subtype.as_deref(), Some("plan"));
        assert_eq!(preview.views[0]["format"].as_str(), Some("calendar"));
        let event = &preview.content["events"][0];
        assert_eq!(event["status"].as_str(), Some("tentative"));
        assert!(event["note_kind"].as_str().is_some());
        assert!(event["prep_lead_minutes"].as_i64().is_some());
        assert!(event["profile"]["schedule_anchor_type"].as_str().is_some());
        assert!(event["profile"]["schedule_note_kind"].as_str().is_some());
    }

    #[test]
    fn finalize_generates_orchestrate_preview_with_legacy_shape() {
        let mut response = base_response("orchestrate", "orchestrate_progress");
        response.summary =
            "I will break this into planning, scheduling, and follow-up steps.".to_string();

        let finalized = finalize_ui_command_response("Organise my study week", response);

        let preview = finalized
            .preview_message
            .expect("preview should be generated");
        assert_eq!(preview.r#type, "agent");
        assert_eq!(preview.subtype.as_deref(), Some("orchestration_card"));
        assert_eq!(preview.views[0]["format"].as_str(), Some("generative_card"));
        assert_eq!(preview.views[1]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(preview.content["kind"].as_str(), Some("orchestration"));
        assert_eq!(preview.content["status"].as_str(), Some("streaming"));
        assert_eq!(
            preview.content["sections"].as_array().map(|v| v.len()),
            Some(3)
        );
    }

    #[test]
    fn finalize_generates_orchestrate_approval_gate() {
        let mut response = base_response("orchestrate", "orchestrate_progress");
        response.summary = "This may trigger bookings and outbound messages.".to_string();

        let finalized =
            finalize_ui_command_response("Book a restaurant and message the group", response);

        let preview = finalized
            .preview_message
            .expect("preview should be generated");
        let sections = preview.content["sections"]
            .as_array()
            .expect("sections array");
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[2]["type"].as_str(), Some("decision_point"));
        assert_eq!(sections[2]["content"]["id"].as_str(), Some("approval_gate"));
    }

    #[test]
    fn finalize_generates_orchestrate_clarification_gate() {
        let mut response = base_response("orchestrate", "orchestrate_progress");
        response.summary = "This objective still needs one planning assumption.".to_string();

        let finalized = finalize_ui_command_response("Organise this", response);

        let preview = finalized
            .preview_message
            .expect("preview should be generated");
        let sections = preview.content["sections"]
            .as_array()
            .expect("sections array");
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[2]["type"].as_str(), Some("decision_point"));
        assert_eq!(
            sections[2]["content"]["id"].as_str(),
            Some("clarification_gate")
        );
        assert_eq!(
            sections[2]["content"]["category"].as_str(),
            Some("clarification")
        );
    }

    #[test]
    fn finalize_preserves_existing_preview_message() {
        let mut response = base_response("task", "task_board");
        let existing = preview_base("custom");
        let existing_id = existing.id.clone();
        response.preview_message = Some(existing);

        let finalized = finalize_ui_command_response("buy milk", response);

        let preview = finalized
            .preview_message
            .expect("existing preview should remain");
        assert_eq!(preview.id, existing_id);
    }

    #[test]
    fn finalize_merges_route_metadata_into_existing_preview_metadata() {
        let mut response = base_response("task", "task_board");
        let mut existing = preview_base("custom");
        existing.metadata = Some(json!({
            "origin": "custom_preview",
            "custom_flag": true,
        }));
        response.preview_message = Some(existing);
        response.intent_route = Some(json!({
            "primary_intent": "task",
            "route_mode": "single",
        }));
        response.boundary = Some(json!({
            "kind": "safe",
        }));
        response.execution_explanation = Some(json!({
            "summary": "No approval required",
        }));

        let finalized = finalize_ui_command_response("buy milk", response);
        let preview = finalized
            .preview_message
            .expect("existing preview should remain");
        let metadata = preview.metadata.expect("metadata should be present");

        assert_eq!(metadata["origin"], "custom_preview");
        assert_eq!(metadata["custom_flag"], true);
        assert_eq!(metadata["preferred_view"], "task_board");
        assert_eq!(metadata["intent_route"]["primary_intent"], "task");
        assert_eq!(metadata["boundary"]["kind"], "safe");
        assert_eq!(
            metadata["execution_explanation"]["summary"],
            "No approval required"
        );
    }

    #[test]
    fn finalize_injects_route_metadata_into_preview_message() {
        let mut response = base_response("task", "task_board");
        response.intent_route = Some(json!({"primary_intent": "task", "route_mode": "single"}));
        response.boundary = Some(json!({"kind": "safe"}));
        response.execution_explanation = Some(json!({"summary": "No approval required"}));

        let finalized = finalize_ui_command_response("buy milk", response);
        let preview = finalized
            .preview_message
            .expect("preview should be generated");
        let metadata = preview.metadata.expect("metadata should be present");

        assert_eq!(metadata["intent_route"]["primary_intent"], "task");
        assert_eq!(metadata["boundary"]["kind"], "safe");
        assert_eq!(
            metadata["execution_explanation"]["summary"],
            "No approval required"
        );
    }

    #[test]
    fn finalize_carries_blocked_orchestration_metadata_into_preview() {
        let mut response = base_response("orchestrate", "orchestrate_progress");
        response.summary = "Multi-step orchestration requires a server API key.".to_string();
        response.bullets = vec![
            "Go to Agent Settings and add your API key to enable full orchestration.".to_string(),
        ];
        response.intent_route = Some(json!({
            "primary_intent": "orchestrate",
            "route_mode": "multi",
            "secondary_intents": ["task", "note"],
        }));
        response.execution_explanation = Some(json!({
            "mode": "server_llm_required",
            "reason": "Browser-classified orchestration stays blocked until a server-side LLM is configured."
        }));

        let finalized = finalize_ui_command_response("plan and create follow-up tasks", response);
        let preview = finalized
            .preview_message
            .expect("preview should be generated");
        let metadata = preview.metadata.expect("metadata should be present");

        assert_eq!(preview.views[0]["format"].as_str(), Some("generative_card"));
        assert_eq!(preview.views[1]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(metadata["intent_route"]["primary_intent"], "orchestrate");
        assert_eq!(metadata["intent_route"]["route_mode"], "multi");
        assert_eq!(
            metadata["execution_explanation"]["mode"],
            "server_llm_required"
        );
    }
}
