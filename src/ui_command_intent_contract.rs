/*
 * @module-id: rust.ui-command-intent-contract
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub const COMMAND_ROUTER_SYSTEM_PROMPT: &str = crate::intent_routing::COMMAND_ROUTER_SYSTEM_PROMPT;

pub fn preferred_view_for_intent(intent: &str) -> &'static str {
    match intent {
        "task" => "task_board",
        "note" => "ledger_canvas",
        "schedule" => "draggable_calendar",
        "orchestrate" => "orchestrate_progress",
        "web_research" => "search_result",
        "travel" => "route_card",
        "social" => "social_composer",
        "spaces" => "spaces",
        "runner_edit" => "runner",
        "dashboard_focus" => "search",
        _ => "search_result",
    }
}

#[cfg(test)]
mod tests {
    use super::preferred_view_for_intent;

    #[test]
    fn preferred_view_defaults_cover_extended_intents() {
        assert_eq!(preferred_view_for_intent("travel"), "route_card");
        assert_eq!(preferred_view_for_intent("social"), "social_composer");
        assert_eq!(preferred_view_for_intent("spaces"), "spaces");
        assert_eq!(preferred_view_for_intent("note"), "ledger_canvas");
    }
}
