use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::{
    category_registry::ResolvedCategoryRegistry,
    contracts::{EvidenceState, currency_exponent},
    extraction_prompt::EXTRACTION_SCHEMA_VERSION,
};

pub const MAX_EXTRACTION_OUTPUT_BYTES: usize = 512 * 1024;
pub const MAX_PROPOSED_FIELDS: usize = 500;
pub const MAX_UNMAPPED_PROPOSALS: usize = 100;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ExtractionProposal {
    pub schema_version: String,
    pub registry_version: String,
    pub currency: Option<String>,
    pub issued_at: Option<String>,
    pub valid_until: Option<String>,
    pub fields: Vec<ProposedField>,
    #[serde(default)]
    pub unmapped: Vec<ProposedUnmapped>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProposedField {
    pub key: String,
    pub vendor_label: String,
    pub state: EvidenceState,
    pub value: Value,
    pub unit: Option<String>,
    pub price_basis: Option<String>,
    pub currency: Option<String>,
    pub exact_excerpt: Option<String>,
    pub locator: Option<String>,
    pub confidence_bps: u16,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProposedUnmapped {
    pub vendor_label: String,
    pub exact_excerpt: String,
    pub locator: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExtractionSource<'a> {
    pub source_id: &'a str,
    pub source_version_id: &'a str,
    pub parsed_text: &'a str,
    pub page_count: Option<u32>,
    pub section_names: &'a [String],
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ValidatedField {
    pub key: String,
    pub vendor_label: String,
    pub state: EvidenceState,
    pub value: Value,
    pub unit: Option<String>,
    pub price_basis: Option<String>,
    pub currency: Option<String>,
    pub exact_excerpt: Option<String>,
    pub locator: Option<String>,
    pub confidence_bps: u16,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct ExtractionIssue {
    pub path: String,
    pub code: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ValidatedExtraction {
    pub schema_version: String,
    pub registry_version: String,
    pub currency: Option<String>,
    pub issued_at: Option<String>,
    pub valid_until: Option<String>,
    pub fields: Vec<ValidatedField>,
    pub unmapped: Vec<ProposedUnmapped>,
    pub issues: Vec<ExtractionIssue>,
    pub confirmed_fields: usize,
    pub inferred_fields: usize,
    pub unknown_or_conflicting_fields: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct ExtractionAttemptReceipt {
    pub receipt_id: String,
    pub source_id: String,
    pub source_version_id: String,
    pub provider: String,
    pub model: String,
    pub parser_version: String,
    pub schema_version: String,
    pub registry_version: String,
    pub registry_fingerprint: String,
    pub latency_ms: u64,
    pub attempt_kinds: Vec<String>,
    pub confirmed_fields: usize,
    pub inferred_fields: usize,
    pub unknown_or_conflicting_fields: usize,
}

fn issue(path: impl Into<String>, code: &str) -> ExtractionIssue {
    ExtractionIssue {
        path: path.into(),
        code: code.to_string(),
    }
}

fn strip_complete_json_fence(raw: &str) -> &str {
    let trimmed = raw.trim();
    if !trimmed.starts_with("```") || !trimmed.ends_with("```") {
        return trimmed;
    }
    let Some(first_newline) = trimmed.find('\n') else {
        return trimmed;
    };
    trimmed[first_newline + 1..trimmed.len() - 3].trim()
}

pub fn parse_extraction_proposal(raw: &str) -> Result<ExtractionProposal, String> {
    if raw.len() > MAX_EXTRACTION_OUTPUT_BYTES {
        return Err("extraction output exceeds byte limit".to_string());
    }
    let candidate = strip_complete_json_fence(raw);
    if !candidate.starts_with('{') || !candidate.ends_with('}') {
        return Err("extraction output must contain JSON only".to_string());
    }
    serde_json::from_str(candidate).map_err(|error| format!("invalid extraction JSON: {error}"))
}

fn locator_supported(locator: Option<&str>, source: &ExtractionSource<'_>) -> bool {
    let Some(locator) = locator.map(str::trim).filter(|value| !value.is_empty()) else {
        return true;
    };
    if let Some(page) = locator.strip_prefix("page:") {
        return page
            .parse::<u32>()
            .ok()
            .is_some_and(|page| page > 0 && source.page_count.is_some_and(|count| page <= count));
    }
    if let Some(section) = locator.strip_prefix("section:") {
        return source.section_names.iter().any(|known| known == section);
    }
    false
}

fn value_matches_type(value_type: &str, value: &Value) -> bool {
    match value_type {
        "money" | "integer" | "duration" => value.as_i64().is_some(),
        "decimal" => value.as_f64().is_some_and(f64::is_finite),
        "boolean" => value.is_boolean(),
        "enum" | "text" => value.as_str().is_some_and(|text| !text.trim().is_empty()),
        "date" => value
            .as_str()
            .is_some_and(|text| chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d").is_ok()),
        _ => false,
    }
}

fn currency_valid(currency: Option<&str>) -> bool {
    currency.is_none_or(|value| currency_exponent(value).is_some())
}

fn optional_date_valid(value: Option<&str>) -> bool {
    value.is_none_or(|date| chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_ok())
}

fn downgrade(
    field: &mut ValidatedField,
    issues: &mut Vec<ExtractionIssue>,
    path: &str,
    code: &str,
) {
    field.state = EvidenceState::Unknown;
    field.value = Value::Null;
    field.confidence_bps = 0;
    issues.push(issue(path, code));
}

pub fn validate_extraction_proposal(
    proposal: ExtractionProposal,
    registry: &ResolvedCategoryRegistry,
    source: &ExtractionSource<'_>,
) -> Result<ValidatedExtraction, String> {
    if proposal.schema_version != EXTRACTION_SCHEMA_VERSION {
        return Err("unsupported extraction schema version".to_string());
    }
    if proposal.registry_version != registry.version {
        return Err("extraction registry version mismatch".to_string());
    }
    if proposal.fields.len() > MAX_PROPOSED_FIELDS
        || proposal.unmapped.len() > MAX_UNMAPPED_PROPOSALS
    {
        return Err("extraction proposal exceeds item limits".to_string());
    }
    if !currency_valid(proposal.currency.as_deref()) {
        return Err("invalid quotation currency".to_string());
    }
    if !optional_date_valid(proposal.issued_at.as_deref())
        || !optional_date_valid(proposal.valid_until.as_deref())
    {
        return Err("invalid quotation date".to_string());
    }
    let mut issues = Vec::new();
    let mut fields = Vec::with_capacity(proposal.fields.len());
    for (index, candidate) in proposal.fields.into_iter().enumerate() {
        let path = format!("fields[{index}]");
        let Some(key) = registry.canonical_key(&candidate.key).map(str::to_string) else {
            issues.push(issue(&path, "unknown_registry_key"));
            continue;
        };
        let spec = &registry.fields[&key];
        let mut field = ValidatedField {
            key,
            vendor_label: candidate.vendor_label.trim().chars().take(500).collect(),
            state: candidate.state,
            value: candidate.value,
            unit: candidate.unit,
            price_basis: candidate.price_basis,
            currency: candidate.currency.or_else(|| proposal.currency.clone()),
            exact_excerpt: candidate.exact_excerpt,
            locator: candidate.locator,
            confidence_bps: candidate.confidence_bps.min(10_000),
        };
        if matches!(
            field.state,
            EvidenceState::Confirmed | EvidenceState::Inferred
        ) {
            let anchored = field.exact_excerpt.as_deref().is_some_and(|excerpt| {
                !excerpt.trim().is_empty()
                    && excerpt.chars().count() <= 2_000
                    && source.parsed_text.contains(excerpt)
            });
            if !anchored {
                downgrade(&mut field, &mut issues, &path, "unsupported_source_excerpt");
            }
        }
        if !locator_supported(field.locator.as_deref(), source) {
            field.locator = None;
            issues.push(issue(&path, "unsupported_locator"));
        }
        if !value_matches_type(&spec.value_type, &field.value)
            && field.state != EvidenceState::Unknown
        {
            downgrade(&mut field, &mut issues, &path, "invalid_value_type");
        }
        if matches!(spec.value_type.as_str(), "money" | "integer" | "duration")
            && field
                .value
                .as_i64()
                .is_some_and(|value| !(0..=9_007_199_254_740_991).contains(&value))
        {
            downgrade(&mut field, &mut issues, &path, "out_of_range_number");
        }
        if spec.value_type == "money" && !currency_valid(field.currency.as_deref()) {
            downgrade(&mut field, &mut issues, &path, "invalid_currency");
        }
        if let Some(basis) = field.price_basis.as_deref()
            && !spec.allowed_bases.iter().any(|allowed| allowed == basis)
        {
            downgrade(&mut field, &mut issues, &path, "unsupported_price_basis");
        }
        if let Some(unit) = field.unit.as_deref()
            && !spec.allowed_units.is_empty()
            && !spec.allowed_units.iter().any(|allowed| allowed == unit)
        {
            downgrade(&mut field, &mut issues, &path, "unsupported_unit");
        }
        fields.push(field);
    }

    let unmapped = proposal
        .unmapped
        .into_iter()
        .filter(|item| {
            !item.vendor_label.trim().is_empty()
                && item.vendor_label.chars().count() <= 500
                && !item.exact_excerpt.trim().is_empty()
                && item.exact_excerpt.chars().count() <= 2_000
                && source.parsed_text.contains(&item.exact_excerpt)
                && locator_supported(item.locator.as_deref(), source)
        })
        .collect::<Vec<_>>();
    let confirmed_fields = fields
        .iter()
        .filter(|field| field.state == EvidenceState::Confirmed)
        .count();
    let inferred_fields = fields
        .iter()
        .filter(|field| field.state == EvidenceState::Inferred)
        .count();
    let unknown_or_conflicting_fields = fields.len() - confirmed_fields - inferred_fields;
    Ok(ValidatedExtraction {
        schema_version: proposal.schema_version,
        registry_version: proposal.registry_version,
        currency: proposal.currency,
        issued_at: proposal.issued_at,
        valid_until: proposal.valid_until,
        fields,
        unmapped,
        issues,
        confirmed_fields,
        inferred_fields,
        unknown_or_conflicting_fields,
    })
}

pub fn extraction_receipt(
    source: &ExtractionSource<'_>,
    registry: &ResolvedCategoryRegistry,
    validated: &ValidatedExtraction,
    provider: &str,
    model: &str,
    parser_version: &str,
    latency_ms: u64,
    attempt_kinds: Vec<String>,
) -> ExtractionAttemptReceipt {
    let stable = serde_json::json!({
        "source_id": source.source_id,
        "source_version_id": source.source_version_id,
        "provider": provider,
        "model": model,
        "parser_version": parser_version,
        "schema_version": validated.schema_version,
        "registry_version": registry.version,
        "registry_fingerprint": registry.fingerprint,
        "validated": validated,
        "attempt_kinds": attempt_kinds,
    });
    let receipt_id = format!(
        "qext_{}",
        hex::encode(Sha256::digest(
            serde_json::to_vec(&stable).unwrap_or_default()
        ))
    );
    ExtractionAttemptReceipt {
        receipt_id,
        source_id: source.source_id.to_string(),
        source_version_id: source.source_version_id.to_string(),
        provider: provider.to_string(),
        model: model.to_string(),
        parser_version: parser_version.to_string(),
        schema_version: validated.schema_version.clone(),
        registry_version: registry.version.clone(),
        registry_fingerprint: registry.fingerprint.clone(),
        latency_ms,
        attempt_kinds,
        confirmed_fields: validated.confirmed_fields,
        inferred_fields: validated.inferred_fields,
        unknown_or_conflicting_fields: validated.unknown_or_conflicting_fields,
    }
}

pub fn validate_structured_submission(
    proposal: ExtractionProposal,
    registry: &ResolvedCategoryRegistry,
    source: &ExtractionSource<'_>,
) -> Result<ValidatedExtraction, String> {
    validate_extraction_proposal(proposal, registry, source)
}
