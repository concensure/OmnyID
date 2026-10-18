use serde::de::DeserializeOwned;
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::contracts::*;

pub fn parse_planning_contract(value: Value) -> Result<PlanningContract, String> {
    let schema_version = value
        .get("schema_version")
        .and_then(Value::as_str)
        .ok_or_else(|| "schema_version is required".to_string())?;
    match schema_version {
        CONSTRAINT_SCHEMA_VERSION => {
            parse_and_validate(value, validate_constraint).map(PlanningContract::Constraint)
        }
        EVALUATION_SCHEMA_VERSION => {
            parse_and_validate(value, validate_evaluation).map(PlanningContract::Evaluation)
        }
        COST_TRADEOFF_SCHEMA_VERSION => {
            parse_and_validate(value, validate_cost_tradeoff).map(PlanningContract::CostTradeoff)
        }
        MILESTONE_SCHEMA_VERSION => {
            parse_and_validate(value, validate_milestone).map(PlanningContract::Milestone)
        }
        VENDOR_CHANGE_SCHEMA_VERSION => {
            parse_and_validate(value, validate_vendor_change).map(PlanningContract::VendorChange)
        }
        INTERVENTION_SCHEMA_VERSION => {
            parse_and_validate(value, validate_intervention).map(PlanningContract::Intervention)
        }
        _ => Err("unsupported planning contract schema_version".to_string()),
    }
}

fn parse_and_validate<T>(value: Value, validate: fn(&T) -> Result<(), String>) -> Result<T, String>
where
    T: DeserializeOwned,
{
    let parsed: T = serde_json::from_value(value).map_err(|error| error.to_string())?;
    validate(&parsed)?;
    Ok(parsed)
}

pub fn planning_contract_value(contract: &PlanningContract) -> Value {
    match contract {
        PlanningContract::Constraint(value) => serde_json::to_value(value),
        PlanningContract::Evaluation(value) => serde_json::to_value(value),
        PlanningContract::CostTradeoff(value) => serde_json::to_value(value),
        PlanningContract::Milestone(value) => serde_json::to_value(value),
        PlanningContract::VendorChange(value) => serde_json::to_value(value),
        PlanningContract::Intervention(value) => serde_json::to_value(value),
    }
    .expect("planning contracts are serializable")
}

pub fn planning_contract_fingerprint(contract: &PlanningContract) -> String {
    let value = planning_contract_value(contract);
    let canonical = crate::crypto::canonical_json_string(&value);
    hex::encode(Sha256::digest(canonical.as_bytes()))
}

pub fn validate_constraint(value: &PlanningConstraint) -> Result<(), String> {
    schema(value.schema_version.as_str(), CONSTRAINT_SCHEMA_VERSION)?;
    identifier(&value.constraint_id, "constraint_id")?;
    identifier(&value.template_id, "template_id")?;
    identifier(&value.plan_id, "plan_id")?;
    subject(&value.subject_ref)?;
    identifier(&value.source_ref, "source_ref")?;
    anchor(&value.source_anchor)?;
    timestamp(&value.observed_at, "observed_at")?;
    constraint_value(&value.value)?;
    if let Some(window) = &value.effective_window {
        optional_timestamp(window.starts_at.as_deref(), "effective_window.starts_at")?;
        optional_timestamp(window.ends_at.as_deref(), "effective_window.ends_at")?;
        if window.starts_at.is_none() && window.ends_at.is_none() {
            return Err("effective_window must include a boundary".to_string());
        }
    }
    if matches!(value.status, ConstraintStatus::Proposed)
        && matches!(value.authority, ConstraintAuthority::User)
    {
        return Err("user authority cannot be attached to an unconfirmed proposal".to_string());
    }
    if matches!(
        value.authority,
        ConstraintAuthority::Imported | ConstraintAuthority::Deterministic
    ) && !matches!(value.status, ConstraintStatus::Proposed)
    {
        return Err("imported or deterministic constraints must remain proposed".to_string());
    }
    if matches!(
        value.status,
        ConstraintStatus::Superseded | ConstraintStatus::Removed
    ) && value.supersedes.is_none()
    {
        return Err("superseded and removed constraints require a predecessor".to_string());
    }
    if matches!(value.status, ConstraintStatus::Proposed) && value.supersedes.is_some() {
        return Err("proposed constraints cannot supersede confirmed history".to_string());
    }
    if let Some(previous) = &value.supersedes {
        identifier(previous, "supersedes")?;
        if previous == &value.constraint_id {
            return Err("constraint cannot supersede itself".to_string());
        }
    }
    Ok(())
}

