/*
 * @module-id: rust.server.ui-command-zero-token
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub(super) struct ZeroTokenRouteHint {
    pub(super) intent: &'static str,
    pub(super) preferred_view: &'static str,
    pub(super) suggested_view: &'static str,
    pub(super) summary: String,
    pub(super) bullets: Vec<String>,
    pub(super) payload: Value,
    pub(super) route_reason: &'static str,
    pub(super) heuristics_used: Vec<String>,
}

pub(super) fn classify_zero_token_signal(query: &str) -> Option<ZeroTokenRouteHint> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return None;
    }

    classify_schedule(trimmed)
        .or_else(|| classify_task(trimmed))
        .or_else(|| classify_note(trimmed))
        .or_else(|| classify_travel(trimmed))
        .or_else(|| classify_social(trimmed))
        .or_else(|| classify_spaces(trimmed))
}

fn classify_schedule(query: &str) -> Option<ZeroTokenRouteHint> {
    let lowered = query.to_ascii_lowercase();
    let prefixes = [
        "/schedule ",
        "/calendar ",
        "schedule: ",
        "calendar: ",
        "add to calendar ",
        "block time for ",
    ];
    let recurring = ["plan my day", "schedule my day", "plan tomorrow"];
    let subject = strip_prefixes(query, &prefixes).or_else(|| {
        recurring
            .iter()
            .find(|token| lowered == **token)
            .map(|_| query.to_string())
    })?;
    let description = subject.trim().to_string();
    Some(ZeroTokenRouteHint {
        intent: "schedule",
        preferred_view: "draggable_calendar",
        suggested_view: "calendar",
        summary: if description.eq_ignore_ascii_case(query) {
            "Prepared a schedule planning surface.".to_string()
        } else {
            format!("Prepared a schedule planning surface for {description}.")
        },
        bullets: vec![
            "Calendar intent matched without needing model routing.".to_string(),
            "You can refine time blocks after the planner opens.".to_string(),
        ],
        payload: json!({
            "intent": "schedule",
            "preferred_view": "draggable_calendar",
            "title": compact_title(&description, "Schedule request"),
            "description": description,
            "summary": "Prepared a schedule planning surface.",
            "slots": [],
        }),
        route_reason: "A zero-token schedule signal matched a direct calendar planning command.",
        heuristics_used: vec![
            "zero_token_command_signal".to_string(),
            "zero_token_schedule_signal".to_string(),
        ],
    })
}

fn classify_task(query: &str) -> Option<ZeroTokenRouteHint> {
    let lowered = query.to_ascii_lowercase();
    let prefixes = [
        "/task ",
        "/todo ",
        "task: ",
        "todo: ",
        "new task ",
        "create task ",
        "add to my shopping list ",
        "add to shopping list ",
        "remind me to ",
    ];
    let subject = strip_prefixes(query, &prefixes)?;
    let task_type = if lowered.contains("shopping list") || lowered.starts_with("buy ") {
        "shopping"
    } else if lowered.starts_with("remind me to ") {
        "reminder"
    } else {
        "general"
    };
    let description = subject.trim().to_string();
    Some(ZeroTokenRouteHint {
        intent: "task",
        preferred_view: "task_board",
        suggested_view: "search",
        summary: format!("Prepared a task capture for {description}."),
        bullets: vec![
            "Task shortcut matched without invoking the model.".to_string(),
            "You can adjust priority or type after capture.".to_string(),
        ],
        payload: json!({
            "intent": "task",
            "preferred_view": "task_board",
            "title": compact_title(&description, "Task"),
            "description": description,
            "priority": "normal",
            "task_type": task_type,
            "summary": "Prepared a task capture.",
        }),
        route_reason: "A zero-token task shortcut matched a direct task or reminder command.",
        heuristics_used: vec![
            "zero_token_command_signal".to_string(),
            "zero_token_task_signal".to_string(),
        ],
    })
}

fn classify_note(query: &str) -> Option<ZeroTokenRouteHint> {
    let prefixes = [
        "/note ",
        "/memo ",
        "note: ",
        "memo: ",
        "capture note ",
        "new note ",
        "jot down ",
    ];
    let subject = strip_prefixes(query, &prefixes)?;
    let content = subject.trim().to_string();
    Some(ZeroTokenRouteHint {
        intent: "note",
        preferred_view: "ledger_canvas",
        suggested_view: "search",
        summary: format!("Prepared a ledger note capture for {content}."),
        bullets: vec![
            "Note shortcut matched without model routing.".to_string(),
            "The note surface can expand this into structured blocks.".to_string(),
        ],
        payload: json!({
            "intent": "note",
            "preferred_view": "ledger_canvas",
            "title": compact_title(&content, "Quick note"),
            "content": content,
            "summary": "Prepared a ledger note capture.",
        }),
        route_reason: "A zero-token note shortcut matched a direct capture command.",
        heuristics_used: vec![
            "zero_token_command_signal".to_string(),
            "zero_token_note_signal".to_string(),
        ],
    })
}

fn classify_travel(query: &str) -> Option<ZeroTokenRouteHint> {
    let lowered = query.to_ascii_lowercase();
    let compare_prefixes = ["/compare route ", "compare route ", "compare routes "];
    if let Some(subject) = strip_prefixes(query, &compare_prefixes) {
        let description = subject.trim().to_string();
        return Some(ZeroTokenRouteHint {
            intent: "travel",
            preferred_view: "comparison_table",
            suggested_view: "search",
            summary: format!("Prepared a route comparison for {description}."),
            bullets: vec![
                "Comparison shortcut matched without model routing.".to_string(),
                "The travel surface can compare multiple modes from the same query.".to_string(),
            ],
            payload: json!({
                "intent": "travel",
                "preferred_view": "comparison_table",
                "title": compact_title(&description, "Route comparison"),
                "description": description,
                "summary": "Prepared a route comparison.",
                "bullets": [],
            }),
            route_reason:
                "A zero-token travel comparison command matched a direct route-comparison phrase.",
            heuristics_used: vec![
                "zero_token_command_signal".to_string(),
                "zero_token_travel_compare_signal".to_string(),
            ],
        });
    }

    let route_prefixes = ["/travel ", "/route ", "route: ", "directions to "];
    let subject = strip_prefixes(query, &route_prefixes)
        .or_else(|| lowered.strip_prefix("how do i get to ").map(str::to_string));
    if let Some(subject) = subject {
        let description = subject.trim().to_string();
        return Some(ZeroTokenRouteHint {
            intent: "travel",
            preferred_view: "route_card",
            suggested_view: "search",
            summary: format!("Prepared a route lookup for {description}."),
            bullets: vec![
                "Travel shortcut matched without model routing.".to_string(),
                "The route card can be upgraded to comparison mode if needed.".to_string(),
            ],
            payload: json!({
                "intent": "travel",
                "preferred_view": "route_card",
                "title": compact_title(&description, "Route"),
                "description": description,
                "summary": "Prepared a route lookup.",
                "bullets": [],
            }),
            route_reason: "A zero-token travel signal matched a direct directions request.",
            heuristics_used: vec![
                "zero_token_command_signal".to_string(),
                "zero_token_travel_signal".to_string(),
            ],
        });
    }

    classify_trip_planning(query)
}

fn classify_trip_planning(query: &str) -> Option<ZeroTokenRouteHint> {
    let lowered = query.to_ascii_lowercase();
    let travel_noun = ["trip", "travel", "holiday", "vacation", "itinerary"]
        .iter()
        .any(|term| lowered.contains(term));
    let planning_verb = ["plan", "planning", "organise", "organize", "visit"]
        .iter()
        .any(|term| lowered.contains(term));
    // A compact trip request has enough structure to be useful even when the
    // opening verb is omitted or has a small typo (for example "lan a family
    // trip ... to Tokyo from Sydney for 5 days").
    let trip_shape = lowered.contains(" to ")
        && lowered.contains(" from ")
        && (lowered.contains(" day") || lowered.contains("family") || lowered.contains("toddler"));
    if !travel_noun || (!planning_verb && !trip_shape) {
        return None;
    }

    let destination = travel_segment_after(&lowered, query, " to ")
        .and_then(|value| travel_segment_before(&value, " from "))
        .unwrap_or_else(|| "your destination".to_string());
    let origin = travel_segment_after(&lowered, query, " to ")
        .and_then(|value| travel_segment_after(&value.to_ascii_lowercase(), &value, " from "))
        .and_then(|value| travel_segment_before(&value, " for "))
        .unwrap_or_else(|| "your departure city".to_string());
    let days =
        travel_duration_label(&lowered).unwrap_or_else(|| "a flexible number of days".to_string());
    let start = travel_start_label(&lowered, query);
    let travellers = if lowered.contains("toddler") || lowered.contains("under 2") {
        "Family pace: 2 adults and a toddler"
    } else if lowered.contains("family") {
        "Family-friendly pace"
    } else {
        "Traveller details can be refined before booking"
    };
    let timing = start
        .as_deref()
        .map(|date| format!("{days}, starting {date}"))
        .unwrap_or_else(|| days.clone());
    let title = format!("Family trip: {origin} to {destination}");
    let summary =
        format!("Prepared a practical {days} travel plan from {origin} to {destination}.");
    let bullets = vec![
        format!("Trip: {origin} to {destination}"),
        format!("Timing: {timing}"),
        travellers.to_string(),
        "Day 1: arrive, check in, and keep the first outing short and close to the hotel.".to_string(),
        "Middle days: group nearby sights into one area each day, with a stroller-friendly rest break after lunch.".to_string(),
        "Final day: keep one flexible activity, then allow a generous airport-transfer buffer.".to_string(),
        "Before booking: compare flights with bassinet/seat policies, confirm cot or crib availability, and check entry requirements and travel insurance.".to_string(),
    ];
    Some(ZeroTokenRouteHint {
        intent: "travel",
        preferred_view: "route_card",
        suggested_view: "search",
        summary: summary.clone(),
        bullets: bullets.clone(),
        payload: json!({
            "intent": "travel",
            "preferred_view": "route_card",
            "title": title,
            "description": summary,
            "summary": summary,
            "bullets": bullets,
        }),
        route_reason: "A natural-language trip-planning request matched the travel planner before web-search fallback.",
        heuristics_used: vec![
            "zero_token_travel_planning_signal".to_string(),
            "travel_intent_before_web_search".to_string(),
        ],
    })
}

fn travel_segment_after(lowered: &str, original: &str, marker: &str) -> Option<String> {
    let index = lowered.find(marker)? + marker.len();
    Some(original[index..].trim().to_string())
}

fn travel_segment_before(value: &str, marker: &str) -> Option<String> {
    let lowered = value.to_ascii_lowercase();
    let end = lowered.find(marker).unwrap_or(value.len());
    let candidate = value[..end]
        .split([',', ';', '.'])
        .next()
        .unwrap_or("")
        .trim();
    (!candidate.is_empty()).then(|| candidate.to_string())
}

fn travel_duration_label(lowered: &str) -> Option<String> {
    let words = lowered.split_whitespace().collect::<Vec<_>>();
    words.windows(2).find_map(|pair| {
        let count = pair[0].trim_matches(|character: char| !character.is_ascii_digit());
        (pair[1].starts_with("day") && !count.is_empty()).then(|| format!("{count} days"))
    })
}

fn travel_start_label(lowered: &str, original: &str) -> Option<String> {
    let marker = " from ";
    let index = lowered.rfind(marker)? + marker.len();
    let candidate = original[index..]
        .split([',', ';', '.'])
        .next()
        .unwrap_or("")
        .trim();
    if candidate
        .chars()
        .any(|character| character.is_ascii_digit())
    {
        Some(candidate.to_string())
    } else {
        None
    }
}

fn classify_social(query: &str) -> Option<ZeroTokenRouteHint> {
    let lowered = query.to_ascii_lowercase();
    let prefixes = [
        "/post ",
        "/social ",
        "post: ",
        "draft a post about ",
        "write a post about ",
    ];
    let subject = strip_prefixes(query, &prefixes).or_else(|| {
        lowered
            .strip_prefix("draft a linkedin post about ")
            .map(str::to_string)
    })?;
    let draft_text = subject.trim().to_string();
    Some(ZeroTokenRouteHint {
        intent: "social",
        preferred_view: "social_composer",
        suggested_view: "social",
        summary: format!("Prepared a social draft for {draft_text}."),
        bullets: vec![
            "Social drafting shortcut matched without model routing.".to_string(),
            "You can tune tone and platforms after the composer opens.".to_string(),
        ],
        payload: json!({
            "intent": "social",
            "preferred_view": "social_composer",
            "title": compact_title(&draft_text, "Social draft"),
            "description": draft_text,
            "draft_text": query.trim(),
            "platforms": ["LinkedIn", "X", "Bluesky"],
            "summary": "Prepared a social draft.",
            "bullets": [],
        }),
        route_reason: "A zero-token social drafting shortcut matched a direct post command.",
        heuristics_used: vec![
            "zero_token_command_signal".to_string(),
            "zero_token_social_signal".to_string(),
        ],
    })
}

fn classify_spaces(query: &str) -> Option<ZeroTokenRouteHint> {
    let prefixes = [
        "/space ",
        "/war-room ",
        "space: ",
        "open a space for ",
        "create a space for ",
    ];
    let subject = strip_prefixes(query, &prefixes)?;
    let space_name = compact_title(subject.trim(), "New space");
    Some(ZeroTokenRouteHint {
        intent: "spaces",
        preferred_view: "spaces",
        suggested_view: "spaces",
        summary: format!("Prepared a collaboration space for {space_name}."),
        bullets: vec![
            "Space shortcut matched without model routing.".to_string(),
            "The space feed can be filled in once the workspace opens.".to_string(),
        ],
        payload: json!({
            "intent": "spaces",
            "preferred_view": "spaces",
            "space_name": space_name,
            "description": query.trim(),
            "summary": "Prepared a collaboration space.",
            "bullets": [],
        }),
        route_reason: "A zero-token collaboration shortcut matched a direct space-opening command.",
        heuristics_used: vec![
            "zero_token_command_signal".to_string(),
            "zero_token_space_signal".to_string(),
        ],
    })
}

fn strip_prefixes(query: &str, prefixes: &[&str]) -> Option<String> {
    let trimmed = query.trim();
    let lowered = trimmed.to_ascii_lowercase();
    prefixes.iter().find_map(|prefix| {
        lowered
            .strip_prefix(&prefix.to_ascii_lowercase())
            .map(|remainder| remainder.trim().to_string())
            .filter(|remainder| !remainder.is_empty())
    })
}

fn compact_title(input: &str, fallback: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return fallback.to_string();
    }
    let mut title = trimmed.to_string();
    if title.len() > 72 {
        title.truncate(72);
        title.push_str("...");
    }
    title
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_task_shortcut() {
        let hint = classify_zero_token_signal("/task buy oat milk").expect("task hint");
        assert_eq!(hint.intent, "task");
        assert_eq!(hint.preferred_view, "task_board");
    }

    #[test]
    fn classifies_travel_comparison_shortcut() {
        let hint =
            classify_zero_token_signal("compare routes home to airport").expect("travel hint");
        assert_eq!(hint.intent, "travel");
        assert_eq!(hint.preferred_view, "comparison_table");
    }

    #[test]
    fn turns_natural_language_family_trip_planning_into_a_travel_plan() {
        let hint = classify_zero_token_signal(
            "plan a family trip (2 adults, 1 toddler under 2 years old) to Tokyo from Sydney, for 5 days, from 12th Oct 2026",
        )
        .expect("travel planning hint");

        assert_eq!(hint.intent, "travel");
        assert_eq!(hint.preferred_view, "route_card");
        assert!(hint.summary.contains("Sydney to Tokyo"));
        assert!(hint
            .bullets
            .iter()
            .any(|item| item.contains("12th Oct 2026")));
        assert!(hint.bullets.iter().any(|item| item.starts_with("Day 1:")));
    }

    #[test]
    fn classifies_schedule_planning_phrase() {
        let hint = classify_zero_token_signal("plan my day").expect("schedule hint");
        assert_eq!(hint.intent, "schedule");
        assert_eq!(hint.preferred_view, "draggable_calendar");
        assert!(hint
            .heuristics_used
            .contains(&"zero_token_schedule_signal".to_string()));
    }

    #[test]
    fn classifies_social_shortcut() {
        let hint = classify_zero_token_signal("draft a LinkedIn post about OmnyID launch")
            .expect("social hint");
        assert_eq!(hint.intent, "social");
        assert_eq!(hint.preferred_view, "social_composer");
        assert_eq!(hint.suggested_view, "social");
    }

    #[test]
    fn classifies_spaces_shortcut() {
        let hint = classify_zero_token_signal("open a space for launch prep").expect("spaces hint");
        assert_eq!(hint.intent, "spaces");
        assert_eq!(hint.preferred_view, "spaces");
        assert!(hint
            .heuristics_used
            .contains(&"zero_token_space_signal".to_string()));
    }

    #[test]
    fn ignores_plain_web_queries_without_signal_prefix() {
        assert!(classify_zero_token_signal("what is the weather in sydney").is_none());
    }
}
