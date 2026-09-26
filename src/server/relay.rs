use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use futures_util::StreamExt;
use serde_json::Value;
use tokio::sync::broadcast;
use tracing::{error, instrument, warn};
use wtransport::{
    Endpoint as WebTransportEndpoint, ServerConfig as WebTransportServerConfig,
    endpoint::IncomingSession as WebTransportIncomingSession,
};

use super::auth::{bearer_token_from_headers, merge_thread_messages, session_is_expired};
use super::{
    AppState, app_to_proto, internal_http_error, load_webtransport_identity, proto_to_app,
    store_proto_message, webtransport_bind_addr,
};
use crate::db::Db;
use crate::metrics::Metrics;
use crate::relay::{
    RelayRequest, parse_relay_request, relay_ack_payload, relay_error_payload,
    relay_fleet_subscribed_payload, relay_thread_snapshot_payload, relay_thread_subscribed_payload,
};

fn relay_snapshot_load_error(err: impl std::fmt::Display) -> String {
    warn!(error = %err, "Suppressing relay snapshot load internals");
    "failed to load thread snapshot".to_string()
}

fn relay_thread_access_error() -> String {
    "thread not found".to_string()
}

fn require_relay_bearer_token(headers: &HeaderMap) -> Result<String, (StatusCode, &'static str)> {
    bearer_token_from_headers(headers).ok_or((StatusCode::UNAUTHORIZED, "missing bearer token"))
}

// ── WebSocket relay & WebTransport ────────────────────────────────────────────

pub(super) async fn relay_ws_http(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    // Verify the Origin header against the configured allowed origins (GAP-014).
    // Without this check, a cross-origin script could open a WebSocket to a
    // locally-running homeserver and receive private AFP relay events.
    let origin_ok = {
        let allowed = super::auth::allowed_cors_origins();
        match headers.get("origin").and_then(|v| v.to_str().ok()) {
            Some(origin) => allowed.iter().any(|a| a.to_str().unwrap_or("") == origin),
            // No Origin header — allow (same-origin upgrade, e.g. curl, native clients).
            None => true,
        }
    };
    if !origin_ok {
        return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }
    let token = match require_relay_bearer_token(&headers) {
        Ok(token) => token,
        Err((status, message)) => {
            return (status, message).into_response();
        }
    };
    let session = match state.db.find_session(&token).await {
        Ok(Some(s)) if !session_is_expired(&s.expires_at) => s,
        _ => return (StatusCode::UNAUTHORIZED, "invalid or expired session").into_response(),
    };
    let owner_user_id = session.user_id.clone();
    let relay_rx = state.relay_tx.subscribe();
    ws.on_upgrade(move |socket| {
        handle_relay_socket(
            socket,
            state.db.clone(),
            state.metrics.clone(),
            state.relay_tx.clone(),
            relay_rx,
            owner_user_id,
        )
    })
}

pub(super) async fn run_webtransport_server(state: Arc<AppState>) -> Result<(), String> {
    let identity = load_webtransport_identity()
        .await
        .map_err(|err| format!("failed to load WebTransport identity: {err}"))?;
    let config = WebTransportServerConfig::builder()
        .with_bind_address(webtransport_bind_addr())
        .with_identity(identity)
        .keep_alive_interval(Some(Duration::from_secs(5)))
        .build();
    let server = WebTransportEndpoint::server(config)
        .map_err(|err| format!("failed to start WebTransport endpoint: {err}"))?;

    loop {
        let incoming_session = server.accept().await;
        let state = state.clone();
        tokio::spawn(async move {
            if let Err(err) = handle_webtransport_session(incoming_session, state).await {
                error!(%err, "Omnyid WebTransport session failed");
            }
        });
    }
}

