use serde_json::Value;
use sqlx::Row;

use super::{Db, tenant_attachments_table, tenant_messages_table};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoredMessageAttachment {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub storage_backend: String,
    pub storage_key: String,
    pub sha256: String,
}

impl Db {
    /// Returns one authored Wedding review revision from its tenant-private
    /// AFP table. The caller establishes operator or author access first; this
    /// narrow reader cannot enumerate messages or accept a mismatched subtype.
    pub async fn wedding_review_revision_content(
        &self,
        authored_by_user_id: &str,
        afp_message_id: &str,
        review_id: &str,
        revision: i64,
    ) -> Result<Option<Value>, sqlx::Error> {
        self.ensure_user_private_schema(authored_by_user_id).await?;
        let messages = tenant_messages_table(authored_by_user_id);
        sqlx::query_scalar(&format!(
            r#"SELECT content
               FROM {messages}
               WHERE id = $1
                 AND subtype = 'wedding_review_revision'
                 AND metadata->>'origin' = 'server_wedding_reviews'
                 AND content->>'review_id' = $2
                 AND content->>'revision' = $3
               LIMIT 1"#,
        ))
        .bind(afp_message_id)
        .bind(review_id)
        .bind(revision.to_string())
        .fetch_optional(&self.pool)
        .await
    }

    /// Returns one vendor-authored review reply or report from the exact
    /// member's tenant-private AFP store. Callers establish vendor membership
    /// or operator access before using this deliberately non-enumerating read.
    pub async fn wedding_review_vendor_content(
        &self,
        authored_by_user_id: &str,
        afp_message_id: &str,
        subtype: &str,
        review_id: &str,
    ) -> Result<Option<Value>, sqlx::Error> {
        if !matches!(
            subtype,
            "wedding_review_vendor_reply" | "wedding_review_vendor_report"
        ) {
            return Ok(None);
        }
        self.ensure_user_private_schema(authored_by_user_id).await?;
        let messages = tenant_messages_table(authored_by_user_id);
        sqlx::query_scalar(&format!(
            r#"SELECT content
               FROM {messages}
               WHERE id = $1
                 AND subtype = $2
                 AND metadata->>'origin' = 'server_wedding_review_vendor_boundary'
                 AND content->>'review_id' = $3
               LIMIT 1"#,
        ))
        .bind(afp_message_id)
        .bind(subtype)
        .bind(review_id)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn private_attachment_by_id(
        &self,
        owner_user_id: &str,
        attachment_id: &str,
    ) -> Result<Option<StoredMessageAttachment>, sqlx::Error> {
        self.ensure_user_private_schema(owner_user_id).await?;
        let attachments = tenant_attachments_table(owner_user_id);
        let row = sqlx::query(&format!(
            r#"SELECT id, name, mime_type, size_bytes, storage, sha256
               FROM {attachments}
               WHERE id = $1"#,
        ))
        .bind(attachment_id)
        .fetch_optional(&self.pool)
        .await?;
        row.map(stored_attachment_from_row).transpose()
    }

    pub async fn stored_message_attachments_for_account_deletion(
        &self,
        owner_user_id: &str,
    ) -> Result<Vec<StoredMessageAttachment>, sqlx::Error> {
        self.ensure_user_private_schema(owner_user_id).await?;
        let attachments = tenant_attachments_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"SELECT id, name, mime_type, size_bytes, storage, sha256
               FROM {attachments}
               ORDER BY id"#,
        ))
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(stored_attachment_from_row).collect()
    }

    pub async fn claimed_vendor_response_attachment_count(
        &self,
        owner_user_id: &str,
        invitation_message_id: &str,
        attachment_refs: &[(String, String)],
    ) -> Result<i64, sqlx::Error> {
        if attachment_refs.is_empty() {
            return Ok(0);
        }
        self.ensure_user_private_schema(owner_user_id).await?;
        let attachments = tenant_attachments_table(owner_user_id);
        let messages = tenant_messages_table(owner_user_id);
        let attachment_ids = attachment_refs
            .iter()
            .map(|(id, _)| id.as_str())
            .collect::<Vec<_>>();
        let attachment_hashes = attachment_refs
            .iter()
            .map(|(_, sha256)| sha256.as_str())
            .collect::<Vec<_>>();
        sqlx::query_scalar(&format!(
            r#"SELECT COUNT(*)::bigint
               FROM {attachments} a JOIN {messages} m ON m.id = a.message_id
               WHERE EXISTS (
                   SELECT 1 FROM unnest($1::text[], $2::text[]) AS expected(id, sha256)
                   WHERE expected.id = a.id AND expected.sha256 = a.sha256
               )
                 AND m.metadata->>'upload_source' = 'claimed_vendor_response'
                 AND m.metadata->>'invitation_message_id' = $3"#,
        ))
        .bind(attachment_ids)
        .bind(attachment_hashes)
        .bind(invitation_message_id)
        .fetch_one(&self.pool)
        .await
    }

    pub async fn wedding_message_attachments_by_id(
        &self,
        owner_user_id: &str,
        attachment_ids: &[String],
    ) -> Result<Vec<StoredMessageAttachment>, sqlx::Error> {
        if attachment_ids.is_empty() {
            return Ok(Vec::new());
        }
        self.ensure_user_private_schema(owner_user_id).await?;
        let attachments = tenant_attachments_table(owner_user_id);
        let messages = tenant_messages_table(owner_user_id);
        let rows = sqlx::query(&format!(
            r#"
            SELECT a.id, a.name, a.mime_type, a.size_bytes, a.storage, a.sha256
            FROM {attachments} a
            JOIN {messages} m ON m.id = a.message_id
            WHERE a.id = ANY($1)
              AND m.metadata->>'upload_purpose' = 'wedding_vendor_message'
            "#,
        ))
        .bind(attachment_ids)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(stored_attachment_from_row).collect()
    }
}

fn stored_attachment_from_row(
    row: sqlx::postgres::PgRow,
) -> Result<StoredMessageAttachment, sqlx::Error> {
    let storage: Value = row.try_get("storage")?;
    Ok(StoredMessageAttachment {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        mime_type: row.try_get("mime_type")?,
        size_bytes: row.try_get("size_bytes")?,
        storage_backend: storage
            .get("backend")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        storage_key: storage
            .get("key")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        sha256: row.try_get("sha256")?,
    })
}
