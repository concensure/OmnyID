#![allow(dead_code)]

use crate::{
    db::{ActionAuditEntry, ManagedAgentRecord, UserOnboardingRecord},
    local_sync::DeviceBootstrap,
    message::AFPMessage,
    response_queue_policy::{
        AgentExecutionProfile, NotificationSourceFilters, ResponseQueuePolicy,
    },
    state_fields::StateFieldActivation,
    state_snapshot::{
        StateSnapshotContent, StateSnapshotContextItem, StateSnapshotDecisionItem,
        StateSnapshotResponseItem,
    },
    state_synthesizer::AfpStateSynthesisContent,
    state_synthesizer_contract::SynthesizerToMasterHandoff,
};
use serde_json::Value;

#[derive(Clone, serde::Serialize)]
pub(super) struct CompactAutonomyDecision {
    pub(super) autonomy_level: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) reversibility: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) consequence_level: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) confidence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) approval_required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) interruption_budget: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) reason: Option<String>,
}

impl CompactAutonomyDecision {
    pub(super) fn suggest_with_artifact(
        confidence: Option<&str>,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            autonomy_level: "suggest_with_artifact".to_string(),
            reversibility: Some("reviewable".to_string()),
            consequence_level: Some("medium".to_string()),
            confidence: confidence
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned),
            approval_required: Some(false),
            interruption_budget: Some("low".to_string()),
            reason: Some(reason.into()),
        }
    }

    pub(super) fn request_approval(confidence: Option<&str>, reason: impl Into<String>) -> Self {
        Self {
            autonomy_level: "request_approval".to_string(),
            reversibility: Some("approval_required".to_string()),
            consequence_level: Some("high".to_string()),
            confidence: confidence
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned),
            approval_required: Some(true),
            interruption_budget: Some("high".to_string()),
            reason: Some(reason.into()),
        }
    }
}

