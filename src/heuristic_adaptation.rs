/// Phase 8: Bayesian/EMA adaptation layer for proactive heuristic thresholds.
///
/// Builds on `ema_state::EmaAccumulator` to compute a bounded threshold delta
/// per heuristic. The delta tunes the base `confidence_threshold` defined in
/// the heuristic — it never replaces the deterministic policy.
///
/// Signal inputs (Task 31):
///   - suggestion acceptance / dismissal (EMA over proactive_outcomes)
///   - draft_usage_rate: fraction of prepared drafts the user actually sent
///   - undone_action_rate: fraction of executed actions the user later reverted
///   - topic_recurrence: normalised count of how often this heuristic fires
///   - queue_pressure: normalised queue depth (decision + response queue combined)
///
/// Threshold delta is clamped to [-0.20, +0.20] so the adapted threshold stays
/// within [0.10, 0.95] regardless of base value (Task 33: no opaque jumps).
use serde::{Deserialize, Serialize};

use crate::ema_state::EmaAccumulator;

// ── EMA hyper-parameter ───────────────────────────────────────────────────────

/// Recency weight for the acceptance-rate EMA.
/// 0.3 = each new outcome contributes 30 % of the new value.
pub const EMA_ALPHA: f64 = 0.3;

/// Minimum outcomes before adaptation has any effect.
pub const MIN_SIGNAL_SAMPLES: u32 = 3;

// ── Input signals ─────────────────────────────────────────────────────────────

/// All signals that feed the threshold adaptation for one heuristic.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HeuristicSignals {
    /// Running EMA of acceptance rate for this heuristic (0.0–1.0).
    /// Loaded from `heuristic_ema_state.ema_acceptance_rate`.
    pub ema_acceptance_rate: f64,
    /// Number of outcomes contributing to the EMA so far.
    pub sample_count: u32,
    /// Fraction of prepared drafts the user actually used (0.0–1.0).
    /// Defaults to 0.0 (neutral) when draft tracking is unavailable.
    pub draft_usage_rate: f64,
    /// Fraction of executed reversible actions the user later undid (0.0–1.0).
    pub undone_action_rate: f64,
    /// Normalised count of recent fires for this heuristic (0.0–1.0).
    /// High recurrence with low acceptance → raise threshold.
    pub topic_recurrence: f64,
    /// Normalised pending queue depth across decision + response queues (0.0–1.0).
    /// High pressure → lower threshold slightly to allow more helpful surfacing.
    pub queue_pressure: f64,
}

// ── Output ────────────────────────────────────────────────────────────────────

/// Result of computing the threshold adaptation for one heuristic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThresholdAdaptation {
    /// Adjustment to apply to the base `confidence_threshold` ([-0.20, +0.20]).
    pub threshold_delta: f64,
    /// Resulting threshold after applying delta and clamping to [0.10, 0.95].
    pub adapted_threshold: f64,
    /// Compact label for the reason behind the delta (Task 33).
    /// One of: "insufficient_signal" | "reinforced" | "trust_building" |
    ///         "suppression_active" | "cooldown_active" | "neutral"
    pub adaptation_reason: &'static str,
    /// The EMA acceptance rate used for the decision (for audit/display).
    pub ema_acceptance_rate: f64,
    /// Sample count at decision time.
    pub sample_count: u32,
}

// ── Core computation (Task 30 + 32) ──────────────────────────────────────────

/// Compute a bounded threshold adaptation from the given signals.
///
/// The base policy from `ProactiveHeuristic.confidence_threshold` is *tuned*,
/// not overridden. Callers apply the result via:
///   `effective_threshold = adaptation.adapted_threshold`
pub fn compute_threshold_adaptation(
    base_threshold: f64,
    signals: &HeuristicSignals,
) -> ThresholdAdaptation {
    if signals.sample_count < MIN_SIGNAL_SAMPLES {
        return ThresholdAdaptation {
            threshold_delta: 0.0,
            adapted_threshold: base_threshold.clamp(0.10, 0.95),
            adaptation_reason: "insufficient_signal",
            ema_acceptance_rate: signals.ema_acceptance_rate,
            sample_count: signals.sample_count,
        };
    }

    let ema = signals.ema_acceptance_rate.clamp(0.0, 1.0);

    // Primary signal: EMA acceptance rate maps to a base delta.
    let (base_delta, reason) = acceptance_rate_delta(ema);

    // Secondary modifiers: additional signals shift the base delta.
    let mut delta = base_delta;

    // High queue pressure → more permissive (user needs help clearing backlog).
    if signals.queue_pressure > 0.7 {
        delta -= 0.05;
    }

    // Frequent undos → user regrets actions → raise bar.
    if signals.undone_action_rate > 0.3 {
        delta += 0.05;
    }

    // High recurrence with neutral or poor acceptance → raise bar.
    if signals.topic_recurrence > 0.6 && ema < 0.5 {
        delta += 0.05;
    }

    // Draft usage moderates suppression: if user uses drafts despite low
    // acceptance, trust them more (don't suppress fully).
    if signals.draft_usage_rate > 0.5 && delta > 0.0 {
        delta -= 0.04;
    }

    let delta = delta.clamp(-0.20, 0.20);
    let adapted = (base_threshold + delta).clamp(0.10, 0.95);

    ThresholdAdaptation {
        threshold_delta: delta,
        adapted_threshold: adapted,
        adaptation_reason: reason,
        ema_acceptance_rate: ema,
        sample_count: signals.sample_count,
    }
}

