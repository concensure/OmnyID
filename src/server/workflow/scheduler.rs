use super::super::{
    AppState, cron_next_fire_at, enrich_workflow_ir_for_run,
    enrich_workflow_run_with_private_calendar_context, trigger_replay_nonce, workflow_run_record,
    workflow_wait_resume_records_for_run,
};
use futures_util::future::join_all;
use serde_json::Value;
use std::sync::Arc;

pub(in crate::server) fn workflow_trigger_policy_check(
    reg: &crate::db::WorkflowTriggerRegistrationRecord,
    activation_kind: &str,
) -> Result<(), String> {
    // Gate 1: registration status (belt-and-suspenders; DB queries already filter this)
    if reg.registration_status != "registered" {
        return Err(format!(
            "policy check: registration {} has status {}; only 'registered' triggers may fire",
            reg.registration_id, reg.registration_status
        ));
    }
    // Gate 2: explicit block flag in descriptor
    if reg
        .descriptor_json
        .get("policy_blocked")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Err(format!(
            "policy check: registration {} is policy-blocked",
            reg.registration_id
        ));
    }
    // Gate 3: budget limit (placeholder — zero limit means block)
    if let Some(limit) = reg
        .descriptor_json
        .get("budget_limit_cents")
        .and_then(Value::as_f64)
    {
        if limit == 0.0 {
            return Err(format!(
                "policy check: registration {} has budget_limit_cents=0; trigger blocked",
                reg.registration_id
            ));
        }
    }
    // Gate 4: egress allowed flag
    if reg
        .descriptor_json
        .get("egress_allowed")
        .and_then(Value::as_bool)
        == Some(false)
    {
        return Err(format!(
            "policy check: registration {} has egress_allowed=false; trigger blocked",
            reg.registration_id
        ));
    }
    let _ = activation_kind;
    Ok(())
}