#[derive(serde::Deserialize)]
pub(super) struct TrialSessionCreateRequest {
    pub(super) fingerprint: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct TrialTemplateRunRequest {
    pub(super) session_id: String,
    pub(super) template_id: String,
    pub(super) fingerprint: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct TrialChatRequest {
    pub(super) session_id: String,
    pub(super) content: String,
    pub(super) fingerprint: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct TrialConvertRequest {
    pub(super) session_id: String,
    pub(super) fingerprint: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct TrialSessionStateQuery {
    pub(super) fingerprint: Option<String>,
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
    pub(super) source: Option<String>,
    pub(super) acquisition_visit_id: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct LoginRequest {
    pub(super) email: String,
    pub(super) password: String,
}

#[derive(serde::Deserialize)]
pub(super) struct GoogleAuthRequest {
    pub(super) id_token: String,
    pub(super) acquisition_visit_id: Option<String>,
    pub(super) source: Option<String>,
}

#[derive(serde::Serialize)]
pub(super) struct GoogleAuthConfigResponse {
    pub(super) enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) client_id: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct ChangePasswordRequest {
    pub(super) current_password: String,
    pub(super) new_password: String,
}

#[derive(serde::Deserialize)]
pub(super) struct ForgotPasswordRequest {
    pub(super) email: String,
    pub(super) source: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct ResetPasswordRequest {
    pub(super) token: String,
    pub(super) new_password: String,
}

#[derive(serde::Deserialize)]
pub(super) struct VerifyEmailRequest {
    pub(super) token: String,
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
    pub(super) edit_scope: String,
    pub(super) reset_supported: bool,
    pub(super) files: Vec<RuntimeWorkspaceFileEntryResponse>,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeWorkspaceResetResponse {
    pub(super) framework: String,
    pub(super) reset_scope: String,
    pub(super) restored_file_ids: Vec<String>,
    pub(super) updated_at: String,
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
    #[serde(default)]
    pub(super) memory_space: Option<String>,
    #[serde(default)]
    pub(super) author_mask: Option<String>,
    #[serde(default)]
    pub(super) author_type: Option<String>,
    #[serde(default)]
    pub(super) author_id: Option<String>,
    #[serde(default)]
    pub(super) is_human_authored: Option<bool>,
    #[serde(default)]
    pub(super) human_only: Option<bool>,
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
    #[serde(default)]
    pub(super) calendar_notification_filters: NotificationSourceFilters,
    #[serde(default)]
    pub(super) email_notification_filters: NotificationSourceFilters,
    #[serde(default)]
    pub(super) default_execution_profile: Option<AgentExecutionProfile>,
    #[serde(default)]
    pub(super) response_queue_policy: ResponseQueuePolicy,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) origin: Option<String>,
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
    /// Values: "task_board" | "ledger_canvas" | "draggable_calendar" | "search_result" |
    ///         "route_card" | "comparison_table" | "social_composer" | "spaces" |
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
    /// Structured routing metadata produced by the master-agent intent router.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) intent_route: Option<Value>,
    /// Optional UI boundary or approval boundary metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) boundary: Option<Value>,
    /// Optional execution explanation shown alongside previews or cards.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) execution_explanation: Option<Value>,
}

#[derive(serde::Deserialize)]
pub(super) struct WaitlistRequest {
    pub(super) email: String,
}

#[derive(serde::Deserialize)]
pub(super) struct WeddingWaitlistRequest {
    pub(super) email: String,
    pub(super) first_name: String,
    pub(super) last_name: String,
    pub(super) expected_wedding_date: Option<String>,
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
    #[serde(alias = "token")]
    pub(super) session_ref: Option<String>,
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
    /// Presentation hint derived from the same server allowlist that protects
    /// operator routes. This is not an authorisation grant: every operator
    /// command still re-checks the authenticated account server-side.
    pub(super) operator: bool,
}

#[derive(serde::Serialize)]
pub(super) struct SessionResponse {
    pub(super) token: String,
    pub(super) user: SessionUserResponse,
}

#[derive(serde::Serialize)]
pub(super) struct AuthResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) user: Option<SessionUserResponse>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub(super) requires_2fa: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub(super) verification_required: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub(super) account_created: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) email: Option<String>,
}
#[derive(Clone, serde::Serialize)]
#[serde(tag = "kind", content = "data")]
pub(super) enum DashboardContinuityParsedContent {
    StateSnapshot(StateSnapshotContent),
    StateSynthesis(AfpStateSynthesisContent),
}
#[derive(Clone, serde::Serialize)]
pub(super) struct DashboardContinuityBrief {
    pub(super) source_type: String,
    pub(super) title: String,
    pub(super) decision_count: u32,
    pub(super) commitment_count: u32,
    pub(super) critical_change_count: u32,
    pub(super) suggested_actions: Vec<String>,
    pub(super) staleness_at: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct ContinuityPriorityItem {
    pub(super) title: String,
    pub(super) panel_kind: String,
    pub(super) requires_approval: bool,
    pub(super) surface_hint: Option<String>,
    pub(super) suggested_action: Option<String>,
    pub(super) confidence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) prepared_draft_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) selection_reason: Option<String>,
    #[serde(default)]
    pub(super) source_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) memory_space: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_mask: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) is_human_authored: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) human_only: Option<bool>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct ContinuityPriorityCard {
    pub(super) title: String,
    pub(super) description: String,
    pub(super) panel_kind: String,
    pub(super) requires_approval: bool,
    pub(super) action_label: String,
    pub(super) surface_hint: Option<String>,
    pub(super) confidence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) prepared_draft_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) selection_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) approval_or_reversibility_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) provenance_cue: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) autonomy_tier: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) retrieval_mode: Option<String>,
    #[serde(default)]
    pub(super) deeper_retrieval_recommended: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) readiness_reason: Option<String>,
    #[serde(default)]
    pub(super) topology_budget_used: u32,
    #[serde(default)]
    pub(super) working_set_count: u32,
    #[serde(default)]
    pub(super) active_topic_count: u32,
    #[serde(default)]
    pub(super) working_set_refs: Vec<String>,
    #[serde(default)]
    pub(super) active_topic_refs: Vec<String>,
    #[serde(default)]
    pub(super) decision_history_refs: Vec<String>,
    #[serde(default)]
    pub(super) project_refs: Vec<String>,
    #[serde(default)]
    pub(super) thread_refs: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) linked_target_label: Option<String>,
    #[serde(default)]
    pub(super) source_refs: Vec<String>,
    #[serde(default)]
    pub(super) object_refs: Vec<String>,
    #[serde(default)]
    pub(super) object_labels: Vec<String>,
    #[serde(default)]
    pub(super) file_refs: Vec<String>,
    #[serde(default)]
    pub(super) file_labels: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) thread_retrieval_state: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) autonomy_decision: Option<CompactAutonomyDecision>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) memory_space: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_mask: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) is_human_authored: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) human_only: Option<bool>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct ContinuityActionItem {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) category: String,
    pub(super) urgency: String,
    pub(super) confidence: String,
    pub(super) requires_approval: bool,
    pub(super) suggested_action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) surface_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) autonomy_decision: Option<CompactAutonomyDecision>,
    #[serde(default)]
    pub(super) source_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) memory_space: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_mask: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) is_human_authored: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) human_only: Option<bool>,
}

impl From<&StateSnapshotDecisionItem> for ContinuityActionItem {
    fn from(item: &StateSnapshotDecisionItem) -> Self {
        Self {
            id: item.id.clone(),
            title: item.label.clone(),
            category: item.category.clone(),
            urgency: item.urgency.clone(),
            confidence: item.confidence.clone(),
            requires_approval: item.approval_required,
            suggested_action: item.suggested_next_action.clone(),
            surface_hint: Some("decision_queue".to_string()),
            autonomy_decision: Some(if item.approval_required {
                CompactAutonomyDecision::request_approval(
                    Some(item.confidence.as_str()),
                    "This action still needs explicit approval before execution.",
                )
            } else {
                CompactAutonomyDecision::suggest_with_artifact(
                    Some(item.confidence.as_str()),
                    "Suggested next step stays reviewable before execution.",
                )
            }),
            source_refs: item.source_refs.clone(),
            memory_space: None,
            author_mask: None,
            author_type: None,
            author_id: None,
            is_human_authored: None,
            human_only: None,
        }
    }
}

