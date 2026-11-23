/*
 * @module-id: rust.schema-proposal
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Schema Proposal â€” agent-authored supertag and metadata schema changes.
///
/// Implements the full lifecycle:
///   propose â†’ validate â†’ (approve | reject) â†’ apply
///
/// The Master Agent proposes new supertags or field additions via AFP messages
/// of type `schema_proposal:propose`.  A human or a trusted sub-agent then
/// approves or rejects.  On approval, `apply_proposal()` validates the proposal
/// against reserved names and conflicts, then returns the set of AFP messages
/// to emit.
///
/// Nothing writes to the DB here â€” callers are responsible for persisting.
use chrono::Utc;
use serde_json::{Value, json};
use ulid::Ulid;

use crate::message::{
    AFP_SUBTYPE_SCHEMA_PROPOSAL_APPLY, AFP_SUBTYPE_SCHEMA_PROPOSAL_APPROVE,
    AFP_SUBTYPE_SCHEMA_PROPOSAL_PROPOSE, AFP_SUBTYPE_SCHEMA_PROPOSAL_REJECT,
    AFP_TYPE_SCHEMA_PROPOSAL, AfpFieldAddition, AfpSchemaDecisionContent, AfpSchemaProposalContent,
    AfpSupertag,
};

// â”€â”€ Reserved names â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Supertag names that cannot be proposed (they're built-in to the AFP schema).
const RESERVED_SUPERTAG_NAMES: &[&str] = &[
    "urgent",
    "important",
    "archived",
    "encrypted",
    "system",
    "internal",
    "watcher",
    "ledger",
    "draft",
    "deleted",
];

/// AFP `type` values that cannot receive new field additions (immutable protocol types).
const IMMUTABLE_TYPES: &[&str] = &["agent_session", "space_create", "space_join", "space_leave"];

// â”€â”€ Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// A validation issue found during proposal review.
#[derive(Debug, Clone)]
pub struct ValidationIssue {
    pub kind: &'static str,
    pub message: String,
}

/// Validate a schema proposal before it can be approved or applied.
///
/// Returns `Ok(())` when the proposal is clean, or `Err(issues)` with a list
/// of blocking problems.
pub fn validate_proposal(proposal: &AfpSchemaProposalContent) -> Result<(), Vec<ValidationIssue>> {
    let mut issues = Vec::new();

    // Check supertag name constraints.
    for tag in &proposal.new_supertags {
        if tag.name.is_empty() {
            issues.push(ValidationIssue {
                kind: "empty_name",
                message: "Supertag name must not be empty.".to_string(),
            });
        }
        if RESERVED_SUPERTAG_NAMES.contains(&tag.name.as_str()) {
            issues.push(ValidationIssue {
                kind: "reserved_name",
                message: format!("'{}' is a reserved supertag name.", tag.name),
            });
        }
        if tag.name.contains(' ') {
            issues.push(ValidationIssue {
                kind: "invalid_format",
                message: format!(
                    "Supertag name '{}' must not contain spaces (use snake_case).",
                    tag.name
                ),
            });
        }
        if tag.name.len() > 64 {
            issues.push(ValidationIssue {
                kind: "name_too_long",
                message: format!("Supertag name '{}' exceeds 64 characters.", tag.name),
            });
        }
    }

    // Check field addition constraints.
    for field in &proposal.field_additions {
        if IMMUTABLE_TYPES.contains(&field.type_name.as_str()) {
            issues.push(ValidationIssue {
                kind: "immutable_type",
                message: format!(
                    "AFP type '{}' is immutable and cannot receive field additions.",
                    field.type_name
                ),
            });
        }
        let valid_types = ["string", "number", "boolean", "array", "object"];
        if !valid_types.contains(&field.field_type.as_str()) {
            issues.push(ValidationIssue {
                kind: "invalid_field_type",
                message: format!(
                    "Field '{}' has unsupported type '{}'. Must be one of: {}.",
                    field.field_name,
                    field.field_type,
                    valid_types.join(", ")
                ),
            });
        }
    }

    // Require at least one change.
    if proposal.new_supertags.is_empty()
        && proposal.field_additions.is_empty()
        && proposal.deprecated_fields.is_empty()
    {
        issues.push(ValidationIssue {
            kind: "empty_proposal",
            message: "Proposal must contain at least one change (supertag, field, or deprecation)."
                .to_string(),
        });
    }

    if issues.is_empty() {
        Ok(())
    } else {
        Err(issues)
    }
}

// â”€â”€ AFP builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Build a `schema_proposal:propose` AFP message.
pub fn build_proposal_afp(
    owner_user_id: &str,
    thread_id: &str,
    proposed_by: &str,
    rationale: &str,
    new_supertags: Vec<AfpSupertag>,
    field_additions: Vec<AfpFieldAddition>,
    deprecated_fields: Vec<String>,
) -> Value {
    let proposal = AfpSchemaProposalContent {
        proposal_id: Ulid::new().to_string(),
        proposed_by: proposed_by.to_string(),
        rationale: rationale.to_string(),
        new_supertags,
        field_additions,
        deprecated_fields,
        proposed_at: Utc::now().to_rfc3339(),
    };
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": proposed_by,
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_SCHEMA_PROPOSAL,
        "subtype": AFP_SUBTYPE_SCHEMA_PROPOSAL_PROPOSE,
        "content": serde_json::to_value(&proposal).unwrap_or(Value::Null),
        "metadata": { "store": true, "requires_approval": true },
        "store_in_relational": true,
    })
}

/// Build a `schema_proposal:approve` AFP message.
pub fn build_approval_afp(
    owner_user_id: &str,
    thread_id: &str,
    decided_by: &str,
    proposal_id: &str,
    reason: Option<&str>,
) -> Value {
    let decision = AfpSchemaDecisionContent {
        proposal_id: proposal_id.to_string(),
        decision: "approved".to_string(),
        decided_by: decided_by.to_string(),
        reason: reason.map(str::to_string),
        applied_at: None,
    };
    _build_decision_afp(
        owner_user_id,
        thread_id,
        decided_by,
        AFP_SUBTYPE_SCHEMA_PROPOSAL_APPROVE,
        &decision,
    )
}

/// Build a `schema_proposal:reject` AFP message.
pub fn build_rejection_afp(
    owner_user_id: &str,
    thread_id: &str,
    decided_by: &str,
    proposal_id: &str,
    reason: Option<&str>,
) -> Value {
    let decision = AfpSchemaDecisionContent {
        proposal_id: proposal_id.to_string(),
        decision: "rejected".to_string(),
        decided_by: decided_by.to_string(),
        reason: reason.map(str::to_string),
        applied_at: None,
    };
    _build_decision_afp(
        owner_user_id,
        thread_id,
        decided_by,
        AFP_SUBTYPE_SCHEMA_PROPOSAL_REJECT,
        &decision,
    )
}

/// Build a `schema_proposal:apply` AFP message â€” emitted after successful application.
pub fn build_apply_afp(owner_user_id: &str, thread_id: &str, proposal_id: &str) -> Value {
    let decision = AfpSchemaDecisionContent {
        proposal_id: proposal_id.to_string(),
        decision: "applied".to_string(),
        decided_by: "schema_proposal_agent".to_string(),
        reason: None,
        applied_at: Some(Utc::now().to_rfc3339()),
    };
    _build_decision_afp(
        owner_user_id,
        thread_id,
        "schema_proposal_agent",
        AFP_SUBTYPE_SCHEMA_PROPOSAL_APPLY,
        &decision,
    )
}

fn _build_decision_afp(
    owner_user_id: &str,
    thread_id: &str,
    from: &str,
    subtype: &str,
    decision: &AfpSchemaDecisionContent,
) -> Value {
    json!({
        "protocol": "afp-v1",
        "id": Ulid::new().to_string(),
        "thread_id": thread_id,
        "from": from,
        "to": [owner_user_id],
        "timestamp": Utc::now().to_rfc3339(),
        "type": AFP_TYPE_SCHEMA_PROPOSAL,
        "subtype": subtype,
        "content": serde_json::to_value(decision).unwrap_or(Value::Null),
        "metadata": { "store": true },
        "store_in_relational": true,
    })
}

// â”€â”€ Lifecycle orchestrator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Attempt to apply a proposal: validate it, and if clean return the `apply`
/// AFP message.  Returns `Err` with rejection AFP message if validation fails.
pub fn apply_proposal(
    owner_user_id: &str,
    thread_id: &str,
    proposal: &AfpSchemaProposalContent,
) -> Result<Value, Value> {
    match validate_proposal(proposal) {
        Ok(()) => Ok(build_apply_afp(
            owner_user_id,
            thread_id,
            &proposal.proposal_id,
        )),
        Err(issues) => {
            let reason = issues
                .iter()
                .map(|i| i.message.as_str())
                .collect::<Vec<_>>()
                .join("; ");
            Err(build_rejection_afp(
                owner_user_id,
                thread_id,
                "schema_proposal_agent",
                &proposal.proposal_id,
                Some(&reason),
            ))
        }
    }
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[cfg(test)]
mod tests {
    use super::*;

    fn supertag(name: &str) -> AfpSupertag {
        AfpSupertag {
            name: name.to_string(),
            ..Default::default()
        }
    }

    fn simple_proposal(supertags: Vec<AfpSupertag>) -> AfpSchemaProposalContent {
        AfpSchemaProposalContent {
            proposal_id: "prop_01".to_string(),
            proposed_by: "master_agent".to_string(),
            rationale: "Adds project tracking tags.".to_string(),
            new_supertags: supertags,
            proposed_at: Utc::now().to_rfc3339(),
            ..Default::default()
        }
    }

    #[test]
    fn valid_proposal_passes_validation() {
        let proposal = simple_proposal(vec![supertag("project_phase")]);
        assert!(validate_proposal(&proposal).is_ok());
    }

    #[test]
    fn reserved_supertag_name_fails() {
        let proposal = simple_proposal(vec![supertag("urgent")]);
        let result = validate_proposal(&proposal);
        assert!(result.is_err());
        let issues = result.unwrap_err();
        assert!(issues.iter().any(|i| i.kind == "reserved_name"));
    }

    #[test]
    fn supertag_with_space_fails() {
        let proposal = simple_proposal(vec![supertag("my tag")]);
        assert!(validate_proposal(&proposal).is_err());
    }

    #[test]
    fn empty_proposal_fails() {
        let proposal = AfpSchemaProposalContent {
            proposal_id: "prop_01".to_string(),
            proposed_by: "agent".to_string(),
            rationale: "Nothing here.".to_string(),
            proposed_at: Utc::now().to_rfc3339(),
            ..Default::default()
        };
        let result = validate_proposal(&proposal);
        assert!(result.is_err());
    }

    #[test]
    fn invalid_field_type_fails() {
        let mut proposal = AfpSchemaProposalContent {
            proposal_id: "prop_01".to_string(),
            proposed_by: "agent".to_string(),
            rationale: "Add a field.".to_string(),
            proposed_at: Utc::now().to_rfc3339(),
            ..Default::default()
        };
        proposal.field_additions.push(AfpFieldAddition {
            type_name: "note".to_string(),
            field_name: "priority".to_string(),
            field_type: "uuid".to_string(), // invalid
            ..Default::default()
        });
        assert!(validate_proposal(&proposal).is_err());
    }

    #[test]
    fn immutable_type_field_addition_fails() {
        let mut proposal = simple_proposal(vec![supertag("test_tag")]);
        proposal.field_additions.push(AfpFieldAddition {
            type_name: "agent_session".to_string(), // immutable
            field_name: "extra".to_string(),
            field_type: "string".to_string(),
            ..Default::default()
        });
        assert!(validate_proposal(&proposal).is_err());
    }

    #[test]
    fn apply_proposal_returns_apply_afp_on_valid() {
        let proposal = simple_proposal(vec![supertag("milestone_tag")]);
        let result = apply_proposal("user_01", "thread_01", &proposal);
        assert!(result.is_ok());
        let afp = result.unwrap();
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_SCHEMA_PROPOSAL_APPLY)
        );
    }

    #[test]
    fn apply_proposal_returns_rejection_afp_on_invalid() {
        let proposal = simple_proposal(vec![supertag("urgent")]); // reserved
        let result = apply_proposal("user_01", "thread_01", &proposal);
        assert!(result.is_err());
        let afp = result.unwrap_err();
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_SCHEMA_PROPOSAL_REJECT)
        );
    }

    #[test]
    fn build_proposal_afp_has_correct_type() {
        let afp = build_proposal_afp(
            "user_01",
            "thread_01",
            "master_agent",
            "Test rationale",
            vec![supertag("new_tag")],
            vec![],
            vec![],
        );
        assert_eq!(afp["type"].as_str(), Some(AFP_TYPE_SCHEMA_PROPOSAL));
        assert_eq!(
            afp["subtype"].as_str(),
            Some(AFP_SUBTYPE_SCHEMA_PROPOSAL_PROPOSE)
        );
    }
}
