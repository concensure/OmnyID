use std::sync::Arc;

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::Value;

use super::{
    AppState, auth::authenticated_user, internal_error, load_runtime_operational_guidance,
    status_to_http,
};
use crate::secret_manager::read_process_secret_trimmed;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct StoragePolicy {
    pub quota_bytes: i64,
    pub max_upload_bytes: i64,
    pub addon_count: u32,
}

const GIB_BYTES: i64 = 1024 * 1024 * 1024;
const FREE_STORAGE_BYTES: i64 = 5 * GIB_BYTES;
const PAID_STORAGE_BYTES: i64 = 15 * GIB_BYTES;
const STORAGE_ADDON_BYTES: i64 = 10 * GIB_BYTES;
const FREE_MAX_UPLOAD_BYTES: i64 = 25 * 1024 * 1024;
const PAID_MAX_UPLOAD_BYTES: i64 = 100 * 1024 * 1024;

pub(crate) fn storage_policy_for_plan(plan: &str) -> StoragePolicy {
    let raw = plan.trim().to_ascii_lowercase();
    let is_free = raw.is_empty()
        || matches!(raw.as_str(), "free" | "trial" | "starter" | "inactive")
        || raw.contains("free")
        || raw.contains("trial");
    if is_free {
        return StoragePolicy {
            quota_bytes: FREE_STORAGE_BYTES,
            max_upload_bytes: FREE_MAX_UPLOAD_BYTES,
            addon_count: 0,
        };
    }

    let addon_count = if raw.contains("20gb") || raw.contains("addon2") || raw.contains("plus2") {
        2
    } else if raw.contains("addon")
        || raw.contains("10gb")
        || raw.contains("extra_storage")
        || raw.contains("plus_storage")
        || raw.contains("storage_plus")
    {
        1
    } else {
        0
    };

    StoragePolicy {
        quota_bytes: PAID_STORAGE_BYTES + (addon_count as i64 * STORAGE_ADDON_BYTES),
        max_upload_bytes: PAID_MAX_UPLOAD_BYTES,
        addon_count,
    }
}

