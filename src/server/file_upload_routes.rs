use std::{
    path::{Component, Path, PathBuf},
    sync::{Arc, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path as AxumPath, Query, State},
    http::{
        HeaderMap, HeaderName, StatusCode,
        header::{self, HeaderValue},
    },
    response::Response,
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::fs;
use ulid::Ulid;

use crate::{
    daemon_runtime::{
        delete_object_payload, download_object_payload, seaweedfs_client, upload_object_payload,
    },
    message::{AFPMessage, AfpFileLedgerContent, AfpFileLedgerEntry},
};

use super::{
    AppState, app_to_proto, auth::authenticated_user, billing::storage_policy_for_account,
    internal_error, internal_http_error, status_to_http,
};

const MAX_UPLOAD_BODY_LIMIT_BYTES: usize = 128 * 1024 * 1024;
const DOWNLOAD_TOKEN_TTL_SECS: i64 = 60 * 60 * 12;
const MAX_ATTACHMENT_TOKEN_CLOCK_SKEW_SECS: i64 = 5 * 60;
const MAX_ATTACHMENT_TOKEN_B64_LEN: usize = 4096;
const ATTACHMENT_SIG_HEX_LEN: usize = 64;
const MAX_ATTACHMENT_ID_LEN: usize = 64;
const MAX_ATTACHMENT_STORAGE_KEY_LEN: usize = 512;
const MAX_ATTACHMENT_FILE_NAME_LEN: usize = 255;
const MAX_ATTACHMENT_MIME_TYPE_LEN: usize = 128;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, PartialEq, Eq)]
enum UploadAdmission {
    Allowed,
    ArchiveOnly,
    TooLarge { limit_mb: i64 },
    QuotaExceeded,
}

#[derive(Debug, Serialize, Deserialize)]
struct AttachmentDownloadToken {
    attachment_id: String,
    storage_backend: String,
    storage_key: String,
    file_name: String,
    mime_type: String,
    expires_at: i64,
}

#[derive(Deserialize)]
struct DownloadQuery {
    token: String,
    sig: String,
}

#[derive(Debug, Deserialize)]
struct FileLibraryQuery {
    q: Option<String>,
    tag: Option<String>,
    category: Option<String>,
    source_kind: Option<String>,
    availability: Option<String>,
    knowledge_mode: Option<String>,
    retention_mode: Option<String>,
    academic_kind: Option<String>,
    course_tag: Option<String>,
    week_tag: Option<String>,
    lecture_tag: Option<String>,
    chapter_tag: Option<String>,
    unit_tag: Option<String>,
    zettelkasten_stage: Option<String>,
    sort: Option<String>,
    limit: Option<usize>,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/files/upload", post(upload_file_http))
        .route("/files/upload", post(upload_file_http))
        .route("/api/files/library", get(list_file_library_http))
        .route("/files/library", get(list_file_library_http))
        .route(
            "/attachments/{attachment_id}",
            get(download_attachment_http),
        )
        .layer(DefaultBodyLimit::max(MAX_UPLOAD_BODY_LIMIT_BYTES))
}

