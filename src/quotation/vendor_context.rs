use super::afp::{base_message, reference, stable_hash, stable_message_id};
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

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContextGrantAction {
    AnswerQuestions,
    SubmitRevision,
    ConfirmBookingDetails,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VendorContextGrant {
    pub grant_id: String,
    pub granted_by_user_id: String,
    pub target_vendor_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub thread_id: String,
    pub response_recipient_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_agent_id: Option<String>,
    pub purpose: ContextGrantPurpose,
    pub allowed_fact_ids: Vec<String>,
    pub allowed_question_ids: Vec<String>,
    pub allowed_actions: Vec<ContextGrantAction>,
    pub issued_at: String,
    pub not_before: String,
    pub expires_at: String,
    pub scope: ContextGrantScope,
    pub approval_receipt_ref: String,
    pub projection_version: String,
    pub projection_fingerprint: String,
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
    pub class: ShareableContextClass,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShareableContextClass {
    VendorQuotation,
    ApprovedRequirement,
    ApprovedQuestion,
    ApprovedPackageChange,
    ApprovedBudget,
    Prohibited,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VendorContextProjection {
    pub projection_version: String,
    pub projection_fingerprint: String,
    pub grant_id: String,
    pub recipient_vendor_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub thread_id: String,
    pub response_recipient_id: String,
    pub purpose: ContextGrantPurpose,
    pub allowed_actions: Vec<ContextGrantAction>,
    pub question_ids: Vec<String>,
    pub fields: BTreeMap<String, Value>,
    pub fact_ids: Vec<String>,
    pub provenance_refs: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorContextError {
    InvalidGrant,
    WrongRecipient,
    NotYetValid,
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
        && !grant.quotation_version_id.trim().is_empty()
        && !grant.thread_id.trim().is_empty()
        && !grant.response_recipient_id.trim().is_empty()
        && !grant.approval_receipt_ref.trim().is_empty()
        && grant.projection_version == VENDOR_CONTEXT_PROJECTION_VERSION
        && !grant.allowed_fact_ids.is_empty()
        && grant.allowed_fact_ids.len() <= 100
        && grant.allowed_question_ids.len() <= 50
        && !grant.allowed_actions.is_empty()
        && grant.allowed_actions.len() <= 3
        && parsed_time(&grant.issued_at).is_some()
        && parsed_time(&grant.not_before).is_some()
        && parsed_time(&grant.expires_at).is_some()
        && parsed_time(&grant.issued_at) <= parsed_time(&grant.not_before)
        && parsed_time(&grant.not_before) < parsed_time(&grant.expires_at)
        && grant.projection_fingerprint.len() == 64
        && grant
            .projection_fingerprint
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}

fn projection_parts(
    grant: &VendorContextGrant,
    available: &[ShareableContextField],
) -> Result<(BTreeMap<String, Value>, Vec<String>, Vec<String>), VendorContextError> {
    let allowed = grant
        .allowed_fact_ids
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let mut fields = BTreeMap::new();
    let mut fact_ids = BTreeSet::new();
    let mut provenance_refs = BTreeSet::new();
    for field in available {
        if allowed.contains(field.fact_id.as_str())
            && field.class != ShareableContextClass::Prohibited
            && !prohibited_key(&field.key)
        {
            fields.insert(field.key.clone(), field.value.clone());
            fact_ids.insert(field.fact_id.clone());
            provenance_refs.insert(field.provenance_ref.clone());
        }
    }
    if fields.is_empty() {
        return Err(VendorContextError::NoShareableFields);
    }
    Ok((
        fields,
        fact_ids.into_iter().collect(),
        provenance_refs.into_iter().collect(),
    ))
}

pub fn vendor_context_projection_fingerprint(
    grant: &VendorContextGrant,
    available: &[ShareableContextField],
) -> Result<String, VendorContextError> {
    let (fields, fact_ids, provenance_refs) = projection_parts(grant, available)?;
    let mut actions = grant.allowed_actions.clone();
    actions.sort();
    let mut questions = grant.allowed_question_ids.clone();
    questions.sort();
    questions.dedup();
    Ok(stable_hash(&(
        VENDOR_CONTEXT_PROJECTION_VERSION,
        &grant.grant_id,
        &grant.target_vendor_id,
        &grant.response_recipient_id,
        &grant.quotation_id,
        &grant.quotation_version_id,
        &grant.thread_id,
        grant.purpose,
        &actions,
        &questions,
        &fields,
        &fact_ids,
        &provenance_refs,
    )))
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
    if parsed_time(&grant.not_before).is_none_or(|not_before| now < not_before) {
        return Err(VendorContextError::NotYetValid);
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

    let (fields, fact_ids, provenance_refs) = projection_parts(grant, available)?;
    if vendor_context_projection_fingerprint(grant, available)? != grant.projection_fingerprint {
        return Err(VendorContextError::InvalidGrant);
    }
    let mut actions = grant.allowed_actions.clone();
    actions.sort();
    let mut question_ids = grant.allowed_question_ids.clone();
    question_ids.sort();
    question_ids.dedup();
    Ok(VendorContextProjection {
        projection_version: VENDOR_CONTEXT_PROJECTION_VERSION.to_string(),
        projection_fingerprint: grant.projection_fingerprint.clone(),
        grant_id: grant.grant_id.clone(),
        recipient_vendor_id: grant.target_vendor_id.clone(),
        quotation_id: grant.quotation_id.clone(),
        quotation_version_id: grant.quotation_version_id.clone(),
        thread_id: grant.thread_id.clone(),
        response_recipient_id: grant.response_recipient_id.clone(),
        purpose: grant.purpose,
        allowed_actions: actions,
        question_ids,
        fields,
        fact_ids,
        provenance_refs,
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
        stable_message_id(
            "quotation-context-grant",
            &(&grant.thread_id, &grant.grant_id, &hash),
        ),
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
        reference("quotation_version", &grant.quotation_version_id),
        reference("thread", &grant.thread_id),
        reference("target_vendor", &grant.target_vendor_id),
        reference("response_recipient", &grant.response_recipient_id),
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
        stable_message_id(
            "quotation-context-grant-revoked",
            &(&grant_message.thread_id, &revocation.revocation_id, &hash),
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
