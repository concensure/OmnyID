use std::sync::Arc;
use std::time::Duration;

use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, Method, StatusCode},
};
use rand::Rng;
use serde_json::Value;
use sqlx::Row;
use tonic::Status;
use tower_http::cors::CorsLayer;
use ulid::Ulid;

use crate::{
    db::{AuthSessionRecord, Db, ManagedAgentRecord, UserRecord},
    message::AFPMessage,
};

use super::{AppState, RateLimitPolicy, internal_error, status_to_http, types::*};

// ── Auth / registration ────────────────────────────────────────────────────────

pub(super) async fn register_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RegisterRequest>,
) -> Result<Json<SessionResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("register", &headers),
        RateLimitPolicy {
            max_requests: 8,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let email = request.email.trim().to_lowercase();
    let password = request.password.trim().to_string();
    let display_name = request
        .display_name
        .unwrap_or_else(|| email.split('@').next().unwrap_or("Omnyid User").to_string())
        .trim()
        .to_string();

    if email.is_empty() || !email.contains('@') {
        return Err((
            StatusCode::BAD_REQUEST,
            "valid email is required".to_string(),
        ));
    }
    if password.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "password must be at least 8 characters".to_string(),
        ));
    }

    if state
        .db
        .find_user_by_email(&email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .is_some()
    {
        return Err((
            StatusCode::CONFLICT,
            "account already exists for that email".to_string(),
        ));
    }

    let password_hash =
        hash_password(&password).map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    let user = UserRecord {
        id: Ulid::new().to_string(),
        email: email.clone(),
        password_hash: Some(password_hash),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    state
        .db
        .create_user(&user)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    ensure_user_agents_and_demo_seed(&state, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    let session = create_session_for_user(&state.db, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    Ok(Json(SessionResponse {
        token: session.token,
        user: session_user_response(&user),
    }))
}

pub(super) async fn login_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> Result<Json<SessionResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("login", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let email = request.email.trim().to_lowercase();
    let user = state
        .db
        .find_user_by_email(&email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "invalid email or password".to_string(),
            )
        })?;

    let password_hash = user.password_hash.clone().ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            "account requires Google sign-in".to_string(),
        )
    })?;
    if !verify_password(&password_hash, request.password.trim())
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?
    {
        return Err((
            StatusCode::UNAUTHORIZED,
            "invalid email or password".to_string(),
        ));
    }

    let session = create_session_for_user(&state.db, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    Ok(Json(SessionResponse {
        token: session.token,
        user: session_user_response(&user),
    }))
}

pub(super) async fn google_auth_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<GoogleAuthRequest>,
) -> Result<Json<SessionResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("google_auth", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let token_info = verify_google_id_token(&request.id_token)
        .await
        .map_err(|err| (StatusCode::UNAUTHORIZED, err))?;

    let user = if let Some(existing) = state
        .db
        .find_user_by_google_sub(&token_info.sub)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        existing
    } else if let Some(existing_email) = state
        .db
        .find_user_by_email(&token_info.email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
    {
        existing_email
    } else {
        let user = UserRecord {
            id: Ulid::new().to_string(),
            email: token_info.email.clone(),
            password_hash: None,
            auth_provider: "google".to_string(),
            google_sub: Some(token_info.sub.clone()),
            display_name: token_info
                .name
                .clone()
                .or(token_info.given_name.clone())
                .unwrap_or_else(|| {
                    token_info
                        .email
                        .split('@')
                        .next()
                        .unwrap_or("Omnyid User")
                        .to_string()
                }),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        state
            .db
            .create_user(&user)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        ensure_user_agents_and_demo_seed(&state, &user)
            .await
            .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
        user
    };

    let session = create_session_for_user(&state.db, &user)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;

    Ok(Json(SessionResponse {
        token: session.token,
        user: session_user_response(&user),
    }))
}

pub(super) async fn auth_session_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<SessionUserResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    Ok(Json(session_user_response(&user)))
}

// ── Auth helpers & rate limiting ──────────────────────────────────────────────

