//! Opt-in adapters for existing persisted-event and shared maintenance paths.
//! Hooks never start steps, invoke models, or execute tools. No payloads are logged.
use crate::{
    db::Db, runbook_contract::Result, runbook_runtime::RunbookRuntime, runbook_store::RunbookStore,
};
use std::collections::BTreeSet;

#[derive(Default)]
pub struct HookPolicy {
    pub events: bool,
    pub follow_ups: bool,
    pub owners: BTreeSet<String>,
}

impl HookPolicy {
    pub fn from_env() -> Self {
        let owners = std::env::var("OMNYID_RUNBOOK_ALLOWLIST").unwrap_or_default();
        let owners: BTreeSet<String> = owners
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .collect();
        if owners.len() > 100
            || owners.iter().any(|s| {
                s.len() > 55
                    || !s
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
            })
        {
            return Self::default();
        }
        Self {
            events: std::env::var("OMNYID_RUNBOOK_EVENT_HOOKS_ENABLED").as_deref() == Ok("true"),
            follow_ups: std::env::var("OMNYID_RUNBOOK_FOLLOW_UPS_ENABLED").as_deref() == Ok("true"),
            owners,
        }
    }
    pub fn event_allowed(&self, owner: &str, kind: &str) -> bool {
        self.events
            && self.owners.contains(owner)
            && matches!(
                kind,
                "passive_event" | "watcher_alert" | "watcher_resolution_event"
            )
    }
}

fn keys() -> Result<([u8; 32], [u8; 32])> {
    fn key(name: &str) -> Result<[u8; 32]> {
        let value = std::env::var(name).map_err(|_| "runbook_keys_unavailable")?;
        hex::decode(value)
            .map_err(|_| "runbook_keys_unavailable")?
            .try_into()
            .map_err(|_| "runbook_keys_unavailable")
    }
    Ok((
        key("OMNYID_ENCRYPTION_KEY_HEX")?,
        key("OMNYID_SIGNING_KEY_HEX")?,
    ))
}

/// Project an authenticated, already persisted passive event into the existing
/// daemon ledger without copying raw bodies, mail context or arbitrary metadata.
/// This is an unsigned server-derived projection, not the source's signature.
pub async fn bridge_passive_event(db: &Db, owner: &str, source: &serde_json::Value) -> Result<()> {
    use serde_json::json;
    if !HookPolicy::from_env().event_allowed(owner, "passive_event") {
        return Ok(());
    }
    if source["to"] != json!([owner]) || source["type"] != "passive_event" {
        return Err("event_owner_mismatch");
    }
    let event = crate::runbook_event::normalize_stored_event(owner, owner, source)?;
    let projected = json!({
        "protocol":"afp-v1", "id":event.event_id, "type":"passive_event",
        "from":"runbook_ingress", "to":[owner], "thread_id":source["thread_id"],
        "timestamp":source["timestamp"], "references":event.source_refs,
        "content":{"event_type":event.event_type,"event_at":event.occurred_at,
            "confidence":event.confidence,"metadata":event.metadata,
            "source_refs":event.source_refs,"entity_refs":event.entity_refs,
            "urgency":event.urgency,"caused_by_event_id":event.caused_by_event_id}
    });
    db.insert_daemon_afp_message(&projected)
        .await
        .map_err(|_| "storage_unavailable")
}

/// Called only after the existing owner-partitioned AFP insert has completed.
/// Dispatch re-reads that partition; incoming payload fields cannot grant authority.
pub async fn persisted_event(db: &Db, owner: &str, id: &str, kind: &str) {
    let policy = HookPolicy::from_env();
    if !policy.event_allowed(owner, kind) {
        return;
    }
    let result = tokio::time::timeout(std::time::Duration::from_secs(5), async {
        let (encryption, signing) = keys()?;
        let store = RunbookStore::new(db, encryption, signing);
        RunbookRuntime::new(&store).dispatch(owner, id).await?;
        Ok::<_, &'static str>(())
    })
    .await;
    if !matches!(result, Ok(Ok(()))) {
        tracing::warn!("Runbook persisted-event matching deferred; source remains in ledger");
    }
}

/// Called by the existing shared health-maintenance loop on every wake/timer pass.
/// Limits are per pass, not one independent timer per runbook.
pub async fn maintenance_pass(db: &Db) -> (u32, u32) {
    let policy = HookPolicy::from_env();
    if policy.owners.is_empty() || !policy.follow_ups {
        return (0, 0);
    }
    let Ok((encryption, signing)) = keys() else {
        return (0, 1);
    };
    let store = RunbookStore::new(db, encryption, signing);
    let runtime = RunbookRuntime::new(&store);
    let mut processed = 0;
    let mut errors = 0;
    let pass = tokio::time::timeout(std::time::Duration::from_secs(10), async {
        for owner in &policy.owners {
            if policy.follow_ups {
                match runtime.due_schedules(owner, 20).await {
                    Ok(due) => {
                        for record in due {
                            match runtime
                                .deliver_follow_up(
                                    owner,
                                    &record.schedule.instance_id,
                                    &record.message_id,
                                )
                                .await
                            {
                                Ok(_) => processed += 1,
                                Err(_) => errors += 1,
                            }
                        }
                    }
                    Err(_) => errors += 1,
                }
            }
        }
    })
    .await;
    if pass.is_err() {
        errors += 1;
    }
    (processed, errors)
}
