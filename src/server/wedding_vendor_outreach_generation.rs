use serde::Serialize;
use sha2::{Digest, Sha256};

pub const OUTREACH_PROMPT_PREFIX_ID: &str = "wedding.vendor_outreach.v2";

#[derive(Clone, Debug, Serialize)]
pub struct OutreachGenerationMetadata {
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub estimated_cost_usd: f64,
    pub input_fingerprint: String,
    pub prompt_prefix_id: &'static str,
    pub served_from: &'static str,
}

pub fn outreach_input_fingerprint(user_text: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(OUTREACH_PROMPT_PREFIX_ID.as_bytes());
    digest.update([0]);
    digest.update(user_text.as_bytes());
    hex::encode(digest.finalize())
}

pub fn model_generation(
    user_text: &str,
    input_tokens: i32,
    output_tokens: i32,
    cost_cents: i32,
) -> OutreachGenerationMetadata {
    OutreachGenerationMetadata {
        input_tokens: input_tokens.max(0),
        output_tokens: output_tokens.max(0),
        estimated_cost_usd: f64::from(cost_cents.max(0)) / 100.0,
        input_fingerprint: outreach_input_fingerprint(user_text),
        prompt_prefix_id: OUTREACH_PROMPT_PREFIX_ID,
        served_from: "model",
    }
}

pub fn deterministic_generation(user_text: &str) -> OutreachGenerationMetadata {
    OutreachGenerationMetadata {
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: 0.0,
        input_fingerprint: outreach_input_fingerprint(user_text),
        prompt_prefix_id: OUTREACH_PROMPT_PREFIX_ID,
        served_from: "deterministic_template",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_changes_only_with_meaningful_input() {
        assert_eq!(outreach_input_fingerprint("same"), outreach_input_fingerprint("same"));
        assert_ne!(outreach_input_fingerprint("same"), outreach_input_fingerprint("changed"));
    }
}
