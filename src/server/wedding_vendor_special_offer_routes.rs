//! Verified-vendor commands for date-specific Wedding specials.
//!
//! This is the vendor-side supply authority. Couple discovery remains a
//! separate, top-three-gated projection and must not query private pricing.

use std::{collections::HashSet, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use chrono::{Duration as ChronoDuration, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};
use ulid::Ulid;

use crate::wedding_vendor_special_offer::{
    ApprovedOfferPricing, DateSlotCommercialTerms, SpecialOfferPolicyError,
    SpecialOfferPublicationState, SpecialOfferType, SpecialSlotCommand,
    WEDDING_VENDOR_SPECIAL_OFFER_EVENT_VERSION, apply_special_slot_command,
    approved_date_price_estimate, validate_approved_pricing, validate_offer_for_publication,
};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_rate_limit_key, authenticated_user, enforce_rate_limit},
};

mod records;
use records::*;
mod privacy;

const MAX_SLOTS_PER_OFFER: usize = 100;
const MAX_INCLUSIONS: usize = 40;
const CONFIRMATION_DAYS: i64 = 14;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/wedding/vendor/special-offers",
            get(list_offers_http).post(create_offer_http),
        )
        .route(
            "/wedding/vendor/special-offers/{offer_id}/publish",
            post(publish_offer_http),
        )
        .route(
            "/wedding/vendor/special-offers/{offer_id}/state",
            post(change_offer_state_http),
        )
        .route(
            "/wedding/vendor/special-offers/{offer_id}/slots/{slot_id}/state",
            post(change_slot_state_http),
        )
        .layer(axum::middleware::from_fn(privacy::no_store))
}

#[derive(Debug, Deserialize)]
struct VendorOfferQuery {
    vendor_slug: String,
    guest_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct CreateOfferRequest {
    vendor_slug: String,
    idempotency_key: String,
    room_id: Option<String>,
    title: String,
    summary: String,
    offer_type: SpecialOfferType,
    guest_min: Option<u32>,
    guest_max: Option<u32>,
    pricing: ApprovedOfferPricing,
    inclusions: Vec<String>,
    exclusions: Vec<String>,
    public_conditions: Option<String>,
    approved_package_version: Option<String>,
    slots: Vec<DateSlotDraftRequest>,
}

#[derive(Debug, Deserialize)]
struct DateSlotDraftRequest {
    local_date: String,
    timezone: String,
    starts_at: Option<String>,
    ends_at: Option<String>,
    space_label: Option<String>,
    session_label: Option<String>,
    maximum_capacity: Option<u32>,
    minimum_spend_cents: Option<i64>,
    indicative_per_head_cents: Option<i64>,
    inclusions: Vec<String>,
    public_conditions: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OfferCommandRequest {
    vendor_slug: String,
    idempotency_key: String,
    expected_revision: u64,
    action: Option<OfferAction>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum OfferAction {
    Pause,
    Withdraw,
    Reconfirm,
}

#[derive(Debug, Deserialize)]
struct SlotCommandRequest {
    vendor_slug: String,
    idempotency_key: String,
    expected_revision: u64,
    action: VendorSlotAction,
    hold_expires_at: Option<String>,
    confirmation_expires_at: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum VendorSlotAction {
    PlaceHold,
    MarkBooked,
    Pause,
    Withdraw,
    Reconfirm,
}

#[derive(Debug, Serialize)]
struct VendorAuthority {
    vendor_id: String,
    vendor_name: String,
    category: String,
}

fn clean(value: &str, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

fn required(value: &str, field: &str, limit: usize) -> Result<String, (StatusCode, String)> {
    let value = clean(value, limit);
    if value.is_empty() {
        return Err((StatusCode::BAD_REQUEST, format!("{field} is required.")));
    }
    Ok(value)
}

fn idempotency_key(value: &str) -> Result<String, (StatusCode, String)> {
    let value = required(value, "idempotency_key", 160)?;
    if value.chars().count() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "idempotency_key is too short.".into(),
        ));
    }
    Ok(value)
}

fn clean_optional(value: Option<String>, limit: usize) -> Option<String> {
    value
        .map(|value| clean(&value, limit))
        .filter(|value| !value.is_empty())
}

fn clean_list(values: Vec<String>, field: &str) -> Result<Vec<String>, (StatusCode, String)> {
    if values.len() > MAX_INCLUSIONS {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("{field} has too many items."),
        ));
    }
    let mut result = Vec::new();
    for value in values {
        let value = required(&value, field, 240)?;
        if !result.contains(&value) {
            result.push(value);
        }
    }
    Ok(result)
}

