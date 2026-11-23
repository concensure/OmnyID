use axum::Json;
use serde_json::Value;

pub(super) fn apple_client_id_configured() -> Option<String> {
    std::env::var("OMNYID_APPLE_CLIENT_ID")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(in crate::server) async fn apple_auth_config_http() -> Json<Value> {
    let client_id = apple_client_id_configured();
    let redirect_uri = std::env::var("OMNYID_APPLE_REDIRECT_URI")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| value.starts_with("https://"));
    Json(serde_json::json!({
        "enabled": client_id.is_some() && redirect_uri.is_some(),
        "client_id": client_id,
        "redirect_uri": redirect_uri,
    }))
}
