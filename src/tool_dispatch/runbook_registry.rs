//! Credential-free projection of existing MCP connections AND canonical grants.
//! A connection alone is not authority. This projection permits preparation only.
use super::ToolDispatchContext;
use crate::{runbook_contract::Result, runbook_validation::identifier};
use serde_json::{Value, json};
use sqlx::Row;

pub(super) struct RegistrySnapshot {
    pub binding: Value,
    pub contract: Value,
}

pub(super) async fn load(
    ctx: &ToolDispatchContext<'_>,
    slug: &str,
    capability: &str,
) -> Result<RegistrySnapshot> {
    load_in(ctx, slug, capability, &ctx.db.pool).await
}
pub(super) async fn load_in<'e, E: sqlx::Executor<'e, Database = sqlx::Postgres>>(
    ctx: &ToolDispatchContext<'_>,
    slug: &str,
    capability: &str,
    executor: E,
) -> Result<RegistrySnapshot> {
    if !identifier(ctx.user_id) || !identifier(slug) || !identifier(capability) {
        return Err("invalid_tool_selection");
    }
    // One statement observes one database snapshot. Never select api_key_enc.
    // Do not filter unhealthy/foreign-account duplicates away and accidentally
    // choose an account: definitions do not yet contain an account selector.
    let rows = sqlx::query(
        r#"
        SELECT m.id AS connection_id, m.connected_at AS connection_epoch,
            m.mcp_server_url, m.connection_provider, m.external_user_id,
            CASE WHEN octet_length(m.api_key_enc)<=32768 THEN
                encode(sha256(convert_to(m.api_key_enc, 'UTF8')), 'hex') ELSE NULL END AS credential_fingerprint,
            m.composio_connected_account_id,
            CASE WHEN octet_length(m.tool_descriptor::text)<=65536
                 THEN m.tool_descriptor ELSE NULL END AS descriptor,
            c.id AS grant_id, c.provider, c.account_ref, c.transport,
            c.approval_mode, c.health_state, c.revoked_at IS NOT NULL AS revoked,
            c.secret_ref, c.connected_at::text AS grant_epoch,
            CASE WHEN octet_length(c.granted_scopes_json::text)<=16384
                 THEN c.granted_scopes_json ELSE NULL END AS scopes,
            CASE WHEN octet_length(c.metadata_json::text)<=65536
                 THEN c.metadata_json ELSE NULL END AS metadata
        FROM mcp_tool_connections m
        JOIN user_connected_capabilities c ON c.user_id=m.user_id AND c.capability_id=$3
        WHERE m.user_id=$1 AND m.tool_slug=$2
        ORDER BY c.id LIMIT 2 FOR SHARE OF m, c
    "#,
    )
    .bind(ctx.user_id)
    .bind(slug)
    .bind(format!("{slug}.{capability}"))
    .fetch_all(executor)
    .await
    .map_err(|_| "tool_registry_unavailable")?;
    if rows.len() != 1 {
        return Err("tool_selection_not_unique");
    }
    let row = &rows[0];
    let credential_fingerprint: String = row
        .get::<Option<String>, _>("credential_fingerprint")
        .ok_or("invalid_tool_credential")?;
    let endpoint: String = row.get("mcp_server_url");
    let provider: String = row.get("connection_provider");
    let actor: Option<String> = row.get("external_user_id");
    let account: Option<String> = row.get("composio_connected_account_id");
    let approval: String = row.get("approval_mode");
    if row.get::<String, _>("provider") != "tool_connection"
        || row.get::<String, _>("account_ref") != slug
        || row.get::<String, _>("transport") != provider
        || row.get::<String, _>("health_state") != "healthy"
        || row.get::<bool, _>("revoked")
        || !matches!(approval.as_str(), "autonomous" | "human_approval_required")
        || row.get::<Option<String>, _>("secret_ref").as_deref()
            != Some(format!("mcp_tool_connections:{}:{slug}", ctx.user_id).as_str())
    {
        return Err("tool_capability_unavailable");
    }
    match provider.as_str() {
        "mcp" if actor.is_none() && account.is_none() => (),
        "composio"
            if actor.as_deref() == Some(ctx.user_id)
                && account.as_deref().is_some_and(identifier) =>
        {
            ()
        }
        _ => return Err("tool_account_mismatch"),
    }
    if endpoint.len() > 2048 {
        return Err("invalid_tool_endpoint");
    }
    let url = reqwest::Url::parse(&endpoint).map_err(|_| "invalid_tool_endpoint")?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || crate::mcp_client::validate_mcp_server_url(&endpoint).is_err()
    {
        return Err("invalid_tool_endpoint");
    }
    let descriptor: Option<Value> = row.get("descriptor");
    let metadata: Option<Value> = row.get("metadata");
    let scopes: Option<Value> = row.get("scopes");
    let descriptor = descriptor.ok_or("tool_contract_required")?;
    let metadata = metadata.ok_or("tool_projection_mismatch")?;
    let scopes = scopes.ok_or("invalid_tool_scopes")?;
    let scopes_array = scopes.as_array().ok_or("invalid_tool_scopes")?;
    if scopes_array.len() > 64
        || scopes_array.iter().any(|s| {
            s.as_str()
                .is_none_or(|s| s.is_empty() || s.len() > 160 || s.chars().any(char::is_control))
        })
    {
        return Err("invalid_tool_scopes");
    }
    if metadata["origin"] != "tool_connection"
        || metadata["tool_slug"] != slug
        || metadata["mcp_server_url"] != endpoint
        || metadata["connection_provider"] != provider
    {
        return Err("tool_projection_mismatch");
    }
    for value in [&descriptor, &metadata["tool_descriptor"]] {
        let caps = value["capabilities"]
            .as_array()
            .ok_or("tool_contract_required")?;
        if caps.len() > 64
            || caps
                .iter()
                .any(|v| v.as_str().is_none_or(|s| !identifier(s)))
            || caps
                .iter()
                .filter(|c| c.as_str() == Some(capability))
                .count()
                != 1
        {
            return Err("tool_selection_not_unique");
        }
    }
    let contract = descriptor["runbook_contracts"]
        .get(capability)
        .ok_or("tool_contract_required")?;
    if metadata["tool_descriptor"]["runbook_contracts"][capability] != *contract {
        return Err("tool_projection_mismatch");
    }
    Ok(RegistrySnapshot {
        binding: json!({"connection_id":row.get::<String,_>("connection_id"),
            "connection_epoch":row.get::<String,_>("connection_epoch"),
            "credential_fingerprint":credential_fingerprint,
            "grant_id":row.get::<String,_>("grant_id"),"grant_epoch":row.get::<String,_>("grant_epoch"),
            "endpoint":endpoint,"provider":provider,"external_user_id":actor,"account":account,
            "approval_mode":approval,"scopes":scopes}),
        contract: contract.clone(),
    })
}
