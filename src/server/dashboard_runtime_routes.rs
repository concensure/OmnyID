/*
 * @module-id: rust.server.dashboard-runtime-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

const MAX_RUNTIME_BACKUP_ID_LEN: usize = 64;
const MAX_RUNTIME_DEVICE_ID_LEN: usize = 128;

fn normalize_runtime_route_id(
    value: &str,
    field: &str,
    max_len: usize,
) -> Result<String, (StatusCode, String)> {
    let value = value.trim();
    if value.is_empty() || value.len() > max_len {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{field} must be 1-{max_len} characters"),
        ));
    }
    if !value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{field} may only include letters, numbers, hyphen, or underscore"),
        ));
    }
    Ok(value.to_string())
}

fn normalize_runtime_backup_id(value: &str) -> Result<String, (StatusCode, String)> {
    normalize_runtime_route_id(value, "backup_id", MAX_RUNTIME_BACKUP_ID_LEN)
}

fn normalize_runtime_device_id(value: &str) -> Result<String, (StatusCode, String)> {
    normalize_runtime_route_id(value, "device_id", MAX_RUNTIME_DEVICE_ID_LEN)
}

fn normalize_optional_runtime_device_id(
    value: Option<&str>,
) -> Result<Option<String>, (StatusCode, String)> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(normalize_runtime_device_id)
        .transpose()
}

fn runtime_update_channel(value: Option<&str>) -> Result<&'static str, (StatusCode, String)> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None | Some("stable") => Ok("stable"),
        Some("manual_only") => Ok("manual_only"),
        Some(_) => Err((
            StatusCode::BAD_REQUEST,
            "update_channel must be stable or manual_only".to_string(),
        )),
    }
}

fn runtime_auto_apply(value: Option<&str>) -> Result<&'static str, (StatusCode, String)> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None | Some("manual_only") => Ok("manual_only"),
        Some("scaffold_refresh_only") => Ok("scaffold_refresh_only"),
        Some(_) => Err((
            StatusCode::BAD_REQUEST,
            "auto_apply must be manual_only or scaffold_refresh_only".to_string(),
        )),
    }
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/dashboard/runtime-backups",
            get(runtime_backups_http).post(runtime_backups_action_http),
        )
        .route(
            "/dashboard/runtime-backups/{backup_id}",
            get(runtime_backup_manifest_http),
        )
        .route(
            "/dashboard/runtime-restore-drills",
            get(runtime_restore_drills_http).post(runtime_restore_drill_create_http),
        )
        .route(
            "/dashboard/runtime-updates",
            get(runtime_updates_http).post(runtime_updates_action_http),
        )
        .route(
            "/dashboard/runtime-recovery-packet",
            get(runtime_recovery_packet_http),
        )
        .route(
            "/dashboard/device-bootstrap-bundle",
            post(device_bootstrap_bundle_http),
        )
        .route(
            "/dashboard/device-sync-policies",
            get(device_sync_policies_http).post(device_sync_policies_action_http),
        )
}

async fn runtime_backups_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeBackupsResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let response = load_runtime_backups_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_backups_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeBackupRequest>,
) -> Result<Json<RuntimeBackupsResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_backups", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let action = request.action.trim().to_lowercase();

    match action.as_str() {
        "set_retention" => {
            let retention_days = request.retention_days.unwrap_or(14);
            if !matches!(retention_days, 7 | 14 | 30 | 90) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "retention_days must be one of 7, 14, 30, or 90".to_string(),
                ));
            }
            state
                .db
                .upsert_runtime_backup_policy(&user.id, retention_days, "metadata_only_hosted")
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
        }
        "create_snapshot" => {
            let retention_days = match state
                .db
                .find_runtime_backup_policy(&user.id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
            {
                Some(policy) => policy.retention_days,
                None => {
                    state
                        .db
                        .upsert_runtime_backup_policy(&user.id, 14, "metadata_only_hosted")
                        .await
                        .map_err(internal_error)
                        .map_err(status_to_http)?
                        .retention_days
                }
            };
            create_runtime_backup_snapshot(&state.db, &user.id, retention_days)
                .await
                .map_err(internal_http_error)?;
        }
        "delete_snapshot" => {
            let backup_id = request
                .backup_id
                .as_deref()
                .ok_or_else(|| {
                    (
                        StatusCode::BAD_REQUEST,
                        "backup_id is required when deleting a snapshot".to_string(),
                    )
                })
                .and_then(normalize_runtime_backup_id)?;
            let deleted = state
                .db
                .delete_runtime_backup_by_id(&user.id, &backup_id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .ok_or_else(|| {
                    (
                        StatusCode::NOT_FOUND,
                        "runtime backup snapshot not found for this account".to_string(),
                    )
                })?;
            if let Some(artifact_path) = deleted.artifact_path.as_deref() {
                remove_runtime_backup_artifact_path(artifact_path)
                    .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
            }
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "runtime backup action must be set_retention, create_snapshot, or delete_snapshot"
                    .to_string(),
            ));
        }
    }

    let response = load_runtime_backups_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_backup_manifest_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(backup_id): Path<String>,
) -> Result<Json<RuntimeBackupManifestResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let backup_id = normalize_runtime_backup_id(&backup_id)?;
    let _ = prune_expired_runtime_backups(&state.db, &user.id).await;
    let record = state
        .db
        .find_runtime_backup_by_id(&user.id, &backup_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "runtime backup snapshot not found for this account".to_string(),
            )
        })?;
    Ok(Json(RuntimeBackupManifestResponse {
        id: record.id,
        storage_mode: record.storage_mode,
        created_at: record.created_at,
        expires_at: record.expires_at,
        manifest_json: record.manifest_json,
    }))
}

async fn runtime_restore_drills_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeRestoreDrillsResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let response = load_runtime_restore_drills_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_restore_drill_create_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeRestoreDrillRequest>,
) -> Result<Json<RuntimeRestoreDrillsResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_restore_drills", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let backup_id = normalize_runtime_backup_id(&request.backup_id)?;
    let _ = prune_expired_runtime_backups(&state.db, &user.id).await;
    let backup = state
        .db
        .find_runtime_backup_by_id(&user.id, &backup_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "runtime backup snapshot not found for this account".to_string(),
            )
        })?;
    let drill = build_runtime_restore_drill(&backup);
    state
        .db
        .create_runtime_restore_drill(&drill)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let response = load_runtime_restore_drills_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_updates_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeUpdatesResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let response = load_runtime_updates_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_updates_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RuntimeUpdateRequest>,
) -> Result<Json<RuntimeUpdatesResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("runtime_updates", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let action = request.action.trim().to_lowercase();

    match action.as_str() {
        "set_policy" => {
            let update_channel = runtime_update_channel(request.update_channel.as_deref())?;
            let auto_apply = runtime_auto_apply(request.auto_apply.as_deref())?;
            state
                .db
                .upsert_runtime_update_policy(&user.id, update_channel, auto_apply, None, None)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
        }
        "check_updates" => {
            check_runtime_updates(&state.db, &user.id)
                .await
                .map_err(internal_http_error)?;
        }
        "apply_update" => {
            apply_runtime_update(&state.db, &user.id)
                .await
                .map_err(internal_http_error)?;
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "runtime update action must be set_policy, check_updates, or apply_update"
                    .to_string(),
            ));
        }
    }

    let response = load_runtime_updates_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn runtime_recovery_packet_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeRecoveryPacketResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let runtime_backups = load_runtime_backups_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_restore_drills = load_runtime_restore_drills_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_updates = load_runtime_updates_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let runtime_deployment = match state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        Some(deployment) => Some(
            runtime_deployment_response_live(
                inspect_runtime_deployment_live(inspect_runtime_deployment(deployment)).await,
            )
            .await,
        ),
        None => None,
    };

    Ok(Json(build_runtime_recovery_packet_response(
        &user,
        runtime_deployment,
        runtime_backups,
        runtime_restore_drills,
        runtime_updates,
        super::load_runtime_operational_guidance(),
    )))
}

async fn device_bootstrap_bundle_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<DeviceBootstrapRequest>,
) -> Result<Json<DeviceBootstrapBundleResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("device_bootstrap_bundle", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let device_id = normalize_optional_runtime_device_id(request.device_id.as_deref())?;
    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let bundle = build_device_bootstrap_bundle_response(
        &user,
        &agents,
        request.device_class.trim(),
        device_id.as_deref(),
        request.policy_profile.as_deref(),
    )?;
    let sync_slices = sync_slices_for_bundle(&bundle.device_class, &bundle.policy_profile)?;
    state
        .db
        .upsert_sync_device(&bundle.bootstrap)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    state
        .db
        .upsert_sync_device_policy(
            &user.id,
            &bundle.bootstrap,
            &bundle.device_class,
            &bundle.policy_profile,
            &sync_slices,
            bundle.requires_local_key_material,
            serde_json::json!({
                "source": "device_bootstrap_bundle",
                "default_profile": request.policy_profile.as_deref().map(str::trim).filter(|value| !value.is_empty()).is_none(),
                "policy_note": device_policy_note(&bundle.device_class, &bundle.policy_profile),
            }),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(bundle))
}

async fn device_sync_policies_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<DeviceSyncPoliciesResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let response = load_device_sync_policies_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

async fn device_sync_policies_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<DeviceSyncPolicyRequest>,
) -> Result<Json<DeviceSyncPoliciesResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("device_sync_policies", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let action = request.action.trim().to_lowercase();
    match action.as_str() {
        "set_profile" => {
            let device_id = request
                .device_id
                .as_deref()
                .ok_or_else(|| (StatusCode::BAD_REQUEST, "device_id is required".to_string()))?;
            let device_id = normalize_runtime_device_id(device_id)?;
            let profile = request
                .policy_profile
                .as_deref()
                .map(str::trim)
                .filter(|value| matches!(*value, "full" | "balanced" | "lightweight"))
                .ok_or_else(|| {
                    (
                        StatusCode::BAD_REQUEST,
                        "policy_profile must be full, balanced, or lightweight".to_string(),
                    )
                })?;
            let existing = state
                .db
                .find_sync_device_policy_by_user(&user.id, &device_id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .ok_or_else(|| {
                    (
                        StatusCode::NOT_FOUND,
                        "sync device policy not found for this account".to_string(),
                    )
                })?;
            let sync_slices = sync_slices_for_bundle(&existing.device_class, profile)?;
            state
                .db
                .update_sync_device_policy(
                    &user.id,
                    &device_id,
                    profile,
                    &sync_slices,
                    requires_local_key_material(&sync_slices),
                    serde_json::json!({
                        "source": "dashboard_policy_update",
                        "policy_note": device_policy_note(&existing.device_class, profile),
                    }),
                )
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .ok_or_else(|| {
                    (
                        StatusCode::NOT_FOUND,
                        "sync device policy not found for this account".to_string(),
                    )
                })?;
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "device sync policy action must be set_profile".to_string(),
            ));
        }
    }
    let response = load_device_sync_policies_response(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(response))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_backup_ids_are_trimmed_and_bounded() {
        assert_eq!(
            normalize_runtime_backup_id(" 01JABCDEF0123456789ABCDEFG ").expect("valid backup id"),
            "01JABCDEF0123456789ABCDEFG"
        );
        assert!(normalize_runtime_backup_id("../escape").is_err());
        assert!(normalize_runtime_backup_id(&"x".repeat(MAX_RUNTIME_BACKUP_ID_LEN + 1)).is_err());
    }

    #[test]
    fn runtime_device_ids_reject_path_like_values() {
        assert_eq!(
            normalize_optional_runtime_device_id(Some(" mobile-main_01 "))
                .expect("valid device id"),
            Some("mobile-main_01".to_string())
        );
        assert!(normalize_optional_runtime_device_id(Some("mobile/../escape")).is_err());
        assert!(
            normalize_optional_runtime_device_id(Some(&"x".repeat(MAX_RUNTIME_DEVICE_ID_LEN + 1)))
                .is_err()
        );
    }

    #[test]
    fn runtime_update_policy_values_are_explicit() {
        assert_eq!(runtime_update_channel(None).expect("default"), "stable");
        assert_eq!(
            runtime_auto_apply(Some(" scaffold_refresh_only ")).expect("valid"),
            "scaffold_refresh_only"
        );
        assert!(runtime_update_channel(Some("nightly")).is_err());
        assert!(runtime_auto_apply(Some("always")).is_err());
    }
}