#[derive(Clone, serde::Serialize)]
pub(super) struct ContinuityResponseItem {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) channel: String,
    pub(super) urgency: String,
    pub(super) confidence: String,
    pub(super) response_due_hint: String,
    pub(super) suggested_action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) autonomy_decision: Option<CompactAutonomyDecision>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) prepared_draft_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) prepared_draft_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) prepared_draft_readiness: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) prepared_draft_body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) prepared_draft_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) prepared_draft_selection_reason: Option<String>,
    #[serde(default)]
    pub(super) prepared_draft_available: bool,
    #[serde(default)]
    pub(super) prepared_draft_requires_approval: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) prepared_draft_autonomy_decision: Option<CompactAutonomyDecision>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) prepared_draft_lead_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) prepared_draft_summary_lines: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) prepared_draft_object_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) prepared_draft_object_labels: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) prepared_draft_thread_retrieval_state: Option<Value>,
    #[serde(default)]
    pub(super) source_refs: Vec<String>,
}

impl From<&StateSnapshotResponseItem> for ContinuityResponseItem {
    fn from(item: &StateSnapshotResponseItem) -> Self {
        Self {
            id: item.id.clone(),
            title: item.label.clone(),
            channel: item.channel.clone(),
            urgency: item.urgency.clone(),
            confidence: item.confidence.clone(),
            response_due_hint: item.response_due_hint.clone(),
            suggested_action: item.suggested_next_action.clone(),
            autonomy_decision: Some(CompactAutonomyDecision::suggest_with_artifact(
                Some(item.confidence.as_str()),
                "Suggested response work stays reviewable before any outbound action.",
            )),
            prepared_draft_id: None,
            prepared_draft_summary: None,
            prepared_draft_readiness: None,
            prepared_draft_body: None,
            prepared_draft_class: None,
            prepared_draft_selection_reason: None,
            prepared_draft_available: false,
            prepared_draft_requires_approval: false,
            prepared_draft_autonomy_decision: None,
            prepared_draft_lead_summary: None,
            prepared_draft_summary_lines: Vec::new(),
            prepared_draft_object_refs: Vec::new(),
            prepared_draft_object_labels: Vec::new(),
            prepared_draft_thread_retrieval_state: None,
            source_refs: item.source_refs.clone(),
        }
    }
}

#[derive(Clone, serde::Serialize)]
pub(super) struct ContinuityPreparedDraftItem {
    pub(super) id: String,
    pub(super) draft_class: String,
    pub(super) title: String,
    pub(super) channel: String,
    pub(super) summary: String,
    pub(super) body: String,
    pub(super) confidence: String,
    pub(super) readiness: String,
    pub(super) response_due_hint: String,
    pub(super) requires_approval: bool,
    pub(super) suggested_action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) autonomy_decision: Option<CompactAutonomyDecision>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) selection_reason: Option<String>,
    #[serde(default)]
    pub(super) source_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) object_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) object_labels: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) comparison_headers: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) comparison_rows: Vec<crate::prepared_draft_packet::PreparedDraftComparisonRow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) memory_space: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_mask: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) is_human_authored: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) human_only: Option<bool>,
}

impl From<&crate::prepared_draft_packet::PreparedDraftArtifact> for ContinuityPreparedDraftItem {
    fn from(item: &crate::prepared_draft_packet::PreparedDraftArtifact) -> Self {
        Self {
            id: item.draft_id.clone(),
            draft_class: item.draft_class.clone(),
            title: item.label.clone(),
            channel: item.channel.clone(),
            summary: item.summary.clone(),
            body: item.body.clone(),
            confidence: item.confidence.clone(),
            readiness: item.readiness.clone(),
            response_due_hint: item.response_due_hint.clone(),
            requires_approval: item.approval_required_to_send,
            suggested_action: item.suggested_next_action.clone(),
            autonomy_decision: Some(if item.approval_required_to_send {
                CompactAutonomyDecision::request_approval(
                    Some(item.confidence.as_str()),
                    "Prepared draft still needs explicit approval before any outbound action.",
                )
            } else {
                CompactAutonomyDecision::suggest_with_artifact(
                    Some(item.confidence.as_str()),
                    "Prepared draft is ready for review before any outbound action.",
                )
            }),
            selection_reason: item.selection_reason.clone(),
            source_refs: item.source_refs.clone(),
            object_refs: item.object_refs.clone(),
            object_labels: Vec::new(),
            comparison_headers: item.comparison_headers.clone(),
            comparison_rows: item.comparison_rows.clone(),
            memory_space: item.memory_space.clone(),
            author_mask: item.author_mask.clone(),
            author_type: item.author_type.clone(),
            author_id: item.author_id.clone(),
            is_human_authored: item.is_human_authored,
            human_only: item.human_only,
        }
    }
}

