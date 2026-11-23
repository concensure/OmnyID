//! Private AFP runbook contracts. Definitions describe work; they never grant authority.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const MAX_DEFINITION_BYTES: usize = 32 * 1024;
pub const MAX_STEPS: usize = 24;
pub const MAX_REFS: usize = 32;
pub type Result<T> = std::result::Result<T, &'static str>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepKind {
    Read,
    Transform,
    Tool,
    Classify,
    Reason,
    Draft,
    Emit,
    Wait,
    Approval,
    Complete,
}

/// Reviewed deterministic operations. The executor must implement these explicitly;
/// a definition cannot name arbitrary code, a URL or a shell command.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransformOperation {
    CheckThreadReply,
    CompareCalendarConflicts,
    ReviewStoredQuote,
    FindQuoteGaps,
    CalculateBudgetExposure,
    ReviewTaskDependencies,
    CheckReminderPermission,
    CompareRunsheetVersions,
    VerifyCommitmentEvidence,
    AssessWorkflowRetry,
    ReviewImportStatus,
    IdentifyMissingFacts,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FilterOp {
    Eq,
    In,
    Exists,
    Gte,
    Lte,
    ContainsTag,
    RefKind,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Filter {
    pub path: String,
    pub op: FilterOp,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Trigger {
    pub event_types: Vec<String>,
    pub filters: Vec<Filter>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaxAutonomy {
    ObserveOnly,
    DraftOnly,
    ApprovalRequired,
    Reversible,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DefinitionStatus {
    Active,
    Archived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EscalationReason {
    MissingRequiredFact,
    MissingWeddingContext,
    LowExtractionConfidence,
    PolicyDenied,
    BudgetExceeded,
    ConflictingEvidence,
    ToolFailed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Step {
    pub step_id: String,
    pub kind: StepKind,
    #[serde(default)]
    pub operation: Option<TransformOperation>,
    #[serde(default)]
    pub required_fields: Vec<String>,
    #[serde(default)]
    pub input_refs: Vec<String>,
    #[serde(default)]
    pub tool: Option<String>,
    #[serde(default)]
    pub output_kind: Option<String>,
    #[serde(default)]
    pub output_schema: Option<String>,
    #[serde(default)]
    pub follow_up_event: Option<String>,
    #[serde(default)]
    pub max_retries: u8,
    #[serde(default)]
    pub token_limit: u32,
    #[serde(default)]
    pub cost_limit_microunits: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunbookDefinition {
    pub runbook_id: String,
    pub version: u32,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub priority: u8,
    pub dedupe_group: Option<String>,
    pub trigger: Trigger,
    pub steps: Vec<Step>,
    pub tools_allowlist: Vec<String>,
    pub success_criteria: Vec<Filter>,
    pub escalate_when: Vec<EscalationReason>,
    pub follow_up_events: Vec<String>,
    pub max_autonomy: MaxAutonomy,
    pub status: DefinitionStatus,
    pub supersedes_id: Option<String>,
    pub evidence_limit: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstanceState {
    Matched,
    Running,
    WaitingForInput,
    WaitingForBudget,
    AwaitingApproval,
    WaitingForEvent,
    Completed,
    Failed,
    Cancelled,
}

impl InstanceState {
    pub fn can_transition_to(self, next: Self) -> bool {
        use InstanceState::*;
        matches!(
            (self, next),
            (Matched, Running | Cancelled | Failed)
                | (
                    Running,
                    WaitingForInput
                        | WaitingForBudget
                        | AwaitingApproval
                        | WaitingForEvent
                        | Completed
                        | Failed
                        | Cancelled
                )
                | (
                    WaitingForInput | WaitingForBudget | AwaitingApproval | WaitingForEvent,
                    Running | Failed | Cancelled
                )
        )
    }
    pub fn terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunbookInstance {
    pub instance_id: String,
    pub runbook_id: String,
    pub runbook_version: u32,
    pub trigger_event_id: String,
    pub thread_id: String,
    pub instance_key: String,
    pub status: InstanceState,
    pub current_step_id: Option<String>,
    pub completed_step_ids: Vec<String>,
    pub next_follow_up_at: Option<DateTime<Utc>>,
    /// Expiry is distinct from the due time at which a follow-up may be delivered.
    #[serde(default)]
    pub wait_expires_at: Option<DateTime<Utc>>,
    pub definition_ref: String,
    pub evidence_packet_ref: Option<String>,
    pub latest_trace_ref: Option<String>,
    pub retry_of_instance_id: Option<String>,
    pub revision: u32,
}

impl RunbookInstance {
    /// This validates a revision; storage must still compare-and-append atomically.
    pub fn transition(&self, expected_revision: u32, next: InstanceState) -> Result<Self> {
        if self.revision != expected_revision {
            return Err("stale_revision");
        }
        if !self.status.can_transition_to(next) {
            return Err("invalid_transition");
        }
        let mut successor = self.clone();
        successor.status = next;
        successor.revision = self.revision.checked_add(1).ok_or("revision_overflow")?;
        Ok(successor)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TraceStatus {
    Completed,
    Waiting,
    Denied,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StepTrace {
    pub trace_id: String,
    pub instance_id: String,
    pub step_id: String,
    pub step_kind: StepKind,
    pub status: TraceStatus,
    pub input_refs: Vec<String>,
    pub output_refs: Vec<String>,
    pub input_hash: String,
    pub output_hash: Option<String>,
    pub tool_id: Option<String>,
    pub model: Option<String>,
    pub prompt_version: Option<String>,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cost_microunits: u64,
    pub approval_ref: Option<String>,
    pub provenance_ref: Option<String>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EscalationStatus {
    Open,
    Answered,
    Expired,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnswerSchema {
    Date,
    Boolean,
    ShortText,
    NonNegativeNumber,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EpistemicEscalation {
    pub escalation_id: String,
    pub instance_id: String,
    pub step_id: String,
    pub status: EscalationStatus,
    pub reason: EscalationReason,
    pub missing_fields: Vec<String>,
    pub attempted_refs: Vec<String>,
    pub question: String,
    pub why_needed: String,
    pub answer_schema: AnswerSchema,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProactiveEvent {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub urgency: Option<String>,
    pub event_id: String,
    pub event_type: String,
    pub source_refs: Vec<String>,
    pub entity_refs: Vec<String>,
    pub metadata: serde_json::Map<String, Value>,
    pub confidence: f64,
    pub occurred_at: DateTime<Utc>,
    pub caused_by_event_id: Option<String>,
}
