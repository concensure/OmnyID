/*
 * @module-id: rust.server.account-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;

const MAX_SUPPORT_ACCESS_REASON_LEN: usize = 500;

fn account_user_facing_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

fn clean_support_access_reason(
    value: Option<&str>,
    required: bool,
) -> Result<Option<String>, (StatusCode, String)> {
    let reason = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            value
                .chars()
                .take(MAX_SUPPORT_ACCESS_REASON_LEN)
                .collect::<String>()
        });
    if required && reason.is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            "support access reason is required".to_string(),
        ));
    }
    Ok(reason)
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/dashboard/sessions",
            get(account_sessions_http).post(account_sessions_action_http),
        )
        .route(
            "/dashboard/support-access",
            get(support_access_http).post(update_support_access_http),
        )
        .route(
            "/dashboard/support-access/history",
            get(support_access_history_http),
        )
        .route("/dashboard/account/delete", post(account_delete_http))
}

async fn support_access_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<SupportAccessStateResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let state_response = state
        .db
        .latest_support_access_grant(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .map(support_access_state_response)
        .unwrap_or_else(default_support_access_state_response);
    Ok(Json(state_response))
}

async fn support_access_history_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<SupportAccessHistoryResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let entries = state
        .db
        .list_support_access_grants(&user.id, 12)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(support_access_history_entry)
        .collect::<Vec<_>>();
    Ok(Json(SupportAccessHistoryResponse { entries }))
}

async fn account_sessions_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AccountSessionsResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let current_token = bearer_token_from_headers(&headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
    let sessions = state
        .db
        .list_sessions_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(|session| account_session_entry(session, &current_token))
        .collect::<Vec<_>>();
    Ok(Json(AccountSessionsResponse { sessions }))
}

pub(super) async fn account_sessions_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SessionActionRequest>,
) -> Result<Json<AccountSessionsResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let current_token = bearer_token_from_headers(&headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
    let current_token_hash = sha256_token(&current_token);
    let action = request.action.trim().to_lowercase();

    match action.as_str() {
        "revoke" => {
            let session_ref = request.session_ref.as_deref().ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "session_ref is required when revoking a session".to_string(),
                )
            })?;
            if session_ref == account_session_ref(&current_token_hash) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "use sign out to end the current session".to_string(),
                ));
            }
            let target_token = state
                .db
                .list_sessions_by_user(&user.id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .into_iter()
                .find(|session| account_session_ref(&session.token) == session_ref)
                .map(|session| session.token)
                .ok_or_else(|| {
                    (
                        StatusCode::NOT_FOUND,
                        "session not found for this account".to_string(),
                    )
                })?;
            state
                .db
                .revoke_session_by_hash(&user.id, &target_token)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
        }
        "revoke_others" => {
            state
                .db
                .revoke_other_sessions(&user.id, &current_token)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "session action must be revoke or revoke_others".to_string(),
            ));
        }
    }

    let sessions = state
        .db
        .list_sessions_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(|session| account_session_entry(session, &current_token))
        .collect::<Vec<_>>();
    Ok(Json(AccountSessionsResponse { sessions }))
}

async fn update_support_access_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SupportAccessRequest>,
) -> Result<Json<SupportAccessStateResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("support_access", &headers),
        RateLimitPolicy {
            max_requests: 10,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let action = request.action.trim().to_lowercase();

    match action.as_str() {
        "grant" => {
            let duration_hours = request.duration_hours.unwrap_or(1);
            if !matches!(duration_hours, 1 | 4 | 24) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "support access duration must be 1, 4, or 24 hours".to_string(),
                ));
            }
            let reason = clean_support_access_reason(request.reason.as_deref(), true)?
                .expect("required support reason");
            let access_scope = request
                .access_scope
                .as_deref()
                .map(str::trim)
                .filter(|value| matches!(*value, "runtime_metadata_only" | "runtime_debug"))
                .unwrap_or("runtime_metadata_only");
            let expires_at =
                (chrono::Utc::now() + chrono::Duration::hours(duration_hours)).to_rfc3339();
            let notes = serde_json::json!({
                "source": "dashboard",
                "granted_by": "user_self",
                "privacy_boundary": "support_access_disabled_by_default",
            });
            let record = state
                .db
                .create_support_access_grant(
                    &user.id,
                    access_scope,
                    Some(&reason),
                    &expires_at,
                    notes,
                )
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(support_access_state_response(record)))
        }
        "revoke" => {
            let record = state
                .db
                .revoke_active_support_access(
                    &user.id,
                    clean_support_access_reason(request.reason.as_deref(), false)?.as_deref(),
                )
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(
                record
                    .map(support_access_state_response)
                    .unwrap_or_else(default_support_access_state_response),
            ))
        }
        _ => Err((
            StatusCode::BAD_REQUEST,
            "support access action must be grant or revoke".to_string(),
        )),
    }
}

async fn account_delete_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<AccountDeleteRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("account_delete", &headers),
        RateLimitPolicy {
            max_requests: 4,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();
    if !account_delete_confirmation_is_valid(&user.email, &request) {
        return Err((
            StatusCode::BAD_REQUEST,
            "account deletion requires your exact email plus the phrase DELETE MY OMNYID ACCOUNT"
                .to_string(),
        ));
    }

    let agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let agent_ids = agents
        .iter()
        .map(|agent| agent.agent_id.clone())
        .collect::<Vec<_>>();

    if let Some(deployment) = state
        .db
        .find_runtime_deployment_by_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        let inspected = inspect_runtime_deployment(deployment);
        let _ = runtime_compose_down(&inspected).await;
        remove_runtime_workspace(&inspected.workspace_path)
            .map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    }
    let _ = remove_runtime_backup_artifacts(&user.id);

    state
        .db
        .delete_user_account_and_data(&user.id, &user.email, &agent_ids)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "status": "deleted",
        "message": account_user_facing_text(
            "Your OmnyID account and hosted data were deleted from the managed environment.",
            active_persona.as_ref(),
        )
    })))
}

#[cfg(test)]
mod tests {
    use super::{MAX_SUPPORT_ACCESS_REASON_LEN, clean_support_access_reason};

    #[test]
    fn support_access_reason_is_required_for_grants() {
        assert!(clean_support_access_reason(None, true).is_err());
        assert!(clean_support_access_reason(Some("   "), true).is_err());
    }

    #[test]
    fn support_access_reason_is_trimmed_and_bounded() {
        assert_eq!(
            clean_support_access_reason(Some(" debug runtime "), true).expect("reason"),
            Some("debug runtime".to_string())
        );
        let reason = clean_support_access_reason(
            Some(&"x".repeat(MAX_SUPPORT_ACCESS_REASON_LEN + 50)),
            true,
        )
        .expect("bounded")
        .expect("reason");
        assert_eq!(reason.len(), MAX_SUPPORT_ACCESS_REASON_LEN);
        assert_eq!(
            clean_support_access_reason(Some(" "), false).expect("optional"),
            None
        );
    }
}
