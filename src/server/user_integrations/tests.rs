// @locs-version: 1.0
// @module-id: server.user-integrations.tests
// @primary-capability: user-integration-route-tests
// @stability: test

use super::{
    gmail_access_token_from_token_response, gmail_connection_change_requires_recent_session,
    gmail_oauth_client_id_configured, gmail_oauth_client_secret_configured,
    gmail_oauth_is_fully_configured, gmail_oauth_redirect_target, gmail_oauth_redirect_uri,
    gmail_oauth_state_sign_at, gmail_oauth_state_verify_at, oauth_csrf_secret,
    validate_alias_agent_id,
};
use axum::http::StatusCode;
use std::sync::{Mutex, OnceLock};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[test]
fn gmail_oauth_redirect_target_defaults_to_workspace_relative_path() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::remove_var("OMNYID_WORKSPACE_BASE_URL");
        std::env::remove_var("OMNYID_UI_BASE_URL");
        std::env::remove_var("OMNYID_HOMESERVER_URL");
    }

    assert_eq!(
        gmail_oauth_redirect_target("connected"),
        "/workspace/?gmail=connected"
    );
}

#[test]
fn gmail_connection_changes_require_recent_sign_in() {
    assert!(gmail_connection_change_requires_recent_session());
}

#[test]
fn gmail_oauth_redirect_target_prefers_configured_workspace_base_url() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::set_var("OMNYID_WORKSPACE_BASE_URL", "https://cloud.omnyid.com");
        std::env::remove_var("OMNYID_UI_BASE_URL");
        std::env::remove_var("OMNYID_HOMESERVER_URL");
    }

    assert_eq!(
        gmail_oauth_redirect_target("error"),
        "https://cloud.omnyid.com/workspace/?gmail=error"
    );

    unsafe {
        std::env::remove_var("OMNYID_WORKSPACE_BASE_URL");
    }
}

#[test]
fn gmail_oauth_redirect_target_falls_back_to_ui_base_url() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::remove_var("OMNYID_WORKSPACE_BASE_URL");
        std::env::set_var("OMNYID_UI_BASE_URL", "https://omnyid.com/");
        std::env::remove_var("OMNYID_HOMESERVER_URL");
    }

    assert_eq!(
        gmail_oauth_redirect_target("not_configured"),
        "https://omnyid.com/workspace/?gmail=not_configured"
    );

    unsafe {
        std::env::remove_var("OMNYID_UI_BASE_URL");
    }
}

#[test]
fn gmail_oauth_redirect_target_derives_workspace_origin_from_api_homeserver_url() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::remove_var("OMNYID_WORKSPACE_BASE_URL");
        std::env::remove_var("OMNYID_UI_BASE_URL");
        std::env::set_var("OMNYID_HOMESERVER_URL", "https://api.omnyid.com");
    }

    assert_eq!(
        gmail_oauth_redirect_target("connected"),
        "https://omnyid.com/workspace/?gmail=connected"
    );

    unsafe {
        std::env::remove_var("OMNYID_HOMESERVER_URL");
    }
}

#[test]
fn gmail_oauth_redirect_uri_requires_homeserver_base_url() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::remove_var("OMNYID_HOMESERVER_URL");
    }

    let err = gmail_oauth_redirect_uri().expect_err("missing homeserver url should fail");
    assert_eq!(err.0, StatusCode::SERVICE_UNAVAILABLE);
    assert!(err.1.contains("OMNYID_HOMESERVER_URL"));
}

#[test]
fn gmail_oauth_redirect_uri_builds_callback_from_homeserver_base_url() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::set_var("OMNYID_HOMESERVER_URL", "https://api.omnyid.com/");
    }

    assert_eq!(
        gmail_oauth_redirect_uri().expect("redirect uri"),
        "https://api.omnyid.com/gmail/callback"
    );

    unsafe {
        std::env::remove_var("OMNYID_HOMESERVER_URL");
    }
}

#[test]
fn gmail_oauth_client_id_requires_non_blank_value() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "   ");
    }

    let err = gmail_oauth_client_id_configured().expect_err("blank gmail client id should fail");
    assert_eq!(err.0, StatusCode::SERVICE_UNAVAILABLE);
    assert!(err.1.contains("OMNYID_GMAIL_CLIENT_ID"));

    unsafe {
        std::env::remove_var("OMNYID_GMAIL_CLIENT_ID");
    }
}

#[test]
fn gmail_oauth_client_secret_requires_non_blank_value() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::set_var("OMNYID_GMAIL_CLIENT_SECRET", "   ");
    }

    let err =
        gmail_oauth_client_secret_configured().expect_err("blank gmail client secret should fail");
    assert_eq!(err.0, StatusCode::SERVICE_UNAVAILABLE);
    assert!(err.1.contains("OMNYID_GMAIL_CLIENT_SECRET"));

    unsafe {
        std::env::remove_var("OMNYID_GMAIL_CLIENT_SECRET");
    }
}

#[test]
fn gmail_oauth_full_config_requires_all_runtime_inputs() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "gmail-client-id");
        std::env::set_var("OMNYID_GMAIL_CLIENT_SECRET", "gmail-client-secret");
        std::env::set_var("OMNYID_HOMESERVER_URL", "https://api.omnyid.com");
        std::env::set_var("OMNYID_SESSION_SECRET", "session-secret");
    }

    assert!(gmail_oauth_is_fully_configured());

    unsafe {
        std::env::remove_var("OMNYID_SESSION_SECRET");
    }
    assert!(!gmail_oauth_is_fully_configured());

    unsafe {
        std::env::remove_var("OMNYID_GMAIL_CLIENT_ID");
        std::env::remove_var("OMNYID_GMAIL_CLIENT_SECRET");
        std::env::remove_var("OMNYID_HOMESERVER_URL");
        std::env::remove_var("OMNYID_SESSION_SECRET");
    }
}

