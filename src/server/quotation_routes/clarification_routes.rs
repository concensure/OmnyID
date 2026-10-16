//! Approval-bound adapter from persisted quotation clarification events to the existing Gmail sender.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};

use crate::{
    gateway::gmail_api::find_gmail_message_by_rfc822_message_id,
    gateway::smtp_out::{OutgoingEmailRequest, outgoing_message_id_header},
    message::AFPMessage,
    quotation::{
        CLARIFICATION_SEND_RESERVED_KIND, CLARIFICATION_SENT_KIND, ClarificationApproval,
        ClarificationDraft, ClarificationSendDecision, ClarificationSendReceipt,
        QuotationFeatureFlags, authorise_clarification_send, clarification_send_idempotency_key,
        clarification_send_reservation_message, clarification_sent_message, draft_hash,
        replay_quotation_messages,
    },
};

use super::super::{
    AppState, RateLimitPolicy,
    auth::{
        authenticated_rate_limit_key, authenticated_user, enforce_rate_limit,
        store_private_app_message,
    },
    email_group_routes::{gmail_config_for_user, send_gmail_outgoing_request},
};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/quotation/clarifications/send",
        post(send_clarification_http),
    )
}

#[derive(Deserialize)]
struct SendClarificationRequest {
    thread_id: String,
    draft_message_id: String,
    approval_message_id: String,
}

#[derive(Serialize)]
struct SendClarificationResponse {
    sent: bool,
    replayed: bool,
    idempotency_key: String,
    provider_receipt_id: String,
}

#[derive(Deserialize)]
struct ApprovalPayload {
    approval_id: String,
    draft_id: String,
    draft_hash: String,
    recipient: String,
    quotation_version_id: String,
    comparison_revision: String,
    expires_at: String,
}

fn message_kind(message: &AFPMessage) -> &str {
    message
        .kind
        .as_deref()
        .or(message.subtype.as_deref())
        .unwrap_or(message.r#type.as_str())
}

fn message_by_id<'a>(messages: &'a [AFPMessage], id: &str) -> Option<&'a AFPMessage> {
    messages.iter().find(|message| message.id == id)
}

fn parse_draft(message: &AFPMessage) -> Result<ClarificationDraft, (StatusCode, String)> {
    if message_kind(message) != "quotation_clarification_draft"
        && message.r#type != "quotation_clarification_draft"
    {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "clarification draft is invalid".to_string(),
        ));
    }
    let payload = message
        .content
        .get("draft")
        .unwrap_or(&message.content)
        .clone();
    let draft = serde_json::from_value::<ClarificationDraft>(payload).map_err(|_| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            "clarification draft is invalid".to_string(),
        )
    })?;
    let stored_hash = message
        .content
        .get("draft_hash")
        .and_then(serde_json::Value::as_str);
    if stored_hash.is_some_and(|hash| hash != draft_hash(&draft)) {
        return Err((
            StatusCode::CONFLICT,
            "clarification draft hash is stale".to_string(),
        ));
    }
    Ok(draft)
}

fn parse_approval(
    message: &AFPMessage,
    draft_message_id: &str,
) -> Result<ClarificationApproval, (StatusCode, String)> {
    if (message_kind(message) != "quotation_clarification_approval"
        && message.r#type != "quotation_clarification_approval")
        || message.parent_id.as_deref() != Some(draft_message_id)
    {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "clarification approval is invalid".to_string(),
        ));
    }
    let payload = message
        .content
        .get("approval")
        .unwrap_or(&message.content)
        .clone();
    let payload = serde_json::from_value::<ApprovalPayload>(payload).map_err(|_| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            "clarification approval is invalid".to_string(),
        )
    })?;
    Ok(ClarificationApproval {
        approval_id: payload.approval_id,
        draft_id: payload.draft_id,
        draft_hash: payload.draft_hash,
        recipient: payload.recipient,
        quotation_version_id: payload.quotation_version_id,
        comparison_revision: payload.comparison_revision,
        expires_at: payload.expires_at,
        approval_receipt_id: message.id.clone(),
    })
}

fn prior_receipts(messages: &[AFPMessage]) -> Vec<ClarificationSendReceipt> {
    messages
        .iter()
        .filter(|message| message_kind(message) == CLARIFICATION_SENT_KIND)
        .filter_map(|message| message.content.get("receipt"))
        .filter_map(|payload| serde_json::from_value(payload.clone()).ok())
        .collect()
}

