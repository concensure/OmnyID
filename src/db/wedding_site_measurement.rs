// @locs-version: 2.0
use super::Db;
use serde_json::{Value, json};
use sqlx::Row;

#[derive(Clone, Debug)]
pub struct WeddingSiteSessionWrite {
    pub visit_id: String,
    pub utm_source: Option<String>,
    pub utm_medium: Option<String>,
    pub utm_campaign: Option<String>,
    pub utm_content: Option<String>,
    pub utm_term: Option<String>,
    pub intent: Option<String>,
    pub ad_click_present: bool,
    pub referrer_class: Option<String>,
    pub referrer_host: Option<String>,
    pub device_class: Option<String>,
    pub language: Option<String>,
    pub landing_path: String,
}

#[derive(Clone, Debug)]
pub struct WeddingSiteEventWrite {
    pub event_id: String,
    pub event: String,
    pub page: String,
    pub props: Value,
}

impl Db {
    pub async fn record_wedding_site_events(
        &self,
        session: &WeddingSiteSessionWrite,
        events: &[WeddingSiteEventWrite],
    ) -> Result<(), sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query(
            r#"
            INSERT INTO wedding_site_sessions (
                visit_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                intent, ad_click_present, referrer_class, referrer_host,
                device_class, language, landing_path
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT (visit_id) DO NOTHING
            "#,
        )
        .bind(&session.visit_id)
        .bind(&session.utm_source)
        .bind(&session.utm_medium)
        .bind(&session.utm_campaign)
        .bind(&session.utm_content)
        .bind(&session.utm_term)
        .bind(&session.intent)
        .bind(session.ad_click_present)
        .bind(&session.referrer_class)
        .bind(&session.referrer_host)
        .bind(&session.device_class)
        .bind(&session.language)
        .bind(&session.landing_path)
        .execute(&mut *transaction)
        .await?;

        for event in events {
            sqlx::query(
                r#"
                INSERT INTO wedding_site_events (event_id, visit_id, event, page, props)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (visit_id, event_id) DO NOTHING
                "#,
            )
            .bind(&event.event_id)
            .bind(&session.visit_id)
            .bind(&event.event)
            .bind(&event.page)
            .bind(&event.props)
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        Ok(())
    }

    pub async fn prune_wedding_site_measurement_batch(
        &self,
        retention_days: i32,
        batch_size: i64,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            r#"
            WITH stale AS (
                SELECT visit_id
                FROM wedding_site_sessions
                WHERE first_seen < NOW() - make_interval(days => $1::int)
                ORDER BY first_seen, visit_id
                LIMIT $2
                FOR UPDATE SKIP LOCKED
            )
            DELETE FROM wedding_site_sessions session
            USING stale
            WHERE session.visit_id = stale.visit_id
            "#,
        )
        .bind(retention_days)
        .bind(batch_size)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn wedding_site_stats(&self, from: &str, to: &str) -> Result<Value, sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT event, COUNT(*)::bigint AS count
            FROM wedding_site_events
            WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
            GROUP BY event ORDER BY event
            "#,
        )
        .bind(from)
        .bind(to)
        .fetch_all(&self.pool)
        .await?;
        let channels = sqlx::query(
            r#"
            SELECT COALESCE(utm_source, referrer_class, 'direct') AS channel,
                   COALESCE(intent, 'unspecified') AS intent,
                   COALESCE(device_class, 'unknown') AS device_class,
                   COUNT(*)::bigint AS visits
            FROM wedding_site_sessions
            WHERE first_seen >= $1::timestamptz AND first_seen < $2::timestamptz
            GROUP BY 1, 2, 3 ORDER BY visits DESC
            "#,
        )
        .bind(from)
        .bind(to)
        .fetch_all(&self.pool)
        .await?;
        Ok(json!({
            "events": rows.into_iter().map(|row| json!({
                "event": row.get::<String, _>("event"),
                "count": row.get::<i64, _>("count")
            })).collect::<Vec<_>>(),
            "channels": channels.into_iter().map(|row| json!({
                "channel": row.get::<String, _>("channel"),
                "intent": row.get::<String, _>("intent"),
                "device_class": row.get::<String, _>("device_class"),
                "visits": row.get::<i64, _>("visits")
            })).collect::<Vec<_>>()
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ulid::Ulid;

    #[tokio::test]
    async fn disposable_postgres_measurement_records_only_supplied_bounded_projection() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }
        let db = Db::new(&std::env::var("DATABASE_URL").expect("DATABASE_URL"))
            .await
            .expect("connect and migrate");
        let visit_id = Ulid::new().to_string()[..12].to_string();
        let session = WeddingSiteSessionWrite {
            visit_id: visit_id.clone(),
            utm_source: Some("test".into()),
            utm_medium: None,
            utm_campaign: None,
            utm_content: None,
            utm_term: None,
            intent: Some("quiz".into()),
            ad_click_present: false,
            referrer_class: Some("direct".into()),
            referrer_host: None,
            device_class: Some("desktop".into()),
            language: Some("en".into()),
            landing_path: "/wedding/animal-quiz.html".into(),
        };
        db.record_wedding_site_events(
            &session,
            &[WeddingSiteEventWrite {
                event_id: "a1b2c3d4e5f6g7h8".into(),
                event: "quiz_started".into(),
                page: "/wedding/animal-quiz.html".into(),
                props: json!({"quiz_version":"2"}),
            }],
        )
        .await
        .expect("record");
        db.record_wedding_site_events(
            &session,
            &[
                WeddingSiteEventWrite {
                    event_id: "a1b2c3d4e5f6g7h8".into(),
                    event: "quiz_started".into(),
                    page: "/wedding/animal-quiz.html".into(),
                    props: json!({"quiz_version":"2"}),
                },
                WeddingSiteEventWrite {
                    event_id: "b1b2c3d4e5f6g7h8".into(),
                    event: "quiz_completed".into(),
                    page: "/wedding/animal-quiz.html".into(),
                    props: json!({"quiz_version":"2"}),
                },
            ],
        )
        .await
        .expect("replay and new event");
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM wedding_site_events WHERE visit_id = $1")
                .bind(&visit_id)
                .fetch_one(&db.pool)
                .await
                .expect("count");
        assert_eq!(count, 2);
        sqlx::query(
            "UPDATE wedding_site_sessions SET first_seen = NOW() - INTERVAL '31 days' WHERE visit_id = $1",
        )
            .bind(&visit_id)
            .execute(&db.pool)
            .await
            .expect("age disposable session");
        let deleted = db
            .prune_wedding_site_measurement_batch(30, 100)
            .await
            .expect("bounded retention cleanup");
        assert!(deleted >= 1);
        let remaining: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM wedding_site_events WHERE visit_id = $1")
                .bind(&visit_id)
                .fetch_one(&db.pool)
                .await
                .expect("count cascaded events");
        assert_eq!(remaining, 0);
    }
}
