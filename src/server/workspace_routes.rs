/*
 * @module-id: rust.server.workspace-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/runtime/workspace-files",
            get(runtime_workspace_files_http),
        )
        .route(
            "/runtime/workspace-file",
            get(runtime_workspace_file_http).post(runtime_workspace_file_save_http),
        )
        .route(
            "/runtime/workspace-reset",
            post(runtime_workspace_reset_http),
        )
        .route(
            "/agent/fs/thread/{thread_id}",
            get(workspace_thread_read_http),
        )
        .route(
            "/agent/fs/thread/{thread_id}/summary",
            get(workspace_thread_summary_http),
        )
        .route("/agent/fs/grep", get(workspace_thread_grep_http))
}

pub(super) async fn runtime_workspace_files_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeWorkspaceFilesResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    if deployment.framework != "python-runner-chat" {
        return Err((
            StatusCode::BAD_REQUEST,
            "workspace file editing is only available for the Python runner runtime".to_string(),
        ));
    }
    let files = python_runner_workspace_files(&deployment);
    let active_file_id = files.first().map(|file| file.file_id.to_string());

    Ok(Json(RuntimeWorkspaceFilesResponse {
        framework: deployment.framework,
        active_file_id,
        edit_scope: "private_runner_instance".to_string(),
        reset_supported: true,
        files: files
            .into_iter()
            .map(|file| RuntimeWorkspaceFileEntryResponse {
                file_id: file.file_id.to_string(),
                label: file.label.to_string(),
                relative_path: file.relative_path.to_string(),
                language: file.language.to_string(),
                editable: file.editable,
            })
            .collect(),
    }))
}

#[derive(serde::Deserialize, Default)]
pub(super) struct RuntimeWorkspaceResetRequest {
    #[serde(default)]
    pub(super) file_id: Option<String>,
}

pub(super) async fn runtime_workspace_file_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<RuntimeWorkspaceFileQuery>,
) -> Result<Json<RuntimeWorkspaceFileResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    if deployment.framework != "python-runner-chat" {
        return Err((
            StatusCode::BAD_REQUEST,
            "workspace file editing is only available for the Python runner runtime".to_string(),
        ));
    }
    let descriptor =
        python_runner_workspace_file(&deployment, &query.file_id).ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "workspace file not found".to_string(),
            )
        })?;
    let content =
        std::fs::read_to_string(&descriptor.path).map_err(|err| internal_http_error(err))?;
    let updated_at = std::fs::metadata(&descriptor.path)
        .and_then(|meta| meta.modified())
        .ok()
        .map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    Ok(Json(RuntimeWorkspaceFileResponse {
        file_id: descriptor.file_id.to_string(),
        label: descriptor.label.to_string(),
        relative_path: descriptor.relative_path.to_string(),
        language: descriptor.language.to_string(),
        editable: descriptor.editable,
        content,
        updated_at,
    }))
}

pub(super) async fn runtime_workspace_file_save_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeWorkspaceFileSaveRequest>,
) -> Result<Json<RuntimeWorkspaceFileResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_workspace_file", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    if deployment.framework != "python-runner-chat" {
        return Err((
            StatusCode::BAD_REQUEST,
            "workspace file editing is only available for the Python runner runtime".to_string(),
        ));
    }
    let descriptor =
        python_runner_workspace_file(&deployment, &request.file_id).ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "workspace file not found".to_string(),
            )
        })?;
    if !descriptor.editable {
        return Err((
            StatusCode::BAD_REQUEST,
            "selected workspace file is read-only".to_string(),
        ));
    }
    write_runtime_file(&descriptor.path, &request.content).map_err(internal_http_error)?;

    Ok(Json(RuntimeWorkspaceFileResponse {
        file_id: descriptor.file_id.to_string(),
        label: descriptor.label.to_string(),
        relative_path: descriptor.relative_path.to_string(),
        language: descriptor.language.to_string(),
        editable: descriptor.editable,
        content: request.content,
        updated_at: chrono::Utc::now().to_rfc3339(),
    }))
}

pub(super) async fn runtime_workspace_reset_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeWorkspaceResetRequest>,
) -> Result<Json<RuntimeWorkspaceResetResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_workspace_reset", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let deployment = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "no runtime deployment exists for this account".to_string(),
            )
        })?;
    if deployment.framework != "python-runner-chat" {
        return Err((
            StatusCode::BAD_REQUEST,
            "workspace reset is only available for the Python runner runtime".to_string(),
        ));
    }

    let restored_file_ids =
        reset_python_runner_workspace_editables(&deployment, request.file_id.as_deref())
            .map_err(internal_http_error)?;

    Ok(Json(RuntimeWorkspaceResetResponse {
        framework: deployment.framework,
        reset_scope: "private_runner_instance".to_string(),
        restored_file_ids,
        updated_at: chrono::Utc::now().to_rfc3339(),
    }))
}

fn reset_python_runner_workspace_editables(
    _deployment: &RuntimeDeploymentRecord,
    _file_id: Option<&str>,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[derive(serde::Deserialize)]
pub(super) struct WorkspaceThreadReadQuery {
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    window: Option<usize>,
}

#[derive(serde::Deserialize)]
pub(super) struct WorkspaceThreadGrepQuery {
    pub(super) query: String,
    pub(super) thread_id: String,
    #[serde(default)]
    pub(super) limit: Option<usize>,
}

fn workspace_thread_window(window: Option<usize>) -> usize {
    window.unwrap_or(8).clamp(1, 50)
}

fn workspace_thread_grep_limit(limit: Option<usize>) -> usize {
    limit.unwrap_or(20).clamp(1, 100)
}

pub(super) async fn workspace_thread_read_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(thread_id): Path<String>,
    Query(query): Query<WorkspaceThreadReadQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let messages = thread_messages_for_headers(&state.db, &headers, &thread_id).await?;
    let app_messages = messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let mode = crate::workspace_filesystem::ThreadReadMode::parse(
        query.mode.as_deref().unwrap_or("latest"),
    );
    let response = crate::workspace_filesystem::read_thread(
        &app_messages,
        mode,
        workspace_thread_window(query.window),
    );
    Ok(Json(serde_json::to_value(response).unwrap_or_else(
        |_| serde_json::json!({"thread_id": thread_id, "mode": mode.as_str(), "message_count": 0}),
    )))
}

pub(super) async fn workspace_thread_summary_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(thread_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let messages = thread_messages_for_headers(&state.db, &headers, &thread_id).await?;
    let app_messages = messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let summary =
        crate::workspace_filesystem::latest_thread_summary(&app_messages).ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "thread summary not available".to_string(),
            )
        })?;
    Ok(Json(serde_json::to_value(summary).unwrap_or_else(
        |_| serde_json::json!({"thread_id": thread_id, "summary_text": "", "source": "error"}),
    )))
}

pub(super) async fn workspace_thread_grep_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<WorkspaceThreadGrepQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if query.query.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "query must not be empty".to_string(),
        ));
    }

    let messages = thread_messages_for_headers(&state.db, &headers, &query.thread_id).await?;
    let app_messages = messages.into_iter().map(proto_to_app).collect::<Vec<_>>();
    let hits = crate::workspace_filesystem::grep_thread(
        &app_messages,
        &query.query,
        workspace_thread_grep_limit(query.limit),
    );
    Ok(Json(serde_json::json!({
        "thread_id": query.thread_id,
        "query": query.query,
        "hits": hits,
    })))
}

#[cfg(test)]
mod tests {
    #[test]
    fn workspace_thread_window_is_bounded() {
        assert_eq!(super::workspace_thread_window(None), 8);
        assert_eq!(super::workspace_thread_window(Some(0)), 1);
        assert_eq!(super::workspace_thread_window(Some(12)), 12);
        assert_eq!(super::workspace_thread_window(Some(5_000)), 50);
    }

    #[test]
    fn workspace_thread_grep_limit_is_bounded() {
        assert_eq!(super::workspace_thread_grep_limit(None), 20);
        assert_eq!(super::workspace_thread_grep_limit(Some(0)), 1);
        assert_eq!(super::workspace_thread_grep_limit(Some(40)), 40);
        assert_eq!(super::workspace_thread_grep_limit(Some(5_000)), 100);
    }
}
