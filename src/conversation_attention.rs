/*
 * @module-id: rust.conversation-attention
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

pub fn conversation_attention_rank(
    family: &str,
    latest_attention_kind: &str,
    latest_value_hint: Option<&str>,
) -> i64 {
    let base = match latest_attention_kind {
        "approval_request" => 300,
        "prepared_draft" => 200,
        _ => 100,
    };

    let family_bonus = match family.trim() {
        "renewals" => 40,
        "forms" => 35,
        "bills" => 30,
        "communications" => 0,
        _ => 10,
    };

    let hint_bonus = latest_value_hint
        .map(conversation_attention_value_hint_rank)
        .unwrap_or(0);

    base + family_bonus + hint_bonus
}

pub fn conversation_attention_value_hint_rank(hint: &str) -> i64 {
    let trimmed = hint.trim();
    let lower = trimmed.to_ascii_lowercase();

    if let Some(raw) = trimmed.strip_prefix("Potential savings: $") {
        let parsed = raw
            .trim()
            .replace(',', "")
            .parse::<f64>()
            .ok()
            .unwrap_or(0.0);
        return parsed.round().clamp(0.0, 40.0) as i64;
    }

    if lower == "renewal is due now" {
        return 30;
    }

    if let Some(raw_days) = lower
        .strip_prefix("renewal due in ")
        .and_then(|value| value.strip_suffix(" days"))
        .or_else(|| {
            lower
                .strip_prefix("renewal due in ")
                .and_then(|value| value.strip_suffix(" day"))
        })
    {
        let days = raw_days.trim().parse::<i64>().ok().unwrap_or(30);
        return (31 - days).clamp(0, 30);
    }

    if let Some(raw) = trimmed.strip_prefix("Amount due: $") {
        let parsed = raw
            .trim()
            .replace(',', "")
            .parse::<f64>()
            .ok()
            .unwrap_or(0.0);
        return parsed.round().clamp(0.0, 35.0) as i64;
    }

    if lower == "bill is due now" {
        return 28;
    }

    if let Some(raw_days) = lower
        .strip_prefix("bill due in ")
        .and_then(|value| value.strip_suffix(" days"))
        .or_else(|| {
            lower
                .strip_prefix("bill due in ")
                .and_then(|value| value.strip_suffix(" day"))
        })
    {
        let days = raw_days.trim().parse::<i64>().ok().unwrap_or(30);
        return (21 - days).clamp(0, 20);
    }

    if lower == "form is due now" {
        return 26;
    }

    if let Some(raw_days) = lower
        .strip_prefix("form due in ")
        .and_then(|value| value.strip_suffix(" days"))
        .or_else(|| {
            lower
                .strip_prefix("form due in ")
                .and_then(|value| value.strip_suffix(" day"))
        })
    {
        let days = raw_days.trim().parse::<i64>().ok().unwrap_or(30);
        return (21 - days).clamp(0, 20);
    }

    if lower == "signature required" {
        return 22;
    }

    if lower.starts_with("submit via ") {
        return 8;
    }

    if lower.starts_with("for ") {
        return 4;
    }

    0
}

#[cfg(test)]
mod tests {
    use super::{conversation_attention_rank, conversation_attention_value_hint_rank};

    #[test]
    fn conversation_attention_rank_prefers_approval_then_family_then_hint() {
        assert!(
            conversation_attention_rank("forms", "approval_request", Some("Signature required"))
                > conversation_attention_rank(
                    "forms",
                    "prepared_draft",
                    Some("Signature required")
                )
        );
        assert!(
            conversation_attention_rank("renewals", "prepared_draft", None)
                > conversation_attention_rank("communications", "prepared_draft", None)
        );
    }

    #[test]
    fn conversation_attention_value_hint_rank_covers_known_hint_shapes() {
        assert_eq!(
            conversation_attention_value_hint_rank("Potential savings: $18.00"),
            18
        );
        assert_eq!(
            conversation_attention_value_hint_rank("Amount due: $42.50"),
            35
        );
        assert_eq!(
            conversation_attention_value_hint_rank("Form due in 3 days"),
            18
        );
        assert_eq!(
            conversation_attention_value_hint_rank("Signature required"),
            22
        );
    }
}
