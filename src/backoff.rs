/*
 * @module-id: rust.backoff
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Exponential backoff with jitter for daemon retry loops.
///
/// Usage pattern in a daemon loop:
/// ```ignore
/// let mut backoff = BackoffState::new(Duration::from_secs(5), Duration::from_secs(300));
/// loop {
///     match do_work().await {
///         Ok(_) => backoff.reset(),
///         Err(e) => {
///             warn!(%e, "pass failed");
///             backoff.sleep().await;
///             continue;
///         }
///     }
///     tokio::time::sleep(backoff.idle_interval()).await;
/// }
/// ```
use std::time::Duration;

use rand::Rng;

#[derive(Debug, Clone)]
pub struct BackoffState {
    /// Current sleep duration (doubles on each consecutive failure).
    current: Duration,
    /// Floor â€” the minimum/reset value; also used as the idle poll interval.
    min: Duration,
    /// Ceiling â€” the maximum sleep duration.
    max: Duration,
    /// How many consecutive failures have occurred.
    consecutive_failures: u32,
}

impl BackoffState {
    /// Create a new state with `min` as the base and `max` as the ceiling.
    pub fn new(min: Duration, max: Duration) -> Self {
        Self {
            current: min,
            min,
            max,
            consecutive_failures: 0,
        }
    }

    /// Reset after a successful pass (next failure starts from `min` again).
    pub fn reset(&mut self) {
        self.current = self.min;
        self.consecutive_failures = 0;
    }

    /// Return the interval to wait between healthy passes.
    pub fn idle_interval(&self) -> Duration {
        self.min
    }

    /// How many consecutive failures have been recorded.
    pub fn consecutive_failures(&self) -> u32 {
        self.consecutive_failures
    }

    /// Sleep for the current backoff duration (with Â±10 % jitter), then
    /// double the duration for next time up to `max`.
    pub async fn sleep(&mut self) {
        let jitter_pct = rand::rng().random_range(0.90_f64..1.10_f64);
        let jittered = Duration::from_secs_f64(self.current.as_secs_f64() * jitter_pct);
        tokio::time::sleep(jittered).await;
        self.consecutive_failures += 1;
        self.current = std::cmp::min(self.current * 2, self.max);
    }
}
