// @locs-version: 2.0
use super::Db;
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WeddingUserOnboardingStateRecord {
    pub user_id: String,
    pub wedding_plan_id: String,
    pub intake_variant: String,
    pub entry_source: String,
    pub created_at: String,
    pub updated_at: String,
}

impl Db {
    pub async fn get_wedding_user_onboarding_state(
        &self,
        user_id: &str,
        wedding_plan_id: &str,
    ) -> Result<Option<WeddingUserOnboardingStateRecord>, sqlx::Error> {
        let row = sqlx::query(
            r#"
            SELECT
                user_id,
                wedding_plan_id,
                intake_variant,
                entry_source,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            FROM wedding_user_onboarding_state
            WHERE user_id = $1 AND wedding_plan_id = $2
            "#,
        )
        .bind(user_id)
        .bind(wedding_plan_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| WeddingUserOnboardingStateRecord {
            user_id: row.get("user_id"),
            wedding_plan_id: row.get("wedding_plan_id"),
            intake_variant: row.get("intake_variant"),
            entry_source: row.get("entry_source"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }))
    }

    /// Locks in which intake variant a user has seen for a wedding plan. Only the
    /// FIRST call for a given (user_id, wedding_plan_id) has any effect on
    /// intake_variant — later calls only refresh entry_source/updated_at, so a
    /// user who is shown one variant can never have it silently swapped out later.
    pub async fn upsert_wedding_user_onboarding_state(
        &self,
        user_id: &str,
        wedding_plan_id: &str,
        intake_variant: &str,
        entry_source: &str,
    ) -> Result<WeddingUserOnboardingStateRecord, sqlx::Error> {
        let row = sqlx::query(
            r#"
            INSERT INTO wedding_user_onboarding_state (
                user_id,
                wedding_plan_id,
                intake_variant,
                entry_source
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, wedding_plan_id) DO UPDATE SET
                entry_source = EXCLUDED.entry_source,
                updated_at = NOW()
            RETURNING
                user_id,
                wedding_plan_id,
                intake_variant,
                entry_source,
                created_at::text AS created_at,
                updated_at::text AS updated_at
            "#,
        )
        .bind(user_id)
        .bind(wedding_plan_id)
        .bind(intake_variant)
        .bind(entry_source)
        .fetch_one(&self.pool)
        .await?;

        Ok(WeddingUserOnboardingStateRecord {
            user_id: row.get("user_id"),
            wedding_plan_id: row.get("wedding_plan_id"),
            intake_variant: row.get("intake_variant"),
            entry_source: row.get("entry_source"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
    }
}
