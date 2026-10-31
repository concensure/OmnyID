use super::*;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/wedding/boundaries/private-notes",
            get(read_note).post(save_note),
        )
        .route(
            "/wedding/boundaries/private-notes/remove",
            post(remove_note),
        )
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct NoteQuery {
    wedding_plan_id: String,
    response_workspace_id: String,
    person_id: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct SaveNoteRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    person_id: String,
    ciphertext: String,
    expected_version: Option<i64>,
    idempotency_key: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct RemoveNoteRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    person_id: String,
    expected_version: i64,
    idempotency_key: String,
}

fn valid_scope(plan: &str, workspace: &str, person_id: &str) -> bool {
    valid_id(plan) && valid_id(workspace) && valid_id(person_id)
}

fn valid_ciphertext(value: &str) -> bool {
    value.starts_with("encrypted:v1:")
        && value.len() > "encrypted:v1:".len()
        && value.len() <= 32 * 1024
        && !value.chars().any(char::is_control)
}

async fn guest_exists(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
) -> Result<bool, (StatusCode, String)> {
    let query = format!(
        "SELECT EXISTS(SELECT 1 FROM {table} m WHERE m.kind='wedding_boundary_guest_profile' AND m.content->>'person_id'=$1 AND COALESCE(m.content->>'status','active')<>'archived' AND {})",
        metadata_scope("m", 2, 3)
    );
    sqlx::query_scalar(&query)
        .bind(person_id)
        .bind(plan)
        .bind(workspace)
        .fetch_one(&mut **tx)
        .await
        .map_err(store_error)
}

async fn read_note(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<NoteQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let owner = authenticated_user(&state.db, &headers).await?;
    if !valid_scope(
        &query.wedding_plan_id,
        &query.response_workspace_id,
        &query.person_id,
    ) {
        return Err(bad("Choose a guest from this wedding."));
    }
    let row = sqlx::query("SELECT ciphertext,version,updated_at::text FROM wedding_boundary_private_notes WHERE owner_user_id=$1 AND wedding_plan_id=$2 AND response_workspace_id=$3 AND person_id=$4")
        .bind(&owner.id).bind(&query.wedding_plan_id).bind(&query.response_workspace_id).bind(&query.person_id)
        .fetch_optional(&state.db.pool).await.map_err(store_error)?;
    Ok(Json(match row {
        Some(row) => json!({
            "person_id": query.person_id,
            "ciphertext": row.get::<String, _>("ciphertext"),
            "version": row.get::<i64, _>("version"),
            "updated_at": row.get::<String, _>("updated_at")
        }),
        None => json!({"person_id": query.person_id, "ciphertext": null, "version": 0}),
    }))
}

