use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const PRACTICE_SCHEMA_VERSION: &str = "practice.event.v1";
pub const PRACTICE_COMMAND_VERSION: &str = "practice.command.v1";

/// Resolves to the existing tenant-owned AFP thread, not a new client data store.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlanRef {
    pub account_id: String,
    pub plan_id: String,
    pub thread_id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    PracticeOwner,
    LeadPlanner,
    Coordinator,
    FinanceOnly,
    ReadOnly,
    CoupleOwner,
    CoupleCoOwner,
    VendorRepresentative,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Resource {
    PracticeSettings,
    Membership,
    ClientIndex,
    Plan,
    Tasks,
    Calendar,
    Conversation,
    Documents,
    Guests,
    SensitiveNotes,
    FinancialSummary,
    FinancialEvidence,
    Quotation,
    Hold,
    Booking,
    PaymentTracking,
    Collaboration,
    SupplierProfile,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Read,
    Propose,
    Edit,
    Assign,
    Send,
    Accept,
    Confirm,
    Manage,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Capability {
    pub resource: Resource,
    pub action: Action,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Grant {
    pub grant_id: String,
    pub practice_id: String,
    pub plan: Option<PlanRef>,
    pub resource_id: Option<String>,
    pub subject_account_id: String,
    pub role: Role,
    pub capabilities: BTreeSet<Capability>,
    pub valid_from: String,
    pub expires_at: Option<String>,
    pub revoked_at: Option<String>,
}

/// Every membership or collaboration change increments its revision, including reduction.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AuthorityRevision {
    pub membership: u64,
    pub collaboration: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandEnvelope {
    pub schema_version: String,
    pub actor_account_id: String,
    pub practice_id: String,
    pub plan: Option<PlanRef>,
    pub resource_id: String,
    pub capability: Capability,
    pub expected_authority: AuthorityRevision,
    pub expected_projection_version: u64,
    pub idempotency_key: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientStage {
    Onboarding,
    Planning,
    Confirming,
    EventReady,
    Completed,
    Archived,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NextAction {
    ReviewPermission,
    ReviewApproval,
    ReviewResponse,
    ReviewQuote,
    ReviewHold,
    PrepareFollowUp,
    ReviewTask,
    ReviewPaymentEvidence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FinancialDue {
    pub amount: crate::quotation::Money,
    pub due_at: String,
}

/// No opaque JSON or arbitrary next-action prose. Counts are optional, never fake zeroes.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClientSummary {
    pub plan: PlanRef,
    pub client_label: String,
    pub wedding_date: Option<String>,
    pub stage: ClientStage,
    pub assigned_planner_id: Option<String>,
    pub next_action: Option<NextAction>,
    pub next_action_due_at: Option<String>,
    pub unread_count: Option<u32>,
    pub action_needed_count: Option<u32>,
    pub financial_due: Vec<FinancialDue>,
    pub source_projection_version: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PracticeError {
    UnsupportedVersion,
    InvalidContract,
    Forbidden,
    StaleAuthority,
    StaleProjection,
    IdempotencyConflict,
}