fn rollout_allowed(email: &str) -> bool {
    rollout_allowed_from(
        std::env::var("OMNYID_WEDDING_VENDOR_SPECIALS_ENABLED").as_deref() == Ok("true"),
        &std::env::var("OMNYID_WEDDING_VENDOR_SPECIALS_ALLOWLIST").unwrap_or_default(),
        email,
    )
}

fn rollout_allowed_from(enabled: bool, allowlist: &str, email: &str) -> bool {
    enabled
        && allowlist
            .split(',')
            .map(|value| value.trim().to_ascii_lowercase())
            .any(|value| !value.is_empty() && value == email.trim().to_ascii_lowercase())
}

async fn vendor_authority(
    state: &AppState,
    user_id: &str,
    slug: &str,
) -> Result<VendorAuthority, (StatusCode, String)> {
    let row = sqlx::query(
        "SELECT vendor_id,vendor_name,category FROM wedding_vendors WHERE vendor_slug=$1 AND claimed_by_user_id=$2 AND claim_status='verified' AND status='active'",
    )
    .bind(clean(slug, 160))
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(database_failure)?
    .ok_or((
        StatusCode::FORBIDDEN,
        "A verified claimed listing is required.".into(),
    ))?;
    Ok(VendorAuthority {
        vendor_id: row.get("vendor_id"),
        vendor_name: row.get("vendor_name"),
        category: row.get("category"),
    })
}

async fn vendor_request_authority(
    state: &AppState,
    headers: &HeaderMap,
    vendor_slug: &str,
) -> Result<(crate::db::UserRecord, VendorAuthority), (StatusCode, String)> {
    enforce_rate_limit(
        state,
        authenticated_rate_limit_key("wedding-vendor-specials", headers),
        RateLimitPolicy {
            max_requests: 60,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, headers).await?;
    if !rollout_allowed(&user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "Limited-date offer management is not enabled for this account.".into(),
        ));
    }
    let vendor = vendor_authority(state, &user.id, vendor_slug).await?;
    Ok((user, vendor))
}

fn validate_guest_range(
    minimum: Option<u32>,
    maximum: Option<u32>,
) -> Result<(), (StatusCode, String)> {
    if minimum.zip(maximum).is_some_and(|(low, high)| low > high) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Minimum guests cannot exceed maximum guests.".into(),
        ));
    }
    if minimum
        .into_iter()
        .chain(maximum)
        .any(|value| value > 1_000_000)
    {
        return Err((StatusCode::BAD_REQUEST, "Guest count is too large.".into()));
    }
    Ok(())
}

fn policy_failure(error: SpecialOfferPolicyError) -> (StatusCode, String) {
    let message = match error {
        SpecialOfferPolicyError::InvalidCurrency => "Use a three-letter uppercase currency.",
        SpecialOfferPolicyError::NegativeMoney => "Prices cannot be negative.",
        SpecialOfferPolicyError::InvalidEstimateRange => "The estimate range is invalid.",
        SpecialOfferPolicyError::UnsubstantiatedSavingsClaim => {
            "A savings claim needs an approved comparison basis and evidence reference."
        }
        SpecialOfferPolicyError::GuestCountOutsideDateCapacity => {
            "The selected guest count exceeds this date's maximum capacity."
        }
        SpecialOfferPolicyError::GuestCountOutsideOffer => {
            "The selected guest count is outside this offer's guest range."
        }
        SpecialOfferPolicyError::NoApprovedPrice => {
            "Add an indicative price, minimum spend, fee or approved estimate."
        }
        SpecialOfferPolicyError::StaleRevision { .. } => {
            "This offer changed in another session. Refresh before trying again."
        }
        _ => "The offer does not meet the publication rules.",
    };
    (StatusCode::BAD_REQUEST, message.into())
}

