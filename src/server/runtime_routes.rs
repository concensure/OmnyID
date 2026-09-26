/*
 * @module-id: rust.server.runtime-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/runtime/deploy", post(runtime_deploy_http))
        .route("/runtime/action", post(runtime_action_http))
        .route("/runtime/destroy", post(runtime_destroy_http))
        .route("/runtime/logs", get(runtime_logs_http))
        .route(
            "/runtime/runner-config",
            get(runtime_runner_config_http).post(runtime_runner_config_action_http),
        )
}

async fn runtime_deploy_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeDeployRequest>,
) -> Result<Json<RuntimeDeploymentResponse>, (StatusCode, String)> {
    ensure_private_runtime_feature_enabled()?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_deploy", &headers),
        RateLimitPolicy {
            max_requests: 6,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let onboarding = state
        .db
        .find_user_onboarding(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .unwrap_or_else(|| default_onboarding_for_user(&user));

    if onboarding.completed_at.is_none() {
        return Err((
            StatusCode::PRECONDITION_REQUIRED,
            "complete agent setup before deploying a private runtime".to_string(),
        ));
    }

    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let deployment = build_runtime_deployment_plan(
        &user,
        &agents,
        request.framework.as_deref().unwrap_or("crewai"),
        request.gui.as_deref(),
    )?;

    materialize_runtime_scaffold(&deployment).map_err(internal_http_error)?;

    let mut deployment = inspect_runtime_deployment(deployment);
    deployment = match runtime_compose_action(&deployment, "start").await {
        Ok(()) => inspect_runtime_deployment_live(deployment).await,
        Err(err) => annotate_runtime_error(deployment, "scaffolded", &err),
    };

    state
        .db
        .upsert_runtime_deployment(&deployment)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(runtime_deployment_response_live(deployment).await))
}

async fn runtime_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeActionRequest>,
) -> Result<Json<RuntimeDeploymentResponse>, (StatusCode, String)> {
    ensure_private_runtime_feature_enabled()?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_action", &headers),
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
    let action = request.action.trim().to_lowercase();
    if !matches!(action.as_str(), "start" | "stop" | "restart") {
        return Err((
            StatusCode::BAD_REQUEST,
            "runtime action must be start, stop, or restart".to_string(),
        ));
    }

    let deployment = inspect_runtime_deployment(deployment);
    let fallback_status = deployment.status.clone();
    let mut deployment = match runtime_compose_action(&deployment, &action).await {
        Ok(()) => inspect_runtime_deployment_live(deployment).await,
        Err(err) => annotate_runtime_error(deployment, &fallback_status, &err),
    };
    deployment.updated_at = chrono::Utc::now().to_rfc3339();

    state
        .db
        .upsert_runtime_deployment(&deployment)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(runtime_deployment_response_live(deployment).await))
}

async fn runtime_destroy_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    ensure_private_runtime_feature_enabled()?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_destroy", &headers),
        RateLimitPolicy {
            max_requests: 6,
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
    let deployment = inspect_runtime_deployment(deployment);
    let stopped = runtime_compose_down(&deployment).await;
    let workspace_removed = remove_runtime_workspace(&deployment.workspace_path)
        .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    let deleted = state
        .db
        .delete_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .is_some();

    Ok(Json(serde_json::json!({
        "status": "destroyed",
        "workspace_removed": workspace_removed,
        "runtime_record_deleted": deleted,
        "compose_down": stopped.is_ok(),
        "compose_down_error": stopped.err(),
        "message": "Private runtime destroyed. The dashboard no longer retains a hosted runtime record for this account."
    })))
}

async fn runtime_logs_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeLogsResponse>, (StatusCode, String)> {
    ensure_private_runtime_feature_enabled()?;
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
    let deployment = inspect_runtime_deployment_live(inspect_runtime_deployment(deployment)).await;
    let (source, lines) = runtime_log_lines(&deployment).await;

    Ok(Json(RuntimeLogsResponse {
        status: deployment.status,
        source,
        lines,
        updated_at: chrono::Utc::now().to_rfc3339(),
    }))
}

async fn runtime_runner_config_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    ensure_private_runtime_feature_enabled()?;
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
            "runner config is only available for the Python runner runtime".to_string(),
        ));
    }
    let policy_events = state
        .db
        .list_runtime_runner_policy_events(&user.id, 8)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(runtime_runner_policy_event_entry_response)
        .collect::<Vec<_>>();
    Ok(Json(serde_json::json!({
        "framework": deployment.framework,
        "model_policy": deployment.config_json.get("model_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "tool_policy": deployment.config_json.get("tool_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "channel_policy": deployment.config_json.get("channel_policy").cloned().unwrap_or_else(|| serde_json::json!({})),
        "starter_templates": deployment.config_json.get("starter_templates").cloned().unwrap_or_else(|| Value::Array(vec![])),
        "starter_template_id": deployment
            .config_json
            .get("starter_profile")
            .and_then(|profile| profile.get("default_template_id"))
            .cloned()
            .unwrap_or_else(|| Value::String("travel_planner".to_string())),
        "policy_events": policy_events,
    })))
}

async fn runtime_runner_config_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeRunnerConfigRequest>,
) -> Result<Json<RuntimeDeploymentResponse>, (StatusCode, String)> {
    ensure_private_runtime_feature_enabled()?;
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_runner_config", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let mut deployment = state
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
            "runner config is only available for the Python runner runtime".to_string(),
        ));
    }
    if request.action.trim() != "save_policies" {
        return Err((
            StatusCode::BAD_REQUEST,
            "runtime runner config action must be save_policies".to_string(),
        ));
    }
    let config = deployment
        .config_json
        .as_object_mut()
        .ok_or_else(|| internal_http_error("runtime deployment config_json was not an object"))?;
    if let Some(model_policy) = request.model_policy {
        config.insert("model_policy".to_string(), model_policy);
    }
    if let Some(tool_policy) = request.tool_policy {
        config.insert("tool_policy".to_string(), tool_policy);
    }
    if let Some(channel_policy) = request.channel_policy {
        config.insert("channel_policy".to_string(), channel_policy);
    }
    if let Some(starter_template_id) = request.starter_template_id {
        let starter_profile = config
            .entry("starter_profile".to_string())
            .or_insert_with(|| serde_json::json!({}));
        if let Some(profile) = starter_profile.as_object_mut() {
            profile.insert(
                "default_template_id".to_string(),
                Value::String(starter_template_id),
            );
        }
    }
    let updated_at = chrono::Utc::now().to_rfc3339();
    deployment.updated_at = updated_at.clone();
    sync_runtime_policy_file(&deployment).map_err(internal_http_error)?;
    sync_runtime_agent_profile_file(&deployment).map_err(internal_http_error)?;
    state
        .db
        .upsert_runtime_deployment(&deployment)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let enabled_tools = deployment
        .config_json
        .get("tool_policy")
        .and_then(Value::as_object)
        .map(|policy| {
            policy
                .iter()
                .filter_map(|(name, value)| {
                    value
                        .get("enabled")
                        .and_then(Value::as_bool)
                        .filter(|enabled| *enabled)
                        .map(|_| Value::String(name.clone()))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let enabled_channels = deployment
        .config_json
        .get("channel_policy")
        .and_then(Value::as_object)
        .map(|policy| {
            policy
                .iter()
                .filter_map(|(name, value)| {
                    value
                        .get("enabled")
                        .and_then(Value::as_bool)
                        .filter(|enabled| *enabled)
                        .map(|_| Value::String(name.clone()))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    state
        .db
        .create_runtime_runner_policy_event(&RuntimeRunnerPolicyEventRecord {
            id: Ulid::new().to_string(),
            owner_user_id: user.id.clone(),
            runtime_deployment_id: Some(deployment.id.clone()),
            event_kind: "policy_saved".to_string(),
            summary_json: serde_json::json!({
                "starter_template_id": deployment
                    .config_json
                    .get("starter_profile")
                    .and_then(|profile| profile.get("default_template_id"))
                    .cloned()
                    .unwrap_or_else(|| Value::String("travel_planner".to_string())),
                "model_mode": deployment
                    .config_json
                    .get("model_policy")
                    .and_then(|policy| policy.get("mode"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "default_model": deployment
                    .config_json
                    .get("model_policy")
                    .and_then(|policy| policy.get("default_model"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "daily_spend_cap_usd": deployment
                    .config_json
                    .get("model_policy")
                    .and_then(|policy| policy.get("daily_spend_cap_usd"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "monthly_spend_cap_usd": deployment
                    .config_json
                    .get("model_policy")
                    .and_then(|policy| policy.get("monthly_spend_cap_usd"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "enabled_tools": enabled_tools,
                "enabled_channels": enabled_channels,
                "synced_files": ["runtime_policy.json", "agent_profile.json"],
            }),
            created_at: updated_at,
        })
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(runtime_deployment_response_live(deployment).await))
}

#[cfg(test)]
mod tests {
    #[test]
    fn runtime_runner_config_malformed_config_error_is_sanitized() {
        let source = include_str!("runtime_routes.rs");
        let start = source
            .find("async fn runtime_runner_config_action_http(")
            .expect("runtime runner config action route exists");
        let end = source[start..]
            .find("\n#[cfg(test)]")
            .map(|offset| start + offset)
            .expect("test module follows runtime route handlers");
        let body = &source[start..end];

        assert!(body.contains(
            ".ok_or_else(|| internal_http_error(\"runtime deployment config_json was not an object\"))?;"
        ));
        assert!(!body.contains("\"runtime config is malformed\""));
        assert!(!body.contains("(StatusCode::INTERNAL_SERVER_ERROR,"));
    }
}
