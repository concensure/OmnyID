/*
 * @module-id: rust.signal-scoring
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use serde::{Deserialize, Serialize};

use crate::proactive_outcome_memory::HeuristicOutcomeFeedback;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SignalTier {
    Noise,
    Ambient,
    Notable,
    Urgent,
    Critical,
}

impl SignalTier {
    pub fn as_str(self) -> &'static str {
        match self {
            SignalTier::Noise => "noise",
            SignalTier::Ambient => "ambient",
            SignalTier::Notable => "notable",
            SignalTier::Urgent => "urgent",
            SignalTier::Critical => "critical",
        }
    }

    pub fn from_score(score: f64) -> Self {
        let score = score.clamp(0.0, 1.0);
        if score < 0.30 {
            SignalTier::Noise
        } else if score < 0.55 {
            SignalTier::Ambient
        } else if score < 0.72 {
            SignalTier::Notable
        } else if score < 0.88 {
            SignalTier::Urgent
        } else {
            SignalTier::Critical
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct UnifiedSignalScore {
    pub raw: f64,
    pub calibrated: f64,
    pub tier: SignalTier,
}

impl UnifiedSignalScore {
    pub fn from_raw(raw: f64) -> Self {
        let raw = raw.clamp(0.0, 1.0);
        Self {
            raw,
            calibrated: raw,
            tier: SignalTier::from_score(raw),
        }
    }

    pub fn from_feedback(raw: f64, feedback: Option<&HeuristicOutcomeFeedback>) -> Self {
        let raw = raw.clamp(0.0, 1.0);
        let calibrated = (raw * feedback_score_multiplier(feedback)).clamp(0.0, 1.0);
        Self {
            raw,
            calibrated,
            tier: SignalTier::from_score(calibrated),
        }
    }
}

pub fn feedback_score_multiplier(feedback: Option<&HeuristicOutcomeFeedback>) -> f64 {
    let Some(feedback) = feedback else {
        return 1.0;
    };

    let mut multiplier = 0.85 + (feedback.acceptance_rate.clamp(0.0, 1.0) * 0.30);
    multiplier += match feedback.status.as_str() {
        "reinforced" | "trusted" => 0.06,
        "cooldown_recommended" => -0.08,
        "suppressed" => -0.16,
        _ => 0.0,
    };

    if feedback.scope == "family" {
        multiplier -= 0.03;
    }

    multiplier.clamp(0.55, 1.20)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feedback(status: &str, acceptance_rate: f64, scope: &str) -> HeuristicOutcomeFeedback {
        HeuristicOutcomeFeedback {
            heuristic_id: "heuristic:test".to_string(),
            total: 10,
            accepted: (acceptance_rate * 10.0).round() as i64,
            acceptance_rate,
            status: status.to_string(),
            scope: scope.to_string(),
            suggested_suppression_hours: None,
            suggested_half_life_days: 3,
            adaptation_reason: None,
            threshold_delta: None,
            sample_count: None,
            adaptation_signals: Vec::new(),
        }
    }

    #[test]
    fn signal_tier_boundaries_match_contract() {
        assert_eq!(SignalTier::from_score(0.29), SignalTier::Noise);
        assert_eq!(SignalTier::from_score(0.30), SignalTier::Ambient);
        assert_eq!(SignalTier::from_score(0.55), SignalTier::Notable);
        assert_eq!(SignalTier::from_score(0.72), SignalTier::Urgent);
        assert_eq!(SignalTier::from_score(0.88), SignalTier::Critical);
    }

    #[test]
    fn unified_signal_score_uses_feedback_to_raise_reinforced_scores() {
        let score =
            UnifiedSignalScore::from_feedback(0.70, Some(&feedback("reinforced", 0.90, "exact")));
        assert!(score.calibrated > score.raw);
        assert_eq!(score.tier, SignalTier::Urgent);
    }

    #[test]
    fn unified_signal_score_uses_feedback_to_lower_suppressed_scores() {
        let score =
            UnifiedSignalScore::from_feedback(0.70, Some(&feedback("suppressed", 0.10, "family")));
        assert!(score.calibrated < score.raw);
        assert_eq!(score.tier, SignalTier::Ambient);
    }

    #[test]
    fn feedback_multiplier_clamps_extremes() {
        let score =
            UnifiedSignalScore::from_feedback(1.0, Some(&feedback("trusted", 1.0, "exact")));
        assert_eq!(score.calibrated, 1.0);

        let score =
            UnifiedSignalScore::from_feedback(0.10, Some(&feedback("suppressed", 0.0, "family")));
        assert!(score.calibrated >= 0.0);
    }
}
