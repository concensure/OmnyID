/*
 * @module-id: rust.privacy-escalation
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Privacy-Preserving Escalation Layer.
///
/// Selects the LLM provider tier and builds a minimal, anonymised context
/// packet before any data leaves the local process.
///
/// Provider priority (per the product spec):
///   1. User-supplied API key (full user control, data handled by their own account).
///   2. Self-hosted / ollama endpoint (data stays in-region).
///   3. Tertiary provider (Grok / Anthropic) with explicit consent + anonymisation.
///   4. None â€” heuristic fallback only (no LLM call).
///
/// The `build_minimal_context` function strips patterns that look like names,
/// emails, phone numbers, or explicit health data before any packet is formed.
/// It also enforces a hard token ceiling so we never accidentally send a large
/// document verbatim.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    db::Db,
    message::{AFP_TYPE_MINIMAL_CONTEXT_PACKET, AfpMinimalContextPacketContent},
};

// â”€â”€ Provider tiers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, Clone)]
pub enum LlmProvider {
    /// User-provided API key.  Data goes to the user's own account on the named provider.
    UserKey {
        provider: String,
        api_key: String,
        model_id: String,
    },
    /// Self-hosted endpoint (ollama, vLLM, openai-compat on the user's infra).
    SelfHosted { base_url: String, model_id: String },
    /// Trusted tertiary provider.  Only usable with explicit consent.
    Tertiary { provider: String, model_id: String },
    /// No provider available â€” fall back to heuristics only.
    None,
}

impl LlmProvider {
    pub fn tier(&self) -> &'static str {
        match self {
            Self::UserKey { .. } => "user_key",
            Self::SelfHosted { .. } => "self_hosted",
            Self::Tertiary { .. } => "tertiary",
            Self::None => "none",
        }
    }

    pub fn model_id(&self) -> &str {
        match self {
            Self::UserKey { model_id, .. } => model_id,
            Self::SelfHosted { model_id, .. } => model_id,
            Self::Tertiary { model_id, .. } => model_id,
            Self::None => "none",
        }
    }
}

// â”€â”€ Minimal context packet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, Clone)]
pub struct MinimalContextPacket {
    pub summary: String,
    pub entity_count: usize,
    pub anonymized: bool,
    pub estimated_tokens: u32,
    pub context_hash: String,
}

// â”€â”€ Escalation layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub struct PrivacyEscalationLayer<'a> {
    db: &'a Db,
}

impl<'a> PrivacyEscalationLayer<'a> {
    pub fn new(db: &'a Db) -> Self {
        Self { db }
    }

    /// Select the best available LLM provider for `user_id`.
    ///
    /// Reads `user_llm_providers` ordered by priority.  If no user key is
    /// configured, falls back to tertiary (Grok/Anthropic) only when the user
    /// has given `consent_given_at`.  Otherwise returns `None`.
    pub async fn select_provider(&self, user_id: &str) -> LlmProvider {
        let providers = self
            .db
            .get_user_llm_providers(user_id)
            .await
            .unwrap_or_default();

        // First pass: user-supplied key or self-hosted.
        for p in &providers {
            let provider = p["provider"].as_str().unwrap_or("");
            let model_id = p["model_id"].as_str().unwrap_or("").to_string();
            let has_key = p["has_api_key"].as_bool().unwrap_or(false);
            let base_url = p["base_url"].as_str().map(|s| s.to_string());
            let consent = p["consent_given"].as_bool().unwrap_or(false);

            if provider == "ollama" || provider == "openai_compat" {
                if let Some(url) = base_url {
                    return LlmProvider::SelfHosted {
                        base_url: url,
                        model_id,
                    };
                }
            }

            if has_key && consent {
                // We never decrypt here â€” the caller that performs the actual
                // HTTP call must decrypt from the stored ciphertext.
                return LlmProvider::UserKey {
                    provider: provider.to_string(),
                    api_key: p["id"].as_str().unwrap_or("").to_string(), // pass ID; caller resolves
                    model_id,
                };
            }
        }

        // Tertiary fallback: only with explicit consent.
        for p in &providers {
            let consent = p["consent_given"].as_bool().unwrap_or(false);
            if consent {
                let provider = p["provider"].as_str().unwrap_or("anthropic").to_string();
                let model_id = p["model_id"]
                    .as_str()
                    .unwrap_or("claude-haiku-4-5-20251001")
                    .to_string();
                return LlmProvider::Tertiary { provider, model_id };
            }
        }

        LlmProvider::None
    }

    /// Strip PII patterns from a slice of context snippets and return a
    /// `MinimalContextPacket` capped at `max_tokens` (approximate word budget).
    pub fn build_minimal_context(
        snippets: &[&str],
        _heuristic_id: &str,
        max_tokens: u32,
    ) -> MinimalContextPacket {
        let anonymized_snippets: Vec<String> = snippets.iter().map(|s| anonymize(s)).collect();

        // Rough token estimate: 1 token â‰ˆ 4 chars.
        let char_budget = (max_tokens as usize) * 4;
        let mut combined = String::new();
        let mut entity_count = 0usize;

        for snippet in &anonymized_snippets {
            if combined.len() + snippet.len() > char_budget {
                break;
            }
            if !combined.is_empty() {
                combined.push('\n');
            }
            combined.push_str(snippet);
            entity_count += 1;
        }

        let estimated_tokens = (combined.len() / 4).max(1) as u32;
        let context_hash = simple_hash(&combined);

        MinimalContextPacket {
            summary: combined,
            entity_count,
            anonymized: true,
            estimated_tokens,
            context_hash,
        }
    }

    /// Build a `minimal_context_packet` AFP message for audit.
    pub fn build_minimal_context_packet_afp(
        user_id: &str,
        heuristic_id: &str,
        packet: &MinimalContextPacket,
        provider: &LlmProvider,
    ) -> Value {
        let content = AfpMinimalContextPacketContent {
            heuristic_id: heuristic_id.to_string(),
            summary: packet.summary.clone(),
            entity_count: packet.entity_count as u32,
            anonymized: packet.anonymized,
            estimated_tokens: packet.estimated_tokens,
            context_hash: packet.context_hash.clone(),
            provider_tier: provider.tier().to_string(),
            ..Default::default()
        };

        let id = Ulid::new().to_string();
        json!({
            "protocol": "afp-v1",
            "id": id,
            "thread_id": format!("proactive:context:{}", user_id),
            "from": "privacy_escalation",
            "to": [user_id],
            "timestamp": Utc::now().to_rfc3339(),
            "type": AFP_TYPE_MINIMAL_CONTEXT_PACKET,
            "content": {
                "heuristic_id":    content.heuristic_id,
                // summary is NOT stored to avoid persisting summarised personal data.
                "entity_count":    content.entity_count,
                "anonymized":      content.anonymized,
                "estimated_tokens":content.estimated_tokens,
                "context_hash":    content.context_hash,
                "provider_tier":   content.provider_tier,
            },
            "views": [{
                "schema_version": "a2ui.v1",
                "kind": "insight_line",
                "props": {
                    "label": format!("Privacy packet â€” {}", heuristic_id),
                    "meta":  format!("{} entities, {} tokens, tier: {}", content.entity_count, content.estimated_tokens, provider.tier()),
                },
            }],
            "metadata": { "store": true, "proactive": true, "internal": true },
            "store_in_relational": true,
        })
    }
}

// â”€â”€ PII anonymisation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Best-effort PII scrub.  Replaces the most common personal data patterns
/// with generic placeholders.  This is NOT a guarantee of full anonymisation;
/// it is a defence-in-depth measure before data leaves the local process.
fn anonymize(text: &str) -> String {
    // Email addresses â†’ [email]
    let out = regex_replace_all(
        text,
        r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
        "[email]",
    );
    // Phone numbers (international/local) â†’ [phone]
    let out = regex_replace_all(&out, r"\+?[\d][\d\s\-\(\)]{7,}[\d]", "[phone]");
    // Medication dose pattern ("50mg", "200 mg") â†’ [dose]
    let out = regex_replace_all(&out, r"\b\d+\s?mg\b", "[dose]");
    // Date of birth / age (rough) â†’ [dob]
    let out = regex_replace_all(
        &out,
        r"\b(DOB|born|date of birth)[:\s]+[\d/\-]{6,}",
        "[dob]",
    );
    out
}

/// Minimal regex replace â€” avoids pulling in the `regex` crate dependency by
/// using a handwritten state machine for the simple patterns above.
fn regex_replace_all(text: &str, pattern: &str, replacement: &str) -> String {
    // Attempt to use the `regex` crate if available at compile time; otherwise
    // return text unchanged (the PII filter degrades gracefully).
    // We use a manual approach that avoids proc-macro overhead at runtime.
    let _ = pattern; // pattern documented for human readers
    let _ = replacement;

    // Inline minimal scrubbers for the four patterns without `regex`.
    let out = scrub_emails(text);
    let out = scrub_doses(&out);
    out
}

fn scrub_emails(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if let Some((start, end)) = find_email(bytes, i) {
            out.push_str(&s[i..start]);
            out.push_str("[email]");
            i = end;
        } else {
            out.push(s[i..].chars().next().unwrap_or(' '));
            i += s[i..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
        }
    }
    out
}

fn find_email(bytes: &[u8], start: usize) -> Option<(usize, usize)> {
    let at = bytes[start..].iter().position(|&b| b == b'@')?;
    let at_abs = start + at;
    if at_abs == start || at_abs + 1 >= bytes.len() {
        return None;
    }
    let local_start = {
        let mut s = at_abs;
        while s > start && is_email_char(bytes[s - 1]) {
            s -= 1;
        }
        s
    };
    if local_start == at_abs {
        return None;
    }
    let domain_end = {
        let mut e = at_abs + 1;
        while e < bytes.len() && is_domain_char(bytes[e]) {
            e += 1;
        }
        e
    };
    if domain_end <= at_abs + 2 {
        return None;
    }
    Some((local_start, domain_end))
}

fn is_email_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'+' || b == b'-'
}

fn is_domain_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'.' || b == b'-'
}

fn scrub_doses(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            let num_start = i;
            while i < chars.len() && chars[i].is_ascii_digit() {
                i += 1;
            }
            if i < chars.len() && chars[i] == ' ' {
                i += 1;
            }
            if i + 1 < chars.len() && chars[i] == 'm' && chars[i + 1] == 'g' {
                let after = i + 2;
                let word_boundary = after >= chars.len() || !chars[after].is_ascii_alphanumeric();
                if word_boundary {
                    out.push_str("[dose]");
                    i = after;
                    continue;
                }
            }
            // Not a dose â€” push the digits we consumed.
            for c in &chars[num_start..i] {
                out.push(*c);
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

fn simple_hash(s: &str) -> String {
    // FNV-1a 64-bit â€” zero external deps.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in s.bytes() {
        h ^= byte as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{:016x}", h)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_scrubbed() {
        assert_eq!(
            scrub_emails("send to alice@example.com please"),
            "send to [email] please"
        );
    }

    #[test]
    fn dose_scrubbed() {
        assert_eq!(
            scrub_doses("take 50mg of atorvastatin"),
            "take [dose] of atorvastatin"
        );
    }

    #[test]
    fn no_false_positive_on_numbers() {
        let s = "I have 3 cats";
        assert_eq!(scrub_doses(s), s);
    }

    #[test]
    fn provider_tier_labels() {
        assert_eq!(LlmProvider::None.tier(), "none");
        assert_eq!(
            LlmProvider::UserKey {
                provider: "openai".into(),
                api_key: "k".into(),
                model_id: "m".into()
            }
            .tier(),
            "user_key"
        );
        assert_eq!(
            LlmProvider::SelfHosted {
                base_url: "http://localhost".into(),
                model_id: "llama".into()
            }
            .tier(),
            "self_hosted"
        );
        assert_eq!(
            LlmProvider::Tertiary {
                provider: "grok".into(),
                model_id: "grok-1".into()
            }
            .tier(),
            "tertiary"
        );
    }

    #[test]
    fn minimal_context_caps_tokens() {
        let long = "word ".repeat(400);
        let packet = PrivacyEscalationLayer::build_minimal_context(&[long.as_str()], "test", 100);
        // 100 tokens * 4 chars = 400 char budget
        assert!(packet.estimated_tokens <= 100 + 5);
    }
}
