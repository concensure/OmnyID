use super::bridge::*;
use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn default_skill_capsule_runtime_root_points_to_sibling_repo() {
    let root = default_skill_capsule_runtime_root();
    let normalized = root.to_string_lossy().replace('\\', "/");
    assert!(normalized.ends_with("/skill_capsule"));
}

#[test]
fn artifact_query_to_value_uses_runtime_field_names() {
    let value = artifact_query_to_value(SkillCapsuleArtifactQuery {
        kind: Some("verify".to_string()),
        run_id: Some("run-1".to_string()),
        parent_artifact_id: Some("parent-1".to_string()),
        atom_id: Some("code.edit.safe".to_string()),
        status: Some("PASS".to_string()),
        task_type: Some("coding".to_string()),
        limit: Some(5),
    });

    assert_eq!(value["runId"].as_str(), Some("run-1"));
    assert_eq!(value["parentArtifactId"].as_str(), Some("parent-1"));
    assert_eq!(value["atomId"].as_str(), Some("code.edit.safe"));
    assert_eq!(value["taskType"].as_str(), Some("coding"));
}

#[test]
fn artifact_query_accepts_camel_case_aliases() {
    let query: SkillCapsuleArtifactQuery = serde_json::from_value(serde_json::json!({
        "kind": "verify",
        "runId": "run-1",
        "parentArtifactId": "parent-1",
        "atomId": "code.edit.safe",
        "status": "PASS",
        "taskType": "coding",
        "limit": 5
    }))
    .expect("camelCase query");

    assert_eq!(query.kind.as_deref(), Some("verify"));
    assert_eq!(query.run_id.as_deref(), Some("run-1"));
    assert_eq!(query.parent_artifact_id.as_deref(), Some("parent-1"));
    assert_eq!(query.atom_id.as_deref(), Some("code.edit.safe"));
    assert_eq!(query.status.as_deref(), Some("PASS"));
    assert_eq!(query.task_type.as_deref(), Some("coding"));
    assert_eq!(query.limit, Some(5));
}

#[test]
fn selected_reasoning_skill_guidance_maps_known_ids() {
    let guidance = selected_reasoning_skill_guidance_from_ids(&[
        "reasoning.react_grounded".to_string(),
        "reasoning.self_reflection_guard".to_string(),
    ]);
    assert_eq!(guidance.len(), 2);
    assert!(
        guidance
            .iter()
            .any(|item| item.contains("thought-action-observation"))
    );
    assert!(guidance.iter().any(|item| item.contains("reflection pass")));
}

#[test]
fn selected_workspace_skill_summaries_maps_known_ids() {
    let summaries = selected_workspace_skill_summaries_from_ids(&[
        "reasoning.react_grounded".to_string(),
        "content.email.follow_up".to_string(),
    ]);
    assert_eq!(summaries.len(), 2);
    assert_eq!(summaries[0].id, "reasoning.react_grounded");
    assert_eq!(summaries[0].category, "Reasoning");
    assert_eq!(summaries[1].id, "content.email.follow_up");
    assert!(
        summaries[1]
            .surfaces
            .iter()
            .any(|surface| surface == "email")
    );
}

#[test]
fn skill_capsule_operation_timeout_is_thirty_seconds() {
    assert_eq!(
        skill_capsule_operation_timeout(),
        std::time::Duration::from_secs(30)
    );
}

#[test]
fn validate_skill_capsule_node_bin_allows_known_safe_values() {
    #[cfg(windows)]
    assert!(validate_skill_capsule_node_bin(r"C:\Program Files\nodejs\node.exe").is_ok());
    #[cfg(not(windows))]
    assert!(validate_skill_capsule_node_bin("/usr/bin/node").is_ok());
    #[cfg(not(windows))]
    assert!(validate_skill_capsule_node_bin("/opt/nodejs/bin/nodejs").is_ok());
}

