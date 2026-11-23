//! Server-authoritative RSVP reminder delivery.
//!
//! The browser may point at an approval, but it cannot supply recipients or
//! content to the provider. This adapter reloads the tenant-private AFP
//! thread, binds the exact stored draft and approval, reserves an idempotency
//! key, and records provider and retry outcomes as separate AFP events.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::{
    gateway::vendor_mail_provider::{
        VendorMailConfig, VendorMailDeliveryState, VendorMailSendRequest, recipient_is_allowlisted,
        send_allowlisted_cloudflare_vendor_mail,
    },
    message::AFPMessage,
};

use super::{
    AppState, RateLimitPolicy,
    auth::{
        authenticated_rate_limit_key, authenticated_user, enforce_rate_limit,
        store_private_app_message, thread_messages_for_headers,
    },
};

const DRAFT_KIND: &str = "wedding_rsvp_reminder_draft";
const APPROVAL_KIND: &str = "wedding_rsvp_reminder_approval";
const RESERVATION_KIND: &str = "wedding_rsvp_reminder_send_reserved";
const RECEIPT_KIND: &str = "wedding_rsvp_reminder_receipt";
const RETRY_KIND: &str = "wedding_rsvp_reminder_retry_decision";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/wedding/rsvp/reminders/status", get(status_http))
        .route("/wedding/rsvp/reminders/send", post(send_http))
        .route("/wedding/rsvp/tests/status", get(test_status_http))
        .route("/wedding/rsvp/tests/send", post(test_send_http))
}

#[derive(Deserialize)]
struct SendRequest {
    thread_id: String,
    approval_message_id: String,
}

#[derive(Serialize)]
struct SendResponse {
    sent: bool,
    replayed: bool,
    delivery_status: String,
    idempotency_key: String,
    provider_receipt_id: Option<String>,
}

#[derive(Serialize)]
struct StatusResponse {
    enabled: bool,
    ready: bool,
    provider: String,
    reason: String,
}

const TEST_DRAFT_KIND: &str = "wedding_rsvp_test_draft";
const TEST_APPROVAL_KIND: &str = "wedding_rsvp_test_approval";
const TEST_RESERVATION_KIND: &str = "wedding_rsvp_test_send_reserved";
const TEST_RECEIPT_KIND: &str = "wedding_rsvp_test_receipt";

#[derive(Clone, Debug)]
struct ApprovedTest {
    approval_message_id: String,
    draft_message_id: String,
    test_id: String,
    recipient: String,
    subject: String,
    host_label: String,
    fallback_url: String,
    exact_content: String,
    wedding_plan_id: String,
    response_workspace_id: String,
}

fn test_send_enabled() -> bool {
    std::env::var("OMNYID_WEDDING_RSVP_TEST_SEND_ENABLED").is_ok_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes"
        )
    })
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ApprovedReminder {
    approval_message_id: String,
    draft_message_id: String,
    draft_id: String,
    household_id: String,
    household_label: String,
    recipient: String,
    exact_content: String,
    wedding_plan_id: String,
    response_workspace_id: String,
}

fn send_enabled() -> bool {
    std::env::var("OMNYID_WEDDING_RSVP_REMINDER_SEND_ENABLED").is_ok_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes"
        )
    })
}

