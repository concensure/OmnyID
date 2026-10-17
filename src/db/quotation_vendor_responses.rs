use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::quotation::{
    VendorTransportFailure, VendorTransportReceipt, VendorTransportReceiptStatus,
};

use super::Db;

#[derive(Clone, Debug)]
pub struct VendorTransportWrite {
    pub owner_user_id: String,
    pub vendor_id: String,
    pub message_id: String,
    pub thread_id: String,
    pub from_agent_id: String,
    pub to_agent_id: String,
    pub direction: String,
    pub afp_type: String,
    pub envelope: Vec<u8>,
    pub expires_at: DateTime<Utc>,
    pub grant_message_id: String,
    pub grant_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub projection_fingerprint: String,
    pub response_id: Option<String>,
    pub response_fingerprint: Option<String>,
    pub transport_nonce: String,
    pub agent_card_key_id: String,
    pub request_id: String,
    pub request_digest: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredVendorTransport {
    pub owner_user_id: String,
    pub vendor_id: String,
    pub message_id: String,
    pub thread_id: String,
    pub from_agent_id: String,
    pub to_agent_id: String,
    pub afp_type: String,
    pub envelope: Vec<u8>,
    pub expires_at: DateTime<Utc>,
    pub grant_message_id: String,
    pub grant_id: String,
    pub quotation_id: String,
    pub quotation_version_id: String,
    pub projection_fingerprint: String,
    pub response_id: Option<String>,
    pub response_fingerprint: Option<String>,
    pub transport_nonce: String,
    pub agent_card_key_id: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug)]
pub enum VendorTransportStoreOutcome {
    Stored(VendorTransportReceipt),
    Retry(VendorTransportReceipt),
    RequestConflict,
    NonceConflict,
}

fn failure_code(failure: &VendorTransportFailure) -> &'static str {
    match failure {
        VendorTransportFailure::InvalidEnvelope => "invalid_envelope",
        VendorTransportFailure::PlaintextForbidden => "plaintext_forbidden",
        VendorTransportFailure::PayloadTooLarge => "payload_too_large",
        VendorTransportFailure::Expired => "expired",
        VendorTransportFailure::ClaimUnavailable => "claim_unavailable",
        VendorTransportFailure::AgentCardChanged => "agent_card_changed",
        VendorTransportFailure::SignatureInvalid => "signature_invalid",
        VendorTransportFailure::WrongRecipient => "wrong_recipient",
        VendorTransportFailure::BindingMismatch => "binding_mismatch",
        VendorTransportFailure::GrantUnavailable => "grant_unavailable",
        VendorTransportFailure::ActionUnavailable => "action_unavailable",
    }
}

fn parse_failure(value: Option<String>) -> Option<VendorTransportFailure> {
    match value.as_deref()? {
        "invalid_envelope" => Some(VendorTransportFailure::InvalidEnvelope),
        "plaintext_forbidden" => Some(VendorTransportFailure::PlaintextForbidden),
        "payload_too_large" => Some(VendorTransportFailure::PayloadTooLarge),
        "expired" => Some(VendorTransportFailure::Expired),
        "claim_unavailable" => Some(VendorTransportFailure::ClaimUnavailable),
        "agent_card_changed" => Some(VendorTransportFailure::AgentCardChanged),
        "signature_invalid" => Some(VendorTransportFailure::SignatureInvalid),
        "wrong_recipient" => Some(VendorTransportFailure::WrongRecipient),
        "binding_mismatch" => Some(VendorTransportFailure::BindingMismatch),
        "grant_unavailable" => Some(VendorTransportFailure::GrantUnavailable),
        "action_unavailable" => Some(VendorTransportFailure::ActionUnavailable),
        _ => None,
    }
}

