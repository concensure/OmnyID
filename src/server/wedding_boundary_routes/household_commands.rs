use super::*;
use std::collections::{BTreeSet, HashMap};

const OPERATIONS: [&str; 9] = [
    "split_household",
    "merge_households",
    "archive_household",
    "assign_group",
    "change_allocation",
    "change_representative",
    "close_requests",
    "reopen_requests",
    "apply_group_plus_one_policy",
];

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route(
        "/wedding/boundaries/households/commands",
        post(apply_household_command),
    )
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct HouseholdCommandRequest {
    wedding_plan_id: String,
    response_workspace_id: String,
    operation: String,
    #[serde(default)]
    source_household_ids: Vec<String>,
    target_household_id: Option<String>,
    new_household_id: Option<String>,
    new_household_label: Option<String>,
    #[serde(default)]
    move_person_ids: Vec<String>,
    expected_revisions: HashMap<String, i64>,
    family_group_id: Option<String>,
    invitation_allocation: Option<i64>,
    representative_person_id: Option<String>,
    plus_one_allowed: Option<bool>,
    #[serde(default)]
    exception_person_ids: Vec<String>,
    confirmed_elevated_impact: Option<bool>,
    idempotency_key: String,
}

async fn latest_household(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    household_id: &str,
) -> Result<Option<Value>, (StatusCode, String)> {
    let query = format!(
        "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_household' AND m.content->>'household_id'=$1 AND {} ORDER BY COALESCE((m.content->>'revision')::bigint,1) DESC,m.timestamp DESC,m.id DESC LIMIT 1 FOR UPDATE",
        metadata_scope("m", 2, 3)
    );
    sqlx::query_scalar(&query)
        .bind(household_id)
        .bind(plan)
        .bind(workspace)
        .fetch_optional(&mut **tx)
        .await
        .map_err(store_error)
}

fn member_ids(household: &Value) -> Vec<String> {
    household
        .get("member_person_ids")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|value| valid_id(value))
        .map(str::to_string)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn set_members(household: &mut Value, members: Vec<String>) {
    if let Some(object) = household.as_object_mut() {
        object.insert("member_person_ids".into(), json!(members));
    }
}

fn next_revision(household: &mut Value) -> i64 {
    let revision = household
        .get("revision")
        .and_then(Value::as_i64)
        .unwrap_or(1)
        + 1;
    if let Some(object) = household.as_object_mut() {
        object.insert("revision".into(), json!(revision));
    }
    revision
}

async fn append_household(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    household: Value,
) -> Result<(), (StatusCode, String)> {
    append_event(
        tx,
        table,
        &format!("household-command-{}", Ulid::new()),
        "wedding_boundary_household",
        plan,
        workspace,
        household,
    )
    .await
}

async fn move_guests(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_ids: &[String],
    household_id: &str,
) -> Result<(), (StatusCode, String)> {
    for person_id in person_ids {
        let query = format!(
            "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_guest_profile' AND m.content->>'person_id'=$1 AND {} ORDER BY m.timestamp DESC,m.id DESC LIMIT 1 FOR UPDATE",
            metadata_scope("m", 2, 3)
        );
        let Some(mut guest) = sqlx::query_scalar::<_, Value>(&query)
            .bind(person_id)
            .bind(plan)
            .bind(workspace)
            .fetch_optional(&mut **tx)
            .await
            .map_err(store_error)?
        else {
            return Err(conflict(
                "A guest changed while this household update was open.",
            ));
        };
        guest
            .as_object_mut()
            .expect("stored guest profiles are objects")
            .insert("household_id".into(), json!(household_id));
        append_event(
            tx,
            table,
            &format!("guest-household-command-{}", Ulid::new()),
            "wedding_boundary_guest_profile",
            plan,
            workspace,
            guest,
        )
        .await?;
    }
    Ok(())
}

