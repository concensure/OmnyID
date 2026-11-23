use super::{
    category_registry::ResolvedCategoryRegistry,
    contracts::{
        CalculationGap, ComparableTotal, EvidenceState, LineItem, NormalisedQuotation,
        quotation_material_fingerprint,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanonicalisationIssue {
    pub code: String,
    pub line_ids: Vec<String>,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanonicalisationResult {
    pub quotation: NormalisedQuotation,
    pub issues: Vec<CanonicalisationIssue>,
}

fn normalized_label(value: &str) -> String {
    value
        .split_whitespace()
        .map(str::to_ascii_lowercase)
        .collect::<Vec<_>>()
        .join(" ")
}

fn same_commercial_value(left: &LineItem, right: &LineItem) -> bool {
    left.inclusion == right.inclusion
        && left.price_basis == right.price_basis
        && left.effect == right.effect
        && left.unit_price == right.unit_price
        && left.quantity == right.quantity
        && left.rate_bps == right.rate_bps
        && left.percentage_basis_line_ids == right.percentage_basis_line_ids
}

fn merge_anchors(target: &mut LineItem, source: &LineItem) {
    let mut seen = target
        .evidence
        .anchors
        .iter()
        .map(|anchor| {
            (
                anchor.source_version_id.clone(),
                anchor.locator.clone(),
                anchor.exact_excerpt.clone(),
            )
        })
        .collect::<BTreeSet<_>>();
    for anchor in &source.evidence.anchors {
        let key = (
            anchor.source_version_id.clone(),
            anchor.locator.clone(),
            anchor.exact_excerpt.clone(),
        );
        if seen.insert(key) {
            target.evidence.anchors.push(anchor.clone());
        }
    }
    target.evidence.anchors.sort_by(|left, right| {
        left.source_version_id
            .cmp(&right.source_version_id)
            .then_with(|| left.locator.cmp(&right.locator))
            .then_with(|| left.exact_excerpt.cmp(&right.exact_excerpt))
    });
}

pub fn canonicalise_quotation(
    quotation: &NormalisedQuotation,
    registry: &ResolvedCategoryRegistry,
) -> CanonicalisationResult {
    let mut output = quotation.clone();
    let mut issues = Vec::new();
    let mut merged = BTreeMap::<(String, String), LineItem>::new();
    for mut line in quotation.line_items.clone() {
        if let Some(canonical) = registry.canonical_key(&line.category) {
            line.category = canonical.to_string();
        } else if let Some(canonical) = registry.canonical_key(&line.label) {
            line.category = canonical.to_string();
        } else if !registry.fields.contains_key(&line.category) {
            issues.push(CanonicalisationIssue {
                code: "unmapped_category".to_string(),
                line_ids: vec![line.line_id.clone()],
                message: format!(
                    "vendor line '{}' is not mapped by registry {}",
                    line.label, registry.version
                ),
            });
        }
        let key = (line.category.clone(), normalized_label(&line.label));
        if let Some(existing) = merged.get_mut(&key) {
            if same_commercial_value(existing, &line) {
                merge_anchors(existing, &line);
                issues.push(CanonicalisationIssue {
                    code: "exact_duplicate_merged".to_string(),
                    line_ids: vec![existing.line_id.clone(), line.line_id],
                    message: "duplicate line retained once with merged evidence anchors"
                        .to_string(),
                });
            } else {
                merge_anchors(existing, &line);
                existing.evidence.state = EvidenceState::Conflicting;
                issues.push(CanonicalisationIssue {
                    code: "incompatible_duplicate".to_string(),
                    line_ids: vec![existing.line_id.clone(), line.line_id],
                    message: "incompatible duplicate values require review".to_string(),
                });
            }
        } else {
            merged.insert(key, line);
        }
    }
    output.line_items = merged.into_values().collect();
    output.line_items.sort_by(|left, right| {
        left.category
            .cmp(&right.category)
            .then_with(|| normalized_label(&left.label).cmp(&normalized_label(&right.label)))
            .then_with(|| left.line_id.cmp(&right.line_id))
    });
    issues.sort_by(|left, right| {
        left.code
            .cmp(&right.code)
            .then_with(|| left.line_ids.cmp(&right.line_ids))
    });
    CanonicalisationResult {
        quotation: output,
        issues,
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialChangeKind {
    Currency,
    LineAdded,
    LineRemoved,
    LineChanged,
    Tax,
    CommercialTerm,
    Validity,
    Lifecycle,
    Registry,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MaterialChange {
    pub kind: MaterialChangeKind,
    pub path: String,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

pub fn detect_material_changes(
    previous: &NormalisedQuotation,
    current: &NormalisedQuotation,
) -> Vec<MaterialChange> {
    if quotation_material_fingerprint(previous) == quotation_material_fingerprint(current) {
        return Vec::new();
    }
    let mut changes = Vec::new();
    let mut compare = |kind: MaterialChangeKind, path: &str, before: Value, after: Value| {
        if before != after {
            changes.push(MaterialChange {
                kind,
                path: path.to_string(),
                before: Some(before),
                after: Some(after),
            });
        }
    };
    compare(
        MaterialChangeKind::Currency,
        "currency",
        Value::String(previous.currency.clone()),
        Value::String(current.currency.clone()),
    );
    compare(
        MaterialChangeKind::Tax,
        "tax",
        serde_json::to_value(&previous.tax).unwrap_or(Value::Null),
        serde_json::to_value(&current.tax).unwrap_or(Value::Null),
    );
    compare(
        MaterialChangeKind::CommercialTerm,
        "commercial_terms",
        serde_json::to_value(&previous.commercial_terms).unwrap_or(Value::Null),
        serde_json::to_value(&current.commercial_terms).unwrap_or(Value::Null),
    );
    compare(
        MaterialChangeKind::Validity,
        "valid_until",
        serde_json::to_value(&previous.valid_until).unwrap_or(Value::Null),
        serde_json::to_value(&current.valid_until).unwrap_or(Value::Null),
    );
    compare(
        MaterialChangeKind::Lifecycle,
        "lifecycle",
        serde_json::to_value(previous.lifecycle).unwrap_or(Value::Null),
        serde_json::to_value(current.lifecycle).unwrap_or(Value::Null),
    );
    compare(
        MaterialChangeKind::Registry,
        "registry_version",
        Value::String(previous.registry_version.clone()),
        Value::String(current.registry_version.clone()),
    );

    let before_lines = previous
        .line_items
        .iter()
        .map(|line| (line.line_id.as_str(), line))
        .collect::<BTreeMap<_, _>>();
    let after_lines = current
        .line_items
        .iter()
        .map(|line| (line.line_id.as_str(), line))
        .collect::<BTreeMap<_, _>>();
    let ids = before_lines
        .keys()
        .chain(after_lines.keys())
        .copied()
        .collect::<BTreeSet<_>>();
    for id in ids {
        match (before_lines.get(id), after_lines.get(id)) {
            (Some(before), Some(after)) if *before != *after => changes.push(MaterialChange {
                kind: MaterialChangeKind::LineChanged,
                path: format!("line_items.{id}"),
                before: serde_json::to_value(before).ok(),
                after: serde_json::to_value(after).ok(),
            }),
            (Some(before), None) => changes.push(MaterialChange {
                kind: MaterialChangeKind::LineRemoved,
                path: format!("line_items.{id}"),
                before: serde_json::to_value(before).ok(),
                after: None,
            }),
            (None, Some(after)) => changes.push(MaterialChange {
                kind: MaterialChangeKind::LineAdded,
                path: format!("line_items.{id}"),
                before: None,
                after: serde_json::to_value(after).ok(),
            }),
            _ => {}
        }
    }
    changes.sort_by(|left, right| left.path.cmp(&right.path));
    changes
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClarificationCandidate {
    pub gap_code: String,
    pub line_id: Option<String>,
    pub question: String,
    pub impact_rank: u8,
}

fn gap_priority(gap: &CalculationGap) -> (u8, &'static str) {
    match gap.code.as_str() {
        "mixed_currency" => (
            0,
            "Which currency applies to this line and the final quotation?",
        ),
        "tax_treatment_unknown" => (
            1,
            "Is tax included, excluded, or exempt, and what rate applies?",
        ),
        "unknown_inclusion" => (
            2,
            "Is this item included, required as an extra, or optional?",
        ),
        "price_missing" => (
            3,
            "What price and charging basis apply to this required item?",
        ),
        "percentage_basis_incomplete" => (
            4,
            "Which priced items form the basis of this percentage fee?",
        ),
        "quantity_or_arithmetic_missing" => {
            (5, "What quantity or duration should apply to this item?")
        }
        _ => (
            20,
            "Can you confirm the missing quotation detail for this item?",
        ),
    }
}

pub fn top_clarification_candidates(total: &ComparableTotal) -> Vec<ClarificationCandidate> {
    let mut candidates = total
        .gaps
        .iter()
        .map(|gap| {
            let (impact_rank, question) = gap_priority(gap);
            ClarificationCandidate {
                gap_code: gap.code.clone(),
                line_id: gap.line_id.clone(),
                question: question.to_string(),
                impact_rank,
            }
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        left.impact_rank
            .cmp(&right.impact_rank)
            .then_with(|| left.line_id.cmp(&right.line_id))
            .then_with(|| left.gap_code.cmp(&right.gap_code))
    });
    candidates
        .dedup_by(|left, right| left.gap_code == right.gap_code && left.line_id == right.line_id);
    candidates.truncate(3);
    candidates
}
