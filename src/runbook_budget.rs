//! Owner-serialized model spending derived from the encrypted private ledger.
//! UTC daily account/runbook limits and lifetime instance limits are restrictive
//! caps, not funding or inference authority. Unknown spend never expires away.
use crate::{
    runbook_contract::*,
    runbook_llm_step::{ModelEvaluation, ModelPolicy},
    runbook_model_runtime::Reservation,
    runbook_runtime::{InstanceRecord, RunbookRuntime},
    runbook_store::digest,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BudgetLimits {
    pub account_daily_microunits: u64,
    pub runbook_daily_microunits: u64,
    pub instance_microunits: u64,
}
impl BudgetLimits {
    fn validate(&self) -> Result<()> {
        // Bounds keep arithmetic exact; zero explicitly disables model spending.
        if [
            self.account_daily_microunits,
            self.runbook_daily_microunits,
            self.instance_microunits,
        ]
        .iter()
        .any(|n| *n > 1_000_000_000)
        {
            return Err("invalid_budget_limits");
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BudgetPolicy {
    pub revision: u32,
    pub limits: BudgetLimits,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BudgetReservation {
    pub policy_ref: String,
    pub runbook_id: String,
    pub reserved_microunits: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BudgetUsage {
    pub account_daily_microunits: u64,
    pub runbook_daily_microunits: u64,
    pub instance_microunits: u64,
    pub uncertain_reservations: u32,
    pub provider_ceiling_breached: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BudgetSnapshot {
    pub policy_ref: Option<String>,
    pub limits: BudgetLimits,
    pub usage: BudgetUsage,
}
impl BudgetSnapshot {
    pub fn check(&self, amount: u64) -> Result<()> {
        if self.usage.provider_ceiling_breached {
            return Err("model_budget_requires_reconciliation");
        }
        for (used, limit) in [
            (
                self.usage.account_daily_microunits,
                self.limits.account_daily_microunits,
            ),
            (
                self.usage.runbook_daily_microunits,
                self.limits.runbook_daily_microunits,
            ),
            (
                self.usage.instance_microunits,
                self.limits.instance_microunits,
            ),
        ] {
            if amount == 0 || used.checked_add(amount).is_none_or(|n| n > limit) {
                return Err("model_budget_exhausted");
            }
        }
        Ok(())
    }
}

pub(crate) fn reservation_amount(step: &Step, policy: &ModelPolicy) -> Result<u64> {
    let attempts = if policy.allow_escalation && step.max_retries > 0 {
        2
    } else {
        1
    };
    policy
        .attempt_cost_ceiling
        .checked_mul(attempts)
        .map(|n| n.min(step.cost_limit_microunits))
        .filter(|n| *n > 0)
        .ok_or("invalid_budget_reservation")
}

// An observed failure still costs money. Unknown usage retains its attempt ceiling;
// no result (including a crash before finalization) retains the entire reservation.
pub fn accounted_usage(
    evaluation: Option<&ModelEvaluation>,
    reserved: u64,
) -> Result<(u64, bool, bool)> {
    let Some(evaluation) = evaluation else {
        return Ok((reserved, true, false));
    };
    let mut amount = 0u64;
    let mut unknown = false;
    let mut breach = false;
    for attempt in &evaluation.attempts {
        unknown |= !attempt.usage_known;
        breach |= attempt.cost_microunits > attempt.reserved_cost_microunits;
        amount = amount
            .checked_add(if attempt.usage_known {
                attempt.cost_microunits
            } else {
                attempt.reserved_cost_microunits
            })
            .ok_or("budget_usage_overflow")?;
    }
    Ok((amount, unknown, breach || amount > reserved))
}

pub fn counts_toward_day(started_at: DateTime<Utc>, now: DateTime<Utc>, uncertain: bool) -> bool {
    uncertain || started_at.date_naive() >= now.date_naive()
}

fn policy_id(owner: &str, policy: &BudgetPolicy) -> String {
    digest(&json!(["runbook_budget_policy.v1", owner, policy]))
}
pub(crate) fn validate(owner: &str, value: &Value) -> Result<BudgetPolicy> {
    let policy: BudgetPolicy =
        serde_json::from_value(value["content"].clone()).map_err(|_| "invalid_budget_policy")?;
    policy.limits.validate()?;
    if policy.revision == 0
        || policy.revision > 4096
        || value["protocol"] != "afp-v1"
        || value["type"] != "runbook_budget_policy"
        || value["subtype"] != "v1"
        || value["id"] != policy_id(owner, &policy)
        || value["from"] != owner
        || value["to"] != json!([owner])
        || value["thread_id"] != "runbook:budget"
        || value["references"] != json!([])
        || value["metadata"] != json!({"private":true,"store":true})
        || value["supertags"] != json!(["runbook_budget_policy"])
        || value["store_in_relational"] != true
        || DateTime::parse_from_rfc3339(value["timestamp"].as_str().unwrap_or("")).is_err()
    {
        return Err("invalid_budget_policy");
    }
    Ok(policy)
}

impl RunbookRuntime<'_, '_> {
    async fn budget_policies(
        &self,
        owner: &str,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<Vec<Value>> {
        let mut records = self
            .store
            .read_kind(owner, "runbook_budget_policy", None, None, tx)
            .await?;
        records.sort_by_key(|v| v["content"]["revision"].as_u64());
        for (index, record) in records.iter().enumerate() {
            let p = validate(owner, record)?;
            let parent = index
                .checked_sub(1)
                .map(|i| records[i]["id"].clone())
                .unwrap_or(Value::Null);
            if p.revision as usize != index + 1 || record["parent_id"] != parent {
                return Err("invalid_budget_history");
            }
        }
        Ok(records)
    }

    /// Trusted internal configuration boundary, deliberately not exposed by HTTP.
    /// Limits cannot be supplied by model input, a definition, or execute_model.
    pub async fn configure_model_budget(
        &self,
        owner: &str,
        expected_revision: u32,
        limits: BudgetLimits,
    ) -> Result<BudgetPolicy> {
        limits.validate()?;
        let mut tx = self.store.begin(owner).await?;
        let records = self.budget_policies(owner, &mut tx).await?;
        let policy = BudgetPolicy {
            revision: expected_revision
                .checked_add(1)
                .ok_or("revision_overflow")?,
            limits,
        };
        let id = policy_id(owner, &policy);
        if records.iter().any(|v| v["id"] == id) {
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(policy);
        }
        if records.len() != expected_revision as usize {
            return Err("stale_budget_revision");
        }
        self.store.append(owner, json!({"protocol":"afp-v1","id":id,"thread_id":"runbook:budget",
            "parent_id":records.last().map(|v| &v["id"]),"from":owner,"to":[owner],"timestamp":Utc::now().to_rfc3339(),
            "type":"runbook_budget_policy","subtype":"v1","content":policy,"references":[],
            "metadata":{"private":true,"store":true},"supertags":["runbook_budget_policy"],"store_in_relational":true}), &mut tx).await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(policy)
    }

    pub async fn model_budget(&self, owner: &str, instance_id: &str) -> Result<BudgetSnapshot> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, instance_id, &mut tx).await?;
        let snapshot = self
            .model_budget_in(owner, &current.instance, Utc::now(), &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(snapshot)
    }

    pub(crate) async fn model_budget_in(
        &self,
        owner: &str,
        instance: &RunbookInstance,
        now: DateTime<Utc>,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<BudgetSnapshot> {
        let policies = self.budget_policies(owner, tx).await?;
        let mut snapshot = BudgetSnapshot {
            policy_ref: policies
                .last()
                .and_then(|v| v["id"].as_str().map(str::to_owned)),
            limits: policies
                .last()
                .map(|v| validate(owner, v).map(|p| p.limits))
                .transpose()?
                .unwrap_or_default(),
            usage: BudgetUsage::default(),
        };
        let mut results = BTreeMap::new();
        for value in self
            .store
            .read_kind(owner, "runbook_model_result", None, None, tx)
            .await?
        {
            let r = crate::runbook_model_runtime::parse_receipt(owner, &value)?;
            if results.insert(r.reservation_ref.clone(), r).is_some() {
                return Err("duplicate_model_settlement");
            }
        }
        for value in self
            .store
            .read_kind(owner, "runbook_model_reservation", None, None, tx)
            .await?
        {
            let r: Reservation = serde_json::from_value(value["content"].clone())
                .map_err(|_| "invalid_model_reservation")?;
            let budget = r
                .budget
                .as_ref()
                .ok_or("legacy_model_budget_requires_reconciliation")?;
            if !policies.iter().any(|v| v["id"] == budget.policy_ref) {
                return Err("budget_policy_missing");
            }
            let result = results.remove(value["id"].as_str().ok_or("invalid_model_reservation")?);
            if result.as_ref().is_some_and(|v| {
                v.request_hash != r.request_hash
                    || v.trace.instance_id != r.instance_id
                    || v.trace.step_id != r.step_id
            }) {
                return Err("budget_settlement_mismatch");
            }
            let (amount, uncertain, breach) = accounted_usage(
                result.as_ref().map(|v| &v.evaluation),
                budget.reserved_microunits,
            )?;
            snapshot.usage.provider_ceiling_breached |= breach;
            snapshot.usage.uncertain_reservations += u32::from(uncertain);
            // Pending/unknown spend carries across midnight until reconciled. Clock
            // rollback cannot make a future-dated reservation disappear either.
            if counts_toward_day(r.started_at, now, uncertain) {
                snapshot.usage.account_daily_microunits = snapshot
                    .usage
                    .account_daily_microunits
                    .checked_add(amount)
                    .ok_or("budget_usage_overflow")?;
                if budget.runbook_id == instance.runbook_id {
                    snapshot.usage.runbook_daily_microunits = snapshot
                        .usage
                        .runbook_daily_microunits
                        .checked_add(amount)
                        .ok_or("budget_usage_overflow")?;
                }
            }
            if r.instance_id == instance.instance_id {
                snapshot.usage.instance_microunits = snapshot
                    .usage
                    .instance_microunits
                    .checked_add(amount)
                    .ok_or("budget_usage_overflow")?;
            }
        }
        if !results.is_empty() {
            return Err("budget_reservation_missing");
        }
        Ok(snapshot)
    }

    /// Resuming does not spend or grant authority. The executor rechecks the budget
    /// and current policy under the owner lock before it can reserve any money.
    pub async fn resume_model_budget(
        &self,
        owner: &str,
        id: &str,
        expected_revision: u32,
        policy: &ModelPolicy,
    ) -> Result<InstanceRecord> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, id, &mut tx).await?;
        if current.instance.revision != expected_revision {
            return Err("stale_revision");
        }
        if current.instance.status != InstanceState::WaitingForBudget {
            return Err("instance_not_waiting_for_budget");
        }
        self.require_enabled(owner, &current.instance, &mut tx)
            .await?;
        let definition = self.definition(owner, &current.instance, &mut tx).await?;
        let step = definition
            .steps
            .get(current.instance.completed_step_ids.len())
            .ok_or("step_not_found")?;
        crate::runbook_llm_step::schema_for(step.kind)?;
        self.model_budget_in(owner, &current.instance, Utc::now(), &mut tx)
            .await?
            .check(reservation_amount(step, policy)?)?;
        let next = current
            .instance
            .transition(expected_revision, InstanceState::Running)?;
        let record = self
            .append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(record)
    }
}