#[instrument(skip(incoming_session, state))]
async fn handle_webtransport_session(
    incoming_session: WebTransportIncomingSession,
    state: Arc<AppState>,
) -> Result<(), String> {
    let session_request = incoming_session
        .await
        .map_err(|err| format!("failed to accept WebTransport session request: {err}"))?;

    if session_request.path() != "/relay/wt" {
        session_request.not_found().await;
        return Ok(());
    }

    // GAP-014: Reject connections from unknown origins to block cross-origin attacks.
    if !is_allowed_webtransport_origin(session_request.origin()) {
        session_request.not_found().await;
        return Ok(());
    }

    let connection = session_request
        .accept()
        .await
        .map_err(|err| format!("failed to establish WebTransport session: {err}"))?;
    state.metrics.inc_relay_connections();
    state.metrics.inc_relay_webtransport_sessions();

    // GAP-011: WebTransport requires an auth frame before any data frame is
    // processed. The client must send {"op":"auth","token":"<bearer>"} first.
    let mut authenticated_user_id: Option<String> = None;

    let mut buffer = vec![0; 65536];
    loop {
        let (mut send_stream, mut recv_stream) = connection
            .accept_bi()
            .await
            .map_err(|err| format!("failed to accept WebTransport stream: {err}"))?;

        let mut payload = Vec::new();
        loop {
            match recv_stream.read(&mut buffer).await {
                Ok(Some(bytes_read)) => payload.extend_from_slice(&buffer[..bytes_read]),
                Ok(None) => break,
                Err(err) => {
                    state.metrics.inc_relay_errors();
                    let error_payload = relay_error_payload(
                        "stream_read_error",
                        &format!("WebTransport stream read failed: {err}"),
                    );
                    send_stream
                        .write_all(error_payload.as_bytes())
                        .await
                        .map_err(|write_err| write_err.to_string())?;
                    send_stream
                        .finish()
                        .await
                        .map_err(|write_err| write_err.to_string())?;
                    return Ok(());
                }
            }
        }

        let request_payload = String::from_utf8(payload)
            .map_err(|err| format!("invalid utf8 WebTransport payload: {err}"))?;
        let request = match parse_relay_request(&request_payload) {
            Ok(request) => request,
            Err(err) => {
                state.metrics.inc_relay_errors();
                send_stream
                    .write_all(relay_error_payload("invalid_request", &err).as_bytes())
                    .await
                    .map_err(|write_err| write_err.to_string())?;
                send_stream
                    .finish()
                    .await
                    .map_err(|write_err| write_err.to_string())?;
                continue;
            }
        };

        match request {
            RelayRequest::Authenticate { bearer_token } => {
                let session = state.db.find_session(&bearer_token).await.ok().flatten();
                match session {
                    Some(s) if !super::auth::session_is_expired(&s.expires_at) => {
                        authenticated_user_id = Some(s.user_id.clone());
                        let ack = serde_json::json!({"event":"authenticated","user_id":s.user_id})
                            .to_string();
                        let _ = send_stream.write_all(ack.as_bytes()).await;
                        let _ = send_stream.finish().await;
                    }
                    _ => {
                        let _ = send_stream
                            .write_all(
                                relay_error_payload(
                                    "unauthorized",
                                    "invalid or expired session token",
                                )
                                .as_bytes(),
                            )
                            .await;
                        let _ = send_stream.finish().await;
                        return Ok(());
                    }
                }
                continue;
            }
            _ if authenticated_user_id.is_none() => {
                // Reject data frames before auth (GAP-011).
                let _ = send_stream
                    .write_all(
                        relay_error_payload(
                            "unauthorized",
                            "send auth frame first: {\"op\":\"auth\",\"token\":\"<bearer>\"}",
                        )
                        .as_bytes(),
                    )
                    .await;
                let _ = send_stream.finish().await;
                continue;
            }
            RelayRequest::Send { message } => {
                let response_payload = handle_webtransport_send_request(
                    &state.db,
                    &state.metrics,
                    &state.relay_tx,
                    message,
                )
                .await;
                send_stream
                    .write_all(response_payload.as_bytes())
                    .await
                    .map_err(|err| format!("failed to write WebTransport response: {err}"))?;
                send_stream.finish().await.map_err(|err| {
                    format!("failed to finish WebTransport response stream: {err}")
                })?;
            }
            RelayRequest::SubscribeThread {
                thread_id,
                include_snapshot,
            } => {
                let owner_id = authenticated_user_id.as_deref().unwrap_or_default();
                handle_webtransport_subscription_stream(
                    &state.db,
                    &state.metrics,
                    &state.relay_tx,
                    &mut send_stream,
                    thread_id,
                    include_snapshot,
                    owner_id,
                )
                .await?;
            }
            // WebTransport does not support fleet subscriptions (WebSocket only)
            RelayRequest::SubscribeFleet => {
                let _ = send_stream
                    .write_all(
                        relay_error_payload(
                            "not_supported",
                            "Fleet subscriptions require WebSocket /relay/ws",
                        )
                        .as_bytes(),
                    )
                    .await;
            }
        }
    }
}