/// Update an EMA accumulator with a new acceptance observation (0.0 or 1.0)
/// and return the updated EMA value.
///
/// Callers persist the returned value into `heuristic_ema_state`.
pub fn update_acceptance_ema(current_ema: f64, accepted: bool) -> f64 {
    let mut acc = EmaAccumulator::new(EMA_ALPHA, current_ema);
    acc.update(if accepted { 1.0 } else { 0.0 })
}

/// Convert queue lengths into a normalised 0–1 pressure score.
///
/// `combined_queue_depth` is the sum of pending decision and response items.
/// `max_expected` is the saturation point (default: 20 items = full pressure).
pub fn normalise_queue_pressure(combined_queue_depth: u32, max_expected: u32) -> f64 {
    let max = max_expected.max(1) as f64;
    (combined_queue_depth as f64 / max).clamp(0.0, 1.0)
}

// ── Private helpers ───────────────────────────────────────────────────────────

fn acceptance_rate_delta(ema: f64) -> (f64, &'static str) {
    if ema > 0.80 {
        (-0.10, "reinforced")
    } else if ema > 0.65 {
        (-0.05, "trust_building")
    } else if ema < 0.25 {
        (0.15, "suppression_active")
    } else if ema < 0.45 {
        (0.08, "cooldown_active")
    } else {
        (0.0, "neutral")
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn signals(ema: f64, count: u32) -> HeuristicSignals {
        HeuristicSignals {
            ema_acceptance_rate: ema,
            sample_count: count,
            ..Default::default()
        }
    }

    #[test]
    fn insufficient_signal_returns_no_delta() {
        let result = compute_threshold_adaptation(0.7, &signals(0.1, 2));
        assert_eq!(result.threshold_delta, 0.0);
        assert_eq!(result.adaptation_reason, "insufficient_signal");
        assert!((result.adapted_threshold - 0.7).abs() < 0.001);
    }

    #[test]
    fn high_acceptance_lowers_threshold() {
        let result = compute_threshold_adaptation(0.7, &signals(0.9, 10));
        assert_eq!(result.adaptation_reason, "reinforced");
        assert!(result.threshold_delta < 0.0);
        assert!((result.adapted_threshold - 0.60).abs() < 0.001);
    }

    #[test]
    fn low_acceptance_raises_threshold() {
        let result = compute_threshold_adaptation(0.7, &signals(0.15, 10));
        assert_eq!(result.adaptation_reason, "suppression_active");
        assert!(result.threshold_delta > 0.0);
        assert!((result.adapted_threshold - 0.85).abs() < 0.001);
    }

    #[test]
    fn neutral_acceptance_no_change() {
        let result = compute_threshold_adaptation(0.65, &signals(0.55, 8));
        assert_eq!(result.adaptation_reason, "neutral");
        assert_eq!(result.threshold_delta, 0.0);
        assert!((result.adapted_threshold - 0.65).abs() < 0.001);
    }

    #[test]
    fn queue_pressure_softens_suppression() {
        let sig = HeuristicSignals {
            ema_acceptance_rate: 0.15,
            sample_count: 10,
            queue_pressure: 0.8,
            ..Default::default()
        };
        let result = compute_threshold_adaptation(0.7, &sig);
        // base delta = +0.15, queue pressure = -0.05 → net = +0.10
        assert!((result.threshold_delta - 0.10).abs() < 0.001);
    }

    #[test]
    fn undone_actions_raise_bar() {
        let sig = HeuristicSignals {
            ema_acceptance_rate: 0.55,
            sample_count: 10,
            undone_action_rate: 0.5,
            ..Default::default()
        };
        let result = compute_threshold_adaptation(0.65, &sig);
        assert!((result.threshold_delta - 0.05).abs() < 0.001);
    }

    #[test]
    fn delta_clamped_to_bounds() {
        // Even with extreme signals the delta stays within [-0.20, +0.20].
        let sig = HeuristicSignals {
            ema_acceptance_rate: 0.05,
            sample_count: 20,
            undone_action_rate: 0.9,
            topic_recurrence: 0.9,
            queue_pressure: 0.0,
            draft_usage_rate: 0.0,
        };
        let result = compute_threshold_adaptation(0.5, &sig);
        assert!(result.threshold_delta <= 0.20);
        assert!(result.threshold_delta >= -0.20);
    }

    #[test]
    fn adapted_threshold_clamped_to_safe_range() {
        // Extremely high base + max suppression shouldn't exceed 0.95.
        let result = compute_threshold_adaptation(0.90, &signals(0.05, 20));
        assert!(result.adapted_threshold <= 0.95);
        // Extremely low base + max reinforcement shouldn't drop below 0.10.
        let result = compute_threshold_adaptation(0.15, &signals(0.95, 20));
        assert!(result.adapted_threshold >= 0.10);
    }

    #[test]
    fn update_acceptance_ema_converges() {
        let mut ema = 0.5;
        for _ in 0..30 {
            ema = update_acceptance_ema(ema, true);
        }
        assert!(ema > 0.95, "EMA should converge toward 1.0 with all acceptances");
    }

    #[test]
    fn normalise_queue_pressure_clamps() {
        assert_eq!(normalise_queue_pressure(0, 20), 0.0);
        assert_eq!(normalise_queue_pressure(20, 20), 1.0);
        assert_eq!(normalise_queue_pressure(100, 20), 1.0);
        let mid = normalise_queue_pressure(10, 20);
        assert!((mid - 0.5).abs() < 0.001);
    }
}
