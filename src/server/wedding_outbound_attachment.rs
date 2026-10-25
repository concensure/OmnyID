use std::{collections::HashSet, sync::Arc};

use axum::http::StatusCode;
use sha2::{Digest, Sha256};

use crate::gateway::smtp_out::OutgoingEmailAttachment;

use super::{AppState, file_upload_routes::load_uploaded_file};

const MAX_OUTBOUND_ATTACHMENT_BYTES: usize = 18 * 1024 * 1024;

pub async fn resolve_wedding_message_attachments(
    state: &Arc<AppState>,
    owner_user_id: &str,
    attachment_ids: Vec<String>,
) -> Result<Vec<OutgoingEmailAttachment>, (StatusCode, String)> {
    if attachment_ids.len() > super::wedding_message_attachment::MAX_WEDDING_MESSAGE_ATTACHMENTS {
        return Err((
            StatusCode::BAD_REQUEST,
            "Attach no more than five files.".to_string(),
        ));
    }
    let requested = attachment_ids
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let unique = requested.iter().collect::<HashSet<_>>();
    if unique.len() != requested.len() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Duplicate attachment selected.".to_string(),
        ));
    }
    let stored = state
        .db
        .wedding_message_attachments_by_id(owner_user_id, &requested)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "Attachments are temporarily unavailable.".to_string(),
            )
        })?;
    if stored.len() != requested.len() {
        return Err((
            StatusCode::BAD_REQUEST,
            "One or more attachments are unavailable.".to_string(),
        ));
    }

    let mut total_bytes = 0usize;
    let mut resolved = Vec::with_capacity(stored.len());
    for attachment_id in requested {
        let item = stored.iter().find(|item| item.id == attachment_id).ok_or((
            StatusCode::BAD_REQUEST,
            "One or more attachments are unavailable.".to_string(),
        ))?;
        let bytes = load_uploaded_file(&item.storage_backend, &item.storage_key)
            .await
            .map_err(|_| {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "An attachment could not be read.".to_string(),
                )
            })?;
        let digest = hex::encode(Sha256::digest(&bytes));
        if digest != item.sha256 || i64::try_from(bytes.len()).ok() != Some(item.size_bytes) {
            return Err((
                StatusCode::CONFLICT,
                "An attachment failed its integrity check.".to_string(),
            ));
        }
        super::wedding_message_attachment::validate_wedding_message_attachment(
            &item.name,
            &item.mime_type,
            &bytes,
        )?;
        super::wedding_message_attachment::scan_wedding_message_attachment(&bytes).await?;
        total_bytes = total_bytes.saturating_add(bytes.len());
        if total_bytes > MAX_OUTBOUND_ATTACHMENT_BYTES {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                "Attachments must total 18 MB or less for reliable email delivery.".to_string(),
            ));
        }
        resolved.push(OutgoingEmailAttachment {
            attachment_id: item.id.clone(),
            file_name: item.name.clone(),
            media_type: item.mime_type.clone(),
            bytes,
        });
    }
    Ok(resolved)
}
