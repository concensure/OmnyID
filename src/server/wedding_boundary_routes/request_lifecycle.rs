use super::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TransitionRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    request_id: String,
    operation: String,
    expected_revision: i64,
    idempotency_key: String,
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/wedding/boundaries/requests/transitions",
        post(transition_request),
    )
}

fn transition_allowed(operation: &str, status: Option<&str>) -> bool {
    match operation {
        "submit" => status == Some("draft"),
        "withdraw" => matches!(status, Some("draft" | "pending" | "partially_approved")),
        _ => false,
    }
}

async fn has_current_blocking_policy(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    request: &Value,
) -> Result<bool, (StatusCode, String)> {
    let query = format!(
        "SELECT DISTINCT ON (COALESCE(m.content->>'boundary_object_id',m.content->>'id')) m.content FROM {table} m WHERE m.kind='wedding_boundary_policy' AND {} ORDER BY COALESCE(m.content->>'boundary_object_id',m.content->>'id'),COALESCE((m.content->>'version')::bigint,1) DESC,m.timestamp DESC,m.id DESC",
        metadata_scope("m", 1, 2)
    );
    let policies = sqlx::query_scalar::<_, Value>(&query)
        .bind(plan)
        .bind(workspace)
        .fetch_all(&mut **tx)
        .await
        .map_err(store_error)?;
    let change_type = request
        .get("change_type")
        .and_then(Value::as_str)
        .unwrap_or("");
    Ok(policies.iter().any(|policy| {
        let active = policy
            .get("rule_status")
            .or_else(|| policy.get("status"))
            .and_then(Value::as_str)
            .unwrap_or("active")
            == "active";
        let blocking = policy.get("enforcement").and_then(Value::as_str) == Some("block")
            || policy.get("effect").and_then(Value::as_str) == Some("block");
        active
            && blocking
            && policy_matches_change(
                policy
                    .get("rule_type")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
                change_type,
            )
    }))
}

fn policy_matches_change(rule_type: &str, change_type: &str) -> bool {
    match rule_type {
        "plus_one" => change_type == "plus_one_change",
        "children" | "invitation_scope" => {
            matches!(change_type, "add_guest" | "event_invite_change")
        }
        "access" => matches!(change_type, "guest_note_change" | "guest_contact_update"),
        "allocation" | "deadline" | "visibility" | "seating" | "communication" => {
            change_type == "household_change"
        }
        _ => false,
    }
}

