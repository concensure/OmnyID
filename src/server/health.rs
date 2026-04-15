use std::sync::Arc;

use axum::{Json, extract::State, http::StatusCode};
use serde_json::Value;

use super::{
    AppState, enable_internal_grpc, readiness_error_to_http, webtransport_bind_addr,
    webtransport_enabled,
};

pub(super) async fn healthz_http() -> Json<Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "omnyid-homeserver"
    }))
}

pub(super) async fn readyz_http(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, String)> {
    state
        .db
        .healthcheck()
        .await
        .map_err(readiness_error_to_http)?;

    Ok(Json(serde_json::json!({
        "status": "ready",
        "dependencies": {
            "database": "ok"
        }
    })))
}

pub(super) async fn metrics_http(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "omnyid-homeserver",
        "metrics": state.metrics.snapshot(),
    }))
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