#[test]
fn validate_skill_capsule_node_bin_rejects_relative_and_suspicious_values() {
    for candidate in [
        "",
        "node",
        "nodejs",
        "./node",
        "node;calc",
        "node && whoami",
        "node|more",
        "node`whoami`",
        "node$HOME",
        "node\nmore",
        "node\rmore",
        "../node",
        r"..\node.exe",
        #[cfg(not(windows))]
        "/usr/bin/python3",
        #[cfg(windows)]
        r"C:\Windows\System32\cmd.exe",
    ] {
        assert!(
            validate_skill_capsule_node_bin(candidate).is_err(),
            "candidate should be rejected: {candidate}"
        );
    }
}

#[test]
fn ensure_skill_capsule_bridge_ready_validates_node_bin_before_process_launch() {
    let source = include_str!("bridge.rs");
    let start = source
        .find("fn ensure_skill_capsule_bridge_ready()")
        .expect("ensure_skill_capsule_bridge_ready exists");
    let end = source[start..]
        .find("\npub(crate) async fn invoke_skill_capsule_operation(")
        .map(|offset| start + offset)
        .expect("invoke_skill_capsule_operation follows ensure_skill_capsule_bridge_ready");
    let function_source = &source[start..end];

    assert!(function_source.contains("validate_skill_capsule_node_bin(&bridge.node_bin)"));
    assert!(function_source.contains(
        "tracing::error!(error = %reason, \"Invalid skill capsule node binary configuration\")"
    ));
    assert!(function_source.contains("return Err(internal_http_error(reason));"));
    assert!(function_source.contains("if !PathBuf::from(&bridge.node_bin).exists()"));
    assert!(!function_source.contains("unwrap_or_else(|| \"node\".to_string())"));
}

