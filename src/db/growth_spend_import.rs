use super::Db;
use crate::growth_analytics::{SpendGrain, SpendImportPreview, SpendImportRow};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::Row;
use ulid::Ulid;

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct GrowthSpendCommitResult {
    pub import_id: String,
    pub duplicate_file: bool,
    pub selected_rows: usize,
    pub inserted_rows: usize,
    pub duplicate_rows: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct GrowthSpendAdjustmentResult {
    pub adjustment_id: String,
    pub effective_source_spend_minor: i64,
    pub effective_aud_spend_minor: i64,
}

fn valid_filename(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()
        && value.len() <= 240
        && !value.chars().any(char::is_control)
        && !value.contains(['/', '\\']))
    .then(|| value.to_string())
}

async fn insert_spend_row(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    import_id: &str,
    row: &SpendImportRow,
) -> Result<bool, sqlx::Error> {
    let inserted = sqlx::query(
        "INSERT INTO growth_spend_rows (id,import_id,source_row_number,source_row_digest,spend_date,platform,account_id,account_name,campaign_id,campaign_name,ad_set_id,ad_set_name,ad_id,ad_name,creative_id,creative_name,placement,grain,source_spend_minor,source_currency,aud_spend_minor,aud_rate_micros,conversion_source,conversion_date,impressions,clicks,platform_landing_views) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) ON CONFLICT (source_row_digest) DO NOTHING",
    )
    .bind(format!("growth_spend_row:{}", Ulid::new()))
    .bind(import_id)
    .bind(row.source_row_number as i32)
    .bind(&row.source_row_digest)
    .bind(row.spend_date)
    .bind(&row.platform)
    .bind(&row.account_id)
    .bind(&row.account_name)
    .bind(&row.campaign_id)
    .bind(&row.campaign_name)
    .bind(&row.ad_set_id)
    .bind(&row.ad_set_name)
    .bind(&row.ad_id)
    .bind(&row.ad_name)
    .bind(&row.creative_id)
    .bind(&row.creative_name)
    .bind(&row.placement)
    .bind(row.grain.as_str())
    .bind(row.source_spend_minor)
    .bind(&row.source_currency)
    .bind(row.aud_spend_minor)
    .bind(row.aud_rate_micros)
    .bind(&row.conversion_source)
    .bind(row.conversion_date)
    .bind(row.impressions)
    .bind(row.clicks)
    .bind(row.platform_landing_views)
    .execute(&mut **tx)
    .await?
    .rows_affected()
        == 1;
    Ok(inserted)
}

