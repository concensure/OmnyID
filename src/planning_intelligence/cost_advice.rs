use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    COST_TRADEOFF_SCHEMA_VERSION, ConstraintKind, ConstraintStatus, ConstraintValue,
    CostAssumptionCode, CostTradeoff, KnownMoney, Money, MoneyRange, OffsetOption,
    PlanningConstraint, PriorityImpact, validate_constraint, validate_cost_tradeoff,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CategoryCostState {
    Contracted,
    Quoted,
    Allowance,
    Uncontracted,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OffsetEvidenceKind {
    CurrentPackage,
    CurrentAllowance,
    CurrentRange,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case", deny_unknown_fields)]
pub enum CandidateCostEstimate {
    Exact {
        amount_minor: i64,
        currency: String,
        evidence_ref: String,
    },
    Range {
        minimum_minor: i64,
        maximum_minor: i64,
        currency: String,
        evidence_refs: Vec<String>,
    },
    Unknown {
        driver_refs: Vec<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CategoryCostEvidence {
    pub category_ref: String,
    pub state: CategoryCostState,
    pub source_revision_ref: String,
    pub offset_kind: Option<OffsetEvidenceKind>,
    pub saving_range: Option<MoneyRange>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UnresolvedCostDriver {
    pub driver_ref: String,
    pub source_revision_ref: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CostAdviceInput {
    pub candidate_decision_ref: String,
    pub candidate_revision_ref: String,
    pub candidate_category_ref: String,
    pub budget_revision_ref: String,
    pub currency: String,
    pub budget_target: MoneyRange,
    pub forecast_before: MoneyRange,
    pub candidate_cost: CandidateCostEstimate,
    pub categories: Vec<CategoryCostEvidence>,
    pub unresolved_fee_drivers: Vec<UnresolvedCostDriver>,
    pub current_source_revision_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CostAdviceBindings {
    pub candidate_revision_ref: String,
    pub budget_revision_ref: String,
    pub constraint_revision_refs: Vec<String>,
    pub source_revision_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CostTradeoffAdvice {
    pub tradeoff: CostTradeoff,
    pub bindings: CostAdviceBindings,
    pub uncontracted_category_refs: Vec<String>,
    pub unresolved_fee_driver_refs: Vec<String>,
    pub exceeds_budget: bool,
    pub requires_acknowledgement: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CurrentCostAdviceRevisions<'a> {
    pub candidate_revision_ref: &'a str,
    pub budget_revision_ref: &'a str,
    pub constraint_revision_refs: &'a [String],
    pub source_revision_refs: &'a [String],
}

pub fn build_cost_tradeoff_advice(
    input: &CostAdviceInput,
    constraints: &[PlanningConstraint],
) -> Result<CostTradeoffAdvice, String> {
    validate_input(input)?;
    let (priority_by_category, constraint_revision_refs) = category_priorities(constraints)?;
    let current_sources = input
        .current_source_revision_refs
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let candidate_range = candidate_range(&input.candidate_cost, &input.currency)?;
    let forecast_after = candidate_range
        .as_ref()
        .map(|range| add_ranges(&input.forecast_before, range))
        .transpose()?;
    let incremental_cost = match &input.candidate_cost {
        CandidateCostEstimate::Exact {
            amount_minor,
            currency,
            evidence_ref,
        } => KnownMoney::Exact {
            amount: Money {
                amount_minor: *amount_minor,
                currency: currency.clone(),
            },
            evidence_ref: evidence_ref.clone(),
        },
        CandidateCostEstimate::Range { .. } | CandidateCostEstimate::Unknown { .. } => {
            KnownMoney::Unknown
        }
    };

    let mut uncontracted_category_refs = input
        .categories
        .iter()
        .filter(|category| {
            category.state == CategoryCostState::Uncontracted
                && current_sources.contains(category.source_revision_ref.as_str())
        })
        .map(|category| category.category_ref.clone())
        .collect::<Vec<_>>();
    sort_dedup(&mut uncontracted_category_refs);
    let mut unresolved_fee_driver_refs = input
        .unresolved_fee_drivers
        .iter()
        .filter(|driver| current_sources.contains(driver.source_revision_ref.as_str()))
        .map(|driver| driver.driver_ref.clone())
        .collect::<Vec<_>>();
    if let CandidateCostEstimate::Unknown { driver_refs } = &input.candidate_cost {
        unresolved_fee_driver_refs.extend(driver_refs.iter().cloned());
    }
    sort_dedup(&mut unresolved_fee_driver_refs);

    let mut offsets = input
        .categories
        .iter()
        .filter(|category| category.state != CategoryCostState::Contracted)
        .filter(|category| current_sources.contains(category.source_revision_ref.as_str()))
        .filter_map(|category| {
            let range = category.saving_range.as_ref()?;
            category.offset_kind.as_ref()?;
            if range.evidence_refs.is_empty() || range.currency != input.currency {
                return None;
            }
            let mut saving_range = range.clone();
            saving_range
                .evidence_refs
                .push(category.source_revision_ref.clone());
            sort_dedup(&mut saving_range.evidence_refs);
            Some((
                category.category_ref.clone(),
                priority_by_category.get(&category.category_ref).copied(),
                OffsetOption {
                    option_id: stable_id(
                        "cost_offset",
                        &serde_json::json!({
                            "candidate_revision_ref": input.candidate_revision_ref,
                            "budget_revision_ref": input.budget_revision_ref,
                            "category_ref": category.category_ref,
                            "source_revision_ref": category.source_revision_ref,
                            "saving_range": saving_range,
                        }),
                    ),
                    category_ref: category.category_ref.clone(),
                    saving_range: saving_range.clone(),
                    evidence_refs: saving_range.evidence_refs.clone(),
                },
            ))
        })
        .collect::<Vec<_>>();
    offsets.sort_by(|left, right| {
        offset_priority_key(left.1, &left.0).cmp(&offset_priority_key(right.1, &right.0))
    });
    let offset_options = offsets
        .iter()
        .map(|(_, _, option)| option.clone())
        .take(20)
        .collect::<Vec<_>>();

    let priority_impact = priority_impact(
        priority_by_category
            .get(&input.candidate_category_ref)
            .copied(),
        &offsets,
    );
    let exceeds_budget = forecast_after
        .as_ref()
        .is_some_and(|after| after.maximum_minor > input.budget_target.maximum_minor)
        || input.forecast_before.maximum_minor > input.budget_target.maximum_minor;
    let mut unknown_cost_drivers = unresolved_fee_driver_refs.clone();
    unknown_cost_drivers.extend(uncontracted_category_refs.iter().cloned());
    sort_dedup(&mut unknown_cost_drivers);
    let assumptions = assumptions(input, &offset_options);
    let mut source_revision_refs = input.current_source_revision_refs.clone();
    sort_dedup(&mut source_revision_refs);
    let tradeoff_id = stable_id(
        "cost_tradeoff",
        &serde_json::json!({
            "candidate_decision_ref": input.candidate_decision_ref,
            "candidate_revision_ref": input.candidate_revision_ref,
            "budget_revision_ref": input.budget_revision_ref,
            "constraint_revision_refs": constraint_revision_refs,
            "source_revision_refs": source_revision_refs,
            "forecast_before": input.forecast_before,
            "forecast_after": forecast_after,
            "offset_options": offset_options,
            "unknown_cost_drivers": unknown_cost_drivers,
        }),
    );
    let tradeoff = CostTradeoff {
        schema_version: COST_TRADEOFF_SCHEMA_VERSION.to_string(),
        tradeoff_id,
        candidate_decision_ref: input.candidate_decision_ref.clone(),
        incremental_cost,
        forecast_before: Some(input.forecast_before.clone()),
        forecast_after,
        offset_options,
        priority_impact,
        unknown_cost_drivers,
        assumptions,
    };
    validate_cost_tradeoff(&tradeoff)?;
    Ok(CostTradeoffAdvice {
        tradeoff,
        bindings: CostAdviceBindings {
            candidate_revision_ref: input.candidate_revision_ref.clone(),
            budget_revision_ref: input.budget_revision_ref.clone(),
            constraint_revision_refs,
            source_revision_refs,
        },
        uncontracted_category_refs,
        unresolved_fee_driver_refs,
        exceeds_budget,
        requires_acknowledgement: exceeds_budget,
    })
}

pub fn cost_tradeoff_advice_is_current(
    advice: &CostTradeoffAdvice,
    current: &CurrentCostAdviceRevisions<'_>,
) -> bool {
    let mut constraints = current.constraint_revision_refs.to_vec();
    let mut sources = current.source_revision_refs.to_vec();
    sort_dedup(&mut constraints);
    sort_dedup(&mut sources);
    advice.bindings.candidate_revision_ref == current.candidate_revision_ref
        && advice.bindings.budget_revision_ref == current.budget_revision_ref
        && advice.bindings.constraint_revision_refs == constraints
        && advice.bindings.source_revision_refs == sources
}

fn category_priorities(
    constraints: &[PlanningConstraint],
) -> Result<(BTreeMap<String, usize>, Vec<String>), String> {
    let mut candidates = constraints
        .iter()
        .filter(|constraint| {
            constraint.status == ConstraintStatus::Confirmed
                && constraint.kind == ConstraintKind::CategoryPriority
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| left.constraint_id.cmp(&right.constraint_id));
    let mut selected: Option<Vec<String>> = None;
    let mut revisions = Vec::new();
    for constraint in candidates {
        validate_constraint(constraint)?;
        let ConstraintValue::EnumList { values, .. } = &constraint.value else {
            return Err("category priority requires an ordered category list".to_string());
        };
        if values.is_empty() {
            return Err("category priority cannot be empty".to_string());
        }
        if values.iter().collect::<BTreeSet<_>>().len() != values.len() {
            return Err("category priority cannot repeat a category".to_string());
        }
        if selected.as_ref().is_some_and(|existing| existing != values) {
            return Err("active category priority constraints conflict".to_string());
        }
        selected = Some(values.clone());
        revisions.push(constraint.constraint_id.clone());
    }
    let priorities = selected
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, category)| (category, index))
        .collect();
    Ok((priorities, revisions))
}

fn candidate_range(
    estimate: &CandidateCostEstimate,
    expected_currency: &str,
) -> Result<Option<MoneyRange>, String> {
    match estimate {
        CandidateCostEstimate::Exact {
            amount_minor,
            currency,
            evidence_ref,
        } => {
            validate_amount(*amount_minor, currency, expected_currency)?;
            identifier(evidence_ref, "candidate evidence_ref")?;
            Ok(Some(MoneyRange {
                minimum_minor: *amount_minor,
                maximum_minor: *amount_minor,
                currency: currency.clone(),
                evidence_refs: vec![evidence_ref.clone()],
            }))
        }
        CandidateCostEstimate::Range {
            minimum_minor,
            maximum_minor,
            currency,
            evidence_refs,
        } => {
            validate_range(*minimum_minor, *maximum_minor, currency, expected_currency)?;
            references(evidence_refs, "candidate evidence_refs")?;
            require_references(evidence_refs, "candidate evidence_refs")?;
            Ok(Some(MoneyRange {
                minimum_minor: *minimum_minor,
                maximum_minor: *maximum_minor,
                currency: currency.clone(),
                evidence_refs: evidence_refs.clone(),
            }))
        }
        CandidateCostEstimate::Unknown { driver_refs } => {
            references(driver_refs, "candidate unknown driver_refs")?;
            require_references(driver_refs, "candidate unknown driver_refs")?;
            Ok(None)
        }
    }
}

fn validate_input(input: &CostAdviceInput) -> Result<(), String> {
    for (label, value) in [
        (
            "candidate_decision_ref",
            input.candidate_decision_ref.as_str(),
        ),
        (
            "candidate_revision_ref",
            input.candidate_revision_ref.as_str(),
        ),
        (
            "candidate_category_ref",
            input.candidate_category_ref.as_str(),
        ),
        ("budget_revision_ref", input.budget_revision_ref.as_str()),
    ] {
        identifier(value, label)?;
    }
    if input.currency.len() != 3
        || !input
            .currency
            .chars()
            .all(|value| value.is_ascii_uppercase())
    {
        return Err("advice currency is invalid".to_string());
    }
    validate_money_range(&input.budget_target, &input.currency)?;
    validate_money_range(&input.forecast_before, &input.currency)?;
    require_references(&input.budget_target.evidence_refs, "budget target evidence")?;
    require_references(&input.forecast_before.evidence_refs, "forecast evidence")?;
    references(
        &input.current_source_revision_refs,
        "current source revisions",
    )?;
    if input.categories.len() > 100 {
        return Err("cost advice supports at most 100 categories".to_string());
    }
    let mut categories = BTreeSet::new();
    for category in &input.categories {
        identifier(&category.category_ref, "category_ref")?;
        identifier(&category.source_revision_ref, "source_revision_ref")?;
        if !categories.insert(category.category_ref.as_str()) {
            return Err("category cost evidence is duplicated".to_string());
        }
        match (&category.saving_range, &category.offset_kind) {
            (Some(range), Some(_)) => validate_money_range(range, &input.currency)?,
            (None, None) => {}
            _ => return Err("offset range and kind must be supplied together".to_string()),
        }
    }
    if input.unresolved_fee_drivers.len() > 100 {
        return Err("cost advice supports at most 100 unresolved fee drivers".to_string());
    }
    let mut drivers = BTreeSet::new();
    for driver in &input.unresolved_fee_drivers {
        identifier(&driver.driver_ref, "unresolved fee driver_ref")?;
        identifier(
            &driver.source_revision_ref,
            "unresolved fee source_revision_ref",
        )?;
        if !drivers.insert(driver.driver_ref.as_str()) {
            return Err("unresolved fee driver is duplicated".to_string());
        }
    }
    Ok(())
}

fn validate_money_range(range: &MoneyRange, expected_currency: &str) -> Result<(), String> {
    validate_range(
        range.minimum_minor,
        range.maximum_minor,
        &range.currency,
        expected_currency,
    )?;
    references(&range.evidence_refs, "money range evidence")
}

fn validate_range(
    minimum: i64,
    maximum: i64,
    currency: &str,
    expected_currency: &str,
) -> Result<(), String> {
    if minimum < 0 || maximum < minimum || currency != expected_currency {
        return Err("money range or currency is invalid".to_string());
    }
    Ok(())
}

fn validate_amount(amount: i64, currency: &str, expected_currency: &str) -> Result<(), String> {
    validate_range(amount, amount, currency, expected_currency)
}

fn add_ranges(left: &MoneyRange, right: &MoneyRange) -> Result<MoneyRange, String> {
    if left.currency != right.currency {
        return Err("cannot combine different currencies".to_string());
    }
    let minimum_minor = left
        .minimum_minor
        .checked_add(right.minimum_minor)
        .ok_or_else(|| "cost forecast overflow".to_string())?;
    let maximum_minor = left
        .maximum_minor
        .checked_add(right.maximum_minor)
        .ok_or_else(|| "cost forecast overflow".to_string())?;
    let mut evidence_refs = left.evidence_refs.clone();
    evidence_refs.extend(right.evidence_refs.iter().cloned());
    sort_dedup(&mut evidence_refs);
    Ok(MoneyRange {
        minimum_minor,
        maximum_minor,
        currency: left.currency.clone(),
        evidence_refs,
    })
}

fn offset_priority_key(priority: Option<usize>, category_ref: &str) -> (u8, usize, &str) {
    match priority {
        None => (0, 0, category_ref),
        Some(priority) => (1, usize::MAX - priority, category_ref),
    }
}

fn priority_impact(
    candidate_priority: Option<usize>,
    offsets: &[(String, Option<usize>, OffsetOption)],
) -> PriorityImpact {
    let Some(candidate_priority) = candidate_priority else {
        return PriorityImpact::Unknown;
    };
    if offsets.iter().any(|(_, offset_priority, _)| {
        offset_priority.is_some_and(|value| value < candidate_priority)
    }) {
        PriorityImpact::Reduced
    } else {
        PriorityImpact::Preserved
    }
}

fn assumptions(input: &CostAdviceInput, offsets: &[OffsetOption]) -> Vec<CostAssumptionCode> {
    let mut values = Vec::new();
    if !matches!(input.candidate_cost, CandidateCostEstimate::Unknown { .. }) {
        values.push(CostAssumptionCode::CurrentQuote);
    }
    if matches!(input.candidate_cost, CandidateCostEstimate::Range { .. }) {
        values.push(CostAssumptionCode::ConservativeRange);
    }
    if input.categories.iter().any(|category| {
        category.state == CategoryCostState::Allowance
            && offsets
                .iter()
                .any(|offset| offset.category_ref == category.category_ref)
    }) {
        values.push(CostAssumptionCode::CategoryAllowance);
    }
    if input
        .unresolved_fee_drivers
        .iter()
        .any(|value| value.driver_ref.contains("quantity"))
    {
        values.push(CostAssumptionCode::QuantityUnconfirmed);
    }
    if input
        .unresolved_fee_drivers
        .iter()
        .any(|value| value.driver_ref.contains("tax"))
    {
        values.push(CostAssumptionCode::TaxUnconfirmed);
    }
    values
}

fn identifier(value: &str, label: &str) -> Result<(), String> {
    (!value.is_empty()
        && value.len() <= 180
        && !value.contains('@')
        && !value.chars().any(char::is_whitespace))
    .then_some(())
    .ok_or_else(|| format!("{label} is invalid"))
}

fn references(values: &[String], label: &str) -> Result<(), String> {
    if values.len() > 100 {
        return Err(format!("{label} is too large"));
    }
    for value in values {
        identifier(value, label)?;
    }
    Ok(())
}

fn require_references(values: &[String], label: &str) -> Result<(), String> {
    if values.is_empty() {
        return Err(format!("{label} cannot be empty"));
    }
    Ok(())
}

fn sort_dedup(values: &mut Vec<String>) {
    values.sort();
    values.dedup();
}

fn stable_id(prefix: &str, value: &serde_json::Value) -> String {
    let canonical = crate::crypto::canonical_json_string(value);
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    format!("{prefix}:{}", &digest[..32])
}