async fn upload_file_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let billing = state
        .db
        .get_billing_status(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let plan = billing
        .get("plan")
        .and_then(Value::as_str)
        .unwrap_or("free");
    let policy = storage_policy_for_account(plan, &user.email);
    let archive_only_enabled = billing
        .get("archive_only_enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let used_bytes = state
        .db
        .attachment_storage_bytes_for_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let mut uploaded_name = None;
    let mut uploaded_mime = None;
    let mut uploaded_bytes = None;

    while let Some(field) = multipart.next_field().await.map_err(|err| {
        tracing::error!(error = %err, "invalid multipart form");
        (
            StatusCode::BAD_REQUEST,
            "invalid multipart form".to_string(),
        )
    })? {
        if field.name() != Some("file") {
            continue;
        }
        uploaded_name = field.file_name().map(|name| name.to_string());
        uploaded_mime = field.content_type().map(|mime| mime.to_string());
        let bytes = field.bytes().await.map_err(|err| {
            tracing::error!(error = %err, "could not read upload body");
            (
                StatusCode::BAD_REQUEST,
                "could not read upload body".to_string(),
            )
        })?;
        uploaded_bytes = Some(bytes.to_vec());
        break;
    }

    let file_name = sanitize_upload_file_name(uploaded_name.as_deref().unwrap_or("upload.bin"));
    let mime_type = normalize_upload_mime_type(uploaded_mime.as_deref(), &file_name);
    let bytes = uploaded_bytes
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "no file field was provided".to_string(),
            )
        })?;
    let size_bytes = i64::try_from(bytes.len()).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "uploaded file is too large".to_string(),
        )
    })?;

    match evaluate_upload_admission(
        archive_only_enabled,
        policy.quota_bytes,
        policy.max_upload_bytes,
        used_bytes,
        size_bytes,
    ) {
        UploadAdmission::Allowed => {}
        UploadAdmission::ArchiveOnly => {
            return Err((
                StatusCode::INSUFFICIENT_STORAGE,
                "Archive-only mode is active. Stored material remains accessible, but uploads stay blocked until archive-only mode is disabled or storage headroom is restored.".to_string(),
            ));
        }
        UploadAdmission::TooLarge { limit_mb } => {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                format!("Upload exceeds the {limit_mb} MB single-file limit for the current plan."),
            ));
        }
        UploadAdmission::QuotaExceeded => {
            return Err((
                StatusCode::INSUFFICIENT_STORAGE,
                "Storage quota exceeded. Upgrade storage or move this account into archive-only mode; agent retrieval quality will degrade while over quota.".to_string(),
            ));
        }
    }

    let attachment_id = Ulid::new().to_string();
    let thread_id = Ulid::new().to_string();
    let message_id = Ulid::new().to_string();
    let checksum = hex::encode(Sha256::digest(&bytes));
    let storage_key = storage_key_for(&user.id, &attachment_id, &file_name);
    let (storage_backend, stored_key) = persist_uploaded_file(&storage_key, &bytes, &mime_type)
        .await
        .map_err(|err| (StatusCode::SERVICE_UNAVAILABLE, err))?;
    let download_url = build_download_url(
        &attachment_id,
        &storage_backend,
        &stored_key,
        &file_name,
        &mime_type,
    )?;
    let now = chrono::Utc::now().to_rfc3339();
    let upload_supertags = vec![
        "source:attachment".to_string(),
        "resource:uploaded_file".to_string(),
        format!(
            "format:{}",
            file_name
                .rsplit('.')
                .next()
                .unwrap_or("bin")
                .to_ascii_lowercase()
        ),
    ];

    let storage_json = json!({
        "backend": storage_backend,
        "key": stored_key,
        "download_url": download_url,
    });
    let attachment_json = json!({
        "id": attachment_id,
        "name": file_name,
        "mime_type": mime_type,
        "size_bytes": size_bytes,
        "storage": storage_json,
        "encryption": { "scheme": "none" },
        "sha256": checksum,
    });

    let ledger_entry = AfpFileLedgerEntry {
        entry_id: attachment_id.clone(),
        seaweed_fid: stored_key.clone(),
        filename: file_name.clone(),
        mime_type: mime_type.clone(),
        size_bytes,
        status: "active".to_string(),
        created_at: Some(now.clone()),
        updated_at: Some(now.clone()),
        checksum: Some(checksum.clone()),
        searchable_metadata: Some(json!({
            "upload_source": "workspace_file_upload",
            "storage_backend": storage_backend,
            "supertags": upload_supertags.clone(),
        })),
        ..Default::default()
    };
    let ledger = AfpFileLedgerContent {
        name: file_name.clone(),
        entries: vec![ledger_entry],
        description: Some("Uploaded file".to_string()),
        created_at: Some(now.clone()),
    };
    let message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: message_id.clone(),
        thread_id,
        parent_id: None,
        from: "file_upload_agent".to_string(),
        to: vec![user.id.clone()],
        timestamp: now,
        r#type: "file_ledger".to_string(),
        kind: Some("file_upload".to_string()),
        supertags: upload_supertags.clone(),
        subtype: Some("file_ledger:create".to_string()),
        content: serde_json::to_value(&ledger).unwrap_or_else(|_| json!({})),
        metadata: Some(json!({
            "store": true,
            "upload_source": "workspace_file_upload",
            "owner_user_id": user.id,
            "supertags": upload_supertags.clone(),
        })),
        signature: String::new(),
        encryption: Some(json!({})),
        views: vec![],
        references: vec![],
        typed_refs: vec![],
        attachments: vec![attachment_json.clone()],
        store_in_relational: true,
        prev_hash: None,
    };
    let content_json = message.content.clone();
    let stored = state
        .db
        .store_private_message(&user.id, &app_to_proto(message), content_json)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    if !stored {
        return Err(internal_http_error("upload message was not persisted"));
    }

    Ok(Json(json!({
        "ok": true,
        "message_id": message_id,
        "attachment_id": attachment_id,
        "attachment": attachment_json,
        "download_url": download_url,
        "size_bytes": size_bytes,
        "storage_used_bytes": used_bytes.saturating_add(size_bytes),
        "storage_quota_bytes": policy.quota_bytes,
        "max_single_upload_bytes": policy.max_upload_bytes,
    })))
}

