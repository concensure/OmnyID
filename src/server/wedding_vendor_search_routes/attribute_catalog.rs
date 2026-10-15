// @locs-version: 2.0
//! Single source of truth for which facts we track about a wedding vendor, what shape each
//! value must have, and which source is most trustworthy for it.

use crate::db::wedding_vendor_evidence::{
    VENDOR_ATTRIBUTE_AUTHORITIES, VENDOR_ATTRIBUTE_STATUSES, VendorAttributeRecord,
    VendorAttributeWrite,
};
use serde_json::{Value, json};

const WEDDING_FACET_VOCABULARY: &str = include_str!("../../../solid-ui/src/lib/weddingFacetVocabulary.json");

fn wedding_facet_vocabulary() -> Result<(String, Vec<String>), String> {
    let value: Value = serde_json::from_str(WEDDING_FACET_VOCABULARY)
        .map_err(|error| format!("invalid wedding facet vocabulary: {error}"))?;
    let version = value["version"]
        .as_str()
        .ok_or_else(|| "wedding facet vocabulary has no version".to_string())?
        .to_string();
    let ids = value["facets"]
        .as_array()
        .ok_or_else(|| format!("wedding facet vocabulary {version} has no facets"))?
        .iter()
        .filter_map(|facet| facet["id"].as_str().map(str::to_string))
        .collect();
    Ok((version, ids))
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum AttrKind {
    Bool,
    Number,
    Money,
    Text,
    Tags,
    Enum(&'static [&'static str]),
    Url,
    Time,
    Coordinate,
    Json,
}

impl AttrKind {
    fn name(self) -> &'static str {
        match self {
            AttrKind::Bool => "bool",
            AttrKind::Number => "number",
            AttrKind::Money => "money",
            AttrKind::Text => "text",
            AttrKind::Tags => "tags",
            AttrKind::Enum(_) => "enum",
            AttrKind::Url => "url",
            AttrKind::Time => "time",
            AttrKind::Coordinate => "coordinate",
            AttrKind::Json => "json",
        }
    }
}

pub(crate) struct VendorAttributeSpec {
    pub(crate) key: &'static str,
    pub(crate) label: &'static str,
    pub(crate) kind: AttrKind,
    /// Category slugs; empty means every category.
    pub(crate) applies_to: &'static [&'static str],
    pub(crate) preferred_authority: &'static str,
    pub(crate) group: &'static str,
}

const VENUE: &[&str] = &["venue"];
const PHOTO_VIDEO: &[&str] = &["photographer", "videographer"];
const ALL: &[&str] = &[];

const BUSINESS_STATUS: &[&str] = &["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"];
const WET_WEATHER: &[&str] = &["none", "partial", "equivalent"];
const PRICE_STRUCTURE: &[&str] = &[
    "hire_fee",
    "per_head",
    "minimum_spend",
    "package",
    "hourly",
    "mixed",
];
const PRICE_LEVEL_GOOGLE: &[&str] = &[
    "PRICE_LEVEL_FREE",
    "PRICE_LEVEL_INEXPENSIVE",
    "PRICE_LEVEL_MODERATE",
    "PRICE_LEVEL_EXPENSIVE",
    "PRICE_LEVEL_VERY_EXPENSIVE",
];
const LOCATION_SETTING_CLASS: &[&str] = &[
    "iconic_waterfront",
    "heritage_garden",
    "parkland_garden",
    "premium_city",
    "suburban_landscaped",
    "suburban_function",
    "limited",
];

const fn operator_spec(
    key: &'static str,
    label: &'static str,
    kind: AttrKind,
    applies_to: &'static [&'static str],
    group: &'static str,
) -> VendorAttributeSpec {
    VendorAttributeSpec {
        key,
        label,
        kind,
        applies_to,
        preferred_authority: "operator",
        group,
    }
}

