/*
 * @module-id: rust.server.wedding-invite-proposal-routes
 * @primary-capability: approval-time recipient policy for Wedding Invite Proposals
 * @locs-version: 1.0
 */

use std::{collections::HashSet, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;

use crate::gateway::vendor_mail_provider::cloudflare_recipient_is_suppressed;
use crate::gateway::{
    gmail_api::find_gmail_message_by_rfc822_message_id,
    smtp_out::{OutgoingEmailRequest, outgoing_message_id_header},
};

use super::{
    AppState, RateLimitPolicy,
    auth::{authenticated_user, enforce_rate_limit},
    email_group_routes::{gmail_config_for_user, send_gmail_outgoing_request},
};

const MAX_RECIPIENTS: usize = 5;
const MAX_FIELD_CHARS: usize = 240;

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/wedding/invite-proposals/approval-preflight",
            post(invite_proposal_approval_preflight_http),
        )
        .route(
            "/wedding/invite-proposals/approve-and-send",
            post(invite_proposal_approve_and_send_http),
        )
}

#[derive(Debug, Deserialize)]
struct InviteProposalApprovalPreflightRequest {
    wedding_plan_id: String,
    brief_id: String,
    revision: u32,
    category: String,
    location: Option<String>,
    vendor_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
struct InviteProposalRecipientApproval {
    vendor_id: String,
    vendor_name: String,
    route: &'static str,
    recipient_email: String,
}

#[derive(Debug, Serialize)]
struct InviteProposalApprovalPreflightResponse {
    approved: bool,
    brief_id: String,
    revision: u32,
    recipients: Vec<InviteProposalRecipientApproval>,
}

#[derive(Debug, Deserialize)]
struct InviteProposalApproveAndSendRequest {
    wedding_plan_id: String,
    brief_id: String,
    revision: u32,
    category: String,
    location: Option<String>,
    draft_message_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
struct InviteProposalDeliveryResult {
    vendor_id: String,
    draft_message_id: String,
    status: &'static str,
    provider_message_id: Option<String>,
    client_message_id: String,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct InviteProposalApproveAndSendResponse {
    batch_id: String,
    status: &'static str,
    approval_fingerprint: String,
    deliveries: Vec<InviteProposalDeliveryResult>,
}

#[derive(Debug)]
struct ApprovedDraft {
    draft_message_id: String,
    vendor_id: String,
    recipient_email: String,
    subject: String,
    text: String,
}

#[derive(Debug)]
struct VendorPolicyRecord {
    vendor_id: String,
    vendor_name: String,
    category: String,
    service_area: String,
    contact_email: Option<String>,
    status: String,
    claim_status: String,
    linked_agent_id: Option<String>,
    evidence: Value,
    caveat_labels: Vec<String>,
}

fn clean(value: &str) -> String {
    value.trim().to_string()
}

fn normalized(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn category_group(value: &str) -> String {
    let value = normalized(value);
    for (group, words) in [
        (
            "venue",
            [
                "venue",
                "venues",
                "reception",
                "function room",
                "event space",
            ]
            .as_slice(),
        ),
        (
            "photo_video",
            [
                "photographer",
                "photography",
                "photo",
                "videographer",
                "videography",
            ]
            .as_slice(),
        ),
        ("celebrant", ["celebrant", "officiant"].as_slice()),
        (
            "flowers_decor",
            ["florist", "floral", "flower", "decor", "styling"].as_slice(),
        ),
        (
            "catering",
            ["caterer", "catering", "food", "beverage"].as_slice(),
        ),
        (
            "entertainment",
            ["band", "music", "dj", "entertainment"].as_slice(),
        ),
        ("planner", ["planner", "coordinator"].as_slice()),
    ] {
        if words.iter().any(|word| value.contains(word)) {
            return group.to_string();
        }
    }
    value
}

fn place_group(value: &str) -> Option<&'static str> {
    let value = format!(" {} ", normalized(value));
    [
        (
            "nsw",
            [
                " nsw ",
                " new south wales ",
                " sydney ",
                " newcastle ",
                " wollongong ",
                " blue mountains ",
                " central coast ",
                " hunter valley ",
            ]
            .as_slice(),
        ),
        (
            "vic",
            [" vic ", " victoria ", " melbourne ", " geelong "].as_slice(),
        ),
        (
            "qld",
            [
                " qld ",
                " queensland ",
                " brisbane ",
                " gold coast ",
                " sunshine coast ",
                " cairns ",
            ]
            .as_slice(),
        ),
        ("sa", [" sa ", " south australia ", " adelaide "].as_slice()),
        ("wa", [" wa ", " western australia ", " perth "].as_slice()),
        (
            "tas",
            [" tas ", " tasmania ", " hobart ", " launceston "].as_slice(),
        ),
        ("act", [" act ", " canberra "].as_slice()),
        (
            "nt",
            [" nt ", " northern territory ", " darwin "].as_slice(),
        ),
    ]
    .into_iter()
    .find_map(|(group, terms)| {
        terms
            .iter()
            .any(|term| value.contains(term))
            .then_some(group)
    })
}

fn location_compatible(service_area: &str, requested: Option<&str>) -> bool {
    let Some(requested) = requested.map(str::trim).filter(|value| !value.is_empty()) else {
        return true;
    };
    let area = normalized(service_area);
    let requested = normalized(requested);
    if area.is_empty()
        || area.contains("australia wide")
        || area.contains("nationwide")
        || area.contains("remote")
        || area.contains("online")
        || area.contains(&requested)
        || requested.contains(&area)
    {
        return true;
    }
    match (place_group(&area), place_group(&requested)) {
        (Some(left), Some(right)) => left == right,
        _ => true,
    }
}

fn evidence_flag(evidence: &Value, key: &str) -> bool {
    evidence.get(key).and_then(Value::as_bool) == Some(true)
}

fn opted_out(vendor: &VendorPolicyRecord) -> bool {
    evidence_flag(&vendor.evidence, "proposal_opt_out")
        || evidence_flag(&vendor.evidence, "contact_opt_out")
        || evidence_flag(&vendor.evidence, "do_not_contact")
        || vendor.caveat_labels.iter().any(|label| {
            let label = normalized(label);
            label.contains("do not contact")
                || ((label.contains("proposal") || label.contains("contact"))
                    && (label.contains("opt out") || label.contains("suppressed")))
        })
}

fn verified_email(vendor: &VendorPolicyRecord) -> bool {
    evidence_flag(&vendor.evidence, "contact_email_verified")
        || evidence_flag(&vendor.evidence, "email_verified")
}

fn valid_email(value: &str) -> bool {
    let value = value.trim();
    value.len() <= 320
        && !value.contains(['\r', '\n', ' ', '<', '>'])
        && value.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        })
}

fn digest(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn bounded_error(value: &str) -> String {
    value.chars().take(400).collect()
}

fn draft_value<'a>(payload: &'a Value, key: &str) -> Option<&'a str> {
    payload
        .get("content")
        .and_then(Value::as_object)
        .and_then(|content| content.get(key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn approved_draft_from_payload(
    draft_message_id: &str,
    wedding_plan_id: &str,
    payload: &Value,
) -> Result<ApprovedDraft, (StatusCode, String)> {
    let kind = payload
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let subtype = payload
        .get("subtype")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if kind != "wedding_vendor_outreach_draft" && subtype != "wedding_vendor_outreach_draft" {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "Only a saved Wedding vendor outreach draft can be approved.".to_string(),
        ));
    }
    if draft_value(payload, "wedding_plan_id") != Some(wedding_plan_id) {
        return Err((
            StatusCode::FORBIDDEN,
            "A draft belongs to a different wedding.".to_string(),
        ));
    }
    let vendor_id = draft_value(payload, "vendor_id").ok_or((
        StatusCode::UNPROCESSABLE_ENTITY,
        "A selected draft is missing its vendor reference.".to_string(),
    ))?;
    let recipient_email = draft_value(payload, "to")
        .filter(|value| valid_email(value))
        .ok_or((
            StatusCode::UNPROCESSABLE_ENTITY,
            "A selected draft has no valid recipient.".to_string(),
        ))?;
    let subject = draft_value(payload, "subject").ok_or((
        StatusCode::UNPROCESSABLE_ENTITY,
        "A selected draft has no subject.".to_string(),
    ))?;
    let text = draft_value(payload, "text").ok_or((
        StatusCode::UNPROCESSABLE_ENTITY,
        "A selected draft has no message.".to_string(),
    ))?;
    if subject.len() > 300 || text.len() > 20_000 {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            "A selected invitation is too large to send.".to_string(),
        ));
    }
    Ok(ApprovedDraft {
        draft_message_id: draft_message_id.to_string(),
        vendor_id: vendor_id.to_string(),
        recipient_email: recipient_email.to_ascii_lowercase(),
        subject: subject.to_string(),
        text: text.to_string(),
    })
}