pub fn validate_constraint_ingress(
    value: &PlanningConstraint,
    authenticated_plan_id: &str,
    user_authority: bool,
) -> Result<(), String> {
    validate_constraint(value)?;
    if value.plan_id != authenticated_plan_id {
        return Err("plan authority mismatch".to_string());
    }
    if !user_authority
        && (matches!(
            value.authority,
            ConstraintAuthority::User | ConstraintAuthority::ConfirmedInterpretation
        ) || !matches!(value.status, ConstraintStatus::Proposed))
    {
        return Err("client payload cannot claim confirmation authority".to_string());
    }
    Ok(())
}

pub fn validate_constraint_successor(
    previous: &PlanningConstraint,
    successor: &PlanningConstraint,
    user_authority: bool,
) -> Result<(), String> {
    validate_constraint(successor)?;
    if successor.plan_id != previous.plan_id
        || successor.template_id != previous.template_id
        || successor.supersedes.as_deref() != Some(previous.constraint_id.as_str())
    {
        return Err("successor lineage mismatch".to_string());
    }
    if !user_authority
        && (successor.privacy < previous.privacy || successor.authority > previous.authority)
    {
        return Err("client payload cannot relax privacy or escalate authority".to_string());
    }
    Ok(())
}

pub fn validate_evaluation(value: &ConstraintEvaluation) -> Result<(), String> {
    schema(value.schema_version.as_str(), EVALUATION_SCHEMA_VERSION)?;
    for (field, id) in [
        ("evaluation_id", &value.evaluation_id),
        ("constraint_ref", &value.constraint_ref),
        ("candidate_ref", &value.candidate_ref),
        ("constraint_evidence_ref", &value.constraint_evidence_ref),
    ] {
        identifier(id, field)?;
    }
    optional_identifier(
        value.candidate_evidence_ref.as_deref(),
        "candidate_evidence_ref",
    )?;
    timestamp(&value.evaluated_at, "evaluated_at")?;
    let decisive = matches!(
        value.result,
        EvaluationResult::Satisfied | EvaluationResult::Conflict
    );
    if decisive != value.candidate_evidence_ref.is_some() {
        return Err(
            "satisfied or conflict requires candidate evidence; unknown cannot claim it"
                .to_string(),
        );
    }
    if matches!(value.result, EvaluationResult::Unknown)
        != matches!(
            value.explanation_code,
            EvaluationExplanationCode::EvidenceMissing
        )
    {
        return Err("unknown evaluations require evidence_missing".to_string());
    }
    Ok(())
}

pub fn validate_cost_tradeoff(value: &CostTradeoff) -> Result<(), String> {
    schema(value.schema_version.as_str(), COST_TRADEOFF_SCHEMA_VERSION)?;
    identifier(&value.tradeoff_id, "tradeoff_id")?;
    identifier(&value.candidate_decision_ref, "candidate_decision_ref")?;
    known_money(&value.incremental_cost)?;
    if let Some(range) = &value.forecast_before {
        money_range(range)?;
    }
    if let Some(range) = &value.forecast_after {
        money_range(range)?;
    }
    bounded_len(value.offset_options.len(), 20, "offset_options")?;
    bounded_len(value.unknown_cost_drivers.len(), 50, "unknown_cost_drivers")?;
    bounded_len(value.assumptions.len(), 20, "assumptions")?;
    for option in &value.offset_options {
        identifier(&option.option_id, "offset_options.option_id")?;
        identifier(&option.category_ref, "offset_options.category_ref")?;
        money_range(&option.saving_range)?;
        references(&option.evidence_refs, 20, "offset_options.evidence_refs")?;
    }
    references(&value.unknown_cost_drivers, 50, "unknown_cost_drivers")?;
    Ok(())
}