fn validate_slot_request(
    value: DateSlotDraftRequest,
) -> Result<ValidatedSlotDraft, (StatusCode, String)> {
    let local_date = NaiveDate::parse_from_str(value.local_date.trim(), "%Y-%m-%d")
        .map_err(|_| (StatusCode::BAD_REQUEST, "Use a valid date.".into()))?;
    if local_date < Utc::now().date_naive() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Available dates cannot be in the past.".into(),
        ));
    }
    let starts_at = parse_time(value.starts_at.as_deref())?;
    let ends_at = parse_time(value.ends_at.as_deref())?;
    if starts_at
        .zip(ends_at)
        .is_some_and(|(start, end)| start >= end)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "The end time must be later than the start time.".into(),
        ));
    }
    let timezone = required(&value.timezone, "timezone", 80)?;
    if !valid_timezone(&timezone) {
        return Err((StatusCode::BAD_REQUEST, "Use a valid IANA timezone.".into()));
    }
    let terms = DateSlotCommercialTerms {
        maximum_capacity: value.maximum_capacity,
        minimum_spend_cents: value.minimum_spend_cents,
        indicative_per_head_cents: value.indicative_per_head_cents,
        inclusions: clean_list(value.inclusions, "inclusions")?,
        public_conditions: clean_optional(value.public_conditions, 1_200),
    };
    if terms
        .maximum_capacity
        .is_some_and(|value| value > 1_000_000)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Maximum capacity is too large.".into(),
        ));
    }
    if terms.minimum_spend_cents.is_some_and(|value| value < 0)
        || terms
            .indicative_per_head_cents
            .is_some_and(|value| value < 0)
    {
        return Err((StatusCode::BAD_REQUEST, "Prices cannot be negative.".into()));
    }
    Ok(ValidatedSlotDraft {
        local_date,
        timezone,
        starts_at,
        ends_at,
        space_label: clean_optional(value.space_label, 160).unwrap_or_default(),
        session_label: clean_optional(value.session_label, 160).unwrap_or_default(),
        terms,
    })
}

struct ValidatedSlotDraft {
    local_date: NaiveDate,
    timezone: String,
    starts_at: Option<NaiveTime>,
    ends_at: Option<NaiveTime>,
    space_label: String,
    session_label: String,
    terms: DateSlotCommercialTerms,
}