fn active_revision_matches(messages: &[AFPMessage], draft: &ClarificationDraft) -> bool {
    let replay = replay_quotation_messages(messages);
    replay.active_version_by_quotation.get(&draft.quotation_id) == Some(&draft.quotation_version_id)
        && replay
            .active_comparisons
            .get(&draft.comparison_revision)
            .is_some_and(|comparison| {
                comparison.candidates.iter().any(|candidate| {
                    candidate.quotation_id == draft.quotation_id
                        && candidate.version_id == draft.quotation_version_id
                })
            })
}

fn clarification_body(draft: &ClarificationDraft) -> String {
    let questions = draft
        .questions
        .iter()
        .enumerate()
        .map(|(index, question)| format!("{}. {}", index + 1, question.question.trim()))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "Hello,\n\nThank you for the quotation. Could you please clarify the following?\n\n{questions}\n\nKind regards"
    )
}

fn outgoing_request(
    request: &SendClarificationRequest,
    draft: &ClarificationDraft,
    idempotency_key: &str,
) -> OutgoingEmailRequest {
    OutgoingEmailRequest {
        thread_id: String::new(),
        message_id: idempotency_key.to_string(),
        parent_id: Some(request.approval_message_id.clone()),
        to: vec![draft.recipient.clone()],
        subject: draft.subject.clone(),
        body: clarification_body(draft),
        in_reply_to: None,
        references: Vec::new(),
    }
}

fn reservation_matches(message: &AFPMessage, expected: &AFPMessage) -> bool {
    const BOUND_FIELDS: &[&str] = &[
        "idempotency_key",
        "draft_id",
        "draft_hash",
        "approval_id",
        "recipient",
        "quotation_version_id",
        "comparison_revision",
    ];
    message_kind(message) == CLARIFICATION_SEND_RESERVED_KIND
        && message.id == expected.id
        && message.parent_id == expected.parent_id
        && message.references == expected.references
        && BOUND_FIELDS
            .iter()
            .all(|field| message.content.get(field) == expected.content.get(field))
}

async fn store_send_receipt(
    state: &AppState,
    user_id: &str,
    request: &SendClarificationRequest,
    reservation_id: &str,
    idempotency_key: &str,
    provider_receipt_id: &str,
    external_message_id: &str,
) -> Result<(), (StatusCode, String)> {
    let receipt = ClarificationSendReceipt {
        idempotency_key: idempotency_key.to_string(),
        provider_receipt_id: provider_receipt_id.to_string(),
        sent_at: chrono::Utc::now().to_rfc3339(),
    };
    let receipt_message = clarification_sent_message(
        &receipt,
        &request.thread_id,
        reservation_id,
        &request.draft_message_id,
        &request.approval_message_id,
        external_message_id,
        user_id,
    );
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        user_id,
        receipt_message,
    )
    .await
    .map_err(|_| super::store_error())?;
    Ok(())
}

async fn reconcile_reserved_send(
    state: &Arc<AppState>,
    user_id: &str,
    request: &SendClarificationRequest,
    draft: &ClarificationDraft,
    reservation: &AFPMessage,
    messages: &[AFPMessage],
) -> Result<Json<SendClarificationResponse>, (StatusCode, String)> {
    let idempotency_key = reservation.content["idempotency_key"]
        .as_str()
        .ok_or((
            StatusCode::CONFLICT,
            "clarification send reservation is invalid".to_string(),
        ))?
        .to_string();
    if let Some(receipt) = prior_receipts(messages)
        .into_iter()
        .find(|receipt| receipt.idempotency_key == idempotency_key)
    {
        return Ok(Json(SendClarificationResponse {
            sent: true,
            replayed: true,
            idempotency_key: receipt.idempotency_key,
            provider_receipt_id: receipt.provider_receipt_id,
        }));
    }
    let gmail_config = gmail_config_for_user(state, user_id).await?;
    let outgoing = outgoing_request(request, draft, &idempotency_key);
    let external_message_id = outgoing_message_id_header(&outgoing);
    let provider_receipt_id =
        find_gmail_message_by_rfc822_message_id(&gmail_config, &external_message_id)
            .await
            .map_err(|error| (StatusCode::BAD_GATEWAY, error))?
            .ok_or((
                StatusCode::CONFLICT,
                "clarification send is reserved but Gmail delivery is not confirmed".to_string(),
            ))?;
    store_send_receipt(
        state,
        user_id,
        request,
        &reservation.id,
        &idempotency_key,
        &provider_receipt_id,
        &external_message_id,
    )
    .await?;
    Ok(Json(SendClarificationResponse {
        sent: true,
        replayed: true,
        idempotency_key,
        provider_receipt_id,
    }))
}