pub fn validate_milestone(value: &MilestoneDependency) -> Result<(), String> {
    schema(value.schema_version.as_str(), MILESTONE_SCHEMA_VERSION)?;
    identifier(&value.milestone_id, "milestone_id")?;
    identifier(&value.plan_id, "plan_id")?;
    references(&value.depends_on, 100, "depends_on")?;
    references(&value.blocking_refs, 100, "blocking_refs")?;
    if value.depends_on.iter().any(|id| id == &value.milestone_id) {
        return Err("milestone cannot depend on itself".to_string());
    }
    if let Some(duration) = &value.duration_or_lead_time {
        if duration.minimum_days > duration.maximum_days || duration.maximum_days > 3_650 {
            return Err("invalid duration_or_lead_time".to_string());
        }
        identifier(&duration.evidence_ref, "duration_or_lead_time.evidence_ref")?;
    }
    optional_timestamp(value.earliest_at.as_deref(), "earliest_at")?;
    optional_timestamp(value.latest_at.as_deref(), "latest_at")?;
    if value.slack_days.is_some() && (value.earliest_at.is_none() || value.latest_at.is_none()) {
        return Err("slack requires derived date bounds".to_string());
    }
    if let Some(action) = &value.prepared_next_action {
        prepared_action(action)?;
    }
    Ok(())
}

pub fn validate_vendor_change(value: &VendorChange) -> Result<(), String> {
    schema(value.schema_version.as_str(), VENDOR_CHANGE_SCHEMA_VERSION)?;
    for (field, id) in [
        ("change_id", &value.change_id),
        ("response_ref", &value.response_ref),
        ("affected_object_ref", &value.affected_object_ref),
    ] {
        identifier(id, field)?;
    }
    anchored_term(&value.original_term)?;
    bounded_len(value.replacement_options.len(), 20, "replacement_options")?;
    for option in &value.replacement_options {
        anchored_term(option)?;
    }
    known_money(&value.cost_delta)?;
    optional_timestamp(value.deadline.as_deref(), "deadline")?;
    if !value.requires_user_decision && !value.replacement_options.is_empty() {
        return Err("replacement options require a user decision".to_string());
    }
    Ok(())
}

pub fn validate_intervention(value: &DecisionIntervention) -> Result<(), String> {
    schema(value.schema_version.as_str(), INTERVENTION_SCHEMA_VERSION)?;
    identifier(&value.intervention_id, "intervention_id")?;
    identifier(&value.decision_ref, "decision_ref")?;
    if value.options.is_empty() || value.options.len() > 12 {
        return Err("intervention requires 1 to 12 options".to_string());
    }
    bounded_len(value.reason_codes.len(), 10, "reason_codes")?;
    references(&value.unknown_codes, 30, "unknown_codes")?;
    references(
        &value.consequence_summary_codes,
        30,
        "consequence_summary_codes",
    )?;
    let mut option_ids = std::collections::HashSet::new();
    for option in &value.options {
        identifier(&option.option_id, "options.option_id")?;
        bounded_text(&option.label, 1, 180, "options.label")?;
        references(&option.consequence_codes, 30, "options.consequence_codes")?;
        references(&option.evidence_refs, 30, "options.evidence_refs")?;
        if !option_ids.insert(option.option_id.as_str()) {
            return Err("option ids must be unique".to_string());
        }
    }
    if let Some(recommended) = &value.recommended_option_id {
        identifier(recommended, "recommended_option_id")?;
        if !option_ids.contains(recommended.as_str()) {
            return Err("recommended option must be present".to_string());
        }
        if value.reason_codes.is_empty()
            || value
                .options
                .iter()
                .all(|option| option.evidence_refs.is_empty())
        {
            return Err("recommendation requires reason and evidence".to_string());
        }
    }
    if let Some(action) = &value.prepared_next_action {
        prepared_action(action)?;
    }
    Ok(())
}

fn constraint_value(value: &ConstraintValue) -> Result<(), String> {
    match value {
        ConstraintValue::Boolean { .. } => Ok(()),
        ConstraintValue::Integer { unit, .. } => optional_code(unit.as_deref(), "value.unit"),
        ConstraintValue::IntegerRange {
            minimum,
            maximum,
            unit,
        } => {
            if minimum.is_none() && maximum.is_none() {
                return Err("integer range requires a bound".to_string());
            }
            if minimum.zip(*maximum).is_some_and(|(min, max)| min > max) {
                return Err("integer range minimum exceeds maximum".to_string());
            }
            optional_code(unit.as_deref(), "value.unit")
        }
        ConstraintValue::Enum { value, vocabulary } => {
            code(value, "value.value")?;
            code(vocabulary, "value.vocabulary")
        }
        ConstraintValue::Reference { value } => subject(value),
        ConstraintValue::ReferenceList { values } => {
            bounded_len(values.len(), 50, "value.values")?;
            if values.is_empty() {
                return Err("reference list cannot be empty".to_string());
            }
            for value in values {
                subject(value)?;
            }
            Ok(())
        }
        ConstraintValue::EnumList { values, vocabulary } => {
            bounded_len(values.len(), 50, "value.values")?;
            if values.is_empty() {
                return Err("enum list cannot be empty".to_string());
            }
            code(vocabulary, "value.vocabulary")?;
            for value in values {
                code(value, "value.values")?;
            }
            Ok(())
        }
    }
}