const fn spec(
    key: &'static str,
    label: &'static str,
    kind: AttrKind,
    applies_to: &'static [&'static str],
    group: &'static str,
) -> VendorAttributeSpec {
    VendorAttributeSpec {
        key,
        label,
        kind,
        applies_to,
        preferred_authority: "primary_official",
        group,
    }
}

/// Ratings, review counts and operating status are facts an independent aggregate observes
/// better than the vendor's own marketing, so that source is preferred for them.
const fn aggregate_spec(
    key: &'static str,
    label: &'static str,
    kind: AttrKind,
    group: &'static str,
) -> VendorAttributeSpec {
    VendorAttributeSpec {
        key,
        label,
        kind,
        applies_to: ALL,
        preferred_authority: "independent_aggregate",
        group,
    }
}

pub(crate) const VENDOR_ATTRIBUTE_CATALOG: &[VendorAttributeSpec] = &[
    operator_spec(
        "location_setting_class",
        "Location setting",
        AttrKind::Enum(LOCATION_SETTING_CLASS),
        VENUE,
        "fit",
    ),
    spec(
        "year_built",
        "Year built",
        AttrKind::Number,
        VENUE,
        "quality",
    ),
    spec(
        "last_major_renovation_year",
        "Last major renovation year",
        AttrKind::Number,
        VENUE,
        "quality",
    ),
    operator_spec(
        "condition_score",
        "Condition score",
        AttrKind::Number,
        VENUE,
        "quality",
    ),
    spec(
        "venue_hire_fee_aud",
        "Venue hire fee (AUD)",
        AttrKind::Money,
        VENUE,
        "commercial",
    ),
    spec(
        "catering_price_per_head_aud",
        "Catering per head (AUD)",
        AttrKind::Money,
        VENUE,
        "commercial",
    ),
    spec(
        "seasonal_price_list",
        "Seasonal price list or URL",
        AttrKind::Text,
        ALL,
        "commercial",
    ),
    aggregate_spec(
        "rating_easyweddings",
        "Easy Weddings rating",
        AttrKind::Number,
        "quality",
    ),
    aggregate_spec(
        "review_count_easyweddings",
        "Easy Weddings review count",
        AttrKind::Number,
        "quality",
    ),
    aggregate_spec("latitude", "Latitude", AttrKind::Coordinate, "location"),
    aggregate_spec("longitude", "Longitude", AttrKind::Coordinate, "location"),
    operator_spec(
        "food_score",
        "Food score",
        AttrKind::Number,
        VENUE,
        "quality",
    ),
    operator_spec(
        "service_score",
        "Service score",
        AttrKind::Number,
        VENUE,
        "quality",
    ),
    spec(
        "capacity_seated_max",
        "Seated capacity (max)",
        AttrKind::Number,
        VENUE,
        "feasibility",
    ),
    spec(
        "capacity_standing_max",
        "Standing capacity (max)",
        AttrKind::Number,
        VENUE,
        "feasibility",
    ),
    spec(
        "capacity_seated_min",
        "Seated capacity (min)",
        AttrKind::Number,
        VENUE,
        "feasibility",
    ),
    spec(
        "ceremony_on_site",
        "Ceremony on site",
        AttrKind::Bool,
        VENUE,
        "feasibility",
    ),
    spec(
        "reception_on_site",
        "Reception on site",
        AttrKind::Bool,
        VENUE,
        "feasibility",
    ),
    spec(
        "indoor_space",
        "Indoor space",
        AttrKind::Bool,
        VENUE,
        "feasibility",
    ),
    spec(
        "outdoor_space",
        "Outdoor space",
        AttrKind::Bool,
        VENUE,
        "feasibility",
    ),
    spec(
        "wheelchair_accessible",
        "Wheelchair accessible",
        AttrKind::Bool,
        ALL,
        "feasibility",
    ),
    spec(
        "curfew_time",
        "Curfew time",
        AttrKind::Time,
        VENUE,
        "feasibility",
    ),
    spec(
        "in_house_catering",
        "In-house catering",
        AttrKind::Bool,
        VENUE,
        "feasibility",
    ),
    spec(
        "external_catering_allowed",
        "External catering allowed",
        AttrKind::Bool,
        VENUE,
        "feasibility",
    ),
    spec(
        "byo_alcohol_allowed",
        "BYO alcohol allowed",
        AttrKind::Bool,
        VENUE,
        "feasibility",
    ),
    spec(
        "pets_allowed",
        "Pets allowed",
        AttrKind::Bool,
        VENUE,
        "feasibility",
    ),
    spec(
        "accommodation_on_site",
        "Accommodation on site",
        AttrKind::Bool,
        VENUE,
        "feasibility",
    ),
    spec(
        "cultural_religious_capabilities",
        "Cultural and religious capabilities",
        AttrKind::Tags,
        ALL,
        "feasibility",
    ),
    spec(
        "service_area_radius_km",
        "Service area radius (km)",
        AttrKind::Number,
        ALL,
        "feasibility",
    ),
    aggregate_spec(
        "business_status",
        "Business status",
        AttrKind::Enum(BUSINESS_STATUS),
        "feasibility",
    ),
    aggregate_spec(
        "rating_google",
        "Google rating",
        AttrKind::Number,
        "quality",
    ),
    aggregate_spec(
        "review_count_google",
        "Google review count",
        AttrKind::Number,
        "quality",
    ),
    spec(
        "years_in_business",
        "Years in business",
        AttrKind::Number,
        ALL,
        "quality",
    ),
    spec(
        "editorial_summary",
        "Summary",
        AttrKind::Text,
        ALL,
        "quality",
    ),
    spec("style_tags", "Style tags", AttrKind::Tags, ALL, "fit"),
    spec("style_facets", "Style facets", AttrKind::Tags, ALL, "fit"),
    spec(
        "exclusive_use",
        "Exclusive use",
        AttrKind::Bool,
        VENUE,
        "fit",
    ),
    spec(
        "wet_weather_option",
        "Wet-weather option",
        AttrKind::Enum(WET_WEATHER),
        VENUE,
        "fit",
    ),
    spec("parking", "Parking", AttrKind::Bool, VENUE, "fit"),
    spec(
        "public_transport_access",
        "Public transport access",
        AttrKind::Bool,
        VENUE,
        "fit",
    ),
    spec(
        "photo_locations_on_site",
        "Photo locations on site",
        AttrKind::Bool,
        VENUE,
        "fit",
    ),
    spec(
        "price_structure",
        "Price structure",
        AttrKind::Enum(PRICE_STRUCTURE),
        ALL,
        "commercial",
    ),
    spec(
        "price_estimate_total_aud",
        "Estimated total price (AUD)",
        AttrKind::Money,
        ALL,
        "commercial",
    ),
    spec(
        "price_per_head_aud",
        "Price per head (AUD)",
        AttrKind::Money,
        ALL,
        "commercial",
    ),
    spec(
        "minimum_spend_aud",
        "Minimum spend (AUD)",
        AttrKind::Money,
        ALL,
        "commercial",
    ),
    spec(
        "price_level_google",
        "Google price level",
        AttrKind::Enum(PRICE_LEVEL_GOOGLE),
        ALL,
        "commercial",
    ),
    spec(
        "inclusions",
        "Inclusions",
        AttrKind::Tags,
        ALL,
        "commercial",
    ),
    spec(
        "deposit_percent",
        "Deposit (%)",
        AttrKind::Number,
        ALL,
        "commercial",
    ),
    spec(
        "cancellation_terms",
        "Cancellation terms",
        AttrKind::Text,
        ALL,
        "commercial",
    ),
    spec(
        "overtime_rate_aud_per_hour",
        "Overtime rate (AUD/hour)",
        AttrKind::Money,
        ALL,
        "commercial",
    ),
    spec(
        "travel_fee_aud",
        "Travel fee (AUD)",
        AttrKind::Money,
        ALL,
        "commercial",
    ),
    spec(
        "corkage_fee_aud",
        "Corkage fee (AUD)",
        AttrKind::Money,
        VENUE,
        "commercial",
    ),
    spec(
        "public_liability_insurance",
        "Public liability insurance",
        AttrKind::Bool,
        ALL,
        "risk",
    ),
    spec(
        "contract_provided",
        "Contract provided",
        AttrKind::Bool,
        ALL,
        "risk",
    ),
    spec(
        "backup_shooter",
        "Backup shooter",
        AttrKind::Bool,
        PHOTO_VIDEO,
        "risk",
    ),
    spec(
        "equipment_redundancy",
        "Equipment redundancy",
        AttrKind::Bool,
        PHOTO_VIDEO,
        "risk",
    ),
    spec(
        "hours_included",
        "Hours included",
        AttrKind::Number,
        PHOTO_VIDEO,
        "risk",
    ),
    spec(
        "delivery_weeks",
        "Delivery time (weeks)",
        AttrKind::Number,
        PHOTO_VIDEO,
        "risk",
    ),
    spec(
        "response_time_hours",
        "Response time (hours)",
        AttrKind::Number,
        ALL,
        "risk",
    ),
    spec(
        "official_website",
        "Official website",
        AttrKind::Url,
        ALL,
        "identity",
    ),
    spec("instagram_url", "Instagram", AttrKind::Url, ALL, "identity"),
    spec(
        "google_place_id",
        "Google place ID",
        AttrKind::Text,
        ALL,
        "identity",
    ),
];

