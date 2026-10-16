use super::contracts::*;
use std::collections::BTreeSet;

pub const MAX_QUOTATION_SOURCES: usize = 20;
pub const MAX_QUOTATION_LINE_ITEMS: usize = 500;
pub const MAX_COMMERCIAL_TERMS: usize = 100;
pub const MAX_UNMAPPED_ITEMS: usize = 100;
pub const MAX_ANCHORS_PER_FACT: usize = 8;
pub const MAX_EXCERPT_CHARS: usize = 2_000;
pub const MAX_LABEL_CHARS: usize = 500;
pub const MAX_SAFE_AMOUNT_MINOR: i64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ValidationIssue {
    pub path: String,
    pub code: &'static str,
    pub message: String,
}

fn issue(
    path: impl Into<String>,
    code: &'static str,
    message: impl Into<String>,
) -> ValidationIssue {
    ValidationIssue {
        path: path.into(),
        code,
        message: message.into(),
    }
}

fn validate_evidence(
    evidence: &Evidence,
    path: &str,
    source_versions: &BTreeSet<(&str, &str)>,
    issues: &mut Vec<ValidationIssue>,
) {
    if matches!(
        evidence.state,
        EvidenceState::Confirmed | EvidenceState::Inferred
    ) && evidence.anchors.is_empty()
    {
        issues.push(issue(
            path,
            "evidence_anchor_required",
            "confirmed and inferred facts require a source anchor",
        ));
    }
    if evidence.anchors.len() > MAX_ANCHORS_PER_FACT {
        issues.push(issue(
            path,
            "too_many_source_anchors",
            format!("at most {MAX_ANCHORS_PER_FACT} anchors are allowed per fact"),
        ));
    }

    for (index, anchor) in evidence.anchors.iter().enumerate() {
        let anchor_path = format!("{path}.anchors[{index}]");
        if anchor.source_id.trim().is_empty()
            || anchor.source_version_id.trim().is_empty()
            || anchor.locator.trim().is_empty()
            || anchor.exact_excerpt.trim().is_empty()
        {
            issues.push(issue(
                anchor_path.clone(),
                "invalid_source_anchor",
                "source id, version, locator, and exact excerpt are required",
            ));
        }
        if anchor.exact_excerpt.chars().count() > MAX_EXCERPT_CHARS {
            issues.push(issue(
                anchor_path.clone(),
                "source_excerpt_too_long",
                format!("source excerpts are limited to {MAX_EXCERPT_CHARS} characters"),
            ));
        }
        if !source_versions
            .contains(&(anchor.source_id.as_str(), anchor.source_version_id.as_str()))
        {
            issues.push(issue(
                anchor_path,
                "unregistered_source_version",
                "anchor must refer to a source version registered on the quotation",
            ));
        }
    }
}