#[derive(Clone, serde::Serialize)]
pub(super) struct ContinuityContextPanelItem {
    pub(super) id: String,
    pub(super) label: String,
    pub(super) why_surfaced: String,
    pub(super) confidence: String,
    #[serde(default)]
    pub(super) freshness: String,
    #[serde(default)]
    pub(super) relation_path: Vec<String>,
    #[serde(default)]
    pub(super) source_refs: Vec<String>,
    pub(super) decrypt_needed: bool,
}

impl From<&StateSnapshotContextItem> for ContinuityContextPanelItem {
    fn from(item: &StateSnapshotContextItem) -> Self {
        Self {
            id: item.id.clone(),
            label: item.label.clone(),
            why_surfaced: item.why_surfaced.clone(),
            confidence: item.confidence.clone(),
            freshness: item.freshness.clone(),
            relation_path: item.relation_path.clone(),
            source_refs: item.source_refs.clone(),
            decrypt_needed: item.decrypt_needed,
        }
    }
}

#[derive(Clone, serde::Serialize, Default)]
pub(super) struct ContinuityPreparedContextPackItem {
    pub(super) id: String,
    pub(super) pack_kind: String,
    pub(super) title: String,
    pub(super) summary: String,
    pub(super) confidence: String,
    pub(super) why_surfaced: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) retrieval_mode: Option<String>,
    #[serde(default)]
    pub(super) deeper_retrieval_recommended: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) readiness_reason: Option<String>,
    #[serde(default)]
    pub(super) topology_budget_used: u32,
    #[serde(default)]
    pub(super) working_set_count: u32,
    #[serde(default)]
    pub(super) active_topic_count: u32,
    #[serde(default)]
    pub(super) anchor_refs: Vec<String>,
    #[serde(default)]
    pub(super) source_refs: Vec<String>,
    #[serde(default)]
    pub(super) reference_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) reference_labels: Vec<String>,
    #[serde(default)]
    pub(super) object_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) object_labels: Vec<String>,
    #[serde(default)]
    pub(super) file_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) file_labels: Vec<String>,
    #[serde(default)]
    pub(super) evidence_kinds: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) thread_retrieval_state: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) memory_space: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_mask: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) author_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) is_human_authored: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) human_only: Option<bool>,
}

impl From<&crate::prepared_context_packet::PreparedContextPack>
    for ContinuityPreparedContextPackItem
{
    fn from(item: &crate::prepared_context_packet::PreparedContextPack) -> Self {
        Self {
            id: item.pack_id.clone(),
            pack_kind: item.pack_kind.clone(),
            title: item.title.clone(),
            summary: item.summary.clone(),
            confidence: item.confidence.clone(),
            why_surfaced: item.why_surfaced.clone(),
            retrieval_mode: None,
            deeper_retrieval_recommended: false,
            readiness_reason: None,
            topology_budget_used: 0,
            working_set_count: 0,
            active_topic_count: 0,
            anchor_refs: item.anchor_refs.clone(),
            source_refs: item.source_refs.clone(),
            reference_refs: item.reference_refs.clone(),
            reference_labels: Vec::new(),
            object_refs: item.object_refs.clone(),
            object_labels: Vec::new(),
            file_refs: item.file_refs.clone(),
            file_labels: item.file_labels.clone(),
            evidence_kinds: item.evidence_kinds.clone(),
            thread_retrieval_state: None,
            memory_space: item.memory_space.clone(),
            author_mask: item.author_mask.clone(),
            author_type: item.author_type.clone(),
            author_id: item.author_id.clone(),
            is_human_authored: item.is_human_authored,
            human_only: item.human_only,
        }
    }
}

pub(super) type ContinuityStateFieldItem = StateFieldActivation;

#[derive(Clone, serde::Serialize)]
pub(super) struct DashboardContinuityMessage {
    pub(super) id: String,
    pub(super) thread_id: String,
    pub(super) timestamp: String,
    pub(super) r#type: String,
    pub(super) subtype: String,
    pub(super) content: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) parsed_content: Option<DashboardContinuityParsedContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) synthesizer_handoff: Option<SynthesizerToMasterHandoff>,
    pub(super) metadata: Value,
    pub(super) views: Value,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct DashboardContinuityStateResponse {
    pub(super) latest_state_snapshot_ref: Option<String>,
    pub(super) latest_state_synthesis_ref: Option<String>,
    pub(super) latest_state_snapshot: Option<DashboardContinuityMessage>,
    pub(super) latest_state_synthesis: Option<DashboardContinuityMessage>,
    pub(super) preferred_state_type: String,
    pub(super) preferred_state_brief: Option<DashboardContinuityBrief>,
    pub(super) preferred_synthesizer_handoff: Option<SynthesizerToMasterHandoff>,
    pub(super) preferred_priority_item: Option<ContinuityPriorityItem>,
    pub(super) preferred_priority_card: Option<ContinuityPriorityCard>,
    pub(super) preferred_action_items: Vec<ContinuityActionItem>,
    pub(super) preferred_action_overflow_count: usize,
    pub(super) preferred_action_overflow_summary: Option<String>,
    pub(super) preferred_response_items: Vec<ContinuityResponseItem>,
    pub(super) preferred_prepared_draft_items: Vec<ContinuityPreparedDraftItem>,
    pub(super) preferred_context_panel_items: Vec<ContinuityContextPanelItem>,
    pub(super) preferred_context_pack_items: Vec<ContinuityPreparedContextPackItem>,
    pub(super) preferred_state_fields: Vec<ContinuityStateFieldItem>,
}

