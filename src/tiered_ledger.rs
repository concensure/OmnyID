/*
 * @module-id: rust.tiered-ledger
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Tiered Ledger System â€” promotion rules and compression.
///
/// Evaluates `AfpLedgerPromotionRule` conditions against live ledger stats and
/// returns a `PromotionDecision` when a tier transition should be triggered.
/// The caller (daemon or API handler) is responsible for emitting the
/// `note:ledger_promotion` AFP message and updating the ledger creation record.
///
/// Tier hierarchy: session â†’ project â†’ long_term
use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::message::{
    AfpLedgerEntry, AfpLedgerPromotionContent, AfpLedgerPromotionRule, AfpTieredLedgerContent,
    LEDGER_TIER_LONG_TERM, LEDGER_TIER_PROJECT, LEDGER_TIER_SESSION,
};

// â”€â”€ Tier ordering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Returns the numeric rank of a tier string (higher = more permanent).
/// Unknown tiers return 0.
pub fn tier_rank(tier: &str) -> u8 {
    match tier {
        LEDGER_TIER_SESSION => 1,
        LEDGER_TIER_PROJECT => 2,
        LEDGER_TIER_LONG_TERM => 3,
        _ => 0,
    }
}

/// Returns `true` when `candidate` is a valid promotion target from `current`.
pub fn is_valid_promotion(current: &str, candidate: &str) -> bool {
    tier_rank(candidate) > tier_rank(current)
}

// â”€â”€ Ledger stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Live stats gathered from a ledger thread needed for rule evaluation.
#[derive(Debug, Clone, Default)]
pub struct LedgerStats {
    /// Number of `ledger_update` AFP messages in the thread.
    pub update_count: u32,
    /// Total number of active (non-archived) entries.
    pub entry_count: u32,
    /// Calendar days elapsed since the ledger creation message timestamp.
    pub days_since_creation: u32,
}

impl LedgerStats {
    /// Build from raw AFP message counts and the ledger's creation timestamp.
    pub fn new(update_count: u32, entry_count: u32, created_at: &str) -> Self {
        let days_since_creation = parse_days_since(created_at);
        Self {
            update_count,
            entry_count,
            days_since_creation,
        }
    }
}

fn parse_days_since(iso8601: &str) -> u32 {
    iso8601
        .parse::<DateTime<Utc>>()
        .ok()
        .map(|dt| {
            let diff = Utc::now().signed_duration_since(dt);
            diff.num_days().max(0) as u32
        })
        .unwrap_or(0)
}

// â”€â”€ Promotion decision â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Result of evaluating a ledger's promotion rules.
#[derive(Debug, Clone)]
pub struct PromotionDecision {
    pub promote_to: String,
    /// Whether the rule mandates entry compression on promotion.
    pub compress: bool,
}

/// Evaluate all promotion rules on a tiered ledger against live stats.
/// Returns the first rule that fires, or `None` if none apply.
pub fn evaluate_promotion_rules(
    ledger: &AfpTieredLedgerContent,
    stats: &LedgerStats,
) -> Option<PromotionDecision> {
    for rule in &ledger.promotion_rules {
        if !is_valid_promotion(&ledger.tier, &rule.promote_to) {
            continue;
        }
        if rule_fires(rule, stats) {
            return Some(PromotionDecision {
                promote_to: rule.promote_to.clone(),
                compress: rule.compress_on_promote,
            });
        }
    }
    None
}

fn rule_fires(rule: &AfpLedgerPromotionRule, stats: &LedgerStats) -> bool {
    // All specified conditions must be satisfied simultaneously.
    if let Some(min_updates) = rule.after_update_count {
        if stats.update_count < min_updates {
            return false;
        }
    }
    if let Some(min_days) = rule.after_days {
        if stats.days_since_creation < min_days {
            return false;
        }
    }
    if let Some(min_entries) = rule.after_entry_count {
        if stats.entry_count < min_entries {
            return false;
        }
    }
    // At least one condition must have been specified for the rule to be meaningful.
    rule.after_update_count.is_some()
        || rule.after_days.is_some()
        || rule.after_entry_count.is_some()
}

// â”€â”€ Compression â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build the compressed summary text for a set of ledger entries.
/// Used in `AfpLedgerPromotionContent.compressed_summary`.
/// In production this delegates to the summarizer; here we use a deterministic
/// template so the path has no external dependency.
pub fn compress_entries(entries: &[AfpLedgerEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }
    let open: Vec<&str> = entries
        .iter()
        .filter(|e| e.status == "open" || e.status.is_empty())
        .map(|e| e.label.as_str())
        .collect();
    let resolved: usize = entries.iter().filter(|e| e.status == "resolved").count();
    let archived: usize = entries.iter().filter(|e| e.status == "archived").count();

    let mut parts = Vec::new();
    if !open.is_empty() {
        parts.push(format!("Open: {}", open.join(", ")));
    }
    if resolved > 0 {
        parts.push(format!("{resolved} resolved"));
    }
    if archived > 0 {
        parts.push(format!("{archived} archived"));
    }
    parts.join(". ")
}

/// Build an `AfpLedgerPromotionContent` ready to be serialised into an AFP message.
pub fn build_promotion_content(
    ledger_message_id: &str,
    from_tier: &str,
    to_tier: &str,
    update_message_ids: Vec<String>,
    entries_to_compress: &[AfpLedgerEntry],
    compress: bool,
) -> AfpLedgerPromotionContent {
    let compressed_summary = if compress {
        let s = compress_entries(entries_to_compress);
        if s.is_empty() { None } else { Some(s) }
    } else {
        None
    };

    AfpLedgerPromotionContent {
        ledger_message_id: ledger_message_id.to_string(),
        from_tier: from_tier.to_string(),
        to_tier: to_tier.to_string(),
        compressed_summary,
        updates_compressed: update_message_ids.len() as u32,
        pointer_bundle: update_message_ids,
    }
}

/// Build a `note:ledger_promotion` AFP JSON message.
pub fn build_promotion_afp(
    owner_user_id: &str,
    thread_id: &str,
    promotion: &AfpLedgerPromotionContent,
) -> Value {
    serde_json::json!({
        "protocol": "afp-v1",
        "id": ulid::Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": "tiered_ledger_daemon",
        "to": [owner_user_id],
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "type": "note",
        "subtype": "ledger_promotion",
        "content": serde_json::to_value(promotion).unwrap_or(serde_json::Value::Null),
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message::{AfpLedgerEntry, AfpLedgerPromotionRule, AfpTieredLedgerContent};

    fn make_ledger(tier: &str, rules: Vec<AfpLedgerPromotionRule>) -> AfpTieredLedgerContent {
        AfpTieredLedgerContent {
            name: "Test Ledger".to_string(),
            tier: tier.to_string(),
            promotion_rules: rules,
            ..Default::default()
        }
    }

    fn rule(
        promote_to: &str,
        after_updates: Option<u32>,
        compress: bool,
    ) -> AfpLedgerPromotionRule {
        AfpLedgerPromotionRule {
            promote_to: promote_to.to_string(),
            after_update_count: after_updates,
            after_days: None,
            after_entry_count: None,
            compress_on_promote: compress,
        }
    }

    #[test]
    fn tier_rank_ordering_is_correct() {
        assert!(tier_rank(LEDGER_TIER_SESSION) < tier_rank(LEDGER_TIER_PROJECT));
        assert!(tier_rank(LEDGER_TIER_PROJECT) < tier_rank(LEDGER_TIER_LONG_TERM));
    }

    #[test]
    fn is_valid_promotion_rejects_same_tier() {
        assert!(!is_valid_promotion(
            LEDGER_TIER_PROJECT,
            LEDGER_TIER_PROJECT
        ));
    }

    #[test]
    fn is_valid_promotion_rejects_demotion() {
        assert!(!is_valid_promotion(
            LEDGER_TIER_LONG_TERM,
            LEDGER_TIER_SESSION
        ));
    }

    #[test]
    fn rule_fires_when_update_threshold_met() {
        let ledger = make_ledger(
            LEDGER_TIER_SESSION,
            vec![rule(LEDGER_TIER_PROJECT, Some(3), false)],
        );
        let stats = LedgerStats {
            update_count: 3,
            ..Default::default()
        };
        assert!(evaluate_promotion_rules(&ledger, &stats).is_some());
    }

    #[test]
    fn rule_does_not_fire_below_threshold() {
        let ledger = make_ledger(
            LEDGER_TIER_SESSION,
            vec![rule(LEDGER_TIER_PROJECT, Some(5), false)],
        );
        let stats = LedgerStats {
            update_count: 4,
            ..Default::default()
        };
        assert!(evaluate_promotion_rules(&ledger, &stats).is_none());
    }

    #[test]
    fn rule_without_conditions_does_not_fire() {
        let empty_rule = AfpLedgerPromotionRule {
            promote_to: LEDGER_TIER_PROJECT.to_string(),
            ..Default::default()
        };
        let ledger = make_ledger(LEDGER_TIER_SESSION, vec![empty_rule]);
        let stats = LedgerStats {
            update_count: 100,
            entry_count: 100,
            days_since_creation: 100,
        };
        assert!(evaluate_promotion_rules(&ledger, &stats).is_none());
    }

    #[test]
    fn compress_entries_summarises_correctly() {
        let entries = vec![
            AfpLedgerEntry {
                entry_id: "e1".into(),
                label: "Task A".into(),
                status: "open".into(),
                ..Default::default()
            },
            AfpLedgerEntry {
                entry_id: "e2".into(),
                label: "Task B".into(),
                status: "resolved".into(),
                ..Default::default()
            },
        ];
        let summary = compress_entries(&entries);
        assert!(summary.contains("Task A"));
        assert!(summary.contains("1 resolved"));
    }

    #[test]
    fn build_promotion_content_sets_pointer_bundle() {
        let ids = vec!["msg_001".to_string(), "msg_002".to_string()];
        let content =
            build_promotion_content("ledger_abc", "session", "project", ids.clone(), &[], false);
        assert_eq!(content.pointer_bundle, ids);
        assert_eq!(content.updates_compressed, 2);
        assert_eq!(content.from_tier, "session");
        assert_eq!(content.to_tier, "project");
    }

    #[test]
    fn build_promotion_afp_has_correct_type() {
        let content = AfpLedgerPromotionContent {
            ledger_message_id: "led_01".into(),
            from_tier: "session".into(),
            to_tier: "project".into(),
            ..Default::default()
        };
        let afp = build_promotion_afp("user_01", "thread_01", &content);
        assert_eq!(afp["type"].as_str(), Some("note"));
        assert_eq!(afp["subtype"].as_str(), Some("ledger_promotion"));
    }
}
