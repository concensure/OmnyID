//! Versioned Decision Pattern contracts for the wedding vendor workflow.
//!
//! Patterns describe semantics and verification rules only. They never contain
//! JSX/HTML or duplicate vendor/quote truth from AFP.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const VENDOR_SELECTION_PATTERN_ID: &str = "wedding.vendor_selection";
pub const VENDOR_QUOTE_RESPONSE_PATTERN_ID: &str = "wedding.vendor_quote_response";
pub const WEDDING_PATTERN_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PatternVerificationOutcome {
    Valid,
    ValidWithOptionalGaps,
    BlockedMissingData,
    BlockedStaleData,
    BlockedConflict,
    PatternGap,
}

impl PatternVerificationOutcome {
    pub fn allows_projection(self) -> bool {
        matches!(self, Self::Valid | Self::ValidWithOptionalGaps)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct DecisionPattern {
    pub id: &'static str,
    pub version: u32,
    pub supported_situation_types: &'static [&'static str],
    pub required_inputs: &'static [&'static str],
    pub optional_inputs: &'static [&'static str],
    pub required_evidence: &'static [&'static str],
    pub semantic_slots: &'static [&'static str],
    pub allowed_actions: &'static [&'static str],
    pub execution_contracts: &'static [&'static str],
    pub postponement_policy: &'static str,
    pub completion_conditions: &'static [&'static str],
    pub projection_recipe: &'static str,
}

const VENDOR_SELECTION_ACTIONS: &[&str] = &[
    "CHECK_AVAILABILITY_AND_REQUEST_QUOTE",
    "REQUEST_QUOTE",
    "REVIEW_QUOTE",
    "START_PURCHASE_OR_BOOKING",
    "VIEW_EVIDENCE",
];

const VENDOR_QUOTE_ACTIONS: &[&str] = &[
    "ACCEPT_VENDOR",
    "NEGOTIATE_QUOTE",
    "EXPLORE_ALTERNATIVE",
    "DEFER_DECISION",
];

const VENDOR_SELECTION: DecisionPattern = DecisionPattern {
    id: VENDOR_SELECTION_PATTERN_ID,
    version: WEDDING_PATTERN_VERSION,
    supported_situation_types: &["vendor_shortlist_ready", "vendor_comparison_revised"],
    required_inputs: &["wedding_plan_id", "category", "candidate_count"],
    optional_inputs: &[
        "budget_context",
        "guest_count",
        "date_or_season",
        "preferences",
    ],
    required_evidence: &[
        "candidate_identities",
        "candidate_sources",
        "request_routes",
    ],
    semantic_slots: &["recommendation", "evidence", "unknowns", "request_action"],
    allowed_actions: VENDOR_SELECTION_ACTIONS,
    execution_contracts: &["wedding.vendor_outreach@1"],
    postponement_policy: "create a successor comparison on material intake/evidence change",
    completion_conditions: &[
        "vendor_selected",
        "comparison_superseded",
        "category_booked",
    ],
    projection_recipe: "wedding.vendor_selection.card@1",
};

const VENDOR_QUOTE_RESPONSE: DecisionPattern = DecisionPattern {
    id: VENDOR_QUOTE_RESPONSE_PATTERN_ID,
    version: WEDDING_PATTERN_VERSION,
    supported_situation_types: &["vendor_quote_received", "vendor_quote_materially_changed"],
    required_inputs: &[
        "decision_id",
        "quote_message_id",
        "quote_thread_id",
        "vendor_identity",
    ],
    optional_inputs: &[
        "amount",
        "currency",
        "scope",
        "valid_until",
        "budget_context",
        "preference_refs",
    ],
    required_evidence: &["source_quote", "vendor_thread"],
    semantic_slots: &[
        "decision",
        "evidence",
        "unknowns",
        "safety_envelope",
        "execution_preview",
    ],
    allowed_actions: VENDOR_QUOTE_ACTIONS,
    execution_contracts: &["wedding.vendor_quote_reply@1"],
    postponement_policy: "resurface on comfortable date, material change, risk threshold, or user request",
    completion_conditions: &[
        "vendor_accepted",
        "negotiation_sent",
        "alternative_selected",
        "quote_superseded",
        "quote_expired",
    ],
    projection_recipe: "wedding.vendor_quote_response.card@1",
};

