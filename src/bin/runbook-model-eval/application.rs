//! One synthetic application request, no retry, and at most USD0.075 exposure.
use super::*;
use omnyid_homeserver::{
    db::AuthSessionRecord, runbook_budget::BudgetLimits, runbook_contract::*,
    runbook_read::ReadRequest, runbook_runtime::RunbookRuntime,
};
use ulid::Ulid;

pub async fn run(db: &Db, store: &RunbookStore<'_>, url: &str, sha: &str) {
    let runtime = RunbookRuntime::new(store);
    runtime
        .configure_model_budget(
            OWNER,
            0,
            BudgetLimits {
                account_daily_microunits: 75_000,
                runbook_daily_microunits: 75_000,
                instance_microunits: 75_000,
            },
        )
        .await
        .unwrap();
    let mut definition = starter_definitions()
        .into_iter()
        .find(|d| d.runbook_id == "file_requires_review")
        .unwrap();
    definition.enabled = true;
    definition.max_autonomy = MaxAutonomy::DraftOnly;
    definition.trigger.event_types = vec!["workflow_failed".into()];
    let step = &mut definition.steps[2];
    step.step_id = "model".into();
    step.kind = StepKind::Draft;
    step.output_kind = None;
    step.output_schema = Some(schema_for(StepKind::Draft).unwrap().into());
    step.token_limit = 2048;
    step.cost_limit_microunits = 75_000;
    step.max_retries = 0;
    definition.steps[3].input_refs = vec!["steps.model.output_refs".into()];
    definition.success_criteria = vec![Filter {
        path: "instance.outputs.model.status".into(),
        op: FilterOp::Eq,
        value: Some(json!("completed")),
    }];
    store.save(OWNER, None, definition.clone()).await.unwrap();
    let event = Ulid::new().to_string();
    db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":event,"type":"workflow_failed","to":[OWNER],
        "thread_id":"synthetic:application-draft","timestamp":Utc::now().to_rfc3339(),
        "content":{"confidence":0.9,"file_ref":"document:synthetic","parser_status":"ready","quarantine_status":"clear"}})).await.unwrap();
    let id = runtime.dispatch(OWNER, &event).await.unwrap().instance_ids[0].clone();
    runtime.start(OWNER, &id, 1).await.unwrap();
    runtime
        .execute_read(
            OWNER,
            &id,
            &ReadRequest {
                step_id: "read".into(),
                expected_revision: 2,
                snapshot_ref: None,
                decrypt_limit: 4,
                byte_limit: 262144,
            },
        )
        .await
        .unwrap();
    runtime
        .execute_transform(OWNER, &id, "assess", 3)
        .await
        .unwrap();
    let cohort=json!({"expires_at":Utc::now()+chrono::Duration::minutes(5),"members":[{
        "owner":OWNER,"runbook_id":definition.runbook_id,"version":definition.version,"step_id":"model",
        "definition_sha256":digest(&json!(definition))}]}).to_string();
    // Configure this isolated probe before starting its HTTP application.
    unsafe {
        for (name, value) in [
            ("OMNYID_RUNBOOK_MANAGEMENT_ENABLED", "true"),
            ("OMNYID_RUNBOOK_DRAFT_ENABLED", "true"),
            ("OMNYID_RUNBOOK_DRAFT_COHORT", cohort.as_str()),
            ("OMNYID_ENCRYPTION_KEY_HEX", hex::encode([31; 32]).as_str()),
            ("OMNYID_SIGNING_KEY_HEX", hex::encode([32; 32]).as_str()),
        ] {
            std::env::set_var(name, value);
        }
    }
    let token = Ulid::new().to_string();
    db.create_session(&AuthSessionRecord {
        token: token.clone(),
        user_id: OWNER.into(),
        created_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + chrono::Duration::hours(1)).to_rfc3339(),
    })
    .await
    .unwrap();
    let app = omnyid_homeserver::server::build_test_router(url).await;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!(
        "http://{}/runbooks/instances/{id}/steps/model/draft",
        listener.local_addr().unwrap()
    );
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(35))
        .build()
        .unwrap();
    assert!(
        !client
            .post(&endpoint)
            .json(&json!({"expected_revision":4}))
            .send()
            .await
            .unwrap()
            .status()
            .is_success()
    );
    assert_eq!(
        client
            .post(&endpoint)
            .bearer_auth(&token)
            .json(&json!({"expected_revision":3}))
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    let response = client
        .post(&endpoint)
        .bearer_auth(&token)
        .json(&json!({"expected_revision":4}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let result = response.json::<Value>().await.unwrap();
    println!("{}", json!({"event":"application_draft","result":result}));
    assert_eq!(result["receipt"]["applied"], true);
    assert_eq!(result["external_execution_authorized"], false);
    assert_eq!(
        result["receipt"]["evaluation"]["output"]["content"]["requires_approval"],
        true
    );
    assert!(result["receipt"]["trace"]["provenance_ref"].is_string());
    let replay = client
        .post(&endpoint)
        .bearer_auth(&token)
        .json(&json!({"expected_revision":4}))
        .send()
        .await
        .unwrap();
    assert_eq!(replay.status(), 200);
    assert_eq!(replay.json::<Value>().await.unwrap(), result);
    let accounting:Vec<(String,i64,i64)>=sqlx::query_as("SELECT status,CEIL(SUM(reserved_cost_usd)*1000000)::bigint,CEIL(SUM(COALESCE(actual_cost_usd,reserved_cost_usd))*1000000)::bigint FROM platform_funded_ai_usage GROUP BY status").fetch_all(&db.pool).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM platform_funded_ai_usage")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    assert_eq!(accounting.len(), 1);
    assert_eq!(accounting[0].0, "completed");
    assert!(accounting[0].2 <= 75_000);
    assert!(
        runtime
            .instance(OWNER, &id)
            .await
            .unwrap()
            .instance
            .completed_step_ids
            .contains(&"model".into())
    );
    server.abort();
    println!(
        "{}",
        json!({"event":"complete","source_sha":sha,"application_http":true,"persisted_receipt":true,
        "replay_suppressed":true,"case_count":1,"accounting":accounting,"maximum_exposure_microunits":75_000,
        "production_rollout":false,"tools_composed":false,"finished_at":Utc::now()})
    );
}
