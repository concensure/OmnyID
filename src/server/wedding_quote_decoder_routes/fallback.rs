use super::*;

fn missing_field(reason: &str) -> ExtractedField {
    ExtractedField {
        state: "not_found".to_string(),
        value: None,
        source_snippet: None,
        confidence: "low".to_string(),
        reason: reason.to_string(),
    }
}

fn captured_field(
    text: &str,
    pattern: &str,
    value: impl Into<Value>,
    reason: &str,
) -> Option<ExtractedField> {
    let regex = Regex::new(pattern).ok()?;
    let matched = regex.find(text)?;
    Some(ExtractedField {
        state: "extracted".to_string(),
        value: Some(value.into()),
        source_snippet: Some(matched.as_str().to_string()),
        confidence: "medium".to_string(),
        reason: reason.to_string(),
    })
}

fn captured_money(text: &str, pattern: &str, reason: &str) -> Option<ExtractedField> {
    let regex = Regex::new(pattern).ok()?;
    let captures = regex.captures(text)?;
    let matched = captures.get(0)?;
    let amount = captures
        .get(1)?
        .as_str()
        .replace(',', "")
        .parse::<f64>()
        .ok()?;
    Some(ExtractedField {
        state: "extracted".to_string(),
        value: Some(json!(amount)),
        source_snippet: Some(matched.as_str().to_string()),
        confidence: "medium".to_string(),
        reason: reason.to_string(),
    })
}

