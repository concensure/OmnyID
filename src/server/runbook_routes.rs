//! Owner-authenticated definition management. This flag never starts execution.
use super::*;
use crate::runbook_contract::RunbookDefinition;
use crate::runbook_starter_pack::{STARTER_PACK_VERSION, starter_definitions};
use crate::runbook_store::RunbookStore;
use axum::http::{HeaderValue, header};
use chrono::Utc;
use serde::Deserialize;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/runbooks", get(list))
        .route("/runbooks/starters", get(starters))
        .route("/runbooks/setup", post(setup))
        .route("/runbooks/{id}", get(detail))
        .route("/runbooks/instances/{id}/activity", get(activity))
        .route("/runbooks/instances/{id}/cancel", post(cancel))
        .route("/runbooks/instances/{id}/answers", post(answer))
        .route("/runbooks/{id}/definition", put(save))
        .route("/runbooks/{id}/export", get(export))
        .route("/runbooks/{id}/upgrade-preview", get(upgrade_preview))
        .layer(axum::extract::DefaultBodyLimit::max(40 * 1024))
        .layer(axum::middleware::from_fn(no_cache))
}

async fn no_cache(
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

type ApiError = (StatusCode, String);

async fn owner(state: &AppState, headers: &HeaderMap) -> Result<String, ApiError> {
    if std::env::var("OMNYID_RUNBOOK_MANAGEMENT_ENABLED").as_deref() != Ok("true") {
        return Err((StatusCode::NOT_FOUND, "not_found".into()));
    }
    enforce_rate_limit(
        state,
        authenticated_rate_limit_key("runbook_management", headers),
        RateLimitPolicy {
            max_requests: 60,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    Ok(authenticated_user(&state.db, headers).await?.id)
}

fn store(state: &AppState) -> Result<RunbookStore<'_>, ApiError> {
    let key = |name| {
        super::env_hex_32(name).ok().flatten().ok_or((
            StatusCode::SERVICE_UNAVAILABLE,
            "runbook_keys_unavailable".into(),
        ))
    };
    Ok(RunbookStore::new(
        &state.db,
        key("OMNYID_ENCRYPTION_KEY_HEX")?,
        key("OMNYID_SIGNING_KEY_HEX")?,
    ))
}

fn error(code: &'static str) -> ApiError {
    let status = match code {
        "stale_definition" | "definition_exists" | "invalid_successor" | "stale_revision"
        | "question_not_open" | "answer_expired" | "invalid_transition" => StatusCode::CONFLICT,
        "definition_not_found"
        | "owner_not_found"
        | "instance_not_found"
        | "question_not_found" => StatusCode::NOT_FOUND,
        "storage_unavailable"
        | "invalid_stored_definition"
        | "definition_decryption_failed"
        | "unencrypted_definition"
        | "registry_history_limit" => StatusCode::SERVICE_UNAVAILABLE,
        _ => StatusCode::UNPROCESSABLE_ENTITY,
    };
    (status, code.into())
}

async fn detail(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let owner = owner(&state, &headers).await?;
    let registry = store(&state)?.registry(&owner).await.map_err(error)?;
    let summaries = summaries(&registry);
    let result = summaries
        .as_array()
        .and_then(|items| items.iter().find(|d| d["runbook_id"] == id))
        .cloned()
        .ok_or_else(|| error("definition_not_found"))?;
    Ok(Json(
        json!({"definition":result,"execution_available":false}),
    ))
}

async fn activity(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let owner = owner(&state, &headers).await?;
    let store = store(&state)?;
    Ok(Json(
        crate::runbook_runtime::RunbookRuntime::new(&store)
            .activity(&owner, &id)
            .await
            .map_err(error)?,
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Revision {
    expected_revision: u32,
}
async fn cancel(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<Revision>,
) -> Result<Json<Value>, ApiError> {
    let owner = owner(&state, &headers).await?;
    let store = store(&state)?;
    let result = crate::runbook_runtime::RunbookRuntime::new(&store)
        .cancel(&owner, &id, request.expected_revision)
        .await
        .map_err(error)?;
    Ok(Json(
        json!({"instance_id":id,"revision":result.instance.revision,"status":result.instance.status}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Answer {
    expected_revision: u32,
    input: crate::runbook_input::InputSupplied,
}
async fn answer(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<Answer>,
) -> Result<Json<Value>, ApiError> {
    let owner = owner(&state, &headers).await?;
    if request.input.instance_id != id {
        return Err(error("instance_id_mismatch"));
    }
    let store = store(&state)?;
    let result = crate::runbook_runtime::RunbookRuntime::new(&store)
        .supply_input(&owner, &request.input, request.expected_revision)
        .await
        .map_err(error)?;
    Ok(Json(
        json!({"instance_id":id,"revision":result.instance.revision,"status":result.instance.status}),
    ))
}

fn summaries(registry: &crate::runbook_registry::Registry) -> Value {
    Value::Array(
        registry
            .definitions()
            .map(|record| {
                let d = &record.definition;
                json!({"runbook_id":d.runbook_id,"name":d.name,"version":d.version,
            "message_id":record.message_id,"enabled":d.enabled,"status":d.status,
            "trigger_types":d.trigger.event_types,"max_autonomy":d.max_autonomy})
            })
            .collect(),
    )
}

async fn list(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let owner = owner(&state, &headers).await?;
    Ok(Json(
        json!({"definitions":summaries(&store(&state)?.registry(&owner).await.map_err(error)?),"execution_available":false}),
    ))
}

async fn starters(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    owner(&state, &headers).await?;
    Ok(Json(
        json!({"starter_pack_version":STARTER_PACK_VERSION,"starters":starter_definitions().iter().map(|d|
        json!({"runbook_id":d.runbook_id,"name":d.name,"trigger_types":d.trigger.event_types,"enabled":false}))
        .collect::<Vec<_>>()}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Setup {
    selected: Vec<String>,
}

async fn setup(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<Setup>,
) -> Result<Json<Value>, ApiError> {
    let owner = owner(&state, &headers).await?;
    let registry = store(&state)?
        .seed(&owner, &request.selected)
        .await
        .map_err(error)?;
    Ok(Json(json!({"definitions":summaries(&registry)})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Save {
    expected_parent: Option<String>,
    definition: RunbookDefinition,
}

async fn save(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<Save>,
) -> Result<Json<Value>, ApiError> {
    let owner = owner(&state, &headers).await?;
    if request.definition.runbook_id != id {
        return Err(error("definition_id_mismatch"));
    }
    let message = store(&state)?
        .save(
            &owner,
            request.expected_parent.as_deref(),
            request.definition,
        )
        .await
        .map_err(error)?;
    Ok(Json(
        json!({"message_id":message["id"],"version":message["content"]["version"]}),
    ))
}

async fn export(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let owner = owner(&state, &headers).await?;
    let registry = store(&state)?.registry(&owner).await.map_err(error)?;
    let record = registry
        .get(&id)
        .ok_or_else(|| error("definition_not_found"))?;
    Ok(Json(
        json!({"message_id":record.message_id,"definition":record.definition}),
    ))
}

async fn upgrade_preview(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let owner = owner(&state, &headers).await?;
    let registry = store(&state)?.registry(&owner).await.map_err(error)?;
    let current = registry
        .get(&id)
        .ok_or_else(|| error("definition_not_found"))?;
    let mut proposed = starter_definitions()
        .into_iter()
        .find(|d| d.runbook_id == id)
        .ok_or_else(|| error("unknown_starter"))?;
    proposed.enabled = current.definition.enabled;
    let preview = registry
        .successor(&id, &current.message_id, proposed, Utc::now())
        .map_err(error)?;
    Ok(Json(
        json!({"starter_pack_version":STARTER_PACK_VERSION,"expected_parent":current.message_id,
        "current":current.definition,"proposed":preview["content"],"applied":false}),
    ))
}