impl Db {
    pub async fn audit_growth_spend_preview(
        &self,
        operator_user_id: &str,
        preview: &SpendImportPreview,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO growth_spend_audit (action,operator_user_id,detail_json) VALUES ('preview',$1,$2)",
        )
        .bind(operator_user_id)
        .bind(json!({
            "content_sha256": preview.content_sha256,
            "file_bytes": preview.file_bytes,
            "source_row_count": preview.source_row_count,
            "valid_row_count": preview.rows.len(),
            "error_count": preview.errors.len(),
            "requires_grain_selection": preview.requires_grain_selection,
        }))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn commit_growth_spend_import(
        &self,
        operator_user_id: &str,
        original_filename: &str,
        platform: &str,
        preview: &SpendImportPreview,
        selected_grain: Option<SpendGrain>,
        decision_json: Value,
    ) -> Result<GrowthSpendCommitResult, sqlx::Error> {
        let filename = valid_filename(original_filename)
            .ok_or_else(|| sqlx::Error::Protocol("invalid spend import filename".into()))?;
        let platform = platform.trim();
        if platform.is_empty() || platform.len() > 40 {
            return Err(sqlx::Error::Protocol("invalid spend platform".into()));
        }
        let rows = preview
            .committable_rows(selected_grain)
            .map_err(sqlx::Error::Protocol)?;
        let mut tx = self.pool.begin().await?;
        let import_id = format!("growth_spend_import:{}", Ulid::new());
        let inserted_import = sqlx::query(
            "INSERT INTO growth_spend_imports (id,content_sha256,original_filename,platform,file_bytes,source_row_count,selected_grain,mapping_json,decision_json,operator_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (content_sha256) DO NOTHING",
        )
        .bind(&import_id)
        .bind(&preview.content_sha256)
        .bind(&filename)
        .bind(platform)
        .bind(preview.file_bytes as i64)
        .bind(preview.source_row_count as i32)
        .bind(selected_grain.map(SpendGrain::as_str))
        .bind(serde_json::to_value(&preview.mapping).unwrap_or_else(|_| json!({})))
        .bind(&decision_json)
        .bind(operator_user_id)
        .execute(&mut *tx)
        .await?
        .rows_affected()
            == 1;
        if !inserted_import {
            let existing = sqlx::query_scalar::<_, String>(
                "SELECT id FROM growth_spend_imports WHERE content_sha256=$1",
            )
            .bind(&preview.content_sha256)
            .fetch_one(&mut *tx)
            .await?;
            sqlx::query(
                "INSERT INTO growth_spend_audit (action,import_id,operator_user_id,detail_json) VALUES ('commit',$1,$2,$3)",
            )
            .bind(&existing)
            .bind(operator_user_id)
            .bind(json!({"duplicate_file": true, "content_sha256": preview.content_sha256}))
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            return Ok(GrowthSpendCommitResult {
                import_id: existing,
                duplicate_file: true,
                selected_rows: rows.len(),
                ..Default::default()
            });
        }
        let mut inserted_rows = 0;
        for row in &rows {
            inserted_rows += usize::from(insert_spend_row(&mut tx, &import_id, row).await?);
        }
        sqlx::query(
            "UPDATE growth_spend_imports SET committed_row_count=$2,committed_at=NOW() WHERE id=$1",
        )
        .bind(&import_id)
        .bind(inserted_rows as i32)
        .execute(&mut *tx)
        .await?;
        let audit_action =
            if decision_json.get("entry_mode").and_then(Value::as_str) == Some("manual") {
                "manual_row"
            } else {
                "commit"
            };
        sqlx::query(
            "INSERT INTO growth_spend_audit (action,import_id,operator_user_id,detail_json) VALUES ($1,$2,$3,$4)",
        )
        .bind(audit_action)
        .bind(&import_id)
        .bind(operator_user_id)
        .bind(json!({
            "selected_grain": selected_grain.map(SpendGrain::as_str),
            "selected_rows": rows.len(),
            "inserted_rows": inserted_rows,
            "duplicate_rows": rows.len() - inserted_rows,
        }))
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(GrowthSpendCommitResult {
            import_id,
            duplicate_file: false,
            selected_rows: rows.len(),
            inserted_rows,
            duplicate_rows: rows.len() - inserted_rows,
        })
    }