fn kind(message: &AFPMessage) -> &str {
    message
        .kind
        .as_deref()
        .or(message.subtype.as_deref())
        .unwrap_or(&message.r#type)
}

fn clean(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn strings(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn metadata_scope(message: &AFPMessage) -> (String, String) {
    let metadata = message.metadata.as_ref();
    let wedding_plan_id = clean(metadata.and_then(|value| {
        value
            .get("weddingPlanId")
            .or_else(|| value.get("wedding_plan_id"))
    }));
    let response_workspace_id = clean(metadata.and_then(|value| {
        value
            .get("responseWorkspaceId")
            .or_else(|| value.get("response_workspace_id"))
    }));
    (wedding_plan_id, response_workspace_id)
}

fn valid_email(value: &str) -> bool {
    value.len() <= 254
        && !value.chars().any(char::is_control)
        && !value.contains(char::is_whitespace)
        && value
            .rsplit_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain.contains('.'))
}

fn parse_approved_reminder(
    messages: &[AFPMessage],
    approval_message_id: &str,
) -> Result<ApprovedReminder, (StatusCode, String)> {
    let approval = messages
        .iter()
        .find(|message| message.id == approval_message_id && kind(message) == APPROVAL_KIND)
        .ok_or((
            StatusCode::NOT_FOUND,
            "RSVP reminder approval is unavailable".to_string(),
        ))?;
    let draft_id = clean(approval.content.get("draft_id"));
    let draft = messages
        .iter()
        .rev()
        .find(|message| {
            kind(message) == DRAFT_KIND && clean(message.content.get("draft_id")) == draft_id
        })
        .ok_or((
            StatusCode::CONFLICT,
            "The approved RSVP reminder draft is unavailable".to_string(),
        ))?;
    let bound_fields = [
        "household_id",
        "recipient_labels",
        "contact_labels",
        "invitation_ids",
        "exact_content",
    ];
    if draft_id.is_empty()
        || clean(approval.content.get("approval_status")) != "approved"
        || approval
            .content
            .get("sends_message")
            .and_then(Value::as_bool)
            != Some(false)
        || draft.content.get("sends_message").and_then(Value::as_bool) != Some(false)
        || bound_fields
            .iter()
            .any(|field| approval.content.get(*field) != draft.content.get(*field))
    {
        return Err((
            StatusCode::CONFLICT,
            "The RSVP reminder approval no longer matches its draft".to_string(),
        ));
    }
    let contacts = strings(approval.content.get("contact_labels"));
    let household_id = clean(approval.content.get("household_id"));
    let household_label = clean(draft.content.get("household_label"));
    let exact_content = clean(approval.content.get("exact_content"));
    let approval_scope = metadata_scope(approval);
    let draft_scope = metadata_scope(draft);
    if contacts.len() != 1
        || !valid_email(&contacts[0])
        || household_id.is_empty()
        || household_id.len() > 180
        || household_label.is_empty()
        || household_label.len() > 300
        || exact_content.is_empty()
        || exact_content.len() > 20_000
        || approval_scope != draft_scope
        || approval_scope.0.is_empty()
        || approval_scope.1.is_empty()
    {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "The approved RSVP reminder is invalid".to_string(),
        ));
    }
    Ok(ApprovedReminder {
        approval_message_id: approval.id.clone(),
        draft_message_id: draft.id.clone(),
        draft_id,
        household_id,
        household_label,
        recipient: contacts[0].to_ascii_lowercase(),
        exact_content,
        wedding_plan_id: approval_scope.0,
        response_workspace_id: approval_scope.1,
    })
}

fn idempotency_key(reminder: &ApprovedReminder) -> String {
    hex::encode(Sha256::digest(
        format!(
            "{}\n{}\n{}\n{}\n{}\n{}",
            reminder.approval_message_id,
            reminder.draft_message_id,
            reminder.draft_id,
            reminder.household_id,
            reminder.recipient,
            reminder.exact_content,
        )
        .as_bytes(),
    ))
}

fn deterministic_message_id(key: &str) -> String {
    // AFP message ids use the 26-character Crockford/ULID shape. A raw SHA-256
    // prefix can begin above `7`, which is not a valid ULID timestamp and is
    // rejected by the shared message store. Prefixing the first 25 hex digits
    // with zero keeps the id deterministic while remaining a valid AFP id.
    format!("0{}", &key[..25]).to_ascii_uppercase()
}

fn metadata(reminder: &ApprovedReminder) -> Value {
    json!({
        "store": true,
        "template": "wedding_planning",
        "weddingPlanId": reminder.wedding_plan_id,
        "responseWorkspaceId": reminder.response_workspace_id,
        "origin": "wedding_rsvp_reminder_provider",
    })
}