async fn handle_webtransport_send_request(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    message: crate::message::AFPMessage,
) -> String {
    match store_proto_message(db, metrics, relay_tx, app_to_proto(message)).await {
        Ok(response) => {
            metrics.inc_relay_send_requests();
            let ack = response.into_inner();
            relay_ack_payload(ack.success, ack.message_id)
        }
        Err(status) => {
            metrics.inc_relay_errors();
            relay_error_payload(status.code().to_string().as_str(), status.message())
        }
    }
}

async fn handle_webtransport_subscription_stream(
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    send_stream: &mut wtransport::SendStream,
    thread_id: String,
    include_snapshot: bool,
    owner_user_id: &str,
) -> Result<(), String> {
    metrics.inc_relay_thread_subscriptions();
    let mut relay_rx = relay_tx.subscribe();
    let snapshot = load_relay_thread_snapshot_for_owner(db, owner_user_id, &thread_id)
        .await
        .map_err(|(_, message)| relay_snapshot_load_error(message))?;

    if include_snapshot {
        let payload = relay_thread_snapshot_payload(
            thread_id.clone(),
            snapshot.into_iter().map(proto_to_app).collect(),
        );
        write_webtransport_event(send_stream, &payload).await?;
    }

    let subscribed_payload = relay_thread_subscribed_payload(thread_id.clone());
    write_webtransport_event(send_stream, &subscribed_payload).await?;

    loop {
        match relay_rx.recv().await {
            Ok(event) => {
                if relay_event_thread_id(&event).as_deref() != Some(thread_id.as_str()) {
                    continue;
                }
                // GAP-060: drop events belonging to a different user.
                let event_owner = serde_json::from_str::<Value>(&event).ok().and_then(|v| {
                    v.get("owner_user_id")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                });
                if let Some(owner) = event_owner {
                    if owner != owner_user_id {
                        continue;
                    }
                }
                write_webtransport_event(send_stream, &event).await?;
            }
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => return Ok(()),
        }
    }
}

