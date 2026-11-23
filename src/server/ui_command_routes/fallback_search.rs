use super::{AppState, UiCommandLink, UiCommandResponse};

pub(super) async fn fallback_search_response(
    state: &AppState,
    user_id: &str,
    trimmed_query: &str,
    base: &UiCommandResponse,
) -> Option<UiCommandResponse> {
    if base.intent != "web_search" {
        return None;
    }

    let query = trimmed_query.to_string();
    let ddg_results = super::super::ui_command_research::fetch_ddg_results(&query).await;
    super::super::ui_command_research::record_duckduckgo_usage(
        &state.db,
        user_id,
        &query,
        ddg_results.len(),
    )
    .await;
    if ddg_results.is_empty() {
        return None;
    }

    let (summary, bullets, mut links) =
        super::super::ui_command_research::fallback_from_ddg(&ddg_results);
    let route_meta =
        crate::intent_routing::route_metadata_json(&crate::intent_routing::infer_route_decision(
            trimmed_query,
            &serde_json::json!({
                "intent": "web_research",
                "preferred_view": "search_result",
                "query": query.clone(),
                "summary": summary.clone(),
            }),
        ));
    links.push(UiCommandLink {
        title: format!("Search: {query}"),
        url: super::super::ui_command_router_core::search_engine_url(&base.engine, &query),
        kind: "search".to_string(),
        origin: Some("external".to_string()),
    });

    Some(UiCommandResponse {
        intent: "web_research".to_string(),
        suggested_view: "search".to_string(),
        preferred_view: crate::ui_command_intent_contract::preferred_view_for_intent(
            "web_research",
        )
        .to_string(),
        summary,
        engine: base.engine.clone(),
        links,
        runner_draft: None,
        bullets,
        card_id: None,
        preview_message: None,
        intent_route: Some(route_meta),
        boundary: None,
        execution_explanation: None,
    })
}
