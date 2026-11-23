//! Exact, tenant-private convergence of approved Gmail clarification replies.

use std::{collections::BTreeSet, sync::Arc};

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::sync::broadcast;

use crate::{
    db::Db,
    gateway::smtp_in::{IncomingEmailSource, parse_incoming_email_source},
    message::AFPMessage,
    metrics::Metrics,
    quotation::{
        CLARIFICATION_SENT_KIND, ChannelReconciliationDecision, ClarificationDraft, ClosureState,
        ContextGrantAction, ContextGrantScope, EmailResponseInput, QuotationFeatureFlags,
        QuotationVendorResponse, ResponseCapabilityBinding, SourceReference,
        VendorResponseAttachment, build_email_vendor_response, channel_reconciled_message,
        draft_hash, email_reply_binding_matches, email_vendor_response_message,
        reconcile_response_channels, replay_quotation_messages,
        validate_vendor_revision_email_attachment,
    },
};

use super::{
    auth::store_private_app_message,
    billing::storage_policy_for_account,
    file_upload_routes::{
        build_download_url, delete_uploaded_file, persist_uploaded_file, sanitize_upload_file_name,
        storage_key_for,
    },
    proto_to_app,
    quotation_response_capability_routes::{
        approved_receipt_visible, grant_envelope, grant_revoked,
    },
    quotation_source_routes::prepare_uploaded_quotation_source,
};

const EMAIL_SOURCE_KIND: &str = "quotation_vendor_email_source";
const EMAIL_BLOCKED_KIND: &str = "quotation_vendor_email_response_blocked";
const MAX_RAW_EMAIL_BYTES: usize = 40 * 1024 * 1024;
const MAX_BODY_CHARS: usize = 500_000;

struct InvitationMatch {
    receipt: AFPMessage,
    invitation_message_id: String,
    draft: ClarificationDraft,
    messages: Vec<AFPMessage>,
}

struct ActiveEmailGrant {
    grant_message_id: String,
    binding: ResponseCapabilityBinding,
    scope: ContextGrantScope,
}

struct StoredAttachment {
    source: SourceReference,
    attachment: VendorResponseAttachment,
    source_receipt: Option<Value>,
    parsed_text: Option<String>,
    attachment_json: Value,
    storage_backend: String,
    stored_key: String,
}

fn stable_ulid(namespace: &str, values: &[&str]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(namespace.as_bytes());
    for value in values {
        hasher.update([0]);
        hasher.update(value.as_bytes());
    }
    let digest = hasher.finalize();
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    ulid::Ulid::from_bytes(bytes).to_string()
}

fn message_kind(message: &AFPMessage) -> &str {
    message
        .kind
        .as_deref()
        .or(message.subtype.as_deref())
        .unwrap_or(message.r#type.as_str())
}

fn reference_target<'a>(message: &'a AFPMessage, reference_type: &str) -> Option<&'a str> {
    message.references.iter().find_map(|reference| {
        (reference.get("type").and_then(Value::as_str) == Some(reference_type))
            .then(|| reference.get("target").and_then(Value::as_str))
            .flatten()
    })
}

fn parse_draft(message: &AFPMessage) -> Option<ClarificationDraft> {
    if message_kind(message) != "quotation_clarification_draft" {
        return None;
    }
    let draft = serde_json::from_value::<ClarificationDraft>(
        message
            .content
            .get("draft")
            .unwrap_or(&message.content)
            .clone(),
    )
    .ok()?;
    if message
        .content
        .get("draft_hash")
        .and_then(Value::as_str)
        .is_some_and(|stored| stored != draft_hash(&draft))
    {
        return None;
    }
    Some(draft)
}

