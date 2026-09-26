use serde_json::{Map, Value};

use crate::db::{Db, UserExternalToolUsageEventInsert, UserExternalToolUsageEventRecord};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WeddingSharedToolProvider {
    GoogleMapsPlatform,
    WeatherApi,
    TwilioMessaging,
    Stripe,
    Cloudinary,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WeddingSharedToolFeature {
    MapsTravel,
    WeatherContingency,
    SmsReminder,
    SubscriptionBilling,
    MediaProcessing,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WeddingSharedToolUsageInput {
    pub user_id: String,
    pub provider: WeddingSharedToolProvider,
    pub feature: WeddingSharedToolFeature,
    pub quantity: f64,
    pub estimated_cost_usd: f64,
    pub usage_unit: Option<String>,
    pub wedding_plan_id: Option<String>,
    pub operation: Option<String>,
    pub provider_request_id: Option<String>,
    pub occurred_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WeddingSharedToolDescriptor {
    tool_slug: &'static str,
    tool_name: &'static str,
    provider_key: &'static str,
    provider_category: &'static str,
    billing_category: &'static str,
    default_usage_unit: &'static str,
}

fn provider_descriptor(provider: WeddingSharedToolProvider) -> WeddingSharedToolDescriptor {
    match provider {
        WeddingSharedToolProvider::GoogleMapsPlatform => WeddingSharedToolDescriptor {
            tool_slug: "google-maps-platform",
            tool_name: "Google Maps Platform",
            provider_key: "google-maps-platform",
            provider_category: "maps",
            billing_category: "maps_travel",
            default_usage_unit: "requests",
        },
        WeddingSharedToolProvider::WeatherApi => WeddingSharedToolDescriptor {
            tool_slug: "weatherapi",
            tool_name: "WeatherAPI",
            provider_key: "weatherapi",
            provider_category: "weather",
            billing_category: "weather",
            default_usage_unit: "requests",
        },
        WeddingSharedToolProvider::TwilioMessaging => WeddingSharedToolDescriptor {
            tool_slug: "twilio-messaging",
            tool_name: "Twilio Messaging",
            provider_key: "twilio-messaging",
            provider_category: "sms",
            billing_category: "guest_vendor_messaging",
            default_usage_unit: "messages",
        },
        WeddingSharedToolProvider::Stripe => WeddingSharedToolDescriptor {
            tool_slug: "stripe",
            tool_name: "Stripe",
            provider_key: "stripe",
            provider_category: "payments",
            billing_category: "payments",
            default_usage_unit: "events",
        },
        WeddingSharedToolProvider::Cloudinary => WeddingSharedToolDescriptor {
            tool_slug: "cloudinary",
            tool_name: "Cloudinary",
            provider_key: "cloudinary",
            provider_category: "media_processing",
            billing_category: "media_processing",
            default_usage_unit: "transforms",
        },
    }
}

fn feature_label(feature: WeddingSharedToolFeature) -> &'static str {
    match feature {
        WeddingSharedToolFeature::MapsTravel => "maps_travel",
        WeddingSharedToolFeature::WeatherContingency => "weather_contingency",
        WeddingSharedToolFeature::SmsReminder => "sms_reminder",
        WeddingSharedToolFeature::SubscriptionBilling => "subscription_billing",
        WeddingSharedToolFeature::MediaProcessing => "media_processing",
    }
}

fn clean_optional_text(value: Option<String>, max_len: usize) -> Option<String> {
    let text = value?.trim().to_string();
    if text.is_empty() || text.len() > max_len || text.chars().any(|ch| ch.is_control()) {
        None
    } else {
        Some(text)
    }
}

fn clean_optional_rfc3339(value: Option<String>, label: &str) -> Result<Option<String>, String> {
    let Some(text) = clean_optional_text(value, 64) else {
        return Ok(None);
    };
    chrono::DateTime::parse_from_rfc3339(&text)
        .map_err(|_| format!("{label} must be an RFC3339 timestamp"))?;
    Ok(Some(text))
}

fn valid_usage_number(value: f64) -> bool {
    value.is_finite() && (0.0..=1_000_000.0).contains(&value)
}

pub fn wedding_shared_tool_usage_event(
    input: WeddingSharedToolUsageInput,
) -> Result<UserExternalToolUsageEventInsert, String> {
    let user_id = input.user_id.trim().to_string();
    if user_id.is_empty() {
        return Err("user_id is required".to_string());
    }
    if !valid_usage_number(input.quantity) || !valid_usage_number(input.estimated_cost_usd) {
        return Err(
            "quantity and estimated_cost_usd must be finite non-negative values".to_string(),
        );
    }
    let descriptor = provider_descriptor(input.provider);
    let usage_unit = clean_optional_text(input.usage_unit, 64)
        .unwrap_or_else(|| descriptor.default_usage_unit.to_string());
    let mut metadata = Map::new();
    metadata.insert(
        "template_scope".to_string(),
        Value::String("wedding_planner".to_string()),
    );
    metadata.insert("admin_shared_tool".to_string(), Value::Bool(true));
    metadata.insert(
        "feature".to_string(),
        Value::String(feature_label(input.feature).to_string()),
    );
    if let Some(wedding_plan_id) = clean_optional_text(input.wedding_plan_id, 160) {
        metadata.insert(
            "wedding_plan_id".to_string(),
            Value::String(wedding_plan_id),
        );
    }
    if let Some(operation) = clean_optional_text(input.operation, 160) {
        metadata.insert("operation".to_string(), Value::String(operation));
    }
    if let Some(provider_request_id) = clean_optional_text(input.provider_request_id, 200) {
        metadata.insert(
            "provider_request_id".to_string(),
            Value::String(provider_request_id),
        );
    }
    Ok(UserExternalToolUsageEventInsert {
        user_id,
        tool_slug: descriptor.tool_slug.to_string(),
        tool_name: descriptor.tool_name.to_string(),
        provider_key: descriptor.provider_key.to_string(),
        provider_category: descriptor.provider_category.to_string(),
        billing_category: descriptor.billing_category.to_string(),
        usage_unit,
        quantity: input.quantity,
        estimated_cost_usd: input.estimated_cost_usd,
        currency: Some("USD".to_string()),
        source: Some("wedding_planner_shared_tool".to_string()),
        occurred_at: clean_optional_rfc3339(input.occurred_at, "occurred_at")?,
        metadata_json: Some(Value::Object(metadata)),
    })
}

pub async fn record_wedding_shared_tool_usage(
    db: &Db,
    input: WeddingSharedToolUsageInput,
) -> Result<UserExternalToolUsageEventRecord, String> {
    let event = wedding_shared_tool_usage_event(input)?;
    db.record_user_external_tool_usage_event(&event)
        .await
        .map_err(|err| format!("failed to record wedding shared-tool usage: {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wedding_shared_tool_usage_event_maps_google_maps_to_metered_billing_row() {
        let event = wedding_shared_tool_usage_event(WeddingSharedToolUsageInput {
            user_id: " user-1 ".to_string(),
            provider: WeddingSharedToolProvider::GoogleMapsPlatform,
            feature: WeddingSharedToolFeature::MapsTravel,
            quantity: 2.0,
            estimated_cost_usd: 0.014,
            usage_unit: None,
            wedding_plan_id: Some("plan-123".to_string()),
            operation: Some("venue_distance_matrix".to_string()),
            provider_request_id: Some("maps-req-1".to_string()),
            occurred_at: Some("2026-09-26T10:00:00Z".to_string()),
        })
        .expect("event");

        assert_eq!(event.user_id, "user-1");
        assert_eq!(event.tool_slug, "google-maps-platform");
        assert_eq!(event.provider_category, "maps");
        assert_eq!(event.billing_category, "maps_travel");
        assert_eq!(event.usage_unit, "requests");
        assert_eq!(event.source.as_deref(), Some("wedding_planner_shared_tool"));
        assert_eq!(
            event.metadata_json.as_ref().unwrap()["template_scope"],
            "wedding_planner"
        );
        assert_eq!(
            event.metadata_json.as_ref().unwrap()["admin_shared_tool"],
            true
        );
        assert_eq!(
            event.metadata_json.as_ref().unwrap()["feature"],
            "maps_travel"
        );
        assert_eq!(
            event.metadata_json.as_ref().unwrap()["wedding_plan_id"],
            "plan-123"
        );
    }

    #[test]
    fn wedding_shared_tool_usage_event_uses_provider_specific_units() {
        let sms = wedding_shared_tool_usage_event(WeddingSharedToolUsageInput {
            user_id: "user-2".to_string(),
            provider: WeddingSharedToolProvider::TwilioMessaging,
            feature: WeddingSharedToolFeature::SmsReminder,
            quantity: 3.0,
            estimated_cost_usd: 0.09,
            usage_unit: None,
            wedding_plan_id: None,
            operation: None,
            provider_request_id: None,
            occurred_at: None,
        })
        .expect("sms event");
        let media = wedding_shared_tool_usage_event(WeddingSharedToolUsageInput {
            user_id: "user-2".to_string(),
            provider: WeddingSharedToolProvider::Cloudinary,
            feature: WeddingSharedToolFeature::MediaProcessing,
            quantity: 8.0,
            estimated_cost_usd: 0.0,
            usage_unit: None,
            wedding_plan_id: None,
            operation: None,
            provider_request_id: None,
            occurred_at: None,
        })
        .expect("media event");

        assert_eq!(sms.usage_unit, "messages");
        assert_eq!(sms.billing_category, "guest_vendor_messaging");
        assert_eq!(media.usage_unit, "transforms");
        assert_eq!(media.provider_category, "media_processing");
    }

    #[test]
    fn wedding_shared_tool_usage_event_rejects_unmeterable_inputs() {
        assert!(
            wedding_shared_tool_usage_event(WeddingSharedToolUsageInput {
                user_id: " ".to_string(),
                provider: WeddingSharedToolProvider::WeatherApi,
                feature: WeddingSharedToolFeature::WeatherContingency,
                quantity: 1.0,
                estimated_cost_usd: 0.0,
                usage_unit: None,
                wedding_plan_id: None,
                operation: None,
                provider_request_id: None,
                occurred_at: None,
            })
            .is_err()
        );
        assert!(
            wedding_shared_tool_usage_event(WeddingSharedToolUsageInput {
                user_id: "user-3".to_string(),
                provider: WeddingSharedToolProvider::Stripe,
                feature: WeddingSharedToolFeature::SubscriptionBilling,
                quantity: f64::INFINITY,
                estimated_cost_usd: 0.0,
                usage_unit: None,
                wedding_plan_id: None,
                operation: None,
                provider_request_id: None,
                occurred_at: None,
            })
            .is_err()
        );
    }

    #[test]
    fn wedding_shared_tool_usage_event_requires_rfc3339_occurred_at() {
        let valid = wedding_shared_tool_usage_event(WeddingSharedToolUsageInput {
            user_id: "user-4".to_string(),
            provider: WeddingSharedToolProvider::WeatherApi,
            feature: WeddingSharedToolFeature::WeatherContingency,
            quantity: 1.0,
            estimated_cost_usd: 0.01,
            usage_unit: None,
            wedding_plan_id: None,
            operation: None,
            provider_request_id: None,
            occurred_at: Some("2026-09-26T10:00:00Z".to_string()),
        })
        .expect("valid timestamp");
        assert_eq!(valid.occurred_at.as_deref(), Some("2026-09-26T10:00:00Z"));

        let invalid = wedding_shared_tool_usage_event(WeddingSharedToolUsageInput {
            user_id: "user-4".to_string(),
            provider: WeddingSharedToolProvider::WeatherApi,
            feature: WeddingSharedToolFeature::WeatherContingency,
            quantity: 1.0,
            estimated_cost_usd: 0.01,
            usage_unit: None,
            wedding_plan_id: None,
            operation: None,
            provider_request_id: None,
            occurred_at: Some("2026-09-26".to_string()),
        })
        .expect_err("date-only timestamp should fail");
        assert!(invalid.contains("occurred_at must be an RFC3339 timestamp"));
    }

    #[test]
    fn record_wedding_shared_tool_usage_uses_existing_external_usage_table_path() {
        let source = include_str!("wedding_shared_tool_metering.rs");
        let production_source = source.split("#[cfg(test)]").next().unwrap_or(source);

        assert!(production_source.contains("record_user_external_tool_usage_event"));
        assert!(!production_source.contains("user_wedding_tool_usage"));
    }
}
