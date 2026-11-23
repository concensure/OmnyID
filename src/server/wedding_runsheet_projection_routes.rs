use super::{
    AppState, RateLimitPolicy, auth::authenticated_user, authenticated_rate_limit_key,
    enforce_rate_limit, wedding_scope::resolve_wedding_scope,
};
use crate::db::{
    WeddingRunSheetProjectionBatch, WeddingRunSheetProjectionState,
    WeddingRunSheetProjectionStoreError, WeddingRunSheetProjectionWrite,
};
use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeSet, sync::Arc, time::Duration};

const PROJECTOR_ID: &str = "wedding-runsheet";
const PROFILE_ID: &str = "wedding_runsheet.v1";
const MAX_WRITES: usize = 200;
const MAX_SOURCE_REFS: usize = 500;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/database/wedding-runsheet/projection",
            get(load_projection_http),
        )
        .route(
            "/database/wedding-runsheet/projection",
            post(commit_projection_http),
        )
        .route(
            "/database/wedding-runsheet/install",
            post(install_projection_http),
        )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProjectionQuery {
    database_id: String,
    wedding_plan_id: String,
    response_workspace_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProjectionInstallRequest {
    database_id: String,
    wedding_plan_id: String,
    response_workspace_id: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct SourceReference {
    message_id: String,
    kind: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ProjectionRecord {
    kind: String,
    contract_version: i32,
    database_id: String,
    record_id: String,
    revision: i64,
    table: String,
    data: Value,
    source_refs: Vec<SourceReference>,
    idempotency_key: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ProjectionRevision {
    kind: String,
    contract_version: i32,
    database_id: String,
    target_record_id: String,
    base_revision: i64,
    revision: i64,
    table: String,
    patch: Value,
    operation: String,
    source_refs: Vec<SourceReference>,
    idempotency_key: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ProjectionReceipt {
    kind: String,
    contract_version: i32,
    database_id: String,
    projector_id: String,
    projector_version: i32,
    source_cursor: String,
    source_fingerprint: String,
    affected_record_ids: Vec<String>,
    idempotency_key: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ProjectionCheckpoint {
    source_cursor: String,
    projector_version: i32,
    source_fingerprint: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProjectionRequest {
    database_id: String,
    wedding_plan_id: String,
    response_workspace_id: String,
    profile_id: String,
    expected_checkpoint: Option<ProjectionCheckpoint>,
    next_checkpoint: ProjectionCheckpoint,
    records: Vec<ProjectionRecord>,
    revisions: Vec<ProjectionRevision>,
    receipt: ProjectionReceipt,
    explanation: String,
    model_calls: i32,
}

#[derive(Serialize)]
struct ProjectionResponse {
    commit: crate::db::WeddingRunSheetProjectionCommit,
    state: WeddingRunSheetProjectionState,
    explanation: String,
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_:./-".contains(character))
}

fn valid_source_ref(reference: &SourceReference) -> bool {
    valid_id(reference.message_id.as_str())
        && !reference.kind.trim().is_empty()
        && reference.kind.len() <= 120
        && !reference.kind.chars().any(char::is_control)
}

fn bad_request(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}

fn validate_request(request: &ProjectionRequest) -> Result<(), (StatusCode, String)> {
    if request.profile_id != PROFILE_ID
        || request.receipt.projector_id != PROJECTOR_ID
        || request.model_calls != 0
        || !valid_id(&request.database_id)
        || !valid_id(&request.wedding_plan_id)
        || !valid_id(&request.response_workspace_id)
        || request.explanation.trim().is_empty()
        || request.explanation.len() > 500
    {
        return Err(bad_request("Invalid wedding run-sheet projection."));
    }
    let write_count = request.records.len() + request.revisions.len();
    if write_count == 0 || write_count > MAX_WRITES {
        return Err(bad_request(
            "A projection must contain between 1 and 200 row changes.",
        ));
    }
    if request.receipt.kind != "database_projection_receipt"
        || request.receipt.contract_version != 1
        || request.receipt.database_id != request.database_id
        || request.receipt.projector_version != request.next_checkpoint.projector_version
        || request.receipt.source_cursor != request.next_checkpoint.source_cursor
        || request.receipt.source_fingerprint != request.next_checkpoint.source_fingerprint
        || request.receipt.projector_version <= 0
        || !valid_id(&request.receipt.idempotency_key)
    {
        return Err(bad_request(
            "The projection receipt does not match its checkpoint.",
        ));
    }
    let mut affected = BTreeSet::new();
    let mut idempotency_keys = BTreeSet::new();
    let mut source_ids = BTreeSet::new();
    for record in &request.records {
        if record.kind != "database_record"
            || record.contract_version != 1
            || record.database_id != request.database_id
            || record.revision != 1
            || record.table != "run_sheet"
            || !record.data.is_object()
            || !valid_id(&record.record_id)
            || !valid_id(&record.idempotency_key)
            || record.data.get("projection_state").and_then(Value::as_str) != Some("projected")
            || record.data.get("runsheet_item_id").and_then(Value::as_str)
                != Some(record.record_id.as_str())
            || record.source_refs.is_empty()
            || record
                .source_refs
                .iter()
                .any(|reference| !valid_source_ref(reference))
        {
            return Err(bad_request("A projected run-sheet row is invalid."));
        }
        affected.insert(record.record_id.clone());
        if !idempotency_keys.insert(record.idempotency_key.clone()) {
            return Err(bad_request("Duplicate projection write."));
        }
        source_ids.extend(
            record
                .source_refs
                .iter()
                .map(|reference| reference.message_id.clone()),
        );
    }
    for revision in &request.revisions {
        if revision.kind != "database_record_update"
            || revision.contract_version != 1
            || revision.database_id != request.database_id
            || revision.revision != revision.base_revision + 1
            || revision.base_revision <= 0
            || revision.table != "run_sheet"
            || !revision.patch.is_object()
            || revision.operation != "upsert"
            || !valid_id(&revision.target_record_id)
            || !valid_id(&revision.idempotency_key)
            || revision
                .source_refs
                .iter()
                .any(|reference| !valid_source_ref(reference))
        {
            return Err(bad_request("A projected run-sheet revision is invalid."));
        }
        affected.insert(revision.target_record_id.clone());
        if !idempotency_keys.insert(revision.idempotency_key.clone()) {
            return Err(bad_request("Duplicate projection write."));
        }
        source_ids.extend(
            revision
                .source_refs
                .iter()
                .map(|reference| reference.message_id.clone()),
        );
    }
    if source_ids.len() > MAX_SOURCE_REFS {
        return Err(bad_request("Too many projection sources."));
    }
    let receipt_ids = request
        .receipt
        .affected_record_ids
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    if affected != receipt_ids || request.receipt.affected_record_ids.len() != receipt_ids.len() {
        return Err(bad_request(
            "The projection receipt does not cover the changed rows.",
        ));
    }
    Ok(())
}

fn store_error(error: WeddingRunSheetProjectionStoreError) -> (StatusCode, String) {
    match error {
        WeddingRunSheetProjectionStoreError::Scope(message) => (StatusCode::FORBIDDEN, message),
        WeddingRunSheetProjectionStoreError::Conflict(message) => (StatusCode::CONFLICT, message),
        WeddingRunSheetProjectionStoreError::Sql(error) => {
            tracing::error!(%error, "Wedding run-sheet projection transaction failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "The run sheet could not be updated. Please try again.".into(),
            )
        }
    }
}

async fn install_projection_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ProjectionInstallRequest>,
) -> Result<Json<WeddingRunSheetProjectionState>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_runsheet_install", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&request.database_id)
        || !valid_id(&request.wedding_plan_id)
        || !valid_id(&request.response_workspace_id)
    {
        return Err(bad_request("Choose a valid wedding run sheet."));
    }
    let scope = resolve_wedding_scope(
        &state.db,
        &user.id,
        &request.wedding_plan_id,
        &request.response_workspace_id,
    )
    .await?;
    state
        .db
        .ensure_wedding_runsheet_projection_definition(
            &scope.owner_user_id,
            &request.database_id,
            &scope.wedding_plan_id,
            &scope.response_workspace_id,
        )
        .await
        .map_err(store_error)?;
    state
        .db
        .load_wedding_runsheet_projection_state(
            &scope.owner_user_id,
            &request.database_id,
            &scope.wedding_plan_id,
        )
        .await
        .map_err(|error| store_error(WeddingRunSheetProjectionStoreError::Sql(error)))?
        .map(Json)
        .ok_or_else(|| {
            (
                StatusCode::FORBIDDEN,
                "This wedding run sheet is not available in your account.".into(),
            )
        })
}

async fn load_projection_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<ProjectionQuery>,
) -> Result<Json<WeddingRunSheetProjectionState>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&query.database_id)
        || !valid_id(&query.wedding_plan_id)
        || !valid_id(&query.response_workspace_id)
    {
        return Err(bad_request("Choose a valid wedding run sheet."));
    }
    let scope = resolve_wedding_scope(
        &state.db,
        &user.id,
        &query.wedding_plan_id,
        &query.response_workspace_id,
    )
    .await?;
    state
        .db
        .load_wedding_runsheet_projection_state(
            &scope.owner_user_id,
            &query.database_id,
            &scope.wedding_plan_id,
        )
        .await
        .map_err(|error| {
            tracing::error!(%error, "Run-sheet projection load failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "The run sheet could not be loaded.".into(),
            )
        })?
        .map(Json)
        .ok_or_else(|| {
            (
                StatusCode::FORBIDDEN,
                "This wedding run sheet is not available in your account.".into(),
            )
        })
}

async fn commit_projection_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ProjectionRequest>,
) -> Result<Json<ProjectionResponse>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_runsheet_projection", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    validate_request(&request)?;
    let scope = resolve_wedding_scope(
        &state.db,
        &user.id,
        &request.wedding_plan_id,
        &request.response_workspace_id,
    )
    .await?;
    let expected = request.expected_checkpoint.as_ref();
    let mut writes = request
        .records
        .iter()
        .map(|record| WeddingRunSheetProjectionWrite {
            message_type: "database_record".into(),
            content: serde_json::to_value(record).expect("serializable record"),
            idempotency_key: record.idempotency_key.clone(),
            source_message_ids: record
                .source_refs
                .iter()
                .map(|reference| reference.message_id.clone())
                .collect(),
        })
        .collect::<Vec<_>>();
    writes.extend(request.revisions.iter().map(|revision| {
        WeddingRunSheetProjectionWrite {
            message_type: "note:ledger_update".into(),
            content: serde_json::to_value(revision).expect("serializable revision"),
            idempotency_key: revision.idempotency_key.clone(),
            source_message_ids: revision
                .source_refs
                .iter()
                .map(|reference| reference.message_id.clone())
                .collect(),
        }
    }));
    writes.push(WeddingRunSheetProjectionWrite {
        message_type: "database_projection_receipt".into(),
        content: serde_json::to_value(&request.receipt).expect("serializable receipt"),
        idempotency_key: request.receipt.idempotency_key.clone(),
        source_message_ids: vec![],
    });
    let batch = WeddingRunSheetProjectionBatch {
        database_id: request.database_id.clone(),
        wedding_plan_id: request.wedding_plan_id.clone(),
        projector_id: PROJECTOR_ID.into(),
        projector_version: request.next_checkpoint.projector_version,
        expected_source_cursor: expected.map(|checkpoint| checkpoint.source_cursor.clone()),
        expected_projector_version: expected.map(|checkpoint| checkpoint.projector_version),
        expected_source_fingerprint: expected
            .map(|checkpoint| checkpoint.source_fingerprint.clone()),
        source_cursor: request.next_checkpoint.source_cursor.clone(),
        source_fingerprint: request.next_checkpoint.source_fingerprint.clone(),
        idempotency_key: request.receipt.idempotency_key.clone(),
        affected_record_ids: request.receipt.affected_record_ids.clone(),
        writes,
    };
    let commit = state
        .db
        .commit_wedding_runsheet_projection(&scope.owner_user_id, batch)
        .await
        .map_err(store_error)?;
    let projection_state = state
        .db
        .load_wedding_runsheet_projection_state(
            &scope.owner_user_id,
            &request.database_id,
            &scope.wedding_plan_id,
        )
        .await
        .map_err(|error| store_error(WeddingRunSheetProjectionStoreError::Sql(error)))?
        .ok_or_else(|| {
            (
                StatusCode::FORBIDDEN,
                "This wedding run sheet is not available in your account.".into(),
            )
        })?;
    if !commit.replayed {
        for message_id in &commit.message_ids {
            state.metrics.inc_messages_stored();
            let _ = state.relay_tx.send(
                serde_json::json!({
                    "event": "message_stored", "message_id": message_id,
                    "thread_id": format!("db_{}_projection", request.database_id),
                    "type": "database_projection", "owner_user_id": scope.owner_user_id,
                    "actor_user_id": user.id,
                })
                .to_string(),
            );
        }
    }
    Ok(Json(ProjectionResponse {
        commit,
        state: projection_state,
        explanation: request.explanation,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn valid_request() -> ProjectionRequest {
        ProjectionRequest {
            database_id: "database:run-sheet".into(),
            wedding_plan_id: "plan-1".into(),
            response_workspace_id: "workspace-1".into(),
            profile_id: PROFILE_ID.into(),
            expected_checkpoint: None,
            next_checkpoint: ProjectionCheckpoint {
                source_cursor: "cursor-1".into(),
                projector_version: 1,
                source_fingerprint: "fnv1a-12345678".into(),
            },
            records: vec![ProjectionRecord {
                kind: "database_record".into(),
                contract_version: 1,
                database_id: "database:run-sheet".into(),
                record_id: "runsheet:task:one".into(),
                revision: 1,
                table: "run_sheet".into(),
                data: json!({"runsheet_item_id":"runsheet:task:one","projection_state":"projected"}),
                source_refs: vec![SourceReference {
                    message_id: "source-1".into(),
                    kind: "wedding_task".into(),
                }],
                idempotency_key: "create:one".into(),
            }],
            revisions: vec![],
            receipt: ProjectionReceipt {
                kind: "database_projection_receipt".into(),
                contract_version: 1,
                database_id: "database:run-sheet".into(),
                projector_id: PROJECTOR_ID.into(),
                projector_version: 1,
                source_cursor: "cursor-1".into(),
                source_fingerprint: "fnv1a-12345678".into(),
                affected_record_ids: vec!["runsheet:task:one".into()],
                idempotency_key: "receipt:one".into(),
            },
            explanation: "One run-sheet item was added.".into(),
            model_calls: 0,
        }
    }

    #[test]
    fn accepts_a_bounded_zero_model_projection() {
        assert!(validate_request(&valid_request()).is_ok());
    }

    #[test]
    fn rejects_receipt_drift_and_model_calls() {
        let mut request = valid_request();
        request.model_calls = 1;
        assert!(validate_request(&request).is_err());
        let mut request = valid_request();
        request.receipt.affected_record_ids = vec!["other".into()];
        assert!(validate_request(&request).is_err());
    }

    #[test]
    fn rejects_attempt_to_project_a_detached_row() {
        let mut request = valid_request();
        request.records[0].data["projection_state"] = json!("detached");
        assert!(validate_request(&request).is_err());
    }
}
