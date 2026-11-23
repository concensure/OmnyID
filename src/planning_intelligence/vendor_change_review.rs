use std::collections::BTreeMap;

use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    AnchoredTerm, ConstraintEvaluation, ConstraintKind, ConstraintStatus, ConstraintStrength,
    EvaluationResult, MoneyRange, PlanningConstraint, VendorChange, VendorChangeInterpretation,
    VendorResponseInterpretationKind, validate_constraint, validate_evaluation,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorChangeFit {
    Satisfied,
    Conflict,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorChangeBudgetFit {
    WithinBudget,
    ExceedsBudget,
    Uncertain,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorChangeReviewBlockerKind {
    InterpretationBlocked,
    ResponseNotCurrent,
    QuotationNotCurrent,
    EvaluationNotCurrent,
    EvaluationAmbiguous,
    ConstraintEvidenceInvalid,
    BudgetEvidenceInvalid,
    EventDateInvalid,
    ReferenceTimeInvalid,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorChangeReviewBlocker {
    pub kind: VendorChangeReviewBlockerKind,
    pub change_ref: Option<String>,
    pub option_ref: Option<String>,
    pub evidence_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorChangeBudgetEvidence {
    pub budget_revision_ref: String,
    pub available_headroom: MoneyRange,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorChangeEventEvidence {
    pub event_at: String,
    pub source_revision_ref: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorReplacementAssessment {
    pub option_ref: String,
    pub change_ref: String,
    pub replacement: AnchoredTerm,
    pub constraint_fit: VendorChangeFit,
    pub aesthetic_fit: VendorChangeFit,
    pub budget_fit: VendorChangeBudgetFit,
    pub hard_conflict: bool,
    pub evaluation_refs: Vec<String>,
    pub unknown_constraint_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorChangeTimingAssessment {
    pub change_ref: String,
    pub as_of: String,
    pub days_to_event: Option<i64>,
    pub event_date_evidence_ref: Option<String>,
    pub explicit_deadline: Option<String>,
    pub days_to_deadline: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorChangeReviewBindings {
    pub response_ref: String,
    pub response_fingerprint: String,
    pub quotation_version_ref: String,
    pub constraint_revision_refs: Vec<String>,
    pub budget_revision_ref: Option<String>,
    pub event_date_revision_ref: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorChangeReview {
    pub review_id: String,
    pub interpretation_ref: String,
    pub bindings: VendorChangeReviewBindings,
    pub options: Vec<VendorReplacementAssessment>,
    pub timing: Vec<VendorChangeTimingAssessment>,
    pub blockers: Vec<VendorChangeReviewBlocker>,
    pub requires_user_review: bool,
    pub quotation_mutated: bool,
}

#[derive(Clone, Debug)]
pub struct VendorChangeReviewInput<'a> {
    pub interpretation: &'a VendorChangeInterpretation,
    pub current_response_ref: &'a str,
    pub current_response_fingerprint: &'a str,
    pub current_quotation_version_ref: &'a str,
    pub constraints: &'a [PlanningConstraint],
    pub evaluations: &'a [ConstraintEvaluation],
    pub budget: Option<&'a VendorChangeBudgetEvidence>,
    pub event: Option<&'a VendorChangeEventEvidence>,
    pub as_of: &'a str,
}

#[derive(Clone, Debug)]
pub struct CurrentVendorChangeReviewRevisions<'a> {
    pub response_ref: &'a str,
    pub response_fingerprint: &'a str,
    pub quotation_version_ref: &'a str,
    pub constraint_revision_refs: &'a [String],
    pub budget_revision_ref: Option<&'a str>,
    pub event_date_revision_ref: Option<&'a str>,
}

pub fn build_vendor_change_review(input: &VendorChangeReviewInput<'_>) -> VendorChangeReview {
    let mut blockers = Vec::new();
    let as_of = parse_time(input.as_of);
    if as_of.is_none() {
        blockers.push(blocker(
            VendorChangeReviewBlockerKind::ReferenceTimeInvalid,
            None,
            None,
            Vec::new(),
        ));
    }
    if !input.interpretation.blockers.is_empty()
        || input.interpretation.kind != VendorResponseInterpretationKind::ChangeProposal
    {
        blockers.push(blocker(
            VendorChangeReviewBlockerKind::InterpretationBlocked,
            None,
            None,
            Vec::new(),
        ));
    }
    if input.interpretation.response_ref != input.current_response_ref
        || input.interpretation.response_fingerprint != input.current_response_fingerprint
    {
        blockers.push(blocker(
            VendorChangeReviewBlockerKind::ResponseNotCurrent,
            None,
            None,
            Vec::new(),
        ));
    }
    if input.interpretation.quotation_version_ref != input.current_quotation_version_ref {
        blockers.push(blocker(
            VendorChangeReviewBlockerKind::QuotationNotCurrent,
            None,
            None,
            Vec::new(),
        ));
    }

    let mut constraints = input
        .constraints
        .iter()
        .filter(|value| value.status == ConstraintStatus::Confirmed)
        .collect::<Vec<_>>();
    constraints.sort_by(|left, right| left.constraint_id.cmp(&right.constraint_id));
    let mut constraint_by_ref = BTreeMap::new();
    for constraint in &constraints {
        if validate_constraint(constraint).is_err()
            || constraint_by_ref
                .insert(constraint.constraint_id.as_str(), *constraint)
                .is_some()
        {
            blockers.push(blocker(
                VendorChangeReviewBlockerKind::ConstraintEvidenceInvalid,
                None,
                None,
                vec![constraint.source_ref.clone()],
            ));
        }
    }
    let constraint_revision_refs = constraints
        .iter()
        .map(|value| value.constraint_id.clone())
        .collect::<Vec<_>>();

    let budget_valid = input.budget.is_some_and(valid_budget);
    if input.budget.is_some() && !budget_valid {
        blockers.push(blocker(
            VendorChangeReviewBlockerKind::BudgetEvidenceInvalid,
            None,
            None,
            input
                .budget
                .into_iter()
                .flat_map(|value| value.available_headroom.evidence_refs.clone())
                .collect(),
        ));
    }
    let event_at = input
        .event
        .filter(|value| valid_ref(&value.source_revision_ref))
        .and_then(|value| parse_time(&value.event_at));
    if input.event.is_some() && event_at.is_none() {
        blockers.push(blocker(
            VendorChangeReviewBlockerKind::EventDateInvalid,
            None,
            None,
            input
                .event
                .map(|value| vec![value.source_revision_ref.clone()])
                .unwrap_or_default(),
        ));
    }

    let mut options = Vec::new();
    let mut timing = Vec::new();
    for change in &input.interpretation.changes {
        timing.push(timing_assessment(
            change,
            input.as_of,
            as_of,
            input.event,
            event_at,
        ));
        for replacement in &change.replacement_options {
            let option_ref = vendor_replacement_option_ref(change, replacement);
            let (assessment, mut option_blockers) = assess_option(
                change,
                replacement,
                option_ref,
                &constraint_by_ref,
                input.evaluations,
                budget_valid.then_some(input.budget).flatten(),
            );
            options.push(assessment);
            blockers.append(&mut option_blockers);
        }
    }
    options.sort_by(|left, right| left.option_ref.cmp(&right.option_ref));
    timing.sort_by(|left, right| left.change_ref.cmp(&right.change_ref));
    sort_blockers(&mut blockers);

    let bindings = VendorChangeReviewBindings {
        response_ref: input.interpretation.response_ref.clone(),
        response_fingerprint: input.interpretation.response_fingerprint.clone(),
        quotation_version_ref: input.interpretation.quotation_version_ref.clone(),
        constraint_revision_refs,
        budget_revision_ref: input.budget.map(|value| value.budget_revision_ref.clone()),
        event_date_revision_ref: input.event.map(|value| value.source_revision_ref.clone()),
    };
    let review_id = stable_id(
        "vendor_change_review",
        &serde_json::json!({
            "interpretation_ref": input.interpretation.interpretation_id,
            "bindings": bindings,
            "options": options,
            "timing": timing,
            "blockers": blockers,
        }),
    );
    VendorChangeReview {
        review_id,
        interpretation_ref: input.interpretation.interpretation_id.clone(),
        bindings,
        options,
        timing,
        blockers,
        requires_user_review: input.interpretation.requires_user_review,
        quotation_mutated: false,
    }
}

pub fn vendor_change_review_is_current(
    review: &VendorChangeReview,
    current: &CurrentVendorChangeReviewRevisions<'_>,
) -> bool {
    let mut constraints = current.constraint_revision_refs.to_vec();
    constraints.sort();
    constraints.dedup();
    review.bindings.response_ref == current.response_ref
        && review.bindings.response_fingerprint == current.response_fingerprint
        && review.bindings.quotation_version_ref == current.quotation_version_ref
        && review.bindings.constraint_revision_refs == constraints
        && review.bindings.budget_revision_ref.as_deref() == current.budget_revision_ref
        && review.bindings.event_date_revision_ref.as_deref() == current.event_date_revision_ref
}

pub fn vendor_replacement_option_ref(change: &VendorChange, replacement: &AnchoredTerm) -> String {
    stable_id(
        "vendor_change_option",
        &serde_json::json!({
            "change_ref": change.change_id,
            "replacement": replacement,
        }),
    )
}

fn assess_option(
    change: &VendorChange,
    replacement: &AnchoredTerm,
    option_ref: String,
    constraints: &BTreeMap<&str, &PlanningConstraint>,
    evaluations: &[ConstraintEvaluation],
    budget: Option<&VendorChangeBudgetEvidence>,
) -> (VendorReplacementAssessment, Vec<VendorChangeReviewBlocker>) {
    let mut blockers = Vec::new();
    let relevant = evaluations
        .iter()
        .filter(|value| value.candidate_ref == option_ref)
        .collect::<Vec<_>>();
    let mut by_constraint = BTreeMap::<&str, Vec<&ConstraintEvaluation>>::new();
    for evaluation in relevant {
        if !constraints.contains_key(evaluation.constraint_ref.as_str()) {
            blockers.push(blocker(
                VendorChangeReviewBlockerKind::EvaluationNotCurrent,
                Some(change.change_id.clone()),
                Some(option_ref.clone()),
                vec![evaluation.evaluation_id.clone()],
            ));
            continue;
        }
        by_constraint
            .entry(evaluation.constraint_ref.as_str())
            .or_default()
            .push(evaluation);
    }

    let mut accepted = Vec::new();
    let mut unknown_constraint_refs = Vec::new();
    for (constraint_ref, constraint) in constraints {
        let mut values = by_constraint
            .get(constraint_ref)
            .cloned()
            .unwrap_or_default();
        values.sort_by(|left, right| left.evaluation_id.cmp(&right.evaluation_id));
        values.dedup_by(|left, right| left.evaluation_id == right.evaluation_id);
        let valid = values.iter().all(|value| {
            validate_evaluation(value).is_ok()
                && value.constraint_evidence_ref == constraint.source_ref
                && value.candidate_evidence_ref.as_deref()
                    == replacement.source_anchor.source_version_id.as_deref()
        });
        if values.len() > 1 {
            blockers.push(blocker(
                VendorChangeReviewBlockerKind::EvaluationAmbiguous,
                Some(change.change_id.clone()),
                Some(option_ref.clone()),
                values
                    .iter()
                    .map(|value| value.evaluation_id.clone())
                    .collect(),
            ));
            unknown_constraint_refs.push((*constraint_ref).to_string());
        } else if let Some(value) = values.first().filter(|_| valid) {
            accepted.push((*constraint, *value));
        } else if !valid {
            blockers.push(blocker(
                VendorChangeReviewBlockerKind::EvaluationNotCurrent,
                Some(change.change_id.clone()),
                Some(option_ref.clone()),
                values
                    .iter()
                    .map(|value| value.evaluation_id.clone())
                    .collect(),
            ));
            unknown_constraint_refs.push((*constraint_ref).to_string());
        } else {
            unknown_constraint_refs.push((*constraint_ref).to_string());
        }
    }
    unknown_constraint_refs.sort();
    unknown_constraint_refs.dedup();
    accepted.sort_by(|left, right| left.1.evaluation_id.cmp(&right.1.evaluation_id));
    let constraint_fit = aggregate_fit(
        accepted.iter().map(|(_, value)| &value.result),
        !unknown_constraint_refs.is_empty(),
    );
    let aesthetic = accepted
        .iter()
        .filter(|(constraint, _)| constraint.kind == ConstraintKind::AestheticPreference)
        .map(|(_, value)| &value.result)
        .collect::<Vec<_>>();
    let aesthetic_constraint_refs = constraints
        .values()
        .filter(|value| value.kind == ConstraintKind::AestheticPreference)
        .map(|value| value.constraint_id.as_str())
        .collect::<Vec<_>>();
    let aesthetic_fit = if !aesthetic_constraint_refs.is_empty() {
        aggregate_fit(
            aesthetic.into_iter(),
            aesthetic_constraint_refs.iter().any(|constraint_ref| {
                unknown_constraint_refs
                    .iter()
                    .any(|unknown| unknown == constraint_ref)
            }),
        )
    } else {
        VendorChangeFit::Unknown
    };
    let hard_conflict = accepted.iter().any(|(constraint, value)| {
        value.result == EvaluationResult::Conflict
            && constraint.strength == ConstraintStrength::Hard
    });
    let mut evaluation_refs = accepted
        .iter()
        .map(|(_, value)| value.evaluation_id.clone())
        .collect::<Vec<_>>();
    evaluation_refs.sort();
    evaluation_refs.dedup();

    (
        VendorReplacementAssessment {
            option_ref,
            change_ref: change.change_id.clone(),
            replacement: replacement.clone(),
            constraint_fit,
            aesthetic_fit,
            budget_fit: budget_fit(change, replacement, budget),
            hard_conflict,
            evaluation_refs,
            unknown_constraint_refs,
        },
        blockers,
    )
}

fn aggregate_fit<'a>(
    values: impl Iterator<Item = &'a EvaluationResult>,
    has_unknown: bool,
) -> VendorChangeFit {
    let values = values.collect::<Vec<_>>();
    if values
        .iter()
        .any(|value| **value == EvaluationResult::Conflict)
    {
        VendorChangeFit::Conflict
    } else if has_unknown
        || values.is_empty()
        || values
            .iter()
            .any(|value| **value == EvaluationResult::Unknown)
    {
        VendorChangeFit::Unknown
    } else {
        VendorChangeFit::Satisfied
    }
}

fn budget_fit(
    change: &VendorChange,
    replacement: &AnchoredTerm,
    budget: Option<&VendorChangeBudgetEvidence>,
) -> VendorChangeBudgetFit {
    let Some(budget) = budget else {
        return VendorChangeBudgetFit::Unknown;
    };
    let Some((original_currency, original)) = parse_money(&change.original_term.value) else {
        return VendorChangeBudgetFit::Unknown;
    };
    let Some((replacement_currency, replacement)) = parse_money(&replacement.value) else {
        return VendorChangeBudgetFit::Unknown;
    };
    if original_currency != replacement_currency
        || original_currency != budget.available_headroom.currency
    {
        return VendorChangeBudgetFit::Unknown;
    }
    let Some(delta) = replacement.checked_sub(original) else {
        return VendorChangeBudgetFit::Unknown;
    };
    if delta <= budget.available_headroom.minimum_minor {
        VendorChangeBudgetFit::WithinBudget
    } else if delta > budget.available_headroom.maximum_minor {
        VendorChangeBudgetFit::ExceedsBudget
    } else {
        VendorChangeBudgetFit::Uncertain
    }
}

fn timing_assessment(
    change: &VendorChange,
    as_of_text: &str,
    as_of: Option<DateTime<FixedOffset>>,
    event: Option<&VendorChangeEventEvidence>,
    event_at: Option<DateTime<FixedOffset>>,
) -> VendorChangeTimingAssessment {
    let deadline = change.deadline.as_deref().and_then(parse_time);
    VendorChangeTimingAssessment {
        change_ref: change.change_id.clone(),
        as_of: as_of_text.to_string(),
        days_to_event: as_of
            .zip(event_at)
            .map(|(start, end)| calendar_days(start, end)),
        event_date_evidence_ref: event
            .filter(|_| event_at.is_some())
            .map(|value| value.source_revision_ref.clone()),
        explicit_deadline: change.deadline.clone(),
        days_to_deadline: as_of
            .zip(deadline)
            .map(|(start, end)| calendar_days(start, end)),
    }
}

fn valid_budget(value: &VendorChangeBudgetEvidence) -> bool {
    valid_ref(&value.budget_revision_ref)
        && value.available_headroom.currency.len() == 3
        && value
            .available_headroom
            .currency
            .chars()
            .all(|value| value.is_ascii_uppercase())
        && value.available_headroom.minimum_minor >= 0
        && value.available_headroom.maximum_minor >= value.available_headroom.minimum_minor
        && !value.available_headroom.evidence_refs.is_empty()
        && value
            .available_headroom
            .evidence_refs
            .iter()
            .all(|reference| valid_ref(reference))
}

fn valid_ref(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 180
        && !value.contains('@')
        && !value.chars().any(char::is_whitespace)
}

fn parse_money(value: &str) -> Option<(&str, i64)> {
    let (currency, amount) = value.split_once(':')?;
    (currency.len() == 3 && currency.chars().all(|value| value.is_ascii_uppercase()))
        .then(|| amount.parse().ok())
        .flatten()
        .map(|amount| (currency, amount))
}

fn parse_time(value: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value).ok()
}

fn calendar_days(start: DateTime<FixedOffset>, end: DateTime<FixedOffset>) -> i64 {
    end.date_naive()
        .signed_duration_since(start.date_naive())
        .num_days()
}

fn blocker(
    kind: VendorChangeReviewBlockerKind,
    change_ref: Option<String>,
    option_ref: Option<String>,
    mut evidence_refs: Vec<String>,
) -> VendorChangeReviewBlocker {
    evidence_refs.sort();
    evidence_refs.dedup();
    VendorChangeReviewBlocker {
        kind,
        change_ref,
        option_ref,
        evidence_refs,
    }
}

fn sort_blockers(values: &mut Vec<VendorChangeReviewBlocker>) {
    values.sort_by(|left, right| {
        format!("{:?}", left.kind)
            .cmp(&format!("{:?}", right.kind))
            .then_with(|| left.change_ref.cmp(&right.change_ref))
            .then_with(|| left.option_ref.cmp(&right.option_ref))
            .then_with(|| left.evidence_refs.cmp(&right.evidence_refs))
    });
    values.dedup();
}

fn stable_id(prefix: &str, value: &serde_json::Value) -> String {
    let canonical = crate::crypto::canonical_json_string(value);
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    format!("{prefix}:{}", &digest[..32])
}
