// @locs-version: 2.0
use super::Db;
use serde::Serialize;
use sqlx::Row;
use ulid::Ulid;

#[derive(Clone, Debug)]
pub struct WeddingBinderAcquisition<'a> {
    pub utm_source: Option<&'a str>,
    pub utm_medium: Option<&'a str>,
    pub utm_campaign: Option<&'a str>,
    pub intent: Option<&'a str>,
    pub referrer_class: Option<&'a str>,
    pub device_class: Option<&'a str>,
}

#[derive(Clone, Debug)]
pub struct PreparedWeddingBinderRequest {
    pub request_id: Option<String>,
    pub should_send: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct WeddingBinderRequestRecord {
    pub request_id: String,
    pub email: String,
    pub requested_at: String,
    pub marketing_opt_in: bool,
    pub delivery_status: String,
    pub delivered_at: Option<String>,
    pub attempts: i32,
    pub confirmed_at: Option<String>,
}

impl Db {
    pub async fn prepare_wedding_binder_request(
        &self,
        email: &str,
        marketing_opt_in: bool,
        consent_text_version: &str,
        confirmation_token_hash: Option<&str>,
        acquisition: WeddingBinderAcquisition<'_>,
    ) -> Result<PreparedWeddingBinderRequest, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        let recently_requested: bool = sqlx::query_scalar(
            r#"
            SELECT EXISTS (
                SELECT 1
                FROM wedding_binder_requests
                WHERE email = $1 AND requested_at > NOW() - INTERVAL '24 hours'
            )
            "#,
        )
        .bind(email)
        .fetch_one(&mut *transaction)
        .await?;
        if recently_requested {
            transaction.commit().await?;
            return Ok(PreparedWeddingBinderRequest {
                request_id: None,
                should_send: false,
            });
        }

        let request_id = Ulid::new().to_string();
        sqlx::query(
            r#"
            INSERT INTO wedding_binder_requests (
                request_id, email, marketing_opt_in, consent_text_version,
                confirmation_token_hash, utm_source, utm_medium, utm_campaign,
                intent, referrer_class, device_class
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            "#,
        )
        .bind(&request_id)
        .bind(email)
        .bind(marketing_opt_in)
        .bind(consent_text_version)
        .bind(confirmation_token_hash)
        .bind(acquisition.utm_source)
        .bind(acquisition.utm_medium)
        .bind(acquisition.utm_campaign)
        .bind(acquisition.intent)
        .bind(acquisition.referrer_class)
        .bind(acquisition.device_class)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(PreparedWeddingBinderRequest {
            request_id: Some(request_id),
            should_send: true,
        })
    }

    pub async fn finish_wedding_binder_delivery(
        &self,
        request_id: &str,
        delivered: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE wedding_binder_requests
            SET delivery_status = CASE WHEN $2 THEN 'sent' ELSE 'failed' END,
                delivered_at = CASE WHEN $2 THEN NOW() ELSE delivered_at END,
                attempts = attempts + 1
            WHERE request_id = $1
            "#,
        )
        .bind(request_id)
        .bind(delivered)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn confirm_wedding_binder_tips(&self, token_hash: &str) -> Result<bool, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        let email: Option<String> = sqlx::query_scalar(
            r#"
            UPDATE wedding_binder_requests
            SET confirmed_at = COALESCE(confirmed_at, NOW())
            WHERE confirmation_token_hash = $1 AND marketing_opt_in = TRUE
            RETURNING email
            "#,
        )
        .bind(token_hash)
        .fetch_optional(&mut *transaction)
        .await?;
        let Some(email) = email else {
            transaction.rollback().await?;
            return Ok(false);
        };

        let unsubscribe_token = format!("{}{}", Ulid::new(), Ulid::new()).to_lowercase();
        sqlx::query(
            r#"
            INSERT INTO wedding_newsletter_subscribers (
                subscriber_id, email, unsubscribe_token, source
            ) VALUES ($1, $2, $3, 'day_of_binder')
            ON CONFLICT (email) DO UPDATE SET
                source = 'day_of_binder',
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
        .bind(unsubscribe_token)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(true)
    }

    pub async fn list_wedding_binder_requests(
        &self,
        limit: i64,
    ) -> Result<Vec<WeddingBinderRequestRecord>, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT request_id, email, requested_at::text AS requested_at,
                   marketing_opt_in, delivery_status,
                   delivered_at::text AS delivered_at, attempts,
                   confirmed_at::text AS confirmed_at
            FROM wedding_binder_requests
            ORDER BY requested_at DESC
            LIMIT $1
            "#,
        )
        .bind(limit.clamp(1, 5000))
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| WeddingBinderRequestRecord {
                request_id: row.get("request_id"),
                email: row.get("email"),
                requested_at: row.get("requested_at"),
                marketing_opt_in: row.get("marketing_opt_in"),
                delivery_status: row.get("delivery_status"),
                delivered_at: row.get("delivered_at"),
                attempts: row.get("attempts"),
                confirmed_at: row.get("confirmed_at"),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    #[tokio::test]
    async fn disposable_postgres_binder_is_deduplicated_and_double_opt_in() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }
        let db = Db::new(&std::env::var("DATABASE_URL").expect("DATABASE_URL"))
            .await
            .expect("connect and migrate");
        let email = format!(
            "binder-{}@example.test",
            Ulid::new().to_string().to_lowercase()
        );
        let token = format!("{}{}", Ulid::new(), Ulid::new()).to_lowercase();
        let digest = hex::encode(Sha256::digest(token.as_bytes()));
        let acquisition = WeddingBinderAcquisition {
            utm_source: Some("test"),
            utm_medium: None,
            utm_campaign: None,
            intent: Some("dayof"),
            referrer_class: Some("direct"),
            device_class: Some("desktop"),
        };
        let first = db
            .prepare_wedding_binder_request(
                &email,
                true,
                "test-v1",
                Some(&digest),
                acquisition.clone(),
            )
            .await
            .expect("prepare");
        assert!(first.should_send);
        let repeat = db
            .prepare_wedding_binder_request(
                &email,
                true,
                "test-v1",
                Some(&hex::encode(Sha256::digest(b"other"))),
                acquisition,
            )
            .await
            .expect("repeat");
        assert!(!repeat.should_send);
        db.finish_wedding_binder_delivery(first.request_id.as_deref().unwrap(), true)
            .await
            .expect("delivery receipt");
        assert!(
            db.confirm_wedding_binder_tips(&digest)
                .await
                .expect("confirm")
        );
        assert!(
            db.confirm_wedding_binder_tips(&digest)
                .await
                .expect("idempotent confirm")
        );
        let source: String = sqlx::query_scalar(
            "SELECT source FROM wedding_newsletter_subscribers WHERE email = $1",
        )
        .bind(&email)
        .fetch_one(&db.pool)
        .await
        .expect("subscriber");
        assert_eq!(source, "day_of_binder");
        sqlx::query("DELETE FROM wedding_newsletter_subscribers WHERE email = $1")
            .bind(&email)
            .execute(&db.pool)
            .await
            .expect("newsletter cleanup");
        sqlx::query("DELETE FROM wedding_binder_requests WHERE email = $1")
            .bind(&email)
            .execute(&db.pool)
            .await
            .expect("binder cleanup");
    }
}
