use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::{
    Evidence, EvidenceState, InclusionState, Money, SourceAnchor, SourceReference,
    currency_exponent,
};

pub const VENDOR_RESPONSE_SCHEMA_VERSION: &str = "quotation.vendor_response.v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorResponseChannel {
    Afp,
    SecureLink,
    Upload,
    Email,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorResponseStatus {
    Draft,
    Submitted,
    Received,
    Reviewed,
    Rejected,
    Superseded,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorResponseEvidenceState {
    Confirmed,
    Proposed,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorAvailabilityState {
    Available,
    Unavailable,
    Conditional,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VendorAttestationAuthority {
    VendorRepresentative,
    ClaimedAgent,
    VerifiedEmailRecipient,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorResponseChannelReceipt {
    pub receipt_id: String,
    pub received_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transport_message_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorQuestionAnswer {
    pub question_id: String,
    pub state: VendorResponseEvidenceState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answer: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub anchors: Vec<SourceAnchor>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum VendorCommercialValue {
    Money(Money),
    Boolean(bool),
    Date(String),
    Text(String),
    Inclusion(InclusionState),
    Integer(i64),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorCommercialFact {
    pub fact_id: String,
    pub key: String,
    pub state: VendorResponseEvidenceState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<VendorCommercialValue>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub anchors: Vec<SourceAnchor>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorAvailability {
    pub state: VendorAvailabilityState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub starts_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub anchors: Vec<SourceAnchor>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorResponseAttachment {
    pub attachment_id: String,
    pub file_name: String,
    pub media_type: String,
    pub size_bytes: u64,
    pub content_hash: String,
    pub source_id: String,
    pub source_version_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorAttestation {
    pub attested_by: String,
    pub authority: VendorAttestationAuthority,
    pub affirmed: bool,
    pub attested_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorResponseSenderIdentity {
    pub identity_id: String,
    pub kind: String,
    pub address: String,
    pub display_name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuotationVendorResponse {
    pub schema_version: String,
    pub response_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_response_id: Option<String>,
    pub vendor_id: String,
    pub thread_id: String,
    pub grant_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub projection_fingerprint: String,
    pub channel: VendorResponseChannel,
    pub channel_receipt: VendorResponseChannelReceipt,
    pub status: VendorResponseStatus,
    pub submitted_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sender_identity: Option<VendorResponseSenderIdentity>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub question_answers: Vec<VendorQuestionAnswer>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub commercial_facts: Vec<VendorCommercialFact>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub availability: Option<VendorAvailability>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sources: Vec<SourceReference>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<VendorResponseAttachment>,
    pub attestation: VendorAttestation,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VendorResponseValidationIssue {
    pub path: String,
    pub code: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum VendorResponseReconciliation {
    Duplicate {
        existing_response_id: String,
        fingerprint: String,
    },
    Successor {
        parent_response_id: String,
        fingerprint: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum VendorResponseReconciliationError {
    Invalid,
    BindingMismatch,
    SuccessorRequired,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorResponseReviewFact {
    pub fact_id: String,
    pub key: String,
    pub vendor_state: VendorResponseEvidenceState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
    pub evidence: Evidence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VendorResponseReviewProposal {
    pub proposal_id: String,
    pub response_id: String,
    pub vendor_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub response_fingerprint: String,
    pub facts: Vec<VendorResponseReviewFact>,
    pub sources: Vec<SourceReference>,
    pub requires_user_review: bool,
}

pub fn vendor_response_status_transition_allowed(
    from: VendorResponseStatus,
    to: VendorResponseStatus,
) -> bool {
    matches!(
        (from, to),
        (VendorResponseStatus::Draft, VendorResponseStatus::Submitted)
            | (
                VendorResponseStatus::Submitted,
                VendorResponseStatus::Received
            )
            | (
                VendorResponseStatus::Received,
                VendorResponseStatus::Reviewed
            )
            | (
                VendorResponseStatus::Received,
                VendorResponseStatus::Rejected
            )
            | (
                VendorResponseStatus::Submitted
                    | VendorResponseStatus::Received
                    | VendorResponseStatus::Reviewed
                    | VendorResponseStatus::Rejected,
                VendorResponseStatus::Superseded
            )
    )
}

fn parsed_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.with_timezone(&Utc))
}

fn canonical_time(value: &str) -> String {
    parsed_time(value)
        .map(|timestamp| timestamp.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
        .unwrap_or_else(|| value.trim().to_string())
}

fn bounded(value: &str, max: usize) -> bool {
    let value = value.trim();
    !value.is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

fn fingerprint_valid(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn valid_vendor_mask(value: &str) -> bool {
    let Some(local) = value.strip_suffix("@omnyid.com") else {
        return false;
    };
    !local.is_empty()
        && local.len() <= 64
        && !local.starts_with('_')
        && !local.ends_with('_')
        && !local.contains("__")
        && local
            .chars()
            .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '_')
}

fn anchor_valid(anchor: &SourceAnchor, sources: &BTreeSet<(&str, &str)>) -> bool {
    bounded(&anchor.source_id, 180)
        && bounded(&anchor.source_version_id, 180)
        && bounded(&anchor.locator, 500)
        && bounded(&anchor.exact_excerpt, 2_000)
        && sources.contains(&(anchor.source_id.as_str(), anchor.source_version_id.as_str()))
}

fn commercial_value_valid(value: &VendorCommercialValue) -> bool {
    match value {
        VendorCommercialValue::Money(money) => {
            money.amount_minor >= 0
                && money.amount_minor <= 9_007_199_254_740_991
                && currency_exponent(&money.currency).is_some()
        }
        VendorCommercialValue::Date(value) => parsed_time(value).is_some(),
        VendorCommercialValue::Text(value) => bounded(value, 4_000),
        VendorCommercialValue::Integer(value) => value.unsigned_abs() <= 9_007_199_254_740_991,
        VendorCommercialValue::Boolean(_) | VendorCommercialValue::Inclusion(_) => true,
    }
}

fn push_issue(issues: &mut Vec<VendorResponseValidationIssue>, path: &str, code: &str) {
    issues.push(VendorResponseValidationIssue {
        path: path.to_string(),
        code: code.to_string(),
    });
}

pub fn validate_vendor_response(
    response: &QuotationVendorResponse,
) -> Vec<VendorResponseValidationIssue> {
    let mut issues = Vec::new();
    if response.schema_version != VENDOR_RESPONSE_SCHEMA_VERSION {
        push_issue(&mut issues, "schema_version", "unsupported_schema");
    }
    for (path, value) in [
        ("response_id", response.response_id.as_str()),
        ("vendor_id", response.vendor_id.as_str()),
        ("thread_id", response.thread_id.as_str()),
        ("grant_id", response.grant_id.as_str()),
        ("quotation_id", response.quotation_id.as_str()),
        (
            "quotation_version_id",
            response.quotation_version_id.as_str(),
        ),
    ] {
        if !bounded(value, 180) {
            push_issue(&mut issues, path, "invalid_identifier");
        }
    }
    if response
        .parent_response_id
        .as_deref()
        .is_some_and(|parent| !bounded(parent, 180) || parent == response.response_id)
    {
        push_issue(&mut issues, "parent_response_id", "invalid_parent");
    }
    if !fingerprint_valid(&response.projection_fingerprint) {
        push_issue(&mut issues, "projection_fingerprint", "invalid_fingerprint");
    }
    let submitted_at = parsed_time(&response.submitted_at);
    if submitted_at.is_none() {
        push_issue(&mut issues, "submitted_at", "invalid_timestamp");
    }
    if response.sender_identity.as_ref().is_some_and(|identity| {
        !bounded(&identity.identity_id, 180)
            || !matches!(identity.kind.as_str(), "connected_email" | "omnyid_mask")
            || !bounded(&identity.address, 254)
            || !identity.address.contains('@')
            || !bounded(&identity.display_name, 180)
            || (identity.kind == "omnyid_mask" && !valid_vendor_mask(&identity.address))
    }) {
        push_issue(&mut issues, "sender_identity", "invalid_sender_identity");
    }
    let received_at = parsed_time(&response.channel_receipt.received_at);
    if !bounded(&response.channel_receipt.receipt_id, 180)
        || received_at.is_none()
        || matches!((submitted_at, received_at), (Some(submitted), Some(received)) if received < submitted)
        || response
            .channel_receipt
            .transport_message_id
            .as_deref()
            .is_some_and(|value| !bounded(value, 300))
    {
        push_issue(&mut issues, "channel_receipt", "invalid_receipt");
    }
    if response.question_answers.len() > 50
        || response.commercial_facts.len() > 100
        || response.sources.len() > 20
        || response.attachments.len() > 20
    {
        push_issue(&mut issues, "$", "collection_limit_exceeded");
    }
    let source_keys = response
        .sources
        .iter()
        .map(|source| (source.source_id.as_str(), source.source_version_id.as_str()))
        .collect::<BTreeSet<_>>();
    if source_keys.len() != response.sources.len()
        || response.sources.iter().any(|source| {
            !bounded(&source.source_id, 180)
                || !bounded(&source.source_version_id, 180)
                || !bounded(&source.media_type, 180)
                || source
                    .content_hash
                    .as_deref()
                    .is_some_and(|hash| !bounded(hash, 200))
        })
    {
        push_issue(&mut issues, "sources", "invalid_or_duplicate_source");
    }
    let mut question_ids = BTreeSet::new();
    for (index, answer) in response.question_answers.iter().enumerate() {
        let path = format!("question_answers[{index}]");
        let answer_shape_valid = match answer.state {
            VendorResponseEvidenceState::Unknown => answer.answer.is_none(),
            VendorResponseEvidenceState::Confirmed | VendorResponseEvidenceState::Proposed => {
                answer
                    .answer
                    .as_deref()
                    .is_some_and(|value| bounded(value, 4_000))
            }
        };
        if !bounded(&answer.question_id, 180)
            || !question_ids.insert(answer.question_id.as_str())
            || !answer_shape_valid
            || answer.anchors.len() > 8
            || answer
                .anchors
                .iter()
                .any(|anchor| !anchor_valid(anchor, &source_keys))
        {
            push_issue(&mut issues, &path, "invalid_answer");
        }
    }
    let mut fact_ids = BTreeSet::new();
    for (index, fact) in response.commercial_facts.iter().enumerate() {
        let path = format!("commercial_facts[{index}]");
        let value_valid = match fact.state {
            VendorResponseEvidenceState::Unknown => fact.value.is_none() && fact.anchors.is_empty(),
            VendorResponseEvidenceState::Proposed => {
                fact.value.as_ref().is_some_and(commercial_value_valid)
            }
            VendorResponseEvidenceState::Confirmed => {
                fact.value.as_ref().is_some_and(commercial_value_valid) && !fact.anchors.is_empty()
            }
        };
        if !bounded(&fact.fact_id, 180)
            || !fact_ids.insert(fact.fact_id.as_str())
            || !bounded(&fact.key, 180)
            || !value_valid
            || fact.anchors.len() > 8
            || fact
                .anchors
                .iter()
                .any(|anchor| !anchor_valid(anchor, &source_keys))
        {
            push_issue(&mut issues, &path, "invalid_commercial_fact");
        }
    }
    if let Some(availability) = &response.availability {
        let starts = availability.starts_at.as_deref().and_then(parsed_time);
        let ends = availability.ends_at.as_deref().and_then(parsed_time);
        if availability.starts_at.is_some() != starts.is_some()
            || availability.ends_at.is_some() != ends.is_some()
            || matches!((starts, ends), (Some(start), Some(end)) if start >= end)
            || availability
                .notes
                .as_deref()
                .is_some_and(|value| !bounded(value, 2_000))
            || availability.anchors.len() > 8
            || availability
                .anchors
                .iter()
                .any(|anchor| !anchor_valid(anchor, &source_keys))
        {
            push_issue(&mut issues, "availability", "invalid_availability");
        }
    }
    if response
        .explanation
        .as_deref()
        .is_some_and(|value| !bounded(value, 4_000))
    {
        push_issue(&mut issues, "explanation", "invalid_explanation");
    }
    let mut attachment_ids = BTreeSet::new();
    for (index, attachment) in response.attachments.iter().enumerate() {
        if !bounded(&attachment.attachment_id, 180)
            || !attachment_ids.insert(attachment.attachment_id.as_str())
            || !bounded(&attachment.file_name, 500)
            || !bounded(&attachment.media_type, 180)
            || attachment.size_bytes == 0
            || attachment.size_bytes > 25 * 1024 * 1024
            || !bounded(&attachment.content_hash, 200)
            || !source_keys.contains(&(
                attachment.source_id.as_str(),
                attachment.source_version_id.as_str(),
            ))
        {
            push_issue(
                &mut issues,
                &format!("attachments[{index}]"),
                "invalid_attachment",
            );
        }
    }
    let attested_at = parsed_time(&response.attestation.attested_at);
    if !bounded(&response.attestation.attested_by, 180)
        || attested_at.is_none()
        || response.status != VendorResponseStatus::Draft && !response.attestation.affirmed
        || matches!((attested_at, submitted_at), (Some(attested), Some(submitted)) if attested > submitted)
    {
        push_issue(&mut issues, "attestation", "invalid_attestation");
    }
    if response.question_answers.is_empty()
        && response.commercial_facts.is_empty()
        && response.availability.is_none()
        && response.explanation.is_none()
        && response.attachments.is_empty()
    {
        push_issue(&mut issues, "$", "empty_response");
    }
    if serde_json::to_vec(response).is_ok_and(|bytes| bytes.len() > 256 * 1024) {
        push_issue(&mut issues, "$", "response_too_large");
    }
    issues
}

fn sorted_values<T: Serialize>(values: impl Iterator<Item = T>) -> Vec<Value> {
    let mut values = values
        .filter_map(|value| serde_json::to_value(value).ok())
        .collect::<Vec<_>>();
    values.sort_by_key(|value| serde_json::to_string(value).unwrap_or_default());
    values
}

fn canonical_source_identity(
    source_keys: &BTreeMap<(&str, &str), String>,
    source_id: &str,
    source_version_id: &str,
) -> String {
    source_keys
        .get(&(source_id, source_version_id))
        .cloned()
        .unwrap_or_else(|| format!("{source_id}\0{source_version_id}"))
}

fn anchor_material(anchor: &SourceAnchor, source_keys: &BTreeMap<(&str, &str), String>) -> Value {
    json!([
        canonical_source_identity(
            source_keys,
            anchor.source_id.trim(),
            anchor.source_version_id.trim()
        ),
        anchor.locator.trim(),
        anchor.exact_excerpt.trim()
    ])
}

fn commercial_value_material(value: &VendorCommercialValue) -> Value {
    match value {
        VendorCommercialValue::Money(value) => {
            json!(["money", value.amount_minor, value.currency.trim()])
        }
        VendorCommercialValue::Boolean(value) => json!(["boolean", value]),
        VendorCommercialValue::Date(value) => json!(["date", canonical_time(value)]),
        VendorCommercialValue::Text(value) => json!(["text", value.trim()]),
        VendorCommercialValue::Inclusion(value) => json!(["inclusion", value]),
        VendorCommercialValue::Integer(value) => json!(["integer", value]),
    }
}

pub fn canonical_vendor_response_material(response: &QuotationVendorResponse) -> Value {
    let source_keys = response
        .sources
        .iter()
        .map(|source| {
            (
                (source.source_id.as_str(), source.source_version_id.as_str()),
                source
                    .content_hash
                    .as_deref()
                    .map(|hash| hash.trim().to_ascii_lowercase())
                    .unwrap_or_else(|| {
                        format!("{}\0{}", source.source_id, source.source_version_id)
                    }),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let answers = sorted_values(response.question_answers.iter().map(|answer| {
        json!([
            answer.question_id.trim(),
            answer.state,
            answer.answer.as_deref().map(str::trim),
            sorted_values(
                answer
                    .anchors
                    .iter()
                    .map(|anchor| anchor_material(anchor, &source_keys))
            )
        ])
    }));
    let facts = sorted_values(response.commercial_facts.iter().map(|fact| {
        json!([
            fact.fact_id.trim(),
            fact.key.trim(),
            fact.state,
            fact.value.as_ref().map(commercial_value_material),
            sorted_values(
                fact.anchors
                    .iter()
                    .map(|anchor| anchor_material(anchor, &source_keys))
            )
        ])
    }));
    let availability = response.availability.as_ref().map(|availability| {
        json!([
            availability.state,
            availability.starts_at.as_deref().map(canonical_time),
            availability.ends_at.as_deref().map(canonical_time),
            availability.notes.as_deref().map(str::trim),
            sorted_values(
                availability
                    .anchors
                    .iter()
                    .map(|anchor| anchor_material(anchor, &source_keys))
            )
        ])
    });
    let sources = sorted_values(response.sources.iter().map(|source| {
        json!([
            canonical_source_identity(
                &source_keys,
                source.source_id.trim(),
                source.source_version_id.trim()
            ),
            source.media_type.trim().to_ascii_lowercase(),
        ])
    }));
    let attachments = sorted_values(response.attachments.iter().map(|attachment| {
        json!([
            attachment.content_hash.trim().to_ascii_lowercase(),
            attachment.media_type.trim().to_ascii_lowercase(),
            attachment.size_bytes,
        ])
    }));
    json!([
        VENDOR_RESPONSE_SCHEMA_VERSION,
        response.vendor_id.trim(),
        response.thread_id.trim(),
        response.grant_id.trim(),
        response.quotation_id.trim(),
        response.quotation_version_id.trim(),
        response.projection_fingerprint.to_ascii_lowercase(),
        answers,
        facts,
        availability,
        response.explanation.as_deref().map(str::trim),
        sources,
        attachments
    ])
}

pub fn vendor_response_fingerprint(
    response: &QuotationVendorResponse,
) -> Result<String, Vec<VendorResponseValidationIssue>> {
    let issues = validate_vendor_response(response);
    if !issues.is_empty() {
        return Err(issues);
    }
    let encoded =
        serde_json::to_vec(&canonical_vendor_response_material(response)).unwrap_or_default();
    Ok(hex::encode(Sha256::digest(encoded)))
}

pub fn vendor_response_review_proposal(
    response: &QuotationVendorResponse,
) -> Result<VendorResponseReviewProposal, Vec<VendorResponseValidationIssue>> {
    let response_fingerprint = vendor_response_fingerprint(response)?;
    let facts = response
        .commercial_facts
        .iter()
        .map(|fact| VendorResponseReviewFact {
            fact_id: fact.fact_id.clone(),
            key: fact.key.clone(),
            vendor_state: fact.state,
            value: fact
                .value
                .as_ref()
                .and_then(|value| serde_json::to_value(value).ok()),
            evidence: Evidence {
                state: match fact.state {
                    VendorResponseEvidenceState::Confirmed => EvidenceState::Confirmed,
                    VendorResponseEvidenceState::Proposed => EvidenceState::Unknown,
                    VendorResponseEvidenceState::Unknown => EvidenceState::Unknown,
                },
                anchors: fact.anchors.clone(),
                rationale: match fact.state {
                    VendorResponseEvidenceState::Confirmed => {
                        Some("vendor_response_exact_source_evidence".to_string())
                    }
                    VendorResponseEvidenceState::Proposed => {
                        Some("vendor_proposed_requires_user_review".to_string())
                    }
                    VendorResponseEvidenceState::Unknown => {
                        Some("vendor_reported_unknown".to_string())
                    }
                },
            },
        })
        .collect::<Vec<_>>();
    let proposal_id = format!("qvrp_{}", &response_fingerprint[..26]);
    Ok(VendorResponseReviewProposal {
        proposal_id,
        response_id: response.response_id.clone(),
        vendor_id: response.vendor_id.clone(),
        quotation_id: response.quotation_id.clone(),
        quotation_version_id: response.quotation_version_id.clone(),
        response_fingerprint,
        facts,
        sources: response.sources.clone(),
        requires_user_review: true,
    })
}

pub fn reconcile_vendor_response(
    existing: &QuotationVendorResponse,
    incoming: &QuotationVendorResponse,
) -> Result<VendorResponseReconciliation, VendorResponseReconciliationError> {
    let existing_fingerprint = vendor_response_fingerprint(existing)
        .map_err(|_| VendorResponseReconciliationError::Invalid)?;
    let incoming_fingerprint = vendor_response_fingerprint(incoming)
        .map_err(|_| VendorResponseReconciliationError::Invalid)?;
    if existing_fingerprint == incoming_fingerprint {
        return Ok(VendorResponseReconciliation::Duplicate {
            existing_response_id: existing.response_id.clone(),
            fingerprint: existing_fingerprint,
        });
    }
    if existing.vendor_id != incoming.vendor_id
        || existing.thread_id != incoming.thread_id
        || existing.grant_id != incoming.grant_id
        || existing.quotation_id != incoming.quotation_id
        || existing.quotation_version_id != incoming.quotation_version_id
        || existing.projection_fingerprint != incoming.projection_fingerprint
    {
        return Err(VendorResponseReconciliationError::BindingMismatch);
    }
    if incoming.parent_response_id.as_deref() != Some(existing.response_id.as_str())
        || parsed_time(&incoming.submitted_at) <= parsed_time(&existing.submitted_at)
    {
        return Err(VendorResponseReconciliationError::SuccessorRequired);
    }
    Ok(VendorResponseReconciliation::Successor {
        parent_response_id: existing.response_id.clone(),
        fingerprint: incoming_fingerprint,
    })
}
