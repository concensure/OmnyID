use super::contracts::*;
use std::collections::{BTreeMap, BTreeSet};

fn gap(code: &str, line_id: Option<&str>, message: impl Into<String>) -> CalculationGap {
    CalculationGap {
        code: code.to_string(),
        line_id: line_id.map(str::to_string),
        message: message.into(),
    }
}

fn pow10(scale: u8) -> Option<i128> {
    10_i128.checked_pow(u32::from(scale))
}

fn rounded_div(numerator: i128, denominator: i128) -> Option<i128> {
    if denominator <= 0 || numerator < 0 {
        return None;
    }
    numerator
        .checked_add(denominator / 2)
        .map(|adjusted| adjusted / denominator)
}

fn checked_i64(value: i128) -> Option<i64> {
    i64::try_from(value).ok()
}

fn multiply_quantity(amount_minor: i64, quantity: &ScaledQuantity) -> Option<i64> {
    let numerator = i128::from(amount_minor).checked_mul(i128::from(quantity.units))?;
    checked_i64(rounded_div(numerator, pow10(quantity.scale)?)?)
}

fn percentage(amount_minor: i64, rate_bps: u32) -> Option<i64> {
    let numerator = i128::from(amount_minor).checked_mul(i128::from(rate_bps))?;
    checked_i64(rounded_div(numerator, 10_000)?)
}

fn apply_effect(amount_minor: i64, effect: LineEffect) -> Option<i64> {
    match effect {
        LineEffect::Charge => Some(amount_minor),
        LineEffect::Discount => amount_minor.checked_neg(),
    }
}

fn selected(line: &LineItem, selected_ids: &BTreeSet<&str>) -> bool {
    match line.inclusion {
        InclusionState::Included | InclusionState::Required => true,
        InclusionState::Optional | InclusionState::Conditional => {
            selected_ids.contains(line.line_id.as_str())
        }
        InclusionState::Excluded | InclusionState::Unknown => false,
    }
}

fn mark_uncertain(evidence: &Evidence, status: &mut TotalStatus) {
    match evidence.state {
        EvidenceState::Confirmed => {}
        EvidenceState::Inferred => {
            if *status == TotalStatus::Complete {
                *status = TotalStatus::Ambiguous;
            }
        }
        EvidenceState::Unknown | EvidenceState::Conflicting => {
            *status = TotalStatus::Incomplete;
        }
    }
}

