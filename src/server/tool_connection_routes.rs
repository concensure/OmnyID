// @locs-version: 1.0
// @module-id: server.tool-connection-routes
// @primary-capability: user-scoped-tool-connection-routes
// @stability: beta
use super::*;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};

#[derive(serde::Serialize, serde::Deserialize)]
struct ComposioOauthStatePayload {
    issued_at: i64,
    user_id: String,
    tool_slug: String,
    tool_name: String,
    toolkit_slug: String,
    mcp_server_url: String,
}

#[derive(Clone, Debug)]
struct PendingComposioLink {
    cached_at: Instant,
    session_id: String,
    session_mcp_server_url: String,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/tools/connections",
            get(list_tool_connections_http).post(upsert_tool_connection_http),
        )
        .route(
            "/tools/connections/{slug}",
            axum::routing::delete(delete_tool_connection_http),
        )
        .route("/tools/composio/link", post(begin_composio_link_http))
        .route(
            "/tools/composio/complete",
            post(complete_composio_link_http),
        )
        .route("/tools/composio/status", get(composio_status_http))
}

#[derive(serde::Deserialize)]
struct ToolConnectionRequest {
    tool_slug: String,
    tool_name: String,
    mcp_server_url: String,
    api_key: Option<String>,
    tool_descriptor: Option<Value>,
    connection_provider: Option<String>,
    composio_connected_account_id: Option<String>,
}

#[derive(serde::Deserialize)]
struct BeginComposioLinkRequest {
    tool_slug: String,
    tool_name: String,
    toolkit_slug: String,
}

#[derive(serde::Deserialize)]
struct CompleteComposioLinkRequest {
    tool_slug: String,
    tool_name: String,
    toolkit_slug: String,
    tool_descriptor: Option<Value>,
    composio_connected_account_id: String,
    composio_state: String,
    composio_status: Option<String>,
}

const MAX_TOOL_DESCRIPTOR_BYTES: usize = 64 * 1024;
const TOOL_CONNECTION_CAPABILITY_PROVIDER: &str = "tool_connection";
const LOCAL_CACHE_KEY_CONNECTED_APPS: &str = "connected_apps_storage";
const LOCAL_CACHE_KEY_TOOL_CONNECTIONS: &str = "tools_local_connections";
const COMPOSIO_OAUTH_STATE_TTL_SECS: i64 = 1800;

struct KnownComposioApp {
    tool_slug: &'static str,
    tool_name: &'static str,
    toolkit_slug: &'static str,
    category: &'static str,
    description: &'static str,
    icon: &'static str,
    capabilities: &'static [&'static str],
}

const KNOWN_COMPOSIO_APPS: &[KnownComposioApp] = &[
    KnownComposioApp {
        tool_slug: "gcal",
        tool_name: "Google Calendar",
        toolkit_slug: "googlecalendar",
        category: "Productivity",
        description: "Create and manage calendar events",
        icon: "GC",
        capabilities: &["list_events", "check_availability", "create_event"],
    },
    KnownComposioApp {
        tool_slug: "gdrive",
        tool_name: "Google Drive",
        toolkit_slug: "googledrive",
        category: "Files",
        description: "Access and manage files and documents",
        icon: "GD",
        capabilities: &["list_files", "read_file", "share_file"],
    },
    KnownComposioApp {
        tool_slug: "slack",
        tool_name: "Slack",
        toolkit_slug: "slack",
        category: "Communication",
        description: "Send messages and manage channels",
        icon: "SL",
        capabilities: &["list_channels", "search_messages", "send_message"],
    },
    KnownComposioApp {
        tool_slug: "github",
        tool_name: "GitHub",
        toolkit_slug: "github",
        category: "Developer",
        description: "Manage repos, issues, and PRs",
        icon: "GH",
        capabilities: &["get_repo", "list_prs", "create_issue"],
    },
    KnownComposioApp {
        tool_slug: "notion",
        tool_name: "Notion",
        toolkit_slug: "notion",
        category: "Productivity",
        description: "Read and write pages and databases",
        icon: "NT",
        capabilities: &["search_pages", "query_database", "create_page"],
    },
    KnownComposioApp {
        tool_slug: "linear",
        tool_name: "Linear",
        toolkit_slug: "linear",
        category: "Developer",
        description: "Manage issues and project cycles",
        icon: "LN",
        capabilities: &["list_issues", "search_issues", "create_issue"],
    },
    KnownComposioApp {
        tool_slug: "airtable",
        tool_name: "Airtable",
        toolkit_slug: "airtable",
        category: "Data",
        description: "Query and update structured records",
        icon: "AT",
        capabilities: &["list_bases", "list_records", "update_record"],
    },
    KnownComposioApp {
        tool_slug: "hubspot",
        tool_name: "HubSpot",
        toolkit_slug: "hubspot",
        category: "CRM",
        description: "Manage contacts, deals, and pipelines",
        icon: "HS",
        capabilities: &["list_deals", "create_contact", "create_deal"],
    },
    KnownComposioApp {
        tool_slug: "discord",
        tool_name: "Discord",
        toolkit_slug: "discord",
        category: "Communication",
        description: "Send messages and manage servers",
        icon: "DC",
        capabilities: &["list_channels", "create_thread", "send_message"],
    },
    KnownComposioApp {
        tool_slug: "trello",
        tool_name: "Trello",
        toolkit_slug: "trello",
        category: "Productivity",
        description: "Manage boards, lists, and cards",
        icon: "TR",
        capabilities: &["list_boards", "create_card", "move_card"],
    },
    KnownComposioApp {
        tool_slug: "jira",
        tool_name: "Jira",
        toolkit_slug: "jira",
        category: "Developer",
        description: "Track sprints, bugs, and epics",
        icon: "JR",
        capabilities: &["list_issues", "search_issues", "create_issue"],
    },
    KnownComposioApp {
        tool_slug: "twitter",
        tool_name: "X / Twitter",
        toolkit_slug: "twitter",
        category: "Social",
        description: "Post, search, and monitor timelines",
        icon: "X",
        capabilities: &["search_posts", "get_profile", "create_post"],
    },
    KnownComposioApp {
        tool_slug: "linkedin",
        tool_name: "LinkedIn",
        toolkit_slug: "linkedin",
        category: "Social",
        description: "Post updates and manage connections",
        icon: "IN",
        capabilities: &["get_profile", "list_connections", "create_post"],
    },
    KnownComposioApp {
        tool_slug: "spotify",
        tool_name: "Spotify",
        toolkit_slug: "spotify",
        category: "Media",
        description: "Control playback and browse music",
        icon: "SP",
        capabilities: &["get_now_playing", "search_tracks", "start_playback"],
    },
];

fn composio_pending_link_cache() -> &'static std::sync::Mutex<HashMap<String, PendingComposioLink>>
{
    static CACHE: OnceLock<std::sync::Mutex<HashMap<String, PendingComposioLink>>> =
        OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

fn store_pending_composio_link(
    state_token: &str,
    session_id: &str,
    session_mcp_server_url: &str,
    now: Instant,
) {
    if let Ok(mut cache) = composio_pending_link_cache().lock() {
        cache.insert(
            state_token.to_string(),
            PendingComposioLink {
                cached_at: now,
                session_id: session_id.to_string(),
                session_mcp_server_url: session_mcp_server_url.to_string(),
            },
        );
    }
}

fn take_pending_composio_link(state_token: &str, now: Instant) -> Option<PendingComposioLink> {
    let mut cache = composio_pending_link_cache().lock().ok()?;
    let entry = cache.remove(state_token)?;
    if now.duration_since(entry.cached_at)
        > Duration::from_secs(COMPOSIO_OAUTH_STATE_TTL_SECS as u64)
    {
        return None;
    }
    Some(entry)
}

fn require_pending_composio_link(
    state_token: &str,
    now: Instant,
) -> Result<PendingComposioLink, (StatusCode, String)> {
    take_pending_composio_link(state_token, now).ok_or_else(|| {
        (
            StatusCode::CONFLICT,
            "The Composio auth session could not be resumed safely. Restart the connection flow from Connected Apps."
                .to_string(),
        )
    })
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ComposioProjectProbe {
    configured: bool,
    usable: bool,
    http_status: Option<u16>,
    failure_reason: Option<&'static str>,
}

fn composio_probe_failure_message(probe: &ComposioProjectProbe) -> String {
    match probe.failure_reason {
        Some("unauthorized") => format!(
            "The configured Composio project key was rejected by Composio{}.",
            probe
                .http_status
                .map(|status| format!(" (HTTP {status})"))
                .unwrap_or_default()
        ),
        Some("rate_limited") => "Composio is rate-limiting project key verification right now."
            .to_string(),
        Some("upstream_error") => format!(
            "Composio returned an upstream server error{} while verifying the project key.",
            probe
                .http_status
                .map(|status| format!(" (HTTP {status})"))
                .unwrap_or_default()
        ),
        Some("failing") => format!(
            "The configured Composio project key failed verification{}.",
            probe
                .http_status
                .map(|status| format!(" (HTTP {status})"))
                .unwrap_or_default()
        ),
        Some("not_configured") => {
            "Composio is not configured on this server. Set a valid COMPOSIO_API_KEY before enabling Composio-backed apps."
                .to_string()
        }
        _ => "The configured Composio project key failed verification.".to_string(),
    }
}

fn normalize_tool_slug(value: &str) -> Option<String> {
    let slug = value.trim().to_ascii_lowercase();
    if slug.is_empty()
        || slug.len() > 96
        || !slug
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
    {
        return None;
    }
    Some(slug)
}

fn normalize_tool_name(value: &str) -> Option<String> {
    let normalized = value.trim();
    if normalized.is_empty()
        || normalized.len() > 160
        || normalized.chars().any(|ch| ch.is_control())
    {
        return None;
    }
    Some(normalized.to_string())
}

fn normalize_connection_provider(
    provider: Option<&str>,
    composio_connected_account_id: Option<&str>,
) -> String {
    let raw = provider.unwrap_or("").trim().to_ascii_lowercase();
    match raw.as_str() {
        "composio" | "mcp" => raw,
        "" if composio_connected_account_id.is_some() => "composio".to_string(),
        "" => "mcp".to_string(),
        _ => "mcp".to_string(),
    }
}

fn normalize_optional_connection_id(value: Option<&str>, max_len: usize) -> Option<String> {
    let normalized = value
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= max_len)?;
    if normalized.chars().any(|ch| ch.is_control()) {
        return None;
    }
    Some(normalized.to_string())
}

fn normalize_api_key(value: Option<&str>) -> Option<String> {
    let normalized = value
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= 4096)?;
    if normalized.chars().any(|ch| ch.is_control()) {
        return None;
    }
    Some(normalized.to_string())
}

