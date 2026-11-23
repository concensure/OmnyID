use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};

use crate::quotation::{
    CLOSURE_EVIDENCE_SCHEMA_VERSION, ClosureEvidenceError, ClosureEvidenceOutcome,
    ClosureEvidenceProposal, PreparedEvidenceSource, QUOTATION_CLOSURE_EVIDENCE_KIND,
    QuotationFeatureFlags, SourceReference, ValidatedClosureEvidence,
    quotation_closure_evidence_message, replay_quotation_messages, validate_closure_evidence,
};
use crate::server::{
    AppState,
    auth::{authenticated_user, store_private_app_message},
    quotation_source_routes::{PrepareQuotationSourceInput, prepare_authorized_quotation_source},
};

use super::{store_error, visible_messages};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/quotation/closure-evidence",
        post(store_closure_evidence_http),
    )
}

#[derive(Debug, Deserialize)]
struct StoreClosureEvidenceRequest {
    thread_id: String,
    source_message_id: String,
    #[serde(default)]
    source_attachment_id: Option<String>,
    #[serde(default)]
    mime_type: Option<String>,
    #[serde(default)]
    parser: Option<String>,
    #[serde(default = "default_retention")]
    retention_state: String,
    proposal: ClosureEvidenceProposal,
}

fn default_retention() -> String {
    "keep_extracted_only".to_string()
}

#[derive(Debug, Serialize)]
struct StoreClosureEvidenceResponse {
    outcome: ClosureEvidenceOutcome,
    message_ids: Vec<String>,
}

fn kind(message: &crate::message::AFPMessage) -> &str {
    message
        .kind
        .as_deref()
        .or(message.subtype.as_deref())
        .unwrap_or_default()
}

fn stored_evidence(message: &crate::message::AFPMessage) -> Option<ValidatedClosureEvidence> {
    (kind(message) == QUOTATION_CLOSURE_EVIDENCE_KIND)
        .then(|| message.content.get("evidence").cloned())
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
}

fn manual_review(reason: impl Into<String>) -> Json<StoreClosureEvidenceResponse> {
    Json(StoreClosureEvidenceResponse {
        outcome: ClosureEvidenceOutcome::ManualReviewRequired {
            reason: reason.into(),
        },
        message_ids: Vec::new(),
    })
}

async fn store_closure_evidence_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<StoreClosureEvidenceRequest>,
) -> Result<Json<StoreClosureEvidenceResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !QuotationFeatureFlags::from_env().closure {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "quotation closure is not enabled".to_string(),
        ));
    }
    if request.proposal.schema_version != CLOSURE_EVIDENCE_SCHEMA_VERSION
        || request.source_message_id != request.proposal.source_id
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "closure evidence binding is invalid".to_string(),
        ));
    }
    let messages = visible_messages(&state, &headers, &request.thread_id).await?;
    let replay = replay_quotation_messages(&messages);
    let selected = replay
        .versions
        .get(&request.proposal.quotation_version_id)
        .filter(|quotation| {
            quotation.identity.quotation_id == request.proposal.quotation_id
                && replay
                    .active_version_by_quotation
                    .get(&quotation.identity.quotation_id)
                    == Some(&quotation.identity.version_id)
                && replay.active_selections.values().any(|selection| {
                    selection.quotation_id == quotation.identity.quotation_id
                        && selection.quotation_version_id == quotation.identity.version_id
                })
        })
        .ok_or((
            StatusCode::CONFLICT,
            "selected quotation revision is unavailable".to_string(),
        ))?;
    let source_message = messages
        .iter()
        .find(|message| message.id == request.source_message_id)
        .ok_or((StatusCode::NOT_FOUND, "source unavailable".to_string()))?;
    let prepared = match prepare_authorized_quotation_source(
        &user.id,
        source_message,
        PrepareQuotationSourceInput {
            source_attachment_id: request.source_attachment_id.as_deref(),
            mime_type: request.mime_type.as_deref(),
            parser: request.parser.as_deref(),
            retention_state: &request.retention_state,
        },
    )
    .await
    {
        Ok(prepared) => prepared,
        Err((StatusCode::UNPROCESSABLE_ENTITY, reason)) => {
            return Ok(manual_review(format!(
                "Source parsing or OCR is unavailable; review manually. {reason}"
            )));
        }
        Err(error) => return Err(error),
    };
    let parser = serde_json::to_value(prepared.receipt.parser)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_else(|| "unknown".to_string());
    let prepared_source = PreparedEvidenceSource {
        source: SourceReference {
            source_id: prepared.receipt.source_id.clone(),
            source_version_id: prepared.receipt.source_version_id.clone(),
            media_type: prepared.receipt.mime_type.clone(),
            content_hash: Some(prepared.receipt.content_hash.clone()),
        },
        content_hash: prepared.receipt.content_hash,
        parser,
    };
    let outcome = validate_closure_evidence(
        selected,
        &prepared_source,
        Some(&prepared.parsed_text),
        request.proposal,
    )
    .map_err(|error| match error {
        ClosureEvidenceError::InvalidBinding => (
            StatusCode::CONFLICT,
            "closure evidence binding is stale".to_string(),
        ),
        ClosureEvidenceError::InvalidProposal => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "closure evidence proposal is invalid".to_string(),
        ),
    })?;
    let ClosureEvidenceOutcome::Ready { evidence } = &outcome else {
        return Ok(Json(StoreClosureEvidenceResponse {
            outcome,
            message_ids: Vec::new(),
        }));
    };
    if let Some((message, existing)) = messages.iter().find_map(|message| {
        stored_evidence(message)
            .filter(|stored| stored.evidence_id == evidence.evidence_id)
            .map(|stored| (message, stored))
    }) {
        if existing != *evidence {
            return Err((
                StatusCode::CONFLICT,
                "closure evidence id is already in use".to_string(),
            ));
        }
        return Ok(Json(StoreClosureEvidenceResponse {
            outcome,
            message_ids: vec![message.id.clone()],
        }));
    }
    let message = quotation_closure_evidence_message(
        evidence,
        &request.thread_id,
        &source_message.id,
        &chrono::Utc::now().to_rfc3339(),
        &user.id,
    );
    let id = message.id.clone();
    store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &user.id,
        message,
    )
    .await
    .map_err(|_| store_error())?;
    Ok(Json(StoreClosureEvidenceResponse {
        outcome,
        message_ids: vec![id],
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parsed_document_text_is_not_part_of_the_persisted_evidence_shape() {
        let serialized = serde_json::to_string(&StoreClosureEvidenceResponse {
            outcome: ClosureEvidenceOutcome::ManualReviewRequired {
                reason: "review".to_string(),
            },
            message_ids: Vec::new(),
        })
        .unwrap();
        assert!(!serialized.contains("parsed_text"));
    }
}