pub(crate) fn attribute_spec(key: &str) -> Option<&'static VendorAttributeSpec> {
    VENDOR_ATTRIBUTE_CATALOG.iter().find(|spec| spec.key == key)
}

pub(crate) fn normalize_category(category: &str) -> String {
    category
        .trim()
        .to_ascii_lowercase()
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}

pub(crate) fn attribute_applies_to_category(spec: &VendorAttributeSpec, category: &str) -> bool {
    spec.applies_to.is_empty()
        || spec
            .applies_to
            .contains(&normalize_category(category).as_str())
}

fn unknown_attribute_json() -> Value {
    json!({"status": "unknown", "value": null, "confidence": null, "authority": null})
}

fn attribute_record_json(record: &VendorAttributeRecord) -> Value {
    json!({
        "status": record.status,
        "value": record.value,
        "confidence": record.confidence,
        "authority": record.authority,
        "source_url": record.source_url,
        "source_label": record.source_label,
        "retrieved_at": record.retrieved_at,
        "valid_until": record.valid_until,
        "notes": record.notes,
    })
}

/// An attribute with no row is explicit-unknown rather than absent, so consumers can tell
/// "we have not found this out" from "this key does not apply".
pub(crate) fn attributes_with_unknowns(category: &str, rows: &[VendorAttributeRecord]) -> Value {
    let mut attributes = serde_json::Map::new();
    for spec in VENDOR_ATTRIBUTE_CATALOG {
        let row = rows.iter().find(|row| row.attribute_key == spec.key);
        match row {
            Some(record) => {
                attributes.insert(spec.key.to_string(), attribute_record_json(record));
            }
            None if attribute_applies_to_category(spec, category) => {
                attributes.insert(spec.key.to_string(), unknown_attribute_json());
            }
            None => {}
        }
    }
    Value::Object(attributes)
}

