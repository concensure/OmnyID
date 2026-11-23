use axum::http::StatusCode;
use chrono::{DateTime, NaiveTime, Utc};
use sqlx::Row;

use crate::wedding_vendor_special_offer::{
    ApprovedOfferPricing, DateSlotCommercialTerms, SpecialOfferPublicationState,
    SpecialOfferRecord, SpecialOfferSlotRecord, SpecialOfferSlotState, SpecialOfferType,
};

pub(super) fn valid_timezone(value: &str) -> bool {
    value.parse::<chrono_tz::Tz>().is_ok()
}

pub(super) fn parse_time(value: Option<&str>) -> Result<Option<NaiveTime>, (StatusCode, String)> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            NaiveTime::parse_from_str(value, "%H:%M")
                .map_err(|_| (StatusCode::BAD_REQUEST, "Use time as HH:MM.".into()))
        })
        .transpose()
}

pub(super) fn parse_timestamp(
    value: Option<&str>,
    field: &str,
) -> Result<DateTime<Utc>, (StatusCode, String)> {
    value
        .ok_or((StatusCode::BAD_REQUEST, format!("{field} is required.")))?
        .parse::<DateTime<Utc>>()
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                format!("{field} must be RFC 3339."),
            )
        })
}

pub(super) fn offer_type_name(value: SpecialOfferType) -> &'static str {
    match value {
        SpecialOfferType::Package => "package",
        SpecialOfferType::MinimumSpend => "minimum_spend",
        SpecialOfferType::PerHead => "per_head",
        SpecialOfferType::HireFee => "hire_fee",
        SpecialOfferType::IncentiveOnly => "incentive_only",
    }
}

pub(super) fn slot_state_name(value: SpecialOfferSlotState) -> &'static str {
    match value {
        SpecialOfferSlotState::Available => "available",
        SpecialOfferSlotState::EnquiryReceived => "enquiry_received",
        SpecialOfferSlotState::ProvisionalHold => "provisional_hold",
        SpecialOfferSlotState::Booked => "booked",
        SpecialOfferSlotState::Paused => "paused",
        SpecialOfferSlotState::Withdrawn => "withdrawn",
        SpecialOfferSlotState::Stale => "stale",
    }
}

pub(super) fn database_failure(error: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(%error, "Wedding vendor special-offer database operation failed");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "The limited-date offer could not be saved just now.".into(),
    )
}

pub(super) fn pricing_from_row(row: &sqlx::postgres::PgRow) -> ApprovedOfferPricing {
    ApprovedOfferPricing {
        currency: row.get("currency"),
        fixed_total_cents: row.get("fixed_total_cents"),
        per_guest_cents: row.get("per_guest_cents"),
        hire_fee_cents: row.get("hire_fee_cents"),
        minimum_spend_cents: row.get("minimum_spend_cents"),
        mandatory_charges_cents: row.get("mandatory_charges_cents"),
        mandatory_charges_known: row.get("mandatory_charges_known"),
        mandatory_charges_summary: row.get("mandatory_charges_summary"),
        estimate_min_cents: row.get("estimate_min_cents"),
        estimate_max_cents: row.get("estimate_max_cents"),
        reference_price_cents: row.get("reference_price_cents"),
        savings_basis_label: row.get("savings_basis_label"),
        savings_evidence_ref: row.get("savings_evidence_ref"),
    }
}

pub(super) fn terms_from_row(row: &sqlx::postgres::PgRow) -> DateSlotCommercialTerms {
    DateSlotCommercialTerms {
        maximum_capacity: row
            .get::<Option<i32>, _>("maximum_capacity")
            .map(|value| value as u32),
        minimum_spend_cents: row.get("minimum_spend_cents"),
        indicative_per_head_cents: row.get("indicative_per_head_cents"),
        inclusions: row.get("inclusions"),
        public_conditions: row.get("public_conditions"),
    }
}

pub(super) fn offer_from_row(
    row: &sqlx::postgres::PgRow,
) -> Result<SpecialOfferRecord, (StatusCode, String)> {
    Ok(SpecialOfferRecord {
        offer_id: row.get("offer_id"),
        vendor_id: row.get("vendor_id"),
        title: row.get("title"),
        summary: row.get("summary"),
        offer_type: parse_offer_type(row.get::<String, _>("offer_type").as_str())?,
        publication_state: parse_publication_state(
            row.get::<String, _>("publication_state").as_str(),
        )?,
        guest_min: row
            .get::<Option<i32>, _>("guest_min")
            .map(|value| value as u32),
        guest_max: row
            .get::<Option<i32>, _>("guest_max")
            .map(|value| value as u32),
        pricing: pricing_from_row(row),
        inclusions: row.get("inclusions"),
        exclusions: row.get("exclusions"),
        public_conditions: row.get("public_conditions"),
        approved_revision: row
            .get::<Option<i64>, _>("approved_revision")
            .map(|value| value as u64),
        revision: row.get::<i64, _>("revision") as u64,
    })
}

pub(super) fn slot_from_row(
    row: &sqlx::postgres::PgRow,
) -> Result<SpecialOfferSlotRecord, (StatusCode, String)> {
    Ok(SpecialOfferSlotRecord {
        slot_id: row.get("slot_id"),
        offer_id: row.get("offer_id"),
        vendor_id: row.get("vendor_id"),
        local_date: row.get("local_date"),
        timezone: row.get("timezone"),
        space_label: row.get("space_label"),
        session_label: row.get("session_label"),
        commercial_terms: terms_from_row(row),
        state: parse_slot_state(row.get::<String, _>("state").as_str())?,
        hold_expires_at: row.get("hold_expires_at"),
        last_confirmed_at: row.get("last_confirmed_at"),
        confirmation_expires_at: row.get("confirmation_expires_at"),
        revision: row.get::<i64, _>("revision") as u64,
    })
}

fn parse_offer_type(value: &str) -> Result<SpecialOfferType, (StatusCode, String)> {
    match value {
        "package" => Ok(SpecialOfferType::Package),
        "minimum_spend" => Ok(SpecialOfferType::MinimumSpend),
        "per_head" => Ok(SpecialOfferType::PerHead),
        "hire_fee" => Ok(SpecialOfferType::HireFee),
        "incentive_only" => Ok(SpecialOfferType::IncentiveOnly),
        _ => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Invalid stored offer type.".into(),
        )),
    }
}

fn parse_publication_state(
    value: &str,
) -> Result<SpecialOfferPublicationState, (StatusCode, String)> {
    match value {
        "draft" => Ok(SpecialOfferPublicationState::Draft),
        "active" => Ok(SpecialOfferPublicationState::Active),
        "paused" => Ok(SpecialOfferPublicationState::Paused),
        "withdrawn" => Ok(SpecialOfferPublicationState::Withdrawn),
        "expired" => Ok(SpecialOfferPublicationState::Expired),
        _ => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Invalid stored offer state.".into(),
        )),
    }
}

fn parse_slot_state(value: &str) -> Result<SpecialOfferSlotState, (StatusCode, String)> {
    match value {
        "available" => Ok(SpecialOfferSlotState::Available),
        "enquiry_received" => Ok(SpecialOfferSlotState::EnquiryReceived),
        "provisional_hold" => Ok(SpecialOfferSlotState::ProvisionalHold),
        "booked" => Ok(SpecialOfferSlotState::Booked),
        "paused" => Ok(SpecialOfferSlotState::Paused),
        "withdrawn" => Ok(SpecialOfferSlotState::Withdrawn),
        "stale" => Ok(SpecialOfferSlotState::Stale),
        _ => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Invalid stored date state.".into(),
        )),
    }
}
