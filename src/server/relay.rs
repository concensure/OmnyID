use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::StreamExt;
use serde_json::Value;
use tokio::sync::broadcast;
use tracing::{error, instrument};
use wtransport::{
    Endpoint as WebTransportEndpoint, ServerConfig as WebTransportServerConfig,
    endpoint::IncomingSession as WebTransportIncomingSession,
};

use super::{
    AppState, app_to_proto, internal_error, load_webtransport_identity, proto_to_app,
    store_proto_message, webtransport_bind_addr,
};
use crate::db::Db;
use crate::metrics::Metrics;
use crate::relay::{
    RelayRequest, parse_relay_request, relay_ack_payload, relay_error_payload,
    relay_fleet_subscribed_payload, relay_thread_snapshot_payload, relay_thread_subscribed_payload,
};

// ── WebSocket relay & WebTransport ────────────────────────────────────────────

pub(super) async fn relay_ws_http(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| {
        handle_relay_socket(
            socket,
            state.db.clone(),
            state.metrics.clone(),
            state.relay_tx.clone(),
            state.relay_tx.subscribe(),
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

    let connection = session_request
        .accept()
        .await
        .map_err(|err| format!("failed to establish WebTransport session: {err}"))?;
    state.metrics.inc_relay_connections();
    state.metrics.inc_relay_webtransport_sessions();

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
                handle_webtransport_subscription_stream(
                    &state.db,
                    &state.metrics,
                    &state.relay_tx,
                    &mut send_stream,
                    thread_id,
                    include_snapshot,
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
) -> Result<(), String> {
    metrics.inc_relay_thread_subscriptions();
    let mut relay_rx = relay_tx.subscribe();

    if include_snapshot {
        let snapshot = db
            .get_thread(&thread_id)
            .await
            .map_err(|err| err.to_string())?;
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

fn relay_event_thread_id(event: &str) -> Option<String> {
    serde_json::from_str::<Value>(event).ok().and_then(|value| {
        value
            .get("thread_id")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

#[instrument(skip(socket, db, metrics, relay_tx, relay_rx))]
async fn handle_relay_socket(
    mut socket: WebSocket,
    db: Db,
    metrics: Arc<Metrics>,
    relay_tx: broadcast::Sender<String>,
    mut relay_rx: broadcast::Receiver<String>,
) {
    metrics.inc_relay_connections();
    let mut subscribed_thread_id: Option<String> = None;
    let mut fleet_subscribed = false;

    loop {
        tokio::select! {
            event = relay_rx.recv() => {
                match event {
                    Ok(event) => {
                        // Check if this is a fleet_update event
                        let parsed = serde_json::from_str::<Value>(&event).ok();
                        let is_fleet_update = parsed
                            .as_ref()
                            .and_then(|v| v.get("event"))
                            .and_then(Value::as_str)
                            == Some("fleet_update");

                        if is_fleet_update {
                            if fleet_subscribed {
                                if socket.send(WsMessage::Text(event.into())).await.is_err() {
                                    break;
                                }
                            }
                            continue;
                        }

                        if let Some(thread_id) = subscribed_thread_id.as_deref() {
                            let event_thread_id = parsed
                                .and_then(|value| value.get("thread_id").and_then(Value::as_str).map(str::to_string));
                            if event_thread_id.as_deref() != Some(thread_id) {
                                continue;
                            }
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
            *subscribed_thread_id = Some(thread_id.clone());
            if include_snapshot {
                let snapshot = match db.get_thread(&thread_id).await {
                    Ok(snapshot) => snapshot,
                    Err(err) => {
                        metrics.inc_relay_errors();
                        let status = internal_error(err);
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
                        return Ok(());
                    }
                };
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
    }

    Ok(())
}
