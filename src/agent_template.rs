use serde::{Deserialize, Serialize};

use crate::integration::{ApprovalMode, IntegrationCapability, IntegrationTransport};

// ── LoRA takeover threshold ───────────────────────────────────────────────────
/// When `lora_confidence_score` reaches this value the agent no longer prepends
/// soul.md / memory.md to prompts — the LoRA genome drives responses directly.
pub const LORA_TAKEOVER_THRESHOLD: f64 = 0.85;

// ── LLM backend ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LlmBackend {
    /// Platform-managed API key. Usage tracked per account. Requires plan = pro.
    Hosted,
    /// User-supplied key, stored encrypted. Platform charges nothing.
    Byok,
    /// Local Ollama instance. No external calls.
    Ollama,
    /// Platform-hosted QWEN 3.5 via RunPod. Requires plan = pro.
    RunPod,
}

impl Default for LlmBackend {
    fn default() -> Self {
        Self::Hosted
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct LlmConfig {
    pub id: String,
    pub owner_user_id: String,
    pub backend: LlmBackend,
    pub provider: String,
    pub model: String,
    #[serde(skip_serializing)]
    pub encrypted_api_key: Option<String>,
    pub ollama_url: Option<String>,
    /// Hard cap in cents per calendar month (0 = feature disabled for free tier).
    pub monthly_budget_cents: i32,
    /// Accumulated cost this month in cents.
    pub usage_cents_current_month: i32,
}

impl LlmConfig {
    pub fn default_hosted(owner_user_id: String) -> Self {
        Self {
            id: ulid::Ulid::new().to_string(),
            owner_user_id,
            backend: LlmBackend::Hosted,
            provider: "anthropic".to_string(),
            model: "claude-haiku-4-5-20251001".to_string(),
            encrypted_api_key: None,
            ollama_url: None,
            monthly_budget_cents: 0, // disabled until plan upgrade
            usage_cents_current_month: 0,
        }
    }

    pub fn budget_remaining_cents(&self) -> i32 {
        (self.monthly_budget_cents - self.usage_cents_current_month).max(0)
    }

    pub fn is_budget_exhausted(&self) -> bool {
        self.monthly_budget_cents > 0 && self.usage_cents_current_month >= self.monthly_budget_cents
    }

    pub fn is_hosted_enabled(&self) -> bool {
        self.backend == LlmBackend::Hosted && self.monthly_budget_cents > 0
    }
}

// ── Task queue ───────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Planning,
    Executing,
    AwaitingApproval,
    Completed,
    Failed,
    Cancelled,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStatus::Pending => "pending",
            TaskStatus::Planning => "planning",
            TaskStatus::Executing => "executing",
            TaskStatus::AwaitingApproval => "awaiting_approval",
            TaskStatus::Completed => "completed",
            TaskStatus::Failed => "failed",
            TaskStatus::Cancelled => "cancelled",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "planning" => TaskStatus::Planning,
            "executing" => TaskStatus::Executing,
            "awaiting_approval" => TaskStatus::AwaitingApproval,
            "completed" => TaskStatus::Completed,
            "failed" => TaskStatus::Failed,
            "cancelled" => TaskStatus::Cancelled,
            _ => TaskStatus::Pending,
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Cancelled
        )
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskPriority {
    High,
    Normal,
    Low,
}

impl TaskPriority {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskPriority::High => "high",
            TaskPriority::Normal => "normal",
            TaskPriority::Low => "low",
        }
    }

    pub fn from_label(value: Option<&str>) -> Self {
        match value
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase())
            .as_deref()
        {
            Some("critical" | "urgent" | "high") => TaskPriority::High,
            Some("low") => TaskPriority::Low,
            _ => TaskPriority::Normal,
        }
    }

    pub fn rank_value(value: &str) -> u8 {
        match value.trim().to_ascii_lowercase().as_str() {
            "critical" | "urgent" => 0,
            "high" => 1,
            "medium" | "normal" => 2,
            "low" => 3,
            _ => 4,
        }
    }
}

