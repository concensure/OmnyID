//! Review an existing normalized quote; never normalize again or infer booking authority.
use crate::{
    quotation::{
        contracts::{EvidenceState, NormalisedQuotation, quotation_material_fingerprint},
        validation::validate_normalised_quotation,
    },
    runbook_contract::Result,
    runbook_evidence::EvidencePacket,
    runbook_validation::identifier,
};
use chrono::{DateTime, NaiveDate};
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub(crate) fn review_quote(
    facts: &BTreeMap<String, Value>,
    packet: &EvidencePacket,
) -> Result<Value> {
    let reference = facts["normalised_quote_ref"]
        .as_str()
        .ok_or("invalid_quote_reference")?;
    if !identifier(reference)
        || !(reference.starts_with("message:") || reference.starts_with("private_message:"))
    {
        return Err("invalid_quote_reference");
    }
    let date = facts["wedding_date"]
        .as_str()
        .ok_or("invalid_wedding_date")?;
    let wedding_date =
        NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "invalid_wedding_date")?;
    if wedding_date.format("%Y-%m-%d").to_string() != date {
        return Err("invalid_wedding_date");
    }
    // Resolve the exact referenced snapshot, not a quote pasted into event facts
    // or a replacement fetched after Read. Duplicate references fail closed.
    let mut matches = packet
        .included
        .iter()
        .filter(|item| item.reference == reference);
    let item = matches.next().ok_or("quote_evidence_required")?;
    if matches.next().is_some() {
        return Err("ambiguous_quote_evidence");
    }
    let value = item
        .content
        .get("quotation")
        .ok_or("normalised_quote_required")?;
    if value.to_string().len() > 32768 {
        return Err("quote_input_too_large");
    }
    let quote: NormalisedQuotation =
        serde_json::from_value(value.clone()).map_err(|_| "invalid_normalised_quote")?;
    if !validate_normalised_quotation(&quote).is_empty()
        || quote.identity.context_namespace != "wedding_planner"
    {
        return Err("invalid_normalised_quote");
    }
    // Preserve the quote's timestamp and offset. Do not compare it to today's
    // clock: retries must produce the same findings from the same frozen data.
    if let Some(date) = &quote.valid_until {
        DateTime::parse_from_rfc3339(date).map_err(|_| "invalid_quote_validity")?;
    }
    let unconfirmed = quote
        .line_items
        .iter()
        .map(|l| &l.evidence)
        .chain(quote.commercial_terms.iter().map(|t| &t.evidence))
        .chain(std::iter::once(&quote.tax.evidence))
        .filter(|e| e.state != EvidenceState::Confirmed)
        .count();
    Ok(json!({
        "quotation_ref": reference,
        "quotation_id": quote.identity.quotation_id,
        "version_id": quote.identity.version_id,
        "material_fingerprint": quotation_material_fingerprint(&quote),
        "lifecycle": quote.lifecycle,
        "currency": quote.currency,
        "wedding_date": date,
        "valid_until": quote.valid_until,
        "line_count": quote.line_items.len(),
        "unconfirmed_fact_count": unconfirmed,
        "unmapped_item_count": quote.unmapped_items.len(),
        "availability_confirmed": false,
        "booking_authorized": false,
        "payment_authorized": false
    }))
}
