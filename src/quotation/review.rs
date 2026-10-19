use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    contracts::{
        CommercialTerm, Evidence, EvidenceState, InclusionState, LineItem, NormalisedQuotation,
        QuoteLifecycle, SourceAnchor, SourceReference, quotation_material_fingerprint,
    },
    validation::validate_normalised_quotation,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum QuotationReviewAction {
    ConfirmLine {
        line_id: String,
    },
    CorrectLine {
        line_id: String,
        replacement: LineItem,
        correction_anchor: SourceAnchor,
    },
    AcceptVendorLineChange {
        acceptance_ref: String,
        planning_review_ref: String,
        line_id: String,
        replacement: LineItem,
        correction_anchor: SourceAnchor,
        source: SourceReference,
        response_ref: String,
        response_fingerprint: String,
        option_ref: String,
    },
    AcceptVendorTermChange {
        acceptance_ref: String,
        planning_review_ref: String,
        term_id: String,
        replacement: CommercialTerm,
        correction_anchor: SourceAnchor,
        source: SourceReference,
        response_ref: String,
        response_fingerprint: String,
        option_ref: String,
    },
    MarkUnknown {
        line_id: String,
        reason: String,
    },
    MarkNotApplicable {
        line_id: String,
        reason: String,
    },
    RejectExtraction {
        reason: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotationReviewCommand {
    pub command_id: String,
    pub expected_version_id: String,
    pub expected_material_fingerprint: String,
    pub actor_id: String,
    pub reviewed_at: String,
    pub action: QuotationReviewAction,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotationReviewSuccessor {
    pub review_id: String,
    pub parent_version_id: String,
    pub version_id: String,
    pub material_fingerprint: String,
    pub actor_id: String,
    pub reviewed_at: String,
    pub action: QuotationReviewAction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quotation: Option<NormalisedQuotation>,
    pub rejected: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ReviewError {
    StaleRevision,
    InvalidCommand,
    LineNotFound,
    EvidenceRequired,
    InvalidSuccessor,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MaterialReviewField {
    pub field_id: String,
    pub materiality: String,
    pub confidence_bps: u16,
    pub reviewed: bool,
    pub evidence_state: EvidenceState,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MaterialReviewGate {
    pub ready: bool,
    pub blocking_field_ids: Vec<String>,
}

pub fn material_review_gate(fields: &[MaterialReviewField]) -> MaterialReviewGate {
    let mut blocking_field_ids = fields
        .iter()
        .filter(|field| {
            field.materiality == "high"
                && (!field.reviewed
                    || field.confidence_bps < 8_000
                    || matches!(
                        field.evidence_state,
                        EvidenceState::Unknown | EvidenceState::Conflicting
                    ))
        })
        .map(|field| field.field_id.clone())
        .collect::<Vec<_>>();
    blocking_field_ids.sort();
    blocking_field_ids.dedup();
    MaterialReviewGate {
        ready: blocking_field_ids.is_empty(),
        blocking_field_ids,
    }
}

fn valid_text(value: &str, max: usize) -> bool {
    let value = value.trim();
    !value.is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

fn anchor_registered(quotation: &NormalisedQuotation, anchor: &SourceAnchor) -> bool {
    quotation.sources.iter().any(|source| {
        source.source_id == anchor.source_id && source.source_version_id == anchor.source_version_id
    }) && valid_text(&anchor.locator, 500)
        && valid_text(&anchor.exact_excerpt, 2_000)
}

fn vendor_change_source_valid(
    quotation: &NormalisedQuotation,
    source: &SourceReference,
    anchor: &SourceAnchor,
    response_ref: &str,
    response_fingerprint: &str,
    option_ref: &str,
    acceptance_ref: &str,
    planning_review_ref: &str,
) -> bool {
    valid_text(response_ref, 180)
        && valid_text(option_ref, 180)
        && valid_text(acceptance_ref, 180)
        && valid_text(planning_review_ref, 180)
        && response_fingerprint.len() == 64
        && response_fingerprint
            .chars()
            .all(|value| value.is_ascii_hexdigit())
        && source.source_id == anchor.source_id
        && source.source_version_id == anchor.source_version_id
        && valid_text(&source.source_id, 180)
        && valid_text(&source.source_version_id, 180)
        && valid_text(&source.media_type, 180)
        && source
            .content_hash
            .as_deref()
            .is_some_and(|value| valid_text(value, 500))
        && valid_text(&anchor.locator, 500)
        && valid_text(&anchor.exact_excerpt, 2_000)
        && quotation.sources.iter().all(|existing| {
            existing.source_id != source.source_id
                || existing.source_version_id != source.source_version_id
                || existing == source
        })
}

fn register_vendor_source(quotation: &mut NormalisedQuotation, source: &SourceReference) {
    if !quotation.sources.iter().any(|existing| existing == source) {
        quotation.sources.push(source.clone());
        quotation.sources.sort_by(|left, right| {
            (&left.source_id, &left.source_version_id)
                .cmp(&(&right.source_id, &right.source_version_id))
        });
    }
}

fn successor_id(command: &QuotationReviewCommand, parent: &str) -> String {
    let bytes = serde_json::to_vec(&(command, parent)).unwrap_or_default();
    format!("qreview_{}", hex::encode(Sha256::digest(bytes)))
}

pub fn apply_review_action(
    quotation: &NormalisedQuotation,
    command: QuotationReviewCommand,
) -> Result<QuotationReviewSuccessor, ReviewError> {
    let current_fingerprint = quotation_material_fingerprint(quotation);
    if command.expected_version_id != quotation.identity.version_id
        || command.expected_material_fingerprint != current_fingerprint
    {
        return Err(ReviewError::StaleRevision);
    }
    if !valid_text(&command.command_id, 180)
        || !valid_text(&command.actor_id, 180)
        || chrono::DateTime::parse_from_rfc3339(&command.reviewed_at).is_err()
    {
        return Err(ReviewError::InvalidCommand);
    }
    let parent_version_id = quotation.identity.version_id.clone();
    let review_id = successor_id(&command, &parent_version_id);
    if let QuotationReviewAction::RejectExtraction { reason } = &command.action {
        if !valid_text(reason, 1_000) {
            return Err(ReviewError::InvalidCommand);
        }
        return Ok(QuotationReviewSuccessor {
            review_id: review_id.clone(),
            parent_version_id,
            version_id: review_id,
            material_fingerprint: current_fingerprint,
            actor_id: command.actor_id,
            reviewed_at: command.reviewed_at,
            action: command.action,
            quotation: None,
            rejected: true,
        });
    }

    let mut successor = quotation.clone();
    successor.identity.supersedes_version_id = Some(parent_version_id.clone());
    successor.identity.version_id = review_id.clone();
    successor.lifecycle = QuoteLifecycle::Active;
    let target_id = match &command.action {
        QuotationReviewAction::ConfirmLine { line_id }
        | QuotationReviewAction::CorrectLine { line_id, .. }
        | QuotationReviewAction::AcceptVendorLineChange { line_id, .. }
        | QuotationReviewAction::MarkUnknown { line_id, .. }
        | QuotationReviewAction::MarkNotApplicable { line_id, .. } => line_id,
        QuotationReviewAction::AcceptVendorTermChange { .. } => "",
        QuotationReviewAction::RejectExtraction { .. } => unreachable!(),
    };
    let index = (!target_id.is_empty())
        .then(|| {
            successor
                .line_items
                .iter()
                .position(|line| &line.line_id == target_id)
                .ok_or(ReviewError::LineNotFound)
        })
        .transpose()?;
    match &command.action {
        QuotationReviewAction::ConfirmLine { .. } => {
            let index = index.ok_or(ReviewError::LineNotFound)?;
            if successor.line_items[index].evidence.anchors.is_empty() {
                return Err(ReviewError::EvidenceRequired);
            }
            successor.line_items[index].evidence.state = EvidenceState::Confirmed;
            successor.line_items[index].evidence.rationale = Some("confirmed_by_user".to_string());
        }
        QuotationReviewAction::CorrectLine {
            replacement,
            correction_anchor,
            ..
        } => {
            let index = index.ok_or(ReviewError::LineNotFound)?;
            if replacement.line_id != *target_id || !anchor_registered(quotation, correction_anchor)
            {
                return Err(ReviewError::EvidenceRequired);
            }
            let mut replacement = replacement.clone();
            replacement.evidence = Evidence {
                state: EvidenceState::Confirmed,
                anchors: vec![correction_anchor.clone()],
                rationale: Some("corrected_by_user".to_string()),
            };
            successor.line_items[index] = replacement;
        }
        QuotationReviewAction::AcceptVendorLineChange {
            acceptance_ref,
            planning_review_ref,
            line_id,
            replacement,
            correction_anchor,
            source,
            response_ref,
            response_fingerprint,
            option_ref,
        } => {
            let index = index.ok_or(ReviewError::LineNotFound)?;
            if replacement.line_id != *line_id
                || !vendor_change_source_valid(
                    quotation,
                    source,
                    correction_anchor,
                    response_ref,
                    response_fingerprint,
                    option_ref,
                    acceptance_ref,
                    planning_review_ref,
                )
            {
                return Err(ReviewError::EvidenceRequired);
            }
            register_vendor_source(&mut successor, source);
            let mut replacement = replacement.clone();
            replacement.evidence = Evidence {
                state: EvidenceState::Confirmed,
                anchors: vec![correction_anchor.clone()],
                rationale: Some("accepted_vendor_change".to_string()),
            };
            successor.line_items[index] = replacement;
        }
        QuotationReviewAction::AcceptVendorTermChange {
            acceptance_ref,
            planning_review_ref,
            term_id,
            replacement,
            correction_anchor,
            source,
            response_ref,
            response_fingerprint,
            option_ref,
        } => {
            let index = successor
                .commercial_terms
                .iter()
                .position(|term| term.term_id == *term_id)
                .ok_or(ReviewError::LineNotFound)?;
            if replacement.term_id != *term_id
                || !vendor_change_source_valid(
                    quotation,
                    source,
                    correction_anchor,
                    response_ref,
                    response_fingerprint,
                    option_ref,
                    acceptance_ref,
                    planning_review_ref,
                )
            {
                return Err(ReviewError::EvidenceRequired);
            }
            register_vendor_source(&mut successor, source);
            let mut replacement = replacement.clone();
            replacement.evidence = Evidence {
                state: EvidenceState::Confirmed,
                anchors: vec![correction_anchor.clone()],
                rationale: Some("accepted_vendor_change".to_string()),
            };
            successor.commercial_terms[index] = replacement;
        }
        QuotationReviewAction::MarkUnknown { reason, .. } => {
            let index = index.ok_or(ReviewError::LineNotFound)?;
            if !valid_text(reason, 1_000) {
                return Err(ReviewError::InvalidCommand);
            }
            successor.line_items[index].unit_price = None;
            successor.line_items[index].rate_bps = None;
            successor.line_items[index].evidence = Evidence::unknown(reason);
        }
        QuotationReviewAction::MarkNotApplicable { reason, .. } => {
            let index = index.ok_or(ReviewError::LineNotFound)?;
            if !valid_text(reason, 1_000) {
                return Err(ReviewError::InvalidCommand);
            }
            successor.line_items[index].inclusion = InclusionState::Excluded;
            successor.line_items[index].unit_price = None;
            successor.line_items[index].rate_bps = None;
            successor.line_items[index].evidence = Evidence::unknown(reason);
        }
        QuotationReviewAction::RejectExtraction { .. } => unreachable!(),
    }
    if !validate_normalised_quotation(&successor).is_empty() {
        return Err(ReviewError::InvalidSuccessor);
    }
    let material_fingerprint = quotation_material_fingerprint(&successor);
    Ok(QuotationReviewSuccessor {
        review_id,
        parent_version_id,
        version_id: successor.identity.version_id.clone(),
        material_fingerprint,
        actor_id: command.actor_id,
        reviewed_at: command.reviewed_at,
        action: command.action,
        quotation: Some(successor),
        rejected: false,
    })
}