pub fn registered_pattern(id: &str, version: u32) -> Option<&'static DecisionPattern> {
    match (id, version) {
        (VENDOR_SELECTION_PATTERN_ID, WEDDING_PATTERN_VERSION) => Some(&VENDOR_SELECTION),
        (VENDOR_QUOTE_RESPONSE_PATTERN_ID, WEDDING_PATTERN_VERSION) => Some(&VENDOR_QUOTE_RESPONSE),
        _ => None,
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PatternVerificationInput {
    pub pattern_id: String,
    pub pattern_version: u32,
    pub situation_type: String,
    pub present_inputs: BTreeSet<String>,
    pub present_evidence: BTreeSet<String>,
    pub allowed_actions: BTreeSet<String>,
    pub execution_contracts: BTreeSet<String>,
    pub stale_evidence: BTreeSet<String>,
    pub conflicting_evidence: BTreeSet<String>,
    pub optional_gaps: BTreeSet<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct PatternVerification {
    pub outcome: PatternVerificationOutcome,
    pub pattern_id: String,
    pub pattern_version: u32,
    pub missing_inputs: Vec<String>,
    pub missing_evidence: Vec<String>,
    pub missing_actions: Vec<String>,
    pub missing_execution_contracts: Vec<String>,
    pub stale_evidence: Vec<String>,
    pub conflicting_evidence: Vec<String>,
    pub optional_gaps: Vec<String>,
}

fn missing(required: &[&str], actual: &BTreeSet<String>) -> Vec<String> {
    required
        .iter()
        .filter(|value| !actual.contains(**value))
        .map(|value| (*value).to_string())
        .collect()
}

pub fn verify_pattern(input: PatternVerificationInput) -> PatternVerification {
    let Some(pattern) = registered_pattern(&input.pattern_id, input.pattern_version) else {
        return PatternVerification {
            outcome: PatternVerificationOutcome::PatternGap,
            pattern_id: input.pattern_id,
            pattern_version: input.pattern_version,
            missing_inputs: vec![],
            missing_evidence: vec![],
            missing_actions: vec![],
            missing_execution_contracts: vec![],
            stale_evidence: vec![],
            conflicting_evidence: vec![],
            optional_gaps: vec![],
        };
    };

    let missing_inputs = missing(pattern.required_inputs, &input.present_inputs);
    let missing_evidence = missing(pattern.required_evidence, &input.present_evidence);
    let missing_actions = missing(pattern.allowed_actions, &input.allowed_actions);
    let missing_execution_contracts =
        missing(pattern.execution_contracts, &input.execution_contracts);
    let stale_evidence = input.stale_evidence.into_iter().collect::<Vec<_>>();
    let conflicting_evidence = input.conflicting_evidence.into_iter().collect::<Vec<_>>();
    let optional_gaps = input.optional_gaps.into_iter().collect::<Vec<_>>();
    let situation_supported = pattern
        .supported_situation_types
        .contains(&input.situation_type.as_str());

    let outcome = if !situation_supported {
        PatternVerificationOutcome::PatternGap
    } else if !conflicting_evidence.is_empty() {
        PatternVerificationOutcome::BlockedConflict
    } else if !stale_evidence.is_empty() {
        PatternVerificationOutcome::BlockedStaleData
    } else if !missing_inputs.is_empty()
        || !missing_evidence.is_empty()
        || !missing_actions.is_empty()
        || !missing_execution_contracts.is_empty()
    {
        PatternVerificationOutcome::BlockedMissingData
    } else if !optional_gaps.is_empty() {
        PatternVerificationOutcome::ValidWithOptionalGaps
    } else {
        PatternVerificationOutcome::Valid
    };

    PatternVerification {
        outcome,
        pattern_id: pattern.id.to_string(),
        pattern_version: pattern.version,
        missing_inputs,
        missing_evidence,
        missing_actions,
        missing_execution_contracts,
        stale_evidence,
        conflicting_evidence,
        optional_gaps,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn production_policy_is_machine_readable_and_matches_contract_constants() {
        let policy: Value =
            serde_json::from_str(include_str!("../config/wedding_vendor_production_v1.json"))
                .expect("production policy JSON");
        assert_eq!(policy["schema_version"], 1);
        assert_eq!(
            policy["decision_patterns"][0],
            format!("{VENDOR_SELECTION_PATTERN_ID}@{WEDDING_PATTERN_VERSION}")
        );
        assert_eq!(
            policy["decision_patterns"][1],
            format!("{VENDOR_QUOTE_RESPONSE_PATTERN_ID}@{WEDDING_PATTERN_VERSION}")
        );
        assert_eq!(policy["account_storage_bytes"]["free"], 1_073_741_824u64);
        assert_eq!(policy["account_storage_bytes"]["paid"], 2_147_483_648u64);
        assert_eq!(policy["slos"]["duplicate_external_sends_max"], 0);
        assert_eq!(policy["slos"]["missed_critical_deadlines_max"], 0);
        assert_eq!(
            policy["required_ga_approvals"].as_array().map(Vec::len),
            Some(4)
        );
    }

    fn set(values: &[&str]) -> BTreeSet<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    fn quote_input() -> PatternVerificationInput {
        PatternVerificationInput {
            pattern_id: VENDOR_QUOTE_RESPONSE_PATTERN_ID.to_string(),
            pattern_version: 1,
            situation_type: "vendor_quote_received".to_string(),
            present_inputs: set(&[
                "decision_id",
                "quote_message_id",
                "quote_thread_id",
                "vendor_identity",
            ]),
            present_evidence: set(&["source_quote", "vendor_thread"]),
            allowed_actions: set(VENDOR_QUOTE_ACTIONS),
            execution_contracts: set(&["wedding.vendor_quote_reply@1"]),
            ..Default::default()
        }
    }

    #[test]
    fn registry_contains_both_wedding_patterns() {
        assert!(registered_pattern(VENDOR_SELECTION_PATTERN_ID, 1).is_some());
        assert!(registered_pattern(VENDOR_QUOTE_RESPONSE_PATTERN_ID, 1).is_some());
        assert!(registered_pattern(VENDOR_QUOTE_RESPONSE_PATTERN_ID, 2).is_none());
    }

    #[test]
    fn verifier_allows_quote_with_labelled_optional_gaps() {
        let mut input = quote_input();
        input.optional_gaps = set(&["amount", "valid_until"]);
        let verification = verify_pattern(input);
        assert_eq!(
            verification.outcome,
            PatternVerificationOutcome::ValidWithOptionalGaps
        );
        assert!(verification.outcome.allows_projection());
    }

    #[test]
    fn verifier_blocks_missing_contract_and_conflicts_before_projection() {
        let mut missing_contract = quote_input();
        missing_contract.execution_contracts.clear();
        assert_eq!(
            verify_pattern(missing_contract).outcome,
            PatternVerificationOutcome::BlockedMissingData
        );

        let mut conflict = quote_input();
        conflict.conflicting_evidence = set(&["quote_amount"]);
        assert_eq!(
            verify_pattern(conflict).outcome,
            PatternVerificationOutcome::BlockedConflict
        );
    }

    #[test]
    fn unknown_legacy_pattern_is_an_explicit_gap() {
        let mut input = quote_input();
        input.pattern_id = "legacy.unknown".to_string();
        assert_eq!(
            verify_pattern(input).outcome,
            PatternVerificationOutcome::PatternGap
        );
    }
}