/// 3. Create and persist the `WorkflowRunRecord`.
/// 4. Write a `TriggerObservabilityRecord`.
/// 5. Persist wait-resume records.
///
/// Errors are returned as `String` and are non-fatal to the calling tick loop.
async fn fire_scheduled_workflow_run(
    state: &Arc<AppState>,
    reg: &crate::db::WorkflowTriggerRegistrationRecord,
    activation_id: &str,
    now_utc: chrono::DateTime<chrono::Utc>,
) -> Result<String, String> {
    let user_id = &reg.owner_user_id;
    let workflow_id = &reg.workflow_id;
    let deployment_id = &reg.deployment_id;
    let trigger_node_id = &reg.trigger_node_id;
    let now_str = now_utc.to_rfc3339();

    // 1. Load deployment snapshot.
    let deployment = state
        .db
        .get_workflow_deployment(user_id, workflow_id, deployment_id)
        .await
        .map_err(|e| format!("load deployment {deployment_id}: {e}"))?;
    let graph_snapshot = deployment["graph_snapshot"].clone();
    let ir_snapshot = deployment["ir_snapshot"].clone();
    let environment = graph_snapshot
        .get("environment")
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            ir_snapshot
                .get("environment")
                .and_then(serde_json::Value::as_str)
        });
    let trigger_kind = "cron";
    let enriched_ir =
        enrich_workflow_ir_for_run(&ir_snapshot, deployment_id, environment, trigger_kind, None);

    // 2. Policy check — must pass before replay nonce is claimed.
    workflow_trigger_policy_check(reg, trigger_kind).map_err(|e| format!("policy_check: {e}"))?;

    // 3. Replay nonce check — prevents double-firing if scheduler ticks overlap.
    let nonce = trigger_replay_nonce(deployment_id, trigger_node_id, activation_id);
    let claimed = state
        .db
        .check_and_claim_replay_nonce(user_id, &nonce)
        .await
        .map_err(|e| format!("replay nonce claim: {e}"))?;
    if !claimed {
        return Err(format!(
            "duplicate cron activation: activation_id={activation_id} already processed"
        ));
    }

    // 4. Create and persist run record.
    let mut run = workflow_run_record(
        workflow_id,
        deployment_id,
        user_id,
        trigger_kind,
        None,
        None,
        &graph_snapshot,
        &enriched_ir,
    );
    enrich_workflow_run_with_private_calendar_context(&state.db, &mut run).await;
    state
        .db
        .append_workflow_run(&run)
        .await
        .map_err(|e| format!("append run: {e}"))?;

    // 4. Trigger observability record.
    let cron_expr = reg
        .descriptor_json
        .get("cron_expression")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("")
        .to_string();
    let obs = crate::db::TriggerObservabilityRecord {
        observation_id: format!("wftobs_{}", ulid::Ulid::new().to_string().to_lowercase()),
        registration_id: reg.registration_id.clone(),
        workflow_id: workflow_id.clone(),
        deployment_id: deployment_id.clone(),
        owner_user_id: user_id.clone(),
        trigger_source: "cron".to_string(),
        trigger_time: now_str.clone(),
        payload_summary: serde_json::json!({}),
        schedule_metadata: serde_json::json!({
            "schedule_kind": "cron",
            "cron_expression": cron_expr,
            "timezone": reg.descriptor_json.get("timezone").and_then(serde_json::Value::as_str).unwrap_or("UTC"),
            "scheduled_for": now_str,
        }),
        delayed_resumption_reason: None,
        hybrid_decision_chain: serde_json::json!([]),
        run_initiation_trace: serde_json::json!({
            "run_id": run.run_id,
            "workflow_id": workflow_id,
            "deployment_id": deployment_id,
            "trigger_node_id": trigger_node_id,
            "activation_id": activation_id,
        }),
        replay_nonce: nonce,
        created_at: now_str.clone(),
    };
    if let Err(e) = state.db.write_trigger_observation(&obs).await {
        tracing::warn!(
            run_id = %run.run_id,
            workflow_id = %workflow_id,
            error = %e,
            "cron_scheduler: failed to write trigger observation; run continues"
        );
    }

    // 5. Wait-resume records.
    let wait_resume_records = workflow_wait_resume_records_for_run(
        workflow_id,
        deployment_id,
        user_id,
        &run,
        &enriched_ir,
    );
    for record in &wait_resume_records {
        if let Err(e) = state.db.append_workflow_wait_resume_record(record).await {
            tracing::warn!(
                run_id = %run.run_id,
                error = %e,
                "cron_scheduler: failed to write wait-resume record; run continues"
            );
        }
    }

    tracing::info!(
        run_id = %run.run_id,
        workflow_id = %workflow_id,
        deployment_id = %deployment_id,
        registration_id = %reg.registration_id,
        "cron_scheduler: fired scheduled workflow run"
    );
    Ok(run.run_id)
}

