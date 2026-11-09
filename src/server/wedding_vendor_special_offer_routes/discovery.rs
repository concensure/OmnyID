//! Privacy-bounded couple discovery for one explicitly selected date.
//!
//! The response is not the vendor's calendar. Marker data deliberately omits
//! commercial terms; exact approved guidance is attached only to the three
//! candidates selected by the server-side policy-v2 stage.

use std::{collections::HashMap, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;

use crate::wedding_vendor_special_offer::{
    ApprovedOfferPricing, DateSlotCommercialTerms, approved_date_price_estimate,
};

use super::super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
};

const DEFAULT_LIMIT: usize = 36;
const MAX_LIMIT: usize = 48;
const MAX_RANKING_CANDIDATES: usize = 500;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/wedding/vendor-specials/discovery",
        post(discover_specials_http),
    )
}

#[derive(Debug, Deserialize)]
struct DiscoveryQuery {
    date: String,
    date_to: Option<String>,
    category: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    radius_km: Option<f64>,
    guest_count: Option<u32>,
    category_budget_cents: Option<i64>,
    preference_terms: Option<String>,
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
    available_dates: Vec<String>,
    last_confirmed_at: String,
    confirmation_expires_at: String,
    indicative_only: bool,
    distance_km: Option<f64>,
}

#[derive(Debug, Serialize)]
struct DiscoveryResponse {
    selected_date: String,
    selected_date_to: String,
    category: Option<String>,
    ranking_policy_version: &'static str,
    markers: Vec<DiscoveryMarker>,
    top_choices: Vec<RankedSpecialDetail>,
    truncated: bool,
}

#[derive(Clone, Debug, Serialize)]
struct RankedSpecialDetail {
    vendor_id: String,
    offer_id: String,
    slot_id: String,
    slot_revision: i64,
    rank: usize,
    special_date: String,
    title: String,
    summary: String,
    space_label: Option<String>,
    session_label: Option<String>,
    maximum_capacity: Option<u32>,
    currency: String,
    minimum_spend_cents: Option<i64>,
    indicative_per_head_cents: Option<i64>,
    indicative_total_cents: Option<i64>,
    budget_fit_eligible: bool,
    unknown_costs: bool,
    inclusions: Vec<String>,
    exclusions: Vec<String>,
    public_conditions: Option<String>,
    reason_labels: Vec<String>,
    indicative_only: bool,
}

#[derive(Clone, Debug)]
struct RankingCandidate {
    detail: RankedSpecialDetail,
    distance_km: Option<f64>,
    radius_km: f64,
    rating: Option<f64>,
    review_count: Option<i64>,
    style_tags: Vec<String>,
    preference_terms: Vec<String>,
    category_budget_cents: Option<i64>,
    flexible_window: bool,
}

