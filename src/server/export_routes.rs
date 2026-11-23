/*
 * @module-id: rust.server.export-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/export/mbox", get(export_mbox_http))
        .route("/export/afp-archive", get(export_afp_archive_http))
        .route("/export/json-ld", get(export_json_ld_http))
        .route("/export/file", post(export_file_http))
}

/// Helper: fetch all AFP messages for the authenticated user across their agents.
async fn user_export_messages(
    state: &AppState,
    user_id: &str,
) -> Result<Vec<crate::export::ExportMessage>, (StatusCode, String)> {
    let agents = state
        .db
        .list_managed_agents_by_user(user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let agent_ids: Vec<String> = agents.iter().map(|a| a.agent_id.clone()).collect();
    let msgs = state
        .db
        .recent_messages_for_user(user_id, &agent_ids, 5000)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let export_msgs = msgs
        .into_iter()
        .map(|m| crate::export::ExportMessage {
            id: m.id,
            thread_id: m.thread_id,
            parent_id: "".to_string(),
            from: m.from,
            to: vec![],
            timestamp: m.timestamp,
            r#type: m.r#type,
            content: m.content,
            prev_hash: None,
        })
        .collect();
    Ok(export_msgs)
}

/// GET /export/mbox
///
/// Download all email-type AFP messages as an RFC 4155 MBOX file.
async fn export_mbox_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<axum::response::Response, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let msgs = user_export_messages(&state, &user.id).await?;
    let mbox_bytes = crate::export::build_mbox(&msgs);
    Ok(axum::response::Response::builder()
        .header("Content-Type", "application/mbox")
        .header(
            "Content-Disposition",
            "attachment; filename=\"omnyid-export.mbox\"",
        )
        .body(axum::body::Body::from(mbox_bytes))
        .map_err(internal_http_error)?)
}

/// GET /export/afp-archive
///
/// Download all AFP messages as a gzip-compressed NDJSON archive with integrity hash.
async fn export_afp_archive_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<axum::response::Response, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let msgs = user_export_messages(&state, &user.id).await?;
    let archive_bytes = crate::export::build_afp_archive(&msgs);
    Ok(axum::response::Response::builder()
        .header("Content-Type", "application/gzip")
        .header(
            "Content-Disposition",
            "attachment; filename=\"omnyid-afp-archive.ndjson.gz\"",
        )
        .body(axum::body::Body::from(archive_bytes))
        .map_err(internal_http_error)?)
}

/// GET /export/json-ld
///
/// Download note-type AFP messages as a JSON-LD schema.org document.
async fn export_json_ld_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let msgs = user_export_messages(&state, &user.id).await?;
    Ok(Json(crate::export::build_json_ld(&msgs)))
}

#[derive(serde::Deserialize)]
struct ExportFileRequest {
    /// "csv" or "xlsx" - whitelisted formats only
    format: String,
    /// Suggested filename (without extension; extension is appended by the server)
    filename: String,
    /// Column headers in order
    columns: Vec<String>,
    /// Data rows; each inner vec must match columns length
    rows: Vec<Vec<String>>,
    /// Optional thread to append the export_result AFP message to
    #[serde(default)]
    thread_id: Option<String>,
    /// Optional parent message ID for the stored export_result AFP message
    #[serde(default)]
    parent_id: Option<String>,
}

fn sanitize_export_filename(raw: &str) -> String {
    let safe_name: String = raw
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if safe_name.is_empty() {
        "export".to_string()
    } else {
        safe_name
    }
}

fn inline_export_payload(
    full_filename: &str,
    format: &str,
    size_bytes: usize,
    bytes: &[u8],
    mime_type: &str,
) -> Result<Value, (StatusCode, String)> {
    if size_bytes > 5 * 1024 * 1024 {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            "SeaweedFS is not configured and the export exceeds the 5 MB inline limit".to_string(),
        ));
    }
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    Ok(serde_json::json!({
        "ok": true,
        "filename": full_filename,
        "format": format,
        "size_bytes": size_bytes,
        "storage": "inline_base64",
        "data": b64,
        "mime_type": mime_type,
        "afp_type": crate::message::AFP_TYPE_EXPORT_RESULT,
    }))
}

async fn workflow_family_context_for_export_parent(
    state: &AppState,
    headers: &HeaderMap,
    thread_id: Option<&str>,
    parent_id: Option<&str>,
) -> Result<Option<Value>, (StatusCode, String)> {
    let Some(thread_id) = thread_id else {
        return Ok(None);
    };
    let Some(parent_id) = parent_id else {
        return Ok(None);
    };
    let thread_messages = thread_messages_for_headers(&state.db, headers, thread_id).await?;
    let parent_message = thread_messages
        .into_iter()
        .find(|message| message.id == parent_id)
        .map(proto_to_app);
    Ok(parent_message
        .as_ref()
        .and_then(crate::workflow_instance_contracts::workflow_family_context_from_message))
}

/// POST /export/file
///
/// Agent-facing endpoint for structured data export (CSV, XLSX).
/// The agent submits columns + rows; the server serialises to the requested
/// format and returns a signed download URL stored in the user's file store.
///
/// Safety rules enforced here:
///   - Format is whitelisted (only "csv" and "xlsx" accepted).
///   - Max 10 000 rows per request.
///   - Filename is sanitised: stripped to alphanumerics, hyphens, and underscores.
///   - File is referenced back to an AFP export_result message so the thread
///     stays consistent with AFP immutability rules.
async fn export_file_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ExportFileRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let fmt = crate::export::ExportFormat::from_str(&body.format).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "format must be 'csv' or 'xlsx'".to_string(),
        )
    })?;

    if body.rows.len() > 10_000 {
        return Err((
            StatusCode::BAD_REQUEST,
            "rows exceeds limit of 10 000".to_string(),
        ));
    }

    let safe_name = sanitize_export_filename(&body.filename);
    let full_filename = format!("{}.{}", safe_name, fmt.extension());

    let value_rows: Vec<Vec<serde_json::Value>> = body
        .rows
        .iter()
        .map(|row| {
            row.iter()
                .map(|cell| serde_json::Value::String(cell.clone()))
                .collect()
        })
        .collect();
    let bytes = crate::export::export_to_file(&fmt, &body.columns, &value_rows)
        .map_err(internal_http_error)?;
    let size_bytes = bytes.len();
    let storage_key = format!("exports/{}/{}", user.id, full_filename);

    let export_payload = if let Some(client) = crate::daemon_runtime::seaweedfs_client() {
        crate::daemon_runtime::upload_archive_payload(&client, &storage_key, bytes.clone()).await;
        let download_url = format!("/export/download/{}", storage_key);
        serde_json::json!({
            "ok": true,
            "filename": full_filename,
            "format": body.format,
            "size_bytes": size_bytes,
            "storage": "seaweedfs",
            "download_url": download_url,
            "afp_type": crate::message::AFP_TYPE_EXPORT_RESULT,
        })
    } else {
        inline_export_payload(
            &full_filename,
            &body.format,
            size_bytes,
            &bytes,
            fmt.mime_type(),
        )?
    };

    let thread_id = body
        .thread_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let parent_id = body
        .parent_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let workflow_family_context =
        workflow_family_context_for_export_parent(&state, &headers, thread_id, parent_id).await?;
    let mut response_payload = export_payload.clone();
    crate::workflow_instance_contracts::attach_workflow_family_context(
        &mut response_payload,
        workflow_family_context.as_ref(),
    );

    if let Some(thread_id) = thread_id {
        let mut stored_export_payload = export_payload.clone();
        crate::workflow_instance_contracts::attach_workflow_family_context(
            &mut stored_export_payload,
            workflow_family_context.as_ref(),
        );
        let mut export_message = new_server_message(
            "omnyid://server/export".to_string(),
            vec![format!("omnyid://user/{}", user.id)],
            thread_id.to_string(),
            crate::message::AFP_TYPE_EXPORT_RESULT,
            stored_export_payload,
            vec![],
            vec![],
            vec![],
            true,
        )
        .map_err(internal_http_error)?;
        export_message.parent_id = parent_id.map(str::to_string);

        let message_id = store_app_message_for_headers(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            &headers,
            export_message,
        )
        .await?;

        response_payload["message_id"] = serde_json::json!(message_id);
        response_payload["thread_id"] = serde_json::json!(thread_id);
    }

    Ok(Json(response_payload))
}

#[cfg(test)]
mod tests {
    use super::sanitize_export_filename;

    #[test]
    fn sanitize_export_filename_replaces_unsafe_characters() {
        assert_eq!(
            sanitize_export_filename("sales report 2026/05"),
            "sales_report_2026_05"
        );
    }

    #[test]
    fn sanitize_export_filename_defaults_when_empty() {
        assert_eq!(sanitize_export_filename(""), "export");
    }

    #[test]
    fn user_export_messages_uses_tenant_aware_loader() {
        let source = include_str!("export_routes.rs");
        let start = source
            .find("async fn user_export_messages(")
            .expect("user_export_messages definition");
        let end = source[start..]
            .find("/// GET /export/mbox")
            .map(|offset| start + offset)
            .expect("export_mbox marker");
        let function_source = &source[start..end];
        assert!(function_source.contains(".recent_messages_for_user(user_id, &agent_ids, 5000)"));
        assert!(!function_source.contains(".recent_messages_for_agents(&agent_ids, 5000)"));
    }

    #[test]
    fn binary_export_routes_do_not_unwrap_response_builders() {
        let source = include_str!("export_routes.rs");
        let mbox_start = source
            .find("async fn export_mbox_http(")
            .expect("export_mbox_http definition");
        let json_ld_start = source[mbox_start..]
            .find("/// GET /export/json-ld")
            .map(|offset| mbox_start + offset)
            .expect("json-ld marker");
        let binary_export_source = &source[mbox_start..json_ld_start];

        assert!(binary_export_source.contains(".map_err(internal_http_error)?"));
        assert!(!binary_export_source.contains(".unwrap()"));
    }
}