async fn list_file_library_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<FileLibraryQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let limit = query.limit.unwrap_or(250).clamp(1, 1000) as i64;
    let storage_used_bytes = state
        .db
        .attachment_storage_bytes_for_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let billing = state
        .db
        .get_billing_status(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let plan = billing
        .get("plan")
        .and_then(Value::as_str)
        .unwrap_or("free");
    let storage_policy = storage_policy_for_account(plan, &user.email);
    let items = state
        .db
        .list_private_attachments_library(
            &user.id,
            query.q.as_deref(),
            query.tag.as_deref(),
            query.category.as_deref(),
            query.source_kind.as_deref(),
            query.availability.as_deref(),
            query.knowledge_mode.as_deref(),
            query.retention_mode.as_deref(),
            query.academic_kind.as_deref(),
            query.course_tag.as_deref(),
            query.week_tag.as_deref(),
            query.lecture_tag.as_deref(),
            query.chapter_tag.as_deref(),
            query.unit_tag.as_deref(),
            query.zettelkasten_stage.as_deref(),
            query.sort.as_deref(),
            limit,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let library_summary = state
        .db
        .summarize_private_attachments_library(
            &user.id,
            query.q.as_deref(),
            query.tag.as_deref(),
            query.category.as_deref(),
            query.source_kind.as_deref(),
            query.availability.as_deref(),
            query.knowledge_mode.as_deref(),
            query.retention_mode.as_deref(),
            query.academic_kind.as_deref(),
            query.course_tag.as_deref(),
            query.week_tag.as_deref(),
            query.lecture_tag.as_deref(),
            query.chapter_tag.as_deref(),
            query.unit_tag.as_deref(),
            query.zettelkasten_stage.as_deref(),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({
        "items": items,
        "count": items.len(),
        "summary": {
            "storage_used_bytes": storage_used_bytes,
            "storage_quota_bytes": storage_policy.quota_bytes,
            "visible_bytes": library_summary.get("visible_bytes").and_then(Value::as_i64).unwrap_or(0),
            "matching_count": library_summary.get("matching_count").and_then(Value::as_i64).unwrap_or(0),
        },
        "facets": {
            "top_tags": library_summary.get("top_tags").cloned().unwrap_or_else(|| json!([])),
            "availability_counts": library_summary.get("availability_counts").cloned().unwrap_or_else(|| json!({})),
            "category_counts": library_summary.get("category_counts").cloned().unwrap_or_else(|| json!({})),
            "source_kind_counts": library_summary.get("source_kind_counts").cloned().unwrap_or_else(|| json!({})),
            "knowledge_counts": library_summary.get("knowledge_counts").cloned().unwrap_or_else(|| json!({})),
            "retention_counts": library_summary.get("retention_counts").cloned().unwrap_or_else(|| json!({})),
            "academic_kind_counts": library_summary.get("academic_kind_counts").cloned().unwrap_or_else(|| json!({})),
            "course_tag_counts": library_summary.get("course_tag_counts").cloned().unwrap_or_else(|| json!({})),
            "unit_tag_counts": library_summary.get("unit_tag_counts").cloned().unwrap_or_else(|| json!({})),
            "chapter_tag_counts": library_summary.get("chapter_tag_counts").cloned().unwrap_or_else(|| json!({})),
            "week_tag_counts": library_summary.get("week_tag_counts").cloned().unwrap_or_else(|| json!({})),
            "lecture_tag_counts": library_summary.get("lecture_tag_counts").cloned().unwrap_or_else(|| json!({})),
            "zettelkasten_stage_counts": library_summary.get("zettelkasten_stage_counts").cloned().unwrap_or_else(|| json!({})),
            "linked_count": library_summary.get("linked_count").and_then(Value::as_i64).unwrap_or(0),
        },
        "page": {
            "limit": limit,
            "returned_count": items.len(),
            "matching_count": library_summary.get("matching_count").and_then(Value::as_i64).unwrap_or(0),
            "has_more": (items.len() as i64) < library_summary.get("matching_count").and_then(Value::as_i64).unwrap_or(0),
        },
        "filters": {
            "q": query.q,
            "tag": query.tag,
            "category": query.category,
            "source_kind": query.source_kind,
            "availability": query.availability,
            "knowledge_mode": query.knowledge_mode,
            "retention_mode": query.retention_mode,
            "academic_kind": query.academic_kind,
            "course_tag": query.course_tag,
            "unit_tag": query.unit_tag,
            "chapter_tag": query.chapter_tag,
            "week_tag": query.week_tag,
            "lecture_tag": query.lecture_tag,
            "zettelkasten_stage": query.zettelkasten_stage,
            "sort": query.sort,
            "limit": limit,
        },
    })))
}