fn subject(value: &SubjectReference) -> Result<(), String> {
    identifier(&value.id, "subject_ref.id")
}
fn anchor(value: &SourceAnchor) -> Result<(), String> {
    identifier(&value.message_id, "source_anchor.message_id")?;
    optional_identifier(
        value.source_version_id.as_deref(),
        "source_anchor.source_version_id",
    )?;
    bounded_text(&value.locator, 1, 500, "source_anchor.locator")?;
    bounded_text(
        &value.exact_excerpt,
        1,
        2_000,
        "source_anchor.exact_excerpt",
    )
}
fn anchored_term(value: &AnchoredTerm) -> Result<(), String> {
    bounded_text(&value.value, 1, 2_000, "anchored_term.value")?;
    anchor(&value.source_anchor)
}
fn known_money(value: &KnownMoney) -> Result<(), String> {
    if let KnownMoney::Exact {
        amount,
        evidence_ref,
    } = value
    {
        money(amount)?;
        identifier(evidence_ref, "money.evidence_ref")?;
    }
    Ok(())
}
fn money(value: &Money) -> Result<(), String> {
    if value.amount_minor < 0
        || value.currency.len() != 3
        || !value.currency.chars().all(|c| c.is_ascii_uppercase())
    {
        return Err("invalid money".to_string());
    }
    Ok(())
}
fn money_range(value: &MoneyRange) -> Result<(), String> {
    if value.minimum_minor < 0 || value.minimum_minor > value.maximum_minor {
        return Err("invalid money range".to_string());
    }
    money(&Money {
        amount_minor: value.maximum_minor,
        currency: value.currency.clone(),
    })?;
    references(&value.evidence_refs, 20, "money_range.evidence_refs")?;
    if value.evidence_refs.is_empty() {
        return Err("money range requires evidence".to_string());
    }
    Ok(())
}
fn prepared_action(value: &PreparedAction) -> Result<(), String> {
    identifier(&value.target_ref, "prepared_next_action.target_ref")
}
fn references(values: &[String], maximum: usize, field: &str) -> Result<(), String> {
    bounded_len(values.len(), maximum, field)?;
    for value in values {
        identifier(value, field)?;
    }
    Ok(())
}
fn schema(actual: &str, expected: &str) -> Result<(), String> {
    (actual == expected)
        .then_some(())
        .ok_or_else(|| format!("schema_version must be {expected}"))
}
fn identifier(value: &str, field: &str) -> Result<(), String> {
    bounded_text(value, 1, 180, field)?;
    if value.contains('@') || value.chars().any(char::is_whitespace) {
        return Err(format!("{field} must be an opaque reference"));
    }
    Ok(())
}
fn optional_identifier(value: Option<&str>, field: &str) -> Result<(), String> {
    value.map_or(Ok(()), |value| identifier(value, field))
}
fn code(value: &str, field: &str) -> Result<(), String> {
    bounded_text(value, 1, 100, field)?;
    if !value.chars().all(|character| {
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || matches!(character, '_' | '-' | '.')
    }) {
        return Err(format!("{field} must be a vocabulary token"));
    }
    Ok(())
}
fn optional_code(value: Option<&str>, field: &str) -> Result<(), String> {
    value.map_or(Ok(()), |value| code(value, field))
}
fn timestamp(value: &str, field: &str) -> Result<(), String> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|_| ())
        .map_err(|_| format!("{field} must be RFC3339"))
}
fn optional_timestamp(value: Option<&str>, field: &str) -> Result<(), String> {
    value.map_or(Ok(()), |value| timestamp(value, field))
}
fn bounded_text(value: &str, minimum: usize, maximum: usize, field: &str) -> Result<(), String> {
    let length = value.chars().count();
    if length < minimum || length > maximum || value.chars().any(char::is_control) {
        return Err(format!("{field} is outside its bounded text policy"));
    }
    Ok(())
}
fn bounded_len(length: usize, maximum: usize, field: &str) -> Result<(), String> {
    (length <= maximum)
        .then_some(())
        .ok_or_else(|| format!("{field} exceeds {maximum} items"))
}
