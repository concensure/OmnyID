// @locs-version: 1.0
use crate::server::workflow_trigger_policy_check;

#[test]
fn policy_check_non_registered_status_blocks() {
    let reg = crate::db::WorkflowTriggerRegistrationRecord {
        registration_id: "reg_test".into(),
        workflow_id: "wf_test".into(),
        deployment_id: "dep_test".into(),
        owner_user_id: "user_test".into(),
        environment: "production".into(),
        trigger_node_id: "node_1".into(),
        manifest_node_id: "mf_node_1".into(),
        trigger_family: "time".into(),
        trigger_kind: "schedule".into(),
        registration_status: "preview".into(),
        idempotency_key: "ikey".into(),
        dedup_hash: None,
        descriptor_json: serde_json::json!({}),
        last_fired_at: None,
        next_fire_at: None,
        retry_count: 0,
        created_at: "2026-01-01T00:00:00Z".into(),
        updated_at: "2026-01-01T00:00:00Z".into(),
    };
    let result = workflow_trigger_policy_check(&reg, "cron");
    assert!(result.is_err(), "non-registered status should block");
}

#[test]
fn policy_check_policy_blocked_flag_blocks() {
    let reg = crate::db::WorkflowTriggerRegistrationRecord {
        registration_id: "reg_test2".into(),
        workflow_id: "wf_test2".into(),
        deployment_id: "dep_test2".into(),
        owner_user_id: "user_test2".into(),
        environment: "production".into(),
        trigger_node_id: "node_2".into(),
        manifest_node_id: "mf_node_2".into(),
        trigger_family: "time".into(),
        trigger_kind: "schedule".into(),
        registration_status: "registered".into(),
        idempotency_key: "ikey2".into(),
        dedup_hash: None,
        descriptor_json: serde_json::json!({ "policy_blocked": true }),
        last_fired_at: None,
        next_fire_at: None,
        retry_count: 0,
        created_at: "2026-01-01T00:00:00Z".into(),
        updated_at: "2026-01-01T00:00:00Z".into(),
    };
    let result = workflow_trigger_policy_check(&reg, "cron");
    assert!(result.is_err(), "policy_blocked=true should block");
}

#[test]
fn policy_check_budget_limit_zero_blocks() {
    let reg = crate::db::WorkflowTriggerRegistrationRecord {
        registration_id: "reg_test3".into(),
        workflow_id: "wf_test3".into(),
        deployment_id: "dep_test3".into(),
        owner_user_id: "user_test3".into(),
        environment: "production".into(),
        trigger_node_id: "node_3".into(),
        manifest_node_id: "mf_node_3".into(),
        trigger_family: "time".into(),
        trigger_kind: "schedule".into(),
        registration_status: "registered".into(),
        idempotency_key: "ikey3".into(),
        dedup_hash: None,
        descriptor_json: serde_json::json!({ "budget_limit_cents": 0 }),
        last_fired_at: None,
        next_fire_at: None,
        retry_count: 0,
        created_at: "2026-01-01T00:00:00Z".into(),
        updated_at: "2026-01-01T00:00:00Z".into(),
    };
    let result = workflow_trigger_policy_check(&reg, "cron");
    assert!(result.is_err(), "budget_limit_cents=0 should block");
}

#[test]
fn policy_check_egress_allowed_false_blocks() {
    let reg = crate::db::WorkflowTriggerRegistrationRecord {
        registration_id: "reg_test4".into(),
        workflow_id: "wf_test4".into(),
        deployment_id: "dep_test4".into(),
        owner_user_id: "user_test4".into(),
        environment: "production".into(),
        trigger_node_id: "node_4".into(),
        manifest_node_id: "mf_node_4".into(),
        trigger_family: "event".into(),
        trigger_kind: "webhook".into(),
        registration_status: "registered".into(),
        idempotency_key: "ikey4".into(),
        dedup_hash: None,
        descriptor_json: serde_json::json!({ "egress_allowed": false }),
        last_fired_at: None,
        next_fire_at: None,
        retry_count: 0,
        created_at: "2026-01-01T00:00:00Z".into(),
        updated_at: "2026-01-01T00:00:00Z".into(),
    };
    let result = workflow_trigger_policy_check(&reg, "webhook");
    assert!(result.is_err(), "egress_allowed=false should block");
}

// -- Item 9: AFP subtype constant tests ------------------------------------

#[test]
fn afp_subtype_trigger_initiation_constant_value() {
    assert_eq!(
        crate::message::AFP_SUBTYPE_TRIGGER_INITIATION,
        "trigger_initiation"
    );
}

#[test]
fn afp_subtype_wake_dispatch_constant_value() {
    assert_eq!(crate::message::AFP_SUBTYPE_WAKE_DISPATCH, "wake_dispatch");
}

#[cfg(unix)]
#[test]
fn relax_runtime_permissions_removes_world_access() {
    use std::os::unix::fs::PermissionsExt;

    let root = std::env::temp_dir().join(format!("omnyid-runtime-perms-{}", ulid::Ulid::new()));
    let workspace = root.join("workspace");
    let data = workspace.join("data");
    let files = data.join("files");
    let db = data.join("db");
    let vector = data.join("vector");
    let secrets = root.join("secrets");
    let logs = root.join("logs");

    for path in [&files, &db, &vector, &secrets, &logs] {
        std::fs::create_dir_all(path).unwrap();
    }

    for path in [
        &root, &workspace, &data, &files, &db, &vector, &secrets, &logs,
    ] {
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o777)).unwrap();
    }

    crate::server::relax_runtime_permissions(&root);

    for path in [
        &root, &workspace, &data, &files, &db, &vector, &secrets, &logs,
    ] {
        let mode = std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o750, "path {} must be 0o750", path.display());
    }

    let _ = std::fs::remove_dir_all(&root);
}