async fn download_attachment_http(
    AxumPath(path_attachment_id): AxumPath<String>,
    Query(query): Query<DownloadQuery>,
) -> Result<Response<Body>, (StatusCode, String)> {
    let token = verify_download_token(&path_attachment_id, &query.token, &query.sig)?;
    let bytes = match token.storage_backend.as_str() {
        "seaweedfs" => {
            let client = seaweedfs_client().ok_or_else(|| {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "object storage is unavailable".to_string(),
                )
            })?;
            download_object_payload(&client, &token.storage_key)
                .await
                .map_err(|err| (StatusCode::BAD_GATEWAY, err))?
        }
        "filesystem" => {
            let path = upload_root_dir().join(PathBuf::from(&token.storage_key));
            fs::read(&path).await.map_err(|err| {
                tracing::error!(error = %err, path = %path.display(), "attachment file is unavailable");
                (
                    StatusCode::NOT_FOUND,
                    "attachment file is unavailable".to_string(),
                )
            })?
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "unsupported attachment backend".to_string(),
            ));
        }
    };

    let content_type = HeaderValue::from_str(&token.mime_type)
        .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream"));
    let disposition = HeaderValue::from_str(&format!(
        "attachment; filename=\"{}\"",
        token.file_name.replace(['"', '\\'], "_")
    ))
    .unwrap_or_else(|_| HeaderValue::from_static("attachment"));

    let mut response = Response::new(Body::from(bytes));
    apply_attachment_download_headers(&mut response, content_type, disposition);
    Ok(response)
}