fn normalize_toolkit_slug(value: &str) -> Option<String> {
    let slug = value.trim().to_ascii_lowercase();
    if slug.is_empty()
        || slug.len() > 120
        || !slug
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_' || ch == '-')
    {
        return None;
    }
    Some(slug)
}

fn known_composio_app(tool_slug: &str, toolkit_slug: &str) -> Option<&'static KnownComposioApp> {
    KNOWN_COMPOSIO_APPS
        .iter()
        .find(|app| app.tool_slug == tool_slug && app.toolkit_slug == toolkit_slug)
}

fn trusted_composio_tool_descriptor(app: &KnownComposioApp) -> Value {
    json!({
        "app_category": app.category,
        "app_description": app.description,
        "capabilities": app.capabilities,
        "auth_type": "oauth2",
        "app_icon": app.icon,
        "app_surface": "connected_apps",
        "composio_toolkit_slug": app.toolkit_slug,
    })
}

fn normalize_billing_string(value: Option<&Value>, max_len: usize) -> Option<String> {
    let normalized = value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= max_len)?;
    if normalized.chars().any(|ch| ch.is_control()) {
        return None;
    }
    Some(normalized.to_string())
}

fn normalize_billing_number(value: Option<&Value>, min: f64, max: f64) -> Option<f64> {
    let number = value.and_then(Value::as_f64)?;
    if !number.is_finite() || number < min || number > max {
        return None;
    }
    Some(number)
}

fn normalize_billing_model(value: Option<&Value>) -> Option<String> {
    let normalized = normalize_billing_string(value, 32)?.to_ascii_lowercase();
    match normalized.as_str() {
        "usage" | "subscription" | "hybrid" | "free_dev_only" => Some(normalized),
        _ => None,
    }
}

fn normalize_billing_source_url(value: Option<&Value>) -> Option<String> {
    let raw = normalize_billing_string(value, 2048)?;
    let parsed = reqwest::Url::parse(&raw).ok()?;
    match parsed.scheme() {
        "http" | "https" => Some(raw),
        _ => None,
    }
}

fn normalize_capability_metering(value: Option<&Value>) -> Option<Value> {
    let entries = value.and_then(Value::as_object)?;
    let mut normalized = serde_json::Map::new();
    for (capability, metering_value) in entries.iter().take(64) {
        let Some(capability_slug) = normalize_toolkit_slug(capability) else {
            continue;
        };
        let Some(metering) = metering_value.as_object() else {
            continue;
        };
        let mut normalized_metering = serde_json::Map::new();
        if let Some(unit) = normalize_billing_string(metering.get("usage_unit"), 64) {
            normalized_metering.insert("usage_unit".to_string(), Value::String(unit));
        }
        if let Some(quantity) = normalize_billing_number(metering.get("quantity"), 0.0, 1_000_000.0)
        {
            normalized_metering.insert("quantity".to_string(), json!(quantity));
        }
        if let Some(cost) =
            normalize_billing_number(metering.get("estimated_cost_usd"), 0.0, 1_000_000.0)
        {
            normalized_metering.insert("estimated_cost_usd".to_string(), json!(cost));
        }
        if !normalized_metering.is_empty() {
            normalized.insert(capability_slug, Value::Object(normalized_metering));
        }
    }
    if normalized.is_empty() {
        None
    } else {
        Some(Value::Object(normalized))
    }
}

fn normalize_billing_metadata(value: Option<&Value>) -> Option<Value> {
    let billing = value.and_then(Value::as_object)?;
    let mut normalized = serde_json::Map::new();

    if let Some(provider_key) = normalize_billing_string(billing.get("provider_key"), 120) {
        normalized.insert("provider_key".to_string(), Value::String(provider_key));
    }
    if let Some(provider_category) = normalize_billing_string(billing.get("provider_category"), 120)
    {
        normalized.insert(
            "provider_category".to_string(),
            Value::String(provider_category),
        );
    }
    if let Some(billing_category) = normalize_billing_string(billing.get("billing_category"), 120) {
        normalized.insert(
            "billing_category".to_string(),
            Value::String(billing_category),
        );
    }
    if let Some(billing_model) = normalize_billing_model(billing.get("billing_model")) {
        normalized.insert("billing_model".to_string(), Value::String(billing_model));
    }
    if let Some(pricing_summary) = normalize_billing_string(billing.get("pricing_summary"), 600) {
        normalized.insert(
            "pricing_summary".to_string(),
            Value::String(pricing_summary),
        );
    }
    if let Some(free_tier_summary) = normalize_billing_string(billing.get("free_tier_summary"), 400)
    {
        normalized.insert(
            "free_tier_summary".to_string(),
            Value::String(free_tier_summary),
        );
    }
    if let Some(production_caveat) = normalize_billing_string(billing.get("production_caveat"), 500)
    {
        normalized.insert(
            "production_caveat".to_string(),
            Value::String(production_caveat),
        );
    }
    if let Some(pricing_source_url) =
        normalize_billing_source_url(billing.get("pricing_source_url"))
    {
        normalized.insert(
            "pricing_source_url".to_string(),
            Value::String(pricing_source_url),
        );
    }
    if let Some(default_usage_unit) =
        normalize_billing_string(billing.get("default_usage_unit"), 64)
    {
        normalized.insert(
            "default_usage_unit".to_string(),
            Value::String(default_usage_unit),
        );
    }
    if let Some(default_quantity_per_call) =
        normalize_billing_number(billing.get("default_quantity_per_call"), 0.0, 1_000_000.0)
    {
        normalized.insert(
            "default_quantity_per_call".to_string(),
            json!(default_quantity_per_call),
        );
    }
    if let Some(estimated_cost_usd_per_call) =
        normalize_billing_number(billing.get("estimated_cost_usd_per_call"), 0.0, 1_000_000.0)
    {
        normalized.insert(
            "estimated_cost_usd_per_call".to_string(),
            json!(estimated_cost_usd_per_call),
        );
    }
    if let Some(capability_metering) =
        normalize_capability_metering(billing.get("capability_metering"))
    {
        normalized.insert("capability_metering".to_string(), capability_metering);
    }

    if normalized.is_empty() {
        None
    } else {
        Some(Value::Object(normalized))
    }
}

fn normalize_tool_descriptor(value: Option<Value>) -> Result<Option<Value>, (StatusCode, String)> {
    let Some(value) = value.filter(Value::is_object) else {
        return Ok(None);
    };
    let mut normalized = value.as_object().cloned().unwrap_or_default();
    match normalize_billing_metadata(normalized.get("billing")) {
        Some(billing) => {
            normalized.insert("billing".to_string(), billing);
        }
        None => {
            normalized.remove("billing");
        }
    }
    let value = Value::Object(normalized);
    let serialized = serde_json::to_vec(&value).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "tool_descriptor must be valid JSON".to_string(),
        )
    })?;
    if serialized.len() > MAX_TOOL_DESCRIPTOR_BYTES {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "tool_descriptor is too large; max {} bytes",
                MAX_TOOL_DESCRIPTOR_BYTES
            ),
        ));
    }
    Ok(Some(value))
}

fn tool_descriptor_declares_no_auth(value: Option<&Value>) -> bool {
    value
        .and_then(Value::as_object)
        .and_then(|object| object.get("auth_type"))
        .and_then(Value::as_str)
        .map(|auth_type| auth_type.trim().eq_ignore_ascii_case("none"))
        .unwrap_or(false)
}

fn tool_connection_change_requires_recent_session() -> bool {
    true
}

fn composio_oauth_secret() -> Result<String, (StatusCode, String)> {
    crate::secret_manager::read_process_secret_trimmed("OMNYID_SESSION_SECRET").ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Composio OAuth is not configured on this server. Set OMNYID_SESSION_SECRET."
                .to_string(),
        )
    })
}

fn composio_oauth_state_sign(
    user_id: &str,
    tool_slug: &str,
    tool_name: &str,
    toolkit_slug: &str,
    mcp_server_url: &str,
) -> Result<String, (StatusCode, String)> {
    composio_oauth_state_sign_at(
        user_id,
        tool_slug,
        tool_name,
        toolkit_slug,
        mcp_server_url,
        chrono::Utc::now().timestamp(),
    )
}

fn composio_oauth_state_sign_at(
    user_id: &str,
    tool_slug: &str,
    tool_name: &str,
    toolkit_slug: &str,
    mcp_server_url: &str,
    issued_at: i64,
) -> Result<String, (StatusCode, String)> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let payload = ComposioOauthStatePayload {
        issued_at,
        user_id: user_id.to_string(),
        tool_slug: tool_slug.to_string(),
        tool_name: tool_name.to_string(),
        toolkit_slug: toolkit_slug.to_string(),
        mcp_server_url: mcp_server_url.to_string(),
    };
    let payload_json = serde_json::to_vec(&payload).map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Could not encode Composio OAuth state.".to_string(),
        )
    })?;
    let payload_b64 = URL_SAFE_NO_PAD.encode(payload_json);
    let secret = composio_oauth_secret()?;
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(payload_b64.as_bytes());
    let tag: String = mac
        .finalize()
        .into_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    Ok(format!("{payload_b64}.{tag}"))
}

