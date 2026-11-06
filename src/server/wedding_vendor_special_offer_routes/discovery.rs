//! Privacy-bounded couple discovery for one explicitly selected date.
//!
//! The response is marker data, not the vendor's calendar. It deliberately
//! omits offer/slot identifiers, pricing, inclusions and private rules.

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;

use super::super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
};

const DEFAULT_LIMIT: usize = 36;
const MAX_LIMIT: usize = 48;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/wedding/vendor-specials/discovery",
        get(discover_specials_http),
    )
}

#[derive(Debug, Deserialize)]
struct DiscoveryQuery {
    date: String,
    category: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    radius_km: Option<f64>,
    guest_count: Option<u32>,
    limit: Option<usize>,
}

#[derive(Debug, Serialize)]
struct DiscoveryMarker {
    vendor_id: String,
    vendor_name: String,
    category: String,
    locality: String,
    address: Option<String>,
    description: Option<String>,
    latitude: f64,
    longitude: f64,
    photo_url: Option<String>,
    photo_alt: Option<String>,
    style_tags: Vec<String>,
    rating: Option<f64>,
    review_count: Option<i64>,
    available_on_date: String,
    last_confirmed_at: String,
    confirmation_expires_at: String,
    indicative_only: bool,
    distance_km: Option<f64>,
}

#[derive(Debug, Serialize)]
struct DiscoveryResponse {
    selected_date: String,
    category: Option<String>,
    markers: Vec<DiscoveryMarker>,
    truncated: bool,
}

fn rollout_allowed(email: &str) -> bool {
    std::env::var("OMNYID_WEDDING_VENDOR_SPECIALS_DISCOVERY_ENABLED").as_deref() == Ok("true")
        && std::env::var("OMNYID_WEDDING_VENDOR_SPECIALS_DISCOVERY_ALLOWLIST")
            .unwrap_or_default()
            .split(',')
            .map(|value| value.trim().to_ascii_lowercase())
            .any(|value| !value.is_empty() && value == email.trim().to_ascii_lowercase())
}

fn clean_category(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().chars().take(80).collect::<String>())
        .filter(|value| !value.is_empty())
        .map(|value| value.trim_end_matches('s').to_string())
}

fn location_filter(
    latitude: Option<f64>,
    longitude: Option<f64>,
    radius_km: Option<f64>,
) -> Result<(Option<f64>, Option<f64>, f64), (StatusCode, String)> {
    if latitude.is_some() != longitude.is_some() {
        return Err((
            StatusCode::BAD_REQUEST,
            "latitude and longitude must be supplied together".into(),
        ));
    }
    if let Some(value) = latitude.filter(|value| (-90.0..=90.0).contains(value)) {
        let longitude = longitude
            .filter(|value| (-180.0..=180.0).contains(value))
            .ok_or((StatusCode::BAD_REQUEST, "invalid longitude".into()))?;
        let radius = radius_km.unwrap_or(75.0);
        if !radius.is_finite() || !(1.0..=500.0).contains(&radius) {
            return Err((
                StatusCode::BAD_REQUEST,
                "radius_km must be between 1 and 500".into(),
            ));
        }
        return Ok((Some(value), Some(longitude), radius));
    }
    if latitude.is_some() {
        return Err((StatusCode::BAD_REQUEST, "invalid latitude".into()));
    }
    Ok((None, None, 75.0))
}

fn approximate_distance_km(from: Option<(f64, f64)>, to: (f64, f64)) -> Option<f64> {
    let (from_lat, from_lng) = from?;
    let latitude_km = (to.0 - from_lat) * 111.0;
    let longitude_km = (to.1 - from_lng) * 111.0 * from_lat.to_radians().cos();
    Some((latitude_km.powi(2) + longitude_km.powi(2)).sqrt())
}

