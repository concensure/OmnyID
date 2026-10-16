use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const QUOTATION_SCHEMA_VERSION: &str = "quotation.normalised.v1";
pub const COMPARISON_SCHEMA_VERSION: &str = "quotation.comparison.v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceState {
    Confirmed,
    Inferred,
    Unknown,
    Conflicting,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceAnchor {
    pub source_id: String,
    pub source_version_id: String,
    pub locator: String,
    pub exact_excerpt: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Evidence {
    pub state: EvidenceState,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub anchors: Vec<SourceAnchor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rationale: Option<String>,
}

impl Evidence {
    pub fn confirmed(anchor: SourceAnchor) -> Self {
        Self {
            state: EvidenceState::Confirmed,
            anchors: vec![anchor],
            rationale: None,
        }
    }

    pub fn unknown(reason: impl Into<String>) -> Self {
        Self {
            state: EvidenceState::Unknown,
            anchors: Vec::new(),
            rationale: Some(reason.into()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Money {
    /// Integer minor units. AUD 123.45 is represented as 12345.
    pub amount_minor: i64,
    pub currency: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScaledQuantity {
    /// Integer mantissa divided by 10^scale (for example 15/10 = 1.5).
    pub units: i64,
    pub scale: u8,
}

impl ScaledQuantity {
    pub fn whole(units: i64) -> Self {
        Self { units, scale: 0 }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InclusionState {
    Included,
    Required,
    Optional,
    Excluded,
    Conditional,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PriceBasis {
    Fixed,
    PerPerson,
    PerItem,
    PerHour,
    Percentage,
    MinimumSpend,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LineEffect {
    #[default]
    Charge,
    Discount,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaxTreatment {
    Inclusive,
    Exclusive,
    Exempt,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuoteLifecycle {
    Draft,
    Active,
    Superseded,
    Accepted,
    Declined,
    Expired,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceReference {
    pub source_id: String,
    pub source_version_id: String,
    pub media_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotationIdentity {
    pub quotation_id: String,
    pub version_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes_version_id: Option<String>,
    pub vendor_id: String,
    /// Namespace of the consuming template, e.g. `wedding_planner`.
    pub context_namespace: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LineItem {
    pub line_id: String,
    pub label: String,
    pub category: String,
    pub inclusion: InclusionState,
    pub price_basis: PriceBasis,
    #[serde(default)]
    pub effect: LineEffect,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit_price: Option<Money>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quantity: Option<ScaledQuantity>,
    /// Basis points where 10_000 is 100%; only used for percentage lines.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rate_bps: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub percentage_basis_line_ids: Vec<String>,
    pub evidence: Evidence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaxRule {
    pub treatment: TaxTreatment,
    /// Basis points where 1_000 is 10%.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rate_bps: Option<u32>,
    pub evidence: Evidence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommercialTerm {
    pub term_id: String,
    pub kind: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount: Option<Money>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refundable: Option<bool>,
    pub evidence: Evidence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UnmappedItem {
    pub vendor_label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proposed_key: Option<String>,
    pub evidence: Evidence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct NormalisedQuotation {
    pub schema_version: String,
    pub registry_version: String,
    pub identity: QuotationIdentity,
    pub lifecycle: QuoteLifecycle,
    pub currency: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issued_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub valid_until: Option<String>,
    pub sources: Vec<SourceReference>,
    pub line_items: Vec<LineItem>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub commercial_terms: Vec<CommercialTerm>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub unmapped_items: Vec<UnmappedItem>,
    pub tax: TaxRule,
}

pub fn currency_exponent(currency: &str) -> Option<u8> {
    match currency {
        "BHD" | "JOD" | "KWD" | "OMR" | "TND" => Some(3),
        "BIF" | "CLP" | "DJF" | "GNF" | "ISK" | "JPY" | "KMF" | "KRW" | "PYG" | "RWF" | "UGX"
        | "UYI" | "VND" | "VUV" | "XAF" | "XOF" | "XPF" => Some(0),
        value
            if value.len() == 3
                && value
                    .chars()
                    .all(|character| character.is_ascii_uppercase()) =>
        {
            Some(2)
        }
        _ => None,
    }
}

pub fn quotation_material_fingerprint(quotation: &NormalisedQuotation) -> String {
    let encoded = serde_json::to_vec(quotation).unwrap_or_default();
    hex::encode(Sha256::digest(encoded))
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ComparableScenario {
    pub scenario_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub guest_count: Option<u32>,
    #[serde(default)]
    pub selected_optional_line_ids: Vec<String>,
    #[serde(default)]
    pub quantity_overrides: BTreeMap<String, ScaledQuantity>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TotalStatus {
    Complete,
    Incomplete,
    Ambiguous,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CalculationGap {
    pub code: String,
    pub line_id: Option<String>,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FormulaTrace {
    pub line_id: String,
    pub formula_id: String,
    pub formula_version: String,
    #[serde(default)]
    pub input_line_ids: Vec<String>,
    pub rounding: String,
    pub expression: String,
    pub amount_minor: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ComparableTotal {
    pub quotation_id: String,
    pub version_id: String,
    pub scenario_id: String,
    pub currency: String,
    pub status: TotalStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtotal_minor: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tax_minor: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_minor: Option<i64>,
    pub evidence_coverage_bps: u16,
    pub gaps: Vec<CalculationGap>,
    pub formula_trace: Vec<FormulaTrace>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequirementImportance {
    Hard,
    Soft,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequirementStatus {
    Met,
    Conflict,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RequirementAssessment {
    pub requirement_id: String,
    pub importance: RequirementImportance,
    pub status: RequirementStatus,
    pub evidence: Evidence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ComparisonCandidate {
    pub quotation_id: String,
    pub version_id: String,
    pub vendor_id: String,
    pub total: ComparableTotal,
    pub requirements: Vec<RequirementAssessment>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CandidateDisposition {
    Eligible,
    Conditional,
    Excluded,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RankedCandidate {
    pub quotation_id: String,
    pub version_id: String,
    pub vendor_id: String,
    pub disposition: CandidateDisposition,
    pub total: ComparableTotal,
    pub requirement_coverage_bps: u16,
    pub evidence_strength_bps: u16,
    pub hard_conflict_ids: Vec<String>,
    pub unknown_hard_requirement_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotationComparison {
    pub schema_version: String,
    pub comparison_id: String,
    pub scenario_id: String,
    pub candidates: Vec<RankedCandidate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended_quotation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommendation_reason: Option<String>,
}
