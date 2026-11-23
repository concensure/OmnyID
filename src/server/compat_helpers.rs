/*
 * @module-id: rust.server.compat-helpers
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

#![allow(dead_code)]

use crate::db::sha256_token;
use std::{collections::BTreeMap, net::SocketAddr};

use serde_json::Value;
use sqlx::Error as SqlxError;
use tonic::Status;
use wtransport::Identity as WebTransportIdentity;

use crate::{
    crypto::sign_message,
    db::{AuthSessionRecord, RuntimeDeploymentRecord, SupportAccessGrantRecord, UserRecord},
    message::AFPMessage,
    secret_manager::read_process_secret_trimmed,
};

use super::{
    AccountDeleteRequest, AccountSessionEntry, OnboardingUpdateRequest, SupportAccessHistoryEntry,
    SupportAccessStateResponse, UserOnboardingRecord,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum OrchestrationGate {
    None,
    Clarification,
    Approval,
}

pub(super) fn classify_orchestration_gate(objective: &str) -> OrchestrationGate {
    if objective_requires_human_confirmation(objective) {
        OrchestrationGate::Approval
    } else if objective_needs_clarification(objective) {
        OrchestrationGate::Clarification
    } else {
        OrchestrationGate::None
    }
}

pub(super) fn support_access_state_response(
    record: SupportAccessGrantRecord,
) -> SupportAccessStateResponse {
    SupportAccessStateResponse {
        status: record.status,
        access_scope: record.access_scope,
        reason: record.reason,
        support_disabled_by_default: true,
        granted_at: Some(record.granted_at),
        expires_at: Some(record.expires_at),
        revoked_at: record.revoked_at,
    }
}

pub(super) fn support_access_history_entry(
    record: SupportAccessGrantRecord,
) -> SupportAccessHistoryEntry {
    SupportAccessHistoryEntry {
        id: record.id,
        status: record.status,
        access_scope: record.access_scope,
        reason: record.reason,
        granted_at: record.granted_at,
        expires_at: record.expires_at,
        revoked_at: record.revoked_at,
    }
}

pub(super) fn default_support_access_state_response() -> SupportAccessStateResponse {
    SupportAccessStateResponse {
        status: "disabled".to_string(),
        access_scope: "runtime_metadata_only".to_string(),
        reason: None,
        support_disabled_by_default: true,
        granted_at: None,
        expires_at: None,
        revoked_at: None,
    }
}

pub(super) fn runtime_token_preview(token: &str) -> String {
    if token.len() <= 8 {
        return "redacted".to_string();
    }
    format!("{}...{}", &token[..4], &token[token.len() - 4..])
}

pub(super) fn account_session_ref(token_hash: &str) -> String {
    token_hash.to_string()
}

pub(super) fn write_runtime_file(path: &std::path::Path, content: &str) -> Result<(), String> {
    std::fs::write(path, content)
        .map_err(|err| format!("failed to write {}: {err}", path.display()))
}

pub(super) fn render_runtime_template(template: &str, values: &BTreeMap<&str, String>) -> String {
    let mut rendered = template.to_string();
    for (key, value) in values {
        let placeholder = format!("{{{{{key}}}}}");
        rendered = rendered.replace(&placeholder, value);
    }
    rendered
}

pub(super) fn internal_error(err: sqlx::Error) -> Status {
    tracing::error!(error = %err, "internal database error");
    Status::internal("internal server error")
}

pub(super) fn readiness_error_to_http(err: SqlxError) -> (axum::http::StatusCode, String) {
    tracing::warn!(error = %err, "dependency readiness check failed");
    (
        axum::http::StatusCode::SERVICE_UNAVAILABLE,
        "service dependency unavailable".to_string(),
    )
}

pub(super) fn status_to_http(status: Status) -> (axum::http::StatusCode, String) {
    let code = match status.code() {
        tonic::Code::InvalidArgument => axum::http::StatusCode::BAD_REQUEST,
        tonic::Code::NotFound => axum::http::StatusCode::NOT_FOUND,
        tonic::Code::Unauthenticated => axum::http::StatusCode::UNAUTHORIZED,
        _ => axum::http::StatusCode::INTERNAL_SERVER_ERROR,
    };
    (code, status.message().to_string())
}

pub(super) fn internal_json_http_error(
    err: impl std::fmt::Display,
) -> (axum::http::StatusCode, serde_json::Value) {
    tracing::error!(error = %err, "internal request handling error");
    (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        serde_json::json!({ "error": "internal server error" }),
    )
}

pub(super) fn internal_http_error(err: impl std::fmt::Display) -> (axum::http::StatusCode, String) {
    tracing::error!(error = %err, "internal request handling error");
    (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        "internal server error".to_string(),
    )
}

pub(super) fn task_update_error_to_http(err: sqlx::Error) -> (axum::http::StatusCode, String) {
    if matches!(&err, sqlx::Error::RowNotFound) {
        (
            axum::http::StatusCode::NOT_FOUND,
            "task not found".to_string(),
        )
    } else {
        status_to_http(internal_error(err))
    }
}

pub(super) fn sign_server_generated_message(message: &mut AFPMessage) -> Result<(), String> {
    let Some(seed) = env_hex_32("OMNYID_SIGNING_KEY_HEX")? else {
        if allow_insecure_unsigned_messages() {
            return Ok(());
        }
        return Err(
            "OMNYID_SIGNING_KEY_HEX must be configured for server-generated approval messages"
                .to_string(),
        );
    };
    sign_message(message, &seed);
    Ok(())
}

pub(super) fn env_hex_32(name: &str) -> Result<Option<[u8; 32]>, String> {
    let Some(trimmed) = read_process_secret_trimmed(name) else {
        return Ok(None);
    };
    let bytes = hex::decode(&trimmed).map_err(|_| format!("{name} must be valid hex"))?;
    let array: [u8; 32] = bytes
        .try_into()
        .map_err(|_| format!("{name} must decode to 32 bytes"))?;
    Ok(Some(array))
}

pub(super) fn enable_internal_grpc() -> bool {
    std::env::var("OMNYID_ENABLE_INTERNAL_GRPC")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

pub(super) fn webtransport_enabled() -> bool {
    if !std::env::var("OMNYID_ENABLE_WEBTRANSPORT")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
    {
        return false;
    }

    webtransport_cert_path().is_some() && webtransport_key_path().is_some()
}

pub(super) fn webtransport_bind_addr() -> SocketAddr {
    std::env::var("OMNYID_WEBTRANSPORT_BIND_ADDR")
        .ok()
        .and_then(|value| value.parse::<SocketAddr>().ok())
        .unwrap_or_else(|| {
            "0.0.0.0:8443"
                .parse()
                .expect("valid WebTransport bind addr")
        })
}

pub(super) async fn load_webtransport_identity() -> Result<WebTransportIdentity, String> {
    let cert_path = webtransport_cert_path()
        .ok_or_else(|| "OMNYID_WEBTRANSPORT_CERT_PATH must be set".to_string())?;
    let key_path = webtransport_key_path()
        .ok_or_else(|| "OMNYID_WEBTRANSPORT_KEY_PATH must be set".to_string())?;

    WebTransportIdentity::load_pemfiles(cert_path, key_path)
        .await
        .map_err(|err| err.to_string())
}

pub(super) fn account_session_entry(
    session: AuthSessionRecord,
    current_token: &str,
) -> AccountSessionEntry {
    AccountSessionEntry {
        session_ref: account_session_ref(&session.token),
        token_preview: runtime_token_preview(&session.token),
        created_at: session.created_at,
        expires_at: session.expires_at,
        current: session.token == sha256_token(current_token),
    }
}

pub(super) fn account_delete_confirmation_is_valid(
    user_email: &str,
    request: &AccountDeleteRequest,
) -> bool {
    request.email.trim().eq_ignore_ascii_case(user_email)
        && request.confirmation.trim() == "DELETE MY OMNYID ACCOUNT"
}

pub(super) fn runtime_entrypoint_filename(framework: &str) -> &'static str {
    match framework {
        "crewai" => "crew_runtime.py",
        "python-runner-chat" => "runner_chat.py",
        _ => "runtime.py",
    }
}

pub(super) fn runtime_template_content(
    framework: &str,
    template: &str,
) -> Result<&'static str, String> {
    match (framework, template) {
        ("crewai", "docker-compose.yml") => Ok(include_str!(
            "../../runtime-templates/crewai/docker-compose.yml.tpl"
        )),
        ("crewai", "runtime.env") => Ok(include_str!(
            "../../runtime-templates/crewai/runtime.env.tpl"
        )),
        ("crewai", "README.md") => Ok(include_str!("../../runtime-templates/crewai/README.md.tpl")),
        ("crewai", "entrypoint") => Ok(include_str!(
            "../../runtime-templates/crewai/crew_runtime.py.tpl"
        )),
        ("crewai", "agent_profile.json") => Ok(include_str!(
            "../../runtime-templates/crewai/agent_profile.json.tpl"
        )),
        ("python-runner-chat", "docker-compose.yml") => Ok(include_str!(
            "../../runtime-templates/python-runner-chat/docker-compose.yml.tpl"
        )),
        ("python-runner-chat", "Dockerfile") => Ok(include_str!(
            "../../runtime-templates/python-runner-chat/Dockerfile.tpl"
        )),
        ("python-runner-chat", "runtime.env") => Ok(include_str!(
            "../../runtime-templates/python-runner-chat/runtime.env.tpl"
        )),
        ("python-runner-chat", "README.md") => Ok(include_str!(
            "../../runtime-templates/python-runner-chat/README.md.tpl"
        )),
        ("python-runner-chat", "entrypoint") => Ok(include_str!(
            "../../runtime-templates/python-runner-chat/runner_chat.py.tpl"
        )),
        ("python-runner-chat", "agent_profile.json") => Ok(include_str!(
            "../../runtime-templates/python-runner-chat/agent_profile.json.tpl"
        )),
        ("python-runner-chat", "requirements.txt") => Ok(include_str!(
            "../../runtime-templates/python-runner-chat/requirements.txt.tpl"
        )),
        ("python-runner-chat", "runtime_policy.json") => Ok(include_str!(
            "../../runtime-templates/python-runner-chat/runtime_policy.json.tpl"
        )),
        ("python-runner-chat", "starter_templates.json") => Ok(include_str!(
            "../../runtime-templates/python-runner-chat/starter_templates.json.tpl"
        )),
        ("python-runner-chat", "tool_registry.py") => Ok(include_str!(
            "../../runtime-templates/python-runner-chat/tool_registry.py.tpl"
        )),
        ("python-runner-chat", "policy.py") => Ok(include_str!(
            "../../runtime-templates/python-runner-chat/policy.py.tpl"
        )),
        _ => Err(format!(
            "missing runtime template for framework `{framework}` and template `{template}`"
        )),
    }
}

pub(super) fn runtime_template_version_from_deployment(
    deployment: &RuntimeDeploymentRecord,
) -> Option<String> {
    deployment
        .config_json
        .get("runtime_template_version")
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub(super) fn default_onboarding_for_user(user: &UserRecord) -> UserOnboardingRecord {
    UserOnboardingRecord {
        owner_user_id: user.id.clone(),
        identity_confirmed: false,
        email_provider: None,
        email_address: Some(user.email.clone()),
        email_connected: false,
        llm_mode: "byo_or_local".to_string(),
        notes: serde_json::json!({
            "source": "default",
            "next_step": "complete_setup"
        }),
        updated_at: chrono::Utc::now().to_rfc3339(),
        completed_at: None,
    }
}

pub(super) fn build_onboarding_record(
    user: &UserRecord,
    request: OnboardingUpdateRequest,
) -> Result<UserOnboardingRecord, (axum::http::StatusCode, String)> {
    let email_provider = request
        .email_provider
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let email_address = request
        .email_address
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let llm_mode = request
        .llm_mode
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("byo_or_local")
        .to_string();

    if request.email_connected {
        if email_provider.is_none() {
            return Err((
                axum::http::StatusCode::BAD_REQUEST,
                "email provider is required".to_string(),
            ));
        }
        if email_address
            .as_deref()
            .is_none_or(|value| !value.contains('@'))
        {
            return Err((
                axum::http::StatusCode::BAD_REQUEST,
                "valid email address is required".to_string(),
            ));
        }
    }

    let completed_at = if request.identity_confirmed {
        Some(chrono::Utc::now().to_rfc3339())
    } else {
        None
    };

    Ok(UserOnboardingRecord {
        owner_user_id: user.id.clone(),
        identity_confirmed: request.identity_confirmed,
        email_provider,
        email_address,
        email_connected: request.email_connected,
        llm_mode,
        notes: request.notes.unwrap_or_else(|| serde_json::json!({})),
        updated_at: chrono::Utc::now().to_rfc3339(),
        completed_at,
    })
}

fn allow_insecure_unsigned_messages() -> bool {
    std::env::var("OMNYID_ALLOW_INSECURE_UNSIGNED")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

fn webtransport_cert_path() -> Option<String> {
    std::env::var("OMNYID_WEBTRANSPORT_CERT_PATH")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn webtransport_key_path() -> Option<String> {
    std::env::var("OMNYID_WEBTRANSPORT_KEY_PATH")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn objective_requires_human_confirmation(objective: &str) -> bool {
    let lowered = objective.to_lowercase();
    [
        "send",
        "email",
        "book",
        "purchase",
        "buy",
        "pay",
        "delete",
        "cancel",
        "message someone",
        "contact",
        "submit",
        "apply",
        "transfer",
    ]
    .iter()
    .any(|token| lowered.contains(token))
}

fn objective_needs_clarification(objective: &str) -> bool {
    let lowered = objective.to_lowercase();
    let ambiguity_tokens = [
        "this",
        "that",
        "something",
        "someone",
        "somebody",
        "it",
        "things",
        "stuff",
        "sort it out",
        "handle it",
    ];
    let broad_action_tokens = ["organise", "organize", "manage", "plan", "handle", "set up"];

    ambiguity_tokens.iter().any(|token| lowered.contains(token))
        || (lowered.split_whitespace().count() <= 4
            && broad_action_tokens
                .iter()
                .any(|token| lowered.contains(token)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tonic::Code;

    #[test]
    fn internal_error_does_not_expose_sql_details() {
        let status = internal_error(sqlx::Error::Protocol(
            "relation users_private.messages does not exist".to_string(),
        ));
        assert_eq!(status.code(), Code::Internal);
        assert_eq!(status.message(), "internal server error");
    }

    #[test]
    fn readiness_error_to_http_does_not_expose_sql_details() {
        let (status, message) = readiness_error_to_http(sqlx::Error::Protocol(
            "column tenant_secret_key does not exist".to_string(),
        ));
        assert_eq!(status, axum::http::StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(message, "service dependency unavailable");
    }

    #[test]
    fn task_update_error_to_http_preserves_not_found_only() {
        let (status, message) = task_update_error_to_http(sqlx::Error::RowNotFound);
        assert_eq!(status, axum::http::StatusCode::NOT_FOUND);
        assert_eq!(message, "task not found");

        let (status, message) =
            task_update_error_to_http(sqlx::Error::Protocol("constraint foo violated".to_string()));
        assert_eq!(status, axum::http::StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(message, "internal server error");
    }

    #[test]
    fn internal_json_http_error_is_generic() {
        let (status, payload) = internal_json_http_error("relation cost_records does not exist");
        assert_eq!(status, axum::http::StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(payload["error"].as_str(), Some("internal server error"));
    }

    #[test]
    fn internal_http_error_is_generic() {
        let (status, message) = internal_http_error("runtime scaffold write failed: /srv/private");
        assert_eq!(status, axum::http::StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(message, "internal server error");
    }
}
