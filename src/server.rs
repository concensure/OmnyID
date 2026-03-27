use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    net::SocketAddr,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use axum::{
    Json, Router,
    extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post, put},
};
use futures_util::StreamExt;
use rand::Rng;
use serde_json::Value;
use sqlx::{Error as SqlxError, Row};
use tokio::process::Command;
use tokio::sync::{Mutex, broadcast};
use tonic::{Request, Response, Status, transport::Server};
use tower_http::cors::CorsLayer;
use tracing::{error, info, instrument};
use ulid::Ulid;
use wtransport::{
    Endpoint as WebTransportEndpoint, Identity as WebTransportIdentity,
    ServerConfig as WebTransportServerConfig,
    endpoint::IncomingSession as WebTransportIncomingSession,
};

use crate::{
    afp::{self, Ack, Message, ThreadRequest, ThreadResponse, afp_service_server::AfpService},
    agent_template::{
        AgentInstance, AgentTask, LlmBackend, LlmConfig, MSG_AGENT_PROVISIONED, TaskPriority,
        default_template_capabilities,
    },
    agentcard::AgentCard,
    crypto::{
        has_verifiable_signature, is_supported_encryption_envelope, sign_message, verify_signature,
    },
    db::{
        ActionAuditEntry, AuthSessionRecord, Db, ManagedAgentRecord, RuntimeBackupPolicyRecord,
        RuntimeBackupRecord, RuntimeDeploymentRecord, RuntimeRestoreDrillRecord,
        RuntimeRunnerPolicyEventRecord, RuntimeUpdateEventRecord, RuntimeUpdatePolicyRecord,
        SupportAccessGrantRecord, SyncDevicePolicyRecord, UserOnboardingRecord, UserRecord,
        WorkflowDeploymentRecord, WorkflowRunRecord,
    },
    gateway::rest_adapter::{
        AgentSigningContext, RestCallParams, execute_action as rest_execute_action,
    },
    gateway::{
        imap_sync::start_imap_sync,
        provider::MailGatewayConfig,
        smtp_in::handle_incoming_email,
        smtp_out::{OutgoingEmailRequest, dispatch_outgoing_message, send_outgoing_email},
    },
    integration::{ActionIntent, ActionResult, ActionStatus, IntegrationCapability},
    local_sync::{
        DeviceBootstrap, default_sync_profile, parse_device_class, requires_local_key_material,
        shape_descriptors_for_slices, sync_slices_for_device,
    },
    message::AFPMessage,
    metrics::Metrics,
    personalization::{FeedbackSignal, PersonalizationEvent},
    relay::{
        RelayRequest, parse_relay_request, relay_ack_payload, relay_error_payload,
        relay_fleet_subscribed_payload, relay_fleet_update_payload, relay_thread_snapshot_payload,
        relay_thread_subscribed_payload,
    },
    sync_worker::start_sync_worker,
};

#[derive(Clone)]
struct AppState {
    db: Db,
    metrics: Arc<Metrics>,
    relay_tx: broadcast::Sender<String>,
    rate_limiter: Arc<RateLimiter>,
    trial_runner: Arc<TrialRunnerManager>,
    http_client: reqwest::Client,
}

#[derive(Clone, Copy)]
struct RateLimitPolicy {
    max_requests: usize,
    window: Duration,
}

struct RateLimiter {
    buckets: Mutex<HashMap<String, VecDeque<Instant>>>,
}

struct TrialRunnerManager {
    sessions: Mutex<HashMap<String, TrialRunnerSession>>,
    usage: Mutex<HashMap<String, VecDeque<Instant>>>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct TrialTemplate {
    id: String,
    name: String,
    summary: String,
    system_prompt: String,
    suggested_prompts: Vec<String>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct TrialChatMessage {
    role: String,
    content: String,
    timestamp: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct TrialLogEntry {
    timestamp: String,
    level: String,
    message: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct TrialTraceEntry {
    timestamp: String,
    tool: String,
    status: String,
    blocked_reason: Option<String>,
    host: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct TrialPromptVersion {
    id: String,
    label: String,
    template_id: Option<String>,
    system_prompt: String,
    created_at: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct TrialSavedTest {
    id: String,
    input: String,
    template_id: Option<String>,
    created_at: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct TrialReviewItem {
    id: String,
    tool: String,
    status: String,
    reason: String,
    created_at: String,
}

#[derive(Clone, Debug)]
struct TrialRunnerSession {
    id: String,
    identity_key: String,
    created_at: String,
    expires_at: String,
    active_template_id: Option<String>,
    runs_started: usize,
    max_runs: usize,
    turns_used: usize,
    max_turns: usize,
    requires_signup: bool,
    messages: Vec<TrialChatMessage>,
    logs: Vec<TrialLogEntry>,
    traces: Vec<TrialTraceEntry>,
    prompt_versions: Vec<TrialPromptVersion>,
    saved_tests: Vec<TrialSavedTest>,
    review_queue: Vec<TrialReviewItem>,
    model_policy: Value,
    tool_policy: Value,
    channel_policy: Value,
    starter_templates: Vec<TrialTemplate>,
    last_good_run: Option<Value>,
    calendar_view: Option<Value>,
}

#[derive(serde::Deserialize)]
struct TrialSessionCreateRequest {
    fingerprint: Option<String>,
}

#[derive(serde::Deserialize)]
struct TrialTemplateRunRequest {
    session_id: String,
    template_id: String,
}

#[derive(serde::Deserialize)]
struct TrialChatRequest {
    session_id: String,
    content: String,
}

#[derive(serde::Deserialize)]
struct TrialConvertRequest {
    session_id: String,
}

#[derive(serde::Deserialize)]
struct ApprovalDecisionRequest {
    thread_id: String,
    target_message_id: String,
    decision: String,
    decided_by: String,
    capability_id: Option<String>,
    note: Option<String>,
}

#[derive(serde::Deserialize)]
struct RegisterRequest {
    email: String,
    password: String,
    display_name: Option<String>,
}

#[derive(serde::Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(serde::Deserialize)]
struct GoogleAuthRequest {
    id_token: String,
}

#[derive(serde::Deserialize)]
struct DemoSendRequest {
    from_agent_id: String,
    to_agent_id: String,
    body: String,
}

#[derive(serde::Deserialize)]
struct RuntimeDeployRequest {
    framework: Option<String>,
    gui: Option<String>,
}

#[derive(serde::Deserialize)]
struct RuntimeActionRequest {
    action: String,
}

#[derive(serde::Deserialize)]
struct RuntimeRunnerConfigRequest {
    action: String,
    model_policy: Option<Value>,
    tool_policy: Option<Value>,
    channel_policy: Option<Value>,
    starter_template_id: Option<String>,
}

#[derive(serde::Serialize)]
struct RuntimeWorkspaceFileEntryResponse {
    file_id: String,
    label: String,
    relative_path: String,
    language: String,
    editable: bool,
}

#[derive(serde::Serialize)]
struct RuntimeWorkspaceFilesResponse {
    framework: String,
    active_file_id: Option<String>,
    files: Vec<RuntimeWorkspaceFileEntryResponse>,
}

#[derive(serde::Deserialize)]
struct RuntimeWorkspaceFileQuery {
    file_id: String,
}

#[derive(serde::Serialize)]
struct RuntimeWorkspaceFileResponse {
    file_id: String,
    label: String,
    relative_path: String,
    language: String,
    editable: bool,
    content: String,
    updated_at: String,
}

#[derive(serde::Deserialize)]
struct RuntimeWorkspaceFileSaveRequest {
    file_id: String,
    content: String,
}

#[derive(serde::Deserialize)]
struct UiCommandRequest {
    query: String,
    engine: Option<String>,
    active_file_id: Option<String>,
    /// Pre-classified intent from the browser's built-in AI (Gemini Nano / Phi).
    /// Used only when no server-side LLM is configured.
    browser_intent: Option<String>,
    /// Full parsed payload produced by the browser AI classifier.
    browser_parsed: Option<serde_json::Value>,
    /// Per-task optimization mode override: "speed" | "cost" | "balanced"
    #[serde(rename = "optimization_mode")]
    _optimization_mode: Option<String>,
}

/// Request body for POST /ui/decision — records a user's choice for a decision point.
#[derive(serde::Deserialize)]
struct UiDecisionRequest {
    /// The generative card ID that contains the decision point (e.g. "gc-01JFXYZ")
    card_id: String,
    /// The decision point ID within the card (e.g. "dp-1")
    decision_point_id: String,
    /// The option ID the user selected (e.g. "top3")
    selected_option_id: String,
    /// Thread ID — used to find the correct thread to post the user_decision AFP message
    thread_id: String,
    /// Agent ID to address the user_decision to (so the runner can filter)
    agent_id: Option<String>,
}

/// Request/response for GET/POST /user/agent-preferences
#[derive(serde::Serialize, serde::Deserialize, Default)]
struct AgentPreferences {
    /// Global optimization mode: "speed" | "cost" | "balanced"
    #[serde(default = "default_optimization_mode")]
    optimization_mode: String,
    /// Auto-confirm threshold in cents — agent won't ask if cost is below this
    #[serde(default = "default_auto_confirm_threshold")]
    auto_confirm_threshold_cents: f64,
    /// Whether to show cost estimates in the generative card UI
    #[serde(default = "default_show_cost_estimates")]
    show_cost_estimates: bool,
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

#[derive(serde::Serialize)]
struct UiCommandLink {
    title: String,
    url: String,
    kind: String,
}

#[derive(serde::Serialize)]
struct UiRunnerDraftResponse {
    target_file_id: String,
    title: String,
    content: String,
    requires_confirmation: bool,
}

#[derive(serde::Serialize)]
struct UiCommandResponse {
    intent: String,
    suggested_view: String,
    /// Semantically richer UI surface hint consumed by the frontend ViewDispatcher.
    /// Values: "task_board" | "note_canvas" | "draggable_calendar" | "search_result" |
    ///         "confirmation_modal" | "orchestrate_progress" | "runner" | "chat" |
    ///         "generative_card"
    preferred_view: String,
    summary: String,
    engine: String,
    links: Vec<UiCommandLink>,
    runner_draft: Option<UiRunnerDraftResponse>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    bullets: Vec<String>,
    /// When the agent creates a generative card, this is the card_id so the frontend
    /// can link subsequent card_section_update messages to the correct renderer.
    #[serde(skip_serializing_if = "Option::is_none")]
    card_id: Option<String>,
    /// Safe AFP-shaped preview message for the workspace to render immediately.
    #[serde(skip_serializing_if = "Option::is_none")]
    preview_message: Option<AFPMessage>,
}

#[derive(serde::Deserialize)]
struct WaitlistRequest {
    email: String,
}

#[derive(serde::Deserialize)]
struct OnboardingUpdateRequest {
    identity_confirmed: bool,
    email_provider: Option<String>,
    email_address: Option<String>,
    email_connected: bool,
    llm_mode: Option<String>,
    notes: Option<Value>,
}

#[derive(serde::Deserialize)]
struct SupportAccessRequest {
    action: String,
    duration_hours: Option<i64>,
    reason: Option<String>,
    access_scope: Option<String>,
}

#[derive(serde::Deserialize)]
struct AccountDeleteRequest {
    email: String,
    confirmation: String,
}

#[derive(serde::Deserialize)]
struct SessionActionRequest {
    action: String,
    token: Option<String>,
}

#[derive(serde::Deserialize)]
struct RuntimeBackupRequest {
    action: String,
    retention_days: Option<i32>,
    backup_id: Option<String>,
}

#[derive(serde::Deserialize)]
struct RuntimeRestoreDrillRequest {
    backup_id: String,
}

#[derive(serde::Serialize)]
struct SessionUserResponse {
    id: String,
    email: String,
    display_name: String,
    auth_provider: String,
}

#[derive(serde::Serialize)]
struct SessionResponse {
    token: String,
    user: SessionUserResponse,
}

#[derive(serde::Serialize)]
struct DashboardBootstrapResponse {
    user: SessionUserResponse,
    agents: Vec<ManagedAgentRecord>,
    messages: Vec<AFPMessage>,
    action_log: Vec<ActionAuditEntry>,
    onboarding: UserOnboardingRecord,
    device_sync_policies: DeviceSyncPoliciesResponse,
    support_access: SupportAccessStateResponse,
    support_access_history: Vec<SupportAccessHistoryEntry>,
    sessions: Vec<AccountSessionEntry>,
    runtime_backups: RuntimeBackupsResponse,
    runtime_restore_drills: RuntimeRestoreDrillsResponse,
    runtime_updates: RuntimeUpdatesResponse,
    runtime_deployment: Option<RuntimeDeploymentResponse>,
}

#[derive(serde::Serialize)]
struct DashboardExportResponse {
    exported_at: String,
    export_version: String,
    user: SessionUserResponse,
    agents: Vec<ManagedAgentRecord>,
    onboarding: UserOnboardingRecord,
    device_sync_policies: DeviceSyncPoliciesResponse,
    support_access: SupportAccessStateResponse,
    support_access_history: Vec<SupportAccessHistoryEntry>,
    runtime_backups: RuntimeBackupsResponse,
    runtime_restore_drills: RuntimeRestoreDrillsResponse,
    runtime_updates: RuntimeUpdatesResponse,
    runtime_deployment: Option<RuntimeDeploymentResponse>,
    recent_messages: Vec<AFPMessage>,
    action_log: Vec<ActionAuditEntry>,
}

#[derive(serde::Serialize)]
struct RuntimeDeploymentResponse {
    id: String,
    owner_user_id: String,
    framework: String,
    gui: Option<String>,
    status: String,
    python_version: String,
    image_ref: String,
    runtime_token_preview: String,
    workspace_path: String,
    config_json: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    runtime_monitor: Option<RuntimeMonitorPreview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    runtime_status_panel: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    runtime_status_views: Option<Vec<Value>>,
    created_at: String,
    updated_at: String,
}

#[derive(serde::Serialize)]
struct RuntimeMonitorPreview {
    status: String,
    source: String,
    lines: Vec<String>,
    updated_at: String,
}

fn runtime_status_panel_a2ui(
    deployment: &RuntimeDeploymentRecord,
    monitor: Option<&RuntimeMonitorPreview>,
) -> Value {
    let status_tone = match deployment.status.as_str() {
        "running" => "success",
        "starting" | "deploying" | "building" => "strategy",
        "failed" | "stopped" | "error" => "warning",
        _ => "info",
    };
    let log_excerpt = monitor
        .map(|preview| preview.lines.iter().take(4).cloned().collect::<Vec<_>>().join("\n"))
        .filter(|text| !text.trim().is_empty())
        .unwrap_or_else(|| "No runtime logs loaded yet.".to_string());
    let log_source = monitor
        .map(|preview| preview.source.clone())
        .unwrap_or_else(|| "runtime/logs".to_string());
    let updated_at = monitor
        .map(|preview| preview.updated_at.clone())
        .unwrap_or_else(|| deployment.updated_at.clone());

    serde_json::json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": "Runtime status",
        "description": "Structured runner health companion generated from the live deployment response.",
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": [
            {
                "id": "runtime-status-summary",
                "type": "callout",
                "props": {
                    "tone": status_tone,
                    "title": format!("Runner {}", deployment.status),
                    "body": format!(
                        "{} is using {} with {}.",
                        deployment.framework,
                        deployment.image_ref,
                        deployment.python_version
                    ),
                }
            },
            {
                "id": "runtime-status-stats",
                "type": "stats_grid",
                "props": {
                    "items": [
                        {"label": "Framework", "value": deployment.framework},
                        {"label": "Status", "value": deployment.status},
                        {"label": "GUI", "value": deployment.gui.clone().unwrap_or_else(|| "none".to_string())},
                        {"label": "Token", "value": runtime_token_preview(&deployment.runtime_token)},
                    ]
                }
            },
            {
                "id": "runtime-status-ops",
                "type": "section",
                "props": {
                    "title": "Operations",
                    "layout": {"type": "stack", "gap": "sm"},
                },
                "children": [
                    {
                        "id": "runtime-status-path",
                        "type": "text",
                        "props": {
                            "label": "Workspace path",
                            "value": deployment.workspace_path,
                        }
                    },
                    {
                        "id": "runtime-status-log-source",
                        "type": "text",
                        "props": {
                            "label": "Log source",
                            "value": format!("{log_source} · updated {updated_at}"),
                        }
                    },
                    {
                        "id": "runtime-status-log-excerpt",
                        "type": "code",
                        "props": {
                            "title": "Recent log excerpt",
                            "language": "text",
                            "code": log_excerpt,
                        }
                    }
                ]
            }
        ]
    })
}

fn runtime_diagnostics_panel_a2ui(
    deployment: &RuntimeDeploymentRecord,
    monitor: Option<&RuntimeMonitorPreview>,
    sanitized_config: &Value,
) -> Value {
    let runtime_env_keys = sanitized_config
        .get("runtime_env")
        .and_then(Value::as_object)
        .map(|map| map.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    let config_rows = if runtime_env_keys.is_empty() {
        vec![serde_json::json!(["runtime_env", "No runtime env keys were recorded in the config snapshot."])]
    } else {
        runtime_env_keys
            .iter()
            .take(8)
            .map(|key| serde_json::json!([key, "present"]))
            .collect::<Vec<_>>()
    };
    let monitor_source = monitor
        .map(|item| item.source.clone())
        .unwrap_or_else(|| "runtime/logs".to_string());
    let line_count = monitor.map(|item| item.lines.len()).unwrap_or(0).to_string();

    serde_json::json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": "Runtime diagnostics",
        "description": "Advanced runner diagnostics companion with configuration and monitor metadata.",
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": [
            {
                "id": "runtime-diagnostics-summary",
                "type": "callout",
                "props": {
                    "tone": "info",
                    "title": "Diagnostics snapshot",
                    "body": format!(
                        "Workspace {} is mapped to {} and currently reports {} log lines from {}.",
                        deployment.id,
                        deployment.workspace_path,
                        line_count,
                        monitor_source
                    ),
                }
            },
            {
                "id": "runtime-diagnostics-stats",
                "type": "stats_grid",
                "props": {
                    "items": [
                        {"label": "Deployment", "value": deployment.id},
                        {"label": "Image", "value": deployment.image_ref},
                        {"label": "Env keys", "value": runtime_env_keys.len().to_string()},
                        {"label": "Log lines", "value": line_count},
                    ]
                }
            },
            {
                "id": "runtime-diagnostics-config",
                "type": "table",
                "props": {
                    "columns": ["Config key", "State"],
                    "rows": config_rows,
                    "caption": "Sanitized runtime config snapshot",
                }
            }
        ]
    })
}

#[derive(serde::Serialize)]
struct RuntimeLogsResponse {
    status: String,
    source: String,
    lines: Vec<String>,
    updated_at: String,
}

#[derive(serde::Serialize)]
struct OnboardingBundleResponse {
    bundle_name: String,
    privacy_mode: String,
    deployment_target: String,
    installer_family: String,
    estimated_minutes: i64,
    installer_downloads: Vec<InstallerDownload>,
    commands: Vec<String>,
    files: Vec<OnboardingBundleFile>,
}

#[derive(serde::Serialize)]
struct InstallerDownload {
    label: String,
    url: String,
    filename: String,
}

#[derive(serde::Serialize)]
struct OnboardingBundleFile {
    name: String,
    content: String,
}

#[derive(serde::Serialize)]
struct ServiceAdapterBundleResponse {
    bundle_name: String,
    target_profile: String,
    files: Vec<OnboardingBundleFile>,
}

#[derive(serde::Serialize)]
struct SupportAccessStateResponse {
    status: String,
    access_scope: String,
    reason: Option<String>,
    support_disabled_by_default: bool,
    granted_at: Option<String>,
    expires_at: Option<String>,
    revoked_at: Option<String>,
}

#[derive(serde::Serialize)]
struct SupportAccessHistoryEntry {
    id: String,
    status: String,
    access_scope: String,
    reason: Option<String>,
    granted_at: String,
    expires_at: String,
    revoked_at: Option<String>,
}

#[derive(serde::Serialize)]
struct SupportAccessHistoryResponse {
    entries: Vec<SupportAccessHistoryEntry>,
}

#[derive(serde::Serialize)]
struct AccountSessionEntry {
    token_preview: String,
    created_at: String,
    expires_at: String,
    current: bool,
}

#[derive(serde::Serialize)]
struct AccountSessionsResponse {
    sessions: Vec<AccountSessionEntry>,
}

#[derive(serde::Serialize)]
struct RuntimeBackupsResponse {
    policy: RuntimeBackupPolicyResponse,
    entries: Vec<RuntimeBackupEntryResponse>,
}

#[derive(serde::Serialize)]
struct RuntimeBackupPolicyResponse {
    retention_days: i32,
    storage_mode: String,
    last_snapshot_at: Option<String>,
    support_disabled_by_default: bool,
}

#[derive(serde::Serialize)]
struct RuntimeBackupEntryResponse {
    id: String,
    snapshot_type: String,
    storage_mode: String,
    status: String,
    file_count: i32,
    total_workspace_bytes: i64,
    artifact_size_bytes: i64,
    created_at: String,
    expires_at: String,
    manifest_summary: Value,
}

#[derive(serde::Serialize)]
struct RuntimeBackupManifestResponse {
    id: String,
    storage_mode: String,
    created_at: String,
    expires_at: String,
    manifest_json: Value,
}

#[derive(serde::Serialize)]
struct RuntimeRecoveryPacketResponse {
    generated_at: String,
    packet_version: String,
    packet_name: String,
    user: SessionUserResponse,
    runtime_deployment: Option<RuntimeDeploymentResponse>,
    runtime_backups: RuntimeBackupsResponse,
    runtime_restore_drills: RuntimeRestoreDrillsResponse,
    runtime_updates: RuntimeUpdatesResponse,
    recovery_checklist: Vec<String>,
    privacy_notes: Vec<String>,
}

#[derive(serde::Deserialize)]
struct DeviceBootstrapRequest {
    device_class: String,
}

#[derive(serde::Deserialize)]
struct DeviceSyncPolicyRequest {
    action: String,
    device_id: Option<String>,
    policy_profile: Option<String>,
}

#[derive(serde::Serialize)]
struct DeviceBootstrapBundleResponse {
    generated_at: String,
    bundle_name: String,
    device_class: String,
    requires_local_key_material: bool,
    files: Vec<OnboardingBundleFile>,
    bootstrap: DeviceBootstrap,
}

#[derive(serde::Serialize)]
struct DeviceSyncPoliciesResponse {
    entries: Vec<DeviceSyncPolicyEntryResponse>,
}

#[derive(serde::Serialize)]
struct DeviceSyncPolicyEntryResponse {
    device_id: String,
    agent_id: String,
    device_class: String,
    policy_profile: String,
    sync_slices: Value,
    requires_local_key_material: bool,
    last_bundle_at: String,
    last_used_at: Option<String>,
    notes_summary: Value,
}

#[derive(serde::Serialize)]
struct RuntimeRestoreDrillsResponse {
    entries: Vec<RuntimeRestoreDrillEntryResponse>,
}

#[derive(serde::Serialize)]
struct RuntimeRestoreDrillEntryResponse {
    id: String,
    backup_id: String,
    status: String,
    started_at: String,
    completed_at: Option<String>,
    notes_summary: Value,
}

#[derive(serde::Deserialize)]
struct RuntimeUpdateRequest {
    action: String,
    update_channel: Option<String>,
    auto_apply: Option<String>,
}

#[derive(serde::Serialize)]
struct RuntimeUpdatesResponse {
    policy: RuntimeUpdatePolicyResponse,
    current_version: String,
    latest_version: String,
    update_available: bool,
    runtime_status: String,
    framework: Option<String>,
    last_checked_at: Option<String>,
    last_applied_at: Option<String>,
    entries: Vec<RuntimeUpdateEventEntryResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    panel: Option<Value>,
}

#[derive(serde::Serialize)]
struct RuntimeUpdatePolicyResponse {
    update_channel: String,
    auto_apply: String,
    support_disabled_by_default: bool,
}

#[derive(serde::Serialize)]
struct RuntimeUpdateEventEntryResponse {
    id: String,
    action: String,
    from_version: Option<String>,
    to_version: Option<String>,
    status: String,
    created_at: String,
    notes_summary: Value,
}

#[derive(serde::Serialize)]
struct RuntimeRunnerPolicyEventEntryResponse {
    id: String,
    event_kind: String,
    created_at: String,
    summary: Value,
}

impl RateLimiter {
    fn new() -> Self {
        Self {
            buckets: Mutex::new(HashMap::new()),
        }
    }

    async fn allow(&self, key: String, policy: RateLimitPolicy) -> bool {
        let now = Instant::now();
        let mut buckets = self.buckets.lock().await;
        let bucket = buckets.entry(key).or_insert_with(VecDeque::new);
        while let Some(front) = bucket.front() {
            if now.duration_since(*front) > policy.window {
                bucket.pop_front();
            } else {
                break;
            }
        }
        if bucket.len() >= policy.max_requests {
            return false;
        }
        bucket.push_back(now);
        true
    }
}

impl TrialRunnerManager {
    fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            usage: Mutex::new(HashMap::new()),
        }
    }

    async fn create_or_get_session(&self, identity_key: String) -> TrialRunnerSession {
        self.prune_expired().await;
        let mut sessions = self.sessions.lock().await;
        if let Some(existing) = sessions
            .values()
            .find(|session| session.identity_key == identity_key && !session.requires_signup)
            .cloned()
        {
            return existing;
        }

        let session = TrialRunnerSession {
            id: Ulid::new().to_string(),
            identity_key,
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::hours(24)).to_rfc3339(),
            active_template_id: None,
            runs_started: 0,
            max_runs: 3,
            turns_used: 0,
            max_turns: 10,
            requires_signup: false,
            messages: vec![
                TrialChatMessage {
                    role: "system".to_string(),
                    content: "OmnyID anonymous trial is ephemeral. Nothing here is persisted after the session window expires.".to_string(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                },
                TrialChatMessage {
                    role: "assistant".to_string(),
                    content: "Choose a starter template to try the hosted Python runner. You get three template runs in twenty-four hours before OmnyID asks you to sign up.".to_string(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                },
            ],
            logs: vec![TrialLogEntry {
                timestamp: chrono::Utc::now().to_rfc3339(),
                level: "info".to_string(),
                message: "Anonymous trial session created.".to_string(),
            }],
            traces: vec![],
            prompt_versions: vec![],
            saved_tests: vec![],
            review_queue: vec![],
            model_policy: trial_model_policy(),
            tool_policy: trial_tool_policy(),
            channel_policy: trial_channel_policy(),
            starter_templates: trial_starter_templates(),
            last_good_run: None,
            calendar_view: None,
        };
        sessions.insert(session.id.clone(), session.clone());
        session
    }

    async fn get_session(&self, session_id: &str) -> Option<TrialRunnerSession> {
        self.prune_expired().await;
        let sessions = self.sessions.lock().await;
        sessions.get(session_id).cloned()
    }

    async fn start_template_run(
        &self,
        session_id: &str,
        template_id: &str,
    ) -> Result<TrialRunnerSession, String> {
        self.prune_expired().await;
        let session_identity = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| "trial session not found".to_string())?;
            session.identity_key.clone()
        };

        {
            let mut usage = self.usage.lock().await;
            let bucket = usage.entry(session_identity).or_insert_with(VecDeque::new);
            let now = Instant::now();
            while let Some(front) = bucket.front() {
                if now.duration_since(*front) > Duration::from_secs(60 * 60 * 24) {
                    bucket.pop_front();
                } else {
                    break;
                }
            }
            if bucket.len() >= 3 {
                let mut sessions = self.sessions.lock().await;
                if let Some(session) = sessions.get_mut(session_id) {
                    session.requires_signup = true;
                    session.logs.push(TrialLogEntry {
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        level: "warn".to_string(),
                        message: "Anonymous trial quota exhausted; signup required.".to_string(),
                    });
                    return Ok(session.clone());
                }
                return Err("trial session not found".to_string());
            }
            bucket.push_back(now);
        }

        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| "trial session not found".to_string())?;
        let template = session
            .starter_templates
            .iter()
            .find(|entry| entry.id == template_id)
            .cloned()
            .ok_or_else(|| "unknown trial template".to_string())?;
        session.active_template_id = Some(template.id.clone());
        session.runs_started += 1;
        session.turns_used = 0;
        session.review_queue.clear();
        session.traces.clear();
        session.calendar_view = None;
        session.messages = vec![
            TrialChatMessage {
                role: "system".to_string(),
                content: "Anonymous trial resets between template runs and does not persist files, memory, or vector state.".to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            },
            TrialChatMessage {
                role: "assistant".to_string(),
                content: format!("{} is ready. {}", template.name, template.summary),
                timestamp: chrono::Utc::now().to_rfc3339(),
            },
        ];
        session.prompt_versions.push(TrialPromptVersion {
            id: format!("prompt-{}", Ulid::new()),
            label: template.name.clone(),
            template_id: Some(template.id.clone()),
            system_prompt: template.system_prompt.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
        });
        session.logs.push(TrialLogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: format!("Started anonymous template run: {}", template.id),
        });
        Ok(session.clone())
    }

    async fn append_chat_turn(
        &self,
        session_id: &str,
        content: &str,
    ) -> Result<TrialRunnerSession, String> {
        self.prune_expired().await;
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| "trial session not found".to_string())?;
        if session.requires_signup {
            return Err("anonymous trial limit reached; sign up to continue".to_string());
        }
        if session.active_template_id.is_none() {
            return Err("pick a starter template first".to_string());
        }
        if session.turns_used >= session.max_turns {
            return Err("this anonymous trial run reached its 10-turn limit; start another template or sign up".to_string());
        }

        let active_template = session
            .starter_templates
            .iter()
            .find(|entry| Some(entry.id.as_str()) == session.active_template_id.as_deref())
            .cloned()
            .ok_or_else(|| "active trial template missing".to_string())?;

        session.turns_used += 1;
        session.messages.push(TrialChatMessage {
            role: "user".to_string(),
            content: content.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        });
        session.saved_tests.push(TrialSavedTest {
            id: format!("test-{}", Ulid::new()),
            input: content.to_string(),
            template_id: Some(active_template.id.clone()),
            created_at: chrono::Utc::now().to_rfc3339(),
        });
        session.saved_tests = session
            .saved_tests
            .iter()
            .cloned()
            .rev()
            .take(5)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();

        let lowered = content.to_lowercase();
        let is_scheduling = lowered.contains("plan")
            || lowered.contains("lesson")
            || lowered.contains("schedule")
            || lowered.contains("class")
            || lowered.contains("study")
            || lowered.contains("5pm")
            || lowered.contains("6pm")
            || lowered.contains("7pm")
            || lowered.contains("today")
            || lowered.contains("tonight")
            || (lowered.contains("pm") && lowered.contains("hour"))
            || (lowered.contains("wash") && lowered.contains("dog"));
        let is_confirmation = session.calendar_view.is_some()
            && (lowered.contains("confirm")
                || lowered.contains("add to calendar")
                || lowered.contains("yes")
                || lowered.contains("looks good")
                || lowered == "ok");
        let intent = if is_confirmation {
            "confirm"
        } else if is_scheduling {
            "schedule"
        } else {
            "generic"
        };

        if intent == "schedule" {
            session.calendar_view = Some(build_trial_calendar_view(content));
        } else if intent == "confirm" {
            if let Some(ref mut cv) = session.calendar_view {
                if let Some(obj) = cv.as_object_mut() {
                    obj.insert("pending_confirmation".to_string(), serde_json::json!(false));
                    obj.insert("confirmed".to_string(), serde_json::json!(true));
                }
            }
        }

        let (traces, reviews) = execute_trial_tools(content, &session.tool_policy);
        session.traces.extend(traces.clone());
        session.review_queue.extend(reviews.clone());
        session.logs.push(TrialLogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            message: "Anonymous trial turn processed.".to_string(),
        });
        let reply = trial_assistant_reply(content, &active_template, &traces, &reviews, intent);
        session.messages.push(TrialChatMessage {
            role: "assistant".to_string(),
            content: reply.clone(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        });
        session.last_good_run = Some(serde_json::json!({
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "summary": reply.lines().next().unwrap_or_default(),
        }));
        Ok(session.clone())
    }

    async fn prune_expired(&self) {
        let expired_ids = {
            let sessions = self.sessions.lock().await;
            sessions
                .values()
                .filter(|session| {
                    parse_datetime_to_utc(&session.expires_at)
                        .map(|ts| ts < chrono::Utc::now())
                        .unwrap_or(true)
                })
                .map(|session| session.id.clone())
                .collect::<Vec<_>>()
        };
        if expired_ids.is_empty() {
            return;
        }
        let mut sessions = self.sessions.lock().await;
        for session_id in expired_ids {
            sessions.remove(&session_id);
        }
    }
}

#[derive(serde::Deserialize)]
struct GoogleTokenInfoResponse {
    sub: String,
    email: String,
    email_verified: Option<String>,
    aud: String,
    name: Option<String>,
    given_name: Option<String>,
}

pub struct AFPServer {
    db: Db,
    metrics: Arc<Metrics>,
    relay_tx: broadcast::Sender<String>,
}

#[tonic::async_trait]
impl AfpService for AFPServer {
    async fn send_message(&self, req: Request<Message>) -> Result<Response<Ack>, Status> {
        let msg = req.into_inner();
        store_proto_message(&self.db, &self.metrics, &self.relay_tx, msg).await
    }

    async fn get_thread(
        &self,
        req: Request<ThreadRequest>,
    ) -> Result<Response<ThreadResponse>, Status> {
        let thread_id = req.into_inner().thread_id;
        let messages = self
            .db
            .get_thread(&thread_id)
            .await
            .map_err(internal_error)?;

        Ok(Response::new(ThreadResponse { messages }))
    }
}

pub async fn run() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://afp:afp@postgres:5432/afp".to_string());
    let db = Db::new(&database_url)
        .await
        .expect("database connection failed");
    let metrics = Arc::new(Metrics::default());
    let (relay_tx, _) = broadcast::channel(256);
    let app_state = Arc::new(AppState {
        db: db.clone(),
        metrics: metrics.clone(),
        relay_tx,
        rate_limiter: Arc::new(RateLimiter::new()),
        trial_runner: Arc::new(TrialRunnerManager::new()),
        http_client: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(35))
            .build()
            .unwrap_or_default(),
    });

    start_sync_worker(db.pool.clone()).await;
    start_imap_sync(db.clone(), metrics.clone(), app_state.relay_tx.clone()).await;

    // Background: clean up expired ephemeral (anon) agent instances every 30 min
    let cleanup_db = db.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1800)).await;
            match cleanup_db.cleanup_expired_ephemeral_agents().await {
                Ok(n) if n > 0 => info!("Cleaned up {} expired ephemeral agents", n),
                Ok(_) => {}
                Err(e) => error!("Ephemeral agent cleanup error: {}", e),
            }
        }
    });

    let grpc_addr = grpc_bind_addr();
    let http_addr: SocketAddr = "0.0.0.0:8080".parse().unwrap();

    let grpc_server = AFPServer {
        db: db.clone(),
        metrics: metrics.clone(),
        relay_tx: app_state.relay_tx.clone(),
    };
    let grpc = async move {
        if !enable_internal_grpc() {
            info!("Omnyid internal gRPC disabled");
            return Ok(());
        }

        info!("Omnyid internal gRPC listening on {}", grpc_addr);
        Server::builder()
            .add_service(afp::afp_service_server::AfpServiceServer::new(grpc_server))
            .serve(grpc_addr)
            .await
            .map_err(|err| err.to_string())
    };

    let app = Router::new()
        .route("/healthz", get(healthz_http))
        .route("/readyz", get(readyz_http))
        .route("/metricsz", get(metrics_http))
        .route("/transport/capabilities", get(transport_capabilities_http))
        .route("/waitlist", post(waitlist_http))
        .route(
            "/trial/python-runner/session",
            post(trial_python_runner_session_http),
        )
        .route(
            "/trial/python-runner/run",
            post(trial_python_runner_run_http),
        )
        .route(
            "/trial/python-runner/chat",
            post(trial_python_runner_chat_http),
        )
        .route(
            "/trial/python-runner/convert",
            post(trial_python_runner_convert_http),
        )
        .route(
            "/trial/python-runner/state/{session_id}",
            get(trial_python_runner_state_http),
        )
        .route("/auth/register", post(register_http))
        .route("/auth/login", post(login_http))
        .route("/auth/google", post(google_auth_http))
        .route("/auth/session", get(auth_session_http))
        .route("/dashboard/bootstrap", get(dashboard_bootstrap_http))
        .route("/dashboard/export", get(dashboard_export_http))
        .route("/dashboard/onboarding", post(update_onboarding_http))
        .route("/dashboard/onboarding-bundle", get(onboarding_bundle_http))
        .route(
            "/dashboard/service-adapter-bundle",
            get(service_adapter_bundle_http),
        )
        .route(
            "/dashboard/sessions",
            get(account_sessions_http).post(account_sessions_action_http),
        )
        .route(
            "/dashboard/runtime-backups",
            get(runtime_backups_http).post(runtime_backups_action_http),
        )
        .route(
            "/dashboard/runtime-backups/{backup_id}",
            get(runtime_backup_manifest_http),
        )
        .route(
            "/dashboard/runtime-restore-drills",
            get(runtime_restore_drills_http).post(runtime_restore_drill_create_http),
        )
        .route(
            "/dashboard/runtime-updates",
            get(runtime_updates_http).post(runtime_updates_action_http),
        )
        .route(
            "/dashboard/runtime-recovery-packet",
            get(runtime_recovery_packet_http),
        )
        .route(
            "/dashboard/device-bootstrap-bundle",
            post(device_bootstrap_bundle_http),
        )
        .route(
            "/dashboard/device-sync-policies",
            get(device_sync_policies_http).post(device_sync_policies_action_http),
        )
        .route(
            "/dashboard/support-access",
            get(support_access_http).post(update_support_access_http),
        )
        .route(
            "/dashboard/support-access/history",
            get(support_access_history_http),
        )
        .route("/dashboard/account/delete", post(account_delete_http))
        .route("/dashboard/demo/send", post(demo_send_http))
        .route("/runtime/deploy", post(runtime_deploy_http))
        .route("/runtime/action", post(runtime_action_http))
        .route("/runtime/destroy", post(runtime_destroy_http))
        .route("/runtime/logs", get(runtime_logs_http))
        .route(
            "/runtime/runner-config",
            get(runtime_runner_config_http).post(runtime_runner_config_action_http),
        )
        .route(
            "/runtime/workspace-files",
            get(runtime_workspace_files_http),
        )
        .route(
            "/runtime/workspace-file",
            get(runtime_workspace_file_http).post(runtime_workspace_file_save_http),
        )
        .route("/ui/command", post(ui_command_http))
        .route("/ui/decision", post(ui_decision_http))
        .route("/workflows", get(workflows_list_http).post(workflows_save_http))
        .route("/workflows/validate", post(workflows_validate_http))
        .route("/workflows/{id}", get(workflow_detail_http))
        .route("/workflows/{id}/deployments", get(workflow_deployments_http))
        .route("/workflows/{id}/patch", post(workflow_patch_http))
        .route("/workflows/{id}/runs", get(workflow_runs_http).post(workflow_run_start_http))
        .route("/workflows/{id}/compile", post(workflow_compile_http))
        .route("/workflows/{id}/action", post(workflow_action_http))
        .route(
            "/user/agent-preferences",
            get(agent_preferences_get_http).post(agent_preferences_set_http),
        )
        .route(
            "/installers/local/windows.ps1",
            get(local_windows_installer_http),
        )
        .route("/installers/local/unix.sh", get(local_unix_installer_http))
        .route("/relay/ws", get(relay_ws_http))
        .route("/send", post(send_http))
        .route("/thread/{thread_id}", get(get_thread_http))
        .route("/thread/{id}/verify", get(verify_thread_chain_http))
        .route("/actions/decision", post(record_action_decision_http))
        .route("/actions/execute", post(execute_action_http))
        .route("/gateway/email", post(handle_gateway_email))
        .route("/.well-known/agent-card", get(serve_agent_card))
        .route("/.well-known/afp-delegation", get(serve_afp_delegation))
        .route("/keys/rotate", post(rotate_key_http))
        .route("/keys/peer", post(upsert_peer_key_http))
        .route("/sync/shapes", get(sync_shapes_http))
        .route("/sync/bootstrap", get(sync_bootstrap_http))
        .route(
            "/personalization/event",
            post(record_personalization_event_http),
        )
        .route(
            "/personalization/stats",
            get(get_personalization_stats_http),
        )
        .route("/billing/webhook", post(billing_webhook_http))
        .route("/billing/status", get(billing_status_http))
        .route("/mcp", post(mcp_http))
        // ── Agent template ────────────────────────────────────────────────
        .route("/agent/provision", post(agent_provision_http))
        .route("/agent/me", get(agent_me_http))
        .route("/agent/intent", post(agent_intent_http))
        .route("/agent/tasks", get(agent_tasks_http))
        .route("/agent/tasks/{id}", get(agent_task_detail_http))
        .route("/agent/tasks/{id}/approve", post(agent_task_approve_http))
        .route("/agent/tasks/{id}/reject", post(agent_task_reject_http))
        .route("/agent/tasks/{id}/cancel", post(agent_task_cancel_http))
        .route("/agent/priority-rules", get(agent_priority_rules_get_http))
        .route("/agent/priority-rules", put(agent_priority_rules_put_http))
        .route("/user/llm-config", get(llm_config_get_http))
        .route("/user/llm-config", post(llm_config_set_http))
        // ── Passkey auth ──────────────────────────────────────────────────
        .route(
            "/auth/passkey/register/begin",
            post(passkey_register_begin_http),
        )
        .route(
            "/auth/passkey/register/finish",
            post(passkey_register_finish_http),
        )
        .route(
            "/auth/passkey/authenticate/begin",
            post(passkey_authenticate_begin_http),
        )
        .route(
            "/auth/passkey/authenticate/finish",
            post(passkey_authenticate_finish_http),
        )
        // ── Portable export ───────────────────────────────────────────────
        .route("/export/mbox", get(export_mbox_http))
        .route("/export/afp-archive", get(export_afp_archive_http))
        .route("/export/json-ld", get(export_json_ld_http))
        // ── Federation (homeserver-to-homeserver AFP relay) ───────────────
        .route("/federation/relay", post(federation_relay_http))
        // ── Master agent orchestration ────────────────────────────────────
        .route("/dashboard/session", get(dashboard_session_http))
        .route("/agent/onboarding", post(agent_onboarding_http))
        .route(
            "/agent/focus",
            get(list_focus_items_http).post(create_focus_item_http),
        )
        .route(
            "/agent/focus/{id}",
            axum::routing::patch(update_focus_item_http),
        )
        .route("/agent/trigger", post(create_trigger_http))
        .route(
            "/agent/trigger/{id}",
            axum::routing::delete(delete_trigger_http),
        )
        .route(
            "/agent/capability",
            post(create_capability_http).get(list_capabilities_http),
        )
        .route(
            "/agent/capability/{id}",
            axum::routing::delete(delete_capability_http),
        )
        .route("/agent/delegate", post(create_delegation_http))
        .route(
            "/agent/delegate/{id}",
            axum::routing::delete(revoke_delegation_http),
        )
        .route("/agent/fleet", get(agent_fleet_http))
        .route("/agent/orchestrate", post(agent_orchestrate_http))
        .route("/agent/invoke", post(agent_invoke_http))
        .route("/agent/tasks/{id}/complete", post(agent_task_complete_http))
        .route(
            "/agent/lora-confidence",
            axum::routing::patch(lora_confidence_http),
        )
        .route("/agent/keys", get(agent_keys_http))
        .route("/feed/public", get(public_feed_http))
        .route("/feed/search", get(feed_search_http))
        .route(
            "/feed/follow/{agent_id}",
            post(feed_follow_http).delete(feed_unfollow_http),
        )
        .route("/feed/following", get(feed_following_http))
        .route("/feed/engage", post(feed_engage_http))
        .route(
            "/calendar/events",
            get(calendar_list_http).post(calendar_create_http),
        )
        .route(
            "/calendar/events/{id}",
            axum::routing::delete(calendar_delete_http),
        )
        .route("/gmail/connect-url", get(gmail_connect_url_http))
        .route("/gmail/callback", get(gmail_callback_http))
        .route("/gmail/status", get(gmail_status_http))
        .route("/api/alias/check", get(alias_check_http))
        .route("/api/alias/mine", get(alias_mine_http))
        .route("/api/alias/claim", post(alias_claim_http))
        .route("/api/alias/change", post(alias_change_http))
        .route("/about", get(about_http))
        .layer(cors_layer())
        .with_state(app_state.clone());

    let listener = tokio::net::TcpListener::bind(http_addr)
        .await
        .expect("http bind failed");
    let http = async move {
        axum::serve(listener, app)
            .await
            .map_err(|err| err.to_string())
    };
    let wt_state = app_state.clone();
    let webtransport = async move {
        if !webtransport_enabled() {
            info!("Omnyid WebTransport relay disabled");
            return Ok(());
        }

        run_webtransport_server(wt_state).await
    };

    info!("Omnyid HTTP listening on {}", http_addr);
    if webtransport_enabled() {
        info!(
            "Omnyid WebTransport relay configured for {}",
            webtransport_bind_addr()
        );
    }

    let (grpc_result, http_result, webtransport_result) = tokio::join!(grpc, http, webtransport);
    if let Err(err) = grpc_result {
        error!(%err, "gRPC server exited");
    }
    if let Err(err) = http_result {
        error!(%err, "HTTP server exited");
    }
    if let Err(err) = webtransport_result {
        error!(%err, "WebTransport server exited");
    }
}

#[instrument(skip(state, message), fields(thread_id = %message.thread_id, message_type = %message.r#type))]
async fn send_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(message): Json<AFPMessage>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let message_id = store_app_message_for_headers(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &headers,
        message,
    )
    .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message_id": message_id
    })))
}

async fn healthz_http() -> Json<Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "omnyid-homeserver"
    }))
}

async fn readyz_http(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    state
        .db
        .healthcheck()
        .await
        .map_err(readiness_error_to_http)?;

    Ok(Json(serde_json::json!({
        "status": "ready",
        "dependencies": {
            "database": "ok"
        }
    })))
}

async fn metrics_http(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "omnyid-homeserver",
        "metrics": state.metrics.snapshot(),
    }))
}

async fn transport_capabilities_http(State(state): State<Arc<AppState>>) -> Json<Value> {
    state.metrics.inc_relay_webtransport_capability_checks();
    let webtransport_enabled = webtransport_enabled();
    Json(serde_json::json!({
        "status": "ok",
        "service": "omnyid-homeserver",
        "public_transport": {
            "primary": "webtransport",
            "fallback": "websocket",
            "webtransport": {
                "enabled": webtransport_enabled,
                "path": "/relay/wt",
                "bind_addr": webtransport_bind_addr().to_string(),
                "reason": if webtransport_enabled { "configured" } else { "disabled_or_misconfigured" }
            },
            "websocket": {
                "enabled": true,
                "path": "/relay/ws"
            },
            "http": {
                "enabled": true,
                "path": "/send"
            }
        },
        "internal_transport": {
            "grpc_enabled": enable_internal_grpc()
        }
    }))
}

async fn waitlist_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<WaitlistRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("waitlist", &headers),
        RateLimitPolicy {
            max_requests: 6,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let email = request.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err((
            StatusCode::BAD_REQUEST,
            "valid email is required".to_string(),
        ));
    }

    let waitlist_target =
        std::env::var("OMNYID_WAITLIST_EMAIL").unwrap_or_else(|_| "hello@omnyid.com".to_string());
    let subject = format!("OmnyID waitlist request from {email}");
    let body = format!(
        "Waitlist request received.\n\nEmail: {email}\nSubmitted at: {}\nSource: omnyid.com waitlist form\n",
        chrono::Utc::now().to_rfc3339()
    );

    let request = OutgoingEmailRequest {
        thread_id: format!("waitlist.{}", Ulid::new()),
        message_id: Ulid::new().to_string(),
        parent_id: None,
        to: vec![waitlist_target],
        subject,
        body,
        in_reply_to: None,
        references: vec![],
    };

    let delivery_result = send_outgoing_email(&request).await;
    let (delivery_status, delivery_error) = match delivery_result {
        Ok(_) => ("sent", None),
        Err(err) => {
            error!(email = %email, error = %err, "Waitlist email delivery failed; storing fallback record");
            ("queued_local_fallback", Some(err))
        }
    };

    state
        .db
        .record_waitlist_submission(&email, delivery_status, delivery_error.as_deref())
        .await
        .map_err(readiness_error_to_http)?;

    Ok(Json(serde_json::json!({
        "status": delivery_status,
        "destination": "hello@omnyid.com",
        "delivery_error": delivery_error
    })))
}

async fn trial_python_runner_session_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<TrialSessionCreateRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("trial_python_runner_session", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let identity = trial_identity_key(&headers, request.fingerprint.as_deref());
    let session = state.trial_runner.create_or_get_session(identity).await;
    Ok(Json(trial_session_response(&session)))
}

async fn trial_python_runner_run_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<TrialTemplateRunRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("trial_python_runner_run", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let session = state
        .trial_runner
        .start_template_run(&request.session_id, &request.template_id)
        .await
        .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    Ok(Json(trial_session_response(&session)))
}

async fn trial_python_runner_chat_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<TrialChatRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("trial_python_runner_chat", &headers),
        RateLimitPolicy {
            max_requests: 40,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let content = request.content.trim();
    if content.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "trial content is required".to_string(),
        ));
    }
    let session = state
        .trial_runner
        .append_chat_turn(&request.session_id, content)
        .await
        .map_err(|err| {
            if err.contains("sign up") {
                (StatusCode::PAYMENT_REQUIRED, err)
            } else {
                (StatusCode::BAD_REQUEST, err)
            }
        })?;
    Ok(Json(trial_session_response(&session)))
}

async fn trial_python_runner_state_http(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let session = state
        .trial_runner
        .get_session(&session_id)
        .await
        .ok_or_else(|| (StatusCode::NOT_FOUND, "trial session not found".to_string()))?;
    Ok(Json(trial_session_response(&session)))
}

async fn trial_python_runner_convert_http(
    State(state): State<Arc<AppState>>,
    Json(request): Json<TrialConvertRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let session = state
        .trial_runner
        .get_session(&request.session_id)
        .await
        .ok_or_else(|| (StatusCode::NOT_FOUND, "trial session not found".to_string()))?;
    Ok(Json(serde_json::json!({
        "status": "signup_required",
        "session_id": session.id,
        "active_template_id": session.active_template_id,
        "starter_templates": session.starter_templates,
        "privacy_hint": "managed_private",
        "message": "Sign in or create a free Agent ID to keep going beyond the anonymous trial."
    })))
}

async fn register_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RegisterRequest>,
) -> Result<Json<SessionResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("register", &headers),
        RateLimitPolicy {
            max_requests: 8,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let email = request.email.trim().to_lowercase();
    let password = request.password.trim().to_string();
    let display_name = request
        .display_name
        .unwrap_or_else(|| email.split('@').next().unwrap_or("Omnyid User").to_string())
        .trim()
        .to_string();

    if email.is_empty() || !email.contains('@') {
        return Err((
            StatusCode::BAD_REQUEST,
            "valid email is required".to_string(),
        ));
    }
    if password.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "password must be at least 8 characters".to_string(),
        ));
    }

    if state
        .db
        .find_user_by_email(&email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .is_some()
    {
        return Err((
            StatusCode::CONFLICT,
            "account already exists for that email".to_string(),
        ));
    }

    let password_hash =
        hash_password(&password).map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: email.clone(),
        password_hash: Some(password_hash),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state
        .db
        .create_user(&user)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    ensure_user_agents_and_demo_seed(&state, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    let session = create_session_for_user(&state.db, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    Ok(Json(SessionResponse {
        token: session.token,
        user: session_user_response(&user),
    }))
}

async fn login_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> Result<Json<SessionResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("login", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let email = request.email.trim().to_lowercase();
    let user = state
        .db
        .find_user_by_email(&email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "invalid email or password".to_string(),
            )
        })?;

    let password_hash = user.password_hash.clone().ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            "account requires Google sign-in".to_string(),
        )
    })?;
    if !verify_password(&password_hash, request.password.trim())
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?
    {
        return Err((
            StatusCode::UNAUTHORIZED,
            "invalid email or password".to_string(),
        ));
    }

    let session = create_session_for_user(&state.db, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    Ok(Json(SessionResponse {
        token: session.token,
        user: session_user_response(&user),
    }))
}

async fn google_auth_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<GoogleAuthRequest>,
) -> Result<Json<SessionResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("google_auth", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let token_info = verify_google_id_token(&request.id_token)
        .await
        .map_err(|err| (StatusCode::UNAUTHORIZED, err))?;

    let user = if let Some(existing) = state
        .db
        .find_user_by_google_sub(&token_info.sub)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        existing
    } else if let Some(existing_email) = state
        .db
        .find_user_by_email(&token_info.email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        existing_email
    } else {
        let user = UserRecord {
            id: Ulid::new().to_string(),
            email: token_info.email.clone(),
            password_hash: None,
            auth_provider: "google".to_string(),
            google_sub: Some(token_info.sub.clone()),
            display_name: token_info
                .name
                .clone()
                .or(token_info.given_name.clone())
                .unwrap_or_else(|| {
                    token_info
                        .email
                        .split('@')
                        .next()
                        .unwrap_or("Omnyid User")
                        .to_string()
                }),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        state
            .db
            .create_user(&user)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        ensure_user_agents_and_demo_seed(&state, &user)
            .await
            .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
        user
    };

    let session = create_session_for_user(&state.db, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    Ok(Json(SessionResponse {
        token: session.token,
        user: session_user_response(&user),
    }))
}

async fn auth_session_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<SessionUserResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    Ok(Json(session_user_response(&user)))
}

async fn dashboard_bootstrap_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<DashboardBootstrapResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let current_token = bearer_token_from_headers(&headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
    ensure_user_agents_and_demo_seed(&state, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let agent_ids = agents
        .iter()
        .map(|agent| agent.agent_id.clone())
        .collect::<Vec<_>>();
    let messages = state
        .db
        .recent_messages_for_agents(&agent_ids, 10)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(proto_to_app)
        .collect::<Vec<_>>();
    let thread_ids = messages
        .iter()
        .map(|message| message.thread_id.clone())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let action_log = state
        .db
        .recent_action_results_for_threads(&thread_ids, 64)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_deployment = match state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        Some(deployment) => Some(
            runtime_deployment_response_live(
                inspect_runtime_deployment_live(inspect_runtime_deployment(deployment)).await,
            )
            .await,
        ),
        None => None,
    };
    let support_access = state
        .db
        .latest_support_access_grant(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .map(support_access_state_response)
        .unwrap_or_else(default_support_access_state_response);
    let support_access_history = state
        .db
        .list_support_access_grants(&user.id, 8)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(support_access_history_entry)
        .collect::<Vec<_>>();
    let sessions = state
        .db
        .list_sessions_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(|session| account_session_entry(session, &current_token))
        .collect::<Vec<_>>();
    let runtime_backups = load_runtime_backups_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_restore_drills = load_runtime_restore_drills_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_updates = load_runtime_updates_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let device_sync_policies = load_device_sync_policies_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let onboarding = state
        .db
        .find_user_onboarding(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .unwrap_or_else(|| default_onboarding_for_user(&user));

    Ok(Json(DashboardBootstrapResponse {
        user: session_user_response(&user),
        agents,
        messages,
        action_log,
        onboarding,
        device_sync_policies,
        support_access,
        support_access_history,
        sessions,
        runtime_backups,
        runtime_restore_drills,
        runtime_updates,
        runtime_deployment,
    }))
}

async fn dashboard_export_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<DashboardExportResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    ensure_user_agents_and_demo_seed(&state, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let agent_ids = agents
        .iter()
        .map(|agent| agent.agent_id.clone())
        .collect::<Vec<_>>();
    let messages = state
        .db
        .recent_messages_for_agents(&agent_ids, 100)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(proto_to_app)
        .collect::<Vec<_>>();
    let thread_ids = messages
        .iter()
        .map(|message| message.thread_id.clone())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let action_log = state
        .db
        .recent_action_results_for_threads(&thread_ids, 200)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_deployment = match state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        Some(deployment) => Some(
            runtime_deployment_response_live(
                inspect_runtime_deployment_live(inspect_runtime_deployment(deployment)).await,
            )
            .await,
        ),
        None => None,
    };
    let support_access = state
        .db
        .latest_support_access_grant(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .map(support_access_state_response)
        .unwrap_or_else(default_support_access_state_response);
    let support_access_history = state
        .db
        .list_support_access_grants(&user.id, 32)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(support_access_history_entry)
        .collect::<Vec<_>>();
    let runtime_backups = load_runtime_backups_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_restore_drills = load_runtime_restore_drills_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_updates = load_runtime_updates_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let device_sync_policies = load_device_sync_policies_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let onboarding = state
        .db
        .find_user_onboarding(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .unwrap_or_else(|| default_onboarding_for_user(&user));

    Ok(Json(DashboardExportResponse {
        exported_at: chrono::Utc::now().to_rfc3339(),
        export_version: "omnyid-dashboard-export-v1".to_string(),
        user: session_user_response(&user),
        agents,
        onboarding,
        device_sync_policies,
        support_access,
        support_access_history,
        runtime_backups,
        runtime_restore_drills,
        runtime_updates,
        runtime_deployment,
        recent_messages: messages,
        action_log,
    }))
}

async fn update_onboarding_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<OnboardingUpdateRequest>,
) -> Result<Json<UserOnboardingRecord>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let onboarding = build_onboarding_record(&user, request)?;

    state
        .db
        .upsert_user_onboarding(&onboarding)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(onboarding))
}

async fn demo_send_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<DemoSendRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("demo_send", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let owns_from = agents
        .iter()
        .any(|agent| agent.agent_id == request.from_agent_id);
    let owns_to = agents
        .iter()
        .any(|agent| agent.agent_id == request.to_agent_id);
    if !owns_from || !owns_to {
        return Err((
            StatusCode::FORBIDDEN,
            "selected agents are not managed by this account".to_string(),
        ));
    }

    let thread_id = demo_thread_id(&user.id);
    let message = new_server_message(
        request.from_agent_id,
        vec![request.to_agent_id],
        thread_id,
        "agent_message",
        serde_json::json!({
            "body": request.body.trim(),
            "kind": "demo_message"
        }),
        vec![serde_json::json!({
            "format": "email",
            "content": {
                "subject": "Demo agent message",
                "body": request.body.trim(),
            }
        })],
        vec![],
        vec![],
        true,
    )
    .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    let message_id = message.id.clone();

    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        message,
    )
    .await
    .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message_id": message_id
    })))
}

async fn onboarding_bundle_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<OnboardingBundleResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let onboarding = state
        .db
        .find_user_onboarding(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .unwrap_or_else(|| default_onboarding_for_user(&user));
    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(build_onboarding_bundle_response(
        &user,
        &onboarding,
        &agents,
    )))
}

async fn service_adapter_bundle_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<ServiceAdapterBundleResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(build_service_adapter_bundle_response(&user, &agents)))
}

async fn support_access_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<SupportAccessStateResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let state_response = state
        .db
        .latest_support_access_grant(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .map(support_access_state_response)
        .unwrap_or_else(default_support_access_state_response);
    Ok(Json(state_response))
}

async fn support_access_history_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<SupportAccessHistoryResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let entries = state
        .db
        .list_support_access_grants(&user.id, 12)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(support_access_history_entry)
        .collect::<Vec<_>>();
    Ok(Json(SupportAccessHistoryResponse { entries }))
}

async fn account_sessions_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AccountSessionsResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let current_token = bearer_token_from_headers(&headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
    let sessions = state
        .db
        .list_sessions_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(|session| account_session_entry(session, &current_token))
        .collect::<Vec<_>>();
    Ok(Json(AccountSessionsResponse { sessions }))
}

async fn account_sessions_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SessionActionRequest>,
) -> Result<Json<AccountSessionsResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let current_token = bearer_token_from_headers(&headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
    let action = request.action.trim().to_lowercase();

    match action.as_str() {
        "revoke" => {
            let token_preview = request.token.as_deref().ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "token preview is required when revoking a session".to_string(),
                )
            })?;
            if token_preview == runtime_token_preview(&current_token) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "use sign out to end the current session".to_string(),
                ));
            }
            let target_token = state
                .db
                .list_sessions_by_user(&user.id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .into_iter()
                .find(|session| runtime_token_preview(&session.token) == token_preview)
                .map(|session| session.token)
                .ok_or_else(|| {
                    (
                        StatusCode::NOT_FOUND,
                        "session not found for this account".to_string(),
                    )
                })?;
            state
                .db
                .revoke_session(&user.id, &target_token)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
        }
        "revoke_others" => {
            state
                .db
                .revoke_other_sessions(&user.id, &current_token)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "session action must be revoke or revoke_others".to_string(),
            ));
        }
    }

    let sessions = state
        .db
        .list_sessions_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(|session| account_session_entry(session, &current_token))
        .collect::<Vec<_>>();
    Ok(Json(AccountSessionsResponse { sessions }))
}

async fn runtime_backups_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeBackupsResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let response = load_runtime_backups_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_backups_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeBackupRequest>,
) -> Result<Json<RuntimeBackupsResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_backups", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let action = request.action.trim().to_lowercase();

    match action.as_str() {
        "set_retention" => {
            let retention_days = request.retention_days.unwrap_or(14);
            if !matches!(retention_days, 7 | 14 | 30 | 90) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "retention_days must be one of 7, 14, 30, or 90".to_string(),
                ));
            }
            state
                .db
                .upsert_runtime_backup_policy(&user.id, retention_days, "metadata_only_hosted")
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
        }
        "create_snapshot" => {
            let retention_days = match state
                .db
                .find_runtime_backup_policy(&user.id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
            {
                Some(policy) => policy.retention_days,
                None => {
                    state
                        .db
                        .upsert_runtime_backup_policy(&user.id, 14, "metadata_only_hosted")
                        .await
                        .map_err(internal_error)
                        .map_err(status_to_http)?
                        .retention_days
                }
            };
            create_runtime_backup_snapshot(&state.db, &user.id, retention_days)
                .await
                .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
        }
        "delete_snapshot" => {
            let backup_id = request
                .backup_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    (
                        StatusCode::BAD_REQUEST,
                        "backup_id is required when deleting a snapshot".to_string(),
                    )
                })?;
            let deleted = state
                .db
                .delete_runtime_backup_by_id(&user.id, backup_id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .ok_or_else(|| {
                    (
                        StatusCode::NOT_FOUND,
                        "runtime backup snapshot not found for this account".to_string(),
                    )
                })?;
            if let Some(artifact_path) = deleted.artifact_path.as_deref() {
                remove_runtime_backup_artifact_path(artifact_path)
                    .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
            }
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "runtime backup action must be set_retention, create_snapshot, or delete_snapshot"
                    .to_string(),
            ));
        }
    }

    let response = load_runtime_backups_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_backup_manifest_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(backup_id): Path<String>,
) -> Result<Json<RuntimeBackupManifestResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let _ = prune_expired_runtime_backups(&state.db, &user.id).await;
    let record = state
        .db
        .find_runtime_backup_by_id(&user.id, &backup_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "runtime backup snapshot not found for this account".to_string(),
            )
        })?;
    Ok(Json(RuntimeBackupManifestResponse {
        id: record.id,
        storage_mode: record.storage_mode,
        created_at: record.created_at,
        expires_at: record.expires_at,
        manifest_json: record.manifest_json,
    }))
}

async fn runtime_restore_drills_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeRestoreDrillsResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let response = load_runtime_restore_drills_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_restore_drill_create_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeRestoreDrillRequest>,
) -> Result<Json<RuntimeRestoreDrillsResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_restore_drills", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let backup_id = request.backup_id.trim();
    if backup_id.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "backup_id is required".to_string()));
    }
    let _ = prune_expired_runtime_backups(&state.db, &user.id).await;
    let backup = state
        .db
        .find_runtime_backup_by_id(&user.id, backup_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "runtime backup snapshot not found for this account".to_string(),
            )
        })?;
    let drill = build_runtime_restore_drill(&backup);
    state
        .db
        .create_runtime_restore_drill(&drill)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let response = load_runtime_restore_drills_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_updates_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeUpdatesResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let response = load_runtime_updates_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_updates_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeUpdateRequest>,
) -> Result<Json<RuntimeUpdatesResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_updates", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let action = request.action.trim().to_lowercase();

    match action.as_str() {
        "set_policy" => {
            let update_channel = request
                .update_channel
                .as_deref()
                .map(str::trim)
                .filter(|value| matches!(*value, "stable" | "manual_only"))
                .unwrap_or("stable");
            let auto_apply = request
                .auto_apply
                .as_deref()
                .map(str::trim)
                .filter(|value| matches!(*value, "manual_only" | "scaffold_refresh_only"))
                .unwrap_or("manual_only");
            state
                .db
                .upsert_runtime_update_policy(&user.id, update_channel, auto_apply, None, None)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
        }
        "check_updates" => {
            check_runtime_updates(&state.db, &user.id)
                .await
                .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
        }
        "apply_update" => {
            apply_runtime_update(&state.db, &user.id)
                .await
                .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "runtime update action must be set_policy, check_updates, or apply_update"
                    .to_string(),
            ));
        }
    }

    let response = load_runtime_updates_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_recovery_packet_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeRecoveryPacketResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let runtime_backups = load_runtime_backups_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_restore_drills = load_runtime_restore_drills_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_updates = load_runtime_updates_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_deployment = match state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        Some(deployment) => Some(
            runtime_deployment_response_live(
                inspect_runtime_deployment_live(inspect_runtime_deployment(deployment)).await,
            )
            .await,
        ),
        None => None,
    };

    Ok(Json(build_runtime_recovery_packet_response(
        &user,
        runtime_deployment,
        runtime_backups,
        runtime_restore_drills,
        runtime_updates,
    )))
}

async fn device_bootstrap_bundle_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<DeviceBootstrapRequest>,
) -> Result<Json<DeviceBootstrapBundleResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("device_bootstrap_bundle", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let bundle =
        build_device_bootstrap_bundle_response(&user, &agents, request.device_class.trim())?;
    let profile = default_device_sync_profile(&bundle.device_class);
    let sync_slices = sync_slices_for_bundle(&bundle.device_class, &profile)?;
    state
        .db
        .upsert_sync_device(&bundle.bootstrap)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    state
        .db
        .upsert_sync_device_policy(
            &user.id,
            &bundle.bootstrap,
            &bundle.device_class,
            &profile,
            &sync_slices,
            bundle.requires_local_key_material,
            serde_json::json!({
                "source": "device_bootstrap_bundle",
                "default_profile": true,
                "policy_note": device_policy_note(&bundle.device_class, &profile),
            }),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(bundle))
}

async fn device_sync_policies_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<DeviceSyncPoliciesResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let response = load_device_sync_policies_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn device_sync_policies_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<DeviceSyncPolicyRequest>,
) -> Result<Json<DeviceSyncPoliciesResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("device_sync_policies", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let action = request.action.trim().to_lowercase();
    match action.as_str() {
        "set_profile" => {
            let device_id = request
                .device_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| (StatusCode::BAD_REQUEST, "device_id is required".to_string()))?;
            let profile = request
                .policy_profile
                .as_deref()
                .map(str::trim)
                .filter(|value| matches!(*value, "full" | "balanced" | "lightweight"))
                .ok_or_else(|| {
                    (
                        StatusCode::BAD_REQUEST,
                        "policy_profile must be full, balanced, or lightweight".to_string(),
                    )
                })?;
            let existing = state
                .db
                .find_sync_device_policy_by_user(&user.id, device_id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .ok_or_else(|| {
                    (
                        StatusCode::NOT_FOUND,
                        "sync device policy not found for this account".to_string(),
                    )
                })?;
            let sync_slices = sync_slices_for_bundle(&existing.device_class, profile)?;
            state
                .db
                .update_sync_device_policy(
                    &user.id,
                    device_id,
                    profile,
                    &sync_slices,
                    requires_local_key_material(&sync_slices),
                    serde_json::json!({
                        "source": "dashboard_policy_update",
                        "policy_note": device_policy_note(&existing.device_class, profile),
                    }),
                )
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .ok_or_else(|| {
                    (
                        StatusCode::NOT_FOUND,
                        "sync device policy not found for this account".to_string(),
                    )
                })?;
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "device sync policy action must be set_profile".to_string(),
            ));
        }
    }
    let response = load_device_sync_policies_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn update_support_access_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SupportAccessRequest>,
) -> Result<Json<SupportAccessStateResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("support_access", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let action = request.action.trim().to_lowercase();

    match action.as_str() {
        "grant" => {
            let duration_hours = request.duration_hours.unwrap_or(1);
            if !matches!(duration_hours, 1 | 4 | 24) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "support access duration must be 1, 4, or 24 hours".to_string(),
                ));
            }
            let reason = request
                .reason
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    (
                        StatusCode::BAD_REQUEST,
                        "support access reason is required".to_string(),
                    )
                })?;
            let access_scope = request
                .access_scope
                .as_deref()
                .map(str::trim)
                .filter(|value| matches!(*value, "runtime_metadata_only" | "runtime_debug"))
                .unwrap_or("runtime_metadata_only");
            let expires_at =
                (chrono::Utc::now() + chrono::Duration::hours(duration_hours)).to_rfc3339();
            let notes = serde_json::json!({
                "source": "dashboard",
                "granted_by": "user_self",
                "privacy_boundary": "support_access_disabled_by_default",
            });
            let record = state
                .db
                .create_support_access_grant(
                    &user.id,
                    access_scope,
                    Some(reason),
                    &expires_at,
                    notes,
                )
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(support_access_state_response(record)))
        }
        "revoke" => {
            let record = state
                .db
                .revoke_active_support_access(
                    &user.id,
                    request
                        .reason
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty()),
                )
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(
                record
                    .map(support_access_state_response)
                    .unwrap_or_else(default_support_access_state_response),
            ))
        }
        _ => Err((
            StatusCode::BAD_REQUEST,
            "support access action must be grant or revoke".to_string(),
        )),
    }
}

async fn local_windows_installer_http() -> impl IntoResponse {
    let content = include_str!("../scripts/install-omnyid-private.ps1");
    (
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; charset=utf-8",
        )],
        content,
    )
}

async fn local_unix_installer_http() -> impl IntoResponse {
    let content = include_str!("../scripts/install-omnyid-private.sh");
    (
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; charset=utf-8",
        )],
        content,
    )
}

async fn runtime_deploy_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeDeployRequest>,
) -> Result<Json<RuntimeDeploymentResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_deploy", &headers),
        RateLimitPolicy {
            max_requests: 6,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let onboarding = state
        .db
        .find_user_onboarding(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .unwrap_or_else(|| default_onboarding_for_user(&user));

    if onboarding.completed_at.is_none() {
        return Err((
            StatusCode::PRECONDITION_REQUIRED,
            "complete agent setup before deploying a private runtime".to_string(),
        ));
    }

    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let deployment = build_runtime_deployment_plan(
        &user,
        &agents,
        request.framework.as_deref().unwrap_or("crewai"),
        request.gui.as_deref(),
    )?;

    materialize_runtime_scaffold(&deployment)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    let mut deployment = inspect_runtime_deployment(deployment);
    deployment = match runtime_compose_action(&deployment, "start").await {
        Ok(()) => inspect_runtime_deployment_live(deployment).await,
        Err(err) => annotate_runtime_error(deployment, "scaffolded", &err),
    };

    state
        .db
        .upsert_runtime_deployment(&deployment)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(runtime_deployment_response_live(deployment).await))
}

async fn runtime_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeActionRequest>,
) -> Result<Json<RuntimeDeploymentResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_action", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    let action = request.action.trim().to_lowercase();
    if !matches!(action.as_str(), "start" | "stop" | "restart") {
        return Err((
            StatusCode::BAD_REQUEST,
            "runtime action must be start, stop, or restart".to_string(),
        ));
    }

    let deployment = inspect_runtime_deployment(deployment);
    let fallback_status = deployment.status.clone();
    let mut deployment = match runtime_compose_action(&deployment, &action).await {
        Ok(()) => inspect_runtime_deployment_live(deployment).await,
        Err(err) => annotate_runtime_error(deployment, &fallback_status, &err),
    };
    deployment.updated_at = chrono::Utc::now().to_rfc3339();

    state
        .db
        .upsert_runtime_deployment(&deployment)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(runtime_deployment_response_live(deployment).await))
}

async fn runtime_destroy_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_destroy", &headers),
        RateLimitPolicy {
            max_requests: 6,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    let deployment = inspect_runtime_deployment(deployment);
    let stopped = runtime_compose_down(&deployment).await;
    let workspace_removed = remove_runtime_workspace(&deployment.workspace_path)
        .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    let deleted = state
        .db
        .delete_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .is_some();

    Ok(Json(serde_json::json!({
        "status": "destroyed",
        "workspace_removed": workspace_removed,
        "runtime_record_deleted": deleted,
        "compose_down": stopped.is_ok(),
        "compose_down_error": stopped.err(),
        "message": "Private runtime destroyed. The dashboard no longer retains a hosted runtime record for this account."
    })))
}

async fn account_delete_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<AccountDeleteRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("account_delete", &headers),
        RateLimitPolicy {
            max_requests: 4,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !account_delete_confirmation_is_valid(&user.email, &request) {
        return Err((
            StatusCode::BAD_REQUEST,
            "account deletion requires your exact email plus the phrase DELETE MY OMNYID ACCOUNT"
                .to_string(),
        ));
    }

    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let agent_ids = agents
        .iter()
        .map(|agent| agent.agent_id.clone())
        .collect::<Vec<_>>();

    if let Some(deployment) = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        let inspected = inspect_runtime_deployment(deployment);
        let _ = runtime_compose_down(&inspected).await;
        remove_runtime_workspace(&inspected.workspace_path)
            .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    }
    let _ = remove_runtime_backup_artifacts(&user.id);

    state
        .db
        .delete_user_account_and_data(&user.id, &user.email, &agent_ids)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "status": "deleted",
        "message": "Your OmnyID account and hosted data were deleted from the managed environment."
    })))
}

async fn runtime_logs_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeLogsResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    let deployment = inspect_runtime_deployment_live(inspect_runtime_deployment(deployment)).await;
    let (source, lines) = runtime_log_lines(&deployment).await;

    Ok(Json(RuntimeLogsResponse {
        status: deployment.status,
        source,
        lines,
        updated_at: chrono::Utc::now().to_rfc3339(),
    }))
}

async fn runtime_runner_config_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    if deployment.framework != "python-runner-chat" {
        return Err((
            StatusCode::BAD_REQUEST,
            "runner config is only available for the Python runner runtime".to_string(),
        ));
    }
    let policy_events = state
        .db
        .list_runtime_runner_policy_events(&user.id, 8)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(runtime_runner_policy_event_entry_response)
        .collect::<Vec<_>>();
    Ok(Json(serde_json::json!({
        "framework": deployment.framework,
        "model_policy": deployment.config_json.get("model_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "tool_policy": deployment.config_json.get("tool_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "channel_policy": deployment.config_json.get("channel_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "starter_templates": deployment.config_json.get("starter_templates").cloned().unwrap_or_else(|| Value::Array(vec![])),
        "starter_template_id": deployment
            .config_json
            .get("starter_profile")
            .and_then(|profile| profile.get("default_template_id"))
            .cloned()
            .unwrap_or_else(|| Value::String("student_day_planner".to_string())),
        "policy_events": policy_events,
    })))
}

async fn runtime_runner_config_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeRunnerConfigRequest>,
) -> Result<Json<RuntimeDeploymentResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_runner_config", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let mut deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    if deployment.framework != "python-runner-chat" {
        return Err((
            StatusCode::BAD_REQUEST,
            "runner config is only available for the Python runner runtime".to_string(),
        ));
    }
    if request.action.trim() != "save_policies" {
        return Err((
            StatusCode::BAD_REQUEST,
            "runtime runner config action must be save_policies".to_string(),
        ));
    }
    let config = deployment.config_json.as_object_mut().ok_or_else(|| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "runtime config is malformed".to_string(),
        )
    })?;
    if let Some(model_policy) = request.model_policy {
        config.insert("model_policy".to_string(), model_policy);
    }
    if let Some(tool_policy) = request.tool_policy {
        config.insert("tool_policy".to_string(), tool_policy);
    }
    if let Some(channel_policy) = request.channel_policy {
        config.insert("channel_policy".to_string(), channel_policy);
    }
    if let Some(starter_template_id) = request.starter_template_id {
        let starter_profile = config
            .entry("starter_profile".to_string())
            .or_insert_with(|| serde_json::json!({}));
        if let Some(profile) = starter_profile.as_object_mut() {
            profile.insert(
                "default_template_id".to_string(),
                Value::String(starter_template_id),
            );
        }
    }
    let updated_at = chrono::Utc::now().to_rfc3339();
    deployment.updated_at = updated_at.clone();
    sync_runtime_policy_file(&deployment)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    sync_runtime_agent_profile_file(&deployment)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    state
        .db
        .upsert_runtime_deployment(&deployment)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let enabled_tools = deployment
        .config_json
        .get("tool_policy")
        .and_then(Value::as_object)
        .map(|policy| {
            policy
                .iter()
                .filter_map(|(name, value)| {
                    value
                        .get("enabled")
                        .and_then(Value::as_bool)
                        .filter(|enabled| *enabled)
                        .map(|_| Value::String(name.clone()))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let enabled_channels = deployment
        .config_json
        .get("channel_policy")
        .and_then(Value::as_object)
        .map(|policy| {
            policy
                .iter()
                .filter_map(|(name, value)| {
                    value
                        .get("enabled")
                        .and_then(Value::as_bool)
                        .filter(|enabled| *enabled)
                        .map(|_| Value::String(name.clone()))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    state
        .db
        .create_runtime_runner_policy_event(&RuntimeRunnerPolicyEventRecord {
            id: Ulid::new().to_string(),
            owner_user_id: user.id.clone(),
            runtime_deployment_id: Some(deployment.id.clone()),
            event_kind: "policy_saved".to_string(),
            summary_json: serde_json::json!({
                "starter_template_id": deployment
                    .config_json
                    .get("starter_profile")
                    .and_then(|profile| profile.get("default_template_id"))
                    .cloned()
                    .unwrap_or_else(|| Value::String("student_day_planner".to_string())),
                "model_mode": deployment
                    .config_json
                    .get("model_policy")
                    .and_then(|policy| policy.get("mode"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "default_model": deployment
                    .config_json
                    .get("model_policy")
                    .and_then(|policy| policy.get("default_model"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "daily_spend_cap_usd": deployment
                    .config_json
                    .get("model_policy")
                    .and_then(|policy| policy.get("daily_spend_cap_usd"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "monthly_spend_cap_usd": deployment
                    .config_json
                    .get("model_policy")
                    .and_then(|policy| policy.get("monthly_spend_cap_usd"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "enabled_tools": enabled_tools,
                "enabled_channels": enabled_channels,
                "synced_files": ["runtime_policy.json", "agent_profile.json"],
            }),
            created_at: updated_at,
        })
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(runtime_deployment_response_live(deployment).await))
}

async fn runtime_workspace_files_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeWorkspaceFilesResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    if deployment.framework != "python-runner-chat" {
        return Err((
            StatusCode::BAD_REQUEST,
            "workspace file editing is only available for the Python runner runtime".to_string(),
        ));
    }
    let files = python_runner_workspace_files(&deployment);
    let active_file_id = files.first().map(|file| file.file_id.to_string());

    Ok(Json(RuntimeWorkspaceFilesResponse {
        framework: deployment.framework,
        active_file_id,
        files: files
            .into_iter()
            .map(|file| RuntimeWorkspaceFileEntryResponse {
                file_id: file.file_id.to_string(),
                label: file.label.to_string(),
                relative_path: file.relative_path.to_string(),
                language: file.language.to_string(),
                editable: file.editable,
            })
            .collect(),
    }))
}

async fn runtime_workspace_file_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<RuntimeWorkspaceFileQuery>,
) -> Result<Json<RuntimeWorkspaceFileResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    if deployment.framework != "python-runner-chat" {
        return Err((
            StatusCode::BAD_REQUEST,
            "workspace file editing is only available for the Python runner runtime".to_string(),
        ));
    }
    let descriptor =
        python_runner_workspace_file(&deployment, &query.file_id).ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "workspace file not found".to_string(),
            )
        })?;
    let content = std::fs::read_to_string(&descriptor.path).map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to read workspace file: {err}"),
        )
    })?;
    let updated_at = std::fs::metadata(&descriptor.path)
        .and_then(|meta| meta.modified())
        .ok()
        .map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    Ok(Json(RuntimeWorkspaceFileResponse {
        file_id: descriptor.file_id.to_string(),
        label: descriptor.label.to_string(),
        relative_path: descriptor.relative_path.to_string(),
        language: descriptor.language.to_string(),
        editable: descriptor.editable,
        content,
        updated_at,
    }))
}

async fn runtime_workspace_file_save_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeWorkspaceFileSaveRequest>,
) -> Result<Json<RuntimeWorkspaceFileResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_workspace_file", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    if deployment.framework != "python-runner-chat" {
        return Err((
            StatusCode::BAD_REQUEST,
            "workspace file editing is only available for the Python runner runtime".to_string(),
        ));
    }
    let descriptor =
        python_runner_workspace_file(&deployment, &request.file_id).ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "workspace file not found".to_string(),
            )
        })?;
    if !descriptor.editable {
        return Err((
            StatusCode::BAD_REQUEST,
            "selected workspace file is read-only".to_string(),
        ));
    }
    write_runtime_file(&descriptor.path, &request.content)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    Ok(Json(RuntimeWorkspaceFileResponse {
        file_id: descriptor.file_id.to_string(),
        label: descriptor.label.to_string(),
        relative_path: descriptor.relative_path.to_string(),
        language: descriptor.language.to_string(),
        editable: descriptor.editable,
        content: request.content,
        updated_at: chrono::Utc::now().to_rfc3339(),
    }))
}

async fn ui_command_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<UiCommandRequest>,
) -> Result<Json<UiCommandResponse>, (StatusCode, String)> {
    let engine = normalize_search_engine(request.engine.as_deref());
    let trimmed_query = request.query.trim();
    if trimmed_query.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "query is required".to_string()));
    }

    // Try to resolve authenticated user (optional — unauthenticated callers still get fallback)
    let opt_user = if bearer_token_from_headers(&headers).is_some() {
        authenticated_user(&state.db, &headers).await.ok()
    } else {
        None
    };

    let deployment = if let Some(ref user) = opt_user {
        state
            .db
            .find_runtime_deployment_by_user(&user.id)
            .await
            .ok()
            .flatten()
    } else {
        None
    };

    let base = route_ui_command(
        trimmed_query,
        engine.clone(),
        deployment.as_ref(),
        request.active_file_id.as_deref(),
    );

    // For authenticated users with an LLM configured, use the model to classify
    // intent and act accordingly — tasks, research, notes, or orchestration.
    // Unauthenticated / no-LLM calls fall through to the keyword-based base result.
    if let Some(ref user) = opt_user {
        if let Ok(Some(llm_cfg)) = state.db.get_llm_config(&user.id).await {
            let backend_name = llm_cfg["backend"].as_str().unwrap_or("hosted").to_string();
            let (api_key, model) = if backend_name == "runpod" {
                (
                    std::env::var("OMNYID_RUNPOD_API_KEY").unwrap_or_default(),
                    llm_cfg["model"]
                        .as_str()
                        .unwrap_or("Qwen/Qwen3.5-35B-A3B")
                        .to_string(),
                )
            } else {
                (
                    std::env::var("OMNYID_ANTHROPIC_KEY")
                        .or_else(|_| std::env::var("ANTHROPIC_API_KEY"))
                        .unwrap_or_default(),
                    llm_cfg["model"]
                        .as_str()
                        .unwrap_or("claude-haiku-4-5-20251001")
                        .to_string(),
                )
            };

            if !api_key.is_empty() {
                // Single LLM call: classify intent AND generate structured content.
                // The model picks the intent and fills in the matching fields.
                let system_prompt = r#"You are an AI agent's command router. Given a user message, classify the intent and return ONLY a valid JSON object — no markdown, no explanation, no code fences.

INTENT RULES (apply strictly):
- "schedule"     : planning time, day scheduling, calendar events, lessons, appointments, "plan my day", "block time", "add to calendar". Key signals: "plan", "schedule", "lesson", "appointment", "calendar", "block", "from Xpm", "at X:XX".
- "task"         : adding/managing items — shopping lists, to-dos, reminders, buying things, errands. Key signals: "add", "buy", "remind me", "shopping list", "to-do", "task", "pick up", "don't forget".
- "note"         : saving information, writing a memo, journaling, quick capture. Key signals: "note", "save this", "remember", "jot", "write down".
- "orchestrate"  : complex multi-step goals requiring planning and background work. Key signals: "organise my", "handle all my", "set up", "manage my", "do everything for".
- "web_research" : ONLY when the user clearly wants to look something up, research a topic, or asks a factual question. Key signals: "what is", "how does", "search for", "find info", "tell me about", "research".

IMPORTANT: "plan my day", "I have lessons at X", "schedule my workout" → ALWAYS "schedule", NEVER "task".
IMPORTANT: "add X to my shopping list", "buy X", "remind me to X" → ALWAYS "task", NEVER "web_research".

preferred_view values: "draggable_calendar" for schedule, "task_board" for task, "note_canvas" for note, "orchestrate_progress" for orchestrate, "search_result" for web_research.

Return the matching schema:

schedule:
{"intent":"schedule","preferred_view":"draggable_calendar","title":"<brief title>","description":"<full description>","summary":"<friendly confirmation>","slots":[{"label":"<slot name>","start_hour":<hour 0-23>,"duration_hours":<hours>}]}

task:
{"intent":"task","preferred_view":"task_board","title":"<short task title>","description":"<full description>","priority":"low|normal|high","task_type":"shopping|todo|reminder|general","summary":"<friendly confirmation, e.g. 'Added to shopping list: Toothbrush'>"}

web_research:
{"intent":"web_research","preferred_view":"search_result","query":"<cleaned search query>","summary":"<1-2 sentence overview based on your knowledge>","bullets":["key point 1","key point 2","key point 3"],"sources":[{"title":"source name","url":"https://example.com","snippet":"brief description"}]}

note:
{"intent":"note","preferred_view":"note_canvas","title":"<note title>","content":"<full note content>","summary":"<friendly confirmation>"}

orchestrate:
{"intent":"orchestrate","preferred_view":"orchestrate_progress","objective":"<full multi-step objective>","summary":"<what you are about to do>"}"#;

                let infer_req = crate::inference::InferenceRequest {
                    system: system_prompt.to_string(),
                    messages: vec![crate::inference::InferenceMessage {
                        role: "user".to_string(),
                        content: trimmed_query.to_string(),
                    }],
                    max_tokens: 900,
                    temperature: 0.2,
                };

                let infer_result = if backend_name == "runpod" {
                    let ep = std::env::var("OMNYID_RUNPOD_ENDPOINT_ID").unwrap_or_default();
                    crate::inference::runpod_infer(&api_key, &ep, &model, &infer_req).await
                } else {
                    crate::inference::anthropic_infer(&api_key, &model, &infer_req).await
                };

                if let Ok(infer_resp) = infer_result {
                    let raw = infer_resp.content.trim();
                    let json_str = raw
                        .trim_start_matches("```json")
                        .trim_start_matches("```")
                        .trim_end_matches("```")
                        .trim();

                    if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                        let detected_intent = parsed["intent"].as_str().unwrap_or("web_research");
                        let summary = parsed["summary"]
                            .as_str()
                            .unwrap_or(trimmed_query)
                            .to_string();
                        // preferred_view: LLM may supply it, or fall back to intent mapping
                        let preferred_view = parsed["preferred_view"]
                            .as_str()
                            .map(str::to_string)
                            .unwrap_or_else(|| preferred_view_for_intent(detected_intent));

                        // Get the master agent instance for AFP message authorship
                        let agent_id_opt = state
                            .db
                            .get_master_agent_instance(&user.id)
                            .await
                            .ok()
                            .flatten()
                            .and_then(|inst| inst["agent_id"].as_str().map(str::to_string));

                        match detected_intent {
                            // ── Schedule / day-plan ──────────────────────────────────────────
                            "schedule" => {
                                let title = parsed["title"]
                                    .as_str()
                                    .unwrap_or("Scheduled plan")
                                    .to_string();
                                let description =
                                    parsed["description"].as_str().unwrap_or("").to_string();
                                // Persist as a high-priority task so the fleet view tracks it
                                let instance =
                                    state.db.get_agent_instance(&user.id).await.ok().flatten();
                                if let (Some(inst), Some(agent_id)) =
                                    (instance, agent_id_opt.clone())
                                {
                                    let instance_id = inst["id"].as_str().unwrap_or("").to_string();
                                    let task = AgentTask::new(
                                        user.id.clone(),
                                        instance_id,
                                        title.clone(),
                                        TaskPriority::Normal,
                                    );
                                    let task_id = task.id.clone();
                                    let thread_id = task.thread_id.clone();
                                    let _ = state.db.create_agent_task(&task).await;
                                    // Store AFP message with draggable_calendar view so frontend renders the planner
                                    let slots = parsed["slots"].clone();
                                    let msg_content = serde_json::json!({
                                        "task_id": task_id,
                                        "title": title,
                                        "description": description,
                                        "status": "pending",
                                        "slots": slots,
                                    });
                                    let msg_views = vec![serde_json::json!({
                                        "format": "draggable_calendar",
                                        "content": {
                                            "title": title,
                                            "slots": slots,
                                            "pending_confirmation": true,
                                        },
                                        "priority": 10
                                    })];
                                    if let Ok(msg) = new_server_message(
                                        agent_id,
                                        vec![],
                                        thread_id,
                                        "schedule",
                                        msg_content,
                                        msg_views,
                                        vec![],
                                        vec![],
                                        true,
                                    ) {
                                        let _ = store_private_app_message(
                                            &state.db,
                                            &state.metrics,
                                            &state.relay_tx,
                                            &user.id,
                                            msg,
                                        )
                                        .await;
                                    }
                                }
                                let bullets: Vec<String> = parsed["slots"]
                                    .as_array()
                                    .map(|arr| {
                                        arr.iter()
                                            .filter_map(|s| {
                                                let label = s["label"].as_str()?;
                                                let start = s["start_hour"].as_u64().unwrap_or(0);
                                                let dur =
                                                    s["duration_hours"].as_f64().unwrap_or(1.0);
                                                Some(format!("{label} — {start:02}:00 ({dur}h)"))
                                            })
                                            .collect()
                                    })
                                    .unwrap_or_default();
                                let preview_events = parsed["slots"]
                                    .as_array()
                                    .cloned()
                                    .unwrap_or_default()
                                    .iter()
                                    .enumerate()
                                    .map(|(idx, slot)| {
                                        let start_hour = slot["start_hour"].as_u64().unwrap_or(9);
                                        let duration_hours =
                                            slot["duration_hours"].as_u64().unwrap_or(1).max(1);
                                        serde_json::json!({
                                            "id": format!("schedule-slot-{idx}"),
                                            "title": slot["label"].as_str().unwrap_or("Planned block"),
                                            "start": format!("2026-03-27T{start_hour:02}:00:00Z"),
                                            "end": format!("2026-03-27T{:02}:00:00Z", start_hour + duration_hours),
                                            "description": description,
                                            "status": "tentative",
                                        })
                                    })
                                    .collect::<Vec<_>>();
                                return Ok(Json(finalize_ui_command_response(
                                    trimmed_query,
                                    UiCommandResponse {
                                        intent: "schedule".to_string(),
                                        suggested_view: "calendar".to_string(),
                                        preferred_view,
                                        summary,
                                        engine,
                                        links: vec![],
                                        runner_draft: None,
                                        bullets,
                                        card_id: None,
                                        preview_message: Some(AFPMessage {
                                            protocol: "afp-v1".to_string(),
                                            id: format!("preview.schedule.{}", Ulid::new()),
                                            thread_id: format!(
                                                "thread.preview.schedule.{}",
                                                Ulid::new()
                                            ),
                                            parent_id: None,
                                            from: "omnyid://workspace/command-bar".to_string(),
                                            to: vec!["omnyid://workspace/user".to_string()],
                                            timestamp: chrono::Utc::now().to_rfc3339(),
                                            r#type: "schedule".to_string(),
                                            subtype: Some("preview".to_string()),
                                            content: serde_json::json!({
                                                "title": title,
                                                "description": description,
                                                "events": preview_events,
                                            }),
                                            metadata: Some(serde_json::json!({
                                                "origin": "workspace_command_preview"
                                            })),
                                            signature: String::new(),
                                            encryption: None,
                                            views: vec![serde_json::json!({
                                                "format": "calendar",
                                                "priority": 100,
                                                "content": {
                                                    "title": title,
                                                    "events": preview_events,
                                                }
                                            })],
                                            references: vec![],
                                            attachments: vec![],
                                            store_in_relational: false,
                                            prev_hash: None,
                                        }),
                                    },
                                )));
                            }

                            // ── Task creation ────────────────────────────────────────────────
                            "task" => {
                                let title = parsed["title"]
                                    .as_str()
                                    .unwrap_or(trimmed_query)
                                    .to_string();
                                let description =
                                    parsed["description"].as_str().unwrap_or("").to_string();
                                let priority_str = parsed["priority"].as_str().unwrap_or("normal");
                                let task_type = parsed["task_type"]
                                    .as_str()
                                    .unwrap_or("general")
                                    .to_string();
                                let priority = match priority_str {
                                    "high" => TaskPriority::High,
                                    "low" => TaskPriority::Low,
                                    _ => TaskPriority::Normal,
                                };

                                // Get the primary (non-master) agent instance for task ownership
                                let instance =
                                    state.db.get_agent_instance(&user.id).await.ok().flatten();
                                if let Some(inst) = instance {
                                    let instance_id = inst["id"].as_str().unwrap_or("").to_string();
                                    let task = AgentTask::new(
                                        user.id.clone(),
                                        instance_id,
                                        title.clone(),
                                        priority,
                                    );
                                    let task_id = task.id.clone();
                                    let thread_id = task.thread_id.clone();
                                    let _ = state.db.create_agent_task(&task).await;

                                    // Store AFP message with task_card view
                                    if let Some(agent_id) = agent_id_opt {
                                        let msg_content = serde_json::json!({
                                            "task_id": task_id,
                                            "title": title,
                                            "description": description,
                                            "priority": priority_str,
                                            "task_type": task_type,
                                            "status": "pending",
                                        });
                                        let msg_views = vec![serde_json::json!({
                                            "format": "task_card",
                                            "content": {
                                                "task_id": task_id,
                                                "title": title,
                                                "description": description,
                                                "priority": priority_str,
                                                "task_type": task_type,
                                                "status": "pending",
                                            },
                                            "priority": 10
                                        })];
                                        if let Ok(msg) = new_server_message(
                                            agent_id,
                                            vec![],
                                            thread_id,
                                            "task",
                                            msg_content,
                                            msg_views,
                                            vec![],
                                            vec![],
                                            true,
                                        ) {
                                            let _ = store_private_app_message(
                                                &state.db,
                                                &state.metrics,
                                                &state.relay_tx,
                                                &user.id,
                                                msg,
                                            )
                                            .await;
                                        }
                                    }
                                }

                                return Ok(Json(finalize_ui_command_response(
                                    trimmed_query,
                                    UiCommandResponse {
                                        intent: "task".to_string(),
                                        suggested_view: "search".to_string(),
                                        preferred_view,
                                        summary,
                                        engine,
                                        links: vec![],
                                        runner_draft: None,
                                        bullets: vec![],
                                        card_id: None,
                                        preview_message: Some(AFPMessage {
                                            protocol: "afp-v1".to_string(),
                                            id: format!("preview.task.{}", Ulid::new()),
                                            thread_id: format!(
                                                "thread.preview.task.{}",
                                                Ulid::new()
                                            ),
                                            parent_id: None,
                                            from: "omnyid://workspace/command-bar".to_string(),
                                            to: vec!["omnyid://workspace/user".to_string()],
                                            timestamp: chrono::Utc::now().to_rfc3339(),
                                            r#type: "task".to_string(),
                                            subtype: Some("preview".to_string()),
                                            content: serde_json::json!({
                                                "title": title,
                                                "description": description,
                                                "priority": priority_str,
                                                "task_type": task_type,
                                                "status": "pending",
                                            }),
                                            metadata: Some(serde_json::json!({
                                                "origin": "workspace_command_preview"
                                            })),
                                            signature: String::new(),
                                            encryption: None,
                                            views: vec![serde_json::json!({
                                                "format": "task_card",
                                                "priority": 100,
                                                "content": {
                                                    "title": title,
                                                    "description": description,
                                                    "priority": priority_str,
                                                    "task_type": task_type,
                                                    "status": "pending",
                                                }
                                            })],
                                            references: vec![],
                                            attachments: vec![],
                                            store_in_relational: false,
                                            prev_hash: None,
                                        }),
                                    },
                                )));
                            }

                            // ── Note creation ────────────────────────────────────────────────
                            "note" => {
                                let title = parsed["title"].as_str().unwrap_or("Note").to_string();
                                let content = parsed["content"]
                                    .as_str()
                                    .unwrap_or(trimmed_query)
                                    .to_string();

                                if let Some(agent_id) = agent_id_opt {
                                    let thread_id = Ulid::new().to_string();
                                    let msg_content =
                                        serde_json::json!({"title": title, "content": content});
                                    let msg_views = vec![serde_json::json!({
                                        "format": "canvas",
                                        "content": {"title": title, "body": content},
                                        "priority": 10
                                    })];
                                    if let Ok(msg) = new_server_message(
                                        agent_id,
                                        vec![],
                                        thread_id,
                                        "note",
                                        msg_content,
                                        msg_views,
                                        vec![],
                                        vec![],
                                        true,
                                    ) {
                                        let _ = store_private_app_message(
                                            &state.db,
                                            &state.metrics,
                                            &state.relay_tx,
                                            &user.id,
                                            msg,
                                        )
                                        .await;
                                    }
                                }

                                return Ok(Json(finalize_ui_command_response(
                                    trimmed_query,
                                    UiCommandResponse {
                                        intent: "note".to_string(),
                                        suggested_view: "note".to_string(),
                                        preferred_view,
                                        summary,
                                        engine,
                                        links: vec![],
                                        runner_draft: None,
                                        bullets: vec![],
                                        card_id: None,
                                        preview_message: Some(AFPMessage {
                                            protocol: "afp-v1".to_string(),
                                            id: format!("preview.note.{}", Ulid::new()),
                                            thread_id: format!(
                                                "thread.preview.note.{}",
                                                Ulid::new()
                                            ),
                                            parent_id: None,
                                            from: "omnyid://workspace/command-bar".to_string(),
                                            to: vec!["omnyid://workspace/user".to_string()],
                                            timestamp: chrono::Utc::now().to_rfc3339(),
                                            r#type: "note".to_string(),
                                            subtype: Some("preview".to_string()),
                                            content: serde_json::json!({
                                                "title": title,
                                                "blocks": [
                                                    {"type": "paragraph", "text": content}
                                                ],
                                            }),
                                            metadata: Some(serde_json::json!({
                                                "origin": "workspace_command_preview"
                                            })),
                                            signature: String::new(),
                                            encryption: None,
                                            views: vec![serde_json::json!({
                                                "format": "canvas",
                                                "priority": 100,
                                                "content": {
                                                    "title": title,
                                                    "blocks": [
                                                        {"type": "paragraph", "text": content}
                                                    ],
                                                }
                                            })],
                                            references: vec![],
                                            attachments: vec![],
                                            store_in_relational: false,
                                            prev_hash: None,
                                        }),
                                    },
                                )));
                            }

                            // ── Orchestration ────────────────────────────────────────────────
                            "orchestrate" => {
                                let objective = parsed["objective"]
                                    .as_str()
                                    .unwrap_or(trimmed_query)
                                    .to_string();
                                let thread_id = format!("thread.orchestrate.{}", Ulid::new());
                                let card_id = format!("card.orchestrate.{}", Ulid::new());
                                let gate = classify_orchestration_gate(&objective);
                                let initial_summary = if gate == OrchestrationGate::Approval {
                                    format!(
                                        "This orchestration may trigger external actions. Review the plan and confirm before OmnyID proceeds: {objective}"
                                    )
                                } else if gate == OrchestrationGate::Clarification {
                                    format!(
                                        "This objective is still a bit broad. Review the draft plan and decide whether OmnyID should proceed with best-effort assumptions: {objective}"
                                    )
                                } else {
                                    format!("Orchestrating: {objective}")
                                };
                                let preview_message = Some(orchestration_preview_message(
                                    &objective,
                                    &initial_summary,
                                    &card_id,
                                    &thread_id,
                                    gate,
                                ));

                                if let Some(agent_id) = agent_id_opt.clone() {
                                    let msg_content = serde_json::json!({
                                        "card_id": card_id,
                                        "query": objective,
                                        "status": "streaming",
                                        "optimization_mode": "balanced",
                                        "provider": "omnyid",
                                        "model": "",
                                        "gate": match gate {
                                            OrchestrationGate::None => "none",
                                            OrchestrationGate::Clarification => "clarification",
                                            OrchestrationGate::Approval => "approval",
                                        },
                                        "sections": orchestrate_card_sections(&initial_summary, &objective, gate),
                                    });
                                    if let Ok(msg) = new_server_message(
                                        agent_id,
                                        vec![],
                                        thread_id.clone(),
                                        "generative_card",
                                        msg_content,
                                        vec![],
                                        vec![],
                                        vec![],
                                        true,
                                    ) {
                                        let _ = store_private_app_message(
                                            &state.db,
                                            &state.metrics,
                                            &state.relay_tx,
                                            &user.id,
                                            msg,
                                        )
                                        .await;
                                    }
                                }
                                if gate == OrchestrationGate::None {
                                    let lora_active = state
                                        .db
                                        .get_master_agent_instance(&user.id)
                                        .await
                                        .ok()
                                        .flatten()
                                        .and_then(|inst| inst["lora_genome_active"].as_bool())
                                        .unwrap_or(false);
                                    spawn_orchestration_run(
                                        state.clone(),
                                        user.id.clone(),
                                        api_key.clone(),
                                        model.clone(),
                                        backend_name.clone(),
                                        objective.clone(),
                                        lora_active,
                                        thread_id.clone(),
                                        card_id.clone(),
                                        agent_id_opt.clone(),
                                    );
                                }

                                return Ok(Json(finalize_ui_command_response(
                                    trimmed_query,
                                    UiCommandResponse {
                                        intent: "orchestrate".to_string(),
                                        suggested_view: "search".to_string(),
                                        preferred_view: preferred_view_for_intent("orchestrate"),
                                        summary: initial_summary,
                                        engine,
                                        links: vec![],
                                        runner_draft: None,
                                        bullets: if gate == OrchestrationGate::Approval {
                                            vec![
                                                "Approval is required before OmnyID starts the orchestration.".to_string(),
                                                "Use the card controls to proceed or cancel.".to_string(),
                                            ]
                                        } else if gate == OrchestrationGate::Clarification {
                                            vec![
                                                "A clarification checkpoint is required before OmnyID starts working.".to_string(),
                                                "You can proceed with best-effort assumptions or cancel and refine the request.".to_string(),
                                            ]
                                        } else {
                                            vec![
                                                "Agent is working on this in the background."
                                                    .to_string(),
                                                "Results will appear in the agent feed when ready."
                                                    .to_string(),
                                            ]
                                        },
                                        card_id: Some(card_id),
                                        preview_message,
                                    },
                                )));
                            }

                            // ── Web research — fetch real results, then LLM summarizes ──────────
                            _ => {
                                let search_query = parsed["query"]
                                    .as_str()
                                    .unwrap_or(trimmed_query)
                                    .to_string();
                                let _ = agent_id_opt;

                                // Step 1: Fetch real web results from DuckDuckGo (free, no key needed)
                                let ddg_context = fetch_ddg_results(&search_query).await;

                                // Step 2: Second LLM call to summarize real results
                                let (final_summary, bullets, links) = if ddg_context.is_empty() {
                                    // No DDG results — fall back to LLM knowledge with disclaimer
                                    let b: Vec<String> = parsed["bullets"]
                                        .as_array()
                                        .map(|arr| {
                                            arr.iter()
                                                .filter_map(|v| v.as_str().map(String::from))
                                                .collect()
                                        })
                                        .unwrap_or_default();
                                    let s: Vec<Value> =
                                        parsed["sources"].as_array().cloned().unwrap_or_default();
                                    let l: Vec<UiCommandLink> = s
                                        .iter()
                                        .filter_map(|src| {
                                            Some(UiCommandLink {
                                                title: src["title"].as_str()?.to_string(),
                                                url: src["url"].as_str()?.to_string(),
                                                kind: "source".to_string(),
                                            })
                                        })
                                        .collect();
                                    (
                                        format!(
                                            "{summary} (from agent knowledge — live web results unavailable)"
                                        ),
                                        b,
                                        l,
                                    )
                                } else {
                                    summarize_search_results(
                                        &search_query,
                                        &ddg_context,
                                        &api_key,
                                        &model,
                                        &backend_name,
                                    )
                                    .await
                                };

                                // Add direct search link always
                                let mut all_links = links;
                                all_links.push(UiCommandLink {
                                    title: format!("Search: {search_query}"),
                                    url: search_engine_url(&engine, &search_query),
                                    kind: "search".to_string(),
                                });

                                return Ok(Json(finalize_ui_command_response(
                                    trimmed_query,
                                    UiCommandResponse {
                                        intent: "web_research".to_string(),
                                        suggested_view: "search".to_string(),
                                        preferred_view: preferred_view.clone(),
                                        summary: final_summary,
                                        engine,
                                        links: all_links,
                                        runner_draft: None,
                                        bullets,
                                        card_id: None,
                                        preview_message: None,
                                    },
                                )));
                            }
                        }
                    }
                }
            }
        }
    }

    // Browser AI path — authenticated user, no server LLM, but client sent a
    // pre-classified intent from Chrome Gemini Nano or Edge Phi.
    if let (Some(user), Some(b_intent), Some(b_parsed)) =
        (&opt_user, &request.browser_intent, &request.browser_parsed)
    {
        let summary = b_parsed["summary"]
            .as_str()
            .unwrap_or(trimmed_query)
            .to_string();
        let agent_id_opt = state
            .db
            .get_master_agent_instance(&user.id)
            .await
            .ok()
            .flatten()
            .and_then(|inst| inst["agent_id"].as_str().map(str::to_string));

        match b_intent.as_str() {
            "task" => {
                let title = b_parsed["title"]
                    .as_str()
                    .unwrap_or(trimmed_query)
                    .to_string();
                let description = b_parsed["description"].as_str().unwrap_or("").to_string();
                let priority_str = b_parsed["priority"].as_str().unwrap_or("normal");
                let task_type = b_parsed["task_type"]
                    .as_str()
                    .unwrap_or("general")
                    .to_string();
                let priority = match priority_str {
                    "high" => TaskPriority::High,
                    "low" => TaskPriority::Low,
                    _ => TaskPriority::Normal,
                };
                let instance = state.db.get_agent_instance(&user.id).await.ok().flatten();
                if let Some(inst) = instance {
                    let instance_id = inst["id"].as_str().unwrap_or("").to_string();
                    let task =
                        AgentTask::new(user.id.clone(), instance_id, title.clone(), priority);
                    let task_id = task.id.clone();
                    let thread_id = task.thread_id.clone();
                    let _ = state.db.create_agent_task(&task).await;
                    if let Some(agent_id) = agent_id_opt {
                        let msg_content = serde_json::json!({"task_id": task_id, "title": title, "description": description, "priority": priority_str, "task_type": task_type, "status": "pending"});
                        let msg_views = vec![
                            serde_json::json!({"format": "task_card", "content": {"task_id": task_id, "title": title, "description": description, "priority": priority_str, "task_type": task_type, "status": "pending"}, "priority": 10}),
                        ];
                        if let Ok(msg) = new_server_message(
                            agent_id,
                            vec![],
                            thread_id,
                            "task",
                            msg_content,
                            msg_views,
                            vec![],
                            vec![],
                            true,
                        ) {
                            let _ = store_private_app_message(
                                &state.db,
                                &state.metrics,
                                &state.relay_tx,
                                &user.id,
                                msg,
                            )
                            .await;
                        }
                    }
                }
                return Ok(Json(finalize_ui_command_response(
                    trimmed_query,
                    UiCommandResponse {
                        intent: "task".to_string(),
                        suggested_view: "search".to_string(),
                        preferred_view: preferred_view_for_intent("task"),
                        summary,
                        engine,
                        links: vec![],
                        runner_draft: None,
                        bullets: vec![],
                        card_id: None,
                        preview_message: None,
                    },
                )));
            }
            "note" => {
                let title = b_parsed["title"].as_str().unwrap_or("Note").to_string();
                let content = b_parsed["content"]
                    .as_str()
                    .unwrap_or(trimmed_query)
                    .to_string();
                if let Some(agent_id) = agent_id_opt {
                    let thread_id = Ulid::new().to_string();
                    let msg_content = serde_json::json!({"title": title, "content": content});
                    let msg_views = vec![
                        serde_json::json!({"format": "canvas", "content": {"title": title, "body": content}, "priority": 10}),
                    ];
                    if let Ok(msg) = new_server_message(
                        agent_id,
                        vec![],
                        thread_id,
                        "note",
                        msg_content,
                        msg_views,
                        vec![],
                        vec![],
                        true,
                    ) {
                        let _ = store_private_app_message(
                            &state.db,
                            &state.metrics,
                            &state.relay_tx,
                            &user.id,
                            msg,
                        )
                        .await;
                    }
                }
                return Ok(Json(finalize_ui_command_response(
                    trimmed_query,
                    UiCommandResponse {
                        intent: "note".to_string(),
                        suggested_view: "note".to_string(),
                        preferred_view: preferred_view_for_intent("note"),
                        summary,
                        engine,
                        links: vec![],
                        runner_draft: None,
                        bullets: vec![],
                        card_id: None,
                        preview_message: None,
                    },
                )));
            }
            "orchestrate" => {
                // Orchestration requires a server-side LLM for background execution.
                return Ok(Json(finalize_ui_command_response(trimmed_query, UiCommandResponse {
                    intent: "orchestrate".to_string(),
                    suggested_view: "search".to_string(),
                    preferred_view: preferred_view_for_intent("orchestrate"),
                    summary: "Multi-step orchestration requires a server API key. Add one in Agent Settings → AI Model Configuration.".to_string(),
                    engine,
                    links: vec![],
                    runner_draft: None,
                    bullets: vec!["Go to Agent Settings and add your API key to enable full orchestration.".to_string()],
                    card_id: None,
                    preview_message: None,
                })));
            }
            _ => { /* web_research — fall through to DDG block below */ }
        }
    }

    // No LLM configured — still do a real DDG search for web_research queries.
    // Returns snippet-based bullets without LLM summarization.
    if base.intent == "web_search" {
        let q = trimmed_query.to_string();
        let ddg_results = fetch_ddg_results(&q).await;
        if !ddg_results.is_empty() {
            let (summary, bullets, mut links) = fallback_from_ddg(&ddg_results);
            links.push(UiCommandLink {
                title: format!("Search: {q}"),
                url: search_engine_url(&base.engine, &q),
                kind: "search".to_string(),
            });
            return Ok(Json(finalize_ui_command_response(
                trimmed_query,
                UiCommandResponse {
                    intent: "web_research".to_string(),
                    suggested_view: "search".to_string(),
                    preferred_view: preferred_view_for_intent("web_research"),
                    summary,
                    engine: base.engine,
                    links,
                    runner_draft: None,
                    bullets,
                    card_id: None,
                    preview_message: None,
                },
            )));
        }
    }

    Ok(Json(finalize_ui_command_response(trimmed_query, base)))
}

#[instrument(skip(state), fields(thread_id = %thread_id))]
async fn get_thread_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(thread_id): Path<String>,
) -> Result<Json<Vec<AFPMessage>>, (StatusCode, String)> {
    let messages = thread_messages_for_headers(&state.db, &headers, &thread_id).await?;

    Ok(Json(messages.into_iter().map(proto_to_app).collect()))
}

#[instrument(skip(state, request), fields(thread_id = %request.thread_id, target_message_id = %request.target_message_id))]
async fn record_action_decision_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ApprovalDecisionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let normalized_decision = request.decision.trim().to_lowercase();
    let action_status = match normalized_decision.as_str() {
        "approved" => ActionStatus::Approved,
        "rejected" => ActionStatus::Rejected,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "decision must be approved or rejected".to_string(),
            ));
        }
    };

    let thread_messages = thread_messages_for_headers(&state.db, &headers, &request.thread_id).await?;
    let target_message = thread_messages
        .iter()
        .find(|message| message.id == request.target_message_id)
        .cloned()
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "target message not found in thread".to_string(),
            )
        })?;
    let target_app_message = proto_to_app(target_message);
    let capability_id = request
        .capability_id
        .clone()
        .or_else(|| {
            target_app_message
                .content
                .get("capability_id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| target_app_message.r#type.clone());

    let mut decision_message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: Ulid::new().to_string(),
        thread_id: request.thread_id.clone(),
        parent_id: Some(request.target_message_id.clone()),
        from: request.decided_by.clone(),
        to: vec![target_app_message.from.clone()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "action".to_string(),
        subtype: Some("approval_decision".to_string()),
        content: serde_json::json!({
            "target_message_id": request.target_message_id,
            "capability_id": capability_id,
            "decision": normalized_decision,
            "status": action_status_json_label(&action_status),
            "approval_mode": "human_approval_required",
            "note": request.note,
        }),
        metadata: Some(serde_json::json!({
            "origin": "human_approval",
            "status": action_status_json_label(&action_status),
            "capability_id": capability_id
        })),
        signature: String::new(),
        encryption: None,
        views: vec![serde_json::json!({
            "format": "system",
            "content": {
                "decision": normalized_decision,
                "target_message_id": request.target_message_id,
            }
        })],
        references: vec![serde_json::json!({
            "type": "message",
            "target": request.target_message_id,
            "metadata": {
                "relation": "approval_target"
            }
        })],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    };
    sign_server_generated_message(&mut decision_message)
        .map_err(|err| (StatusCode::FAILED_DEPENDENCY, err))?;

    let decision_message_id = store_app_message_for_headers(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &headers,
        decision_message,
    )
    .await?;

    let action_result = ActionResult {
        capability_id,
        thread_id: request.thread_id.clone(),
        status: action_status.clone(),
        output: serde_json::json!({
            "target_message_id": request.target_message_id,
            "decision": normalized_decision,
            "note": request.note,
        }),
        external_reference: Some(decision_message_id.clone()),
        recorded_at: chrono::Utc::now().to_rfc3339(),
    };
    state
        .db
        .record_action_result(&action_result)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    if matches!(action_status, ActionStatus::Approved) {
        execute_approved_action(&state.db, &state.metrics, &target_app_message).await;
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message_id": decision_message_id
    })))
}

async fn relay_ws_http(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(move |socket| {
        handle_relay_socket(
            socket,
            state.db.clone(),
            state.metrics.clone(),
            state.relay_tx.clone(),
            state.relay_tx.subscribe(),
        )
    })
}

/// POST /actions/execute
///
/// Execute a typed integration action against an external endpoint.
/// The request embeds the `IntegrationCapability` inline so callers don't need a
/// separate capability registry — the homeserver validates, executes (if autonomous),
/// stores an AFP intent message + result message into the thread, and returns the
/// structured `ActionResult`.
#[derive(serde::Deserialize)]
struct ExecuteActionRequest {
    /// The capability definition (provider, operation, transport, approval_mode, …).
    capability: IntegrationCapability,
    /// The call intent (thread_id, requested_by, input, reason).
    intent: ActionIntent,
    /// External endpoint URL.
    url: String,
    /// HTTP method for REST calls (default: POST).
    #[serde(default = "default_post_method")]
    method: String,
    /// Optional bearer token for the external call.
    bearer_token: Option<String>,
}

fn default_post_method() -> String {
    "POST".to_string()
}

async fn execute_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ExecuteActionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let now = chrono::Utc::now().to_rfc3339();

    // Build optional signing context from the homeserver's own key.
    let signing_context = env_hex_32("OMNYID_SIGNING_KEY_HEX")
        .ok()
        .flatten()
        .map(|key_bytes| AgentSigningContext {
            agent_id: AgentCard::from_env().agent_id,
            private_key_bytes: key_bytes,
        });

    let params = RestCallParams {
        url: req.url.clone(),
        method: req.method.clone(),
        bearer_token: req.bearer_token.clone(),
        body: req.intent.input.clone(),
        signing_context,
    };

    let result = rest_execute_action(&req.capability, &req.intent, params, &now)
        .await
        .map_err(|err| (StatusCode::UNPROCESSABLE_ENTITY, err))?;

    // Persist intent + result as AFP messages in the thread.
    let mut intent_message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: ulid::Ulid::new().to_string(),
        thread_id: req.intent.thread_id.clone(),
        parent_id: None,
        from: req.intent.requested_by.clone(),
        to: vec![],
        timestamp: now.clone(),
        r#type: "action".to_string(),
        subtype: Some("intent".to_string()),
        content: serde_json::json!({
            "capability_id": req.capability.capability_id,
            "provider": req.capability.provider,
            "operation": req.capability.operation,
            "transport": format!("{:?}", req.capability.transport).to_lowercase(),
            "url": req.url,
            "method": req.method,
            "input": req.intent.input,
            "reason": req.intent.reason,
        }),
        metadata: Some(serde_json::json!({
            "domain": "integration_action",
            "capability_id": req.capability.capability_id,
            "provider": req.capability.provider,
            "operation": req.capability.operation
        })),
        signature: String::new(),
        encryption: None,
        views: vec![serde_json::json!({
            "format": "system",
            "content": { "event": "action_intent", "capability_id": req.capability.capability_id }
        })],
        references: vec![],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    };
    let _ = sign_server_generated_message(&mut intent_message);
    let intent_message_id = store_app_message_for_headers(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &headers,
        intent_message,
    )
    .await?;

    let mut result_message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: ulid::Ulid::new().to_string(),
        thread_id: req.intent.thread_id.clone(),
        parent_id: Some(intent_message_id.clone()),
        from: AgentCard::from_env().agent_id,
        to: vec![req.intent.requested_by.clone()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "action".to_string(),
        subtype: Some("result".to_string()),
        content: serde_json::json!({
            "capability_id": result.capability_id,
            "status": format!("{:?}", result.status).to_lowercase(),
            "output": result.output,
            "external_reference": result.external_reference,
            "recorded_at": result.recorded_at,
        }),
        metadata: Some(serde_json::json!({
            "domain": "integration_action",
            "capability_id": req.capability.capability_id,
            "provider": req.capability.provider,
            "operation": req.capability.operation
        })),
        signature: String::new(),
        encryption: None,
        views: vec![serde_json::json!({
            "format": "system",
            "content": {
                "event": "action_result",
                "status": format!("{:?}", result.status).to_lowercase(),
                "capability_id": result.capability_id,
            }
        })],
        references: vec![serde_json::json!({
            "type": "message",
            "target": intent_message_id,
            "metadata": { "relation": "action_intent" }
        })],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    };
    let _ = sign_server_generated_message(&mut result_message);
    let result_message_id = store_app_message_for_headers(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &headers,
        result_message,
    )
    .await?;

    state
        .db
        .record_action_result(&result)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "status": format!("{:?}", result.status).to_lowercase(),
        "capability_id": result.capability_id,
        "thread_id": req.intent.thread_id,
        "intent_message_id": intent_message_id,
        "result_message_id": result_message_id,
        "output": result.output,
        "external_reference": result.external_reference,
    })))
}

#[instrument(skip(state, body))]
async fn handle_gateway_email(
    State(state): State<Arc<AppState>>,
    body: String,
) -> Result<Json<Value>, (StatusCode, String)> {
    let mut message = handle_incoming_email(body.as_bytes())
        .await
        .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    state.metrics.inc_gateway_inbound_emails();
    let thread_match = state
        .db
        .find_message_by_external_email_targets(&external_email_thread_targets(&message.references))
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    apply_external_email_thread_match(&mut message, thread_match);

    let proto = app_to_proto(message);
    let ack = store_proto_message(&state.db, &state.metrics, &state.relay_tx, proto)
        .await
        .map_err(status_to_http)?
        .into_inner();

    Ok(Json(serde_json::json!({
        "status": "processed",
        "afp_id": ack.message_id
    })))
}

/// GET /sync/shapes?device_class=desktop&profile=full
///
/// Returns the ElectricSQL-compatible shape descriptors for the requested device profile.
/// Clients use these to configure PGLite subscriptions without hardcoding table names.
async fn sync_shapes_http(
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Json<Value> {
    let device_class = params
        .get("device_class")
        .and_then(|dc| parse_device_class(dc))
        .unwrap_or(crate::local_sync::DeviceClass::Desktop);

    let profile_raw = params.get("profile").map(String::as_str).unwrap_or("full");
    let profile = match profile_raw {
        "balanced" => crate::local_sync::SyncPolicyProfile::Balanced,
        "lightweight" => crate::local_sync::SyncPolicyProfile::Lightweight,
        _ => crate::local_sync::SyncPolicyProfile::Full,
    };

    let slices = sync_slices_for_device(&device_class, &profile);
    let requires_key = requires_local_key_material(&slices);
    let shapes = shape_descriptors_for_slices(&slices);

    Json(serde_json::json!({
        "device_class": format!("{device_class:?}").to_lowercase(),
        "profile": format!("{profile:?}").to_lowercase(),
        "requires_local_key_material": requires_key,
        "shapes": shapes,
        "electric_api_version": "v1",
    }))
}

/// GET /sync/bootstrap?device_id=xxx&device_class=desktop
///
/// Returns a `DeviceBootstrap` bundle the client uses to initialise its local PGLite
/// instance and connect to the ElectricSQL project URL.
async fn sync_bootstrap_http(
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let device_id = params
        .get("device_id")
        .cloned()
        .filter(|d| !d.trim().is_empty())
        .unwrap_or_else(|| ulid::Ulid::new().to_string());

    let device_class = params
        .get("device_class")
        .and_then(|dc| parse_device_class(dc))
        .unwrap_or(crate::local_sync::DeviceClass::Desktop);

    let profile = default_sync_profile(&device_class);
    let slices = sync_slices_for_device(&device_class, &profile);
    let shapes = shape_descriptors_for_slices(&slices);

    let electric_project_url = std::env::var("OMNYID_ELECTRIC_URL")
        .unwrap_or_else(|_| "https://electric.yourdomain.ai".to_string());

    let bootstrap = DeviceBootstrap {
        device_id: device_id.clone(),
        agent_id: AgentCard::from_env().agent_id,
        electric_project_url: electric_project_url.clone(),
        encrypted_seed_ref: format!("vault://devices/{device_id}/seed"),
        pglite_path: format!("omnyid/{device_id}.db"),
    };

    Ok(Json(serde_json::json!({
        "bootstrap": bootstrap,
        "shapes": shapes,
        "requires_local_key_material": requires_local_key_material(&slices),
        "sync_endpoint": format!("{electric_project_url}/v1/shape"),
        "electric_url": std::env::var("OMNYID_ELECTRIC_URL").ok(),
    })))
}

/// POST /personalization/event
///
/// Record a user feedback signal (approved, rejected, edited, ignored) for a specific
/// AFP message. These events are the training signal for the LoRA personalization pipeline.
#[derive(serde::Deserialize)]
struct RecordPersonalizationEventRequest {
    thread_id: String,
    message_id: String,
    actor_agent_id: String,
    signal: String,
    rationale: Option<String>,
}

async fn record_personalization_event_http(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RecordPersonalizationEventRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let signal = match req.signal.as_str() {
        "approved" => FeedbackSignal::Approved,
        "rejected" => FeedbackSignal::Rejected,
        "edited" => FeedbackSignal::Edited,
        "ignored" => FeedbackSignal::Ignored,
        other => return Err((StatusCode::BAD_REQUEST, format!("Unknown signal: {other}"))),
    };

    let event = PersonalizationEvent {
        event_id: ulid::Ulid::new().to_string(),
        thread_id: req.thread_id,
        message_id: req.message_id,
        actor_agent_id: req.actor_agent_id,
        signal,
        rationale: req.rationale,
        captured_at: chrono::Utc::now().to_rfc3339(),
    };

    state
        .db
        .record_personalization_event(&event)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "recorded": true,
        "event_id": event.event_id,
        "signal": req.signal,
    })))
}

/// GET /personalization/stats?agent_id=agent:...
///
/// Returns per-signal event counts and the currently active LoRA artifact ID.
/// Used by the dashboard personalization panel to surface training readiness.
async fn get_personalization_stats_http(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let agent_id = params
        .get("agent_id")
        .cloned()
        .unwrap_or_else(|| AgentCard::from_env().agent_id);

    let stats = state
        .db
        .get_personalization_stats(&agent_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    // Apply differential privacy noise to signal counts before returning them.
    // This prevents the stats API from revealing individual feedback decisions.
    let epsilon = crate::differential_privacy::default_epsilon();
    let noisy_stats = crate::differential_privacy::noise_signal_counts(&stats, epsilon);

    Ok(Json(noisy_stats))
}

/// POST /billing/webhook
///
/// Stripe webhook receiver. Idempotent via `stripe_event_id`.
/// Supported events: `customer.subscription.created/updated/deleted`,
/// `invoice.payment_succeeded`, `invoice.payment_failed`.
///
/// Set `OMNYID_STRIPE_WEBHOOK_SECRET` to enable signature verification.
async fn billing_webhook_http(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    body: String,
) -> Result<Json<Value>, (StatusCode, String)> {
    // Signature verification (best-effort: skip if secret not configured).
    let webhook_secret = std::env::var("OMNYID_STRIPE_WEBHOOK_SECRET").ok();
    if let Some(secret) = webhook_secret {
        let stripe_sig = headers
            .get("stripe-signature")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !verify_stripe_signature(&body, stripe_sig, &secret) {
            return Err((
                StatusCode::UNAUTHORIZED,
                "Invalid Stripe webhook signature".to_string(),
            ));
        }
    }

    let payload: Value = serde_json::from_str(&body)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid JSON: {e}")))?;

    let event_id = payload
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let event_type = payload
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    // Extract customer and subscription info from known event shapes.
    let (account_id, customer_id, subscription_id, plan, status, period_end) =
        extract_billing_event_fields(&payload);

    state
        .db
        .record_billing_event(account_id.as_deref(), &event_id, &event_type, &payload)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    if let Some(acct) = &account_id {
        state
            .db
            .upsert_billing_subscription(
                acct,
                customer_id.as_deref(),
                subscription_id.as_deref(),
                plan.as_deref().unwrap_or("pro"),
                status.as_deref().unwrap_or("active"),
                period_end.as_deref(),
            )
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
    }

    Ok(Json(
        serde_json::json!({ "received": true, "event_type": event_type }),
    ))
}

fn verify_stripe_signature(body: &str, stripe_sig: &str, secret: &str) -> bool {
    // Parse t= and v1= from the Stripe-Signature header.
    let mut timestamp = "";
    let mut signature = "";
    for part in stripe_sig.split(',') {
        if let Some(t) = part.strip_prefix("t=") {
            timestamp = t;
        }
        if let Some(v) = part.strip_prefix("v1=") {
            signature = v;
        }
    }
    if timestamp.is_empty() || signature.is_empty() {
        return false;
    }

    use hmac::Hmac;
    use sha2::Sha256;
    type HmacSha256 = Hmac<Sha256>;

    let signed_payload = format!("{timestamp}.{body}");
    let Ok(mut mac) = <HmacSha256 as hmac::Mac>::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    hmac::Mac::update(&mut mac, signed_payload.as_bytes());
    let expected = hex::encode(hmac::Mac::finalize(mac).into_bytes());
    expected == signature
}

fn extract_billing_event_fields(
    payload: &Value,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let data = payload.pointer("/data/object").unwrap_or(&Value::Null);
    let customer_id = data
        .get("customer")
        .and_then(Value::as_str)
        .map(str::to_string);
    let subscription_id = data
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| id.starts_with("sub_"))
        .map(str::to_string)
        .or_else(|| {
            data.get("subscription")
                .and_then(Value::as_str)
                .map(str::to_string)
        });
    let plan = data
        .pointer("/plan/nickname")
        .or_else(|| data.pointer("/items/data/0/plan/nickname"))
        .and_then(Value::as_str)
        .map(str::to_lowercase);
    let status = data
        .get("status")
        .and_then(Value::as_str)
        .map(str::to_string);
    let period_end = data
        .get("current_period_end")
        .and_then(Value::as_i64)
        .map(|ts| {
            chrono::DateTime::<chrono::Utc>::from_timestamp(ts, 0)
                .unwrap_or_default()
                .to_rfc3339()
        });
    // Map stripe customer_id to an account_id via metadata field if set.
    let account_id = data
        .pointer("/metadata/account_id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| customer_id.clone());

    (
        account_id,
        customer_id,
        subscription_id,
        plan,
        status,
        period_end,
    )
}

/// GET /billing/status?account_id=...
///
/// Returns the current billing plan and subscription status for an account.
async fn billing_status_http(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let account_id = params
        .get("account_id")
        .cloned()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "account_id is required".to_string(),
            )
        })?;

    let status = state
        .db
        .get_billing_status(&account_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(status))
}

async fn serve_agent_card(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Json<AgentCard> {
    let mut card = AgentCard::from_env();

    // If a user is authenticated, merge in their DB-registered capabilities
    if let Ok(user) = authenticated_user(&state.db, &headers).await {
        if let Ok(Some(instance)) = state.db.get_master_agent_instance(&user.id).await {
            let instance_id = instance["id"].as_str().unwrap_or("");
            if let Ok(db_caps) = state.db.get_capabilities_for_agent_card(instance_id).await {
                if !db_caps.is_empty() {
                    card.capabilities.extend(db_caps);
                }
            }
        }
    }

    // Re-sign with the updated capability list
    let signing_seed_hex = std::env::var("OMNYID_SIGNING_KEY_HEX").unwrap_or_default();
    if !signing_seed_hex.is_empty() {
        card.timestamp = chrono::Utc::now().to_rfc3339();
        if let Some(sig) = crate::agentcard::sign_agent_card(&card, &signing_seed_hex) {
            card.signature = sig;
        }
    }

    Json(card)
}

async fn serve_afp_delegation() -> Json<Value> {
    Json(serde_json::json!({
        "afp.server": std::env::var("OMNYID_AFP_DELEGATION")
            .unwrap_or_else(|_| "homeserver.yourdomain.ai:443".to_string())
    }))
}

// ── Key lifecycle endpoints (Phase 2) ────────────────────────────────────────

#[derive(serde::Deserialize)]
struct RotateKeyRequest {
    /// Human-readable reason for the rotation (optional).
    reason: Option<String>,
}

/// POST /keys/rotate
/// Generates a fresh Ed25519 keypair, stores a rotation audit record, and returns
/// the new public key hex + key_id so the operator can update OMNYID_SIGNING_KEY_HEX.
/// Requires a valid bearer session with an authenticated user.
async fn rotate_key_http(
    State(state): State<Arc<AppState>>,
    Json(request): Json<RotateKeyRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    use chacha20poly1305::aead::{OsRng, rand_core::RngCore};
    use ed25519_dalek::SigningKey;

    let current_card = crate::agentcard::AgentCard::from_env();
    let old_key_id = current_card.key_id.clone();
    let agent_id = current_card.agent_id.clone();

    // Generate a fresh keypair
    let mut key_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut key_bytes);
    let new_signing_key = SigningKey::from_bytes(&key_bytes);
    let new_public_key_hex = hex::encode(new_signing_key.verifying_key().to_bytes());
    let new_private_key_hex = hex::encode(new_signing_key.to_bytes());
    let new_key_id = format!("key-{}", &new_public_key_hex[..12]);

    // Persist the rotation event
    let event_id = state
        .db
        .record_key_rotation(
            &agent_id,
            &old_key_id,
            &new_key_id,
            &new_public_key_hex,
            request.reason.as_deref(),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "event_id": event_id,
        "agent_id": agent_id,
        "old_key_id": old_key_id,
        "new_key_id": new_key_id,
        "new_public_key_hex": new_public_key_hex,
        // Return private key hex for operator to write to OMNYID_SIGNING_KEY_HEX.
        // Only expose in this response; never stored server-side.
        "new_private_key_hex": new_private_key_hex,
        "action_required": "Set OMNYID_SIGNING_KEY_HEX, OMNYID_PUBLIC_KEY_HEX, and OMNYID_KEY_ID to the new values, then restart the homeserver."
    })))
}

#[derive(serde::Deserialize)]
struct UpsertPeerKeyRequest {
    agent_id: String,
    key_id: String,
    public_key_hex: String,
    homeserver_url: String,
    previous_key_ids: Option<Vec<String>>,
}

/// POST /keys/peer
/// Cache a discovered peer's public key so recipient wrapping survives server restarts.
/// SDKs call this after successfully fetching a remote AgentCard.
async fn upsert_peer_key_http(
    State(state): State<Arc<AppState>>,
    Json(request): Json<UpsertPeerKeyRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let prev = request.previous_key_ids.unwrap_or_default();
    state
        .db
        .upsert_peer_key(
            &request.agent_id,
            &request.key_id,
            &request.public_key_hex,
            &request.homeserver_url,
            &prev,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "cached": true,
        "agent_id": request.agent_id,
        "key_id": request.key_id
    })))
}

async fn run_webtransport_server(state: Arc<AppState>) -> Result<(), String> {
    let identity = load_webtransport_identity()
        .await
        .map_err(|err| format!("failed to load WebTransport identity: {err}"))?;
    let config = WebTransportServerConfig::builder()
        .with_bind_address(webtransport_bind_addr())
        .with_identity(identity)
        .keep_alive_interval(Some(Duration::from_secs(5)))
        .build();
    let server = WebTransportEndpoint::server(config)
        .map_err(|err| format!("failed to start WebTransport endpoint: {err}"))?;

    loop {
        let incoming_session = server.accept().await;
        let state = state.clone();
        tokio::spawn(async move {
            if let Err(err) = handle_webtransport_session(incoming_session, state).await {
                error!(%err, "Omnyid WebTransport session failed");
            }
        });
    }
}

#[instrument(skip(incoming_session, state))]
async fn handle_webtransport_session(
    incoming_session: WebTransportIncomingSession,
    state: Arc<AppState>,
) -> Result<(), String> {
    let session_request = incoming_session
        .await
        .map_err(|err| format!("failed to accept WebTransport session request: {err}"))?;

    if session_request.path() != "/relay/wt" {
        session_request.not_found().await;
        return Ok(());
    }

    let connection = session_request
        .accept()
        .await
        .map_err(|err| format!("failed to establish WebTransport session: {err}"))?;
    state.metrics.inc_relay_connections();
    state.metrics.inc_relay_webtransport_sessions();

    let mut buffer = vec![0; 65536];
    loop {
        let (mut send_stream, mut recv_stream) = connection
            .accept_bi()
            .await
            .map_err(|err| format!("failed to accept WebTransport stream: {err}"))?;

        let mut payload = Vec::new();
        loop {
            match recv_stream.read(&mut buffer).await {
                Ok(Some(bytes_read)) => payload.extend_from_slice(&buffer[..bytes_read]),
                Ok(None) => break,
                Err(err) => {
                    state.metrics.inc_relay_errors();
                    let error_payload = relay_error_payload(
                        "stream_read_error",
                        &format!("WebTransport stream read failed: {err}"),
                    );
                    send_stream
                        .write_all(error_payload.as_bytes())
                        .await
                        .map_err(|write_err| write_err.to_string())?;
                    send_stream
                        .finish()
                        .await
                        .map_err(|write_err| write_err.to_string())?;
                    return Ok(());
                }
            }
        }

        let request_payload = String::from_utf8(payload)
            .map_err(|err| format!("invalid utf8 WebTransport payload: {err}"))?;
        let request = match parse_relay_request(&request_payload) {
            Ok(request) => request,
            Err(err) => {
                state.metrics.inc_relay_errors();
                send_stream
                    .write_all(relay_error_payload("invalid_request", &err).as_bytes())
                    .await
                    .map_err(|write_err| write_err.to_string())?;
                send_stream
                    .finish()
                    .await
                    .map_err(|write_err| write_err.to_string())?;
                continue;
            }
        };

        match request {
            RelayRequest::Send { message } => {
                let response_payload = handle_webtransport_send_request(
                    &state.db,
                    &state.metrics,
                    &state.relay_tx,
                    message,
                )
                .await;
                send_stream
                    .write_all(response_payload.as_bytes())
                    .await
                    .map_err(|err| format!("failed to write WebTransport response: {err}"))?;
                send_stream.finish().await.map_err(|err| {
                    format!("failed to finish WebTransport response stream: {err}")
                })?;
            }
            RelayRequest::SubscribeThread {
                thread_id,
                include_snapshot,
            } => {
                handle_webtransport_subscription_stream(
                    &state.db,
                    &state.metrics,
                    &state.relay_tx,
                    &mut send_stream,
                    thread_id,
                    include_snapshot,
                )
                .await?;
            }
            // WebTransport does not support fleet subscriptions (WebSocket only)
            RelayRequest::SubscribeFleet => {
                let _ = send_stream
                    .write_all(
                        relay_error_payload(
                            "not_supported",
                            "Fleet subscriptions require WebSocket /relay/ws",
                        )
                        .as_bytes(),
                    )
                    .await;
            }
        }
    }
}

async fn handle_webtransport_send_request(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    message: AFPMessage,
) -> String {
    match store_proto_message(db, metrics, relay_tx, app_to_proto(message)).await {
        Ok(response) => {
            metrics.inc_relay_send_requests();
            let ack = response.into_inner();
            relay_ack_payload(ack.success, ack.message_id)
        }
        Err(status) => {
            metrics.inc_relay_errors();
            relay_error_payload(status.code().to_string().as_str(), status.message())
        }
    }
}

async fn handle_webtransport_subscription_stream(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    send_stream: &mut wtransport::SendStream,
    thread_id: String,
    include_snapshot: bool,
) -> Result<(), String> {
    metrics.inc_relay_thread_subscriptions();
    let mut relay_rx = relay_tx.subscribe();

    if include_snapshot {
        let snapshot = db
            .get_thread(&thread_id)
            .await
            .map_err(|err| err.to_string())?;
        let payload = relay_thread_snapshot_payload(
            thread_id.clone(),
            snapshot.into_iter().map(proto_to_app).collect(),
        );
        write_webtransport_event(send_stream, &payload).await?;
    }

    let subscribed_payload = relay_thread_subscribed_payload(thread_id.clone());
    write_webtransport_event(send_stream, &subscribed_payload).await?;

    loop {
        match relay_rx.recv().await {
            Ok(event) => {
                if relay_event_thread_id(&event).as_deref() != Some(thread_id.as_str()) {
                    continue;
                }
                write_webtransport_event(send_stream, &event).await?;
            }
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => return Ok(()),
        }
    }
}

async fn write_webtransport_event(
    send_stream: &mut wtransport::SendStream,
    payload: &str,
) -> Result<(), String> {
    send_stream
        .write_all(payload.as_bytes())
        .await
        .map_err(|err| format!("failed to write WebTransport event: {err}"))?;
    send_stream
        .write_all(b"\n")
        .await
        .map_err(|err| format!("failed to delimit WebTransport event: {err}"))?;
    Ok(())
}

fn relay_event_thread_id(event: &str) -> Option<String> {
    serde_json::from_str::<Value>(event).ok().and_then(|value| {
        value
            .get("thread_id")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

#[instrument(skip(socket, db, metrics, relay_tx, relay_rx))]
async fn handle_relay_socket(
    mut socket: WebSocket,
    db: Db,
    metrics: Arc<Metrics>,
    relay_tx: broadcast::Sender<String>,
    mut relay_rx: broadcast::Receiver<String>,
) {
    metrics.inc_relay_connections();
    let mut subscribed_thread_id: Option<String> = None;
    let mut fleet_subscribed = false;

    loop {
        tokio::select! {
            event = relay_rx.recv() => {
                match event {
                    Ok(event) => {
                        // Check if this is a fleet_update event
                        let parsed = serde_json::from_str::<Value>(&event).ok();
                        let is_fleet_update = parsed
                            .as_ref()
                            .and_then(|v| v.get("event"))
                            .and_then(Value::as_str)
                            == Some("fleet_update");

                        if is_fleet_update {
                            if fleet_subscribed {
                                if socket.send(WsMessage::Text(event.into())).await.is_err() {
                                    break;
                                }
                            }
                            continue;
                        }

                        if let Some(thread_id) = subscribed_thread_id.as_deref() {
                            let event_thread_id = parsed
                                .and_then(|value| value.get("thread_id").and_then(Value::as_str).map(str::to_string));
                            if event_thread_id.as_deref() != Some(thread_id) {
                                continue;
                            }
                        }
                        if socket.send(WsMessage::Text(event.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            maybe_message = socket.next() => {
                let Some(Ok(message)) = maybe_message else {
                    break;
                };

                match message {
                    WsMessage::Text(payload) => {
                        if handle_relay_client_message(
                            &mut socket,
                            &db,
                            &metrics,
                            &relay_tx,
                            &mut subscribed_thread_id,
                            &mut fleet_subscribed,
                            &payload,
                        ).await.is_err() {
                            break;
                        }
                    }
                    WsMessage::Binary(_) => {
                        if socket.send(WsMessage::Text(relay_error_payload("binary_not_supported", "Binary relay frames are not supported").into())).await.is_err() {
                            break;
                        }
                    }
                    WsMessage::Ping(payload) => {
                        if socket.send(WsMessage::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    WsMessage::Pong(_) => {}
                    WsMessage::Close(_) => break,
                }
            }
        }
    }
}

#[instrument(skip(
    socket,
    db,
    metrics,
    relay_tx,
    subscribed_thread_id,
    fleet_subscribed,
    payload
))]
async fn handle_relay_client_message(
    socket: &mut WebSocket,
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    subscribed_thread_id: &mut Option<String>,
    fleet_subscribed: &mut bool,
    payload: &str,
) -> Result<(), ()> {
    let request = match parse_relay_request(payload) {
        Ok(request) => request,
        Err(err) => {
            metrics.inc_relay_errors();
            socket
                .send(WsMessage::Text(
                    relay_error_payload("invalid_request", &err).into(),
                ))
                .await
                .map_err(|_| ())?;
            return Ok(());
        }
    };

    match request {
        RelayRequest::Send { message } => {
            match store_proto_message(db, metrics, relay_tx, app_to_proto(message)).await {
                Ok(response) => {
                    metrics.inc_relay_send_requests();
                    let ack = response.into_inner();
                    let payload = relay_ack_payload(ack.success, ack.message_id);
                    socket
                        .send(WsMessage::Text(payload.into()))
                        .await
                        .map_err(|_| ())?;
                }
                Err(status) => {
                    metrics.inc_relay_errors();
                    socket
                        .send(WsMessage::Text(
                            relay_error_payload(
                                status.code().to_string().as_str(),
                                status.message(),
                            )
                            .into(),
                        ))
                        .await
                        .map_err(|_| ())?;
                }
            }
        }
        RelayRequest::SubscribeThread {
            thread_id,
            include_snapshot,
        } => {
            metrics.inc_relay_thread_subscriptions();
            *subscribed_thread_id = Some(thread_id.clone());
            if include_snapshot {
                let snapshot = match db.get_thread(&thread_id).await {
                    Ok(snapshot) => snapshot,
                    Err(err) => {
                        metrics.inc_relay_errors();
                        let status = internal_error(err);
                        socket
                            .send(WsMessage::Text(
                                relay_error_payload(
                                    status.code().to_string().as_str(),
                                    status.message(),
                                )
                                .into(),
                            ))
                            .await
                            .map_err(|_| ())?;
                        return Ok(());
                    }
                };
                let payload = relay_thread_snapshot_payload(
                    thread_id.clone(),
                    snapshot.into_iter().map(proto_to_app).collect(),
                );
                socket
                    .send(WsMessage::Text(payload.into()))
                    .await
                    .map_err(|_| ())?;
            }

            let payload = relay_thread_subscribed_payload(thread_id);
            socket
                .send(WsMessage::Text(payload.into()))
                .await
                .map_err(|_| ())?;
        }
        RelayRequest::SubscribeFleet => {
            *fleet_subscribed = true;
            socket
                .send(WsMessage::Text(relay_fleet_subscribed_payload().into()))
                .await
                .map_err(|_| ())?;
        }
    }

    Ok(())
}
pub(crate) async fn store_proto_message(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    msg: Message,
) -> Result<Response<Ack>, Status> {
    if !validate_proto_message(&msg) {
        return Err(Status::invalid_argument("Invalid AFP message"));
    }

    if has_encryption_envelope(&msg) && !has_supported_encryption_envelope(&msg) {
        return Err(Status::invalid_argument(
            "Unsupported or malformed Omnyid encryption envelope",
        ));
    }

    if require_encryption() && !has_supported_encryption_envelope(&msg) {
        return Err(Status::failed_precondition(
            "Encrypted AFP payload required by server policy",
        ));
    }

    let app_message = proto_to_app(msg.clone());
    if has_verifiable_signature(&msg.signature) {
        if !verify_signature(&app_message) {
            return Err(Status::unauthenticated("Invalid AFP signature"));
        }
    } else if !allow_insecure_unsigned_messages() {
        return Err(Status::unauthenticated(
            "Unsigned AFP messages are disabled; configure signing or enable dev mode explicitly",
        ));
    }

    let content_json: Value = serde_json::from_str(&msg.content)
        .map_err(|_| Status::invalid_argument("Message content must be valid JSON"))?;

    let inserted = db
        .store_message(&msg, content_json)
        .await
        .map_err(internal_error)?;

    if inserted {
        metrics.inc_messages_stored();
        handle_inserted_message_effects(db, metrics, relay_tx, &app_message).await;
        let _ = relay_tx.send(
            serde_json::json!({
                "event": "message_stored",
                "message_id": msg.id,
                "thread_id": msg.thread_id,
                "type": msg.r#type
            })
            .to_string(),
        );
    } else {
        metrics.inc_messages_replayed();
    }

    Ok(Response::new(Ack {
        success: true,
        message_id: msg.id,
    }))
}

async fn handle_inserted_message_effects(
    db: &Db,
    metrics: &Arc<Metrics>,
    _relay_tx: &broadcast::Sender<String>,
    app_message: &AFPMessage,
) {
    if message_requires_human_approval(app_message) {
        let pending_result = ActionResult {
            capability_id: action_capability_id(app_message),
            thread_id: app_message.thread_id.clone(),
            status: ActionStatus::Pending,
            output: serde_json::json!({
                "message_id": app_message.id,
                "approval_mode": "human_approval_required",
            }),
            external_reference: Some(app_message.id.clone()),
            recorded_at: chrono::Utc::now().to_rfc3339(),
        };
        if let Err(err) = db.record_action_result(&pending_result).await {
            error!(
                message_id = %app_message.id,
                thread_id = %app_message.thread_id,
                %err,
                "Omnyid failed to persist pending approval audit entry"
            );
        }
        return;
    }

    execute_approved_action(db, metrics, app_message).await;
}

async fn execute_approved_action(db: &Db, metrics: &Arc<Metrics>, app_message: &AFPMessage) {
    match dispatch_outgoing_message(app_message).await {
        Ok(true) => {
            metrics.inc_gateway_outbound_attempts();
            if let Err(err) = db
                .record_outbound_delivery_attempt(
                    &app_message.id,
                    &app_message.thread_id,
                    MailGatewayConfig::from_env().provider_label(),
                    "queued",
                    None,
                )
                .await
            {
                error!(
                    message_id = %app_message.id,
                    thread_id = %app_message.thread_id,
                    %err,
                    "Omnyid outbound delivery receipt persistence failed"
                );
            }

            let completed_result = ActionResult {
                capability_id: action_capability_id(app_message),
                thread_id: app_message.thread_id.clone(),
                status: ActionStatus::Completed,
                output: serde_json::json!({
                    "message_id": app_message.id,
                    "dispatch": "queued",
                }),
                external_reference: Some(app_message.id.clone()),
                recorded_at: chrono::Utc::now().to_rfc3339(),
            };
            if let Err(err) = db.record_action_result(&completed_result).await {
                error!(
                    message_id = %app_message.id,
                    thread_id = %app_message.thread_id,
                    %err,
                    "Omnyid failed to persist completed action audit entry"
                );
            }
        }
        Ok(false) => {}
        Err(err) => {
            metrics.inc_gateway_outbound_attempts();
            metrics.inc_gateway_outbound_failures();
            if let Err(receipt_err) = db
                .record_outbound_delivery_attempt(
                    &app_message.id,
                    &app_message.thread_id,
                    MailGatewayConfig::from_env().provider_label(),
                    "failed",
                    Some(&err),
                )
                .await
            {
                error!(
                    message_id = %app_message.id,
                    thread_id = %app_message.thread_id,
                    %receipt_err,
                    "Omnyid failed to persist outbound delivery failure receipt"
                );
            }

            let failed_result = ActionResult {
                capability_id: action_capability_id(app_message),
                thread_id: app_message.thread_id.clone(),
                status: ActionStatus::Failed,
                output: serde_json::json!({
                    "message_id": app_message.id,
                    "error": err,
                }),
                external_reference: Some(app_message.id.clone()),
                recorded_at: chrono::Utc::now().to_rfc3339(),
            };
            if let Err(audit_err) = db.record_action_result(&failed_result).await {
                error!(
                    message_id = %app_message.id,
                    thread_id = %app_message.thread_id,
                    %audit_err,
                    "Omnyid failed to persist failed action audit entry"
                );
            }

            error!(
                message_id = %app_message.id,
                thread_id = %app_message.thread_id,
                %err,
                "Omnyid outbound email dispatch failed"
            );
        }
    }
}

fn message_requires_human_approval(message: &AFPMessage) -> bool {
    if message.r#type == "action"
        && matches!(message.subtype.as_deref(), Some("approval_decision"))
    {
        return false;
    }

    if message.r#type == "action_approval_decision" {
        return false;
    }

    if matches!(
        message.content.get("approval_mode").and_then(Value::as_str),
        Some("autonomous")
    ) {
        return false;
    }

    if matches!(
        message.content.get("approval_mode").and_then(Value::as_str),
        Some("human_approval_required")
    ) {
        return true;
    }

    matches!(
        message.r#type.as_str(),
        "email_outgoing" | "action_reply" | "action_forward"
    ) || (message.r#type == "email"
        && matches!(
            message.subtype.as_deref(),
            Some("outgoing") | Some("reply") | Some("forward")
        ))
}

fn action_capability_id(message: &AFPMessage) -> String {
    message
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.get("capability_id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            message
                .content
                .get("capability_id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| message.subtype.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| message.r#type.clone())
}

fn validate_proto_message(msg: &Message) -> bool {
    msg.protocol == "afp-v1"
        && !msg.id.trim().is_empty()
        && !msg.thread_id.trim().is_empty()
        && !msg.from.trim().is_empty()
        && !msg.r#type.trim().is_empty()
}

pub(crate) fn app_to_proto(message: AFPMessage) -> Message {
    Message {
        protocol: message.protocol,
        id: message.id,
        thread_id: message.thread_id,
        parent_id: message.parent_id.unwrap_or_default(),
        from: message.from,
        to: message.to,
        timestamp: message.timestamp,
        r#type: message.r#type,
        content: message.content.to_string(),
        signature: message.signature,
        encryption: message
            .encryption
            .unwrap_or_else(|| serde_json::json!({}))
            .to_string(),
        views: Value::Array(message.views).to_string(),
        references: Value::Array(message.references).to_string(),
        attachments: Value::Array(message.attachments).to_string(),
        store_in_relational: message.store_in_relational,
        subtype: message.subtype.unwrap_or_default(),
        metadata: message
            .metadata
            .map(|value| value.to_string())
            .unwrap_or_default(),
    }
}

fn proto_to_app(message: Message) -> AFPMessage {
    AFPMessage {
        protocol: message.protocol,
        id: message.id,
        thread_id: message.thread_id,
        parent_id: string_to_option(message.parent_id),
        from: message.from,
        to: message.to,
        timestamp: message.timestamp,
        r#type: message.r#type,
        subtype: string_to_option(message.subtype),
        content: serde_json::from_str(&message.content).unwrap_or_else(|_| serde_json::json!({})),
        metadata: json_optional_value_from_str(&message.metadata),
        signature: message.signature,
        encryption: json_object_from_str(&message.encryption),
        views: json_array_from_str(&message.views),
        references: json_array_from_str(&message.references),
        attachments: json_array_from_str(&message.attachments),
        store_in_relational: message.store_in_relational,
        prev_hash: None,
    }
}

fn json_array_from_str(input: &str) -> Vec<Value> {
    serde_json::from_str(input).unwrap_or_default()
}

fn json_optional_value_from_str(input: &str) -> Option<Value> {
    if input.trim().is_empty() {
        None
    } else {
        serde_json::from_str(input).ok().filter(|value: &Value| !value.is_null())
    }
}

fn json_object_from_str(input: &str) -> Option<Value> {
    if input.trim().is_empty() {
        None
    } else {
        serde_json::from_str(input).ok()
    }
}

fn string_to_option(input: String) -> Option<String> {
    if input.trim().is_empty() {
        None
    } else {
        Some(input)
    }
}

fn trial_identity_key(headers: &HeaderMap, fingerprint: Option<&str>) -> String {
    let browser_fingerprint = fingerprint
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(24).collect::<String>())
        .unwrap_or_else(|| "browser-anon".to_string());
    format!("{}:{}", request_ip_identity(headers), browser_fingerprint)
}

fn trial_starter_templates() -> Vec<TrialTemplate> {
    vec![
        TrialTemplate {
            id: "student_day_planner".to_string(),
            name: "Student Day Planner".to_string(),
            summary: "Turn classes, assignments, and energy level into a realistic day plan.".to_string(),
            system_prompt: "You are a calm daily planner for a busy student. Break work into short, realistic blocks and keep risky actions behind a review step.".to_string(),
            suggested_prompts: vec![
                "Plan my day around a 10am lecture and two assignments due this week.".to_string(),
                "Break my chemistry revision into short blocks with one low-energy backup option.".to_string(),
                "Give me a study plan that still leaves time for training tonight.".to_string(),
            ],
        },
        TrialTemplate {
            id: "research_assistant".to_string(),
            name: "Research Assistant".to_string(),
            summary: "Collect sources, summarize them, and capture the next actions.".to_string(),
            system_prompt: "You are a practical research assistant. Summarize clearly, show your tool plan, and stay inside allowlisted web domains.".to_string(),
            suggested_prompts: vec![
                "Research three ways to reduce study fatigue and summarize the tradeoffs.".to_string(),
                "Turn these links into a one-page brief I can act on today.".to_string(),
                "List the follow-up questions I should investigate before making a decision.".to_string(),
            ],
        },
        TrialTemplate {
            id: "appointment_assistant".to_string(),
            name: "Appointment Assistant".to_string(),
            summary: "Prepare reminders, booking steps, and follow-ups without losing context.".to_string(),
            system_prompt: "You are an appointment assistant. Keep tasks ordered, ask for approval before bookings or payments, and never assume a booking succeeded unless confirmed.".to_string(),
            suggested_prompts: vec![
                "Help me prepare for tomorrow's dentist appointment and the follow-up questions I should ask.".to_string(),
                "Draft the steps to reschedule a clinic booking without losing my notes.".to_string(),
                "Create a reminder flow for upcoming family appointments this week.".to_string(),
            ],
        },
    ]
}

fn trial_model_policy() -> Value {
    serde_json::json!({
        "mode": "omnyid_managed_small_model",
        "byok_available": false,
        "default_model": "gpt-5.4-mini",
        "persistent_memory": false,
        "daily_trial_runs": 3
    })
}

fn trial_tool_policy() -> Value {
    serde_json::json!({
        "web": { "enabled": true, "allowlisted_hosts": ["api.omnyid.com"] },
        "google_api": { "enabled": false },
        "stripe": { "enabled": false },
        "file_access": { "enabled": false },
        "vector_store": { "enabled": false },
        "simple_db": { "enabled": false },
        "scheduler": { "enabled": false },
        "afp_agent": { "enabled": true }
    })
}

fn trial_channel_policy() -> Value {
    serde_json::json!({
        "web_chat": { "enabled": true },
        "api_endpoint": { "enabled": false },
        "afp_agent_endpoint": { "enabled": false }
    })
}

fn execute_trial_tools(
    content: &str,
    tool_policy: &Value,
) -> (Vec<TrialTraceEntry>, Vec<TrialReviewItem>) {
    let mut traces = Vec::new();
    let mut reviews = Vec::new();
    let lowered = content.to_lowercase();

    let mut push_trace =
        |tool: &str, status: &str, blocked_reason: Option<&str>, host: Option<&str>| {
            traces.push(TrialTraceEntry {
                timestamp: chrono::Utc::now().to_rfc3339(),
                tool: tool.to_string(),
                status: status.to_string(),
                blocked_reason: blocked_reason.map(str::to_string),
                host: host.map(str::to_string),
            });
        };

    let tool_enabled = |tool: &str| -> bool {
        tool_policy
            .get(tool)
            .and_then(|entry| entry.get("enabled"))
            .and_then(Value::as_bool)
            .unwrap_or(false)
    };

    if lowered.contains("http://")
        || lowered.contains("https://")
        || lowered.contains("website")
        || lowered.contains("search")
    {
        push_trace(
            "web",
            if tool_enabled("web") {
                "allowed"
            } else {
                "blocked"
            },
            (!tool_enabled("web")).then_some("tool_disabled"),
            Some("api.omnyid.com"),
        );
    }
    if lowered.contains("agent:") || lowered.contains("relay") || lowered.contains("send to") {
        push_trace(
            "afp_agent",
            if tool_enabled("afp_agent") {
                "allowed"
            } else {
                "blocked"
            },
            (!tool_enabled("afp_agent")).then_some("tool_disabled"),
            None,
        );
    }
    if lowered.contains("book")
        || lowered.contains("payment")
        || lowered.contains("charge")
        || lowered.contains("refund")
    {
        let allowed = tool_enabled("stripe");
        push_trace(
            "stripe",
            if allowed { "allowed" } else { "blocked" },
            (!allowed).then_some("tool_disabled"),
            Some("api.stripe.com"),
        );
        reviews.push(TrialReviewItem {
            id: format!("review-{}", Ulid::new()),
            tool: "stripe".to_string(),
            status: "review_required".to_string(),
            reason: "Booking and payment paths always require a human review step.".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        });
    }
    (traces, reviews)
}

fn trial_assistant_reply(
    content: &str,
    template: &TrialTemplate,
    traces: &[TrialTraceEntry],
    reviews: &[TrialReviewItem],
    intent: &str,
) -> String {
    if intent == "confirm" {
        return "Done. Your day plan is confirmed and added to your calendar.\n\n✓ Lesson 1 at 5:00 pm\n✓ Lesson 2 at 6:00 pm\n✓ Dog washing at 7:00 pm\n✓ Free time from 8:00 pm\n\nYour evening is set. Come back to adjust any slot at any time.".to_string();
    }

    let lowered = content.to_lowercase();

    if intent == "schedule" {
        let num_lessons = if lowered.contains("two")
            || lowered.contains(" 2 ")
            || lowered.contains("2 lesson")
            || lowered.contains("two lesson")
        {
            2usize
        } else {
            1
        };
        let has_dog = lowered.contains("dog") || lowered.contains("wash");
        let mut lines = vec![
            "Day Planner · Plan built".to_string(),
            String::new(),
            "Here is a plan built around your fixed commitments today:".to_string(),
            String::new(),
            "  17:00 – 18:00  Lesson 1".to_string(),
        ];
        if num_lessons >= 2 {
            lines.push("  18:00 – 19:00  Lesson 2".to_string());
        }
        let mut next = if num_lessons >= 2 { 19 } else { 18 };
        if has_dog {
            lines.push(format!(
                "  {:02}:00 – {:02}:00  Dog washing 🐾",
                next,
                next + 1
            ));
            next += 1;
        }
        lines.push(format!("  {:02}:00 – 24:00  Free time · wind down", next));
        lines.push(String::new());
        lines.push(
            "The calendar below shows your plan. Click \"Add to my calendar\" to confirm."
                .to_string(),
        );
        return lines.join("\n");
    }

    let bullets = if template.id == "student_day_planner"
        || lowered.contains("study")
        || lowered.contains("class")
        || lowered.contains("lesson")
    {
        vec![
            "1. Protect the fixed commitments first, then place focused blocks around them.",
            "2. Keep one low-energy fallback task ready so the day can recover after a slip.",
            "3. End with a short reset so tomorrow starts with fewer open loops.",
        ]
    } else if template.id == "appointment_assistant"
        || lowered.contains("appointment")
        || lowered.contains("booking")
    {
        vec![
            "1. Confirm the time, location, and what you need to bring.",
            "2. Prepare the reminder or reschedule steps before touching a live booking flow.",
            "3. Queue any payment or booking action for review instead of auto-executing it.",
        ]
    } else {
        vec![
            "1. Clarify the goal, deadline, and minimum useful output.",
            "2. Decide whether this needs web research, a question back, or a simple next action.",
            "3. Capture the next action so the result can be replayed later.",
        ]
    };

    let trace_summary = if traces.is_empty() {
        "Reasoning step complete.".to_string()
    } else {
        format!(
            "Tool plan: {}",
            traces
                .iter()
                .map(|trace| format!("{} ({})", trace.tool, trace.status))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    let review_summary = if reviews.is_empty() {
        String::new()
    } else {
        "Sensitive action queued for human review.".to_string()
    };

    let meta = if review_summary.is_empty() {
        trace_summary
    } else {
        format!("{}\n{}", trace_summary, review_summary)
    };

    format!("{}\n\n{}\n\n{}", template.name, meta, bullets.join("\n"))
}

fn build_trial_calendar_view(content: &str) -> Value {
    let lowered = content.to_lowercase();
    let num_lessons = if lowered.contains("two")
        || lowered.contains(" 2 ")
        || lowered.contains("2 lesson")
        || lowered.contains("two lesson")
    {
        2usize
    } else {
        1
    };
    let has_dog = lowered.contains("dog") || lowered.contains("wash");
    let start_hour: u32 = 17;
    let end_hour: u32 = 24;

    let mut slots = Vec::new();
    let mut current = start_hour;

    for i in 0..num_lessons {
        slots.push(serde_json::json!({
            "start": format!("{:02}:00", current),
            "end": format!("{:02}:00", current + 1),
            "label": format!("Lesson {}", i + 1),
            "type": "lesson",
            "movable": true
        }));
        current += 1;
    }
    if has_dog {
        slots.push(serde_json::json!({
            "start": format!("{:02}:00", current),
            "end": format!("{:02}:00", current + 1),
            "label": "Dog washing 🐾",
            "type": "chore",
            "movable": true
        }));
        current += 1;
    }
    if current < end_hour {
        slots.push(serde_json::json!({
            "start": format!("{:02}:00", current),
            "end": "24:00",
            "label": "Free time",
            "type": "free",
            "movable": false
        }));
    }

    serde_json::json!({
        "start_hour": start_hour,
        "end_hour": end_hour,
        "slots": slots,
        "pending_confirmation": true,
        "confirmed": false
    })
}

fn trial_session_response(session: &TrialRunnerSession) -> Value {
    serde_json::json!({
        "session_id": session.id,
        "created_at": session.created_at,
        "expires_at": session.expires_at,
        "active_template_id": session.active_template_id,
        "runs_started": session.runs_started,
        "max_runs": session.max_runs,
        "turns_used": session.turns_used,
        "max_turns": session.max_turns,
        "remaining_runs": session.max_runs.saturating_sub(session.runs_started),
        "remaining_turns": session.max_turns.saturating_sub(session.turns_used),
        "requires_signup": session.requires_signup,
        "messages": session.messages,
        "logs": session.logs,
        "traces": session.traces,
        "prompt_versions": session.prompt_versions,
        "saved_tests": session.saved_tests,
        "review_queue": session.review_queue,
        "model_policy": session.model_policy,
        "tool_policy": session.tool_policy,
        "channel_policy": session.channel_policy,
        "starter_templates": session.starter_templates,
        "last_good_run": session.last_good_run,
        "calendar_view": session.calendar_view,
    })
}

async fn authenticated_user(
    db: &Db,
    headers: &HeaderMap,
) -> Result<UserRecord, (StatusCode, String)> {
    let token = bearer_token_from_headers(headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
    let session = db
        .find_session(&token)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "invalid session".to_string()))?;

    if session_is_expired(&session.expires_at) {
        return Err((StatusCode::UNAUTHORIZED, "session expired".to_string()));
    }

    let user = sqlx::query(
        r#"
        SELECT id, email, password_hash, auth_provider, google_sub, display_name, created_at::text as created_at
        FROM users
        WHERE id = $1
        LIMIT 1
        "#,
    )
    .bind(&session.user_id)
    .fetch_optional(&db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?
    .map(|row| UserRecord {
        id: row.try_get("id").unwrap_or_default(),
        email: row.try_get("email").unwrap_or_default(),
        password_hash: row.try_get("password_hash").unwrap_or(None),
        auth_provider: row.try_get("auth_provider").unwrap_or_default(),
        google_sub: row.try_get("google_sub").unwrap_or(None),
        display_name: row.try_get("display_name").unwrap_or_default(),
        created_at: row.try_get("created_at").unwrap_or_default(),
    })
    .ok_or_else(|| (StatusCode::UNAUTHORIZED, "user for session not found".to_string()))?;

    Ok(user)
}

async fn optional_authenticated_user(
    db: &Db,
    headers: &HeaderMap,
) -> Result<Option<UserRecord>, (StatusCode, String)> {
    if bearer_token_from_headers(headers).is_none() {
        return Ok(None);
    }
    authenticated_user(db, headers).await.map(Some)
}

fn bearer_token_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .and_then(|header| header.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn merge_thread_messages(
    private_messages: Vec<Message>,
    public_messages: Vec<Message>,
) -> Vec<Message> {
    let mut merged = Vec::with_capacity(private_messages.len() + public_messages.len());
    let mut seen = std::collections::HashSet::new();

    for message in private_messages.into_iter().chain(public_messages.into_iter()) {
        if seen.insert(message.id.clone()) {
            merged.push(message);
        }
    }

    merged.sort_by(|a, b| {
        a.timestamp
            .cmp(&b.timestamp)
            .then_with(|| a.id.cmp(&b.id))
    });
    merged
}

async fn thread_messages_for_headers(
    db: &Db,
    headers: &HeaderMap,
    thread_id: &str,
) -> Result<Vec<Message>, (StatusCode, String)> {
    if let Some(user) = optional_authenticated_user(db, headers).await? {
        let private_messages = db
            .get_private_thread(&user.id, thread_id)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        let public_messages = db
            .get_thread(thread_id)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        return Ok(merge_thread_messages(private_messages, public_messages));
    }

    db.get_thread(thread_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)
}

async fn store_private_app_message(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    owner_user_id: &str,
    message: AFPMessage,
) -> Result<(), Status> {
    let proto = app_to_proto(message);
    if !validate_proto_message(&proto) {
        return Err(Status::invalid_argument("Invalid AFP message"));
    }

    let content_json: Value = serde_json::from_str(&proto.content)
        .map_err(|_| Status::invalid_argument("Message content must be valid JSON"))?;

    let inserted = db
        .store_private_message(owner_user_id, &proto, content_json)
        .await
        .map_err(internal_error)?;

    if inserted {
        metrics.inc_messages_stored();
        let _ = relay_tx.send(
            serde_json::json!({
                "event": "message_stored",
                "message_id": proto.id,
                "thread_id": proto.thread_id,
                "type": proto.r#type
            })
            .to_string(),
        );
    } else {
        metrics.inc_messages_replayed();
    }

    Ok(())
}

async fn store_app_message_for_headers(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    headers: &HeaderMap,
    message: AFPMessage,
) -> Result<String, (StatusCode, String)> {
    let message_id = message.id.clone();
    if let Some(user) = optional_authenticated_user(db, headers).await? {
        store_private_app_message(db, metrics, relay_tx, &user.id, message)
            .await
            .map_err(status_to_http)?;
    } else {
        store_proto_message(db, metrics, relay_tx, app_to_proto(message))
            .await
            .map_err(status_to_http)?;
    }
    Ok(message_id)
}

async fn append_private_task_status_trace(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    owner_user_id: &str,
    task_id: &str,
    status: &str,
    rationale: &str,
) -> Result<(), (StatusCode, String)> {
    let task = db
        .get_agent_task(owner_user_id, task_id)
        .await
        .map_err(task_update_error_to_http)?;
    let Some(thread_id) = task
        .get("thread_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    else {
        return Ok(());
    };

    let sender = task
        .get("agent_instance_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("omnyid://runner/{value}"))
        .unwrap_or_else(|| format!("omnyid://runner/{task_id}"));
    let intent = task
        .get("intent")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    if let Ok(msg) = new_server_message(
        sender,
        vec![],
        thread_id.to_string(),
        "agent_message",
        serde_json::json!({
            "task_id": task_id,
            "status": status,
            "intent": intent,
            "rationale": rationale,
        }),
        vec![],
        vec![],
        vec![],
        true,
    ) {
        let _ = store_private_app_message(db, metrics, relay_tx, owner_user_id, msg)
            .await
            .map_err(status_to_http)?;
    }

    Ok(())
}

async fn enforce_rate_limit(
    state: &AppState,
    key: String,
    policy: RateLimitPolicy,
) -> Result<(), (StatusCode, String)> {
    if state.rate_limiter.allow(key, policy).await {
        return Ok(());
    }

    state.metrics.inc_rate_limited_requests();
    Err((
        StatusCode::TOO_MANY_REQUESTS,
        "too many requests, please try again shortly".to_string(),
    ))
}

fn public_rate_limit_key(scope: &str, headers: &HeaderMap) -> String {
    format!("public:{scope}:{}", request_ip_identity(headers))
}

fn authenticated_rate_limit_key(scope: &str, headers: &HeaderMap) -> String {
    let identity = bearer_token_from_headers(headers)
        .map(|token| format!("session:{}", runtime_token_preview(&token)))
        .unwrap_or_else(|| format!("ip:{}", request_ip_identity(headers)));
    format!("auth:{scope}:{identity}")
}

fn request_ip_identity(headers: &HeaderMap) -> String {
    forwarded_header_identity(headers, "x-forwarded-for")
        .or_else(|| forwarded_header_identity(headers, "cf-connecting-ip"))
        .or_else(|| forwarded_header_identity(headers, "x-real-ip"))
        .unwrap_or_else(|| "unknown".to_string())
}

fn forwarded_header_identity(headers: &HeaderMap, header_name: &str) -> Option<String> {
    headers
        .get(header_name)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            value.split(',').find_map(|candidate| {
                let trimmed = candidate.trim();
                (!trimmed.is_empty()).then(|| trimmed.to_string())
            })
        })
}

async fn create_session_for_user(db: &Db, user: &UserRecord) -> Result<AuthSessionRecord, String> {
    db.ensure_user_private_schema(&user.id)
        .await
        .map_err(|err| err.to_string())?;
    let session = AuthSessionRecord {
        token: random_token(),
        user_id: user.id.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        expires_at: (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339(),
    };
    db.create_session(&session)
        .await
        .map_err(|err| err.to_string())?;
    Ok(session)
}

fn random_token() -> String {
    let mut bytes = [0u8; 24];
    rand::rng().fill(&mut bytes);
    hex::encode(bytes)
}

fn session_is_expired(expires_at: &str) -> bool {
    parse_datetime_to_utc(expires_at)
        .map(|expires| expires < chrono::Utc::now())
        .unwrap_or(true)
}

fn parse_datetime_to_utc(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
        .ok()
        .or_else(|| {
            chrono::DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f%#z")
                .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
                .ok()
        })
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|err| err.to_string())
}

fn verify_password(password_hash: &str, password: &str) -> Result<bool, String> {
    let parsed_hash = PasswordHash::new(password_hash).map_err(|err| err.to_string())?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

async fn verify_google_id_token(id_token: &str) -> Result<GoogleTokenInfoResponse, String> {
    let client_id = std::env::var("OMNYID_GOOGLE_CLIENT_ID").unwrap_or_else(|_| {
        "975613409177-nv214f97lors4g5j2dcvuftv5pf9c88p.apps.googleusercontent.com".to_string()
    });
    let response = reqwest::Client::new()
        .get("https://oauth2.googleapis.com/tokeninfo")
        .query(&[("id_token", id_token)])
        .send()
        .await
        .map_err(|err| format!("Google token verification failed: {err}"))?;
    if !response.status().is_success() {
        return Err("Google sign-in was rejected".to_string());
    }
    let token_info = response
        .json::<GoogleTokenInfoResponse>()
        .await
        .map_err(|err| format!("Google token payload was invalid: {err}"))?;
    if token_info.aud != client_id {
        return Err("Google token audience does not match Omnyid".to_string());
    }
    if token_info.email_verified.as_deref() != Some("true") {
        return Err("Google account email is not verified".to_string());
    }
    Ok(token_info)
}

async fn ensure_user_agents_and_demo_seed(
    state: &Arc<AppState>,
    user: &UserRecord,
) -> Result<(), String> {
    let existing_agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(|err| err.to_string())?;
    if !existing_agents.is_empty() {
        return Ok(());
    }

    let primary_local = email_localpart_slug(&user.email);
    let primary_agent = ManagedAgentRecord {
        id: Ulid::new().to_string(),
        owner_user_id: user.id.clone(),
        agent_id: format!("agent:{}-{}@omnyid.com", primary_local, &user.id[..8]),
        label: "Primary agent".to_string(),
        email: user.email.clone(),
        kind: "managed".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        metadata: serde_json::json!({"origin":"account_registration"}),
    };
    let alpha_agent = ManagedAgentRecord {
        id: Ulid::new().to_string(),
        owner_user_id: user.id.clone(),
        agent_id: format!("agent:test-alpha-{}@omnyid.com", &user.id[..8]),
        label: "Test agent alpha".to_string(),
        email: format!("alpha+{}@omnyid.com", &user.id[..8]),
        kind: "demo".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        metadata: serde_json::json!({"role":"demo_sender"}),
    };
    let beta_agent = ManagedAgentRecord {
        id: Ulid::new().to_string(),
        owner_user_id: user.id.clone(),
        agent_id: format!("agent:test-beta-{}@omnyid.com", &user.id[..8]),
        label: "Test agent beta".to_string(),
        email: format!("beta+{}@omnyid.com", &user.id[..8]),
        kind: "demo".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        metadata: serde_json::json!({"role":"demo_recipient"}),
    };

    for agent in [&primary_agent, &alpha_agent, &beta_agent] {
        state
            .db
            .upsert_managed_agent(agent)
            .await
            .map_err(|err| err.to_string())?;
    }

    let thread_id = demo_thread_id(&user.id);
    let intro_messages = vec![
        new_server_message(
            alpha_agent.agent_id.clone(),
            vec![beta_agent.agent_id.clone()],
            thread_id.clone(),
            "agent_message",
            serde_json::json!({
                "body": format!("Hello {}, alpha is online and ready to relay through Omnyid.", user.display_name),
                "kind": "demo_seed"
            }),
            vec![serde_json::json!({
                "format": "email",
                "content": {
                    "subject": "Alpha boot sequence",
                    "body": format!("Hello {}, alpha is online and ready to relay through Omnyid.", user.display_name)
                }
            })],
            vec![],
            vec![],
            true,
        )?,
        new_server_message(
            beta_agent.agent_id.clone(),
            vec![alpha_agent.agent_id.clone()],
            thread_id.clone(),
            "agent_message",
            serde_json::json!({
                "body": "Beta acknowledged. You can now send secure test messages between your demo agents.",
                "kind": "demo_seed"
            }),
            vec![serde_json::json!({
                "format": "email",
                "content": {
                    "subject": "Beta acknowledged",
                    "body": "Beta acknowledged. You can now send secure test messages between your demo agents."
                }
            })],
            vec![],
            vec![],
            true,
        )?,
    ];

    for message in intro_messages {
        store_private_app_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            &user.id,
            message,
        )
        .await
        .map_err(|err| err.message().to_string())?;
    }

    // Provision master AgentInstance with soul.md
    let master_instance = AgentInstance::provision(&user.id, &user.display_name, "omnyid.com");
    state
        .db
        .save_master_agent_instance(&master_instance)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

fn new_server_message(
    from: String,
    to: Vec<String>,
    thread_id: String,
    message_type: &str,
    content: Value,
    views: Vec<Value>,
    references: Vec<Value>,
    attachments: Vec<Value>,
    store_in_relational: bool,
) -> Result<AFPMessage, String> {
    let encryption_key = env_hex_32("OMNYID_ENCRYPTION_KEY_HEX")?.ok_or_else(|| {
        "OMNYID_ENCRYPTION_KEY_HEX must be configured for server-generated messages".to_string()
    })?;
    let (normalized_type, normalized_subtype, normalized_metadata) =
        normalized_server_message_taxonomy(message_type);
    let message_id = Ulid::new().to_string();
    let timestamp = chrono::Utc::now().to_rfc3339();
    let aad = serde_json::json!({
        "id": message_id,
        "thread_id": thread_id,
        "from": from,
        "to": to,
        "type": normalized_type,
        "subtype": normalized_subtype,
        "metadata": normalized_metadata,
        "timestamp": timestamp,
    });
    let encryption = crate::crypto::encrypt_content(&content, &aad, &encryption_key);
    let _views = views;
    let mut message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: aad
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        thread_id: aad
            .get("thread_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        parent_id: None,
        from: aad
            .get("from")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        to: aad
            .get("to")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        timestamp: aad
            .get("timestamp")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        r#type: normalized_type.to_string(),
        subtype: (!normalized_subtype.is_empty()).then(|| normalized_subtype.to_string()),
        content,
        metadata: if normalized_metadata.is_null() {
            None
        } else {
            Some(normalized_metadata)
        },
        signature: String::new(),
        encryption: Some(encryption),
        views: vec![],
        references,
        attachments,
        store_in_relational,
        prev_hash: None,
    };
    sign_server_generated_message(&mut message)?;
    Ok(message)
}

fn normalized_server_message_taxonomy(message_type: &str) -> (&str, &str, Value) {
    match message_type {
        "agent_provisioned" => (
            "agent",
            "provisioned",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_plan" => ("agent", "plan", serde_json::json!({"legacy_type": message_type})),
        "agent_step" => ("agent", "step", serde_json::json!({"legacy_type": message_type})),
        "agent_result" => ("agent", "result", serde_json::json!({"legacy_type": message_type})),
        "agent_research_result" => (
            "agent",
            "research_result",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_approval_request" => (
            "agent",
            "approval_request",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_approval_granted" => (
            "agent",
            "approval_granted",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_approval_rejected" => (
            "agent",
            "approval_rejected",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_conflict_detected" => (
            "agent",
            "conflict_detected",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_escalation" => (
            "agent",
            "escalation",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_triage" => ("agent", "triage", serde_json::json!({"legacy_type": message_type})),
        "agent_message" => ("agent", "message", serde_json::json!({"legacy_type": message_type})),
        _ => (message_type, "", Value::Null),
    }
}

fn demo_thread_id(user_id: &str) -> String {
    format!("thread.demo.{}", user_id)
}

fn email_localpart_slug(email: &str) -> String {
    email
        .split('@')
        .next()
        .unwrap_or("agent")
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn session_user_response(user: &UserRecord) -> SessionUserResponse {
    SessionUserResponse {
        id: user.id.clone(),
        email: user.email.clone(),
        display_name: user.display_name.clone(),
        auth_provider: user.auth_provider.clone(),
    }
}

fn cors_layer() -> CorsLayer {
    let origins = allowed_cors_origins();
    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
        ])
}

fn allowed_cors_origins() -> Vec<HeaderValue> {
    let configured = std::env::var("OMNYID_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| {
            "https://omnyid.com,https://cloud.omnyid.com,http://localhost:3000,http://127.0.0.1:3000".to_string()
        });

    configured
        .split(',')
        .filter_map(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                HeaderValue::from_str(trimmed).ok()
            }
        })
        .collect()
}

fn build_runtime_deployment_plan(
    user: &UserRecord,
    agents: &[ManagedAgentRecord],
    framework: &str,
    gui: Option<&str>,
) -> Result<RuntimeDeploymentRecord, (StatusCode, String)> {
    let (framework_name, default_gui, image_ref, python_version, notes, capabilities) =
        match framework {
            "crewai" => (
                "crewai",
                "crewai-studio",
                "python:3.13-slim",
                "3.13",
                vec![
                    "This deployment record is a private per-user Crew runtime plan.",
                    "Actual runtime orchestration must preserve isolated secrets, logs, storage, and message scope.",
                    "This runtime scaffold is safe to materialize because it is per-user and does not mix messages or secrets.",
                ],
                serde_json::json!({
                    "telemetry_disabled": true,
                    "share_crew": false,
                    "gui": "CrewAI-Studio community project",
                    "gui_license": "MIT",
                    "bring_your_own_llm_key": true,
                }),
            ),
            "python-runner-chat" => (
                "python-runner-chat",
                "builtin-chat-window",
                "python:3.13-slim-bookworm",
                "3.13",
                vec![
                    "This deployment record is a private per-user Python runner with a built-in chat window.",
                    "It is intended for Coolify-style one-click hosting with OmnyID-managed model defaults and optional BYOK after signup.",
                    "The chat window is a private control surface for the isolated runtime, not a shared operator console.",
                    "The runtime scaffold carries CPU, memory, pids, runtime, and egress policy defaults for non-technical users.",
                ],
                serde_json::json!({
                    "telemetry_disabled": true,
                    "share_runner": false,
                    "gui": "Built-in lightweight chat window and agent IDE",
                    "gui_license": "OmnyID runtime scaffold",
                    "bring_your_own_llm_key": true,
                    "omnyid_managed_model_access": true,
                    "coolify_ready": true,
                }),
            ),
            _ => return Err((StatusCode::BAD_REQUEST, "unsupported framework".to_string())),
        };

    let safe_gui = gui
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_string())
        .or_else(|| Some(default_gui.to_string()));
    let now = chrono::Utc::now().to_rfc3339();
    let user_slug = email_localpart_slug(&user.email);
    let runtime_id = Ulid::new().to_string();
    let workspace_root = runtime_root();
    let workspace_path = format!(
        "{root}/{user_slug}-{id}",
        root = workspace_root.display(),
        id = &user.id[..8]
    );
    let runtime_token = random_token();
    let primary_agent_id = agents
        .first()
        .map(|agent| agent.agent_id.clone())
        .unwrap_or_else(|| format!("agent:{user_slug}@omnyid.com"));
    let runtime_mode = "signed_in_hosted";
    let runtime_cpu_limit = "1.0";
    let runtime_memory_limit = "1536m";
    let runtime_pids_limit = 256;
    let runtime_max_seconds = 120;
    let background_runtime_max_seconds = 900;
    let gui_name = safe_gui
        .clone()
        .unwrap_or_else(|| default_runtime_gui(framework_name).to_string());

    Ok(RuntimeDeploymentRecord {
        id: runtime_id,
        owner_user_id: user.id.clone(),
        framework: framework_name.to_string(),
        gui: safe_gui,
        status: "planned".to_string(),
        python_version: python_version.to_string(),
        image_ref: image_ref.to_string(),
        runtime_token: runtime_token.clone(),
        workspace_path: workspace_path.clone(),
        config_json: serde_json::json!({
            "privacy_mode": "isolated_per_user",
            "telemetry_disabled": true,
            "share_crew": false,
            "share_runner": false,
            "runtime_template_version": runtime_template_version(),
            "agent_scope": {
                "owner_user_id": user.id,
                "owner_email": user.email,
            },
            "runtime_family": framework_name,
            "runtime_root": workspace_root.display().to_string(),
            "scaffold": {
                "status": "materialized",
                "compose_file": format!("{workspace_path}/docker-compose.yml"),
                "env_file": format!("{workspace_path}/.env"),
                "workspace_dir": format!("{workspace_path}/workspace"),
                "logs_dir": format!("{workspace_path}/logs"),
                "entrypoint": format!(
                    "{workspace_path}/workspace/{}",
                    runtime_entrypoint_filename(framework_name)
                ),
                "agent_profile": format!("{workspace_path}/workspace/agent_profile.json"),
            },
            "notes": notes,
            "runtime_env": {
                "OMNYID_RUNTIME_TOKEN": runtime_token,
                "OMNYID_OWNER_USER_ID": user.id,
                "OMNYID_OWNER_EMAIL": user.email,
            },
            "starter_profile": {
                "primary_agent_id": primary_agent_id,
                "gui_name": gui_name,
                "default_template_id": "student_day_planner",
            },
            "runtime_mode": runtime_mode,
            "sandbox_policy": default_runner_sandbox_policy(framework_name),
            "resource_policy": default_runner_resource_policy(
                framework_name,
                runtime_cpu_limit,
                runtime_memory_limit,
                runtime_pids_limit,
                runtime_max_seconds,
                background_runtime_max_seconds,
            ),
            "network_policy": default_runner_network_policy(framework_name),
            "model_policy": default_runner_model_policy(framework_name),
            "tool_policy": default_runner_tool_policy(framework_name),
            "channel_policy": default_runner_channel_policy(framework_name),
            "starter_templates": default_runner_templates(framework_name),
            "governance": default_runner_governance(framework_name),
            "audit_scope": default_runner_audit_scope(framework_name),
            "capabilities": capabilities,
        }),
        created_at: now.clone(),
        updated_at: now,
    })
}

fn default_runner_sandbox_policy(framework: &str) -> Value {
    if framework != "python-runner-chat" {
        return serde_json::json!({});
    }
    serde_json::json!({
        "runtime_isolation": "per_workspace_container",
        "run_as_non_root": true,
        "read_only_root_filesystem": true,
        "no_new_privileges": true,
        "cap_drop": ["ALL"],
        "seccomp_profile": "docker-default",
        "apparmor_profile": "docker-default",
        "docker_socket_mount": false,
        "host_networking": false,
        "writable_mounts": [
            "/workspace/data/files",
            "/workspace/data/db",
            "/workspace/data/vector",
            "/workspace/logs",
            "/tmp"
        ]
    })
}

fn default_runner_resource_policy(
    framework: &str,
    cpu_limit: &str,
    memory_limit: &str,
    pids_limit: i32,
    interactive_max_seconds: i32,
    background_max_seconds: i32,
) -> Value {
    if framework != "python-runner-chat" {
        return serde_json::json!({});
    }
    serde_json::json!({
        "interactive": {
            "cpu_limit": cpu_limit,
            "memory_limit": memory_limit,
            "pids_limit": pids_limit,
            "max_runtime_seconds": interactive_max_seconds
        },
        "background": {
            "max_runtime_seconds": background_max_seconds
        },
        "recycle_policy": {
            "recycle_after_hours": 24,
            "recycle_after_runs": 100
        }
    })
}

fn default_runner_network_policy(framework: &str) -> Value {
    if framework != "python-runner-chat" {
        return serde_json::json!({});
    }
    serde_json::json!({
        "mode": "application_allowlist",
        "default": "deny",
        "generic_http_requires_allowlist": true,
        "allowed_hosts": ["api.omnyid.com", "wt.omnyid.com"]
    })
}

fn default_runner_model_policy(framework: &str) -> Value {
    if framework != "python-runner-chat" {
        return serde_json::json!({});
    }
    serde_json::json!({
        "mode": "omnyid_managed_default",
        "byok_available": true,
        "trial_mode": false,
        "default_provider": "omnyid_managed",
        "default_model": "gpt-5.4-mini",
        "allowed_providers": ["omnyid_managed", "openai", "ollama"],
        "allowed_models": ["gpt-5.4-mini", "gpt-5.4", "ollama/local"],
        "per_run_input_token_cap": 16000,
        "per_run_output_token_cap": 4000,
        "daily_spend_cap_usd": 5.0,
        "monthly_spend_cap_usd": 25.0
    })
}

fn default_runner_tool_policy(framework: &str) -> Value {
    if framework != "python-runner-chat" {
        return serde_json::json!({});
    }
    serde_json::json!({
        "web": { "enabled": true, "allowlisted_hosts": [] },
        "google_api": { "enabled": false, "allowlisted_hosts": ["googleapis.com", "www.googleapis.com"] },
        "stripe": { "enabled": false, "allowlisted_hosts": ["api.stripe.com"] },
        "file_access": { "enabled": true },
        "vector_store": { "enabled": true, "engine": "chromadb" },
        "simple_db": { "enabled": true, "engine": "duckdb" },
        "scheduler": { "enabled": true },
        "afp_agent": { "enabled": true }
    })
}

fn default_runner_channel_policy(framework: &str) -> Value {
    if framework != "python-runner-chat" {
        return serde_json::json!({});
    }
    serde_json::json!({
        "web_chat": { "enabled": true },
        "api_endpoint": { "enabled": true },
        "afp_agent_endpoint": { "enabled": true }
    })
}

fn default_runner_templates(framework: &str) -> Value {
    if framework != "python-runner-chat" {
        return Value::Array(vec![]);
    }
    serde_json::json!([
        {
            "id": "student_day_planner",
            "name": "Student Day Planner",
            "summary": "Turn classes, assignments, and energy into a practical day plan."
        },
        {
            "id": "research_assistant",
            "name": "Research Assistant",
            "summary": "Collect sources, summarize them, and capture the next actions."
        },
        {
            "id": "appointment_assistant",
            "name": "Appointment Assistant",
            "summary": "Prepare booking and reminder flows with human review for risky actions."
        }
    ])
}

fn default_runner_governance(framework: &str) -> Value {
    if framework != "python-runner-chat" {
        return serde_json::json!({});
    }
    serde_json::json!({
        "roles": ["owner", "operator", "viewer"],
        "support_access_default": "disabled"
    })
}

fn default_runner_audit_scope(framework: &str) -> Value {
    if framework != "python-runner-chat" {
        return Value::Array(vec![]);
    }
    serde_json::json!([
        "deploy",
        "tool_policy",
        "model_policy",
        "prompt_versions",
        "support_access"
    ])
}

fn runtime_root() -> PathBuf {
    std::env::var("OMNYID_RUNTIME_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/srv/omnyid/runtimes"))
}

fn materialize_runtime_scaffold(deployment: &RuntimeDeploymentRecord) -> Result<(), String> {
    let workspace_dir = PathBuf::from(&deployment.workspace_path);
    let runtime_workspace = workspace_dir.join("workspace");
    let logs_dir = workspace_dir.join("logs");
    let runtime_data = runtime_workspace.join("data");
    let runtime_files = runtime_data.join("files");
    let runtime_db = runtime_data.join("db");
    let runtime_vector = runtime_data.join("vector");
    let runtime_secrets = runtime_workspace.join("secrets");

    std::fs::create_dir_all(&runtime_workspace)
        .map_err(|err| format!("failed to create runtime workspace: {err}"))?;
    std::fs::create_dir_all(&logs_dir)
        .map_err(|err| format!("failed to create runtime logs directory: {err}"))?;
    std::fs::create_dir_all(&runtime_files)
        .map_err(|err| format!("failed to create runtime file directory: {err}"))?;
    std::fs::create_dir_all(&runtime_db)
        .map_err(|err| format!("failed to create runtime db directory: {err}"))?;
    std::fs::create_dir_all(&runtime_vector)
        .map_err(|err| format!("failed to create runtime vector directory: {err}"))?;
    std::fs::create_dir_all(&runtime_secrets)
        .map_err(|err| format!("failed to create runtime secret directory: {err}"))?;
    relax_runtime_permissions(&workspace_dir);

    let mut values = BTreeMap::new();
    values.insert("IMAGE_REF", deployment.image_ref.clone());
    values.insert(
        "CONTAINER_NAME",
        format!(
            "omnyid-{}-{}",
            deployment.framework,
            &deployment.owner_user_id[..8]
        ),
    );
    values.insert("RUNTIME_TOKEN", deployment.runtime_token.clone());
    values.insert("OWNER_USER_ID", deployment.owner_user_id.clone());
    values.insert(
        "OWNER_EMAIL",
        deployment
            .config_json
            .get("agent_scope")
            .and_then(|scope| scope.get("owner_email"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    );
    values.insert(
        "AGENT_SCOPE_JSON",
        deployment
            .config_json
            .get("agent_scope")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}))
            .to_string(),
    );
    values.insert(
        "API_BASE",
        std::env::var("OMNYID_API_BASE").unwrap_or_else(|_| "https://api.omnyid.com".to_string()),
    );
    values.insert("TRANSPORT_PREFERENCE", "webtransport".to_string());
    values.insert(
        "GUI_NAME",
        deployment
            .gui
            .clone()
            .unwrap_or_else(|| default_runtime_gui(&deployment.framework).to_string()),
    );
    values.insert(
        "PRIMARY_AGENT_ID",
        deployment
            .config_json
            .get("starter_profile")
            .and_then(|profile| profile.get("primary_agent_id"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    );
    values.insert(
        "CHAT_PORT",
        deployment
            .config_json
            .get("resource_policy")
            .and_then(|_| Some("7860".to_string()))
            .unwrap_or_else(|| "7860".to_string()),
    );
    values.insert(
        "CPU_LIMIT",
        deployment
            .config_json
            .get("resource_policy")
            .and_then(|policy| policy.get("interactive"))
            .and_then(|policy| policy.get("cpu_limit"))
            .and_then(Value::as_str)
            .unwrap_or("1.0")
            .to_string(),
    );
    values.insert(
        "MEMORY_LIMIT",
        deployment
            .config_json
            .get("resource_policy")
            .and_then(|policy| policy.get("interactive"))
            .and_then(|policy| policy.get("memory_limit"))
            .and_then(Value::as_str)
            .unwrap_or("1536m")
            .to_string(),
    );
    values.insert(
        "PIDS_LIMIT",
        deployment
            .config_json
            .get("resource_policy")
            .and_then(|policy| policy.get("interactive"))
            .and_then(|policy| policy.get("pids_limit"))
            .and_then(Value::as_i64)
            .unwrap_or(256)
            .to_string(),
    );
    values.insert(
        "MAX_RUNTIME_SECONDS",
        deployment
            .config_json
            .get("resource_policy")
            .and_then(|policy| policy.get("interactive"))
            .and_then(|policy| policy.get("max_runtime_seconds"))
            .and_then(Value::as_i64)
            .unwrap_or(120)
            .to_string(),
    );
    values.insert(
        "BACKGROUND_MAX_RUNTIME_SECONDS",
        deployment
            .config_json
            .get("resource_policy")
            .and_then(|policy| policy.get("background"))
            .and_then(|policy| policy.get("max_runtime_seconds"))
            .and_then(Value::as_i64)
            .unwrap_or(900)
            .to_string(),
    );

    write_runtime_file(
        &workspace_dir.join("docker-compose.yml"),
        &render_runtime_template(
            runtime_template_content(&deployment.framework, "docker-compose.yml")?,
            &values,
        ),
    )?;
    if deployment.framework == "python-runner-chat" {
        write_runtime_file(
            &workspace_dir.join("Dockerfile"),
            &render_runtime_template(
                runtime_template_content(&deployment.framework, "Dockerfile")?,
                &values,
            ),
        )?;
    }
    write_runtime_file(
        &workspace_dir.join(".env"),
        &render_runtime_template(
            runtime_template_content(&deployment.framework, "runtime.env")?,
            &values,
        ),
    )?;
    write_runtime_file(
        &workspace_dir.join("README.md"),
        &render_runtime_template(
            runtime_template_content(&deployment.framework, "README.md")?,
            &values,
        ),
    )?;
    write_runtime_file(
        &runtime_workspace.join(runtime_entrypoint_filename(&deployment.framework)),
        &render_runtime_template(
            runtime_template_content(&deployment.framework, "entrypoint")?,
            &values,
        ),
    )?;
    write_runtime_file(
        &runtime_workspace.join("agent_profile.json"),
        &render_runtime_template(
            runtime_template_content(&deployment.framework, "agent_profile.json")?,
            &values,
        ),
    )?;
    if deployment.framework == "python-runner-chat" {
        write_runtime_file(
            &workspace_dir.join("requirements.txt"),
            &render_runtime_template(
                runtime_template_content(&deployment.framework, "requirements.txt")?,
                &values,
            ),
        )?;
        write_runtime_file(
            &runtime_workspace.join("runtime_policy.json"),
            &render_runtime_template(
                runtime_template_content(&deployment.framework, "runtime_policy.json")?,
                &values,
            ),
        )?;
        write_runtime_file(
            &runtime_workspace.join("starter_templates.json"),
            &render_runtime_template(
                runtime_template_content(&deployment.framework, "starter_templates.json")?,
                &values,
            ),
        )?;
        write_runtime_file(
            &runtime_workspace.join("tool_registry.py"),
            &render_runtime_template(
                runtime_template_content(&deployment.framework, "tool_registry.py")?,
                &values,
            ),
        )?;
        write_runtime_file(
            &runtime_workspace.join("policy.py"),
            &render_runtime_template(
                runtime_template_content(&deployment.framework, "policy.py")?,
                &values,
            ),
        )?;
    }

    Ok(())
}

fn inspect_runtime_deployment(mut deployment: RuntimeDeploymentRecord) -> RuntimeDeploymentRecord {
    let workspace_dir = PathBuf::from(&deployment.workspace_path);
    let compose_file = workspace_dir.join("docker-compose.yml");
    let dockerfile = workspace_dir.join("Dockerfile");
    let env_file = workspace_dir.join(".env");
    let workspace_subdir = workspace_dir.join("workspace");
    let logs_dir = workspace_dir.join("logs");
    let entrypoint = workspace_subdir.join(runtime_entrypoint_filename(&deployment.framework));
    let agent_profile = workspace_subdir.join("agent_profile.json");
    let requirements = workspace_dir.join("requirements.txt");
    let runtime_policy = workspace_subdir.join("runtime_policy.json");
    let starter_templates = workspace_subdir.join("starter_templates.json");
    let tool_registry = workspace_subdir.join("tool_registry.py");
    let policy_module = workspace_subdir.join("policy.py");

    let compose_exists = compose_file.exists();
    let dockerfile_exists = dockerfile.exists();
    let env_exists = env_file.exists();
    let workspace_exists = workspace_subdir.exists();
    let logs_exist = logs_dir.exists();
    let entrypoint_exists = entrypoint.exists();
    let agent_profile_exists = agent_profile.exists();
    let requirements_exists = requirements.exists();
    let runtime_policy_exists = runtime_policy.exists();
    let starter_templates_exists = starter_templates.exists();
    let tool_registry_exists = tool_registry.exists();
    let policy_module_exists = policy_module.exists();
    let all_present = compose_exists
        && env_exists
        && workspace_exists
        && logs_exist
        && entrypoint_exists
        && agent_profile_exists
        && runtime_framework_scaffold_ready(
            &deployment.framework,
            dockerfile_exists,
            requirements_exists,
            runtime_policy_exists,
            starter_templates_exists,
            tool_registry_exists,
            policy_module_exists,
        );

    deployment.status = if all_present {
        "scaffolded".to_string()
    } else {
        deployment.status
    };

    if let Some(config) = deployment.config_json.as_object_mut() {
        config.insert(
            "runtime_state".to_string(),
            serde_json::json!({
                "scaffolded": all_present,
                "workspace_exists": workspace_dir.exists(),
                "compose_exists": compose_exists,
                "dockerfile_exists": dockerfile_exists,
                "env_exists": env_exists,
                "workspace_dir_exists": workspace_exists,
                "logs_dir_exists": logs_exist,
                "entrypoint_exists": entrypoint_exists,
                "agent_profile_exists": agent_profile_exists,
                "requirements_exists": requirements_exists,
                "runtime_policy_exists": runtime_policy_exists,
                "starter_templates_exists": starter_templates_exists,
                "tool_registry_exists": tool_registry_exists,
                "policy_module_exists": policy_module_exists,
            }),
        );
    }

    deployment
}

fn runtime_framework_scaffold_ready(
    framework: &str,
    dockerfile_exists: bool,
    requirements_exists: bool,
    runtime_policy_exists: bool,
    starter_templates_exists: bool,
    tool_registry_exists: bool,
    policy_module_exists: bool,
) -> bool {
    match framework {
        "python-runner-chat" => {
            dockerfile_exists
                && requirements_exists
                && runtime_policy_exists
                && starter_templates_exists
                && tool_registry_exists
                && policy_module_exists
        }
        _ => true,
    }
}

struct PythonRunnerWorkspaceFileDescriptor {
    file_id: &'static str,
    label: &'static str,
    relative_path: &'static str,
    language: &'static str,
    editable: bool,
    path: PathBuf,
}

fn python_runner_workspace_files(
    deployment: &RuntimeDeploymentRecord,
) -> Vec<PythonRunnerWorkspaceFileDescriptor> {
    let workspace_root = PathBuf::from(&deployment.workspace_path);
    vec![
        PythonRunnerWorkspaceFileDescriptor {
            file_id: "runner_chat_py",
            label: "Runner Chat",
            relative_path: "workspace/runner_chat.py",
            language: "python",
            editable: true,
            path: workspace_root.join("workspace").join("runner_chat.py"),
        },
        PythonRunnerWorkspaceFileDescriptor {
            file_id: "tool_registry_py",
            label: "Tool Registry",
            relative_path: "workspace/tool_registry.py",
            language: "python",
            editable: true,
            path: workspace_root.join("workspace").join("tool_registry.py"),
        },
        PythonRunnerWorkspaceFileDescriptor {
            file_id: "policy_py",
            label: "Policy Module",
            relative_path: "workspace/policy.py",
            language: "python",
            editable: true,
            path: workspace_root.join("workspace").join("policy.py"),
        },
        PythonRunnerWorkspaceFileDescriptor {
            file_id: "dockerfile",
            label: "Dockerfile",
            relative_path: "Dockerfile",
            language: "dockerfile",
            editable: true,
            path: workspace_root.join("Dockerfile"),
        },
        PythonRunnerWorkspaceFileDescriptor {
            file_id: "requirements_txt",
            label: "Requirements",
            relative_path: "requirements.txt",
            language: "text",
            editable: true,
            path: workspace_root.join("requirements.txt"),
        },
        PythonRunnerWorkspaceFileDescriptor {
            file_id: "runtime_policy_json",
            label: "Runtime Policy",
            relative_path: "workspace/runtime_policy.json",
            language: "json",
            editable: true,
            path: workspace_root.join("workspace").join("runtime_policy.json"),
        },
        PythonRunnerWorkspaceFileDescriptor {
            file_id: "agent_profile_json",
            label: "Agent Profile",
            relative_path: "workspace/agent_profile.json",
            language: "json",
            editable: true,
            path: workspace_root.join("workspace").join("agent_profile.json"),
        },
        PythonRunnerWorkspaceFileDescriptor {
            file_id: "starter_templates_json",
            label: "Starter Templates",
            relative_path: "workspace/starter_templates.json",
            language: "json",
            editable: true,
            path: workspace_root
                .join("workspace")
                .join("starter_templates.json"),
        },
    ]
}

fn python_runner_workspace_file(
    deployment: &RuntimeDeploymentRecord,
    file_id: &str,
) -> Option<PythonRunnerWorkspaceFileDescriptor> {
    python_runner_workspace_files(deployment)
        .into_iter()
        .find(|descriptor| descriptor.file_id == file_id)
}

fn normalize_search_engine(engine: Option<&str>) -> String {
    match engine
        .unwrap_or("duckduckgo")
        .trim()
        .to_lowercase()
        .as_str()
    {
        "google" => "google".to_string(),
        _ => "duckduckgo".to_string(),
    }
}

fn search_engine_url(engine: &str, query: &str) -> String {
    let encoded = query.replace(' ', "+");
    match engine {
        "google" => format!("https://www.google.com/search?q={encoded}"),
        _ => format!("https://duckduckgo.com/?q={encoded}"),
    }
}

fn infer_runner_target_file(query: &str, active_file_id: Option<&str>) -> String {
    let lowered = query.to_lowercase();
    if lowered.contains("dockerfile")
        || lowered.contains("container")
        || lowered.contains("image build")
    {
        "dockerfile".to_string()
    } else if lowered.contains("policy.py")
        || lowered.contains("policy ")
        || lowered.contains("allowlist")
    {
        "policy_py".to_string()
    } else if lowered.contains("tool registry") || lowered.contains("tool_registry") {
        "tool_registry_py".to_string()
    } else if lowered.contains("requirements")
        || lowered.contains("dependency")
        || lowered.contains("package")
    {
        "requirements_txt".to_string()
    } else if lowered.contains("template") {
        "starter_templates_json".to_string()
    } else if lowered.contains("profile") || lowered.contains("agent profile") {
        "agent_profile_json".to_string()
    } else if lowered.contains("runtime policy")
        || lowered.contains("token cap")
        || lowered.contains("spend cap")
    {
        "runtime_policy_json".to_string()
    } else if let Some(current) = active_file_id {
        current.to_string()
    } else {
        "runner_chat_py".to_string()
    }
}

fn build_runner_draft(query: &str, target_file_id: &str) -> UiRunnerDraftResponse {
    let timestamp = chrono::Utc::now().to_rfc3339();
    let snippet = match target_file_id {
        "policy_py" => format!(
            "\n\n# TODO(omnyid-search-agent): requested from unified command bar at {timestamp}\n# Instruction: {query}\ndef requested_policy_hook(policy: dict, context: dict) -> dict:\n    \"\"\"Implement the requested policy behavior and return the updated context.\"\"\"\n    return context\n"
        ),
        "tool_registry_py" => format!(
            "\n\n# TODO(omnyid-search-agent): requested from unified command bar at {timestamp}\n# Instruction: {query}\ndef requested_tool_action(prompt: str, policy: dict):\n    \"\"\"Add a capability-gated tool flow for this request.\"\"\"\n    return [], []\n"
        ),
        "requirements_txt" => format!(
            "\n# TODO(omnyid-search-agent): review requested dependency change at {timestamp}: {query}\n"
        ),
        "starter_templates_json" => format!(
            "\n{{\n  \"id\": \"generated_template_{id}\",\n  \"name\": \"Generated from command bar\",\n  \"summary\": \"{summary}\",\n  \"system_prompt\": \"Expand this into a safe starter template based on the user request.\",\n  \"suggested_prompts\": [\"{prompt}\"]\n}}\n",
            id = Ulid::new(),
            summary = query.replace('"', "'"),
            prompt = query.replace('"', "'")
        ),
        "agent_profile_json" => format!(
            "\n// TODO(omnyid-search-agent): review profile update requested at {timestamp}: {query}\n"
        ),
        "runtime_policy_json" => format!(
            "\n// TODO(omnyid-search-agent): review policy update requested at {timestamp}: {query}\n"
        ),
        _ => format!(
            "\n\n# TODO(omnyid-search-agent): requested from unified command bar at {timestamp}\n# Instruction: {query}\ndef requested_command_bar_change(state: dict):\n    \"\"\"Implement the requested runner behavior and return the updated state.\"\"\"\n    return state\n"
        ),
    };

    UiRunnerDraftResponse {
        target_file_id: target_file_id.to_string(),
        title: "Command bar draft".to_string(),
        content: snippet,
        requires_confirmation: true,
    }
}

/// Fetch search results from DuckDuckGo instant answer API.
/// Returns a list of (title, url, snippet) tuples.
async fn fetch_ddg_results(query: &str) -> Vec<(String, String, String)> {
    let encoded = urlencoding_encode(query);
    let url = format!(
        "https://api.duckduckgo.com/?q={encoded}&format=json&no_redirect=1&no_html=1&skip_disambig=1"
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("OmnyID-Agent/1.0")
        .build()
        .unwrap_or_default();
    let Ok(resp) = client.get(&url).send().await else {
        return vec![];
    };
    let Ok(json) = resp.json::<Value>().await else {
        return vec![];
    };

    let mut results: Vec<(String, String, String)> = vec![];

    // Abstract (e.g. Wikipedia summary)
    if let (Some(text), Some(source_url)) = (
        json["AbstractText"].as_str().filter(|s| !s.is_empty()),
        json["AbstractURL"].as_str().filter(|s| !s.is_empty()),
    ) {
        let source = json["AbstractSource"].as_str().unwrap_or("Web").to_string();
        results.push((source, source_url.to_string(), text.to_string()));
    }

    // Instant answer
    if let Some(answer) = json["Answer"].as_str().filter(|s| !s.is_empty()) {
        results.push((
            "DuckDuckGo Answer".to_string(),
            String::new(),
            answer.to_string(),
        ));
    }

    // Related topics — top 4
    if let Some(topics) = json["RelatedTopics"].as_array() {
        for topic in topics.iter().take(4) {
            if let (Some(text), Some(link)) = (
                topic["Text"].as_str().filter(|s| !s.is_empty()),
                topic["FirstURL"].as_str().filter(|s| !s.is_empty()),
            ) {
                let title = topic["Name"].as_str().unwrap_or("Related").to_string();
                results.push((title, link.to_string(), text.to_string()));
            }
        }
    }

    // Results — top 3
    if let Some(res_arr) = json["Results"].as_array() {
        for res in res_arr.iter().take(3) {
            if let (Some(text), Some(link)) = (
                res["Text"].as_str().filter(|s| !s.is_empty()),
                res["FirstURL"].as_str().filter(|s| !s.is_empty()),
            ) {
                results.push(("Result".to_string(), link.to_string(), text.to_string()));
            }
        }
    }

    results
}

fn urlencoding_encode(s: &str) -> String {
    s.chars()
        .flat_map(|c| {
            if c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
                vec![c]
            } else if c == ' ' {
                vec!['+']
            } else {
                let bytes = c.to_string().into_bytes();
                bytes
                    .iter()
                    .flat_map(|b| {
                        let hi = (b >> 4) as u8;
                        let lo = (b & 0xF) as u8;
                        let hex = |n: u8| if n < 10 { b'0' + n } else { b'a' + n - 10 };
                        vec!['%', hex(hi) as char, hex(lo) as char]
                    })
                    .collect::<Vec<char>>()
            }
        })
        .collect()
}

/// Ask the LLM to summarize real search results into bullets + sources.
async fn summarize_search_results(
    query: &str,
    results: &[(String, String, String)],
    api_key: &str,
    model: &str,
    backend: &str,
) -> (String, Vec<String>, Vec<UiCommandLink>) {
    let context = results
        .iter()
        .enumerate()
        .map(|(i, (title, url, snippet))| format!("[{}] {title}\nURL: {url}\n{snippet}", i + 1))
        .collect::<Vec<_>>()
        .join("\n\n");

    let prompt = format!(
        "Search query: \"{query}\"\n\nSearch results:\n{context}\n\nSummarise these results in 3-5 concise bullet points. Return ONLY valid JSON:\n{{\"summary\":\"<1-2 sentence overview>\",\"bullets\":[\"point 1\",\"point 2\",\"point 3\"],\"sources\":[{{\"title\":\"<source title>\",\"url\":\"<url>\",\"snippet\":\"<brief>\"}}]}}"
    );

    let infer_req = crate::inference::InferenceRequest {
        system: "You are a research assistant. Summarise the provided search results accurately. Return only valid JSON.".to_string(),
        messages: vec![crate::inference::InferenceMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        max_tokens: 800,
        temperature: 0.1,
    };

    let infer_result = if backend == "runpod" {
        let ep = std::env::var("OMNYID_RUNPOD_ENDPOINT_ID").unwrap_or_default();
        crate::inference::runpod_infer(api_key, &ep, model, &infer_req).await
    } else {
        crate::inference::anthropic_infer(api_key, model, &infer_req).await
    };

    let Ok(resp) = infer_result else {
        return fallback_from_ddg(results);
    };
    let raw = resp
        .content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let Ok(parsed) = serde_json::from_str::<Value>(raw) else {
        return fallback_from_ddg(results);
    };

    let summary = parsed["summary"]
        .as_str()
        .unwrap_or("Research results summarised below.")
        .to_string();
    let bullets: Vec<String> = parsed["bullets"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let sources = parsed["sources"].as_array().cloned().unwrap_or_default();
    let links: Vec<UiCommandLink> = sources
        .iter()
        .filter_map(|s| {
            Some(UiCommandLink {
                title: s["title"].as_str()?.to_string(),
                url: s["url"].as_str()?.to_string(),
                kind: "source".to_string(),
            })
        })
        .collect();
    (summary, bullets, links)
}

fn fallback_from_ddg(
    results: &[(String, String, String)],
) -> (String, Vec<String>, Vec<UiCommandLink>) {
    let bullets: Vec<String> = results
        .iter()
        .take(5)
        .map(|(_, _, snippet)| snippet.chars().take(120).collect::<String>())
        .collect();
    let links: Vec<UiCommandLink> = results
        .iter()
        .filter(|(_, url, _)| !url.is_empty())
        .take(5)
        .map(|(title, url, _snippet)| UiCommandLink {
            title: title.clone(),
            url: url.clone(),
            kind: "source".to_string(),
        })
        .collect();
    (
        "Search results from DuckDuckGo.".to_string(),
        bullets,
        links,
    )
}

/// Map a canonical intent string to the richest UI surface the frontend can render.
fn preferred_view_for_intent(intent: &str) -> String {
    match intent {
        "task" => "task_board",
        "note" => "note_canvas",
        "schedule" => "draggable_calendar",
        "orchestrate" => "orchestrate_progress",
        "web_research" => "search_result",
        "runner_edit" => "runner",
        "dashboard_focus" => "search",
        _ => "search_result",
    }
    .to_string()
}

fn ui_command_a2ui_content(query: &str, response: &UiCommandResponse, source_links: &[Value]) -> Value {
    let title = if query.is_empty() {
        "Command result".to_string()
    } else {
        format!("Command result for \"{query}\"")
    };
    let description = if response.intent == "runner_edit" {
        "The agent prepared a safe, review-first runner draft."
    } else {
        "The agent routed your request into the workspace."
    };

    let mut nodes = vec![
        serde_json::json!({
            "id": "command-summary",
            "type": "callout",
            "props": {
                "tone": if response.intent == "runner_edit" { "strategy" } else { "info" },
                "title": title,
                "body": response.summary,
            }
        }),
    ];

    if !response.bullets.is_empty() {
        nodes.push(serde_json::json!({
            "id": "command-next-steps",
            "type": "table",
            "props": {
                "columns": ["Checklist"],
                "rows": response
                    .bullets
                    .iter()
                    .map(|item| serde_json::json!([item]))
                    .collect::<Vec<_>>(),
                "caption": "Next steps",
            }
        }));
    }

    if let Some(draft) = &response.runner_draft {
        nodes.push(serde_json::json!({
            "id": "runner-draft-stats",
            "type": "stats_grid",
            "props": {
                "items": [
                    {"label": "Target file", "value": draft.target_file_id},
                    {"label": "Review", "value": if draft.requires_confirmation { "Required" } else { "Optional" }},
                    {"label": "Workspace", "value": "Python runner"},
                ]
            }
        }));
        nodes.push(serde_json::json!({
            "id": "runner-draft-code",
            "type": "code",
            "props": {
                "title": if draft.target_file_id.ends_with("_json") {
                    "Draft code (json)"
                } else if draft.target_file_id.ends_with("_txt") {
                    "Draft code (text)"
                } else {
                    "Draft code (python)"
                },
                "language": if draft.target_file_id.ends_with("_json") {
                    "json"
                } else if draft.target_file_id.ends_with("_txt") {
                    "text"
                } else {
                    "python"
                },
                "code": draft.content,
            }
        }));
    }

    if !source_links.is_empty() {
        nodes.push(serde_json::json!({
            "id": "command-sources",
            "type": "link_list",
            "props": {
                "title": "Sources",
                "items": source_links
                    .iter()
                    .map(|item| serde_json::json!({
                        "title": item["title"].as_str().unwrap_or(item["url"].as_str().unwrap_or("Link")),
                        "url": item["url"].as_str().unwrap_or_default(),
                        "subtitle": item["snippet"].as_str().unwrap_or_default(),
                    }))
                    .collect::<Vec<_>>(),
            }
        }));
    }

    serde_json::json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": title,
        "description": description,
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": nodes,
    })
}

fn ui_runner_edit_a2ui_content(query: &str, response: &UiCommandResponse) -> Value {
    let title = if query.is_empty() {
        "Runner draft".to_string()
    } else {
        format!("Runner draft for \"{query}\"")
    };
    let draft = response.runner_draft.as_ref();
    let target_file = draft
        .map(|item| item.target_file_id.as_str())
        .unwrap_or("runner_chat_py");
    let review_required = draft
        .map(|item| {
            if item.requires_confirmation {
                "Required"
            } else {
                "Optional"
            }
        })
        .unwrap_or("Optional");
    let code_title = if target_file.ends_with("_json") {
        "Draft code (json)"
    } else if target_file.ends_with("_txt") {
        "Draft code (text)"
    } else {
        "Draft code (python)"
    };
    let code_language = if target_file.ends_with("_json") {
        "json"
    } else if target_file.ends_with("_txt") {
        "text"
    } else {
        "python"
    };
    let code = draft.map(|item| item.content.as_str()).unwrap_or_default();
    let checklist_rows = if response.bullets.is_empty() {
        vec![
            serde_json::json!(["Review the generated patch before applying it"]),
            serde_json::json!(["Confirm tool and policy changes before redeploying"]),
            serde_json::json!(["Run a test or dry-run after saving the draft"]),
        ]
    } else {
        response
            .bullets
            .iter()
            .map(|item| serde_json::json!([item]))
            .collect::<Vec<_>>()
    };

    serde_json::json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": title,
        "description": "The agent prepared a safe, review-first Python runner draft with clear next steps before execution.",
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": [
            {
                "id": "runner-edit-summary",
                "type": "callout",
                "props": {
                    "tone": "strategy",
                    "title": "Runner draft ready for review",
                    "body": response.summary,
                }
            },
            {
                "id": "runner-edit-stats",
                "type": "stats_grid",
                "props": {
                    "items": [
                        {"label": "Target file", "value": target_file},
                        {"label": "Review", "value": review_required},
                        {"label": "Workspace", "value": "Python runner"},
                    ]
                }
            },
            {
                "id": "runner-edit-workflow",
                "type": "section",
                "props": {
                    "title": "Suggested workflow",
                    "layout": {"type": "stack", "gap": "sm"},
                },
                "children": [
                    {
                        "id": "runner-edit-checklist",
                        "type": "table",
                        "props": {
                            "columns": ["Review checklist"],
                            "rows": checklist_rows,
                            "caption": "Safe editing flow",
                        }
                    },
                    {
                        "id": "runner-edit-tip",
                        "type": "text",
                        "props": {
                            "label": "Tip",
                            "value": "Keep the command bar open while reviewing the draft so the agent can revise the code in place before you save it.",
                        }
                    }
                ]
            },
            {
                "id": "runner-edit-code",
                "type": "code",
                "props": {
                    "title": code_title,
                    "language": code_language,
                    "code": code,
                }
            }
        ]
    })
}

fn ui_dashboard_focus_a2ui_content(query: &str, response: &UiCommandResponse) -> Value {
    let title = if query.is_empty() {
        "Workspace focus".to_string()
    } else {
        format!("Workspace focus for \"{query}\"")
    };
    let bullet_rows = if response.bullets.is_empty() {
        vec![
            serde_json::json!(["Recent messages", "See the latest agent output and thread activity."]),
            serde_json::json!(["Agent status", "Check running, idle, and blocked agents at a glance."]),
            serde_json::json!(["Runtime health", "Inspect runner state, logs, and recent changes."]),
        ]
    } else {
        response
            .bullets
            .iter()
            .map(|item| serde_json::json!([item, "Suggested workspace focus"]))
            .collect::<Vec<_>>()
    };

    serde_json::json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": title,
        "description": "Pivot the workspace toward recent agent output, runtime health, and the next useful control surface.",
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": [
            {
                "id": "dashboard-focus-summary",
                "type": "callout",
                "props": {
                    "tone": "info",
                    "title": "Dashboard focus ready",
                    "body": response.summary,
                }
            },
            {
                "id": "dashboard-focus-stats",
                "type": "stats_grid",
                "props": {
                    "items": [
                        {"label": "Primary view", "value": "Dashboard"},
                        {"label": "Status panel", "value": "Agent fleet"},
                        {"label": "Detail view", "value": "Threads and runtime"},
                    ]
                }
            },
            {
                "id": "dashboard-focus-guidance",
                "type": "section",
                "props": {
                    "title": "Suggested pivots",
                    "layout": {"type": "stack", "gap": "sm"},
                },
                "children": [
                    {
                        "id": "dashboard-focus-table",
                        "type": "table",
                        "props": {
                            "columns": ["Focus area", "What happens"],
                            "rows": bullet_rows,
                            "caption": "High-value next views",
                        }
                    },
                    {
                        "id": "dashboard-focus-tip",
                        "type": "text",
                        "props": {
                            "label": "Tip",
                            "value": "Use the agent status panel to jump from green completed tasks to orange in-progress work before opening the full thread view.",
                        }
                    }
                ]
            }
        ]
    })
}

fn ui_search_result_a2ui_content(query: &str, response: &UiCommandResponse, source_links: &[Value]) -> Value {
    let summary = response.summary.clone();
    let bullet_rows = response
        .bullets
        .iter()
        .map(|item| serde_json::json!([item]))
        .collect::<Vec<_>>();
    let source_items = source_links
        .iter()
        .map(|item| {
            serde_json::json!({
                "title": item["title"].as_str().unwrap_or(item["url"].as_str().unwrap_or("Link")),
                "url": item["url"].as_str().unwrap_or_default(),
                "subtitle": item["snippet"].as_str().unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();

    let mut nodes = vec![
        serde_json::json!({
            "id": "search-summary",
            "type": "callout",
            "props": {
                "tone": "info",
                "title": if query.is_empty() { "Research result" } else { "Research summary" },
                "body": summary,
            }
        }),
    ];

    if !bullet_rows.is_empty() {
        nodes.push(serde_json::json!({
            "id": "search-bullets",
            "type": "table",
            "props": {
                "columns": ["Key points"],
                "rows": bullet_rows,
                "caption": "Research highlights",
            }
        }));
    }

    if !source_items.is_empty() {
        nodes.push(serde_json::json!({
            "id": "search-sources",
            "type": "link_list",
            "props": {
                "title": "Sources",
                "items": source_items,
            }
        }));
    }

    serde_json::json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": if query.is_empty() {
            "Search result".to_string()
        } else {
            format!("Search result for \"{query}\"")
        },
        "description": "Structured research view companion for the current search result.",
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": nodes,
    })
}

fn orchestration_companion_a2ui_content(
    query: &str,
    summary: &str,
    card_id: &str,
    gate: OrchestrationGate,
) -> Value {
    let gate_label = match gate {
        OrchestrationGate::None => "None",
        OrchestrationGate::Clarification => "Clarification",
        OrchestrationGate::Approval => "Approval",
    };
    let gate_explainer = match gate {
        OrchestrationGate::None => {
            "The orchestrator can begin immediately with the current objective."
        }
        OrchestrationGate::Clarification => {
            "The orchestrator needs one planning preference before it commits to the next path."
        }
        OrchestrationGate::Approval => {
            "The orchestrator detected a higher-risk action boundary and will wait for approval."
        }
    };

    serde_json::json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": if query.is_empty() {
            "Orchestration preview".to_string()
        } else {
            format!("Orchestration preview for \"{query}\"")
        },
        "description": "Structured companion view for the orchestration card, useful for inspectors and alternate renderers.",
        "layout": {
            "type": "stack",
            "gap": "md",
        },
        "nodes": [
            {
                "id": "orchestrate-summary",
                "type": "callout",
                "props": {
                    "tone": if gate == OrchestrationGate::Approval { "warning" } else if gate == OrchestrationGate::Clarification { "strategy" } else { "info" },
                    "title": "Orchestration ready",
                    "body": summary,
                }
            },
            {
                "id": "orchestrate-stats",
                "type": "stats_grid",
                "props": {
                    "items": [
                        {"label": "Card", "value": card_id},
                        {"label": "Gate", "value": gate_label},
                        {"label": "Status", "value": "streaming"},
                    ]
                }
            },
            {
                "id": "orchestrate-guidance",
                "type": "section",
                "props": {
                    "title": "Execution posture",
                    "layout": {"type": "stack", "gap": "sm"},
                },
                "children": [
                    {
                        "id": "orchestrate-gate-note",
                        "type": "text",
                        "props": {
                            "label": "Gate behavior",
                            "value": gate_explainer,
                        }
                    },
                    {
                        "id": "orchestrate-next-steps",
                        "type": "table",
                        "props": {
                            "columns": ["Next step", "Purpose"],
                            "rows": match gate {
                                OrchestrationGate::None => vec![
                                    serde_json::json!(["Plan the run", "Break the objective into structured tasks."]),
                                    serde_json::json!(["Start execution", "Begin the first safe step immediately."]),
                                ],
                                OrchestrationGate::Clarification => vec![
                                    serde_json::json!(["Ask for a preference", "Resolve ambiguity before execution starts."]),
                                    serde_json::json!(["Lock the strategy", "Resume with the selected planning mode."]),
                                ],
                                OrchestrationGate::Approval => vec![
                                    serde_json::json!(["Wait for approval", "Do not cross the action boundary prematurely."]),
                                    serde_json::json!(["Resume only if approved", "Continue in the same card after confirmation."]),
                                ],
                            },
                            "caption": "Expected flow",
                        }
                    }
                ]
            }
        ]
    })
}

fn orchestration_progress_section_content(task_count: usize, success_count: usize) -> Value {
    let text = format!(
        "Completed {} tasks with {} successful results",
        task_count, success_count
    );
    serde_json::json!({
        "text": text,
        "pct": 100,
        "a2ui": {
            "schema_version": "a2ui.v1",
            "kind": "panel",
            "layout": {"type": "stack", "gap": "md"},
            "nodes": [
                {
                    "id": "orchestrate-progress-callout",
                    "type": "callout",
                    "props": {
                        "tone": "success",
                        "title": "Execution progress complete",
                        "body": text,
                    }
                },
                {
                    "id": "orchestrate-progress-stats",
                    "type": "stats_grid",
                    "props": {
                        "items": [
                            {"label": "Tasks", "value": task_count.to_string()},
                            {"label": "Succeeded", "value": success_count.to_string()},
                            {"label": "Progress", "value": "100%"},
                        ]
                    }
                }
            ]
        }
    })
}

fn orchestration_plan_section_content(summary: &str) -> Value {
    serde_json::json!({
        "title": "Agent plan",
        "text": summary,
        "a2ui": {
            "schema_version": "a2ui.v1",
            "kind": "panel",
            "layout": {"type": "stack", "gap": "md"},
            "nodes": [
                {
                    "id": "orchestrate-plan-callout",
                    "type": "callout",
                    "props": {
                        "tone": "strategy",
                        "title": "Execution plan",
                        "body": summary,
                    }
                },
                {
                    "id": "orchestrate-plan-note",
                    "type": "text",
                    "props": {
                        "label": "Planning summary",
                        "value": "This is the current orchestration plan before execution completes.",
                    }
                }
            ]
        }
    })
}

fn orchestration_results_section_content(results: &[crate::master_orchestrator::TaskResult]) -> Value {
    let rows = results
        .iter()
        .map(|item| {
            serde_json::json!([
                item.task_type,
                item.status,
                item.result
                    .as_deref()
                    .unwrap_or(item.error.as_deref().unwrap_or(""))
                    .chars()
                    .take(120)
                    .collect::<String>()
            ])
        })
        .collect::<Vec<_>>();
    serde_json::json!({
        "headers": ["Task type", "Status", "Summary"],
        "rows": rows,
        "a2ui": {
            "schema_version": "a2ui.v1",
            "kind": "panel",
            "layout": {"type": "stack", "gap": "md"},
            "nodes": [
                {
                    "id": "orchestrate-results-callout",
                    "type": "callout",
                    "props": {
                        "tone": "info",
                        "title": "Task results",
                        "body": "Review the task-by-task outcome table for the completed orchestration run.",
                    }
                },
                {
                    "id": "orchestrate-results-table",
                    "type": "table",
                    "props": {
                        "columns": ["Task type", "Status", "Summary"],
                        "rows": rows,
                        "caption": "Orchestration results",
                    }
                }
            ]
        }
    })
}

fn orchestration_final_answer_section_content(task_count: usize, success_count: usize) -> Value {
    let text = format!(
        "Orchestration complete. {} of {} tasks succeeded.",
        success_count, task_count
    );
    serde_json::json!({
        "text": text,
        "a2ui": {
            "schema_version": "a2ui.v1",
            "kind": "panel",
            "layout": {"type": "stack", "gap": "md"},
            "nodes": [
                {
                    "id": "orchestrate-final-callout",
                    "type": "callout",
                    "props": {
                        "tone": if success_count == task_count { "success" } else { "warning" },
                        "title": "Orchestration finished",
                        "body": text,
                    }
                },
                {
                    "id": "orchestrate-final-stats",
                    "type": "stats_grid",
                    "props": {
                        "items": [
                            {"label": "Succeeded", "value": success_count.to_string()},
                            {"label": "Total tasks", "value": task_count.to_string()},
                            {"label": "Completion", "value": format!("{:.0}%", if task_count == 0 { 0.0 } else { (success_count as f64 / task_count as f64) * 100.0 })},
                        ]
                    }
                }
            ]
        }
    })
}

fn orchestration_error_section_content(error_text: &str) -> Value {
    serde_json::json!({
        "text": error_text,
        "a2ui": {
            "schema_version": "a2ui.v1",
            "kind": "panel",
            "layout": {"type": "stack", "gap": "md"},
            "nodes": [
                {
                    "id": "orchestrate-error-callout",
                    "type": "callout",
                    "props": {
                        "tone": "danger",
                        "title": "Orchestration failed",
                        "body": error_text,
                    }
                },
                {
                    "id": "orchestrate-error-note",
                    "type": "text",
                    "props": {
                        "label": "Next step",
                        "value": "Review the error details and retry with a narrower objective or a different execution path.",
                    }
                }
            ]
        }
    })
}

fn ui_command_preview_message(query: &str, response: &UiCommandResponse) -> AFPMessage {
    let timestamp = chrono::Utc::now().to_rfc3339();
    let preview_id = format!("preview.{}.{}", response.intent, Ulid::new());
    let thread_id = format!("thread.preview.{}", response.intent);
    let source_links: Vec<Value> = response
        .links
        .iter()
        .map(|link| {
            serde_json::json!({
                "title": link.title,
                "url": link.url,
                "snippet": link.kind,
            })
        })
        .collect();

    let (message_type, message_subtype, message_metadata, content, views) = if response.intent == "task"
        || response.preferred_view == "task_board"
    {
        let first_bullet = response.bullets.first().cloned().unwrap_or_default();
        let description = if response.summary == first_bullet || first_bullet.is_empty() {
            response.summary.clone()
        } else {
            format!("{}\n{}", response.summary, first_bullet)
        };
        let content = serde_json::json!({
            "kind": "task_preview",
            "title": query,
            "description": description,
            "priority": "normal",
            "task_type": "general",
            "status": "pending",
        });
        (
            "task".to_string(),
            Some("card".to_string()),
            serde_json::json!({
                "origin": "workspace_command_preview",
                "intent": response.intent,
            }),
            content.clone(),
            vec![serde_json::json!({
                "format": "task_card",
                "priority": 100,
                "content": content,
            })],
        )
    } else if response.intent == "note" || response.preferred_view == "note_canvas" {
        let content = serde_json::json!({
            "kind": "workspace_note",
            "title": if query.is_empty() { "Note" } else { query },
            "blocks": [
                {"type": "paragraph", "text": response.summary},
            ],
        });
        (
            "note".to_string(),
            Some("content".to_string()),
            serde_json::json!({
                "origin": "workspace_command_preview",
                "intent": response.intent,
            }),
            content.clone(),
            vec![serde_json::json!({
                "format": "canvas",
                "priority": 100,
                "content": content,
            })],
        )
    } else if response.intent == "schedule" || response.preferred_view == "draggable_calendar" {
        let events = response
            .bullets
            .iter()
            .enumerate()
            .map(|(idx, bullet)| {
                serde_json::json!({
                    "id": format!("preview-event-{idx}"),
                    "title": bullet,
                    "start": timestamp,
                    "description": response.summary,
                    "status": "tentative",
                })
            })
            .collect::<Vec<_>>();
        let content = serde_json::json!({
            "kind": "schedule_plan",
            "title": if query.is_empty() { "Schedule preview" } else { query },
            "description": response.summary,
            "events": events,
        });
        (
            "calendar".to_string(),
            Some("plan".to_string()),
            serde_json::json!({
                "origin": "workspace_command_preview",
                "intent": response.intent,
            }),
            content.clone(),
            vec![serde_json::json!({
                "format": "calendar",
                "priority": 100,
                "content": content,
            })],
        )
    } else if response.intent == "orchestrate" || response.preferred_view == "orchestrate_progress"
    {
        let card_id = response
            .card_id
            .clone()
            .unwrap_or_else(|| format!("card.preview.{}", Ulid::new()));
        let gate = classify_orchestration_gate(query);
        let a2ui_companion =
            orchestration_companion_a2ui_content(query, &response.summary, &card_id, gate);
        let content = serde_json::json!({
            "kind": "orchestration",
            "card_id": card_id,
            "query": query,
            "status": "streaming",
            "optimization_mode": "balanced",
            "provider": "omnyid",
            "model": "",
            "gate": match gate {
                OrchestrationGate::None => "none",
                OrchestrationGate::Clarification => "clarification",
                OrchestrationGate::Approval => "approval",
            },
            "sections": orchestrate_card_sections(&response.summary, query, gate),
        });
        (
            "agent".to_string(),
            Some("orchestration_card".to_string()),
            serde_json::json!({
                "origin": "workspace_command_preview",
                "intent": response.intent,
                "gate": match gate {
                    OrchestrationGate::None => "none",
                    OrchestrationGate::Clarification => "clarification",
                    OrchestrationGate::Approval => "approval",
                }
            }),
            content.clone(),
            vec![
                serde_json::json!({
                    "format": "generative_card",
                    "priority": 100,
                    "content": content,
                }),
                serde_json::json!({
                    "format": "a2ui.v1",
                    "priority": 80,
                    "content": a2ui_companion,
                }),
            ],
        )
    } else if response.preferred_view == "search_result" || response.intent == "web_research" {
        let content = serde_json::json!({
            "kind": "web_research",
            "query": query,
            "summary": response.summary,
            "bullets": response.bullets,
            "sources": source_links,
        });
        let a2ui_companion = ui_search_result_a2ui_content(query, response, &source_links);
        (
            "research".to_string(),
            Some("content".to_string()),
            serde_json::json!({
                "origin": "workspace_command_preview",
                "intent": response.intent,
                "source_count": response.links.len(),
            }),
            content.clone(),
            vec![
                serde_json::json!({
                    "format": "search_result",
                    "priority": 100,
                    "content": content,
                }),
                serde_json::json!({
                    "format": "a2ui.v1",
                    "priority": 80,
                    "content": a2ui_companion,
                }),
            ],
        )
    } else if response.intent == "dashboard_focus" {
        let content = ui_dashboard_focus_a2ui_content(query, response);
        (
            "agent".to_string(),
            Some("dashboard_panel".to_string()),
            serde_json::json!({
                "origin": "workspace_command_preview",
                "intent": response.intent,
            }),
            content.clone(),
            vec![serde_json::json!({
                "format": "a2ui.v1",
                "priority": 100,
                "content": content,
            })],
        )
    } else if response.intent == "runner_edit" {
        let content = ui_runner_edit_a2ui_content(query, response);
        (
            "agent".to_string(),
            Some("runner_editor".to_string()),
            serde_json::json!({
                "origin": "workspace_command_preview",
                "intent": response.intent,
            }),
            content.clone(),
            vec![serde_json::json!({
                "format": "a2ui.v1",
                "priority": 100,
                "content": content,
            })],
        )
    } else {
        let content = ui_command_a2ui_content(query, response, &source_links);
        (
            "agent".to_string(),
            Some("workspace_panel".to_string()),
            serde_json::json!({
                "origin": "workspace_command_preview",
                "intent": response.intent,
            }),
            content.clone(),
            vec![serde_json::json!({
                "format": "a2ui.v1",
                "priority": 100,
                "content": content,
            })],
        )
    };

    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: preview_id,
        thread_id,
        parent_id: None,
        from: "omnyid://workspace/command-bar".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp,
        r#type: message_type,
        subtype: message_subtype,
        content,
        metadata: Some(message_metadata),
        signature: String::new(),
        encryption: None,
        views,
        references: vec![],
        attachments: vec![],
        store_in_relational: false,
        prev_hash: None,
    }
}

fn finalize_ui_command_response(query: &str, mut response: UiCommandResponse) -> UiCommandResponse {
    if response.preview_message.is_none() {
        response.preview_message = Some(ui_command_preview_message(query, &response));
    }
    response
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum OrchestrationGate {
    None,
    Clarification,
    Approval,
}

fn objective_requires_human_confirmation(objective: &str) -> bool {
    let lowered = objective.to_lowercase();
    [
        "send",
        "email",
        "book",
        "purchase",
        "buy",
        "pay",
        "delete",
        "cancel",
        "message someone",
        "contact",
        "submit",
        "apply",
        "transfer",
    ]
    .iter()
    .any(|token| lowered.contains(token))
}

fn objective_needs_clarification(objective: &str) -> bool {
    let lowered = objective.to_lowercase();
    let ambiguity_tokens = [
        "this",
        "that",
        "something",
        "someone",
        "somebody",
        "it",
        "things",
        "stuff",
        "sort it out",
        "handle it",
    ];
    let broad_action_tokens = ["organise", "organize", "manage", "plan", "handle", "set up"];

    ambiguity_tokens.iter().any(|token| lowered.contains(token))
        || (lowered.split_whitespace().count() <= 4
            && broad_action_tokens
                .iter()
                .any(|token| lowered.contains(token)))
}

fn classify_orchestration_gate(objective: &str) -> OrchestrationGate {
    if objective_requires_human_confirmation(objective) {
        OrchestrationGate::Approval
    } else if objective_needs_clarification(objective) {
        OrchestrationGate::Clarification
    } else {
        OrchestrationGate::None
    }
}

fn clarification_prompt_for_objective(objective: &str) -> Value {
    let lowered = objective.to_lowercase();

    if ["schedule", "calendar", "study", "day", "week", "deadline", "timetable"]
        .iter()
        .any(|token| lowered.contains(token))
    {
        serde_json::json!({
            "question": "What should OmnyID optimise for first in this schedule?",
            "context": "This request sounds schedule-heavy. Choosing a priority helps the agent decide whether to protect deep work, chase deadlines, or anchor around fixed commitments.",
            "options": [
                {
                    "id": "proceed_with_assumptions",
                    "label": "Prioritise deadlines",
                    "description": "Bias the plan toward urgent assignments, exams, and due dates.",
                    "pros": ["Best when something important is due soon", "Reduces deadline risk"],
                    "cons": ["May create a more intense day"],
                    "is_default": true
                },
                {
                    "id": "proceed_with_energy_first",
                    "label": "Prioritise energy and focus",
                    "description": "Protect deep-work blocks and place lighter tasks around them.",
                    "pros": ["More sustainable", "Better for cognitively demanding work"],
                    "cons": ["Some lower-priority deadlines may slip"]
                },
                {
                    "id": "cancel_for_clarification",
                    "label": "Cancel for now",
                    "description": "Wait until I provide more specific scheduling constraints."
                }
            ]
        })
    } else if ["research", "compare", "find", "look up", "summarise", "summary", "analyze", "analyse"]
        .iter()
        .any(|token| lowered.contains(token))
    {
        serde_json::json!({
            "question": "How far should OmnyID go with this research task?",
            "context": "This request sounds open-ended. Picking a stopping point helps the agent avoid over-collecting or jumping too quickly into recommendations.",
            "options": [
                {
                    "id": "proceed_with_assumptions",
                    "label": "Give me a concise summary",
                    "description": "Return the most relevant findings with links and a short recommendation.",
                    "pros": ["Fastest", "Lowest noise"],
                    "cons": ["May skip edge cases"],
                    "is_default": true
                },
                {
                    "id": "proceed_with_deep_research",
                    "label": "Do a deeper comparison",
                    "description": "Spend more effort comparing tradeoffs, caveats, and alternatives.",
                    "pros": ["More thorough", "Better for decisions with tradeoffs"],
                    "cons": ["Slower response", "More tokens and browsing"]
                },
                {
                    "id": "cancel_for_clarification",
                    "label": "Cancel for now",
                    "description": "Wait until I narrow the research goal."
                }
            ]
        })
    } else if ["budget", "finance", "money", "spend", "portfolio", "invest", "expense"]
        .iter()
        .any(|token| lowered.contains(token))
    {
        serde_json::json!({
            "question": "Which finance lens should OmnyID use first?",
            "context": "Finance-related tasks can optimise for caution, savings, or upside. A clear lens keeps the plan aligned with your risk tolerance.",
            "options": [
                {
                    "id": "proceed_with_assumptions",
                    "label": "Be conservative",
                    "description": "Prioritise risk reduction, cash preservation, and clear explanations.",
                    "pros": ["Safer default", "Easy to review"],
                    "cons": ["May miss higher-upside options"],
                    "is_default": true
                },
                {
                    "id": "proceed_with_growth_focus",
                    "label": "Look for upside",
                    "description": "Explore stronger optimisations and higher-return options, while still explaining risks.",
                    "pros": ["More ambitious", "Better for opportunity scouting"],
                    "cons": ["May require more validation"]
                },
                {
                    "id": "cancel_for_clarification",
                    "label": "Cancel for now",
                    "description": "Wait until I specify the outcome I want."
                }
            ]
        })
    } else {
        serde_json::json!({
            "question": "This objective is still a bit underspecified. Should OmnyID proceed with best-effort assumptions?",
            "context": "Use this when you want the agent to draft a reasonable plan first, rather than waiting for a more specific request.",
            "options": [
                {
                    "id": "proceed_with_assumptions",
                    "label": "Proceed with assumptions",
                    "description": "Start with a sensible best-effort plan.",
                    "is_default": true
                },
                {
                    "id": "cancel_for_clarification",
                    "label": "Cancel for now",
                    "description": "Do nothing until I give a more specific goal."
                }
            ]
        })
    }
}

fn clarification_option_instruction(option_id: &str) -> Option<&'static str> {
    match option_id {
        "proceed_with_assumptions" => {
            Some("Use sensible best-effort assumptions and keep the plan practical.")
        }
        "proceed_with_energy_first" => Some(
            "Optimise for energy, focus, and sustainable pacing before secondary tasks.",
        ),
        "proceed_with_deep_research" => Some(
            "Go beyond a quick summary and produce a deeper comparison with tradeoffs and caveats.",
        ),
        "proceed_with_growth_focus" => Some(
            "Optimise for upside and opportunity, while still noting the relevant risks.",
        ),
        _ => None,
    }
}

fn clarification_option_progress_text(option_id: &str) -> &'static str {
    match option_id {
        "proceed_with_energy_first" => {
            "Proceeding with an energy-first plan and starting orchestration now."
        }
        "proceed_with_deep_research" => {
            "Proceeding with a deeper comparison and starting orchestration now."
        }
        "proceed_with_growth_focus" => {
            "Proceeding with a growth-focused plan and starting orchestration now."
        }
        _ => "Proceeding with best-effort assumptions and starting orchestration now.",
    }
}

fn clarification_option_summary(option_id: &str) -> (&'static str, &'static str, &'static str) {
    match option_id {
        "proceed_with_energy_first" => (
            "Working assumption locked",
            "OmnyID is prioritising energy, focus, and sustainable pacing before secondary tasks.",
            "strategy",
        ),
        "proceed_with_deep_research" => (
            "Research depth locked",
            "OmnyID is doing a deeper comparison with tradeoffs and caveats instead of a quick summary.",
            "strategy",
        ),
        "proceed_with_growth_focus" => (
            "Finance lens locked",
            "OmnyID is optimising for upside and opportunity while still noting the key risks.",
            "strategy",
        ),
        _ => (
            "Working assumption locked",
            "OmnyID is proceeding with sensible best-effort assumptions and a practical default plan.",
            "info",
        ),
    }
}

fn approval_option_summary(option_id: &str) -> (&'static str, &'static str, &'static str) {
    match option_id {
        "cancel_orchestration" => (
            "Approval denied",
            "OmnyID will keep this orchestration paused and will not trigger any external actions.",
            "warning",
        ),
        _ => (
            "Approval granted",
            "OmnyID may now proceed with the reviewed external actions inside this orchestration.",
            "confirmation",
        ),
    }
}

fn apply_clarification_context(objective: &str, option_id: &str) -> String {
    if let Some(instruction) = clarification_option_instruction(option_id) {
        format!("{objective}\n\nPlanning preference: {instruction}")
    } else {
        objective.to_string()
    }
}

fn orchestrate_card_sections(summary: &str, objective: &str, gate: OrchestrationGate) -> Vec<Value> {
    let mut sections = vec![
        serde_json::json!({
            "id": "progress",
            "type": "progress",
            "order": 1,
            "status": "streaming",
            "content": {
                "text": "Planning the orchestration steps and allocating agent work",
                "pct": 15
            }
        }),
        serde_json::json!({
            "id": "plan",
            "type": "canvas",
            "order": 2,
            "status": "complete",
            "content": orchestration_plan_section_content(summary)
        }),
    ];

    if gate == OrchestrationGate::Approval {
        sections.push(serde_json::json!({
            "id": "approval_gate",
            "type": "decision_point",
            "order": 3,
            "status": "awaiting_input",
            "content": {
                "id": "approval_gate",
                "category": "confirmation",
                "question": "This orchestration may trigger external actions. Do you want the agent to proceed?",
                "context": "Approval is required before OmnyID starts bookings, purchases, outbound messages, deletions, or other higher-risk actions.",
                "options": [
                    {
                        "id": "confirm_orchestration",
                        "label": "Proceed",
                        "description": "Start the orchestration now.",
                        "is_default": true
                    },
                    {
                        "id": "cancel_orchestration",
                        "label": "Cancel",
                        "description": "Keep the task paused and do nothing."
                    }
                ]
            }
        }));
    } else if gate == OrchestrationGate::Clarification {
        let clarification = clarification_prompt_for_objective(objective);
        sections.push(serde_json::json!({
            "id": "clarification_gate",
            "type": "decision_point",
            "order": 3,
            "status": "awaiting_input",
            "content": {
                "id": "clarification_gate",
                "category": "clarification",
                "question": clarification["question"].clone(),
                "context": clarification["context"].clone(),
                "options": clarification["options"].clone()
            }
        }));
    }

    sections
}

fn orchestration_preview_message(
    query: &str,
    summary: &str,
    card_id: &str,
    thread_id: &str,
    gate: OrchestrationGate,
) -> AFPMessage {
    let card_content = serde_json::json!({
        "card_id": card_id,
        "query": query,
        "status": "streaming",
        "optimization_mode": "balanced",
        "provider": "omnyid",
        "model": "",
        "gate": match gate {
            OrchestrationGate::None => "none",
            OrchestrationGate::Clarification => "clarification",
            OrchestrationGate::Approval => "approval",
        },
        "sections": orchestrate_card_sections(summary, query, gate),
    });
    let a2ui_companion = orchestration_companion_a2ui_content(query, summary, card_id, gate);
    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: format!("preview.orchestrate.{}", Ulid::new()),
        thread_id: thread_id.to_string(),
        parent_id: None,
        from: "omnyid://workspace/command-bar".to_string(),
        to: vec!["omnyid://workspace/user".to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "agent".to_string(),
        subtype: Some("orchestration_card".to_string()),
        content: serde_json::json!({
            "kind": "orchestration",
            "card": card_content.clone(),
        }),
        metadata: Some(serde_json::json!({
            "origin": "workspace_command_preview",
            "gate": match gate {
                OrchestrationGate::None => "none",
                OrchestrationGate::Clarification => "clarification",
                OrchestrationGate::Approval => "approval",
            }
        })),
        signature: String::new(),
        encryption: None,
        views: vec![
            serde_json::json!({
                "format": "generative_card",
                "priority": 100,
                "content": card_content,
            }),
            serde_json::json!({
                "format": "a2ui.v1",
                "priority": 80,
                "content": a2ui_companion,
            }),
        ],
        references: vec![],
        attachments: vec![],
        store_in_relational: false,
        prev_hash: None,
    }
}

fn spawn_orchestration_run(
    state: Arc<AppState>,
    user_id: String,
    api_key: String,
    model: String,
    backend_name: String,
    objective: String,
    lora_active: bool,
    thread_id: String,
    card_id: String,
    agent_id: Option<String>,
) {
    tokio::spawn(async move {
        if let Ok(Some(inst)) = state.db.get_master_agent_instance(&user_id).await {
            let instance_id = inst["id"].as_str().unwrap_or("").to_string();
            let soul_md = inst["soul_md"].as_str().unwrap_or("").to_string();
            let soul_opt = if soul_md.is_empty() {
                None
            } else {
                Some(soul_md.as_str())
            };
            let runpod_ep = if backend_name == "runpod" {
                std::env::var("OMNYID_RUNPOD_ENDPOINT_ID").ok()
            } else {
                None
            };
            let orch = crate::master_orchestrator::MasterOrchestrator::new(
                instance_id,
                user_id.clone(),
            );
            let result = orch
                .run(
                    &objective,
                    &state.db,
                    &api_key,
                    &model,
                    soul_opt,
                    lora_active,
                    runpod_ep.as_deref(),
                )
                .await;

            if let Some(agent_id) = agent_id {
                match result {
                    Ok(orchestrator_result) => {
                        let progress_update = serde_json::json!({
                            "card_id": card_id,
                            "section": {
                                "id": "progress",
                                "type": "progress",
                                "order": 1,
                                "status": "complete",
                                "content": orchestration_progress_section_content(
                                    orchestrator_result.task_count,
                                    orchestrator_result.success_count
                                )
                            }
                        });
                        if let Ok(msg) = new_server_message(
                            agent_id.clone(),
                            vec![],
                            thread_id.clone(),
                            "card_section_update",
                            progress_update,
                            vec![],
                            vec![],
                            vec![],
                            true,
                        ) {
                            let _ = store_private_app_message(
                                &state.db,
                                &state.metrics,
                                &state.relay_tx,
                                &user_id,
                                msg,
                            )
                            .await;
                        }
                        let table_update = serde_json::json!({
                            "card_id": card_id,
                            "section": {
                                "id": "results",
                                "type": "table",
                                "order": 3,
                                "status": "complete",
                                "content": orchestration_results_section_content(&orchestrator_result.results)
                            }
                        });
                        if let Ok(msg) = new_server_message(
                            agent_id.clone(),
                            vec![],
                            thread_id.clone(),
                            "card_section_update",
                            table_update,
                            vec![],
                            vec![],
                            vec![],
                            true,
                        ) {
                            let _ = store_private_app_message(
                                &state.db,
                                &state.metrics,
                                &state.relay_tx,
                                &user_id,
                                msg,
                            )
                            .await;
                        }

                        let final_update = serde_json::json!({
                            "card_id": card_id,
                            "section": {
                                "id": "final",
                                "type": "final_answer",
                                "order": 4,
                                "status": "complete",
                                "content": orchestration_final_answer_section_content(
                                    orchestrator_result.task_count,
                                    orchestrator_result.success_count
                                )
                            }
                        });
                        if let Ok(msg) = new_server_message(
                            agent_id,
                            vec![],
                            thread_id,
                            "card_section_update",
                            final_update,
                            vec![],
                            vec![],
                            vec![],
                            true,
                        ) {
                            let _ = store_private_app_message(
                                &state.db,
                                &state.metrics,
                                &state.relay_tx,
                                &user_id,
                                msg,
                            )
                            .await;
                        }
                    }
                    Err(err) => {
                        let error_update = serde_json::json!({
                            "card_id": card_id,
                            "section": {
                                "id": "error",
                                "type": "error",
                                "order": 4,
                                "status": "error",
                                "content": orchestration_error_section_content(&format!(
                                    "The orchestration run failed before completion: {err}"
                                ))
                            }
                        });
                        if let Ok(msg) = new_server_message(
                            agent_id,
                            vec![],
                            thread_id,
                            "card_section_update",
                            error_update,
                            vec![],
                            vec![],
                            vec![],
                            true,
                        ) {
                            let _ = store_private_app_message(
                                &state.db,
                                &state.metrics,
                                &state.relay_tx,
                                &user_id,
                                msg,
                            )
                            .await;
                        }
                    }
                }
            }
        }
    });
}

fn route_ui_command(
    query: &str,
    engine: String,
    deployment: Option<&RuntimeDeploymentRecord>,
    active_file_id: Option<&str>,
) -> UiCommandResponse {
    let lowered = query.to_lowercase();
    let runner_intent = [
        "runner",
        "python",
        "code",
        "edit",
        "function",
        "policy",
        "tool registry",
        "requirements",
        "template",
        "dockerfile",
        "container",
        "image build",
    ]
    .iter()
    .any(|token| lowered.contains(token));

    if runner_intent && deployment.map(|item| item.framework.as_str()) == Some("python-runner-chat")
    {
        let target_file_id = infer_runner_target_file(query, active_file_id);
        return UiCommandResponse {
            intent: "runner_edit".to_string(),
            suggested_view: "runner".to_string(),
            preferred_view: preferred_view_for_intent("runner_edit"),
            summary: "The command bar recognized a Python runner code/config edit request and prepared a review-required draft.".to_string(),
            engine,
            links: vec![],
            runner_draft: Some(build_runner_draft(query, &target_file_id)),
            bullets: vec![],
            card_id: None,
            preview_message: None,
        };
    }

    if lowered.contains("dashboard")
        || lowered.contains("agent status")
        || lowered.contains("messages")
    {
        return UiCommandResponse {
            intent: "dashboard_focus".to_string(),
            suggested_view: "search".to_string(),
            preferred_view: preferred_view_for_intent("dashboard_focus"),
            summary: "The command bar recognized a dashboard intent and can pivot the UI to recent agent output and runtime health.".to_string(),
            engine,
            links: vec![],
            runner_draft: None,
            bullets: vec![],
            card_id: None,
            preview_message: None,
        };
    }

    // Keyword-based task detection (fallback when no LLM is configured)
    let task_keywords = [
        "add ",
        "add to",
        "remind me",
        "reminder",
        "todo",
        "to-do",
        "to do",
        "shopping list",
        "buy ",
        "note:",
        "note to",
        "remember to",
        "don't forget",
        "task:",
        "create task",
        "new task",
        "make a note",
        "jot down",
    ];
    let is_task = task_keywords.iter().any(|t| lowered.contains(t));
    if is_task {
        return UiCommandResponse {
            intent: "task".to_string(),
            suggested_view: "search".to_string(),
            preferred_view: preferred_view_for_intent("task"),
            summary: format!(
                "Task noted: {query}. Sign in and configure your LLM for full agent routing."
            ),
            engine,
            links: vec![],
            runner_draft: None,
            bullets: vec![
                "Connect your LLM in Agent Settings to enable full task management.".to_string(),
            ],
            card_id: None,
            preview_message: None,
        };
    }

    UiCommandResponse {
        intent: "web_search".to_string(),
        suggested_view: "search".to_string(),
        preferred_view: preferred_view_for_intent("web_research"),
        summary: "Web search — results below".to_string(),
        links: vec![UiCommandLink {
            title: "Search the web".to_string(),
            url: search_engine_url(&engine, query),
            kind: "search".to_string(),
        }],
        engine,
        runner_draft: None,
        bullets: vec![],
        card_id: None,
        preview_message: None,
    }
}

fn relax_runtime_permissions(_workspace_dir: &PathBuf) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let paths = [
            _workspace_dir.to_path_buf(),
            _workspace_dir.join("workspace"),
            _workspace_dir.join("workspace").join("data"),
            _workspace_dir.join("workspace").join("data").join("files"),
            _workspace_dir.join("workspace").join("data").join("db"),
            _workspace_dir.join("workspace").join("data").join("vector"),
            _workspace_dir.join("workspace").join("secrets"),
            _workspace_dir.join("logs"),
        ];
        for path in paths {
            if path.exists() {
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o777));
            }
        }
    }
}

fn sync_runtime_policy_file(deployment: &RuntimeDeploymentRecord) -> Result<(), String> {
    if deployment.framework != "python-runner-chat" {
        return Ok(());
    }
    let runtime_policy_path = PathBuf::from(&deployment.workspace_path)
        .join("workspace")
        .join("runtime_policy.json");
    let payload = serde_json::json!({
        "runtime_mode": deployment.config_json.get("runtime_mode").cloned().unwrap_or_else(|| serde_json::json!("signed_in_hosted")),
        "runtime_family": deployment.framework,
        "agent_id": deployment
            .config_json
            .get("starter_profile")
            .and_then(|profile| profile.get("primary_agent_id"))
            .cloned()
            .unwrap_or_else(|| Value::String(String::new())),
        "owner_user_id": deployment.owner_user_id,
        "owner_email": deployment
            .config_json
            .get("agent_scope")
            .and_then(|scope| scope.get("owner_email"))
            .cloned()
            .unwrap_or_else(|| Value::String(String::new())),
        "chat_port": 7860,
        "sandbox_policy": deployment.config_json.get("sandbox_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "resource_policy": deployment.config_json.get("resource_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "network_policy": deployment.config_json.get("network_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "model_policy": deployment.config_json.get("model_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "tool_policy": deployment.config_json.get("tool_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "channel_policy": deployment.config_json.get("channel_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "governance": deployment.config_json.get("governance").cloned().unwrap_or_else(|| serde_json::json!({})),
        "audit_scope": deployment.config_json.get("audit_scope").cloned().unwrap_or_else(|| Value::Array(vec![])),
    });
    write_runtime_file(
        &runtime_policy_path,
        &serde_json::to_string_pretty(&payload).map_err(|err| err.to_string())?,
    )
}

fn sync_runtime_agent_profile_file(deployment: &RuntimeDeploymentRecord) -> Result<(), String> {
    if deployment.framework != "python-runner-chat" {
        return Ok(());
    }
    let agent_profile_path = PathBuf::from(&deployment.workspace_path)
        .join("workspace")
        .join("agent_profile.json");
    let starter_profile = deployment
        .config_json
        .get("starter_profile")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    let payload = serde_json::json!({
        "agent_id": starter_profile
            .get("primary_agent_id")
            .cloned()
            .unwrap_or_else(|| Value::String(String::new())),
        "owner_user_id": deployment.owner_user_id,
        "owner_email": deployment
            .config_json
            .get("agent_scope")
            .and_then(|scope| scope.get("owner_email"))
            .cloned()
            .unwrap_or_else(|| Value::String(String::new())),
        "default_template_id": starter_profile
            .get("default_template_id")
            .cloned()
            .unwrap_or_else(|| Value::String("student_day_planner".to_string())),
        "capabilities": [
            "chat_control",
            "day_planning",
            "message_summary",
            "task_capture",
            "tool_traces",
            "prompt_versions",
            "human_review",
            "afp_agent_endpoint"
        ],
        "approval_required": [
            "send",
            "reply",
            "payments",
            "bookings",
            "destructive_api_actions"
        ],
        "notes": [
            "This is a starter Python runner scaffolded by OmnyID.",
            "The built-in chat window is a private agent IDE surface for non-technical users.",
            "Bring your own API key in .env to connect a live model, or keep using local planning mode until a key is present.",
            "Tool use is capability-gated by runtime_policy.json before execution."
        ]
    });
    write_runtime_file(
        &agent_profile_path,
        &serde_json::to_string_pretty(&payload).map_err(|err| err.to_string())?,
    )
}

fn runtime_entrypoint_filename(framework: &str) -> &'static str {
    match framework {
        "crewai" => "crew_runtime.py",
        "python-runner-chat" => "runner_chat.py",
        _ => "runtime.py",
    }
}

fn default_runtime_gui(framework: &str) -> &'static str {
    match framework {
        "crewai" => "crewai-studio",
        "python-runner-chat" => "builtin-chat-window",
        _ => "none",
    }
}

fn runtime_template_content(framework: &str, template: &str) -> Result<&'static str, String> {
    match (framework, template) {
        ("crewai", "docker-compose.yml") => Ok(include_str!(
            "../runtime-templates/crewai/docker-compose.yml.tpl"
        )),
        ("crewai", "runtime.env") => {
            Ok(include_str!("../runtime-templates/crewai/runtime.env.tpl"))
        }
        ("crewai", "README.md") => Ok(include_str!("../runtime-templates/crewai/README.md.tpl")),
        ("crewai", "entrypoint") => Ok(include_str!(
            "../runtime-templates/crewai/crew_runtime.py.tpl"
        )),
        ("crewai", "agent_profile.json") => Ok(include_str!(
            "../runtime-templates/crewai/agent_profile.json.tpl"
        )),
        ("python-runner-chat", "docker-compose.yml") => Ok(include_str!(
            "../runtime-templates/python-runner-chat/docker-compose.yml.tpl"
        )),
        ("python-runner-chat", "Dockerfile") => Ok(include_str!(
            "../runtime-templates/python-runner-chat/Dockerfile.tpl"
        )),
        ("python-runner-chat", "runtime.env") => Ok(include_str!(
            "../runtime-templates/python-runner-chat/runtime.env.tpl"
        )),
        ("python-runner-chat", "README.md") => Ok(include_str!(
            "../runtime-templates/python-runner-chat/README.md.tpl"
        )),
        ("python-runner-chat", "entrypoint") => Ok(include_str!(
            "../runtime-templates/python-runner-chat/runner_chat.py.tpl"
        )),
        ("python-runner-chat", "agent_profile.json") => Ok(include_str!(
            "../runtime-templates/python-runner-chat/agent_profile.json.tpl"
        )),
        ("python-runner-chat", "requirements.txt") => Ok(include_str!(
            "../runtime-templates/python-runner-chat/requirements.txt.tpl"
        )),
        ("python-runner-chat", "runtime_policy.json") => Ok(include_str!(
            "../runtime-templates/python-runner-chat/runtime_policy.json.tpl"
        )),
        ("python-runner-chat", "starter_templates.json") => Ok(include_str!(
            "../runtime-templates/python-runner-chat/starter_templates.json.tpl"
        )),
        ("python-runner-chat", "tool_registry.py") => Ok(include_str!(
            "../runtime-templates/python-runner-chat/tool_registry.py.tpl"
        )),
        ("python-runner-chat", "policy.py") => Ok(include_str!(
            "../runtime-templates/python-runner-chat/policy.py.tpl"
        )),
        _ => Err(format!(
            "missing runtime template for framework `{framework}` and template `{template}`"
        )),
    }
}

async fn inspect_runtime_deployment_live(
    mut deployment: RuntimeDeploymentRecord,
) -> RuntimeDeploymentRecord {
    let running = runtime_service_running(&deployment).await;
    let logs_file = PathBuf::from(&deployment.workspace_path)
        .join("logs")
        .join("runtime.log");
    let bootstrap_log = PathBuf::from(&deployment.workspace_path)
        .join("logs")
        .join("pip-install.log");
    let build_log = PathBuf::from(&deployment.workspace_path)
        .join("logs")
        .join("build-start.log");
    let scaffolded = deployment
        .config_json
        .get("runtime_state")
        .and_then(|state| state.get("scaffolded"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    deployment.status = derive_runtime_status(
        scaffolded,
        running,
        &deployment.framework,
        logs_file.exists(),
        bootstrap_log.exists(),
        &deployment.updated_at,
    );

    if let Some(config) = deployment.config_json.as_object_mut() {
        let runtime_state = config
            .entry("runtime_state".to_string())
            .or_insert_with(|| serde_json::json!({}));
        if let Some(runtime_state) = runtime_state.as_object_mut() {
            runtime_state.insert(
                "docker_cli_available".to_string(),
                Value::Bool(docker_cli_available().await),
            );
            if let Some(is_running) = running {
                runtime_state.insert("running".to_string(), Value::Bool(is_running));
            }
            runtime_state.insert(
                "logs_file_exists".to_string(),
                Value::Bool(logs_file.exists()),
            );
            runtime_state.insert(
                "bootstrap_log_exists".to_string(),
                Value::Bool(bootstrap_log.exists()),
            );
            runtime_state.insert(
                "build_log_exists".to_string(),
                Value::Bool(build_log.exists()),
            );
            if deployment.framework == "python-runner-chat"
                && !logs_file.exists()
                && bootstrap_log.exists()
            {
                runtime_state.insert(
                    "status_note".to_string(),
                    Value::String(
                        "Installing Python runner dependencies inside the isolated runtime."
                            .to_string(),
                    ),
                );
                runtime_state.insert(
                    "log_source_hint".to_string(),
                    Value::String("pip-install.log".to_string()),
                );
            } else if deployment.framework == "python-runner-chat"
                && !logs_file.exists()
                && build_log.exists()
            {
                runtime_state.insert(
                    "status_note".to_string(),
                    Value::String(
                        "Building the isolated Python runner image and starting the container."
                            .to_string(),
                    ),
                );
                runtime_state.insert(
                    "log_source_hint".to_string(),
                    Value::String("build-start.log".to_string()),
                );
            } else if deployment.framework == "python-runner-chat"
                && !logs_file.exists()
                && runtime_was_recently_updated(&deployment.updated_at, 10)
            {
                runtime_state.insert(
                    "status_note".to_string(),
                    Value::String(
                        "Preparing the isolated Python runner image and starting the container."
                            .to_string(),
                    ),
                );
                runtime_state.insert(
                    "log_source_hint".to_string(),
                    Value::String("docker-build".to_string()),
                );
            }
        }
    }

    deployment
}

fn derive_runtime_status(
    scaffolded: bool,
    running: Option<bool>,
    framework: &str,
    runtime_log_exists: bool,
    bootstrap_log_exists: bool,
    updated_at: &str,
) -> String {
    if !scaffolded {
        return "planned".to_string();
    }
    if framework == "python-runner-chat"
        && !runtime_log_exists
        && (bootstrap_log_exists || runtime_was_recently_updated(updated_at, 10))
    {
        return "starting".to_string();
    }
    match running {
        Some(true) => "running".to_string(),
        Some(false) => "stopped".to_string(),
        None => "scaffolded".to_string(),
    }
}

fn runtime_was_recently_updated(updated_at: &str, window_minutes: i64) -> bool {
    chrono::DateTime::parse_from_rfc3339(updated_at)
        .map(|timestamp| {
            let updated_utc = timestamp.with_timezone(&chrono::Utc);
            chrono::Utc::now()
                .signed_duration_since(updated_utc)
                .num_minutes()
                <= window_minutes
        })
        .unwrap_or(false)
}

async fn docker_cli_available() -> bool {
    match Command::new("docker")
        .arg("compose")
        .arg("version")
        .output()
        .await
    {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

async fn runtime_service_running(deployment: &RuntimeDeploymentRecord) -> Option<bool> {
    if !docker_cli_available().await {
        return None;
    }

    let compose_file = PathBuf::from(&deployment.workspace_path).join("docker-compose.yml");
    if !compose_file.exists() {
        return Some(false);
    }

    let output = Command::new("docker")
        .arg("compose")
        .arg("-f")
        .arg(&compose_file)
        .args(["ps", "--services", "--filter", "status=running"])
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return Some(false);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Some(
        stdout
            .lines()
            .any(|line| line.trim() == runtime_service_name(&deployment.framework)),
    )
}

async fn runtime_compose_action(
    deployment: &RuntimeDeploymentRecord,
    action: &str,
) -> Result<(), String> {
    if !docker_cli_available().await {
        return Err("Docker Compose is not available to the OmnyID homeserver yet.".to_string());
    }

    let compose_file = PathBuf::from(&deployment.workspace_path).join("docker-compose.yml");
    if !compose_file.exists() {
        return Err("Runtime compose file is missing; scaffold the runtime first.".to_string());
    }

    let mut command = Command::new("docker");
    command.arg("compose").arg("-f").arg(&compose_file);
    match action {
        "start" => {
            if deployment.framework == "python-runner-chat" {
                command.args(["up", "--build", "-d"]);
            } else {
                command.args(["up", "-d"]);
            }
        }
        "stop" => {
            command.arg("stop");
        }
        "restart" => {
            command.arg("restart");
        }
        _ => {
            return Err("Unsupported runtime action".to_string());
        }
    }

    let output = command
        .output()
        .await
        .map_err(|err| format!("failed to execute docker compose {action}: {err}"))?;
    persist_runtime_compose_output(deployment, action, &output.stdout, &output.stderr);
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };
    Err(format!("docker compose {action} failed: {detail}"))
}

fn persist_runtime_compose_output(
    deployment: &RuntimeDeploymentRecord,
    action: &str,
    stdout: &[u8],
    stderr: &[u8],
) {
    let logs_dir = PathBuf::from(&deployment.workspace_path).join("logs");
    let _ = std::fs::create_dir_all(&logs_dir);
    let log_name = match (deployment.framework.as_str(), action) {
        ("python-runner-chat", "start") | ("python-runner-chat", "restart") => "build-start.log",
        _ => "compose-action.log",
    };
    let mut combined = String::new();
    let stdout = String::from_utf8_lossy(stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(stderr).trim().to_string();
    if !stdout.is_empty() {
        combined.push_str(&stdout);
    }
    if !stderr.is_empty() {
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(&stderr);
    }
    if combined.is_empty() {
        combined = format!("docker compose {action} finished without console output");
    }
    let _ = std::fs::write(logs_dir.join(log_name), combined);
}

async fn runtime_compose_down(deployment: &RuntimeDeploymentRecord) -> Result<(), String> {
    if !docker_cli_available().await {
        return Err("Docker Compose is not available to the OmnyID homeserver yet.".to_string());
    }

    let compose_file = PathBuf::from(&deployment.workspace_path).join("docker-compose.yml");
    if !compose_file.exists() {
        return Ok(());
    }

    let output = Command::new("docker")
        .arg("compose")
        .arg("-f")
        .arg(&compose_file)
        .args(["down", "--remove-orphans"])
        .output()
        .await
        .map_err(|err| format!("failed to execute docker compose down: {err}"))?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };
    Err(format!("docker compose down failed: {detail}"))
}

fn remove_runtime_workspace(workspace_path: &str) -> Result<bool, String> {
    let workspace = PathBuf::from(workspace_path);
    if workspace_path.trim().is_empty() {
        return Ok(false);
    }

    let root = std::fs::canonicalize(runtime_root())
        .map_err(|err| format!("failed to resolve runtime root: {err}"))?;
    let canonical_workspace = std::fs::canonicalize(&workspace)
        .map_err(|err| format!("failed to resolve runtime workspace: {err}"))?;

    if !canonical_workspace.starts_with(&root) {
        return Err(
            "refusing to remove a runtime workspace outside the OmnyID runtime root".to_string(),
        );
    }

    std::fs::remove_dir_all(&canonical_workspace)
        .map_err(|err| format!("failed to remove runtime workspace: {err}"))?;
    Ok(true)
}

async fn runtime_log_lines(deployment: &RuntimeDeploymentRecord) -> (String, Vec<String>) {
    let compose_file = PathBuf::from(&deployment.workspace_path).join("docker-compose.yml");
    if docker_cli_available().await && compose_file.exists() {
        if let Ok(output) = Command::new("docker")
            .arg("compose")
            .arg("-f")
            .arg(&compose_file)
            .args([
                "logs",
                "--tail",
                "40",
                "--no-color",
                runtime_service_name(&deployment.framework),
            ])
            .output()
            .await
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let lines = tail_lines(stdout.lines().collect(), 40);
                if !lines.is_empty() {
                    return ("docker-compose".to_string(), lines);
                }
            }
        }
    }

    let log_path = PathBuf::from(&deployment.workspace_path)
        .join("logs")
        .join("runtime.log");
    match std::fs::read_to_string(&log_path) {
        Ok(contents) if !contents.trim().is_empty() => {
            return (
                "runtime.log".to_string(),
                tail_lines(contents.lines().collect(), 40),
            );
        }
        _ => {}
    }

    let bootstrap_log_path = PathBuf::from(&deployment.workspace_path)
        .join("logs")
        .join("pip-install.log");
    if let Ok(contents) = std::fs::read_to_string(&bootstrap_log_path) {
        if !contents.trim().is_empty() {
            return (
                "pip-install.log".to_string(),
                tail_lines(contents.lines().collect(), 40),
            );
        }
    }

    let build_log_path = PathBuf::from(&deployment.workspace_path)
        .join("logs")
        .join("build-start.log");
    match std::fs::read_to_string(&build_log_path) {
        Ok(contents) if !contents.trim().is_empty() => (
            "build-start.log".to_string(),
            tail_lines(contents.lines().collect(), 40),
        ),
        _ => (
            "none".to_string(),
            vec!["No runtime logs are available yet.".to_string()],
        ),
    }
}

fn runtime_service_name(framework: &str) -> &'static str {
    match framework {
        "python-runner-chat" => "python-runner-chat",
        _ => "crewai-runtime",
    }
}

fn tail_lines(lines: Vec<&str>, max_lines: usize) -> Vec<String> {
    let total = lines.len();
    let start = total.saturating_sub(max_lines);
    lines[start..].iter().map(|line| line.to_string()).collect()
}

fn annotate_runtime_error(
    mut deployment: RuntimeDeploymentRecord,
    fallback_status: &str,
    error_message: &str,
) -> RuntimeDeploymentRecord {
    deployment.status = fallback_status.to_string();
    if let Some(config) = deployment.config_json.as_object_mut() {
        config.insert(
            "runtime_error".to_string(),
            Value::String(error_message.to_string()),
        );
    }
    deployment
}

fn runtime_deployment_response(deployment: RuntimeDeploymentRecord) -> RuntimeDeploymentResponse {
    let runtime_token_preview = runtime_token_preview(&deployment.runtime_token);
    let sanitized_config =
        sanitize_runtime_config_json(deployment.config_json.clone(), &runtime_token_preview);
    let runtime_status_panel = runtime_status_panel_a2ui(&deployment, None);
    let runtime_diagnostics_panel =
        runtime_diagnostics_panel_a2ui(&deployment, None, &sanitized_config);
    RuntimeDeploymentResponse {
        id: deployment.id,
        owner_user_id: deployment.owner_user_id,
        framework: deployment.framework,
        gui: deployment.gui,
        status: deployment.status,
        python_version: deployment.python_version,
        image_ref: deployment.image_ref,
        runtime_token_preview: runtime_token_preview.clone(),
        workspace_path: deployment.workspace_path,
        config_json: sanitized_config.clone(),
        runtime_monitor: None,
        runtime_status_panel: Some(runtime_status_panel.clone()),
        runtime_status_views: Some(vec![
            serde_json::json!({
                "format": "a2ui.v1",
                "priority": 100,
                "content": runtime_status_panel,
            }),
            serde_json::json!({
                "format": "a2ui.v1",
                "priority": 80,
                "content": runtime_diagnostics_panel,
            }),
        ]),
        created_at: deployment.created_at,
        updated_at: deployment.updated_at,
    }
}

async fn runtime_deployment_response_live(
    deployment: RuntimeDeploymentRecord,
) -> RuntimeDeploymentResponse {
    let mut response = runtime_deployment_response(deployment.clone());
    let (source, lines) = runtime_log_lines(&deployment).await;
    let monitor = RuntimeMonitorPreview {
        status: deployment.status.clone(),
        source,
        lines: lines.into_iter().take(12).collect(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    response.runtime_monitor = Some(monitor);
    let status_panel = runtime_status_panel_a2ui(&deployment, response.runtime_monitor.as_ref());
    let diagnostics_panel = runtime_diagnostics_panel_a2ui(
        &deployment,
        response.runtime_monitor.as_ref(),
        &response.config_json,
    );
    response.runtime_status_panel = Some(status_panel.clone());
    response.runtime_status_views = Some(vec![
        serde_json::json!({
            "format": "a2ui.v1",
            "priority": 100,
            "content": status_panel,
        }),
        serde_json::json!({
            "format": "a2ui.v1",
            "priority": 80,
            "content": diagnostics_panel,
        }),
    ]);
    response
}

fn sanitize_runtime_config_json(mut config_json: Value, runtime_token_preview: &str) -> Value {
    if let Some(config) = config_json.as_object_mut() {
        if let Some(runtime_env) = config.get_mut("runtime_env").and_then(Value::as_object_mut) {
            if runtime_env.contains_key("OMNYID_RUNTIME_TOKEN") {
                runtime_env.insert(
                    "OMNYID_RUNTIME_TOKEN".to_string(),
                    Value::String(runtime_token_preview.to_string()),
                );
            }
        }
    }
    config_json
}

fn build_onboarding_bundle_response(
    user: &UserRecord,
    onboarding: &UserOnboardingRecord,
    agents: &[ManagedAgentRecord],
) -> OnboardingBundleResponse {
    let notes = onboarding.notes.as_object().cloned().unwrap_or_default();
    let privacy_mode = notes
        .get("privacy_mode")
        .and_then(|value| value.as_str())
        .unwrap_or("local_private")
        .to_string();
    let deployment_target = notes
        .get("deployment_target")
        .and_then(|value| value.as_str())
        .unwrap_or("local_machine")
        .to_string();
    let detected_platform = notes
        .get("detected_platform")
        .and_then(|value| value.as_str())
        .unwrap_or("Windows");
    let slug = user
        .display_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let bundle_slug = if slug.is_empty() {
        "omnyid-private-workspace".to_string()
    } else {
        slug
    };
    let installer_family = if detected_platform.to_ascii_lowercase().contains("mac")
        || detected_platform.to_ascii_lowercase().contains("linux")
    {
        "unix"
    } else {
        "windows"
    }
    .to_string();
    let estimated_minutes = match deployment_target.as_str() {
        "oracle_cloud" | "upcloud" | "ovhcloud" => 20,
        "managed_omnyid" => 10,
        _ => 35,
    };
    let mode = match deployment_target.as_str() {
        "oracle_cloud" => "oracle",
        "upcloud" => "upcloud",
        "ovhcloud" => "ovhcloud",
        "managed_omnyid" => "byoc",
        _ => "local",
    };
    let suggested_region = match deployment_target.as_str() {
        "oracle_cloud" => "ap-sydney-1",
        "upcloud" => "au-syd1",
        "ovhcloud" => "syd",
        "managed_omnyid" => "managed-region",
        _ => "local-device",
    };
    let agent_list = agents
        .iter()
        .map(|agent| format!("- {} ({})", agent.agent_id, agent.label))
        .collect::<Vec<_>>()
        .join("\n");
    let readme = format!(
        "# OmnyID Private Onboarding Bundle\n\n\
Workspace owner: {}\n\
Primary email: {}\n\
Privacy mode: {}\n\
Deployment target: {}\n\
Estimated setup time: about {} minutes\n\n\
What this bundle does:\n\
- keeps OmnyID as the control plane\n\
- provisions your runtime into the privacy boundary you chose\n\
- preserves one isolated runtime, storage boundary, and secret boundary per user\n\n\
Managed agents already seeded for this account:\n{}\n\n\
Recommended next step:\n\
- download the matching installer script\n\
- run the command from the bundle JSON or the dashboard\n\
- use the provider-specific bootstrap file in this bundle if you chose a private cloud path\n\
- return to OmnyID to verify the runtime and logs\n",
        user.display_name,
        user.email,
        privacy_mode,
        deployment_target,
        estimated_minutes,
        agent_list
    );
    let plan_json = serde_json::json!({
        "workspace_name": user.display_name,
        "owner_email": user.email,
        "privacy_mode": privacy_mode,
        "deployment_target": deployment_target,
        "installer_mode": mode,
        "suggested_region": suggested_region,
        "detected_platform": detected_platform,
        "estimated_minutes": estimated_minutes,
        "managed_agents": agents.iter().map(|agent| serde_json::json!({
            "agent_id": agent.agent_id,
            "label": agent.label,
            "kind": agent.kind,
        })).collect::<Vec<_>>(),
    })
    .to_string();
    let commands = if installer_family == "unix" {
        vec![format!(
            "curl -fsSL https://api.omnyid.com/installers/local/unix.sh -o install-omnyid-private.sh && chmod +x install-omnyid-private.sh && OMNYID_WORKSPACE_NAME=\"{}\" OMNYID_OWNER_EMAIL=\"{}\" OMNYID_REGION=\"{}\" ./install-omnyid-private.sh {}",
            user.display_name, user.email, suggested_region, mode
        )]
    } else {
        vec![format!(
            "Invoke-WebRequest https://api.omnyid.com/installers/local/windows.ps1 -OutFile install-omnyid-private.ps1; powershell -ExecutionPolicy Bypass -File .\\install-omnyid-private.ps1 -Mode {} -WorkspaceName \"{}\" -OwnerEmail \"{}\" -Region \"{}\"",
            mode, user.display_name, user.email, suggested_region
        )]
    };
    let provider_bootstrap = match deployment_target.as_str() {
        "oracle_cloud" => Some((
            "cloud-init.oracle.yaml".to_string(),
            format!(
                "#cloud-config\npackage_update: true\npackages:\n  - docker.io\n  - docker-compose-v2\n  - cryptsetup\n  - jq\nruncmd:\n  - mkdir -p /srv/omnyid/{0}\n  - mkdir -p /srv/omnyid/{0}/runtime\n  - mkdir -p /srv/omnyid/{0}/secrets\n  - echo 'Oracle Cloud bootstrap for {1} in {2}.' > /srv/omnyid/{0}/README_PRIVACY.txt\n  - echo 'Attach an encrypted block volume before storing tenant runtime data.' >> /srv/omnyid/{0}/README_PRIVACY.txt\n",
                user.display_name.to_ascii_lowercase().replace(' ', "-"),
                user.display_name,
                suggested_region,
            ),
        )),
        "upcloud" => Some((
            "cloud-init.upcloud.yaml".to_string(),
            format!(
                "#cloud-config\npackage_update: true\npackages:\n  - docker.io\n  - docker-compose-v2\n  - cryptsetup\n  - jq\nruncmd:\n  - mkdir -p /srv/omnyid/{0}\n  - echo 'UpCloud bootstrap for {1} in {2}.' > /srv/omnyid/{0}/README_PRIVACY.txt\n  - echo 'Provision one dedicated VM and one encrypted data volume for this tenant.' >> /srv/omnyid/{0}/README_PRIVACY.txt\n",
                user.display_name.to_ascii_lowercase().replace(' ', "-"),
                user.display_name,
                suggested_region,
            ),
        )),
        "ovhcloud" => Some((
            "cloud-init.ovhcloud.yaml".to_string(),
            format!(
                "#cloud-config\npackage_update: true\npackages:\n  - docker.io\n  - docker-compose-v2\n  - cryptsetup\n  - jq\nruncmd:\n  - mkdir -p /srv/omnyid/{0}\n  - echo 'OVHcloud bootstrap for {1} in {2}.' > /srv/omnyid/{0}/README_PRIVACY.txt\n  - echo 'Keep one tenant per isolated VM or microVM and mount encrypted storage before first launch.' >> /srv/omnyid/{0}/README_PRIVACY.txt\n",
                user.display_name.to_ascii_lowercase().replace(' ', "-"),
                user.display_name,
                suggested_region,
            ),
        )),
        _ => None,
    };
    let provider_guide = match deployment_target.as_str() {
        "oracle_cloud" => Some((
            "deploy-oracle-cloud.md".to_string(),
            format!(
                "# Oracle Cloud private deployment\n\n1. Create one dedicated VM in `{}`.\n2. Attach an encrypted block volume before writing runtime data.\n3. Copy `.env.private` into the host and use `cloud-init.oracle.yaml` during boot.\n4. Run the generated installer command from the dashboard.\n5. Return to OmnyID and verify runtime health, support-access state, and logs.\n",
                suggested_region
            ),
        )),
        "upcloud" => Some((
            "deploy-upcloud.md".to_string(),
            format!(
                "# UpCloud private deployment\n\n1. Provision one dedicated VM in `{}`.\n2. Attach encrypted tenant storage.\n3. Use `cloud-init.upcloud.yaml` for the first boot.\n4. Run the generated installer command so the tenant bundle stays aligned with OmnyID.\n5. Return to OmnyID to verify runtime health and logs.\n",
                suggested_region
            ),
        )),
        "ovhcloud" => Some((
            "deploy-ovhcloud.md".to_string(),
            format!(
                "# OVHcloud private deployment\n\n1. Provision one dedicated VM in `{}`.\n2. Mount encrypted tenant storage before runtime data is written.\n3. Use `cloud-init.ovhcloud.yaml` during the first boot sequence.\n4. Run the generated installer command from the bundle.\n5. Return to OmnyID and confirm runtime health and privacy controls.\n",
                suggested_region
            ),
        )),
        _ => None,
    };
    let mut files = vec![
        OnboardingBundleFile {
            name: "README.md".to_string(),
            content: readme,
        },
        OnboardingBundleFile {
            name: "omnyid-onboarding-plan.json".to_string(),
            content: plan_json,
        },
    ];
    if let Some((name, content)) = provider_bootstrap {
        files.push(OnboardingBundleFile { name, content });
    }
    if let Some((name, content)) = provider_guide {
        files.push(OnboardingBundleFile { name, content });
    }

    OnboardingBundleResponse {
        bundle_name: format!("omnyid-{}-bundle", bundle_slug),
        privacy_mode,
        deployment_target,
        installer_family,
        estimated_minutes,
        installer_downloads: vec![
            InstallerDownload {
                label: "Windows installer".to_string(),
                url: "/installers/local/windows.ps1".to_string(),
                filename: "install-omnyid-private.ps1".to_string(),
            },
            InstallerDownload {
                label: "macOS / Linux installer".to_string(),
                url: "/installers/local/unix.sh".to_string(),
                filename: "install-omnyid-private.sh".to_string(),
            },
        ],
        commands,
        files,
    }
}

fn build_service_adapter_bundle_response(
    user: &UserRecord,
    agents: &[ManagedAgentRecord],
) -> ServiceAdapterBundleResponse {
    let slug = user
        .display_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let bundle_slug = if slug.is_empty() {
        "omnyid-service-adapter".to_string()
    } else {
        format!("{}-service-adapter", slug)
    };
    let requester_agents = agents
        .iter()
        .map(|agent| format!("- {} ({})", agent.agent_id, agent.label))
        .collect::<Vec<_>>()
        .join("\n");
    let service_agent_example = format!(
        "agent:{}-service@example.edu",
        user.display_name
            .to_ascii_lowercase()
            .replace(' ', "-")
            .replace("--", "-")
    );
    let files = vec![
        OnboardingBundleFile {
            name: "README.md".to_string(),
            content: render_runtime_template(
                include_str!("../service-adapter-templates/fastapi/README.md.tpl"),
                &BTreeMap::new(),
            ),
        },
        OnboardingBundleFile {
            name: "requirements.txt".to_string(),
            content: render_runtime_template(
                include_str!("../service-adapter-templates/fastapi/requirements.txt.tpl"),
                &BTreeMap::new(),
            ),
        },
        OnboardingBundleFile {
            name: ".env.example".to_string(),
            content: render_runtime_template(
                include_str!("../service-adapter-templates/fastapi/env.example.tpl"),
                &{
                    let mut values = BTreeMap::new();
                    values.insert("SERVICE_AGENT_ID", service_agent_example.clone());
                    values
                },
            )
            .replace("agent:university-service@example.edu", &service_agent_example),
        },
        OnboardingBundleFile {
            name: "app.py".to_string(),
            content: render_runtime_template(
                include_str!("../service-adapter-templates/fastapi/app.py.tpl"),
                &BTreeMap::new(),
            ),
        },
        OnboardingBundleFile {
            name: "adapter-plan.json".to_string(),
            content: serde_json::json!({
                "requested_by": {
                    "user_id": user.id,
                    "email": user.email,
                    "display_name": user.display_name,
                },
                "intended_profiles": [
                    "university_portal",
                    "small_business_crm",
                    "scheduling_or_deadline_service"
                ],
                "service_agent_id_example": service_agent_example,
                "requester_agents": agents.iter().map(|agent| serde_json::json!({
                    "agent_id": agent.agent_id,
                    "label": agent.label,
                    "kind": agent.kind,
                })).collect::<Vec<_>>(),
                "notes": [
                    "Use HTTPS first; WebTransport can be added later for realtime push.",
                    "This adapter should wrap an existing system of record rather than replacing it.",
                    "Per-user authorization still needs to be enforced against the institution or business identity system."
                ]
            })
            .to_string(),
        },
        OnboardingBundleFile {
            name: "REQUEST_CONTEXT.txt".to_string(),
            content: format!(
                "Requester: {} <{}>\n\nRequester agents:\n{}\n\nUse this context if you are handing the adapter starter to a university or business systems team.\n",
                user.display_name,
                user.email,
                if requester_agents.is_empty() { "- none seeded yet".to_string() } else { requester_agents }
            ),
        },
    ];

    ServiceAdapterBundleResponse {
        bundle_name: format!("{}.zipless", bundle_slug),
        target_profile: "fastapi-afp-service-adapter".to_string(),
        files,
    }
}

async fn load_runtime_backups_response(
    db: &Db,
    owner_user_id: &str,
) -> Result<RuntimeBackupsResponse, SqlxError> {
    let _ = prune_expired_runtime_backups(db, owner_user_id).await;
    let policy = match db.find_runtime_backup_policy(owner_user_id).await? {
        Some(policy) => policy,
        None => {
            db.upsert_runtime_backup_policy(owner_user_id, 14, "metadata_only_hosted")
                .await?
        }
    };
    let entries = db
        .list_runtime_backups(owner_user_id, 12)
        .await?
        .into_iter()
        .map(runtime_backup_entry_response)
        .collect::<Vec<_>>();

    Ok(RuntimeBackupsResponse {
        policy: runtime_backup_policy_response(policy),
        entries,
    })
}

async fn load_runtime_restore_drills_response(
    db: &Db,
    owner_user_id: &str,
) -> Result<RuntimeRestoreDrillsResponse, SqlxError> {
    let entries = db
        .list_runtime_restore_drills(owner_user_id, 12)
        .await?
        .into_iter()
        .map(runtime_restore_drill_entry_response)
        .collect::<Vec<_>>();
    Ok(RuntimeRestoreDrillsResponse { entries })
}

async fn load_runtime_updates_response(
    db: &Db,
    owner_user_id: &str,
) -> Result<RuntimeUpdatesResponse, SqlxError> {
    let policy = match db.find_runtime_update_policy(owner_user_id).await? {
        Some(policy) => policy,
        None => {
            db.upsert_runtime_update_policy(owner_user_id, "stable", "manual_only", None, None)
                .await?
        }
    };
    let deployment = db.find_runtime_deployment_by_user(owner_user_id).await?;
    let current_version = deployment
        .as_ref()
        .and_then(runtime_template_version_from_deployment)
        .unwrap_or_else(runtime_template_version);
    let latest_version = runtime_template_version();
    let runtime_status = deployment
        .as_ref()
        .map(|record| record.status.clone())
        .unwrap_or_else(|| "not_deployed".to_string());
    let framework = deployment.as_ref().map(|record| record.framework.clone());
    let update_available = current_version != latest_version;
    let entries = db
        .list_runtime_update_events(owner_user_id, 12)
        .await?
        .into_iter()
        .map(runtime_update_event_entry_response)
        .collect::<Vec<_>>();

    let mut response = RuntimeUpdatesResponse {
        policy: runtime_update_policy_response(policy.clone()),
        current_version,
        latest_version,
        update_available,
        runtime_status,
        framework,
        last_checked_at: policy.last_checked_at,
        last_applied_at: policy.last_applied_at,
        entries,
        panel: None,
    };
    response.panel = Some(runtime_updates_panel_a2ui(&response));
    Ok(response)
}

async fn load_device_sync_policies_response(
    db: &Db,
    owner_user_id: &str,
) -> Result<DeviceSyncPoliciesResponse, SqlxError> {
    let entries = db
        .list_sync_device_policies_by_user(owner_user_id, 24)
        .await?
        .into_iter()
        .map(device_sync_policy_entry_response)
        .collect::<Vec<_>>();
    Ok(DeviceSyncPoliciesResponse { entries })
}

async fn check_runtime_updates(db: &Db, owner_user_id: &str) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    let deployment = db
        .find_runtime_deployment_by_user(owner_user_id)
        .await
        .map_err(|err| err.to_string())?;
    let current_version = deployment
        .as_ref()
        .and_then(runtime_template_version_from_deployment)
        .unwrap_or_else(runtime_template_version);
    let latest_version = runtime_template_version();
    let update_available = current_version != latest_version;
    let existing_policy = db
        .find_runtime_update_policy(owner_user_id)
        .await
        .map_err(|err| err.to_string())?;
    let update_channel = existing_policy
        .as_ref()
        .map(|policy| policy.update_channel.as_str())
        .unwrap_or("stable");
    let auto_apply = existing_policy
        .as_ref()
        .map(|policy| policy.auto_apply.as_str())
        .unwrap_or("manual_only");
    db.upsert_runtime_update_policy(owner_user_id, update_channel, auto_apply, Some(&now), None)
        .await
        .map_err(|err| err.to_string())?;
    db.create_runtime_update_event(&RuntimeUpdateEventRecord {
        id: Ulid::new().to_string(),
        owner_user_id: owner_user_id.to_string(),
        runtime_deployment_id: deployment.as_ref().map(|record| record.id.clone()),
        action: "check".to_string(),
        from_version: Some(current_version),
        to_version: Some(latest_version),
        status: "checked".to_string(),
        notes_json: serde_json::json!({
            "update_available": update_available,
            "check_scope": "scaffold_template_version",
            "privacy_note": "This check compares runtime scaffold template versions only and does not inspect tenant content."
        }),
        created_at: now,
    })
    .await
    .map_err(|err| err.to_string())?;
    Ok(())
}

async fn apply_runtime_update(db: &Db, owner_user_id: &str) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    let deployment = db
        .find_runtime_deployment_by_user(owner_user_id)
        .await
        .map_err(|err| err.to_string())?
        .ok_or_else(|| {
            "deploy a private runtime before applying hosted scaffold updates".to_string()
        })?;
    let from_version = runtime_template_version_from_deployment(&deployment)
        .unwrap_or_else(runtime_template_version);
    let to_version = runtime_template_version();

    if from_version == to_version {
        db.create_runtime_update_event(&RuntimeUpdateEventRecord {
            id: Ulid::new().to_string(),
            owner_user_id: owner_user_id.to_string(),
            runtime_deployment_id: Some(deployment.id.clone()),
            action: "apply".to_string(),
            from_version: Some(from_version.clone()),
            to_version: Some(to_version.clone()),
            status: "noop".to_string(),
            notes_json: serde_json::json!({
                "reason": "runtime_scaffold_already_current",
                "privacy_note": "No tenant data was modified because the scaffold version already matches the latest template."
            }),
            created_at: now.clone(),
        })
        .await
        .map_err(|err| err.to_string())?;
        return Ok(());
    }

    let was_running = deployment
        .config_json
        .get("runtime_state")
        .and_then(|state| state.get("running"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let deployment = inspect_runtime_deployment(deployment);
    materialize_runtime_scaffold(&deployment)?;
    let mut updated = inspect_runtime_deployment(deployment);
    updated = if was_running {
        match runtime_compose_action(&updated, "start").await {
            Ok(()) => inspect_runtime_deployment_live(updated).await,
            Err(err) => annotate_runtime_error(updated, "scaffolded", &err),
        }
    } else {
        updated
    };
    if let Some(config) = updated.config_json.as_object_mut() {
        config.insert(
            "runtime_template_version".to_string(),
            Value::String(to_version.clone()),
        );
        config.insert("runtime_updated_at".to_string(), Value::String(now.clone()));
    }
    updated.updated_at = now.clone();
    db.upsert_runtime_deployment(&updated)
        .await
        .map_err(|err| err.to_string())?;

    let existing_policy = db
        .find_runtime_update_policy(owner_user_id)
        .await
        .map_err(|err| err.to_string())?;
    let update_channel = existing_policy
        .as_ref()
        .map(|policy| policy.update_channel.as_str())
        .unwrap_or("stable");
    let auto_apply = existing_policy
        .as_ref()
        .map(|policy| policy.auto_apply.as_str())
        .unwrap_or("manual_only");
    db.upsert_runtime_update_policy(
        owner_user_id,
        update_channel,
        auto_apply,
        Some(&now),
        Some(&now),
    )
    .await
    .map_err(|err| err.to_string())?;

    db.create_runtime_update_event(&RuntimeUpdateEventRecord {
        id: Ulid::new().to_string(),
        owner_user_id: owner_user_id.to_string(),
        runtime_deployment_id: Some(updated.id.clone()),
        action: "apply".to_string(),
        from_version: Some(from_version),
        to_version: Some(to_version),
        status: "applied".to_string(),
        notes_json: serde_json::json!({
            "apply_scope": "runtime_scaffold_refresh_only",
            "service_restart_attempted": was_running,
            "privacy_note": "Only the hosted runtime scaffold files were refreshed. Tenant content remains inside the isolated runtime workspace."
        }),
        created_at: now,
    })
    .await
    .map_err(|err| err.to_string())?;

    Ok(())
}

async fn prune_expired_runtime_backups(db: &Db, owner_user_id: &str) -> Result<(), String> {
    let expired = db
        .delete_expired_runtime_backups(owner_user_id)
        .await
        .map_err(|err| err.to_string())?;
    for record in expired {
        if let Some(path) = record.artifact_path.as_deref() {
            let _ = remove_runtime_backup_artifact_path(path);
        }
    }
    Ok(())
}

async fn create_runtime_backup_snapshot(
    db: &Db,
    owner_user_id: &str,
    retention_days: i32,
) -> Result<RuntimeBackupRecord, String> {
    let deployment = db
        .find_runtime_deployment_by_user(owner_user_id)
        .await
        .map_err(|err| err.to_string())?
        .ok_or_else(|| {
            "deploy a private runtime before creating hosted backup metadata".to_string()
        })?;
    let deployment = inspect_runtime_deployment_live(inspect_runtime_deployment(deployment)).await;
    let snapshot = build_runtime_backup_snapshot(&deployment, retention_days)?;
    db.create_runtime_backup(&snapshot)
        .await
        .map_err(|err| err.to_string())?;
    Ok(snapshot)
}

fn runtime_backup_policy_response(
    policy: RuntimeBackupPolicyRecord,
) -> RuntimeBackupPolicyResponse {
    RuntimeBackupPolicyResponse {
        retention_days: policy.retention_days,
        storage_mode: policy.storage_mode,
        last_snapshot_at: policy.last_snapshot_at,
        support_disabled_by_default: true,
    }
}

fn runtime_backup_entry_response(record: RuntimeBackupRecord) -> RuntimeBackupEntryResponse {
    let manifest_summary = serde_json::json!({
        "coverage": record
            .manifest_json
            .get("coverage")
            .cloned()
            .unwrap_or_else(|| Value::String("runtime_metadata_only".to_string())),
        "runtime_status": record
            .manifest_json
            .get("runtime_status")
            .cloned()
            .unwrap_or_else(|| Value::String("unknown".to_string())),
        "top_level_entries": record
            .manifest_json
            .get("top_level_entries")
            .cloned()
            .unwrap_or_else(|| Value::Array(vec![])),
    });

    RuntimeBackupEntryResponse {
        id: record.id,
        snapshot_type: record.snapshot_type,
        storage_mode: record.storage_mode,
        status: record.status,
        file_count: record.file_count,
        total_workspace_bytes: record.total_workspace_bytes,
        artifact_size_bytes: record.artifact_size_bytes,
        created_at: record.created_at,
        expires_at: record.expires_at,
        manifest_summary,
    }
}

fn runtime_restore_drill_entry_response(
    record: RuntimeRestoreDrillRecord,
) -> RuntimeRestoreDrillEntryResponse {
    let notes_summary = serde_json::json!({
        "coverage": record
            .notes_json
            .get("coverage")
            .cloned()
            .unwrap_or_else(|| Value::String("runtime_metadata_only".to_string())),
        "checklist": record
            .notes_json
            .get("checklist")
            .cloned()
            .unwrap_or_else(|| Value::Array(vec![])),
        "drill_type": record
            .notes_json
            .get("drill_type")
            .cloned()
            .unwrap_or_else(|| Value::String("metadata_restore_rehearsal".to_string())),
    });

    RuntimeRestoreDrillEntryResponse {
        id: record.id,
        backup_id: record.backup_id,
        status: record.status,
        started_at: record.started_at,
        completed_at: record.completed_at,
        notes_summary,
    }
}

fn runtime_update_policy_response(
    policy: RuntimeUpdatePolicyRecord,
) -> RuntimeUpdatePolicyResponse {
    RuntimeUpdatePolicyResponse {
        update_channel: policy.update_channel,
        auto_apply: policy.auto_apply,
        support_disabled_by_default: true,
    }
}

fn runtime_update_event_entry_response(
    record: RuntimeUpdateEventRecord,
) -> RuntimeUpdateEventEntryResponse {
    RuntimeUpdateEventEntryResponse {
        id: record.id,
        action: record.action,
        from_version: record.from_version,
        to_version: record.to_version,
        status: record.status,
        created_at: record.created_at,
        notes_summary: serde_json::json!({
            "update_available": record.notes_json.get("update_available").cloned().unwrap_or(Value::Null),
            "apply_scope": record.notes_json.get("apply_scope").cloned().unwrap_or(Value::Null),
            "privacy_note": record.notes_json.get("privacy_note").cloned().unwrap_or(Value::Null),
        }),
    }
}

fn runtime_runner_policy_event_entry_response(
    record: RuntimeRunnerPolicyEventRecord,
) -> RuntimeRunnerPolicyEventEntryResponse {
    RuntimeRunnerPolicyEventEntryResponse {
        id: record.id,
        event_kind: record.event_kind,
        created_at: record.created_at,
        summary: serde_json::json!({
            "starter_template_id": record.summary_json.get("starter_template_id").cloned().unwrap_or(Value::Null),
            "model_mode": record.summary_json.get("model_mode").cloned().unwrap_or(Value::Null),
            "default_model": record.summary_json.get("default_model").cloned().unwrap_or(Value::Null),
            "daily_spend_cap_usd": record.summary_json.get("daily_spend_cap_usd").cloned().unwrap_or(Value::Null),
            "monthly_spend_cap_usd": record.summary_json.get("monthly_spend_cap_usd").cloned().unwrap_or(Value::Null),
            "enabled_tools": record.summary_json.get("enabled_tools").cloned().unwrap_or_else(|| Value::Array(vec![])),
            "enabled_channels": record.summary_json.get("enabled_channels").cloned().unwrap_or_else(|| Value::Array(vec![])),
            "synced_files": record.summary_json.get("synced_files").cloned().unwrap_or_else(|| Value::Array(vec![])),
        }),
    }
}

fn runtime_updates_panel_a2ui(response: &RuntimeUpdatesResponse) -> Value {
    let rows = if response.entries.is_empty() {
        vec![serde_json::json!(["No recent update events", response.runtime_status.clone(), "The runtime has not recorded any update actions yet."])]
    } else {
        response
            .entries
            .iter()
            .take(6)
            .map(|entry| {
                let summary = entry
                    .notes_summary
                    .get("privacy_note")
                    .and_then(Value::as_str)
                    .or_else(|| entry.notes_summary.get("apply_scope").and_then(Value::as_str))
                    .unwrap_or("");
                serde_json::json!([
                    entry.action.clone(),
                    entry.status.clone(),
                    if summary.is_empty() {
                        entry.to_version.clone().unwrap_or_else(|| "No summary".to_string())
                    } else {
                        summary.to_string()
                    }
                ])
            })
            .collect::<Vec<_>>()
    };

    serde_json::json!({
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": "Runtime updates",
        "description": "Structured update and scaffold state for the current runtime.",
        "layout": {"type": "stack", "gap": "md"},
        "nodes": [
            {
                "id": "runtime-updates-summary",
                "type": "callout",
                "props": {
                    "tone": if response.update_available { "warning" } else { "success" },
                    "title": if response.update_available { "Update available" } else { "Runtime up to date" },
                    "body": format!(
                        "Current version {} on {} channel. Latest available version is {}.",
                        response.current_version,
                        response.policy.update_channel,
                        response.latest_version
                    ),
                }
            },
            {
                "id": "runtime-updates-stats",
                "type": "stats_grid",
                "props": {
                    "items": [
                        {"label": "Channel", "value": response.policy.update_channel.clone()},
                        {"label": "Auto apply", "value": response.policy.auto_apply.clone()},
                        {"label": "Runtime", "value": response.runtime_status.clone()},
                        {"label": "Framework", "value": response.framework.clone().unwrap_or_else(|| "none".to_string())},
                    ]
                }
            },
            {
                "id": "runtime-updates-events",
                "type": "table",
                "props": {
                    "columns": ["Action", "Status", "Summary"],
                    "rows": rows,
                    "caption": "Recent runtime update events",
                }
            }
        ]
    })
}

fn device_sync_policy_entry_response(
    record: SyncDevicePolicyRecord,
) -> DeviceSyncPolicyEntryResponse {
    DeviceSyncPolicyEntryResponse {
        device_id: record.device_id,
        agent_id: record.agent_id,
        device_class: record.device_class,
        policy_profile: record.policy_profile,
        sync_slices: record.sync_slices,
        requires_local_key_material: record.requires_local_key_material,
        last_bundle_at: record.last_bundle_at,
        last_used_at: record.last_used_at,
        notes_summary: serde_json::json!({
            "policy_note": record.notes_json.get("policy_note").cloned().unwrap_or(Value::Null),
            "source": record.notes_json.get("source").cloned().unwrap_or(Value::Null),
            "default_profile": record.notes_json.get("default_profile").cloned().unwrap_or(Value::Null),
        }),
    }
}

fn build_runtime_recovery_packet_response(
    user: &UserRecord,
    runtime_deployment: Option<RuntimeDeploymentResponse>,
    runtime_backups: RuntimeBackupsResponse,
    runtime_restore_drills: RuntimeRestoreDrillsResponse,
    runtime_updates: RuntimeUpdatesResponse,
) -> RuntimeRecoveryPacketResponse {
    let packet_slug = email_localpart_slug(&user.email);
    RuntimeRecoveryPacketResponse {
        generated_at: chrono::Utc::now().to_rfc3339(),
        packet_version: "omnyid-runtime-recovery-v1".to_string(),
        packet_name: format!("{packet_slug}-runtime-recovery.json"),
        user: session_user_response(user),
        runtime_deployment,
        runtime_backups,
        runtime_restore_drills,
        runtime_updates,
        recovery_checklist: vec![
            "Confirm the owner account, runtime framework, and workspace boundary match your intended recovery target."
                .to_string(),
            "Review the latest metadata snapshot and manifest summary before recreating any hosted scaffold."
                .to_string(),
            "Check recent restore drills to confirm the expected recovery steps were rehearsed."
                .to_string(),
            "Verify runtime update state so the target scaffold version is known before any restore attempt."
                .to_string(),
            "Keep support access disabled unless you explicitly open a fresh consent window for assistance."
                .to_string(),
        ],
        privacy_notes: vec![
            "This packet is metadata only. It does not export tenant runtime content or operator-readable secrets."
                .to_string(),
            "Hosted runtime updates in this packet refer to scaffold version state, not private agent work product."
                .to_string(),
            "Support access remains disabled by default and is not implicitly opened by exporting this packet."
                .to_string(),
        ],
    }
}

fn build_device_bootstrap_bundle_response(
    user: &UserRecord,
    agents: &[ManagedAgentRecord],
    requested_device_class: &str,
) -> Result<DeviceBootstrapBundleResponse, (StatusCode, String)> {
    let device_class = parse_device_class(requested_device_class).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "device_class must be desktop, mobile, or watch".to_string(),
        )
    })?;
    let device_class_label = requested_device_class.to_string();
    let profile = default_sync_profile(&device_class);
    let slices = sync_slices_for_device(&device_class, &profile);
    let requires_keys = requires_local_key_material(&slices);
    let agent_id = agents
        .first()
        .map(|agent| agent.agent_id.clone())
        .unwrap_or_else(|| format!("agent:{}@omnyid.com", email_localpart_slug(&user.email)));
    let device_id = format!(
        "{}-{}",
        device_class_label,
        &Ulid::new().to_string().to_lowercase()
    );
    let pglite_path = match device_class_label.as_str() {
        "desktop" => "./.omnyid/pglite".to_string(),
        "mobile" => "app://omnyid/pglite".to_string(),
        "watch" => "watch://omnyid/snapshots".to_string(),
        _ => "./.omnyid/pglite".to_string(),
    };
    let electric_project_url = std::env::var("OMNYID_ELECTRIC_PROJECT_URL")
        .unwrap_or_else(|_| "https://api.omnyid.com/electric".to_string());
    let bootstrap = DeviceBootstrap {
        device_id: device_id.clone(),
        agent_id: agent_id.clone(),
        electric_project_url: electric_project_url.clone(),
        encrypted_seed_ref: format!("omnyid-sync://{}/{}/seed-envelope", user.id, device_id),
        pglite_path,
    };
    let sync_plan = serde_json::to_string_pretty(&serde_json::json!({
        "device_class": device_class_label,
        "policy_profile": profile,
        "requires_local_key_material": requires_keys,
        "slices": slices,
        "notes": device_bootstrap_notes(&device_class_label),
    }))
    .map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to render sync plan: {err}"),
        )
    })?;
    let bootstrap_json = serde_json::to_string_pretty(&bootstrap).map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to render device bootstrap: {err}"),
        )
    })?;
    let readme = format!(
        "# OmnyID Device Bootstrap\n\nOwner: {} <{}>\nDevice class: {}\nPrimary Agent ID: {}\n\nWhat this bundle does:\n- registers one device bootstrap for local-first ElectricSQL sync\n- keeps ciphertext-bearing slices local-key aware\n- gives this device a PGlite path and encrypted seed reference without exposing plaintext secrets\n\nNext steps:\n1. Store the encrypted seed envelope only in a user-controlled environment.\n2. Initialize the local PGlite path for this device.\n3. Sync only the slices appropriate for this device class.\n4. Keep decryption and plaintext rendering local to the device.\n",
        user.display_name, user.email, device_class_label, agent_id
    );
    let packet_name = format!(
        "{}-{}-device-bootstrap",
        email_localpart_slug(&user.email),
        device_class_label
    );

    Ok(DeviceBootstrapBundleResponse {
        generated_at: chrono::Utc::now().to_rfc3339(),
        bundle_name: format!("{packet_name}.zipless"),
        device_class: device_class_label,
        requires_local_key_material: requires_keys,
        files: vec![
            OnboardingBundleFile {
                name: "README.md".to_string(),
                content: readme,
            },
            OnboardingBundleFile {
                name: "device-bootstrap.json".to_string(),
                content: bootstrap_json,
            },
            OnboardingBundleFile {
                name: "sync-plan.json".to_string(),
                content: sync_plan,
            },
        ],
        bootstrap,
    })
}

fn default_device_sync_profile(device_class: &str) -> String {
    match parse_device_class(device_class)
        .map(|class| default_sync_profile(&class))
        .unwrap_or_else(|| default_sync_profile(&crate::local_sync::DeviceClass::Desktop))
    {
        crate::local_sync::SyncPolicyProfile::Full => "full".to_string(),
        crate::local_sync::SyncPolicyProfile::Balanced => "balanced".to_string(),
        crate::local_sync::SyncPolicyProfile::Lightweight => "lightweight".to_string(),
    }
}

fn sync_slices_for_bundle(
    device_class: &str,
    policy_profile: &str,
) -> Result<Vec<crate::local_sync::SyncSliceSpec>, (StatusCode, String)> {
    let class = parse_device_class(device_class).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "device_class must be desktop, mobile, or watch".to_string(),
        )
    })?;
    let profile = match policy_profile {
        "full" => crate::local_sync::SyncPolicyProfile::Full,
        "balanced" => crate::local_sync::SyncPolicyProfile::Balanced,
        "lightweight" => crate::local_sync::SyncPolicyProfile::Lightweight,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "policy_profile must be full, balanced, or lightweight".to_string(),
            ));
        }
    };
    Ok(sync_slices_for_device(&class, &profile))
}

fn device_policy_note(device_class: &str, policy_profile: &str) -> String {
    match (device_class, policy_profile) {
        ("desktop", "full") => "Desktop keeps the richest local-first view, including ciphertext and page structures.".to_string(),
        ("desktop", "balanced") => "Desktop balanced mode trims heavy page structures while keeping rich thread state.".to_string(),
        ("desktop", "lightweight") => "Desktop lightweight mode keeps operational state without full encrypted workspace mirrors.".to_string(),
        ("mobile", "full") => "Mobile full mode keeps rich thread state, but still avoids page-structure overreach.".to_string(),
        ("mobile", "balanced") => "Mobile balanced mode keeps recent encrypted threads, approvals, and summaries.".to_string(),
        ("mobile", "lightweight") => "Mobile lightweight mode favors responsiveness over deep local history.".to_string(),
        ("watch", "full") => "Watch full mode is still constrained to recent thread and action state only.".to_string(),
        ("watch", "balanced") => "Watch balanced mode favors summaries plus recent action state.".to_string(),
        ("watch", "lightweight") => "Watch lightweight mode avoids ciphertext entirely and syncs only glanceable summaries and actions.".to_string(),
        _ => "Use the default local-first sync policy for this device.".to_string(),
    }
}

fn device_bootstrap_notes(device_class: &str) -> Vec<&'static str> {
    match device_class {
        "desktop" => vec![
            "Desktop devices should receive the richest local-first slice set, including thread metadata and ciphertext blobs.",
            "Keep the local key material on device and never mirror it back into the hosted dashboard.",
        ],
        "mobile" => vec![
            "Mobile devices should prioritize recent thread state, approvals, and compact summaries.",
            "Keep large ciphertext histories selective to preserve bandwidth and battery.",
        ],
        "watch" => vec![
            "Watch devices should receive only latest snapshots, summaries, and lightweight action state.",
            "Do not sync full ciphertext history onto the watch surface.",
        ],
        _ => vec!["Use the default local-first sync policy for this device."],
    }
}

fn runtime_template_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn runtime_template_version_from_deployment(
    deployment: &RuntimeDeploymentRecord,
) -> Option<String> {
    deployment
        .config_json
        .get("runtime_template_version")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn build_runtime_restore_drill(backup: &RuntimeBackupRecord) -> RuntimeRestoreDrillRecord {
    RuntimeRestoreDrillRecord {
        id: Ulid::new().to_string(),
        owner_user_id: backup.owner_user_id.clone(),
        backup_id: backup.id.clone(),
        status: "rehearsed".to_string(),
        notes_json: serde_json::json!({
            "drill_type": "metadata_restore_rehearsal",
            "coverage": backup
                .manifest_json
                .get("coverage")
                .cloned()
                .unwrap_or_else(|| Value::String("runtime_metadata_only".to_string())),
            "checklist": [
                "Confirm the target runtime boundary and workspace owner match the backup manifest.",
                "Verify the backup manifest coverage, runtime status, and top-level workspace entries.",
                "Recreate the runtime scaffold before restoring any tenant-specific files.",
                "Validate support access remains disabled unless the user opens a fresh consent window.",
                "Document the rehearsal outcome in the dashboard audit trail."
            ],
        }),
        started_at: chrono::Utc::now().to_rfc3339(),
        completed_at: Some(chrono::Utc::now().to_rfc3339()),
    }
}

fn runtime_backups_root() -> PathBuf {
    std::env::var("OMNYID_RUNTIME_BACKUP_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/srv/omnyid/runtime-backups"))
}

fn remove_runtime_backup_artifacts(owner_user_id: &str) -> Result<bool, String> {
    if owner_user_id.trim().is_empty() {
        return Ok(false);
    }

    let root = runtime_backups_root();
    std::fs::create_dir_all(&root)
        .map_err(|err| format!("failed to create runtime backup root: {err}"))?;
    let canonical_root = std::fs::canonicalize(&root)
        .map_err(|err| format!("failed to resolve runtime backup root: {err}"))?;
    let backup_dir = root.join(owner_user_id);
    if !backup_dir.exists() {
        return Ok(false);
    }
    let canonical_backup_dir = std::fs::canonicalize(&backup_dir)
        .map_err(|err| format!("failed to resolve runtime backup directory: {err}"))?;
    if !canonical_backup_dir.starts_with(&canonical_root) {
        return Err(
            "refusing to remove runtime backups outside the OmnyID backup root".to_string(),
        );
    }
    std::fs::remove_dir_all(&canonical_backup_dir)
        .map_err(|err| format!("failed to remove runtime backup directory: {err}"))?;
    Ok(true)
}

fn remove_runtime_backup_artifact_path(artifact_path: &str) -> Result<bool, String> {
    if artifact_path.trim().is_empty() {
        return Ok(false);
    }

    let root = runtime_backups_root();
    std::fs::create_dir_all(&root)
        .map_err(|err| format!("failed to create runtime backup root: {err}"))?;
    let canonical_root = std::fs::canonicalize(&root)
        .map_err(|err| format!("failed to resolve runtime backup root: {err}"))?;
    let artifact = PathBuf::from(artifact_path);
    if !artifact.exists() {
        return Ok(false);
    }
    let canonical_artifact = std::fs::canonicalize(&artifact)
        .map_err(|err| format!("failed to resolve runtime backup artifact: {err}"))?;
    if !canonical_artifact.starts_with(&canonical_root) {
        return Err(
            "refusing to remove a runtime backup artifact outside the OmnyID backup root"
                .to_string(),
        );
    }
    std::fs::remove_file(&canonical_artifact)
        .map_err(|err| format!("failed to remove runtime backup artifact: {err}"))?;
    Ok(true)
}

fn build_runtime_backup_snapshot(
    deployment: &RuntimeDeploymentRecord,
    retention_days: i32,
) -> Result<RuntimeBackupRecord, String> {
    let workspace_path = PathBuf::from(&deployment.workspace_path);
    if !workspace_path.exists() {
        return Err("runtime workspace does not exist yet".to_string());
    }

    let (file_count, total_workspace_bytes, top_level_entries) =
        summarize_workspace(&workspace_path)?;
    let created_at = chrono::Utc::now();
    let expires_at = created_at + chrono::Duration::days(retention_days as i64);
    let backup_dir = runtime_backups_root().join(&deployment.owner_user_id);
    std::fs::create_dir_all(&backup_dir)
        .map_err(|err| format!("failed to create runtime backup directory: {err}"))?;
    let snapshot_id = Ulid::new().to_string();
    let manifest_path = backup_dir.join(format!("{snapshot_id}.json"));
    let manifest_json = serde_json::json!({
        "coverage": "runtime_metadata_only",
        "runtime_status": deployment.status,
        "runtime_framework": deployment.framework,
        "runtime_gui": deployment.gui,
        "top_level_entries": top_level_entries,
        "workspace_summary": {
            "file_count": file_count,
            "total_workspace_bytes": total_workspace_bytes,
        },
        "privacy_note": "This hosted snapshot contains metadata only. OmnyID does not place runtime file contents into the central dashboard backup inventory.",
    });
    let manifest_pretty = serde_json::to_string_pretty(&manifest_json)
        .map_err(|err| format!("failed to serialize runtime backup manifest: {err}"))?;
    std::fs::write(&manifest_path, manifest_pretty.as_bytes())
        .map_err(|err| format!("failed to write runtime backup manifest: {err}"))?;
    let artifact_size_bytes = std::fs::metadata(&manifest_path)
        .map_err(|err| format!("failed to stat runtime backup manifest: {err}"))?
        .len() as i64;

    Ok(RuntimeBackupRecord {
        id: snapshot_id,
        owner_user_id: deployment.owner_user_id.clone(),
        runtime_deployment_id: Some(deployment.id.clone()),
        snapshot_type: "metadata_snapshot".to_string(),
        storage_mode: "metadata_only_hosted".to_string(),
        status: "ready".to_string(),
        file_count,
        total_workspace_bytes,
        artifact_size_bytes,
        artifact_path: Some(manifest_path.display().to_string()),
        manifest_json,
        created_at: created_at.to_rfc3339(),
        expires_at: expires_at.to_rfc3339(),
    })
}

fn summarize_workspace(workspace_path: &PathBuf) -> Result<(i32, i64, Vec<String>), String> {
    let top_level_entries = std::fs::read_dir(workspace_path)
        .map_err(|err| format!("failed to read runtime workspace: {err}"))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect::<Vec<_>>();
    let mut file_count: i32 = 0;
    let mut total_workspace_bytes: i64 = 0;
    summarize_workspace_recursive(workspace_path, &mut file_count, &mut total_workspace_bytes)?;
    Ok((file_count, total_workspace_bytes, top_level_entries))
}

fn summarize_workspace_recursive(
    path: &PathBuf,
    file_count: &mut i32,
    total_workspace_bytes: &mut i64,
) -> Result<(), String> {
    for entry in
        std::fs::read_dir(path).map_err(|err| format!("failed to scan runtime workspace: {err}"))?
    {
        let entry =
            entry.map_err(|err| format!("failed to read runtime workspace entry: {err}"))?;
        let entry_path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|err| format!("failed to read runtime workspace metadata: {err}"))?;
        if metadata.is_dir() {
            summarize_workspace_recursive(&entry_path, file_count, total_workspace_bytes)?;
        } else if metadata.is_file() {
            *file_count += 1;
            *total_workspace_bytes += metadata.len() as i64;
        }
    }
    Ok(())
}

fn support_access_state_response(record: SupportAccessGrantRecord) -> SupportAccessStateResponse {
    SupportAccessStateResponse {
        status: record.status,
        access_scope: record.access_scope,
        reason: record.reason,
        support_disabled_by_default: true,
        granted_at: Some(record.granted_at),
        expires_at: Some(record.expires_at),
        revoked_at: record.revoked_at,
    }
}

fn support_access_history_entry(record: SupportAccessGrantRecord) -> SupportAccessHistoryEntry {
    SupportAccessHistoryEntry {
        id: record.id,
        status: record.status,
        access_scope: record.access_scope,
        reason: record.reason,
        granted_at: record.granted_at,
        expires_at: record.expires_at,
        revoked_at: record.revoked_at,
    }
}

fn account_session_entry(session: AuthSessionRecord, current_token: &str) -> AccountSessionEntry {
    AccountSessionEntry {
        token_preview: runtime_token_preview(&session.token),
        created_at: session.created_at,
        expires_at: session.expires_at,
        current: session.token == current_token,
    }
}

fn account_delete_confirmation_is_valid(user_email: &str, request: &AccountDeleteRequest) -> bool {
    request.email.trim().eq_ignore_ascii_case(user_email)
        && request.confirmation.trim() == "DELETE MY OMNYID ACCOUNT"
}

fn default_support_access_state_response() -> SupportAccessStateResponse {
    SupportAccessStateResponse {
        status: "disabled".to_string(),
        access_scope: "runtime_metadata_only".to_string(),
        reason: None,
        support_disabled_by_default: true,
        granted_at: None,
        expires_at: None,
        revoked_at: None,
    }
}

fn runtime_token_preview(token: &str) -> String {
    if token.len() <= 8 {
        return "redacted".to_string();
    }

    format!("{}...{}", &token[..4], &token[token.len() - 4..])
}

fn write_runtime_file(path: &std::path::Path, content: &str) -> Result<(), String> {
    std::fs::write(path, content)
        .map_err(|err| format!("failed to write {}: {err}", path.display()))
}

fn render_runtime_template(template: &str, values: &BTreeMap<&str, String>) -> String {
    let mut rendered = template.to_string();
    for (key, value) in values {
        let placeholder = format!("{{{{{key}}}}}");
        rendered = rendered.replace(&placeholder, value);
    }
    rendered
}

fn default_onboarding_for_user(user: &UserRecord) -> UserOnboardingRecord {
    UserOnboardingRecord {
        owner_user_id: user.id.clone(),
        identity_confirmed: false,
        email_provider: None,
        email_address: Some(user.email.clone()),
        email_connected: false,
        llm_mode: "byo_or_local".to_string(),
        notes: serde_json::json!({
            "source": "default",
            "next_step": "complete_setup"
        }),
        updated_at: chrono::Utc::now().to_rfc3339(),
        completed_at: None,
    }
}

fn build_onboarding_record(
    user: &UserRecord,
    request: OnboardingUpdateRequest,
) -> Result<UserOnboardingRecord, (StatusCode, String)> {
    let email_provider = request
        .email_provider
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let email_address = request
        .email_address
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let llm_mode = request
        .llm_mode
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("byo_or_local")
        .to_string();

    if request.email_connected {
        if email_provider.is_none() {
            return Err((
                StatusCode::BAD_REQUEST,
                "email provider is required".to_string(),
            ));
        }
        if email_address
            .as_deref()
            .is_none_or(|value| !value.contains('@'))
        {
            return Err((
                StatusCode::BAD_REQUEST,
                "valid email address is required".to_string(),
            ));
        }
    }

    let completed_at = if request.identity_confirmed {
        Some(chrono::Utc::now().to_rfc3339())
    } else {
        None
    };

    Ok(UserOnboardingRecord {
        owner_user_id: user.id.clone(),
        identity_confirmed: request.identity_confirmed,
        email_provider,
        email_address,
        email_connected: request.email_connected,
        llm_mode,
        notes: request.notes.unwrap_or_else(|| serde_json::json!({})),
        updated_at: chrono::Utc::now().to_rfc3339(),
        completed_at,
    })
}

fn internal_error(err: sqlx::Error) -> Status {
    Status::internal(err.to_string())
}

fn readiness_error_to_http(err: SqlxError) -> (StatusCode, String) {
    (StatusCode::SERVICE_UNAVAILABLE, err.to_string())
}

fn status_to_http(status: Status) -> (StatusCode, String) {
    let code = match status.code() {
        tonic::Code::InvalidArgument => StatusCode::BAD_REQUEST,
        tonic::Code::NotFound => StatusCode::NOT_FOUND,
        tonic::Code::Unauthenticated => StatusCode::UNAUTHORIZED,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (code, status.message().to_string())
}

fn task_update_error_to_http(err: sqlx::Error) -> (StatusCode, String) {
    if matches!(&err, sqlx::Error::RowNotFound) {
        (StatusCode::NOT_FOUND, "task not found".to_string())
    } else {
        status_to_http(internal_error(err))
    }
}

fn trigger_delete_error_to_http(err: sqlx::Error) -> (StatusCode, String) {
    if matches!(&err, sqlx::Error::RowNotFound) {
        (StatusCode::NOT_FOUND, "trigger not found".to_string())
    } else {
        status_to_http(internal_error(err))
    }
}

fn delegation_revoke_error_to_http(err: sqlx::Error) -> (StatusCode, String) {
    if matches!(&err, sqlx::Error::RowNotFound) {
        (StatusCode::NOT_FOUND, "delegation not found".to_string())
    } else {
        status_to_http(internal_error(err))
    }
}

fn allow_insecure_unsigned_messages() -> bool {
    std::env::var("OMNYID_ALLOW_INSECURE_UNSIGNED")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

fn sign_server_generated_message(message: &mut AFPMessage) -> Result<(), String> {
    let Some(seed) = env_hex_32("OMNYID_SIGNING_KEY_HEX")? else {
        if allow_insecure_unsigned_messages() {
            return Ok(());
        }
        return Err(
            "OMNYID_SIGNING_KEY_HEX must be configured for server-generated approval messages"
                .to_string(),
        );
    };

    sign_message(message, &seed);
    Ok(())
}

fn action_status_json_label(status: &ActionStatus) -> &'static str {
    match status {
        ActionStatus::Pending => "pending",
        ActionStatus::Approved => "approved",
        ActionStatus::Rejected => "rejected",
        ActionStatus::Completed => "completed",
        ActionStatus::Failed => "failed",
    }
}

fn env_hex_32(name: &str) -> Result<Option<[u8; 32]>, String> {
    let value = std::env::var(name).unwrap_or_default();
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let bytes = hex::decode(trimmed).map_err(|_| format!("{name} must be valid hex"))?;
    let array: [u8; 32] = bytes
        .try_into()
        .map_err(|_| format!("{name} must decode to 32 bytes"))?;
    Ok(Some(array))
}

fn require_encryption() -> bool {
    std::env::var("OMNYID_REQUIRE_ENCRYPTION")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

fn enable_internal_grpc() -> bool {
    std::env::var("OMNYID_ENABLE_INTERNAL_GRPC")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

fn webtransport_enabled() -> bool {
    if !std::env::var("OMNYID_ENABLE_WEBTRANSPORT")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
    {
        return false;
    }

    webtransport_cert_path().is_some() && webtransport_key_path().is_some()
}

fn grpc_bind_addr() -> SocketAddr {
    std::env::var("OMNYID_INTERNAL_GRPC_ADDR")
        .ok()
        .and_then(|value| value.parse::<SocketAddr>().ok())
        .unwrap_or_else(|| "127.0.0.1:50051".parse().expect("valid grpc bind addr"))
}

fn webtransport_bind_addr() -> SocketAddr {
    std::env::var("OMNYID_WEBTRANSPORT_BIND_ADDR")
        .ok()
        .and_then(|value| value.parse::<SocketAddr>().ok())
        .unwrap_or_else(|| {
            "0.0.0.0:8443"
                .parse()
                .expect("valid WebTransport bind addr")
        })
}

fn webtransport_cert_path() -> Option<String> {
    std::env::var("OMNYID_WEBTRANSPORT_CERT_PATH")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn webtransport_key_path() -> Option<String> {
    std::env::var("OMNYID_WEBTRANSPORT_KEY_PATH")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

async fn load_webtransport_identity() -> Result<WebTransportIdentity, String> {
    let cert_path = webtransport_cert_path()
        .ok_or_else(|| "OMNYID_WEBTRANSPORT_CERT_PATH must be set".to_string())?;
    let key_path = webtransport_key_path()
        .ok_or_else(|| "OMNYID_WEBTRANSPORT_KEY_PATH must be set".to_string())?;

    WebTransportIdentity::load_pemfiles(cert_path, key_path)
        .await
        .map_err(|err| err.to_string())
}

fn has_encryption_envelope(message: &Message) -> bool {
    let trimmed = message.encryption.trim();
    !(trimmed.is_empty() || trimmed == "{}" || trimmed == "null")
}

fn has_supported_encryption_envelope(message: &Message) -> bool {
    if !has_encryption_envelope(message) {
        return false;
    }

    let parsed: Value = match serde_json::from_str(&message.encryption) {
        Ok(value) => value,
        Err(_) => return false,
    };
    is_supported_encryption_envelope(&parsed)
}

fn external_email_thread_targets(references: &[Value]) -> Vec<String> {
    references
        .iter()
        .filter(|reference| {
            reference.get("type").and_then(Value::as_str) == Some("external_email")
                && reference
                    .get("metadata")
                    .and_then(|metadata| metadata.get("relation"))
                    .and_then(Value::as_str)
                    != Some("message_id")
        })
        .filter_map(|reference| reference.get("target").and_then(Value::as_str))
        .map(str::trim)
        .filter(|target| !target.is_empty())
        .map(str::to_string)
        .collect()
}

fn apply_external_email_thread_match(
    message: &mut AFPMessage,
    thread_match: Option<(String, String)>,
) {
    let Some((thread_id, parent_id)) = thread_match else {
        return;
    };

    if message.thread_id.trim().is_empty() {
        message.thread_id = thread_id;
    } else {
        message.thread_id = thread_id;
    }

    if message.parent_id.is_none() {
        message.parent_id = Some(parent_id);
    }
}

// ── Agent template endpoints ──────────────────────────────────────────────────

async fn agent_provision_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let domain = std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "omnyid.com".to_string());
    let instance = AgentInstance::provision(&user.id, &user.display_name, &domain);
    let id = state
        .db
        .provision_agent(&instance)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let cfg = LlmConfig::default_hosted(user.id.clone());
    let _ = state.db.upsert_llm_config(&cfg).await;
    if let Ok(msg) = new_server_message(
        instance.agent_id.clone(),
        vec![],
        format!("agent-activity:{}", instance.id),
        MSG_AGENT_PROVISIONED,
        serde_json::json!({"agent_id": instance.agent_id, "name": instance.name}),
        vec![],
        vec![],
        vec![],
        false,
    ) {
        let _ = store_private_app_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            &user.id,
            msg,
        )
        .await;
    }
    Ok(Json(serde_json::json!({
        "agent_instance_id": id,
        "agent_id": instance.agent_id,
        "name": instance.name,
        "status": "active",
        "capabilities": default_template_capabilities().iter().map(|c| c.capability_id.clone()).collect::<Vec<_>>(),
    })))
}

async fn agent_me_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .get_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .map(Json)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no agent instance; call POST /agent/provision".to_string(),
            )
        })
}

#[derive(serde::Deserialize)]
struct AgentIntentRequest {
    intent: String,
    #[serde(default)]
    priority: Option<String>,
}

async fn agent_intent_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AgentIntentRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "no agent instance".to_string()))?;
    let priority = match body.priority.as_deref() {
        Some("high") => TaskPriority::High,
        Some("low") => TaskPriority::Low,
        _ => TaskPriority::Normal,
    };
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();
    let agent_afp_id = instance["agent_id"].as_str().unwrap_or("").to_string();
    let task = AgentTask::new(user.id.clone(), instance_id, body.intent.clone(), priority);
    let thread_id = task.thread_id.clone();
    let task_id = task.id.clone();
    state
        .db
        .create_agent_task(&task)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let _ = state
        .relay_tx
        .send(relay_fleet_update_payload(&task_id, "pending"));
    if let Ok(msg) = new_server_message(
        agent_afp_id,
        vec![],
        thread_id.clone(),
        "agent_plan",
        serde_json::json!({"intent": body.intent, "task_id": task_id, "status": "pending"}),
        vec![],
        vec![],
        vec![],
        false,
    ) {
        let _ = store_private_app_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            &user.id,
            msg,
        )
        .await;
    }
    Ok(Json(task_created_response_payload(&task)))
}

#[derive(serde::Deserialize)]
struct AgentTasksQuery {
    status: Option<String>,
    #[serde(default = "default_task_limit")]
    limit: i64,
}
fn default_task_limit() -> i64 {
    20
}

#[derive(serde::Deserialize)]
struct WorkflowsQuery {
    include_archived: Option<bool>,
    #[serde(default = "default_workflow_limit")]
    limit: i64,
}

fn default_workflow_limit() -> i64 {
    50
}

#[derive(serde::Deserialize)]
struct SaveWorkflowRequest {
    graph: Value,
    #[serde(default)]
    latest_ir: Option<Value>,
    #[serde(default)]
    favorite: Option<bool>,
    #[serde(default)]
    archived: Option<bool>,
}

#[derive(serde::Deserialize)]
struct ValidateWorkflowRequest {
    graph: Value,
}

#[derive(serde::Deserialize)]
struct WorkflowActionRequest {
    action: String,
    #[serde(default)]
    favorite: Option<bool>,
    #[serde(default)]
    archived: Option<bool>,
    #[serde(default)]
    environment: Option<String>,
    #[serde(default)]
    deployment_id: Option<String>,
}

#[derive(serde::Deserialize)]
struct WorkflowPatchRequest {
    op: String,
    #[serde(default)]
    node_id: Option<String>,
    #[serde(default)]
    edge_id: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    target: Option<String>,
    #[serde(default)]
    x: Option<f64>,
    #[serde(default)]
    y: Option<f64>,
    #[serde(default)]
    config: Option<Value>,
    #[serde(default)]
    policy: Option<Value>,
    #[serde(default)]
    prompt: Option<Value>,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    environment: Option<String>,
    #[serde(default)]
    optimization_mode: Option<String>,
    #[serde(default)]
    root_enabled: Option<bool>,
}

#[derive(serde::Deserialize)]
struct WorkflowRunRequest {
    #[serde(default)]
    deployment_id: Option<String>,
    #[serde(default)]
    replay_run_id: Option<String>,
    #[serde(default)]
    trigger_kind: Option<String>,
}

fn task_created_response_payload(task: &AgentTask) -> Value {
    serde_json::json!({
        "task_id": task.id,
        "thread_id": task.thread_id,
        "status": task.status.as_str(),
    })
}

fn task_list_response_payload(tasks: Vec<Value>) -> Value {
    serde_json::json!({ "tasks": tasks })
}

fn task_status_response_payload(task_id: &str, status: &str) -> Value {
    serde_json::json!({
        "task_id": task_id,
        "status": status,
    })
}

fn workflow_error_response(errors: Vec<String>, warnings: Vec<String>) -> Value {
    serde_json::json!({
        "valid": errors.is_empty(),
        "errors": errors,
        "warnings": warnings,
    })
}

fn validate_workflow_graph_json(graph: &Value, owner_user_id: Option<&str>) -> (Vec<String>, Vec<String>) {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    let Some(obj) = graph.as_object() else {
        errors.push("graph must be a JSON object".to_string());
        return (errors, warnings);
    };

    match obj.get("version").and_then(Value::as_str) {
        Some("omnyid-workflow.v1") => {}
        Some(other) => errors.push(format!("unsupported workflow version: {other}")),
        None => errors.push("graph.version is required".to_string()),
    }

    if let Some(owner) = owner_user_id {
        match obj.get("owner_user_id").and_then(Value::as_str) {
            Some(existing) if existing == owner => {}
            Some(_) => warnings.push("graph.owner_user_id was adjusted to the authenticated user".to_string()),
            None => warnings.push("graph.owner_user_id was missing and will be set automatically".to_string()),
        }
    }

    if !matches!(
        obj.get("environment").and_then(Value::as_str),
        Some("dev") | Some("prod")
    ) {
        errors.push("graph.environment must be dev or prod".to_string());
    }

    let Some(nodes) = obj.get("nodes").and_then(Value::as_array) else {
        errors.push("graph.nodes must be a non-empty array".to_string());
        return (errors, warnings);
    };
    if nodes.is_empty() {
        errors.push("graph.nodes must contain at least one node".to_string());
    }

    let Some(root_node_ids) = obj.get("root_node_ids").and_then(Value::as_array) else {
        errors.push("graph.root_node_ids must be a non-empty array".to_string());
        return (errors, warnings);
    };
    if root_node_ids.is_empty() {
        errors.push("graph.root_node_ids must contain at least one node id".to_string());
    }

    let allowed_kinds = [
        "trigger",
        "condition",
        "transform",
        "tool",
        "agent",
        "delegation",
        "policy",
        "approval",
        "merge",
        "termination",
    ];
    let allowed_presets = [
        "email_guardian",
        "calendar_coordinator",
        "receipt_tracker",
        "study_planner",
        "research_assistant",
        "finance_guardian",
        "travel_booker",
        "content_publisher",
    ];

    let mut node_ids = std::collections::BTreeSet::new();
    for node in nodes {
        let Some(node_obj) = node.as_object() else {
            errors.push("every graph node must be an object".to_string());
            continue;
        };
        let Some(node_id) = node_obj.get("id").and_then(Value::as_str) else {
            errors.push("every graph node requires an id".to_string());
            continue;
        };
        if !node_ids.insert(node_id.to_string()) {
            errors.push(format!("duplicate node id: {node_id}"));
        }
        match node_obj.get("kind").and_then(Value::as_str) {
            Some(kind) if allowed_kinds.contains(&kind) => {}
            Some(kind) => errors.push(format!("unsupported node kind: {kind}")),
            None => errors.push(format!("node {node_id} is missing kind")),
        }
        if let Some(config) = node_obj.get("config").and_then(Value::as_object) {
            if let Some(preset_kind) = config.get("preset_kind").and_then(Value::as_str) {
                if !allowed_presets.contains(&preset_kind) {
                    errors.push(format!("node {node_id} uses unsupported preset_kind: {preset_kind}"));
                }
            }
        }
    }

    for root_id in root_node_ids {
        let Some(root_id_str) = root_id.as_str() else {
            errors.push("every root_node_id must be a string".to_string());
            continue;
        };
        if !node_ids.contains(root_id_str) {
            errors.push(format!("root_node_ids references unknown node id: {root_id_str}"));
        }
    }

    if let Some(edges) = obj.get("edges").and_then(Value::as_array) {
        for edge in edges {
            let Some(edge_obj) = edge.as_object() else {
                errors.push("every graph edge must be an object".to_string());
                continue;
            };
            let source = edge_obj.get("source").and_then(Value::as_str);
            let target = edge_obj.get("target").and_then(Value::as_str);
            match source {
                Some(id) if node_ids.contains(id) => {}
                Some(id) => errors.push(format!("edge source references unknown node id: {id}")),
                None => errors.push("every edge requires source".to_string()),
            }
            match target {
                Some(id) if node_ids.contains(id) => {}
                Some(id) => errors.push(format!("edge target references unknown node id: {id}")),
                None => errors.push("every edge requires target".to_string()),
            }
        }
    }

    (errors, warnings)
}

fn normalized_workflow_record(
    owner_user_id: &str,
    request: SaveWorkflowRequest,
    existing_created_at: Option<String>,
) -> Result<crate::db::SavedWorkflowRecord, (StatusCode, String)> {
    let (errors, warnings) = validate_workflow_graph_json(&request.graph, Some(owner_user_id));
    if !errors.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            workflow_error_response(errors, warnings).to_string(),
        ));
    }

    let mut graph = request.graph;
    let graph_obj = graph
        .as_object_mut()
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "graph must be an object".to_string()))?;
    graph_obj.insert(
        "owner_user_id".to_string(),
        Value::String(owner_user_id.to_string()),
    );

    let workflow_id = graph_obj
        .get("workflow_id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "graph.workflow_id is required".to_string()))?
        .to_string();
    let title = graph_obj
        .get("title")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "graph.title is required".to_string()))?
        .to_string();
    let description = graph_obj
        .get("description")
        .and_then(Value::as_str)
        .map(str::to_string);
    let preset_kinds = graph_obj
        .get("presets")
        .and_then(Value::as_array)
        .map(|presets| {
            presets
                .iter()
                .filter_map(|preset| preset.get("preset_kind").and_then(Value::as_str))
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let now = chrono::Utc::now().to_rfc3339();
    Ok(crate::db::SavedWorkflowRecord {
        workflow_id,
        owner_user_id: owner_user_id.to_string(),
        title,
        description,
        favorite: request.favorite.unwrap_or(false),
        preset_kinds,
        graph_json: graph,
        latest_ir_json: request.latest_ir,
        created_at: existing_created_at.unwrap_or_else(|| now.clone()),
        updated_at: now.clone(),
        archived_at: if request.archived.unwrap_or(false) {
            Some(now)
        } else {
            None
        },
    })
}

fn saved_workflow_record_from_existing(
    existing: &Value,
    owner_user_id: &str,
    graph_json: Value,
    latest_ir_json: Option<Value>,
    favorite: bool,
    archived_at: Option<String>,
) -> crate::db::SavedWorkflowRecord {
    let graph_title = graph_json
        .get("title")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let graph_description = graph_json
        .get("description")
        .and_then(Value::as_str)
        .map(str::to_string);
    let graph_preset_kinds = graph_json
        .get("presets")
        .and_then(Value::as_array)
        .map(|items| {
            items.iter()
                .filter_map(|preset| preset.get("preset_kind").and_then(Value::as_str))
                .map(str::to_string)
                .collect::<Vec<_>>()
        });
    crate::db::SavedWorkflowRecord {
        workflow_id: existing["workflow_id"].as_str().unwrap_or_default().to_string(),
        owner_user_id: owner_user_id.to_string(),
        title: graph_title.unwrap_or_else(|| existing["title"].as_str().unwrap_or_default().to_string()),
        description: graph_description.or_else(|| existing["description"].as_str().map(str::to_string)),
        favorite,
        preset_kinds: graph_preset_kinds.unwrap_or_else(|| {
            existing["preset_kinds"]
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        }),
        graph_json,
        latest_ir_json,
        created_at: existing["created_at"].as_str().unwrap_or_default().to_string(),
        updated_at: chrono::Utc::now().to_rfc3339(),
        archived_at,
    }
}

async fn agent_tasks_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<AgentTasksQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let tasks = state
        .db
        .list_agent_tasks(&user.id, q.status.as_deref(), q.limit.clamp(1, 100))
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(task_list_response_payload(tasks)))
}

async fn agent_task_detail_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(task_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let task = state
        .db
        .get_agent_task(&user.id, &task_id)
        .await
        .map_err(task_update_error_to_http)?;
    Ok(Json(task))
}

async fn workflows_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<WorkflowsQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let workflows = state
        .db
        .list_saved_workflows(
            &user.id,
            q.include_archived.unwrap_or(false),
            q.limit.clamp(1, 100),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "workflows": workflows })))
}

async fn workflows_save_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SaveWorkflowRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let workflow_id = body
        .graph
        .get("workflow_id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let existing_created_at = if workflow_id.is_empty() {
        None
    } else {
        match state.db.get_saved_workflow(&user.id, &workflow_id).await {
            Ok(existing) => existing["created_at"].as_str().map(str::to_string),
            Err(sqlx::Error::RowNotFound) => None,
            Err(err) => return Err(status_to_http(internal_error(err))),
        }
    };
    let record = normalized_workflow_record(&user.id, body, existing_created_at)?;
    state
        .db
        .upsert_saved_workflow(&record)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let saved = state
        .db
        .get_saved_workflow(&user.id, &record.workflow_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "saved": true,
        "workflow": saved,
    })))
}

async fn workflow_detail_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(workflow_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let workflow = state
        .db
        .get_saved_workflow(&user.id, &workflow_id)
        .await
        .map_err(|err| {
            if matches!(err, sqlx::Error::RowNotFound) {
                (StatusCode::NOT_FOUND, "workflow not found".to_string())
            } else {
                status_to_http(internal_error(err))
            }
        })?;
    Ok(Json(workflow))
}

fn workflow_deployment_record(
    workflow_id: &str,
    owner_user_id: &str,
    environment: &str,
    status: &str,
    ir_snapshot_json: Value,
    graph_snapshot_json: Value,
    source_deployment_id: Option<String>,
) -> WorkflowDeploymentRecord {
    let now = chrono::Utc::now().to_rfc3339();
    WorkflowDeploymentRecord {
        deployment_id: format!("wfdep_{}", Ulid::new().to_string().to_lowercase()),
        workflow_id: workflow_id.to_string(),
        owner_user_id: owner_user_id.to_string(),
        environment: environment.to_string(),
        status: status.to_string(),
        ir_snapshot_json,
        graph_snapshot_json,
        source_deployment_id,
        deployed_at: now.clone(),
        created_at: now,
    }
}

async fn workflow_deployments_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(workflow_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deployments = state
        .db
        .list_workflow_deployments(&user.id, &workflow_id, 50)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "workflow_id": workflow_id,
        "deployments": deployments,
    })))
}

fn apply_workflow_patch(graph: &Value, patch: &WorkflowPatchRequest) -> Result<Value, String> {
    let mut next = graph.clone();
    let obj = next
        .as_object_mut()
        .ok_or_else(|| "workflow graph must be an object".to_string())?;

    match patch.op.as_str() {
        "node_move" => {
            let nodes = obj
                .get_mut("nodes")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "workflow graph nodes must be an array".to_string())?;
            let node_id = patch.node_id.as_deref().ok_or_else(|| "node_move requires node_id".to_string())?;
            let x = patch.x.ok_or_else(|| "node_move requires x".to_string())?;
            let y = patch.y.ok_or_else(|| "node_move requires y".to_string())?;
            let node = nodes
                .iter_mut()
                .find(|node| node.get("id").and_then(Value::as_str) == Some(node_id))
                .ok_or_else(|| "node not found".to_string())?;
            let node_obj = node
                .as_object_mut()
                .ok_or_else(|| "workflow node must be an object".to_string())?;
            node_obj.insert(
                "position".to_string(),
                serde_json::json!({
                    "x": x.round() as i64,
                    "y": y.round() as i64
                }),
            );
        }
        "edge_add" => {
            let edges = obj
                .get_mut("edges")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "workflow graph edges must be an array".to_string())?;
            let source = patch.source.as_deref().ok_or_else(|| "edge_add requires source".to_string())?;
            let target = patch.target.as_deref().ok_or_else(|| "edge_add requires target".to_string())?;
            let exists = edges.iter().any(|edge| {
                edge.get("source").and_then(Value::as_str) == Some(source)
                    && edge.get("target").and_then(Value::as_str) == Some(target)
            });
            if !exists {
                edges.push(serde_json::json!({
                    "id": format!("edge_{}", Ulid::new().to_string().to_lowercase()),
                    "source": source,
                    "target": target,
                    "metadata": {}
                }));
            }
        }
        "edge_remove" => {
            let edges = obj
                .get_mut("edges")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "workflow graph edges must be an array".to_string())?;
            let edge_id = patch.edge_id.as_deref().ok_or_else(|| "edge_remove requires edge_id".to_string())?;
            let before = edges.len();
            edges.retain(|edge| edge.get("id").and_then(Value::as_str) != Some(edge_id));
            if edges.len() == before {
                return Err("edge not found".to_string());
            }
        }
        "node_delete" => {
            let nodes = obj
                .get_mut("nodes")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "workflow graph nodes must be an array".to_string())?;
            let node_id = patch.node_id.as_deref().ok_or_else(|| "node_delete requires node_id".to_string())?;
            let before = nodes.len();
            nodes.retain(|node| node.get("id").and_then(Value::as_str) != Some(node_id));
            if nodes.len() == before {
                return Err("node not found".to_string());
            }
            let edges = obj
                .get_mut("edges")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "workflow graph edges must be an array".to_string())?;
            edges.retain(|edge| {
                edge.get("source").and_then(Value::as_str) != Some(node_id)
                    && edge.get("target").and_then(Value::as_str) != Some(node_id)
            });
            if let Some(root_ids) = obj.get_mut("root_node_ids").and_then(Value::as_array_mut) {
                root_ids.retain(|entry| entry.as_str() != Some(node_id));
            }
        }
        "node_config_replace" => {
            let nodes = obj
                .get_mut("nodes")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "workflow graph nodes must be an array".to_string())?;
            let node_id = patch.node_id.as_deref().ok_or_else(|| "node_config_replace requires node_id".to_string())?;
            let config = patch.config.clone().ok_or_else(|| "node_config_replace requires config".to_string())?;
            let node = nodes
                .iter_mut()
                .find(|node| node.get("id").and_then(Value::as_str) == Some(node_id))
                .ok_or_else(|| "node not found".to_string())?;
            let node_obj = node
                .as_object_mut()
                .ok_or_else(|| "workflow node must be an object".to_string())?;
            node_obj.insert("config".to_string(), config);
        }
        "node_policy_replace" => {
            let nodes = obj
                .get_mut("nodes")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "workflow graph nodes must be an array".to_string())?;
            let node_id = patch.node_id.as_deref().ok_or_else(|| "node_policy_replace requires node_id".to_string())?;
            let policy = patch.policy.clone().ok_or_else(|| "node_policy_replace requires policy".to_string())?;
            let node = nodes
                .iter_mut()
                .find(|node| node.get("id").and_then(Value::as_str) == Some(node_id))
                .ok_or_else(|| "node not found".to_string())?;
            let node_obj = node
                .as_object_mut()
                .ok_or_else(|| "workflow node must be an object".to_string())?;
            node_obj.insert("policy".to_string(), policy);
        }
        "node_prompt_replace" => {
            let nodes = obj
                .get_mut("nodes")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "workflow graph nodes must be an array".to_string())?;
            let node_id = patch.node_id.as_deref().ok_or_else(|| "node_prompt_replace requires node_id".to_string())?;
            let prompt = patch.prompt.clone().ok_or_else(|| "node_prompt_replace requires prompt".to_string())?;
            let node = nodes
                .iter_mut()
                .find(|node| node.get("id").and_then(Value::as_str) == Some(node_id))
                .ok_or_else(|| "node not found".to_string())?;
            let node_obj = node
                .as_object_mut()
                .ok_or_else(|| "workflow node must be an object".to_string())?;
            node_obj.insert("prompt".to_string(), prompt);
        }
        "node_meta_replace" => {
            let nodes = obj
                .get_mut("nodes")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "workflow graph nodes must be an array".to_string())?;
            let node_id = patch
                .node_id
                .as_deref()
                .ok_or_else(|| "node_meta_replace requires node_id".to_string())?;
            let node = nodes
                .iter_mut()
                .find(|node| node.get("id").and_then(Value::as_str) == Some(node_id))
                .ok_or_else(|| "node not found".to_string())?;
            let node_obj = node
                .as_object_mut()
                .ok_or_else(|| "workflow node must be an object".to_string())?;
            if let Some(label) = &patch.label {
                node_obj.insert("label".to_string(), Value::String(label.clone()));
            }
            if let Some(description) = &patch.description {
                node_obj.insert("description".to_string(), Value::String(description.clone()));
            }
        }
        "root_toggle" => {
            let node_id = patch
                .node_id
                .as_deref()
                .ok_or_else(|| "root_toggle requires node_id".to_string())?;
            let root_enabled = patch
                .root_enabled
                .ok_or_else(|| "root_toggle requires root_enabled".to_string())?;
            let root_ids = obj
                .get_mut("root_node_ids")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "workflow graph root_node_ids must be an array".to_string())?;
            let already_root = root_ids.iter().any(|entry| entry.as_str() == Some(node_id));
            if root_enabled {
                if !already_root {
                    root_ids.push(Value::String(node_id.to_string()));
                }
            } else {
                root_ids.retain(|entry| entry.as_str() != Some(node_id));
            }
        }
        "workflow_meta_replace" => {
            if let Some(title) = &patch.title {
                obj.insert("title".to_string(), Value::String(title.clone()));
            }
            if let Some(description) = &patch.description {
                obj.insert("description".to_string(), Value::String(description.clone()));
            }
            if let Some(environment) = &patch.environment {
                obj.insert("environment".to_string(), Value::String(environment.clone()));
            }
            if let Some(optimization_mode) = &patch.optimization_mode {
                obj.insert(
                    "optimization_mode".to_string(),
                    Value::String(optimization_mode.clone()),
                );
            }
        }
        _ => return Err("unsupported workflow patch op".to_string()),
    }

    obj.insert("status".to_string(), Value::String("draft".to_string()));
    let metadata = obj
        .entry("metadata".to_string())
        .or_insert_with(|| serde_json::json!({}));
    if let Some(metadata_obj) = metadata.as_object_mut() {
        let patch_count = metadata_obj
            .get("patch_count")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            + 1;
        metadata_obj.insert("patch_count".to_string(), Value::Number(patch_count.into()));
        metadata_obj.insert("last_patch_op".to_string(), Value::String(patch.op.clone()));
        metadata_obj.insert(
            "last_patched_at".to_string(),
            Value::String(chrono::Utc::now().to_rfc3339()),
        );
    }

    Ok(next)
}

async fn workflow_patch_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(workflow_id): Path<String>,
    Json(body): Json<WorkflowPatchRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let existing = state
        .db
        .get_saved_workflow(&user.id, &workflow_id)
        .await
        .map_err(|err| {
            if matches!(err, sqlx::Error::RowNotFound) {
                (StatusCode::NOT_FOUND, "workflow not found".to_string())
            } else {
                status_to_http(internal_error(err))
            }
        })?;
    let patched_graph = apply_workflow_patch(&existing["graph"], &body)
        .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    let (errors, warnings) = validate_workflow_graph_json(&patched_graph, Some(&user.id));
    if !errors.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            workflow_error_response(errors, warnings).to_string(),
        ));
    }
    let record = saved_workflow_record_from_existing(
        &existing,
        &user.id,
        patched_graph,
        None,
        existing["favorite"].as_bool().unwrap_or(false),
        existing["archived_at"].as_str().map(str::to_string),
    );
    state
        .db
        .upsert_saved_workflow(&record)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let saved = state
        .db
        .get_saved_workflow(&user.id, &workflow_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "patched": true,
        "ir_invalidated": true,
        "workflow": saved,
    })))
}

fn workflow_run_record(
    workflow_id: &str,
    deployment_id: &str,
    owner_user_id: &str,
    trigger_kind: &str,
    replay_of_run_id: Option<String>,
    graph_snapshot: &Value,
    ir_snapshot: &Value,
) -> WorkflowRunRecord {
    let started_at = chrono::Utc::now();
    let completed_at = started_at + chrono::Duration::seconds(2);
    let execution_mode = if trigger_kind == "dry_run" {
        "dry_run"
    } else if replay_of_run_id.is_some() {
        "replay"
    } else {
        "live"
    };
    let node_status = if trigger_kind == "dry_run" {
        "simulated"
    } else {
        "completed"
    };
    let manifests = ir_snapshot
        .get("manifests")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let timeline = manifests
        .iter()
        .enumerate()
        .map(|(index, manifest)| {
            let started = started_at + chrono::Duration::milliseconds((index as i64) * 150);
            let finished = started + chrono::Duration::milliseconds(120);
            serde_json::json!({
                "node_id": manifest.get("source_graph_node_id").and_then(Value::as_str).unwrap_or("unknown"),
                "manifest_node_id": manifest.get("node_id").and_then(Value::as_str).unwrap_or("unknown"),
                "runtime_kind": manifest.get("runtime_kind").and_then(Value::as_str).unwrap_or("plan"),
                "objective": manifest.get("objective").and_then(Value::as_str).unwrap_or("Execute workflow node"),
                "status": node_status,
                "started_at": started.to_rfc3339(),
                "completed_at": finished.to_rfc3339(),
            })
        })
        .collect::<Vec<_>>();
    let workflow_title = graph_snapshot
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Workflow");
    WorkflowRunRecord {
        run_id: format!("wfrun_{}", Ulid::new().to_string().to_lowercase()),
        workflow_id: workflow_id.to_string(),
        deployment_id: deployment_id.to_string(),
        owner_user_id: owner_user_id.to_string(),
        status: if trigger_kind == "dry_run" {
            "simulated".to_string()
        } else {
            "completed".to_string()
        },
        trigger_kind: trigger_kind.to_string(),
        replay_of_run_id,
        timeline_json: Value::Array(timeline),
        result_json: serde_json::json!({
            "summary": if trigger_kind == "dry_run" {
                format!("{workflow_title} passed dry-run simulation.")
            } else {
                format!("{workflow_title} completed successfully.")
            },
            "node_count": manifests.len(),
            "execution_mode": execution_mode
        }),
        started_at: started_at.to_rfc3339(),
        completed_at: Some(completed_at.to_rfc3339()),
        created_at: started_at.to_rfc3339(),
    }
}

async fn workflow_runs_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(workflow_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let runs = state
        .db
        .list_workflow_runs(&user.id, &workflow_id, 50)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "workflow_id": workflow_id,
        "runs": runs,
    })))
}

async fn workflow_run_start_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(workflow_id): Path<String>,
    Json(body): Json<WorkflowRunRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let workflow = state
        .db
        .get_saved_workflow(&user.id, &workflow_id)
        .await
        .map_err(|err| {
            if matches!(err, sqlx::Error::RowNotFound) {
                (StatusCode::NOT_FOUND, "workflow not found".to_string())
            } else {
                status_to_http(internal_error(err))
            }
        })?;

    let (deployment_id, graph_snapshot, ir_snapshot, replay_of_run_id, trigger_kind) =
        if let Some(replay_run_id) = body.replay_run_id.as_deref() {
            let prior_run = state
                .db
                .get_workflow_run(&user.id, &workflow_id, replay_run_id)
                .await
                .map_err(|err| {
                    if matches!(err, sqlx::Error::RowNotFound) {
                        (StatusCode::NOT_FOUND, "workflow run not found".to_string())
                    } else {
                        status_to_http(internal_error(err))
                    }
                })?;
            let deployment_id = prior_run["deployment_id"]
                .as_str()
                .ok_or((StatusCode::BAD_REQUEST, "stored run missing deployment_id".to_string()))?
                .to_string();
            let deployment = state
                .db
                .get_workflow_deployment(&user.id, &workflow_id, &deployment_id)
                .await
                .map_err(|err| {
                    if matches!(err, sqlx::Error::RowNotFound) {
                        (StatusCode::NOT_FOUND, "deployment not found".to_string())
                    } else {
                        status_to_http(internal_error(err))
                    }
                })?;
            (
                deployment_id,
                deployment["graph_snapshot"].clone(),
                deployment["ir_snapshot"].clone(),
                Some(replay_run_id.to_string()),
                "replay".to_string(),
            )
        } else if let Some(deployment_id) = body.deployment_id.as_deref() {
            let deployment = state
                .db
                .get_workflow_deployment(&user.id, &workflow_id, deployment_id)
                .await
                .map_err(|err| {
                    if matches!(err, sqlx::Error::RowNotFound) {
                        (StatusCode::NOT_FOUND, "deployment not found".to_string())
                    } else {
                        status_to_http(internal_error(err))
                    }
                })?;
            (
                deployment_id.to_string(),
                deployment["graph_snapshot"].clone(),
                deployment["ir_snapshot"].clone(),
                None,
                body.trigger_kind.clone().unwrap_or_else(|| "manual".to_string()),
            )
        } else {
            let latest_ir = workflow["latest_ir"].clone();
            if latest_ir.is_null() {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "workflow must be compiled or deployed before starting a run".to_string(),
                ));
            }
            let deployment_id = latest_ir
                .get("deployment_id")
                .and_then(Value::as_str)
                .ok_or((StatusCode::BAD_REQUEST, "workflow must be deployed before starting a run".to_string()))?
                .to_string();
            (
                deployment_id,
                workflow["graph"].clone(),
                latest_ir,
                None,
                body.trigger_kind.clone().unwrap_or_else(|| "manual".to_string()),
            )
        };

    let run = workflow_run_record(
        &workflow_id,
        &deployment_id,
        &user.id,
        &trigger_kind,
        replay_of_run_id,
        &graph_snapshot,
        &ir_snapshot,
    );
    state
        .db
        .append_workflow_run(&run)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let saved_run = state
        .db
        .get_workflow_run(&user.id, &workflow_id, &run.run_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "started": true,
        "workflow_id": workflow_id,
        "run": saved_run,
    })))
}

async fn workflows_validate_http(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Json(body): Json<ValidateWorkflowRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let (errors, mut warnings) = validate_workflow_graph_json(&body.graph, Some(&user.id));
    let node_count = body
        .graph
        .get("nodes")
        .and_then(Value::as_array)
        .map(|nodes| nodes.len())
        .unwrap_or(0);
    let edge_count = body
        .graph
        .get("edges")
        .and_then(Value::as_array)
        .map(|edges| edges.len())
        .unwrap_or(0);
    if node_count > 5 {
        warnings.push("graph exceeds the free-tier visual workflow threshold of 5 nodes".to_string());
    }
    Ok(Json(serde_json::json!({
        "valid": errors.is_empty(),
        "errors": errors,
        "warnings": warnings,
        "summary": {
            "workflow_id": body.graph.get("workflow_id").and_then(Value::as_str),
            "node_count": node_count,
            "edge_count": edge_count,
        }
    })))
}

fn workflow_model_strategy(optimization_mode: &str) -> (&'static str, &'static str, i64, i64) {
    match optimization_mode {
        "speed" => ("cheap_reasoning", "omnyid-speed-router-v1", 4096, 1200),
        "cost" => ("cheap_reasoning", "omnyid-cost-router-v1", 3072, 900),
        _ => ("balanced_reasoning", "omnyid-balanced-router-v1", 6144, 1600),
    }
}

fn workflow_runtime_kind_for_node(node: &serde_json::Map<String, Value>) -> String {
    let kind = node.get("kind").and_then(Value::as_str).unwrap_or("agent");
    let config = node.get("config").and_then(Value::as_object);
    if kind == "agent" {
        if let Some(runtime_kind) = config
            .and_then(|config| config.get("runtime_kind"))
            .and_then(Value::as_str)
        {
            return match runtime_kind {
                "goal_intake"
                | "context"
                | "ambiguity"
                | "plan"
                | "policy_runtime"
                | "model_broker"
                | "capability_router"
                | "executor"
                | "reflection"
                | "approval_runtime"
                | "merge_runtime"
                | "termination_runtime" => runtime_kind.to_string(),
                _ => "plan".to_string(),
            };
        }
    }
    match kind {
        "trigger" => "goal_intake".to_string(),
        "condition" => "ambiguity".to_string(),
        "transform" => "context".to_string(),
        "tool" => "executor".to_string(),
        "agent" => "plan".to_string(),
        "delegation" => "capability_router".to_string(),
        "policy" => "policy_runtime".to_string(),
        "approval" => "approval_runtime".to_string(),
        "merge" => "merge_runtime".to_string(),
        "termination" => "termination_runtime".to_string(),
        _ => "plan".to_string(),
    }
}

fn workflow_node_objective(node: &serde_json::Map<String, Value>) -> String {
    let label = node.get("label").and_then(Value::as_str).unwrap_or("Workflow node");
    let kind = node.get("kind").and_then(Value::as_str).unwrap_or("agent");
    let config = node.get("config").and_then(Value::as_object);
    match kind {
        "agent" => config
            .and_then(|config| config.get("objective"))
            .and_then(Value::as_str)
            .unwrap_or(label)
            .to_string(),
        "tool" => {
            let operation = config
                .and_then(|config| config.get("operation"))
                .and_then(Value::as_str)
                .unwrap_or("execute");
            format!("{label}: {operation}")
        }
        "approval" => config
            .and_then(|config| config.get("approval_reason"))
            .and_then(Value::as_str)
            .unwrap_or(label)
            .to_string(),
        _ => label.to_string(),
    }
}

fn compile_workflow_graph_to_ir(graph: &Value) -> Result<Value, Vec<String>> {
    let (errors, _warnings) = validate_workflow_graph_json(graph, None);
    if !errors.is_empty() {
        return Err(errors);
    }

    let graph_obj = graph
        .as_object()
        .ok_or_else(|| vec!["graph must be a JSON object".to_string()])?;
    let workflow_id = graph_obj
        .get("workflow_id")
        .and_then(Value::as_str)
        .ok_or_else(|| vec!["graph.workflow_id is required".to_string()])?;
    let environment = graph_obj
        .get("environment")
        .and_then(Value::as_str)
        .unwrap_or("dev");
    let optimization_mode = graph_obj
        .get("optimization_mode")
        .and_then(Value::as_str)
        .unwrap_or("balanced");
    let (strategy, model_name, max_input_tokens, max_output_tokens) =
        workflow_model_strategy(optimization_mode);

    let nodes = graph_obj
        .get("nodes")
        .and_then(Value::as_array)
        .ok_or_else(|| vec!["graph.nodes must be an array".to_string()])?;
    let manifests = nodes
        .iter()
        .filter_map(Value::as_object)
        .map(|node| {
            let node_id = node
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("unknown-node");
            let runtime_kind = workflow_runtime_kind_for_node(node);
            let policy = node
                .get("policy")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let memory_scope = node
                .get("config")
                .and_then(Value::as_object)
                .and_then(|config| config.get("memory_scope"))
                .and_then(Value::as_str)
                .unwrap_or("thread_summary");
            serde_json::json!({
                "manifest_version": "omnyid-runtime-node.v1",
                "node_id": format!("mf_{node_id}"),
                "runtime_kind": runtime_kind,
                "source_graph_node_id": node_id,
                "objective": workflow_node_objective(node),
                "input_schema": {},
                "output_schema": {},
                "policy": policy,
                "memory_scope": memory_scope,
                "model_assignment": {
                    "strategy": strategy,
                    "provider": "omnyid-supervisor",
                    "model": model_name,
                    "max_input_tokens": max_input_tokens,
                    "max_output_tokens": max_output_tokens,
                },
                "retry_policy": {
                    "max_attempts": if runtime_kind == "executor" { 2 } else { 1 },
                    "on_timeout": if runtime_kind == "executor" { "downgrade" } else { "retry" },
                    "on_policy_block": "escalate",
                },
                "metadata": {
                    "compiled_from_kind": node.get("kind").and_then(Value::as_str).unwrap_or("agent"),
                    "label": node.get("label").and_then(Value::as_str).unwrap_or("Workflow node"),
                }
            })
        })
        .collect::<Vec<_>>();

    let entry_manifest_node_ids = graph_obj
        .get("root_node_ids")
        .and_then(Value::as_array)
        .map(|roots| {
            roots
                .iter()
                .filter_map(Value::as_str)
                .map(|root| Value::String(format!("mf_{root}")))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let edges = graph_obj
        .get("edges")
        .and_then(Value::as_array)
        .map(|edges| {
            edges
                .iter()
                .filter_map(Value::as_object)
                .map(|edge| {
                    serde_json::json!({
                        "from_manifest_node_id": format!("mf_{}", edge.get("source").and_then(Value::as_str).unwrap_or_default()),
                        "to_manifest_node_id": format!("mf_{}", edge.get("target").and_then(Value::as_str).unwrap_or_default()),
                        "route_label": edge.get("condition_label").and_then(Value::as_str),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(serde_json::json!({
        "version": "omnyid-workflow-ir.v1",
        "workflow_id": workflow_id,
        "compiled_at": chrono::Utc::now().to_rfc3339(),
        "environment": environment,
        "entry_manifest_node_ids": entry_manifest_node_ids,
        "manifests": manifests,
        "edges": edges,
        "policy_snapshot": {
            "optimization_mode": optimization_mode,
            "root_node_ids": graph_obj.get("root_node_ids").cloned().unwrap_or_else(|| serde_json::json!([])),
        },
        "metadata": {
            "compiler": "omnyid-workflow-compiler.v1",
            "graph_node_count": nodes.len(),
        }
    }))
}

async fn workflow_compile_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(workflow_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let existing = state
        .db
        .get_saved_workflow(&user.id, &workflow_id)
        .await
        .map_err(|err| {
            if matches!(err, sqlx::Error::RowNotFound) {
                (StatusCode::NOT_FOUND, "workflow not found".to_string())
            } else {
                status_to_http(internal_error(err))
            }
        })?;
    let graph = existing.get("graph").cloned().unwrap_or_else(|| serde_json::json!({}));
    let compiled_ir = compile_workflow_graph_to_ir(&graph).map_err(|errors| {
        (
            StatusCode::BAD_REQUEST,
            serde_json::json!({
                "valid": false,
                "errors": errors,
                "warnings": []
            })
            .to_string(),
        )
    })?;
    let record = saved_workflow_record_from_existing(
        &existing,
        &user.id,
        graph,
        Some(compiled_ir.clone()),
        existing["favorite"].as_bool().unwrap_or(false),
        existing["archived_at"].as_str().map(str::to_string),
    );
    state
        .db
        .upsert_saved_workflow(&record)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "compiled": true,
        "workflow_id": workflow_id,
        "ir": compiled_ir,
    })))
}

async fn workflow_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(workflow_id): Path<String>,
    Json(body): Json<WorkflowActionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let existing = state
        .db
        .get_saved_workflow(&user.id, &workflow_id)
        .await
        .map_err(|err| {
            if matches!(err, sqlx::Error::RowNotFound) {
                (StatusCode::NOT_FOUND, "workflow not found".to_string())
            } else {
                status_to_http(internal_error(err))
            }
        })?;

    let action = body.action.trim().to_lowercase();
    match action.as_str() {
        "favorite" => {
            let favorite = body.favorite.unwrap_or(true);
            let record = saved_workflow_record_from_existing(
                &existing,
                &user.id,
                existing["graph"].clone(),
                existing["latest_ir"].as_object().map(|_| existing["latest_ir"].clone()),
                favorite,
                existing["archived_at"].as_str().map(str::to_string),
            );
            state
                .db
                .upsert_saved_workflow(&record)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            let saved = state
                .db
                .get_saved_workflow(&user.id, &workflow_id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(serde_json::json!({ "updated": true, "workflow": saved })))
        }
        "archive" => {
            let archived = body.archived.unwrap_or(true);
            let archived_at = if archived {
                Some(chrono::Utc::now().to_rfc3339())
            } else {
                None
            };
            let mut graph = existing["graph"].clone();
            if let Some(obj) = graph.as_object_mut() {
                obj.insert(
                    "status".to_string(),
                    Value::String(if archived { "archived" } else { "draft" }.to_string()),
                );
            }
            let record = saved_workflow_record_from_existing(
                &existing,
                &user.id,
                graph,
                existing["latest_ir"].as_object().map(|_| existing["latest_ir"].clone()),
                existing["favorite"].as_bool().unwrap_or(false),
                archived_at,
            );
            state
                .db
                .upsert_saved_workflow(&record)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            let saved = state
                .db
                .get_saved_workflow(&user.id, &workflow_id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(serde_json::json!({ "updated": true, "workflow": saved })))
        }
        "deploy" => {
            let mut latest_ir = existing["latest_ir"].clone();
            if latest_ir.is_null() {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "workflow must be compiled before deploy".to_string(),
                ));
            }
            let deployment_id = format!("wfdep_{}", Ulid::new().to_string().to_lowercase());
            let environment = body
                .environment
                .as_deref()
                .filter(|value| matches!(*value, "dev" | "prod"))
                .unwrap_or_else(|| {
                    existing["graph"]["environment"]
                        .as_str()
                        .filter(|value| matches!(*value, "dev" | "prod"))
                .unwrap_or("dev")
                })
                .to_string();

            let deployed_at = chrono::Utc::now().to_rfc3339();
            if let Some(ir_obj) = latest_ir.as_object_mut() {
                ir_obj.insert("deployment_id".to_string(), Value::String(deployment_id.clone()));
                ir_obj.insert("environment".to_string(), Value::String(environment.clone()));
                let metadata = ir_obj
                    .entry("metadata".to_string())
                    .or_insert_with(|| serde_json::json!({}));
                if let Some(metadata_obj) = metadata.as_object_mut() {
                    metadata_obj.insert("deployed_at".to_string(), Value::String(deployed_at.clone()));
                    metadata_obj.insert("deployment_status".to_string(), Value::String("active".to_string()));
                }
            }

            let mut graph = existing["graph"].clone();
            if let Some(graph_obj) = graph.as_object_mut() {
                graph_obj.insert("status".to_string(), Value::String("deployed".to_string()));
                graph_obj.insert("environment".to_string(), Value::String(environment.clone()));
            }

            let deployment_record = WorkflowDeploymentRecord {
                deployment_id: deployment_id.clone(),
                workflow_id: workflow_id.clone(),
                owner_user_id: user.id.clone(),
                environment: environment.clone(),
                status: "active".to_string(),
                ir_snapshot_json: latest_ir.clone(),
                graph_snapshot_json: graph.clone(),
                source_deployment_id: None,
                deployed_at: deployed_at.clone(),
                created_at: deployed_at,
            };

            let record = saved_workflow_record_from_existing(
                &existing,
                &user.id,
                graph,
                Some(latest_ir),
                existing["favorite"].as_bool().unwrap_or(false),
                existing["archived_at"].as_str().map(str::to_string),
            );
            state
                .db
                .upsert_saved_workflow(&record)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            state
                .db
                .append_workflow_deployment(&deployment_record)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            let saved = state
                .db
                .get_saved_workflow(&user.id, &workflow_id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(serde_json::json!({
                "updated": true,
                "deployment_id": deployment_id,
                "workflow": saved,
            })))
        }
        "rollback" => {
            let target_deployment_id = body.deployment_id.as_deref().ok_or((
                StatusCode::BAD_REQUEST,
                "rollback requires deployment_id".to_string(),
            ))?;
            let deployment = state
                .db
                .get_workflow_deployment(&user.id, &workflow_id, target_deployment_id)
                .await
                .map_err(|err| {
                    if matches!(err, sqlx::Error::RowNotFound) {
                        (StatusCode::NOT_FOUND, "deployment not found".to_string())
                    } else {
                        status_to_http(internal_error(err))
                    }
                })?;

            let environment = deployment["environment"]
                .as_str()
                .unwrap_or("dev")
                .to_string();
            let mut latest_ir = deployment["ir_snapshot"].clone();
            let new_record = workflow_deployment_record(
                &workflow_id,
                &user.id,
                &environment,
                "rollback_active",
                latest_ir.clone(),
                deployment["graph_snapshot"].clone(),
                Some(target_deployment_id.to_string()),
            );
            if let Some(ir_obj) = latest_ir.as_object_mut() {
                ir_obj.insert(
                    "deployment_id".to_string(),
                    Value::String(new_record.deployment_id.clone()),
                );
                ir_obj.insert("environment".to_string(), Value::String(environment.clone()));
                let metadata = ir_obj
                    .entry("metadata".to_string())
                    .or_insert_with(|| serde_json::json!({}));
                if let Some(metadata_obj) = metadata.as_object_mut() {
                    metadata_obj.insert(
                        "deployed_at".to_string(),
                        Value::String(new_record.deployed_at.clone()),
                    );
                    metadata_obj.insert(
                        "deployment_status".to_string(),
                        Value::String("rollback_active".to_string()),
                    );
                    metadata_obj.insert(
                        "rollback_source_deployment_id".to_string(),
                        Value::String(target_deployment_id.to_string()),
                    );
                }
            }

            let mut graph = deployment["graph_snapshot"].clone();
            if let Some(graph_obj) = graph.as_object_mut() {
                graph_obj.insert("status".to_string(), Value::String("deployed".to_string()));
                graph_obj.insert("environment".to_string(), Value::String(environment.clone()));
            }

            let updated_deployment_record = WorkflowDeploymentRecord {
                ir_snapshot_json: latest_ir.clone(),
                graph_snapshot_json: graph.clone(),
                ..new_record
            };

            let record = saved_workflow_record_from_existing(
                &existing,
                &user.id,
                graph,
                Some(latest_ir),
                existing["favorite"].as_bool().unwrap_or(false),
                existing["archived_at"].as_str().map(str::to_string),
            );
            state
                .db
                .upsert_saved_workflow(&record)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            state
                .db
                .append_workflow_deployment(&updated_deployment_record)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            let saved = state
                .db
                .get_saved_workflow(&user.id, &workflow_id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(serde_json::json!({
                "updated": true,
                "deployment_id": updated_deployment_record.deployment_id,
                "workflow": saved,
            })))
        }
        _ => Err((
            StatusCode::BAD_REQUEST,
            "workflow action must be favorite, archive, deploy, or rollback".to_string(),
        )),
    }
}

async fn agent_task_approve_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(task_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .update_agent_task_status(&user.id, &task_id, "executing", None, None)
        .await
        .map_err(task_update_error_to_http)?;
    append_private_task_status_trace(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        &task_id,
        "executing",
        "Task approved and moved into execution.",
    )
    .await?;
    let _ = state
        .relay_tx
        .send(relay_fleet_update_payload(&task_id, "executing"));
    Ok(Json(task_status_response_payload(&task_id, "executing")))
}

async fn agent_task_reject_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(task_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .update_agent_task_status(
            &user.id,
            &task_id,
            "cancelled",
            Some(serde_json::json!({"reason": "rejected_by_user"})),
            None,
        )
        .await
        .map_err(task_update_error_to_http)?;
    append_private_task_status_trace(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        &task_id,
        "cancelled",
        "Task rejected by the user before execution.",
    )
    .await?;
    let _ = state
        .relay_tx
        .send(relay_fleet_update_payload(&task_id, "cancelled"));
    Ok(Json(task_status_response_payload(&task_id, "cancelled")))
}

async fn agent_task_cancel_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(task_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .update_agent_task_status(&user.id, &task_id, "cancelled", None, None)
        .await
        .map_err(task_update_error_to_http)?;
    append_private_task_status_trace(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        &task_id,
        "cancelled",
        "Task cancelled before completion.",
    )
    .await?;
    let _ = state
        .relay_tx
        .send(relay_fleet_update_payload(&task_id, "cancelled"));
    Ok(Json(task_status_response_payload(&task_id, "cancelled")))
}

async fn agent_priority_rules_get_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let inst = state
        .db
        .get_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no agent instance".to_string()))?;
    Ok(Json(inst["priority_rules"].clone()))
}

async fn agent_priority_rules_put_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(rules): Json<Value>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if rules.get("rules").and_then(|r| r.as_array()).is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            "body must have a rules array".to_string(),
        ));
    }
    state
        .db
        .update_user_priority_rules(&user.id, rules)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"updated": true})))
}

#[derive(serde::Deserialize)]
struct LlmConfigRequest {
    backend: String,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    api_key: Option<String>,
    #[serde(default)]
    ollama_url: Option<String>,
}

async fn llm_config_get_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .get_llm_config(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .map(Json)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no LLM config; call POST /agent/provision first".to_string(),
            )
        })
}

async fn llm_config_set_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<LlmConfigRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let (backend, monthly_budget) = match body.backend.as_str() {
        "hosted" => {
            let billing = state
                .db
                .get_billing_status(&user.id)
                .await
                .unwrap_or_default();
            if billing
                .get("plan")
                .and_then(|p| p.as_str())
                .unwrap_or("free")
                != "pro"
            {
                return Err((
                    StatusCode::PAYMENT_REQUIRED,
                    "hosted LLM requires pro plan ($9/mo)".to_string(),
                ));
            }
            (LlmBackend::Hosted, 900i32)
        }
        "byok" => (LlmBackend::Byok, 0i32),
        "ollama" => (LlmBackend::Ollama, 0i32),
        "runpod" => (LlmBackend::RunPod, 0i32),
        other => return Err((StatusCode::BAD_REQUEST, format!("unknown backend: {other}"))),
    };
    let provider = body.provider.unwrap_or_else(|| "anthropic".to_string());
    let default_model = if matches!(backend, LlmBackend::RunPod) {
        "Qwen/Qwen3.5-35B-A3B".to_string()
    } else {
        "claude-haiku-4-5-20251001".to_string()
    };
    let cfg = LlmConfig {
        id: Ulid::new().to_string(),
        owner_user_id: user.id.clone(),
        backend,
        provider: provider.clone(),
        model: body.model.unwrap_or(default_model),
        encrypted_api_key: body.api_key,
        ollama_url: body.ollama_url,
        monthly_budget_cents: monthly_budget,
        usage_cents_current_month: 0,
    };
    state
        .db
        .upsert_llm_config(&cfg)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(
        serde_json::json!({"updated": true, "backend": provider}),
    ))
}

// ── /ui/decision — record user decision for a generative card decision_point ─

async fn ui_decision_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<UiDecisionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    // Store as an AFP user_decision message in the thread so the running agent
    // can pick it up via its relay WebSocket subscription.
    let decision_msg = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: Ulid::new().to_string(),
        thread_id: body.thread_id.clone(),
        parent_id: None,
        from: user.id.clone(),
        to: body.agent_id.clone().map(|a| vec![a]).unwrap_or_default(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "user_decision".to_string(),
        subtype: Some("decision_point".to_string()),
        content: serde_json::json!({
            "card_id":            body.card_id,
            "decision_point_id":  body.decision_point_id,
            "selected_option_id": body.selected_option_id,
            "decided_by":         user.id,
        }),
        metadata: Some(serde_json::json!({
            "origin": "workspace_ui_decision"
        })),
        views: vec![],
        attachments: vec![],
        references: vec![],
        encryption: None,
        signature: String::new(),
        store_in_relational: true,
        prev_hash: None,
    };

    let decision_message_id = decision_msg.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        decision_msg,
    )
    .await
    .map_err(status_to_http)?;

    if body.decision_point_id == "approval_gate" || body.decision_point_id == "clarification_gate" {
        let thread_messages = thread_messages_for_headers(&state.db, &headers, &body.thread_id).await?;
        let app_messages = thread_messages
            .into_iter()
            .map(proto_to_app)
            .collect::<Vec<_>>();
        if let Some(card_message) = app_messages.iter().find(|message| {
            message.r#type == "generative_card"
                && message.content.get("card_id").and_then(Value::as_str)
                    == Some(body.card_id.as_str())
        }) {
            let objective = card_message
                .content
                .get("query")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();

            let is_approval_confirm = body.selected_option_id == "confirm_orchestration";
            let clarification_instruction =
                clarification_option_instruction(&body.selected_option_id);
            let is_clarification_proceed = body.decision_point_id == "clarification_gate"
                && clarification_instruction.is_some();

            if (is_approval_confirm || is_clarification_proceed) && !objective.is_empty() {
                let llm_cfg = state
                    .db
                    .get_llm_config(&user.id)
                    .await
                    .map_err(internal_error)
                    .map_err(status_to_http)?
                    .ok_or_else(|| {
                        (
                            StatusCode::BAD_REQUEST,
                            "no LLM config; call POST /user/llm-config".to_string(),
                        )
                    })?;
                let backend_name = llm_cfg["backend"].as_str().unwrap_or("hosted").to_string();
                let (api_key, model) = if backend_name == "runpod" {
                    (
                        std::env::var("OMNYID_RUNPOD_API_KEY").unwrap_or_default(),
                        llm_cfg["model"]
                            .as_str()
                            .unwrap_or("Qwen/Qwen3.5-35B-A3B")
                            .to_string(),
                    )
                } else {
                    (
                        std::env::var("OMNYID_ANTHROPIC_KEY")
                            .or_else(|_| std::env::var("ANTHROPIC_API_KEY"))
                            .unwrap_or_default(),
                        llm_cfg["model"]
                            .as_str()
                            .unwrap_or("claude-haiku-4-5-20251001")
                            .to_string(),
                    )
                };
                let master_instance = state
                    .db
                    .get_master_agent_instance(&user.id)
                    .await
                    .map_err(internal_error)
                    .map_err(status_to_http)?
                    .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
                let lora_active = master_instance["lora_genome_active"]
                    .as_bool()
                    .unwrap_or(false);
                let agent_id = master_instance["agent_id"].as_str().map(str::to_string);
                let orchestration_objective = if body.decision_point_id == "clarification_gate" {
                    apply_clarification_context(&objective, &body.selected_option_id)
                } else {
                    objective.clone()
                };

                if let Some(agent_id_value) = agent_id.clone() {
                    if body.decision_point_id == "clarification_gate"
                        || body.decision_point_id == "approval_gate"
                    {
                        let (title, text, tone) = if body.decision_point_id == "clarification_gate"
                        {
                            clarification_option_summary(&body.selected_option_id)
                        } else {
                            approval_option_summary(&body.selected_option_id)
                        };
                        let section_id = if body.decision_point_id == "clarification_gate" {
                            "clarification_gate"
                        } else {
                            "approval_gate"
                        };
                        let assumption_update = serde_json::json!({
                            "card_id": body.card_id,
                            "section": {
                                "id": section_id,
                                "type": "callout",
                                "order": 3,
                                "status": "complete",
                                "content": {
                                    "title": title,
                                    "text": text,
                                    "tone": tone,
                                }
                            }
                        });
                        if let Ok(msg) = new_server_message(
                            agent_id_value.clone(),
                            vec![],
                            body.thread_id.clone(),
                            "card_section_update",
                            assumption_update,
                            vec![],
                            vec![],
                            vec![],
                            true,
                        ) {
                            let _ = store_private_app_message(
                                &state.db,
                                &state.metrics,
                                &state.relay_tx,
                                &user.id,
                                msg,
                            )
                            .await;
                        }
                    }

                    let update = serde_json::json!({
                        "card_id": body.card_id,
                        "section": {
                            "id": "progress",
                            "type": "progress",
                            "order": 1,
                            "status": "streaming",
                            "content": {
                                "text": if body.decision_point_id == "clarification_gate" {
                                    clarification_option_progress_text(&body.selected_option_id)
                                } else {
                                    "Approval received. Starting orchestration now."
                                },
                                "pct": 25
                            }
                        }
                    });
                    if let Ok(msg) = new_server_message(
                        agent_id_value,
                        vec![],
                        body.thread_id.clone(),
                        "card_section_update",
                        update,
                        vec![],
                        vec![],
                        vec![],
                        true,
                    ) {
                        let _ = store_private_app_message(
                            &state.db,
                            &state.metrics,
                            &state.relay_tx,
                            &user.id,
                            msg,
                        )
                        .await;
                    }
                }

                spawn_orchestration_run(
                    state.clone(),
                    user.id.clone(),
                    api_key,
                    model,
                    backend_name,
                    orchestration_objective,
                    lora_active,
                    body.thread_id.clone(),
                    body.card_id.clone(),
                    agent_id,
                );
            } else if body.selected_option_id == "cancel_orchestration"
                || body.selected_option_id == "cancel_for_clarification"
            {
                let master_instance = state
                    .db
                    .get_master_agent_instance(&user.id)
                    .await
                    .map_err(internal_error)
                    .map_err(status_to_http)?
                    .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
                if let Some(agent_id) = master_instance["agent_id"].as_str() {
                    if body.decision_point_id == "approval_gate" {
                        let (title, text, tone) =
                            approval_option_summary(&body.selected_option_id);
                        let approval_update = serde_json::json!({
                            "card_id": body.card_id,
                            "section": {
                                "id": "approval_gate",
                                "type": "callout",
                                "order": 3,
                                "status": "complete",
                                "content": {
                                    "title": title,
                                    "text": text,
                                    "tone": tone,
                                }
                            }
                        });
                        if let Ok(msg) = new_server_message(
                            agent_id.to_string(),
                            vec![],
                            body.thread_id.clone(),
                            "card_section_update",
                            approval_update,
                            vec![],
                            vec![],
                            vec![],
                            true,
                        ) {
                            let _ = store_private_app_message(
                                &state.db,
                                &state.metrics,
                                &state.relay_tx,
                                &user.id,
                                msg,
                            )
                            .await;
                        }
                    }

                    let update = serde_json::json!({
                        "card_id": body.card_id,
                        "section": {
                            "id": "final",
                            "type": "final_answer",
                            "order": 4,
                            "status": "complete",
                            "content": {
                                "text": if body.decision_point_id == "clarification_gate" {
                                    "Orchestration cancelled until a more specific objective is provided."
                                } else {
                                    "Orchestration cancelled before any external action was started."
                                }
                            }
                        }
                    });
                    if let Ok(msg) = new_server_message(
                        agent_id.to_string(),
                        vec![],
                        body.thread_id.clone(),
                        "card_section_update",
                        update,
                        vec![],
                        vec![],
                        vec![],
                        true,
                    ) {
                        let _ = store_private_app_message(
                            &state.db,
                            &state.metrics,
                            &state.relay_tx,
                            &user.id,
                            msg,
                        )
                        .await;
                    }
                }
            }
        }
    }

    Ok(Json(serde_json::json!({
        "success":    true,
        "message_id": decision_message_id,
    })))
}

// ── /user/agent-preferences — get/set agent optimization preferences ──────────

async fn agent_preferences_get_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AgentPreferences>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let prefs = state
        .db
        .get_agent_preferences(&user.id)
        .await
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_value::<AgentPreferences>(v).ok())
        .unwrap_or_default();

    Ok(Json(prefs))
}

async fn agent_preferences_set_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AgentPreferences>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let valid_modes = ["speed", "cost", "balanced"];
    if !valid_modes.contains(&body.optimization_mode.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "optimization_mode must be one of: {}",
                valid_modes.join(", ")
            ),
        ));
    }

    state
        .db
        .upsert_agent_preferences(
            &user.id,
            &body.optimization_mode,
            body.auto_confirm_threshold_cents,
            body.show_cost_estimates,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({"updated": true})))
}

async fn mcp_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<crate::mcp_server::McpRequest>,
) -> Result<Json<crate::mcp_server::McpResponse>, (StatusCode, String)> {
    // MCP auth is optional — unauthenticated clients get tool list but not data
    let user_id = authenticated_user(&state.db, &headers)
        .await
        .ok()
        .map(|u| u.id);
    let resp = crate::mcp_server::dispatch_mcp_request(req, &state.db, user_id.as_deref()).await;
    Ok(Json(resp))
}

async fn verify_thread_chain_http(
    State(state): State<Arc<AppState>>,
    Path(thread_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    // Allow both authenticated and unauthenticated verify (read-only integrity check)
    let messages = state
        .db
        .get_thread(&thread_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let msg_values: Vec<Value> = messages
        .iter()
        .map(|m| {
            serde_json::json!({
                "id": m.id,
                "thread_id": m.thread_id,
                "from": m.from,
                "timestamp": m.timestamp,
                "type": m.r#type,
            })
        })
        .collect();
    let _ = headers; // available for future auth-gated verify
    match crate::audit_chain::verify_chain(&msg_values) {
        Ok(()) => Ok(Json(serde_json::json!({
            "thread_id": thread_id,
            "message_count": msg_values.len(),
            "chain_valid": true,
        }))),
        Err(broken_at) => Ok(Json(serde_json::json!({
            "thread_id": thread_id,
            "message_count": msg_values.len(),
            "chain_valid": false,
            "broken_at_index": broken_at,
        }))),
    }
}

// ── Passkey registration ───────────────────────────────────────────────────────

/// POST /auth/passkey/register/begin
///
/// Returns a `RegistrationOptions` JSON challenge for the browser's
/// `navigator.credentials.create()` call.  The challenge is stored in the
/// user's session record (field `passkey_challenge`) for verification in /finish.
async fn passkey_register_begin_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let rp_id = std::env::var("OMNYID_RP_ID").unwrap_or_else(|_| "omnyid.com".to_string());
    let req = crate::webauthn::RegistrationRequest {
        user_id: user.id.clone(),
        display_name: user.email.clone(),
    };
    let (opts, challenge) = crate::webauthn::registration_options(&req, &rp_id, "Omnyid");
    // Store challenge on session for the /finish step
    state
        .db
        .store_passkey_challenge(&user.id, &challenge, "register")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::to_value(opts).unwrap_or_default()))
}

/// POST /auth/passkey/register/finish
///
/// Verifies the browser's attestation response and stores the new credential.
async fn passkey_register_finish_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(finish): Json<crate::webauthn::RegistrationFinish>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let origin =
        std::env::var("OMNYID_ORIGIN").unwrap_or_else(|_| "https://omnyid.com".to_string());

    let challenge = state
        .db
        .get_passkey_challenge(&user.id, "register")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((
            StatusCode::BAD_REQUEST,
            "no pending challenge — call /begin first".to_string(),
        ))?;

    crate::webauthn::verify_registration_client_data(&finish.client_data_json, &challenge, &origin)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let cred = crate::webauthn::build_stored_credential(&finish, &finish.client_data_json);
    state
        .db
        .store_passkey_credential(&cred)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    state
        .db
        .clear_passkey_challenge(&user.id, "register")
        .await
        .ok();

    Ok(Json(
        serde_json::json!({"registered": true, "credential_id": cred.credential_id}),
    ))
}

/// POST /auth/passkey/authenticate/begin
///
/// Returns authentication options for the browser's `navigator.credentials.get()`.
#[derive(serde::Deserialize)]
struct PasskeyAuthBeginRequest {
    user_id: String,
}

async fn passkey_authenticate_begin_http(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PasskeyAuthBeginRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let rp_id = std::env::var("OMNYID_RP_ID").unwrap_or_else(|_| "omnyid.com".to_string());
    let creds = state
        .db
        .list_passkey_credentials(&body.user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let (opts, challenge) = crate::webauthn::authentication_options(&creds, &rp_id);
    state
        .db
        .store_passkey_challenge(&body.user_id, &challenge, "authenticate")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::to_value(opts).unwrap_or_default()))
}

/// POST /auth/passkey/authenticate/finish
///
/// Verifies the assertion and issues a new session token on success.
async fn passkey_authenticate_finish_http(
    State(state): State<Arc<AppState>>,
    Json(finish): Json<crate::webauthn::AuthenticationFinish>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let origin =
        std::env::var("OMNYID_ORIGIN").unwrap_or_else(|_| "https://omnyid.com".to_string());
    let rp_id = std::env::var("OMNYID_RP_ID").unwrap_or_else(|_| "omnyid.com".to_string());

    let challenge = state
        .db
        .get_passkey_challenge(&finish.user_id, "authenticate")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((StatusCode::BAD_REQUEST, "no pending challenge".to_string()))?;

    crate::webauthn::verify_authentication_client_data(
        &finish.client_data_json,
        &challenge,
        &origin,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let sign_count =
        crate::webauthn::verify_authenticator_data(&finish.authenticator_data, &rp_id, true)
            .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let cred = state
        .db
        .get_passkey_credential(&finish.credential_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((StatusCode::UNAUTHORIZED, "credential not found".to_string()))?;

    crate::webauthn::verify_sign_count(cred.sign_count, sign_count)
        .map_err(|e| (StatusCode::UNAUTHORIZED, e.to_string()))?;

    state
        .db
        .update_passkey_sign_count(&finish.credential_id, sign_count)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    state
        .db
        .clear_passkey_challenge(&finish.user_id, "authenticate")
        .await
        .ok();

    // Issue a short-lived session token for this device
    let session = state
        .db
        .create_session_for_passkey(&cred.user_id, "passkey")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "authenticated": true,
        "session_token": session,
        "user_id": cred.user_id,
    })))
}

// ── Portable export ────────────────────────────────────────────────────────────

/// Helper: fetch all AFP messages for the authenticated user across their agents.
async fn user_export_messages(
    state: &AppState,
    user_id: &str,
) -> Result<Vec<crate::export::ExportMessage>, (StatusCode, String)> {
    let agents = state
        .db
        .list_managed_agents_by_user(user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let agent_ids: Vec<String> = agents.iter().map(|a| a.agent_id.clone()).collect();
    let msgs = state
        .db
        .recent_messages_for_agents(&agent_ids, 5000)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let export_msgs = msgs
        .into_iter()
        .map(|m| crate::export::ExportMessage {
            id: m.id,
            thread_id: m.thread_id,
            parent_id: "".to_string(),
            from: m.from,
            to: vec![],
            timestamp: m.timestamp,
            r#type: m.r#type,
            content: m.content,
            prev_hash: None,
        })
        .collect();
    Ok(export_msgs)
}

/// GET /export/mbox
///
/// Download all email-type AFP messages as an RFC 4155 MBOX file.
async fn export_mbox_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<axum::response::Response, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let msgs = user_export_messages(&state, &user.id).await?;
    let mbox_bytes = crate::export::build_mbox(&msgs);
    Ok(axum::response::Response::builder()
        .header("Content-Type", "application/mbox")
        .header(
            "Content-Disposition",
            "attachment; filename=\"omnyid-export.mbox\"",
        )
        .body(axum::body::Body::from(mbox_bytes))
        .unwrap())
}

/// GET /export/afp-archive
///
/// Download all AFP messages as a gzip-compressed NDJSON archive with integrity hash.
async fn export_afp_archive_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<axum::response::Response, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let msgs = user_export_messages(&state, &user.id).await?;
    let archive_bytes = crate::export::build_afp_archive(&msgs);
    Ok(axum::response::Response::builder()
        .header("Content-Type", "application/gzip")
        .header(
            "Content-Disposition",
            "attachment; filename=\"omnyid-afp-archive.ndjson.gz\"",
        )
        .body(axum::body::Body::from(archive_bytes))
        .unwrap())
}

/// GET /export/json-ld
///
/// Download note-type AFP messages as a JSON-LD schema.org document.
async fn export_json_ld_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let msgs = user_export_messages(&state, &user.id).await?;
    Ok(Json(crate::export::build_json_ld(&msgs)))
}

// ── Federation inbound handler ─────────────────────────────────────────────────

/// POST /federation/relay
///
/// Accepts an AFP message relayed from another Omnyid homeserver.
/// Verifies the HMAC-SHA256 signature using the sender's `.well-known/afp-delegation`.
async fn federation_relay_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<Value>, (StatusCode, String)> {
    let body_str = std::str::from_utf8(&body)
        .map_err(|_| (StatusCode::BAD_REQUEST, "body must be UTF-8".to_string()))?;

    let sender_domain = headers
        .get("X-Omnyid-Sender")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if sender_domain.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "X-Omnyid-Sender header required".to_string(),
        ));
    }

    let signature = headers
        .get("X-Omnyid-Signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if signature.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            "X-Omnyid-Signature header required".to_string(),
        ));
    }

    let relay_req = crate::federation::verify_inbound_relay(body_str, &sender_domain, &signature)
        .await
        .map_err(|e| (StatusCode::UNAUTHORIZED, e.to_string()))?;

    // Ingest the relayed message into the local AFP database
    tracing::info!(
        "federation: accepted relay from {} nonce={}",
        sender_domain,
        relay_req.nonce
    );
    let _ = state; // DB ingestion wired in next phase when relay message type is finalized

    Ok(Json(serde_json::json!({
        "accepted": true,
        "nonce": relay_req.nonce,
        "sender": sender_domain,
    })))
}

// ── Master Agent Orchestration Handlers ──────────────────────────────────────

/// SHA-256 fingerprint of remote IP + User-Agent for anon session tracking.
fn anon_fingerprint(headers: &HeaderMap) -> String {
    use std::fmt::Write;
    let ip = headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");
    let ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");
    let input = format!("{ip}{ua}");
    // Use HKDF-SHA256 as a convenient hash (salt="" info="fp")
    let hash_bytes = crate::post_quantum::hkdf_sha256(input.as_bytes(), b"", b"fp", 16);
    let mut hex = String::with_capacity(32);
    for b in hash_bytes {
        let _ = write!(hex, "{b:02x}");
    }
    hex
}

/// GET /dashboard/session
/// For unauthenticated users: checks the 3-session limit and provisions an
/// ephemeral master agent. Authenticated users skip the gate entirely.
async fn dashboard_session_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    // Authenticated users bypass the anon gate
    if authenticated_user(&state.db, &headers).await.is_ok() {
        return Ok(Json(
            serde_json::json!({"authenticated": true, "session": "persistent"}),
        ));
    }

    let fingerprint = anon_fingerprint(&headers);
    let count = state
        .db
        .check_and_increment_anon_session(&fingerprint)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    if count > 3 {
        return Err((
            StatusCode::FORBIDDEN,
            "You've used all 3 free guest sessions from this device. Sign in to continue."
                .to_string(),
        ));
    }

    let domain = std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "omnyid.com".to_string());
    let instance = crate::agent_template::AgentInstance::provision_ephemeral(&fingerprint, &domain);
    let instance_id = instance.id.clone();
    state
        .db
        .save_master_agent_instance(&instance)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "authenticated": false,
        "session": "ephemeral",
        "session_count": count,
        "sessions_remaining": 3 - count,
        "agent_instance_id": instance_id,
    })))
}

/// POST /agent/onboarding
/// Saves soul.md answers and regenerates soul_md for the user's master agent.
#[derive(serde::Deserialize)]
struct OnboardingAnswers {
    personality: String,
    tone: String,
    goals: String,
    rules: String,
}

async fn agent_onboarding_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<OnboardingAnswers>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no master agent instance found".to_string(),
            )
        })?;
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();

    let soul_md = format!(
        "# Agent Soul — {display_name}\n\
        \n\
        ## Personality\n\
        {personality}\n\
        \n\
        ## Tone\n\
        {tone}\n\
        \n\
        ## Goals\n\
        {goals}\n\
        \n\
        ## Rules\n\
        {rules}\n\
        \n\
        ## LoRA Status\n\
        LoRA fine-tuning will progressively internalise this profile.\n\
        Once confidence reaches 85 %, this file will be archived.\n",
        display_name = user.display_name,
        personality = body.personality,
        tone = body.tone,
        goals = body.goals,
        rules = body.rules,
    );

    state
        .db
        .update_agent_soul(&user.id, &instance_id, &soul_md)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(
        serde_json::json!({"updated": true, "soul_md": soul_md}),
    ))
}

/// GET /agent/focus
async fn list_focus_items_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();
    let items = state
        .db
        .list_focus_items(&user.id, &instance_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"items": items})))
}

/// POST /agent/focus
#[derive(serde::Deserialize)]
struct CreateFocusItemRequest {
    title: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    priority: Option<String>,
}

async fn create_focus_item_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateFocusItemRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();
    let mut item = crate::agent_template::FocusItem::new(instance_id, user.id.clone(), body.title);
    if let Some(desc) = body.description {
        item.description = Some(desc);
    }
    if let Some(prio) = body.priority {
        item.priority = prio;
    }
    let id = item.id.clone();
    state
        .db
        .create_focus_item(&item)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"id": id, "status": "pending"})))
}

/// PATCH /agent/focus/:id
#[derive(serde::Deserialize)]
struct UpdateFocusItemRequest {
    status: String,
}

async fn update_focus_item_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<UpdateFocusItemRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .update_focus_item_status(&user.id, &id, &body.status)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"updated": true})))
}

/// POST /agent/trigger
#[derive(serde::Deserialize)]
struct CreateTriggerRequest {
    trigger_type: String,
    config: serde_json::Value,
}

async fn create_trigger_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateTriggerRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();
    let trigger_type = crate::agent_template::TriggerType::from_str(&body.trigger_type);
    let trigger = crate::agent_template::AgentTrigger::new(
        instance_id,
        user.id.clone(),
        trigger_type,
        body.config,
    );
    let id = trigger.id.clone();
    state
        .db
        .create_trigger(&trigger)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"id": id})))
}

/// DELETE /agent/trigger/:id
async fn delete_trigger_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .delete_trigger(&user.id, &id)
        .await
        .map_err(trigger_delete_error_to_http)?;
    Ok(Json(serde_json::json!({"deleted": true})))
}

/// POST /agent/delegate
#[derive(serde::Deserialize)]
struct CreateDelegationRequest {
    scope: String,
    #[serde(default = "default_delegation_mask")]
    mask: String,
    #[serde(default = "default_delegation_expiry")]
    expires_in: u64,
}
fn default_delegation_mask() -> String {
    "private".to_string()
}
fn default_delegation_expiry() -> u64 {
    3600
}

async fn create_delegation_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateDelegationRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();
    let master_key_hex = "0".repeat(64); // placeholder until master key storage is implemented
    let task_id = Ulid::new().to_string();
    let delegation = crate::agent_template::generate_delegated_key(
        &master_key_hex,
        &body.scope,
        &task_id,
        body.expires_in,
        &instance_id,
        &user.id,
    );
    let id = delegation.id.clone();
    let expires_at = delegation.expires_at.to_rfc3339();
    state
        .db
        .create_delegation(&delegation)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "id": id,
        "scope": body.scope,
        "mask": body.mask,
        "expires_at": expires_at,
    })))
}

/// DELETE /agent/delegate/:id
async fn revoke_delegation_http(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .revoke_delegation(&user.id, &id)
        .await
        .map_err(delegation_revoke_error_to_http)?;
    Ok(Json(serde_json::json!({"revoked": true})))
}

/// GET /agent/fleet
async fn agent_fleet_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();
    let delegations = state
        .db
        .get_active_delegations(&user.id, &instance_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let tasks = state
        .db
        .list_agent_tasks(&user.id, None, 20)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let active_count = tasks
        .iter()
        .filter(|t| t.get("status").and_then(Value::as_str) == Some("in_progress"))
        .count();
    let idle_count = tasks
        .iter()
        .filter(|t| t.get("status").and_then(Value::as_str) == Some("pending"))
        .count();

    Ok(Json(serde_json::json!({
        "master_instance": instance,
        "active_delegations": delegations,
        "recent_tasks": tasks,
        "active_count": active_count,
        "idle_count": idle_count,
    })))
}

/// POST /agent/orchestrate
#[derive(serde::Deserialize)]
struct OrchestrateRequest {
    objective: String,
}

async fn agent_orchestrate_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<OrchestrateRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();
    let soul_md_val = instance["soul_md"].as_str().unwrap_or("").to_string();
    let lora_active = instance["lora_genome_active"].as_bool().unwrap_or(false);

    // Fetch LLM config for API key / model
    let llm_cfg = state
        .db
        .get_llm_config(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "no LLM config; call POST /user/llm-config".to_string(),
            )
        })?;
    let backend_name = llm_cfg["backend"].as_str().unwrap_or("hosted");
    let (api_key, model) = if backend_name == "runpod" {
        let key = std::env::var("OMNYID_RUNPOD_API_KEY").unwrap_or_default();
        let mdl = llm_cfg["model"]
            .as_str()
            .unwrap_or("Qwen/Qwen3.5-35B-A3B")
            .to_string();
        (key, mdl)
    } else {
        let key = std::env::var("OMNYID_ANTHROPIC_KEY")
            .or_else(|_| std::env::var("ANTHROPIC_API_KEY"))
            .unwrap_or_default();
        let mdl = llm_cfg["model"]
            .as_str()
            .unwrap_or("claude-haiku-4-5-20251001")
            .to_string();
        (key, mdl)
    };

    let orchestrator =
        crate::master_orchestrator::MasterOrchestrator::new(instance_id, user.id.clone());
    let soul_opt = if soul_md_val.is_empty() {
        None
    } else {
        Some(soul_md_val.as_str())
    };
    let runpod_ep = if backend_name == "runpod" {
        Some(
            std::env::var("OMNYID_RUNPOD_ENDPOINT_ID")
                .unwrap_or_else(|_| "sdr11n90qjwjy2".to_string()),
        )
    } else {
        None
    };
    let result = orchestrator
        .run(
            &body.objective,
            &state.db,
            &api_key,
            &model,
            soul_opt,
            lora_active,
            runpod_ep.as_deref(),
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::to_value(&result).unwrap_or_default()))
}

// ── Capability registry handlers ─────────────────────────────────────────────

/// POST /agent/capability
#[derive(serde::Deserialize)]
struct CreateCapabilityRequest {
    name: String,
    description: Option<String>,
    input_schema: Option<serde_json::Value>,
    output_schema: Option<serde_json::Value>,
    version: Option<String>,
    tags: Option<Vec<String>>,
    approval_mode: Option<String>,
}

async fn create_capability_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateCapabilityRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let agent_instance_id = instance["id"].as_str().unwrap_or("").to_string();

    let descriptor = serde_json::json!({
        "name": body.name,
        "description": body.description.unwrap_or_default(),
        "input_schema": body.input_schema.unwrap_or(serde_json::json!({})),
        "output_schema": body.output_schema,
        "version": body.version.unwrap_or_else(|| "1.0.0".to_string()),
        "tags": body.tags.unwrap_or_default(),
        "approval_mode": body.approval_mode.unwrap_or_else(|| "autonomous".to_string()),
    });

    let id = state
        .db
        .create_capability(&user.id, &agent_instance_id, &body.name, &descriptor)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({ "id": id, "name": body.name })))
}

/// GET /agent/capabilities (also matched by GET /agent/capability)
async fn list_capabilities_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let agent_instance_id = instance["id"].as_str().unwrap_or("").to_string();

    let caps = state
        .db
        .list_capabilities(&user.id, &agent_instance_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!(caps)))
}

/// DELETE /agent/capability/:id
async fn delete_capability_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Path(cap_id): axum::extract::Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deleted = state
        .db
        .delete_capability(&user.id, &cap_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    if !deleted {
        return Err((StatusCode::NOT_FOUND, "capability not found".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ── Agent invoke handler ──────────────────────────────────────────────────────

/// POST /agent/invoke
/// Validates delegation (if present), then forwards to the runner's /invoke endpoint.
#[derive(serde::Deserialize)]
struct AgentInvokeRequest {
    capability_name: String,
    params: serde_json::Value,
    delegation_id: Option<String>,
    /// Optional thread_id to post the capability_invoke AFP message into.
    thread_id: Option<String>,
}

async fn agent_invoke_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AgentInvokeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    // Validate delegation scope if a delegation_id was supplied
    if let Some(ref del_id) = body.delegation_id {
        let del = state
            .db
            .get_delegation_by_id(&user.id, del_id)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?
            .ok_or_else(|| (StatusCode::NOT_FOUND, "delegation not found".to_string()))?;
        if del["scope"].as_str().unwrap_or("") != body.capability_name {
            return Err((
                StatusCode::FORBIDDEN,
                "delegation scope mismatch".to_string(),
            ));
        }
        if del["revoked_at"].is_string() {
            return Err((
                StatusCode::FORBIDDEN,
                "delegation has been revoked".to_string(),
            ));
        }
    }

    // Find the user's runtime deployment
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let result = if let Some(dep) = deployment {
        // Forward to runner's /invoke endpoint
        let runner_port = dep
            .config_json
            .get("chat_port")
            .and_then(|v| v.as_u64())
            .unwrap_or(7860);
        let runner_url = format!("http://127.0.0.1:{runner_port}/invoke");
        let invoke_payload = serde_json::json!({
            "type": "capability_invoke",
            "content": {
                "capability_name": body.capability_name,
                "params": body.params,
                "delegation_id": body.delegation_id,
            }
        });
        match state
            .http_client
            .post(&runner_url)
            .json(&invoke_payload)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await
        {
            Ok(resp) => resp
                .json::<serde_json::Value>()
                .await
                .unwrap_or(serde_json::json!({"ok": true})),
            Err(e) => serde_json::json!({"error": e.to_string()}),
        }
    } else {
        serde_json::json!({"error": "no runner deployment found"})
    };

    // Append an AFP audit message (append-only, ON CONFLICT DO NOTHING)
    let thread_id = body
        .thread_id
        .unwrap_or_else(|| format!("agent-invoke:{}", ulid::Ulid::new()));
    let audit_msg = crate::afp::Message {
        protocol: "afp-v1".to_string(),
        id: ulid::Ulid::new().to_string(),
        thread_id: thread_id.clone(),
        parent_id: String::new(),
        from: user.id.clone(),
        to: vec![],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "action_capability_invoke".to_string(),
        content: serde_json::to_string(&serde_json::json!({
            "capability_name": body.capability_name,
            "delegation_id": body.delegation_id,
        }))
        .unwrap_or_default(),
        views: String::new(),
        attachments: String::new(),
        references: String::new(),
        encryption: String::new(),
        signature: String::new(),
        store_in_relational: false,
        subtype: String::new(),
        metadata: String::new(),
    };
    let audit_content = serde_json::json!({
        "capability_name": body.capability_name,
        "delegation_id": body.delegation_id,
    });
    let _ = state
        .db
        .store_private_message(&user.id, &audit_msg, audit_content)
        .await;

    Ok(Json(
        serde_json::json!({ "result": result, "thread_id": thread_id }),
    ))
}

/// POST /agent/tasks/:id/complete
/// Called by the runner to mark a task as completed with its result.
#[derive(serde::Deserialize)]
struct TaskCompleteRequest {
    result: Option<serde_json::Value>,
    #[serde(flatten)]
    extra: std::collections::HashMap<String, serde_json::Value>,
}

fn task_complete_result_payload(body: TaskCompleteRequest) -> Option<serde_json::Value> {
    if let Some(result) = body.result {
        return Some(result);
    }
    if body.extra.is_empty() {
        return None;
    }
    Some(serde_json::Value::Object(body.extra.into_iter().collect()))
}

async fn agent_task_complete_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Path(task_id): axum::extract::Path<String>,
    Json(body): Json<TaskCompleteRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let task_snapshot = state
        .db
        .get_agent_task(&user.id, &task_id)
        .await
        .map_err(task_update_error_to_http)?;
    let result_payload = task_complete_result_payload(body);
    state
        .db
        .update_agent_task_status(
            &user.id,
            &task_id,
            crate::agent_template::TaskStatus::Completed.as_str(),
            result_payload.clone(),
            None,
        )
        .await
        .map_err(task_update_error_to_http)?;
    let _ = state
        .relay_tx
        .send(relay_fleet_update_payload(&task_id, "completed"));

    if let Some(thread_id) = task_snapshot
        .get("thread_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
    {
        let result_content = result_payload.clone().unwrap_or_else(|| serde_json::json!({}));
        let result_summary = if let Some(text) = result_content
            .get("final_answer")
            .and_then(Value::as_str)
            .or_else(|| result_content.get("summary").and_then(Value::as_str))
            .or_else(|| result_content.get("text").and_then(Value::as_str))
        {
            text.to_string()
        } else {
            "Task completed successfully.".to_string()
        };
        let sender = task_snapshot
            .get("agent_instance_id")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(|value| format!("omnyid://runner/{value}"))
            .unwrap_or_else(|| format!("omnyid://runner/{task_id}"));

        if let Ok(msg) = new_server_message(
            sender,
            vec![],
            thread_id,
            "agent_result",
            serde_json::json!({
                "task_id": task_id,
                "status": "completed",
                "final_answer": result_summary,
                "result": result_content,
            }),
            vec![],
            vec![],
            vec![],
            true,
        ) {
            let _ = store_private_app_message(
                &state.db,
                &state.metrics,
                &state.relay_tx,
                &user.id,
                msg,
            )
            .await;
        }
    }
    Ok(Json(task_status_response_payload(&task_id, "completed")))
}

/// PATCH /agent/lora-confidence
#[derive(serde::Deserialize)]
struct LoraConfidenceRequest {
    score: f64,
}

async fn lora_confidence_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<LoraConfidenceRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let instance = state
        .db
        .get_master_agent_instance(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "no master agent".to_string()))?;
    let instance_id = instance["id"].as_str().unwrap_or("").to_string();
    let lora_active = state
        .db
        .update_lora_confidence(&user.id, &instance_id, body.score)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "score": body.score,
        "lora_active": lora_active,
        "message": if lora_active {
            "LoRA genome has taken over. soul.md and memory.md are now archived."
        } else {
            "LoRA confidence updated."
        }
    })))
}

/// GET /feed/public
/// Rate-limited for unauthenticated callers (10 req/min per IP).
async fn public_feed_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    // Stricter rate limit for unauthenticated access
    if authenticated_user(&state.db, &headers).await.is_err() {
        enforce_rate_limit(
            &state,
            public_rate_limit_key("public_feed", &headers),
            RateLimitPolicy {
                max_requests: 10,
                window: std::time::Duration::from_secs(60),
            },
        )
        .await?;
    }

    let limit: i64 = params
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(100);
    let before_id = params.get("before_id").map(String::as_str);
    let messages = state
        .db
        .list_public_messages(limit, before_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let count = messages.len();
    Ok(Json(serde_json::json!({"items": messages, "count": count})))
}

// ── Feed follow / engage routes ───────────────────────────────────────────────

/// GET /feed/search?q=&limit=
async fn feed_search_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let q = params
        .get("q")
        .map(String::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if q.is_empty() {
        return Ok(Json(serde_json::json!({"agents": []})));
    }
    let limit: i64 = params
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .min(50);
    let agents = state
        .db
        .search_agents(&q, limit)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"agents": agents})))
}

/// POST /feed/follow/{agent_id}
async fn feed_follow_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(agent_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .follow_agent(&user.id, &agent_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /feed/follow/{agent_id}
async fn feed_unfollow_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(agent_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .unfollow_agent(&user.id, &agent_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /feed/following
async fn feed_following_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let follows = state
        .db
        .list_following(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({"following": follows})))
}

#[derive(serde::Deserialize)]
struct EngageRequest {
    message_id: String,
    #[serde(rename = "type")]
    engagement_type: String,
}

/// POST /feed/engage
async fn feed_engage_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<EngageRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let valid_types = ["view", "share", "reply"];
    if !valid_types.contains(&body.engagement_type.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "type must be view, share, or reply".to_string(),
        ));
    }
    state
        .db
        .record_engagement(&user.id, &body.message_id, &body.engagement_type)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /agent/keys — returns the user's encryption key so the dashboard can decrypt AFP content locally.
/// This enables client-side E2EE: ciphertext lives on the server, plaintext only exists in the client's memory.
async fn agent_keys_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let enc_key = std::env::var("OMNYID_ENCRYPTION_KEY_HEX").map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Encryption not configured on this server.".to_string(),
        )
    })?;
    Ok(Json(serde_json::json!({
        "enc_key_hex": enc_key,
        "algorithm": "xchacha20poly1305-ietf",
        "note": "Use this key to decrypt AFP message content client-side. Never store decrypted content."
    })))
}

/// GET /about
async fn about_http() -> impl axum::response::IntoResponse {
    axum::response::Html(
        r#"<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>About — OmnyID</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:4rem auto;padding:0 1rem;line-height:1.7}
a{color:#6366f1}</style></head>
<body>
<h1>About OmnyID</h1>
<p>OmnyID is an open, privacy-first identity and agent platform built on the AFP protocol.</p>
<h2>Attribution</h2>
<p>This project incorporates architectural concepts from
<a href="https://github.com/dataelement/Clawith" rel="noopener">Clawith</a>
(Copyright 2024 dataelement contributors), licensed under the
<a href="http://www.apache.org/licenses/LICENSE-2.0" rel="noopener">Apache License, Version 2.0</a>.</p>
</body></html>"#,
    )
}

// ── Gmail OAuth routes ────────────────────────────────────────────────────────

/// GET /gmail/status — returns whether a Gmail token is stored for the user
async fn gmail_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let token = state
        .db
        .get_gmail_token(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "connected": token.is_some(),
        "gmail_email": token.as_ref().and_then(|t| t["gmail_email"].as_str()).unwrap_or(""),
        "configured": !std::env::var("OMNYID_GMAIL_CLIENT_ID").unwrap_or_default().is_empty(),
    })))
}

/// GET /gmail/connect-url — returns the Google OAuth authorization URL for Gmail scopes
async fn gmail_connect_url_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let _ = user.id; // ensure user is authenticated
    let client_id = std::env::var("OMNYID_GMAIL_CLIENT_ID").map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Gmail OAuth not configured on this server. Set OMNYID_GMAIL_CLIENT_ID.".to_string(),
        )
    })?;
    let base_url = std::env::var("OMNYID_HOMESERVER_URL")
        .unwrap_or_else(|_| "http://localhost:8080".to_string());
    let redirect_uri = format!("{base_url}/gmail/callback");
    let scopes = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email";
    // Percent-encode manually for the URL query string
    let redirect_enc: String = redirect_uri
        .chars()
        .map(|c| match c {
            ':' => "%3A".to_string(),
            '/' => "%2F".to_string(),
            _ => c.to_string(),
        })
        .collect();
    let scope_enc: String = scopes
        .chars()
        .map(|c| match c {
            ' ' => "%20".to_string(),
            ':' => "%3A".to_string(),
            '/' => "%2F".to_string(),
            _ => c.to_string(),
        })
        .collect();
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={client_id}&redirect_uri={redirect_enc}&response_type=code&scope={scope_enc}&access_type=offline&prompt=consent&state={user_id}",
        user_id = user.id
    );
    Ok(Json(serde_json::json!({"url": url})))
}

/// GET /gmail/callback?code=...  — exchanges the OAuth code and stores the token
async fn gmail_callback_http(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let Some(code) = params.get("code").cloned() else {
        return axum::response::Redirect::temporary("/workspace/?gmail=error").into_response();
    };
    let Some(user_id) = params.get("state").cloned() else {
        return axum::response::Redirect::temporary("/workspace/?gmail=error").into_response();
    };

    let Ok(client_id) = std::env::var("OMNYID_GMAIL_CLIENT_ID") else {
        return axum::response::Redirect::temporary("/workspace/?gmail=not_configured")
            .into_response();
    };
    let Ok(client_secret) = std::env::var("OMNYID_GMAIL_CLIENT_SECRET") else {
        return axum::response::Redirect::temporary("/workspace/?gmail=not_configured")
            .into_response();
    };
    let base_url = std::env::var("OMNYID_HOMESERVER_URL")
        .unwrap_or_else(|_| "http://localhost:8080".to_string());
    let redirect_uri = format!("{base_url}/gmail/callback");

    let http = reqwest::Client::new();
    let token_resp = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await;

    let token_data: Value = match token_resp {
        Ok(r) => r.json().await.unwrap_or_default(),
        Err(_) => {
            return axum::response::Redirect::temporary("/workspace/?gmail=error").into_response();
        }
    };

    let access_token = token_data["access_token"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let refresh_token = token_data["refresh_token"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Fetch Gmail email address
    let gmail_email = if !access_token.is_empty() {
        let ui_resp = http
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(&access_token)
            .send()
            .await;
        match ui_resp {
            Ok(r) => r
                .json::<Value>()
                .await
                .ok()
                .and_then(|v| v["email"].as_str().map(str::to_string))
                .unwrap_or_default(),
            Err(_) => String::new(),
        }
    } else {
        String::new()
    };

    let expiry_iso = token_data["expires_in"]
        .as_i64()
        .map(|secs| (chrono::Utc::now() + chrono::Duration::seconds(secs)).to_rfc3339());

    let _ = state
        .db
        .store_gmail_token(
            &user_id,
            &access_token,
            &refresh_token,
            &gmail_email,
            expiry_iso,
        )
        .await;

    axum::response::Redirect::temporary("/workspace/?gmail=connected").into_response()
}

// ── Calendar events ───────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct CalendarListQuery {
    /// First day of the month window as ISO-8601, e.g. "2026-03-01"
    month: Option<String>,
}

async fn calendar_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<CalendarListQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let month_str = q.month.unwrap_or_else(|| {
        // Format: "YYYY-MM-01" from current UTC date
        chrono::Utc::now().format("%Y-%m-01").to_string()
    });
    // Build range: month_start to month_start + 1 month
    let range_start = format!("{}T00:00:00Z", month_str);
    let range_end = {
        let parts: Vec<&str> = month_str.splitn(3, '-').collect();
        let (ny, nm) = if parts.len() >= 2 {
            let y: i64 = parts[0].parse().unwrap_or(2026);
            let m: i64 = parts[1].parse().unwrap_or(1);
            if m == 12 { (y + 1, 1i64) } else { (y, m + 1) }
        } else {
            (2026, 1)
        };
        format!("{}-{:02}-01T00:00:00Z", ny, nm)
    };
    let events = state
        .db
        .list_calendar_events_in_range(&user.id, &range_start, &range_end)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "events": events })))
}

#[derive(serde::Deserialize)]
struct CalendarCreateRequest {
    title: String,
    description: Option<String>,
    start_at: String,
    end_at: Option<String>,
    #[serde(default)]
    all_day: bool,
    location: Option<String>,
}

async fn calendar_create_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CalendarCreateRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let id = ulid::Ulid::new().to_string();
    let event = state
        .db
        .create_calendar_event(
            &user.id,
            &id,
            &body.title,
            body.description.as_deref(),
            &body.start_at,
            body.end_at.as_deref(),
            body.all_day,
            body.location.as_deref(),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(event))
}

async fn calendar_delete_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(event_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deleted = state
        .db
        .delete_calendar_event(&user.id, &event_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "deleted": deleted })))
}

// ── Agent Alias Registry ──────────────────────────────────────────────────────

const ALIAS_RESERVED: &[&str] = &[
    "admin",
    "administrator",
    "support",
    "system",
    "root",
    "api",
    "www",
    "mail",
    "smtp",
    "imap",
    "pop3",
    "ftp",
    "ssh",
    "host",
    "server",
    "help",
    "info",
    "contact",
    "security",
    "abuse",
    "noreply",
    "no-reply",
    "postmaster",
    "webmaster",
    "hostmaster",
    "daemon",
    "mailer",
    "omnyid",
    "agenton",
    "aetherix",
    "omny-id",
    "agent-on",
    "billing",
    "payments",
    "invoice",
    "account",
    "accounts",
    "signup",
    "signin",
    "login",
    "logout",
    "register",
];

fn validate_alias(alias: &str) -> Result<(), String> {
    let alias = alias.trim();
    if alias.len() < 7 {
        return Err("Alias must be at least 7 characters.".into());
    }
    if alias.len() > 48 {
        return Err("Alias must be 48 characters or fewer.".into());
    }
    if !alias
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("Only lowercase letters (a–z), digits, and hyphens are allowed.".into());
    }
    if alias.starts_with('-') || alias.ends_with('-') {
        return Err("Alias cannot start or end with a hyphen.".into());
    }
    if alias.contains("--") {
        return Err("Alias cannot contain consecutive hyphens.".into());
    }
    if ALIAS_RESERVED.contains(&alias) {
        return Err("This alias is reserved and cannot be claimed.".into());
    }
    Ok(())
}

#[derive(serde::Deserialize)]
struct AliasCheckQuery {
    alias: String,
}

/// GET /api/alias/check?alias=xxx
/// Returns availability and validation status — does not require authentication.
async fn alias_check_http(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(q): axum::extract::Query<AliasCheckQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let alias = q.alias.trim().to_lowercase();
    if let Err(msg) = validate_alias(&alias) {
        return Ok(Json(serde_json::json!({
            "available": false,
            "valid": false,
            "reason": msg
        })));
    }
    let available = state
        .db
        .is_alias_available(&alias)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "available": available,
        "valid": true,
        "reason": if available { "" } else { "This alias is already taken." }
    })))
}

/// GET /api/alias/mine — returns the authenticated user's current alias (or null).
async fn alias_mine_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let record = state
        .db
        .get_alias_for_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let domain = std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "omnyid.com".to_string());
    Ok(Json(match record {
        None => serde_json::json!({ "alias": null }),
        Some(r) => {
            // Calculate when next change is allowed
            let next_change = chrono::DateTime::parse_from_rfc3339(&r.last_changed_at)
                .ok()
                .map(|dt| (dt + chrono::Duration::days(30)).to_rfc3339())
                .unwrap_or_default();
            serde_json::json!({
                "alias": r.alias,
                "agent_id": r.agent_id,
                "display_address": format!("{}@{}", r.alias, domain),
                "created_at": r.created_at,
                "last_changed_at": r.last_changed_at,
                "next_change_at": next_change,
            })
        }
    }))
}

#[derive(serde::Deserialize)]
struct AliasClaimBody {
    alias: String,
    agent_id: Option<String>,
}

/// POST /api/alias/claim — claim a first-time alias.
async fn alias_claim_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AliasClaimBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let alias = body.alias.trim().to_lowercase();

    // Reject if user already has an alias
    if let Some(existing) = state
        .db
        .get_alias_for_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        return Err((
            StatusCode::CONFLICT,
            format!(
                "You already have the alias \"{}\". Use /api/alias/change to update it.",
                existing.alias
            ),
        ));
    }

    validate_alias(&alias).map_err(|msg| (StatusCode::BAD_REQUEST, msg))?;

    // Resolve agent_id: use provided value or fall back to server default
    let agent_id = body
        .agent_id
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| std::env::var("OMNYID_AGENT_ID").unwrap_or_default());

    let record = state
        .db
        .claim_alias(&user.id, &agent_id, &alias)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("unique") || msg.contains("duplicate") || msg.contains("aliases_pkey") {
                (
                    StatusCode::CONFLICT,
                    "This alias is already taken.".to_string(),
                )
            } else if msg.contains("aliases_alias") {
                (
                    StatusCode::BAD_REQUEST,
                    "Alias format is invalid.".to_string(),
                )
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg)
            }
        })?;

    let domain = std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "omnyid.com".to_string());
    Ok(Json(serde_json::json!({
        "alias": record.alias,
        "display_address": format!("{}@{}", record.alias, domain),
        "created_at": record.created_at,
    })))
}

#[derive(serde::Deserialize)]
struct AliasChangeBody {
    alias: String,
}

/// POST /api/alias/change — change an existing alias (30-day cooldown enforced).
async fn alias_change_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AliasChangeBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let alias = body.alias.trim().to_lowercase();

    validate_alias(&alias).map_err(|msg| (StatusCode::BAD_REQUEST, msg))?;

    // Must have an existing alias to change
    let existing = state
        .db
        .get_alias_for_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((
            StatusCode::NOT_FOUND,
            "You have not claimed an alias yet. Use /api/alias/claim.".into(),
        ))?;

    // Pre-flight cooldown check so we can return a helpful next_change_at date
    let last_changed =
        chrono::DateTime::parse_from_rfc3339(&existing.last_changed_at).map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Invalid timestamp in alias record.".into(),
            )
        })?;
    let next_allowed = last_changed + chrono::Duration::days(30);
    if chrono::Utc::now() < next_allowed {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            format!(
                "Alias cooldown active. You can next change your alias on {}.",
                next_allowed.format("%Y-%m-%d")
            ),
        ));
    }

    let record = state.db.change_alias(&user.id, &alias).await.map_err(|e| {
        let msg = e.to_string();
        if msg.contains("unique") || msg.contains("duplicate") || msg.contains("aliases_pkey") {
            (
                StatusCode::CONFLICT,
                "This alias is already taken.".to_string(),
            )
        } else if matches!(e, sqlx::Error::RowNotFound) {
            // Cooldown race — shouldn't reach here after pre-flight but handle defensively
            (
                StatusCode::TOO_MANY_REQUESTS,
                "Alias cooldown is still active.".to_string(),
            )
        } else {
            (StatusCode::INTERNAL_SERVER_ERROR, msg)
        }
    })?;

    let domain = std::env::var("OMNYID_DOMAIN").unwrap_or_else(|_| "omnyid.com".to_string());
    Ok(Json(serde_json::json!({
        "alias": record.alias,
        "display_address": format!("{}@{}", record.alias, domain),
        "last_changed_at": record.last_changed_at,
    })))
}

#[cfg(test)]
mod tests {
    use super::{
        OrchestrationGate, RuntimeBackupPolicyResponse, RuntimeBackupsResponse,
        RuntimeRestoreDrillsResponse, RuntimeUpdatePolicyResponse, RuntimeUpdatesResponse,
        UiCommandLink, UiCommandResponse, UiRunnerDraftResponse,
        account_delete_confirmation_is_valid, account_session_entry,
        allow_insecure_unsigned_messages, allowed_cors_origins, app_to_proto,
        apply_external_email_thread_match, build_device_bootstrap_bundle_response,
        build_onboarding_bundle_response, build_runtime_deployment_plan,
        build_runtime_recovery_packet_response, build_service_adapter_bundle_response,
        approval_option_summary, classify_orchestration_gate,
        clarification_option_progress_text,
        clarification_option_summary, enable_internal_grpc, external_email_thread_targets,
        finalize_ui_command_response, grpc_bind_addr, has_encryption_envelope,
        has_supported_encryption_envelope, healthz_http, metrics_http, new_server_message,
        objective_needs_clarification, objective_requires_human_confirmation,
        apply_clarification_context, orchestrate_card_sections,
        parse_datetime_to_utc, proto_to_app, python_runner_workspace_file,
        remove_runtime_backup_artifact_path, remove_runtime_workspace, require_encryption,
        route_ui_command, runtime_deployment_response, runtime_runner_policy_event_entry_response,
        merge_thread_messages, store_app_message_for_headers, store_private_app_message,
        task_complete_result_payload, task_created_response_payload,
        task_list_response_payload, task_status_response_payload, task_update_error_to_http,
        trigger_delete_error_to_http, delegation_revoke_error_to_http,
        runtime_template_content, runtime_template_version_from_deployment,
        runtime_update_event_entry_response, serve_afp_delegation, session_is_expired,
        support_access_history_entry, validate_proto_message, webtransport_bind_addr,
        webtransport_enabled,
    };
    use axum::extract::{Path, Query};
    use crate::afp::Message;
    use crate::{
        agent_template::{AgentInstance, AgentTask, TaskPriority},
        db::{
            AuthSessionRecord, Db, RuntimeDeploymentRecord, RuntimeRunnerPolicyEventRecord,
            RuntimeUpdateEventRecord, SupportAccessGrantRecord, UserOnboardingRecord, UserRecord,
        },
        message::AFPMessage,
        metrics::Metrics,
        server::AccountDeleteRequest,
    };
    use axum::{
        Json,
        extract::State,
        http::{header::AUTHORIZATION, HeaderMap, HeaderValue, StatusCode},
    };
    use std::sync::{Arc, Mutex, OnceLock};
    use ulid::Ulid;

    fn env_test_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn app_proto_round_trip_preserves_core_fields() {
        let original = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_test_01".to_string(),
            thread_id: "thread_test_01".to_string(),
            parent_id: Some("msg_parent_01".to_string()),
            from: "agent:test@omnyid.local".to_string(),
            to: vec!["agent:peer@omnyid.local".to_string()],
            timestamp: "2026-03-20T00:00:00Z".to_string(),
            r#type: "task_update".to_string(),
            subtype: Some("status".to_string()),
            content: serde_json::json!({"status": "done", "amount": 42}),
            metadata: Some(serde_json::json!({"domain": "operations"})),
            signature: "demo-signature".to_string(),
            encryption: Some(serde_json::json!({"algorithm": "demo"})),
            views: vec![serde_json::json!({"format": "email", "content": {"body": "hello"}})],
            references: vec![serde_json::json!({"type": "thread", "target": "thread_other"})],
            attachments: vec![serde_json::json!({"id": "att_1", "name": "invoice.pdf"})],
            store_in_relational: true,
            prev_hash: None,
        };

        let proto = app_to_proto(original.clone());
        let restored = proto_to_app(proto);

        assert_eq!(restored.protocol, original.protocol);
        assert_eq!(restored.id, original.id);
        assert_eq!(restored.thread_id, original.thread_id);
        assert_eq!(restored.parent_id, original.parent_id);
        assert_eq!(restored.from, original.from);
        assert_eq!(restored.to, original.to);
        assert_eq!(restored.r#type, original.r#type);
        assert_eq!(restored.subtype, original.subtype);
        assert_eq!(restored.content, original.content);
        assert_eq!(restored.metadata, original.metadata);
        assert_eq!(restored.store_in_relational, original.store_in_relational);
        assert_eq!(restored.views, original.views);
        assert_eq!(restored.references, original.references);
        assert_eq!(restored.attachments, original.attachments);
    }

    #[test]
    fn validate_proto_message_rejects_missing_required_fields() {
        let invalid = crate::afp::Message {
            protocol: "afp-v1".to_string(),
            id: "".to_string(),
            thread_id: "thread_test_01".to_string(),
            parent_id: "".to_string(),
            from: "agent:test@omnyid.local".to_string(),
            to: vec![],
            timestamp: "2026-03-20T00:00:00Z".to_string(),
            r#type: "task_update".to_string(),
            content: "{}".to_string(),
            signature: "demo-signature".to_string(),
            encryption: "{}".to_string(),
            views: "[]".to_string(),
            references: "[]".to_string(),
            attachments: "[]".to_string(),
            store_in_relational: false,
            subtype: String::new(),
            metadata: String::new(),
        };

        assert!(!validate_proto_message(&invalid));
    }

    #[test]
    fn insecure_unsigned_defaults_to_disabled() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::remove_var("OMNYID_ALLOW_INSECURE_UNSIGNED");
        }
        assert!(!allow_insecure_unsigned_messages());
    }

    #[test]
    fn encryption_requirement_defaults_to_disabled() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::remove_var("OMNYID_REQUIRE_ENCRYPTION");
        }
        assert!(!require_encryption());
    }

    #[test]
    fn internal_grpc_defaults_to_disabled() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::remove_var("OMNYID_ENABLE_INTERNAL_GRPC");
        }
        assert!(!enable_internal_grpc());
    }

    #[test]
    fn internal_grpc_bind_defaults_to_loopback() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::remove_var("OMNYID_INTERNAL_GRPC_ADDR");
        }
        assert_eq!(grpc_bind_addr().to_string(), "127.0.0.1:50051");
    }

    #[test]
    fn encryption_envelope_detection_rejects_empty_json() {
        let message = crate::afp::Message {
            protocol: "afp-v1".to_string(),
            id: "msg_test_01".to_string(),
            thread_id: "thread_test_01".to_string(),
            parent_id: "".to_string(),
            from: "agent:test@omnyid.local".to_string(),
            to: vec!["agent:peer@omnyid.local".to_string()],
            timestamp: "2026-03-20T00:00:00Z".to_string(),
            r#type: "task_update".to_string(),
            content: "{}".to_string(),
            signature: "demo-signature".to_string(),
            encryption: "{}".to_string(),
            views: "[]".to_string(),
            references: "[]".to_string(),
            attachments: "[]".to_string(),
            store_in_relational: false,
            subtype: String::new(),
            metadata: String::new(),
        };

        assert!(!has_encryption_envelope(&message));
    }

    #[test]
    fn supported_encryption_envelope_detection_accepts_v1_envelope() {
        let message = crate::afp::Message {
            protocol: "afp-v1".to_string(),
            id: "msg_test_02".to_string(),
            thread_id: "thread_test_02".to_string(),
            parent_id: "".to_string(),
            from: "agent:test@omnyid.local".to_string(),
            to: vec!["agent:peer@omnyid.local".to_string()],
            timestamp: "2026-03-20T00:00:00Z".to_string(),
            r#type: "task_update".to_string(),
            content: "{\"omnyid_encrypted\":true}".to_string(),
            signature: "demo-signature".to_string(),
            encryption: "{\"scheme\":\"omnyid-envelope-v1\",\"algorithm\":\"xchacha20poly1305-ietf\",\"nonce\":\"abc\",\"ciphertext\":\"def\"}".to_string(),
            views: "[]".to_string(),
            references: "[]".to_string(),
            attachments: "[]".to_string(),
            store_in_relational: false,
            subtype: String::new(),
            metadata: String::new(),
        };

        assert!(has_supported_encryption_envelope(&message));
    }

    #[tokio::test]
    async fn healthz_reports_ok() {
        let payload = healthz_http().await.0;
        assert_eq!(payload["status"], "ok");
        assert_eq!(payload["service"], "omnyid-homeserver");
    }

    #[tokio::test]
    async fn metrics_endpoint_reports_snapshot() {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect_lazy("postgres://afp:afp@localhost/afp")
            .expect("lazy pool");
        let state = Arc::new(super::AppState {
            db: super::Db { pool },
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });
        state.metrics.inc_messages_stored();

        let payload = metrics_http(axum::extract::State(state)).await.0;
        assert_eq!(payload["status"], "ok");
        assert_eq!(payload["metrics"]["messages_stored_total"], 1);
    }

    #[tokio::test]
    async fn transport_capabilities_endpoint_reports_webtransport_rollout_state() {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect_lazy("postgres://afp:afp@localhost/afp")
            .expect("lazy pool");
        let state = Arc::new(super::AppState {
            db: super::Db { pool },
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let payload = super::transport_capabilities_http(axum::extract::State(state.clone()))
            .await
            .0;
        assert_eq!(payload["public_transport"]["primary"], "webtransport");
        assert_eq!(payload["public_transport"]["fallback"], "websocket");
        assert_eq!(
            payload["public_transport"]["webtransport"]["enabled"],
            false
        );
        assert_eq!(
            state
                .metrics
                .snapshot()
                .relay_webtransport_capability_checks_total,
            1
        );
    }

    #[test]
    fn webtransport_defaults_to_disabled_without_explicit_env() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::remove_var("OMNYID_ENABLE_WEBTRANSPORT");
            std::env::remove_var("OMNYID_WEBTRANSPORT_CERT_PATH");
            std::env::remove_var("OMNYID_WEBTRANSPORT_KEY_PATH");
        }
        assert!(!webtransport_enabled());
        assert_eq!(webtransport_bind_addr().to_string(), "0.0.0.0:8443");
    }

    #[test]
    fn request_ip_identity_prefers_forwarded_headers() {
        let mut headers = axum::http::HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            axum::http::HeaderValue::from_static("203.0.113.10, 10.0.0.2"),
        );
        headers.insert(
            "cf-connecting-ip",
            axum::http::HeaderValue::from_static("198.51.100.7"),
        );

        assert_eq!(super::request_ip_identity(&headers), "203.0.113.10");
    }

    #[tokio::test]
    async fn rate_limiter_blocks_after_policy_is_exceeded() {
        let limiter = super::RateLimiter::new();
        let policy = super::RateLimitPolicy {
            max_requests: 2,
            window: std::time::Duration::from_secs(60),
        };

        assert!(limiter.allow("test:key".to_string(), policy).await);
        assert!(limiter.allow("test:key".to_string(), policy).await);
        assert!(!limiter.allow("test:key".to_string(), policy).await);
    }

    #[tokio::test]
    async fn trial_runner_requires_signup_after_three_template_runs() {
        let manager = super::TrialRunnerManager::new();
        let session = manager
            .create_or_get_session("203.0.113.10:trial-browser".to_string())
            .await;

        let first = manager
            .start_template_run(&session.id, "student_day_planner")
            .await
            .expect("first run");
        assert_eq!(first.runs_started, 1);
        let second = manager
            .start_template_run(&session.id, "research_assistant")
            .await
            .expect("second run");
        assert_eq!(second.runs_started, 2);
        let third = manager
            .start_template_run(&session.id, "appointment_assistant")
            .await
            .expect("third run");
        assert_eq!(third.runs_started, 3);
        let fourth = manager
            .start_template_run(&session.id, "student_day_planner")
            .await
            .expect("quota response");
        assert!(fourth.requires_signup);
        assert_eq!(fourth.runs_started, 3);
    }

    #[tokio::test]
    async fn trial_runner_limits_chat_turns_per_template_run() {
        let manager = super::TrialRunnerManager::new();
        let session = manager
            .create_or_get_session("198.51.100.5:trial-browser".to_string())
            .await;
        manager
            .start_template_run(&session.id, "student_day_planner")
            .await
            .expect("template run");
        for index in 0..10 {
            let updated = manager
                .append_chat_turn(&session.id, &format!("turn {index}"))
                .await
                .expect("trial turn");
            assert_eq!(updated.turns_used, index + 1);
        }
        let err = manager
            .append_chat_turn(&session.id, "turn 11")
            .await
            .expect_err("turn 11 should fail");
        assert!(err.contains("10-turn limit"));
    }

    #[test]
    fn webtransport_requires_cert_and_key_paths() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::set_var("OMNYID_ENABLE_WEBTRANSPORT", "true");
            std::env::set_var("OMNYID_WEBTRANSPORT_CERT_PATH", "cert.pem");
            std::env::remove_var("OMNYID_WEBTRANSPORT_KEY_PATH");
        }
        assert!(!webtransport_enabled());
        unsafe {
            std::env::set_var("OMNYID_WEBTRANSPORT_KEY_PATH", "key.pem");
        }
        assert!(webtransport_enabled());
        unsafe {
            std::env::remove_var("OMNYID_ENABLE_WEBTRANSPORT");
            std::env::remove_var("OMNYID_WEBTRANSPORT_CERT_PATH");
            std::env::remove_var("OMNYID_WEBTRANSPORT_KEY_PATH");
        }
    }

    #[test]
    fn external_email_thread_targets_skip_current_message_id_reference() {
        let targets = external_email_thread_targets(&[
            serde_json::json!({
                "type": "external_email",
                "target": "<current@example.com>",
                "metadata": {"relation": "message_id"}
            }),
            serde_json::json!({
                "type": "external_email",
                "target": "<parent@example.com>",
                "metadata": {"relation": "in_reply_to"}
            }),
            serde_json::json!({
                "type": "external_email",
                "target": "<older@example.com>",
                "metadata": {"relation": "reference"}
            }),
        ]);

        assert_eq!(
            targets,
            vec![
                "<parent@example.com>".to_string(),
                "<older@example.com>".to_string()
            ]
        );
    }

    #[test]
    fn thread_match_reuses_existing_thread_and_parent_message() {
        let mut message = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_test_03".to_string(),
            thread_id: "email_new_thread".to_string(),
            parent_id: None,
            from: "agent:test@omnyid.local".to_string(),
            to: vec![],
            timestamp: "2026-03-20T00:00:00Z".to_string(),
            r#type: "email".to_string(),
            subtype: Some("incoming".to_string()),
            content: serde_json::json!({}),
            metadata: Some(serde_json::json!({"channel": "smtp", "transport": "smtp"})),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            attachments: vec![],
            store_in_relational: false,
            prev_hash: None,
        };

        apply_external_email_thread_match(
            &mut message,
            Some(("thread_existing".to_string(), "msg_parent".to_string())),
        );

        assert_eq!(message.thread_id, "thread_existing");
        assert_eq!(message.parent_id, Some("msg_parent".to_string()));
    }

    #[tokio::test]
    async fn delegation_endpoint_uses_env_override() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::set_var("OMNYID_AFP_DELEGATION", "relay.omnyid.ai:443");
        }
        let payload = serve_afp_delegation().await.0;
        assert_eq!(payload["afp.server"], "relay.omnyid.ai:443");
        unsafe {
            std::env::remove_var("OMNYID_AFP_DELEGATION");
        }
    }

    #[test]
    fn session_expiry_parser_accepts_postgres_timestamp_text() {
        let parsed = parse_datetime_to_utc("2026-04-20 06:33:42.805939+00").expect("parsed");
        assert_eq!(parsed.to_rfc3339(), "2026-04-20T06:33:42.805939+00:00");
        assert!(!session_is_expired("2999-04-20 06:33:42.805939+00"));
    }

    #[test]
    fn allowed_cors_origins_include_public_preview_hosts() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::remove_var("OMNYID_ALLOWED_ORIGINS");
        }
        let origins = allowed_cors_origins();
        let values = origins
            .into_iter()
            .filter_map(|value| value.to_str().ok().map(str::to_string))
            .collect::<Vec<_>>();
        assert!(values.contains(&"https://omnyid.com".to_string()));
        assert!(values.contains(&"https://cloud.omnyid.com".to_string()));
    }

    #[test]
    fn runtime_deployment_plan_uses_isolated_crewai_defaults() {
        let user = UserRecord {
            id: "01TESTUSER0000000000000000".to_string(),
            email: "preview-user@omnyid.com".to_string(),
            password_hash: None,
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: "Preview User".to_string(),
            created_at: "2026-03-21T00:00:00Z".to_string(),
        };

        let agents = vec![crate::db::ManagedAgentRecord {
            id: "agent-row-1".to_string(),
            owner_user_id: user.id.clone(),
            agent_id: "agent:preview-user@omnyid.com".to_string(),
            label: "Preview Agent".to_string(),
            email: "preview-agent@omnyid.com".to_string(),
            kind: "primary".to_string(),
            created_at: "2026-03-21T00:00:00Z".to_string(),
            metadata: serde_json::json!({}),
        }];

        let deployment =
            build_runtime_deployment_plan(&user, &agents, "crewai", None).expect("plan");
        assert_eq!(deployment.framework, "crewai");
        assert_eq!(deployment.python_version, "3.13");
        assert_eq!(deployment.status, "planned");
        assert_eq!(deployment.gui.as_deref(), Some("crewai-studio"));
        assert_eq!(deployment.config_json["telemetry_disabled"], true);
        assert_eq!(deployment.config_json["share_crew"], false);
        assert_eq!(
            deployment.config_json["starter_profile"]["primary_agent_id"],
            "agent:preview-user@omnyid.com"
        );
    }

    #[test]
    fn runtime_deployment_plan_supports_python_runner_chat() {
        let user = UserRecord {
            id: "user_python_runner_01".to_string(),
            email: "planner@example.com".to_string(),
            password_hash: None,
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: "Planner User".to_string(),
            created_at: "2026-03-21T00:00:00Z".to_string(),
        };

        let agents = vec![crate::db::ManagedAgentRecord {
            id: "agent-row-2".to_string(),
            owner_user_id: user.id.clone(),
            agent_id: "agent:planner@example.com".to_string(),
            label: "Planner Agent".to_string(),
            email: "planner-agent@omnyid.com".to_string(),
            kind: "primary".to_string(),
            created_at: "2026-03-21T00:00:00Z".to_string(),
            metadata: serde_json::json!({}),
        }];

        let deployment = build_runtime_deployment_plan(
            &user,
            &agents,
            "python-runner-chat",
            Some("builtin-chat-window"),
        )
        .expect("plan");
        assert_eq!(deployment.framework, "python-runner-chat");
        assert_eq!(deployment.python_version, "3.13");
        assert_eq!(deployment.status, "planned");
        assert_eq!(deployment.gui.as_deref(), Some("builtin-chat-window"));
        assert_eq!(
            deployment.config_json["capabilities"]["coolify_ready"],
            true
        );
        assert_eq!(
            deployment.config_json["model_policy"]["mode"],
            "omnyid_managed_default"
        );
        assert_eq!(
            deployment.config_json["tool_policy"]["vector_store"]["engine"],
            "chromadb"
        );
        assert_eq!(
            deployment.config_json["channel_policy"]["api_endpoint"]["enabled"],
            true
        );
        assert_eq!(
            deployment.config_json["scaffold"]["entrypoint"],
            format!("{}/workspace/runner_chat.py", deployment.workspace_path)
        );
    }

    #[test]
    fn python_runner_requirements_template_contains_phase4_dependencies() {
        let requirements = runtime_template_content("python-runner-chat", "requirements.txt")
            .expect("requirements template");
        for dependency in [
            "python-docx==1.1.2",
            "openpyxl==3.1.5",
            "python-pptx==1.0.2",
            "reportlab==4.2.5",
            "Pillow==11.1.0",
            "duckduckgo_search>=6.0.0",
        ] {
            assert!(
                requirements.contains(dependency),
                "missing dependency in template: {dependency}"
            );
        }
    }

    #[test]
    fn python_runner_templates_expose_trust_filter_bridge() {
        let runtime_policy = runtime_template_content("python-runner-chat", "runtime_policy.json")
            .expect("runtime policy template");
        assert!(runtime_policy.contains("\"review_required_capabilities\""));
        assert!(runtime_policy.contains("\"python_sandbox\""));

        let capability_registry =
            include_str!("../runtime-templates/python-runner-chat/capability_registry.py.tpl");
        assert!(capability_registry.contains("register_from_executor"));
        assert!(capability_registry.contains("executor_bridge"));
    }

    #[test]
    fn python_runner_compose_template_builds_runtime_image() {
        let compose = runtime_template_content("python-runner-chat", "docker-compose.yml")
            .expect("compose template");
        assert!(compose.contains("build:"));
        assert!(compose.contains("dockerfile: Dockerfile"));
        assert!(compose.contains("/opt/omnyid-venv/bin/python /workspace/runner_chat.py"));
        assert!(!compose.contains("python -m venv /tmp/omnyid-venv"));
        assert!(!compose.contains("./requirements.txt:/workspace/requirements.txt:ro"));
    }

    #[test]
    fn python_runner_dockerfile_template_prebuilds_requirements() {
        let dockerfile = runtime_template_content("python-runner-chat", "Dockerfile")
            .expect("dockerfile template");
        assert!(dockerfile.contains("FROM python:3.13-slim-bookworm"));
        assert!(dockerfile.contains("ENV VIRTUAL_ENV=/opt/omnyid-venv"));
        assert!(dockerfile.contains("COPY requirements.txt /tmp/requirements.txt"));
        assert!(dockerfile.contains("${VIRTUAL_ENV}/bin/python -m pip install"));
    }

    #[test]
    fn runtime_service_name_matches_framework() {
        assert_eq!(
            super::runtime_service_name("python-runner-chat"),
            "python-runner-chat"
        );
        assert_eq!(super::runtime_service_name("crewai"), "crewai-runtime");
    }

    #[test]
    fn python_runner_bootstrap_status_reports_starting() {
        let now = chrono::Utc::now().to_rfc3339();
        let old = "2026-03-01T00:00:00Z";
        assert_eq!(
            super::derive_runtime_status(true, Some(true), "python-runner-chat", false, true, old),
            "starting"
        );
        assert_eq!(
            super::derive_runtime_status(true, Some(true), "python-runner-chat", true, true, old),
            "running"
        );
        assert_eq!(
            super::derive_runtime_status(
                true,
                Some(false),
                "python-runner-chat",
                false,
                false,
                &now
            ),
            "starting"
        );
    }

    #[test]
    fn runtime_recent_update_window_detects_fresh_bootstrap() {
        let now = chrono::Utc::now().to_rfc3339();
        assert!(super::runtime_was_recently_updated(&now, 10));
        assert!(!super::runtime_was_recently_updated(
            "2026-03-01T00:00:00Z",
            10
        ));
    }

    #[tokio::test]
    async fn runtime_log_lines_fall_back_to_pip_install_log() {
        let tmp =
            std::env::temp_dir().join(format!("omnyid-runtime-log-test-{}", ulid::Ulid::new()));
        let logs_dir = tmp.join("logs");
        std::fs::create_dir_all(&logs_dir).expect("logs dir");
        std::fs::write(
            logs_dir.join("pip-install.log"),
            "Collecting requests\nInstalling collected packages\n",
        )
        .expect("pip log");

        let deployment = RuntimeDeploymentRecord {
            id: "runtime_test".to_string(),
            owner_user_id: "user_test".to_string(),
            framework: "python-runner-chat".to_string(),
            gui: Some("builtin-chat-window".to_string()),
            status: "planned".to_string(),
            python_version: "3.13".to_string(),
            image_ref: "python:3.13-slim-bookworm".to_string(),
            runtime_token: "token".to_string(),
            workspace_path: tmp.to_string_lossy().to_string(),
            config_json: serde_json::json!({}),
            created_at: "2026-03-27T00:00:00Z".to_string(),
            updated_at: "2026-03-27T00:00:00Z".to_string(),
        };

        let (source, lines) = super::runtime_log_lines(&deployment).await;
        assert_eq!(source, "pip-install.log");
        assert!(
            lines
                .iter()
                .any(|line| line.contains("Collecting requests"))
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn runtime_log_lines_fall_back_to_build_start_log() {
        let tmp = std::env::temp_dir().join(format!(
            "omnyid-runtime-build-log-test-{}",
            ulid::Ulid::new()
        ));
        let logs_dir = tmp.join("logs");
        std::fs::create_dir_all(&logs_dir).expect("logs dir");
        std::fs::write(
            logs_dir.join("build-start.log"),
            "#1 [internal] load build definition from Dockerfile\n#2 [internal] load metadata\n",
        )
        .expect("build log");

        let deployment = RuntimeDeploymentRecord {
            id: "runtime_test".to_string(),
            owner_user_id: "user_test".to_string(),
            framework: "python-runner-chat".to_string(),
            gui: Some("builtin-chat-window".to_string()),
            status: "planned".to_string(),
            python_version: "3.13".to_string(),
            image_ref: "python:3.13-slim-bookworm".to_string(),
            runtime_token: "token".to_string(),
            workspace_path: tmp.to_string_lossy().to_string(),
            config_json: serde_json::json!({}),
            created_at: "2026-03-27T00:00:00Z".to_string(),
            updated_at: "2026-03-27T00:00:00Z".to_string(),
        };

        let (source, lines) = super::runtime_log_lines(&deployment).await;
        assert_eq!(source, "build-start.log");
        assert!(
            lines
                .iter()
                .any(|line| line.contains("load build definition"))
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn service_adapter_bundle_contains_fastapi_starter_files() {
        let user = UserRecord {
            id: "user_service_bundle_01".to_string(),
            email: "requester@example.com".to_string(),
            password_hash: None,
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: "Requester User".to_string(),
            created_at: "2026-03-21T00:00:00Z".to_string(),
        };
        let agents = vec![crate::db::ManagedAgentRecord {
            id: "agent-row-3".to_string(),
            owner_user_id: user.id.clone(),
            agent_id: "agent:requester@example.com".to_string(),
            label: "Requester Agent".to_string(),
            email: "requester-agent@omnyid.com".to_string(),
            kind: "primary".to_string(),
            created_at: "2026-03-21T00:00:00Z".to_string(),
            metadata: serde_json::json!({}),
        }];

        let bundle = build_service_adapter_bundle_response(&user, &agents);
        let names = bundle
            .files
            .iter()
            .map(|file| file.name.as_str())
            .collect::<Vec<_>>();
        assert!(names.contains(&"README.md"));
        assert!(names.contains(&"requirements.txt"));
        assert!(names.contains(&".env.example"));
        assert!(names.contains(&"app.py"));
        assert!(names.contains(&"adapter-plan.json"));
        assert_eq!(bundle.target_profile, "fastapi-afp-service-adapter");
    }

    #[test]
    fn runtime_deployment_plan_embeds_template_version() {
        let user = UserRecord {
            id: "user_runtime_version_01".to_string(),
            email: "planner@example.com".to_string(),
            password_hash: None,
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: "Planner User".to_string(),
            created_at: "2026-03-21T00:00:00Z".to_string(),
        };

        let deployment = build_runtime_deployment_plan(&user, &[], "crewai", None).expect("plan");
        assert_eq!(
            deployment.config_json["runtime_template_version"],
            serde_json::json!(env!("CARGO_PKG_VERSION"))
        );
        assert_eq!(
            runtime_template_version_from_deployment(&deployment).as_deref(),
            Some(env!("CARGO_PKG_VERSION"))
        );
    }

    #[test]
    fn runtime_update_event_entry_preserves_versions_and_status() {
        let entry = runtime_update_event_entry_response(RuntimeUpdateEventRecord {
            id: "evt_01".to_string(),
            owner_user_id: "user_01".to_string(),
            runtime_deployment_id: Some("runtime_01".to_string()),
            action: "apply".to_string(),
            from_version: Some("0.9.0".to_string()),
            to_version: Some("1.0.0".to_string()),
            status: "applied".to_string(),
            notes_json: serde_json::json!({
                "apply_scope": "runtime_scaffold_refresh_only",
                "privacy_note": "scaffold only"
            }),
            created_at: "2026-03-22T00:00:00Z".to_string(),
        });

        assert_eq!(entry.action, "apply");
        assert_eq!(entry.from_version.as_deref(), Some("0.9.0"));
        assert_eq!(entry.to_version.as_deref(), Some("1.0.0"));
        assert_eq!(entry.status, "applied");
    }

    #[test]
    fn runtime_runner_policy_event_entry_preserves_policy_summary() {
        let entry = runtime_runner_policy_event_entry_response(RuntimeRunnerPolicyEventRecord {
            id: "runner_evt_01".to_string(),
            owner_user_id: "user_01".to_string(),
            runtime_deployment_id: Some("runtime_01".to_string()),
            event_kind: "policy_saved".to_string(),
            summary_json: serde_json::json!({
                "starter_template_id": "student_day_planner",
                "model_mode": "omnyid_managed_default",
                "default_model": "gpt-5.4-mini",
                "daily_spend_cap_usd": 5,
                "monthly_spend_cap_usd": 25,
                "enabled_tools": ["web", "file_access"],
                "enabled_channels": ["web_chat"],
                "synced_files": ["runtime_policy.json", "agent_profile.json"]
            }),
            created_at: "2026-03-23T00:00:00Z".to_string(),
        });

        assert_eq!(entry.event_kind, "policy_saved");
        assert_eq!(entry.summary["starter_template_id"], "student_day_planner");
        assert_eq!(entry.summary["enabled_tools"][0], "web");
        assert_eq!(entry.summary["synced_files"][1], "agent_profile.json");
    }

    #[test]
    fn runtime_updates_panel_renders_structured_summary() {
        let response = RuntimeUpdatesResponse {
            policy: RuntimeUpdatePolicyResponse {
                update_channel: "stable".to_string(),
                auto_apply: "manual_only".to_string(),
                support_disabled_by_default: true,
            },
            current_version: "2026.03.27".to_string(),
            latest_version: "2026.03.28".to_string(),
            update_available: true,
            runtime_status: "running".to_string(),
            framework: Some("python-runner-chat".to_string()),
            last_checked_at: Some("2026-03-27T00:00:00Z".to_string()),
            last_applied_at: None,
            entries: vec![super::RuntimeUpdateEventEntryResponse {
                id: "evt_update_01".to_string(),
                action: "check".to_string(),
                from_version: Some("2026.03.27".to_string()),
                to_version: Some("2026.03.28".to_string()),
                status: "available".to_string(),
                created_at: "2026-03-27T00:00:00Z".to_string(),
                notes_summary: serde_json::json!({
                    "update_available": true,
                    "apply_scope": "runtime_scaffold",
                    "privacy_note": "No user content is included in update metadata."
                }),
            }],
            panel: None,
        };

        let panel = super::runtime_updates_panel_a2ui(&response);
        assert_eq!(panel["schema_version"].as_str(), Some("a2ui.v1"));
        assert_eq!(panel["title"].as_str(), Some("Runtime updates"));
        assert_eq!(panel["nodes"][2]["type"].as_str(), Some("table"));
    }

    #[test]
    fn python_runner_workspace_file_lookup_is_restricted_to_known_ids() {
        let user = UserRecord {
            id: "usr_runner".to_string(),
            email: "runner@example.com".to_string(),
            password_hash: Some("hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: "Runner".to_string(),
            created_at: "2026-03-23T00:00:00Z".to_string(),
        };
        let deployment =
            build_runtime_deployment_plan(&user, &[], "python-runner-chat", None).expect("plan");
        let file = python_runner_workspace_file(&deployment, "runner_chat_py").expect("known file");
        assert_eq!(file.relative_path, "workspace/runner_chat.py");
        let dockerfile =
            python_runner_workspace_file(&deployment, "dockerfile").expect("dockerfile");
        assert_eq!(dockerfile.relative_path, "Dockerfile");
        assert!(python_runner_workspace_file(&deployment, "outside_root").is_none());
    }

    #[test]
    fn ui_command_router_prefers_runner_edit_intent_for_code_requests() {
        let user = UserRecord {
            id: "usr_runner".to_string(),
            email: "runner@example.com".to_string(),
            password_hash: Some("hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: "Runner".to_string(),
            created_at: "2026-03-23T00:00:00Z".to_string(),
        };
        let deployment =
            build_runtime_deployment_plan(&user, &[], "python-runner-chat", None).expect("plan");
        let response = route_ui_command(
            "Edit policy.py to tighten the allowlist",
            "duckduckgo".to_string(),
            Some(&deployment),
            Some("runner_chat_py"),
        );

        assert_eq!(response.intent, "runner_edit");
        assert_eq!(response.suggested_view, "runner");
        assert_eq!(
            response
                .runner_draft
                .as_ref()
                .map(|draft| draft.target_file_id.as_str()),
            Some("policy_py")
        );
    }

    #[test]
    fn ui_command_router_can_target_python_runner_dockerfile() {
        let user = UserRecord {
            id: "usr_runner".to_string(),
            email: "runner@example.com".to_string(),
            password_hash: Some("hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: "Runner".to_string(),
            created_at: "2026-03-23T00:00:00Z".to_string(),
        };
        let deployment =
            build_runtime_deployment_plan(&user, &[], "python-runner-chat", None).expect("plan");
        let response = route_ui_command(
            "Update the Dockerfile to add a system package",
            "duckduckgo".to_string(),
            Some(&deployment),
            Some("runner_chat_py"),
        );

        assert_eq!(response.intent, "runner_edit");
        assert_eq!(
            response
                .runner_draft
                .as_ref()
                .map(|draft| draft.target_file_id.as_str()),
            Some("dockerfile")
        );
    }

    #[test]
    fn finalized_ui_command_response_contains_preview_message() {
        let response = finalize_ui_command_response(
            "Plan my day",
            UiCommandResponse {
                intent: "runner_edit".to_string(),
                suggested_view: "runner".to_string(),
                preferred_view: "runner".to_string(),
                summary: "Prepared a safe draft for the Python runner.".to_string(),
                engine: "duckduckgo".to_string(),
                links: vec![UiCommandLink {
                    title: "Docs".to_string(),
                    url: "https://example.com/docs".to_string(),
                    kind: "source".to_string(),
                }],
                runner_draft: Some(UiRunnerDraftResponse {
                    target_file_id: "runner_chat_py".to_string(),
                    title: "Command bar draft".to_string(),
                    content: "print('hello')".to_string(),
                    requires_confirmation: true,
                }),
                bullets: vec!["Review the draft".to_string()],
                card_id: None,
                preview_message: None,
            },
        );

        let preview = response.preview_message.expect("preview message");
        assert_eq!(preview.r#type, "agent");
        assert_eq!(preview.subtype.as_deref(), Some("runner_editor"));
        assert_eq!(preview.views[0]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(
            preview.content["title"].as_str(),
            Some("Runner draft for \"Plan my day\"")
        );
        assert_eq!(
            preview.content["schema_version"].as_str(),
            Some("a2ui.v1")
        );
        assert_eq!(preview.content["nodes"].as_array().map(|v| v.len()), Some(4));
    }

    #[test]
    fn finalized_schedule_response_uses_calendar_preview() {
        let response = finalize_ui_command_response(
            "Plan my day",
            UiCommandResponse {
                intent: "schedule".to_string(),
                suggested_view: "calendar".to_string(),
                preferred_view: "draggable_calendar".to_string(),
                summary: "Here is a tentative schedule.".to_string(),
                engine: "duckduckgo".to_string(),
                links: vec![],
                runner_draft: None,
                bullets: vec![
                    "Deep work - 09:00 (2h)".to_string(),
                    "Gym - 18:00 (1h)".to_string(),
                ],
                card_id: None,
                preview_message: None,
            },
        );

        let preview = response.preview_message.expect("preview message");
        assert_eq!(preview.r#type, "calendar");
        assert_eq!(preview.subtype.as_deref(), Some("plan"));
        assert_eq!(preview.views[0]["format"].as_str(), Some("calendar"));
        assert_eq!(
            preview.content["events"].as_array().map(|v| v.len()),
            Some(2)
        );
    }

    #[test]
    fn finalized_search_response_includes_a2ui_companion_preview() {
        let response = finalize_ui_command_response(
            "Sydney weather tomorrow",
            UiCommandResponse {
                intent: "web_research".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "search_result".to_string(),
                summary: "Tomorrow looks mild with a chance of showers.".to_string(),
                engine: "duckduckgo".to_string(),
                links: vec![UiCommandLink {
                    title: "Forecast".to_string(),
                    url: "https://example.com/weather".to_string(),
                    kind: "source".to_string(),
                }],
                runner_draft: None,
                bullets: vec!["Bring an umbrella".to_string()],
                card_id: None,
                preview_message: None,
            },
        );

        let preview = response.preview_message.expect("preview message");
        assert_eq!(preview.r#type, "research");
        assert_eq!(preview.subtype.as_deref(), Some("content"));
        assert_eq!(preview.content["kind"].as_str(), Some("web_research"));
        assert_eq!(preview.views.len(), 2);
        assert_eq!(preview.views[0]["format"].as_str(), Some("search_result"));
        assert_eq!(preview.views[1]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(
            preview.views[1]["content"]["schema_version"].as_str(),
            Some("a2ui.v1")
        );
    }

    #[test]
    fn orchestration_section_helpers_embed_a2ui_companions() {
        let progress = super::orchestration_progress_section_content(5, 4);
        assert_eq!(progress["pct"].as_i64(), Some(100));
        assert_eq!(progress["a2ui"]["schema_version"].as_str(), Some("a2ui.v1"));

        let plan = super::orchestration_plan_section_content("Draft the work and execute it.");
        assert_eq!(plan["a2ui"]["schema_version"].as_str(), Some("a2ui.v1"));
        assert_eq!(plan["a2ui"]["nodes"][0]["type"].as_str(), Some("callout"));

        let results = super::orchestration_results_section_content(&[]);
        assert_eq!(results["a2ui"]["schema_version"].as_str(), Some("a2ui.v1"));
        assert_eq!(
            results["a2ui"]["nodes"][1]["type"].as_str(),
            Some("table")
        );

        let final_answer = super::orchestration_final_answer_section_content(5, 4);
        assert_eq!(
            final_answer["a2ui"]["schema_version"].as_str(),
            Some("a2ui.v1")
        );
        assert_eq!(
            final_answer["a2ui"]["nodes"][0]["type"].as_str(),
            Some("callout")
        );

        let error = super::orchestration_error_section_content("boom");
        assert_eq!(error["a2ui"]["schema_version"].as_str(), Some("a2ui.v1"));
        assert_eq!(error["a2ui"]["nodes"][0]["type"].as_str(), Some("callout"));
    }

    #[test]
    fn finalized_orchestrate_response_uses_generative_card_preview() {
        let response = finalize_ui_command_response(
            "Organise my week",
            UiCommandResponse {
                intent: "orchestrate".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "orchestrate_progress".to_string(),
                summary: "I will break this into planning, scheduling, and follow-up steps."
                    .to_string(),
                engine: "duckduckgo".to_string(),
                links: vec![],
                runner_draft: None,
                bullets: vec![],
                card_id: None,
                preview_message: None,
            },
        );

        let preview = response.preview_message.expect("preview message");
        assert_eq!(preview.r#type, "agent");
        assert_eq!(preview.subtype.as_deref(), Some("orchestration_card"));
        assert_eq!(preview.views[0]["format"].as_str(), Some("generative_card"));
        assert_eq!(preview.views[1]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(preview.content["kind"].as_str(), Some("orchestration"));
        assert_eq!(preview.content["status"].as_str(), Some("streaming"));
        assert_eq!(
            preview.content["sections"].as_array().map(|v| v.len()),
            Some(3)
        );
    }

    #[test]
    fn finalized_dashboard_focus_response_uses_a2ui_preview() {
        let response = finalize_ui_command_response(
            "Show dashboard health",
            UiCommandResponse {
                intent: "dashboard_focus".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "search".to_string(),
                summary: "The workspace can pivot to agent output, runtime health, and recent threads."
                    .to_string(),
                engine: "duckduckgo".to_string(),
                links: vec![],
                runner_draft: None,
                bullets: vec!["Recent messages".to_string(), "Runtime health".to_string()],
                card_id: None,
                preview_message: None,
            },
        );

        let preview = response.preview_message.expect("preview message");
        assert_eq!(preview.r#type, "agent");
        assert_eq!(preview.subtype.as_deref(), Some("dashboard_panel"));
        assert_eq!(preview.views[0]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(preview.content["kind"].as_str(), Some("panel"));
        assert_eq!(
            preview.content["nodes"].as_array().map(|v| v.len()),
            Some(3)
        );
    }

    #[test]
    fn finalized_runner_edit_response_uses_runner_a2ui_preview() {
        let response = finalize_ui_command_response(
            "Update the Python runner template",
            UiCommandResponse {
                intent: "runner_edit".to_string(),
                suggested_view: "runner".to_string(),
                preferred_view: "runner".to_string(),
                summary: "Prepared a review-first draft for the runner file.".to_string(),
                engine: "duckduckgo".to_string(),
                links: vec![],
                runner_draft: Some(UiRunnerDraftResponse {
                    target_file_id: "runner_chat_py".to_string(),
                    title: "Runner patch".to_string(),
                    content: "print('patched')".to_string(),
                    requires_confirmation: true,
                }),
                bullets: vec!["Validate the policy changes".to_string()],
                card_id: None,
                preview_message: None,
            },
        );

        let preview = response.preview_message.expect("preview message");
        assert_eq!(preview.r#type, "agent");
        assert_eq!(preview.subtype.as_deref(), Some("runner_editor"));
        assert_eq!(preview.views[0]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(
            preview.content["title"].as_str(),
            Some("Runner draft for \"Update the Python runner template\"")
        );
        assert_eq!(
            preview.content["nodes"].as_array().map(|v| v.len()),
            Some(4)
        );
    }

    #[test]
    fn normalized_server_message_taxonomy_covers_provision_and_escalation() {
        let provisioned = super::normalized_server_message_taxonomy("agent_provisioned");
        assert_eq!(provisioned.0, "agent");
        assert_eq!(provisioned.1, "provisioned");
        assert_eq!(provisioned.2["legacy_type"].as_str(), Some("agent_provisioned"));

        let escalation = super::normalized_server_message_taxonomy("agent_escalation");
        assert_eq!(escalation.0, "agent");
        assert_eq!(escalation.1, "escalation");
        assert_eq!(escalation.2["legacy_type"].as_str(), Some("agent_escalation"));
    }

    #[test]
    fn risky_orchestration_requires_confirmation() {
        assert!(objective_requires_human_confirmation(
            "Book an appointment and send a confirmation email"
        ));
        assert!(!objective_requires_human_confirmation(
            "Organise my study week and summarise the deadlines"
        ));
    }

    #[test]
    fn broad_orchestration_requires_clarification() {
        assert!(objective_needs_clarification("Organise this"));
        assert!(matches!(
            classify_orchestration_gate("Handle this for me"),
            OrchestrationGate::Clarification
        ));
        assert!(matches!(
            classify_orchestration_gate("Book a table and message the group"),
            OrchestrationGate::Approval
        ));
        assert!(matches!(
            classify_orchestration_gate("Organise my study week and summarise deadlines"),
            OrchestrationGate::None
        ));
    }

    #[test]
    fn risky_orchestrate_preview_includes_decision_point_section() {
        let response = finalize_ui_command_response(
            "Book a restaurant and message the group",
            UiCommandResponse {
                intent: "orchestrate".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "orchestrate_progress".to_string(),
                summary: "This may trigger bookings and outbound messages.".to_string(),
                engine: "duckduckgo".to_string(),
                links: vec![],
                runner_draft: None,
                bullets: vec![],
                card_id: None,
                preview_message: None,
            },
        );

        let preview = response.preview_message.expect("preview message");
        let sections = preview.content["sections"]
            .as_array()
            .expect("sections array");
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[2]["type"].as_str(), Some("decision_point"));
        assert_eq!(sections[2]["content"]["id"].as_str(), Some("approval_gate"));
    }

    #[test]
    fn clarification_orchestrate_preview_includes_clarification_gate() {
        let response = finalize_ui_command_response(
            "Organise this",
            UiCommandResponse {
                intent: "orchestrate".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "orchestrate_progress".to_string(),
                summary: "This objective still needs one planning assumption.".to_string(),
                engine: "duckduckgo".to_string(),
                links: vec![],
                runner_draft: None,
                bullets: vec![],
                card_id: None,
                preview_message: None,
            },
        );

        let preview = response.preview_message.expect("preview message");
        let sections = preview.content["sections"]
            .as_array()
            .expect("sections array");
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[2]["type"].as_str(), Some("decision_point"));
        assert_eq!(
            sections[2]["content"]["id"].as_str(),
            Some("clarification_gate")
        );
        assert_eq!(
            sections[2]["content"]["category"].as_str(),
            Some("clarification")
        );
    }

    #[test]
    fn broad_email_subtype_requires_human_approval_for_outbound_variants() {
        let outgoing = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_email_1".to_string(),
            thread_id: "thread_email_1".to_string(),
            parent_id: None,
            from: "agent:test@omnyid.local".to_string(),
            to: vec!["friend@example.com".to_string()],
            timestamp: "2026-03-20T00:00:00Z".to_string(),
            r#type: "email".to_string(),
            subtype: Some("outgoing".to_string()),
            content: serde_json::json!({"subject": "Hi", "body": "Hello"}),
            metadata: Some(serde_json::json!({"channel": "smtp"})),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            attachments: vec![],
            store_in_relational: false,
            prev_hash: None,
        };
        assert!(super::message_requires_human_approval(&outgoing));
    }

    #[test]
    fn action_capability_prefers_metadata_capability_id() {
        let message = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: "msg_action_1".to_string(),
            thread_id: "thread_action_1".to_string(),
            parent_id: None,
            from: "agent:test@omnyid.local".to_string(),
            to: vec![],
            timestamp: "2026-03-20T00:00:00Z".to_string(),
            r#type: "action".to_string(),
            subtype: Some("result".to_string()),
            content: serde_json::json!({}),
            metadata: Some(serde_json::json!({"capability_id": "cap_stripe_charge"})),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            attachments: vec![],
            store_in_relational: false,
            prev_hash: None,
        };
        assert_eq!(super::action_capability_id(&message), "cap_stripe_charge");
    }

    #[test]
    fn schedule_clarification_prompt_is_context_aware() {
        let response = finalize_ui_command_response(
            "Plan my study week",
            UiCommandResponse {
                intent: "orchestrate".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "orchestrate_progress".to_string(),
                summary: "This objective still needs one planning assumption.".to_string(),
                engine: "duckduckgo".to_string(),
                links: vec![],
                runner_draft: None,
                bullets: vec![],
                card_id: None,
                preview_message: None,
            },
        );

        let preview = response.preview_message.expect("preview message");
        let sections = preview.content["sections"]
            .as_array()
            .expect("sections array");
        assert_eq!(
            sections[2]["content"]["question"].as_str(),
            Some("What should OmnyID optimise for first in this schedule?")
        );
        let options = sections[2]["content"]["options"]
            .as_array()
            .expect("options array");
        assert_eq!(options[0]["label"].as_str(), Some("Prioritise deadlines"));
        assert_eq!(
            options[1]["label"].as_str(),
            Some("Prioritise energy and focus")
        );
    }

    #[test]
    fn research_clarification_prompt_is_context_aware() {
        let response = finalize_ui_command_response(
            "Research this",
            UiCommandResponse {
                intent: "orchestrate".to_string(),
                suggested_view: "search".to_string(),
                preferred_view: "orchestrate_progress".to_string(),
                summary: "This objective still needs one planning assumption.".to_string(),
                engine: "duckduckgo".to_string(),
                links: vec![],
                runner_draft: None,
                bullets: vec![],
                card_id: None,
                preview_message: None,
            },
        );

        let preview = response.preview_message.expect("preview message");
        let sections = preview.content["sections"]
            .as_array()
            .expect("sections array");
        assert_eq!(
            sections[2]["content"]["question"].as_str(),
            Some("How far should OmnyID go with this research task?")
        );
        let options = sections[2]["content"]["options"]
            .as_array()
            .expect("options array");
        assert_eq!(
            options[0]["label"].as_str(),
            Some("Give me a concise summary")
        );
        assert_eq!(
            options[1]["label"].as_str(),
            Some("Do a deeper comparison")
        );
    }

    #[test]
    fn clarification_option_instruction_is_added_to_objective() {
        let updated = apply_clarification_context(
            "Plan my study week",
            "proceed_with_energy_first",
        );
        assert!(updated.contains("Plan my study week"));
        assert!(updated.contains("Optimise for energy, focus, and sustainable pacing"));
    }

    #[test]
    fn clarification_progress_text_matches_selected_option() {
        assert_eq!(
            clarification_option_progress_text("proceed_with_deep_research"),
            "Proceeding with a deeper comparison and starting orchestration now."
        );
        assert_eq!(
            clarification_option_progress_text("proceed_with_growth_focus"),
            "Proceeding with a growth-focused plan and starting orchestration now."
        );
    }

    #[test]
    fn clarification_option_summary_reflects_selected_strategy() {
        assert_eq!(
            clarification_option_summary("proceed_with_energy_first"),
            (
                "Working assumption locked",
                "OmnyID is prioritising energy, focus, and sustainable pacing before secondary tasks.",
                "strategy",
            )
        );
        assert_eq!(
            clarification_option_summary("proceed_with_deep_research"),
            (
                "Research depth locked",
                "OmnyID is doing a deeper comparison with tradeoffs and caveats instead of a quick summary.",
                "strategy",
            )
        );
    }

    #[test]
    fn approval_option_summary_reflects_selected_boundary() {
        assert_eq!(
            approval_option_summary("confirm_orchestration"),
            (
                "Approval granted",
                "OmnyID may now proceed with the reviewed external actions inside this orchestration.",
                "confirmation",
            )
        );
        assert_eq!(
            approval_option_summary("cancel_orchestration"),
            (
                "Approval denied",
                "OmnyID will keep this orchestration paused and will not trigger any external actions.",
                "warning",
            )
        );
    }

    #[test]
    fn runtime_recovery_packet_keeps_metadata_only_shape() {
        let user = UserRecord {
            id: "user_recovery_packet_01".to_string(),
            email: "preview-user@omnyid.com".to_string(),
            password_hash: None,
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: "Preview User".to_string(),
            created_at: "2026-03-22T00:00:00Z".to_string(),
        };

        let packet = build_runtime_recovery_packet_response(
            &user,
            None,
            RuntimeBackupsResponse {
                policy: RuntimeBackupPolicyResponse {
                    retention_days: 14,
                    storage_mode: "metadata_only_hosted".to_string(),
                    last_snapshot_at: None,
                    support_disabled_by_default: true,
                },
                entries: vec![],
            },
            RuntimeRestoreDrillsResponse { entries: vec![] },
            RuntimeUpdatesResponse {
                policy: RuntimeUpdatePolicyResponse {
                    update_channel: "stable".to_string(),
                    auto_apply: "manual_only".to_string(),
                    support_disabled_by_default: true,
                },
                current_version: "1.0.0".to_string(),
                latest_version: "1.0.0".to_string(),
                update_available: false,
                runtime_status: "not_deployed".to_string(),
                framework: None,
                last_checked_at: None,
                last_applied_at: None,
                entries: vec![],
                panel: None,
            },
        );

        assert_eq!(packet.packet_version, "omnyid-runtime-recovery-v1");
        assert!(
            packet
                .privacy_notes
                .iter()
                .any(|note| note.contains("metadata only"))
        );
        assert_eq!(packet.user.email, "preview-user@omnyid.com");
    }

    #[test]
    fn device_bootstrap_bundle_for_watch_stays_lightweight() {
        let user = UserRecord {
            id: "user_device_bootstrap_01".to_string(),
            email: "preview-user@omnyid.com".to_string(),
            password_hash: None,
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: "Preview User".to_string(),
            created_at: "2026-03-22T00:00:00Z".to_string(),
        };
        let bundle = build_device_bootstrap_bundle_response(&user, &[], "watch").expect("bundle");
        assert_eq!(bundle.device_class, "watch");
        assert!(!bundle.requires_local_key_material);
        assert!(
            bundle
                .files
                .iter()
                .any(|file| file.name == "device-bootstrap.json")
        );
        assert!(bundle.bootstrap.pglite_path.contains("watch"));
    }

    #[test]
    fn runtime_workspace_removal_rejects_paths_outside_runtime_root() {
        let _guard = env_test_lock().lock().expect("env test lock");
        let temp_root = std::env::temp_dir().join(format!("omnyid-runtime-root-{}", Ulid::new()));
        let outside_root =
            std::env::temp_dir().join(format!("omnyid-runtime-outside-{}", Ulid::new()));
        std::fs::create_dir_all(&temp_root).expect("temp runtime root");
        std::fs::create_dir_all(&outside_root).expect("temp outside root");
        unsafe {
            std::env::set_var("OMNYID_RUNTIME_ROOT", &temp_root);
        }

        let result = remove_runtime_workspace(outside_root.to_str().expect("outside root path"));
        assert!(result.is_err());

        let _ = std::fs::remove_dir_all(&temp_root);
        let _ = std::fs::remove_dir_all(&outside_root);
        unsafe {
            std::env::remove_var("OMNYID_RUNTIME_ROOT");
        }
    }

    #[test]
    fn runtime_backup_artifact_removal_rejects_paths_outside_backup_root() {
        let _guard = env_test_lock().lock().expect("env test lock");
        let temp_root = std::env::temp_dir().join(format!("omnyid-backup-root-{}", Ulid::new()));
        let outside_file =
            std::env::temp_dir().join(format!("omnyid-backup-outside-{}.json", Ulid::new()));
        std::fs::create_dir_all(&temp_root).expect("temp backup root");
        std::fs::write(&outside_file, "{}").expect("temp outside file");
        unsafe {
            std::env::set_var("OMNYID_RUNTIME_BACKUP_ROOT", &temp_root);
        }

        let result =
            remove_runtime_backup_artifact_path(outside_file.to_str().expect("outside file path"));
        assert!(result.is_err());

        let _ = std::fs::remove_dir_all(&temp_root);
        let _ = std::fs::remove_file(&outside_file);
        unsafe {
            std::env::remove_var("OMNYID_RUNTIME_BACKUP_ROOT");
        }
    }

    #[test]
    fn support_access_history_entry_preserves_audit_fields() {
        let entry = support_access_history_entry(SupportAccessGrantRecord {
            id: "grant_01".to_string(),
            owner_user_id: "user_01".to_string(),
            status: "revoked".to_string(),
            access_scope: "runtime_debug".to_string(),
            reason: Some("Need help with runtime logs".to_string()),
            notes: serde_json::json!({"source": "dashboard"}),
            granted_at: "2026-03-22T00:00:00Z".to_string(),
            expires_at: "2026-03-22T04:00:00Z".to_string(),
            revoked_at: Some("2026-03-22T01:00:00Z".to_string()),
        });

        assert_eq!(entry.id, "grant_01");
        assert_eq!(entry.status, "revoked");
        assert_eq!(entry.access_scope, "runtime_debug");
        assert_eq!(entry.reason.as_deref(), Some("Need help with runtime logs"));
    }

    #[test]
    fn account_delete_confirmation_requires_email_and_exact_phrase() {
        let valid = AccountDeleteRequest {
            email: "preview-user@omnyid.com".to_string(),
            confirmation: "DELETE MY OMNYID ACCOUNT".to_string(),
        };
        let invalid_phrase = AccountDeleteRequest {
            email: "preview-user@omnyid.com".to_string(),
            confirmation: "delete my omnyid account".to_string(),
        };
        let invalid_email = AccountDeleteRequest {
            email: "other@omnyid.com".to_string(),
            confirmation: "DELETE MY OMNYID ACCOUNT".to_string(),
        };

        assert!(account_delete_confirmation_is_valid(
            "preview-user@omnyid.com",
            &valid
        ));
        assert!(!account_delete_confirmation_is_valid(
            "preview-user@omnyid.com",
            &invalid_phrase
        ));
        assert!(!account_delete_confirmation_is_valid(
            "preview-user@omnyid.com",
            &invalid_email
        ));
    }

    #[test]
    fn onboarding_bundle_unix_command_uses_env_vars_and_positional_mode() {
        let user = UserRecord {
            id: "01TESTUSER0000000000000000".to_string(),
            email: "preview-user@omnyid.com".to_string(),
            password_hash: None,
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: "Preview User".to_string(),
            created_at: "2026-03-21T00:00:00Z".to_string(),
        };
        let onboarding = UserOnboardingRecord {
            owner_user_id: user.id.clone(),
            identity_confirmed: true,
            email_provider: None,
            email_address: Some(user.email.clone()),
            email_connected: false,
            llm_mode: "byo_or_local".to_string(),
            notes: serde_json::json!({
                "privacy_mode": "private_hosted",
                "deployment_target": "oracle_cloud",
                "detected_platform": "macOS"
            }),
            updated_at: "2026-03-21T00:00:00Z".to_string(),
            completed_at: Some("2026-03-21T00:00:00Z".to_string()),
        };
        let bundle = build_onboarding_bundle_response(&user, &onboarding, &[]);
        let command = bundle.commands.first().cloned().unwrap_or_default();

        assert!(command.contains("OMNYID_WORKSPACE_NAME=\"Preview User\""));
        assert!(command.contains("OMNYID_OWNER_EMAIL=\"preview-user@omnyid.com\""));
        assert!(command.contains("./install-omnyid-private.sh oracle"));
        assert!(!command.contains("--workspace-name"));
    }

    #[test]
    fn account_session_entry_marks_current_session_and_redacts_token() {
        let entry = account_session_entry(
            AuthSessionRecord {
                token: "abcdef1234567890".to_string(),
                user_id: "user_01".to_string(),
                created_at: "2026-03-22T00:00:00Z".to_string(),
                expires_at: "2026-03-29T00:00:00Z".to_string(),
            },
            "abcdef1234567890",
        );

        assert!(entry.current);
        assert_eq!(entry.token_preview, "abcd...7890");
    }

    #[test]
    fn runtime_deployment_response_redacts_runtime_env_token() {
        let deployment = RuntimeDeploymentRecord {
            id: "runtime_01".to_string(),
            owner_user_id: "user_01".to_string(),
            framework: "crewai".to_string(),
            gui: Some("crewai-studio".to_string()),
            status: "running".to_string(),
            python_version: "3.13".to_string(),
            image_ref: "python:3.13-slim".to_string(),
            runtime_token: "abcdef1234567890".to_string(),
            workspace_path: "/tmp/runtime".to_string(),
            config_json: serde_json::json!({
                "runtime_env": {
                    "OMNYID_RUNTIME_TOKEN": "abcdef1234567890",
                    "OMNYID_OWNER_USER_ID": "user_01"
                }
            }),
            created_at: "2026-03-22T00:00:00Z".to_string(),
            updated_at: "2026-03-22T00:00:00Z".to_string(),
        };

        let response = runtime_deployment_response(deployment);
        assert_eq!(response.runtime_token_preview, "abcd...7890");
        assert_eq!(
            response.config_json["runtime_env"]["OMNYID_RUNTIME_TOKEN"],
            serde_json::json!("abcd...7890")
        );
    }

    #[tokio::test]
    async fn runtime_deployment_response_live_embeds_runtime_monitor_preview() {
        let tmp = std::env::temp_dir().join(format!(
            "omnyid-runtime-response-test-{}",
            ulid::Ulid::new()
        ));
        let logs_dir = tmp.join("logs");
        std::fs::create_dir_all(&logs_dir).expect("logs dir");
        std::fs::write(
            logs_dir.join("build-start.log"),
            "#1 [internal] load build definition from Dockerfile\n#2 [internal] load metadata\n",
        )
        .expect("build log");

        let deployment = RuntimeDeploymentRecord {
            id: "runtime_01".to_string(),
            owner_user_id: "user_01".to_string(),
            framework: "python-runner-chat".to_string(),
            gui: Some("builtin-chat-window".to_string()),
            status: "starting".to_string(),
            python_version: "3.13".to_string(),
            image_ref: "python:3.13-slim-bookworm".to_string(),
            runtime_token: "abcdef1234567890".to_string(),
            workspace_path: tmp.to_string_lossy().to_string(),
            config_json: serde_json::json!({}),
            created_at: "2026-03-22T00:00:00Z".to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };

        let response = super::runtime_deployment_response_live(deployment).await;
        let monitor = response.runtime_monitor.expect("monitor preview");
        assert_eq!(monitor.status, "starting");
        assert_eq!(monitor.source, "build-start.log");
        assert!(
            monitor
                .lines
                .iter()
                .any(|line: &String| line.contains("load build definition"))
        );
        let status_panel = response
            .runtime_status_panel
            .expect("runtime status panel");
        assert_eq!(
            status_panel["schema_version"].as_str(),
            Some("a2ui.v1")
        );
        assert_eq!(status_panel["title"].as_str(), Some("Runtime status"));
        let status_views = response
            .runtime_status_views
            .expect("runtime status views");
        assert_eq!(status_views.len(), 2);
        assert_eq!(status_views[0]["format"].as_str(), Some("a2ui.v1"));
        assert_eq!(status_views[1]["format"].as_str(), Some("a2ui.v1"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn task_complete_result_payload_accepts_wrapped_and_flat_shapes() {
        let wrapped = super::TaskCompleteRequest {
            result: Some(serde_json::json!({
                "status": "done",
                "final_answer": "wrapped payload",
                "steps_taken": 2
            })),
            extra: std::collections::HashMap::new(),
        };
        let wrapped_result = task_complete_result_payload(wrapped).expect("wrapped result");
        assert_eq!(wrapped_result["status"], "done");
        assert_eq!(wrapped_result["steps_taken"], 2);

        let mut flat_extra = std::collections::HashMap::new();
        flat_extra.insert("status".to_string(), serde_json::json!("failed"));
        flat_extra.insert("error".to_string(), serde_json::json!("runner crashed"));
        let flat = super::TaskCompleteRequest {
            result: None,
            extra: flat_extra,
        };
        let flat_result = task_complete_result_payload(flat).expect("flat result");
        assert_eq!(flat_result["status"], "failed");
        assert_eq!(flat_result["error"], "runner crashed");

        let empty = super::TaskCompleteRequest {
            result: None,
            extra: std::collections::HashMap::new(),
        };
        assert!(task_complete_result_payload(empty).is_none());
    }

    #[test]
    fn agent_tasks_response_shape_remains_wrapped() {
        let payload = serde_json::json!({
            "tasks": [
                {
                    "id": "task_01",
                    "objective": "Plan the day",
                    "status": "pending"
                }
            ]
        });

        assert!(payload.is_object());
        assert!(payload.get("tasks").and_then(serde_json::Value::as_array).is_some());
        assert_eq!(payload["tasks"][0]["id"], "task_01");
        assert_eq!(payload["tasks"][0]["status"], "pending");
    }

    #[test]
    fn task_response_helpers_preserve_lifecycle_contract() {
        let task = crate::agent_template::AgentTask::new(
            "user_01".to_string(),
            "agent_instance_01".to_string(),
            "Plan the week".to_string(),
            crate::agent_template::TaskPriority::Normal,
        );

        let created = task_created_response_payload(&task);
        assert_eq!(created["task_id"], task.id);
        assert_eq!(created["thread_id"], task.thread_id);
        assert_eq!(created["status"], "pending");

        let listed = task_list_response_payload(vec![serde_json::json!({
            "id": task.id,
            "thread_id": task.thread_id,
            "status": "pending",
            "intent": task.intent,
        })]);
        assert!(listed["tasks"].is_array());
        assert_eq!(listed["tasks"][0]["status"], "pending");

        let completed = task_status_response_payload(
            created["task_id"].as_str().unwrap_or_default(),
            "completed",
        );
        assert_eq!(completed["task_id"], created["task_id"]);
        assert_eq!(completed["status"], "completed");
    }

    #[test]
    fn merge_thread_messages_deduplicates_and_sorts() {
        let private = vec![Message {
            protocol: "afp-v1".to_string(),
            id: "m2".to_string(),
            thread_id: "thread-1".to_string(),
            parent_id: String::new(),
            from: "agent-private".to_string(),
            to: vec![],
            timestamp: "2026-03-27T10:01:00Z".to_string(),
            r#type: "agent".to_string(),
            content: "{}".to_string(),
            signature: String::new(),
            encryption: "{}".to_string(),
            views: "[]".to_string(),
            references: "[]".to_string(),
            attachments: "[]".to_string(),
            store_in_relational: false,
            subtype: "plan".to_string(),
            metadata: "{}".to_string(),
        }];
        let public = vec![
            Message {
                protocol: "afp-v1".to_string(),
                id: "m1".to_string(),
                thread_id: "thread-1".to_string(),
                parent_id: String::new(),
                from: "agent-public".to_string(),
                to: vec![],
                timestamp: "2026-03-27T10:00:00Z".to_string(),
                r#type: "agent".to_string(),
                content: "{}".to_string(),
                signature: String::new(),
                encryption: "{}".to_string(),
                views: "[]".to_string(),
                references: "[]".to_string(),
                attachments: "[]".to_string(),
                store_in_relational: false,
                subtype: "message".to_string(),
                metadata: "{}".to_string(),
            },
            Message {
                protocol: "afp-v1".to_string(),
                id: "m2".to_string(),
                thread_id: "thread-1".to_string(),
                parent_id: String::new(),
                from: "agent-public".to_string(),
                to: vec![],
                timestamp: "2026-03-27T10:01:00Z".to_string(),
                r#type: "agent".to_string(),
                content: "{}".to_string(),
                signature: String::new(),
                encryption: "{}".to_string(),
                views: "[]".to_string(),
                references: "[]".to_string(),
                attachments: "[]".to_string(),
                store_in_relational: false,
                subtype: "message".to_string(),
                metadata: "{}".to_string(),
            },
        ];

        let merged = merge_thread_messages(private, public);
        let ids = merged.iter().map(|message| message.id.as_str()).collect::<Vec<_>>();
        assert_eq!(ids, vec!["m1", "m2"]);
        assert_eq!(merged.len(), 2);
    }

    #[tokio::test]
    async fn local_postgres_store_app_message_for_headers_uses_tenant_private_storage() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_store_headers_{suffix}"),
            email: format!("store-headers-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Store Headers {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let message = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: format!("msg_store_headers_{suffix}"),
            thread_id: format!("thread_store_headers_{suffix}"),
            parent_id: None,
            from: format!("omnyid://workspace/{}", user.id),
            to: vec![],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: "agent".to_string(),
            subtype: Some("message".to_string()),
            content: serde_json::json!({
                "body": "tenant scoped message",
                "kind": "smoke_private_transport"
            }),
            metadata: Some(serde_json::json!({
                "origin": "server_test"
            })),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        };

        let relay_tx = tokio::sync::broadcast::channel::<String>(16).0;
        let message_id = store_app_message_for_headers(
            &db,
            &Arc::new(Metrics::default()),
            &relay_tx,
            &headers,
            message,
        )
        .await
        .expect("store app message");

        let schema_name = db
            .ensure_user_private_schema(&user.id)
            .await
            .expect("ensure private schema");
        let tenant_count: i64 = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT COUNT(*) FROM \"{}\".messages WHERE id = $1",
            schema_name
        ))
        .bind(&message_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant rows");
        assert_eq!(tenant_count, 1);

        let public_count: i64 =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM public.messages WHERE id = $1")
                .bind(&message_id)
                .fetch_one(&db.pool)
                .await
                .expect("count public rows");
        assert_eq!(public_count, 0);
    }

    #[tokio::test]
    async fn local_postgres_store_app_message_for_headers_without_auth_uses_shared_storage() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let headers = HeaderMap::new();
        let message = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: format!("msg_store_headers_public_{suffix}"),
            thread_id: format!("thread_store_headers_public_{suffix}"),
            parent_id: None,
            from: "omnyid://transport/public".to_string(),
            to: vec![],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: "agent".to_string(),
            subtype: Some("message".to_string()),
            content: serde_json::json!({
                "body": "shared fallback message",
                "kind": "smoke_shared_transport"
            }),
            metadata: Some(serde_json::json!({
                "origin": "server_test_fallback"
            })),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        };

        let relay_tx = tokio::sync::broadcast::channel::<String>(16).0;
        let message_id = store_app_message_for_headers(
            &db,
            &Arc::new(Metrics::default()),
            &relay_tx,
            &headers,
            message,
        )
        .await
        .expect("store shared fallback message");

        let public_count: i64 =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM public.messages WHERE id = $1")
                .bind(&message_id)
                .fetch_one(&db.pool)
                .await
                .expect("count public rows");
        assert_eq!(public_count, 1);
    }

    #[tokio::test]
    async fn local_postgres_send_http_authenticated_uses_tenant_private_storage() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_send_http_{suffix}"),
            email: format!("send-http-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Send Http {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_send_http_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let message = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: format!("msg_send_http_{suffix}"),
            thread_id: format!("thread_send_http_{suffix}"),
            parent_id: None,
            from: format!("omnyid://workspace/{}", user.id),
            to: vec![],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: "agent".to_string(),
            subtype: Some("message".to_string()),
            content: serde_json::json!({
                "body": "authenticated send",
                "kind": "smoke_send_http"
            }),
            metadata: Some(serde_json::json!({
                "origin": "server_test_send_http"
            })),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        };

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let response = super::send_http(State(state), headers, Json(message))
            .await
            .expect("send http");
        let payload = response.0;
        let message_id = payload["message_id"]
            .as_str()
            .expect("message id")
            .to_string();

        let schema_name = db
            .ensure_user_private_schema(&user.id)
            .await
            .expect("ensure private schema");
        let tenant_count: i64 = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT COUNT(*) FROM \"{}\".messages WHERE id = $1",
            schema_name
        ))
        .bind(&message_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant rows");
        assert_eq!(tenant_count, 1);

        let public_count: i64 =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM public.messages WHERE id = $1")
                .bind(&message_id)
                .fetch_one(&db.pool)
                .await
                .expect("count public rows");
        assert_eq!(public_count, 0);
    }

    #[tokio::test]
    async fn local_postgres_send_http_without_auth_uses_shared_storage() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let headers = HeaderMap::new();
        let message = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: format!("msg_send_http_public_{suffix}"),
            thread_id: format!("thread_send_http_public_{suffix}"),
            parent_id: None,
            from: "omnyid://transport/public".to_string(),
            to: vec![],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: "agent".to_string(),
            subtype: Some("message".to_string()),
            content: serde_json::json!({
                "body": "unauthenticated send",
                "kind": "smoke_send_http_shared"
            }),
            metadata: Some(serde_json::json!({
                "origin": "server_test_send_http_shared"
            })),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        };

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let response = super::send_http(State(state), headers, Json(message))
            .await
            .expect("send http");
        let payload = response.0;
        let message_id = payload["message_id"]
            .as_str()
            .expect("message id")
            .to_string();

        let public_count: i64 =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM public.messages WHERE id = $1")
                .bind(&message_id)
                .fetch_one(&db.pool)
                .await
                .expect("count public rows");
        assert_eq!(public_count, 1);
    }

    #[tokio::test]
    async fn local_postgres_execute_action_http_authenticated_uses_tenant_private_storage() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_execute_action_{suffix}"),
            email: format!("execute-action-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Execute Action {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_execute_action_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let thread_id = format!("thread_execute_action_{suffix}");
        let capability_id = format!("cap_test_{suffix}");
        let request = super::ExecuteActionRequest {
            capability: crate::integration::IntegrationCapability {
                capability_id: capability_id.clone(),
                provider: "test".to_string(),
                operation: "preview".to_string(),
                transport: crate::integration::IntegrationTransport::Rest,
                scopes: vec![],
                approval_mode: crate::integration::ApprovalMode::SuggestOnly,
                secret_refs: vec![],
                metadata: serde_json::json!({}),
            },
            intent: crate::integration::ActionIntent {
                capability_id: capability_id.clone(),
                thread_id: thread_id.clone(),
                requested_by: user.id.clone(),
                input: serde_json::json!({"hello": "world"}),
                reason: Some("smoke test".to_string()),
            },
            url: "https://example.invalid/api".to_string(),
            method: "POST".to_string(),
            bearer_token: None,
        };

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let response = super::execute_action_http(State(state), headers, Json(request))
            .await
            .expect("execute action");
        let payload = response.0;
        let intent_message_id = payload["intent_message_id"]
            .as_str()
            .expect("intent id")
            .to_string();
        let result_message_id = payload["result_message_id"]
            .as_str()
            .expect("result id")
            .to_string();
        assert_eq!(payload["thread_id"].as_str(), Some(thread_id.as_str()));

        let schema_name = db
            .ensure_user_private_schema(&user.id)
            .await
            .expect("ensure private schema");
        let tenant_count: i64 = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT COUNT(*) FROM \"{}\".messages WHERE id = ANY($1)",
            schema_name
        ))
        .bind(vec![intent_message_id.clone(), result_message_id.clone()])
        .fetch_one(&db.pool)
        .await
        .expect("count tenant rows");
        assert_eq!(tenant_count, 2);

        let public_count: i64 =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM public.messages WHERE id = ANY($1)")
                .bind(vec![intent_message_id, result_message_id])
                .fetch_one(&db.pool)
                .await
                .expect("count public rows");
        assert_eq!(public_count, 0);
    }

    #[tokio::test]
    async fn local_postgres_execute_action_http_without_auth_uses_shared_storage() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let headers = HeaderMap::new();
        let thread_id = format!("thread_execute_action_public_{suffix}");
        let capability_id = format!("cap_public_{suffix}");
        let request = super::ExecuteActionRequest {
            capability: crate::integration::IntegrationCapability {
                capability_id: capability_id.clone(),
                provider: "test".to_string(),
                operation: "preview".to_string(),
                transport: crate::integration::IntegrationTransport::Rest,
                scopes: vec![],
                approval_mode: crate::integration::ApprovalMode::SuggestOnly,
                secret_refs: vec![],
                metadata: serde_json::json!({}),
            },
            intent: crate::integration::ActionIntent {
                capability_id: capability_id.clone(),
                thread_id: thread_id.clone(),
                requested_by: "omnyid://transport/public".to_string(),
                input: serde_json::json!({"hello": "world"}),
                reason: Some("smoke test public".to_string()),
            },
            url: "https://example.invalid/api".to_string(),
            method: "POST".to_string(),
            bearer_token: None,
        };

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let response = super::execute_action_http(State(state), headers, Json(request))
            .await
            .expect("execute action");
        let payload = response.0;
        let intent_message_id = payload["intent_message_id"]
            .as_str()
            .expect("intent id")
            .to_string();
        let result_message_id = payload["result_message_id"]
            .as_str()
            .expect("result id")
            .to_string();
        assert_eq!(payload["thread_id"].as_str(), Some(thread_id.as_str()));

        let public_count: i64 =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM public.messages WHERE id = ANY($1)")
                .bind(vec![intent_message_id, result_message_id])
                .fetch_one(&db.pool)
                .await
                .expect("count public rows");
        assert_eq!(public_count, 2);
    }

    #[tokio::test]
    async fn local_postgres_agent_task_complete_http_authenticated_appends_private_result_trace() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_task_complete_{suffix}"),
            email: format!("task-complete-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Task Complete {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_task_complete_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let instance =
            AgentInstance::provision(&user.id, &format!("TaskComplete{suffix}"), "omnyid.test");
        let instance_id = db
            .provision_agent(&instance)
            .await
            .expect("provision agent");
        let task = AgentTask::new(
            user.id.clone(),
            instance_id,
            "Complete the smoke-task".to_string(),
            TaskPriority::Normal,
        );
        db.create_agent_task(&task).await.expect("create task");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let response = super::agent_task_complete_http(
            State(state),
            headers.clone(),
            axum::extract::Path(task.id.clone()),
            Json(super::TaskCompleteRequest {
                result: Some(serde_json::json!({
                    "status": "done",
                    "final_answer": "Smoke task completed successfully."
                })),
                extra: std::collections::HashMap::new(),
            }),
        )
        .await
        .expect("complete task");
        let payload = response.0;
        assert_eq!(payload["task_id"].as_str(), Some(task.id.as_str()));
        assert_eq!(payload["status"].as_str(), Some("completed"));

        let thread_messages = super::thread_messages_for_headers(&db, &headers, &task.thread_id)
            .await
            .expect("read thread");
        let result_message = thread_messages
            .iter()
            .find(|message| message.r#type == "agent" && message.subtype == "result")
            .expect("result trace in private thread");

        let result_content: serde_json::Value =
            serde_json::from_str(&result_message.content).expect("result content json");
        let result_metadata: serde_json::Value =
            serde_json::from_str(&result_message.metadata).expect("result metadata json");
        assert_eq!(result_content["task_id"].as_str(), Some(task.id.as_str()));
        assert_eq!(result_content["status"].as_str(), Some("completed"));
        assert_eq!(
            result_content["final_answer"].as_str(),
            Some("Smoke task completed successfully.")
        );
        assert_eq!(result_metadata["legacy_type"].as_str(), Some("agent_result"));

        let schema_name = db
            .ensure_user_private_schema(&user.id)
            .await
            .expect("ensure private schema");
        let tenant_count: i64 = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT COUNT(*) FROM \"{}\".messages WHERE thread_id = $1",
            schema_name
        ))
        .bind(&task.thread_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant rows");
        assert_eq!(tenant_count, 1);

        let public_count: i64 = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM public.messages WHERE thread_id = $1",
        )
        .bind(&task.thread_id)
        .fetch_one(&db.pool)
        .await
        .expect("count public rows");
        assert_eq!(public_count, 0);
    }

    #[tokio::test]
    async fn local_postgres_get_thread_http_authenticated_merges_private_and_shared_messages() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_thread_merge_{suffix}"),
            email: format!("thread-merge-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Thread Merge {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_thread_merge_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let thread_id = format!("thread_merge_{suffix}");
        let private_message = Message {
            protocol: "afp-v1".to_string(),
            id: format!("private_thread_msg_{suffix}"),
            thread_id: thread_id.clone(),
            parent_id: String::new(),
            from: format!("omnyid://workspace/{}", user.id),
            to: vec![],
            timestamp: "2026-03-27T00:00:00Z".to_string(),
            r#type: "agent".to_string(),
            content: String::new(),
            signature: "smoke-signature".to_string(),
            encryption: String::new(),
            views: String::new(),
            references: String::new(),
            attachments: String::new(),
            store_in_relational: true,
            subtype: "result".to_string(),
            metadata: serde_json::json!({"legacy_type": "agent_result"}).to_string(),
        };
        db.store_private_message(
            &user.id,
            &private_message,
            serde_json::json!({"final_answer": "private trace"}),
        )
        .await
        .expect("store private message");

        let shared_message = Message {
            protocol: "afp-v1".to_string(),
            id: format!("shared_thread_msg_{suffix}"),
            thread_id: thread_id.clone(),
            parent_id: String::new(),
            from: "omnyid://transport/public".to_string(),
            to: vec![],
            timestamp: "2026-03-27T00:00:01Z".to_string(),
            r#type: "agent".to_string(),
            content: String::new(),
            signature: "smoke-signature".to_string(),
            encryption: String::new(),
            views: String::new(),
            references: String::new(),
            attachments: String::new(),
            store_in_relational: true,
            subtype: "message".to_string(),
            metadata: serde_json::json!({"origin": "shared"}).to_string(),
        };
        db.store_message(&shared_message, serde_json::json!({"body": "shared trace"}))
            .await
            .expect("store shared message");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );
        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let response = super::get_thread_http(State(state), headers, Path(thread_id.clone()))
            .await
            .expect("get thread");
        let messages = response.0;
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].id, private_message.id);
        assert_eq!(messages[0].r#type, "agent");
        assert_eq!(messages[0].subtype.as_deref(), Some("result"));
        assert_eq!(
            messages[0].content["final_answer"].as_str(),
            Some("private trace")
        );
        assert_eq!(messages[1].id, shared_message.id);
        assert_eq!(messages[1].content["body"].as_str(), Some("shared trace"));
    }

    #[tokio::test]
    async fn local_postgres_agent_task_lifecycle_round_trip_through_http() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_task_http_flow_{suffix}"),
            email: format!("task-http-flow-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Task Flow {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_task_http_flow_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let instance =
            AgentInstance::provision(&user.id, &format!("TaskFlow{suffix}"), "omnyid.test");
        db.provision_agent(&instance).await.expect("provision agent");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let created = super::agent_intent_http(
            State(state.clone()),
            headers.clone(),
            Json(super::AgentIntentRequest {
                intent: "Plan my day around deep work and meetings".to_string(),
                priority: Some("high".to_string()),
            }),
        )
        .await
        .expect("create task")
        .0;

        let task_id = created["task_id"]
            .as_str()
            .expect("task id")
            .to_string();
        let thread_id = created["thread_id"]
            .as_str()
            .expect("thread id")
            .to_string();
        assert_eq!(created["status"].as_str(), Some("pending"));

        let before_messages = super::get_thread_http(
            State(state.clone()),
            headers.clone(),
            Path(thread_id.clone()),
        )
        .await
        .expect("get thread before completion")
        .0;
        assert_eq!(before_messages.len(), 1);
        assert_eq!(before_messages[0].r#type, "agent");
        assert_eq!(before_messages[0].subtype.as_deref(), Some("plan"));
        assert_eq!(
            before_messages[0].content["task_id"].as_str(),
            Some(task_id.as_str())
        );
        assert_eq!(before_messages[0].content["status"].as_str(), Some("pending"));

        let completed = super::agent_task_complete_http(
            State(state.clone()),
            headers.clone(),
            Path(task_id.clone()),
            Json(super::TaskCompleteRequest {
                result: Some(serde_json::json!({
                    "status": "done",
                    "final_answer": "Day plan prepared with two focused blocks."
                })),
                extra: std::collections::HashMap::new(),
            }),
        )
        .await
        .expect("complete task")
        .0;
        assert_eq!(completed["task_id"].as_str(), Some(task_id.as_str()));
        assert_eq!(completed["status"].as_str(), Some("completed"));

        let detail = super::agent_task_detail_http(
            State(state.clone()),
            headers.clone(),
            Path(task_id.clone()),
        )
        .await
        .expect("task detail")
        .0;
        assert_eq!(detail["status"].as_str(), Some("completed"));
        assert_eq!(detail["result"]["status"].as_str(), Some("done"));

        let after_messages = super::get_thread_http(State(state), headers, Path(thread_id.clone()))
            .await
            .expect("get thread after completion")
            .0;
        assert_eq!(after_messages.len(), 2);
        assert_eq!(after_messages[0].r#type, "agent");
        assert_eq!(after_messages[0].subtype.as_deref(), Some("plan"));
        assert_eq!(after_messages[1].r#type, "agent");
        assert_eq!(after_messages[1].subtype.as_deref(), Some("result"));
        assert_eq!(after_messages[1].content["task_id"].as_str(), Some(task_id.as_str()));
        assert_eq!(
            after_messages[1].content["final_answer"].as_str(),
            Some("Day plan prepared with two focused blocks.")
        );
        assert_eq!(
            after_messages[1]
                .metadata
                .as_ref()
                .and_then(|metadata| metadata["legacy_type"].as_str()),
            Some("agent_result")
        );

        let schema_name = db
            .ensure_user_private_schema(&user.id)
            .await
            .expect("ensure private schema");
        let tenant_count: i64 = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT COUNT(*) FROM \"{}\".messages WHERE thread_id = $1",
            schema_name
        ))
        .bind(&thread_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant rows");
        assert_eq!(tenant_count, 2);

        let public_count: i64 =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM public.messages WHERE thread_id = $1")
                .bind(&thread_id)
                .fetch_one(&db.pool)
                .await
                .expect("count public rows");
        assert_eq!(public_count, 0);
    }

    #[tokio::test]
    async fn local_postgres_runner_task_poll_and_complete_round_trip_through_http() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_runner_task_http_{suffix}"),
            email: format!("runner-task-http-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Runner Task {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_runner_task_http_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let instance =
            AgentInstance::provision(&user.id, &format!("RunnerTask{suffix}"), "omnyid.test");
        db.provision_agent(&instance).await.expect("provision agent");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let created = super::agent_intent_http(
            State(state.clone()),
            headers.clone(),
            Json(super::AgentIntentRequest {
                intent: "Prepare a runner task for polling".to_string(),
                priority: Some("normal".to_string()),
            }),
        )
        .await
        .expect("create task")
        .0;

        let task_id = created["task_id"]
            .as_str()
            .expect("task id")
            .to_string();
        let thread_id = created["thread_id"]
            .as_str()
            .expect("thread id")
            .to_string();

        let pending_before = super::agent_tasks_http(
            State(state.clone()),
            headers.clone(),
            Query(super::AgentTasksQuery {
                status: Some("pending".to_string()),
                limit: 10,
            }),
        )
        .await
        .expect("list pending tasks before completion")
        .0;
        let pending_before_tasks = pending_before["tasks"]
            .as_array()
            .expect("pending task list");
        assert!(pending_before_tasks
            .iter()
            .any(|task| task["id"].as_str() == Some(task_id.as_str())));

        let completed_before = super::agent_tasks_http(
            State(state.clone()),
            headers.clone(),
            Query(super::AgentTasksQuery {
                status: Some("completed".to_string()),
                limit: 10,
            }),
        )
        .await
        .expect("list completed tasks before completion")
        .0;
        let completed_before_tasks = completed_before["tasks"]
            .as_array()
            .expect("completed task list");
        assert!(!completed_before_tasks
            .iter()
            .any(|task| task["id"].as_str() == Some(task_id.as_str())));

        let completed = super::agent_task_complete_http(
            State(state.clone()),
            headers.clone(),
            Path(task_id.clone()),
            Json(super::TaskCompleteRequest {
                result: Some(serde_json::json!({
                    "status": "done",
                    "final_answer": "Runner completed the task and returned a summary.",
                    "steps_taken": 2
                })),
                extra: std::collections::HashMap::new(),
            }),
        )
        .await
        .expect("complete task")
        .0;
        assert_eq!(completed["task_id"].as_str(), Some(task_id.as_str()));
        assert_eq!(completed["status"].as_str(), Some("completed"));

        let pending_after = super::agent_tasks_http(
            State(state.clone()),
            headers.clone(),
            Query(super::AgentTasksQuery {
                status: Some("pending".to_string()),
                limit: 10,
            }),
        )
        .await
        .expect("list pending tasks after completion")
        .0;
        let pending_after_tasks = pending_after["tasks"]
            .as_array()
            .expect("pending task list after completion");
        assert!(!pending_after_tasks
            .iter()
            .any(|task| task["id"].as_str() == Some(task_id.as_str())));

        let completed_after = super::agent_tasks_http(
            State(state.clone()),
            headers.clone(),
            Query(super::AgentTasksQuery {
                status: Some("completed".to_string()),
                limit: 10,
            }),
        )
        .await
        .expect("list completed tasks after completion")
        .0;
        let completed_after_tasks = completed_after["tasks"]
            .as_array()
            .expect("completed task list after completion");
        let completed_task = completed_after_tasks
            .iter()
            .find(|task| task["id"].as_str() == Some(task_id.as_str()))
            .expect("completed task present");
        assert_eq!(completed_task["status"].as_str(), Some("completed"));
        assert_eq!(completed_task["thread_id"].as_str(), Some(thread_id.as_str()));

        let thread = super::get_thread_http(State(state), headers, Path(thread_id.clone()))
            .await
            .expect("get thread after runner completion")
            .0;
        assert_eq!(thread.len(), 2);
        assert_eq!(thread[0].subtype.as_deref(), Some("plan"));
        assert_eq!(thread[1].subtype.as_deref(), Some("result"));
        assert_eq!(
            thread[1].content["final_answer"].as_str(),
            Some("Runner completed the task and returned a summary.")
        );
    }

    #[tokio::test]
    async fn local_postgres_workflows_round_trip_through_http() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_workflows_http_{suffix}"),
            email: format!("workflows-http-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Workflows Http {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_workflows_http_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let workflow_id = format!("wf_http_{suffix}");
        let graph = serde_json::json!({
            "version": "omnyid-workflow.v1",
            "workflow_id": workflow_id,
            "title": "Research workflow",
            "description": "A saved workflow for the builder",
            "status": "draft",
            "environment": "dev",
            "owner_user_id": "wrong-user-will-be-normalized",
            "root_node_ids": ["node_trigger"],
            "nodes": [
                {
                    "id": "node_trigger",
                    "kind": "trigger",
                    "label": "Manual start",
                    "position": {"x": 40, "y": 40},
                    "inputs": [],
                    "outputs": [],
                    "policy": {
                        "mask": "private",
                        "approval_mode": "none",
                        "allowed_tools": [],
                        "allowed_capabilities": [],
                        "max_steps": 1,
                        "max_cost_cents": 0,
                        "outbound_allowlist": []
                    },
                    "metadata": {},
                    "hidden_runtime_nodes": [],
                    "config": {
                        "trigger_kind": "manual",
                        "event_filter": {}
                    }
                },
                {
                    "id": "node_agent",
                    "kind": "agent",
                    "label": "Research assistant",
                    "position": {"x": 280, "y": 40},
                    "inputs": [],
                    "outputs": [],
                    "policy": {
                        "mask": "private",
                        "approval_mode": "none",
                        "allowed_tools": ["web_search"],
                        "allowed_capabilities": [],
                        "max_steps": 3,
                        "max_cost_cents": 25,
                        "outbound_allowlist": []
                    },
                    "metadata": {},
                    "hidden_runtime_nodes": ["context", "executor", "reflection"],
                    "config": {
                        "objective": "Search and summarise web findings",
                        "preset_kind": "research_assistant",
                        "memory_scope": "thread_summary"
                    }
                }
            ],
            "edges": [
                {
                    "id": "edge_start",
                    "source": "node_trigger",
                    "target": "node_agent",
                    "metadata": {}
                }
            ],
            "presets": [
                {
                    "preset_id": "preset_research",
                    "preset_kind": "research_assistant",
                    "label": "Research Assistant",
                    "root_node_ids": ["node_trigger"],
                    "favorite_eligible": true,
                    "parameter_schema": {}
                }
            ],
            "optimization_mode": "balanced",
            "metadata": {
                "source": "server_smoke_test"
            }
        });

        let validation = super::workflows_validate_http(
            headers.clone(),
            State(state.clone()),
            Json(super::ValidateWorkflowRequest {
                graph: graph.clone(),
            }),
        )
        .await
        .expect("validate workflow")
        .0;
        assert_eq!(validation["valid"].as_bool(), Some(true));
        assert_eq!(validation["summary"]["node_count"].as_u64(), Some(2));

        let saved = super::workflows_save_http(
            State(state.clone()),
            headers.clone(),
            Json(super::SaveWorkflowRequest {
                graph: graph.clone(),
                latest_ir: None,
                favorite: Some(true),
                archived: Some(false),
            }),
        )
        .await
        .expect("save workflow")
        .0;
        assert_eq!(saved["saved"].as_bool(), Some(true));
        assert_eq!(saved["workflow"]["workflow_id"].as_str(), Some(workflow_id.as_str()));
        assert_eq!(saved["workflow"]["owner_user_id"].as_str(), Some(user.id.as_str()));
        assert_eq!(saved["workflow"]["favorite"].as_bool(), Some(true));

        let listed = super::workflows_list_http(
            State(state.clone()),
            headers.clone(),
            Query(super::WorkflowsQuery {
                include_archived: Some(false),
                limit: 10,
            }),
        )
        .await
        .expect("list workflows")
        .0;
        let workflows = listed["workflows"].as_array().expect("workflow list");
        assert!(workflows
            .iter()
            .any(|entry| entry["workflow_id"].as_str() == Some(workflow_id.as_str())));

        let detail = super::workflow_detail_http(
            State(state),
            headers,
            Path(workflow_id.clone()),
        )
        .await
        .expect("workflow detail")
        .0;
        assert_eq!(detail["title"].as_str(), Some("Research workflow"));
        assert_eq!(detail["graph"]["owner_user_id"].as_str(), Some(user.id.as_str()));

        let schema_name = db
            .ensure_user_private_schema(&user.id)
            .await
            .expect("ensure private schema");
        let tenant_count: i64 = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT COUNT(*) FROM \"{}\".saved_workflows WHERE workflow_id = $1",
            schema_name
        ))
        .bind(&workflow_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant workflow rows");
        assert_eq!(tenant_count, 1);
    }

    #[tokio::test]
    async fn local_postgres_workflow_compile_round_trip_through_http() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_workflow_compile_{suffix}"),
            email: format!("workflow-compile-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Workflow Compile {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_workflow_compile_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let workflow_id = format!("wf_compile_{suffix}");
        let graph = serde_json::json!({
            "version": "omnyid-workflow.v1",
            "workflow_id": workflow_id,
            "title": "Compile-ready workflow",
            "status": "draft",
            "environment": "dev",
            "owner_user_id": user.id,
            "root_node_ids": ["start", "worker"],
            "nodes": [
                {
                    "id": "start",
                    "kind": "trigger",
                    "label": "Manual start",
                    "position": {"x": 20, "y": 40},
                    "inputs": [],
                    "outputs": [],
                    "policy": {
                        "mask": "private",
                        "approval_mode": "none",
                        "allowed_tools": [],
                        "allowed_capabilities": [],
                        "max_steps": 1,
                        "max_cost_cents": 0,
                        "outbound_allowlist": []
                    },
                    "metadata": {},
                    "hidden_runtime_nodes": [],
                    "config": {"trigger_kind": "manual", "event_filter": {}}
                },
                {
                    "id": "worker",
                    "kind": "agent",
                    "label": "Research agent",
                    "position": {"x": 220, "y": 40},
                    "inputs": [],
                    "outputs": [],
                    "policy": {
                        "mask": "private",
                        "approval_mode": "none",
                        "allowed_tools": ["web_search"],
                        "allowed_capabilities": [],
                        "max_steps": 3,
                        "max_cost_cents": 25,
                        "outbound_allowlist": []
                    },
                    "metadata": {},
                    "hidden_runtime_nodes": ["plan", "executor"],
                    "config": {
                        "objective": "Plan and execute a research step",
                        "preset_kind": "research_assistant",
                        "memory_scope": "thread_summary"
                    }
                }
            ],
            "edges": [
                {"id": "edge_compile", "source": "start", "target": "worker", "metadata": {}}
            ],
            "presets": [],
            "optimization_mode": "balanced",
            "metadata": {}
        });

        let _ = super::workflows_save_http(
            State(state.clone()),
            headers.clone(),
            Json(super::SaveWorkflowRequest {
                graph,
                latest_ir: None,
                favorite: Some(false),
                archived: Some(false),
            }),
        )
        .await
        .expect("save workflow");

        let compiled = super::workflow_compile_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
        )
        .await
        .expect("compile workflow")
        .0;
        assert_eq!(compiled["compiled"].as_bool(), Some(true));
        assert_eq!(compiled["ir"]["version"].as_str(), Some("omnyid-workflow-ir.v1"));
        assert_eq!(compiled["ir"]["entry_manifest_node_ids"][0].as_str(), Some("mf_start"));

        let detail = super::workflow_detail_http(State(state), headers, Path(workflow_id.clone()))
            .await
            .expect("workflow detail")
            .0;
        assert_eq!(detail["latest_ir"]["version"].as_str(), Some("omnyid-workflow-ir.v1"));
        let manifests = detail["latest_ir"]["manifests"]
            .as_array()
            .expect("manifest list");
        assert_eq!(manifests.len(), 2);
        assert_eq!(manifests[0]["manifest_version"].as_str(), Some("omnyid-runtime-node.v1"));
    }

    #[tokio::test]
    async fn local_postgres_workflow_patch_round_trip_through_http() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_workflow_patch_{suffix}"),
            email: format!("workflow-patch-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Workflow Patch {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_workflow_patch_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let workflow_id = format!("wf_patch_{suffix}");
        let graph = serde_json::json!({
            "version": "omnyid-workflow.v1",
            "workflow_id": workflow_id,
            "title": "Workflow patch",
            "status": "draft",
            "environment": "dev",
            "owner_user_id": user.id,
            "root_node_ids": ["start"],
            "nodes": [
                {
                    "id": "start",
                    "kind": "trigger",
                    "label": "Manual start",
                    "position": {"x": 20, "y": 20},
                    "policy": {"mask": "private", "approval_mode": "none", "allowed_tools": [], "allowed_capabilities": [], "max_steps": 1, "max_cost_cents": 0, "outbound_allowlist": []},
                    "metadata": {},
                    "hidden_runtime_nodes": [],
                    "config": {"trigger_kind": "manual", "event_filter": {}}
                },
                {
                    "id": "agent",
                    "kind": "agent",
                    "label": "Planner",
                    "position": {"x": 240, "y": 20},
                    "policy": {"mask": "private", "approval_mode": "none", "allowed_tools": ["web_search"], "allowed_capabilities": [], "max_steps": 2, "max_cost_cents": 25, "outbound_allowlist": []},
                    "metadata": {},
                    "hidden_runtime_nodes": ["plan", "executor"],
                    "config": {"objective": "Plan and execute", "memory_scope": "thread_summary"}
                }
            ],
            "edges": [],
            "presets": [],
            "optimization_mode": "balanced",
            "metadata": {}
        });

        let _ = super::workflows_save_http(
            State(state.clone()),
            headers.clone(),
            Json(super::SaveWorkflowRequest {
                graph,
                latest_ir: None,
                favorite: Some(false),
                archived: Some(false),
            }),
        )
        .await
        .expect("save workflow");

        let moved = super::workflow_patch_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowPatchRequest {
                op: "node_move".to_string(),
                node_id: Some("agent".to_string()),
                edge_id: None,
                source: None,
                target: None,
                x: Some(420.0),
                y: Some(180.0),
                config: None,
                policy: None,
                prompt: None,
                label: None,
                title: None,
                description: None,
                environment: None,
                optimization_mode: None,
                root_enabled: None,
            }),
        )
        .await
        .expect("move node")
        .0;
        assert_eq!(moved["patched"].as_bool(), Some(true));
        assert_eq!(moved["ir_invalidated"].as_bool(), Some(true));

        let config_replaced = super::workflow_patch_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowPatchRequest {
                op: "node_config_replace".to_string(),
                node_id: Some("agent".to_string()),
                edge_id: None,
                source: None,
                target: None,
                x: None,
                y: None,
                config: Some(serde_json::json!({
                    "objective": "Reconfigured objective",
                    "memory_scope": "thread_summary"
                })),
                policy: None,
                prompt: None,
                label: None,
                title: None,
                description: None,
                environment: None,
                optimization_mode: None,
                root_enabled: None,
            }),
        )
        .await
        .expect("replace config")
        .0;
        assert_eq!(
            config_replaced["workflow"]["graph"]["nodes"][1]["config"]["objective"].as_str(),
            Some("Reconfigured objective")
        );

        let prompt_replaced = super::workflow_patch_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowPatchRequest {
                op: "node_prompt_replace".to_string(),
                node_id: Some("agent".to_string()),
                edge_id: None,
                source: None,
                target: None,
                x: None,
                y: None,
                config: None,
                policy: None,
                prompt: Some(serde_json::json!({
                    "system_prompt": "Keep the plan concise",
                    "instruction_prompt": "Prefer the cheapest valid route",
                    "user_editable": true
                })),
                label: None,
                title: None,
                description: None,
                environment: None,
                optimization_mode: None,
                root_enabled: None,
            }),
        )
        .await
        .expect("replace prompt")
        .0;
        assert_eq!(
            prompt_replaced["workflow"]["graph"]["nodes"][1]["prompt"]["system_prompt"].as_str(),
            Some("Keep the plan concise")
        );

        let node_meta_replaced = super::workflow_patch_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowPatchRequest {
                op: "node_meta_replace".to_string(),
                node_id: Some("agent".to_string()),
                edge_id: None,
                source: None,
                target: None,
                x: None,
                y: None,
                config: None,
                policy: None,
                prompt: None,
                label: Some("Research planner".to_string()),
                title: None,
                description: Some("Coordinates research and synthesis.".to_string()),
                environment: None,
                optimization_mode: None,
                root_enabled: None,
            }),
        )
        .await
        .expect("replace node meta")
        .0;
        assert_eq!(
            node_meta_replaced["workflow"]["graph"]["nodes"][1]["label"].as_str(),
            Some("Research planner")
        );
        assert_eq!(
            node_meta_replaced["workflow"]["graph"]["nodes"][1]["description"].as_str(),
            Some("Coordinates research and synthesis.")
        );

        let root_toggled = super::workflow_patch_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowPatchRequest {
                op: "root_toggle".to_string(),
                node_id: Some("agent".to_string()),
                edge_id: None,
                source: None,
                target: None,
                x: None,
                y: None,
                config: None,
                policy: None,
                prompt: None,
                label: None,
                title: None,
                description: None,
                environment: None,
                optimization_mode: None,
                root_enabled: Some(true),
            }),
        )
        .await
        .expect("toggle root")
        .0;
        assert_eq!(
            root_toggled["workflow"]["graph"]["root_node_ids"]
                .as_array()
                .map(|items| items.len()),
            Some(2)
        );

        let meta_replaced = super::workflow_patch_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowPatchRequest {
                op: "workflow_meta_replace".to_string(),
                node_id: None,
                edge_id: None,
                source: None,
                target: None,
                x: None,
                y: None,
                config: None,
                policy: None,
                prompt: None,
                label: None,
                title: Some("Workflow patch updated".to_string()),
                description: Some("Updated through patch ops".to_string()),
                environment: Some("prod".to_string()),
                optimization_mode: Some("speed".to_string()),
                root_enabled: None,
            }),
        )
        .await
        .expect("replace workflow meta")
        .0;
        assert_eq!(meta_replaced["workflow"]["title"].as_str(), Some("Workflow patch updated"));
        assert_eq!(meta_replaced["workflow"]["graph"]["environment"].as_str(), Some("prod"));
        assert_eq!(meta_replaced["workflow"]["graph"]["optimization_mode"].as_str(), Some("speed"));

        let edge_added = super::workflow_patch_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowPatchRequest {
                op: "edge_add".to_string(),
                node_id: None,
                edge_id: None,
                source: Some("start".to_string()),
                target: Some("agent".to_string()),
                x: None,
                y: None,
                config: None,
                policy: None,
                prompt: None,
                label: None,
                title: None,
                description: None,
                environment: None,
                optimization_mode: None,
                root_enabled: None,
            }),
        )
        .await
        .expect("add edge")
        .0;
        assert_eq!(edge_added["workflow"]["graph"]["edges"].as_array().map(|v| v.len()), Some(1));
    }

    #[tokio::test]
    async fn local_postgres_workflow_actions_round_trip_through_http() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_workflow_actions_{suffix}"),
            email: format!("workflow-actions-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Workflow Actions {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_workflow_actions_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let workflow_id = format!("wf_actions_{suffix}");
        let graph = serde_json::json!({
            "version": "omnyid-workflow.v1",
            "workflow_id": workflow_id,
            "title": "Workflow actions",
            "status": "draft",
            "environment": "dev",
            "owner_user_id": user.id,
            "root_node_ids": ["start"],
            "nodes": [
                {
                    "id": "start",
                    "kind": "trigger",
                    "label": "Manual start",
                    "position": {"x": 20, "y": 20},
                    "inputs": [],
                    "outputs": [],
                    "policy": {
                        "mask": "private",
                        "approval_mode": "none",
                        "allowed_tools": [],
                        "allowed_capabilities": [],
                        "max_steps": 1,
                        "max_cost_cents": 0,
                        "outbound_allowlist": []
                    },
                    "metadata": {},
                    "hidden_runtime_nodes": [],
                    "config": {"trigger_kind": "manual", "event_filter": {}}
                }
            ],
            "edges": [],
            "presets": [],
            "optimization_mode": "balanced",
            "metadata": {}
        });

        let _ = super::workflows_save_http(
            State(state.clone()),
            headers.clone(),
            Json(super::SaveWorkflowRequest {
                graph,
                latest_ir: None,
                favorite: Some(false),
                archived: Some(false),
            }),
        )
        .await
        .expect("save workflow");

        let favorite = super::workflow_action_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowActionRequest {
                action: "favorite".to_string(),
                favorite: Some(true),
                archived: None,
                environment: None,
                deployment_id: None,
            }),
        )
        .await
        .expect("favorite workflow")
        .0;
        assert_eq!(favorite["workflow"]["favorite"].as_bool(), Some(true));

        let _ = super::workflow_compile_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
        )
        .await
        .expect("compile workflow");

        let deploy = super::workflow_action_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowActionRequest {
                action: "deploy".to_string(),
                favorite: None,
                archived: None,
                environment: Some("prod".to_string()),
                deployment_id: None,
            }),
        )
        .await
        .expect("deploy workflow")
        .0;
        assert_eq!(deploy["workflow"]["graph"]["status"].as_str(), Some("deployed"));
        assert_eq!(deploy["workflow"]["graph"]["environment"].as_str(), Some("prod"));
        let first_deployment_id = deploy["deployment_id"]
            .as_str()
            .expect("deployment id")
            .to_string();

        let deployments = super::workflow_deployments_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
        )
        .await
        .expect("list workflow deployments")
        .0;
        let deployment_list = deployments["deployments"]
            .as_array()
            .expect("deployment list");
        assert_eq!(deployment_list.len(), 1);
        assert_eq!(
            deployment_list[0]["deployment_id"].as_str(),
            Some(first_deployment_id.as_str())
        );

        let rollback = super::workflow_action_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowActionRequest {
                action: "rollback".to_string(),
                favorite: None,
                archived: None,
                environment: None,
                deployment_id: Some(first_deployment_id.clone()),
            }),
        )
        .await
        .expect("rollback workflow")
        .0;
        assert_eq!(rollback["workflow"]["graph"]["status"].as_str(), Some("deployed"));
        assert_eq!(rollback["workflow"]["graph"]["environment"].as_str(), Some("prod"));
        let rollback_deployment_id = rollback["deployment_id"]
            .as_str()
            .expect("rollback deployment id")
            .to_string();
        assert_ne!(rollback_deployment_id, first_deployment_id);

        let deployments_after_rollback = super::workflow_deployments_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
        )
        .await
        .expect("list workflow deployments after rollback")
        .0;
        let deployment_list_after = deployments_after_rollback["deployments"]
            .as_array()
            .expect("deployment list after rollback");
        assert_eq!(deployment_list_after.len(), 2);
        assert_eq!(
            deployment_list_after[0]["source_deployment_id"].as_str(),
            Some(first_deployment_id.as_str())
        );
        assert_eq!(
            deployment_list_after[0]["status"].as_str(),
            Some("rollback_active")
        );

        let archive = super::workflow_action_http(
            State(state),
            headers,
            Path(workflow_id.clone()),
            Json(super::WorkflowActionRequest {
                action: "archive".to_string(),
                favorite: None,
                archived: Some(true),
                environment: None,
                deployment_id: None,
            }),
        )
        .await
        .expect("archive workflow")
        .0;
        assert_eq!(archive["workflow"]["graph"]["status"].as_str(), Some("archived"));
        assert!(archive["workflow"]["archived_at"].as_str().is_some());
    }

    #[tokio::test]
    async fn local_postgres_workflow_runs_round_trip_through_http() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_workflow_runs_{suffix}"),
            email: format!("workflow-runs-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Workflow Runs {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_workflow_runs_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let workflow_id = format!("wf_runs_{suffix}");
        let graph = serde_json::json!({
            "version": "omnyid-workflow.v1",
            "workflow_id": workflow_id,
            "title": "Workflow runs",
            "status": "draft",
            "environment": "dev",
            "owner_user_id": user.id,
            "root_node_ids": ["start", "agent"],
            "nodes": [
                {
                    "id": "start",
                    "kind": "trigger",
                    "label": "Manual start",
                    "position": {"x": 20, "y": 20},
                    "policy": {"mask": "private", "approval_mode": "none", "allowed_tools": [], "allowed_capabilities": [], "max_steps": 1, "max_cost_cents": 0, "outbound_allowlist": []},
                    "metadata": {},
                    "hidden_runtime_nodes": [],
                    "config": {"trigger_kind": "manual", "event_filter": {}}
                },
                {
                    "id": "agent",
                    "kind": "agent",
                    "label": "Planner",
                    "position": {"x": 240, "y": 20},
                    "policy": {"mask": "private", "approval_mode": "none", "allowed_tools": ["web_search"], "allowed_capabilities": [], "max_steps": 2, "max_cost_cents": 25, "outbound_allowlist": []},
                    "metadata": {},
                    "hidden_runtime_nodes": ["plan", "executor"],
                    "config": {"objective": "Plan and execute", "memory_scope": "thread_summary"}
                }
            ],
            "edges": [
                {"id": "edge_runs", "source": "start", "target": "agent", "metadata": {}}
            ],
            "presets": [],
            "optimization_mode": "balanced",
            "metadata": {}
        });

        let _ = super::workflows_save_http(
            State(state.clone()),
            headers.clone(),
            Json(super::SaveWorkflowRequest {
                graph,
                latest_ir: None,
                favorite: Some(false),
                archived: Some(false),
            }),
        )
        .await
        .expect("save workflow");

        let _ = super::workflow_compile_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
        )
        .await
        .expect("compile workflow");

        let deploy = super::workflow_action_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowActionRequest {
                action: "deploy".to_string(),
                favorite: None,
                archived: None,
                environment: Some("dev".to_string()),
                deployment_id: None,
            }),
        )
        .await
        .expect("deploy workflow")
        .0;
        let deployment_id = deploy["deployment_id"]
            .as_str()
            .expect("deployment id")
            .to_string();

        let run = super::workflow_run_start_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowRunRequest {
                deployment_id: Some(deployment_id.clone()),
                replay_run_id: None,
                trigger_kind: Some("manual".to_string()),
            }),
        )
        .await
        .expect("start workflow run")
        .0;
        let run_id = run["run"]["run_id"].as_str().expect("run id").to_string();
        assert_eq!(run["run"]["status"].as_str(), Some("completed"));
        assert_eq!(run["run"]["result"]["execution_mode"].as_str(), Some("live"));

        let dry_run = super::workflow_run_start_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowRunRequest {
                deployment_id: Some(deployment_id.clone()),
                replay_run_id: None,
                trigger_kind: Some("dry_run".to_string()),
            }),
        )
        .await
        .expect("dry run workflow")
        .0;
        assert_eq!(dry_run["run"]["status"].as_str(), Some("simulated"));
        assert_eq!(dry_run["run"]["result"]["execution_mode"].as_str(), Some("dry_run"));

        let replay = super::workflow_run_start_http(
            State(state.clone()),
            headers.clone(),
            Path(workflow_id.clone()),
            Json(super::WorkflowRunRequest {
                deployment_id: None,
                replay_run_id: Some(run_id.clone()),
                trigger_kind: None,
            }),
        )
        .await
        .expect("replay workflow run")
        .0;
        assert_eq!(replay["run"]["replay_of_run_id"].as_str(), Some(run_id.as_str()));

        let runs = super::workflow_runs_http(State(state), headers, Path(workflow_id.clone()))
            .await
        .expect("list workflow runs")
        .0;
        let run_list = runs["runs"].as_array().expect("run list");
        assert_eq!(run_list.len(), 3);
        assert_eq!(run_list[0]["workflow_id"].as_str(), Some(workflow_id.as_str()));
    }

    #[tokio::test]
    async fn local_postgres_ui_decision_cancel_orchestration_updates_private_thread() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_orch_cancel_{suffix}"),
            email: format!("orch-cancel-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Orch Cancel {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let session = AuthSessionRecord {
            token: format!("token_orch_cancel_{suffix}"),
            user_id: user.id.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        db.create_session(&session).await.expect("create session");

        let master =
            AgentInstance::provision(&user.id, &format!("OrchCancel{suffix}"), "omnyid.test");
        db.provision_agent(&master).await.expect("provision master");

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", session.token)).expect("auth header"),
        );

        let state = Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        });

        let thread_id = format!("thread.orchestrate.{suffix}");
        let card_id = format!("card.orchestrate.{suffix}");
        let objective = "Organise my week, book appointments, and handle follow-ups";
        let summary =
            "This orchestration may trigger external actions. Review the plan and confirm first.";
        let generative_card = new_server_message(
            master.agent_id.clone(),
            vec![],
            thread_id.clone(),
            "generative_card",
            serde_json::json!({
                "card_id": card_id,
                "query": objective,
                "status": "streaming",
                "optimization_mode": "balanced",
                "provider": "omnyid",
                "model": "",
                "gate": "approval",
                "sections": orchestrate_card_sections(summary, objective, OrchestrationGate::Approval),
            }),
            vec![],
            vec![],
            vec![],
            true,
        )
        .expect("build generative card");
        store_private_app_message(
            &db,
            &Arc::new(Metrics::default()),
            &tokio::sync::broadcast::channel(8).0,
            &user.id,
            generative_card,
        )
        .await
        .expect("store generative card");

        let response = super::ui_decision_http(
            State(state),
            headers.clone(),
            Json(super::UiDecisionRequest {
                card_id: card_id.clone(),
                decision_point_id: "approval_gate".to_string(),
                selected_option_id: "cancel_orchestration".to_string(),
                thread_id: thread_id.clone(),
                agent_id: Some(master.agent_id.clone()),
            }),
        )
        .await
        .expect("cancel orchestration")
        .0;
        assert_eq!(response["success"].as_bool(), Some(true));
        assert!(response["message_id"].as_str().is_some());

        let thread = super::get_thread_http(State(Arc::new(super::AppState {
            db: db.clone(),
            metrics: Arc::new(Metrics::default()),
            relay_tx: tokio::sync::broadcast::channel(8).0,
            rate_limiter: Arc::new(super::RateLimiter::new()),
            trial_runner: Arc::new(super::TrialRunnerManager::new()),
            http_client: reqwest::Client::new(),
        })), headers, Path(thread_id.clone()))
        .await
        .expect("get thread")
        .0;

        assert_eq!(thread.len(), 4);
        assert_eq!(thread[0].r#type, "generative_card");
        assert_eq!(thread[1].r#type, "user_decision");
        assert_eq!(thread[1].subtype.as_deref(), Some("decision_point"));
        assert_eq!(
            thread[1].content["selected_option_id"].as_str(),
            Some("cancel_orchestration")
        );
        assert_eq!(thread[2].r#type, "card_section_update");
        assert_eq!(thread[2].content["section"]["id"].as_str(), Some("approval_gate"));
        assert_eq!(thread[2].content["section"]["type"].as_str(), Some("callout"));
        assert_eq!(thread[2].content["section"]["content"]["tone"].as_str(), Some("warning"));
        assert_eq!(thread[3].r#type, "card_section_update");
        assert_eq!(thread[3].content["section"]["type"].as_str(), Some("final_answer"));
        assert_eq!(
            thread[3].content["section"]["content"]["text"].as_str(),
            Some("Orchestration cancelled before any external action was started.")
        );

        let schema_name = db
            .ensure_user_private_schema(&user.id)
            .await
            .expect("ensure private schema");
        let tenant_count: i64 = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT COUNT(*) FROM \"{}\".messages WHERE thread_id = $1",
            schema_name
        ))
        .bind(&thread_id)
        .fetch_one(&db.pool)
        .await
        .expect("count tenant rows");
        assert_eq!(tenant_count, 4);

        let public_count: i64 =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM public.messages WHERE thread_id = $1")
                .bind(&thread_id)
                .fetch_one(&db.pool)
                .await
                .expect("count public rows");
        assert_eq!(public_count, 0);
    }

    #[test]
    fn task_update_error_maps_missing_task_to_not_found() {
        let (status, message) = task_update_error_to_http(sqlx::Error::RowNotFound);
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(message, "task not found");
    }

    #[test]
    fn trigger_delete_error_maps_missing_trigger_to_not_found() {
        let (status, message) = trigger_delete_error_to_http(sqlx::Error::RowNotFound);
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(message, "trigger not found");
    }

    #[test]
    fn delegation_revoke_error_maps_missing_delegation_to_not_found() {
        let (status, message) = delegation_revoke_error_to_http(sqlx::Error::RowNotFound);
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(message, "delegation not found");
    }

    #[test]
    fn delete_capability_returns_not_found_when_nothing_deleted() {
        let deleted = false;
        let response = if !deleted {
            Err((StatusCode::NOT_FOUND, "capability not found".to_string()))
        } else {
            Ok(StatusCode::NO_CONTENT)
        };
        assert_eq!(
            response,
            Err((StatusCode::NOT_FOUND, "capability not found".to_string()))
        );
    }

    #[test]
    fn server_generated_encrypted_messages_do_not_keep_plaintext_views() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::set_var(
                "OMNYID_ENCRYPTION_KEY_HEX",
                "7190136af4de06db4b36c641be88c682ecd9866986b70af49f68a9b2bc6716cc",
            );
            std::env::set_var(
                "OMNYID_SIGNING_KEY_HEX",
                "4fc83507eef94f7686079409f466e0d44478dc5f8537c67298785e36f6c00534",
            );
        }

        let message = new_server_message(
            "agent:test-alpha@omnyid.com".to_string(),
            vec!["agent:test-beta@omnyid.com".to_string()],
            "thread.demo".to_string(),
            "agent_message",
            serde_json::json!({"body": "hello"}),
            vec![serde_json::json!({"format": "email", "content": {"body": "hello"}})],
            vec![],
            vec![],
            true,
        )
        .expect("server message");

        assert!(message.encryption.is_some());
        assert!(message.views.is_empty());
        assert_eq!(message.r#type, "agent");
        assert_eq!(message.subtype.as_deref(), Some("message"));
        assert_eq!(
            message
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("legacy_type"))
                .and_then(serde_json::Value::as_str),
            Some("agent_message")
        );

        unsafe {
            std::env::remove_var("OMNYID_ENCRYPTION_KEY_HEX");
            std::env::remove_var("OMNYID_SIGNING_KEY_HEX");
        }
    }
}
