// @locs-version: 1.0
// @module-id: server.user-integrations.tests
// @primary-capability: user-integration-route-tests
// @stability: test

use super::calendar::{
    calendar_google_oauth_client_id_configured, calendar_google_oauth_client_secret_configured,
    calendar_google_oauth_client_source, calendar_google_oauth_is_fully_configured,
    calendar_google_oauth_redirect_target,
};
use super::{
    gmail_access_token_from_token_response, gmail_connection_change_requires_recent_session,
    gmail_oauth_client_id_configured, gmail_oauth_client_secret_configured,
    gmail_oauth_client_source, gmail_oauth_config_payload, gmail_oauth_google_error_status,
    gmail_oauth_is_fully_configured, gmail_oauth_redirect_target, gmail_oauth_redirect_uri,
    gmail_oauth_state_sign_at, gmail_oauth_state_verify_at,
    gmail_oauth_token_exchange_failure_status, oauth_csrf_secret, validate_alias_agent_id,
};
use axum::http::StatusCode;
use std::sync::{Mutex, OnceLock};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[test]
fn gmail_routes_include_workspace_and_integration_status_aliases() {
    let source = include_str!("../user_integrations.rs");

    assert!(source.contains(".route(\"/gmail/status\", get(gmail_status_http))"));
    assert!(source.contains(".route(\"/integrations/gmail/status\", get(gmail_status_http))"));
    assert!(source.contains(".route(\"/gmail/connect-url\", get(gmail_connect_url_http))"));
    assert!(source.contains(".route(\"/gmail/config\", get(gmail_config_http))"));
    assert!(
        source.contains(".route(\"/integrations/gmail/oauth-url\", get(gmail_connect_url_http))")
    );
    assert!(source.contains(".route(\"/integrations/gmail/config\", get(gmail_config_http))"));
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
fn calendar_oauth_redirect_never_falls_back_to_the_api_host() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::remove_var("OMNYID_WORKSPACE_BASE_URL");
        std::env::remove_var("OMNYID_UI_BASE_URL");
        std::env::remove_var("OMNYID_HOMESERVER_URL");
    }
    assert_eq!(
        calendar_google_oauth_redirect_target("error"),
        "https://omnyid.com/workspace/?calendar=error"
    );
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
        std::env::remove_var("OMNYID_GMAIL_REDIRECT_URI");
        std::env::remove_var("OMNYID_HOMESERVER_URL");
    }

    let err = gmail_oauth_redirect_uri().expect_err("missing homeserver url should fail");
    assert_eq!(err.0, StatusCode::SERVICE_UNAVAILABLE);
    assert!(err.1.contains("OMNYID_GMAIL_REDIRECT_URI"));
    assert!(err.1.contains("OMNYID_HOMESERVER_URL"));
}

#[test]
fn gmail_oauth_redirect_uri_builds_callback_from_homeserver_base_url() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::remove_var("OMNYID_GMAIL_REDIRECT_URI");
        std::env::set_var("OMNYID_HOMESERVER_URL", "https://api.omnyid.com/");
    }

    assert_eq!(
        gmail_oauth_redirect_uri().expect("redirect uri"),
        "https://api.omnyid.com/gmail/callback"
    );

    unsafe {
        std::env::remove_var("OMNYID_GMAIL_REDIRECT_URI");
        std::env::remove_var("OMNYID_HOMESERVER_URL");
    }
}