pub(crate) fn enrich_billing_status_with_storage(
    status: &mut Value,
    used_bytes: i64,
) -> StoragePolicy {
    let plan = status.get("plan").and_then(Value::as_str).unwrap_or("free");
    let policy = storage_policy_for_plan(plan);
    let remaining_bytes = (policy.quota_bytes - used_bytes).max(0);
    let quota_exceeded = used_bytes > policy.quota_bytes;
    status["storage_quota_bytes"] = serde_json::json!(policy.quota_bytes);
    status["max_single_upload_bytes"] = serde_json::json!(policy.max_upload_bytes);
    status["storage_used_bytes"] = serde_json::json!(used_bytes);
    status["storage_remaining_bytes"] = serde_json::json!(remaining_bytes);
    status["storage_addon_count"] = serde_json::json!(policy.addon_count);
    status["quota_state"] = serde_json::json!(if quota_exceeded { "exceeded" } else { "ok" });
    let archive_only_enabled = status
        .get("archive_only_enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    status["archive_only_enabled"] = serde_json::json!(archive_only_enabled);
    status["archive_only_available"] = serde_json::json!(true);
    status["archive_only_warning"] = serde_json::json!(if quota_exceeded && archive_only_enabled {
        "Archive-only mode is active. Stored material remains accessible, but uploads stay blocked until storage headroom is restored or the plan is upgraded. Retrieval quality and agent performance may degrade while over quota."
    } else if quota_exceeded {
        "Storage quota exceeded. Enable archive-only mode to keep stored material accessible while uploads remain blocked, or upgrade storage to restore headroom. Retrieval quality and agent performance may degrade while over quota."
    } else if archive_only_enabled {
        "Archive-only mode is active. Stored material remains accessible, but new hot-storage workflows may stay constrained until you turn the mode off."
    } else {
        "Archive-only mode preserves access to stored material, but retrieval quality and agent performance will degrade until storage headroom is restored."
    });
    let self_serve = billing_self_serve_config();
    status["checkout_available"] = serde_json::json!(self_serve.checkout_enabled);
    status["billing_portal_available"] = serde_json::json!(self_serve.portal_enabled);
    policy
}

#[derive(Deserialize)]
pub(super) struct ArchiveOnlyModeBody {
    enabled: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct BillingSelfServeConfig {
    checkout_enabled: bool,
    portal_enabled: bool,
}

#[derive(Deserialize)]
pub(super) struct BillingCheckoutBody {
    plan: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct ExternalToolUsageBody {
    tool_slug: String,
    tool_name: Option<String>,
    provider_key: String,
    provider_category: String,
    billing_category: String,
    usage_unit: String,
    quantity: f64,
    estimated_cost_usd: f64,
    currency: Option<String>,
    source: Option<String>,
    occurred_at: Option<String>,
    metadata_json: Option<Value>,
}

fn normalize_usage_event_text(value: &str, max_len: usize) -> Option<String> {
    let normalized = value.trim();
    if normalized.is_empty()
        || normalized.len() > max_len
        || normalized.chars().any(|ch| ch.is_control())
    {
        return None;
    }
    Some(normalized.to_string())
}

fn normalize_usage_event_optional_text(value: Option<String>, max_len: usize) -> Option<String> {
    let normalized = value?;
    normalize_usage_event_text(&normalized, max_len)
}

fn usage_event_number_is_valid(value: f64) -> bool {
    value.is_finite() && (0.0..=1_000_000.0).contains(&value)
}

fn connected_tool_billing_json(record: &crate::db::McpToolConnectionRecord) -> Option<Value> {
    let descriptor = record.tool_descriptor.as_ref()?.as_object()?;
    let billing = descriptor.get("billing")?.as_object()?;
    Some(serde_json::json!({
        "tool_slug": record.tool_slug,
        "tool_name": record.tool_name,
        "connection_provider": record.connection_provider,
        "connected_at": record.connected_at,
        "provider_origin": "connected",
        "provider_key": billing.get("provider_key").and_then(Value::as_str).unwrap_or(""),
        "provider_category": billing.get("provider_category").and_then(Value::as_str).unwrap_or(""),
        "billing_category": billing.get("billing_category").and_then(Value::as_str).unwrap_or(""),
        "billing_model": billing.get("billing_model").and_then(Value::as_str).unwrap_or(""),
        "pricing_summary": billing.get("pricing_summary").and_then(Value::as_str).unwrap_or(""),
        "free_tier_summary": billing.get("free_tier_summary").and_then(Value::as_str),
        "production_caveat": billing.get("production_caveat").and_then(Value::as_str),
        "pricing_source_url": billing.get("pricing_source_url").and_then(Value::as_str),
        "default_usage_unit": billing.get("default_usage_unit").and_then(Value::as_str),
        "default_quantity_per_call": billing.get("default_quantity_per_call").and_then(Value::as_f64),
        "estimated_cost_usd_per_call": billing.get("estimated_cost_usd_per_call").and_then(Value::as_f64),
    }))
}

fn enrich_billing_status_with_external_tool_usage(
    status: &mut Value,
    connections: &[crate::db::McpToolConnectionRecord],
    usage_summary: &[crate::db::UserExternalToolUsageSummaryRow],
    recent_events: &[crate::db::UserExternalToolUsageEventRecord],
) {
    let connected_provider_keys = connections
        .iter()
        .filter_map(|record| {
            record
                .tool_descriptor
                .as_ref()?
                .as_object()?
                .get("billing")?
                .as_object()?
                .get("provider_key")?
                .as_str()
                .map(|value| value.trim().to_ascii_lowercase())
        })
        .filter(|value| !value.is_empty())
        .collect::<std::collections::BTreeSet<_>>();

    let total_estimated_cost_usd: f64 = usage_summary
        .iter()
        .map(|row| row.total_estimated_cost_usd.max(0.0))
        .sum();
    let connected_estimated_cost_usd: f64 = usage_summary
        .iter()
        .filter(|row| {
            connected_provider_keys.contains(&row.provider_key.trim().to_ascii_lowercase())
        })
        .map(|row| row.total_estimated_cost_usd.max(0.0))
        .sum();
    let built_in_estimated_cost_usd =
        (total_estimated_cost_usd - connected_estimated_cost_usd).max(0.0);

    let mut categories = std::collections::BTreeMap::<String, (f64, f64, u64)>::new();
    for row in usage_summary {
        let entry = categories
            .entry(row.billing_category.clone())
            .or_insert((0.0, 0.0, 0));
        entry.0 += row.total_quantity.max(0.0);
        entry.1 += row.total_estimated_cost_usd.max(0.0);
        entry.2 += row.event_count;
    }

    status["external_tool_billing"] = serde_json::json!({
        "current_month_start": chrono::Utc::now()
            .format("%Y-%m-01T00:00:00Z")
            .to_string(),
        "total_estimated_cost_usd": total_estimated_cost_usd,
        "connected_estimated_cost_usd": connected_estimated_cost_usd,
        "built_in_estimated_cost_usd": built_in_estimated_cost_usd,
        "currency": "USD",
        "coverage": {
            "measurement_state": "estimated_usage",
            "settlement_state": "not_settled",
            "coverage_summary": "External-provider totals are estimated from recorded usage events and configured pricing metadata, not settled provider invoices.",
            "retention": {
                "max_event_age_days": 90,
                "max_event_rows_per_user": 5000,
                "rollover_behavior": "older_usage_events_are_pruned_as_newer_events_arrive"
            },
            "caveats": [
                "Connected-provider rows reflect only usage events OmnyID recorded for this user account.",
                "Built-in provider rows reflect direct server-side provider calls recorded against this user account.",
                "Provider invoices, prepaid credits, rebates, taxes, and billing-rounding adjustments are not reconciled here yet."
            ]
        },
        "categories": categories.into_iter().map(|(billing_category, (total_quantity, total_estimated_cost_usd, event_count))| {
            serde_json::json!({
                "billing_category": billing_category,
                "total_quantity": total_quantity,
                "total_estimated_cost_usd": total_estimated_cost_usd,
                "event_count": event_count,
            })
        }).collect::<Vec<_>>(),
        "items": usage_summary.iter().map(|row| {
            let provider_origin = if connected_provider_keys
                .contains(&row.provider_key.trim().to_ascii_lowercase())
            {
                "connected"
            } else {
                "built_in"
            };
            serde_json::json!({
                "provider_origin": provider_origin,
                "provider_category": row.provider_category,
                "billing_category": row.billing_category,
                "tool_slug": row.tool_slug,
                "tool_name": row.tool_name,
                "provider_key": row.provider_key,
                "usage_unit": row.usage_unit,
                "total_quantity": row.total_quantity,
                "total_estimated_cost_usd": row.total_estimated_cost_usd,
                "latest_occurred_at": row.latest_occurred_at,
                "event_count": row.event_count,
            })
        }).collect::<Vec<_>>(),
        "recent_events": recent_events.iter().map(|event| {
            let provider_origin = if connected_provider_keys
                .contains(&event.provider_key.trim().to_ascii_lowercase())
            {
                "connected"
            } else {
                "built_in"
            };
            serde_json::json!({
                "id": event.id,
                "tool_slug": event.tool_slug,
                "tool_name": event.tool_name,
                "provider_origin": provider_origin,
                "provider_key": event.provider_key,
                "provider_category": event.provider_category,
                "billing_category": event.billing_category,
                "usage_unit": event.usage_unit,
                "quantity": event.quantity,
                "estimated_cost_usd": event.estimated_cost_usd,
                "currency": event.currency,
                "source": event.source,
                "occurred_at": event.occurred_at.to_rfc3339(),
                "recorded_at": event.recorded_at.to_rfc3339(),
            })
        }).collect::<Vec<_>>(),
        "connected_tools": connections
            .iter()
            .filter_map(connected_tool_billing_json)
            .collect::<Vec<_>>(),
    });
}

fn enrich_billing_status_with_operational_guidance(
    status: &mut Value,
    guidance: Option<crate::server::types::RuntimeOperationalGuidanceResponse>,
) {
    if let Some(guidance) = guidance {
        if let Ok(value) = serde_json::to_value(guidance) {
            status["operational_guidance"] = value;
        }
    }
}

fn stripe_secret_key_value() -> Option<String> {
    read_process_secret_trimmed("OMNYID_STRIPE_SECRET_KEY")
        .filter(|value| stripe_secret_key_looks_valid(value))
}

fn stripe_webhook_secret_value() -> Option<String> {
    read_process_secret_trimmed("OMNYID_STRIPE_WEBHOOK_SECRET")
        .filter(|value| stripe_webhook_secret_looks_valid(value))
}

fn stripe_secret_key_looks_valid(value: &str) -> bool {
    let trimmed = value.trim();
    (trimmed.starts_with("sk_live_") || trimmed.starts_with("sk_test_"))
        && trimmed.len() > "sk_test_".len()
}

fn stripe_webhook_secret_looks_valid(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.starts_with("whsec_") && trimmed.len() > "whsec_".len()
}

fn stripe_price_id_looks_valid(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.starts_with("price_") && trimmed.len() > "price_".len()
}

pub(crate) fn billing_workspace_base_url_is_configured() -> bool {
    billing_workspace_base_url().is_some()
}

fn billing_self_serve_config() -> BillingSelfServeConfig {
    let secret_present = stripe_secret_key_value().is_some();
    let webhook_secret_present = stripe_webhook_secret_value().is_some();
    let return_url_ready = billing_workspace_base_url_is_configured();
    let checkout_price_present = stripe_checkout_price_id_for_plan("pro")
        .as_deref()
        .map(stripe_price_id_looks_valid)
        .unwrap_or(false);
    BillingSelfServeConfig {
        checkout_enabled: secret_present
            && webhook_secret_present
            && return_url_ready
            && checkout_price_present,
        portal_enabled: secret_present && return_url_ready,
    }
}

fn stripe_secret_key_configured() -> Result<String, (StatusCode, String)> {
    stripe_secret_key_value().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Stripe self-serve billing is not configured on this server.".to_string(),
        )
    })
}

