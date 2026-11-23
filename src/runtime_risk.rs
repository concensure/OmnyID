/// Runtime Risk Layer (Phase 12 Step 8) — Layer 2 of the three-layer safety model.
///
/// # Three safety layers
///
/// 1. **Static policy** (design-time / compile-time) — `policy_engine.rs`:
///    mask rules, allowed task types, capability intersection, daemon validation.
///
/// 2. **Runtime risk** (execution-time, this module) — inspects the live action
///    payload *before* any HTTP call, scores it, and decides whether to proceed,
///    demand a human approval gate, or block outright.
///
/// 3. **Human approval** (durable gate) — `ApprovalMode::HumanApprovalRequired`
///    in `rest_adapter.rs`, `ApprovalNode` in the workflow graph.
///
/// Layer 2 emits structured `RiskAssessment` values; callers turn them into SSE
/// `policy_check` events so the live execution stream can surface risk decisions
/// in the visual builder without requiring a post-hoc trace query.
use serde::{Deserialize, Serialize};

// ── Risk level ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    /// Safe to proceed without further checks.
    Low,
    /// Noteworthy — surface in execution trace but do not pause.
    Medium,
    /// Pause and require human confirmation before proceeding.
    High,
    /// Hard stop; action must not be executed.
    Block,
}

impl std::fmt::Display for RiskLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RiskLevel::Low => f.write_str("low"),
            RiskLevel::Medium => f.write_str("medium"),
            RiskLevel::High => f.write_str("high"),
            RiskLevel::Block => f.write_str("block"),
        }
    }
}

// ── Risk assessment ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskAssessment {
    /// Overall risk level for this action.
    pub level: RiskLevel,
    /// Human-readable reasons, suitable for the UI execution trace.
    pub reasons: Vec<String>,
    /// Whether this action must wait for a human approval gate before proceeding.
    pub requires_approval: bool,
    /// True when the action cannot be undone (DELETE / DROP / PURGE semantics).
    pub is_irreversible: bool,
}

impl RiskAssessment {
    fn low() -> Self {
        Self {
            level: RiskLevel::Low,
            reasons: vec![],
            requires_approval: false,
            is_irreversible: false,
        }
    }
}

// ── Policy config ─────────────────────────────────────────────────────────────

/// Per-node risk policy resolved from the compiled IR at delegation time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRiskConfig {
    /// Advisory remaining token budget for this node turn.
    pub token_budget_remaining: Option<u32>,
    /// A2A target agent IDs this node is permitted to delegate to.
    pub allowed_a2a_agents: Vec<String>,
    /// Tool/action names that are always blocked regardless of other signals.
    pub always_block_actions: Vec<String>,
    /// Tool/action names that bypass Layer 3 (human approval) even if risk is High.
    pub always_approve_actions: Vec<String>,
    /// When true, PII-pattern fields in the payload are permitted (e.g. for the
    /// Email Gateway daemon which must handle `email` fields legitimately).
    pub allow_pii_in_payload: bool,
    /// When true, High-risk actions automatically trigger Layer 3 approval gate.
    pub require_approval_on_high_risk: bool,
}

impl Default for PolicyRiskConfig {
    fn default() -> Self {
        Self {
            token_budget_remaining: None,
            allowed_a2a_agents: vec![],
            always_block_actions: vec![],
            always_approve_actions: vec![],
            allow_pii_in_payload: false,
            require_approval_on_high_risk: true,
        }
    }
}

// ── PII field detection ───────────────────────────────────────────────────────

const PII_FIELD_NAMES: &[&str] = &[
    "email",
    "ssn",
    "dob",
    "date_of_birth",
    "password",
    "card_number",
    "cvv",
    "social_security",
    "passport",
    "national_id",
    "phone",
    "address",
];

fn payload_contains_pii(payload: &serde_json::Value) -> Option<String> {
    let obj = match payload.as_object() {
        Some(o) => o,
        None => return None,
    };
    for key in obj.keys() {
        let lower = key.to_lowercase();
        for pii in PII_FIELD_NAMES {
            if lower.contains(pii) {
                return Some(key.clone());
            }
        }
    }
    None
}

// ── Irreversible method detection ─────────────────────────────────────────────

