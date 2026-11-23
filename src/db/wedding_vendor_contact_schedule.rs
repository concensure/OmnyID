use sqlx::Row;

use super::{Db, WeddingVendorUserContactRecord};

impl Db {
    /// Change only the follow-up schedule, preserving the contact method,
    /// last-contact time, and any recorded vendor reply.
    pub async fn reschedule_wedding_vendor_follow_up(
        &self,
        user_id: &str,
        vendor_id: &str,
        follow_up_due_at: &str,
    ) -> Result<Option<WeddingVendorUserContactRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            UPDATE wedding_vendor_user_contacts
            SET follow_up_due_at = $3::timestamptz,
                updated_at = NOW()
            WHERE user_id = $1 AND vendor_id = $2
            RETURNING
                contact_id,
                user_id,
                vendor_id,
                contact_method,
                last_contact_at::text AS last_contact_at,
                response_received_at::text AS response_received_at,
                follow_up_due_at::text AS follow_up_due_at,
                thread_id,
                receipt_ref,
                notes,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            "#,
        )
        .bind(user_id)
        .bind(vendor_id)
        .bind(follow_up_due_at)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| WeddingVendorUserContactRecord {
            contact_id: row.get("contact_id"),
            user_id: row.get("user_id"),
            vendor_id: row.get("vendor_id"),
            contact_method: row.get("contact_method"),
            last_contact_at: row.get("last_contact_at"),
            response_received_at: row.get("response_received_at"),
            follow_up_due_at: row.get("follow_up_due_at"),
            thread_id: row.get("thread_id"),
            receipt_ref: row.get("receipt_ref"),
            notes: row.get("notes"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }))
    }
}