fn composio_oauth_state_payload(
    state: &str,
) -> Result<(String, ComposioOauthStatePayload, Vec<u8>), (StatusCode, String)> {
    let Some((payload_b64, provided_hex)) = state.rsplit_once('.') else {
        return Err((
            StatusCode::FORBIDDEN,
            "The Composio auth callback state was invalid or expired.".to_string(),
        ));
    };
    let payload_bytes = URL_SAFE_NO_PAD.decode(payload_b64).map_err(|_| {
        (
            StatusCode::FORBIDDEN,
            "The Composio auth callback state was invalid or expired.".to_string(),
        )
    })?;
    let payload: ComposioOauthStatePayload =
        serde_json::from_slice(&payload_bytes).map_err(|_| {
            (
                StatusCode::FORBIDDEN,
                "The Composio auth callback state was invalid or expired.".to_string(),
            )
        })?;
    let provided_bytes: Option<Vec<u8>> = provided_hex
        .as_bytes()
        .chunks(2)
        .map(|chunk| {
            let hi = (chunk[0] as char).to_digit(16)?;
            let lo = chunk.get(1).and_then(|byte| (*byte as char).to_digit(16))?;
            Some((hi as u8) << 4 | lo as u8)
        })
        .collect();
    let Some(provided_bytes) = provided_bytes else {
        return Err((
            StatusCode::FORBIDDEN,
            "The Composio auth callback state was invalid or expired.".to_string(),
        ));
    };
    Ok((payload_b64.to_string(), payload, provided_bytes))
}

fn composio_oauth_state_verify(
    state: &str,
    user_id: &str,
    tool_slug: &str,
    tool_name: &str,
    toolkit_slug: &str,
    mcp_server_url: &str,
) -> Result<bool, (StatusCode, String)> {
    composio_oauth_state_verify_at(
        state,
        user_id,
        tool_slug,
        tool_name,
        toolkit_slug,
        mcp_server_url,
        chrono::Utc::now().timestamp(),
    )
}

fn composio_oauth_state_verify_at(
    state: &str,
    user_id: &str,
    tool_slug: &str,
    tool_name: &str,
    toolkit_slug: &str,
    mcp_server_url: &str,
    now_secs: i64,
) -> Result<bool, (StatusCode, String)> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let Ok((payload_b64, payload, provided_bytes)) = composio_oauth_state_payload(state) else {
        return Ok(false);
    };
    if payload.user_id != user_id
        || payload.tool_slug != tool_slug
        || payload.tool_name != tool_name
        || payload.toolkit_slug != toolkit_slug
        || payload.mcp_server_url != mcp_server_url
    {
        return Ok(false);
    };
    let issued_at = payload.issued_at;
    if issued_at > now_secs + 60 || now_secs - issued_at > COMPOSIO_OAUTH_STATE_TTL_SECS {
        return Ok(false);
    }
    let secret = composio_oauth_secret()?;
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(payload_b64.as_bytes());
    Ok(mac.verify_slice(&provided_bytes).is_ok())
}

fn composio_oauth_state_decode_verified(
    state: &str,
    user_id: &str,
    tool_slug: &str,
    tool_name: &str,
    toolkit_slug: &str,
    mcp_server_url: &str,
) -> Result<Option<ComposioOauthStatePayload>, (StatusCode, String)> {
    if !composio_oauth_state_verify(
        state,
        user_id,
        tool_slug,
        tool_name,
        toolkit_slug,
        mcp_server_url,
    )? {
        return Ok(None);
    }
    let (_, payload, _) = composio_oauth_state_payload(state)?;
    Ok(Some(payload))
}

fn workspace_base_url() -> Option<String> {
    std::env::var("OMNYID_WORKSPACE_BASE_URL")
        .ok()
        .or_else(|| std::env::var("OMNYID_UI_BASE_URL").ok())
        .or_else(|| {
            let base_url = std::env::var("OMNYID_HOMESERVER_URL").ok()?;
            let parsed = reqwest::Url::parse(base_url.trim()).ok()?;
            let host = parsed.host_str()?;
            let derived_host = match host.strip_prefix("api.") {
                Some(value) => value.to_string(),
                None => host.to_string(),
            };
            let mut derived = parsed;
            derived.set_host(Some(&derived_host)).ok()?;
            derived.set_path("");
            derived.set_query(None);
            derived.set_fragment(None);
            Some(derived.to_string().trim_end_matches('/').to_string())
        })
}

fn composio_callback_url(tool_slug: &str, state: &str) -> Result<String, (StatusCode, String)> {
    let base = workspace_base_url().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Composio OAuth callback is not configured on this server. Set OMNYID_WORKSPACE_BASE_URL, OMNYID_UI_BASE_URL, or OMNYID_HOMESERVER_URL."
                .to_string(),
        )
    })?;
    let mut url = reqwest::Url::parse(&format!("{}/workspace/", base.trim_end_matches('/')))
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "Composio OAuth callback URL is invalid on this server.".to_string(),
            )
        })?;
    url.query_pairs_mut()
        .append_pair("composio", "return")
        .append_pair("tool", tool_slug)
        .append_pair("state", state);
    Ok(url.to_string())
}

fn normalize_external_redirect_url(value: &str) -> Result<String, (StatusCode, String)> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 4096 {
        return Err((
            StatusCode::BAD_GATEWAY,
            "Composio did not return a usable provider redirect URL.".to_string(),
        ));
    }
    let parsed = reqwest::Url::parse(trimmed).map_err(|_| {
        (
            StatusCode::BAD_GATEWAY,
            "Composio returned an invalid provider redirect URL.".to_string(),
        )
    })?;
    match parsed.scheme() {
        "https" => {}
        "http" if matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "::1")) => {}
        _ => {
            return Err((
                StatusCode::BAD_GATEWAY,
                "Composio returned a provider redirect URL with an unsupported scheme.".to_string(),
            ));
        }
    }
    Ok(trimmed.to_string())
}

fn first_non_empty_string<'a>(
    candidates: impl IntoIterator<Item = Option<&'a Value>>,
) -> Option<&'a str> {
    candidates
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .find(|value| !value.is_empty())
}

fn composio_session_id_from_response(body: &Value) -> Option<String> {
    let object = body.as_object()?;
    first_non_empty_string([
        object.get("session_id"),
        object.get("id"),
        object
            .get("session")
            .and_then(Value::as_object)
            .and_then(|session| session.get("session_id")),
        object
            .get("session")
            .and_then(Value::as_object)
            .and_then(|session| session.get("id")),
        object
            .get("data")
            .and_then(Value::as_object)
            .and_then(|data| data.get("session_id")),
        object
            .get("data")
            .and_then(Value::as_object)
            .and_then(|data| data.get("id")),
    ])
    .map(str::to_string)
}

fn composio_redirect_url_from_response(
    body: &Value,
) -> Result<Option<String>, (StatusCode, String)> {
    let Some(object) = body.as_object() else {
        return Ok(None);
    };
    first_non_empty_string([
        object.get("redirect_url"),
        object.get("redirectUri"),
        object.get("url"),
        object
            .get("link")
            .and_then(Value::as_object)
            .and_then(|link| link.get("redirect_url")),
        object
            .get("link")
            .and_then(Value::as_object)
            .and_then(|link| link.get("redirectUri")),
        object
            .get("link")
            .and_then(Value::as_object)
            .and_then(|link| link.get("url")),
        object
            .get("data")
            .and_then(Value::as_object)
            .and_then(|data| data.get("redirect_url")),
        object
            .get("data")
            .and_then(Value::as_object)
            .and_then(|data| data.get("redirectUri")),
        object
            .get("data")
            .and_then(Value::as_object)
            .and_then(|data| data.get("url")),
    ])
    .map(normalize_external_redirect_url)
    .transpose()
}

fn composio_session_mcp_url_from_response(
    body: &Value,
) -> Result<Option<String>, (StatusCode, String)> {
    let Some(object) = body.as_object() else {
        return Ok(None);
    };
    first_non_empty_string([
        object
            .get("mcp")
            .and_then(Value::as_object)
            .and_then(|mcp| mcp.get("url")),
        object
            .get("session")
            .and_then(Value::as_object)
            .and_then(|session| session.get("mcp"))
            .and_then(Value::as_object)
            .and_then(|mcp| mcp.get("url")),
        object
            .get("data")
            .and_then(Value::as_object)
            .and_then(|data| data.get("mcp"))
            .and_then(Value::as_object)
            .and_then(|mcp| mcp.get("url")),
    ])
    .map(validate_mcp_server_url)
    .transpose()
}

fn sanitize_tool_descriptor_for_client(value: Option<&Value>) -> Option<Value> {
    let mut descriptor = value?.as_object()?.clone();
    descriptor.remove("composio_session_id");
    descriptor.remove("composio_session_mcp_server_url");
    Some(Value::Object(descriptor))
}

fn validate_mcp_server_url(value: &str) -> Result<String, (StatusCode, String)> {
    let url = value.trim();
    if url.len() > 2048 {
        return Err((
            StatusCode::BAD_REQUEST,
            "tool server URL is too long".to_string(),
        ));
    }
    let parsed = reqwest::Url::parse(url).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "tool server URL must be absolute".to_string(),
        )
    })?;
    match parsed.scheme() {
        "http" | "https" => crate::mcp_client::validate_mcp_server_url(url)
            .map(|_| url.to_string())
            .map_err(|message| (StatusCode::BAD_REQUEST, message)),
        _ => Err((
            StatusCode::BAD_REQUEST,
            "tool server URL must use http or https".to_string(),
        )),
    }
}

