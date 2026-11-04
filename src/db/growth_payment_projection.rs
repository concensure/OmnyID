use super::Db;
use crate::growth_analytics::{
    ApprovedPaymentEvent, PAYMENT_DEFINITION_VERSION, PaymentEventKind, approved_payment_event,
};
use serde_json::Value;
use sqlx::Row;

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct GrowthPaymentProjectionResult {
    pub scanned: usize,
    pub accepted: usize,
    pub inserted_events: usize,
    pub updated_transactions: usize,
}

impl Db {
    pub async fn resolve_growth_checkout_wedding_plan(
        &self,
        owner_user_id: &str,
        requested_plan_id: Option<&str>,
    ) -> Result<Option<String>, sqlx::Error> {
        let requested = requested_plan_id.map(str::trim);
        if requested.is_some_and(|value| {
            !value.starts_with("wedding_plan:") || value.len() > 200
        }) {
            return Ok(None);
        }
        let rows = sqlx::query_scalar::<_, String>(
            "SELECT wedding_plan_id FROM wedding_user_onboarding_state WHERE user_id=$1 UNION SELECT wedding_plan_id FROM growth_weddings WHERE owner_user_id=$1 ORDER BY wedding_plan_id LIMIT 2",
        )
        .bind(owner_user_id)
        .fetch_all(&self.pool)
        .await?;
        if let Some(requested) = requested {
            return Ok(rows
                .iter()
                .any(|value| value == requested)
                .then(|| requested.to_string()));
        }
        Ok((rows.len() == 1).then(|| rows[0].clone()))
    }