fn apply_attachment_download_headers(
    response: &mut Response<Body>,
    content_type: HeaderValue,
    disposition: HeaderValue,
) {
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, content_type);
    response
        .headers_mut()
        .insert(header::CONTENT_DISPOSITION, disposition);
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store, max-age=0"),
    );
    response
        .headers_mut()
        .insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
    response.headers_mut().insert(
        HeaderName::from_static("x-content-type-options"),
        HeaderValue::from_static("nosniff"),
    );
}

pub(super) fn sanitize_upload_file_name(name: &str) -> String {
    let trimmed = name.trim();
    let fallback = if trimmed.is_empty() {
        "upload.bin"
    } else {
        trimmed
    };
    let cleaned = fallback
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect::<String>();
    let collapsed = cleaned.trim_matches(['.', ' ']).to_string();
    if collapsed.is_empty() || collapsed == "." || collapsed == ".." {
        "upload.bin".to_string()
    } else {
        collapsed
            .chars()
            .take(MAX_ATTACHMENT_FILE_NAME_LEN)
            .collect()
    }
}

fn guess_mime_from_name(file_name: &str) -> String {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".pdf") {
        "application/pdf".to_string()
    } else if lower.ends_with(".csv") {
        "text/csv".to_string()
    } else if lower.ends_with(".txt") || lower.ends_with(".md") {
        "text/plain".to_string()
    } else if lower.ends_with(".json") {
        "application/json".to_string()
    } else if lower.ends_with(".png") {
        "image/png".to_string()
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg".to_string()
    } else {
        "application/octet-stream".to_string()
    }
}

fn normalize_upload_mime_type(uploaded_mime: Option<&str>, file_name: &str) -> String {
    match uploaded_mime.map(str::trim) {
        Some(value) if is_safe_attachment_mime_type(value) => value.to_string(),
        _ => guess_mime_from_name(file_name),
    }
}

fn safe_user_scope_id(user_id: &str) -> String {
    let filtered = user_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    if filtered.is_empty() {
        "user".to_string()
    } else {
        filtered
    }
}

pub(super) fn storage_key_for(user_id: &str, attachment_id: &str, file_name: &str) -> String {
    let day_bucket = chrono::Utc::now().format("%Y/%m/%d").to_string();
    format!(
        "{}/{}/{}_{}",
        safe_user_scope_id(user_id),
        day_bucket,
        attachment_id,
        sanitize_upload_file_name(file_name)
    )
}

fn is_safe_storage_key(storage_key: &str) -> bool {
    if storage_key.trim().is_empty() || storage_key.len() > MAX_ATTACHMENT_STORAGE_KEY_LEN {
        return false;
    }
    let path = Path::new(storage_key);
    path.components()
        .all(|component| matches!(component, Component::Normal(_)))
}

fn is_safe_attachment_id(attachment_id: &str) -> bool {
    !attachment_id.trim().is_empty()
        && attachment_id.len() <= MAX_ATTACHMENT_ID_LEN
        && attachment_id.chars().all(|ch| ch.is_ascii_alphanumeric())
}

fn is_safe_attachment_file_name(file_name: &str) -> bool {
    !file_name.trim().is_empty()
        && file_name.len() <= MAX_ATTACHMENT_FILE_NAME_LEN
        && !file_name.chars().any(|ch| ch.is_control())
}

fn is_safe_attachment_mime_type(mime_type: &str) -> bool {
    !mime_type.trim().is_empty()
        && mime_type.len() <= MAX_ATTACHMENT_MIME_TYPE_LEN
        && mime_type.is_ascii()
        && mime_type.contains('/')
        && !mime_type
            .chars()
            .any(|ch| ch.is_control() || ch.is_ascii_whitespace())
}