async fn create_offer_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateOfferRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, vendor) = vendor_request_authority(&state, &headers, &request.vendor_slug).await?;
    validate_guest_range(request.guest_min, request.guest_max)?;
    validate_approved_pricing(&request.pricing).map_err(policy_failure)?;
    if request.slots.is_empty() || request.slots.len() > MAX_SLOTS_PER_OFFER {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Add between 1 and {MAX_SLOTS_PER_OFFER} available dates."),
        ));
    }
    let idempotency_key = idempotency_key(&request.idempotency_key)?;
    let slot_count = request.slots.len();
    let slots = request
        .slots
        .into_iter()
        .map(validate_slot_request)
        .collect::<Result<Vec<_>, _>>()?;
    let mut slot_scopes = HashSet::new();
    if slots.iter().any(|slot| {
        !slot_scopes.insert((
            slot.local_date,
            slot.space_label.clone(),
            slot.session_label.clone(),
            slot.starts_at,
        ))
    }) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Each date, space, session and start time must be unique within an offer.".into(),
        ));
    }
    let title = required(&request.title, "title", 160)?;
    let summary = required(&request.summary, "summary", 1_200)?;
    let inclusions = clean_list(request.inclusions, "inclusions")?;
    let exclusions = clean_list(request.exclusions, "exclusions")?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if let Some(row) = sqlx::query(
        "SELECT offer_id FROM wedding_vendor_special_offers WHERE vendor_id=$1 AND creation_idempotency_key=$2",
    )
    .bind(&vendor.vendor_id)
    .bind(&idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    {
        let offer_id: String = row.get("offer_id");
        tx.rollback().await.ok();
        return Ok(Json(json!({"offer_id":offer_id,"status":"draft","replayed":true})));
    }
    let offer_id = Ulid::new().to_string();
    let inserted = sqlx::query(
        r#"INSERT INTO wedding_vendor_special_offers
        (offer_id,vendor_id,creation_idempotency_key,room_id,category,title,summary,offer_type,
         guest_min,guest_max,currency,fixed_total_cents,per_guest_cents,hire_fee_cents,
         minimum_spend_cents,mandatory_charges_cents,mandatory_charges_known,
         mandatory_charges_summary,estimate_min_cents,estimate_max_cents,reference_price_cents,
         savings_basis_label,savings_evidence_ref,inclusions,exclusions,public_conditions,
         approved_package_version,created_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                $19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
        ON CONFLICT (vendor_id,creation_idempotency_key) DO NOTHING
        RETURNING offer_id"#,
    )
    .bind(&offer_id)
    .bind(&vendor.vendor_id)
    .bind(&idempotency_key)
    .bind(clean_optional(request.room_id, 160))
    .bind(&vendor.category)
    .bind(title)
    .bind(summary)
    .bind(offer_type_name(request.offer_type))
    .bind(request.guest_min.map(|value| value as i32))
    .bind(request.guest_max.map(|value| value as i32))
    .bind(&request.pricing.currency)
    .bind(request.pricing.fixed_total_cents)
    .bind(request.pricing.per_guest_cents)
    .bind(request.pricing.hire_fee_cents)
    .bind(request.pricing.minimum_spend_cents)
    .bind(request.pricing.mandatory_charges_cents)
    .bind(request.pricing.mandatory_charges_known)
    .bind(clean_optional(
        request.pricing.mandatory_charges_summary,
        1_000,
    ))
    .bind(request.pricing.estimate_min_cents)
    .bind(request.pricing.estimate_max_cents)
    .bind(request.pricing.reference_price_cents)
    .bind(clean_optional(request.pricing.savings_basis_label, 240))
    .bind(clean_optional(request.pricing.savings_evidence_ref, 500))
    .bind(inclusions)
    .bind(exclusions)
    .bind(clean_optional(request.public_conditions, 2_000))
    .bind(clean_optional(request.approved_package_version, 120))
    .bind(&user.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?;
    if inserted.is_none() {
        let existing_id = sqlx::query_scalar::<_, String>(
            "SELECT offer_id FROM wedding_vendor_special_offers WHERE vendor_id=$1 AND creation_idempotency_key=$2",
        )
        .bind(&vendor.vendor_id)
        .bind(&idempotency_key)
        .fetch_one(&mut *tx)
        .await
        .map_err(database_failure)?;
        tx.rollback().await.ok();
        return Ok(Json(
            json!({"offer_id":existing_id,"status":"draft","replayed":true}),
        ));
    }
    for slot in slots {
        insert_slot(&mut tx, &offer_id, &vendor.vendor_id, &user.id, slot).await?;
    }
    record_event(
        &mut tx,
        &vendor.vendor_id,
        &offer_id,
        None,
        "created",
        &user.id,
        &idempotency_key,
        json!({"revision":1,"slot_count":slot_count}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(json!({
        "offer_id":offer_id,"vendor_name":vendor.vendor_name,"status":"draft",
        "revision":1,"replayed":false
    })))
}

async fn insert_slot(
    tx: &mut Transaction<'_, Postgres>,
    offer_id: &str,
    vendor_id: &str,
    user_id: &str,
    slot: ValidatedSlotDraft,
) -> Result<(), (StatusCode, String)> {
    let now = Utc::now();
    sqlx::query(
        r#"INSERT INTO wedding_vendor_special_offer_slots
        (slot_id,offer_id,vendor_id,local_date,timezone,starts_at,ends_at,space_label,
         session_label,maximum_capacity,minimum_spend_cents,indicative_per_head_cents,
         inclusions,public_conditions,last_confirmed_at,confirmation_expires_at,updated_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)"#,
    )
    .bind(Ulid::new().to_string())
    .bind(offer_id)
    .bind(vendor_id)
    .bind(slot.local_date)
    .bind(slot.timezone)
    .bind(slot.starts_at)
    .bind(slot.ends_at)
    .bind(slot.space_label)
    .bind(slot.session_label)
    .bind(slot.terms.maximum_capacity.map(|value| value as i32))
    .bind(slot.terms.minimum_spend_cents)
    .bind(slot.terms.indicative_per_head_cents)
    .bind(slot.terms.inclusions)
    .bind(slot.terms.public_conditions)
    .bind(now)
    .bind(now + ChronoDuration::days(CONFIRMATION_DAYS))
    .bind(user_id)
    .execute(&mut **tx)
    .await
    .map_err(database_failure)?;
    Ok(())
}

async fn list_offers_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<VendorOfferQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (_user, vendor) = vendor_request_authority(&state, &headers, &query.vendor_slug).await?;
    let offers = sqlx::query(
        "SELECT * FROM wedding_vendor_special_offers WHERE vendor_id=$1 ORDER BY updated_at DESC LIMIT 100",
    )
    .bind(&vendor.vendor_id)
    .fetch_all(&state.db.pool)
    .await
    .map_err(database_failure)?;
    let mut items = Vec::new();
    for offer in offers {
        let offer_id: String = offer.get("offer_id");
        let slots = sqlx::query(
            "SELECT * FROM wedding_vendor_special_offer_slots WHERE offer_id=$1 AND vendor_id=$2 ORDER BY local_date,starts_at NULLS FIRST",
        )
        .bind(&offer_id)
        .bind(&vendor.vendor_id)
        .fetch_all(&state.db.pool)
        .await
        .map_err(database_failure)?;
        let pricing = pricing_from_row(&offer);
        let slot_items = slots
            .into_iter()
            .map(|row| vendor_slot_json(&row, &pricing, query.guest_count))
            .collect::<Vec<_>>();
        items.push(json!({
            "offer_id":offer_id,"title":offer.get::<String,_>("title"),
            "summary":offer.get::<String,_>("summary"),
            "publication_state":offer.get::<String,_>("publication_state"),
            "currency":offer.get::<String,_>("currency"),
            "revision":offer.get::<i64,_>("revision"),"slots":slot_items
        }));
    }
    Ok(Json(json!({"vendor_id":vendor.vendor_id,"items":items})))
}

fn vendor_slot_json(
    row: &sqlx::postgres::PgRow,
    pricing: &ApprovedOfferPricing,
    guest_count: Option<u32>,
) -> Value {
    let terms = terms_from_row(row);
    let guest_count_fits_capacity = !terms
        .maximum_capacity
        .zip(guest_count)
        .is_some_and(|(capacity, guests)| guests > capacity);
    let estimate = approved_date_price_estimate(pricing, &terms, guest_count).ok();
    json!({
        "slot_id":row.get::<String,_>("slot_id"),
        "local_date":row.get::<NaiveDate,_>("local_date").to_string(),
        "timezone":row.get::<String,_>("timezone"),
        "space_label":row.get::<String,_>("space_label"),
        "session_label":row.get::<String,_>("session_label"),
        "state":row.get::<String,_>("state"),
        "maximum_capacity":terms.maximum_capacity,
        "minimum_spend_cents":terms.minimum_spend_cents,
        "indicative_per_head_cents":terms.indicative_per_head_cents,
        "inclusions":terms.inclusions,
        "public_conditions":terms.public_conditions,
        "selected_guest_count":guest_count,
        "guest_count_fits_capacity":guest_count_fits_capacity,
        "indicative_total_cents":estimate.as_ref().and_then(|value| value.high_cents),
        "budget_fit_eligible":estimate.as_ref().is_some_and(|value| value.budget_fit_eligible),
        "indicative_only":true,
        "availability_notice":"Subject to vendor confirmation",
        "revision":row.get::<i64,_>("revision")
    })
}

async fn publish_offer_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(offer_id): Path<String>,
    Json(request): Json<OfferCommandRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, vendor) = vendor_request_authority(&state, &headers, &request.vendor_slug).await?;
    let dedupe = idempotency_key(&request.idempotency_key)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if event_exists(&mut tx, &offer_id, "published", &dedupe).await? {
        tx.rollback().await.ok();
        return Ok(Json(
            json!({"offer_id":offer_id,"status":"active","replayed":true}),
        ));
    }
    let offer_row = locked_offer(&mut tx, &vendor.vendor_id, &offer_id).await?;
    let actual_revision: i64 = offer_row.get("revision");
    if actual_revision != request.expected_revision as i64 {
        return Err(policy_failure(SpecialOfferPolicyError::StaleRevision {
            expected: request.expected_revision,
            actual: actual_revision as u64,
        }));
    }
    let slot_rows = sqlx::query(
        "SELECT * FROM wedding_vendor_special_offer_slots WHERE offer_id=$1 AND vendor_id=$2 ORDER BY local_date FOR UPDATE",
    )
    .bind(&offer_id)
    .bind(&vendor.vendor_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(database_failure)?;
    let mut offer = offer_from_row(&offer_row)?;
    offer.publication_state = SpecialOfferPublicationState::Active;
    offer.approved_revision = Some(offer.revision);
    let slots = slot_rows
        .iter()
        .map(slot_from_row)
        .collect::<Result<Vec<_>, _>>()?;
    validate_offer_for_publication(&offer, &slots, Utc::now()).map_err(policy_failure)?;
    for slot in &slots {
        approved_date_price_estimate(
            &offer.pricing,
            &slot.commercial_terms,
            offer.guest_min.or(Some(1)),
        )
        .map_err(policy_failure)?;
    }
    sqlx::query(
        "UPDATE wedding_vendor_special_offers SET publication_state='active',approved_by_user_id=$1,approved_at=NOW(),approved_revision=revision,updated_at=NOW() WHERE offer_id=$2 AND vendor_id=$3 AND revision=$4",
    )
    .bind(&user.id)
    .bind(&offer_id)
    .bind(&vendor.vendor_id)
    .bind(actual_revision)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    record_event(
        &mut tx,
        &vendor.vendor_id,
        &offer_id,
        None,
        "published",
        &user.id,
        &dedupe,
        json!({"revision":actual_revision}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(
        json!({"offer_id":offer_id,"status":"active","replayed":false}),
    ))
}

async fn change_offer_state_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(offer_id): Path<String>,
    Json(request): Json<OfferCommandRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, vendor) = vendor_request_authority(&state, &headers, &request.vendor_slug).await?;
    let action = request
        .action
        .ok_or((StatusCode::BAD_REQUEST, "action is required.".into()))?;
    let (state_name, event_kind) = match action {
        OfferAction::Pause => ("paused", "paused"),
        OfferAction::Withdraw => ("withdrawn", "withdrawn"),
        OfferAction::Reconfirm => ("active", "reconfirmed"),
    };
    let dedupe = idempotency_key(&request.idempotency_key)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if event_exists(&mut tx, &offer_id, event_kind, &dedupe).await? {
        tx.rollback().await.ok();
        return Ok(Json(
            json!({"offer_id":offer_id,"status":state_name,"replayed":true}),
        ));
    }
    let offer = locked_offer(&mut tx, &vendor.vendor_id, &offer_id).await?;
    let revision: i64 = offer.get("revision");
    if revision != request.expected_revision as i64 {
        return Err(policy_failure(SpecialOfferPolicyError::StaleRevision {
            expected: request.expected_revision,
            actual: revision as u64,
        }));
    }
    let current_state: String = offer.get("publication_state");
    let transition_allowed = match action {
        OfferAction::Pause => current_state == "active",
        OfferAction::Withdraw => current_state != "withdrawn" && current_state != "expired",
        OfferAction::Reconfirm => matches!(current_state.as_str(), "active" | "paused"),
    };
    if !transition_allowed {
        return Err((
            StatusCode::CONFLICT,
            "That offer state cannot use this action.".into(),
        ));
    }
    let next_revision = revision + 1;
    let approved_revision = (state_name == "active").then_some(next_revision);
    sqlx::query(
        "UPDATE wedding_vendor_special_offers SET publication_state=$1,revision=$2,approved_revision=$3,approved_by_user_id=CASE WHEN $1='active' THEN $4 ELSE approved_by_user_id END,approved_at=CASE WHEN $1='active' THEN NOW() ELSE approved_at END,updated_at=NOW() WHERE offer_id=$5 AND vendor_id=$6 AND revision=$7",
    )
    .bind(state_name)
    .bind(next_revision)
    .bind(approved_revision)
    .bind(&user.id)
    .bind(&offer_id)
    .bind(&vendor.vendor_id)
    .bind(revision)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    match action {
        OfferAction::Pause => {
            sqlx::query(
                "UPDATE wedding_vendor_special_offer_slots SET state='paused',revision=revision+1,updated_by_user_id=$1,updated_at=NOW() WHERE offer_id=$2 AND vendor_id=$3 AND state IN ('available','enquiry_received','stale')",
            )
            .bind(&user.id)
            .bind(&offer_id)
            .bind(&vendor.vendor_id)
            .execute(&mut *tx)
            .await
            .map_err(database_failure)?;
        }
        OfferAction::Withdraw => {
            let active_holds = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM wedding_vendor_special_offer_slots WHERE offer_id=$1 AND vendor_id=$2 AND state='provisional_hold' AND hold_expires_at>NOW()",
            )
            .bind(&offer_id)
            .bind(&vendor.vendor_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(database_failure)?;
            if active_holds > 0 {
                return Err((
                    StatusCode::CONFLICT,
                    "Resolve the active provisional hold before withdrawing this offer.".into(),
                ));
            }
            sqlx::query(
                "UPDATE wedding_vendor_special_offer_slots SET state='withdrawn',hold_expires_at=NULL,revision=revision+1,updated_by_user_id=$1,updated_at=NOW() WHERE offer_id=$2 AND vendor_id=$3 AND state NOT IN ('booked','provisional_hold')",
            )
            .bind(&user.id)
            .bind(&offer_id)
            .bind(&vendor.vendor_id)
            .execute(&mut *tx)
            .await
            .map_err(database_failure)?;
        }
        OfferAction::Reconfirm => {
            sqlx::query(
                "UPDATE wedding_vendor_special_offer_slots SET state='available',hold_expires_at=NULL,last_confirmed_at=NOW(),confirmation_expires_at=NOW()+INTERVAL '14 days',revision=revision+1,updated_by_user_id=$1,updated_at=NOW() WHERE offer_id=$2 AND vendor_id=$3 AND state IN ('available','enquiry_received','paused','stale')",
            )
            .bind(&user.id)
            .bind(&offer_id)
            .bind(&vendor.vendor_id)
            .execute(&mut *tx)
            .await
            .map_err(database_failure)?;
        }
    }
    record_event(
        &mut tx,
        &vendor.vendor_id,
        &offer_id,
        None,
        event_kind,
        &user.id,
        &dedupe,
        json!({"revision":next_revision}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(json!({
        "offer_id":offer_id,"status":state_name,"revision":next_revision,"replayed":false
    })))
}

async fn change_slot_state_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((offer_id, slot_id)): Path<(String, String)>,
    Json(request): Json<SlotCommandRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, vendor) = vendor_request_authority(&state, &headers, &request.vendor_slug).await?;
    let (command, event_kind) = slot_command(&request)?;
    let dedupe = idempotency_key(&request.idempotency_key)?;
    let mut tx = state.db.pool.begin().await.map_err(database_failure)?;
    if event_exists(&mut tx, &offer_id, event_kind, &dedupe).await? {
        tx.rollback().await.ok();
        return Ok(Json(
            json!({"offer_id":offer_id,"slot_id":slot_id,"replayed":true}),
        ));
    }
    locked_offer(&mut tx, &vendor.vendor_id, &offer_id).await?;
    let row = sqlx::query(
        "SELECT * FROM wedding_vendor_special_offer_slots WHERE slot_id=$1 AND offer_id=$2 AND vendor_id=$3 FOR UPDATE",
    )
    .bind(&slot_id)
    .bind(&offer_id)
    .bind(&vendor.vendor_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(database_failure)?
    .ok_or((StatusCode::NOT_FOUND, "Available date not found.".into()))?;
    let slot = slot_from_row(&row)?;
    let next = apply_special_slot_command(&slot, request.expected_revision, command, Utc::now())
        .map_err(policy_failure)?;
    sqlx::query(
        "UPDATE wedding_vendor_special_offer_slots SET state=$1,hold_expires_at=$2,last_confirmed_at=$3,confirmation_expires_at=$4,revision=$5,updated_by_user_id=$6,updated_at=NOW() WHERE slot_id=$7 AND offer_id=$8 AND vendor_id=$9 AND revision=$10",
    )
    .bind(slot_state_name(next.state))
    .bind(next.hold_expires_at)
    .bind(next.last_confirmed_at)
    .bind(next.confirmation_expires_at)
    .bind(next.revision as i64)
    .bind(&user.id)
    .bind(&slot_id)
    .bind(&offer_id)
    .bind(&vendor.vendor_id)
    .bind(request.expected_revision as i64)
    .execute(&mut *tx)
    .await
    .map_err(database_failure)?;
    record_event(
        &mut tx,
        &vendor.vendor_id,
        &offer_id,
        Some(&slot_id),
        event_kind,
        &user.id,
        &dedupe,
        json!({"revision":next.revision}),
    )
    .await?;
    tx.commit().await.map_err(database_failure)?;
    Ok(Json(json!({
        "offer_id":offer_id,"slot_id":slot_id,"state":slot_state_name(next.state),
        "revision":next.revision,"replayed":false
    })))
}