fn kind_enum_values(kind: AttrKind) -> Vec<&'static str> {
    match kind {
        AttrKind::Enum(values) => values.to_vec(),
        _ => Vec::new(),
    }
}

pub(crate) fn attribute_catalog_json() -> Value {
    Value::Array(
        VENDOR_ATTRIBUTE_CATALOG
            .iter()
            .map(|spec| {
                json!({
                    "key": spec.key,
                    "label": spec.label,
                    "kind": spec.kind.name(),
                    "enum_values": kind_enum_values(spec.kind),
                    "applies_to": spec.applies_to,
                    "group": spec.group,
                })
            })
            .collect(),
    )
}

pub(crate) fn validate_attribute_value(
    spec: &VendorAttributeSpec,
    value: &Value,
) -> Result<(), String> {
    let wrong_shape = |expected: &str| {
        format!(
            "attribute '{}' expects {expected}; got {value}. Check the attribute catalog for the expected shape.",
            spec.key
        )
    };
    match spec.kind {
        AttrKind::Bool => value
            .is_boolean()
            .then_some(())
            .ok_or_else(|| wrong_shape("true or false")),
        AttrKind::Number => match value.as_f64() {
            Some(number)
                if number.is_finite()
                    && if matches!(spec.key, "condition_score" | "food_score" | "service_score") {
                        (1.0..=5.0).contains(&number)
                    } else {
                        number >= 0.0
                    } =>
            {
                Ok(())
            }
            _ if matches!(spec.key, "condition_score" | "food_score" | "service_score") => {
                Err(wrong_shape("a score from 1 to 5"))
            }
            _ => Err(wrong_shape("a non-negative number")),
        },
        AttrKind::Money => match value.as_f64() {
            Some(number) if number.is_finite() && number >= 0.0 => Ok(()),
            _ => Err(wrong_shape("a non-negative number")),
        },
        AttrKind::Text => match value.as_str() {
            Some(text) if !text.trim().is_empty() && text.len() <= 2000 => Ok(()),
            _ => Err(wrong_shape("non-empty text up to 2000 characters")),
        },
        AttrKind::Tags => match value.as_array() {
            Some(tags)
                if tags.len() <= 40
                    && tags.iter().all(|tag| {
                        tag.as_str()
                            .is_some_and(|text| !text.trim().is_empty() && text.len() <= 80)
                    }) =>
            {
                if spec.key == "style_facets" {
                    let (version, vocabulary) = wedding_facet_vocabulary()?;
                    if let Some(unknown) = tags.iter().filter_map(Value::as_str).find(|tag| !vocabulary.iter().any(|facet| facet == tag)) {
                        return Err(format!(
                            "attribute 'style_facets' contains unknown facet '{unknown}' for vocabulary {version}."
                        ));
                    }
                }
                Ok(())
            }
            _ => Err(wrong_shape("a list of up to 40 short text tags")),
        },
        AttrKind::Enum(allowed) => match value.as_str() {
            Some(text) if allowed.contains(&text) => Ok(()),
            _ => Err(wrong_shape(&format!("one of {allowed:?}"))),
        },
        AttrKind::Url => match value
            .as_str()
            .and_then(|text| reqwest::Url::parse(text).ok())
        {
            Some(url) if matches!(url.scheme(), "http" | "https") => Ok(()),
            _ => Err(wrong_shape("a full http or https URL")),
        },
        AttrKind::Time => match value.as_str() {
            Some(text) if chrono::NaiveTime::parse_from_str(text, "%H:%M").is_ok() => Ok(()),
            _ => Err(wrong_shape("a 24-hour time such as \"23:00\"")),
        },
        AttrKind::Coordinate => match value.as_f64() {
            Some(number)
                if number.is_finite()
                    && if spec.key == "latitude" {
                        (-90.0..=90.0).contains(&number)
                    } else {
                        (-180.0..=180.0).contains(&number)
                    } =>
            {
                Ok(())
            }
            _ => Err(wrong_shape("a valid latitude or longitude")),
        },
        AttrKind::Json => match value {
            Value::Object(_) | Value::Array(_) if value.to_string().len() <= 20_000 => Ok(()),
            _ => Err(wrong_shape("a JSON object or array up to 20 KB")),
        },
    }
}

