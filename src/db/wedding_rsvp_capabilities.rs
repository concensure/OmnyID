use super::{Db, tenant_schema_name};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug)]
pub struct WeddingRsvpCapabilityGrantCreate {
    pub actor_user_id: String,
    pub grant_id: String,
    pub wedding_plan_id: String,
    pub response_workspace_id: String,
    pub household_id: String,
    pub invitation_ids: Vec<String>,
    pub token_digest: String,
    pub expires_at: DateTime<Utc>,
    pub request_contact_details: bool,
    pub loom_video_url: Option<String>,
}

#[derive(Clone, Debug)]
pub struct WeddingRsvpCapabilityGrantRotation {
    pub actor_user_id: String,
    pub source_grant_id: String,
    pub grant_id: String,
    pub token_digest: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRsvpCapabilityGrantSummary {
    pub grant_id: String,
    pub wedding_plan_id: String,
    pub response_workspace_id: String,
    pub household_id: String,
    pub invitation_ids: Vec<String>,
    pub expires_at: String,
    pub revoked_at: Option<String>,
    pub replaced_by_grant_id: Option<String>,
    pub open_count: i64,
    pub last_opened_at: Option<String>,
    pub created_at: String,
    pub request_contact_details: bool,
    pub loom_video_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRsvpCapabilityInvitation {
    pub invitation_id: String,
    pub person_id: String,
    pub event_id: String,
    pub display_name: String,
    pub invitation_status: String,
    pub response_revision: i64,
    pub plus_one_allowed: bool,
    pub children_invited: bool,
    pub age_band: String,
    pub guest_role: String,
    pub companion_to_person_id: Option<String>,
    pub name_pending: bool,
    pub seat_requirement: String,
    pub meal_requirement: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRsvpCapabilityQuestion {
    pub id: String,
    pub label: String,
    pub required: bool,
    pub sensitive: bool,
    pub prompt: Option<String>,
    pub options: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRsvpCapabilityLatestResponse {
    pub invitation_id: String,
    pub person_id: String,
    pub event_id: String,
    pub attendance: String,
    pub answers: HashMap<String, String>,
    pub private_answer_question_ids: Vec<String>,
    pub has_private_answers: bool,
    pub revision: i64,
    pub submitted_at: String,
    pub complete: bool,
    pub locked_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRsvpCapabilityScope {
    pub capability_id: String,
    pub household_id: String,
    pub host_label: String,
    pub event_id: String,
    pub event_label: String,
    pub response_deadline: String,
    pub event_date: Option<String>,
    pub event_local_time: Option<String>,
    pub event_time_zone: Option<String>,
    pub venue_name: Option<String>,
    pub venue_address: Option<String>,
    pub encryption_key_id: String,
    pub encryption_public_key_hex: String,
    pub questions: Vec<WeddingRsvpCapabilityQuestion>,
    pub expires_at: String,
    pub request_contact_details: bool,
    pub loom_video_url: Option<String>,
    pub invitations: Vec<WeddingRsvpCapabilityInvitation>,
    #[serde(default)]
    pub latest_responses: Vec<WeddingRsvpCapabilityLatestResponse>,
}

#[derive(Clone, Debug)]
pub struct WeddingRsvpCapabilitySubmissionAuthority {
    pub capability_id: String,
    pub owner_user_id: String,
    pub wedding_plan_id: String,
    pub response_workspace_id: String,
    pub request_contact_details: bool,
}

fn summary(row: &sqlx::postgres::PgRow) -> Result<WeddingRsvpCapabilityGrantSummary, sqlx::Error> {
    Ok(WeddingRsvpCapabilityGrantSummary {
        grant_id: row.try_get("grant_id")?,
        wedding_plan_id: row.try_get("wedding_plan_id")?,
        response_workspace_id: row.try_get("response_workspace_id")?,
        household_id: row.try_get("household_id")?,
        invitation_ids: serde_json::from_value(row.try_get::<Value, _>("invitation_ids")?)
            .unwrap_or_default(),
        expires_at: row.try_get("expires_at")?,
        revoked_at: row.try_get("revoked_at")?,
        replaced_by_grant_id: row.try_get("replaced_by_grant_id")?,
        open_count: row.try_get("open_count")?,
        last_opened_at: row.try_get("last_opened_at")?,
        created_at: row.try_get("created_at")?,
        request_contact_details: row.try_get("request_contact_details")?,
        loom_video_url: row.try_get("loom_video_url")?,
    })
}

fn grant_select(where_clause: &str) -> String {
    format!(
        "SELECT grant_id,wedding_plan_id,response_workspace_id,household_id,invitation_ids,expires_at::text,revoked_at::text,replaced_by_grant_id,open_count,last_opened_at::text,created_at::text,request_contact_details,loom_video_url FROM wedding_rsvp_capability_grants WHERE {where_clause}"
    )
}

fn metadata_scope(alias: &str, plan_parameter: usize, workspace_parameter: usize) -> String {
    format!(
        "COALESCE({alias}.metadata->>'weddingPlanId',{alias}.metadata->>'wedding_plan_id')=${plan_parameter} AND COALESCE({alias}.metadata->>'responseWorkspaceId',{alias}.metadata->>'response_workspace_id')=${workspace_parameter}"
    )
}

#[allow(clippy::too_many_arguments)]
async fn insert_lifecycle_event(
    tx: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    actor_user_id: Option<&str>,
    grant_id: &str,
    wedding_plan_id: &str,
    response_workspace_id: &str,
    household_id: &str,
    invitation_ids: &[String],
    event: &str,
    event_id: &str,
    detail: Value,
) -> Result<(), sqlx::Error> {
    let table = format!("\"{}\".messages", tenant_schema_name(owner_user_id));
    let kind = format!("wedding_rsvp_capability_{event}");
    let content = json!({
        "kind": kind,
        "contract_version": 1,
        "capability_id": grant_id,
        "owner_user_id": owner_user_id,
        "actor_user_id": actor_user_id,
        "wedding_plan_id": wedding_plan_id,
        "response_workspace_id": response_workspace_id,
        "household_id": household_id,
        "invitation_ids": invitation_ids,
        "detail": detail,
    });
    let query = format!(
        "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,store_in_relational,metadata) VALUES ($1,$2,'omnyid://wedding/rsvp-capability','[\"agent://wedding\"]'::jsonb,NOW(),$3,$4,$4,$5,'server:wedding-rsvp-capability:v1',TRUE,$6) ON CONFLICT(id) DO NOTHING"
    );
    sqlx::query(&query)
        .bind(event_id)
        .bind(format!("wedding_rsvp_capability:{response_workspace_id}"))
        .bind("ledger")
        .bind(&kind)
        .bind(content)
        .bind(json!({
            "origin": "wedding_rsvp_capability",
            "weddingPlanId": wedding_plan_id,
            "responseWorkspaceId": response_workspace_id,
            "capabilityId": grant_id,
            "ownerUserId": owner_user_id,
            "actorUserId": actor_user_id,
        }))
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn invitation_scope(
    tx: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    wedding_plan_id: &str,
    response_workspace_id: &str,
    household_id: &str,
    invitation_ids: &[String],
) -> Result<Option<Vec<WeddingRsvpCapabilityInvitation>>, sqlx::Error> {
    if invitation_ids.is_empty()
        || invitation_ids.len() > 100
        || invitation_ids.iter().collect::<HashSet<_>>().len() != invitation_ids.len()
    {
        return Ok(None);
    }
    let table = format!("\"{}\".messages", tenant_schema_name(owner_user_id));
    let invitation_query = format!(
        "SELECT DISTINCT ON (m.content->>'invitation_id') m.content FROM {table} m WHERE m.kind='wedding_boundary_event_invitation' AND m.content->>'invitation_id'=ANY($1) AND {} ORDER BY m.content->>'invitation_id',m.timestamp DESC,m.id DESC",
        metadata_scope("m", 2, 3)
    );
    let values = sqlx::query_scalar::<_, Value>(&invitation_query)
        .bind(invitation_ids)
        .bind(wedding_plan_id)
        .bind(response_workspace_id)
        .fetch_all(&mut **tx)
        .await?;
    if values.len() != invitation_ids.len() {
        return Ok(None);
    }
    let values = values
        .into_iter()
        .filter_map(|value| {
            let invitation_id = value
                .get("invitation_id")
                .and_then(Value::as_str)
                .map(str::to_string)?;
            Some((invitation_id, value))
        })
        .collect::<HashMap<_, _>>();
    let profile_query = format!(
        "SELECT p.content FROM {table} p WHERE p.kind='wedding_boundary_guest_profile' AND p.content->>'person_id'=$1 AND {} ORDER BY p.timestamp DESC,p.id DESC LIMIT 1",
        metadata_scope("p", 2, 3)
    );
    let mut projected = Vec::with_capacity(invitation_ids.len());
    for invitation_id in invitation_ids {
        let Some(invitation) = values.get(invitation_id) else {
            return Ok(None);
        };
        if invitation.get("visible_to_guest").and_then(Value::as_bool) == Some(false) {
            return Ok(None);
        }
        let person_id = invitation
            .get("person_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let event_id = invitation
            .get("event_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if person_id.is_empty() || event_id.is_empty() {
            return Ok(None);
        }
        let Some(profile) = sqlx::query_scalar::<_, Value>(&profile_query)
            .bind(person_id)
            .bind(wedding_plan_id)
            .bind(response_workspace_id)
            .fetch_optional(&mut **tx)
            .await?
        else {
            return Ok(None);
        };
        if profile.get("household_id").and_then(Value::as_str) != Some(household_id) {
            return Ok(None);
        }
        let display_name = profile
            .get("display_name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        if display_name.is_empty() || display_name.chars().count() > 160 {
            return Ok(None);
        }
        projected.push(WeddingRsvpCapabilityInvitation {
            invitation_id: invitation_id.clone(),
            person_id: person_id.to_string(),
            event_id: event_id.to_string(),
            display_name: display_name.to_string(),
            invitation_status: invitation
                .get("invitation_status")
                .and_then(Value::as_str)
                .unwrap_or("invited")
                .to_string(),
            response_revision: invitation
                .get("response_revision")
                .and_then(Value::as_i64)
                .unwrap_or(1),
            plus_one_allowed: invitation
                .get("plus_one_allowed")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            children_invited: invitation
                .get("children_invited")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            age_band: profile
                .get("age_band")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string(),
            guest_role: invitation
                .get("guest_role")
                .and_then(Value::as_str)
                .unwrap_or("primary")
                .to_string(),
            companion_to_person_id: invitation
                .get("companion_to_person_id")
                .and_then(Value::as_str)
                .map(str::to_string),
            name_pending: invitation
                .get("name_pending")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            seat_requirement: invitation
                .get("seat_requirement")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string(),
            meal_requirement: invitation
                .get("meal_requirement")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string(),
        });
    }
    Ok(Some(projected))
}

fn question_contract(id: &str) -> Option<(&'static str, bool)> {
    match id {
        "attendance" => Some(("Attendance", false)),
        "meal_choice" => Some(("Meal choice", false)),
        "dietary_requirements" => Some(("Dietary or allergy requirements", true)),
        "accessibility_requirements" => Some(("Accessibility requirements", true)),
        "travel_plan" => Some(("Travel or transport plan", true)),
        "accommodation" => Some(("Accommodation needs", true)),
        "custom_text" => Some(("One custom question", true)),
        _ => None,
    }
}

async fn setup_scope(
    tx: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    wedding_plan_id: &str,
    response_workspace_id: &str,
    event_id: &str,
) -> Result<
    Option<(
        String,
        String,
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Vec<WeddingRsvpCapabilityQuestion>,
    )>,
    sqlx::Error,
> {
    let table = format!("\"{}\".messages", tenant_schema_name(owner_user_id));
    let query = format!(
        "SELECT m.content FROM {table} m WHERE m.kind='wedding_rsvp_setup' AND m.content->>'event_id'=$1 AND {} ORDER BY (m.content->>'revision')::bigint DESC,m.timestamp DESC,m.id DESC LIMIT 1",
        metadata_scope("m", 2, 3)
    );
    let Some(content) = sqlx::query_scalar::<_, Value>(&query)
        .bind(event_id)
        .bind(wedding_plan_id)
        .bind(response_workspace_id)
        .fetch_optional(&mut **tx)
        .await?
    else {
        return Ok(None);
    };
    let host_label = content
        .get("host_label")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let event_label = content
        .get("event_label")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let response_deadline = content
        .get("response_deadline")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let encryption_key_id = content
        .get("encryption_key_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let encryption_public_key_hex = content
        .get("encryption_public_key_hex")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if host_label.is_empty()
        || host_label.chars().count() > 120
        || event_label.is_empty()
        || event_label.chars().count() > 120
        || response_deadline.len() != 10
        || encryption_key_id.is_empty()
        || encryption_key_id.len() > 180
        || encryption_public_key_hex.len() != 64
        || !encryption_public_key_hex
            .chars()
            .all(|value| value.is_ascii_hexdigit())
    {
        return Ok(None);
    }
    let Some(items) = content.get("questions").and_then(Value::as_array) else {
        return Ok(None);
    };
    let mut questions = Vec::new();
    let mut seen = HashSet::new();
    for item in items {
        let id = item.get("id").and_then(Value::as_str).unwrap_or("");
        let Some((label, sensitive)) = question_contract(id) else {
            return Ok(None);
        };
        if !seen.insert(id) || item.get("enabled").and_then(Value::as_bool) != Some(true) {
            return Ok(None);
        }
        let prompt = if id == "custom_text" {
            let value = item
                .get("prompt")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if value.is_empty() || value.chars().count() > 160 {
                return Ok(None);
            }
            Some(value.to_string())
        } else {
            None
        };
        let options = if id == "meal_choice" {
            let values = item
                .get("options")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|value| {
                    value
                        .as_str()
                        .map(str::trim)
                        .filter(|value| !value.is_empty() && value.chars().count() <= 80)
                        .map(str::to_string)
                })
                .collect::<Vec<_>>();
            if values.len() < 2 || values.len() > 8 {
                return Ok(None);
            }
            values
        } else {
            Vec::new()
        };
        questions.push(WeddingRsvpCapabilityQuestion {
            id: id.to_string(),
            label: label.to_string(),
            required: id == "attendance"
                || item.get("required").and_then(Value::as_bool) == Some(true),
            sensitive,
            prompt,
            options,
        });
    }
    if !seen.contains("attendance") {
        return Ok(None);
    }
    Ok(Some((
        host_label.to_string(),
        event_label.to_string(),
        response_deadline.to_string(),
        encryption_key_id.to_string(),
        encryption_public_key_hex.to_ascii_lowercase(),
        content
            .get("event_date")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| value.len() == 10)
            .map(str::to_string),
        content
            .get("event_local_time")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| value.len() == 5)
            .map(str::to_string),
        content
            .get("event_time_zone")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty() && value.len() <= 80)
            .map(str::to_string),
        content
            .get("venue_name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty() && value.chars().count() <= 160)
            .map(str::to_string),
        content
            .get("venue_address")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty() && value.chars().count() <= 300)
            .map(str::to_string),
        questions,
    )))
}

async fn latest_response_scope(
    tx: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    wedding_plan_id: &str,
    response_workspace_id: &str,
    invitations: &[WeddingRsvpCapabilityInvitation],
    questions: &[WeddingRsvpCapabilityQuestion],
) -> Result<Vec<WeddingRsvpCapabilityLatestResponse>, sqlx::Error> {
    if invitations.is_empty() {
        return Ok(Vec::new());
    }
    let invitation_ids = invitations
        .iter()
        .map(|invitation| invitation.invitation_id.clone())
        .collect::<Vec<_>>();
    let table = format!("\"{}\".messages", tenant_schema_name(owner_user_id));
    let query = format!(
        "SELECT DISTINCT ON (m.content->>'invitation_id') m.content FROM {table} m WHERE m.kind='wedding_rsvp_response' AND m.content->>'invitation_id'=ANY($1) AND {} ORDER BY m.content->>'invitation_id',(m.content->>'revision')::bigint DESC,m.timestamp DESC,m.id DESC",
        metadata_scope("m", 2, 3)
    );
    let values = sqlx::query_scalar::<_, Value>(&query)
        .bind(&invitation_ids)
        .bind(wedding_plan_id)
        .bind(response_workspace_id)
        .fetch_all(&mut **tx)
        .await?;
    let values = values
        .into_iter()
        .filter_map(|value| {
            let invitation_id = value
                .get("invitation_id")
                .and_then(Value::as_str)
                .map(str::to_string)?;
            Some((invitation_id, value))
        })
        .collect::<HashMap<_, _>>();
    let question_by_id = questions
        .iter()
        .map(|question| (question.id.as_str(), question))
        .collect::<HashMap<_, _>>();
    let mut responses = Vec::new();
    for invitation in invitations {
        let Some(value) = values.get(&invitation.invitation_id) else {
            continue;
        };
        if value.get("person_id").and_then(Value::as_str) != Some(invitation.person_id.as_str())
            || value.get("event_id").and_then(Value::as_str) != Some(invitation.event_id.as_str())
        {
            continue;
        }
        let attendance = match value
            .get("attendance")
            .and_then(Value::as_str)
            .unwrap_or("pending")
        {
            "attending" => "attending",
            "not_attending" => "not_attending",
            _ => "pending",
        };
        let answers = value
            .get("answers")
            .and_then(Value::as_object)
            .into_iter()
            .flatten()
            .filter_map(|(id, answer)| {
                let question = question_by_id.get(id.as_str())?;
                if question.sensitive || id == "attendance" {
                    return None;
                }
                answer
                    .as_str()
                    .map(|answer| (id.clone(), answer.to_string()))
            })
            .collect::<HashMap<_, _>>();
        let mut private_answer_question_ids = value
            .get("private_answer_question_ids")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .filter(|id| {
                question_by_id
                    .get(*id)
                    .map(|question| question.sensitive)
                    .unwrap_or(false)
            })
            .map(str::to_string)
            .collect::<Vec<_>>();
        private_answer_question_ids.sort();
        private_answer_question_ids.dedup();
        let has_private_answers = value.get("has_private_answers").and_then(Value::as_bool)
            == Some(true)
            && !private_answer_question_ids.is_empty();
        if !has_private_answers {
            private_answer_question_ids.clear();
        }
        let complete = match attendance {
            "not_attending" => true,
            "attending" => questions
                .iter()
                .filter(|question| question.required)
                .all(|question| {
                    question.id == "attendance"
                        || if question.sensitive {
                            private_answer_question_ids.contains(&question.id)
                        } else {
                            answers
                                .get(&question.id)
                                .map(|answer| !answer.trim().is_empty())
                                .unwrap_or(false)
                        }
                }),
            _ => false,
        };
        responses.push(WeddingRsvpCapabilityLatestResponse {
            invitation_id: invitation.invitation_id.clone(),
            person_id: invitation.person_id.clone(),
            event_id: invitation.event_id.clone(),
            attendance: attendance.to_string(),
            answers,
            has_private_answers,
            private_answer_question_ids,
            revision: value.get("revision").and_then(Value::as_i64).unwrap_or(0),
            submitted_at: value
                .get("responded_at")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            complete,
            locked_at: value
                .get("locked_at")
                .and_then(Value::as_str)
                .map(str::to_string),
        });
    }
    Ok(responses)
}

impl Db {
    pub async fn wedding_rsvp_submission_authority(
        &self,
        token_digest: &str,
        invitation_id: &str,
    ) -> Result<Option<WeddingRsvpCapabilitySubmissionAuthority>, sqlx::Error> {
        let Some(row) = sqlx::query(
            "SELECT grant_id,owner_user_id,wedding_plan_id,response_workspace_id,invitation_ids,request_contact_details FROM wedding_rsvp_capability_grants WHERE token_digest=$1 AND revoked_at IS NULL AND expires_at>NOW()",
        )
        .bind(token_digest)
        .fetch_optional(&self.pool)
        .await?
        else {
            return Ok(None);
        };
        let invitation_ids = serde_json::from_value::<Vec<String>>(row.try_get("invitation_ids")?)
            .unwrap_or_default();
        if !invitation_ids.iter().any(|value| value == invitation_id) {
            return Ok(None);
        }
        Ok(Some(WeddingRsvpCapabilitySubmissionAuthority {
            capability_id: row.try_get("grant_id")?,
            owner_user_id: row.try_get("owner_user_id")?,
            wedding_plan_id: row.try_get("wedding_plan_id")?,
            response_workspace_id: row.try_get("response_workspace_id")?,
            request_contact_details: row.try_get("request_contact_details")?,
        }))
    }

    pub async fn create_wedding_rsvp_capability_grant(
        &self,
        owner_user_id: &str,
        input: WeddingRsvpCapabilityGrantCreate,
    ) -> Result<Option<WeddingRsvpCapabilityGrantSummary>, sqlx::Error> {
        self.ensure_user_private_schema(owner_user_id).await?;
        let mut tx = self.pool.begin().await?;
        let Some(invitations) = invitation_scope(
            &mut tx,
            owner_user_id,
            &input.wedding_plan_id,
            &input.response_workspace_id,
            &input.household_id,
            &input.invitation_ids,
        )
        .await?
        else {
            return Ok(None);
        };
        let event_ids = invitations
            .iter()
            .map(|value| value.event_id.as_str())
            .collect::<HashSet<_>>();
        if event_ids.len() != 1
            || setup_scope(
                &mut tx,
                owner_user_id,
                &input.wedding_plan_id,
                &input.response_workspace_id,
                invitations[0].event_id.as_str(),
            )
            .await?
            .is_none()
        {
            return Ok(None);
        }
        sqlx::query(
            "INSERT INTO wedding_rsvp_capability_grants (grant_id,owner_user_id,wedding_plan_id,response_workspace_id,household_id,invitation_ids,token_digest,expires_at,request_contact_details,loom_video_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        )
        .bind(&input.grant_id)
        .bind(owner_user_id)
        .bind(&input.wedding_plan_id)
        .bind(&input.response_workspace_id)
        .bind(&input.household_id)
        .bind(serde_json::to_value(&input.invitation_ids).unwrap_or(Value::Array(vec![])))
        .bind(&input.token_digest)
        .bind(input.expires_at)
        .bind(input.request_contact_details)
        .bind(input.loom_video_url)
        .execute(&mut *tx)
        .await?;
        let row = sqlx::query(&grant_select("grant_id=$1"))
            .bind(&input.grant_id)
            .fetch_one(&mut *tx)
            .await?;
        let result = summary(&row)?;
        insert_lifecycle_event(
            &mut tx,
            owner_user_id,
            Some(&input.actor_user_id),
            &result.grant_id,
            &result.wedding_plan_id,
            &result.response_workspace_id,
            &result.household_id,
            &result.invitation_ids,
            "granted",
            &format!("rsvp-capability-granted:{}", result.grant_id),
            json!({"expires_at": result.expires_at}),
        )
        .await?;
        tx.commit().await?;
        Ok(Some(result))
    }

    pub async fn list_wedding_rsvp_capability_grants(
        &self,
        owner_user_id: &str,
        response_workspace_id: &str,
    ) -> Result<Vec<WeddingRsvpCapabilityGrantSummary>, sqlx::Error> {
        let rows = sqlx::query(&format!(
            "{} ORDER BY created_at DESC,grant_id DESC",
            grant_select("owner_user_id=$1 AND response_workspace_id=$2")
        ))
        .bind(owner_user_id)
        .bind(response_workspace_id)
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(summary).collect()
    }

    pub async fn revoke_wedding_rsvp_capability_grant(
        &self,
        owner_user_id: &str,
        actor_user_id: &str,
        grant_id: &str,
    ) -> Result<Option<WeddingRsvpCapabilityGrantSummary>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let updated = sqlx::query(
            "UPDATE wedding_rsvp_capability_grants SET revoked_at=COALESCE(revoked_at,NOW()) WHERE grant_id=$1 AND owner_user_id=$2",
        )
        .bind(grant_id)
        .bind(owner_user_id)
        .execute(&mut *tx)
        .await?;
        if updated.rows_affected() == 0 {
            tx.rollback().await?;
            return Ok(None);
        }
        let row = sqlx::query(&grant_select("grant_id=$1 AND owner_user_id=$2"))
            .bind(grant_id)
            .bind(owner_user_id)
            .fetch_one(&mut *tx)
            .await?;
        let result = summary(&row)?;
        insert_lifecycle_event(
            &mut tx,
            owner_user_id,
            Some(actor_user_id),
            &result.grant_id,
            &result.wedding_plan_id,
            &result.response_workspace_id,
            &result.household_id,
            &result.invitation_ids,
            "revoked",
            &format!("rsvp-capability-revoked:{}", result.grant_id),
            json!({}),
        )
        .await?;
        tx.commit().await?;
        Ok(Some(result))
    }

    pub async fn rotate_wedding_rsvp_capability_grant(
        &self,
        owner_user_id: &str,
        input: WeddingRsvpCapabilityGrantRotation,
    ) -> Result<Option<WeddingRsvpCapabilityGrantSummary>, sqlx::Error> {
        self.ensure_user_private_schema(owner_user_id).await?;
        let mut tx = self.pool.begin().await?;
        let Some(source) = sqlx::query(
            "SELECT wedding_plan_id,response_workspace_id,household_id,invitation_ids,request_contact_details,loom_video_url FROM wedding_rsvp_capability_grants WHERE grant_id=$1 AND owner_user_id=$2 AND revoked_at IS NULL AND expires_at>NOW() FOR UPDATE",
        )
        .bind(&input.source_grant_id)
        .bind(owner_user_id)
        .fetch_optional(&mut *tx)
        .await?
        else {
            return Ok(None);
        };
        let wedding_plan_id: String = source.try_get("wedding_plan_id")?;
        let response_workspace_id: String = source.try_get("response_workspace_id")?;
        let household_id: String = source.try_get("household_id")?;
        let invitation_ids =
            serde_json::from_value::<Vec<String>>(source.try_get("invitation_ids")?)
                .unwrap_or_default();
        let request_contact_details: bool = source.try_get("request_contact_details")?;
        let loom_video_url: Option<String> = source.try_get("loom_video_url")?;
        if invitation_scope(
            &mut tx,
            owner_user_id,
            &wedding_plan_id,
            &response_workspace_id,
            &household_id,
            &invitation_ids,
        )
        .await?
        .is_none()
        {
            return Ok(None);
        }
        sqlx::query(
            "INSERT INTO wedding_rsvp_capability_grants (grant_id,owner_user_id,wedding_plan_id,response_workspace_id,household_id,invitation_ids,token_digest,expires_at,rotated_from_grant_id,request_contact_details,loom_video_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        )
        .bind(&input.grant_id)
        .bind(owner_user_id)
        .bind(&wedding_plan_id)
        .bind(&response_workspace_id)
        .bind(&household_id)
        .bind(serde_json::to_value(&invitation_ids).unwrap_or(Value::Array(vec![])))
        .bind(&input.token_digest)
        .bind(input.expires_at)
        .bind(&input.source_grant_id)
        .bind(request_contact_details)
        .bind(loom_video_url)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE wedding_rsvp_capability_grants SET revoked_at=NOW(),replaced_by_grant_id=$1 WHERE grant_id=$2 AND owner_user_id=$3",
        )
        .bind(&input.grant_id)
        .bind(&input.source_grant_id)
        .bind(owner_user_id)
        .execute(&mut *tx)
        .await?;
        let row = sqlx::query(&grant_select("grant_id=$1"))
            .bind(&input.grant_id)
            .fetch_one(&mut *tx)
            .await?;
        let result = summary(&row)?;
        insert_lifecycle_event(
            &mut tx,
            owner_user_id,
            Some(&input.actor_user_id),
            &result.grant_id,
            &result.wedding_plan_id,
            &result.response_workspace_id,
            &result.household_id,
            &result.invitation_ids,
            "regenerated",
            &format!("rsvp-capability-regenerated:{}", result.grant_id),
            json!({"replaces_capability_id": input.source_grant_id}),
        )
        .await?;
        tx.commit().await?;
        Ok(Some(result))
    }

    pub async fn wedding_rsvp_capability_owner(
        &self,
        token_digest: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT owner_user_id FROM wedding_rsvp_capability_grants WHERE token_digest=$1 AND revoked_at IS NULL AND expires_at>NOW()",
        )
        .bind(token_digest)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn open_wedding_rsvp_capability(
        &self,
        token_digest: &str,
    ) -> Result<Option<WeddingRsvpCapabilityScope>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let Some(row) = sqlx::query(
            "SELECT grant_id,owner_user_id,wedding_plan_id,response_workspace_id,household_id,invitation_ids,expires_at,request_contact_details,loom_video_url FROM wedding_rsvp_capability_grants WHERE token_digest=$1 FOR UPDATE",
        )
        .bind(token_digest)
        .fetch_optional(&mut *tx)
        .await?
        else {
            return Ok(None);
        };
        let grant_id: String = row.try_get("grant_id")?;
        let expires_at: DateTime<Utc> = row.try_get("expires_at")?;
        let unavailable: bool = sqlx::query_scalar(
            "SELECT revoked_at IS NOT NULL OR expires_at<=NOW() FROM wedding_rsvp_capability_grants WHERE grant_id=$1",
        )
        .bind(&grant_id)
        .fetch_one(&mut *tx)
        .await?;
        if unavailable {
            sqlx::query(
                "UPDATE wedding_rsvp_capability_grants SET expired_event_at=COALESCE(expired_event_at,NOW()) WHERE grant_id=$1 AND expires_at<=NOW()",
            )
            .bind(&grant_id)
            .execute(&mut *tx)
            .await?;
            if expires_at <= Utc::now() {
                let owner_user_id: String = row.try_get("owner_user_id")?;
                let wedding_plan_id: String = row.try_get("wedding_plan_id")?;
                let response_workspace_id: String = row.try_get("response_workspace_id")?;
                let household_id: String = row.try_get("household_id")?;
                let invitation_ids =
                    serde_json::from_value::<Vec<String>>(row.try_get("invitation_ids")?)
                        .unwrap_or_default();
                insert_lifecycle_event(
                    &mut tx,
                    &owner_user_id,
                    None,
                    &grant_id,
                    &wedding_plan_id,
                    &response_workspace_id,
                    &household_id,
                    &invitation_ids,
                    "expired",
                    &format!("rsvp-capability-expired:{grant_id}"),
                    json!({}),
                )
                .await?;
            }
            tx.commit().await?;
            return Ok(None);
        }
        let owner_user_id: String = row.try_get("owner_user_id")?;
        let wedding_plan_id: String = row.try_get("wedding_plan_id")?;
        let response_workspace_id: String = row.try_get("response_workspace_id")?;
        let household_id: String = row.try_get("household_id")?;
        let invitation_ids = serde_json::from_value::<Vec<String>>(row.try_get("invitation_ids")?)
            .unwrap_or_default();
        let request_contact_details: bool = row.try_get("request_contact_details")?;
        let loom_video_url: Option<String> = row.try_get("loom_video_url")?;
        let Some(invitations) = invitation_scope(
            &mut tx,
            &owner_user_id,
            &wedding_plan_id,
            &response_workspace_id,
            &household_id,
            &invitation_ids,
        )
        .await?
        else {
            return Ok(None);
        };
        let event_ids = invitations
            .iter()
            .map(|value| value.event_id.as_str())
            .collect::<HashSet<_>>();
        if event_ids.len() != 1 {
            return Ok(None);
        }
        let Some((
            host_label,
            event_label,
            response_deadline,
            encryption_key_id,
            encryption_public_key_hex,
            event_date,
            event_local_time,
            event_time_zone,
            venue_name,
            venue_address,
            questions,
        )) = setup_scope(
            &mut tx,
            &owner_user_id,
            &wedding_plan_id,
            &response_workspace_id,
            invitations[0].event_id.as_str(),
        )
        .await?
        else {
            return Ok(None);
        };
        let latest_responses = latest_response_scope(
            &mut tx,
            &owner_user_id,
            &wedding_plan_id,
            &response_workspace_id,
            &invitations,
            &questions,
        )
        .await?;
        let open_count: i64 = sqlx::query_scalar(
            "UPDATE wedding_rsvp_capability_grants SET open_count=open_count+1,last_opened_at=NOW() WHERE grant_id=$1 RETURNING open_count",
        )
        .bind(&grant_id)
        .fetch_one(&mut *tx)
        .await?;
        insert_lifecycle_event(
            &mut tx,
            &owner_user_id,
            None,
            &grant_id,
            &wedding_plan_id,
            &response_workspace_id,
            &household_id,
            &invitation_ids,
            "opened",
            &format!("rsvp-capability-opened:{grant_id}:{open_count}"),
            json!({"open_count": open_count}),
        )
        .await?;
        tx.commit().await?;
        Ok(Some(WeddingRsvpCapabilityScope {
            capability_id: grant_id,
            household_id,
            host_label,
            event_id: invitations[0].event_id.clone(),
            event_label,
            response_deadline,
            event_date,
            event_local_time,
            event_time_zone,
            venue_name,
            venue_address,
            encryption_key_id,
            encryption_public_key_hex,
            questions,
            expires_at: expires_at.to_rfc3339(),
            request_contact_details,
            loom_video_url,
            invitations,
            latest_responses,
        }))
    }
}
