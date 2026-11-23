/// Policy engine: governs which task types are allowed under which masks,
/// what capabilities each task grants, and when human approval is required.
///
/// Inspired by the Clawith multi-agent security model (Apache 2.0).

// ── Allowed task types ────────────────────────────────────────────────────────

pub const ALLOWED_TASK_TYPES: &[&str] = &[
    "email_triage",
    "calendar",
    "study_planning",
    "web_research",
    "note",
    "database",
];

// ── Mask / task policy ────────────────────────────────────────────────────────
//
// Lists the masks under which each task type is permitted.
// A task requesting a mask not in its list is blocked before execution.

const EMAIL_TRIAGE_MASKS: &[&str] = &["private", "team"];
const CALENDAR_MASKS: &[&str] = &["private", "team"];
const STUDY_PLANNING_MASKS: &[&str] = &["private"];
const WEB_RESEARCH_MASKS: &[&str] = &["private", "team", "public"];
const NOTE_MASKS: &[&str] = &["private", "team", "public"];
const DATABASE_MASKS: &[&str] = &["private", "team"];

// ── Capability policy ─────────────────────────────────────────────────────────
//
// Narrowest set of capabilities granted to a sub-agent for each task type.

const EMAIL_TRIAGE_CAPS: &[&str] = &["read_email_metadata", "summarise"];
const CALENDAR_CAPS: &[&str] = &["read_calendar", "summarise"];
const STUDY_PLANNING_CAPS: &[&str] = &["plan"];
const WEB_RESEARCH_CAPS: &[&str] = &["web_search", "summarise"];
const NOTE_CAPS: &[&str] = &["read_notes", "write_notes"];
const DATABASE_CAPS: &[&str] = &["read_database"];

// ── Mask transitions that require human approval ──────────────────────────────
//
// Any move from a more-private to a more-public mask must go through a gate.

const APPROVAL_REQUIRED_TRANSITIONS: &[(&str, &str)] = &[("private", "public"), ("team", "public")];

// ── Tier policy ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct TierPolicy {
    pub plan: &'static str,
    pub monthly_price_usd: f64,
    pub est_monthly_revenue_usd: f64,
    pub max_stage: u32,
    pub max_cost_cents_per_run: u32,
}

// ── PolicyEngine ─────────────────────────────────────────────────────────────

pub struct PolicyEngine;

impl PolicyEngine {
    /// Returns `true` if the given `task_type` is allowed to run under `mask`.
    pub fn can_run(task_type: &str, mask: &str) -> bool {
        let allowed_masks: &[&str] = match task_type {
            "email_triage" => EMAIL_TRIAGE_MASKS,
            "calendar" => CALENDAR_MASKS,
            "study_planning" => STUDY_PLANNING_MASKS,
            "web_research" => WEB_RESEARCH_MASKS,
            "note" => NOTE_MASKS,
            "database" => DATABASE_MASKS,
            _ => return false,
        };
        allowed_masks.contains(&mask)
    }

    /// Returns `true` when transitioning from `from_mask` to `to_mask` requires
    /// a human approval gate before proceeding.
    pub fn requires_human_approval(from_mask: &str, to_mask: &str) -> bool {
        APPROVAL_REQUIRED_TRANSITIONS.contains(&(from_mask, to_mask))
    }

    /// Returns the narrowest set of capabilities allowed for a given task type.
    pub fn capabilities_for_task(task_type: &str) -> &'static [&'static str] {
        match task_type {
            "email_triage" => EMAIL_TRIAGE_CAPS,
            "calendar" => CALENDAR_CAPS,
            "study_planning" => STUDY_PLANNING_CAPS,
            "web_research" => WEB_RESEARCH_CAPS,
            "note" => NOTE_CAPS,
            "database" => DATABASE_CAPS,
            _ => &[],
        }
    }

    /// Returns `true` if `task_type` is in the global allow-list.
    pub fn is_allowed_task_type(task_type: &str) -> bool {
        ALLOWED_TASK_TYPES.contains(&task_type)
    }

    /// Returns the billing / cost-guardrail policy for a subscription tier.
    pub fn tier_policy(plan: &str) -> TierPolicy {
        match plan {
            "pro" => TierPolicy {
                plan: "pro",
                monthly_price_usd: 29.0,
                est_monthly_revenue_usd: 29.0,
                max_stage: 10,
                max_cost_cents_per_run: 10,
            },
            "team" => TierPolicy {
                plan: "team",
                monthly_price_usd: 79.0,
                est_monthly_revenue_usd: 79.0,
                max_stage: 20,
                max_cost_cents_per_run: 25,
            },
            _ => TierPolicy {
                plan: "free",
                monthly_price_usd: 0.0,
                est_monthly_revenue_usd: 0.0,
                max_stage: 5,
                max_cost_cents_per_run: 2,
            },
        }
    }

    /// Returns the expensive node kinds allowed for a given template.
    pub fn allowed_expensive_nodes_for_template(template_id: &str) -> Vec<&'static str> {
        match template_id {
            "travel_booker" => vec!["web_search", "form_fill", "booking_confirm"],
            "finance_guardian" => vec!["web_search", "spreadsheet_write"],
            "study_planner" => vec!["web_search"],
            _ => vec![],
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_triage_not_allowed_under_public_mask() {
        assert!(!PolicyEngine::can_run("email_triage", "public"));
        assert!(PolicyEngine::can_run("email_triage", "private"));
        assert!(PolicyEngine::can_run("email_triage", "team"));
    }

    #[test]
    fn study_planning_only_allowed_under_private() {
        assert!(PolicyEngine::can_run("study_planning", "private"));
        assert!(!PolicyEngine::can_run("study_planning", "team"));
        assert!(!PolicyEngine::can_run("study_planning", "public"));
    }

    #[test]
    fn private_to_public_requires_approval() {
        assert!(PolicyEngine::requires_human_approval("private", "public"));
        assert!(PolicyEngine::requires_human_approval("team", "public"));
        assert!(!PolicyEngine::requires_human_approval("private", "team"));
        assert!(!PolicyEngine::requires_human_approval("public", "public"));
    }

    #[test]
    fn capabilities_for_known_and_unknown_types() {
        let caps = PolicyEngine::capabilities_for_task("email_triage");
        assert!(caps.contains(&"summarise"));
        assert!(caps.contains(&"read_email_metadata"));

        let unknown = PolicyEngine::capabilities_for_task("unknown_type");
        assert!(unknown.is_empty());
    }

    #[test]
    fn unknown_task_type_is_blocked() {
        assert!(!PolicyEngine::can_run("shell_execute", "private"));
        assert!(!PolicyEngine::is_allowed_task_type("shell_execute"));
        assert!(PolicyEngine::is_allowed_task_type("email_triage"));
    }
}
