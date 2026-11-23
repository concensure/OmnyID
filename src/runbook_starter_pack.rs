//! Immutable, disabled-by-default templates copied into each owner's private AFP ledger.
use crate::runbook_contract::*;
use crate::runbook_validation::validate_definition;

pub const STARTER_PACK_VERSION: u32 = 1;

struct Starter {
    id: &'static str,
    name: &'static str,
    event: &'static str,
    operation: TransformOperation,
    facts: &'static [&'static str],
    draft: bool,
    approval: bool,
    follow_up: Option<&'static str>,
}

const STARTERS: &[Starter] = &[
    Starter {
        id: "no_reply_followup",
        name: "Review an unanswered conversation",
        event: "thread_idle",
        operation: TransformOperation::CheckThreadReply,
        facts: &["last_outbound_ref", "reply_status", "cooldown"],
        draft: true,
        approval: true,
        follow_up: Some("thread_reply_review_due"),
    },
    Starter {
        id: "calendar_conflict",
        name: "Resolve a calendar conflict",
        event: "calendar_event_changed",
        operation: TransformOperation::CompareCalendarConflicts,
        facts: &["event_times", "travel_buffer", "priority"],
        draft: false,
        approval: true,
        follow_up: None,
    },
    Starter {
        id: "vendor_quote_received",
        name: "Review a new vendor quote",
        event: "wedding_vendor_quote_received",
        operation: TransformOperation::ReviewStoredQuote,
        facts: &["normalised_quote_ref", "wedding_date"],
        draft: false,
        approval: false,
        follow_up: None,
    },
    Starter {
        id: "quote_missing_items",
        name: "Ask about missing quote details",
        event: "quotation_incomplete",
        operation: TransformOperation::FindQuoteGaps,
        facts: &["normalised_quote_ref", "required_categories"],
        draft: true,
        approval: true,
        follow_up: None,
    },
    Starter {
        id: "budget_threshold",
        name: "Review changed budget exposure",
        event: "wedding_commitment_changed",
        operation: TransformOperation::CalculateBudgetExposure,
        facts: &["commitments", "category_target", "total_budget"],
        draft: false,
        approval: false,
        follow_up: None,
    },
    Starter {
        id: "wedding_task_deadline",
        name: "Review an upcoming wedding task",
        event: "wedding_task_due",
        operation: TransformOperation::ReviewTaskDependencies,
        facts: &["task_ref", "task_owner", "dependencies"],
        draft: false,
        approval: false,
        follow_up: None,
    },
    Starter {
        id: "rsvp_non_response",
        name: "Review an RSVP reminder",
        event: "rsvp_reminder_due",
        operation: TransformOperation::CheckReminderPermission,
        facts: &["invitation_ref", "attendance", "reminder_permission"],
        draft: true,
        approval: true,
        follow_up: Some("rsvp_reply_review_due"),
    },
    Starter {
        id: "runsheet_change",
        name: "Review a run sheet change",
        event: "wedding_runsheet_changed",
        operation: TransformOperation::CompareRunsheetVersions,
        facts: &[
            "previous_version_ref",
            "current_version_ref",
            "affected_viewers",
        ],
        draft: false,
        approval: true,
        follow_up: None,
    },
    Starter {
        id: "email_commitment_due",
        name: "Review a due commitment",
        event: "email_commitment_due",
        operation: TransformOperation::VerifyCommitmentEvidence,
        facts: &["commitment_ref", "completion_evidence"],
        draft: true,
        approval: true,
        follow_up: None,
    },
    Starter {
        id: "workflow_failure",
        name: "Review a failed workflow",
        event: "workflow_failed",
        operation: TransformOperation::AssessWorkflowRetry,
        facts: &["run_ref", "error_ref", "retry_consequences"],
        draft: false,
        approval: true,
        follow_up: None,
    },
    Starter {
        id: "file_requires_review",
        name: "Review an imported file",
        event: "document_review_required",
        operation: TransformOperation::ReviewImportStatus,
        facts: &["file_ref", "parser_status", "quarantine_status"],
        draft: false,
        approval: false,
        follow_up: None,
    },
    Starter {
        id: "info_gap_generic",
        name: "Resolve missing information",
        event: "required_fact_missing",
        operation: TransformOperation::IdentifyMissingFacts,
        facts: &["required_field", "attempted_refs"],
        draft: false,
        approval: false,
        follow_up: None,
    },
];