pub(super) async fn authenticated_user(
    db: &Db,
    headers: &HeaderMap,
) -> Result<UserRecord, (StatusCode, String)> {
    let token = bearer_token_from_headers(headers)
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
    let session = db
        .find_session(&token)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "invalid session".to_string()))?;

    if session_is_expired(&session.expires_at) {
        return Err((StatusCode::UNAUTHORIZED, "session expired".to_string()));
    }

    let user = sqlx::query(
        r#"
        SELECT id, email, password_hash, auth_provider, google_sub, display_name, created_at::text as created_at
        FROM users
        WHERE id = $1
        LIMIT 1
        "#,
    )
    .bind(&session.user_id)
    .fetch_optional(&db.pool)
    .await
    .map_err(internal_error)
    .map_err(status_to_http)?
    .map(|row| UserRecord {
        id: row.try_get("id").unwrap_or_default(),
        email: row.try_get("email").unwrap_or_default(),
        password_hash: row.try_get("password_hash").unwrap_or(None),
        auth_provider: row.try_get("auth_provider").unwrap_or_default(),
        google_sub: row.try_get("google_sub").unwrap_or(None),
        display_name: row.try_get("display_name").unwrap_or_default(),
        created_at: row.try_get("created_at").unwrap_or_default(),
    })
    .ok_or_else(|| (StatusCode::UNAUTHORIZED, "user for session not found".to_string()))?;

    Ok(user)
}

pub(super) async fn optional_authenticated_user(
    db: &Db,
    headers: &HeaderMap,
) -> Result<Option<UserRecord>, (StatusCode, String)> {
    if bearer_token_from_headers(headers).is_none() {
        return Ok(None);
    }
    authenticated_user(db, headers).await.map(Some)
}

pub(super) fn bearer_token_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .and_then(|header| header.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(super) fn merge_thread_messages(
    private_messages: Vec<crate::afp::Message>,
    public_messages: Vec<crate::afp::Message>,
) -> Vec<crate::afp::Message> {
    let mut merged = Vec::with_capacity(private_messages.len() + public_messages.len());
    let mut seen = std::collections::HashSet::new();

    for message in private_messages
        .into_iter()
        .chain(public_messages.into_iter())
    {
        if seen.insert(message.id.clone()) {
            merged.push(message);
        }
    }

    merged.sort_by(|a, b| a.timestamp.cmp(&b.timestamp).then_with(|| a.id.cmp(&b.id)));
    merged
}

pub(super) async fn thread_messages_for_headers(
    db: &Db,
    headers: &HeaderMap,
    thread_id: &str,
) -> Result<Vec<crate::afp::Message>, (StatusCode, String)> {
    if let Some(user) = optional_authenticated_user(db, headers).await? {
        let private_messages = db
            .get_private_thread(&user.id, thread_id)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        let public_messages = db
            .get_thread(thread_id)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
        return Ok(merge_thread_messages(private_messages, public_messages));
    }

    db.get_thread(thread_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)
}

pub(super) async fn store_private_app_message(
    db: &Db,
    metrics: &Arc<crate::metrics::Metrics>,
    relay_tx: &tokio::sync::broadcast::Sender<String>,
    owner_user_id: &str,
    message: AFPMessage,
) -> Result<(), Status> {
    let proto = super::app_to_proto(message);
    if !super::validate_proto_message(&proto) {
        return Err(Status::invalid_argument("Invalid AFP message"));
    }

    let content_json: Value = serde_json::from_str(&proto.content)
        .map_err(|_| Status::invalid_argument("Message content must be valid JSON"))?;

    let inserted = db
        .store_private_message(owner_user_id, &proto, content_json)
        .await
        .map_err(internal_error)?;

    if inserted {
        metrics.inc_messages_stored();
        let _ = relay_tx.send(
            serde_json::json!({
                "event": "message_stored",
                "message_id": proto.id,
                "thread_id": proto.thread_id,
                "type": proto.r#type
            })
            .to_string(),
        );
    } else {
        metrics.inc_messages_replayed();
    }

    Ok(())
}

pub(super) async fn store_app_message_for_headers(
    db: &Db,
    metrics: &Arc<crate::metrics::Metrics>,
    relay_tx: &tokio::sync::broadcast::Sender<String>,
    headers: &HeaderMap,
    message: AFPMessage,
) -> Result<String, (StatusCode, String)> {
    let message_id = message.id.clone();
    if let Some(user) = optional_authenticated_user(db, headers).await? {
        store_private_app_message(db, metrics, relay_tx, &user.id, message)
            .await
            .map_err(status_to_http)?;
    } else {
        super::store_proto_message(db, metrics, relay_tx, super::app_to_proto(message))
            .await
            .map_err(status_to_http)?;
    }
    Ok(message_id)
}

pub(super) async fn append_private_task_status_trace(
    db: &Db,
    metrics: &Arc<crate::metrics::Metrics>,
    relay_tx: &tokio::sync::broadcast::Sender<String>,
    owner_user_id: &str,
    task_id: &str,
    status: &str,
    rationale: &str,
) -> Result<(), (StatusCode, String)> {
    let task = db
        .get_agent_task(owner_user_id, task_id)
        .await
        .map_err(super::task_update_error_to_http)?;
    let Some(thread_id) = task
        .get("thread_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    else {
        return Ok(());
    };

    let sender = task
        .get("agent_instance_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("omnyid://runner/{value}"))
        .unwrap_or_else(|| format!("omnyid://runner/{task_id}"));
    let intent = task
        .get("intent")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    if let Ok(msg) = new_server_message(
        sender,
        vec![],
        thread_id.to_string(),
        "agent_message",
        serde_json::json!({
            "task_id": task_id,
            "status": status,
            "intent": intent,
            "rationale": rationale,
        }),
        vec![],
        vec![],
        vec![],
        true,
    ) {
        let _ = store_private_app_message(db, metrics, relay_tx, owner_user_id, msg)
            .await
            .map_err(status_to_http)?;
    }

    Ok(())
}

pub(super) async fn enforce_rate_limit(
    state: &AppState,
    key: String,
    policy: RateLimitPolicy,
) -> Result<(), (StatusCode, String)> {
    if state.rate_limiter.allow(key, policy).await {
        return Ok(());
    }

    state.metrics.inc_rate_limited_requests();
    Err((
        StatusCode::TOO_MANY_REQUESTS,
        "too many requests, please try again shortly".to_string(),
    ))
}

pub(super) fn public_rate_limit_key(scope: &str, headers: &HeaderMap) -> String {
    format!("public:{scope}:{}", request_ip_identity(headers))
}

pub(super) fn authenticated_rate_limit_key(scope: &str, headers: &HeaderMap) -> String {
    let identity = bearer_token_from_headers(headers)
        .map(|token| format!("session:{}", super::runtime_token_preview(&token)))
        .unwrap_or_else(|| format!("ip:{}", request_ip_identity(headers)));
    format!("auth:{scope}:{identity}")
}

pub(super) fn request_ip_identity(headers: &HeaderMap) -> String {
    forwarded_header_identity(headers, "x-forwarded-for")
        .or_else(|| forwarded_header_identity(headers, "cf-connecting-ip"))
        .or_else(|| forwarded_header_identity(headers, "x-real-ip"))
        .unwrap_or_else(|| "unknown".to_string())
}

pub(super) fn forwarded_header_identity(headers: &HeaderMap, header_name: &str) -> Option<String> {
    headers
        .get(header_name)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            value.split(',').find_map(|candidate| {
                let trimmed = candidate.trim();
                (!trimmed.is_empty()).then(|| trimmed.to_string())
            })
        })
}