fn lifecycle_message(
    thread_id: &str,
    parent_id: &str,
    kind_value: &str,
    reminder: &ApprovedReminder,
    content: Value,
    supertags: &[&str],
) -> AFPMessage {
    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: ulid::Ulid::new().to_string(),
        thread_id: thread_id.to_string(),
        parent_id: Some(parent_id.to_string()),
        from: "agent://wedding-planning".to_string(),
        to: vec!["user://wedding-couple".to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "ledger".to_string(),
        kind: Some(kind_value.to_string()),
        subtype: Some(kind_value.to_string()),
        content,
        metadata: Some(metadata(reminder)),
        supertags: supertags.iter().map(|value| value.to_string()).collect(),
        references: vec![
            json!({"type":"approval", "target":reminder.approval_message_id, "label":"Exact reminder approval"}),
            json!({"type":"draft", "target":reminder.draft_message_id, "label":"Approved reminder draft"}),
        ],
        store_in_relational: true,
        ..AFPMessage::default()
    }
}

fn reservation_message(thread_id: &str, reminder: &ApprovedReminder, key: &str) -> AFPMessage {
    let mut message = lifecycle_message(
        thread_id,
        &reminder.approval_message_id,
        RESERVATION_KIND,
        reminder,
        json!({
            "kind": RESERVATION_KIND,
            "contract_version": 1,
            "approval_message_id": reminder.approval_message_id,
            "draft_message_id": reminder.draft_message_id,
            "draft_id": reminder.draft_id,
            "household_id": reminder.household_id,
            "idempotency_key": key,
            "provider_called": false,
            "created_at": chrono::Utc::now().to_rfc3339(),
        }),
        &[
            "template:wedding_planning",
            "wedding_rsvp:reminder_send_reserved",
            "external_send:reserved",
        ],
    );
    // The database insert is the concurrency boundary: simultaneous requests
    // for the same exact approval resolve to one deterministic transport ID.
    message.id = deterministic_message_id(key);
    message
}

fn existing_lifecycle<'a>(
    messages: &'a [AFPMessage],
    key: &str,
    event_kind: &str,
) -> Option<&'a AFPMessage> {
    messages.iter().rev().find(|message| {
        kind(message) == event_kind && clean(message.content.get("idempotency_key")) == key
    })
}

async fn store(
    state: &AppState,
    user_id: &str,
    message: AFPMessage,
) -> Result<bool, (StatusCode, String)> {
    store_private_app_message(&state.db, &state.metrics, &state.relay_tx, user_id, message)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "RSVP reminder lifecycle was not stored".to_string(),
            )
        })
}

async fn store_receipt(
    state: &AppState,
    user_id: &str,
    thread_id: &str,
    reservation_id: &str,
    reminder: &ApprovedReminder,
    key: &str,
    status: &str,
    provider: &str,
    provider_receipt_id: Option<&str>,
    failure_kind: Option<&str>,
) -> Result<(), (StatusCode, String)> {
    let message = lifecycle_message(
        thread_id,
        reservation_id,
        RECEIPT_KIND,
        reminder,
        json!({
            "kind": RECEIPT_KIND,
            "contract_version": 1,
            "household_id": reminder.household_id,
            "delivery_status": status,
            "provider": provider,
            "provider_message_id": provider_receipt_id,
            "failure_kind": failure_kind,
            "idempotency_key": key,
            "created_at": chrono::Utc::now().to_rfc3339(),
        }),
        &[
            "template:wedding_planning",
            "wedding_rsvp:reminder_receipt",
            "external_send:receipt",
        ],
    );
    store(state, user_id, message).await.map(|_| ())
}

async fn store_retry_decision(
    state: &AppState,
    user_id: &str,
    thread_id: &str,
    reservation_id: &str,
    reminder: &ApprovedReminder,
    key: &str,
    decision: &str,
    reason: &str,
) -> Result<(), (StatusCode, String)> {
    let message = lifecycle_message(
        thread_id,
        reservation_id,
        RETRY_KIND,
        reminder,
        json!({
            "kind": RETRY_KIND,
            "contract_version": 1,
            "household_id": reminder.household_id,
            "idempotency_key": key,
            "retry_decision": decision,
            "reason": reason,
            "automatic_retry": false,
            "created_at": chrono::Utc::now().to_rfc3339(),
        }),
        &[
            "template:wedding_planning",
            "wedding_rsvp:reminder_retry_decision",
            "external_send:no_automatic_retry",
        ],
    );
    store(state, user_id, message).await.map(|_| ())
}

