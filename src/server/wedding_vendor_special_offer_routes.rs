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
    wedding_vendor_portal_routes::{VendorPermission, require_vendor_access},
};

mod records;
use records::*;
mod admin;
mod capability;
mod commands;
mod discovery;
mod enquiry;
mod privacy;

const MAX_SLOTS_PER_OFFER: usize = 100;
const MAX_INCLUSIONS: usize = 40;
const CONFIRMATION_DAYS: i64 = 14;
const MAX_HOLD_DAYS: i64 = 7;

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
            "/wedding/vendor/special-offers/{offer_id}/edit",
            post(edit_offer_http),
        )
        .route(
            "/wedding/vendor/special-offers/{offer_id}/state",
            post(change_offer_state_http),
        )
        .route(
            "/wedding/vendor/special-offers/{offer_id}/slots/{slot_id}/state",
            post(change_slot_state_http),
        )
        .route(
            "/wedding/vendor-specials/enquiries/link",
            post(enquiry::link_special_enquiry_http),
        )
        .route(
            "/wedding/vendor-specials/enquiries/recheck",
            post(enquiry::recheck_special_enquiry_http),
        )
        .route(
            "/wedding/vendor-specials/enquiries/delivery-failure",
            post(enquiry::record_special_delivery_failure_http),
        )
        .merge(admin::routes())
        .merge(discovery::routes())
        .merge(capability::routes())
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

#[derive(Debug, Deserialize)]
struct EditOfferRequest {
    vendor_slug: String,
    idempotency_key: String,
    expected_offer_revision: u64,
    slot_id: String,
    expected_slot_revision: u64,
    title: String,
    summary: String,
    slot: DateSlotDraftRequest,
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
    reason: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum VendorSlotAction {
    CalendarOpen,
    ConfirmAvailability,
    RecordEnquiry,
    PlaceHold,
    MarkBooked,
    ReopenCancelledBooking,
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

#[derive(Clone, Copy)]
struct CommandActor<'a> {
    kind: &'static str,
    user_id: Option<&'a str>,
    source: &'static str,
}

impl<'a> CommandActor<'a> {
    fn verified_vendor(user_id: &'a str) -> Self {
        Self {
            kind: "vendor_user",
            user_id: Some(user_id),
            source: "verified_vendor_portal",
        }
    }

    fn couple(user_id: &'a str) -> Self {
        Self {
            kind: "couple",
            user_id: Some(user_id),
            source: "approved_vendor_enquiry",
        }
    }
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
            .any(|value| {
                value == "*" || (!value.is_empty() && value == email.trim().to_ascii_lowercase())
            })
}

async fn vendor_request_authority(
    state: &AppState,
    headers: &HeaderMap,
    vendor_slug: &str,
) -> Result<(crate::db::UserRecord, VendorAuthority), (StatusCode, String)> {
    let (user, access) =
        require_vendor_access(state, headers, vendor_slug, VendorPermission::Calendar).await?;
    if !rollout_allowed(&user.email) {
        return Err((
            StatusCode::FORBIDDEN,
            "Limited-date offer management is not enabled for this account.".into(),
        ));
    }
    let vendor = VendorAuthority {
        vendor_id: access.vendor_id,
        vendor_name: access.vendor_name,
        category: access.category,
    };
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
        CommandActor::verified_vendor(&user.id),
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
            "SELECT slot.*,(SELECT COUNT(*) FROM wedding_vendor_special_offer_enquiries enquiry WHERE enquiry.slot_id=slot.slot_id) AS affected_enquiry_count FROM wedding_vendor_special_offer_slots slot WHERE offer_id=$1 AND vendor_id=$2 ORDER BY local_date,starts_at NULLS FIRST",
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
            "room_id":offer.get::<Option<String>,_>("room_id"),
            "summary":offer.get::<String,_>("summary"),
            "publication_state":offer.get::<String,_>("publication_state"),
            "currency":offer.get::<String,_>("currency"),
            "inclusions":offer.get::<Vec<String>,_>("inclusions"),
            "public_conditions":offer.get::<Option<String>,_>("public_conditions"),
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
        "starts_at":row.get::<Option<NaiveTime>,_>("starts_at").map(|value| value.format("%H:%M").to_string()),
        "ends_at":row.get::<Option<NaiveTime>,_>("ends_at").map(|value| value.format("%H:%M").to_string()),
        "space_label":row.get::<String,_>("space_label"),
        "session_label":row.get::<String,_>("session_label"),
        "state":row.get::<String,_>("state"),
        "availability_scope":row.get::<String,_>("availability_scope"),
        "availability_scope_updated_at":row.get::<chrono::DateTime<Utc>,_>("availability_scope_updated_at"),
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
        "last_confirmed_at":row.get::<chrono::DateTime<Utc>,_>("last_confirmed_at"),
        "confirmation_expires_at":row.get::<chrono::DateTime<Utc>,_>("confirmation_expires_at"),
        "revision":row.get::<i64,_>("revision")
        ,"affected_enquiry_count":row.try_get::<i64,_>("affected_enquiry_count").unwrap_or(0)
        ,"operator_warning":if matches!(row.get::<String,_>("state").as_str(), "stale" | "paused" | "withdrawn") && row.try_get::<i64,_>("affected_enquiry_count").unwrap_or(0) > 0 { Some("This date is hidden from discovery and has affected enquiries to review.") } else if row.get::<chrono::DateTime<Utc>,_>("confirmation_expires_at") <= Utc::now() + ChronoDuration::days(3) && matches!(row.get::<String,_>("state").as_str(), "available" | "enquiry_received") { Some("Availability confirmation expires within three days. Reconfirm it to keep this date visible.") } else { None::<&str> }
    })
}

