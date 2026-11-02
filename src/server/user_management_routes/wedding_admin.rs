/*
 * @module-id: rust.server.user-management-routes.wedding-admin
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::super::wedding_vendor_search_routes::attribute_catalog::{
    AdminAttributeInput, admin_attribute_write, attribute_catalog_json, attributes_with_unknowns,
};
use super::*;
use crate::admin_tool_secrets::{
    ANTHROPIC_LLM_SPEC, AdminToolSecretSpec, BRAVE_SEARCH_SPEC, CLOUDINARY_SPEC,
    GOOGLE_CALENDAR_SPEC, GOOGLE_MAPS_SPEC, GOOGLE_PLACES_SPEC, STRIPE_SPEC, TWILIO_SPEC,
    WEATHER_API_SPEC, admin_tool_secret_status,
};
use crate::db::{WeddingVendorRecord, wedding_vendor_evidence::VendorAttributeWrite};
use crate::server::{
    llm_resolution::hosted_wedding_draft_model_configured, wedding_admin_ai_policy,
};
pub(super) fn validate_optional_http_url(
    value: Option<String>,
    label: &str,
) -> Result<Option<String>, (StatusCode, String)> {
    let Some(url) = clean_optional_string(value) else {
        return Ok(None);
    };
    let parsed = reqwest::Url::parse(&url).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            format!("{label} must be a full http or https URL"),
        )
    })?;
    if matches!(parsed.scheme(), "http" | "https") {
        Ok(Some(url))
    } else {
        Err((
            StatusCode::BAD_REQUEST,
            format!("{label} must be a full http or https URL"),
        ))
    }
}

fn validate_optional_date(
    value: Option<String>,
    label: &str,
) -> Result<Option<String>, (StatusCode, String)> {
    let Some(date) = clean_optional_string(value) else {
        return Ok(None);
    };
    chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            format!("{label} must use YYYY-MM-DD"),
        )
    })?;
    Ok(Some(date))
}

pub(super) fn validate_optional_rfc3339(
    value: Option<String>,
    label: &str,
) -> Result<Option<String>, (StatusCode, String)> {
    let Some(timestamp) = clean_optional_string(value) else {
        return Ok(None);
    };
    chrono::DateTime::parse_from_rfc3339(&timestamp).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            format!("{label} must be an RFC3339 timestamp"),
        )
    })?;
    Ok(Some(timestamp))
}

fn validate_contact_method(value: String) -> Result<String, (StatusCode, String)> {
    let method = clean_required_string(value, "contact_method")?;
    if matches!(
        method.as_str(),
        "master_agent"
            | "agent_email_draft"
            | "personal_email"
            | "phone"
            | "website_form"
            | "other"
    ) {
        Ok(method)
    } else {
        Err((
            StatusCode::BAD_REQUEST,
            "invalid contact_method".to_string(),
        ))
    }
}

fn validate_wedding_intake_source(
    value: String,
    label: &str,
) -> Result<String, (StatusCode, String)> {
    let source = clean_required_string(value, label)?;
    if matches!(source.as_str(), "wedding_site" | "wedding_quiz" | "generic") {
        Ok(source)
    } else {
        Err((StatusCode::BAD_REQUEST, format!("invalid {label}")))
    }
}

pub(super) fn wedding_vendor_list_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(200).clamp(1, 200)
}

const MAX_VENDOR_ATTRIBUTE_WRITES: usize = 80;

/// Operator-entered attributes are validated against the catalog before anything is written,
/// so a typo in one key cannot leave the vendor half-updated.
pub(super) fn wedding_vendor_attribute_writes(
    attributes: Option<Vec<WeddingVendorAttributeRequest>>,
) -> Result<Vec<VendorAttributeWrite>, (StatusCode, String)> {
    let attributes = attributes.unwrap_or_default();
    if attributes.len() > MAX_VENDOR_ATTRIBUTE_WRITES {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "at most {MAX_VENDOR_ATTRIBUTE_WRITES} attributes can be saved at once; send only the changed rows"
            ),
        ));
    }
    let mut seen = std::collections::HashSet::new();
    attributes
        .into_iter()
        .map(|attribute| {
            if !seen.insert(attribute.key.clone()) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    format!(
                        "attribute '{}' appears more than once; send each key once",
                        attribute.key
                    ),
                ));
            }
            admin_attribute_write(AdminAttributeInput {
                key: attribute.key,
                value: attribute.value,
                status: attribute.status,
                confidence: attribute.confidence,
                source_url: attribute.source_url,
                notes: attribute.notes,
            })
            .map_err(|message| (StatusCode::BAD_REQUEST, message))
        })
        .collect()
}

/// Each vendor gains an `attributes` object covering every applicable catalog key (unknowns
/// explicit), so the admin editor can render a row per key without a second request.
async fn wedding_vendors_with_attributes(
    db: &crate::db::Db,
    vendors: Vec<WeddingVendorRecord>,
) -> Result<Vec<Value>, (StatusCode, String)> {
    let vendor_ids = vendors
        .iter()
        .map(|vendor| vendor.vendor_id.clone())
        .collect::<Vec<_>>();
    let mut attributes = db
        .list_wedding_vendor_attributes(&vendor_ids)
        .await
        .map_err(readiness_error_to_http)?;
    Ok(vendors
        .into_iter()
        .map(|vendor| {
            let rows = attributes.remove(&vendor.vendor_id).unwrap_or_default();
            let materialised = attributes_with_unknowns(&vendor.category, &rows);
            let mut value = serde_json::to_value(&vendor).unwrap_or(Value::Null);
            if let Some(object) = value.as_object_mut() {
                object.insert("attributes".to_string(), materialised);
            }
            value
        })
        .collect())
}

pub(super) fn wedding_vendor_write_input(
    body: WeddingVendorWriteRequest,
) -> Result<WeddingVendorUpsertRecord, (StatusCode, String)> {
    let photo_requests = body.photos.unwrap_or_default();
    if photo_requests.len() > 3 {
        return Err((
            StatusCode::BAD_REQUEST,
            "vendors can have at most 3 photos".to_string(),
        ));
    }
    let mut seen_photo_slots = std::collections::HashSet::new();
    let photos = photo_requests
        .into_iter()
        .map(|photo| {
            if !(1..=3).contains(&photo.slot) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "photo slot must be 1, 2, or 3".to_string(),
                ));
            }
            if !seen_photo_slots.insert(photo.slot) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "photo slots must be unique".to_string(),
                ));
            }
            let photo_url = validate_optional_http_url(Some(photo.photo_url), "photo_url")?
                .ok_or_else(|| (StatusCode::BAD_REQUEST, "photo_url is required".to_string()))?;
            Ok(WeddingVendorPhotoUpsertRecord {
                slot: photo.slot,
                photo_url,
                alt_text: clean_optional_string(photo.alt_text),
                source_label: clean_optional_string(photo.source_label),
                source_url: validate_optional_http_url(photo.source_url, "photo source_url")?,
                retrieved_at: clean_optional_string(photo.retrieved_at),
                licence_metadata: photo
                    .licence_metadata
                    .unwrap_or_else(|| serde_json::json!({})),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(WeddingVendorUpsertRecord {
        vendor_slug: validate_vendor_slug(body.vendor_slug)?,
        vendor_name: clean_required_string(body.vendor_name, "vendor_name")?,
        category: clean_required_string(body.category, "category")?,
        service_area: clean_required_string(body.service_area, "service_area")?,
        address: clean_optional_string(body.address),
        website_url: validate_optional_http_url(body.website_url, "website_url")?,
        contact_phone: clean_optional_string(body.contact_phone),
        contact_email: clean_optional_string(body.contact_email),
        source_url: validate_optional_http_url(body.source_url, "source_url")?,
        source_label: clean_optional_string(body.source_label),
        source_checked_at: validate_optional_date(body.source_checked_at, "source_checked_at")?,
        status: validate_vendor_status(body.status)?,
        notes: clean_optional_string(body.notes),
        evidence: body.evidence.unwrap_or_else(|| serde_json::json!({})),
        caveat_labels: body.caveat_labels.unwrap_or_default(),
        photos,
    })
}

pub(super) fn parse_meminfo_bytes(input: &str) -> Option<(u64, u64)> {
    let mut total_kib: Option<u64> = None;
    let mut available_kib: Option<u64> = None;
    let mut free_kib: Option<u64> = None;
    for line in input.lines() {
        let mut parts = line.split_whitespace();
        let Some(label) = parts.next() else {
            continue;
        };
        let value = parts.next().and_then(|raw| raw.parse::<u64>().ok());
        match (label.trim_end_matches(':'), value) {
            ("MemTotal", Some(value)) => total_kib = Some(value),
            ("MemAvailable", Some(value)) => available_kib = Some(value),
            ("MemFree", Some(value)) => free_kib = Some(value),
            _ => {}
        }
    }
    let total = total_kib?;
    let available = available_kib.or(free_kib)?;
    let used = total.saturating_sub(available);
    Some((used.saturating_mul(1024), total.saturating_mul(1024)))
}

pub(super) fn parse_df_bytes(input: &str) -> Option<(u64, u64)> {
    input
        .lines()
        .skip(1)
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            let total = parts.get(1)?.parse::<u64>().ok()?;
            let used = parts.get(2)?.parse::<u64>().ok()?;
            (used <= total).then_some((used, total))
        })
        .next()
}

fn read_oracle_memory_metrics() -> Option<(u64, u64)> {
    std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|content| parse_meminfo_bytes(&content))
}

fn read_oracle_disk_metrics() -> Option<(u64, u64)> {
    let root = std::env::var("OMNYID_ADMIN_WEDDING_OPS_METRICS_ROOT")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/".to_string());
    let output = std::process::Command::new("df")
        .args(["-B1", root.as_str()])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8(output.stdout).ok()?;
    parse_df_bytes(&stdout)
}

fn oracle_metrics_source_label() -> String {
    std::env::var("OMNYID_ADMIN_WEDDING_OPS_METRICS_SOURCE")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            std::env::var("HOSTNAME")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .or_else(|| {
            std::fs::read_to_string("/etc/hostname")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| "oracle-host".to_string())
}

fn env_flag_enabled(key: &str) -> bool {
    env_flag_value(key).unwrap_or(false)
}

fn env_flag_value(key: &str) -> Option<bool> {
    std::env::var(key)
        .ok()
        .map(|value| match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        })
        .flatten()
}

fn env_positive_number(key: &str) -> bool {
    std::env::var(key)
        .ok()
        .and_then(|value| value.trim().parse::<f64>().ok())
        .is_some_and(|value| value.is_finite() && value > 0.0)
}

pub(super) fn admin_wedding_ai_routing_policy_json() -> Value {
    let routing_enabled = wedding_admin_ai_policy::routing_enabled();
    let audit_receipts_enabled = wedding_admin_ai_policy::audit_receipts_enabled();
    let daily_request_limit = wedding_admin_ai_policy::daily_request_limit();
    let model_configured = hosted_wedding_draft_model_configured();
    let execution_enabled = wedding_admin_ai_policy::execution_enabled() && model_configured;
    serde_json::json!({
        "backendPolicyEndpointMounted": true,
        "auditReceiptProjectionReady": routing_enabled && audit_receipts_enabled,
        "tenantBoundaryEnforced": true,
        "budgetGuardrailsReady": routing_enabled && daily_request_limit.is_some(),
        "weddingTemplateScopeOnly": true,
        "masterAgentQueryExcluded": true,
        "adminModelConfigured": model_configured,
        "dailyRequestLimit": daily_request_limit,
        "executionEnabled": execution_enabled,
        "lastVerifiedAt": chrono::Utc::now().to_rfc3339(),
        "policySourceLabel": "admin-wedding-ai-routing-policy",
        "routingEnabled": routing_enabled,
    })
}

fn admin_wedding_api_provider_status_json(
    spec: AdminToolSecretSpec,
    connected_app_id: &'static str,
    required_for_stack: bool,
) -> Value {
    let status = admin_tool_secret_status(spec);
    serde_json::json!({
        "providerId": status.provider_id,
        "connectedAppId": connected_app_id,
        "label": status.label,
        "credentialRequired": true,
        "configured": status.configured,
        "sourceLabel": status.source_label,
        "requiredForStack": required_for_stack,
    })
}

pub(super) fn admin_wedding_api_stack_json() -> Value {
    let providers = vec![
        admin_wedding_api_provider_status_json(ANTHROPIC_LLM_SPEC, "anthropic-llm", true),
        admin_wedding_api_provider_status_json(BRAVE_SEARCH_SPEC, "brave-search-api", false),
        admin_wedding_api_provider_status_json(GOOGLE_PLACES_SPEC, "google-places-api", true),
        admin_wedding_api_provider_status_json(GOOGLE_MAPS_SPEC, "google-maps-platform", true),
        admin_wedding_api_provider_status_json(GOOGLE_CALENDAR_SPEC, "gcal", true),
        admin_wedding_api_provider_status_json(WEATHER_API_SPEC, "weatherapi", true),
        admin_wedding_api_provider_status_json(STRIPE_SPEC, "stripe", true),
        admin_wedding_api_provider_status_json(TWILIO_SPEC, "twilio-messaging", false),
        admin_wedding_api_provider_status_json(CLOUDINARY_SPEC, "cloudinary", false),
    ];
    let connected_app_ids = providers
        .iter()
        .filter(|provider| {
            provider
                .get("configured")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .filter_map(|provider| provider.get("connectedAppId").and_then(Value::as_str))
        .collect::<Vec<_>>();
    serde_json::json!({
        "providers": providers,
        "connectedAppIds": connected_app_ids,
        "guardrails": [
            "Provider keys are resolved on the server only and are never serialized to users.",
            "Users receive provider readiness, source labels, and blockers but never raw API keys.",
            "Wedding planner provider calls must write wedding_shared_tool_usage_event before they are treated as production-ready.",
            "Admin-funded providers are scoped to wedding-template background work and approved actions."
        ],
    })
}

fn env_optional_trimmed(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn admin_third_party_tool_policy_json() -> Value {
    admin_third_party_tool_policy_json_with_file(admin_third_party_tool_policy_file_path())
}

fn admin_third_party_tool_policy_tools() -> [(&'static str, &'static str); 8] {
    [
        ("brave-search-api", "OMNYID_ADMIN_TOOL_BRAVE_SEARCH_API"),
        ("google-places-api", "OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API"),
        (
            "google-maps-platform",
            "OMNYID_ADMIN_TOOL_GOOGLE_MAPS_PLATFORM",
        ),
        ("gcal", "OMNYID_ADMIN_TOOL_GOOGLE_CALENDAR"),
        ("weatherapi", "OMNYID_ADMIN_TOOL_WEATHERAPI"),
        ("twilio-messaging", "OMNYID_ADMIN_TOOL_TWILIO_MESSAGING"),
        ("stripe", "OMNYID_ADMIN_TOOL_STRIPE"),
        ("cloudinary", "OMNYID_ADMIN_TOOL_CLOUDINARY"),
    ]
}

fn admin_third_party_tool_policy_file_path() -> Option<String> {
    env_optional_trimmed("OMNYID_ADMIN_THIRD_PARTY_TOOL_POLICY_FILE")
}

pub(super) fn admin_third_party_tool_policy_json_with_file(
    policy_file_path: Option<String>,
) -> Value {
    let mut policies: Vec<Value> = admin_third_party_tool_policy_tools()
        .iter()
        .map(|(tool_id, prefix)| {
            serde_json::json!({
                "toolId": tool_id,
                "enabledForAllUsers": env_flag_value(&format!("{prefix}_ALL_USERS_ENABLED")).unwrap_or(false),
                "enabledForWeddingTemplate": env_flag_value(&format!("{prefix}_WEDDING_TEMPLATE_ENABLED"))
                    .unwrap_or_else(|| admin_third_party_tool_default_wedding_enabled(tool_id)),
                "monthlyFreeQuotaLabel": env_optional_trimmed(&format!("{prefix}_MONTHLY_FREE_QUOTA_LABEL")),
                "quotaUsedLabel": env_optional_trimmed(&format!("{prefix}_QUOTA_USED_LABEL")),
            })
        })
        .collect();
    if let Some(path) = policy_file_path {
        if let Ok(content) = std::fs::read_to_string(path) {
            if let Ok(file_policy) = serde_json::from_str::<Value>(&content) {
                merge_admin_third_party_tool_file_policy(&mut policies, &file_policy);
            }
        }
    }
    serde_json::json!({
        "policies": policies,
        "updatedAt": chrono::Utc::now().to_rfc3339(),
        "sourceLabel": "admin-third-party-tool-policy-env",
    })
}

fn admin_third_party_tool_default_wedding_enabled(tool_id: &str) -> bool {
    matches!(
        tool_id,
        "brave-search-api" | "google-places-api" | "google-maps-platform" | "weatherapi"
    )
}

fn merge_admin_third_party_tool_file_policy(policies: &mut [Value], file_policy: &Value) {
    let Some(file_policies) = file_policy.get("policies").and_then(Value::as_array) else {
        return;
    };
    for file_record in file_policies {
        let Some(tool_id) = file_record.get("toolId").and_then(Value::as_str) else {
            continue;
        };
        if let Some(existing) = policies.iter_mut().find(|entry| entry["toolId"] == tool_id) {
            if let Some(value) = file_record
                .get("enabledForAllUsers")
                .and_then(Value::as_bool)
            {
                existing["enabledForAllUsers"] = Value::Bool(value);
            }
            if let Some(value) = file_record
                .get("enabledForWeddingTemplate")
                .and_then(Value::as_bool)
            {
                existing["enabledForWeddingTemplate"] = Value::Bool(value);
            }
            if let Some(value) = file_record
                .get("monthlyFreeQuotaLabel")
                .and_then(Value::as_str)
            {
                existing["monthlyFreeQuotaLabel"] = Value::String(value.trim().to_string());
            }
            if let Some(value) = file_record.get("quotaUsedLabel").and_then(Value::as_str) {
                existing["quotaUsedLabel"] = Value::String(value.trim().to_string());
            }
        }
    }
}

pub(super) fn sanitize_admin_third_party_tool_policy(
    body: AdminThirdPartyToolPolicyWriteRequest,
) -> Result<Value, (StatusCode, String)> {
    let allowed_tools = admin_third_party_tool_policy_tools()
        .iter()
        .map(|(tool_id, _)| *tool_id)
        .collect::<std::collections::HashSet<_>>();
    let mut seen = std::collections::HashSet::new();
    let mut policies = Vec::new();
    for record in body.policies {
        let tool_id = clean_required_string(record.tool_id, "toolId")?;
        if !allowed_tools.contains(tool_id.as_str()) {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("unsupported toolId: {tool_id}"),
            ));
        }
        if !seen.insert(tool_id.clone()) {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("duplicate toolId: {tool_id}"),
            ));
        }
        policies.push(serde_json::json!({
            "toolId": tool_id,
            "enabledForAllUsers": record.enabled_for_all_users.unwrap_or(false),
            "enabledForWeddingTemplate": record.enabled_for_wedding_template.unwrap_or(false),
            "monthlyFreeQuotaLabel": clean_optional_string(record.monthly_free_quota_label),
            "quotaUsedLabel": clean_optional_string(record.quota_used_label),
        }));
    }
    Ok(serde_json::json!({
        "policies": policies,
        "updatedAt": chrono::Utc::now().to_rfc3339(),
        "sourceLabel": "admin-third-party-tool-policy-file",
    }))
}

pub(super) async fn admin_wedding_ai_routing_policy_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    Ok(Json(admin_wedding_ai_routing_policy_json()))
}

pub(super) async fn admin_wedding_api_stack_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    Ok(Json(admin_wedding_api_stack_json()))
}

pub(super) async fn admin_third_party_tool_policy_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    Ok(Json(admin_third_party_tool_policy_json()))
}

pub(super) async fn admin_third_party_tool_policy_update_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AdminThirdPartyToolPolicyWriteRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let Some(path) = admin_third_party_tool_policy_file_path() else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Admin shared-tool policy saving is not configured on this server.".to_string(),
        ));
    };
    let policy = sanitize_admin_third_party_tool_policy(body)?;
    let serialized = serde_json::to_string_pretty(&policy).map_err(internal_http_error)?;
    if let Some(parent) = std::path::Path::new(&path)
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent).map_err(|err| {
            tracing::error!(error = %err, path = %parent.display(), "failed to prepare admin third-party tool policy directory");
            internal_http_error(err)
        })?;
    }
    std::fs::write(&path, serialized).map_err(|err| {
        tracing::error!(error = %err, path = %path, "failed to save admin third-party tool policy");
        internal_http_error(err)
    })?;
    Ok(Json(admin_third_party_tool_policy_json_with_file(Some(
        path,
    ))))
}

pub(super) async fn admin_wedding_ops_metrics_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let disk = read_oracle_disk_metrics();
    let ram = read_oracle_memory_metrics();
    Ok(Json(serde_json::json!({
        "disk_used_bytes": disk.map(|value| value.0),
        "disk_total_bytes": disk.map(|value| value.1),
        "ram_used_bytes": ram.map(|value| value.0),
        "ram_total_bytes": ram.map(|value| value.1),
        "source_label": oracle_metrics_source_label(),
        "generated_at": chrono::Utc::now().to_rfc3339(),
    })))
}

pub(super) async fn admin_wedding_waitlist_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let signups = state
        .db
        .list_wedding_waitlist_signups(500)
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(serde_json::json!({ "signups": signups })))
}

pub(super) async fn admin_wedding_vendors_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<AdminWeddingVendorListQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let vendors = state
        .db
        .list_wedding_vendors(
            wedding_vendor_list_limit(params.limit),
            params.query.as_deref(),
        )
        .await
        .map_err(readiness_error_to_http)?;
    let vendors = wedding_vendors_with_attributes(&state.db, vendors).await?;
    Ok(Json(serde_json::json!({
        "vendors": vendors,
        "attribute_catalog": attribute_catalog_json(),
    })))
}

pub(super) async fn admin_wedding_vendor_create_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(mut body): Json<WeddingVendorWriteRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let attribute_writes = wedding_vendor_attribute_writes(body.attributes.take())?;
    let input = wedding_vendor_write_input(body)?;
    let vendor = state
        .db
        .upsert_wedding_vendor(None, &input, &operator_user.id)
        .await
        .map_err(readiness_error_to_http)?;
    write_operator_attributes(
        &state.db,
        &vendor.vendor_id,
        &attribute_writes,
        &operator_user.id,
    )
    .await?;
    Ok(Json(serde_json::json!({ "vendor": vendor })))
}

pub(super) async fn admin_wedding_vendor_update_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(vendor_id): Path<String>,
    Json(mut body): Json<WeddingVendorWriteRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let attribute_writes = wedding_vendor_attribute_writes(body.attributes.take())?;
    let input = wedding_vendor_write_input(body)?;
    let vendor = state
        .db
        .upsert_wedding_vendor(Some(vendor_id.trim()), &input, &operator_user.id)
        .await
        .map_err(readiness_error_to_http)?;
    write_operator_attributes(
        &state.db,
        &vendor.vendor_id,
        &attribute_writes,
        &operator_user.id,
    )
    .await?;
    Ok(Json(serde_json::json!({ "vendor": vendor })))
}

async fn write_operator_attributes(
    db: &crate::db::Db,
    vendor_id: &str,
    writes: &[VendorAttributeWrite],
    operator_user_id: &str,
) -> Result<(), (StatusCode, String)> {
    for write in writes {
        db.upsert_wedding_vendor_attribute(vendor_id, write, Some(operator_user_id))
            .await
            .map_err(readiness_error_to_http)?;
    }
    Ok(())
}

pub(super) async fn admin_wedding_vendor_delete_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(vendor_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let operator_user = authenticated_user(&state.db, &headers).await?;
    if !super::cost_controls::operator_access_allowed(&operator_user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "operator access required".to_string(),
        ));
    }
    let deleted = state
        .db
        .delete_wedding_vendor(vendor_id.trim())
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(
        serde_json::json!({ "ok": deleted, "vendor_id": vendor_id }),
    ))
}

async fn wedding_vendor_contact_record_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(vendor_id): Path<String>,
    Json(body): Json<WeddingVendorContactRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let contact_method = validate_contact_method(body.contact_method)?;
    let follow_up_due_at = validate_optional_rfc3339(body.follow_up_due_at, "follow_up_due_at")?;
    let response_received_at =
        validate_optional_rfc3339(body.response_received_at, "response_received_at")?;
    let contact = state
        .db
        .record_wedding_vendor_contact(
            &user.id,
            vendor_id.trim(),
            &contact_method,
            follow_up_due_at.as_deref(),
            response_received_at.as_deref(),
            clean_optional_string(body.thread_id).as_deref(),
            clean_optional_string(body.receipt_ref).as_deref(),
            clean_optional_string(body.notes).as_deref(),
        )
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(serde_json::json!({ "contact": contact })))
}

async fn wedding_vendor_follow_up_reschedule_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(vendor_id): Path<String>,
    Json(body): Json<WeddingVendorFollowUpRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let follow_up_due_at = validate_optional_rfc3339(
        Some(body.follow_up_due_at),
        "follow_up_due_at",
    )?
    .ok_or_else(|| (StatusCode::BAD_REQUEST, "follow_up_due_at is required".to_string()))?;
    let contact = state
        .db
        .reschedule_wedding_vendor_follow_up(&user.id, vendor_id.trim(), &follow_up_due_at)
        .await
        .map_err(readiness_error_to_http)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "vendor contact was not found".to_string()))?;
    Ok(Json(serde_json::json!({ "contact": contact })))
}

pub(super) async fn wedding_vendors_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<AdminWeddingVendorListQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let vendors = state
        .db
        .list_active_wedding_vendors_for_user(
            &user.id,
            wedding_vendor_list_limit(params.limit),
            params.query.as_deref(),
        )
        .await
        .map_err(readiness_error_to_http)?;
    let vendors = wedding_vendors_with_attributes(&state.db, vendors).await?;
    Ok(Json(serde_json::json!({
        "vendors": vendors,
        "attribute_catalog": attribute_catalog_json(),
    })))
}

pub(super) async fn wedding_onboarding_state_get_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<WeddingOnboardingStateQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let wedding_plan_id = clean_required_string(params.wedding_plan_id, "wedding_plan_id")?;
    let onboarding_state = state
        .db
        .get_wedding_user_onboarding_state(&user.id, &wedding_plan_id)
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(
        serde_json::json!({ "onboarding_state": onboarding_state }),
    ))
}

pub(super) async fn wedding_onboarding_state_upsert_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<WeddingOnboardingStateUpsertRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let wedding_plan_id = clean_required_string(body.wedding_plan_id, "wedding_plan_id")?;
    let intake_variant = validate_wedding_intake_source(body.intake_variant, "intake_variant")?;
    let entry_source = validate_wedding_intake_source(body.entry_source, "entry_source")?;
    let onboarding_state = state
        .db
        .upsert_wedding_user_onboarding_state(
            &user.id,
            &wedding_plan_id,
            &intake_variant,
            &entry_source,
            body.admin_data_consent,
        )
        .await
        .map_err(readiness_error_to_http)?;
    Ok(Json(
        serde_json::json!({ "onboarding_state": onboarding_state }),
    ))
}
#[derive(serde::Deserialize)]
struct WeddingVendorContactRequest {
    contact_method: String,
    follow_up_due_at: Option<String>,
    response_received_at: Option<String>,
    thread_id: Option<String>,
    receipt_ref: Option<String>,
    notes: Option<String>,
}

#[derive(serde::Deserialize)]
struct WeddingVendorFollowUpRequest {
    follow_up_due_at: String,
}

pub(super) fn contact_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/wedding/vendors/{vendor_id}/contact",
            post(wedding_vendor_contact_record_http),
        )
        .route(
            "/wedding/vendors/{vendor_id}/follow-up",
            axum::routing::patch(wedding_vendor_follow_up_reschedule_http),
        )
}
