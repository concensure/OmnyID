use std::sync::Arc;

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde_json::Value;
use subtle::ConstantTimeEq;

use super::health_deps::{
    check_composio_readiness, check_gmail_oauth_readiness, check_llm_backend_readiness,
    check_object_store_readiness, check_smtp_readiness, check_stripe_billing_readiness,
};
use super::{
    AppState, authenticated_user, bearer_token_from_headers, enable_internal_grpc,
    internal_http_error, readiness_error_to_http, webtransport_bind_addr, webtransport_enabled,
};
use crate::secret_manager::read_process_secret_trimmed;

fn public_operational_endpoints_enabled() -> bool {
    std::env::var("OMNYID_PUBLIC_OPERATIONAL_ENDPOINTS")
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

fn public_operational_endpoint_token() -> Option<String> {
    read_process_secret_trimmed("OMNYID_OPERATIONAL_ENDPOINT_TOKEN")
}

fn public_operational_request_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-omnyid-ops-token")
        .and_then(|header| header.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| bearer_token_from_headers(headers))
}

fn operational_tokens_match(expected: &str, actual: &str) -> bool {
    if expected.len() != actual.len() {
        return false;
    }
    expected.as_bytes().ct_eq(actual.as_bytes()).into()
}

fn truthy_env_var(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn falsey_env_var(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "0" | "false" | "no" | "off"
    )
}

fn production_environment_label() -> Option<String> {
    for key in [
        "OMNYID_ENV",
        "APP_ENV",
        "ENVIRONMENT",
        "RUST_ENV",
        "NODE_ENV",
    ] {
        if let Ok(value) = std::env::var(key) {
            let normalized = value.trim().to_ascii_lowercase();
            if !normalized.is_empty() {
                return Some(normalized);
            }
        }
    }
    None
}

fn readiness_requires_healthy_daemons() -> bool {
    if let Ok(value) = std::env::var("OMNYID_READYZ_REQUIRE_HEALTHY_DAEMONS") {
        if truthy_env_var(&value) {
            return true;
        }
        if falsey_env_var(&value) {
            return false;
        }
    }
    matches!(
        production_environment_label().as_deref(),
        Some("production" | "prod")
    )
}

pub(super) async fn guard_operational_endpoint(
    state: &Arc<AppState>,
    headers: &HeaderMap,
) -> Result<(), (StatusCode, String)> {
    if public_operational_endpoints_enabled() {
        if let Some(expected_token) = public_operational_endpoint_token() {
            if let Some(actual_token) = public_operational_request_token(headers) {
                if operational_tokens_match(&expected_token, &actual_token) {
                    return Ok(());
                }
            }
            if authenticated_user(&state.db, headers).await.is_ok() {
                return Ok(());
            }
            return Err((
                StatusCode::UNAUTHORIZED,
                "Operational endpoint token required.".to_string(),
            ));
        }
        return Ok(());
    }
    authenticated_user(&state.db, headers).await.map(|_| ())
}

pub(super) async fn healthz_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    guard_operational_endpoint(&state, &headers).await?;
    Ok(Json(serde_json::json!({
        "status": "ok",
        "service": "omnyid-homeserver",
        "build_version": option_env!("OMNYID_BUILD_ID").unwrap_or("dev")
    })))
}