async fn create_session_for_user(db: &Db, user: &UserRecord) -> Result<AuthSessionRecord, String> {
    db.ensure_user_private_schema(&user.id)
        .await
        .map_err(|err| err.to_string())?;
    let session = AuthSessionRecord {
        token: random_token(),
        user_id: user.id.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        expires_at: (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339(),
    };
    db.create_session(&session)
        .await
        .map_err(|err| err.to_string())?;
    Ok(session)
}

pub(super) fn random_token() -> String {
    let mut bytes = [0u8; 24];
    rand::rng().fill(&mut bytes);
    hex::encode(bytes)
}

pub(super) fn session_is_expired(expires_at: &str) -> bool {
    parse_datetime_to_utc(expires_at)
        .map(|expires| expires < chrono::Utc::now())
        .unwrap_or(true)
}

pub(super) fn parse_datetime_to_utc(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
        .ok()
        .or_else(|| {
            chrono::DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f%#z")
                .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
                .ok()
        })
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|err| err.to_string())
}

fn verify_password(password_hash: &str, password: &str) -> Result<bool, String> {
    let parsed_hash = PasswordHash::new(password_hash).map_err(|err| err.to_string())?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

async fn verify_google_id_token(id_token: &str) -> Result<GoogleTokenInfoResponse, String> {
    let client_id = std::env::var("OMNYID_GOOGLE_CLIENT_ID").unwrap_or_else(|_| {
        "975613409177-nv214f97lors4g5j2dcvuftv5pf9c88p.apps.googleusercontent.com".to_string()
    });
    let response = reqwest::Client::new()
        .get("https://oauth2.googleapis.com/tokeninfo")
        .query(&[("id_token", id_token)])
        .send()
        .await
        .map_err(|err| format!("Google token verification failed: {err}"))?;
    if !response.status().is_success() {
        return Err("Google sign-in was rejected".to_string());
    }
    let token_info = response
        .json::<GoogleTokenInfoResponse>()
        .await
        .map_err(|err| format!("Google token payload was invalid: {err}"))?;
    if token_info.aud != client_id {
        return Err("Google token audience does not match Omnyid".to_string());
    }
    if token_info.email_verified.as_deref() != Some("true") {
        return Err("Google account email is not verified".to_string());
    }
    Ok(token_info)
}

pub(super) async fn ensure_user_agents_and_demo_seed(
    state: &Arc<AppState>,
    user: &UserRecord,
) -> Result<(), String> {
    let existing_agents = state
        .db
        .list_managed_agents_by_user(&user.id)
        .await
        .map_err(|err| err.to_string())?;
    if !existing_agents.is_empty() {
        return Ok(());
    }

    let primary_local = email_localpart_slug(&user.email);
    let primary_agent = ManagedAgentRecord {
        id: Ulid::new().to_string(),
        owner_user_id: user.id.clone(),
        agent_id: format!("agent:{}-{}@omnyid.com", primary_local, &user.id[..8]),
        label: "Primary agent".to_string(),
        email: user.email.clone(),
        kind: "managed".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        metadata: serde_json::json!({"origin":"account_registration"}),
    };
    let alpha_agent = ManagedAgentRecord {
        id: Ulid::new().to_string(),
        owner_user_id: user.id.clone(),
        agent_id: format!("agent:test-alpha-{}@omnyid.com", &user.id[..8]),
        label: "Test agent alpha".to_string(),
        email: format!("alpha+{}@omnyid.com", &user.id[..8]),
        kind: "demo".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        metadata: serde_json::json!({"role":"demo_sender"}),
    };
    let beta_agent = ManagedAgentRecord {
        id: Ulid::new().to_string(),
        owner_user_id: user.id.clone(),
        agent_id: format!("agent:test-beta-{}@omnyid.com", &user.id[..8]),
        label: "Test agent beta".to_string(),
        email: format!("beta+{}@omnyid.com", &user.id[..8]),
        kind: "demo".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        metadata: serde_json::json!({"role":"demo_recipient"}),
    };

    for agent in [&primary_agent, &alpha_agent, &beta_agent] {
        state
            .db
            .upsert_managed_agent(agent)
            .await
            .map_err(|err| err.to_string())?;
    }

    let thread_id = demo_thread_id(&user.id);
    let intro_messages = vec![
        new_server_message(
            alpha_agent.agent_id.clone(),
            vec![beta_agent.agent_id.clone()],
            thread_id.clone(),
            "agent_message",
            serde_json::json!({
                "body": format!("Hello {}, alpha is online and ready to relay through Omnyid.", user.display_name),
                "kind": "demo_seed"
            }),
            vec![serde_json::json!({
                "format": "email",
                "content": {
                    "subject": "Alpha boot sequence",
                    "body": format!("Hello {}, alpha is online and ready to relay through Omnyid.", user.display_name)
                }
            })],
            vec![],
            vec![],
            true,
        )?,
        new_server_message(
            beta_agent.agent_id.clone(),
            vec![alpha_agent.agent_id.clone()],
            thread_id.clone(),
            "agent_message",
            serde_json::json!({
                "body": "Beta acknowledged. You can now send secure test messages between your demo agents.",
                "kind": "demo_seed"
            }),
            vec![serde_json::json!({
                "format": "email",
                "content": {
                    "subject": "Beta acknowledged",
                    "body": "Beta acknowledged. You can now send secure test messages between your demo agents."
                }
            })],
            vec![],
            vec![],
            true,
        )?,
    ];

    for message in intro_messages {
        store_private_app_message(
            &state.db,
            &state.metrics,
            &state.relay_tx,
            &user.id,
            message,
        )
        .await
        .map_err(|err| err.message().to_string())?;
    }

    // Provision master AgentInstance with soul.md
    let master_instance =
        crate::agent_template::AgentInstance::provision(&user.id, &user.display_name, "omnyid.com");
    state
        .db
        .save_master_agent_instance(&master_instance)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

pub(super) fn new_server_message(
    from: String,
    to: Vec<String>,
    thread_id: String,
    message_type: &str,
    content: Value,
    views: Vec<Value>,
    references: Vec<Value>,
    attachments: Vec<Value>,
    store_in_relational: bool,
) -> Result<AFPMessage, String> {
    let encryption_key = super::env_hex_32("OMNYID_ENCRYPTION_KEY_HEX")?.ok_or_else(|| {
        "OMNYID_ENCRYPTION_KEY_HEX must be configured for server-generated messages".to_string()
    })?;
    let (normalized_type, normalized_subtype, normalized_metadata) =
        normalized_server_message_taxonomy(message_type);
    let message_id = Ulid::new().to_string();
    let timestamp = chrono::Utc::now().to_rfc3339();
    let aad = serde_json::json!({
        "id": message_id,
        "thread_id": thread_id,
        "from": from,
        "to": to,
        "type": normalized_type,
        "subtype": normalized_subtype,
        "metadata": normalized_metadata,
        "timestamp": timestamp,
    });
    let encryption = crate::crypto::encrypt_content(&content, &aad, &encryption_key);
    let _views = views;
    let mut message = AFPMessage {
        protocol: "afp-v1".to_string(),
        id: aad
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        thread_id: aad
            .get("thread_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        parent_id: None,
        from: aad
            .get("from")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        to: aad
            .get("to")
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        timestamp: aad
            .get("timestamp")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        r#type: normalized_type.to_string(),
        subtype: (!normalized_subtype.is_empty()).then(|| normalized_subtype.to_string()),
        content,
        metadata: if normalized_metadata.is_null() {
            None
        } else {
            Some(normalized_metadata)
        },
        signature: String::new(),
        encryption: Some(encryption),
        views: vec![],
        references,
        attachments,
        store_in_relational,
        prev_hash: None,
    };
    super::sign_server_generated_message(&mut message)?;
    Ok(message)
}

pub(super) fn normalized_server_message_taxonomy(message_type: &str) -> (&str, &str, Value) {
    match message_type {
        "agent_provisioned" => (
            "agent",
            "provisioned",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_plan" => (
            "agent",
            "plan",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_step" => (
            "agent",
            "step",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_result" => (
            "agent",
            "result",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_research_result" => (
            "agent",
            "research_result",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_approval_request" => (
            "agent",
            "approval_request",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_approval_granted" => (
            "agent",
            "approval_granted",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_approval_rejected" => (
            "agent",
            "approval_rejected",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_trigger_request" => (
            "agent",
            "trigger_request",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_trigger_dispatch" => (
            "agent",
            "trigger_dispatch",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_event_dispatch" => (
            "agent",
            "event_dispatch",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_wake_request" => (
            "agent",
            "wake_request",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_wake_result" => (
            "agent",
            "wake_result",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_conflict_detected" => (
            "agent",
            "conflict_detected",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_escalation" => (
            "agent",
            "escalation",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_triage" => (
            "agent",
            "triage",
            serde_json::json!({"legacy_type": message_type}),
        ),
        "agent_message" => (
            "agent",
            "message",
            serde_json::json!({"legacy_type": message_type}),
        ),
        _ => (message_type, "", Value::Null),
    }
}

pub(super) fn demo_thread_id(user_id: &str) -> String {
    format!("thread.demo.{}", user_id)
}

pub(super) fn email_localpart_slug(email: &str) -> String {
    email
        .split('@')
        .next()
        .unwrap_or("agent")
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

pub(super) fn session_user_response(user: &UserRecord) -> SessionUserResponse {
    SessionUserResponse {
        id: user.id.clone(),
        email: user.email.clone(),
        display_name: user.display_name.clone(),
        auth_provider: user.auth_provider.clone(),
    }
}

pub(super) fn cors_layer() -> CorsLayer {
    let origins = allowed_cors_origins();
    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
        ])
}

pub(super) fn allowed_cors_origins() -> Vec<HeaderValue> {
    let configured = std::env::var("OMNYID_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| {
            "https://omnyid.com,https://cloud.omnyid.com,http://localhost:3000,http://127.0.0.1:3000".to_string()
        });

    configured
        .split(',')
        .filter_map(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                HeaderValue::from_str(trimmed).ok()
            }
        })
        .collect()
}