fn is_irreversible_method(payload: &serde_json::Value) -> bool {
    let method = payload
        .get("method")
        .or_else(|| payload.get("http_method"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_uppercase();
    matches!(method.as_str(), "DELETE" | "DROP" | "PURGE" | "TRUNCATE")
}

// ── Main assessment function ──────────────────────────────────────────────────

/// Assess the runtime risk for a pending action before execution.
///
/// `tool_name`          — logical tool identifier (e.g. `"send_email"`, `"rest_call"`)
/// `connector_family`   — `"direct_http"`, `"mcp"`, `"a2a"`, `"internal"`
/// `target`             — target URL host (for `direct_http`) or agent ID (for `a2a`)
/// `payload`            — the action request body
/// `policy`             — resolved per-node policy from the compiled IR
pub fn assess_action_risk(
    tool_name: &str,
    connector_family: &str,
    target: &str,
    payload: &serde_json::Value,
    policy: &PolicyRiskConfig,
) -> RiskAssessment {
    let mut reasons: Vec<String> = vec![];
    let mut level = RiskLevel::Low;
    let irreversible = is_irreversible_method(payload);

    // ── always_block_actions is an absolute veto ──────────────────────────────
    if policy.always_block_actions.iter().any(|b| b == tool_name) {
        return RiskAssessment {
            level: RiskLevel::Block,
            reasons: vec![format!(
                "Action '{tool_name}' is in the always-block list for this node"
            )],
            requires_approval: false,
            is_irreversible: irreversible,
        };
    }

    // ── a2a target allowlist ──────────────────────────────────────────────────
    if connector_family == "a2a"
        && !policy.allowed_a2a_agents.is_empty()
        && !policy.allowed_a2a_agents.iter().any(|a| a == target)
    {
        return RiskAssessment {
            level: RiskLevel::Block,
            reasons: vec![format!(
                "A2A delegation target '{target}' is not in this node's allowed_a2a_agents list"
            )],
            requires_approval: false,
            is_irreversible: false,
        };
    }

    // ── direct_http: host not in outbound_allowlist produces Block ────────────
    // (This check is also done in rest_adapter.rs; kept here so Layer 2 can
    // emit a structured SSE event before the adapter runs.)
    if connector_family == "direct_http" && target.is_empty() {
        reasons.push("direct_http action has no target URL".to_string());
        escalate(&mut level, RiskLevel::Block);
    }

    // ── irreversible HTTP method ──────────────────────────────────────────────
    if irreversible {
        reasons.push(format!(
            "Action payload requests an irreversible operation (DELETE/DROP/PURGE/TRUNCATE)"
        ));
        escalate(&mut level, RiskLevel::High);
    }

    // ── direct_http mutating methods ─────────────────────────────────────────
    if connector_family == "direct_http" && !irreversible {
        let method = payload
            .get("method")
            .or_else(|| payload.get("http_method"))
            .and_then(|v| v.as_str())
            .unwrap_or("GET")
            .to_uppercase();
        if matches!(method.as_str(), "DELETE" | "PATCH" | "PUT" | "POST") {
            reasons.push(format!("direct_http action uses mutating method {method}"));
            escalate(&mut level, RiskLevel::Medium);
        }
    }

    // ── PII fields in payload ─────────────────────────────────────────────────
    if !policy.allow_pii_in_payload {
        if let Some(field) = payload_contains_pii(payload) {
            reasons.push(format!("Payload contains potential PII field '{field}'"));
            escalate(&mut level, RiskLevel::Medium);
        }
    }

    // ── token budget guard ────────────────────────────────────────────────────
    if let Some(budget) = policy.token_budget_remaining {
        if let Some(est) = payload.get("estimated_tokens").and_then(|v| v.as_u64()) {
            if est > (budget as u64 * 4 / 5) {
                reasons.push(format!(
                    "Estimated token cost {est} exceeds 80% of remaining budget {budget}"
                ));
                escalate(&mut level, RiskLevel::Medium);
            }
        }
    }

    // ── live side-effects on production ──────────────────────────────────────
    let side_effects = payload
        .get("side_effects")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let delivery_tier = payload
        .get("delivery_tier")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if side_effects == "live" && delivery_tier == "production" {
        reasons.push("Action has live side-effects in the production delivery tier".to_string());
        escalate(&mut level, RiskLevel::High);
    }

    // ── always_approve_actions bypasses Layer 3 ───────────────────────────────
    let always_approved = policy.always_approve_actions.iter().any(|a| a == tool_name);
    if always_approved && level != RiskLevel::Block {
        // Downgrade to Low regardless of other signals; bypass approval gate.
        level = RiskLevel::Low;
        reasons.clear();
    }

    let requires_approval =
        policy.require_approval_on_high_risk && level == RiskLevel::High && !always_approved;

    if reasons.is_empty() {
        RiskAssessment::low()
    } else {
        RiskAssessment {
            level,
            reasons,
            requires_approval,
            is_irreversible: irreversible,
        }
    }
}

/// Escalate `current` to `next` if `next` is higher severity.
fn escalate(current: &mut RiskLevel, next: RiskLevel) {
    let ord = |l: &RiskLevel| match l {
        RiskLevel::Low => 0u8,
        RiskLevel::Medium => 1,
        RiskLevel::High => 2,
        RiskLevel::Block => 3,
    };
    if ord(&next) > ord(current) {
        *current = next;
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn default_policy() -> PolicyRiskConfig {
        PolicyRiskConfig::default()
    }

    #[test]
    fn block_when_tool_in_always_block_list() {
        let mut policy = default_policy();
        policy.always_block_actions = vec!["drop_database".to_string()];
        let r = assess_action_risk("drop_database", "internal", "", &json!({}), &policy);
        assert_eq!(r.level, RiskLevel::Block);
        assert!(!r.reasons.is_empty());
    }

    #[test]
    fn block_when_a2a_target_not_in_allowlist() {
        let mut policy = default_policy();
        policy.allowed_a2a_agents = vec!["agent:allowed@example.com".to_string()];
        let r = assess_action_risk(
            "delegate",
            "a2a",
            "agent:rogue@evil.example",
            &json!({}),
            &policy,
        );
        assert_eq!(r.level, RiskLevel::Block);
        assert!(r.reasons[0].contains("allowed_a2a_agents"));
    }

    #[test]
    fn high_risk_for_delete_on_direct_http() {
        let r = assess_action_risk(
            "rest_call",
            "direct_http",
            "https://api.example.com",
            &json!({"method": "DELETE"}),
            &default_policy(),
        );
        assert_eq!(r.level, RiskLevel::High);
        assert!(r.is_irreversible);
    }

    #[test]
    fn medium_risk_for_pii_field_in_payload() {
        let r = assess_action_risk(
            "send_email",
            "mcp",
            "mcp.email.server",
            &json!({"email": "user@example.com", "subject": "Hello"}),
            &default_policy(),
        );
        assert_eq!(r.level, RiskLevel::Medium);
        assert!(r.reasons.iter().any(|r| r.contains("PII")));
    }

    #[test]
    fn pii_allowed_when_flag_set() {
        let mut policy = default_policy();
        policy.allow_pii_in_payload = true;
        let r = assess_action_risk(
            "send_email",
            "mcp",
            "",
            &json!({"email": "user@example.com"}),
            &policy,
        );
        assert_eq!(r.level, RiskLevel::Low);
    }

    #[test]
    fn low_risk_for_readonly_action() {
        let r = assess_action_risk(
            "web_search",
            "internal",
            "",
            &json!({"query": "rust async"}),
            &default_policy(),
        );
        assert_eq!(r.level, RiskLevel::Low);
        assert!(!r.requires_approval);
    }

    #[test]
    fn always_approve_bypasses_layer3_even_for_high_risk() {
        let mut policy = default_policy();
        policy.always_approve_actions = vec!["special_action".to_string()];
        // DELETE on direct_http would normally be High
        let r = assess_action_risk(
            "special_action",
            "direct_http",
            "https://api.example.com",
            &json!({"method": "DELETE"}),
            &policy,
        );
        // Downgraded to Low, no approval required
        assert_eq!(r.level, RiskLevel::Low);
        assert!(!r.requires_approval);
    }

    #[test]
    fn is_irreversible_for_purge_method() {
        let r = assess_action_risk(
            "purge_cache",
            "direct_http",
            "https://cdn.example.com",
            &json!({"method": "PURGE"}),
            &default_policy(),
        );
        assert!(r.is_irreversible);
    }

    #[test]
    fn requires_approval_when_high_and_flag_set() {
        let mut policy = default_policy();
        policy.require_approval_on_high_risk = true;
        // live side-effects on production → High
        let r = assess_action_risk(
            "publish",
            "direct_http",
            "https://api.example.com",
            &json!({"side_effects": "live", "delivery_tier": "production"}),
            &policy,
        );
        assert_eq!(r.level, RiskLevel::High);
        assert!(r.requires_approval);
    }
}
