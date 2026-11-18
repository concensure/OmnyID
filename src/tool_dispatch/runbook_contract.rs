//! Exact preparation using the existing owner's approved MCP registry.
//! This is not a grant or an executor: no network request or usage charge occurs.
use super::ToolDispatchContext;
use crate::{runbook_contract::Result, runbook_store::digest, runbook_tool_schema::ToolContract};
use serde_json::{json, Value};

// Deliberately neither Debug nor Serialize: arguments may contain private data.
pub struct PreparedRunbookTool {
    owner: String,
    tool_slug: String,
    capability: String,
    arguments: Value,
    request_hash: String,
    contract: ToolContract,
}
impl PreparedRunbookTool {
    pub fn owner(&self) -> &str {
        &self.owner
    }
    pub fn tool_slug(&self) -> &str {
        &self.tool_slug
    }
    pub fn capability(&self) -> &str {
        &self.capability
    }
    pub fn arguments(&self) -> &Value {
        &self.arguments
    }
    pub fn request_hash(&self) -> &str {
        &self.request_hash
    }
    pub fn validate_result<'a>(&self, result: &'a Value) -> Result<&'a Value> {
        self.contract.validate_result(result)
    }
}

/// Owner is supplied by the authenticated caller, never from a definition/model.
/// Future execution must independently recheck live policy, registry and exact
/// action authority, and bind its durable reservation to this request hash.
pub async fn prepare_runbook_tool(
    ctx: &ToolDispatchContext<'_>,
    slug: &str,
    capability: &str,
    arguments: Value,
) -> Result<PreparedRunbookTool> {
    let snapshot = super::runbook_registry::load(ctx, slug, capability).await?;
    let contract = ToolContract::parse(&snapshot.contract)?;
    contract.validate_input(&arguments)?;
    let request_hash = digest(&json!([
        "runbook_tool_request.v2",
        ctx.user_id,
        slug,
        capability,
        snapshot.binding,
        snapshot.contract,
        arguments
    ]));
    Ok(PreparedRunbookTool {
        owner: ctx.user_id.into(),
        tool_slug: slug.into(),
        capability: capability.into(),
        arguments,
        request_hash,
        contract,
    })
}

/// Detect changed account/connection/grant/schema/input context. This is a fresh
/// preparation check, NOT a durable action grant or protection against a later
/// race. An executor must recheck at its reservation/dispatch boundary.
pub async fn revalidate_runbook_tool(
    ctx: &ToolDispatchContext<'_>,
    prepared: &PreparedRunbookTool,
) -> Result<()> {
    if ctx.user_id != prepared.owner {
        return Err("tool_owner_mismatch");
    }
    let current = prepare_runbook_tool(
        ctx,
        &prepared.tool_slug,
        &prepared.capability,
        prepared.arguments.clone(),
    )
    .await?;
    if current.request_hash != prepared.request_hash {
        return Err("tool_preparation_stale");
    }
    Ok(())
}
