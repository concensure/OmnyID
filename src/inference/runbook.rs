//! Bounded owner-scoped runbook inference. No route or worker enables this adapter.
//! Credentials use existing owner resolution or explicitly gated shared funding.
use super::InferenceBackend;
use crate::{db::Db, runbook_contract::StepKind, runbook_llm_step::*};
use serde_json::{Value, json};
#[cfg(test)]
mod tests;
mod transport;

pub struct OwnerRunbookModelProvider<'a> {
    db: &'a Db,
    owner: String,
    allow_escalation: bool,
    allow_shared: bool,
}
impl<'a> OwnerRunbookModelProvider<'a> {
    /// Trusted application policy, not request/evidence/model data.
    pub fn new(db: &'a Db, owner: &str, allow_escalation: bool) -> Result<Self, ModelFailure> {
        if !crate::runbook_validation::identifier(owner) {
            return Err(ModelFailure::Provider);
        }
        Ok(Self {
            db,
            owner: owner.into(),
            allow_escalation,
            allow_shared: false,
        })
    }

    /// Trusted composition opt-in. Also requires server rollout flags, account
    /// allowlist, explicit compatible hosted config and both funding budgets.
    pub fn with_shared_funding(
        db: &'a Db,
        owner: &str,
        allow_escalation: bool,
    ) -> Result<Self, ModelFailure> {
        let mut provider = Self::new(db, owner, allow_escalation)?;
        provider.allow_shared = true;
        Ok(provider)
    }
}
#[async_trait::async_trait]
impl ModelProvider for OwnerRunbookModelProvider<'_> {
    async fn infer(&self, request: &ModelRequest) -> Result<ModelResponse, ModelFailure> {
        validate_request(&self.owner, self.allow_escalation, request)?;
        let active: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND COALESCE(account_status,'active')='active')")
            .bind(&self.owner).fetch_one(&self.db.pool).await.map_err(|_| ModelFailure::Provider)?;
        if !active {
            return Err(ModelFailure::Provider);
        }
        let cfg = self
            .db
            .get_llm_config(&self.owner)
            .await
            .map_err(|_| ModelFailure::Provider)?;
        if self.allow_shared && cfg.as_ref().is_some_and(|c| c["backend"] == "hosted") {
            transport::preflight(request)?;
            let reservation = crate::server::llm_resolution::reserve_shared_runbook(
                self.db,
                &self.owner,
                &request.model,
                request.max_cost_microunits,
            )
            .await?;
            let result = transport::call(
                "https://api.openai.com/v1/chat/completions",
                &reservation.api_key,
                request,
            )
            .await?;
            reservation.finish(self.db, &result).await?;
            return Ok(result);
        }
        let resolved =
            crate::server::llm_resolution::resolve_user_inference_backend(self.db, &self.owner)
                .await
                .map_err(|_| ModelFailure::Provider)?
                .ok_or(ModelFailure::Provider)?;
        // The default adapter remains BYOK-only; shared funding requires explicit opt-in.
        // Never silently override the owner's chosen model or use unfunded keys.
        if resolved.backend_name != "byok" {
            return Err(ModelFailure::Provider);
        }
        let InferenceBackend::OpenAICompat {
            base_url, api_key, ..
        } = resolved.backend
        else {
            return Err(ModelFailure::Provider);
        };
        if base_url != "https://api.openai.com/v1" {
            return Err(ModelFailure::Provider);
        }
        if resolved.model != BASE_MODEL {
            return Err(ModelFailure::ModelMismatch);
        }
        transport::call(&format!("{base_url}/chat/completions"), &api_key, request).await
    }
}

fn validate_request(
    owner: &str,
    allow_escalation: bool,
    r: &ModelRequest,
) -> Result<(), ModelFailure> {
    let kind = match r.schema.as_str() {
        "runbook_classification_v1" => StepKind::Classify,
        "runbook_reasoning_v1" => StepKind::Reason,
        "runbook_sourced_draft_v1" => StepKind::Draft,
        _ => return Err(ModelFailure::InvalidSchema),
    };
    let base_key = crate::runbook_store::digest(&json!([
        owner,
        PROMPT_VERSION,
        PREFIX,
        r.schema,
        BASE_MODEL
    ]));
    let expected_key = match r.model.as_str() {
        BASE_MODEL => base_key,
        ESCALATION_MODEL if allow_escalation && r.effort == Effort::Medium => {
            crate::runbook_store::digest(&json!([base_key, ESCALATION_MODEL]))
        }
        _ => return Err(ModelFailure::ModelMismatch),
    };
    if r.cache_key != expected_key
        || r.prompt_version != PROMPT_VERSION
        || r.system_prefix != PREFIX
        || r.output_schema != output_schema(kind).map_err(|_| ModelFailure::InvalidSchema)?
        || r.input.to_string().len() > 16384
        || r.source_refs.is_empty()
        || !crate::runbook_validation::identifiers(&r.source_refs, 8)
        || r.source_refs
            .iter()
            .any(|s| !s.starts_with("private_message:"))
        || r.max_output_tokens == 0
        || r.max_output_tokens > 8192
        || r.max_cost_microunits == 0
        || r.max_cost_microunits > 1_000_000
    {
        return Err(ModelFailure::InvalidSchema);
    }
    Ok(())
}

fn body(r: &ModelRequest) -> Value {
    let body = json!({"model":r.model,"reasoning_effort":r.effort,"store":false,"stream":false,"service_tier":"default",
        "max_completion_tokens":r.max_output_tokens,
        "messages":[{"role":"system","content":r.system_prefix},
        {"role":"user","content":json!({"evidence":r.input,"source_refs":r.source_refs}).to_string()}],
        "response_format":{"type":"json_schema","json_schema":{"name":r.schema,"strict":true,"schema":r.output_schema}}});
    body
}

// Conservative standard rates checked against official model pages 2026-11-19.
// USD microunits per million tokens; input includes 25% cache-write margin.
fn cost(model: &str, input: u32, output: u32) -> Result<u64, ModelFailure> {
    let (i, o): (u64, u64) = match model {
        BASE_MODEL => (125_000, 500_000),
        ESCALATION_MODEL => (2_500_000, 10_000_000),
        _ => return Err(ModelFailure::ModelMismatch),
    };
    Ok((u64::from(input) * i + u64::from(output) * o).div_ceil(1_000_000))
}
