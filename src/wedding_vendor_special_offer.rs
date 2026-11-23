//! Pure policy for vendor-controlled limited-date wedding offers.
//!
//! Persistence and HTTP layers must use these rules rather than growing a
//! second availability or booking state machine.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

pub const WEDDING_VENDOR_SPECIAL_OFFER_SCHEMA_VERSION: &str = "wedding.vendor_special_offer.v1";
pub const WEDDING_VENDOR_SPECIAL_OFFER_EVENT_VERSION: &str =
    "wedding.vendor_special_offer.event.v1";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SpecialOfferPublicationState {
    Draft,
    Active,
    Paused,
    Withdrawn,
    Expired,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SpecialOfferSlotState {
    Available,
    EnquiryReceived,
    ProvisionalHold,
    Booked,
    Paused,
    Withdrawn,
    Stale,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SpecialOfferType {
    Package,
    MinimumSpend,
    PerHead,
    HireFee,
    IncentiveOnly,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ApprovedOfferPricing {
    pub currency: String,
    pub fixed_total_cents: Option<i64>,
    pub per_guest_cents: Option<i64>,
    pub hire_fee_cents: Option<i64>,
    pub minimum_spend_cents: Option<i64>,
    pub mandatory_charges_cents: Option<i64>,
    pub mandatory_charges_known: bool,
    pub mandatory_charges_summary: Option<String>,
    pub estimate_min_cents: Option<i64>,
    pub estimate_max_cents: Option<i64>,
    pub reference_price_cents: Option<i64>,
    pub savings_basis_label: Option<String>,
    pub savings_evidence_ref: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ApprovedPriceEstimate {
    pub currency: String,
    pub low_cents: Option<i64>,
    pub high_cents: Option<i64>,
    pub ranking_total_cents: Option<i64>,
    pub budget_fit_eligible: bool,
    pub unknown_costs: bool,
    pub substantiated_savings_cents: Option<i64>,
    pub savings_basis_label: Option<String>,
    pub savings_evidence_ref: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpecialOfferRecord {
    pub offer_id: String,
    pub vendor_id: String,
    pub title: String,
    pub summary: String,
    pub offer_type: SpecialOfferType,
    pub publication_state: SpecialOfferPublicationState,
    pub guest_min: Option<u32>,
    pub guest_max: Option<u32>,
    pub pricing: ApprovedOfferPricing,
    pub inclusions: Vec<String>,
    pub exclusions: Vec<String>,
    pub public_conditions: Option<String>,
    pub approved_revision: Option<u64>,
    pub revision: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SpecialOfferSlotRecord {
    pub slot_id: String,
    pub offer_id: String,
    pub vendor_id: String,
    pub local_date: NaiveDate,
    pub timezone: String,
    pub space_label: String,
    pub session_label: String,
    pub commercial_terms: DateSlotCommercialTerms,
    pub state: SpecialOfferSlotState,
    pub hold_expires_at: Option<DateTime<Utc>>,
    pub last_confirmed_at: DateTime<Utc>,
    pub confirmation_expires_at: DateTime<Utc>,
    pub revision: u64,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
pub struct DateSlotCommercialTerms {
    pub maximum_capacity: Option<u32>,
    pub minimum_spend_cents: Option<i64>,
    pub indicative_per_head_cents: Option<i64>,
    pub inclusions: Vec<String>,
    pub public_conditions: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CoupleSpecialOfferDetail {
    pub offer_id: String,
    pub slot_id: String,
    pub local_date: NaiveDate,
    pub timezone: String,
    pub space_label: String,
    pub session_label: String,
    pub title: String,
    pub summary: String,
    pub selected_guest_count: Option<u32>,
    pub maximum_capacity: Option<u32>,
    pub pricing: ApprovedPriceEstimate,
    pub inclusions: Vec<String>,
    pub exclusions: Vec<String>,
    pub public_conditions: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CoupleSpecialMarkerProjection {
    pub vendor_id: String,
    pub indicative_only: bool,
    pub availability_label: String,
    pub last_confirmed_at: DateTime<Utc>,
    pub exact_detail: Option<CoupleSpecialOfferDetail>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SpecialOfferPolicyError {
    InvalidCurrency,
    NegativeMoney,
    InvalidEstimateRange,
    UnsubstantiatedSavingsClaim,
    GuestCountOutsideOffer,
    GuestCountOutsideDateCapacity,
    NoApprovedPrice,
    OfferNotActive,
    OfferRevisionNotApproved,
    SlotNotDiscoverable,
    StaleRevision { expected: u64, actual: u64 },
    InvalidTransition,
    InvalidExpiry,
}

fn non_blank(value: &Option<String>) -> bool {
    value
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
}

pub fn validate_approved_pricing(
    pricing: &ApprovedOfferPricing,
) -> Result<(), SpecialOfferPolicyError> {
    if pricing.currency.len() != 3
        || !pricing
            .currency
            .chars()
            .all(|value| value.is_ascii_uppercase())
    {
        return Err(SpecialOfferPolicyError::InvalidCurrency);
    }
    let amounts = [
        pricing.fixed_total_cents,
        pricing.per_guest_cents,
        pricing.hire_fee_cents,
        pricing.minimum_spend_cents,
        pricing.mandatory_charges_cents,
        pricing.estimate_min_cents,
        pricing.estimate_max_cents,
        pricing.reference_price_cents,
    ];
    if amounts.into_iter().flatten().any(|value| value < 0) {
        return Err(SpecialOfferPolicyError::NegativeMoney);
    }
    if pricing
        .estimate_min_cents
        .zip(pricing.estimate_max_cents)
        .is_some_and(|(low, high)| low > high)
    {
        return Err(SpecialOfferPolicyError::InvalidEstimateRange);
    }
    if pricing.reference_price_cents.is_some()
        && (!non_blank(&pricing.savings_basis_label) || !non_blank(&pricing.savings_evidence_ref))
    {
        return Err(SpecialOfferPolicyError::UnsubstantiatedSavingsClaim);
    }
    Ok(())
}

/// Calculate only from venue-approved inputs. `couple_budget_cents` is
/// deliberately absent: a larger couple budget must never change the price.
pub fn approved_price_estimate(
    pricing: &ApprovedOfferPricing,
    guest_count: Option<u32>,
) -> Result<ApprovedPriceEstimate, SpecialOfferPolicyError> {
    validate_approved_pricing(pricing)?;

    let structured = match (pricing.fixed_total_cents, pricing.per_guest_cents) {
        (Some(total), _) => Some(total),
        (None, Some(per_guest)) => guest_count.map(|guests| {
            per_guest
                .saturating_mul(i64::from(guests))
                .saturating_add(pricing.hire_fee_cents.unwrap_or(0))
        }),
        (None, None) => pricing.hire_fee_cents,
    };
    let structured = structured
        .or(pricing.minimum_spend_cents)
        .map(|value| value.max(pricing.minimum_spend_cents.unwrap_or(0)));
    let structured =
        structured.map(|value| value.saturating_add(pricing.mandatory_charges_cents.unwrap_or(0)));

    let low = structured.or(pricing.estimate_min_cents);
    let high = structured.or(pricing.estimate_max_cents).or(low);
    if low.is_none() && high.is_none() {
        return Err(SpecialOfferPolicyError::NoApprovedPrice);
    }

    let unknown_costs = !pricing.mandatory_charges_known;
    let budget_fit_eligible = !unknown_costs && high.is_some();
    let substantiated_savings_cents = if budget_fit_eligible {
        pricing
            .reference_price_cents
            .zip(high)
            .and_then(|(reference, offer)| (reference > offer).then_some(reference - offer))
    } else {
        None
    };

    Ok(ApprovedPriceEstimate {
        currency: pricing.currency.clone(),
        low_cents: low,
        high_cents: high,
        ranking_total_cents: budget_fit_eligible.then_some(high).flatten(),
        budget_fit_eligible,
        unknown_costs,
        substantiated_savings_cents,
        savings_basis_label: substantiated_savings_cents
            .and_then(|_| pricing.savings_basis_label.clone()),
        savings_evidence_ref: substantiated_savings_cents
            .and_then(|_| pricing.savings_evidence_ref.clone()),
    })
}

pub fn pricing_for_date(
    offer: &ApprovedOfferPricing,
    terms: &DateSlotCommercialTerms,
) -> Result<ApprovedOfferPricing, SpecialOfferPolicyError> {
    if terms
        .minimum_spend_cents
        .into_iter()
        .chain(terms.indicative_per_head_cents)
        .any(|value| value < 0)
    {
        return Err(SpecialOfferPolicyError::NegativeMoney);
    }
    let mut pricing = offer.clone();
    if terms.minimum_spend_cents.is_some() {
        pricing.minimum_spend_cents = terms.minimum_spend_cents;
    }
    if terms.indicative_per_head_cents.is_some() {
        pricing.per_guest_cents = terms.indicative_per_head_cents;
        pricing.fixed_total_cents = None;
    }
    validate_approved_pricing(&pricing)?;
    Ok(pricing)
}

pub fn approved_date_price_estimate(
    offer: &ApprovedOfferPricing,
    terms: &DateSlotCommercialTerms,
    guest_count: Option<u32>,
) -> Result<ApprovedPriceEstimate, SpecialOfferPolicyError> {
    if terms
        .maximum_capacity
        .zip(guest_count)
        .is_some_and(|(capacity, guests)| guests > capacity)
    {
        return Err(SpecialOfferPolicyError::GuestCountOutsideDateCapacity);
    }
    approved_price_estimate(&pricing_for_date(offer, terms)?, guest_count)
}

pub fn validate_offer_for_publication(
    offer: &SpecialOfferRecord,
    slots: &[SpecialOfferSlotRecord],
    now: DateTime<Utc>,
) -> Result<(), SpecialOfferPolicyError> {
    if offer.publication_state != SpecialOfferPublicationState::Active {
        return Err(SpecialOfferPolicyError::OfferNotActive);
    }
    if offer.approved_revision != Some(offer.revision) {
        return Err(SpecialOfferPolicyError::OfferRevisionNotApproved);
    }
    validate_approved_pricing(&offer.pricing)?;
    if !slots
        .iter()
        .any(|slot| slot.offer_id == offer.offer_id && special_slot_discoverable(slot, now))
    {
        return Err(SpecialOfferPolicyError::SlotNotDiscoverable);
    }
    Ok(())
}

pub fn special_slot_discoverable(slot: &SpecialOfferSlotRecord, now: DateTime<Utc>) -> bool {
    matches!(
        slot.state,
        SpecialOfferSlotState::Available | SpecialOfferSlotState::EnquiryReceived
    ) && slot.confirmation_expires_at > now
}

pub fn project_couple_special_marker(
    offer: &SpecialOfferRecord,
    slot: &SpecialOfferSlotRecord,
    guest_count: Option<u32>,
    is_top_three: bool,
    now: DateTime<Utc>,
) -> Result<CoupleSpecialMarkerProjection, SpecialOfferPolicyError> {
    validate_offer_for_publication(offer, std::slice::from_ref(slot), now)?;
    if offer
        .guest_min
        .is_some_and(|minimum| guest_count.is_some_and(|count| count < minimum))
        || offer
            .guest_max
            .is_some_and(|maximum| guest_count.is_some_and(|count| count > maximum))
    {
        return Err(SpecialOfferPolicyError::GuestCountOutsideOffer);
    }
    let exact_detail = if is_top_three {
        Some(CoupleSpecialOfferDetail {
            offer_id: offer.offer_id.clone(),
            slot_id: slot.slot_id.clone(),
            local_date: slot.local_date,
            timezone: slot.timezone.clone(),
            space_label: slot.space_label.clone(),
            session_label: slot.session_label.clone(),
            title: offer.title.clone(),
            summary: offer.summary.clone(),
            selected_guest_count: guest_count,
            maximum_capacity: slot.commercial_terms.maximum_capacity.or(offer.guest_max),
            pricing: approved_date_price_estimate(
                &offer.pricing,
                &slot.commercial_terms,
                guest_count,
            )?,
            inclusions: if slot.commercial_terms.inclusions.is_empty() {
                offer.inclusions.clone()
            } else {
                slot.commercial_terms.inclusions.clone()
            },
            exclusions: offer.exclusions.clone(),
            public_conditions: slot
                .commercial_terms
                .public_conditions
                .clone()
                .or_else(|| offer.public_conditions.clone()),
        })
    } else {
        None
    };
    Ok(CoupleSpecialMarkerProjection {
        vendor_id: offer.vendor_id.clone(),
        indicative_only: true,
        availability_label: "Special may apply · Subject to vendor confirmation".to_string(),
        last_confirmed_at: slot.last_confirmed_at,
        exact_detail,
    })
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SpecialSlotCommand {
    RecordEnquiry,
    PlaceHold { expires_at: DateTime<Utc> },
    ExpireHold,
    MarkBooked,
    ReopenCancelledBooking { expires_at: DateTime<Utc> },
    Pause,
    Withdraw,
    MarkStale,
    Reconfirm { expires_at: DateTime<Utc> },
}

pub fn apply_special_slot_command(
    slot: &SpecialOfferSlotRecord,
    expected_revision: u64,
    command: SpecialSlotCommand,
    now: DateTime<Utc>,
) -> Result<SpecialOfferSlotRecord, SpecialOfferPolicyError> {
    if expected_revision != slot.revision {
        return Err(SpecialOfferPolicyError::StaleRevision {
            expected: expected_revision,
            actual: slot.revision,
        });
    }
    let mut next = slot.clone();
    match command {
        SpecialSlotCommand::RecordEnquiry
            if matches!(
                slot.state,
                SpecialOfferSlotState::Available | SpecialOfferSlotState::EnquiryReceived
            ) =>
        {
            next.state = SpecialOfferSlotState::EnquiryReceived;
            next.hold_expires_at = None;
        }
        SpecialSlotCommand::PlaceHold { expires_at }
            if matches!(
                slot.state,
                SpecialOfferSlotState::Available | SpecialOfferSlotState::EnquiryReceived
            ) =>
        {
            if expires_at <= now {
                return Err(SpecialOfferPolicyError::InvalidExpiry);
            }
            next.state = SpecialOfferSlotState::ProvisionalHold;
            next.hold_expires_at = Some(expires_at);
        }
        SpecialSlotCommand::ExpireHold
            if slot.state == SpecialOfferSlotState::ProvisionalHold
                && slot.hold_expires_at.is_some_and(|expiry| expiry <= now) =>
        {
            next.state = if slot.confirmation_expires_at > now {
                SpecialOfferSlotState::Available
            } else {
                SpecialOfferSlotState::Stale
            };
            next.hold_expires_at = None;
        }
        SpecialSlotCommand::MarkBooked
            if matches!(
                slot.state,
                SpecialOfferSlotState::Available
                    | SpecialOfferSlotState::EnquiryReceived
                    | SpecialOfferSlotState::ProvisionalHold
            ) =>
        {
            next.state = SpecialOfferSlotState::Booked;
            next.hold_expires_at = None;
        }
        SpecialSlotCommand::ReopenCancelledBooking { expires_at }
            if slot.state == SpecialOfferSlotState::Booked =>
        {
            if expires_at <= now {
                return Err(SpecialOfferPolicyError::InvalidExpiry);
            }
            next.state = SpecialOfferSlotState::Available;
            next.hold_expires_at = None;
            next.last_confirmed_at = now;
            next.confirmation_expires_at = expires_at;
        }
        SpecialSlotCommand::Pause
            if matches!(
                slot.state,
                SpecialOfferSlotState::Available
                    | SpecialOfferSlotState::EnquiryReceived
                    | SpecialOfferSlotState::ProvisionalHold
            ) =>
        {
            next.state = SpecialOfferSlotState::Paused;
            next.hold_expires_at = None;
        }
        SpecialSlotCommand::Withdraw if slot.state != SpecialOfferSlotState::Booked => {
            next.state = SpecialOfferSlotState::Withdrawn;
            next.hold_expires_at = None;
        }
        SpecialSlotCommand::MarkStale
            if matches!(
                slot.state,
                SpecialOfferSlotState::Available | SpecialOfferSlotState::EnquiryReceived
            ) =>
        {
            next.state = SpecialOfferSlotState::Stale;
            next.hold_expires_at = None;
        }
        SpecialSlotCommand::Reconfirm { expires_at }
            if matches!(
                slot.state,
                SpecialOfferSlotState::Available
                    | SpecialOfferSlotState::EnquiryReceived
                    | SpecialOfferSlotState::Paused
                    | SpecialOfferSlotState::Withdrawn
                    | SpecialOfferSlotState::Stale
            ) =>
        {
            if expires_at <= now {
                return Err(SpecialOfferPolicyError::InvalidExpiry);
            }
            next.state = SpecialOfferSlotState::Available;
            next.hold_expires_at = None;
            next.last_confirmed_at = now;
            next.confirmation_expires_at = expires_at;
        }
        _ => return Err(SpecialOfferPolicyError::InvalidTransition),
    }
    next.revision = next.revision.saturating_add(1);
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, TimeZone};

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 11, 6, 3, 0, 0).unwrap()
    }

    fn pricing() -> ApprovedOfferPricing {
        ApprovedOfferPricing {
            currency: "AUD".to_string(),
            fixed_total_cents: None,
            per_guest_cents: Some(20_000),
            hire_fee_cents: Some(100_000),
            minimum_spend_cents: Some(1_500_000),
            mandatory_charges_cents: Some(50_000),
            mandatory_charges_known: true,
            mandatory_charges_summary: Some("Venue levy".to_string()),
            estimate_min_cents: None,
            estimate_max_cents: None,
            reference_price_cents: Some(2_000_000),
            savings_basis_label: Some(
                "Approved standard package for the same requirements".to_string(),
            ),
            savings_evidence_ref: Some("package-v4".to_string()),
        }
    }

    fn offer() -> SpecialOfferRecord {
        SpecialOfferRecord {
            offer_id: "offer-1".to_string(),
            vendor_id: "venue-1".to_string(),
            title: "Selected winter date".to_string(),
            summary: "An approved package for a quieter date.".to_string(),
            offer_type: SpecialOfferType::Package,
            publication_state: SpecialOfferPublicationState::Active,
            guest_min: Some(40),
            guest_max: Some(100),
            pricing: pricing(),
            inclusions: vec!["Room hire".to_string()],
            exclusions: vec!["Styling upgrades".to_string()],
            public_conditions: Some("Subject to venue confirmation".to_string()),
            approved_revision: Some(2),
            revision: 2,
        }
    }

    fn slot() -> SpecialOfferSlotRecord {
        SpecialOfferSlotRecord {
            slot_id: "slot-1".to_string(),
            offer_id: "offer-1".to_string(),
            vendor_id: "venue-1".to_string(),
            local_date: NaiveDate::from_ymd_opt(2027, 7, 3).unwrap(),
            timezone: "Australia/Sydney".to_string(),
            space_label: "Garden room".to_string(),
            session_label: "Evening".to_string(),
            commercial_terms: DateSlotCommercialTerms {
                maximum_capacity: Some(90),
                minimum_spend_cents: Some(1_400_000),
                indicative_per_head_cents: Some(18_000),
                inclusions: vec!["Room hire".to_string(), "Staffing".to_string()],
                public_conditions: Some("Indicative and subject to confirmation".to_string()),
            },
            state: SpecialOfferSlotState::Available,
            hold_expires_at: None,
            last_confirmed_at: now(),
            confirmation_expires_at: now() + Duration::days(7),
            revision: 4,
        }
    }

    #[test]
    fn approved_price_uses_requirements_not_the_couples_budget() {
        let estimate = approved_price_estimate(&pricing(), Some(80)).unwrap();
        assert_eq!(estimate.high_cents, Some(1_750_000));
        assert_eq!(estimate.ranking_total_cents, Some(1_750_000));
        assert_eq!(estimate.substantiated_savings_cents, Some(250_000));
    }

    #[test]
    fn date_terms_calculate_the_indicative_total_for_selected_guests() {
        let estimate =
            approved_date_price_estimate(&pricing(), &slot().commercial_terms, Some(80)).unwrap();
        assert_eq!(estimate.high_cents, Some(1_590_000));
        assert_eq!(estimate.ranking_total_cents, Some(1_590_000));
    }

    #[test]
    fn date_minimum_spend_is_still_an_estimate_without_per_head_pricing() {
        let terms = DateSlotCommercialTerms {
            maximum_capacity: Some(100),
            minimum_spend_cents: Some(900_000),
            indicative_per_head_cents: None,
            inclusions: vec![],
            public_conditions: None,
        };
        let mut base = pricing();
        base.fixed_total_cents = None;
        base.per_guest_cents = None;
        base.hire_fee_cents = None;
        assert_eq!(
            approved_date_price_estimate(&base, &terms, Some(60))
                .unwrap()
                .high_cents,
            Some(950_000)
        );
    }

    #[test]
    fn selected_guests_cannot_exceed_the_dates_capacity() {
        assert_eq!(
            approved_date_price_estimate(&pricing(), &slot().commercial_terms, Some(91)),
            Err(SpecialOfferPolicyError::GuestCountOutsideDateCapacity)
        );
    }

    #[test]
    fn unknown_mandatory_costs_cannot_claim_budget_fit_or_savings() {
        let mut value = pricing();
        value.mandatory_charges_known = false;
        let estimate = approved_price_estimate(&value, Some(80)).unwrap();
        assert!(!estimate.budget_fit_eligible);
        assert_eq!(estimate.ranking_total_cents, None);
        assert_eq!(estimate.substantiated_savings_cents, None);
    }

    #[test]
    fn comparison_price_needs_an_auditable_basis() {
        let mut value = pricing();
        value.savings_evidence_ref = None;
        assert_eq!(
            validate_approved_pricing(&value),
            Err(SpecialOfferPolicyError::UnsubstantiatedSavingsClaim)
        );
    }

    #[test]
    fn exact_details_are_revealed_only_for_top_three() {
        let hidden =
            project_couple_special_marker(&offer(), &slot(), Some(80), false, now()).unwrap();
        assert!(hidden.exact_detail.is_none());
        assert!(hidden.indicative_only);
        let revealed =
            project_couple_special_marker(&offer(), &slot(), Some(80), true, now()).unwrap();
        assert_eq!(
            revealed.exact_detail.unwrap().local_date.to_string(),
            "2027-07-03"
        );
    }

    #[test]
    fn enquiry_does_not_create_a_hold_and_hold_expiry_reopens_fresh_slot() {
        let enquired =
            apply_special_slot_command(&slot(), 4, SpecialSlotCommand::RecordEnquiry, now())
                .unwrap();
        assert_eq!(enquired.state, SpecialOfferSlotState::EnquiryReceived);
        assert_eq!(enquired.hold_expires_at, None);
        let held = apply_special_slot_command(
            &enquired,
            5,
            SpecialSlotCommand::PlaceHold {
                expires_at: now() + Duration::hours(24),
            },
            now(),
        )
        .unwrap();
        let reopened = apply_special_slot_command(
            &held,
            6,
            SpecialSlotCommand::ExpireHold,
            now() + Duration::hours(25),
        )
        .unwrap();
        assert_eq!(reopened.state, SpecialOfferSlotState::Available);

        let booked =
            apply_special_slot_command(&slot(), 4, SpecialSlotCommand::MarkBooked, now()).unwrap();
        let cancelled = apply_special_slot_command(
            &booked,
            booked.revision,
            SpecialSlotCommand::ReopenCancelledBooking {
                expires_at: now() + Duration::days(14),
            },
            now(),
        )
        .unwrap();
        assert_eq!(cancelled.state, SpecialOfferSlotState::Available);
    }

    #[test]
    fn stale_writes_and_expired_confirmations_fail_closed() {
        assert_eq!(
            apply_special_slot_command(&slot(), 3, SpecialSlotCommand::Pause, now()),
            Err(SpecialOfferPolicyError::StaleRevision {
                expected: 3,
                actual: 4,
            })
        );
        let mut expired = slot();
        expired.confirmation_expires_at = now() - Duration::seconds(1);
        assert_eq!(
            project_couple_special_marker(&offer(), &expired, Some(80), true, now()),
            Err(SpecialOfferPolicyError::SlotNotDiscoverable)
        );
    }
}
