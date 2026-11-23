use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    ConstraintEvaluation, ConstraintKind, ConstraintOperator, ConstraintPrivacy, ConstraintStatus,
    ConstraintStrength, ConstraintValue, EVALUATION_SCHEMA_VERSION, EvaluationExplanationCode,
    EvaluationResult, EvaluationSeverity, PlanningConstraint, validate_constraint,
    validate_constraint_value, validate_evaluation,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CandidateFactState {
    Confirmed,
    ExplicitlyAbsent,
    Actual,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CandidateEvidenceFact {
    pub kind: ConstraintKind,
    pub state: CandidateFactState,
    pub value: ConstraintValue,
    pub evidence_ref: String,
    pub candidate_revision_ref: String,
    pub aggregate_count: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CandidateEvidenceSnapshot {
    pub candidate_ref: String,
    pub revision_ref: String,
    pub observed_at: String,
    pub facts: Vec<CandidateEvidenceFact>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ConstraintEvaluationPresentation {
    pub domain: &'static str,
    pub title: String,
    pub evidence_label: String,
    pub result: EvaluationResult,
    pub severity: EvaluationSeverity,
}

pub fn evaluate_constraint_against_candidate(
    constraint: &PlanningConstraint,
    snapshot: &CandidateEvidenceSnapshot,
) -> Result<(ConstraintEvaluation, ConstraintEvaluationPresentation), String> {
    validate_constraint(constraint)?;
    validate_snapshot(snapshot)?;
    if constraint.status != ConstraintStatus::Confirmed {
        return Err("only confirmed active constraints may be evaluated".to_string());
    }

    let mut relevant = snapshot
        .facts
        .iter()
        .filter(|fact| fact.kind == constraint.kind)
        .collect::<Vec<_>>();
    relevant.sort_by(|left, right| left.evidence_ref.cmp(&right.evidence_ref));
    let mut decisive = relevant
        .iter()
        .filter_map(|fact| evaluate_fact(constraint, fact).map(|result| (*fact, result)))
        .collect::<Vec<_>>();
    decisive.sort_by(|left, right| left.0.evidence_ref.cmp(&right.0.evidence_ref));
    let has_satisfied = decisive.iter().any(|(_, result)| *result == EvaluationResult::Satisfied);
    let has_conflict = decisive.iter().any(|(_, result)| *result == EvaluationResult::Conflict);
    if has_satisfied && has_conflict {
        decisive.clear();
    }
    let (result, evidence, explanation) = if decisive.is_empty() {
        (EvaluationResult::Unknown, None, EvaluationExplanationCode::EvidenceMissing)
    } else {
        let (fact, result) = decisive[0].clone();
        let explanation = if result == EvaluationResult::Satisfied {
            EvaluationExplanationCode::ExplicitMatch
        } else {
            EvaluationExplanationCode::ExplicitConflict
        };
        (result, Some(fact), explanation)
    };
    let severity = severity_for(constraint, &result);
    let evaluation_id = evaluation_id(constraint, snapshot, &result, evidence);
    let evaluation = ConstraintEvaluation {
        schema_version: EVALUATION_SCHEMA_VERSION.to_string(),
        evaluation_id,
        constraint_ref: constraint.constraint_id.clone(),
        candidate_ref: snapshot.revision_ref.clone(),
        result: result.clone(),
        severity: severity.clone(),
        constraint_evidence_ref: constraint.source_ref.clone(),
        candidate_evidence_ref: evidence.map(|fact| fact.evidence_ref.clone()),
        explanation_code: explanation,
        evaluated_at: snapshot.observed_at.clone(),
    };
    validate_evaluation(&evaluation)?;
    let presentation = presentation_for(constraint, &evaluation, evidence);
    Ok((evaluation, presentation))
}

pub fn evaluate_active_constraints(
    constraints: &[PlanningConstraint],
    snapshot: &CandidateEvidenceSnapshot,
) -> Result<Vec<(ConstraintEvaluation, ConstraintEvaluationPresentation)>, String> {
    let mut active = constraints
        .iter()
        .filter(|constraint| constraint.status == ConstraintStatus::Confirmed)
        .collect::<Vec<_>>();
    active.sort_by(|left, right| left.constraint_id.cmp(&right.constraint_id));
    active
        .into_iter()
        .map(|constraint| evaluate_constraint_against_candidate(constraint, snapshot))
        .collect()
}

pub fn evaluation_is_current(
    evaluation: &ConstraintEvaluation,
    constraint_id: &str,
    current_revision_ref: &str,
) -> bool {
    evaluation.constraint_ref == constraint_id && evaluation.candidate_ref == current_revision_ref
}

fn validate_snapshot(snapshot: &CandidateEvidenceSnapshot) -> Result<(), String> {
    identifier(&snapshot.candidate_ref, "candidate_ref")?;
    identifier(&snapshot.revision_ref, "revision_ref")?;
    chrono::DateTime::parse_from_rfc3339(&snapshot.observed_at)
        .map_err(|_| "candidate observed_at must be RFC3339".to_string())?;
    if snapshot.facts.len() > 200 {
        return Err("candidate snapshot supports at most 200 facts".to_string());
    }
    let mut identities = std::collections::BTreeSet::new();
    for fact in &snapshot.facts {
        identifier(&fact.evidence_ref, "fact.evidence_ref")?;
        if fact.candidate_revision_ref != snapshot.revision_ref {
            return Err("candidate fact revision does not match the snapshot".to_string());
        }
        validate_constraint_value(&fact.value)?;
        if fact.aggregate_count.is_some_and(|count| count == 0 || count > 10_000) {
            return Err("candidate fact aggregate_count is invalid".to_string());
        }
        if !identities.insert(format!("{:?}:{}", fact.kind, fact.evidence_ref)) {
            return Err("candidate evidence fact is duplicated".to_string());
        }
    }
    Ok(())
}

fn identifier(value: &str, label: &str) -> Result<(), String> {
    (!value.is_empty()
        && value.len() <= 180
        && !value.contains('@')
        && !value.chars().any(char::is_whitespace))
        .then_some(())
        .ok_or_else(|| format!("{label} is invalid"))
}

fn evaluate_fact(
    constraint: &PlanningConstraint,
    fact: &CandidateEvidenceFact,
) -> Option<EvaluationResult> {
    if matches!(constraint.operator, ConstraintOperator::Limits) {
        return compare_limit(&constraint.value, fact);
    }
    let matches = values_match(&constraint.value, &fact.value);
    if !matches {
        return None;
    }
    match (&constraint.operator, &fact.state) {
        (ConstraintOperator::Requires | ConstraintOperator::Relates | ConstraintOperator::Separates, CandidateFactState::Confirmed | CandidateFactState::Actual) => Some(EvaluationResult::Satisfied),
        (ConstraintOperator::Requires | ConstraintOperator::Relates | ConstraintOperator::Separates, CandidateFactState::ExplicitlyAbsent) => Some(EvaluationResult::Conflict),
        (ConstraintOperator::Excludes, CandidateFactState::Confirmed | CandidateFactState::Actual) => Some(EvaluationResult::Conflict),
        (ConstraintOperator::Excludes, CandidateFactState::ExplicitlyAbsent) => Some(EvaluationResult::Satisfied),
        (ConstraintOperator::Prefers, CandidateFactState::Confirmed | CandidateFactState::Actual) => Some(EvaluationResult::Satisfied),
        (ConstraintOperator::Prefers, CandidateFactState::ExplicitlyAbsent) => Some(EvaluationResult::Conflict),
        (ConstraintOperator::Limits, _) => None,
    }
}

fn compare_limit(constraint: &ConstraintValue, fact: &CandidateEvidenceFact) -> Option<EvaluationResult> {
    if fact.state != CandidateFactState::Actual {
        return None;
    }
    let (limit, limit_unit) = match constraint {
        ConstraintValue::Integer { value, unit } => (*value, unit.as_deref()),
        ConstraintValue::IntegerRange { maximum: Some(value), unit, .. } => (*value, unit.as_deref()),
        _ => return None,
    };
    match &fact.value {
        ConstraintValue::Integer { value, unit } if unit.as_deref() == limit_unit => {
            Some(if *value <= limit { EvaluationResult::Satisfied } else { EvaluationResult::Conflict })
        }
        ConstraintValue::IntegerRange { minimum, maximum, unit } if unit.as_deref() == limit_unit => {
            match (minimum, maximum) {
                (_, Some(maximum)) if *maximum <= limit => Some(EvaluationResult::Satisfied),
                (Some(minimum), _) if *minimum > limit => Some(EvaluationResult::Conflict),
                _ => None,
            }
        }
        _ => None,
    }
}

fn values_match(expected: &ConstraintValue, actual: &ConstraintValue) -> bool {
    match (expected, actual) {
        (ConstraintValue::Boolean { value: left }, ConstraintValue::Boolean { value: right }) => left == right,
        (ConstraintValue::Enum { value: left, vocabulary: left_vocabulary }, ConstraintValue::Enum { value: right, vocabulary: right_vocabulary }) => left == right && left_vocabulary == right_vocabulary,
        (ConstraintValue::Enum { value, vocabulary }, ConstraintValue::EnumList { values, vocabulary: actual_vocabulary }) => vocabulary == actual_vocabulary && values.contains(value),
        (ConstraintValue::Reference { value: left }, ConstraintValue::Reference { value: right }) => left == right,
        (ConstraintValue::ReferenceList { values: left }, ConstraintValue::ReferenceList { values: right }) => left.iter().all(|value| right.contains(value)),
        (ConstraintValue::EnumList { values: left, vocabulary: left_vocabulary }, ConstraintValue::EnumList { values: right, vocabulary: right_vocabulary }) => left_vocabulary == right_vocabulary && left.iter().all(|value| right.contains(value)),
        _ => false,
    }
}

fn severity_for(constraint: &PlanningConstraint, result: &EvaluationResult) -> EvaluationSeverity {
    match (&constraint.strength, result) {
        (ConstraintStrength::Hard, EvaluationResult::Conflict) => EvaluationSeverity::Blocking,
        (ConstraintStrength::Hard | ConstraintStrength::Strong, _) => EvaluationSeverity::DecisionRelevant,
        _ => EvaluationSeverity::Informational,
    }
}

fn evaluation_id(
    constraint: &PlanningConstraint,
    snapshot: &CandidateEvidenceSnapshot,
    result: &EvaluationResult,
    fact: Option<&CandidateEvidenceFact>,
) -> String {
    let canonical = crate::crypto::canonical_json_string(&serde_json::json!({
        "constraint_ref": constraint.constraint_id,
        "candidate_revision_ref": snapshot.revision_ref,
        "result": result,
        "candidate_evidence_ref": fact.map(|value| value.evidence_ref.as_str()),
        "evaluated_at": snapshot.observed_at,
    }));
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    format!("constraint_evaluation:{}", &digest[..32])
}

fn presentation_for(
    constraint: &PlanningConstraint,
    evaluation: &ConstraintEvaluation,
    fact: Option<&CandidateEvidenceFact>,
) -> ConstraintEvaluationPresentation {
    let private_people = constraint.privacy == ConstraintPrivacy::CouplePrivate;
    let evidence_label = if private_people {
        let count = fact.and_then(|value| value.aggregate_count).unwrap_or(1);
        format!("{count} private guest requirement{} checked", if count == 1 { "" } else { "s" })
    } else {
        format!("Checked {} evidence", kind_label(&constraint.kind))
    };
    let title = match evaluation.result {
        EvaluationResult::Conflict => format!("{} conflicts with this option", kind_label(&constraint.kind)),
        EvaluationResult::Satisfied => format!("{} matches this option", kind_label(&constraint.kind)),
        EvaluationResult::Unknown => format!("{} still needs checking", kind_label(&constraint.kind)),
        EvaluationResult::NotApplicable => "Requirement does not apply to this option".to_string(),
    };
    ConstraintEvaluationPresentation {
        domain: "constraint_conflict",
        title,
        evidence_label,
        result: evaluation.result.clone(),
        severity: evaluation.severity.clone(),
    }
}

fn kind_label(kind: &ConstraintKind) -> &'static str {
    match kind {
        ConstraintKind::AccessibilityRequirement => "Accessibility",
        ConstraintKind::LocationRequirement | ConstraintKind::DistanceLimit => "Travel",
        ConstraintKind::DurationLimit => "Duration",
        ConstraintKind::DimensionLimit => "Size limit",
        ConstraintKind::DietaryRequirement => "Dietary requirement",
        ConstraintKind::ServiceRequirement => "Service requirement",
        ConstraintKind::RelationshipSeparation => "Seating requirement",
        ConstraintKind::AttendanceRequirement => "Attendance requirement",
        ConstraintKind::AestheticPreference => "Style preference",
        ConstraintKind::CategoryPriority => "Category priority",
    }
}