pub fn calculate_comparable_total(
    quotation: &NormalisedQuotation,
    scenario: &ComparableScenario,
) -> ComparableTotal {
    let selected_ids = scenario
        .selected_optional_line_ids
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let known_line_ids = quotation
        .line_items
        .iter()
        .map(|line| line.line_id.as_str())
        .collect::<BTreeSet<_>>();
    let mut status = TotalStatus::Complete;
    let mut gaps = Vec::new();
    let mut trace = Vec::new();
    let mut calculated = BTreeMap::<String, i64>::new();
    let mut confirmed_priced = 0_u32;
    let mut priced = 0_u32;
    for selected_id in selected_ids.difference(&known_line_ids) {
        status = TotalStatus::Incomplete;
        gaps.push(gap(
            "unknown_selected_option",
            Some(selected_id),
            "the scenario selects an option that is not present in this quotation version",
        ));
    }

    for line in &quotation.line_items {
        if line.inclusion == InclusionState::Unknown {
            status = TotalStatus::Incomplete;
            gaps.push(gap(
                "unknown_inclusion",
                Some(&line.line_id),
                "the source does not establish whether this item is included",
            ));
            continue;
        }
        if !selected(line, &selected_ids)
            || matches!(
                line.price_basis,
                PriceBasis::Percentage | PriceBasis::MinimumSpend
            )
        {
            continue;
        }
        priced += 1;
        if line.evidence.state == EvidenceState::Confirmed {
            confirmed_priced += 1;
        }
        mark_uncertain(&line.evidence, &mut status);
        let Some(unit_price) = &line.unit_price else {
            status = TotalStatus::Incomplete;
            gaps.push(gap(
                "price_missing",
                Some(&line.line_id),
                "selected line has no supported price",
            ));
            continue;
        };
        if unit_price.currency != quotation.currency {
            status = TotalStatus::Incomplete;
            gaps.push(gap(
                "mixed_currency",
                Some(&line.line_id),
                "line currency does not match the quotation currency",
            ));
            continue;
        }
        let result = match line.price_basis {
            PriceBasis::Fixed => Some((unit_price.amount_minor, "fixed".to_string())),
            PriceBasis::PerPerson => scenario.guest_count.and_then(|count| {
                let quantity = ScaledQuantity::whole(i64::from(count));
                multiply_quantity(unit_price.amount_minor, &quantity).map(|amount| {
                    (
                        amount,
                        format!("{} x {count} guests", unit_price.amount_minor),
                    )
                })
            }),
            PriceBasis::PerItem | PriceBasis::PerHour => {
                let quantity = scenario
                    .quantity_overrides
                    .get(&line.line_id)
                    .or(line.quantity.as_ref());
                quantity.and_then(|quantity| {
                    multiply_quantity(unit_price.amount_minor, quantity).map(|amount| {
                        (
                            amount,
                            format!(
                                "{} x {}/10^{}",
                                unit_price.amount_minor, quantity.units, quantity.scale
                            ),
                        )
                    })
                })
            }
            PriceBasis::Percentage | PriceBasis::MinimumSpend => unreachable!(),
        };
        match result {
            Some((unsigned_amount, expression)) => {
                let Some(amount) = apply_effect(unsigned_amount, line.effect) else {
                    status = TotalStatus::Incomplete;
                    gaps.push(gap(
                        "arithmetic_overflow",
                        Some(&line.line_id),
                        "discount sign conversion overflowed",
                    ));
                    continue;
                };
                calculated.insert(line.line_id.clone(), amount);
                trace.push(FormulaTrace {
                    line_id: line.line_id.clone(),
                    formula_id: match line.price_basis {
                        PriceBasis::Fixed => "fixed",
                        PriceBasis::PerPerson => "per_person",
                        PriceBasis::PerItem => "per_item",
                        PriceBasis::PerHour => "per_hour",
                        _ => unreachable!(),
                    }
                    .to_string(),
                    formula_version: "v1".to_string(),
                    input_line_ids: Vec::new(),
                    rounding: "nearest_minor_unit_half_up".to_string(),
                    expression,
                    amount_minor: amount,
                });
            }
            None => {
                status = TotalStatus::Incomplete;
                gaps.push(gap(
                    "quantity_or_arithmetic_missing",
                    Some(&line.line_id),
                    "a required quantity is absent or arithmetic overflowed",
                ));
            }
        }
    }

    for line in &quotation.line_items {
        if line.price_basis != PriceBasis::Percentage || !selected(line, &selected_ids) {
            continue;
        }
        priced += 1;
        if line.evidence.state == EvidenceState::Confirmed {
            confirmed_priced += 1;
        }
        mark_uncertain(&line.evidence, &mut status);
        let Some(rate) = line.rate_bps else {
            status = TotalStatus::Incomplete;
            gaps.push(gap(
                "percentage_rate_missing",
                Some(&line.line_id),
                "percentage rate is unknown",
            ));
            continue;
        };
        let basis_ids = if line.percentage_basis_line_ids.is_empty() {
            calculated.keys().cloned().collect::<Vec<_>>()
        } else {
            line.percentage_basis_line_ids.clone()
        };
        let basis = basis_ids
            .iter()
            .try_fold(0_i64, |sum, id| sum.checked_add(*calculated.get(id)?));
        let Some(basis) = basis else {
            status = TotalStatus::Incomplete;
            gaps.push(gap(
                "percentage_basis_incomplete",
                Some(&line.line_id),
                "one or more percentage basis lines could not be calculated",
            ));
            continue;
        };
        match percentage(basis, rate).and_then(|amount| apply_effect(amount, line.effect)) {
            Some(amount) => {
                calculated.insert(line.line_id.clone(), amount);
                trace.push(FormulaTrace {
                    line_id: line.line_id.clone(),
                    formula_id: "percentage".to_string(),
                    formula_version: "v1".to_string(),
                    input_line_ids: basis_ids,
                    rounding: "nearest_minor_unit_half_up".to_string(),
                    expression: format!("{basis} x {rate}/10000"),
                    amount_minor: amount,
                });
            }
            None => {
                status = TotalStatus::Incomplete;
                gaps.push(gap(
                    "arithmetic_overflow",
                    Some(&line.line_id),
                    "percentage calculation overflowed",
                ));
            }
        }
    }

    for line in &quotation.line_items {
        if line.price_basis != PriceBasis::MinimumSpend || !selected(line, &selected_ids) {
            continue;
        }
        priced += 1;
        if line.evidence.state == EvidenceState::Confirmed {
            confirmed_priced += 1;
        }
        mark_uncertain(&line.evidence, &mut status);
        let Some(minimum) = line.unit_price.as_ref().map(|value| value.amount_minor) else {
            status = TotalStatus::Incomplete;
            gaps.push(gap(
                "minimum_spend_missing",
                Some(&line.line_id),
                "minimum spend amount is unknown",
            ));
            continue;
        };
        let current = calculated
            .values()
            .try_fold(0_i64, |sum, value| sum.checked_add(*value));
        let Some(current) = current else {
            status = TotalStatus::Incomplete;
            gaps.push(gap(
                "arithmetic_overflow",
                Some(&line.line_id),
                "subtotal overflowed",
            ));
            continue;
        };
        let top_up = minimum.saturating_sub(current);
        calculated.insert(line.line_id.clone(), top_up);
        trace.push(FormulaTrace {
            line_id: line.line_id.clone(),
            formula_id: "minimum_spend".to_string(),
            formula_version: "v1".to_string(),
            input_line_ids: calculated
                .keys()
                .filter(|line_id| line_id.as_str() != line.line_id)
                .cloned()
                .collect(),
            rounding: "exact_minor_units".to_string(),
            expression: format!("max(0, {minimum} - {current})"),
            amount_minor: top_up,
        });
    }

    if priced == 0 {
        status = TotalStatus::Incomplete;
        gaps.push(gap(
            "no_comparable_prices",
            None,
            "the quotation has no selected supported price components",
        ));
    }

    let subtotal = calculated
        .values()
        .try_fold(0_i64, |sum, value| sum.checked_add(*value));
    if subtotal.is_none() {
        status = TotalStatus::Incomplete;
        gaps.push(gap("arithmetic_overflow", None, "subtotal overflowed"));
    }
    if subtotal.is_some_and(|value| value < 0) {
        status = TotalStatus::Incomplete;
        gaps.push(gap(
            "negative_subtotal",
            None,
            "discounts exceed supported charge components",
        ));
    }
    let mut tax_minor = None;
    let mut total_minor = None;
    if status != TotalStatus::Incomplete {
        if let Some(subtotal_value) = subtotal {
            mark_uncertain(&quotation.tax.evidence, &mut status);
            match quotation.tax.treatment {
                TaxTreatment::Exempt => {
                    tax_minor = Some(0);
                    total_minor = Some(subtotal_value);
                }
                TaxTreatment::Inclusive => {
                    if let Some(rate) = quotation.tax.rate_bps {
                        tax_minor = i128::from(subtotal_value)
                            .checked_mul(i128::from(rate))
                            .and_then(|value| rounded_div(value, 10_000 + i128::from(rate)))
                            .and_then(checked_i64);
                        total_minor = Some(subtotal_value);
                    }
                }
                TaxTreatment::Exclusive => {
                    tax_minor = quotation
                        .tax
                        .rate_bps
                        .and_then(|rate| percentage(subtotal_value, rate));
                    total_minor = tax_minor.and_then(|tax| subtotal_value.checked_add(tax));
                }
                TaxTreatment::Unknown => {
                    status = TotalStatus::Ambiguous;
                    gaps.push(gap(
                        "tax_treatment_unknown",
                        None,
                        "tax inclusion cannot be established",
                    ));
                }
            }
            if let Some(tax) = tax_minor {
                trace.push(FormulaTrace {
                    line_id: "__tax__".to_string(),
                    formula_id: "tax".to_string(),
                    formula_version: "v1".to_string(),
                    input_line_ids: calculated.keys().cloned().collect(),
                    rounding: "nearest_minor_unit_half_up".to_string(),
                    expression: match quotation.tax.treatment {
                        TaxTreatment::Inclusive => format!(
                            "included_tax({subtotal_value}, {} bps)",
                            quotation.tax.rate_bps.unwrap_or_default()
                        ),
                        TaxTreatment::Exclusive => format!(
                            "{subtotal_value} x {}/10000",
                            quotation.tax.rate_bps.unwrap_or_default()
                        ),
                        TaxTreatment::Exempt => "tax_exempt".to_string(),
                        TaxTreatment::Unknown => unreachable!(),
                    },
                    amount_minor: tax,
                });
            }
            if !matches!(quotation.tax.treatment, TaxTreatment::Unknown)
                && (tax_minor.is_none() || total_minor.is_none())
            {
                status = TotalStatus::Incomplete;
                gaps.push(gap(
                    "tax_arithmetic_incomplete",
                    None,
                    "tax could not be calculated",
                ));
            }
        }
    }
    if status == TotalStatus::Incomplete {
        total_minor = None;
    }
    let evidence_coverage_bps = if priced == 0 {
        0
    } else {
        ((confirmed_priced * 10_000) / priced) as u16
    };
    ComparableTotal {
        quotation_id: quotation.identity.quotation_id.clone(),
        version_id: quotation.identity.version_id.clone(),
        scenario_id: scenario.scenario_id.clone(),
        currency: quotation.currency.clone(),
        status,
        subtotal_minor: subtotal,
        tax_minor,
        total_minor,
        evidence_coverage_bps,
        gaps,
        formula_trace: trace,
    }
}
