use super::*;

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
) -> Result<Vec<&'static str>, (StatusCode, String)> {
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
        "remove_guest" => remove_guest(tx, table, plan, workspace, person_id, request).await,
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

async fn remove_guest(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
    request: &Value,
) -> Result<Vec<&'static str>, (StatusCode, String)> {
    let mut guest = latest_guest(tx, table, plan, workspace, person_id).await?;
    let mut invitation = latest_invitation(tx, table, plan, workspace, person_id).await?;
    let prior_status = invitation
        .get("invitation_status")
        .and_then(Value::as_str)
        .unwrap_or("not_invited")
        .to_string();
    if ["invited", "rsvp_yes", "waitlist"].contains(&prior_status.as_str())
        && request
            .get("elevated_confirmation_recorded")
            .and_then(Value::as_bool)
            != Some(true)
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
    Ok(vec![
        "guest_list",
        "invitation_entitlement",
        "rsvp",
        "seating",
        "catering",
        "budget_forecast",
        "tasks",
    ])
}

async fn change_plus_one(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
    request: &Value,
) -> Result<Vec<&'static str>, (StatusCode, String)> {
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
    Ok(vec![
        "invitation_entitlement",
        "rsvp",
        "seating",
        "catering",
        "budget_forecast",
    ])
}

async fn change_invitation(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
    request: &Value,
) -> Result<Vec<&'static str>, (StatusCode, String)> {
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
    Ok(vec![
        "invitation_entitlement",
        "rsvp",
        "seating",
        "catering",
        "tasks",
    ])
}

async fn change_contact_label(
    tx: &mut Transaction<'_, Postgres>,
    table: &str,
    plan: &str,
    workspace: &str,
    person_id: &str,
    request: &Value,
) -> Result<Vec<&'static str>, (StatusCode, String)> {
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
    Ok(vec!["guest_list", "rsvp", "tasks"])
}