async fn write_webtransport_event(
    send_stream: &mut wtransport::SendStream,
    payload: &str,
) -> Result<(), String> {
    send_stream
        .write_all(payload.as_bytes())
        .await
        .map_err(|err| format!("failed to write WebTransport event: {err}"))?;
    send_stream
        .write_all(b"\n")
        .await
        .map_err(|err| format!("failed to delimit WebTransport event: {err}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        is_allowed_webtransport_origin, load_relay_thread_snapshot_for_owner,
        relay_event_visible_to_subscriber, require_relay_bearer_token,
    };
    use crate::afp::Message;
    use crate::db::{Db, UserRecord};
    use axum::http::{HeaderMap, HeaderValue, StatusCode, header::AUTHORIZATION};
    use ulid::Ulid;

    #[test]
    fn relay_websocket_requires_bearer_token_before_upgrade() {
        let headers = HeaderMap::new();
        let err = require_relay_bearer_token(&headers).expect_err("missing auth should fail");
        assert_eq!(err.0, StatusCode::UNAUTHORIZED);
        assert_eq!(err.1, "missing bearer token");
    }

    #[test]
    fn relay_websocket_accepts_bearer_token_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_static("Bearer test-session-token"),
        );
        let token = require_relay_bearer_token(&headers).expect("bearer token");
        assert_eq!(token, "test-session-token");
    }

    #[test]
    fn relay_snapshot_load_failures_use_sanitized_internal_error() {
        let source = include_str!("relay.rs");
        let start = source
            .rfind("async fn load_relay_thread_snapshot_for_owner(")
            .expect("relay snapshot loader exists");
        let body = &source[start..];

        assert!(body.contains("internal_http_error(relay_snapshot_load_error(err))"));
        assert!(!body.contains("(StatusCode::INTERNAL_SERVER_ERROR,"));
    }

    #[test]
    fn webtransport_origin_allowlist_blocks_unknown_browser_origins() {
        assert!(is_allowed_webtransport_origin(Some("https://omnyid.com")));
        assert!(is_allowed_webtransport_origin(Some(
            "https://www.omnyid.com"
        )));
        assert!(is_allowed_webtransport_origin(Some(
            "http://localhost:3000"
        )));
        assert!(is_allowed_webtransport_origin(Some(
            "http://127.0.0.1:5173"
        )));
        assert!(is_allowed_webtransport_origin(Some("null")));
        assert!(is_allowed_webtransport_origin(None));
        assert!(!is_allowed_webtransport_origin(Some(
            "https://attacker.example"
        )));
    }

    #[test]
    fn relay_event_visibility_blocks_other_users_private_events() {
        let event = serde_json::json!({
            "event": "message_stored",
            "thread_id": "thread_alpha",
            "owner_user_id": "user_b"
        })
        .to_string();

        assert!(!relay_event_visible_to_subscriber(
            &event,
            "user_a",
            Some("thread_alpha"),
            false,
        ));
        assert!(relay_event_visible_to_subscriber(
            &event,
            "user_b",
            Some("thread_alpha"),
            false,
        ));
    }

    #[test]
    fn relay_event_visibility_requires_matching_thread_for_thread_subscription() {
        let event = serde_json::json!({
            "event": "message_stored",
            "thread_id": "thread_beta",
            "owner_user_id": "user_a"
        })
        .to_string();

        assert!(!relay_event_visible_to_subscriber(
            &event,
            "user_a",
            Some("thread_alpha"),
            false,
        ));
        assert!(relay_event_visible_to_subscriber(
            &event,
            "user_a",
            Some("thread_beta"),
            false,
        ));
    }

    #[test]
    fn relay_event_visibility_only_allows_fleet_updates_for_subscribed_owner() {
        let event = serde_json::json!({
            "event": "fleet_update",
            "owner_user_id": "user_a"
        })
        .to_string();

        assert!(!relay_event_visible_to_subscriber(
            &event, "user_a", None, false,
        ));
        assert!(!relay_event_visible_to_subscriber(
            &event, "user_b", None, true,
        ));
        assert!(relay_event_visible_to_subscriber(
            &event, "user_a", None, true,
        ));
    }

    #[tokio::test]
    async fn relay_thread_snapshot_requires_private_thread_membership() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let Ok(db) = Db::new(&database_url).await else {
            return;
        };

        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("user_relay_acl_{suffix}"),
            email: format!("relay-acl-{suffix}@omnyid.test"),
            password_hash: Some("smoke-hash".to_string()),
            auth_provider: "password".to_string(),
            google_sub: None,
            display_name: format!("Relay ACL {suffix}"),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        db.create_user(&user).await.expect("create user");

        let thread_id = format!("thread_public_only_relay_{suffix}");
        let shared_message = Message {
            protocol: "afp-v1".to_string(),
            id: format!("shared_relay_thread_msg_{suffix}"),
            thread_id: thread_id.clone(),
            parent_id: String::new(),
            from: "omnyid://transport/public".to_string(),
            to: vec![],
            timestamp: "2026-03-27T00:00:01Z".to_string(),
            r#type: "agent".to_string(),
            kind: None,
            content: String::new(),
            signature: "smoke-signature".to_string(),
            encryption: String::new(),
            views: String::new(),
            references: String::new(),
            attachments: String::new(),
            store_in_relational: true,
            subtype: "message".to_string(),
            metadata: serde_json::json!({"origin": "shared"}).to_string(),
            supertags: vec![],
        };
        db.store_message(&shared_message, serde_json::json!({"body": "shared trace"}))
            .await
            .expect("store shared message");

        let error = load_relay_thread_snapshot_for_owner(&db, &user.id, &thread_id)
            .await
            .expect_err("relay snapshot should require private membership");
        assert_eq!(error.0, StatusCode::NOT_FOUND);
    }
}

