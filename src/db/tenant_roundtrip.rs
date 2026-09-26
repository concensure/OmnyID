// @locs-version: 1.0
// @module-id: db.tenant-roundtrip
// @primary-capability: tenant-isolation-roundtrip-checks
// @stability: beta

use super::super::{
    Db, SavedWorkflowRecord, UserRecord, WorkflowDeploymentRecord, WorkflowRunRecord,
    WorkflowWaitResumeRecord, tenant_schema_name,
};
use crate::afp::Message;
use crate::agent_template::{
    AgentInstance, AgentTask, FocusItem, TaskPriority, TriggerType, generate_delegated_key,
};
use serde_json::json;
use ulid::Ulid;

#[tokio::test]
async fn local_postgres_tenant_private_workflow_round_trip() {
    if std::env::var("OMNYID_RUN_DB_SMOKE").ok().as_deref() != Some("1") {
        return;
    }

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://afp:afp@127.0.0.1:5432/afp".to_string());
    let Ok(db) = Db::new(&database_url).await else {
        return;
    };

    let suffix = Ulid::new().to_string().to_lowercase();
    let user = UserRecord {
        id: format!("user_smoke_{suffix}"),
        email: format!("smoke-{suffix}@omnyid.test"),
        password_hash: Some("smoke-hash".to_string()),
        auth_provider: "password".to_string(),
        google_sub: None,
        display_name: format!("Smoke {suffix}"),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db.create_user(&user).await.expect("create smoke user");

    let schema_name = tenant_schema_name(&user.id);
    let tenant_table_count: i64 = sqlx::query_scalar(
        r#"
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = $1
                AND table_name IN (
                  'agent_task_queue',
                  'agent_focus_items',
                  'agent_triggers',
                  'agent_delegations',
                  'agent_capability_registry',
                  'user_llm_config',
                  'llm_usage_log',
                  'saved_workflows',
                  'workflow_deployments',
                  'workflow_runs',
                  'workflow_wait_resume'
                )
              "#,
    )
    .bind(&schema_name)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant tables");
    assert_eq!(tenant_table_count, 11);

    let instance = AgentInstance::provision(&user.id, &format!("Smoke{suffix}"), "omnyid.test");
    let agent_instance_id = db
        .provision_agent(&instance)
        .await
        .expect("provision smoke agent");

    let task = AgentTask::new(
        user.id.clone(),
        agent_instance_id.clone(),
        "Plan the smoke test".to_string(),
        TaskPriority::Normal,
    );
    db.create_agent_task(&task).await.expect("create task");
    let tenant_task_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".agent_task_queue WHERE id = $1",
        schema_name
    ))
    .bind(&task.id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant task rows");
    assert_eq!(tenant_task_count, 1);
    let public_task_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.agent_task_queue WHERE id = $1")
            .bind(&task.id)
            .fetch_one(&db.pool)
            .await
            .expect("count public task rows");
    assert_eq!(public_task_count, 0);
    let listed_tasks = db
        .list_agent_tasks(&user.id, Some("pending"), 10)
        .await
        .expect("list pending tasks");
    assert!(listed_tasks.iter().any(|entry| entry["id"] == task.id));
    db.update_agent_task_status(
        &user.id,
        &task.id,
        "completed",
        Some(json!({"status": "done"})),
        None,
    )
    .await
    .expect("complete task");
    let task_detail = db
        .get_agent_task(&user.id, &task.id)
        .await
        .expect("get task detail");
    assert_eq!(task_detail["status"], "completed");
    assert_eq!(task_detail["result"]["status"], "done");

    let private_plan_trace = Message {
        protocol: "afp-v1".to_string(),
        id: format!("plan_trace_{suffix}"),
        thread_id: task.thread_id.clone(),
        parent_id: String::new(),
        from: instance.agent_id.clone(),
        to: vec![],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "agent".to_string(),
        kind: None,
        supertags: vec![],
        content: String::new(),
        signature: "smoke-signature".to_string(),
        encryption: String::new(),
        views: String::new(),
        references: String::new(),
        attachments: String::new(),
        store_in_relational: true,
        subtype: "plan".to_string(),
        metadata: json!({
            "origin": "smoke_task_trace",
            "task_id": task.id,
            "legacy_type": "agent_plan"
        })
        .to_string(),
    };
    db.store_private_message(
        &user.id,
        &private_plan_trace,
        json!({
            "task_id": task.id,
            "intent": task.intent,
            "status": "pending"
        }),
    )
    .await
    .expect("store private task plan trace");

    let private_result_trace = Message {
        protocol: "afp-v1".to_string(),
        id: format!("result_trace_{suffix}"),
        thread_id: task.thread_id.clone(),
        parent_id: private_plan_trace.id.clone(),
        from: instance.agent_id.clone(),
        to: vec![],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "agent".to_string(),
        kind: None,
        supertags: vec![],
        content: String::new(),
        signature: "smoke-signature".to_string(),
        encryption: String::new(),
        views: String::new(),
        references: String::new(),
        attachments: String::new(),
        store_in_relational: true,
        subtype: "result".to_string(),
        metadata: json!({
            "origin": "smoke_task_trace",
            "task_id": task.id,
            "legacy_type": "agent_result"
        })
        .to_string(),
    };
    db.store_private_message(
        &user.id,
        &private_result_trace,
        json!({
            "task_id": task.id,
            "status": "completed",
            "final_answer": "Smoke task completed successfully.",
            "result": {"status": "done"}
        }),
    )
    .await
    .expect("store private task result trace");
    let private_task_thread = db
        .get_private_thread(&user.id, &task.thread_id)
        .await
        .expect("get private task thread");
    assert!(
        private_task_thread
            .iter()
            .any(|message| message.id == private_plan_trace.id)
    );
    assert!(
        private_task_thread
            .iter()
            .any(|message| message.id == private_result_trace.id)
    );
    let tenant_private_trace_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".messages WHERE id = ANY($1)",
        schema_name
    ))
    .bind(vec![
        private_plan_trace.id.clone(),
        private_result_trace.id.clone(),
    ])
    .fetch_one(&db.pool)
    .await
    .expect("count tenant private task trace rows");
    assert_eq!(tenant_private_trace_count, 2);
    let public_private_trace_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.messages WHERE id = ANY($1)")
            .bind(vec![
                private_plan_trace.id.clone(),
                private_result_trace.id.clone(),
            ])
            .fetch_one(&db.pool)
            .await
            .expect("count public private task trace rows");
    assert_eq!(public_private_trace_count, 0);

    let focus = FocusItem::new(
        agent_instance_id.clone(),
        user.id.clone(),
        "Review smoke focus".to_string(),
    );
    db.create_focus_item(&focus)
        .await
        .expect("create focus item");
    let tenant_focus_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".agent_focus_items WHERE id = $1",
        schema_name
    ))
    .bind(&focus.id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant focus rows");
    assert_eq!(tenant_focus_count, 1);
    let public_focus_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.agent_focus_items WHERE id = $1")
            .bind(&focus.id)
            .fetch_one(&db.pool)
            .await
            .expect("count public focus rows");
    assert_eq!(public_focus_count, 0);
    let focus_items = db
        .list_focus_items(&user.id, &agent_instance_id)
        .await
        .expect("list focus items");
    assert!(focus_items.iter().any(|entry| entry["id"] == focus.id));
    db.update_focus_item_status(&user.id, &focus.id, "in_progress")
        .await
        .expect("update focus item");
    let focus_items = db
        .list_focus_items(&user.id, &agent_instance_id)
        .await
        .expect("list updated focus items");
    assert!(
        focus_items
            .iter()
            .any(|entry| entry["id"] == focus.id && entry["status"] == "in_progress")
    );

    let trigger = crate::agent_template::AgentTrigger::new(
        agent_instance_id.clone(),
        user.id.clone(),
        TriggerType::Scheduled,
        json!({"cron": "0 9 * * *"}),
    );
    db.create_trigger(&trigger).await.expect("create trigger");
    let tenant_trigger_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".agent_triggers WHERE id = $1",
        schema_name
    ))
    .bind(&trigger.id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant trigger rows");
    assert_eq!(tenant_trigger_count, 1);
    let public_trigger_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.agent_triggers WHERE id = $1")
            .bind(&trigger.id)
            .fetch_one(&db.pool)
            .await
            .expect("count public trigger rows");
    assert_eq!(public_trigger_count, 0);
    let triggers = db
        .list_triggers(&user.id, &agent_instance_id)
        .await
        .expect("list triggers");
    assert!(triggers.iter().any(|entry| entry["id"] == trigger.id));
    db.delete_trigger(&user.id, &trigger.id)
        .await
        .expect("delete trigger");
    let triggers = db
        .list_triggers(&user.id, &agent_instance_id)
        .await
        .expect("list triggers after delete");
    assert!(!triggers.iter().any(|entry| entry["id"] == trigger.id));

    let delegation = generate_delegated_key(
        &"0".repeat(64),
        "calendar.read",
        &task.id,
        600,
        &agent_instance_id,
        &user.id,
        vec![],
        vec![],
        None,
    );
    let delegation_id = delegation.id.clone();
    db.create_delegation(&delegation)
        .await
        .expect("create delegation");
    let tenant_delegation_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".agent_delegations WHERE id = $1",
        schema_name
    ))
    .bind(&delegation_id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant delegation rows");
    assert_eq!(tenant_delegation_count, 1);
    let public_delegation_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.agent_delegations WHERE id = $1")
            .bind(&delegation_id)
            .fetch_one(&db.pool)
            .await
            .expect("count public delegation rows");
    assert_eq!(public_delegation_count, 0);
    let active_delegations = db
        .get_active_delegations(&user.id, &agent_instance_id)
        .await
        .expect("list active delegations");
    assert!(
        active_delegations
            .iter()
            .any(|entry| entry["id"] == delegation_id)
    );
    let delegation_detail = db
        .get_delegation_by_id(&user.id, &delegation_id)
        .await
        .expect("get delegation detail")
        .expect("delegation exists");
    assert_eq!(delegation_detail["scope"], "calendar.read");
    db.revoke_delegation(&user.id, &delegation_id)
        .await
        .expect("revoke delegation");
    let active_delegations = db
        .get_active_delegations(&user.id, &agent_instance_id)
        .await
        .expect("list active delegations after revoke");
    assert!(
        !active_delegations
            .iter()
            .any(|entry| entry["id"] == delegation_id)
    );

    let capability_id = db
        .create_capability(
            &user.id,
            &agent_instance_id,
            "calendar.read",
            &json!({
                "description": "Read the calendar",
                "input_schema": {"type": "object"},
                "output_schema": {"type": "object"},
                "version": "1.0.0",
                "tags": ["calendar", "read"],
                "approval_mode": "suggest_only"
            }),
        )
        .await
        .expect("create capability");
    let tenant_capability_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".agent_capability_registry WHERE id = $1",
        schema_name
    ))
    .bind(&capability_id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant capability rows");
    assert_eq!(tenant_capability_count, 1);
    let public_capability_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.agent_capability_registry WHERE id = $1")
            .bind(&capability_id)
            .fetch_one(&db.pool)
            .await
            .expect("count public capability rows");
    assert_eq!(public_capability_count, 0);
    let capabilities = db
        .list_capabilities(&user.id, &agent_instance_id)
        .await
        .expect("list capabilities");
    assert!(
        capabilities
            .iter()
            .any(|entry| entry["id"] == capability_id)
    );
    let card_caps = db
        .get_capabilities_for_agent_card(&agent_instance_id)
        .await
        .expect("get card capabilities");
    assert!(card_caps.iter().any(|entry| entry.name == "calendar.read"));
    let deleted = db
        .delete_capability(&user.id, &capability_id)
        .await
        .expect("delete capability");
    assert!(deleted);

    let mut llm_cfg = crate::agent_template::LlmConfig::default_hosted(user.id.clone());
    llm_cfg.provider = "anthropic".to_string();
    llm_cfg.model = "claude-haiku-4-5-20251001".to_string();
    llm_cfg.monthly_budget_cents = 900;
    db.upsert_llm_config(&llm_cfg)
        .await
        .expect("upsert llm config");
    let tenant_llm_cfg_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".user_llm_config WHERE owner_user_id = $1",
        schema_name
    ))
    .bind(&user.id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant llm config rows");
    assert_eq!(tenant_llm_cfg_count, 1);
    let public_llm_cfg_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.user_llm_config WHERE owner_user_id = $1")
            .bind(&user.id)
            .fetch_one(&db.pool)
            .await
            .expect("count public llm config rows");
    assert_eq!(public_llm_cfg_count, 0);
    let llm_view = db
        .get_llm_config(&user.id)
        .await
        .expect("get llm config")
        .expect("llm config exists");
    assert_eq!(llm_view["monthly_budget_cents"], 900);
    db.record_llm_usage(&user.id, Some(&task.id), &llm_cfg.model, 120, 40, 33)
        .await
        .expect("record llm usage");
    let tenant_llm_usage_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".llm_usage_log WHERE owner_user_id = $1",
        schema_name
    ))
    .bind(&user.id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant llm usage rows");
    assert_eq!(tenant_llm_usage_count, 1);
    let public_llm_usage_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.llm_usage_log WHERE owner_user_id = $1")
            .bind(&user.id)
            .fetch_one(&db.pool)
            .await
            .expect("count public llm usage rows");
    assert_eq!(public_llm_usage_count, 0);
    let llm_view = db
        .get_llm_config(&user.id)
        .await
        .expect("get llm config after usage")
        .expect("llm config exists after usage");
    assert_eq!(llm_view["usage_cents_current_month"], 33);

    let saved_workflow = SavedWorkflowRecord {
        workflow_id: format!("wf_{suffix}"),
        owner_user_id: user.id.clone(),
        title: "Smoke workflow".to_string(),
        description: Some("Tenant-local saved workflow smoke test".to_string()),
        favorite: true,
        preset_kinds: vec!["research_assistant".to_string()],
        graph_json: json!({
            "version": "omnyid-workflow.v1",
            "workflow_id": format!("wf_{suffix}"),
            "title": "Smoke workflow",
            "status": "draft",
            "environment": "dev",
            "owner_user_id": user.id,
            "root_node_ids": ["node_trigger"],
            "nodes": [
                {
                    "id": "node_trigger",
                    "kind": "trigger",
                    "label": "Manual start",
                    "position": {"x": 0, "y": 0},
                    "inputs": [],
                    "outputs": [],
                    "policy": {
                        "mask": "private",
                        "approval_mode": "none",
                        "allowed_tools": [],
                        "allowed_capabilities": [],
                        "max_steps": 1,
                        "max_cost_cents": 0,
                        "outbound_allowlist": []
                    },
                    "metadata": {},
                    "hidden_runtime_nodes": [],
                    "config": {
                        "trigger_kind": "manual",
                        "event_filter": {}
                    }
                }
            ],
            "edges": [],
            "presets": [],
            "optimization_mode": "balanced",
            "metadata": {}
        }),
        latest_ir_json: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
        archived_at: None,
    };
    db.upsert_saved_workflow(&saved_workflow)
        .await
        .expect("save workflow");
    let listed_workflows = db
        .list_saved_workflows(&user.id, false, 10)
        .await
        .expect("list saved workflows");
    assert!(
        listed_workflows
            .iter()
            .any(|entry| entry["workflow_id"] == saved_workflow.workflow_id)
    );
    let workflow_detail = db
        .get_saved_workflow(&user.id, &saved_workflow.workflow_id)
        .await
        .expect("get saved workflow");
    assert_eq!(workflow_detail["title"], "Smoke workflow");
    let deployment = WorkflowDeploymentRecord {
        deployment_id: format!("wfdep_smoke_{suffix}"),
        workflow_id: saved_workflow.workflow_id.clone(),
        owner_user_id: user.id.clone(),
        environment: "dev".to_string(),
        status: "active".to_string(),
        ir_snapshot_json: json!({
            "version": "omnyid-workflow-ir.v1",
            "deployment_id": format!("wfdep_smoke_{suffix}")
        }),
        graph_snapshot_json: saved_workflow.graph_json.clone(),
        source_deployment_id: None,
        deployed_at: chrono::Utc::now().to_rfc3339(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db.append_workflow_deployment(&deployment)
        .await
        .expect("append workflow deployment");
    let listed_deployments = db
        .list_workflow_deployments(&user.id, &saved_workflow.workflow_id, 10)
        .await
        .expect("list workflow deployments");
    assert_eq!(listed_deployments.len(), 1);
    assert_eq!(
        listed_deployments[0]["deployment_id"].as_str(),
        Some(deployment.deployment_id.as_str())
    );
    let run = WorkflowRunRecord {
        run_id: format!("wfrun_smoke_{suffix}"),
        workflow_id: saved_workflow.workflow_id.clone(),
        deployment_id: deployment.deployment_id.clone(),
        owner_user_id: user.id.clone(),
        status: "completed".to_string(),
        trigger_kind: "manual".to_string(),
        replay_of_run_id: None,
        timeline_json: json!([
            {
                "node_id": "mf_start",
                "runtime_kind": "goal_intake",
                "status": "completed"
            }
        ]),
        result_json: json!({"summary": "Smoke run completed"}),
        started_at: chrono::Utc::now().to_rfc3339(),
        completed_at: Some(chrono::Utc::now().to_rfc3339()),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db.append_workflow_run(&run)
        .await
        .expect("append workflow run");
    let listed_runs = db
        .list_workflow_runs(&user.id, &saved_workflow.workflow_id, 10)
        .await
        .expect("list workflow runs");
    assert_eq!(listed_runs.len(), 1);
    assert_eq!(listed_runs[0]["run_id"].as_str(), Some(run.run_id.as_str()));
    let wait_resume = WorkflowWaitResumeRecord {
        wait_resume_id: format!("wfwait_smoke_{suffix}"),
        workflow_id: saved_workflow.workflow_id.clone(),
        deployment_id: deployment.deployment_id.clone(),
        run_id: run.run_id.clone(),
        owner_user_id: user.id.clone(),
        manifest_node_id: "mf_review".to_string(),
        source_graph_node_id: "review".to_string(),
        status: "pending".to_string(),
        resume_family: "approval".to_string(),
        resume_kind: "human_approval".to_string(),
        wait_reason: Some("A manager must approve this workflow.".to_string()),
        scheduled_for: None,
        descriptor_json: json!({
            "resume_family": "approval",
            "resume_kind": "human_approval"
        }),
        created_at: chrono::Utc::now().to_rfc3339(),
        resumed_at: None,
    };
    db.append_workflow_wait_resume_record(&wait_resume)
        .await
        .expect("append workflow wait resume");
    let listed_wait_resume = db
        .list_workflow_wait_resume_records(&user.id, &saved_workflow.workflow_id, &run.run_id, 10)
        .await
        .expect("list workflow wait resume");
    assert_eq!(listed_wait_resume.len(), 1);
    assert_eq!(
        listed_wait_resume[0]["wait_resume_id"].as_str(),
        Some(wait_resume.wait_resume_id.as_str())
    );
    let tenant_saved_workflow_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".saved_workflows WHERE workflow_id = $1",
        schema_name
    ))
    .bind(&saved_workflow.workflow_id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant saved workflow rows");
    assert_eq!(tenant_saved_workflow_count, 1);
    let tenant_workflow_deployment_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".workflow_deployments WHERE workflow_id = $1",
        schema_name
    ))
    .bind(&saved_workflow.workflow_id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant workflow deployment rows");
    assert_eq!(tenant_workflow_deployment_count, 1);
    let tenant_workflow_run_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".workflow_runs WHERE workflow_id = $1",
        schema_name
    ))
    .bind(&saved_workflow.workflow_id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant workflow run rows");
    assert_eq!(tenant_workflow_run_count, 1);
    let public_saved_workflow_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.saved_workflows WHERE workflow_id = $1")
            .bind(&saved_workflow.workflow_id)
            .fetch_one(&db.pool)
            .await
            .unwrap_or(0);
    assert_eq!(public_saved_workflow_count, 0);
    let public_workflow_deployment_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM public.workflow_deployments WHERE workflow_id = $1",
    )
    .bind(&saved_workflow.workflow_id)
    .fetch_one(&db.pool)
    .await
    .unwrap_or(0);
    assert_eq!(public_workflow_deployment_count, 0);
    let public_workflow_run_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.workflow_runs WHERE workflow_id = $1")
            .bind(&saved_workflow.workflow_id)
            .fetch_one(&db.pool)
            .await
            .unwrap_or(0);
    assert_eq!(public_workflow_run_count, 0);

    let private_message = Message {
        protocol: "afp-v1".to_string(),
        id: format!("msg_{suffix}"),
        thread_id: format!("private-thread-{suffix}"),
        parent_id: String::new(),
        from: instance.agent_id.clone(),
        to: vec!["agent:peer@omnyid.test".to_string()],
        timestamp: chrono::Utc::now().to_rfc3339(),
        r#type: "agent".to_string(),
        kind: None,
        supertags: vec![],
        content: String::new(),
        signature: "smoke-signature".to_string(),
        encryption: String::new(),
        views: String::new(),
        references: String::new(),
        attachments: json!([{
            "id": format!("att_{suffix}"),
            "name": "brief.txt",
            "mime_type": "text/plain",
            "size_bytes": 12,
            "storage": {"kind": "inline"},
            "encryption": {}
        }])
        .to_string(),
        store_in_relational: false,
        subtype: "message".to_string(),
        metadata: json!({"scope": "private_smoke"}).to_string(),
    };
    db.store_private_message(&user.id, &private_message, json!({"body": "private hello"}))
        .await
        .expect("store private message");
    let private_thread = db
        .get_private_thread(&user.id, &private_message.thread_id)
        .await
        .expect("get private thread");
    assert_eq!(private_thread.len(), 1);
    assert_eq!(private_thread[0].id, private_message.id);
    let tenant_private_message_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".messages WHERE id = $1",
        schema_name
    ))
    .bind(&private_message.id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant private message rows");
    assert_eq!(tenant_private_message_count, 1);
    let public_private_message_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.messages WHERE id = $1")
            .bind(&private_message.id)
            .fetch_one(&db.pool)
            .await
            .expect("count public private message rows");
    assert_eq!(public_private_message_count, 0);
    let attachment_id = format!("att_{suffix}");
    let tenant_private_attachment_count: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM \"{}\".attachments WHERE id = $1",
        schema_name
    ))
    .bind(&attachment_id)
    .fetch_one(&db.pool)
    .await
    .expect("count tenant private attachment rows");
    assert_eq!(tenant_private_attachment_count, 1);
    let public_private_attachment_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM public.attachments WHERE id = $1")
            .bind(&attachment_id)
            .fetch_one(&db.pool)
            .await
            .expect("count public private attachment rows");
    assert_eq!(public_private_attachment_count, 0);
}
