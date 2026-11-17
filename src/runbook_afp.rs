//! Runbook runtime AFP encoding. These are private-ledger proposals, not stored
//! messages. Callers must use the existing owner-scoped private storage boundary.
use crate::runbook_contract::*;
use crate::runbook_validation::{identifier, identifiers};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use ulid::Ulid;

#[derive(Debug, Clone, PartialEq)]
pub enum RuntimeRecord {
    Instance(RunbookInstance),
    Trace(StepTrace),
    Escalation(EpistemicEscalation),
}

fn hash(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}
fn optional_id(s: &Option<String>) -> bool {
    s.as_deref().is_none_or(identifier)
}

impl RuntimeRecord {
    pub fn validate(&self) -> Result<()> {
        match self {
            Self::Instance(i) => {
                if !identifier(&i.instance_id)
                    || !identifier(&i.runbook_id)
                    || i.runbook_version == 0
                    || !identifier(&i.trigger_event_id)
                    || !identifier(&i.definition_ref)
                    || i.thread_id != format!("runbook:{}", i.instance_id)
                    || !hash(&i.instance_key)
                    || i.revision == 0
                    || !optional_id(&i.current_step_id)
                    || !identifiers(&i.completed_step_ids, MAX_STEPS)
                    || !optional_id(&i.evidence_packet_ref)
                    || !optional_id(&i.latest_trace_ref)
                    || !optional_id(&i.retry_of_instance_id)
                    || i.retry_of_instance_id.as_deref() == Some(&i.instance_id)
                {
                    return Err("invalid_instance");
                }
                if i.status == InstanceState::Matched
                    && (i.revision != 1 || !i.completed_step_ids.is_empty())
                {
                    return Err("invalid_matched_instance");
                }
            }
            Self::Trace(t) => {
                if !identifier(&t.trace_id)
                    || !identifier(&t.instance_id)
                    || !identifier(&t.step_id)
                    || !identifiers(&t.input_refs, MAX_REFS)
                    || !identifiers(&t.output_refs, MAX_REFS)
                    || !hash(&t.input_hash)
                    || t.output_hash.as_deref().is_some_and(|s| !hash(s))
                    || !optional_id(&t.tool_id)
                    || !optional_id(&t.model)
                    || !optional_id(&t.prompt_version)
                    || !optional_id(&t.approval_ref)
                    || !optional_id(&t.provenance_ref)
                    || t.completed_at.is_some_and(|at| at < t.started_at)
                {
                    return Err("invalid_trace");
                }
                let model = matches!(
                    t.step_kind,
                    StepKind::Classify | StepKind::Reason | StepKind::Draft
                );
                if !model
                    && (t.model.is_some()
                        || t.prompt_version.is_some()
                        || t.input_tokens != 0
                        || t.output_tokens != 0
                        || t.cost_microunits != 0)
                {
                    return Err("unexpected_model_trace");
                }
                if model
                    && t.status == TraceStatus::Completed
                    && (t.model.is_none() || t.prompt_version.is_none())
                {
                    return Err("missing_model_provenance");
                }
                if t.status != TraceStatus::Waiting && t.completed_at.is_none() {
                    return Err("missing_trace_completion");
                }
                if t.step_kind != StepKind::Tool && t.tool_id.is_some() {
                    return Err("unexpected_trace_tool");
                }
            }
            Self::Escalation(e) => {
                if !identifier(&e.escalation_id)
                    || !identifier(&e.instance_id)
                    || !identifier(&e.step_id)
                    || e.missing_fields.is_empty()
                    || !identifiers(&e.missing_fields, 16)
                    || !identifiers(&e.attempted_refs, MAX_REFS)
                    || e.question.trim().is_empty()
                    || e.question.len() > 512
                    || e.why_needed.trim().is_empty()
                    || e.why_needed.len() > 1024
                {
                    return Err("invalid_escalation");
                }
            }
        }
        Ok(())
    }

