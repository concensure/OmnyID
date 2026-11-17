//! Rebuildable definition projection. Call only with records read from the authenticated
//! owner's private ledger. Envelope recipients are a consistency check, not authentication.
use crate::runbook_contract::*;
use crate::runbook_validation::{identifier, parse_definition, validate_definition};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashSet};
use ulid::Ulid;

#[derive(Debug, Clone)]
pub struct DefinitionRecord {
    pub message_id: String,
    pub definition: RunbookDefinition,
}

#[derive(Debug)]
pub struct Registry {
    owner: String,
    latest: BTreeMap<String, DefinitionRecord>,
}

impl Registry {
    pub fn owner(&self) -> &str {
        &self.owner
    }
    pub fn definitions(&self) -> impl Iterator<Item = &DefinitionRecord> {
        self.latest.values()
    }
    pub fn get(&self, id: &str) -> Option<&DefinitionRecord> {
        self.latest.get(id)
    }

    /// Input must be the complete definition history, not a truncated latest-N query.
    /// Sorting by version makes delivery order irrelevant; forks and gaps fail closed.
    pub fn rebuild(owner: &str, messages: &[Value]) -> Result<Self> {
        if !identifier(owner) || messages.len() > 4096 {
            return Err("invalid_registry_scope");
        }
        let mut records = Vec::new();
        let mut message_ids = HashSet::new();
        for message in messages {
            let record = parse_definition_afp(owner, message)?;
            if !message_ids.insert(record.message_id.clone()) {
                return Err("duplicate_message_id");
            }
            records.push(record);
        }
        records.sort_by(|a, b| {
            a.definition
                .runbook_id
                .cmp(&b.definition.runbook_id)
                .then(a.definition.version.cmp(&b.definition.version))
        });
        let mut latest: BTreeMap<String, DefinitionRecord> = BTreeMap::new();
        for record in records {
            let d = &record.definition;
            if let Some(previous) = latest.get(&d.runbook_id) {
                if previous.definition.version.checked_add(1) != Some(d.version)
                    || d.supersedes_id.as_deref() != Some(previous.message_id.as_str())
                {
                    return Err("definition_fork_or_gap");
                }
                if previous.definition.status == DefinitionStatus::Archived {
                    return Err("archive_reopened");
                }
            } else if d.version != 1 {
                return Err("missing_definition_root");
            }
            latest.insert(d.runbook_id.clone(), record);
        }
        Ok(Self {
            owner: owner.to_string(),
            latest,
        })
    }

    /// Creates a validated successor proposal; durable storage must atomically compare
    /// expected_parent with the current ledger head before appending this message.
    pub fn successor(
        &self,
        id: &str,
        expected_parent: &str,
        mut definition: RunbookDefinition,
        now: DateTime<Utc>,
    ) -> Result<Value> {
        let current = self.get(id).ok_or("definition_not_found")?;
        if current.message_id != expected_parent {
            return Err("stale_definition");
        }
        if definition.runbook_id != id || current.definition.status == DefinitionStatus::Archived {
            return Err("invalid_successor");
        }
        definition.version = current
            .definition
            .version
            .checked_add(1)
            .ok_or("version_overflow")?;
        definition.supersedes_id = Some(current.message_id.clone());
        build_definition_afp(&self.owner, &definition, now)
    }
}

/// The returned envelope is private plaintext pending the existing private-ledger
/// encryption/storage boundary. Never publish this value or put its content in logs.
pub fn build_definition_afp(
    owner: &str,
    definition: &RunbookDefinition,
    now: DateTime<Utc>,
) -> Result<Value> {
    if !identifier(owner) {
        return Err("invalid_owner");
    }
    validate_definition(definition)?;
    Ok(json!({
        "protocol": "afp-v1", "id": Ulid::new().to_string(),
        "thread_id": format!("runbook_definition:{}", definition.runbook_id),
        "parent_id": definition.supersedes_id, "from": owner, "to": [owner],
        "timestamp": now.to_rfc3339(), "type": "runbook_definition", "subtype": "v1",
        "content": definition,
        "metadata": {
            "store": true, "private": true, "runbook_id": definition.runbook_id,
            "version": definition.version, "status": definition.status, "enabled": definition.enabled,
        },
        "references": definition.supersedes_id.iter().collect::<Vec<_>>(),
        "supertags": ["runbook", "runbook_definition"], "store_in_relational": true,
    }))
}

pub fn parse_definition_afp(owner: &str, message: &Value) -> Result<DefinitionRecord> {
    if !identifier(owner)
        || message["protocol"] != "afp-v1"
        || message["type"] != "runbook_definition"
        || message["subtype"] != "v1"
        || message["from"] != owner
        || message["to"] != json!([owner])
        || message["metadata"]["private"] != true
    {
        return Err("invalid_definition_envelope");
    }
    let id = message["id"]
        .as_str()
        .filter(|s| identifier(s))
        .ok_or("invalid_message_id")?;
    let definition =
        parse_definition(&serde_json::to_vec(&message["content"]).map_err(|_| "invalid_content")?)?;
    if message["parent_id"] != json!(definition.supersedes_id)
        || message["thread_id"] != format!("runbook_definition:{}", definition.runbook_id)
        || message["metadata"]["runbook_id"] != definition.runbook_id
        || message["metadata"]["version"] != definition.version
        || message["metadata"]["enabled"] != definition.enabled
        || message["metadata"]["status"] != json!(definition.status)
        || message["references"] != json!(definition.supersedes_id.iter().collect::<Vec<_>>())
    {
        return Err("definition_envelope_mismatch");
    }
    DateTime::parse_from_rfc3339(message["timestamp"].as_str().ok_or("invalid_timestamp")?)
        .map_err(|_| "invalid_timestamp")?;
    Ok(DefinitionRecord {
        message_id: id.to_string(),
        definition,
    })
}
