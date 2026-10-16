use super::afp::{base_message, reference, stable_hash};
use crate::message::AFPMessage;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub const CONTEXT_GRANT_KIND: &str = "quotation_context_grant";
pub const CONTEXT_GRANT_REVOKED_KIND: &str = "quotation_context_grant_revoked";
pub const VENDOR_CONTEXT_PROJECTION_VERSION: &str = "quotation.vendor_context.v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContextGrantPurpose {
    ResolveQuoteGaps,
    RefineVendorPackage,
    ConfirmBookingDetails,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContextGrantScope {
    SingleUse,
    Reusable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VendorContextGrant {
    pub grant_id: String,
    pub granted_by_user_id: String,
    pub target_vendor_id: String,
    pub quotation_id: String,
    pub thread_id: String,
    pub purpose: ContextGrantPurpose,
    pub allowed_fact_ids: Vec<String>,
    pub issued_at: String,
    pub expires_at: String,
    pub scope: ContextGrantScope,
    pub approval_receipt_ref: String,
    pub projection_version: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VendorContextRevocation {
    pub revocation_id: String,
    pub grant_id: String,
    pub revoked_by_user_id: String,
    pub revoked_at: String,
    pub reason: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShareableContextField {
    pub fact_id: String,
    pub key: String,
    pub value: Value,
    pub provenance_ref: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VendorContextProjection {
    pub projection_version: String,
    pub projection_fingerprint: String,
    pub grant_id: String,
    pub recipient_vendor_id: String,
    pub quotation_id: String,
    pub purpose: ContextGrantPurpose,
    pub fields: BTreeMap<String, Value>,
    pub fact_ids: Vec<String>,
    pub provenance_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorContextError {
    InvalidGrant,
    WrongRecipient,
    Expired,
    Revoked,
    SingleUseConsumed,
    NoShareableFields,
}

fn parsed_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.with_timezone(&Utc))
}

fn prohibited_key(key: &str) -> bool {
    let normalized = key.trim().to_ascii_lowercase();
    [
        "competitor",
        "other_vendor",
        "private_note",
        "hidden_preference",
        "full_plan",
        "internal_score",
        "comparison_score",
    ]
    .iter()
    .any(|prohibited| {
        normalized == *prohibited
            || normalized.starts_with(&format!("{prohibited}."))
            || normalized.starts_with(&format!("{prohibited}_"))
    })
}

fn validate_grant(grant: &VendorContextGrant) -> bool {
    !grant.grant_id.trim().is_empty()
        && !grant.granted_by_user_id.trim().is_empty()
        && !grant.target_vendor_id.trim().is_empty()
        && !grant.quotation_id.trim().is_empty()
        && !grant.thread_id.trim().is_empty()
        && !grant.approval_receipt_ref.trim().is_empty()
        && grant.projection_version == VENDOR_CONTEXT_PROJECTION_VERSION
        && !grant.allowed_fact_ids.is_empty()
        && grant.allowed_fact_ids.len() <= 100
        && parsed_time(&grant.issued_at).is_some()
        && parsed_time(&grant.expires_at).is_some()
        && parsed_time(&grant.issued_at) < parsed_time(&grant.expires_at)
}

/// Produces only fields explicitly authorised by fact id for the target vendor.
/// The denylist is a defence-in-depth boundary and cannot be overridden by a grant.
pub fn project_vendor_context(
    grant: &VendorContextGrant,
    requested_recipient_vendor_id: &str,
    available: &[ShareableContextField],
    revocations: &[VendorContextRevocation],
    consumed_single_use_grant_ids: &BTreeSet<String>,
    now: DateTime<Utc>,
) -> Result<VendorContextProjection, VendorContextError> {
    if !validate_grant(grant) {
        return Err(VendorContextError::InvalidGrant);
    }
    if grant.target_vendor_id != requested_recipient_vendor_id {
        return Err(VendorContextError::WrongRecipient);
    }
    if parsed_time(&grant.expires_at).is_none_or(|expires_at| now >= expires_at) {
        return Err(VendorContextError::Expired);
    }
    if revocations.iter().any(|revocation| {
        revocation.grant_id == grant.grant_id
            && parsed_time(&revocation.revoked_at).is_some_and(|revoked_at| revoked_at <= now)
    }) {
        return Err(VendorContextError::Revoked);
    }
    if grant.scope == ContextGrantScope::SingleUse
        && consumed_single_use_grant_ids.contains(&grant.grant_id)
    {
        return Err(VendorContextError::SingleUseConsumed);
    }

    let allowed = grant
        .allowed_fact_ids
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let mut fields = BTreeMap::new();
    let mut fact_ids = BTreeSet::new();
    let mut provenance_refs = BTreeSet::new();
    for field in available {
        if allowed.contains(field.fact_id.as_str()) && !prohibited_key(&field.key) {
            fields.insert(field.key.clone(), field.value.clone());
            fact_ids.insert(field.fact_id.clone());
            provenance_refs.insert(field.provenance_ref.clone());
        }
    }
    if fields.is_empty() {
        return Err(VendorContextError::NoShareableFields);
    }
    let fingerprint_input = (
        VENDOR_CONTEXT_PROJECTION_VERSION,
        &grant.grant_id,
        &grant.target_vendor_id,
        &grant.quotation_id,
        grant.purpose,
        &fields,
        &fact_ids,
        &provenance_refs,
    );
    Ok(VendorContextProjection {
        projection_version: VENDOR_CONTEXT_PROJECTION_VERSION.to_string(),
        projection_fingerprint: stable_hash(&fingerprint_input),
        grant_id: grant.grant_id.clone(),
        recipient_vendor_id: grant.target_vendor_id.clone(),
        quotation_id: grant.quotation_id.clone(),
        purpose: grant.purpose,
        fields,
        fact_ids: fact_ids.into_iter().collect(),
        provenance_refs: provenance_refs.into_iter().collect(),
    })
}

pub fn vendor_context_grant_message(
    grant: &VendorContextGrant,
    parent_approval_message_id: &str,
    actor: &str,
) -> Result<AFPMessage, VendorContextError> {
    if !validate_grant(grant) || parent_approval_message_id.trim().is_empty() {
        return Err(VendorContextError::InvalidGrant);
    }
    let hash = stable_hash(grant);
    let mut message = base_message(
        format!("quotation-context-grant:{}:{}", grant.grant_id, &hash[..16]),
        &grant.thread_id,
        Some(parent_approval_message_id),
        &grant.issued_at,
        actor,
    );
    message.kind = Some(CONTEXT_GRANT_KIND.to_string());
    message.subtype = message.kind.clone();
    message
        .supertags
        .push("permission:vendor_context".to_string());
    message.content = json!({"grant": grant});
    message.metadata = Some(json!({
        "payload_hash": hash,
        "idempotency_key": message.id,
        "privacy_scope": "tenant_private",
        "e2ee_required": true,
    }));
    message.references = vec![
        reference("approval_receipt", &grant.approval_receipt_ref),
        reference("quotation", &grant.quotation_id),
        reference("target_vendor", &grant.target_vendor_id),
    ];
    message.typed_refs = message.references.clone();
    Ok(message)
}

pub fn vendor_context_revocation_message(
    revocation: &VendorContextRevocation,
    grant_message: &AFPMessage,
    actor: &str,
) -> Result<AFPMessage, VendorContextError> {
    if revocation.revocation_id.trim().is_empty()
        || revocation.grant_id.trim().is_empty()
        || revocation.revoked_by_user_id.trim().is_empty()
        || revocation.reason.trim().is_empty()
        || parsed_time(&revocation.revoked_at).is_none()
        || grant_message.kind.as_deref() != Some(CONTEXT_GRANT_KIND)
    {
        return Err(VendorContextError::InvalidGrant);
    }
    let hash = stable_hash(revocation);
    let mut message = base_message(
        format!(
            "quotation-context-grant-revoked:{}:{}",
            revocation.grant_id,
            &hash[..16]
        ),
        &grant_message.thread_id,
        Some(&grant_message.id),
        &revocation.revoked_at,
        actor,
    );
    message.kind = Some(CONTEXT_GRANT_REVOKED_KIND.to_string());
    message.subtype = message.kind.clone();
    message.supertags.push("permission:revoked".to_string());
    message.content = json!({"revocation": revocation});
    message.metadata = Some(json!({
        "payload_hash": hash,
        "idempotency_key": message.id,
        "privacy_scope": "tenant_private",
        "e2ee_required": true,
    }));
    message.references = vec![reference("quotation_context_grant", &grant_message.id)];
    message.typed_refs = message.references.clone();
    Ok(message)
}