fn approval_fingerprint(
    request: &InviteProposalApproveAndSendRequest,
    drafts: &[ApprovedDraft],
) -> String {
    let mut rows = drafts
        .iter()
        .map(|draft| {
            serde_json::json!({
                "draft_message_id": draft.draft_message_id,
                "vendor_id": draft.vendor_id,
                "recipient_digest": digest(&draft.recipient_email),
                "subject": draft.subject,
                "text": draft.text,
            })
        })
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| left["vendor_id"].as_str().cmp(&right["vendor_id"].as_str()));
    digest(
        &serde_json::json!({
            "wedding_plan_id": request.wedding_plan_id.trim(),
            "brief_id": request.brief_id.trim(),
            "revision": request.revision,
            "category": request.category.trim(),
            "location": request.location.as_deref().map(str::trim),
            "drafts": rows,
        })
        .to_string(),
    )
}

fn stable_client_message_id(batch_id: &str, vendor_id: &str) -> String {
    format!(
        "invite-proposal-{}",
        &digest(&format!("{batch_id}:{vendor_id}"))[..32]
    )
}

fn rollout_allowed(email: &str) -> bool {
    if std::env::var("OMNYID_WEDDING_INVITE_PROPOSALS_ENABLED").as_deref() != Ok("true") {
        return false;
    }
    std::env::var("OMNYID_WEDDING_INVITE_PROPOSALS_ALLOWLIST")
        .unwrap_or_default()
        .split(',')
        .map(|value| value.trim().to_ascii_lowercase())
        .any(|value| !value.is_empty() && value == email.trim().to_ascii_lowercase())
}

