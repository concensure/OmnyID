//! Bounded owner-scoped projections. Raw evidence, answers and definitions are
//! intentionally absent; questions expose only the fields required to answer.
use crate::{
    runbook_afp::{RuntimeRecord, parse_runtime_afp},
    runbook_contract::*,
    runbook_runtime::RunbookRuntime,
};
use serde_json::{Value, json};
use std::collections::BTreeMap;

impl RunbookRuntime<'_, '_> {
    pub async fn activity(&self, owner: &str, id: &str) -> Result<Value> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let thread = format!("runbook:{id}");
        let mut traces = vec![];
        for value in self
            .store
            .read_kind(owner, "runbook_step_trace", None, Some(&thread), &mut tx)
            .await?
        {
            let RuntimeRecord::Trace(t) = parse_runtime_afp(owner, &value)? else {
                return Err("invalid_trace");
            };
            traces.push(json!({"trace_id":t.trace_id,"step_id":t.step_id,"kind":t.step_kind,"status":t.status,
                "started_at":t.started_at,"completed_at":t.completed_at,"source_refs":t.input_refs,
                "output_refs":t.output_refs,"provenance_ref":t.provenance_ref,"approval_ref":t.approval_ref}));
        }
        traces.sort_by(|a, b| {
            a["started_at"]
                .as_str()
                .cmp(&b["started_at"].as_str())
                .then(a["trace_id"].as_str().cmp(&b["trace_id"].as_str()))
        });
        let mut questions: BTreeMap<String, EpistemicEscalation> = BTreeMap::new();
        for value in self
            .store
            .read_kind(owner, "epistemic_escalation", None, Some(&thread), &mut tx)
            .await?
        {
            let RuntimeRecord::Escalation(e) = parse_runtime_afp(owner, &value)? else {
                return Err("invalid_escalation");
            };
            if e.instance_id != id {
                return Err("question_instance_mismatch");
            }
            if questions
                .get(&e.escalation_id)
                .is_none_or(|prior| prior.status == EscalationStatus::Open)
            {
                questions.insert(e.escalation_id.clone(), e);
            }
        }
        let i = current.instance;
        Ok(
            json!({"instance":{"instance_id":i.instance_id,"runbook_id":i.runbook_id,"runbook_version":i.runbook_version,
            "status":i.status,"revision":i.revision,"current_step_id":i.current_step_id,"completed_step_ids":i.completed_step_ids,
            "next_follow_up_at":i.next_follow_up_at,"wait_expires_at":i.wait_expires_at},
            "traces":traces,"questions":questions.into_values().collect::<Vec<_>>(),"execution_available":false}),
        )
    }
}