fn evaluate_upload_admission(
    archive_only_enabled: bool,
    quota_bytes: i64,
    max_upload_bytes: i64,
    used_bytes: i64,
    upload_size_bytes: i64,
) -> UploadAdmission {
    if archive_only_enabled {
        return UploadAdmission::ArchiveOnly;
    }
    if upload_size_bytes > max_upload_bytes {
        return UploadAdmission::TooLarge {
            limit_mb: max_upload_bytes / (1024 * 1024),
        };
    }
    if used_bytes.saturating_add(upload_size_bytes) > quota_bytes {
        return UploadAdmission::QuotaExceeded;
    }
    UploadAdmission::Allowed
}

pub(super) async fn persist_uploaded_file(
    storage_key: &str,
    bytes: &[u8],
    mime_type: &str,
) -> Result<(String, String), String> {
    if let Some(client) = seaweedfs_client() {
        if upload_object_payload(&client, storage_key, bytes.to_vec(), mime_type).await {
            return Ok(("seaweedfs".to_string(), storage_key.to_string()));
        }
    }

    let path = upload_root_dir().join(PathBuf::from(storage_key));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|err| {
                tracing::error!(error = %err, path = %parent.display(), "failed to prepare upload directory");
                "failed to prepare upload directory".to_string()
            })?;
    }
    fs::write(&path, bytes).await.map_err(|err| {
        tracing::error!(error = %err, path = %path.display(), "failed to persist upload bytes");
        "failed to persist upload bytes".to_string()
    })?;
    Ok(("filesystem".to_string(), storage_key.to_string()))
}

pub(super) async fn delete_uploaded_file(
    storage_backend: &str,
    storage_key: &str,
) -> Result<(), String> {
    match storage_backend {
        "seaweedfs" => {
            let client =
                seaweedfs_client().ok_or_else(|| "object storage is unavailable".to_string())?;
            delete_object_payload(&client, storage_key).await
        }
        "filesystem" => {
            let path = upload_root_dir().join(PathBuf::from(storage_key));
            match fs::remove_file(&path).await {
                Ok(()) => Ok(()),
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(err) => {
                    tracing::error!(error = %err, path = %path.display(), "failed to delete upload bytes");
                    Err("failed to delete upload bytes".to_string())
                }
            }
        }
        _ => Err("unsupported attachment backend".to_string()),
    }
}

pub(super) fn upload_root_dir() -> PathBuf {
    std::env::var("OMNYID_UPLOAD_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("omnyid-uploads"))
}

pub(super) fn build_download_url(
    attachment_id: &str,
    storage_backend: &str,
    storage_key: &str,
    file_name: &str,
    mime_type: &str,
) -> Result<String, (StatusCode, String)> {
    if !is_safe_attachment_id(attachment_id) {
        return Err((StatusCode::BAD_REQUEST, "invalid attachment id".to_string()));
    }
    if !matches!(storage_backend, "seaweedfs" | "filesystem") {
        return Err((
            StatusCode::BAD_REQUEST,
            "unsupported attachment backend".to_string(),
        ));
    }
    if !is_safe_storage_key(storage_key) {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid attachment storage key".to_string(),
        ));
    }
    if !is_safe_attachment_file_name(file_name) {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid attachment file name".to_string(),
        ));
    }
    if !is_safe_attachment_mime_type(mime_type) {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid attachment mime type".to_string(),
        ));
    }
    let expires_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs() as i64
        + DOWNLOAD_TOKEN_TTL_SECS;
    let token = AttachmentDownloadToken {
        attachment_id: attachment_id.to_string(),
        storage_backend: storage_backend.to_string(),
        storage_key: storage_key.to_string(),
        file_name: file_name.to_string(),
        mime_type: mime_type.to_string(),
        expires_at,
    };
    let payload = serde_json::to_vec(&token).map_err(|err| internal_http_error(err))?;
    let token_b64 = URL_SAFE_NO_PAD.encode(payload);
    let sig = sign_download_token(&token_b64)?;
    Ok(format!(
        "/attachments/{attachment_id}?token={}&sig={sig}",
        urlencoding::encode(&token_b64)
    ))
}