/// Check the `Origin` from a WebTransport CONNECT request against an allowlist.
///
/// Allows:
/// - `https://omnyid.com` and its `www.` subdomain (production)
/// - Any `localhost` or `127.0.0.1` origin (local dev)
/// - A `null` or absent origin header (e.g. native clients, Electron, Tauri)
///   — these are allowed because they cannot carry session cookies and are
///   still gated by the bearer-token check on the first relay message.
fn is_allowed_webtransport_origin(origin: Option<&str>) -> bool {
    let allowed_env = std::env::var("OMNYID_ALLOWED_ORIGINS").unwrap_or_default();
    let extra: Vec<&str> = allowed_env
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    match origin {
        None | Some("null") => true,
        Some(o) => {
            let o = o.trim_end_matches('/');
            o == "https://omnyid.com"
                || o == "https://www.omnyid.com"
                || o.starts_with("http://localhost")
                || o.starts_with("http://127.0.0.1")
                || extra.iter().any(|allowed| o == *allowed)
        }
    }
}

fn relay_event_thread_id(event: &str) -> Option<String> {
    serde_json::from_str::<Value>(event).ok().and_then(|value| {
        value
            .get("thread_id")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

fn relay_event_visible_to_subscriber(
    event: &str,
    owner_user_id: &str,
    subscribed_thread_id: Option<&str>,
    fleet_subscribed: bool,
) -> bool {
    let parsed = match serde_json::from_str::<Value>(event) {
        Ok(value) => value,
        Err(_) => return false,
    };
    let is_fleet_update = parsed.get("event").and_then(Value::as_str) == Some("fleet_update");

    if is_fleet_update {
        let event_owner = parsed.get("owner_user_id").and_then(Value::as_str);
        return fleet_subscribed && event_owner.map_or(true, |owner| owner == owner_user_id);
    }

    let event_owner = parsed.get("owner_user_id").and_then(Value::as_str);
    if let Some(owner) = event_owner {
        if owner != owner_user_id {
            return false;
        }
    }

    if let Some(thread_id) = subscribed_thread_id {
        let event_thread_id = parsed.get("thread_id").and_then(Value::as_str);
        if event_thread_id != Some(thread_id) {
            return false;
        }
    }

    true
}

async fn handle_relay_socket(
    mut socket: WebSocket,
    db: Db,
    metrics: Arc<Metrics>,
    relay_tx: broadcast::Sender<String>,
    mut relay_rx: broadcast::Receiver<String>,
    owner_user_id: String,
) {
    metrics.inc_relay_connections();
    let mut subscribed_thread_id: Option<String> = None;
    let mut fleet_subscribed = false;

    loop {
        tokio::select! {
            event = relay_rx.recv() => {
                match event {
                    Ok(event) => {
                        if !relay_event_visible_to_subscriber(
                            &event,
                            &owner_user_id,
                            subscribed_thread_id.as_deref(),
                            fleet_subscribed,
                        ) {
                            continue;
                        }
                        if socket.send(WsMessage::Text(event.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            maybe_message = socket.next() => {
                let Some(Ok(message)) = maybe_message else {
                    break;
                };

                match message {
                    WsMessage::Text(payload) => {
                        if handle_relay_client_message(
                            &mut socket,
                            &db,
                            &metrics,
                            &relay_tx,
                            &owner_user_id,
                            &mut subscribed_thread_id,
                            &mut fleet_subscribed,
                            &payload,
                        ).await.is_err() {
                            break;
                        }
                    }
                    WsMessage::Binary(_) => {
                        if socket.send(WsMessage::Text(relay_error_payload("binary_not_supported", "Binary relay frames are not supported").into())).await.is_err() {
                            break;
                        }
                    }
                    WsMessage::Ping(payload) => {
                        if socket.send(WsMessage::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    WsMessage::Pong(_) => {}
                    WsMessage::Close(_) => break,
                }
            }
        }
    }
}

#[instrument(skip(
    socket,
    db,
    metrics,
    relay_tx,
    subscribed_thread_id,
    fleet_subscribed,
    payload
))]
async fn handle_relay_client_message(
    socket: &mut WebSocket,
    db: &Db,
    metrics: &Arc<Metrics>,
    relay_tx: &broadcast::Sender<String>,
    owner_user_id: &str,
    subscribed_thread_id: &mut Option<String>,
    fleet_subscribed: &mut bool,
    payload: &str,
) -> Result<(), ()> {
    let request = match parse_relay_request(payload) {
        Ok(request) => request,
        Err(err) => {
            metrics.inc_relay_errors();
            socket
                .send(WsMessage::Text(
                    relay_error_payload("invalid_request", &err).into(),
                ))
                .await
                .map_err(|_| ())?;
            return Ok(());
        }
    };

    match request {
        RelayRequest::Send { message } => {
            match store_proto_message(db, metrics, relay_tx, app_to_proto(message)).await {
                Ok(response) => {
                    metrics.inc_relay_send_requests();
                    let ack = response.into_inner();
                    let payload = relay_ack_payload(ack.success, ack.message_id);
                    socket
                        .send(WsMessage::Text(payload.into()))
                        .await
                        .map_err(|_| ())?;
                }
                Err(status) => {
                    metrics.inc_relay_errors();
                    socket
                        .send(WsMessage::Text(
                            relay_error_payload(
                                status.code().to_string().as_str(),
                                status.message(),
                            )
                            .into(),
                        ))
                        .await
                        .map_err(|_| ())?;
                }
            }
        }
        RelayRequest::SubscribeThread {
            thread_id,
            include_snapshot,
        } => {
            metrics.inc_relay_thread_subscriptions();
            let snapshot =
                match load_relay_thread_snapshot_for_owner(db, owner_user_id, &thread_id).await {
                    Ok(snapshot) => snapshot,
                    Err((status_code, message)) => {
                        metrics.inc_relay_errors();
                        socket
                            .send(WsMessage::Text(
                                relay_error_payload(status_code.as_str(), &message).into(),
                            ))
                            .await
                            .map_err(|_| ())?;
                        return Ok(());
                    }
                };
            *subscribed_thread_id = Some(thread_id.clone());
            if include_snapshot {
                let payload = relay_thread_snapshot_payload(
                    thread_id.clone(),
                    snapshot.into_iter().map(proto_to_app).collect(),
                );
                socket
                    .send(WsMessage::Text(payload.into()))
                    .await
                    .map_err(|_| ())?;
            }

            let payload = relay_thread_subscribed_payload(thread_id);
            socket
                .send(WsMessage::Text(payload.into()))
                .await
                .map_err(|_| ())?;
        }
        RelayRequest::SubscribeFleet => {
            *fleet_subscribed = true;
            socket
                .send(WsMessage::Text(relay_fleet_subscribed_payload().into()))
                .await
                .map_err(|_| ())?;
        }
        // WebSocket clients are already authenticated at HTTP upgrade level.
        // Accept auth frames without error so clients can use a unified protocol.
        RelayRequest::Authenticate { .. } => {
            socket
                .send(WsMessage::Text(
                    serde_json::json!({"event":"authenticated"})
                        .to_string()
                        .into(),
                ))
                .await
                .map_err(|_| ())?;
        }
    }

    Ok(())
}

async fn load_relay_thread_snapshot_for_owner(
    db: &Db,
    owner_user_id: &str,
    thread_id: &str,
) -> Result<Vec<crate::afp::Message>, (StatusCode, String)> {
    let private_messages = db
        .get_private_thread(owner_user_id, thread_id)
        .await
        .map_err(|err| internal_http_error(relay_snapshot_load_error(err)))?;
    if private_messages.is_empty() {
        return Err((StatusCode::NOT_FOUND, relay_thread_access_error()));
    }
    let public_messages = db
        .get_thread(thread_id)
        .await
        .map_err(|err| internal_http_error(relay_snapshot_load_error(err)))?;
    Ok(merge_thread_messages(private_messages, public_messages))
}
