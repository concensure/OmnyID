//! Repeated terminal failures suppress new work, never authorize a retry.
use super::*;
use std::collections::{BTreeMap, BTreeSet};

const FAILURE_THRESHOLD: usize = 3;
const WINDOW_MINUTES: i64 = 60;

impl RunbookRuntime<'_, '_> {
    pub(crate) async fn failure_cooldowns_in(
        &self,
        owner: &str,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<BTreeSet<String>> {
        // Existing bounded, signature-checked, owner-private ledger reader.
        // History overflow fails closed rather than silently omitting failures.
        let records = self
            .store
            .read_kind(owner, "runbook_instance", None, None, tx)
            .await?;
        cooling_runbooks(owner, &records, Utc::now())
    }
}

fn cooling_runbooks(
    owner: &str,
    records: &[Value],
    now: DateTime<Utc>,
) -> Result<BTreeSet<String>> {
    let cutoff = now - chrono::Duration::minutes(WINDOW_MINUTES);
    let mut failures: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for value in records {
        let RuntimeRecord::Instance(instance) = parse_runtime_afp(owner, value)? else {
            return Err("invalid_instance");
        };
        if instance.status != InstanceState::Failed {
            continue;
        }
        let timestamp =
            DateTime::parse_from_rfc3339(value["timestamp"].as_str().ok_or("invalid_instance")?)
                .map_err(|_| "invalid_instance")?;
        if timestamp <= cutoff {
            continue;
        }
        // Count each instance once, across definition versions. A successor cannot
        // bypass cooldown. Future timestamps conservatively remain cooling.
        failures
            .entry(instance.runbook_id)
            .or_default()
            .insert(instance.instance_id);
    }
    Ok(failures
        .into_iter()
        .filter_map(|(id, attempts)| (attempts.len() >= FAILURE_THRESHOLD).then_some(id))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn failed(id: &str, when: DateTime<Utc>) -> Value {
        build_runtime_afp(
            "owner",
            Some("parent"),
            &RuntimeRecord::Instance(RunbookInstance {
                instance_id: id.into(),
                runbook_id: "book".into(),
                runbook_version: 1,
                trigger_event_id: "trigger".into(),
                thread_id: format!("runbook:{id}"),
                instance_key: "a".repeat(64),
                status: InstanceState::Failed,
                current_step_id: Some("tool".into()),
                completed_step_ids: vec![],
                next_follow_up_at: None,
                wait_expires_at: None,
                definition_ref: "definition".into(),
                evidence_packet_ref: None,
                latest_trace_ref: None,
                retry_of_instance_id: None,
                revision: 4,
            }),
            when,
        )
        .unwrap()
    }
    #[test]
    fn failure_window_counts_distinct_instances_and_expires_at_boundary() {
        let now = Utc::now();
        let a = failed("a", now);
        assert!(
            cooling_runbooks("owner", &[a.clone(), a.clone(), a.clone()], now)
                .unwrap()
                .is_empty()
        );
        let records = vec![a, failed("b", now), failed("c", now)];
        assert!(
            cooling_runbooks("owner", &records, now)
                .unwrap()
                .contains("book")
        );
        assert!(
            cooling_runbooks("owner", &records, now + chrono::Duration::minutes(60))
                .unwrap()
                .is_empty()
        );
        assert!(cooling_runbooks("other", &records, now).is_err());
    }
    #[test]
    fn failures_do_not_leak_across_runbooks_and_nonfailures_do_not_count() {
        let now = Utc::now();
        let mut record = failed("c", now);
        record["content"]["status"] = json!("cancelled");
        record["metadata"]["status"] = json!("cancelled");
        let records = vec![failed("a", now), failed("b", now), record];
        assert!(cooling_runbooks("owner", &records, now).unwrap().is_empty());
        let mut other = failed("d", now);
        other["content"]["runbook_id"] = json!("other_book");
        other["metadata"]["runbook_id"] = json!("other_book");
        let records = vec![failed("a", now), failed("b", now), other];
        assert!(cooling_runbooks("owner", &records, now).unwrap().is_empty());
    }
}
