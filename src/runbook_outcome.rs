//! Owner-authenticated feedback, never approval. Immutable receipts are the source;
//! the existing proactive outcomes table remains a transactional shared projection.
use crate::{
    proactive_outcome_memory::*,
    runbook_afp::{RuntimeRecord, parse_runtime_afp},
    runbook_contract::*,
    runbook_runtime::RunbookRuntime,
    runbook_store::digest,
    runbook_validation::identifier,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Accepted,
    Dismissed,
    Regretted,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutcomeReceipt {
    pub instance_id: String,
    pub trace_id: String,
    pub heuristic_id: String,
    pub family_id: String,
    pub outcome: Outcome,
}

pub fn outcome_key(runbook: &str, step: &str) -> Result<String> {
    if !identifier(runbook) || !identifier(step) {
        return Err("invalid_outcome_key");
    }
    Ok(format!(
        "runbook:{}:{}",
        runbook.replace(':', "%3A"),
        step.replace(':', "%3A")
    ))
}

/// Feedback may only remove/reorder existing matches. Never backfill a suppressed
/// winner, change the frozen definition, or turn acceptance into an approval.
pub fn apply_feedback(
    mut decisions: Vec<crate::runbook_matcher::MatchDecision>,
    registry: &crate::runbook_registry::Registry,
    feedback: &[HeuristicOutcomeFeedback],
) -> Result<Vec<crate::runbook_matcher::MatchDecision>> {
    use crate::runbook_matcher::MatchDisposition;
    let mut ranked = Vec::new();
    for (index, decision) in decisions.iter_mut().enumerate() {
        let definition = &registry
            .get(&decision.runbook_id)
            .ok_or("definition_not_found")?
            .definition;
        for step in &definition.steps {
            let key = outcome_key(&definition.runbook_id, &step.step_id)?;
            let suggestion = json!({"heuristic_id":key});
            let exact = feedback
                .iter()
                .filter(|f| f.scope == "exact")
                .cloned()
                .collect::<Vec<_>>();
            let cooling = exact
                .iter()
                .any(|f| f.heuristic_id == key && f.status == "cooldown_recommended");
            if decision.disposition == MatchDisposition::Matched
                && (cooling || !suggestion_allowed_by_outcome_feedback(&suggestion, &exact))
            {
                decision.disposition = MatchDisposition::OutcomeCooldown;
            }
        }
        ranked.push(json!({"index":index,"heuristic_family_id":format!("runbook:{}",definition.runbook_id.replace(':', "%3A"))}));
    }
    // Stable shared ranking preserves deterministic match order on ties.
    Ok(
        reprioritize_suggestions_by_outcome_feedback(ranked, feedback)
            .into_iter()
            .map(|v| decisions[v["index"].as_u64().unwrap() as usize].clone())
            .collect(),
    )
}

impl RunbookRuntime<'_, '_> {
    /// A dismissal cannot become an acceptance. A prior acceptance can be regretted
    /// once; retries return the original receipt without inflating sample counts.
    pub async fn record_outcome(
        &self,
        owner: &str,
        id: &str,
        trace_id: &str,
        outcome: Outcome,
    ) -> Result<OutcomeReceipt> {
        if !identifier(trace_id) {
            return Err("invalid_trace_id");
        }
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        let value = self
            .store
            .read_kind(
                owner,
                "runbook_step_trace",
                Some(trace_id),
                Some(&current.instance.thread_id),
                &mut tx,
            )
            .await?
            .pop()
            .ok_or("step_trace_missing")?;
        let RuntimeRecord::Trace(trace) = parse_runtime_afp(owner, &value)? else {
            return Err("invalid_trace");
        };
        if trace.instance_id != id
            || trace.status == TraceStatus::Denied
            || trace.status == TraceStatus::Failed
        {
            return Err("outcome_not_reviewable");
        }
        let key = outcome_key(&current.instance.runbook_id, &trace.step_id)?;
        let root = digest(&json!(["runbook_outcome.v1", owner, trace_id]));
        let receipt_id = if outcome == Outcome::Regretted {
            digest(&json!(["runbook_regret.v1", owner, trace_id]))
        } else {
            root.clone()
        };
        if let Some(prior) = self
            .store
            .read_kind(owner, "runbook_outcome", Some(&receipt_id), None, &mut tx)
            .await?
            .pop()
        {
            let receipt = validate(owner, &prior)?;
            if receipt.outcome != outcome {
                return Err("outcome_replay_conflict");
            }
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(receipt);
        }
        if outcome == Outcome::Regretted {
            let prior = self
                .store
                .read_kind(owner, "runbook_outcome", Some(&root), None, &mut tx)
                .await?
                .pop()
                .ok_or("acceptance_required")?;
            if validate(owner, &prior)?.outcome != Outcome::Accepted {
                return Err("acceptance_required");
            }
        }
        let receipt = OutcomeReceipt {
            instance_id: id.into(),
            trace_id: trace_id.into(),
            heuristic_id: key.clone(),
            family_id: format!(
                "runbook:{}",
                current.instance.runbook_id.replace(':', "%3A")
            ),
            outcome,
        };
        let message = json!({"protocol":"afp-v1","id":receipt_id,"thread_id":current.instance.thread_id,
            "parent_id":if outcome==Outcome::Regretted {&root}else{trace_id},"from":owner,"to":[owner],
            "timestamp":Utc::now().to_rfc3339(),"type":"runbook_outcome","subtype":"v1","content":receipt,
            "metadata":{"private":true,"store":true},"references":[],"supertags":["runbook_outcome"],"store_in_relational":true});
        self.store.append(owner, message, &mut tx).await?;
        // One projection row per reviewed trace, including regret. The append-only
        // private receipts retain original acceptance; projections reflect regret.
        sqlx::query("INSERT INTO proactive_outcomes (id,owner_user_id,suggestion_id,accepted,outcome_afp_id,heuristic_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET accepted=EXCLUDED.accepted,outcome_afp_id=EXCLUDED.outcome_afp_id,created_at=NOW() WHERE proactive_outcomes.owner_user_id=EXCLUDED.owner_user_id")
            .bind(&root).bind(owner).bind(trace_id).bind(outcome==Outcome::Accepted).bind(&receipt_id).bind(key)
            .execute(&mut *tx).await.map_err(|_|"storage_unavailable")?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(receipt)
    }

    pub(crate) async fn outcome_feedback_in(
        &self,
        owner: &str,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<Vec<HeuristicOutcomeFeedback>> {
        // Do not trust arbitrary heuristic IDs submitted to the older proactive
        // endpoint. Only verified private Runbook receipts influence this runtime.
        let records = self
            .store
            .read_kind(owner, "runbook_outcome", None, None, tx)
            .await?;
        feedback_from_records(owner, &records, Utc::now())
    }
}

pub fn feedback_from_records(
    owner: &str,
    records: &[Value],
    now: DateTime<Utc>,
) -> Result<Vec<HeuristicOutcomeFeedback>> {
    if records.len() > 4096 {
        return Err("outcome_history_limit");
    }
    let mut effective = BTreeMap::<String, (OutcomeReceipt, DateTime<Utc>)>::new();
    for value in records {
        let r = validate(owner, value)?;
        let at =
            DateTime::parse_from_rfc3339(value["timestamp"].as_str().ok_or("invalid_outcome")?)
                .map_err(|_| "invalid_outcome")?
                .with_timezone(&Utc);
        if at > now || at < now - Duration::days(30) {
            continue;
        }
        let entry = effective
            .entry(r.trace_id.clone())
            .or_insert((r.clone(), at));
        if r.outcome == Outcome::Regretted {
            *entry = (r, at);
        }
    }
    let mut exact = BTreeMap::<String, (i64, i64, DateTime<Utc>)>::new();
    let mut family = BTreeMap::<String, (i64, i64, DateTime<Utc>)>::new();
    for (r, at) in effective.values() {
        for (map, key) in [(&mut exact, &r.heuristic_id), (&mut family, &r.family_id)] {
            let e = map.entry(key.clone()).or_insert((0, 0, *at));
            e.0 += 1;
            e.1 += i64::from(r.outcome == Outcome::Accepted);
            e.2 = e.2.max(*at);
        }
    }
    let rates = |map: &BTreeMap<String, (i64, i64, DateTime<Utc>)>| {
        map.iter().map(|(id,(total,accepted,_))|
        json!({"heuristic_id":id,"total":total,"accepted":accepted,"acceptance_rate":*accepted as f64 / *total as f64})).collect::<Vec<_>>()
    };
    let mut feedback = summarize_outcome_rates(&rates(&exact));
    for f in &mut feedback {
        if let Some(hours) = f.suggested_suppression_hours {
            if exact[&f.heuristic_id].2 + Duration::hours(i64::from(hours)) <= now {
                f.status = "neutral".into();
                f.suggested_suppression_hours = None;
            }
        }
    }
    // Family feedback changes ranking only, never suppresses another step or
    // changes autonomy. Shared functions soften negative family signals.
    feedback.extend(summarize_family_outcome_rates(&rates(&family)));
    Ok(feedback)
}

pub(crate) fn validate(owner: &str, value: &Value) -> Result<OutcomeReceipt> {
    let r: OutcomeReceipt =
        serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_outcome")?;
    let root = digest(&json!(["runbook_outcome.v1", owner, r.trace_id]));
    let id = if r.outcome == Outcome::Regretted {
        digest(&json!(["runbook_regret.v1", owner, r.trace_id]))
    } else {
        root.clone()
    };
    let step = r
        .heuristic_id
        .strip_prefix(&format!("{}:", r.family_id))
        .ok_or("invalid_outcome")?;
    let runbook = r
        .family_id
        .strip_prefix("runbook:")
        .ok_or("invalid_outcome")?;
    if outcome_key(&runbook.replace("%3A", ":"), &step.replace("%3A", ":"))? != r.heuristic_id
        || !identifier(&r.instance_id)
        || !identifier(&r.trace_id)
        || value["protocol"] != "afp-v1"
        || value["id"] != id
        || value["from"] != owner
        || value["to"] != json!([owner])
        || value["type"] != "runbook_outcome"
        || value["subtype"] != "v1"
        || value["thread_id"] != format!("runbook:{}", r.instance_id)
        || value["parent_id"]
            != if r.outcome == Outcome::Regretted {
                json!(root)
            } else {
                json!(r.trace_id)
            }
        || value["metadata"] != json!({"private":true,"store":true})
        || value["references"] != json!([])
        || value["supertags"] != json!(["runbook_outcome"])
        || value["store_in_relational"] != true
        || DateTime::parse_from_rfc3339(value["timestamp"].as_str().unwrap_or("")).is_err()
    {
        return Err("invalid_outcome");
    }
    Ok(r)
}
