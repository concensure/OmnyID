use super::{Db, tenant_schema_name};
use crate::growth_analytics::{ACTIVATION_DEFINITION_VERSION, approved_activation_source};
use serde_json::Value;
use sqlx::Row;

const APPROVED_SUBTYPES: &[&str] = &[
    "wedding_intake_profile",
    "wedding_decision_selection",
    "selected_vendor_contact_details",
];

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct GrowthActivationProjectionResult {
    pub scanned: usize,
    pub accepted_sources: usize,
    pub inserted_events: usize,
}

impl Db {
    pub async fn reconcile_growth_activation_for_user(
        &self,
        owner_user_id: &str,
    ) -> Result<GrowthActivationProjectionResult, sqlx::Error> {
        sqlx::query(
            "UPDATE growth_activation_projector_cursors SET last_timestamp='epoch',last_message_id='',updated_at=NOW() WHERE owner_user_id=$1",
        )
        .bind(owner_user_id)
        .execute(&self.pool)
        .await?;
        self.project_growth_activation_for_user(owner_user_id, 500)
            .await
    }

    pub async fn project_growth_activation_for_user(
        &self,
        owner_user_id: &str,
        limit: i64,
    ) -> Result<GrowthActivationProjectionResult, sqlx::Error> {
        let limit = limit.clamp(1, 500);
        self.ensure_user_private_schema(owner_user_id).await?;
        let table = format!("\"{}\".messages", tenant_schema_name(owner_user_id));
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "INSERT INTO growth_activation_projector_cursors (owner_user_id) VALUES ($1) ON CONFLICT DO NOTHING",
        )
        .bind(owner_user_id)
        .execute(&mut *tx)
        .await?;
        let cursor = sqlx::query(
            "SELECT last_timestamp::text AS last_timestamp,last_message_id FROM growth_activation_projector_cursors WHERE owner_user_id=$1 FOR UPDATE",
        )
        .bind(owner_user_id)
        .fetch_one(&mut *tx)
        .await?;
        let last_timestamp: String = cursor.try_get("last_timestamp")?;
        let last_message_id: String = cursor.try_get("last_message_id")?;
        let subtype_values = APPROVED_SUBTYPES
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>();
        let rows = sqlx::query(&format!(
            "SELECT id,timestamp::text AS timestamp,subtype,content,COALESCE(metadata,'{{}}'::jsonb) AS metadata FROM {table} WHERE subtype=ANY($1) AND (timestamp>$2::timestamptz OR (timestamp=$2::timestamptz AND id>$3)) ORDER BY timestamp,id LIMIT $4"
        ))
        .bind(&subtype_values)
        .bind(&last_timestamp)
        .bind(&last_message_id)
        .bind(limit)
        .fetch_all(&mut *tx)
        .await?;

