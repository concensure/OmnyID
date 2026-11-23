use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    ClosureState, DepositRecord, Evidence, EvidenceState, MaterialChange, NormalisedQuotation,
    SourceReference, detect_material_changes, validate_normalised_quotation,
};

pub const CLOSURE_EVIDENCE_SCHEMA_VERSION: &str = "quotation.closure_evidence.v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClosureEvidenceKind {
    Contract,
    DepositRequest,
    DepositPayment,
    BookingConfirmation,
    Cancellation,
    Refund,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PreparedEvidenceSource {
    pub source: SourceReference,
    pub content_hash: String,
    pub parser: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClosureEvidencePayload {
    Contract {
        contract_quotation: Box<NormalisedQuotation>,
    },
    DepositRequest {
        exact_excerpt: String,
        deposit: DepositRecord,
    },
    DepositPayment {
        exact_excerpt: String,
        deposit: DepositRecord,
    },
    BookingConfirmation {
        exact_excerpt: String,
    },
    Cancellation {
        exact_excerpt: String,
    },
    Refund {
        exact_excerpt: String,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClosureEvidenceProposal {
    pub schema_version: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub source_id: String,
    pub source_version_id: String,
    pub payload: ClosureEvidencePayload,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deadline_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidatedClosureEvidence {
    pub evidence_id: String,
    pub kind: ClosureEvidenceKind,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub source: SourceReference,
    pub suggested_target: ClosureState,
    pub contract_changes: Vec<MaterialChange>,
    pub requires_explicit_review: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deposit: Option<DepositRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deadline_at: Option<String>,
    pub payment_execution: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ClosureEvidenceOutcome {
    Ready { evidence: ValidatedClosureEvidence },
    ManualReviewRequired { reason: String },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ClosureEvidenceError {
    InvalidBinding,
    InvalidProposal,
}

fn bounded(value: &str, max: usize) -> bool {
    let value = value.trim();
    !value.is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

fn evidence_anchors<'a>(quotation: &'a NormalisedQuotation) -> Vec<&'a Evidence> {
    quotation
        .line_items
        .iter()
        .map(|line| &line.evidence)
        .chain(quotation.commercial_terms.iter().map(|term| &term.evidence))
        .chain(quotation.unmapped_items.iter().map(|item| &item.evidence))
        .chain(std::iter::once(&quotation.tax.evidence))
        .collect()
}

fn quotation_anchors_match_source(
    quotation: &NormalisedQuotation,
    prepared: &PreparedEvidenceSource,
    parsed_text: &str,
) -> bool {
    quotation.sources.len() == 1
        && quotation.sources[0] == prepared.source
        && evidence_anchors(quotation).into_iter().all(|evidence| {
            if !matches!(
                evidence.state,
                EvidenceState::Confirmed | EvidenceState::Inferred
            ) {
                return true;
            }
            !evidence.anchors.is_empty()
                && evidence.anchors.iter().all(|anchor| {
                    anchor.source_id == prepared.source.source_id
                        && anchor.source_version_id == prepared.source.source_version_id
                        && !anchor.exact_excerpt.trim().is_empty()
                        && parsed_text.contains(&anchor.exact_excerpt)
                })
        })
}

fn exact_excerpt<'a>(payload: &'a ClosureEvidencePayload) -> Option<&'a str> {
    match payload {
        ClosureEvidencePayload::Contract { .. } => None,
        ClosureEvidencePayload::DepositRequest { exact_excerpt, .. }
        | ClosureEvidencePayload::DepositPayment { exact_excerpt, .. }
        | ClosureEvidencePayload::BookingConfirmation { exact_excerpt }
        | ClosureEvidencePayload::Cancellation { exact_excerpt }
        | ClosureEvidencePayload::Refund { exact_excerpt } => Some(exact_excerpt),
    }
}

fn kind_and_target(payload: &ClosureEvidencePayload) -> (ClosureEvidenceKind, ClosureState) {
    match payload {
        ClosureEvidencePayload::Contract { .. } => (
            ClosureEvidenceKind::Contract,
            ClosureState::ContractReceived,
        ),
        ClosureEvidencePayload::DepositRequest { .. } => (
            ClosureEvidenceKind::DepositRequest,
            ClosureState::DepositRequested,
        ),
        ClosureEvidencePayload::DepositPayment { .. } => (
            ClosureEvidenceKind::DepositPayment,
            ClosureState::DepositRecordedPaid,
        ),
        ClosureEvidencePayload::BookingConfirmation { .. } => (
            ClosureEvidenceKind::BookingConfirmation,
            ClosureState::BookingConfirmed,
        ),
        ClosureEvidencePayload::Cancellation { .. } => {
            (ClosureEvidenceKind::Cancellation, ClosureState::Cancelled)
        }
        ClosureEvidencePayload::Refund { .. } => {
            (ClosureEvidenceKind::Refund, ClosureState::Refunded)
        }
    }
}

fn phrase_supported(kind: ClosureEvidenceKind, excerpt: &str) -> bool {
    let normalized = excerpt.to_ascii_lowercase();
    match kind {
        ClosureEvidenceKind::Contract => true,
        ClosureEvidenceKind::DepositRequest => {
            normalized.contains("deposit")
                && ["due", "request", "payable"]
                    .iter()
                    .any(|word| normalized.contains(word))
        }
        ClosureEvidenceKind::DepositPayment => {
            normalized.contains("deposit")
                && ["paid", "received"]
                    .iter()
                    .any(|word| normalized.contains(word))
        }
        ClosureEvidenceKind::BookingConfirmation => [
            "booking confirmed",
            "confirmed booking",
            "reservation confirmed",
        ]
        .iter()
        .any(|phrase| normalized.contains(phrase)),
        ClosureEvidenceKind::Cancellation => ["cancelled", "canceled", "cancellation confirmed"]
            .iter()
            .any(|phrase| normalized.contains(phrase)),
        ClosureEvidenceKind::Refund => ["refund", "refunded"]
            .iter()
            .any(|phrase| normalized.contains(phrase)),
    }
}

fn explicit_fee(excerpt: &str) -> bool {
    let normalized = excerpt.to_ascii_lowercase();
    normalized.contains("fee")
        && !["no fee", "not a fee", "without a fee"]
            .iter()
            .any(|phrase| normalized.contains(phrase))
}

fn amount_supported(excerpt: &str, deposit: &DepositRecord) -> bool {
    let Some(exponent) = super::currency_exponent(&deposit.amount.currency) else {
        return false;
    };
    let divisor = 10_i64.pow(exponent.into());
    let whole = deposit.amount.amount_minor / divisor;
    let fraction = deposit.amount.amount_minor.rem_euclid(divisor);
    let plain = if exponent == 0 {
        whole.to_string()
    } else {
        format!("{whole}.{fraction:0width$}", width = exponent as usize)
    };
    let digits = whole.to_string();
    let first = digits.len() % 3;
    let mut groups = Vec::new();
    if first > 0 {
        groups.push(&digits[..first]);
    }
    let mut offset = first;
    while offset < digits.len() {
        groups.push(&digits[offset..offset + 3]);
        offset += 3;
    }
    let grouped_whole = groups.join(",");
    let grouped = if whole >= 1_000 {
        if exponent == 0 {
            grouped_whole.clone()
        } else {
            format!(
                "{grouped_whole}.{fraction:0width$}",
                width = exponent as usize
            )
        }
    } else {
        plain.clone()
    };
    let normalized = excerpt.to_ascii_uppercase();
    normalized.contains(&deposit.amount.currency.to_ascii_uppercase())
        && (normalized.contains(&plain)
            || normalized.contains(&grouped)
            || fraction == 0 && normalized.contains(&grouped_whole))
}

fn date_supported(excerpt: &str, value: &str) -> bool {
    let Ok(date) = chrono::DateTime::parse_from_rfc3339(value) else {
        return false;
    };
    let normalized = excerpt.to_ascii_lowercase();
    let iso_date = date.format("%Y-%m-%d").to_string();
    let day = date.format("%-d").to_string();
    let month = date.format("%B").to_string().to_ascii_lowercase();
    normalized.contains(&iso_date)
        || normalized.contains(&format!("{day} {month}"))
        || normalized.contains(&format!("{month} {day}"))
}

fn validated_deposit(payload: &ClosureEvidencePayload) -> Option<DepositRecord> {
    match payload {
        ClosureEvidencePayload::DepositRequest {
            exact_excerpt,
            deposit,
        }
        | ClosureEvidencePayload::DepositPayment {
            exact_excerpt,
            deposit,
        } => {
            let mut derived = deposit.clone();
            derived.is_fee = explicit_fee(exact_excerpt);
            let normalized = exact_excerpt.to_ascii_lowercase();
            derived.refundable =
                if normalized.contains("non-refundable") || normalized.contains("nonrefundable") {
                    Some(false)
                } else if normalized.contains("refundable") {
                    Some(true)
                } else {
                    None
                };
            Some(derived)
        }
        _ => None,
    }
}

fn evidence_id(
    proposal: &ClosureEvidenceProposal,
    prepared: &PreparedEvidenceSource,
    kind: ClosureEvidenceKind,
) -> String {
    let stable = serde_json::to_vec(&(
        CLOSURE_EVIDENCE_SCHEMA_VERSION,
        &proposal.quotation_id,
        &proposal.quotation_version_id,
        &prepared.source,
        &prepared.content_hash,
        kind,
        &proposal.payload,
        &proposal.deadline_at,
    ))
    .unwrap_or_default();
    format!("qclosure_evidence_{}", hex::encode(Sha256::digest(stable)))
}

pub fn validate_closure_evidence(
    selected: &NormalisedQuotation,
    prepared: &PreparedEvidenceSource,
    parsed_text: Option<&str>,
    proposal: ClosureEvidenceProposal,
) -> Result<ClosureEvidenceOutcome, ClosureEvidenceError> {
    if proposal.schema_version != CLOSURE_EVIDENCE_SCHEMA_VERSION
        || proposal.quotation_id != selected.identity.quotation_id
        || proposal.quotation_version_id != selected.identity.version_id
        || proposal.source_id != prepared.source.source_id
        || proposal.source_version_id != prepared.source.source_version_id
        || !bounded(&prepared.content_hash, 200)
        || !bounded(&prepared.parser, 80)
    {
        return Err(ClosureEvidenceError::InvalidBinding);
    }
    if proposal
        .deadline_at
        .as_deref()
        .is_some_and(|value| chrono::DateTime::parse_from_rfc3339(value).is_err())
    {
        return Err(ClosureEvidenceError::InvalidProposal);
    }
    let Some(parsed_text) = parsed_text.map(str::trim).filter(|text| !text.is_empty()) else {
        return Ok(ClosureEvidenceOutcome::ManualReviewRequired {
            reason: "Source parsing or OCR is unavailable; review the evidence manually."
                .to_string(),
        });
    };
    let (kind, suggested_target) = kind_and_target(&proposal.payload);
    let contract_changes = match &proposal.payload {
        ClosureEvidencePayload::Contract { contract_quotation } => {
            if !validate_normalised_quotation(contract_quotation).is_empty()
                || contract_quotation.identity.quotation_id != selected.identity.quotation_id
                || contract_quotation.identity.vendor_id != selected.identity.vendor_id
                || contract_quotation.identity.context_namespace
                    != selected.identity.context_namespace
                || !quotation_anchors_match_source(contract_quotation, prepared, parsed_text)
            {
                return Ok(ClosureEvidenceOutcome::ManualReviewRequired {
                    reason: "Contract terms are not fully anchored to the prepared source."
                        .to_string(),
                });
            }
            detect_material_changes(selected, contract_quotation)
        }
        _ => {
            let excerpt = exact_excerpt(&proposal.payload).unwrap_or_default().trim();
            if excerpt.is_empty()
                || excerpt.chars().count() > 2_000
                || !parsed_text.contains(excerpt)
                || !phrase_supported(kind, excerpt)
            {
                return Ok(ClosureEvidenceOutcome::ManualReviewRequired {
                    reason: "The proposed closure fact is not explicitly supported by the prepared source."
                        .to_string(),
                });
            }
            Vec::new()
        }
    };
    let deposit = validated_deposit(&proposal.payload);
    let excerpt = exact_excerpt(&proposal.payload).unwrap_or_default();
    if deposit.as_ref().is_some_and(|record| {
        record.amount.amount_minor < 0
            || record.amount.amount_minor > 9_007_199_254_740_991
            || super::currency_exponent(&record.amount.currency).is_none()
            || !amount_supported(excerpt, record)
            || record
                .due_at
                .as_deref()
                .is_some_and(|date| !date_supported(excerpt, date))
            || record
                .paid_at
                .as_deref()
                .is_some_and(|date| !date_supported(excerpt, date))
            || matches!(kind, ClosureEvidenceKind::DepositRequest) && record.paid_at.is_some()
            || matches!(kind, ClosureEvidenceKind::DepositPayment) && record.paid_at.is_none()
    }) {
        return Ok(ClosureEvidenceOutcome::ManualReviewRequired {
            reason: "Deposit evidence is incomplete or invalid and needs manual review."
                .to_string(),
        });
    }
    let deadline_at = if kind == ClosureEvidenceKind::DepositRequest {
        deposit
            .as_ref()
            .and_then(|record| record.due_at.clone())
            .or_else(|| proposal.deadline_at.clone())
    } else {
        proposal.deadline_at.clone()
    };
    let deadline_source = if kind == ClosureEvidenceKind::Contract {
        parsed_text
    } else {
        excerpt
    };
    if deadline_at
        .as_deref()
        .is_some_and(|date| !date_supported(deadline_source, date))
    {
        return Ok(ClosureEvidenceOutcome::ManualReviewRequired {
            reason: "The proposed deadline is not explicitly supported by the prepared source."
                .to_string(),
        });
    }
    Ok(ClosureEvidenceOutcome::Ready {
        evidence: ValidatedClosureEvidence {
            evidence_id: evidence_id(&proposal, prepared, kind),
            kind,
            quotation_id: proposal.quotation_id,
            quotation_version_id: proposal.quotation_version_id,
            source: prepared.source.clone(),
            suggested_target,
            requires_explicit_review: !contract_changes.is_empty(),
            contract_changes,
            deposit,
            deadline_at,
            payment_execution: false,
        },
    })
}
