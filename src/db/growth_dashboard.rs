use chrono::{Days, NaiveDate};
use serde::Serialize;
use sqlx::Row;
use ulid::Ulid;

use super::Db;
use crate::growth_analytics::GrowthPeriodFacts;

#[derive(Clone, Debug, Serialize)]
pub struct GrowthCampaignRow {
    pub source: String,
    pub medium: String,
    pub campaign: String,
    pub intent: String,
    pub spend_aud_minor: i64,
    pub meta_landing_views: i64,
    pub first_party_landing_sessions: i64,
    pub registered_weddings: i64,
    pub activated_weddings: i64,
    pub returned_weddings_days_1_to_7: i64,
    pub paid_weddings_within_30d: i64,
    pub gross_minor: i64,
    pub refunded_minor: i64,
}

#[derive(Clone, Debug, Serialize)]
pub struct GrowthCohortRow {
    pub week_start: NaiveDate,
    pub registered_weddings: i64,
    pub mature_registered_weddings_7d: i64,
    pub activated_within_7d: i64,
    pub mature_activated_weddings_7d: i64,
    pub returned_weddings_days_1_to_7: i64,
    pub mature_registered_weddings_30d: i64,
    pub paid_within_30d: i64,
}

#[derive(Clone, Debug, Serialize)]
pub struct GrowthQualitySummary {
    pub latest_public_event_at: Option<String>,
    pub latest_spend_import_at: Option<String>,
    pub latest_rollup_at: Option<String>,
    pub first_party_landing_views: i64,
    pub meta_landing_views: i64,
    pub unattributed_sessions: i64,
    pub unmatched_spend_aud_minor: i64,
    pub payment_rows: i64,
    pub payment_rows_missing_tax: i64,
    pub duplicate_events_discarded: Option<i64>,
    pub bot_or_test_events_excluded: Option<i64>,
    pub immature_registered_weddings_7d: i64,
    pub immature_activated_weddings_7d: i64,
}

#[derive(Clone, Debug, Serialize)]
pub struct GrowthBenchmarkRevision {
    pub id: String,
    pub kpi_key: String,
    pub target_value: i64,
    pub unit: String,
    pub direction: String,
    pub effective_from: NaiveDate,
    pub effective_through: Option<NaiveDate>,
    pub rationale: String,
    pub supersedes_id: Option<String>,
    pub created_by_user_id: String,
    pub created_at: String,
}

pub struct GrowthBenchmarkWrite<'a> {
    pub kpi_key: &'a str,
    pub target_value: i64,
    pub unit: &'a str,
    pub direction: &'a str,
    pub effective_from: NaiveDate,
    pub effective_through: Option<NaiveDate>,
    pub rationale: &'a str,
}

