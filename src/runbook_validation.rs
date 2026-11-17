//! Fail-closed limits shared by imports, registry and matcher.
use crate::runbook_contract::*;
use serde_json::Value;
use std::collections::HashSet;

pub fn identifier(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-.:".contains(&b))
}

pub fn identifiers(items: &[String], limit: usize) -> bool {
    items.len() <= limit
        && items.iter().all(|s| identifier(s))
        && items.iter().collect::<HashSet<_>>().len() == items.len()
}

pub fn parse_definition(bytes: &[u8]) -> Result<RunbookDefinition> {
    if bytes.len() > MAX_DEFINITION_BYTES {
        return Err("definition_too_large");
    }
    let definition = serde_json::from_slice(bytes).map_err(|_| "invalid_definition")?;
    validate_definition(&definition)?;
    Ok(definition)
}

pub fn validate_filter(filter: &Filter) -> Result<()> {
    if filter.path.len() > 160
        || filter.path.split('.').count() > 5
        || !filter.path.split('.').all(identifier)
    {
        return Err("invalid_filter_path");
    }
    let valid = match filter.op {
        FilterOp::Exists => filter.value.is_none(),
        FilterOp::Eq => filter.value.as_ref().is_some_and(scalar),
        FilterOp::In => filter
            .value
            .as_ref()
            .and_then(Value::as_array)
            .is_some_and(|v| !v.is_empty() && v.len() <= 32 && v.iter().all(scalar)),
        FilterOp::Gte | FilterOp::Lte => filter.value.as_ref().is_some_and(Value::is_number),
        FilterOp::ContainsTag | FilterOp::RefKind => filter
            .value
            .as_ref()
            .and_then(Value::as_str)
            .is_some_and(identifier),
    };
    if valid {
        Ok(())
    } else {
        Err("invalid_filter_value")
    }
}

fn scalar(value: &Value) -> bool {
    value.is_boolean() || value.is_number() || value.as_str().is_some_and(|s| s.len() <= 256)
}

