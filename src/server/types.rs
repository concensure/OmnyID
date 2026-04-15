use crate::{
    db::{ActionAuditEntry, ManagedAgentRecord, UserOnboardingRecord},
    local_sync::DeviceBootstrap,
    message::AFPMessage,
};
use serde_json::Value;

#[derive(serde::Deserialize)]
pub(super) struct TrialSessionCreateRequest {
    pub(super) fingerprint: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct TrialTemplateRunRequest {
    pub(super) session_id: String,
    pub(super) template_id: String,
}

#[derive(serde::Deserialize)]
pub(super) struct TrialChatRequest {
    pub(super) session_id: String,
    pub(super) content: String,
}

#[derive(serde::Deserialize)]
pub(super) struct TrialConvertRequest {
    pub(super) session_id: String,
}

#[derive(serde::Deserialize)]
pub(super) struct ApprovalDecisionRequest {
    pub(super) thread_id: String,
    pub(super) target_message_id: String,
    pub(super) decision: String,
    pub(super) decided_by: String,
    pub(super) capability_id: Option<String>,
    pub(super) note: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct WorkflowWaitResumeDecisionRequest {
    pub(super) decision: String,
    pub(super) option_id: Option<String>,
    pub(super) note: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct RegisterRequest {
    pub(super) email: String,
    pub(super) password: String,
    pub(super) display_name: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct LoginRequest {
    pub(super) email: String,
    pub(super) password: String,
}

#[derive(serde::Deserialize)]
pub(super) struct GoogleAuthRequest {
    pub(super) id_token: String,
}

#[derive(serde::Deserialize)]
pub(super) struct DemoSendRequest {
    pub(super) from_agent_id: String,
    pub(super) to_agent_id: String,
    pub(super) body: String,
}

#[derive(serde::Deserialize)]
pub(super) struct RuntimeDeployRequest {
    pub(super) framework: Option<String>,
    pub(super) gui: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct RuntimeActionRequest {
    pub(super) action: String,
}

#[derive(serde::Deserialize)]
pub(super) struct RuntimeRunnerConfigRequest {
    pub(super) action: String,
    pub(super) model_policy: Option<Value>,
    pub(super) tool_policy: Option<Value>,
    pub(super) channel_policy: Option<Value>,
    pub(super) starter_template_id: Option<String>,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeWorkspaceFileEntryResponse {
    pub(super) file_id: String,
    pub(super) label: String,
    pub(super) relative_path: String,
    pub(super) language: String,
    pub(super) editable: bool,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeWorkspaceFilesResponse {
    pub(super) framework: String,
    pub(super) active_file_id: Option<String>,
    pub(super) files: Vec<RuntimeWorkspaceFileEntryResponse>,
}

#[derive(serde::Deserialize)]
pub(super) struct RuntimeWorkspaceFileQuery {
    pub(super) file_id: String,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeWorkspaceFileResponse {
    pub(super) file_id: String,
    pub(super) label: String,
    pub(super) relative_path: String,
    pub(super) language: String,
    pub(super) editable: bool,
    pub(super) content: String,
    pub(super) updated_at: String,
}

#[derive(serde::Deserialize)]
pub(super) struct RuntimeWorkspaceFileSaveRequest {
    pub(super) file_id: String,
    pub(super) content: String,
}

#[derive(serde::Deserialize)]
pub(super) struct UiCommandRequest {
    pub(super) query: String,
    pub(super) engine: Option<String>,
    pub(super) active_file_id: Option<String>,
    pub(super) store_in_history: Option<bool>,
    /// Pre-classified intent from the browser's built-in AI (Gemini Nano / Phi).
    /// Used only when no server-side LLM is configured.
    pub(super) browser_intent: Option<String>,
    /// Full parsed payload produced by the browser AI classifier.
    pub(super) browser_parsed: Option<serde_json::Value>,
    /// Per-task optimization mode override: "speed" | "cost" | "balanced"
    #[serde(rename = "optimization_mode")]
    pub(super) _optimization_mode: Option<String>,
}

/// Request body for POST /ui/decision — records a user's choice for a decision point.
#[derive(serde::Deserialize)]
pub(super) struct UiDecisionRequest {
    /// The generative card ID that contains the decision point (e.g. "gc-01JFXYZ")
    pub(super) card_id: String,
    /// The decision point ID within the card (e.g. "dp-1")
    pub(super) decision_point_id: String,
    /// The option ID the user selected (e.g. "top3")
    pub(super) selected_option_id: String,
    /// Thread ID — used to find the correct thread to post the user_decision AFP message
    pub(super) thread_id: String,
    /// Agent ID to address the user_decision to (so the runner can filter)
    pub(super) agent_id: Option<String>,
}

/// Request/response for GET/POST /user/agent-preferences
#[derive(serde::Serialize, serde::Deserialize, Default)]
pub(super) struct AgentPreferences {
    /// Global optimization mode: "speed" | "cost" | "balanced"
    #[serde(default = "default_optimization_mode")]
    pub(super) optimization_mode: String,
    /// Auto-confirm threshold in cents — agent won't ask if cost is below this
    #[serde(default = "default_auto_confirm_threshold")]
    pub(super) auto_confirm_threshold_cents: f64,
    /// Whether to show cost estimates in the generative card UI
    #[serde(default = "default_show_cost_estimates")]
    pub(super) show_cost_estimates: bool,
    /// Whether command-bar and similar user-authored actions should persist AFP history by default.
    #[serde(default = "default_store_in_history")]
    pub(super) default_store_in_history: bool,
}

fn default_optimization_mode() -> String {
    "balanced".to_string()
}
fn default_auto_confirm_threshold() -> f64 {
    5.0
}
fn default_show_cost_estimates() -> bool {
    true
}
fn default_store_in_history() -> bool {
    true
}

#[derive(serde::Serialize)]
pub(super) struct UiCommandLink {
    pub(super) title: String,
    pub(super) url: String,
    pub(super) kind: String,
}

#[derive(serde::Serialize)]
pub(super) struct UiRunnerDraftResponse {
    pub(super) target_file_id: String,
    pub(super) title: String,
    pub(super) content: String,
    pub(super) requires_confirmation: bool,
}

#[derive(serde::Serialize)]
pub(super) struct UiCommandResponse {
    pub(super) intent: String,
    pub(super) suggested_view: String,
    /// Semantically richer UI surface hint consumed by the frontend ViewDispatcher.
    /// Values: "task_board" | "note_canvas" | "draggable_calendar" | "search_result" |
    ///         "confirmation_modal" | "orchestrate_progress" | "runner" | "chat" |
    ///         "generative_card"
    pub(super) preferred_view: String,
    pub(super) summary: String,
    pub(super) engine: String,
    pub(super) links: Vec<UiCommandLink>,
    pub(super) runner_draft: Option<UiRunnerDraftResponse>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(super) bullets: Vec<String>,
    /// When the agent creates a generative card, this is the card_id so the frontend
    /// can link subsequent card_section_update messages to the correct renderer.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) card_id: Option<String>,
    /// Safe AFP-shaped preview message for the workspace to render immediately.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) preview_message: Option<AFPMessage>,
}

#[derive(serde::Deserialize)]
pub(super) struct WaitlistRequest {
    pub(super) email: String,
}

#[derive(serde::Deserialize)]
pub(super) struct OnboardingUpdateRequest {
    pub(super) identity_confirmed: bool,
    pub(super) email_provider: Option<String>,
    pub(super) email_address: Option<String>,
    pub(super) email_connected: bool,
    pub(super) llm_mode: Option<String>,
    pub(super) notes: Option<Value>,
}

#[derive(serde::Deserialize)]
pub(super) struct SupportAccessRequest {
    pub(super) action: String,
    pub(super) duration_hours: Option<i64>,
    pub(super) reason: Option<String>,
    pub(super) access_scope: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct AccountDeleteRequest {
    pub(super) email: String,
    pub(super) confirmation: String,
}

#[derive(serde::Deserialize)]
pub(super) struct SessionActionRequest {
    pub(super) action: String,
    pub(super) token: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct RuntimeBackupRequest {
    pub(super) action: String,
    pub(super) retention_days: Option<i32>,
    pub(super) backup_id: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct RuntimeRestoreDrillRequest {
    pub(super) backup_id: String,
}

#[derive(serde::Serialize)]
pub(super) struct SessionUserResponse {
    pub(super) id: String,
    pub(super) email: String,
    pub(super) display_name: String,
    pub(super) auth_provider: String,
}

#[derive(serde::Serialize)]
pub(super) struct SessionResponse {
    pub(super) token: String,
    pub(super) user: SessionUserResponse,
}

#[derive(serde::Serialize)]
pub(super) struct DashboardBootstrapResponse {
    pub(super) user: SessionUserResponse,
    pub(super) agents: Vec<ManagedAgentRecord>,
    pub(super) messages: Vec<AFPMessage>,
    pub(super) action_log: Vec<ActionAuditEntry>,
    pub(super) onboarding: UserOnboardingRecord,
    pub(super) device_sync_policies: DeviceSyncPoliciesResponse,
    pub(super) support_access: SupportAccessStateResponse,
    pub(super) support_access_history: Vec<SupportAccessHistoryEntry>,
    pub(super) sessions: Vec<AccountSessionEntry>,
    pub(super) runtime_backups: RuntimeBackupsResponse,
    pub(super) runtime_restore_drills: RuntimeRestoreDrillsResponse,
    pub(super) runtime_updates: RuntimeUpdatesResponse,
    pub(super) runtime_deployment: Option<RuntimeDeploymentResponse>,
}

#[derive(serde::Serialize)]
pub(super) struct DashboardExportResponse {
    pub(super) exported_at: String,
    pub(super) export_version: String,
    pub(super) user: SessionUserResponse,
    pub(super) agents: Vec<ManagedAgentRecord>,
    pub(super) onboarding: UserOnboardingRecord,
    pub(super) device_sync_policies: DeviceSyncPoliciesResponse,
    pub(super) support_access: SupportAccessStateResponse,
    pub(super) support_access_history: Vec<SupportAccessHistoryEntry>,
    pub(super) runtime_backups: RuntimeBackupsResponse,
    pub(super) runtime_restore_drills: RuntimeRestoreDrillsResponse,
    pub(super) runtime_updates: RuntimeUpdatesResponse,
    pub(super) runtime_deployment: Option<RuntimeDeploymentResponse>,
    pub(super) recent_messages: Vec<AFPMessage>,
    pub(super) action_log: Vec<ActionAuditEntry>,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeDeploymentResponse {
    pub(super) id: String,
    pub(super) owner_user_id: String,
    pub(super) framework: String,
    pub(super) gui: Option<String>,
    pub(super) status: String,
    pub(super) python_version: String,
    pub(super) image_ref: String,
    pub(super) runtime_token_preview: String,
    pub(super) workspace_path: String,
    pub(super) config_json: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) runtime_monitor: Option<RuntimeMonitorPreview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) runtime_status_panel: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) runtime_status_views: Option<Vec<Value>>,
    pub(super) created_at: String,
    pub(super) updated_at: String,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeMonitorPreview {
    pub(super) status: String,
    pub(super) source: String,
    pub(super) lines: Vec<String>,
    pub(super) updated_at: String,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeLogsResponse {
    pub(super) status: String,
    pub(super) source: String,
    pub(super) lines: Vec<String>,
    pub(super) updated_at: String,
}

#[derive(serde::Serialize)]
pub(super) struct OnboardingBundleResponse {
    pub(super) bundle_name: String,
    pub(super) privacy_mode: String,
    pub(super) deployment_target: String,
    pub(super) installer_family: String,
    pub(super) estimated_minutes: i64,
    pub(super) installer_downloads: Vec<InstallerDownload>,
    pub(super) commands: Vec<String>,
    pub(super) files: Vec<OnboardingBundleFile>,
}

#[derive(serde::Serialize)]
pub(super) struct InstallerDownload {
    pub(super) label: String,
    pub(super) url: String,
    pub(super) filename: String,
}

#[derive(serde::Serialize)]
pub(super) struct OnboardingBundleFile {
    pub(super) name: String,
    pub(super) content: String,
}

#[derive(serde::Serialize)]
pub(super) struct ServiceAdapterBundleResponse {
    pub(super) bundle_name: String,
    pub(super) target_profile: String,
    pub(super) files: Vec<OnboardingBundleFile>,
}

#[derive(serde::Serialize)]
pub(super) struct SupportAccessStateResponse {
    pub(super) status: String,
    pub(super) access_scope: String,
    pub(super) reason: Option<String>,
    pub(super) support_disabled_by_default: bool,
    pub(super) granted_at: Option<String>,
    pub(super) expires_at: Option<String>,
    pub(super) revoked_at: Option<String>,
}

#[derive(serde::Serialize)]
pub(super) struct SupportAccessHistoryEntry {
    pub(super) id: String,
    pub(super) status: String,
    pub(super) access_scope: String,
    pub(super) reason: Option<String>,
    pub(super) granted_at: String,
    pub(super) expires_at: String,
    pub(super) revoked_at: Option<String>,
}

#[derive(serde::Serialize)]
pub(super) struct SupportAccessHistoryResponse {
    pub(super) entries: Vec<SupportAccessHistoryEntry>,
}

#[derive(serde::Serialize)]
pub(super) struct AccountSessionEntry {
    pub(super) token_preview: String,
    pub(super) created_at: String,
    pub(super) expires_at: String,
    pub(super) current: bool,
}

#[derive(serde::Serialize)]
pub(super) struct AccountSessionsResponse {
    pub(super) sessions: Vec<AccountSessionEntry>,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeBackupsResponse {
    pub(super) policy: RuntimeBackupPolicyResponse,
    pub(super) entries: Vec<RuntimeBackupEntryResponse>,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeBackupPolicyResponse {
    pub(super) retention_days: i32,
    pub(super) storage_mode: String,
    pub(super) last_snapshot_at: Option<String>,
    pub(super) support_disabled_by_default: bool,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeBackupEntryResponse {
    pub(super) id: String,
    pub(super) snapshot_type: String,
    pub(super) storage_mode: String,
    pub(super) status: String,
    pub(super) file_count: i32,
    pub(super) total_workspace_bytes: i64,
    pub(super) artifact_size_bytes: i64,
    pub(super) created_at: String,
    pub(super) expires_at: String,
    pub(super) manifest_summary: Value,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeBackupManifestResponse {
    pub(super) id: String,
    pub(super) storage_mode: String,
    pub(super) created_at: String,
    pub(super) expires_at: String,
    pub(super) manifest_json: Value,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeRecoveryPacketResponse {
    pub(super) generated_at: String,
    pub(super) packet_version: String,
    pub(super) packet_name: String,
    pub(super) user: SessionUserResponse,
    pub(super) runtime_deployment: Option<RuntimeDeploymentResponse>,
    pub(super) runtime_backups: RuntimeBackupsResponse,
    pub(super) runtime_restore_drills: RuntimeRestoreDrillsResponse,
    pub(super) runtime_updates: RuntimeUpdatesResponse,
    pub(super) recovery_checklist: Vec<String>,
    pub(super) privacy_notes: Vec<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct DeviceBootstrapRequest {
    pub(super) device_class: String,
}

#[derive(serde::Deserialize)]
pub(super) struct DeviceSyncPolicyRequest {
    pub(super) action: String,
    pub(super) device_id: Option<String>,
    pub(super) policy_profile: Option<String>,
}

#[derive(serde::Serialize)]
pub(super) struct DeviceBootstrapBundleResponse {
    pub(super) generated_at: String,
    pub(super) bundle_name: String,
    pub(super) device_class: String,
    pub(super) requires_local_key_material: bool,
    pub(super) files: Vec<OnboardingBundleFile>,
    pub(super) bootstrap: DeviceBootstrap,
}

#[derive(serde::Serialize)]
pub(super) struct DeviceSyncPoliciesResponse {
    pub(super) entries: Vec<DeviceSyncPolicyEntryResponse>,
}

#[derive(serde::Serialize)]
pub(super) struct DeviceSyncPolicyEntryResponse {
    pub(super) device_id: String,
    pub(super) agent_id: String,
    pub(super) device_class: String,
    pub(super) policy_profile: String,
    pub(super) sync_slices: Value,
    pub(super) requires_local_key_material: bool,
    pub(super) last_bundle_at: String,
    pub(super) last_used_at: Option<String>,
    pub(super) notes_summary: Value,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeRestoreDrillsResponse {
    pub(super) entries: Vec<RuntimeRestoreDrillEntryResponse>,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeRestoreDrillEntryResponse {
    pub(super) id: String,
    pub(super) backup_id: String,
    pub(super) status: String,
    pub(super) started_at: String,
    pub(super) completed_at: Option<String>,
    pub(super) notes_summary: Value,
}

#[derive(serde::Deserialize)]
pub(super) struct RuntimeUpdateRequest {
    pub(super) action: String,
    pub(super) update_channel: Option<String>,
    pub(super) auto_apply: Option<String>,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeUpdatesResponse {
    pub(super) policy: RuntimeUpdatePolicyResponse,
    pub(super) current_version: String,
    pub(super) latest_version: String,
    pub(super) update_available: bool,
    pub(super) runtime_status: String,
    pub(super) framework: Option<String>,
    pub(super) last_checked_at: Option<String>,
    pub(super) last_applied_at: Option<String>,
    pub(super) entries: Vec<RuntimeUpdateEventEntryResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) panel: Option<Value>,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeUpdatePolicyResponse {
    pub(super) update_channel: String,
    pub(super) auto_apply: String,
    pub(super) support_disabled_by_default: bool,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeUpdateEventEntryResponse {
    pub(super) id: String,
    pub(super) action: String,
    pub(super) from_version: Option<String>,
    pub(super) to_version: Option<String>,
    pub(super) status: String,
    pub(super) created_at: String,
    pub(super) notes_summary: Value,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeRunnerPolicyEventEntryResponse {
    pub(super) id: String,
    pub(super) event_kind: String,
    pub(super) created_at: String,
    pub(super) summary: Value,
}

#[derive(serde::Deserialize)]
pub(super) struct GoogleTokenInfoResponse {
    pub(super) sub: String,
    pub(super) email: String,
    pub(super) email_verified: Option<String>,
    pub(super) aud: String,
    pub(super) name: Option<String>,
    pub(super) given_name: Option<String>,
}
