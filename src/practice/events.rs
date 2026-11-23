use super::{AuthorityRevision, ClientSummary, Grant, PlanRef};
use serde::{Deserialize, Serialize};

/// Registry uses existing AFP snake_case kinds; version lives in schema_version.
pub const PRACTICE_EVENT_KINDS: &[&str] = &[
    "practice_created",
    "practice_member_granted",
    "practice_member_revoked",
    "plan_collaboration_granted",
    "plan_collaboration_revoked",
    "practice_client_indexed",
    "workflow_item_assigned",
    "availability_policy_recorded",
    "availability_exception_recorded",
    "date_hold_transition",
    "quotation_revision_linked",
    "booking_confirmation_linked",
    "payment_schedule_item_recorded",
    "payment_evidence_recorded",
    "payment_state_changed",
];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PracticeEvent {
    pub schema_version: String,
    pub event_id: String,
    pub practice_id: String,
    pub plan: Option<PlanRef>,
    pub actor_account_id: String,
    pub authority: AuthorityRevision,
    pub occurred_at: String,
    pub idempotency_key: String,
    pub source_event_ids: Vec<String>,
    pub payload: PracticeEventPayload,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "data",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum PracticeEventPayload {
    PracticeCreated(PracticeIdentity),
    PracticeMemberGranted(Grant),
    PracticeMemberRevoked(GrantRevocation),
    PlanCollaborationGranted(Grant),
    PlanCollaborationRevoked(GrantRevocation),
    PracticeClientIndexed(ClientSummary),
    WorkflowItemAssigned(Assignment),
    AvailabilityPolicyRecorded(AvailabilityPolicy),
    AvailabilityExceptionRecorded(AvailabilityException),
    DateHoldTransition(DateHoldTransition),
    // Reference canonical quotation/closure events, never copy their facts here.
    QuotationRevisionLinked(QuotationRevisionLink),
    BookingConfirmationLinked(BookingConfirmationLink),
    PaymentScheduleItemRecorded(PaymentScheduleItem),
    PaymentEvidenceRecorded(PaymentEvidence),
    PaymentStateChanged(PaymentStateChange),
}

impl PracticeEventPayload {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::PracticeCreated(_) => "practice_created",
            Self::PracticeMemberGranted(_) => "practice_member_granted",
            Self::PracticeMemberRevoked(_) => "practice_member_revoked",
            Self::PlanCollaborationGranted(_) => "plan_collaboration_granted",
            Self::PlanCollaborationRevoked(_) => "plan_collaboration_revoked",
            Self::PracticeClientIndexed(_) => "practice_client_indexed",
            Self::WorkflowItemAssigned(_) => "workflow_item_assigned",
            Self::AvailabilityPolicyRecorded(_) => "availability_policy_recorded",
            Self::AvailabilityExceptionRecorded(_) => "availability_exception_recorded",
            Self::DateHoldTransition(_) => "date_hold_transition",
            Self::QuotationRevisionLinked(_) => "quotation_revision_linked",
            Self::BookingConfirmationLinked(_) => "booking_confirmation_linked",
            Self::PaymentScheduleItemRecorded(_) => "payment_schedule_item_recorded",
            Self::PaymentEvidenceRecorded(_) => "payment_evidence_recorded",
            Self::PaymentStateChanged(_) => "payment_state_changed",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PracticeIdentity {
    pub display_name: String,
    pub owner_account_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GrantRevocation {
    pub grant_id: String,
    pub subject_account_id: String,
    pub supersedes_event_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Assignment {
    pub workflow_item_id: String,
    pub assignee_account_id: String,
    pub supersedes_event_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkingWindow {
    /// ISO weekday: 1 = Monday, 7 = Sunday. Split overnight windows at midnight.
    pub weekday: u8,
    pub start_minute: u16,
    pub end_minute: u16,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AvailabilityPolicy {
    pub policy_id: String,
    pub resource_id: String,
    /// IANA zone resolved by the future calendar adapter; never a guessed offset.
    pub timezone: String,
    pub windows: Vec<WorkingWindow>,
    pub setup_minutes: u16,
    pub teardown_minutes: u16,
    pub travel_minutes: u16,
    pub supersedes_event_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Interval {
    pub starts_at: String,
    pub ends_at: String,
    pub timezone: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AvailabilityException {
    pub policy_id: String,
    pub resource_id: String,
    pub interval: Interval,
    pub blocked: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HoldState {
    Requested,
    Offered,
    Held,
    Expiring,
    Converted,
    Released,
    Expired,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DateHoldTransition {
    pub hold_id: String,
    pub resource_id: String,
    pub interval: Interval,
    pub expires_at: String,
    pub expected_state: Option<HoldState>,
    pub target_state: HoldState,
    pub booking_confirmation_event_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuotationRevisionLink {
    pub quotation_id: String,
    pub version_id: String,
    pub canonical_event_id: String,
    pub supersedes_version_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BookingConfirmationLink {
    pub quotation_id: String,
    pub version_id: String,
    pub closure_transition_event_id: String,
    pub validated_evidence_event_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PaymentScheduleItem {
    pub item_id: String,
    pub quotation_version_id: String,
    pub amount: crate::quotation::Money,
    pub due_at: String,
    pub supersedes_event_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PaymentEvidence {
    pub item_id: String,
    pub source_id: String,
    pub source_version_id: String,
    pub amount: crate::quotation::Money,
    pub supersedes_event_id: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaymentState {
    Expected,
    Invoiced,
    Due,
    EvidencePending,
    PartPaid,
    Paid,
    Overdue,
    Waived,
    Refunded,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PaymentStateChange {
    pub item_id: String,
    pub expected_state: Option<PaymentState>,
    pub target_state: PaymentState,
    pub evidence_event_ids: Vec<String>,
    pub supersedes_event_id: Option<String>,
}