pub(crate) fn stripe_checkout_price_id_for_plan(plan: &str) -> Option<String> {
    let value = match plan.trim().to_ascii_lowercase().as_str() {
        "pro" => read_process_secret_trimmed("OMNYID_STRIPE_PRO_PRICE_ID")
            .or_else(|| read_process_secret_trimmed("OMNYID_STRIPE_CHECKOUT_PRICE_ID")),
        "team" => read_process_secret_trimmed("OMNYID_STRIPE_TEAM_PRICE_ID"),
        _ => None,
    }?;
    stripe_price_id_looks_valid(&value).then_some(value)
}

fn billing_workspace_base_url() -> Option<String> {
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

fn billing_workspace_return_url(status: &str) -> Result<String, (StatusCode, String)> {
    let base = billing_workspace_base_url().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Workspace return URL is not configured on this server.".to_string(),
        )
    })?;
    Ok(format!(
        "{}/workspace/?billing={status}",
        base.trim_end_matches('/')
    ))
}

async fn create_stripe_checkout_session(
    secret_key: &str,
    existing_customer_id: Option<&str>,
    customer_email: Option<&str>,
    account_id: &str,
    price_id: &str,
) -> Result<String, (StatusCode, String)> {
    let mut params = vec![
        ("mode".to_string(), "subscription".to_string()),
        ("line_items[0][price]".to_string(), price_id.to_string()),
        ("line_items[0][quantity]".to_string(), "1".to_string()),
        (
            "success_url".to_string(),
            billing_workspace_return_url("checkout_success")?,
        ),
        (
            "cancel_url".to_string(),
            billing_workspace_return_url("checkout_canceled")?,
        ),
        ("client_reference_id".to_string(), account_id.to_string()),
        ("allow_promotion_codes".to_string(), "true".to_string()),
        ("metadata[account_id]".to_string(), account_id.to_string()),
    ];
    if let Some(customer_id) = existing_customer_id.filter(|value| !value.trim().is_empty()) {
        params.push(("customer".to_string(), customer_id.to_string()));
    } else if let Some(email) = customer_email.filter(|value| !value.trim().is_empty()) {
        params.push(("customer_email".to_string(), email.to_string()));
    }

    let response = reqwest::Client::new()
        .post("https://api.stripe.com/v1/checkout/sessions")
        .basic_auth(secret_key, Some(""))
        .form(&params)
        .send()
        .await
        .map_err(|_| {
            (
                StatusCode::BAD_GATEWAY,
                "Stripe checkout session request failed.".to_string(),
            )
        })?;
    if !response.status().is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            "Stripe checkout session could not be created.".to_string(),
        ));
    }
    let payload: Value = response.json().await.map_err(|_| {
        (
            StatusCode::BAD_GATEWAY,
            "Stripe checkout session response was invalid.".to_string(),
        )
    })?;
    payload
        .get("url")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                "Stripe checkout session response was missing a redirect URL.".to_string(),
            )
        })
}

async fn create_stripe_billing_portal_session(
    secret_key: &str,
    customer_id: &str,
) -> Result<String, (StatusCode, String)> {
    let params = vec![
        ("customer".to_string(), customer_id.to_string()),
        (
            "return_url".to_string(),
            billing_workspace_return_url("portal_return")?,
        ),
    ];
    let response = reqwest::Client::new()
        .post("https://api.stripe.com/v1/billing_portal/sessions")
        .basic_auth(secret_key, Some(""))
        .form(&params)
        .send()
        .await
        .map_err(|_| {
            (
                StatusCode::BAD_GATEWAY,
                "Stripe billing portal session request failed.".to_string(),
            )
        })?;
    if !response.status().is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            "Stripe billing portal session could not be created.".to_string(),
        ));
    }
    let payload: Value = response.json().await.map_err(|_| {
        (
            StatusCode::BAD_GATEWAY,
            "Stripe billing portal response was invalid.".to_string(),
        )
    })?;
    payload
        .get("url")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                "Stripe billing portal response was missing a redirect URL.".to_string(),
            )
        })
}