pub fn validate_definition(d: &RunbookDefinition) -> Result<()> {
    if serde_json::to_vec(d)
        .map_err(|_| "invalid_definition")?
        .len()
        > MAX_DEFINITION_BYTES
    {
        return Err("definition_too_large");
    }
    if !identifier(&d.runbook_id)
        || d.version == 0
        || d.priority > 100
        || d.name.trim().is_empty()
        || d.name.len() > 160
        || d.description.len() > 2048
        || d.dedupe_group.as_deref().is_some_and(|s| !identifier(s))
        || d.supersedes_id.as_deref().is_some_and(|s| !identifier(s))
    {
        return Err("invalid_definition_identity");
    }
    if (d.version == 1) != d.supersedes_id.is_none() {
        return Err("invalid_successor");
    }
    if d.status == DefinitionStatus::Archived && d.enabled {
        return Err("archive_enabled");
    }
    if d.evidence_limit == 0 || d.evidence_limit as usize > MAX_REFS {
        return Err("invalid_evidence_limit");
    }
    if d.trigger.event_types.is_empty()
        || !identifiers(&d.trigger.event_types, 16)
        || !identifiers(&d.tools_allowlist, 16)
        || !identifiers(&d.follow_up_events, 16)
        || d.escalate_when.len() > 8
    {
        return Err("invalid_allowlist");
    }
    if d.trigger.filters.len() > 16
        || d.success_criteria.is_empty()
        || d.success_criteria.len() > 16
    {
        return Err("invalid_filter_count");
    }
    for f in &d.trigger.filters {
        validate_filter(f)?;
        if !f.path.starts_with("metadata.")
            && !matches!(
                f.path.as_str(),
                "event_type" | "confidence" | "source_refs" | "entity_refs"
            )
        {
            return Err("invalid_trigger_path");
        }
    }
    let mut unique_filters = HashSet::new();
    for filter in &d.trigger.filters {
        if !unique_filters.insert(serde_json::to_string(filter).map_err(|_| "invalid_filter")?) {
            return Err("duplicate_trigger_filter");
        }
    }
    for f in &d.success_criteria {
        validate_filter(f)?;
        if !f.path.starts_with("instance.outputs.") {
            return Err("invalid_success_path");
        }
    }
    if d.steps.is_empty() || d.steps.len() > MAX_STEPS {
        return Err("invalid_step_count");
    }
    let mut ids = HashSet::new();
    for step in &d.steps {
        if (step.kind == StepKind::Transform) != step.operation.is_some() {
            return Err("invalid_transform_operation");
        }
        if !identifiers(&step.required_fields, 16) {
            return Err("invalid_required_fields");
        }
        for input in &step.input_refs {
            if matches!(
                input.as_str(),
                "event.source_refs" | "event.entity_refs" | "state.snapshot_ref"
            ) {
                continue;
            }
            let previous = input
                .strip_prefix("steps.")
                .and_then(|s| s.strip_suffix(".output_refs"));
            if !previous.is_some_and(|id| ids.iter().any(|known: &&String| known.as_str() == id)) {
                return Err("unbounded_or_forward_input_ref");
            }
        }
        if !identifier(&step.step_id)
            || !ids.insert(&step.step_id)
            || !identifiers(&step.input_refs, MAX_REFS)
            || step.max_retries > 3
            || serde_json::to_vec(step).map_err(|_| "invalid_step")?.len() > 4096
        {
            return Err("invalid_step");
        }
        if step.kind == StepKind::Tool {
            if !step
                .tool
                .as_ref()
                .is_some_and(|t| d.tools_allowlist.contains(t))
            {
                return Err("tool_not_allowed");
            }
        } else if step.tool.is_some() {
            return Err("unexpected_tool");
        }
        if let Some(event) = &step.follow_up_event {
            if !matches!(step.kind, StepKind::Emit | StepKind::Wait)
                || !d.follow_up_events.contains(event)
            {
                return Err("follow_up_not_allowed");
            }
        }
        if step.kind == StepKind::Wait && step.follow_up_event.is_none() {
            return Err("wait_without_event");
        }
        if matches!(
            step.kind,
            StepKind::Classify | StepKind::Reason | StepKind::Draft
        ) {
            if !step.output_schema.as_deref().is_some_and(identifier)
                || step.token_limit == 0
                || step.token_limit > 8192
                || step.cost_limit_microunits == 0
                || step.cost_limit_microunits > 1_000_000
            {
                return Err("unbounded_model_step");
            }
        } else if step.token_limit != 0
            || step.cost_limit_microunits != 0
            || step.output_schema.is_some()
        {
            return Err("unexpected_model_config");
        }
        if step.kind == StepKind::Emit {
            if !matches!(
                step.output_kind.as_deref(),
                Some("proactive_suggestion" | "draft_artifact" | "runbook_follow_up")
            ) {
                return Err("output_kind_not_allowed");
            }
            if (step.output_kind.as_deref() == Some("runbook_follow_up"))
                != step.follow_up_event.is_some()
            {
                return Err("invalid_follow_up_output");
            }
        } else if step.output_kind.is_some() {
            return Err("unexpected_output_kind");
        }
    }
    if d.steps.last().map(|s| s.kind) != Some(StepKind::Complete)
        || d.steps[..d.steps.len() - 1]
            .iter()
            .any(|s| s.kind == StepKind::Complete)
    {
        return Err("invalid_completion_step");
    }
    Ok(())
}

pub fn validate_event(e: &ProactiveEvent) -> Result<()> {
    if !identifier(&e.event_id)
        || !identifier(&e.event_type)
        || !identifiers(&e.source_refs, MAX_REFS)
        || !identifiers(&e.entity_refs, MAX_REFS)
        || !e.confidence.is_finite()
        || !(0.0..=1.0).contains(&e.confidence)
        || e.caused_by_event_id
            .as_deref()
            .is_some_and(|s| !identifier(s))
        || e.metadata.len() > 32
    {
        return Err("invalid_event");
    }
    // This is deliberately a content-light summary, not an arbitrary body carrier.
    for (key, value) in &e.metadata {
        if !matches!(
            key.as_str(),
            "wedding_id"
                | "document_kind"
                | "revision"
                | "idle_hours"
                | "status"
                | "category"
                | "tags"
                | "permission"
                | "required_field"
                | "confidence"
        ) {
            return Err("private_or_unknown_event_field");
        }
        if !(scalar(value)
            || (key == "tags"
                && value.as_array().is_some_and(|a| {
                    a.len() <= 16 && a.iter().all(|v| v.as_str().is_some_and(identifier))
                })))
        {
            return Err("invalid_event_metadata");
        }
    }
    Ok(())
}
