//! Reviewed deterministic transforms over a frozen private evidence packet.
//! Conclusions are review data: they never approve, send, spend, retry or publish.
use crate::{
    runbook_contract::*, runbook_evidence::EvidencePacket, runbook_validation::identifier,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransformReview {
    pub operation: TransformOperation,
    pub facts: BTreeMap<String, Value>,
    pub conclusions: Value,
}
impl std::fmt::Debug for TransformReview {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TransformReview")
            .field("operation", &self.operation)
            .field("content", &"[REDACTED]")
            .finish()
    }
}

pub fn reviewed_fields(op: TransformOperation) -> Result<&'static [&'static str]> {
    use TransformOperation::*;
    Ok(match op {
        CompareCalendarConflicts => &["event_times", "travel_buffer", "priority"],
        CompareRunsheetVersions => &[
            "previous_version_ref",
            "current_version_ref",
            "affected_viewers",
        ],
        FindQuoteGaps => &["normalised_quote_ref", "required_categories"],
        ReviewStoredQuote => &["normalised_quote_ref", "wedding_date"],
        CheckThreadReply => &["last_outbound_ref", "reply_status", "cooldown"],
        CalculateBudgetExposure => &["commitments", "category_target", "total_budget"],
        ReviewTaskDependencies => &["task_ref", "task_owner", "dependencies"],
        CheckReminderPermission => &["invitation_ref", "attendance", "reminder_permission"],
        VerifyCommitmentEvidence => &["commitment_ref", "completion_evidence"],
        AssessWorkflowRetry => &["run_ref", "error_ref", "retry_consequences"],
        ReviewImportStatus => &["file_ref", "parser_status", "quarantine_status"],
        IdentifyMissingFacts => &["required_field", "attempted_refs"],
    })
}

