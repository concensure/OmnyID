use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::message::AFPMessage;

use super::{
    ConstraintPrivacy, ConstraintStatus, ConstraintValue, PlanningConstraint, SubjectKind,
    SubjectReference, planning_contract_fingerprint, validate_constraint,
    validate_constraint_successor,
};

pub const CONSTRAINT_LEDGER_MESSAGE_SCHEMA: &str = "planning.constraint_ledger_message.v1";
pub const CONSTRAINT_LEDGER_KIND: &str = "planning_constraint";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConstraintLedgerEnvelope {
    pub schema_version: String,
    pub constraint: PlanningConstraint,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectedConstraintState {
    Active,
    Superseded,
    Removed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ProjectedConstraint {
    pub state: ProjectedConstraintState,
    pub successor_ref: Option<String>,
    pub fingerprint: String,
    pub constraint: PlanningConstraint,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct ConstraintLedgerProjection {
    pub active: Vec<ProjectedConstraint>,
    pub superseded: Vec<ProjectedConstraint>,
    pub removed: Vec<ProjectedConstraint>,
}

pub fn constraint_message_id(thread_id: &str, fingerprint: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"planning-constraint-ledger");
    hasher.update([0]);
    hasher.update(thread_id.as_bytes());
    hasher.update([0]);
    hasher.update(fingerprint.as_bytes());
    let digest = hasher.finalize();
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    ulid::Ulid::from_bytes(bytes).to_string()
}

pub fn planning_constraint_message(
    thread_id: &str,
    actor: &str,
    constraint: &PlanningConstraint,
) -> AFPMessage {
    let fingerprint =
        planning_contract_fingerprint(&super::PlanningContract::Constraint(constraint.clone()));
    let id = constraint_message_id(thread_id, &fingerprint);
    let references = std::iter::once(json!({
        "type": "constraint_source",
        "target": constraint.source_ref,
    }))
    .chain(
        constraint
            .supersedes
            .iter()
            .map(|predecessor| json!({"type": "supersedes_constraint", "target": predecessor})),
    )
    .collect();

    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: id.clone(),
        thread_id: thread_id.to_string(),
        parent_id: Some(constraint.source_anchor.message_id.clone()),
        from: actor.to_string(),
        to: vec!["agent://planning-intelligence".to_string()],
        timestamp: constraint.observed_at.clone(),
        r#type: "ledger".to_string(),
        kind: Some(CONSTRAINT_LEDGER_KIND.to_string()),
        supertags: vec![
            "planning".to_string(),
            format!("template:{}", constraint.template_id),
        ],
        subtype: Some(CONSTRAINT_LEDGER_KIND.to_string()),
        content: json!(ConstraintLedgerEnvelope {
            schema_version: CONSTRAINT_LEDGER_MESSAGE_SCHEMA.to_string(),
            constraint: constraint.clone(),
        }),
        metadata: Some(json!({
            "store": true,
            "idempotency_key": id,
            "payload_fingerprint": fingerprint,
            "privacy_scope": "tenant_private",
            "e2ee_required": true,
            "plan_id": constraint.plan_id,
            "schema_version": CONSTRAINT_LEDGER_MESSAGE_SCHEMA,
        })),
        signature: String::new(),
        encryption: None,
        views: Vec::new(),
        references,
        typed_refs: Vec::new(),
        attachments: Vec::new(),
        store_in_relational: true,
        prev_hash: None,
    }
}

pub fn constraint_from_message(message: &AFPMessage) -> Result<Option<PlanningConstraint>, String> {
    if message.kind.as_deref() != Some(CONSTRAINT_LEDGER_KIND) {
        return Ok(None);
    }
    let envelope: ConstraintLedgerEnvelope = serde_json::from_value(message.content.clone())
        .map_err(|error| format!("invalid constraint ledger envelope: {error}"))?;
    if envelope.schema_version != CONSTRAINT_LEDGER_MESSAGE_SCHEMA {
        return Err("unsupported constraint ledger envelope version".to_string());
    }
    validate_constraint(&envelope.constraint)?;
    let message_time = parse_storage_timestamp(&message.timestamp)
        .ok_or_else(|| "constraint AFP timestamp is invalid".to_string())?;
    let observed_time = parse_storage_timestamp(&envelope.constraint.observed_at)
        .ok_or_else(|| "constraint observed_at is invalid".to_string())?;
    let storage_delta_ns = message_time
        .signed_duration_since(observed_time)
        .num_nanoseconds()
        .unwrap_or(i64::MAX)
        .unsigned_abs();
    if storage_delta_ns > 1_000 {
        return Err("constraint observed_at does not match AFP timestamp".to_string());
    }
    let fingerprint = planning_contract_fingerprint(&super::PlanningContract::Constraint(
        envelope.constraint.clone(),
    ));
    let metadata = message
        .metadata
        .as_ref()
        .and_then(Value::as_object)
        .ok_or_else(|| "constraint ledger metadata is required".to_string())?;
    if metadata.get("payload_fingerprint").and_then(Value::as_str) != Some(&fingerprint)
        || metadata.get("plan_id").and_then(Value::as_str)
            != Some(envelope.constraint.plan_id.as_str())
        || metadata.get("privacy_scope").and_then(Value::as_str) != Some("tenant_private")
        || metadata.get("e2ee_required").and_then(Value::as_bool) != Some(true)
        || message.id != constraint_message_id(&message.thread_id, &fingerprint)
    {
        return Err("constraint ledger message binding mismatch".to_string());
    }
    Ok(Some(envelope.constraint))
}

fn parse_storage_timestamp(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .or_else(|| chrono::DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f%#z").ok())
        .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
}

pub fn project_constraint_messages(
    messages: &[AFPMessage],
    plan_id: &str,
) -> Result<ConstraintLedgerProjection, String> {
    let mut constraints = BTreeMap::<String, (PlanningConstraint, String)>::new();
    for message in messages {
        let Some(constraint) = constraint_from_message(message)? else {
            continue;
        };
        if constraint.plan_id != plan_id {
            continue;
        }
        let fingerprint =
            planning_contract_fingerprint(&super::PlanningContract::Constraint(constraint.clone()));
        match constraints.get(&constraint.constraint_id) {
            Some((_, existing)) if existing == &fingerprint => continue,
            Some(_) => {
                return Err("constraint identity has divergent immutable records".to_string());
            }
            None => {
                constraints.insert(constraint.constraint_id.clone(), (constraint, fingerprint));
            }
        }
    }

    let mut successor_by_predecessor = BTreeMap::<String, String>::new();
    for (successor_id, (successor, _)) in &constraints {
        let Some(predecessor_id) = successor.supersedes.as_ref() else {
            continue;
        };
        let predecessor = constraints
            .get(predecessor_id)
            .map(|(constraint, _)| constraint)
            .ok_or_else(|| "constraint predecessor is missing from ledger".to_string())?;
        validate_constraint_successor(predecessor, successor, true)?;
        if successor_by_predecessor
            .insert(predecessor_id.clone(), successor_id.clone())
            .is_some()
        {
            return Err("constraint predecessor has multiple successors".to_string());
        }
    }
    reject_cycles(&successor_by_predecessor)?;

    let status_by_id = constraints
        .iter()
        .map(|(id, (constraint, _))| (id.clone(), constraint.status.clone()))
        .collect::<BTreeMap<_, _>>();
    let mut projection = ConstraintLedgerProjection::default();
    for (constraint_id, (constraint, fingerprint)) in constraints {
        let successor_ref = successor_by_predecessor.get(&constraint_id).cloned();
        let state = match successor_ref.as_ref().and_then(|id| status_by_id.get(id)) {
            Some(ConstraintStatus::Removed) => ProjectedConstraintState::Removed,
            Some(_) => ProjectedConstraintState::Superseded,
            None if matches!(constraint.status, ConstraintStatus::Removed) => {
                ProjectedConstraintState::Removed
            }
            None if matches!(constraint.status, ConstraintStatus::Superseded) => {
                ProjectedConstraintState::Superseded
            }
            None => ProjectedConstraintState::Active,
        };
        let projected = ProjectedConstraint {
            state: state.clone(),
            successor_ref,
            fingerprint,
            constraint,
        };
        match state {
            ProjectedConstraintState::Active => projection.active.push(projected),
            ProjectedConstraintState::Superseded => projection.superseded.push(projected),
            ProjectedConstraintState::Removed => projection.removed.push(projected),
        }
    }
    Ok(projection)
}

pub fn validate_constraint_ledger_policy(constraint: &PlanningConstraint) -> Result<(), String> {
    validate_constraint(constraint)?;
    if constraint.source_ref != constraint.source_anchor.message_id {
        return Err("constraint source_ref must match its exact source anchor".to_string());
    }
    if matches!(constraint.subject_ref.kind, SubjectKind::Person)
        && constraint.privacy != ConstraintPrivacy::CouplePrivate
    {
        return Err("person constraints must be couple_private".to_string());
    }
    validate_opaque_subject(&constraint.subject_ref)?;
    match &constraint.value {
        ConstraintValue::Reference { value } => validate_opaque_subject(value)?,
        ConstraintValue::ReferenceList { values } => {
            for value in values {
                validate_opaque_subject(value)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_opaque_subject(subject: &SubjectReference) -> Result<(), String> {
    let prefix = match subject.kind {
        SubjectKind::Plan => "plan:",
        SubjectKind::Person => "person:",
        SubjectKind::Event => "event:",
        SubjectKind::Object => "object:",
        SubjectKind::VendorCategory => "category:",
        SubjectKind::Option => "option:",
        SubjectKind::Milestone => "milestone:",
    };
    let suffix = subject
        .id
        .strip_prefix(prefix)
        .filter(|suffix| !suffix.is_empty())
        .ok_or_else(|| "subject identifier must use its opaque kind namespace".to_string())?;
    if !suffix.chars().all(|character| {
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || matches!(character, ':' | '_' | '-' | '.')
    }) {
        return Err("subject identifier must not embed display text or PII".to_string());
    }
    if matches!(subject.kind, SubjectKind::Person)
        && (suffix.len() < 8
            || !suffix
                .chars()
                .any(|character| character.is_ascii_digit() || matches!(character, '_' | '-')))
    {
        return Err("person identifier must be an opaque pseudonymous reference".to_string());
    }
    Ok(())
}

fn reject_cycles(successors: &BTreeMap<String, String>) -> Result<(), String> {
    for start in successors.keys() {
        let mut seen = BTreeSet::new();
        let mut current = start.as_str();
        while let Some(next) = successors.get(current) {
            if !seen.insert(current.to_string()) {
                return Err("constraint successor cycle detected".to_string());
            }
            current = next;
        }
    }
    Ok(())
}