async fn publish_offer_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(offer_id): Path<String>,
    Json(request): Json<OfferCommandRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, vendor) = vendor_request_authority(&state, &headers, &request.vendor_slug).await?;
    commands::publish_offer(
        &state,
        &vendor.vendor_id,
        &offer_id,
        request.expected_revision,
        &request.idempotency_key,
        CommandActor::verified_vendor(&user.id),
    )
    .await
    .map(Json)
}

async fn edit_offer_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(offer_id): Path<String>,
    Json(request): Json<EditOfferRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, vendor) = vendor_request_authority(&state, &headers, &request.vendor_slug).await?;
    let title = required(&request.title, "title", 160)?;
    let summary = required(&request.summary, "summary", 1_200)?;
    let slot = validate_slot_request(request.slot)?;
    commands::edit_offer(
        &state,
        &vendor.vendor_id,
        &offer_id,
        &request.slot_id,
        request.expected_offer_revision,
        request.expected_slot_revision,
        title,
        summary,
        slot,
        &request.idempotency_key,
        CommandActor::verified_vendor(&user.id),
    )
    .await
    .map(Json)
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
    commands::change_offer_state(
        &state,
        &vendor.vendor_id,
        &offer_id,
        request.expected_revision,
        action,
        &request.idempotency_key,
        CommandActor::verified_vendor(&user.id),
    )
    .await
    .map(Json)
}

async fn change_slot_state_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((offer_id, slot_id)): Path<(String, String)>,
    Json(request): Json<SlotCommandRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let (user, vendor) = vendor_request_authority(&state, &headers, &request.vendor_slug).await?;
    commands::change_slot_state(
        &state,
        &vendor.vendor_id,
        &offer_id,
        &slot_id,
        &request,
        CommandActor::verified_vendor(&user.id),
    )
    .await
    .map(Json)
}

fn slot_command(
    request: &SlotCommandRequest,
) -> Result<(SpecialSlotCommand, &'static str), (StatusCode, String)> {
    match request.action {
        VendorSlotAction::CalendarOpen => Ok((
            SpecialSlotCommand::Reconfirm {
                expires_at: Utc::now() + ChronoDuration::days(CONFIRMATION_DAYS),
            },
            "calendar_opened",
        )),
        VendorSlotAction::ConfirmAvailability => Ok((
            SpecialSlotCommand::Reconfirm {
                expires_at: Utc::now() + ChronoDuration::days(CONFIRMATION_DAYS),
            },
            "availability_confirmed",
        )),
        VendorSlotAction::RecordEnquiry => {
            Ok((SpecialSlotCommand::RecordEnquiry, "enquiry_received"))
        }
        VendorSlotAction::PlaceHold => {
            let expires_at =
                parse_timestamp(request.hold_expires_at.as_deref(), "hold_expires_at")?;
            if expires_at > Utc::now() + ChronoDuration::days(MAX_HOLD_DAYS) {
                return Err((
                    StatusCode::BAD_REQUEST,
                    format!("A provisional hold cannot exceed {MAX_HOLD_DAYS} days."),
                ));
            }
            Ok((SpecialSlotCommand::PlaceHold { expires_at }, "hold_created"))
        }
        VendorSlotAction::MarkBooked => Ok((SpecialSlotCommand::MarkBooked, "booked")),
        VendorSlotAction::ReopenCancelledBooking => {
            let reason = required(request.reason.as_deref().unwrap_or_default(), "reason", 500)?;
            if reason.chars().count() < 10 {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "Briefly explain why the booking was cancelled or entered by mistake.".into(),
                ));
            }
            Ok((
                SpecialSlotCommand::ReopenCancelledBooking {
                    expires_at: request
                        .confirmation_expires_at
                        .as_deref()
                        .map(|value| parse_timestamp(Some(value), "confirmation_expires_at"))
                        .transpose()?
                        .unwrap_or_else(|| Utc::now() + ChronoDuration::days(CONFIRMATION_DAYS)),
                },
                "cancelled_booking_reopened",
            ))
        }
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
    actor: CommandActor<'_>,
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
        "INSERT INTO wedding_vendor_special_offer_events (event_id,vendor_id,offer_id,slot_id,event_kind,actor_kind,actor_user_id,source_ref,dedupe_key,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    )
    .bind(Ulid::new().to_string())
    .bind(vendor_id)
    .bind(offer_id)
    .bind(slot_id)
    .bind(event_kind)
    .bind(actor.kind)
    .bind(actor.user_id)
    .bind(actor.source)
    .bind(dedupe_key)
    .bind(metadata)
    .execute(&mut **tx)
    .await
    .map_err(database_failure)?;
    Ok(())
}

#[cfg(test)]
mod tests;
