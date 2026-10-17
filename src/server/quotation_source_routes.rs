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
pub(super) struct PreparedSourceResponse {
    pub(super) receipt: QuotationSourceReceipt,
    pub(super) parsed_text: String,
}

pub(super) struct PrepareQuotationSourceInput<'a> {
    pub(super) source_attachment_id: Option<&'a str>,
    pub(super) mime_type: Option<&'a str>,
    pub(super) parser: Option<&'a str>,
    pub(super) retention_state: &'a str,
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

async fn resolve_quotation_source(
    message: &crate::message::AFPMessage,
    source_attachment_id: Option<&str>,
    mime_type: Option<&str>,
) -> Result<super::document_ingest_service::ResolvedIngestSource, String> {
    match resolve_source_from_message(message, source_attachment_id, mime_type).await {
        Ok(source) => Ok(source),
        Err(error) if source_attachment_id.is_none() => {
            let body = message
                .content
                .get("body")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|body| !body.is_empty())
                .ok_or(error)?;
            Ok(super::document_ingest_service::ResolvedIngestSource {
                payload: ResolvedSourcePayload::InlineBytes {
                    bytes: body.as_bytes().to_vec(),
                    file_name: Some(format!("message-{}.txt", message.id)),
                },
                source_url: None,
                source_kind: "afp_message_body".to_string(),
                source_message_id: Some(message.id.clone()),
                source_attachment_id: None,
                mime_type: Some("text/plain".to_string()),
            })
        }
        Err(error) => Err(error),
    }
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
    let prepared = prepare_authorized_quotation_source(
        &user.id,
        &message,
        PrepareQuotationSourceInput {
            source_attachment_id: request.source_attachment_id.as_deref(),
            mime_type: request.mime_type.as_deref(),
            parser: request.parser.as_deref(),
            retention_state: &request.retention_state,
        },
    )
    .await?;
    Ok(Json(prepared))
}

pub(super) async fn prepare_authorized_quotation_source(
    tenant_id: &str,
    message: &crate::message::AFPMessage,
    input: PrepareQuotationSourceInput<'_>,
) -> Result<PreparedSourceResponse, (StatusCode, String)> {
    let source = resolve_quotation_source(message, input.source_attachment_id, input.mime_type)
        .await
        .map_err(|_| {
            (
                StatusCode::UNPROCESSABLE_ENTITY,
                "source unreadable".to_string(),
            )
        })?;
    let source_version_id = format!("{}:{}", message.id, message.timestamp);
    prepare_resolved_quotation_source(
        tenant_id,
        &message.id,
        &source_version_id,
        source,
        input,
        None,
        None,
    )
    .await
}

pub(super) async fn prepare_uploaded_quotation_source(
    tenant_id: &str,
    source_id: &str,
    source_version_id: &str,
    file_name: &str,
    media_type: &str,
    raw_bytes: &[u8],
    extracted_text: Option<&str>,
) -> Result<PreparedSourceResponse, (StatusCode, String)> {
    let (processing_bytes, processing_mime) = extracted_text
        .map(|text| (text.as_bytes().to_vec(), "text/plain"))
        .unwrap_or_else(|| (raw_bytes.to_vec(), media_type));
    let source = super::document_ingest_service::ResolvedIngestSource {
        payload: ResolvedSourcePayload::InlineBytes {
            bytes: processing_bytes,
            file_name: Some(file_name.to_string()),
        },
        source_url: None,
        source_kind: "vendor_revision_upload".to_string(),
        source_message_id: Some(source_id.to_string()),
        source_attachment_id: None,
        mime_type: Some(processing_mime.to_string()),
    };
    prepare_resolved_quotation_source(
        tenant_id,
        source_id,
        source_version_id,
        source,
        PrepareQuotationSourceInput {
            source_attachment_id: None,
            mime_type: Some(processing_mime),
            parser: None,
            retention_state: "keep_source_and_extracted",
        },
        Some(media_type),
        Some(raw_bytes.len() as u64),
    )
    .await
}

async fn prepare_resolved_quotation_source(
    tenant_id: &str,
    source_id: &str,
    source_version_id: &str,
    source: super::document_ingest_service::ResolvedIngestSource,
    input: PrepareQuotationSourceInput<'_>,
    receipt_media_type: Option<&str>,
    source_size_override: Option<u64>,
) -> Result<PreparedSourceResponse, (StatusCode, String)> {
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
    let initial = plan_quotation_source(QuotationSourcePlanInput {
        tenant_id,
        authenticated_tenant_id: tenant_id,
        source_id,
        source_version_id,
        content_hash: "pending",
        mime_type,
        file_name: source_file_name(&source),
        size_bytes: source_size_override.or_else(|| source_size(&source)),
        encrypted_or_unreadable: false,
        parser_override: input.parser,
        retention_state: input.retention_state,
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
        let parser_family = select_parser(mime_type, input.parser);
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
        tenant_id,
        authenticated_tenant_id: tenant_id,
        source_id,
        source_version_id,
        content_hash: &content_hash,
        mime_type,
        file_name: source_file_name(&source),
        size_bytes: source_size_override.or_else(|| source_size(&source)),
        encrypted_or_unreadable: false,
        parser_override: input.parser,
        retention_state: input.retention_state,
    });
    let mut receipt = match final_plan {
        QuotationSourcePlan::Ready { receipt } => receipt,
        blocked => return Err(blocked_http(blocked)),
    };
    receipt.page_count = page_count;
    if let Some(media_type) = receipt_media_type {
        receipt.mime_type = media_type.to_string();
    }
    Ok(PreparedSourceResponse {
        receipt,
        parsed_text,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn incoming_email_body_is_a_first_class_quotation_source() {
        let message = crate::message::AFPMessage {
            id: "reply-1".to_string(),
            thread_id: "thread-1".to_string(),
            r#type: "email".to_string(),
            subtype: Some("incoming".to_string()),
            content: serde_json::json!({"body": "Beverages are AUD 55 per guest."}),
            ..Default::default()
        };
        let source = resolve_quotation_source(&message, None, None)
            .await
            .expect("email body source");
        assert_eq!(source.source_kind, "afp_message_body");
        assert_eq!(source.mime_type.as_deref(), Some("text/plain"));
    }

    #[test]
    fn identifiers_are_bounded_and_control_free() {
        assert_eq!(clean_identifier(" msg_1 ").unwrap(), "msg_1");
        assert!(clean_identifier("").is_err());
        assert!(clean_identifier("bad\nvalue").is_err());
        assert!(clean_identifier(&"x".repeat(181)).is_err());
    }

    #[tokio::test]
    async fn prepared_docx_text_reuses_readability_with_original_media_receipt() {
        let prepared = prepare_uploaded_quotation_source(
            "owner-1",
            "source-1",
            "source-1:1",
            "revision.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            b"PK synthetic raw package",
            Some("Venue total is AUD 4,200."),
        )
        .await
        .expect("prepared DOCX source");
        assert_eq!(prepared.parsed_text, "Venue total is AUD 4,200.");
        assert_eq!(prepared.receipt.parser, DocumentParser::Readability);
        assert_eq!(
            prepared.receipt.mime_type,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        assert_eq!(prepared.receipt.source_id, "source-1");
        assert_eq!(prepared.receipt.source_version_id, "source-1:1");
    }
}
