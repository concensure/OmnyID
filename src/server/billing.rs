use std::sync::Arc;

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde_json::Value;

use super::{AppState, auth::authenticated_user, internal_error, status_to_http};

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
    // Signature verification (best-effort: skip if secret not configured).
    let webhook_secret = std::env::var("OMNYID_STRIPE_WEBHOOK_SECRET").ok();
    if let Some(secret) = webhook_secret {
        let stripe_sig = headers
            .get("stripe-signature")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !verify_stripe_signature(&body, stripe_sig, &secret) {
            return Err((
                StatusCode::UNAUTHORIZED,
                "Invalid Stripe webhook signature".to_string(),
            ));
        }
    }

    let payload: Value = serde_json::from_str(&body)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid JSON: {e}")))?;

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

    state
        .db
        .record_billing_event(account_id.as_deref(), &event_id, &event_type, &payload)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

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
        serde_json::json!({ "received": true, "event_type": event_type }),
    ))
}

fn verify_stripe_signature(body: &str, stripe_sig: &str, secret: &str) -> bool {
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
    // Map stripe customer_id to an account_id via metadata field if set.
    let account_id = data
        .pointer("/metadata/account_id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| customer_id.clone());

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

    let status = state
        .db
        .get_billing_status(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;

    Ok(Json(status))
}