pub(super) fn rollout_allowed(email: &str) -> bool {
    std::env::var("OMNYID_WEDDING_VENDOR_SPECIALS_DISCOVERY_ENABLED").as_deref() == Ok("true")
        && std::env::var("OMNYID_WEDDING_VENDOR_SPECIALS_DISCOVERY_ALLOWLIST")
            .unwrap_or_default()
            .split(',')
            .map(|value| value.trim().to_ascii_lowercase())
            .any(|value| value == "*" || (!value.is_empty() && value == email.trim().to_ascii_lowercase()))
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

fn bounded_terms(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(|value| {
            value
                .trim()
                .to_ascii_lowercase()
                .chars()
                .filter(|character| character.is_ascii_alphanumeric() || *character == '_')
                .take(48)
                .collect::<String>()
        })
        .filter(|value| !value.is_empty())
        .take(16)
        .collect()
}

fn non_empty(value: String) -> Option<String> {
    (!value.trim().is_empty()).then_some(value)
}

fn budget_utility(price: i64, budget: i64) -> f64 {
    if price < 0 || budget <= 0 {
        return 0.0;
    }
    let ratio = price as f64 / budget as f64;
    if ratio <= 0.70 {
        1.0
    } else if ratio <= 0.80 {
        0.85
    } else if ratio <= 0.95 {
        0.60
    } else if ratio <= 1.05 {
        0.30
    } else if ratio <= 1.20 {
        0.10
    } else {
        0.0
    }
}

fn ranking_score(candidate: &RankingCandidate) -> f64 {
    // Availability is known for every row entering this ranker. Unknown
    // dimensions receive a neutral prior rather than a zero or an inflated
    // score from a smaller denominator. Their uncertainty stays visible.
    let mut weighted = 0.65;
    if let Some(distance) = candidate.distance_km {
        let utility = (1.0 - distance / candidate.radius_km.max(1.0)).clamp(0.0, 1.0);
        weighted += 0.20 * (utility - 0.5);
    }
    if !candidate.preference_terms.is_empty() && !candidate.style_tags.is_empty() {
        let matches = candidate
            .preference_terms
            .iter()
            .filter(|term| {
                candidate
                    .style_tags
                    .iter()
                    .any(|tag| tag.to_ascii_lowercase().contains(term.as_str()))
            })
            .count();
        let utility = matches as f64 / candidate.preference_terms.len() as f64;
        weighted += 0.20 * (utility - 0.5);
    }
    if let Some((total, budget)) = candidate
        .detail
        .indicative_total_cents
        .zip(candidate.category_budget_cents)
        .filter(|_| candidate.detail.budget_fit_eligible)
    {
        weighted += 0.20 * (budget_utility(total, budget) - 0.5);
    }
    if let Some(rating) = candidate.rating {
        let reviews = candidate.review_count.unwrap_or(0).max(0) as f64;
        let confidence = reviews / (reviews + 50.0);
        let quality = ((rating - 3.5) / 1.5).clamp(0.0, 1.0);
        let utility = quality * confidence + 0.5 * (1.0 - confidence);
        weighted += 0.10 * (utility - 0.5);
    }
    weighted.clamp(0.0, 1.0)
}

fn rank_top_three(mut candidates: Vec<RankingCandidate>) -> Vec<RankedSpecialDetail> {
    candidates.sort_by(|left, right| {
        ranking_score(right)
            .total_cmp(&ranking_score(left))
            .then_with(|| left.detail.vendor_id.cmp(&right.detail.vendor_id))
    });
    candidates
        .into_iter()
        .take(3)
        .enumerate()
        .map(|(index, mut candidate)| {
            candidate.detail.rank = index + 1;
            candidate.detail.reason_labels = ranking_reason_labels(&candidate);
            candidate.detail
        })
        .collect()
}

fn ranking_reason_labels(candidate: &RankingCandidate) -> Vec<String> {
    let mut labels = vec![if candidate.flexible_window {
        format!(
            "A vendor-confirmed special on {} improved this match",
            candidate.detail.special_date
        )
    } else {
        "Vendor-confirmed opening on your selected date".to_string()
    }];
    if candidate
        .detail
        .indicative_total_cents
        .zip(candidate.category_budget_cents)
        .is_some_and(|(total, budget)| candidate.detail.budget_fit_eligible && total <= budget)
    {
        labels.push("Approved indicative total is within your category budget".to_string());
    }
    let matched = candidate
        .preference_terms
        .iter()
        .filter(|term| {
            candidate
                .style_tags
                .iter()
                .any(|tag| tag.to_ascii_lowercase().contains(term.as_str()))
        })
        .take(3)
        .cloned()
        .collect::<Vec<_>>();
    if !matched.is_empty() {
        labels.push(format!("Matches your {} preferences", matched.join(", ")));
    }
    if let Some(distance) = candidate.distance_km {
        labels.push(format!("About {:.0} km from the selected area", distance));
    }
    labels.into_iter().take(4).collect()
}

async fn discover_specials_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(query): Json<DiscoveryQuery>,
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
    let selected_date_to = query
        .date_to
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d"))
        .transpose()
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "date_to must use YYYY-MM-DD".into(),
            )
        })?
        .unwrap_or(selected_date);
    let window_days = (selected_date_to - selected_date).num_days();
    if !(0..=31).contains(&window_days) {
        return Err((
            StatusCode::BAD_REQUEST,
            "The flexible-date window must be between 0 and 31 days.".into(),
        ));
    }
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
    let category_budget_cents = query
        .category_budget_cents
        .filter(|value| (0..=1_000_000_000_00).contains(value));
    if query.category_budget_cents.is_some() && category_budget_cents.is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            "category_budget_cents is outside the supported range".into(),
        ));
    }
    let preference_terms = bounded_terms(query.preference_terms.as_deref());
    let requested_limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    // Rank across a larger bounded candidate pool before trimming the map.
    // Applying the display limit by vendor id first can discard a materially
    // better preference/budget/location match.
    let sql_limit = i64::try_from(MAX_RANKING_CANDIDATES + 1).unwrap_or(501);

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
                  offer.offer_id,slot.slot_id,slot.revision AS slot_revision,
                  offer.title AS offer_title,offer.summary AS offer_summary,
                  offer.currency,offer.fixed_total_cents,offer.per_guest_cents,
                  offer.hire_fee_cents,offer.minimum_spend_cents AS offer_minimum_spend_cents,
                  offer.mandatory_charges_cents,offer.mandatory_charges_known,
                  offer.mandatory_charges_summary,offer.estimate_min_cents,
                  offer.estimate_max_cents,offer.reference_price_cents,
                  offer.savings_basis_label,offer.savings_evidence_ref,
                  offer.inclusions AS offer_inclusions,offer.exclusions,
                  offer.public_conditions AS offer_public_conditions,
                  slot.local_date,slot.space_label,slot.session_label,slot.maximum_capacity,
                  slot.minimum_spend_cents AS slot_minimum_spend_cents,
                  slot.indicative_per_head_cents,slot.inclusions AS slot_inclusions,
                  slot.public_conditions AS slot_public_conditions,
                  slot.last_confirmed_at,slot.confirmation_expires_at,
                  ARRAY(
                    SELECT candidate.local_date::text
                    FROM wedding_vendor_special_offer_slots candidate
                    JOIN wedding_vendor_special_offers candidate_offer
                      ON candidate_offer.offer_id=candidate.offer_id AND candidate_offer.vendor_id=candidate.vendor_id
                    WHERE candidate.vendor_id=v.vendor_id
                      AND candidate.local_date BETWEEN $1 AND $2
                      AND candidate.state IN ('available','enquiry_received')
                      AND candidate.confirmation_expires_at>NOW()
                      AND candidate_offer.publication_state='active'
                      AND candidate_offer.approved_revision=candidate_offer.revision
                      AND ($7::bigint IS NULL OR candidate_offer.guest_min IS NULL OR candidate_offer.guest_min<=$7)
                      AND ($7::bigint IS NULL OR candidate_offer.guest_max IS NULL OR candidate_offer.guest_max>=$7)
                      AND ($7::bigint IS NULL OR candidate.maximum_capacity IS NULL OR candidate.maximum_capacity>=$7)
                    ORDER BY candidate.local_date
                    LIMIT 32
                  ) AS available_dates
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
           WHERE slot.local_date BETWEEN $1 AND $2
             AND slot.state IN ('available','enquiry_received')
             AND slot.confirmation_expires_at>NOW()
             AND offer.publication_state='active'
             AND offer.approved_revision=offer.revision
             AND (offer.valid_from IS NULL OR offer.valid_from<=slot.local_date)
             AND (offer.valid_until IS NULL OR offer.valid_until>=slot.local_date)
             AND ($3::text IS NULL OR lower(v.category)=lower($3))
             AND ($4::double precision IS NULL OR (
               power(((lat.value #>> '{}')::double precision-$4)*111.0,2)
               + power(((lng.value #>> '{}')::double precision-$5)*111.0*cos(radians($4)),2)
                 <= power($6,2)
             ))
             AND ($7::bigint IS NULL OR offer.guest_min IS NULL OR offer.guest_min<=$7)
             AND ($7::bigint IS NULL OR offer.guest_max IS NULL OR offer.guest_max>=$7)
             AND ($7::bigint IS NULL OR slot.maximum_capacity IS NULL OR slot.maximum_capacity>=$7)
           ORDER BY v.vendor_id,ABS(slot.local_date-$1),slot.last_confirmed_at DESC,slot.slot_id
           LIMIT $8"#,
    )
    .bind(selected_date)
    .bind(selected_date_to)
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
    let mut markers = Vec::new();
    let mut ranking_candidates = Vec::new();
    for row in rows.into_iter().take(MAX_RANKING_CANDIDATES) {
        let style_tags = row
            .get::<Option<Value>, _>("style_tags")
            .and_then(|value| value.as_array().cloned())
            .unwrap_or_default()
            .into_iter()
            .filter_map(|value| value.as_str().map(ToOwned::to_owned))
            .take(12)
            .collect::<Vec<_>>();
        let confirmed: chrono::DateTime<chrono::Utc> = row.get("last_confirmed_at");
        let expires: chrono::DateTime<chrono::Utc> = row.get("confirmation_expires_at");
        let marker_latitude = row.get("latitude");
        let marker_longitude = row.get("longitude");
        let distance_km =
            approximate_distance_km(latitude.zip(longitude), (marker_latitude, marker_longitude))
                .map(|distance| (distance * 10.0).round() / 10.0);
        let vendor_id: String = row.get("vendor_id");
        let special_date: NaiveDate = row.get("local_date");
        let rating = row.get("rating");
        let review_count = row.get("review_count");
        let pricing = ApprovedOfferPricing {
            currency: row.get("currency"),
            fixed_total_cents: row.get("fixed_total_cents"),
            per_guest_cents: row.get("per_guest_cents"),
            hire_fee_cents: row.get("hire_fee_cents"),
            minimum_spend_cents: row.get("offer_minimum_spend_cents"),
            mandatory_charges_cents: row.get("mandatory_charges_cents"),
            mandatory_charges_known: row.get("mandatory_charges_known"),
            mandatory_charges_summary: row.get("mandatory_charges_summary"),
            estimate_min_cents: row.get("estimate_min_cents"),
            estimate_max_cents: row.get("estimate_max_cents"),
            reference_price_cents: row.get("reference_price_cents"),
            savings_basis_label: row.get("savings_basis_label"),
            savings_evidence_ref: row.get("savings_evidence_ref"),
        };
        let slot_inclusions: Vec<String> = row.get("slot_inclusions");
        let offer_inclusions: Vec<String> = row.get("offer_inclusions");
        let terms = DateSlotCommercialTerms {
            maximum_capacity: row
                .get::<Option<i32>, _>("maximum_capacity")
                .map(|value| value as u32),
            minimum_spend_cents: row.get("slot_minimum_spend_cents"),
            indicative_per_head_cents: row.get("indicative_per_head_cents"),
            inclusions: slot_inclusions.clone(),
            public_conditions: row.get("slot_public_conditions"),
        };
        let estimate = approved_date_price_estimate(&pricing, &terms, query.guest_count).ok();
        ranking_candidates.push(RankingCandidate {
            detail: RankedSpecialDetail {
                vendor_id: vendor_id.clone(),
                offer_id: row.get("offer_id"),
                slot_id: row.get("slot_id"),
                slot_revision: row.get("slot_revision"),
                rank: 0,
                special_date: special_date.to_string(),
                title: row.get("offer_title"),
                summary: row.get("offer_summary"),
                space_label: non_empty(row.get("space_label")),
                session_label: non_empty(row.get("session_label")),
                maximum_capacity: terms.maximum_capacity,
                currency: pricing.currency.clone(),
                minimum_spend_cents: terms.minimum_spend_cents.or(pricing.minimum_spend_cents),
                indicative_per_head_cents: terms
                    .indicative_per_head_cents
                    .or(pricing.per_guest_cents),
                indicative_total_cents: estimate.as_ref().and_then(|value| value.high_cents),
                budget_fit_eligible: estimate
                    .as_ref()
                    .is_some_and(|value| value.budget_fit_eligible),
                unknown_costs: estimate.as_ref().is_none_or(|value| value.unknown_costs),
                inclusions: if slot_inclusions.is_empty() {
                    offer_inclusions
                } else {
                    slot_inclusions
                },
                exclusions: row.get("exclusions"),
                public_conditions: terms
                    .public_conditions
                    .clone()
                    .or_else(|| row.get("offer_public_conditions")),
                reason_labels: Vec::new(),
                indicative_only: true,
            },
            distance_km,
            radius_km,
            rating,
            review_count,
            style_tags: style_tags.clone(),
            preference_terms: preference_terms.clone(),
            category_budget_cents,
            flexible_window: window_days > 0,
        });
        markers.push(DiscoveryMarker {
            vendor_id,
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
            rating,
            review_count,
            available_on_date: special_date.to_string(),
            available_dates: row.get("available_dates"),
            last_confirmed_at: confirmed.to_rfc3339(),
            confirmation_expires_at: expires.to_rfc3339(),
            indicative_only: true,
            distance_km,
        });
    }
    let top_choices = rank_top_three(ranking_candidates);
    let top_ranks = top_choices
        .iter()
        .map(|item| (item.vendor_id.as_str(), item.rank))
        .collect::<HashMap<_, _>>();
    markers.sort_by(|left, right| {
        top_ranks
            .get(left.vendor_id.as_str())
            .copied()
            .unwrap_or(usize::MAX)
            .cmp(
                &top_ranks
                    .get(right.vendor_id.as_str())
                    .copied()
                    .unwrap_or(usize::MAX),
            )
            .then_with(|| left.vendor_name.cmp(&right.vendor_name))
    });
    markers.truncate(requested_limit);
    Ok(Json(DiscoveryResponse {
        selected_date: selected_date.to_string(),
        selected_date_to: selected_date_to.to_string(),
        category,
        ranking_policy_version: "2",
        markers,
        top_choices,
        truncated,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ranking_candidate(
        vendor_id: &str,
        distance_km: Option<f64>,
        total: Option<i64>,
        styles: &[&str],
    ) -> RankingCandidate {
        RankingCandidate {
            detail: RankedSpecialDetail {
                vendor_id: vendor_id.into(),
                offer_id: format!("offer-{vendor_id}"),
                slot_id: format!("slot-{vendor_id}"),
                slot_revision: 1,
                rank: 0,
                special_date: "2027-11-20".into(),
                title: format!("{vendor_id} package"),
                summary: "Approved guidance".into(),
                space_label: None,
                session_label: None,
                maximum_capacity: Some(100),
                currency: "AUD".into(),
                minimum_spend_cents: Some(1_000_000),
                indicative_per_head_cents: Some(15_000),
                indicative_total_cents: total,
                budget_fit_eligible: total.is_some(),
                unknown_costs: total.is_none(),
                inclusions: vec!["Room hire".into()],
                exclusions: Vec::new(),
                public_conditions: None,
                reason_labels: Vec::new(),
                indicative_only: true,
            },
            distance_km,
            radius_km: 75.0,
            rating: Some(4.7),
            review_count: Some(80),
            style_tags: styles.iter().map(|value| (*value).into()).collect(),
            preference_terms: vec!["garden".into()],
            category_budget_cents: Some(1_500_000),
            flexible_window: false,
        }
    }

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
            available_dates: vec!["2027-11-20".into()],
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

    #[test]
    fn server_ranker_reveals_at_most_three_and_rewards_known_personal_fit() {
        let ranked = rank_top_three(vec![
            ranking_candidate("far", Some(70.0), Some(2_000_000), &[]),
            ranking_candidate("garden", Some(5.0), Some(1_400_000), &["garden"]),
            ranking_candidate("unknown-price", Some(10.0), None, &["garden"]),
            ranking_candidate("fourth", Some(25.0), Some(1_500_000), &[]),
        ]);
        assert_eq!(ranked.len(), 3);
        assert_eq!(ranked[0].vendor_id, "garden");
        assert_eq!(ranked[0].rank, 1);
        assert!(
            ranked[0]
                .reason_labels
                .iter()
                .any(|value| value.contains("preferences"))
        );
        assert!(!ranked.iter().any(|value| value.vendor_id == "far"));
    }

    #[test]
    fn unknown_dimensions_are_not_scored_as_failures() {
        let unknown = ranking_candidate("unknown", None, None, &[]);
        assert!(ranking_score(&unknown) > 0.0);
        assert!(unknown.detail.unknown_costs);
    }

    #[test]
    fn flexible_date_reason_names_the_vendor_confirmed_special_date() {
        let mut candidate = ranking_candidate("flexible", Some(5.0), Some(1_200_000), &["garden"]);
        candidate.flexible_window = true;
        candidate.detail.special_date = "2027-11-24".into();
        let ranked = rank_top_three(vec![candidate]);
        assert!(ranked[0].reason_labels[0].contains("2027-11-24"));
    }
}