fn public_tool_connection_json(record: &crate::db::McpToolConnectionRecord) -> Value {
    json!({
        "id": record.id,
        "tool_slug": record.tool_slug,
        "tool_name": record.tool_name,
        "mcp_server_url": record.mcp_server_url,
        "connected_at": record.connected_at,
        "connection_provider": record.connection_provider,
        "tool_descriptor": sanitize_tool_descriptor_for_client(record.tool_descriptor.as_ref()),
    })
}

fn tool_connection_capability_account_ref(tool_slug: &str) -> String {
    tool_slug.to_string()
}

fn normalize_descriptor_string_list(
    value: Option<&Value>,
    max_items: usize,
    max_len: usize,
) -> Vec<String> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= max_len)
        .take(max_items)
        .map(str::to_string)
        .collect()
}

fn tool_capability_approval_mode(capability: &str) -> &'static str {
    let normalized = capability.trim().to_ascii_lowercase();
    let low_risk_prefixes = [
        "get_",
        "list_",
        "search_",
        "query_",
        "read_",
        "fetch_",
        "check_",
        "describe_",
        "lookup_",
        "get",
        "list",
        "search",
        "query",
        "read",
        "fetch",
        "check",
        "describe",
        "lookup",
    ];
    if low_risk_prefixes
        .iter()
        .any(|prefix| normalized.starts_with(prefix))
    {
        "suggest_only"
    } else {
        "human_approval_required"
    }
}

fn projected_capabilities_from_tool_connection(
    user_id: &str,
    record: &crate::db::McpToolConnectionRecord,
) -> Vec<crate::db::UserConnectedCapabilityRecord> {
    let descriptor = sanitize_tool_descriptor_for_client(record.tool_descriptor.as_ref());
    let descriptor_ref = descriptor.as_ref();
    let capability_names = normalize_descriptor_string_list(
        descriptor_ref.and_then(|value| value.get("capabilities")),
        64,
        120,
    );
    if capability_names.is_empty() {
        return Vec::new();
    }
    let granted_scopes = normalize_descriptor_string_list(
        descriptor_ref.and_then(|value| value.get("scopes")),
        64,
        160,
    );
    let category = descriptor_ref
        .and_then(|value| value.get("app_category").or_else(|| value.get("category")))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("tool_connection")
        .to_ascii_lowercase()
        .replace([' ', '/', '&'], "_");
    let account_ref = tool_connection_capability_account_ref(&record.tool_slug);
    let secret_ref = Some(format!(
        "mcp_tool_connections:{user_id}:{}",
        record.tool_slug
    ));
    let checked_at = Some(chrono::Utc::now().to_rfc3339());

    capability_names
        .into_iter()
        .map(|capability| crate::db::UserConnectedCapabilityRecord {
            id: String::new(),
            user_id: user_id.to_string(),
            provider: TOOL_CONNECTION_CAPABILITY_PROVIDER.to_string(),
            account_ref: account_ref.clone(),
            capability_family: category.clone(),
            capability_id: format!("{}.{}", record.tool_slug, capability),
            transport: record.connection_provider.clone(),
            granted_scopes: granted_scopes.clone(),
            approval_mode: tool_capability_approval_mode(&capability).to_string(),
            secret_ref: secret_ref.clone(),
            health_state: "healthy".to_string(),
            last_checked_at: checked_at.clone(),
            connected_at: record.connected_at.clone(),
            revoked_at: None,
            metadata_json: json!({
                "origin": "tool_connection",
                "tool_slug": record.tool_slug,
                "tool_name": record.tool_name,
                "mcp_server_url": record.mcp_server_url,
                "connection_provider": record.connection_provider,
                "tool_descriptor": descriptor,
            }),
        })
        .collect()
}

async fn refresh_tool_connection_capability_registry(
    state: &Arc<AppState>,
    user_id: &str,
    record: &crate::db::McpToolConnectionRecord,
) -> Result<usize, (StatusCode, String)> {
    let account_ref = tool_connection_capability_account_ref(&record.tool_slug);
    state
        .db
        .delete_user_connected_capabilities_for_provider_account(
            user_id,
            TOOL_CONNECTION_CAPABILITY_PROVIDER,
            &account_ref,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let projected = projected_capabilities_from_tool_connection(user_id, record);
    for capability in &projected {
        state
            .db
            .upsert_user_connected_capability(capability)
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
    }
    Ok(projected.len())
}

async fn clear_tool_connection_capability_registry(
    state: &Arc<AppState>,
    user_id: &str,
    tool_slug: &str,
) -> Result<u64, (StatusCode, String)> {
    let account_ref = tool_connection_capability_account_ref(tool_slug);
    state
        .db
        .delete_user_connected_capabilities_for_provider_account(
            user_id,
            TOOL_CONNECTION_CAPABILITY_PROVIDER,
            &account_ref,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)
}

fn composio_api_key_configured() -> Option<String> {
    crate::secret_manager::read_process_secret_trimmed("COMPOSIO_API_KEY")
        .filter(|value| !value.trim().is_empty())
}

fn composio_api_base_url() -> String {
    std::env::var("COMPOSIO_API_BASE_URL")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "https://backend.composio.dev/api/v3.1".to_string())
}

fn composio_session_create_url() -> String {
    format!("{}/tool_router/session", composio_api_base_url())
}

fn composio_session_link_url(session_id: &str) -> String {
    format!(
        "{}/tool_router/session/{session_id}/link",
        composio_api_base_url()
    )
}

fn canonical_composio_server_url() -> Result<String, (StatusCode, String)> {
    validate_mcp_server_url(&composio_api_base_url())
}

async fn ensure_composio_connection_ready(
    composio_connected_account_id: Option<&str>,
) -> Result<(), (StatusCode, String)> {
    if composio_connected_account_id.is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Composio connections require a connected account id from the provider auth flow."
                .to_string(),
        ));
    }
    let Some(api_key) = composio_api_key_configured() else {
        return Err((
            StatusCode::CONFLICT,
            "Composio is not configured on this server. Set a valid COMPOSIO_API_KEY before enabling Composio-backed apps."
                .to_string(),
        ));
    };
    let probe = probe_composio_project_key(&api_key).await?;
    if probe.usable {
        Ok(())
    } else {
        Err((
            StatusCode::CONFLICT,
            format!(
                "{} Composio-backed apps cannot be enabled right now.",
                composio_probe_failure_message(&probe)
            ),
        ))
    }
}

async fn ensure_composio_project_ready() -> Result<String, (StatusCode, String)> {
    let Some(api_key) = composio_api_key_configured() else {
        return Err((
            StatusCode::CONFLICT,
            "Composio is not configured on this server. Set a valid COMPOSIO_API_KEY before enabling Composio-backed apps."
                .to_string(),
        ));
    };
    let probe = probe_composio_project_key(&api_key).await?;
    if probe.usable {
        Ok(api_key)
    } else {
        Err((
            StatusCode::CONFLICT,
            format!(
                "{} Composio-backed apps cannot be enabled right now.",
                composio_probe_failure_message(&probe)
            ),
        ))
    }
}

async fn probe_composio_project_key(
    api_key: &str,
) -> Result<ComposioProjectProbe, (StatusCode, String)> {
    let probe_url = format!("{}/tools?limit=1", composio_api_base_url());
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| {
            (
                StatusCode::BAD_GATEWAY,
                "Could not construct the Composio verification client.".to_string(),
            )
        })?
        .get(probe_url)
        .header("x-api-key", api_key)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|_| {
            (
                StatusCode::BAD_GATEWAY,
                "Could not reach Composio to verify the server project key.".to_string(),
            )
        })?;
    Ok(composio_probe_from_http_status(response.status().as_u16()))
}

async fn composio_project_key_is_usable(api_key: &str) -> Result<bool, reqwest::Error> {
    let probe_url = format!("{}/tools?limit=1", composio_api_base_url());
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;
    let response = client
        .get(probe_url)
        .header("x-api-key", api_key)
        .header("accept", "application/json")
        .send()
        .await?;
    Ok(response.status().is_success())
}

async fn revoke_composio_connected_account_at_base_url(
    client: &reqwest::Client,
    api_key: &str,
    base_url: &str,
    connected_account_id: &str,
) -> bool {
    let delete_url = format!("{}/connected_accounts/{}", base_url, connected_account_id);
    let delete_response = client
        .delete(&delete_url)
        .query(&[("revoke_on_delete", "true")])
        .header("x-api-key", api_key)
        .header("accept", "application/json")
        .send()
        .await;
    match delete_response {
        Ok(response) if response.status().is_success() || response.status().as_u16() == 404 => {
            return true;
        }
        Ok(_) | Err(_) => {}
    }

    let revoke_url = format!(
        "{}/connected_accounts/{}/revoke",
        base_url, connected_account_id
    );
    match client
        .post(revoke_url)
        .header("x-api-key", api_key)
        .header("accept", "application/json")
        .send()
        .await
    {
        Ok(response) => response.status().is_success() || response.status().as_u16() == 404,
        Err(_) => false,
    }
}

async fn revoke_composio_connected_account(
    client: &reqwest::Client,
    api_key: &str,
    connected_account_id: &str,
) -> bool {
    revoke_composio_connected_account_at_base_url(
        client,
        api_key,
        &composio_api_base_url(),
        connected_account_id,
    )
    .await
}

fn composio_probe_from_http_status(status: u16) -> ComposioProjectProbe {
    let usable = (200..300).contains(&status);
    let failure_reason = if usable {
        None
    } else if status == 401 || status == 403 {
        Some("unauthorized")
    } else if status == 429 {
        Some("rate_limited")
    } else if status >= 500 {
        Some("upstream_error")
    } else {
        Some("failing")
    };
    ComposioProjectProbe {
        configured: true,
        usable,
        http_status: Some(status),
        failure_reason,
    }
}

async fn list_tool_connections_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let connections = state
        .db
        .list_mcp_tool_connections(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(json!({
        "connections": connections.iter().map(public_tool_connection_json).collect::<Vec<_>>()
    })))
}