async fn has_committed_invitation(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_ids: &[String],
) -> Result<bool, (StatusCode, String)> {
    if person_ids.is_empty() {
        return Ok(false);
    }
    let query = format!(
        "SELECT EXISTS(SELECT 1 FROM {table} m WHERE m.kind='wedding_boundary_event_invitation' AND m.content->>'person_id'=ANY($1) AND m.content->>'invitation_status'=ANY($2) AND {})",
        metadata_scope("m", 3, 4)
    );
    sqlx::query_scalar(&query)
        .bind(person_ids)
        .bind(vec!["invited", "rsvp_yes", "waitlist"])
        .bind(plan)
        .bind(workspace)
        .fetch_one(&mut **tx)
        .await
        .map_err(store_error)
}

fn validate_request(
    request: &HouseholdCommandRequest,
) -> Result<Vec<String>, (StatusCode, String)> {
    let ids = request
        .source_household_ids
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    if !valid_id(&request.wedding_plan_id)
        || !valid_id(&request.response_workspace_id)
        || !valid_id(&request.idempotency_key)
        || !OPERATIONS.contains(&request.operation.as_str())
        || ids.is_empty()
        || ids.len() > 50
        || ids.iter().any(|value| !valid_id(value))
        || request.move_person_ids.len() > 200
        || request.move_person_ids.iter().any(|value| !valid_id(value))
        || request.exception_person_ids.len() > 200
        || request
            .exception_person_ids
            .iter()
            .any(|value| !valid_id(value))
        || request.expected_revisions.len() != ids.len()
        || ids.iter().any(|id| {
            request
                .expected_revisions
                .get(id)
                .is_none_or(|revision| *revision < 1)
        })
        || request
            .invitation_allocation
            .is_some_and(|value| !(0..=2_000).contains(&value))
    {
        return Err(bad(
            "Review the current households before applying this change.",
        ));
    }
    Ok(ids)
}

