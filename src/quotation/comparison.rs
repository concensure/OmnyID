use super::contracts::*;
use std::collections::BTreeSet;

fn disposition(
    candidate: &ComparisonCandidate,
) -> (CandidateDisposition, Vec<String>, Vec<String>, u16, u16) {
    let hard_conflicts = candidate
        .requirements
        .iter()
        .filter(|requirement| {
            requirement.importance == RequirementImportance::Hard
                && requirement.status == RequirementStatus::Conflict
                && requirement.evidence.state == EvidenceState::Confirmed
        })
        .map(|requirement| requirement.requirement_id.clone())
        .collect::<Vec<_>>();
    let unknown_hard = candidate
        .requirements
        .iter()
        .filter(|requirement| {
            requirement.importance == RequirementImportance::Hard
                && (requirement.status == RequirementStatus::Unknown
                    || requirement.evidence.state != EvidenceState::Confirmed)
        })
        .map(|requirement| requirement.requirement_id.clone())
        .collect::<Vec<_>>();
    let disposition = if !hard_conflicts.is_empty() {
        CandidateDisposition::Excluded
    } else if !unknown_hard.is_empty() || candidate.total.status != TotalStatus::Complete {
        CandidateDisposition::Conditional
    } else {
        CandidateDisposition::Eligible
    };
    let requirement_count = candidate.requirements.len() as u32;
    let confirmed_met = candidate
        .requirements
        .iter()
        .filter(|requirement| {
            requirement.status == RequirementStatus::Met
                && requirement.evidence.state == EvidenceState::Confirmed
        })
        .count() as u32;
    let confirmed_evidence = candidate
        .requirements
        .iter()
        .filter(|requirement| requirement.evidence.state == EvidenceState::Confirmed)
        .count() as u32;
    let requirement_coverage_bps = if requirement_count == 0 {
        10_000
    } else {
        ((confirmed_met * 10_000) / requirement_count) as u16
    };
    let requirement_evidence_bps = if requirement_count == 0 {
        10_000
    } else {
        ((confirmed_evidence * 10_000) / requirement_count) as u16
    };
    let evidence_strength_bps = ((u32::from(requirement_evidence_bps)
        + u32::from(candidate.total.evidence_coverage_bps))
        / 2) as u16;
    (
        disposition,
        hard_conflicts,
        unknown_hard,
        requirement_coverage_bps,
        evidence_strength_bps,
    )
}

fn disposition_order(value: CandidateDisposition) -> u8 {
    match value {
        CandidateDisposition::Eligible => 0,
        CandidateDisposition::Conditional => 1,
        CandidateDisposition::Excluded => 2,
    }
}

pub fn compare_quotations(
    comparison_id: impl Into<String>,
    scenario_id: impl Into<String>,
    candidates: Vec<ComparisonCandidate>,
) -> QuotationComparison {
    let comparison_id = comparison_id.into();
    let scenario_id = scenario_id.into();
    let input_count = candidates.len();
    let currencies = candidates
        .iter()
        .map(|candidate| candidate.total.currency.as_str())
        .collect::<BTreeSet<_>>();
    let currency_mismatch = currencies.len() > 1;
    let scenario_mismatch = candidates
        .iter()
        .any(|candidate| candidate.total.scenario_id != scenario_id);
    let mut ranked = candidates
        .into_iter()
        .map(|candidate| {
            let (
                mut candidate_disposition,
                hard_conflicts,
                unknown_hard,
                requirement_coverage_bps,
                evidence_strength_bps,
            ) = disposition(&candidate);
            if (currency_mismatch || scenario_mismatch)
                && candidate_disposition == CandidateDisposition::Eligible
            {
                candidate_disposition = CandidateDisposition::Conditional;
            }
            RankedCandidate {
                quotation_id: candidate.quotation_id,
                version_id: candidate.version_id,
                vendor_id: candidate.vendor_id,
                disposition: candidate_disposition,
                total: candidate.total,
                requirement_coverage_bps,
                evidence_strength_bps,
                hard_conflict_ids: hard_conflicts,
                unknown_hard_requirement_ids: unknown_hard,
            }
        })
        .collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        disposition_order(left.disposition)
            .cmp(&disposition_order(right.disposition))
            .then_with(|| {
                right
                    .requirement_coverage_bps
                    .cmp(&left.requirement_coverage_bps)
            })
            .then_with(|| {
                left.total
                    .total_minor
                    .unwrap_or(i64::MAX)
                    .cmp(&right.total.total_minor.unwrap_or(i64::MAX))
            })
            .then_with(|| right.evidence_strength_bps.cmp(&left.evidence_strength_bps))
            .then_with(|| left.quotation_id.cmp(&right.quotation_id))
    });

    let eligible = ranked
        .iter()
        .filter(|candidate| candidate.disposition == CandidateDisposition::Eligible)
        .collect::<Vec<_>>();
    let recommendation = if input_count < 2
        || currency_mismatch
        || scenario_mismatch
        || eligible.is_empty()
    {
        None
    } else if eligible.len() == 1 {
        Some((
            eligible[0].quotation_id.clone(),
            "only quotation without a confirmed hard conflict, unknown hard requirement, or incomplete total"
                .to_string(),
        ))
    } else {
        let first = eligible[0];
        let second = eligible[1];
        if first.requirement_coverage_bps > second.requirement_coverage_bps {
            Some((
                first.quotation_id.clone(),
                "highest confirmed requirement coverage among eligible quotations".to_string(),
            ))
        } else {
            match (first.total.total_minor, second.total.total_minor) {
                (Some(first_total), Some(second_total)) if first_total < second_total => Some((
                    first.quotation_id.clone(),
                    "lowest complete comparable total at equal confirmed requirement coverage"
                        .to_string(),
                )),
                (Some(first_total), Some(second_total))
                    if first_total == second_total
                        && first.evidence_strength_bps > second.evidence_strength_bps =>
                {
                    Some((
                        first.quotation_id.clone(),
                        "strongest evidence at equal requirement coverage and comparable total"
                            .to_string(),
                    ))
                }
                _ => None,
            }
        }
    };

    QuotationComparison {
        schema_version: COMPARISON_SCHEMA_VERSION.to_string(),
        comparison_id,
        scenario_id,
        candidates: ranked,
        recommended_quotation_id: recommendation.as_ref().map(|value| value.0.clone()),
        recommendation_reason: recommendation.map(|value| value.1),
    }
}
