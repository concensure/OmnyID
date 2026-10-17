use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{MaterialChange, Money, SourceReference};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClosureState {
    Selected,
    ContractReceived,
    ContractReviewed,
    DepositRequested,
    DepositRecordedPaid,
    BookingConfirmed,
    Cancelled,
    Refunded,
    Superseded,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DepositRecord {
    pub amount: Money,
    pub due_at: Option<String>,
    pub paid_at: Option<String>,
    pub refundable: Option<bool>,
    pub is_fee: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClosureTransition {
    pub event_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub expected_state: Option<ClosureState>,
    pub target_state: ClosureState,
    pub actor_id: String,
    pub user_authority: bool,
    pub occurred_at: String,
    #[serde(default)]
    pub evidence_sources: Vec<SourceReference>,
    #[serde(default)]
    pub contract_changes: Vec<MaterialChange>,
    #[serde(default)]
    pub contract_changes_reviewed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deposit: Option<DepositRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deadline_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClosureSnapshot {
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub state: ClosureState,
    pub last_event_id: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deposit: Option<DepositRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deadline_at: Option<String>,
    #[serde(default)]
    pub evidence_sources: Vec<SourceReference>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ClosureError {
    InvalidEvent,
    StaleState,
    InvalidTransition,
    EvidenceRequired,
    ContractChangesRequireReview,
    InvalidDeposit,
}

fn bounded(value: &str, max: usize) -> bool {
    let value = value.trim();
    !value.is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

fn sources_valid(sources: &[SourceReference], quotation_version_id: &str) -> bool {
    !sources.is_empty()
        && sources.len() <= 20
        && sources.iter().all(|source| {
            bounded(&source.source_id, 180)
                && bounded(&source.source_version_id, 180)
                && bounded(&source.media_type, 180)
                && source.source_version_id != quotation_version_id
        })
}

fn transition_allowed(from: Option<ClosureState>, to: ClosureState) -> bool {
    match (from, to) {
        (None, ClosureState::Selected) => true,
        (Some(ClosureState::Selected), ClosureState::ContractReceived) => true,
        (Some(ClosureState::ContractReceived), ClosureState::ContractReviewed) => true,
        (Some(ClosureState::ContractReviewed), ClosureState::DepositRequested) => true,
        (Some(ClosureState::DepositRequested), ClosureState::DepositRecordedPaid) => true,
        (Some(ClosureState::ContractReviewed), ClosureState::BookingConfirmed)
        | (Some(ClosureState::DepositRecordedPaid), ClosureState::BookingConfirmed) => true,
        (Some(ClosureState::Cancelled), ClosureState::Refunded) => true,
        (Some(state), ClosureState::Cancelled | ClosureState::Superseded)
            if !matches!(
                state,
                ClosureState::Cancelled | ClosureState::Refunded | ClosureState::Superseded
            ) =>
        {
            true
        }
        _ => false,
    }
}

fn deposit_valid(deposit: &DepositRecord) -> bool {
    deposit.amount.amount_minor >= 0
        && deposit.amount.amount_minor <= 9_007_199_254_740_991
        && crate::quotation::currency_exponent(&deposit.amount.currency).is_some()
        && deposit
            .due_at
            .as_deref()
            .is_none_or(|date| chrono::DateTime::parse_from_rfc3339(date).is_ok())
        && deposit
            .paid_at
            .as_deref()
            .is_none_or(|date| chrono::DateTime::parse_from_rfc3339(date).is_ok())
}

pub fn apply_closure_transition(
    current: Option<&ClosureSnapshot>,
    transition: &ClosureTransition,
) -> Result<ClosureSnapshot, ClosureError> {
    if !bounded(&transition.event_id, 180)
        || !bounded(&transition.quotation_id, 180)
        || !bounded(&transition.quotation_version_id, 180)
        || !bounded(&transition.actor_id, 180)
        || chrono::DateTime::parse_from_rfc3339(&transition.occurred_at).is_err()
        || transition
            .deadline_at
            .as_deref()
            .is_some_and(|date| chrono::DateTime::parse_from_rfc3339(date).is_err())
    {
        return Err(ClosureError::InvalidEvent);
    }
    let current_state = current.map(|snapshot| snapshot.state);
    if transition.expected_state != current_state
        || current.is_some_and(|snapshot| {
            snapshot.quotation_id != transition.quotation_id
                || snapshot.quotation_version_id != transition.quotation_version_id
        })
    {
        return Err(ClosureError::StaleState);
    }
    if !transition_allowed(current_state, transition.target_state) {
        return Err(ClosureError::InvalidTransition);
    }
    if !transition.user_authority {
        return Err(ClosureError::EvidenceRequired);
    }
    let requires_source = !matches!(transition.target_state, ClosureState::Selected);
    if requires_source
        && !sources_valid(
            &transition.evidence_sources,
            &transition.quotation_version_id,
        )
    {
        return Err(ClosureError::EvidenceRequired);
    }
    if transition.target_state != ClosureState::ContractReceived
        && !transition.contract_changes.is_empty()
        && !transition.contract_changes_reviewed
    {
        return Err(ClosureError::ContractChangesRequireReview);
    }
    if matches!(
        transition.target_state,
        ClosureState::DepositRequested | ClosureState::DepositRecordedPaid
    ) {
        let Some(deposit) = transition.deposit.as_ref() else {
            return Err(ClosureError::InvalidDeposit);
        };
        if !deposit_valid(deposit)
            || (transition.target_state == ClosureState::DepositRecordedPaid
                && deposit.paid_at.is_none())
        {
            return Err(ClosureError::InvalidDeposit);
        }
    }
    let mut evidence_sources = current
        .map(|snapshot| snapshot.evidence_sources.clone())
        .unwrap_or_default();
    for source in &transition.evidence_sources {
        if !evidence_sources.iter().any(|existing| {
            existing.source_id == source.source_id
                && existing.source_version_id == source.source_version_id
        }) {
            evidence_sources.push(source.clone());
        }
    }
    evidence_sources.sort_by(|left, right| {
        left.source_id
            .cmp(&right.source_id)
            .then_with(|| left.source_version_id.cmp(&right.source_version_id))
    });
    Ok(ClosureSnapshot {
        quotation_id: transition.quotation_id.clone(),
        quotation_version_id: transition.quotation_version_id.clone(),
        state: transition.target_state,
        last_event_id: transition.event_id.clone(),
        updated_at: transition.occurred_at.clone(),
        deposit: transition
            .deposit
            .clone()
            .or_else(|| current.and_then(|snapshot| snapshot.deposit.clone())),
        deadline_at: transition.deadline_at.clone(),
        evidence_sources,
    })
}

pub fn replay_closure(
    transitions: &[ClosureTransition],
) -> Result<Option<ClosureSnapshot>, ClosureError> {
    let mut unique = BTreeMap::new();
    for transition in transitions {
        unique
            .entry(transition.event_id.clone())
            .or_insert_with(|| transition.clone());
    }
    let mut ordered = unique.into_values().collect::<Vec<_>>();
    ordered.sort_by(|left, right| {
        left.occurred_at
            .cmp(&right.occurred_at)
            .then_with(|| left.event_id.cmp(&right.event_id))
    });
    let mut snapshot = None;
    for transition in &ordered {
        snapshot = Some(apply_closure_transition(snapshot.as_ref(), transition)?);
    }
    Ok(snapshot)
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DepositBudgetEffect {
    pub cash_flow_minor: i64,
    pub additional_cost_minor: i64,
    pub currency: String,
}

pub fn deposit_budget_effect(deposit: &DepositRecord) -> DepositBudgetEffect {
    DepositBudgetEffect {
        cash_flow_minor: deposit.amount.amount_minor,
        additional_cost_minor: if deposit.is_fee {
            deposit.amount.amount_minor
        } else {
            0
        },
        currency: deposit.amount.currency.clone(),
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BudgetCommitment {
    pub commitment_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub amount: Money,
    pub source_refs: Vec<SourceReference>,
}

pub fn budget_commitment(
    snapshot: &ClosureSnapshot,
    confirmed_total: Money,
) -> Option<BudgetCommitment> {
    if snapshot.state != ClosureState::BookingConfirmed || snapshot.evidence_sources.is_empty() {
        return None;
    }
    let stable = serde_json::to_vec(&(
        &snapshot.quotation_id,
        &snapshot.quotation_version_id,
        &confirmed_total,
        &snapshot.evidence_sources,
    ))
    .unwrap_or_default();
    Some(BudgetCommitment {
        commitment_id: format!("qbudget_{}", hex::encode(Sha256::digest(stable))),
        quotation_id: snapshot.quotation_id.clone(),
        quotation_version_id: snapshot.quotation_version_id.clone(),
        amount: confirmed_total,
        source_refs: snapshot.evidence_sources.clone(),
    })
}

pub fn closure_event_fingerprint(transition: &ClosureTransition) -> String {
    let bytes = serde_json::to_vec(transition).unwrap_or_default();
    hex::encode(Sha256::digest(bytes))
}

pub fn unique_deadline_ids(snapshots: &[ClosureSnapshot]) -> BTreeSet<String> {
    snapshots
        .iter()
        .filter_map(|snapshot| {
            snapshot
                .deadline_at
                .as_ref()
                .map(|_| snapshot.last_event_id.clone())
        })
        .collect()
}