async fn apply_household_command(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<HouseholdCommandRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        authenticated_rate_limit_key("wedding_boundary_household_command", &headers),
        RateLimitPolicy {
            max_requests: 30,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let user = authenticated_user(&state.db, &headers).await?;
    let ids = validate_request(&request)?;
    state
        .db
        .ensure_user_private_schema(&user.id)
        .await
        .map_err(store_error)?;
    let table = tenant_table(&user.id);
    let mut tx = state.db.pool.begin().await.map_err(store_error)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(format!(
            "household-command:{}:{}",
            user.id, request.response_workspace_id
        ))
        .execute(&mut *tx)
        .await
        .map_err(store_error)?;
    let request_value =
        serde_json::to_value(&request).map_err(|_| bad("Invalid household change."))?;
    let command_fingerprint = fingerprint(&request_value);
    if let Some(response) = replay_or_reserve(
        &mut tx,
        &user.id,
        &request.idempotency_key,
        "household_command",
        &command_fingerprint,
    )
    .await?
    {
        tx.commit().await.map_err(store_error)?;
        return Ok(Json(response));
    }

    let mut households = HashMap::new();
    for id in &ids {
        let household = latest_household(
            &mut tx,
            &table,
            &request.wedding_plan_id,
            &request.response_workspace_id,
            id,
        )
        .await?
        .ok_or_else(|| conflict("A selected household is no longer available."))?;
        let revision = household
            .get("revision")
            .and_then(Value::as_i64)
            .unwrap_or(1);
        if request.expected_revisions.get(id) != Some(&revision)
            || household.get("status").and_then(Value::as_str) == Some("archived")
        {
            return Err(conflict(
                "A selected household changed. Review the impact again.",
            ));
        }
        households.insert(id.clone(), household);
    }
    let all_people = households
        .values()
        .flat_map(member_ids)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let committed = has_committed_invitation(
        &mut tx,
        &table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        &all_people,
    )
    .await?;
    if committed && request.confirmed_elevated_impact != Some(true) {
        return Err(conflict(
            "Some affected invitations were sent or accepted. Confirm the elevated impact before applying this change.",
        ));
    }

    match request.operation.as_str() {
        "split_household" => split(&mut tx, &table, &request, households).await?,
        "merge_households" => merge(&mut tx, &table, &request, households).await?,
        "archive_household" => archive(&mut tx, &table, &request, households).await?,
        "apply_group_plus_one_policy" => {
            apply_group_plus_one_policy(&mut tx, &table, &request, households).await?
        }
        _ => revise_many(&mut tx, &table, &user.id, &request, households).await?,
    }
    let receipt_id = format!("wedding-boundary-household-impact-{}", Ulid::new());
    append_event(
        &mut tx,
        &table,
        &receipt_id,
        "wedding_boundary_impact_receipt",
        &request.wedding_plan_id,
        &request.response_workspace_id,
        json!({
            "receipt_id": receipt_id,
            "operation": request.operation,
            "affected_household_ids": ids,
            "affected_person_ids": all_people,
            "effects": ["guest_list", "invitation_entitlement", "rsvp", "seating", "catering", "budget_forecast", "tasks"],
            "attendance_inferred": false,
            "invitation_sent": false,
            "spend_committed": false,
            "vendor_contract_changed": false
        }),
    )
    .await?;
    let response = json!({"status":"applied","operation":request.operation,"impact_receipt_id":receipt_id,"replayed":false,"explanation":"The household change is recorded once and connected wedding views can refresh from the same ledger."});
    finish_receipt(&mut tx, &user.id, &request.idempotency_key, &response).await?;
    tx.commit().await.map_err(store_error)?;
    Ok(Json(response))
}

async fn apply_group_plus_one_policy(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    request: &HouseholdCommandRequest,
    households: HashMap<String, Value>,
) -> Result<(), (StatusCode, String)> {
    let group_id = request
        .family_group_id
        .as_deref()
        .filter(|value| valid_id(value))
        .ok_or_else(|| bad("Choose the family group for this plus-one policy."))?;
    let allowed = request
        .plus_one_allowed
        .ok_or_else(|| bad("Choose whether this group receives plus-ones."))?;
    if households
        .values()
        .any(|household| household.get("family_group_id").and_then(Value::as_str) != Some(group_id))
    {
        return Err(conflict(
            "Review the households in this family group before changing plus-ones.",
        ));
    }
    let people = households
        .values()
        .flat_map(member_ids)
        .collect::<BTreeSet<_>>();
    let exceptions = request
        .exception_person_ids
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    if !exceptions.is_subset(&people) {
        return Err(bad(
            "Every plus-one exception must belong to this family group.",
        ));
    }
    let policy_id = format!("wedding-boundary-plus-one-policy-{}", Ulid::new());
    append_event(
        tx,
        table,
        &policy_id,
        "wedding_boundary_policy",
        &request.wedding_plan_id,
        &request.response_workspace_id,
        json!({
            "boundary_object_id": policy_id,
            "rule_type": "plus_one",
            "scope_kind": "family_group",
            "scope_id": group_id,
            "effect": {"plus_one_allowed": allowed},
            "exception_person_ids": exceptions,
            "enforcement": "require_approval",
            "rule_status": "active",
            "version": 1,
            "private_content_copied": false
        }),
    )
    .await?;
    for person_id in people.difference(&exceptions) {
        let query = format!(
            "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_event_invitation' AND m.content->>'person_id'=$1 AND {} ORDER BY COALESCE((m.content->>'response_revision')::bigint,1) DESC,m.timestamp DESC,m.id DESC LIMIT 1 FOR UPDATE",
            metadata_scope("m", 2, 3)
        );
        let Some(mut invitation) = sqlx::query_scalar::<_, Value>(&query)
            .bind(person_id)
            .bind(&request.wedding_plan_id)
            .bind(&request.response_workspace_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(store_error)?
        else {
            continue;
        };
        let object = invitation.as_object_mut().expect("invitation object");
        object.insert("plus_one_allowed".into(), json!(allowed));
        object.insert("plus_one_policy_id".into(), json!(policy_id));
        object.insert(
            "response_revision".into(),
            json!(
                object
                    .get("response_revision")
                    .and_then(Value::as_i64)
                    .unwrap_or(1)
                    + 1
            ),
        );
        append_event(
            tx,
            table,
            &format!("group-plus-one-{}", Ulid::new()),
            "wedding_boundary_event_invitation",
            &request.wedding_plan_id,
            &request.response_workspace_id,
            invitation,
        )
        .await?;
    }
    Ok(())
}

async fn split(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    request: &HouseholdCommandRequest,
    mut households: HashMap<String, Value>,
) -> Result<(), (StatusCode, String)> {
    if households.len() != 1 {
        return Err(bad("Choose one household to split."));
    }
    let source_id = request
        .source_household_ids
        .first()
        .expect("validated source");
    let new_id = request
        .new_household_id
        .as_deref()
        .filter(|value| valid_id(value))
        .ok_or_else(|| bad("Choose a stable ID for the new household."))?;
    let label = request
        .new_household_label
        .as_deref()
        .filter(|value| valid_label(value))
        .ok_or_else(|| bad("Name the new household."))?;
    if latest_household(
        tx,
        table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        new_id,
    )
    .await?
    .is_some()
    {
        return Err(conflict("That destination household already exists."));
    }
    let mut source = households.remove(source_id).expect("validated household");
    let members = member_ids(&source);
    let moving = request
        .move_person_ids
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    if moving.is_empty()
        || !moving.iter().all(|id| members.contains(id))
        || moving.len() >= members.len()
    {
        return Err(bad("Move some, but not all, current household members."));
    }
    set_members(
        &mut source,
        members
            .iter()
            .filter(|id| !moving.contains(*id))
            .cloned()
            .collect(),
    );
    next_revision(&mut source);
    let mut destination = source.clone();
    if let Some(object) = destination.as_object_mut() {
        object.insert("boundary_object_id".into(), json!(new_id));
        object.insert("household_id".into(), json!(new_id));
        object.insert("display_name".into(), json!(label.trim()));
        object.insert("title".into(), json!(label.trim()));
        object.insert("revision".into(), json!(1));
        object.insert(
            "primary_contact_person_id".into(),
            json!(moving.iter().next()),
        );
    }
    set_members(&mut destination, moving.iter().cloned().collect());
    append_household(
        tx,
        table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        source,
    )
    .await?;
    append_household(
        tx,
        table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        destination,
    )
    .await?;
    move_guests(
        tx,
        table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        &moving.into_iter().collect::<Vec<_>>(),
        new_id,
    )
    .await
}

async fn merge(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    request: &HouseholdCommandRequest,
    mut households: HashMap<String, Value>,
) -> Result<(), (StatusCode, String)> {
    if households.len() < 2 {
        return Err(bad("Choose at least two households to merge."));
    }
    let target_id = request
        .target_household_id
        .as_deref()
        .filter(|id| households.contains_key(*id))
        .ok_or_else(|| bad("Choose one selected household as the destination."))?;
    let mut target = households.remove(target_id).expect("validated target");
    let mut merged = member_ids(&target).into_iter().collect::<BTreeSet<_>>();
    let mut moved = Vec::new();
    let mut allocation = target
        .get("invitation_allocation")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    for (_, mut source) in households {
        let source_members = member_ids(&source);
        moved.extend(source_members.clone());
        merged.extend(source_members);
        allocation += source
            .get("invitation_allocation")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        set_members(&mut source, Vec::new());
        next_revision(&mut source);
        source
            .as_object_mut()
            .expect("household object")
            .insert("status".into(), json!("archived"));
        append_household(
            tx,
            table,
            &request.wedding_plan_id,
            &request.response_workspace_id,
            source,
        )
        .await?;
    }
    set_members(&mut target, merged.into_iter().collect());
    next_revision(&mut target);
    if allocation > 0 {
        target
            .as_object_mut()
            .expect("household object")
            .insert("invitation_allocation".into(), json!(allocation));
    }
    append_household(
        tx,
        table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        target,
    )
    .await?;
    move_guests(
        tx,
        table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        &moved,
        target_id,
    )
    .await
}

async fn archive(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    request: &HouseholdCommandRequest,
    mut households: HashMap<String, Value>,
) -> Result<(), (StatusCode, String)> {
    if households.len() != 1 {
        return Err(bad("Choose one empty household to archive."));
    }
    let mut household = households.drain().next().expect("validated household").1;
    if !member_ids(&household).is_empty() {
        return Err(conflict(
            "Move every member before archiving this household.",
        ));
    }
    next_revision(&mut household);
    household
        .as_object_mut()
        .expect("household object")
        .insert("status".into(), json!("archived"));
    append_household(
        tx,
        table,
        &request.wedding_plan_id,
        &request.response_workspace_id,
        household,
    )
    .await
}

async fn revise_many(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    owner_user_id: &str,
    request: &HouseholdCommandRequest,
    households: HashMap<String, Value>,
) -> Result<(), (StatusCode, String)> {
    for (_, mut household) in households {
        let current_members = member_ids(&household);
        let household_id = household
            .get("household_id")
            .and_then(Value::as_str)
            .expect("stored household has an ID")
            .to_string();
        let former_representative = household
            .get("primary_contact_person_id")
            .and_then(Value::as_str)
            .map(str::to_string);
        let object = household.as_object_mut().expect("household object");
        match request.operation.as_str() {
            "assign_group" => {
                let group = request
                    .family_group_id
                    .as_deref()
                    .filter(|value| valid_id(value))
                    .ok_or_else(|| bad("Choose a valid family group."))?;
                object.insert("family_group_id".into(), json!(group));
            }
            "change_allocation" => {
                object.insert(
                    "invitation_allocation".into(),
                    json!(
                        request
                            .invitation_allocation
                            .ok_or_else(|| bad("Choose a valid invitation allocation."))?
                    ),
                );
            }
            "change_representative" => {
                let person = request
                    .representative_person_id
                    .as_deref()
                    .filter(|value| valid_id(value))
                    .ok_or_else(|| bad("Choose a current household member as representative."))?;
                if !current_members.iter().any(|id| id == person) {
                    return Err(bad(
                        "The representative must be a current household member.",
                    ));
                }
                object.insert("primary_contact_person_id".into(), json!(person));
                if former_representative
                    .as_deref()
                    .is_some_and(|former| former != person)
                {
                    let helper_revoked = sqlx::query("UPDATE wedding_boundary_helper_grants SET revoked_at=NOW() WHERE owner_user_id=$1 AND wedding_plan_id=$2 AND response_workspace_id=$3 AND revoked_at IS NULL AND household_ids ? $4")
                        .bind(owner_user_id).bind(&request.wedding_plan_id).bind(&request.response_workspace_id).bind(&household_id)
                        .execute(&mut **tx).await.map_err(store_error)?.rows_affected();
                    let delegate_revoked = sqlx::query("UPDATE wedding_boundary_delegated_grants SET revoked_at=NOW() WHERE owner_user_id=$1 AND wedding_plan_id=$2 AND response_workspace_id=$3 AND person_id=$4 AND revoked_at IS NULL")
                        .bind(owner_user_id).bind(&request.wedding_plan_id).bind(&request.response_workspace_id).bind(former_representative.as_deref())
                        .execute(&mut **tx).await.map_err(store_error)?.rows_affected();
                    append_event(
                        tx,
                        table,
                        &format!("representative-grants-revoked-{}", Ulid::new()),
                        "wedding_boundary_permission_revoked",
                        &request.wedding_plan_id,
                        &request.response_workspace_id,
                        json!({
                            "household_id": household_id,
                            "former_representative_person_id": former_representative,
                            "helper_grants_revoked": helper_revoked,
                            "delegated_grants_revoked": delegate_revoked,
                            "reason": "household_representative_changed",
                            "private_content_copied": false
                        }),
                    )
                    .await?;
                }
            }
            "close_requests" => {
                object.insert("request_window_status".into(), json!("closed"));
            }
            "reopen_requests" => {
                object.insert("request_window_status".into(), json!("open"));
            }
            _ => return Err(bad("Choose a supported household change.")),
        }
        next_revision(&mut household);
        append_household(
            tx,
            table,
            &request.wedding_plan_id,
            &request.response_workspace_id,
            household,
        )
        .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_surface_is_explicit_and_bounded() {
        assert_eq!(OPERATIONS.len(), 9);
        assert!(OPERATIONS.contains(&"split_household"));
        assert!(OPERATIONS.contains(&"change_representative"));
        assert!(OPERATIONS.contains(&"apply_group_plus_one_policy"));
        assert!(!OPERATIONS.contains(&"delete_household"));
    }
}
