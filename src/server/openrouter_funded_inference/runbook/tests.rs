use super::*;
use crate::{agent_template::LlmConfig, db::UserRecord};
use chrono::Utc;

struct Environment(Vec<(&'static str, Option<std::ffi::OsString>)>);
impl Environment {
    fn new() -> Self {
        Self(
            [
                "OMNYID_OPENROUTER_FUNDED_ENABLED",
                "OMNYID_RUNBOOK_SHARED_INFERENCE_ENABLED",
                "OMNYID_RUNBOOK_ALLOWLIST",
                "OMNYID_OPENAI_API_KEY",
            ]
            .into_iter()
            .map(|key| (key, std::env::var_os(key)))
            .collect(),
        )
    }
    fn set(&self, key: &str, value: &str) {
        unsafe {
            std::env::set_var(key, value);
        }
    }
}
impl Drop for Environment {
    fn drop(&mut self) {
        for (key, value) in &self.0 {
            unsafe {
                if let Some(value) = value {
                    std::env::set_var(key, value);
                } else {
                    std::env::remove_var(key);
                }
            }
        }
    }
}

#[tokio::test]
async fn shared_runbook_funding_is_opt_in_atomic_owner_capped_and_conservative() {
    let url = std::env::var("TEST_DATABASE_URL").expect("disposable database required");
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let owner = ulid::Ulid::new().to_string();
    let email = format!("funded-runbook-{owner}@omnyid.test");
    db.create_user(&UserRecord {
        id: owner.clone(),
        email: email.clone(),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Funding test".into(),
        created_at: Utc::now().to_rfc3339(),
    })
    .await
    .unwrap();
    let env = Environment::new();
    env.set("OMNYID_OPENROUTER_FUNDED_ENABLED", "true");
    env.set("OMNYID_RUNBOOK_SHARED_INFERENCE_ENABLED", "false");
    env.set("OMNYID_RUNBOOK_ALLOWLIST", &owner);
    env.set("OMNYID_OPENAI_API_KEY", "dummy-never-sent");
    assert!(matches!(
        reserve_shared_runbook(&db, &owner, BASE_MODEL, 10000).await,
        Err(ModelFailure::Provider)
    ));
    env.set("OMNYID_RUNBOOK_SHARED_INFERENCE_ENABLED", "true");
    let mut config = LlmConfig::default_hosted(owner.clone());
    config.provider = "anthropic".into();
    config.model = BASE_MODEL.into();
    config.monthly_budget_cents = 1;
    db.upsert_llm_config(&config).await.unwrap();
    assert!(matches!(
        reserve_shared_runbook(&db, &owner, BASE_MODEL, 10000).await,
        Err(ModelFailure::ModelMismatch)
    ));
    config.provider = "openai".into();
    db.upsert_llm_config(&config).await.unwrap();
    assert!(matches!(
        reserve_shared_runbook(&db, &owner, "unsupported", 10000).await,
        Err(ModelFailure::Provider)
    ));
    env.set("OMNYID_RUNBOOK_ALLOWLIST", "different-owner");
    assert!(matches!(
        reserve_shared_runbook(&db, &owner, BASE_MODEL, 10000).await,
        Err(ModelFailure::Provider)
    ));
    env.set("OMNYID_RUNBOOK_ALLOWLIST", &owner);
    // Existing hosted usage consumes the same account allowance even when it
    // predates or bypasses the platform-funded usage ledger.
    db.record_llm_usage(&owner, None, BASE_MODEL, 1, 1, 1)
        .await
        .unwrap();
    assert!(matches!(
        reserve_shared_runbook(&db, &owner, BASE_MODEL, 1).await,
        Err(ModelFailure::CostCeiling)
    ));
    config.monthly_budget_cents = 2;
    db.upsert_llm_config(&config).await.unwrap();
    let reservation = reserve_shared_runbook(&db, &owner, BASE_MODEL, 10000)
        .await
        .unwrap();
    // One cent is already charged and one cent is reserved, without provider I/O.
    // A second reservation cannot exceed the two-cent account allowance.
    assert!(matches!(
        reserve_shared_runbook(&db, &owner, BASE_MODEL, 1).await,
        Err(ModelFailure::CostCeiling)
    ));
    let response = ModelResponse {
        text: "{}".into(),
        model: BASE_MODEL.into(),
        input_tokens: 1,
        output_tokens: 1,
        cost_microunits: 3000,
    };
    let foreign = SharedRunbookReservation {
        api_key: String::new(),
        id: reservation.id.clone(),
        owner: "foreign".into(),
        ceiling: 10000,
    };
    assert!(foreign.finish(&db, &response).await.is_err());
    let too_costly = ModelResponse {
        text: String::new(),
        model: BASE_MODEL.into(),
        input_tokens: 1,
        output_tokens: 1,
        cost_microunits: 10001,
    };
    assert!(matches!(
        reservation.finish(&db, &too_costly).await,
        Err(ModelFailure::CostCeiling)
    ));
    reservation.finish(&db, &response).await.unwrap();
    assert!(reservation.finish(&db, &response).await.is_err());
    assert!(matches!(
        reserve(&db, &owner, BASE_MODEL, 1, i64::MAX, 0).await,
        Err(ModelFailure::CostCeiling)
    ));
    // All contenders use the same funded-feature advisory lock. Only one of two
    // 6000-microdollar attempts fits the 10000-microdollar monthly cap after 3000.
    let (first, second) = tokio::join!(
        reserve(&db, &owner, BASE_MODEL, 6000, 10000, i64::MAX),
        reserve(&db, &owner, BASE_MODEL, 6000, 10000, i64::MAX)
    );
    assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
    assert!(matches!(
        reserve(&db, &owner, BASE_MODEL, 1001, 10000, i64::MAX).await,
        Err(ModelFailure::CostCeiling)
    ));
    let pending: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM platform_funded_ai_usage WHERE user_id=$1 AND status='reserved' AND actual_cost_usd IS NULL")
        .bind(&owner).fetch_one(&db.pool).await.unwrap();
    assert_eq!(pending, 1); // Uncertain/no-result exposure has not been released.
    db.delete_user_account_and_data(&owner, &email, &[])
        .await
        .unwrap();
    let linked: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM platform_funded_ai_usage WHERE user_id=$1")
            .bind(&owner)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(linked, 0);
    let retained: (Option<String>, String, String) = sqlx::query_as(
        "SELECT user_id,request_fingerprint,status FROM platform_funded_ai_usage WHERE id=$1",
    )
    .bind(&reservation.id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(retained, (None, reservation.id.clone(), "completed".into()));
    // Only this test's anonymous accounting rows are removed from the disposable DB.
    for id in [Some(reservation.id), first.ok(), second.ok()]
        .into_iter()
        .flatten()
    {
        sqlx::query("DELETE FROM platform_funded_ai_usage WHERE id=$1 AND user_id IS NULL")
            .bind(id)
            .execute(&db.pool)
            .await
            .unwrap();
    }
    assert!(matches!(
        reserve(&db, &owner, BASE_MODEL, 1, i64::MAX, i64::MAX).await,
        Err(ModelFailure::Provider)
    ));
}
