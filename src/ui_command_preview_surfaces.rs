/*
 * @module-id: rust.ui-command-preview-surfaces
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use crate::{message::AFPMessage, ui_surface_messages};
use serde_json::json;

pub fn travel_preview_prefers_comparison(
    query: &str,
    preferred_view: Option<&str>,
    bullets: &[String],
) -> bool {
    if matches!(preferred_view, Some("comparison_table")) {
        return true;
    }
    let lower = query.to_lowercase();
    let comparison_terms = [
        "compare",
        "comparison",
        "best",
        "better",
        "options",
        "alternatives",
        "cheapest",
        "fastest",
        "versus",
        "vs",
    ];
    if comparison_terms.iter().any(|term| lower.contains(term)) {
        return true;
    }
    bullets.len() >= 4
}

pub fn build_social_preview_message(
    query: &str,
    summary: &str,
    draft_text: &str,
    platforms: &[String],
    suggestions: &[String],
) -> AFPMessage {
    let title = if query.is_empty() {
        "Social post draft".to_string()
    } else {
        query.to_string()
    };
    let suggestion_values = suggestions
        .iter()
        .map(|item| json!(item))
        .collect::<Vec<_>>();
    let preview_values = platforms
        .iter()
        .map(|platform| {
            json!({
                "platform": platform,
                "body": draft_text,
                "status": "Preview",
            })
        })
        .collect::<Vec<_>>();
    ui_surface_messages::build_social_surface_message(
        "workspace_command_preview",
        &title,
        summary,
        draft_text,
        platforms,
        &suggestion_values,
        &preview_values,
    )
}

pub fn build_spaces_preview_message(
    query: &str,
    summary: &str,
    space_name: &str,
    bullets: &[String],
) -> AFPMessage {
    let title = if query.is_empty() {
        "Space overview".to_string()
    } else {
        query.to_string()
    };
    let members = vec![
        json!({"name": "Master Agent", "role": "host"}),
        json!({"name": "You", "role": "member"}),
    ];
    let messages = bullets
        .iter()
        .enumerate()
        .map(|(idx, bullet)| {
            json!({
                "author": if idx == 0 { "Master Agent" } else { "Space member" },
                "body": bullet,
                "type": "update",
                "timestamp": chrono::Utc::now().to_rfc3339(),
            })
        })
        .collect::<Vec<_>>();
    ui_surface_messages::build_space_feed_surface_message(
        "workspace_command_preview",
        &title,
        summary,
        if space_name.is_empty() {
            &title
        } else {
            space_name
        },
        None,
        &members,
        &messages,
        true,
    )
}

pub fn build_route_card_preview_message(
    query: &str,
    summary: &str,
    bullets: &[String],
) -> AFPMessage {
    let title = if query.is_empty() {
        "Suggested route".to_string()
    } else {
        query.to_string()
    };
    let itinerary = bullets
        .first()
        .is_some_and(|item| item.starts_with("Trip: "))
        && bullets
            .get(1)
            .is_some_and(|item| item.starts_with("Timing: "));
    let metrics = if itinerary {
        vec![
            json!({"label": "Trip", "value": bullets[0].trim_start_matches("Trip: ")}),
            json!({"label": "Timing", "value": bullets[1].trim_start_matches("Timing: ")}),
            json!({"label": "Travellers", "value": bullets.get(2).cloned().unwrap_or_else(|| "Traveller details to confirm".to_string())}),
        ]
    } else {
        vec![
            json!({"label": "Duration", "value": bullets.first().cloned().unwrap_or_else(|| "18 mins".to_string())}),
            json!({"label": "Distance", "value": bullets.get(1).cloned().unwrap_or_else(|| "6.2 km".to_string())}),
            json!({"label": "Transfers", "value": bullets.get(2).cloned().unwrap_or_else(|| "Direct".to_string())}),
        ]
    };
    let tradeoffs = bullets
        .iter()
        .skip(3)
        .take(if itinerary { 4 } else { 2 })
        .map(|item| {
            json!({
                "title": if itinerary { "Plan" } else { "Trade-off" },
                "body": item,
            })
        })
        .collect::<Vec<_>>();
    let assumptions = if itinerary {
        vec![
            "This is a draft itinerary, not live flight, hotel, or entry-requirement advice."
                .to_string(),
        ]
    } else {
        vec!["Live traffic may change.".to_string()]
    };
    let notes = if itinerary {
        vec![
            "Confirm availability, child-travel requirements, and bookings before committing."
                .to_string(),
        ]
    } else {
        vec!["Preview generated from command intent.".to_string()]
    };
    let actions = vec!["copy".to_string(), "share".to_string()];
    ui_surface_messages::build_route_card_surface_message(
        "workspace_command_preview",
        &title,
        summary,
        None,
        &metrics,
        &tradeoffs,
        &assumptions,
        &notes,
        &actions,
        Some(0.74),
        Some(&format!("{title}: {summary}")),
        None,
    )
}

pub fn build_route_comparison_preview_message(
    query: &str,
    summary: &str,
    bullets: &[String],
) -> AFPMessage {
    let title = if query.is_empty() {
        "Route comparison".to_string()
    } else {
        query.to_string()
    };
    let rows = if bullets.is_empty() {
        vec![
            json!({"label": "Duration", "values": ["18 mins", "26 mins", "41 mins"], "winner": false, "note": "Lower is better"}),
            json!({"label": "Cost", "values": ["$12", "$4", "$0"], "winner": false}),
            json!({"label": "Reliability", "values": ["Medium", "High", "High"], "winner": false}),
        ]
    } else {
        bullets
            .iter()
            .enumerate()
            .map(|(index, bullet)| {
                json!({
                    "label": format!("Signal {}", index + 1),
                    "values": [bullet, "Alternative A", "Alternative B"],
                    "winner": false,
                })
            })
            .collect::<Vec<_>>()
    };
    ui_surface_messages::build_comparison_table_surface_message(
        "workspace_command_preview",
        &title,
        summary,
        &[
            "Primary".to_string(),
            "Option A".to_string(),
            "Option B".to_string(),
        ],
        &rows,
    )
}

#[cfg(test)]
mod tests {
    use super::{
        build_route_card_preview_message, build_route_comparison_preview_message,
        build_social_preview_message, build_spaces_preview_message,
        travel_preview_prefers_comparison,
    };

    #[test]
    fn social_preview_uses_social_composer_component() {
        let message = build_social_preview_message(
            "Draft a launch update",
            "Prepared a social draft.",
            "We shipped the release.",
            &["LinkedIn".to_string(), "X".to_string()],
            &["Tone: confident".to_string()],
        );
        assert_eq!(message.r#type, "agent");
        assert_eq!(message.subtype.as_deref(), Some("a2ui_render"));
        assert_eq!(
            message.content["components"][0]["type"].as_str(),
            Some("social_composer")
        );
    }

    #[test]
    fn spaces_preview_uses_space_feed_component() {
        let message = build_spaces_preview_message(
            "Open a product war room",
            "Prepared a shared space preview.",
            "Product war room",
            &["Kickoff note".to_string(), "First backlog item".to_string()],
        );
        assert_eq!(
            message.content["components"][0]["type"].as_str(),
            Some("space_feed")
        );
    }

    #[test]
    fn route_card_preview_uses_route_card_component() {
        let message = build_route_card_preview_message(
            "Fastest commute",
            "Prepared a route preview.",
            &["18 mins".to_string(), "6.2 km".to_string()],
        );
        assert_eq!(
            message.content["components"][0]["type"].as_str(),
            Some("route_card")
        );
    }

    #[test]
    fn route_comparison_preview_uses_comparison_table_component() {
        let message = build_route_comparison_preview_message(
            "Compare commute options",
            "Prepared a route comparison.",
            &["Fastest overall".to_string()],
        );
        assert_eq!(
            message.content["components"][0]["type"].as_str(),
            Some("comparison_table")
        );
    }

    #[test]
    fn travel_preview_prefers_comparison_for_compare_queries() {
        assert!(travel_preview_prefers_comparison(
            "Compare the fastest commute options",
            None,
            &[],
        ));
    }

    #[test]
    fn travel_preview_prefers_comparison_for_rich_bullets() {
        assert!(travel_preview_prefers_comparison(
            "Route preview",
            None,
            &[
                "Fastest route".to_string(),
                "Cheapest option".to_string(),
                "Least walking".to_string(),
                "Best reliability".to_string(),
            ],
        ));
    }

    #[test]
    fn travel_preview_prefers_card_for_simple_queries() {
        assert!(!travel_preview_prefers_comparison(
            "Get me to the airport",
            Some("route_card"),
            &["18 mins".to_string(), "6.2 km".to_string()],
        ));
    }
}
