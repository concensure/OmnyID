use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::message::AFPMessage;

use super::{
    CostAdviceBindings, CostTradeoffAdvice, CurrentCostAdviceRevisions,
    cost_tradeoff_advice_is_current, validate_cost_tradeoff,
};

pub const COST_ACKNOWLEDGEMENT_SCHEMA_VERSION: &str = "planning.cost_acknowledgement.v1";
pub const COST_ACKNOWLEDGEMENT_MESSAGE_SCHEMA: &str = "planning.cost_acknowledgement_message.v1";
pub const COST_ACKNOWLEDGEMENT_KIND: &str = "planning_cost_acknowledgement";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CostAcknowledgement {
    pub schema_version: String,
    pub acknowledgement_id: String,
    pub tradeoff_ref: String,
    pub candidate_decision_ref: String,
    pub bindings: CostAdviceBindings,
    pub acknowledged_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CostAcknowledgementEnvelope {
    pub schema_version: String,
    pub acknowledgement: CostAcknowledgement,
}

pub fn cost_acknowledgement_id(
    thread_id: &str,
    tradeoff_ref: &str,
    idempotency_key: &str,
) -> Result<String, String> {
    identifier(thread_id, "thread_id")?;
    identifier(tradeoff_ref, "tradeoff_ref")?;
    identifier(idempotency_key, "idempotency_key")?;
    let canonical = crate::crypto::canonical_json_string(&json!({
        "namespace": "planning_cost_acknowledgement",
        "thread_id": thread_id,
        "tradeoff_ref": tradeoff_ref,
        "idempotency_key": idempotency_key,
    }));
    let digest = Sha256::digest(canonical.as_bytes());
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    Ok(ulid::Ulid::from_bytes(bytes).to_string())
}

pub fn build_cost_acknowledgement(
    thread_id: &str,
    advice: &CostTradeoffAdvice,
    current: &CurrentCostAdviceRevisions<'_>,
    idempotency_key: &str,
    acknowledged_at: &str,
) -> Result<CostAcknowledgement, String> {
    validate_cost_tradeoff(&advice.tradeoff)?;
    if !advice.requires_acknowledgement || !advice.exceeds_budget {
        return Err("cost advice does not require acknowledgement".to_string());
    }
    if !cost_tradeoff_advice_is_current(advice, current) {
        return Err("cost advice is stale".to_string());
    }
    chrono::DateTime::parse_from_rfc3339(acknowledged_at)
        .map_err(|_| "acknowledged_at must be RFC3339".to_string())?;
    let acknowledgement = CostAcknowledgement {
        schema_version: COST_ACKNOWLEDGEMENT_SCHEMA_VERSION.to_string(),
        acknowledgement_id: cost_acknowledgement_id(
            thread_id,
            &advice.tradeoff.tradeoff_id,
            idempotency_key,
        )?,
        tradeoff_ref: advice.tradeoff.tradeoff_id.clone(),
        candidate_decision_ref: advice.tradeoff.candidate_decision_ref.clone(),
        bindings: advice.bindings.clone(),
        acknowledged_at: acknowledged_at.to_string(),
    };
    validate_cost_acknowledgement(&acknowledgement)?;
    Ok(acknowledgement)
}

pub fn cost_advice_allows_advance(
    advice: &CostTradeoffAdvice,
    current: &CurrentCostAdviceRevisions<'_>,
    acknowledgement: Option<&CostAcknowledgement>,
) -> bool {
    if !cost_tradeoff_advice_is_current(advice, current) {
        return false;
    }
    if !advice.requires_acknowledgement {
        return true;
    }
    acknowledgement.is_some_and(|acknowledgement| {
        validate_cost_acknowledgement(acknowledgement).is_ok()
            && acknowledgement.tradeoff_ref == advice.tradeoff.tradeoff_id
            && acknowledgement.candidate_decision_ref == advice.tradeoff.candidate_decision_ref
            && acknowledgement.bindings == advice.bindings
    })
}

pub fn validate_cost_acknowledgement(value: &CostAcknowledgement) -> Result<(), String> {
    if value.schema_version != COST_ACKNOWLEDGEMENT_SCHEMA_VERSION {
        return Err("unsupported cost acknowledgement schema".to_string());
    }
    for (label, value) in [
        ("acknowledgement_id", value.acknowledgement_id.as_str()),
        ("tradeoff_ref", value.tradeoff_ref.as_str()),
        (
            "candidate_decision_ref",
            value.candidate_decision_ref.as_str(),
        ),
        (
            "candidate_revision_ref",
            value.bindings.candidate_revision_ref.as_str(),
        ),
        (
            "budget_revision_ref",
            value.bindings.budget_revision_ref.as_str(),
        ),
    ] {
        identifier(value, label)?;
    }
    references(
        &value.bindings.constraint_revision_refs,
        "constraint_revision_refs",
    )?;
    references(&value.bindings.source_revision_refs, "source_revision_refs")?;
    chrono::DateTime::parse_from_rfc3339(&value.acknowledged_at)
        .map_err(|_| "acknowledged_at must be RFC3339".to_string())?;
    Ok(())
}

pub fn cost_acknowledgement_message(
    thread_id: &str,
    actor: &str,
    acknowledgement: &CostAcknowledgement,
) -> Result<AFPMessage, String> {
    identifier(thread_id, "thread_id")?;
    bounded_text(actor, 1, 300, "actor")?;
    validate_cost_acknowledgement(acknowledgement)?;
    let envelope = CostAcknowledgementEnvelope {
        schema_version: COST_ACKNOWLEDGEMENT_MESSAGE_SCHEMA.to_string(),
        acknowledgement: acknowledgement.clone(),
    };
    let payload_fingerprint = canonical_fingerprint(&envelope);
    let mut refs = vec![
        json!({"type": "planning_cost_tradeoff", "target": acknowledgement.tradeoff_ref}),
        json!({"type": "planning_decision", "target": acknowledgement.candidate_decision_ref}),
        json!({"type": "candidate_revision", "target": acknowledgement.bindings.candidate_revision_ref}),
        json!({"type": "budget_revision", "target": acknowledgement.bindings.budget_revision_ref}),
    ];
    refs.extend(
        acknowledgement
            .bindings
            .constraint_revision_refs
            .iter()
            .map(|target| json!({"type": "planning_constraint", "target": target})),
    );
    refs.extend(
        acknowledgement
            .bindings
            .source_revision_refs
            .iter()
            .map(|target| json!({"type": "cost_source_revision", "target": target})),
    );
    Ok(AFPMessage {
        protocol: "afp-v1".to_string(),
        id: acknowledgement.acknowledgement_id.clone(),
        thread_id: thread_id.to_string(),
        parent_id: Some(acknowledgement.tradeoff_ref.clone()),
        from: actor.to_string(),
        to: vec!["agent://planning-intelligence".to_string()],
        timestamp: acknowledgement.acknowledged_at.clone(),
        r#type: "ledger".to_string(),
        kind: Some(COST_ACKNOWLEDGEMENT_KIND.to_string()),
        supertags: vec!["planning".to_string(), "decision".to_string()],
        subtype: Some(COST_ACKNOWLEDGEMENT_KIND.to_string()),
        content: json!(envelope),
        metadata: Some(json!({
            "store": true,
            "payload_fingerprint": payload_fingerprint,
            "privacy_scope": "tenant_private",
            "e2ee_required": true,
            "schema_version": COST_ACKNOWLEDGEMENT_MESSAGE_SCHEMA,
        })),
        signature: String::new(),
        encryption: None,
        views: Vec::new(),
        references: refs.clone(),
        typed_refs: refs,
        attachments: Vec::new(),
        store_in_relational: true,
        prev_hash: None,
    })
}

pub fn cost_acknowledgement_from_message(
    message: &AFPMessage,
) -> Result<Option<CostAcknowledgement>, String> {
    if message.kind.as_deref() != Some(COST_ACKNOWLEDGEMENT_KIND) {
        return Ok(None);
    }
    let envelope: CostAcknowledgementEnvelope = serde_json::from_value(message.content.clone())
        .map_err(|_| "cost acknowledgement envelope is invalid".to_string())?;
    if envelope.schema_version != COST_ACKNOWLEDGEMENT_MESSAGE_SCHEMA {
        return Err("unsupported cost acknowledgement message schema".to_string());
    }
    validate_cost_acknowledgement(&envelope.acknowledgement)?;
    let metadata = message
        .metadata
        .as_ref()
        .ok_or_else(|| "cost acknowledgement metadata is required".to_string())?;
    if message.id != envelope.acknowledgement.acknowledgement_id
        || message.parent_id.as_deref() != Some(envelope.acknowledgement.tradeoff_ref.as_str())
        || !storage_timestamps_equivalent(
            &message.timestamp,
            &envelope.acknowledgement.acknowledged_at,
        )
        || metadata
            .get("payload_fingerprint")
            .and_then(|value| value.as_str())
            != Some(canonical_fingerprint(&envelope).as_str())
        || metadata
            .get("privacy_scope")
            .and_then(|value| value.as_str())
            != Some("tenant_private")
        || metadata
            .get("e2ee_required")
            .and_then(|value| value.as_bool())
            != Some(true)
    {
        return Err("cost acknowledgement message binding mismatch".to_string());
    }
    Ok(Some(envelope.acknowledgement))
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

fn bounded_text(value: &str, minimum: usize, maximum: usize, label: &str) -> Result<(), String> {
    let length = value.trim().chars().count();
    (length >= minimum && length <= maximum && !value.chars().any(char::is_control))
        .then_some(())
        .ok_or_else(|| format!("{label} is invalid"))
}

fn canonical_fingerprint<T: Serialize>(value: &T) -> String {
    let json = serde_json::to_value(value).unwrap_or(serde_json::Value::Null);
    let canonical = crate::crypto::canonical_json_string(&json);
    format!(
        "sha256:{}",
        hex::encode(Sha256::digest(canonical.as_bytes()))
    )
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