/// Executes one scheduler tick: queries all users for due schedule-family
/// trigger registrations, fires each one, and advances `next_fire_at`.
async fn cron_scheduler_tick(state: Arc<AppState>) {
    let now_utc = chrono::Utc::now();
    let now_str = now_utc.to_rfc3339();

    let user_ids = match state.db.list_user_ids().await {
        Ok(ids) => ids,
        Err(e) => {
            tracing::error!(error = %e, "cron_scheduler_tick: list_user_ids failed");
            return;
        }
    };

    // GAP-071: parallelize per-user trigger processing so N users × M triggers
    // don't serialize. Each user's triggers still fire in order within the task.
    let handles: Vec<_> = user_ids
        .into_iter()
        .map(|user_id| {
            let state = state.clone();
            let now_str = now_str.clone();
            tokio::spawn(async move {
                let due = match state
                    .db
                    .list_due_schedule_registrations_for_user(&user_id, &now_str)
                    .await
                {
                    Ok(records) => records,
                    Err(e) => {
                        tracing::warn!(
                            user_id = %user_id,
                            error = %e,
                            "cron_scheduler_tick: list_due_schedule_registrations failed; skipping user"
                        );
                        return;
                    }
                };

                for reg in due {
                    let activation_id = ulid::Ulid::new().to_string().to_lowercase();
                    let cron_expr = reg
                        .descriptor_json
                        .get("cron_expression")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("")
                        .to_string();

                    match fire_scheduled_workflow_run(&state, &reg, &activation_id, now_utc).await {
                        Ok(run_id) => {
                            let next_fire = cron_next_fire_at(&cron_expr, now_utc);
                            if next_fire.is_none() && !cron_expr.is_empty() {
                                tracing::error!(
                                    registration_id = %reg.registration_id,
                                    cron_expr = %cron_expr,
                                    "cron_scheduler_tick: invalid cron expression — skipping mark_trigger_fired \
                                     to avoid silencing the trigger; update the trigger with a valid expression"
                                );
                            } else {
                                let next_fire_str = next_fire.map(|dt| dt.to_rfc3339());
                                if let Err(e) = state
                                    .db
                                    .mark_trigger_fired(
                                        &user_id,
                                        &reg.registration_id,
                                        &now_str,
                                        next_fire_str.as_deref(),
                                    )
                                    .await
                                {
                                    tracing::warn!(
                                        run_id = %run_id,
                                        registration_id = %reg.registration_id,
                                        error = %e,
                                        "cron_scheduler_tick: mark_trigger_fired failed"
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!(
                                user_id = %user_id,
                                registration_id = %reg.registration_id,
                                error = %e,
                                "cron_scheduler_tick: fire_scheduled_workflow_run failed"
                            );
                        }
                    }
                }
            })
        })
        .collect();
    join_all(handles).await;
}

/// Long-running background task: runs the scheduler tick every 60 seconds.
/// The first tick fires 30 seconds after startup to avoid races during boot.
pub(in crate::server) async fn cron_scheduler_loop(state: Arc<AppState>) {
    tracing::info!("cron_scheduler: starting (60s interval)");
    tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
    loop {
        cron_scheduler_tick(state.clone()).await;
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn cron_scheduler_keeps_invalid_cron_triggers_from_being_silenced() {
        let source = include_str!("scheduler.rs");
        let start = source
            .find("async fn cron_scheduler_tick(")
            .expect("cron_scheduler_tick exists");
        let end = source[start..]
            .find("\npub(in crate::server) async fn cron_scheduler_loop(")
            .map(|offset| start + offset)
            .expect("cron_scheduler_loop follows cron_scheduler_tick");
        let function_source = &source[start..end];

        assert!(
            function_source.contains("let next_fire = cron_next_fire_at(&cron_expr, now_utc);")
        );
        assert!(function_source.contains("if next_fire.is_none() && !cron_expr.is_empty() {"));
        assert!(function_source.contains("skipping mark_trigger_fired"));
        assert!(function_source.contains("to avoid silencing the trigger"));
        assert!(!function_source.contains("mark_trigger_fired(\n                                        &user_id,\n                                        &reg.registration_id,\n                                        &now_str,\n                                        None,"));
    }

    #[test]
    fn cron_scheduler_parallelizes_per_user_processing() {
        let source = include_str!("scheduler.rs");
        let start = source
            .find("async fn cron_scheduler_tick(")
            .expect("cron_scheduler_tick exists");
        let end = source[start..]
            .find("\npub(in crate::server) async fn cron_scheduler_loop(")
            .map(|offset| start + offset)
            .expect("cron_scheduler_loop follows cron_scheduler_tick");
        let function_source = &source[start..end];

        assert!(function_source.contains("tokio::spawn(async move {"));
        assert!(function_source.contains("let handles: Vec<_> = user_ids"));
        assert!(function_source.contains("join_all(handles).await;"));
    }
}
