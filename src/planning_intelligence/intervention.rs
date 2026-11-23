use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::message::AFPMessage;
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

pub const INTERVENTION_DECISION_SCHEMA_VERSION: &str = "planning.intervention_decision.v1";
pub const INTERVENTION_DECISION_MESSAGE_SCHEMA: &str = "planning.intervention_decision_message.v1";
pub const INTERVENTION_DECISION_KIND: &str = "planning_intervention_decision";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuotationConflictBinding {
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub comparison_id: String,
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
    pub comparison_id: String,
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
    pub comparison_id: &'a str,
    pub comparison_revision: &'a str,
    pub grant_revision: Option<&'a str>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InterventionDecision {
    pub schema_version: String,
    pub decision_id: String,
    pub intervention_ref: String,
    pub selected_option_id: String,
    pub bindings: ConflictInterventionBindings,
    pub prepared_clarification_draft_ref: Option<String>,
    pub decided_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InterventionDecisionEnvelope {
    pub schema_version: String,
    pub decision: InterventionDecision,
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
        ClarificationContextFact {
            key: "binding.comparison_revision".to_string(),
            value: binding.comparison_revision.clone(),
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
        &binding.comparison_id,
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
            "comparison_id": binding.comparison_id,
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
            comparison_id: binding.comparison_id.clone(),
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
        && projection.bindings.comparison_id == current.comparison_id
        && projection.bindings.comparison_revision == current.comparison_revision
        && projection.bindings.grant_revision.as_deref() == current.grant_revision
        && projection.bindings.clarification_draft_hash
            == draft_hash(&projection.clarification_draft)
}

pub fn intervention_decision_id(
    thread_id: &str,
    intervention_ref: &str,
    idempotency_key: &str,
) -> Result<String, String> {
    identifier(thread_id, "thread_id")?;
    identifier(intervention_ref, "intervention_ref")?;
    identifier(idempotency_key, "idempotency_key")?;
    let canonical = crate::crypto::canonical_json_string(&json!({
        "namespace": "planning_intervention_decision",
        "thread_id": thread_id,
        "intervention_ref": intervention_ref,
        "idempotency_key": idempotency_key,
    }));
    let digest = Sha256::digest(canonical.as_bytes());
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    Ok(ulid::Ulid::from_bytes(bytes).to_string())
}

pub fn build_intervention_decision(
    thread_id: &str,
    projection: &ConstraintConflictIntervention,
    selected_option_id: &str,
    idempotency_key: &str,
    decided_at: &str,
) -> Result<InterventionDecision, String> {
    validate_intervention(&projection.intervention)?;
    let option = projection
        .intervention
        .options
        .iter()
        .find(|option| option.option_id == selected_option_id)
        .ok_or_else(|| "selected intervention option is unavailable".to_string())?;
    identifier(&option.option_id, "selected_option_id")?;
    chrono::DateTime::parse_from_rfc3339(decided_at)
        .map_err(|_| "decided_at must be RFC3339".to_string())?;
    let decision = InterventionDecision {
        schema_version: INTERVENTION_DECISION_SCHEMA_VERSION.to_string(),
        decision_id: intervention_decision_id(
            thread_id,
            &projection.intervention.intervention_id,
            idempotency_key,
        )?,
        intervention_ref: projection.intervention.intervention_id.clone(),
        selected_option_id: option.option_id.clone(),
        bindings: projection.bindings.clone(),
        prepared_clarification_draft_ref: (option.option_id == ASK_VENDOR_OPTION)
            .then(|| projection.clarification_draft.draft_id.clone()),
        decided_at: decided_at.to_string(),
    };
    validate_intervention_decision(&decision)?;
    Ok(decision)
}

pub fn validate_intervention_decision(decision: &InterventionDecision) -> Result<(), String> {
    if decision.schema_version != INTERVENTION_DECISION_SCHEMA_VERSION {
        return Err("unsupported intervention decision schema".to_string());
    }
    for (label, value) in [
        ("decision_id", decision.decision_id.as_str()),
        ("intervention_ref", decision.intervention_ref.as_str()),
        ("selected_option_id", decision.selected_option_id.as_str()),
        ("constraint_ref", decision.bindings.constraint_ref.as_str()),
        ("evaluation_ref", decision.bindings.evaluation_ref.as_str()),
        (
            "quotation_version_id",
            decision.bindings.quotation_version_id.as_str(),
        ),
        ("comparison_id", decision.bindings.comparison_id.as_str()),
        (
            "comparison_revision",
            decision.bindings.comparison_revision.as_str(),
        ),
        (
            "clarification_draft_hash",
            decision.bindings.clarification_draft_hash.as_str(),
        ),
    ] {
        identifier(value, label)?;
    }
    if let Some(grant_revision) = &decision.bindings.grant_revision {
        identifier(grant_revision, "grant_revision")?;
    }
    if let Some(draft_ref) = &decision.prepared_clarification_draft_ref {
        identifier(draft_ref, "prepared_clarification_draft_ref")?;
        if decision.selected_option_id != ASK_VENDOR_OPTION {
            return Err("only ask_vendor may reference a clarification draft".to_string());
        }
    } else if decision.selected_option_id == ASK_VENDOR_OPTION {
        return Err("ask_vendor requires the prepared clarification draft".to_string());
    }
    chrono::DateTime::parse_from_rfc3339(&decision.decided_at)
        .map_err(|_| "decided_at must be RFC3339".to_string())?;
    Ok(())
}

pub fn intervention_decision_message(
    thread_id: &str,
    actor: &str,
    decision: &InterventionDecision,
) -> Result<AFPMessage, String> {
    validate_intervention_decision(decision)?;
    identifier(thread_id, "thread_id")?;
    bounded_text(actor, 1, 300, "actor")?;
    let envelope = InterventionDecisionEnvelope {
        schema_version: INTERVENTION_DECISION_MESSAGE_SCHEMA.to_string(),
        decision: decision.clone(),
    };
    let payload_fingerprint = canonical_fingerprint(&envelope);
    let mut references = vec![
        json!({"type": "decision_intervention", "target": decision.intervention_ref}),
        json!({"type": "planning_constraint", "target": decision.bindings.constraint_ref}),
        json!({"type": "constraint_evaluation", "target": decision.bindings.evaluation_ref}),
        json!({"type": "normalised_quotation_version", "target": decision.bindings.quotation_version_id}),
        json!({"type": "quotation_comparison", "target": decision.bindings.comparison_id}),
        json!({"type": "quotation_comparison_revision", "target": decision.bindings.comparison_revision}),
    ];
    if let Some(grant_revision) = &decision.bindings.grant_revision {
        references.push(json!({"type": "quotation_context_grant", "target": grant_revision}));
    }
    if let Some(draft_ref) = &decision.prepared_clarification_draft_ref {
        references.push(json!({"type": "clarification_draft", "target": draft_ref}));
    }
    Ok(AFPMessage {
        protocol: "afp-v1".to_string(),
        id: decision.decision_id.clone(),
        thread_id: thread_id.to_string(),
        parent_id: Some(decision.intervention_ref.clone()),
        from: actor.to_string(),
        to: vec!["agent://planning-intelligence".to_string()],
        timestamp: decision.decided_at.clone(),
        r#type: "ledger".to_string(),
        kind: Some(INTERVENTION_DECISION_KIND.to_string()),
        supertags: vec!["planning".to_string(), "decision".to_string()],
        subtype: Some(INTERVENTION_DECISION_KIND.to_string()),
        content: json!(envelope),
        metadata: Some(json!({
            "store": true,
            "payload_fingerprint": payload_fingerprint,
            "privacy_scope": "tenant_private",
            "e2ee_required": true,
            "schema_version": INTERVENTION_DECISION_MESSAGE_SCHEMA,
        })),
        signature: String::new(),
        encryption: None,
        views: Vec::new(),
        references: references.clone(),
        typed_refs: references,
        attachments: Vec::new(),
        store_in_relational: true,
        prev_hash: None,
    })
}

pub fn intervention_decision_from_message(
    message: &AFPMessage,
) -> Result<Option<InterventionDecision>, String> {
    if message.kind.as_deref() != Some(INTERVENTION_DECISION_KIND) {
        return Ok(None);
    }
    let envelope: InterventionDecisionEnvelope = serde_json::from_value(message.content.clone())
        .map_err(|_| "intervention decision envelope is invalid".to_string())?;
    if envelope.schema_version != INTERVENTION_DECISION_MESSAGE_SCHEMA {
        return Err("unsupported intervention decision message schema".to_string());
    }
    validate_intervention_decision(&envelope.decision)?;
    let fingerprint = canonical_fingerprint(&envelope);
    let metadata = message
        .metadata
        .as_ref()
        .ok_or_else(|| "intervention decision metadata is required".to_string())?;
    if message.id != envelope.decision.decision_id
        || message.parent_id.as_deref() != Some(envelope.decision.intervention_ref.as_str())
        || !storage_timestamps_equivalent(&message.timestamp, &envelope.decision.decided_at)
        || metadata
            .get("payload_fingerprint")
            .and_then(|value| value.as_str())
            != Some(fingerprint.as_str())
        || metadata
            .get("privacy_scope")
            .and_then(|value| value.as_str())
            != Some("tenant_private")
        || metadata
            .get("e2ee_required")
            .and_then(|value| value.as_bool())
            != Some(true)
    {
        return Err("intervention decision message binding mismatch".to_string());
    }
    Ok(Some(envelope.decision))
}

fn storage_timestamps_equivalent(left: &str, right: &str) -> bool {
    let parse = |value: &str| {
        chrono::DateTime::parse_from_rfc3339(value)
            .ok()
            .or_else(|| chrono::DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f%#z").ok())
            .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
    };
    parse(left)
        .zip(parse(right))
        .and_then(|(left, right)| left.signed_duration_since(right).num_nanoseconds())
        .is_some_and(|delta| delta.unsigned_abs() <= 1_000)
}

fn validate_binding(binding: &QuotationConflictBinding) -> Result<(), String> {
    for (label, value) in [
        ("quotation_id", binding.quotation_id.as_str()),
        (
            "quotation_version_id",
            binding.quotation_version_id.as_str(),
        ),
        ("comparison_id", binding.comparison_id.as_str()),
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

fn canonical_fingerprint<T: Serialize>(value: &T) -> String {
    let json = serde_json::to_value(value).unwrap_or(serde_json::Value::Null);
    let canonical = crate::crypto::canonical_json_string(&json);
    format!(
        "sha256:{}",
        hex::encode(Sha256::digest(canonical.as_bytes()))
    )
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
