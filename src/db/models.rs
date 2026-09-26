// @locs-version: 1.0
// @module-id: db.models
// @primary-capability: database-row-models
// @stability: beta

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AliasRecord {
    pub alias: String,
    pub agent_id: String,
    pub user_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_changed_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserRecord {
    pub id: String,
    pub email: String,
    pub password_hash: Option<String>,
    pub auth_provider: String,
    pub google_sub: Option<String>,
    pub display_name: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthSessionRecord {
    pub token: String,
    pub user_id: String,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ManagedAgentRecord {
    pub id: String,
    pub owner_user_id: String,
    pub agent_id: String,
    pub label: String,
    pub email: String,
    pub kind: String,
    pub created_at: String,
    pub metadata: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReversibleActionAuditSummary {
    pub reversible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub undo_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rollback_checkpoint_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provenance_record_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_effect_boundary: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActionAuditEntry {
    pub capability_id: String,
    pub thread_id: String,
    pub status: String,
    pub output: Value,
    pub external_reference: Option<String>,
    pub recorded_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reversible_summary: Option<ReversibleActionAuditSummary>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SavedWorkflowRecord {
    pub workflow_id: String,
    pub owner_user_id: String,
    pub title: String,
    pub description: Option<String>,
    pub favorite: bool,
    pub preset_kinds: Vec<String>,
    pub graph_json: Value,
    pub latest_ir_json: Option<Value>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkflowDeploymentRecord {
    pub deployment_id: String,
    pub workflow_id: String,
    pub owner_user_id: String,
    pub environment: String,
    pub status: String,
    pub ir_snapshot_json: Value,
    pub graph_snapshot_json: Value,
    pub source_deployment_id: Option<String>,
    pub deployed_at: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkflowRunRecord {
    pub run_id: String,
    pub workflow_id: String,
    pub deployment_id: String,
    pub owner_user_id: String,
    pub status: String,
    pub trigger_kind: String,
    pub replay_of_run_id: Option<String>,
    pub timeline_json: Value,
    pub result_json: Value,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkflowWaitResumeRecord {
    pub wait_resume_id: String,
    pub workflow_id: String,
    pub deployment_id: String,
    pub run_id: String,
    pub owner_user_id: String,
    pub manifest_node_id: String,
    pub source_graph_node_id: String,
    pub status: String,
    pub resume_family: String,
    pub resume_kind: String,
    pub wait_reason: Option<String>,
    pub scheduled_for: Option<String>,
    pub descriptor_json: Value,
    pub created_at: String,
    pub resumed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkflowTriggerRegistrationRecord {
    pub registration_id: String,
    pub workflow_id: String,
    pub deployment_id: String,
    pub owner_user_id: String,
    pub environment: String,
    pub trigger_node_id: String,
    pub manifest_node_id: String,
    pub trigger_family: String,
    pub trigger_kind: String,
    /// One of: preview | registered | paused | unhealthy | retired
    pub registration_status: String,
    /// SHA-256 of (deployment_id + trigger_node_id) — prevents double-registration
    pub idempotency_key: String,
    /// Hash of the trigger descriptor JSON — used to detect config drift between deployments
    pub dedup_hash: Option<String>,
    pub descriptor_json: Value,
    pub last_fired_at: Option<String>,
    pub next_fire_at: Option<String>,
    pub retry_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// One row per trigger activation attempt, written before the run is initiated.
/// Provides the audit trail required by Phase 3 item 11 of the builder plan.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TriggerObservabilityRecord {
    pub observation_id: String,
    /// Foreign-key reference to `workflow_trigger_registrations.registration_id`.
    pub registration_id: String,
    pub workflow_id: String,
    pub deployment_id: String,
    pub owner_user_id: String,
    /// `manual` | `cron` | `webhook` | `event` | `wake_up` | `hybrid`
    pub trigger_source: String,
    /// RFC-3339 timestamp at which the trigger fired.
    pub trigger_time: String,
    /// Sanitised/truncated JSON summary of the inbound payload (no secrets).
    pub payload_summary: Value,
    /// `schedule_kind`, `cron_expression`, `timezone`, `scheduled_for` for time triggers.
    pub schedule_metadata: Value,
    /// Non-null for `wake_up` family: reason the delayed continuation fired.
    pub delayed_resumption_reason: Option<String>,
    /// Ordered list of conditions evaluated for hybrid trigger composition.
    pub hybrid_decision_chain: Value,
    /// `run_id`, `workflow_id`, `deployment_id`, `trigger_node_id` linking this
    /// observation to the resulting workflow run.
    pub run_initiation_trace: Value,
    /// Stable unique nonce derived from (activation_id + trigger_node_id + deployment_id).
    /// Checked before insertion; duplicate nonce → activation rejected.
    pub replay_nonce: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeDeploymentRecord {
    pub id: String,
    pub owner_user_id: String,
    pub framework: String,
    pub gui: Option<String>,
    pub status: String,
    pub python_version: String,
    pub image_ref: String,
    pub runtime_token: String,
    pub workspace_path: String,
    pub config_json: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserOnboardingRecord {
    pub owner_user_id: String,
    pub identity_confirmed: bool,
    pub email_provider: Option<String>,
    pub email_address: Option<String>,
    pub email_connected: bool,
    pub llm_mode: String,
    pub notes: Value,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SupportAccessGrantRecord {
    pub id: String,
    pub owner_user_id: String,
    pub status: String,
    pub access_scope: String,
    pub reason: Option<String>,
    pub notes: Value,
    pub granted_at: String,
    pub expires_at: String,
    pub revoked_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeBackupPolicyRecord {
    pub owner_user_id: String,
    pub retention_days: i32,
    pub storage_mode: String,
    pub last_snapshot_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeBackupRecord {
    pub id: String,
    pub owner_user_id: String,
    pub runtime_deployment_id: Option<String>,
    pub snapshot_type: String,
    pub storage_mode: String,
    pub status: String,
    pub file_count: i32,
    pub total_workspace_bytes: i64,
    pub artifact_size_bytes: i64,
    pub artifact_path: Option<String>,
    pub manifest_json: Value,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeRestoreDrillRecord {
    pub id: String,
    pub owner_user_id: String,
    pub backup_id: String,
    pub status: String,
    pub notes_json: Value,
    pub started_at: String,
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeUpdatePolicyRecord {
    pub owner_user_id: String,
    pub update_channel: String,
    pub auto_apply: String,
    pub last_checked_at: Option<String>,
    pub last_applied_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeUpdateEventRecord {
    pub id: String,
    pub owner_user_id: String,
    pub runtime_deployment_id: Option<String>,
    pub action: String,
    pub from_version: Option<String>,
    pub to_version: Option<String>,
    pub status: String,
    pub notes_json: Value,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimeRunnerPolicyEventRecord {
    pub id: String,
    pub owner_user_id: String,
    pub runtime_deployment_id: Option<String>,
    pub event_kind: String,
    pub summary_json: Value,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SyncDevicePolicyRecord {
    pub device_id: String,
    pub owner_user_id: String,
    pub agent_id: String,
    pub device_class: String,
    pub policy_profile: String,
    pub sync_slices: Value,
    pub requires_local_key_material: bool,
    pub notes_json: Value,
    pub last_bundle_at: String,
    pub last_used_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