fn step(id: &str, kind: StepKind, inputs: &[&str]) -> Step {
    Step {
        step_id: id.into(),
        kind,
        operation: None,
        required_fields: vec![],
        input_refs: inputs.iter().map(|s| (*s).into()).collect(),
        tool: None,
        output_kind: None,
        output_schema: None,
        follow_up_event: None,
        max_retries: 0,
        token_limit: 0,
        cost_limit_microunits: 0,
    }
}

pub fn starter_definitions() -> Vec<RunbookDefinition> {
    STARTERS.iter().map(|s| {
        let read = step("read", StepKind::Read, &["event.source_refs", "event.entity_refs"]);
        let mut assess = step("assess", StepKind::Transform, &["steps.read.output_refs"]);
        assess.operation = Some(s.operation);
        assess.required_fields = s.facts.iter().map(|s| (*s).into()).collect();
        let mut steps = vec![read, assess];
        let mut output = "steps.assess.output_refs";
        if s.draft {
            let mut draft = step("draft", StepKind::Draft, &[output]);
            draft.output_schema = Some("runbook_sourced_draft_v1".into());
            draft.token_limit = 2048;
            draft.cost_limit_microunits = 50_000;
            steps.push(draft);
            output = "steps.draft.output_refs";
        }
        if s.approval { steps.push(step("review_consequence", StepKind::Approval, &[output])); }
        let mut surface = step("surface", StepKind::Emit, &[output]);
        surface.output_kind = Some("proactive_suggestion".into());
        steps.push(surface);
        if let Some(event) = s.follow_up {
            let mut wait = step("wait_for_reply", StepKind::Wait, &["event.source_refs"]);
            wait.follow_up_event = Some(event.into());
            steps.push(wait);
        }
        steps.push(step("complete", StepKind::Complete, &["steps.surface.output_refs"]));
        RunbookDefinition {
            runbook_id: s.id.into(), version: 1, name: s.name.into(),
            description: "Prepare a sourced review. Missing facts pause for an answer; messages, calendar edits, booking, spending, publishing and consequential retries require existing action authority.".into(),
            enabled: false, priority: 50, dedupe_group: Some(s.id.into()),
            trigger: Trigger { event_types: vec![s.event.into()], filters: vec![] }, steps,
            tools_allowlist: vec![], success_criteria: vec![Filter { path: "instance.outputs.review_ref".into(), op: FilterOp::Exists, value: None }],
            escalate_when: vec![EscalationReason::MissingRequiredFact, EscalationReason::PolicyDenied, EscalationReason::ConflictingEvidence],
            follow_up_events: s.follow_up.into_iter().map(str::to_string).collect(),
            max_autonomy: if s.approval { MaxAutonomy::ApprovalRequired } else { MaxAutonomy::DraftOnly },
            status: DefinitionStatus::Active, supersedes_id: None, evidence_limit: 16,
        }
    }).collect()
}

pub fn selected_starters(ids: &[String]) -> Result<Vec<RunbookDefinition>> {
    if ids.is_empty() || !crate::runbook_validation::identifiers(ids, STARTERS.len()) {
        return Err("invalid_starter_selection");
    }
    let all = starter_definitions();
    ids.iter()
        .map(|id| {
            let definition = all
                .iter()
                .find(|d| &d.runbook_id == id)
                .ok_or("unknown_starter")?
                .clone();
            validate_definition(&definition)?;
            Ok(definition)
        })
        .collect()
}
