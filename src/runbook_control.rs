//! Private control events share the existing AFP/encryption boundary.
use crate::runbook_contract::*;
use crate::runbook_validation::identifier;
use chrono::{DateTime, Utc};
use serde_json::{Value, json};

pub(crate) fn envelope(
    owner: &str,
    id: &str,
    instance: &str,
    parent: &str,
    kind: &str,
    content: Value,
) -> Value {
    json!({"protocol":"afp-v1","id":id,"thread_id":format!("runbook:{instance}"),
        "parent_id":parent,"from":owner,"to":[owner],"timestamp":Utc::now().to_rfc3339(),
        "type":kind,"subtype":"v1","content":content,"references":[parent],
        "metadata":{"private":true,"store":true,"instance_id":instance},
        "supertags":["runbook",kind],"store_in_relational":true})
}

pub(crate) fn validate(owner: &str, value: &Value) -> Result<()> {
    let kind = value["type"].as_str().ok_or("invalid_control")?;
    let instance = value["content"]["instance_id"]
        .as_str()
        .ok_or("invalid_control")?;
    let parent = value["parent_id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_control")?;
    let id = value["id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_control")?;
    if !identifier(owner)
        || !identifier(instance)
        || value["content"].to_string().len() > 32768
        || DateTime::parse_from_rfc3339(value["timestamp"].as_str().ok_or("invalid_control")?)
            .is_err()
    {
        return Err("invalid_control");
    }
    let expected = envelope(owner, id, instance, parent, kind, Value::Null);
    for field in [
        "protocol",
        "from",
        "to",
        "thread_id",
        "subtype",
        "references",
        "metadata",
        "supertags",
        "store_in_relational",
    ] {
        if value[field] != expected[field] {
            return Err("invalid_control_envelope");
        }
    }
    match kind {
        "runbook_input_supplied" => crate::runbook_input::validate_input_record(value)?,
        "runbook_schedule" | "runbook_follow_up" => {
            crate::runbook_schedule::validate_schedule_record(value)?
        }
        _ => return Err("unknown_control_type"),
    }
    Ok(())
}