pub(super) fn deterministic_quote_fallback(text: &str) -> ModelPayload {
    // Supplemental hourly/optional prices are not the base package rate.
    let per_head_pattern = r"(?i)(?:AUD\s*|A\$\s*|\$\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:per\s+(?:person|guest|head)|p\.?p\.?)";
    let supplemental = Regex::new(r"(?i)\b(?:additional|extra|overtime|hour|hourly|optional|children|child|vendor meals?|cake)\b").unwrap();
    let per_head = text
        .lines()
        .filter(|line| !supplemental.is_match(line))
        .find_map(|line| {
            captured_money(
                line,
                per_head_pattern,
                "An explicit base per-person rate is stated; supplemental rates are excluded.",
            )
        });
    let minimum_spend = captured_money(
        text,
        r"(?i)minimum\s+spend[^0-9$]{0,24}(?:AUD\s*|A\$\s*|\$\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
        "A minimum spend is stated explicitly in the uploaded wording.",
    );
    let whole_package = captured_money(
        text,
        r"(?im)(?:\b(?:grand\s+total|package\s+total|total\s+payable|total\s+package)\b|^[ \t]*total\b)[ \t:=-]{0,24}(?:AUD\s*|A\$\s*|\$\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
        "A whole-package total is stated explicitly in the uploaded wording.",
    );
    let fixed_fee = captured_money(
        text,
        r"(?i)(?:venue|room|ceremony|site|location)\s+(?:hire|fee|rental)[^0-9$]{0,28}(?:AUD\s*|A\$\s*|\$\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)",
        "A fixed venue or ceremony fee is stated explicitly in the uploaded wording.",
    );
    let guest_count = Regex::new(r"(?i)\b([1-9][0-9]{0,3})\s+guests?\b")
        .ok()
        .and_then(|regex| regex.captures(text))
        .and_then(|captures| {
            let matched = captures.get(0)?;
            let count = captures.get(1)?.as_str().parse::<u32>().ok()?;
            Some(ExtractedField {
                state: "extracted".to_string(),
                value: Some(json!(count)),
                source_snippet: Some(matched.as_str().to_string()),
                confidence: "medium".to_string(),
                reason: "A guest count is stated explicitly in the uploaded wording.".to_string(),
            })
        });
    let gst = captured_field(
        text,
        r"(?i)\b(?:GST\s+(?:is\s+)?(?:included|inclusive)|(?:include|includes|including|inclusive\s+of)\s+GST)\b",
        "included",
        "The quote says GST is included.",
    )
    .or_else(|| {
        captured_field(
            text,
            r"(?i)\b(?:GST\s+(?:is\s+)?(?:excluded|exclusive|not\s+included|additional)|(?:excluding|exclusive\s+of)\s+GST)\b",
            "excluded",
            "The quote says GST is excluded or additional.",
        )
    });
    let pricing_model = if let Some(total) = &whole_package {
        Some(ExtractedField { state: "extracted".into(), value: Some(json!("fixed")), source_snippet: total.source_snippet.clone(), confidence: "medium".into(), reason: "Use the stated proposal total for its quoted guest count; components must not be added again.".into() })
    } else if let Some(rate) = &per_head {
        Some(ExtractedField {
            state: "extracted".into(),
            value: Some(json!("per_head")),
            source_snippet: rate.source_snippet.clone(),
            confidence: "medium".into(),
            reason: "The wording gives an explicit base per-person rate.".into(),
        })
    } else if minimum_spend.is_some() {
        captured_field(
            text,
            r"(?i)minimum\s+spend",
            "minimum_spend",
            "The wording identifies a minimum-spend model.",
        )
    } else if whole_package.is_some() || fixed_fee.is_some() {
        let pattern = if whole_package.is_some() {
            r"(?i)(?:grand\s+total|package\s+total|total\s+payable|total\s+package)"
        } else {
            r"(?i)(?:venue|room|ceremony|site|location)\s+(?:hire|fee|rental)"
        };
        captured_field(
            text,
            pattern,
            "fixed",
            "The wording identifies a fixed-price component or package.",
        )
    } else {
        None
    };
    let payment_schedule = captured_field(
        text,
        r"(?i)\b(?:deposit|balance|instalment|installment|payment)\b[^.\n]{0,160}",
        "See exact source wording",
        "Payment timing or a deposit is stated; review the exact excerpt.",
    );
    let line_items = [
        ("Per-person package", "per_head", &per_head),
        ("Fixed venue or ceremony fee", "fixed", &fixed_fee),
        ("Minimum spend", "fixed", &minimum_spend),
        ("Whole-package total", "fixed", &whole_package),
    ]
    .into_iter()
    .filter_map(|(label, unit, field)| {
        let amount = field.as_ref()?.value.as_ref()?.as_f64()?;
        Some(LineItem {
            label: label.to_string(),
            unit: unit.to_string(),
            amount: Some(amount),
            source_snippet: field.as_ref()?.source_snippet.clone()?,
            confidence: "medium".to_string(),
        })
    })
    .collect();
    ModelPayload {
        schema_version: "quote-extraction.v2".to_string(),
        fields: ModelFields {
            pricing_model: pricing_model.unwrap_or_else(|| {
                missing_field("No pricing model was identified deterministically.")
            }),
            per_head_rate: per_head
                .unwrap_or_else(|| missing_field("No explicit per-person rate was found.")),
            guest_count: guest_count
                .unwrap_or_else(|| missing_field("No explicit guest count was found.")),
            whole_package_amount: whole_package
                .unwrap_or_else(|| missing_field("No explicit whole-package total was found.")),
            fixed_fee: fixed_fee.unwrap_or_else(|| {
                missing_field("No explicit fixed venue or ceremony fee was found.")
            }),
            minimum_spend: minimum_spend
                .unwrap_or_else(|| missing_field("No explicit minimum spend was found.")),
            gst: gst.unwrap_or_else(|| missing_field("GST treatment was not stated clearly.")),
            service_charge_pct: missing_field(
                "No explicit service-charge percentage was identified.",
            ),
            venue_hours: missing_field("No explicit venue duration was identified."),
            overtime_rate: missing_field("No explicit overtime rate was identified."),
            payment_schedule: payment_schedule
                .unwrap_or_else(|| missing_field("No explicit payment schedule was identified.")),
        },
        line_items,
        inclusions: Vec::new(),
        exclusions: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn existing_samples_preserve_totals_tax_and_supplement_boundaries() {
        for (text, total) in [
            (
                include_str!(
                    "../../../Documents/testing/venue-quote-samples/01-riverside-premium-the-boathouse-at-wharf-bend.txt"
                ),
                51110.0,
            ),
            (
                include_str!(
                    "../../../Documents/testing/venue-quote-samples/02-mid-range-bluegum-ridge-estate-blue-mountains.txt"
                ),
                31096.4,
            ),
        ] {
            let result = extraction_json(text, deterministic_quote_fallback(text), "test");
            assert_eq!(result["fields"]["whole_package_amount"]["value"], total);
            assert_eq!(result["fields"]["pricing_model"]["value"], "fixed");
            assert_eq!(result["fields"]["gst"]["value"], "included");
            assert_eq!(result["fields"]["guest_count"]["value"], 120);
            assert!(result["fields"]["per_head_rate"]["value"].is_null());
        }
    }
    #[test]
    fn component_totals_and_optional_rates_are_not_package_prices() {
        for text in [
            "Food TOTAL $5000. Additional beverages $14 per guest per hour.",
            "Subtotal $8000. Optional cake service $5 pp.",
            "Vendor meals $30 per person.",
        ] {
            let result = deterministic_quote_fallback(text);
            assert!(result.fields.whole_package_amount.value.is_none());
            assert!(result.fields.per_head_rate.value.is_none());
        }
        let result = deterministic_quote_fallback(
            "Extra beverages $14 per guest per hour.\nReception package $220 per guest for 120 guests.",
        );
        assert_eq!(result.fields.per_head_rate.value, Some(json!(220.0)));
        assert!(
            result
                .fields
                .pricing_model
                .source_snippet
                .unwrap()
                .contains("220")
        );
    }
}