impl Default for TaskPriority {
    fn default() -> Self {
        Self::Normal
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentTask {
    pub id: String,
    pub owner_user_id: String,
    pub agent_instance_id: String,
    pub thread_id: String,
    pub status: TaskStatus,
    pub intent: String,
    pub plan: serde_json::Value,
    pub result: serde_json::Value,
    pub error: Option<String>,
    pub priority: TaskPriority,
    pub created_at: String,
    pub updated_at: String,
}

impl AgentTask {
    pub fn new(
        owner_user_id: String,
        agent_instance_id: String,
        intent: String,
        priority: TaskPriority,
    ) -> Self {
        let id = ulid::Ulid::new().to_string();
        let thread_id = format!("agent-task:{id}");
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id,
            owner_user_id,
            agent_instance_id,
            thread_id,
            status: TaskStatus::Pending,
            intent,
            plan: serde_json::json!({"steps": []}),
            result: serde_json::Value::Object(Default::default()),
            error: None,
            priority,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

// ── Agent instance ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentInstance {
    pub id: String,
    pub owner_user_id: String,
    pub agent_id: String,
    pub name: String,
    pub status: String,
    pub system_prompt: String,
    pub priority_rules: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
    // ── Master agent / orchestration fields ──────────────────────────────────
    #[serde(default)]
    pub soul_md: String,
    #[serde(default)]
    pub memory_md: String,
    #[serde(default)]
    pub is_master: bool,
    #[serde(default = "default_max_sub_agents")]
    pub max_sub_agents: i32,
    /// If true this instance was created for an unauthenticated session and will
    /// be deleted after `expires_at`.
    #[serde(default)]
    pub ephemeral: bool,
    #[serde(default)]
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    // ── LoRA genome progress ──────────────────────────────────────────────────
    #[serde(default)]
    pub lora_confidence_score: f64,
    #[serde(default)]
    pub lora_genome_active: bool,
}

fn default_max_sub_agents() -> i32 {
    3
}

impl AgentInstance {
    pub fn provision(owner_user_id: &str, display_name: &str, domain: &str) -> Self {
        let id = ulid::Ulid::new().to_string();
        let slug = display_name
            .to_lowercase()
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-')
            .collect::<String>();
        let agent_id = format!("agent:{slug}-agent@{domain}");
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id,
            owner_user_id: owner_user_id.to_string(),
            agent_id,
            name: format!("{display_name}'s Agent"),
            status: "active".to_string(),
            system_prompt: default_system_prompt(display_name),
            priority_rules: default_priority_rules(),
            created_at: now.clone(),
            updated_at: now,
            soul_md: default_soul_md(display_name),
            memory_md: String::new(),
            is_master: true,
            max_sub_agents: 3,
            ephemeral: false,
            expires_at: None,
            lora_confidence_score: 0.0,
            lora_genome_active: false,
        }
    }

    /// Provision a short-lived agent for an unauthenticated dashboard session.
    /// The instance is stored with `ephemeral=true` and auto-deleted after 2 h.
    pub fn provision_ephemeral(session_fingerprint: &str, domain: &str) -> Self {
        let id = ulid::Ulid::new().to_string();
        let prefix = &session_fingerprint[..8.min(session_fingerprint.len())];
        let agent_id = format!("agent:anon-{prefix}@{domain}");
        let now = chrono::Utc::now();
        let expires_at = now + chrono::Duration::hours(2);
        Self {
            id,
            owner_user_id: format!("anon:{session_fingerprint}"),
            agent_id,
            name: "Guest Agent".to_string(),
            status: "active".to_string(),
            system_prompt: default_system_prompt("Guest"),
            priority_rules: default_priority_rules(),
            created_at: now.to_rfc3339(),
            updated_at: now.to_rfc3339(),
            soul_md: default_soul_md("Guest"),
            memory_md: String::new(),
            is_master: true,
            max_sub_agents: 1, // limited for anon
            ephemeral: true,
            expires_at: Some(expires_at),
            lora_confidence_score: 0.0,
            lora_genome_active: false,
        }
    }
}

/// Returns true when soul.md / memory.md should be prepended to LLM prompts.
/// Once the LoRA genome is active the files are archived and no longer used.
pub fn should_use_soul_md(instance: &AgentInstance) -> bool {
    !instance.lora_genome_active
}

// ── Aware system: focus items ─────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FocusItem {
    pub id: String,
    pub agent_instance_id: String,
    pub owner_user_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,   // pending|in_progress|completed|cancelled
    pub priority: String, // low|normal|high|critical
    pub due_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl FocusItem {
    pub fn new(agent_instance_id: String, owner_user_id: String, title: String) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: ulid::Ulid::new().to_string(),
            agent_instance_id,
            owner_user_id,
            title,
            description: None,
            status: "pending".to_string(),
            priority: "normal".to_string(),
            due_at: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

// ── Aware system: triggers (6 types) ─────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TriggerType {
    Scheduled,
    Interval,
    HttpPolling,
    Message,
    Webhook,
    OneTime,
}

impl TriggerType {
    pub fn as_str(&self) -> &'static str {
        match self {
            TriggerType::Scheduled => "scheduled",
            TriggerType::Interval => "interval",
            TriggerType::HttpPolling => "http_polling",
            TriggerType::Message => "message",
            TriggerType::Webhook => "webhook",
            TriggerType::OneTime => "one_time",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "interval" => TriggerType::Interval,
            "http_polling" => TriggerType::HttpPolling,
            "message" => TriggerType::Message,
            "webhook" => TriggerType::Webhook,
            "one_time" => TriggerType::OneTime,
            _ => TriggerType::Scheduled,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentTrigger {
    pub id: String,
    pub agent_instance_id: String,
    pub owner_user_id: String,
    pub trigger_type: TriggerType,
    pub config_json: serde_json::Value,
    pub enabled: bool,
    pub last_fired_at: Option<String>,
    pub next_fire_at: Option<String>,
    pub created_at: String,
}

impl AgentTrigger {
    pub fn new(
        agent_instance_id: String,
        owner_user_id: String,
        trigger_type: TriggerType,
        config_json: serde_json::Value,
    ) -> Self {
        Self {
            id: ulid::Ulid::new().to_string(),
            agent_instance_id,
            owner_user_id,
            trigger_type,
            config_json,
            enabled: true,
            last_fired_at: None,
            next_fire_at: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

// ── Sub-agent delegations ─────────────────────────────────────────────────────

/// Pre-loaded context snapshot handed to a sub-agent at delegation time.
///
/// Sub-agents should start reasoning from this snapshot and only make AFP
/// callbacks for information not covered here. The field is `Option` so legacy
/// delegations without a snapshot continue to work unchanged.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ContextSnapshot {
    /// Trimmed slice of AFP thread messages relevant to the current task.
    pub afp_thread_slice: Vec<serde_json::Value>,
    /// Map of `task_id → node_result` content for already-completed steps
    /// in the same orchestration run.
    pub prior_step_results: std::collections::HashMap<String, String>,
    /// Node `system_prompt` from the compiled IR manifest.
    pub system_prompt: Option<String>,
    /// Node `instruction_prompt` from the compiled IR manifest.
    pub instruction_prompt: Option<String>,
    /// Advisory token budget remaining for this sub-agent turn.
    pub token_budget_remaining: Option<u32>,
    /// Optional compact planning/simulator summary carried from the master
    /// orchestration context. Advisory only; never authoritative state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simulator_projection_summary: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentDelegation {
    pub id: String,
    pub master_instance_id: String,
    pub owner_user_id: String,
    pub scope: String,
    pub mask: String,
    pub delegated_key_hex: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub revoked_at: Option<chrono::DateTime<chrono::Utc>>,
    pub task_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// Resolved capability slice for this delegation (item 25).
    /// Intersection of the node's `allowed_capabilities` and the global
    /// PolicyEngine set. An empty vec means the global policy is the sole gate.
    #[serde(default)]
    pub allowed_capabilities: Vec<String>,
    /// Per-node outbound URL allowlist (item 26).
    /// Populated from the compiled IR node manifest at delegation time.
    /// An empty vec means no host restriction beyond approval_mode.
    #[serde(default)]
    pub outbound_allowlist: Vec<String>,
    /// Optional pre-loaded context for the receiving sub-agent (item 27).
    #[serde(default)]
    pub context_snapshot: Option<ContextSnapshot>,
}

/// Validate that the delegation master key is present, non-zero, and real
/// 32-byte hex. Delegation issuance must fail closed instead of silently
/// deriving predictable keys (GAP-010).
pub fn validate_delegation_master_key_hex(raw: &str) -> Result<String, String> {
    let key = raw.trim();
    if key.is_empty() {
        return Err(
            "OMNYID_DELEGATION_MASTER_KEY_HEX is not set. Configure a real 32-byte hex key."
                .to_string(),
        );
    }
    if key == "0".repeat(64) {
        return Err(
            "OMNYID_DELEGATION_MASTER_KEY_HEX is set to the all-zeros placeholder. \
             Configure a real 32-byte hex key."
                .to_string(),
        );
    }
    let decoded = hex::decode(key).map_err(|_| {
        "OMNYID_DELEGATION_MASTER_KEY_HEX must be valid hex encoding for 32 bytes.".to_string()
    })?;
    if decoded.len() != 32 {
        return Err(
            "OMNYID_DELEGATION_MASTER_KEY_HEX must decode to exactly 32 bytes.".to_string(),
        );
    }
    Ok(key.to_string())
}

/// Return the validated delegation master key hex string from the environment.
pub fn delegation_master_key_hex() -> Result<String, String> {
    match std::env::var("OMNYID_DELEGATION_MASTER_KEY_HEX") {
        Ok(key) => validate_delegation_master_key_hex(&key),
        Err(_) => Err(
            "OMNYID_DELEGATION_MASTER_KEY_HEX is not set. Configure a real 32-byte hex key."
                .to_string(),
        ),
    }
}

/// The derived key is safe to hand to a sub-agent: it can only be used for
/// the given `scope` and is time-limited by `expires_at`.
///
/// `allowed_capabilities` and `outbound_allowlist` are resolved by the caller
/// (orchestrator) from the compiled IR node manifest before this function is
/// called. Pass empty vecs for legacy / non-workflow orchestration.
pub fn generate_delegated_key(
    master_key_hex: &str,
    scope: &str,
    task_id: &str,
    expires_in_secs: u64,
    master_instance_id: &str,
    owner_user_id: &str,
    allowed_capabilities: Vec<String>,
    outbound_allowlist: Vec<String>,
    context_snapshot: Option<ContextSnapshot>,
) -> AgentDelegation {
    let ikm = hex::decode(master_key_hex).unwrap_or_else(|_| master_key_hex.as_bytes().to_vec());
    let now = chrono::Utc::now();
    let expires_at = now + chrono::Duration::seconds(expires_in_secs as i64);
    let info = format!("{scope}:{task_id}:{}", expires_at.timestamp());
    let key_bytes = crate::post_quantum::hkdf_sha256(&ikm, b"delegation", info.as_bytes(), 32);
    let delegated_key_hex = hex::encode(&key_bytes);
    AgentDelegation {
        id: ulid::Ulid::new().to_string(),
        master_instance_id: master_instance_id.to_string(),
        owner_user_id: owner_user_id.to_string(),
        scope: scope.to_string(),
        mask: "private".to_string(),
        delegated_key_hex,
        expires_at,
        revoked_at: None,
        task_id: Some(task_id.to_string()),
        created_at: now,
        allowed_capabilities,
        outbound_allowlist,
        context_snapshot,
    }
}

// ── Soul.md template ──────────────────────────────────────────────────────────

pub fn default_soul_md(display_name: &str) -> String {
    format!(
        "# Agent Soul — {display_name}\n\
        \n\
        ## Personality\n\
        Professional & Focused. Adapts tone to context, defaults to calm and precise.\n\
        \n\
        ## Tone\n\
        Concise & Direct. Avoids filler words. Structures answers clearly.\n\
        \n\
        ## Goals\n\
        - Productivity & Organisation: surface what matters, suppress noise.\n\
        - Research: synthesise multiple sources into one structured result.\n\
        - Communication: draft on behalf of user with voice matching their style.\n\
        \n\
        ## Rules\n\
        - Privacy-first: never expose real identity to third-party services.\n\
        - Approval gates: always request human approval for financial, legal, and health actions.\n\
        - Data minimisation: pass only the fields a sub-agent strictly needs.\n\
        \n\
        ## LoRA Status\n\
        LoRA fine-tuning will progressively internalise this profile based on real interactions.\n\
        Once confidence reaches 85 %, this file will be archived and no longer used.\n"
    )
}

// ── Default template capabilities ────────────────────────────────────────────

pub fn default_template_capabilities() -> Vec<IntegrationCapability> {
    vec![
        IntegrationCapability {
            capability_id: "template_email_read".to_string(),
            provider: "email".to_string(),
            operation: "triage_inbox".to_string(),
            transport: IntegrationTransport::Rest,
            scopes: vec!["email:read".to_string()],
            approval_mode: ApprovalMode::SuggestOnly,
            secret_refs: vec![],
            metadata: serde_json::json!({"description": "Read and categorize incoming messages"}),
        },
        IntegrationCapability {
            capability_id: "template_email_send".to_string(),
            provider: "email".to_string(),
            operation: "send_on_behalf".to_string(),
            transport: IntegrationTransport::Rest,
            scopes: vec!["email:send".to_string()],
            approval_mode: ApprovalMode::HumanApprovalRequired,
            secret_refs: vec![],
            metadata: serde_json::json!({"description": "Send email on behalf of user"}),
        },
        IntegrationCapability {
            capability_id: "template_web_research".to_string(),
            provider: "web".to_string(),
            operation: "search_and_synthesize".to_string(),
            transport: IntegrationTransport::Rest,
            scopes: vec![],
            approval_mode: ApprovalMode::Autonomous,
            secret_refs: vec![],
            metadata: serde_json::json!({"description": "Search the web and return structured results"}),
        },
        IntegrationCapability {
            capability_id: "template_calendar_read".to_string(),
            provider: "calendar".to_string(),
            operation: "read_context".to_string(),
            transport: IntegrationTransport::Rest,
            scopes: vec!["calendar:read".to_string()],
            approval_mode: ApprovalMode::SuggestOnly,
            secret_refs: vec![],
            metadata: serde_json::json!({"description": "Read calendar to detect conflicts and context"}),
        },
    ]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

pub fn default_priority_rules() -> serde_json::Value {
    serde_json::json!({
        "rules": [
            {"type": "financial_threshold",  "amount_usd": 50,   "action": "require_approval"},
            {"type": "legal_health_always",                       "action": "require_approval"},
            {"type": "calendar_priority",    "order": ["work", "family", "social"]},
            {"type": "communication_filter", "keywords": ["invoice", "urgent", "contract"], "action": "notify_immediately"}
        ]
    })
}

pub fn default_system_prompt(display_name: &str) -> String {
    format!(
        "You are a personal agent for {display_name}.\n\
        \n\
        You operate under the AFP v1 protocol. Every action you take must produce an AFP message.\n\
        \n\
        Principles:\n\
        - PROACTIVE: Anticipate needs from context, not only explicit commands.\n\
        - TRANSPARENT: Log every reasoning step as an AFP message so the user can audit it.\n\
        - PRIVACY-FIRST: Use ephemeral identifiers on third-party calls. Never expose real identity unless explicitly permitted.\n\
        - GATED: For financial actions above the user's threshold, legal decisions, and health decisions — always emit an agent_approval_request message before proceeding.\n\
        - SYNTHESIZING: Gather from multiple sources and return one structured result, not raw data.\n\
        - PRIORITY-AWARE: Always consult the user's priority_rules before resolving conflicts.\n\
        \n\
        Every response is an AFP message in the correct task thread.\n\
        For multi-step tasks: emit one AFP message with type agent + subtype plan, then one subtype step per step, then one subtype result.\n\
        Never store plaintext sensitive data in message content."
    )
}

// ── AFP message types emitted by the agent ────────────────────────────────────

pub const MSG_AGENT_PROVISIONED: &str = "agent_provisioned";
pub const MSG_AGENT_PLAN: &str = "agent_plan";
pub const MSG_AGENT_STEP: &str = "agent_step";
pub const MSG_AGENT_RESEARCH_RESULT: &str = "agent_research_result";
pub const MSG_AGENT_APPROVAL_REQUEST: &str = "agent_approval_request";
pub const MSG_AGENT_APPROVAL_GRANTED: &str = "agent_approval_granted";
pub const MSG_AGENT_APPROVAL_REJECTED: &str = "agent_approval_rejected";
pub const MSG_AGENT_RESULT: &str = "agent_result";
pub const MSG_AGENT_CONFLICT_DETECTED: &str = "agent_conflict_detected";
pub const MSG_AGENT_TRIAGE: &str = "agent_triage";

pub const AGENT_TYPE: &str = "agent";
pub const AGENT_SUBTYPE_PROVISIONED: &str = "provisioned";
pub const AGENT_SUBTYPE_PLAN: &str = "plan";
pub const AGENT_SUBTYPE_STEP: &str = "step";
pub const AGENT_SUBTYPE_RESEARCH_RESULT: &str = "research_result";
pub const AGENT_SUBTYPE_APPROVAL_REQUEST: &str = "approval_request";
pub const AGENT_SUBTYPE_APPROVAL_GRANTED: &str = "approval_granted";
pub const AGENT_SUBTYPE_APPROVAL_REJECTED: &str = "approval_rejected";
pub const AGENT_SUBTYPE_RESULT: &str = "result";
pub const AGENT_SUBTYPE_CONFLICT_DETECTED: &str = "conflict_detected";
pub const AGENT_SUBTYPE_TRIAGE: &str = "triage";

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_test_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn agent_instance_provision_derives_agent_id_from_display_name() {
        let inst = AgentInstance::provision("user_01", "Alice Smith", "omnyid.com");
        assert!(inst.agent_id.starts_with("agent:alice"));
        assert!(inst.agent_id.ends_with("@omnyid.com"));
        assert_eq!(inst.owner_user_id, "user_01");
        assert_eq!(inst.status, "active");
    }

    #[test]
    fn agent_task_new_creates_thread_id_from_task_id() {
        let task = AgentTask::new(
            "user_01".to_string(),
            "inst_01".to_string(),
            "Research flight options to Tokyo".to_string(),
            TaskPriority::Normal,
        );
        assert!(task.thread_id.starts_with("agent-task:"));
        assert_eq!(task.status, TaskStatus::Pending);
    }

    #[test]
    fn task_status_terminal_detection_is_correct() {
        assert!(TaskStatus::Completed.is_terminal());
        assert!(TaskStatus::Failed.is_terminal());
        assert!(TaskStatus::Cancelled.is_terminal());
        assert!(!TaskStatus::Executing.is_terminal());
        assert!(!TaskStatus::AwaitingApproval.is_terminal());
    }

    #[test]
    fn task_priority_from_label_normalizes_extended_priority_aliases() {
        assert_eq!(
            TaskPriority::from_label(Some("critical")),
            TaskPriority::High
        );
        assert_eq!(
            TaskPriority::from_label(Some(" urgent ")),
            TaskPriority::High
        );
        assert_eq!(
            TaskPriority::from_label(Some("medium")),
            TaskPriority::Normal
        );
        assert_eq!(TaskPriority::from_label(Some("low")), TaskPriority::Low);
        assert_eq!(
            TaskPriority::from_label(Some("unknown")),
            TaskPriority::Normal
        );
        assert_eq!(TaskPriority::from_label(None), TaskPriority::Normal);
    }

    #[test]
    fn task_priority_rank_value_orders_stronger_priorities_first() {
        assert!(TaskPriority::rank_value("critical") < TaskPriority::rank_value("high"));
        assert!(TaskPriority::rank_value("high") < TaskPriority::rank_value("normal"));
        assert!(TaskPriority::rank_value("normal") < TaskPriority::rank_value("low"));
        assert!(TaskPriority::rank_value("low") < TaskPriority::rank_value("unknown"));
    }

    #[test]
    fn llm_config_budget_exhaustion_detection() {
        let mut cfg = LlmConfig::default_hosted("user_01".to_string());
        cfg.monthly_budget_cents = 900;
        cfg.usage_cents_current_month = 900;
        assert!(cfg.is_budget_exhausted());
        assert_eq!(cfg.budget_remaining_cents(), 0);

        cfg.usage_cents_current_month = 500;
        assert!(!cfg.is_budget_exhausted());
        assert_eq!(cfg.budget_remaining_cents(), 400);
    }

    #[test]
    fn default_template_capabilities_has_four_entries() {
        let caps = default_template_capabilities();
        assert_eq!(caps.len(), 4);
        let ids: Vec<&str> = caps.iter().map(|c| c.capability_id.as_str()).collect();
        assert!(ids.contains(&"template_email_send"));
        assert!(ids.contains(&"template_web_research"));
        // email send must always be HumanApprovalRequired
        let email_send = caps
            .iter()
            .find(|c| c.capability_id == "template_email_send")
            .unwrap();
        assert_eq!(
            email_send.approval_mode,
            ApprovalMode::HumanApprovalRequired
        );
        // web research can be autonomous
        let research = caps
            .iter()
            .find(|c| c.capability_id == "template_web_research")
            .unwrap();
        assert_eq!(research.approval_mode, ApprovalMode::Autonomous);
    }

    #[test]
    fn default_priority_rules_has_financial_threshold() {
        let rules = default_priority_rules();
        let arr = rules["rules"].as_array().unwrap();
        let financial = arr
            .iter()
            .find(|r| r["type"] == "financial_threshold")
            .unwrap();
        assert_eq!(financial["amount_usd"], 50);
        assert_eq!(financial["action"], "require_approval");
    }

    #[test]
    fn provision_sets_soul_md_and_is_master() {
        let inst = AgentInstance::provision("user_01", "Alice", "omnyid.com");
        assert!(inst.is_master);
        assert!(!inst.ephemeral);
        assert!(inst.soul_md.contains("## Personality"));
        assert!(inst.soul_md.contains("Alice"));
        assert_eq!(inst.memory_md, "");
        assert!(!inst.lora_genome_active);
    }

    #[test]
    fn provision_ephemeral_sets_expiry_and_limits() {
        let inst = AgentInstance::provision_ephemeral("deadbeef1234", "omnyid.com");
        assert!(inst.ephemeral);
        assert!(inst.expires_at.is_some());
        assert_eq!(inst.max_sub_agents, 1);
        assert!(inst.agent_id.starts_with("agent:anon-"));
    }

    #[test]
    fn should_use_soul_md_reflects_lora_state() {
        let mut inst = AgentInstance::provision("u", "Bob", "x.com");
        assert!(should_use_soul_md(&inst));
        inst.lora_genome_active = true;
        assert!(!should_use_soul_md(&inst));
    }

    #[test]
    fn generate_delegated_key_produces_hex_key() {
        let master_hex = "a".repeat(64); // 32 bytes as hex
        let d = generate_delegated_key(
            &master_hex,
            "email_triage",
            "task_001",
            3600,
            "inst_01",
            "user_01",
            vec![],
            vec![],
            None,
        );
        assert_eq!(d.delegated_key_hex.len(), 64); // 32 bytes hex
        assert_eq!(d.scope, "email_triage");
        assert!(d.revoked_at.is_none());
        assert!(d.allowed_capabilities.is_empty());
        assert!(d.context_snapshot.is_none());
        // Different task → different key
        let d2 = generate_delegated_key(
            &master_hex,
            "email_triage",
            "task_002",
            3600,
            "inst_01",
            "user_01",
            vec!["summarise".to_string()],
            vec!["api.example.com".to_string()],
            None,
        );
        assert_ne!(d.delegated_key_hex, d2.delegated_key_hex);
    }

    #[test]
    fn validate_delegation_master_key_hex_rejects_missing_zero_and_bad_hex() {
        assert!(validate_delegation_master_key_hex("").is_err());
        assert!(validate_delegation_master_key_hex(&"0".repeat(64)).is_err());
        assert!(validate_delegation_master_key_hex("xyz").is_err());
        assert!(validate_delegation_master_key_hex(&"ab".repeat(31)).is_err());
    }

    #[test]
    fn delegation_master_key_hex_requires_real_env_key() {
        let _guard = env_test_lock().lock().expect("env test lock");
        unsafe {
            std::env::remove_var("OMNYID_DELEGATION_MASTER_KEY_HEX");
        }
        assert!(delegation_master_key_hex().is_err());

        unsafe {
            std::env::set_var("OMNYID_DELEGATION_MASTER_KEY_HEX", "0".repeat(64));
        }
        assert!(delegation_master_key_hex().is_err());

        let valid = "ab".repeat(32);
        unsafe {
            std::env::set_var("OMNYID_DELEGATION_MASTER_KEY_HEX", &valid);
        }
        assert_eq!(delegation_master_key_hex().expect("valid key"), valid);

        unsafe {
            std::env::remove_var("OMNYID_DELEGATION_MASTER_KEY_HEX");
        }
    }

    #[test]
    fn focus_item_new_defaults_to_pending() {
        let item = FocusItem::new("inst_01".into(), "user_01".into(), "Write report".into());
        assert_eq!(item.status, "pending");
        assert_eq!(item.priority, "normal");
    }

    #[test]
    fn trigger_type_roundtrip() {
        for (s, expected) in [
            ("scheduled", TriggerType::Scheduled),
            ("interval", TriggerType::Interval),
            ("http_polling", TriggerType::HttpPolling),
            ("message", TriggerType::Message),
            ("webhook", TriggerType::Webhook),
            ("one_time", TriggerType::OneTime),
        ] {
            assert_eq!(TriggerType::from_str(s), expected);
            assert_eq!(TriggerType::from_str(expected.as_str()), expected);
        }
    }
}
