/*
 * @module-id: rust.token-budget
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Token Budget Gate â€” guards LLM escalation calls for proactive agents.
///
/// Decision flow per trigger:
///   1. Load user's daily limit from `user_token_budget` (default 50k).
///   2. Sum today's usage from `proactive_token_log`.
///   3. If (used + estimated) > limit â†’ FallbackHeuristic or Queued.
///   4. If escalation disabled by user â†’ FallbackHeuristic.
///   5. Otherwise â†’ Allowed with the selected model tier.
///
/// After a real LLM call the caller must invoke `record_usage()` so the
/// log stays accurate.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::{
    db::Db,
    message::{
        AFP_TYPE_PROACTIVE_TRIGGER, AFP_TYPE_TOKEN_BUDGET_LOG, AfpProactiveTriggerContent,
        AfpTokenBudgetLogContent,
    },
};

// â”€â”€ Decision â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, Clone, PartialEq)]
pub enum BudgetDecision {
    /// LLM call is allowed; `estimated_tokens` is advisory.
    Allowed { estimated_tokens: u32 },
    /// Heuristic result is sufficient; skip LLM to save tokens.
    FallbackHeuristic { reason: String },
    /// Budget would be exceeded today; re-check tomorrow.
    Queued { retry_after_seconds: u32 },
}

impl BudgetDecision {
    pub fn tag(&self) -> &'static str {
        match self {
            Self::Allowed { .. } => "allowed",
            Self::FallbackHeuristic { .. } => "fallback_heuristic",
            Self::Queued { .. } => "queued",
        }
    }
}

// â”€â”€ Gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub struct TokenBudgetGate<'a> {
    db: &'a Db,
}

impl<'a> TokenBudgetGate<'a> {
    pub fn new(db: &'a Db) -> Self {
        Self { db }
    }

    /// Check whether an LLM call for `heuristic_id` is within budget.
    /// Returns a `BudgetDecision` and the current daily totals for AFP logging.
    pub async fn check_and_gate(
        &self,
        user_id: &str,
        _heuristic_id: &str,
        estimated_tokens: u32,
    ) -> (BudgetDecision, i64, i64) {
        let (daily_limit, _alert_pct, escalation_enabled) = self
            .db
            .get_user_token_budget(user_id)
            .await
            .unwrap_or((50_000, 80.0, true));

        let daily_used = self.db.daily_total_token_usage(user_id).await.unwrap_or(0);

        if !escalation_enabled {
            return (
                BudgetDecision::FallbackHeuristic {
                    reason: "escalation disabled by user".to_string(),
                },
                daily_used,
                daily_limit,
            );
        }

        if daily_used + estimated_tokens as i64 > daily_limit {
            let seconds_until_reset = seconds_until_midnight_utc();
            return (
                BudgetDecision::Queued {
                    retry_after_seconds: seconds_until_reset,
                },
                daily_used,
                daily_limit,
            );
        }

        (
            BudgetDecision::Allowed { estimated_tokens },
            daily_used,
            daily_limit,
        )
    }

    /// Persist actual token usage after a completed LLM call.
    pub async fn record_usage(&self, user_id: &str, heuristic_id: &str, tokens_used: i32) {
        let _ = self
            .db
            .log_proactive_token_usage(heuristic_id, user_id, tokens_used as i64)
            .await;
    }

    // â”€â”€ AFP builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /// Build a `proactive_trigger` AFP message (audit record of gate decision).
    pub fn build_proactive_trigger_afp(
        user_id: &str,
        heuristic_id: &str,
        daily_used: i64,
        daily_limit: i64,
        decision: &BudgetDecision,
        provider_tier: &str,
    ) -> Value {
        let (reason, estimated_tokens) = match decision {
            BudgetDecision::Allowed { estimated_tokens } => {
                ("budget ok".to_string(), *estimated_tokens)
            }
            BudgetDecision::FallbackHeuristic { reason } => (reason.clone(), 0),
            BudgetDecision::Queued { .. } => ("daily budget exceeded".to_string(), 0),
        };

        let content = AfpProactiveTriggerContent {
            heuristic_id: heuristic_id.to_string(),
            decision: decision.tag().to_string(),
            reason,
            estimated_tokens,
            daily_used_tokens: daily_used,
            daily_limit_tokens: daily_limit,
            provider_tier: provider_tier.to_string(),
        };

        let id = Ulid::new().to_string();
        json!({
            "protocol": "afp-v1",
            "id": id,
            "thread_id": format!("proactive:trigger:{}", user_id),
            "from": "token_budget_gate",
            "to": [user_id],
            "timestamp": Utc::now().to_rfc3339(),
            "type": AFP_TYPE_PROACTIVE_TRIGGER,
            "content": {
                "heuristic_id":       content.heuristic_id,
                "decision":           content.decision,
                "reason":             content.reason,
                "estimated_tokens":   content.estimated_tokens,
                "daily_used_tokens":  content.daily_used_tokens,
                "daily_limit_tokens": content.daily_limit_tokens,
                "provider_tier":      content.provider_tier,
            },
            "views": [{
                "schema_version": "a2ui.v1",
                "kind": "insight_line",
                "props": {
                    "label": format!("Proactive trigger: {}", content.heuristic_id),
                    "meta":  format!("{}/{} tokens used today", daily_used, daily_limit),
                },
            }],
            "metadata": { "store": true, "proactive": true, "internal": true },
            "store_in_relational": true,
        })
    }

    /// Build a `token_budget_log` AFP after a real LLM call completes.
    pub fn build_token_budget_log_afp(
        user_id: &str,
        heuristic_id: &str,
        tokens_used: i32,
        daily_total_after: i64,
        daily_limit: i64,
        provider_tier: &str,
        model_id: &str,
    ) -> Value {
        let usage_pct = if daily_limit > 0 {
            (daily_total_after as f64 / daily_limit as f64) * 100.0
        } else {
            0.0
        };

        let content = AfpTokenBudgetLogContent {
            heuristic_id: heuristic_id.to_string(),
            tokens_used,
            daily_total_after,
            daily_limit,
            usage_pct,
            provider_tier: provider_tier.to_string(),
            model_id: model_id.to_string(),
        };

        let id = Ulid::new().to_string();
        json!({
            "protocol": "afp-v1",
            "id": id,
            "thread_id": format!("proactive:budget:{}", user_id),
            "from": "token_budget_gate",
            "to": [user_id],
            "timestamp": Utc::now().to_rfc3339(),
            "type": AFP_TYPE_TOKEN_BUDGET_LOG,
            "content": {
                "heuristic_id":      content.heuristic_id,
                "tokens_used":       content.tokens_used,
                "daily_total_after": content.daily_total_after,
                "daily_limit":       content.daily_limit,
                "usage_pct":         (usage_pct * 10.0).round() / 10.0,
                "provider_tier":     content.provider_tier,
                "model_id":          content.model_id,
            },
            "views": [{
                "schema_version": "a2ui.v1",
                "kind": "stat_row",
                "props": {
                    "label":  format!("Token usage â€” {}", heuristic_id),
                    "value":  format!("{} tokens", tokens_used),
                    "meta":   format!("{:.1}% of daily limit used", usage_pct),
                },
            }],
            "metadata": { "store": true, "proactive": true, "internal": true },
            "store_in_relational": true,
        })
    }
}

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

fn seconds_until_midnight_utc() -> u32 {
    let now = Utc::now();
    let tomorrow = (now + chrono::Duration::days(1))
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap();
    let tomorrow_utc = tomorrow.and_utc();
    (tomorrow_utc - now).num_seconds().max(0) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn budget_decision_tags() {
        assert_eq!(
            BudgetDecision::Allowed {
                estimated_tokens: 100
            }
            .tag(),
            "allowed"
        );
        assert_eq!(
            BudgetDecision::FallbackHeuristic { reason: "x".into() }.tag(),
            "fallback_heuristic"
        );
        assert_eq!(
            BudgetDecision::Queued {
                retry_after_seconds: 3600
            }
            .tag(),
            "queued"
        );
    }

    #[test]
    fn proactive_trigger_afp_has_correct_type() {
        let afp = TokenBudgetGate::build_proactive_trigger_afp(
            "user1",
            "med-conflict",
            1000,
            50000,
            &BudgetDecision::Allowed {
                estimated_tokens: 512,
            },
            "user_key",
        );
        assert_eq!(afp["type"], AFP_TYPE_PROACTIVE_TRIGGER);
        assert_eq!(afp["content"]["decision"], "allowed");
    }

    #[test]
    fn token_budget_log_usage_pct() {
        let afp = TokenBudgetGate::build_token_budget_log_afp(
            "user1",
            "med-conflict",
            512,
            25000,
            50000,
            "user_key",
            "claude-haiku-4-5",
        );
        assert_eq!(afp["type"], AFP_TYPE_TOKEN_BUDGET_LOG);
        // 25000/50000 = 50.0%
        assert_eq!(afp["content"]["usage_pct"], 50.0_f64);
    }
}
