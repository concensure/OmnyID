//! Authenticated quotation source preparation over the shared ingest service.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    AppState,
    auth::{authenticated_user, thread_messages_for_headers},
    document_ingest_service::{
        DocumentParser, QuotationSourcePlan, QuotationSourcePlanInput, QuotationSourceReceipt,
        ResolvedSourcePayload, call_image_ocr, call_parser, plan_quotation_source, select_parser,
    },
    ingest_routes::resolve_source_from_message,
};

const MAX_PARSED_TEXT_CHARS: usize = 500_000;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/quotation/sources/prepare", post(prepare_source_http))
}

#[derive(Deserialize)]
struct PrepareSourceRequest {
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
}

fn default_retention() -> String {
    "keep_extracted_only".to_string()
}

#[derive(Serialize)]
struct PreparedSourceResponse {
    receipt: QuotationSourceReceipt,
    parsed_text: String,
}

fn clean_identifier(value: &str) -> Result<String, (StatusCode, String)> {
    let value = value.trim();
    if value.is_empty() || value.len() > 180 || value.chars().any(char::is_control) {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid source reference".to_string(),
        ));
    }
    Ok(value.to_string())
}

fn source_file_name(source: &super::document_ingest_service::ResolvedIngestSource) -> Option<&str> {
    match &source.payload {
        ResolvedSourcePayload::InlineBytes { file_name, .. } => file_name.as_deref(),
        ResolvedSourcePayload::RemoteUrl(url) => url.rsplit('/').next(),
    }
}

fn source_size(source: &super::document_ingest_service::ResolvedIngestSource) -> Option<u64> {
    match &source.payload {
        ResolvedSourcePayload::InlineBytes { bytes, .. } => Some(bytes.len() as u64),
        ResolvedSourcePayload::RemoteUrl(_) => None,
    }
}

fn blocked_http(plan: QuotationSourcePlan) -> (StatusCode, String) {
    let QuotationSourcePlan::Blocked { blocker } = plan else {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "source planning failed".to_string(),
        );
    };
    (
        StatusCode::UNPROCESSABLE_ENTITY,
        serde_json::to_string(&blocker).unwrap_or_else(|_| "source is unavailable".to_string()),
    )
}

async fn prepare_source_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<PrepareSourceRequest>,
) -> Result<Json<PreparedSourceResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let thread_id = clean_identifier(&request.thread_id)?;
    let source_message_id = clean_identifier(&request.source_message_id)?;
    let messages = thread_messages_for_headers(&state.db, &headers, &thread_id).await?;
    let message = messages
        .into_iter()
        .find(|candidate| candidate.id == source_message_id)
        .map(super::proto_to_app)
        .ok_or((StatusCode::NOT_FOUND, "source unavailable".to_string()))?;
    let source = resolve_source_from_message(
        &message,
        request.source_attachment_id.as_deref(),
        request.mime_type.as_deref(),
    )
    .await
    .map_err(|_| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            "source unreadable".to_string(),
        )
    })?;
    if let ResolvedSourcePayload::RemoteUrl(url) = &source.payload {
        crate::gateway::rest_adapter::validate_public_http_url(url)
            .await
            .map_err(|_| {
                (
                    StatusCode::BAD_REQUEST,
                    "source URL is not allowed".to_string(),
                )
            })?;
    }
    let mime_type = source
        .mime_type
        .as_deref()
        .unwrap_or("application/octet-stream");
    let source_version_id = format!("{}:{}", message.id, message.timestamp);
    let initial = plan_quotation_source(QuotationSourcePlanInput {
        tenant_id: &user.id,
        authenticated_tenant_id: &user.id,
        source_id: &message.id,
        source_version_id: &source_version_id,
        content_hash: "pending",
        mime_type,
        file_name: source_file_name(&source),
        size_bytes: source_size(&source),
        encrypted_or_unreadable: false,
        parser_override: request.parser.as_deref(),
        retention_state: &request.retention_state,
    });
    let parser = match initial {
        QuotationSourcePlan::Ready { ref receipt } => receipt.parser,
        blocked => return Err(blocked_http(blocked)),
    };

    let (parsed_text, page_count) = if parser == DocumentParser::ImageOcr {
        (
            call_image_ocr(&source, mime_type, source_file_name(&source))
                .await
                .map_err(|_| {
                    (
                        StatusCode::UNPROCESSABLE_ENTITY,
                        "source OCR failed".to_string(),
                    )
                })?,
            None,
        )
    } else {
        let parser_family = select_parser(mime_type, request.parser.as_deref());
        let (text, pages, _) = call_parser(parser_family, &source, mime_type)
            .await
            .map_err(|_| {
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "source parsing failed".to_string(),
                )
            })?;
        (text, pages)
    };
    if parsed_text.trim().is_empty() || parsed_text.chars().count() > MAX_PARSED_TEXT_CHARS {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "parsed source is empty or too large".to_string(),
        ));
    }
    let content_hash = format!(
        "sha256:{}",
        hex::encode(Sha256::digest(parsed_text.as_bytes()))
    );
    let final_plan = plan_quotation_source(QuotationSourcePlanInput {
        tenant_id: &user.id,
        authenticated_tenant_id: &user.id,
        source_id: &message.id,
        source_version_id: &source_version_id,
        content_hash: &content_hash,
        mime_type,
        file_name: source_file_name(&source),
        size_bytes: source_size(&source),
        encrypted_or_unreadable: false,
        parser_override: request.parser.as_deref(),
        retention_state: &request.retention_state,
    });
    let mut receipt = match final_plan {
        QuotationSourcePlan::Ready { receipt } => receipt,
        blocked => return Err(blocked_http(blocked)),
    };
    receipt.page_count = page_count;
    Ok(Json(PreparedSourceResponse {
        receipt,
        parsed_text,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifiers_are_bounded_and_control_free() {
        assert_eq!(clean_identifier(" msg_1 ").unwrap(), "msg_1");
        assert!(clean_identifier("").is_err());
        assert!(clean_identifier("bad\nvalue").is_err());
        assert!(clean_identifier(&"x".repeat(181)).is_err());
    }
}
