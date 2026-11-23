//! Trusted operator configuration for short, individually reviewed application cohorts.
use crate::{runbook_contract::*, runbook_store::digest, runbook_validation::identifier};
use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use serde_json::json;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ExecutionKind {
    Draft,
    Tool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admission_binds_exact_contract_step_autonomy_and_owner() {
        let mut definition = crate::runbook_starter_pack::starter_definitions()
            .into_iter()
            .find(|d| d.steps.iter().any(|s| s.kind == StepKind::Draft))
            .unwrap();
        definition.enabled = true;
        definition.max_autonomy = MaxAutonomy::DraftOnly;
        let step = definition
            .steps
            .iter()
            .find(|s| s.kind == StepKind::Draft)
            .unwrap()
            .step_id
            .clone();
        let policy = ExecutionCohort::parse(
            ExecutionKind::Draft,
            "true",
            &json!({
                "expires_at":Utc::now()+Duration::minutes(5),"members":[{"owner":"owner_a",
                "runbook_id":definition.runbook_id,"version":definition.version,"step_id":step,
                "definition_sha256":digest(&json!(definition))}]
            })
            .to_string(),
            Utc::now(),
        )
        .unwrap();
        assert!(policy.admits_definition("owner_a", &definition, &step));
        assert!(!policy.admits_definition("owner_b", &definition, &step));
        assert!(!policy.admits_definition("owner_a", &definition, "complete"));
        let mut changed = definition.clone();
        changed
            .steps
            .iter_mut()
            .find(|s| s.step_id == step)
            .unwrap()
            .max_retries = 1;
        assert!(!policy.admits_definition("owner_a", &changed, &step));
        changed = definition.clone();
        changed.max_autonomy = MaxAutonomy::ApprovalRequired;
        assert!(!policy.admits_definition("owner_a", &changed, &step));
        changed = definition.clone();
        changed.version += 1;
        assert!(!policy.admits_definition("owner_a", &changed, &step));
        changed = definition.clone();
        changed.enabled = false;
        assert!(!policy.admits_definition("owner_a", &changed, &step));
        changed = definition.clone();
        changed.tools_allowlist.push("mail.send".into());
        assert!(!policy.admits_definition("owner_a", &changed, &step));
    }
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Member {
    owner: String,
    runbook_id: String,
    version: u32,
    definition_sha256: String,
    step_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Configuration {
    expires_at: DateTime<Utc>,
    members: Vec<Member>,
}

#[derive(Clone)]
pub struct ExecutionCohort {
    kind: ExecutionKind,
    pub(crate) expires_at: DateTime<Utc>,
    members: Vec<Member>,
}

impl ExecutionCohort {
    pub fn from_env(kind: ExecutionKind) -> Result<Self> {
        let prefix = match kind {
            ExecutionKind::Draft => "OMNYID_RUNBOOK_DRAFT",
            ExecutionKind::Tool => "OMNYID_RUNBOOK_TOOL_EXECUTION",
        };
        Self::parse(
            kind,
            &std::env::var(format!("{prefix}_ENABLED")).unwrap_or_default(),
            &std::env::var(format!("{prefix}_COHORT")).unwrap_or_default(),
            Utc::now(),
        )
    }

    pub fn parse(
        kind: ExecutionKind,
        enabled: &str,
        text: &str,
        now: DateTime<Utc>,
    ) -> Result<Self> {
        if enabled != "true" || text.len() > 32768 {
            return Err("execution_cohort_unavailable");
        }
        let config: Configuration =
            serde_json::from_str(text).map_err(|_| "execution_cohort_unavailable")?;
        if config.expires_at <= now
            || config.expires_at > now + Duration::hours(1)
            || config.members.is_empty()
            || config.members.len() > 100
            || config.members.iter().any(|m| {
                !identifier(&m.owner)
                    || m.owner.len() > 55
                    || !identifier(&m.runbook_id)
                    || !identifier(&m.step_id)
                    || m.version == 0
                    || m.definition_sha256.len() != 64
                    || !m
                        .definition_sha256
                        .bytes()
                        .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
            })
        {
            return Err("execution_cohort_unavailable");
        }
        Ok(Self {
            kind,
            expires_at: config.expires_at,
            members: config.members,
        })
    }

    pub fn admits_owner(&self, owner: &str, now: DateTime<Utc>) -> bool {
        now < self.expires_at && self.members.iter().any(|m| m.owner == owner)
    }

    pub(crate) fn admits_definition(
        &self,
        owner: &str,
        definition: &RunbookDefinition,
        step_id: &str,
    ) -> bool {
        if !self.admits_owner(owner, Utc::now())
            || !definition.enabled
            || definition.status != DefinitionStatus::Active
        {
            return false;
        }
        let Some(step) = definition.steps.iter().find(|s| s.step_id == step_id) else {
            return false;
        };
        let allowed = match self.kind {
            ExecutionKind::Draft => {
                step.kind == StepKind::Draft
                    && definition.max_autonomy == MaxAutonomy::DraftOnly
                    && definition.tools_allowlist.is_empty()
                    && !definition.steps.iter().any(|s| s.kind == StepKind::Tool)
            }
            ExecutionKind::Tool => {
                step.kind == StepKind::Tool
                    && definition.max_autonomy == MaxAutonomy::ApprovalRequired
            }
        };
        allowed
            && step.max_retries == 0
            && self.members.iter().any(|m| {
                m.owner == owner
                    && m.runbook_id == definition.runbook_id
                    && m.version == definition.version
                    && m.step_id == step_id
                    && m.definition_sha256 == digest(&json!(definition))
            })
    }
}
