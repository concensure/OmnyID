// @locs-version: 2.0
use super::Db;
use serde::Serialize;
use sqlx::Row;
use ulid::Ulid;

#[derive(Clone, Debug, Serialize)]
pub struct WeddingNewsletterSubscriberRecord {
    pub subscriber_id: String,
    pub email: String,
    pub source: String,
    pub subscribed_at: String,
    pub unsubscribed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct WeddingNewsletterSubscriberList {
    pub subscribers: Vec<WeddingNewsletterSubscriberRecord>,
    pub active_count: i64,
    pub unsubscribed_count: i64,
}

impl Db {
    /// Idempotent: re-subscribing an existing address keeps its token and clears any
    /// unsubscribe, so a caller cannot tell whether an address was already on the list.
    pub async fn subscribe_wedding_newsletter(
        &self,
        email: &str,
        source: &str,
    ) -> Result<(), sqlx::Error> {
        let token = format!("{}{}", Ulid::new(), Ulid::new()).to_lowercase();
        sqlx::query(
            r#"
            INSERT INTO wedding_newsletter_subscribers (
                subscriber_id, email, unsubscribe_token, source
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (email) DO UPDATE SET
                subscribed_at = CASE
                    WHEN wedding_newsletter_subscribers.unsubscribed_at IS NULL
                        THEN wedding_newsletter_subscribers.subscribed_at
                    ELSE NOW()
                END,
                unsubscribed_at = NULL
            "#,
        )
        .bind(Ulid::new().to_string())
        .bind(email)
        .bind(token)
        .bind(source)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Returns false when the token matches no subscriber.
    pub async fn unsubscribe_wedding_newsletter(&self, token: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            r#"
            UPDATE wedding_newsletter_subscribers
            SET unsubscribed_at = COALESCE(unsubscribed_at, NOW())
            WHERE unsubscribe_token = $1
            "#,
        )
        .bind(token)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn list_wedding_newsletter_subscribers(
        &self,
        limit: i64,
    ) -> Result<WeddingNewsletterSubscriberList, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT
                subscriber_id,
                email,
                source,
                subscribed_at::text AS subscribed_at,
                unsubscribed_at::text AS unsubscribed_at
            FROM wedding_newsletter_subscribers
            ORDER BY subscribed_at DESC
            LIMIT $1
            "#,
        )
        .bind(limit.clamp(1, 5000))
        .fetch_all(&self.pool)
        .await?;
        let counts = sqlx::query(
            r#"
            SELECT
                COUNT(*) FILTER (WHERE unsubscribed_at IS NULL) AS active_count,
                COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL) AS unsubscribed_count
            FROM wedding_newsletter_subscribers
            "#,
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(WeddingNewsletterSubscriberList {
            subscribers: rows
                .into_iter()
                .map(|row| WeddingNewsletterSubscriberRecord {
                    subscriber_id: row.get("subscriber_id"),
                    email: row.get("email"),
                    source: row.get("source"),
                    subscribed_at: row.get("subscribed_at"),
                    unsubscribed_at: row.get("unsubscribed_at"),
                })
                .collect(),
            active_count: counts.get("active_count"),
            unsubscribed_count: counts.get("unsubscribed_count"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn local_postgres_subscribe_unsubscribe_round_trip() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
        let db = Db::new(&database_url)
            .await
            .expect("connect local postgres");
        let email = format!(
            "newsletter-{}@example.test",
            Ulid::new().to_string().to_lowercase()
        );

        db.subscribe_wedding_newsletter(&email, "wedding_blog")
            .await
            .expect("subscribe");
        db.subscribe_wedding_newsletter(&email, "wedding_home")
            .await
            .expect("repeat subscribe is idempotent");
        let token: String = sqlx::query_scalar(
            "SELECT unsubscribe_token FROM wedding_newsletter_subscribers WHERE email = $1",
        )
        .bind(&email)
        .fetch_one(&db.pool)
        .await
        .expect("one row with a token");

        assert!(db.unsubscribe_wedding_newsletter(&token).await.unwrap());
        assert!(!db.unsubscribe_wedding_newsletter("nope").await.unwrap());
        let list = db.list_wedding_newsletter_subscribers(5000).await.unwrap();
        let row = list
            .subscribers
            .iter()
            .find(|row| row.email == email)
            .expect("listed");
        assert!(row.unsubscribed_at.is_some());
        assert_eq!(row.source, "wedding_blog");

        db.subscribe_wedding_newsletter(&email, "wedding_home")
            .await
            .expect("resubscribe");
        let list = db.list_wedding_newsletter_subscribers(5000).await.unwrap();
        let row = list
            .subscribers
            .iter()
            .find(|row| row.email == email)
            .unwrap();
        assert!(row.unsubscribed_at.is_none());

        sqlx::query("DELETE FROM wedding_newsletter_subscribers WHERE email = $1")
            .bind(&email)
            .execute(&db.pool)
            .await
            .expect("cleanup");
    }
}