pub(super) async fn readyz_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    guard_operational_endpoint(&state, &headers).await?;
    state
        .db
        .healthcheck()
        .await
        .map_err(readiness_error_to_http)?;

    // GAP-087: probe object store, SMTP, and the configured managed LLM backend.
    let store_status = check_object_store_readiness(&state.http_client).await;
    let smtp_status = check_smtp_readiness().await;
    let llm_status = check_llm_backend_readiness(&state.http_client).await;
    let gmail_oauth_status = check_gmail_oauth_readiness();
    let composio_status = check_composio_readiness(&state.http_client).await;
    let stripe_billing_status = check_stripe_billing_readiness();

    let store_ok = store_status == "ok" || store_status == "not_configured";
    let smtp_ok = smtp_status == "ok" || smtp_status == "not_configured";
    let llm_ok = llm_status == "ok" || llm_status == "not_configured";
    let gmail_oauth_ok = gmail_oauth_status == "ok" || gmail_oauth_status == "not_configured";
    let composio_ok = composio_status == "ok" || composio_status == "not_configured";
    let stripe_billing_ok =
        stripe_billing_status == "ok" || stripe_billing_status == "not_configured";

    if !store_ok || !smtp_ok || !llm_ok || !gmail_oauth_ok || !composio_ok || !stripe_billing_ok {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            format!(
                "readyz: dependencies not ready - store={store_status} smtp={smtp_status} llm={llm_status} gmail_oauth={gmail_oauth_status} composio={composio_status} stripe_billing={stripe_billing_status}"
            ),
        ));
    }

    // GAP-086: include stale daemon heartbeats in the readyz response so operators
    // know when a background loop has hung without reading logs.
    let stale_daemons = crate::daemon_registry::daemon_health_check(&state.db, None)
        .await
        .unwrap_or_default();
    let daemon_status = if stale_daemons.is_empty() {
        serde_json::json!("ok")
    } else {
        let stale: Vec<serde_json::Value> = stale_daemons
            .iter()
            .map(|w| {
                serde_json::json!({
                    "daemon_kind": format!("{:?}", w.daemon_kind),
                    "stale_minutes": w.stale_minutes,
                })
            })
            .collect();
        serde_json::json!({ "stale_count": stale.len(), "stale": stale })
    };

    if !stale_daemons.is_empty() && readiness_requires_healthy_daemons() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            format!(
                "readyz: stale daemon heartbeats detected - count={} production requires healthy daemon heartbeats",
                stale_daemons.len()
            ),
        ));
    }

    Ok(Json(serde_json::json!({
        "status": "ready",
        "dependencies": {
            "database": "ok",
            "object_store": store_status,
            "smtp": smtp_status,
            "llm_backend": llm_status,
            "gmail_oauth": gmail_oauth_status,
            "composio": composio_status,
            "stripe_billing": stripe_billing_status,
            "daemons": daemon_status,
        }
    })))
}

pub(super) async fn metrics_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<axum::response::Response, (StatusCode, String)> {
    guard_operational_endpoint(&state, &headers).await?;
    let snapshot = state.metrics.snapshot();
    // Serve Prometheus text format when client sends Accept: text/plain (GAP-084).
    let wants_prometheus = headers
        .get(axum::http::header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .map(|a| a.contains("text/plain"))
        .unwrap_or(false);
    if wants_prometheus {
        let body = snapshot.to_prometheus();
        return Ok(axum::response::Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "text/plain; version=0.0.4; charset=utf-8")
            .body(axum::body::Body::from(body))
            .map_err(internal_http_error)?);
    }
    let json = Json(serde_json::json!({
        "status": "ok",
        "service": "omnyid-homeserver",
        "metrics": snapshot,
    }));
    Ok(json.into_response())
}

