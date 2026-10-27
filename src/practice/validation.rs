use super::*;
use chrono::{DateTime, NaiveDate};

pub(super) fn bounded(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value == value.trim()
        && value.len() <= max
        && !value.chars().any(char::is_control)
}

fn id(value: &str) -> bool {
    bounded(value, 180)
}
fn optional_id(value: &Option<String>) -> bool {
    value.as_deref().is_none_or(id)
}
fn time(value: &str) -> bool {
    DateTime::parse_from_rfc3339(value).is_ok()
}
fn ids(values: &[String]) -> bool {
    values.len() <= 100
        && values.iter().all(|v| id(v))
        && values
            .iter()
            .collect::<std::collections::BTreeSet<_>>()
            .len()
            == values.len()
}
fn plan_valid(plan: &PlanRef) -> bool {
    id(&plan.account_id) && id(&plan.plan_id) && id(&plan.thread_id)
}
fn money_valid(value: &crate::quotation::Money) -> bool {
    (0..=9_007_199_254_740_991).contains(&value.amount_minor)
        && crate::quotation::currency_exponent(&value.currency).is_some()
}
fn zone(value: &str) -> bool {
    bounded(value, 100)
        && (value == "UTC" || value.contains('/'))
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/_+-".contains(&b))
}
fn interval_valid(value: &Interval) -> bool {
    match (
        DateTime::parse_from_rfc3339(&value.starts_at),
        DateTime::parse_from_rfc3339(&value.ends_at),
    ) {
        (Ok(start), Ok(end)) => start < end && zone(&value.timezone),
        _ => false,
    }
}

pub fn validate_command(command: &CommandEnvelope) -> Result<(), PracticeError> {
    if command.schema_version != PRACTICE_COMMAND_VERSION {
        return Err(PracticeError::UnsupportedVersion);
    }
    if !id(&command.actor_account_id)
        || !id(&command.practice_id)
        || !id(&command.resource_id)
        || !id(&command.idempotency_key)
        || !command.plan.as_ref().is_none_or(plan_valid)
    {
        return Err(PracticeError::InvalidContract);
    }
    Ok(())
}

pub fn validate_summary(summary: &ClientSummary) -> Result<(), PracticeError> {
    let valid = plan_valid(&summary.plan)
        && bounded(&summary.client_label, 160)
        && summary
            .wedding_date
            .as_ref()
            .is_none_or(|v| v.len() == 10 && NaiveDate::parse_from_str(v, "%Y-%m-%d").is_ok())
        && optional_id(&summary.assigned_planner_id)
        && summary.next_action_due_at.as_deref().is_none_or(time)
        && (summary.next_action.is_some() || summary.next_action_due_at.is_none())
        && summary.financial_due.len() <= 20
        && summary
            .financial_due
            .iter()
            .all(|due| money_valid(&due.amount) && time(&due.due_at));
    if valid {
        Ok(())
    } else {
        Err(PracticeError::InvalidContract)
    }
}

fn grant_valid(grant: &Grant) -> bool {
    id(&grant.grant_id) && id(&grant.practice_id) && id(&grant.subject_account_id)
        && grant.plan.as_ref().is_none_or(plan_valid) && optional_id(&grant.resource_id)
        && time(&grant.valid_from)
        && grant.expires_at.as_ref().is_none_or(|end| match (
            DateTime::parse_from_rfc3339(&grant.valid_from), DateTime::parse_from_rfc3339(end)) {
                (Ok(start), Ok(end)) => start < end,
                _ => false,
            })
        // Revocation is its own immutable event, not a pre-revoked new grant.
        && grant.revoked_at.is_none()
        && !grant.capabilities.is_empty() && grant.capabilities.len() <= 144
        && grant.capabilities.iter().all(|cap| role_allows(grant.role, *cap))
}