async fn owner_messages(
    db: &Db,
    owner_user_id: &str,
    thread_id: &str,
) -> Result<Vec<AFPMessage>, ()> {
    let private = db
        .get_private_thread(owner_user_id, thread_id)
        .await
        .map_err(|_| ())?;
    if private.is_empty() {
        return Err(());
    }
    let public = db.get_thread(thread_id).await.map_err(|_| ())?;
    let mut seen = BTreeSet::new();
    let mut messages = private
        .into_iter()
        .chain(public)
        .filter(|message| seen.insert(message.id.clone()))
        .map(proto_to_app)
        .collect::<Vec<_>>();
    messages.sort_by(|left, right| {
        left.timestamp
            .cmp(&right.timestamp)
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(messages)
}

fn reply_candidates(source: &IncomingEmailSource) -> Vec<String> {
    let mut candidates = Vec::new();
    if let Some(value) = source.summary.in_reply_to.as_deref() {
        let value = value.trim();
        if !value.is_empty() {
            candidates.push(value.to_string());
        }
    }
    for value in &source.summary.reference_targets {
        let value = value.trim();
        if !value.is_empty() && !candidates.iter().any(|candidate| candidate == value) {
            candidates.push(value.to_string());
        }
    }
    candidates
}

async fn exact_invitation_match(
    db: &Db,
    owner_user_id: &str,
    source: &IncomingEmailSource,
) -> Result<Option<InvitationMatch>, ()> {
    let candidates = reply_candidates(source);
    if candidates.is_empty() {
        return Ok(None);
    }
    let receipts = db
        .list_private_messages_by_reference_targets(
            owner_user_id,
            &candidates,
            Some("external_email"),
            None,
            Some(CLARIFICATION_SENT_KIND),
            20,
        )
        .await
        .map_err(|_| ())?;
    let mut matches = Vec::new();
    for receipt in receipts.into_iter().map(proto_to_app) {
        if message_kind(&receipt) != CLARIFICATION_SENT_KIND {
            continue;
        }
        let Some(invitation_message_id) =
            reference_target(&receipt, "external_email").map(str::to_string)
        else {
            continue;
        };
        let Some(draft_message_id) =
            reference_target(&receipt, "clarification_draft").map(str::to_string)
        else {
            continue;
        };
        let Ok(messages) = owner_messages(db, owner_user_id, &receipt.thread_id).await else {
            continue;
        };
        let Some(draft) = messages
            .iter()
            .find(|message| message.id == draft_message_id)
            .and_then(parse_draft)
        else {
            continue;
        };
        if email_reply_binding_matches(
            &source.summary.smtp_from,
            &draft.recipient,
            &candidates,
            &invitation_message_id,
        ) {
            matches.push(InvitationMatch {
                receipt,
                invitation_message_id,
                draft,
                messages,
            });
        }
    }
    if matches.len() == 1 {
        Ok(matches.pop())
    } else {
        // Zero and ambiguous matches are both deliberately non-attributable.
        Ok(None)
    }
}

fn active_email_grant(
    owner_user_id: &str,
    invitation: &InvitationMatch,
    now: DateTime<Utc>,
) -> Option<ActiveEmailGrant> {
    let replay = replay_quotation_messages(&invitation.messages);
    let closure_terminal = replay
        .active_closures
        .get(&invitation.draft.quotation_id)
        .is_some_and(|closure| {
            matches!(
                closure.state,
                ClosureState::BookingConfirmed
                    | ClosureState::Cancelled
                    | ClosureState::Refunded
                    | ClosureState::Superseded
            )
        });
    if closure_terminal
        || replay
            .active_version_by_quotation
            .get(&invitation.draft.quotation_id)
            != Some(&invitation.draft.quotation_version_id)
    {
        return None;
    }
    let mut matches = invitation
        .messages
        .iter()
        .filter_map(|message| {
            let envelope = grant_envelope(message)?;
            let grant = envelope.grant;
            let not_before = DateTime::parse_from_rfc3339(&grant.not_before)
                .ok()?
                .with_timezone(&Utc);
            let expires_at = DateTime::parse_from_rfc3339(&grant.expires_at)
                .ok()?
                .with_timezone(&Utc);
            (grant.granted_by_user_id == owner_user_id
                && grant.thread_id == invitation.receipt.thread_id
                && grant.quotation_id == invitation.draft.quotation_id
                && grant.quotation_version_id == invitation.draft.quotation_version_id
                && grant
                    .response_recipient_id
                    .eq_ignore_ascii_case(&invitation.draft.recipient)
                && grant
                    .allowed_actions
                    .contains(&ContextGrantAction::AnswerQuestions)
                && message.parent_id.as_deref() == Some(grant.approval_receipt_ref.as_str())
                && approved_receipt_visible(&invitation.messages, &grant)
                && !grant_revoked(&invitation.messages, &grant.grant_id)
                && now >= not_before
                && now < expires_at)
                .then_some(ActiveEmailGrant {
                    grant_message_id: message.id.clone(),
                    binding: ResponseCapabilityBinding {
                        grant_id: grant.grant_id,
                        vendor_id: grant.target_vendor_id,
                        response_recipient_id: grant.response_recipient_id,
                        quotation_id: grant.quotation_id,
                        quotation_version_id: grant.quotation_version_id,
                        thread_id: grant.thread_id,
                        projection_fingerprint: grant.projection_fingerprint,
                        allowed_actions: grant.allowed_actions,
                        allowed_question_ids: grant.allowed_question_ids,
                        not_before: grant.not_before,
                        expires_at: grant.expires_at,
                    },
                    scope: grant.scope,
                })
        })
        .collect::<Vec<_>>();
    (matches.len() == 1).then(|| matches.pop()).flatten()
}

fn existing_responses(messages: &[AFPMessage]) -> Vec<QuotationVendorResponse> {
    messages
        .iter()
        .filter_map(|message| message.content.get("response"))
        .filter_map(|value| serde_json::from_value(value.clone()).ok())
        .collect()
}

fn base_private_message(
    id: String,
    thread_id: &str,
    parent_id: &str,
    owner_user_id: &str,
    timestamp: &str,
    kind: &str,
) -> AFPMessage {
    AFPMessage {
        protocol: "afp-v1".to_string(),
        id,
        thread_id: thread_id.to_string(),
        parent_id: Some(parent_id.to_string()),
        from: "agent://email-gateway".to_string(),
        to: vec![owner_user_id.to_string()],
        timestamp: timestamp.to_string(),
        r#type: "ledger".to_string(),
        kind: Some(kind.to_string()),
        supertags: vec!["quotation".to_string(), "review:required".to_string()],
        subtype: Some(kind.to_string()),
        content: Value::Null,
        metadata: Some(json!({
            "privacy_scope": "tenant_private",
            "provider_delivery_is_booking_evidence": false,
        })),
        signature: String::new(),
        encryption: None,
        views: vec![],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![],
        store_in_relational: true,
        prev_hash: None,
    }
}

async fn store_blocker(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    owner_user_id: &str,
    invitation: &InvitationMatch,
    source: &IncomingEmailSource,
    code: &str,
) {
    let timestamp = Utc::now().to_rfc3339();
    let id = stable_ulid(
        "quotation-email-response-blocked",
        &[owner_user_id, &source.summary.smtp_message_id, code],
    );
    let mut message = base_private_message(
        id,
        &invitation.receipt.thread_id,
        &invitation.receipt.id,
        owner_user_id,
        &timestamp,
        EMAIL_BLOCKED_KIND,
    );
    message.content = json!({
        "progress": "received",
        "blocker": code,
        "smtp_message_id": source.summary.smtp_message_id,
        "requires_manual_review": true,
        "canonical_response_created": false,
        "booking": false,
        "payment_execution": false,
    });
    message.references = vec![
        json!({"type": "clarification_sent", "target": invitation.receipt.id}),
        json!({"type": "external_email", "target": source.summary.smtp_message_id}),
    ];
    message.typed_refs = message.references.clone();
    let _ = store_private_app_message(db, metrics, relay_tx, owner_user_id, message).await;
}

async fn cleanup_attachments(attachments: &[StoredAttachment]) {
    for attachment in attachments {
        let _ = delete_uploaded_file(&attachment.storage_backend, &attachment.stored_key).await;
    }
}

fn inline_attachment_preparation_supported(media_type: &str) -> bool {
    media_type.starts_with("text/") || media_type.starts_with("image/")
}

async fn prepare_attachments(
    db: &Db,
    owner_user_id: &str,
    source_message_id: &str,
    source: &IncomingEmailSource,
) -> Result<Vec<StoredAttachment>, &'static str> {
    if source.attachments_blocked {
        return Err("attachment_limits_exceeded");
    }
    if source.attachments.is_empty() {
        return Ok(vec![]);
    }
    let owner = db
        .find_user_by_id(owner_user_id)
        .await
        .map_err(|_| "owner_unavailable")?
        .ok_or("owner_unavailable")?;
    let billing = db
        .get_billing_status(owner_user_id)
        .await
        .map_err(|_| "storage_policy_unavailable")?;
    let policy = storage_policy_for_account(
        billing
            .get("plan")
            .and_then(Value::as_str)
            .unwrap_or("free"),
        &owner.email,
    );
    let used = db
        .attachment_storage_bytes_for_user(owner_user_id)
        .await
        .map_err(|_| "storage_policy_unavailable")?;
    let incoming = source
        .attachments
        .iter()
        .try_fold(0_i64, |total, item| {
            i64::try_from(item.bytes.len())
                .ok()
                .and_then(|size| total.checked_add(size))
        })
        .ok_or("attachment_limits_exceeded")?;
    if billing
        .get("archive_only_enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || source.attachments.iter().any(|item| {
            i64::try_from(item.bytes.len())
                .map(|size| size > policy.max_upload_bytes)
                .unwrap_or(true)
        })
        || used.saturating_add(incoming) > policy.quota_bytes
    {
        return Err("attachment_storage_unavailable");
    }

    let mut media_types = Vec::with_capacity(source.attachments.len());
    for incoming in &source.attachments {
        let file_name = sanitize_upload_file_name(&incoming.file_name);
        let validated = validate_vendor_revision_email_attachment(
            &file_name,
            Some(&incoming.media_type),
            &incoming.bytes,
        )
        .map_err(|_| "attachment_policy_rejected")?;
        match crate::gateway::clamav::scan_bytes(&incoming.bytes).await {
            Ok(Some(result)) if !result.is_infected => {}
            Ok(Some(_)) => return Err("attachment_malware_rejected"),
            Ok(None) | Err(_) => return Err("attachment_scanner_unavailable"),
        }
        media_types.push(validated.media_type);
    }

    let mut stored = Vec::new();
    for (index, (incoming, media_type)) in source.attachments.iter().zip(media_types).enumerate() {
        let file_name = sanitize_upload_file_name(&incoming.file_name);
        let raw_hash = format!("sha256:{}", hex::encode(Sha256::digest(&incoming.bytes)));
        let version_id = format!("{source_message_id}:attachment:{}", index + 1);
        let prepared = if inline_attachment_preparation_supported(media_type) {
            prepare_uploaded_quotation_source(
                owner_user_id,
                source_message_id,
                &version_id,
                &file_name,
                media_type,
                &incoming.bytes,
                None,
            )
            .await
            .ok()
        } else {
            // PDF/DOCX bytes remain immutable review sources. The shared inline
            // parser cannot safely extract them without existing prepared text
            // or a fetchable object URL, so never decode binary as text.
            None
        };
        let content_hash = prepared
            .as_ref()
            .map(|item| item.receipt.content_hash.clone())
            .unwrap_or_else(|| raw_hash.clone());
        let attachment_id = stable_ulid(
            "quotation-email-attachment",
            &[source_message_id, &index.to_string(), &raw_hash],
        );
        let storage_key =
            storage_key_for(owner_user_id, &ulid::Ulid::new().to_string(), &file_name);
        let (storage_backend, stored_key) =
            match persist_uploaded_file(&storage_key, &incoming.bytes, media_type).await {
                Ok(value) => value,
                Err(_) => {
                    cleanup_attachments(&stored).await;
                    return Err("attachment_storage_unavailable");
                }
            };
        let download_url = match build_download_url(
            &attachment_id,
            &storage_backend,
            &stored_key,
            &file_name,
            media_type,
        ) {
            Ok(value) => value,
            Err(_) => {
                let _ = delete_uploaded_file(&storage_backend, &stored_key).await;
                cleanup_attachments(&stored).await;
                return Err("attachment_storage_unavailable");
            }
        };
        let size_bytes = incoming.bytes.len() as u64;
        stored.push(StoredAttachment {
            source: SourceReference {
                source_id: source_message_id.to_string(),
                source_version_id: version_id.clone(),
                media_type: media_type.to_string(),
                content_hash: Some(content_hash),
            },
            attachment: VendorResponseAttachment {
                attachment_id: attachment_id.clone(),
                file_name: file_name.clone(),
                media_type: media_type.to_string(),
                size_bytes,
                content_hash: raw_hash.clone(),
                source_id: source_message_id.to_string(),
                source_version_id: version_id,
            },
            source_receipt: prepared
                .as_ref()
                .and_then(|item| serde_json::to_value(&item.receipt).ok()),
            parsed_text: prepared.map(|item| item.parsed_text),
            attachment_json: json!({
                "id": attachment_id,
                "name": file_name,
                "mime_type": media_type,
                "size_bytes": size_bytes,
                "storage": {
                    "backend": storage_backend,
                    "key": stored_key,
                    "download_url": download_url,
                },
                "encryption": {"scheme": "none"},
                "sha256": raw_hash.trim_start_matches("sha256:"),
            }),
            storage_backend,
            stored_key,
        });
    }
    Ok(stored)
}