#[test]
fn save_and_load_workspace_skill_selection_roundtrip() {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let root = std::env::temp_dir().join(format!("omnyid-skill-workspace-{suffix}"));
    std::fs::create_dir_all(&root).expect("temp root");
    let saved = save_workspace_skill_selection(
        &root,
        "test_user_01",
        vec![
            "content.email.professional_reply".to_string(),
            "content.email.professional_reply".to_string(),
            "reasoning.react_grounded".to_string(),
        ],
    )
    .expect("save selection");
    assert_eq!(saved.selected_skill_ids.len(), 2);
    let loaded = load_workspace_skill_selection(&root, "test_user_01").expect("load selection");
    assert_eq!(loaded.selected_skill_ids, saved.selected_skill_ids);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn custom_capsules_are_scoped_to_the_owning_user() {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let root = std::env::temp_dir().join(format!("omnyid-skill-custom-scope-{suffix}"));
    let alice_dir = custom_capsules_dir(&root, "alice@example.com");
    std::fs::create_dir_all(&alice_dir).expect("alice capsule dir");
    let capsule = SkillCapsuleCatalogItem {
        id: "user.custom.focus-coach".to_string(),
        title: "Focus coach".to_string(),
        category: "Custom".to_string(),
        capsule_kind: "user_defined".to_string(),
        description: "Private focus coaching capsule".to_string(),
        integration_mode: "agent_assist".to_string(),
        existing_runtime_fit: "Private user capsule.".to_string(),
        surfaces: vec!["note".to_string()],
        tags: vec!["custom".to_string()],
        compose_placeholder: Some("Apply focus coaching".to_string()),
        compose_scaffold: Some("Goal: focus".to_string()),
    };
    std::fs::write(
        alice_dir.join("user.custom.focus-coach.capsule.json"),
        serde_json::to_string_pretty(&capsule).expect("capsule json"),
    )
    .expect("write capsule");

    let alice_catalog =
        load_user_custom_skill_catalog(&root, "alice@example.com").expect("alice catalog");
    let bob_catalog =
        load_user_custom_skill_catalog(&root, "bob@example.com").expect("bob catalog");
    assert_eq!(alice_catalog.len(), 1);
    assert!(bob_catalog.is_empty());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn workspace_selection_accepts_only_custom_capsules_owned_by_that_user() {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let root = std::env::temp_dir().join(format!("omnyid-skill-custom-selection-{suffix}"));
    let alice_dir = custom_capsules_dir(&root, "alice@example.com");
    std::fs::create_dir_all(&alice_dir).expect("alice capsule dir");
    let capsule = SkillCapsuleCatalogItem {
        id: "user.custom.focus-coach".to_string(),
        title: "Focus coach".to_string(),
        category: "Custom".to_string(),
        capsule_kind: "user_defined".to_string(),
        description: "Private focus coaching capsule".to_string(),
        integration_mode: "agent_assist".to_string(),
        existing_runtime_fit: "Private user capsule.".to_string(),
        surfaces: vec!["note".to_string()],
        tags: vec!["custom".to_string()],
        compose_placeholder: None,
        compose_scaffold: None,
    };
    std::fs::write(
        alice_dir.join("user.custom.focus-coach.capsule.json"),
        serde_json::to_string_pretty(&capsule).expect("capsule json"),
    )
    .expect("write capsule");

    let alice_save = save_workspace_skill_selection(
        &root,
        "alice@example.com",
        vec!["user.custom.focus-coach".to_string()],
    );
    assert!(alice_save.is_ok());

    let bob_save = save_workspace_skill_selection(
        &root,
        "bob@example.com",
        vec!["user.custom.focus-coach".to_string()],
    );
    assert!(bob_save.is_err());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn custom_capsule_directory_is_user_scoped_under_sanitized_storage_path() {
    let root = PathBuf::from("/tmp/omnyid-skill-scope-layout");
    let scoped = custom_capsules_dir(&root, "alice@example.com");
    let normalized = scoped.to_string_lossy().replace('\\', "/");

    assert!(normalized.ends_with("/.skillcapsule/users/alice_example_com/capsules"));
    assert!(!normalized.contains("alice@example.com"));
}

#[test]
fn workspace_skill_selection_path_is_user_scoped_under_sanitized_storage_path() {
    let root = PathBuf::from("/tmp/omnyid-skill-selection-layout");
    let scoped = workspace_skill_selection_path(&root, "alice@example.com");
    let normalized = scoped.to_string_lossy().replace('\\', "/");

    assert!(normalized.ends_with("/.skillcapsule/alice_example_com.omnyid.workspace.skills.json"));
    assert!(!normalized.contains("alice@example.com"));
}

#[test]
fn skill_capsule_routes_sanitize_unexpected_storage_and_bridge_errors() {
    let source = format!(
        "{}\n{}",
        include_str!("../skill_capsule_routes.rs"),
        include_str!("bridge.rs")
    );
    assert!(source.contains("\"failed to read custom capsule directory\""));
    assert!(source.contains("\"failed to read custom capsule entry\""));
    assert!(source.contains("\"failed to read custom capsule file\""));
    assert!(source.contains("\"custom capsule file contains invalid JSON\""));
    assert!(source.contains("\"failed to create custom capsule directory\""));
    assert!(source.contains("\"failed to persist custom capsule\""));
    assert!(source.contains("\"failed to read workspace skill selections\""));
    assert!(source.contains("\"workspace skill selections are invalid JSON\""));
    assert!(source.contains("\"failed to create workspace skill directory\""));
    assert!(source.contains("\"failed to persist workspace skill selection\""));
    assert!(source.contains("\"failed to launch skill_capsule bridge\".to_string()"));
    assert!(source.contains("\"skill_capsule bridge returned invalid JSON\".to_string()"));
    assert!(source.contains("internal_http_error(err)"));
    assert!(!source.contains("format!(\"failed to read custom capsule directory: {err}\")"));
    assert!(!source.contains("format!(\"failed to read custom capsule entry: {err}\")"));
    assert!(!source.contains("format!(\"failed to read custom capsule file: {err}\")"));
    assert!(!source.contains("format!(\"custom capsule file contains invalid JSON: {err}\")"));
    assert!(!source.contains("format!(\"failed to create custom capsule directory: {err}\")"));
    assert!(!source.contains("format!(\"failed to persist custom capsule: {err}\")"));
    assert!(!source.contains("format!(\"failed to read workspace skill selections: {err}\")"));
    assert!(!source.contains("format!(\"workspace skill selections are invalid JSON: {err}\")"));
    assert!(!source.contains("format!(\"failed to create workspace skill directory: {err}\")"));
    assert!(!source.contains("format!(\"failed to persist workspace skill selection: {err}\")"));
    assert!(!source.contains("format!(\"failed to launch skill_capsule bridge: {err}\")"));
    assert!(!source.contains("format!(\"skill_capsule bridge returned invalid JSON: {err}\")"));
}
