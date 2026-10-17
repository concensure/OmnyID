use super::Db;
use crate::quotation::{
    ResponseCapabilityAuditEvent, ResponseCapabilityRecord, ResponseCapabilityStatus,
    ResponseTransactionSessionRecord,
};
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{Postgres, Row, Transaction};

#[derive(Clone, Debug)]
pub struct StoredQuotationResponseCapability {
    pub owner_user_id: String,
    pub grant_message_id: String,
    pub record: ResponseCapabilityRecord,
}

fn status_name(status: ResponseCapabilityStatus) -> &'static str {
    match status {
        ResponseCapabilityStatus::Active => "active",
        ResponseCapabilityStatus::Exchanged => "exchanged",
        ResponseCapabilityStatus::Consumed => "consumed",
        ResponseCapabilityStatus::Revoked => "revoked",
        ResponseCapabilityStatus::Rotated => "rotated",
        ResponseCapabilityStatus::Expired => "expired",
    }
}

fn audit_kind_name(audit: &ResponseCapabilityAuditEvent) -> &'static str {
    use crate::quotation::ResponseCapabilityAuditKind::*;
    match audit.kind {
        Issued => "issued",
        Exchanged => "exchanged",
        Consumed => "consumed",
        Revoked => "revoked",
        Rotated => "rotated",
        Expired => "expired",
    }
}

fn parse_record(row: &sqlx::postgres::PgRow) -> Result<ResponseCapabilityRecord, sqlx::Error> {
    serde_json::from_value(row.get::<Value, _>("record_json"))
        .map_err(|error| sqlx::Error::Decode(Box::new(error)))
}

fn parse_session(
    row: &sqlx::postgres::PgRow,
) -> Result<ResponseTransactionSessionRecord, sqlx::Error> {
    serde_json::from_value(row.get::<Value, _>("session_record_json"))
        .map_err(|error| sqlx::Error::Decode(Box::new(error)))
}

async fn insert_audit(
    tx: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    audit: &ResponseCapabilityAuditEvent,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO quotation_response_capability_audit
           (event_id, capability_id, owner_user_id, event_kind, occurred_at)
           VALUES ($1, $2, $3, $4, $5::timestamptz)"#,
    )
    .bind(&audit.event_id)
    .bind(&audit.capability_id)
    .bind(owner_user_id)
    .bind(audit_kind_name(audit))
    .bind(&audit.occurred_at)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn insert_capability(
    tx: &mut Transaction<'_, Postgres>,
    owner_user_id: &str,
    grant_message_id: &str,
    record: &ResponseCapabilityRecord,
) -> Result<(), sqlx::Error> {
    let record_json =
        serde_json::to_value(record).map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
    sqlx::query(
        r#"INSERT INTO quotation_response_capabilities (
             capability_id, owner_user_id, grant_message_id, vendor_id,
             response_recipient_id, quotation_id, quotation_version_id, thread_id,
             projection_fingerprint, token_prefix, token_mac, status, generation,
             rotated_from_capability_id, record_json, not_before, expires_at,
             exchanged_at, consumed_at, revoked_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16::timestamptz, $17::timestamptz, $18::timestamptz,
             $19::timestamptz, $20::timestamptz
           )"#,
    )
    .bind(&record.capability_id)
    .bind(owner_user_id)
    .bind(grant_message_id)
    .bind(&record.binding.vendor_id)
    .bind(&record.binding.response_recipient_id)
    .bind(&record.binding.quotation_id)
    .bind(&record.binding.quotation_version_id)
    .bind(&record.binding.thread_id)
    .bind(&record.binding.projection_fingerprint)
    .bind(&record.token_prefix)
    .bind(&record.token_mac)
    .bind(status_name(record.status))
    .bind(i64::from(record.generation))
    .bind(&record.rotated_from_capability_id)
    .bind(record_json)
    .bind(&record.binding.not_before)
    .bind(&record.binding.expires_at)
    .bind(&record.exchanged_at)
    .bind(&record.consumed_at)
    .bind(&record.revoked_at)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

