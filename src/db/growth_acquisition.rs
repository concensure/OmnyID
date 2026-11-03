use super::Db;

impl Db {
    /// Resolves an opaque browser visit to server-held campaign fields only after a new user exists.
    /// Existing accounts never call this path, and the caller cannot supply campaign metadata.
    pub async fn link_new_user_same_session_acquisition(
        &self,
        user_id: &str,
        visit_id: Option<&str>,
    ) -> Result<bool, sqlx::Error> {
        let Some(visit_id) = visit_id.map(str::trim).filter(|value| {
            value.len() == 12 && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
        }) else {
            return Ok(false);
        };
        let mut transaction = self.pool.begin().await?;
        let touch = sqlx::query(
            r#"
            INSERT INTO growth_acquisition_touches (
                visit_id, touch_class, utm_source, utm_medium, utm_campaign,
                utm_content, utm_term, intent, landing_path, first_seen, expires_at
            )
            SELECT
                visit_id,
                CASE
                    WHEN utm_source IS NOT NULL OR ad_click_present THEN 'campaign'
                    WHEN referrer_class IN ('search', 'social', 'email', 'other') THEN referrer_class
                    ELSE 'direct'
                END,
                utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                intent, landing_path, first_seen, first_seen + INTERVAL '30 days'
            FROM wedding_site_sessions
            WHERE visit_id = $1
              AND first_seen >= NOW() - INTERVAL '30 days'
            ON CONFLICT (visit_id) DO NOTHING
            RETURNING visit_id
            "#,
        )
        .bind(visit_id)
        .fetch_optional(&mut *transaction)
        .await?;

        let linked = sqlx::query(
            r#"
            INSERT INTO growth_identity_links (user_id, visit_id, expires_at)
            SELECT $1, visit_id, LEAST(expires_at, NOW() + INTERVAL '30 days')
            FROM growth_acquisition_touches
            WHERE visit_id = $2 AND expires_at > NOW()
            ON CONFLICT DO NOTHING
            RETURNING user_id
            "#,
        )
        .bind(user_id)
        .bind(visit_id)
        .fetch_optional(&mut *transaction)
        .await?
        .is_some();
        transaction.commit().await?;
        Ok(linked || touch.is_some())
    }

    pub async fn attach_same_session_acquisition_to_wedding(
        &self,
        user_id: &str,
        wedding_plan_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let plan = wedding_plan_id.trim();
        if plan.is_empty() || plan.len() > 200 {
            return Ok(false);
        }
        let result = sqlx::query(
            r#"
            UPDATE growth_identity_links
            SET wedding_plan_id = COALESCE(wedding_plan_id, $2)
            WHERE user_id = $1
              AND expires_at > NOW()
              AND (wedding_plan_id IS NULL OR wedding_plan_id = $2)
            "#,
        )
        .bind(user_id)
        .bind(plan)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::UserRecord;
    use sqlx::Row;
    use ulid::Ulid;

    #[tokio::test]
    async fn disposable_postgres_acquisition_resolves_server_touch_and_fails_cross_tenant() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }
        let db = Db::new(&std::env::var("DATABASE_URL").expect("DATABASE_URL"))
            .await
            .expect("connect and migrate");
        let suffix = Ulid::new().to_string().to_lowercase();
        let visit_id = suffix[..12].to_string();
        sqlx::query("INSERT INTO wedding_site_sessions (visit_id,utm_source,utm_medium,utm_campaign,referrer_class,landing_path) VALUES ($1,'trusted-source','paid-social','spring','social','/wedding/')")
            .bind(&visit_id).execute(&db.pool).await.expect("seed server touch");

        let user = UserRecord {
            id: format!("growth-user-{suffix}"),
            email: format!("growth-{suffix}@omnyid.test"),
            password_hash: Some("test".into()),
            auth_provider: "password".into(),
            google_sub: None,
            display_name: "Growth test".into(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        let other = UserRecord {
            id: format!("growth-other-{suffix}"),
            email: format!("growth-other-{suffix}@omnyid.test"),
            ..user.clone()
        };
        db.create_user(&user).await.expect("create user");
        db.create_user(&other).await.expect("create other user");
        assert!(
            db.link_new_user_same_session_acquisition(&user.id, Some(&visit_id))
                .await
                .unwrap()
        );
        let row = sqlx::query(
            "SELECT utm_source,touch_class FROM growth_acquisition_touches WHERE visit_id=$1",
        )
        .bind(&visit_id)
        .fetch_one(&db.pool)
        .await
        .expect("touch");
        assert_eq!(
            row.get::<Option<String>, _>("utm_source").as_deref(),
            Some("trusted-source")
        );
        assert_eq!(row.get::<String, _>("touch_class"), "campaign");
        assert!(
            !db.link_new_user_same_session_acquisition(&other.id, Some(&visit_id))
                .await
                .unwrap()
        );
        assert!(
            db.attach_same_session_acquisition_to_wedding(&user.id, "wedding_plan:owned")
                .await
                .unwrap()
        );
        assert!(
            !db.attach_same_session_acquisition_to_wedding(&user.id, "wedding_plan:swapped")
                .await
                .unwrap()
        );

        sqlx::query("DELETE FROM users WHERE id IN ($1,$2)")
            .bind(&user.id)
            .bind(&other.id)
            .execute(&db.pool)
            .await
            .expect("delete users");
        sqlx::query("DELETE FROM wedding_site_sessions WHERE visit_id=$1")
            .bind(&visit_id)
            .execute(&db.pool)
            .await
            .expect("delete visit");
    }
}