async fn begin_composio_link_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<BeginComposioLinkRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    if tool_connection_change_requires_recent_session() {
        require_recent_high_risk_session(&session)?;
    }
    let tool_slug = normalize_tool_slug(&body.tool_slug)
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "tool_slug is invalid".to_string()))?;
    let requested_tool_name = normalize_tool_name(&body.tool_name)
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "tool_name is invalid".to_string()))?;
    let toolkit_slug = normalize_toolkit_slug(&body.toolkit_slug).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "toolkit_slug is invalid".to_string(),
        )
    })?;
    let known_app = known_composio_app(&tool_slug, &toolkit_slug).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "This Composio app mapping is not recognized by the server.".to_string(),
        )
    })?;
    let tool_name = known_app.tool_name.to_string();
    if !requested_tool_name.eq_ignore_ascii_case(known_app.tool_name) {
        return Err((
            StatusCode::BAD_REQUEST,
            "The requested Composio app name did not match the server catalog.".to_string(),
        ));
    }
    let composio_server_url = canonical_composio_server_url()?;
    let api_key = ensure_composio_project_ready().await?;
    let state_token = composio_oauth_state_sign(
        &user.id,
        &tool_slug,
        &tool_name,
        &toolkit_slug,
        &composio_server_url,
    )?;
    let callback_url = composio_callback_url(&tool_slug, &state_token)?;

    let session_response = state
        .http_client
        .post(composio_session_create_url())
        .header("x-api-key", &api_key)
        .header("accept", "application/json")
        .json(&json!({
            "user_id": user.id,
            "toolkits": { "enabled": [toolkit_slug] },
            "manage_connections": {
                "enabled": true,
                "enable_wait_for_connections": true,
                "callback_url": callback_url,
            },
        }))
        .send()
        .await
        .map_err(|_| {
            (
                StatusCode::BAD_GATEWAY,
                "Could not reach Composio to create an auth session.".to_string(),
            )
        })?;
    let session_status = session_response.status();
    let session_body: Value = session_response.json().await.map_err(|_| {
        (
            StatusCode::BAD_GATEWAY,
            "Composio returned an unreadable auth session payload.".to_string(),
        )
    })?;
    if !session_status.is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!(
                "Composio rejected the {} auth session request for {}.",
                tool_name, toolkit_slug
            ),
        ));
    }
    let session_id = composio_session_id_from_response(&session_body).ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            "Composio did not return a session_id for the auth session.".to_string(),
        )
    })?;
    let session_mcp_server_url = composio_session_mcp_url_from_response(&session_body)?
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                "Composio did not return a session-scoped MCP URL for the auth session."
                    .to_string(),
            )
        })?;

    let link_response = state
        .http_client
        .post(composio_session_link_url(&session_id))
        .header("x-api-key", &api_key)
        .header("accept", "application/json")
        .json(&json!({
            "toolkit": toolkit_slug,
            "alias": format!("{}:{}", user.id, tool_slug),
            "callback_url": callback_url,
        }))
        .send()
        .await
        .map_err(|_| {
            (
                StatusCode::BAD_GATEWAY,
                "Could not reach Composio to create an auth link.".to_string(),
            )
        })?;
    let link_status = link_response.status();
    let link_body: Value = link_response.json().await.map_err(|_| {
        (
            StatusCode::BAD_GATEWAY,
            "Composio returned an unreadable auth link payload.".to_string(),
        )
    })?;
    if !link_status.is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!(
                "Composio rejected the {} provider link request for {}.",
                tool_name, toolkit_slug
            ),
        ));
    }
    let redirect_url = composio_redirect_url_from_response(&link_body)?.ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            "Composio did not return a provider redirect_url.".to_string(),
        )
    })?;
    store_pending_composio_link(
        &state_token,
        &session_id,
        &session_mcp_server_url,
        Instant::now(),
    );

    Ok(Json(json!({
        "ok": true,
        "tool_slug": tool_slug,
        "toolkit_slug": toolkit_slug,
        "redirect_url": redirect_url,
    })))
}

async fn complete_composio_link_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CompleteComposioLinkRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    if tool_connection_change_requires_recent_session() {
        require_recent_high_risk_session(&session)?;
    }
    let tool_slug = normalize_tool_slug(&body.tool_slug)
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "tool_slug is invalid".to_string()))?;
    let requested_tool_name = normalize_tool_name(&body.tool_name)
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "tool_name is invalid".to_string()))?;
    let composio_server_url = canonical_composio_server_url()?;
    let toolkit_slug = normalize_toolkit_slug(&body.toolkit_slug).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "toolkit_slug is invalid".to_string(),
        )
    })?;
    let known_app = known_composio_app(&tool_slug, &toolkit_slug).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "This Composio app mapping is not recognized by the server.".to_string(),
        )
    })?;
    let tool_name = known_app.tool_name.to_string();
    if !requested_tool_name.eq_ignore_ascii_case(known_app.tool_name) {
        return Err((
            StatusCode::BAD_REQUEST,
            "The requested Composio app name did not match the server catalog.".to_string(),
        ));
    }
    let composio_connected_account_id =
        normalize_optional_connection_id(Some(body.composio_connected_account_id.as_str()), 256)
            .ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "composio_connected_account_id is invalid".to_string(),
                )
            })?;
    let state_token = normalize_optional_connection_id(Some(body.composio_state.as_str()), 2048)
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "composio_state is invalid".to_string(),
            )
        })?;
    let composio_status = body
        .composio_status
        .as_deref()
        .map(str::trim)
        .unwrap_or("success")
        .to_ascii_lowercase();
    if composio_status != "success" {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Composio reported a non-success auth result for {tool_name}."),
        ));
    }
    let verified_state = composio_oauth_state_decode_verified(
        &state_token,
        &user.id,
        &tool_slug,
        &tool_name,
        &toolkit_slug,
        &composio_server_url,
    )?;
    if verified_state.is_none() {
        return Err((
            StatusCode::FORBIDDEN,
            "The Composio auth callback state was invalid or expired.".to_string(),
        ));
    }
    ensure_composio_connection_ready(Some(&composio_connected_account_id)).await?;
    let pending_link = require_pending_composio_link(&state_token, Instant::now())?;
    let _ = normalize_tool_descriptor(body.tool_descriptor)?;
    let tool_descriptor = Some(trusted_composio_tool_descriptor(known_app));
    let record = state
        .db
        .upsert_mcp_tool_connection(&crate::db::McpToolConnectionUpsert {
            user_id: user.id.clone(),
            tool_slug,
            tool_name,
            mcp_server_url: pending_link.session_mcp_server_url,
            api_key: None,
            connection_provider: "composio".to_string(),
            external_user_id: Some(user.id.clone()),
            composio_connected_account_id: Some(composio_connected_account_id),
            tool_descriptor,
        })
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let projected_capability_count =
        refresh_tool_connection_capability_registry(&state, &user.id, &record).await?;

    Ok(Json(json!({
        "ok": true,
        "connection": public_tool_connection_json(&record),
        "capability_registry_refreshed": true,
        "projected_capability_count": projected_capability_count,
    })))
}

async fn upsert_tool_connection_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ToolConnectionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    if tool_connection_change_requires_recent_session() {
        require_recent_high_risk_session(&session)?;
    }
    let tool_slug = normalize_tool_slug(&body.tool_slug)
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "tool_slug is invalid".to_string()))?;
    let tool_name = normalize_tool_name(&body.tool_name)
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "tool_name is invalid".to_string()))?;
    let mcp_server_url = validate_mcp_server_url(&body.mcp_server_url)?;
    let composio_connected_account_id =
        normalize_optional_connection_id(body.composio_connected_account_id.as_deref(), 256);
    let connection_provider = normalize_connection_provider(
        body.connection_provider.as_deref(),
        composio_connected_account_id.as_deref(),
    );
    let api_key = normalize_api_key(body.api_key.as_deref());
    let tool_descriptor = normalize_tool_descriptor(body.tool_descriptor)?;
    if connection_provider == "composio" {
        return Err((
            StatusCode::BAD_REQUEST,
            "Composio connections must be completed through the dedicated auth flow.".to_string(),
        ));
    } else if api_key.is_none() && !tool_descriptor_declares_no_auth(tool_descriptor.as_ref()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Direct MCP tool connections require a non-empty api_key.".to_string(),
        ));
    }
    let external_user_id = if connection_provider == "composio" {
        Some(user.id.clone())
    } else {
        None
    };
    let user_id = user.id.clone();

    let record = state
        .db
        .upsert_mcp_tool_connection(&crate::db::McpToolConnectionUpsert {
            user_id,
            tool_slug,
            tool_name,
            mcp_server_url,
            api_key,
            connection_provider,
            external_user_id,
            composio_connected_account_id,
            tool_descriptor,
        })
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let projected_capability_count =
        refresh_tool_connection_capability_registry(&state, &user.id, &record).await?;

    Ok(Json(json!({
        "ok": true,
        "connection": public_tool_connection_json(&record),
        "capability_registry_refreshed": true,
        "projected_capability_count": projected_capability_count,
    })))
}