async fn transition_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<TransitionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_boundary_request_transition", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&request.wedding_plan_id)
        || !valid_id(&request.response_workspace_id)
        || !valid_id(&request.request_id)
        || !valid_id(&request.idempotency_key)
        || !matches!(request.operation.as_str(), "submit" | "withdraw")
        || request.expected_revision < 1
    {
        return Err(bad("Choose a valid current family request action."));
    }
    state
        .db
        .ensure_user_private_schema(&user.id)
        .await
        .map_err(store_error)?;
    let table = tenant_table(&user.id);
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(format!("{}:{}", user.id, request.request_id))
        .execute(&mut *tx)
        .await
        .map_err(store_error)?;
    let request_fingerprint = fingerprint(&json!({
        "plan": request.wedding_plan_id,
        "workspace": request.response_workspace_id,
        "request": request.request_id,
        "operation": request.operation,
        "expected_revision": request.expected_revision,
    }));
    if let Some(response) = replay_or_reserve(
        &mut tx,
        &user.id,
        &request.idempotency_key,
        "request_transition",
        &request_fingerprint,
    )
    .await?
    {
        tx.commit().await.map_err(store_error)?;
        return Ok(Json(response));
    }
    let query = format!(
        "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_change_request' AND m.content->>'request_id'=$1 AND {} ORDER BY COALESCE((m.content->>'revision')::bigint,1) DESC,m.timestamp DESC,m.id DESC LIMIT 1 FOR UPDATE",
        metadata_scope("m", 2, 3)
    );
    let current = sqlx::query_scalar::<_, Value>(&query)
        .bind(&request.request_id)
        .bind(&request.wedding_plan_id)
        .bind(&request.response_workspace_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(store_error)?
        .ok_or((
            StatusCode::FORBIDDEN,
            "That family request is not part of this wedding.".into(),
        ))?;
    let revision = current.get("revision").and_then(Value::as_i64).unwrap_or(1);
    if revision != request.expected_revision {
        return Err(conflict(
            "This request changed on another screen. Refresh before continuing.",
        ));
    }
    let current_status = current.get("request_status").and_then(Value::as_str);
    if !transition_allowed(&request.operation, current_status) {
        return Err(conflict(
            "This family request cannot make that transition now.",
        ));
    }
    let status = if request.operation == "withdraw" {
        "withdrawn"
    } else if request_expired(&current, Utc::now()) {
        "expired"
    } else {
        validate_policy_versions(
            &mut tx,
            &table,
            &request.wedding_plan_id,
            &request.response_workspace_id,
            &current,
        )
        .await?;
        if has_current_blocking_policy(
            &mut tx,
            &table,
            &request.wedding_plan_id,
            &request.response_workspace_id,
            &current,
        )
        .await?
        {
            "auto_blocked"
        } else {
            "pending"
        }
    };
    let mut updated = current.clone();
    if let Some(object) = updated.as_object_mut() {
        object.insert("request_status".into(), json!(status));
        object.insert("status".into(), json!(status));
        object.insert("approval_required".into(), json!(status == "pending"));
        object.insert("approval_gate_recorded".into(), json!(status == "pending"));
        object.insert("revision".into(), json!(revision + 1));
    }
    append_event(
        &mut tx,
        &table,
        &format!("request-transition-{}", Ulid::new()),
        "wedding_boundary_change_request",
        &request.wedding_plan_id,
        &request.response_workspace_id,
        updated,
    )
    .await?;
    let lifecycle_id = format!("wedding-boundary-lifecycle-{}", Ulid::new());
    append_event(
        &mut tx,
        &table,
        &lifecycle_id,
        "wedding_boundary_request_lifecycle",
        &request.wedding_plan_id,
        &request.response_workspace_id,
        json!({
            "lifecycle_id": lifecycle_id,
            "request_id": request.request_id,
            "operation": request.operation,
            "from_status": current_status,
            "status": status,
            "expected_request_revision": revision,
            "actor": "couple",
            "connected_mutation_applied": false,
            "invitation_sent": false,
            "attendance_inferred": false,
            "private_content_copied": false,
        }),
    )
    .await?;
    let explanation = match status {
        "pending" => "Request submitted for couple review. Nothing changed on the guest list.",
        "auto_blocked" => {
            "A current guest rule blocks this request. Nothing changed on the guest list."
        }
        "expired" => {
            "The request deadline passed before submission. Nothing changed on the guest list."
        }
        _ => "Request withdrawn. Nothing changed on the guest list.",
    };
    let response = json!({
        "request_id": request.request_id,
        "status": status,
        "revision": revision + 1,
        "replayed": false,
        "explanation": explanation,
        "connected_updates": [],
    });
    finish_receipt(&mut tx, &user.id, &request.idempotency_key, &response).await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(response))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifecycle_only_allows_reviewable_transitions() {
        assert!(transition_allowed("submit", Some("draft")));
        assert!(!transition_allowed("submit", Some("pending")));
        assert!(transition_allowed("withdraw", Some("draft")));
        assert!(transition_allowed("withdraw", Some("pending")));
        assert!(transition_allowed("withdraw", Some("partially_approved")));
        for status in [
            "approved",
            "declined",
            "withdrawn",
            "expired",
            "auto_blocked",
        ] {
            assert!(!transition_allowed("submit", Some(status)));
            assert!(!transition_allowed("withdraw", Some(status)));
        }
    }

    #[test]
    fn policy_matching_is_type_aware() {
        assert!(policy_matches_change("plus_one", "plus_one_change"));
        assert!(policy_matches_change("children", "add_guest"));
        assert!(policy_matches_change(
            "invitation_scope",
            "event_invite_change"
        ));
        assert!(policy_matches_change("access", "guest_contact_update"));
        assert!(!policy_matches_change("plus_one", "add_guest"));
        assert!(!policy_matches_change("unknown", "household_change"));
    }
}
