use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, State},
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use ulid::Ulid;

use super::{
    AppState,
    auth::{authenticated_user, store_private_app_message},
    billing::storage_policy_for_account,
    file_upload_routes::{
        build_download_url, delete_uploaded_file, normalize_upload_mime_type,
        persist_uploaded_file, sanitize_upload_file_name, storage_key_for,
    },
    quotation_vendor_response_routes::vendor_agent_for_user,
};
use crate::{
    message::{AFPMessage, AfpFileLedgerContent, AfpFileLedgerEntry},
    quotation::{QuotationFeatureFlags, SourceReference, VendorResponseAttachment},
};

const MAX_BODY_BYTES: usize = 11 * 1024 * 1024;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/quotation/vendor-transactions/attachments",
            post(upload_http),
        )
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
}

async fn upload_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !QuotationFeatureFlags::from_env().claimed_vendor_responses {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "vendor transaction unavailable".to_string(),
        ));
    }
    let user = authenticated_user(&state.db, &headers).await?;
    let mut invitation_message_id = None;
    let mut uploaded_name = None;
    let mut uploaded_mime = None;
    let mut uploaded_bytes = None;
    while let Some(field) = multipart.next_field().await.map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "The attachment form is invalid.".to_string(),
        )
    })? {
        match field.name() {
            Some("invitation_message_id") => {
                invitation_message_id = Some(field.text().await.map_err(|_| {
                    (
                        StatusCode::BAD_REQUEST,
                        "The invitation reference is invalid.".to_string(),
                    )
                })?)
            }
            Some("file") => {
                uploaded_name = field.file_name().map(str::to_string);
                uploaded_mime = field.content_type().map(str::to_string);
                uploaded_bytes = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|_| {
                            (
                                StatusCode::BAD_REQUEST,
                                "The attachment could not be read.".to_string(),
                            )
                        })?
                        .to_vec(),
                );
            }
            _ => {}
        }
    }
    let invitation_message_id = invitation_message_id
        .map(|value: String| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or((
            StatusCode::BAD_REQUEST,
            "Choose an active enquiry.".to_string(),
        ))?;
    let invitation = state
        .db
        .claimed_vendor_invitation(&user.id, &invitation_message_id)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "vendor transaction unavailable".to_string(),
            )
        })?
        .ok_or((
            StatusCode::NOT_FOUND,
            "vendor transaction unavailable".to_string(),
        ))?;
    vendor_agent_for_user(&state, &user.id, &invitation.vendor_id).await?;
    if invitation.expires_at <= chrono::Utc::now() {
        return Err((StatusCode::GONE, "This enquiry has expired.".to_string()));
    }
    let bytes = uploaded_bytes.filter(|value| !value.is_empty()).ok_or((
        StatusCode::BAD_REQUEST,
        "Choose a file to attach.".to_string(),
    ))?;
    let file_name = sanitize_upload_file_name(uploaded_name.as_deref().unwrap_or("attachment.bin"));
    let mime_type = normalize_upload_mime_type(uploaded_mime.as_deref(), &file_name);
    super::wedding_message_attachment::validate_wedding_message_attachment(
        &file_name, &mime_type, &bytes,
    )?;
    super::wedding_message_attachment::scan_wedding_message_attachment(&bytes).await?;

    let owner = state
        .db
        .find_user_by_id(&invitation.owner_user_id)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "The couple's storage is unavailable.".to_string(),
            )
        })?
        .ok_or((
            StatusCode::NOT_FOUND,
            "vendor transaction unavailable".to_string(),
        ))?;
    let billing = state.db.get_billing_status(&owner.id).await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "The couple's storage is unavailable.".to_string(),
        )
    })?;
    let policy = storage_policy_for_account(
        billing
            .get("plan")
            .and_then(Value::as_str)
            .unwrap_or("free"),
        &owner.email,
    );
    let used = state
        .db
        .attachment_storage_bytes_for_user(&owner.id)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "The couple's storage is unavailable.".to_string(),
            )
        })?;
    let size_bytes = i64::try_from(bytes.len()).map_err(|_| {
        (
            StatusCode::PAYLOAD_TOO_LARGE,
            "Attachment is too large.".to_string(),
        )
    })?;
    if billing
        .get("archive_only_enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || size_bytes > policy.max_upload_bytes
        || used.saturating_add(size_bytes) > policy.quota_bytes
    {
        return Err((
            StatusCode::INSUFFICIENT_STORAGE,
            "The couple's private storage cannot accept this file.".to_string(),
        ));
    }

    let attachment_id = Ulid::new().to_string();
    let source_id = Ulid::new().to_string();
    let source_version_id = format!("{source_id}:1");
    let checksum = hex::encode(Sha256::digest(&bytes));
    let storage_key = storage_key_for(&owner.id, &attachment_id, &file_name);
    let (backend, stored_key) = persist_uploaded_file(&storage_key, &bytes, &mime_type)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "The attachment could not be stored.".to_string(),
            )
        })?;
    let download_url = match build_download_url(
        &attachment_id,
        &backend,
        &stored_key,
        &file_name,
        &mime_type,
    ) {
        Ok(value) => value,
        Err(error) => {
            let _ = delete_uploaded_file(&backend, &stored_key).await;
            return Err(error);
        }
    };
    let attachment = VendorResponseAttachment {
        attachment_id: attachment_id.clone(),
        file_name: file_name.clone(),
        media_type: mime_type.clone(),
        size_bytes: bytes.len() as u64,
        content_hash: format!("sha256:{checksum}"),
        source_id: source_id.clone(),
        source_version_id: source_version_id.clone(),
    };
    let source = SourceReference {
        source_id: source_id.clone(),
        source_version_id: source_version_id.clone(),
        media_type: mime_type.clone(),
        content_hash: Some(format!("sha256:{checksum}")),
    };
    let now = chrono::Utc::now().to_rfc3339();
    let ledger = AfpFileLedgerContent {
        name: file_name.clone(),
        entries: vec![AfpFileLedgerEntry {
            entry_id: attachment_id.clone(),
            seaweed_fid: stored_key.clone(),
            filename: file_name.clone(),
            mime_type: mime_type.clone(),
            size_bytes,
            status: "active".to_string(),
            created_at: Some(now.clone()),
            updated_at: Some(now.clone()),
            checksum: Some(checksum.clone()),
            searchable_metadata: Some(
                json!({"upload_source":"claimed_vendor_response","vendor_id": invitation.vendor_id}),
            ),
            ..Default::default()
        }],
        description: Some("Vendor response attachment".to_string()),
        created_at: Some(now.clone()),
    };
    let attachment_json = json!({
        "id": attachment_id, "name": file_name, "mime_type": mime_type, "size_bytes": size_bytes,
        "storage": {"backend": backend, "key": stored_key, "download_url": download_url},
        "encryption": {"scheme":"none"}, "sha256": checksum,
    });
    let message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: source_id,
        thread_id: invitation.thread_id.clone(),
        parent_id: Some(invitation.grant_message_id.clone()),
        from: "agent://claimed-vendor-portal".to_string(),
        to: vec![owner.id.clone()],
        timestamp: now,
        r#type: "file_ledger".to_string(),
        kind: Some("quotation_vendor_response_attachment".to_string()),
        supertags: vec![
            "quotation".to_string(),
            "vendor_response_attachment".to_string(),
            "review:required".to_string(),
        ],
        subtype: Some("quotation_vendor_response_attachment".to_string()),
        content: json!({"ledger": ledger, "vendor_id": invitation.vendor_id, "grant_id": invitation.grant_id}),
        metadata: Some(
            json!({"store":true,"privacy_scope":"tenant_private","upload_source":"claimed_vendor_response","owner_user_id":owner.id,"invitation_message_id":invitation_message_id}),
        ),
        signature: String::new(),
        encryption: Some(json!({})),
        views: vec![],
        references: vec![
            json!({"type":"quotation_context_grant","target":invitation.grant_message_id}),
        ],
        typed_refs: vec![],
        attachments: vec![attachment_json],
        store_in_relational: true,
        prev_hash: None,
    };
    if store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &owner.id,
        message,
    )
    .await
    .is_err()
    {
        let _ = delete_uploaded_file(&backend, &stored_key).await;
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "The attachment could not be retained.".to_string(),
        ));
    }
    Ok(Json(json!({"attachment": attachment, "source": source})))
}