    async fn apply_growth_payment_event(
        &self,
        stripe_event_id: &str,
        event: ApprovedPaymentEvent,
    ) -> Result<GrowthPaymentProjectionResult, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let mut result = GrowthPaymentProjectionResult {
            scanned: 1,
            accepted: 1,
            ..Default::default()
        };
        match event.kind {
            PaymentEventKind::Success => {
                let owner = event.owner_user_id.as_deref().unwrap_or_default();
                let plan = event.wedding_plan_id.as_deref().unwrap_or_default();
                let authorised = sqlx::query_scalar::<_, bool>(
                    "SELECT EXISTS(SELECT 1 FROM wedding_user_onboarding_state WHERE user_id=$1 AND wedding_plan_id=$2) OR EXISTS(SELECT 1 FROM growth_weddings WHERE owner_user_id=$1 AND wedding_plan_id=$2)",
                )
                .bind(owner)
                .bind(plan)
                .fetch_one(&mut *tx)
                .await?;
                if !authorised {
                    tx.rollback().await?;
                    return Ok(GrowthPaymentProjectionResult {
                        scanned: 1,
                        ..Default::default()
                    });
                }
                let inserted = sqlx::query(
                    "INSERT INTO growth_payment_events (stripe_event_id,event_kind,owner_user_id,wedding_plan_id,stripe_transaction_id,amount_minor,tax_minor,currency,stripe_price_id,product_key,occurred_at,definition_version) VALUES ($1,'success',$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10),$11) ON CONFLICT DO NOTHING",
                )
                .bind(stripe_event_id)
                .bind(owner)
                .bind(plan)
                .bind(&event.stripe_transaction_id)
                .bind(event.amount_minor)
                .bind(event.tax_minor)
                .bind(&event.currency)
                .bind(event.stripe_price_id.as_deref().unwrap_or_default())
                .bind(event.product_key.as_deref().unwrap_or_default())
                .bind(event.occurred_at_unix as f64)
                .bind(PAYMENT_DEFINITION_VERSION)
                .execute(&mut *tx)
                .await?
                .rows_affected()
                    == 1;
                result.inserted_events += usize::from(inserted);
                if inserted {
                    let transaction_inserted = sqlx::query(
                        "INSERT INTO growth_payment_transactions (stripe_transaction_id,owner_user_id,wedding_plan_id,success_event_id,gross_minor,tax_minor,currency,stripe_price_id,product_key,paid_at,definition_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10),$11) ON CONFLICT DO NOTHING",
                    )
                    .bind(&event.stripe_transaction_id)
                    .bind(owner)
                    .bind(plan)
                    .bind(stripe_event_id)
                    .bind(event.amount_minor)
                    .bind(event.tax_minor)
                    .bind(&event.currency)
                    .bind(event.stripe_price_id.as_deref().unwrap_or_default())
                    .bind(event.product_key.as_deref().unwrap_or_default())
                    .bind(event.occurred_at_unix as f64)
                    .bind(PAYMENT_DEFINITION_VERSION)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected()
                        == 1;
                    if transaction_inserted {
                        result.updated_transactions += 1;
                    } else {
                        let matches = sqlx::query_scalar::<_, bool>(
                            "SELECT EXISTS(SELECT 1 FROM growth_payment_transactions WHERE stripe_transaction_id=$1 AND owner_user_id=$2 AND wedding_plan_id=$3 AND gross_minor=$4 AND currency=$5 AND stripe_price_id=$6 AND product_key=$7 AND tax_minor IS NOT DISTINCT FROM $8)",
                        )
                        .bind(&event.stripe_transaction_id)
                        .bind(owner)
                        .bind(plan)
                        .bind(event.amount_minor)
                        .bind(&event.currency)
                        .bind(event.stripe_price_id.as_deref().unwrap_or_default())
                        .bind(event.product_key.as_deref().unwrap_or_default())
                        .bind(event.tax_minor)
                        .fetch_one(&mut *tx)
                        .await?;
                        if !matches {
                            return Err(sqlx::Error::Protocol(
                                "conflicting Stripe success for existing transaction".into(),
                            ));
                        }
                    }
                }
            }
            PaymentEventKind::Refund => {
                let row = sqlx::query(
                    "SELECT owner_user_id,wedding_plan_id,gross_minor,currency,stripe_price_id,product_key FROM growth_payment_transactions WHERE stripe_transaction_id=$1 FOR UPDATE",
                )
                .bind(&event.stripe_transaction_id)
                .fetch_optional(&mut *tx)
                .await?;
                let Some(row) = row else {
                    tx.rollback().await?;
                    return Ok(GrowthPaymentProjectionResult {
                        scanned: 1,
                        ..Default::default()
                    });
                };
                let owner: String = row.try_get("owner_user_id")?;
                let plan: String = row.try_get("wedding_plan_id")?;
                let gross: i64 = row.try_get("gross_minor")?;
                let stored_currency: String = row.try_get("currency")?;
                let price: String = row.try_get("stripe_price_id")?;
                let product: String = row.try_get("product_key")?;
                let binding_matches = event.amount_minor <= gross
                    && event.currency == stored_currency
                    && event
                        .owner_user_id
                        .as_deref()
                        .is_none_or(|value| value == owner)
                    && event
                        .wedding_plan_id
                        .as_deref()
                        .is_none_or(|value| value == plan)
                    && event
                        .stripe_price_id
                        .as_deref()
                        .is_none_or(|value| value == price)
                    && event
                        .product_key
                        .as_deref()
                        .is_none_or(|value| value == product);
                if !binding_matches {
                    tx.rollback().await?;
                    return Ok(GrowthPaymentProjectionResult {
                        scanned: 1,
                        ..Default::default()
                    });
                }
                let inserted = sqlx::query(
                    "INSERT INTO growth_payment_events (stripe_event_id,event_kind,owner_user_id,wedding_plan_id,stripe_transaction_id,amount_minor,tax_minor,currency,stripe_price_id,product_key,occurred_at,definition_version) VALUES ($1,'refund',$2,$3,$4,$5,NULL,$6,$7,$8,to_timestamp($9),$10) ON CONFLICT DO NOTHING",
                )
                .bind(stripe_event_id)
                .bind(&owner)
                .bind(&plan)
                .bind(&event.stripe_transaction_id)
                .bind(event.amount_minor)
                .bind(&event.currency)
                .bind(&price)
                .bind(&product)
                .bind(event.occurred_at_unix as f64)
                .bind(PAYMENT_DEFINITION_VERSION)
                .execute(&mut *tx)
                .await?
                .rows_affected()
                    == 1;
                result.inserted_events += usize::from(inserted);
                if inserted {
                    result.updated_transactions += sqlx::query(
                        "UPDATE growth_payment_transactions SET refunded_minor=GREATEST(refunded_minor,$2),status=CASE WHEN GREATEST(refunded_minor,$2)>=gross_minor THEN 'refunded' ELSE 'partially_refunded' END,updated_at=NOW() WHERE stripe_transaction_id=$1 AND $2>=refunded_minor",
                    )
                    .bind(&event.stripe_transaction_id)
                    .bind(event.amount_minor)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected() as usize;
                }
            }
        }
        tx.commit().await?;
        Ok(result)
    }

    pub async fn project_growth_payment_payload(
        &self,
        stripe_event_id: &str,
        payload: &Value,
    ) -> Result<GrowthPaymentProjectionResult, sqlx::Error> {
        let Some(event) = approved_payment_event(payload) else {
            return Ok(GrowthPaymentProjectionResult {
                scanned: 1,
                ..Default::default()
            });
        };
        self.apply_growth_payment_event(stripe_event_id, event)
            .await
    }

    pub async fn reconcile_growth_payment_events(
        &self,
        limit: i64,
    ) -> Result<GrowthPaymentProjectionResult, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT stripe_event_id,payload FROM billing_events b WHERE event_type=ANY($1) AND NOT EXISTS(SELECT 1 FROM growth_payment_events g WHERE g.stripe_event_id=b.stripe_event_id) ORDER BY CASE WHEN event_type='charge.refunded' THEN 1 ELSE 0 END,processed_at,id LIMIT $2",
        )
        .bind(vec![
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
            "charge.refunded",
        ])
        .bind(limit.clamp(1, 500))
        .fetch_all(&self.pool)
        .await?;
        let mut result = GrowthPaymentProjectionResult::default();
        for row in rows {
            let event_id: String = row.try_get("stripe_event_id")?;
            let payload: Value = row.try_get("payload")?;
            let projected = self
                .project_growth_payment_payload(&event_id, &payload)
                .await?;
            result.scanned += projected.scanned;
            result.accepted += projected.accepted;
            result.inserted_events += projected.inserted_events;
            result.updated_transactions += projected.updated_transactions;
        }
        Ok(result)
    }

    pub async fn add_growth_variable_cost_revision(
        &self,
        effective_from: &str,
        currency: &str,
        payment_fixed_minor: Option<i64>,
        payment_rate_basis_points: Option<i32>,
        service_cost_minor: Option<i64>,
        reason: &str,
        operator_user_id: &str,
    ) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar(
            "INSERT INTO growth_variable_cost_revisions (effective_from,currency,payment_fixed_minor,payment_rate_basis_points,service_cost_minor,reason,created_by_user_id) VALUES ($1::timestamptz,UPPER($2),$3,$4,$5,$6,$7) RETURNING id",
        )
        .bind(effective_from)
        .bind(currency)
        .bind(payment_fixed_minor)
        .bind(payment_rate_basis_points)
        .bind(service_cost_minor)
        .bind(reason.trim())
        .bind(operator_user_id)
        .fetch_one(&self.pool)
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::UserRecord;
    use serde_json::json;
    use ulid::Ulid;

    fn success(event_id: &str, owner: &str, plan: &str, livemode: bool) -> Value {
        json!({
            "id":event_id,"type":"checkout.session.completed","livemode":livemode,
            "created":1_792_451_600_i64,
            "data":{"object":{"mode":"payment","payment_status":"paid",
                "payment_intent":"pi_growth_smoke","amount_total":4900,"currency":"aud",
                "total_details":{"amount_tax":445},"metadata":{"account_id":owner,
                    "wedding_plan_id":plan,"stripe_price_id":"price_live_growth",
                    "billing_product":"omnyid_wedding"}}}
        })
    }

    fn refund(event_id: &str, cumulative_minor: i64) -> Value {
        json!({
            "id":event_id,"type":"charge.refunded","livemode":true,"created":1_792_538_000_i64,
            "data":{"object":{"paid":true,"payment_intent":"pi_growth_smoke",
                "amount_refunded":cumulative_minor,"currency":"aud","metadata":{}}}
        })
    }

    #[tokio::test]
    async fn disposable_postgres_reconciles_success_refund_replay_and_maturity() {
        if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
            return;
        }
        let db = Db::new(&std::env::var("DATABASE_URL").expect("DATABASE_URL"))
            .await
            .expect("connect and migrate");
        let suffix = Ulid::new().to_string().to_lowercase();
        let owner = UserRecord {
            id: format!("growth-payment-owner-{suffix}"),
            email: format!("growth-payment-{suffix}@omnyid.test"),
            password_hash: Some("test".into()),
            auth_provider: "password".into(),
            google_sub: None,
            display_name: "Growth payment owner".into(),
            created_at: "2026-10-10T00:00:00Z".into(),
        };
        db.create_user(&owner).await.expect("create owner");
        sqlx::query("UPDATE users SET created_at='2026-10-10T00:00:00Z' WHERE id=$1")
            .bind(&owner.id)
            .execute(&db.pool)
            .await
            .unwrap();
        let plan = format!("wedding_plan:{suffix}");
        db.upsert_wedding_user_onboarding_state(
            &owner.id,
            &plan,
            "wedding_site",
            "wedding_site",
            None,
        )
        .await
        .unwrap();
        assert_eq!(
            db.resolve_growth_checkout_wedding_plan(&owner.id, None)
                .await
                .unwrap()
                .as_deref(),
            Some(plan.as_str())
        );

        for event_id in ["evt_growth_paid", "evt_growth_paid_replay"] {
            let payload = success(event_id, &owner.id, &plan, true);
            assert!(
                db.record_billing_event(
                    Some(&owner.id),
                    event_id,
                    "checkout.session.completed",
                    &payload
                )
                .await
                .unwrap()
            );
            db.project_growth_payment_payload(event_id, &payload)
                .await
                .unwrap();
        }
        let transaction_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM growth_payment_transactions WHERE owner_user_id=$1",
        )
        .bind(&owner.id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(transaction_count, 1);

        for (event_id, amount) in [
            ("evt_growth_refund_partial", 1000),
            ("evt_growth_refund_full", 4900),
        ] {
            let payload = refund(event_id, amount);
            db.record_billing_event(None, event_id, "charge.refunded", &payload)
                .await
                .unwrap();
            db.project_growth_payment_payload(event_id, &payload)
                .await
                .unwrap();
        }
        let transaction = sqlx::query(
            "SELECT refunded_minor,status FROM growth_payment_transactions WHERE stripe_transaction_id='pi_growth_smoke'",
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(
            transaction.try_get::<i64, _>("refunded_minor").unwrap(),
            4900
        );
        assert_eq!(
            transaction.try_get::<String, _>("status").unwrap(),
            "refunded"
        );

        let test_payload = success("evt_growth_test", &owner.id, &plan, false);
        db.record_billing_event(
            Some(&owner.id),
            "evt_growth_test",
            "checkout.session.completed",
            &test_payload,
        )
        .await
        .unwrap();
        assert_eq!(
            db.project_growth_payment_payload("evt_growth_test", &test_payload)
                .await
                .unwrap()
                .accepted,
            0
        );
        let summary = sqlx::query(
            "SELECT transaction_count,gross_minor,refunded_minor,first_purchase_within_30_days,is_30_day_mature FROM growth_wedding_payment_summary WHERE owner_user_id=$1 AND wedding_plan_id=$2",
        )
        .bind(&owner.id)
        .bind(&plan)
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(summary.try_get::<i64, _>("transaction_count").unwrap(), 1);
        assert_eq!(summary.try_get::<i64, _>("gross_minor").unwrap(), 4900);
        assert_eq!(summary.try_get::<i64, _>("refunded_minor").unwrap(), 4900);
        assert!(
            summary
                .try_get::<bool, _>("first_purchase_within_30_days")
                .unwrap()
        );
        assert!(!summary.try_get::<bool, _>("is_30_day_mature").unwrap());

        db.add_growth_variable_cost_revision(
            "2026-10-01T00:00:00Z",
            "aud",
            Some(30),
            Some(175),
            None,
            "Service cost awaits invoice reconciliation",
            &owner.id,
        )
        .await
        .unwrap();
        sqlx::query("DELETE FROM growth_variable_cost_revisions WHERE created_by_user_id=$1")
            .bind(&owner.id)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM users WHERE id=$1")
            .bind(&owner.id)
            .execute(&db.pool)
            .await
            .unwrap();
    }
}