impl Db {
    pub async fn store_quotation_response_capability(
        &self,
        owner_user_id: &str,
        grant_message_id: &str,
        record: &ResponseCapabilityRecord,
        audit: &ResponseCapabilityAuditEvent,
    ) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        insert_capability(&mut tx, owner_user_id, grant_message_id, record).await?;
        insert_audit(&mut tx, owner_user_id, audit).await?;
        tx.commit().await
    }

    pub async fn quotation_response_capabilities_by_prefix(
        &self,
        token_prefix: &str,
    ) -> Result<Vec<StoredQuotationResponseCapability>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT owner_user_id, grant_message_id, record_json
               FROM quotation_response_capabilities
               WHERE token_prefix = $1 AND status = 'active'
               ORDER BY created_at DESC LIMIT 4"#,
        )
        .bind(token_prefix)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|row| {
                Ok(StoredQuotationResponseCapability {
                    owner_user_id: row.get("owner_user_id"),
                    grant_message_id: row.get("grant_message_id"),
                    record: parse_record(&row)?,
                })
            })
            .collect()
    }

    pub async fn quotation_response_capability_for_owner(
        &self,
        owner_user_id: &str,
        capability_id: &str,
    ) -> Result<Option<StoredQuotationResponseCapability>, sqlx::Error> {
        let row = sqlx::query(
            r#"SELECT owner_user_id, grant_message_id, record_json
               FROM quotation_response_capabilities
               WHERE owner_user_id = $1 AND capability_id = $2"#,
        )
        .bind(owner_user_id)
        .bind(capability_id)
        .fetch_optional(&self.pool)
        .await?;
        row.map(|row| {
            Ok(StoredQuotationResponseCapability {
                owner_user_id: row.get("owner_user_id"),
                grant_message_id: row.get("grant_message_id"),
                record: parse_record(&row)?,
            })
        })
        .transpose()
    }

    pub async fn quotation_response_grant_was_consumed(
        &self,
        owner_user_id: &str,
        grant_message_id: &str,
        vendor_id: &str,
    ) -> Result<bool, sqlx::Error> {
        sqlx::query_scalar(
            r#"SELECT EXISTS (
                 SELECT 1 FROM quotation_response_capabilities
                 WHERE owner_user_id = $1 AND grant_message_id = $2
                   AND vendor_id = $3 AND status = 'consumed'
               )"#,
        )
        .bind(owner_user_id)
        .bind(grant_message_id)
        .bind(vendor_id)
        .fetch_one(&self.pool)
        .await
    }

    pub async fn active_quotation_response_capabilities_for_grant(
        &self,
        owner_user_id: &str,
        grant_message_id: &str,
        vendor_id: &str,
    ) -> Result<Vec<StoredQuotationResponseCapability>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT owner_user_id, grant_message_id, record_json
               FROM quotation_response_capabilities
               WHERE owner_user_id = $1 AND grant_message_id = $2 AND vendor_id = $3
                 AND status IN ('active', 'exchanged')
               ORDER BY created_at DESC"#,
        )
        .bind(owner_user_id)
        .bind(grant_message_id)
        .bind(vendor_id)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|row| {
                Ok(StoredQuotationResponseCapability {
                    owner_user_id: row.get("owner_user_id"),
                    grant_message_id: row.get("grant_message_id"),
                    record: parse_record(&row)?,
                })
            })
            .collect()
    }

    pub async fn exchange_quotation_response_capability(
        &self,
        stored: &StoredQuotationResponseCapability,
        updated_record: &ResponseCapabilityRecord,
        session: &ResponseTransactionSessionRecord,
        audit: &ResponseCapabilityAuditEvent,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let record_json = serde_json::to_value(updated_record)
            .map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
        let changed = sqlx::query(
            r#"UPDATE quotation_response_capabilities
               SET status = 'exchanged', record_json = $1,
                   exchanged_at = $2::timestamptz, updated_at = NOW()
               WHERE capability_id = $3 AND owner_user_id = $4
                 AND status = 'active' AND generation = $5"#,
        )
        .bind(record_json)
        .bind(&updated_record.exchanged_at)
        .bind(&updated_record.capability_id)
        .bind(&stored.owner_user_id)
        .bind(i64::from(stored.record.generation))
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if changed != 1 {
            tx.rollback().await?;
            return Ok(false);
        }
        let session_json =
            serde_json::to_value(session).map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
        sqlx::query(
            r#"INSERT INTO quotation_response_sessions
               (session_id, capability_id, session_token_mac, csrf_token_mac,
                submission_nonce_mac, record_json, account_access, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7::timestamptz)"#,
        )
        .bind(&session.session_id)
        .bind(&session.capability_id)
        .bind(&session.session_token_mac)
        .bind(&session.csrf_token_mac)
        .bind(&session.submission_nonce_mac)
        .bind(session_json)
        .bind(&session.expires_at)
        .execute(&mut *tx)
        .await?;
        insert_audit(&mut tx, &stored.owner_user_id, audit).await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn quotation_response_session_by_mac(
        &self,
        session_token_mac: &str,
    ) -> Result<
        Option<(
            StoredQuotationResponseCapability,
            ResponseTransactionSessionRecord,
        )>,
        sqlx::Error,
    > {
        let row = sqlx::query(
            r#"SELECT c.owner_user_id, c.grant_message_id, c.record_json,
                      s.record_json AS session_record_json
               FROM quotation_response_sessions s
               JOIN quotation_response_capabilities c ON c.capability_id = s.capability_id
               WHERE s.session_token_mac = $1 AND s.expires_at > NOW()"#,
        )
        .bind(session_token_mac)
        .fetch_optional(&self.pool)
        .await?;
        row.map(|row| {
            Ok((
                StoredQuotationResponseCapability {
                    owner_user_id: row.get("owner_user_id"),
                    grant_message_id: row.get("grant_message_id"),
                    record: parse_record(&row)?,
                },
                parse_session(&row)?,
            ))
        })
        .transpose()
    }

    pub async fn consume_quotation_response_capability(
        &self,
        stored: &StoredQuotationResponseCapability,
        updated_record: &ResponseCapabilityRecord,
        session: &ResponseTransactionSessionRecord,
        audit: &ResponseCapabilityAuditEvent,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let record_json = serde_json::to_value(updated_record)
            .map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
        let capability_changed = sqlx::query(
            r#"UPDATE quotation_response_capabilities
               SET status = 'consumed', record_json = $1,
                   consumed_at = $2::timestamptz, updated_at = NOW()
               WHERE capability_id = $3 AND owner_user_id = $4
                 AND status = 'exchanged' AND generation = $5"#,
        )
        .bind(record_json)
        .bind(&updated_record.consumed_at)
        .bind(&updated_record.capability_id)
        .bind(&stored.owner_user_id)
        .bind(i64::from(stored.record.generation))
        .execute(&mut *tx)
        .await?
        .rows_affected();
        let session_json =
            serde_json::to_value(session).map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
        let session_changed = sqlx::query(
            r#"UPDATE quotation_response_sessions
               SET record_json = $1, consumed_at = $2::timestamptz
               WHERE session_id = $3 AND capability_id = $4 AND consumed_at IS NULL"#,
        )
        .bind(session_json)
        .bind(&session.consumed_at)
        .bind(&session.session_id)
        .bind(&session.capability_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if capability_changed != 1 || session_changed != 1 {
            tx.rollback().await?;
            return Ok(false);
        }
        insert_audit(&mut tx, &stored.owner_user_id, audit).await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn revoke_quotation_response_capability(
        &self,
        stored: &StoredQuotationResponseCapability,
        updated_record: &ResponseCapabilityRecord,
        audit: &ResponseCapabilityAuditEvent,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let record_json = serde_json::to_value(updated_record)
            .map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
        let changed = sqlx::query(
            r#"UPDATE quotation_response_capabilities
               SET status = $1, record_json = $2, revoked_at = $3::timestamptz,
                   updated_at = NOW()
               WHERE capability_id = $4 AND owner_user_id = $5
                 AND status = $6 AND generation = $7"#,
        )
        .bind(status_name(updated_record.status))
        .bind(record_json)
        .bind(&updated_record.revoked_at)
        .bind(&updated_record.capability_id)
        .bind(&stored.owner_user_id)
        .bind(status_name(stored.record.status))
        .bind(i64::from(stored.record.generation))
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if changed != 1 {
            tx.rollback().await?;
            return Ok(false);
        }
        insert_audit(&mut tx, &stored.owner_user_id, audit).await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn rotate_quotation_response_capability(
        &self,
        stored: &StoredQuotationResponseCapability,
        rotated_record: &ResponseCapabilityRecord,
        rotation_audit: &ResponseCapabilityAuditEvent,
        next_record: &ResponseCapabilityRecord,
        issue_audit: &ResponseCapabilityAuditEvent,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let record_json = serde_json::to_value(rotated_record)
            .map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
        let changed = sqlx::query(
            r#"UPDATE quotation_response_capabilities
               SET status = 'rotated', record_json = $1,
                   revoked_at = $2::timestamptz, updated_at = NOW()
               WHERE capability_id = $3 AND owner_user_id = $4
                 AND status = $5 AND generation = $6"#,
        )
        .bind(record_json)
        .bind(&rotated_record.revoked_at)
        .bind(&rotated_record.capability_id)
        .bind(&stored.owner_user_id)
        .bind(status_name(stored.record.status))
        .bind(i64::from(stored.record.generation))
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if changed != 1 {
            tx.rollback().await?;
            return Ok(false);
        }
        insert_audit(&mut tx, &stored.owner_user_id, rotation_audit).await?;
        insert_capability(
            &mut tx,
            &stored.owner_user_id,
            &stored.grant_message_id,
            next_record,
        )
        .await?;
        insert_audit(&mut tx, &stored.owner_user_id, issue_audit).await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn increment_quotation_response_rate_attempt(
        &self,
        dimension: &str,
        key_mac: &str,
        window_started_at: DateTime<Utc>,
    ) -> Result<u32, sqlx::Error> {
        let count: i32 = sqlx::query_scalar(
            r#"INSERT INTO quotation_response_rate_attempts
               (dimension, key_mac, window_started_at, attempt_count)
               VALUES ($1, $2, $3, 1)
               ON CONFLICT (dimension, key_mac, window_started_at)
               DO UPDATE SET attempt_count = quotation_response_rate_attempts.attempt_count + 1,
                             updated_at = NOW()
               RETURNING attempt_count"#,
        )
        .bind(dimension)
        .bind(key_mac)
        .bind(window_started_at)
        .fetch_one(&self.pool)
        .await?;
        Ok(count.max(0) as u32)
    }
}