pub fn validate_normalised_quotation(quotation: &NormalisedQuotation) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    if quotation.schema_version != QUOTATION_SCHEMA_VERSION {
        issues.push(issue(
            "schema_version",
            "unsupported_schema_version",
            format!("expected {QUOTATION_SCHEMA_VERSION}"),
        ));
    }
    if quotation.registry_version.trim().is_empty() {
        issues.push(issue(
            "registry_version",
            "registry_version_required",
            "a versioned category registry is required",
        ));
    }
    if quotation.identity.quotation_id.trim().is_empty()
        || quotation.identity.version_id.trim().is_empty()
        || quotation.identity.vendor_id.trim().is_empty()
        || quotation.identity.context_namespace.trim().is_empty()
    {
        issues.push(issue(
            "identity",
            "incomplete_identity",
            "quotation, version, vendor, and context identifiers are required",
        ));
    }
    if quotation.currency.len() != 3
        || !quotation
            .currency
            .chars()
            .all(|value| value.is_ascii_uppercase())
    {
        issues.push(issue(
            "currency",
            "invalid_currency",
            "currency must be a three-letter uppercase ISO-style code",
        ));
    }
    if quotation.sources.is_empty() {
        issues.push(issue(
            "sources",
            "source_required",
            "at least one immutable source version is required",
        ));
    }
    if quotation.sources.len() > MAX_QUOTATION_SOURCES {
        issues.push(issue(
            "sources",
            "too_many_sources",
            format!("at most {MAX_QUOTATION_SOURCES} sources are allowed"),
        ));
    }
    if quotation.line_items.len() > MAX_QUOTATION_LINE_ITEMS {
        issues.push(issue(
            "line_items",
            "too_many_line_items",
            format!("at most {MAX_QUOTATION_LINE_ITEMS} line items are allowed"),
        ));
    }
    if quotation.commercial_terms.len() > MAX_COMMERCIAL_TERMS {
        issues.push(issue(
            "commercial_terms",
            "too_many_commercial_terms",
            format!("at most {MAX_COMMERCIAL_TERMS} commercial terms are allowed"),
        ));
    }
    if quotation.unmapped_items.len() > MAX_UNMAPPED_ITEMS {
        issues.push(issue(
            "unmapped_items",
            "too_many_unmapped_items",
            format!("at most {MAX_UNMAPPED_ITEMS} unmapped items are allowed"),
        ));
    }

    let source_versions = quotation
        .sources
        .iter()
        .map(|source| (source.source_id.as_str(), source.source_version_id.as_str()))
        .collect::<BTreeSet<_>>();
    let mut line_ids = BTreeSet::new();
    for (index, line) in quotation.line_items.iter().enumerate() {
        let path = format!("line_items[{index}]");
        if line.line_id.trim().is_empty() || !line_ids.insert(line.line_id.as_str()) {
            issues.push(issue(
                format!("{path}.line_id"),
                "duplicate_or_empty_line_id",
                "line ids must be non-empty and unique",
            ));
        }
        if line.label.trim().is_empty() || line.category.trim().is_empty() {
            issues.push(issue(
                path.clone(),
                "incomplete_line_identity",
                "line label and category are required",
            ));
        }
        if line.label.chars().count() > MAX_LABEL_CHARS
            || line.category.chars().count() > MAX_LABEL_CHARS
        {
            issues.push(issue(
                path.clone(),
                "line_label_too_long",
                format!("line labels and categories are limited to {MAX_LABEL_CHARS} characters"),
            ));
        }
        if let Some(price) = &line.unit_price {
            if price.amount_minor < 0 || price.amount_minor > MAX_SAFE_AMOUNT_MINOR {
                issues.push(issue(
                    format!("{path}.unit_price.amount_minor"),
                    "invalid_price_amount",
                    "prices must be non-negative and safely representable across SDKs",
                ));
            }
            if price.currency != quotation.currency {
                issues.push(issue(
                    format!("{path}.unit_price.currency"),
                    "mixed_currency",
                    "line item currency must match the quotation currency",
                ));
            }
        }
        if let Some(quantity) = &line.quantity
            && (quantity.units < 0 || quantity.scale > 6)
        {
            issues.push(issue(
                format!("{path}.quantity"),
                "invalid_quantity",
                "quantity must be non-negative with at most six decimal places",
            ));
        }
        match line.price_basis {
            PriceBasis::Percentage if line.rate_bps.is_none() => issues.push(issue(
                format!("{path}.rate_bps"),
                "percentage_rate_required",
                "percentage lines require a basis-point rate",
            )),
            PriceBasis::Percentage if line.unit_price.is_some() => issues.push(issue(
                format!("{path}.unit_price"),
                "percentage_price_conflict",
                "percentage lines use rate_bps rather than unit_price",
            )),
            PriceBasis::Percentage => {}
            _ if line.unit_price.is_none() && line.evidence.state == EvidenceState::Confirmed => {
                issues.push(issue(
                    format!("{path}.unit_price"),
                    "confirmed_price_missing",
                    "a confirmed priced line must include its price",
                ));
            }
            _ => {}
        }
        if line.price_basis == PriceBasis::MinimumSpend && line.effect == LineEffect::Discount {
            issues.push(issue(
                format!("{path}.effect"),
                "invalid_minimum_spend_effect",
                "minimum spend lines cannot be discounts",
            ));
        }
        validate_evidence(
            &line.evidence,
            &format!("{path}.evidence"),
            &source_versions,
            &mut issues,
        );
    }
    for (index, term) in quotation.commercial_terms.iter().enumerate() {
        let path = format!("commercial_terms[{index}]");
        if term.term_id.trim().is_empty()
            || term.kind.trim().is_empty()
            || term.label.trim().is_empty()
        {
            issues.push(issue(
                path.clone(),
                "incomplete_commercial_term",
                "commercial term id, kind, and label are required",
            ));
        }
        if let Some(amount) = &term.amount {
            if amount.amount_minor < 0
                || amount.amount_minor > MAX_SAFE_AMOUNT_MINOR
                || amount.currency != quotation.currency
            {
                issues.push(issue(
                    format!("{path}.amount"),
                    "invalid_commercial_term_amount",
                    "commercial-term money must be non-negative and use the quote currency",
                ));
            }
        }
        validate_evidence(
            &term.evidence,
            &format!("{path}.evidence"),
            &source_versions,
            &mut issues,
        );
    }
    for (index, item) in quotation.unmapped_items.iter().enumerate() {
        let path = format!("unmapped_items[{index}]");
        if item.vendor_label.trim().is_empty()
            || item.vendor_label.chars().count() > MAX_LABEL_CHARS
        {
            issues.push(issue(
                path.clone(),
                "invalid_unmapped_label",
                "unmapped items require a bounded vendor label",
            ));
        }
        validate_evidence(
            &item.evidence,
            &format!("{path}.evidence"),
            &source_versions,
            &mut issues,
        );
    }

    for (index, line) in quotation.line_items.iter().enumerate() {
        for basis_id in &line.percentage_basis_line_ids {
            if !line_ids.contains(basis_id.as_str()) {
                issues.push(issue(
                    format!("line_items[{index}].percentage_basis_line_ids"),
                    "unknown_basis_line",
                    format!("percentage basis line {basis_id} does not exist"),
                ));
            }
        }
    }
    validate_evidence(
        &quotation.tax.evidence,
        "tax.evidence",
        &source_versions,
        &mut issues,
    );
    match quotation.tax.treatment {
        TaxTreatment::Inclusive | TaxTreatment::Exclusive if quotation.tax.rate_bps.is_none() => {
            issues.push(issue(
                "tax.rate_bps",
                "tax_rate_required",
                "inclusive and exclusive tax treatment require a rate",
            ));
        }
        _ => {}
    }
    issues
}
