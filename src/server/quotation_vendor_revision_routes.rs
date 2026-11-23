//! Capability-scoped vendor revision upload adapter.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, State},
    http::{HeaderMap, StatusCode},
    middleware,
    routing::post,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use ulid::Ulid;

use crate::{
    message::{AFPMessage, AfpFileLedgerContent, AfpFileLedgerEntry},
    quotation::{
        ContextGrantAction, SourceReference, VENDOR_REVISION_SOURCE_KIND, VendorResponseAttachment,
        VendorRevisionArtifact, VendorRevisionBlocker, artifact_matches_binding,
        validate_vendor_revision_upload,
    },
};

use super::{
    AppState,
    auth::store_private_app_message,
    billing::storage_policy_for_account,
    file_upload_routes::{
        build_download_url, delete_uploaded_file, persist_uploaded_file, sanitize_upload_file_name,
        storage_key_for,
    },
    quotation_normalisation_routes::{ProposeRequest, ProposeResponse, propose_for_owner},
    quotation_response_capability_routes::{owner_messages, portal_security_headers, unavailable},
    quotation_response_portal_routes::{AuthorizedPortalSession, authorize_portal_session},
    quotation_source_routes::prepare_uploaded_quotation_source,
};

const MAX_MULTIPART_BYTES: usize = 27 * 1024 * 1024;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/quotation/vendor-response/revision",
            post(upload_revision_http),
        )
        .layer(DefaultBodyLimit::max(MAX_MULTIPART_BYTES))
        .route_layer(middleware::from_fn(portal_security_headers))
}

fn stable_ulid(namespace: &str, value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(namespace.as_bytes());
    hasher.update([0]);
    hasher.update(value.as_bytes());
    let digest = hasher.finalize();
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    Ulid::from_bytes(bytes).to_string()
}

fn upload_blocker(error: VendorRevisionBlocker) -> (StatusCode, String) {
    match error {
        VendorRevisionBlocker::Oversized => (
            StatusCode::PAYLOAD_TOO_LARGE,
            "Use a quotation file smaller than 25 MiB. Your typed response is unchanged."
                .to_string(),
        ),
        VendorRevisionBlocker::UnsupportedType => (
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Use PDF, DOCX, PNG, JPEG, WebP, or a plain text file.".to_string(),
        ),
        VendorRevisionBlocker::Encrypted => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "Unlock the document before uploading, or send the revision by email.".to_string(),
        ),
        VendorRevisionBlocker::ActiveContent => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "Files with scripts, macros, embedded files, or launch actions cannot be uploaded."
                .to_string(),
        ),
        VendorRevisionBlocker::PreparedTextRequired => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "This document could not be read safely in your browser. Save it as PDF or plain text, or reply by email."
                .to_string(),
        ),
        VendorRevisionBlocker::Empty
        | VendorRevisionBlocker::SignatureMismatch
        | VendorRevisionBlocker::PreparedTextInvalid => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "The file could not be read safely. Your typed response is unchanged.".to_string(),
        ),
    }
}

fn artifact_from_messages(
    messages: &[AFPMessage],
    authorized: &AuthorizedPortalSession,
) -> Option<VendorRevisionArtifact> {
    messages.iter().find_map(|message| {
        if message.kind.as_deref().or(message.subtype.as_deref())
            != Some(VENDOR_REVISION_SOURCE_KIND)
        {
            return None;
        }
        let artifact = serde_json::from_value::<VendorRevisionArtifact>(
            message.content.get("artifact")?.clone(),
        )
        .ok()?;
        artifact_matches_binding(
            &artifact,
            &authorized.session.session_id,
            &authorized.stored.record.binding.grant_id,
            &authorized.stored.record.binding.vendor_id,
            &authorized.stored.record.binding.quotation_id,
            &authorized.stored.record.binding.quotation_version_id,
            &authorized.stored.record.binding.projection_fingerprint,
        )
        .then_some(artifact)
    })
}

fn upload_response(artifact: &VendorRevisionArtifact) -> Json<Value> {
    Json(json!({
        "status": "prepared",
        "source_id": artifact.source.source_id,
        "source_version_id": artifact.source.source_version_id,
        "attachment_id": artifact.attachment.attachment_id,
        "file_name": artifact.attachment.file_name,
        "media_type": artifact.attachment.media_type,
        "parser": artifact.parser,
        "requires_user_review": true,
        "accepted": false,
        "booking": false,
        "payment_execution": false,
    }))
}

