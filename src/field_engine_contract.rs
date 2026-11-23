/*
 * @module-id: rust.field-engine-contract
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde::{Deserialize, Serialize};

pub const FIELD_ENGINE_CONTRACT_VERSION: &str = "field-engine.v1";
pub const FIELD_ENGINE_DEFAULT_FIELD_CAP: usize = 24;
pub const FIELD_ENGINE_DEFAULT_CONTRIBUTION_CAP: usize = 12;

pub const FIELD_TYPE_ATTENTION: &str = "attention";
pub const FIELD_TYPE_INTEREST: &str = "interest";
pub const FIELD_TYPE_PROJECT: &str = "project";
pub const FIELD_TYPE_RELATIONSHIP: &str = "relationship";
pub const FIELD_TYPE_KNOWLEDGE: &str = "knowledge";
pub const FIELD_TYPE_DECISION: &str = "decision";
pub const FIELD_TYPE_OPPORTUNITY: &str = "opportunity";
pub const FIELD_TYPE_OBLIGATION: &str = "obligation";
pub const FIELD_TYPE_GOAL: &str = "goal";

pub fn normalize_field_type(value: &str) -> Option<&'static str> {
    let normalized = value.trim().to_ascii_lowercase();
    for (field_type, summary_label) in [
        (FIELD_TYPE_ATTENTION, "attention field"),
        (FIELD_TYPE_INTEREST, "interest field"),
        (FIELD_TYPE_PROJECT, "project field"),
        (FIELD_TYPE_RELATIONSHIP, "relationship field"),
        (FIELD_TYPE_KNOWLEDGE, "knowledge field"),
        (FIELD_TYPE_DECISION, "decision field"),
        (FIELD_TYPE_OPPORTUNITY, "opportunity field"),
        (FIELD_TYPE_OBLIGATION, "obligation field"),
        (FIELD_TYPE_GOAL, "goal field"),
    ] {
        if normalized == field_type || normalized.starts_with(summary_label) {
            return Some(field_type);
        }
    }
    None
}

pub fn field_type_from_primary_or_summary(
    primary_type: Option<&str>,
    summary: Option<&str>,
) -> Option<&'static str> {
    primary_type.and_then(normalize_field_type).or_else(|| {
        summary.and_then(|value| {
            let trimmed = value.trim();
            let prefix = trimmed.split(':').next().unwrap_or(trimmed);
            normalize_field_type(prefix)
        })
    })
}

pub fn field_type_pressure_label(field_type: &str) -> Option<&'static str> {
    match normalize_field_type(field_type) {
        Some(FIELD_TYPE_ATTENTION) => Some("Attention pressure"),
        Some(FIELD_TYPE_INTEREST) => Some("Interest pressure"),
        Some(FIELD_TYPE_PROJECT) => Some("Project pressure"),
        Some(FIELD_TYPE_RELATIONSHIP) => Some("Relationship pressure"),
        Some(FIELD_TYPE_KNOWLEDGE) => Some("Knowledge pressure"),
        Some(FIELD_TYPE_DECISION) => Some("Decision pressure"),
        Some(FIELD_TYPE_OPPORTUNITY) => Some("Opportunity pressure"),
        Some(FIELD_TYPE_OBLIGATION) => Some("Obligation pressure"),
        Some(FIELD_TYPE_GOAL) => Some("Goal pressure"),
        _ => None,
    }
}

fn clamp_unit(value: f32) -> f32 {
    value.clamp(0.0, 1.0)
}

fn clamp_signed_unit(value: f32) -> f32 {
    value.clamp(-1.0, 1.0)
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct FieldEngineGuardrails {
    pub field_cap: usize,
    pub contribution_cap: usize,
}

impl Default for FieldEngineGuardrails {
    fn default() -> Self {
        Self {
            field_cap: FIELD_ENGINE_DEFAULT_FIELD_CAP,
            contribution_cap: FIELD_ENGINE_DEFAULT_CONTRIBUTION_CAP,
        }
    }
}

impl FieldEngineGuardrails {
    pub fn normalized(self) -> Self {
        Self {
            field_cap: self.field_cap.clamp(1, FIELD_ENGINE_DEFAULT_FIELD_CAP),
            contribution_cap: self
                .contribution_cap
                .clamp(1, FIELD_ENGINE_DEFAULT_CONTRIBUTION_CAP),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct FieldSignal {
    pub field_id: String,
    pub field_type: String,
    pub scope_ref: String,
    pub density: f32,
    pub momentum: f32,
    pub acceleration: f32,
    pub confidence: f32,
    #[serde(default)]
    pub contributing_objects: Vec<String>,
    #[serde(default)]
    pub contributing_interactions: Vec<String>,
    pub decay_rate: f32,
    pub projected_direction: f32,
    pub projected_risk: f32,
    pub projected_opportunity: f32,
    pub updated_at: String,
}

impl FieldSignal {
    pub fn normalized(mut self, guardrails: &FieldEngineGuardrails) -> Self {
        self.density = clamp_unit(self.density);
        self.momentum = clamp_signed_unit(self.momentum);
        self.acceleration = clamp_signed_unit(self.acceleration);
        self.confidence = clamp_unit(self.confidence);
        self.decay_rate = clamp_unit(self.decay_rate);
        self.projected_direction = clamp_signed_unit(self.projected_direction);
        self.projected_risk = clamp_unit(self.projected_risk);
        self.projected_opportunity = clamp_unit(self.projected_opportunity);
        self.contributing_objects
            .truncate(guardrails.contribution_cap);
        self.contributing_interactions
            .truncate(guardrails.contribution_cap);
        self
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct FieldEngineSnapshot {
    pub contract_version: String,
    #[serde(default)]
    pub fields: Vec<FieldSignal>,
    #[serde(default)]
    pub guardrails: FieldEngineGuardrails,
}

impl Default for FieldEngineSnapshot {
    fn default() -> Self {
        Self {
            contract_version: FIELD_ENGINE_CONTRACT_VERSION.to_string(),
            fields: Vec::new(),
            guardrails: FieldEngineGuardrails::default(),
        }
    }
}

impl FieldEngineSnapshot {
    pub fn normalized(mut self) -> Self {
        self.guardrails = self.guardrails.normalized();
        self.fields = self
            .fields
            .into_iter()
            .take(self.guardrails.field_cap)
            .map(|field| field.normalized(&self.guardrails))
            .collect();
        self
    }
}

pub fn field_signal(
    field_id: impl Into<String>,
    field_type: impl Into<String>,
    scope_ref: impl Into<String>,
    updated_at: impl Into<String>,
) -> FieldSignal {
    FieldSignal {
        field_id: field_id.into(),
        field_type: field_type.into(),
        scope_ref: scope_ref.into(),
        updated_at: updated_at.into(),
        ..FieldSignal::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_engine_snapshot_normalizes_caps_and_scalars() {
        let snapshot = FieldEngineSnapshot {
            contract_version: FIELD_ENGINE_CONTRACT_VERSION.to_string(),
            fields: vec![FieldSignal {
                field_id: "relationship:aurora".to_string(),
                field_type: FIELD_TYPE_RELATIONSHIP.to_string(),
                scope_ref: "thread:aurora".to_string(),
                density: 2.0,
                momentum: 4.0,
                acceleration: -4.0,
                confidence: -1.0,
                contributing_objects: (0..20).map(|i| format!("obj_{i}")).collect(),
                contributing_interactions: (0..20).map(|i| format!("msg_{i}")).collect(),
                decay_rate: 3.0,
                projected_direction: -3.0,
                projected_risk: 4.0,
                projected_opportunity: -2.0,
                updated_at: "2026-06-20T12:00:00Z".to_string(),
            }],
            guardrails: FieldEngineGuardrails {
                field_cap: 999,
                contribution_cap: 999,
            },
        }
        .normalized();

        let field = &snapshot.fields[0];
        assert_eq!(snapshot.guardrails, FieldEngineGuardrails::default());
        assert_eq!(field.density, 1.0);
        assert_eq!(field.momentum, 1.0);
        assert_eq!(field.acceleration, -1.0);
        assert_eq!(field.confidence, 0.0);
        assert_eq!(field.decay_rate, 1.0);
        assert_eq!(field.projected_direction, -1.0);
        assert_eq!(field.projected_risk, 1.0);
        assert_eq!(field.projected_opportunity, 0.0);
        assert_eq!(
            field.contributing_objects.len(),
            FIELD_ENGINE_DEFAULT_CONTRIBUTION_CAP
        );
        assert_eq!(
            field.contributing_interactions.len(),
            FIELD_ENGINE_DEFAULT_CONTRIBUTION_CAP
        );
    }

    #[test]
    fn field_engine_snapshot_truncates_field_count() {
        let snapshot = FieldEngineSnapshot {
            fields: (0..40)
                .map(|i| {
                    field_signal(
                        format!("project:{i}"),
                        FIELD_TYPE_PROJECT,
                        format!("thread:{i}"),
                        "2026-06-20T12:00:00Z",
                    )
                })
                .collect(),
            ..FieldEngineSnapshot::default()
        }
        .normalized();

        assert_eq!(snapshot.fields.len(), FIELD_ENGINE_DEFAULT_FIELD_CAP);
    }

    #[test]
    fn normalize_field_type_accepts_primary_and_summary_forms() {
        assert_eq!(
            normalize_field_type("attention"),
            Some(FIELD_TYPE_ATTENTION)
        );
        assert_eq!(
            normalize_field_type("Attention field"),
            Some(FIELD_TYPE_ATTENTION)
        );
        assert_eq!(
            normalize_field_type("obligation"),
            Some(FIELD_TYPE_OBLIGATION)
        );
        assert_eq!(
            normalize_field_type("Obligation field"),
            Some(FIELD_TYPE_OBLIGATION)
        );
        assert_eq!(
            normalize_field_type("knowledge"),
            Some(FIELD_TYPE_KNOWLEDGE)
        );
        assert_eq!(
            normalize_field_type("Knowledge field"),
            Some(FIELD_TYPE_KNOWLEDGE)
        );
        assert_eq!(normalize_field_type("unknown"), None);
    }

    #[test]
    fn field_type_from_primary_or_summary_prefers_primary_type() {
        assert_eq!(
            field_type_from_primary_or_summary(
                Some("obligation"),
                Some("Knowledge field: refresh context before deciding")
            ),
            Some(FIELD_TYPE_OBLIGATION)
        );
    }

    #[test]
    fn field_type_from_primary_or_summary_falls_back_to_summary_prefix() {
        assert_eq!(
            field_type_from_primary_or_summary(
                None,
                Some("Knowledge field: stale evidence is limiting confidence")
            ),
            Some(FIELD_TYPE_KNOWLEDGE)
        );
        assert_eq!(
            field_type_from_primary_or_summary(
                Some(""),
                Some("Attention field: queue fragmentation is increasing")
            ),
            Some(FIELD_TYPE_ATTENTION)
        );
    }

    #[test]
    fn field_type_from_primary_or_summary_returns_none_for_unknown_values() {
        assert_eq!(
            field_type_from_primary_or_summary(
                Some(""),
                Some("Legacy synthesis: queue pressure remains elevated")
            ),
            None
        );
    }

    #[test]
    fn field_type_pressure_label_humanizes_known_field_types() {
        assert_eq!(
            field_type_pressure_label(FIELD_TYPE_ATTENTION),
            Some("Attention pressure")
        );
        assert_eq!(
            field_type_pressure_label("Obligation field"),
            Some("Obligation pressure")
        );
        assert_eq!(
            field_type_pressure_label(FIELD_TYPE_DECISION),
            Some("Decision pressure")
        );
        assert_eq!(field_type_pressure_label("unknown"), None);
    }
}
