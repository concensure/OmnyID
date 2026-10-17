use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    ClarificationCandidate, ComparableScenario, ComparableTotal, MaterialChange,
    NormalisedQuotation, SourceAnchor, calculate_comparable_total, detect_material_changes,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClarificationQuestion {
    pub fact_key: String,
    pub question: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClarificationContextFact {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClarificationDraft {
    pub draft_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub comparison_revision: String,
    pub recipient: String,
    pub subject: String,
    pub questions: Vec<ClarificationQuestion>,
    #[serde(default)]
    pub context: Vec<ClarificationContextFact>,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClarificationApproval {
    pub approval_id: String,
    pub draft_id: String,
    pub draft_hash: String,
    pub recipient: String,
    pub quotation_version_id: String,
    pub comparison_revision: String,
    pub expires_at: String,
    pub approval_receipt_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClarificationSendReceipt {
    pub idempotency_key: String,
    pub provider_receipt_id: String,
    pub sent_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ClarificationSendDecision {
    Approved { idempotency_key: String },
    AlreadySent(ClarificationSendReceipt),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ClarificationError {
    InvalidDraft,
    ForbiddenContext,
    StaleApproval,
    ApprovalExpired,
    MissingApprovalReceipt,
    UnsupportedReplyEvidence,
}

const FORBIDDEN_CONTEXT_PREFIXES: &[&str] = &[
    "competitor.",
    "private_note.",
    "hidden_preference.",
    "internal_score.",
    "full_plan.",
];

fn bounded(value: &str, max: usize) -> bool {
    let value = value.trim();
    !value.is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

pub fn clarification_context_is_shareable(context: &[ClarificationContextFact]) -> bool {
    context.len() <= 100
        && context.iter().all(|fact| {
            let normalized_key = fact.key.trim().to_ascii_lowercase();
            bounded(&fact.key, 180)
                && bounded(&fact.value, 500)
                && !FORBIDDEN_CONTEXT_PREFIXES
                    .iter()
                    .any(|prefix| normalized_key.starts_with(prefix))
        })
}

pub fn draft_hash(draft: &ClarificationDraft) -> String {
    let bytes = serde_json::to_vec(draft).unwrap_or_default();
    format!("sha256:{}", hex::encode(Sha256::digest(bytes)))
}

pub fn build_clarification_draft(
    quotation_id: &str,
    quotation_version_id: &str,
    comparison_revision: &str,
    recipient: &str,
    subject: &str,
    candidates: &[ClarificationCandidate],
    already_asked_or_answered: &BTreeSet<String>,
    context: Vec<ClarificationContextFact>,
    created_at: &str,
) -> Result<ClarificationDraft, ClarificationError> {
    if !bounded(quotation_id, 180)
        || !bounded(quotation_version_id, 180)
        || !bounded(comparison_revision, 180)
        || !bounded(recipient, 320)
        || !bounded(subject, 300)
        || chrono::DateTime::parse_from_rfc3339(created_at).is_err()
    {
        return Err(ClarificationError::InvalidDraft);
    }
    if !clarification_context_is_shareable(&context) {
        return Err(ClarificationError::ForbiddenContext);
    }
    let mut seen = BTreeSet::new();
    let questions = candidates
        .iter()
        .filter_map(|candidate| {
            let fact_key = candidate
                .line_id
                .clone()
                .unwrap_or_else(|| candidate.gap_code.clone());
            if already_asked_or_answered.contains(&fact_key)
                || !seen.insert(fact_key.clone())
                || !bounded(&candidate.question, 500)
            {
                return None;
            }
            Some(ClarificationQuestion {
                fact_key,
                question: candidate.question.clone(),
            })
        })
        .take(3)
        .collect::<Vec<_>>();
    if questions.is_empty() {
        return Err(ClarificationError::InvalidDraft);
    }
    let stable = serde_json::to_vec(&(
        quotation_id,
        quotation_version_id,
        comparison_revision,
        recipient,
        subject,
        &questions,
        &context,
        created_at,
    ))
    .unwrap_or_default();
    Ok(ClarificationDraft {
        draft_id: format!("qclarify_{}", hex::encode(Sha256::digest(stable))),
        quotation_id: quotation_id.to_string(),
        quotation_version_id: quotation_version_id.to_string(),
        comparison_revision: comparison_revision.to_string(),
        recipient: recipient.to_string(),
        subject: subject.to_string(),
        questions,
        context,
        created_at: created_at.to_string(),
    })
}

pub fn authorise_clarification_send(
    draft: &ClarificationDraft,
    approval: &ClarificationApproval,
    now: &str,
    prior_receipts: &[ClarificationSendReceipt],
) -> Result<ClarificationSendDecision, ClarificationError> {
    let now =
        chrono::DateTime::parse_from_rfc3339(now).map_err(|_| ClarificationError::StaleApproval)?;
    let expires = chrono::DateTime::parse_from_rfc3339(&approval.expires_at)
        .map_err(|_| ClarificationError::StaleApproval)?;
    if expires <= now {
        return Err(ClarificationError::ApprovalExpired);
    }
    let idempotency_key = clarification_send_idempotency_key(draft, approval)?;
    if let Some(receipt) = prior_receipts
        .iter()
        .find(|receipt| receipt.idempotency_key == idempotency_key)
    {
        return Ok(ClarificationSendDecision::AlreadySent(receipt.clone()));
    }
    Ok(ClarificationSendDecision::Approved { idempotency_key })
}

pub fn clarification_send_idempotency_key(
    draft: &ClarificationDraft,
    approval: &ClarificationApproval,
) -> Result<String, ClarificationError> {
    if approval.approval_receipt_id.trim().is_empty() {
        return Err(ClarificationError::MissingApprovalReceipt);
    }
    let expected_hash = draft_hash(draft);
    if approval.draft_id != draft.draft_id
        || approval.draft_hash != expected_hash
        || approval.recipient != draft.recipient
        || approval.quotation_version_id != draft.quotation_version_id
        || approval.comparison_revision != draft.comparison_revision
    {
        return Err(ClarificationError::StaleApproval);
    }
    let idempotency_key = format!(
        "qsend_{}",
        hex::encode(Sha256::digest(
            format!("{}:{}", approval.approval_id, expected_hash).as_bytes()
        ))
    );
    Ok(idempotency_key)
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClarificationReplyFact {
    pub fact_key: String,
    pub value: String,
    pub exact_excerpt: String,
    pub locator: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClarificationReply {
    pub source_id: String,
    pub source_version_id: String,
    pub body_text: String,
    pub facts: Vec<ClarificationReplyFact>,
}

pub fn reply_anchors(
    reply: &ClarificationReply,
) -> Result<Vec<(String, String, SourceAnchor)>, ClarificationError> {
    let mut seen = BTreeSet::new();
    let mut anchors = Vec::new();
    for fact in &reply.facts {
        if !bounded(&fact.fact_key, 180)
            || !bounded(&fact.value, 500)
            || !bounded(&fact.locator, 500)
            || !bounded(&fact.exact_excerpt, 2_000)
            || !reply.body_text.contains(&fact.exact_excerpt)
            || !seen.insert(fact.fact_key.clone())
        {
            return Err(ClarificationError::UnsupportedReplyEvidence);
        }
        anchors.push((
            fact.fact_key.clone(),
            fact.value.clone(),
            SourceAnchor {
                source_id: reply.source_id.clone(),
                source_version_id: reply.source_version_id.clone(),
                locator: fact.locator.clone(),
                exact_excerpt: fact.exact_excerpt.clone(),
            },
        ));
    }
    Ok(anchors)
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClarificationReevaluation {
    pub material_changes: Vec<MaterialChange>,
    pub total: ComparableTotal,
    pub old_decision_resolved: bool,
}

pub fn reevaluate_after_reply(
    previous: &NormalisedQuotation,
    successor: &NormalisedQuotation,
    scenario: &ComparableScenario,
    successor_persisted: bool,
) -> ClarificationReevaluation {
    ClarificationReevaluation {
        material_changes: detect_material_changes(previous, successor),
        total: calculate_comparable_total(successor, scenario),
        old_decision_resolved: successor_persisted
            && successor.identity.supersedes_version_id.as_deref()
                == Some(previous.identity.version_id.as_str()),
    }
}