async fn upload_revision_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<Value>, (StatusCode, String)> {
    let authorized = authorize_portal_session(&state, &headers).await?;
    if authorized.session.consumed_at.is_some()
        || !authorized
            .stored
            .record
            .binding
            .allowed_actions
            .contains(&ContextGrantAction::SubmitRevision)
    {
        return Err(unavailable());
    }

    let mut uploaded_name = None;
    let mut uploaded_mime = None;
    let mut uploaded_bytes = None;
    let mut extracted_text = None;
    while let Some(field) = multipart.next_field().await.map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "The upload form could not be read. Your typed response is unchanged.".to_string(),
        )
    })? {
        match field.name() {
            Some("file") if uploaded_bytes.is_none() => {
                uploaded_name = field.file_name().map(str::to_string);
                uploaded_mime = field.content_type().map(str::to_string);
                uploaded_bytes = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|_| {
                            (
                                StatusCode::BAD_REQUEST,
                                "The file could not be read. Your typed response is unchanged."
                                    .to_string(),
                            )
                        })?
                        .to_vec(),
                );
            }
            Some("extracted_text") if extracted_text.is_none() => {
                extracted_text = Some(field.text().await.map_err(|_| {
                    (
                        StatusCode::BAD_REQUEST,
                        "The extracted document text could not be read.".to_string(),
                    )
                })?);
            }
            _ => {}
        }
    }
    let bytes = uploaded_bytes.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "Choose a quotation file before uploading.".to_string(),
        )
    })?;
    let file_name = sanitize_upload_file_name(uploaded_name.as_deref().unwrap_or("quote.bin"));
    let validated = validate_vendor_revision_upload(
        &file_name,
        uploaded_mime.as_deref(),
        &bytes,
        extracted_text.as_deref(),
    )
    .map_err(upload_blocker)?;
    let raw_hash = format!("sha256:{}", hex::encode(Sha256::digest(&bytes)));

    let existing_messages = owner_messages(
        &state,
        &authorized.stored.owner_user_id,
        &authorized.stored.record.binding.thread_id,
    )
    .await
    .map_err(|_| unavailable())?;
    if let Some(existing) = artifact_from_messages(&existing_messages, &authorized) {
        return if existing.attachment.content_hash == raw_hash {
            Ok(upload_response(&existing))
        } else {
            Err((
                StatusCode::CONFLICT,
                "A different revision is already attached. Request a new link to replace it."
                    .to_string(),
            ))
        };
    }

    match crate::gateway::clamav::scan_bytes(&bytes).await {
        Ok(Some(result)) if !result.is_infected => {}
        Ok(Some(_)) => {
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                "This file did not pass the safety check. Your typed response is unchanged."
                    .to_string(),
            ));
        }
        Ok(None) | Err(_) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                "Document safety scanning is temporarily unavailable. Retry later or reply by email; your typed response is unchanged."
                    .to_string(),
            ));
        }
    }

    let owner = state
        .db
        .find_user_by_id(&authorized.stored.owner_user_id)
        .await
        .map_err(|_| unavailable())?
        .ok_or_else(unavailable)?;
    let billing = state
        .db
        .get_billing_status(&owner.id)
        .await
        .map_err(|_| unavailable())?;
    let policy = storage_policy_for_account(
        billing
            .get("plan")
            .and_then(Value::as_str)
            .unwrap_or("free"),
        &owner.email,
    );
    let used_bytes = state
        .db
        .attachment_storage_bytes_for_user(&owner.id)
        .await
        .map_err(|_| unavailable())?;
    let size_bytes =
        i64::try_from(bytes.len()).map_err(|_| upload_blocker(VendorRevisionBlocker::Oversized))?;
    if billing
        .get("archive_only_enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || size_bytes > policy.max_upload_bytes
        || used_bytes.saturating_add(size_bytes) > policy.quota_bytes
    {
        return Err((
            StatusCode::INSUFFICIENT_STORAGE,
            "The requester's private storage cannot accept this file. Your typed response is unchanged; reply by email instead."
                .to_string(),
        ));
    }

    let source_id = stable_ulid(
        "quotation-vendor-revision-source",
        &authorized.session.session_id,
    );
    let source_version_id = format!("{source_id}:1");
    let attachment_id = stable_ulid(
        "quotation-vendor-revision-attachment",
        &authorized.session.session_id,
    );
    let prepared = prepare_uploaded_quotation_source(
        &owner.id,
        &source_id,
        &source_version_id,
        &file_name,
        validated.media_type,
        &bytes,
        validated.prepared_text,
    )
    .await
    .map_err(|(_, _)| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            "The file was safe but its quotation text could not be prepared. Retry with plain text or reply by email; your typed response is unchanged."
                .to_string(),
        )
    })?;
    let replay = crate::quotation::replay_quotation_messages(&existing_messages);
    let registry_id = replay
        .versions
        .get(&authorized.stored.record.binding.quotation_version_id)
        .map(|quotation| quotation.registry_version.as_str())
        .filter(|registry| matches!(*registry, "generic.v1" | "venue.v1"))
        .unwrap_or("generic.v1")
        .to_string();
    let extraction = propose_for_owner(
        &state,
        &owner.id,
        ProposeRequest {
            source_id: source_id.clone(),
            source_version_id: source_version_id.clone(),
            parsed_text: prepared.parsed_text.clone(),
            parser_version: prepared.receipt.parser.as_str().to_string(),
            registry_id,
            wedding_plan_id: None,
            page_count: prepared.receipt.page_count,
            section_names: vec![],
            structured_submission: None,
        },
    )
    .await
    .unwrap_or(ProposeResponse {
        status: "manual_review_required",
        extraction: None,
        receipt: None,
        attempt_kinds: vec!["extraction_unavailable".to_string()],
    });

    // The logical attachment is deterministic, while each in-flight object key is unique.
    // This prevents a losing concurrent request from overwriting or deleting the winner's bytes.
    let storage_object_id = Ulid::new().to_string();
    let storage_key = storage_key_for(&owner.id, &storage_object_id, &file_name);
    let (storage_backend, stored_key) =
        persist_uploaded_file(&storage_key, &bytes, validated.media_type)
            .await
            .map_err(|_| {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "The file could not be stored. Your typed response is unchanged; retry later."
                        .to_string(),
                )
            })?;
    let download_url = match build_download_url(
        &attachment_id,
        &storage_backend,
        &stored_key,
        &file_name,
        validated.media_type,
    ) {
        Ok(url) => url,
        Err(error) => {
            let _ = delete_uploaded_file(&storage_backend, &stored_key).await;
            return Err(error);
        }
    };
    let attachment = VendorResponseAttachment {
        attachment_id: attachment_id.clone(),
        file_name: file_name.clone(),
        media_type: validated.media_type.to_string(),
        size_bytes: bytes.len() as u64,
        content_hash: raw_hash.clone(),
        source_id: source_id.clone(),
        source_version_id: source_version_id.clone(),
    };
    let source = SourceReference {
        source_id: source_id.clone(),
        source_version_id: source_version_id.clone(),
        media_type: validated.media_type.to_string(),
        content_hash: Some(prepared.receipt.content_hash.clone()),
    };
    let extraction_mode = if validated.prepared_text.is_some() {
        if validated.media_type == "application/pdf" {
            "client_pdf_text"
        } else {
            "client_docx_text"
        }
    } else if validated.media_type.starts_with("image/") {
        "shared_image_ocr"
    } else {
        "shared_readability"
    };
    let artifact = VendorRevisionArtifact {
        session_id: authorized.session.session_id.clone(),
        grant_id: authorized.stored.record.binding.grant_id.clone(),
        vendor_id: authorized.stored.record.binding.vendor_id.clone(),
        quotation_id: authorized.stored.record.binding.quotation_id.clone(),
        quotation_version_id: authorized
            .stored
            .record
            .binding
            .quotation_version_id
            .clone(),
        projection_fingerprint: authorized
            .stored
            .record
            .binding
            .projection_fingerprint
            .clone(),
        source,
        attachment,
        parser: prepared.receipt.parser.as_str().to_string(),
        parsed_text_hash: prepared.receipt.content_hash.clone(),
        extraction_mode: extraction_mode.to_string(),
    };
    let now = authorized.now.to_rfc3339();
    let storage_json = json!({
        "backend": storage_backend,
        "key": stored_key,
        "download_url": download_url,
    });
    let attachment_json = json!({
        "id": attachment_id,
        "name": file_name,
        "mime_type": validated.media_type,
        "size_bytes": size_bytes,
        "storage": storage_json,
        "encryption": { "scheme": "none" },
        "sha256": raw_hash.trim_start_matches("sha256:"),
    });
    let ledger = AfpFileLedgerContent {
        name: artifact.attachment.file_name.clone(),
        entries: vec![AfpFileLedgerEntry {
            entry_id: artifact.attachment.attachment_id.clone(),
            seaweed_fid: stored_key.clone(),
            filename: artifact.attachment.file_name.clone(),
            mime_type: artifact.attachment.media_type.clone(),
            size_bytes,
            status: "active".to_string(),
            created_at: Some(now.clone()),
            updated_at: Some(now.clone()),
            checksum: Some(raw_hash.trim_start_matches("sha256:").to_string()),
            searchable_metadata: Some(json!({
                "upload_source": "quotation_vendor_revision",
                "grant_id": artifact.grant_id,
            })),
            ..Default::default()
        }],
        description: Some("Vendor-provided quotation revision".to_string()),
        created_at: Some(now.clone()),
    };
    let references = vec![
        json!({"type": "quotation_context_grant", "target": authorized.stored.grant_message_id}),
        json!({"type": "quotation", "target": artifact.quotation_id}),
        json!({"type": "quotation_version", "target": artifact.quotation_version_id}),
    ];
    let message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: source_id,
        thread_id: authorized.stored.record.binding.thread_id.clone(),
        parent_id: Some(authorized.stored.grant_message_id.clone()),
        from: "capability://quotation-response".to_string(),
        to: vec![owner.id.clone()],
        timestamp: now,
        r#type: "file_ledger".to_string(),
        kind: Some(VENDOR_REVISION_SOURCE_KIND.to_string()),
        supertags: vec![
            "quotation".to_string(),
            "quotation_vendor_revision".to_string(),
            "review:required".to_string(),
        ],
        subtype: Some(VENDOR_REVISION_SOURCE_KIND.to_string()),
        content: json!({
            "ledger": ledger,
            "artifact": artifact,
            "source_receipt": prepared.receipt,
            "parsed_text": prepared.parsed_text,
            "extraction_status": extraction.status,
            "extraction": extraction.extraction,
            "extraction_receipt": extraction.receipt,
            "extraction_attempt_kinds": extraction.attempt_kinds,
            "attribution": {
                "mode": "secure_link_capability",
                "signed_vendor_agent": false,
                "requires_user_review": true,
            },
        }),
        metadata: Some(json!({
            "store": true,
            "privacy_scope": "tenant_private",
            "upload_source": "quotation_vendor_revision",
            "owner_user_id": owner.id,
            "session_binding": stable_ulid("quotation-vendor-revision-session", &authorized.session.session_id),
        })),
        signature: String::new(),
        encryption: Some(json!({})),
        views: vec![],
        references: references.clone(),
        typed_refs: references,
        attachments: vec![attachment_json],
        store_in_relational: true,
        prev_hash: None,
    };
    let store_result = store_private_app_message(
        &state.db,
        &state.metrics,
        &state.relay_tx,
        &owner.id,
        message,
    )
    .await;
    let stored = match store_result {
        Ok(stored) => stored,
        Err(_) => {
            let _ = delete_uploaded_file(&storage_backend, &stored_key).await;
            return Err(unavailable());
        }
    };
    if !stored {
        let replay = owner_messages(
            &state,
            &owner.id,
            &authorized.stored.record.binding.thread_id,
        )
        .await
        .ok()
        .and_then(|messages| artifact_from_messages(&messages, &authorized));
        if let Some(replay) = replay.filter(|item| item.attachment.content_hash == raw_hash) {
            return Ok(upload_response(&replay));
        }
        let _ = delete_uploaded_file(&storage_backend, &stored_key).await;
        return Err(unavailable());
    }
    Ok(upload_response(&artifact))
}
