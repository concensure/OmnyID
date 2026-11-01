use super::*;

const PLANNER_ACTIONS: [&str; 2] = ["view_scoped_summary", "propose_change"];
const RSVP_GUEST_ACTIONS: [&str; 2] = ["view_own_invitation", "propose_own_change"];
const PLANNER_CHANGES: [&str; 5] = [
    "add_guest",
    "remove_guest",
    "plus_one_change",
    "event_invite_change",
    "guest_contact_update",
];
const RSVP_GUEST_CHANGES: [&str; 3] = [
    "plus_one_change",
    "event_invite_change",
    "guest_contact_update",
];

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/wedding/boundaries/access/capabilities",
            get(access_capabilities),
        )
        .route(
            "/wedding/boundaries/delegates/grants",
            get(list_grants).post(create_grant),
        )
        .route(
            "/wedding/boundaries/delegates/grants/{grant_id}/revoke",
            post(revoke_grant),
        )
        .route(
            "/wedding/boundaries/delegates/grants/{grant_id}/open",
            get(open_grant),
        )
        .route(
            "/wedding/boundaries/delegates/grants/{grant_id}/propose",
            post(propose_change),
        )
}

#[derive(Debug, Serialize)]
struct BoundaryAccessCapabilities {
    helper_links_enabled: bool,
    authenticated_delegates_enabled: bool,
}

