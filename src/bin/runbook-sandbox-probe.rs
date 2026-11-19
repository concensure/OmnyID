//! Isolated operator cohort against a real loopback marker provider.
use chrono::Utc;
use omnyid_homeserver::{
    db::{Db, McpToolConnectionUpsert, UserConnectedCapabilityRecord, UserRecord},
    mcp_client::bounded::destination::PinnedMcpTarget,
    runbook_contract::*,
    runbook_runtime::RunbookRuntime,
    runbook_starter_pack::starter_definitions,
    runbook_store::RunbookStore,
    runbook_tool_runtime::{ToolOutcome, ToolRequest},
    secret_manager::EnvSecretBackend,
    tool_dispatch::runbook_provider::McpRunbookProvider,
};
use serde_json::{Value, json};
use sqlx::postgres::PgConnectOptions;
use std::{collections::HashMap, str::FromStr};
use ulid::Ulid;
const ENDPOINT: &str = "http://127.0.0.1:18380/mcp";
fn descriptor() -> Value {
    let input = json!({"type":"object","properties":{"marker":{"type":"string","maxLength":80},"mode":{"type":"string","maxLength":16,"enum":["ok","drop","delay","cancel","persistfail"]}},"required":["marker","mode"],"additionalProperties":false});
    let output = json!({"type":"object","properties":{"marker":{"type":"string","maxLength":80},"created":{"type":"boolean"}},"required":["marker","created"],"additionalProperties":false});
    json!({"capabilities":["create_marker"],"runbook_contracts":{"create_marker":{"version":1,"input_schema":input,"output_schema":output}}})
}
async fn user(db: &Db) -> String {
    let owner = Ulid::new().to_string();
    db.create_user(&UserRecord {
        id: owner.clone(),
        email: format!("sandbox-{owner}@omnyid.test"),
        password_hash: None,
        auth_provider: "password".into(),
        google_sub: None,
        display_name: "Isolated sandbox".into(),
        created_at: Utc::now().to_rfc3339(),
    })
    .await
    .unwrap();
    owner
}
async fn setup(
    db: &Db,
    store: &RunbookStore<'_>,
    owner: &str,
    key: &[u8; 32],
    token: &str,
) -> String {
    db.upsert_mcp_tool_connection(&McpToolConnectionUpsert {
        user_id: owner.into(),
        tool_slug: "sandbox".into(),
        tool_name: "Synthetic marker sandbox".into(),
        mcp_server_url: ENDPOINT.into(),
        api_key: None,
        connection_provider: "mcp".into(),
        external_user_id: None,
        composio_connected_account_id: None,
        tool_descriptor: Some(descriptor()),
    })
    .await
    .unwrap();
    sqlx::query(
        "UPDATE mcp_tool_connections SET api_key_enc=$2 WHERE user_id=$1 AND tool_slug='sandbox'",
    )
    .bind(owner)
    .bind(omnyid_homeserver::crypto::encrypt_secret(token, key))
    .execute(&db.pool)
    .await
    .unwrap();
    db.upsert_user_connected_capability(&UserConnectedCapabilityRecord{id:String::new(),user_id:owner.into(),provider:"tool_connection".into(),account_ref:"sandbox".into(),capability_family:"tool_connection".into(),capability_id:"sandbox.create_marker".into(),transport:"mcp".into(),granted_scopes:vec!["create_marker".into()],approval_mode:"human_approval_required".into(),secret_ref:Some(format!("mcp_tool_connections:{owner}:sandbox")),health_state:"healthy".into(),last_checked_at:None,connected_at:Utc::now().to_rfc3339(),revoked_at:None,metadata_json:json!({"origin":"tool_connection","tool_slug":"sandbox","mcp_server_url":ENDPOINT,"connection_provider":"mcp","tool_descriptor":descriptor()})}).await.unwrap();
    let mut d = starter_definitions().remove(0);
    d.runbook_id = "sandbox_marker".into();
    d.enabled = true;
    d.trigger.event_types = vec!["workflow_failed".into()];
    d.trigger.filters.clear();
    d.tools_allowlist = vec!["sandbox.create_marker".into()];
    d.max_autonomy = MaxAutonomy::ApprovalRequired;
    let mut tool = d.steps[0].clone();
    tool.step_id = "tool".into();
    tool.kind = StepKind::Tool;
    tool.tool = Some("sandbox.create_marker".into());
    tool.operation = None;
    tool.required_fields.clear();
    tool.input_refs.clear();
    let mut complete = d.steps.last().unwrap().clone();
    complete.input_refs.clear();
    complete.required_fields.clear();
    d.steps = vec![tool, complete];
    d.success_criteria = vec![Filter {
        path: "instance.outputs.tool.status".into(),
        op: FilterOp::Eq,
        value: Some(json!("completed")),
    }];
    store.save(owner, None, d).await.unwrap();
    let event = Ulid::new().to_string();
    db.insert_daemon_afp_message(&json!({"protocol":"afp-v1","id":event,"type":"workflow_failed","to":[owner],"thread_id":"sandbox:test","timestamp":Utc::now().to_rfc3339(),"content":{"confidence":0.9,"metadata":{"status":"failed"}}})).await.unwrap();
    let runtime = RunbookRuntime::new(store);
    let id = runtime.dispatch(owner, &event).await.unwrap().instance_ids[0].clone();
    runtime.start(owner, &id, 1).await.unwrap();
    id
}
fn effects(marker: &str) -> usize {
    std::fs::read_to_string("/sandbox-results/effects.jsonl")
        .unwrap_or_default()
        .lines()
        .filter_map(|s| serde_json::from_str::<Value>(s).ok())
        .filter(|v| v["marker"] == marker)
        .count()
}
#[tokio::main]
async fn main() {
    tokio::time::timeout(std::time::Duration::from_secs(700), run())
        .await
        .unwrap();
}
async fn run() {
    assert_eq!(
        std::env::var("RUNBOOK_PROBE_ISOLATED").as_deref(),
        Ok("wed380-sandbox-disposable")
    );
    assert!(!std::env::vars().any(|(k, _)| k.contains("API_KEY")));
    let sha = std::env::var("RUNBOOK_PROBE_SOURCE_SHA").unwrap();
    assert!(sha.len() == 40 && sha.bytes().all(|c| c.is_ascii_hexdigit()));
    let url = std::env::var("RUNBOOK_PROBE_DATABASE_URL").unwrap();
    let options = PgConnectOptions::from_str(&url).unwrap();
    assert_eq!(options.get_host(), "omnyid-wed380-sandbox-postgres");
    assert_eq!(options.get_database(), Some("wed380_sandbox_probe"));
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let tables:i64=sqlx::query_scalar("SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')").fetch_one(&pool).await.unwrap();
    assert_eq!(tables, 0);
    pool.close().await;
    let db = Db::new(&url).await.unwrap();
    let store = RunbookStore::new(&db, [31; 32], [32; 32]);
    let runtime = RunbookRuntime::new(&store);
    let root = std::env::var("SANDBOX_ROOT_KEY").unwrap();
    let raw = hex::decode(&root).unwrap();
    assert_eq!(raw.len(), 32);
    let key: [u8; 32] = omnyid_homeserver::post_quantum::hkdf_sha256(
        &raw,
        b"omnyid-tool-connection-kek",
        b"v1",
        32,
    )
    .try_into()
    .unwrap();
    let token = std::env::var("SANDBOX_BEARER").unwrap();
    let backend = EnvSecretBackend::with_overrides(HashMap::from([(
        "OMNYID_ENCRYPTION_KEY_HEX".into(),
        root,
    )]));
    let provider = McpRunbookProvider::from_secret_backend(
        &db,
        &backend,
        vec![PinnedMcpTarget::loopback_sandbox(ENDPOINT).unwrap()],
    )
    .await
    .unwrap();
    let foreign = user(&db).await;
    store.registry(&foreign).await.unwrap();
    let mut expiry = None;
    for scenario in [
        "expired",
        "success",
        "missing_approval",
        "changed_arguments",
        "changed_grant",
        "revoked",
        "foreign_owner",
        "cancel",
        "drop",
        "delay",
        "persistfail",
    ] {
        let owner = user(&db).await;
        let id = setup(&db, &store, &owner, &key, &token).await;
        let mode = if matches!(scenario, "drop" | "delay" | "cancel" | "persistfail") {
            scenario
        } else {
            "ok"
        };
        let request = ToolRequest {
            tool_slug: "sandbox".into(),
            capability: "create_marker".into(),
            arguments: json!({"marker":scenario,"mode":mode}),
        };
        let proposal = runtime
            .propose_tool(&owner, &id, "tool", 2, &request)
            .await
            .unwrap();
        let pid = &proposal.proposal_ref;
        if scenario == "missing_approval" {
            assert!(
                runtime
                    .execute_tool(&owner, &id, pid, &provider)
                    .await
                    .is_err()
            );
            assert_eq!(effects(scenario), 0);
            println!("{}", json!({"case":scenario,"effects":0,"denied":true}));
            continue;
        }
        runtime
            .decide_tool(&owner, &id, pid, 3, true)
            .await
            .unwrap();
        if scenario == "expired" {
            expiry = Some((owner, id, proposal));
            continue;
        }
        if scenario == "changed_arguments" {
            let mut changed = request.clone();
            changed.arguments["marker"] = json!("unauthorised_change");
            assert_eq!(
                runtime
                    .propose_tool(&owner, &id, "tool", 2, &request)
                    .await
                    .unwrap(),
                proposal
            );
            assert_eq!(
                runtime
                    .propose_tool(&owner, &id, "tool", 2, &changed)
                    .await
                    .unwrap_err(),
                "tool_proposal_conflict"
            );
            assert_eq!(effects(scenario), 0);
            println!("{}", json!({"case":scenario,"effects":0,"denied":true}));
            continue;
        }
        if matches!(scenario, "changed_grant" | "revoked") {
            let query = if scenario == "revoked" {
                "UPDATE user_connected_capabilities SET revoked_at=now() WHERE user_id=$1"
            } else {
                "UPDATE user_connected_capabilities SET approval_mode='changed' WHERE user_id=$1"
            };
            sqlx::query(query)
                .bind(&owner)
                .execute(&db.pool)
                .await
                .unwrap();
            assert!(
                runtime
                    .execute_tool(&owner, &id, pid, &provider)
                    .await
                    .is_err()
            );
            assert_eq!(effects(scenario), 0);
            println!("{}", json!({"case":scenario,"effects":0,"denied":true}));
            continue;
        }
        if scenario == "foreign_owner" {
            assert!(
                runtime
                    .execute_tool(&foreign, &id, pid, &provider)
                    .await
                    .is_err()
            );
            assert_eq!(effects(scenario), 0);
            println!("{}", json!({"case":scenario,"effects":0,"denied":true}));
            continue;
        }
        if scenario == "persistfail" {
            let table = format!("\"user_{}\".messages", owner.to_lowercase());
            sqlx::query(&format!("ALTER TABLE {table} ADD CONSTRAINT fail_tool_result CHECK (type<>'runbook_tool_result')")).execute(&db.pool).await.unwrap();
            assert_eq!(
                runtime
                    .execute_tool(&owner, &id, pid, &provider)
                    .await
                    .unwrap_err(),
                "storage_unavailable"
            );
            sqlx::query(&format!(
                "ALTER TABLE {table} DROP CONSTRAINT fail_tool_result"
            ))
            .execute(&db.pool)
            .await
            .unwrap();
            assert_eq!(
                runtime
                    .execute_tool(&owner, &id, pid, &provider)
                    .await
                    .unwrap_err(),
                "tool_attempt_reserved"
            );
            let receipt = runtime
                .abandon_tool_attempt(&owner, &id, pid, 4)
                .await
                .unwrap();
            assert_eq!(receipt.outcome, ToolOutcome::Unknown);
            assert!(!receipt.applied);
            assert_eq!(
                runtime
                    .execute_tool(&owner, &id, pid, &provider)
                    .await
                    .unwrap(),
                receipt
            );
            assert_eq!(effects(scenario), 1);
            println!(
                "{}",
                json!({"case":scenario,"effects":1,"receipt":receipt,"no_resend":true})
            );
            continue;
        }
        let receipt = if scenario == "success" {
            let (a, b) = tokio::join!(
                runtime.execute_tool(&owner, &id, pid, &provider),
                runtime.execute_tool(&owner, &id, pid, &provider)
            );
            match (a, b) {
                (Ok(a), Ok(b)) => {
                    assert_eq!(a, b);
                    a
                }
                (Ok(a), Err(e)) | (Err(e), Ok(a)) => {
                    assert_eq!(e, "tool_attempt_reserved");
                    a
                }
                _ => panic!("no successful worker"),
            }
        } else if scenario == "cancel" {
            let (r, ()) = tokio::join!(runtime.execute_tool(&owner, &id, pid, &provider), async {
                for _ in 0..250 {
                    if effects(scenario) == 1 {
                        break;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                }
                assert_eq!(effects(scenario), 1);
                runtime.cancel(&owner, &id, 4).await.unwrap();
            });
            r.unwrap()
        } else {
            runtime
                .execute_tool(&owner, &id, pid, &provider)
                .await
                .unwrap()
        };
        if matches!(scenario, "drop" | "delay") {
            assert_eq!(receipt.outcome, ToolOutcome::Unknown);
            assert!(!receipt.applied);
        } else {
            assert_eq!(receipt.outcome, ToolOutcome::Completed);
            assert_eq!(receipt.applied, scenario == "success");
            assert_eq!(
                receipt.output,
                Some(json!({"marker":scenario,"created":true}))
            );
        }
        assert!(receipt.trace.provenance_ref.is_some());
        assert_eq!(
            runtime
                .execute_tool(&owner, &id, pid, &provider)
                .await
                .unwrap(),
            receipt
        );
        assert_eq!(effects(scenario), 1);
        if scenario == "cancel" {
            assert_eq!(
                runtime.instance(&owner, &id).await.unwrap().instance.status,
                InstanceState::Cancelled
            );
        }
        println!(
            "{}",
            json!({"case":scenario,"effects":1,"receipt":receipt,"no_resend":true})
        );
    }
    let (owner, id, proposal) = expiry.unwrap();
    println!(
        "{}",
        json!({"event":"waiting_for_real_expiry","expires_at":proposal.expires_at})
    );
    while Utc::now() <= proposal.expires_at {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }
    assert_eq!(
        runtime
            .execute_tool(&owner, &id, &proposal.proposal_ref, &provider)
            .await
            .unwrap_err(),
        "tool_proposal_expired"
    );
    assert_eq!(effects("expired"), 0);
    println!("{}", json!({"case":"expired","effects":0,"denied":true}));
    println!(
        "{}",
        json!({"event":"complete","source_sha":sha,"finished_at":Utc::now(),"cases":11,"expected_effects":5,"production_rollout":false,"external_provider":false})
    );
}
