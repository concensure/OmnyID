use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::quotation::{
    EvidenceState, NormalisedQuotation, QuotationVendorResponse, VendorCommercialFact,
    VendorCommercialValue, VendorResponseEvidenceState, VendorResponseStatus,
    validate_vendor_response, vendor_response_fingerprint,
};

use super::{
    AnchoredTerm, KnownMoney, Money, SourceAnchor, VENDOR_CHANGE_SCHEMA_VERSION, VendorChange,
    VendorChangeKind, validate_vendor_change,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorResponseInterpretationKind {
    Quote,
    Clarification,
    ChangeProposal,
    Unclassified,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorChangeBlockerKind {
    InvalidResponse,
    UnsupportedResponseState,
    StaleQuotationBinding,
    EvidenceNotConfirmed,
    OriginalObjectMissing,
    OriginalEvidenceMissing,
    ReplacementAmbiguous,
    DeadlineAmbiguous,
    CurrencyMismatch,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorChangeBlocker {
    pub kind: VendorChangeBlockerKind,
    pub fact_refs: Vec<String>,
    pub affected_object_ref: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorChangeInterpretation {
    pub interpretation_id: String,
    pub response_ref: String,
    pub response_fingerprint: String,
    pub quotation_version_ref: String,
    pub kind: VendorResponseInterpretationKind,
    pub changes: Vec<VendorChange>,
    pub blockers: Vec<VendorChangeBlocker>,
    pub requires_user_review: bool,
    pub quotation_mutated: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum ObjectKind {
    LineItem,
    CommercialTerm,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct ObjectRef {
    kind: ObjectKind,
    id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ChangeField {
    Unavailable,
    Replacement,
    Price,
    Scope,
    DueAt,
    Deadline,
}

#[derive(Default)]
struct FactGroup<'a> {
    unavailable: Vec<&'a VendorCommercialFact>,
    replacements: Vec<&'a VendorCommercialFact>,
    prices: Vec<&'a VendorCommercialFact>,
    scopes: Vec<&'a VendorCommercialFact>,
    due_dates: Vec<&'a VendorCommercialFact>,
    deadlines: Vec<&'a VendorCommercialFact>,
}

pub fn interpret_vendor_response_change(
    response: &QuotationVendorResponse,
    quotation: &NormalisedQuotation,
) -> VendorChangeInterpretation {
    let response_fingerprint = vendor_response_fingerprint(response).unwrap_or_default();
    let mut blockers = Vec::new();
    if !validate_vendor_response(response).is_empty() {
        blockers.push(blocker(VendorChangeBlockerKind::InvalidResponse, &[], None));
    }
    if !matches!(
        response.status,
        VendorResponseStatus::Received | VendorResponseStatus::Reviewed
    ) {
        blockers.push(blocker(
            VendorChangeBlockerKind::UnsupportedResponseState,
            &[],
            None,
        ));
    }
    let binding_current = response.quotation_id == quotation.identity.quotation_id
        && response.quotation_version_id == quotation.identity.version_id;
    if !binding_current {
        blockers.push(blocker(
            VendorChangeBlockerKind::StaleQuotationBinding,
            &[],
            None,
        ));
    }

    let mut groups = BTreeMap::<ObjectRef, FactGroup<'_>>::new();
    let mut recognized_change_fact = false;
    for fact in &response.commercial_facts {
        let Some((object, field)) = parse_change_key(&fact.key) else {
            continue;
        };
        recognized_change_fact = true;
        if fact.state != VendorResponseEvidenceState::Confirmed || fact.anchors.is_empty() {
            blockers.push(blocker(
                VendorChangeBlockerKind::EvidenceNotConfirmed,
                &[fact.fact_id.clone()],
                Some(object_label(&object)),
            ));
            continue;
        }
        let group = groups.entry(object).or_default();
        match field {
            ChangeField::Unavailable => group.unavailable.push(fact),
            ChangeField::Replacement => group.replacements.push(fact),
            ChangeField::Price => group.prices.push(fact),
            ChangeField::Scope => group.scopes.push(fact),
            ChangeField::DueAt => group.due_dates.push(fact),
            ChangeField::Deadline => group.deadlines.push(fact),
        }
    }

    let kind = if recognized_change_fact {
        VendorResponseInterpretationKind::ChangeProposal
    } else if !response.question_answers.is_empty() {
        VendorResponseInterpretationKind::Clarification
    } else if !response.commercial_facts.is_empty()
        || response.availability.is_some()
        || !response.attachments.is_empty()
    {
        VendorResponseInterpretationKind::Quote
    } else {
        VendorResponseInterpretationKind::Unclassified
    };
    let can_extract = blockers.iter().all(|value| {
        !matches!(
            value.kind,
            VendorChangeBlockerKind::InvalidResponse
                | VendorChangeBlockerKind::UnsupportedResponseState
                | VendorChangeBlockerKind::StaleQuotationBinding
        )
    });
    let mut changes = Vec::new();
    if can_extract {
        for (object, group) in groups {
            match build_change(response, quotation, &object, &group) {
                Ok(change) => changes.push(change),
                Err(mut errors) => blockers.append(&mut errors),
            }
        }
    }
    changes.sort_by(|left, right| left.change_id.cmp(&right.change_id));
    blockers.sort_by(|left, right| {
        format!("{:?}", left.kind)
            .cmp(&format!("{:?}", right.kind))
            .then_with(|| left.affected_object_ref.cmp(&right.affected_object_ref))
            .then_with(|| left.fact_refs.cmp(&right.fact_refs))
    });
    blockers.dedup();
    let interpretation_id = stable_id(
        "vendor_change_interpretation",
        &serde_json::json!({
            "response_ref": response.response_id,
            "response_fingerprint": response_fingerprint,
            "quotation_version_ref": quotation.identity.version_id,
            "kind": kind,
            "changes": changes,
            "blockers": blockers,
        }),
    );
    VendorChangeInterpretation {
        interpretation_id,
        response_ref: response.response_id.clone(),
        response_fingerprint,
        quotation_version_ref: quotation.identity.version_id.clone(),
        kind,
        requires_user_review: !changes.is_empty() || !blockers.is_empty(),
        changes,
        blockers,
        quotation_mutated: false,
    }
}

fn build_change(
    response: &QuotationVendorResponse,
    quotation: &NormalisedQuotation,
    object: &ObjectRef,
    group: &FactGroup<'_>,
) -> Result<VendorChange, Vec<VendorChangeBlocker>> {
    let object_ref = object_label(object);
    let mut errors = Vec::new();
    if !object_exists(quotation, object) {
        errors.push(blocker(
            VendorChangeBlockerKind::OriginalObjectMissing,
            &group_fact_ids(group),
            Some(object_ref),
        ));
        return Err(errors);
    }
    let Some(original) = original_term(quotation, object, group) else {
        errors.push(blocker(
            VendorChangeBlockerKind::OriginalEvidenceMissing,
            &group_fact_ids(group),
            Some(object_ref.clone()),
        ));
        return Err(errors);
    };
    let replacement_options = anchored_replacements(group);
    if (group.replacements.len() + group.scopes.len() + group.due_dates.len() + group.prices.len())
        != replacement_options.len()
        || group.prices.len() > 1
    {
        errors.push(blocker(
            VendorChangeBlockerKind::ReplacementAmbiguous,
            &group_fact_ids(group),
            Some(object_ref.clone()),
        ));
    }
    let deadline = exact_deadline(group);
    if group.deadlines.len() > 1 || (!group.deadlines.is_empty() && deadline.is_none()) {
        errors.push(blocker(
            VendorChangeBlockerKind::DeadlineAmbiguous,
            &group_fact_ids(group),
            Some(object_ref.clone()),
        ));
    }
    let cost_delta = match exact_cost_delta(quotation, object, group) {
        Ok(value) => value,
        Err(()) => {
            errors.push(blocker(
                VendorChangeBlockerKind::CurrencyMismatch,
                &group_fact_ids(group),
                Some(object_ref.clone()),
            ));
            KnownMoney::Unknown
        }
    };
    if !errors.is_empty() {
        return Err(errors);
    }
    let change_kind = if !group.replacements.is_empty() {
        VendorChangeKind::Substituted
    } else if !group.unavailable.is_empty() {
        VendorChangeKind::Unavailable
    } else if !group.prices.is_empty() {
        VendorChangeKind::PriceChanged
    } else if !group.due_dates.is_empty() {
        VendorChangeKind::TimingChanged
    } else {
        VendorChangeKind::ScopeChanged
    };
    let change_id = stable_id(
        "vendor_change",
        &serde_json::json!({
            "response_ref": response.response_id,
            "response_fingerprint": vendor_response_fingerprint(response).unwrap_or_default(),
            "affected_object_ref": object_ref,
            "change_kind": change_kind,
            "original_term": original,
            "replacement_options": replacement_options,
            "cost_delta": cost_delta,
            "deadline": deadline,
        }),
    );
    let change = VendorChange {
        schema_version: VENDOR_CHANGE_SCHEMA_VERSION.to_string(),
        change_id,
        response_ref: response.response_id.clone(),
        affected_object_ref: object_ref,
        change_kind,
        original_term: original,
        replacement_options,
        cost_delta,
        deadline,
        requires_user_decision: true,
    };
    validate_vendor_change(&change).map_err(|_| {
        vec![blocker(
            VendorChangeBlockerKind::ReplacementAmbiguous,
            &group_fact_ids(group),
            Some(change.affected_object_ref.clone()),
        )]
    })?;
    Ok(change)
}

fn parse_change_key(value: &str) -> Option<(ObjectRef, ChangeField)> {
    let parts = value.split('.').collect::<Vec<_>>();
    if parts.len() != 4 || parts[0] != "change" || parts[2].is_empty() {
        return None;
    }
    let kind = match parts[1] {
        "line_item" => ObjectKind::LineItem,
        "commercial_term" => ObjectKind::CommercialTerm,
        _ => return None,
    };
    let field = match parts[3] {
        "unavailable" => ChangeField::Unavailable,
        "replacement" => ChangeField::Replacement,
        "price" => ChangeField::Price,
        "scope" => ChangeField::Scope,
        "due_at" => ChangeField::DueAt,
        "deadline" => ChangeField::Deadline,
        _ => return None,
    };
    if kind == ObjectKind::CommercialTerm
        && !matches!(field, ChangeField::DueAt | ChangeField::Deadline)
    {
        return None;
    }
    Some((
        ObjectRef {
            kind,
            id: parts[2].to_string(),
        },
        field,
    ))
}

fn object_exists(quotation: &NormalisedQuotation, object: &ObjectRef) -> bool {
    match object.kind {
        ObjectKind::LineItem => quotation
            .line_items
            .iter()
            .any(|line| line.line_id == object.id),
        ObjectKind::CommercialTerm => quotation
            .commercial_terms
            .iter()
            .any(|term| term.term_id == object.id),
    }
}

fn original_term(
    quotation: &NormalisedQuotation,
    object: &ObjectRef,
    group: &FactGroup<'_>,
) -> Option<AnchoredTerm> {
    match object.kind {
        ObjectKind::LineItem => {
            let line = quotation
                .line_items
                .iter()
                .find(|line| line.line_id == object.id)?;
            let anchor = line.evidence.anchors.first()?;
            (line.evidence.state == EvidenceState::Confirmed).then(|| AnchoredTerm {
                value: if !group.prices.is_empty() {
                    line.unit_price
                        .as_ref()
                        .map(|money| format!("{}:{}", money.currency, money.amount_minor))
                        .unwrap_or_else(|| line.label.clone())
                } else if !group.scopes.is_empty() {
                    format!("{:?}", line.inclusion).to_lowercase()
                } else {
                    line.label.clone()
                },
                source_anchor: planning_anchor(anchor),
            })
        }
        ObjectKind::CommercialTerm => {
            let term = quotation
                .commercial_terms
                .iter()
                .find(|term| term.term_id == object.id)?;
            let anchor = term.evidence.anchors.first()?;
            (term.evidence.state == EvidenceState::Confirmed).then(|| AnchoredTerm {
                value: term.due_at.clone().unwrap_or_else(|| term.label.clone()),
                source_anchor: planning_anchor(anchor),
            })
        }
    }
}

fn anchored_replacements(group: &FactGroup<'_>) -> Vec<AnchoredTerm> {
    let mut values = group
        .replacements
        .iter()
        .chain(&group.scopes)
        .chain(&group.due_dates)
        .chain(&group.prices)
        .filter_map(|fact| {
            let value = match fact.value.as_ref()? {
                VendorCommercialValue::Text(value) => value.clone(),
                VendorCommercialValue::Date(value) => value.clone(),
                VendorCommercialValue::Inclusion(value) => format!("{value:?}").to_lowercase(),
                VendorCommercialValue::Money(value) => {
                    format!("{}:{}", value.currency, value.amount_minor)
                }
                _ => return None,
            };
            Some(AnchoredTerm {
                value,
                source_anchor: planning_anchor(fact.anchors.first()?),
            })
        })
        .collect::<Vec<_>>();
    values.sort_by(|left, right| {
        (&left.value, &left.source_anchor.source_version_id)
            .cmp(&(&right.value, &right.source_anchor.source_version_id))
    });
    values.dedup();
    values
}

fn exact_deadline(group: &FactGroup<'_>) -> Option<String> {
    let fact = (group.deadlines.len() == 1).then(|| group.deadlines[0])?;
    match fact.value.as_ref()? {
        VendorCommercialValue::Date(value)
            if chrono::DateTime::parse_from_rfc3339(value).is_ok() =>
        {
            Some(value.clone())
        }
        _ => None,
    }
}

fn exact_cost_delta(
    quotation: &NormalisedQuotation,
    object: &ObjectRef,
    group: &FactGroup<'_>,
) -> Result<KnownMoney, ()> {
    let Some(fact) = (group.prices.len() == 1).then(|| group.prices[0]) else {
        return Ok(KnownMoney::Unknown);
    };
    let VendorCommercialValue::Money(replacement) = fact.value.as_ref().ok_or(())? else {
        return Ok(KnownMoney::Unknown);
    };
    let ObjectKind::LineItem = object.kind else {
        return Ok(KnownMoney::Unknown);
    };
    let original = quotation
        .line_items
        .iter()
        .find(|line| line.line_id == object.id)
        .and_then(|line| line.unit_price.as_ref())
        .ok_or(())?;
    if original.currency != replacement.currency {
        return Err(());
    }
    let evidence_ref = fact
        .anchors
        .first()
        .map(|anchor| anchor.source_version_id.clone())
        .ok_or(())?;
    let delta = replacement
        .amount_minor
        .checked_sub(original.amount_minor)
        .and_then(i64::checked_abs)
        .ok_or(())?;
    Ok(KnownMoney::Exact {
        amount: Money {
            amount_minor: delta,
            currency: replacement.currency.clone(),
        },
        evidence_ref,
    })
}

fn planning_anchor(value: &crate::quotation::SourceAnchor) -> SourceAnchor {
    SourceAnchor {
        message_id: value.source_id.clone(),
        source_version_id: Some(value.source_version_id.clone()),
        locator: value.locator.clone(),
        exact_excerpt: value.exact_excerpt.clone(),
    }
}

fn object_label(value: &ObjectRef) -> String {
    match value.kind {
        ObjectKind::LineItem => format!("line_item:{}", value.id),
        ObjectKind::CommercialTerm => format!("commercial_term:{}", value.id),
    }
}

fn group_fact_ids(group: &FactGroup<'_>) -> Vec<String> {
    let mut values = group
        .unavailable
        .iter()
        .chain(&group.replacements)
        .chain(&group.prices)
        .chain(&group.scopes)
        .chain(&group.due_dates)
        .chain(&group.deadlines)
        .map(|fact| fact.fact_id.clone())
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    values
}

fn blocker(
    kind: VendorChangeBlockerKind,
    fact_refs: &[String],
    affected_object_ref: Option<String>,
) -> VendorChangeBlocker {
    let mut fact_refs = fact_refs.to_vec();
    fact_refs.sort();
    fact_refs.dedup();
    VendorChangeBlocker {
        kind,
        fact_refs,
        affected_object_ref,
    }
}

fn stable_id(prefix: &str, value: &serde_json::Value) -> String {
    let canonical = crate::crypto::canonical_json_string(value);
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    format!("{prefix}:{}", &digest[..24])
}
