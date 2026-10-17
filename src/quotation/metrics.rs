use serde::{Deserialize, Serialize};

pub const MIN_MONEY_CURRENCY_EXACT_BPS: u16 = 9_800;
pub const MIN_INCLUSION_ACCURACY_BPS: u16 = 9_500;
pub const REQUIRED_SAFETY_BPS: u16 = 10_000;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotationEvaluationCounts {
    pub material_fields: u64,
    pub anchored_confirmed_material_fields: u64,
    pub unsupported_confirmed_material_fields: u64,
    pub money_currency_cases: u64,
    pub money_currency_exact: u64,
    pub inclusion_cases: u64,
    pub inclusion_exact: u64,
    pub deterministic_cases: u64,
    pub deterministic_exact: u64,
    pub approval_send_cases: u64,
    pub approval_send_enforced: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReadinessStatus {
    Untested,
    Blocked,
    Failed,
    Verified,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotationReadinessReport {
    pub status: ReadinessStatus,
    pub anchor_coverage_bps: Option<u16>,
    pub money_currency_exact_bps: Option<u16>,
    pub inclusion_accuracy_bps: Option<u16>,
    pub deterministic_bps: Option<u16>,
    pub approval_enforcement_bps: Option<u16>,
    pub unsupported_confirmed_material_fields: u64,
    pub blocking_reasons: Vec<String>,
}

fn ratio_bps(numerator: u64, denominator: u64) -> Option<u16> {
    if denominator == 0 {
        return None;
    }
    Some(((u128::from(numerator) * 10_000) / u128::from(denominator)).min(10_000) as u16)
}

pub fn quotation_readiness_report(
    counts: &QuotationEvaluationCounts,
    externally_blocked: bool,
) -> QuotationReadinessReport {
    let anchor = ratio_bps(
        counts.anchored_confirmed_material_fields,
        counts.material_fields,
    );
    let money = ratio_bps(counts.money_currency_exact, counts.money_currency_cases);
    let inclusion = ratio_bps(counts.inclusion_exact, counts.inclusion_cases);
    let deterministic = ratio_bps(counts.deterministic_exact, counts.deterministic_cases);
    let approval = ratio_bps(counts.approval_send_enforced, counts.approval_send_cases);
    let mut blocking_reasons = Vec::new();
    for (label, value, threshold) in [
        ("source_anchor_coverage", anchor, REQUIRED_SAFETY_BPS),
        ("money_currency_exact", money, MIN_MONEY_CURRENCY_EXACT_BPS),
        ("inclusion_accuracy", inclusion, MIN_INCLUSION_ACCURACY_BPS),
        ("deterministic_results", deterministic, REQUIRED_SAFETY_BPS),
        (
            "approval_receipt_enforcement",
            approval,
            REQUIRED_SAFETY_BPS,
        ),
    ] {
        match value {
            None => blocking_reasons.push(format!("{label}:untested")),
            Some(actual) if actual < threshold => {
                blocking_reasons.push(format!("{label}:failed:{actual}<{threshold}"))
            }
            _ => {}
        }
    }
    if counts.unsupported_confirmed_material_fields > 0 {
        blocking_reasons.push(format!(
            "unsupported_confirmed_material_fields:failed:{}>0",
            counts.unsupported_confirmed_material_fields
        ));
    }
    let untested = [anchor, money, inclusion, deterministic, approval]
        .iter()
        .any(Option::is_none);
    let failed = blocking_reasons
        .iter()
        .any(|reason| reason.contains(":failed"));
    let status = if externally_blocked {
        ReadinessStatus::Blocked
    } else if failed {
        ReadinessStatus::Failed
    } else if untested {
        ReadinessStatus::Untested
    } else {
        ReadinessStatus::Verified
    };
    QuotationReadinessReport {
        status,
        anchor_coverage_bps: anchor,
        money_currency_exact_bps: money,
        inclusion_accuracy_bps: inclusion,
        deterministic_bps: deterministic,
        approval_enforcement_bps: approval,
        unsupported_confirmed_material_fields: counts.unsupported_confirmed_material_fields,
        blocking_reasons,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuotationMetricName {
    FirstCompleteQuoteToDecision,
    FirstCompleteQuoteToBooking,
    ClarificationExchangesPerBooking,
    QualifiedEnquiryOutcome,
    VendorActiveResponseTime,
    PortalInviteLifecycle,
    ResponseChannel,
    DuplicateReconciliation,
    ExtractionMaterialAccuracy,
    ManualCorrection,
    SecurityRejection,
    ContractMaterialChange,
    ClosureBudgetProjection,
    IdempotencyConflict,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuotationMetricCategory {
    All,
    Venue,
    Catering,
    Photography,
    Entertainment,
    FloralStyling,
    Beauty,
    Transport,
    Accommodation,
    ProductionHire,
    Celebrant,
    Stationery,
    Cake,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuotationMetricOutcome {
    Observed,
    Preferred,
    VerifiedBooking,
    NotBooked,
    Submitted,
    Expired,
    Revoked,
    EmailFallback,
    ClaimedAfp,
    SecureLink,
    Email,
    Duplicate,
    Exact,
    Corrected,
    ManualReview,
    RejectedStale,
    RejectedReplay,
    RejectedCrossTenant,
    MaterialChange,
    Projected,
    Conflict,
}

/// A deliberately closed, aggregate-only metric contract.
///
/// The enums prevent callers from turning vendor, user, quotation, thread, or
/// source identifiers into metric labels. Values measure counts, elapsed time,
/// parser/model fallback, corrections, and OmnyID processing cost only. They
/// never carry a quotation amount or other commercial value.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuotationMetricEvent {
    pub event: QuotationMetricName,
    pub category: QuotationMetricCategory,
    pub outcome: QuotationMetricOutcome,
    pub count: u64,
    pub latency_ms: Option<u64>,
    pub provider_fallback_count: Option<u8>,
    pub correction_count: Option<u16>,
    pub estimated_cost_usd_micros: Option<u64>,
}

pub fn validate_metric_event(event: &QuotationMetricEvent) -> Result<(), String> {
    if event.count == 0
        || event.count > 1_000_000
        || event
            .latency_ms
            .is_some_and(|value| value > 366 * 24 * 60 * 60 * 1_000)
        || event.provider_fallback_count.is_some_and(|value| value > 3)
        || event.correction_count.is_some_and(|value| value > 500)
        || event
            .estimated_cost_usd_micros
            .is_some_and(|value| value > 100_000_000_000)
    {
        return Err("metric value is outside its bounded range".to_string());
    }

    let requires_latency = matches!(
        event.event,
        QuotationMetricName::FirstCompleteQuoteToDecision
            | QuotationMetricName::FirstCompleteQuoteToBooking
            | QuotationMetricName::VendorActiveResponseTime
            | QuotationMetricName::ClosureBudgetProjection
    );
    if requires_latency != event.latency_ms.is_some() {
        return Err("latency presence does not match the metric kind".to_string());
    }
    Ok(())
}