fn verify_download_token(
    attachment_id: &str,
    token_b64: &str,
    sig: &str,
) -> Result<AttachmentDownloadToken, (StatusCode, String)> {
    if token_b64.len() > MAX_ATTACHMENT_TOKEN_B64_LEN {
        return Err((
            StatusCode::BAD_REQUEST,
            "attachment token is too large".to_string(),
        ));
    }
    verify_download_signature(token_b64, sig)?;
    let payload = URL_SAFE_NO_PAD.decode(token_b64).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "invalid attachment token".to_string(),
        )
    })?;
    let token: AttachmentDownloadToken = serde_json::from_slice(&payload).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "invalid attachment token payload".to_string(),
        )
    })?;
    if !is_safe_attachment_id(attachment_id) || !is_safe_attachment_id(&token.attachment_id) {
        return Err((StatusCode::BAD_REQUEST, "invalid attachment id".to_string()));
    }
    if !matches!(token.storage_backend.as_str(), "seaweedfs" | "filesystem") {
        return Err((
            StatusCode::BAD_REQUEST,
            "unsupported attachment backend".to_string(),
        ));
    }
    if !is_safe_storage_key(&token.storage_key) {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid attachment storage key".to_string(),
        ));
    }
    if !is_safe_attachment_file_name(&token.file_name) {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid attachment file name".to_string(),
        ));
    }
    if !is_safe_attachment_mime_type(&token.mime_type) {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid attachment mime type".to_string(),
        ));
    }
    if token.attachment_id != attachment_id {
        return Err((
            StatusCode::BAD_REQUEST,
            "attachment token mismatch".to_string(),
        ));
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs() as i64;
    if token.expires_at > now + DOWNLOAD_TOKEN_TTL_SECS + MAX_ATTACHMENT_TOKEN_CLOCK_SKEW_SECS {
        return Err((
            StatusCode::BAD_REQUEST,
            "attachment expiry is out of bounds".to_string(),
        ));
    }
    if token.expires_at < now {
        return Err((
            StatusCode::UNAUTHORIZED,
            "attachment link has expired".to_string(),
        ));
    }
    Ok(token)
}

fn sign_download_token(token_b64: &str) -> Result<String, (StatusCode, String)> {
    let secret = attachment_signing_secret();
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| internal_http_error("invalid attachment signing secret"))?;
    mac.update(token_b64.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

fn verify_download_signature(
    token_b64: &str,
    provided_sig: &str,
) -> Result<(), (StatusCode, String)> {
    if provided_sig.len() != ATTACHMENT_SIG_HEX_LEN {
        return Err((
            StatusCode::UNAUTHORIZED,
            "invalid attachment signature".to_string(),
        ));
    }
    let secret = attachment_signing_secret();
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| internal_http_error("invalid attachment signing secret"))?;
    mac.update(token_b64.as_bytes());
    let sig_bytes = hex::decode(provided_sig).map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            "invalid attachment signature".to_string(),
        )
    })?;
    mac.verify_slice(&sig_bytes).map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            "invalid attachment signature".to_string(),
        )
    })
}

fn attachment_signing_secret() -> String {
    std::env::var("OMNYID_ATTACHMENT_URL_SECRET")
        .or_else(|_| std::env::var("OMNYID_MANIFEST_SIGNING_KEY"))
        .or_else(|_| std::env::var("OMNYID_SIGNING_KEY_HEX"))
        .unwrap_or_else(|_| process_local_attachment_signing_secret())
}

fn process_local_attachment_signing_secret() -> String {
    static SECRET: OnceLock<String> = OnceLock::new();
    SECRET
        .get_or_init(|| {
            let mut bytes = [0_u8; 32];
            rand::rng().fill_bytes(&mut bytes);
            hex::encode(bytes)
        })
        .clone()
}

#[cfg(test)]
mod tests;