async fn discover_specials_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<DiscoveryQuery>,
) -> Result<Json<DiscoveryResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_vendor_specials_discovery", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !rollout_allowed(&user.email) {
        return Err((StatusCode::NOT_FOUND, "Not found".into()));
    }
    let selected_date = NaiveDate::parse_from_str(query.date.trim(), "%Y-%m-%d")
        .map_err(|_| (StatusCode::BAD_REQUEST, "date must use YYYY-MM-DD".into()))?;
    let category = clean_category(query.category);
    let (latitude, longitude, radius_km) =
        location_filter(query.latitude, query.longitude, query.radius_km)?;
    let guest_count = query.guest_count.map(i64::from);
    if guest_count.is_some_and(|count| count > 5_000) {
        return Err((
            StatusCode::BAD_REQUEST,
            "guest_count must not exceed 5000".into(),
        ));
    }
    let requested_limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let sql_limit = i64::try_from(requested_limit + 1).unwrap_or((MAX_LIMIT + 1) as i64);

    let rows = sqlx::query(
        r#"SELECT DISTINCT ON (v.vendor_id)
                  v.vendor_id,v.vendor_name,v.category,v.service_area,v.address,v.notes,
                  (lat.value #>> '{}')::double precision AS latitude,
                  (lng.value #>> '{}')::double precision AS longitude,
                  tags.value AS style_tags,
                  COALESCE((rating_google.value #>> '{}')::double precision,
                           (rating_easy.value #>> '{}')::double precision) AS rating,
                  COALESCE((reviews_google.value #>> '{}')::bigint,
                           (reviews_easy.value #>> '{}')::bigint) AS review_count,
                  photo.photo_url,photo.alt_text,
                  slot.last_confirmed_at,slot.confirmation_expires_at
           FROM wedding_vendor_special_offer_slots slot
           JOIN wedding_vendor_special_offers offer
             ON offer.offer_id=slot.offer_id AND offer.vendor_id=slot.vendor_id
           JOIN wedding_vendors v ON v.vendor_id=slot.vendor_id AND v.status='active'
           JOIN wedding_vendor_attributes lat
             ON lat.vendor_id=v.vendor_id AND lat.attribute_key='latitude'
                AND lat.status IN ('known','estimated') AND jsonb_typeof(lat.value)='number'
           JOIN wedding_vendor_attributes lng
             ON lng.vendor_id=v.vendor_id AND lng.attribute_key='longitude'
                AND lng.status IN ('known','estimated') AND jsonb_typeof(lng.value)='number'
           LEFT JOIN wedding_vendor_attributes tags
             ON tags.vendor_id=v.vendor_id AND tags.attribute_key='style_tags'
                AND tags.status IN ('known','estimated')
           LEFT JOIN wedding_vendor_attributes rating_google
             ON rating_google.vendor_id=v.vendor_id AND rating_google.attribute_key='rating_google'
                AND rating_google.status IN ('known','estimated') AND jsonb_typeof(rating_google.value)='number'
           LEFT JOIN wedding_vendor_attributes rating_easy
             ON rating_easy.vendor_id=v.vendor_id AND rating_easy.attribute_key='rating_easyweddings'
                AND rating_easy.status IN ('known','estimated') AND jsonb_typeof(rating_easy.value)='number'
           LEFT JOIN wedding_vendor_attributes reviews_google
             ON reviews_google.vendor_id=v.vendor_id AND reviews_google.attribute_key='review_count_google'
                AND reviews_google.status IN ('known','estimated') AND jsonb_typeof(reviews_google.value)='number'
           LEFT JOIN wedding_vendor_attributes reviews_easy
             ON reviews_easy.vendor_id=v.vendor_id AND reviews_easy.attribute_key='review_count_easyweddings'
                AND reviews_easy.status IN ('known','estimated') AND jsonb_typeof(reviews_easy.value)='number'
           LEFT JOIN LATERAL (
             SELECT '/api/public/wedding/vendor/photos/' || asset.asset_id || '/medium' AS photo_url,
                    asset.alt_text
             FROM wedding_vendor_owner_assets asset
             WHERE asset.vendor_id=v.vendor_id AND asset.status='live'
               AND asset.photo_licence_id IS NOT NULL
             ORDER BY asset.is_cover DESC,asset.position,asset.asset_id
             LIMIT 1
           ) photo ON TRUE
           WHERE slot.local_date=$1
             AND slot.state IN ('available','enquiry_received')
             AND slot.confirmation_expires_at>NOW()
             AND offer.publication_state='active'
             AND offer.approved_revision=offer.revision
             AND (offer.valid_from IS NULL OR offer.valid_from<=$1)
             AND (offer.valid_until IS NULL OR offer.valid_until>=$1)
             AND ($2::text IS NULL OR lower(v.category)=lower($2))
             AND ($3::double precision IS NULL OR (
               power(((lat.value #>> '{}')::double precision-$3)*111.0,2)
               + power(((lng.value #>> '{}')::double precision-$4)*111.0*cos(radians($3)),2)
                 <= power($5,2)
             ))
             AND ($6::bigint IS NULL OR offer.guest_min IS NULL OR offer.guest_min<=$6)
             AND ($6::bigint IS NULL OR offer.guest_max IS NULL OR offer.guest_max>=$6)
             AND ($6::bigint IS NULL OR slot.maximum_capacity IS NULL OR slot.maximum_capacity>=$6)
           ORDER BY v.vendor_id,slot.last_confirmed_at DESC,slot.slot_id
           LIMIT $7"#,
    )
    .bind(selected_date)
    .bind(category.as_deref())
    .bind(latitude)
    .bind(longitude)
    .bind(radius_km)
    .bind(guest_count)
    .bind(sql_limit)
    .fetch_all(&state.db.pool)
    .await
    .map_err(|error| {
        tracing::error!(?error, "limited-special discovery query failed");
        (StatusCode::INTERNAL_SERVER_ERROR, "Limited specials are unavailable just now.".into())
    })?;

    let truncated = rows.len() > requested_limit;
    let markers = rows
        .into_iter()
        .take(requested_limit)
        .map(|row| {
            let style_tags = row
                .get::<Option<Value>, _>("style_tags")
                .and_then(|value| value.as_array().cloned())
                .unwrap_or_default()
                .into_iter()
                .filter_map(|value| value.as_str().map(ToOwned::to_owned))
                .take(12)
                .collect();
            let confirmed: chrono::DateTime<chrono::Utc> = row.get("last_confirmed_at");
            let expires: chrono::DateTime<chrono::Utc> = row.get("confirmation_expires_at");
            let marker_latitude = row.get("latitude");
            let marker_longitude = row.get("longitude");
            DiscoveryMarker {
                vendor_id: row.get("vendor_id"),
                vendor_name: row.get("vendor_name"),
                category: row.get("category"),
                locality: row.get("service_area"),
                address: row.get("address"),
                description: row.get("notes"),
                latitude: marker_latitude,
                longitude: marker_longitude,
                photo_url: row.get("photo_url"),
                photo_alt: row.get("alt_text"),
                style_tags,
                rating: row.get("rating"),
                review_count: row.get("review_count"),
                available_on_date: selected_date.to_string(),
                last_confirmed_at: confirmed.to_rfc3339(),
                confirmation_expires_at: expires.to_rfc3339(),
                indicative_only: true,
                distance_km: approximate_distance_km(
                    latitude.zip(longitude),
                    (marker_latitude, marker_longitude),
                )
                .map(|distance| (distance * 10.0).round() / 10.0),
            }
        })
        .collect();
    Ok(Json(DiscoveryResponse {
        selected_date: selected_date.to_string(),
        category,
        markers,
        truncated,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn category_is_bounded_and_singularized() {
        assert_eq!(
            clean_category(Some(" Venues ".into())).as_deref(),
            Some("Venue")
        );
        assert_eq!(clean_category(Some("".into())), None);
    }

    #[test]
    fn marker_contract_contains_no_commercial_or_inventory_identifiers() {
        let marker = DiscoveryMarker {
            vendor_id: "vendor-a".into(),
            vendor_name: "Harbour House".into(),
            category: "Venue".into(),
            locality: "Sydney".into(),
            address: None,
            description: Some("Waterfront venue".into()),
            latitude: -33.86,
            longitude: 151.2,
            photo_url: None,
            photo_alt: None,
            style_tags: vec!["waterfront".into()],
            rating: Some(4.8),
            review_count: Some(42),
            available_on_date: "2027-11-20".into(),
            last_confirmed_at: "2026-11-07T00:00:00Z".into(),
            confirmation_expires_at: "2026-11-21T00:00:00Z".into(),
            indicative_only: true,
            distance_km: Some(3.2),
        };
        let serialized = serde_json::to_string(&marker).unwrap();
        for forbidden in [
            "minimum_spend",
            "per_head",
            "inclusions",
            "offer_id",
            "slot_id",
        ] {
            assert!(!serialized.contains(forbidden), "leaked {forbidden}");
        }
    }

    #[test]
    fn location_filter_requires_a_bounded_coordinate_pair() {
        assert!(location_filter(Some(-33.86), None, Some(50.0)).is_err());
        assert!(location_filter(Some(-133.0), Some(151.2), Some(50.0)).is_err());
        assert!(location_filter(Some(-33.86), Some(151.2), Some(900.0)).is_err());
        assert_eq!(
            location_filter(Some(-33.86), Some(151.2), None).unwrap(),
            (Some(-33.86), Some(151.2), 75.0)
        );
    }
}
