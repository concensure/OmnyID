//! Expiring internal cohort. No model/tool/approval/wait executor is composed here.
use crate::{
    runbook_contract::*,
    runbook_read::ReadRequest,
    runbook_runtime::{DispatchReceipt, RunbookRuntime},
    runbook_validation::identifier,
};
use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use std::collections::BTreeSet;

#[derive(Default)]
pub struct DeterministicPolicy {
    owners: BTreeSet<String>,
    definitions: BTreeSet<(String, u32)>,
    expires: Option<DateTime<Utc>>,
}
impl DeterministicPolicy {
    pub fn from_env() -> Self {
        let value = |key| std::env::var(key).unwrap_or_default();
        Self::parse(
            &value("OMNYID_RUNBOOK_DETERMINISTIC_ENABLED"),
            &value("OMNYID_RUNBOOK_DETERMINISTIC_OWNERS"),
            &value("OMNYID_RUNBOOK_DETERMINISTIC_DEFINITIONS"),
            &value("OMNYID_RUNBOOK_DETERMINISTIC_EXPIRES_AT"),
            Utc::now(),
        )
    }
    /// Trusted operator configuration only; never accept these values from an event.
    pub fn parse(
        enabled: &str,
        owners: &str,
        definitions: &str,
        expires: &str,
        now: DateTime<Utc>,
    ) -> Self {
        if enabled != "true" || owners.len() > 5600 || definitions.len() > 8000 {
            return Self::default();
        }
        let Ok(expires) = DateTime::parse_from_rfc3339(expires) else {
            return Self::default();
        };
        let expires = expires.with_timezone(&Utc);
        if expires <= now || expires > now + Duration::hours(1) {
            return Self::default();
        }
        let owners: BTreeSet<String> = owners.split(',').map(|s| s.trim().to_string()).collect();
        if owners.is_empty()
            || owners.len() > 100
            || owners.iter().any(|s| !identifier(s) || s.len() > 55)
        {
            return Self::default();
        }
        let mut selected = BTreeSet::new();
        for value in definitions.split(',') {
            let Some((name, version)) = value.trim().split_once('@') else {
                return Self::default();
            };
            let Ok(version) = version.parse::<u32>() else {
                return Self::default();
            };
            if !identifier(name) || version == 0 {
                return Self::default();
            }
            selected.insert((name.to_string(), version));
        }
        if selected.is_empty() || selected.len() > 100 {
            return Self::default();
        }
        Self {
            owners,
            definitions: selected,
            expires: Some(expires),
        }
    }
    pub fn owner_allowed(&self, owner: &str, now: DateTime<Utc>) -> bool {
        self.owners.contains(owner) && self.expires.is_some_and(|expires| now < expires)
    }
    pub fn definition_allowed(&self, definition: &RunbookDefinition) -> bool {
        self.definitions
            .contains(&(definition.runbook_id.clone(), definition.version))
            && definition.enabled
            && definition.status == DefinitionStatus::Active
            && definition.tools_allowlist.is_empty()
            && definition.follow_up_events.is_empty()
            && definition.steps.iter().map(|s| s.kind).collect::<Vec<_>>()
                == vec![
                    StepKind::Read,
                    StepKind::Transform,
                    StepKind::Emit,
                    StepKind::Complete,
                ]
            && crate::runbook_starter_pack::starter_definitions()
                .iter()
                .any(|starter| {
                    matches!(
                        starter.runbook_id.as_str(),
                        "budget_threshold" | "vendor_quote_received" | "wedding_task_deadline"
                    ) && starter.steps == definition.steps
                })
    }
}

#[derive(Debug, Default, Serialize)]
pub struct CohortCounters {
    pub completed: u32,
    pub policy_denied: u32,
    pub terminal_or_waiting: u32,
    pub concurrent_or_stale: u32,
    pub errors: u32,
}

impl RunbookRuntime<'_, '_> {
    /// Bounded continuation of the owner-partitioned receipt from dispatch. Every
    /// write still passes the existing revision, enabled-definition and receipt gates.
    pub async fn run_deterministic_cohort(
        &self,
        owner: &str,
        receipt: &DispatchReceipt,
        policy: &DeterministicPolicy,
    ) -> CohortCounters {
        let mut counters = CohortCounters::default();
        if !policy.owner_allowed(owner, Utc::now()) || receipt.instance_ids.len() > 5 {
            counters.policy_denied += 1;
            return counters;
        }
        let bounded = self.for_cohort(policy.expires.expect("admitted policy has expiry"));
        for id in &receipt.instance_ids {
            match bounded.run_deterministic_instance(owner, id, policy).await {
                Ok(true) => counters.completed += 1,
                Ok(false) => counters.terminal_or_waiting += 1,
                Err("cohort_policy_denied" | "definition_disabled") => counters.policy_denied += 1,
                Err("stale_revision" | "instance_not_matched" | "step_not_current") => {
                    counters.concurrent_or_stale += 1
                }
                Err(_) => counters.errors += 1,
            }
        }
        counters
    }
    async fn run_deterministic_instance(
        &self,
        owner: &str,
        id: &str,
        policy: &DeterministicPolicy,
    ) -> Result<bool> {
        // At most one start plus four executor operations, followed by a final read.
        for _ in 0..6 {
            if !policy.owner_allowed(owner, Utc::now()) {
                return Err("cohort_policy_denied");
            }
            let mut tx = self.begin(owner).await?;
            let current = self.load_instance(owner, id, &mut tx).await?;
            let definition = self.definition(owner, &current.instance, &mut tx).await?;
            if !policy.definition_allowed(&definition) {
                return Err("cohort_policy_denied");
            }
            self.require_enabled(owner, &current.instance, &mut tx)
                .await?;
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            let instance = &current.instance;
            let revision = instance.revision;
            if instance.status == InstanceState::Matched {
                self.start(owner, id, revision).await?;
                continue;
            }
            if instance.status != InstanceState::Running {
                return Ok(false);
            }
            let step = definition
                .steps
                .iter()
                .find(|s| Some(s.step_id.as_str()) == instance.current_step_id.as_deref())
                .ok_or("step_not_found")?;
            match step.kind {
                StepKind::Read => {
                    self.execute_read(
                        owner,
                        id,
                        &ReadRequest {
                            step_id: step.step_id.clone(),
                            expected_revision: revision,
                            snapshot_ref: None,
                            decrypt_limit: 8,
                            byte_limit: 262144,
                        },
                    )
                    .await?;
                }
                StepKind::Transform => {
                    self.execute_transform(owner, id, &step.step_id, revision)
                        .await?;
                }
                StepKind::Emit => {
                    self.emit_review(owner, id, &step.step_id, revision).await?;
                }
                StepKind::Complete => {
                    self.complete(owner, id, revision).await?;
                    return Ok(true);
                }
                _ => return Err("cohort_policy_denied"),
            }
        }
        Err("cohort_step_bound")
    }
}
