//! Operator-only synthetic evaluation; no application routes or action adapters.
use chrono::Utc;
use omnyid_homeserver::{
    agent_template::LlmConfig,
    db::{Db, UserRecord},
    inference::runbook::OwnerRunbookModelProvider,
    runbook_contract::StepKind,
    runbook_llm_step::*,
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
};
use serde_json::{Value, json};
use sqlx::postgres::PgConnectOptions;
use std::{str::FromStr, sync::Mutex};
fn digest(value: &Value) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(value.to_string().as_bytes()))
}
const OWNER: &str = "01ARZ3NDEKTSV4RRFFQ69G5FAY";
struct Observed<'a> {
    inner: OwnerRunbookModelProvider<'a>,
    output: Mutex<Option<String>>,
}
#[async_trait::async_trait]
impl ModelProvider for Observed<'_> {
    async fn infer(&self, request: &ModelRequest) -> Result<ModelResponse, ModelFailure> {
        let response = self.inner.infer(request).await?;
        *self.output.lock().unwrap() = Some(response.text.clone());
        Ok(response)
    }
}
#[tokio::main]
async fn main() {
    tokio::time::timeout(std::time::Duration::from_secs(1000), run())
        .await
        .unwrap();
}
async fn run() {
    assert_eq!(
        std::env::var("RUNBOOK_PROBE_ISOLATED").as_deref(),
        Ok("wed380-model-disposable")
    );
    let sha = std::env::var("RUNBOOK_PROBE_SOURCE_SHA").unwrap();
    assert!(sha.len() == 40 && sha.bytes().all(|c| c.is_ascii_hexdigit()));
    let url = std::env::var("RUNBOOK_PROBE_DATABASE_URL").unwrap();
    let options = PgConnectOptions::from_str(&url).unwrap();
    assert_eq!(options.get_host(), "omnyid-wed380-model-postgres");
    assert_eq!(options.get_database(), Some("wed380_model_probe"));
    assert_eq!(
        std::env::var("OMNYID_OPENROUTER_WEEKLY_CAP_USD").as_deref(),
        Ok("3")
    );
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let count:i64=sqlx::query_scalar("SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')").fetch_one(&pool).await.unwrap();
    assert_eq!(count, 0);
    pool.close().await;
    let db = Db::new(&url).await.unwrap();
    db.create_user(&UserRecord {
        id: OWNER.into(),
        email: "wed380-model@omnyid.test".into(),
        password_hash: None,
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Synthetic evaluation".into(),
        created_at: Utc::now().to_rfc3339(),
    })
    .await
    .unwrap();
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    store.registry(OWNER).await.unwrap();
    let mut config = LlmConfig::default_hosted(OWNER.into());
    config.provider = "openai".into();
    config.model = BASE_MODEL.into();
    config.monthly_budget_cents = 300;
    db.upsert_llm_config(&config).await.unwrap();
    let corpus: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/runbook-model-eval.json")).unwrap();
    let cases = corpus["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 12);
    let provider = Observed {
        inner: OwnerRunbookModelProvider::with_shared_funding(&db, OWNER, true).unwrap(),
        output: Mutex::new(None),
    };
    let mut rows = vec![];
    let mut exposure = 0u64;
    for (model, effort) in [
        (BASE_MODEL, Effort::Low),
        (BASE_MODEL, Effort::Medium),
        (ESCALATION_MODEL, Effort::Medium),
    ] {
        for case in cases {
            let kind = match case["kind"].as_str().unwrap() {
                "classify" => StepKind::Classify,
                "reason" => StepKind::Reason,
                "draft" => StepKind::Draft,
                _ => panic!("case kind"),
            };
            let mut step = starter_definitions().remove(0).steps.remove(0);
            step.kind = kind;
            step.output_schema = Some(schema_for(kind).unwrap().into());
            step.token_limit = 2048;
            step.cost_limit_microunits = 80000;
            step.max_retries = 0;
            let policy = ModelPolicy {
                effort,
                allow_escalation: false,
                minimum_confidence_bps: 8000,
                attempt_cost_ceiling: 80000,
                timeout_ms: 26000,
            };
            let refs: Vec<String> = serde_json::from_value(case["source_refs"].clone()).unwrap();
            let mut request = prepare(OWNER, &step, case["input"].clone(), refs, &policy).unwrap();
            if model == ESCALATION_MODEL {
                request.model = model.into();
                request.cache_key = digest(&json!([request.cache_key, ESCALATION_MODEL]));
            }
            exposure += request.max_cost_microunits;
            assert!(exposure <= 3_000_000);
            *provider.output.lock().unwrap() = None;
            let start = std::time::Instant::now();
            let result = evaluate(&provider, request, &policy, &step).await;
            assert_eq!(
                result.attempts.len(),
                1,
                "comparison must never retry/escalate"
            );
            let output = provider.output.lock().unwrap().clone();
            let row = json!({"case":case["id"],"model":model,"effort":effort,"latency_ms":start.elapsed().as_millis(),"evaluation":result,"synthetic_output":output,"review_expectation":case["review_expectation"]});
            println!("{}", json!({"event":"case","row":row}));
            rows.push(row);
            if matches!(
                result.failure,
                Some(
                    ModelFailure::Provider
                        | ModelFailure::Timeout
                        | ModelFailure::ModelMismatch
                        | ModelFailure::CostCeiling
                        | ModelFailure::TokenCeiling
                )
            ) {
                println!(
                    "{}",
                    json!({"event":"blocked","source_sha":sha,"case":case["id"],"failure":result.failure,"completed_cases":rows.len(),"maximum_exposure_microunits":exposure})
                );
                return;
            }
        }
    }
    let accounting:Vec<(String,i64,i64)>=sqlx::query_as("SELECT status,CEIL(SUM(reserved_cost_usd)*1000000)::bigint,CEIL(SUM(COALESCE(actual_cost_usd,reserved_cost_usd))*1000000)::bigint FROM platform_funded_ai_usage GROUP BY status").fetch_all(&db.pool).await.unwrap();
    println!(
        "{}",
        json!({"event":"complete","source_sha":sha,"corpus_hash":digest(&corpus),"case_count":rows.len(),"maximum_exposure_microunits":exposure,"accounting":accounting,"finished_at":Utc::now(),"production_rollout":false,"tools_composed":false})
    );
}