#[derive(serde::Serialize)]
pub(super) struct ContinuitySummaryResponse {
    pub(super) messages: Vec<Value>,
    pub(super) state: DashboardContinuityStateResponse,
    pub(super) latest_state_snapshot_ref: Option<String>,
    pub(super) preferred_state_brief: Option<DashboardContinuityBrief>,
    pub(super) preferred_synthesizer_handoff: Option<SynthesizerToMasterHandoff>,
    pub(super) preferred_priority_item: Option<ContinuityPriorityItem>,
    pub(super) preferred_priority_card: Option<ContinuityPriorityCard>,
    pub(super) preferred_action_items: Vec<ContinuityActionItem>,
    pub(super) preferred_action_overflow_count: usize,
    pub(super) preferred_action_overflow_summary: Option<String>,
    pub(super) preferred_response_items: Vec<ContinuityResponseItem>,
    pub(super) preferred_prepared_draft_items: Vec<ContinuityPreparedDraftItem>,
    pub(super) preferred_context_panel_items: Vec<ContinuityContextPanelItem>,
    pub(super) preferred_context_pack_items: Vec<ContinuityPreparedContextPackItem>,
    pub(super) preferred_state_fields: Vec<ContinuityStateFieldItem>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct DashboardCostSnapshot {
    pub(super) total_usd: f64,
    pub(super) total_tokens: i64,
    pub(super) event_count: i64,
    pub(super) run_count: i64,
    pub(super) monthly_budget_usd: f64,
    pub(super) soft_limit_ratio: f64,
    pub(super) recent_spend_usd_14d: f64,
    pub(super) cost_month_usd: f64,
    pub(super) estimated_monthly_margin_usd: f64,
    pub(super) deep_queries_today: i64,
    pub(super) daily_deep_query_limit: i64,
    pub(super) margin_guard_active: bool,
    pub(super) usage_guard_active: bool,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct DashboardCostStatus {
    pub(super) level: String,
    pub(super) title: String,
    pub(super) detail: String,
    pub(super) action_label: String,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct WorkflowRuntimeSummary {
    pub(super) workflow_count: usize,
    pub(super) active_run_count: usize,
    pub(super) waiting_run_count: usize,
    pub(super) failed_run_count: usize,
    pub(super) completed_run_count: usize,
    pub(super) paused_wait_resume_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_workflow_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_run_status: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct BrowserRuntimeSummary {
    pub(super) task_count: usize,
    pub(super) active_task_count: usize,
    pub(super) blocked_task_count: usize,
    pub(super) step_approval_task_count: usize,
    pub(super) failed_task_count: usize,
    pub(super) completed_task_count: usize,
    pub(super) cancelled_task_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_task_goal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_task_status: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct TaskRuntimeSummary {
    pub(super) active_draft_task_count: usize,
    pub(super) cancelled_draft_task_count: usize,
    pub(super) total_draft_task_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_draft_task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_draft_task_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_draft_task_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_draft_task_thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_draft_task_action_message_id: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct CalendarRuntimeSummary {
    pub(super) tentative_hold_count: usize,
    pub(super) confirmed_event_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_tentative_event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_tentative_thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_tentative_action_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_tentative_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) next_tentative_start_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_tentative_location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_tentative_note_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_tentative_prep_lead_minutes: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_tentative_profile: Option<Value>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct TrustRuntimeSummary {
    pub(super) provenance_record_count: usize,
    pub(super) audited_action_count: usize,
    pub(super) pending_audit_count: usize,
    pub(super) failed_audit_count: usize,
    pub(super) successful_audit_count: usize,
    pub(super) reversible_action_count: usize,
    pub(super) undo_ready_action_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_provenance_action_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_audit_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_undo_label: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct FileRuntimeSummary {
    pub(super) ledger_create_count: usize,
    pub(super) ledger_update_count: usize,
    pub(super) export_result_count: usize,
    pub(super) active_staged_bundle_count: usize,
    pub(super) active_staged_bundle_file_count: usize,
    pub(super) staged_bundle_count: usize,
    pub(super) staged_bundle_file_count: usize,
    pub(super) discarded_bundle_count: usize,
    pub(super) active_file_entry_count: usize,
    pub(super) pending_access_request_count: usize,
    pub(super) active_grant_count: usize,
    pub(super) denied_access_count: usize,
    pub(super) revoked_access_count: usize,
    pub(super) file_op_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_ledger_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_action_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_action_thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_reversible_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_reversible_thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_activity: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct InboxRuntimeSummary {
    pub(super) active_staged_organization_count: usize,
    pub(super) staged_organization_count: usize,
    pub(super) reverted_organization_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_conversation_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_action_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_action_thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_activity: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct DeviceSyncRuntimeSummary {
    pub(super) device_policy_count: usize,
    pub(super) used_device_count: usize,
    pub(super) local_key_device_count: usize,
    pub(super) desktop_device_count: usize,
    pub(super) mobile_device_count: usize,
    pub(super) watch_device_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_device_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_device_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_policy_profile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_last_used_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_policy_note: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct SimulatorRuntimeSurfaceSummary {
    pub(super) surface: String,
    pub(super) enabled: bool,
    pub(super) allow_promotion: bool,
    pub(super) probabilistic_sampling_enabled: bool,
    pub(super) review_surfaces_enabled: bool,
    pub(super) rollout_stage: String,
    pub(super) calibration_mode: String,
    pub(super) policy_summary: String,
    pub(super) calibration_notes: Vec<String>,
}

#[derive(Clone, serde::Serialize)]
pub(super) struct SimulatorRuntimeSummary {
    pub(super) enabled_surface_count: usize,
    pub(super) promotion_enabled_surface_count: usize,
    pub(super) review_surface_count: usize,
    pub(super) sampled_surface_count: usize,
    pub(super) highest_rollout_stage: String,
    pub(super) policy_posture_summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) latest_observed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) observed_rollout_stage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) observed_calibration_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) observed_projection_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) observed_review_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) observed_actionable_event_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) observed_promotion_candidate_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) observed_review_surface_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) observed_calibration_notes: Vec<String>,
    pub(super) rollout_alignment_status: String,
    pub(super) rollout_alignment_summary: String,
    pub(super) surfaces: Vec<SimulatorRuntimeSurfaceSummary>,
}

#[derive(serde::Serialize)]
pub(super) struct DashboardBootstrapResponse {
    pub(super) user: SessionUserResponse,
    pub(super) agents: Vec<ManagedAgentRecord>,
    pub(super) messages: Vec<AFPMessage>,
    pub(super) thread_summaries: Vec<DashboardThreadSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) thread_retrieval_state: Option<Value>,
    pub(super) cost_snapshot: Option<DashboardCostSnapshot>,
    pub(super) cost_status: Option<DashboardCostStatus>,
    pub(super) workflow_runtime_summary: Option<WorkflowRuntimeSummary>,
    pub(super) browser_runtime_summary: Option<BrowserRuntimeSummary>,
    pub(super) task_runtime_summary: Option<TaskRuntimeSummary>,
    pub(super) calendar_runtime_summary: Option<CalendarRuntimeSummary>,
    pub(super) trust_runtime_summary: Option<TrustRuntimeSummary>,
    pub(super) file_runtime_summary: Option<FileRuntimeSummary>,
    pub(super) inbox_runtime_summary: Option<InboxRuntimeSummary>,
    pub(super) device_sync_runtime_summary: Option<DeviceSyncRuntimeSummary>,
    pub(super) simulator_runtime_summary: Option<SimulatorRuntimeSummary>,
    pub(super) continuity_state: Option<DashboardContinuityMessage>,
    pub(super) continuity_brief: Option<DashboardContinuityBrief>,
    pub(super) continuity_handoff: Option<SynthesizerToMasterHandoff>,
    pub(super) continuity_surface_hint: Option<String>,
    pub(super) continuity_requires_approval: bool,
    pub(super) continuity_panel_kind: String,
    pub(super) continuity_primary_mode: String,
    pub(super) continuity_priority_item: Option<ContinuityPriorityItem>,
    pub(super) continuity_priority_card: Option<ContinuityPriorityCard>,
    pub(super) continuity_action_items: Vec<ContinuityActionItem>,
    pub(super) continuity_action_overflow_count: usize,
    pub(super) continuity_action_overflow_summary: Option<String>,
    pub(super) continuity_response_items: Vec<ContinuityResponseItem>,
    pub(super) continuity_prepared_draft_items: Vec<ContinuityPreparedDraftItem>,
    pub(super) continuity_context_panel_items: Vec<ContinuityContextPanelItem>,
    pub(super) continuity_context_pack_items: Vec<ContinuityPreparedContextPackItem>,
    pub(super) continuity_state_fields: Vec<ContinuityStateFieldItem>,
    pub(super) action_log: Vec<ActionAuditEntry>,
    pub(super) proactive_suggestions: Vec<serde_json::Value>,
    pub(super) enabled_heuristic_packs: Vec<String>,
    pub(super) onboarding: UserOnboardingRecord,
    pub(super) device_sync_policies: DeviceSyncPoliciesResponse,
    pub(super) support_access: SupportAccessStateResponse,
    pub(super) support_access_history: Vec<SupportAccessHistoryEntry>,
    pub(super) sessions: Vec<AccountSessionEntry>,
    pub(super) runtime_backups: RuntimeBackupsResponse,
    pub(super) runtime_restore_drills: RuntimeRestoreDrillsResponse,
    pub(super) runtime_updates: RuntimeUpdatesResponse,
    pub(super) runtime_deployment: Option<RuntimeDeploymentResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) operational_guidance: Option<RuntimeOperationalGuidanceResponse>,
}