async fn access_capabilities(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<BoundaryAccessCapabilities>, (StatusCode, String)> {
    let owner = authenticated_user(&state.db, &headers).await?;
    Ok(Json(BoundaryAccessCapabilities {
        helper_links_enabled: helper_enabled(),
        authenticated_delegates_enabled: access_enabled(&owner.id),
    }))
}

fn access_enabled(owner_user_id: &str) -> bool {
    if std::env::var("OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED")
        .ok()
        .as_deref()
        != Some("true")
    {
        return false;
    }
    std::env::var("OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .any(|entry| !entry.is_empty() && entry == owner_user_id)
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateGrantRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    delegate_email: String,
    role: String,
    person_id: Option<String>,
    #[serde(default)]
    household_ids: Vec<String>,
    expires_at: String,
}

#[derive(Debug, Serialize)]
struct DelegatedGrantReply {
    grant_id: String,
    wedding_plan_id: String,
    response_workspace_id: String,
    role: String,
    person_id: Option<String>,
    household_ids: Vec<String>,
    allowed_actions: Vec<String>,
    expires_at: String,
    revoked_at: Option<String>,
}

fn reply_from_row(row: &sqlx::postgres::PgRow) -> DelegatedGrantReply {
    DelegatedGrantReply {
        grant_id: row.get("grant_id"),
        wedding_plan_id: row.get("wedding_plan_id"),
        response_workspace_id: row.get("response_workspace_id"),
        role: row.get("role"),
        person_id: row.get("person_id"),
        household_ids: serde_json::from_value(row.get("household_ids")).unwrap_or_default(),
        allowed_actions: serde_json::from_value(row.get("allowed_actions")).unwrap_or_default(),
        expires_at: row.get("expires_at"),
        revoked_at: row.get("revoked_at"),
    }
}

async fn latest_guest(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
) -> Result<Option<Value>, (StatusCode, String)> {
    let query = format!(
        "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_guest_profile' AND m.content->>'person_id'=$1 AND {} ORDER BY m.timestamp DESC,m.id DESC LIMIT 1",
        metadata_scope("m", 2, 3)
    );
    sqlx::query_scalar(&query)
        .bind(person_id)
        .bind(plan)
        .bind(workspace)
        .fetch_optional(&mut **tx)
        .await
        .map_err(store_error)
}

async fn latest_household_revision(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    household_id: &str,
) -> Result<i64, (StatusCode, String)> {
    let query = format!(
        "SELECT COALESCE((m.content->>'revision')::bigint,1) FROM {table} m WHERE m.kind='wedding_boundary_household' AND m.content->>'household_id'=$1 AND {} ORDER BY COALESCE((m.content->>'revision')::bigint,1) DESC,m.timestamp DESC,m.id DESC LIMIT 1",
        metadata_scope("m", 2, 3)
    );
    sqlx::query_scalar(&query)
        .bind(household_id)
        .bind(plan)
        .bind(workspace)
        .fetch_optional(&mut **tx)
        .await
        .map_err(store_error)?
        .ok_or_else(|| conflict("That household is no longer available."))
}

async fn invitation_exists(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
) -> Result<bool, (StatusCode, String)> {
    let query = format!(
        "SELECT EXISTS(SELECT 1 FROM {table} m WHERE m.kind='wedding_boundary_event_invitation' AND m.content->>'person_id'=$1 AND {})",
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

async fn create_grant(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateGrantRequest>,
) -> Result<Json<DelegatedGrantReply>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_boundary_delegate_grant", &headers),
        RateLimitPolicy {
            max_requests: 12,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let owner = authenticated_user(&state.db, &headers).await?;
    if !access_enabled(&owner.id) {
        return Err(unavailable());
    }
    let role = request.role.trim();
    let mut household_ids = request
        .household_ids
        .into_iter()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    household_ids.sort();
    if !valid_id(&request.wedding_plan_id)
        || !valid_id(&request.response_workspace_id)
        || !["planner", "rsvp_guest"].contains(&role)
        || request.delegate_email.trim().len() > 320
        || !request.delegate_email.contains('@')
        || household_ids.len() > 50
        || household_ids.iter().any(|value| !valid_id(value))
        || (role == "planner" && household_ids.is_empty())
        || request
            .person_id
            .as_deref()
            .is_some_and(|value| !valid_id(value))
    {
        return Err(bad(
            "Choose a registered delegate and a minimum-necessary scope.",
        ));
    }
    let expires_at = parse_expiry(&request.expires_at)?;
    state
        .db
        .ensure_user_private_schema(&owner.id)
        .await
        .map_err(store_error)?;
    let delegate_id = sqlx::query_scalar::<_, String>(
        "SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1",
    )
    .bind(request.delegate_email.trim())
    .fetch_optional(&state.db.pool)
    .await
    .map_err(store_error)?
    .filter(|value| value != &owner.id)
    .ok_or_else(|| bad("Ask the delegate to create an OmnyID account first."))?;
    let table = tenant_table(&owner.id);
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    let person_id = request.person_id;
    if role == "planner" {
        if !household_scope_exists(
            &mut tx,
            &table,
            &request.wedding_plan_id,
            &request.response_workspace_id,
            &household_ids,
        )
        .await?
        {
            return Err((
                StatusCode::FORBIDDEN,
                "Those households are not part of this wedding.".into(),
            ));
        }
    } else {
        let person = person_id
            .as_deref()
            .ok_or_else(|| bad("Choose the guest represented by this RSVP access."))?;
        let guest = latest_guest(
            &mut tx,
            &table,
            &request.wedding_plan_id,
            &request.response_workspace_id,
            person,
        )
        .await?
        .ok_or_else(|| bad("Choose a guest from this wedding."))?;
        if !invitation_exists(
            &mut tx,
            &table,
            &request.wedding_plan_id,
            &request.response_workspace_id,
            person,
        )
        .await?
        {
            return Err(bad(
                "Create this guest's invitation before delegating RSVP access.",
            ));
        }
        household_ids = guest
            .get("household_id")
            .and_then(Value::as_str)
            .filter(|value| valid_id(value))
            .map(|value| vec![value.to_string()])
            .unwrap_or_default();
    }
    let actions = if role == "planner" {
        PLANNER_ACTIONS.to_vec()
    } else {
        RSVP_GUEST_ACTIONS.to_vec()
    };
    let grant_id = format!("boundary-delegate-{}", Ulid::new());
    let row = sqlx::query("INSERT INTO wedding_boundary_delegated_grants (grant_id,owner_user_id,delegate_user_id,wedding_plan_id,response_workspace_id,role,person_id,household_ids,allowed_actions,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING grant_id,wedding_plan_id,response_workspace_id,role,person_id,household_ids,allowed_actions,expires_at::text,revoked_at::text")
        .bind(&grant_id).bind(&owner.id).bind(&delegate_id).bind(&request.wedding_plan_id)
        .bind(&request.response_workspace_id).bind(role).bind(&person_id).bind(json!(&household_ids))
        .bind(json!(&actions)).bind(expires_at).fetch_one(&mut *tx).await.map_err(store_error)?;
    append_event(
        &mut tx,
        &table,
        &format!("boundary-delegate-created-{}", Ulid::new()),
        "wedding_boundary_role_assignment",
        &request.wedding_plan_id,
        &request.response_workspace_id,
        json!({
            "boundary_object_id": grant_id,
            "grant_id": grant_id,
            "delegate_user_ref": format!("account:{delegate_id}"),
            "person_id": person_id,
            "role": role,
            "status": "active",
            "household_ids": household_ids,
            "can_view": actions,
            "private_notes_visible": false,
            "expires_at": expires_at.to_rfc3339()
        }),
    )
    .await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(reply_from_row(&row)))
}

#[derive(Deserialize)]
struct GrantQuery {
    response_workspace_id: String,
}

async fn list_grants(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<GrantQuery>,
) -> Result<Json<Vec<DelegatedGrantReply>>, (StatusCode, String)> {
    let owner = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&query.response_workspace_id) {
        return Err(bad("Choose a valid Wedding workspace."));
    }
    let rows = sqlx::query("SELECT grant_id,wedding_plan_id,response_workspace_id,role,person_id,household_ids,allowed_actions,expires_at::text,revoked_at::text FROM wedding_boundary_delegated_grants WHERE owner_user_id=$1 AND response_workspace_id=$2 ORDER BY created_at DESC")
        .bind(&owner.id).bind(&query.response_workspace_id).fetch_all(&state.db.pool).await.map_err(store_error)?;
    Ok(Json(rows.iter().map(reply_from_row).collect()))
}

async fn revoke_grant(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(grant_id): Path<String>,
) -> Result<Json<DelegatedGrantReply>, (StatusCode, String)> {
    let owner = authenticated_user(&state.db, &headers).await?;
    if !valid_id(&grant_id) {
        return Err(unavailable());
    }
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    let row = sqlx::query("UPDATE wedding_boundary_delegated_grants SET revoked_at=COALESCE(revoked_at,NOW()) WHERE grant_id=$1 AND owner_user_id=$2 RETURNING grant_id,wedding_plan_id,response_workspace_id,role,person_id,household_ids,allowed_actions,expires_at::text,revoked_at::text")
        .bind(&grant_id).bind(&owner.id).fetch_optional(&mut *tx).await.map_err(store_error)?.ok_or_else(unavailable)?;
    let reply = reply_from_row(&row);
    append_event(
        &mut tx,
        &tenant_table(&owner.id),
        &format!("boundary-delegate-revoked-{}", Ulid::new()),
        "wedding_boundary_permission_revoked",
        &reply.wedding_plan_id,
        &reply.response_workspace_id,
        json!({"grant_id": grant_id, "role": reply.role, "revoked_at": reply.revoked_at}),
    )
    .await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(reply))
}

#[derive(Debug)]
struct LiveGrant {
    grant_id: String,
    owner_user_id: String,
    plan: String,
    workspace: String,
    role: String,
    person_id: Option<String>,
    household_ids: Vec<String>,
}

async fn live_grant(
    state: &AppState,
    delegate_user_id: &str,
    grant_id: &str,
) -> Result<LiveGrant, (StatusCode, String)> {
    let row = sqlx::query("SELECT grant_id,owner_user_id,wedding_plan_id,response_workspace_id,role,person_id,household_ids FROM wedding_boundary_delegated_grants WHERE grant_id=$1 AND delegate_user_id=$2 AND revoked_at IS NULL AND expires_at>NOW()")
        .bind(grant_id).bind(delegate_user_id).fetch_optional(&state.db.pool).await.map_err(store_error)?.ok_or_else(unavailable)?;
    let owner_user_id: String = row.get("owner_user_id");
    if !access_enabled(&owner_user_id) {
        return Err(unavailable());
    }
    Ok(LiveGrant {
        grant_id: row.get("grant_id"),
        owner_user_id,
        plan: row.get("wedding_plan_id"),
        workspace: row.get("response_workspace_id"),
        role: row.get("role"),
        person_id: row.get("person_id"),
        household_ids: serde_json::from_value(row.get("household_ids")).unwrap_or_default(),
    })
}

fn rsvp_guest_projection(
    grant: &LiveGrant,
    person: &str,
    guest: &Value,
    invitation: &Value,
) -> Value {
    json!({
        "grant_id": grant.grant_id,
        "role": grant.role,
        "guest": {"person_id": person, "display_name": guest.get("display_name")},
        "invitation": {
            "invitation_id": invitation.get("invitation_id"),
            "event_id": invitation.get("event_id"),
            "invitation_status": invitation.get("invitation_status"),
            "plus_one_allowed": invitation.get("plus_one_allowed"),
            "children_invited": invitation.get("children_invited"),
            "response_revision": invitation.get("response_revision")
        },
        "private_notes_visible": false
    })
}

fn planner_household_projection(value: &Value) -> Value {
    json!({
        "household_id": value.get("household_id"),
        "display_name": value.get("display_name"),
        "invitation_allocation": value.get("invitation_allocation"),
        "request_deadline": value.get("request_deadline"),
        "request_window_status": value.get("request_window_status"),
        "revision": value.get("revision")
    })
}

async fn open_grant(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(grant_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let delegate = authenticated_user(&state.db, &headers).await?;
    let grant = live_grant(&state, &delegate.id, &grant_id).await?;
    let table = tenant_table(&grant.owner_user_id);
    if grant.role == "rsvp_guest" {
        let person = grant.person_id.as_deref().ok_or_else(unavailable)?;
        let guest_query = format!(
            "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_guest_profile' AND m.content->>'person_id'=$1 AND {} ORDER BY m.timestamp DESC,m.id DESC LIMIT 1",
            metadata_scope("m", 2, 3)
        );
        let invitation_query = format!(
            "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_event_invitation' AND m.content->>'person_id'=$1 AND {} ORDER BY COALESCE((m.content->>'response_revision')::bigint,1) DESC,m.timestamp DESC,m.id DESC LIMIT 1",
            metadata_scope("m", 2, 3)
        );
        let guest = sqlx::query_scalar::<_, Value>(&guest_query)
            .bind(person)
            .bind(&grant.plan)
            .bind(&grant.workspace)
            .fetch_optional(&state.db.pool)
            .await
            .map_err(store_error)?
            .ok_or_else(unavailable)?;
        let invitation = sqlx::query_scalar::<_, Value>(&invitation_query)
            .bind(person)
            .bind(&grant.plan)
            .bind(&grant.workspace)
            .fetch_optional(&state.db.pool)
            .await
            .map_err(store_error)?
            .ok_or_else(unavailable)?;
        return Ok(Json(rsvp_guest_projection(
            &grant,
            person,
            &guest,
            &invitation,
        )));
    }
    let household_query = format!(
        "SELECT DISTINCT ON (m.content->>'household_id') m.content FROM {table} m WHERE m.kind='wedding_boundary_household' AND m.content->>'household_id'=ANY($1) AND {} ORDER BY m.content->>'household_id',COALESCE((m.content->>'revision')::bigint,1) DESC,m.timestamp DESC,m.id DESC",
        metadata_scope("m", 2, 3)
    );
    let households = sqlx::query_scalar::<_, Value>(&household_query)
        .bind(&grant.household_ids)
        .bind(&grant.plan)
        .bind(&grant.workspace)
        .fetch_all(&state.db.pool)
        .await
        .map_err(store_error)?;
    Ok(Json(json!({
        "grant_id": grant.grant_id,
        "role": grant.role,
        "households": households.iter().map(planner_household_projection).collect::<Vec<_>>(),
        "private_notes_visible": false
    })))
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ProposeRequest {
    change_type: String,
    request_label: String,
    target_household_id: Option<String>,
    target_person_id: Option<String>,
    proposed_guest_name: Option<String>,
    proposed_plus_one_allowed: Option<bool>,
    proposed_invitation_status: Option<String>,
    proposed_contact_label: Option<String>,
    idempotency_key: String,
}

async fn propose_change(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(grant_id): Path<String>,
    Json(request): Json<ProposeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_boundary_delegate_propose", &headers),
        RateLimitPolicy {
            max_requests: 20,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let delegate = authenticated_user(&state.db, &headers).await?;
    let grant = live_grant(&state, &delegate.id, &grant_id).await?;
    let allowed = if grant.role == "planner" {
        PLANNER_CHANGES.as_slice()
    } else {
        RSVP_GUEST_CHANGES.as_slice()
    };
    if !allowed.contains(&request.change_type.as_str())
        || !valid_label(&request.request_label)
        || !valid_id(&request.idempotency_key)
        || request
            .target_household_id
            .as_deref()
            .is_some_and(|value| !valid_id(value))
        || request
            .target_person_id
            .as_deref()
            .is_some_and(|value| !valid_id(value))
    {
        return Err(bad("Review the scoped change before submitting it."));
    }
    let table = tenant_table(&grant.owner_user_id);
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    let mut target_person_id = request.target_person_id.clone();
    let target_household_id = if grant.role == "rsvp_guest" {
        let person = grant.person_id.clone().ok_or_else(unavailable)?;
        if target_person_id
            .as_deref()
            .is_some_and(|value| value != person)
        {
            return Err((
                StatusCode::FORBIDDEN,
                "This access is limited to your own invitation.".into(),
            ));
        }
        target_person_id = Some(person.clone());
        latest_guest(&mut tx, &table, &grant.plan, &grant.workspace, &person)
            .await?
            .and_then(|value| {
                value
                    .get("household_id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
    } else if request.change_type == "add_guest" {
        request.target_household_id.clone()
    } else {
        let person = target_person_id
            .as_deref()
            .ok_or_else(|| bad("Choose the affected guest."))?;
        latest_guest(&mut tx, &table, &grant.plan, &grant.workspace, person)
            .await?
            .and_then(|value| {
                value
                    .get("household_id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
    };
    let household = target_household_id
        .as_deref()
        .ok_or_else(|| bad("Choose a household in the delegated scope."))?;
    if !grant.household_ids.iter().any(|value| value == household) {
        return Err((
            StatusCode::FORBIDDEN,
            "This household is outside the delegated scope.".into(),
        ));
    }
    if request.change_type == "add_guest" {
        let name = request
            .proposed_guest_name
            .as_deref()
            .filter(|value| valid_label(value))
            .ok_or_else(|| bad("Add the proposed guest's name."))?;
        target_person_id = Some(format!("wedding-person-{}", Ulid::new()));
        if name.trim().is_empty() {
            return Err(bad("Add the proposed guest's name."));
        }
    }
    let household_revision =
        latest_household_revision(&mut tx, &table, &grant.plan, &grant.workspace, household)
            .await?;
    let receipt_key = format!("delegate:{}:{}", grant.grant_id, request.idempotency_key);
    let request_value =
        serde_json::to_value(&request).map_err(|_| bad("Invalid delegated change."))?;
    let request_fingerprint = fingerprint(&request_value);
    if let Some(response) = replay_or_reserve(
        &mut tx,
        &grant.owner_user_id,
        &receipt_key,
        "delegated_boundary_proposal",
        &request_fingerprint,
    )
    .await?
    {
        tx.commit().await.map_err(store_error)?;
        return Ok(Json(response));
    }
    let request_id = format!("wedding-boundary-request-{}", Ulid::new());
    append_event(
        &mut tx,
        &table,
        &request_id,
        "wedding_boundary_change_request",
        &grant.plan,
        &grant.workspace,
        json!({
            "ledger_kind": "wedding_boundary_change_request",
            "boundary_object_id": request_id,
            "request_id": request_id,
            "title": request.request_label.trim(),
            "requested_by": format!("delegated_grant:{}", grant.grant_id),
            "requested_role": grant.role,
            "change_type": request.change_type,
            "target_household_id": household,
            "target_person_id": target_person_id,
            "proposed_guest_name": request.proposed_guest_name.as_deref().map(str::trim),
            "proposed_plus_one_allowed": request.proposed_plus_one_allowed,
            "proposed_invitation_status": request.proposed_invitation_status,
            "proposed_contact_label": request.proposed_contact_label.as_deref().map(str::trim),
            "expected_household_revision": household_revision,
            "request_status": "pending",
            "status": "pending",
            "approval_required": true,
            "approval_gate_recorded": true,
            "required_approval_count": 1,
            "revision": 1,
            "visibility": "couple_only",
            "private_content_copied": false
        }),
    )
    .await?;
    let response = json!({
        "request_id": request_id,
        "status": "pending",
        "replayed": false,
        "explanation": "The change was submitted for the couple to review. Nothing was applied or sent."
    });
    finish_receipt(&mut tx, &grant.owner_user_id, &receipt_key, &response).await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(response))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delegated_roles_are_minimum_necessary() {
        assert!(!PLANNER_ACTIONS.contains(&"approve_request"));
        assert!(!RSVP_GUEST_ACTIONS.contains(&"view_private_notes"));
        assert!(!RSVP_GUEST_CHANGES.contains(&"add_guest"));
    }

    #[test]
    fn delegated_projections_drop_private_and_logistics_only_fields() {
        let grant = LiveGrant {
            grant_id: "grant-a".into(),
            owner_user_id: "owner-a".into(),
            plan: "plan-a".into(),
            workspace: "workspace-a".into(),
            role: "rsvp_guest".into(),
            person_id: Some("person-a".into()),
            household_ids: vec!["household-a".into()],
        };
        let secret = "must-not-leak";
        let guest = json!({"display_name":"Alex","dietary_note":secret,"contact_label":secret,"private_note":secret});
        let invitation = json!({"invitation_id":"invite-a","event_id":"event-a","invitation_status":"invited","plus_one_allowed":false,"children_invited":false,"response_revision":2,"seating_conflict_reason":secret,"meal_requirement":secret});
        let household = json!({"household_id":"household-a","display_name":"Household A","invitation_allocation":2,"request_deadline":null,"request_window_status":"open","revision":1,"seating_conflict_reason":secret,"member_person_ids":["person-a"]});
        assert!(
            !rsvp_guest_projection(&grant, "person-a", &guest, &invitation)
                .to_string()
                .contains(secret)
        );
        assert!(
            !planner_household_projection(&household)
                .to_string()
                .contains(secret)
        );
    }

    #[test]
    fn rollout_requires_flag_and_owner_allowlist() {
        unsafe {
            std::env::remove_var("OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED");
            std::env::remove_var("OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST");
        }
        assert!(!access_enabled("owner-a"));
    }
}