fn slot_command(
    request: &SlotCommandRequest,
) -> Result<(SpecialSlotCommand, &'static str), (StatusCode, String)> {
    match request.action {
        VendorSlotAction::PlaceHold => Ok((
            SpecialSlotCommand::PlaceHold {
                expires_at: parse_timestamp(request.hold_expires_at.as_deref(), "hold_expires_at")?,
            },
            "hold_created",
        )),
        VendorSlotAction::MarkBooked => Ok((SpecialSlotCommand::MarkBooked, "booked")),
        VendorSlotAction::Pause => Ok((SpecialSlotCommand::Pause, "paused")),
        VendorSlotAction::Withdraw => Ok((SpecialSlotCommand::Withdraw, "withdrawn")),
        VendorSlotAction::Reconfirm => Ok((
            SpecialSlotCommand::Reconfirm {
                expires_at: request
                    .confirmation_expires_at
                    .as_deref()
                    .map(|value| parse_timestamp(Some(value), "confirmation_expires_at"))
                    .transpose()?
                    .unwrap_or_else(|| Utc::now() + ChronoDuration::days(CONFIRMATION_DAYS)),
            },
            "reconfirmed",
        )),
    }
}

async fn locked_offer(
    tx: &mut Transaction<'_, Postgres>,
    vendor_id: &str,
    offer_id: &str,
) -> Result<sqlx::postgres::PgRow, (StatusCode, String)> {
    sqlx::query(
        "SELECT * FROM wedding_vendor_special_offers WHERE offer_id=$1 AND vendor_id=$2 FOR UPDATE",
    )
    .bind(offer_id)
    .bind(vendor_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(database_failure)?
    .ok_or((StatusCode::NOT_FOUND, "Offer not found.".into()))
}

async fn event_exists(
    tx: &mut Transaction<'_, Postgres>,
    offer_id: &str,
    event_kind: &str,
    dedupe_key: &str,
) -> Result<bool, (StatusCode, String)> {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM wedding_vendor_special_offer_events WHERE offer_id=$1 AND event_kind=$2 AND dedupe_key=$3)",
    )
    .bind(offer_id)
    .bind(event_kind)
    .bind(dedupe_key)
    .fetch_one(&mut **tx)
    .await
    .map_err(database_failure)
}

