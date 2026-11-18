//! Exact private tool lifecycle records. No generic action-approval interpretation.
use crate::{runbook_contract::*, runbook_store::digest, runbook_validation::identifier};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ToolRequest {
    pub tool_slug: String,
    pub capability: String,
    pub arguments: Value,
}
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ToolProposal {
    pub instance_id: String,
    pub step_id: String,
    pub request: ToolRequest,
    pub request_hash: String,
    pub definition_ref: String,
    pub expected_revision: u32,
    pub expires_at: DateTime<Utc>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ToolDecision {
    pub instance_id: String,
    pub step_id: String,
    pub proposal_ref: String,
    pub request_hash: String,
    pub expected_revision: u32,
    pub approved: bool,
}
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct Reservation {
    pub instance_id: String,
    pub step_id: String,
    pub proposal_ref: String,
    pub decision_ref: String,
    pub request_hash: String,
    pub expected_revision: u32,
    pub started_at: DateTime<Utc>,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolOutcome {
    Completed,
    NotSent,
    Unknown,
}
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ToolReceipt {
    pub instance_id: String,
    pub step_id: String,
    pub proposal_ref: String,
    pub request_hash: String,
    pub outcome: ToolOutcome,
    pub failure: Option<String>,
    pub output: Option<Value>,
    pub trace: StepTrace,
    pub applied: bool,
}
impl std::fmt::Debug for ToolProposal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ToolProposal")
            .field("request_hash", &self.request_hash)
            .finish_non_exhaustive()
    }
}
impl std::fmt::Debug for ToolReceipt {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ToolReceipt")
            .field("outcome", &self.outcome)
            .field("applied", &self.applied)
            .finish_non_exhaustive()
    }
}
pub(crate) fn id(kind: &str, owner: &str, instance: &str, step: &str) -> String {
    digest(&json!([kind, owner, instance, step]))
}
pub(crate) fn envelope(
    owner: &str,
    kind: &str,
    instance: &str,
    step: &str,
    parent: &str,
    content: Value,
) -> Value {
    json!({"protocol":"afp-v1","id":id(kind,owner,instance,step),"thread_id":format!("runbook:{instance}"),
        "parent_id":parent,"from":owner,"to":[owner],"timestamp":Utc::now().to_rfc3339(),
        "type":kind,"subtype":"v1","content":content,"metadata":{"private":true,"store":true,"instance_id":instance,"step_id":step},
        "references":[],"supertags":[kind],"store_in_relational":true})
}
pub(crate) fn decode<T: serde::de::DeserializeOwned>(v: &Value) -> Result<T> {
    serde_json::from_value(v["content"].clone()).map_err(|_| "invalid_tool_record")
}
pub(crate) fn validate(owner: &str, v: &Value) -> Result<()> {
    let kind = v["type"].as_str().ok_or("invalid_tool_record")?;
    let c = &v["content"];
    let instance = c["instance_id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_tool_record")?;
    let step = c["step_id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_tool_record")?;
    let hash = c["request_hash"].as_str().ok_or("invalid_tool_record")?;
    if hash.len() != 64
        || !hash.bytes().all(|b| b.is_ascii_hexdigit())
        || v["protocol"] != "afp-v1"
        || v["id"] != id(kind, owner, instance, step)
        || v["thread_id"] != format!("runbook:{instance}")
        || v["from"] != owner
        || v["to"] != json!([owner])
        || v["subtype"] != "v1"
        || v["metadata"]
            != json!({"private":true,"store":true,"instance_id":instance,"step_id":step})
        || v["references"] != json!([])
        || v["supertags"] != json!([kind])
        || v["store_in_relational"] != true
        || !v["parent_id"].as_str().is_some_and(identifier)
        || c.to_string().len() > 65536
        || DateTime::parse_from_rfc3339(v["timestamp"].as_str().unwrap_or("")).is_err()
    {
        return Err("invalid_tool_record");
    }
    match kind {
        "runbook_tool_proposal" => {
            let p: ToolProposal = decode(v)?;
            if !identifier(&p.request.tool_slug)
                || !identifier(&p.request.capability)
                || !p.request.arguments.is_object()
                || !identifier(&p.definition_ref)
                || p.expected_revision == 0
            {
                return Err("invalid_tool_proposal");
            }
        }
        "runbook_tool_decision" => {
            let d: ToolDecision = decode(v)?;
            if d.proposal_ref != id("runbook_tool_proposal", owner, instance, step)
                || d.expected_revision == 0
            {
                return Err("invalid_tool_decision");
            }
        }
        "runbook_tool_reservation" => {
            let r: Reservation = decode(v)?;
            if r.proposal_ref != id("runbook_tool_proposal", owner, instance, step)
                || r.decision_ref != id("runbook_tool_decision", owner, instance, step)
                || r.expected_revision == 0
            {
                return Err("invalid_tool_reservation");
            }
        }
        "runbook_tool_result" => {
            let r: ToolReceipt = decode(v)?;
            if r.proposal_ref != id("runbook_tool_proposal", owner, instance, step)
                || r.trace.instance_id != instance
                || r.trace.step_id != step
                || r.trace.step_kind != StepKind::Tool
                || r.trace.input_hash != hash
                || r.trace.approval_ref.as_deref()
                    != Some(id("runbook_tool_decision", owner, instance, step).as_str())
                || (r.outcome == ToolOutcome::Completed)
                    != (r.output.is_some() && r.failure.is_none())
                || (r.outcome != ToolOutcome::Completed
                    && (r.output.is_some() || r.failure.is_none()))
                || (r.applied
                    && (r.outcome != ToolOutcome::Completed
                        || r.trace.status != TraceStatus::Completed))
                || r.trace.output_hash != Some(digest(&json!([r.outcome, r.failure, r.output])))
            {
                return Err("invalid_tool_result");
            }
            crate::runbook_afp::RuntimeRecord::Trace(r.trace).validate()?;
        }
        _ => return Err("invalid_tool_record"),
    }
    Ok(())
}