async fn visible_messages(
    state: &AppState,
    headers: &HeaderMap,
    thread_id: &str,
) -> Result<Vec<AFPMessage>, (StatusCode, String)> {
    if thread_id.len() != 26 || !thread_id.chars().all(|value| value.is_ascii_alphanumeric()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid RSVP reminder thread".to_string(),
        ));
    }
    thread_messages_for_headers(&state.db, headers, thread_id)
        .await
        .map(|messages| messages.into_iter().map(super::proto_to_app).collect())
}

async fn status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<StatusResponse>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    if !send_enabled() {
        return Ok(Json(StatusResponse {
            enabled: false,
            ready: false,
            provider: "disabled".to_string(),
            reason: "rollout_disabled".to_string(),
        }));
    }
    let config = VendorMailConfig::from_env().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "RSVP reminder provider configuration is invalid".to_string(),
        )
    })?;
    let readiness = config.readiness();
    Ok(Json(StatusResponse {
        enabled: true,
        ready: readiness.ready,
        provider: readiness.provider.label().to_string(),
        reason: readiness.reason.to_string(),
    }))
}

async fn send_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SendRequest>,
) -> Result<Json<SendResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_rsvp_reminder_send", &headers),
        RateLimitPolicy {
            max_requests: 6,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !send_enabled() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "RSVP reminder sending is disabled".to_string(),
        ));
    }
    let messages = visible_messages(&state, &headers, &request.thread_id).await?;
    let reminder = parse_approved_reminder(&messages, request.approval_message_id.trim())?;
    let key = idempotency_key(&reminder);
    if let Some(receipt) = existing_lifecycle(&messages, &key, RECEIPT_KIND) {
        let status = clean(receipt.content.get("delivery_status"));
        return Ok(Json(SendResponse {
            sent: matches!(status.as_str(), "provider_accepted" | "delivered"),
            replayed: true,
            delivery_status: status,
            idempotency_key: key,
            provider_receipt_id: Some(clean(receipt.content.get("provider_message_id")))
                .filter(|value| !value.is_empty()),
        }));
    }
    if existing_lifecycle(&messages, &key, RESERVATION_KIND).is_some() {
        return Err((
            StatusCode::CONFLICT,
            "RSVP reminder delivery is reserved for provider reconciliation; it was not retried"
                .to_string(),
        ));
    }
    let config = VendorMailConfig::from_env().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "RSVP reminder provider configuration is invalid".to_string(),
        )
    })?;
    let readiness = config.readiness();
    if !readiness.ready || !recipient_is_allowlisted(&reminder.recipient) {
        return Err((
            StatusCode::PRECONDITION_FAILED,
            "RSVP reminder recipient is not in the reviewed provider cohort".to_string(),
        ));
    }
    let reservation = reservation_message(&request.thread_id, &reminder, &key);
    let reservation_id = reservation.id.clone();
    if !store(&state, &user.id, reservation).await? {
        return Err((
            StatusCode::CONFLICT,
            "RSVP reminder send reservation already exists".to_string(),
        ));
    }
    let provider_request = VendorMailSendRequest {
        from: config.from_address,
        to: reminder.recipient.clone(),
        subject: format!("RSVP reminder for {}", reminder.household_label),
        text: reminder.exact_content.clone(),
        reply_to: None,
        message_id: format!("<rsvp-{key}@omnyid.com>"),
    };
    match send_allowlisted_cloudflare_vendor_mail(&state.db, &provider_request).await {
        Ok(receipt) => {
            let provider = receipt.provider.as_str();
            let provider_id = receipt.provider_receipt_key.as_str();
            let final_status = match receipt.state {
                VendorMailDeliveryState::Accepted => "provider_accepted",
                VendorMailDeliveryState::Delivered => "delivered",
                VendorMailDeliveryState::Bounced | VendorMailDeliveryState::Suppressed => "failed",
            };
            if receipt.state == VendorMailDeliveryState::Delivered {
                store_receipt(
                    &state,
                    &user.id,
                    &request.thread_id,
                    &reservation_id,
                    &reminder,
                    &key,
                    "provider_accepted",
                    provider,
                    Some(provider_id),
                    None,
                )
                .await?;
            }
            let failure_kind = match receipt.state {
                VendorMailDeliveryState::Bounced => Some("bounced"),
                VendorMailDeliveryState::Suppressed => Some("suppressed"),
                _ => None,
            };
            store_receipt(
                &state,
                &user.id,
                &request.thread_id,
                &reservation_id,
                &reminder,
                &key,
                final_status,
                provider,
                Some(provider_id),
                failure_kind,
            )
            .await?;
            store_retry_decision(
                &state,
                &user.id,
                &request.thread_id,
                &reservation_id,
                &reminder,
                &key,
                "no_automatic_retry",
                if final_status == "failed" {
                    "Provider failure requires a reviewed new approval."
                } else {
                    "A provider receipt exists; duplicate sends are suppressed."
                },
            )
            .await?;
            Ok(Json(SendResponse {
                sent: matches!(final_status, "provider_accepted" | "delivered"),
                replayed: false,
                delivery_status: final_status.to_string(),
                idempotency_key: key,
                provider_receipt_id: Some(provider_id.to_string()),
            }))
        }
        Err(error_code) => {
            store_receipt(
                &state,
                &user.id,
                &request.thread_id,
                &reservation_id,
                &reminder,
                &key,
                "failed",
                readiness.provider.label(),
                None,
                Some(&error_code),
            )
            .await?;
            store_retry_decision(
                &state,
                &user.id,
                &request.thread_id,
                &reservation_id,
                &reminder,
                &key,
                "manual_review_required",
                "Provider outcome failed or is ambiguous; never retry automatically.",
            )
            .await?;
            Err((
                StatusCode::BAD_GATEWAY,
                "The RSVP reminder provider did not return a successful receipt".to_string(),
            ))
        }
    }
}