fn policy_route(
    vendor: &VendorPolicyRecord,
    requested_category: &str,
    requested_location: Option<&str>,
) -> Result<(&'static str, String), String> {
    if vendor.status != "active" {
        return Err("This listing is not active.".to_string());
    }
    if vendor.claim_status == "disputed" {
        return Err("This listing's ownership is under review.".to_string());
    }
    if opted_out(vendor) {
        return Err("This business does not accept proposal invitations.".to_string());
    }
    if category_group(&vendor.category) != category_group(requested_category) {
        return Err(format!(
            "{} is listed in a different vendor category.",
            vendor.vendor_name
        ));
    }
    if !location_compatible(&vendor.service_area, requested_location) {
        return Err(format!(
            "{} is outside the requested service area.",
            vendor.vendor_name
        ));
    }
    let email = vendor
        .contact_email
        .as_deref()
        .map(str::trim)
        .filter(|email| valid_email(email))
        .ok_or_else(|| {
            format!(
                "{} has no supported private delivery address.",
                vendor.vendor_name
            )
        })?;
    let route = if vendor.claim_status == "verified" && vendor.linked_agent_id.is_some() {
        "authenticated_vendor"
    } else if verified_email(vendor) {
        "verified_email"
    } else {
        "unclaimed_referral"
    };
    Ok((route, email.to_ascii_lowercase()))
}