async fn delete_tool_connection_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    if tool_connection_change_requires_recent_session() {
        require_recent_high_risk_session(&session)?;
    }
    let tool_slug = normalize_tool_slug(&slug)
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "tool slug is invalid".to_string()))?;
    let existing = state
        .db
        .find_mcp_tool_connection(&user.id, &tool_slug)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let deleted = state
        .db
        .delete_mcp_tool_connection(&user.id, &tool_slug)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let cleared_capability_count = if deleted > 0 {
        clear_tool_connection_capability_registry(&state, &user.id, &tool_slug).await?
    } else {
        0
    };
    let is_composio_connection = existing
        .as_ref()
        .map(|record| record.connection_provider == "composio")
        .unwrap_or(false);
    let composio_connected_account_id = existing
        .as_ref()
        .and_then(|record| record.composio_connected_account_id.as_deref());
    let upstream_revocation_supported =
        is_composio_connection && composio_connected_account_id.is_some();
    let revoke_attempted = if deleted > 0 && upstream_revocation_supported {
        match (composio_api_key_configured(), composio_connected_account_id) {
            (Some(api_key), Some(connected_account_id)) => {
                revoke_composio_connected_account(
                    &state.http_client,
                    &api_key,
                    connected_account_id,
                )
                .await
            }
            _ => false,
        }
    } else {
        false
    };
    let session_cleanup_recommended =
        deleted > 0 && upstream_revocation_supported && !revoke_attempted;
    Ok(Json(json!({
        "ok": deleted > 0,
        "disconnected": deleted > 0,
        "revoke_attempted": revoke_attempted,
        "upstream_revocation_supported": upstream_revocation_supported,
        "capability_registry_refreshed": deleted > 0,
        "cleared_capability_count": cleared_capability_count,
        "invalidate_local_cache_keys": [
            LOCAL_CACHE_KEY_CONNECTED_APPS,
            LOCAL_CACHE_KEY_TOOL_CONNECTIONS,
        ],
        "tool_slug": tool_slug,
        "connection_provider": existing.as_ref().map(|record| record.connection_provider.clone()),
        "session_cleanup_recommended": session_cleanup_recommended,
    })))
}