// ── Passkey registration ───────────────────────────────────────────────────────

/// POST /auth/passkey/register/begin
///
/// Returns a `RegistrationOptions` JSON challenge for the browser's
/// `navigator.credentials.create()` call.  The challenge is stored in the
/// user's session record (field `passkey_challenge`) for verification in /finish.
pub(super) async fn passkey_register_begin_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let rp_id = std::env::var("OMNYID_RP_ID").unwrap_or_else(|_| "omnyid.com".to_string());
    let req = crate::webauthn::RegistrationRequest {
        user_id: user.id.clone(),
        display_name: user.email.clone(),
    };
    let (opts, challenge) = crate::webauthn::registration_options(&req, &rp_id, "Omnyid");
    // Store challenge on session for the /finish step
    state
        .db
        .store_passkey_challenge(&user.id, &challenge, "register")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::to_value(opts).unwrap_or_default()))
}

/// POST /auth/passkey/register/finish
///
/// Verifies the browser's attestation response and stores the new credential.
pub(super) async fn passkey_register_finish_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(finish): Json<crate::webauthn::RegistrationFinish>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let origin =
        std::env::var("OMNYID_ORIGIN").unwrap_or_else(|_| "https://omnyid.com".to_string());

    let challenge = state
        .db
        .get_passkey_challenge(&user.id, "register")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((
            StatusCode::BAD_REQUEST,
            "no pending challenge — call /begin first".to_string(),
        ))?;

    crate::webauthn::verify_registration_client_data(&finish.client_data_json, &challenge, &origin)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let cred = crate::webauthn::build_stored_credential(&finish, &finish.client_data_json);
    state
        .db
        .store_passkey_credential(&cred)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    state
        .db
        .clear_passkey_challenge(&user.id, "register")
        .await
        .ok();

    Ok(Json(
        serde_json::json!({"registered": true, "credential_id": cred.credential_id}),
    ))
}