#[derive(Clone)]
pub(super) struct DashboardContinuityPayload {
    pub(super) continuity_state: Option<DashboardContinuityMessage>,
    pub(super) continuity_brief: Option<DashboardContinuityBrief>,
    pub(super) continuity_handoff: Option<SynthesizerToMasterHandoff>,
    pub(super) continuity_surface_hint: Option<String>,
    pub(super) continuity_requires_approval: bool,
    pub(super) continuity_panel_kind: String,
    pub(super) continuity_primary_mode: String,
    pub(super) continuity_priority_item: Option<ContinuityPriorityItem>,
    pub(super) continuity_priority_card: Option<ContinuityPriorityCard>,
    pub(super) continuity_action_items: Vec<ContinuityActionItem>,
    pub(super) continuity_action_overflow_count: usize,
    pub(super) continuity_action_overflow_summary: Option<String>,
    pub(super) continuity_response_items: Vec<ContinuityResponseItem>,
    pub(super) continuity_prepared_draft_items: Vec<ContinuityPreparedDraftItem>,
    pub(super) continuity_context_panel_items: Vec<ContinuityContextPanelItem>,
    pub(super) continuity_context_pack_items: Vec<ContinuityPreparedContextPackItem>,
    pub(super) continuity_state_fields: Vec<ContinuityStateFieldItem>,
}