/// Structural/domain validation only. It neither proves references nor authorises append.
pub fn validate_event(event: &PracticeEvent) -> Result<(), PracticeError> {
    if event.schema_version != PRACTICE_SCHEMA_VERSION {
        return Err(PracticeError::UnsupportedVersion);
    }
    if !id(&event.event_id)
        || !id(&event.practice_id)
        || !id(&event.actor_account_id)
        || !id(&event.idempotency_key)
        || !time(&event.occurred_at)
        || !ids(&event.source_event_ids)
        || !event.plan.as_ref().is_none_or(plan_valid)
    {
        return Err(PracticeError::InvalidContract);
    }
    use PracticeEventPayload::*;
    let practice_scoped = matches!(
        event.payload,
        PracticeCreated(_)
            | PracticeMemberGranted(_)
            | PracticeMemberRevoked(_)
            | AvailabilityPolicyRecorded(_)
            | AvailabilityExceptionRecorded(_)
    );
    if practice_scoped != event.plan.is_none() {
        return Err(PracticeError::InvalidContract);
    }
    let valid = match &event.payload {
        PracticeCreated(value) => {
            bounded(&value.display_name, 160)
                && id(&value.owner_account_id)
                && value.owner_account_id == event.actor_account_id
        }
        PracticeMemberGranted(grant) | PlanCollaborationGranted(grant) => {
            grant_valid(grant)
                && grant.practice_id == event.practice_id
                && grant.plan == event.plan
                && grant.resource_id.is_none()
                && matches!(
                    grant.role,
                    Role::PracticeOwner
                        | Role::LeadPlanner
                        | Role::Coordinator
                        | Role::FinanceOnly
                        | Role::ReadOnly
                )
        }
        PracticeMemberRevoked(value) | PlanCollaborationRevoked(value) => {
            id(&value.grant_id)
                && id(&value.subject_account_id)
                && id(&value.supersedes_event_id)
                && event.source_event_ids.contains(&value.supersedes_event_id)
        }
        PracticeClientIndexed(value) => {
            Some(&value.plan) == event.plan.as_ref() && validate_summary(value).is_ok()
        }
        WorkflowItemAssigned(value) => {
            id(&value.workflow_item_id)
                && id(&value.assignee_account_id)
                && optional_id(&value.supersedes_event_id)
        }
        AvailabilityPolicyRecorded(value) => {
            id(&value.policy_id)
                && id(&value.resource_id)
                && zone(&value.timezone)
                && value.windows.len() <= 28
                && value.windows.iter().all(|w| {
                    (1..=7).contains(&w.weekday)
                        && w.start_minute < w.end_minute
                        && w.end_minute <= 1440
                })
                && [
                    value.setup_minutes,
                    value.teardown_minutes,
                    value.travel_minutes,
                ]
                .into_iter()
                .all(|v| v <= 1440)
                && optional_id(&value.supersedes_event_id)
        }
        AvailabilityExceptionRecorded(value) => {
            id(&value.policy_id) && id(&value.resource_id) && interval_valid(&value.interval)
        }
        DateHoldTransition(value) => {
            id(&value.hold_id)
                && id(&value.resource_id)
                && interval_valid(&value.interval)
                && time(&value.expires_at)
                && optional_id(&value.booking_confirmation_event_id)
                && hold_transition_allowed(value.expected_state, value.target_state)
                && if value.target_state == HoldState::Converted {
                    value
                        .booking_confirmation_event_id
                        .as_ref()
                        .is_some_and(|id| event.source_event_ids.contains(id))
                } else {
                    value.booking_confirmation_event_id.is_none()
                }
        }
        QuotationRevisionLinked(value) => {
            id(&value.quotation_id)
                && id(&value.version_id)
                && id(&value.canonical_event_id)
                && optional_id(&value.supersedes_version_id)
                && value.supersedes_version_id.as_ref() != Some(&value.version_id)
                && event.source_event_ids.contains(&value.canonical_event_id)
        }
        BookingConfirmationLinked(value) => {
            id(&value.quotation_id)
                && id(&value.version_id)
                && id(&value.closure_transition_event_id)
                && !value.validated_evidence_event_ids.is_empty()
                && ids(&value.validated_evidence_event_ids)
                && event
                    .source_event_ids
                    .contains(&value.closure_transition_event_id)
                && value
                    .validated_evidence_event_ids
                    .iter()
                    .all(|id| event.source_event_ids.contains(id))
        }
        PaymentScheduleItemRecorded(value) => {
            id(&value.item_id)
                && id(&value.quotation_version_id)
                && money_valid(&value.amount)
                && time(&value.due_at)
                && optional_id(&value.supersedes_event_id)
        }
        PaymentEvidenceRecorded(value) => {
            id(&value.item_id)
                && id(&value.source_id)
                && id(&value.source_version_id)
                && money_valid(&value.amount)
                && optional_id(&value.supersedes_event_id)
        }
        PaymentStateChanged(value) => {
            id(&value.item_id)
                && ids(&value.evidence_event_ids)
                && optional_id(&value.supersedes_event_id)
                && value.expected_state != Some(value.target_state)
                && (value.expected_state.is_some() || value.target_state == PaymentState::Expected)
                && (!matches!(
                    value.target_state,
                    PaymentState::PartPaid
                        | PaymentState::Paid
                        | PaymentState::Refunded
                        | PaymentState::Waived
                ) || (!value.evidence_event_ids.is_empty()
                    && value
                        .evidence_event_ids
                        .iter()
                        .all(|id| event.source_event_ids.contains(id))))
        }
    };
    if valid {
        Ok(())
    } else {
        Err(PracticeError::InvalidContract)
    }
}

pub fn hold_transition_allowed(from: Option<HoldState>, to: HoldState) -> bool {
    use HoldState::*;
    matches!(
        (from, to),
        (None, Requested)
            | (Some(Requested), Offered | Released)
            | (Some(Offered), Held | Released | Expired)
            | (Some(Held), Expiring | Converted | Released | Expired)
            | (Some(Expiring), Converted | Released | Expired)
    )
}

/// The decoder checks both the discriminated schema and domain validation.
pub fn decode_event(json: &str) -> Result<PracticeEvent, PracticeError> {
    if json.len() > 128 * 1024 {
        return Err(PracticeError::InvalidContract);
    }
    let event: PracticeEvent =
        serde_json::from_str(json).map_err(|_| PracticeError::InvalidContract)?;
    validate_event(&event)?;
    Ok(event)
}