pub(super) async fn transport_capabilities_http(State(state): State<Arc<AppState>>) -> Json<Value> {
    state.metrics.inc_relay_webtransport_capability_checks();
    let webtransport_enabled = webtransport_enabled();
    Json(serde_json::json!({
        "status": "ok",
        "service": "omnyid-homeserver",
        "public_transport": {
            "primary": "webtransport",
            "fallback": "websocket",
            "webtransport": {
                "enabled": webtransport_enabled,
                "path": "/relay/wt",
                "bind_addr": webtransport_bind_addr().to_string(),
                "reason": if webtransport_enabled { "configured" } else { "disabled_or_misconfigured" }
            },
            "websocket": {
                "enabled": true,
                "path": "/relay/ws"
            },
            "http": {
                "enabled": true,
                "path": "/send"
            }
        },
        "internal_transport": {
            "grpc_enabled": enable_internal_grpc()
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::{
        operational_tokens_match, production_environment_label, public_operational_endpoint_token,
        public_operational_request_token, readiness_requires_healthy_daemons,
    };
    use axum::http::{HeaderMap, HeaderValue, header::AUTHORIZATION};
    use std::sync::{Mutex, OnceLock};

    fn env_test_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn clear_health_env() {
        unsafe {
            std::env::remove_var("OMNYID_READYZ_REQUIRE_HEALTHY_DAEMONS");
            std::env::remove_var("OMNYID_ENV");
            std::env::remove_var("APP_ENV");
            std::env::remove_var("ENVIRONMENT");
            std::env::remove_var("RUST_ENV");
            std::env::remove_var("NODE_ENV");
        }
    }

    #[test]
    fn public_operational_request_token_prefers_explicit_ops_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-omnyid-ops-token",
            HeaderValue::from_static("header-token"),
        );
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_static("Bearer bearer-token"),
        );

        assert_eq!(
            public_operational_request_token(&headers).as_deref(),
            Some("header-token")
        );
    }

    #[test]
    fn public_operational_request_token_falls_back_to_bearer_auth() {
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_static("Bearer bearer-token"),
        );

        assert_eq!(
            public_operational_request_token(&headers).as_deref(),
            Some("bearer-token")
        );
    }

    #[test]
    fn metrics_prometheus_response_builder_is_fallible() {
        let source = include_str!("health.rs");
        let start = source
            .find("pub(super) async fn metrics_http(")
            .expect("metrics_http exists");
        let end = source[start..]
            .find("pub(super) async fn transport_capabilities_http(")
            .map(|offset| start + offset)
            .expect("transport capabilities follows metrics");
        let metrics_source = &source[start..end];

        assert!(metrics_source.contains(".map_err(internal_http_error)?"));
        assert!(!metrics_source.contains(".unwrap()"));
    }

    #[test]
    fn operational_tokens_match_requires_exact_constant_length_match() {
        assert!(operational_tokens_match("same-token", "same-token"));
        assert!(!operational_tokens_match("same-token", "same-token "));
        assert!(!operational_tokens_match("same-token", "different"));
    }

    #[test]
    fn public_operational_endpoint_token_reads_file_backed_secret() {
        let _guard = env_test_lock().lock().expect("env test lock");
        let path =
            std::env::temp_dir().join(format!("omnyid-ops-token-{}.txt", std::process::id()));
        std::fs::write(&path, "file-backed-token\n").expect("write temp token");
        unsafe {
            std::env::remove_var("OMNYID_OPERATIONAL_ENDPOINT_TOKEN");
            std::env::set_var("OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE", &path);
        }

        let token = public_operational_endpoint_token();

        unsafe {
            std::env::remove_var("OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE");
        }
        let _ = std::fs::remove_file(path);

        assert_eq!(token.as_deref(), Some("file-backed-token"));
    }

    #[test]
    fn readiness_requires_healthy_daemons_defaults_on_in_production() {
        let _guard = env_test_lock().lock().expect("env test lock");
        clear_health_env();
        unsafe {
            std::env::set_var("OMNYID_ENV", "production");
        }

        assert_eq!(
            production_environment_label().as_deref(),
            Some("production")
        );
        assert!(readiness_requires_healthy_daemons());

        clear_health_env();
    }

    #[test]
    fn readiness_requires_healthy_daemons_defaults_off_outside_production() {
        let _guard = env_test_lock().lock().expect("env test lock");
        clear_health_env();
        unsafe {
            std::env::set_var("OMNYID_ENV", "development");
        }

        assert_eq!(
            production_environment_label().as_deref(),
            Some("development")
        );
        assert!(!readiness_requires_healthy_daemons());

        clear_health_env();
    }

    #[test]
    fn readiness_requires_healthy_daemons_respects_explicit_override() {
        let _guard = env_test_lock().lock().expect("env test lock");
        clear_health_env();
        unsafe {
            std::env::set_var("OMNYID_ENV", "production");
            std::env::set_var("OMNYID_READYZ_REQUIRE_HEALTHY_DAEMONS", "false");
        }
        assert!(!readiness_requires_healthy_daemons());

        unsafe {
            std::env::set_var("OMNYID_ENV", "development");
            std::env::set_var("OMNYID_READYZ_REQUIRE_HEALTHY_DAEMONS", "true");
        }
        assert!(readiness_requires_healthy_daemons());

        clear_health_env();
    }
}