/// POST /billing/webhook
///
/// Stripe webhook receiver. Idempotent via `stripe_event_id`.
/// Supported events: `customer.subscription.created/updated/deleted`,
/// `invoice.payment_succeeded`, `invoice.payment_failed`.
///
/// Set `OMNYID_STRIPE_WEBHOOK_SECRET` to enable signature verification.
pub(super) async fn billing_webhook_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: String,
) -> Result<Json<Value>, (StatusCode, String)> {
    // GAP-108: Stripe webhook signature verification is mandatory.
    // Set OMNYID_STRIPE_WEBHOOK_SECRET to the signing secret from the Stripe dashboard.
    // If the secret is absent the webhook is rejected unless
    // OMNYID_STRIPE_SKIP_WEBHOOK_VERIFY=true is explicitly set (dev/testing only).
    let webhook_secret = std::env::var("OMNYID_STRIPE_WEBHOOK_SECRET").ok();
    match &webhook_secret {
        Some(secret) => {
            let stripe_sig = headers
                .get("stripe-signature")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            if !verify_stripe_signature(&body, stripe_sig, secret) {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    "Invalid Stripe webhook signature".to_string(),
                ));
            }
        }
        None => {
            let skip = std::env::var("OMNYID_STRIPE_SKIP_WEBHOOK_VERIFY")
                .map(|v| matches!(v.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
                .unwrap_or(false);
            if !skip {
                tracing::error!(
                    "Stripe webhook rejected: OMNYID_STRIPE_WEBHOOK_SECRET is not set. \
                     Set it to the Stripe signing secret or set \
                     OMNYID_STRIPE_SKIP_WEBHOOK_VERIFY=true for local testing."
                );
                return Err((
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Webhook endpoint not configured".to_string(),
                ));
            }
            tracing::warn!("Stripe webhook signature verification is DISABLED — for testing only");
        }
    }

    let payload: Value = serde_json::from_str(&body)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid JSON".to_string()))?;

    let event_id = payload
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let event_type = payload
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    // Extract customer and subscription info from known event shapes.
    let (account_id, customer_id, subscription_id, plan, status, period_end) =
        extract_billing_event_fields(&payload);

    let inserted = state
        .db
        .record_billing_event(account_id.as_deref(), &event_id, &event_type, &payload)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    if !inserted {
        return Ok(Json(serde_json::json!({
            "received": true,
            "duplicate": true,
            "event_type": event_type,
        })));
    }

    if let Some(acct) = &account_id {
        state
            .db
            .upsert_billing_subscription(
                acct,
                customer_id.as_deref(),
                subscription_id.as_deref(),
                plan.as_deref().unwrap_or("pro"),
                status.as_deref().unwrap_or("active"),
                period_end.as_deref(),
            )
            .await
            .map_err(internal_error)
            .map_err(status_to_http)?;
    }

    Ok(Json(
        serde_json::json!({ "received": true, "duplicate": false, "event_type": event_type }),
    ))
}

const STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE_SECS: i64 = 300;

fn verify_stripe_signature(body: &str, stripe_sig: &str, secret: &str) -> bool {
    verify_stripe_signature_at(body, stripe_sig, secret, chrono::Utc::now().timestamp())
}

fn verify_stripe_signature_at(body: &str, stripe_sig: &str, secret: &str, now_secs: i64) -> bool {
    // Parse t= and v1= from the Stripe-Signature header.
    let mut timestamp = "";
    let mut signature = "";
    for part in stripe_sig.split(',') {
        if let Some(t) = part.strip_prefix("t=") {
            timestamp = t;
        }
        if let Some(v) = part.strip_prefix("v1=") {
            signature = v;
        }
    }
    if timestamp.is_empty() || signature.is_empty() {
        return false;
    }

    let Ok(timestamp_secs) = timestamp.parse::<i64>() else {
        return false;
    };
    if (now_secs - timestamp_secs).abs() > STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE_SECS {
        return false;
    }

    use hmac::Hmac;
    use sha2::Sha256;
    type HmacSha256 = Hmac<Sha256>;

    let signed_payload = format!("{timestamp}.{body}");
    let Ok(mut mac) = <HmacSha256 as hmac::Mac>::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    hmac::Mac::update(&mut mac, signed_payload.as_bytes());
    let expected = hex::encode(hmac::Mac::finalize(mac).into_bytes());
    expected == signature
}

fn extract_billing_event_fields(
    payload: &Value,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let data = payload.pointer("/data/object").unwrap_or(&Value::Null);
    let customer_id = data
        .get("customer")
        .and_then(Value::as_str)
        .map(str::to_string);
    let subscription_id = data
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| id.starts_with("sub_"))
        .map(str::to_string)
        .or_else(|| {
            data.get("subscription")
                .and_then(Value::as_str)
                .map(str::to_string)
        });
    let plan = data
        .pointer("/plan/nickname")
        .or_else(|| data.pointer("/items/data/0/plan/nickname"))
        .and_then(Value::as_str)
        .map(str::to_lowercase);
    let status = data
        .get("status")
        .and_then(Value::as_str)
        .map(str::to_string);
    let period_end = data
        .get("current_period_end")
        .and_then(Value::as_i64)
        .map(|ts| {
            chrono::DateTime::<chrono::Utc>::from_timestamp(ts, 0)
                .unwrap_or_default()
                .to_rfc3339()
        });
    // Only trust an explicit metadata.account_id binding to a local account.
    // A Stripe customer id is not a valid internal account identifier.
    let account_id = data
        .pointer("/metadata/account_id")
        .and_then(Value::as_str)
        .map(str::to_string);

    (
        account_id,
        customer_id,
        subscription_id,
        plan,
        status,
        period_end,
    )
}