async fn send_clarification_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SendClarificationRequest>,
) -> Result<Json<SendClarificationResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("quotation_clarification_send", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !QuotationFeatureFlags::from_env().clarification_send {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "quotation clarification sending is disabled".to_string(),
        ));
    }
    let messages = super::visible_messages(&state, &headers, &request.thread_id).await?;
    let draft_message = message_by_id(&messages, &request.draft_message_id).ok_or((
        StatusCode::NOT_FOUND,
        "clarification state unavailable".to_string(),
    ))?;
    let approval_message = message_by_id(&messages, &request.approval_message_id).ok_or((
        StatusCode::NOT_FOUND,
        "clarification state unavailable".to_string(),
    ))?;
    let draft = parse_draft(draft_message)?;
    let approval = parse_approval(approval_message, &request.draft_message_id)?;
    let idempotency_key = clarification_send_idempotency_key(&draft, &approval).map_err(|_| {
        (
            StatusCode::CONFLICT,
            "clarification approval is stale".to_string(),
        )
    })?;
    let now = chrono::Utc::now().to_rfc3339();
    let reservation = clarification_send_reservation_message(
        &draft,
        &approval,
        &idempotency_key,
        &request.thread_id,
        &request.draft_message_id,
        &request.approval_message_id,
        &now,
        &user.id,
    );
    if let Some(existing_reservation) = messages
        .iter()
        .find(|message| reservation_matches(message, &reservation))
    {
        return reconcile_reserved_send(
            &state,
            &user.id,
            &request,
            &draft,
            existing_reservation,
            &messages,
        )
        .await;
    }
    if !active_revision_matches(&messages, &draft) {
        return Err((
            StatusCode::CONFLICT,
            "clarification revision is stale".to_string(),
        ));
    }
    let decision = authorise_clarification_send(
        &draft,
        &approval,
        &chrono::Utc::now().to_rfc3339(),
        &prior_receipts(&messages),
    )
    .map_err(|_| {
        (
            StatusCode::CONFLICT,
            "clarification approval is stale".to_string(),
        )
    })?;
    if let ClarificationSendDecision::AlreadySent(receipt) = decision {
        return Ok(Json(SendClarificationResponse {
            sent: true,
            replayed: true,
            idempotency_key: receipt.idempotency_key,
            provider_receipt_id: receipt.provider_receipt_id,
        }));
    }
    let ClarificationSendDecision::Approved {
        idempotency_key: authorised_key,
    } = decision
    else {
        unreachable!()
    };
    debug_assert_eq!(authorised_key, idempotency_key);
    if !draft.recipient.contains('@') || draft.recipient.contains(['\r', '\n']) {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "clarification recipient is invalid".to_string(),
        ));
    }
    // Fail before reserving the idempotency key when Gmail is not connected.
    // Errors after this point may be delivery-ambiguous and therefore remain
    // reserved for explicit provider-receipt reconciliation rather than retry.
    let _gmail_config = gmail_config_for_user(&state, &user.id).await?;
    let outgoing = outgoing_request(&request, &draft, &idempotency_key);
    let external_message_id = outgoing_message_id_header(&outgoing);
    let reservation_id = reservation.id.clone();
    let inserted = store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        reservation.clone(),
    )
    .await
    .map_err(|_| super::store_error())?;
    if !inserted {
        let current_messages =
            super::visible_messages(&state, &headers, &request.thread_id).await?;
        let current_reservation = current_messages
            .iter()
            .find(|message| reservation_matches(message, &reservation))
            .ok_or((
                StatusCode::CONFLICT,
                "clarification send reservation does not match the approved draft".to_string(),
            ))?;
        return reconcile_reserved_send(
            &state,
            &user.id,
            &request,
            &draft,
            current_reservation,
            &current_messages,
        )
        .await;
    }
    let provider_receipt_id = send_gmail_outgoing_request(&state, &user.id, &outgoing).await?;
    store_send_receipt(
        &state,
        &user.id,
        &request,
        &reservation_id,
        &idempotency_key,
        &provider_receipt_id,
        &external_message_id,
    )
    .await?;
    Ok(Json(SendClarificationResponse {
        sent: true,
        replayed: false,
        idempotency_key,
        provider_receipt_id,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quotation::{ClarificationContextFact, ClarificationQuestion};

    fn draft() -> ClarificationDraft {
        ClarificationDraft {
            draft_id: "draft-1".to_string(),
            quotation_id: "quote-1".to_string(),
            quotation_version_id: "quote-1-v2".to_string(),
            comparison_revision: "comparison-1".to_string(),
            recipient: "vendor@example.test".to_string(),
            subject: "Quotation questions".to_string(),
            questions: vec![ClarificationQuestion {
                fact_key: "beverages".to_string(),
                question: "Is beverage service included?".to_string(),
            }],
            context: vec![ClarificationContextFact {
                key: "event.guest_count".to_string(),
                value: "80".to_string(),
            }],
            created_at: "2026-10-17T10:00:00Z".to_string(),
        }
    }

    fn approval(draft: &ClarificationDraft) -> ClarificationApproval {
        ClarificationApproval {
            approval_id: "approval-1".to_string(),
            draft_id: draft.draft_id.clone(),
            draft_hash: draft_hash(draft),
            recipient: draft.recipient.clone(),
            quotation_version_id: draft.quotation_version_id.clone(),
            comparison_revision: draft.comparison_revision.clone(),
            expires_at: "2026-10-17T11:00:00Z".to_string(),
            approval_receipt_id: "approval-message-1".to_string(),
        }
    }

    #[test]
    fn email_body_contains_only_reviewed_questions() {
        let body = clarification_body(&draft());
        assert!(body.contains("1. Is beverage service included?"));
        assert!(!body.contains("guest_count"));
        assert!(!body.contains("competitor"));
    }

    #[test]
    fn persisted_draft_and_approval_bind_the_exact_parent_and_hash() {
        let draft = draft();
        let draft_message = AFPMessage {
            id: "draft-message-1".to_string(),
            thread_id: "thread-1".to_string(),
            r#type: "quotation_clarification_draft".to_string(),
            kind: Some("quotation_clarification_draft".to_string()),
            content: serde_json::json!({
                "draft": draft,
                "draft_hash": draft_hash(&draft),
            }),
            ..Default::default()
        };
        let parsed = parse_draft(&draft_message).expect("persisted draft");
        let approval_message = AFPMessage {
            id: "approval-message-1".to_string(),
            thread_id: "thread-1".to_string(),
            parent_id: Some(draft_message.id.clone()),
            r#type: "quotation_clarification_approval".to_string(),
            kind: Some("quotation_clarification_approval".to_string()),
            content: serde_json::json!({
                "approval_id": "approval-1",
                "draft_id": parsed.draft_id,
                "draft_hash": draft_hash(&parsed),
                "recipient": parsed.recipient,
                "quotation_version_id": parsed.quotation_version_id,
                "comparison_revision": parsed.comparison_revision,
                "expires_at": "2026-10-18T10:00:00Z",
            }),
            ..Default::default()
        };
        let approval =
            parse_approval(&approval_message, &draft_message.id).expect("persisted approval");
        assert_eq!(approval.approval_receipt_id, "approval-message-1");
        assert!(parse_approval(&approval_message, "different-draft").is_err());
    }

    #[test]
    fn stale_stored_hash_is_rejected() {
        let message = AFPMessage {
            r#type: "quotation_clarification_draft".to_string(),
            content: serde_json::json!({
                "draft": draft(),
                "draft_hash": "sha256:stale",
            }),
            ..Default::default()
        };
        assert_eq!(
            parse_draft(&message).expect_err("stale hash").0,
            StatusCode::CONFLICT
        );
    }

    #[test]
    fn reserved_send_remains_exactly_reconcilable_after_approval_expiry() {
        let draft = draft();
        let approval = approval(&draft);
        let key = clarification_send_idempotency_key(&draft, &approval).expect("bound key");
        let original = clarification_send_reservation_message(
            &draft,
            &approval,
            &key,
            "thread-1",
            "draft-message-1",
            "approval-message-1",
            "2026-10-17T10:30:00Z",
            "user-1",
        );
        let expected_during_recovery = clarification_send_reservation_message(
            &draft,
            &approval,
            &key,
            "thread-1",
            "draft-message-1",
            "approval-message-1",
            "2026-10-18T10:30:00Z",
            "user-1",
        );
        assert!(reservation_matches(&original, &expected_during_recovery));
        assert!(
            authorise_clarification_send(&draft, &approval, "2026-10-18T10:30:00Z", &[]).is_err(),
            "an expired approval cannot authorize a fresh send"
        );
        let mut tampered = original;
        tampered.content["recipient"] = serde_json::json!("other@example.test");
        assert!(!reservation_matches(&tampered, &expected_during_recovery));
    }
}