impl Db {
    pub async fn growth_period_facts(
        &self,
        from: NaiveDate,
        through: NaiveDate,
    ) -> Result<GrowthPeriodFacts, sqlx::Error> {
        let row = sqlx::query(
            r#"
            WITH acquired AS (
                SELECT DISTINCT link.user_id, link.wedding_plan_id, u.created_at AS registered_at
                FROM growth_identity_links link
                JOIN users u ON u.id=link.user_id
                WHERE link.wedding_plan_id IS NOT NULL
                  AND (u.created_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN $1 AND $2
            ), spend AS (
                SELECT COALESCE(SUM(row.aud_spend_minor + COALESCE(adjustment.delta,0)),0)::bigint AS total
                FROM growth_spend_rows row
                LEFT JOIN (
                    SELECT spend_row_id,SUM(aud_spend_delta_minor)::bigint AS delta
                    FROM growth_spend_adjustments GROUP BY spend_row_id
                ) adjustment ON adjustment.spend_row_id=row.id
                WHERE row.spend_date BETWEEN $1 AND $2
            ), sessions AS (
                SELECT COUNT(DISTINCT session.visit_id)::bigint AS total
                FROM wedding_site_sessions session
                WHERE (session.first_seen AT TIME ZONE 'Australia/Sydney')::date BETWEEN $1 AND $2
            )
            SELECT
                (SELECT total FROM spend) AS spend,
                (SELECT total FROM sessions) AS sessions,
                COUNT(*)::bigint AS registered,
                COUNT(*) FILTER (WHERE $2 >= (acquired.registered_at AT TIME ZONE 'Australia/Sydney')::date + 7)::bigint AS mature_registered_7d,
                COUNT(*) FILTER (WHERE activation.activated_at <= acquired.registered_at + INTERVAL '7 days')::bigint AS activated_7d,
                COUNT(*) FILTER (WHERE activation.activated_at IS NOT NULL)::bigint AS activated,
                COUNT(*) FILTER (WHERE activation.activated_at IS NOT NULL AND $2 >= (activation.activated_at AT TIME ZONE 'Australia/Sydney')::date + 8)::bigint AS mature_activated_7d,
                COUNT(*) FILTER (WHERE activation.activated_at IS NOT NULL AND EXISTS (
                    SELECT 1 FROM growth_wedding_activity_daily activity
                    WHERE activity.owner_user_id=acquired.user_id
                      AND activity.wedding_plan_id=acquired.wedding_plan_id
                      AND activity.activity_date - (activation.activated_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN 1 AND 7
                ))::bigint AS returned_7d,
                COUNT(*) FILTER (WHERE $2 >= (acquired.registered_at AT TIME ZONE 'Australia/Sydney')::date + 30)::bigint AS mature_30d,
                COUNT(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM growth_payment_transactions payment
                    WHERE payment.owner_user_id=acquired.user_id
                      AND payment.wedding_plan_id=acquired.wedding_plan_id
                      AND payment.paid_at <= acquired.registered_at + INTERVAL '30 days'
                ))::bigint AS paid_30d,
                MAX((acquired.registered_at AT TIME ZONE 'Australia/Sydney')::date + 7) AS registration_matures,
                MAX((activation.activated_at AT TIME ZONE 'Australia/Sydney')::date + 8) AS activation_matures,
                MAX((acquired.registered_at AT TIME ZONE 'Australia/Sydney')::date + 30) AS paid_matures
            FROM acquired
            LEFT JOIN growth_wedding_activations activation
              ON activation.owner_user_id=acquired.user_id
             AND activation.wedding_plan_id=acquired.wedding_plan_id
            "#,
        )
        .bind(from)
        .bind(through)
        .fetch_one(&self.pool)
        .await?;
        Ok(GrowthPeriodFacts {
            spend_aud_minor: row.try_get("spend")?,
            spend_complete: true,
            first_party_landing_sessions: row.try_get("sessions")?,
            registered_weddings: row.try_get("registered")?,
            mature_registered_weddings_7d: row.try_get("mature_registered_7d")?,
            activated_within_7d: row.try_get("activated_7d")?,
            activated_acquired_weddings: row.try_get("activated")?,
            mature_activated_weddings_7d: row.try_get("mature_activated_7d")?,
            returned_weddings_days_1_to_7: row.try_get("returned_7d")?,
            mature_acquired_weddings_30d: row.try_get("mature_30d")?,
            paid_weddings_within_30d: row.try_get("paid_30d")?,
            latest_registration_matures_on: row.try_get("registration_matures")?,
            latest_activation_matures_on: row.try_get("activation_matures")?,
            latest_paid_matures_on: row.try_get("paid_matures")?,
        })
    }

    pub async fn growth_campaign_rows(
        &self,
        from: NaiveDate,
        through: NaiveDate,
        offset: i64,
        limit: i64,
        source: Option<&str>,
    ) -> Result<Vec<GrowthCampaignRow>, sqlx::Error> {
        sqlx::query(
            r#"
            WITH attributed AS (
                SELECT
                    COALESCE(touch.utm_source,'unknown') AS source,
                    COALESCE(touch.utm_medium,'unknown') AS medium,
                    COALESCE(touch.utm_campaign,'unknown') AS campaign,
                    COALESCE(touch.intent,'none') AS intent,
                    COUNT(DISTINCT touch.visit_id)::bigint AS sessions,
                    COUNT(DISTINCT link.wedding_plan_id)::bigint AS registered,
                    COUNT(DISTINCT (activation.owner_user_id,activation.wedding_plan_id))::bigint AS activated,
                    COUNT(DISTINCT link.wedding_plan_id) FILTER (WHERE EXISTS (
                        SELECT 1 FROM growth_wedding_activity_daily activity
                        WHERE activity.owner_user_id=link.user_id
                          AND activity.wedding_plan_id=link.wedding_plan_id
                          AND activity.activity_date - (activation.activated_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN 1 AND 7
                    ))::bigint AS returned,
                    COUNT(DISTINCT link.wedding_plan_id) FILTER (WHERE EXISTS (
                        SELECT 1 FROM growth_payment_transactions payment
                        WHERE payment.owner_user_id=link.user_id
                          AND payment.wedding_plan_id=link.wedding_plan_id
                          AND payment.paid_at <= u.created_at + INTERVAL '30 days'
                    ))::bigint AS paid,
                    COALESCE(SUM((SELECT SUM(payment.gross_minor) FROM growth_payment_transactions payment
                        WHERE payment.owner_user_id=link.user_id AND payment.wedding_plan_id=link.wedding_plan_id)),0)::bigint AS gross,
                    COALESCE(SUM((SELECT SUM(payment.refunded_minor) FROM growth_payment_transactions payment
                        WHERE payment.owner_user_id=link.user_id AND payment.wedding_plan_id=link.wedding_plan_id)),0)::bigint AS refunded
                FROM growth_acquisition_touches touch
                LEFT JOIN growth_identity_links link ON link.visit_id=touch.visit_id
                LEFT JOIN users u ON u.id=link.user_id
                LEFT JOIN growth_wedding_activations activation
                  ON activation.owner_user_id=link.user_id AND activation.wedding_plan_id=link.wedding_plan_id
                WHERE (touch.first_seen AT TIME ZONE 'Australia/Sydney')::date BETWEEN $1 AND $2
                GROUP BY 1,2,3,4
            ), spend AS (
                SELECT
                    COALESCE(row.platform,'unknown') AS source,
                    'paid'::text AS medium,
                    COALESCE(row.campaign_id,row.campaign_name,'unmatched') AS campaign,
                    'none'::text AS intent,
                    SUM(row.aud_spend_minor + COALESCE(adjustment.delta,0))::bigint AS spend,
                    COALESCE(SUM(row.platform_landing_views),0)::bigint AS meta_lpv
                FROM growth_spend_rows row
                LEFT JOIN (
                    SELECT spend_row_id,SUM(aud_spend_delta_minor)::bigint AS delta
                    FROM growth_spend_adjustments GROUP BY spend_row_id
                ) adjustment ON adjustment.spend_row_id=row.id
                WHERE row.spend_date BETWEEN $1 AND $2
                GROUP BY 1,2,3,4
            )
            SELECT
                COALESCE(attributed.source,spend.source) AS source,
                COALESCE(attributed.medium,spend.medium) AS medium,
                COALESCE(attributed.campaign,spend.campaign) AS campaign,
                COALESCE(attributed.intent,spend.intent) AS intent,
                COALESCE(spend.spend,0)::bigint AS spend,
                COALESCE(spend.meta_lpv,0)::bigint AS meta_lpv,
                COALESCE(attributed.sessions,0)::bigint AS sessions,
                COALESCE(attributed.registered,0)::bigint AS registered,
                COALESCE(attributed.activated,0)::bigint AS activated,
                COALESCE(attributed.returned,0)::bigint AS returned,
                COALESCE(attributed.paid,0)::bigint AS paid,
                COALESCE(attributed.gross,0)::bigint AS gross,
                COALESCE(attributed.refunded,0)::bigint AS refunded
            FROM attributed FULL OUTER JOIN spend
              ON attributed.source=spend.source AND attributed.campaign=spend.campaign
            WHERE ($5::text IS NULL OR lower(COALESCE(attributed.source,spend.source))=lower($5))
            ORDER BY spend DESC, sessions DESC, source, campaign
            OFFSET $3 LIMIT $4
            "#,
        )
        .bind(from)
        .bind(through)
        .bind(offset)
        .bind(limit)
        .bind(source)
        .fetch_all(&self.pool)
        .await?
        .into_iter()
        .map(|row| {
            Ok(GrowthCampaignRow {
                source: row.try_get("source")?,
                medium: row.try_get("medium")?,
                campaign: row.try_get("campaign")?,
                intent: row.try_get("intent")?,
                spend_aud_minor: row.try_get("spend")?,
                meta_landing_views: row.try_get("meta_lpv")?,
                first_party_landing_sessions: row.try_get("sessions")?,
                registered_weddings: row.try_get("registered")?,
                activated_weddings: row.try_get("activated")?,
                returned_weddings_days_1_to_7: row.try_get("returned")?,
                paid_weddings_within_30d: row.try_get("paid")?,
                gross_minor: row.try_get("gross")?,
                refunded_minor: row.try_get("refunded")?,
            })
        })
        .collect()
    }

    pub async fn audit_growth_export(
        &self,
        operator_user_id: &str,
        detail: serde_json::Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT INTO growth_admin_audit (action,operator_user_id,detail_json) VALUES ('export',$1,$2)")
        .bind(operator_user_id)
        .bind(detail)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn create_growth_benchmark_revision(
        &self,
        operator_user_id: &str,
        write: GrowthBenchmarkWrite<'_>,
    ) -> Result<GrowthBenchmarkRevision, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let supersedes_id: Option<String> = sqlx::query_scalar(
            "SELECT id FROM growth_benchmark_revisions WHERE kpi_key=$1 ORDER BY effective_from DESC,created_at DESC LIMIT 1 FOR UPDATE",
        )
        .bind(write.kpi_key)
        .fetch_optional(&mut *tx)
        .await?;
        let id = Ulid::new().to_string();
        let row = sqlx::query(
            r#"INSERT INTO growth_benchmark_revisions
               (id,kpi_key,target_value,unit,direction,effective_from,effective_through,rationale,supersedes_id,created_by_user_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               RETURNING id,kpi_key,target_value,unit,direction,effective_from,effective_through,rationale,supersedes_id,created_by_user_id,created_at::text"#,
        )
        .bind(&id)
        .bind(write.kpi_key)
        .bind(write.target_value)
        .bind(write.unit)
        .bind(write.direction)
        .bind(write.effective_from)
        .bind(write.effective_through)
        .bind(write.rationale)
        .bind(&supersedes_id)
        .bind(operator_user_id)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO growth_admin_audit (action,operator_user_id,detail_json) VALUES ('benchmark_created',$1,$2)")
            .bind(operator_user_id)
            .bind(serde_json::json!({"benchmark_id":id,"kpi_key":write.kpi_key,"supersedes_id":supersedes_id}))
            .execute(&mut *tx).await?;
        tx.commit().await?;
        benchmark_from_row(&row)
    }

    pub async fn list_growth_benchmark_revisions(
        &self,
        from: NaiveDate,
        through: NaiveDate,
    ) -> Result<Vec<GrowthBenchmarkRevision>, sqlx::Error> {
        sqlx::query(
            r#"SELECT id,kpi_key,target_value,unit,direction,effective_from,effective_through,rationale,
                      supersedes_id,created_by_user_id,created_at::text
               FROM growth_benchmark_revisions
               WHERE effective_from <= $2 AND (effective_through IS NULL OR effective_through >= $1)
               ORDER BY kpi_key,effective_from DESC,created_at DESC"#,
        )
        .bind(from)
        .bind(through)
        .fetch_all(&self.pool)
        .await?
        .iter()
        .map(benchmark_from_row)
        .collect()
    }

    pub async fn growth_cohort_rows(
        &self,
        from: NaiveDate,
        through: NaiveDate,
    ) -> Result<Vec<GrowthCohortRow>, sqlx::Error> {
        sqlx::query(
            r#"
            WITH acquired AS (
                SELECT DISTINCT link.user_id,link.wedding_plan_id,u.created_at AS registered_at,
                       date_trunc('week',u.created_at AT TIME ZONE 'Australia/Sydney')::date AS week_start
                FROM growth_identity_links link JOIN users u ON u.id=link.user_id
                WHERE link.wedding_plan_id IS NOT NULL
                  AND (u.created_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN $1 AND $2
            )
            SELECT acquired.week_start,
                COUNT(*)::bigint AS registered,
                COUNT(*) FILTER (WHERE $2 >= (acquired.registered_at AT TIME ZONE 'Australia/Sydney')::date + 7)::bigint AS mature_registered_7d,
                COUNT(*) FILTER (WHERE activation.activated_at <= acquired.registered_at + INTERVAL '7 days')::bigint AS activated_7d,
                COUNT(*) FILTER (WHERE activation.activated_at IS NOT NULL AND $2 >= (activation.activated_at AT TIME ZONE 'Australia/Sydney')::date + 8)::bigint AS mature_activated_7d,
                COUNT(*) FILTER (WHERE activation.activated_at IS NOT NULL AND EXISTS (
                    SELECT 1 FROM growth_wedding_activity_daily activity
                    WHERE activity.owner_user_id=acquired.user_id AND activity.wedding_plan_id=acquired.wedding_plan_id
                      AND activity.activity_date - (activation.activated_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN 1 AND 7
                ))::bigint AS returned_7d,
                COUNT(*) FILTER (WHERE $2 >= (acquired.registered_at AT TIME ZONE 'Australia/Sydney')::date + 30)::bigint AS mature_30d,
                COUNT(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM growth_payment_transactions payment
                    WHERE payment.owner_user_id=acquired.user_id AND payment.wedding_plan_id=acquired.wedding_plan_id
                      AND payment.paid_at <= acquired.registered_at + INTERVAL '30 days'
                ))::bigint AS paid_30d
            FROM acquired
            LEFT JOIN growth_wedding_activations activation
              ON activation.owner_user_id=acquired.user_id AND activation.wedding_plan_id=acquired.wedding_plan_id
            GROUP BY acquired.week_start ORDER BY acquired.week_start
            "#,
        )
        .bind(from)
        .bind(through)
        .fetch_all(&self.pool)
        .await?
        .into_iter()
        .map(|row| {
            Ok(GrowthCohortRow {
                week_start: row.try_get("week_start")?,
                registered_weddings: row.try_get("registered")?,
                mature_registered_weddings_7d: row.try_get("mature_registered_7d")?,
                activated_within_7d: row.try_get("activated_7d")?,
                mature_activated_weddings_7d: row.try_get("mature_activated_7d")?,
                returned_weddings_days_1_to_7: row.try_get("returned_7d")?,
                mature_registered_weddings_30d: row.try_get("mature_30d")?,
                paid_within_30d: row.try_get("paid_30d")?,
            })
        })
        .collect()
    }

    pub async fn growth_quality_summary(
        &self,
        from: NaiveDate,
        through: NaiveDate,
    ) -> Result<GrowthQualitySummary, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT
              (SELECT MAX(occurred_at)::text FROM wedding_site_events) AS latest_event,
              (SELECT MAX(committed_at)::text FROM growth_spend_imports) AS latest_import,
              (SELECT MAX(rebuilt_at)::text FROM growth_daily_rollups) AS latest_rollup,
              (SELECT COUNT(*)::bigint FROM wedding_site_events
               WHERE event IN ('landing_page_view','omnyid_landing_view')
                 AND (occurred_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN $1 AND $2) AS first_party_lpv,
              (SELECT COALESCE(SUM(platform_landing_views),0)::bigint FROM growth_spend_rows
               WHERE spend_date BETWEEN $1 AND $2) AS meta_lpv,
              (SELECT COUNT(*)::bigint FROM wedding_site_sessions
               WHERE (first_seen AT TIME ZONE 'Australia/Sydney')::date BETWEEN $1 AND $2
                 AND utm_source IS NULL AND referrer_class IN ('direct','unknown')) AS unattributed,
              (SELECT COALESCE(SUM(row.aud_spend_minor),0)::bigint FROM growth_spend_rows row
               WHERE row.spend_date BETWEEN $1 AND $2 AND NOT EXISTS (
                 SELECT 1 FROM growth_acquisition_touches touch
                 WHERE touch.utm_campaign=row.campaign_id OR touch.utm_campaign=row.campaign_name
               )) AS unmatched_spend,
              (SELECT COUNT(*)::bigint FROM growth_payment_transactions
               WHERE (paid_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN $1 AND $2) AS payment_rows,
              (SELECT COUNT(*)::bigint FROM growth_payment_transactions
               WHERE (paid_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN $1 AND $2 AND tax_minor IS NULL) AS missing_tax
              ,(SELECT COUNT(*)::bigint FROM growth_identity_links link JOIN users u ON u.id=link.user_id
                WHERE link.wedding_plan_id IS NOT NULL
                  AND (u.created_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN $1 AND $2
                  AND $2 < (u.created_at AT TIME ZONE 'Australia/Sydney')::date + 7) AS immature_registered
              ,(SELECT COUNT(*)::bigint FROM growth_wedding_activations activation
                JOIN growth_identity_links link ON link.user_id=activation.owner_user_id AND link.wedding_plan_id=activation.wedding_plan_id
                JOIN users u ON u.id=link.user_id
                WHERE (u.created_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN $1 AND $2
                  AND $2 < (activation.activated_at AT TIME ZONE 'Australia/Sydney')::date + 8) AS immature_activated
            "#,
        )
        .bind(from)
        .bind(through)
        .fetch_one(&self.pool)
        .await?;
        Ok(GrowthQualitySummary {
            latest_public_event_at: row.try_get("latest_event")?,
            latest_spend_import_at: row.try_get("latest_import")?,
            latest_rollup_at: row.try_get("latest_rollup")?,
            first_party_landing_views: row.try_get("first_party_lpv")?,
            meta_landing_views: row.try_get("meta_lpv")?,
            unattributed_sessions: row.try_get("unattributed")?,
            unmatched_spend_aud_minor: row.try_get("unmatched_spend")?,
            payment_rows: row.try_get("payment_rows")?,
            payment_rows_missing_tax: row.try_get("missing_tax")?,
            duplicate_events_discarded: None,
            bot_or_test_events_excluded: None,
            immature_registered_weddings_7d: row.try_get("immature_registered")?,
            immature_activated_weddings_7d: row.try_get("immature_activated")?,
        })
    }
}

fn benchmark_from_row(row: &sqlx::postgres::PgRow) -> Result<GrowthBenchmarkRevision, sqlx::Error> {
    Ok(GrowthBenchmarkRevision {
        id: row.try_get("id")?,
        kpi_key: row.try_get("kpi_key")?,
        target_value: row.try_get("target_value")?,
        unit: row.try_get("unit")?,
        direction: row.try_get("direction")?,
        effective_from: row.try_get("effective_from")?,
        effective_through: row.try_get("effective_through")?,
        rationale: row.try_get("rationale")?,
        supersedes_id: row.try_get("supersedes_id")?,
        created_by_user_id: row.try_get("created_by_user_id")?,
        created_at: row.try_get("created_at")?,
    })
}

pub fn validate_growth_date_range(from: NaiveDate, through: NaiveDate) -> Result<(), &'static str> {
    if through < from {
        return Err("through must not be before from");
    }
    if from
        .checked_add_days(Days::new(366))
        .is_some_and(|max| through > max)
    {
        return Err("date range must not exceed 366 days");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_ranges_are_ordered_and_bounded() {
        let from = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
        assert!(validate_growth_date_range(from, from).is_ok());
        assert!(validate_growth_date_range(from, from + chrono::Duration::days(366)).is_ok());
        assert!(validate_growth_date_range(from, from + chrono::Duration::days(367)).is_err());
        assert!(validate_growth_date_range(from, from - chrono::Duration::days(1)).is_err());
    }
}
