use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::quotation::{
    ClarificationCandidate, ClarificationContextFact, ClarificationDraft,
    build_clarification_draft, draft_hash,
};

use super::{
    ConstraintEvaluation, ConstraintKind, ConstraintStatus, DecisionIntervention, EvaluationResult,
    EvaluationSeverity, INTERVENTION_SCHEMA_VERSION, InterventionOption, InterventionReasonCode,
    PlanningConstraint, PreparedAction, PreparedActionKind, validate_constraint,
    validate_evaluation, validate_intervention,
};

const ACCEPT_OPTION: &str = "accept_conflict";
const REJECT_OPTION: &str = "reject_candidate";
const ASK_VENDOR_OPTION: &str = "ask_vendor";
const AMEND_OPTION: &str = "amend_constraint";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuotationConflictBinding {
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub comparison_revision: String,
    pub grant_revision: Option<String>,
    pub recipient: String,
    pub subject: String,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConflictInterventionBindings {
    pub constraint_ref: String,
    pub evaluation_ref: String,
    pub quotation_version_id: String,
    pub comparison_revision: String,
    pub grant_revision: Option<String>,
    pub clarification_draft_hash: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConstraintConflictIntervention {
    pub intervention: DecisionIntervention,
    pub remembered_statement: String,
    pub conflict_evidence_label: String,
    pub unknown_labels: Vec<String>,
    pub bindings: ConflictInterventionBindings,
    pub clarification_draft: ClarificationDraft,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CurrentConflictRevisions<'a> {
    pub constraint_ref: &'a str,
    pub quotation_version_id: &'a str,
    pub comparison_revision: &'a str,
    pub grant_revision: Option<&'a str>,
}

pub fn build_constraint_conflict_intervention(
    constraint: &PlanningConstraint,
    evaluation: &ConstraintEvaluation,
    conflict_evidence_label: &str,
    binding: &QuotationConflictBinding,
) -> Result<ConstraintConflictIntervention, String> {
    validate_constraint(constraint)?;
    validate_evaluation(evaluation)?;
    validate_binding(binding)?;
    if constraint.status != ConstraintStatus::Confirmed {
        return Err("only a confirmed active constraint can create an intervention".to_string());
    }
    if evaluation.result != EvaluationResult::Conflict
        || evaluation.constraint_ref != constraint.constraint_id
        || evaluation.candidate_ref != binding.quotation_version_id
    {
        return Err("intervention requires the current conflict evaluation".to_string());
    }
    let candidate_evidence_ref = evaluation
        .candidate_evidence_ref
        .as_deref()
        .ok_or_else(|| "conflict evaluation requires candidate evidence".to_string())?;
    bounded_text(conflict_evidence_label, 1, 500, "conflict evidence label")?;

    let question = vendor_question(&constraint.kind);
    let candidate = ClarificationCandidate {
        gap_code: format!("constraint_conflict.{}", kind_code(&constraint.kind)),
        line_id: Some(constraint.constraint_id.clone()),
        question,
        impact_rank: 0,
    };
    let mut context = vec![
        ClarificationContextFact {
            key: "approved_requirement.kind".to_string(),
            value: kind_label(&constraint.kind).to_string(),
        },
        ClarificationContextFact {
            key: "binding.constraint_revision".to_string(),
            value: constraint.constraint_id.clone(),
        },
        ClarificationContextFact {
            key: "binding.evaluation_revision".to_string(),
            value: evaluation.evaluation_id.clone(),
        },
    ];
    if let Some(grant_revision) = &binding.grant_revision {
        context.push(ClarificationContextFact {
            key: "binding.grant_revision".to_string(),
            value: grant_revision.clone(),
        });
    }
    let clarification_draft = build_clarification_draft(
        &binding.quotation_id,
        &binding.quotation_version_id,
        &binding.comparison_revision,
        &binding.recipient,
        &binding.subject,
        &[candidate],
        &BTreeSet::new(),
        context,
        &binding.created_at,
    )
    .map_err(|_| "could not prepare a bounded clarification draft".to_string())?;

    let evidence_refs = vec![
        constraint.source_ref.clone(),
        evaluation.evaluation_id.clone(),
        candidate_evidence_ref.to_string(),
    ];
    let options = vec![
        InterventionOption {
            option_id: REJECT_OPTION.to_string(),
            label: "Remove this option from consideration".to_string(),
            consequence_codes: vec!["candidate_rejected".to_string()],
            evidence_refs: evidence_refs.clone(),
        },
        InterventionOption {
            option_id: ASK_VENDOR_OPTION.to_string(),
            label: "Ask the vendor to clarify".to_string(),
            consequence_codes: vec!["approval_required_before_send".to_string()],
            evidence_refs: evidence_refs.clone(),
        },
        InterventionOption {
            option_id: AMEND_OPTION.to_string(),
            label: "Review the remembered requirement".to_string(),
            consequence_codes: vec!["constraint_review_required".to_string()],
            evidence_refs: vec![constraint.source_ref.clone()],
        },
        InterventionOption {
            option_id: ACCEPT_OPTION.to_string(),
            label: "Keep this option and accept the conflict".to_string(),
            consequence_codes: vec!["conflict_explicitly_accepted".to_string()],
            evidence_refs,
        },
    ];
    let mut unknown_codes = vec!["vendor_confirmation_pending".to_string()];
    let mut unknown_labels = vec!["The vendor has not confirmed this requirement yet".to_string()];
    if binding.grant_revision.is_none() {
        unknown_codes.push("vendor_grant_not_prepared".to_string());
        unknown_labels.push("Sharing permission still needs to be prepared".to_string());
    }
    let intervention_id = stable_id(
        "constraint_intervention",
        &serde_json::json!({
            "constraint_ref": constraint.constraint_id,
            "evaluation_ref": evaluation.evaluation_id,
            "quotation_version_id": binding.quotation_version_id,
            "comparison_revision": binding.comparison_revision,
            "grant_revision": binding.grant_revision,
            "clarification_draft_id": clarification_draft.draft_id,
        }),
    );
    let intervention = DecisionIntervention {
        schema_version: INTERVENTION_SCHEMA_VERSION.to_string(),
        intervention_id,
        decision_ref: evaluation.evaluation_id.clone(),
        options,
        recommended_option_id: (evaluation.severity == EvaluationSeverity::Blocking)
            .then(|| REJECT_OPTION.to_string()),
        reason_codes: vec![InterventionReasonCode::ConstraintConflict],
        unknown_codes,
        consequence_summary_codes: vec![
            "decision_appends_without_mutating_history".to_string(),
            "vendor_message_requires_separate_approval".to_string(),
        ],
        prepared_next_action: Some(PreparedAction {
            kind: PreparedActionKind::Draft,
            target_ref: clarification_draft.draft_id.clone(),
        }),
    };
    validate_intervention(&intervention)?;

    Ok(ConstraintConflictIntervention {
        intervention,
        remembered_statement: constraint.source_anchor.exact_excerpt.clone(),
        conflict_evidence_label: conflict_evidence_label.trim().to_string(),
        unknown_labels,
        bindings: ConflictInterventionBindings {
            constraint_ref: constraint.constraint_id.clone(),
            evaluation_ref: evaluation.evaluation_id.clone(),
            quotation_version_id: binding.quotation_version_id.clone(),
            comparison_revision: binding.comparison_revision.clone(),
            grant_revision: binding.grant_revision.clone(),
            clarification_draft_hash: draft_hash(&clarification_draft),
        },
        clarification_draft,
    })
}

pub fn constraint_conflict_intervention_is_current(
    projection: &ConstraintConflictIntervention,
    current: &CurrentConflictRevisions<'_>,
) -> bool {
    projection.bindings.constraint_ref == current.constraint_ref
        && projection.bindings.quotation_version_id == current.quotation_version_id
        && projection.bindings.comparison_revision == current.comparison_revision
        && projection.bindings.grant_revision.as_deref() == current.grant_revision
        && projection.bindings.clarification_draft_hash
            == draft_hash(&projection.clarification_draft)
}

fn validate_binding(binding: &QuotationConflictBinding) -> Result<(), String> {
    for (label, value) in [
        ("quotation_id", binding.quotation_id.as_str()),
        (
            "quotation_version_id",
            binding.quotation_version_id.as_str(),
        ),
        ("comparison_revision", binding.comparison_revision.as_str()),
    ] {
        identifier(value, label)?;
    }
    if let Some(grant_revision) = &binding.grant_revision {
        identifier(grant_revision, "grant_revision")?;
    }
    bounded_text(&binding.recipient, 3, 320, "recipient")?;
    bounded_text(&binding.subject, 1, 300, "subject")?;
    chrono::DateTime::parse_from_rfc3339(&binding.created_at)
        .map_err(|_| "created_at must be RFC3339".to_string())?;
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

fn bounded_text(value: &str, minimum: usize, maximum: usize, label: &str) -> Result<(), String> {
    let length = value.trim().chars().count();
    (length >= minimum && length <= maximum && !value.chars().any(char::is_control))
        .then_some(())
        .ok_or_else(|| format!("{label} is invalid"))
}

fn stable_id(prefix: &str, value: &serde_json::Value) -> String {
    let canonical = crate::crypto::canonical_json_string(value);
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    format!("{prefix}:{}", &digest[..32])
}

fn kind_code(kind: &ConstraintKind) -> &'static str {
    match kind {
        ConstraintKind::AccessibilityRequirement => "accessibility",
        ConstraintKind::LocationRequirement => "location",
        ConstraintKind::DistanceLimit => "distance",
        ConstraintKind::DurationLimit => "duration",
        ConstraintKind::DimensionLimit => "dimension",
        ConstraintKind::DietaryRequirement => "dietary",
        ConstraintKind::ServiceRequirement => "service",
        ConstraintKind::RelationshipSeparation => "relationship_separation",
        ConstraintKind::AttendanceRequirement => "attendance",
        ConstraintKind::AestheticPreference => "aesthetic",
        ConstraintKind::CategoryPriority => "category_priority",
    }
}

fn kind_label(kind: &ConstraintKind) -> &'static str {
    match kind {
        ConstraintKind::AccessibilityRequirement => "Accessibility requirement",
        ConstraintKind::LocationRequirement => "Location requirement",
        ConstraintKind::DistanceLimit => "Travel limit",
        ConstraintKind::DurationLimit => "Duration limit",
        ConstraintKind::DimensionLimit => "Dimension limit",
        ConstraintKind::DietaryRequirement => "Dietary requirement",
        ConstraintKind::ServiceRequirement => "Service requirement",
        ConstraintKind::RelationshipSeparation => "Seating separation requirement",
        ConstraintKind::AttendanceRequirement => "Attendance requirement",
        ConstraintKind::AestheticPreference => "Style preference",
        ConstraintKind::CategoryPriority => "Category priority",
    }
}

fn vendor_question(kind: &ConstraintKind) -> String {
    let detail = match kind {
        ConstraintKind::AccessibilityRequirement => "the required accessibility feature",
        ConstraintKind::LocationRequirement => "the required location",
        ConstraintKind::DistanceLimit => "the required travel limit",
        ConstraintKind::DurationLimit => "the required duration limit",
        ConstraintKind::DimensionLimit => "the required dimension limit",
        ConstraintKind::DietaryRequirement => "the required dietary needs",
        ConstraintKind::ServiceRequirement => "the required service",
        ConstraintKind::RelationshipSeparation => "the required seating separation",
        ConstraintKind::AttendanceRequirement => "the required attendance arrangement",
        ConstraintKind::AestheticPreference => "the requested style preference",
        ConstraintKind::CategoryPriority => "the stated category priority",
    };
    format!("Can you confirm whether this option can meet {detail}?")
}
