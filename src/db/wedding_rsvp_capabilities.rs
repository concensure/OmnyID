use super::{Db, tenant_schema_name};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Postgres, Row, Transaction};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug)]
pub struct WeddingRsvpCapabilityGrantCreate {
    pub grant_id: String,
    pub wedding_plan_id: String,
    pub response_workspace_id: String,
    pub household_id: String,
    pub invitation_ids: Vec<String>,
    pub token_digest: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct WeddingRsvpCapabilityGrantRotation {
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
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct WeddingRsvpCapabilityScope {
    pub capability_id: String,
    pub household_id: String,
    pub expires_at: String,
    pub invitations: Vec<WeddingRsvpCapabilityInvitation>,
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
    })
}

fn grant_select(where_clause: &str) -> String {
    format!(
        "SELECT grant_id,wedding_plan_id,response_workspace_id,household_id,invitation_ids,expires_at::text,revoked_at::text,replaced_by_grant_id,open_count,last_opened_at::text,created_at::text FROM wedding_rsvp_capability_grants WHERE {where_clause}"
    )
}

fn metadata_scope(alias: &str, plan_parameter: usize, workspace_parameter: usize) -> String {
    format!(
        "COALESCE({alias}.metadata->>'weddingPlanId',{alias}.metadata->>'wedding_plan_id')=${plan_parameter} AND COALESCE({alias}.metadata->>'responseWorkspaceId',{alias}.metadata->>'response_workspace_id')=${workspace_parameter}"
    )
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
            value
                .get("invitation_id")
                .and_then(Value::as_str)
                .map(|id| (id.to_string(), value))
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
        });
    }
    Ok(Some(projected))
}

impl Db {
    pub async fn create_wedding_rsvp_capability_grant(
        &self,
        owner_user_id: &str,
        input: WeddingRsvpCapabilityGrantCreate,
    ) -> Result<Option<WeddingRsvpCapabilityGrantSummary>, sqlx::Error> {
        self.ensure_user_private_schema(owner_user_id).await?;
        let mut tx = self.pool.begin().await?;
        if invitation_scope(
            &mut tx,
            owner_user_id,
            &input.wedding_plan_id,
            &input.response_workspace_id,
            &input.household_id,
            &input.invitation_ids,
        )
        .await?
        .is_none()
        {
            return Ok(None);
        }
        sqlx::query(
            "INSERT INTO wedding_rsvp_capability_grants (grant_id,owner_user_id,wedding_plan_id,response_workspace_id,household_id,invitation_ids,token_digest,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        )
        .bind(&input.grant_id)
        .bind(owner_user_id)
        .bind(&input.wedding_plan_id)
        .bind(&input.response_workspace_id)
        .bind(&input.household_id)
        .bind(serde_json::to_value(&input.invitation_ids).unwrap_or(Value::Array(vec![])))
        .bind(&input.token_digest)
        .bind(input.expires_at)
        .execute(&mut *tx)
        .await?;
        let row = sqlx::query(&grant_select("grant_id=$1"))
            .bind(&input.grant_id)
            .fetch_one(&mut *tx)
            .await?;
        let result = summary(&row)?;
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
        grant_id: &str,
    ) -> Result<Option<WeddingRsvpCapabilityGrantSummary>, sqlx::Error> {
        sqlx::query(
            "UPDATE wedding_rsvp_capability_grants SET revoked_at=COALESCE(revoked_at,NOW()) WHERE grant_id=$1 AND owner_user_id=$2",
        )
        .bind(grant_id)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        let row = sqlx::query(&grant_select("grant_id=$1 AND owner_user_id=$2"))
            .bind(grant_id)
            .bind(owner_user_id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref().map(summary).transpose()
    }

    pub async fn rotate_wedding_rsvp_capability_grant(
        &self,
        owner_user_id: &str,
        input: WeddingRsvpCapabilityGrantRotation,
    ) -> Result<Option<WeddingRsvpCapabilityGrantSummary>, sqlx::Error> {
        self.ensure_user_private_schema(owner_user_id).await?;
        let mut tx = self.pool.begin().await?;
        let Some(source) = sqlx::query(
            "SELECT wedding_plan_id,response_workspace_id,household_id,invitation_ids FROM wedding_rsvp_capability_grants WHERE grant_id=$1 AND owner_user_id=$2 AND revoked_at IS NULL AND expires_at>NOW() FOR UPDATE",
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
            "INSERT INTO wedding_rsvp_capability_grants (grant_id,owner_user_id,wedding_plan_id,response_workspace_id,household_id,invitation_ids,token_digest,expires_at,rotated_from_grant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
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
        tx.commit().await?;
        Ok(Some(result))
    }

    pub async fn open_wedding_rsvp_capability(
        &self,
        token_digest: &str,
    ) -> Result<Option<WeddingRsvpCapabilityScope>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let Some(row) = sqlx::query(
            "SELECT grant_id,owner_user_id,wedding_plan_id,response_workspace_id,household_id,invitation_ids,expires_at FROM wedding_rsvp_capability_grants WHERE token_digest=$1 FOR UPDATE",
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
            tx.commit().await?;
            return Ok(None);
        }
        let owner_user_id: String = row.try_get("owner_user_id")?;
        let wedding_plan_id: String = row.try_get("wedding_plan_id")?;
        let response_workspace_id: String = row.try_get("response_workspace_id")?;
        let household_id: String = row.try_get("household_id")?;
        let invitation_ids = serde_json::from_value::<Vec<String>>(row.try_get("invitation_ids")?)
            .unwrap_or_default();
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
        sqlx::query(
            "UPDATE wedding_rsvp_capability_grants SET open_count=open_count+1,last_opened_at=NOW() WHERE grant_id=$1",
        )
        .bind(&grant_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(Some(WeddingRsvpCapabilityScope {
            capability_id: grant_id,
            household_id,
            expires_at: expires_at.to_rfc3339(),
            invitations,
        }))
    }
}