pub(crate) async fn try_ingest_quotation_email_response(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    owner_user_id: &str,
    raw_gateway_message_id: &str,
    raw_email: &[u8],
) -> Result<(), String> {
    if !QuotationFeatureFlags::from_env().email_response_reconciliation {
        return Ok(());
    }
    if raw_email.len() > MAX_RAW_EMAIL_BYTES {
        return Ok(());
    }
    let source = parse_incoming_email_source(raw_email);
    let smtp_message_id = source.summary.smtp_message_id.trim();
    if source.body.trim().is_empty()
        || source.body.chars().count() > MAX_BODY_CHARS
        || !smtp_message_id.starts_with('<')
        || !smtp_message_id.ends_with('>')
    {
        return Ok(());
    }
    let Some(invitation) = exact_invitation_match(db, owner_user_id, &source)
        .await
        .map_err(|_| "quotation email match lookup failed".to_string())?
    else {
        return Ok(());
    };
    let now = Utc::now();
    let Some(active_grant) = active_email_grant(owner_user_id, &invitation, now) else {
        return Ok(());
    };
    let source_message_id = stable_ulid(
        "quotation-email-source",
        &[
            owner_user_id,
            &invitation.receipt.thread_id,
            &source.summary.smtp_message_id,
        ],
    );
    if invitation
        .messages
        .iter()
        .any(|message| message.id == source_message_id)
    {
        if !invitation
            .messages
            .iter()
            .any(|message| message.parent_id.as_deref() == Some(source_message_id.as_str()))
        {
            store_blocker(
                db,
                metrics,
                relay_tx,
                owner_user_id,
                &invitation,
                &source,
                "partial_ingestion_requires_manual_review",
            )
            .await;
        }
        return Ok(());
    }
    let body_version_id = format!("{source_message_id}:body");
    let body_prepared = prepare_uploaded_quotation_source(
        owner_user_id,
        &source_message_id,
        &body_version_id,
        "email-body.txt",
        &source.body_media_type,
        source.body.as_bytes(),
        None,
    )
    .await
    .map_err(|_| "quotation email body preparation failed".to_string())?;
    let attachments =
        match prepare_attachments(db, owner_user_id, &source_message_id, &source).await {
            Ok(attachments) => attachments,
            Err(code) => {
                store_blocker(
                    db,
                    metrics,
                    relay_tx,
                    owner_user_id,
                    &invitation,
                    &source,
                    code,
                )
                .await;
                return Ok(());
            }
        };
    let mut sources = vec![SourceReference {
        source_id: source_message_id.clone(),
        source_version_id: body_version_id,
        media_type: source.body_media_type.clone(),
        content_hash: Some(body_prepared.receipt.content_hash.clone()),
    }];
    sources.extend(attachments.iter().map(|item| item.source.clone()));
    let mut response = match build_email_vendor_response(EmailResponseInput {
        binding: active_grant.binding.clone(),
        recipient_email: invitation.draft.recipient.clone(),
        smtp_message_id: source.summary.smtp_message_id.clone(),
        source: sources[0].clone(),
        received_at: now,
        explanation: body_prepared.parsed_text.chars().take(4_000).collect(),
        question_answers: vec![],
        commercial_facts: vec![],
    }) {
        Ok(response) => response,
        Err(_) => {
            cleanup_attachments(&attachments).await;
            return Err("quotation email response is invalid".to_string());
        }
    };
    response.sources = sources;
    response.attachments = attachments
        .iter()
        .map(|item| item.attachment.clone())
        .collect();
    let existing = existing_responses(&invitation.messages);
    let decision = match reconcile_response_channels(&existing, response) {
        Ok(decision) => decision,
        Err(_) => {
            cleanup_attachments(&attachments).await;
            return Err("quotation email response reconciliation failed".to_string());
        }
    };
    if active_grant.scope == ContextGrantScope::SingleUse
        && !existing.is_empty()
        && !matches!(decision, ChannelReconciliationDecision::Duplicate { .. })
    {
        cleanup_attachments(&attachments).await;
        store_blocker(
            db,
            metrics,
            relay_tx,
            owner_user_id,
            &invitation,
            &source,
            "single_use_grant_consumed",
        )
        .await;
        return Ok(());
    }

    let timestamp = now.to_rfc3339();
    let mut source_message = base_private_message(
        source_message_id.clone(),
        &invitation.receipt.thread_id,
        &invitation.receipt.id,
        owner_user_id,
        &timestamp,
        EMAIL_SOURCE_KIND,
    );
    source_message.content = json!({
        "subject": source.summary.subject,
        "from": source.summary.smtp_from,
        "to": source.summary.smtp_to,
        "body": source.body,
        "source_receipt": body_prepared.receipt,
        "parsed_text": body_prepared.parsed_text,
        "attachment_sources": attachments.iter().map(|item| json!({
            "source": item.source,
            "source_receipt": item.source_receipt,
            "parsed_text": item.parsed_text,
        })).collect::<Vec<_>>(),
        "progress": "parsed",
        "requires_user_review": true,
        "booking": false,
        "payment_execution": false,
    });
    source_message.references = vec![
        json!({"type": "clarification_sent", "target": invitation.receipt.id}),
        json!({"type": "quotation_context_grant", "target": active_grant.grant_message_id}),
        json!({"type": "external_email", "target": source.summary.smtp_message_id}),
        json!({"type": "external_email_invitation", "target": invitation.invitation_message_id}),
        json!({"type": "gateway_message", "target": raw_gateway_message_id}),
    ];
    source_message.typed_refs = source_message.references.clone();
    source_message.attachments = attachments
        .iter()
        .map(|item| item.attachment_json.clone())
        .collect();
    let stored =
        match store_private_app_message(db, metrics, relay_tx, owner_user_id, source_message).await
        {
            Ok(stored) => stored,
            Err(_) => {
                cleanup_attachments(&attachments).await;
                return Err("quotation email source storage failed".to_string());
            }
        };
    if !stored {
        cleanup_attachments(&attachments).await;
        return Ok(());
    }
    let response_message = match decision {
        ChannelReconciliationDecision::New(response)
        | ChannelReconciliationDecision::Successor(response) => email_vendor_response_message(
            &response,
            &active_grant.grant_message_id,
            &source_message_id,
        )
        .map_err(|_| "quotation email response message failed".to_string())?,
        ChannelReconciliationDecision::Duplicate {
            existing_response_id,
            fingerprint,
        } => {
            let incoming = build_email_vendor_response(EmailResponseInput {
                binding: active_grant.binding,
                recipient_email: invitation.draft.recipient,
                smtp_message_id: source.summary.smtp_message_id,
                source: SourceReference {
                    source_id: source_message_id.clone(),
                    source_version_id: format!("{source_message_id}:body"),
                    media_type: source.body_media_type.clone(),
                    content_hash: Some(body_prepared.receipt.content_hash),
                },
                received_at: now,
                explanation: body_prepared.parsed_text.chars().take(4_000).collect(),
                question_answers: vec![],
                commercial_facts: vec![],
            })
            .map_err(|_| "quotation email duplicate receipt failed".to_string())?;
            channel_reconciled_message(
                &incoming,
                &existing_response_id,
                &fingerprint,
                &source_message_id,
            )
        }
    };
    store_private_app_message(db, metrics, relay_tx, owner_user_id, response_message)
        .await
        .map_err(|_| "quotation email response storage failed".to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reply_candidates_require_thread_headers_and_dedupe() {
        let source = IncomingEmailSource {
            summary: crate::gateway::smtp_in::IncomingEmailSummary {
                subject: "Reply".into(),
                smtp_from: "vendor@example.test".into(),
                smtp_to: "couple@example.test".into(),
                body_preview: "Yes".into(),
                smtp_message_id: "<reply@example.test>".into(),
                in_reply_to: Some("<invite@example.test>".into()),
                reference_targets: vec![
                    "<root@example.test>".into(),
                    "<invite@example.test>".into(),
                ],
                external_conversation_key: "thread".into(),
            },
            body: "Yes".into(),
            body_media_type: "text/plain".into(),
            attachments: vec![],
            attachments_blocked: false,
        };
        assert_eq!(
            reply_candidates(&source),
            vec!["<invite@example.test>", "<root@example.test>"]
        );
    }

    #[test]
    fn source_ids_are_deterministic_without_exposing_addresses() {
        let first = stable_ulid(
            "quotation-email-source",
            &["owner", "thread", "<reply@example.test>"],
        );
        let second = stable_ulid(
            "quotation-email-source",
            &["owner", "thread", "<reply@example.test>"],
        );
        assert_eq!(first, second);
        assert_eq!(first.len(), 26);
        assert!(!first.contains('@'));
    }

    #[test]
    fn binary_office_attachments_are_never_lossily_decoded_as_text() {
        assert!(inline_attachment_preparation_supported("text/plain"));
        assert!(inline_attachment_preparation_supported("image/png"));
        assert!(!inline_attachment_preparation_supported("application/pdf"));
        assert!(!inline_attachment_preparation_supported(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ));
    }
}