#[allow(clippy::too_many_arguments)]
async fn record_event(
    tx: &mut Transaction<'_, Postgres>,
    vendor_id: &str,
    offer_id: &str,
    slot_id: Option<&str>,
    event_kind: &str,
    user_id: &str,
    dedupe_key: &str,
    mut metadata: Value,
) -> Result<(), (StatusCode, String)> {
    if let Some(object) = metadata.as_object_mut() {
        object.insert(
            "event_version".into(),
            Value::String(WEDDING_VENDOR_SPECIAL_OFFER_EVENT_VERSION.into()),
        );
    }
    sqlx::query(
        "INSERT INTO wedding_vendor_special_offer_events (event_id,vendor_id,offer_id,slot_id,event_kind,actor_kind,actor_user_id,source_ref,dedupe_key,metadata) VALUES ($1,$2,$3,$4,$5,'vendor_user',$6,'verified_vendor_portal',$7,$8)",
    )
    .bind(Ulid::new().to_string())
    .bind(vendor_id)
    .bind(offer_id)
    .bind(slot_id)
    .bind(event_kind)
    .bind(user_id)
    .bind(dedupe_key)
    .bind(metadata)
    .execute(&mut **tx)
    .await
    .map_err(database_failure)?;
    Ok(())
}

#[cfg(test)]
mod tests;