#[derive(serde::Serialize)]
pub(super) struct DashboardExportScopeResponse {
    pub(super) includes: Vec<String>,
    pub(super) excludes: Vec<String>,
    pub(super) recent_message_count: usize,
    pub(super) thread_summary_count: usize,
    pub(super) action_log_count: usize,
    pub(super) session_count: usize,
}

#[derive(serde::Serialize)]
pub(super) struct DashboardExportResponse {
    pub(super) exported_at: String,
    pub(super) export_version: String,
    pub(super) export_scope: DashboardExportScopeResponse,
    pub(super) user: SessionUserResponse,
    pub(super) agents: Vec<ManagedAgentRecord>,
    pub(super) cost_snapshot: Option<DashboardCostSnapshot>,
    pub(super) cost_status: Option<DashboardCostStatus>,
    pub(super) workflow_runtime_summary: Option<WorkflowRuntimeSummary>,
    pub(super) browser_runtime_summary: Option<BrowserRuntimeSummary>,
    pub(super) task_runtime_summary: Option<TaskRuntimeSummary>,
    pub(super) calendar_runtime_summary: Option<CalendarRuntimeSummary>,
    pub(super) trust_runtime_summary: Option<TrustRuntimeSummary>,
    pub(super) file_runtime_summary: Option<FileRuntimeSummary>,
    pub(super) inbox_runtime_summary: Option<InboxRuntimeSummary>,
    pub(super) device_sync_runtime_summary: Option<DeviceSyncRuntimeSummary>,
    pub(super) simulator_runtime_summary: Option<SimulatorRuntimeSummary>,
    pub(super) continuity_state: Option<DashboardContinuityMessage>,
    pub(super) continuity_brief: Option<DashboardContinuityBrief>,
    pub(super) continuity_handoff: Option<SynthesizerToMasterHandoff>,
    pub(super) continuity_surface_hint: Option<String>,
    pub(super) continuity_requires_approval: bool,
    pub(super) continuity_panel_kind: String,
    pub(super) continuity_primary_mode: String,
    pub(super) continuity_priority_item: Option<ContinuityPriorityItem>,
    pub(super) continuity_priority_card: Option<ContinuityPriorityCard>,
    pub(super) continuity_action_items: Vec<ContinuityActionItem>,
    pub(super) continuity_action_overflow_count: usize,
    pub(super) continuity_action_overflow_summary: Option<String>,
    pub(super) continuity_response_items: Vec<ContinuityResponseItem>,
    pub(super) continuity_prepared_draft_items: Vec<ContinuityPreparedDraftItem>,
    pub(super) continuity_context_panel_items: Vec<ContinuityContextPanelItem>,
    pub(super) continuity_context_pack_items: Vec<ContinuityPreparedContextPackItem>,
    pub(super) continuity_state_fields: Vec<ContinuityStateFieldItem>,
    pub(super) onboarding: UserOnboardingRecord,
    pub(super) device_sync_policies: DeviceSyncPoliciesResponse,
    pub(super) support_access: SupportAccessStateResponse,
    pub(super) support_access_history: Vec<SupportAccessHistoryEntry>,
    pub(super) sessions: Vec<AccountSessionEntry>,
    pub(super) runtime_backups: RuntimeBackupsResponse,
    pub(super) runtime_restore_drills: RuntimeRestoreDrillsResponse,
    pub(super) runtime_updates: RuntimeUpdatesResponse,
    pub(super) runtime_deployment: Option<RuntimeDeploymentResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) operational_guidance: Option<RuntimeOperationalGuidanceResponse>,
    pub(super) recent_messages: Vec<AFPMessage>,
    pub(super) thread_summaries: Vec<DashboardThreadSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) thread_retrieval_state: Option<Value>,
    pub(super) action_log: Vec<ActionAuditEntry>,
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct DashboardThreadSummary {
    pub(crate) thread_id: String,
    pub(super) title: String,
    pub(super) preview: String,
    pub(super) message_count: usize,
    pub(super) last_message_at: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub(super) activity_freshness: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) dominant_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) supertags: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) metadata_terms: Vec<String>,
    pub(super) score: i32,
}

