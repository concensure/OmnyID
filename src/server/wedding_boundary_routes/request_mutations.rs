use super::*;

#[derive(Debug)]
pub(super) struct MutationImpact {
    pub effects: Vec<&'static str>,
    pub connected_updates: Vec<&'static str>,
    pub previous_invitation_status: Option<String>,
    pub response_history_preserved: bool,
}

impl MutationImpact {
    fn standard(effects: Vec<&'static str>, connected_updates: Vec<&'static str>) -> Self {
        Self {
            effects,
            connected_updates,
            previous_invitation_status: None,
            response_history_preserved: false,
        }
    }
}

async fn latest_guest(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
) -> Result<Value, (StatusCode, String)> {
    let query = format!(
        "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_guest_profile' AND m.content->>'person_id'=$1 AND {} ORDER BY m.timestamp DESC,m.id DESC LIMIT 1 FOR UPDATE",
        metadata_scope("m", 2, 3)
    );
    sqlx::query_scalar(&query)
        .bind(person_id)
        .bind(plan)
        .bind(workspace)
        .fetch_optional(&mut **tx)
        .await
        .map_err(store_error)?
        .ok_or_else(|| conflict("That guest is no longer available."))
}

async fn latest_invitation(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
) -> Result<Value, (StatusCode, String)> {
    let query = format!(
        "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_event_invitation' AND m.content->>'person_id'=$1 AND {} ORDER BY COALESCE((m.content->>'response_revision')::bigint,1) DESC,m.timestamp DESC,m.id DESC LIMIT 1 FOR UPDATE",
        metadata_scope("m", 2, 3)
    );
    sqlx::query_scalar(&query)
        .bind(person_id)
        .bind(plan)
        .bind(workspace)
        .fetch_optional(&mut **tx)
        .await
        .map_err(store_error)?
        .ok_or_else(|| conflict("That invitation is no longer available."))
}

async fn append_mutation(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    kind: &str,
    content: Value,
) -> Result<(), (StatusCode, String)> {
    append_event(
        tx,
        table,
        &format!("boundary-mutation-{}", Ulid::new()),
        kind,
        plan,
        workspace,
        content,
    )
    .await
}

pub(super) async fn apply(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    request: &Value,
    confirmed_elevated_impact: bool,
) -> Result<MutationImpact, (StatusCode, String)> {
    if request.get("change_type").and_then(Value::as_str) == Some("add_guest") {
        return add_guest(tx, table, plan, workspace, request).await;
    }
    let person_id = request
        .get("target_person_id")
        .and_then(Value::as_str)
        .filter(|value| valid_id(value))
        .ok_or_else(|| conflict("Choose the exact guest affected by this request."))?;
    let change_type = request
        .get("change_type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match change_type {
        "remove_guest" => {
            remove_guest(
                tx,
                table,
                plan,
                workspace,
                person_id,
                confirmed_elevated_impact,
            )
            .await
        }
        "plus_one_change" => change_plus_one(tx, table, plan, workspace, person_id, request).await,
        "event_invite_change" => {
            change_invitation(tx, table, plan, workspace, person_id, request).await
        }
        "guest_contact_update" => {
            change_contact_label(tx, table, plan, workspace, person_id, request).await
        }
        "guest_note_change" => Err(conflict(
            "Private guest notes must be changed in the encrypted guest record, not copied into an approval event.",
        )),
        _ => Err(conflict(
            "Open the affected guest or household to apply this request safely.",
        )),
    }
}