async fn invite_proposal_approval_preflight_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<InviteProposalApprovalPreflightRequest>,
) -> Result<Json<InviteProposalApprovalPreflightResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if !rollout_allowed(&user.email) {
        return Err((StatusCode::FORBIDDEN, "Invite Proposals sending is available only in the reviewed pilot. Your private draft is unchanged.".to_string()));
    }
    let wedding_plan_id = clean(&request.wedding_plan_id);
    let brief_id = clean(&request.brief_id);
    let category = clean(&request.category);
    if wedding_plan_id.is_empty()
        || brief_id.is_empty()
        || category.is_empty()
        || [wedding_plan_id.len(), brief_id.len(), category.len()]
            .into_iter()
            .any(|length| length > MAX_FIELD_CHARS)
        || request.revision == 0
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "A bounded wedding, brief, revision and vendor category are required.".to_string(),
        ));
    }
    let vendor_ids = request
        .vendor_ids
        .iter()
        .map(|value| clean(value))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let unique = vendor_ids.iter().cloned().collect::<HashSet<_>>();
    if vendor_ids.is_empty()
        || vendor_ids.len() > MAX_RECIPIENTS
        || unique.len() != vendor_ids.len()
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose between one and five different vendors.".to_string(),
        ));
    }
    let owns_plan = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM wedding_user_onboarding_state WHERE user_id=$1 AND wedding_plan_id=$2)",
    )
    .bind(&user.id).bind(&wedding_plan_id).fetch_one(&state.db.pool).await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Wedding ownership could not be checked.".to_string()))?;
    if !owns_plan {
        return Err((
            StatusCode::FORBIDDEN,
            "This proposal brief does not belong to this account's wedding.".to_string(),
        ));
    }
    let rows = sqlx::query(
        r#"SELECT v.vendor_id,v.vendor_name,v.category,v.service_area,v.contact_email,v.status,v.claim_status,
                  link.agent_id AS linked_agent_id,v.evidence,v.caveat_labels
             FROM wedding_vendors v LEFT JOIN wedding_vendor_agent_links link ON link.vendor_id=v.vendor_id
            WHERE v.vendor_id=ANY($1)"#,
    )
    .bind(&vendor_ids).fetch_all(&state.db.pool).await
    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Vendor eligibility could not be checked.".to_string()))?;
    if rows.len() != vendor_ids.len() {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "One or more selected vendors are no longer available.".to_string(),
        ));
    }
    let vendors = rows
        .into_iter()
        .map(|row| VendorPolicyRecord {
            vendor_id: row.get("vendor_id"),
            vendor_name: row.get("vendor_name"),
            category: row.get("category"),
            service_area: row.get("service_area"),
            contact_email: row.get("contact_email"),
            status: row.get("status"),
            claim_status: row.get("claim_status"),
            linked_agent_id: row.get("linked_agent_id"),
            evidence: row.get("evidence"),
            caveat_labels: row.get("caveat_labels"),
        })
        .collect::<Vec<_>>();
    let mut recipients = Vec::with_capacity(vendors.len());
    for vendor_id in &vendor_ids {
        let vendor = vendors
            .iter()
            .find(|vendor| &vendor.vendor_id == vendor_id)
            .expect("selected vendor row");
        let (route, recipient_email) = policy_route(vendor, &category, request.location.as_deref())
            .map_err(|message| (StatusCode::UNPROCESSABLE_ENTITY, message))?;
        if cloudflare_recipient_is_suppressed(&state.db, &recipient_email)
            .await
            .unwrap_or(true)
        {
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("{} cannot receive email right now.", vendor.vendor_name),
            ));
        }
        recipients.push(InviteProposalRecipientApproval {
            vendor_id: vendor.vendor_id.clone(),
            vendor_name: vendor.vendor_name.clone(),
            route,
            recipient_email,
        });
    }
    Ok(Json(InviteProposalApprovalPreflightResponse {
        approved: true,
        brief_id,
        revision: request.revision,
        recipients,
    }))
}

