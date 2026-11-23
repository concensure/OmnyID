/*
 * @module-id: rust.simulator-rollout
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use std::env;

pub const SIMULATOR_ROLLOUT_STAGE_SHADOW: &str = "shadow";
pub const SIMULATOR_ROLLOUT_STAGE_REVIEW: &str = "review";
pub const SIMULATOR_ROLLOUT_STAGE_PROMOTION: &str = "promotion";

pub const SIMULATOR_CALIBRATION_MODE_SHADOW_ONLY: &str = "shadow_only";
pub const SIMULATOR_CALIBRATION_MODE_BOUNDED_DETERMINISTIC: &str = "bounded_deterministic";
pub const SIMULATOR_CALIBRATION_MODE_SAMPLED_PREVIEW: &str = "sampled_preview";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SimulatorRolloutSurface {
    Planning,
    Synthesizer,
    Watcher,
}

impl SimulatorRolloutSurface {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Planning => "planning",
            Self::Synthesizer => "synthesizer",
            Self::Watcher => "watcher",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SimulatorRolloutPolicy {
    pub surface: SimulatorRolloutSurface,
    pub enabled: bool,
    pub allow_promotion: bool,
    pub probabilistic_sampling_enabled: bool,
    pub review_surfaces_enabled: bool,
    pub rollout_stage: String,
    pub calibration_mode: String,
}

impl SimulatorRolloutPolicy {
    pub fn disabled_summary(&self) -> String {
        format!(
            "Simulator preview disabled for {} by rollout policy.",
            self.surface.as_str()
        )
    }
}

pub fn load_simulator_rollout_policy(surface: SimulatorRolloutSurface) -> SimulatorRolloutPolicy {
    let defaults = default_simulator_rollout_policy(surface);
    let enabled = env_flag(
        "OMNYID_ENABLE_SIMULATOR",
        env_flag(surface_enabled_env(surface), defaults.enabled),
    );
    let allow_promotion = env_flag(
        "OMNYID_ENABLE_SIMULATOR_PROMOTION",
        env_flag(surface_promotion_env(surface), defaults.allow_promotion),
    );
    let probabilistic_sampling_enabled = env_flag(
        "OMNYID_ENABLE_SIMULATOR_SAMPLING",
        env_flag(
            surface_sampling_env(surface),
            defaults.probabilistic_sampling_enabled,
        ),
    );
    let review_surfaces_enabled = env_flag(
        "OMNYID_ENABLE_SIMULATOR_REVIEW_SURFACES",
        env_flag(
            surface_review_surfaces_env(surface),
            defaults.review_surfaces_enabled,
        ),
    );
    let rollout_stage = env_string(
        "OMNYID_SIMULATOR_ROLLOUT_STAGE",
        env_string(
            surface_rollout_stage_env(surface),
            defaults.rollout_stage.clone(),
            normalize_rollout_stage,
        ),
        normalize_rollout_stage,
    );
    let calibration_mode = env_string(
        "OMNYID_SIMULATOR_CALIBRATION_MODE",
        env_string(
            surface_calibration_mode_env(surface),
            defaults.calibration_mode.clone(),
            normalize_calibration_mode,
        ),
        normalize_calibration_mode,
    );

    SimulatorRolloutPolicy {
        surface,
        enabled,
        allow_promotion,
        probabilistic_sampling_enabled,
        review_surfaces_enabled,
        rollout_stage,
        calibration_mode,
    }
}

pub fn default_simulator_rollout_policy(
    surface: SimulatorRolloutSurface,
) -> SimulatorRolloutPolicy {
    match surface {
        SimulatorRolloutSurface::Planning => SimulatorRolloutPolicy {
            surface,
            enabled: true,
            allow_promotion: false,
            probabilistic_sampling_enabled: false,
            review_surfaces_enabled: false,
            rollout_stage: SIMULATOR_ROLLOUT_STAGE_SHADOW.to_string(),
            calibration_mode: SIMULATOR_CALIBRATION_MODE_BOUNDED_DETERMINISTIC.to_string(),
        },
        SimulatorRolloutSurface::Synthesizer => SimulatorRolloutPolicy {
            surface,
            enabled: true,
            allow_promotion: true,
            probabilistic_sampling_enabled: false,
            review_surfaces_enabled: true,
            rollout_stage: SIMULATOR_ROLLOUT_STAGE_REVIEW.to_string(),
            calibration_mode: SIMULATOR_CALIBRATION_MODE_BOUNDED_DETERMINISTIC.to_string(),
        },
        SimulatorRolloutSurface::Watcher => SimulatorRolloutPolicy {
            surface,
            enabled: false,
            allow_promotion: false,
            probabilistic_sampling_enabled: false,
            review_surfaces_enabled: false,
            rollout_stage: SIMULATOR_ROLLOUT_STAGE_SHADOW.to_string(),
            calibration_mode: SIMULATOR_CALIBRATION_MODE_SHADOW_ONLY.to_string(),
        },
    }
}

fn env_flag(name: &str, default: bool) -> bool {
    match env::var(name) {
        Ok(value) => parse_env_flag(&value).unwrap_or(default),
        Err(_) => default,
    }
}

fn parse_env_flag(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Some(true),
        "0" | "false" | "no" | "off" => Some(false),
        _ => None,
    }
}

fn env_string<F>(name: &str, default: String, normalize: F) -> String
where
    F: Fn(&str) -> Option<&'static str>,
{
    match env::var(name) {
        Ok(value) => normalize(&value).map(str::to_string).unwrap_or(default),
        Err(_) => default,
    }
}

fn normalize_rollout_stage(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        SIMULATOR_ROLLOUT_STAGE_SHADOW => Some(SIMULATOR_ROLLOUT_STAGE_SHADOW),
        SIMULATOR_ROLLOUT_STAGE_REVIEW => Some(SIMULATOR_ROLLOUT_STAGE_REVIEW),
        SIMULATOR_ROLLOUT_STAGE_PROMOTION => Some(SIMULATOR_ROLLOUT_STAGE_PROMOTION),
        _ => None,
    }
}

fn normalize_calibration_mode(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        SIMULATOR_CALIBRATION_MODE_SHADOW_ONLY => Some(SIMULATOR_CALIBRATION_MODE_SHADOW_ONLY),
        SIMULATOR_CALIBRATION_MODE_BOUNDED_DETERMINISTIC => {
            Some(SIMULATOR_CALIBRATION_MODE_BOUNDED_DETERMINISTIC)
        }
        SIMULATOR_CALIBRATION_MODE_SAMPLED_PREVIEW => {
            Some(SIMULATOR_CALIBRATION_MODE_SAMPLED_PREVIEW)
        }
        _ => None,
    }
}

fn surface_enabled_env(surface: SimulatorRolloutSurface) -> &'static str {
    match surface {
        SimulatorRolloutSurface::Planning => "OMNYID_ENABLE_PLANNING_SIMULATOR",
        SimulatorRolloutSurface::Synthesizer => "OMNYID_ENABLE_SYNTHESIZER_SIMULATOR",
        SimulatorRolloutSurface::Watcher => "OMNYID_ENABLE_WATCHER_SIMULATOR",
    }
}

fn surface_promotion_env(surface: SimulatorRolloutSurface) -> &'static str {
    match surface {
        SimulatorRolloutSurface::Planning => "OMNYID_ENABLE_PLANNING_SIMULATOR_PROMOTION",
        SimulatorRolloutSurface::Synthesizer => "OMNYID_ENABLE_SYNTHESIZER_SIMULATOR_PROMOTION",
        SimulatorRolloutSurface::Watcher => "OMNYID_ENABLE_WATCHER_SIMULATOR_PROMOTION",
    }
}

fn surface_review_surfaces_env(surface: SimulatorRolloutSurface) -> &'static str {
    match surface {
        SimulatorRolloutSurface::Planning => "OMNYID_ENABLE_PLANNING_SIMULATOR_REVIEW_SURFACES",
        SimulatorRolloutSurface::Synthesizer => {
            "OMNYID_ENABLE_SYNTHESIZER_SIMULATOR_REVIEW_SURFACES"
        }
        SimulatorRolloutSurface::Watcher => "OMNYID_ENABLE_WATCHER_SIMULATOR_REVIEW_SURFACES",
    }
}

fn surface_rollout_stage_env(surface: SimulatorRolloutSurface) -> &'static str {
    match surface {
        SimulatorRolloutSurface::Planning => "OMNYID_PLANNING_SIMULATOR_ROLLOUT_STAGE",
        SimulatorRolloutSurface::Synthesizer => "OMNYID_SYNTHESIZER_SIMULATOR_ROLLOUT_STAGE",
        SimulatorRolloutSurface::Watcher => "OMNYID_WATCHER_SIMULATOR_ROLLOUT_STAGE",
    }
}

fn surface_calibration_mode_env(surface: SimulatorRolloutSurface) -> &'static str {
    match surface {
        SimulatorRolloutSurface::Planning => "OMNYID_PLANNING_SIMULATOR_CALIBRATION_MODE",
        SimulatorRolloutSurface::Synthesizer => "OMNYID_SYNTHESIZER_SIMULATOR_CALIBRATION_MODE",
        SimulatorRolloutSurface::Watcher => "OMNYID_WATCHER_SIMULATOR_CALIBRATION_MODE",
    }
}

fn surface_sampling_env(surface: SimulatorRolloutSurface) -> &'static str {
    match surface {
        SimulatorRolloutSurface::Planning => "OMNYID_ENABLE_PLANNING_SIMULATOR_SAMPLING",
        SimulatorRolloutSurface::Synthesizer => "OMNYID_ENABLE_SYNTHESIZER_SIMULATOR_SAMPLING",
        SimulatorRolloutSurface::Watcher => "OMNYID_ENABLE_WATCHER_SIMULATOR_SAMPLING",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_rollout_policy_keeps_synthesizer_on_and_watcher_off() {
        let planning = default_simulator_rollout_policy(SimulatorRolloutSurface::Planning);
        let synthesizer = default_simulator_rollout_policy(SimulatorRolloutSurface::Synthesizer);
        let watcher = default_simulator_rollout_policy(SimulatorRolloutSurface::Watcher);

        assert!(planning.enabled);
        assert!(!planning.allow_promotion);
        assert!(!planning.probabilistic_sampling_enabled);
        assert!(!planning.review_surfaces_enabled);
        assert_eq!(planning.rollout_stage, SIMULATOR_ROLLOUT_STAGE_SHADOW);
        assert_eq!(
            planning.calibration_mode,
            SIMULATOR_CALIBRATION_MODE_BOUNDED_DETERMINISTIC
        );

        assert!(synthesizer.enabled);
        assert!(synthesizer.allow_promotion);
        assert!(!synthesizer.probabilistic_sampling_enabled);
        assert!(synthesizer.review_surfaces_enabled);
        assert_eq!(synthesizer.rollout_stage, SIMULATOR_ROLLOUT_STAGE_REVIEW);
        assert_eq!(
            synthesizer.calibration_mode,
            SIMULATOR_CALIBRATION_MODE_BOUNDED_DETERMINISTIC
        );

        assert!(!watcher.enabled);
        assert!(!watcher.allow_promotion);
        assert!(!watcher.probabilistic_sampling_enabled);
        assert!(!watcher.review_surfaces_enabled);
        assert_eq!(watcher.rollout_stage, SIMULATOR_ROLLOUT_STAGE_SHADOW);
        assert_eq!(
            watcher.calibration_mode,
            SIMULATOR_CALIBRATION_MODE_SHADOW_ONLY
        );
    }

    #[test]
    fn rollout_stage_and_calibration_values_are_normalized() {
        assert_eq!(
            normalize_rollout_stage("  review "),
            Some(SIMULATOR_ROLLOUT_STAGE_REVIEW)
        );
        assert_eq!(
            normalize_calibration_mode(" sampled_preview "),
            Some(SIMULATOR_CALIBRATION_MODE_SAMPLED_PREVIEW)
        );
        assert_eq!(normalize_rollout_stage("surprise"), None);
        assert_eq!(normalize_calibration_mode("chaos"), None);
    }
}
