use super::{
    ClarificationApproval, ClarificationDraft, ClarificationSendReceipt, ClosureTransition,
    QuotationSelection, ValidatedClosureEvidence,
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
pub const CLARIFICATION_SEND_RESERVED_KIND: &str = "quotation_clarification_send_reserved";
pub const CLARIFICATION_SENT_KIND: &str = "quotation_clarification_sent";
pub const QUOTATION_VENDOR_SELECTED_KIND: &str = "quotation_vendor_selected";
pub const QUOTATION_CLOSURE_TRANSITION_KIND: &str = "quotation_closure_transition";
pub const QUOTATION_CLOSURE_EVIDENCE_KIND: &str = "quotation_closure_evidence_validated";

pub(super) fn stable_hash<T: Serialize>(value: &T) -> String {
    let encoded = serde_json::to_vec(value).unwrap_or_default();
    hex::encode(Sha256::digest(encoded))
}

fn stable_message_id<T: Serialize>(namespace: &str, value: &T) -> String {
    let encoded = serde_json::to_vec(value).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(namespace.as_bytes());
    hasher.update([0]);
    hasher.update(encoded);
    let digest = hasher.finalize();
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    ulid::Ulid::from_bytes(bytes).to_string()
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
        protocol: "afp-v1".to_string(),
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
        stable_message_id(
            "quotation-normalised",
            &(thread_id, &quotation.identity.version_id, &payload_hash),
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
        stable_message_id(
            "quotation-comparison",
            &(thread_id, &comparison.comparison_id, &payload_hash),
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
        stable_message_id(
            "quotation-review",
            &(thread_id, &review.review_id, &payload_hash),
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

pub fn clarification_send_reservation_message(
    draft: &ClarificationDraft,
    approval: &ClarificationApproval,
    idempotency_key: &str,
    thread_id: &str,
    draft_message_id: &str,
    approval_message_id: &str,
    timestamp: &str,
    actor: &str,
) -> AFPMessage {
    let mut message = base_message(
        stable_message_id(
            "quotation-clarification-reserved",
            &(thread_id, idempotency_key),
        ),
        thread_id,
        Some(approval_message_id),
        timestamp,
        actor,
    );
    message.kind = Some(CLARIFICATION_SEND_RESERVED_KIND.to_string());
    message.subtype = message.kind.clone();
    message.content = json!({
        "idempotency_key": idempotency_key,
        "draft_id": draft.draft_id,
        "draft_hash": super::draft_hash(draft),
        "approval_id": approval.approval_id,
        "recipient": draft.recipient,
        "quotation_version_id": draft.quotation_version_id,
        "comparison_revision": draft.comparison_revision,
        "reserved_at": timestamp,
    });
    message.metadata = Some(json!({
        "idempotency_key": idempotency_key,
        "privacy_scope": "tenant_private",
        "e2ee_required": true,
        "schema_version": "quotation.clarification.send.v1",
    }));
    message.references = vec![
        reference("clarification_draft", draft_message_id),
        reference("clarification_approval", approval_message_id),
        reference("normalised_quotation_version", &draft.quotation_version_id),
        reference("quotation_comparison", &draft.comparison_revision),
    ];
    message.typed_refs = message.references.clone();
    message
}

pub fn clarification_sent_message(
    receipt: &ClarificationSendReceipt,
    thread_id: &str,
    reservation_message_id: &str,
    draft_message_id: &str,
    approval_message_id: &str,
    external_message_id: &str,
    actor: &str,
) -> AFPMessage {
    let mut message = base_message(
        stable_message_id(
            "quotation-clarification-sent",
            &(thread_id, &receipt.idempotency_key),
        ),
        thread_id,
        Some(reservation_message_id),
        &receipt.sent_at,
        actor,
    );
    message.kind = Some(CLARIFICATION_SENT_KIND.to_string());
    message.subtype = message.kind.clone();
    message.content = json!({"receipt": receipt});
    message.metadata = Some(json!({
        "idempotency_key": receipt.idempotency_key,
        "privacy_scope": "tenant_private",
        "e2ee_required": true,
        "schema_version": "quotation.clarification.send.v1",
    }));
    message.references = vec![
        reference("clarification_send_reservation", reservation_message_id),
        reference("clarification_draft", draft_message_id),
        reference("clarification_approval", approval_message_id),
        json!({
            "type": "external_email",
            "target": external_message_id,
            "metadata": {"relation": "message_id"},
        }),
    ];
    message.typed_refs = message.references.clone();
    message
}

pub fn quotation_selection_message(
    selection: &QuotationSelection,
    thread_id: &str,
    parent_message_id: &str,
) -> AFPMessage {
    let payload_hash = stable_hash(selection);
    let mut message = base_message(
        stable_message_id(
            "quotation-vendor-selected",
            &(thread_id, &selection.idempotency_key),
        ),
        thread_id,
        Some(parent_message_id),
        &selection.occurred_at,
        &selection.actor_id,
    );
    message.kind = Some(QUOTATION_VENDOR_SELECTED_KIND.to_string());
    message.subtype = message.kind.clone();
    message.content = json!({"selection": selection, "payment_execution": false});
    message.metadata = Some(json!({
        "payload_hash": payload_hash,
        "idempotency_key": selection.idempotency_key,
        "privacy_scope": "tenant_private",
        "e2ee_required": true,
        "schema_version": "quotation.selection.v1",
        "payment_execution": false,
    }));
    message.references = vec![
        reference("comparison", &selection.comparison_id),
        reference("quotation", &selection.quotation_id),
        reference("quotation_version", &selection.quotation_version_id),
        reference("vendor", &selection.vendor_id),
    ];
    if let Some(previous) = &selection.supersedes_selection_id {
        message.references.push(reference("parent", previous));
    }
    message.typed_refs = message.references.clone();
    message
}

pub fn quotation_closure_transition_message(
    transition: &ClosureTransition,
    idempotency_key: &str,
    thread_id: &str,
    parent_message_id: &str,
) -> AFPMessage {
    let payload_hash = stable_hash(transition);
    let mut message = base_message(
        stable_message_id(
            "quotation-closure-transition",
            &(thread_id, idempotency_key),
        ),
        thread_id,
        Some(parent_message_id),
        &transition.occurred_at,
        &transition.actor_id,
    );
    message.kind = Some(QUOTATION_CLOSURE_TRANSITION_KIND.to_string());
    message.subtype = message.kind.clone();
    message.content = json!({"transition": transition, "payment_execution": false});
    message.metadata = Some(json!({
        "payload_hash": payload_hash,
        "idempotency_key": idempotency_key,
        "privacy_scope": "tenant_private",
        "e2ee_required": true,
        "schema_version": "quotation.closure.v1",
        "payment_execution": false,
    }));
    message.references = vec![
        reference("quotation", &transition.quotation_id),
        reference("quotation_version", &transition.quotation_version_id),
    ];
    for source in &transition.evidence_sources {
        message.references.push(json!({
            "type": "source",
            "target": source.source_id,
            "metadata": {"source_version_id": source.source_version_id},
        }));
    }
    message.typed_refs = message.references.clone();
    message
}

pub fn quotation_closure_evidence_message(
    evidence: &ValidatedClosureEvidence,
    thread_id: &str,
    parent_message_id: &str,
    timestamp: &str,
    actor: &str,
) -> AFPMessage {
    let payload_hash = stable_hash(evidence);
    let mut message = base_message(
        stable_message_id(
            "quotation-closure-evidence",
            &(thread_id, &evidence.evidence_id, &payload_hash),
        ),
        thread_id,
        Some(parent_message_id),
        timestamp,
        actor,
    );
    message.kind = Some(QUOTATION_CLOSURE_EVIDENCE_KIND.to_string());
    message.subtype = message.kind.clone();
    message
        .supertags
        .push("quotation:closure_evidence".to_string());
    message.content = json!({"evidence": evidence, "payment_execution": false});
    message.metadata = Some(json!({
        "payload_hash": payload_hash,
        "idempotency_key": evidence.evidence_id,
        "privacy_scope": "tenant_private",
        "e2ee_required": true,
        "schema_version": super::CLOSURE_EVIDENCE_SCHEMA_VERSION,
        "payment_execution": false,
    }));
    message.references = vec![
        reference("quotation", &evidence.quotation_id),
        reference("quotation_version", &evidence.quotation_version_id),
        json!({
            "type": "source",
            "target": evidence.source.source_id,
            "metadata": {"source_version_id": evidence.source.source_version_id},
        }),
    ];
    message.typed_refs = message.references.clone();
    message
}

#[cfg(test)]
mod tests {
    use super::stable_message_id;

    fn is_afp_ulid(value: &str) -> bool {
        value.len() == 26
            && value.bytes().all(|byte| {
                matches!(
                    byte,
                    b'0'..=b'9'
                        | b'A'..=b'H'
                        | b'J'..=b'N'
                        | b'P'..=b'T'
                        | b'V'..=b'Z'
                )
            })
    }

    #[test]
    fn content_addressed_ids_are_afp_valid_deterministic_and_scoped() {
        let first = stable_message_id("quotation", &("thread-a", "version-1"));
        assert!(is_afp_ulid(&first));
        assert_eq!(
            first,
            stable_message_id("quotation", &("thread-a", "version-1"))
        );
        assert_ne!(
            first,
            stable_message_id("quotation", &("thread-b", "version-1"))
        );
        assert_ne!(
            first,
            stable_message_id("comparison", &("thread-a", "version-1"))
        );
    }
}
