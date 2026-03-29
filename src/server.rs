use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use axum::{
    Json, Router,
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use serde::Deserialize;
use tokio::sync::RwLock;
use tracing::info;
use ulid::Ulid;

use crate::{
    agentcard::AgentCard,
    message::AFPMessage,
    relay::{
        RelayRequest, parse_relay_request, relay_ack_payload, relay_error_payload,
        relay_thread_snapshot_payload,
    },
};

type ThreadStore = Arc<RwLock<HashMap<String, Vec<AFPMessage>>>>;

#[derive(Clone)]
struct AppState {
    threads: ThreadStore,
}

#[derive(Deserialize)]
struct ThreadQuery {
    thread_id: String,
}

pub async fn run() {
    let state = AppState {
        threads: Arc::new(RwLock::new(HashMap::new())),
    };

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/transport/capabilities", get(transport_capabilities))
        .route("/messages", post(send_message).get(get_thread))
        .route("/.well-known/agent-card", get(agent_card))
        .route("/relay/ws", get(relay_ws))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("omnyid core homeserver listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind homeserver listener");
    axum::serve(listener, app).await.expect("serve homeserver");
}

async fn healthz() -> &'static str {
    "ok"
}

async fn readyz() -> &'static str {
    "ready"
}

async fn transport_capabilities() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "http": true,
        "websocket": true,
        "webtransport": false,
        "grpc": false,
    }))
}

async fn agent_card() -> Json<AgentCard> {
    Json(AgentCard::from_env())
}

async fn send_message(
    State(state): State<AppState>,
    Json(mut message): Json<AFPMessage>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    if message.thread_id.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "thread_id is required".to_string()));
    }
    if message.r#type.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "type is required".to_string()));
    }

    if message.id.trim().is_empty() {
        message.id = Ulid::new().to_string();
    }
    if message.timestamp.trim().is_empty() {
        message.timestamp = chrono::Utc::now().to_rfc3339();
    }

    let mut threads = state.threads.write().await;
    threads
        .entry(message.thread_id.clone())
        .or_default()
        .push(message.clone());

    Ok(Json(serde_json::json!({
        "success": true,
        "message_id": message.id,
        "thread_id": message.thread_id,
    })))
}

async fn get_thread(
    State(state): State<AppState>,
    Query(query): Query<ThreadQuery>,
) -> Result<Json<Vec<AFPMessage>>, (StatusCode, String)> {
    let threads = state.threads.read().await;
    let messages = threads.get(&query.thread_id).cloned().unwrap_or_default();
    Ok(Json(messages))
}

async fn relay_ws(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

async fn handle_ws(mut socket: WebSocket, state: AppState) {
    while let Some(Ok(Message::Text(payload))) = socket.recv().await {
        match parse_relay_request(&payload) {
            Ok(RelayRequest::Send { message }) => {
                let thread_id = message.thread_id.clone();
                let message_id = if message.id.is_empty() {
                    Ulid::new().to_string()
                } else {
                    message.id.clone()
                };
                let mut message = message;
                message.id = message_id.clone();
                if message.timestamp.is_empty() {
                    message.timestamp = chrono::Utc::now().to_rfc3339();
                }
                let mut threads = state.threads.write().await;
                threads.entry(thread_id).or_default().push(message);
                let _ = socket.send(Message::Text(relay_ack_payload(true, message_id).into())).await;
            }
            Ok(RelayRequest::SubscribeThread {
                thread_id,
                include_snapshot,
            }) => {
                if include_snapshot {
                    let snapshot = state
                        .threads
                        .read()
                        .await
                        .get(&thread_id)
                        .cloned()
                        .unwrap_or_default();
                    let payload = relay_thread_snapshot_payload(thread_id, snapshot);
                    let _ = socket.send(Message::Text(payload.into())).await;
                }
            }
            Ok(RelayRequest::SubscribeFleet) => {
                let _ = socket
                    .send(Message::Text(
                        serde_json::json!({"event":"fleet_subscribed"}).to_string().into(),
                    ))
                    .await;
            }
            Err(err) => {
                let _ = socket
                    .send(Message::Text(
                        relay_error_payload("invalid_request", &err).into(),
                    ))
                    .await;
            }
        }
    }
}
