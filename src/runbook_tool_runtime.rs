//! Exact-action tool lifecycle. No live provider adapter is enabled.
//! Caller derives owner from a recent authenticated session for human decisions.
pub use crate::runbook_tool_execution::ToolProvider;
pub use crate::runbook_tool_records::{
    ToolDecision, ToolOutcome, ToolProposal, ToolReceipt, ToolRequest,
};
use crate::{
    runbook_contract::*,
    runbook_runtime::RunbookRuntime,
    runbook_tool_records as records,
    tool_dispatch::{
        ToolDispatchContext,
        runbook_contract::{PreparedRunbookTool, prepare_in},
    },
};
use chrono::{Duration, Utc};
use serde_json::json;
use sqlx::{Postgres, Transaction};

impl RunbookRuntime<'_, '_> {
    pub(crate) async fn tool_reviews_in(
        &self,
        owner: &str,
        instance: &RunbookInstance,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<serde_json::Value> {
        let mut reviews = Vec::new();
        let thread = format!("runbook:{}", instance.instance_id);
        for value in self
            .store
            .read_kind(owner, "runbook_tool_proposal", None, Some(&thread), tx)
            .await?
        {
            let p: ToolProposal = records::decode(&value)?;
            if p.instance_id != instance.instance_id {
                return Err("tool_proposal_mismatch");
            }
            let did = records::id("runbook_tool_decision", owner, &p.instance_id, &p.step_id);
            let decision = self
                .store
                .read_kind(owner, "runbook_tool_decision", Some(&did), None, tx)
                .await?
                .pop();
            let pending = instance.status == InstanceState::AwaitingApproval
                && instance.current_step_id.as_deref() == Some(&p.step_id)
                && p.expected_revision.checked_add(1) == Some(instance.revision);
            let status = if let Some(value) = decision {
                let d: ToolDecision = records::decode(&value)?;
                if d.proposal_ref != p.proposal_ref
                    || d.request_hash != p.request_hash
                    || d.instance_id != p.instance_id
                    || d.step_id != p.step_id
                {
                    return Err("tool_decision_mismatch");
                }
                if d.approved { "approved" } else { "rejected" }
            } else if !pending {
                "cancelled"
            } else if p.expires_at <= Utc::now() {
                "expired"
            } else {
                "pending"
            };
            reviews.push(json!({"proposal_ref":p.proposal_ref,"step_id":p.step_id,
                "tool_slug":p.request.tool_slug,"capability":p.request.capability,
                "request_hash":p.request_hash,"expires_at":p.expires_at,"status":status}));
            if reviews.len() > MAX_STEPS {
                return Err("review_limit");
            }
        }
        reviews.sort_by(|a, b| a["proposal_ref"].as_str().cmp(&b["proposal_ref"].as_str()));
        Ok(json!(reviews))
    }

    /// Read the immutable exact request for an owner-authenticated review.
    /// Historical retrieval does not imply current approval or dispatch eligibility.
    pub async fn tool_proposal(
        &self,
        owner: &str,
        instance: &str,
        proposal_ref: &str,
    ) -> Result<ToolProposal> {
        let mut tx = self.store.begin(owner).await?;
        self.load_instance(owner, instance, &mut tx).await?;
        let value = self
            .store
            .read_kind(
                owner,
                "runbook_tool_proposal",
                Some(proposal_ref),
                None,
                &mut tx,
            )
            .await?
            .pop()
            .ok_or("tool_proposal_missing")?;
        let proposal: ToolProposal = records::decode(&value)?;
        if proposal.instance_id != instance {
            return Err("tool_proposal_mismatch");
        }
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(proposal)
    }

    pub(crate) async fn prepare_current_tool(
        &self,
        owner: &str,
        instance: &RunbookInstance,
        request: &ToolRequest,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<PreparedRunbookTool> {
        let definition = self.definition(owner, instance, tx).await?;
        let step = definition
            .steps
            .get(instance.completed_step_ids.len())
            .ok_or("step_not_found")?;
        let capability = format!("{}.{}", request.tool_slug, request.capability);
        if step.kind != StepKind::Tool
            || instance.current_step_id.as_deref() != Some(&step.step_id)
            || step.tool.as_deref() != Some(&capability)
            || !step.input_refs.is_empty()
            || !step.required_fields.is_empty()
        {
            return Err("unsupported_tool_selector");
        }
        let registry = self.store.load(owner, tx).await?;
        let latest = &registry
            .get(&definition.runbook_id)
            .ok_or("definition_not_found")?
            .definition;
        if !latest.enabled
            || latest.status != DefinitionStatus::Active
            || !latest.tools_allowlist.contains(&capability)
            || matches!(
                latest.max_autonomy,
                MaxAutonomy::ObserveOnly | MaxAutonomy::DraftOnly
            )
        {
            return Err("tool_policy_denied");
        }
        let prepared = prepare_in(
            &ToolDispatchContext {
                user_id: owner,
                db: self.store.db,
            },
            &request.tool_slug,
            &request.capability,
            request.arguments.clone(),
            tx,
        )
        .await?;
        let level: Option<i32> = sqlx::query_scalar(
            "SELECT level FROM user_proactivity_config WHERE owner_user_id=$1 FOR SHARE",
        )
        .bind(owner)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|_| "storage_unavailable")?;
        let tier:Option<String>=sqlx::query_scalar("SELECT autonomy_tier FROM heuristic_autonomy_overrides WHERE owner_user_id=$1 AND heuristic_id=$2 FOR SHARE")
            .bind(owner).bind(format!("runbook:{}",definition.runbook_id)).fetch_optional(&mut **tx).await.map_err(|_|"storage_unavailable")?;
        let policy = crate::runbook_authority::evaluate_tool_policy(
            owner,
            &definition,
            step,
            Some(&crate::runbook_authority::ConnectedToolPolicy {
                owner: owner.into(),
                tool: capability,
                healthy: true,
                revoked: false,
                approval_mode: prepared.approval_mode.clone(),
            }),
            level.unwrap_or(1),
            tier.as_deref(),
        );
        if policy.disposition != crate::runbook_authority::PolicyDisposition::ReviewRequired {
            return Err("tool_policy_denied");
        }
        Ok(prepared)
    }
    /// Explicit human-proposed exact arguments only. Automated evidence-to-tool
    /// selectors are unsupported; they must be implemented and reviewed separately.
    pub async fn propose_tool(
        &self,
        owner: &str,
        instance: &str,
        step: &str,
        expected_revision: u32,
        request: &ToolRequest,
    ) -> Result<ToolProposal> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, instance, &mut tx).await?;
        if !crate::runbook_validation::identifier(step) {
            return Err("invalid_step_id");
        }
        let pid = records::id("runbook_tool_proposal", owner, instance, step);
        if let Some(v) = self
            .store
            .read_kind(owner, "runbook_tool_proposal", Some(&pid), None, &mut tx)
            .await?
            .pop()
        {
            let old: ToolProposal = records::decode(&v)?;
            if old.expected_revision != expected_revision || &old.request != request {
                return Err("tool_proposal_conflict");
            }
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(old);
        }
        if current.instance.revision != expected_revision {
            return Err("stale_revision");
        }
        if current.instance.status != InstanceState::Running
            || current.instance.current_step_id.as_deref() != Some(step)
        {
            return Err("step_not_current");
        }
        let prepared = self
            .prepare_current_tool(owner, &current.instance, request, &mut tx)
            .await?;
        let proposal = ToolProposal {
            proposal_ref: pid.clone(),
            instance_id: instance.into(),
            step_id: step.into(),
            request: request.clone(),
            request_hash: prepared.request_hash().into(),
            definition_ref: current.instance.definition_ref.clone(),
            expected_revision,
            expires_at: Utc::now() + Duration::minutes(10),
        };
        self.store
            .append(
                owner,
                records::envelope(
                    owner,
                    "runbook_tool_proposal",
                    instance,
                    step,
                    &current.message_id,
                    json!(proposal),
                ),
                &mut tx,
            )
            .await?;
        let next = current
            .instance
            .transition(expected_revision, InstanceState::AwaitingApproval)?;
        self.append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(proposal)
    }
    /// Requires a recent authenticated human session at any future route boundary.
    /// A private-review decision, a model answer or a policy receipt is not accepted.
    pub async fn decide_tool(
        &self,
        owner: &str,
        instance: &str,
        proposal_ref: &str,
        expected_revision: u32,
        approved: bool,
    ) -> Result<ToolDecision> {
        let mut tx = self.store.begin(owner).await?;
        let current = self.load_instance(owner, instance, &mut tx).await?;
        let value = self
            .store
            .read_kind(
                owner,
                "runbook_tool_proposal",
                Some(proposal_ref),
                None,
                &mut tx,
            )
            .await?
            .pop()
            .ok_or("tool_proposal_missing")?;
        let proposal: ToolProposal = records::decode(&value)?;
        if proposal.instance_id != instance {
            return Err("tool_proposal_mismatch");
        }
        let decision = ToolDecision {
            instance_id: instance.into(),
            step_id: proposal.step_id.clone(),
            proposal_ref: proposal_ref.into(),
            request_hash: proposal.request_hash.clone(),
            expected_revision,
            approved,
        };
        let did = records::id("runbook_tool_decision", owner, instance, &proposal.step_id);
        if let Some(v) = self
            .store
            .read_kind(owner, "runbook_tool_decision", Some(&did), None, &mut tx)
            .await?
            .pop()
        {
            let old: ToolDecision = records::decode(&v)?;
            if old != decision {
                return Err("tool_decision_conflict");
            }
            tx.commit().await.map_err(|_| "storage_unavailable")?;
            return Ok(old);
        }
        if current.instance.revision != expected_revision {
            return Err("stale_revision");
        }
        if current.instance.status != InstanceState::AwaitingApproval
            || current.instance.current_step_id.as_deref() != Some(&proposal.step_id)
        {
            return Err("tool_not_pending");
        }
        if approved {
            if proposal.expires_at <= Utc::now() {
                return Err("tool_proposal_expired");
            }
            let prepared = self
                .prepare_current_tool(owner, &current.instance, &proposal.request, &mut tx)
                .await?;
            if prepared.request_hash() != proposal.request_hash {
                return Err("tool_preparation_stale");
            }
        }
        self.store
            .append(
                owner,
                records::envelope(
                    owner,
                    "runbook_tool_decision",
                    instance,
                    &proposal.step_id,
                    proposal_ref,
                    json!(decision),
                ),
                &mut tx,
            )
            .await?;
        let mut next = current.instance.transition(
            expected_revision,
            if approved {
                InstanceState::Running
            } else {
                InstanceState::Cancelled
            },
        )?;
        if !approved {
            next.current_step_id = None;
        }
        self.append_instance(owner, Some(&current.message_id), next, &mut tx)
            .await?;
        tx.commit().await.map_err(|_| "storage_unavailable")?;
        Ok(decision)
    }
}
