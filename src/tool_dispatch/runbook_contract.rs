//! Exact preparation using the existing owner's approved MCP registry.
//! This is not a grant or an executor: no network request or usage charge occurs.
use super::{load_approved_tools, ApprovedTool, ToolDispatchContext};
use crate::{
    runbook_contract::Result, runbook_store::digest, runbook_tool_schema::ToolContract,
    runbook_validation::identifier,
};
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
    let tools = load_approved_tools(ctx)
        .await
        .map_err(|_| "tool_registry_unavailable")?;
    prepare(ctx.user_id, &tools, slug, capability, arguments)
}

fn prepare(
    owner: &str,
    tools: &[ApprovedTool],
    slug: &str,
    capability: &str,
    arguments: Value,
) -> Result<PreparedRunbookTool> {
    if !identifier(owner) || !identifier(slug) || !identifier(capability) {
        return Err("invalid_tool_selection");
    }
    let matches: Vec<_> = tools
        .iter()
        .filter(|t| t.slug == slug && t.capabilities.iter().any(|c| c == capability))
        .collect();
    if matches.len() != 1 {
        return Err("tool_selection_not_unique");
    }
    let tool = matches[0];
    if tool
        .capabilities
        .iter()
        .filter(|c| c.as_str() == capability)
        .count()
        != 1
    {
        return Err("tool_selection_not_unique");
    }
    let value = tool
        .tool_descriptor
        .get("runbook_contracts")
        .and_then(|m| m.get(capability))
        .ok_or("tool_contract_required")?;
    let contract = ToolContract::parse(value)?;
    contract.validate_input(&arguments)?;
    // Include endpoint/provider and schemas so a later registry change invalidates
    // an exact grant. Credentials are intentionally absent from hashes and output.
    let request_hash = digest(&json!([
        "runbook_tool_request.v1",
        owner,
        slug,
        capability,
        tool.mcp_server_url,
        tool.connection_provider,
        value,
        arguments
    ]));
    Ok(PreparedRunbookTool {
        owner: owner.into(),
        tool_slug: slug.into(),
        capability: capability.into(),
        arguments,
        request_hash,
        contract,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tool() -> ApprovedTool {
        let schema =
            json!({"type":"object","properties":{},"required":[],"additionalProperties":false});
        ApprovedTool {
            slug: "mail".into(),
            name: "Mail".into(),
            mcp_server_url: "https://example.invalid/mcp".into(),
            api_key: "private".into(),
            connection_provider: "mcp".into(),
            capabilities: vec!["read".into()],
            tool_descriptor: json!({"runbook_contracts":{"read":{"version":1,"input_schema":schema,"output_schema":schema}}}),
        }
    }
    #[test]
    fn selection_is_exact_unique_and_schema_bound() {
        let tools = vec![tool()];
        let first = prepare("alice", &tools, "mail", "read", json!({})).unwrap();
        assert!(prepare("alice", &tools, "mail", "send", json!({})).is_err());
        assert!(prepare("alice", &tools, "mail", "read", json!({"query":"injected"})).is_err());
        assert!(prepare("alice", &[tool(), tool()], "mail", "read", json!({})).is_err());
        assert_ne!(
            first.request_hash(),
            prepare("bob", &tools, "mail", "read", json!({}))
                .unwrap()
                .request_hash()
        );
        let mut changed = tool();
        changed.mcp_server_url = "https://other.invalid/mcp".into();
        assert_ne!(
            first.request_hash(),
            prepare("alice", &[changed], "mail", "read", json!({}))
                .unwrap()
                .request_hash()
        );
        let mut changed = tool();
        changed.tool_descriptor["runbook_contracts"]["read"]["input_schema"]["properties"] =
            json!({"optional":{"type":"boolean"}});
        assert_ne!(
            first.request_hash(),
            prepare("alice", &[changed], "mail", "read", json!({}))
                .unwrap()
                .request_hash()
        );
        let mut changed = tool();
        changed.tool_descriptor = json!({});
        assert!(prepare("alice", &[changed], "mail", "read", json!({})).is_err());
    }
}
