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
        let value = self.activity_in(owner, id, &mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(value)
    }

    /// Bounded ledger projection, with active questions first. A truncated page
    /// is explicit rather than silently implying an empty/comprehensive queue.
    pub async fn activities(&self, owner: &str) -> Result<Value> {
        let mut tx = self.store.begin(owner).await?;
        let records = self
            .store
            .read_kind(owner, "runbook_instance", None, None, &mut tx)
            .await?;
        // Use verified immutable records only to rank page candidates. Fully
        // validate each displayed history in activity_in; avoid an extra query
        // for every off-page instance on accounts with long histories.
        let mut latest: BTreeMap<String, RunbookInstance> = BTreeMap::new();
        for record in records {
            if let RuntimeRecord::Instance(i) = parse_runtime_afp(owner, &record)? {
                if latest
                    .get(&i.instance_id)
                    .is_none_or(|old| old.revision < i.revision)
                {
                    latest.insert(i.instance_id.clone(), i);
                }
            }
        }
        let mut current: Vec<_> = latest
            .into_values()
            .map(|i| (i.status != InstanceState::WaitingForInput, i.instance_id))
            .collect();
        current.sort();
        let truncated = current.len() > 50;
        let mut activities = Vec::new();
        for (_, id) in current.into_iter().take(50) {
            activities.push(self.activity_in(owner, &id, &mut tx).await?);
        }
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(json!({"activities":activities,"truncated":truncated,"execution_available":false}))
    }

    async fn activity_in(
        &self,
        owner: &str,
        id: &str,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<Value> {
        let current = self.load_instance(owner, id, tx).await?;
        let thread = format!("runbook:{id}");
        let mut traces = vec![];
        for value in self
            .store
            .read_kind(owner, "runbook_step_trace", None, Some(&thread), tx)
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
            .read_kind(owner, "epistemic_escalation", None, Some(&thread), tx)
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
        let mut reviews = vec![];
        for value in self
            .store
            .read_kind(owner, "runbook_emission", None, Some(&thread), tx)
            .await?
        {
            let receipt = crate::runbook_emit::validate_receipt(owner, &value)?;
            if receipt.instance_id != id {
                return Err("review_instance_mismatch");
            }
            let suggestion = self
                .store
                .read_kind(
                    owner,
                    "proactive_suggestion",
                    Some(&receipt.suggestion_ref),
                    None,
                    tx,
                )
                .await?
                .pop()
                .ok_or("review_required")?;
            crate::runbook_emit::validate_suggestion(owner, &suggestion)?;
            if receipt.trace.output_hash.as_deref()
                != Some(crate::runbook_store::digest(&suggestion["content"]).as_str())
            {
                return Err("review_hash_mismatch");
            }
            reviews.push(json!({"id":receipt.suggestion_ref,"trace_id":receipt.trace.trace_id,
                "title":suggestion["content"]["title"],"summary_lines":suggestion["content"]["artifact_summary_lines"],
                "source_refs":suggestion["content"]["source_refs"]}));
            if reviews.len() > MAX_STEPS {
                return Err("review_limit");
            }
        }
        let i = current.instance;
        let mut result = json!({"instance":{"instance_id":i.instance_id,"runbook_id":i.runbook_id,"runbook_version":i.runbook_version,
            "status":i.status,"revision":i.revision,"current_step_id":i.current_step_id,"completed_step_ids":i.completed_step_ids,
            "next_follow_up_at":i.next_follow_up_at,"wait_expires_at":i.wait_expires_at},
            "reviews":reviews,"traces":traces,"questions":questions.into_values().collect::<Vec<_>>(),"execution_available":false});
        if i.status == InstanceState::WaitingForBudget {
            result["budget"] = json!(
                self.model_budget_in(owner, &i, chrono::Utc::now(), tx)
                    .await?
            );
        }
        result["views"] = activity_views(&result);
        Ok(result)
    }
}

// Semantic views carry only the same bounded public summary fields. They never
// supply authority; interactive clients reload authenticated activity before acting.
pub fn activity_views(activity: &Value) -> Value {
    let i = &activity["instance"];
    let mut views = vec![json!({"format":"a2ui","content":{"kind":"runbook_instance",
        "instance_id":i["instance_id"],"title":"Runbook activity"}})];
    for trace in activity["traces"].as_array().into_iter().flatten() {
        views.push(
            json!({"format":"a2ui","content":{"kind":"runbook_step_summary",
            "instance_id":i["instance_id"],"title":"Step activity","step_id":trace["step_id"]}}),
        );
        if trace["approval_ref"].as_str().is_some() {
            views.push(
                json!({"format":"a2ui","content":{"kind":"runbook_approval_link",
                "instance_id":i["instance_id"],"title":"Approval evidence"}}),
            );
        }
    }
    for q in activity["questions"].as_array().into_iter().flatten() {
        if q["status"] == "open" {
            views.push(json!({"format":"a2ui","content":{"kind":"runbook_question",
                "instance_id":i["instance_id"],"title":"Information needed"}}));
        }
    }
    json!(views)
}