    pub async fn add_growth_spend_adjustment(
        &self,
        operator_user_id: &str,
        spend_row_id: &str,
        source_spend_delta_minor: i64,
        aud_spend_delta_minor: i64,
        reason: &str,
    ) -> Result<GrowthSpendAdjustmentResult, sqlx::Error> {
        let reason = reason.trim();
        if !(3..=500).contains(&reason.len())
            || (source_spend_delta_minor == 0 && aud_spend_delta_minor == 0)
        {
            return Err(sqlx::Error::Protocol("invalid spend correction".into()));
        }
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query(
            "SELECT source_spend_minor,aud_spend_minor FROM growth_spend_rows WHERE id=$1 FOR UPDATE",
        )
        .bind(spend_row_id)
        .fetch_one(&mut *tx)
        .await?;
        let adjustment = sqlx::query(
            "SELECT COALESCE(SUM(source_spend_delta_minor),0)::BIGINT AS source_delta,COALESCE(SUM(aud_spend_delta_minor),0)::BIGINT AS aud_delta FROM growth_spend_adjustments WHERE spend_row_id=$1",
        )
        .bind(spend_row_id)
        .fetch_one(&mut *tx)
        .await?;
        let effective_source = row
            .try_get::<i64, _>("source_spend_minor")?
            .saturating_add(adjustment.try_get::<i64, _>("source_delta")?)
            .saturating_add(source_spend_delta_minor);
        let effective_aud = row
            .try_get::<i64, _>("aud_spend_minor")?
            .saturating_add(adjustment.try_get::<i64, _>("aud_delta")?)
            .saturating_add(aud_spend_delta_minor);
        if effective_source < 0 || effective_aud < 0 {
            return Err(sqlx::Error::Protocol(
                "spend correction would make effective spend negative".into(),
            ));
        }
        let adjustment_id = format!("growth_spend_adjustment:{}", Ulid::new());
        sqlx::query(
            "INSERT INTO growth_spend_adjustments (id,spend_row_id,source_spend_delta_minor,aud_spend_delta_minor,reason,operator_user_id) VALUES ($1,$2,$3,$4,$5,$6)",
        )
        .bind(&adjustment_id)
        .bind(spend_row_id)
        .bind(source_spend_delta_minor)
        .bind(aud_spend_delta_minor)
        .bind(reason)
        .bind(operator_user_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO growth_spend_audit (action,spend_row_id,operator_user_id,detail_json) VALUES ('adjustment',$1,$2,$3)",
        )
        .bind(spend_row_id)
        .bind(operator_user_id)
        .bind(json!({"adjustment_id": adjustment_id, "reason": reason}))
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(GrowthSpendAdjustmentResult {
            adjustment_id,
            effective_source_spend_minor: effective_source,
            effective_aud_spend_minor: effective_aud,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db::UserRecord,
        growth_analytics::{SpendConversion, preview_spend_csv},
    };
    use chrono::NaiveDate;

    #[tokio::test]
    async fn disposable_postgres_proves_file_row_and_adjustment_idempotency() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }
        let db = Db::new(&std::env::var("DATABASE_URL").expect("DATABASE_URL"))
            .await
            .unwrap();
        let suffix = Ulid::new().to_string().to_lowercase();
        let operator = UserRecord {
            id: format!("growth-spend-{suffix}"),
            email: format!("growth-spend-{suffix}@omnyid.test"),
            password_hash: Some("test".into()),
            auth_provider: "password".into(),
            google_sub: None,
            display_name: "Spend operator".into(),
            created_at: "2026-11-04T00:00:00Z".into(),
        };
        db.create_user(&operator).await.unwrap();
        let conversion = SpendConversion {
            source_currency: "AUD".into(),
            aud_rate_micros: 1_000_000,
            source: "AUD native".into(),
            date: NaiveDate::from_ymd_opt(2026, 11, 4).unwrap(),
        };
        let preview = preview_spend_csv(
            b"Date,Campaign ID,Amount spent,Currency\n2026-11-01,c1,10.00,AUD\n",
            "meta",
            &conversion,
        );
        let first = db
            .commit_growth_spend_import(
                &operator.id,
                "meta.csv",
                "meta",
                &preview,
                None,
                json!({"choice":"single_grain"}),
            )
            .await
            .unwrap();
        assert_eq!(first.inserted_rows, 1);
        let duplicate = db
            .commit_growth_spend_import(
                &operator.id,
                "again.csv",
                "meta",
                &preview,
                None,
                json!({}),
            )
            .await
            .unwrap();
        assert!(duplicate.duplicate_file);
        let row_id: String =
            sqlx::query_scalar("SELECT id FROM growth_spend_rows WHERE import_id=$1")
                .bind(&first.import_id)
                .fetch_one(&db.pool)
                .await
                .unwrap();
        let adjusted = db
            .add_growth_spend_adjustment(
                &operator.id,
                &row_id,
                -100,
                -100,
                "Remove invalid click-day spend",
            )
            .await
            .unwrap();
        assert_eq!(adjusted.effective_aud_spend_minor, 900);
        assert!(
            db.add_growth_spend_adjustment(
                &operator.id,
                &row_id,
                -1000,
                -1000,
                "Cannot be negative"
            )
            .await
            .is_err()
        );
        sqlx::query("DELETE FROM growth_spend_audit WHERE operator_user_id=$1")
            .bind(&operator.id)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM growth_spend_adjustments WHERE operator_user_id=$1")
            .bind(&operator.id)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM growth_spend_rows WHERE import_id=$1")
            .bind(&first.import_id)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM growth_spend_imports WHERE operator_user_id=$1")
            .bind(&operator.id)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM users WHERE id=$1")
            .bind(&operator.id)
            .execute(&db.pool)
            .await
            .unwrap();
    }
}