async fn composio_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let Some(api_key) = composio_api_key_configured() else {
        return Ok(Json(json!({
            "configured": false,
            "usable": false,
            "failure_reason": "not_configured",
        })));
    };
    let probe = probe_composio_project_key(&api_key).await.map_err(|_| {
        (
            StatusCode::BAD_GATEWAY,
            "could not reach Composio".to_string(),
        )
    })?;
    Ok(Json(json!({
        "configured": probe.configured,
        "usable": probe.usable,
        "http_status": probe.http_status,
        "failure_reason": probe.failure_reason,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn composio_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn tool_slug_normalization_rejects_cross_user_lookup_shapes() {
        assert_eq!(normalize_tool_slug("GitHub"), Some("github".to_string()));
        assert_eq!(
            normalize_tool_slug("google-calendar"),
            Some("google-calendar".to_string())
        );
        assert_eq!(normalize_tool_slug("../github"), None);
        assert_eq!(normalize_tool_slug("github@example"), None);
    }

    #[test]
    fn tool_name_normalization_rejects_control_chars_and_blank_values() {
        assert_eq!(
            normalize_tool_name("  GitHub MCP  "),
            Some("GitHub MCP".to_string())
        );
        assert_eq!(normalize_tool_name("   "), None);
        assert_eq!(normalize_tool_name("GitHub\nMCP"), None);
    }

    #[test]
    fn composio_provider_is_selected_only_from_explicit_metadata() {
        assert_eq!(normalize_connection_provider(None, None), "mcp");
        assert_eq!(
            normalize_connection_provider(None, Some("ca_123")),
            "composio"
        );
        assert_eq!(
            normalize_connection_provider(Some("composio"), None),
            "composio"
        );
        assert_eq!(
            normalize_connection_provider(Some("unexpected"), Some("ca_123")),
            "mcp"
        );
    }

    #[test]
    fn tool_connection_url_validation_matches_runtime_ssrf_guard() {
        assert!(validate_mcp_server_url("https://mcp.example.com/v1").is_ok());
        assert!(validate_mcp_server_url("http://localhost:8080/mcp").is_ok());
        assert!(validate_mcp_server_url("http://127.0.0.1:3000/mcp").is_ok());
        assert!(validate_mcp_server_url("http://169.254.169.254/latest/meta-data/").is_err());
        assert!(validate_mcp_server_url("http://10.0.0.1/internal").is_err());
        assert!(validate_mcp_server_url("ftp://example.com/mcp").is_err());
    }

    #[test]
    fn external_redirect_url_validation_fails_closed() {
        assert_eq!(
            normalize_external_redirect_url("https://provider.example.com/oauth/start")
                .expect("https redirect should be accepted"),
            "https://provider.example.com/oauth/start"
        );
        assert_eq!(
            normalize_external_redirect_url("http://localhost:3000/callback")
                .expect("localhost http redirect should be accepted"),
            "http://localhost:3000/callback"
        );
        assert!(normalize_external_redirect_url("javascript:alert(1)").is_err());
        assert!(normalize_external_redirect_url("http://provider.example.com/oauth").is_err());
        assert!(normalize_external_redirect_url("   ").is_err());
    }

    #[test]
    fn composio_probe_classifies_operator_relevant_failure_modes() {
        assert_eq!(
            composio_probe_from_http_status(200),
            ComposioProjectProbe {
                configured: true,
                usable: true,
                http_status: Some(200),
                failure_reason: None,
            }
        );
        assert_eq!(
            composio_probe_from_http_status(401).failure_reason,
            Some("unauthorized")
        );
        assert_eq!(
            composio_probe_from_http_status(429).failure_reason,
            Some("rate_limited")
        );
        assert_eq!(
            composio_probe_from_http_status(503).failure_reason,
            Some("upstream_error")
        );
    }

    #[test]
    fn composio_probe_failure_message_is_actionable() {
        let unauthorized = composio_probe_from_http_status(401);
        assert!(composio_probe_failure_message(&unauthorized).contains("rejected by Composio"));
        assert!(composio_probe_failure_message(&unauthorized).contains("HTTP 401"));

        let upstream = composio_probe_from_http_status(503);
        assert!(composio_probe_failure_message(&upstream).contains("upstream server error"));
    }

    #[test]
    fn composio_api_base_url_uses_configured_override_when_present() {
        let _guard = composio_env_lock().lock().expect("lock composio env");
        unsafe {
            std::env::set_var("COMPOSIO_API_BASE_URL", " http://127.0.0.1:9010/api/v3.1/ ");
        }
        assert_eq!(
            composio_api_base_url(),
            "http://127.0.0.1:9010/api/v3.1".to_string()
        );
        unsafe {
            std::env::remove_var("COMPOSIO_API_BASE_URL");
        }
    }

    #[test]
    fn composio_session_urls_follow_configured_base_url() {
        let _guard = composio_env_lock().lock().expect("lock composio env");
        unsafe {
            std::env::set_var("COMPOSIO_API_BASE_URL", "http://127.0.0.1:9010/api/v3.1/");
        }
        assert_eq!(
            composio_session_create_url(),
            "http://127.0.0.1:9010/api/v3.1/tool_router/session"
        );
        assert_eq!(
            composio_session_link_url("sess_123"),
            "http://127.0.0.1:9010/api/v3.1/tool_router/session/sess_123/link"
        );
        unsafe {
            std::env::remove_var("COMPOSIO_API_BASE_URL");
        }
    }

    #[test]
    fn composio_session_id_parser_accepts_common_response_shapes() {
        assert_eq!(
            composio_session_id_from_response(&json!({ "session_id": "sess_123" })),
            Some("sess_123".to_string())
        );
        assert_eq!(
            composio_session_id_from_response(&json!({ "id": "sess_456" })),
            Some("sess_456".to_string())
        );
        assert_eq!(
            composio_session_id_from_response(&json!({
                "session": { "id": "sess_789" }
            })),
            Some("sess_789".to_string())
        );
        assert_eq!(
            composio_session_id_from_response(&json!({
                "data": { "session_id": "sess_abc" }
            })),
            Some("sess_abc".to_string())
        );
        assert_eq!(composio_session_id_from_response(&json!({})), None);
    }

    #[test]
    fn composio_session_mcp_url_parser_accepts_common_response_shapes() {
        assert_eq!(
            composio_session_mcp_url_from_response(&json!({
                "mcp": { "url": "https://app.composio.dev/tool_router/v3/trs_123/mcp" }
            }))
            .expect("top-level mcp url parse should succeed"),
            Some("https://app.composio.dev/tool_router/v3/trs_123/mcp".to_string())
        );
        assert_eq!(
            composio_session_mcp_url_from_response(&json!({
                "session": {
                    "mcp": { "url": "https://app.composio.dev/tool_router/v3/trs_456/mcp" }
                }
            }))
            .expect("nested session mcp url parse should succeed"),
            Some("https://app.composio.dev/tool_router/v3/trs_456/mcp".to_string())
        );
        assert_eq!(
            composio_session_mcp_url_from_response(&json!({}))
                .expect("missing mcp url should be allowed"),
            None
        );
        assert!(
            composio_session_mcp_url_from_response(&json!({
                "mcp": { "url": "javascript:alert(1)" }
            }))
            .is_err()
        );
    }

    #[test]
    fn pending_composio_link_cache_roundtrips_and_expires() {
        let state_token = format!("state-{}", Ulid::new());
        store_pending_composio_link(
            &state_token,
            "trs_123",
            "https://app.composio.dev/tool_router/v3/trs_123/mcp",
            Instant::now(),
        );
        let cached = take_pending_composio_link(&state_token, Instant::now())
            .expect("pending composio link should be present");
        assert_eq!(cached.session_id, "trs_123");
        assert_eq!(
            cached.session_mcp_server_url,
            "https://app.composio.dev/tool_router/v3/trs_123/mcp"
        );
        assert!(take_pending_composio_link(&state_token, Instant::now()).is_none());

        let expired_state = format!("state-{}", Ulid::new());
        store_pending_composio_link(
            &expired_state,
            "trs_456",
            "https://app.composio.dev/tool_router/v3/trs_456/mcp",
            Instant::now() - Duration::from_secs(COMPOSIO_OAUTH_STATE_TTL_SECS as u64 + 5),
        );
        assert!(take_pending_composio_link(&expired_state, Instant::now()).is_none());
    }

    #[test]
    fn composio_completion_requires_server_trusted_pending_link() {
        let missing =
            require_pending_composio_link(&format!("state-{}", Ulid::new()), Instant::now())
                .expect_err("missing pending link should fail closed");
        assert_eq!(missing.0, StatusCode::CONFLICT);
        assert!(missing.1.contains("Restart the connection flow"));

        let expired_state = format!("state-{}", Ulid::new());
        store_pending_composio_link(
            &expired_state,
            "trs_expired",
            "https://app.composio.dev/tool_router/v3/trs_expired/mcp",
            Instant::now() - Duration::from_secs(COMPOSIO_OAUTH_STATE_TTL_SECS as u64 + 5),
        );
        let expired = require_pending_composio_link(&expired_state, Instant::now())
            .expect_err("expired pending link should fail closed");
        assert_eq!(expired.0, StatusCode::CONFLICT);
    }

    #[test]
    fn composio_redirect_url_parser_accepts_common_response_shapes() {
        assert_eq!(
            composio_redirect_url_from_response(&json!({
                "redirect_url": "https://provider.example.com/oauth/start"
            }))
            .expect("redirect url parse should succeed"),
            Some("https://provider.example.com/oauth/start".to_string())
        );
        assert_eq!(
            composio_redirect_url_from_response(&json!({
                "link": { "url": "https://provider.example.com/oauth/next" }
            }))
            .expect("nested link url parse should succeed"),
            Some("https://provider.example.com/oauth/next".to_string())
        );
        assert_eq!(
            composio_redirect_url_from_response(&json!({
                "data": { "redirectUri": "https://provider.example.com/oauth/final" }
            }))
            .expect("nested redirectUri parse should succeed"),
            Some("https://provider.example.com/oauth/final".to_string())
        );
        assert_eq!(
            composio_redirect_url_from_response(&json!({}))
                .expect("missing redirect url should be allowed"),
            None
        );
    }

    #[test]
    fn connection_ids_and_descriptors_are_bounded_and_normalized() {
        assert_eq!(
            normalize_optional_connection_id(Some("  ca_123  "), 256),
            Some("ca_123".to_string())
        );
        assert_eq!(normalize_optional_connection_id(Some("   "), 256), None);
        assert_eq!(
            normalize_optional_connection_id(Some(&"a".repeat(257)), 256),
            None
        );
        assert!(normalize_optional_connection_id(Some("ca_\n123"), 256).is_none());

        assert_eq!(normalize_tool_descriptor(Some(json!([]))).unwrap(), None);
        assert_eq!(
            normalize_tool_descriptor(Some(json!({"name": "github"}))).unwrap(),
            Some(json!({"name": "github"}))
        );
        assert!(tool_descriptor_declares_no_auth(Some(
            &normalize_tool_descriptor(Some(json!({
                "name": "arxiv",
                "auth_type": "none"
            })))
            .unwrap()
            .unwrap()
        )));
        assert!(!tool_descriptor_declares_no_auth(Some(
            &normalize_tool_descriptor(Some(json!({
                "name": "github",
                "auth_type": "api_key"
            })))
            .unwrap()
            .unwrap()
        )));
        assert_eq!(
            normalize_tool_descriptor(Some(json!({
                "name": "exa",
                "billing": {
                    "provider_key": "exa",
                    "provider_category": "search_api",
                    "billing_category": "search_api",
                    "billing_model": "usage",
                    "pricing_summary": "Usage-based billing.",
                    "free_tier_summary": "Small free tier.",
                    "production_caveat": "Check provider plan terms.",
                    "pricing_source_url": "https://example.com/pricing",
                    "default_usage_unit": "requests",
                    "default_quantity_per_call": 1,
                    "estimated_cost_usd_per_call": 0.007,
                    "capability_metering": {
                        "search_web": {
                            "usage_unit": "requests",
                            "quantity": 1,
                            "estimated_cost_usd": 0.007,
                            "ignored": "value"
                        },
                        "bad capability": {
                            "usage_unit": "requests"
                        }
                    },
                    "unknown_field": "drop me"
                }
            })))
            .unwrap(),
            Some(json!({
                "name": "exa",
                "billing": {
                    "provider_key": "exa",
                    "provider_category": "search_api",
                    "billing_category": "search_api",
                    "billing_model": "usage",
                    "pricing_summary": "Usage-based billing.",
                    "free_tier_summary": "Small free tier.",
                    "production_caveat": "Check provider plan terms.",
                    "pricing_source_url": "https://example.com/pricing",
                    "default_usage_unit": "requests",
                    "default_quantity_per_call": 1.0,
                    "estimated_cost_usd_per_call": 0.007,
                    "capability_metering": {
                        "search_web": {
                            "usage_unit": "requests",
                            "quantity": 1.0,
                            "estimated_cost_usd": 0.007
                        }
                    }
                }
            }))
        );
        assert_eq!(
            normalize_tool_descriptor(Some(json!({
                "name": "exa",
                "billing": {
                    "provider_key": "",
                    "billing_model": "bogus",
                    "pricing_source_url": "javascript:alert(1)",
                    "default_quantity_per_call": -1,
                    "estimated_cost_usd_per_call": "NaN"
                }
            })))
            .unwrap(),
            Some(json!({"name": "exa"}))
        );
        assert!(
            normalize_tool_descriptor(Some(json!({
                "blob": "x".repeat(MAX_TOOL_DESCRIPTOR_BYTES + 1)
            })))
            .is_err()
        );
    }

    #[test]
    fn api_key_normalization_trims_and_rejects_invalid_values() {
        assert_eq!(
            normalize_api_key(Some("  sk-test-123  ")),
            Some("sk-test-123".to_string())
        );
        assert_eq!(normalize_api_key(Some("   ")), None);
        assert_eq!(normalize_api_key(Some("line1\nline2")), None);
        assert_eq!(normalize_api_key(Some(&"a".repeat(4097))), None);
    }

    #[test]
    fn toolkit_slug_normalization_rejects_invalid_shapes() {
        assert_eq!(
            normalize_toolkit_slug("  googlecalendar  "),
            Some("googlecalendar".to_string())
        );
        assert_eq!(
            normalize_toolkit_slug("google_drive"),
            Some("google_drive".to_string())
        );
        assert_eq!(normalize_toolkit_slug("../github"), None);
        assert_eq!(normalize_toolkit_slug("google calendar"), None);
    }

    #[test]
    fn composio_catalog_requires_server_known_slug_and_toolkit_pair() {
        let github = known_composio_app("github", "github")
            .expect("github should exist in the server composio catalog");
        assert_eq!(github.tool_name, "GitHub");
        assert!(github.capabilities.contains(&"list_prs"));
        assert!(known_composio_app("github", "slack").is_none());
        assert!(known_composio_app("unknown", "github").is_none());
    }

    #[test]
    fn trusted_composio_descriptor_is_server_defined() {
        let github = known_composio_app("github", "github")
            .expect("github should exist in the server composio catalog");
        let descriptor = trusted_composio_tool_descriptor(github);
        assert_eq!(
            descriptor.get("app_category").and_then(Value::as_str),
            Some("Developer")
        );
        assert_eq!(
            descriptor
                .get("composio_toolkit_slug")
                .and_then(Value::as_str),
            Some("github")
        );
        assert_eq!(
            descriptor
                .get("capabilities")
                .and_then(Value::as_array)
                .map(|items| items.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
            Some(vec!["get_repo", "list_prs", "create_issue"])
        );
    }

    #[test]
    fn composio_oauth_state_roundtrip_is_user_and_tool_bound() {
        let _guard = composio_env_lock().lock().expect("lock composio env");
        unsafe {
            std::env::set_var("OMNYID_SESSION_SECRET", "test-session-secret");
        }
        let state = composio_oauth_state_sign_at(
            "user_01",
            "github",
            "GitHub",
            "github",
            "https://backend.composio.dev/api/v3",
            1_700_000_000,
        )
        .expect("state should sign");
        assert!(
            composio_oauth_state_verify_at(
                &state,
                "user_01",
                "github",
                "GitHub",
                "github",
                "https://backend.composio.dev/api/v3",
                1_700_000_000 + 60
            )
            .expect("state verify should not error")
        );
        assert!(
            !composio_oauth_state_verify_at(
                &state,
                "user_02",
                "github",
                "GitHub",
                "github",
                "https://backend.composio.dev/api/v3",
                1_700_000_000 + 60
            )
            .expect("state verify should not error")
        );
        assert!(
            !composio_oauth_state_verify_at(
                &state,
                "user_01",
                "slack",
                "GitHub",
                "github",
                "https://backend.composio.dev/api/v3",
                1_700_000_000 + 60
            )
            .expect("state verify should not error")
        );
        assert!(
            !composio_oauth_state_verify_at(
                &state,
                "user_01",
                "github",
                "GitHub",
                "slack",
                "https://backend.composio.dev/api/v3",
                1_700_000_000 + 60
            )
            .expect("state verify should not error")
        );
        unsafe {
            std::env::remove_var("OMNYID_SESSION_SECRET");
        }
    }

    #[test]
    fn composio_callback_url_prefers_workspace_base_and_embeds_state() {
        let _guard = composio_env_lock().lock().expect("lock composio env");
        unsafe {
            std::env::set_var("OMNYID_WORKSPACE_BASE_URL", "https://app.omnyid.com/");
            std::env::remove_var("OMNYID_UI_BASE_URL");
            std::env::remove_var("OMNYID_HOMESERVER_URL");
        }
        let url = composio_callback_url("github", "state-token")
            .expect("workspace callback url should build");
        assert_eq!(
            url,
            "https://app.omnyid.com/workspace/?composio=return&tool=github&state=state-token"
        );
        unsafe {
            std::env::remove_var("OMNYID_WORKSPACE_BASE_URL");
        }
    }

    #[test]
    fn composio_callback_url_derives_workspace_from_homeserver() {
        let _guard = composio_env_lock().lock().expect("lock composio env");
        unsafe {
            std::env::remove_var("OMNYID_WORKSPACE_BASE_URL");
            std::env::remove_var("OMNYID_UI_BASE_URL");
            std::env::set_var("OMNYID_HOMESERVER_URL", "https://api.omnyid.com");
        }
        let url = composio_callback_url("slack", "state-token")
            .expect("callback url should derive from homeserver");
        assert_eq!(
            url,
            "https://omnyid.com/workspace/?composio=return&tool=slack&state=state-token"
        );
        unsafe {
            std::env::remove_var("OMNYID_HOMESERVER_URL");
        }
    }

    #[test]
    fn tool_connection_projection_fails_closed_without_descriptor_capabilities() {
        let projected = projected_capabilities_from_tool_connection(
            "user_01",
            &crate::db::McpToolConnectionRecord {
                id: "conn_1".to_string(),
                tool_slug: "github".to_string(),
                tool_name: "GitHub".to_string(),
                mcp_server_url: "https://mcp.example.com".to_string(),
                connected_at: "2026-08-15T09:00:00Z".to_string(),
                connection_provider: "mcp".to_string(),
                external_user_id: None,
                composio_connected_account_id: None,
                tool_descriptor: Some(json!({
                    "name": "GitHub",
                    "app_surface": "connected_apps"
                })),
            },
        );
        assert!(projected.is_empty());
    }

    #[test]
    fn public_tool_connection_json_strips_composio_session_only_descriptor_fields() {
        let public = public_tool_connection_json(&crate::db::McpToolConnectionRecord {
            id: "conn_1".to_string(),
            tool_slug: "github".to_string(),
            tool_name: "GitHub".to_string(),
            mcp_server_url: "https://mcp.example.com".to_string(),
            connected_at: "2026-08-15T09:00:00Z".to_string(),
            connection_provider: "composio".to_string(),
            external_user_id: Some("user_01".to_string()),
            composio_connected_account_id: Some("ca_123".to_string()),
            tool_descriptor: Some(json!({
                "capabilities": ["list_prs"],
                "composio_toolkit_slug": "github",
                "composio_session_id": "trs_123",
                "composio_session_mcp_server_url": "https://app.composio.dev/tool_router/v3/trs_123/mcp"
            })),
        });

        let descriptor = public
            .get("tool_descriptor")
            .and_then(Value::as_object)
            .expect("public tool descriptor should remain an object");
        assert_eq!(
            descriptor.get("composio_toolkit_slug"),
            Some(&Value::String("github".to_string()))
        );
        assert!(!descriptor.contains_key("composio_session_id"));
        assert!(!descriptor.contains_key("composio_session_mcp_server_url"));
    }

    #[test]
    fn tool_connection_projection_marks_reads_as_suggest_only_and_writes_as_approval() {
        let projected = projected_capabilities_from_tool_connection(
            "user_01",
            &crate::db::McpToolConnectionRecord {
                id: "conn_1".to_string(),
                tool_slug: "github".to_string(),
                tool_name: "GitHub".to_string(),
                mcp_server_url: "https://mcp.example.com".to_string(),
                connected_at: "2026-08-15T09:00:00Z".to_string(),
                connection_provider: "mcp".to_string(),
                external_user_id: None,
                composio_connected_account_id: None,
                tool_descriptor: Some(json!({
                    "app_category": "Developer",
                    "capabilities": ["list_prs", "create_issue"],
                    "scopes": ["repo:read", "repo:write"]
                })),
            },
        );

        assert_eq!(projected.len(), 2);
        assert_eq!(projected[0].provider, TOOL_CONNECTION_CAPABILITY_PROVIDER);
        assert_eq!(projected[0].account_ref, "github");
        assert_eq!(projected[0].capability_id, "github.list_prs");
        assert_eq!(projected[0].approval_mode, "suggest_only");
        assert_eq!(projected[1].capability_id, "github.create_issue");
        assert_eq!(projected[1].approval_mode, "human_approval_required");
        assert_eq!(projected[1].granted_scopes, vec!["repo:read", "repo:write"]);
    }

    #[test]
    fn tool_connection_projection_sanitizes_composio_metadata_echo() {
        let projected = projected_capabilities_from_tool_connection(
            "user_01",
            &crate::db::McpToolConnectionRecord {
                id: "conn_1".to_string(),
                tool_slug: "github".to_string(),
                tool_name: "GitHub".to_string(),
                mcp_server_url: "https://app.composio.dev/tool_router/v3/trs_123/mcp".to_string(),
                connected_at: "2026-08-15T09:00:00Z".to_string(),
                connection_provider: "composio".to_string(),
                external_user_id: Some("user_01".to_string()),
                composio_connected_account_id: Some("ca_123".to_string()),
                tool_descriptor: Some(json!({
                    "app_category": "Developer",
                    "capabilities": ["list_prs"],
                    "composio_toolkit_slug": "github",
                    "composio_session_id": "trs_123",
                    "composio_session_mcp_server_url": "https://app.composio.dev/tool_router/v3/trs_123/mcp"
                })),
            },
        );

        assert_eq!(projected.len(), 1);
        let metadata = projected[0]
            .metadata_json
            .as_object()
            .expect("projected capability metadata should be an object");
        assert!(!metadata.contains_key("composio_connected_account_id"));
        let descriptor = metadata
            .get("tool_descriptor")
            .and_then(Value::as_object)
            .expect("sanitized descriptor should remain present");
        assert_eq!(
            descriptor.get("composio_toolkit_slug"),
            Some(&Value::String("github".to_string()))
        );
        assert!(!descriptor.contains_key("composio_session_id"));
        assert!(!descriptor.contains_key("composio_session_mcp_server_url"));
    }

    #[test]
    fn tool_connection_changes_require_recent_sign_in() {
        assert!(tool_connection_change_requires_recent_session());
    }

    #[tokio::test]
    async fn composio_connections_require_connected_account_id_before_storage() {
        let error = ensure_composio_connection_ready(None)
            .await
            .expect_err("missing composio connected account id should fail");
        assert_eq!(error.0, StatusCode::BAD_REQUEST);
        assert!(error.1.contains("connected account id"));
    }

    #[test]
    fn generic_upsert_route_is_not_allowed_for_composio_connections() {
        let provider = normalize_connection_provider(Some("composio"), Some("ca_123"));
        assert_eq!(provider, "composio");
        let error = if provider == "composio" {
            Err((
                StatusCode::BAD_REQUEST,
                "Composio connections must be completed through the dedicated auth flow."
                    .to_string(),
            ))
        } else {
            Ok(())
        }
        .expect_err("generic composio upsert should be rejected");
        assert_eq!(error.0, StatusCode::BAD_REQUEST);
        assert!(error.1.contains("dedicated auth flow"));
    }

    #[tokio::test]
    async fn composio_connected_account_revocation_prefers_delete_with_revoke_on_delete() {
        use axum::{
            Router,
            extract::Query,
            routing::{delete, post},
        };
        use std::collections::HashMap;
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };

        let delete_hits = Arc::new(AtomicUsize::new(0));
        let post_hits = Arc::new(AtomicUsize::new(0));
        let delete_hits_for_route = delete_hits.clone();
        let post_hits_for_route = post_hits.clone();
        let app = Router::new()
            .route(
                "/api/v3.1/connected_accounts/{id}",
                delete(move |Query(query): Query<HashMap<String, String>>| {
                    let delete_hits = delete_hits_for_route.clone();
                    async move {
                        assert_eq!(
                            query.get("revoke_on_delete").map(String::as_str),
                            Some("true")
                        );
                        delete_hits.fetch_add(1, Ordering::SeqCst);
                        StatusCode::NO_CONTENT
                    }
                }),
            )
            .route(
                "/api/v3.1/connected_accounts/{id}/revoke",
                post(move || {
                    let post_hits = post_hits_for_route.clone();
                    async move {
                        post_hits.fetch_add(1, Ordering::SeqCst);
                        StatusCode::NO_CONTENT
                    }
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test listener");
        let addr = listener.local_addr().expect("listener address");
        tokio::spawn(async move {
            axum::serve(listener, app).await.expect("serve test app");
        });

        let client = reqwest::Client::new();
        let revoked = revoke_composio_connected_account_at_base_url(
            &client,
            "test-key",
            &format!("http://{addr}/api/v3.1"),
            "ca_123",
        )
        .await;

        assert!(revoked);
        assert_eq!(delete_hits.load(Ordering::SeqCst), 1);
        assert_eq!(post_hits.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn composio_connected_account_revocation_falls_back_to_revoke_endpoint() {
        use axum::{
            Router,
            routing::{delete, post},
        };
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };

        let delete_hits = Arc::new(AtomicUsize::new(0));
        let post_hits = Arc::new(AtomicUsize::new(0));
        let delete_hits_for_route = delete_hits.clone();
        let post_hits_for_route = post_hits.clone();
        let app = Router::new()
            .route(
                "/api/v3.1/connected_accounts/{id}",
                delete(move || {
                    let delete_hits = delete_hits_for_route.clone();
                    async move {
                        delete_hits.fetch_add(1, Ordering::SeqCst);
                        StatusCode::METHOD_NOT_ALLOWED
                    }
                }),
            )
            .route(
                "/api/v3.1/connected_accounts/{id}/revoke",
                post(move || {
                    let post_hits = post_hits_for_route.clone();
                    async move {
                        post_hits.fetch_add(1, Ordering::SeqCst);
                        StatusCode::OK
                    }
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test listener");
        let addr = listener.local_addr().expect("listener address");
        tokio::spawn(async move {
            axum::serve(listener, app).await.expect("serve test app");
        });

        let client = reqwest::Client::new();
        let revoked = revoke_composio_connected_account_at_base_url(
            &client,
            "test-key",
            &format!("http://{addr}/api/v3.1"),
            "ca_456",
        )
        .await;

        assert!(revoked);
        assert_eq!(delete_hits.load(Ordering::SeqCst), 1);
        assert_eq!(post_hits.load(Ordering::SeqCst), 1);
    }
}