#[test]
fn gmail_oauth_redirect_uri_prefers_explicit_redirect_uri() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::set_var(
            "OMNYID_GMAIL_REDIRECT_URI",
            "https://api.omnyid.com/gmail/callback",
        );
        std::env::set_var("OMNYID_HOMESERVER_URL", "https://wrong.example.test");
    }

    assert_eq!(
        gmail_oauth_redirect_uri().expect("redirect uri"),
        "https://api.omnyid.com/gmail/callback"
    );

    unsafe {
        std::env::remove_var("OMNYID_GMAIL_REDIRECT_URI");
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
fn gmail_oauth_client_config_falls_back_to_general_google_keys() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "   ");
        std::env::set_var("OMNYID_GOOGLE_CLIENT_ID", "google-client-id");
        std::env::set_var("OMNYID_GMAIL_CLIENT_SECRET", "   ");
        std::env::set_var("OMNYID_GOOGLE_CLIENT_SECRET", "google-client-secret");
    }

    assert_eq!(
        gmail_oauth_client_id_configured().expect("fallback client id"),
        "google-client-id"
    );
    assert_eq!(
        gmail_oauth_client_secret_configured().expect("fallback client secret"),
        "google-client-secret"
    );
    assert_eq!(gmail_oauth_client_source(), "google_fallback");
    let payload = gmail_oauth_config_payload();
    assert_eq!(payload["client_id_configured"].as_bool(), Some(true));
    assert_eq!(payload["client_secret_configured"].as_bool(), Some(true));
    assert_eq!(
        payload["oauth_client_source"].as_str(),
        Some("google_fallback")
    );

    unsafe {
        std::env::remove_var("OMNYID_GMAIL_CLIENT_ID");
        std::env::remove_var("OMNYID_GOOGLE_CLIENT_ID");
        std::env::remove_var("OMNYID_GMAIL_CLIENT_SECRET");
        std::env::remove_var("OMNYID_GOOGLE_CLIENT_SECRET");
    }
}

#[test]
fn gmail_oauth_full_config_requires_all_runtime_inputs() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "gmail-client-id");
        std::env::set_var("OMNYID_GMAIL_CLIENT_SECRET", "gmail-client-secret");
        std::env::remove_var("OMNYID_GMAIL_REDIRECT_URI");
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
        std::env::remove_var("OMNYID_GMAIL_REDIRECT_URI");
        std::env::remove_var("OMNYID_HOMESERVER_URL");
        std::env::remove_var("OMNYID_SESSION_SECRET");
    }
}

#[test]
fn gmail_oauth_config_payload_returns_redacted_diagnostics() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "gmail-client-id");
        std::env::set_var("OMNYID_GMAIL_CLIENT_SECRET", "gmail-client-secret");
        std::env::set_var(
            "OMNYID_GMAIL_REDIRECT_URI",
            "https://api.omnyid.com/gmail/callback",
        );
        std::env::set_var("OMNYID_HOMESERVER_URL", "https://api.omnyid.com");
        std::env::set_var("OMNYID_SESSION_SECRET", "session-secret");
    }

    let payload = gmail_oauth_config_payload();
    assert_eq!(payload["configured"].as_bool(), Some(true));
    assert_eq!(
        payload["required_authorized_redirect_uri"].as_str(),
        Some("https://api.omnyid.com/gmail/callback")
    );
    assert_eq!(payload["oauth_client_source"].as_str(), Some("gmail"));
    assert!(
        payload["required_scopes"]
            .as_array()
            .is_some_and(|items| items.iter().any(|item| item
                .as_str()
                .is_some_and(|scope| scope.contains("gmail.modify"))))
    );
    assert!(!payload.to_string().contains("gmail-client-secret"));
    assert!(!payload.to_string().contains("session-secret"));

    unsafe {
        std::env::remove_var("OMNYID_GMAIL_CLIENT_ID");
        std::env::remove_var("OMNYID_GMAIL_CLIENT_SECRET");
        std::env::remove_var("OMNYID_GMAIL_REDIRECT_URI");
        std::env::remove_var("OMNYID_HOMESERVER_URL");
        std::env::remove_var("OMNYID_SESSION_SECRET");
    }
}

