//! Exact preparation using the existing owner's approved MCP registry.
//! This is not a grant or an executor: no network request or usage charge occurs.
use super::ToolDispatchContext;
use crate::{runbook_contract::Result, runbook_store::digest, runbook_tool_schema::ToolContract};
use serde_json::{Value, json};

// Deliberately neither Debug nor Serialize: arguments may contain private data.
pub struct PreparedRunbookTool {
    owner: String,
    tool_slug: String,
    capability: String,
    arguments: Value,
    request_hash: String,
    transport_binding: String,
    pub(crate) approval_mode: String,
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
    /// Validate a correlated transport receipt against this frozen output schema.
    /// Schema rejection after a call is still an unknown side-effect outcome.
    pub fn validate_response<'a>(
        &self,
        response: &'a crate::mcp_client::bounded::CallResponse,
    ) -> std::result::Result<&'a Value, crate::mcp_client::bounded::CallFailure> {
        if self.transport_binding != response.request_binding {
            return Err(crate::mcp_client::bounded::CallFailure {
                code: "tool_response_request_mismatch",
                outcome: crate::mcp_client::bounded::CallOutcome::Unknown,
            });
        }
        self.validate_result(response.result()).map_err(|_| {
            crate::mcp_client::bounded::CallFailure {
                code: "tool_output_schema_failed",
                outcome: crate::mcp_client::bounded::CallOutcome::Unknown,
            }
        })
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
    from_snapshot(ctx, slug, capability, arguments, snapshot)
}
pub(crate) async fn prepare_in(
    ctx: &ToolDispatchContext<'_>,
    slug: &str,
    capability: &str,
    arguments: Value,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
) -> Result<PreparedRunbookTool> {
    let snapshot = super::runbook_registry::load_in(ctx, slug, capability, &mut **tx).await?;
    from_snapshot(ctx, slug, capability, arguments, snapshot)
}
fn from_snapshot(
    ctx: &ToolDispatchContext<'_>,
    slug: &str,
    capability: &str,
    arguments: Value,
    snapshot: super::runbook_registry::RegistrySnapshot,
) -> Result<PreparedRunbookTool> {
    let contract = ToolContract::parse(&snapshot.contract)?;
    contract.validate_input(&arguments)?;
    let transport_binding = crate::mcp_client::bounded::request_binding(
        snapshot.binding["endpoint"]
            .as_str()
            .ok_or("invalid_tool_endpoint")?,
        capability,
        &arguments,
    );
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
        transport_binding,
        approval_mode: snapshot.binding["approval_mode"]
            .as_str()
            .ok_or("invalid_tool_policy")?
            .into(),
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