/// One operator-entered attribute from the admin write request.
pub(crate) struct AdminAttributeInput {
    pub(crate) key: String,
    pub(crate) value: Option<Value>,
    pub(crate) status: String,
    pub(crate) confidence: Option<f32>,
    pub(crate) source_url: Option<String>,
    pub(crate) notes: Option<String>,
}

pub(crate) fn admin_attribute_write(
    input: AdminAttributeInput,
) -> Result<VendorAttributeWrite, String> {
    let spec = attribute_spec(&input.key).ok_or_else(|| {
        format!(
            "unknown vendor attribute key '{}'. Check the attribute catalog for valid keys.",
            input.key
        )
    })?;
    if !VENDOR_ATTRIBUTE_STATUSES.contains(&input.status.as_str()) {
        return Err(format!(
            "attribute '{}' has invalid status '{}'; use one of {:?}.",
            input.key, input.status, VENDOR_ATTRIBUTE_STATUSES
        ));
    }
    if let Some(confidence) = input.confidence {
        if !(0.0..=1.0).contains(&confidence) {
            return Err(format!(
                "attribute '{}' confidence must be between 0 and 1; got {confidence}.",
                input.key
            ));
        }
    }
    let carries_value = matches!(input.status.as_str(), "known" | "estimated");
    let value = match (carries_value, input.value) {
        (true, Some(value)) if !value.is_null() => {
            validate_attribute_value(spec, &value)?;
            Some(value)
        }
        (true, _) => {
            return Err(format!(
                "attribute '{}' with status '{}' needs a value; set status to 'unknown' to clear it.",
                input.key, input.status
            ));
        }
        (false, _) => None,
    };
    let source_url = input
        .source_url
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty());
    if let Some(url) = &source_url {
        if !reqwest::Url::parse(url).is_ok_and(|parsed| matches!(parsed.scheme(), "http" | "https"))
        {
            return Err(format!(
                "attribute '{}' source_url must be a full http or https URL.",
                input.key
            ));
        }
    }
    Ok(VendorAttributeWrite {
        attribute_key: input.key,
        value,
        status: input.status,
        confidence: input.confidence,
        authority: "operator".to_string(),
        preferred_authority: spec.preferred_authority.to_string(),
        source_url,
        source_label: Some("Operator entry".to_string()),
        valid_until: None,
        notes: input
            .notes
            .map(|note| note.trim().to_string())
            .filter(|note| !note.is_empty()),
    })
}