#[derive(serde::Serialize)]
pub(super) struct ProactiveSuggestionsResponse {
    pub(super) items: Vec<Value>,
    pub(super) count: usize,
    pub(super) observability: Value,
    pub(super) cost_status: Option<DashboardCostStatus>,
    pub(super) continuity_state: Option<DashboardContinuityMessage>,
    pub(super) continuity_brief: Option<DashboardContinuityBrief>,
    pub(super) continuity_handoff: Option<SynthesizerToMasterHandoff>,
    pub(super) continuity_surface_hint: Option<String>,
    pub(super) continuity_requires_approval: bool,
    pub(super) continuity_panel_kind: String,
    pub(super) continuity_primary_mode: String,
    pub(super) continuity_priority_item: Option<ContinuityPriorityItem>,
    pub(super) continuity_priority_card: Option<ContinuityPriorityCard>,
    pub(super) continuity_action_items: Vec<ContinuityActionItem>,
    pub(super) continuity_response_items: Vec<ContinuityResponseItem>,
    pub(super) continuity_prepared_draft_items: Vec<ContinuityPreparedDraftItem>,
    pub(super) continuity_context_panel_items: Vec<ContinuityContextPanelItem>,
    pub(super) continuity_context_pack_items: Vec<ContinuityPreparedContextPackItem>,
    pub(super) continuity_state_fields: Vec<ContinuityStateFieldItem>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) conversation_attention_items: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) conversation_attention_summary: Option<Value>,
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
    pub(super) session_ref: String,
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
pub(super) struct AdminUserDetailResponse {
    pub(super) user_id: String,
    pub(super) email: String,
    pub(super) display_name: String,
    pub(super) auth_provider: String,
    pub(super) created_at: String,
    pub(super) account_status: String,
    pub(super) account_status_reason: Option<String>,
    pub(super) support_access: SupportAccessStateResponse,
    pub(super) support_access_history: Vec<SupportAccessHistoryEntry>,
    pub(super) sessions: Vec<AccountSessionEntry>,
}

#[derive(serde::Serialize)]
pub(super) struct OperatorRuntimeRemediationReceiptResponse {
    pub(super) ok: bool,
    pub(super) action: String,
    pub(super) receipt_id: String,
    pub(super) lifecycle_status: String,
    pub(super) issued_at: String,
    pub(super) execution_mode: String,
    pub(super) approval_required: bool,
    pub(super) summary: String,
    pub(super) command: String,
    pub(super) source: String,
    pub(super) guidance_status: String,
    pub(super) pressure_status: Option<String>,
    pub(super) pressure_total_rows: Option<i64>,
    pub(super) cleanup_mode: Option<String>,
    pub(super) artifact_generated_at: Option<String>,
    pub(super) note: Option<String>,
    pub(super) completed_at: Option<String>,
    pub(super) outcome_note: Option<String>,
    pub(super) proof_reference: Option<String>,
}

#[derive(serde::Serialize)]
pub(super) struct OperatorRuntimeRemediationHistoryResponse {
    pub(super) entries: Vec<OperatorRuntimeRemediationReceiptResponse>,
    pub(super) retention: Value,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) operational_guidance: Option<RuntimeOperationalGuidanceResponse>,
    pub(super) recovery_checklist: Vec<String>,
    pub(super) privacy_notes: Vec<String>,
}

#[derive(serde::Serialize)]
pub(super) struct RuntimeOperationalGuidanceResponse {
    pub(super) status: String,
    pub(super) summary: String,
    pub(super) command: String,
    pub(super) source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) pressure_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) pressure_total_rows: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) cleanup_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) generated_at: Option<String>,
}

#[derive(serde::Deserialize)]
pub(super) struct DeviceBootstrapRequest {
    pub(super) device_class: String,
    pub(super) device_id: Option<String>,
    pub(super) policy_profile: Option<String>,
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
    pub(super) policy_profile: String,
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
    pub(super) updated_at: String,
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
    pub(super) iss: Option<String>,
    pub(super) exp: Option<String>,
    pub(super) iat: Option<String>,
    pub(super) name: Option<String>,
    pub(super) given_name: Option<String>,
}