fn receipt_from_row(row: &sqlx::postgres::PgRow) -> VendorTransportReceipt {
    VendorTransportReceipt {
        receipt_id: row.get("receipt_id"),
        request_id: row.get("request_id"),
        request_digest: row.get("request_digest"),
        status: if row.get::<String, _>("status") == "accepted" {
            VendorTransportReceiptStatus::Accepted
        } else {
            VendorTransportReceiptStatus::Rejected
        },
        message_id: row.get("message_id"),
        failure: parse_failure(row.get("failure_code")),
        received_at: row
            .get::<DateTime<Utc>, _>("received_at")
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    }
}

fn receipt_time(receipt: &VendorTransportReceipt) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(&receipt.received_at)
        .expect("transport receipts are created from a valid UTC timestamp")
        .with_timezone(&Utc)
}

fn transport_from_row(row: sqlx::postgres::PgRow) -> StoredVendorTransport {
    StoredVendorTransport {
        owner_user_id: row.get("owner_user_id"),
        vendor_id: row.get("vendor_id"),
        message_id: row.get("message_id"),
        thread_id: row.get("thread_id"),
        from_agent_id: row.get("from_agent_id"),
        to_agent_id: row.get("to_agent_id"),
        afp_type: row.get("afp_type"),
        envelope: row.get("envelope"),
        expires_at: row.get("expires_at"),
        grant_message_id: row.get("grant_message_id"),
        grant_id: row.get("grant_id"),
        quotation_id: row.get("quotation_id"),
        quotation_version_id: row.get("quotation_version_id"),
        projection_fingerprint: row.get("projection_fingerprint"),
        response_id: row.get("response_id"),
        response_fingerprint: row.get("response_fingerprint"),
        transport_nonce: row.get("transport_nonce"),
        agent_card_key_id: row.get("agent_card_key_id"),
        created_at: row.get("created_at"),
    }
}

const TRANSPORT_SELECT: &str = r#"
    SELECT t.owner_user_id, t.vendor_id, t.message_id, e.thread_id,
           e.from_agent_id, e.to_agent_id, e.afp_type, e.envelope, e.expires_at,
           t.grant_message_id, t.grant_id, t.quotation_id, t.quotation_version_id,
           t.projection_fingerprint, t.response_id, t.response_fingerprint,
           t.transport_nonce, t.agent_card_key_id, t.created_at
      FROM quotation_vendor_response_transports t
      JOIN wedding_enquiry_envelopes e ON e.message_id = t.message_id
"#;

impl Db {
    async fn existing_vendor_transport_receipt(
        transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        vendor_id: &str,
        request_id: &str,
    ) -> Result<Option<VendorTransportReceipt>, sqlx::Error> {
        sqlx::query(
            r#"SELECT receipt_id, request_id, request_digest, status, failure_code,
                      message_id, received_at
                 FROM quotation_vendor_response_transport_receipts
                WHERE vendor_id = $1 AND request_id = $2"#,
        )
        .bind(vendor_id)
        .bind(request_id)
        .fetch_optional(&mut **transaction)
        .await
        .map(|row| row.as_ref().map(receipt_from_row))
    }

