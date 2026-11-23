/// Model Broker (Phase 13 Step 11) — assigns the cheapest acceptable model to
/// each workflow node kind, reducing token cost without sacrificing quality.
///
/// Rule of thumb:
/// - Structural / routing nodes (goal_intake, reflection, condition) → haiku
///   These nodes produce short structured outputs and don't need deep reasoning.
/// - Planning / delegation / agent nodes → sonnet
///   These need reliable multi-step reasoning.
/// - Background daemon nodes → always haiku unless overridden.
/// - Any node where estimated input tokens > 50 000 → downgrade to haiku if
///   the monthly budget is low.
///
/// The assignment is advisory — callers may override for specific workflows.
/// The reason string is surfaced in the execution trace so users can understand
/// why a cheaper model was chosen.
use serde::{Deserialize, Serialize};

// ── Well-known model IDs ───────────────────────────────────────────────────────

pub const HAIKU: &str = "claude-haiku-4-5-20251001";
pub const SONNET: &str = "claude-sonnet-4-6";

// Approximate cost floor in micro-cents per 1 000 input tokens (for gating only;
// not used for billing — just to decide whether to downgrade).
const HAIKU_COST_PER_1K: u32 = 25; // ~$0.00025 / 1k tokens
const SONNET_COST_PER_1K: u32 = 300; // ~$0.003  / 1k tokens

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModelTier {
    Haiku,
    Sonnet,
}