/// Evidence gathered during a search run, written once the vendor has a stable id.
#[derive(Clone, Debug)]
pub(crate) struct PendingAttribute {
    pub(crate) key: &'static str,
    pub(crate) value: Option<Value>,
    pub(crate) status: &'static str,
    pub(crate) confidence: Option<f32>,
    pub(crate) authority: &'static str,
    pub(crate) source_url: Option<String>,
    pub(crate) source_label: Option<String>,
    pub(crate) ttl_days: Option<i64>,
}

impl PendingAttribute {
    pub(crate) fn known(
        key: &'static str,
        value: Value,
        authority: &'static str,
        ttl_days: i64,
    ) -> Self {
        Self {
            key,
            value: Some(value),
            status: "known",
            confidence: None,
            authority,
            source_url: None,
            source_label: None,
            ttl_days: Some(ttl_days),
        }
    }

    pub(crate) fn estimated(
        key: &'static str,
        value: Value,
        authority: &'static str,
        confidence: f32,
        ttl_days: i64,
    ) -> Self {
        Self {
            status: "estimated",
            confidence: Some(confidence),
            ..Self::known(key, value, authority, ttl_days)
        }
    }

    pub(crate) fn with_source(mut self, url: Option<String>, label: Option<String>) -> Self {
        self.source_url = url;
        self.source_label = label;
        self
    }

    pub(crate) fn with_confidence(mut self, confidence: f32) -> Self {
        self.confidence = Some(confidence);
        self
    }