    pub async fn store_vendor_transport(
        &self,
        write: &VendorTransportWrite,
        receipt: &VendorTransportReceipt,
    ) -> Result<VendorTransportStoreOutcome, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
            .bind(format!("{}:{}", write.vendor_id, write.request_id))
            .execute(&mut *transaction)
            .await?;
        if let Some(existing) = Self::existing_vendor_transport_receipt(
            &mut transaction,
            &write.vendor_id,
            &write.request_id,
        )
        .await?
        {
            transaction.commit().await?;
            return Ok(if existing.request_digest == write.request_digest {
                VendorTransportStoreOutcome::Retry(existing)
            } else {
                VendorTransportStoreOutcome::RequestConflict
            });
        }
        if let Some(response_fingerprint) = &write.response_fingerprint {
            sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
                .bind(format!(
                    "{}:{}:{}",
                    write.vendor_id, write.grant_id, response_fingerprint
                ))
                .execute(&mut *transaction)
                .await?;
            if let Some(row) = sqlx::query(
                r#"SELECT r.receipt_id, r.request_id, r.request_digest, r.status,
                          r.failure_code, r.message_id, r.received_at
                     FROM quotation_vendor_response_transports t
                     JOIN quotation_vendor_response_transport_receipts r
                       ON r.message_id = t.message_id
                    WHERE t.vendor_id = $1 AND t.grant_id = $2
                      AND t.response_fingerprint = $3 AND t.direction = 'to_couple'
                    LIMIT 1"#,
            )
            .bind(&write.vendor_id)
            .bind(&write.grant_id)
            .bind(response_fingerprint)
            .fetch_optional(&mut *transaction)
            .await?
            {
                let receipt = receipt_from_row(&row);
                transaction.commit().await?;
                return Ok(VendorTransportStoreOutcome::Retry(receipt));
            }
        }
        let message_taken = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM wedding_enquiry_envelopes WHERE message_id = $1)",
        )
        .bind(&write.message_id)
        .fetch_one(&mut *transaction)
        .await?;
        if message_taken {
            transaction.commit().await?;
            return Ok(VendorTransportStoreOutcome::RequestConflict);
        }
        let nonce_taken = sqlx::query_scalar::<_, bool>(
            r#"SELECT EXISTS(
                 SELECT 1 FROM quotation_vendor_response_transports
                  WHERE vendor_id = $1 AND direction = $2 AND transport_nonce = $3
               )"#,
        )
        .bind(&write.vendor_id)
        .bind(&write.direction)
        .bind(&write.transport_nonce)
        .fetch_one(&mut *transaction)
        .await?;
        if nonce_taken {
            transaction.commit().await?;
            return Ok(VendorTransportStoreOutcome::NonceConflict);
        }
        sqlx::query(
            r#"INSERT INTO wedding_enquiry_envelopes
                (message_id, thread_id, vendor_id, from_agent_id, to_agent_id,
                 direction, afp_type, envelope, envelope_bytes, received_at, expires_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)"#,
        )
        .bind(&write.message_id)
        .bind(&write.thread_id)
        .bind(&write.vendor_id)
        .bind(&write.from_agent_id)
        .bind(&write.to_agent_id)
        .bind(&write.direction)
        .bind(&write.afp_type)
        .bind(&write.envelope)
        .bind(write.envelope.len() as i32)
        .bind(receipt_time(receipt))
        .bind(write.expires_at)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            r#"INSERT INTO quotation_vendor_response_transports
                (message_id, owner_user_id, grant_message_id, grant_id, vendor_id,
                 quotation_id, quotation_version_id, projection_fingerprint,
                 response_id, response_fingerprint, transport_nonce, agent_card_key_id,
                 request_id, request_digest, direction)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)"#,
        )
        .bind(&write.message_id)
        .bind(&write.owner_user_id)
        .bind(&write.grant_message_id)
        .bind(&write.grant_id)
        .bind(&write.vendor_id)
        .bind(&write.quotation_id)
        .bind(&write.quotation_version_id)
        .bind(&write.projection_fingerprint)
        .bind(&write.response_id)
        .bind(&write.response_fingerprint)
        .bind(&write.transport_nonce)
        .bind(&write.agent_card_key_id)
        .bind(&write.request_id)
        .bind(&write.request_digest)
        .bind(&write.direction)
        .execute(&mut *transaction)
        .await?;
        Self::insert_vendor_transport_receipt(&mut transaction, write, receipt).await?;
        transaction.commit().await?;
        Ok(VendorTransportStoreOutcome::Stored(receipt.clone()))
    }

    pub async fn store_rejected_vendor_transport_receipt(
        &self,
        owner_user_id: &str,
        vendor_id: &str,
        receipt: &VendorTransportReceipt,
    ) -> Result<VendorTransportStoreOutcome, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
            .bind(format!("{vendor_id}:{}", receipt.request_id))
            .execute(&mut *transaction)
            .await?;
        if let Some(existing) = Self::existing_vendor_transport_receipt(
            &mut transaction,
            vendor_id,
            &receipt.request_id,
        )
        .await?
        {
            transaction.commit().await?;
            return Ok(if existing.request_digest == receipt.request_digest {
                VendorTransportStoreOutcome::Retry(existing)
            } else {
                VendorTransportStoreOutcome::RequestConflict
            });
        }
        sqlx::query(
            r#"INSERT INTO quotation_vendor_response_transport_receipts
                (receipt_id, owner_user_id, vendor_id, request_id, request_digest,
                 status, failure_code, message_id, received_at)
               VALUES ($1,$2,$3,$4,$5,'rejected',$6,NULL,$7)"#,
        )
        .bind(&receipt.receipt_id)
        .bind(owner_user_id)
        .bind(vendor_id)
        .bind(&receipt.request_id)
        .bind(&receipt.request_digest)
        .bind(receipt.failure.as_ref().map(failure_code))
        .bind(receipt_time(receipt))
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(VendorTransportStoreOutcome::Stored(receipt.clone()))
    }

    async fn insert_vendor_transport_receipt(
        transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        write: &VendorTransportWrite,
        receipt: &VendorTransportReceipt,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO quotation_vendor_response_transport_receipts
                (receipt_id, owner_user_id, vendor_id, request_id, request_digest,
                 status, failure_code, message_id, received_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)"#,
        )
        .bind(&receipt.receipt_id)
        .bind(&write.owner_user_id)
        .bind(&write.vendor_id)
        .bind(&receipt.request_id)
        .bind(&receipt.request_digest)
        .bind(match receipt.status {
            VendorTransportReceiptStatus::Accepted => "accepted",
            VendorTransportReceiptStatus::Rejected => "rejected",
        })
        .bind(receipt.failure.as_ref().map(failure_code))
        .bind(&receipt.message_id)
        .bind(receipt_time(receipt))
        .execute(&mut **transaction)
        .await?;
        Ok(())
    }

    pub async fn vendor_transport_inbox(
        &self,
        user_id: &str,
    ) -> Result<Vec<StoredVendorTransport>, sqlx::Error> {
        let query = format!(
            "{TRANSPORT_SELECT}\n JOIN wedding_vendors v ON v.vendor_id = t.vendor_id\n JOIN wedding_vendor_agent_links l ON l.vendor_id = v.vendor_id\n WHERE v.claimed_by_user_id = $1 AND v.status = 'active'\n   AND v.claim_status IN ('claimed','verified') AND t.direction = 'to_vendor'\n   AND e.to_agent_id = l.agent_id AND t.agent_card_key_id = l.agent_card->>'key_id'\n   AND e.expires_at > NOW()\n ORDER BY t.created_at DESC LIMIT 50"
        );
        sqlx::query(&query)
            .bind(user_id)
            .fetch_all(&self.pool)
            .await
            .map(|rows| rows.into_iter().map(transport_from_row).collect())
    }

    pub async fn claimed_vendor_invitation(
        &self,
        user_id: &str,
        invitation_message_id: &str,
    ) -> Result<Option<StoredVendorTransport>, sqlx::Error> {
        let query = format!(
            "{TRANSPORT_SELECT}\n JOIN wedding_vendors v ON v.vendor_id = t.vendor_id\n JOIN wedding_vendor_agent_links l ON l.vendor_id = v.vendor_id\n WHERE v.claimed_by_user_id = $1 AND v.status = 'active'\n   AND v.claim_status IN ('claimed','verified') AND t.direction = 'to_vendor'\n   AND e.to_agent_id = l.agent_id AND t.agent_card_key_id = l.agent_card->>'key_id'\n   AND e.expires_at > NOW() AND t.message_id = $2"
        );
        sqlx::query(&query)
            .bind(user_id)
            .bind(invitation_message_id)
            .fetch_optional(&self.pool)
            .await
            .map(|row| row.map(transport_from_row))
    }
}
