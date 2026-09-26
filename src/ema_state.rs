/*
 * @module-id: rust.ema-state
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// EMA-based state derivative computation for the cognitive continuity layer.
///
/// Treats the user's activity stream as a continuous function f(t) and computes
/// its first derivative (velocity) and second derivative (acceleration) using
/// Exponential Moving Average. This lets the State Synthesizer detect whether
/// the user is in a focused sprint, fragmenting across topics, or approaching
/// a decision inflection point â€” without touching message content.
///
/// All operations are pure (no I/O, no async) and run in constant space.
use std::collections::VecDeque;

// â”€â”€ EMA accumulator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Single-value EMA accumulator.
///
/// `alpha` controls recency weight: 0.0 = no update, 1.0 = replace entirely.
/// Typical values: 0.1 (slow/smooth) â€¦ 0.3 (fast/reactive).
#[derive(Clone, Debug)]
pub struct EmaAccumulator {
    pub alpha: f64,
    pub value: f64,
}

impl EmaAccumulator {
    pub fn new(alpha: f64, initial: f64) -> Self {
        Self {
            alpha: alpha.clamp(0.001, 1.0),
            value: initial,
        }
    }

    /// Update with a new observation and return the new EMA.
    pub fn update(&mut self, observation: f64) -> f64 {
        self.value = self.alpha * observation + (1.0 - self.alpha) * self.value;
        self.value
    }
}

// â”€â”€ Sliding window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Bounded ring-buffer that tracks timestamped scalar observations.
/// Used to compute event rate, recent activity density, and inter-event gaps.
#[derive(Clone, Debug)]
pub struct SlidingWindow {
    capacity: usize,
    entries: VecDeque<(i64, f64)>, // (unix_millis, value)
}

impl SlidingWindow {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(2),
            entries: VecDeque::new(),
        }
    }

    pub fn push(&mut self, timestamp_ms: i64, value: f64) {
        if self.entries.len() >= self.capacity {
            self.entries.pop_front();
        }
        self.entries.push_back((timestamp_ms, value));
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Mean value over the current window.
    pub fn mean(&self) -> f64 {
        if self.entries.is_empty() {
            return 0.0;
        }
        let sum: f64 = self.entries.iter().map(|(_, v)| v).sum();
        sum / self.entries.len() as f64
    }

    /// Events per second over the window's time span.
    pub fn event_rate_per_second(&self) -> f64 {
        if self.entries.len() < 2 {
            return 0.0;
        }
        let first = self.entries.front().map(|(t, _)| *t).unwrap_or(0);
        let last = self.entries.back().map(|(t, _)| *t).unwrap_or(0);
        let span_ms = (last - first).max(1) as f64;
        self.entries.len() as f64 / (span_ms / 1000.0)
    }

    /// Ordered (timestamp_ms, value) pairs â€” oldest first.
    pub fn entries(&self) -> impl Iterator<Item = &(i64, f64)> {
        self.entries.iter()
    }
}

// â”€â”€ State derivative â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// First and second derivatives of the user's activity signal.
/// Computed by running EMA over consecutive window means.
#[derive(Clone, Debug, Default)]
pub struct StateDerivative {
    /// Rate of change: positive = accelerating activity, negative = tapering.
    pub velocity: f64,
    /// Change in velocity: positive = increasing momentum, negative = decelerating.
    pub acceleration: f64,
    /// Human-readable trend label for A2UI display.
    pub trend: &'static str,
    /// Estimated activity intensity on a 0â€“1 scale.
    pub intensity: f64,
}

/// Compute velocity and acceleration from two consecutive EMA values.
///
/// `prev_ema` is the EMA from the previous window tick.
/// `curr_ema` is the EMA after the latest update.
/// `dt_seconds` is the time between ticks; avoids division by zero.
pub fn compute_velocity(prev_ema: f64, curr_ema: f64, dt_seconds: f64) -> f64 {
    if dt_seconds < 0.001 {
        return 0.0;
    }
    (curr_ema - prev_ema) / dt_seconds
}

pub fn compute_acceleration(prev_velocity: f64, curr_velocity: f64, dt_seconds: f64) -> f64 {
    if dt_seconds < 0.001 {
        return 0.0;
    }
    (curr_velocity - prev_velocity) / dt_seconds
}

/// Derive a full `StateDerivative` from a sliding window and a running EMA.
///
/// Call this once per synthesizer tick. `ema` is updated in-place.
pub fn derive_state(
    window: &SlidingWindow,
    ema: &mut EmaAccumulator,
    dt_seconds: f64,
    prev_velocity: f64,
) -> StateDerivative {
    let mean = window.mean();
    let prev_ema = ema.value;
    let curr_ema = ema.update(mean);

    let velocity = compute_velocity(prev_ema, curr_ema, dt_seconds);
    let acceleration = compute_acceleration(prev_velocity, velocity, dt_seconds);

    let intensity = curr_ema.clamp(0.0, 1.0);

    StateDerivative {
        velocity,
        acceleration,
        trend: trend_label(velocity, acceleration),
        intensity,
    }
}

fn trend_label(velocity: f64, acceleration: f64) -> &'static str {
    match (
        velocity > 0.01,
        velocity < -0.01,
        acceleration > 0.005,
        acceleration < -0.005,
    ) {
        (true, _, true, _) => "accelerating",
        (true, _, _, true) => "decelerating_from_peak",
        (true, _, _, _) => "steady_growth",
        (_, true, _, true) => "rapid_cooling",
        (_, true, _, _) => "tapering",
        _ => "stable",
    }
}

// â”€â”€ Activity rate helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Convert a raw event count + time span into a normalised 0â€“1 activity score.
/// Clamps at `max_rate_per_min` to avoid runaway signals.
pub fn normalise_activity_rate(events: u32, span_seconds: f64, max_rate_per_min: f64) -> f64 {
    if span_seconds < 0.001 || max_rate_per_min < 0.001 {
        return 0.0;
    }
    let rate_per_min = (events as f64 / span_seconds) * 60.0;
    (rate_per_min / max_rate_per_min).clamp(0.0, 1.0)
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ema_accumulator_converges_to_observation() {
        let mut ema = EmaAccumulator::new(0.5, 0.0);
        for _ in 0..20 {
            ema.update(1.0);
        }
        assert!(
            (ema.value - 1.0).abs() < 0.001,
            "EMA should converge to 1.0"
        );
    }

    #[test]
    fn sliding_window_evicts_oldest() {
        let mut w = SlidingWindow::new(3);
        w.push(1000, 1.0);
        w.push(2000, 2.0);
        w.push(3000, 3.0);
        w.push(4000, 4.0); // evicts (1000, 1.0)
        assert_eq!(w.len(), 3);
        assert!((w.mean() - 3.0).abs() < 0.001); // (2+3+4)/3 = 3
    }

    #[test]
    fn event_rate_per_second_is_correct() {
        let mut w = SlidingWindow::new(10);
        w.push(0, 1.0);
        w.push(1000, 1.0);
        w.push(2000, 1.0); // 3 events over 2s â†’ 1.5/s
        let rate = w.event_rate_per_second();
        assert!((rate - 1.5).abs() < 0.01);
    }

    #[test]
    fn trend_accelerating_detected() {
        let trend = trend_label(0.05, 0.02);
        assert_eq!(trend, "accelerating");
    }

    #[test]
    fn trend_stable_when_flat() {
        let trend = trend_label(0.0, 0.0);
        assert_eq!(trend, "stable");
    }

    #[test]
    fn normalise_clamps_at_one() {
        let score = normalise_activity_rate(1000, 10.0, 50.0);
        assert_eq!(score, 1.0);
    }

    #[test]
    fn normalise_zero_for_no_events() {
        let score = normalise_activity_rate(0, 60.0, 50.0);
        assert_eq!(score, 0.0);
    }
}