    pub(crate) fn into_write(
        self,
        now: chrono::DateTime<chrono::Utc>,
    ) -> Option<VendorAttributeWrite> {
        let spec = attribute_spec(self.key)?;
        if !VENDOR_ATTRIBUTE_AUTHORITIES.contains(&self.authority) {
            return None;
        }
        if let Some(value) = &self.value {
            validate_attribute_value(spec, value).ok()?;
        }
        Some(VendorAttributeWrite {
            attribute_key: self.key.to_string(),
            value: self.value,
            status: self.status.to_string(),
            confidence: self.confidence,
            authority: self.authority.to_string(),
            preferred_authority: spec.preferred_authority.to_string(),
            source_url: self.source_url,
            source_label: self.source_label,
            valid_until: self
                .ttl_days
                .map(|days| (now + chrono::Duration::days(days)).to_rfc3339()),
            notes: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(key: &str, value: Value) -> VendorAttributeRecord {
        VendorAttributeRecord {
            vendor_id: "v1".to_string(),
            attribute_key: key.to_string(),
            value: Some(value),
            status: "known".to_string(),
            confidence: Some(0.9),
            authority: "primary_official".to_string(),
            source_url: None,
            source_label: None,
            retrieved_at: "2026-09-20".to_string(),
            valid_until: None,
            notes: None,
        }
    }

    #[test]
    fn catalog_keys_are_unique_and_enums_non_empty() {
        let mut seen = std::collections::HashSet::new();
        for spec in VENDOR_ATTRIBUTE_CATALOG {
            assert!(seen.insert(spec.key), "duplicate key {}", spec.key);
            if let AttrKind::Enum(values) = spec.kind {
                assert!(!values.is_empty(), "{} has no enum values", spec.key);
            }
            assert!(VENDOR_ATTRIBUTE_AUTHORITIES.contains(&spec.preferred_authority));
        }
    }

    #[test]
    fn aggregate_attributes_prefer_independent_aggregate() {
        for key in [
            "rating_google",
            "review_count_google",
            "business_status",
            "rating_easyweddings",
            "latitude",
            "longitude",
        ] {
            assert_eq!(
                attribute_spec(key).expect("spec").preferred_authority,
                "independent_aggregate"
            );
        }
        assert_eq!(
            attribute_spec("capacity_seated_max")
                .expect("spec")
                .preferred_authority,
            "primary_official"
        );
    }

    #[test]
    fn catalog_v2_validates_coordinates_and_structured_seasonal_prices() {
        assert!(admin_attribute_write(admin("latitude", Some(json!(-33.8688)), "known")).is_ok());
        assert!(admin_attribute_write(admin("longitude", Some(json!(151.2093)), "known")).is_ok());
        assert!(admin_attribute_write(admin("latitude", Some(json!(-133.0)), "known")).is_err());
        assert!(
            admin_attribute_write(admin(
                "seasonal_price_list",
                Some(json!("https://venue.test/pricing.pdf")),
                "known"
            ))
            .is_ok()
        );
        assert!(admin_attribute_write(admin("condition_score", Some(json!(4.5)), "known")).is_ok());
        assert!(admin_attribute_write(admin("food_score", Some(json!(0)), "known")).is_err());
        assert!(admin_attribute_write(admin("service_score", Some(json!(6)), "known")).is_err());
    }

    #[test]
    fn unknowns_fill_venue_only_keys_for_venues_but_not_photographers() {
        let venue = attributes_with_unknowns("Venue", &[record("capacity_seated_max", json!(120))]);
        assert_eq!(venue["capacity_seated_max"]["value"], json!(120));
        assert_eq!(venue["capacity_standing_max"]["status"], json!("unknown"));
        assert_eq!(venue["capacity_standing_max"]["value"], Value::Null);
        assert!(venue.get("backup_shooter").is_none());
        assert_eq!(venue["rating_google"]["status"], json!("unknown"));

        let photographer = attributes_with_unknowns("photographer", &[]);
        assert!(photographer.get("capacity_seated_max").is_none());
        assert!(photographer.get("corkage_fee_aud").is_none());
        assert_eq!(photographer["backup_shooter"]["status"], json!("unknown"));
        assert_eq!(
            photographer["wheelchair_accessible"]["status"],
            json!("unknown")
        );
    }

    fn admin(key: &str, value: Option<Value>, status: &str) -> AdminAttributeInput {
        AdminAttributeInput {
            key: key.to_string(),
            value,
            status: status.to_string(),
            confidence: None,
            source_url: None,
            notes: None,
        }
    }

    #[test]
    fn admin_input_rejects_unknown_keys_and_names_the_key() {
        let err = admin_attribute_write(admin("made_up", Some(json!(1)), "known"))
            .err()
            .expect("rejected");
        assert!(err.contains("made_up"));
        assert!(err.contains("catalog"));
    }

    #[test]
    fn admin_input_rejects_wrong_kinds() {
        assert!(
            admin_attribute_write(admin("capacity_seated_max", Some(json!("lots")), "known"))
                .is_err()
        );
        assert!(
            admin_attribute_write(admin("capacity_seated_max", Some(json!(-5)), "known")).is_err()
        );
        assert!(admin_attribute_write(admin("pets_allowed", Some(json!("yes")), "known")).is_err());
        assert!(
            admin_attribute_write(admin(
                "wet_weather_option",
                Some(json!("sometimes")),
                "known"
            ))
            .is_err()
        );
        assert!(admin_attribute_write(admin("curfew_time", Some(json!("late")), "known")).is_err());
        assert!(
            admin_attribute_write(admin("official_website", Some(json!("ftp://x")), "known"))
                .is_err()
        );
        assert!(
            admin_attribute_write(admin("style_tags", Some(json!(["ok", 3])), "known")).is_err()
        );
        assert!(admin_attribute_write(admin("pets_allowed", None, "known")).is_err());
    }

    #[test]
    fn admin_input_accepts_valid_values_with_operator_authority() {
        let write = admin_attribute_write(admin("capacity_seated_max", Some(json!(140)), "known"))
            .expect("valid");
        assert_eq!(write.authority, "operator");
        assert_eq!(write.value, Some(json!(140)));
        let unknown = admin_attribute_write(admin("pets_allowed", Some(json!(true)), "unknown"))
            .expect("valid");
        assert_eq!(unknown.value, None);
        assert!(
            admin_attribute_write(admin("curfew_time", Some(json!("23:00")), "estimated")).is_ok()
        );
    }

    #[test]
    fn admin_input_rejects_bad_status_and_confidence() {
        assert!(admin_attribute_write(admin("pets_allowed", Some(json!(true)), "maybe")).is_err());
        let mut input = admin("pets_allowed", Some(json!(true)), "known");
        input.confidence = Some(1.5);
        assert!(admin_attribute_write(input).is_err());
    }

    #[test]
    fn pending_attribute_converts_with_ttl_and_rejects_off_catalog_keys() {
        let now = chrono::Utc::now();
        let write =
            PendingAttribute::known("rating_google", json!(4.7), "independent_aggregate", 180)
                .into_write(now)
                .expect("write");
        assert_eq!(write.preferred_authority, "independent_aggregate");
        assert!(write.valid_until.is_some());
        assert!(
            PendingAttribute::known("not_a_key", json!(1), "inferred", 1)
                .into_write(now)
                .is_none()
        );
        assert!(
            PendingAttribute::known("rating_google", json!("high"), "inferred", 1)
                .into_write(now)
                .is_none()
        );
    }

    #[test]
    fn catalog_json_lists_enum_values_and_scope() {
        let catalog = attribute_catalog_json();
        let status = catalog
            .as_array()
            .expect("array")
            .iter()
            .find(|entry| entry["key"] == "business_status")
            .expect("entry");
        assert_eq!(status["kind"], json!("enum"));
        assert_eq!(status["enum_values"].as_array().expect("values").len(), 3);
    }

    #[test]
    fn style_facets_are_limited_to_the_shared_versioned_vocabulary() {
        assert!(admin_attribute_write(admin("style_facets", Some(json!(["scale.intimate"])), "known")).is_ok());
        let error = admin_attribute_write(admin("style_facets", Some(json!(["scale.imaginary"])), "known"))
            .expect_err("unknown facet must be rejected");
        assert!(error.contains("scale.imaginary"));
        assert!(error.contains("wedding_facets.v1"));
    }
}