fn parse_approved_test(
    messages: &[AFPMessage],
    approval_message_id: &str,
) -> Result<ApprovedTest, (StatusCode, String)> {
    let approval = messages
        .iter()
        .find(|message| message.id == approval_message_id && kind(message) == TEST_APPROVAL_KIND)
        .ok_or((
            StatusCode::NOT_FOUND,
            "RSVP test approval is unavailable".to_string(),
        ))?;
    let test_id = clean(approval.content.get("test_id"));
    let draft = messages
        .iter()
        .rev()
        .find(|message| {
            kind(message) == TEST_DRAFT_KIND && clean(message.content.get("test_id")) == test_id
        })
        .ok_or((
            StatusCode::CONFLICT,
            "The approved RSVP test draft is unavailable".to_string(),
        ))?;
    let fields = [
        "test_id",
        "recipient",
        "subject",
        "host_label",
        "fallback_url",
        "exact_content",
    ];
    if test_id.is_empty()
        || clean(approval.content.get("approval_status")) != "approved"
        || approval
            .content
            .get("sends_message")
            .and_then(Value::as_bool)
            != Some(false)
        || approval
            .content
            .get("changes_household_lifecycle")
            .and_then(Value::as_bool)
            != Some(false)
        || fields
            .iter()
            .any(|field| approval.content.get(*field) != draft.content.get(*field))
    {
        return Err((
            StatusCode::CONFLICT,
            "The RSVP test approval no longer matches its draft".to_string(),
        ));
    }
    let recipient = clean(approval.content.get("recipient")).to_ascii_lowercase();
    let subject = clean(approval.content.get("subject"));
    let host_label = clean(approval.content.get("host_label"));
    let fallback_url = clean(approval.content.get("fallback_url"));
    let exact_content = clean(approval.content.get("exact_content"));
    let scope = metadata_scope(approval);
    if !valid_email(&recipient)
        || subject.is_empty()
        || subject.len() > 200
        || host_label.is_empty()
        || host_label.len() > 120
        || exact_content.is_empty()
        || exact_content.len() > 20_000
        || scope != metadata_scope(draft)
        || scope.0.is_empty()
        || scope.1.is_empty()
        || !fallback_url.starts_with("https://")
        || !fallback_url.contains("/workspace/rsvp.html#test.")
    {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "The approved RSVP test is invalid".to_string(),
        ));
    }
    Ok(ApprovedTest {
        approval_message_id: approval.id.clone(),
        draft_message_id: draft.id.clone(),
        test_id,
        recipient,
        subject,
        host_label,
        fallback_url,
        exact_content,
        wedding_plan_id: scope.0,
        response_workspace_id: scope.1,
    })
}