impl ModelTier {
    pub fn model_id(&self) -> &'static str {
        match self {
            ModelTier::Haiku => HAIKU,
            ModelTier::Sonnet => SONNET,
        }
    }
    pub fn cost_per_1k(&self) -> u32 {
        match self {
            ModelTier::Haiku => HAIKU_COST_PER_1K,
            ModelTier::Sonnet => SONNET_COST_PER_1K,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelAssignment {
    pub model_id: String,
    pub tier: ModelTier,
    pub reason: String,
    /// Estimated cost in micro-cents for `estimated_tokens` at this model's rate.
    pub estimated_cost_micro_cents: u32,
}

impl ModelAssignment {
    fn new(tier: ModelTier, reason: &str, estimated_tokens: u32) -> Self {
        let cost = tier.cost_per_1k() * (estimated_tokens / 1_000).max(1);
        Self {
            model_id: tier.model_id().to_string(),
            estimated_cost_micro_cents: cost,
            reason: reason.to_string(),
            tier,
        }
    }
}

// ── Broker ────────────────────────────────────────────────────────────────────

/// Select the cheapest acceptable model for a node.
///
/// `node_kind`                 — e.g. `"agent"`, `"tool"`, `"plan"`, `"daemon"`
/// `capability_id`             — capability being exercised (e.g. `"web_search"`)
/// `estimated_tokens`          — expected input+output tokens for this node turn
/// `monthly_budget_remaining_cents` — remaining budget in US cents × 100 (i.e. micro-cents)
/// `allow_premium`             — true for paid users; false locks to haiku
pub fn select_model_for_node(
    node_kind: &str,
    capability_id: &str,
    estimated_tokens: u32,
    monthly_budget_remaining_micro_cents: i64,
    allow_premium: bool,
) -> ModelAssignment {
    // Hard cap: free users always get haiku.
    if !allow_premium {
        return ModelAssignment::new(ModelTier::Haiku, "free tier — haiku only", estimated_tokens);
    }

    // Budget guard: if estimated cost at sonnet rate would exceed 80% of remaining
    // budget, downgrade to haiku.
    let sonnet_cost = (SONNET_COST_PER_1K as i64) * (estimated_tokens as i64 / 1_000).max(1);
    if monthly_budget_remaining_micro_cents > 0
        && sonnet_cost > monthly_budget_remaining_micro_cents * 4 / 5
    {
        return ModelAssignment::new(
            ModelTier::Haiku,
            "budget guard — estimated cost exceeds 80% of remaining monthly budget",
            estimated_tokens,
        );
    }

    // Node-kind routing.
    match node_kind {
        // Structural / routing — cheap, short outputs, no deep reasoning needed.
        "goal_intake"
        | "ambiguity"
        | "context"
        | "reflection"
        | "condition"
        | "termination"
        | "merge"
        | "termination_runtime"
        | "merge_runtime" => ModelAssignment::new(
            ModelTier::Haiku,
            "structural node — haiku is sufficient for routing and short outputs",
            estimated_tokens,
        ),

        // Background daemons — always async, never interactive, cost must be minimal.
        "daemon" | "subscription" => ModelAssignment::new(
            ModelTier::Haiku,
            "background daemon — always haiku to minimise persistent background cost",
            estimated_tokens,
        ),

        // Tool / executor — depends on capability.
        "tool" | "executor" | "capability_router" => {
            if needs_reasoning(capability_id) {
                ModelAssignment::new(
                    ModelTier::Sonnet,
                    "tool node with reasoning capability — sonnet for reliability",
                    estimated_tokens,
                )
            } else {
                ModelAssignment::new(
                    ModelTier::Haiku,
                    "tool node with simple capability — haiku sufficient",
                    estimated_tokens,
                )
            }
        }

        // Planning, delegation, agent — need reliable multi-step reasoning.
        "plan" | "delegation" | "agent" | "custom_node_builder" => ModelAssignment::new(
            ModelTier::Sonnet,
            "planning/delegation node — sonnet for multi-step reasoning quality",
            estimated_tokens,
        ),

        // Policy and approval — short outputs; haiku handles policy text well.
        "policy" | "approval" | "approval_runtime" => ModelAssignment::new(
            ModelTier::Haiku,
            "policy/approval node — haiku is sufficient for structured decision output",
            estimated_tokens,
        ),

        // Trigger — no LLM call needed at all; return haiku as a safe default.
        "trigger" => ModelAssignment::new(
            ModelTier::Haiku,
            "trigger node — no LLM inference required",
            estimated_tokens,
        ),

        // Unknown kinds → sonnet to be safe.
        _ => ModelAssignment::new(
            ModelTier::Sonnet,
            "unknown node kind — defaulting to sonnet",
            estimated_tokens,
        ),
    }
}

/// Returns true for capability IDs that require multi-step reasoning
/// (as opposed to simple retrieval or formatting tasks).
fn needs_reasoning(capability_id: &str) -> bool {
    matches!(
        capability_id,
        "plan"
            | "summarise"
            | "synthesize"
            | "code_sandbox"
            | "document_generation"
            | "web_research"
    )
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_tier_always_haiku() {
        let a = select_model_for_node("agent", "web_search", 1_000, 100_000, false);
        assert_eq!(a.tier, ModelTier::Haiku);
        assert!(a.reason.contains("free tier"));
    }

    #[test]
    fn structural_nodes_get_haiku() {
        for kind in &[
            "goal_intake",
            "reflection",
            "condition",
            "termination",
            "merge",
        ] {
            let a = select_model_for_node(kind, "any", 1_000, 100_000, true);
            assert_eq!(a.tier, ModelTier::Haiku, "kind={kind} should be haiku");
        }
    }

    #[test]
    fn daemon_always_haiku() {
        let a = select_model_for_node("daemon", "knowledge_curator", 5_000, 100_000, true);
        assert_eq!(a.tier, ModelTier::Haiku);
    }

    #[test]
    fn planning_nodes_get_sonnet() {
        for kind in &["plan", "agent", "delegation"] {
            let a = select_model_for_node(kind, "plan", 2_000, 100_000, true);
            assert_eq!(a.tier, ModelTier::Sonnet, "kind={kind} should be sonnet");
        }
    }

    #[test]
    fn tool_node_summarise_gets_sonnet() {
        let a = select_model_for_node("tool", "summarise", 2_000, 100_000, true);
        assert_eq!(a.tier, ModelTier::Sonnet);
    }

    #[test]
    fn tool_node_simple_capability_gets_haiku() {
        let a = select_model_for_node("tool", "read_email_metadata", 1_000, 100_000, true);
        assert_eq!(a.tier, ModelTier::Haiku);
    }

    #[test]
    fn budget_guard_downgrades_to_haiku() {
        // Estimated 10k tokens at sonnet = 3000 micro-cents. Budget = 2000 → guard fires.
        let a = select_model_for_node("agent", "plan", 10_000, 2_000, true);
        assert_eq!(a.tier, ModelTier::Haiku);
        assert!(a.reason.contains("budget guard"));
    }

    #[test]
    fn sufficient_budget_keeps_sonnet_for_agent() {
        let a = select_model_for_node("agent", "plan", 2_000, 100_000, true);
        assert_eq!(a.tier, ModelTier::Sonnet);
    }

    #[test]
    fn policy_approval_nodes_get_haiku() {
        let a = select_model_for_node("policy", "any", 1_000, 100_000, true);
        assert_eq!(a.tier, ModelTier::Haiku);
        let b = select_model_for_node("approval", "any", 1_000, 100_000, true);
        assert_eq!(b.tier, ModelTier::Haiku);
    }
}