    fn parts(&self) -> (&'static str, &str, Value, Vec<String>, Value) {
        match self {
            Self::Instance(i) => (
                "runbook_instance",
                &i.instance_id,
                json!(i),
                vec![i.definition_ref.clone(), i.trigger_event_id.clone()],
                json!({"instance_id": i.instance_id, "runbook_id": i.runbook_id, "revision": i.revision, "status": i.status}),
            ),
            Self::Trace(t) => (
                "runbook_step_trace",
                &t.instance_id,
                json!(t),
                t.input_refs.iter().chain(&t.output_refs).cloned().collect(),
                json!({"instance_id": t.instance_id, "step_id": t.step_id, "status": t.status}),
            ),
            Self::Escalation(e) => (
                "epistemic_escalation",
                &e.instance_id,
                json!(e),
                e.attempted_refs.clone(),
                json!({"instance_id": e.instance_id, "step_id": e.step_id, "status": e.status}),
            ),
        }
    }
}

pub fn build_runtime_afp(
    owner: &str,
    parent: Option<&str>,
    record: &RuntimeRecord,
    now: DateTime<Utc>,
) -> Result<Value> {
    if !identifier(owner) || parent.is_some_and(|s| !identifier(s)) {
        return Err("invalid_envelope_scope");
    }
    record.validate()?;
    if matches!(record, RuntimeRecord::Instance(i) if i.revision > 1) && parent.is_none() {
        return Err("missing_revision_parent");
    }
    let (kind, instance, content, mut refs, mut metadata) = record.parts();
    refs.sort();
    refs.dedup();
    metadata["private"] = json!(true);
    metadata["store"] = json!(true);
    Ok(json!({
        "protocol": "afp-v1", "id": Ulid::new().to_string(), "thread_id": format!("runbook:{instance}"),
        "parent_id": parent, "from": owner, "to": [owner], "timestamp": now.to_rfc3339(),
        "type": kind, "subtype": "v1", "content": content, "metadata": metadata,
        "references": refs, "supertags": ["runbook", kind], "store_in_relational": true,
    }))
}

pub fn parse_runtime_afp(owner: &str, message: &Value) -> Result<RuntimeRecord> {
    if !identifier(owner)
        || message["protocol"] != "afp-v1"
        || message["subtype"] != "v1"
        || message["from"] != owner
        || message["to"] != json!([owner])
        || !message["id"].as_str().is_some_and(identifier)
    {
        return Err("invalid_runtime_envelope");
    }
    let content = message["content"].clone();
    if content.to_string().len() > MAX_DEFINITION_BYTES {
        return Err("runtime_record_too_large");
    }
    let record = match message["type"].as_str() {
        Some("runbook_instance") => RuntimeRecord::Instance(
            serde_json::from_value(content).map_err(|_| "invalid_instance")?,
        ),
        Some("runbook_step_trace") => {
            RuntimeRecord::Trace(serde_json::from_value(content).map_err(|_| "invalid_trace")?)
        }
        Some("epistemic_escalation") => RuntimeRecord::Escalation(
            serde_json::from_value(content).map_err(|_| "invalid_escalation")?,
        ),
        _ => return Err("unknown_runtime_type"),
    };
    let parent = if message["parent_id"].is_null() {
        None
    } else {
        Some(message["parent_id"].as_str().ok_or("invalid_parent")?)
    };
    let now =
        DateTime::parse_from_rfc3339(message["timestamp"].as_str().ok_or("invalid_timestamp")?)
            .map_err(|_| "invalid_timestamp")?
            .with_timezone(&Utc);
    let expected = build_runtime_afp(owner, parent, &record, now)?;
    for field in [
        "thread_id",
        "references",
        "supertags",
        "metadata",
        "store_in_relational",
    ] {
        if message[field] != expected[field] {
            return Err("runtime_envelope_mismatch");
        }
    }
    Ok(record)
}
