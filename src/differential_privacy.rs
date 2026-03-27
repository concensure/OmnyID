//! differential_privacy.rs — Local differential privacy for aggregate statistics.
//!
//! Applies calibrated Laplace mechanism noise to signal counts before they
//! leave the server.  This prevents the stats API from being used to infer
//! individual feedback decisions even when an attacker can make repeated queries.
//!
//! Privacy model:
//!   - Sensitivity of a count query is 1 (adding/removing one user event
//!     changes the count by at most 1).
//!   - Laplace noise scale = sensitivity / epsilon.
//!   - Default epsilon = 1.0 (strong privacy).  Lower epsilon → more noise.
//!   - Counts are clamped to [0, ∞) after adding noise so they never go negative.
//!
//! Usage:
//!   ```rust
//!   let noisy = add_laplace_noise(exact_count, epsilon, sensitivity);
//!   ```
//!
//! The training loop always reads the raw local data — not this API surface —
//! so the DP noise only affects the externally observable stats, not training.

use rand::RngCore as _;

// ── Core mechanism ────────────────────────────────────────────────────────────

/// Sample one value from a Laplace(0, b) distribution using the inverse CDF.
///
/// The Laplace distribution has PDF f(x) = (1/2b) exp(-|x|/b).
/// The inverse CDF trick:  draw u ~ Uniform(-0.5, 0.5), return -b * sign(u) * ln(1-2|u|).
///
/// We avoid `rand_distr` to keep the dependency tree minimal.
fn sample_laplace(scale: f64) -> f64 {
    // Draw a uniform random u64 and convert to f64 in (-0.5, 0.5)
    let mut bytes = [0u8; 8];
    rand::rng().fill_bytes(&mut bytes);
    let u64_val = u64::from_le_bytes(bytes);
    // Map to (0, 1) exclusive
    let u: f64 = (u64_val as f64 + 0.5) / (u64::MAX as f64 + 1.0);
    // Map to (-0.5, 0.5)
    let u = u - 0.5_f64;
    // Inverse CDF
    let sign = if u >= 0.0 { 1.0_f64 } else { -1.0_f64 };
    -scale * sign * (1.0_f64 - 2.0_f64 * u.abs()).ln()
}

/// Add calibrated Laplace noise to a count.
///
/// - `count`: the exact integer count
/// - `epsilon`: privacy budget (positive; lower = more private)
/// - `sensitivity`: L1 sensitivity of the query (usually 1 for a simple count)
///
/// Returns the noisy count, clamped to [0, ∞) and rounded to the nearest integer.
pub fn add_laplace_noise(count: u64, epsilon: f64, sensitivity: f64) -> u64 {
    assert!(epsilon > 0.0, "epsilon must be positive");
    assert!(sensitivity > 0.0, "sensitivity must be positive");
    let scale = sensitivity / epsilon;
    let noise = sample_laplace(scale);
    let noisy = count as f64 + noise;
    noisy.max(0.0).round() as u64
}

/// Apply Laplace noise to a JSON object containing integer signal counts.
///
/// Only keys whose values are non-negative integers are noised.
/// Other keys (strings, nested objects, etc.) are passed through unchanged.
pub fn noise_signal_counts(counts: &serde_json::Value, epsilon: f64) -> serde_json::Value {
    match counts {
        serde_json::Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, v) in map {
                if let Some(n) = v.as_u64() {
                    out.insert(
                        k.clone(),
                        serde_json::Value::Number(serde_json::Number::from(add_laplace_noise(
                            n, epsilon, 1.0,
                        ))),
                    );
                } else {
                    out.insert(k.clone(), v.clone());
                }
            }
            serde_json::Value::Object(out)
        }
        other => other.clone(),
    }
}

/// Default epsilon used by the stats endpoint.  Configurable via
/// `OMNYID_DP_EPSILON` environment variable.
pub fn default_epsilon() -> f64 {
    std::env::var("OMNYID_DP_EPSILON")
        .ok()
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|&e| e > 0.0)
        .unwrap_or(1.0)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noisy_count_is_non_negative() {
        for _ in 0..200 {
            let noisy = add_laplace_noise(0, 1.0, 1.0);
            assert!(noisy < u64::MAX, "should not overflow");
            // Clamped to 0 minimum — cannot be negative because we return u64
        }
    }

    #[test]
    fn high_count_stays_in_plausible_range() {
        // With epsilon=1.0, scale=1.0, ~99.9% of noise is within ±7
        let count = 1000u64;
        let mut too_far = 0u32;
        for _ in 0..1000 {
            let noisy = add_laplace_noise(count, 1.0, 1.0);
            if noisy < 980 || noisy > 1020 {
                too_far += 1;
            }
        }
        // Allow up to 10% of samples to be far — Laplace has fat tails
        assert!(too_far < 150, "too many extreme samples: {too_far}/1000");
    }

    #[test]
    fn noise_signal_counts_noises_integers() {
        let counts = serde_json::json!({
            "approved": 100u64,
            "rejected": 50u64,
            "ignored": 0u64,
            "agent_id": "agent:test@omnyid.com"
        });
        let noised = noise_signal_counts(&counts, 1.0);
        // String fields pass through unchanged
        assert_eq!(noised["agent_id"], counts["agent_id"]);
        // Integer fields are present (may differ from original)
        assert!(noised["approved"].is_number());
        assert!(noised["rejected"].is_number());
        assert!(noised["ignored"].is_number());
    }

    #[test]
    fn noise_signal_counts_preserves_non_count_fields() {
        let counts = serde_json::json!({
            "lora_artifact_id": "lora_user_01",
            "total": 42u64
        });
        let noised = noise_signal_counts(&counts, 100.0); // very high epsilon → near-zero noise
        assert_eq!(noised["lora_artifact_id"], "lora_user_01");
    }

    #[test]
    fn laplace_scale_affects_spread() {
        // With epsilon=0.01 (scale=100), noise should be much larger than with epsilon=100
        let mut tight_deviations = 0u32;
        let mut wide_deviations = 0u32;
        let count = 500u64;
        for _ in 0..500 {
            let tight = add_laplace_noise(count, 100.0, 1.0);
            let wide = add_laplace_noise(count, 0.01, 1.0);
            if tight.abs_diff(count) > 10 {
                tight_deviations += 1;
            }
            if wide.abs_diff(count) > 10 {
                wide_deviations += 1;
            }
        }
        // Wide epsilon=0.01 should produce many more large deviations
        assert!(
            wide_deviations > tight_deviations,
            "high-epsilon noise ({tight_deviations}) should be tighter than low-epsilon ({wide_deviations})"
        );
    }

    #[test]
    fn default_epsilon_is_positive() {
        let e = default_epsilon();
        assert!(e > 0.0);
    }
}
