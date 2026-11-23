// @locs-version: 1.0
use crate::db::{
    PROACTIVE_TOKEN_USAGE_MAX_ROWS_PER_USER, PROACTIVE_TOKEN_USAGE_RETENTION_DAYS,
    TENANT_ACTION_AUDIT_LOG_MAX_ROWS_PER_USER, TENANT_ACTION_AUDIT_LOG_RETENTION_DAYS,
    TENANT_LLM_USAGE_LOG_MAX_ROWS_PER_USER, TENANT_LLM_USAGE_LOG_RETENTION_DAYS,
    TRAINING_REFLECTION_TRACE_MAX_ROWS_PER_USER, TRAINING_REFLECTION_TRACE_RETENTION_DAYS,
    TRIGGER_REPLAY_NONCE_MAX_ROWS_PER_USER, TRIGGER_REPLAY_NONCE_RETENTION_DAYS,
    WORKFLOW_TRIGGER_OBSERVATION_MAX_ROWS_PER_WORKFLOW,
    WORKFLOW_TRIGGER_OBSERVATION_RETENTION_DAYS, daemon_operational_afp_retention_applies,
    reversible_action_audit_summary_from_output,
};
use serde_json::json;

#[test]
fn reversible_action_audit_summary_reads_undo_metadata_from_output() {
    let summary = reversible_action_audit_summary_from_output(&json!({
        "status": "file_bundle_staged",
        "reversible": true,
        "undo_label": "Discard staged file bundle",
        "artifact_refs": {
            "action_message_id": "action_1",
            "rollback_checkpoint_id": "checkpoint_1",
            "provenance_record_id": "prov_1"
        },
        "side_effect_boundary": "internal_only"
    }))
    .expect("summary");

    assert!(summary.reversible);
    assert_eq!(
        summary.undo_label.as_deref(),
        Some("Discard staged file bundle")
    );
    assert_eq!(summary.action_message_id.as_deref(), Some("action_1"));
    assert_eq!(
        summary.rollback_checkpoint_id.as_deref(),
        Some("checkpoint_1")
    );
    assert_eq!(summary.provenance_record_id.as_deref(), Some("prov_1"));
    assert_eq!(
        summary.side_effect_boundary.as_deref(),
        Some("internal_only")
    );
}

#[test]
fn reversible_action_audit_summary_returns_none_for_plain_outputs() {
    assert!(
        reversible_action_audit_summary_from_output(&json!({
            "dispatch": "queued"
        }))
        .is_none()
    );
}

#[test]
fn daemon_operational_afp_retention_policy_targets_only_audit_types() {
    assert!(daemon_operational_afp_retention_applies(
        "watcher_resolution_event"
    ));
    assert!(daemon_operational_afp_retention_applies(
        "synthesis_invalidation_event"
    ));
    assert!(daemon_operational_afp_retention_applies(
        "reflection_trace"
    ));
    assert!(daemon_operational_afp_retention_applies(
        "minimal_context_packet"
    ));
    assert!(daemon_operational_afp_retention_applies(
        "proactive_trigger"
    ));
    assert!(daemon_operational_afp_retention_applies(
        "token_budget_log"
    ));
    assert!(!daemon_operational_afp_retention_applies(
        "behavior_pattern"
    ));
    assert!(!daemon_operational_afp_retention_applies("ledger"));
}

#[test]
fn bounded_operational_history_limits_remain_above_recent_query_windows() {
    assert!(TRAINING_REFLECTION_TRACE_MAX_ROWS_PER_USER >= 100);
    assert!(PROACTIVE_TOKEN_USAGE_MAX_ROWS_PER_USER >= 1_000);
    assert!(TRAINING_REFLECTION_TRACE_RETENTION_DAYS >= 7);
    assert!(PROACTIVE_TOKEN_USAGE_RETENTION_DAYS >= 7);
    assert!(TENANT_LLM_USAGE_LOG_RETENTION_DAYS >= 90);
    assert!(TENANT_LLM_USAGE_LOG_MAX_ROWS_PER_USER >= 1_000);
    assert!(WORKFLOW_TRIGGER_OBSERVATION_RETENTION_DAYS >= 30);
    assert!(WORKFLOW_TRIGGER_OBSERVATION_MAX_ROWS_PER_WORKFLOW >= 100);
    assert!(TENANT_ACTION_AUDIT_LOG_RETENTION_DAYS >= 90);
    assert!(TENANT_ACTION_AUDIT_LOG_MAX_ROWS_PER_USER >= 500);
    assert!(TRIGGER_REPLAY_NONCE_RETENTION_DAYS >= 30);
    assert!(TRIGGER_REPLAY_NONCE_MAX_ROWS_PER_USER >= 1_000);
}