/// POST /auth/passkey/authenticate/begin
///
/// Returns authentication options for the browser's `navigator.credentials.get()`.
#[derive(serde::Deserialize)]
pub(super) struct PasskeyAuthBeginRequest {
    pub(super) user_id: String,
}

pub(super) async fn passkey_authenticate_begin_http(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PasskeyAuthBeginRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let rp_id = std::env::var("OMNYID_RP_ID").unwrap_or_else(|_| "omnyid.com".to_string());
    let creds = state
        .db
        .list_passkey_credentials(&body.user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let (opts, challenge) = crate::webauthn::authentication_options(&creds, &rp_id);
    state
        .db
        .store_passkey_challenge(&body.user_id, &challenge, "authenticate")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::to_value(opts).unwrap_or_default()))
}

/// POST /auth/passkey/authenticate/finish
///
/// Verifies the assertion and issues a new session token on success.
pub(super) async fn passkey_authenticate_finish_http(
    State(state): State<Arc<AppState>>,
    Json(finish): Json<crate::webauthn::AuthenticationFinish>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let origin =
        std::env::var("OMNYID_ORIGIN").unwrap_or_else(|_| "https://omnyid.com".to_string());
    let rp_id = std::env::var("OMNYID_RP_ID").unwrap_or_else(|_| "omnyid.com".to_string());

    let challenge = state
        .db
        .get_passkey_challenge(&finish.user_id, "authenticate")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((StatusCode::BAD_REQUEST, "no pending challenge".to_string()))?;

    crate::webauthn::verify_authentication_client_data(
        &finish.client_data_json,
        &challenge,
        &origin,
    )
    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let sign_count =
        crate::webauthn::verify_authenticator_data(&finish.authenticator_data, &rp_id, true)
            .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let cred = state
        .db
        .get_passkey_credential(&finish.credential_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((StatusCode::UNAUTHORIZED, "credential not found".to_string()))?;

    crate::webauthn::verify_sign_count(cred.sign_count, sign_count)
        .map_err(|e| (StatusCode::UNAUTHORIZED, e.to_string()))?;

    state
        .db
        .update_passkey_sign_count(&finish.credential_id, sign_count)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    state
        .db
        .clear_passkey_challenge(&finish.user_id, "authenticate")
        .await
        .ok();

    // Issue a short-lived session token for this device
    let session = state
        .db
        .create_session_for_passkey(&cred.user_id, "passkey")
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "authenticated": true,
        "session_token": session,
        "user_id": cred.user_id,
    })))
}
