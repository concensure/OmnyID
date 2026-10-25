// @locs-version: 1.0
use super::Db;
use serde::Serialize;
use sqlx::Row;
use ulid::Ulid;

#[derive(Clone, Debug, Serialize)]
pub struct WeddingBlogPublicationRecord {
    pub publication_id: String,
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub category: String,
    pub sanitized_html: String,
    pub content_sha256: String,
    pub status: String,
    pub revision: i32,
    pub published_at: Option<String>,
    pub updated_at: String,
}

fn publication(row: sqlx::postgres::PgRow) -> WeddingBlogPublicationRecord {
    WeddingBlogPublicationRecord {
        publication_id: row.get("publication_id"),
        slug: row.get("slug"),
        title: row.get("title"),
        summary: row.get("summary"),
        category: row.get("category"),
        sanitized_html: row.get("sanitized_html"),
        content_sha256: row.get("content_sha256"),
        status: row.get("status"),
        revision: row.get("revision"),
        published_at: row.get("published_at"),
        updated_at: row.get("updated_at"),
    }
}

impl Db {
    pub async fn upsert_wedding_blog_publication(
        &self,
        slug: &str,
        title: &str,
        summary: &str,
        category: &str,
        sanitized_html: &str,
        content_sha256: &str,
        status: &str,
        operator_user_id: &str,
    ) -> Result<WeddingBlogPublicationRecord, sqlx::Error> {
        let row = sqlx::query(
            r#"INSERT INTO wedding_blog_publications (
                 publication_id, slug, title, summary, category, sanitized_html,
                 content_sha256, status, updated_by_user_id, published_at
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
                 CASE WHEN $8 = 'published' THEN NOW() ELSE NULL END)
               ON CONFLICT (slug) DO UPDATE SET
                 title = EXCLUDED.title,
                 summary = EXCLUDED.summary,
                 category = EXCLUDED.category,
                 sanitized_html = EXCLUDED.sanitized_html,
                 content_sha256 = EXCLUDED.content_sha256,
                 status = EXCLUDED.status,
                 updated_by_user_id = EXCLUDED.updated_by_user_id,
                 revision = wedding_blog_publications.revision + 1,
                 updated_at = NOW(),
                 published_at = CASE
                   WHEN EXCLUDED.status = 'published' THEN COALESCE(wedding_blog_publications.published_at, NOW())
                   ELSE NULL
                 END
               RETURNING publication_id, slug, title, summary, category,
                 sanitized_html, content_sha256, status, revision,
                 published_at::text AS published_at, updated_at::text AS updated_at"#,
        )
        .bind(format!("wblog_{}", Ulid::new().to_string().to_lowercase()))
        .bind(slug)
        .bind(title)
        .bind(summary)
        .bind(category)
        .bind(sanitized_html)
        .bind(content_sha256)
        .bind(status)
        .bind(operator_user_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(publication(row))
    }

    pub async fn list_published_wedding_blog_publications(
        &self,
    ) -> Result<Vec<WeddingBlogPublicationRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT publication_id, slug, title, summary, category,
                 sanitized_html, content_sha256, status, revision,
                 published_at::text AS published_at, updated_at::text AS updated_at
               FROM wedding_blog_publications
               WHERE status = 'published'
               ORDER BY published_at DESC
               LIMIT 200"#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(publication).collect())
    }

    pub async fn get_published_wedding_blog_publication(
        &self,
        slug: &str,
    ) -> Result<Option<WeddingBlogPublicationRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"SELECT publication_id, slug, title, summary, category,
                 sanitized_html, content_sha256, status, revision,
                 published_at::text AS published_at, updated_at::text AS updated_at
               FROM wedding_blog_publications
               WHERE slug = $1 AND status = 'published'"#,
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(publication))
    }
}