fn test_key(value: &ApprovedTest) -> String {
    hex::encode(Sha256::digest(
        format!(
            "{}\n{}\n{}\n{}\n{}\n{}",
            value.approval_message_id,
            value.draft_message_id,
            value.test_id,
            value.recipient,
            value.subject,
            value.exact_content
        )
        .as_bytes(),
    ))
}

fn test_event(
    thread_id: &str,
    parent_id: &str,
    event_kind: &str,
    test: &ApprovedTest,
    key: &str,
    detail: Value,
) -> AFPMessage {
    AFPMessage {
        protocol: "afp-v1".to_string(),
        id: ulid::Ulid::new().to_string(),
        thread_id: thread_id.to_string(),
        parent_id: Some(parent_id.to_string()),
        from: "agent://wedding-planning".to_string(),
        to: vec!["user://wedding-couple".to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "ledger".to_string(),
        kind: Some(event_kind.to_string()),
        subtype: Some(event_kind.to_string()),
        content: json!({"kind":event_kind,"contract_version":1,"test_id":test.test_id,"delivery_status":detail.get("delivery_status"),"provider":detail.get("provider"),"provider_message_id":detail.get("provider_message_id"),"failure_kind":detail.get("failure_kind"),"idempotency_key":key,"changes_household_lifecycle":false,"created_at":chrono::Utc::now().to_rfc3339()}),
        metadata: Some(
            json!({"store":true,"template":"wedding_planning","weddingPlanId":test.wedding_plan_id,"responseWorkspaceId":test.response_workspace_id,"origin":"wedding_rsvp_test_provider"}),
        ),
        supertags: vec![
            "template:wedding_planning".to_string(),
            "wedding_rsvp:test_delivery".to_string(),
            "household_lifecycle:not_changed".to_string(),
        ],
        references: vec![
            json!({"type":"approval","target":test.approval_message_id,"label":"Exact test approval"}),
        ],
        store_in_relational: true,
        ..AFPMessage::default()
    }
}

async fn test_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<StatusResponse>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    if !test_send_enabled() {
        return Ok(Json(StatusResponse {
            enabled: false,
            ready: false,
            provider: "disabled".to_string(),
            reason: "rollout_disabled".to_string(),
        }));
    }
    let config = VendorMailConfig::from_env().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "RSVP test provider configuration is invalid".to_string(),
        )
    })?;
    let readiness = config.readiness();
    Ok(Json(StatusResponse {
        enabled: true,
        ready: readiness.ready,
        provider: readiness.provider.label().to_string(),
        reason: readiness.reason.to_string(),
    }))
}

