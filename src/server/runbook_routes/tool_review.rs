//! Human tool review only. These routes never call a provider.
use super::*;
use crate::runbook_runtime::RunbookRuntime;
use crate::runbook_tool_runtime::ToolRequest;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/runbooks/instances/{id}/tools", post(propose))
        .route("/runbooks/instances/{id}/tools/{proposal}", get(detail))
        .route(
            "/runbooks/instances/{id}/tools/{proposal}/decision",
            post(decide),
        )
}

pub(super) fn enabled() -> bool {
    std::env::var("OMNYID_RUNBOOK_TOOL_REVIEW_ENABLED").as_deref() == Ok("true")
}

async fn actor(state: &AppState, headers: &HeaderMap) -> Result<String, ApiError> {
    if !enabled() {
        return Err((StatusCode::NOT_FOUND, "not_found".into()));
    }
    owner(state, headers).await
}

fn tool_error(code: &'static str) -> ApiError {
    match code {
        "tool_proposal_missing" | "tool_proposal_mismatch" => {
            (StatusCode::NOT_FOUND, "tool_proposal_not_found".into())
        }
        "tool_proposal_conflict"
        | "tool_decision_conflict"
        | "tool_not_pending"
        | "tool_proposal_expired"
        | "tool_preparation_stale"
        | "step_not_current" => (StatusCode::CONFLICT, code.into()),
        _ => error(code),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProposalRequest {
    step_id: String,
    expected_revision: u32,
    request: ToolRequest,
}
async fn propose(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<ProposalRequest>,
) -> Result<Json<Value>, ApiError> {
    let owner = actor(&state, &headers).await?;
    let store = store(&state)?;
    let proposal = RunbookRuntime::new(&store)
        .propose_tool(
            &owner,
            &id,
            &request.step_id,
            request.expected_revision,
            &request.request,
        )
        .await
        .map_err(tool_error)?;
    Ok(Json(
        json!({"proposal":proposal,"execution_available":false}),
    ))
}
async fn detail(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((id, proposal)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let owner = actor(&state, &headers).await?;
    let store = store(&state)?;
    let proposal = RunbookRuntime::new(&store)
        .tool_proposal(&owner, &id, &proposal)
        .await
        .map_err(tool_error)?;
    Ok(Json(
        json!({"proposal":proposal,"execution_available":false}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DecisionRequest {
    expected_revision: u32,
    approved: bool,
}
async fn decide(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((id, proposal)): Path<(String, String)>,
    Json(request): Json<DecisionRequest>,
) -> Result<Json<Value>, ApiError> {
    let owner = actor(&state, &headers).await?;
    if request.approved {
        let (user, session) = authenticated_user_and_session(&state.db, &headers).await?;
        if user.id != owner {
            return Err((StatusCode::UNAUTHORIZED, "invalid_session".into()));
        }
        require_recent_high_risk_session(&session)?;
    }
    let store = store(&state)?;
    let decision = RunbookRuntime::new(&store)
        .decide_tool(
            &owner,
            &id,
            &proposal,
            request.expected_revision,
            request.approved,
        )
        .await
        .map_err(tool_error)?;
    Ok(Json(
        json!({"decision":decision,"execution_available":false}),
    ))
}