async fn save_note(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SaveNoteRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_boundary_private_note", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let owner = authenticated_user(&state.db, &headers).await?;
    if !valid_scope(
        &request.wedding_plan_id,
        &request.response_workspace_id,
        &request.person_id,
    ) || !valid_ciphertext(&request.ciphertext)
        || !valid_id(&request.idempotency_key)
        || request.expected_version.is_some_and(|value| value < 1)
    {
        return Err(bad("Encrypt the private note before saving it."));
    }
    state
        .db
        .ensure_user_private_schema(&owner.id)
        .await
        .map_err(store_error)?;
    let table = tenant_table(&owner.id);
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    let request_value = serde_json::to_value(&request).map_err(|_| bad("Invalid private note."))?;
    let request_fingerprint = fingerprint(&request_value);
    if let Some(response) = replay_or_reserve(
        &mut tx,
        &owner.id,
        &request.idempotency_key,
        "boundary_private_note_save",
        &request_fingerprint,
    )
    .await?
    {
        tx.commit().await.map_err(store_error)?;
        return Ok(Json(response));
    }
    if !guest_exists(
        &mut tx,
        &table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        &request.person_id,
    )
    .await?
    {
        return Err((
            StatusCode::FORBIDDEN,
            "That guest is outside this wedding.".into(),
        ));
    }
    let existing = sqlx::query_scalar::<_, i64>("SELECT version FROM wedding_boundary_private_notes WHERE owner_user_id=$1 AND wedding_plan_id=$2 AND response_workspace_id=$3 AND person_id=$4 FOR UPDATE")
        .bind(&owner.id).bind(&request.wedding_plan_id).bind(&request.response_workspace_id).bind(&request.person_id)
        .fetch_optional(&mut *tx).await.map_err(store_error)?;
    if existing != request.expected_version {
        return Err(conflict(
            "This private note changed. Reload it before saving your edit.",
        ));
    }
    let version = existing.unwrap_or(0) + 1;
    sqlx::query("INSERT INTO wedding_boundary_private_notes (owner_user_id,wedding_plan_id,response_workspace_id,person_id,ciphertext,version) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_user_id,wedding_plan_id,response_workspace_id,person_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,version=EXCLUDED.version,updated_at=NOW()")
        .bind(&owner.id).bind(&request.wedding_plan_id).bind(&request.response_workspace_id).bind(&request.person_id).bind(&request.ciphertext).bind(version)
        .execute(&mut *tx).await.map_err(store_error)?;
    let note_ref = format!(
        "wedding-boundary-private-note:{}:{}",
        request.person_id, version
    );
    append_event(
        &mut tx,
        &table,
        &format!("boundary-private-note-{}", Ulid::new()),
        "wedding_boundary_private_note_reference",
        &request.wedding_plan_id,
        &request.response_workspace_id,
        json!({
            "note_ref": note_ref,
            "person_id": request.person_id,
            "version": version,
            "operation": "saved",
            "ciphertext_copied": false,
            "visibility": "couple_only"
        }),
    )
    .await?;
    let response = json!({
        "person_id": request.person_id,
        "version": version,
        "note_ref": note_ref,
        "replayed": false
    });
    finish_receipt(&mut tx, &owner.id, &request.idempotency_key, &response).await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(response))
}

async fn remove_note(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RemoveNoteRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let owner = authenticated_user(&state.db, &headers).await?;
    if !valid_scope(
        &request.wedding_plan_id,
        &request.response_workspace_id,
        &request.person_id,
    ) || request.expected_version < 1
        || !valid_id(&request.idempotency_key)
    {
        return Err(bad("Choose the current private note before removing it."));
    }
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    let request_value = serde_json::to_value(&request).map_err(|_| bad("Invalid private note."))?;
    let request_fingerprint = fingerprint(&request_value);
    if let Some(response) = replay_or_reserve(
        &mut tx,
        &owner.id,
        &request.idempotency_key,
        "boundary_private_note_remove",
        &request_fingerprint,
    )
    .await?
    {
        tx.commit().await.map_err(store_error)?;
        return Ok(Json(response));
    }
    let removed = sqlx::query("DELETE FROM wedding_boundary_private_notes WHERE owner_user_id=$1 AND wedding_plan_id=$2 AND response_workspace_id=$3 AND person_id=$4 AND version=$5")
        .bind(&owner.id).bind(&request.wedding_plan_id).bind(&request.response_workspace_id).bind(&request.person_id).bind(request.expected_version)
        .execute(&mut *tx).await.map_err(store_error)?.rows_affected();
    if removed != 1 {
        return Err(conflict(
            "This private note changed. Reload it before removing it.",
        ));
    }
    let table = tenant_table(&owner.id);
    append_event(
        &mut tx,
        &table,
        &format!("boundary-private-note-removed-{}", Ulid::new()),
        "wedding_boundary_private_note_reference",
        &request.wedding_plan_id,
        &request.response_workspace_id,
        json!({
            "person_id": request.person_id,
            "removed_version": request.expected_version,
            "operation": "removed",
            "ciphertext_copied": false,
            "visibility": "couple_only"
        }),
    )
    .await?;
    let response = json!({"person_id": request.person_id, "removed": true, "replayed": false});
    finish_receipt(&mut tx, &owner.id, &request.idempotency_key, &response).await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(response))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_notes_must_be_opaque_envelopes() {
        assert!(valid_ciphertext("encrypted:v1:opaque-envelope"));
        assert!(!valid_ciphertext("Guest has a medical condition"));
        assert!(!valid_ciphertext("encrypted:v1:"));
    }
}