#[test]
fn gmail_access_token_from_token_response_requires_non_blank_token() {
    assert_eq!(
        gmail_access_token_from_token_response(&serde_json::json!({
            "access_token": "  access-token  "
        })),
        Some("access-token".to_string())
    );
    assert_eq!(
        gmail_access_token_from_token_response(&serde_json::json!({
            "access_token": "   "
        })),
        None
    );
    assert_eq!(
        gmail_access_token_from_token_response(&serde_json::json!({
            "refresh_token": "refresh-only"
        })),
        None
    );
}

#[test]
fn validate_alias_agent_id_requires_structurally_valid_agent_id() {
    assert_eq!(
        validate_alias_agent_id("agent:test@omnyid.com").expect("valid agent id"),
        "agent:test@omnyid.com"
    );

    let err = validate_alias_agent_id("not-an-agent-id").expect_err("invalid agent id should fail");
    assert_eq!(err.0, StatusCode::BAD_REQUEST);
    assert!(err.1.contains("valid agent_id"));
}

#[test]
fn gmail_oauth_secret_requires_configured_session_or_signing_secret() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::remove_var("OMNYID_SESSION_SECRET");
        std::env::remove_var("OMNYID_SIGNING_KEY_HEX");
    }

    let err = oauth_csrf_secret().expect_err("missing oauth csrf secret should fail");
    assert_eq!(err.0, StatusCode::SERVICE_UNAVAILABLE);
    assert!(err.1.contains("OMNYID_SESSION_SECRET"));
}

#[test]
fn gmail_oauth_state_verification_accepts_recent_signed_state() {
    let _guard = env_lock().lock().expect("env lock");
    let now_secs = 1_800_000_000;
    unsafe {
        std::env::set_var("OMNYID_SESSION_SECRET", "test-session-secret");
    }
    let state = gmail_oauth_state_sign_at("user_abc", now_secs - 30).expect("signed state");

    assert_eq!(
        gmail_oauth_state_verify_at(&state, now_secs).expect("verify state"),
        Some("user_abc".to_string())
    );
}

#[test]
fn gmail_oauth_state_verification_rejects_stale_state() {
    let _guard = env_lock().lock().expect("env lock");
    let now_secs = 1_800_000_000;
    unsafe {
        std::env::set_var("OMNYID_SESSION_SECRET", "test-session-secret");
    }
    let state = gmail_oauth_state_sign_at("user_abc", now_secs - 601).expect("signed state");

    assert_eq!(
        gmail_oauth_state_verify_at(&state, now_secs).expect("verify state"),
        None
    );
}

#[test]
fn gmail_oauth_state_verification_rejects_tampered_user_id() {
    let _guard = env_lock().lock().expect("env lock");
    let now_secs = 1_800_000_000;
    unsafe {
        std::env::set_var("OMNYID_SESSION_SECRET", "test-session-secret");
    }
    let state = gmail_oauth_state_sign_at("user_abc", now_secs - 30).expect("signed state");
    let tampered = state.replacen("user_abc", "user_xyz", 1);

    assert_eq!(
        gmail_oauth_state_verify_at(&tampered, now_secs).expect("verify state"),
        None
    );
}

#[test]
fn gmail_token_expiry_warning_state_marks_expired_tokens() {
    let now = chrono::DateTime::parse_from_rfc3339("2026-07-06T00:00:00Z")
        .expect("valid now")
        .with_timezone(&chrono::Utc);
    let state = super::gmail_token_expiry_warning_state(Some("2026-07-05T23:59:59Z"), now);
    assert_eq!(state, (true, false));
}

#[test]
fn gmail_token_expiry_warning_state_marks_tokens_inside_warning_window() {
    let now = chrono::DateTime::parse_from_rfc3339("2026-07-06T00:00:00Z")
        .expect("valid now")
        .with_timezone(&chrono::Utc);
    let state = super::gmail_token_expiry_warning_state(Some("2026-07-06T23:00:00Z"), now);
    assert_eq!(state, (false, true));
}

#[test]
fn gmail_token_expiry_warning_state_ignores_tokens_outside_warning_window() {
    let now = chrono::DateTime::parse_from_rfc3339("2026-07-06T00:00:00Z")
        .expect("valid now")
        .with_timezone(&chrono::Utc);
    let state = super::gmail_token_expiry_warning_state(Some("2026-07-07T01:00:00Z"), now);
    assert_eq!(state, (false, false));
}

#[test]
fn alias_routes_sanitize_unexpected_database_errors() {
    let source = include_str!("../user_integrations.rs");

    let claim_start = source
        .find("async fn alias_claim_http(")
        .expect("alias_claim_http exists");
    let claim_end = source[claim_start..]
        .find("\n#[derive(serde::Deserialize)]\nstruct AliasChangeBody")
        .map(|offset| claim_start + offset)
        .expect("alias change body follows claim");
    let claim_source = &source[claim_start..claim_end];
    assert!(claim_source.contains("internal_http_error(e)"));
    assert!(!claim_source.contains("(StatusCode::INTERNAL_SERVER_ERROR, msg)"));

    let change_start = source
        .find("async fn alias_change_http(")
        .expect("alias_change_http exists");
    let change_end = source[change_start..]
        .find("\n#[cfg(test)]")
        .map(|offset| change_start + offset)
        .expect("test module follows alias_change_http");
    let change_source = &source[change_start..change_end];
    assert!(change_source.contains("internal_http_error(e)"));
    assert!(!change_source.contains("(StatusCode::INTERNAL_SERVER_ERROR, msg)"));
}
