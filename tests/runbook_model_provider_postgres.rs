//! Disposable database and dummy credentials; no external inference calls.
use chrono::Utc;
use omnyid_homeserver::{
    agent_template::{LlmBackend, LlmConfig},
    db::{Db, UserRecord},
    inference::runbook::OwnerRunbookModelProvider,
    runbook_contract::StepKind,
    runbook_llm_step::*,
    runbook_starter_pack::starter_definitions,
};
use serde_json::json;

#[tokio::test]
async fn canonical_owner_resolver_denies_missing_unsupported_wrong_model_and_deleted_accounts() {
    let url = std::env::var("TEST_DATABASE_URL").expect("disposable TEST_DATABASE_URL required");
    assert!(url.contains("@127.0.0.1:") && url.ends_with("/omnyid_test"));
    let db = Db::new(&url).await.unwrap();
    let id = ulid::Ulid::new().to_string();
    let owner = UserRecord {
        id: id.clone(),
        email: format!("model-provider-{id}@omnyid.test"),
        password_hash: Some("test".into()),
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Test".into(),
        created_at: Utc::now().to_rfc3339(),
    };
    db.create_user(&owner).await.unwrap();
    let mut step = starter_definitions().remove(0).steps[0].clone();
    step.kind = StepKind::Classify;
    step.output_schema = Some("runbook_classification_v1".into());
    step.token_limit = 128;
    step.cost_limit_microunits = 1;
    let policy = ModelPolicy {
        effort: Effort::Low,
        allow_escalation: false,
        minimum_confidence_bps: 8000,
        attempt_cost_ceiling: 1,
        timeout_ms: 1000,
    };
    let request = prepare(
        &id,
        &step,
        json!({}),
        vec!["private_message:source".into()],
        &policy,
    )
    .unwrap();
    // One microdollar is also below the transport preflight ceiling: even a
    // resolver regression cannot issue a paid request from this fixture.
    let provider = OwnerRunbookModelProvider::new(&db, &id, false).unwrap();
    assert!(matches!(
        provider.infer(&request).await,
        Err(ModelFailure::Provider)
    ));
    let mut config = LlmConfig::default_hosted(id.clone());
    config.backend = LlmBackend::Byok;
    config.provider = "openai".into();
    config.model = "wrong-model".into();
    config.encrypted_api_key = Some("dummy-key".into());
    db.upsert_llm_config(&config).await.unwrap();
    assert!(matches!(
        provider.infer(&request).await,
        Err(ModelFailure::ModelMismatch)
    ));
    config.provider = "mistral".into();
    config.model = BASE_MODEL.into();
    db.upsert_llm_config(&config).await.unwrap();
    assert!(matches!(
        provider.infer(&request).await,
        Err(ModelFailure::Provider)
    ));
    config.provider = "openai".into();
    db.upsert_llm_config(&config).await.unwrap();
    assert!(matches!(
        provider.infer(&request).await,
        Err(ModelFailure::CostCeiling)
    ));
    let foreign = prepare(
        "other",
        &step,
        json!({}),
        vec!["private_message:source".into()],
        &policy,
    )
    .unwrap();
    assert!(matches!(
        provider.infer(&foreign).await,
        Err(ModelFailure::InvalidSchema)
    ));
    db.delete_user_account_and_data(&id, &owner.email, &[])
        .await
        .unwrap();
    assert!(matches!(
        provider.infer(&request).await,
        Err(ModelFailure::Provider)
    ));
}
