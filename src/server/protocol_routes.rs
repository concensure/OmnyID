// @locs-version: 2.0
// @module-id: server-protocol-routes
// @primary-capability: AFP protocol HTTP endpoints — thread verification, MCP, POST /messages
// @stability: active

use super::*;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/thread/{id}/verify", get(verify_thread_chain_http))
        .route("/mcp", post(mcp_http))
        .route("/messages", post(post_message_http))
}

/// POST /messages — authenticated AFP message submission (HTTP fallback for native clients
/// that cannot maintain a WebSocket, e.g. OmnyPulse when the relay socket is down).
/// Equivalent to sending over the relay with op:"send".
async fn post_message_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(message): Json<crate::message::AFPMessage>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let proto = app_to_proto(message);
    let ack = store_proto_message(&state.db, &state.metrics, &state.relay_tx, proto)
        .await
        .map_err(status_to_http)?
        .into_inner();
    Ok(Json(
        serde_json::json!({ "success": ack.success, "message_id": ack.message_id }),
    ))
}

async fn mcp_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<crate::mcp_server::McpRequest>,
) -> Result<Json<crate::mcp_server::McpResponse>, (StatusCode, String)> {
    // The public MCP HTTP route is user-scoped and requires an authenticated session.
    let user = authenticated_user(&state.db, &headers).await?;
    let resp = crate::mcp_server::dispatch_mcp_request(req, &state.db, Some(&user.id)).await;
    Ok(Json(resp))
}

async fn verify_thread_chain_http(
    State(state): State<Arc<AppState>>,
    Path(thread_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    // Allow both authenticated and unauthenticated verify (read-only integrity check)
    let messages = state
        .db
        .get_thread(&thread_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let msg_values: Vec<Value> = messages
        .iter()
        .map(|m| {
            serde_json::json!({
                "id": m.id,
                "thread_id": m.thread_id,
                "from": m.from,
                "timestamp": m.timestamp,
                "type": m.r#type,
            })
        })
        .collect();
    let _ = headers; // available for future auth-gated verify
    match crate::audit_chain::verify_chain(&msg_values) {
        Ok(()) => Ok(Json(serde_json::json!({
            "thread_id": thread_id,
            "message_count": msg_values.len(),
            "chain_valid": true,
        }))),
        Err(broken_at) => Ok(Json(serde_json::json!({
            "thread_id": thread_id,
            "message_count": msg_values.len(),
            "chain_valid": false,
            "broken_at_index": broken_at,
        }))),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn mcp_http_route_requires_authenticated_user() {
        let source = include_str!("protocol_routes.rs");
        let start = source.find("async fn mcp_http(").expect("mcp_http exists");
        let end = source[start..]
            .find("\nasync fn verify_thread_chain_http(")
            .map(|offset| start + offset)
            .expect("verify_thread_chain_http follows mcp_http");
        let function_source = &source[start..end];

        assert!(
            function_source.contains("let user = authenticated_user(&state.db, &headers).await?;")
        );
        assert!(function_source.contains("Some(&user.id)"));
        assert!(!function_source.contains(".ok()"));
        assert!(!function_source.contains("user_id.as_deref()"));
    }

    #[test]
    fn post_message_http_uses_status_to_http_for_store_failures() {
        let source = include_str!("protocol_routes.rs");
        let start = source
            .find("async fn post_message_http(")
            .expect("post_message_http exists");
        let end = source[start..]
            .find("\nasync fn mcp_http(")
            .map(|offset| start + offset)
            .expect("mcp_http follows post_message_http");
        let function_source = &source[start..end];

        assert!(function_source.contains(".map_err(status_to_http)?"));
        assert!(!function_source.contains(
            ".map_err(|s| (StatusCode::INTERNAL_SERVER_ERROR, s.message().to_string()))?"
        ));
    }
}