/// GET /billing/status
///
/// Returns the current billing plan and subscription status for the authenticated account.
pub(super) async fn billing_status_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let mut status = state
        .db
        .get_billing_status(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let used_bytes = state
        .db
        .attachment_storage_bytes_for_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    enrich_billing_status_with_storage(&mut status, used_bytes);
    let tool_connections = state
        .db
        .list_mcp_tool_connections(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let usage_summary = state
        .db
        .summarize_user_external_tool_usage_current_month(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let recent_events = state
        .db
        .list_user_external_tool_usage_events(&user.id, 25)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    enrich_billing_status_with_external_tool_usage(
        &mut status,
        &tool_connections,
        &usage_summary,
        &recent_events,
    );
    enrich_billing_status_with_operational_guidance(
        &mut status,
        load_runtime_operational_guidance(),
    );

    Ok(Json(status))
}

pub(super) async fn billing_tool_usage_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ExternalToolUsageBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let tool_slug = normalize_usage_event_text(&body.tool_slug, 120).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "tool usage events require tool, provider, category, and usage unit fields."
                .to_string(),
        )
    })?;
    let provider_key = normalize_usage_event_text(&body.provider_key, 120).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "tool usage events require tool, provider, category, and usage unit fields."
                .to_string(),
        )
    })?;
    let provider_category =
        normalize_usage_event_text(&body.provider_category, 120).ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "tool usage events require tool, provider, category, and usage unit fields."
                    .to_string(),
            )
        })?;
    let billing_category =
        normalize_usage_event_text(&body.billing_category, 120).ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "tool usage events require tool, provider, category, and usage unit fields."
                    .to_string(),
            )
        })?;
    let usage_unit = normalize_usage_event_text(&body.usage_unit, 64).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "tool usage events require tool, provider, category, and usage unit fields."
                .to_string(),
        )
    })?;
    if !usage_event_number_is_valid(body.quantity)
        || !usage_event_number_is_valid(body.estimated_cost_usd)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "tool usage quantity and estimated cost must be finite non-negative numbers inside supported limits."
                .to_string(),
        ));
    }
    let tool_name = normalize_usage_event_optional_text(body.tool_name, 160)
        .unwrap_or_else(|| tool_slug.clone());
    let currency = normalize_usage_event_optional_text(body.currency, 16)
        .map(|value| value.to_ascii_uppercase());
    let source = normalize_usage_event_optional_text(body.source, 64);

    let inserted = state
        .db
        .record_user_external_tool_usage_event(&crate::db::UserExternalToolUsageEventInsert {
            user_id: user.id.clone(),
            tool_slug,
            tool_name,
            provider_key,
            provider_category,
            billing_category,
            usage_unit,
            quantity: body.quantity,
            estimated_cost_usd: body.estimated_cost_usd,
            currency,
            source,
            occurred_at: body.occurred_at,
            metadata_json: body.metadata_json,
        })
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(serde_json::json!({
        "ok": true,
        "event": {
            "id": inserted.id,
            "tool_slug": inserted.tool_slug,
            "tool_name": inserted.tool_name,
            "provider_key": inserted.provider_key,
            "provider_category": inserted.provider_category,
            "billing_category": inserted.billing_category,
            "usage_unit": inserted.usage_unit,
            "quantity": inserted.quantity,
            "estimated_cost_usd": inserted.estimated_cost_usd,
            "currency": inserted.currency,
            "source": inserted.source,
            "occurred_at": inserted.occurred_at.to_rfc3339(),
            "recorded_at": inserted.recorded_at.to_rfc3339(),
        }
    })))
}

pub(super) async fn billing_checkout_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<BillingCheckoutBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let secret_key = stripe_secret_key_configured()?;
    let requested_plan = body
        .plan
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("pro")
        .to_ascii_lowercase();
    let price_id = stripe_checkout_price_id_for_plan(&requested_plan).ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Stripe checkout is not configured for the requested plan.".to_string(),
        )
    })?;
    let status = state
        .db
        .get_billing_status(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let current_plan = status
        .get("plan")
        .and_then(Value::as_str)
        .unwrap_or("free")
        .trim()
        .to_ascii_lowercase();
    if !matches!(
        current_plan.as_str(),
        "" | "free" | "trial" | "starter" | "inactive"
    ) && current_plan == requested_plan
    {
        return Err((
            StatusCode::CONFLICT,
            "This workspace is already on that paid plan. Open the billing portal instead."
                .to_string(),
        ));
    }
    let checkout_url = create_stripe_checkout_session(
        &secret_key,
        status.get("stripe_customer_id").and_then(Value::as_str),
        Some(&user.email),
        &user.id,
        &price_id,
    )
    .await?;
    Ok(Json(serde_json::json!({
        "url": checkout_url,
        "plan": requested_plan,
    })))
}

pub(super) async fn billing_portal_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let secret_key = stripe_secret_key_configured()?;
    let status = state
        .db
        .get_billing_status(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let Some(customer_id) = status
        .get("stripe_customer_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Err((
            StatusCode::CONFLICT,
            "No Stripe customer is linked to this workspace yet. Start checkout first.".to_string(),
        ));
    };
    let portal_url = create_stripe_billing_portal_session(&secret_key, customer_id).await?;
    Ok(Json(serde_json::json!({ "url": portal_url })))
}

