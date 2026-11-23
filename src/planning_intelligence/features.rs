#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PlanningIntelligenceFeatureFlags {
    pub constraint_ledger: bool,
    pub constraint_capture: bool,
    pub evaluation: bool,
    pub cost_tradeoffs: bool,
    pub critical_path: bool,
    pub vendor_changes: bool,
    pub interventions: bool,
}

fn enabled(value: Option<String>) -> bool {
    value.is_some_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes"
        )
    })
}

impl PlanningIntelligenceFeatureFlags {
    pub fn from_env() -> Self {
        Self {
            constraint_ledger: enabled(
                std::env::var("OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED").ok(),
            ),
            constraint_capture: enabled(
                std::env::var("OMNYID_PLANNING_CONSTRAINT_CAPTURE_ENABLED").ok(),
            ),
            evaluation: enabled(std::env::var("OMNYID_PLANNING_EVALUATION_ENABLED").ok()),
            cost_tradeoffs: enabled(std::env::var("OMNYID_PLANNING_COST_TRADEOFFS_ENABLED").ok()),
            critical_path: enabled(std::env::var("OMNYID_PLANNING_CRITICAL_PATH_ENABLED").ok()),
            vendor_changes: enabled(std::env::var("OMNYID_PLANNING_VENDOR_CHANGES_ENABLED").ok()),
            interventions: enabled(std::env::var("OMNYID_PLANNING_INTERVENTIONS_ENABLED").ok()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{PlanningIntelligenceFeatureFlags, enabled};

    #[test]
    fn flags_default_off_and_require_explicit_truthy_values() {
        assert_eq!(
            PlanningIntelligenceFeatureFlags::default(),
            PlanningIntelligenceFeatureFlags {
                constraint_ledger: false,
                constraint_capture: false,
                evaluation: false,
                cost_tradeoffs: false,
                critical_path: false,
                vendor_changes: false,
                interventions: false,
            }
        );
        assert!(!enabled(None));
        assert!(!enabled(Some("off".to_string())));
        assert!(enabled(Some("true".to_string())));
    }
}