async fn enforce_approval_rate_limits(
    state: &AppState,
    owner_user_id: &str,
    wedding_plan_id: &str,
    recipients: &[InviteProposalRecipientApproval],
) -> Result<(), (StatusCode, String)> {
    let owner_scope = digest(&format!("{owner_user_id}:{wedding_plan_id}"));
    enforce_rate_limit(
        &state,
        format!("invite-proposal:wedding:{owner_scope}"),
        RateLimitPolicy {
            max_requests: 4,
            window: Duration::from_secs(86_400),
        },
    )
    .await?;
    for recipient in recipients {
        let vendor_scope = digest(&format!("{owner_user_id}:{}", recipient.vendor_id));
        let destination_scope = digest(&format!("{owner_user_id}:{}", recipient.recipient_email));
        enforce_rate_limit(
            &state,
            format!("invite-proposal:vendor:{vendor_scope}"),
            RateLimitPolicy {
                max_requests: 2,
                window: Duration::from_secs(30 * 86_400),
            },
        )
        .await?;
        enforce_rate_limit(
            &state,
            format!("invite-proposal:destination:{destination_scope}"),
            RateLimitPolicy {
                max_requests: 2,
                window: Duration::from_secs(30 * 86_400),
            },
        )
        .await?;
    }
    Ok(())
}

