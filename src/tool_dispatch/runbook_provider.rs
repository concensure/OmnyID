//! Trusted internal adapter. Only invoke through RunbookRuntime::execute_tool.
//! No routes, workers, environment flags or default destination enable it.
use super::{
    ToolDispatchContext,
    runbook_contract::{PreparedRunbookTool, prepare_in},
};
use crate::{
    db::Db,
    mcp_client::bounded::{
        self, CallFailure, CallLimits, CallOutcome, CallResponse, destination::PinnedMcpTarget,
    },
    runbook_tool_runtime::ToolProvider,
};
use sqlx::Row;

pub struct McpRunbookProvider<'a> {
    db: &'a Db,
    key: [u8; 32],
    targets: Vec<PinnedMcpTarget>,
}
fn denied() -> CallFailure {
    CallFailure {
        code: "tool_adapter_denied",
        outcome: CallOutcome::NotSent,
    }
}
impl<'a> McpRunbookProvider<'a> {
    /// Key is supplied by the trusted credential service, never the definition,
    /// model or request. Targets must be operator-reviewed and provider-tested.
    pub fn new(
        db: &'a Db,
        key: [u8; 32],
        targets: Vec<PinnedMcpTarget>,
    ) -> Result<Self, &'static str> {
        let unique: std::collections::BTreeSet<_> = targets.iter().map(|t| t.endpoint()).collect();
        if targets.is_empty() || targets.len() > 32 || unique.len() != targets.len() {
            return Err("invalid_tool_destinations");
        }
        Ok(Self { db, key, targets })
    }
}
#[async_trait::async_trait]
impl ToolProvider for McpRunbookProvider<'_> {
    async fn call(&self, request: &PreparedRunbookTool) -> Result<CallResponse, CallFailure> {
        if request.binding["provider"] != "mcp" {
            return Err(denied());
        }
        let endpoint = request.binding["endpoint"].as_str().ok_or_else(denied)?;
        let target = self
            .targets
            .iter()
            .find(|t| t.endpoint() == endpoint)
            .ok_or_else(denied)?;
        let mut tx = self.db.pool.begin().await.map_err(|_| denied())?;
        let owner: Option<String> = sqlx::query_scalar(
            "SELECT id FROM users WHERE id=$1 AND COALESCE(account_status,'active')='active' FOR KEY SHARE")
            .bind(request.owner()).fetch_optional(&mut *tx).await.map_err(|_| denied())?;
        if owner.is_none() {
            return Err(denied());
        }
        // Canonical revalidation locks the exact connection and grant. Ciphertext
        // is fetched under those locks, never through the legacy permissive loader.
        let current = prepare_in(
            &ToolDispatchContext {
                user_id: request.owner(),
                db: self.db,
            },
            request.tool_slug(),
            request.capability(),
            request.arguments().clone(),
            &mut tx,
        )
        .await
        .map_err(|_| denied())?;
        if current.request_hash() != request.request_hash() {
            return Err(denied());
        }
        let row = sqlx::query("SELECT api_key_enc FROM mcp_tool_connections WHERE user_id=$1 AND tool_slug=$2 AND id=$3 AND octet_length(api_key_enc)<=32768")
            .bind(request.owner()).bind(request.tool_slug())
            .bind(request.binding["connection_id"].as_str().ok_or_else(denied)?)
            .fetch_optional(&mut *tx).await.map_err(|_| denied())?.ok_or_else(denied)?;
        let encrypted: String = row.get("api_key_enc");
        // Fail closed on absent, plaintext or wrong-key credentials. Never use the
        // old decrypt-or-plaintext fallback. Anonymous providers are unsupported.
        let credential = crate::crypto::decrypt_secret(&encrypted, &self.key).ok_or_else(denied)?;
        if credential.is_empty() || credential.len() > 8192 {
            return Err(denied());
        }
        tx.commit().await.map_err(|_| denied())?;
        // No database locks across I/O. Reservation was the admission boundary;
        // later cancellation/revocation prevents continuation in the runtime.
        bounded::call_tool_pinned(
            target,
            Some(&credential),
            request.capability(),
            request.arguments(),
            CallLimits::default(),
        )
        .await
    }
}