#[test]
fn gmail_oauth_failure_statuses_are_actionable_without_secrets() {
    assert_eq!(
        gmail_oauth_google_error_status("redirect_uri_mismatch"),
        "redirect_mismatch"
    );
    assert_eq!(
        gmail_oauth_google_error_status("access_denied"),
        "access_denied"
    );
    assert_eq!(gmail_oauth_google_error_status("unknown"), "error");

    assert_eq!(
        gmail_oauth_token_exchange_failure_status(
            400,
            r#"{"error":"redirect_uri_mismatch","error_description":"Bad redirect"}"#,
        ),
        "redirect_mismatch"
    );
    assert_eq!(
        gmail_oauth_token_exchange_failure_status(
            401,
            r#"{"error":"invalid_client","error_description":"Unauthorized"}"#,
        ),
        "invalid_client"
    );
    assert_eq!(
        gmail_oauth_token_exchange_failure_status(
            400,
            r#"{"error":"invalid_grant","error_description":"Bad code"}"#,
        ),
        "invalid_grant"
    );
    assert_eq!(
        gmail_oauth_token_exchange_failure_status(500, "upstream unavailable"),
        "token_exchange_failed"
    );
}

#[test]
fn calendar_oauth_prefers_dedicated_google_calendar_client() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::set_var("OMNYID_GOOGLE_CALENDAR_CLIENT_ID", "calendar-client-id");
        std::env::set_var(
            "OMNYID_GOOGLE_CALENDAR_CLIENT_SECRET",
            "calendar-client-secret",
        );
        std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "gmail-client-id");
        std::env::set_var("OMNYID_GMAIL_CLIENT_SECRET", "gmail-client-secret");
        std::env::set_var("OMNYID_HOMESERVER_URL", "https://api.omnyid.com");
        std::env::set_var("OMNYID_SESSION_SECRET", "session-secret");
    }

    assert_eq!(
        calendar_google_oauth_client_id_configured().expect("calendar client id"),
        "calendar-client-id"
    );
    assert_eq!(
        calendar_google_oauth_client_secret_configured().expect("calendar client secret"),
        "calendar-client-secret"
    );
    assert_eq!(calendar_google_oauth_client_source(), "calendar");
    assert!(calendar_google_oauth_is_fully_configured());

    unsafe {
        std::env::remove_var("OMNYID_GOOGLE_CALENDAR_CLIENT_ID");
        std::env::remove_var("OMNYID_GOOGLE_CALENDAR_CLIENT_SECRET");
        std::env::remove_var("OMNYID_GMAIL_CLIENT_ID");
        std::env::remove_var("OMNYID_GMAIL_CLIENT_SECRET");
        std::env::remove_var("OMNYID_HOMESERVER_URL");
        std::env::remove_var("OMNYID_SESSION_SECRET");
    }
}

#[test]
fn calendar_oauth_falls_back_to_gmail_client_when_calendar_client_missing() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::remove_var("OMNYID_GOOGLE_CALENDAR_CLIENT_ID");
        std::env::remove_var("OMNYID_GOOGLE_CALENDAR_CLIENT_SECRET");
        std::env::set_var("OMNYID_GMAIL_CLIENT_ID", "gmail-client-id");
        std::env::set_var("OMNYID_GMAIL_CLIENT_SECRET", "gmail-client-secret");
        std::env::set_var("OMNYID_HOMESERVER_URL", "https://api.omnyid.com");
        std::env::set_var("OMNYID_SESSION_SECRET", "session-secret");
    }

    assert_eq!(
        calendar_google_oauth_client_id_configured().expect("gmail fallback client id"),
        "gmail-client-id"
    );
    assert_eq!(
        calendar_google_oauth_client_secret_configured().expect("gmail fallback client secret"),
        "gmail-client-secret"
    );
    assert_eq!(calendar_google_oauth_client_source(), "gmail_fallback");
    assert!(calendar_google_oauth_is_fully_configured());

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
    let change_end = source.len();
    let change_source = &source[change_start..change_end];
    assert!(change_source.contains("internal_http_error(e)"));
    assert!(change_source.contains("alias record has invalid last_changed_at timestamp"));
    assert!(change_source.contains("internal_http_error(err)"));
    assert!(!change_source.contains("\"Invalid timestamp in alias record.\""));
    assert!(!change_source.contains("(StatusCode::INTERNAL_SERVER_ERROR, msg)"));
}