async fn add_guest(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    request: &Value,
) -> Result<MutationImpact, (StatusCode, String)> {
    let household_id = request
        .get("target_household_id")
        .and_then(Value::as_str)
        .filter(|value| valid_id(value))
        .ok_or_else(|| conflict("Choose the household that this guest should join."))?;
    let person_id = request
        .get("target_person_id")
        .and_then(Value::as_str)
        .filter(|value| valid_id(value))
        .ok_or_else(|| conflict("Add the exact guest before approving this request."))?;
    let guest_name = request
        .get("proposed_guest_name")
        .and_then(Value::as_str)
        .filter(|value| valid_label(value))
        .ok_or_else(|| conflict("Add the guest's name before approving this request."))?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(format!("household:{workspace}:{household_id}"))
        .execute(&mut **tx)
        .await
        .map_err(store_error)?;
    let query = format!(
        "SELECT m.content FROM {table} m WHERE m.kind='wedding_boundary_household' AND m.content->>'household_id'=$1 AND {} ORDER BY COALESCE((m.content->>'revision')::bigint,1) DESC,m.timestamp DESC,m.id DESC LIMIT 1 FOR UPDATE",
        metadata_scope("m", 2, 3)
    );
    let mut household = sqlx::query_scalar::<_, Value>(&query)
        .bind(household_id)
        .bind(plan)
        .bind(workspace)
        .fetch_optional(&mut **tx)
        .await
        .map_err(store_error)?
        .ok_or_else(|| conflict("That household is no longer available."))?;
    let revision = household
        .get("revision")
        .and_then(Value::as_i64)
        .unwrap_or(1);
    let expected_revision = request
        .get("expected_household_revision")
        .and_then(Value::as_i64)
        .ok_or_else(|| conflict("Review the current household before approving this request."))?;
    if revision != expected_revision {
        return Err(conflict(
            "That household changed on another screen. Review the impact again.",
        ));
    }
    let mut members = household
        .get("member_person_ids")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if members
        .iter()
        .any(|value| value.as_str() == Some(person_id))
    {
        return Err(conflict("That guest is already in this household."));
    }
    if household
        .get("invitation_allocation")
        .and_then(Value::as_i64)
        .is_some_and(|allocation| allocation >= 0 && members.len() as i64 >= allocation)
    {
        return Err(conflict(
            "This household has reached its current invitation allocation.",
        ));
    }
    members.push(json!(person_id));
    if let Some(object) = household.as_object_mut() {
        object.insert("member_person_ids".into(), Value::Array(members));
        object.insert("revision".into(), json!(revision + 1));
    }
    append_event(
        tx,
        table,
        &format!("household-revision-{}", Ulid::new()),
        "wedding_boundary_household",
        plan,
        workspace,
        household,
    )
    .await?;
    append_event(tx, table, &format!("guest-profile-{}", Ulid::new()), "wedding_boundary_guest_profile", plan, workspace, json!({"ledger_kind":"wedding_boundary_guest_profile","boundary_object_id":person_id,"title":guest_name,"status":"active","visibility":"couple_only","person_id":person_id,"display_name":guest_name,"household_id":household_id,"age_band":"unknown","family_side":"other","rsvp_reminder_permission":false})).await?;
    append_event(tx, table, &format!("invitation-draft-{}", Ulid::new()), "wedding_boundary_event_invitation", plan, workspace, json!({"ledger_kind":"wedding_boundary_event_invitation","boundary_object_id":format!("wedding_invitation:{person_id}:main_wedding"),"title":format!("{guest_name} invitation"),"status":"draft","visibility":"approved_shared","invitation_id":format!("wedding_invitation:{person_id}:main_wedding"),"event_id":format!("wedding_event:{workspace}:main_wedding"),"person_id":person_id,"invitation_status":"not_invited","response_revision":1,"plus_one_allowed":false,"children_invited":false,"guest_role":"primary","name_pending":false,"seat_requirement":"standard","meal_requirement":"adult","visible_to_guest":false})).await?;
    Ok(MutationImpact::standard(
        vec![
            "guest_list",
            "invitation_entitlement",
            "rsvp",
            "seating",
            "catering",
            "budget_forecast",
            "tasks",
        ],
        vec![
            "Guest added to the household",
            "Unsent invitation draft created",
            "RSVP, seating, catering, budget and task views queued for refresh",
        ],
    ))
}

