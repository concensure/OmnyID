//! Explicit, default-off execution for reviewed internal application cohorts.
use super::*;
use crate::{
    inference::runbook::OwnerRunbookModelProvider,
    mcp_client::bounded::destination::PinnedMcpTarget,
    runbook_execution_cohort::{ExecutionCohort, ExecutionKind},
    runbook_llm_step::{Effort, ModelPolicy},
    runbook_runtime::RunbookRuntime,
    secret_manager::{EnvSecretBackend, OracleVaultBackend, SecretBackend, VaultSecretBackend},
    tool_dispatch::runbook_provider::McpRunbookProvider,
};

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/runbooks/instances/{id}/steps/{step}/draft", post(draft))
        .route(
            "/runbooks/instances/{id}/tools/{proposal}/execute",
            post(tool),
        )
}

async fn admission(
    state: &AppState,
    headers: &HeaderMap,
    kind: ExecutionKind,
) -> Result<(String, ExecutionCohort), ApiError> {
    let policy =
        ExecutionCohort::from_env(kind).map_err(|_| (StatusCode::NOT_FOUND, "not_found".into()))?;
    let owner = owner(state, headers).await?;
    if !policy.admits_owner(&owner, Utc::now()) {
        return Err((StatusCode::FORBIDDEN, "execution_cohort_denied".into()));
    }
    Ok((owner, policy))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DraftRequest {
    expected_revision: u32,
}

async fn draft(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((id, step)): Path<(String, String)>,
    Json(request): Json<DraftRequest>,
) -> Result<Json<Value>, ApiError> {
    let (owner, cohort) = admission(&state, &headers, ExecutionKind::Draft).await?;
    let store = store(&state)?;
    let runtime = RunbookRuntime::new(&store).for_execution_cohort(cohort);
    let provider = OwnerRunbookModelProvider::with_shared_funding(&state.db, &owner, false)
        .map_err(|_| error("model_provider_unavailable"))?;
    let policy = ModelPolicy {
        effort: Effort::Medium,
        allow_escalation: false,
        minimum_confidence_bps: 8000,
        attempt_cost_ceiling: 75000,
        timeout_ms: 26000,
    };
    let receipt = runtime
        .execute_model(
            &owner,
            &id,
            &step,
            request.expected_revision,
            &policy,
            &provider,
        )
        .await
        .map_err(error)?;
    Ok(Json(
        json!({"receipt":receipt,"external_execution_authorized":false}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EmptyRequest {}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Destination {
    endpoint: String,
    addresses: Vec<std::net::Ipv4Addr>,
}

fn targets() -> Result<Vec<PinnedMcpTarget>, ApiError> {
    let denied = || {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "tool_destination_unavailable".into(),
        )
    };
    // Sandbox is an explicit literal endpoint; never a request-controlled local URL.
    if std::env::var("OMNYID_RUNBOOK_TOOL_SANDBOX_ENABLED").as_deref() == Ok("true") {
        if std::env::var("OMNYID_RUNBOOK_TOOL_DESTINATIONS").is_ok() {
            return Err(denied());
        }
        return Ok(vec![
            PinnedMcpTarget::loopback_sandbox("http://127.0.0.1:18380/mcp")
                .map_err(|_| denied())?,
        ]);
    }
    let text = std::env::var("OMNYID_RUNBOOK_TOOL_DESTINATIONS").map_err(|_| denied())?;
    if text.len() > 16384 {
        return Err(denied());
    }
    let destinations: Vec<Destination> = serde_json::from_str(&text).map_err(|_| denied())?;
    if destinations.is_empty() || destinations.len() > 32 {
        return Err(denied());
    }
    destinations
        .into_iter()
        .map(|d| PinnedMcpTarget::https(&d.endpoint, d.addresses).map_err(|_| denied()))
        .collect()
}

fn backend() -> Result<Box<dyn SecretBackend>, ApiError> {
    let denied = || {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "tool_credential_service_unavailable".into(),
        )
    };
    // Match the application's selected backend, but never fall back after an error.
    match std::env::var("OMNYID_SECRET_MANAGER_BACKEND")
        .unwrap_or_else(|_| "env".into())
        .as_str()
    {
        "env" => Ok(Box::new(EnvSecretBackend::new())),
        "vault" => Ok(Box::new(
            VaultSecretBackend::from_env().map_err(|_| denied())?,
        )),
        "oracle_vault" => Ok(Box::new(
            OracleVaultBackend::from_env().map_err(|_| denied())?,
        )),
        _ => Err(denied()),
    }
}

async fn tool(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((id, proposal)): Path<(String, String)>,
    Json(_): Json<EmptyRequest>,
) -> Result<Json<Value>, ApiError> {
    if !tool_review::enabled() {
        return Err((StatusCode::NOT_FOUND, "not_found".into()));
    }
    let (owner, cohort) = admission(&state, &headers, ExecutionKind::Tool).await?;
    let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
    if user.id != owner {
        return Err((StatusCode::UNAUTHORIZED, "invalid_session".into()));
    }
    require_recent_high_risk_session(&session)?;
    let backend = backend()?;
    let provider = McpRunbookProvider::from_secret_backend(&state.db, backend.as_ref(), targets()?)
        .await
        .map_err(error)?;
    let store = store(&state)?;
    let runtime = RunbookRuntime::new(&store).for_execution_cohort(cohort);
    let receipt = runtime
        .execute_tool(&owner, &id, &proposal, &provider)
        .await
        .map_err(error)?;
    Ok(Json(json!({"receipt":receipt})))
}
