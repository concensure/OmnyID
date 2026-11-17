//! Pure shadow matching only: no persistence, tool calls, timers or model calls.
use crate::runbook_contract::*;
use crate::runbook_registry::Registry;
use crate::runbook_validation::{identifier, validate_event, validate_filter};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchDisposition {
    Matched,
    Duplicate,
    DedupeGroup,
    EventCap,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MatchDecision {
    pub definition_ref: String,
    pub runbook_id: String,
    pub instance_key: String,
    pub disposition: MatchDisposition,
}

/// Length-delimited JSON tuple avoids collisions between concatenated identifiers.
pub fn instance_key(owner: &str, event: &str, definition: &str, version: u32) -> String {
    hex::encode(Sha256::digest(
        json!(["runbook_instance.v1", owner, event, definition, version])
            .to_string()
            .as_bytes(),
    ))
}

pub fn filter_matches(filter: &Filter, context: &Value) -> bool {
    if validate_filter(filter).is_err() {
        return false;
    }
    let mut actual = context;
    for part in filter.path.split('.') {
        let Some(next) = actual.as_object().and_then(|o| o.get(part)) else {
            return false;
        };
        actual = next;
    }
    match filter.op {
        FilterOp::Exists => !actual.is_null(),
        FilterOp::Eq => filter.value.as_ref() == Some(actual),
        FilterOp::In => filter
            .value
            .as_ref()
            .and_then(Value::as_array)
            .is_some_and(|v| v.contains(actual)),
        FilterOp::Gte | FilterOp::Lte => {
            let expected = filter.value.as_ref().unwrap();
            // Preserve integer precision for revisions/counts beyond 2^53.
            let ordering = if let (Some(a), Some(b)) = (actual.as_i64(), expected.as_i64()) {
                Some(a.cmp(&b))
            } else if let (Some(a), Some(b)) = (actual.as_u64(), expected.as_u64()) {
                Some(a.cmp(&b))
            } else if actual.as_i64().is_some() && expected.as_u64().is_some() {
                Some(std::cmp::Ordering::Less)
            } else if actual.as_u64().is_some() && expected.as_i64().is_some() {
                Some(std::cmp::Ordering::Greater)
            } else {
                actual
                    .as_f64()
                    .zip(expected.as_f64())
                    .and_then(|(a, b)| a.partial_cmp(&b))
            };
            ordering.is_some_and(|o| {
                if filter.op == FilterOp::Gte {
                    !o.is_lt()
                } else {
                    !o.is_gt()
                }
            })
        }
        FilterOp::ContainsTag => actual
            .as_array()
            .is_some_and(|v| v.iter().any(|v| Some(v) == filter.value.as_ref())),
        FilterOp::RefKind => actual.as_array().is_some_and(|v| {
            v.iter().any(|v| {
                v.as_str()
                    .and_then(|s| s.split_once(':'))
                    .is_some_and(|(kind, id)| {
                        !id.is_empty()
                            && Some(kind) == filter.value.as_ref().and_then(Value::as_str)
                    })
            })
        }),
    }
}

/// `owner` must come from authentication/daemon partition, never an event body.
/// Existing keys must be read in that same partition. This is a plan, not an
/// exactly-once reservation: durable dispatch must recheck under its transaction.
pub fn match_event(
    owner: &str,
    registry: &Registry,
    event: &ProactiveEvent,
    existing_keys: &HashSet<String>,
) -> Result<Vec<MatchDecision>> {
    if !identifier(owner) || owner != registry.owner() {
        return Err("owner_mismatch");
    }
    validate_event(event)?;
    let context = serde_json::to_value(event).map_err(|_| "invalid_event")?;
    let mut candidates = registry
        .definitions()
        .filter(|record| {
            let d = &record.definition;
            d.enabled
                && d.status == DefinitionStatus::Active
                && d.trigger.event_types.contains(&event.event_type)
                && d.trigger
                    .filters
                    .iter()
                    .all(|f| filter_matches(f, &context))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|a, b| {
        b.definition
            .priority
            .cmp(&a.definition.priority)
            .then(
                b.definition
                    .trigger
                    .filters
                    .len()
                    .cmp(&a.definition.trigger.filters.len()),
            )
            .then(b.definition.version.cmp(&a.definition.version))
            .then(a.definition.runbook_id.cmp(&b.definition.runbook_id))
    });
    let mut groups = HashSet::new();
    let mut winners = 0;
    Ok(candidates
        .into_iter()
        .map(|record| {
            let d = &record.definition;
            let key = instance_key(owner, &event.event_id, &d.runbook_id, d.version);
            let disposition = if d
                .dedupe_group
                .as_ref()
                .is_some_and(|g| !groups.insert(g.clone()))
            {
                MatchDisposition::DedupeGroup
            } else if winners >= 5 {
                MatchDisposition::EventCap
            } else {
                // A retried winner still consumes its original slot and dedupe group.
                winners += 1;
                if existing_keys.contains(&key) {
                    MatchDisposition::Duplicate
                } else {
                    MatchDisposition::Matched
                }
            };
            MatchDecision {
                definition_ref: record.message_id.clone(),
                runbook_id: d.runbook_id.clone(),
                instance_key: key,
                disposition,
            }
        })
        .collect())
}
