/*
 * @module-id: rust.server.user-management-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::*;
use crate::{
    db::{OperatorUserSummaryRecord, WeddingVendorPhotoUpsertRecord, WeddingVendorUpsertRecord},
    persona_state_capture::{PersonaProfileSnapshot, capture_persona_state},
    response_queue_policy::AgentExecutionProfile,
};

#[cfg(test)]
mod tests;
mod wedding_admin;

use wedding_admin::*;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/admin/users", get(admin_users_list_http))
        .route(
            "/admin/wedding/ops-metrics",
            get(admin_wedding_ops_metrics_http),
        )
        .route(
            "/admin/wedding/ai-routing-policy",
            get(admin_wedding_ai_routing_policy_http),
        )
        .route(
            "/admin/wedding/api-stack",
            get(admin_wedding_api_stack_http),
        )
        .route(
            "/admin/third-party-tool-policy",
            get(admin_third_party_tool_policy_http).post(admin_third_party_tool_policy_update_http),
        )
        .route(
            "/admin/wedding/waitlist",
            get(admin_wedding_waitlist_list_http),
        )
        .route(
            "/admin/wedding/vendors",
            get(admin_wedding_vendors_list_http).post(admin_wedding_vendor_create_http),
        )
        .route(
            "/admin/wedding/vendors/{vendor_id}",
            put(admin_wedding_vendor_update_http).delete(admin_wedding_vendor_delete_http),
        )
        .route(
            "/wedding/vendors/{vendor_id}/contact",
            post(wedding_vendor_contact_record_http),
        )
        .route("/wedding/vendors", get(wedding_vendors_list_http))
        .route(
            "/wedding/onboarding-state",
            get(wedding_onboarding_state_get_http).post(wedding_onboarding_state_upsert_http),
        )
        .route(
            "/admin/runtime-remediation",
            get(admin_runtime_remediation_history_http).post(admin_runtime_remediation_action_http),
        )
        .route("/admin/users/{user_id}", get(admin_user_detail_http))
        .route(
            "/admin/users/{user_id}/actions",
            post(admin_user_action_http),
        )
        .route(
            "/user/agent-preferences",
            get(agent_preferences_get_http).post(agent_preferences_set_http),
        )
        .route("/daemons", get(daemons_list_http))
        .route("/daemons/{daemon_id}/heartbeat", get(daemon_heartbeat_http))
        .route("/daemons/{daemon_id}/revoke", post(daemon_revoke_http))
}

#[derive(serde::Deserialize)]
struct AdminUsersListQuery {
    limit: Option<i64>,
    query: Option<String>,
}

#[derive(serde::Deserialize)]
struct AdminUserActionRequest {
    action: String,
    reason: Option<String>,
}

#[derive(serde::Deserialize)]
struct AdminRuntimeRemediationActionRequest {
    action: String,
    receipt_id: Option<String>,
    acknowledge_manual_execution: Option<bool>,
    note: Option<String>,
    outcome_note: Option<String>,
    proof_reference: Option<String>,
}

#[derive(serde::Deserialize)]
struct AdminWeddingVendorListQuery {
    limit: Option<i64>,
    query: Option<String>,
}

#[derive(serde::Deserialize)]
struct WeddingVendorPhotoRequest {
    slot: i32,
    photo_url: String,
    alt_text: Option<String>,
    source_label: Option<String>,
    source_url: Option<String>,
    retrieved_at: Option<String>,
    licence_metadata: Option<Value>,
}

#[derive(serde::Deserialize)]
struct WeddingVendorWriteRequest {
    vendor_slug: String,
    vendor_name: String,
    category: String,
    service_area: String,
    address: Option<String>,
    website_url: Option<String>,
    contact_phone: Option<String>,
    contact_email: Option<String>,
    source_url: Option<String>,
    source_label: Option<String>,
    source_checked_at: Option<String>,
    status: Option<String>,
    notes: Option<String>,
    evidence: Option<Value>,
    caveat_labels: Option<Vec<String>>,
    photos: Option<Vec<WeddingVendorPhotoRequest>>,
    attributes: Option<Vec<WeddingVendorAttributeRequest>>,
}

#[derive(serde::Deserialize)]
struct WeddingVendorAttributeRequest {
    key: String,
    value: Option<Value>,
    status: String,
    confidence: Option<f32>,
    source_url: Option<String>,
    notes: Option<String>,
}

#[derive(serde::Deserialize)]
struct WeddingVendorContactRequest {
    contact_method: String,
    follow_up_due_at: Option<String>,
    response_received_at: Option<String>,
    thread_id: Option<String>,
    receipt_ref: Option<String>,
    notes: Option<String>,
}

#[derive(serde::Deserialize)]
struct WeddingOnboardingStateQuery {
    wedding_plan_id: String,
}

#[derive(serde::Deserialize)]
struct WeddingOnboardingStateUpsertRequest {
    wedding_plan_id: String,
    intake_variant: String,
    entry_source: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdminThirdPartyToolPolicyWriteRequest {
    policies: Vec<AdminThirdPartyToolPolicyWriteRecord>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdminThirdPartyToolPolicyWriteRecord {
    tool_id: String,
    enabled_for_all_users: Option<bool>,
    enabled_for_wedding_template: Option<bool>,
    monthly_free_quota_label: Option<String>,
    quota_used_label: Option<String>,
}

fn clean_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn clean_required_string(value: String, label: &str) -> Result<String, (StatusCode, String)> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        return Err((StatusCode::BAD_REQUEST, format!("{label} is required")));
    }
    Ok(trimmed)
}

fn validate_vendor_slug(value: String) -> Result<String, (StatusCode, String)> {
    let slug = clean_required_string(value, "vendor_slug")?;
    if !slug
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "vendor_slug must use lowercase letters, numbers, and hyphens only".to_string(),
        ));
    }
    Ok(slug)
}

fn validate_vendor_status(value: Option<String>) -> Result<String, (StatusCode, String)> {
    let status = clean_optional_string(value).unwrap_or_else(|| "active".to_string());
    if matches!(status.as_str(), "active" | "hidden" | "archived") {
        Ok(status)
    } else {
        Err((StatusCode::BAD_REQUEST, "invalid vendor status".to_string()))
    }
}

fn admin_users_list_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(50).clamp(1, 200)
}

async fn admin_users_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<AdminUsersListQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let users = state
        .db
        .list_operator_user_summaries(
            admin_users_list_limit(params.limit),
            params.query.as_deref(),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let total_users = count_admin_user_summaries(&state, params.query.as_deref()).await?;
    Ok(Json(serde_json::json!({
        "users": users.into_iter().map(admin_user_summary_json).collect::<Vec<_>>(),
        "limit": admin_users_list_limit(params.limit),
        "query": params.query.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()),
        "total_users": total_users,
    })))
}

fn admin_user_summary_json(record: OperatorUserSummaryRecord) -> Value {
    serde_json::json!({
        "user_id": record.user_id,
        "email": record.email,
        "display_name": record.display_name,
        "auth_provider": record.auth_provider,
        "created_at": record.created_at,
        "email_verified": record.email_verified,
        "plan": record.plan,
        "billing_status": record.billing_status,
        "last_session_at": record.last_session_at,
        "account_status": record.account_status,
        "account_status_reason": record.account_status_reason,
        "support_access_status": record.support_access_status,
        "support_access_expires_at": record.support_access_expires_at,
    })
}

async fn count_admin_user_summaries(
    state: &Arc<AppState>,
    query: Option<&str>,
) -> Result<i64, (StatusCode, String)> {
    let normalized_query = query
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let row = sqlx::query(
        r#"
        SELECT COUNT(*)::bigint AS total_users
        FROM users u
        WHERE (
            $1::text IS NULL
            OR lower(u.email) LIKE '%' || lower($1) || '%'
            OR lower(u.display_name) LIKE '%' || lower($1) || '%'
            OR u.id = $1
        )
        "#,
    )
    .bind(normalized_query)
    .fetch_one(&state.db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?;

    Ok(row.get("total_users"))
}

async fn admin_user_detail_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
) -> Result<Json<AdminUserDetailResponse>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }

    let target_user = state
        .db
        .find_user_by_id(&user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "user not found".to_string()))?;

    let support_access = state
        .db
        .latest_support_access_grant(&target_user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .map(support_access_state_response)
        .unwrap_or_else(default_support_access_state_response);
    let support_access_history = state
        .db
        .list_support_access_grants(&target_user.id, 12)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(support_access_history_entry)
        .collect::<Vec<_>>();
    let sessions = state
        .db
        .list_sessions_by_user(&target_user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(|session| AccountSessionEntry {
            session_ref: account_session_ref(&session.token),
            token_preview: runtime_token_preview(&session.token),
            created_at: session.created_at,
            expires_at: session.expires_at,
            current: false,
        })
        .collect::<Vec<_>>();
    let account_status = state
        .db
        .user_account_status(&target_user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let account_status = account_status
        .map(|record| (record.account_status, record.account_status_reason))
        .unwrap_or_else(|| ("active".to_string(), None));

    Ok(Json(AdminUserDetailResponse {
        user_id: target_user.id,
        email: target_user.email,
        display_name: target_user.display_name,
        auth_provider: target_user.auth_provider,
        created_at: target_user.created_at,
        account_status: account_status.0,
        account_status_reason: account_status.1,
        support_access,
        support_access_history,
        sessions,
    }))
}

fn normalize_admin_user_action(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "revoke_all_sessions" => Some("revoke_all_sessions"),
        "revoke_support_access" => Some("revoke_support_access"),
        "suspend_account" => Some("suspend_account"),
        "reactivate_account" => Some("reactivate_account"),
        _ => None,
    }
}

fn normalize_runtime_remediation_action(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "issue_cleanup_receipt" => Some("issue_cleanup_receipt"),
        "complete_cleanup_receipt" => Some("complete_cleanup_receipt"),
        _ => None,
    }
}

fn operator_runtime_remediation_receipt_json(
    receipt_id: String,
    issued_at: String,
    guidance: crate::server::types::RuntimeOperationalGuidanceResponse,
    action: &str,
    note: Option<&str>,
) -> OperatorRuntimeRemediationReceiptResponse {
    OperatorRuntimeRemediationReceiptResponse {
        ok: true,
        action: action.to_string(),
        receipt_id,
        lifecycle_status: "issued".to_string(),
        issued_at,
        execution_mode: "manual_operator_shell".to_string(),
        approval_required: true,
        summary: guidance.summary,
        command: guidance.command,
        source: guidance.source,
        guidance_status: guidance.status,
        pressure_status: guidance.pressure_status,
        pressure_total_rows: guidance.pressure_total_rows,
        cleanup_mode: guidance.cleanup_mode,
        artifact_generated_at: guidance.generated_at,
        note: note.map(str::to_string),
        completed_at: None,
        outcome_note: None,
        proof_reference: None,
    }
}

fn operator_runtime_remediation_receipt_response(
    record: crate::db::OperatorRuntimeRemediationReceiptRecord,
) -> OperatorRuntimeRemediationReceiptResponse {
    OperatorRuntimeRemediationReceiptResponse {
        ok: true,
        action: record.action,
        receipt_id: record.id,
        lifecycle_status: record.lifecycle_status,
        issued_at: record.issued_at,
        execution_mode: record.execution_mode,
        approval_required: record.approval_required,
        summary: record.summary,
        command: record.command,
        source: record.source,
        guidance_status: record.guidance_status,
        pressure_status: record.pressure_status,
        pressure_total_rows: record.pressure_total_rows,
        cleanup_mode: record.cleanup_mode,
        artifact_generated_at: record.artifact_generated_at,
        note: record.note,
        completed_at: record.completed_at,
        outcome_note: record.outcome_note,
        proof_reference: record.proof_reference,
    }
}

async fn admin_runtime_remediation_history_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<OperatorRuntimeRemediationHistoryResponse>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }

    let entries = state
        .db
        .list_operator_runtime_remediation_receipts(&operator_user.id, 12)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .into_iter()
        .map(operator_runtime_remediation_receipt_response)
        .collect::<Vec<_>>();

    Ok(Json(OperatorRuntimeRemediationHistoryResponse {
        entries,
        retention: serde_json::json!({
            "max_event_age_days": crate::db::operator_runtime_remediation_receipt_retention_days(),
            "max_event_rows_per_user": crate::db::operator_runtime_remediation_receipt_max_rows_per_operator(),
            "rollover_behavior": "oldest_receipts_pruned_first_after_manual_issue",
        }),
    }))
}

async fn admin_runtime_remediation_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<AdminRuntimeRemediationActionRequest>,
) -> Result<Json<OperatorRuntimeRemediationReceiptResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("admin_runtime_remediation_action", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let (operator_user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    require_recent_high_risk_session(&session)?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }

    let action = normalize_runtime_remediation_action(&request.action).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "runtime remediation action must be issue_cleanup_receipt or complete_cleanup_receipt"
                .to_string(),
        )
    })?;
    if request.acknowledge_manual_execution != Some(true) {
        return Err((
            StatusCode::BAD_REQUEST,
            "acknowledge_manual_execution must be true before issuing or completing a manual cleanup receipt"
                .to_string(),
        ));
    }

    match action {
        "issue_cleanup_receipt" => {
            let guidance = load_runtime_operational_guidance().ok_or_else(|| {
                (
                    StatusCode::CONFLICT,
                    "no active operational cleanup guidance is currently mounted".to_string(),
                )
            })?;

            let note = request
                .note
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let receipt_id = ulid::Ulid::new().to_string();
            let issued_at = chrono::Utc::now().to_rfc3339();
            let record = crate::db::OperatorRuntimeRemediationReceiptRecord {
                id: receipt_id.clone(),
                operator_user_id: operator_user.id.clone(),
                action: action.to_string(),
                lifecycle_status: "issued".to_string(),
                execution_mode: "manual_operator_shell".to_string(),
                approval_required: true,
                summary: guidance.summary.clone(),
                command: guidance.command.clone(),
                source: guidance.source.clone(),
                guidance_status: guidance.status.clone(),
                pressure_status: guidance.pressure_status.clone(),
                pressure_total_rows: guidance.pressure_total_rows,
                cleanup_mode: guidance.cleanup_mode.clone(),
                artifact_generated_at: guidance.generated_at.clone(),
                note: note.map(str::to_string),
                issued_at: issued_at.clone(),
                completed_at: None,
                outcome_note: None,
                proof_reference: None,
            };
            let persisted = state
                .db
                .create_operator_runtime_remediation_receipt(&record)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(operator_runtime_remediation_receipt_json(
                persisted.id,
                persisted.issued_at,
                guidance,
                action,
                persisted.note.as_deref(),
            )))
        }
        "complete_cleanup_receipt" => {
            let receipt_id = request
                .receipt_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    (
                        StatusCode::BAD_REQUEST,
                        "receipt_id is required when completing a cleanup receipt".to_string(),
                    )
                })?;
            let outcome_note = request
                .outcome_note
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    (
                        StatusCode::BAD_REQUEST,
                        "outcome_note is required when completing a cleanup receipt".to_string(),
                    )
                })?;
            let proof_reference = request
                .proof_reference
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let persisted = state
                .db
                .complete_operator_runtime_remediation_receipt(
                    &operator_user.id,
                    receipt_id,
                    outcome_note,
                    proof_reference,
                )
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .ok_or_else(|| {
                    (
                        StatusCode::NOT_FOUND,
                        "cleanup receipt not found for this operator".to_string(),
                    )
                })?;
            Ok(Json(operator_runtime_remediation_receipt_response(
                persisted,
            )))
        }
        _ => Err((
            StatusCode::BAD_REQUEST,
            "runtime remediation action must be issue_cleanup_receipt or complete_cleanup_receipt"
                .to_string(),
        )),
    }
}

async fn admin_user_action_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    Json(request): Json<AdminUserActionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("admin_user_action", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;

    let (operator_user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    require_recent_high_risk_session(&session)?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }

    let target_user = state
        .db
        .find_user_by_id(&user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "user not found".to_string()))?;

    let action = normalize_admin_user_action(&request.action).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "admin action must be revoke_all_sessions, revoke_support_access, suspend_account, or reactivate_account".to_string(),
        )
    })?;
    let reason = request
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let current_account_status = state
        .db
        .user_account_status(&target_user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .map(|record| (record.account_status, record.account_status_reason))
        .unwrap_or_else(|| ("active".to_string(), None));

    match action {
        "revoke_all_sessions" => {
            let sessions_revoked = state
                .db
                .revoke_all_sessions(&target_user.id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(serde_json::json!({
                "ok": true,
                "action": action,
                "user_id": target_user.id,
                "email": target_user.email,
                "sessions_revoked": sessions_revoked,
                "support_access_revoked": false,
                "account_status": current_account_status.0,
                "account_status_reason": current_account_status.1,
            })))
        }
        "revoke_support_access" => {
            let revoked = state
                .db
                .revoke_active_support_access(
                    &target_user.id,
                    reason.or(Some("revoked_by_operator")),
                )
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(serde_json::json!({
                "ok": true,
                "action": action,
                "user_id": target_user.id,
                "email": target_user.email,
                "sessions_revoked": 0,
                "support_access_revoked": revoked.is_some(),
                "account_status": current_account_status.0,
                "account_status_reason": current_account_status.1,
            })))
        }
        "suspend_account" => {
            if target_user.id == operator_user.id {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "operators cannot suspend the current account from the active session".to_string(),
                ));
            }
            let status = state
                .db
                .update_user_account_status(
                    &target_user.id,
                    "suspended",
                    reason.or(Some("suspended_by_operator")),
                )
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .ok_or_else(|| (StatusCode::NOT_FOUND, "user not found".to_string()))?;
            let sessions_revoked = state
                .db
                .revoke_all_sessions(&target_user.id)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?;
            Ok(Json(serde_json::json!({
                "ok": true,
                "action": action,
                "user_id": target_user.id,
                "email": target_user.email,
                "sessions_revoked": sessions_revoked,
                "support_access_revoked": false,
                "account_status": status.account_status,
                "account_status_reason": status.account_status_reason,
            })))
        }
        "reactivate_account" => {
            let status = state
                .db
                .update_user_account_status(&target_user.id, "active", reason)
                .await
                .map_err(internal_error)
                .map_err(status_to_http)?
                .ok_or_else(|| (StatusCode::NOT_FOUND, "user not found".to_string()))?;
            Ok(Json(serde_json::json!({
                "ok": true,
                "action": action,
                "user_id": target_user.id,
                "email": target_user.email,
                "sessions_revoked": 0,
                "support_access_revoked": false,
                "account_status": status.account_status,
                "account_status_reason": status.account_status_reason,
            })))
        }
        _ => Err((
            StatusCode::BAD_REQUEST,
            "admin action must be revoke_all_sessions, revoke_support_access, suspend_account, or reactivate_account".to_string(),
        )),
    }
}

async fn agent_preferences_get_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AgentPreferences>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let mut prefs = state
        .db
        .get_agent_preferences(&user.id)
        .await
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_value::<AgentPreferences>(v).ok())
        .unwrap_or_default();
    if prefs.default_execution_profile.is_none() {
        prefs.default_execution_profile =
            Some(AgentExecutionProfile::from_mode(&prefs.optimization_mode));
    }
    if prefs
        .email_notification_filters
        .response_queue_policy
        .is_none()
    {
        prefs.email_notification_filters.response_queue_policy =
            Some(prefs.response_queue_policy.clone());
    }
    prefs.response_queue_policy = prefs
        .email_notification_filters
        .response_queue_policy
        .clone()
        .unwrap_or_default();

    Ok(Json(prefs))
}

async fn agent_preferences_set_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(mut body): Json<AgentPreferences>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    if let Some(profile) = body.default_execution_profile.as_ref() {
        let sanitized = profile.sanitized();
        body.optimization_mode = sanitized.mode.clone();
        body.default_execution_profile = Some(sanitized);
    }
    body.email_notification_filters.response_queue_policy =
        Some(body.response_queue_policy.clone());

    let valid_modes = ["speed", "cost", "balanced"];
    if !valid_modes.contains(&body.optimization_mode.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "optimization_mode must be one of: {}",
                valid_modes.join(", ")
            ),
        ));
    }

    state
        .db
        .upsert_agent_preferences(
            &user.id,
            &body.optimization_mode,
            body.auto_confirm_threshold_cents,
            body.show_cost_estimates,
            body.default_store_in_history,
            &serde_json::to_value(&body.calendar_notification_filters)
                .unwrap_or_else(|_| serde_json::json!({})),
            &serde_json::to_value(&body.email_notification_filters)
                .unwrap_or_else(|_| serde_json::json!({})),
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let default_execution_profile = body
        .default_execution_profile
        .clone()
        .unwrap_or_else(|| AgentExecutionProfile::from_mode(&body.optimization_mode));
    let persona_state = capture_persona_state(
        &user.id,
        &format!("user:{}", user.id),
        &body.optimization_mode,
        body.auto_confirm_threshold_cents,
        body.show_cost_estimates,
        body.default_store_in_history,
        Some(PersonaProfileSnapshot {
            mode: default_execution_profile.mode.clone(),
            max_react_loops: default_execution_profile.max_react_loops,
            reflection_level: default_execution_profile.reflection_level.clone(),
            context_window_policy: default_execution_profile.context_window_policy.clone(),
        }),
    );
    if let Some(persona_state) = persona_state {
        let _ = state
            .db
            .store_message(&persona_state.proto, persona_state.content_json)
            .await;
    }

    Ok(Json(serde_json::json!({
        "updated": true,
        "default_execution_profile": body
            .default_execution_profile
            .unwrap_or_else(|| AgentExecutionProfile::from_mode(&body.optimization_mode)),
    })))
}

async fn daemons_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let daemons = daemon_registry::get_active_daemons(&state.db, &user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let warnings = daemon_registry::daemon_health_check(&state.db, Some(&user.id))
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let stale_map = warnings
        .into_iter()
        .filter(|warning| warning.user_id == user.id)
        .map(|warning| (warning.daemon_id, warning.stale_minutes))
        .collect::<HashMap<_, _>>();
    let items = daemons
        .into_iter()
        .map(|daemon| {
            serde_json::json!({
                "daemon_id": daemon.daemon_id,
                "daemon_kind": format!("{:?}", daemon.daemon_kind).to_lowercase(),
                "display_name": daemon.daemon_kind.display_name(),
                "status": format!("{:?}", daemon.status).to_lowercase(),
                "workflow_id": daemon.workflow_id,
                "delegated_key_id": daemon.delegated_key_id,
                "last_heartbeat_at": daemon.last_heartbeat_at,
                "created_at": daemon.created_at,
                "revoked_at": daemon.revoked_at,
                "policy_config": daemon.policy_config,
                "stale_minutes": stale_map.get(&daemon.daemon_id).copied(),
            })
        })
        .collect::<Vec<_>>();
    Ok(Json(serde_json::json!({ "daemons": items })))
}

async fn daemon_heartbeat_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(daemon_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let registration = daemon_registry::get_daemon_registration(&state.db, &daemon_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "daemon not found".to_string()))?;
    if registration.user_id != user.id {
        return Err((
            StatusCode::FORBIDDEN,
            "daemon not owned by this user".to_string(),
        ));
    }
    let heartbeat = daemon_registry::get_latest_heartbeat(&state.db, &daemon_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "daemon": registration,
        "heartbeat": heartbeat,
    })))
}

async fn daemon_revoke_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(daemon_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let registration = daemon_registry::get_daemon_registration(&state.db, &daemon_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "daemon not found".to_string()))?;
    if registration.user_id != user.id {
        return Err((
            StatusCode::FORBIDDEN,
            "daemon not owned by this user".to_string(),
        ));
    }
    daemon_registry::revoke_daemon(&state.db, &daemon_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({
        "updated": true,
        "daemon_id": daemon_id,
        "status": "revoked",
    })))
}
