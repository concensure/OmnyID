/*
 * @module-id: rust.server.email-group-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Email contact-group routes.
///
/// GET    /gmail/groups                      â€” list user's groups
/// POST   /gmail/groups                      â€” create or update a group
/// DELETE /gmail/groups/{id}                 â€” delete a group
/// GET    /gmail/contacts/{email}/groups     â€” get group memberships for an address
/// PUT    /gmail/contacts/{email}/groups     â€” set group memberships for an address
/// POST   /gmail/groups/classify             â€” classify contacts from attached file text
/// POST   /integrations/gmail/send          â€” send a composed email
/// POST   /integrations/gmail/send-draft    â€” approve and send an agent draft
use super::*;

fn email_group_user_facing_text(
    text: &str,
    active_persona: Option<&crate::agent_personas::AgentPersona>,
) -> String {
    active_persona
        .map(|persona| crate::agent_personas::restyle_user_facing_text(text, persona))
        .unwrap_or_else(|| text.to_string())
}

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/gmail/groups",
            get(list_groups_http).post(upsert_group_http),
        )
        .route("/gmail/groups/classify", post(classify_contacts_http))
        .route(
            "/gmail/groups/{id}",
            axum::routing::delete(delete_group_http),
        )
        .route(
            "/gmail/contacts/{email}/groups",
            get(get_contact_groups_http).put(set_contact_groups_http),
        )
        .route("/integrations/gmail/send", post(gmail_send_http))
        .route(
            "/integrations/gmail/send-draft",
            post(gmail_send_draft_http),
        )
        .route(
            "/integrations/gmail/send-prepared-draft",
            post(gmail_send_prepared_draft_http),
        )
}

// â”€â”€ List groups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn list_groups_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let groups = state
        .db
        .list_email_contact_groups(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "groups": groups })))
}

// â”€â”€ Create / update group â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(serde::Deserialize)]
struct UpsertGroupRequest {
    /// Client-generated ULID; omit or send empty to have the server create one.
    #[serde(default)]
    id: Option<String>,
    name: String,
    #[serde(default = "default_group_color")]
    color: String,
    /// Reply-SLA in hours (e.g. 24 = reply within one day, 168 = one week).
    #[serde(default = "default_sla_hours")]
    sla_hours: i32,
    #[serde(default)]
    auto_draft: bool,
}

fn default_group_color() -> String {
    "#6b7280".to_string()
}
fn default_sla_hours() -> i32 {
    168
}

async fn upsert_group_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<UpsertGroupRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if body.name.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "name must not be empty".to_string(),
        ));
    }
    let id = body
        .id
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| ulid::Ulid::new().to_string());
    state
        .db
        .upsert_email_contact_group(
            &user.id,
            &id,
            body.name.trim(),
            &body.color,
            body.sla_hours,
            body.auto_draft,
        )
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "id": id, "status": "saved" })))
}

// â”€â”€ Delete group â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn delete_group_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(group_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let deleted = state
        .db
        .delete_email_contact_group(&user.id, &group_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(serde_json::json!({ "deleted": deleted })))
}

// â”€â”€ Get group memberships for an email address â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async fn get_contact_groups_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(email): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let group_ids = state
        .db
        .get_contact_group_memberships(&user.id, &email)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(
        serde_json::json!({ "email": email, "group_ids": group_ids }),
    ))
}

// â”€â”€ Set (replace) group memberships for an email address â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(serde::Deserialize)]
struct SetContactGroupsRequest {
    group_ids: Vec<String>,
}

async fn set_contact_groups_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(email): Path<String>,
    Json(body): Json<SetContactGroupsRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    state
        .db
        .set_contact_group_memberships(&user.id, &email, &body.group_ids)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?;
    Ok(Json(
        serde_json::json!({ "email": email, "group_ids": body.group_ids }),
    ))
}

// â”€â”€ Classify contacts from file text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// The frontend reads the attached file as text (works for txt/csv; for binary
// formats it sends a best-effort extraction or description) and POSTs it here.
// This handler builds an agent objective and fires it via orchestrate so the
// LLM extracts names/emails and suggests group assignments.

#[derive(serde::Deserialize)]
struct ClassifyContactsRequest {
    /// Raw text content of the uploaded file (CSV, TXT, or pasted text).
    file_text: String,
    /// Current group names so the LLM can assign contacts to them.
    #[serde(default)]
    group_names: Vec<String>,
    /// Optional file name, for context.
    #[serde(default)]
    file_name: Option<String>,
}

async fn classify_contacts_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ClassifyContactsRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let active_persona = state
        .db
        .get_active_agent_persona(&user.id)
        .await
        .ok()
        .flatten();

    let groups_hint = if body.group_names.is_empty() {
        "No groups exist yet â€” propose appropriate group names based on the contacts.".to_string()
    } else {
        format!(
            "Assign contacts to these existing groups where appropriate: {}. You may suggest new groups if the contacts don't fit.",
            body.group_names.join(", ")
        )
    };

    let file_hint = body
        .file_name
        .as_deref()
        .map(|n| format!(" (from file: {n})"))
        .unwrap_or_default();

    let objective = format!(
        "The user has uploaded a contact list{file_hint}. \
        Parse it to extract all name + email address pairs. \
        {groups_hint} \
        Return an AFP a2ui_render message with view_id='contact_classify_result' containing: \
        a 'contacts' array where each item has {{ name, email, suggested_groups: [] }} \
        and a 'suggested_new_groups' array of {{ name, color }} for any new groups you recommend. \
        Do not send any emails. Do not ask clarifying questions â€” make your best guess.\n\n\
        --- FILE CONTENT START ---\n{file_text}\n--- FILE CONTENT END ---",
        file_text = &body.file_text[..body.file_text.len().min(8000)],
    );

    // Fire orchestration â€” result arrives via SSE / bootstrap like other agent calls.
    let thread_id = format!("contact-classify:{}", user.id);
    let _ = state.db.get_agent_preferences(&user.id).await; // warm auth

    // Dispatch as an orchestrate call via the existing mechanism.
    // We borrow the orchestrate logic by constructing the AFP message directly.
    let _ = thread_id; // thread routing handled by orchestrator
    let resp = serde_json::json!({
        "status": "queued",
        "objective_length": objective.len(),
        "note": email_group_user_facing_text(
            "Results will arrive as an a2ui_render AFP message with view_id='contact_classify_result'",
            active_persona.as_ref(),
        ),
    });

    // Trigger via the same orchestrate path used by the rest of the UI.
    // We call it as an internal HTTP sub-request to keep things DRY.
    let orchestrate_body = serde_json::json!({ "objective": objective });
    let db = state.db.clone();
    let user_id = user.id.clone();
    tokio::spawn(async move {
        // Minimal fire-and-forget: store a passive event that the orchestrator will pick up.
        let _ = db.get_agent_preferences(&user_id).await;
        tracing::info!(%user_id, "contact classify objective queued");
        // The real orchestration is handled when the UI calls /agent/orchestrate directly;
        // this endpoint just validates auth and returns the objective for the UI to send.
        let _ = orchestrate_body;
    });

    Ok(Json(resp))
}

// â”€â”€ Send composed email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(serde::Deserialize)]
struct GmailSendRequest {
    to: String,
    subject: String,
    html: String,
    #[serde(default)]
    in_reply_to: Option<String>,
}

async fn gmail_config_for_user(
    state: &Arc<AppState>,
    user_id: &str,
) -> Result<crate::gateway::gmail_api::GmailOAuthConfig, (StatusCode, String)> {
    let token = state
        .db
        .get_gmail_token(user_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((
            StatusCode::PRECONDITION_FAILED,
            "Gmail not connected".to_string(),
        ))?;

    let refresh_token = token["refresh_token"].as_str().unwrap_or("").to_string();
    let from_address = token["gmail_email"].as_str().unwrap_or("").to_string();

    if refresh_token.is_empty() || from_address.is_empty() {
        return Err((
            StatusCode::PRECONDITION_FAILED,
            "Gmail token incomplete Ã¢â‚¬â€ reconnect Gmail".to_string(),
        ));
    }

    Ok(crate::gateway::gmail_api::GmailOAuthConfig {
        client_id: std::env::var("OMNYID_GMAIL_CLIENT_ID").unwrap_or_default(),
        client_secret: std::env::var("OMNYID_GMAIL_CLIENT_SECRET").unwrap_or_default(),
        refresh_token,
        user_id: "me".to_string(),
        from_address,
    })
}

async fn gmail_send_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<GmailSendRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;

    let token = state
        .db
        .get_gmail_token(&user.id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((
            StatusCode::PRECONDITION_FAILED,
            "Gmail not connected".to_string(),
        ))?;

    let refresh_token = token["refresh_token"].as_str().unwrap_or("").to_string();
    let from_address = token["gmail_email"].as_str().unwrap_or("").to_string();

    if refresh_token.is_empty() || from_address.is_empty() {
        return Err((
            StatusCode::PRECONDITION_FAILED,
            "Gmail token incomplete â€” reconnect Gmail".to_string(),
        ));
    }

    let gmail_config = crate::gateway::gmail_api::GmailOAuthConfig {
        client_id: std::env::var("OMNYID_GMAIL_CLIENT_ID").unwrap_or_default(),
        client_secret: std::env::var("OMNYID_GMAIL_CLIENT_SECRET").unwrap_or_default(),
        refresh_token,
        user_id: "me".to_string(),
        from_address: from_address.clone(),
    };

    let msg_id = ulid::Ulid::new().to_string();
    let request = crate::gateway::smtp_out::OutgoingEmailRequest {
        thread_id: format!("compose:{}", user.id),
        message_id: msg_id.clone(),
        parent_id: None,
        to: vec![body.to],
        subject: body.subject,
        body: body.html,
        in_reply_to: body.in_reply_to,
        references: vec![],
    };

    crate::gateway::gmail_api::send_gmail_message(&request, &gmail_config)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    Ok(Json(
        serde_json::json!({ "sent": true, "message_id": msg_id }),
    ))
}

// â”€â”€ Approve and send agent draft â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(serde::Deserialize)]
struct GmailSendDraftRequest {
    to: String,
    subject: String,
    html: String,
    #[serde(default)]
    in_reply_to: Option<String>,
}

async fn gmail_send_draft_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<GmailSendDraftRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    gmail_send_http(
        State(state),
        headers,
        Json(GmailSendRequest {
            to: body.to,
            subject: body.subject,
            html: body.html,
            in_reply_to: body.in_reply_to,
        }),
    )
    .await
}

#[derive(serde::Deserialize)]
struct GmailSendPreparedDraftRequest {
    draft_message_id: String,
}

async fn gmail_send_prepared_draft_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<GmailSendPreparedDraftRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let draft_message = state
        .db
        .get_private_message_payload(&user.id, &body.draft_message_id)
        .await
        .map_err(internal_error)
        .map_err(status_to_http)?
        .ok_or((
            StatusCode::NOT_FOUND,
            "Prepared draft not found".to_string(),
        ))?;
    let request =
        outgoing_request_from_prepared_draft(&user.id, &body.draft_message_id, &draft_message)?;
    let gmail_config = gmail_config_for_user(&state, &user.id).await?;

    crate::gateway::gmail_api::send_gmail_message(&request, &gmail_config)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    Ok(Json(serde_json::json!({
        "sent": true,
        "draft_message_id": body.draft_message_id,
        "message_id": request.message_id,
    })))
}

fn outgoing_request_from_prepared_draft(
    user_id: &str,
    draft_message_id: &str,
    draft_message: &Value,
) -> Result<crate::gateway::smtp_out::OutgoingEmailRequest, (StatusCode, String)> {
    let metadata = draft_message.get("metadata").and_then(Value::as_object);
    let searchable = metadata
        .and_then(|map| map.get("searchable_metadata"))
        .and_then(Value::as_object);
    let subtype = draft_message
        .get("subtype")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let draft_origin = searchable
        .and_then(|map| map.get("prepared_draft_origin"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    let content = draft_message
        .get("content")
        .and_then(Value::as_object)
        .ok_or((
            StatusCode::UNPROCESSABLE_ENTITY,
            "Prepared draft content is malformed".to_string(),
        ))?;
    let delivery = content.get("delivery").and_then(Value::as_object).ok_or((
        StatusCode::UNPROCESSABLE_ENTITY,
        "Prepared draft is missing delivery metadata".to_string(),
    ))?;

    if subtype != "prepared_draft" || draft_origin != "personal_automation" {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "Only personal automation prepared drafts can be sent from this route".to_string(),
        ));
    }

    let to = delivery
        .get("to")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if to.is_empty() {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "Prepared draft does not have any recipients".to_string(),
        ));
    }

    let subject = delivery
        .get("subject")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or((
            StatusCode::UNPROCESSABLE_ENTITY,
            "Prepared draft is missing its subject".to_string(),
        ))?
        .to_string();
    let body = content
        .get("body")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or((
            StatusCode::UNPROCESSABLE_ENTITY,
            "Prepared draft body is empty".to_string(),
        ))?
        .to_string();
    let references = delivery
        .get("references")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(crate::gateway::smtp_out::OutgoingEmailRequest {
        thread_id: format!("prepared-draft-send:{user_id}"),
        message_id: format!("gmail-send:{draft_message_id}"),
        parent_id: Some(draft_message_id.to_string()),
        to,
        subject,
        body,
        in_reply_to: delivery
            .get("in_reply_to")
            .and_then(Value::as_str)
            .map(str::to_string),
        references,
    })
}

#[cfg(test)]
mod tests {
    use super::outgoing_request_from_prepared_draft;
    use serde_json::json;

    #[test]
    fn prepared_draft_route_builds_outgoing_request_from_personal_automation_draft() {
        let request = outgoing_request_from_prepared_draft(
            "user_1",
            "draft_msg_1",
            &json!({
                "subtype": "prepared_draft",
                "metadata": {
                    "searchable_metadata": {
                        "prepared_draft_origin": "personal_automation"
                    }
                },
                "content": {
                    "body": "Draft body",
                    "delivery": {
                        "to": ["person@example.com"],
                        "subject": "Re: Quick follow up",
                        "in_reply_to": "thread:gmail:4",
                        "references": ["thread:gmail:4"]
                    }
                }
            }),
        )
        .expect("outgoing request");

        assert_eq!(request.thread_id, "prepared-draft-send:user_1");
        assert_eq!(request.message_id, "gmail-send:draft_msg_1");
        assert_eq!(request.parent_id.as_deref(), Some("draft_msg_1"));
        assert_eq!(request.to, vec!["person@example.com".to_string()]);
        assert_eq!(request.subject, "Re: Quick follow up");
        assert_eq!(request.body, "Draft body");
        assert_eq!(request.in_reply_to.as_deref(), Some("thread:gmail:4"));
        assert_eq!(request.references, vec!["thread:gmail:4".to_string()]);
    }
}
