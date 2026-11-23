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

/// Category presence and evidence review only: a recorded category is not a
/// complete commercial offer, availability confirmation, or approval to send.
pub(crate) fn review_gaps(
    facts: &BTreeMap<String, Value>,
    packet: &EvidencePacket,
) -> Result<Value> {
    use crate::quotation::{InclusionState, TaxTreatment, resolve_category_registry};
    use std::collections::BTreeSet;
    let quote = load_quote(facts, packet)?;
    let registry = resolve_category_registry(&quote.registry_version)
        .map_err(|_| "unsupported_quote_registry")?;
    let required: Vec<String> = serde_json::from_value(facts["required_categories"].clone())
        .map_err(|_| "invalid_required_categories")?;
    if required.is_empty() || required.len() > 32 {
        return Err("required_category_limit");
    }
    let mut categories = BTreeSet::new();
    for name in required {
        if name.len() > 180 || name.chars().any(char::is_control) {
            return Err("invalid_required_categories");
        }
        let category = registry
            .canonical_key(&name)
            .ok_or("unknown_required_category")?;
        if !categories.insert(category.to_owned()) {
            return Err("duplicate_required_category");
        }
    }
    let mut findings = Vec::new();
    let mut questions = Vec::new();
    for category in categories {
        let mut paths = Vec::new();
        let mut uncertain = false;
        if category == "tax" {
            paths.push("tax".to_owned());
            uncertain = quote.tax.evidence.state != EvidenceState::Confirmed
                || quote.tax.treatment == TaxTreatment::Unknown
                || (quote.tax.treatment == TaxTreatment::Exclusive && quote.tax.rate_bps.is_none());
        } else if category == "valid_until" {
            if quote.valid_until.is_some() {
                paths.push("valid_until".to_owned());
            }
        } else {
            for (index, line) in quote.line_items.iter().enumerate() {
                if registry.canonical_key(&line.category) == Some(category.as_str()) {
                    paths.push(format!("line_items[{index}]"));
                    uncertain |= line.evidence.state != EvidenceState::Confirmed
                        || !matches!(
                            line.inclusion,
                            InclusionState::Included | InclusionState::Required
                        );
                }
            }
            for (index, term) in quote.commercial_terms.iter().enumerate() {
                if registry.canonical_key(&term.kind) == Some(category.as_str()) {
                    paths.push(format!("commercial_terms[{index}]"));
                    uncertain |= term.evidence.state != EvidenceState::Confirmed;
                }
            }
        }
        let status = if paths.is_empty() {
            "not_recorded"
        } else if uncertain {
            "review_required"
        } else {
            "recorded"
        };
        if status != "recorded" && questions.len() < 3 {
            // Only reviewed registry text enters candidates, never vendor prose.
            questions.push(json!({"category":category,"question":registry.fields[&category].clarification_template}));
        }
        findings.push(json!({"category":category,"status":status,"source_paths":paths}));
    }
    let output = json!({
        "quotation_ref":facts["normalised_quote_ref"],
        "version_id":quote.identity.version_id,
        "material_fingerprint":quotation_material_fingerprint(&quote),
        "registry_version":registry.version,
        "registry_fingerprint":registry.fingerprint,
        "category_findings":findings,
        "clarification_candidates":questions,
        "commercial_completeness_verified":false,
        "send_authorized":false,
        "booking_authorized":false
    });
    if output.to_string().len() > 32768 {
        return Err("quote_review_too_large");
    }
    Ok(output)
}

fn load_quote(
    facts: &BTreeMap<String, Value>,
    packet: &EvidencePacket,
) -> Result<NormalisedQuotation> {
    let reference = facts["normalised_quote_ref"]
        .as_str()
        .ok_or("invalid_quote_reference")?;
    if !identifier(reference)
        || !(reference.starts_with("message:") || reference.starts_with("private_message:"))
    {
        return Err("invalid_quote_reference");
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
    Ok(quote)
}

pub(crate) fn review_quote(
    facts: &BTreeMap<String, Value>,
    packet: &EvidencePacket,
) -> Result<Value> {
    let quote = load_quote(facts, packet)?;
    let reference = &facts["normalised_quote_ref"];
    let date = facts["wedding_date"]
        .as_str()
        .ok_or("invalid_wedding_date")?;
    let wedding_date =
        NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "invalid_wedding_date")?;
    if wedding_date.format("%Y-%m-%d").to_string() != date {
        return Err("invalid_wedding_date");
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
