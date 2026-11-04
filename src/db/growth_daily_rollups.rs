use super::Db;
use crate::growth_analytics::KPI_DEFINITION_VERSION;
use chrono::NaiveDate;
use serde::Serialize;
use sqlx::Row;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct GrowthDailyRollup {
    pub report_date: NaiveDate,
    pub landing_sessions: i64,
    pub first_party_landing_views: i64,
    pub registered_weddings: i64,
    pub activated_weddings: i64,
    pub returned_weddings_days_1_to_7: i64,
    pub paid_weddings: i64,
    pub spend_aud_minor: i64,
    pub meta_landing_views: i64,
    pub gross_minor: i64,
    pub refunded_minor: i64,
    pub tax_minor: Option<i64>,
    pub tax_complete: bool,
}

fn rollup_from_row(row: sqlx::postgres::PgRow) -> Result<GrowthDailyRollup, sqlx::Error> {
    Ok(GrowthDailyRollup {
        report_date: row.try_get("report_date")?,
        landing_sessions: row.try_get("landing_sessions")?,
        first_party_landing_views: row.try_get("first_party_landing_views")?,
        registered_weddings: row.try_get("registered_weddings")?,
        activated_weddings: row.try_get("activated_weddings")?,
        returned_weddings_days_1_to_7: row.try_get("returned_weddings_days_1_to_7")?,
        paid_weddings: row.try_get("paid_weddings")?,
        spend_aud_minor: row.try_get("spend_aud_minor")?,
        meta_landing_views: row.try_get("meta_landing_views")?,
        gross_minor: row.try_get("gross_minor")?,
        refunded_minor: row.try_get("refunded_minor")?,
        tax_minor: row.try_get("tax_minor")?,
        tax_complete: row.try_get("tax_complete")?,
    })
}