/// Select only reviewed facts; unrelated instructions and credential-like fields
/// never enter the result. Two different non-null values are a conflict, not an
/// invitation to choose whichever record happened to be read last.
pub fn review(
    step: &Step,
    packet: &EvidencePacket,
    answers: &BTreeMap<String, Value>,
) -> Result<TransformReview> {
    if step.kind != StepKind::Transform {
        return Err("not_a_transform_step");
    }
    let op = step.operation.ok_or("invalid_transform_operation")?;
    let fields = reviewed_fields(op)?;
    if fields.len() != step.required_fields.len()
        || fields
            .iter()
            .any(|f| !step.required_fields.iter().any(|s| s == f))
    {
        return Err("transform_required_fields_mismatch");
    }
    let mut facts = BTreeMap::new();
    for field in fields {
        let mut values = packet
            .included
            .iter()
            .filter_map(|item| item.content.get(*field))
            .filter(|v| !v.is_null())
            .cloned()
            .collect::<Vec<_>>();
        if let Some(answer) = answers.get(*field) {
            values.push(answer.clone());
        }
        let first = values.first().ok_or("missing_required_fact")?;
        if values.iter().any(|v| v != first) {
            return Err("conflicting_evidence");
        }
        facts.insert((*field).into(), first.clone());
    }
    if json!(facts).to_string().len() > 32768 {
        return Err("transform_input_too_large");
    }
    let text = |field: &str| {
        facts
            .get(field)
            .and_then(Value::as_str)
            .ok_or("invalid_transform_fact")
    };
    let boolean = |field: &str| {
        facts
            .get(field)
            .and_then(Value::as_bool)
            .ok_or("invalid_transform_fact")
    };
    let reference = |field: &str| typed_ref(text(field)?);
    use TransformOperation::*;
    let conclusions = match op {
        CheckThreadReply => {
            reference("last_outbound_ref")?;
            let status = text("reply_status")?;
            enum_value(status, &["received", "pending"])?;
            let cooldown = boolean("cooldown")?;
            json!({"review_needed":status=="pending"&&!cooldown,"send_authorized":false})
        }
        CompareCalendarConflicts => crate::runbook_schedule_review::calendar(&facts)?,
        CompareRunsheetVersions => crate::runbook_schedule_review::runsheet(&facts, packet)?,
        ReviewStoredQuote => crate::runbook_quote::review_quote(&facts, packet)?,
        FindQuoteGaps => crate::runbook_quote::review_gaps(&facts, packet)?,
        CalculateBudgetExposure => budget_exposure(&facts)?,
        ReviewTaskDependencies => {
            reference("task_ref")?;
            typed_ref(text("task_owner")?)?;
            let deps: Vec<Dependency> = serde_json::from_value(facts["dependencies"].clone())
                .map_err(|_| "invalid_dependencies")?;
            if deps.len() > 64 {
                return Err("dependency_limit");
            }
            let mut seen = BTreeSet::new();
            let mut incomplete = vec![];
            for dep in deps {
                typed_ref(&dep.reference)?;
                if !seen.insert(dep.reference.clone()) {
                    return Err("duplicate_dependency");
                }
                if !dep.completed {
                    incomplete.push(dep.reference);
                }
            }
            json!({"incomplete_dependency_refs":incomplete,"create_task_authorized":false})
        }
        CheckReminderPermission => {
            reference("invitation_ref")?;
            let attendance = text("attendance")?;
            enum_value(attendance, &["pending", "accepted", "declined"])?;
            let permission = boolean("reminder_permission")?;
            json!({"reminder_review_needed":attendance=="pending"&&permission,"send_authorized":false})
        }
        VerifyCommitmentEvidence => {
            reference("commitment_ref")?;
            let refs = references(&facts["completion_evidence"])?;
            json!({"completion_evidence_refs":refs,"completion_proven":false,"human_review_required":true})
        }
        AssessWorkflowRetry => {
            reference("run_ref")?;
            reference("error_ref")?;
            enum_value(
                text("retry_consequences")?,
                &["no_side_effect", "may_repeat_side_effect", "unknown"],
            )?;
            json!({"retry_authorized":false,"approval_required":true})
        }
        ReviewImportStatus => {
            reference("file_ref")?;
            let parser = text("parser_status")?;
            let quarantine = text("quarantine_status")?;
            enum_value(parser, &["ready", "failed", "pending"])?;
            enum_value(quarantine, &["clear", "blocked", "pending"])?;
            json!({"ready_for_review":parser=="ready"&&quarantine=="clear","release_authorized":false})
        }
        IdentifyMissingFacts => {
            if !safe_question_field(text("required_field")?) {
                return Err("invalid_required_field");
            }
            let attempted = references(&facts["attempted_refs"])?;
            json!({"missing_field":text("required_field")?,"attempted_refs":attempted,"question_required":true})
        }
    };
    Ok(TransformReview {
        operation: op,
        facts,
        conclusions,
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Dependency {
    reference: String,
    completed: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Money {
    amount_minor: u64,
    currency: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Commitment {
    reference: String,
    category: String,
    amount_minor: u64,
    currency: String,
}

fn budget_exposure(facts: &BTreeMap<String, Value>) -> Result<Value> {
    let budget: Money =
        serde_json::from_value(facts["total_budget"].clone()).map_err(|_| "invalid_budget")?;
    let targets: BTreeMap<String, Money> = serde_json::from_value(facts["category_target"].clone())
        .map_err(|_| "invalid_category_targets")?;
    let commitments: Vec<Commitment> =
        serde_json::from_value(facts["commitments"].clone()).map_err(|_| "invalid_commitments")?;
    if commitments.len() > 64
        || targets.len() > 64
        || budget.currency.len() != 3
        || !budget.currency.bytes().all(|b| b.is_ascii_uppercase())
    {
        return Err("invalid_budget_limits");
    }
    let mut totals = BTreeMap::<String, u64>::new();
    let mut seen = BTreeSet::new();
    let mut total = 0u64;
    for c in commitments {
        typed_ref(&c.reference)?;
        if !identifier(&c.category) || !seen.insert(c.reference) {
            return Err("invalid_commitment_identity");
        }
        if c.currency != budget.currency {
            return Err("mixed_budget_currency");
        }
        if !targets.contains_key(&c.category) {
            return Err("missing_category_target");
        }
        let category = totals.entry(c.category).or_default();
        *category = category
            .checked_add(c.amount_minor)
            .ok_or("budget_overflow")?;
        total = total.checked_add(c.amount_minor).ok_or("budget_overflow")?;
    }
    let mut categories = serde_json::Map::new();
    for (name, target) in targets {
        if !identifier(&name) || target.currency != budget.currency {
            return Err("mixed_budget_currency");
        }
        let amount = totals.get(&name).copied().unwrap_or(0);
        categories.insert(name,json!({"committed_minor":amount,"target_minor":target.amount_minor,"over_target":amount>target.amount_minor}));
    }
    Ok(
        json!({"currency":budget.currency,"committed_minor":total,"total_budget_minor":budget.amount_minor,
        "over_budget":total>budget.amount_minor,"categories":categories,"spend_authorized":false}),
    )
}

fn enum_value(value: &str, allowed: &[&str]) -> Result<()> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err("invalid_transform_fact")
    }
}
fn typed_ref(value: &str) -> Result<()> {
    if !identifier(value)
        || !value
            .split_once(':')
            .is_some_and(|(kind, id)| !kind.is_empty() && !id.is_empty() && !id.contains(':'))
    {
        return Err("invalid_transform_reference");
    }
    Ok(())
}
fn references(value: &Value) -> Result<Vec<String>> {
    let refs: Vec<String> =
        serde_json::from_value(value.clone()).map_err(|_| "invalid_transform_references")?;
    if refs.len() > MAX_REFS {
        return Err("transform_reference_limit");
    }
    let mut seen = BTreeSet::new();
    for r in &refs {
        typed_ref(r)?;
        if !seen.insert(r) {
            return Err("duplicate_transform_reference");
        }
    }
    Ok(refs)
}

/// Generic questions can collect ordinary planning facts, never credentials or authority.
pub(crate) fn safe_question_field(field: &str) -> bool {
    matches!(
        field,
        "priority"
            | "wedding_date"
            | "guest_count"
            | "total_budget"
            | "venue"
            | "task_owner"
            | "deadline"
    )
}