async fn remove_guest(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
    confirmed_elevated_impact: bool,
) -> Result<MutationImpact, (StatusCode, String)> {
    let mut guest = latest_guest(tx, table, plan, workspace, person_id).await?;
    let mut invitation = latest_invitation(tx, table, plan, workspace, person_id).await?;
    let prior_status = invitation
        .get("invitation_status")
        .and_then(Value::as_str)
        .unwrap_or("not_invited")
        .to_string();
    if ["invited", "rsvp_yes", "waitlist"].contains(&prior_status.as_str())
        && !confirmed_elevated_impact
    {
        return Err(conflict(
            "This invitation was sent or accepted. Confirm the connected impact before removing the guest.",
        ));
    }
    guest
        .as_object_mut()
        .expect("guest object")
        .insert("status".into(), json!("archived"));
    let invitation_object = invitation.as_object_mut().expect("invitation object");
    invitation_object.insert("previous_invitation_status".into(), json!(prior_status));
    invitation_object.insert("invitation_status".into(), json!("declined_by_couple"));
    invitation_object.insert("visible_to_guest".into(), json!(false));
    let revision = invitation_object
        .get("response_revision")
        .and_then(Value::as_i64)
        .unwrap_or(1)
        + 1;
    invitation_object.insert("response_revision".into(), json!(revision));
    append_mutation(
        tx,
        table,
        plan,
        workspace,
        "wedding_boundary_guest_profile",
        guest,
    )
    .await?;
    append_mutation(
        tx,
        table,
        plan,
        workspace,
        "wedding_boundary_event_invitation",
        invitation,
    )
    .await?;
    Ok(MutationImpact {
        effects: vec![
            "guest_list",
            "invitation_entitlement",
            "rsvp",
            "seating",
            "catering",
            "budget_forecast",
            "tasks",
        ],
        connected_updates: vec![
            "Guest archived from the active list",
            "Invitation closed without deleting its history",
            "RSVP history retained for audit",
            "Seating and catering counts queued for refresh",
        ],
        previous_invitation_status: Some(prior_status),
        response_history_preserved: true,
    })
}

async fn change_plus_one(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
    request: &Value,
) -> Result<MutationImpact, (StatusCode, String)> {
    let allowed = request
        .get("proposed_plus_one_allowed")
        .and_then(Value::as_bool)
        .ok_or_else(|| conflict("Choose whether this invitation includes a plus-one."))?;
    let mut invitation = latest_invitation(tx, table, plan, workspace, person_id).await?;
    invitation
        .as_object_mut()
        .expect("invitation object")
        .insert("plus_one_allowed".into(), json!(allowed));
    append_mutation(
        tx,
        table,
        plan,
        workspace,
        "wedding_boundary_event_invitation",
        invitation,
    )
    .await?;
    Ok(MutationImpact::standard(
        vec![
            "invitation_entitlement",
            "rsvp",
            "seating",
            "catering",
            "budget_forecast",
        ],
        vec![
            "Invitation entitlement updated",
            "RSVP, seating and catering views queued for refresh",
        ],
    ))
}

async fn change_invitation(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
    request: &Value,
) -> Result<MutationImpact, (StatusCode, String)> {
    let status = request
        .get("proposed_invitation_status")
        .and_then(Value::as_str)
        .filter(|value| {
            ["not_invited", "invited", "waitlist", "declined_by_couple"].contains(value)
        })
        .ok_or_else(|| conflict("Choose an explicit invitation status."))?;
    let mut invitation = latest_invitation(tx, table, plan, workspace, person_id).await?;
    let prior = invitation
        .get("invitation_status")
        .cloned()
        .unwrap_or(json!("not_invited"));
    let object = invitation.as_object_mut().expect("invitation object");
    object.insert("previous_invitation_status".into(), prior);
    object.insert("invitation_status".into(), json!(status));
    object.insert("response_source".into(), json!("couple_manual"));
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
    append_mutation(
        tx,
        table,
        plan,
        workspace,
        "wedding_boundary_event_invitation",
        invitation,
    )
    .await?;
    Ok(MutationImpact::standard(
        vec![
            "invitation_entitlement",
            "rsvp",
            "seating",
            "catering",
            "tasks",
        ],
        vec![
            "Invitation status updated",
            "RSVP, seating, catering and task views queued for refresh",
        ],
    ))
}

async fn change_contact_label(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
    request: &Value,
) -> Result<MutationImpact, (StatusCode, String)> {
    let label = request
        .get("proposed_contact_label")
        .and_then(Value::as_str)
        .filter(|value| valid_label(value))
        .ok_or_else(|| conflict("Add the reviewed contact label before approving this update."))?;
    let mut guest = latest_guest(tx, table, plan, workspace, person_id).await?;
    guest
        .as_object_mut()
        .expect("guest object")
        .insert("contact_label".into(), json!(label.trim()));
    append_mutation(
        tx,
        table,
        plan,
        workspace,
        "wedding_boundary_guest_profile",
        guest,
    )
    .await?;
    Ok(MutationImpact::standard(
        vec!["guest_list", "rsvp", "tasks"],
        vec![
            "Guest label updated",
            "RSVP and task views queued for refresh",
        ],
    ))
}
