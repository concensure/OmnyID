use serde_json::Value;

use super::UiCommandResponse;

pub(super) fn preview_intent_response(
    detected_intent: &str,
    parsed: &Value,
    trimmed_query: &str,
    summary: &str,
    preferred_view: &str,
    engine: &str,
    route_meta: &Value,
) -> Option<UiCommandResponse> {
    match detected_intent {
        "social" => Some(social_response(
            parsed,
            trimmed_query,
            summary,
            preferred_view,
            engine,
            route_meta,
        )),
        "spaces" => Some(spaces_response(
            parsed,
            trimmed_query,
            summary,
            preferred_view,
            engine,
            route_meta,
        )),
        "travel" => Some(travel_response(
            parsed,
            trimmed_query,
            summary,
            preferred_view,
            engine,
            route_meta,
        )),
        _ => None,
    }
}

fn string_array(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn base_response(
    intent: &str,
    suggested_view: &str,
    preferred_view: String,
    summary: &str,
    engine: &str,
    bullets: Vec<String>,
    preview_message: crate::message::AFPMessage,
    route_meta: &Value,
) -> UiCommandResponse {
    UiCommandResponse {
        intent: intent.to_string(),
        suggested_view: suggested_view.to_string(),
        preferred_view,
        summary: summary.to_string(),
        engine: engine.to_string(),
        links: vec![],
        runner_draft: None,
        bullets,
        card_id: None,
        preview_message: Some(preview_message),
        intent_route: Some(route_meta.clone()),
        boundary: None,
        execution_explanation: None,
    }
}

fn social_response(
    parsed: &Value,
    trimmed_query: &str,
    summary: &str,
    preferred_view: &str,
    engine: &str,
    route_meta: &Value,
) -> UiCommandResponse {
    let title = parsed["title"]
        .as_str()
        .unwrap_or(trimmed_query)
        .to_string();
    let description = parsed["description"]
        .as_str()
        .unwrap_or(summary)
        .to_string();
    let draft_text = parsed["draft_text"].as_str().unwrap_or(summary).to_string();
    let platforms = parsed["platforms"].as_array().map_or_else(
        || {
            vec![
                "LinkedIn".to_string(),
                "X".to_string(),
                "Bluesky".to_string(),
            ]
        },
        |_| string_array(&parsed["platforms"]),
    );
    let bullets = string_array(&parsed["bullets"]);
    let preview_message = crate::ui_command_preview_surfaces::build_social_preview_message(
        &title,
        &description,
        &draft_text,
        &platforms,
        &bullets,
    );
    base_response(
        "social",
        "social",
        preferred_view.to_string(),
        summary,
        engine,
        bullets,
        preview_message,
        route_meta,
    )
}

fn spaces_response(
    parsed: &Value,
    trimmed_query: &str,
    summary: &str,
    preferred_view: &str,
    engine: &str,
    route_meta: &Value,
) -> UiCommandResponse {
    let space_name = parsed["space_name"]
        .as_str()
        .unwrap_or(trimmed_query)
        .to_string();
    let description = parsed["description"]
        .as_str()
        .unwrap_or(summary)
        .to_string();
    let bullets = string_array(&parsed["bullets"]);
    let preview_message = crate::ui_command_preview_surfaces::build_spaces_preview_message(
        trimmed_query,
        &description,
        &space_name,
        &bullets,
    );
    base_response(
        "spaces",
        "spaces",
        preferred_view.to_string(),
        summary,
        engine,
        bullets,
        preview_message,
        route_meta,
    )
}

fn travel_response(
    parsed: &Value,
    trimmed_query: &str,
    summary: &str,
    preferred_view: &str,
    engine: &str,
    route_meta: &Value,
) -> UiCommandResponse {
    let title = parsed["title"]
        .as_str()
        .unwrap_or(trimmed_query)
        .to_string();
    let description = parsed["description"]
        .as_str()
        .unwrap_or(summary)
        .to_string();
    let bullets = string_array(&parsed["bullets"]);
    let prefer_comparison = crate::ui_command_preview_surfaces::travel_preview_prefers_comparison(
        trimmed_query,
        Some(preferred_view),
        &bullets,
    );
    let preferred_view = if prefer_comparison {
        "comparison_table".to_string()
    } else {
        "route_card".to_string()
    };
    let preview_message = if prefer_comparison {
        crate::ui_command_preview_surfaces::build_route_comparison_preview_message(
            &title,
            &description,
            &bullets,
        )
    } else {
        crate::ui_command_preview_surfaces::build_route_card_preview_message(
            &title,
            &description,
            &bullets,
        )
    };
    base_response(
        "travel",
        "travel",
        preferred_view,
        summary,
        engine,
        bullets,
        preview_message,
        route_meta,
    )
}
