use super::{
    contracts::{NormalisedQuotation, QuotationComparison},
    review::QuotationReviewSuccessor,
};
use crate::message::AFPMessage;
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

pub const NORMALISED_QUOTATION_KIND: &str = "quotation_normalisation_confirmed";
pub const CORRECTED_QUOTATION_KIND: &str = "quotation_normalisation_corrected";
pub const QUOTATION_COMPARISON_KIND: &str = "quotation_comparison_materialised";
pub const QUOTATION_REVIEW_KIND: &str = "quotation_review_recorded";

pub(super) fn stable_hash<T: Serialize>(value: &T) -> String {
    let encoded = serde_json::to_vec(value).unwrap_or_default();
    hex::encode(Sha256::digest(encoded))
}

pub(super) fn reference(reference_type: &str, target: &str) -> Value {
    json!({"type": reference_type, "target": target})
}

pub(super) fn base_message(
    id: String,
    thread_id: &str,
    parent_id: Option<&str>,
    timestamp: &str,
    from: &str,
) -> AFPMessage {
    AFPMessage {
        protocol: "afp/1.0".to_string(),
        id,
        thread_id: thread_id.to_string(),
        parent_id: parent_id.map(str::to_string),
        from: from.to_string(),
        to: vec!["agent://quotation-intelligence".to_string()],
        timestamp: timestamp.to_string(),
        r#type: "ledger".to_string(),
        kind: None,
        supertags: vec!["quotation".to_string()],
        subtype: None,
        content: Value::Null,
        metadata: None,
        signature: String::new(),
        encryption: None,
        views: Vec::new(),
        references: Vec::new(),
        typed_refs: Vec::new(),
        attachments: Vec::new(),
        store_in_relational: true,
        prev_hash: None,
    }
}

pub fn normalised_quotation_message(
    quotation: &NormalisedQuotation,
    thread_id: &str,
    parent_message_id: Option<&str>,
    timestamp: &str,
    actor: &str,
) -> AFPMessage {
    let payload_hash = stable_hash(quotation);
    let mut message = base_message(
        format!(
            "quotation-normalised:{}:{}",
            quotation.identity.version_id,
            &payload_hash[..16]
        ),
        thread_id,
        parent_message_id,
        timestamp,
        actor,
    );
    message.kind = Some(
        if quotation.identity.supersedes_version_id.is_some() {
            CORRECTED_QUOTATION_KIND
        } else {
            NORMALISED_QUOTATION_KIND
        }
        .to_string(),
    );
    message.subtype = message.kind.clone();
    message.supertags.extend([
        format!("context:{}", quotation.identity.context_namespace),
        format!("currency:{}", quotation.currency.to_ascii_lowercase()),
    ]);
    message.content = json!({
        "quotation": quotation,
        "source_policy": "immutable_refs_with_bounded_evidence_excerpts",
    });
    message.metadata = Some(json!({
        "payload_hash": payload_hash,
        "idempotency_key": message.id,
        "lifecycle": quotation.lifecycle,
        "privacy_scope": "tenant_private",
        "e2ee_required": true,
        "schema_version": quotation.schema_version,
        "registry_version": quotation.registry_version,
    }));
    message.references = quotation
        .sources
        .iter()
        .map(|source| reference("quotation_source_version", &source.source_version_id))
        .chain(
            quotation
                .identity
                .supersedes_version_id
                .iter()
                .map(|version| reference("supersedes_quotation_version", version)),
        )
        .collect();
    message.typed_refs = message.references.clone();
    message
}

pub fn quotation_comparison_message(
    comparison: &QuotationComparison,
    thread_id: &str,
    parent_id: Option<&str>,
    timestamp: &str,
    actor: &str,
) -> AFPMessage {
    let payload_hash = stable_hash(comparison);
    let mut message = base_message(
        format!(
            "quotation-comparison:{}:{}",
            comparison.comparison_id,
            &payload_hash[..16]
        ),
        thread_id,
        parent_id,
        timestamp,
        actor,
    );
    message.kind = Some(QUOTATION_COMPARISON_KIND.to_string());
    message.subtype = message.kind.clone();
    message.content = json!({"comparison": comparison});
    message.metadata = Some(json!({
        "payload_hash": payload_hash,
        "idempotency_key": message.id,
        "recommendation_policy": "confirmed_hard_requirements_then_complete_comparable_total",
        "privacy_scope": "tenant_private",
        "e2ee_required": true,
        "schema_version": comparison.schema_version,
    }));
    message.references = comparison
        .candidates
        .iter()
        .map(|candidate| reference("normalised_quotation_version", &candidate.version_id))
        .collect();
    message.typed_refs = message.references.clone();
    message
}

pub fn quotation_review_message(
    review: &QuotationReviewSuccessor,
    quotation_id: &str,
    thread_id: &str,
    parent_message_id: &str,
    actor: &str,
) -> AFPMessage {
    let payload = json!({
        "review_id": review.review_id,
        "quotation_id": quotation_id,
        "parent_version_id": review.parent_version_id,
        "version_id": review.version_id,
        "material_fingerprint": review.material_fingerprint,
        "actor_id": review.actor_id,
        "reviewed_at": review.reviewed_at,
        "action": review.action,
        "rejected": review.rejected,
    });
    let payload_hash = stable_hash(&payload);
    let mut message = base_message(
        format!(
            "quotation-review:{}:{}",
            review.review_id,
            &payload_hash[..16]
        ),
        thread_id,
        Some(parent_message_id),
        &review.reviewed_at,
        actor,
    );
    message.kind = Some(QUOTATION_REVIEW_KIND.to_string());
    message.subtype = message.kind.clone();
    message.content = payload;
    message.metadata = Some(json!({
        "payload_hash": payload_hash,
        "idempotency_key": message.id,
        "privacy_scope": "tenant_private",
        "e2ee_required": true,
        "schema_version": "quotation.review.v1",
    }));
    message.references = vec![
        reference("quotation", quotation_id),
        reference("normalised_quotation_version", &review.parent_version_id),
    ];
    if !review.rejected {
        message.references.push(reference(
            "normalised_quotation_successor",
            &review.version_id,
        ));
    }
    message.typed_refs = message.references.clone();
    message
}
