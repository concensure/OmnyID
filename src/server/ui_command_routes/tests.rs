use super::command_router_system_prompt_with_skill_guidance;

#[test]
fn command_router_prompt_stays_unchanged_without_skill_guidance() {
    let base = "Base router prompt";
    assert_eq!(
        command_router_system_prompt_with_skill_guidance(base, &[]),
        base
    );
}

#[test]
fn command_router_prompt_appends_selected_skill_guidance() {
    let prompt = command_router_system_prompt_with_skill_guidance(
        "Base router prompt",
        &[
            "Use grounded reasoning.".to_string(),
            "Run a brief reflection pass.".to_string(),
        ],
    );

    assert!(prompt.contains("Base router prompt"));
    assert!(prompt.contains("# Enabled workspace reasoning guidance"));
    assert!(prompt.contains("- Use grounded reasoning."));
    assert!(prompt.contains("- Run a brief reflection pass."));
}

#[test]
fn ui_command_route_requires_authenticated_user_and_has_no_optional_auth_fallback() {
    let source = include_str!("../ui_command_routes.rs");
    let start = source
        .find("pub(super) async fn ui_command_http(")
        .expect("ui_command_http exists");
    let end = source[start..]
        .find("\n    // Browser AI path")
        .map(|offset| start + offset)
        .expect("browser fallback follows ui_command_http");
    let function_source = &source[start..end];

    assert!(function_source.contains("let user = authenticated_user(&state.db, &headers).await?;"));
    assert!(!function_source.contains("optional_authenticated_user(&state.db, &headers)"));
    assert!(!function_source.contains("if let Some(ref user) = opt_user"));
    assert!(source.contains("handle_browser_classified_route("));
    assert!(source.contains("&user,"));
}

#[test]
fn ui_command_requires_a_usable_model_before_deterministic_planning_routes() {
    let source = include_str!("../ui_command_routes.rs");
    let gate = source
        .find("let Some(resolved_llm) = resolved_llm else")
        .expect("missing usable-model gate");
    let travel_route = source
        .find("if base.intent == \"travel\"")
        .expect("missing travel route");

    assert!(
        gate < travel_route,
        "travel must not create a plan before model setup"
    );
    assert!(source.contains("Connect AI model first"));
}

#[test]
fn configured_orchestration_passes_the_resolved_backend_to_the_runner() {
    let source = include_str!("../ui_command_routes.rs");
    assert!(
        source.contains("backend.clone(),\n                                    model.clone(),")
    );
    assert!(!source.contains("backend_api_key.clone().unwrap_or_default()"));
}