async fn invite_proposal_approve_and_send_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<InviteProposalApproveAndSendRequest>,
) -> Result<Json<InviteProposalApproveAndSendResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    if request.draft_message_ids.is_empty() || request.draft_message_ids.len() > MAX_RECIPIENTS {
        return Err((
            StatusCode::BAD_REQUEST,
            "Choose between one and five saved invitation drafts.".to_string(),
        ));
    }
    let unique_drafts = request
        .draft_message_ids
        .iter()
        .map(|value| clean(value))
        .collect::<HashSet<_>>();
    if unique_drafts.len() != request.draft_message_ids.len() || unique_drafts.contains("") {
        return Err((
            StatusCode::BAD_REQUEST,
            "Each invitation draft must be selected once.".to_string(),
        ));
    }
    let mut drafts = Vec::with_capacity(request.draft_message_ids.len());
    for draft_message_id in &request.draft_message_ids {
        let payload = state
            .db
            .get_private_message_payload(&user.id, draft_message_id)
            .await
            .map_err(|_| {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "The saved invitation could not be loaded.".to_string(),
                )
            })?
            .ok_or((
                StatusCode::NOT_FOUND,
                "A saved invitation was not found in this account.".to_string(),
            ))?;
        drafts.push(approved_draft_from_payload(
            draft_message_id,
            request.wedding_plan_id.trim(),
            &payload,
        )?);
    }
    let preflight = invite_proposal_approval_preflight_http(
        State(state.clone()),
        headers,
        Json(InviteProposalApprovalPreflightRequest {
            wedding_plan_id: request.wedding_plan_id.clone(),
            brief_id: request.brief_id.clone(),
            revision: request.revision,
            category: request.category.clone(),
            location: request.location.clone(),
            vendor_ids: drafts.iter().map(|draft| draft.vendor_id.clone()).collect(),
        }),
    )
    .await?
    .0;
    for draft in &drafts {
        let recipient = preflight
            .recipients
            .iter()
            .find(|recipient| recipient.vendor_id == draft.vendor_id)
            .ok_or((
                StatusCode::UNPROCESSABLE_ENTITY,
                "A selected vendor did not pass the approval check.".to_string(),
            ))?;
        if recipient.recipient_email != draft.recipient_email {
            return Err((
                StatusCode::CONFLICT,
                format!(
                    "{}'s verified address changed. Refresh and review the invitation again.",
                    recipient.vendor_name
                ),
            ));
        }
    }
    let fingerprint = approval_fingerprint(&request, &drafts);
    let existing_batch = sqlx::query(
        "SELECT batch_id,status FROM wedding_invite_proposal_batches WHERE owner_user_id=$1 AND approval_fingerprint=$2",
    ).bind(&user.id).bind(&fingerprint).fetch_optional(&state.db.pool).await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The approval record could not be checked.".to_string()))?;
    let batch_id = existing_batch
        .as_ref()
        .map(|row| row.get::<String, _>("batch_id"))
        .unwrap_or_else(|| format!("proposal-batch-{}", ulid::Ulid::new()));
    if existing_batch.is_none() {
        // A preview never spends quota, and an exact retry reuses the original
        // approval receipt. Limits are charged only for the first transition
        // of this exact content-and-recipient fingerprint.
        enforce_approval_rate_limits(
            &state,
            &user.id,
            request.wedding_plan_id.trim(),
            &preflight.recipients,
        )
        .await?;
        sqlx::query(
            "INSERT INTO wedding_invite_proposal_batches (batch_id,owner_user_id,wedding_plan_id,brief_id,revision,approval_fingerprint) VALUES ($1,$2,$3,$4,$5,$6)",
        ).bind(&batch_id).bind(&user.id).bind(request.wedding_plan_id.trim()).bind(request.brief_id.trim())
            .bind(i32::try_from(request.revision).unwrap_or(i32::MAX)).bind(&fingerprint).execute(&state.db.pool).await
            .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The batch approval could not be saved.".to_string()))?;
    }
    for draft in &drafts {
        let route = preflight
            .recipients
            .iter()
            .find(|recipient| recipient.vendor_id == draft.vendor_id)
            .map(|recipient| recipient.route)
            .unwrap_or("unclaimed_referral");
        let client_message_id = stable_client_message_id(&batch_id, &draft.vendor_id);
        sqlx::query(
            r#"INSERT INTO wedding_invite_proposal_deliveries
               (batch_id,owner_user_id,vendor_id,destination_digest,draft_message_id,client_message_id,route)
               VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (batch_id,vendor_id) DO NOTHING"#,
        ).bind(&batch_id).bind(&user.id).bind(&draft.vendor_id).bind(digest(&draft.recipient_email))
            .bind(&draft.draft_message_id).bind(client_message_id).bind(route).execute(&state.db.pool).await
            .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The per-vendor approval receipt could not be saved.".to_string()))?;
    }
    sqlx::query("UPDATE wedding_invite_proposal_batches SET status='sending',updated_at=NOW() WHERE batch_id=$1 AND owner_user_id=$2 AND status<>'accepted'")
        .bind(&batch_id).bind(&user.id).execute(&state.db.pool).await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The approved batch could not start.".to_string()))?;
    let gmail_config = gmail_config_for_user(&state, &user.id).await?;
    let mut deliveries = Vec::with_capacity(drafts.len());
    for draft in &drafts {
        let row = sqlx::query(
            "SELECT status,client_message_id,provider_message_id FROM wedding_invite_proposal_deliveries WHERE batch_id=$1 AND owner_user_id=$2 AND vendor_id=$3",
        ).bind(&batch_id).bind(&user.id).bind(&draft.vendor_id).fetch_one(&state.db.pool).await
            .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The delivery receipt could not be loaded.".to_string()))?;
        let status: String = row.get("status");
        let client_message_id: String = row.get("client_message_id");
        let provider_message_id: Option<String> = row.get("provider_message_id");
        if status == "accepted" {
            deliveries.push(InviteProposalDeliveryResult {
                vendor_id: draft.vendor_id.clone(),
                draft_message_id: draft.draft_message_id.clone(),
                status: "provider_accepted",
                provider_message_id,
                client_message_id,
                error: None,
            });
            continue;
        }
        let request = OutgoingEmailRequest {
            thread_id: String::new(),
            message_id: client_message_id.clone(),
            parent_id: Some(draft.draft_message_id.clone()),
            to: vec![draft.recipient_email.clone()],
            subject: draft.subject.clone(),
            body: draft.text.clone(),
            in_reply_to: None,
            references: vec![],
            attachments: vec![],
        };
        let reconciled = find_gmail_message_by_rfc822_message_id(
            &gmail_config,
            &outgoing_message_id_header(&request),
        )
        .await
        .map_err(|error| (StatusCode::BAD_GATEWAY, bounded_error(&error)))?;
        let provider_result = match reconciled {
            Some(message_id) => Ok(message_id),
            None => {
                let claimed = sqlx::query_scalar::<_, String>(
                    "UPDATE wedding_invite_proposal_deliveries SET status='sending',last_error=NULL,updated_at=NOW() WHERE batch_id=$1 AND owner_user_id=$2 AND vendor_id=$3 AND (status IN ('approved','failed') OR (status='sending' AND updated_at<NOW()-INTERVAL '5 minutes')) RETURNING vendor_id",
                ).bind(&batch_id).bind(&user.id).bind(&draft.vendor_id).fetch_optional(&state.db.pool).await
                    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The delivery could not be claimed.".to_string()))?;
                if claimed.is_none() {
                    deliveries.push(InviteProposalDeliveryResult {
                        vendor_id: draft.vendor_id.clone(),
                        draft_message_id: draft.draft_message_id.clone(),
                        status: "in_progress",
                        provider_message_id: None,
                        client_message_id,
                        error: None,
                    });
                    continue;
                }
                send_gmail_outgoing_request(&state, &user.id, &request).await
            }
        };
        match provider_result {
            Ok(provider_message_id) => {
                sqlx::query("UPDATE wedding_invite_proposal_deliveries SET status='accepted',provider_message_id=$4,last_error=NULL,updated_at=NOW() WHERE batch_id=$1 AND owner_user_id=$2 AND vendor_id=$3")
                    .bind(&batch_id).bind(&user.id).bind(&draft.vendor_id).bind(&provider_message_id).execute(&state.db.pool).await
                    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "Provider acceptance could not be recorded.".to_string()))?;
                deliveries.push(InviteProposalDeliveryResult {
                    vendor_id: draft.vendor_id.clone(),
                    draft_message_id: draft.draft_message_id.clone(),
                    status: "provider_accepted",
                    provider_message_id: Some(provider_message_id),
                    client_message_id,
                    error: None,
                });
            }
            Err((_, error)) => {
                let error = bounded_error(&error);
                sqlx::query("UPDATE wedding_invite_proposal_deliveries SET status='failed',last_error=$4,updated_at=NOW() WHERE batch_id=$1 AND owner_user_id=$2 AND vendor_id=$3")
                    .bind(&batch_id).bind(&user.id).bind(&draft.vendor_id).bind(&error).execute(&state.db.pool).await
                    .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The delivery failure could not be recorded.".to_string()))?;
                deliveries.push(InviteProposalDeliveryResult {
                    vendor_id: draft.vendor_id.clone(),
                    draft_message_id: draft.draft_message_id.clone(),
                    status: "failed",
                    provider_message_id: None,
                    client_message_id,
                    error: Some(error),
                });
            }
        }
    }
    let accepted = deliveries
        .iter()
        .filter(|delivery| delivery.status == "provider_accepted")
        .count();
    let status = if accepted == deliveries.len() {
        "accepted"
    } else if accepted > 0 {
        "partial"
    } else {
        "failed"
    };
    sqlx::query("UPDATE wedding_invite_proposal_batches SET status=$3,updated_at=NOW() WHERE batch_id=$1 AND owner_user_id=$2")
        .bind(&batch_id).bind(&user.id).bind(status).execute(&state.db.pool).await
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "The batch outcome could not be recorded.".to_string()))?;
    Ok(Json(InviteProposalApproveAndSendResponse {
        batch_id,
        status,
        approval_fingerprint: fingerprint,
        deliveries,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vendor() -> VendorPolicyRecord {
        VendorPolicyRecord {
            vendor_id: "venue-1".into(),
            vendor_name: "Harbour Garden".into(),
            category: "Wedding venue".into(),
            service_area: "Sydney NSW".into(),
            contact_email: Some("hello@example.com".into()),
            status: "active".into(),
            claim_status: "unclaimed".into(),
            linked_agent_id: None,
            evidence: serde_json::json!({}),
            caveat_labels: vec![],
        }
    }

    #[test]
    fn category_and_location_policy_fail_closed() {
        let mut record = vendor();
        assert_eq!(
            policy_route(&record, "venues", Some("Sydney NSW"))
                .unwrap()
                .0,
            "unclaimed_referral"
        );
        assert!(policy_route(&record, "photographers", Some("Sydney NSW")).is_err());
        assert!(policy_route(&record, "venues", Some("Melbourne VIC")).is_err());
        record.evidence = serde_json::json!({"proposal_opt_out": true});
        assert!(policy_route(&record, "venues", Some("Sydney NSW")).is_err());
    }

    #[test]
    fn route_uses_claim_and_verified_email_evidence() {
        let mut record = vendor();
        record.evidence = serde_json::json!({"contact_email_verified": true});
        assert_eq!(
            policy_route(&record, "venue", None).unwrap().0,
            "verified_email"
        );
        record.claim_status = "verified".into();
        record.linked_agent_id = Some("agent-vendor".into());
        assert_eq!(
            policy_route(&record, "venue", None).unwrap().0,
            "authenticated_vendor"
        );
    }

    #[test]
    fn approved_draft_requires_matching_wedding_and_vendor_reference() {
        let payload = serde_json::json!({
            "kind": "wedding_vendor_outreach_draft",
            "content": {
                "wedding_plan_id": "plan-1",
                "vendor_id": "venue-1",
                "to": "hello@example.com",
                "subject": "Proposal request",
                "text": "Please share a proposal."
            }
        });
        let draft = approved_draft_from_payload("draft-1", "plan-1", &payload).unwrap();
        assert_eq!(draft.vendor_id, "venue-1");
        assert!(approved_draft_from_payload("draft-1", "plan-2", &payload).is_err());
        let mut missing_vendor = payload;
        missing_vendor["content"]
            .as_object_mut()
            .unwrap()
            .remove("vendor_id");
        assert!(approved_draft_from_payload("draft-1", "plan-1", &missing_vendor).is_err());
    }

    #[test]
    fn approval_fingerprint_changes_with_exact_message_content() {
        let request = InviteProposalApproveAndSendRequest {
            wedding_plan_id: "plan-1".into(),
            brief_id: "brief-1".into(),
            revision: 1,
            category: "venues".into(),
            location: Some("Sydney NSW".into()),
            draft_message_ids: vec!["draft-1".into()],
        };
        let draft = ApprovedDraft {
            draft_message_id: "draft-1".into(),
            vendor_id: "venue-1".into(),
            recipient_email: "hello@example.com".into(),
            subject: "Proposal request".into(),
            text: "First exact message".into(),
        };
        let first = approval_fingerprint(&request, &[draft]);
        let changed = ApprovedDraft {
            draft_message_id: "draft-1".into(),
            vendor_id: "venue-1".into(),
            recipient_email: "hello@example.com".into(),
            subject: "Proposal request".into(),
            text: "Changed exact message".into(),
        };
        assert_ne!(first, approval_fingerprint(&request, &[changed]));
    }
}
