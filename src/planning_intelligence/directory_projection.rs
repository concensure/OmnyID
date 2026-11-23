use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::{
    CandidateEvidenceFact, CandidateEvidenceSnapshot, CandidateFactState, ConstraintKind,
    ConstraintPrivacy, ConstraintStatus, ConstraintValue, PlanningConstraint, SubjectKind,
};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectoryAttributeEvidence {
    pub key: String,
    pub value: Option<Value>,
    pub status: String,
    pub authority: String,
    pub retrieved_at: String,
    pub valid_until: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectoryCandidateEvidence {
    pub candidate_ref: String,
    pub category: String,
    pub service_area: String,
    pub updated_at: String,
    pub attributes: Vec<DirectoryAttributeEvidence>,
}

const BOOLEAN_SERVICE_KEYS: &[&str] = &[
    "accommodation_on_site",
    "byo_alcohol_allowed",
    "ceremony_on_site",
    "exclusive_use",
    "external_catering_allowed",
    "in_house_catering",
    "indoor_space",
    "outdoor_space",
    "parking",
    "pets_allowed",
    "photo_locations_on_site",
    "public_transport_access",
    "reception_on_site",
];

pub fn project_directory_candidate_snapshot(
    constraints: &[PlanningConstraint],
    source: &DirectoryCandidateEvidence,
    as_of: &str,
) -> Result<CandidateEvidenceSnapshot, String> {
    identifier(&source.candidate_ref, "directory candidate_ref")?;
    let as_of = parse_time(as_of, "directory evaluation time")?;
    let updated_at = parse_time(&source.updated_at, "directory updated_at")?;
    let mut attributes = source.attributes.clone();
    attributes.sort_by(|left, right| {
        (&left.key, &left.retrieved_at, &left.authority).cmp(&(
            &right.key,
            &right.retrieved_at,
            &right.authority,
        ))
    });
    if attributes.len() > 200 {
        return Err("directory candidate supports at most 200 attributes".to_string());
    }
    let mut keys = std::collections::BTreeSet::new();
    for attribute in &attributes {
        identifier(&attribute.key, "directory attribute key")?;
        if !keys.insert(attribute.key.as_str()) {
            return Err("directory attribute key is duplicated".to_string());
        }
        parse_time(&attribute.retrieved_at, "directory attribute retrieved_at")?;
        if let Some(valid_until) = attribute.valid_until.as_deref() {
            parse_time(valid_until, "directory attribute valid_until")?;
        }
    }
    let freshness = attributes
        .iter()
        .map(|attribute| {
            let expired = attribute
                .valid_until
                .as_deref()
                .and_then(|value| parse_time(value, "valid_until").ok())
                .is_some_and(|value| value < as_of);
            (&attribute.key, expired)
        })
        .collect::<Vec<_>>();
    let revision_ref = directory_revision_ref(source, &attributes, &freshness);
    let mut active = constraints
        .iter()
        .filter(|constraint| constraint.status == ConstraintStatus::Confirmed)
        .collect::<Vec<_>>();
    active.sort_by(|left, right| left.constraint_id.cmp(&right.constraint_id));
    let facts = active
        .into_iter()
        .filter_map(|constraint| {
            directory_fact(
                constraint,
                source,
                &attributes,
                &revision_ref,
                &as_of,
            )
        })
        .collect::<Vec<_>>();
    let observed_at = attributes
        .iter()
        .filter_map(|attribute| parse_time(&attribute.retrieved_at, "retrieved_at").ok())
        .fold(updated_at, |latest, value| latest.max(value))
        .to_rfc3339();
    Ok(CandidateEvidenceSnapshot {
        candidate_ref: source.candidate_ref.clone(),
        revision_ref,
        observed_at,
        facts,
    })
}

fn directory_fact(
    constraint: &PlanningConstraint,
    source: &DirectoryCandidateEvidence,
    attributes: &[DirectoryAttributeEvidence],
    revision_ref: &str,
    as_of: &chrono::DateTime<chrono::FixedOffset>,
) -> Option<CandidateEvidenceFact> {
    let (state, evidence_key) = match constraint.kind {
        ConstraintKind::AccessibilityRequirement => {
            let key = exact_enum_value(&constraint.value)?;
            if key != "wheelchair_accessible" {
                return None;
            }
            (boolean_attribute_state(attributes, key, as_of)?, key)
        }
        ConstraintKind::ServiceRequirement => {
            let key = exact_enum_value(&constraint.value)?;
            if !BOOLEAN_SERVICE_KEYS.contains(&key) {
                return None;
            }
            (boolean_attribute_state(attributes, key, as_of)?, key)
        }
        ConstraintKind::AestheticPreference => {
            let matched = ["style_facets", "style_tags"].iter().find_map(|key| {
                tags_attribute_matches(attributes, key, &constraint.value, as_of)
                    .then_some(*key)
            })?;
            (CandidateFactState::Confirmed, matched)
        }
        ConstraintKind::LocationRequirement => {
            let expected = exact_enum_value(&constraint.value)?;
            let state = if normalized(expected) == normalized(&source.service_area) {
                CandidateFactState::Confirmed
            } else {
                CandidateFactState::ExplicitlyAbsent
            };
            (state, "service_area")
        }
        ConstraintKind::CategoryPriority => {
            let expected = exact_enum_value(&constraint.value)?;
            let state = if normalized(expected) == normalized(&source.category) {
                CandidateFactState::Confirmed
            } else {
                CandidateFactState::ExplicitlyAbsent
            };
            (state, "category")
        }
        _ => return None,
    };
    Some(CandidateEvidenceFact {
        kind: constraint.kind.clone(),
        state,
        value: constraint.value.clone(),
        evidence_ref: directory_evidence_ref(source, evidence_key, revision_ref),
        candidate_revision_ref: revision_ref.to_string(),
        aggregate_count: private_aggregate_count(constraint),
    })
}

fn boolean_attribute_state(
    attributes: &[DirectoryAttributeEvidence],
    key: &str,
    as_of: &chrono::DateTime<chrono::FixedOffset>,
) -> Option<CandidateFactState> {
    let attribute = usable_attribute(attributes, key, as_of)?;
    attribute.value.as_ref()?.as_bool().map(|value| {
        if value {
            CandidateFactState::Confirmed
        } else {
            CandidateFactState::ExplicitlyAbsent
        }
    })
}

fn tags_attribute_matches(
    attributes: &[DirectoryAttributeEvidence],
    key: &str,
    expected: &ConstraintValue,
    as_of: &chrono::DateTime<chrono::FixedOffset>,
) -> bool {
    let Some(attribute) = usable_attribute(attributes, key, as_of) else {
        return false;
    };
    let Some(values) = attribute.value.as_ref().and_then(Value::as_array) else {
        return false;
    };
    let actual = values
        .iter()
        .filter_map(Value::as_str)
        .map(normalized)
        .collect::<std::collections::BTreeSet<_>>();
    match expected {
        ConstraintValue::Enum { value, .. } => actual.contains(&normalized(value)),
        ConstraintValue::EnumList { values, .. } => {
            !values.is_empty() && values.iter().all(|value| actual.contains(&normalized(value)))
        }
        _ => false,
    }
}

fn usable_attribute<'a>(
    attributes: &'a [DirectoryAttributeEvidence],
    key: &str,
    as_of: &chrono::DateTime<chrono::FixedOffset>,
) -> Option<&'a DirectoryAttributeEvidence> {
    attributes.iter().find(|attribute| {
        attribute.key == key
            && attribute.status == "known"
            && attribute.value.is_some()
            && !attribute
                .valid_until
                .as_deref()
                .and_then(|value| parse_time(value, "valid_until").ok())
                .is_some_and(|value| value < *as_of)
    })
}