async fn test_send_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SendRequest>,
) -> Result<Json<SendResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_rsvp_test_send", &headers),
        RateLimitPolicy {
            max_requests: 4,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !test_send_enabled() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "RSVP test sending is disabled".to_string(),
        ));
    }
    let messages = visible_messages(&state, &headers, &request.thread_id).await?;
    let test = parse_approved_test(&messages, request.approval_message_id.trim())?;
    let key = test_key(&test);
    if let Some(receipt) = existing_lifecycle(&messages, &key, TEST_RECEIPT_KIND) {
        let status = clean(receipt.content.get("delivery_status"));
        return Ok(Json(SendResponse {
            sent: matches!(status.as_str(), "provider_accepted" | "delivered"),
            replayed: true,
            delivery_status: status,
            idempotency_key: key,
            provider_receipt_id: Some(clean(receipt.content.get("provider_message_id")))
                .filter(|value| !value.is_empty()),
        }));
    }
    let config = VendorMailConfig::from_env().map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "RSVP test provider configuration is invalid".to_string(),
        )
    })?;
    let readiness = config.readiness();
    if !readiness.ready || !recipient_is_allowlisted(&test.recipient) {
        return Err((
            StatusCode::PRECONDITION_FAILED,
            "RSVP test recipient is not in the reviewed provider cohort".to_string(),
        ));
    }
    let mut reservation = test_event(
        &request.thread_id,
        &test.approval_message_id,
        TEST_RESERVATION_KIND,
        &test,
        &key,
        json!({}),
    );
    reservation.id = deterministic_message_id(&key);
    let reservation_id = reservation.id.clone();
    if !store(&state, &user.id, reservation).await? {
        return Err((
            StatusCode::CONFLICT,
            "RSVP test send reservation already exists".to_string(),
        ));
    }
    let provider_request = VendorMailSendRequest {
        from: config.from_address,
        to: test.recipient.clone(),
        subject: test.subject.clone(),
        text: format!(
            "{}\n\nTest view: {}\n\nSent as a test for {}.",
            test.exact_content, test.fallback_url, test.host_label
        ),
        reply_to: None,
        message_id: format!("<rsvp-test-{key}@omnyid.com>"),
    };
    match send_allowlisted_cloudflare_vendor_mail(&state.db, &provider_request).await {
        Ok(receipt) => {
            let provider = receipt.provider.clone();
            let provider_receipt_id = receipt.provider_receipt_key.clone();
            let status = match receipt.state {
                VendorMailDeliveryState::Accepted => "provider_accepted",
                VendorMailDeliveryState::Delivered => "delivered",
                VendorMailDeliveryState::Bounced | VendorMailDeliveryState::Suppressed => "failed",
            };
            let event = test_event(
                &request.thread_id,
                &reservation_id,
                TEST_RECEIPT_KIND,
                &test,
                &key,
                json!({"delivery_status":status,"provider":&provider,"provider_message_id":&provider_receipt_id,"failure_kind": if status == "failed" { Some("provider_refused") } else { None }}),
            );
            store(&state, &user.id, event).await?;
            Ok(Json(SendResponse {
                sent: status != "failed",
                replayed: false,
                delivery_status: status.to_string(),
                idempotency_key: key,
                provider_receipt_id: Some(provider_receipt_id),
            }))
        }
        Err(code) => {
            let event = test_event(
                &request.thread_id,
                &reservation_id,
                TEST_RECEIPT_KIND,
                &test,
                &key,
                json!({"delivery_status":"failed","provider":readiness.provider.label(),"failure_kind":code}),
            );
            store(&state, &user.id, event).await?;
            Err((
                StatusCode::BAD_GATEWAY,
                "The RSVP test provider did not return a successful receipt".to_string(),
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(id: &str, kind_value: &str, content: Value) -> AFPMessage {
        AFPMessage {
            id: id.to_string(),
            thread_id: "01JTHREAD00000000000000000".to_string(),
            r#type: "ledger".to_string(),
            kind: Some(kind_value.to_string()),
            content,
            metadata: Some(json!({"weddingPlanId":"plan-1", "responseWorkspaceId":"workspace-1"})),
            ..AFPMessage::default()
        }
    }

    fn approved_messages() -> Vec<AFPMessage> {
        let bound = json!({
            "draft_id":"reminder-1", "household_id":"household-1",
            "recipient_labels":["Priya"], "contact_labels":["priya@example.test"],
            "invitation_ids":["invitation-1"], "exact_content":"Hello Priya,\n\nPlease RSVP.",
            "sends_message":false,
        });
        let mut draft = bound.clone();
        draft["household_label"] = json!("Priya household");
        draft["approval_status"] = json!("draft");
        let mut approval = bound;
        approval["approval_status"] = json!("approved");
        vec![
            message("01JDRAFT000000000000000000", DRAFT_KIND, draft),
            message("01JAPPROVAL000000000000000", APPROVAL_KIND, approval),
        ]
    }

    fn approved_test_messages() -> Vec<AFPMessage> {
        let bound = json!({
            "test_id":"test-1", "recipient":"couple@example.test", "subject":"TEST — RSVP",
            "host_label":"Maya and Sam", "fallback_url":"https://omnyid.com/workspace/rsvp.html#test.abc",
            "exact_content":"TEST — nothing can be submitted.", "sends_message":false,
            "changes_household_lifecycle":false,
        });
        let mut draft = bound.clone();
        draft["approval_status"] = json!("draft");
        let mut approval = bound;
        approval["approval_status"] = json!("approved");
        vec![
            message("01JTESTDRAFT00000000000000", TEST_DRAFT_KIND, draft),
            message("01JTESTAPPROVAL0000000000", TEST_APPROVAL_KIND, approval),
        ]
    }

    #[test]
    fn exact_stored_draft_and_approval_authorise_one_recipient() {
        let parsed = parse_approved_reminder(&approved_messages(), "01JAPPROVAL000000000000000")
            .expect("approved reminder");
        assert_eq!(parsed.recipient, "priya@example.test");
        assert_eq!(parsed.exact_content, "Hello Priya,\n\nPlease RSVP.");
        assert_eq!(idempotency_key(&parsed).len(), 64);
    }

    #[test]
    fn changed_content_or_multiple_recipients_is_refused() {
        let mut changed = approved_messages();
        changed[1].content["exact_content"] = json!("Changed after approval");
        assert_eq!(
            parse_approved_reminder(&changed, "01JAPPROVAL000000000000000")
                .unwrap_err()
                .0,
            StatusCode::CONFLICT
        );
        let mut multiple = approved_messages();
        multiple[0].content["contact_labels"] = json!(["one@example.test", "two@example.test"]);
        multiple[1].content["contact_labels"] = json!(["one@example.test", "two@example.test"]);
        assert_eq!(
            parse_approved_reminder(&multiple, "01JAPPROVAL000000000000000")
                .unwrap_err()
                .0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }

    #[test]
    fn lifecycle_events_keep_provider_and_retry_outcomes_separate() {
        let reminder = parse_approved_reminder(&approved_messages(), "01JAPPROVAL000000000000000")
            .expect("approved reminder");
        let key = idempotency_key(&reminder);
        let reservation = reservation_message("01JTHREAD00000000000000000", &reminder, &key);
        assert_eq!(kind(&reservation), RESERVATION_KIND);
        assert_eq!(reservation.id, deterministic_message_id(&key));
        assert_eq!(reservation.id.len(), 26);
        assert!(reservation.id.starts_with('0'));
        assert_eq!(
            reservation
                .metadata
                .as_ref()
                .and_then(|value| value.get("store"))
                .and_then(Value::as_bool),
            Some(true)
        );
        assert!(super::super::validate_proto_message(
            &super::super::app_to_proto(reservation.clone())
        ));
        let retry = lifecycle_message(
            "01JTHREAD00000000000000000",
            &reservation.id,
            RETRY_KIND,
            &reminder,
            json!({"idempotency_key":key, "retry_decision":"no_automatic_retry"}),
            &["external_send:no_automatic_retry"],
        );
        assert_eq!(kind(&retry), RETRY_KIND);
        assert_eq!(retry.content["retry_decision"], "no_automatic_retry");
        assert!(!retry.content.to_string().contains("priya@example.test"));
    }

    #[test]
    fn approved_test_is_exact_recipient_scoped_and_separate_from_household_lifecycle() {
        let test = parse_approved_test(&approved_test_messages(), "01JTESTAPPROVAL0000000000")
            .expect("approved test");
        assert_eq!(test.recipient, "couple@example.test");
        let event = test_event(
            "01JTHREAD00000000000000000",
            &test.approval_message_id,
            TEST_RECEIPT_KIND,
            &test,
            &test_key(&test),
            json!({"delivery_status":"provider_accepted"}),
        );
        assert_eq!(kind(&event), TEST_RECEIPT_KIND);
        assert_eq!(event.content["changes_household_lifecycle"], false);
        assert!(event.content.get("household_id").is_none());
    }
}