impl Db {
    async fn refresh_growth_daily_rollup_range(
        &self,
        from: NaiveDate,
        through: NaiveDate,
    ) -> Result<u64, sqlx::Error> {
        if through < from || (through - from).num_days() > 3_660 {
            return Err(sqlx::Error::Protocol("invalid Growth rollup range".into()));
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM growth_daily_rollups WHERE report_date BETWEEN $1 AND $2")
            .bind(from)
            .bind(through)
            .execute(&mut *tx)
            .await?;
        let inserted = sqlx::query(
            r#"
            WITH dates AS (
                SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS day
            ),
            spend AS (
                SELECT row.spend_date AS day,
                    SUM(row.aud_spend_minor + COALESCE(adj.aud_delta, 0))::bigint AS aud_minor,
                    SUM(COALESCE(row.platform_landing_views, 0))::bigint AS meta_lpv
                FROM growth_spend_rows row
                LEFT JOIN (
                    SELECT spend_row_id, SUM(aud_spend_delta_minor)::bigint AS aud_delta
                    FROM growth_spend_adjustments GROUP BY spend_row_id
                ) adj ON adj.spend_row_id = row.id
                WHERE row.spend_date BETWEEN $1 AND $2
                GROUP BY row.spend_date
            ),
            payment AS (
                SELECT (tx.paid_at AT TIME ZONE 'Australia/Sydney')::date AS day,
                    COUNT(DISTINCT (tx.owner_user_id, tx.wedding_plan_id))::bigint AS weddings,
                    SUM(tx.gross_minor)::bigint AS gross,
                    SUM(tx.refunded_minor)::bigint AS refunded,
                    CASE WHEN BOOL_AND(tx.tax_minor IS NOT NULL)
                         THEN SUM(tx.tax_minor)::bigint ELSE NULL END AS tax,
                    BOOL_AND(tx.tax_minor IS NOT NULL) AS tax_complete
                FROM growth_payment_transactions tx
                WHERE (tx.paid_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN $1 AND $2
                GROUP BY 1
            )
            INSERT INTO growth_daily_rollups (
                report_date, landing_sessions, first_party_landing_views,
                registered_weddings, activated_weddings, returned_weddings_days_1_to_7,
                paid_weddings, spend_aud_minor, meta_landing_views,
                gross_minor, refunded_minor, tax_minor, tax_complete, definition_version, rebuilt_at
            )
            SELECT d.day,
                (SELECT COUNT(*)::bigint FROM wedding_site_sessions s
                 WHERE (s.first_seen AT TIME ZONE 'Australia/Sydney')::date = d.day),
                (SELECT COUNT(DISTINCT e.visit_id)::bigint FROM wedding_site_events e
                 WHERE e.event = 'landing_page_view'
                   AND (e.occurred_at AT TIME ZONE 'Australia/Sydney')::date = d.day),
                (SELECT COUNT(DISTINCT link.wedding_plan_id)::bigint
                 FROM growth_identity_links link JOIN users u ON u.id = link.user_id
                 WHERE link.wedding_plan_id IS NOT NULL
                   AND (u.created_at AT TIME ZONE 'Australia/Sydney')::date = d.day),
                (SELECT COUNT(DISTINCT (a.owner_user_id, a.wedding_plan_id))::bigint
                 FROM growth_wedding_activations a
                 WHERE (a.activated_at AT TIME ZONE 'Australia/Sydney')::date = d.day),
                (SELECT COUNT(DISTINCT (activity.owner_user_id, activity.wedding_plan_id))::bigint
                 FROM growth_wedding_activity_daily activity
                 JOIN growth_wedding_activations activation
                   ON activation.owner_user_id = activity.owner_user_id
                  AND activation.wedding_plan_id = activity.wedding_plan_id
                 WHERE activity.activity_date = d.day
                   AND activity.activity_date -
                       (activation.activated_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN 1 AND 7),
                COALESCE(p.weddings, 0), COALESCE(s.aud_minor, 0), COALESCE(s.meta_lpv, 0),
                COALESCE(p.gross, 0), COALESCE(p.refunded, 0), p.tax,
                COALESCE(p.tax_complete, FALSE), $3, NOW()
            FROM dates d
            LEFT JOIN spend s ON s.day = d.day
            LEFT JOIN payment p ON p.day = d.day
            ORDER BY d.day
            "#,
        )
        .bind(from)
        .bind(through)
        .bind(KPI_DEFINITION_VERSION)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        tx.commit().await?;
        Ok(inserted)
    }

    pub async fn rebuild_growth_daily_rollups(
        &self,
        from: NaiveDate,
        through: NaiveDate,
    ) -> Result<u64, sqlx::Error> {
        self.refresh_growth_daily_rollup_range(from, through).await
    }

    pub async fn increment_growth_daily_rollups(
        &self,
        through: NaiveDate,
    ) -> Result<u64, sqlx::Error> {
        let checkpoint = sqlx::query(
            "SELECT last_completed_date,source_updated_at FROM growth_rollup_checkpoints WHERE projector_key='growth-daily-v1'",
        )
        .fetch_optional(&self.pool)
        .await?;
        let default_start = through
            .checked_sub_days(chrono::Days::new(30))
            .ok_or_else(|| sqlx::Error::Protocol("invalid Growth checkpoint date".into()))?;
        let mut from = default_start;
        let mut source_updated_at = chrono::DateTime::<chrono::Utc>::UNIX_EPOCH;
        if let Some(checkpoint) = checkpoint {
            let last: NaiveDate = checkpoint.try_get("last_completed_date")?;
            source_updated_at = checkpoint.try_get("source_updated_at")?;
            from = last
                .checked_add_days(chrono::Days::new(1))
                .unwrap_or(through)
                .min(default_start);
            let corrected: Option<NaiveDate> = sqlx::query_scalar(
                r#"SELECT MIN(day) FROM (
                    SELECT (paid_at AT TIME ZONE 'Australia/Sydney')::date AS day
                    FROM growth_payment_transactions WHERE updated_at > $1
                    UNION ALL
                    SELECT row.spend_date AS day FROM growth_spend_adjustments adjustment
                    JOIN growth_spend_rows row ON row.id=adjustment.spend_row_id
                    WHERE adjustment.created_at > $1
                ) changed"#,
            )
            .bind(source_updated_at)
            .fetch_one(&self.pool)
            .await?;
            if let Some(corrected) = corrected {
                from = from.min(corrected);
            }
        } else {
            let earliest: Option<NaiveDate> = sqlx::query_scalar(
                r#"SELECT MIN(day) FROM (
                    SELECT (first_seen AT TIME ZONE 'Australia/Sydney')::date AS day FROM wedding_site_sessions
                    UNION ALL SELECT (created_at AT TIME ZONE 'Australia/Sydney')::date FROM growth_weddings
                    UNION ALL SELECT spend_date FROM growth_spend_rows
                    UNION ALL SELECT (paid_at AT TIME ZONE 'Australia/Sydney')::date FROM growth_payment_transactions
                ) source_days"#,
            )
            .fetch_one(&self.pool)
            .await?;
            if let Some(earliest) = earliest {
                from = earliest.min(default_start);
            }
        }
        if from > through {
            return Ok(0);
        }
        let updated = self
            .refresh_growth_daily_rollup_range(from, through)
            .await?;
        sqlx::query(
            "INSERT INTO growth_rollup_checkpoints (projector_key,last_completed_date,source_updated_at,updated_at) VALUES ('growth-daily-v1',$1,NOW(),NOW()) ON CONFLICT (projector_key) DO UPDATE SET last_completed_date=EXCLUDED.last_completed_date,source_updated_at=EXCLUDED.source_updated_at,updated_at=NOW()",
        )
        .bind(through)
        .execute(&self.pool)
        .await?;
        let _ = source_updated_at;
        Ok(updated)
    }

    pub async fn list_growth_daily_rollups(
        &self,
        from: NaiveDate,
        through: NaiveDate,
    ) -> Result<Vec<GrowthDailyRollup>, sqlx::Error> {
        sqlx::query(
            "SELECT report_date,landing_sessions,first_party_landing_views,registered_weddings,activated_weddings,returned_weddings_days_1_to_7,paid_weddings,spend_aud_minor,meta_landing_views,gross_minor,refunded_minor,tax_minor,tax_complete FROM growth_daily_rollups WHERE report_date BETWEEN $1 AND $2 ORDER BY report_date",
        )
        .bind(from)
        .bind(through)
        .fetch_all(&self.pool)
        .await?
        .into_iter()
        .map(rollup_from_row)
        .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db::{UserRecord, WeddingSiteEventWrite, WeddingSiteSessionWrite},
        growth_analytics::{SpendConversion, preview_spend_csv},
    };
    use serde_json::json;
    use ulid::Ulid;

    fn date(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[tokio::test]
    async fn disposable_postgres_incremental_and_rebuild_rollups_match() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }
        let db = Db::new(&std::env::var("DATABASE_URL").expect("DATABASE_URL"))
            .await
            .expect("connect and migrate");
        let suffix = Ulid::new().to_string().to_lowercase();
        let user = UserRecord {
            id: format!("growth-rollup-{suffix}"),
            email: format!("growth-rollup-{suffix}@omnyid.test"),
            password_hash: Some("test".into()),
            auth_provider: "password".into(),
            google_sub: None,
            display_name: "Growth rollup fixture".into(),
            created_at: "2026-11-01T01:00:00Z".into(),
        };
        db.create_user(&user).await.unwrap();
        sqlx::query("UPDATE users SET created_at='2026-11-01T01:00:00Z' WHERE id=$1")
            .bind(&user.id)
            .execute(&db.pool)
            .await
            .unwrap();
        let visit_id = Ulid::new().to_string()[..12].to_string();
        db.record_wedding_site_events(
            &WeddingSiteSessionWrite {
                visit_id: visit_id.clone(),
                utm_source: Some("instagram".into()),
                utm_medium: Some("paid_social".into()),
                utm_campaign: Some("spring_fixture".into()),
                utm_content: None,
                utm_term: None,
                intent: Some("binder".into()),
                ad_click_present: true,
                referrer_class: Some("social".into()),
                referrer_host: None,
                device_class: Some("mobile".into()),
                language: Some("en-AU".into()),
                landing_path: "/wedding/".into(),
            },
            &[WeddingSiteEventWrite {
                event_id: "rollupfixture001".into(),
                event: "landing_page_view".into(),
                page: "/wedding/".into(),
                props: json!({"schema_version":"public-measurement.v1"}),
            }],
        )
        .await
        .unwrap();
        sqlx::query(
            "UPDATE wedding_site_sessions SET first_seen='2026-11-01T01:00:00Z' WHERE visit_id=$1",
        )
        .bind(&visit_id)
        .execute(&db.pool)
        .await
        .unwrap();
        sqlx::query(
            "UPDATE wedding_site_events SET occurred_at='2026-11-01T01:01:00Z' WHERE visit_id=$1",
        )
        .bind(&visit_id)
        .execute(&db.pool)
        .await
        .unwrap();
        let plan = format!("wedding_plan:{suffix}");
        sqlx::query("INSERT INTO growth_acquisition_touches (visit_id,touch_class,utm_source,utm_medium,utm_campaign,intent,landing_path,first_seen,expires_at) VALUES ($1,'paid_social','instagram','paid_social','spring_fixture','binder','/wedding/','2026-11-01T01:00:00Z','2026-11-20T01:00:00Z')")
            .bind(&visit_id).execute(&db.pool).await.unwrap();
        sqlx::query("INSERT INTO growth_identity_links (user_id,visit_id,wedding_plan_id,linked_at,expires_at) VALUES ($1,$2,$3,'2026-11-01T01:05:00Z','2026-11-20T01:05:00Z')")
            .bind(&user.id).bind(&visit_id).bind(&plan).execute(&db.pool).await.unwrap();
        sqlx::query("INSERT INTO growth_weddings (owner_user_id,wedding_plan_id,created_source_message_id,created_at,definition_version) VALUES ($1,$2,$3,'2026-11-01T02:00:00Z','activation-v1')")
            .bind(&user.id).bind(&plan).bind(format!("source-{suffix}"))
            .execute(&db.pool).await.unwrap();
        sqlx::query("INSERT INTO growth_wedding_activations (owner_user_id,wedding_plan_id,first_event_name,first_source_message_id,activated_at,definition_version) VALUES ($1,$2,'wedding_plan_saved',$3,'2026-11-01T02:00:00Z','activation-v1')")
            .bind(&user.id).bind(&plan).bind(format!("source-{suffix}"))
            .execute(&db.pool).await.unwrap();
        sqlx::query("INSERT INTO growth_wedding_activity_daily (owner_user_id,wedding_plan_id,activity_date,activity_count,first_activity_at,last_activity_at,definition_version) VALUES ($1,$2,'2026-11-03',1,'2026-11-03T01:00:00Z','2026-11-03T01:00:00Z','activation-v1')")
            .bind(&user.id).bind(&plan).execute(&db.pool).await.unwrap();

        let conversion = SpendConversion {
            source_currency: "AUD".into(),
            aud_rate_micros: 1_000_000,
            source: "AUD native".into(),
            date: date("2026-11-01"),
        };
        let preview = preview_spend_csv(
            b"Date,Campaign ID,Amount spent,Currency,Landing page views\n2026-11-01,spring_fixture,200.00,AUD,900\n",
            "meta",
            &conversion,
        );
        let import = db
            .commit_growth_spend_import(
                &user.id,
                "rollup.csv",
                "meta",
                &preview,
                None,
                json!({"fixture":true}),
            )
            .await
            .unwrap();
        assert_eq!(import.inserted_rows, 1);

        let from = date("2026-11-01");
        let through = date("2026-11-04");
        db.rebuild_growth_daily_rollups(from, through)
            .await
            .unwrap();
        let rebuilt = db.list_growth_daily_rollups(from, through).await.unwrap();
        assert_eq!(rebuilt[0].landing_sessions, 1);
        assert_eq!(rebuilt[0].first_party_landing_views, 1);
        assert_eq!(rebuilt[0].meta_landing_views, 900);
        assert_eq!(rebuilt[0].spend_aud_minor, 20_000);
        assert_eq!(rebuilt[0].registered_weddings, 1);
        assert_eq!(rebuilt[0].activated_weddings, 1);
        assert_eq!(rebuilt[2].returned_weddings_days_1_to_7, 1);

        sqlx::query("DELETE FROM growth_daily_rollups")
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM growth_rollup_checkpoints")
            .execute(&db.pool)
            .await
            .unwrap();
        db.increment_growth_daily_rollups(through).await.unwrap();
        let incremental = db.list_growth_daily_rollups(from, through).await.unwrap();
        assert_eq!(incremental, rebuilt);

        sqlx::query("DELETE FROM growth_daily_rollups")
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM growth_rollup_checkpoints")
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM growth_spend_audit WHERE operator_user_id=$1")
            .bind(&user.id)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM growth_spend_rows WHERE import_id=$1")
            .bind(&import.import_id)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM growth_spend_imports WHERE id=$1")
            .bind(&import.import_id)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM users WHERE id=$1")
            .bind(&user.id)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM wedding_site_sessions WHERE visit_id=$1")
            .bind(&visit_id)
            .execute(&db.pool)
            .await
            .unwrap();
    }
}