fn exact_enum_value(value: &ConstraintValue) -> Option<&str> {
    match value {
        ConstraintValue::Enum { value, .. } => Some(value.as_str()),
        _ => None,
    }
}

fn normalized(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .replace([' ', '-'], "_")
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

fn directory_revision_ref(
    source: &DirectoryCandidateEvidence,
    attributes: &[DirectoryAttributeEvidence],
    freshness: &[(&String, bool)],
) -> String {
    let canonical = crate::crypto::canonical_json_string(&serde_json::json!({
        "candidate_ref": source.candidate_ref,
        "category": source.category,
        "service_area": source.service_area,
        "updated_at": source.updated_at,
        "attributes": attributes,
        "freshness": freshness,
    }));
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    format!("directory:{}:revision:{}", source.candidate_ref, &digest[..32])
}

fn directory_evidence_ref(
    source: &DirectoryCandidateEvidence,
    evidence_key: &str,
    revision_ref: &str,
) -> String {
    let canonical = crate::crypto::canonical_json_string(&serde_json::json!({
        "candidate_ref": source.candidate_ref,
        "evidence_key": evidence_key,
        "revision_ref": revision_ref,
    }));
    let digest = hex::encode(Sha256::digest(canonical.as_bytes()));
    format!("directory_evidence:{}", &digest[..32])
}

fn parse_time(
    value: &str,
    label: &str,
) -> Result<chrono::DateTime<chrono::FixedOffset>, String> {
    chrono::DateTime::parse_from_rfc3339(value)
        .or_else(|_| chrono::DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f%#z"))
        .map_err(|_| format!("{label} is invalid"))
}

fn identifier(value: &str, label: &str) -> Result<(), String> {
    (!value.trim().is_empty()
        && value.len() <= 180
        && !value.contains('@')
        && !value.chars().any(char::is_whitespace))
        .then_some(())
        .ok_or_else(|| format!("{label} is invalid"))
}

#[cfg(test)]
mod tests {
    use crate::planning_intelligence::{
        ConstraintAuthority, ConstraintOperator, ConstraintStrength, SourceAnchor,
        SubjectReference, CONSTRAINT_SCHEMA_VERSION,
    };

    use super::*;

    fn constraint(kind: ConstraintKind, value: &str) -> PlanningConstraint {
        PlanningConstraint {
            schema_version: CONSTRAINT_SCHEMA_VERSION.to_string(),
            constraint_id: format!("constraint:{value}"),
            template_id: "event".to_string(),
            plan_id: "plan:one".to_string(),
            subject_ref: SubjectReference { kind: SubjectKind::Plan, id: "plan:one".to_string() },
            kind,
            operator: ConstraintOperator::Requires,
            value: ConstraintValue::Enum { value: value.to_string(), vocabulary: "directory.v1".to_string() },
            strength: ConstraintStrength::Hard,
            authority: ConstraintAuthority::User,
            privacy: ConstraintPrivacy::PlanPrivate,
            source_ref: "source:one".to_string(),
            source_anchor: SourceAnchor { message_id: "source:one".to_string(), source_version_id: None, locator: "body".to_string(), exact_excerpt: value.to_string() },
            observed_at: "2026-10-19T00:00:00Z".to_string(),
            effective_window: None,
            status: ConstraintStatus::Confirmed,
            supersedes: None,
        }
    }

    fn source(attributes: Vec<DirectoryAttributeEvidence>) -> DirectoryCandidateEvidence {
        DirectoryCandidateEvidence {
            candidate_ref: "vendor:one".to_string(),
            category: "venue".to_string(),
            service_area: "Sydney".to_string(),
            updated_at: "2026-10-19T00:00:00Z".to_string(),
            attributes,
        }
    }

    fn attribute(key: &str, value: Value) -> DirectoryAttributeEvidence {
        DirectoryAttributeEvidence {
            key: key.to_string(),
            value: Some(value),
            status: "known".to_string(),
            authority: "primary_official".to_string(),
            retrieved_at: "2026-10-19T01:00:00Z".to_string(),
            valid_until: None,
        }
    }

    #[test]
    fn exact_boolean_service_facts_project_without_widening_accessibility() {
        let constraints = vec![
            constraint(ConstraintKind::ServiceRequirement, "ceremony_on_site"),
            constraint(ConstraintKind::AccessibilityRequirement, "step_free"),
        ];
        let snapshot = project_directory_candidate_snapshot(
            &constraints,
            &source(vec![attribute("ceremony_on_site", serde_json::json!(false))]),
            "2026-10-19T02:00:00Z",
        ).expect("snapshot");
        assert_eq!(snapshot.facts.len(), 1);
        assert_eq!(snapshot.facts[0].state, CandidateFactState::ExplicitlyAbsent);
        assert_eq!(snapshot.facts[0].kind, ConstraintKind::ServiceRequirement);
    }

    #[test]
    fn matching_style_tags_confirm_but_missing_tags_stay_unknown() {
        let constraints = vec![
            constraint(ConstraintKind::AestheticPreference, "garden"),
            constraint(ConstraintKind::AestheticPreference, "waterfront"),
        ];
        let snapshot = project_directory_candidate_snapshot(
            &constraints,
            &source(vec![attribute("style_tags", serde_json::json!(["garden"]))]),
            "2026-10-19T02:00:00Z",
        ).expect("snapshot");
        assert_eq!(snapshot.facts.len(), 1);
        assert_eq!(snapshot.facts[0].value, constraints[0].value);
    }

    #[test]
    fn expired_attributes_do_not_become_facts_and_change_revision() {
        let constraint = constraint(ConstraintKind::ServiceRequirement, "ceremony_on_site");
        let mut evidence = attribute("ceremony_on_site", serde_json::json!(true));
        evidence.valid_until = Some("2026-10-20T00:00:00Z".to_string());
        let candidate = source(vec![evidence]);
        let fresh = project_directory_candidate_snapshot(
            std::slice::from_ref(&constraint), &candidate, "2026-10-19T02:00:00Z",
        ).expect("fresh");
        let expired = project_directory_candidate_snapshot(
            &[constraint], &candidate, "2026-10-21T02:00:00Z",
        ).expect("expired");
        assert_eq!(fresh.facts.len(), 1);
        assert!(expired.facts.is_empty());
        assert_ne!(fresh.revision_ref, expired.revision_ref);
    }

    #[test]
    fn input_order_does_not_change_directory_revision() {
        let constraints = vec![constraint(ConstraintKind::ServiceRequirement, "parking")];
        let first = attribute("parking", serde_json::json!(true));
        let second = attribute("ceremony_on_site", serde_json::json!(true));
        let left = project_directory_candidate_snapshot(
            &constraints, &source(vec![first.clone(), second.clone()]), "2026-10-19T02:00:00Z",
        ).expect("left");
        let right = project_directory_candidate_snapshot(
            &constraints, &source(vec![second, first]), "2026-10-19T02:00:00Z",
        ).expect("right");
        assert_eq!(left, right);
    }
}
