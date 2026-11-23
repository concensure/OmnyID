use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::quotation::{
    EvidenceState, NormalisedQuotation, RankedCandidate, RequirementAssessment, RequirementStatus,
};

use super::{
    CandidateEvidenceFact, CandidateEvidenceSnapshot, CandidateFactState, ConstraintOperator,
    ConstraintPrivacy, ConstraintStatus, ConstraintValue, PlanningConstraint, SubjectKind,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuotationEvaluationSource {
    pub source_id: String,
    pub source_version_id: String,
    pub exact_excerpt: String,
}

pub fn quotation_evaluation_sources(
    requirements: &[RequirementAssessment],
) -> Vec<QuotationEvaluationSource> {
    let mut sources = requirements
        .iter()
        .flat_map(|requirement| requirement.evidence.anchors.iter())
        .map(|anchor| QuotationEvaluationSource {
            source_id: anchor.source_id.clone(),
            source_version_id: anchor.source_version_id.clone(),
            exact_excerpt: anchor.exact_excerpt.clone(),
        })
        .collect::<Vec<_>>();
    sources.sort_by(|left, right| {
        (&left.source_id, &left.source_version_id, &left.exact_excerpt).cmp(&(
            &right.source_id,
            &right.source_version_id,
            &right.exact_excerpt,
        ))
    });
    sources.dedup();
    sources
}

pub fn project_quotation_candidate_snapshot(
    constraints: &[PlanningConstraint],
    quotation: &NormalisedQuotation,
    requirements: &[RequirementAssessment],
    observed_at: &str,
) -> Result<CandidateEvidenceSnapshot, String> {
    let observed_at = canonical_observed_at(observed_at)?;
    let allowed_sources = quotation
        .sources
        .iter()
        .map(|source| (source.source_id.as_str(), source.source_version_id.as_str()))
        .collect::<std::collections::BTreeSet<_>>();
    let mut facts = Vec::new();
    let mut active = constraints
        .iter()
        .filter(|constraint| constraint.status == ConstraintStatus::Confirmed)
        .collect::<Vec<_>>();
    active.sort_by(|left, right| left.constraint_id.cmp(&right.constraint_id));
    for constraint in active {
        let mut matches = requirements
            .iter()
            .filter(|assessment| assessment.requirement_id == constraint.constraint_id)
            .collect::<Vec<_>>();
        matches.sort_by(|left, right| evidence_identity(left).cmp(&evidence_identity(right)));
        let Some(assessment) = matches.first() else {
            continue;
        };
        if matches.len() != 1
            || assessment.evidence.state != EvidenceState::Confirmed
            || assessment.status == RequirementStatus::Unknown
            || assessment.evidence.anchors.is_empty()
            || assessment.evidence.anchors.iter().any(|anchor| {
                anchor.exact_excerpt.trim().is_empty()
                    || !allowed_sources.contains(&(
                        anchor.source_id.as_str(),
                        anchor.source_version_id.as_str(),
                    ))
            })
        {
            continue;
        }
        let Some(state) = fact_state(&constraint.operator, assessment.status) else {
            continue;
        };
        facts.push(CandidateEvidenceFact {
            kind: constraint.kind.clone(),
            state,
            value: constraint.value.clone(),
            evidence_ref: evidence_ref(
                &quotation.identity.version_id,
                &constraint.constraint_id,
                assessment,
            ),
            candidate_revision_ref: quotation.identity.version_id.clone(),
            aggregate_count: private_aggregate_count(constraint),
        });
    }
    Ok(CandidateEvidenceSnapshot {
        candidate_ref: quotation.identity.quotation_id.clone(),
        revision_ref: quotation.identity.version_id.clone(),
        observed_at,
        facts,
    })
}

pub fn project_ranked_quotation_candidate_snapshot(
    constraints: &[PlanningConstraint],
    quotation: &NormalisedQuotation,
    candidate: &RankedCandidate,
    comparison_evidence_ref: &str,
    observed_at: &str,
) -> Result<CandidateEvidenceSnapshot, String> {
    let observed_at = canonical_observed_at(observed_at)?;
    if candidate.version_id != quotation.identity.version_id
        || candidate.quotation_id != quotation.identity.quotation_id
        || comparison_evidence_ref.trim().is_empty()
    {
        return Err("ranked candidate does not match quotation revision".to_string());
    }
    let hard_conflicts = candidate
        .hard_conflict_ids
        .iter()
        .map(String::as_str)
        .collect::<std::collections::BTreeSet<_>>();
    let unknown_hard = candidate
        .unknown_hard_requirement_ids
        .iter()
        .map(String::as_str)
        .collect::<std::collections::BTreeSet<_>>();
    if !hard_conflicts.is_disjoint(&unknown_hard) {
        return Err("ranked candidate requirement state is contradictory".to_string());
    }
    let mut active = constraints
        .iter()
        .filter(|constraint| constraint.status == ConstraintStatus::Confirmed)
        .collect::<Vec<_>>();
    active.sort_by(|left, right| left.constraint_id.cmp(&right.constraint_id));
    let facts = active
        .into_iter()
        .filter(|constraint| hard_conflicts.contains(constraint.constraint_id.as_str()))
        .filter_map(|constraint| {
            let state = fact_state(&constraint.operator, RequirementStatus::Conflict)?;
            Some(CandidateEvidenceFact {
                kind: constraint.kind.clone(),
                state,
                value: constraint.value.clone(),
                evidence_ref: ranked_evidence_ref(
                    comparison_evidence_ref,
                    &candidate.version_id,
                    &constraint.constraint_id,
                ),
                candidate_revision_ref: candidate.version_id.clone(),
                aggregate_count: private_aggregate_count(constraint),
            })
        })
        .collect();
    Ok(CandidateEvidenceSnapshot {
        candidate_ref: candidate.quotation_id.clone(),
        revision_ref: candidate.version_id.clone(),
        observed_at,
        facts,
    })
}

fn canonical_observed_at(value: &str) -> Result<String, String> {
    chrono::DateTime::parse_from_rfc3339(value)
        .or_else(|_| chrono::DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f%#z"))
        .map(|timestamp| timestamp.to_rfc3339())
        .map_err(|_| "candidate observation time must be RFC3339".to_string())
}

fn fact_state(
    operator: &ConstraintOperator,
    status: RequirementStatus,
) -> Option<CandidateFactState> {
    if *operator == ConstraintOperator::Limits {
        return None;
    }
    Some(match (operator, status) {
        (ConstraintOperator::Excludes, RequirementStatus::Met) => {
            CandidateFactState::ExplicitlyAbsent
        }
        (ConstraintOperator::Excludes, RequirementStatus::Conflict) => {
            CandidateFactState::Confirmed
        }
        (_, RequirementStatus::Met) => CandidateFactState::Confirmed,
        (_, RequirementStatus::Conflict) => CandidateFactState::ExplicitlyAbsent,
        (_, RequirementStatus::Unknown) => return None,
    })
}

fn private_aggregate_count(constraint: &PlanningConstraint) -> Option<u32> {
    if constraint.privacy != ConstraintPrivacy::CouplePrivate
        && constraint.subject_ref.kind != SubjectKind::Person
    {
        return None;
    }
    let count = match &constraint.value {
        ConstraintValue::ReferenceList { values } => values.len(),
        ConstraintValue::EnumList { values, .. } => values.len(),
        _ => 1,
    };
    Some(u32::try_from(count.max(1)).unwrap_or(u32::MAX))
}

fn evidence_identity(assessment: &RequirementAssessment) -> String {
    crate::crypto::canonical_json_string(&serde_json::json!({
        "requirement_id": assessment.requirement_id,
        "status": assessment.status,
        "evidence": assessment.evidence,
    }))
}

fn evidence_ref(
    version_id: &str,
    constraint_id: &str,
    assessment: &RequirementAssessment,
) -> String {
    let canonical = crate::crypto::canonical_json_string(&serde_json::json!({
        "version_id": version_id,
        "constraint_id": constraint_id,
        "assessment": assessment,
    }));
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    format!("quotation_evidence:{}", &digest[..32])
}

fn ranked_evidence_ref(
    comparison_evidence_ref: &str,
    version_id: &str,
    constraint_id: &str,
) -> String {
    let canonical = crate::crypto::canonical_json_string(&serde_json::json!({
        "comparison_evidence_ref": comparison_evidence_ref,
        "version_id": version_id,
        "constraint_id": constraint_id,
    }));
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    format!("quotation_comparison_evidence:{}", &digest[..32])
}

#[cfg(test)]
mod tests {
    use crate::{
        planning_intelligence::{
            ConstraintAuthority, ConstraintKind, ConstraintPrivacy, ConstraintStrength,
            SourceAnchor, SubjectReference, CONSTRAINT_SCHEMA_VERSION,
        },
        quotation::{
            Evidence, QuoteLifecycle, QuotationIdentity, SourceAnchor as QuotationSourceAnchor,
            SourceReference, TaxRule, TaxTreatment, QUOTATION_SCHEMA_VERSION,
        },
    };

    use super::*;

    fn constraint(id: &str, operator: ConstraintOperator) -> PlanningConstraint {
        PlanningConstraint {
            schema_version: CONSTRAINT_SCHEMA_VERSION.to_string(),
            constraint_id: id.to_string(),
            template_id: "renovation".to_string(),
            plan_id: "plan:one".to_string(),
            subject_ref: SubjectReference {
                kind: SubjectKind::Plan,
                id: "plan:one".to_string(),
            },
            kind: ConstraintKind::AccessibilityRequirement,
            operator,
            value: ConstraintValue::Boolean { value: true },
            strength: ConstraintStrength::Hard,
            authority: ConstraintAuthority::User,
            privacy: ConstraintPrivacy::PlanPrivate,
            source_ref: "source:constraint".to_string(),
            source_anchor: SourceAnchor {
                message_id: "source:constraint".to_string(),
                source_version_id: Some("source:constraint:v1".to_string()),
                locator: "content.body".to_string(),
                exact_excerpt: "step-free".to_string(),
            },
            observed_at: "2026-10-19T00:00:00Z".to_string(),
            effective_window: None,
            status: ConstraintStatus::Confirmed,
            supersedes: None,
        }
    }

    fn quotation() -> NormalisedQuotation {
        NormalisedQuotation {
            schema_version: QUOTATION_SCHEMA_VERSION.to_string(),
            registry_version: "registry:v1".to_string(),
            identity: QuotationIdentity {
                quotation_id: "quotation:one".to_string(),
                version_id: "quotation:one:v1".to_string(),
                supersedes_version_id: None,
                vendor_id: "vendor:one".to_string(),
                context_namespace: "renovation".to_string(),
            },
            lifecycle: QuoteLifecycle::Active,
            currency: "AUD".to_string(),
            issued_at: None,
            valid_until: None,
            sources: vec![SourceReference {
                source_id: "source:quote".to_string(),
                source_version_id: "source:quote:v1".to_string(),
                media_type: "text/plain".to_string(),
                content_hash: None,
            }],
            line_items: vec![],
            commercial_terms: vec![],
            unmapped_items: vec![],
            tax: TaxRule {
                treatment: TaxTreatment::Unknown,
                rate_bps: None,
                evidence: Evidence::unknown("not supplied"),
            },
        }
    }

    fn assessment(id: &str, status: RequirementStatus) -> RequirementAssessment {
        RequirementAssessment {
            requirement_id: id.to_string(),
            importance: crate::quotation::RequirementImportance::Hard,
            status,
            evidence: Evidence::confirmed(QuotationSourceAnchor {
                source_id: "source:quote".to_string(),
                source_version_id: "source:quote:v1".to_string(),
                locator: "content.body".to_string(),
                exact_excerpt: "No step-free entry".to_string(),
            }),
        }
    }

    #[test]
    fn projects_only_exact_confirmed_assessments() {
        let required = constraint("constraint:step-free", ConstraintOperator::Requires);
        let snapshot = project_quotation_candidate_snapshot(
            std::slice::from_ref(&required),
            &quotation(),
            &[assessment(&required.constraint_id, RequirementStatus::Conflict)],
            "2026-10-19T01:00:00Z",
        )
        .expect("snapshot");
        assert_eq!(snapshot.facts.len(), 1);
        assert_eq!(
            snapshot.facts[0].state,
            CandidateFactState::ExplicitlyAbsent
        );

        let missing = project_quotation_candidate_snapshot(
            &[required],
            &quotation(),
            &[assessment("constraint:other", RequirementStatus::Met)],
            "2026-10-19T01:00:00Z",
        )
        .expect("snapshot");
        assert!(missing.facts.is_empty());
    }

    #[test]
    fn limits_without_actual_measurements_remain_unknown() {
        let limit = constraint("constraint:height", ConstraintOperator::Limits);
        let snapshot = project_quotation_candidate_snapshot(
            std::slice::from_ref(&limit),
            &quotation(),
            &[assessment(&limit.constraint_id, RequirementStatus::Conflict)],
            "2026-10-19T01:00:00Z",
        )
        .expect("snapshot");
        assert!(snapshot.facts.is_empty());
    }
}
