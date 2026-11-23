use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    middleware,
    routing::post,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::db::StoredQuotationResponseCapability;
use crate::quotation::{
    RESPONSE_SESSION_COOKIE_NAME, ResponseSubmissionProof, ResponseTransactionSessionRecord,
    SecureLinkResponseInput, VendorRevisionArtifact, artifact_matches_binding,
    consume_response_capability, prepare_secure_link_response_with_revision,
    response_capability_secret_mac, secure_link_response_message,
};

use super::{
    AppState,
    auth::store_private_app_message,
    quotation_response_capability_routes::{
        AuthoritySnapshot, authority_snapshot, automatic_revocation, feature_enabled,
        owner_messages, pepper, portal_security_headers, terminalize_if_needed, unavailable,
    },
};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/quotation/vendor-response/consume", post(consume_http))
        .route_layer(middleware::from_fn(portal_security_headers))
}

#[derive(Deserialize)]
struct ConsumeRequest {
    submission_nonce: String,
    #[serde(flatten)]
    input: SecureLinkResponseInput,
}

fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| {
            let (key, value) = part.trim().split_once('=')?;
            (key == name).then_some(value)
        })
}

fn submission_receipt(receipt_id: &str) -> Json<Value> {
    Json(json!({
        "status": "received",
        "receipt_id": receipt_id,
        "requires_user_review": true,
        "accepted": false,
        "booking": false,
        "payment_execution": false,
    }))
}

fn submitted_secret_matches(pepper: &[u8], supplied: &str, expected_mac: &str) -> bool {
    response_capability_secret_mac(pepper, supplied).as_deref() == Some(expected_mac)
}

pub(super) struct AuthorizedPortalSession {
    pub(super) pepper: Vec<u8>,
    pub(super) session_token: String,
    pub(super) csrf: String,
    pub(super) stored: StoredQuotationResponseCapability,
    pub(super) session: ResponseTransactionSessionRecord,
    pub(super) authority: AuthoritySnapshot,
    pub(super) now: chrono::DateTime<Utc>,
}

pub(super) async fn authorize_portal_session(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthorizedPortalSession, (StatusCode, String)> {
    if !feature_enabled() {
        return Err(unavailable());
    }
    let pepper = pepper().ok_or_else(unavailable)?;
    let session_token = cookie_value(headers, RESPONSE_SESSION_COOKIE_NAME)
        .ok_or_else(unavailable)?
        .to_string();
    let csrf = headers
        .get("x-csrf-token")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(unavailable)?
        .to_string();
    let session_mac =
        response_capability_secret_mac(&pepper, &session_token).ok_or_else(unavailable)?;
    let (stored, session) = state
        .db
        .quotation_response_session_by_mac(&session_mac)
        .await
        .map_err(|_| unavailable())?
        .ok_or_else(unavailable)?;
    let authority = authority_snapshot(state, &stored)
        .await
        .map_err(|_| unavailable())?;
    let now = Utc::now();
    if automatic_revocation(&stored, &authority, now).is_some() {
        terminalize_if_needed(state, &stored, &authority, now).await;
        return Err(unavailable());
    }
    if !submitted_secret_matches(&pepper, &csrf, &session.csrf_token_mac) {
        return Err(unavailable());
    }
    Ok(AuthorizedPortalSession {
        pepper,
        session_token,
        csrf,
        stored,
        session,
        authority,
        now,
    })
}

fn session_revision(
    messages: &[crate::message::AFPMessage],
    stored: &StoredQuotationResponseCapability,
    session: &ResponseTransactionSessionRecord,
) -> Option<VendorRevisionArtifact> {
    messages.iter().find_map(|message| {
        if message.kind.as_deref().or(message.subtype.as_deref())
            != Some(crate::quotation::VENDOR_REVISION_SOURCE_KIND)
        {
            return None;
        }
        let artifact = serde_json::from_value::<VendorRevisionArtifact>(
            message.content.get("artifact")?.clone(),
        )
        .ok()?;
        artifact_matches_binding(
            &artifact,
            &session.session_id,
            &stored.record.binding.grant_id,
            &stored.record.binding.vendor_id,
            &stored.record.binding.quotation_id,
            &stored.record.binding.quotation_version_id,
            &stored.record.binding.projection_fingerprint,
        )
        .then_some(artifact)
    })
}

async fn consume_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ConsumeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let authorized = authorize_portal_session(&state, &headers).await?;
    let AuthorizedPortalSession {
        pepper,
        session_token,
        csrf,
        stored,
        mut session,
        authority,
        now,
    } = authorized;
    if !submitted_secret_matches(
        &pepper,
        &request.submission_nonce,
        &session.submission_nonce_mac,
    ) {
        return Err(unavailable());
    }
    let messages = owner_messages(
        &state,
        &stored.owner_user_id,
        &stored.record.binding.thread_id,
    )
    .await
    .map_err(|_| unavailable())?;
    let revision = session_revision(&messages, &stored, &session);
    let prepared = prepare_secure_link_response_with_revision(
        &request.input,
        &stored.record.binding,
        &authority.projection,
        &session.session_id,
        now,
        revision.as_ref(),
    )
    .map_err(|_| unavailable())?;
    if session.consumed_at.is_some() {
        if session.submission_fingerprint.as_deref() == Some(&prepared.fingerprint)
            && session.response_receipt_id.as_deref() == Some(&prepared.receipt_id)
        {
            return Ok(submission_receipt(&prepared.receipt_id));
        }
        return Err(unavailable());
    }

    let response_message =
        secure_link_response_message(&prepared, &stored.grant_message_id, &session.session_id);
    let response_message_id = response_message.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &stored.owner_user_id,
        response_message,
    )
    .await
    .map_err(|_| unavailable())?;
    let persisted_matches = owner_messages(
        &state,
        &stored.owner_user_id,
        &stored.record.binding.thread_id,
    )
    .await
    .map_err(|_| unavailable())?
    .iter()
    .find(|message| message.id == response_message_id)
    .and_then(|message| message.metadata.as_ref())
    .and_then(|metadata| metadata.get("response_fingerprint"))
    .and_then(Value::as_str)
        == Some(prepared.fingerprint.as_str());
    if !persisted_matches {
        return Err(unavailable());
    }

    let mut updated = stored.record.clone();
    let proof = ResponseSubmissionProof {
        session_token: &session_token,
        csrf_token: &csrf,
        submission_nonce: &request.submission_nonce,
        action: request.input.action,
    };
    let audit = consume_response_capability(
        &mut updated,
        &mut session,
        &proof,
        &pepper,
        &authority.authority(),
        now,
    )
    .map_err(|_| unavailable())?;
    session.submission_fingerprint = Some(prepared.fingerprint.clone());
    session.response_receipt_id = Some(prepared.receipt_id.clone());
    let session_mac =
        response_capability_secret_mac(&pepper, &session_token).ok_or_else(unavailable)?;
    if !state
        .db
        .consume_quotation_response_capability(&stored, &updated, &session, &audit)
        .await
        .map_err(|_| unavailable())?
    {
        let replayed = state
            .db
            .quotation_response_session_by_mac(&session_mac)
            .await
            .map_err(|_| unavailable())?
            .map(|(_, current)| current)
            .filter(|current| {
                current.submission_fingerprint.as_deref() == Some(&prepared.fingerprint)
                    && current.response_receipt_id.as_deref() == Some(&prepared.receipt_id)
            });
        if replayed.is_none() {
            return Err(unavailable());
        }
    }
    Ok(submission_receipt(&prepared.receipt_id))
}