pub(super) async fn billing_archive_only_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ArchiveOnlyModeBody>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .set_archive_only_mode(&user.id, body.enabled)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    let mut status = state
        .db
        .get_billing_status(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    let used_bytes = state
        .db
        .attachment_storage_bytes_for_user(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    enrich_billing_status_with_storage(&mut status, used_bytes);
    enrich_billing_status_with_operational_guidance(
        &mut status,
        load_runtime_operational_guidance(),
    );

    Ok(Json(status))
}

#[cfg(test)]
mod tests {
    use super::{
        FREE_MAX_UPLOAD_BYTES, FREE_STORAGE_BYTES, PAID_MAX_UPLOAD_BYTES, PAID_STORAGE_BYTES,
        STORAGE_ADDON_BYTES, STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE_SECS, billing_self_serve_config,
        connected_tool_billing_json, enrich_billing_status_with_external_tool_usage,
        enrich_billing_status_with_operational_guidance, enrich_billing_status_with_storage,
        extract_billing_event_fields, normalize_usage_event_text, storage_policy_for_plan,
        usage_event_number_is_valid, verify_stripe_signature_at,
    };
    use crate::db::{
        McpToolConnectionRecord, UserExternalToolUsageEventRecord, UserExternalToolUsageSummaryRow,
    };
    use std::sync::{Mutex, OnceLock};

    fn billing_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn clear_billing_env() {
        for key in [
            "OMNYID_STRIPE_SECRET_KEY",
            "OMNYID_STRIPE_WEBHOOK_SECRET",
            "OMNYID_STRIPE_PRO_PRICE_ID",
            "OMNYID_STRIPE_CHECKOUT_PRICE_ID",
            "OMNYID_STRIPE_TEAM_PRICE_ID",
            "OMNYID_WORKSPACE_BASE_URL",
            "OMNYID_UI_BASE_URL",
            "OMNYID_HOMESERVER_URL",
        ] {
            unsafe {
                std::env::remove_var(key);
            }
        }
    }

    fn test_stripe_signature(secret: &str, timestamp_secs: i64, body: &str) -> String {
        use hmac::Hmac;
        use sha2::Sha256;
        type HmacSha256 = Hmac<Sha256>;

        let signed_payload = format!("{timestamp_secs}.{body}");
        let mut mac =
            <HmacSha256 as hmac::Mac>::new_from_slice(secret.as_bytes()).expect("test HMAC key");
        hmac::Mac::update(&mut mac, signed_payload.as_bytes());
        let signature = hex::encode(hmac::Mac::finalize(mac).into_bytes());
        format!("t={timestamp_secs},v1={signature}")
    }

    #[test]
    fn billing_event_fields_do_not_use_customer_id_as_account_id_fallback() {
        let payload = serde_json::json!({
            "data": {
                "object": {
                    "customer": "cus_test_123",
                    "id": "sub_test_456",
                    "status": "active"
                }
            }
        });

        let (account_id, customer_id, subscription_id, _plan, status, _period_end) =
            extract_billing_event_fields(&payload);
        assert_eq!(account_id, None);
        assert_eq!(customer_id.as_deref(), Some("cus_test_123"));
        assert_eq!(subscription_id.as_deref(), Some("sub_test_456"));
        assert_eq!(status.as_deref(), Some("active"));
    }

    #[test]
    fn billing_event_fields_use_metadata_account_id_when_present() {
        let payload = serde_json::json!({
            "data": {
                "object": {
                    "customer": "cus_test_123",
                    "subscription": "sub_test_456",
                    "status": "active",
                    "metadata": {
                        "account_id": "user_abc"
                    }
                }
            }
        });

        let (account_id, customer_id, subscription_id, _plan, status, _period_end) =
            extract_billing_event_fields(&payload);
        assert_eq!(account_id.as_deref(), Some("user_abc"));
        assert_eq!(customer_id.as_deref(), Some("cus_test_123"));
        assert_eq!(subscription_id.as_deref(), Some("sub_test_456"));
        assert_eq!(status.as_deref(), Some("active"));
    }

    #[test]
    fn stripe_webhook_signature_accepts_valid_recent_payload() {
        let secret = "whsec_test_secret";
        let body = r#"{"id":"evt_123","type":"invoice.payment_succeeded"}"#;
        let now_secs = 1_800_000_000;
        let header = test_stripe_signature(secret, now_secs - 30, body);

        assert!(verify_stripe_signature_at(body, &header, secret, now_secs));
    }

    #[test]
    fn stripe_webhook_signature_rejects_stale_payload() {
        let secret = "whsec_test_secret";
        let body = r#"{"id":"evt_123","type":"invoice.payment_succeeded"}"#;
        let now_secs = 1_800_000_000;
        let stale_ts = now_secs - STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE_SECS - 1;
        let header = test_stripe_signature(secret, stale_ts, body);

        assert!(!verify_stripe_signature_at(body, &header, secret, now_secs));
    }

    #[test]
    fn stripe_webhook_invalid_json_error_is_bounded() {
        let source = include_str!("billing.rs");
        assert!(
            !source.contains("format!(\"Invalid JSON: {e}\")"),
            "webhook JSON parse failures should not echo parser internals"
        );
        assert!(
            source.contains("\"Invalid JSON\".to_string()"),
            "webhook JSON parse failures should return a bounded client error"
        );
    }

    #[test]
    fn storage_policy_maps_free_like_plans() {
        let policy = storage_policy_for_plan("trial");
        assert_eq!(policy.quota_bytes, FREE_STORAGE_BYTES);
        assert_eq!(policy.max_upload_bytes, FREE_MAX_UPLOAD_BYTES);
        assert_eq!(policy.addon_count, 0);
    }

    #[test]
    fn storage_policy_maps_paid_and_addon_plans() {
        let paid = storage_policy_for_plan("pro");
        assert_eq!(paid.quota_bytes, PAID_STORAGE_BYTES);
        assert_eq!(paid.max_upload_bytes, PAID_MAX_UPLOAD_BYTES);
        assert_eq!(paid.addon_count, 0);

        let addon = storage_policy_for_plan("pro_plus_storage");
        assert_eq!(addon.quota_bytes, PAID_STORAGE_BYTES + STORAGE_ADDON_BYTES);
        assert_eq!(addon.max_upload_bytes, PAID_MAX_UPLOAD_BYTES);
        assert_eq!(addon.addon_count, 1);
    }

    #[test]
    fn storage_enrichment_marks_quota_exceeded_and_clamps_remaining_bytes() {
        let mut status = serde_json::json!({
            "account_id": "user_123",
            "plan": "free",
            "status": "active"
        });
        let policy = enrich_billing_status_with_storage(&mut status, FREE_STORAGE_BYTES + 1024);
        assert_eq!(policy.quota_bytes, FREE_STORAGE_BYTES);
        assert_eq!(status["quota_state"].as_str(), Some("exceeded"));
        assert_eq!(status["storage_remaining_bytes"].as_i64(), Some(0));
        assert_eq!(
            status["max_single_upload_bytes"].as_i64(),
            Some(FREE_MAX_UPLOAD_BYTES)
        );
        assert_eq!(status["archive_only_available"].as_bool(), Some(true));
        assert_eq!(status["archive_only_enabled"].as_bool(), Some(false));
    }

    #[test]
    fn storage_enrichment_keeps_paid_headroom_and_addon_count() {
        let mut status = serde_json::json!({
            "account_id": "user_456",
            "plan": "pro_plus_storage",
            "status": "active"
        });
        let policy = enrich_billing_status_with_storage(&mut status, PAID_STORAGE_BYTES);
        assert_eq!(policy.addon_count, 1);
        assert_eq!(status["quota_state"].as_str(), Some("ok"));
        assert_eq!(
            status["storage_remaining_bytes"].as_i64(),
            Some(STORAGE_ADDON_BYTES)
        );
        assert_eq!(status["storage_addon_count"].as_u64(), Some(1));
    }

    #[test]
    fn storage_enrichment_marks_archive_only_mode_when_enabled() {
        let mut status = serde_json::json!({
            "account_id": "user_789",
            "plan": "paid",
            "status": "active",
            "archive_only_enabled": true
        });
        enrich_billing_status_with_storage(&mut status, PAID_STORAGE_BYTES + 1);
        assert_eq!(status["archive_only_enabled"].as_bool(), Some(true));
        let warning = status["archive_only_warning"].as_str().unwrap_or("");
        assert!(warning.contains("Archive-only mode is active"));
        assert!(warning.contains("uploads stay blocked"));
    }

    #[test]
    fn billing_status_enrichment_mounts_operational_guidance_when_present() {
        let mut status = serde_json::json!({
            "account_id": "user_ops",
            "plan": "pro",
            "status": "active"
        });
        enrich_billing_status_with_operational_guidance(
            &mut status,
            Some(crate::server::types::RuntimeOperationalGuidanceResponse {
                status: "no_go".to_string(),
                summary: "Execute bounded cleanup before trusting runtime pressure state."
                    .to_string(),
                command: "./scripts/oracle-prune-operational-history.ps1 -Apply".to_string(),
                source: "artifacts/production-go-no-go-current/production-go-no-go.json"
                    .to_string(),
                pressure_status: Some("operational_history_present".to_string()),
                pressure_total_rows: Some(19_800),
                cleanup_mode: Some("dry_run".to_string()),
                generated_at: Some("2026-08-28T08:55:00Z".to_string()),
            }),
        );
        assert_eq!(
            status["operational_guidance"]["status"].as_str(),
            Some("no_go")
        );
        assert_eq!(
            status["operational_guidance"]["pressure_total_rows"].as_i64(),
            Some(19_800)
        );
    }

    #[test]
    fn stripe_webhook_signature_rejects_invalid_timestamp_field() {
        let secret = "whsec_test_secret";
        let body = r#"{"id":"evt_123","type":"invoice.payment_succeeded"}"#;
        let header = "t=not-a-timestamp,v1=abcdef";

        assert!(!verify_stripe_signature_at(
            body,
            header,
            secret,
            1_800_000_000
        ));
    }

    #[test]
    fn billing_self_serve_config_requires_secret_and_checkout_price() {
        let _guard = billing_env_lock().lock().expect("lock billing env");
        clear_billing_env();
        let config = billing_self_serve_config();
        assert!(!config.checkout_enabled);
        assert!(!config.portal_enabled);

        unsafe {
            std::env::set_var("OMNYID_STRIPE_SECRET_KEY", "sk_test_123");
            std::env::set_var("OMNYID_STRIPE_WEBHOOK_SECRET", "whsec_123");
            std::env::set_var("OMNYID_STRIPE_PRO_PRICE_ID", "price_123");
            std::env::set_var("OMNYID_WORKSPACE_BASE_URL", "https://app.omnyid.com");
        }
        let config = billing_self_serve_config();
        assert!(config.checkout_enabled);
        assert!(config.portal_enabled);

        clear_billing_env();
    }

    #[test]
    fn billing_self_serve_config_requires_workspace_return_url() {
        let _guard = billing_env_lock().lock().expect("lock billing env");
        clear_billing_env();
        unsafe {
            std::env::set_var("OMNYID_STRIPE_SECRET_KEY", "sk_test_123");
            std::env::set_var("OMNYID_STRIPE_WEBHOOK_SECRET", "whsec_123");
            std::env::set_var("OMNYID_STRIPE_PRO_PRICE_ID", "price_123");
        }
        let config = billing_self_serve_config();
        assert!(!config.checkout_enabled);
        assert!(!config.portal_enabled);
        clear_billing_env();
    }

    #[test]
    fn billing_self_serve_config_requires_webhook_for_checkout() {
        let _guard = billing_env_lock().lock().expect("lock billing env");
        clear_billing_env();
        unsafe {
            std::env::set_var("OMNYID_STRIPE_SECRET_KEY", "sk_test_123");
            std::env::set_var("OMNYID_STRIPE_PRO_PRICE_ID", "price_123");
            std::env::set_var("OMNYID_WORKSPACE_BASE_URL", "https://app.omnyid.com");
        }
        let config = billing_self_serve_config();
        assert!(!config.checkout_enabled);
        assert!(config.portal_enabled);
        clear_billing_env();
    }

    #[test]
    fn billing_self_serve_config_rejects_invalid_price_ids() {
        let _guard = billing_env_lock().lock().expect("lock billing env");
        clear_billing_env();
        unsafe {
            std::env::set_var("OMNYID_STRIPE_SECRET_KEY", "sk_test_123");
            std::env::set_var("OMNYID_STRIPE_WEBHOOK_SECRET", "whsec_123");
            std::env::set_var("OMNYID_STRIPE_PRO_PRICE_ID", "prod_123");
            std::env::set_var("OMNYID_WORKSPACE_BASE_URL", "https://app.omnyid.com");
        }
        let config = billing_self_serve_config();
        assert!(!config.checkout_enabled);
        assert!(config.portal_enabled);
        clear_billing_env();
    }

    #[test]
    fn connected_tool_billing_json_exposes_safe_billing_metadata() {
        let record = McpToolConnectionRecord {
            id: "conn_1".to_string(),
            tool_slug: "newsapi-org".to_string(),
            tool_name: "NewsAPI.org".to_string(),
            mcp_server_url: "https://example.test/mcp".to_string(),
            connected_at: "2026-08-26T10:00:00Z".to_string(),
            connection_provider: "direct".to_string(),
            external_user_id: None,
            composio_connected_account_id: None,
            tool_descriptor: Some(serde_json::json!({
                "billing": {
                    "provider_key": "newsapi-org",
                    "provider_category": "news_api",
                    "billing_category": "news_api",
                    "billing_model": "free_dev_only",
                    "pricing_summary": "Free tier allows about 100 requests per day.",
                    "production_caveat": "Not licensed for production use.",
                    "default_usage_unit": "requests",
                    "default_quantity_per_call": 1.0,
                    "estimated_cost_usd_per_call": 0.0
                }
            })),
        };

        let public = connected_tool_billing_json(&record).expect("billing metadata");
        assert_eq!(public["tool_slug"].as_str(), Some("newsapi-org"));
        assert_eq!(public["provider_origin"].as_str(), Some("connected"));
        assert_eq!(public["billing_category"].as_str(), Some("news_api"));
        assert_eq!(public["billing_model"].as_str(), Some("free_dev_only"));
        assert_eq!(public["default_usage_unit"].as_str(), Some("requests"));
        assert_eq!(public["default_quantity_per_call"].as_f64(), Some(1.0));
        assert_eq!(public["estimated_cost_usd_per_call"].as_f64(), Some(0.0));
    }

    #[test]
    fn usage_event_text_normalization_bounds_fields() {
        assert_eq!(
            normalize_usage_event_text("  requests  ", 32),
            Some("requests".to_string())
        );
        assert_eq!(normalize_usage_event_text("", 32), None);
        assert_eq!(normalize_usage_event_text("line1\nline2", 32), None);
        assert_eq!(normalize_usage_event_text(&"x".repeat(33), 32), None);
    }

    #[test]
    fn usage_event_number_validation_rejects_unbounded_values() {
        assert!(usage_event_number_is_valid(0.0));
        assert!(usage_event_number_is_valid(123.45));
        assert!(!usage_event_number_is_valid(-1.0));
        assert!(!usage_event_number_is_valid(f64::INFINITY));
        assert!(!usage_event_number_is_valid(1_000_000.1));
    }

    #[test]
    fn external_tool_usage_enrichment_groups_totals_and_connected_tools() {
        let mut status = serde_json::json!({
            "account_id": "user_123",
            "plan": "free",
            "status": "inactive"
        });
        let connections = vec![McpToolConnectionRecord {
            id: "conn_1".to_string(),
            tool_slug: "exa".to_string(),
            tool_name: "Exa".to_string(),
            mcp_server_url: "https://example.test/mcp".to_string(),
            connected_at: "2026-08-26T10:00:00Z".to_string(),
            connection_provider: "direct".to_string(),
            external_user_id: None,
            composio_connected_account_id: None,
            tool_descriptor: Some(serde_json::json!({
                "billing": {
                    "provider_key": "exa",
                    "provider_category": "search_api",
                    "billing_model": "usage",
                    "pricing_summary": "Search around $7/1K requests.",
                    "default_usage_unit": "requests"
                }
            })),
        }];
        let usage_summary = vec![UserExternalToolUsageSummaryRow {
            provider_category: "search_api".to_string(),
            billing_category: "search_api".to_string(),
            tool_slug: "exa".to_string(),
            tool_name: "Exa".to_string(),
            provider_key: "exa".to_string(),
            usage_unit: "requests".to_string(),
            total_quantity: 25.0,
            total_estimated_cost_usd: 3.5,
            latest_occurred_at: Some("2026-08-26T11:00:00Z".to_string()),
            event_count: 2,
        }];
        let recent_events = vec![UserExternalToolUsageEventRecord {
            id: "evt_1".to_string(),
            user_id: "user_123".to_string(),
            tool_slug: "exa".to_string(),
            tool_name: "Exa".to_string(),
            provider_key: "exa".to_string(),
            provider_category: "search_api".to_string(),
            billing_category: "search_api".to_string(),
            usage_unit: "requests".to_string(),
            quantity: 10.0,
            estimated_cost_usd: 1.4,
            currency: "USD".to_string(),
            source: "manual".to_string(),
            occurred_at: chrono::DateTime::parse_from_rfc3339("2026-08-26T11:00:00Z")
                .expect("occurred_at")
                .with_timezone(&chrono::Utc),
            recorded_at: chrono::DateTime::parse_from_rfc3339("2026-08-26T11:00:01Z")
                .expect("recorded_at")
                .with_timezone(&chrono::Utc),
            metadata_json: serde_json::json!({}),
        }];

        enrich_billing_status_with_external_tool_usage(
            &mut status,
            &connections,
            &usage_summary,
            &recent_events,
        );

        assert_eq!(
            status["external_tool_billing"]["total_estimated_cost_usd"].as_f64(),
            Some(3.5)
        );
        assert_eq!(
            status["external_tool_billing"]["connected_estimated_cost_usd"].as_f64(),
            Some(3.5)
        );
        assert_eq!(
            status["external_tool_billing"]["built_in_estimated_cost_usd"].as_f64(),
            Some(0.0)
        );
        assert_eq!(
            status["external_tool_billing"]["coverage"]["measurement_state"].as_str(),
            Some("estimated_usage")
        );
        assert_eq!(
            status["external_tool_billing"]["coverage"]["settlement_state"].as_str(),
            Some("not_settled")
        );
        assert_eq!(
            status["external_tool_billing"]["coverage"]["retention"]["max_event_age_days"].as_i64(),
            Some(90)
        );
        assert_eq!(
            status["external_tool_billing"]["categories"][0]["billing_category"].as_str(),
            Some("search_api")
        );
        assert_eq!(
            status["external_tool_billing"]["connected_tools"][0]["tool_name"].as_str(),
            Some("Exa")
        );
        assert_eq!(
            status["external_tool_billing"]["items"][0]["provider_origin"].as_str(),
            Some("connected")
        );
        assert_eq!(
            status["external_tool_billing"]["recent_events"][0]["provider_origin"].as_str(),
            Some("connected")
        );
        assert_eq!(
            status["external_tool_billing"]["recent_events"][0]["quantity"].as_f64(),
            Some(10.0)
        );
    }
}