        let mut result = GrowthActivationProjectionResult {
            scanned: rows.len(),
            ..Default::default()
        };
        let mut next_cursor = None;
        for row in rows {
            let message_id: String = row.try_get("id")?;
            let timestamp: String = row.try_get("timestamp")?;
            let subtype: String = row.try_get("subtype")?;
            let content: Value = row.try_get("content")?;
            let metadata: Value = row.try_get("metadata")?;
            next_cursor = Some((timestamp.clone(), message_id.clone()));
            let Some(source) = approved_activation_source(&subtype, &content, &metadata) else {
                continue;
            };
            let authorised = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM wedding_user_onboarding_state WHERE user_id=$1 AND wedding_plan_id=$2) OR EXISTS(SELECT 1 FROM growth_identity_links WHERE user_id=$1 AND wedding_plan_id=$2 AND expires_at>NOW())",
            )
            .bind(owner_user_id)
            .bind(&source.wedding_plan_id)
            .fetch_one(&mut *tx)
            .await?;
            if !authorised {
                continue;
            }
            result.accepted_sources += 1;
            sqlx::query(
                "INSERT INTO growth_weddings (owner_user_id,wedding_plan_id,created_source_message_id,created_at,definition_version) VALUES ($1,$2,$3,$4::timestamptz,$5) ON CONFLICT DO NOTHING",
            )
            .bind(owner_user_id)
            .bind(&source.wedding_plan_id)
            .bind(&message_id)
            .bind(&timestamp)
            .bind(ACTIVATION_DEFINITION_VERSION)
            .execute(&mut *tx)
            .await?;

            let mut source_inserted = false;
            for event_name in &source.event_names {
                let inserted = sqlx::query(
                    "INSERT INTO growth_activation_sources (owner_user_id,source_message_id,wedding_plan_id,event_name,occurred_at,definition_version) VALUES ($1,$2,$3,$4,$5::timestamptz,$6) ON CONFLICT DO NOTHING",
                )
                .bind(owner_user_id)
                .bind(&message_id)
                .bind(&source.wedding_plan_id)
                .bind(event_name)
                .bind(&timestamp)
                .bind(ACTIVATION_DEFINITION_VERSION)
                .execute(&mut *tx)
                .await?
                .rows_affected()
                    == 1;
                source_inserted |= inserted;
                result.inserted_events += usize::from(inserted);
            }
            if source_inserted {
                sqlx::query(
                    "INSERT INTO growth_wedding_activations (owner_user_id,wedding_plan_id,first_event_name,first_source_message_id,activated_at,definition_version) VALUES ($1,$2,$3,$4,$5::timestamptz,$6) ON CONFLICT DO NOTHING",
                )
                .bind(owner_user_id)
                .bind(&source.wedding_plan_id)
                .bind(source.event_names[0])
                .bind(&message_id)
                .bind(&timestamp)
                .bind(ACTIVATION_DEFINITION_VERSION)
                .execute(&mut *tx)
                .await?;
                sqlx::query(
                    "INSERT INTO growth_wedding_activity_daily (owner_user_id,wedding_plan_id,activity_date,activity_count,first_activity_at,last_activity_at,definition_version) VALUES ($1,$2,($3::timestamptz AT TIME ZONE 'Australia/Sydney')::date,1,$3::timestamptz,$3::timestamptz,$4) ON CONFLICT (owner_user_id,wedding_plan_id,activity_date) DO UPDATE SET activity_count=growth_wedding_activity_daily.activity_count+1,first_activity_at=LEAST(growth_wedding_activity_daily.first_activity_at,EXCLUDED.first_activity_at),last_activity_at=GREATEST(growth_wedding_activity_daily.last_activity_at,EXCLUDED.last_activity_at)",
                )
                .bind(owner_user_id)
                .bind(&source.wedding_plan_id)
                .bind(&timestamp)
                .bind(ACTIVATION_DEFINITION_VERSION)
                .execute(&mut *tx)
                .await?;
            }
        }
        if let Some((timestamp, message_id)) = next_cursor {
            sqlx::query(
                "UPDATE growth_activation_projector_cursors SET last_timestamp=$2::timestamptz,last_message_id=$3,updated_at=NOW() WHERE owner_user_id=$1",
            )
            .bind(owner_user_id)
            .bind(timestamp)
            .bind(message_id)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::UserRecord;
    use serde_json::json;
    use ulid::Ulid;

    async fn insert_source(
        db: &Db,
        owner: &str,
        id: &str,
        timestamp: &str,
        subtype: &str,
        content: Value,
        metadata: Value,
    ) {
        let table = format!("\"{}\".messages", tenant_schema_name(owner));
        sqlx::query(&format!(
            "INSERT INTO {table} (id,thread_id,from_agent,to_agents,timestamp,type,kind,subtype,content,signature,metadata,store_in_relational) VALUES ($1,'growth-test','test://actor','[]'::jsonb,$2::timestamptz,'test','note',$3,$4,'test-signature',$5,TRUE)"
        ))
        .bind(id)
        .bind(timestamp)
        .bind(subtype)
        .bind(content)
        .bind(metadata)
        .execute(&db.pool)
        .await
        .expect("insert source");
    }

    #[tokio::test]
    async fn disposable_postgres_projection_is_idempotent_private_and_tenant_scoped() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }
        let db = Db::new(&std::env::var("DATABASE_URL").expect("DATABASE_URL"))
            .await
            .expect("connect and migrate");
        let suffix = Ulid::new().to_string().to_lowercase();
        let owner = UserRecord {
            id: format!("growth-owner-{suffix}"),
            email: format!("growth-owner-{suffix}@omnyid.test"),
            password_hash: Some("test".into()),
            auth_provider: "password".into(),
            google_sub: None,
            display_name: "Growth owner".into(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        let outsider = UserRecord {
            id: format!("growth-outsider-{suffix}"),
            email: format!("growth-outsider-{suffix}@omnyid.test"),
            ..owner.clone()
        };
        db.create_user(&owner).await.expect("create owner");
        db.create_user(&outsider).await.expect("create outsider");
        db.ensure_user_private_schema(&owner.id).await.unwrap();
        db.ensure_user_private_schema(&outsider.id).await.unwrap();
        let plan = format!("wedding_plan:{suffix}");
        db.upsert_wedding_user_onboarding_state(
            &owner.id,
            &plan,
            "wedding_site",
            "wedding_site",
            None,
        )
        .await
        .expect("authorise plan");

        insert_source(
            &db,
            &owner.id,
            "source-intake",
            "2026-11-04T01:00:00Z",
            "wedding_intake_profile",
            json!({"kind":"wedding_intake_profile","wedding_plan_id":plan,"couple_names":"private"}),
            json!({}),
        )
        .await;
        insert_source(
            &db,
            &owner.id,
            "source-deleted",
            "2026-11-04T01:01:00Z",
            "selected_vendor_contact_details",
            json!({"kind":"wedding_vendor_contact_reference","selected_for_follow_up":true}),
            json!({"weddingPlanId":plan,"vendor_name":"private"}),
        )
        .await;
        let owner_table = format!("\"{}\".messages", tenant_schema_name(&owner.id));
        sqlx::query(&format!(
            "DELETE FROM {owner_table} WHERE id='source-deleted'"
        ))
        .execute(&db.pool)
        .await
        .unwrap();
        insert_source(
            &db,
            &owner.id,
            "source-partner-decision",
            "2026-11-04T01:02:00Z",
            "wedding_decision_selection",
            json!({"kind":"wedding_decision_selection","wedding_plan_id":plan,"decision_id":"decision:one","budget_decision":true,"amount":35_000}),
            json!({"actor_role":"partner"}),
        )
        .await;
        insert_source(
            &db,
            &owner.id,
            "source-partner-acceptance",
            "2026-11-04T01:03:00Z",
            "partner_invite_accepted",
            json!({"kind":"partner_invite_accepted","wedding_plan_id":plan}),
            json!({}),
        )
        .await;

        let first = db
            .project_growth_activation_for_user(&owner.id, 100)
            .await
            .unwrap();
        assert_eq!(first.scanned, 2);
        assert_eq!(first.accepted_sources, 2);
        assert_eq!(first.inserted_events, 3);
        let event_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM growth_activation_sources WHERE owner_user_id=$1 AND wedding_plan_id=$2",
        )
        .bind(&owner.id)
        .bind(&plan)
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(event_count, 3);
        let activity_count: i32 = sqlx::query_scalar(
            "SELECT activity_count FROM growth_wedding_activity_daily WHERE owner_user_id=$1 AND wedding_plan_id=$2",
        )
        .bind(&owner.id)
        .bind(&plan)
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(activity_count, 2);

        sqlx::query("UPDATE growth_activation_projector_cursors SET last_timestamp='epoch',last_message_id='' WHERE owner_user_id=$1")
            .bind(&owner.id).execute(&db.pool).await.unwrap();
        let replay = db
            .project_growth_activation_for_user(&owner.id, 100)
            .await
            .unwrap();
        assert_eq!(replay.inserted_events, 0);
        let unchanged: i32 = sqlx::query_scalar(
            "SELECT activity_count FROM growth_wedding_activity_daily WHERE owner_user_id=$1 AND wedding_plan_id=$2",
        )
        .bind(&owner.id)
        .bind(&plan)
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(unchanged, 2);

        insert_source(
            &db,
            &outsider.id,
            "source-cross-tenant",
            "2026-11-04T01:00:00Z",
            "wedding_intake_profile",
            json!({"kind":"wedding_intake_profile","wedding_plan_id":plan}),
            json!({}),
        )
        .await;
        let rejected = db
            .project_growth_activation_for_user(&outsider.id, 100)
            .await
            .unwrap();
        assert_eq!(rejected.accepted_sources, 0);
        let outsider_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM growth_weddings WHERE owner_user_id=$1")
                .bind(&outsider.id)
                .fetch_one(&db.pool)
                .await
                .unwrap();
        assert_eq!(outsider_count, 0);

        sqlx::query("DELETE FROM users WHERE id IN ($1,$2)")
            .bind(&owner.id)
            .bind(&outsider.id)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query(&format!(
            "DROP SCHEMA IF EXISTS \"{}\" CASCADE",
            tenant_schema_name(&owner.id)
        ))
        .execute(&db.pool)
        .await
        .unwrap();
        sqlx::query(&format!(
            "DROP SCHEMA IF EXISTS \"{}\" CASCADE",
            tenant_schema_name(&outsider.id)
        ))
        .execute(&db.pool)
        .await
        .unwrap();
    }
}
