use super::{
    AttachmentDownloadToken, DOWNLOAD_TOKEN_TTL_SECS, MAX_ATTACHMENT_FILE_NAME_LEN,
    MAX_ATTACHMENT_TOKEN_CLOCK_SKEW_SECS, UploadAdmission, apply_attachment_download_headers,
    build_download_url, evaluate_upload_admission, guess_mime_from_name,
    normalize_upload_mime_type, sanitize_upload_file_name, sign_download_token,
    verify_download_token,
};
use axum::{
    body::Body,
    http::{HeaderValue, Response, header},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const TEST_FREE_STORAGE_BYTES: i64 = 5 * 1024 * 1024 * 1024;
const TEST_PAID_STORAGE_BYTES: i64 = 15 * 1024 * 1024 * 1024;
const TEST_PAID_MAX_UPLOAD_BYTES: i64 = 100 * 1024 * 1024;

#[test]
fn upload_file_name_is_sanitized_for_storage() {
    assert_eq!(
        sanitize_upload_file_name("..\\quarterly:report?.pdf"),
        "_quarterly_report_.pdf"
    );
}

#[test]
fn upload_file_name_falls_back_for_dot_only_values_and_caps_length() {
    assert_eq!(sanitize_upload_file_name(" .. "), "upload.bin");
    assert_eq!(sanitize_upload_file_name("."), "upload.bin");
    assert_eq!(
        sanitize_upload_file_name(&"a".repeat(400)).len(),
        MAX_ATTACHMENT_FILE_NAME_LEN
    );
}

#[test]
fn file_upload_routes_sanitize_unexpected_storage_and_encoding_errors() {
    let source = include_str!("../file_upload_routes.rs");
    assert!(source.contains("\"invalid multipart form\".to_string()"));
    assert!(source.contains("\"could not read upload body\".to_string()"));
    assert!(source.contains("\"attachment file is unavailable\".to_string()"));
    assert!(source.contains("\"failed to prepare upload directory\".to_string()"));
    assert!(source.contains("\"failed to persist upload bytes\".to_string()"));
    assert!(source.contains("internal_http_error(err)"));
    assert!(!source.contains("format!(\"invalid multipart form: {err}\")"));
    assert!(!source.contains("format!(\"could not read upload body: {err}\")"));
    assert!(!source.contains("format!(\"attachment file is unavailable: {err}\")"));
    assert!(!source.contains("format!(\"failed to prepare upload directory: {err}\")"));
    assert!(!source.contains("format!(\"failed to persist upload bytes: {err}\")"));
    assert!(!source.contains("format!(\"failed to encode download token: {err}\")"));
}

#[test]
fn mime_guess_uses_file_extension_when_needed() {
    assert_eq!(guess_mime_from_name("notes.txt"), "text/plain");
    assert_eq!(
        guess_mime_from_name("archive.bin"),
        "application/octet-stream"
    );
}

#[test]
fn upload_mime_type_is_normalized_to_safe_values() {
    assert_eq!(
        normalize_upload_mime_type(Some("application/pdf"), "report.pdf"),
        "application/pdf"
    );
    assert_eq!(
        normalize_upload_mime_type(Some("bad mime"), "report.pdf"),
        "application/pdf"
    );
    assert_eq!(
        normalize_upload_mime_type(Some("text/plain\nx"), "notes.txt"),
        "text/plain"
    );
}

#[test]
fn signed_download_url_round_trips() {
    let url = build_download_url(
        "01J00000000000000000000000",
        "filesystem",
        "user/2026/07/file.pdf",
        "file.pdf",
        "application/pdf",
    )
    .expect("build url");
    let query = url.split('?').nth(1).expect("query");
    let mut token = "";
    let mut sig = "";
    for pair in query.split('&') {
        if let Some(value) = pair.strip_prefix("token=") {
            token = value;
        }
        if let Some(value) = pair.strip_prefix("sig=") {
            sig = value;
        }
    }
    let verified =
        verify_download_token("01J00000000000000000000000", token, sig).expect("verify token");
    assert_eq!(verified.file_name, "file.pdf");
    assert_eq!(verified.mime_type, "application/pdf");
    assert_eq!(verified.storage_key, "user/2026/07/file.pdf");
}

#[test]
fn signed_download_url_rejects_invalid_metadata_before_signing() {
    let err = build_download_url(
        "01J00000000000000000000000",
        "filesystem",
        "../escape/file.pdf",
        "bad\nname.pdf",
        "bad mime",
    )
    .expect_err("invalid metadata should fail before signing");
    assert_eq!(err.0, axum::http::StatusCode::BAD_REQUEST);
}

#[test]
fn signed_download_url_rejects_attachment_id_mismatch() {
    let url = build_download_url(
        "01J00000000000000000000000",
        "filesystem",
        "user/2026/07/file.pdf",
        "file.pdf",
        "application/pdf",
    )
    .expect("build url");
    let query = url.split('?').nth(1).expect("query");
    let mut token = "";
    let mut sig = "";
    for pair in query.split('&') {
        if let Some(value) = pair.strip_prefix("token=") {
            token = value;
        }
        if let Some(value) = pair.strip_prefix("sig=") {
            sig = value;
        }
    }
    let err = verify_download_token("01J99999999999999999999999", token, sig)
        .expect_err("mismatched attachment id should fail");
    assert_eq!(err.0, axum::http::StatusCode::BAD_REQUEST);
}

#[test]
fn signed_download_url_rejects_malformed_signature() {
    let url = build_download_url(
        "01J00000000000000000000000",
        "filesystem",
        "user/2026/07/file.pdf",
        "file.pdf",
        "application/pdf",
    )
    .expect("build url");
    let query = url.split('?').nth(1).expect("query");
    let mut token = "";
    for pair in query.split('&') {
        if let Some(value) = pair.strip_prefix("token=") {
            token = value;
        }
    }
    let err = verify_download_token("01J00000000000000000000000", token, "not-hex-signature")
        .expect_err("malformed signature should fail");
    assert_eq!(err.0, axum::http::StatusCode::UNAUTHORIZED);
}

#[test]
fn signed_download_url_rejects_expired_token() {
    let token = AttachmentDownloadToken {
        attachment_id: "01J00000000000000000000000".to_string(),
        storage_backend: "filesystem".to_string(),
        storage_key: "user/2026/07/file.pdf".to_string(),
        file_name: "file.pdf".to_string(),
        mime_type: "application/pdf".to_string(),
        expires_at: 1,
    };
    let payload = serde_json::to_vec(&token).expect("encode token");
    let token_b64 = URL_SAFE_NO_PAD.encode(payload);
    let sig = sign_download_token(&token_b64).expect("sign token");
    let err = verify_download_token(&token.attachment_id, &token_b64, &sig)
        .expect_err("expired token should fail");
    assert_eq!(err.0, axum::http::StatusCode::UNAUTHORIZED);
}

#[test]
fn signed_download_url_rejects_far_future_expiry() {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs() as i64;
    let token = AttachmentDownloadToken {
        attachment_id: "01J00000000000000000000000".to_string(),
        storage_backend: "filesystem".to_string(),
        storage_key: "user/2026/07/file.pdf".to_string(),
        file_name: "file.pdf".to_string(),
        mime_type: "application/pdf".to_string(),
        expires_at: now + DOWNLOAD_TOKEN_TTL_SECS + MAX_ATTACHMENT_TOKEN_CLOCK_SKEW_SECS + 1,
    };
    let payload = serde_json::to_vec(&token).expect("encode token");
    let token_b64 = URL_SAFE_NO_PAD.encode(payload);
    let sig = sign_download_token(&token_b64).expect("sign token");
    let err = verify_download_token(&token.attachment_id, &token_b64, &sig)
        .expect_err("far future expiry should fail");
    assert_eq!(err.0, axum::http::StatusCode::BAD_REQUEST);
}

#[test]
fn signed_download_url_rejects_oversized_token() {
    let err = verify_download_token(
        "01J00000000000000000000000",
        &"a".repeat(4097),
        &"0".repeat(64),
    )
    .expect_err("oversized token should fail");
    assert_eq!(err.0, axum::http::StatusCode::BAD_REQUEST);
}

#[test]
fn signed_download_url_rejects_unsupported_storage_backend() {
    let token = AttachmentDownloadToken {
        attachment_id: "01J00000000000000000000000".to_string(),
        storage_backend: "mystery".to_string(),
        storage_key: "user/2026/07/file.pdf".to_string(),
        file_name: "file.pdf".to_string(),
        mime_type: "application/pdf".to_string(),
        expires_at: i64::MAX,
    };
    let payload = serde_json::to_vec(&token).expect("encode token");
    let token_b64 = URL_SAFE_NO_PAD.encode(payload);
    let sig = sign_download_token(&token_b64).expect("sign token");
    let err = verify_download_token(&token.attachment_id, &token_b64, &sig)
        .expect_err("unsupported backend should fail verification");
    assert_eq!(err.0, axum::http::StatusCode::BAD_REQUEST);
}

#[test]
fn signed_download_url_rejects_unsafe_storage_key() {
    let token = AttachmentDownloadToken {
        attachment_id: "01J00000000000000000000000".to_string(),
        storage_backend: "filesystem".to_string(),
        storage_key: "../escape/file.pdf".to_string(),
        file_name: "file.pdf".to_string(),
        mime_type: "application/pdf".to_string(),
        expires_at: i64::MAX,
    };
    let payload = serde_json::to_vec(&token).expect("encode token");
    let token_b64 = URL_SAFE_NO_PAD.encode(payload);
    let sig = sign_download_token(&token_b64).expect("sign token");
    let err = verify_download_token(&token.attachment_id, &token_b64, &sig)
        .expect_err("unsafe storage key should fail verification");
    assert_eq!(err.0, axum::http::StatusCode::BAD_REQUEST);
}

#[test]
fn signed_download_url_rejects_invalid_file_name() {
    let token = AttachmentDownloadToken {
        attachment_id: "01J00000000000000000000000".to_string(),
        storage_backend: "filesystem".to_string(),
        storage_key: "user/2026/07/file.pdf".to_string(),
        file_name: "bad\nname.pdf".to_string(),
        mime_type: "application/pdf".to_string(),
        expires_at: i64::MAX,
    };
    let payload = serde_json::to_vec(&token).expect("encode token");
    let token_b64 = URL_SAFE_NO_PAD.encode(payload);
    let sig = sign_download_token(&token_b64).expect("sign token");
    let err = verify_download_token(&token.attachment_id, &token_b64, &sig)
        .expect_err("invalid file name should fail verification");
    assert_eq!(err.0, axum::http::StatusCode::BAD_REQUEST);
}

#[test]
fn signed_download_url_rejects_invalid_mime_type() {
    let token = AttachmentDownloadToken {
        attachment_id: "01J00000000000000000000000".to_string(),
        storage_backend: "filesystem".to_string(),
        storage_key: "user/2026/07/file.pdf".to_string(),
        file_name: "file.pdf".to_string(),
        mime_type: "bad mime".to_string(),
        expires_at: i64::MAX,
    };
    let payload = serde_json::to_vec(&token).expect("encode token");
    let token_b64 = URL_SAFE_NO_PAD.encode(payload);
    let sig = sign_download_token(&token_b64).expect("sign token");
    let err = verify_download_token(&token.attachment_id, &token_b64, &sig)
        .expect_err("invalid mime type should fail verification");
    assert_eq!(err.0, axum::http::StatusCode::BAD_REQUEST);
}

#[test]
fn attachment_download_headers_disable_sniffing_and_shared_caching() {
    let mut response = Response::new(Body::empty());
    apply_attachment_download_headers(
        &mut response,
        HeaderValue::from_static("application/pdf"),
        HeaderValue::from_static("attachment; filename=\"file.pdf\""),
    );
    assert_eq!(
        response.headers().get(header::CACHE_CONTROL),
        Some(&HeaderValue::from_static("private, no-store, max-age=0"))
    );
    assert_eq!(
        response.headers().get("x-content-type-options"),
        Some(&HeaderValue::from_static("nosniff"))
    );
}

#[test]
fn upload_admission_allows_paid_upload_with_headroom() {
    let result = evaluate_upload_admission(
        false,
        TEST_PAID_STORAGE_BYTES,
        TEST_PAID_MAX_UPLOAD_BYTES,
        2 * 1024 * 1024,
        25 * 1024 * 1024,
    );
    assert_eq!(result, UploadAdmission::Allowed);
}

#[test]
fn upload_admission_rejects_file_over_single_upload_limit() {
    let result = evaluate_upload_admission(
        false,
        TEST_PAID_STORAGE_BYTES,
        TEST_PAID_MAX_UPLOAD_BYTES,
        0,
        TEST_PAID_MAX_UPLOAD_BYTES + 1,
    );
    assert_eq!(result, UploadAdmission::TooLarge { limit_mb: 100 });
}

#[test]
fn upload_admission_rejects_when_quota_would_be_exceeded() {
    let result = evaluate_upload_admission(
        false,
        TEST_FREE_STORAGE_BYTES,
        25 * 1024 * 1024,
        TEST_FREE_STORAGE_BYTES - 1024,
        2048,
    );
    assert_eq!(result, UploadAdmission::QuotaExceeded);
}

#[test]
fn upload_admission_rejects_when_archive_only_mode_is_active() {
    let result = evaluate_upload_admission(
        true,
        TEST_PAID_STORAGE_BYTES,
        TEST_PAID_MAX_UPLOAD_BYTES,
        2 * 1024 * 1024,
        25 * 1024 * 1024,
    );
    assert_eq!(result, UploadAdmission::ArchiveOnly);
}

#[test]
fn file_library_route_exposes_page_and_category_facets() {
    let source = include_str!("../file_upload_routes.rs");
    assert!(source.contains("\"page\": {"));
    assert!(source.contains("\"has_more\":"));
    assert!(source.contains("\"category\": query.category"));
    assert!(source.contains("\"source_kind\": query.source_kind"));
    assert!(source.contains("\"availability\": query.availability"));
    assert!(source.contains("\"academic_kind\": query.academic_kind"));
    assert!(source.contains("\"course_tag\": query.course_tag"));
    assert!(source.contains("\"unit_tag\": query.unit_tag"));
    assert!(source.contains("\"chapter_tag\": query.chapter_tag"));
    assert!(source.contains("\"week_tag\": query.week_tag"));
    assert!(source.contains("\"lecture_tag\": query.lecture_tag"));
    assert!(source.contains("\"zettelkasten_stage\": query.zettelkasten_stage"));
    assert!(source.contains("\"category_counts\":"));
    assert!(source.contains("\"availability_counts\":"));
    assert!(source.contains("\"source_kind_counts\":"));
    assert!(source.contains("\"academic_kind_counts\":"));
    assert!(source.contains("\"course_tag_counts\":"));
    assert!(source.contains("\"unit_tag_counts\":"));
    assert!(source.contains("\"chapter_tag_counts\":"));
    assert!(source.contains("\"week_tag_counts\":"));
    assert!(source.contains("\"lecture_tag_counts\":"));
    assert!(source.contains("\"zettelkasten_stage_counts\":"));
    assert!(source.contains("\"linked_count\":"));
}

#[test]
fn file_library_backend_search_supports_summary_checksum_and_retention_labels() {
    let source = include_str!("../../db.rs");
    assert!(source.contains("LOWER(COALESCE(r.sha256, '')) LIKE $1"));
    assert!(source.contains("LOWER(COALESCE(r.source_summary, '')) LIKE $1"));
    assert!(source.contains("COALESCE(NULLIF(m.kind, ''), m.type) AS source_kind"));
    assert!(
        source.contains(
            "LOWER(COALESCE(r.source_metadata->>'attachment_retention_label', '')) LIKE $1"
        )
    );
    assert!(source.contains("LOWER(COALESCE(r.source_metadata->>'knowledge_mode', '')) LIKE $1"));
    assert!(source.contains("LOWER(COALESCE(r.source_metadata->>'academic_summary', '')) LIKE $1"));
    assert!(
        source.contains("LOWER(COALESCE(r.source_metadata->>'academic_course_tag', '')) LIKE $1")
    );
    assert!(
        source.contains("LOWER(COALESCE(r.source_metadata->>'academic_week_tag', '')) LIKE $1")
    );
    assert!(
        source.contains("LOWER(COALESCE(r.source_metadata->>'academic_chapter_tag', '')) LIKE $1")
    );
    assert!(
        source.contains("LOWER(COALESCE(r.source_metadata->>'academic_unit_tag', '')) LIKE $1")
    );
    assert!(source.contains(
        "OR LOWER(COALESCE(r.source_metadata->>'academic_chapter_tag', '')) = LOWER($12)"
    ));
    assert!(
        source.contains(
            "OR LOWER(COALESCE(r.source_metadata->>'academic_unit_tag', '')) = LOWER($13)"
        )
    );
    assert!(
        source.contains("LOWER(COALESCE(r.source_metadata->>'zettelkasten_stage', '')) LIKE $1")
    );
    assert!(
        source.contains(
            "LOWER(COALESCE(r.source_metadata->>'zettelkasten_next_action', '')) LIKE $1"
        )
    );
    assert!(
        source.contains(
            "LOWER(COALESCE(r.source_metadata->>'knowledge_graph_group_key', '')) LIKE $1"
        )
    );
    assert!(source.contains("jsonb_array_elements_text("));
    assert!(source.contains("knowledge_graph_link_tags"));
    assert!(
        source
            .contains("COALESCE(m.metadata->>'knowledge_pipeline', '') = 'connected_notes_ingest'")
    );
    assert!(source.contains("LOWER(COALESCE(m.metadata->>'source_persisted', 'false')) = 'false'"));
    assert!(source.contains("WHERE LOWER(t) = ANY($2)"));
}
